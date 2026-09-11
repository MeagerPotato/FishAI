/**
 * ask-advantage.test.ts — MONET.md §3.8aw stage C / §3.8ax C′: the learned ask advantage over the clone's
 * choice, behind a margin.
 *
 * Pinned: (P1) absent, `decide` is byte identity with v0.33's vector, and the margin alone is inert; (P2) an
 * INDIFFERENT model (every weight zero) is byte-identical to the clone at every margin, because nothing scores
 * strictly above the clone's choice; (P3) the rows are the ones the fit and the marker read — the clone's
 * forty-nine over the WHOLE ranked list, the clone's score less the list's best, and the clone's-choice flag —
 * rebuilt here from the three calls `scripts/ask-advantage-features.mjs` makes; (P4) every legal ask is a
 * candidate: a model that prefers the clone's worst entry takes it, far outside any shortlist, and ties go the
 * way the marker's scan sent them; (P5) the margin gates the deviation exactly — the model's best is played
 * only where it scores more than the margin above the clone's choice; (P6) inert without `askModel`; (P7)
 * `validateStyle` closes both knobs and refuses the advantage beside the value, and registration refuses any
 * other width; (P8) both are absent from every roster style, every tier and every Monet version.
 *
 * Whether the fitted advantage plays WELL is the pairs' question (§3.8ax C′), not this file's.
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
import { MONET_VERSION_IDS, monetPolicy } from '../../lib/engine/bots/monet.ts'
import {
  ASK_ADVANTAGE_FEATURES,
  ASK_ADVANTAGE_FEATURE_COUNT,
  ASK_FEATURE_COUNT_2,
  askAdvantageModelOf,
  askAdvantageRows,
  askFeatureRows,
  askModelOf,
  chooseAskByAdvantage,
  chooseAskByModel,
  registerAskAdvantageModel,
  scoreAsks,
} from '../../lib/engine/bots/imitation.ts'
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

/** A linear model over the advantage row's raw values: unit standardisation, no bias. */
function linear(weights: Partial<Record<(typeof ASK_ADVANTAGE_FEATURES)[number], number>>): AskModel {
  return {
    features: ASK_ADVANTAGE_FEATURE_COUNT,
    mean: new Array(ASK_ADVANTAGE_FEATURE_COUNT).fill(0),
    std: new Array(ASK_ADVANTAGE_FEATURE_COUNT).fill(1),
    layers: [{ w: ASK_ADVANTAGE_FEATURES.map((n) => weights[n] ?? 0), b: [0] }],
  }
}
registerAskAdvantageModel('adv-zero', linear({}))
// `cloneRel` is the clone's score less the list's best, so a negative weight scores the clone's WORST entry
// highest: a preference as far from the clone's as a model can hold, outside any shortlist of three on a
// list of four or more.
registerAskAdvantageModel('adv-worst', linear({ cloneRel: -1 }))
// Every entry but the clone's choice scores 0 and the choice scores -1, so the best is a tie of all the
// others, which the marker's scan resolved to the earliest.
registerAskAdvantageModel('adv-not-clone', linear({ isCloneTop: -1 }))

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
const POSITIONS = [...askPositions('askadv-a', 3), ...askPositions('askadv-b', 3)]

/** The knowledge and the ranker's full list at a position, as the marker built them. */
function listAt(view: SeatView) {
  const k = buildKnowledge(view, OPTS)
  return { k, ranked: rankAsksWith(view, k, style) }
}

describe('P1 — the knob absent is byte identity', () => {
  it('leaves every decision of v0.33 exactly where it was, and the margin alone changes nothing', () => {
    expect(POSITIONS.length).toBeGreaterThan(20)
    for (const { view } of POSITIONS) {
      const seed = hashSeed(`p1:${view.seat}`)()
      const plain = decide(view, POL, seed)
      expect(decide(view, withKnob({}), seed)).toEqual(plain)
      expect(decide(view, withKnob({ askAdvantageMargin: 0.2 }), seed)).toEqual(plain)
    }
  })
})

describe('P2 — an indifferent model keeps the clone, at every margin', () => {
  it('scores every entry alike, so nothing displaces the clone and every decision is unchanged', () => {
    for (const { view } of POSITIONS) {
      const { k, ranked } = listAt(view)
      const clonePick = chooseAskByModel(CLONE, view, k, ranked)
      for (const margin of [0, 0.2]) {
        const r = chooseAskByAdvantage(CLONE, askAdvantageModelOf('adv-zero'), view, k, ranked, margin)
        expect(r.ask).toBe(clonePick)
        expect(r.cloneAsk).toBe(clonePick)
        expect(r.gap === 0).toBe(true)
        const seed = hashSeed(`p2:${view.seat}:${margin}`)()
        expect(decide(view, withKnob({ askAdvantageModel: 'adv-zero', askAdvantageMargin: margin }), seed)).toEqual(decide(view, POL, seed))
      }
    }
  })
})

