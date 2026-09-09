/**
 * holder.test.ts — MONET.md §3.8ah: the holder clone's features, belief and registry.
 *
 * Pinned: (1) one feature row per candidate seat of every card the viewer cannot place, in the knowledge's
 * candidate order — the marginal, the slot prior and the κ prior read as they say and each summing to one over
 * the candidates, the seat's team and hand as the view has them, every feature in [0, 1]; a placed card and the
 * viewer's own have no rows; (2) the belief is the softmax it says it is — a weight on the slot prior keeps the
 * slot prior's order, it sums to one over the candidates, is zero off them, certain for a lone candidate and
 * uniform under a model of zero weights; (3) the registry refuses another width and an unregistered name.
 * Whether a fitted holder model helps the ask clone is the record's question (§3.8ah), not this file's.
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { GameState, SeatView } from '../../lib/engine/index.ts'
import { cardBook, seatTeam } from '../../lib/engine/cards.ts'
import { askHitProbability, buildKnowledge, slotPriorHitProbability } from '../../lib/engine/bots/knowledge.ts'
import { resolvePolicy } from '../../lib/engine/bots/style.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { HOLDER_FEATURES, HOLDER_FEATURE_COUNT, holderBelief, holderContext, holderFeatureRows, holderModelOf, registerHolderModel } from '../../lib/engine/bots/holder.ts'
import type { HolderModel } from '../../lib/engine/bots/holder.ts'

const POL = monetPolicy('v0.9')
const { skill, style } = resolvePolicy(POL)
const OPTS = { logWindow: skill.logWindow, useConstraints: skill.useConstraints, marginal: style.pModel === 'marginal', choiceKappa: style.choiceKappa, choiceAdapt: style.choiceAdapt, choicePrior: style.choicePrior, licenceLambda: style.licenceLambda }
const H = (n: (typeof HOLDER_FEATURES)[number]) => HOLDER_FEATURES.indexOf(n)

/** A linear holder model over raw features: unit standardisation, the given weights, no bias. */
function linearH(weights: Partial<Record<(typeof HOLDER_FEATURES)[number], number>>): HolderModel {
  return { features: HOLDER_FEATURE_COUNT, mean: new Array(HOLDER_FEATURE_COUNT).fill(0), std: new Array(HOLDER_FEATURE_COUNT).fill(1), layers: [{ w: HOLDER_FEATURES.map((n) => weights[n] ?? 0), b: [0] }] }
}

/** Ask positions of whole games under v0.9, every `every`-th. */
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

describe('the holder features', () => {
  it('give one row per candidate seat of every card the viewer cannot place, reading the beliefs and the seats they say', () => {
    let cards = 0
    let constrained = 0
    for (const { view } of askPositions('holder-features', 9)) {
      const k = buildKnowledge(view, OPTS)
      const ctx = holderContext(view, k)
      const myTeam = seatTeam(view.seat)
      // the context's list is every card of an unresolved half-suit with two or more candidates, in deck order
      let counted = 0
      for (let bi = 0; bi < ctx.NB; bi++) counted += ctx.bookUnknown[bi]
      expect(ctx.unknownCards.length).toBe(counted)
      for (const card of ctx.unknownCards) {
        expect(k.holders[card]).toBeUndefined()
        expect(view.books[cardBook(card)]).toBeFalsy()
        const { seats, rows } = holderFeatureRows(ctx, k, view, card)
        expect(seats).toEqual(k.cands[card])
        expect(rows.length).toBe(seats.length)
        expect(rows.length).toBeGreaterThanOrEqual(2)
        let sumMarg = 0
        let sumSlot = 0
        let sumKappa = 0
        for (let j = 0; j < seats.length; j++) {
          const s = seats[j]
          const x = rows[j]
          expect(x.length).toBe(HOLDER_FEATURE_COUNT)
          expect(s).not.toBe(view.seat)
          expect(x[H('pMarg')]).toBe(askHitProbability(k, card, s))
          expect(x[H('pSlot')]).toBe(slotPriorHitProbability(k, card, s))
          expect(x[H('candCount')]).toBeCloseTo(seats.length / 5, 12)
          expect(x[H('seatUnknown')]).toBeCloseTo(Math.min(1, k.unknownSlots[s] / 12), 12)
          expect(x[H('seatCount')]).toBeCloseTo(Math.min(1, view.counts[s] / 12), 12)
          expect(x[H('sameTeam')]).toBe(seatTeam(s) === myTeam ? 1 : 0)
          if (x[H('seatConstraint')] > 0) constrained++
          for (let q = 0; q < HOLDER_FEATURE_COUNT; q++) {
            expect(x[q]).toBeGreaterThanOrEqual(0)
            expect(x[q]).toBeLessThanOrEqual(1)
          }
          sumMarg += x[H('pMarg')]
          sumSlot += x[H('pSlot')]
          sumKappa += x[H('pIndepK')]
        }
        expect(sumMarg).toBeCloseTo(1, 6)
        expect(sumSlot).toBeCloseTo(1, 9)
        expect(sumKappa).toBeCloseTo(1, 9)
        cards++
      }
      // the viewer's own cards and the placed ones have no rows
      for (const own of view.hand) expect(holderFeatureRows(ctx, k, view, own).rows).toEqual([])
    }
    expect(cards).toBeGreaterThan(100)
    expect(constrained).toBeGreaterThan(0)
  })
})

