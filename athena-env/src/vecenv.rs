//! The batch environment behind ATHENA's Python API (ATHENA.md §4.5 item 2; `athena-env/API.md` documents every
//! layout below).
//!
//! - **The action encoding** ([`decode_action`], [`encode_action`]): one integer per decision, relative to the acting
//!   seat. Asks are (opponent 0-2, card 0-53), declares are (set 0-8, a teammate for each of the six cards), then the
//!   decline and the two passes.
//! - **The legal masks** ([`LEGAL_LEN`] bytes a game) by the reducer's own verdict: [`Game::legal_asks`] for the asks
//!   (gated by G0a's legal-move digests) and [`Game::validate`] for every declare set, the decline and both passes.
//!   `legalActionsSummary`'s over-reported `claim` is not copied.
//! - **The observation** (P0's provisional layout, with P1's additions): the acting seat's hand, the public counts,
//!   phase, turn, window, score, set outcomes and the game's reveal regime ([`OBS_LEN`] bytes), the public events since
//!   that seat's last observation as fixed-width rows ([`EVENT_LEN`] bytes each), optionally the rules-derived facts
//!   of that seat's view ([`FACTS_LEN`] bytes, `crate::facts`), and, in a separate buffer for the critic only, the
//!   true deal.
//! - **[`VecEnv`]**: a batch of games stepped over `std::thread::scope` workers, with deterministic auto-reset.
//!
//! **The regimes** (ATHENA.md §8.2 G1b). Each game is played under one of two reveal regimes, fixed at its deal:
//! home ([`REGIME_HOME`], the engine's rule: a declare publishes every true holder) or bridge ([`REGIME_BRIDGE`],
//! `replay-format.md` §12.4: a wrong declare publishes only the holders a hit had located). The rules are the same;
//! only what the observation shows of a wrong declare differs: its event row's holders, its set's "how" byte, the
//! facts, and the view digest of [`VecEnv::digests`].
//!
//! **The start seat** (ATHENA.md §8.2). The bridge's host does not publish it, so in both regimes the observation's
//! start seat is unknown until the first event, then that event's actor: the `game_started` row is withheld until the
//! first event is logged, and then delivered with that event's actor, just before it.
//!
//! **The information rules.** Every actor byte is a function of `seatView(S_t, acting)`: the seat's own hand and the
//! public state (counts, phase, turn, window, score, the set block with its true holders, the event log). Seats are
//! written relative to the observer, `(seat - observer) mod 6`, so rel 0 is the observer, rels 2 and 4 its
//! teammates, and rels 1, 3 and 5 its opponents. The one legal bit the reducer computes from a hidden hand is the
//! decline (`MUST_DECLARE` asks whether the turn-holder could ask), and it is a function of the view in every
//! reachable state: the window opens on the turn-holder, so an option seat other than the turn-holder exists only
//! after the turn-holder's legal decline, and declines move no cards. The tests assert this at every step.
//!
//! Pure computation, like the rest of the crate: no unsafe code, no dependency, no file access, and no allocation per
//! step once each slot's seed string and constraint lists have grown to their longest.

use crate::cards::{is_seat, team, NCARDS, NONE, NSEATS, NSETS};
use crate::codec::{
    encode_action as codec_action, encode_event, encode_events, encode_legal, encode_state, encode_view_with_sets,
    FORMAT, STATE_LEN, STEP_CAP,
};
use crate::digest::{digest, ByteDigest};
#[cfg(feature = "mutants")]
use crate::facts::FactsMutant;
use crate::facts::{rail, resolved_mask, set_status, Facts, GameFacts, Reveal, WindowClass};
pub use crate::facts::{REGIME_BRIDGE, REGIME_HOME};
use crate::rng::{Mulberry32, Xmur3};
#[cfg(feature = "mutants")]
use crate::rules::Mutant;
use crate::rules::{Action, AskList, Event, Events, Game, FINISHED, TIE};
use std::fmt::Write as _;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Barrier;

/* ---------------------------------------------------------------------------------------------- actions --- */

/// Ask codes: `opponent * 54 + card`, opponent k = 0, 1, 2 being seat `(me + 2k + 1) mod 6`.
pub const N_ASK: usize = 3 * NCARDS;
/// The decline's code.
pub const A_DECLINE: i32 = N_ASK as i32;
/// The first pass code: `A_PASS` hands the turn to teammate rel 2, `A_PASS + 1` to teammate rel 4.
pub const A_PASS: i32 = A_DECLINE + 1;
/// The first declare code: `A_DECLARE + set * 729 + sum_j d_j * 3^j`, where d_j in {0, 1, 2} names the teammate
/// (rel 2 d_j) stated for the set's j-th card in set card order.
pub const A_DECLARE: i32 = A_PASS + 2;
/// Assignments of a set's six cards to the declarer's three-seat team: 3^6.
pub const N_ASSIGN: i32 = 729;
/// The number of action codes: 162 asks, the decline, 2 passes and 9 x 729 declares.
pub const N_ACTIONS: i32 = A_DECLARE + NSETS as i32 * N_ASSIGN;

/// Seat `rel` places after `observer`, i.e. the absolute seat of a relative one.
#[inline(always)]
pub const fn abs_seat(rel: u8, observer: u8) -> u8 {
    (observer + rel) % 6
}

/// A seat relative to the observer, `(seat - observer) mod 6`; NONE (and any non-seat byte) stays NONE.
#[inline(always)]
pub const fn rel_seat(seat: u8, observer: u8) -> u8 {
    if is_seat(seat) {
        (seat + 6 - observer) % 6
    } else {
        NONE
    }
}

/// The action a code means for `seat`, or None for a code outside 0..N_ACTIONS (or a seat that is not a seat).
pub fn decode_action(seat: u8, code: i32) -> Option<Action> {
    if !is_seat(seat) || !(0..N_ACTIONS).contains(&code) {
        return None;
    }
    if code < A_DECLINE {
        let k = (code / NCARDS as i32) as u8;
        let card = (code % NCARDS as i32) as u8;
        return Some(Action::Ask {
            seat,
            target: abs_seat(2 * k + 1, seat),
            card,
        });
    }
    if code == A_DECLINE {
        return Some(Action::Decline { seat });
    }
    if code < A_DECLARE {
        let k = (code - A_PASS + 1) as u8;
        return Some(Action::Pass {
            seat,
            to: abs_seat(2 * k, seat),
        });
    }
    let x = code - A_DECLARE;
    let set = (x / N_ASSIGN) as u8;
    let mut a = x % N_ASSIGN;
    let mut assign = [0u8; 6];
    for s in assign.iter_mut() {
        *s = abs_seat(2 * (a % 3) as u8, seat);
        a /= 3;
    }
    Some(Action::Claim { seat, set, assign })
}

/// The code of an action, relative to its own seat, or None when the encoding has no code for it: an ask of a
/// teammate or of oneself, a pass to an opponent or to oneself, a declare that states an opponent, or a field out
/// of range. Every action the reducer can accept has a code.
pub fn encode_action(a: &Action) -> Option<i32> {
    let seat = a.seat();
    if !is_seat(seat) {
        return None;
    }
    match *a {
        Action::Ask { target, card, .. } => {
            let r = rel_seat(target, seat);
            if r == NONE || r % 2 == 0 || card as usize >= NCARDS {
                return None;
            }
            Some(((r - 1) / 2) as i32 * NCARDS as i32 + card as i32)
        }
        Action::Decline { .. } => Some(A_DECLINE),
        Action::Pass { to, .. } => match rel_seat(to, seat) {
            2 => Some(A_PASS),
            4 => Some(A_PASS + 1),
            _ => None,
        },
        Action::Claim { set, assign, .. } => {
            if set as usize >= NSETS {
                return None;
            }
            let mut x = 0i32;
            for &s in assign.iter().rev() {
                let r = rel_seat(s, seat);
                if r == NONE || r % 2 == 1 {
                    return None;
                }
                x = 3 * x + (r / 2) as i32;
            }
            Some(A_DECLARE + set as i32 * N_ASSIGN + x)
        }
    }
}

/* ------------------------------------------------------------------------------------------------ layouts --- */

/// Legal row: the 162 ask codes first.
pub const L_ASK: usize = 0;
/// Legal row: the nine declare sets (any own-team assignment of a legal set is legal).
pub const L_DECLARE: usize = N_ASK;
/// Legal row: the decline.
pub const L_DECLINE: usize = L_DECLARE + NSETS;
/// Legal row: the two passes (teammate rel 2, teammate rel 4).
pub const L_PASS: usize = L_DECLINE + 1;
/// Bytes a game in the legal buffer.
pub const LEGAL_LEN: usize = L_PASS + 2;

/// Obs row: the observer's hand, one byte a card in canonical order (1 = held).
pub const O_HAND: usize = 0;
/// Obs row: the six hand counts, in relative seat order (rel 0 first).
pub const O_COUNTS: usize = O_HAND + NCARDS;
/// Obs row: the phase (0 playing, 1 awaitPass, 2 finished).
pub const O_PHASE: usize = O_COUNTS + NSEATS;
/// Obs row: the turn seat, relative.
pub const O_TURN: usize = O_PHASE + 1;
/// Obs row: 1 if the declare window is open.
pub const O_WINDOW: usize = O_TURN + 1;
/// Obs row: the window's option seat, relative (NONE when closed).
pub const O_OPTION: usize = O_WINDOW + 1;
/// Obs row: the window's decline count 0-5 (NONE when closed).
pub const O_DECLINED: usize = O_OPTION + 1;
/// Obs row: the observer's team's score, then the other team's.
pub const O_SCORE: usize = O_DECLINED + 1;
/// Obs row: nine sets of [`SET_FIELDS`] bytes: status, claimer, how.
pub const O_SETS: usize = O_SCORE + 2;
/// Bytes a set in the obs row.
pub const SET_FIELDS: usize = 3;
/// Obs row: the game's reveal regime, [`REGIME_HOME`] (0) or [`REGIME_BRIDGE`] (1). Added by P1 (ATHENA.md §8.2 G1b).
pub const O_REGIME: usize = O_SETS + NSETS * SET_FIELDS;
/// Bytes a game in the obs buffer.
pub const OBS_LEN: usize = O_REGIME + 1;

/// Facts row: each card's candidate seats now, relative (bit r: seat rel r may hold it); a singleton is certain; 0
/// once the card is out of play.
pub const F_CAND: usize = 0;
/// Facts row: the unknown slots of each seat, in relative order: its count less its certainly-located cards.
pub const F_UNKNOWN: usize = F_CAND + NCARDS;
/// Facts row: per set, how many of its cards are certain on the observer's team (NONE once resolved).
pub const F_SET_CERTAIN: usize = F_UNKNOWN + NSEATS;
/// Facts row: per set, 1 if the facts prove it lost for the observer's team (a card certainly with an opponent, or
/// no teammate a candidate for it), else 0 (NONE once resolved).
pub const F_SET_LOST: usize = F_SET_CERTAIN + NSETS;
/// Facts row: the rules-certain declare (the rail): its set, or NONE.
pub const F_RAIL: usize = F_SET_LOST + NSETS;
/// Facts row: the rail's stated seat for each of the set's six cards, relative (NONE without a rail).
pub const F_RAIL_ASSIGN: usize = F_RAIL + 1;
/// Facts row: the number of distinct set-membership constraints.
pub const F_NCONS: usize = F_RAIL_ASSIGN + 6;
/// Facts row: the constraints, [`CONS_FIELDS`] bytes each, sorted: the seat (relative), the set, and the six-bit mask
/// of the set's cards (set card order) of which that seat was dealt at least one. Entries past the count are NONE.
pub const F_CONS: usize = F_NCONS + 1;
/// Bytes a constraint in the facts row.
pub const CONS_FIELDS: usize = 3;
/// The most distinct constraints a facts row holds. More is an error, never a silent drop.
pub const MAX_CONS: usize = 64;
/// Bytes a game in the facts buffer.
pub const FACTS_LEN: usize = F_CONS + MAX_CONS * CONS_FIELDS;

/// Event row field: the type (0 game_started, 1 ask, 2 declare, 3 pass, 4 player_out, 5 game_over).
pub const E_TYPE: usize = 0;
/// Event row field: the actor, relative (start seat, asker, declarer, passer, emptied seat).
pub const E_ACTOR: usize = 1;
/// Event row field: the target, relative (ask target, pass receiver).
pub const E_TARGET: usize = 2;
/// Event row field: the card asked for.
pub const E_CARD: usize = 3;
/// Event row field: the ask's hit (0/1).
pub const E_HIT: usize = 4;
/// Event row field: the declared set.
pub const E_SET: usize = 5;
/// Event row field: the result, relative to the observer's team (declare: the team awarded the set; game_over: the
/// winner): 0 the observer's team, 1 the other team, 2 neither (a tie; unreachable under us54).
pub const E_RESULT: usize = 6;
/// Event row field: the declarer's stated seat for each of the set's six cards, relative.
pub const E_ASSIGN: usize = 7;
/// Event row field: each card's true holder at the declare, relative (public, even for a wrong declare).
pub const E_HOLDERS: usize = E_ASSIGN + 6;
/// Bytes an event row.
pub const EVENT_LEN: usize = E_HOLDERS + 6;
/// Event rows a game in the events buffer: the most events one observation can deliver. A seat observes at every
/// window it is offered, and every ask is preceded by six consecutive declines (every seat), so between two of a
/// seat's observations there is at most one ask; with at most 9 declares, 6 player_outs, 9 passes, the game_over
/// and the game_started, no backlog exceeds 27. A larger backlog (a caller that stepped without observing) is an
/// error, never a silent drop.
pub const MAX_EVENTS: usize = 32;
/// Events kept a game: every seat's backlog must fit.
const RING: usize = MAX_EVENTS;

/// Bytes a game in the critic buffer: each card's true holder, relative to the observer (NONE once out of play).
pub const CRITIC_LEN: usize = NCARDS;