describe('P3 — the rows are the ones the fit and the marker read', () => {
  it('extends the clone forty-nine over the whole list with its opinion, exactly as the script built them', () => {
    for (const { view } of POSITIONS) {
      const { k, ranked } = listAt(view)
      // scripts/ask-advantage-features.mjs: the second set's rows, the clone's scores and its choice's index
      const base = askFeatureRows(view, k, ranked, 2)
      const cs = scoreAsks(CLONE, view, k, ranked)
      const ti = ranked.indexOf(chooseAskByModel(CLONE, view, k, ranked))
      let mx = -Infinity
      for (const v of cs) if (v > mx) mx = v
      const { rows, cloneScores, cloneIndex } = askAdvantageRows(CLONE, view, k, ranked)
      expect(cloneIndex).toBe(ti)
      expect(cloneScores).toEqual(cs)
      expect(rows.length).toBe(ranked.length)
      rows.forEach((x, j) => {
        expect(x.length).toBe(ASK_FEATURE_COUNT_2 + 2)
        expect(Array.from(x.subarray(0, ASK_FEATURE_COUNT_2))).toEqual(Array.from(base[j]))
        expect(x[ASK_FEATURE_COUNT_2] === cs[j] - mx).toBe(true)
        expect(x[ASK_FEATURE_COUNT_2 + 1]).toBe(j === ti ? 1 : 0)
      })
    }
  })

  it('refuses a clone at another width, whose rows these are not', () => {
    const { view } = POSITIONS[0]
    const { k, ranked } = listAt(view)
    expect(() => askAdvantageRows(askModelOf('sestina-clone'), view, k, ranked)).toThrow(/second feature set/)
  })
})

describe('P4 — every legal ask is a candidate, and ties go as the marker scanned them', () => {
  it('takes the clone worst entry, outside any shortlist, and it is always a legal ask', () => {
    let outside = 0
    let moved = 0
    let checked = 0
    for (const { view } of POSITIONS) {
      const { k, ranked } = listAt(view)
      if (ranked.length < 2) continue
      const cs = scoreAsks(CLONE, view, k, ranked)
      const ti = ranked.indexOf(chooseAskByModel(CLONE, view, k, ranked))
      let mx = -Infinity
      for (const v of cs) if (v > mx) mx = v
      const f = cs.map((v) => -(v - mx))
      const maxF = Math.max(...f)
      const want = f[ti] === maxF ? ti : f.indexOf(maxF)
      const r = chooseAskByAdvantage(CLONE, askAdvantageModelOf('adv-worst'), view, k, ranked, 0)
      const idx = ranked.indexOf(r.ask)
      expect(idx).toBe(want)
      expect(r.gap === maxF - f[ti]).toBe(true)
      expect(legalAsksFromView(view).some((a) => a.target === r.ask.target && a.card === r.ask.card)).toBe(true)
      const order = ranked.map((_, i) => i).sort((a, b) => cs[b] - cs[a] || a - b)
      if (order.indexOf(idx) >= 3) outside++
      // the tie: every entry but the clone's choice scores alike, and the earliest of them is the best
      const tie = chooseAskByAdvantage(CLONE, askAdvantageModelOf('adv-not-clone'), view, k, ranked, 0)
      expect(ranked.indexOf(tie.ask)).toBe(ti === 0 ? 1 : 0)
      expect(tie.gap === 1).toBe(true)
      const seed = hashSeed(`p4:${view.seat}`)()
      const d = decide(view, withKnob({ askAdvantageModel: 'adv-worst' }), seed)
      const plain = decide(view, POL, seed)
      if (d.type !== plain.type || JSON.stringify(d) !== JSON.stringify(plain)) moved++
      checked++
    }
    expect(checked).toBeGreaterThan(20)
    expect(outside).toBeGreaterThan(0)
    expect(moved).toBeGreaterThan(0)
  })
})

