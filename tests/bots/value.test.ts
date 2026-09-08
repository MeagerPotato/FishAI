/**
 * value.test.ts — MONET.md §3.8ab: the learned leaf's features and model.
 *
 * Pinned: (1) the vector's shape and names; (2) on a fresh deal the global terms read what the deal
 * is, the slots hold every half-suit once with the two teams' counts complementary, and a seat's own
 * cards count among the locations it knows; (3) a model is the forward pass it says it is — a linear
 * model reads a feature, a finished game's value is its differential exactly, a mismatched model is
 * refused; (4) the search arm with `leafNet` searches, plays legal asks, is deterministic, and with
 * `steps` 0 scores each candidate by the model on the state after the ask; an unregistered name is
 * refused. Whether the leaf is *worth* anything is the fit's and the pairs' question (MONET.md).
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { GameState, SeatView, Team } from '../../lib/engine/index.ts'
import { legalAsksFromView } from '../../lib/engine/helpers.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import {
  GLOBAL_FEATURES,
  SLOTS,
  SLOT_FEATURES,
  VALUE_FEATURE_COUNT,
  compileValueModel,
  tableKnowledge,
  valueFeatureNames,
  valueFeatures,
  valueOf,
  valueOfFeatures,
} from '../../lib/engine/search/value.ts'
import type { ValueModel } from '../../lib/engine/search/value.ts'
import { SEARCH_DEFAULTS, decideSearch, registerValueModel, rollout, valueModelOf } from '../../lib/engine/search/search.ts'
import type { SearchParams } from '../../lib/engine/search/search.ts'

const POL = monetPolicy('v0.9')
const G = GLOBAL_FEATURES.length
const W = SLOT_FEATURES.length
const slot = (x: Float64Array, i: number, f: (typeof SLOT_FEATURES)[number]) => x[G + i * W + SLOT_FEATURES.indexOf(f)]

/** A linear model over raw features: unit standardisation, the given weights, no bias. */
function linear(weights: Partial<Record<string, number>>, bias = 0): ValueModel {
  const names = valueFeatureNames()
  return {
    features: VALUE_FEATURE_COUNT,
    mean: new Array(VALUE_FEATURE_COUNT).fill(0),
    std: new Array(VALUE_FEATURE_COUNT).fill(1),
    layers: [{ w: names.map((n) => weights[n] ?? 0), b: [bias] }],
  }
}

function playOut(seed: string): GameState {
  let s = newGame(seed, us54Config, 0)
  let n = 0
  while (s.phase !== 'finished' && n++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const r = reduce(s, decide(seatView(s, seat), POL, hashSeed(`${seed}:${s.moveIndex}`)()))
    if (!r.ok) throw new Error(r.error.code)
    s = r.state
  }
  return s
}

function askPositions(seed: string, every = 7): { state: GameState; view: SeatView }[] {
  const out: { state: GameState; view: SeatView }[] = []
  let s = newGame(seed, us54Config, 0)
  let n = 0
  let asks = 0
  while (s.phase !== 'finished' && n++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    if (view.phase === 'playing' && !view.declareWindow && asks++ % every === 0) out.push({ state: s, view })
    const r = reduce(s, decide(view, POL, hashSeed(`${seed}:${s.moveIndex}`)()))
    if (!r.ok) throw new Error(r.error.code)
    s = r.state
  }
  return out
}

describe('the value features', () => {
  it('have the declared shape and names', () => {
    expect(VALUE_FEATURE_COUNT).toBe(G + SLOTS * W)
    const names = valueFeatureNames()
    expect(names.length).toBe(VALUE_FEATURE_COUNT)
    expect(names[0]).toBe('scoreDiff')
    expect(names[G]).toBe('s0.ours')
    expect(new Set(names).size).toBe(names.length)
  })

  it('read a fresh deal: nothing resolved, 27 cards a side, every half-suit in a slot, the two teams complementary', () => {
    const s = newGame('value-fresh', us54Config, 0)
    const tk = tableKnowledge(s)
    const x0 = valueFeatures(s, 0, tk)
    const x1 = valueFeatures(s, 1, tk)
    expect(x0.length).toBe(VALUE_FEATURE_COUNT)
    expect(x0[0]).toBe(0) // scoreDiff
    expect(x0[1]).toBe(0) // resolved
    expect(x0[2]).toBe(0) // cardDiff
    expect(x0[3]).toBe(1) // seat 0 starts: team 0 to move
    expect(x1[3]).toBe(-1)
    expect(x0[4]).toBe(9)
    expect(x0[5]).toBe(3)
    expect(x0[6]).toBe(3)
    expect(x0[9]).toBe(0)
    let ours0 = 0
    let ours1 = 0
    const rows0: number[] = []
    const rows1: number[] = []
    for (let i = 0; i < SLOTS; i++) {
      ours0 += slot(x0, i, 'ours')
      ours1 += slot(x1, i, 'ours')
      rows0.push(slot(x0, i, 'ours'))
      rows1.push(6 - slot(x1, i, 'ours'))
      // the holder of a card knows where it is: the best-informed seat knows at least its own cards of the set
      expect(slot(x0, i, 'oursBestKnown')).toBeGreaterThanOrEqual(slot(x0, i, 'oursConcentration'))
      expect(slot(x0, i, 'oursSpread')).toBeLessThanOrEqual(3)
      expect(slot(x0, i, 'oursConcentration')).toBeLessThanOrEqual(slot(x0, i, 'ours'))
      // no ask yet: the public log pins nothing
      expect(slot(x0, i, 'oursPublic')).toBe(0)
      expect(slot(x0, i, 'theirsPublic')).toBe(0)
    }
    expect(ours0).toBe(27)
    expect(ours1).toBe(27)
    // the same nine half-suits from the other side, in the other order
    expect([...rows0].sort((a, b) => a - b)).toEqual([...rows1].sort((a, b) => a - b))
    // the slots are ordered by ours, descending
    for (let i = 1; i < SLOTS; i++) expect(rows0[i]).toBeLessThanOrEqual(rows0[i - 1])
  })

  it('count the resolved half-suits as empty slots and the score as the game goes', () => {
    const end = playOut('value-end')
    expect(end.phase).toBe('finished')
    const x = valueFeatures(end, 0)
    expect(x[1]).toBe(9)
    expect(x[0]).toBe(end.score[0] - end.score[1])
    for (let i = 0; i < SLOTS; i++) expect(slot(x, i, 'ours')).toBe(0)
    const mid = askPositions('value-mid', 25)
    const m = mid[mid.length - 1].state
    const xm = valueFeatures(m, 1)
    let resolved = 0
    for (const b of Object.keys(m.books)) if (m.books[b as keyof typeof m.books]) resolved++
    expect(xm[1]).toBe(resolved)
    expect(xm[9]).toBeGreaterThan(0)
  })
})