/// Set status: open.
pub const SET_OPEN: u8 = 0;
/// Set status: awarded to the observer's team.
pub const SET_OURS: u8 = 1;
/// Set status: awarded to the other team.
pub const SET_THEIRS: u8 = 2;
/// Set "how": the declare was right.
pub const HOW_RIGHT: u8 = 0;
/// Set "how": wrong, an opponent of the declarer held a card.
pub const HOW_OPPONENT_HELD: u8 = 1;
/// Set "how": wrong, the declarer's team held all six but a card was stated at the wrong teammate.
pub const HOW_MISASSIGNED: u8 = 2;

/* ---------------------------------------------------------------------------------------------- one game --- */

/// Digest streams kept by a slot when the environment tracks digests (a debug mode): the replay format's chain and
/// log streams (replay-format.md §5), so a driver can compare d_t, l_t and v_t with a corpus record at every step.
#[derive(Clone, Debug)]
struct Track {
    chain: ByteDigest,
    log: ByteDigest,
    log_len: u32,
}

/// One game of the batch.
#[derive(Clone, Debug)]
struct Slot {
    game: Game,
    /// Actions applied to this game.
    steps: u32,
    /// 0 running, 1 finished, 2 capped at [`STEP_CAP`] steps.
    ended: u8,
    /// Events logged so far, `game_started` included.
    logged: u32,
    /// Per seat: events already delivered by an observation.
    seen: [u32; NSEATS],
    /// The last [`RING`] events, packed ([`pack_event`]).
    ring: [[u8; 4]; RING],
    seed: String,
    start: u8,
    track: Option<Track>,
    /// The game's reveal regime, and its facts machinery: the reveal always, the walk only when `walk_on`.
    gf: GameFacts,
    walk_on: bool,
    /// The planted mutant every game dealt into this slot plays under (only with the `mutants` feature).
    #[cfg(feature = "mutants")]
    mutant: Mutant,
}

impl Slot {
    fn empty(track: bool, walk_on: bool) -> Slot {
        Slot {
            game: Game::from_hands([0; NSEATS], 0),
            steps: 0,
            ended: 0,
            logged: 0,
            seen: [0; NSEATS],
            ring: [[0; 4]; RING],
            seed: String::new(),
            start: 0,
            track: track.then(|| Track {
                chain: ByteDigest::new(),
                log: ByteDigest::new(),
                log_len: 0,
            }),
            gf: GameFacts::new(REGIME_HOME),
            walk_on,
            #[cfg(feature = "mutants")]
            mutant: Mutant::None,
        }
    }

    /// Log one event: into the ring, and through the regime's reveal (and the walk, when on). Returns the event as the
    /// regime publishes it.
    #[inline]
    fn log_event(&mut self, e: Event) -> Event {
        self.ring[self.logged as usize % RING] = pack_event(&e);
        self.logged += 1;
        if self.walk_on {
            self.gf.log(&e)
        } else {
            self.gf.reveal.publish(&e)
        }
    }

    /// The game's reveal regime.
    #[inline]
    fn regime(&self) -> u8 {
        self.gf.reveal.regime
    }

    /// Start a game on `game` (a deal or a hand-built position) labelled `seed` for the digest header, under `regime`.
    fn start_game(&mut self, game: Game, seed: &str, start: u8, regime: u8) {
        self.game = game;
        #[cfg(feature = "mutants")]
        self.game.set_mutant(self.mutant);
        self.steps = 0;
        self.ended = 0;
        self.logged = 0;
        self.seen = [0; NSEATS];
        self.seed.clear();
        self.seed.push_str(seed);
        self.start = start;
        self.gf.reset(regime);
        self.log_event(Event::GameStarted { start });
        if let Some(t) = self.track.as_mut() {
            let mut buf = [0u8; 8];
            let mut sbuf = [0u8; STATE_LEN];
            t.chain = ByteDigest::new();
            t.chain.open_element();
            t.chain.feed(FORMAT.as_bytes());
            t.chain.feed(b"|");
            t.chain.feed(&[b'0' + start]);
            t.chain.feed(b"|");
            t.chain.feed(seed.as_bytes());
            t.chain.close_element();
            encode_state(&self.game, &mut sbuf);
            t.chain.push(&sbuf);
            t.log = ByteDigest::new();
            let n = encode_event(&Event::GameStarted { start }, &mut buf);
            t.log.push(&buf[..n]);
            t.log_len = 1;
        }
    }

    /// Deal `seed` at `start` (`newGame`), under `regime`.
    fn deal(&mut self, seed: &str, start: u8, regime: u8) -> Result<(), String> {
        let g = Game::new(seed, start).map_err(|e| e.to_string())?;
        self.start_game(g, seed, start, regime);
        Ok(())
    }

    /// Apply one action code for the acting seat. Ok(true) if the game ended with this action.
    fn step(&mut self, code: i32, ev: &mut Events) -> Result<bool, String> {
        let me = self.game.acting_seat();
        let a = decode_action(me, code).ok_or_else(|| format!("action code {code} is not in 0..{N_ACTIONS}"))?;
        self.game
            .apply(&a, ev)
            .map_err(|e| format!("action code {code} ({a:?}) refused: {}", e.name()))?;
        self.steps += 1;
        let mut published = [Event::PlayerOut { seat: 0 }; 8];
        for (p, &e) in published.iter_mut().zip(ev.as_slice()) {
            *p = self.log_event(e);
        }
        if let Some(t) = self.track.as_mut() {
            let mut buf = [0u8; 160];
            let mut sbuf = [0u8; STATE_LEN];
            let n = codec_action(&a, &mut buf);
            t.chain.push(&buf[..n]);
            let n = encode_events(ev.as_slice(), &mut buf);
            t.chain.push(&buf[..n]);
            encode_state(&self.game, &mut sbuf);
            t.chain.push(&sbuf);
            // The view's log digest takes each event as the regime published it (the state chain above keeps the
            // true events: the game is the same game under either regime).
            for e in &published[..ev.as_slice().len()] {
                let n = encode_event(e, &mut buf);
                t.log.push(&buf[..n]);
                t.log_len += 1;
            }
        }
        if self.game.phase() == FINISHED {
            self.ended = 1;
        } else if self.steps >= STEP_CAP {
            self.ended = 2;
        }
        Ok(self.ended != 0)
    }

    /// The winning team of a finished game (0, 1, or [`TIE`]), by awarded sets as `game_over` reports it.
    fn winner(&self) -> u8 {
        let w = self.game.awarded();
        if w[0] > w[1] {
            0
        } else if w[1] > w[0] {
            1
        } else {
            TIE
        }
    }

    /// The facts of `seat`'s view (needs the walk).
    fn facts(&self, seat: u8, out: &mut Facts) -> Result<(), String> {
        if !self.walk_on {
            return Err("facts need an environment built with facts on".into());
        }
        self.gf.facts(&self.game, seat, out);
        Ok(())
    }

    /// Fill one game's observation for its acting seat. Returns the number of events delivered.
    fn observe(&mut self, o: RowOut<'_>, asks: &mut AskList, facts: &mut Facts) -> Result<u32, String> {
        let g = &self.game;
        let me = g.acting_seat();
        *o.seat = me;
        let my_team = team(me);
        let reveal = self.gf.reveal;

        // The fixed part: hand, counts, phase, turn, window, score, sets.
        let obs = o.obs;
        let hand = g.hand(me);
        for k in 0..6 {
            let bytes = SPREAD[((hand >> (8 * k)) & 0xFF) as usize].to_le_bytes();
            obs[O_HAND + 8 * k..O_HAND + 8 * k + 8].copy_from_slice(&bytes);
        }
        let bytes = SPREAD[((hand >> 48) & 0x3F) as usize].to_le_bytes();
        obs[O_HAND + 48..O_HAND + NCARDS].copy_from_slice(&bytes[..6]);
        let counts = g.counts();
        for r in 0..NSEATS {
            obs[O_COUNTS + r] = counts[abs_seat(r as u8, me) as usize];
        }
        obs[O_PHASE] = g.phase();
        obs[O_TURN] = rel_seat(g.turn(), me);
        match g.window() {
            Some(w) => {
                obs[O_WINDOW] = 1;
                obs[O_OPTION] = rel_seat(w.option, me);
                obs[O_DECLINED] = w.declined;
            }
            None => {
                obs[O_WINDOW] = 0;
                obs[O_OPTION] = NONE;
                obs[O_DECLINED] = NONE;
            }
        }
        let score = g.score();
        obs[O_SCORE] = score[my_team as usize];
        obs[O_SCORE + 1] = score[1 - my_team as usize];
        for b in 0..NSETS as u8 {
            let o3 = O_SETS + SET_FIELDS * b as usize;
            let outcome = g.set_outcome(b);
            if outcome == NONE {
                obs[o3] = SET_OPEN;
                obs[o3 + 1] = NONE;
                obs[o3 + 2] = NONE;
                continue;
            }
            obs[o3] = if outcome == my_team {
                SET_OURS
            } else if outcome == 1 - my_team {
                SET_THEIRS
            } else {
                3 // void: a pagat48 outcome, unreachable under us54
            };
            let claimer = g.set_claimer(b);
            obs[o3 + 1] = rel_seat(claimer, me);
            obs[o3 + 2] = how_byte(claimer, outcome, &g.set_holders(b), reveal.revealed(b));
        }
        obs[O_REGIME] = reveal.regime;

        // The legal masks, by the reducer's verdict.
        let legal = o.legal;
        legal.fill(0);
        g.legal_asks(me, asks);
        for i in 0..asks.len() {
            let (target, card) = asks.get(i);
            let k = (rel_seat(target, me) - 1) / 2;
            legal[L_ASK + k as usize * NCARDS + card as usize] = 1;
        }
        // The declare sets: the reducer's verdict on one representative declare (the first open set, every card
        // stated at the declarer) stands for every open set. In check_claim's order the only set-dependent checks are
        // BOOK_RESOLVED, the set's range, and a card out of play, which an open set never has (its six cards are in
        // hands); ASSIGN_OPPONENT depends only on the stated seats, and every own-team statement passes it. A
        // resolved set fails on BOOK_RESOLVED. The tests compare every code of the action space with `validate`.
        if let Some(first) = g.first_open_set() {
            let claim = Action::Claim {
                seat: me,
                set: first,
                assign: [me; 6],
            };
            if g.validate(&claim).is_ok() {
                for b in 0..NSETS as u8 {
                    legal[L_DECLARE + b as usize] = !g.is_resolved(b) as u8;
                }
            }
        }
        legal[L_DECLINE] = g.validate(&Action::Decline { seat: me }).is_ok() as u8;
        for k in 0..2u8 {
            let pass = Action::Pass {
                seat: me,
                to: abs_seat(2 * (k + 1), me),
            };
            legal[L_PASS + k as usize] = g.validate(&pass).is_ok() as u8;
        }

        // The events since this seat's last observation. The start-seat rule: `game_started` is withheld until the
        // first event, and then delivered with that event's actor.
        let from = self.seen[me as usize];
        let pending = if from == 0 && self.logged <= 1 {
            0
        } else {
            self.logged - from
        };
        if pending as usize > MAX_EVENTS {
            return Err(format!(
                "seat {me} has {pending} undelivered events, above MAX_EVENTS = {MAX_EVENTS}: observe after every step"
            ));
        }
        for i in 0..pending {
            let k = from + i;
            let mut e = unpack_event(self.ring[k as usize % RING], g, &reveal);
            if k == 0 {
                e = Event::GameStarted {
                    start: event_actor(&unpack_event(self.ring[1], g, &reveal)),
                };
            }
            let row = &mut o.events[i as usize * EVENT_LEN..(i as usize + 1) * EVENT_LEN];
            encode_event_row(&e, me, row);
        }
        self.seen[me as usize] = from + pending;
        *o.n_events = pending as u8;

        // The rules-derived facts of this seat's view.
        if let Some(fr) = o.facts {
            self.facts(me, facts)?;
            write_facts_row(facts, resolved_mask(g), fr)?;
        }

        // The critic's buffer: the true deal, never written into an actor buffer.
        if let Some(cr) = o.critic {
            let rel = &REL[me as usize];
            for (x, &h) in cr.iter_mut().zip(g.owners().iter()) {
                *x = rel[h as usize];
            }
        }
        Ok(pending)
    }
}

const fn build_spread() -> [u64; 256] {
    let mut t = [0u64; 256];
    let mut v = 0;
    while v < 256 {
        let mut x = 0u64;
        let mut k = 0;
        while k < 8 {
            if (v >> k) & 1 == 1 {
                x |= 1u64 << (8 * k);
            }
            k += 1;
        }
        t[v] = x;
        v += 1;
    }
    t
}

/// Eight bits spread to eight 0/1 bytes (little-endian): the hand's bytes of the obs row, eight cards at a time.
const SPREAD: [u64; 256] = build_spread();

const fn build_rel() -> [[u8; 256]; NSEATS] {
    let mut t = [[NONE; 256]; NSEATS];
    let mut me = 0;
    while me < NSEATS {
        let mut s = 0;
        while s < NSEATS {
            t[me][s] = ((s + 6 - me) % 6) as u8;
            s += 1;
        }
        me += 1;
    }
    t
}

/// [`rel_seat`] as a table: `REL[observer][seat byte]`.
const REL: [[u8; 256]; NSEATS] = build_rel();

/// An event in four bytes, for the slot's ring: a declare keeps only its set, because the set block holds the
/// rest of it (claimer, stated seats, true holders, outcome) from the moment it resolves.
fn pack_event(e: &Event) -> [u8; 4] {
    match *e {
        Event::GameStarted { start } => [0, start, 0, 0],
        Event::Ask {
            asker,
            target,
            card,
            hit,
        } => [1, asker, target, card | (u8::from(hit) << 7)],
        Event::Claim { set, .. } => [2, set, 0, 0],
        Event::Pass { from, to } => [3, from, to, 0],
        Event::PlayerOut { seat } => [4, seat, 0, 0],
        Event::GameOver { score, winner } => [5, winner, score[0], score[1]],
    }
}

