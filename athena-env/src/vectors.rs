//! RULES_US54.md §7's ten test vectors, restated from `tests/engine/us54-declare.test.ts`, `deck-variant.test.ts`,
//! `determinism.test.ts` and `fuzz-variant.test.ts` (ATHENA.md §4.1), plus the port's harness: the us54 half of
//! `lib/engine/invariants.ts`, run after every step of the fuzz gate, and replay-format.md §10.5's whole game.
//!
//! The hand-built positions follow the reference tests' `game54`: named cards go to their seats, the rest of the
//! deck is dealt round-robin over `rest` in canonical order, and the window opens on the turn seat.

use crate::cards::{bit, card_index, is_seat, team, DECK_MASK, NCARDS, NONE, NSETS, SET_CARDS, SET_MASK, SET_OF_CARD};
use crate::replay::{parse_line, record_game, Replayer};
use crate::rules::*;
use crate::stub::{fuzz_policy_action, fuzz_policy_rng, mixed_stub_action, mixed_stub_rng};

/* ------------------------------------------------------------------ fixtures --- */

fn c(name: &str) -> u8 {
    card_index(name).unwrap_or_else(|| panic!("{name} is not a card"))
}

fn set_index(name: &str) -> u8 {
    crate::cards::SET_NAMES.iter().position(|&s| s == name).unwrap() as u8
}

/// `deal(pool, spec, rest)`: named cards to their seats, everything else in `pool` round-robin over `rest`.
fn deal(pool: u64, spec: &[(u8, &[&str])], rest: &[u8]) -> [u64; 6] {
    let mut hands = [0u64; 6];
    let mut placed = 0u64;
    for (seat, cards) in spec {
        for n in cards.iter() {
            hands[*seat as usize] |= bit(c(n));
            placed |= bit(c(n));
        }
    }
    let mut i = 0usize;
    for card in 0..NCARDS as u8 {
        if pool & bit(card) == 0 || placed & bit(card) != 0 {
            continue;
        }
        hands[rest[i % rest.len()] as usize] |= bit(card);
        i += 1;
    }
    hands
}

fn hands54(spec: &[(u8, &[&str])], rest: &[u8]) -> [u64; 6] {
    deal(DECK_MASK, spec, rest)
}

const ALL: &[u8] = &[0, 1, 2, 3, 4, 5];

fn game54(hands: [u64; 6], turn: u8) -> Game {
    Game::from_hands(hands, turn)
}

fn ok(g: &Game, a: Action) -> (Game, Vec<Event>) {
    let mut next = *g;
    let mut ev = Events::new();
    if let Err(e) = next.apply(&a, &mut ev) {
        panic!("expected success for {a:?}, got {}", e.name());
    }
    (next, ev.as_slice().to_vec())
}

fn refuse(g: &Game, a: Action) -> ErrorCode {
    let mut next = *g;
    let mut ev = Events::new();
    match next.apply(&a, &mut ev) {
        Ok(()) => panic!("expected a refusal for {a:?}"),
        Err(e) => {
            assert_eq!(next, *g, "a refused action changed the state");
            e
        }
    }
}

fn option_to(g: &Game, seat: u8) -> Game {
    let mut cur = *g;
    for _ in 0..6 {
        let w = cur.window().expect("no declare window is open");
        if w.option == seat {
            return cur;
        }
        cur = ok(&cur, Action::Decline { seat: w.option }).0;
    }
    panic!("the option never reached seat {seat}");
}

fn close_window(g: &Game) -> Game {
    let mut cur = *g;
    for _ in 0..6 {
        let w = cur.window().expect("window was already closed");
        cur = ok(&cur, Action::Decline { seat: w.option }).0;
    }
    assert!(
        cur.window().is_none(),
        "window did not close after a full cycle of declines"
    );
    cur
}

/// The stated seats of a set, from (card, seat) pairs, in set card order.
fn asg(set: &str, pairs: &[(&str, u8)]) -> [u8; 6] {
    let b = set_index(set) as usize;
    let mut out = [NONE; 6];
    for (name, seat) in pairs {
        let j = SET_CARDS[b]
            .iter()
            .position(|&x| x == c(name))
            .expect("card not in set");
        out[j] = *seat;
    }
    assert!(out.iter().all(|&x| x != NONE), "assignments do not cover the set");
    out
}

fn claim(seat: u8, set: &str, assign: [u8; 6]) -> Action {
    Action::Claim {
        seat,
        set: set_index(set),
        assign,
    }
}

fn low_c_on_team_a() -> Vec<(u8, &'static [&'static str])> {
    vec![(0, &["2C", "3C"]), (2, &["4C", "5C"]), (4, &["6C", "7C"])]
}

fn low_c_correct() -> [u8; 6] {
    asg(
        "LOW-C",
        &[("2C", 0), ("3C", 0), ("4C", 2), ("5C", 2), ("6C", 4), ("7C", 4)],
    )
}

fn low_c_swapped() -> [u8; 6] {
    asg(
        "LOW-C",
        &[("2C", 0), ("3C", 0), ("4C", 4), ("5C", 2), ("6C", 2), ("7C", 4)],
    )
}

fn high_s_correct() -> [u8; 6] {
    asg(
        "HIGH-S",
        &[("9S", 0), ("TS", 0), ("JS", 2), ("QS", 2), ("KS", 4), ("AS", 4)],
    )
}

/// Every card of the 54 is in exactly one hand or one resolved set.
fn conserved(g: &Game) -> bool {
    let mut seen = 0u64;
    let mut total = 0u32;
    for s in 0..6u8 {
        if seen & g.hand(s) != 0 {
            return false;
        }
        seen |= g.hand(s);
        total += g.hand(s).count_ones();
    }
    for b in 0..NSETS as u8 {
        if g.is_resolved(b) {
            if seen & SET_MASK[b as usize] != 0 {
                return false;
            }
            seen |= SET_MASK[b as usize];
            total += 6;
        }
    }
    seen == DECK_MASK && total == 54
}

