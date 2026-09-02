/**
 * The nine-style `us54` roster (STYLES.md §3) — its vector, its derivation, and the proof that
 * every entry is a *style* rather than a label.
 *
 * > **"A style that cannot be distinguished from the control is not a style."**
 *
 * So the centre of this file is `describe('every style differs from Balanced')`: one constructed
 * position per style, on which it makes a different move from the control **for the reason its
 * thesis claims** — not merely a different move. Each test names the knob and the mechanism.
 *
 * The positions are built by hand rather than sampled, because the interesting cells are rare:
 * a speculative declare inside a RULES_US54.md §3 window with exactly one guessed card, a
 * *foreign* set (STYLES.md §1.3) the seat holds nothing of, an ask state in which every legal
 * ask is a known miss. Each builder documents the inference that makes its position what it is.
 */
import { describe, expect, it } from 'vitest'
import {
  BASELINE_ASK_WEIGHTS,
  POLICY_CONSTANTS,
  STYLE_IDS,
  STYLE_PRESETS,
  STYLE_ROSTER,
  SKILL_PRESETS,
  askHitProbability,
  buildKnowledge,
  clinchTarget,
  decide,
  foreignProvableBooks,
  hashSeed,
  legalActionsSummary,
  newGame,
  rankAsks,
  rankAsksWith,
  reduce,
  resolvePolicy,
  rosterStyles,
  seatView,
  unaskableBooks,
  us54Config,
  validateStyle,
} from '../../lib/engine/index.ts'
import type {
  BookId,
  Card,
  GameAction,
  PublicEvent,
  Seat,
  SeatView,
  StyleId,
  StyleParams,
} from '../../lib/engine/index.ts'
import { ask, gs, mkView } from './util.ts'

const BALANCED = STYLE_ROSTER.balanced

/** A style played at full-strength inference — STYLES.md §2's rule for the whole roster. */
function full(style: StyleParams) {
  return { skill: SKILL_PRESETS.hard, style }
}

function move(view: SeatView, style: StyleParams, seed = 5): GameAction {
  return decide(view, full(style), seed)
}

/** Compact "what did it do" key, for asserting two styles disagree. */
function key(a: GameAction): string {
  return a.type === 'ask'
    ? `ask ${a.card}@${a.target}`
    : a.type === 'claim'
      ? `claim ${a.book}`
      : a.type
}

/* ------------------------------------------------------------ positions --- */

const EMPTY = {} as Record<Card, Seat>

function resolvedBooks(team0: BookId[], team1: BookId[]): SeatView['books'] {
  const b: SeatView['books'] = {}
  for (const x of team0) {
    b[x] = { book: x, outcome: 'team0', claimer: 0, assignments: EMPTY, actualHolders: EMPTY }
  }
  for (const x of team1) {
    b[x] = { book: x, outcome: 'team1', claimer: 0, assignments: EMPTY, actualHolders: EMPTY }
  }
  return b
}

/**
 * **The speculative-declare spot.** A RULES_US54.md §3 window open on seat 0, with exactly one
 * EV declare on the table and nothing forcing anyone's hand.
 *
 * Three sets are resolved (2–1, so neither team is near the clinch and the §1.4 scaling is
 * inert), leaving 36 cards. Seat 0 holds five of EIGHTS; `XB` is excluded from seat 0 (own
 * hand), from seats 1 and 5 (out of cards, so count exhaustion clears them) and from seat 3
 * (which missed an ask for it), leaving the two teammates {2, 4} — the EV declare's trigger,
 * since every guessed card must be guessable onto a teammate.
 *
 * `p` is then the better teammate's free slots over both teammates' free slots, which the
 * `counts` argument sets directly: `c2 / (c2 + c4)`.
 *
 * The turn sits with seat 3, whose opponents hold cards, so the window closes normally: nothing
 * is stalled and `MUST_DECLARE` never applies. Declining is a real option, which is what makes
 * this a test of the style rather than of the §3.2 fallback.
 */
function evSpot(o: {
  c2: number
  c4: number
  declined?: number
  team0?: BookId[]
  team1?: BookId[]
}): SeatView {
  const team0 = o.team0 ?? ['LOW-C', 'LOW-D']
  const team1 = o.team1 ?? ['LOW-H']
  const live = 54 - 6 * (team0.length + team1.length)
  const c3 = live - 5 - o.c2 - o.c4
  return mkView({
    seat: 0,
    hand: ['8C', '8D', '8H', '8S', 'XR'],
    counts: [5, 0, o.c2, c3, o.c4, 0],
    turn: 3,
    books: resolvedBooks(team0, team1),
    log: [gs, ask(0, 3, 'XB', false)],
    config: us54Config,
    declareWindow: { option: 0, declined: o.declined ?? 0 },
  })
}

/**
 * `evSpot` with **two** guessed cards (`XR` and `XB` both unlocated between the teammates), so
 * `declareMaxUncertain` decides whether the plan is considered at all. `p` compounds:
 * `c2/(c2+c4) · (c2−1)/(c2−1+c4)`, the greedy assignment decrementing the chosen teammate's
 * capacity so the two guesses stay jointly consistent with the public hand sizes.
 */
function evSpot2(o: { c2: number; c4: number; declined?: number }): SeatView {
  const c3 = 36 - 4 - o.c2 - o.c4
  return mkView({
    seat: 0,
    hand: ['8C', '8D', '8H', '8S'],
    counts: [4, 0, o.c2, c3, o.c4, 0],
    turn: 3,
    books: resolvedBooks(['LOW-C', 'LOW-D'], ['LOW-H']),
    log: [gs, ask(0, 3, 'XB', false), ask(0, 3, 'XR', false)],
    config: us54Config,
    declareWindow: { option: 0, declined: o.declined ?? 0 },
  })
}

/**
 * `evSpot` with `XB` pinned outright (seat 4 is out of cards, so only seat 2 remains): the whole
 * set is CERTAIN and on the team, but **not** wholly in seat 0's own hand. That is exactly the
 * line `declareOnlyOwnHand` draws.
 */
function certainSpot(): SeatView {
  return mkView({
    seat: 0,
    hand: ['8C', '8D', '8H', '8S', 'XR'],
    counts: [5, 0, 25, 6, 0, 0],
    turn: 3,
    books: resolvedBooks(['LOW-C', 'LOW-D'], ['LOW-H']),
    log: [gs, ask(0, 3, 'XB', false)],
    config: us54Config,
    declareWindow: { option: 0, declined: 0 },
  })
}

/**
 * `certainSpot` with the hand widened so that the same declare becomes **affordable**: seat 0
 * holds the same five of EIGHTS plus one card each of `LOW-D`, `HIGH-D` and `HIGH-S`.
 *
 * Declaring EIGHTS therefore leaves three cards spanning three distinct unresolved sets — past
 * the Hoarder's `minHandSize 2` and exactly on its `hoardBooks 3` — so the ask-licence gate lets
 * it through and the Hoarder banks the set like everyone else.
 *
 * This is the position that keeps hoarding a *preference* rather than a blanket refusal, and it
 * is the one that separates the Hoarder from the Turtle: `declareOnlyOwnHand` refuses a set
 * sitting on a teammate however cheap it is, while hoarding refuses only the ones that cost the
 * hand.
 *
 * Two sets are resolved (1–1), so 42 cards are live and neither team is near the clinch.
 */
