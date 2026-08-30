/**
 * bounded.test.ts — the FishAI v1.5 experiment suite at tiny N (SPEC v1.5 Phase 2).
 *
 * The full run is ~60k games; these tests run the SAME machinery — `planBoundedTasks` →
 * `runBoundedTask` → `assembleBoundedRun` → `buildBoundedResults` — at 1–2 pairs per cell, so
 * every claim the artifact makes structurally is pinned before a single reporting-scale game
 * is played:
 *
 *  - the run is deterministic (two runs of the same config are byte-identical, digest included);
 *  - the elog round-trips: the retained encoding reproduces the engine's own public log,
 *    event for event, and decodes back field-for-field;
 *  - the E3 estimator counts a HAND-BUILT log correctly — availability, age, exploitation and
 *    the hit column are pinned on a position where every number is known by construction;
 *  - the health gate enforces every clause (illegal, capped, invariants, seed identity, and
 *    the suite's own P2 mirror-exactness gate) — checked by doctoring records, not by hoping;
 *  - the aggregation arithmetic (paired shares, adjacent deltas, bits-equivalents, accuracy
 *    scoring) is pinned on hand-built inputs with known answers.
 *
 * The E4b follow-up (SPEC v1.5, registered after the Phase 2 review and before its run) is
 * tested the same way: the single-seat task construction is pinned (exactly one bounded seat,
 * the registered rotating read seat, the budget), the ∞-reproduction and read-seat-mapping
 * health gates are exercised by doctoring, the P8 rule and the ×3 Bonferroni annotation are
 * pinned on hand-built inputs, and `extendBoundedResults` is shown to refuse every doctored
 * base — including an aggregate no verdict reads.
 *
 * The artifact validator's refusals are tested alongside the committed artifact once it
 * exists — see the companion block at the bottom.
 */
import { describe, expect, it } from 'vitest'
import {
  BOUNDED_INF_BITS,
  BOUNDED_P8_PREDICTION,
  BOUNDED_TIERS,
  DEFAULT_BOUNDED_CONFIG,
  SINGLE_READ_MAPPING,
  aggregateEvidence,
  assembleBoundedRun,
  assembleBoundedSingleRun,
  bitsEquivalentOf,
  boundedGamesTotal,
  boundedSingleGamesTotal,
  boundedToJsonl,
  buildBoundedResults,
  computeBoundedSingleVerdict,
  computeBoundedVerdicts,
  decodeElog,
  encodeElog,
  evidenceObservationsFromLog,
  extendBoundedResults,
  ladderAdjacentDeltas,
  ladderCellId,
  mirrorExactness,
  multiplicityFamilyOf,
  normalCdf,
  planBoundedSingleTasks,
  planBoundedTasks,
  runBoundedTask,
  scoreBoundedAccuracy,
  scoreBoundedSingleAccuracy,
  seedFor,
  singleCellId,
  singleReadSeatFor,
  singleSeatPolicies,
  tierCellId,
} from '../../lib/lab/index.ts'
import type {
  AccuracyAdjacentDelta,
  BoundedGameRecord,
  BoundedLabConfig,
  BoundedRunOutput,
  BoundedSingleRunOutput,
  BoundedTaskResult,
  DecodedEvent,
  LadderCell,
} from '../../lib/lab/index.ts'
import {
  ALL_SEATS,
  STYLE_ROSTER,
  decide,
  hashSeed,
  legalActionsSummary,
  newGame,
  reduce,
  seatTeam,
  seatView,
  us54Config,
} from '../../lib/engine/index.ts'
import type { Card, PolicySpec, PublicEvent } from '../../lib/engine/index.ts'
import { ArtifactError } from '../../src/lab/artifact.ts'
import { loadBoundedArtifact, parseBoundedArtifact } from '../../src/lab/bounded-artifact.ts'

const TINY: BoundedLabConfig = {
  ...DEFAULT_BOUNDED_CONFIG,
  ladderBits: [0, 24, BOUNDED_INF_BITS],
  ladderPairs: 2,
  tierPairs: 2,
  accBits: [16, BOUNDED_INF_BITS],
  accGames: 1,
}

function runSuite(config: BoundedLabConfig): BoundedRunOutput {
  const results = planBoundedTasks(config).map((t) => runBoundedTask(t))
  return assembleBoundedRun(config, results, { wallMs: 1, workers: 1, generatedAt: '2026-01-01T00:00:00.000Z' })
}

/** The one tiny run most tests read. Module-level so it is played once, not per test. */
const RUN = runSuite(TINY)

function runSingleSuite(config: BoundedLabConfig): BoundedSingleRunOutput {
  const results = planBoundedSingleTasks(config).map((t) => runBoundedTask(t))
  return assembleBoundedSingleRun(config, results, { wallMs: 1, workers: 1, generatedAt: '2026-01-01T00:00:00.000Z' })
}

/** The tiny E4b run — the SAME config as RUN, so `extendBoundedResults` accepts the pair. */
const SINGLE_RUN = runSingleSuite(TINY)

describe('the plan', () => {
  it('the default config is the pre-registered experiment', () => {
    expect(DEFAULT_BOUNDED_CONFIG.ladderBits).toEqual([0, 8, 16, 24, 32, 48, 64, 96, 128, BOUNDED_INF_BITS])
    expect(DEFAULT_BOUNDED_CONFIG.ladderSeedPrefix).toBe('bounded-v1')
    expect(DEFAULT_BOUNDED_CONFIG.accSeedPrefix).toBe('clsacc-v1')
    expect(DEFAULT_BOUNDED_CONFIG.accBits).toEqual([16, 32, 64, BOUNDED_INF_BITS])
    expect(boundedGamesTotal(DEFAULT_BOUNDED_CONFIG)).toBe(
      10 * DEFAULT_BOUNDED_CONFIG.ladderPairs * 2 + 3 * DEFAULT_BOUNDED_CONFIG.tierPairs * 2 + 4 * 36 * 50,
    )
  })

  it('refuses a malformed ladder: unsorted, non-integer, or missing the ∞ rung', () => {
    expect(() => planBoundedTasks({ ...TINY, ladderBits: [24, 0, BOUNDED_INF_BITS] })).toThrow(/ascend/)
    expect(() => planBoundedTasks({ ...TINY, ladderBits: [0.5, BOUNDED_INF_BITS] })).toThrow(/integer/)
    expect(() => planBoundedTasks({ ...TINY, ladderBits: [0, 24, 128] })).toThrow(/∞ rung/)
  })

  it('refuses tierPairs beyond the ladder seed list — the interpolation must stay per-deal', () => {
    expect(() => planBoundedTasks({ ...TINY, tierPairs: 3 })).toThrow(/HEAD/)
  })
})

