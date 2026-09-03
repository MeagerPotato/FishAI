/**
 * defuse-state.test.ts — MONET.md §3.6b: `defusePolicy: 'state'`, the defusal appetite as a
 * function of the public state.
 *
 * Pinned: (1) `'scalar'`, absent, or all-zero slopes is the base byte for byte over whole games;
 * (2) the appetite is exactly `defuse · max(0, 1 + threat·(T − 1) + score·S + late·L)` for the
 * T, S, L the test recomputes from the position on its own; (3) with the threat slope on, the
 * appetite is monotone in T across positions; (4) a state policy plays whole games legally and
 * differs from the base; (5) `validateStyle` closes both knobs, including the monotone constraint.
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { PolicySpec, Seat, SeatView } from '../../lib/engine/index.ts'
import { allBooks, deckFor, seatTeam } from '../../lib/engine/cards.ts'
import { buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import { defusalAppetite, logLicences } from '../../lib/engine/bots/defuse.ts'
import { preyInBook } from '../../lib/engine/bots/threat.ts'
import { STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { validateStyle } from '../../lib/engine/bots/style.ts'
import type { BotPolicy, DefuseState, StyleParams } from '../../lib/engine/bots/style.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { canonicalAction } from './action-digest.ts'

const BASE = monetPolicy('v0.4c') as BotPolicy
const withState = (slopes: DefuseState): PolicySpec => ({ skill: BASE.skill, style: { ...BASE.style, defusePolicy: 'state', defuseState: slopes } })
const OPTS = { logWindow: BASE.skill.logWindow, useConstraints: BASE.skill.useConstraints, marginal: true }

function views(seed: string, every = 4): SeatView[] {
  const out: SeatView[] = []
  let s = newGame(seed, us54Config, 0)
  let steps = 0
  while (s.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    if (steps % every === 0) out.push(view)
    const r = reduce(s, decide(view, BASE, hashSeed(`${seed}:${s.moveIndex}`)()))
    if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code}`)
    s = r.state
    steps++
  }
  return out
}

function divergence(seeds: string[], driver: PolicySpec, other: PolicySpec): { decisions: number; differ: number } {
  let decisions = 0
  let differ = 0
  for (const seed of seeds) {
    let s = newGame(seed, us54Config, 0)
    let steps = 0
    while (s.phase !== 'finished' && steps < 5000) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const moveSeed = hashSeed(`${seed}:${s.moveIndex}`)()
      const drove = decide(view, driver, moveSeed)
      const alt = decide(view, other, moveSeed)
      decisions++
      if (canonicalAction(drove) !== canonicalAction(alt)) differ++
      const r = reduce(s, drove)
      if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code}`)
      s = r.state
      steps++
    }
  }
  return { decisions, differ }
}

/** T, S, L recomputed from the position by the test, independently of defuse.ts's scan. */
function features(view: SeatView, k: ReturnType<typeof buildKnowledge>): { T: number; S: number; L: number } {
  const me = seatTeam(view.seat)
  const licences = logLicences(view, k)
  let T = 0
  for (const b of allBooks(view.config)) {
    if (view.books[b] || preyInBook(view, k, b) === 0) continue
    let threatened = false
    for (let o = 0; o < 6; o++) {
      if (seatTeam(o as Seat) === me || (view.counts[o] ?? 0) === 0) continue
      if (licences(o as Seat).has(b)) threatened = true
    }
    if (threatened) T++
  }
  let mine = 0
  let theirs = 0
  for (const r of Object.values(view.books)) {
    if (!r || r.outcome === 'void') continue
    if ((r.outcome === 'team0' ? 0 : 1) === me) mine++
    else theirs++
  }
  let inHands = 0
  for (const c of view.counts) inHands += c
  return { T: Math.min(2, T), S: Math.sign(mine - theirs), L: inHands * 2 < deckFor(view.config).handSize * 6 ? 1 : 0 }
}

describe("'scalar', absent, or all-zero slopes is the base, byte for byte", () => {
  it('plays exactly the base over whole games under each of the three spellings', () => {
    const scalar: PolicySpec = { skill: BASE.skill, style: { ...BASE.style, defusePolicy: 'scalar' } }
    const zero = withState({ threat: 0, score: 0, late: 0 })
    for (const other of [scalar, zero]) {
      const { decisions, differ } = divergence(['dstate-id-a', 'dstate-id-b'], BASE, other)
      expect(decisions).toBeGreaterThan(1000)
      expect(differ).toBe(0)
    }
  })

  it('the appetite under those spellings is `defuse` itself', () => {
    const style: StyleParams = { ...BASE.style, defusePolicy: 'state', defuseState: { threat: 0, score: 0, late: 0 } }
    for (const view of views('dstate-app-0')) {
      const k = buildKnowledge(view, OPTS)
      expect(defusalAppetite(view, k, BASE.style, logLicences(view, k))).toBe(BASE.style.defuse)
      expect(defusalAppetite(view, k, style, logLicences(view, k))).toBe(BASE.style.defuse)
    }
  })
})

