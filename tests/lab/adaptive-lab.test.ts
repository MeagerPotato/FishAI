/**
 * adaptive-lab.test.ts — the FishAI v1.0 experiment suite at tiny N (SPEC Stage 2b/2c).
 *
 * The full run is ~163,000 games; these tests run the SAME machinery — `planAdaptiveTasks` →
 * `runAdaptiveTask` → `assembleAdaptiveRun` → `buildAdaptiveResults` → the site's boundary
 * parser — at 1-2 pairs per cell, so every claim the artifact makes structurally is pinned
 * before a single reporting-scale game is played:
 *
 *  - the health discipline holds (0 illegal / capped / invariant findings, distinct seeds);
 *  - the run is deterministic (two runs of the same config are byte-identical);
 *  - the mixed screen's two arms really did play the same (pair, orient, seed, startSeat) sets
 *    — the pairing claim is checked against the records, not assumed from the plan;
 *  - the oracle point-mass plumbing reaches `chooseStyle` (confidence-1 reads on the three
 *    opponent seats), and — a *measured* consequence of the committed table's dominant punter
 *    row, pinned in tests/bots/adaptive.test.ts — both ablation arms delegate identically, so
 *    every oracle delta is exactly 0 (a future counter table with a cycle would legitimately
 *    change this one assertion);
 *  - the accuracy scorer counts a hand-built case correctly, checkpoint by checkpoint;
 *  - the artifact round-trips through the site parser and a corrupted artifact is refused
 *    with a named path.
 *
 * The gauntlet's seed-list contract with matrix v2 (`style-v1`, 4,300 pairs) is asserted on
 * the DEFAULT config — the tiny runs shorten the list, which is exactly why
 * `buildAdaptiveResults` demotes them to an unpaired benchmark, also asserted here.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ADAPTIVE_CONFIG,
  adaptiveGamesTotal,
  allThreeMultisets,
  assembleAdaptiveRun,
  buildAdaptiveResults,
  mixedCellId,
  mixedCompositionList,
  oracleStylesFor,
  planAdaptiveTasks,
  runAdaptiveTask,
  scoreClassifier,
  seedFor,
} from '../../lib/lab/index.ts'
import type {
  AdaptiveArtifactInputs,
  AdaptiveGameRecord,
  AdaptiveLabConfig,
  AdaptiveRunOutput,
} from '../../lib/lab/index.ts'
import { COUNTER_TABLE, STYLE_IDS, chooseStyle, newGame, seatView, us54Config } from '../../lib/engine/index.ts'
import { ArtifactError } from '../../src/lab/artifact.ts'
import { loadAdaptiveArtifact, parseAdaptiveArtifact } from '../../src/lab/adaptive-artifact.ts'

const TINY: AdaptiveLabConfig = {
  gauntletPairs: 2,
  gauntletSeedPrefix: 'style-v1',
  mirrorPairs: 2,
  mixedPairs: 2,
  mixedSeedPrefix: 'mixed-v1',
  mixedCompositions: 2,
  oraclePairs: 2,
  accGames: 2,
  accSeedPrefix: 'clsacc-v1',
  accCheckpoints: [40, 80, 150, 250],
  chunkPairs: 25,
  variant: 'us54',
  stepCap: 5000,
  invariantCheck: 'every',
}

function runSuite(config: AdaptiveLabConfig): AdaptiveRunOutput {
  const results = planAdaptiveTasks(config).map((t) => runAdaptiveTask(t))
  return assembleAdaptiveRun(config, results, {
    wallMs: 1,
    workers: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
  })
}

/** The one tiny run most tests read. Module-level so it is played once, not per test. */
const RUN = runSuite(TINY)

/** Punter's row of the committed counter table, as a benchmark input for the round-trip. */
function punterRowFromTable(): Record<string, { score: number; se: number }> {
  const row: Record<string, { score: number; se: number }> = {}
  const pi = COUNTER_TABLE.styles.indexOf('punter')
  for (let j = 0; j < COUNTER_TABLE.styles.length; j++) {
    row[COUNTER_TABLE.styles[j]] = { score: COUNTER_TABLE.p[pi][j], se: COUNTER_TABLE.se[pi][j] }
  }
  return row
}