describe('the tiny run: health and shape', () => {
  it('passes the full health gate', () => {
    expect(RUN.health.violations).toEqual([])
    expect(RUN.health.ok).toBe(true)
    expect(RUN.health.illegalActions).toBe(0)
    expect(RUN.health.cappedGames).toBe(0)
    expect(RUN.health.invariantViolations).toBe(0)
    expect(RUN.health.ties).toBe(0)
    expect(RUN.health.voids).toBe(0)
    expect(RUN.health.nonClinch).toBe(0)
    expect(RUN.meta.gamesTotal).toBe(boundedGamesTotal(TINY))
  })

  it('ladder: one cell per budget on the shared seed list, both orientations', () => {
    expect(RUN.ladder.map((c) => c.bits)).toEqual([0, 24, BOUNDED_INF_BITS])
    for (const cell of RUN.ladder) {
      expect(cell.pairs).toBe(TINY.ladderPairs)
      expect(cell.games).toBe(TINY.ladderPairs * 2)
      expect(cell.distinctSeeds).toBe(TINY.ladderPairs)
    }
    const recs = RUN.records.filter((r) => r.exp === 'ladder' && r.bits === 24)
    expect(recs.map((r) => r.seed).sort()).toEqual([
      'bounded-v1-000000',
      'bounded-v1-000000',
      'bounded-v1-000001',
      'bounded-v1-000001',
    ])
    for (const r of recs) {
      expect(r.startSeat).toBe(r.pair % 6)
      expect(r.aTeam).toBe(r.orient)
      expect(r.elog).toBeDefined()
      expect(r.aShare).toBe(r.setsA / (r.setsA + r.setsB))
    }
  })

  it('the ∞ cell is an exact integer mirror — P2 as a health property', () => {
    expect(RUN.mirrorExact.pairs).toBe(TINY.ladderPairs)
    expect(RUN.mirrorExact.deviations).toBe(0)
    expect(RUN.mirrorExact.share).toBeCloseTo(0.5, 9)
  })

  it('tiers replay the ladder seed list head and carry a bits-equivalent', () => {
    expect(RUN.tiers.map((t) => t.tier)).toEqual([...BOUNDED_TIERS])
    for (const t of RUN.tiers) {
      expect(t.pairs).toBe(TINY.tierPairs)
      expect(t.bitsEquivalent).toBeDefined()
    }
    for (const r of RUN.records.filter((x) => x.exp === 'tier')) {
      expect(r.seed).toBe(seedFor(TINY.ladderSeedPrefix, r.pair))
      expect(r.elog).toBeDefined()
    }
  })

  it('accuracy records stay lean (no elog) and carry the end-of-game read', () => {
    const recs = RUN.records.filter((r) => r.exp === 'accuracy')
    expect(recs.length).toBe(2 * 36 * TINY.accGames)
    for (const r of recs) {
      expect(r.elog).toBeUndefined()
      expect(r.top?.length).toBe(6)
      expect(r.pairing?.length).toBe(2)
      expect(r.orient).toBe(0)
    }
  })

  it('evidence curves cover every played policy, and band totals reconcile', () => {
    const policies = RUN.evidence.map((c) => c.policy)
    expect(policies).toEqual([
      'bounded-0',
      'bounded-24',
      'bounded-inf',
      'reference',
      'tier-easy',
      'tier-medium',
      'tier-hard',
    ])
    for (const c of RUN.evidence) {
      expect(c.askDecisions).toBeGreaterThan(0)
      const bandTotal = c.rows.reduce((s, r) => s + r.available, 0)
      expect(bandTotal).toBe(c.observations)
      expect(c.decisionsWithCertain).toBeLessThanOrEqual(c.askDecisions)
      for (const row of c.rows) {
        expect(row.exploited).toBeLessThanOrEqual(row.available)
        expect(row.hits).toBeLessThanOrEqual(row.available)
      }
    }
  })
})

describe('determinism', () => {
  it('a re-run of the same config is byte-identical, digest included', { timeout: 120_000 }, () => {
    const small: BoundedLabConfig = { ...TINY, ladderPairs: 1, tierPairs: 1, accGames: 1 }
    const one = runSuite(small)
    const two = runSuite(small)
    expect(two.meta.recordsDigest).toBe(one.meta.recordsDigest)
    expect(JSON.stringify(two)).toBe(JSON.stringify(one))
    expect(boundedToJsonl(two.records)).toBe(boundedToJsonl(one.records))
  })
})

describe('the elog encoding', () => {
  it('reproduces the engine’s own public log event-for-event and decodes back', { timeout: 60_000 }, () => {
    // Replay the exact game the runner played (same policies, same seeding) and compare its
    // final log against the retained encoding — the round trip is pinned on a real game, not
    // on a synthetic event list.
    const rec = RUN.records.find((r) => r.exp === 'ladder' && r.bits === 24 && r.pair === 0 && r.orient === 0)
    expect(rec).toBeDefined()
    if (rec === undefined || rec.elog === undefined) return
    const spec: PolicySpec = { bounded: true, bits: 24, style: 'balanced' }
    const policies = ALL_SEATS.map((seat): PolicySpec => (seatTeam(seat) === 0 ? spec : STYLE_ROSTER.balanced))
    let s = newGame(rec.seed, us54Config, rec.startSeat)
    let steps = 0
    while (s.phase !== 'finished' && steps < 5000) {
      const { seat } = legalActionsSummary(s)
      const r = reduce(s, decide(seatView(s, seat), policies[seat], hashSeed(`${rec.seed}:${s.moveIndex}`)()))
      if (!r.ok) throw new Error(`replay rejected at step ${steps}`)
      s = r.state
      steps++
    }
    expect(encodeElog(s.log, us54Config)).toBe(rec.elog)

    const decoded = decodeElog(rec.elog, us54Config)
    expect(decoded.length).toBe(s.log.length)
    for (let i = 0; i < decoded.length; i++) {
      const d = decoded[i]
      const ev: PublicEvent = s.log[i]
      if (ev.type === 'ask') {
        expect(d).toEqual({ type: 'a', asker: ev.asker, target: ev.target, hit: ev.hit, card: ev.card })
      } else if (ev.type === 'claim') {
        expect(d).toEqual({
          type: 'c',
          claimer: ev.claimer,
          book: ev.book,
          outcome: ev.outcome === 'team0' ? '0' : ev.outcome === 'team1' ? '1' : 'v',
        })
      }
    }
  })

  it('refuses malformed bytes with a named position', () => {
    expect(() => decodeElog('x0', us54Config)).toThrow(/unknown event tag/)
    expect(() => decodeElog('a07+2C', us54Config)).toThrow(/not a seat/)
    expect(() => decodeElog('a01*2C', us54Config)).toThrow(/hit flag/)
    expect(() => decodeElog('c09x', us54Config)).toThrow(/book index/)
  })
})

