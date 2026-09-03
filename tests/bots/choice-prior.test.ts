/**
 * choice-prior.test.ts — MONET.md §3.6a: `choicePrior`, the shape of the ask-choice prior.
 *
 * Pinned: (1) absent and `'count'` are the same table, byte for byte; (2) `'once'` equals `'count'`
 * on every position where no seat has asked into a half-suit more than once, and differs on some
 * position where one has; (3) under `'count'` a seat's weight saturates at three asks — the table
 * with the fourth ask is the table with the third; (4) `validateStyle` closes the knob.
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { SeatView } from '../../lib/engine/index.ts'
import { cardBook } from '../../lib/engine/cards.ts'
import { buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import { marginalFor } from '../../lib/engine/bots/marginal.ts'
import { STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { validateStyle } from '../../lib/engine/bots/style.ts'
import type { BotPolicy } from '../../lib/engine/bots/style.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'

const BASE = monetPolicy('v0.4c') as BotPolicy
const OPTS = { logWindow: BASE.skill.logWindow, useConstraints: BASE.skill.useConstraints, marginal: true, choiceKappa: 1 }

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

describe("absent and 'count' are one table; 'once' is another only where a seat asked twice", () => {
  it('holds on every position of three games', () => {
    let positions = 0
    let repeated = 0
    let differed = 0
    for (const seed of ['prior-a', 'prior-b', 'prior-c']) {
      for (const view of views(seed)) {
        const plain = buildKnowledge(view, OPTS)
        const count = buildKnowledge(view, { ...OPTS, choicePrior: 'count' })
        const once = buildKnowledge(view, { ...OPTS, choicePrior: 'once' })
        expect(plain.choicePrior).toBeUndefined()
        expect(count.choicePrior).toBeUndefined()
        expect(once.choicePrior).toBe('once')
        const tp = marginalFor(plain)
        const tc = marginalFor(count)
        const to = marginalFor(once)
        if (!tp || !tc || !to) continue
        positions++
        expect(same(tp.p, tc.p)).toBe(true)
        // does any seat but the viewer have two or more asks into a half-suit with an unknown card?
        let twice = false
        for (const [book, row] of Object.entries(plain.asksInto ?? {})) {
          for (let s = 0; s < 6; s++) {
            if (s === view.seat || (row?.[s] ?? 0) < 2) continue
            if (tp.cards.some((c) => cardBook(c) === book && (plain.cands[c]?.length ?? 0) > 1)) twice = true
          }
        }
        if (!twice) expect(same(tp.p, to.p)).toBe(true)
        else {
          repeated++
          if (!same(tp.p, to.p)) differed++
        }
      }
    }
    expect(positions).toBeGreaterThan(100)
    expect(repeated).toBeGreaterThan(10)
    expect(differed).toBeGreaterThan(0)
  })
})

describe("under 'count' the weight saturates at three asks", () => {
  it('a fourth ask into a half-suit leaves the table where the third put it', () => {
    let checked = 0
    for (const seed of ['prior-sat-a', 'prior-sat-b', 'prior-sat-c', 'prior-sat-d']) for (const view of views(seed, 1)) {
      const k = buildKnowledge(view, OPTS)
      const row3 = Object.values(k.asksInto ?? {}).some((row) => row?.some((n, s) => s !== view.seat && n >= 4))
      if (!row3) continue
      // clamp every count at 3 and rebuild the table from the same Knowledge: identical
      const clamped = { ...k, asksInto: Object.fromEntries(Object.entries(k.asksInto ?? {}).map(([b, row]) => [b, row?.map((n) => Math.min(3, n))])) }
      const ta = marginalFor(k)
      const tb = marginalFor(clamped as typeof k)
      if (!ta || !tb) continue
      expect(same(ta.p, tb.p)).toBe(true)
      checked++
    }
    // a seat asking four times into one half-suit is a late-game event; a handful of positions over four games
    expect(checked).toBeGreaterThan(0)
  })
})

describe('validateStyle closes the knob', () => {
  it("accepts 'count' and 'once', refuses anything else; no roster style carries one", () => {
    const base = STYLE_ROSTER.punter
    expect(validateStyle({ ...base, choiceKappa: 1, choicePrior: 'count' })).toEqual([])
    expect(validateStyle({ ...base, choiceKappa: 1, choicePrior: 'once' })).toEqual([])
    expect(validateStyle({ ...base, choicePrior: 'flag' as 'once' })).toEqual([expect.stringContaining('choicePrior')])
    for (const id of Object.keys(STYLE_ROSTER) as (keyof typeof STYLE_ROSTER)[]) expect(STYLE_ROSTER[id].choicePrior, id).toBeUndefined()
    expect(BASE.style.choicePrior).toBeUndefined()
  })
})