describe('P5 — the margin gates the deviation exactly', () => {
  it('plays the model best only where it scores more than the margin above the clone choice', () => {
    let kept = 0
    let took = 0
    const adv = askAdvantageModelOf('adv-worst')
    for (const { view } of POSITIONS) {
      const { k, ranked } = listAt(view)
      const free = chooseAskByAdvantage(CLONE, adv, view, k, ranked, 0)
      for (const margin of [0, 0.5, 1, 2, 4, 1e9]) {
        const r = chooseAskByAdvantage(CLONE, adv, view, k, ranked, margin)
        expect(r.gap === free.gap).toBe(true)
        expect(r.cloneAsk).toBe(free.cloneAsk)
        if (free.gap > margin) {
          expect(r.ask).toBe(free.ask)
          took++
        } else {
          expect(r.ask).toBe(free.cloneAsk)
          kept++
        }
      }
      const seed = hashSeed(`p5:${view.seat}`)()
      expect(decide(view, withKnob({ askAdvantageModel: 'adv-worst', askAdvantageMargin: 1e9 }), seed)).toEqual(decide(view, POL, seed))
    }
    expect(kept).toBeGreaterThan(0)
    expect(took).toBeGreaterThan(0)
  })
})

describe('P6 — inert without an ask model', () => {
  it('changes nothing when there is no clone to extend', () => {
    const noClone = withKnob({ askModel: undefined })
    const withAdv = withKnob({ askModel: undefined, askAdvantageModel: 'adv-worst', askAdvantageMargin: 0 })
    for (const { view } of POSITIONS) {
      const seed = hashSeed(`p6:${view.seat}`)()
      expect(decide(view, withAdv, seed)).toEqual(decide(view, noClone, seed))
    }
  })
})

describe('P7 — validateStyle closes both knobs, and registration closes the width', () => {
  it('refuses a non-string model, a margin that is negative or not a finite number, and the advantage beside the value', () => {
    const base = POLB.style as StyleParams
    expect(validateStyle({ ...base, askAdvantageModel: '' } as StyleParams).join(' ')).toContain('askAdvantageModel')
    expect(validateStyle({ ...base, askAdvantageModel: 3 as unknown as string } as StyleParams).join(' ')).toContain('askAdvantageModel')
    expect(validateStyle({ ...base, askAdvantageMargin: -0.1 } as StyleParams).join(' ')).toContain('askAdvantageMargin')
    expect(validateStyle({ ...base, askAdvantageMargin: Number.NaN } as StyleParams).join(' ')).toContain('askAdvantageMargin')
    expect(validateStyle({ ...base, askAdvantageMargin: Number.POSITIVE_INFINITY } as StyleParams).join(' ')).toContain('askAdvantageMargin')
    expect(validateStyle({ ...base, askAdvantageMargin: '0.2' as unknown as number } as StyleParams).join(' ')).toContain('askAdvantageMargin')
    expect(validateStyle({ ...base, askAdvantageModel: 'adv-worst', askValueModel: 'av' } as StyleParams).join(' ')).toContain('askValueModel')
    expect(validateStyle({ ...base, askAdvantageModel: 'adv-worst', askAdvantageMargin: 0.2 } as StyleParams)).toEqual([])
  })

  it('refuses a model at the clone width, so the clone cannot be registered as its own advantage', () => {
    const wrong: AskModel = { ...linear({}), features: ASK_FEATURE_COUNT_2, mean: new Array(ASK_FEATURE_COUNT_2).fill(0), std: new Array(ASK_FEATURE_COUNT_2).fill(1), layers: [{ w: new Array(ASK_FEATURE_COUNT_2).fill(0), b: [0] }] }
    expect(() => registerAskAdvantageModel('adv-wrong-width', wrong)).toThrow()
    expect(() => askAdvantageModelOf('adv-wrong-width')).toThrow(/no ask advantage model/)
  })
})

describe('P8 — absent from every roster style, every tier and every Monet version', () => {
  it('is a lab knob and nothing ships it', () => {
    for (const [id, s] of Object.entries(STYLE_ROSTER) as [string, StyleParams][]) {
      expect(s.askAdvantageModel, id).toBeUndefined()
      expect(s.askAdvantageMargin, id).toBeUndefined()
    }
    for (const t of TIERS) {
      expect(STYLE_PRESETS[t].askAdvantageModel, t).toBeUndefined()
      expect(STYLE_PRESETS[t].askAdvantageMargin, t).toBeUndefined()
    }
    for (const v of MONET_VERSION_IDS) {
      const s = resolvePolicy(monetPolicy(v)).style
      expect(s.askAdvantageModel, v).toBeUndefined()
      expect(s.askAdvantageMargin, v).toBeUndefined()
    }
  })
})
