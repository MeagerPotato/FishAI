/**
 * search.test.ts — MONET.md §3.8a: the determinization sampler and the search arm.
 *
 * Pinned: (1) every sampled deal is consistent with the viewer's knowledge — the own hand and
 * every located card where they are, every other card at one of its candidates, the counts met
 * exactly, every licence constraint satisfied — and the true deal is always such a deal (the
 * sampler never rules it out); (2) `det: 0` or `cand < 2` is the fast policy's decision exactly,
 * and so is every window decision at any setting; (3) on real positions the arm's action is legal,
 * it searches, and where it leaves the pick the played candidate's paired advantage clears its
 * guard; (4) a guard no candidate can clear (a huge z) always plays the pick, and the unguarded
 * control plays the best mean whenever it is positive; (5) determinism: the same inputs give the
 * same action and the same numbers. Whether search is *worth* its cost is the fit's question and
 * belongs in MONET.md.
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { Card, Seat, SeatView } from '../../lib/engine/index.ts'
import { legalAsksFromView } from '../../lib/engine/helpers.ts'
import { mulberry32 } from '../../lib/engine/rng.ts'
import { buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import type { BotPolicy } from '../../lib/engine/bots/style.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { SEARCH_DEFAULTS, decideSearch, sampleDeal } from '../../lib/engine/search/index.ts'
import type { SearchParams } from '../../lib/engine/search/index.ts'
import { canonicalAction } from './action-digest.ts'

const BASE = monetPolicy('v0.4c') as BotPolicy
const OPTS = { logWindow: BASE.skill.logWindow, useConstraints: BASE.skill.useConstraints, marginal: BASE.style.pModel === 'marginal' }
const SMALL: SearchParams = { det: 4, cand: 3, steps: 12, z: 1, guard: 'lcb', leafLock: 0, leafCard: 0 }

type State = ReturnType<typeof newGame>
interface Pos {
  state: State
  view: SeatView
}

function positions(seed: string, every = 5): Pos[] {
  const out: Pos[] = []
  let s = newGame(seed, us54Config, 0)
  let steps = 0
  while (s.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    if (steps % every === 0) out.push({ state: s, view })
    const r = reduce(s, decide(view, BASE, hashSeed(`${seed}:${s.moveIndex}`)()))
    if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
    s = r.state
    steps++
  }
  return out
}

describe('the determinization sampler', () => {
  it('draws deals consistent with the knowledge, and the true deal is one of them', () => {
    let draws = 0
    let nulls = 0
    for (const seed of ['det-a', 'det-b']) {
      for (const { state, view } of positions(seed, 6)) {
        const k = buildKnowledge(view, OPTS)
        const rng = mulberry32(hashSeed(`${seed}:${view.moveIndex}`)())
        for (let n = 0; n < 3; n++) {
          const hands = sampleDeal(view, k, rng)
          if (hands === null) {
            nulls++
            continue
          }
          draws++
          expect(hands).toHaveLength(6)
          for (let s = 0; s < 6; s++) expect(hands[s]).toHaveLength(view.counts[s])
          expect([...hands[view.seat]].sort()).toEqual([...view.hand].sort())
          const seen = new Set<Card>()
          for (let s = 0; s < 6; s++) {
            for (const c of hands[s]) {
              expect(seen.has(c)).toBe(false)
              seen.add(c)
              const cands = k.cands[c]
              expect(cands).toBeDefined()
              expect(cands).toContain(s)
              const h = k.holders[c]
              if (h !== undefined) expect(h).toBe(s)
            }
          }
          for (const c of k.constraints) expect(c.cards.some((x) => hands[c.seat].includes(x))).toBe(true)
        }
        // the true deal passes every test the sampler applies
        for (let s = 0; s < 6; s++) {
          for (const c of state.hands[s]) {
            const cands = k.cands[c] ?? []
            expect(cands).toContain(s as Seat)
          }
        }
        for (const c of k.constraints) expect(c.cards.some((x) => state.hands[c.seat].includes(x))).toBe(true)
      }
    }
    expect(draws).toBeGreaterThan(50)
    expect(nulls).toBeLessThan(draws / 10)
  })
})

describe('the search arm', () => {
  it('det 0, cand 1 and every window decision are the fast policy exactly', () => {
    let windows = 0
    for (const { view } of positions('search-id-a', 3)) {
      const seed = hashSeed(`id:${view.moveIndex}`)()
      const base = canonicalAction(decide(view, BASE, seed))
      expect(canonicalAction(decideSearch(view, BASE, seed, { ...SMALL, det: 0 }).action)).toBe(base)
      expect(canonicalAction(decideSearch(view, BASE, seed, { ...SMALL, cand: 1 }).action)).toBe(base)
      if (view.declareWindow) {
        windows++
        const d = decideSearch(view, BASE, seed, SMALL)
        expect(canonicalAction(d.action)).toBe(base)
        expect(d.info.searched).toBe(false)
      }
    }
    expect(windows).toBeGreaterThan(10)
  })

  it('searches real ask positions, plays legal asks, and leaves the pick only for a candidate that clears the guard', () => {
    let searched = 0
    let left = 0
    for (const seed of ['search-live-a', 'search-live-b']) {
      for (const { view } of positions(seed, 9)) {
        if (view.declareWindow || view.phase !== 'playing') continue
        const s = hashSeed(`live:${view.moveIndex}`)()
        const pick = decide(view, BASE, s)
        if (pick.type !== 'ask') continue
        const d = decideSearch(view, BASE, s, SMALL)
        const played = d.action
        expect(played.type).toBe('ask')
        if (played.type === 'ask') {
          expect(legalAsksFromView(view).some((a) => a.target === played.target && a.card === played.card)).toBe(true)
        }
        if (d.info.searched) {
          searched++
          expect(d.info.deals).toBeGreaterThan(0)
          expect(d.info.means[0]).toBe(0)
          if (d.info.played === 'candidate') {
            left++
            expect(canonicalAction(d.action)).not.toBe(canonicalAction(pick))
            expect(d.info.advantage - SMALL.z * d.info.se).toBeGreaterThan(0)
          } else {
            expect(canonicalAction(d.action)).toBe(canonicalAction(pick))
          }
        }
      }
    }
    expect(searched).toBeGreaterThan(10)
    expect(left).toBeGreaterThan(0)
  })

  it('a guard nobody clears plays the pick; the unguarded control plays any positive mean; the search is deterministic', () => {
    let positive = 0
    for (const { view } of [...positions('search-guard-a', 3), ...positions('search-guard-b', 3), ...positions('search-guard-c', 3)]) {
      if (view.declareWindow || view.phase !== 'playing') continue
      const s = hashSeed(`guard:${view.moveIndex}`)()
      const pick = decide(view, BASE, s)
      if (pick.type !== 'ask') continue
      const strict = decideSearch(view, BASE, s, { ...SMALL, z: 1e9 })
      expect(canonicalAction(strict.action)).toBe(canonicalAction(pick))
      const control = decideSearch(view, BASE, s, { ...SMALL, guard: 'none' })
      if (control.info.searched) {
        const bestMean = Math.max(...control.info.means)
        if (bestMean > 0) {
          positive++
          expect(control.info.played).toBe('candidate')
        } else {
          expect(control.info.played).toBe('pick')
        }
      }
      const again = decideSearch(view, BASE, s, SMALL)
      const once = decideSearch(view, BASE, s, SMALL)
      expect(canonicalAction(again.action)).toBe(canonicalAction(once.action))
      expect(again.info.means).toEqual(once.info.means)
    }
    expect(positive).toBeGreaterThan(0)
    expect(SEARCH_DEFAULTS.guard).toBe('lcb')
  })
})
