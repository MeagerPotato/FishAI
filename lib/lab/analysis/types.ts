/**
 * types.ts — the published artifact's shape: BOT_LAB.md §7.1's `style-results.json` with the two
 * `us54` deltas SITE_SPEC.md §5 pins.
 *
 * - **`voidRate` -> `concedeRate`.** RULES_US54.md row 14 abolishes the void, so the "burn"
 *   metric is replaced by a "gift" metric. SITE_SPEC.md §5: *"This is not a rename — it measures
 *   a different event, and pre-/post-decision matrices are **not** comparable."* There is no
 *   `voidRate` field anywhere below; a reader that looks for one is looking at the wrong rule set.
 * - **`ties` is retained and is always 0.** Arithmetically impossible under `us54`
 *   (RULES_US54.md §5). It is emitted so the schema is stable across variants, and the runner's
 *   health gate *asserts* it rather than the site rendering a column that can never populate.
 *
 * This file is types only — every value in it is produced by [results.ts](results.ts) and is
 * plain JSON: no `undefined` in an emitted position, no `NaN`, no class instances.
 */
import type { BookId, StyleFamily, StyleId, StyleParams } from '../../engine/index.ts'
import type { LabRunConfig, RunHealth } from '../types.ts'
import type { Cycle3 } from './hodge.ts'
import type { BootstrapMetric, CellBootstrap } from './bootstrap.ts'
import type { BootstrapCi } from './stats.ts'
import type { Criterion, Verdict } from './verdict.ts'

/** Bump when a consumer must notice a shape change. */
export const RESULTS_SCHEMA_VERSION = 1

export interface ResultsMeta {
  schemaVersion: number
  generatedAt: string
  /** Provenance: which engine produced this (BOT_LAB.md §7.1). */
  engineCommit: string
  /**
   * SHA-256 of the pinned rule document. SITE_SPEC.md §1.1: the site must refuse to render
   * results whose hash does not match the shipped file.
   */
  rulesHash: string
  /** Which file `rulesHash` was taken over — `us54` results are not `pagat48` results. */
  rulesFile: string
  variant: string
  config: LabRunConfig & { toggles: Record<string, boolean>; books: readonly BookId[]; clinchTarget: number }
  gamesTotal: number
  seedSet: { count: number; prefix: string }
  wallMs: number
  /** The runner's reproducibility digest, carried through so a result names the run it came from. */
  recordsDigest: string
  health: RunHealth
  analysis: AnalysisMeta
}

export interface AnalysisMeta {
  /** FDR level for the Benjamini-Hochberg correction across all cells. */
  alpha: number
  /** How many cells survived BH. */
  significantCells: number
  cells: number
  /** BOT_LAB.md §4.4 criterion 3's threshold. */
  cyclicThreshold: number
  bootstrapSamples: number
  bootstrapSeed: string
  /** False when the per-game JSONL was not supplied, so the ratio CIs are absent. */
  bootstrapRan: boolean
  nash: { residual: number; entropy: number; tau: number; converged: boolean }
  alphaRank: {
    alpha: number
    populationSize: number
    residual: number
    converged: boolean
    /**
     * True when the evolutionary process has a single sink. The remaining styles' scores are then
     * of the order of the irreducibility perturbation and their ORDER IS NOT A RANKING — see
     * `AlphaRankResult.concentrated`.
     */
    concentrated: boolean
    /** Every alpha the sweep evaluated, so the concentration is visible rather than asserted. */
    sweep: { alpha: number; scores: number[] }[]
  }
  bradleyTerry: { iterations: number; converged: boolean; meanAbsResidual: number }
  hodge: { totalEnergy: number; transitiveEnergy: number; orthogonalityError: number }
  /** Largest `|P[i][j] + P[j][i] - 1|`. Asserted below 1e-12 by `buildPayoff`. */
  antisymmetryError: number
  /** Styles excluded from the exploitability search (BOT_LAB.md §5.8). */
  holdout: readonly StyleId[]
  exploitabilityRan: boolean
}

export interface StyleEntry {
  id: StyleId
  label: string
  family: StyleFamily
  thesis: string
  params: StyleParams
  /** True when the style is in the declared holdout roster and was never a tuning target. */
  holdout: boolean
}

