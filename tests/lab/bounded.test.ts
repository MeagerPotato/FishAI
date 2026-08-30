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
 * The artifact validator's refusals are tested alongside the committed artifact once it
 * exists — see the companion block at the bottom.
 */
import { describe, expect, it } from 'vitest'
import {
  BOUNDED_INF_BITS,
  BOUNDED_TIERS,
  DEFAULT_BOUNDED_CONFIG,
  aggregateEvidence,
  assembleBoundedRun,
  bitsEquivalentOf,
  boundedGamesTotal,
  boundedToJsonl,
  buildBoundedResults,
  computeBoundedVerdicts,
  decodeElog,
  encodeElog,
  evidenceObservationsFromLog,
  ladderAdjacentDeltas,
  ladderCellId,
  mirrorExactness,
  planBoundedTasks,
  runBoundedTask,
  scoreBoundedAccuracy,
  seedFor,
  tierCellId,
} from '../../lib/lab/index.ts'
import type {
  BoundedGameRecord,
  BoundedLabConfig,
  BoundedRunOutput,
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
  const built = buildBoundedResults(RUN, {
    engineCommit: 'test-commit',
    rulesHash: 'test-rules-hash',
    rulesFile: 'RULES_US54.md',
    generatedAt: '2026-01-01T00:00:00.000Z',
    baseline: { artifact: 'adaptive-results.json', recordsDigest: 'testdigest', endTop1: 0.224 },
  })

  it('round-trips through the site parser value-for-value', () => {
    const parsed = parseBoundedArtifact(JSON.stringify(built), 'test')
    expect(parsed).toEqual(built)
  })

  it('refuses a wrong schema version, a wrong rule set, and a missing field — each with a path', () => {
    const base = JSON.parse(JSON.stringify(built)) as Record<string, unknown>

    const wrongSchema = JSON.parse(JSON.stringify(base)) as { meta: { schemaVersion: number } }
    wrongSchema.meta.schemaVersion = 2
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

  it('refuses a prediction outside P1–P7 and a verdict outside the three honest values', () => {
    const badId = JSON.parse(JSON.stringify(built)) as { verdicts: { id: string }[] }
    badId.verdicts[0].id = 'P8'
    expect(() => parseBoundedArtifact(JSON.stringify(badId), 'test')).toThrow(/P1–P7 and closed/)

    const badVerdict = JSON.parse(JSON.stringify(built)) as { verdicts: { verdict: string }[] }
    badVerdict.verdicts[0].verdict = 'inconclusive'
    expect(() => parseBoundedArtifact(JSON.stringify(badVerdict), 'test')).toThrow(/only honest values/)

    const badInfinity = JSON.parse(JSON.stringify(built)) as { ladderDeltas: { z: unknown }[] }
    badInfinity.ladderDeltas[0].z = null
    expect(() => parseBoundedArtifact(JSON.stringify(badInfinity), 'test')).toThrow(/finite number/)
  })
})

describe('the committed artifact', () => {
  it('parses clean at the boundary, with a passing health gate and all seven verdicts', () => {
    const loaded = loadBoundedArtifact()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.artifact.meta.ruleSet).toBe('us54')
    expect(loaded.artifact.meta.health.ok).toBe(true)
    expect(loaded.artifact.ladder.length).toBe(10)
    expect(loaded.artifact.ladderDeltas.length).toBe(9)
    expect(loaded.artifact.mirrorExact.deviations).toBe(0)
    expect(loaded.artifact.tiers.map((t) => t.tier)).toEqual(['easy', 'medium', 'hard'])
    expect(loaded.artifact.verdicts.map((v) => v.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'])
    // The ∞ accuracy cell replays the v1.0 experiment byte-identically (the anchor pin), so
    // when the committed baseline is present the two top-1 numbers must agree exactly.
    const inf = loaded.artifact.accuracy.cells.find((c) => c.bits >= BOUNDED_INF_BITS)
    expect(inf).toBeDefined()
    if (loaded.artifact.meta.baseline !== null && inf !== undefined) {
      expect(inf.top1).toBeCloseTo(loaded.artifact.meta.baseline.endTop1, 12)
    }
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
