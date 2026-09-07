/**
 * closing-three.test.ts — MONET.md 3.8u: the closing credit's rung below the four, at its own dose
 * (v0.22, `closingThree`).
 *
 * Pinned: (1) `closingThree` absent or 0 is byte identity with the base at every decision, and 0 on
 * the shipped stack (`closing` 0.5 + `closingFour` 2) is byte identity with that stack; (2) the
 * rung: with `closingThree` alone the credit fires only where the seat's certain picture has exactly
 * two cards outstanding after the hit — a seat-known three of six — and is exactly
 * `closingThree · wHit · p · 0.25` there, nothing at the four or five rung; on the full stack the
 * four and five rungs pay exactly what the shipped stack pays and the three rung pays this knob's;
 * (3) the credit never promotes an uncertain ask above a certain hit, at a dose hot enough that
 * deleting the gate breaks it, with the priced ungating switch live beside it; (4) liveness and
 * determinism; (5) `validateStyle` rejects a negative or NaN dose; (6) absent from every roster
 * style and every tier. Whether the credit moves sets is the fit's question (MONET.md §3.8u).
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
const THREE = 2
/** The three rung alone. */
const ALONE = withStyle({ closingThree: THREE })
/** The shipped stack, v0.20c's vector (MONET.md 3.8s). */
const SHIPPED = withStyle({ closing: 0.5, closingFour: 2 })
/** The shipped stack plus this rung. */
const STACK = withStyle({ closing: 0.5, closingFour: 2, closingThree: THREE })
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