describe('the E3 estimator on a hand-built log', () => {
  // A position where every availability, age, exploitation and hit is known by construction.
  // Teams: seats 0/2/4 vs 1/3/5. Books: LOW-C holds 2C..7C, HIGH-H holds 9H..AH.
  const hands: Card[][] = [
    ['2C', '3C'], // seat 0
    ['9H', '4C'], // seat 1
    ['TH', 'JH'], // seat 2
    ['5C'], // seat 3
    ['KS'], // seat 4
    ['QD'], // seat 5
  ]
  const events: DecodedEvent[] = [
    { type: 'g', seat: 0 },
    // 1: seat 1 takes 2C from seat 0 — 2C publicly located at seat 1 from here.
    { type: 'a', asker: 1, target: 0, hit: true, card: '2C' },
    // 2: seat 0 takes it straight back — the certain ask (2C at 1, age 1) exists and IS taken.
    { type: 'a', asker: 0, target: 1, hit: true, card: '2C' },
    // 3: seat 3 holds 5C, so the certain ask (2C at 0, age 1) is available — not taken, miss.
    { type: 'a', asker: 3, target: 0, hit: false, card: '6C' },
    // 4: seat 5 holds no LOW-C card, so nothing is available to it — no observation.
    { type: 'a', asker: 5, target: 0, hit: false, card: '9D' },
    // 5: seat 1 holds 4C, so (2C at 0, age 3) is available — it asks TH instead and hits.
    { type: 'a', asker: 1, target: 2, hit: true, card: 'TH' },
    // 6: LOW-C resolves — 2C is retired from the located set and every hand.
    { type: 'c', claimer: 1, book: 'LOW-C', outcome: '1' },
    // 7: seat 2 holds JH, so (TH at 1, age 2) is available — taken, hit.
    { type: 'a', asker: 2, target: 1, hit: true, card: 'TH' },
  ]

  it('pins availability, age, exploitation and the hit column', () => {
    const { observations, asksBySeat } = evidenceObservationsFromLog(hands, events, us54Config)
    expect(asksBySeat).toEqual([1, 2, 1, 1, 0, 1])
    expect(observations).toEqual([
      { event: 2, seat: 0, age: 1, exploited: true, hit: true },
      { event: 3, seat: 3, age: 1, exploited: false, hit: false },
      { event: 5, seat: 1, age: 3, exploited: false, hit: true },
      { event: 7, seat: 2, age: 2, exploited: true, hit: true },
    ])
  })

  it('a claim retires the located card: no availability survives the book', () => {
    // Same log, but the final ask comes AFTER a claim of HIGH-H — nothing is available.
    const withClaim: DecodedEvent[] = [
      ...events.slice(0, 7),
      { type: 'c', claimer: 2, book: 'HIGH-H', outcome: '0' },
      { type: 'a', asker: 2, target: 1, hit: false, card: 'KS' },
    ]
    const { observations } = evidenceObservationsFromLog(hands, withClaim, us54Config)
    expect(observations.filter((o) => o.event > 6)).toEqual([])
  })

  it('a re-located card restarts its age clock', () => {
    // 2C is taken at event 1 and re-taken at event 2; the availability at event 3 ages from
    // event 2 (the CURRENT location), not event 1.
    const { observations } = evidenceObservationsFromLog(hands, events, us54Config)
    const at3 = observations.find((o) => o.event === 3)
    expect(at3?.age).toBe(1)
  })
})

describe('aggregation arithmetic on hand-built inputs', () => {
  function rec(over: Partial<BoundedGameRecord>): BoundedGameRecord {
    return {
      exp: 'ladder',
      cell: ladderCellId(0),
      pair: 0,
      orient: 0,
      seed: 'seed-0',
      startSeat: 0,
      aTeam: 0,
      steps: 100,
      finished: true,
      capped: false,
      illegal: 0,
      invariantViolations: 0,
      setsA: 5,
      setsB: 4,
      unresolved: 0,
      voids: 0,
      aShare: 5 / 9,
      clinch: true,
      tie: false,
      bits: 0,
      ...over,
    }
  }

  it('ladderAdjacentDeltas: per-seed paired deltas with the −2·SE pass rule', () => {
    const mk = (bits: number, pair: number, orient: 0 | 1, aShare: number): BoundedGameRecord =>
      rec({ cell: ladderCellId(bits), bits, pair, orient, seed: `seed-${pair}`, aShare })
    const byBits = new Map<number, BoundedGameRecord[]>([
      // Pair means: 0.3 and 0.5 at 8 bits; 0.4 and 0.7 at 16 bits → deltas +0.1, +0.2.
      [8, [mk(8, 0, 0, 0.2), mk(8, 0, 1, 0.4), mk(8, 1, 0, 0.5), mk(8, 1, 1, 0.5)]],
      [16, [mk(16, 0, 0, 0.4), mk(16, 0, 1, 0.4), mk(16, 1, 0, 0.6), mk(16, 1, 1, 0.8)]],
    ])
    const deltas = ladderAdjacentDeltas([8, 16], byBits)
    expect(deltas.length).toBe(1)
    expect(deltas[0].seeds).toBe(2)
    expect(deltas[0].delta).toBeCloseTo(0.15, 12)
    expect(deltas[0].se).toBeCloseTo(0.05, 12)
    expect(deltas[0].pass).toBe(true)
    // A decisive drop fails: deltas −0.1 and −0.2 against the same SE.
    const byBitsDown = new Map<number, BoundedGameRecord[]>([
      [8, byBits.get(16) ?? []],
      [16, byBits.get(8)?.map((r) => ({ ...r, cell: ladderCellId(16), bits: 16 })) ?? []],
    ])
    const down = ladderAdjacentDeltas([8, 16], byBitsDown)
    expect(down[0].delta).toBeCloseTo(-0.15, 12)
    expect(down[0].pass).toBe(false)
  })

  it('mirrorExactness compares integers, never floats', () => {
    const good = [
      rec({ pair: 0, orient: 0, setsA: 5, setsB: 3, aShare: 5 / 8, steps: 200 }),
      rec({ pair: 0, orient: 1, setsA: 3, setsB: 5, aShare: 3 / 8, steps: 200 }),
    ]
    expect(mirrorExactness(good)).toEqual({ pairs: 1, deviations: 0, share: expect.closeTo(0.5, 12) as number })
    const bad = [
      rec({ pair: 0, orient: 0, setsA: 5, setsB: 3, steps: 200 }),
      rec({ pair: 0, orient: 1, setsA: 5, setsB: 3, steps: 200 }),
    ]
    expect(mirrorExactness(bad).deviations).toBe(1)
    const stepsDiffer = [
      rec({ pair: 0, orient: 0, setsA: 5, setsB: 3, steps: 200 }),
      rec({ pair: 0, orient: 1, setsA: 3, setsB: 5, steps: 201 }),
    ]
    expect(mirrorExactness(stepsDiffer).deviations).toBe(1)
  })

  it('bitsEquivalentOf: first ascending crossing, floor clamp, and the non-finite top', () => {
    const cell = (bits: number, share: number): LadderCell => ({
      id: ladderCellId(bits),
      bits,
      pairs: 10,
      games: 20,
      distinctSeeds: 10,
      share,
      se: 0.01,
      ci95: [share - 0.02, share + 0.02],
      seUnpaired: 0.01,
      avgMoves: 100,
      maxMoves: 200,
      health: {
        illegalActions: 0,
        cappedGames: 0,
        invariantViolations: 0,
        ties: 0,
        voids: 0,
        nonClinch: 0,
        distinctSeeds: 10,
        expectedSeeds: 10,
      },
    })
    const ladder = [cell(0, 0.2), cell(8, 0.3), cell(16, 0.4), cell(BOUNDED_INF_BITS, 0.5)]
    const mid = bitsEquivalentOf(0.35, 0.01, ladder)
    expect(mid.finite).toBe(true)
    expect(mid.bits).toBeCloseTo(12, 9)
    expect(mid.lo).toBeCloseTo(12 - 0.0196 * 80, 6)
    const floor = bitsEquivalentOf(0.1, 0.01, ladder)
    expect(floor.finite).toBe(true)
    expect(floor.bits).toBe(0)
    expect(floor.note).toMatch(/floor/)
    const top = bitsEquivalentOf(0.45, 0.01, ladder)
    expect(top.finite).toBe(false)
    expect(top.bits).toBeNull()
    expect(top.note).toMatch(/above every finite rung/)
  })

  it('scoreBoundedAccuracy: per-style tallies and per-seed paired deltas', () => {
    const acc = (bits: number, game: number, top: readonly string[]): BoundedGameRecord =>
      rec({
        exp: 'accuracy',
        cell: `bacc-${bits}-balanced-vs-blitz`,
        bits,
        pair: game,
        seed: `acc-${game}`,
        pairing: ['balanced', 'blitz'],
        top: top as BoundedGameRecord['top'],
      })
    // Truth by seating: 0/2/4 balanced, 1/3/5 blitz.
    const records = [
      acc(16, 0, ['balanced', 'blitz', 'punter', 'punter', 'punter', 'punter']), // 2/6
      acc(64, 0, ['balanced', 'blitz', 'balanced', 'blitz', 'punter', 'punter']), // 4/6
    ]
    const scored = scoreBoundedAccuracy(records, [16, 64])
    expect(scored.cells.length).toBe(2)
    expect(scored.cells[0].top1).toBeCloseTo(2 / 6, 12)
    expect(scored.cells[1].top1).toBeCloseTo(4 / 6, 12)
    expect(scored.cells[0].byStyle.balanced).toEqual({ seats: 3, top1: expect.closeTo(1 / 3, 12) as number })
    expect(scored.cells[0].byStyle.blitz).toEqual({ seats: 3, top1: expect.closeTo(1 / 3, 12) as number })
    expect(scored.cells[0].byStyle.ghost).toEqual({ seats: 0, top1: 0 })
    expect(scored.deltas.length).toBe(1)
    expect(scored.deltas[0].seeds).toBe(1)
    expect(scored.deltas[0].delta).toBeCloseTo(2 / 6, 12)
    expect(scored.deltas[0].pass).toBe(true)
  })
})

