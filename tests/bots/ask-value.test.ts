/**
 * ask-value.test.ts — MONET.md §3.8as: the learned ask value over the clone's shortlist.
 *
 * Pinned: (P1) absent, `decide` is byte identity with v0.33's vector — the knob costs nothing when it
 * is off; (P2) an INDIFFERENT value (all weights zero) is byte-identical to the clone, because a tie
 * goes to the clone's own top, so the knob can only act where the value actually prefers something;
 * (P3) the knob is live — a value that weights the clone's ordering against itself moves the choice,
 * and every choice it makes is a legal ask INSIDE the clone's top `askValueTopK`; (P4) `askValueTopK`
 * bounds the shortlist, and 2 and 3 differ where the third candidate wins; (P5) the value scores the
 * WHOLE ranked list, so a candidate's list-relative features (`rankInv`, `isTop`, `scoreRel`) are the
 * ones its fit saw — the defect §3.8as found and corrected, pinned here so it cannot come back;
 * (P6) inert without `askModel`; (P7) `validateStyle` closes both knobs; (P8) both are absent from
 * every roster style and every difficulty tier.
 *
 * Whether the fitted value plays WELL is the pairs' and the bridge's question, not this file's.
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { GameState, SeatView } from '../../lib/engine/index.ts'
import { legalAsksFromView } from '../../lib/engine/helpers.ts'
import { buildKnowledge, rankAsksWith } from '../../lib/engine/bots/knowledge.ts'
import { STYLE_PRESETS } from '../../lib/engine/index.ts'
import type { BotDifficulty } from '../../lib/engine/index.ts'
import { resolvePolicy, validateStyle } from '../../lib/engine/bots/style.ts'
import type { BotPolicy, StyleParams } from '../../lib/engine/bots/style.ts'
import { STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { ASK_FEATURES_2, ASK_FEATURE_COUNT_2, askModelOf, chooseAskByModel, chooseAskByValue, registerAskModel, scoreAsks } from '../../lib/engine/bots/imitation.ts'
import type { AskModel } from '../../lib/engine/bots/imitation.ts'

const TIERS: BotDifficulty[] = ['easy', 'medium', 'hard']

const POL = monetPolicy('v0.33')
const POLB = POL as BotPolicy
const { skill, style } = resolvePolicy(POL)
const OPTS = {
  logWindow: skill.logWindow,
  useConstraints: skill.useConstraints,
  marginal: style.pModel === 'marginal',
  choiceKappa: style.choiceKappa,
  choiceAdapt: style.choiceAdapt,
  choicePrior: style.choicePrior,
}
const CLONE = askModelOf(style.askModel as string)

/** A linear model over the second feature set's raw values: unit standardisation, no bias. */
function linear2(weights: Partial<Record<(typeof ASK_FEATURES_2)[number], number>>): AskModel {
  return {
    features: ASK_FEATURE_COUNT_2,
    mean: new Array(ASK_FEATURE_COUNT_2).fill(0),
    std: new Array(ASK_FEATURE_COUNT_2).fill(1),
    layers: [{ w: ASK_FEATURES_2.map((n) => weights[n] ?? 0), b: [0] }],
  }
}
registerAskModel('av-zero', linear2({}))
// `rankInv` is 1/(1+j) over the RANKER's list; a negative weight prefers the ranker's later entries,
// which is a preference the clone's own order does not share, so the two disagree often.
registerAskModel('av-late', linear2({ rankInv: -1 }))
registerAskModel('av-early', linear2({ rankInv: 1 }))

const withKnob = (over: Partial<StyleParams>): BotPolicy => ({ skill: POLB.skill, style: { ...POLB.style, ...over } }) as BotPolicy

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
const POSITIONS = [...askPositions('askvalue-a', 3), ...askPositions('askvalue-b', 3)]

/** The clone's ordering of the ranker's list, ties to the earlier entry, as `chooseAskByValue` reads it. */
function cloneOrder(view: SeatView) {
  const k = buildKnowledge(view, OPTS)
  const ranked = rankAsksWith(view, k, style)
  const cs = scoreAsks(CLONE, view, k, ranked)
  const order = ranked.map((_, i) => i).sort((a, b) => cs[b] - cs[a] || a - b)
  return { k, ranked, order }
}

describe('P1 — the knob absent is byte identity', () => {
  it('leaves every decision of v0.33 exactly where it was', () => {
    expect(POSITIONS.length).toBeGreaterThan(20)
    for (const { view } of POSITIONS) {
      const seed = hashSeed(`p1:${view.seat}`)()
      expect(decide(view, withKnob({}), seed)).toEqual(decide(view, POL, seed))
    }
  })
})

describe('P2 — an indifferent value keeps the clone', () => {
  it('scores every candidate alike, so the tie goes to the clone and the choice is unchanged', () => {
    for (const { view } of POSITIONS) {
      const { k, ranked } = cloneOrder(view)
      const clonePick = chooseAskByModel(CLONE, view, k, ranked)
      expect(chooseAskByValue(CLONE, askModelOf('av-zero'), view, k, ranked, 3)).toEqual(clonePick)
      const seed = hashSeed(`p2:${view.seat}`)()
      expect(decide(view, withKnob({ askValueModel: 'av-zero' }), seed)).toEqual(decide(view, POL, seed))
    }
  })
})