describe('the closing credit at the three rung (closingThree)', () => {
  it('absent or 0 is byte identity with the base, and 0 on the shipped stack is byte identity with the stack', () => {
    const zero = withStyle({ closingThree: 0 })
    const zeroOnStack = withStyle({ closing: 0.5, closingFour: 2, closingThree: 0 })
    expect(closingActive(BASE.style)).toBe(false)
    expect(closingActive(zero.style)).toBe(false)
    expect(closingActive(ALONE.style)).toBe(true)
    expect(closingActive(STACK.style)).toBe(true)
    expect(closingBelief(ALONE.style)).toBe(false)
    expect(closingBelief(withStyle({ closingThree: THREE, closingBelief: true }).style)).toBe(true)
    let decisions = 0
    for (const seed of ['three-id-a', 'three-id-b', 'three-id-c']) {
      play(seed, BASE, (_s, view, n) => {
        const base = canonicalAction(decide(view, BASE, n))
        expect(canonicalAction(decide(view, zero, n))).toBe(base)
        expect(canonicalAction(decide(view, zeroOnStack, n))).toBe(canonicalAction(decide(view, SHIPPED, n)))
        decisions++
      })
    }
    expect(decisions).toBeGreaterThan(1000)
  })

  it('fires only at a seat-known three of six, at exactly closingThree · wHit · p · 0.25, and leaves the four and five rungs to the stack', () => {
    let seen = 0
    let threeAlone = 0
    let upperOnStack = 0
    let sureMisses = 0
    play('three-rung', ALONE, (_s, view) => {
      if (!isAskDecision(view)) return
      const k = buildKnowledge(view, OPTS)
      const me = seatTeam(view.seat)
      for (const r of rankAsksWith(view, k, ALONE.style)) {
        const alone = closingCredit(view, k, ALONE.style, r, r.p)
        const shipped = closingCredit(view, k, SHIPPED.style, r, r.p)
        const stack = closingCredit(view, k, STACK.style, r, r.p)
        expect(alone).toBeGreaterThanOrEqual(0)
        expect(alone).toBeLessThanOrEqual(THREE * ALONE.style.wHit * 0.25 + 1e-9)
        const owner = holderOf(k, r.card)
        if (owner !== null && seatTeam(owner) === me) {
          expect(alone).toBe(0)
          expect(stack).toBe(0)
          sureMisses++
        }
        const known = knownOwn(view, k, r.card)
        const book = cardBook(r.card)
        const size = bookCards(book, view.config).length
        if (alone > 0) {
          // the three rung and nothing else: exactly two cards outstanding after the hit
          expect(known).toBe(size - 3)
          expect(r.p).toBeGreaterThan(0)
          expect(view.books[book]).toBeFalsy()
          expect(alone).toBeCloseTo(THREE * ALONE.style.wHit * r.p * 0.25, 9)
          // the shipped stack pays nothing here; the full stack pays this rung's credit
          expect(shipped).toBe(0)
          expect(stack).toBeCloseTo(alone, 9)
          threeAlone++
        } else if (shipped > 0) {
          // the four or five rung: this knob pays nothing and the full stack pays the shipped stack's credit
          expect(known === size - 2 || known === size - 1).toBe(true)
          expect(stack).toBeCloseTo(shipped, 9)
          upperOnStack++
        } else {
          expect(stack).toBe(0)
        }
        seen++
      }
    })
    expect(seen).toBeGreaterThan(500)
    expect(threeAlone).toBeGreaterThan(0)
    expect(upperOnStack).toBeGreaterThan(0)
    expect(sureMisses).toBeGreaterThan(0)
  })

  it('never promotes an uncertain ask above a certain hit, at a hot dose and with the priced switch live', () => {
    // Overdosed on purpose (MONET.md 3.8h's test 5): at the fit's doses the credit is too small to
    // overtake `certaintyBonus` even with the gate deleted, so only a hot arm can tell the gate
    // from the arithmetic. Each arm is read against its own closing-free twin: wherever the twin
    // picks a certain hit, the arm must pick one too.
    const HOT = withStyle({ closingThree: 100 })
    const PRICED_TWIN = withStyle({ exposure: 0.5, exposureCertain: true })
    const ARMS: { twin: BotPolicy; arm: BotPolicy }[] = [
      { twin: BASE, arm: ALONE },
      { twin: BASE, arm: HOT },
      { twin: BASE, arm: withStyle({ closing: 0.5, closingFour: 2, closingThree: 100 }) },
      { twin: PRICED_TWIN, arm: withStyle({ closingThree: 100, exposure: 0.5, exposureCertain: true }) },
    ]
    let certainDecisions = 0
    let checked = 0
    for (const seed of ['three-gate-a', 'three-gate-b', 'three-gate-c']) {
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
    play('three-live', ALONE, (_s, view, n) => {
      if (!isAskDecision(view)) return
      asks++
      const a = canonicalAction(decide(view, ALONE, n))
      if (a !== canonicalAction(decide(view, BASE, n))) moved++
      if (first.length < 40) first.push(a)
    })
    expect(asks).toBeGreaterThan(30)
    expect(moved).toBeGreaterThan(0)
    const again: string[] = []
    play('three-live', ALONE, (_s, view, n) => {
      if (!isAskDecision(view)) return
      if (again.length < 40) again.push(canonicalAction(decide(view, ALONE, n)))
    })
    expect(again).toEqual(first)
  })

  it('validateStyle rejects a negative or NaN dose', () => {
    expect(validateStyle(ALONE.style)).toEqual([])
    expect(validateStyle(STACK.style)).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.punter, closingThree: 0 })).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.punter, closingThree: -1 })).toContain('closingThree -1 is not a number >= 0')
    expect(validateStyle({ ...STYLE_ROSTER.punter, closingThree: Number.NaN })).toContain('closingThree NaN is not a number >= 0')
  })

  it('the knob is absent from every roster style and every difficulty tier', () => {
    for (const [id, style] of Object.entries(STYLE_ROSTER) as [string, StyleParams][]) {
      expect(style.closingThree, id).toBeUndefined()
    }
    for (const t of TIERS) {
      expect(STYLE_PRESETS[t].closingThree, t).toBeUndefined()
    }
  })
})