/// The us54 half of `checkInvariants`: [] when healthy.
fn check_invariants(g: &Game) -> Vec<String> {
    let mut v = Vec::new();
    if !is_seat(g.turn()) {
        v.push(format!("turn {} is not a seat", g.turn()));
        return v;
    }
    if !conserved(g) {
        v.push("card conservation broken".into());
    }
    for card in 0..NCARDS as u8 {
        let o = g.owner(card);
        let resolved = g.is_resolved(SET_OF_CARD[card as usize]);
        if resolved != (o == NONE) {
            v.push(format!("card {card}: owner {o} but resolved {resolved}"));
        }
        if o != NONE && g.hand(o) & bit(card) == 0 {
            v.push(format!("card {card}: owner {o} does not hold it"));
        }
    }
    for s in 0..6u8 {
        if g.count(s) as u32 != g.hand(s).count_ones() {
            v.push(format!(
                "seat {s}: count {} vs hand {}",
                g.count(s),
                g.hand(s).count_ones()
            ));
        }
    }
    let mut expected = [0u8; 2];
    let mut awarded = [0u8; 2];
    let mut resolved = 0u8;
    for b in 0..NSETS as u8 {
        if !g.is_resolved(b) {
            continue;
        }
        resolved += 1;
        let claimer = g.set_claimer(b);
        if !is_seat(claimer) {
            v.push(format!("set {b}: claimer invalid"));
            continue;
        }
        let ct = team(claimer);
        let a = g.set_assignments(b);
        let h = g.set_holders(b);
        for (j, &s) in a.iter().enumerate() {
            if !is_seat(s) || team(s) != ct {
                v.push(format!("set {b}: card {j} assigned off-team"));
            }
        }
        let opp = h.iter().any(|&x| team(x) != ct);
        let all = (0..6).all(|j| a[j] == h[j]);
        let want = if opp || !all { 1 - ct } else { ct };
        let o = g.set_outcome(b);
        if o != want {
            v.push(format!("set {b}: outcome {o}, expected {want}"));
        }
        if o == TEAM0 || o == TEAM1 {
            awarded[o as usize] += 1;
            expected[o as usize] += 1;
        }
    }
    if resolved != g.resolved_count() || awarded != g.awarded() {
        v.push("resolved or awarded counters drifted".into());
    }
    if g.score() != expected {
        v.push(format!(
            "score {:?} does not match resolved sets {:?}",
            g.score(),
            expected
        ));
    }
    if let Some(w) = g.window() {
        if !is_seat(w.option) || w.declined > 5 || g.phase() != PLAYING {
            v.push(format!("declareWindow {w:?} in phase {}", g.phase()));
        }
    }
    let t = g.turn();
    let tt = team(t);
    let mates = [tt, tt + 2, tt + 4];
    match g.phase() {
        PLAYING => {
            if g.count(t) == 0 {
                v.push("playing: turn seat has no cards".into());
            }
            if resolved as usize == NSETS {
                v.push("playing: all sets resolved".into());
            }
        }
        AWAIT_PASS => {
            if g.count(t) != 0 {
                v.push("awaitPass: turn seat still has cards".into());
            }
            if mates.iter().all(|&m| g.count(m) == 0) {
                v.push("awaitPass: no teammate with cards".into());
            }
        }
        FINISHED => {
            if awarded[0].max(awarded[1]) < CLINCH_TARGET && resolved as usize != NSETS {
                v.push("finished: no clinch and not every set resolved".into());
            }
        }
        p => v.push(format!("phase {p} is not a us54 phase")),
    }
    if g.phase() != FINISHED {
        let has = if g.window().is_some() {
            (resolved as usize) < NSETS || g.turn_holder_can_ask()
        } else if g.phase() == AWAIT_PASS {
            mates.iter().any(|&m| m != t && g.count(m) > 0)
        } else {
            let mut asks = AskList::new();
            g.legal_asks(t, &mut asks);
            !asks.is_empty()
        };
        if !has {
            v.push(format!("no legal action exists but phase is {}", g.phase()));
        }
    }
    v
}

/* ------------------------------------------------------ §7 vector 1: the deck --- */

#[test]
fn vector_1_deck_deals_six_hands_of_nine_covering_the_54_cards() {
    for i in 0..500 {
        for start in 0..6u8 {
            let g = Game::new(&format!("us54-deal-{i}"), start).unwrap();
            let mut union = 0u64;
            for s in 0..6u8 {
                assert_eq!(g.count(s), 9);
                assert_eq!(g.hand(s).count_ones(), 9);
                assert_eq!(union & g.hand(s), 0);
                union |= g.hand(s);
            }
            assert_eq!(union, DECK_MASK);
            assert_eq!(
                g.window(),
                Some(Window {
                    option: start,
                    declined: 0
                })
            );
            assert_eq!(
                (g.turn(), g.phase(), g.move_index(), g.score()),
                (start, PLAYING, 0, [0, 0])
            );
            assert!(check_invariants(&g).is_empty());
        }
    }
    // The start seat moves the window and the turn, never the deal.
    let a = Game::new("same-seed", 0).unwrap();
    let b = Game::new("same-seed", 4).unwrap();
    assert_eq!(a.owners(), b.owners());
    // Deterministic: the same seed deals the same hands (determinism.test.ts).
    assert_eq!(Game::new("same-seed", 0).unwrap(), a);
    // pagat48's byte-identity half of vector 1 is out of scope: the port refuses that rule set.
    let pagat = RulesConfig {
        variant: Variant::Pagat48,
        ..RulesConfig::us54()
    };
    let err = Game::with_config("x", &pagat, 0).unwrap_err();
    assert!(err.0.contains("us54"), "{err}");
}

#[test]
fn refuses_every_other_configuration_loudly() {
    assert!(RulesConfig::us54().check().is_ok());
    let mut t = RulesConfig::us54();
    t.toggles.high_books_double = true;
    assert!(Game::with_config("x", &t, 0).is_err());
    let mut t = RulesConfig::us54();
    t.toggles.ask_own_card_allowed = true;
    assert!(t.check().unwrap_err().0.contains("askOwnCardAllowed"));
    let mut t = RulesConfig::us54();
    t.player_count = 4;
    assert!(t.check().is_err());
    assert!(Game::new("x", 6).is_err());
}

/* ------------------------------------------ §7 vector 2: the EIGHTS ask licence --- */

