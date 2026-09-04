/**
 * closing.test.ts — MONET.md 3.8h: the closing ask (v0.12).
 *
 * Pinned: (1) `closing` absent or 0 is byte identity with the base at every decision, and
 * `closingBelief` without a live `closing` is byte identity too; (2) the credit is bounded by
 * `closing · wHit` and is 0 for a resolved set, for a sure miss into the side's own majority, and
 * at `p` 0; (3) it fires only where the hit would leave at most one card of the set outside the
 * side's own hands as the seat knows it — a seat-known holding of four or five of six — and the
 * lock factor is exactly 0.5 or 1 there; (4) the belief form is pointwise at least the certain
 * form at the same dose, which is what makes the two an ordered pair for the fit, and its mass is
 * exactly the documented one — re-derived in the test and asserted equal, because an inequality
 * survives any rescaling of it; (5) the credit never promotes an uncertain ask above a certain
 * hit, asserted at a dose hot enough that deleting the gate breaks it and with `exposure` live
 * beside `exposureCertain` so the priced ungating switch is genuinely on;
 * (6) liveness: with the knob on the pick differs from the base at some ask decisions, the game
 * plays out, and the play is deterministic; (7) `validateStyle` rejects a negative appetite and a
 * non-boolean form switch; (8) both knobs are absent from every roster style and every tier.
 * Whether the credit moves sets is the fit's question and belongs in MONET.md.
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { SeatView } from '../../lib/engine/index.ts'
import { ALL_SEATS, bookCards, cardBook, seatTeam } from '../../lib/engine/cards.ts'
import { askHitProbability, buildKnowledge, holderOf, rankAsksWith } from '../../lib/engine/bots/knowledge.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { closingActive, closingBelief, closingCredit, closingPicture } from '../../lib/engine/bots/closing.ts'
import { STYLE_PRESETS, validateStyle } from '../../lib/engine/index.ts'
import type { BotDifficulty, BotPolicy, StyleParams } from '../../lib/engine/index.ts'
import { STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { canonicalAction } from './action-digest.ts'

const BASE = monetPolicy('v0.9') as BotPolicy
const withStyle = (over: Partial<StyleParams>): BotPolicy => ({ skill: BASE.skill, style: { ...BASE.style, ...over } })
const DOSE = 0.5
const ON = withStyle({ closing: DOSE })
/** The belief form at the same dose — MONET.md 3.8h's second arm. */
const BELIEF = withStyle({ closing: DOSE, closingBelief: true })
const OPTS = { logWindow: BASE.skill.logWindow, useConstraints: BASE.skill.useConstraints, marginal: true }
const TIERS: BotDifficulty[] = ['easy', 'medium', 'hard']

type State = ReturnType<typeof newGame>

function play(seed: string, pol: BotPolicy, visit: (state: State, view: SeatView, seed: number) => void): void {
  let s = newGame(seed, us54Config, 0)
  let steps = 0
  while (s.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const n = hashSeed(`${seed}:${s.moveIndex}`)()
    visit(s, view, n)
    const r = reduce(s, decide(view, pol, n))
    if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
    s = r.state
    steps++
  }
}

const isAskDecision = (view: SeatView): boolean => !view.declareWindow && view.phase === 'playing'