function artifactInputs(pairsPerCell: number): AdaptiveArtifactInputs {
  return {
    engineCommit: 'test-commit',
    rulesHash: 'test-rules-hash',
    rulesFile: 'RULES_US54.md',
    generatedAt: '2026-01-01T00:00:00.000Z',
    benchmark: {
      artifact: 'style-results.v2.json',
      recordsDigest: COUNTER_TABLE.provenance.recordsDigest,
      seedPrefix: 'style-v1',
      pairsPerCell,
      punterRow: punterRowFromTable(),
    },
  }
}

describe('the plan', () => {
  it('the default config is the pre-registered experiment: matrix v2 seeds, 4300 pairs', () => {
    expect(DEFAULT_ADAPTIVE_CONFIG.gauntletSeedPrefix).toBe('style-v1')
    expect(DEFAULT_ADAPTIVE_CONFIG.gauntletPairs).toBe(4300)
    expect(DEFAULT_ADAPTIVE_CONFIG.mixedCompositions).toBe(24)
    // The seed list construction is plan.ts's, shared with the matrix: prefix-zeropadded.
    expect(seedFor('style-v1', 0)).toBe('style-v1-000000')
    expect(seedFor('style-v1', 4299)).toBe('style-v1-004299')
  })

  it('enumerates 165 lexicographic 3-multisets and takes every 7th — 24 compositions', () => {
    const all = allThreeMultisets(STYLE_IDS)
    expect(all.length).toBe(165)
    expect(all[0]).toEqual(['balanced', 'balanced', 'balanced'])
    const comps = mixedCompositionList(24)
    expect(comps.length).toBe(24)
    expect(comps[0]).toEqual(all[0])
    expect(comps[1]).toEqual(all[7])
    expect(comps[23]).toEqual(all[161])
    // Ascending style-id order within every composition, by construction.
    for (const comp of comps) {
      const idx = comp.map((s) => STYLE_IDS.indexOf(s))
      expect(idx).toEqual([...idx].sort((a, b) => a - b))
    }
    expect(() => mixedCompositionList(25)).toThrow(/stride/)
  })

  it('refuses an oracle budget the gauntlet cannot pair', () => {
    expect(() => planAdaptiveTasks({ ...TINY, oraclePairs: 3 })).toThrow(/paired against the gauntlet/)
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
    expect(RUN.meta.gamesTotal).toBe(adaptiveGamesTotal(TINY))
  })

  it('gauntlet: 9 cells on the matrix seed list, both orientations, counters re-indexed', () => {
    expect(RUN.gauntlet.length).toBe(9)
    for (const cell of RUN.gauntlet) {
      expect(cell.pairs).toBe(TINY.gauntletPairs)
      expect(cell.games).toBe(TINY.gauntletPairs * 2)
      expect(cell.distinctSeeds).toBe(TINY.gauntletPairs)
      expect(cell.metrics.a.askHitRate).toBeGreaterThan(0)
      expect(cell.metrics.b.askHitRate).toBeGreaterThan(0)
    }
    const recs = RUN.records.filter((r) => r.exp === 'gauntlet' && r.opponent === 'turtle')
    expect(recs.map((r) => r.seed).sort()).toEqual(['style-v1-000000', 'style-v1-000000', 'style-v1-000001', 'style-v1-000001'])
    for (const r of recs) {
      expect(r.startSeat).toBe(r.pair % 6)
      expect(r.aTeam).toBe(r.orient)
      expect(r.ca).toBeDefined()
      expect(r.usage).toBeDefined()
    }
  })

  it('mirror: exactly 0.5 with SE exactly 0 — the two orientations are the same game', () => {
    expect(RUN.mirror.pairs).toBe(TINY.mirrorPairs)
    expect(RUN.mirror.games).toBe(TINY.mirrorPairs * 2)
    expect(RUN.mirror.score).toBe(0.5)
    expect(RUN.mirror.se).toBe(0)
  })

  it('non-gauntlet records stay lean: no counters, no usage', () => {
    for (const r of RUN.records) {
      if (r.exp === 'gauntlet') continue
      expect(r.ca).toBeUndefined()
      expect(r.cb).toBeUndefined()
      expect(r.usage).toBeUndefined()
    }
  })

  it('styleUsage: warmup delegates only to the anchor; warm decisions only to punter (measured dominance)', () => {
    expect(RUN.styleUsage.length).toBe(9)
    let warmTotal = 0
    for (const row of RUN.styleUsage) {
      if (row.decisions.warmup > 0) expect(row.warmupShares.balanced).toBe(1)
      if (row.decisions.warm > 0) expect(row.warmShares.punter).toBe(1)
      warmTotal += row.decisions.warm
      expect(row.decisions.warmup).toBeGreaterThan(0)
    }
    // Most us54 games outlive 60 events, so across 36 gauntlet games some warm phase exists.
    expect(warmTotal).toBeGreaterThan(0)
  })
})