#[test]
fn vector_2_eights_ask_licence() {
    // Seat 0 holds only XB of EIGHTS; seat 2 holds no EIGHTS card at all.
    let eights_elsewhere: &[&str] = &["8C", "8D", "8H", "8S", "XR"];
    let h = hands54(
        &[(0, &["XB", "2C"]), (1, eights_elsewhere), (2, &["3C"])],
        &[1, 3, 4, 5],
    );
    let g = close_window(&game54(h, 0));
    assert!(g
        .validate(&Action::Ask {
            seat: 0,
            target: 1,
            card: c("8C")
        })
        .is_ok());
    let (hit, ev) = ok(
        &g,
        Action::Ask {
            seat: 0,
            target: 1,
            card: c("8C"),
        },
    );
    assert_eq!(
        ev[0],
        Event::Ask {
            asker: 0,
            target: 1,
            card: c("8C"),
            hit: true
        }
    );
    assert_eq!(hit.owner(c("8C")), 0);
    let g2 = close_window(&game54(h, 2));
    assert_eq!(
        refuse(
            &g2,
            Action::Ask {
                seat: 2,
                target: 1,
                card: c("8C")
            }
        ),
        ErrorCode::NoCardOfBook
    );
}

/* ------------------------------------------------- §7 vector 3: cardBook --- */

#[test]
fn vector_3_card_book() {
    assert_eq!(SET_OF_CARD[c("8H") as usize], set_index("EIGHTS"));
    assert_eq!(SET_OF_CARD[c("XR") as usize], set_index("EIGHTS"));
    assert_eq!(SET_OF_CARD[c("XB") as usize], set_index("EIGHTS"));
    assert_eq!(SET_OF_CARD[c("9H") as usize], set_index("HIGH-H"));
    assert_eq!(SET_OF_CARD[c("7H") as usize], set_index("LOW-H"));
}

/* ------------------------------------------- §7 vector 4: wrong declares --- */

#[test]
fn vector_4_wrong_declare_gifts_the_set() {
    let s = game54(hands54(&low_c_on_team_a(), ALL), 0);
    let (r, _) = ok(&s, claim(0, "LOW-C", low_c_swapped()));
    let b = set_index("LOW-C");
    assert_eq!(r.set_outcome(b), TEAM1);
    assert_eq!(r.set_holders(b), low_c_correct());
    assert_eq!(r.score(), [0, 1]);
    assert!(conserved(&r));
    // An opponent holding one of the six also scores for the opponents.
    let s = game54(
        hands54(
            &[(0, &["2C", "3C"]), (2, &["4C", "5C"]), (4, &["6C"]), (1, &["7C"])],
            ALL,
        ),
        0,
    );
    let (r, _) = ok(&s, claim(0, "LOW-C", low_c_correct()));
    assert_eq!((r.set_outcome(b), r.score()), (TEAM1, [0, 1]));
    // A flawless declare scores for the declarer's team.
    let s = game54(hands54(&low_c_on_team_a(), ALL), 0);
    let (r, _) = ok(&s, claim(0, "LOW-C", low_c_correct()));
    assert_eq!((r.set_outcome(b), r.score()), (TEAM0, [1, 0]));
}

/* ------------------------------------------ §7 vector 5: out-of-turn declare --- */

#[test]
fn vector_5_out_of_turn_declare_leaves_the_turn() {
    let s = game54(
        hands54(&[(0, &["9S", "TS"]), (2, &["JS", "QS"]), (4, &["KS", "AS"])], ALL),
        3,
    );
    let (r, _) = ok(&option_to(&s, 0), claim(0, "HIGH-S", high_s_correct()));
    assert_eq!(r.set_outcome(set_index("HIGH-S")), TEAM0);
    assert_eq!(r.score(), [1, 0]);
    assert_eq!((r.turn(), r.phase()), (3, PLAYING));
    assert_eq!(r.window(), Some(Window { option: 3, declined: 0 }));
    let closed = close_window(&r);
    assert_eq!(closed.acting_seat(), 3);
    let opponent = if closed.count(0) > 0 { 0 } else { 2 };
    let asked = closed.hand(opponent).trailing_zeros() as u8;
    let (after, _) = ok(
        &closed,
        Action::Ask {
            seat: 3,
            target: opponent,
            card: asked,
        },
    );
    assert_eq!(after.turn(), 3);
    // The turn-holder who declares keeps the turn.
    let s = game54(hands54(&low_c_on_team_a(), ALL), 0);
    let (r, _) = ok(&s, claim(0, "LOW-C", low_c_correct()));
    assert_eq!((r.turn(), r.window()), (0, Some(Window { option: 0, declined: 0 })));
}

/* ------------------------------------------ §7 vector 6: the window re-opens --- */

#[test]
fn vector_6_the_window_reopens_from_the_top() {
    let s = game54(
        hands54(
            &[
                (0, &["9S", "TS"]),
                (2, &["JS", "QS", "2D", "3D", "4D"]),
                (4, &["KS", "AS", "5D", "6D", "7D"]),
            ],
            ALL,
        ),
        3,
    );
    let (first, _) = ok(&option_to(&s, 0), claim(0, "HIGH-S", high_s_correct()));
    assert_eq!(first.set_outcome(set_index("HIGH-S")), TEAM0);
    assert_eq!(first.window(), Some(Window { option: 3, declined: 0 }));
    let low_d = asg(
        "LOW-D",
        &[("2D", 2), ("3D", 2), ("4D", 2), ("5D", 4), ("6D", 4), ("7D", 4)],
    );
    let (second, _) = ok(&option_to(&first, 2), claim(2, "LOW-D", low_d));
    assert_eq!(second.set_outcome(set_index("LOW-D")), TEAM0);
    assert_eq!(second.score(), [2, 0]);
    assert_eq!(second.turn(), 3);
    // The window: every seat from the turn-holder, in order; only the option seat may act; six declines close it.
    let g = game54(hands54(&[], ALL), 4);
    let mut cur = g;
    let mut offered = vec![];
    for i in 0..6u8 {
        let w = cur.window().unwrap();
        offered.push(w.option);
        assert_eq!(w.declined, i);
        cur = ok(&cur, Action::Decline { seat: w.option }).0;
    }
    assert_eq!(offered, vec![4, 5, 0, 1, 2, 3]);
    assert!(cur.window().is_none());
    let s = game54(hands54(&low_c_on_team_a(), ALL), 3);
    assert_eq!(refuse(&s, Action::Decline { seat: 4 }), ErrorCode::NotYourOption);
    assert_eq!(refuse(&s, claim(0, "LOW-C", low_c_correct())), ErrorCode::NotYourOption);
    let closed = close_window(&s);
    assert_eq!(
        refuse(&closed, claim(3, "LOW-C", low_c_correct())),
        ErrorCode::NoDeclareWindow
    );
    assert_eq!(refuse(&closed, Action::Decline { seat: 3 }), ErrorCode::NoDeclareWindow);
    // Asking is blocked while the window is open; a hit re-opens it on the asker, a miss on the target.
    let s = game54(hands54(&[(0, &["2C"]), (1, &["3C", "4C"])], &[2, 3, 4, 5]), 0);
    assert_eq!(
        refuse(
            &s,
            Action::Ask {
                seat: 0,
                target: 1,
                card: c("3C")
            }
        ),
        ErrorCode::DeclareWindowOpen
    );
    let (hit, _) = ok(
        &close_window(&s),
        Action::Ask {
            seat: 0,
            target: 1,
            card: c("3C"),
        },
    );
    assert_eq!((hit.turn(), hit.window()), (0, Some(Window { option: 0, declined: 0 })));
    let (miss, _) = ok(
        &close_window(&hit),
        Action::Ask {
            seat: 0,
            target: 1,
            card: c("5C"),
        },
    );
    assert_eq!(
        (miss.turn(), miss.window()),
        (1, Some(Window { option: 1, declined: 0 }))
    );
}

