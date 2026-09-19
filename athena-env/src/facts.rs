//! The rules-derived facts of a seat's view (ATHENA.md §1, §8.1 G1a): a port of `buildKnowledge(view, options)` in
//! `lib/engine/bots/knowledge.ts` under Monet v1.0's knowledge options (`SKILL_PRESETS.hard`: the whole log, the
//! set-membership constraints on), with the marginal left out.
//!
//! The reference rebuilds its knowledge from three public inputs on every call: the public log, the public hand
//! counts and the viewer's own hand. Every card's hidden quantity is WHO IT WAS DEALT TO, because every movement after
//! the deal is public. Per card it keeps:
//!
//! - `pos`: the card's public location, ORIGINAL (never moved since the deal), a seat (a hit moved it there), or GONE
//!   (its set resolved);
//! - `cand`: the deal-time holder's candidate seats, a six-bit mask;
//! - `xfix`: the deal-time holder once fixed.
//!
//! This module is that code, rule for rule and loop for loop, in the reference's order, so that its results are the
//! reference's by construction and the gate (G1a) checks the construction:
//!
//! - [`Walk`] is the walk over the log (`ingest`, with `exhaustCounts` and `addAskConstraint`). It does not depend on
//!   the viewer, so a game keeps ONE walk and extends it event by event: the walk over the first k events of a log is
//!   the walk of any view whose log is those k events.
//! - [`Walk::finish`] is `finishKnowledge` and `materialise`: the resolved-set safety net, the viewer's own hand, the
//!   fixpoint `propagate` over the current counts, and the materialised facts ([`Facts`]).
//! - A declare's holder that the view does not show (the bridge's reduced reveal, `replay-format.md` §12.4) is carried
//!   as [`NONE`], which is the reference's `actualHolders[c] === undefined`.
//!
//! On top of the facts: the rules-certain declare ([`rail`], `lib/athena/policy.ts`'s `railPlan`), the per-set facts
//! for the observer's team ([`set_status`]: cards certain on the team, and whether the facts prove the set lost, as
//! `setLost` reads them), and G1c's live-set window rule ([`window_class`], ATHENA.md §8.2). The regimes of G1b
//! ([`Reveal`]) decide what a declare publishes, and so what the walk sees.
//!
//! Pure computation, like the rest of the crate: no allocation once a [`Facts`] and a walk have grown their constraint
//! lists to their longest.

use crate::cards::{team, NCARDS, NONE, NSEATS, NSETS, SET_CARDS, SET_MASK, SET_OF_CARD};
use crate::rules::{Event, Game};

/// `pos`: the card has not moved since the deal.
pub const POS_ORIGINAL: u8 = 6;
/// `pos`: the card's set has resolved.
pub const POS_GONE: u8 = 7;
/// Every seat: the candidate mask a card starts with.
pub const FULL_MASK: u8 = 0b11_1111;
/// The deal-time hand size (us54: nine).
pub const HAND_SIZE: i32 = 9;
/// `propagate`'s round cap: two rounds a card.
pub const MAX_ROUNDS: usize = 2 * NCARDS;
/// Team 0's seats, and team 1's, as seat masks.
const TEAM_SEATS: [u8; 2] = [0b01_0101, 0b10_1010];

/// A planted fault of G1a's check 4 (ATHENA.md §8.1). Its code paths run only with the `mutants` feature.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum FactsMutant {
    /// `buildKnowledge` as it is.
    #[default]
    None,
    /// M6: skip count exhaustion: the walk's historical exhaustion, and the fixpoint's "a seat whose count equals its
    /// certain cards holds nothing else". Count forcing (a seat whose free slots equal its possible cards holds them
    /// all) is kept.
    M6,
    /// M7: ignore the set-membership constraints (`useConstraints: false`): none is recorded, so none is forced.
    M7,
}

impl FactsMutant {
    /// `none`, `M6` or `M7`.
    pub fn parse(s: &str) -> Option<FactsMutant> {
        match s.to_ascii_uppercase().as_str() {
            "NONE" => Some(FactsMutant::None),
            "M6" => Some(FactsMutant::M6),
            "M7" => Some(FactsMutant::M7),
            _ => None,
        }
    }
}

/// One set-membership constraint: `seat` held at least one of `cards` at the deal. The cards all lie in one set, and
/// iterating the mask's bits ascending is the reference's card order.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Cons {
    /// The seat the constraint is about (the asker).
    pub seat: u8,
    /// The cards, as a mask.
    pub cards: u64,
}

impl Cons {
    /// The set its cards lie in, and their positions within it as a six-bit mask (bit j = the set's j-th card).
    pub fn set_and_mask(&self) -> (u8, u8) {
        let first = (self.cards.trailing_zeros() as usize).min(NCARDS - 1);
        let set = SET_OF_CARD[first];
        let mut m = 0u8;
        for (j, &c) in SET_CARDS[set as usize].iter().enumerate() {
            if self.cards & (1u64 << c) != 0 {
                m |= 1 << j;
            }
        }
        (set, m)
    }
}

#[inline(always)]
const fn sbit(s: u8) -> u8 {
    1 << s
}

/// `soleSeat`: the one seat of a singleton mask (0 for anything else, as the reference returns).
#[inline(always)]
fn sole_seat(m: u8) -> u8 {
    for s in 0..NSEATS as u8 {
        if m == 1 << s {
            return s;
        }
    }
    0
}

/// How a card's deal holder was fixed: for the coverage count "a singleton reached only by propagation".
const SRC_DIRECT: u8 = 1;
const SRC_INFERRED: u8 = 2;

/// The working arrays of `knowledge.ts`'s `Work`, without the constraints.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Cards {
    pos: [u8; NCARDS],
    cand: [u8; NCARDS],
    xfix: [u8; NCARDS],
    /// Coverage only: SRC_DIRECT or SRC_INFERRED once `xfix` is set (0 before).
    src: [u8; NCARDS],
}

