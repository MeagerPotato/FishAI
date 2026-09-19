//! The batch environment behind ATHENA's Python API (ATHENA.md §4.5 item 2; `athena-env/API.md` documents every
//! layout below).
//!
//! - **The action encoding** ([`decode_action`], [`encode_action`]): one integer per decision, relative to the acting
//!   seat. Asks are (opponent 0-2, card 0-53), declares are (set 0-8, a teammate for each of the six cards), then the
//!   decline and the two passes.
//! - **The legal masks** ([`LEGAL_LEN`] bytes a game) by the reducer's own verdict: [`Game::legal_asks`] for the asks
//!   (gated by G0a's legal-move digests) and [`Game::validate`] for every declare set, the decline and both passes.
//!   `legalActionsSummary`'s over-reported `claim` is not copied.
//! - **The provisional observation** (P1 finalises it): the acting seat's hand, the public counts, phase, turn,
//!   window, score and set outcomes ([`OBS_LEN`] bytes), the public events since that seat's last observation as
//!   fixed-width rows ([`EVENT_LEN`] bytes each), and, in a separate buffer for the critic only, the true deal.
//! - **[`VecEnv`]**: a batch of games stepped over `std::thread::scope` workers, with deterministic auto-reset.
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
//! step once each slot's seed string has grown to its longest seed.

use crate::cards::{is_seat, team, NCARDS, NONE, NSEATS, NSETS};
use crate::codec::{
    encode_action as codec_action, encode_event, encode_events, encode_legal, encode_state, encode_view, FORMAT,
    STATE_LEN, STEP_CAP,
};
use crate::digest::{digest, ByteDigest};
use crate::rng::Mulberry32;
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
/// Bytes a game in the obs buffer.
pub const OBS_LEN: usize = O_SETS + NSETS * SET_FIELDS;

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
}