/// The event a packed entry stands for, its declare rebuilt from `g`'s set block with the holders the regime
/// published (the others NONE).
fn unpack_event(p: [u8; 4], g: &Game, reveal: &Reveal) -> Event {
    match p[0] {
        0 => Event::GameStarted { start: p[1] },
        1 => Event::Ask {
            asker: p[1],
            target: p[2],
            card: p[3] & 0x7F,
            hit: p[3] >> 7 == 1,
        },
        2 => {
            let mut holders = g.set_holders(p[1]);
            let shown = reveal.revealed(p[1]);
            for (j, h) in holders.iter_mut().enumerate() {
                if shown & (1 << j) == 0 {
                    *h = NONE;
                }
            }
            Event::Claim {
                claimer: g.set_claimer(p[1]),
                set: p[1],
                assign: g.set_assignments(p[1]),
                holders,
                outcome: g.set_outcome(p[1]),
            }
        }
        3 => Event::Pass { from: p[1], to: p[2] },
        4 => Event::PlayerOut { seat: p[1] },
        _ => Event::GameOver {
            winner: p[1],
            score: [p[2], p[3]],
        },
    }
}

/// One public event as a fixed-width row relative to `me` (fields absent from the event are NONE).
pub fn encode_event_row(e: &Event, me: u8, row: &mut [u8]) {
    row[..EVENT_LEN].fill(NONE);
    let my_team = team(me);
    let result = |t: u8| {
        if t == my_team {
            0
        } else if t == 1 - my_team {
            1
        } else {
            2
        }
    };
    match *e {
        Event::GameStarted { start } => {
            row[E_TYPE] = 0;
            row[E_ACTOR] = rel_seat(start, me);
        }
        Event::Ask {
            asker,
            target,
            card,
            hit,
        } => {
            row[E_TYPE] = 1;
            row[E_ACTOR] = rel_seat(asker, me);
            row[E_TARGET] = rel_seat(target, me);
            row[E_CARD] = card;
            row[E_HIT] = hit as u8;
        }
        Event::Claim {
            claimer,
            set,
            assign,
            holders,
            outcome,
        } => {
            row[E_TYPE] = 2;
            row[E_ACTOR] = rel_seat(claimer, me);
            row[E_SET] = set;
            row[E_RESULT] = result(outcome);
            for j in 0..6 {
                row[E_ASSIGN + j] = rel_seat(assign[j], me);
                row[E_HOLDERS + j] = rel_seat(holders[j], me);
            }
        }
        Event::Pass { from, to } => {
            row[E_TYPE] = 3;
            row[E_ACTOR] = rel_seat(from, me);
            row[E_TARGET] = rel_seat(to, me);
        }
        Event::PlayerOut { seat } => {
            row[E_TYPE] = 4;
            row[E_ACTOR] = rel_seat(seat, me);
        }
        Event::GameOver { winner, .. } => {
            row[E_TYPE] = 5;
            row[E_RESULT] = result(winner);
        }
    }
}

/// A resolved set's "how" byte from its published holders (`lib/athena/encode.ts`'s `howByte`): right; wrong with a
/// published holder on the other team than the declarer's; wrong with all six published on the declarer's team
/// (misassigned); or NONE when the published holders cannot settle it (the bridge regime).
fn how_byte(claimer: u8, outcome: u8, holders: &[u8; 6], shown: u8) -> u8 {
    let ct = team(claimer);
    if outcome == ct {
        return HOW_RIGHT;
    }
    let mut known = 0;
    for (j, &h) in holders.iter().enumerate() {
        if shown & (1 << j) == 0 {
            continue;
        }
        known += 1;
        if team(h) != ct {
            return HOW_OPPONENT_HELD;
        }
    }
    if known == 6 {
        HOW_MISASSIGNED
    } else {
        NONE
    }
}

/// The seat an event is by: the asker, the declarer, the passer, the emptied seat (the start seat for
/// `game_started`, NONE for `game_over`).
fn event_actor(e: &Event) -> u8 {
    match *e {
        Event::GameStarted { start } => start,
        Event::Ask { asker, .. } => asker,
        Event::Claim { claimer, .. } => claimer,
        Event::Pass { from, .. } => from,
        Event::PlayerOut { seat } => seat,
        Event::GameOver { .. } => NONE,
    }
}

/// A six-bit mask of absolute seats as relative ones: bit r is seat `(observer + r) mod 6`.
#[inline]
fn rel_mask(m: u8, observer: u8) -> u8 {
    ((m >> observer) | (m << (6 - observer))) & 0x3F
}

/// The facts row (API.md §5.4) of a view's facts, relative to its seat.
fn write_facts_row(f: &Facts, resolved: u16, row: &mut [u8]) -> Result<(), String> {
    let me = f.seat;
    for ci in 0..NCARDS {
        row[F_CAND + ci] = rel_mask(f.cand[ci], me);
    }
    for r in 0..NSEATS {
        row[F_UNKNOWN + r] = f.unknown[abs_seat(r as u8, me) as usize];
    }
    for (b, &(certain, lost)) in set_status(f, resolved).iter().enumerate() {
        row[F_SET_CERTAIN + b] = certain;
        row[F_SET_LOST + b] = lost;
    }
    match rail(f, resolved) {
        Some((set, a)) => {
            row[F_RAIL] = set;
            for j in 0..6 {
                row[F_RAIL_ASSIGN + j] = rel_seat(a[j], me);
            }
        }
        None => row[F_RAIL..F_RAIL_ASSIGN + 6].fill(NONE),
    }
    let mut cons = [[0u8; 3]; MAX_CONS];
    let mut n = 0usize;
    for k in &f.cons {
        let (set, m) = k.set_and_mask();
        let t = [rel_seat(k.seat, me), set, m];
        if cons[..n].contains(&t) {
            continue;
        }
        if n == MAX_CONS {
            return Err(format!(
                "a view has more than MAX_CONS = {MAX_CONS} distinct constraints; the facts row cannot hold them"
            ));
        }
        cons[n] = t;
        n += 1;
    }
    cons[..n].sort_unstable();
    row[F_NCONS] = n as u8;
    for (i, t) in cons[..n].iter().enumerate() {
        row[F_CONS + CONS_FIELDS * i..F_CONS + CONS_FIELDS * (i + 1)].copy_from_slice(t);
    }
    row[F_CONS + CONS_FIELDS * n..FACTS_LEN].fill(NONE);
    Ok(())
}

/// G1c's live-set rule (ATHENA.md §8.2; [`crate::facts::window_class`]) read off a facts row: the rail when
/// `F_RAIL` names a set; else a live set when some open set is not proved lost and has at least `k` of its cards
/// certain on the observer's team; else a compelled claim when declining is illegal; else declined by rule.
pub fn window_class_of_row(row: &[u8], k: u8, decline_legal: bool) -> WindowClass {
    if row[F_RAIL] != NONE {
        return WindowClass::Rail;
    }
    let live = (0..NSETS).any(|b| {
        let certain = row[F_SET_CERTAIN + b];
        certain != NONE && row[F_SET_LOST + b] == 0 && certain >= k
    });
    if live {
        WindowClass::Live
    } else if !decline_legal {
        WindowClass::Compelled
    } else {
        WindowClass::Declined
    }
}

/* ------------------------------------------------------------------------------------------------ buffers --- */

/// The observation buffers of a batch (or of a chunk of it), row-major, one row per game.
#[derive(Debug)]
pub struct ObsOut<'a> {
    /// The acting (observing) seat, absolute: `n`.
    pub seat: &'a mut [u8],
    /// `n x OBS_LEN`.
    pub obs: &'a mut [u8],
    /// `n x LEGAL_LEN`.
    pub legal: &'a mut [u8],
    /// `n x MAX_EVENTS x EVENT_LEN`; rows at and past `n_events` are left as they were.
    pub events: &'a mut [u8],
    /// `n`: event rows delivered.
    pub n_events: &'a mut [u8],
    /// `n x CRITIC_LEN`, the true deal, or None to skip it.
    pub critic: Option<&'a mut [u8]>,
    /// `n x FACTS_LEN`, the rules-derived facts of the acting seat's view, or None to skip them. Needs an environment
    /// built with facts on ([`VecEnv::with_facts`]).
    pub facts: Option<&'a mut [u8]>,
}

fn split_opt(x: Option<&mut [u8]>, at: usize) -> (Option<&mut [u8]>, Option<&mut [u8]>) {
    match x {
        Some(c) => {
            let (a, b) = c.split_at_mut(at);
            (Some(a), Some(b))
        }
        None => (None, None),
    }
}

impl<'a> ObsOut<'a> {
    fn check(&self, n: usize) -> Result<(), String> {
        let ok = self.seat.len() == n
            && self.obs.len() == n * OBS_LEN
            && self.legal.len() == n * LEGAL_LEN
            && self.events.len() == n * MAX_EVENTS * EVENT_LEN
            && self.n_events.len() == n
            && self.critic.as_ref().map_or(true, |c| c.len() == n * CRITIC_LEN)
            && self.facts.as_ref().map_or(true, |c| c.len() == n * FACTS_LEN);
        if ok {
            Ok(())
        } else {
            Err(format!("observation buffers are not sized for {n} games"))
        }
    }

    fn split_at(self, rows: usize) -> (ObsOut<'a>, ObsOut<'a>) {
        let (s0, s1) = self.seat.split_at_mut(rows);
        let (o0, o1) = self.obs.split_at_mut(rows * OBS_LEN);
        let (l0, l1) = self.legal.split_at_mut(rows * LEGAL_LEN);
        let (e0, e1) = self.events.split_at_mut(rows * MAX_EVENTS * EVENT_LEN);
        let (n0, n1) = self.n_events.split_at_mut(rows);
        let (c0, c1) = split_opt(self.critic, rows * CRITIC_LEN);
        let (f0, f1) = split_opt(self.facts, rows * FACTS_LEN);
        (
            ObsOut {
                seat: s0,
                obs: o0,
                legal: l0,
                events: e0,
                n_events: n0,
                critic: c0,
                facts: f0,
            },
            ObsOut {
                seat: s1,
                obs: o1,
                legal: l1,
                events: e1,
                n_events: n1,
                critic: c1,
                facts: f1,
            },
        )
    }

    fn row(&mut self, i: usize) -> RowOut<'_> {
        RowOut {
            seat: &mut self.seat[i],
            obs: &mut self.obs[i * OBS_LEN..(i + 1) * OBS_LEN],
            legal: &mut self.legal[i * LEGAL_LEN..(i + 1) * LEGAL_LEN],
            events: &mut self.events[i * MAX_EVENTS * EVENT_LEN..(i + 1) * MAX_EVENTS * EVENT_LEN],
            n_events: &mut self.n_events[i],
            critic: self
                .critic
                .as_deref_mut()
                .map(|c| &mut c[i * CRITIC_LEN..(i + 1) * CRITIC_LEN]),
            facts: self
                .facts
                .as_deref_mut()
                .map(|c| &mut c[i * FACTS_LEN..(i + 1) * FACTS_LEN]),
        }
    }
}

/// One game's rows of the observation buffers.
struct RowOut<'a> {
    seat: &'a mut u8,
    obs: &'a mut [u8],
    legal: &'a mut [u8],
    events: &'a mut [u8],
    n_events: &'a mut u8,
    critic: Option<&'a mut [u8]>,
    facts: Option<&'a mut [u8]>,
}

/// What a step returns for a batch (or a chunk of it).
#[derive(Debug)]
pub struct StepOut<'a> {
    /// `n x 2`: the reward of team 0 and team 1, +1 to the winner and -1 to the loser on the step a game finishes;
    /// 0 otherwise (a capped game included).
    pub reward: &'a mut [f32],
    /// `n`: the game finished on this step.
    pub terminated: &'a mut [bool],
    /// `n`: the game hit the step cap on this step.
    pub truncated: &'a mut [bool],
}

impl<'a> StepOut<'a> {
    fn check(&self, n: usize) -> Result<(), String> {
        if self.reward.len() == 2 * n && self.terminated.len() == n && self.truncated.len() == n {
            Ok(())
        } else {
            Err(format!("step outputs are not sized for {n} games"))
        }
    }

    fn split_at(self, rows: usize) -> (StepOut<'a>, StepOut<'a>) {
        let (r0, r1) = self.reward.split_at_mut(2 * rows);
        let (t0, t1) = self.terminated.split_at_mut(rows);
        let (u0, u1) = self.truncated.split_at_mut(rows);
        (
            StepOut {
                reward: r0,
                terminated: t0,
                truncated: u0,
            },
            StepOut {
                reward: r1,
                terminated: t1,
                truncated: u1,
            },
        )
    }
}

/* ------------------------------------------------------------------------------------------------ the batch --- */

/// Counters over the environment's life, summed over its workers.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Stats {
    /// Actions applied.
    pub steps: u64,
    /// Games that finished (a clinch).
    pub finished: u64,
    /// Games that hit the step cap. Counted, never dropped.
    pub capped: u64,
    /// Actions taken by the games that ended (finished or capped), so their mean length is unbiased by the games
    /// still in flight.
    pub ended_steps: u64,
    /// Finished games won by team 0 and by team 1.
    pub wins: [u64; 2],
    /// Observations made.
    pub observations: u64,
    /// The largest event backlog one observation delivered.
    pub max_backlog: u32,
    /// Games started by auto-reset.
    pub auto_resets: u64,
}

impl Stats {
    fn merge(&mut self, o: &Stats) {
        self.steps += o.steps;
        self.finished += o.finished;
        self.capped += o.capped;
        self.ended_steps += o.ended_steps;
        self.wins[0] += o.wins[0];
        self.wins[1] += o.wins[1];
        self.observations += o.observations;
        self.max_backlog = self.max_backlog.max(o.max_backlog);
        self.auto_resets += o.auto_resets;
    }
}