describe('the holder belief', () => {
  it('is the softmax it says it is: the slot prior\'s order kept, one over the candidates, zero off them, certain alone, uniform under no weights', () => {
    registerHolderModel('hold-slot', linearH({ pSlot: 6 }))
    registerHolderModel('hold-flat', linearH({}))
    const bySlot = holderModelOf('hold-slot')
    const flat = holderModelOf('hold-flat')
    let cards = 0
    let alone = 0
    for (const { view } of askPositions('holder-belief', 11)) {
      const k = buildKnowledge(view, OPTS)
      const ctx = holderContext(view, k)
      for (const card of ctx.unknownCards) {
        const cand = k.cands[card] ?? []
        const bl = holderBelief(bySlot, ctx, k, view, card)
        const fl = holderBelief(flat, ctx, k, view, card)
        expect(bl.length).toBe(6)
        let sum = 0
        for (let s = 0; s < 6; s++) {
          if (!cand.includes(s as 0 | 1 | 2 | 3 | 4 | 5)) {
            expect(bl[s]).toBe(0)
            expect(fl[s]).toBe(0)
          } else {
            expect(bl[s]).toBeGreaterThan(0)
            expect(fl[s]).toBeCloseTo(1 / cand.length, 12)
          }
          sum += bl[s]
        }
        expect(sum).toBeCloseTo(1, 12)
        // a monotone weight on the slot prior keeps its order over the candidates
        for (const a of cand) for (const b of cand) {
          const pa = slotPriorHitProbability(k, card, a)
          const pb = slotPriorHitProbability(k, card, b)
          if (pa > pb) expect(bl[a]).toBeGreaterThan(bl[b])
          if (pa === pb) expect(bl[a]).toBeCloseTo(bl[b], 12)
        }
        cards++
      }
      // a card with one candidate is certain: the viewer's own cards, whose only candidate is the viewer
      for (const own of view.hand) {
        const cand = k.cands[own] ?? []
        if (cand.length !== 1) continue
        const bl = holderBelief(bySlot, ctx, k, view, own)
        expect(bl[cand[0]]).toBe(1)
        expect(Array.from(bl).reduce((a, b) => a + b, 0)).toBe(1)
        alone++
      }
    }
    expect(cards).toBeGreaterThan(100)
    expect(alone).toBeGreaterThan(0)
  })

  it('the registry refuses another width and a name nothing is registered under', () => {
    const bad: HolderModel = { features: HOLDER_FEATURE_COUNT - 1, mean: new Array(HOLDER_FEATURE_COUNT - 1).fill(0), std: new Array(HOLDER_FEATURE_COUNT - 1).fill(1), layers: [{ w: new Array(HOLDER_FEATURE_COUNT - 1).fill(0), b: [0] }] }
    expect(() => registerHolderModel('hold-bad', bad)).toThrow(/features/)
    expect(() => holderModelOf('hold-nothing')).toThrow(/no holder model/)
    expect(HOLDER_FEATURES.length).toBe(20)
    expect(new Set(HOLDER_FEATURES).size).toBe(HOLDER_FEATURES.length)
  })
})
