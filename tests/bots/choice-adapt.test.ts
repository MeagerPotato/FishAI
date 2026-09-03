/**
 * choice-adapt.test.ts — MONET.md §3.6a A2: `choiceAdapt`, the per-seat reading of the ask-choice
 * evidence, updated inside the game from every successful declaration.
 *
 * Pinned: (1) η absent or 0 is A1 byte for byte — the table and every decision of whole games; (2)
 * the multipliers are exactly what the test recomputes from the public log and the TRUE deal, over
 * successful declarations only, so the walk's deal holders are the real ones wherever it uses them;
 * (3) they stay in [0, 2] and are live on real positions; (4) a policy with the step plays whole
 * games legally and differs from A1; (5) `validateStyle` closes the knob.
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { Card, PolicySpec, Seat, SeatView } from '../../lib/engine/index.ts'
import { cardBook, seatTeam } from '../../lib/engine/cards.ts'
import { CHOICE_ADAPT_CENTRE, buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import { marginalFor } from '../../lib/engine/bots/marginal.ts'
import { STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { validateStyle } from '../../lib/engine/bots/style.ts'
import type { BotPolicy } from '../../lib/engine/bots/style.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { canonicalAction } from './action-digest.ts'

const BASE = monetPolicy('v0.4c') as BotPolicy
const A1: PolicySpec = { skill: BASE.skill, style: { ...BASE.style, choiceKappa: 1 } }
const withAdapt = (eta: number): PolicySpec => ({ skill: BASE.skill, style: { ...BASE.style, choiceKappa: 1, choiceAdapt: eta } })
// the whole log: the reading needs the deal holders, which a truncated walk may not have
const OPTS = { logWindow: Number.POSITIVE_INFINITY, useConstraints: BASE.skill.useConstraints, marginal: true, choiceKappa: 1 }

interface Pos {
  view: SeatView
  dealt: readonly (readonly Card[])[]
}

/** Every `every`-th position of a mirror game the base plays against itself, with the TRUE deal. */
function positions(seed: string, every = 4): Pos[] {
  const out: Pos[] = []
  let s = newGame(seed, us54Config, 0)
  const dealt = s.hands.map((h) => h.slice())
  let steps = 0
  while (s.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    if (steps % every === 0) out.push({ view, dealt })
    const r = reduce(s, decide(view, BASE, hashSeed(`${seed}:${s.moveIndex}`)()))
    if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code}`)
    s = r.state
    steps++
  }
  return out
}

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

/** The multipliers recomputed by the test from the log and the true deal, successful declarations only. */
function expectedMultipliers(view: SeatView, dealt: readonly (readonly Card[])[], eta: number): number[] {
  const m = [1, 1, 1, 1, 1, 1]
  const asks: Partial<Record<string, number[]>> = {}
  for (const ev of view.log ?? []) {
    if (ev.type === 'ask') {
      if (ev.asker === view.seat) continue
      const b = cardBook(ev.card)
      const row = asks[b] ?? (asks[b] = [0, 0, 0, 0, 0, 0])
      row[ev.asker]++
    } else if (ev.type === 'claim') {
      const ok = ev.outcome !== 'void' && (ev.outcome === 'team0' ? 0 : 1) === seatTeam(ev.claimer)
      if (!ok) continue
      const row = asks[ev.book]
      if (!row) continue
      for (let s = 0; s < 6; s++) {
        if (s === view.seat || row[s] === 0) continue
        let x = 0
        for (const c of dealt[s]) if (cardBook(c) === ev.book) x++
        m[s] = Math.min(2, Math.max(0, m[s] + eta * (x - CHOICE_ADAPT_CENTRE)))
      }
    }
  }
  return m
}

describe('η absent or 0 is A1, byte for byte', () => {
  it('the table is the same object of numbers with `choiceAdapt: 0` as without the option', () => {
    let tables = 0
    for (const { view } of positions('adapt-identity-1')) {
      const a1 = buildKnowledge(view, OPTS)
      const zero = buildKnowledge(view, { ...OPTS, choiceAdapt: 0 })
      expect(a1.choiceSeat).toBeUndefined()
      expect(zero.choiceSeat).toBeUndefined()
      const a = marginalFor(a1)
      const b = marginalFor(zero)
      if (!a) {
        expect(b === null || b === undefined).toBe(true)
        continue
      }
      expect(Array.from(b!.p)).toEqual(Array.from(a.p))
      tables++
    }
    expect(tables).toBeGreaterThan(20)
  })

  it('an η = 0 policy plays exactly A1 over whole games', () => {
    const { decisions, differ } = divergence(['adapt-zero-a', 'adapt-zero-b'], A1, withAdapt(0))
    expect(decisions).toBeGreaterThan(1000)
    expect(differ).toBe(0)
  })
})

describe('the multipliers are the reading of the log against the true deal', () => {
  it('equals the recomputation from successful declarations, and the walk never uses a wrong deal holder', () => {
    let checked = 0
    let moved = 0
    for (const seed of ['adapt-evidence-a', 'adapt-evidence-b', 'adapt-evidence-c']) {
      for (const { view, dealt } of positions(seed, 3)) {
        const k = buildKnowledge(view, { ...OPTS, choiceAdapt: 0.25 })
        expect(k.choiceSeat).toBeDefined()
        const want = expectedMultipliers(view, dealt, 0.25)
        for (let s = 0; s < 6; s++) {
          expect(k.choiceSeat![s], `${seed} seat ${s}`).toBeCloseTo(want[s], 12)
          expect(k.choiceSeat![s]).toBeGreaterThanOrEqual(0)
          expect(k.choiceSeat![s]).toBeLessThanOrEqual(2)
        }
        expect(k.choiceSeat![view.seat]).toBe(1)
        if (want.some((x) => x !== 1)) moved++
        checked++
      }
    }
    expect(checked).toBeGreaterThan(100)
    // the reading is live: by mid-game some seat has moved off 1 on most positions
    expect(moved).toBeGreaterThan(checked / 3)
  })

  it('a moved multiplier changes the table where that seat asked, and nowhere the prior is flat', () => {
    let compared = 0
    let changed = 0
    for (const { view } of positions('adapt-table-1', 3)) {
      const a1 = buildKnowledge(view, OPTS)
      const a2 = buildKnowledge(view, { ...OPTS, choiceAdapt: 0.5 })
      const ta = marginalFor(a1)
      const tb = marginalFor(a2)
      if (!ta || !tb || !a2.choiceSeat) continue
      const anyMoved = a2.choiceSeat.some((x) => x !== 1)
      const same = Array.from(ta.p).every((x, i) => Math.abs(x - tb.p[i]) < 1e-12)
      compared++
      if (!anyMoved) expect(same).toBe(true)
      else if (!same) changed++
    }
    expect(compared).toBeGreaterThan(20)
    expect(changed).toBeGreaterThan(0)
  })
})

describe('on real positions the knob is live, and legal', () => {
  it('an η = 0.25 policy plays whole games legally and differs from A1', () => {
    const policy = withAdapt(0.25)
    let decisions = 0
    for (const seed of ['adapt-live-a', 'adapt-live-b', 'adapt-live-c']) {
      let s = newGame(seed, us54Config, 0)
      let steps = 0
      while (s.phase !== 'finished' && steps < 5000) {
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        const r = reduce(s, decide(view, policy, hashSeed(`${seed}:${s.moveIndex}`)()))
        if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code}`)
        s = r.state
        steps++
        decisions++
      }
      expect(s.phase).toBe('finished')
    }
    expect(decisions).toBeGreaterThan(1000)
    const { differ } = divergence(['adapt-live-d', 'adapt-live-e', 'adapt-live-f'], A1, policy)
    expect(differ).toBeGreaterThan(0)
  })
})

describe('validateStyle closes the knob', () => {
  it('accepts finite non-negative numbers and nothing else; no roster style carries one', () => {
    const base = STYLE_ROSTER.punter
    expect(validateStyle({ ...base, choiceAdapt: 0 })).toEqual([])
    expect(validateStyle({ ...base, choiceKappa: 1, choiceAdapt: 0.25 })).toEqual([])
    expect(validateStyle({ ...base, choiceAdapt: -1 })).toEqual([expect.stringContaining('choiceAdapt')])
    expect(validateStyle({ ...base, choiceAdapt: Number.NaN })).toEqual([expect.stringContaining('choiceAdapt')])
    for (const id of Object.keys(STYLE_ROSTER) as (keyof typeof STYLE_ROSTER)[]) expect(STYLE_ROSTER[id].choiceAdapt, id).toBeUndefined()
    expect(BASE.style.choiceAdapt).toBeUndefined()
    // a seat's own multiplier is never read: the viewer's row of the prior is flat by construction
    const view = seatView(newGame('adapt-validate', us54Config, 0), 0 as Seat)
    expect(buildKnowledge(view, { ...OPTS, choiceAdapt: 0.25 }).choiceSeat?.[0]).toBe(1)
  })
})