function affordableCertainSpot(): SeatView {
  return mkView({
    seat: 0,
    hand: ['8C', '8D', '8H', '8S', 'XR', '2D', '9D', '9S'],
    counts: [8, 0, 25, 9, 0, 0],
    turn: 3,
    books: resolvedBooks(['LOW-C'], ['LOW-H']),
    log: [gs, ask(0, 3, 'XB', false)],
    config: us54Config,
    declareWindow: { option: 0, declined: 0 },
  })
}

/**
 * **The wholly-in-hand spot.** Seat 0 holds all six of EIGHTS and one card of `HIGH-D`, so
 * `completeOwnBook` fires — and declaring costs six cards, leaving one.
 *
 * The seat is *not* the turn-holder (seat 3 is) and it still has a legal ask into `HIGH-D`, so
 * RULES_US54.md §3.2's `MUST_DECLARE` does not apply and declining is a legal move. That is what
 * makes this a test of the style rather than of the forced path: `minHandSize 2` is free to
 * refuse here, and the ask-licence arithmetic says it should — row 7 means the six EIGHTS cards
 * buy the seat no ask at all, while the one `HIGH-D` card it would be left with is its entire
 * remaining licence.
 */
function ownSetSpot(): SeatView {
  return mkView({
    seat: 0,
    hand: ['8C', '8D', '8H', '8S', 'XR', 'XB', '9D'],
    counts: [7, 5, 10, 10, 5, 5],
    turn: 3,
    books: resolvedBooks(['LOW-C'], ['LOW-H']),
    log: [gs],
    config: us54Config,
    declareWindow: { option: 0, declined: 0 },
  })
}

/**
 * `ownSetSpot` with the hand cut to exactly the six cards of EIGHTS.
 *
 * Now seat 0 **is** the turn-holder and rows 6-7 leave it no legal ask (it holds every card of
 * the only set it holds anything of), which is RULES_US54.md §3.2's second `MUST_DECLARE` case.
 * `decline` is illegal, so the hoard gate must not be consulted — the assertion is that the
 * Hoarder declares anyway.
 */
function forcedOwnSetSpot(): SeatView {
  return mkView({
    seat: 0,
    hand: ['8C', '8D', '8H', '8S', 'XR', 'XB'],
    counts: [6, 6, 10, 10, 5, 5],
    turn: 0,
    books: resolvedBooks(['LOW-C'], ['LOW-H']),
    log: [gs],
    config: us54Config,
    declareWindow: { option: 0, declined: 0 },
  })
}

/**
 * **The foreign spot** (STYLES.md §1.3). Seat 0 holds **no card of EIGHTS at all** — it can
 * never ask into the set (RULES_US54.md row 6) — yet the public log pins five of the six on
 * teammate seat 2 and narrows the sixth to the two teammates:
 *
 *  - seat 1, which is now out of cards, missed asks for `8D` (off seat 4) and for `8D`/`XB`
 *    (off seat 3), which clears those seats. Its own row-6 constraints die with it: a seat at
 *    count 0 is cleared from every card, so every disjunct is dead and the constraint is
 *    dropped rather than forcing anything.
 *  - seats 1 and 5 are out of cards, and seat 0 holds neither card, so `8D`'s candidates
 *    collapse to {2}: seat 2 was *dealt* `8D` and still holds it.
 *  - seat 2 then hit `8C 8H 8S XR` off seat 3 in turn. The first of those carries the row-6
 *    constraint "seat 2 was dealt at least one of {8D, 8H, 8S, XR, XB}" — which `8D` above
 *    already satisfies, so it is dropped instead of forcing `XB`.
 *  - `XB` is therefore left at {2, 4}: uncertain, both teammates, `p = (c2 − 5)/(c2 − 5 + c4)`.
 *
 * The turn is seat 2, whose opponent seat 3 still holds cards, so the window closes normally
 * and declining is free.
 */
function foreignSpot(o: { c2: number; c4: number; declined?: number }): SeatView {
  const c3 = 36 - 3 - o.c2 - o.c4
  return mkView({
    seat: 0,
    hand: ['9C', 'TC', 'JC'],
    counts: [3, 0, o.c2, c3, o.c4, 0],
    turn: 2,
    books: resolvedBooks(['LOW-C', 'LOW-D'], ['LOW-H']),
    log: [
      gs,
      ask(1, 4, '8D', false),
      ask(1, 3, '8D', false),
      ask(1, 3, 'XB', false),
      ask(2, 3, '8C', true),
      ask(2, 3, '8H', true),
      ask(2, 3, '8S', true),
      ask(2, 3, 'XR', true),
    ],
    config: us54Config,
    declareWindow: { option: 0, declined: o.declined ?? 0 },
  })
}

/**
 * `evSpot` with the *same* `p` and the same single guessed card, but a teammate who is
 * **certainly** looking at the set: `XR` is pinned on seat 2 (seat 0 and seat 3 missed asks for
 * it, seat 4 was cleared by a miss from the now-cardless seat 1, seats 1 and 5 are out), so
 * seat 2 is a certain racer rather than a merely possible one.
 *
 * Nothing else about the position changes — which is the point: this is the *cost of waiting*
 * half of STYLES.md §1.2, isolated from the probability.
 */
function raceSpot(o: { declined?: number }): SeatView {
  return mkView({
    seat: 0,
    hand: ['8C', '8D', '8H', '8S'],
    counts: [4, 0, 25, 6, 1, 0],
    turn: 3,
    books: resolvedBooks(['LOW-C', 'LOW-D'], ['LOW-H']),
    log: [
      gs,
      ask(0, 3, 'XR', false),
      ask(1, 4, 'XR', false),
      ask(0, 3, 'XB', false),
    ],
    config: us54Config,
    declareWindow: { option: 0, declined: o.declined ?? 0 },
  })
}

/**
 * **The ask spot.** A `us54` state with the window CLOSED, so the only legal move is an ask
 * (RULES_US54.md §3) and every declare knob is out of the picture.
 *
 * Seat 0 holds five of LOW-C (all but `6C`) and one HIGH-D card, so its whole ask space is
 * `6C` plus the five missing HIGH-D cards. `6C` is pinned to {2, 5} by three misses, which
 * makes it the *narrow* option: a miss on it would locate it outright (`narrowing` 1), the
 * team already certainly accounts for five of LOW-C (`progress` 5/6), and a hit would COMPLETE
 * the set (`gambleBonus`). The HIGH-D cards are the *wide* option: five candidate seats, one
 * team card, and whatever hit probability `counts` gives them.
 *
 * Moving `counts` alone therefore slides the position between "the greedy ask wins" and "the
 * informative ask wins", which is precisely the Scout/Punter/Banker axis.
 */
