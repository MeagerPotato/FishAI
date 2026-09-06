/**
 * closing-four.test.ts — MONET.md 3.8r: the closing credit's four-of-six rung at its own dose
 * (v0.20b, `closingFour`).
 *
 * Pinned: (1) `closingFour` absent or 0 is byte identity with the base at every decision, and with
 * `closing` set it is byte identity with v0.12's credit (the same dose on both rungs reproduces the
 * one-knob credit exactly); (2) the rung: with `closingFour` alone the credit fires only where the
 * seat's certain picture has exactly one card outstanding after the hit — a seat-known four of six
 * — and is exactly `closingFour · wHit · p · 0.5` there, nothing at the five rung; with both knobs
 * the five rung's credit is unchanged by any `closingFour` and the four rung's is `closingFour`'s;
 * (3) the credit never promotes an uncertain ask above a certain hit, at a dose hot enough that
 * deleting the gate breaks it, with the priced ungating switch live beside it; (4) liveness and
 * determinism; (5) `validateStyle` rejects a negative or NaN dose; (6) absent from every roster
 * style and every tier. Whether the credit moves sets is the fit's question (MONET.md §3.8r).
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { SeatView } from '../../lib/engine/index.ts'
import type { Card } from '../../lib/engine/types.ts'
import { bookCards, cardBook, seatTeam } from '../../lib/engine/cards.ts'
import { buildKnowledge, holderOf, rankAsksWith } from '../../lib/engine/bots/knowledge.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { closingActive, closingBelief, closingCredit } from '../../lib/engine/bots/closing.ts'
import { STYLE_PRESETS, validateStyle } from '../../lib/engine/index.ts'
import type { BotDifficulty, BotPolicy, StyleParams } from '../../lib/engine/index.ts'
import { STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { canonicalAction } from './action-digest.ts'

const BASE = monetPolicy('v0.9') as BotPolicy
const withStyle = (over: Partial<StyleParams>): BotPolicy => ({ skill: BASE.skill, style: { ...BASE.style, ...over } })
const FOUR = 2
/** The four rung alone, at the pre-registered primary dose. */
const ALONE = withStyle({ closingFour: FOUR })
/** v0.12's credit. */
const V12 = withStyle({ closing: 0.5 })
/** The stack: v0.12's five rung, this rung's four rung. */
const STACK = withStyle({ closing: 0.5, closingFour: FOUR })
const OPTS = { logWindow: BASE.skill.logWindow, useConstraints: BASE.skill.useConstraints, marginal: true }
const TIERS: BotDifficulty[] = ['easy', 'medium', 'hard']

type State = ReturnType<typeof newGame>

function play(seed: string, pol: BotPolicy, visit: (state: State, view: SeatView, seed: number) => void): void {
  let s = newGame(seed, us54Config, 0)
  let steps = 0
  while (s.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const n = hashSeed(`${seed}:${s.moveIndex}`)()
    visit(s, view, n)
    const r = reduce(s, decide(view, pol, n))
    if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
    s = r.state
    steps++
  }
}

const isAskDecision = (view: SeatView): boolean => !view.declareWindow && view.phase === 'playing'

/** The seat-known own-side holding of the asked card's set, other than the asked card, counted independently of the module. */
function knownOwn(view: SeatView, k: ReturnType<typeof buildKnowledge>, card: Card): number {
  const me = seatTeam(view.seat)
  let known = 0
  for (const c of bookCards(cardBook(card), view.config)) {
    if (c === card) continue
    const h = holderOf(k, c)
    if (h !== null && seatTeam(h) === me) known++
  }
  return known
}

