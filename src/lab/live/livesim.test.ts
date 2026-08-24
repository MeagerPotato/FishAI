/**
 * livesim.test.ts — the maths of `/lab/live`, tested where a worker cannot be.
 *
 * The suite runs in Node with no jsdom and no worker harness (SITE_SPEC.md §4.4), which is why
 * `sim.worker.ts` is thin plumbing and everything below targets the pure module. The
 * load-bearing test is the first one: the demo must measure EXACTLY what the lab measures, so
 * a pure-team live pair is pinned byte-for-byte against `runTask` over the same seeds.
 */
import { describe, expect, it } from 'vitest'
import { runTask } from '../../../lib/lab/index.ts'
import {
  ADAPTIVE_ID,
  LIVE_PAIR_CAP,
  aggregateLive,
  clampPairs,
  isLivePolicyId,
  livePolicyLabel,
  matrixCellAnchor,
  normalisePrefix,
  playLivePair,
} from './livesim.ts'
import type { LiveConfig } from './livesim.ts'

const config = (a: LiveConfig['a'], b: LiveConfig['b'], pairs = 2): LiveConfig => ({
  a,
  b,
  pairs,
  seedPrefix: 'live',
})

describe('playLivePair', () => {
  it('reproduces runTask byte-for-byte for a pure-team pairing on the same seeds', () => {
    const live = [0, 1].flatMap((pair) => playLivePair(config('balanced', 'blitz'), pair))
    const lab = runTask({
      index: 0,
      cell: { index: 0, id: 'balanced-vs-blitz', a: 'balanced', b: 'blitz' },
      pairFrom: 0,
      pairTo: 2,
      seedPrefix: 'live',
      variant: 'us54',
      stepCap: 5000,
      invariantCheck: 'every',
    }).records
    expect(live).toEqual(lab)
  })

  it('is deterministic: the same pair twice is identical', () => {
    const first = playLivePair(config('punter', 'turtle'), 3)
    const second = playLivePair(config('punter', 'turtle'), 3)
    expect(second).toEqual(first)
  })

  it('plays the adaptive engine as a real policy, cleanly', () => {
    const [g0, g1] = playLivePair(config(ADAPTIVE_ID, 'punter'), 0)
    for (const g of [g0, g1]) {
      expect(g.finished).toBe(true)
      expect(g.capped).toBe(false)
      expect(g.illegal).toBe(0)
      expect(g.invariantViolations).toBe(0)
      expect(g.clinch).toBe(true)
    }
    // us54 admits no tie, so every game's contribution is a clean win or loss.
    expect([0, 1]).toContain(g0.aResult)
    expect([0, 1]).toContain(g1.aResult)
  })
})

describe('aggregateLive', () => {
  it('folds a short run into a clean cell with the paired estimator', () => {
    const cfg = config('balanced', 'blitz', 4)
    const records = [0, 1, 2, 3].flatMap((pair) => playLivePair(cfg, pair))
    const { cell, pairsDone, partial } = aggregateLive(cfg, records, false)
    expect(partial).toBe(false)
    expect(pairsDone).toBe(4)
    expect(cell.pairs).toBe(4)
    expect(cell.games).toBe(8)
    expect(cell.distinctSeeds).toBe(4)
    expect(cell.health.illegalActions).toBe(0)
    expect(cell.health.invariantViolations).toBe(0)
    expect(cell.health.cappedGames).toBe(0)
    expect(cell.health.ties).toBe(0)
    expect(cell.aScore).toBeGreaterThanOrEqual(0)
    expect(cell.aScore).toBeLessThanOrEqual(1)
    expect(cell.ci95[0]).toBeLessThanOrEqual(cell.aScore)
    expect(cell.ci95[1]).toBeGreaterThanOrEqual(cell.aScore)
    expect(cell.avgMoves).toBeGreaterThan(0)
    // The §4.2 subset the page prints exists on both sides.
    for (const side of [cell.metrics.a, cell.metrics.b]) {
      for (const key of ['askHitRate', 'claimPrecision', 'concedeRate', 'declaresPerGame'] as const) {
        expect(Number.isFinite(side[key])).toBe(true)
      }
    }
  })

  it('scores a mirror pairing at exactly .5 — duplicate deals cancel by construction', () => {
    const cfg = config('balanced', 'balanced', 2)
    const records = [0, 1].flatMap((pair) => playLivePair(cfg, pair))
    const { cell } = aggregateLive(cfg, records, false)
    expect(cell.aScore).toBe(0.5)
    expect(cell.se).toBe(0)
  })

  it('marks a stopped run partial and counts only the finished pairs', () => {
    const cfg = config('balanced', 'blitz', 100)
    const records = [0, 1, 2].flatMap((pair) => playLivePair(cfg, pair))
    const result = aggregateLive(cfg, records, true)
    expect(result.partial).toBe(true)
    expect(result.pairsDone).toBe(3)
    expect(result.cell.pairs).toBe(3)
  })
})

describe('configuration guards', () => {
  it('caps pairs at the stated maximum and floors nonsense', () => {
    expect(clampPairs(LIVE_PAIR_CAP + 1)).toBe(LIVE_PAIR_CAP)
    expect(clampPairs(10_000)).toBe(LIVE_PAIR_CAP)
    expect(clampPairs(0)).toBe(1)
    expect(clampPairs(-5)).toBe(1)
    expect(clampPairs(Number.NaN)).toBe(100)
    expect(clampPairs(25.9)).toBe(25)
  })

  it('normalises the seed prefix without inventing entropy', () => {
    expect(normalisePrefix('  live  ')).toBe('live')
    expect(normalisePrefix('')).toBe('live')
    expect(normalisePrefix('x'.repeat(100))).toHaveLength(64)
  })

  it('recognises the ten policy ids and labels the adaptive one honestly', () => {
    expect(isLivePolicyId('balanced')).toBe(true)
    expect(isLivePolicyId(ADAPTIVE_ID)).toBe(true)
    expect(isLivePolicyId('gpt')).toBe(false)
    expect(livePolicyLabel(ADAPTIVE_ID)).toContain('adaptive')
  })
})

describe('matrixCellAnchor', () => {
  it('resolves to the stored orientation regardless of pick order', () => {
    expect(matrixCellAnchor('balanced', 'blitz')).toBe('cell-balanced-blitz')
    expect(matrixCellAnchor('blitz', 'balanced')).toBe('cell-balanced-blitz')
  })

  it('offers no link where no committed cell exists', () => {
    expect(matrixCellAnchor('balanced', 'balanced')).toBeNull()
    expect(matrixCellAnchor(ADAPTIVE_ID, 'punter')).toBeNull()
  })
})
