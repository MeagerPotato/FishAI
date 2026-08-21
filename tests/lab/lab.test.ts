/**
 * lab.test.ts — the duplicate-deal simulation runner (BOT_LAB.md §5/§6, STYLES.md §4).
 *
 * What is worth asserting about a *measurement* device is not that it produces a particular
 * number — that is the experiment — but that its controls actually hold. So the tests below are
 * about the design, not the results:
 *
 * - the duplicate pair really is one deal played twice with only the seating swapped (§5.1),
 * - the seed set really is shared across cells and never repeats a deal (§5.2, §10.6),
 * - the payoff matrix really is antisymmetric (§4.4 needs that before it can be decomposed),
 * - the health gate really voids a run (§4.3), and a capped game is named rather than dropped
 *   (RULES_US54.md §3.2 — the cap is load-bearing because an adversarial policy can livelock),
 * - and the whole thing is a pure function of the seed set: the digest must not move when the
 *   worker count does.
 *
 * Game counts here are deliberately tiny; the pilot is `npm run lab`.
 */
import { describe, expect, it } from 'vitest'
import {
  aggregateCell,
  assembleRun,
  cellList,
  DEFAULT_LAB_CONFIG,
  digest,
  gamesTotal,
  payoffMatrix,
  planTasks,
  playGame,
  runHealth,
  runLab,
  runTask,
  seedFor,
  seedSet,
  startSeatFor,
  toJsonl,
} from '../../lib/lab/index.ts'
import type { LabGameRecord, LabRunConfig, LabTask } from '../../lib/lab/index.ts'
import { STYLE_IDS, STYLE_ROSTER, clinchTarget, newGame, us54Config } from '../../lib/engine/index.ts'
import type { Seat, StyleId } from '../../lib/engine/index.ts'

const TARGET = clinchTarget(us54Config)

function config(over: Partial<LabRunConfig> = {}): LabRunConfig {
  return { ...DEFAULT_LAB_CONFIG, pairs: 2, chunkPairs: 1, seedPrefix: 'test', ...over }
}

/** The in-process executor: the same `runTask` the worker thread calls, without the thread. */
function inProcess(task: LabTask): Promise<ReturnType<typeof runTask>> {
  return Promise.resolve(runTask(task))
}