impl Cards {
    const fn new() -> Cards {
        Cards {
            pos: [POS_ORIGINAL; NCARDS],
            cand: [FULL_MASK; NCARDS],
            xfix: [NONE; NCARDS],
            src: [0; NCARDS],
        }
    }

    /// `fixX`: fix a card's deal holder, keeping the first derivation.
    #[inline]
    fn fix(&mut self, ci: usize, s: u8, src: u8) {
        if self.xfix[ci] != NONE {
            return;
        }
        self.xfix[ci] = s;
        self.cand[ci] = sbit(s);
        self.src[ci] = src;
    }

    /// `clearCand`: eliminate a deal candidate, never emptying a mask; a lone survivor is fixed. Returns whether the
    /// mask changed (coverage only).
    #[inline]
    fn clear(&mut self, ci: usize, s: u8) -> bool {
        if self.xfix[ci] != NONE {
            return false;
        }
        let next = self.cand[ci] & !sbit(s);
        if next == 0 || next == self.cand[ci] {
            return false;
        }
        self.cand[ci] = next;
        if next.count_ones() == 1 {
            self.fix(ci, sole_seat(next), SRC_INFERRED);
        }
        true
    }

    /// Cards certainly located at seat `s`: publicly there, or unmoved and dealt there.
    #[inline]
    fn certain_at(&self, s: u8) -> i32 {
        let mut n = 0;
        for ci in 0..NCARDS {
            if self.pos[ci] == s || (self.pos[ci] == POS_ORIGINAL && self.xfix[ci] == s) {
                n += 1;
            }
        }
        n
    }
}

/// The walk over a public log (`ingest`, event by event), independent of the viewer. One per game.
#[derive(Clone, Debug)]
pub struct Walk {
    w: Cards,
    /// The live constraints, in the order the walk recorded them (`Work.constraints`).
    cons: Vec<Cons>,
    /// The running hand counts replayed from the log, from the deal's nine each.
    running: [i32; NSEATS],
    /// Coverage only: has count exhaustion (historical) ever eliminated a candidate on this walk?
    exhausted: bool,
    /// Events walked.
    events: u32,
    mutant: FactsMutant,
}

impl Default for Walk {
    fn default() -> Self {
        Self::new()
    }
}

impl Walk {
    /// The walk before any event: every card unmoved, every seat a candidate, nine cards a seat.
    pub fn new() -> Walk {
        Walk {
            w: Cards::new(),
            cons: Vec::new(),
            running: [HAND_SIZE; NSEATS],
            exhausted: false,
            events: 0,
            mutant: FactsMutant::None,
        }
    }

    /// Back to the walk before any event, keeping the constraint list's capacity and the planted mutant.
    pub fn reset(&mut self) {
        self.w = Cards::new();
        self.cons.clear();
        self.running = [HAND_SIZE; NSEATS];
        self.exhausted = false;
        self.events = 0;
    }

    /// Plant a mutant (only with the `mutants` feature). It stays through [`Walk::reset`].
    pub fn set_mutant(&mut self, m: FactsMutant) {
        #[cfg(not(feature = "mutants"))]
        assert!(m == FactsMutant::None, "a facts mutant needs the `mutants` feature");
        self.mutant = m;
    }

    #[inline(always)]
    fn is_mutant(&self, _m: FactsMutant) -> bool {
        #[cfg(feature = "mutants")]
        {
            self.mutant == _m
        }
        #[cfg(not(feature = "mutants"))]
        {
            false
        }
    }

    /// Events walked so far.
    pub fn events(&self) -> u32 {
        self.events
    }

    /// The constraints recorded so far, unpruned (the walk prunes only at insertion).
    pub fn constraints(&self) -> &[Cons] {
        &self.cons
    }

    /// `exhaustCounts`: for each seat whose replayed count equals its certainly-located cards, every unfixed unmoved
    /// card was never with that seat.
    fn exhaust_counts(&mut self) {
        if self.is_mutant(FactsMutant::M6) {
            return;
        }
        for s in 0..NSEATS as u8 {
            let certain = self.w.certain_at(s);
            if self.running[s as usize] == certain {
                for ci in 0..NCARDS {
                    if self.w.pos[ci] == POS_ORIGINAL && self.w.xfix[ci] == NONE && self.w.clear(ci, s) {
                        self.exhausted = true;
                    }
                }
            }
        }
    }

    /// `addAskConstraint(asker, book, askedCi, includeAsked = false)`: the asker held at least one card of the set,
    /// the asked card excepted, at this point of the walk, in deal variables.
    fn add_ask_constraint(&mut self, asker: u8, set: u8, asked: usize) {
        let mut alive = 0u64;
        let mut n = 0;
        let mut only = 0usize;
        for &c in &SET_CARDS[set as usize] {
            let ci = c as usize;
            if ci == asked {
                continue;
            }
            if self.w.pos[ci] == asker {
                return; // publicly with the asker now: satisfied
            }
            if self.w.pos[ci] != POS_ORIGINAL {
                continue; // elsewhere or gone: a dead disjunct
            }
            if self.w.xfix[ci] == asker {
                return; // dealt to the asker and unmoved: satisfied
            }
            if self.w.xfix[ci] != NONE {
                continue; // dealt elsewhere
            }
            if self.w.cand[ci] & sbit(asker) == 0 {
                continue; // the asker is already excluded
            }
            alive |= 1u64 << ci;
            n += 1;
            only = ci;
        }
        if n == 0 {
            return;
        }
        if n == 1 {
            self.w.fix(only, asker, SRC_INFERRED);
            return;
        }
        self.cons.push(Cons {
            seat: asker,
            cards: alive,
        });
    }

