//! The mixed stub of ATHENA.md §4.3 (`scripts/athena/mixed-stub.ts`), draw for draw: G0a's population H5 and G0b's
//! stub. Given the same seed and start seat it plays the same actions as the reference stub, so a game's actions
//! depend only on those two.
//!
//! - At a window offer, with probability 0.01 (one draw, taken only while a window is open), a uniformly random
//!   declare: a uniform open set, then a uniform own-team seat for each of its six cards.
//! - Otherwise, at a window offer, the first open set that the offered seat's team holds entirely is declared
//!   correctly, reading the true deal.
//! - Otherwise the offered seat declines when a decline is legal, and makes the random declare when it is not.
//! - In `awaitPass`, a uniform teammate (ascending, not the passer) holding cards.
//! - With the window closed, a uniform ask over `legalAsks` in its order.

use crate::cards::{team, NSETS, SET_CARDS};
use crate::rng::{Mulberry32, Xmur3};
use crate::rules::{Action, Game, AWAIT_PASS};

/// The random-declare probability at a window offer.
pub const MIXED_EPS: f64 = 0.01;

/// The stub's generator for a game seed: `mulberry32(xmur3(seed + ":stub")())`.
pub fn mixed_stub_rng(seed: &str) -> Mulberry32 {
    Mulberry32::new(Xmur3::from_str_parts(&[seed, ":stub"]).next())
}

/// `randomDeclare`.
fn random_declare(g: &Game, seat: u8, rng: &mut Mulberry32) -> Action {
    let mut open = [0u8; NSETS];
    let mut n = 0usize;
    for b in 0..NSETS as u8 {
        if !g.is_resolved(b) {
            open[n] = b;
            n += 1;
        }
    }
    let set = open[rng.rand_int(n as u32) as usize];
    let t = team(seat);
    let mut assign = [0u8; 6];
    for a in assign.iter_mut() {
        *a = t + 2 * rng.rand_int(3) as u8;
    }
    Action::Claim { seat, set, assign }
}

/// The mixed stub's action for `seat`, the seat whose move it is ([`Game::acting_seat`]).
pub fn mixed_stub_action(g: &Game, seat: u8, rng: &mut Mulberry32) -> Action {
    let window = g.window().is_some();
    if window && rng.next_f64() < MIXED_EPS {
        return random_declare(g, seat, rng);
    }
    // oracleStub: the first open set the offered seat's team holds entirely, stated at its true holders.
    if window {
        let t = team(seat);
        'sets: for b in 0..NSETS as u8 {
            if g.is_resolved(b) {
                continue;
            }
            let mut assign = [0u8; 6];
            for (j, &c) in SET_CARDS[b as usize].iter().enumerate() {
                let h = g.owner(c);
                if h > 5 || team(h) != t {
                    continue 'sets;
                }
                assign[j] = h;
            }
            return Action::Claim { seat, set: b, assign };
        }
    }
    // randomStub.
    if window {
        return if g.turn_holder_can_ask() {
            Action::Decline { seat }
        } else {
            random_declare(g, seat, rng)
        };
    }
    if g.phase() == AWAIT_PASS {
        let t = team(seat);
        let mut mates = [0u8; 2];
        let mut n = 0usize;
        for m in [t, t + 2, t + 4] {
            if m != seat && g.count(m) > 0 {
                mates[n] = m;
                n += 1;
            }
        }
        let to = mates[rng.rand_int(n as u32) as usize];
        return Action::Pass { seat, to };
    }
    match g.nth_legal_ask(seat, |total| rng.rand_int(total)) {
        Some((target, card)) => Action::Ask { seat, target, card },
        // The window only ever closes into a position with a legal ask (reduceDecline); this is unreachable, and the
        // reducer refuses a decline here, so a caller would see it rather than a silent wrong move.
        None => Action::Decline { seat },
    }
}

/// The repo's us54 fuzz policy (`tests/engine/policy.ts`, `us54PolicyAction` with its `randomClaim`), draw for draw:
/// G0a's population H4 and RULES_US54.md §7 vector 10's driver. Its generator is `rngFromSeed(seed + ":policy")`,
/// whose first draw, `randInt(6)`, is the start seat.
pub fn fuzz_policy_action(g: &Game, rng: &mut Mulberry32) -> Action {
    fn random_claim(g: &Game, seat: u8, rng: &mut Mulberry32) -> Action {
        let mut open = [0u8; NSETS];
        let mut n = 0usize;
        for b in 0..NSETS as u8 {
            if !g.is_resolved(b) {
                open[n] = b;
                n += 1;
            }
        }
        let set = open[rng.rand_int(n as u32) as usize];
        let t = team(seat);
        let informed = rng.next_f64() < 0.5;
        let mut assign = [0u8; 6];
        for (j, &c) in SET_CARDS[set as usize].iter().enumerate() {
            let holder = g.owner(c);
            assign[j] = if informed && team(holder) == t {
                holder
            } else {
                t + 2 * rng.rand_int(3) as u8
            };
        }
        Action::Claim { seat, set, assign }
    }
    if let Some(w) = g.window() {
        let seat = w.option;
        if !g.turn_holder_can_ask() {
            return random_claim(g, seat, rng);
        }
        return if rng.next_f64() < 0.12 {
            random_claim(g, seat, rng)
        } else {
            Action::Decline { seat }
        };
    }
    let turn = g.turn();
    if g.phase() == AWAIT_PASS {
        let t = team(turn);
        let mut targets = [0u8; 3];
        let mut n = 0usize;
        for m in [t, t + 2, t + 4] {
            if g.count(m) > 0 {
                targets[n] = m;
                n += 1;
            }
        }
        let to = targets[rng.rand_int(n as u32) as usize];
        return Action::Pass { seat: turn, to };
    }
    match g.nth_legal_ask(turn, |total| rng.rand_int(total)) {
        Some((target, card)) => Action::Ask {
            seat: turn,
            target,
            card,
        },
        None => Action::Decline { seat: turn },
    }
}

/// The fuzz policy's generator and start seat for a game seed, as `fuzz-variant.test.ts` seeds them.
pub fn fuzz_policy_rng(seed: &str) -> (Mulberry32, u8) {
    let mut rng = Mulberry32::new(Xmur3::from_str_parts(&[seed, ":policy"]).next());
    let start = rng.rand_int(6) as u8;
    (rng, start)
}
