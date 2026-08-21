/**
 * bootstrap.ts — the nonparametric bootstrap **over duplicate pairs**, for the diagnostic ratios
 * that are not simple means.
 *
 * BOT_LAB.md §5.6:
 *
 * > CIs on paired score rate: normal-approximation on the paired means (n >= 500 makes this
 * > safe), with a **bootstrap over pairs** as the cross-check for the diagnostic ratios (claim
 * > precision etc., which are not simple means).
 *
 * ## Why the ratios need it and the score rate does not
 *
 * The score rate is an average of one bounded number per pair, so the CLT applies to it directly
 * and the normal interval in `aggregateCell` is exactly right. `claimPrecision` is
 * `sum(correct) / sum(attempts)` pooled over the whole cell — a **ratio of two random sums**,
 * whose denominator varies from pair to pair (a game can contain three declares or eight). No
 * closed-form SE for that is worth trusting, and the naive alternative — averaging the per-game
 * ratios — is a different and worse estimator, because it weights a game with 3 declares the same
 * as one with 8 and is undefined for a game with none.
 *
 * So: resample **pairs** with replacement, re-form the ratio from the resampled sums, repeat, and
 * take percentiles. The resampling unit is the *pair*, never the game, because the two games of a
 * pair are the same deal and are not independent — that dependence is the whole point of the
 * §5.1 design and destroying it in the bootstrap would understate every interval.
 *
 * The score rate is bootstrapped too, not because it needs it but as a **cross-check on the
 * normal interval**: if the two disagree materially, the normal approximation is the thing that
 * is wrong, and the artifact carries both so a reader can see that for themselves.
 *
 * ## Determinism
 *
 * The resampling RNG is the engine's own seeded `mulberry32`, keyed by the cell id and the run's
 * bootstrap seed. Two runs of the analysis over the same records produce the same intervals to
 * the last bit; a bootstrap that moved between runs would make the artifact's digest meaningless.
 */
import { rngFromSeed } from '../../engine/index.ts'
import type { LabGameRecord, SideCounters } from '../types.ts'
import { bootstrapCi } from './stats.ts'
import type { BootstrapCi } from './stats.ts'

/** The ratio diagnostics that get an interval. Keys match `SideMetrics` exactly. */
export const BOOTSTRAP_METRICS = [
  'askHitRate',
  'turnRetention',
  'claimPrecision',
  'claimYield',
  'concedeRate',
  'concedeRateChosen',
  'foreignDeclareRate',
  'foreignDeclareRateChosen',
  'declareLatency',
  'leakIndex',
  'hoardIndex',
  'forcedDeclareRate',
] as const

export type BootstrapMetric = (typeof BOOTSTRAP_METRICS)[number]

export interface SideBootstrap {
  metrics: Record<BootstrapMetric, BootstrapCi>
}

export interface CellBootstrap {
  cell: string
  pairs: number
  samples: number
  /** Cross-check on the normal CI of the paired score rate. */
  aScore: BootstrapCi
  a: SideBootstrap
  b: SideBootstrap
}

/** The counter fields a ratio can be built from, flattened for fast resampling. */
const FIELDS = [
  'asks',
  'hits',
  'turnsGained',
  'declares',
  'declaresCorrect',
  'declaresWrong',
  'declaresForced',
  'foreignDeclares',
  'foreignDeclaresForced',
  'declaresWrongForced',
  'latencySum',
  'latencyCount',
  'leakyAsks',
  'hoardSum',
  'hoardSamples',
] as const

const WIDTH = FIELDS.length

function rate(num: number, den: number): number {
  return den === 0 ? 0 : num / den
}

/** Form the twelve ratios from one side's summed counters. Must mirror `aggregate.ts:sideMetrics`. */
function ratios(s: Float64Array, off: number): Record<BootstrapMetric, number> {
  const g = (k: (typeof FIELDS)[number]): number => s[off + FIELDS.indexOf(k)]
  const declares = g('declares')
  const chosen = declares - g('declaresForced')
  const precision = rate(g('declaresCorrect'), declares)
  return {
    askHitRate: rate(g('hits'), g('asks')),
    turnRetention: rate(g('asks'), g('turnsGained')),
    claimPrecision: precision,
    claimYield: precision,
    concedeRate: rate(g('declaresWrong'), declares),
    concedeRateChosen: rate(g('declaresWrong') - g('declaresWrongForced'), chosen),
    foreignDeclareRate: rate(g('foreignDeclares'), declares),
    foreignDeclareRateChosen: rate(g('foreignDeclares') - g('foreignDeclaresForced'), chosen),
    declareLatency: rate(g('latencySum'), g('latencyCount')),
    leakIndex: rate(g('leakyAsks'), g('asks')),
    hoardIndex: rate(g('hoardSum'), g('hoardSamples')),
    forcedDeclareRate: rate(g('declaresForced'), declares),
  }
}