    /// `ingest`: walk one public event. A declare's holder given as [`NONE`] is one the view does not show.
    pub fn ingest(&mut self, ev: &Event) {
        self.events += 1;
        let use_constraints = !self.is_mutant(FactsMutant::M7);
        match *ev {
            Event::Ask {
                asker,
                target,
                card,
                hit,
            } => {
                let ci = card as usize;
                if ci >= NCARDS || self.w.pos[ci] == POS_GONE {
                    return;
                }
                let set = SET_OF_CARD[ci];
                if hit {
                    if self.w.pos[ci] == POS_ORIGINAL {
                        self.w.fix(ci, target, SRC_DIRECT);
                    }
                    if use_constraints {
                        self.add_ask_constraint(asker, set, ci);
                    }
                    self.w.pos[ci] = asker;
                    self.running[target as usize] -= 1;
                    self.running[asker as usize] += 1;
                    self.exhaust_counts();
                } else {
                    if self.w.pos[ci] == POS_ORIGINAL {
                        self.w.clear(ci, asker);
                        self.w.clear(ci, target);
                    }
                    if use_constraints {
                        self.add_ask_constraint(asker, set, ci);
                    }
                }
            }
            Event::Claim { set, holders, .. } => {
                for (j, &c) in SET_CARDS[set as usize].iter().enumerate() {
                    let ci = c as usize;
                    let actual = holders[j];
                    let known = actual < NSEATS as u8;
                    if self.w.pos[ci] == POS_ORIGINAL && known {
                        self.w.fix(ci, actual, SRC_DIRECT);
                    }
                    if self.w.pos[ci] != POS_GONE && known {
                        self.running[actual as usize] -= 1;
                    }
                    self.w.pos[ci] = POS_GONE;
                }
                self.exhaust_counts();
            }
            Event::PlayerOut { .. } => self.exhaust_counts(),
            // game_started, pass and game_over carry no card facts; a decline is never logged.
            _ => {}
        }
    }

    /// `finishKnowledge` then `materialise`, for the view of `seat` whose hand is `hand`, whose public counts are
    /// `counts` and whose resolved sets are the bits of `resolved`, over this walk's events (which must be the view's
    /// whole log). Writes the facts into `out`, reusing its constraint list.
    pub fn finish(&self, seat: u8, hand: u64, counts: &[u8; NSEATS], resolved: u16, out: &mut Facts) {
        let mut w = self.w;
        out.cons.clear();
        out.cons.extend_from_slice(&self.cons);

        // markResolvedGone: resolved sets are public table state (a no-op after a whole log's declares).
        for (b, cards) in SET_CARDS.iter().enumerate() {
            if resolved & (1 << b) != 0 {
                for &c in cards {
                    w.pos[c as usize] = POS_GONE;
                }
            }
        }

        // The own hand: fully known. Held live cards are the viewer's; every other unmoved card never was.
        let me = seat;
        for ci in 0..NCARDS {
            if w.pos[ci] == POS_GONE {
                continue;
            }
            if hand & (1u64 << ci) != 0 {
                if w.pos[ci] == POS_ORIGINAL {
                    if w.xfix[ci] != me {
                        w.xfix[ci] = me;
                        w.cand[ci] = sbit(me);
                        w.src[ci] = SRC_DIRECT;
                    }
                } else {
                    w.pos[ci] = me; // the hand over an inconsistent log
                }
            } else {
                if w.pos[ci] == me {
                    w.pos[ci] = POS_ORIGINAL; // an inconsistent log: forget
                }
                if w.pos[ci] == POS_ORIGINAL {
                    if w.xfix[ci] == me {
                        w.xfix[ci] = NONE;
                        w.cand[ci] = FULL_MASK & !sbit(me);
                        w.src[ci] = 0;
                    } else {
                        w.clear(ci, me);
                    }
                }
            }
        }

        let before_src = w.src;
        let exhausted = self.propagate(&mut w, &mut out.cons, counts);

        // materialise
        out.seat = seat;
        out.counts = *counts;
        out.gone = 0;
        let mut certain_at = [0i32; NSEATS];
        let mut info = FactsInfo {
            exhaustion: self.exhausted || exhausted,
            ..FactsInfo::default()
        };
        // One card index over the walk's parallel arrays and the output's.
        #[allow(clippy::needless_range_loop)]
        for ci in 0..NCARDS {
            if w.pos[ci] == POS_GONE {
                out.gone |= 1u64 << ci;
                out.cand[ci] = 0;
                out.holder[ci] = NONE;
                continue;
            }
            let holder = if w.pos[ci] != POS_ORIGINAL {
                w.pos[ci]
            } else {
                w.xfix[ci]
            };
            if holder != NONE {
                out.holder[ci] = holder;
                out.cand[ci] = sbit(holder);
                certain_at[holder as usize] += 1;
                if w.pos[ci] == POS_ORIGINAL && hand & (1u64 << ci) == 0 && w.src[ci] == SRC_INFERRED {
                    info.propagated_singleton = true;
                    if before_src[ci] == 0 {
                        info.propagated_in_fixpoint = true;
                    }
                }
            } else {
                out.holder[ci] = NONE;
                out.cand[ci] = w.cand[ci];
            }
        }
        for s in 0..NSEATS {
            out.unknown[s] = (counts[s] as i32 - certain_at[s]).max(0) as u8;
        }
        info.constraint = !out.cons.is_empty();
        out.info = info;
    }