/* ---------------------------------------------------- §7 vector 7: the clinch --- */

fn four_awarded(team_won: u8, spec: &[(u8, &[&str])]) -> Game {
    let low: [&str; 4] = ["LOW-C", "LOW-D", "LOW-H", "LOW-S"];
    let mut gone = 0u64;
    for s in low {
        gone |= SET_MASK[set_index(s) as usize];
    }
    let mut g = game54(deal(DECK_MASK & !gone, spec, ALL), 0);
    let seat = if team_won == 0 { 0 } else { 1 };
    for s in low {
        g.fixture_resolve(set_index(s), team_won, seat, [seat; 6], [seat; 6]);
    }
    g.set_score(if team_won == 0 { [4, 0] } else { [0, 4] });
    g
}

#[test]
fn vector_7_the_fifth_awarded_set_ends_the_game() {
    let high_c: Vec<(u8, &[&str])> = vec![(0, &["9C", "TC"]), (2, &["JC", "QC"]), (4, &["KC", "AC"])];
    let correct = asg(
        "HIGH-C",
        &[("9C", 0), ("TC", 0), ("JC", 2), ("QC", 2), ("KC", 4), ("AC", 4)],
    );
    let s = four_awarded(0, &high_c);
    let (r, ev) = ok(&s, claim(0, "HIGH-C", correct));
    assert_eq!(r.phase(), FINISHED);
    assert_eq!(r.score(), [5, 0]);
    assert!(ev.contains(&Event::GameOver {
        score: [5, 0],
        winner: 0
    }));
    assert_eq!(r.resolved_count(), 5);
    assert!((0..6u8).any(|s| r.count(s) > 0));
    assert!(r.window().is_none());
    assert!(conserved(&r));
    assert_eq!(refuse(&r, Action::Decline { seat: 0 }), ErrorCode::NoDeclareWindow);
    let mut asks = AskList::new();
    r.legal_asks(r.acting_seat(), &mut asks);
    assert_eq!(r.legal_kinds(r.acting_seat(), &asks), 0);
    // A set won because the opponents declared wrongly clinches just the same.
    let wrong = asg(
        "HIGH-C",
        &[("9C", 1), ("TC", 1), ("JC", 3), ("QC", 3), ("KC", 5), ("AC", 5)],
    );
    let (r, ev) = ok(&option_to(&s, 1), claim(1, "HIGH-C", wrong));
    assert_eq!((r.set_outcome(set_index("HIGH-C")), r.phase()), (TEAM0, FINISHED));
    assert!(ev.contains(&Event::GameOver {
        score: [5, 0],
        winner: 0
    }));
    // Four awarded sets do not finish it.
    let s = four_awarded(0, &[(0, &["9C", "TC"]), (2, &["JC", "QC"]), (4, &["KC"]), (1, &["AC"])]);
    let (r, _) = ok(&s, claim(0, "HIGH-C", correct));
    assert_eq!((r.phase(), r.score()), (PLAYING, [4, 1]));
    assert_eq!(r.window(), Some(Window { option: 0, declined: 0 }));
    // The clinch counts sets by outcome, never the score: three sets and a score of 6 do not clinch at the fourth.
    let high: [&str; 3] = ["HIGH-C", "HIGH-D", "HIGH-H"];
    let mut gone = 0u64;
    for h in high {
        gone |= SET_MASK[set_index(h) as usize];
    }
    let mut g = game54(deal(DECK_MASK & !gone, &low_c_on_team_a(), ALL), 0);
    for h in high {
        g.fixture_resolve(set_index(h), TEAM0, 0, [0; 6], [0; 6]);
    }
    g.set_score([6, 0]);
    let (r, _) = ok(&g, claim(0, "LOW-C", low_c_correct()));
    assert_eq!((r.score(), r.phase()), ([7, 0], PLAYING));
    // The resolved === 9 fallback: an 8-set 4-4 board (reachable only by hand) still ends on the 9th, with a winner.
    let mut gone = 0u64;
    let mut g0 = Game::from_hands([0; 6], 0);
    let mut i = 0u8;
    for b in 0..NSETS as u8 {
        if b == set_index("LOW-C") {
            continue;
        }
        gone |= SET_MASK[b as usize];
        let t = i % 2;
        g0.fixture_resolve(b, t, t, [t; 6], [t; 6]);
        i += 1;
    }
    let mut g = game54(deal(DECK_MASK & !gone, &low_c_on_team_a(), &[0, 2, 4]), 0);
    for b in 0..NSETS as u8 {
        if g0.is_resolved(b) {
            let t = g0.set_outcome(b);
            g.fixture_resolve(b, t, t, [t; 6], [t; 6]);
        }
    }
    g.set_score([4, 4]);
    let (r, ev) = ok(&g, claim(0, "LOW-C", low_c_correct()));
    assert_eq!((r.phase(), r.resolved_count()), (FINISHED, 9));
    assert!(ev.contains(&Event::GameOver {
        score: [5, 4],
        winner: 0
    }));
}