/** Per-side diagnostics with their bootstrap intervals attached where one was computed. */
export interface SideMetricsWithCi {
  askHitRate: number
  turnRetention: number
  claimPrecision: number
  claimYield: number
  concedeRate: number
  concedeRateChosen: number
  foreignDeclareRate: number
  foreignDeclareRateChosen: number
  declareLatency: number
  raceLossesPerGame: number
  clinchDenialsPerGame: number
  leakIndex: number
  hoardIndex: number
  giftsPerGame: number
  setsPerGame: number
  declaresPerGame: number
  forcedDeclareRate: number
  dropoutStep: number
  dropoutRate: number
  avgMoves: number
  /** Percentile-bootstrap intervals over pairs, for the ratios that are not simple means. */
  ci95: Partial<Record<BootstrapMetric, [number, number]>>
}

export interface MatrixCell {
  a: StyleId
  b: StyleId
  pairs: number
  games: number
  distinctSeeds: number
  aScore: number
  se: number
  ci95: [number, number]
  /** SE the same games would have given unpaired, and the ratio — BOT_LAB.md §5.1's 1.36x, measured. */
  seUnpaired: number
  varianceRatio: number
  aWins: number
  bWins: number
  /** SITE_SPEC.md §5: retained in the schema, always 0 under `us54`. */
  ties: number
  /** STYLES.md §4: the clinch compresses margins, so `setsAtClinch` and `unresolved` go with it. */
  bookMargin: number
  setsAtClinch: [number, number]
  unresolved: number
  avgMoves: number
  maxMoves: number
  endgameIncidence: number
  pValue: number
  qValue: number
  significant: boolean
  /** Bootstrap cross-check on `aScore`. Absent when the per-game records were not supplied. */
  aScoreBootCi95?: [number, number]
  metrics: { a: SideMetricsWithCi; b: SideMetricsWithCi }
}

export interface RankingEntry {
  style: StyleId
  value: number
  ci95?: [number, number]
}

export interface MaximinEntry {
  style: StyleId
  value: number
  worstVs: StyleId | null
  /** Lower bound of the worst cell's CI — what criterion 2 is actually tested on. */
  lower95: number
  significant: boolean
}

export interface EloEntry {
  style: StyleId
  elo: number
  se: number
  ci95: [number, number]
}

export interface NashEntry {
  style: StyleId
  weight: number
}

export interface AlphaRankEntry {
  style: StyleId
  score: number
  rank: number
}

export interface Ranking {
  meanScore: RankingEntry[]
  maximin: MaximinEntry[]
  bradleyTerry: EloEntry[]
  nash: NashEntry[]
  alphaRank: AlphaRankEntry[]
  /** The Hodge rating — the transitive part's own scale, in score-rate units. */
  hodgeRating: RankingEntry[]
  cyclicEnergy: number
  /** Significant 3-cycles only. `cyclesAll` counts every directed 3-cycle, significant or not. */
  cycles: Cycle3[]
  cyclesAll: number
  verdict: Verdict
  criteria: Criterion[]
  verdictSummary: string
}

export interface ExploitabilityPublic {
  style: StyleId
  searched: boolean
  skippedReason?: string
  bestResponseParams: StyleParams
  acceptedMoves: string[]
  /** Score of the best response on the fresh fixed-N block. */
  score: number
  se: number
  ci95: [number, number]
  /** `E(i) = score - 0.5`. */
  gap: number
  /** The search's own (upward-biased) score, kept next to `score` so the bias is visible. */
  searchScore: number
  searchGames: number
  evalGames: number
  candidatesTried: number
  /** Candidates whose games were byte-identical to the incumbent's: knobs inert at this style. */
  inertCandidates: number
  /**
   * The smallest per-move improvement the search could have accepted. `E(i)` is a maximum over a
   * search, so a small `E(i)` means nothing without this number next to it.
   */
  detectableDelta: number
  pairedVariance: number
  mirrorBaselineExact: boolean
}

/** The artifact. BOT_LAB.md §7.1: *"the site's only input"*. */
export interface StyleResults {
  meta: ResultsMeta
  styles: StyleEntry[]
  matrix: MatrixCell[]
  ranking: Ranking
  exploitability: ExploitabilityPublic[]
  /** BOT_LAB.md §5.3 Tier-2 mixed teams — phase S5, empty here. */
  teams: never[]
  /** BOT_LAB.md §8 cross-play — phase S7, empty here. */
  crossplay: never[]
  /** BOT_LAB.md §7.1 replays — a site concern, empty here. */
  replays: never[]
}

export type { BootstrapCi, CellBootstrap }