    /// `propagate`: the fixpoint over the current counts, the candidates and the constraints. Returns whether count
    /// exhaustion eliminated a candidate (coverage only).
    fn propagate(&self, w: &mut Cards, cons: &mut Vec<Cons>, counts: &[u8; NSEATS]) -> bool {
        let mut exhausted = false;
        for _round in 0..MAX_ROUNDS {
            let mut changed = false;

            // Count exhaustion and count forcing, per seat.
            for s in 0..NSEATS as u8 {
                let mut certain = 0i32;
                let mut poss = [0u8; NCARDS];
                let mut np = 0usize;
                for ci in 0..NCARDS {
                    if w.pos[ci] == s || (w.pos[ci] == POS_ORIGINAL && w.xfix[ci] == s) {
                        certain += 1;
                    } else if w.pos[ci] == POS_ORIGINAL && w.xfix[ci] == NONE && w.cand[ci] & sbit(s) != 0 {
                        poss[np] = ci as u8;
                        np += 1;
                    }
                }
                let need = counts[s as usize] as i32 - certain;
                if need <= 0 {
                    if !self.is_mutant(FactsMutant::M6) {
                        for &ci in &poss[..np] {
                            if w.clear(ci as usize, s) {
                                exhausted = true;
                            }
                            changed = true;
                        }
                    }
                } else if np as i32 == need {
                    for &ci in &poss[..np] {
                        w.fix(ci as usize, s, SRC_INFERRED);
                        changed = true;
                    }
                }
            }

            // Single-candidate elimination.
            for ci in 0..NCARDS {
                if w.pos[ci] == POS_ORIGINAL && w.xfix[ci] == NONE && w.cand[ci].count_ones() == 1 {
                    w.fix(ci, sole_seat(w.cand[ci]), SRC_INFERRED);
                    changed = true;
                }
            }

            // Constraint forcing: prune dead disjuncts, fix a lone survivor, drop the satisfied and the exhausted.
            let mut keep = 0usize;
            for i in 0..cons.len() {
                let k = cons[i];
                let mut satisfied = false;
                let mut alive = 0u64;
                let mut n = 0u32;
                let mut only = 0usize;
                let mut m = k.cards;
                while m != 0 {
                    let ci = m.trailing_zeros() as usize;
                    m &= m - 1;
                    if w.xfix[ci] == k.seat {
                        satisfied = true;
                        break;
                    }
                    if w.xfix[ci] != NONE {
                        continue;
                    }
                    if w.cand[ci] & sbit(k.seat) == 0 {
                        continue;
                    }
                    alive |= 1u64 << ci;
                    n += 1;
                    only = ci;
                }
                if satisfied || n == 0 {
                    changed = true;
                    continue;
                }
                if n == 1 {
                    w.fix(only, k.seat, SRC_INFERRED);
                    changed = true;
                    continue;
                }
                if n != k.cards.count_ones() {
                    changed = true;
                }
                cons[keep] = Cons {
                    seat: k.seat,
                    cards: alive,
                };
                keep += 1;
            }
            cons.truncate(keep);

            if !changed {
                break;
            }
        }
        exhausted
    }
}

/// Coverage flags of one view (G1a's check 5), from the port's own computation.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FactsInfo {
    /// The view has at least one live constraint.
    pub constraint: bool,
    /// Count exhaustion eliminated a candidate: in the walk over the view's log, or in its fixpoint.
    pub exhaustion: bool,
    /// Some card of another seat's hand is certain, unmoved, and was fixed by inference (elimination to one
    /// candidate, count exhaustion or forcing, or a constraint), never by a direct reveal.
    pub propagated_singleton: bool,
    /// As `propagated_singleton`, with the card fixed inside this view's final fixpoint.
    pub propagated_in_fixpoint: bool,
}

/// The rules-derived facts of one view: what `buildKnowledge` returns, less its marginal.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Facts {
    /// The viewing seat.
    pub seat: u8,
    /// Every card's candidate seats now (absolute), a six-bit mask; a singleton is certain; 0 once the card is gone.
    pub cand: [u8; NCARDS],
    /// Every card's certain holder now, or NONE (uncertain, or gone).
    pub holder: [u8; NCARDS],
    /// The cards gone (their sets resolved), as a mask.
    pub gone: u64,
    /// The public hand counts (`Knowledge.counts`).
    pub counts: [u8; NSEATS],
    /// Per seat, the cards in its hand not individually located (`unknownSlots`).
    pub unknown: [u8; NSEATS],
    /// The surviving constraints, in the reference's list order (duplicates kept, as the reference keeps them).
    pub cons: Vec<Cons>,
    /// Coverage flags.
    pub info: FactsInfo,
}

impl Default for Facts {
    fn default() -> Self {
        Facts {
            seat: 0,
            cand: [0; NCARDS],
            holder: [NONE; NCARDS],
            gone: 0,
            counts: [0; NSEATS],
            unknown: [0; NSEATS],
            cons: Vec::new(),
            info: FactsInfo::default(),
        }
    }
}

/// The canonical encoding's format tag, `athena-facts-1`.
pub const FORMAT_FACTS: &str = "athena-facts-1";

/// The length of the canonical encoding of a view's facts with `n` distinct constraints: 1 + 54 + 54 + 8 + 6 + 6 + 2
/// + 3n.
pub const fn encoded_len(n: usize) -> usize {
    131 + 3 * n
}

impl Facts {
    /// The constraints as a set: each as (seat, set, six-bit mask of the set's cards), sorted and deduplicated. Writes
    /// into `out` (cleared first).
    pub fn constraint_set(&self, out: &mut Vec<[u8; 3]>) {
        out.clear();
        for k in &self.cons {
            let (set, m) = k.set_and_mask();
            out.push([k.seat, set, m]);
        }
        out.sort_unstable();
        out.dedup();
    }