function addSide(into: Float64Array, off: number, c: SideCounters): void {
  for (let f = 0; f < WIDTH; f++) into[off + f] += c[FIELDS[f]]
}

/**
 * Bootstrap one cell's diagnostics.
 *
 * @param records every game of the cell (both orientations of every pair).
 * @param samples bootstrap replicates. 1,000 is the default: the 2.5%/97.5% percentiles of 1,000
 *                replicates are stable to about the third decimal, which is finer than any
 *                diagnostic here is reported to.
 */
export function bootstrapCell(
  cellId: string,
  records: readonly LabGameRecord[],
  samples = 1000,
  seed = 'lab-bootstrap-v1',
): CellBootstrap {
  // Fold the games into per-pair rows: [side a fields..., side b fields..., pair score].
  const byPair = new Map<number, { a: Float64Array; b: Float64Array; score: number; games: number }>()
  for (const r of records) {
    let slot = byPair.get(r.pair)
    if (slot === undefined) {
      slot = { a: new Float64Array(WIDTH), b: new Float64Array(WIDTH), score: 0, games: 0 }
      byPair.set(r.pair, slot)
    }
    addSide(slot.a, 0, r.ca)
    addSide(slot.b, 0, r.cb)
    slot.score += r.aResult
    slot.games++
  }

  const pairKeys = [...byPair.keys()].sort((x, y) => x - y)
  const nPairs = pairKeys.length
  const flat = new Float64Array(nPairs * WIDTH * 2)
  const scores = new Float64Array(nPairs)
  pairKeys.forEach((k, i) => {
    const slot = byPair.get(k)
    if (!slot) return
    flat.set(slot.a, i * WIDTH * 2)
    flat.set(slot.b, i * WIDTH * 2 + WIDTH)
    scores[i] = slot.games === 0 ? 0 : slot.score / slot.games
  })

  const sums = new Float64Array(WIDTH * 2)
  const accumulate = (indices: Int32Array | number[]): { a: Record<BootstrapMetric, number>; b: Record<BootstrapMetric, number>; score: number } => {
    sums.fill(0)
    let sc = 0
    for (const i of indices) {
      const base = i * WIDTH * 2
      for (let f = 0; f < WIDTH * 2; f++) sums[f] += flat[base + f]
      sc += scores[i]
    }
    return { a: ratios(sums, 0), b: ratios(sums, WIDTH), score: indices.length === 0 ? 0 : sc / indices.length }
  }

  const all = Array.from({ length: nPairs }, (_, i) => i)
  const point = accumulate(all)

  const rng = rngFromSeed(`${seed}|${cellId}|${nPairs}|${samples}`)
  const draw = new Int32Array(nPairs)
  const repA: Record<BootstrapMetric, number[]> = Object.fromEntries(
    BOOTSTRAP_METRICS.map((m) => [m, [] as number[]]),
  ) as Record<BootstrapMetric, number[]>
  const repB: Record<BootstrapMetric, number[]> = Object.fromEntries(
    BOOTSTRAP_METRICS.map((m) => [m, [] as number[]]),
  ) as Record<BootstrapMetric, number[]>
  const repScore: number[] = []

  for (let s = 0; s < samples && nPairs > 0; s++) {
    for (let i = 0; i < nPairs; i++) draw[i] = Math.min(nPairs - 1, Math.floor(rng() * nPairs))
    const r = accumulate(draw)
    for (const m of BOOTSTRAP_METRICS) {
      repA[m].push(r.a[m])
      repB[m].push(r.b[m])
    }
    repScore.push(r.score)
  }

  const fold = (
    est: Record<BootstrapMetric, number>,
    reps: Record<BootstrapMetric, number[]>,
  ): SideBootstrap => ({
    metrics: Object.fromEntries(
      BOOTSTRAP_METRICS.map((m) => [m, bootstrapCi(est[m], reps[m], samples)]),
    ) as Record<BootstrapMetric, BootstrapCi>,
  })

  return {
    cell: cellId,
    pairs: nPairs,
    samples,
    aScore: bootstrapCi(point.score, repScore, samples),
    a: fold(point.a, repA),
    b: fold(point.b, repB),
  }
}
