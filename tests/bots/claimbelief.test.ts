/**
 * claimbelief.test.ts — MONET.md §3.8ak: `claimBelief: 'holder'`, the holder clone in the claim path.
 *
 * Pinned: (1) absent or spelled `'marginal'`, the knob is the chain byte for byte, plan for plan, on real
 * positions; (2) under a holder model of zero weights (a uniform belief over each card's candidates) the
 * plan's probability is the product of one over each open card's candidate count, every open card sits with
 * a candidate teammate, and the steps are placed most certain first; a card with no teammate left prices the
 * plan at 0 and is still legally named; (3) under a sharper model the plan differs from the chain somewhere,
 * so the knob is live, and the planner is deterministic; (4) `decideExplained.action ≡ decide` with the knob
 * on at every decision of real games; (5) `validateStyle` closes the knob to its two spellings and refuses
 * `'holder'` without a model name. Whether the knob wins games is §3.8ak's record's question, not this file's.
 */
import { describe, expect, it } from 'vitest'
import { decide, decideExplained, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { Card, PolicySpec, Seat } from '../../lib/engine/index.ts'
import { allBooks, seatTeam, teamSeats } from '../../lib/engine/cards.ts'
import { buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import type { Knowledge, KnowledgeOptions } from '../../lib/engine/bots/types.ts'
import { planClaimFor } from '../../lib/engine/bots/decide.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { resolvePolicy, validateStyle } from '../../lib/engine/bots/style.ts'
import type { BotPolicy } from '../../lib/engine/bots/style.ts'
import { HOLDER_FEATURES, HOLDER_FEATURE_COUNT, holderModelOf, registerHolderModel } from '../../lib/engine/bots/holder.ts'
import type { HolderModel } from '../../lib/engine/bots/holder.ts'
import { assignByHolder } from '../../lib/engine/bots/claimbelief.ts'
import { canonicalAction } from './action-digest.ts'

/** A linear holder model over raw features: unit standardisation, the given weights, no bias. */
function linearH(weights: Partial<Record<(typeof HOLDER_FEATURES)[number], number>>): HolderModel {
  return { features: HOLDER_FEATURE_COUNT, mean: new Array(HOLDER_FEATURE_COUNT).fill(0), std: new Array(HOLDER_FEATURE_COUNT).fill(1), layers: [{ w: HOLDER_FEATURES.map((n) => weights[n] ?? 0), b: [0] }] }
}
registerHolderModel('cb-flat', linearH({}))
registerHolderModel('cb-slot', linearH({ pSlot: 6 }))

/** v0.9 with the shipped doses (S), the stack every clone plays inside. */
const base = monetPolicy('v0.9') as BotPolicy
const stack: PolicySpec = { skill: base.skill, style: { ...base.style, contest: 0.6, closing: 0.5, closingFour: 2 } }
const spelled: PolicySpec = { skill: base.skill, style: { ...(stack as BotPolicy).style, claimBelief: 'marginal' } }
const flat: PolicySpec = { skill: base.skill, style: { ...(stack as BotPolicy).style, claimBelief: 'holder', claimHolderModel: 'cb-flat' } }
const sharp: PolicySpec = { skill: base.skill, style: { ...(stack as BotPolicy).style, claimBelief: 'holder', claimHolderModel: 'cb-slot' } }

/** The knowledge options `decide` builds for this stack (decide.ts `knowledgeOptions`). */
const { skill, style } = resolvePolicy(stack)
const marginal = style.pModel === 'marginal'
const OPTS: KnowledgeOptions = { logWindow: skill.logWindow, useConstraints: skill.useConstraints, marginal, choiceKappa: marginal ? style.choiceKappa : undefined, choiceAdapt: marginal ? style.choiceAdapt : undefined, choicePrior: marginal ? style.choicePrior : undefined, licenceHold: marginal ? style.licenceHold : undefined }

/** Every decision of whole games driven by `pol`, with the seat's view and knowledge. */
function positions(pol: PolicySpec, seeds: string[], cap = 5000): { view: ReturnType<typeof seatView>; k: Knowledge }[] {
  const out: { view: ReturnType<typeof seatView>; k: Knowledge }[] = []
  for (const seed of seeds) {
    let s = newGame(seed, us54Config, 0)
    let steps = 0
    while (s.phase !== 'finished' && steps++ < cap) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      out.push({ view, k: buildKnowledge(view, OPTS) })
      const r = reduce(s, decide(view, pol, hashSeed(`${seed}:${s.moveIndex}`)()))
      if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
      s = r.state
    }
  }
  return out
}

describe('absent or spelled marginal, the knob is the chain', () => {
  it('plan for plan, on every unresolved set of real positions', () => {
    let plans = 0
    for (const { view } of positions(stack, ['cb-inert-a', 'cb-inert-b'])) {
      for (const b of allBooks(view.config)) {
        if (view.books[b]) continue
        expect(planClaimFor(view, spelled, b)).toEqual(planClaimFor(view, stack, b))
        plans++
      }
    }
    expect(plans).toBeGreaterThan(2_000)
  })
})

describe('under a flat holder model the plan is what the arithmetic says', () => {
  it('p is the product of one over each open card\'s candidates, every open card with a candidate teammate, most certain first', () => {
    const m = holderModelOf('cb-flat')
    let priced = 0
    let zero = 0
    for (const { view, k } of positions(flat, ['cb-flat-a', 'cb-flat-b'])) {
      const team = seatTeam(view.seat)
      const mates = teamSeats(team)
      for (const b of allBooks(view.config)) {
        if (view.books[b]) continue
        const plan = planClaimFor(view, flat, b)
        expect(Object.keys(plan.assignments).length).toBe(6)
        for (const c of Object.keys(plan.assignments) as Card[]) expect(seatTeam(plan.assignments[c])).toBe(team)
        expect(plan.p).toBeGreaterThanOrEqual(0)
        expect(plan.p).toBeLessThanOrEqual(1)
        if (plan.uncertain.length === 0 || plan.p === 0) {
          if (plan.uncertain.length > 0) zero++
          continue
        }
        // The wiring: the plan's open cards are the holder placement's, at its price.
        const out = assignByHolder(k, view, m, plan.uncertain, mates)
        expect(plan.p).toBe(out.p)
        for (const c of plan.uncertain) expect(plan.assignments[c]).toBe(out.assignments[c])
        // The arithmetic: a uniform belief over the candidates, read at a candidate teammate each step.
        let product = 1
        let last = 2
        for (const step of out.steps) {
          const cand = k.cands[step.card] ?? []
          expect(cand).toContain(step.seat)
          expect(mates).toContain(step.seat)
          expect(step.p).toBeCloseTo(1 / cand.length, 12)
          expect(step.p).toBeLessThanOrEqual(last + 1e-12)
          last = step.p
          product *= step.p
        }
        expect(out.steps.length).toBe(plan.uncertain.length)
        expect(plan.p).toBeCloseTo(product, 12)
        priced++
      }
    }
    expect(priced).toBeGreaterThan(100)
    // A plan the greedy pass priced at 0 (a card certainly with an opponent, or with no teammate to name)
    // stays at 0 under the knob; some such plans exist in whole games.
    expect(zero).toBeGreaterThan(0)
  })

  it('a card with no teammate left to hold it prices the plan at 0 and is still legally named', () => {
    // A hand-built knowledge: 2C can sit at 2 or 4, but neither has a free slot.
    const cands: Partial<Record<Card, Seat[]>> = { '2C': [2, 4], '3C': [1, 3] }
    const k: Knowledge = { seat: 0, counts: [9, 9, 9, 9, 9, 9], holders: {}, cands, gone: [], unknownSlots: [0, 1, 0, 1, 0, 0], constraints: [] }
    const s = newGame('cb-zero', us54Config, 0)
    const view = seatView(s, 0)
    const out = assignByHolder(k, view, holderModelOf('cb-flat'), ['2C'], [0, 2, 4])
    expect(out.p).toBe(0)
    expect([0, 2, 4]).toContain(out.assignments['2C'])
    expect(out.steps).toEqual([])
    expect(assignByHolder(k, view, holderModelOf('cb-flat'), [], [0, 2, 4])).toEqual({ assignments: {}, p: 1, steps: [] })
  })
})

describe('under a sharper model the knob is live, and the planner is deterministic', () => {
  it('differs from the chain somewhere on real positions, and plans the same position the same way twice', () => {
    let plans = 0
    let differ = 0
    let moved = 0
    for (const { view } of positions(sharp, ['cb-sharp-a', 'cb-sharp-b'])) {
      for (const b of allBooks(view.config)) {
        if (view.books[b]) continue
        const plan = planClaimFor(view, sharp, b)
        const chain = planClaimFor(view, stack, b)
        plans++
        expect(plan.uncertain).toEqual(chain.uncertain)
        if (chain.uncertain.length === 0) expect(plan).toEqual(chain)
        if (plan.p !== chain.p) differ++
        if (chain.uncertain.some((c) => plan.assignments[c] !== chain.assignments[c])) moved++
        expect(planClaimFor(view, sharp, b)).toEqual(plan)
      }
    }
    expect(plans).toBeGreaterThan(2_000)
    expect(differ).toBeGreaterThan(0)
    expect(moved).toBeGreaterThan(0)
  })
})

describe('decideExplained.action ≡ decide with the knob on', () => {
  it('three knob-driven games, the explained action bit-identical to the played one', () => {
    let decisions = 0
    for (const seed of ['cb-explain-a', 'cb-explain-b', 'cb-explain-c']) {
      let s = newGame(seed, us54Config, 0)
      let steps = 0
      while (s.phase !== 'finished' && steps++ < 5000) {
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        const moveSeed = hashSeed(`${seed}:${s.moveIndex}`)()
        const played = decide(view, sharp, moveSeed)
        const explained = decideExplained(view, sharp, moveSeed)
        expect(canonicalAction(explained.action)).toBe(canonicalAction(played))
        decisions++
        const r = reduce(s, played)
        if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
        s = r.state
      }
    }
    expect(decisions).toBeGreaterThan(1_500)
  })
})

describe('validateStyle closes the knob', () => {
  it('accepts the two spellings, refuses another, and refuses holder without a model name', () => {
    const b = base.style
    expect(validateStyle({ ...b, claimBelief: 'marginal' })).toEqual([])
    expect(validateStyle({ ...b, claimBelief: 'holder', claimHolderModel: 'cb-flat' })).toEqual([])
    expect(validateStyle({ ...b, claimBelief: 'holder' }).join(' ')).toMatch(/claimHolderModel/)
    expect(validateStyle({ ...b, claimBelief: 'other' as unknown as 'holder' }).join(' ')).toMatch(/claimBelief/)
  })
})
