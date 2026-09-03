/**
 * choice.test.ts — MONET.md §3.6a: `choiceKappa`, the ask-choice prior over the marginal.
 *
 * Pinned, in the roadmap's order: (1) κ absent or 0 is byte identity — the table and every
 * decision of whole games are the base's; (2) the evidence is the log's asks by every seat but the
 * viewer, per half-suit, and nothing else; (3) a seat's asks into a half-suit raise the table's
 * weight of that half-suit's unknown cards at that seat, and the margins still hold; (4) on real
 * positions the knob is live, and every action a κ policy plays is legal; (5) `validateStyle`
 * closes the knob to finite, non-negative numbers. Whether the prior is *better* is the home
 * instrument's question (`scripts/probe-location.mjs`) and belongs in MONET.md.
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { Card, PolicySpec, Seat, SeatView } from '../../lib/engine/index.ts'
import { cardBook } from '../../lib/engine/cards.ts'
import { askHitProbability, buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import { marginalFor } from '../../lib/engine/bots/marginal.ts'
import { STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { validateStyle } from '../../lib/engine/bots/style.ts'
import type { BotPolicy } from '../../lib/engine/bots/style.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { canonicalAction } from './action-digest.ts'

const BASE = monetPolicy('v0.4c') as BotPolicy
const withKappa = (kappa: number): PolicySpec => ({ skill: BASE.skill, style: { ...BASE.style, choiceKappa: kappa } })
const OPTS = { logWindow: BASE.skill.logWindow, useConstraints: BASE.skill.useConstraints, marginal: true }

interface Pos {
  view: SeatView
  hands: readonly (readonly Card[])[]
}

/** Every `every`-th position of a mirror game the base plays against itself, with the true hands. */
function positions(seed: string, every = 5): Pos[] {
  const out: Pos[] = []
  let s = newGame(seed, us54Config, 0)
  let steps = 0
  while (s.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    if (steps % every === 0) out.push({ view, hands: s.hands })
    const r = reduce(s, decide(view, BASE, hashSeed(`${seed}:${s.moveIndex}`)()))
    if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code}`)
    s = r.state
    steps++
  }
  return out
}

/** Whole games of `driver` against itself; at every decision `other` is asked the same question. */
function divergence(seeds: string[], driver: PolicySpec, other: PolicySpec): { decisions: number; differ: number } {
  let decisions = 0
  let differ = 0
  for (const seed of seeds) {
    let s = newGame(seed, us54Config, 0)
    let steps = 0
    while (s.phase !== 'finished' && steps < 5000) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const moveSeed = hashSeed(`${seed}:${s.moveIndex}`)()
      const drove = decide(view, driver, moveSeed)
      const alt = decide(view, other, moveSeed)
      decisions++
      if (canonicalAction(drove) !== canonicalAction(alt)) differ++
      const r = reduce(s, drove)
      if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code}`)
      s = r.state
      steps++
    }
  }
  return { decisions, differ }
}

describe('κ absent or 0 is the base, byte for byte', () => {
  it('the table is the same object of numbers with `choiceKappa: 0` as without the option', () => {
    let tables = 0
    for (const { view } of positions('choice-identity-1')) {
      const flat = buildKnowledge(view, OPTS)
      const zero = buildKnowledge(view, { ...OPTS, choiceKappa: 0 })
      expect(zero.asksInto).toBeUndefined()
      expect(zero.choiceKappa).toBeUndefined()
      const a = marginalFor(flat)
      const b = marginalFor(zero)
      if (a === null || a === undefined) {
        expect(b === null || b === undefined).toBe(true)
        continue
      }
      expect(b).not.toBeNull()
      expect(Array.from(b!.p)).toEqual(Array.from(a.p))
      tables++
    }
    expect(tables).toBeGreaterThan(20)
  })

  it('a κ = 0 policy plays exactly the base over whole games', () => {
    const { decisions, differ } = divergence(['choice-zero-a', 'choice-zero-b'], BASE, withKappa(0))
    expect(decisions).toBeGreaterThan(1000)
    expect(differ).toBe(0)
  })
})

