/**
 * licence-hold.test.ts — MONET.md §3.8l: `licenceHold`, the licence conditioning calibrated to a
 * measured holding.
 *
 * Pinned: (1) absent and 0 are the shipped table, byte for byte, on every position of three games;
 * (2) with h = 1.5 the table still has exact margins (rows 1, columns the seat's slots) and the
 * licensed seats' expected counts over their constraints' alive cards sit nearer min(1.5, alive)
 * than the shipped table's do; (3) `validateStyle` closes the knob to [0, 6].
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { SeatView } from '../../lib/engine/index.ts'
import { buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import { marginalFor } from '../../lib/engine/bots/marginal.ts'
import { validateStyle } from '../../lib/engine/bots/style.ts'
import type { BotPolicy } from '../../lib/engine/bots/style.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'

const BASE = monetPolicy('v0.9') as BotPolicy
const OPTS = { logWindow: BASE.skill.logWindow, useConstraints: BASE.skill.useConstraints, marginal: true }

function views(seed: string, every = 3): SeatView[] {
  const out: SeatView[] = []
  let s = newGame(seed, us54Config, 0)
  let steps = 0
  while (s.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    if (steps % every === 0) out.push(view)
    const r = reduce(s, decide(view, BASE, hashSeed(`${seed}:${s.moveIndex}`)()))
    if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code}`)
    s = r.state
    steps++
  }
  return out
}

const same = (a: Float64Array, b: Float64Array): boolean => a.length === b.length && a.every((x, i) => x === b[i])

describe('absent and 0 are the shipped table, byte for byte', () => {
  it('holds on every position of three games', () => {
    let positions = 0
    for (const seed of ['hold-a', 'hold-b', 'hold-c']) {
      for (const view of views(seed)) {
        const plain = buildKnowledge(view, OPTS)
        const zero = buildKnowledge(view, { ...OPTS, licenceHold: 0 })
        expect(plain.licenceHold).toBeUndefined()
        expect(zero.licenceHold).toBeUndefined()
        const tp = marginalFor(plain)
        const tz = marginalFor(zero)
        if (!tp || !tz) continue
        positions++
        expect(same(tp.p, tz.p)).toBe(true)
      }
    }
    expect(positions).toBeGreaterThan(100)
  })
})

describe('h = 1.5 keeps the margins exact and moves the licensed seats toward the target', () => {
  it('holds pooled over the positions that carry a constraint', () => {
    let positions = 0
    let gapPlain = 0
    let gapHold = 0
    let constraints = 0
    for (const seed of ['hold-a', 'hold-b', 'hold-c']) {
      for (const view of views(seed)) {
        const plain = buildKnowledge(view, OPTS)
        const held = buildKnowledge(view, { ...OPTS, licenceHold: 1.5 })
        expect(held.licenceHold).toBe(1.5)
        const tp = marginalFor(plain)
        const th = marginalFor(held)
        if (!tp || !th) continue
        expect(th.cards).toEqual(tp.cards)
        const n = th.cards.length
        if (n === 0) continue
        positions++
        // rows sum to 1
        for (let i = 0; i < n; i++) {
          let row = 0
          for (let s = 0; s < 6; s++) row += th.p[i * 6 + s]
          expect(Math.abs(row - 1)).toBeLessThan(1e-6)
        }
        // columns sum to the seat's free slots — exactly where the scaling converged, and no worse
        // than the shipped table's own drift where it hit the round cap (about 1 in 70 positions)
        for (let s = 0; s < 6; s++) {
          let col = 0
          for (let i = 0; i < n; i++) col += th.p[i * 6 + s]
          expect(Math.abs(col - Math.max(0, held.unknownSlots[s] ?? 0))).toBeLessThan(th.converged ? 1e-6 : 1e-2)
        }
        for (const kc of held.constraints) {
          const rows = kc.cards.map((c) => th.index.get(c)).filter((i): i is number => i !== undefined)
          if (rows.length === 0) continue
          constraints++
          const target = Math.min(1.5, rows.length)
          let sp = 0
          let sh = 0
          for (const i of rows) {
            sp += tp.p[i * 6 + kc.seat]
            sh += th.p[i * 6 + kc.seat]
          }
          gapPlain += Math.abs(sp - target)
          gapHold += Math.abs(sh - target)
        }
      }
    }
    expect(positions).toBeGreaterThan(100)
    expect(constraints).toBeGreaterThan(100)
    expect(gapHold).toBeLessThan(gapPlain * 0.5)
  })
})

describe('validateStyle closes the knob', () => {
  it('accepts [0, 6] and refuses the rest', () => {
    const base = monetPolicy('v0.9') as BotPolicy
    expect(validateStyle({ ...base.style, licenceHold: 1.5 })).toEqual([])
    expect(validateStyle({ ...base.style, licenceHold: 0 })).toEqual([])
    expect(validateStyle({ ...base.style, licenceHold: -1 }).length).toBeGreaterThan(0)
    expect(validateStyle({ ...base.style, licenceHold: 7 }).length).toBeGreaterThan(0)
    expect(validateStyle({ ...base.style, licenceHold: Number.NaN }).length).toBeGreaterThan(0)
  })
})