/// How auto-reset chooses each new game's reveal regime.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum RegimeRule {
    /// Every game at home.
    #[default]
    Home,
    /// Every game at the bridge.
    Bridge,
    /// Each game draws its regime with probability ½ from its seed: bridge when `rngFromSeed(seed + ':regime')()`
    /// is below 0.5 ([`drawn_regime`]). ATHENA.md §8.2's rule for P2's training games.
    Draw,
}

impl RegimeRule {
    /// `home`, `bridge` or `draw`.
    pub fn parse(s: &str) -> Option<RegimeRule> {
        match s {
            "home" => Some(RegimeRule::Home),
            "bridge" => Some(RegimeRule::Bridge),
            "draw" => Some(RegimeRule::Draw),
            _ => None,
        }
    }

    /// The regime of the game dealt from `seed` under this rule.
    pub fn regime_of(self, seed: &str) -> u8 {
        match self {
            RegimeRule::Home => REGIME_HOME,
            RegimeRule::Bridge => REGIME_BRIDGE,
            RegimeRule::Draw => drawn_regime(seed),
        }
    }
}

/// The regime a seed draws with probability ½: bridge when `rngFromSeed(seed + ':regime')()` is below 0.5.
pub fn drawn_regime(seed: &str) -> u8 {
    let h = Xmur3::from_str_parts(&[seed, ":regime"]).next();
    if Mulberry32::new(h).next_f64() < 0.5 {
        REGIME_BRIDGE
    } else {
        REGIME_HOME
    }
}

/// A batch of `n` us54 games stepped together.
#[derive(Clone, Debug)]
pub struct VecEnv {
    slots: Vec<Slot>,
    threads: usize,
    auto_reset: Option<String>,
    auto_regime: RegimeRule,
    next_game: u64,
    ready: bool,
    stats: Stats,
}

/// The shared context of one parallel pass.
struct Pass<'a> {
    prefix: Option<&'a str>,
    regime: RegimeRule,
    next_game: u64,
    counts: &'a [AtomicU64],
    barrier: Option<&'a Barrier>,
}

/// What one worker reports.
#[derive(Default)]
struct Report {
    stats: Stats,
    error: Option<String>,
}

impl VecEnv {
    /// `n` games, stepped on `threads` threads (the calling thread is one of them), optionally keeping the replay
    /// format's digest streams. Call [`VecEnv::reset`] (or [`VecEnv::reset_hands`]) before anything else.
    pub fn new(n: usize, threads: usize, track_digests: bool) -> Result<VecEnv, String> {
        VecEnv::with_facts(n, threads, track_digests, false)
    }

    /// As [`VecEnv::new`], and with `facts` every game keeps the walk of `crate::facts` over its published log, so
    /// that observations can fill a facts buffer and [`VecEnv::facts_of`] can answer. Without it neither can (an
    /// error), and a step costs nothing for the facts.
    pub fn with_facts(n: usize, threads: usize, track_digests: bool, facts: bool) -> Result<VecEnv, String> {
        if n == 0 {
            return Err("a batch needs at least one game".into());
        }
        if threads == 0 {
            return Err("threads must be at least 1".into());
        }
        Ok(VecEnv {
            slots: vec![Slot::empty(track_digests, facts); n],
            threads,
            auto_reset: None,
            auto_regime: RegimeRule::Home,
            next_game: 0,
            ready: false,
            stats: Stats::default(),
        })
    }

    /// Does every game keep its facts walk?
    pub fn facts_on(&self) -> bool {
        self.slots[0].walk_on
    }

    /// The number of games.
    pub fn len(&self) -> usize {
        self.slots.len()
    }

    /// Never true: a batch has at least one game.
    pub fn is_empty(&self) -> bool {
        self.slots.is_empty()
    }

    /// The worker thread count.
    pub fn threads(&self) -> usize {
        self.threads
    }

    /// Set the worker thread count (at least 1).
    pub fn set_threads(&mut self, threads: usize) -> Result<(), String> {
        if threads == 0 {
            return Err("threads must be at least 1".into());
        }
        self.threads = threads;
        Ok(())
    }

    /// Auto-reset: when a game finishes or is capped during [`VecEnv::step`], its slot is dealt the next game at
    /// once, seed `prefix + decimal(k)` and start seat `k mod 6`, where k counts up from `next`. Finished slots take
    /// their k in slot order, so the games played do not depend on the thread count. None turns it off: an ended
    /// game then stays ended and its actions are ignored.
    pub fn set_auto_reset(&mut self, prefix: Option<String>, next: u64) {
        self.auto_reset = prefix;
        self.next_game = next;
    }

    /// How auto-reset chooses each new game's regime (home, unless set).
    pub fn set_auto_regime(&mut self, rule: RegimeRule) {
        self.auto_regime = rule;
    }

    /// The auto-reset regime rule.
    pub fn auto_regime(&self) -> RegimeRule {
        self.auto_regime
    }

    /// The next auto-reset game number.
    pub fn next_game(&self) -> u64 {
        self.next_game
    }

    fn check_regimes(regimes: Option<&[u8]>, n: usize) -> Result<(), String> {
        if let Some(r) = regimes {
            if r.len() != n {
                return Err(format!("{n} games need {n} regimes, got {}", r.len()));
            }
            if let Some(i) = r.iter().position(|&x| x != REGIME_HOME && x != REGIME_BRIDGE) {
                return Err(format!("game {i}: regime {} is not 0 (home) or 1 (bridge)", r[i]));
            }
        }
        Ok(())
    }

    /// Deal every game: `seeds[i]` at `starts[i]`, exactly as the reference's `newGame` (the same seed string deals
    /// the same hands as `lib/engine/`), every game under the home regime.
    pub fn reset<S: AsRef<str>>(&mut self, seeds: &[S], starts: &[u8]) -> Result<(), String> {
        self.reset_regimes(seeds, starts, None)
    }

    /// As [`VecEnv::reset`], game i under `regimes[i]` ([`REGIME_HOME`] or [`REGIME_BRIDGE`]; all home if None).
    pub fn reset_regimes<S: AsRef<str>>(
        &mut self,
        seeds: &[S],
        starts: &[u8],
        regimes: Option<&[u8]>,
    ) -> Result<(), String> {
        let n = self.slots.len();
        if seeds.len() != n || starts.len() != n {
            return Err(format!(
                "reset needs {n} seeds and {n} start seats, got {} and {}",
                seeds.len(),
                starts.len()
            ));
        }
        VecEnv::check_regimes(regimes, n)?;
        for (i, (slot, (seed, &start))) in self.slots.iter_mut().zip(seeds.iter().zip(starts)).enumerate() {
            let regime = regimes.map_or(REGIME_HOME, |r| r[i]);
            slot.deal(seed.as_ref(), start, regime)
                .map_err(|e| format!("game {i}: {e}"))?;
        }
        self.ready = true;
        Ok(())
    }

    /// Start every game from a given deal: `holders[i * 54 + c]` is the seat holding card c in game i (every card
    /// in play; the hands need not be nine cards each), with the turn and the window at `starts[i]`, under the home
    /// regime. For tests and hand-built positions; its digest header's seed is `deal`.
    pub fn reset_hands(&mut self, holders: &[u8], starts: &[u8]) -> Result<(), String> {
        self.reset_hands_regimes(holders, starts, None)
    }

    /// As [`VecEnv::reset_hands`], game i under `regimes[i]` (all home if None).
    pub fn reset_hands_regimes(&mut self, holders: &[u8], starts: &[u8], regimes: Option<&[u8]>) -> Result<(), String> {
        let n = self.slots.len();
        if holders.len() != n * NCARDS || starts.len() != n {
            return Err(format!("reset_hands needs {n} x 54 holders and {n} start seats"));
        }
        VecEnv::check_regimes(regimes, n)?;
        for (i, slot) in self.slots.iter_mut().enumerate() {
            let start = starts[i];
            if !is_seat(start) {
                return Err(format!("game {i}: start seat {start} is not a seat"));
            }
            let mut hands = [0u64; NSEATS];
            for (c, &h) in holders[i * NCARDS..(i + 1) * NCARDS].iter().enumerate() {
                if !is_seat(h) {
                    return Err(format!("game {i}: card {c} has holder {h}, not a seat"));
                }
                hands[h as usize] |= 1u64 << c;
            }
            slot.start_game(
                Game::from_hands(hands, start),
                "deal",
                start,
                regimes.map_or(REGIME_HOME, |r| r[i]),
            );
        }
        self.ready = true;
        Ok(())
    }

    fn check_obs(&self, o: &ObsOut<'_>) -> Result<(), String> {
        o.check(self.slots.len())?;
        if o.facts.is_some() && !self.facts_on() {
            return Err("a facts buffer needs an environment built with facts on".into());
        }
        Ok(())
    }

    fn need_ready(&self) -> Result<(), String> {
        if self.ready {
            Ok(())
        } else {
            Err("call reset before stepping or observing".into())
        }
    }

    /// Fill `out` with every game's observation for its acting seat. Each seat's event rows are the public events
    /// logged since that seat's previous observation, which this consumes.
    pub fn observe(&mut self, out: ObsOut<'_>) -> Result<(), String> {
        self.need_ready()?;
        self.check_obs(&out)?;
        self.run(None, None, Some(out))
    }

    /// Apply `actions[i]` for game i's acting seat, write the rewards and end flags into `res`, auto-reset ended
    /// games if that is on, then, with `obs`, observe every game. An illegal action or an unknown code is an error
    /// naming the first such game; that game is left unchanged, and the others were stepped.
    pub fn step(&mut self, actions: &[i32], res: StepOut<'_>, obs: Option<ObsOut<'_>>) -> Result<(), String> {
        self.need_ready()?;
        let n = self.slots.len();
        if actions.len() != n {
            return Err(format!("step needs {n} actions, got {}", actions.len()));
        }
        res.check(n)?;
        if let Some(o) = obs.as_ref() {
            self.check_obs(o)?;
        }
        self.run(Some(actions), Some(res), obs)
    }

    /// The parallel pass: contiguous chunks of games, one per thread; the calling thread takes the first.
    fn run(
        &mut self,
        actions: Option<&[i32]>,
        res: Option<StepOut<'_>>,
        obs: Option<ObsOut<'_>>,
    ) -> Result<(), String> {
        let n = self.slots.len();
        let workers = self.threads.min(n);
        let base = n / workers;
        let extra = n % workers;
        let sizes: Vec<usize> = (0..workers).map(|w| base + usize::from(w < extra)).collect();
        let counts: Vec<AtomicU64> = (0..workers).map(|_| AtomicU64::new(0)).collect();
        let stepping = actions.is_some();
        let barrier = (stepping && self.auto_reset.is_some()).then(|| Barrier::new(workers));
        let pass = Pass {
            prefix: if stepping { self.auto_reset.as_deref() } else { None },
            regime: self.auto_regime,
            next_game: self.next_game,
            counts: &counts,
            barrier: barrier.as_ref(),
        };

        // Split every buffer into the chunks.
        let mut chunks = Vec::with_capacity(workers);
        let mut slots_rest: &mut [Slot] = &mut self.slots;
        let mut act_rest: &[i32] = actions.unwrap_or(&[]);
        let mut res_rest = res;
        let mut obs_rest = obs;
        let mut offset = 0usize;
        for &size in &sizes {
            let (s, rest) = slots_rest.split_at_mut(size);
            slots_rest = rest;
            let a = if stepping {
                let (a, rest) = act_rest.split_at(size);
                act_rest = rest;
                a
            } else {
                &[][..]
            };
            let r = res_rest.take().map(|r| {
                let (x, rest) = r.split_at(size);
                res_rest = Some(rest);
                x
            });
            let o = obs_rest.take().map(|o| {
                let (x, rest) = o.split_at(size);
                obs_rest = Some(rest);
                x
            });
            chunks.push(Chunk {
                id: chunks.len(),
                offset,
                slots: s,
                actions: a,
                res: r,
                obs: o,
            });
            offset += size;
        }

        let reports: Vec<Report> = std::thread::scope(|scope| {
            let mut it = chunks.into_iter();
            let first = it.next().expect("at least one chunk");
            let handles: Vec<_> = it
                .map(|ch| {
                    let pass = &pass;
                    scope.spawn(move || work(ch, pass))
                })
                .collect();
            let mut reports = vec![work(first, &pass)];
            for h in handles {
                reports.push(h.join().expect("a batch worker panicked"));
            }
            reports
        });

        let mut error = None;
        for r in &reports {
            self.stats.merge(&r.stats);
            if error.is_none() {
                error.clone_from(&r.error);
            }
        }
        if pass.prefix.is_some() {
            self.next_game += counts.iter().map(|c| c.load(Ordering::Relaxed)).sum::<u64>();
        }
        match error {
            Some(e) => Err(e),
            None => Ok(()),
        }
    }

    /// The replay format's digests of every game, for a driver that checks the batch against a corpus record
    /// (needs `track_digests`): `d` is the chain's value after the last applied step (the deal digest before any),
    /// and `l` and `v` are the legal-move and view digests of the current state for its acting seat
    /// (replay-format.md §4.6, §4.7, §5).
    pub fn digests(&self, d: &mut [u64], l: &mut [u64], v: &mut [u64]) -> Result<(), String> {
        let n = self.slots.len();
        if d.len() != n || l.len() != n || v.len() != n {
            return Err(format!("digests needs three arrays of {n}"));
        }
        let mut asks = AskList::new();
        let mut buf = vec![0u8; 1024];
        for (i, s) in self.slots.iter().enumerate() {
            let t = s
                .track
                .as_ref()
                .ok_or("digests needs an environment built with track_digests")?;
            d[i] = t.chain.value();
            let acting = s.game.acting_seat();
            s.game.legal_asks(acting, &mut asks);
            let kinds = s.game.legal_kinds(acting, &asks);
            let k = encode_legal(acting, kinds, &asks, &mut buf);
            l[i] = digest(&buf[..k]);
            let sets = s.gf.reveal.mask_set_block(s.game.set_block());
            let k = encode_view_with_sets(&s.game, acting, t.log_len, &t.log.hex(), &sets, &mut buf);
            v[i] = digest(&buf[..k]);
        }
        Ok(())
    }

