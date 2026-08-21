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
  POLICY_CONSTANTS,
  STYLE_IDS,
  STYLE_PRESETS,
  STYLE_ROSTER,
  SKILL_PRESETS,
  buildKnowledge,
  clinchTarget,
  decide,
  foreignProvableBooks,
  rosterStyles,
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
    expect([r.punter.gambleBonus, r.punter.minHitP, r.punter.declareMaxUncertain]).toEqual([25, 0, 2])
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
