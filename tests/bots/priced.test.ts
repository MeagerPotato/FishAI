/**
 * priced.test.ts — MONET.md 3.8d: the priced ask (v0.9).
 *
 * Pinned: (1) `contest` and `exposure` absent or 0 are byte identity with the base at every
 * decision; (2) the terms are bounded and signed as documented — the contest credit is 0 for a
 * certain hit and at most `contest · wHit`, the exposure charge is 0 for a certain hit and for a
 * hit that would lock the set and at most `exposure · wHit`, and the exposure's risk sits in
 * [0, 1]; (3) a certain hit stays first: with both knobs on, whenever a certain hit is legal the
 * decision is the base decision (every priced term is 0 there); (4) liveness: with the knobs on the pick differs from the base at some
 * ask decisions, and the game plays out; (5) determinism; (6) `validateStyle` rejects a negative
 * appetite. Whether the terms move sets is the fit's question and belongs in MONET.md.
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { Seat, SeatView } from '../../lib/engine/index.ts'
import { buildKnowledge, rankAsksWith } from '../../lib/engine/bots/knowledge.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { contestBonus, exposurePenalty, hitExposure, pricedActive } from '../../lib/engine/bots/priced.ts'
import { validateStyle } from '../../lib/engine/bots/style.ts'
import type { BotPolicy, StyleParams } from '../../lib/engine/bots/style.ts'
import { canonicalAction } from './action-digest.ts'

const BASE = monetPolicy('v0.4c') as BotPolicy
const withStyle = (over: Partial<StyleParams>): BotPolicy => ({ skill: BASE.skill, style: { ...BASE.style, ...over } })
const ON = withStyle({ contest: 0.4, exposure: 0.5 })
const OPTS = { logWindow: BASE.skill.logWindow, useConstraints: BASE.skill.useConstraints, marginal: true }

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

describe('the priced ask', () => {
  it('contest and exposure absent or 0 are byte identity with the base', () => {
    const zero = withStyle({ contest: 0, exposure: 0 })
    expect(pricedActive(BASE.style)).toBe(false)
    expect(pricedActive(zero.style)).toBe(false)
    expect(pricedActive(ON.style)).toBe(true)
    let decisions = 0
    for (const seed of ['priced-id-a', 'priced-id-b', 'priced-id-c']) {
      play(seed, BASE, (_s, view, n) => {
        const base = canonicalAction(decide(view, BASE, n))
        expect(canonicalAction(decide(view, zero, n))).toBe(base)
        decisions++
      })
    }
    expect(decisions).toBeGreaterThan(1000)
  })

  it('the terms are bounded and signed as documented', () => {
    let seen = 0
    let locking = 0
    play('priced-bounds', ON, (_s, view) => {
      if (!isAskDecision(view)) return
      const k = buildKnowledge(view, OPTS)
      for (const r of rankAsksWith(view, k, ON.style)) {
        const credit = contestBonus(view, k, ON.style, r, r.p)
        const charge = exposurePenalty(view, k, ON.style, r, r.p)
        expect(credit).toBeGreaterThanOrEqual(0)
        expect(credit).toBeLessThanOrEqual(0.4 * ON.style.wHit + 1e-9)
        expect(charge).toBeGreaterThanOrEqual(0)
        expect(charge).toBeLessThanOrEqual(0.5 * ON.style.wHit + 1e-9)
        const x = hitExposure(view, k, r.card)
        expect(x.risk).toBeGreaterThanOrEqual(0)
        expect(x.risk).toBeLessThanOrEqual(1)
        if (x.distance === 0) {
          expect(x.risk).toBe(0)
          expect(charge).toBe(0)
          locking++
        }
        if (r.p === 1) {
          expect(credit).toBe(0)
          expect(charge).toBe(0)
        }
        seen++
      }
    })
    expect(seen).toBeGreaterThan(500)
    expect(locking).toBeGreaterThan(0)
  })

  it('a certain hit stays first with both knobs on: the decision is the base decision whenever a certain hit is legal', () => {
    // The gate: with a certain hit legal, the priced terms are 0 for every uncertain ask and 0 for
    // every certain one, so the score vector is the base's and so is the decision.
    let certainDecisions = 0
    let certainPlayed = 0
    for (const seed of ['priced-certain-a', 'priced-certain-b', 'priced-certain-c']) {
      play(seed, ON, (_s, view, n) => {
        if (!isAskDecision(view)) return
        const k = buildKnowledge(view, OPTS)
        const ranked = rankAsksWith(view, k, ON.style)
        if (!ranked.some((r) => r.p === 1)) return
        const a = decide(view, ON, n)
        expect(canonicalAction(a)).toBe(canonicalAction(decide(view, BASE, n)))
        certainDecisions++
        if (a.type === 'ask' && ranked.find((r) => r.card === a.card && r.target === a.target)?.p === 1) certainPlayed++
      })
    }
    expect(certainDecisions).toBeGreaterThan(30)
    expect(certainPlayed).toBeGreaterThan(30)
  })

  it('the pick differs from the base at some ask decisions, the game plays out, and the play is deterministic', () => {
    let asks = 0
    let moved = 0
    const first: string[] = []
    play('priced-live', ON, (_s, view, n) => {
      if (!isAskDecision(view)) return
      asks++
      const a = canonicalAction(decide(view, ON, n))
      if (a !== canonicalAction(decide(view, BASE, n))) moved++
      if (first.length < 40) first.push(a)
    })
    expect(asks).toBeGreaterThan(30)
    expect(moved).toBeGreaterThan(0)
    const again: string[] = []
    play('priced-live', ON, (_s, view, n) => {
      if (!isAskDecision(view)) return
      if (again.length < 40) again.push(canonicalAction(decide(view, ON, n)))
    })
    expect(again).toEqual(first)
  })

  it('validateStyle rejects a negative appetite and accepts 0 and absent', () => {
    expect(validateStyle({ ...BASE.style, contest: -0.1 }).length).toBeGreaterThan(0)
    expect(validateStyle({ ...BASE.style, exposure: -1 }).length).toBeGreaterThan(0)
    expect(validateStyle({ ...BASE.style, contest: 0, exposure: 0 })).toEqual(validateStyle(BASE.style))
    expect(validateStyle(ON.style)).toEqual(validateStyle(BASE.style))
  })
})

export type { Seat }
