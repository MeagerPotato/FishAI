/**
 * compel.test.ts — MONET.md §3.7a item 2′: `compelHorizon` / `declareThresholdCompelled`, the
 * pre-emptive declare near compulsion.
 *
 * Pinned: (1) absent or 0 is byte identity — every decision of whole games is the base's, and so
 * is a horizon with the bar left absent; (2) the knob acts only in windows, only while declining
 * is legal, and only with the opponents' cards at or below the horizon: every decision that
 * leaves the base is a window declaration made there; (3) it is live — such declarations occur —
 * and every game is legal; (4) `validateStyle` closes both knobs. Whether the earlier declaration
 * is *right* more often is the home instrument's question (`scripts/probe-handoff-declare.mjs
 * --horizon`) and belongs in MONET.md.
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { PolicySpec, Seat } from '../../lib/engine/index.ts'
import { seatTeam } from '../../lib/engine/cards.ts'
import { validateStyle } from '../../lib/engine/bots/style.ts'
import type { BotPolicy } from '../../lib/engine/bots/style.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { canonicalAction } from './action-digest.ts'

const BASE = monetPolicy('v0.4c') as BotPolicy
const withCompel = (compelHorizon: number | undefined, declareThresholdCompelled: number | undefined): PolicySpec => ({
  skill: BASE.skill,
  style: { ...BASE.style, compelHorizon, declareThresholdCompelled },
})

type State = ReturnType<typeof newGame>
const opponentCards = (s: State, seat: Seat): number => {
  const team = seatTeam(seat)
  let n = 0
  for (let x = 0; x < 6; x++) if (seatTeam(x as Seat) !== team) n += s.hands[x].length
  return n
}

describe('compelHorizon absent or 0 is byte identity', () => {
  it('every decision of whole games is the base decision, and a horizon with no bar changes nothing either', () => {
    for (const seed of ['compel-id-a', 'compel-id-b', 'compel-id-c']) {
      let s = newGame(seed, us54Config, 0)
      let steps = 0
      let decisions = 0
      while (s.phase !== 'finished' && steps++ < 5000) {
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        const rng = hashSeed(`${seed}:${s.moveIndex}`)()
        const base = decide(view, BASE, rng)
        expect(canonicalAction(decide(view, withCompel(0, 0.5), rng))).toBe(canonicalAction(base))
        expect(canonicalAction(decide(view, withCompel(undefined, undefined), rng))).toBe(canonicalAction(base))
        expect(canonicalAction(decide(view, withCompel(6, undefined), rng))).toBe(canonicalAction(base))
        decisions++
        const r = reduce(s, base)
        if (!r.ok) throw new Error(r.error.code)
        s = r.state
      }
      expect(decisions).toBeGreaterThan(100)
    }
  })
})

describe('the knob acts only in near-compulsion windows, and is live', () => {
  it('every decision that leaves the base is a window declaration with the opponents at or below the horizon', () => {
    const horizon = 6
    const spec = withCompel(horizon, 0.5)
    let diverged = 0
    let decisions = 0
    for (const seed of Array.from({ length: 24 }, (_, i) => `compel-live-${i}`)) {
      let s = newGame(seed, us54Config, 0)
      let steps = 0
      while (s.phase !== 'finished' && steps++ < 5000) {
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        const rng = hashSeed(`${seed}:${s.moveIndex}`)()
        const a = decide(view, spec, rng)
        decisions++
        if (canonicalAction(a) !== canonicalAction(decide(view, BASE, rng))) {
          expect(view.declareWindow).toBeTruthy()
          expect(a.type).toBe('claim')
          expect(opponentCards(s, seat)).toBeLessThanOrEqual(horizon)
          diverged++
        }
        const r = reduce(s, a)
        expect(r.ok).toBe(true)
        if (!r.ok) throw new Error(r.error.code)
        s = r.state
      }
      expect(s.phase).toBe('finished')
    }
    expect(decisions).toBeGreaterThan(600)
    expect(diverged).toBeGreaterThan(0)
  })
})

describe('validateStyle closes both knobs', () => {
  it('accepts an integer horizon >= 0 and a bar in [0, 1], rejects the rest', () => {
    const base = BASE.style
    expect(validateStyle({ ...base, compelHorizon: 0 })).toEqual([])
    expect(validateStyle({ ...base, compelHorizon: 6, declareThresholdCompelled: 0.5 })).toEqual([])
    expect(validateStyle({ ...base, compelHorizon: 2.5 })).toHaveLength(1)
    expect(validateStyle({ ...base, compelHorizon: -1 })).toHaveLength(1)
    expect(validateStyle({ ...base, compelHorizon: 6, declareThresholdCompelled: 1.5 })).toHaveLength(1)
    expect(validateStyle({ ...base, compelHorizon: 6, declareThresholdCompelled: Number.NaN })).toHaveLength(1)
  })
})