    /// The canonical encoding of G1a's comparison (`athena-facts-1`), into `out`; returns its length. `scratch` holds
    /// the constraint set. The fields, in order:
    ///
    /// | bytes | field |
    /// |---|---|
    /// | 1 | the viewing seat |
    /// | 54 | each card's candidate mask (absolute seats; 0 once gone) |
    /// | 54 | each card's certain holder, or NONE |
    /// | 8 | the gone cards, a u64 mask, little-endian |
    /// | 6 | the counts |
    /// | 6 | the unknown slots |
    /// | 2 | the number of distinct constraints, u16 little-endian |
    /// | 3 each | (seat, set, mask), sorted ascending |
    pub fn encode(&self, scratch: &mut Vec<[u8; 3]>, out: &mut Vec<u8>) -> usize {
        self.constraint_set(scratch);
        out.clear();
        out.push(self.seat);
        out.extend_from_slice(&self.cand);
        out.extend_from_slice(&self.holder);
        out.extend_from_slice(&self.gone.to_le_bytes());
        out.extend_from_slice(&self.counts);
        out.extend_from_slice(&self.unknown);
        out.extend_from_slice(&(scratch.len() as u16).to_le_bytes());
        for t in scratch.iter() {
            out.extend_from_slice(t);
        }
        out.len()
    }

    /// A readable account of the facts, for a divergence report.
    pub fn describe(&self) -> String {
        let name = |c: usize| String::from_utf8_lossy(&crate::cards::card_name(c as u8)).into_owned();
        let mut s = format!(
            "seat {} counts {:?} unknown {:?}\n  certain:",
            self.seat, self.counts, self.unknown
        );
        for ci in 0..NCARDS {
            if self.holder[ci] != NONE {
                s.push_str(&format!(" {}@{}", name(ci), self.holder[ci]));
            }
        }
        s.push_str("\n  open:");
        for ci in 0..NCARDS {
            if self.holder[ci] == NONE && self.gone & (1u64 << ci) == 0 {
                s.push_str(&format!(" {}:{:06b}", name(ci), self.cand[ci]));
            }
        }
        s.push_str("\n  gone:");
        for ci in 0..NCARDS {
            if self.gone & (1u64 << ci) != 0 {
                s.push_str(&format!(" {}", name(ci)));
            }
        }
        let mut set = Vec::new();
        self.constraint_set(&mut set);
        s.push_str(&format!(
            "\n  constraints ({} listed, {} distinct):",
            self.cons.len(),
            set.len()
        ));
        for [seat, b, m] in set {
            let cards: Vec<String> = (0..6)
                .filter(|j| m & (1 << j) != 0)
                .map(|j| name(SET_CARDS[b as usize][j] as usize))
                .collect();
            s.push_str(&format!(" {}:{{{}}}", seat, cards.join(",")));
        }
        s
    }
}

/* ------------------------------------------------------------------------------------ on top of the facts --- */

/// Per open set, for the viewing seat's team: `(certain, lost)`. `certain` counts the set's cards whose holder is
/// certain and on the team; `lost` is `setLost`: some card is certainly with an opponent, or no teammate is a
/// candidate for it. A resolved set reads `(NONE, NONE)`.
pub fn set_status(f: &Facts, resolved: u16) -> [(u8, u8); NSETS] {
    let t = team(f.seat);
    let mut out = [(NONE, NONE); NSETS];
    for (b, o) in out.iter_mut().enumerate() {
        if resolved & (1 << b) != 0 {
            continue;
        }
        let mut certain = 0u8;
        let mut lost = 0u8;
        for &c in &SET_CARDS[b] {
            let ci = c as usize;
            let h = f.holder[ci];
            if h != NONE {
                if team(h) != t {
                    lost = 1;
                } else {
                    certain += 1;
                }
            } else if f.cand[ci] & TEAM_SEATS[t as usize] == 0 {
                lost = 1;
            }
        }
        *o = (certain, lost);
    }
    out
}

/// The rules-certain declare (`railPlan`): the first open set, in canonical order, every card of which has a certain
/// holder on the viewing seat's team, with those holders as its assignment.
pub fn rail(f: &Facts, resolved: u16) -> Option<(u8, [u8; 6])> {
    let t = team(f.seat);
    'sets: for (b, cards) in SET_CARDS.iter().enumerate() {
        if resolved & (1 << b) != 0 {
            continue;
        }
        let mut a = [0u8; 6];
        for (j, &c) in cards.iter().enumerate() {
            let h = f.holder[c as usize];
            if h == NONE || team(h) != t {
                continue 'sets;
            }
            a[j] = h;
        }
        return Some((b as u8, a));
    }
    None
}

/// G1c's classification of one window offer (ATHENA.md §8.2), for the offered seat's facts.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WindowClass {
    /// A rules-certain open set: the rail declares it, and the declare head is not needed.
    Rail,
    /// A live set (open, not proved lost, at least k of its cards certain on the team) and no certain set: the declare
    /// head is evaluated.
    Live,
    /// No live set, and declining is illegal (`MUST_DECLARE`): the claim is compelled, so the head must choose.
    Compelled,
    /// No live set: declined by rule.
    Declined,
}

impl WindowClass {
    /// Does the rule admit the window (the rail, the head, or a compelled claim)?
    pub fn admitted(self) -> bool {
        self != WindowClass::Declined
    }

    /// Is the declare head evaluated there (a live set, or a compelled claim)?
    pub fn evaluated(self) -> bool {
        matches!(self, WindowClass::Live | WindowClass::Compelled)
    }

    /// The class as a byte: 0 declined, 1 rail, 2 live, 3 compelled (the Python API's `WINDOW_*`).
    pub fn code(self) -> u8 {
        match self {
            WindowClass::Declined => 0,
            WindowClass::Rail => 1,
            WindowClass::Live => 2,
            WindowClass::Compelled => 3,
        }
    }
}