function askSpot(counts: number[]): SeatView {
  return mkView({
    seat: 0,
    hand: ['2C', '3C', '4C', '5C', '7C', '9D'],
    counts,
    turn: 0,
    log: [gs, ask(0, 1, '6C', false), ask(0, 3, '6C', false), ask(3, 4, '6C', false)],
    config: us54Config,
  })
}

/**
 * **The all-misses spot.** Seat 0 holds four of LOW-C and nothing else, so its only legal asks
 * are `6C` and `7C`; both are pinned to the two teammates by six recorded misses, so *every*
 * legal ask is a known miss and scores identically. Nothing is left to decide but **who to hand
 * the turn to** — which is the whole content of `missTarget`.
 */
function missSpot(): SeatView {
  return mkView({
    seat: 0,
    hand: ['2C', '3C', '4C', '5C'],
    counts: [4, 3, 3, 9, 2, 15],
    turn: 0,
    books: resolvedBooks(['LOW-D', 'LOW-H'], ['LOW-S']),
    log: [
      gs,
      ask(0, 1, '6C', false),
      ask(0, 3, '6C', false),
      ask(0, 5, '6C', false),
      ask(0, 1, '7C', false),
      ask(0, 3, '7C', false),
      ask(0, 5, '7C', false),
    ],
    config: us54Config,
  })
}

/**
 * **The leak spot.** Seat 0's team certainly accounts for exactly **three** of LOW-C and two of
 * HIGH-D, and the LOW-C asks outscore the HIGH-D ones by exactly 3 points (the `wProgress`
 * difference, 18·(3−2)/6). Balanced's `leakThreshold 4` does not consider three "nearly
 * secured" and its 0.5 near-tie window could not reach 3 points anyway; Ghost's `leakThreshold
 * 3` does, and its `leakEpsilon 6` window reaches the alternative.
 */
function leakSpot(): SeatView {
  return mkView({
    seat: 0,
    hand: ['2C', '3C', '4C', '9D', 'TD'],
    counts: [5, 20, 10, 10, 5, 4],
    turn: 0,
    log: [gs],
    config: us54Config,
  })
}

/**
 * **The dead-ask spot.** MONET.md §3.2, and the one position in this file where the *score* is
 * not what has to change.
 *
 * Seat 0 holds five of LOW-C (all but `6C`) and one HIGH-D card, with the window CLOSED so the
 * only legal move is an ask. Three recorded misses pin `6C` to `{2, 4}` — **both of them seat
 * 0's teammates**, since the seats alternate — so no opponent can be holding it and every legal
 * `6C` ask is a miss this seat can prove from its own knowledge.
 *
 * The `gambleBonus` here is *earned* — the team certainly accounts for five of LOW-C and `6C`
 * really is the sixth — so the gamble correction leaves this position alone. The narrowing credit
 * was not earned, and an earlier reading of this position said it was: the two candidates are
 * seats 2 and 4, while the seat being ASKED is 1, 3 or 5, so no outcome of the ask can remove a
 * candidate and the miss teaches this seat nothing. That is the dominant class of provable miss,
 * and the narrowing correction takes the 12 off it — `18·(5/6) + 25 = 40.00`, down from the
 * `18·(5/6) + 12 + 25 = 52.00` MONET.md §3.2's census recorded.
 *
 * At 40.00 it still outscores every live ask on the board (the best is `TD@5` at 23.50), so the
 * scoring fixes alone do not save this position and only `minHitP` can refuse it — which is what
 * keeps this the `minHitP` position rather than a third scoring position.
 */
function deadAskSpot(): SeatView {
  return mkView({
    seat: 0,
    hand: ['2C', '3C', '4C', '5C', '7C', '9D'],
    counts: [6, 10, 10, 10, 6, 12], // 6 + 10 + 10 + 10 + 6 + 12 = 54
    turn: 0,
    log: [gs, ask(0, 1, '6C', false), ask(0, 3, '6C', false), ask(0, 5, '6C', false)],
    config: us54Config,
  })
}

/* ------------------------------------------------------- the vector itself --- */

describe('the STYLES.md §3 roster', () => {
  it('is exactly the nine named styles, in table order', () => {
    expect(STYLE_IDS).toEqual([
      'balanced',
      'blitz',
      'punter',
      'banker',
      'turtle',
      'hoarder',
      'scout',
      'ghost',
      'archivist',
    ])
    expect(rosterStyles().map((s) => s.label)).toEqual([
      'Balanced',
      'Blitz',
      'Punter',
      'Banker',
      'Turtle',
      'Hoarder',
      'Scout',
      'Ghost',
      'Archivist',
    ])
    for (const id of STYLE_IDS) expect(STYLE_ROSTER[id].id, id).toBe(id)
  })

  it('carries the §3 family tags and a non-empty thesis for every entry', () => {
    const families: Record<StyleId, string> = {
      balanced: 'control',
      blitz: 'aggressive',
      punter: 'aggressive',
      banker: 'conservative',
      turtle: 'passive',
      hoarder: 'optionality',
      scout: 'information',
      ghost: 'information',
      archivist: 'information',
    }
    for (const id of STYLE_IDS) {
      expect(STYLE_ROSTER[id].family, id).toBe(families[id])
      expect(STYLE_ROSTER[id].thesis.length, id).toBeGreaterThan(10)
    }
  })

  it('every style is structurally sound (validateStyle)', () => {
    for (const s of rosterStyles()) expect(validateStyle(s), s.id).toEqual([])
  })

  it('every style keeps certaintyBonus >= 20 — the STYLES.md §2 invariant', () => {
    // "Below that a style can rank an uncertain ask above a *certain hit* — that is not a
    // style, it is a bug that will dominate the results."
    for (const s of rosterStyles()) expect(s.certaintyBonus, s.id).toBeGreaterThanOrEqual(20)
  })

  it('every style is frozen — no roster entry can be mutated at runtime', () => {
    for (const s of rosterStyles()) expect(Object.isFrozen(s), s.id).toBe(true)
    expect(Object.isFrozen(STYLE_ROSTER)).toBe(true)
  })

  it('the declare thresholds are RE-DERIVED for us54, not ported from the 48-card tuning', () => {
    // STYLES.md §1.1: a bad declare used to VOID (declare iff p > q); it now GIFTS
    // (declare iff 2p - 1 > q). Same risk appetite q, different arithmetic:
    //     t_us54 = (1 + t_pagat48) / 2
    const port = (t48: number): number => Math.round(((1 + t48) / 2) * 1000) / 1000
    // The shipped 48-card policy declares at 0.80, so the baseline's appetite is q = 0.80.
    expect(STYLE_PRESETS.hard.declareThreshold).toBe(0.8)
    expect(BALANCED.declareThreshold).toBe(port(0.8)) // 0.90
    expect(STYLE_ROSTER.blitz.declareThreshold).toBe(port(0.7)) // 0.85
    expect(STYLE_ROSTER.punter.declareThreshold).toBe(port(0.55)) // 0.775
    expect(STYLE_ROSTER.hoarder.declareThreshold).toBe(port(0.95)) // 0.975
    expect(STYLE_ROSTER.archivist.foreignDeclareThreshold).toBe(port(0.9)) // 0.95
    // Nothing inherited the 48-card number itself.
    for (const s of rosterStyles()) expect(s.declareThreshold, s.id).not.toBe(0.8)
  })

  it('no style declares below the us54 EV break-even of 0.50, even on a dead board', () => {
    // With q = 0 (a provably dead board banks nothing for you) the condition 2p - 1 > q
    // collapses to p > 0.5. Below that a speculative declare is negative-EV outright, which is
    // arithmetic rather than taste — so it bounds the whole roster.
    for (const s of rosterStyles()) {
      expect(s.declareThresholdStalled, s.id).toBeGreaterThanOrEqual(0.5)
      expect(s.declareThreshold, s.id).toBeGreaterThanOrEqual(s.declareThresholdStalled)
    }
  })

  it('the §3 defining settings are present verbatim', () => {
    const r = STYLE_ROSTER
    expect([r.blitz.wHit, r.blitz.wProgress, r.blitz.leakEpsilon, r.blitz.signalling, r.blitz.missTarget])
      .toEqual([90, 30, 0, false, 'most'])
    // `minHitP` is the one entry in this file that deliberately departs from §3's row: MONET.md
    // §3.2 replaces the 0 with the dead-ask floor. Everything else on row 3 is verbatim, and the
    // floor has its own suite below.
    expect([r.punter.gambleBonus, r.punter.minHitP, r.punter.declareMaxUncertain]).toEqual([25, 1e-9, 2])
    expect([r.banker.declareOnlyWhenCertain, r.banker.minHitP, r.banker.declareEagerness, r.banker.missTarget])
      .toEqual([true, 0.25, 0.2, 'fewest'])
    expect([r.turtle.declareOnlyOwnHand, r.turtle.minHitP, r.turtle.signalling, r.turtle.foreignDeclare])
      .toEqual([true, 0.4, false, false])
    expect([r.hoarder.hoardBooks, r.hoarder.minHandSize, r.hoarder.declareEagerness]).toEqual([3, 2, 0.1])
    expect([r.scout.wNarrow, r.scout.wHit, r.scout.declareOnlyWhenCertain]).toEqual([40, 55, true])
    expect([r.ghost.leakEpsilon, r.ghost.leakThreshold, r.ghost.signalling]).toEqual([6, 3, false])
    expect([r.archivist.foreignDeclare, r.archivist.wNarrow, r.archivist.declareEagerness])
      .toEqual([true, 30, 0.7])
    // §3 row 1 pins the control on the neutral point of the clinch axis.
    expect([BALANCED.clinchAggression, BALANCED.denialWeight]).toEqual([0.5, 0.5])
  })

  it('no style carries a private stall rule (STYLES.md §3.1)', () => {
    // "If the stall-breaker needs tuning, tune it once, globally — never per-style."
    for (const s of rosterStyles()) {
      for (const k of ['stall', 'signalLookback', 'clinchSpan', 'clinchLossMagnifier', 'race']) {
        expect(Object.keys(s), `${s.id}.${k}`).not.toContain(k)
      }
    }
    expect(POLICY_CONSTANTS.stall.anyTime).toEqual([12, 24, 60])
  })
})