describe('plan — BOT_LAB.md §5.2 controls', () => {
  it('the nine-style roster gives C(9,2) = 36 cells, no mirrors, stable ids', () => {
    const cells = cellList(STYLE_IDS)
    expect(cells.length).toBe(36)
    expect(cells.every((c) => c.a !== c.b)).toBe(true)
    expect(new Set(cells.map((c) => c.id)).size).toBe(36)
    expect(cells[0].id).toBe('balanced-vs-blitz')
    // Unordered: {a,b} appears once, never also as {b,a}.
    const keys = cells.map((c) => [c.a, c.b].sort().join('|'))
    expect(new Set(keys).size).toBe(36)
    expect(gamesTotal(config({ pairs: 200 }))).toBe(36 * 200 * 2)
  })

  it('the seed set is shared, distinct, and sorts numerically (§5.2)', () => {
    const seeds = seedSet('style-v1', 250)
    expect(seeds.length).toBe(250)
    // §10.6: re-running a seed returns a byte-identical game, so a repeat is not extra data.
    expect(new Set(seeds).size).toBe(250)
    expect(seeds[0]).toBe('style-v1-000000')
    expect(seeds[249]).toBe('style-v1-000249')
    expect([...seeds].sort()).toEqual(seeds)
    // Every cell is handed the identical list: the generator depends on nothing but its args.
    expect(seedFor('style-v1', 42)).toBe(seedSet('style-v1', 43)[42])
  })

  it('start seat rotates i mod 6 (§5.2)', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(startSeatFor)).toEqual([0, 1, 2, 3, 4, 5, 0, 1])
  })

  it('tasks cover every (cell, pair) exactly once', () => {
    const cfg = config({ styles: STYLE_IDS, pairs: 7, chunkPairs: 3 })
    const tasks = planTasks(cfg)
    const seen = new Set<string>()
    for (const t of tasks) {
      for (let p = t.pairFrom; p < t.pairTo; p++) {
        const key = `${t.cell.id}#${p}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }
    expect(seen.size).toBe(36 * 7)
    expect(tasks.map((t) => t.index)).toEqual(tasks.map((_, i) => i))
  })
})

describe('duplicate deals — BOT_LAB.md §5.1', () => {
  const a = STYLE_ROSTER.balanced
  const b = STYLE_ROSTER.blitz

  it('both orientations of a pair are the same deal from the same start seat', () => {
    const seed = seedFor('test', 3)
    const start = startSeatFor(3)
    // The deal is a pure function of (seed, config): `newGame` is what both orientations call,
    // so holding the seed and the start seat fixed is exactly "the same deal, both ways round".
    const g0 = newGame(seed, us54Config, start)
    const g1 = newGame(seed, us54Config, start)
    expect(g1.hands).toEqual(g0.hands)
    expect(g1.turn).toBe(g0.turn)
    expect(start).toBe(3)
  })

  it('orientation 1 of (a,b) IS orientation 0 of (b,a) — the swap moves the styles and nothing else', () => {
    const opts = { variant: 'us54' as const, stepCap: 5000, invariantCheck: 'every' as const }
    const seed = seedFor('test', 1)
    const start: Seat = startSeatFor(1)
    const ab1 = playGame(a, b, seed, start, 1, opts)
    const ba0 = playGame(b, a, seed, start, 0, opts)
    expect(ab1.steps).toBe(ba0.steps)
    expect(ab1.sets).toEqual(ba0.sets)
    expect(ab1.counters).toEqual(ba0.counters)
  })

  it('a task re-run is byte-identical (determinism is not sampling)', () => {
    const [task] = planTasks(config({ styles: ['balanced', 'blitz'], pairs: 2, chunkPairs: 2 }))
    const one = runTask(task)
    const two = runTask(task)
    expect(JSON.stringify(two.records)).toBe(JSON.stringify(one.records))
    expect(one.records.length).toBe(4)
    // Both orientations of every pair, and nothing else.
    expect(one.records.map((r) => `${r.pair}:${r.orient}`)).toEqual(['0:0', '0:1', '1:0', '1:1'])
    for (const r of one.records) expect(r.startSeat).toBe(startSeatFor(r.pair))
  })
})

describe('per-game measurement', () => {
  // Balanced vs Turtle deliberately: Turtle carries by far the highest forced-declare and
  // concede rates in the roster, so this is the pairing most likely to produce the awkward
  // cases — a set gifted by a forced wrong declare, and a clinch reached by being gifted.
  const [task] = planTasks(config({ styles: ['balanced', 'turtle'], pairs: 6, chunkPairs: 6 }))
  const records = runTask(task).records

  it('every game is a us54 clinch at exactly 5 sets, with no tie and no void', () => {
    for (const r of records) {
      expect(r.finished, r.seed).toBe(true)
      expect(r.capped, r.seed).toBe(false)
      expect(r.clinch, r.seed).toBe(true)
      expect(Math.max(r.setsA, r.setsB), r.seed).toBe(TARGET)
      expect(r.setsA, r.seed).not.toBe(r.setsB)
      expect(r.voids, r.seed).toBe(0)
      expect(r.illegal, r.seed).toBe(0)
      expect(r.invariantViolations, r.seed).toBe(0)
      // RULES_US54.md §5.1: a clinched game ends with sets still unresolved.
      expect(r.setsA + r.setsB + r.unresolved).toBe(9)
    }
  })

  it('counters are internally consistent', () => {
    for (const r of records) {
      for (const c of [r.ca, r.cb]) {
        expect(c.hits).toBeLessThanOrEqual(c.asks)
        expect(c.declaresCorrect + c.declaresWrong).toBe(c.declares)
        expect(c.declaresForced).toBeLessThanOrEqual(c.declares)
        expect(c.foreignDeclaresForced).toBeLessThanOrEqual(c.foreignDeclares)
        expect(c.declaresWrongForced).toBeLessThanOrEqual(c.declaresWrong)
        expect(c.leakyAsks).toBeLessThanOrEqual(c.asks)
        // A race loss is a wrong declare on a set the team held: a strict subset.
        expect(c.raceLosses).toBeLessThanOrEqual(c.declaresWrong)
        expect(c.clinchDenials).toBeLessThanOrEqual(c.declaresCorrect)
        expect(c.clinchWins).toBeLessThanOrEqual(1)
        expect(c.latencyCount).toBeLessThanOrEqual(c.declaresCorrect)
        expect(c.hoardSamples).toBeGreaterThan(0)
        expect(c.dropoutSteps.length).toBeLessThanOrEqual(3)
      }
      // Every resolved set was awarded to exactly one side (row 14 abolishes the void).
      expect(r.ca.setsWon + r.cb.setsWon).toBe(r.setsA + r.setsB)
      expect(r.ca.setsWon).toBe(r.setsA)
      // A gift to one side is a wrong declare by the other.
      expect(r.ca.setsGifted).toBe(r.cb.declaresWrong)
      expect(r.cb.setsGifted).toBe(r.ca.declaresWrong)
      // Exactly one side takes the game-ending 5th set — whether it declared it or was gifted it.
      expect(r.ca.clinchWins + r.cb.clinchWins).toBe(1)
      expect(r.ca.clinchWins === 1 ? r.setsA : r.setsB).toBe(TARGET)
    }
  })
})

describe('aggregation — the paired estimator and the matrix', () => {
  it('aScore is the mean of per-pair means, and the matrix is antisymmetric', async () => {
    const cfg = config({ styles: ['balanced', 'blitz', 'turtle'], pairs: 2, chunkPairs: 2 })
    const out = await runLab(cfg, 3, inProcess)
    expect(out.cells.length).toBe(3)
    for (const c of out.cells) {
      expect(c.pairs).toBe(2)
      expect(c.games).toBe(4)
      expect(c.distinctSeeds).toBe(2)
      expect(c.aWins + c.bWins + c.ties).toBe(4)
    }
    const p = payoffMatrix(cfg.styles, out.cells)
    for (let i = 0; i < cfg.styles.length; i++) {
      expect(p[i][i]).toBeNull()
      for (let j = 0; j < cfg.styles.length; j++) {
        if (i === j) continue
        expect((p[i][j] as number) + (p[j][i] as number)).toBeCloseTo(1, 12)
      }
    }
  })

  it('the pair mean is what is averaged, not the 2N flat games', () => {
    const cell = cellList(['balanced', 'blitz'])[0]
    // Hand-built: pair 0 is a 1-0 split (pair mean 0.5), pair 1 is a 1-1 sweep (pair mean 1).
    const mk = (pair: number, orient: 0 | 1, aResult: number): LabGameRecord => ({
      ...emptyRecord(cell.id),
      pair,
      orient,
      seed: seedFor('test', pair),
      aResult,
    })
    const agg = aggregateCell(cell, [mk(0, 0, 1), mk(0, 1, 0), mk(1, 0, 1), mk(1, 1, 1)], 2)
    expect(agg.aScore).toBeCloseTo(0.75, 12)
    expect(agg.aWins).toBe(3)
    expect(agg.bWins).toBe(1)
    // Paired SD over [0.5, 1] is 0.3536 -> SE 0.25; the flat SD over [1,0,1,1] is 0.5 -> SE 0.25.
    expect(agg.se).toBeCloseTo(0.25, 6)
    expect(agg.varianceRatio).toBeCloseTo(1, 6)
  })
})

describe('health gate — BOT_LAB.md §4.3, RULES_US54.md §3.2', () => {
  const cell = cellList(['balanced', 'blitz'])[0]

  function gate(records: LabGameRecord[], pairs = 1) {
    const agg = aggregateCell(cell, records, pairs)
    return runHealth([agg], records, pairs, 'us54')
  }

  it('a clean pair passes', () => {
    const r0 = { ...emptyRecord(cell.id), pair: 0, orient: 0 as const, seed: 's0', aResult: 1, clinch: true }
    const r1 = { ...emptyRecord(cell.id), pair: 0, orient: 1 as const, seed: 's0', aResult: 0, clinch: true }
    expect(gate([r0, r1]).ok).toBe(true)
  })

  it('a capped game VOIDS the run and is named, never discarded', () => {
    const r0 = {
      ...emptyRecord(cell.id),
      pair: 0,
      orient: 0 as const,
      seed: 's0',
      aResult: 1,
      clinch: true,
      capped: true,
      finished: false,
      steps: 5000,
    }
    const r1 = { ...emptyRecord(cell.id), pair: 0, orient: 1 as const, seed: 's0', aResult: 0, clinch: true }
    const h = gate([r0, r1])
    expect(h.ok).toBe(false)
    expect(h.cappedGames).toBe(1)
    expect(h.capped).toEqual([
      { cell: cell.id, seed: 's0', orient: 0, startSeat: 0, steps: 5000 },
    ])
    expect(h.violations.some((v) => v.includes('cappedGames 1') && v.includes(cell.id))).toBe(true)
  })

  it('illegal actions, invariant violations, ties and voids each VOID the run', () => {
    const base = { ...emptyRecord(cell.id), pair: 0, seed: 's0', clinch: true }
    const cases: [string, Partial<LabGameRecord>][] = [
      ['illegalActions', { illegal: 1 }],
      ['invariantViolations', { invariantViolations: 1 }],
      ['ties', { aResult: 0.5 }],
      ['voids', { voids: 1 }],
      ['nonClinch', { clinch: false }],
    ]
    for (const [label, patch] of cases) {
      const h = gate([
        { ...base, orient: 0, aResult: 1, ...patch },
        { ...base, orient: 1, aResult: 0 },
      ])
      expect(h.ok, label).toBe(false)
      expect(h.violations.some((v) => v.startsWith(label)), `${label}: ${h.violations.join(' | ')}`).toBe(true)
    }
  })

  it('a repeated seed VOIDS the run — determinism is not sampling (§5.2 / §10.6)', () => {
    const dup = [
      { ...emptyRecord(cell.id), pair: 0, orient: 0 as const, seed: 'same', aResult: 1, clinch: true },
      { ...emptyRecord(cell.id), pair: 0, orient: 1 as const, seed: 'same', aResult: 0, clinch: true },
      { ...emptyRecord(cell.id), pair: 1, orient: 0 as const, seed: 'same', aResult: 1, clinch: true },
      { ...emptyRecord(cell.id), pair: 1, orient: 1 as const, seed: 'same', aResult: 0, clinch: true },
    ]
    const h = gate(dup, 2)
    expect(h.ok).toBe(false)
    expect(h.violations.some((v) => v.includes('distinctSeeds 1 != pairs 2'))).toBe(true)
  })
})

describe('reproducible from the seed set alone', () => {
  it('the records digest does not move when the worker count does', async () => {
    const cfg = config({ styles: ['balanced', 'ghost'], pairs: 3, chunkPairs: 1 })
    const one = await runLab(cfg, 1, inProcess)
    const many = await runLab(cfg, 8, inProcess)
    expect(many.meta.recordsDigest).toBe(one.meta.recordsDigest)
    expect(toJsonl(many.records)).toBe(toJsonl(one.records))
    expect(one.health.ok).toBe(true)
    expect(one.health.ties).toBe(0)
    // Canonical order is cell, then pair, then orientation — never worker-arrival order.
    expect(one.records.map((r) => `${r.pair}${r.orient}`)).toEqual(['00', '01', '10', '11', '20', '21'])
    expect(digest('')).toBe(digest(''))
    expect(digest('a')).not.toBe(digest('b'))
  })

  it('assembleRun records the config it ran, so a result can never claim a gate it skipped', () => {
    const cfg = config({ styles: ['balanced', 'blitz'], pairs: 1, chunkPairs: 1, invariantCheck: 'off' })
    const out = assembleRun(cfg, [], { wallMs: 0, workers: 4, generatedAt: 'x' })
    expect(out.meta.config.invariantCheck).toBe('off')
    expect(out.meta.clinchTarget).toBe(TARGET)
    expect(out.meta.books.length).toBe(9)
    expect(out.meta.toggles.jokers).toBe(false)
  })
})

/** A zeroed record, so each test states only the field it is about. */
function emptyRecord(cell: string): LabGameRecord {
  const zero = {
    asks: 0,
    hits: 0,
    turnsGained: 0,
    declares: 0,
    declaresCorrect: 0,
    declaresWrong: 0,
    declaresForced: 0,
    foreignDeclares: 0,
    foreignDeclaresForced: 0,
    declaresWrongForced: 0,
    setsWon: 0,
    setsGifted: 0,
    raceLosses: 0,
    clinchDenials: 0,
    clinchWins: 0,
    latencySum: 0,
    latencyCount: 0,
    declareOffers: 0,
    leakyAsks: 0,
    hoardSum: 0,
    hoardSamples: 0,
    dropoutSteps: [] as number[],
  }
  const [a, b] = cell.split('-vs-') as [StyleId, StyleId]
  return {
    cell,
    a,
    b,
    pair: 0,
    orient: 0,
    seed: 's',
    startSeat: 0,
    aTeam: 0,
    steps: 0,
    finished: true,
    capped: false,
    illegal: 0,
    invariantViolations: 0,
    setsA: 5,
    setsB: 3,
    unresolved: 1,
    voids: 0,
    endgameReached: false,
    aResult: 1,
    clinch: true,
    ca: { ...zero, dropoutSteps: [] },
    cb: { ...zero, dropoutSteps: [] },
  }
}