describe('the health gate, enforced', () => {
  function doctored(mutate: (records: BoundedGameRecord[]) => void): BoundedRunOutput {
    const results: BoundedTaskResult[] = planBoundedTasks(TINY).map((t) => runBoundedTask(t))
    const clone = JSON.parse(JSON.stringify(results)) as BoundedTaskResult[]
    for (const r of clone) mutate(r.records)
    return assembleBoundedRun(TINY, clone, { wallMs: 1, workers: 1, generatedAt: 'x' })
  }

  it('an illegal action, a capped game and an invariant finding each VOID the run, named', { timeout: 120_000 }, () => {
    const bad = doctored((records) => {
      if (records.length === 0 || records[0].exp !== 'ladder' || records[0].cell !== ladderCellId(0)) return
      records[0].illegal = 1
      records[1].capped = true
      records[1].clinch = false
      records[2].invariantViolations = 2
    })
    expect(bad.health.ok).toBe(false)
    expect(bad.health.violations.join('\n')).toMatch(/illegalActions 1/)
    expect(bad.health.violations.join('\n')).toMatch(/cappedGames 1/)
    expect(bad.health.violations.join('\n')).toMatch(/invariantViolations 2/)
    expect(bad.health.violations.join('\n')).toMatch(/nonClinch/)
    expect(bad.health.capped.length).toBe(1)
  })

  it('a repeated seed is not extra data: distinctSeeds is gated per cell', { timeout: 120_000 }, () => {
    const bad = doctored((records) => {
      for (const r of records) {
        if (r.exp === 'ladder' && r.cell === ladderCellId(24) && r.pair === 1) r.seed = seedFor(TINY.ladderSeedPrefix, 0)
      }
    })
    expect(bad.health.ok).toBe(false)
    expect(bad.health.violations.join('\n')).toMatch(/distinctSeeds 1 != pairs 2/)
  })

  it('a tier cell that strays off the ladder seed list is refused', { timeout: 120_000 }, () => {
    const bad = doctored((records) => {
      for (const r of records) {
        if (r.exp === 'tier' && r.cell === tierCellId('easy') && r.pair === 0) r.seed = 'other-list-000000'
      }
    })
    expect(bad.health.ok).toBe(false)
    expect(bad.health.violations.join('\n')).toMatch(/not the ladder list/)
  })

  it('a broken ∞ mirror is a harness bug and VOIDS the run — the P2 gate', { timeout: 120_000 }, () => {
    const bad = doctored((records) => {
      for (const r of records) {
        if (r.exp === 'ladder' && r.cell === ladderCellId(BOUNDED_INF_BITS) && r.pair === 0 && r.orient === 1) {
          r.setsA = r.setsA + 1
        }
      }
    })
    expect(bad.health.ok).toBe(false)
    expect(bad.health.violations.join('\n')).toMatch(/P2: 1 of 2 ∞-budget pairs/)
  })
})

describe('E4b: the single-seat plan and table', () => {
  it('plans only accuracySingle tasks over the E4 grid, and refuses a gridless ladder', () => {
    const tasks = planBoundedSingleTasks(TINY)
    expect(tasks.length).toBeGreaterThan(0)
    for (const t of tasks) expect(t.kind).toBe('accuracySingle')
    expect(boundedSingleGamesTotal(TINY)).toBe(2 * 36 * TINY.accGames)
    expect(boundedSingleGamesTotal(DEFAULT_BOUNDED_CONFIG)).toBe(4 * 36 * 50)
    expect(() => planBoundedSingleTasks({ ...TINY, accBits: [16, 64] })).toThrow(/∞ rung/)
  })

  it('the registered mapping rotates the three team-0 seats', () => {
    expect([0, 1, 2, 3, 4, 5].map(singleReadSeatFor)).toEqual([0, 2, 4, 0, 2, 4])
    for (let game = 0; game < 12; game++) expect(seatTeam(singleReadSeatFor(game))).toBe(0)
  })

  it('singleSeatPolicies: exactly ONE bounded seat, at the read seat, at the budget', () => {
    const policies = singleSeatPolicies(32, 'balanced', 'blitz', 2)
    const bounded = policies.filter((p) => typeof p === 'object' && p !== null && Object.hasOwn(p, 'bounded'))
    expect(bounded.length).toBe(1)
    expect(policies[2]).toEqual({ bounded: true, bits: 32, style: 'balanced' })
    // Every other seat is the bare full-strength roster style, seated exactly as the v1.0
    // accuracy harness seats it — team 0 the first style, team 1 the second.
    expect(policies[0]).toBe(STYLE_ROSTER.balanced)
    expect(policies[4]).toBe(STYLE_ROSTER.balanced)
    for (const seat of [1, 3, 5] as const) expect(policies[seat]).toBe(STYLE_ROSTER.blitz)
    expect(() => singleSeatPolicies(32, 'balanced', 'blitz', 1)).toThrow(/team-0/)
  })

  it('a single task carries the mapping through six consecutive games', () => {
    const result = runBoundedTask({
      kind: 'accuracySingle',
      index: 0,
      config: { ...TINY, accGames: 6 },
      bits: 16,
      a: 'balanced',
      b: 'blitz',
      gameFrom: 0,
      gameTo: 6,
    })
    expect(result.records.length).toBe(6)
    for (const [i, r] of result.records.entries()) {
      expect(r.exp).toBe('accuracySingle')
      expect(r.cell).toBe(singleCellId(16, 'balanced', 'blitz'))
      expect(r.pair).toBe(i)
      expect(r.orient).toBe(0)
      expect(r.aTeam).toBe(0)
      expect(r.readSeat).toBe(singleReadSeatFor(i))
      expect(r.startSeat).toBe(i % 6)
      expect(r.seed).toBe(seedFor(TINY.accSeedPrefix, i))
      expect(r.pairing).toEqual(['balanced', 'blitz'])
      expect(r.top?.length).toBe(6)
      expect(r.elog).toBeUndefined()
      expect(r.infExact).toBeUndefined()
      expect(r.bits).toBe(16)
    }
  })
})