describe('the value model', () => {
  it('is the forward pass it says it is, and a finished game is its differential exactly', () => {
    const m = compileValueModel(linear({ scoreDiff: 2, cardDiff: 0.5 }, 0.25))
    const s = askPositions('value-model', 30)[1].state
    const x = valueFeatures(s, 0)
    expect(valueOfFeatures(m, x)).toBeCloseTo(2 * x[0] + 0.5 * x[2] + 0.25, 12)
    expect(valueOf(m, s, 0)).toBeCloseTo(2 * x[0] + 0.5 * x[2] + 0.25, 12)
    const end = playOut('value-model-end')
    expect(valueOf(m, end, 0)).toBe(end.score[0] - end.score[1])
    expect(valueOf(m, end, 1)).toBe(end.score[1] - end.score[0])
  })

  it('applies ReLU between layers and the standardisation', () => {
    const names = valueFeatureNames()
    const one = (n: string, v: number) => names.map((k) => (k === n ? v : 0))
    const m: ValueModel = {
      features: VALUE_FEATURE_COUNT,
      mean: names.map((k) => (k === 'scoreDiff' ? 1 : 0)),
      std: names.map((k) => (k === 'scoreDiff' ? 2 : 1)),
      layers: [
        { w: [...one('scoreDiff', 1), ...one('scoreDiff', -1)], b: [0, 0] },
        { w: [1, 1], b: [0] },
      ],
    }
    const c = compileValueModel(m)
    const x = new Float64Array(VALUE_FEATURE_COUNT)
    x[0] = 5 // standardised (5 − 1) / 2 = 2 → relu(2) + relu(−2) = 2
    expect(valueOfFeatures(c, x)).toBeCloseTo(2, 12)
    x[0] = -3 // (−3 − 1) / 2 = −2 → relu(−2) + relu(2) = 2
    expect(valueOfFeatures(c, x)).toBeCloseTo(2, 12)
  })

  it('refuses a model of the wrong shape', () => {
    const bad = linear({})
    expect(() => compileValueModel({ ...bad, features: bad.features + 1 })).toThrow(/features/)
    expect(() => compileValueModel({ ...bad, layers: [{ w: [1, 2], b: [0] }] })).toThrow(/weights/)
    expect(() => compileValueModel({ ...bad, layers: [{ w: bad.layers[0].w.concat(bad.layers[0].w), b: [0, 0] }] })).toThrow(/one output/)
  })
})

describe('the search arm with a learned leaf', () => {
  registerValueModel('test-linear', linear({ scoreDiff: 1, cardDiff: 0.1, 's0.ours': 0.3, 's0.oursBestKnown': 0.2 }))
  const params: SearchParams = { ...SEARCH_DEFAULTS, det: 6, cand: 4, steps: 0, candMode: 'sets', leafNet: 'test-linear' }

  it('refuses a name nothing is registered under', () => {
    expect(() => valueModelOf('nobody')).toThrow(/no value model/)
    const { view } = askPositions('value-search', 10)[2]
    expect(() => decideSearch(view, POL, 7, { ...params, leafNet: 'nobody' })).toThrow(/no value model/)
  })

  it('searches, plays legal asks, and is deterministic', () => {
    let searched = 0
    for (const { view } of askPositions('value-search', 6)) {
      const seed = hashSeed(`value-search:${view.moveIndex}`)()
      const a = decideSearch(view, POL, seed, params)
      const b = decideSearch(view, POL, seed, params)
      expect(b).toEqual(a)
      if (a.info.searched) {
        searched++
        expect(a.info.deals).toBeGreaterThan(0)
        expect(a.info.means.length).toBe(a.info.candidates)
      }
      const act = a.action
      if (act.type === 'ask') {
        const legal = legalAsksFromView(view)
        expect(legal.some((l) => l.target === act.target && l.card === act.card)).toBe(true)
      }
    }
    expect(searched).toBeGreaterThan(0)
  })

  it('with steps 0 scores a state by the model right after the ask', () => {
    const m = valueModelOf('test-linear')
    const { state } = askPositions('value-leaf', 9)[3]
    const team = (state.turn % 2) as Team
    expect(rollout(state, POL, 'k', 0, team, 1, 0, m)).toBe(valueOf(m, state, team))
    // and the lock-only leaf is untouched by the model's presence in the params
    expect(rollout(state, POL, 'k', 0, team, 1, 0)).not.toBeNaN()
  })
})
