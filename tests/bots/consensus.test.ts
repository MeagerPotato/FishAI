/**
 * consensus.test.ts — MONET.md 3.8b: the determinized declare.
 *
 * Pinned: (1) `consensusDet` absent or 0 is byte identity with the base at every decision, and so
 * is a bar without a D; (2) every consensus claim is sound — the assignment puts the seat's own
 * cards at the seat, every other card at one of its candidates on the seat's own team — and legal
 * for the engine, and on the true deal it is right far more often than not; (3) liveness: with
 * the choice prior on and D 64 at unanimity, consensus claims occur in mirror play and each one is
 * traced as `consensus-claim`; (4) determinism; (5) `validateStyle` rejects a fractional D and a
 * bar outside (0, 1]. Whether the claims move sets is the fit's question and belongs in MONET.md.
 */
import { describe, expect, it } from 'vitest'
import { decide, decideExplained, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { Card, Seat, SeatView } from '../../lib/engine/index.ts'
import { consensusFor } from '../../lib/engine/bots/consensus.ts'
import { buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { validateStyle } from '../../lib/engine/bots/style.ts'
import type { BotPolicy, StyleParams } from '../../lib/engine/bots/style.ts'
import { mulberry32 } from '../../lib/engine/rng.ts'
import { canonicalAction } from './action-digest.ts'

const BASE = monetPolicy('v0.4c') as BotPolicy
const withStyle = (over: Partial<StyleParams>): BotPolicy => ({ skill: BASE.skill, style: { ...BASE.style, ...over } })
const ON = withStyle({ choiceKappa: 1, choicePrior: 'count', consensusDet: 64, consensusBar: 1 })
const DECLARE_ONLY = withStyle({ consensusDet: 64, consensusBar: 1, consensusKappa: 1 })
const OPTS = { logWindow: BASE.skill.logWindow, useConstraints: BASE.skill.useConstraints, marginal: true }
const team = (s: Seat) => s % 2

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

describe('the determinized declare', () => {
  it('consensusDet absent or 0, or a bar alone, is byte identity with the base', () => {
    const zero = withStyle({ consensusDet: 0 })
    const barOnly = withStyle({ consensusBar: 0.5, consensusKappa: 1 })
    let decisions = 0
    for (const seed of ['cons-id-a', 'cons-id-b', 'cons-id-c']) {
      play(seed, BASE, (_s, view, n) => {
        const base = canonicalAction(decide(view, BASE, n))
        expect(canonicalAction(decide(view, zero, n))).toBe(base)
        expect(canonicalAction(decide(view, barOnly, n))).toBe(base)
        decisions++
      })
    }
    expect(decisions).toBeGreaterThan(1000)
  })

  it('every consensus claim is sound, legal, traced, mostly right on the true deal, and the claims occur', () => {
    let claims = 0
    let right = 0
    for (let g = 0; g < 12; g++) {
      const seed = `cons-live-${g}`
      play(seed, ON, (state, view, n) => {
        if (!view.declareWindow) return
        const d = decideExplained(view, ON, n)
        if (d.trace.kind !== 'consensus-claim') return
        claims++
        expect(d.action.type).toBe('claim')
        if (d.action.type !== 'claim') return
        const k = buildKnowledge(view, OPTS)
        const cards = Object.keys(d.action.assignments) as Card[]
        expect(cards).toHaveLength(6)
        let ok = true
        for (const c of cards) {
          const at = d.action.assignments[c]
          expect(team(at)).toBe(team(view.seat))
          if (view.hand.includes(c)) expect(at).toBe(view.seat)
          else expect(k.cands[c] ?? []).toContain(at)
          if (!state.hands[at].includes(c)) ok = false
        }
        if (ok) right++
        expect(reduce(state, d.action).ok).toBe(true)
        // the evidence the claim rests on is reproducible from the seat's own knowledge
        const c = consensusFor(view, k, d.action.book, 64, mulberry32(n))
        expect(c.assignment).not.toBeNull()
        expect(c.agreement).toBeGreaterThan(0)
      })
    }
    expect(claims).toBeGreaterThan(0)
    expect(right / claims).toBeGreaterThanOrEqual(0.8)
  }, 300_000)

  it('consensusKappa sharpens the declare alone: every ask is the base ask, and consensus claims occur', () => {
    let claims = 0
    let asks = 0
    for (let g = 0; g < 6; g++) {
      play(`cons-declare-only-${g}`, DECLARE_ONLY, (_s, view, n) => {
        const d = decideExplained(view, DECLARE_ONLY, n)
        if (d.trace.kind === 'consensus-claim') claims++
        if (!view.declareWindow) {
          asks++
          expect(canonicalAction(d.action)).toBe(canonicalAction(decide(view, BASE, n)))
        }
      })
    }
    expect(asks).toBeGreaterThan(200)
    expect(claims).toBeGreaterThan(0)
  }, 300_000)

  it('is deterministic for the same inputs', () => {
    play('cons-det-a', ON, (_s, view, n) => {
      if (!view.declareWindow) return
      const once = decideExplained(view, ON, n)
      const again = decideExplained(view, ON, n)
      expect(canonicalAction(again.action)).toBe(canonicalAction(once.action))
      expect(again.trace.kind).toBe(once.trace.kind)
    })
  })

  it('validateStyle rejects a fractional D and a bar outside (0, 1]', () => {
    expect(validateStyle({ ...BASE.style, consensusDet: 64, consensusBar: 0.95 })).toEqual([])
    expect(validateStyle({ ...BASE.style, consensusDet: 2.5 })).not.toEqual([])
    expect(validateStyle({ ...BASE.style, consensusDet: -1 })).not.toEqual([])
    expect(validateStyle({ ...BASE.style, consensusBar: 0 })).not.toEqual([])
    expect(validateStyle({ ...BASE.style, consensusBar: 1.5 })).not.toEqual([])
    expect(validateStyle({ ...BASE.style, consensusKappa: -1 })).not.toEqual([])
    expect(validateStyle({ ...BASE.style, consensusDet: 64, consensusKappa: 2.5 })).toEqual([])
  })
})