    /// Game i's state.
    pub fn game(&self, i: usize) -> &Game {
        &self.slots[i].game
    }

    /// Actions applied to game i.
    pub fn steps_of(&self, i: usize) -> u32 {
        self.slots[i].steps
    }

    /// 0 running, 1 finished, 2 capped (only ever seen with auto-reset off).
    pub fn ended(&self, i: usize) -> u8 {
        self.slots[i].ended
    }

    /// Game i's seed (`deal` for a hand-built deal).
    pub fn seed(&self, i: usize) -> &str {
        &self.slots[i].seed
    }

    /// Game i's start seat.
    pub fn start_seat(&self, i: usize) -> u8 {
        self.slots[i].start
    }

    /// Game i's reveal regime ([`REGIME_HOME`] or [`REGIME_BRIDGE`]).
    pub fn regime(&self, i: usize) -> u8 {
        self.slots[i].regime()
    }

    /// The facts of `seat`'s view of game i now (needs facts on): the view the regime publishes, as the facts row of
    /// an observation by that seat would give them.
    pub fn facts_of(&self, i: usize, seat: u8, out: &mut Facts) -> Result<(), String> {
        if i >= self.slots.len() || !is_seat(seat) {
            return Err(format!("facts_of: no game {i} or no seat {seat}"));
        }
        self.slots[i].facts(seat, out)
    }

    /// The facts row (API.md §5.4) of `seat`'s view of game i now (needs facts on), into `row` of [`FACTS_LEN`] bytes.
    pub fn facts_row(&self, i: usize, seat: u8, row: &mut [u8]) -> Result<(), String> {
        if row.len() != FACTS_LEN {
            return Err(format!("a facts row is {FACTS_LEN} bytes, got {}", row.len()));
        }
        let mut f = Facts::default();
        self.facts_of(i, seat, &mut f)?;
        write_facts_row(&f, resolved_mask(&self.slots[i].game), row)
    }

    /// The counters so far.
    pub fn stats(&self) -> Stats {
        self.stats
    }

    /// Plant a mutant of ATHENA.md §4.6 (G0a's M1-M5) in every game of the batch: the games in play now, and every
    /// game dealt later by `reset`, `reset_hands` or auto-reset. [`Mutant::None`] restores the reference's rules. It
    /// exists only with the `mutants` feature, so no default build (and no default Python build) can plant one. G0c
    /// plants M1 to show that the harness's live replay check catches a rules change.
    #[cfg(feature = "mutants")]
    pub fn set_mutant(&mut self, m: Mutant) {
        for slot in &mut self.slots {
            slot.mutant = m;
            slot.game.set_mutant(m);
        }
    }

    /// Plant a facts mutant of ATHENA.md §8.1 (M6 skips count exhaustion, M7 ignores the set-membership constraints)
    /// in every game's walk, from the next deal on (a walk is replayed from its game's start, so plant it before
    /// `reset`). Only with the `mutants` feature: G1a's check 4 plants each to show that check 1 catches it.
    #[cfg(feature = "mutants")]
    pub fn set_facts_mutant(&mut self, m: FactsMutant) {
        for slot in &mut self.slots {
            slot.gf.walk.set_mutant(m);
        }
    }

    /// Plant G1b's control: the bridge regime publishing the full reveal (every holder of a wrong declare, as at
    /// home) while its regime bit still says bridge, from the next deal on. Only with the `mutants` feature: G1b's
    /// check must see it differ from `replay-codec.ts`'s reduced encoding.
    #[cfg(feature = "mutants")]
    pub fn set_full_reveal_control(&mut self, on: bool) {
        for slot in &mut self.slots {
            slot.gf.reveal.set_full_reveal_control(on);
        }
    }

    /// Test hook for the information rules: re-deal game i's cards that its acting seat cannot see, uniformly among
    /// the seats that hold them, keeping every hand count. The permuted state has the same `seatView` for that seat.
    /// A draw that would change whether the turn-holder could ask is redrawn (up to 64 times), because that state is
    /// unreachable when another seat holds the option: the turn-holder's legal decline showed that it could ask.
    /// Returns false if the cards did not move (nothing hidden, or no admissible draw).
    pub fn debug_permute_hidden(&mut self, i: usize, rng_seed: u32) -> bool {
        let slot = &mut self.slots[i];
        let me = slot.game.acting_seat();
        let mut hidden = [0u8; NCARDS];
        let mut k = 0usize;
        for c in 0..NCARDS as u8 {
            let h = slot.game.owner(c);
            if h != NONE && h != me {
                hidden[k] = c;
                k += 1;
            }
        }
        if k < 2 {
            return false;
        }
        let could_ask = slot.game.turn_holder_can_ask();
        let mut rng = Mulberry32::new(rng_seed);
        for _ in 0..64 {
            let mut g = slot.game;
            for a in (1..k).rev() {
                let b = rng.rand_int(a as u32 + 1) as usize;
                g.fixture_swap_cards(hidden[a], hidden[b]);
            }
            if g.turn_holder_can_ask() == could_ask && g.owners() != slot.game.owners() {
                slot.game = g;
                return true;
            }
        }
        false
    }
}

/// One worker's contiguous share of the batch.
struct Chunk<'a> {
    id: usize,
    /// The batch index of its first game.
    offset: usize,
    slots: &'a mut [Slot],
    actions: &'a [i32],
    res: Option<StepOut<'a>>,
    obs: Option<ObsOut<'a>>,
}

/// One worker's share of a pass. Each game is stepped and then observed at once (one visit to its slot), except a
/// game that ended with auto-reset on: after the barrier every worker knows how many games ended before its chunk,
/// deals its ended games their game numbers in slot order, and observes them then.
fn work(ch: Chunk<'_>, pass: &Pass<'_>) -> Report {
    let Chunk {
        id,
        offset,
        slots,
        actions,
        res,
        mut obs,
    } = ch;
    let mut rep = Report::default();
    let mut ev = Events::new();
    let mut asks = AskList::new();
    let mut ended = 0u64;
    let auto = pass.prefix.is_some();

    let mut facts = Facts::default();
    let mut observe = |slot: &mut Slot, obs: &mut ObsOut<'_>, i: usize, rep: &mut Report| match slot.observe(
        obs.row(i),
        &mut asks,
        &mut facts,
    ) {
        Ok(backlog) => {
            rep.stats.observations += 1;
            rep.stats.max_backlog = rep.stats.max_backlog.max(backlog);
        }
        Err(e) => {
            rep.error.get_or_insert_with(|| format!("game {}: {e}", offset + i));
        }
    };

    match res {
        None => {
            if let Some(o) = obs.as_mut() {
                for (i, slot) in slots.iter_mut().enumerate() {
                    observe(slot, o, i, &mut rep);
                }
            }
        }
        Some(res) => {
            for (i, (slot, &code)) in slots.iter_mut().zip(actions).enumerate() {
                res.reward[2 * i] = 0.0;
                res.reward[2 * i + 1] = 0.0;
                res.terminated[i] = false;
                res.truncated[i] = false;
                if slot.ended == 0 {
                    match slot.step(code, &mut ev) {
                        Ok(false) => rep.stats.steps += 1,
                        Ok(true) => {
                            rep.stats.steps += 1;
                            rep.stats.ended_steps += u64::from(slot.steps);
                            if slot.ended == 1 {
                                res.terminated[i] = true;
                                rep.stats.finished += 1;
                                let w = slot.winner();
                                if w != TIE {
                                    res.reward[2 * i + w as usize] = 1.0;
                                    res.reward[2 * i + 1 - w as usize] = -1.0;
                                    rep.stats.wins[w as usize] += 1;
                                }
                            } else {
                                res.truncated[i] = true;
                                rep.stats.capped += 1;
                            }
                        }
                        Err(e) => {
                            rep.error.get_or_insert_with(|| format!("game {}: {e}", offset + i));
                        }
                    }
                }
                if auto && slot.ended != 0 {
                    // Dealt its next game, and observed, after the barrier. (A game left ended while auto-reset was
                    // off is dealt now too.)
                    ended += 1;
                    continue;
                }
                if let Some(o) = obs.as_mut() {
                    observe(slot, o, i, &mut rep);
                }
            }
        }
    }

    if let Some(prefix) = pass.prefix {
        pass.counts[id].store(ended, Ordering::Relaxed);
        if let Some(b) = pass.barrier {
            b.wait();
        }
        // This chunk's games take the numbers after every earlier chunk's: slot order, whatever the thread count.
        let first = pass.next_game + pass.counts[..id].iter().map(|c| c.load(Ordering::Relaxed)).sum::<u64>();
        let mut seed = String::with_capacity(prefix.len() + 20);
        let ended_slots = slots.iter_mut().enumerate().filter(|(_, s)| s.ended != 0);
        for (k, (i, slot)) in (first..).zip(ended_slots) {
            seed.clear();
            let _ = write!(seed, "{prefix}{k}");
            if let Err(e) = slot.deal(&seed, (k % 6) as u8, pass.regime.regime_of(&seed)) {
                rep.error.get_or_insert(e);
            }
            rep.stats.auto_resets += 1;
            if let Some(o) = obs.as_mut() {
                observe(slot, o, i, &mut rep);
            }
        }
    }
    rep
}