describe('the closing credit at the four rung (closingFour)', () => {
  it('absent or 0 is byte identity with the base, and with closing set it is byte identity with v0.12', () => {
    const zero = withStyle({ closingFour: 0 })
    const sameDose = withStyle({ closing: 0.5, closingFour: 0.5 })
    const zeroOnV12 = withStyle({ closing: 0.5, closingFour: 0 })
    expect(closingActive(BASE.style)).toBe(false)
    expect(closingActive(zero.style)).toBe(false)
    expect(closingActive(ALONE.style)).toBe(true)
    expect(closingActive(STACK.style)).toBe(true)
    expect(closingBelief(ALONE.style)).toBe(false)
    expect(closingBelief(withStyle({ closingFour: FOUR, closingBelief: true }).style)).toBe(true)
    let decisions = 0
    for (const seed of ['four-id-a', 'four-id-b', 'four-id-c']) {
      play(seed, BASE, (_s, view, n) => {
        const base = canonicalAction(decide(view, BASE, n))
        expect(canonicalAction(decide(view, zero, n))).toBe(base)
        const v12 = canonicalAction(decide(view, V12, n))
        expect(canonicalAction(decide(view, sameDose, n))).toBe(v12)
        expect(canonicalAction(decide(view, zeroOnV12, n))).toBe(v12)
        decisions++
      })
    }
    expect(decisions).toBeGreaterThan(1000)
  })

  it('fires only at a seat-known four of six, at exactly closingFour · wHit · p · 0.5, and leaves the five rung to closing', () => {
    let seen = 0
    let fourAlone = 0
    let fiveOnStack = 0
    let sureMisses = 0
    play('four-rung', ALONE, (_s, view) => {
      if (!isAskDecision(view)) return
      const k = buildKnowledge(view, OPTS)
      const me = seatTeam(view.seat)
      for (const r of rankAsksWith(view, k, ALONE.style)) {
        const alone = closingCredit(view, k, ALONE.style, r, r.p)
        const v12 = closingCredit(view, k, V12.style, r, r.p)
        const stack = closingCredit(view, k, STACK.style, r, r.p)
        expect(alone).toBeGreaterThanOrEqual(0)
        expect(alone).toBeLessThanOrEqual(FOUR * ALONE.style.wHit * 0.5 + 1e-9)
        const owner = holderOf(k, r.card)
        if (owner !== null && seatTeam(owner) === me) {
          expect(alone).toBe(0)
          expect(stack).toBe(0)
          sureMisses++
        }
        const known = knownOwn(view, k, r.card)
        const book = cardBook(r.card)
        if (alone > 0) {
          // the four rung and nothing else: exactly one card outstanding after the hit
          expect(known).toBe(bookCards(book, view.config).length - 2)
          expect(r.p).toBeGreaterThan(0)
          expect(view.books[book]).toBeFalsy()
          expect(alone).toBeCloseTo(FOUR * ALONE.style.wHit * r.p * 0.5, 9)
          // the stack pays the same here, and v0.12's credit is the one-knob dose at the same rung
          expect(stack).toBeCloseTo(alone, 9)
          expect(v12).toBeCloseTo(0.5 * V12.style.wHit * r.p * 0.5, 9)
          fourAlone++
        } else if (v12 > 0) {
          // v0.12 fires and this rung does not: the five rung, which the stack pays at closing's dose
          expect(known).toBe(bookCards(book, view.config).length - 1)
          expect(stack).toBeCloseTo(v12, 9)
          expect(v12).toBeCloseTo(0.5 * V12.style.wHit * r.p, 9)
          fiveOnStack++
        } else {
          expect(stack).toBe(0)
        }
        seen++
      }
    })
    expect(seen).toBeGreaterThan(500)
    expect(fourAlone).toBeGreaterThan(0)
    expect(fiveOnStack).toBeGreaterThan(0)
    expect(sureMisses).toBeGreaterThan(0)
  })

  it('never promotes an uncertain ask above a certain hit, at a hot dose and with the priced switch live', () => {
    // Overdosed on purpose (MONET.md 3.8h's test 5): at the fit's doses the credit is too small to
    // overtake `certaintyBonus` even with the gate deleted, so only a hot arm can tell the gate
    // from the arithmetic. Each arm is read against its own closing-free twin: wherever the twin
    // picks a certain hit, the arm must pick one too.
    const HOT = withStyle({ closingFour: 100 })
    const PRICED_TWIN = withStyle({ exposure: 0.5, exposureCertain: true })
    const ARMS: { twin: BotPolicy; arm: BotPolicy }[] = [
      { twin: BASE, arm: ALONE },
      { twin: BASE, arm: HOT },
      { twin: BASE, arm: withStyle({ closing: 0.5, closingFour: 100 }) },
      { twin: PRICED_TWIN, arm: withStyle({ closingFour: 100, exposure: 0.5, exposureCertain: true }) },
    ]
    let certainDecisions = 0
    let checked = 0
    for (const seed of ['four-gate-a', 'four-gate-b', 'four-gate-c']) {
      play(seed, ALONE, (_s, view, n) => {
        if (!isAskDecision(view)) return
        const k = buildKnowledge(view, OPTS)
        const ranked = rankAsksWith(view, k, ALONE.style)
        if (!ranked.some((r) => r.p === 1)) return
        certainDecisions++
        const pickedP = (pol: BotPolicy): number | undefined => {
          const a = decide(view, pol, n)
          if (a.type !== 'ask') return undefined
          return ranked.find((r) => r.card === a.card && r.target === a.target)?.p
        }
        for (const { twin, arm } of ARMS) {
          if (pickedP(twin) !== 1) continue
          expect(pickedP(arm)).toBe(1)
          checked++
        }
      })
    }
    expect(certainDecisions).toBeGreaterThan(30)
    expect(checked).toBeGreaterThan(120)
  })

  it('the pick differs from the base at some ask decisions, the game plays out, and the play is deterministic', () => {
    let asks = 0
    let moved = 0
    const first: string[] = []
    play('four-live', ALONE, (_s, view, n) => {
      if (!isAskDecision(view)) return
      asks++
      const a = canonicalAction(decide(view, ALONE, n))
      if (a !== canonicalAction(decide(view, BASE, n))) moved++
      if (first.length < 40) first.push(a)
    })
    expect(asks).toBeGreaterThan(30)
    expect(moved).toBeGreaterThan(0)
    const again: string[] = []
    play('four-live', ALONE, (_s, view, n) => {
      if (!isAskDecision(view)) return
      if (again.length < 40) again.push(canonicalAction(decide(view, ALONE, n)))
    })
    expect(again).toEqual(first)
  })

  it('validateStyle rejects a negative or NaN dose', () => {
    expect(validateStyle(ALONE.style)).toEqual([])
    expect(validateStyle(STACK.style)).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.punter, closingFour: 0 })).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.punter, closingFour: -1 })).toContain('closingFour -1 is not a number >= 0')
    expect(validateStyle({ ...STYLE_ROSTER.punter, closingFour: Number.NaN })).toContain('closingFour NaN is not a number >= 0')
  })

  it('the knob is absent from every roster style and every difficulty tier', () => {
    for (const [id, style] of Object.entries(STYLE_ROSTER) as [string, StyleParams][]) {
      expect(style.closingFour, id).toBeUndefined()
    }
    for (const t of TIERS) {
      expect(STYLE_PRESETS[t].closingFour, t).toBeUndefined()
    }
  })
})