#[test]
fn the_fallback_reports_a_level_board_as_a_tie() {
    // Eight half-suits resolved 4-3 with one void (a simulated rule edit), EIGHTS with team B: the ninth set makes it
    // 4-4 with nobody on 5, and the fallback must say "tie", never crown team 1.
    let outcomes = [TEAM0, TEAM0, TEAM0, TEAM0, TEAM1, TEAM1, TEAM1, VOID];
    let eights = SET_CARDS[8];
    let mut hands = [0u64; 6];
    hands[1] = bit(eights[0]) | bit(eights[1]);
    hands[3] = bit(eights[2]) | bit(eights[3]);
    hands[5] = bit(eights[4]) | bit(eights[5]);
    let mut g = game54(hands, 1);
    let mut score = [0u8; 2];
    for (b, &o) in outcomes.iter().enumerate() {
        let seat = if o == TEAM1 { 1 } else { 0 };
        g.fixture_resolve(b as u8, o, seat, [seat; 6], [seat; 6]);
        if o != VOID {
            score[o as usize] += 1;
        }
    }
    g.set_score(score);
    let (r, ev) = ok(&g, claim(1, "EIGHTS", [1, 1, 3, 3, 5, 5]));
    assert_eq!(r.phase(), FINISHED);
    assert_eq!(r.awarded(), [4, 4]);
    assert!(ev.contains(&Event::GameOver {
        score: [4, 4],
        winner: TIE
    }));
}

/* ------------------------------ §7 vector 8: the turn-holder emptied by a declare --- */

#[test]
fn vector_8_turn_holder_emptied_by_another_seats_declare() {
    let s = game54(
        hands54(
            &[(0, &["2C", "3C"]), (2, &["4C", "5C"]), (3, &["6C", "7C"])],
            &[0, 1, 2, 4, 5],
        ),
        3,
    );
    assert_eq!(s.hand(3), bit(c("6C")) | bit(c("7C")));
    let (r, ev) = ok(&option_to(&s, 0), claim(0, "LOW-C", low_c_correct()));
    assert_eq!(r.set_outcome(set_index("LOW-C")), TEAM1);
    assert!(ev.contains(&Event::PlayerOut { seat: 3 }));
    assert_eq!((r.phase(), r.turn(), r.window()), (AWAIT_PASS, 3, None));
    assert_eq!(
        refuse(&r, Action::Pass { seat: 3, to: 4 }),
        ErrorCode::PassTargetNotTeammate
    );
    assert_eq!(refuse(&r, Action::Pass { seat: 3, to: 3 }), ErrorCode::PassTargetOut);
    assert_eq!(refuse(&r, Action::Pass { seat: 1, to: 5 }), ErrorCode::NotYourTurn);
    let (passed, ev) = ok(&r, Action::Pass { seat: 3, to: 5 });
    assert_eq!(ev, vec![Event::Pass { from: 3, to: 5 }]);
    assert_eq!((passed.phase(), passed.turn()), (PLAYING, 5));
    assert_eq!(passed.window(), Some(Window { option: 5, declined: 0 }));
    assert!(conserved(&passed));
    // With seat 3's whole team out instead, and only then, the turn advances (wrapping) to the next seat with cards.
    let s = game54(
        hands54(&[(0, &["2C", "3C"]), (2, &["4C", "5C"]), (3, &["6C", "7C"])], &[0, 2]),
        3,
    );
    let (r, _) = ok(&option_to(&s, 0), claim(0, "LOW-C", low_c_correct()));
    assert_eq!((r.phase(), r.turn()), (PLAYING, 0));
    assert_eq!(r.window(), Some(Window { option: 0, declined: 0 }));
    // An out-of-turn declarer who empties themselves drops out and does not pass.
    let s = game54(hands54(&low_c_on_team_a(), &[1, 2, 3, 4, 5]), 3);
    let (r, ev) = ok(&option_to(&s, 0), claim(0, "LOW-C", low_c_correct()));
    assert!(ev.contains(&Event::PlayerOut { seat: 0 }));
    assert_eq!((r.phase(), r.turn()), (PLAYING, 3));
    // The turn-holder emptied by their own declare passes to a teammate.
    let s = game54(hands54(&low_c_on_team_a(), &[1, 2, 3, 4, 5]), 0);
    let (r, _) = ok(&s, claim(0, "LOW-C", low_c_correct()));
    assert_eq!((r.phase(), r.window()), (AWAIT_PASS, None));
    assert_eq!(refuse(&r, Action::Decline { seat: 0 }), ErrorCode::NoDeclareWindow);
    let (p, _) = ok(&r, Action::Pass { seat: 0, to: 2 });
    assert_eq!(
        (p.phase(), p.turn(), p.window()),
        (PLAYING, 2, Some(Window { option: 2, declined: 0 }))
    );
}

/* ---------------------------------------------- §7 vector 9: a cardless declarer --- */

#[test]
fn vector_9_cardless_declarer() {
    let s = game54(
        hands54(&[(0, &["2C", "3C", "4C"]), (4, &["5C", "6C", "7C"])], &[0, 1, 3, 4, 5]),
        0,
    );
    assert_eq!(s.hand(2), 0);
    let at2 = option_to(&s, 2);
    assert_eq!(at2.window(), Some(Window { option: 2, declined: 2 }));
    let a = asg(
        "LOW-C",
        &[("2C", 0), ("3C", 0), ("4C", 0), ("5C", 4), ("6C", 4), ("7C", 4)],
    );
    let (r, _) = ok(&at2, claim(2, "LOW-C", a));
    assert_eq!((r.set_outcome(set_index("LOW-C")), r.turn()), (TEAM0, 0));
    assert!(conserved(&r));
}