describe('E4b: the tiny run', () => {
  it('passes the full health gate, mapping and ∞ reproduction included', () => {
    expect(SINGLE_RUN.health.violations).toEqual([])
    expect(SINGLE_RUN.health.ok).toBe(true)
    expect(SINGLE_RUN.meta.gamesTotal).toBe(boundedSingleGamesTotal(TINY))
    expect(SINGLE_RUN.meta.notes[0]).toBe(SINGLE_READ_MAPPING)
  })

  it('every record reads the registered seat on the v1.0 seed list', () => {
    for (const r of SINGLE_RUN.records) {
      expect(r.exp).toBe('accuracySingle')
      expect(r.readSeat).toBe(singleReadSeatFor(r.pair))
      expect(r.seed).toBe(seedFor(TINY.accSeedPrefix, r.pair))
      expect(r.top?.length).toBe(6)
      expect(r.elog).toBeUndefined()
    }
  })

  it('the ∞ cell reproduced the all-bare full-strength game exactly, every game', () => {
    const inf = SINGLE_RUN.records.filter((r) => (r.bits ?? 0) >= BOUNDED_INF_BITS)
    expect(inf.length).toBe(36 * TINY.accGames)
    for (const r of inf) expect(r.infExact).toBe(true)
    for (const r of SINGLE_RUN.records) {
      if ((r.bits ?? 0) < BOUNDED_INF_BITS) expect(r.infExact).toBeUndefined()
    }
    expect(SINGLE_RUN.infReproduction).toEqual({ games: 36 * TINY.accGames, deviations: 0 })
  })

  it('a broken ∞ reproduction VOIDS the run — the P8 health gate', () => {
    const results = planBoundedSingleTasks(TINY).map((t) => runBoundedTask(t))
    const clone = JSON.parse(JSON.stringify(results)) as BoundedTaskResult[]
    let doctored = false
    for (const tr of clone) {
      for (const r of tr.records) {
        if (!doctored && (r.bits ?? 0) >= BOUNDED_INF_BITS) {
          r.infExact = false
          doctored = true
        }
      }
    }
    expect(doctored).toBe(true)
    const bad = assembleBoundedSingleRun(TINY, clone, { wallMs: 1, workers: 1, generatedAt: 'x' })
    expect(bad.health.ok).toBe(false)
    expect(bad.health.violations.join('\n')).toMatch(/P8 ∞ health: 1 of 36/)
  })

  it('a record straying from the registered read-seat mapping is refused', () => {
    const results = planBoundedSingleTasks(TINY).map((t) => runBoundedTask(t))
    const clone = JSON.parse(JSON.stringify(results)) as BoundedTaskResult[]
    // Game 0's registered seat is 0; move the read to seat 4 on one record.
    clone[0].records[0].readSeat = 4
    const bad = assembleBoundedSingleRun(TINY, clone, { wallMs: 1, workers: 1, generatedAt: 'x' })
    expect(bad.health.ok).toBe(false)
    expect(bad.health.violations.join('\n')).toMatch(/readSeat mapping: 1 record/)
  })

  it('a re-run of one task is byte-identical (records; wallMs is provenance)', () => {
    const task = planBoundedSingleTasks(TINY)[0]
    expect(JSON.stringify(runBoundedTask(task).records)).toBe(JSON.stringify(runBoundedTask(task).records))
  })
})

describe('E4b: scoring arithmetic on hand-built records', () => {
  function srec(over: Partial<BoundedGameRecord>): BoundedGameRecord {
    return {
      exp: 'accuracySingle',
      cell: singleCellId(16, 'balanced', 'blitz'),
      pair: 0,
      orient: 0,
      seed: 'acc-0',
      startSeat: 0,
      aTeam: 0,
      steps: 100,
      finished: true,
      capped: false,
      illegal: 0,
      invariantViolations: 0,
      setsA: 5,
      setsB: 4,
      unresolved: 0,
      voids: 0,
      aShare: 5 / 9,
      clinch: true,
      tie: false,
      bits: 16,
      pairing: ['balanced', 'blitz'],
      top: ['punter', 'punter', 'punter', 'punter', 'punter', 'punter'],
      readSeat: 0,
      ...over,
    }
  }

  it('scores ONLY the bounded seat, against the team-0 truth', () => {
    // Seat 0 read correct, every other seat wrong: 1/1. Seat 2 read (game 1) wrong: 0/1.
    const records = [
      srec({ pair: 0, seed: 'acc-0', top: ['balanced', 'punter', 'punter', 'punter', 'punter', 'punter'] }),
      srec({ pair: 1, seed: 'acc-1', readSeat: 2, top: ['balanced', 'blitz', 'punter', 'blitz', 'balanced', 'blitz'] }),
    ]
    const scored = scoreBoundedSingleAccuracy(records, [16])
    expect(scored.cells.length).toBe(1)
    expect(scored.cells[0].reads).toBe(2)
    expect(scored.cells[0].top1).toBeCloseTo(1 / 2, 12)
    expect(scored.cells[0].byStyle.balanced).toEqual({ seats: 2, top1: expect.closeTo(1 / 2, 12) as number })
    // The truth is pairing[0]; the team-1 style is never a single-seat truth.
    expect(scored.cells[0].byStyle.blitz).toEqual({ seats: 0, top1: 0 })
    // Seed-clustered SE over per-seed accuracies 1 and 0: sd 0.7071/√2 = 0.5.
    expect(scored.cells[0].se).toBeCloseTo(0.5, 12)
    expect(scored.cells[0].seeds).toBe(2)
  })

  it('adjacent deltas are per-seed paired with the −2·SE pass rule', () => {
    const mk = (bits: number, pair: number, correct: boolean): BoundedGameRecord =>
      srec({
        cell: singleCellId(bits, 'balanced', 'blitz'),
        bits,
        pair,
        seed: `acc-${pair}`,
        top: [correct ? 'balanced' : 'punter', 'blitz', 'punter', 'punter', 'punter', 'punter'],
      })
    // Seeds 0 and 1: 16 bits scores 1 then 0; 64 bits scores 0 then 0 → deltas −1, 0.
    const records = [mk(16, 0, true), mk(16, 1, false), mk(64, 0, false), mk(64, 1, false)]
    const scored = scoreBoundedSingleAccuracy(records, [16, 64])
    expect(scored.deltas.length).toBe(1)
    expect(scored.deltas[0].seeds).toBe(2)
    expect(scored.deltas[0].delta).toBeCloseTo(-0.5, 12)
    // Per-seed deltas −1 and 0: sd √0.5, se √0.5/√2 = 0.5.
    expect(scored.deltas[0].se).toBeCloseTo(0.5, 12)
    expect(scored.deltas[0].pass).toBe(true) // −0.5 >= −2·0.5
    const worse = [mk(16, 0, true), mk(16, 1, true), mk(64, 0, false), mk(64, 1, false)]
    const down = scoreBoundedSingleAccuracy(worse, [16, 64])
    expect(down.deltas[0].delta).toBeCloseTo(-1, 12)
    expect(down.deltas[0].se).toBeCloseTo(0, 12)
    expect(down.deltas[0].pass).toBe(false)
  })

  it('tallies the ∞ reproduction, counting a missing verdict as a deviation', () => {
    const records = [
      srec({ cell: singleCellId(BOUNDED_INF_BITS, 'balanced', 'blitz'), bits: BOUNDED_INF_BITS, infExact: true }),
      srec({
        cell: singleCellId(BOUNDED_INF_BITS, 'balanced', 'blitz'),
        bits: BOUNDED_INF_BITS,
        pair: 1,
        seed: 'acc-1',
      }),
    ]
    const scored = scoreBoundedSingleAccuracy(records, [BOUNDED_INF_BITS])
    expect(scored.infReproduction).toEqual({ games: 2, deviations: 1 })
  })
})