describe('the mixed screen pairing', () => {
  it('both arms played the identical (pair, orient, seed, startSeat) set per composition', () => {
    const comps = mixedCompositionList(TINY.mixedCompositions)
    expect(RUN.mixed.rows.length).toBe(comps.length)
    for (let c = 0; c < comps.length; c++) {
      const cell = mixedCellId(c, comps[c])
      const sig = (arm: 'adaptive' | 'punter'): string[] =>
        RUN.records
          .filter((r) => r.exp === 'mixed' && r.cell === cell && r.arm === arm)
          .map((r) => `${r.pair}:${r.orient}:${r.seed}:${r.startSeat}`)
          .sort()
      const a = sig('adaptive')
      const p = sig('punter')
      expect(a.length).toBe(TINY.mixedPairs * 2)
      expect(a).toEqual(p)
    }
  })

  it('the pooled delta is the mean of per-pair deltas over all compositions', () => {
    let sum = 0
    let n = 0
    for (const row of RUN.mixed.rows) {
      sum += row.delta * row.pairs
      n += row.pairs
    }
    expect(n).toBe(TINY.mixedCompositions * TINY.mixedPairs)
    expect(RUN.mixed.pairedDelta).toBeCloseTo(sum / n, 12)
  })
})

describe('the oracle ablation', () => {
  it('oracleStylesFor names the true style at every opponent seat and null at home', () => {
    expect(oracleStylesFor('turtle', 0)).toEqual([null, 'turtle', null, 'turtle', null, 'turtle'])
    expect(oracleStylesFor('ghost', 1)).toEqual(['ghost', null, 'ghost', null, 'ghost', null])
  })

  it('the point mass reaches chooseStyle: confidence-1 reads on the three opponent seats', () => {
    const s = newGame('adaptive-lab-oracle', us54Config, 0)
    const view = seatView(s, 0)
    const choice = chooseStyle(view, { adaptive: true, warmupEvents: 0, oracleStyles: oracleStylesFor('turtle', 0) })
    expect(choice.reads.map((r) => r.seat)).toEqual([1, 3, 5])
    for (const read of choice.reads) {
      expect(read.top).toBe('turtle')
      expect(read.confidence).toBe(1)
      expect(read.posterior.turtle).toBe(1)
    }
    // The measured dominance: the warm best response is punter whatever the read
    // (tests/bots/adaptive.test.ts re-derives this from the table; here it is context).
    expect(choice.style).toBe('punter')
  })

  it('every oracle delta is exactly 0: both arms delegate identically under a dominant row', () => {
    // This is a MEASURED consequence of the committed counter table (punter's row dominates,
    // and its worst margin over the biased anchor exceeds the switch margin), not an axiom:
    // a future table with an intransitive cycle would legitimately fail this expectation and
    // make the ablation informative.
    expect(RUN.oracle.length).toBe(9)
    for (const row of RUN.oracle) {
      expect(row.pairs).toBe(TINY.oraclePairs)
      expect(row.delta).toBe(0)
      expect(row.se).toBe(0)
      expect(row.oracle).toBe(row.classifier)
    }
  })
})