/// Is there a live set for k: open, not proved lost, and at least k of its six cards certain on the viewing seat's
/// team?
pub fn has_live_set(f: &Facts, resolved: u16, k: u8) -> bool {
    set_status(f, resolved)
        .iter()
        .any(|&(certain, lost)| certain != NONE && lost == 0 && certain >= k)
}

/// The live-set rule at a window offer: the offered seat's facts, the resolved sets, k, and whether declining is legal
/// there.
pub fn window_class(f: &Facts, resolved: u16, k: u8, decline_legal: bool) -> WindowClass {
    if rail(f, resolved).is_some() {
        WindowClass::Rail
    } else if has_live_set(f, resolved, k) {
        WindowClass::Live
    } else if !decline_legal {
        WindowClass::Compelled
    } else {
        WindowClass::Declined
    }
}

/* ----------------------------------------------------------------------------------------- the regimes --- */

/// The home regime: a declare publishes every true holder, right or wrong.
pub const REGIME_HOME: u8 = 0;
/// The bridge regime (`replay-format.md` §12.4): a wrong declare publishes only the holders a hit had located.
pub const REGIME_BRIDGE: u8 = 1;

/// What a regime publishes of each declare: one game's tracker of the cards a hit has located.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Reveal {
    /// The regime, [`REGIME_HOME`] or [`REGIME_BRIDGE`].
    pub regime: u8,
    /// Cards a hit has moved (and so located publicly) while their set is open.
    hit_seen: u64,
    /// Per resolved set, the six-bit mask of the holders its declare published (set card order); 0 while open.
    revealed: [u8; NSETS],
    /// The bridge regime's planted control: publish every holder anyway (only with the `mutants` feature).
    full_reveal_control: bool,
}

impl Reveal {
    /// A game's tracker at the deal.
    pub const fn new(regime: u8) -> Reveal {
        Reveal {
            regime,
            hit_seen: 0,
            revealed: [0; NSETS],
            full_reveal_control: false,
        }
    }

    /// G1b's planted control: the bridge regime reveals every holder (only with the `mutants` feature).
    pub fn set_full_reveal_control(&mut self, on: bool) {
        #[cfg(not(feature = "mutants"))]
        assert!(!on, "the full-reveal control needs the `mutants` feature");
        self.full_reveal_control = on;
    }

    /// The event as this regime publishes it, recording what it reveals. Call it for every logged event, in order.
    pub fn publish(&mut self, e: &Event) -> Event {
        match *e {
            Event::Ask { card, hit: true, .. } => {
                self.hit_seen |= 1u64 << card;
                *e
            }
            Event::Claim {
                claimer,
                set,
                assign,
                holders,
                outcome,
            } => {
                let full = self.regime == REGIME_HOME || outcome == team(claimer) || self.full_reveal_control;
                let mut mask = 0u8;
                let mut shown = holders;
                for (j, &c) in SET_CARDS[set as usize].iter().enumerate() {
                    if full || self.hit_seen & (1u64 << c) != 0 {
                        mask |= 1 << j;
                    } else {
                        shown[j] = NONE;
                    }
                }
                self.revealed[set as usize] = mask;
                self.hit_seen &= !SET_MASK[set as usize];
                Event::Claim {
                    claimer,
                    set,
                    assign,
                    holders: shown,
                    outcome,
                }
            }
            _ => *e,
        }
    }

    /// The holders mask a resolved set's declare published (0x3F for every declare under the home regime).
    #[inline]
    pub fn revealed(&self, set: u8) -> u8 {
        self.revealed[set as usize]
    }

    /// A set block (replay-format.md §4.1) as this regime shows it: every unpublished true holder is NONE.
    pub fn mask_set_block(&self, block: &[u8; 14 * NSETS]) -> [u8; 14 * NSETS] {
        let mut out = *block;
        for b in 0..NSETS {
            if out[14 * b] == NONE {
                continue;
            }
            for j in 0..6 {
                if self.revealed[b] & (1 << j) == 0 {
                    out[14 * b + 8 + j] = NONE;
                }
            }
        }
        out
    }
}

/// One game's facts machinery: its regime's reveal and its walk, fed every logged event in order.
#[derive(Clone, Debug)]
pub struct GameFacts {
    /// What the regime publishes.
    pub reveal: Reveal,
    /// The walk over the published log.
    pub walk: Walk,
}

impl GameFacts {
    /// A game at the deal, under `regime`.
    pub fn new(regime: u8) -> GameFacts {
        GameFacts {
            reveal: Reveal::new(regime),
            walk: Walk::new(),
        }
    }

    /// A new game in this slot, keeping the walk's capacity, its planted mutant and the reveal's control.
    pub fn reset(&mut self, regime: u8) {
        let control = self.reveal.full_reveal_control;
        self.reveal = Reveal::new(regime);
        self.reveal.full_reveal_control = control;
        self.walk.reset();
    }

    /// Feed one logged event; returns it as the regime publishes it.
    pub fn log(&mut self, e: &Event) -> Event {
        let p = self.reveal.publish(e);
        self.walk.ingest(&p);
        p
    }

    /// The facts of `seat`'s view of `g` (whose every logged event, `game_started` included, has been fed).
    pub fn facts(&self, g: &Game, seat: u8, out: &mut Facts) {
        self.walk.finish(seat, g.hand(seat), &g.counts(), resolved_mask(g), out);
    }
}