describe('the closing ask', () => {
  it('closing absent or 0 is byte identity with the base, and the form switch alone changes nothing', () => {
    const zero = withStyle({ closing: 0 })
    const switchOnly = withStyle({ closingBelief: true })
    const zeroSwitch = withStyle({ closing: 0, closingBelief: true })
    expect(closingActive(BASE.style)).toBe(false)
    expect(closingActive(zero.style)).toBe(false)
    expect(closingActive(switchOnly.style)).toBe(false)
    expect(closingActive(ON.style)).toBe(true)
    expect(closingBelief(switchOnly.style)).toBe(false)
    expect(closingBelief(ON.style)).toBe(false)
    expect(closingBelief(BELIEF.style)).toBe(true)
    let decisions = 0
    for (const seed of ['closing-id-a', 'closing-id-b', 'closing-id-c']) {
      play(seed, BASE, (_s, view, n) => {
        const base = canonicalAction(decide(view, BASE, n))
        expect(canonicalAction(decide(view, zero, n))).toBe(base)
        expect(canonicalAction(decide(view, switchOnly, n))).toBe(base)
        expect(canonicalAction(decide(view, zeroSwitch, n))).toBe(base)
        decisions++
      })
    }
    expect(decisions).toBeGreaterThan(1000)
  })

  it('the credit is bounded, fires only at a seat-known four or five of six, and pays nothing for a sure miss', () => {
    let seen = 0
    let firing = 0
    let sureMisses = 0
    const lockSeen = new Set<number>()
    play('closing-bounds', ON, (_s, view) => {
      if (!isAskDecision(view)) return
      const k = buildKnowledge(view, OPTS)
      const me = seatTeam(view.seat)
      for (const r of rankAsksWith(view, k, ON.style)) {
        const credit = closingCredit(view, k, ON.style, r, r.p)
        expect(credit).toBeGreaterThanOrEqual(0)
        expect(credit).toBeLessThanOrEqual(DOSE * ON.style.wHit + 1e-9)
        // a sure miss into the side's own majority: a teammate certainly holds the asked card
        const owner = holderOf(k, r.card)
        if (owner !== null && seatTeam(owner) === me) {
          expect(credit).toBe(0)
          sureMisses++
        }
        // the seat-known own-side holding of the set, counted independently of the module
        const book = cardBook(r.card)
        let known = 0
        for (const c of bookCards(book, view.config)) {
          if (c === r.card) continue
          const h = holderOf(k, c)
          if (h !== null && seatTeam(h) === me) known++
        }
        const picture = closingPicture(view, k, r.card, false)
        expect(picture.outstanding).toBe(bookCards(book, view.config).length - 1 - known)
        if (credit > 0) {
          expect(r.p).toBeGreaterThan(0)
          expect(view.books[book]).toBeFalsy()
          expect(known).toBeGreaterThanOrEqual(4)
          const lock = credit / (DOSE * ON.style.wHit * r.p)
          expect(lock).toBeGreaterThan(0.499)
          expect(lock).toBeLessThan(1.001)
          lockSeen.add(Math.round(lock * 2))
          firing++
        } else if (r.p > 0 && !view.books[book] && (owner === null || seatTeam(owner) !== me)) {
          expect(known).toBeLessThan(4)
        }
        seen++
      }
    })
    expect(seen).toBeGreaterThan(500)
    expect(firing).toBeGreaterThan(0)
    expect(sureMisses).toBeGreaterThan(0)
    // both rungs of the ramp are exercised: one card outstanding (0.5) and none (1)
    expect(lockSeen.has(1)).toBe(true)
    expect(lockSeen.has(2)).toBe(true)
  })

  it('the belief form is pointwise at least the certain form, and its mass is exactly the documented one', () => {
    let compared = 0
    let strictlyMore = 0
    let certainOpp = 0
    let fractional = 0
    play('closing-belief', BELIEF, (_s, view) => {
      if (!isAskDecision(view)) return
      const k = buildKnowledge(view, OPTS)
      const me = seatTeam(view.seat)
      for (const r of rankAsksWith(view, k, BELIEF.style)) {
        const certain = closingCredit(view, k, ON.style, r, r.p)
        const believed = closingCredit(view, k, BELIEF.style, r, r.p)
        expect(believed).toBeGreaterThanOrEqual(certain - 1e-9)
        expect(believed).toBeLessThanOrEqual(DOSE * BELIEF.style.wHit + 1e-9)
        const soft = closingPicture(view, k, r.card, true)
        expect(soft.outstandingSoft).toBeLessThanOrEqual(soft.outstanding + 1e-9)
        // The mass re-derived here rather than compared to itself: a card an opponent certainly
        // holds counts 1, a card a teammate certainly holds counts 0, and a card nobody can place
        // counts the chance an opponent holds it, capped at 1. An inequality alone would survive
        // any downward rescaling of the open-card mass, and would survive dropping the located
        // opponent card to 0 — which would let the belief credit pay full lock on a set an
        // opponent is known to be sitting on. Equality is what pins the documented rule.
        let expected = 0
        for (const c of bookCards(cardBook(r.card), view.config)) {
          if (c === r.card) continue
          const h = holderOf(k, c)
          if (h !== null) {
            if (seatTeam(h) !== me) { expected += 1; certainOpp++ }
            continue
          }
          let pOpp = 0
          for (const s of ALL_SEATS) { if (seatTeam(s) !== me) pOpp += askHitProbability(k, c, s) }
          const m = Math.min(1, pOpp)
          expected += m
          if (m > 1e-9 && m < 1 - 1e-9) fractional++
        }
        expect(soft.outstandingSoft).toBeCloseTo(expected, 9)
        if (believed > certain + 1e-9) strictlyMore++
        compared++
      }
    })
    expect(compared).toBeGreaterThan(500)
    expect(strictlyMore).toBeGreaterThan(0)
    // both kinds of term actually occur, so neither half of the rule is pinned vacuously
    expect(certainOpp).toBeGreaterThan(0)
    expect(fractional).toBeGreaterThan(0)
  })

  it('never promotes an uncertain ask above a certain hit, at any dose and with the priced switch live', () => {
    // The gate is `gated` alone: a certain hit is available and this candidate is not certain. Two
    // rewrites have to die here, and at the fit's dose neither does — the credit is then too small
    // to overtake `certaintyBonus` even with the gate deleted, so the assertion holds for reasons
    // that have nothing to do with the gate:
    //   (a) dropping the gate outright, `+ closingCr`;
    //   (b) letting the priced ungating switch buy it, `+ (gated && !ungated ? 0 : closingCr)` —
    //       the one trade the module exists to refuse.
    // So every arm below is deliberately overdosed, and each is read against its own closing-free
    // twin: wherever the twin picks a certain hit, the arm must pick one too. Arm (c) carries a
    // LIVE `exposure` beside `exposureCertain`, because `pricedUngated` needs both — with
    // `exposure` 0 the switch is dead and the comparison is between two identical policies.
    const HOT = withStyle({ closing: 100 })
    const PRICED_TWIN = withStyle({ exposure: 0.5, exposureCertain: true })
    const ARMS: { twin: BotPolicy; arm: BotPolicy }[] = [
      { twin: BASE, arm: ON },
      { twin: BASE, arm: HOT },
      { twin: BASE, arm: withStyle({ closing: 100, closingBelief: true }) },
      { twin: PRICED_TWIN, arm: withStyle({ closing: 100, exposure: 0.5, exposureCertain: true }) },
    ]
    let certainDecisions = 0
    let checked = 0
    for (const seed of ['closing-gate-a', 'closing-gate-b', 'closing-gate-c']) {
      play(seed, ON, (_s, view, n) => {
        if (!isAskDecision(view)) return
        const k = buildKnowledge(view, OPTS)
        // `p` is the hit chance, which no style weight touches, so one ranking serves every arm
        const ranked = rankAsksWith(view, k, ON.style)
        if (!ranked.some((r) => r.p === 1)) return
        certainDecisions++
        const pickedP = (pol: BotPolicy): number | undefined => {
          const a = decide(view, pol, n)
          if (a.type !== 'ask') return undefined
          return ranked.find((r) => r.card === a.card && r.target === a.target)?.p
        }
        for (const { twin, arm } of ARMS) {
          if (pickedP(twin) !== 1) continue
          expect(pickedP(arm)).toBe(1)
          checked++
        }
      })
    }
    expect(certainDecisions).toBeGreaterThan(30)
    expect(checked).toBeGreaterThan(120)
  })

  it('the pick differs from the base at some ask decisions, the game plays out, and the play is deterministic', () => {
    let asks = 0
    let moved = 0
    const first: string[] = []
    play('closing-live', ON, (_s, view, n) => {
      if (!isAskDecision(view)) return
      asks++
      const a = canonicalAction(decide(view, ON, n))
      if (a !== canonicalAction(decide(view, BASE, n))) moved++
      if (first.length < 40) first.push(a)
    })
    expect(asks).toBeGreaterThan(30)
    expect(moved).toBeGreaterThan(0)
    const again: string[] = []
    play('closing-live', ON, (_s, view, n) => {
      if (!isAskDecision(view)) return
      if (again.length < 40) again.push(canonicalAction(decide(view, ON, n)))
    })
    expect(again).toEqual(first)
  })

  it('validateStyle rejects a negative appetite and a non-boolean form switch', () => {
    expect(validateStyle(ON.style)).toEqual([])
    expect(validateStyle(BELIEF.style)).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.punter, closing: 0 })).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.punter, closing: -0.1 })).toContain('closing -0.1 is not a number >= 0')
    expect(validateStyle({ ...STYLE_ROSTER.punter, closing: Number.NaN })).toContain('closing NaN is not a number >= 0')
    expect(validateStyle({ ...STYLE_ROSTER.punter, closingBelief: 1 as unknown as boolean })).toContain('closingBelief 1 is not a boolean')
  })

  it('both knobs are absent from every roster style and every difficulty tier', () => {
    for (const [id, style] of Object.entries(STYLE_ROSTER) as [string, StyleParams][]) {
      expect(style.closing, id).toBeUndefined()
      expect(style.closingBelief, id).toBeUndefined()
    }
    for (const t of TIERS) {
      expect(STYLE_PRESETS[t].closing, t).toBeUndefined()
      expect(STYLE_PRESETS[t].closingBelief, t).toBeUndefined()
    }
  })
})