describe('the accuracy scorer', () => {
  it('counts a hand-built case correctly, checkpoint by checkpoint', () => {
    const rec: AdaptiveGameRecord = {
      exp: 'accuracy',
      cell: 'acc-turtle-vs-punter',
      pair: 0,
      orient: 0,
      seed: 'hand-built',
      startSeat: 0,
      aTeam: 0,
      steps: 10,
      finished: true,
      capped: false,
      illegal: 0,
      invariantViolations: 0,
      setsA: 5,
      setsB: 0,
      unresolved: 4,
      voids: 0,
      aResult: 1,
      clinch: true,
      tie: false,
      pairing: ['turtle', 'punter'],
      cls: [
        // Truth by seating: seats 0/2/4 are turtle (team 0), seats 1/3/5 punter.
        { events: 40, top: ['turtle', 'punter', 'turtle', 'punter', 'turtle', 'punter'] }, // 6/6
        { events: 0, top: ['turtle', 'blitz', 'banker', 'punter', 'turtle', 'punter'] }, // 4/6
      ],
    }
    const scored = scoreClassifier([rec], [40, 80, 150, 250])
    expect(scored.checkpoints).toEqual([40, 80, 150, 250, 0])

    const at40 = scored.accuracy.find((r) => r.events === 40)
    expect(at40?.seats).toBe(6)
    expect(at40?.top1).toBe(1)
    const at80 = scored.accuracy.find((r) => r.events === 80)
    expect(at80?.seats).toBe(0)
    expect(at80?.top1).toBe(0)
    const end = scored.accuracy.find((r) => r.events === 0)
    expect(end?.seats).toBe(6)
    expect(end?.top1).toBeCloseTo(4 / 6, 12)
    expect(end?.byStyle.turtle).toEqual({ seats: 3, top1: 2 / 3 })
    expect(end?.byStyle.punter).toEqual({ seats: 3, top1: 2 / 3 })
    expect(end?.byStyle.ghost).toEqual({ seats: 0, top1: 0 })

    // Confusion is end-of-game only, [true][predicted], STYLE_IDS order.
    const ti = (s: string): number => STYLE_IDS.indexOf(s as (typeof STYLE_IDS)[number])
    const m = scored.confusion.matrix
    expect(scored.confusion.styles).toEqual([...STYLE_IDS])
    expect(m[ti('turtle')][ti('turtle')]).toBe(2)
    expect(m[ti('turtle')][ti('banker')]).toBe(1)
    expect(m[ti('punter')][ti('punter')]).toBe(2)
    expect(m[ti('punter')][ti('blitz')]).toBe(1)
    expect(m.flat().reduce((s, v) => s + v, 0)).toBe(6)
  })

  it('the tiny run scored every seat of every finished accuracy game at end-of-game', () => {
    const end = RUN.classifier.accuracy.find((r) => r.events === 0)
    expect(end?.seats).toBe(36 * TINY.accGames * 6)
  })
})

describe('determinism', () => {
  // Two whole (small) suite runs — well over vitest's default 5s budget, deliberately so:
  // determinism is only worth pinning on real games.
  it('a re-run of the same config is byte-identical, digest included', { timeout: 60_000 }, () => {
    const small: AdaptiveLabConfig = {
      ...TINY,
      gauntletPairs: 1,
      mirrorPairs: 0,
      mixedPairs: 1,
      mixedCompositions: 1,
      oraclePairs: 1,
      accGames: 1,
    }
    const one = runSuite(small)
    const two = runSuite(small)
    expect(two.meta.recordsDigest).toBe(one.meta.recordsDigest)
    expect(JSON.stringify(two)).toBe(JSON.stringify(one))
  })
})

describe('the committed artifact', () => {
  it('parses clean at the boundary, with a passing health gate and all four verdicts', () => {
    const loaded = loadAdaptiveArtifact()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.artifact.meta.ruleSet).toBe('us54')
    expect(loaded.artifact.meta.health.ok).toBe(true)
    expect(loaded.artifact.gauntlet.length).toBe(9)
    expect(loaded.artifact.verdicts.map((v) => v.id)).toEqual(['P1', 'P2', 'P3', 'P4'])
    // The committed counter table and the committed benchmark must describe the same matrix.
    expect(loaded.artifact.meta.counterTableProvenance.recordsDigest).toBe(
      loaded.artifact.meta.benchmark.recordsDigest,
    )
  })
})