/// A game's resolved sets as a mask.
pub fn resolved_mask(g: &Game) -> u16 {
    let mut m = 0u16;
    for b in 0..NSETS as u8 {
        if g.is_resolved(b) {
            m |= 1 << b;
        }
    }
    m
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::card_index;
    use crate::rules::{Events, FINISHED};
    use crate::stub::{fuzz_policy_action, fuzz_policy_rng, mixed_stub_action, mixed_stub_rng};

    fn c(n: &str) -> u8 {
        card_index(n).unwrap()
    }

    /// Play `games` games each of the mixed stub and the fuzz policy, calling `check` with the game and its facts
    /// machinery before every step.
    fn drive(games: usize, regime: u8, mut check: impl FnMut(&Game, &GameFacts)) {
        let mut ev = Events::new();
        for k in 0..games {
            for fuzz in [false, true] {
                let seed = format!("athena-facts-test-{k}");
                let (mut rng, start) = if fuzz {
                    fuzz_policy_rng(&seed)
                } else {
                    (mixed_stub_rng(&seed), (k % 6) as u8)
                };
                let mut g = Game::new(&seed, start).unwrap();
                let mut gf = GameFacts::new(regime);
                gf.log(&Event::GameStarted { start });
                let mut t = 0;
                while g.phase() != FINISHED && t < 6000 {
                    check(&g, &gf);
                    let a = if fuzz {
                        fuzz_policy_action(&g, &mut rng)
                    } else {
                        mixed_stub_action(&g, g.acting_seat(), &mut rng)
                    };
                    g.apply(&a, &mut ev).unwrap();
                    for e in ev.as_slice() {
                        gf.log(e);
                    }
                    t += 1;
                }
            }
        }
    }

    /// Every certainty is sound on the true deal (the reference's own test, `knowledge.test.ts`, checks `holderOf`
    /// against the truth), every candidate mask holds the true holder, the unknown slots add up, and every
    /// constraint is satisfied by the deal. Under both regimes.
    #[test]
    fn facts_are_sound_on_the_true_deal() {
        let mut f = Facts::default();
        let mut views = 0u64;
        let mut certain = 0u64;
        let mut cons = 0u64;
        for regime in [REGIME_HOME, REGIME_BRIDGE] {
            let mut deal = [NONE; NCARDS];
            drive(30, regime, |g, gf| {
                if g.move_index() == 0 {
                    deal = *g.owners();
                }
                for seat in 0..6u8 {
                    gf.facts(g, seat, &mut f);
                    views += 1;
                    for ci in 0..NCARDS {
                        let h = g.owner(ci as u8);
                        if h == NONE {
                            assert_eq!(f.cand[ci], 0);
                            assert!(f.gone & (1 << ci) != 0);
                            continue;
                        }
                        assert!(
                            f.cand[ci] & (1 << h) != 0,
                            "card {ci} held by {h}: mask {:06b}",
                            f.cand[ci]
                        );
                        if f.holder[ci] != NONE {
                            assert_eq!(f.holder[ci], h);
                            certain += 1;
                        }
                    }
                    for s in 0..6 {
                        let located = (0..NCARDS).filter(|&ci| f.holder[ci] == s as u8).count() as u8;
                        assert_eq!(f.unknown[s], g.count(s as u8) - located);
                    }
                    for k in &f.cons {
                        let mut m = k.cards;
                        let mut held = false;
                        while m != 0 {
                            let ci = m.trailing_zeros() as usize;
                            m &= m - 1;
                            held |= deal[ci] == k.seat;
                        }
                        assert!(held, "a constraint the deal breaks: {k:?}");
                        cons += 1;
                    }
                }
            });
        }
        assert!(views > 100_000, "{views}");
        assert!(certain > views, "{certain}");
        assert!(cons > 1_000, "{cons}");
    }

    /// The canonical encoding: the constraint set is sorted and deduplicated, and the length is as documented.
    #[test]
    fn the_encoding_compares_constraints_as_sets() {
        let mut f = Facts::default();
        let a = Cons {
            seat: 3,
            cards: (1u64 << c("2C")) | (1u64 << c("4C")),
        };
        let b = Cons {
            seat: 1,
            cards: (1u64 << c("8C")) | (1u64 << c("XB")),
        };
        f.cons = vec![a, b, a];
        let mut g = f.clone();
        g.cons = vec![b, a];
        let (mut s1, mut s2) = (Vec::new(), Vec::new());
        let (mut o1, mut o2) = (Vec::new(), Vec::new());
        assert_eq!(f.encode(&mut s1, &mut o1), encoded_len(2));
        g.encode(&mut s2, &mut o2);
        assert_eq!(o1, o2);
        assert_eq!(s1, vec![[1, 8, 0b10_0001], [3, 0, 0b101]]);
        assert_eq!(a.set_and_mask(), (0, 0b101));
    }

    /// The rail and the set status on a hand-built view: a set whose six cards are all certain on the team.
    #[test]
    fn rail_and_set_status() {
        let mut f = Facts {
            seat: 2,
            ..Facts::default()
        };
        for ci in 0..NCARDS {
            f.cand[ci] = FULL_MASK;
        }
        for (j, &x) in SET_CARDS[5].iter().enumerate() {
            let s = [0, 2, 4, 2, 0, 0][j];
            f.holder[x as usize] = s;
            f.cand[x as usize] = 1 << s;
        }
        // LOW-C: two cards certain on the team, one certain with an opponent (lost).
        f.holder[0] = 0;
        f.cand[0] = 1;
        f.holder[1] = 2;
        f.cand[1] = 4;
        f.holder[2] = 3;
        f.cand[2] = 8;
        // LOW-D: three certain on the team, the rest open.
        for x in 13..16 {
            f.holder[x] = 4;
            f.cand[x] = 16;
        }
        assert_eq!(rail(&f, 0), Some((5, [0, 2, 4, 2, 0, 0])));
        assert_eq!(rail(&f, 1 << 5), None);
        let st = set_status(&f, 1 << 8);
        assert_eq!(st[0], (2, 1));
        assert_eq!(st[1], (3, 0));
        assert_eq!(st[5], (6, 0));
        assert_eq!(st[8], (NONE, NONE));
        assert_eq!(window_class(&f, 0, 4, true), WindowClass::Rail);
        let without = 1 << 5;
        assert_eq!(window_class(&f, without, 4, true), WindowClass::Declined);
        assert_eq!(window_class(&f, without, 4, false), WindowClass::Compelled);
        assert_eq!(window_class(&f, without, 3, true), WindowClass::Live);
        // A card no teammate may hold loses its set.
        f.cand[16] = 0b10_1010;
        assert_eq!(set_status(&f, without)[1], (3, 1));
    }

    /// The bridge regime's reveal: a wrong declare shows only the cards a hit had located; a right one shows all.
    #[test]
    fn the_reduced_reveal() {
        let mut r = Reveal::new(REGIME_BRIDGE);
        let hs = SET_CARDS[6];
        r.publish(&Event::Ask {
            asker: 1,
            target: 2,
            card: hs[1],
            hit: true,
        });
        r.publish(&Event::Ask {
            asker: 1,
            target: 2,
            card: hs[3],
            hit: false,
        });
        let claim = Event::Claim {
            claimer: 3,
            set: 6,
            assign: [3; 6],
            holders: [3, 1, 3, 2, 5, 3],
            outcome: 0,
        };
        let p = r.publish(&claim);
        assert_eq!(
            p,
            Event::Claim {
                claimer: 3,
                set: 6,
                assign: [3; 6],
                holders: [NONE, 1, NONE, NONE, NONE, NONE],
                outcome: 0
            }
        );
        assert_eq!(r.revealed(6), 0b10);
        assert_eq!(r.hit_seen & SET_MASK[6], 0);
        let right = Event::Claim {
            claimer: 0,
            set: 7,
            assign: [0, 2, 4, 0, 2, 4],
            holders: [0, 2, 4, 0, 2, 4],
            outcome: 0,
        };
        assert_eq!(r.publish(&right), right);
        assert_eq!(r.revealed(7), 0x3F);
        let mut home = Reveal::new(REGIME_HOME);
        assert_eq!(home.publish(&claim), claim);
        assert_eq!(home.revealed(6), 0x3F);
    }

    /// The walk is incremental: finishing after each prefix equals a walk rebuilt from scratch over that prefix.
    #[test]
    fn the_incremental_walk_equals_a_fresh_walk() {
        let mut log: Vec<Event> = Vec::new();
        let mut ev = Events::new();
        let (mut a, mut b) = (Facts::default(), Facts::default());
        let mut compared = 0;
        for k in 0..6u8 {
            let seed = format!("athena-facts-incr-{k}");
            let mut rng = mixed_stub_rng(&seed);
            let mut g = Game::new(&seed, k).unwrap();
            let mut gf = GameFacts::new(if k % 2 == 0 { REGIME_HOME } else { REGIME_BRIDGE });
            log.clear();
            log.push(gf.log(&Event::GameStarted { start: k }));
            while g.phase() != FINISHED {
                if g.move_index() % 17 == 0 {
                    let mut fresh = Walk::new();
                    for e in &log {
                        fresh.ingest(e);
                    }
                    for seat in 0..6 {
                        gf.facts(&g, seat, &mut a);
                        fresh.finish(seat, g.hand(seat), &g.counts(), resolved_mask(&g), &mut b);
                        assert_eq!(a, b);
                        compared += 1;
                    }
                }
                let act = mixed_stub_action(&g, g.acting_seat(), &mut rng);
                g.apply(&act, &mut ev).unwrap();
                for e in ev.as_slice() {
                    log.push(gf.log(e));
                }
            }
        }
        assert!(compared > 200, "{compared}");
    }

    /// The cross-language vectors, pinned in `tests/athena/facts-codec.test.ts` too: two mixed-stub games from start
    /// seat 0; before every step, the home digest takes all six seats' canonical encodings (home regime) and the
    /// bridge digest the acting seat's (bridge regime), one element each.
    #[test]
    fn the_cross_language_vectors() {
        let want = [
            ("athena-p1-facts-vector-0", 544, "87ef9b65f434595b", "5cb37f1c5156f084"),
            ("athena-p1-facts-vector-1", 529, "95573bb8b1ec8ebc", "d036ab39819c92cc"),
        ];
        let mut ev = Events::new();
        let mut f = Facts::default();
        let (mut scratch, mut enc) = (Vec::new(), Vec::new());
        for (seed, steps, home_hex, bridge_hex) in want {
            let mut rng = mixed_stub_rng(seed);
            let mut g = Game::new(seed, 0).unwrap();
            let mut home = GameFacts::new(REGIME_HOME);
            let mut bridge = GameFacts::new(REGIME_BRIDGE);
            home.log(&Event::GameStarted { start: 0 });
            bridge.log(&Event::GameStarted { start: 0 });
            let (mut hd, mut bd) = (crate::digest::ByteDigest::new(), crate::digest::ByteDigest::new());
            let mut n = 0;
            while g.phase() != FINISHED {
                let seat = g.acting_seat();
                for x in 0..6u8 {
                    home.facts(&g, x, &mut f);
                    f.encode(&mut scratch, &mut enc);
                    hd.push(&enc);
                }
                bridge.facts(&g, seat, &mut f);
                f.encode(&mut scratch, &mut enc);
                bd.push(&enc);
                let act = mixed_stub_action(&g, seat, &mut rng);
                g.apply(&act, &mut ev).unwrap();
                for e in ev.as_slice() {
                    home.log(e);
                    bridge.log(e);
                }
                n += 1;
            }
            let hex = |d: &crate::digest::ByteDigest| String::from_utf8(d.hex().to_vec()).unwrap();
            assert_eq!(
                (n, hex(&hd), hex(&bd)),
                (steps, home_hex.to_string(), bridge_hex.to_string()),
                "{seed}"
            );
        }
    }
}
