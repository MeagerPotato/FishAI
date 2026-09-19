/**
 * team-hands.test.ts — ATHENA.md §8.5: `teamHands`, the test-only knowledge option behind T1 (Monet v1.0 whose
 * knowledge also holds its two teammates' true hands).
 *
 * Pinned: (1) absent, empty, or naming only the viewer or opponents, the build is the plain one, key for key, on
 * every sampled position of three v1.0 games; (2) with the two teammates' true hands, every card a teammate holds is
 * certain at that teammate, every certainty is true, and the viewer's team has no unknown slot; (3) through `decide`,
 * a style carrying the hands plays a legal game and differs from the plain style somewhere; (4) `validateStyle`
 * accepts a well-formed list and refuses a malformed one; (5) no registry entry sets it.
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config, seatTeam } from '../../lib/engine/index.ts'
import type { GameState, Seat, SeatView } from '../../lib/engine/index.ts'
import { buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import { marginalFor } from '../../lib/engine/bots/marginal.ts'
import { validateStyle } from '../../lib/engine/bots/style.ts'
import type { BotPolicy } from '../../lib/engine/bots/style.ts'
import { MONET_VERSIONS, monetPolicy } from '../../lib/engine/bots/monet.ts'
import type { TeamHand } from '../../lib/engine/bots/types.ts'

const V10 = monetPolicy('v1.0') as BotPolicy
const OPTS = { logWindow: V10.skill.logWindow, useConstraints: V10.skill.useConstraints, marginal: true }

const mates = (seat: Seat): Seat[] => ([0, 1, 2, 3, 4, 5] as Seat[]).filter((t) => t !== seat && seatTeam(t) === seatTeam(seat))
const teamHandsOf = (s: GameState, seat: Seat): TeamHand[] => mates(seat).map((t) => ({ seat: t, hand: [...s.hands[t]] }))

function positions(seed: string, every = 4): { s: GameState; view: SeatView }[] {
  const out: { s: GameState; view: SeatView }[] = []
  let s = newGame(seed, us54Config, 0)
  let steps = 0
  while (s.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    if (steps % every === 0) out.push({ s, view })
    const r = reduce(s, decide(view, V10, hashSeed(`${seed}:${s.moveIndex}`)()))
    if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code}`)
    s = r.state
    steps++
  }
  return out
}

const SEEDS = ['team-hands-a', 'team-hands-b', 'team-hands-c']
const POS = SEEDS.flatMap((seed) => positions(seed))

describe('absent, empty or not a teammate: the plain build, key for key', () => {
  it('holds on every sampled position of three v1.0 games', () => {
    let n = 0
    for (const { s, view } of POS) {
      const plain = buildKnowledge(view, OPTS)
      const opps = ([0, 1, 2, 3, 4, 5] as Seat[]).filter((t) => seatTeam(t) !== seatTeam(view.seat)).map((t) => ({ seat: t, hand: [...s.hands[t]] }))
      for (const teamHands of [undefined, [], [{ seat: view.seat, hand: [...s.hands[view.seat]] }], opps]) {
        const k = buildKnowledge(view, { ...OPTS, teamHands })
        expect(k).toEqual(plain)
        const tp = marginalFor(plain)
        const tk = marginalFor(k)
        expect(tk === null).toBe(tp === null)
        if (tp && tk) expect(Array.from(tk.p)).toEqual(Array.from(tp.p))
      }
      n++
    }
    expect(n).toBeGreaterThan(300)
  })
})

describe("with the teammates' true hands", () => {
  it('places every teammate card, keeps every certainty true, and leaves the team no unknown slot', () => {
    let n = 0
    let gained = 0
    for (const { s, view } of POS) {
      const plain = buildKnowledge(view, OPTS)
      const k = buildKnowledge(view, { ...OPTS, teamHands: teamHandsOf(s, view.seat) })
      for (const t of mates(view.seat)) {
        for (const c of s.hands[t]) expect(k.holders[c]).toBe(t)
        expect(k.unknownSlots[t]).toBe(0)
      }
      expect(k.unknownSlots[view.seat]).toBe(0)
      for (const [c, h] of Object.entries(k.holders)) {
        expect(s.hands[h as Seat]).toContain(c)
      }
      if (Object.keys(k.holders).length > Object.keys(plain.holders).length) gained++
      n++
    }
    expect(n).toBeGreaterThan(300)
    expect(gained).toBeGreaterThan(n / 2)
  })

  it('plays a legal game through decide and differs from the plain style somewhere', () => {
    let s = newGame('team-hands-play', us54Config, 0)
    let steps = 0
    let differ = 0
    while (s.phase !== 'finished' && steps < 5000) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const seed = hashSeed(`team-hands-play:${s.moveIndex}`)()
      const t1: BotPolicy = { skill: V10.skill, style: { ...V10.style, teamHands: teamHandsOf(s, seat) } }
      const a = decide(view, t1, seed)
      if (JSON.stringify(a) !== JSON.stringify(decide(view, V10, seed))) differ++
      const r = reduce(s, a)
      expect(r.ok).toBe(true)
      if (!r.ok) break
      s = r.state
      steps++
    }
    expect(s.phase).toBe('finished')
    expect(differ).toBeGreaterThan(0)
  })
})

describe('validateStyle and the registry', () => {
  it('accepts a list of {seat, hand} and refuses anything else', () => {
    expect(validateStyle({ ...V10.style, teamHands: [{ seat: 2, hand: ['2S', 'XR'] }] })).toEqual([])
    expect(validateStyle({ ...V10.style, teamHands: [] })).toEqual([])
    const bad = (x: unknown): number => validateStyle({ ...V10.style, teamHands: x as TeamHand[] }).length
    expect(bad(true)).toBeGreaterThan(0)
    expect(bad([{ seat: 6, hand: [] }])).toBeGreaterThan(0)
    expect(bad([{ seat: 1, hand: [3] }])).toBeGreaterThan(0)
    expect(bad([null])).toBeGreaterThan(0)
  })

  it('is set by no registry entry', () => {
    for (const [id, spec] of Object.entries(MONET_VERSIONS)) {
      expect((spec as BotPolicy).style.teamHands, id).toBeUndefined()
    }
  })
})