/* -------------------------------------------------------------------------------------------------- tests --- */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::SET_MASK;
    use crate::rules::{AWAIT_PASS, PLAYING};
    use crate::stub::{fuzz_policy_action, fuzz_policy_rng, mixed_stub_action, mixed_stub_rng};

    /// Owned buffers for `n` games.
    struct Bufs {
        seat: Vec<u8>,
        obs: Vec<u8>,
        legal: Vec<u8>,
        events: Vec<u8>,
        n_events: Vec<u8>,
        critic: Vec<u8>,
        facts: Option<Vec<u8>>,
        reward: Vec<f32>,
        term: Vec<bool>,
        trunc: Vec<bool>,
    }

    impl Bufs {
        fn new(n: usize) -> Bufs {
            Bufs {
                seat: vec![0; n],
                obs: vec![0; n * OBS_LEN],
                legal: vec![0; n * LEGAL_LEN],
                events: vec![0; n * MAX_EVENTS * EVENT_LEN],
                n_events: vec![0; n],
                critic: vec![0; n * CRITIC_LEN],
                facts: None,
                reward: vec![0.0; 2 * n],
                term: vec![false; n],
                trunc: vec![false; n],
            }
        }
        fn obs(&mut self) -> ObsOut<'_> {
            ObsOut {
                seat: &mut self.seat,
                obs: &mut self.obs,
                legal: &mut self.legal,
                events: &mut self.events,
                n_events: &mut self.n_events,
                critic: Some(&mut self.critic),
                facts: self.facts.as_deref_mut(),
            }
        }
        fn with_facts(n: usize) -> Bufs {
            let mut b = Bufs::new(n);
            b.facts = Some(vec![0; n * FACTS_LEN]);
            b
        }
        fn split(&mut self) -> (StepOut<'_>, ObsOut<'_>) {
            (
                StepOut {
                    reward: &mut self.reward,
                    terminated: &mut self.term,
                    truncated: &mut self.trunc,
                },
                ObsOut {
                    seat: &mut self.seat,
                    obs: &mut self.obs,
                    legal: &mut self.legal,
                    events: &mut self.events,
                    n_events: &mut self.n_events,
                    critic: Some(&mut self.critic),
                    facts: self.facts.as_deref_mut(),
                },
            )
        }
        /// Game i's actor bytes: seat, obs, legal, n_events and the delivered event rows.
        fn actor(&self, i: usize) -> Vec<u8> {
            let ne = self.n_events[i] as usize;
            let mut v = vec![self.seat[i], self.n_events[i]];
            v.extend_from_slice(&self.obs[i * OBS_LEN..(i + 1) * OBS_LEN]);
            v.extend_from_slice(&self.legal[i * LEGAL_LEN..(i + 1) * LEGAL_LEN]);
            let e0 = i * MAX_EVENTS * EVENT_LEN;
            v.extend_from_slice(&self.events[e0..e0 + ne * EVENT_LEN]);
            v
        }
    }

    fn seeds(prefix: &str, n: usize) -> (Vec<String>, Vec<u8>) {
        (
            (0..n).map(|i| format!("{prefix}{i}")).collect(),
            (0..n).map(|i| (i % 6) as u8).collect(),
        )
    }

    #[test]
    fn every_code_round_trips_for_every_seat() {
        assert_eq!(N_ACTIONS, 6726);
        assert_eq!(LEGAL_LEN, 174);
        assert_eq!(OBS_LEN, 95);
        assert_eq!(O_REGIME, 94);
        assert_eq!(FACTS_LEN, 278);
        assert_eq!(EVENT_LEN, 19);
        for seat in 0..6u8 {
            for code in 0..N_ACTIONS {
                let a = decode_action(seat, code).unwrap();
                assert_eq!(a.seat(), seat);
                assert_eq!(encode_action(&a), Some(code), "seat {seat} code {code}");
            }
            assert!(decode_action(seat, -1).is_none());
            assert!(decode_action(seat, N_ACTIONS).is_none());
            // No code for an ask of a teammate, a pass to an opponent, or a declare stating an opponent.
            assert!(encode_action(&Action::Ask {
                seat,
                target: (seat + 2) % 6,
                card: 0
            })
            .is_none());
            assert!(encode_action(&Action::Pass {
                seat,
                to: (seat + 1) % 6
            })
            .is_none());
            assert!(encode_action(&Action::Pass { seat, to: seat }).is_none());
            assert!(encode_action(&Action::Claim {
                seat,
                set: 0,
                assign: [seat, seat, seat, seat, seat, (seat + 3) % 6]
            })
            .is_none());
        }
        // The layout's examples (API.md): seat 4 asking seat 1 (rel 3, opponent 1) for 8H (card 32).
        assert_eq!(
            encode_action(&Action::Ask {
                seat: 4,
                target: 1,
                card: 32
            }),
            Some(54 + 32)
        );
        // Seat 1 declaring EIGHTS with cards 0-2 at itself, 3-4 at seat 3 (rel 2), 5 at seat 5 (rel 4).
        assert_eq!(
            encode_action(&Action::Claim {
                seat: 1,
                set: 8,
                assign: [1, 1, 1, 3, 3, 5]
            }),
            Some(A_DECLARE + 8 * 729 + 27 + 81 + 2 * 243)
        );
    }

    /// Drive `n` games with the Rust mixed stub (or the fuzz policy) through a VecEnv, observing every step, and call
    /// `check(env, bufs)` before each step.
    fn drive(
        n: usize,
        threads: usize,
        fuzz: bool,
        prefix: &str,
        mut check: impl FnMut(&mut VecEnv, &Bufs, usize),
    ) -> VecEnv {
        let mut env = VecEnv::new(n, threads, false).unwrap();
        let (sd, mut st) = seeds(prefix, n);
        let mut rngs: Vec<Mulberry32> = Vec::new();
        for (i, s) in sd.iter().enumerate() {
            if fuzz {
                let (r, start) = fuzz_policy_rng(s);
                st[i] = start;
                rngs.push(r);
            } else {
                rngs.push(mixed_stub_rng(s));
            }
        }
        env.reset(&sd, &st).unwrap();
        let mut b = Bufs::new(n);
        env.observe(b.obs()).unwrap();
        let mut codes = vec![0i32; n];
        let mut t = 0usize;
        while (0..n).any(|i| env.ended(i) == 0) {
            check(&mut env, &b, t);
            for i in 0..n {
                let g = env.game(i);
                let a = if env.ended(i) != 0 {
                    Action::Decline { seat: 0 }
                } else if fuzz {
                    fuzz_policy_action(g, &mut rngs[i])
                } else {
                    mixed_stub_action(g, g.acting_seat(), &mut rngs[i])
                };
                codes[i] = encode_action(&a).unwrap_or(-1);
            }
            let (r, o) = b.split();
            env.step(&codes, r, Some(o)).unwrap();
            t += 1;
        }
        env
    }

    /// The legal masks equal the reducer's verdict over the whole action space, at every step; no other seat has a
    /// legal action; and the decline bit equals its view-only form.
    #[test]
    fn masks_are_the_reducers_verdict_over_the_whole_action_space() {
        let mut checked = 0u64;
        let mut positives = [0u64; 4];
        for fuzz in [false, true] {
            drive(24, 3, fuzz, "athena-vecenv-mask-", |env, b, _| {
                for i in 0..env.len() {
                    if env.ended(i) != 0 {
                        continue;
                    }
                    let g = env.game(i);
                    let me = g.acting_seat();
                    assert_eq!(b.seat[i], me);
                    let legal = &b.legal[i * LEGAL_LEN..(i + 1) * LEGAL_LEN];
                    for code in 0..N_ACTIONS {
                        let ok = g.validate(&decode_action(me, code).unwrap()).is_ok();
                        let bit = if code < A_DECLINE {
                            legal[L_ASK + code as usize]
                        } else if code == A_DECLINE {
                            legal[L_DECLINE]
                        } else if code < A_DECLARE {
                            legal[L_PASS + (code - A_PASS) as usize]
                        } else {
                            legal[L_DECLARE + ((code - A_DECLARE) / N_ASSIGN) as usize]
                        };
                        assert_eq!(ok, bit == 1, "game {i} seat {me} code {code}");
                        if ok {
                            let kind = match code {
                                c if c < A_DECLINE => 0,
                                A_DECLINE => 1,
                                c if c < A_DECLARE => 2,
                                _ => 3,
                            };
                            positives[kind] += 1;
                        }
                        checked += 1;
                    }
                    // Every other seat: no code is legal (sampled: all asks, the decline, the passes, one
                    // assignment per set).
                    for other in (0..6u8).filter(|&s| s != me) {
                        for code in (0..A_DECLARE).chain((0..9).map(|s| A_DECLARE + s * N_ASSIGN)) {
                            assert!(g.validate(&decode_action(other, code).unwrap()).is_err());
                        }
                    }
                    // The decline bit is a function of the acting seat's view.
                    let from_view = match g.window() {
                        Some(w) if w.option == me => {
                            if me != g.turn() {
                                true
                            } else {
                                let h = g.hand(me);
                                let partial = SET_MASK.iter().any(|&m| h & m != 0 && h & m != m);
                                let opp = (0..3).any(|k| g.count(abs_seat(2 * k + 1, me)) > 0);
                                g.phase() == PLAYING && h != 0 && opp && partial
                            }
                        }
                        _ => false,
                    };
                    assert_eq!(
                        legal[L_DECLINE] == 1,
                        from_view,
                        "game {i}: the decline bit is not view-only"
                    );
                }
            });
        }
        assert!(checked > 5_000_000, "{checked}");
        assert!(positives.iter().all(|&p| p > 0), "{positives:?}");
    }

    /// The information rules: a state whose hidden cards are re-dealt gives the acting seat identical actor bytes,
    /// and a different critic buffer.
    #[test]
    fn hidden_cards_never_reach_the_actor_buffers() {
        for fuzz in [false, true] {
            let n = 24;
            let mut env = VecEnv::new(n, 2, false).unwrap();
            let (sd, mut st) = seeds("athena-vecenv-info-", n);
            let mut rngs: Vec<Mulberry32> = Vec::new();
            for (i, s) in sd.iter().enumerate() {
                if fuzz {
                    let (r, start) = fuzz_policy_rng(s);
                    st[i] = start;
                    rngs.push(r);
                } else {
                    rngs.push(mixed_stub_rng(s));
                }
            }
            env.reset(&sd, &st).unwrap();
            let (mut b1, mut b2) = (Bufs::new(n), Bufs::new(n));
            let (mut compared, mut critic_differs) = (0u64, 0u64);
            let mut codes = vec![0i32; n];
            for t in 0.. {
                // A twin of the batch whose every game has the cards its acting seat cannot see re-dealt, with the
                // same undelivered events: both observe, and the actor bytes must agree.
                let mut twin = env.clone();
                let moved: Vec<bool> = (0..n)
                    .map(|i| env.ended(i) == 0 && twin.debug_permute_hidden(i, (t * 1000 + i) as u32))
                    .collect();
                env.observe(b1.obs()).unwrap();
                twin.observe(b2.obs()).unwrap();
                for i in (0..n).filter(|&i| moved[i]) {
                    assert_eq!(b1.actor(i), b2.actor(i), "game {i} step {t}");
                    let c = i * CRITIC_LEN..(i + 1) * CRITIC_LEN;
                    if b1.critic[c.clone()] != b2.critic[c] {
                        critic_differs += 1;
                    }
                    compared += 1;
                }
                if (0..n).all(|i| env.ended(i) != 0) {
                    break;
                }
                for i in 0..n {
                    let g = env.game(i);
                    let a = if env.ended(i) != 0 {
                        Action::Decline { seat: 0 }
                    } else if fuzz {
                        fuzz_policy_action(g, &mut rngs[i])
                    } else {
                        mixed_stub_action(g, g.acting_seat(), &mut rngs[i])
                    };
                    codes[i] = encode_action(&a).unwrap_or(-1);
                }
                let (r, _) = b1.split();
                env.step(&codes, r, None).unwrap();
            }
            assert!(compared > if fuzz { 1_000 } else { 10_000 }, "{compared}");
            assert_eq!(critic_differs, compared, "the critic buffer shows the re-dealt cards");
        }
    }

    /// Event rows: each seat receives every logged event exactly once, in order, and no backlog exceeds 27.
    #[test]
    fn each_seat_sees_every_public_event_once_in_order() {
        for fuzz in [false, true] {
            let n = 60;
            let mut per_seat: Vec<[Vec<Vec<u8>>; 6]> = (0..n).map(|_| Default::default()).collect();
            let env = drive(n, 4, fuzz, "athena-vecenv-events-", |env, b, _| {
                for (i, seats) in per_seat.iter_mut().enumerate() {
                    if env.ended(i) != 0 {
                        continue;
                    }
                    let me = b.seat[i];
                    let e0 = i * MAX_EVENTS * EVENT_LEN;
                    for k in 0..b.n_events[i] as usize {
                        let mut row = b.events[e0 + k * EVENT_LEN..e0 + (k + 1) * EVENT_LEN].to_vec();
                        // Back to absolute seats, to compare across observers.
                        for f in [E_ACTOR, E_TARGET]
                            .into_iter()
                            .chain(E_ASSIGN..E_ASSIGN + 6)
                            .chain(E_HOLDERS..E_HOLDERS + 6)
                        {
                            if row[f] != NONE {
                                row[f] = abs_seat(row[f], me);
                            }
                        }
                        if row[E_RESULT] != NONE && row[E_RESULT] < 2 && team(me) == 1 {
                            row[E_RESULT] ^= 1;
                        }
                        seats[me as usize].push(row);
                    }
                }
            });
            assert!(env.stats().max_backlog <= 27, "{}", env.stats().max_backlog);
            for (i, seats) in per_seat.iter().enumerate() {
                // Every seat's sequence is a prefix of the longest one (the log up to that seat's last observation).
                let longest = seats.iter().max_by_key(|s| s.len()).unwrap();
                for s in seats.iter() {
                    assert_eq!(&longest[..s.len()], &s[..], "game {i}");
                }
                assert_eq!(longest[0][E_TYPE], 0, "game {i}: game_started first");
                // The start-seat rule: game_started names the first event's actor.
                assert_eq!(longest[0][E_ACTOR], longest[1][E_ACTOR], "game {i}");
            }
        }
    }

    /// The batch's results do not depend on the thread count, auto-reset included.
    #[test]
    fn threads_do_not_change_anything() {
        for facts in [false, true] {
            threads_do_not_change(facts);
        }
    }

    /// With `facts`, the facts buffer is on and every game's regime is drawn from its seed.
    fn threads_do_not_change(facts: bool) {
        let run = |threads: usize| {
            let n = 37;
            let mut env = VecEnv::with_facts(n, threads, true, facts).unwrap();
            env.set_auto_reset(Some("athena-vecenv-auto-".into()), n as u64);
            let (sd, st) = seeds("athena-vecenv-auto-", n);
            if facts {
                env.set_auto_regime(RegimeRule::Draw);
                let regimes: Vec<u8> = sd.iter().map(|s| drawn_regime(s)).collect();
                env.reset_regimes(&sd, &st, Some(&regimes)).unwrap();
            } else {
                env.reset(&sd, &st).unwrap();
            }
            let mut b = if facts { Bufs::with_facts(n) } else { Bufs::new(n) };
            env.observe(b.obs()).unwrap();
            let mut rngs: Vec<Mulberry32> = sd.iter().map(|s| mixed_stub_rng(s)).collect();
            let mut trace: Vec<u64> = Vec::new();
            let mut codes = vec![0i32; n];
            let (mut d, mut l, mut v) = (vec![0u64; n], vec![0u64; n], vec![0u64; n]);
            for _ in 0..3000 {
                for i in 0..n {
                    let g = env.game(i);
                    codes[i] = encode_action(&mixed_stub_action(g, g.acting_seat(), &mut rngs[i])).unwrap();
                }
                let (r, o) = b.split();
                env.step(&codes, r, Some(o)).unwrap();
                for (i, rng) in rngs.iter_mut().enumerate() {
                    if b.term[i] || b.trunc[i] {
                        *rng = mixed_stub_rng(env.seed(i));
                    }
                }
                env.digests(&mut d, &mut l, &mut v).unwrap();
                let mut h = ByteDigest::new();
                h.push(&b.obs).push(&b.legal).push(&b.n_events).push(&b.critic);
                if let Some(f) = b.facts.as_ref() {
                    h.push(f);
                }
                for (i, x) in d.iter().chain(&l).chain(&v).enumerate() {
                    if facts && i < n {
                        assert_eq!(env.regime(i), drawn_regime(env.seed(i)));
                    }
                    h.push(&x.to_le_bytes());
                }
                trace.push(h.value());
            }
            (trace, env.stats(), env.next_game())
        };
        let one = run(1);
        assert!(one.1.finished > 100, "{:?}", one.1);
        for t in [2, 3, 4] {
            assert_eq!(run(t), one, "threads {t}");
        }
    }

    /// replay-format.md §10.5 through the batch: H5 index 0, played by the mixed stub, with its d, l and v vectors.
    #[test]
    fn spec_vector_10_5_through_the_batch() {
        let mut env = VecEnv::new(1, 1, true).unwrap();
        env.reset(&["athena-p0-g0a-h5-0"], &[0]).unwrap();
        let mut rng = mixed_stub_rng("athena-p0-g0a-h5-0");
        let mut b = Bufs::new(1);
        let (mut d, mut l, mut v) = ([0u64], [0u64], [0u64]);
        let hex = |x: u64| crate::digest::hex_string(x);
        env.digests(&mut d, &mut l, &mut v).unwrap();
        assert_eq!(hex(d[0]), "e6810acfac4e1db1");
        let want_l = ["915460b5ef59eaa3", "0cf34926d51f8d94", "7f0617ea2284446b"];
        let want_v = ["2ff1e19e507ad997", "ada3994e0a85c874", "63ebecea07cff608"];
        let want_d = ["1b053de995b9134d", "e43a37e763f9ea92", "709752830ec82e48"];
        let mut t = 0usize;
        loop {
            env.digests(&mut d, &mut l, &mut v).unwrap();
            if t < 3 {
                assert_eq!(hex(l[0]), want_l[t]);
                assert_eq!(hex(v[0]), want_v[t]);
            }
            let g = env.game(0);
            let code = encode_action(&mixed_stub_action(g, g.acting_seat(), &mut rng)).unwrap();
            let (r, o) = b.split();
            env.step(&[code], r, Some(o)).unwrap();
            env.digests(&mut d, &mut l, &mut v).unwrap();
            if t < 3 {
                assert_eq!(hex(d[0]), want_d[t]);
            }
            t += 1;
            if b.term[0] {
                break;
            }
        }
        assert_eq!(t, 1124);
        assert_eq!(hex(d[0]), "71b3baa794a6f4de");
        assert_eq!(env.steps_of(0), 1124);
        assert_eq!(env.ended(0), 1);
    }

    /// The fixed part of the observation, spot-checked against the game's own state at every step.
    #[test]
    fn observation_fields_match_the_state() {
        drive(12, 2, true, "athena-vecenv-obs-", |env, b, _| {
            for i in 0..env.len() {
                if env.ended(i) != 0 {
                    continue;
                }
                let g = env.game(i);
                let me = g.acting_seat();
                let o = &b.obs[i * OBS_LEN..(i + 1) * OBS_LEN];
                for c in 0..54u8 {
                    assert_eq!(o[O_HAND + c as usize] == 1, g.owner(c) == me);
                }
                for r in 0..6u8 {
                    assert_eq!(o[O_COUNTS + r as usize], g.count(abs_seat(r, me)));
                }
                assert_eq!(o[O_PHASE], g.phase());
                assert_eq!(abs_seat(o[O_TURN], me), g.turn());
                assert_eq!(o[O_WINDOW] == 1, g.window().is_some());
                assert!(g.phase() != AWAIT_PASS || o[O_WINDOW] == 0);
                let s = g.score();
                assert_eq!(o[O_SCORE] + o[O_SCORE + 1], s[0] + s[1]);
                assert_eq!(o[O_SCORE], s[team(me) as usize]);
                for set in 0..9u8 {
                    let st = o[O_SETS + 3 * set as usize];
                    assert_eq!(st == SET_OPEN, !g.is_resolved(set));
                }
                let cr = &b.critic[i * CRITIC_LEN..(i + 1) * CRITIC_LEN];
                for c in 0..54u8 {
                    assert_eq!(cr[c as usize], rel_seat(g.owner(c), me));
                }
            }
        });
    }

    #[test]
    fn errors_are_loud() {
        assert!(VecEnv::new(0, 1, false).is_err());
        assert!(VecEnv::new(1, 0, false).is_err());
        let mut env = VecEnv::new(2, 1, false).unwrap();
        let mut b = Bufs::new(2);
        assert!(env.observe(b.obs()).is_err(), "observe before reset");
        env.reset(&["a", "b"], &[0, 1]).unwrap();
        assert!(env.reset(&["a"], &[0]).is_err());
        assert!(env.reset(&["a", "b"], &[0, 6]).is_err());
        // The first move is a window poll: an ask is refused, and the game is unchanged.
        let before = *env.game(0);
        let (r, _) = b.split();
        let e = env.step(&[0, A_DECLINE], r, None).unwrap_err();
        assert!(e.contains("DECLARE_WINDOW_OPEN"), "{e}");
        assert_eq!(*env.game(0), before);
        assert_eq!(env.steps_of(1), 1, "the other game was stepped");
        let (r, _) = b.split();
        assert!(env.step(&[N_ACTIONS, A_DECLINE], r, None).is_err());
        let mut small = Bufs::new(1);
        assert!(env.observe(small.obs()).is_err());
        // A backlog past MAX_EVENTS is an error: seat 5 of game 0 never observes while asks go by.
        let mut env = VecEnv::new(1, 1, false).unwrap();
        env.reset(&["athena-vecenv-backlog"], &[0]).unwrap();
        let mut rng = mixed_stub_rng("athena-vecenv-backlog");
        let mut b = Bufs::new(1);
        for _ in 0..400 {
            let g = env.game(0);
            let code = encode_action(&mixed_stub_action(g, g.acting_seat(), &mut rng)).unwrap();
            let (r, _) = b.split();
            env.step(&[code], r, None).unwrap();
        }
        let e = env.observe(b.obs()).unwrap_err();
        assert!(e.contains("MAX_EVENTS"), "{e}");
    }

    /// The ring's packed events unpack to the reducer's own events, against the state after them (a declare's
    /// details come back from the set block).
    #[test]
    fn packed_events_round_trip() {
        let mut kinds = [0u64; 6];
        for fuzz in [false, true] {
            for k in 0..300 {
                let seed = format!("athena-vecenv-pack-{k}");
                let (mut rng, start) = if fuzz {
                    fuzz_policy_rng(&seed)
                } else {
                    (mixed_stub_rng(&seed), (k % 6) as u8)
                };
                let mut g = Game::new(&seed, start).unwrap();
                let mut ev = Events::new();
                let mut reveal = Reveal::new(REGIME_HOME);
                let mut t = 0;
                while g.phase() != FINISHED && t < STEP_CAP {
                    let a = if fuzz {
                        fuzz_policy_action(&g, &mut rng)
                    } else {
                        mixed_stub_action(&g, g.acting_seat(), &mut rng)
                    };
                    g.apply(&a, &mut ev).unwrap();
                    for e in ev.as_slice() {
                        assert_eq!(reveal.publish(e), *e, "home publishes every event whole");
                        assert_eq!(unpack_event(pack_event(e), &g, &reveal), *e);
                        kinds[pack_event(e)[0] as usize] += 1;
                    }
                    t += 1;
                }
            }
        }
        let start = Event::GameStarted { start: 4 };
        assert_eq!(
            unpack_event(
                pack_event(&start),
                &Game::from_hands([0; 6], 0),
                &Reveal::new(REGIME_HOME)
            ),
            start
        );
        assert!(kinds[1..].iter().all(|&c| c > 0), "{kinds:?}");
    }

    #[test]
    fn reset_hands_builds_the_given_deal() {
        let mut env = VecEnv::new(1, 1, false).unwrap();
        let holders: Vec<u8> = (0..54u8).map(|c| c % 6).collect();
        env.reset_hands(&holders, &[3]).unwrap();
        for c in 0..54u8 {
            assert_eq!(env.game(0).owner(c), c % 6);
        }
        assert_eq!(env.game(0).turn(), 3);
        let mut bad = holders.clone();
        bad[7] = 6;
        assert!(env.reset_hands(&bad, &[3]).is_err());
        // Same seeds, same deal as Game::new.
        env.reset(&["athena-p0-g0a-h5-0"], &[0]).unwrap();
        assert_eq!(*env.game(0), Game::new("athena-p0-g0a-h5-0", 0).unwrap());
    }

    /// `set_mutant` (the `mutants` feature only; G0c's control) plants the mutant in every game of the batch. Two
    /// batches, one under M1, driven by the mixed stub from identical generators, play identical games until the
    /// reference takes the rule M1 changes (another seat's declare empties the turn-holder, whose teammate still
    /// holds cards: `awaitPass`); the chain digest d diverges at exactly that step and at no other, and a game dealt
    /// later by auto-reset carries the mutant too.
    #[cfg(feature = "mutants")]
    #[test]
    fn a_planted_m1_diverges_exactly_at_the_turn_pass_rule() {
        use crate::rules::Mutant;
        let n = 96;
        let (sd, st) = seeds("athena-vecenv-m1-", n);
        let mut env = [VecEnv::new(n, 2, true).unwrap(), VecEnv::new(n, 2, true).unwrap()];
        env[1].set_mutant(Mutant::M1);
        let mut rngs: Vec<Vec<Mulberry32>> = Vec::new();
        for e in env.iter_mut() {
            e.reset(&sd, &st).unwrap();
            rngs.push(sd.iter().map(|s| mixed_stub_rng(s)).collect());
        }
        let mut bufs = [Bufs::new(n), Bufs::new(n)];
        for (e, b) in env.iter_mut().zip(bufs.iter_mut()) {
            e.observe(b.obs()).unwrap();
        }
        let mut diverged = vec![false; n];
        let (mut dz, mut lz, mut vz) = (vec![0u64; n], vec![0u64; n], vec![0u64; n]);
        let mut d0 = vec![0u64; n];
        let mut caught = 0;
        // Every game's codes until it diverged (or ended), for the replay below.
        let mut played: Vec<Vec<i32>> = vec![Vec::new(); n];
        while (0..n).any(|i| env[0].ended(i) == 0 || env[1].ended(i) == 0) {
            let mut codes = [vec![0i32; n], vec![0i32; n]];
            let mut out_of_turn = vec![false; n];
            for k in 0..2 {
                for i in 0..n {
                    let g = env[k].game(i);
                    let a = if env[k].ended(i) != 0 {
                        Action::Decline { seat: 0 }
                    } else {
                        mixed_stub_action(g, g.acting_seat(), &mut rngs[k][i])
                    };
                    codes[k][i] = encode_action(&a).unwrap();
                    if k == 0 && !diverged[i] && env[0].ended(i) == 0 {
                        // Half of the rule M1 changes, read before the step: an out-of-turn declare.
                        out_of_turn[i] = matches!(a, Action::Claim { seat, .. } if seat != g.turn());
                    }
                }
            }
            for i in 0..n {
                if !diverged[i] {
                    assert_eq!(
                        codes[0][i], codes[1][i],
                        "game {i}: the same state and generator chose differently"
                    );
                    if env[0].ended(i) == 0 {
                        played[i].push(codes[0][i]);
                    }
                }
            }
            for k in 0..2 {
                let (r, o) = bufs[k].split();
                env[k].step(&codes[k], r, Some(o)).unwrap();
            }
            env[0].digests(&mut d0, &mut lz, &mut vz).unwrap();
            env[1].digests(&mut dz, &mut lz, &mut vz).unwrap();
            for i in 0..n {
                if diverged[i] {
                    continue;
                }
                // The other half, read after it: the declare emptied the turn-holder, whose teammate holds cards, so
                // the reference enters awaitPass.
                let m1_rule = out_of_turn[i] && env[0].game(i).phase() == AWAIT_PASS;
                let differs = d0[i] != dz[i];
                assert_eq!(
                    differs, m1_rule,
                    "game {i}: d differs {differs}, M1's rule taken {m1_rule}"
                );
                if differs {
                    assert_eq!(env[1].game(i).phase(), PLAYING);
                    diverged[i] = true;
                    caught += 1;
                }
            }
        }
        assert!(caught >= 3, "M1 diverged in only {caught} of {n} games");
        // A game dealt after set_mutant carries the mutant (reset, reset_hands and auto-reset all deal through
        // start_game): replaying a diverged game's codes into fresh batches, the M1 batch's d differs at the last
        // step only. And set_mutant(None) restores the reference's rules.
        let i = (0..n).find(|&i| diverged[i]).unwrap();
        let codes = &played[i];
        let mut fresh = [VecEnv::new(1, 1, true).unwrap(), VecEnv::new(1, 1, true).unwrap()];
        fresh[1].set_mutant(Mutant::M1);
        let mut one = [Bufs::new(1), Bufs::new(1)];
        let mut d = [[0u64; 1], [0u64; 1]];
        for e in fresh.iter_mut() {
            e.reset(&sd[i..=i], &st[i..=i]).unwrap();
        }
        for (t, &c) in codes.iter().enumerate() {
            for k in 0..2 {
                let (r, o) = one[k].split();
                fresh[k].step(&[c], r, Some(o)).unwrap();
                fresh[k].digests(&mut d[k], &mut lz[..1], &mut vz[..1]).unwrap();
            }
            assert_eq!(d[0][0] != d[1][0], t + 1 == codes.len(), "step {t} of {}", codes.len());
        }
        let mut again = VecEnv::new(1, 1, true).unwrap();
        again.set_mutant(Mutant::M1);
        again.set_mutant(Mutant::None);
        again.reset(&sd[..1], &st[..1]).unwrap();
        assert_eq!(*again.game(0), Game::new(&sd[0], st[0]).unwrap());
    }

    /// Game i's delivered event rows.
    fn rows_of(b: &Bufs, i: usize) -> Vec<&[u8]> {
        let e0 = i * MAX_EVENTS * EVENT_LEN;
        (0..b.n_events[i] as usize)
            .map(|k| &b.events[e0 + k * EVENT_LEN..e0 + (k + 1) * EVENT_LEN])
            .collect()
    }

    /// The start-seat rule (ATHENA.md §8.2): no event reaches any seat before the first event is logged; then every
    /// seat's first delivery opens with `game_started`, naming the first event's actor, followed by that event. It
    /// names the true start seat except when the first event is another seat's declare.
    #[test]
    fn the_start_seat_is_the_first_events_actor() {
        for fuzz in [false, true] {
            let n = 120;
            let mut firsts = 0u64;
            let mut wrong = vec![false; n];
            let env = drive(n, 2, fuzz, "athena-vecenv-start-", |env, b, t| {
                for (i, wrong_i) in wrong.iter_mut().enumerate() {
                    if env.ended(i) != 0 {
                        continue;
                    }
                    let rows = rows_of(b, i);
                    if t == 0 {
                        assert!(rows.is_empty(), "game {i}: an event before the first event");
                    }
                    let me = b.seat[i];
                    for (k, r) in rows.iter().enumerate() {
                        if r[E_TYPE] != 0 {
                            continue;
                        }
                        assert_eq!(k, 0, "game {i}: game_started not first");
                        let next = rows.get(1).expect("game_started arrives with the first event");
                        assert_eq!(r[E_ACTOR], next[E_ACTOR], "game {i}");
                        firsts += 1;
                        if abs_seat(r[E_ACTOR], me) != env.start_seat(i) {
                            assert_eq!(next[E_TYPE], 2, "game {i}: only a declare can precede the start seat");
                            *wrong_i = true;
                        }
                    }
                }
            });
            assert!(firsts >= 5 * n as u64, "{firsts}");
            assert!(env.stats().max_backlog <= 27);
            // The rule is exact unless the opening window's first event is another seat's declare.
            assert!(wrong.iter().filter(|&&w| w).count() < n / 2, "{wrong:?}");
        }
    }

    /// The regimes play the same game and differ only in what a wrong declare publishes. Two batches on the same
    /// seeds, one home and one bridge, driven by the same stub (which reads the state, never the observation): every
    /// obs byte is equal but the regime bit and a wrong declare's how byte (NONE at the bridge when its published
    /// holders cannot settle it); every event row is equal but a wrong declare's holders, of which the bridge shows a
    /// subset (the rest NONE); the legal masks and the chain and legal digests agree; the view digests and the facts
    /// differ somewhere.
    #[test]
    fn the_regimes_differ_only_in_what_a_wrong_declare_publishes() {
        let n = 48;
        let (sd, st) = seeds("athena-vecenv-regime-", n);
        let mut env = [
            VecEnv::with_facts(n, 2, true, true).unwrap(),
            VecEnv::with_facts(n, 2, true, true).unwrap(),
        ];
        env[0].reset_regimes(&sd, &st, Some(&vec![REGIME_HOME; n])).unwrap();
        env[1].reset_regimes(&sd, &st, Some(&vec![REGIME_BRIDGE; n])).unwrap();
        assert!((0..n).all(|i| env[0].regime(i) == REGIME_HOME && env[1].regime(i) == REGIME_BRIDGE));
        let mut rngs: Vec<Mulberry32> = sd.iter().map(|s| mixed_stub_rng(s)).collect();
        let mut bufs = [Bufs::with_facts(n), Bufs::with_facts(n)];
        for (e, b) in env.iter_mut().zip(bufs.iter_mut()) {
            e.observe(b.obs()).unwrap();
        }
        let mut dg = [
            [vec![0u64; n], vec![0u64; n], vec![0u64; n]],
            [vec![0u64; n], vec![0u64; n], vec![0u64; n]],
        ];
        let (mut how_hidden, mut holders_hidden, mut v_differ, mut facts_differ) = (0u64, 0u64, 0u64, 0u64);
        let mut codes = vec![0i32; n];
        while (0..n).any(|i| env[0].ended(i) == 0) {
            for i in 0..n {
                if env[0].ended(i) != 0 {
                    continue;
                }
                let (a, b) = (&bufs[0], &bufs[1]);
                assert_eq!(a.seat[i], b.seat[i]);
                let oa = &a.obs[i * OBS_LEN..(i + 1) * OBS_LEN];
                let ob = &b.obs[i * OBS_LEN..(i + 1) * OBS_LEN];
                assert_eq!((oa[O_REGIME], ob[O_REGIME]), (REGIME_HOME, REGIME_BRIDGE));
                for k in (0..O_REGIME).filter(|&k| oa[k] != ob[k]) {
                    assert!(k >= O_SETS && (k - O_SETS) % SET_FIELDS == 2, "game {i}: obs byte {k}");
                    assert_eq!(ob[k], NONE, "game {i}: obs byte {k}");
                    assert!(oa[k] == HOW_OPPONENT_HELD || oa[k] == HOW_MISASSIGNED);
                    how_hidden += 1;
                }
                let lr = i * LEGAL_LEN..(i + 1) * LEGAL_LEN;
                assert_eq!(a.legal[lr.clone()], b.legal[lr]);
                let (ra, rb) = (rows_of(a, i), rows_of(b, i));
                assert_eq!(ra.len(), rb.len());
                for (x, y) in ra.iter().zip(&rb) {
                    for f in (0..EVENT_LEN).filter(|&f| x[f] != y[f]) {
                        assert_eq!(x[E_TYPE], 2, "game {i}: event field {f}");
                        assert!((E_HOLDERS..E_HOLDERS + 6).contains(&f), "game {i}: event field {f}");
                        assert_eq!(y[f], NONE);
                        // A wrong declare: the result is not the declarer's team.
                        assert_ne!(
                            x[E_ACTOR] % 2 == 0,
                            x[E_RESULT] == 0,
                            "game {i}: a right declare hid a holder"
                        );
                        holders_hidden += 1;
                    }
                }
                let fr = i * FACTS_LEN..(i + 1) * FACTS_LEN;
                let fa = &a.facts.as_ref().unwrap()[fr.clone()];
                let fb = &b.facts.as_ref().unwrap()[fr];
                facts_differ += u64::from(fa != fb);
            }
            for (i, c) in codes.iter_mut().enumerate() {
                let g = env[0].game(i);
                let a = if env[0].ended(i) != 0 {
                    Action::Decline { seat: 0 }
                } else {
                    mixed_stub_action(g, g.acting_seat(), &mut rngs[i])
                };
                *c = encode_action(&a).unwrap();
            }
            for k in 0..2 {
                let (r, o) = bufs[k].split();
                env[k].step(&codes, r, Some(o)).unwrap();
                let [d, l, v] = &mut dg[k];
                env[k].digests(d, l, v).unwrap();
            }
            assert_eq!(dg[0][0], dg[1][0], "the chain digests");
            assert_eq!(dg[0][1], dg[1][1], "the legal digests");
            v_differ += (0..n).filter(|&i| dg[0][2][i] != dg[1][2][i]).count() as u64;
        }
        assert!(
            how_hidden > 0 && holders_hidden > 0 && v_differ > 0 && facts_differ > 0,
            "{how_hidden} {holders_hidden} {v_differ} {facts_differ}"
        );
    }

    /// The facts buffer: equal to `facts_row` for the acting seat; sound against the true deal (every card in play
    /// has its holder among its candidates, a card out of play has none, and each seat's unknown slots are its count
    /// less the cards certain at it); a set proved lost has a card with the other team; a rail is a right declare;
    /// the constraints are sorted and distinct; and turning facts on changes no other byte. Under both regimes.
    #[test]
    fn the_facts_buffer_is_sound_and_changes_nothing_else() {
        let (mut rails, mut cons, mut singles) = (0u64, 0u64, 0u64);
        for regime in [REGIME_HOME, REGIME_BRIDGE] {
            let n = 30;
            let (sd, st) = seeds("athena-vecenv-facts-", n);
            let mut env = [
                VecEnv::new(n, 2, false).unwrap(),
                VecEnv::with_facts(n, 3, false, true).unwrap(),
            ];
            assert!(!env[0].facts_on() && env[1].facts_on());
            for e in env.iter_mut() {
                e.reset_regimes(&sd, &st, Some(&vec![regime; n])).unwrap();
            }
            let mut probe = Bufs::with_facts(n);
            assert!(env[0].observe(probe.obs()).is_err(), "a facts buffer needs facts on");
            let mut bufs = [Bufs::new(n), Bufs::with_facts(n)];
            for (e, b) in env.iter_mut().zip(bufs.iter_mut()) {
                e.observe(b.obs()).unwrap();
            }
            let mut rngs: Vec<Mulberry32> = sd.iter().map(|s| mixed_stub_rng(s)).collect();
            let mut row = vec![0u8; FACTS_LEN];
            let mut codes = vec![0i32; n];
            while (0..n).any(|i| env[0].ended(i) == 0) {
                for i in 0..n {
                    if env[0].ended(i) != 0 {
                        continue;
                    }
                    assert_eq!(
                        bufs[0].actor(i),
                        bufs[1].actor(i),
                        "game {i}: facts on changed an actor byte"
                    );
                    let me = bufs[1].seat[i];
                    let f = &bufs[1].facts.as_ref().unwrap()[i * FACTS_LEN..(i + 1) * FACTS_LEN];
                    env[1].facts_row(i, me, &mut row).unwrap();
                    assert_eq!(f, &row[..], "game {i}");
                    let g = env[1].game(i);
                    let mut certain = [0usize; 6];
                    for c in 0..54u8 {
                        let m = f[F_CAND + c as usize];
                        let owner = g.owner(c);
                        if owner == NONE {
                            assert_eq!(m, 0, "game {i} card {c}");
                            continue;
                        }
                        assert_ne!(
                            m & (1 << rel_seat(owner, me)),
                            0,
                            "game {i} card {c}: the holder is excluded"
                        );
                        if m.count_ones() == 1 {
                            certain[m.trailing_zeros() as usize] += 1;
                            singles += u64::from(owner != me);
                        }
                    }
                    for r in 0..6u8 {
                        let count = g.count(abs_seat(r, me)) as usize;
                        assert_eq!(f[F_UNKNOWN + r as usize] as usize + certain[r as usize], count);
                    }
                    for b in 0..9u8 {
                        let (c, l) = (f[F_SET_CERTAIN + b as usize], f[F_SET_LOST + b as usize]);
                        if g.is_resolved(b) {
                            assert_eq!((c, l), (NONE, NONE));
                            continue;
                        }
                        assert!(c <= 6 && l <= 1);
                        if l == 1 {
                            let cards = &crate::cards::SET_CARDS[b as usize];
                            assert!(cards.iter().any(|&x| team(g.owner(x)) != team(me)), "game {i} set {b}");
                        }
                    }
                    if f[F_RAIL] != NONE {
                        rails += 1;
                        let b = f[F_RAIL];
                        for (j, &x) in crate::cards::SET_CARDS[b as usize].iter().enumerate() {
                            assert_eq!(
                                abs_seat(f[F_RAIL_ASSIGN + j], me),
                                g.owner(x),
                                "game {i}: the rail is wrong"
                            );
                        }
                    }
                    let nc = f[F_NCONS] as usize;
                    cons += u64::from(nc > 0);
                    assert!(f[F_CONS + CONS_FIELDS * nc..].iter().all(|&x| x == NONE));
                    for k in 0..nc {
                        let t = &f[F_CONS + CONS_FIELDS * k..F_CONS + CONS_FIELDS * (k + 1)];
                        assert!(t[0] < 6 && t[1] < 9 && t[2] != 0 && t[2] < 64);
                        if k > 0 {
                            let prev = &f[F_CONS + CONS_FIELDS * (k - 1)..F_CONS + CONS_FIELDS * k];
                            assert!(prev < t, "sorted and distinct");
                        }
                    }
                }
                for (i, c) in codes.iter_mut().enumerate() {
                    let g = env[0].game(i);
                    let a = if env[0].ended(i) != 0 {
                        Action::Decline { seat: 0 }
                    } else {
                        mixed_stub_action(g, g.acting_seat(), &mut rngs[i])
                    };
                    *c = encode_action(&a).unwrap();
                }
                for k in 0..2 {
                    let (r, o) = bufs[k].split();
                    env[k].step(&codes, r, Some(o)).unwrap();
                }
            }
        }
        assert!(rails > 0 && cons > 0 && singles > 0, "{rails} {cons} {singles}");
    }

    /// G1c's rule read off the facts row equals `facts::window_class` on the facts themselves, at every window
    /// offer, for k = 2, 3, 4, under the offer's own decline bit and its opposite; every class occurs. A compelled
    /// window with no rail and no live set is rare in play (57 of H1's 1,137,909 offers at k = 4), so the compelled
    /// class is reached through the opposite bit.
    #[test]
    fn the_window_rule_reads_the_same_off_the_row() {
        let n = 40;
        let mut seen = [0u64; 4];
        for fuzz in [false, true] {
            let (sd, mut st) = seeds("athena-vecenv-window-", n);
            let mut rngs: Vec<Mulberry32> = Vec::new();
            for (i, s) in sd.iter().enumerate() {
                if fuzz {
                    let (r, start) = fuzz_policy_rng(s);
                    st[i] = start;
                    rngs.push(r);
                } else {
                    rngs.push(mixed_stub_rng(s));
                }
            }
            window_rule_pass(n, &sd, &st, fuzz, &mut rngs, &mut seen);
        }
        assert!(seen.iter().all(|&x| x > 0), "{seen:?}");
    }

    fn window_rule_pass(n: usize, sd: &[String], st: &[u8], fuzz: bool, rngs: &mut [Mulberry32], seen: &mut [u64; 4]) {
        let mut env = VecEnv::with_facts(n, 2, false, true).unwrap();
        env.reset(sd, st).unwrap();
        let mut b = Bufs::with_facts(n);
        env.observe(b.obs()).unwrap();
        let mut f = Facts::default();
        let mut codes = vec![0i32; n];
        while (0..n).any(|i| env.ended(i) == 0) {
            for i in 0..n {
                if env.ended(i) != 0 || b.obs[i * OBS_LEN + O_WINDOW] != 1 {
                    continue;
                }
                let me = b.seat[i];
                env.facts_of(i, me, &mut f).unwrap();
                let row = &b.facts.as_ref().unwrap()[i * FACTS_LEN..(i + 1) * FACTS_LEN];
                let decline = b.legal[i * LEGAL_LEN + L_DECLINE] == 1;
                for k in 2..=4u8 {
                    for d in [decline, !decline] {
                        let want = crate::facts::window_class(&f, resolved_mask(env.game(i)), k, d);
                        assert_eq!(window_class_of_row(row, k, d), want, "game {i} k {k} decline {d}");
                        seen[want.code() as usize] += 1;
                    }
                }
            }
            for (i, c) in codes.iter_mut().enumerate() {
                let g = env.game(i);
                let a = if env.ended(i) != 0 {
                    Action::Decline { seat: 0 }
                } else if fuzz {
                    fuzz_policy_action(g, &mut rngs[i])
                } else {
                    mixed_stub_action(g, g.acting_seat(), &mut rngs[i])
                };
                *c = encode_action(&a).unwrap_or(-1);
            }
            let (r, o) = b.split();
            env.step(&codes, r, Some(o)).unwrap();
        }
    }

    /// The drawn regime is the seed's, about half bridge; a regime that is neither is an error.
    #[test]
    fn the_drawn_regime_is_about_half() {
        let bridge = (0..10_000)
            .filter(|k| drawn_regime(&format!("athena-p2-{k}")) == REGIME_BRIDGE)
            .count();
        assert!((4_800..5_200).contains(&bridge), "{bridge}");
        assert_eq!(RegimeRule::parse("draw"), Some(RegimeRule::Draw));
        assert_eq!(RegimeRule::Bridge.regime_of("x"), REGIME_BRIDGE);
        let mut env = VecEnv::new(2, 1, false).unwrap();
        assert!(env.reset_regimes(&["a", "b"], &[0, 1], Some(&[0, 2])).is_err());
    }
}