#[test]
fn must_declare_when_no_ask_can_follow() {
    // Team A cardless, team B holds everything, turn on seat 1.
    let s = game54(hands54(&[], &[1, 3, 5]), 1);
    assert!(!s.turn_holder_can_ask());
    assert_eq!(refuse(&s, Action::Decline { seat: 1 }), ErrorCode::MustDeclare);
    assert_eq!(refuse(&s, Action::Decline { seat: 3 }), ErrorCode::NotYourOption);
    let mut asks = AskList::new();
    s.legal_asks(1, &mut asks);
    assert_eq!(s.legal_kinds(1, &asks), KIND_CLAIM);
    // The only move is a declare, and a table that can only declare reaches the clinch in five.
    let mut g = s;
    let mut steps = 0;
    while g.phase() != FINISHED {
        steps += 1;
        assert!(steps <= 5);
        let seat = g.acting_seat();
        let set = g.first_open_set().unwrap();
        let mut assign = [0u8; 6];
        for (j, &card) in SET_CARDS[set as usize].iter().enumerate() {
            assign[j] = g.owner(card);
        }
        g = ok(&g, Action::Claim { seat, set, assign }).0;
        assert!(check_invariants(&g).is_empty(), "{:?}", check_invariants(&g));
    }
    assert_eq!((steps, g.score()), (5, [0, 5]));
    // A cardless team forced to declare gifts the set away.
    let mut s2 = s;
    s2.set_window(Some(Window { option: 0, declined: 3 }));
    assert_eq!(refuse(&s2, Action::Decline { seat: 0 }), ErrorCode::MustDeclare);
    let (r, _) = ok(&s2, claim(0, "LOW-C", [0, 0, 2, 2, 4, 4]));
    assert_eq!((r.set_outcome(0), r.score()), (TEAM1, [0, 1]));
    // It also fires when the turn-holder's hand is complete sets, opponents or not.
    let mine: &[&str] = &["2C", "3C", "4C", "5C", "6C", "7C", "9C", "TC", "JC", "QC", "KC", "AC"];
    let s = game54(hands54(&[(0, mine)], &[1, 2, 3, 4, 5]), 0);
    assert!(!s.turn_holder_can_ask());
    assert_eq!(refuse(&s, Action::Decline { seat: 0 }), ErrorCode::MustDeclare);
    let (r, _) = ok(&s, claim(0, "LOW-C", [0; 6]));
    assert_eq!(refuse(&r, Action::Decline { seat: 0 }), ErrorCode::MustDeclare);
}

#[test]
fn error_orderings_of_the_reference() {
    // Ask: TARGET_TEAMMATE before TARGET_SELF; INVALID_ACTION for a non-seat target; INVALID_CARD after TARGET_OUT.
    let g = close_window(&game54(hands54(&[], ALL), 0));
    assert_eq!(
        refuse(
            &g,
            Action::Ask {
                seat: 0,
                target: 2,
                card: 60
            }
        ),
        ErrorCode::TargetTeammate
    );
    assert_eq!(
        refuse(
            &g,
            Action::Ask {
                seat: 0,
                target: 0,
                card: 60
            }
        ),
        ErrorCode::TargetSelf
    );
    assert_eq!(
        refuse(
            &g,
            Action::Ask {
                seat: 0,
                target: 6,
                card: 1
            }
        ),
        ErrorCode::InvalidAction
    );
    assert_eq!(
        refuse(
            &g,
            Action::Ask {
                seat: 1,
                target: 6,
                card: 1
            }
        ),
        ErrorCode::NotYourTurn
    );
    assert_eq!(
        refuse(
            &g,
            Action::Ask {
                seat: 0,
                target: 1,
                card: 54
            }
        ),
        ErrorCode::InvalidCard
    );
    let own = g.hand(0).trailing_zeros() as u8;
    assert_eq!(
        refuse(
            &g,
            Action::Ask {
                seat: 0,
                target: 1,
                card: own
            }
        ),
        ErrorCode::AskingOwnCard
    );
    // Claim: WRONG_PHASE before BOOK_RESOLVED (the us54 order), NOT_YOUR_OPTION, INVALID_ACTION for set 9.
    let s = game54(hands54(&low_c_on_team_a(), ALL), 0);
    let (resolved, _) = ok(&s, claim(0, "LOW-C", low_c_correct()));
    assert_eq!(
        refuse(&resolved, claim(0, "LOW-C", low_c_correct())),
        ErrorCode::BookResolved
    );
    assert_eq!(
        refuse(&resolved, claim(6, "LOW-C", low_c_correct())),
        ErrorCode::BookResolved
    );
    assert_eq!(
        refuse(
            &resolved,
            Action::Claim {
                seat: 6,
                set: 9,
                assign: [0; 6]
            }
        ),
        ErrorCode::NotYourOption
    );
    assert_eq!(
        refuse(
            &resolved,
            Action::Claim {
                seat: 0,
                set: 9,
                assign: [0; 6]
            }
        ),
        ErrorCode::InvalidAction
    );
    assert_eq!(
        refuse(
            &resolved,
            Action::Claim {
                seat: 0,
                set: 1,
                assign: [0, 0, 0, 0, 0, 6]
            }
        ),
        ErrorCode::AssignOpponent
    );
    assert_eq!(
        refuse(
            &resolved,
            Action::Claim {
                seat: 0,
                set: 1,
                assign: [0, 1, 0, 0, 0, 0]
            }
        ),
        ErrorCode::AssignOpponent
    );
    let mut fin = four_awarded(0, &[(0, &["9C", "TC"]), (2, &["JC", "QC"]), (4, &["KC", "AC"])]);
    fin = ok(
        &fin,
        claim(
            0,
            "HIGH-C",
            asg(
                "HIGH-C",
                &[("9C", 0), ("TC", 0), ("JC", 2), ("QC", 2), ("KC", 4), ("AC", 4)],
            ),
        ),
    )
    .0;
    assert_eq!(refuse(&fin, claim(0, "LOW-C", low_c_correct())), ErrorCode::WrongPhase);
    // Decline: NO_DECLARE_WINDOW, then INVALID_ACTION for a non-seat, then NOT_YOUR_OPTION.
    assert_eq!(refuse(&s, Action::Decline { seat: 6 }), ErrorCode::InvalidAction);
    assert_eq!(refuse(&fin, Action::Decline { seat: 6 }), ErrorCode::NoDeclareWindow);
    // Pass: WRONG_PHASE outside awaitPass.
    assert_eq!(refuse(&s, Action::Pass { seat: 0, to: 2 }), ErrorCode::WrongPhase);
    let (ap, _) = ok(
        &game54(hands54(&low_c_on_team_a(), &[1, 2, 3, 4, 5]), 0),
        claim(0, "LOW-C", low_c_correct()),
    );
    assert_eq!(
        refuse(&ap, Action::Pass { seat: 0, to: 6 }),
        ErrorCode::PassTargetNotTeammate
    );
    assert_eq!(refuse(&ap, Action::Pass { seat: 6, to: 2 }), ErrorCode::NotYourTurn);
}

/* ------------------------------------------------ §7 vector 10: the fuzz gate --- */