describe('the appetite is the formula over the features the test recomputes', () => {
  it('matches `defuse · max(0, 1 + threat·(T − 1) + score·S + late·L)` on every position', () => {
    const slopes: DefuseState = { threat: 0.5, score: -0.3, late: 0.4 }
    const style: StyleParams = { ...BASE.style, defusePolicy: 'state', defuseState: slopes }
    const seen = { T: new Set<number>(), S: new Set<number>(), L: new Set<number>() }
    let checked = 0
    for (const seed of ['dstate-f-a', 'dstate-f-b', 'dstate-f-c']) {
      for (const view of views(seed, 3)) {
        const k = buildKnowledge(view, OPTS)
        const { T, S, L } = features(view, k)
        seen.T.add(T)
        seen.S.add(S)
        seen.L.add(L)
        const want = BASE.style.defuse * Math.max(0, 1 + slopes.threat * (T - 1) + slopes.score * S + slopes.late * L)
        expect(defusalAppetite(view, k, style, logLicences(view, k))).toBeCloseTo(want, 12)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(200)
    // the features actually vary over real games, so the formula was exercised, not just evaluated
    expect(seen.T.size).toBeGreaterThanOrEqual(2)
    expect(seen.S.size).toBe(3)
    expect(seen.L.size).toBe(2)
  })

  it('never goes negative, and a large negative score slope clips to 0 rather than below', () => {
    const style: StyleParams = { ...BASE.style, defusePolicy: 'state', defuseState: { threat: 0, score: -5, late: 0 } }
    let zeros = 0
    for (const view of views('dstate-clip')) {
      const k = buildKnowledge(view, OPTS)
      const a = defusalAppetite(view, k, style, logLicences(view, k))
      expect(a).toBeGreaterThanOrEqual(0)
      if (a === 0) zeros++
    }
    expect(zeros).toBeGreaterThan(0)
  })
})

describe('on real positions the policy is live, and legal', () => {
  it('a state policy plays whole games legally and differs from the base', () => {
    // the defusal credit decides the top ask rarely (§3.3b priced the whole knob inside the floor),
    // so the divergence is read with slopes wide enough to swing the appetite from 0 to 5x over
    // four games — a few decisions in a thousand, and never zero
    const policy = withState({ threat: 2, score: 1, late: 1 })
    let decisions = 0
    for (const seed of ['dstate-live-a', 'dstate-live-b', 'dstate-live-c']) {
      let s = newGame(seed, us54Config, 0)
      let steps = 0
      while (s.phase !== 'finished' && steps < 5000) {
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        const r = reduce(s, decide(view, policy, hashSeed(`${seed}:${s.moveIndex}`)()))
        if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code}`)
        s = r.state
        steps++
        decisions++
      }
      expect(s.phase).toBe('finished')
    }
    expect(decisions).toBeGreaterThan(1000)
    const { decisions: n, differ } = divergence(['dstate-live-d', 'dstate-live-e', 'dstate-live-f', 'dstate-live-g'], BASE, policy)
    expect(differ).toBeGreaterThan(0)
    expect(differ / n).toBeLessThan(0.02)
  })
})

describe('validateStyle closes both knobs', () => {
  it("accepts 'scalar' / 'state' with finite slopes, refuses a negative threat slope, and no roster style carries either", () => {
    const base = STYLE_ROSTER.punter
    expect(validateStyle({ ...base, defusePolicy: 'scalar' })).toEqual([])
    expect(validateStyle({ ...base, defusePolicy: 'state', defuseState: { threat: 0.5, score: -0.5, late: 0 } })).toEqual([])
    expect(validateStyle({ ...base, defusePolicy: 'table' as 'state' })).toEqual([expect.stringContaining('defusePolicy')])
    expect(validateStyle({ ...base, defusePolicy: 'state', defuseState: { threat: -0.1, score: 0, late: 0 } })).toEqual([expect.stringContaining('threat')])
    expect(validateStyle({ ...base, defusePolicy: 'state', defuseState: { threat: Number.NaN, score: 0, late: 0 } })).toEqual([expect.stringContaining('defuseState')])
    for (const id of Object.keys(STYLE_ROSTER) as (keyof typeof STYLE_ROSTER)[]) {
      expect(STYLE_ROSTER[id].defusePolicy, id).toBeUndefined()
      expect(STYLE_ROSTER[id].defuseState, id).toBeUndefined()
    }
    expect(BASE.style.defusePolicy).toBeUndefined()
  })
})