describe('the artifact: build, round-trip, refusals', () => {
  const results = buildAdaptiveResults(RUN, artifactInputs(4300))

  it('a shortened gauntlet demotes the benchmark to unpaired and says so', () => {
    expect(results.meta.benchmark.paired).toBe(false)
    expect(results.meta.benchmark.note).toMatch(/UNPAIRED/)
    // A matching seed list (prefix AND count) is stamped paired.
    const paired = buildAdaptiveResults(RUN, artifactInputs(TINY.gauntletPairs))
    expect(paired.meta.benchmark.paired).toBe(true)
    expect(paired.meta.benchmark.note).toMatch(/cross-run/)
  })

  it('refuses a benchmark from a different matrix than the counter table', () => {
    const inputs = artifactInputs(4300)
    inputs.benchmark = { ...inputs.benchmark, recordsDigest: 'ffffffffffffffff' }
    expect(() => buildAdaptiveResults(RUN, inputs)).toThrow(/same matrix/)
  })

  it('carries the provenance and the pre-registered predictions', () => {
    expect(results.meta.counterTableProvenance.recordsDigest).toBe(COUNTER_TABLE.provenance.recordsDigest)
    expect(results.meta.predictions.map((p) => p.id)).toEqual(['P1', 'P2', 'P3', 'P4'])
    expect(results.verdicts.map((v) => v.id)).toEqual(['P1', 'P2', 'P3', 'P4'])
    // The oracle verdict on this run states the exact-zero mechanism, not just a pass.
    const p3 = results.verdicts.find((v) => v.id === 'P3')
    expect(p3?.verdict).toBe('confirmed')
    expect(p3?.detail).toMatch(/exactly 0/)
  })

  it('round-trips through the site parser value-for-value', () => {
    const parsed = parseAdaptiveArtifact(JSON.stringify(results), 'test')
    expect(parsed).toEqual(results)
  })

  it('refuses a wrong schema version, a wrong rule set, and a missing field — each with a path', () => {
    const base = JSON.parse(JSON.stringify(results)) as Record<string, unknown>

    const wrongSchema = JSON.parse(JSON.stringify(base)) as { meta: { schemaVersion: number } }
    wrongSchema.meta.schemaVersion = 2
    expect(() => parseAdaptiveArtifact(JSON.stringify(wrongSchema), 'test')).toThrow(ArtifactError)
    expect(() => parseAdaptiveArtifact(JSON.stringify(wrongSchema), 'test')).toThrow(/schemaVersion/)

    const wrongRules = JSON.parse(JSON.stringify(base)) as { meta: { ruleSet: string } }
    wrongRules.meta.ruleSet = 'pagat48'
    expect(() => parseAdaptiveArtifact(JSON.stringify(wrongRules), 'test')).toThrow(/us54/)

    const missing = JSON.parse(JSON.stringify(base)) as { gauntlet: Record<string, unknown>[] }
    delete missing.gauntlet[0].se
    expect(() => parseAdaptiveArtifact(JSON.stringify(missing), 'test')).toThrow(/test\.gauntlet\[0\]\.se/)

    const badMatrix = JSON.parse(JSON.stringify(base)) as { classifier: { confusion: { matrix: number[][] } } }
    badMatrix.classifier.confusion.matrix = badMatrix.classifier.confusion.matrix.slice(0, 3)
    expect(() => parseAdaptiveArtifact(JSON.stringify(badMatrix), 'test')).toThrow(/rows/)

    const badStyle = JSON.parse(JSON.stringify(base)) as { oracle: { opponent: string }[] }
    badStyle.oracle[0].opponent = 'gambler'
    expect(() => parseAdaptiveArtifact(JSON.stringify(badStyle), 'test')).toThrow(/not a roster style/)
  })
})