#[test]
fn vector_10_fuzz_gate_10000_games() {
    let mut fallback_alone = 0u32;
    let mut coincided = 0u32;
    let mut total_steps = 0u64;
    let mut ev = Events::new();
    for i in 0..10_000 {
        let seed = format!("us54-fuzz-{i}");
        let (mut rng, start) = fuzz_policy_rng(&seed);
        let mut g = Game::new(&seed, start).unwrap();
        let mut steps = 0;
        while g.phase() != FINISHED {
            steps += 1;
            assert!(steps <= 5000, "game {i} did not terminate");
            let a = fuzz_policy_action(&g, &mut rng);
            let before = g.move_index();
            if let Err(e) = g.apply(&a, &mut ev) {
                panic!("game {i} step {steps}: {a:?} refused ({})", e.name());
            }
            assert_eq!(g.move_index(), before + 1);
            let v = check_invariants(&g);
            assert!(v.is_empty(), "game {i} step {steps}: {v:?}");
            assert!(g.phase() <= FINISHED);
        }
        total_steps += steps as u64;
        let over = ev.as_slice().last().copied();
        let Some(Event::GameOver { winner, .. }) = over else {
            panic!("game {i} finished without game_over");
        };
        assert_ne!(winner, TIE);
        let won = g.awarded();
        assert_eq!(
            won[winner as usize], CLINCH_TARGET,
            "game {i}: the winner is not on exactly 5 sets"
        );
        if won[0].max(won[1]) < CLINCH_TARGET {
            fallback_alone += 1;
        } else if g.resolved_count() == 9 {
            coincided += 1;
        }
        assert!(conserved(&g));
    }
    assert_eq!(fallback_alone, 0, "the resolved === 9 terminator fired alone");
    assert!(coincided > 0, "no 5-4 finish at the ninth set in 10,000 games");
    assert!(total_steps > 100_000);
}

/* --------------------------------- replay-format.md §10.5: the whole H5 game 0 --- */

#[test]
fn spec_vector_10_5_the_whole_h5_game_0() {
    let seed = "athena-p0-g0a-h5-0";
    let mut rng = mixed_stub_rng(seed);
    let cols = record_game(seed, 0, |g, acting| mixed_stub_action(g, acting, &mut rng)).unwrap();
    assert_eq!((cols.steps, cols.end), (1124, "finished"));
    assert_eq!(&cols.actions[..24], "040004010402040304040405");
    assert_eq!(&cols.d[..48], "1b053de995b9134de43a37e763f9ea92709752830ec82e48");
    assert_eq!(&cols.l[..48], "915460b5ef59eaa30cf34926d51f8d947f0617ea2284446b");
    assert_eq!(&cols.v[..48], "2ff1e19e507ad997ada3994e0a85c87463ebecea07cff608");
    assert_eq!(&cols.probes[..16], "0012140000120110");
    assert_eq!(&cols.d[cols.d.len() - 16..], "71b3baa794a6f4de");
    assert_eq!(cols.deal, "e6810acfac4e1db1");
    assert_eq!(cols.game, "195ec9ea09381660");

    // The recorded line replays through the checker's replayer to the same digests, from its actions alone.
    let line = format!(
        "athena-replay-1\tH5\t0\t{seed}\t0\tstub:mixed\t{}\t{}\t{}",
        "0".repeat(40),
        "0".repeat(64),
        cols.tail()
    );
    let rec = parse_line(&line).unwrap();
    let mut r = Replayer::default();
    let res = r.replay(&rec, None);
    assert!(res.ok, "{:?}", res.mismatches);
    assert_eq!(res.steps, 1124);

    // A tampered digest is caught at its step, and a re-seated decline is refused.
    let k = 17usize;
    let mut d = cols.d.clone().into_bytes();
    d[16 * k] = if d[16 * k] == b'0' { b'1' } else { b'0' };
    let tampered = line.replace(&cols.d, std::str::from_utf8(&d).unwrap());
    let res = r.replay(&parse_line(&tampered).unwrap(), None);
    assert!(!res.ok);
    assert_eq!(res.first_step, k as i64);
    assert_eq!(res.first_field, "d");
    assert!(res.mismatches.iter().any(|m| m.what == "d" && m.at == k as i64));
    let mut actions = cols.actions.clone().into_bytes();
    // The first action is a decline by seat 0: `04 00`. Re-seat it to seat 1.
    assert_eq!(&actions[..4], b"0400");
    actions[3] = b'1';
    let reseated = line.replace(&cols.actions, std::str::from_utf8(&actions).unwrap());
    let res = r.replay(&parse_line(&reseated).unwrap(), None);
    assert_eq!(res.mismatches[0].what, "refused");
    // The refusal leaves d_0 missing too; the refusal names the divergence.
    assert_eq!((res.first_step, res.first_field), (0, "refused"));
}