/* ------------------------------------ every style differs from the control --- */

describe('every style differs from Balanced, in the way its thesis claims', () => {
  it('Blitz declares on a gamble Balanced refuses (declareThreshold 0.85 vs 0.90)', () => {
    // p = 7/8 = 0.875 sits between the two bars. `declined: 5` puts both styles past any
    // window patience, so the threshold is the only thing left to disagree about.
    const v = evSpot({ c2: 7, c4: 1, declined: 5 })
    expect(key(move(v, BALANCED))).toBe('decline')
    expect(key(move(v, STYLE_ROSTER.blitz))).toBe('claim EIGHTS')
  })

  it("Blitz promotes the opponent with the MOST cards on a dead ask (missTarget 'most')", () => {
    // Every legal ask here is a known miss and they all score identically, so the only content
    // of the decision is who inherits the turn. This is also the position that proves
    // miss-targeting is no longer trapped inside `leakEpsilon`: Blitz protects no information
    // at all (leakEpsilon 0) and still targets.
    const v = missSpot()
    expect(v.counts[1]).toBe(3)
    expect(v.counts[5]).toBe(15)
    expect(key(move(v, BALANCED))).toBe('ask 6C@1') // 'fewest'
    expect(key(move(v, STYLE_ROSTER.blitz))).toBe('ask 6C@5') // 'most'
  })

  it('Punter takes a two-guess declare Balanced will not even consider (declareMaxUncertain 2)', () => {
    const v = evSpot2({ c2: 20, c4: 1, declined: 5 })
    expect(key(move(v, BALANCED))).toBe('decline')
    const a = move(v, STYLE_ROSTER.punter)
    expect(a.type).toBe('claim')
    if (a.type !== 'claim') return
    expect(a.book).toBe('EIGHTS')
    expect(a.assignments['XR']).toBe(2)
    expect(a.assignments['XB']).toBe(2)
  })

  it('Punter chases the card that would COMPLETE a set (gambleBonus 25)', () => {
    // `6C` is the whole remainder of LOW-C for seat 0's team, so a hit banks the set outright.
    // Balanced scores it on its merits and prefers the higher-probability HIGH-D ask.
    const v = askSpot([6, 25, 12, 3, 6, 2])
    expect(key(move(v, BALANCED))).toBe('ask TD@1')
    expect(key(move(v, STYLE_ROSTER.punter))).toBe('ask 6C@5')
  })

  it('Banker refuses the speculative declare outright (declareOnlyWhenCertain)', () => {
    const v = evSpot({ c2: 24, c4: 1, declined: 5 }) // p = 0.96, well past Balanced's 0.90
    expect(key(move(v, BALANCED))).toBe('claim EIGHTS')
    expect(key(move(v, STYLE_ROSTER.banker))).toBe('decline')
  })

  it('Banker refuses a long-shot ask Balanced takes (minHitP 0.25)', () => {
    // The best-scoring ask is a 9% shot that happens to be maximally informative; Banker will
    // not buy it and takes the 31% ask instead.
    const v = askSpot([6, 15, 20, 3, 8, 2])
    expect(key(move(v, BALANCED))).toBe('ask 6C@5')
    expect(key(move(v, STYLE_ROSTER.banker))).toBe('ask TD@1')
  })

  it('Turtle refuses a set that is CERTAIN but not wholly in its own hand (declareOnlyOwnHand)', () => {
    const v = certainSpot()
    const a = move(v, BALANCED)
    expect(a.type).toBe('claim')
    if (a.type === 'claim') expect(a.assignments['XB']).toBe(2) // on a teammate, not seat 0
    expect(key(move(v, STYLE_ROSTER.turtle))).toBe('decline')
  })

  it('Hoarder keeps its ask-licences rather than spend the hand on a gamble (hoardBooks/minHandSize)', () => {
    // Declaring EIGHTS spends all five cards seat 0 holds: nothing left in hand, and — by
    // RULES_US54.md row 6 — no licence to ask into any set at all.
    const v = evSpot({ c2: 24, c4: 1, declined: 5 })
    expect(key(move(v, BALANCED))).toBe('claim EIGHTS')
    expect(key(move(v, STYLE_ROSTER.hoarder))).toBe('decline')
    // ...and it is the hoard knobs doing it, not the threshold: same style, knobs off, claims.
    const unhoarded: StyleParams = { ...STYLE_ROSTER.hoarder, hoardBooks: 0, minHandSize: 0, declareThreshold: 0.9 }
    expect(key(move(v, unhoarded))).toBe('claim EIGHTS')
  })

  it('Hoarder refuses a CERTAIN set that would empty its hand — the gate is not speculative-only', () => {
    // The behaviour that makes the style measurable at all. Gating `evClaim` alone left the
    // Hoarder byte-identical to Balanced over 67,262 real `us54` decisions, because no
    // speculative declare in that population ever cleared even `declareThreshold 0.775` and the
    // knobs behind it were unreachable. See STYLES.md §3.1.
    const v = certainSpot()
    expect(key(move(v, BALANCED))).toBe('claim EIGHTS')
    expect(key(move(v, STYLE_ROSTER.hoarder))).toBe('decline')
    // ...and it is the hoard knobs doing it, not `declareOnlyOwnHand`, which the Hoarder is not
    // carrying: turn the two knobs off and the same vector banks the set.
    const unhoarded: StyleParams = { ...STYLE_ROSTER.hoarder, hoardBooks: 0, minHandSize: 0 }
    expect(key(move(v, unhoarded))).toBe('claim EIGHTS')
  })

  it('Hoarder still banks a certain set it can AFFORD — hoarding is a preference, not a refusal', () => {
    // The other side of the same knob, and the line between the Hoarder and the Turtle: three
    // cards spanning three unresolved sets survive this declare, so both gates clear.
    const v = affordableCertainSpot()
    expect(key(move(v, BALANCED))).toBe('claim EIGHTS')
    expect(key(move(v, STYLE_ROSTER.hoarder))).toBe('claim EIGHTS')
    // Turtle refuses it for its own, different reason (the set is not wholly in its own hand).
    expect(key(move(v, STYLE_ROSTER.turtle))).toBe('decline')
    // One card fewer and the licence count drops to 2, under `hoardBooks 3`: it refuses again.
    const thinner: SeatView = { ...v, hand: v.hand.filter((c) => c !== '9S'), counts: [7, 0, 25, 10, 0, 0] }
    expect(key(move(thinner, BALANCED))).toBe('claim EIGHTS')
    expect(key(move(thinner, STYLE_ROSTER.hoarder))).toBe('decline')
  })

  it('Hoarder refuses even a set wholly in its own hand when that would spend the hand', () => {
    // RULES_US54.md row 7 means the six EIGHTS cards buy seat 0 no ask at all, so `hoardBooks`
    // does not count them; it is `minHandSize 2` that bites, against the single `HIGH-D` card
    // that is the seat's whole remaining ask-licence.
    const v = ownSetSpot()
    expect(key(move(v, BALANCED))).toBe('claim EIGHTS')
    expect(key(move(v, STYLE_ROSTER.hoarder))).toBe('decline')
    const unhoarded: StyleParams = { ...STYLE_ROSTER.hoarder, minHandSize: 0, hoardBooks: 0 }
    expect(key(move(v, unhoarded))).toBe('claim EIGHTS')
  })

  it('...but declares it when RULES_US54.md §3.2 makes declining illegal (MUST_DECLARE)', () => {
    // The turn-holder's hand is a union of complete unresolved sets, so it has no legal ask and
    // `decline` is illegal. No style knob may refuse here — the table would hang. This is the
    // safety property that lets the gate reach `completeOwnBook` at all.
    const v = forcedOwnSetSpot()
    expect(v.turn).toBe(0)
    for (const s of rosterStyles()) {
      expect(key(move(v, s)), `${s.id} must declare`).toBe('claim EIGHTS')
    }
  })

  it('hoarding never blocks a FOREIGN declare, which spends nothing', () => {
    // Seat 0 holds no card of EIGHTS, so declaring it cannot drop the hand or cost a licence.
    // A Hoarder with the Archivist's foreign bar therefore declares exactly as the Archivist
    // does — proof the gate prices the spend and not the risk.
    const v = foreignSpot({ c2: 25, c4: 1, declined: 1 })
    expect(unaskableBooks(v)).toContain('EIGHTS')
    const foreignHoarder: StyleParams = {
      ...STYLE_ROSTER.hoarder,
      foreignDeclareThreshold: STYLE_ROSTER.archivist.foreignDeclareThreshold,
      declareThreshold: STYLE_ROSTER.archivist.declareThreshold,
      declareEagerness: STYLE_ROSTER.archivist.declareEagerness,
    }
    expect(key(move(v, foreignHoarder))).toBe('claim EIGHTS')
  })

  it('Scout buys the information instead of the card (wNarrow 40, wHit 55)', () => {
    // `6C` is a 14% shot whose miss would locate it outright; `TD` is a 52% shot that narrows
    // almost nothing. Balanced takes the card, Scout takes the deduction.
    const v = askSpot([6, 25, 12, 3, 6, 2])
    expect(key(move(v, BALANCED))).toBe('ask TD@1')
    expect(key(move(v, STYLE_ROSTER.scout))).toBe('ask 6C@5')
  })

  it('Ghost refuses to announce interest in a set its team is already halfway through (leakThreshold 3, leakEpsilon 6)', () => {
    const v = leakSpot()
    expect(key(move(v, BALANCED))).toBe('ask 5C@1') // straight into LOW-C, 3 of 6 already ours
    expect(key(move(v, STYLE_ROSTER.ghost))).toBe('ask JD@1') // 3 points worse, and silent
    // Both halves matter: the wider window alone is not enough without the lower threshold.
    const wideOnly: StyleParams = { ...STYLE_ROSTER.ghost, leakThreshold: 4 }
    expect(key(move(v, wideOnly))).toBe('ask 5C@1')
  })

  it('Archivist declares a set it holds NO card of, which Balanced leaves on the table', () => {
    // STYLES.md §1.3 / RULES_US54.md row 15 — the project owner's "memorize half-suits you do
    // not own". p = 20/21 = 0.952 sits between the Archivist's foreign bar (0.95) and the
    // generalist's (0.975).
    const v = foreignSpot({ c2: 25, c4: 1, declined: 1 })
    expect(unaskableBooks(v)).toContain('EIGHTS')
    expect(key(move(v, BALANCED))).toBe('decline')
    const a = move(v, STYLE_ROSTER.archivist)
    expect(a.type).toBe('claim')
    if (a.type !== 'claim') return
    expect(a.book).toBe('EIGHTS')
    expect(Object.values(a.assignments).every((s) => s === 2)).toBe(true)
    // ...and it is the foreign bar doing it: turn foreign declares off and it declines again.
    const noForeign: StyleParams = { ...STYLE_ROSTER.archivist, foreignDeclare: false }
    expect(key(move(v, noForeign))).toBe('decline')
  })

  it('and the whole roster is pairwise distinguishable across the constructed positions', () => {
    const positions: SeatView[] = [
      evSpot({ c2: 7, c4: 1, declined: 5 }),
      evSpot({ c2: 24, c4: 1, declined: 5 }),
      evSpot({ c2: 24, c4: 1, declined: 1 }),
      evSpot2({ c2: 20, c4: 1, declined: 5 }),
      certainSpot(),
      // Without this one the Hoarder and the Turtle collapse onto the same fingerprint: every
      // other declare position above is one the Hoarder cannot afford, and refusing is also
      // what `declareOnlyOwnHand` does. This is the position where they part.
      affordableCertainSpot(),
      ownSetSpot(),
      foreignSpot({ c2: 25, c4: 1, declined: 1 }),
      raceSpot({ declined: 1 }),
      askSpot([6, 15, 20, 3, 8, 2]),
      askSpot([6, 25, 12, 3, 6, 2]),
      missSpot(),
      leakSpot(),
    ]
    const fingerprint = new Map<StyleId, string>()
    for (const id of STYLE_IDS) {
      fingerprint.set(id, positions.map((v) => key(move(v, STYLE_ROSTER[id]))).join('|'))
    }
    for (const id of STYLE_IDS) {
      if (id === 'balanced') continue
      expect(fingerprint.get(id), `${id} is indistinguishable from Balanced`).not.toBe(
        fingerprint.get('balanced'),
      )
    }
    // No two styles collapse onto each other either.
    expect(new Set(fingerprint.values()).size).toBe(STYLE_IDS.length)
  })
})

