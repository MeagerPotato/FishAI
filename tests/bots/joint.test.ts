/**
 * joint.test.ts — MONET.md §3.4b: `pAssignment`, the chain over the marginal.
 *
 * What is pinned here, in the order the roadmap cares about:
 *   1. on a hand-built instance the chain finds the placement counting forces, and prices it
 *      the way exhaustive enumeration prices it;
 *   2. against brute force over random small instances the chain's probability tracks the exact
 *      probability of its own placement, and the placement is usually the most likely one — the
 *      gap is measured and its size pinned, as `marginal.test.ts` pins Sinkhorn's;
 *   3. the knob is inert without the table (no `pModel: 'marginal'`, no chain), and with it the
 *      plan keeps its shape: six keys, every seat on the team, p inside [0, 1];
 *   4. `decideExplained.action ≡ decide` for v0.4b on real positions — the chain is a pure,
 *      rng-free function of the `Knowledge` and the set;
 *   5. `validateStyle` closes both knobs to their two spellings.
 *
 * None of this is the measurement. MONET.md §3.4b's cells are.
 */
import { describe, expect, it } from 'vitest'
import { decide, decideExplained, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { Card, PolicySpec, Seat } from '../../lib/engine/index.ts'
import type { Knowledge } from '../../lib/engine/bots/types.ts'
import { allBooks } from '../../lib/engine/cards.ts'
import { computeMarginalTable } from '../../lib/engine/bots/marginal.ts'
import { assignJointly } from '../../lib/engine/bots/joint.ts'
import { planClaimFor } from '../../lib/engine/bots/decide.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { SKILL_PRESETS, validateStyle } from '../../lib/engine/bots/style.ts'
import { canonicalAction } from './action-digest.ts'

/* --------------------------------------------------------------- helpers --- */

/** A hand-built Knowledge; only `cands`, `unknownSlots` and `constraints` are read. */
function synth(
  cands: Record<string, Seat[]>,
  unknownSlots: number[],
  constraints: { seat: Seat; cards: Card[] }[] = [],
): Knowledge {
  const c: Partial<Record<Card, Seat[]>> = {}
  for (const [card, seats] of Object.entries(cands)) c[card as Card] = [...seats]
  return { seat: 0, counts: [9, 9, 9, 9, 9, 9], holders: {}, cands: c, gone: [], unknownSlots, constraints }
}

/**
 * Brute force over every full assignment honouring cands, exact slots and the constraints:
 * the exact probability that the given open cards sit where `placement` says, and the most
 * likely placement of those cards among `mates` (ties resolved to the first found in canonical
 * enumeration order, which is what the equality below tolerates by comparing counts).
 */
function bruteJoint(
  k: Knowledge,
  open: readonly Card[],
  placement: Readonly<Record<Card, Seat>>,
  mates: readonly Seat[],
): { p: number; best: Record<Card, Seat>; bestCount: number; placementCount: number; total: number } {
  const cards = (Object.keys(k.cands) as Card[]).filter((c) => (k.cands[c]?.length ?? 0) > 1)
  const openIdx = open.map((c) => cards.indexOf(c))
  const counts = new Map<string, number>()
  let total = 0
  const slots = [...k.unknownSlots]
  const assign: Seat[] = []
  const rec = (i: number): void => {
    if (i === cards.length) {
      if (slots.some((x) => x !== 0)) return
      for (const kc of k.constraints) {
        if (!kc.cards.some((c) => assign[cards.indexOf(c)] === kc.seat)) return
      }
      total++
      if (openIdx.every((j) => mates.includes(assign[j]))) {
        const key = openIdx.map((j) => assign[j]).join(',')
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      return
    }
    for (const s of k.cands[cards[i]] ?? []) {
      if (slots[s] <= 0) continue
      slots[s]--
      assign[i] = s
      rec(i + 1)
      slots[s]++
    }
  }
  rec(0)
  let bestKey = ''
  let bestCount = -1
  for (const [key, n] of counts) {
    if (n > bestCount) {
      bestCount = n
      bestKey = key
    }
  }
  const best = {} as Record<Card, Seat>
  if (bestKey !== '') bestKey.split(',').forEach((s, j) => (best[open[j]] = Number(s) as Seat))
  const placementKey = open.map((c) => placement[c]).join(',')
  const placementCount = counts.get(placementKey) ?? 0
  return { p: total > 0 ? placementCount / total : 0, best, bestCount: Math.max(0, bestCount), placementCount, total }
}

/* ----------------------------------------------------------------- tests --- */

describe('a placement counting forces is found and priced exactly', () => {
  it('two open cards between two teammates with one free slot each, a third card that must fill the opponent slot', () => {
    // Seat 0 views; mates 2 and 4 hold one unknown card each; seat 1 (an opponent) holds one.
    // 4C can sit at 1 or 2, but 2C and 3C can only sit at 2 or 4 — so 4C must be at 1, and the
    // open pair is split across 2 and 4 one way or the other: p = 1/2 exactly for either.
    const k = synth({ '2C': [2, 4], '3C': [2, 4], '4C': [1, 2] }, [0, 1, 1, 0, 1, 0])
    const table = computeMarginalTable(k)
    expect(table).not.toBeNull()
    const out = assignJointly(k, table!, ['2C', '3C'], [0, 2, 4])
    expect(Object.keys(out.assignments).sort()).toEqual(['2C', '3C'])
    expect(new Set([out.assignments['2C'], out.assignments['3C']])).toEqual(new Set([2, 4]))
    expect(out.p).toBeGreaterThan(0.48)
    expect(out.p).toBeLessThan(0.52)
    // The second step is the forced one: with the first card fixed, the other seat is all that is
    // left, and the chain says so at (numerically) 1.
    expect(out.steps.length).toBe(2)
    expect(out.steps[1].p).toBeGreaterThan(0.99)
    const brute = bruteJoint(k, ['2C', '3C'], out.assignments, [0, 2, 4])
    expect(brute.total).toBe(2)
    expect(brute.p).toBe(0.5)
  })

  it('an independent product could not see the coupling; the chain does', () => {
    // Mates 2 and 4 have two free slots between them for two open cards (2C, 3C) and one more
    // card (4C) that must be at 2. Independent per-card reasoning gives 2C and 3C each some share
    // of seat 2; the joint knows 4C fills it, so both open cards are at 4 — impossible with one
    // slot there — unless the slots are read together. Seat 4 has two free slots here.
    const k = synth({ '2C': [2, 4], '3C': [2, 4], '4C': [2, 3] }, [0, 0, 1, 0, 2, 0])
    // Seat 3 has no free slot, so 4C is forced to 2 and the open pair is forced to 4 and 4.
    const table = computeMarginalTable(k)
    expect(table).not.toBeNull()
    const out = assignJointly(k, table!, ['2C', '3C'], [0, 2, 4])
    expect(out.assignments['2C']).toBe(4)
    expect(out.assignments['3C']).toBe(4)
    expect(out.p).toBeGreaterThan(0.95)
    const brute = bruteJoint(k, ['2C', '3C'], out.assignments, [0, 2, 4])
    expect(brute.total).toBe(1)
    expect(brute.p).toBe(1)
  })

  it('an open card with no room on the team is an impossible claim, priced at 0 and still legally named', () => {
    const k = synth({ '2C': [1, 3], '3C': [2, 4] }, [0, 1, 0, 0, 1, 0])
    const table = computeMarginalTable(k)
    expect(table).not.toBeNull()
    const out = assignJointly(k, table!, ['2C', '3C'], [0, 2, 4])
    expect(out.p).toBe(0)
    expect([0, 2, 4]).toContain(out.assignments['2C'])
    expect([0, 2, 4]).toContain(out.assignments['3C'])
  })
})

describe('against brute force, the chain tracks the exact joint and its gap is measured', () => {
  it('over random small instances: the probability of its own placement, and how often that placement is the most likely one', () => {
    const int32 = hashSeed('joint-brute-2026-09-03')
    const rng = (): number => (int32() >>> 0) / 2 ** 32
    const pick = (n: number): number => Math.floor(rng() * n)
    const deck: Card[] = ['2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', 'TC']
    const mates: Seat[] = [0, 2, 4]
    let trials = 0
    let worst = 0
    let sumGap = 0
    let argmaxAgree = 0
    let withOpen = 0
    for (let t = 0; t < 300; t++) {
      const n = 4 + pick(4)
      const cands: Record<string, Seat[]> = {}
      const slots = [0, 0, 0, 0, 0, 0]
      // Seat 0 never holds an unknown card (own hand is known); every other seat may.
      for (let i = 0; i < n; i++) {
        const seats = new Set<Seat>()
        const m = 2 + pick(3)
        while (seats.size < m) seats.add((1 + pick(5)) as Seat)
        cands[deck[i]] = [...seats].sort((a, b) => a - b)
      }
      for (let i = 0; i < n; i++) {
        const c = cands[deck[i]]
        slots[c[pick(c.length)]]++
      }
      const constraints: { seat: Seat; cards: Card[] }[] = []
      if (rng() < 0.4) {
        const seat = (1 + pick(5)) as Seat
        const cs = deck.slice(0, n).filter((c) => cands[c].includes(seat))
        if (cs.length >= 2) constraints.push({ seat, cards: cs.slice(0, 2) })
      }
      const k = synth(cands, slots, constraints)
      const table = computeMarginalTable(k)
      if (table === null) continue
      // Open cards: two or three that a teammate could hold.
      const eligible = deck.slice(0, n).filter((c) => cands[c].some((s) => mates.includes(s)))
      if (eligible.length < 2) continue
      const open = eligible.slice(0, 2 + pick(Math.min(2, eligible.length - 1)))
      const out = assignJointly(k, table, open, mates)
      const brute = bruteJoint(k, open, out.assignments, mates)
      if (brute.total === 0) continue
      trials++
      if (out.p === 0 && brute.bestCount === 0) {
        argmaxAgree++
        continue
      }
      withOpen++
      const gap = Math.abs(out.p - brute.p)
      sumGap += gap
      if (gap > worst) worst = gap
      if (brute.placementCount === brute.bestCount) argmaxAgree++
    }
    expect(trials).toBeGreaterThan(150)
    const mean = sumGap / Math.max(1, withOpen)
    const agree = argmaxAgree / trials
    // The measurement the bars below were written from, printed so a re-run can be compared.
    console.log(`joint vs brute force: worst gap ${worst.toFixed(4)}, mean ${mean.toFixed(4)} over ${withOpen} priced placements; most-likely placement found ${argmaxAgree}/${trials}`)
    // Bars written from the measured distribution on the day — worst gap 0.1721, mean 0.0164 over
    // 128 priced placements, the most likely placement found in 265 of 266 draws — with room: a
    // change that doubles the mean gap or costs ten points of agreement is a different planner
    // and should fail here.
    expect(worst, `worst gap ${worst.toFixed(4)} over ${withOpen} priced placements`).toBeLessThan(0.35)
    expect(mean, `mean gap ${mean.toFixed(4)} over ${withOpen} priced placements`).toBeLessThan(0.04)
    expect(agree, `most-likely placement found ${argmaxAgree}/${trials}`).toBeGreaterThan(0.9)
  })
})

describe('the knob is inert without the table, and with it the plan keeps its shape', () => {
  const punter: PolicySpec = STYLE_ROSTER.punter
  const jointNoTable: PolicySpec = { skill: SKILL_PRESETS.hard, style: { ...STYLE_ROSTER.punter, pAssignment: 'joint' } }
  const jointWithTable: PolicySpec = { skill: SKILL_PRESETS.hard, style: { ...STYLE_ROSTER.punter, pModel: 'marginal', pAssignment: 'joint' } }

  it('without pModel the joint planner is the greedy planner, plan for plan, on real positions', () => {
    let plans = 0
    for (const seed of ['inert-a', 'inert-b']) {
      let s = newGame(seed, us54Config, 0)
      let steps = 0
      while (s.phase !== 'finished' && steps++ < 5000) {
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        for (const b of allBooks(view.config)) {
          if (view.books[b]) continue
          expect(planClaimFor(view, jointNoTable, b)).toEqual(planClaimFor(view, punter, b))
          plans++
        }
        const r = reduce(s, decide(view, punter, hashSeed(`${seed}:${s.moveIndex}`)()))
        if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
        s = r.state
      }
    }
    expect(plans).toBeGreaterThan(2_000)
  })

  it('with the table the plan is legal and priced inside [0, 1], and it differs from greedy somewhere', () => {
    let plans = 0
    let differ = 0
    for (const seed of ['shape-a', 'shape-b']) {
      let s = newGame(seed, us54Config, 0)
      let steps = 0
      while (s.phase !== 'finished' && steps++ < 5000) {
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        const team = seat % 2
        for (const b of allBooks(view.config)) {
          if (view.books[b]) continue
          const plan = planClaimFor(view, jointWithTable, b)
          const greedy = planClaimFor(view, punter, b)
          plans++
          expect(Object.keys(plan.assignments).length).toBe(6)
          for (const c of Object.keys(plan.assignments) as Card[]) expect(plan.assignments[c] % 2).toBe(team)
          expect(plan.p).toBeGreaterThanOrEqual(0)
          expect(plan.p).toBeLessThanOrEqual(1)
          expect(plan.uncertain).toEqual(greedy.uncertain)
          // Certain plans are certain in both: the chain never touches a card with one candidate.
          if (greedy.uncertain.length === 0) expect(plan).toEqual(greedy)
          if (plan.p !== greedy.p) differ++
        }
        const r = reduce(s, decide(view, jointWithTable, hashSeed(`${seed}:${s.moveIndex}`)()))
        if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
        s = r.state
      }
    }
    expect(plans).toBeGreaterThan(2_000)
    expect(differ).toBeGreaterThan(0)
  })

  it('is deterministic: the same position planned twice is the same plan', () => {
    let s = newGame('determinism', us54Config, 0)
    for (let i = 0; i < 40; i++) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      for (const b of allBooks(view.config)) {
        if (view.books[b]) continue
        expect(planClaimFor(view, jointWithTable, b)).toEqual(planClaimFor(view, jointWithTable, b))
      }
      const r = reduce(s, decide(view, jointWithTable, hashSeed(`determinism:${s.moveIndex}`)()))
      if (!r.ok) throw new Error(r.error.code)
      s = r.state
    }
  })
})

describe('v0.4b: decideExplained.action ≡ decide at every decision of real games', () => {
  it('three v0.4b-driven mirror games, the explained action bit-identical to the played one', () => {
    const v04b = monetPolicy('v0.4b')
    let decisions = 0
    for (const seed of ['explain-a', 'explain-b', 'explain-c']) {
      let s = newGame(seed, us54Config, 0)
      let steps = 0
      while (s.phase !== 'finished' && steps++ < 5000) {
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        const moveSeed = hashSeed(`${seed}:${s.moveIndex}`)()
        const played = decide(view, v04b, moveSeed)
        const explained = decideExplained(view, v04b, moveSeed)
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

describe('validateStyle closes both knobs', () => {
  it('accepts the two spellings of each and refuses anything else', () => {
    const base = STYLE_ROSTER.punter
    expect(validateStyle({ ...base, pAssignment: 'greedy' })).toEqual([])
    expect(validateStyle({ ...base, pAssignment: 'joint' })).toEqual([])
    expect(validateStyle({ ...base, claimOwnership: 'certain' })).toEqual([])
    expect(validateStyle({ ...base, claimOwnership: 'priced' })).toEqual([])
    expect(validateStyle({ ...base, pAssignment: 'exact' as 'joint' })).toEqual([expect.stringContaining('pAssignment')])
    expect(validateStyle({ ...base, claimOwnership: 'never' as 'priced' })).toEqual([expect.stringContaining('claimOwnership')])
    expect(monetPolicy('v0.4b').style.pAssignment).toBe('joint')
    expect(monetPolicy('v0.4a').style.pAssignment).toBeUndefined()
    for (const id of Object.keys(STYLE_ROSTER) as (keyof typeof STYLE_ROSTER)[]) {
      expect(STYLE_ROSTER[id].pAssignment, id).toBeUndefined()
      expect(STYLE_ROSTER[id].claimOwnership, id).toBeUndefined()
    }
  })
})