describe('E4b: the P8 rule and the multiplicity annotation', () => {
  const delta = (over: Partial<AccuracyAdjacentDelta>): AccuracyAdjacentDelta => ({
    fromBits: 16,
    toBits: 32,
    seeds: 50,
    delta: 0.01,
    se: 0.005,
    z: 2,
    pass: true,
    ...over,
  })
  const cells = [
    { bits: 16, games: 1800, reads: 1800, top1: 0.15, se: 0.008, seeds: 50, byStyle: {} },
    { bits: BOUNDED_INF_BITS, games: 1800, reads: 1800, top1: 0.2, se: 0.009, seeds: 50, byStyle: {} },
  ] as Parameters<typeof computeBoundedSingleVerdict>[0]['cells']

  it('P8 confirms when every rung passes and refutes on any violation, naming the rung', () => {
    const good = computeBoundedSingleVerdict({
      cells,
      deltas: [delta({})],
      infReproduction: { games: 1800, deviations: 0 },
    })
    expect(good.id).toBe('P8')
    expect(good.prediction).toBe(BOUNDED_P8_PREDICTION.text)
    expect(good.verdict).toBe('confirmed')
    expect(good.detail).toMatch(/reproduced the corresponding full-strength read exactly/)
    const bad = computeBoundedSingleVerdict({
      cells,
      deltas: [delta({}), delta({ fromBits: 32, toBits: 64, delta: -0.02, se: 0.005, z: -4, pass: false })],
      infReproduction: { games: 1800, deviations: 0 },
    })
    expect(bad.verdict).toBe('refuted')
    expect(bad.detail).toMatch(/1 of 2 rungs violate/)
    expect(bad.detail).toMatch(/32→64/)
  })

  it('normalCdf: pinned against known quantiles', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7)
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 5)
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 5)
    expect(normalCdf(-2.7532960278890557)).toBeCloseTo(0.00294993, 7)
  })

  it('the Bonferroni family: ×m one-sided p per rung, annotation only', () => {
    const fam = multiplicityFamilyOf('P7', [
      delta({ fromBits: 16, toBits: 32, delta: 0.056, se: 0.0073, z: 7.7, pass: true }),
      delta({ fromBits: 32, toBits: 64, delta: 0.019, se: 0.005, z: 3.87, pass: true }),
      delta({
        fromBits: 64,
        toBits: BOUNDED_INF_BITS,
        delta: -0.0052777777777777745,
        se: 0.0019168944146642421,
        z: -2.7532960278890557,
        pass: false,
      }),
    ])
    expect(fam.id).toBe('P7')
    expect(fam.comparisons).toBe(3)
    expect(fam.alpha).toBe(0.05)
    expect(fam.note).toMatch(/annotation only/)
    // The passing rungs: p far above alpha, corrected p clamped at 1, no violation either way.
    expect(fam.rungs[0].pOneSided).toBeGreaterThan(0.999)
    expect(fam.rungs[0].pBonferroni).toBe(1)
    expect(fam.rungs[0].violatesRaw).toBe(false)
    expect(fam.rungs[0].violatesBonferroni).toBe(false)
    // The violating rung: p ≈ 0.00295, ×3 ≈ 0.00885 — survives the correction.
    expect(fam.rungs[2].pOneSided).toBeCloseTo(0.00294993, 7)
    expect(fam.rungs[2].pBonferroni).toBeCloseTo(3 * 0.00294993, 6)
    expect(fam.rungs[2].violatesRaw).toBe(true)
    expect(fam.rungs[2].violatesBonferroni).toBe(true)
  })

  it('a negative rung inside −2·SE can still violate at the corrected level only if p < alpha/m', () => {
    // z = −1.9: raw rule passes (−1.9 > −2), one-sided p ≈ 0.0287, ×3 ≈ 0.0861 > 0.05.
    const fam = multiplicityFamilyOf('P8', [
      delta({ delta: -0.0095, se: 0.005, z: -1.9, pass: true }),
      delta({ fromBits: 32, toBits: 64 }),
      delta({ fromBits: 64, toBits: BOUNDED_INF_BITS }),
    ])
    expect(fam.rungs[0].violatesRaw).toBe(false)
    expect(fam.rungs[0].violatesBonferroni).toBe(false)
    expect(fam.rungs[0].pBonferroni).toBeCloseTo(3 * normalCdf(-1.9), 12)
  })
})