/* --------------------------------------------- the dead-ask floor (MONET.md §3.2) --- */

/**
 * Play `games` whole `us54` games with every seat on `style`, and count the asks the mover's own
 * knowledge proved were misses.
 *
 * `dead` is every such ask; `avoidable` is the subset where a live ask was also on the board,
 * which is the only class `minHitP` can refuse — when every legal ask is dead the floor is waived
 * so the seat still acts (`decide.ts` `preferredAsk`). The two are reported separately because
 * conflating them is how a floor gets credited with removing misses no filter could remove.
 *
 * Knowledge is rebuilt with `buildKnowledge(view)`, which is full-strength. Sound for `hard` and
 * `medium`, whose skill presets read the whole log with constraints on and `errorRate: 0`; NOT
 * sound for `easy`, which sees a 6-event window and blunders 25% of asks, so an ask that is dead
 * under full knowledge may be perfectly reasonable under easy's.
 */
function deadAskSweep(
  style: StyleParams,
  skill: (typeof SKILL_PRESETS)['hard'],
  games: number,
): { decisions: number; asks: number; dead: number; avoidable: number } {
  let decisions = 0
  let asks = 0
  let dead = 0
  let avoidable = 0
  for (let i = 0; i < games; i++) {
    const seed = `roster-tier-floor-${i}`
    let s = newGame(seed, us54Config, ((i * 5 + 1) % 6) as Seat)
    let steps = 0
    while (s.phase !== 'finished') {
      if (steps >= 5000) throw new Error(`${seed}: hit the 5000-step cap`)
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const a = decide(view, { skill, style }, hashSeed(`${seed}:${s.moveIndex}`)())
      decisions++
      if (a.type === 'ask') {
        asks++
        if (askHitProbability(buildKnowledge(view), a.card, a.target) === 0) {
          dead++
          if (rankAsks(view).some((r) => r.p > 0)) avoidable++
        }
      }
      const r = reduce(s, a)
      if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code}`)
      s = r.state
      steps++
    }
  }
  return { decisions, asks, dead, avoidable }
}

describe('the dead-ask floor (MONET.md §3.2)', () => {
  it('every ROSTER style carries a positive minHitP, so none of them considers a provable miss', () => {
    for (const id of STYLE_IDS) {
      expect(STYLE_ROSTER[id].minHitP, `${id}.minHitP`).toBeGreaterThan(0)
    }
    // The two that already carried a long-shot appetite keep it; the rest take the floor.
    expect(STYLE_ROSTER.banker.minHitP).toBe(0.25)
    expect(STYLE_ROSTER.turtle.minHitP).toBe(0.4)
    for (const id of STYLE_IDS) {
      if (id === 'banker' || id === 'turtle') continue
      expect(STYLE_ROSTER[id].minHitP, `${id}.minHitP`).toBe(1e-9)
    }
  })

  it('the three shipped TIERS do NOT carry it — the floor is roster-only, deliberately', () => {
    // The scope of MONET.md §3.2, pinned rather than implied. `STYLE_PRESETS.easy/medium/hard`
    // spread `BASELINE`, which spreads `BASELINE_ASK_WEIGHTS` — and that is where `minHitP: 0`
    // still lives, so `decide(view, 'hard', seed)`, the tier the play surface runs, takes no
    // dead-ask filter at all.
    //
    // Deliberate, and style.ts's standing discipline rather than an oversight: the three tiers
    // are frozen, and every mechanism since CONTAINMENT.md has been introduced switched off in
    // `BASELINE` and carried at its measured appetite in the roster instead (`containedPass: 0`,
    // `defuse: 0`, `conceal: 0` each say so in their own comment). §3.2's arm is Punter
    // throughout, so extending the floor to `BASELINE` would move three shipped policies that
    // the milestone never measured.
    //
    // What makes that safe rather than merely conventional is the test below: the two
    // `rankAsksWith` corrections DO reach the tiers, because they are in the scorer rather than
    // in a style, and they turn out to be the whole of what the tiers needed.
    for (const tier of ['easy', 'medium', 'hard'] as const) {
      expect(STYLE_PRESETS[tier].minHitP, `${tier}.minHitP`).toBe(0)
      expect(resolvePolicy(tier).style.minHitP, `resolvePolicy(${tier}).style.minHitP`).toBe(0)
    }
    expect(BASELINE_ASK_WEIGHTS.minHitP).toBe(0)
  })

  it('...and they no longer need it: the scoring fixes alone retire their AVOIDABLE dead asks', () => {
    // The measurement that turns "roster-only" from a caveat into a bounded one. An *avoidable*
    // dead ask is one this seat's own knowledge proves is a miss while a live ask was on the
    // board — the class `minHitP` exists to refuse. Over 40 whole `us54` games at the hard tier
    // there are now none.
    //
    // Cross-revision, on these exact seeds (`scratchpad/p8-crossrev-tiers.mjs`, `git show HEAD`
    // vs the working tree): hard 20 avoidable -> 0, medium 42 -> 0. The tiers carry
    // `gambleBonus: 0`, so the completion bonus never lifted a dead ask for them; what did was
    // the narrowing credit, and the narrowing correction reaches every style. The floor's
    // absence from the tiers is therefore a LATENT gap — nothing in this sample is left for it
    // to catch — and not a shipped defect. If a later change re-opens it, this is the test that
    // reports it.
    const sweep = deadAskSweep(STYLE_PRESETS.hard, SKILL_PRESETS.hard, 40)
    // Non-vacuity first: a sweep that played no asks would report 0 avoidable and prove nothing.
    expect(sweep.asks, 'the sweep must actually reach the ask policy').toBeGreaterThan(3000)
    expect(sweep.avoidable, 'avoidable dead asks at the hard tier').toBe(0)
    // The dead asks that remain are the ones no floor could have refused: every legal ask was a
    // provable miss, which is exactly the case `preferredAsk` waives the floor for.
    expect(sweep.dead, 'unavoidable dead asks — the waiver case, which must survive').toBeGreaterThan(0)
  })

  it('the floor sits below every hit probability the ranker can reach, so it is a partition', () => {
    // 1/54 is the smallest non-zero `pHit` any position can produce (knowledge.test.ts sweeps
    // 20,000 real asks for it). A floor under that expresses no appetite at all — it separates
    // "provably dead" from "everything else" and reorders nothing. Pinned here so that a later
    // edit cannot quietly turn a correctness knob back into a taste.
    for (const id of STYLE_IDS) {
      const floor = STYLE_ROSTER[id].minHitP
      if (floor === 1e-9) expect(floor, `${id}`).toBeLessThan(1 / 54)
    }
  })

  it('refuses a provable miss that outscores every live ask, and takes the live ask instead', () => {
    const view = deadAskSpot()
    const k = buildKnowledge(view)
    const ranked = rankAsksWith(view, k, STYLE_ROSTER.punter)
    // The premise: the dead ask really is the top of the ranking even after the narrowing
    // correction has taken 12 off it, and a live ask really is available under it.
    expect([ranked[0].card, ranked[0].p, ranked[0].score]).toEqual(['6C', 0, 40])
    const bestLive = ranked.find((r) => r.p > 0)
    expect(bestLive?.score, 'a live ask must exist, and must still be outscored').toBe(23.5)

    const played = move(view, STYLE_ROSTER.punter)
    const chosen = ranked.find((r) => played.type === 'ask' && r.card === played.card && r.target === played.target)
    expect(chosen?.p, `played ${key(played)}`).toBeGreaterThan(0)
  })

  it('...and it is the floor doing it: the same style at minHitP 0 takes the dead ask', () => {
    // The counterfactual, so the test above cannot pass for some unrelated reason. This is
    // exactly what the whole roster did before MONET.md §3.2.
    expect(key(move(deadAskSpot(), { ...STYLE_ROSTER.punter, minHitP: 0 }))).toBe('ask 6C@1')
  })

  it('waives the floor when EVERY legal ask is dead, so a starved seat still acts', () => {
    // Not a regression test — this held before the floor existed and has to keep holding. In
    // `missSpot` both legal cards are pinned to the two teammates, so nothing clears any floor;
    // dropping the whole pool would leave the seat with no move at all (decide.ts:1109-1112).
    for (const id of STYLE_IDS) {
      const a = move(missSpot(), STYLE_ROSTER[id])
      expect(a.type, `${id} must still act`).toBe('ask')
    }
  })
})

/* ------------------------------------------- declareEagerness as a trade-off --- */

describe('declareEagerness is a trade-off, not a clock (STYLES.md §1.2)', () => {
  it('a patient style still fires once the option has travelled far enough', () => {
    const v = (declined: number): SeatView => evSpot({ c2: 24, c4: 1, declined })
    expect(key(move(v(0), BALANCED))).toBe('decline')
    expect(key(move(v(5), BALANCED))).toBe('claim EIGHTS')
  })

  it('the same style waits LESS when a teammate is certainly looking at the same set', () => {
    // Identical p (0.96), identical single guessed card, identical window position. The only
    // difference is that in `raceSpot` teammate seat 2 is CERTAINLY holding a card of the set,
    // so it can see it too — and a teammate who declares it wrongly first gifts it (row 14).
    const calm = evSpot({ c2: 24, c4: 1, declined: 1 })
    const racy = raceSpot({ declined: 1 })
    const kCalm = buildKnowledge(calm)
    const kRacy = buildKnowledge(racy)
    // Same probability, so the divergence cannot be a threshold effect.
    expect(kCalm.unknownSlots[2] / (kCalm.unknownSlots[2] + kCalm.unknownSlots[4])).toBeCloseTo(0.96, 6)
    expect(kRacy.unknownSlots[2] / (kRacy.unknownSlots[2] + kRacy.unknownSlots[4])).toBeCloseTo(0.96, 6)
    expect(kRacy.holders['XR']).toBe(2) // the certain racer
    expect(kCalm.holders['XR']).toBe(0) // seat 0's own card; no teammate is certain of anything
    expect(key(move(calm, BALANCED))).toBe('decline')
    expect(key(move(racy, BALANCED))).toBe('claim EIGHTS')
  })

  it('and waits MORE while it still has cards left to resolve', () => {
    // The other half of §1.2: "waiting one more ask may resolve your last uncertain card".
    // Two guessed cards is more still-resolvable than one, so the same style holds off longer.
    const patient: StyleParams = { ...BALANCED, declareMaxUncertain: 2 }
    const one = evSpot({ c2: 24, c4: 1, declined: 2 })
    const two = evSpot2({ c2: 24, c4: 1, declined: 2 })
    expect(key(move(one, patient))).toBe('claim EIGHTS')
    expect(key(move(two, patient))).toBe('decline')
    // ...and it is patience, not the probability: at the end of the window it declares.
    expect(key(move(evSpot2({ c2: 24, c4: 1, declined: 5 }), patient))).toBe('claim EIGHTS')
  })

  it('eagerness 1 fires at the first offer whatever the race looks like (the shipped presets)', () => {
    for (const v of [evSpot({ c2: 24, c4: 1, declined: 0 }), raceSpot({ declined: 0 })]) {
      expect(STYLE_PRESETS.hard.declareEagerness).toBe(1)
      expect(decide(v, 'hard', 5).type).toBe('claim')
    }
  })
})

/* -------------------------------------------- foreignDeclare / the Archivist --- */

describe('foreign sets — the knowledge layer tracks what the seat can never ask into', () => {
  it('unaskableBooks names exactly the unresolved sets the seat holds no card of', () => {
    const v = foreignSpot({ c2: 25, c4: 1 })
    const unaskable = unaskableBooks(v)
    // Seat 0 holds 9C/TC/JC, so HIGH-C is the one live set it CAN ask into.
    expect(unaskable).not.toContain('HIGH-C')
    expect(unaskable).toContain('EIGHTS')
    // Resolved sets are not "unaskable", they are over.
    for (const b of ['LOW-C', 'LOW-D', 'LOW-H'] as BookId[]) expect(unaskable).not.toContain(b)
  })

  it('foreignProvableBooks is empty until the last card is pinned, then names the set', () => {
    const speculative = foreignSpot({ c2: 25, c4: 1 })
    expect(foreignProvableBooks(buildKnowledge(speculative), speculative)).toEqual([])
    // Take seat 4's last card away and XB collapses onto seat 2: now the set is provable.
    const proven: SeatView = { ...speculative, counts: [3, 0, 26, 7, 0, 0] }
    expect(foreignProvableBooks(buildKnowledge(proven), proven)).toEqual(['EIGHTS'])
  })

  it('a cardless seat is foreign to every live set, and Turtle therefore declares nothing', () => {
    const v: SeatView = { ...foreignSpot({ c2: 25, c4: 1, declined: 1 }), hand: [], counts: [0, 0, 28, 7, 1, 0] }
    expect(unaskableBooks(v).length).toBe(6) // the six unresolved sets
    expect(key(move(v, STYLE_ROSTER.turtle))).toBe('decline')
  })

  it('the foreign bar is scoped to foreign sets only', () => {
    // In `evSpot` seat 0 holds five of EIGHTS, so the set is NOT foreign and the Archivist's
    // separate bar must not touch it — it declares on the ordinary 0.90 like the control.
    const v = evSpot({ c2: 24, c4: 1, declined: 5 })
    expect(unaskableBooks(v)).not.toContain('EIGHTS')
    expect(key(move(v, STYLE_ROSTER.archivist))).toBe('claim EIGHTS')
  })
})

/* --------------------------------------------------------------- the clinch --- */

describe('the clinch (STYLES.md §1.4 / RULES_US54.md §5)', () => {
  const CLINCH = clinchTarget(us54Config)

  it('is a 5-set race in this variant', () => {
    expect(CLINCH).toBe(5)
  })

  it('a declare that could hand the opponents their 5th is held to a far higher bar', () => {
    // Same position, same p = 0.95, same style. The only difference is WHO owns the four
    // resolved sets. With the opponents at 4, a failed declare does not cost a set — row 14
    // gifts them the set that ENDS THE GAME — so the tolerated failure probability shrinks by
    // POLICY_CONSTANTS.clinchLossMagnifier and 0.95 is no longer enough.
    const four: BookId[] = ['LOW-C', 'LOW-D', 'LOW-H', 'LOW-S']
    const mine = evSpot({ c2: 19, c4: 1, declined: 5, team0: four, team1: [] })
    const theirs = evSpot({ c2: 19, c4: 1, declined: 5, team0: [], team1: four })
    expect(key(move(mine, BALANCED))).toBe('claim EIGHTS')
    expect(key(move(theirs, BALANCED))).toBe('decline')
    // The magnified bar: 1 - (1 - 0.90) / 4 = 0.975 > 0.95.
    expect(1 - (1 - BALANCED.declareThreshold) / POLICY_CONSTANTS.clinchLossMagnifier).toBeCloseTo(0.975, 6)
  })

  it('denialWeight still moves the bar inside that rule — a denier takes the same declare', () => {
    const four: BookId[] = ['LOW-C', 'LOW-D', 'LOW-H', 'LOW-S']
    const theirs = evSpot({ c2: 19, c4: 1, declined: 5, team0: [], team1: four })
    const denier: StyleParams = { ...BALANCED, denialWeight: 1 }
    expect(key(move(theirs, BALANCED))).toBe('decline')
    expect(key(move(theirs, denier))).toBe('claim EIGHTS')
  })

  it('neither clinch effect exists under pagat48, where a bad declare merely voids', () => {
    // Same style vector, 48-card rule set: `winCondition` is 'allResolved', so `teamSetCounts`
    // is never consulted and the whole §1.4 block is skipped.
    const pagatView = mkView({
      seat: 0,
      hand: ['2H', '3H', '4H', '5H', '2C', '3C', '4C', '5C'],
      counts: [8, 8, 4, 8, 4, 8],
      turn: 0,
      log: [gs, ask(2, 5, '7H', false), ask(4, 1, '6H', false)],
    })
    const denier: StyleParams = { ...BALANCED, denialWeight: 1, clinchAggression: 1 }
    expect(move(pagatView, denier)).toEqual(move(pagatView, BALANCED))
  })
})

/* ------------------------------------------------------- legality contract --- */

describe('the roster stays inside the bot contract', () => {
  it('every style answers every constructed position with a legal-shaped action', () => {
    const positions: { v: SeatView; expectKinds: GameAction['type'][] }[] = [
      { v: evSpot({ c2: 24, c4: 1, declined: 3 }), expectKinds: ['claim', 'decline'] },
      { v: certainSpot(), expectKinds: ['claim', 'decline'] },
      { v: foreignSpot({ c2: 25, c4: 1, declined: 3 }), expectKinds: ['claim', 'decline'] },
      { v: askSpot([6, 15, 20, 3, 8, 2]), expectKinds: ['ask'] },
      { v: missSpot(), expectKinds: ['ask'] },
      { v: leakSpot(), expectKinds: ['ask'] },
    ]
    for (const { v, expectKinds } of positions) {
      for (const s of rosterStyles()) {
        const a = move(v, s)
        expect(expectKinds, `${s.id}`).toContain(a.type)
        expect(a.seat, s.id).toBe(0)
        // Deterministic: same view, same style, same seed, same action.
        expect(move(v, s), s.id).toEqual(a)
      }
    }
  })

  it('a declare from any style names all six cards of the set, all on its own team', () => {
    const v = evSpot({ c2: 24, c4: 1, declined: 5 })
    for (const s of rosterStyles()) {
      const a = move(v, s)
      if (a.type !== 'claim') continue
      const seats = Object.values(a.assignments)
      expect(Object.keys(a.assignments).length, s.id).toBe(6)
      expect(seats.every((x) => x % 2 === 0), s.id).toBe(true)
    }
  })
})

/** Kept honest: the position builders above must not silently drift off `us54`. */
describe('the constructed positions are what they claim to be', () => {
  it('every builder produces a us54 view with a consistent card count', () => {
    const check = (v: SeatView, live: number): void => {
      expect(v.config).toEqual(us54Config)
      expect(v.counts.reduce((a: number, b: number) => a + b, 0)).toBe(live)
      expect(v.counts[v.seat]).toBe(v.hand.length)
    }
    check(evSpot({ c2: 24, c4: 1 }), 36)
    check(evSpot2({ c2: 24, c4: 1 }), 36)
    check(certainSpot(), 36)
    check(foreignSpot({ c2: 25, c4: 1 }), 36)
    check(raceSpot({}), 36)
    check(askSpot([6, 15, 20, 3, 8, 2]), 54)
    check(missSpot(), 36)
    check(leakSpot(), 54)
  })

  it('no window position is a forced declare — declining is always available', () => {
    // If the window could not close, RULES_US54.md §3.2 would make `decline` illegal and every
    // style would be forced to declare, which would prove nothing about any of them.
    const windows: SeatView[] = [
      evSpot({ c2: 24, c4: 1 }),
      evSpot2({ c2: 24, c4: 1 }),
      certainSpot(),
      foreignSpot({ c2: 25, c4: 1 }),
      raceSpot({}),
    ]
    for (const v of windows) {
      const turnOpponents: Seat[] = ([0, 1, 2, 3, 4, 5] as Seat[]).filter(
        (s) => s % 2 !== v.turn % 2,
      )
      expect(turnOpponents.some((s) => v.counts[s] > 0), `turn ${v.turn}`).toBe(true)
      // and the log is short, so `isDeepStalled` cannot be what is driving anyone.
      const log: PublicEvent[] = v.log
      expect(log.length).toBeLessThan(POLICY_CONSTANTS.stall.anyTime[2])
    }
  })
})
