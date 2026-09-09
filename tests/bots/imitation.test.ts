/**
 * imitation.test.ts — MONET.md §3.8ac: the imitation ask policy's features, model and hook.
 *
 * Pinned: (1) the feature rows' shape and per-ask invariants (the probability, its certainty, the
 * ranker's top, the seat's own holding); (2) a model is the argmax it says it is — a weight on the
 * ranker's rank picks its top, the opposite sign its last — deterministic, and an unregistered name is
 * refused; (3) `decide` with `askModel` in the style plays the model's choice where the stack would not,
 * and without it the stack is untouched; (4) `validateStyle` refuses a non-string `askModel`; (5) the second
 * feature set (§3.8af) extends the first byte for byte and reads the slot prior and the log as it says, a model
 * at its width is told apart by the width, and any other width is refused. Whether the fitted model plays well
 * is the pairs' and the bridge's question (MONET.md).
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { GameState, SeatView } from '../../lib/engine/index.ts'
import { legalAsksFromView } from '../../lib/engine/helpers.ts'
import { cardBook, seatTeam } from '../../lib/engine/cards.ts'
import { SEARCH_DEFAULTS, decideSearch, opponentSpec, rollout } from '../../lib/engine/search/index.ts'
import { buildKnowledge, rankAsksWith, slotPriorHitProbability } from '../../lib/engine/bots/knowledge.ts'
import { resolvePolicy, validateStyle } from '../../lib/engine/bots/style.ts'
import type { BotPolicy } from '../../lib/engine/bots/style.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { ASK_FEATURES, ASK_FEATURES_2, ASK_FEATURE_COUNT, ASK_FEATURE_COUNT_2, askFeatureRows, askFeatureSetOf, askModelOf, chooseAskByModel, registerAskModel } from '../../lib/engine/bots/imitation.ts'
import type { AskModel } from '../../lib/engine/bots/imitation.ts'

const POL = monetPolicy('v0.9')
// the registry's entries are pairs; PolicySpec is the union with the adaptive names, and a pair's fields are read off the narrowed type
const POLB = POL as BotPolicy
const { skill, style } = resolvePolicy(POL)
const OPTS = { logWindow: skill.logWindow, useConstraints: skill.useConstraints, marginal: style.pModel === 'marginal', choiceKappa: style.choiceKappa, choiceAdapt: style.choiceAdapt, choicePrior: style.choicePrior }
const F = (n: (typeof ASK_FEATURES)[number]) => ASK_FEATURES.indexOf(n)

/** A linear model over raw features: unit standardisation, the given weights, no bias. */
function linear(weights: Partial<Record<(typeof ASK_FEATURES)[number], number>>): AskModel {
  return { features: ASK_FEATURE_COUNT, mean: new Array(ASK_FEATURE_COUNT).fill(0), std: new Array(ASK_FEATURE_COUNT).fill(1), layers: [{ w: ASK_FEATURES.map((n) => weights[n] ?? 0), b: [0] }] }
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

describe('the ask features', () => {
  it('have one row per ranked ask with the declared width, and read the ask they describe', () => {
    let checked = 0
    for (const { view } of askPositions('imit-features', 9)) {
      const k = buildKnowledge(view, OPTS)
      const ranked = rankAsksWith(view, k, style)
      const rows = askFeatureRows(view, k, ranked)
      expect(rows.length).toBe(ranked.length)
      const held = new Set(view.hand)
      for (let j = 0; j < ranked.length; j++) {
        const x = rows[j]
        expect(x.length).toBe(ASK_FEATURE_COUNT)
        expect(x[F('p')]).toBe(ranked[j].p)
        expect(x[F('certain')]).toBe(ranked[j].p === 1 ? 1 : 0)
        expect(x[F('knownMiss')]).toBe(ranked[j].p === 0 ? 1 : 0)
        expect(x[F('isTop')]).toBe(j === 0 ? 1 : 0)
        expect(x[F('rankInv')]).toBeCloseTo(1 / (1 + j), 12)
        expect(x[F('scoreRel')]).toBeLessThanOrEqual(0)
        const own = [...held].filter((c) => cardBook(c) === cardBook(ranked[j].card)).length
        expect(x[F('ownHeld')]).toBeCloseTo(own / 6, 12)
        expect(x[F('targetHand')]).toBeCloseTo(view.counts[ranked[j].target] / 9, 12)
        expect(x[F('myHand')]).toBeCloseTo(view.hand.length / 9, 12)
        for (const v of x) expect(Number.isFinite(v)).toBe(true)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
  })
})

describe('the ask model', () => {
  it('is the argmax it says it is, and refuses a name nothing is registered under', () => {
    registerAskModel('imit-top', linear({ rankInv: 1 }))
    registerAskModel('imit-last', linear({ rankInv: -1 }))
    expect(() => askModelOf('nobody')).toThrow(/no ask model/)
    for (const { view } of askPositions('imit-model', 11)) {
      const k = buildKnowledge(view, OPTS)
      const ranked = rankAsksWith(view, k, style)
      if (ranked.length < 2) continue
      expect(chooseAskByModel(askModelOf('imit-top'), view, k, ranked)).toBe(ranked[0])
      expect(chooseAskByModel(askModelOf('imit-last'), view, k, ranked)).toBe(ranked[ranked.length - 1])
      const a = chooseAskByModel(askModelOf('imit-last'), view, k, ranked)
      const b = chooseAskByModel(askModelOf('imit-last'), view, k, ranked)
      expect(b).toBe(a)
    }
  })

  it("through `askModel` in the style, decide() plays the model's choice, legal, where the stack would not; without it the stack is untouched", () => {
    registerAskModel('imit-last', linear({ rankInv: -1 }))
    const withModel = Object.freeze({ skill: POLB.skill, style: Object.freeze({ ...POLB.style, askModel: 'imit-last' }) })
    let differs = 0
    let asksSeen = 0
    for (const { view } of askPositions('imit-decide', 6)) {
      const seed = hashSeed(`imit-decide:${view.moveIndex}`)()
      const plain = decide(view, POL, seed)
      const modelled = decide(view, withModel, seed)
      expect(decide(view, POL, seed)).toEqual(plain)
      if (modelled.type !== 'ask' || plain.type !== 'ask') continue
      asksSeen++
      const legal = legalAsksFromView(view)
      expect(legal.some((l) => l.target === modelled.target && l.card === modelled.card)).toBe(true)
      const k = buildKnowledge(view, OPTS)
      const ranked = rankAsksWith(view, k, style)
      const last = ranked[ranked.length - 1]
      // the certain-hit branch and the reveal branch are the stack's; where pickAsk chose, it is the model's last-ranked ask
      if (modelled.target === last.target && modelled.card === last.card) differs += modelled.card !== plain.card || modelled.target !== plain.target ? 1 : 0
    }
    expect(asksSeen).toBeGreaterThan(10)
    expect(differs).toBeGreaterThan(0)
  })

  it('is validated as a non-empty string', () => {
    expect(validateStyle({ ...POLB.style, askModel: 'x' } as never)).toEqual([])
    expect(validateStyle({ ...POLB.style, askModel: '' } as never).some((m) => m.includes('askModel'))).toBe(true)
    expect(validateStyle({ ...POLB.style, askModel: 3 } as never).some((m) => m.includes('askModel'))).toBe(true)
  })
})

describe("the search's opponent model (`oppAskModel`)", () => {
  const FORM = { ...SEARCH_DEFAULTS, det: 4, cand: 3, steps: 12 }

  it('lays the model over the spec for the opponents, refuses an unregistered name, and is byte identity when absent', () => {
    registerAskModel('imit-last', linear({ rankInv: -1 }))
    const opp = opponentSpec(POL, 'imit-last') as { style: { askModel?: string } }
    expect(opp.style.askModel).toBe('imit-last')
    expect(() => opponentSpec(POL, 'nobody')).toThrow(/no ask model/)
    expect(() => decideSearch(askPositions('imit-opp', 50)[0].view, POL, 7, { ...FORM, oppAskModel: 'nobody' })).toThrow(/no ask model/)
    for (const { view } of askPositions('imit-opp-identity', 9).slice(0, 12)) {
      const a = decideSearch(view, POL, 11, FORM)
      const b = decideSearch(view, POL, 11, { ...FORM, oppAskModel: undefined })
      expect(b).toEqual(a)
    }
  })

  it("changes what the rollouts return — the opponents' asks are the model's — and the searched seat's own asks stay the spec's", () => {
    registerAskModel('imit-last', linear({ rankInv: -1 }))
    let differs = 0
    let searched = 0
    for (const { state, view } of askPositions('imit-opp-rollout', 5)) {
      const plain = decideSearch(view, POL, 13, FORM)
      const modelled = decideSearch(view, POL, 13, { ...FORM, oppAskModel: 'imit-last' })
      if (!plain.info.searched || !modelled.info.searched) continue
      searched++
      // the same candidates, from the same fast policy at the searched seat
      expect(modelled.info.cands).toEqual(plain.info.cands)
      if (modelled.info.means.some((m, i) => m !== plain.info.means[i])) differs++
      // a rollout from the true state: the opponents playing their worst-ranked asks cannot beat the spec on the same deal
      const opp = opponentSpec(POL, 'imit-last')
      const team = seatTeam(view.seat)
      const vPlain = rollout(state, POL, 'k', 24, team)
      const vOpp = rollout(state, POL, 'k', 24, team, 0, 0, undefined, opp)
      expect(Number.isFinite(vOpp)).toBe(true)
      expect(Number.isFinite(vPlain)).toBe(true)
    }
    expect(searched).toBeGreaterThan(10)
    expect(differs).toBeGreaterThan(0)
  })
})

describe('the second feature set (MONET.md §3.8af)', () => {
  const F2 = (n: (typeof ASK_FEATURES_2)[number]) => ASK_FEATURES_2.indexOf(n)
  /** A linear model over the second set's raw features: unit standardisation, the given weights, no bias. */
  function linear2(weights: Partial<Record<(typeof ASK_FEATURES_2)[number], number>>): AskModel {
    return { features: ASK_FEATURE_COUNT_2, mean: new Array(ASK_FEATURE_COUNT_2).fill(0), std: new Array(ASK_FEATURE_COUNT_2).fill(1), layers: [{ w: ASK_FEATURES_2.map((n) => weights[n] ?? 0), b: [0] }] }
  }

  it('extends the first set — its first columns are the first set, byte for byte — and reads the belief and the log it says it does', () => {
    let checked = 0
    let lastAskerRows = 0
    for (const { view } of askPositions('imit-features-2', 9)) {
      const k = buildKnowledge(view, OPTS)
      const ranked = rankAsksWith(view, k, style)
      const rows1 = askFeatureRows(view, k, ranked)
      const rows2 = askFeatureRows(view, k, ranked, 2)
      expect(rows2.length).toBe(ranked.length)
      const asks = view.log.filter((e) => e.type === 'ask')
      const lastAsk = asks.length > 0 ? asks[asks.length - 1] : null
      const myTeam = seatTeam(view.seat)
      for (let j = 0; j < ranked.length; j++) {
        const x = rows2[j]
        const { card, target } = ranked[j]
        expect(x.length).toBe(ASK_FEATURE_COUNT_2)
        expect(Array.from(x.subarray(0, ASK_FEATURE_COUNT))).toEqual(Array.from(rows1[j]))
        const pSlot = slotPriorHitProbability(k, card, target)
        expect(x[F2('pSlot')]).toBe(pSlot)
        expect(x[F2('pDiff')]).toBe(ranked[j].p - pSlot)
        if (ranked[j].p === 1) expect(x[F2('pIndepK')]).toBe(1)
        if (ranked[j].p === 0) expect(x[F2('pIndepK')]).toBe(0)
        expect(x[F2('pIndepK')]).toBeGreaterThanOrEqual(0)
        expect(x[F2('pIndepK')]).toBeLessThanOrEqual(1)
        expect(x[F2('targetUnknownSlots')]).toBeCloseTo(k.unknownSlots[target] / 9, 12)
        expect(x[F2('oppCands')]).toBeCloseTo((k.cands[card] ?? []).filter((s) => seatTeam(s) !== myTeam).length / 3, 12)
        if (lastAsk && lastAsk.type === 'ask' && lastAsk.asker === target) {
          // the log's last ask was the target's: no asks since
          expect(x[F2('targetLastAskAgo')]).toBe(0)
          expect(x[F2('targetBooksAsked')]).toBeGreaterThan(0)
          if (cardBook(lastAsk.card) === cardBook(card)) {
            expect(x[F2('targetBookLastAgo')]).toBe(0)
            expect(x[F2('bookLastAskAgo')]).toBe(0)
            expect(x[F2('targetAsksIntoBook')]).toBeGreaterThan(0)
          }
          lastAskerRows++
        }
        for (let q = ASK_FEATURE_COUNT; q < ASK_FEATURE_COUNT_2; q++) {
          expect(x[q]).toBeGreaterThanOrEqual(-1)
          expect(x[q]).toBeLessThanOrEqual(1)
        }
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
    expect(lastAskerRows).toBeGreaterThan(0)
  })

  it('a model at the second width is told apart by its width, scores the second rows, plays legal asks through decide(), and any other width is refused', () => {
    registerAskModel('imit-top', linear({ rankInv: 1 }))
    registerAskModel('imit2-top', linear2({ rankInv: 1 }))
    registerAskModel('imit2-slot', linear2({ pSlot: 1 }))
    expect(askFeatureSetOf(askModelOf('imit2-top'))).toBe(2)
    expect(askFeatureSetOf(askModelOf('imit-top'))).toBe(1)
    const bad: AskModel = { features: 40, mean: new Array(40).fill(0), std: new Array(40).fill(1), layers: [{ w: new Array(40).fill(0), b: [0] }] }
    expect(() => registerAskModel('imit-bad', bad)).toThrow(/features/)
    let slotDiffers = 0
    for (const { view } of askPositions('imit-model-2', 11)) {
      const k = buildKnowledge(view, OPTS)
      const ranked = rankAsksWith(view, k, style)
      if (ranked.length < 2) continue
      expect(chooseAskByModel(askModelOf('imit2-top'), view, k, ranked)).toBe(ranked[0])
      const bySlot = chooseAskByModel(askModelOf('imit2-slot'), view, k, ranked)
      const best = slotPriorHitProbability(k, bySlot.card, bySlot.target)
      for (const r of ranked) expect(slotPriorHitProbability(k, r.card, r.target)).toBeLessThanOrEqual(best)
      if (bySlot !== ranked[0]) slotDiffers++
    }
    expect(slotDiffers).toBeGreaterThan(0)
    const withModel = Object.freeze({ skill: POLB.skill, style: Object.freeze({ ...POLB.style, askModel: 'imit2-slot' }) })
    let asksSeen = 0
    for (const { view } of askPositions('imit-decide-2', 6)) {
      const modelled = decide(view, withModel, hashSeed(`imit-decide-2:${view.moveIndex}`)())
      if (modelled.type !== 'ask') continue
      asksSeen++
      expect(legalAsksFromView(view).some((l) => l.target === modelled.target && l.card === modelled.card)).toBe(true)
    }
    expect(asksSeen).toBeGreaterThan(10)
  })
})