describe('E4b: extendBoundedResults — additive, refusing anything that moved', () => {
  const inputs = {
    engineCommit: 'test-commit',
    rulesHash: 'test-rules-hash',
    rulesFile: 'RULES_US54.md',
    generatedAt: '2026-01-01T00:00:00.000Z',
    baseline: { artifact: 'adaptive-results.json', recordsDigest: 'testdigest', endTop1: 0.224 },
  }
  const base = buildBoundedResults(RUN, inputs)
  const baseText = JSON.stringify(base)
  /** The pin every honest call passes — the base's own digest, as a committed caller would. */
  const pin = { engineCommit: 'e4b-commit', expectedBaseDigest: base.meta.recordsDigest }
  const ext = extendBoundedResults(baseText, SINGLE_RUN, pin)

  it('appends P8 and the annotation; every carried section is byte-identical', () => {
    expect(ext.meta.schemaVersion).toBe(2)
    expect(ext.verdicts.map((v) => v.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'])
    expect(ext.meta.predictions.map((p) => p.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'])
    expect(JSON.stringify(ext.verdicts.slice(0, 7))).toBe(JSON.stringify(base.verdicts))
    expect(JSON.stringify(ext.meta.predictions.slice(0, 7))).toBe(JSON.stringify(base.meta.predictions))
    for (const key of ['ladder', 'ladderDeltas', 'mirrorExact', 'tiers', 'evidence', 'accuracy'] as const) {
      expect(JSON.stringify(ext[key])).toBe(JSON.stringify(base[key]))
    }
    expect(ext.meta.notes.slice(0, base.meta.notes.length)).toEqual(base.meta.notes)
    expect(ext.accuracySingle.mapping).toBe(SINGLE_READ_MAPPING)
    expect(ext.accuracySingle.meta.engineCommit).toBe('e4b-commit')
    expect(ext.accuracySingle.meta.recordsDigest).toBe(SINGLE_RUN.meta.recordsDigest)
    expect(ext.accuracySingle.infReproduction.deviations).toBe(0)
    expect(ext.multiplicity.map((f) => f.id)).toEqual(['P7', 'P8'])
  })

  it('refuses a doctored aggregate that feeds a verdict (accuracy top-1)', () => {
    const doctored = JSON.parse(baseText) as { accuracy: { cells: { top1: number }[] } }
    doctored.accuracy.cells[0].top1 += 0.01
    expect(() => extendBoundedResults(JSON.stringify(doctored), SINGLE_RUN, pin)).toThrow(/moved/)
  })

  it('refuses a doctored aggregate no verdict reads (a ladder cell share)', () => {
    const doctored = JSON.parse(baseText) as { ladder: { share: number }[] }
    doctored.ladder[0].share += 0.001
    expect(() => extendBoundedResults(JSON.stringify(doctored), SINGLE_RUN, pin)).toThrow(/moved/)
  })

  it('refuses a doctored committed verdict', () => {
    const doctored = JSON.parse(baseText) as { verdicts: { verdict: string }[] }
    doctored.verdicts[0].verdict = 'refuted'
    expect(() => extendBoundedResults(JSON.stringify(doctored), SINGLE_RUN, pin)).toThrow(/moved/)
  })

  it('refuses a base that does not carry the pinned committed digest', () => {
    expect(() =>
      extendBoundedResults(baseText, SINGLE_RUN, { engineCommit: 'x', expectedBaseDigest: 'deadbeefdeadbeef' }),
    ).toThrow(/recordsDigest .* does not match the committed value/)
  })

  it('refuses a base whose prediction texts stray from the registered BOUNDED_PREDICTIONS', () => {
    const doctored = JSON.parse(baseText) as { meta: { predictions: { text: string }[] } }
    doctored.meta.predictions[0].text += ' (as amended)'
    expect(() => extendBoundedResults(JSON.stringify(doctored), SINGLE_RUN, pin)).toThrow(
      /BOUNDED_PREDICTIONS/,
    )
  })

  it('refuses an unhealthy run, a mismatched grid, and a failed ∞ reproduction', () => {
    const sick = {
      ...SINGLE_RUN,
      health: { ...SINGLE_RUN.health, ok: false, violations: ['doctored'] },
    }
    expect(() => extendBoundedResults(baseText, sick, pin)).toThrow(/health gate/)

    const offGrid = {
      ...SINGLE_RUN,
      meta: { ...SINGLE_RUN.meta, config: { ...SINGLE_RUN.meta.config, accGames: SINGLE_RUN.meta.config.accGames + 1 } },
    }
    expect(() => extendBoundedResults(baseText, offGrid, pin)).toThrow(/E4 grid/)

    const unreproduced = { ...SINGLE_RUN, infReproduction: { ...SINGLE_RUN.infReproduction, deviations: 1 } }
    expect(() => extendBoundedResults(baseText, unreproduced, pin)).toThrow(/reproduction/)
  })

  it('refuses to re-extend an already-extended artifact', () => {
    expect(() =>
      extendBoundedResults(JSON.stringify(ext), SINGLE_RUN, {
        engineCommit: 'x',
        expectedBaseDigest: ext.meta.recordsDigest,
      }),
    ).toThrow(/schema/)
  })
})

describe('verdicts', () => {
  const built = buildBoundedResults(RUN, {
    engineCommit: 'test-commit',
    rulesHash: 'test-rules-hash',
    rulesFile: 'RULES_US54.md',
    generatedAt: '2026-01-01T00:00:00.000Z',
    baseline: { artifact: 'adaptive-results.json', recordsDigest: 'testdigest', endTop1: 0.224 },
  })

  it('emits all seven, in order, with the pre-registered texts attached', () => {
    expect(built.verdicts.map((v) => v.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'])
    expect(built.meta.predictions.map((p) => p.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'])
    for (const v of built.verdicts) {
      expect(['confirmed', 'refuted', 'mixed']).toContain(v.verdict)
      expect(v.detail.length).toBeGreaterThan(20)
      expect(v.prediction.length).toBeGreaterThan(20)
    }
  })

  it('P2 is confirmed on the tiny run — the ∞ mirror held exactly', () => {
    const p2 = built.verdicts.find((v) => v.id === 'P2')
    expect(p2?.verdict).toBe('confirmed')
    expect(p2?.detail).toMatch(/0 integer-exact mirror deviations/)
  })

  it('P1 refutes when any adjacent rung violates −2·SE', () => {
    const doctoredRun = {
      ...RUN,
      ladderDeltas: [{ fromBits: 0, toBits: 24, seeds: 2, delta: -0.3, se: 0.01, z: -30, pass: false }],
    }
    const verdicts = computeBoundedVerdicts(doctoredRun)
    const p1 = verdicts.find((v) => v.id === 'P1')
    expect(p1?.verdict).toBe('refuted')
    expect(p1?.detail).toMatch(/1 of 1 rungs violate/)
  })

  it('the P7 detail reads the ∞ cell against the committed baseline, exact-match stated', () => {
    const infCell = RUN.accuracy.cells.find((c) => c.bits >= BOUNDED_INF_BITS)
    expect(infCell).toBeDefined()
    const p7 = built.verdicts.find((v) => v.id === 'P7')
    expect(p7?.detail).toMatch(/committed v1.0 baseline/)
    // The tiny run is 1 game per pairing, not the real seed list, so agreement is not asserted
    // here — only that the comparison is present and worded either way.
    expect(p7?.detail).toMatch(/agree exactly|DISAGREE/)
  })

  it('the artifact carries meta, notes, health and the seed set', () => {
    expect(built.meta.schemaVersion).toBe(1)
    expect(built.meta.ruleSet).toBe('us54')
    expect(built.meta.recordsDigest).toBe(RUN.meta.recordsDigest)
    expect(built.meta.seedSet).toEqual({ prefix: 'bounded-v1', count: TINY.ladderPairs })
    expect(built.meta.notes.length).toBeGreaterThan(2)
    expect(built.meta.health.ok).toBe(true)
    expect(built.meta.baseline?.endTop1).toBe(0.224)
  })
})

describe('the artifact validator: round-trip and refusals', () => {
  const built = extendBoundedResults(
    JSON.stringify(
      buildBoundedResults(RUN, {
        engineCommit: 'test-commit',
        rulesHash: 'test-rules-hash',
        rulesFile: 'RULES_US54.md',
        generatedAt: '2026-01-01T00:00:00.000Z',
        baseline: { artifact: 'adaptive-results.json', recordsDigest: 'testdigest', endTop1: 0.224 },
      }),
    ),
    SINGLE_RUN,
    { engineCommit: 'e4b-commit', expectedBaseDigest: RUN.meta.recordsDigest },
  )

  it('round-trips through the site parser value-for-value', () => {
    const parsed = parseBoundedArtifact(JSON.stringify(built), 'test')
    expect(parsed).toEqual(built)
  })

  it('refuses a wrong schema version, a wrong rule set, and a missing field — each with a path', () => {
    const base = JSON.parse(JSON.stringify(built)) as Record<string, unknown>

    // A version-1 file predates E4b; the reader must notice, not render without the follow-up.
    const wrongSchema = JSON.parse(JSON.stringify(base)) as { meta: { schemaVersion: number } }
    wrongSchema.meta.schemaVersion = 1
    expect(() => parseBoundedArtifact(JSON.stringify(wrongSchema), 'test')).toThrow(ArtifactError)
    expect(() => parseBoundedArtifact(JSON.stringify(wrongSchema), 'test')).toThrow(/schemaVersion/)

    const wrongRules = JSON.parse(JSON.stringify(base)) as { meta: { ruleSet: string } }
    wrongRules.meta.ruleSet = 'pagat48'
    expect(() => parseBoundedArtifact(JSON.stringify(wrongRules), 'test')).toThrow(/us54/)

    const missing = JSON.parse(JSON.stringify(base)) as { ladder: Record<string, unknown>[] }
    delete missing.ladder[0].se
    expect(() => parseBoundedArtifact(JSON.stringify(missing), 'test')).toThrow(/test\.ladder\[0\]\.se/)
  })

  it('refuses an unknown style, an unknown tier, and an unsorted ladder', () => {
    const badStyle = JSON.parse(JSON.stringify(built)) as {
      accuracy: { cells: { byStyle: Record<string, unknown> }[] }
    }
    badStyle.accuracy.cells[0].byStyle.gambler = { seats: 1, top1: 0 }
    expect(() => parseBoundedArtifact(JSON.stringify(badStyle), 'test')).toThrow(/not a roster style/)

    const badTier = JSON.parse(JSON.stringify(built)) as { tiers: { tier: string }[] }
    badTier.tiers[0].tier = 'nightmare'
    expect(() => parseBoundedArtifact(JSON.stringify(badTier), 'test')).toThrow(/not a shipped tier/)

    const badLadder = JSON.parse(JSON.stringify(built)) as { meta: { config: { ladderBits: number[] } } }
    badLadder.meta.config.ladderBits = [24, 0]
    expect(() => parseBoundedArtifact(JSON.stringify(badLadder), 'test')).toThrow(/ascend strictly/)
  })

  it('refuses a prediction outside P1–P8 and a verdict outside the three honest values', () => {
    const badId = JSON.parse(JSON.stringify(built)) as { verdicts: { id: string }[] }
    badId.verdicts[0].id = 'P9'
    expect(() => parseBoundedArtifact(JSON.stringify(badId), 'test')).toThrow(/P1–P8 and closed/)

    const badVerdict = JSON.parse(JSON.stringify(built)) as { verdicts: { verdict: string }[] }
    badVerdict.verdicts[0].verdict = 'inconclusive'
    expect(() => parseBoundedArtifact(JSON.stringify(badVerdict), 'test')).toThrow(/only honest values/)

    const badInfinity = JSON.parse(JSON.stringify(built)) as { ladderDeltas: { z: unknown }[] }
    badInfinity.ladderDeltas[0].z = null
    expect(() => parseBoundedArtifact(JSON.stringify(badInfinity), 'test')).toThrow(/finite number/)
  })

  it('refuses a missing or malformed E4b block — each with a path', () => {
    const noSingle = JSON.parse(JSON.stringify(built)) as Record<string, unknown>
    delete noSingle.accuracySingle
    expect(() => parseBoundedArtifact(JSON.stringify(noSingle), 'test')).toThrow(/test\.accuracySingle/)

    const noMultiplicity = JSON.parse(JSON.stringify(built)) as Record<string, unknown>
    delete noMultiplicity.multiplicity
    expect(() => parseBoundedArtifact(JSON.stringify(noMultiplicity), 'test')).toThrow(/test\.multiplicity/)

    const noSe = JSON.parse(JSON.stringify(built)) as { accuracySingle: { cells: Record<string, unknown>[] } }
    delete noSe.accuracySingle.cells[0].se
    expect(() => parseBoundedArtifact(JSON.stringify(noSe), 'test')).toThrow(/test\.accuracySingle\.cells\[0\]\.se/)

    const noMapping = JSON.parse(JSON.stringify(built)) as { accuracySingle: Record<string, unknown> }
    delete noMapping.accuracySingle.mapping
    expect(() => parseBoundedArtifact(JSON.stringify(noMapping), 'test')).toThrow(/test\.accuracySingle\.mapping/)

    const badRepro = JSON.parse(JSON.stringify(built)) as {
      accuracySingle: { infReproduction: { deviations: unknown } }
    }
    badRepro.accuracySingle.infReproduction.deviations = 'none'
    expect(() => parseBoundedArtifact(JSON.stringify(badRepro), 'test')).toThrow(
      /test\.accuracySingle\.infReproduction\.deviations/,
    )

    const badFamily = JSON.parse(JSON.stringify(built)) as { multiplicity: { id: string }[] }
    badFamily.multiplicity[0].id = 'P6'
    expect(() => parseBoundedArtifact(JSON.stringify(badFamily), 'test')).toThrow(/not an annotated rung family/)

    const badRung = JSON.parse(JSON.stringify(built)) as {
      multiplicity: { rungs: Record<string, unknown>[] }[]
    }
    delete badRung.multiplicity[0].rungs[0].pBonferroni
    expect(() => parseBoundedArtifact(JSON.stringify(badRung), 'test')).toThrow(
      /test\.multiplicity\[0\]\.rungs\[0\]\.pBonferroni/,
    )
  })
})

describe('the committed artifact', () => {
  it('parses clean at the boundary, with a passing health gate and all eight verdicts', () => {
    const loaded = loadBoundedArtifact()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.artifact.meta.ruleSet).toBe('us54')
    expect(loaded.artifact.meta.health.ok).toBe(true)
    expect(loaded.artifact.ladder.length).toBe(10)
    expect(loaded.artifact.ladderDeltas.length).toBe(9)
    expect(loaded.artifact.mirrorExact.deviations).toBe(0)
    expect(loaded.artifact.tiers.map((t) => t.tier)).toEqual(['easy', 'medium', 'hard'])
    expect(loaded.artifact.verdicts.map((v) => v.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'])
    // The ∞ accuracy cell replays the v1.0 experiment byte-identically (the anchor pin), so
    // when the committed baseline is present the two top-1 numbers must agree exactly.
    const inf = loaded.artifact.accuracy.cells.find((c) => c.bits >= BOUNDED_INF_BITS)
    expect(inf).toBeDefined()
    if (loaded.artifact.meta.baseline !== null && inf !== undefined) {
      expect(inf.top1).toBeCloseTo(loaded.artifact.meta.baseline.endTop1, 12)
    }
  })

  it('carries the E4b block: registered mapping, healthy run, exact ∞ reproduction, ×3 annotation', () => {
    const loaded = loadBoundedArtifact()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const single = loaded.artifact.accuracySingle
    expect(single.mapping).toBe(SINGLE_READ_MAPPING)
    expect(single.health.ok).toBe(true)
    expect(single.cells.map((c) => c.bits)).toEqual(loaded.artifact.meta.config.accBits)
    for (const cell of single.cells) {
      expect(cell.reads).toBe(cell.games)
      expect(cell.reads).toBe(36 * loaded.artifact.meta.config.accGames)
    }
    expect(single.deltas.length).toBe(single.cells.length - 1)
    expect(single.infReproduction).toEqual({
      games: 36 * loaded.artifact.meta.config.accGames,
      deviations: 0,
    })
    expect(loaded.artifact.multiplicity.map((f) => f.id)).toEqual(['P7', 'P8'])
    for (const fam of loaded.artifact.multiplicity) {
      expect(fam.comparisons).toBe(3)
      expect(fam.rungs.length).toBe(3)
    }
    // The committed P7 verdicts and aggregates were carried over byte-identically; the P8
    // verdict is present and honest.
    const p8 = loaded.artifact.verdicts.find((v) => v.id === 'P8')
    expect(p8).toBeDefined()
    expect(['confirmed', 'refuted', 'mixed']).toContain(p8?.verdict)
    expect(p8?.detail).toMatch(/reproduced the corresponding full-strength read exactly/)
  })
})

describe('the evidence aggregator on real records', () => {
  it('is deterministic and clusters by seed', () => {
    const ladderRecs = RUN.records.filter((r) => r.exp === 'ladder')
    const one = aggregateEvidence(ladderRecs, us54Config, { minBandAvailable: 1 })
    const two = aggregateEvidence(ladderRecs, us54Config, { minBandAvailable: 1 })
    expect(JSON.stringify(two)).toBe(JSON.stringify(one))
    for (const c of one) {
      expect(c.decay.seeds).toBeLessThanOrEqual(TINY.ladderPairs)
    }
  })

  it('hand reconstruction matches the engine deal: observations never reference impossible holdings', () => {
    // Indirect but sharp: every exploited observation is an actual hit in the log (a certain
    // ask taken must hit — public locations are exact), checked across every retained game.
    for (const r of RUN.records) {
      if (r.elog === undefined) continue
      const events = decodeElog(r.elog, us54Config)
      const hands = newGame(r.seed, us54Config, r.startSeat).hands
      const { observations } = evidenceObservationsFromLog(hands, events, us54Config)
      for (const ob of observations) {
        if (ob.exploited) expect(ob.hit, `${r.cell} ${r.seed} event ${ob.event}`).toBe(true)
        expect(ob.age).toBeGreaterThanOrEqual(1)
        const ev = events[ob.event]
        expect(ev.type).toBe('a')
        if (ev.type === 'a') expect(ev.asker).toBe(ob.seat)
      }
    }
  })
})