impl Slot {
    fn empty(track: bool) -> Slot {
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
        }
    }

    #[inline]
    fn log_event(&mut self, e: Event) {
        self.ring[self.logged as usize % RING] = pack_event(&e);
        self.logged += 1;
    }

    /// Start a game on `game` (a deal or a hand-built position) labelled `seed` for the digest header.
    fn start_game(&mut self, game: Game, seed: &str, start: u8) {
        self.game = game;
        self.steps = 0;
        self.ended = 0;
        self.logged = 0;
        self.seen = [0; NSEATS];
        self.seed.clear();
        self.seed.push_str(seed);
        self.start = start;
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

    /// Deal `seed` at `start` (`newGame`).
    fn deal(&mut self, seed: &str, start: u8) -> Result<(), String> {
        let g = Game::new(seed, start).map_err(|e| e.to_string())?;
        self.start_game(g, seed, start);
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
        for &e in ev.as_slice() {
            self.log_event(e);
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
            for e in ev.as_slice() {
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

    /// Fill one game's observation for its acting seat. Returns the number of events delivered.
    fn observe(&mut self, o: RowOut<'_>, asks: &mut AskList) -> Result<u32, String> {
        let g = &self.game;
        let me = g.acting_seat();
        *o.seat = me;
        let my_team = team(me);

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
            let ct = team(claimer);
            obs[o3 + 2] = if outcome == ct {
                HOW_RIGHT
            } else if g.set_holders(b).iter().any(|&h| team(h) != ct) {
                HOW_OPPONENT_HELD
            } else {
                HOW_MISASSIGNED
            };
        }

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

        // The events since this seat's last observation.
        let from = self.seen[me as usize];
        let pending = self.logged - from;
        if pending as usize > MAX_EVENTS {
            return Err(format!(
                "seat {me} has {pending} undelivered events, above MAX_EVENTS = {MAX_EVENTS}: observe after every step"
            ));
        }
        for i in 0..pending {
            let e = unpack_event(self.ring[(from + i) as usize % RING], g);
            let row = &mut o.events[i as usize * EVENT_LEN..(i as usize + 1) * EVENT_LEN];
            encode_event_row(&e, me, row);
        }
        self.seen[me as usize] = self.logged;
        *o.n_events = pending as u8;

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

/// The event a packed entry stands for, its declare rebuilt from `g`'s set block.
fn unpack_event(p: [u8; 4], g: &Game) -> Event {
    match p[0] {
        0 => Event::GameStarted { start: p[1] },
        1 => Event::Ask {
            asker: p[1],
            target: p[2],
            card: p[3] & 0x7F,
            hit: p[3] >> 7 == 1,
        },
        2 => Event::Claim {
            claimer: g.set_claimer(p[1]),
            set: p[1],
            assign: g.set_assignments(p[1]),
            holders: g.set_holders(p[1]),
            outcome: g.set_outcome(p[1]),
        },
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
}

impl<'a> ObsOut<'a> {
    fn check(&self, n: usize) -> Result<(), String> {
        let ok = self.seat.len() == n
            && self.obs.len() == n * OBS_LEN
            && self.legal.len() == n * LEGAL_LEN
            && self.events.len() == n * MAX_EVENTS * EVENT_LEN
            && self.n_events.len() == n
            && self.critic.as_ref().map_or(true, |c| c.len() == n * CRITIC_LEN);
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
        let (c0, c1) = match self.critic {
            Some(c) => {
                let (a, b) = c.split_at_mut(rows * CRITIC_LEN);
                (Some(a), Some(b))
            }
            None => (None, None),
        };
        (
            ObsOut {
                seat: s0,
                obs: o0,
                legal: l0,
                events: e0,
                n_events: n0,
                critic: c0,
            },
            ObsOut {
                seat: s1,
                obs: o1,
                legal: l1,
                events: e1,
                n_events: n1,
                critic: c1,
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

/// A batch of `n` us54 games stepped together.
#[derive(Clone, Debug)]
pub struct VecEnv {
    slots: Vec<Slot>,
    threads: usize,
    auto_reset: Option<String>,
    next_game: u64,
    ready: bool,
    stats: Stats,
}

/// The shared context of one parallel pass.
struct Pass<'a> {
    prefix: Option<&'a str>,
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
        if n == 0 {
            return Err("a batch needs at least one game".into());
        }
        if threads == 0 {
            return Err("threads must be at least 1".into());
        }
        Ok(VecEnv {
            slots: vec![Slot::empty(track_digests); n],
            threads,
            auto_reset: None,
            next_game: 0,
            ready: false,
            stats: Stats::default(),
        })
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

    /// The next auto-reset game number.
    pub fn next_game(&self) -> u64 {
        self.next_game
    }

    /// Deal every game: `seeds[i]` at `starts[i]`, exactly as the reference's `newGame` (the same seed string deals
    /// the same hands as `lib/engine/`).
    pub fn reset<S: AsRef<str>>(&mut self, seeds: &[S], starts: &[u8]) -> Result<(), String> {
        let n = self.slots.len();
        if seeds.len() != n || starts.len() != n {
            return Err(format!(
                "reset needs {n} seeds and {n} start seats, got {} and {}",
                seeds.len(),
                starts.len()
            ));
        }
        for (i, (slot, (seed, &start))) in self.slots.iter_mut().zip(seeds.iter().zip(starts)).enumerate() {
            slot.deal(seed.as_ref(), start).map_err(|e| format!("game {i}: {e}"))?;
        }
        self.ready = true;
        Ok(())
    }

    /// Start every game from a given deal: `holders[i * 54 + c]` is the seat holding card c in game i (every card
    /// in play; the hands need not be nine cards each), with the turn and the window at `starts[i]`. For tests and
    /// hand-built positions; its digest header's seed is `deal`.
    pub fn reset_hands(&mut self, holders: &[u8], starts: &[u8]) -> Result<(), String> {
        let n = self.slots.len();
        if holders.len() != n * NCARDS || starts.len() != n {
            return Err(format!("reset_hands needs {n} x 54 holders and {n} start seats"));
        }
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
            slot.start_game(Game::from_hands(hands, start), "deal", start);
        }
        self.ready = true;
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
        out.check(self.slots.len())?;
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
            o.check(n)?;
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
            let k = encode_view(&s.game, acting, t.log_len, &t.log.hex(), &mut buf);
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

    /// The counters so far.
    pub fn stats(&self) -> Stats {
        self.stats
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

    let mut observe =
        |slot: &mut Slot, obs: &mut ObsOut<'_>, i: usize, rep: &mut Report| match slot.observe(obs.row(i), &mut asks) {
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
            if let Err(e) = slot.deal(&seed, (k % 6) as u8) {
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
            }
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
        assert_eq!(OBS_LEN, 94);
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
            }
        }
    }

    /// The batch's results do not depend on the thread count, auto-reset included.
    #[test]
    fn threads_do_not_change_anything() {
        let run = |threads: usize| {
            let n = 37;
            let mut env = VecEnv::new(n, threads, true).unwrap();
            env.set_auto_reset(Some("athena-vecenv-auto-".into()), n as u64);
            let (sd, st) = seeds("athena-vecenv-auto-", n);
            env.reset(&sd, &st).unwrap();
            let mut b = Bufs::new(n);
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
                for x in d.iter().chain(&l).chain(&v) {
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
                let mut t = 0;
                while g.phase() != FINISHED && t < STEP_CAP {
                    let a = if fuzz {
                        fuzz_policy_action(&g, &mut rng)
                    } else {
                        mixed_stub_action(&g, g.acting_seat(), &mut rng)
                    };
                    g.apply(&a, &mut ev).unwrap();
                    for e in ev.as_slice() {
                        assert_eq!(unpack_event(pack_event(e), &g), *e);
                        kinds[pack_event(e)[0] as usize] += 1;
                    }
                    t += 1;
                }
            }
        }
        let start = Event::GameStarted { start: 4 };
        assert_eq!(unpack_event(pack_event(&start), &Game::from_hands([0; 6], 0)), start);
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
}