describe('P3 — the knob is live, and stays inside the shortlist', () => {
  it('moves the choice on some positions, and never outside the clone’s top k', () => {
    let moved = 0
    let checked = 0
    for (const { view } of POSITIONS) {
      const { k, ranked, order } = cloneOrder(view)
      const short = order.slice(0, Math.min(3, order.length))
      const legal = legalAsksFromView(view)
      const pick = chooseAskByValue(CLONE, askModelOf('av-late'), view, k, ranked, 3)
      const idx = ranked.findIndex((r) => r.target === pick.target && r.card === pick.card)
      expect(short).toContain(idx)
      expect(legal.some((a) => a.target === pick.target && a.card === pick.card)).toBe(true)
      checked++
      if (idx !== order[0]) moved++
    }
    expect(checked).toBeGreaterThan(20)
    expect(moved).toBeGreaterThan(0)
  })
})

describe('P4 — askValueTopK bounds the shortlist', () => {
  it('at 2 can never take the clone’s third, and differs from 3 where the third would have won', () => {
    let differed = 0
    for (const { view } of POSITIONS) {
      const { k, ranked, order } = cloneOrder(view)
      const at2 = chooseAskByValue(CLONE, askModelOf('av-late'), view, k, ranked, 2)
      const at3 = chooseAskByValue(CLONE, askModelOf('av-late'), view, k, ranked, 3)
      const i2 = ranked.findIndex((r) => r.target === at2.target && r.card === at2.card)
      expect(order.slice(0, 2)).toContain(i2)
      if (i2 !== ranked.findIndex((r) => r.target === at3.target && r.card === at3.card)) differed++
    }
    expect(differed).toBeGreaterThan(0)
  })
})

describe('P5 — the value scores the whole ranked list', () => {
  it('gives a candidate the list-relative features its fit saw, not a sublist’s', () => {
    // `av-early` weights `rankInv` positively, so over the FULL list it always prefers the ranker's
    // earliest candidate in the shortlist. Scored as a three-element list of its own, every shortlist
    // member would be re-indexed and the earliest by the clone's order would win instead. The two
    // differ on real positions, and this pins which one the engine does.
    let differed = 0
    for (const { view } of POSITIONS) {
      const { k, ranked, order } = cloneOrder(view)
      const short = order.slice(0, Math.min(3, order.length))
      if (short.length < 2) continue
      const full = chooseAskByValue(CLONE, askModelOf('av-early'), view, k, ranked, 3)
      const iFull = ranked.findIndex((r) => r.target === full.target && r.card === full.card)
      // the whole-list reading picks the shortlist member with the smallest RANKER index
      const wantIdx = short.reduce((a, b) => (a < b ? a : b))
      expect(iFull).toBe(wantIdx)
      // the sublist reading would have picked the shortlist's first entry, the clone's own top
      const subScores = scoreAsks(askModelOf('av-early'), view, k, short.map((i) => ranked[i]))
      let subBest = 0
      for (let j = 1; j < subScores.length; j++) if (subScores[j] > subScores[subBest]) subBest = j
      if (short[subBest] !== iFull) differed++
    }
    expect(differed).toBeGreaterThan(0)
  })
})

describe('P6 — inert without an ask model', () => {
  it('changes nothing when there is no shortlist to select over', () => {
    const noClone = { skill: POLB.skill, style: { ...POLB.style, askModel: undefined } } as BotPolicy
    const withValue = { skill: POLB.skill, style: { ...POLB.style, askModel: undefined, askValueModel: 'av-late', askValueTopK: 3 } } as BotPolicy
    for (const { view } of POSITIONS) {
      const seed = hashSeed(`p6:${view.seat}`)()
      expect(decide(view, withValue, seed)).toEqual(decide(view, noClone, seed))
    }
  })
})

describe('P7 — validateStyle closes both knobs', () => {
  it('refuses a non-string model and a shortlist below two', () => {
    const base = POLB.style as StyleParams
    expect(validateStyle({ ...base, askValueModel: '' } as StyleParams).join(' ')).toContain('askValueModel')
    expect(validateStyle({ ...base, askValueModel: 3 as unknown as string } as StyleParams).join(' ')).toContain('askValueModel')
    // a shortlist of one is the clone and a shortlist of none is nothing: refused, never clamped, so a
    // dose sweep cannot read "the value lost" when the value was never consulted
    expect(validateStyle({ ...base, askValueTopK: 1 } as StyleParams).join(' ')).toContain('askValueTopK')
    expect(validateStyle({ ...base, askValueTopK: 0 } as StyleParams).join(' ')).toContain('askValueTopK')
    expect(validateStyle({ ...base, askValueTopK: 2.5 } as StyleParams).join(' ')).toContain('askValueTopK')
    expect(validateStyle({ ...base, askValueModel: 'av-late', askValueTopK: 3 } as StyleParams)).toEqual([])
  })
})

describe('P8 — absent from every roster style and every tier', () => {
  it('is a lab knob and nothing ships it', () => {
    for (const [id, s] of Object.entries(STYLE_ROSTER) as [string, StyleParams][]) {
      expect(s.askValueModel, id).toBeUndefined()
      expect(s.askValueTopK, id).toBeUndefined()
    }
    for (const t of TIERS) {
      expect(STYLE_PRESETS[t].askValueModel, t).toBeUndefined()
      expect(STYLE_PRESETS[t].askValueTopK, t).toBeUndefined()
    }
    expect(resolvePolicy(monetPolicy('v0.33')).style.askValueModel).toBeUndefined()
  })
})