describe('the evidence is the log, and only the log', () => {
  it("`asksInto` counts every other seat's asks per half-suit, and nothing the viewer did", () => {
    let checked = 0
    for (const { view } of positions('choice-evidence-1')) {
      const k = buildKnowledge(view, { ...OPTS, choiceKappa: 0.5 })
      expect(k.choiceKappa).toBe(0.5)
      const expected: Partial<Record<string, number[]>> = {}
      for (const ev of view.log ?? []) {
        if (ev.type !== 'ask' || ev.asker === view.seat) continue
        const b = cardBook(ev.card)
        const row = expected[b] ?? (expected[b] = [0, 0, 0, 0, 0, 0])
        row[ev.asker]++
      }
      expect(k.asksInto).toEqual(expected)
      for (const row of Object.values(k.asksInto ?? {})) expect(row?.[view.seat]).toBe(0)
      checked++
    }
    expect(checked).toBeGreaterThan(20)
  })
})

describe('what an ask into a half-suit does to the table', () => {
  it("raises that half-suit's unknown cards at the asker on average, and keeps the margins", () => {
    let raised = 0
    let compared = 0
    let delta = 0
    for (const { view } of positions('choice-weight-1', 3)) {
      const flat = buildKnowledge(view, OPTS)
      const prior = buildKnowledge(view, { ...OPTS, choiceKappa: 2 })
      const a = marginalFor(flat)
      const b = marginalFor(prior)
      if (!a || !b) continue
      // margins: rows to 1, columns to the free slots
      for (let i = 0; i < b.cards.length; i++) {
        let row = 0
        for (let s = 0; s < 6; s++) row += b.p[i * 6 + s]
        expect(row).toBeCloseTo(1, 6)
      }
      for (let s = 0; s < 6; s++) {
        let col = 0
        for (let i = 0; i < b.cards.length; i++) col += b.p[i * 6 + s]
        expect(col).toBeCloseTo(Math.max(0, prior.unknownSlots[s] ?? 0), 6)
      }
      for (let i = 0; i < b.cards.length; i++) {
        const card = b.cards[i]
        const cands = prior.cands[card] ?? []
        if (cands.length < 2) continue
        const row = prior.asksInto?.[cardBook(card)]
        if (!row) continue
        for (const s of cands as Seat[]) {
          if (s === view.seat || (row[s] ?? 0) === 0) continue
          // the asker asked into this card's half-suit: its share here rises on average and on
          // most cards — not on every card, because the seat's other asked-into half-suits
          // compete for the same slots, and the scaling settles that competition
          const before = askHitProbability(flat, card, s)
          const after = askHitProbability(prior, card, s)
          delta += after - before
          compared++
          if (after > before + 1e-9) raised++
        }
      }
    }
    expect(compared).toBeGreaterThan(50)
    expect(raised).toBeGreaterThan(compared / 2)
    expect(delta / compared).toBeGreaterThan(0)
  })
})

describe('on real positions the knob is live, and legal', () => {
  it('a κ = 1 policy plays whole games legally and differs from the base', () => {
    const kappa = withKappa(1)
    let decisions = 0
    for (const seed of ['choice-live-a', 'choice-live-b', 'choice-live-c']) {
      let s = newGame(seed, us54Config, 0)
      let steps = 0
      while (s.phase !== 'finished' && steps < 5000) {
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        const r = reduce(s, decide(view, kappa, hashSeed(`${seed}:${s.moveIndex}`)()))
        if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code}`)
        s = r.state
        steps++
        decisions++
      }
      expect(s.phase).toBe('finished')
    }
    expect(decisions).toBeGreaterThan(1000)
    const { differ } = divergence(['choice-live-d', 'choice-live-e'], BASE, kappa)
    expect(differ).toBeGreaterThan(0)
  })
})

describe('validateStyle closes the knob', () => {
  it('accepts finite non-negative numbers and nothing else; no roster style carries one', () => {
    const base = STYLE_ROSTER.punter
    expect(validateStyle({ ...base, choiceKappa: 0 })).toEqual([])
    expect(validateStyle({ ...base, choiceKappa: 0.5 })).toEqual([])
    expect(validateStyle({ ...base, choiceKappa: -1 })).toEqual([expect.stringContaining('choiceKappa')])
    expect(validateStyle({ ...base, choiceKappa: Number.NaN })).toEqual([expect.stringContaining('choiceKappa')])
    expect(validateStyle({ ...base, choiceKappa: Number.POSITIVE_INFINITY })).toEqual([expect.stringContaining('choiceKappa')])
    for (const id of Object.keys(STYLE_ROSTER) as (keyof typeof STYLE_ROSTER)[]) expect(STYLE_ROSTER[id].choiceKappa, id).toBeUndefined()
    expect(BASE.style.choiceKappa).toBeUndefined()
  })
})