/// Every gated column is compared: flipping one character of the deal, of l_k, of v_k, of the game digest, or turning
/// one probe's refusal into an acceptance, each fails the replay at the right place. An error code changed within a
/// refusal is information only.
#[test]
fn every_compared_column_is_checked() {
    let seed = "athena-p0-g0a-h5-3";
    let mut rng = mixed_stub_rng(seed);
    let cols = record_game(seed, 3, |g, acting| mixed_stub_action(g, acting, &mut rng)).unwrap();
    let meta = format!(
        "athena-replay-1\tH5\t3\t{seed}\t3\tstub:mixed\t{}\t{}",
        "0".repeat(40),
        "0".repeat(64)
    );
    let line = |c: &crate::replay::Columns| format!("{meta}\t{}", c.tail());
    let flip = |s: &str, at: usize| -> String {
        let mut b = s.as_bytes().to_vec();
        b[at] = if b[at] == b'0' { b'1' } else { b'0' };
        String::from_utf8(b).unwrap()
    };
    let mut r = Replayer::default();
    assert!(r.replay(&parse_line(&line(&cols)).unwrap(), None).ok);
    let k = 23usize;
    let cases: Vec<(&str, crate::replay::Columns, i64)> = vec![
        (
            "deal",
            crate::replay::Columns {
                deal: flip(&cols.deal, 5),
                ..cols.clone()
            },
            0,
        ),
        (
            "l",
            crate::replay::Columns {
                l: flip(&cols.l, 16 * k + 3),
                ..cols.clone()
            },
            k as i64,
        ),
        (
            "v",
            crate::replay::Columns {
                v: flip(&cols.v, 16 * k + 15),
                ..cols.clone()
            },
            k as i64,
        ),
        (
            "game",
            crate::replay::Columns {
                game: flip(&cols.game, 0),
                ..cols.clone()
            },
            0,
        ),
    ];
    for (what, c, at) in cases {
        let res = r.replay(&parse_line(&line(&c)).unwrap(), None);
        assert!(!res.ok, "{what} tampering went unseen");
        assert!(
            res.mismatches.iter().any(|m| m.what == what && m.at == at),
            "{what}: {:?}",
            res.mismatches
        );
        // A step column names the first divergence; a whole-game column leaves no step.
        let step_column = matches!(what, "l" | "v");
        assert_eq!(
            (res.first_step, res.first_field),
            if step_column { (at, what) } else { (-1, "") },
            "{what}"
        );
    }
    // A refusal recorded as an acceptance is a gated probe mismatch; another refusal code is information only.
    let refused_at = (0..cols.probes.len() / 2)
        .find(|&i| &cols.probes[2 * i..2 * i + 2] != "00")
        .unwrap();
    let mut accepted = cols.clone();
    accepted.probes.replace_range(2 * refused_at..2 * refused_at + 2, "00");
    let res = r.replay(&parse_line(&line(&accepted)).unwrap(), None);
    assert!(res
        .mismatches
        .iter()
        .any(|m| m.what == "probe" && m.at == refused_at as i64));
    let mut recoded = cols.clone();
    let other = if &cols.probes[2 * refused_at..2 * refused_at + 2] == "14" {
        "13"
    } else {
        "14"
    };
    recoded.probes.replace_range(2 * refused_at..2 * refused_at + 2, other);
    let res = r.replay(&parse_line(&line(&recoded)).unwrap(), None);
    assert!(res.ok, "an error code is information only: {:?}", res.mismatches);
    assert_eq!(res.code_diffs, 1);
}

/// Each planted mutant makes some reference-recorded game diverge, and M2 is invisible until its branch occurs.
#[cfg(feature = "mutants")]
#[test]
fn every_mutant_diverges_on_reference_games() {
    let mut lines = Vec::new();
    for i in 0..300u32 {
        let seed = format!("athena-test-mutant-{i}");
        let cols = if i % 2 == 0 {
            let mut rng = mixed_stub_rng(&seed);
            record_game(&seed, (i % 6) as u8, |g, a| mixed_stub_action(g, a, &mut rng)).unwrap()
        } else {
            let (mut rng, start) = fuzz_policy_rng(&seed);
            let c = record_game(&seed, start, |g, _| fuzz_policy_action(g, &mut rng)).unwrap();
            lines.push((seed.clone(), start, c));
            continue;
        };
        lines.push((seed, (i % 6) as u8, cols));
    }
    let text: Vec<String> = lines
        .iter()
        .map(|(seed, start, c)| {
            format!(
                "athena-replay-1\tH4\t0\t{seed}\t{start}\tt\t{}\t{}\t{}",
                "0".repeat(40),
                "0".repeat(64),
                c.tail()
            )
        })
        .collect();
    for m in [Mutant::M1, Mutant::M2, Mutant::M3, Mutant::M4, Mutant::M5] {
        let mut clean = Replayer::default();
        let mut r = Replayer::new(m);
        let mut diverged = 0;
        for line in &text {
            let rec = parse_line(line).unwrap();
            assert!(clean.replay(&rec, None).ok);
            let res = r.replay(&rec, None);
            if !res.ok {
                diverged += 1;
                if m == Mutant::M2 {
                    // Nothing before the misassigned declare differs (the game digest and the end are whole-game
                    // comparisons; probes are indexed by their position, not their step).
                    let whole_game = |w: &str| matches!(w, "probe" | "game" | "end" | "length");
                    assert!(res
                        .mismatches
                        .iter()
                        .all(|x| whole_game(x.what) || x.at >= res.first_step));
                }
            }
        }
        assert!(diverged > 0, "{m:?} was not caught in {} games", text.len());
    }
}

/// A fuzz game records and replays itself cleanly, and the census sees every step.
#[test]
fn fuzz_games_record_and_replay_with_the_census() {
    for i in 0..20 {
        let seed = format!("athena-test-replay-fuzz-{i}");
        let (mut rng, start) = fuzz_policy_rng(&seed);
        let cols = record_game(&seed, start, |g, _| fuzz_policy_action(g, &mut rng)).unwrap();
        let line = format!(
            "athena-replay-1\tH4\t{i}\t{seed}\t{start}\tfuzz\t{}\t{}\t{}",
            "0".repeat(40),
            "0".repeat(64),
            cols.tail()
        );
        let rec = parse_line(&line).unwrap();
        let mut t = crate::census::Tally::default();
        let res = Replayer::default().replay(&rec, Some(&mut t));
        assert!(res.ok, "{:?}", res.mismatches);
        assert_eq!(t.get("steps"), cols.steps as u64);
        assert_eq!((t.get("games"), t.get("finished"), t.get("fallbackAlone")), (1, 1, 0));
    }
}

/// L_t's kind bits equal their closed forms (replay-format.md §4.6) at every step of mixed games.
#[test]
fn legal_kinds_match_their_closed_forms() {
    let mut ev = Events::new();
    let mut checked = 0;
    for i in 0..20 {
        let seed = format!("athena-test-kinds-{i}");
        let mut rng = mixed_stub_rng(&seed);
        let mut g = Game::new(&seed, (i % 6) as u8).unwrap();
        let mut asks = AskList::new();
        while g.phase() != FINISHED {
            let acting = g.acting_seat();
            g.legal_asks(acting, &mut asks);
            let k = g.legal_kinds(acting, &asks);
            let open = g.window().is_some();
            assert_eq!(k & KIND_ASK != 0, !open && g.phase() == PLAYING && !asks.is_empty());
            assert_eq!(k & KIND_CLAIM != 0, open && g.resolved_count() < 9);
            assert_eq!(k & KIND_PASS != 0, g.phase() == AWAIT_PASS);
            assert_eq!(k & KIND_DECLINE != 0, open && g.turn_holder_can_ask());
            let a = mixed_stub_action(&g, acting, &mut rng);
            g.apply(&a, &mut ev).unwrap();
            checked += 1;
        }
    }
    assert!(checked > 1000);
}
