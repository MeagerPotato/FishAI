/**
 * adaptive-types.ts — the data contract of the Bass v1.0 experiment suite (SPEC Stage 2b/2c;
 * BOT_LAB.md §4-6 for the measurement discipline; [adaptive.ts](adaptive.ts) for the machinery
 * that fills these shapes).
 *
 * Everything here is **plain data** — structured-cloneable across a `worker_threads` boundary
 * and JSON-serialisable without a replacer — for exactly the reason [types.ts](types.ts) gives:
 * `scripts/` is linted but never typechecked, so every substantial shape must live where `tsc`
 * can see it. The site's boundary validator (`src/lab/adaptive-artifact.ts`) re-derives its
 * types from this file, so the emitter and the reader cannot drift apart silently.
 *
 * ## The four pre-registered predictions this suite tests
 *
 * These are written down HERE, before the run, because the committed counter table already
 * implies all four — the experiments exist to check the implication against play, not to
 * discover it. Punter's row weakly dominates every column of the measured matrix
 * (`lib/engine/bots/data/counter-table.ts`), and the adaptive expectation is linear in the
 * opponent posterior, so a warm adaptive team provably delegates to Punter under every belief:
 *
 *  - **P1** — the adaptive gauntlet should match punter's matrix-v2 row against every pure
 *    style within CI. (The one real degree of freedom is the warmup: the anchor plays Balanced
 *    for the first ~60 observed events, and Balanced scores below Punter everywhere, so any
 *    detectable shortfall is the measured price of warming up.)
 *  - **P2** — the adaptive-vs-punter mixed-population delta should be ≈ 0: both teams
 *    best-respond to every composition with the same style once warm.
 *  - **P3** — oracle classification should add ≈ nothing: the best response is Punter
 *    regardless of the read, so a perfect read and a classifier read select the same play.
 *  - **P4** — classifier top-1 accuracy should be good for turtle/ghost/hoarder and heavily
 *    confused inside the balanced/blitz/punter/banker quadrangle (the Stage-1B separability
 *    read: those four diverge from Balanced on under 1.3% of decisions — STYLES.md §6.1 — so
 *    a public log carries little to tell them apart).
 *
 * Honest measurement either confirms or refutes; nothing in the suite is tuned toward a
 * prediction, and a refuted prediction is emitted as `refuted`, not massaged.
 *
 * ## Provenance discipline
 *
 * The artifact's `meta` carries the same provenance the style artifact does (generatedAt,
 * engineCommit, rulesHash, config, recordsDigest, health) **plus** the provenance of the two
 * committed calibrations the adaptive engine plays from — the counter table and the
 * fingerprints — because an adaptive result is only as honest as the data it consulted, and
 * the benchmark block that names exactly which matrix-v2 artifact the gauntlet is read
 * against. `benchmark.paired` states whether the gauntlet reused matrix v2's exact seed list;
 * when it did, every deal behind the benchmark was replayed by the adaptive team and the
 * comparison is per-deal — though *cross-run*: the two runs' per-game records are not joined,
 * so the delta's SE is the conservative independent combination, an upper bound on the true
 * paired SE (shared deals correlate the two means positively).
 */
import type { Seat, StyleId, Team, Variant } from '../engine/index.ts'
import type { CappedGame, CellHealth, InvariantCheck, Orientation, SideCounters, SideMetrics } from './types.ts'

/** Bump when the emitted JSON shape changes in a way a reader must notice. */
export const ADAPTIVE_SCHEMA_VERSION = 1

/* -- predictions --------------------------------------------------------------------------- */

export type PredictionId = 'P1' | 'P2' | 'P3' | 'P4'

export interface AdaptivePrediction {
  id: PredictionId
  text: string
}

/** The pre-registered predictions, verbatim — written into `meta` and tested by the verdicts. */
export const ADAPTIVE_PREDICTIONS: readonly AdaptivePrediction[] = [
  {
    id: 'P1',
    text:
      "The counter table's punter row weakly dominates every column, so a warm adaptive team " +
      "should match punter's matrix-v2 row against every pure style within CI. Any detectable " +
      'shortfall is the price of the warmup anchor (Balanced until ~60 observed events).',
  },
  {
    id: 'P2',
    text:
      'The adaptive-vs-punter mixed-population delta should be ≈ 0: both teams best-respond ' +
      'to every composition with the same style once warm, so adaptation buys nothing a fixed ' +
      'punter team does not already have.',
  },
  {
    id: 'P3',
    text:
      'Oracle classification should add ≈ nothing: the best response is punter regardless of ' +
      'the read, so a perfect read and a classifier read select the same play.',
  },
  {
    id: 'P4',
    text:
      'Classifier top-1 accuracy should be good for turtle, ghost and hoarder, and heavily ' +
      'confused inside the balanced/blitz/punter/banker quadrangle (the Stage-1B separability ' +
      'read: those four diverge from Balanced on under 1.3% of decisions).',
  },
]

export type VerdictValue = 'confirmed' | 'refuted' | 'mixed'

export interface AdaptiveVerdict {
  id: PredictionId
  prediction: string
  verdict: VerdictValue
  /** The numbers the verdict was computed from, in prose. Never a bare pass/fail. */
  detail: string
}

/* -- run configuration --------------------------------------------------------------------- */

export interface AdaptiveLabConfig {
  /** Gauntlet pairs per opponent cell. 4300 matches matrix v2 exactly — the paired benchmark. */
  gauntletPairs: number
  /** Must be matrix v2's `style-v1` for the benchmark to be per-deal. */
  gauntletSeedPrefix: string
  /** Adaptive-mirror pairs — a symmetry health check, expected exactly 0.5. */
  mirrorPairs: number
  /** Pairs per composition per arm in the mixed screen. */
  mixedPairs: number
  mixedSeedPrefix: string
  /** How many of the 24 stride-7 compositions to run (24 for the full screen; fewer in tests). */
  mixedCompositions: number
  /** Oracle-ablation pairs per opponent cell; must be <= gauntletPairs (paired against it). */
  oraclePairs: number
  /** Single games per style pairing in the classifier-accuracy experiment. */
  accGames: number
  accSeedPrefix: string
  /** Log-truncation checkpoints (events); the end-of-game checkpoint (0) is always added. */
  accCheckpoints: readonly number[]
  chunkPairs: number
  variant: Variant
  stepCap: number
  invariantCheck: InvariantCheck
}

/* -- per-game records ---------------------------------------------------------------------- */

export type AdaptiveExperimentId = 'gauntlet' | 'mirror' | 'mixed' | 'oracle' | 'accuracy'

/** One classifier read of one game at one truncation. `events: 0` marks the full log. */
export interface AccuracyCheckpoint {
  events: number
  /** classifySeats top-1 per seat 0..5. */
  top: readonly StyleId[]
}

/** Adaptive delegation counts for one game's adaptive seats, in STYLE_IDS order. */
export interface UsageCounts {
  warmup: readonly number[]
  warm: readonly number[]
}

/**
 * One played game of any experiment — the JSONL line. The core fields mirror
 * `LabGameRecord`; the optional tails are per-experiment: gauntlet games carry counters and
 * delegation usage, accuracy games carry classifier checkpoints, mixed games carry their arm
 * and composition. `a` is always the measured side (the adaptive team; the punter team in the
 * mixed screen's punter arm; the `pairing[0]` style in accuracy games).
 */
export interface AdaptiveGameRecord {
  exp: AdaptiveExperimentId
  cell: string
  pair: number
  orient: Orientation
  seed: string
  startSeat: Seat
  /** The team the measured side played — `orient` 0 seats it on team 0. */
  aTeam: Team
  steps: number
  finished: boolean
  capped: boolean
  illegal: number
  invariantViolations: number
  setsA: number
  setsB: number
  unresolved: number
  voids: number
  aResult: number
  clinch: boolean
  tie: boolean
  /** Gauntlet/oracle: the pure style on the other team. */
  opponent?: StyleId
  /** Mixed: which measured team this arm fielded. */
  arm?: 'adaptive' | 'punter'
  /** Mixed: the opposing 3-multiset, ascending style-id order. */
  composition?: readonly StyleId[]
  /** Accuracy: the two pure teams, `pairing[0]` on team 0. */
  pairing?: readonly [StyleId, StyleId]
  /** Gauntlet: the adaptive team's counters (re-indexed so `ca` is always the adaptive side). */
  ca?: SideCounters
  cb?: SideCounters
  usage?: UsageCounts
  cls?: readonly AccuracyCheckpoint[]
}

export interface AdaptiveTaskResult {
  taskIndex: number
  records: AdaptiveGameRecord[]
  wallMs: number
}

/* -- aggregates ---------------------------------------------------------------------------- */

/** The paired estimator over one experiment cell — the §5.1 arithmetic of aggregate.ts. */
export interface AdaptiveCellAggregate {
  id: string
  pairs: number
  games: number
  distinctSeeds: number
  score: number
  se: number
  ci95: [number, number]
  seUnpaired: number
  aWins: number
  bWins: number
  ties: number
  avgMoves: number
  maxMoves: number
  health: CellHealth
}

export interface GauntletCell extends AdaptiveCellAggregate {
  opponent: StyleId
  metrics: { a: SideMetrics; b: SideMetrics }
}

export interface MirrorResult {
  pairs: number
  games: number
  score: number
  se: number
}

export interface MixedRow {
  composition: readonly StyleId[]
  pairs: number
  adaptive: number
  punter: number
  delta: number
  deltaSe: number
}

export interface MixedResult {
  compositions: number
  pairsPer: number
  /** Pooled means over every (composition, pair) — each pair weighs equally by design. */
  adaptiveMean: number
  punterMean: number
  /** The headline: mean per-deal delta (adaptive − punter), truly paired within this run. */
  pairedDelta: number
  /**
   * SE of `pairedDelta`, clustered by seed: every composition replays the identical seed
   * list, so the per-deal deltas at one seed share the deal and are not independent — they
   * are averaged within seed first and the SE is sd(seed-level deltas)/sqrt(seeds). A naive
   * pooled SE over all composition × pair deltas would count each deal's replays as
   * independent evidence and understate the interval. Per-composition row SEs in `rows` are
   * within-composition and unaffected.
   */
  deltaSe: number
  ci95: [number, number]
  rows: MixedRow[]
}

export interface OracleRow {
  opponent: StyleId
  pairs: number
  /** Classifier-mode score over the same seeds — the gauntlet's first `pairs` pairs. */
  classifier: number
  oracle: number
  /** oracle − classifier, per-deal paired within this run. */
  delta: number
  se: number
  ci95: [number, number]
}

export interface AccuracyByStyle {
  seats: number
  top1: number
}

export interface AccuracyRow {
  /** Truncation in events; 0 = end of game. */
  events: number
  seats: number
  top1: number
  byStyle: Record<StyleId, AccuracyByStyle>
}

export interface ClassifierResult {
  /** The checkpoint list, end-of-game last as 0. */
  checkpoints: number[]
  /** One row per checkpoint that scored at least one seat — never a `top1: 0` for no data. */
  accuracy: AccuracyRow[]
  /**
   * Checkpoints that scored zero seats (no game's public log outlived them). Named here
   * rather than encoded as a measured zero in `accuracy` — a recorded-nothing is not a 0.
   */
  deadCheckpoints: number[]
  /** End-of-game confusion counts, `matrix[true][predicted]`, styles in STYLE_IDS order. */
  confusion: { events: number; styles: StyleId[]; matrix: number[][] }
}

export interface StyleUsageRow {
  opponent: StyleId
  decisions: { warmup: number; warm: number }
  /** Share of that phase's adaptive decisions delegated to each style; zero decisions → 0s. */
  warmupShares: Record<StyleId, number>
  warmShares: Record<StyleId, number>
}

/* -- run output and health ----------------------------------------------------------------- */

export interface AdaptiveHealthSummary {
  ok: boolean
  illegalActions: number
  cappedGames: number
  invariantViolations: number
  ties: number
  voids: number
  nonClinch: number
  /** Every capped game, individually — named, never dropped (RULES_US54.md §3.2). */
  capped: CappedGame[]
  violations: string[]
}

export interface AdaptiveRunMeta {
  schemaVersion: number
  generatedAt: string
  config: AdaptiveLabConfig
  gamesTotal: number
  movesTotal: number
  workers: number
  wallMs: number
  gamesPerSecond: number
  recordsDigest: string
}

/** What `assembleAdaptiveRun` returns and the launcher writes out. */
export interface AdaptiveRunOutput {
  meta: AdaptiveRunMeta
  health: AdaptiveHealthSummary
  gauntlet: GauntletCell[]
  mirror: MirrorResult
  mixed: MixedResult
  oracle: OracleRow[]
  classifier: ClassifierResult
  styleUsage: StyleUsageRow[]
  /** Canonical order: experiment, cell, arm, pair, orientation. Never worker-arrival order. */
  records: AdaptiveGameRecord[]
}

/* -- the published artifact ---------------------------------------------------------------- */

export interface AdaptiveBenchmark {
  /** Which committed artifact the punter row was read from. */
  artifact: string
  recordsDigest: string
  seedPrefix: string
  pairsPerCell: number
  /**
   * True iff the gauntlet replayed the benchmark's exact seed list (prefix AND pair count),
   * making the comparison per-deal. The pairing is still cross-run — see the file header.
   */
  paired: boolean
  note: string
}

export interface GauntletRow extends GauntletCell {
  /** Punter's duplicate-averaged score against this opponent, from the benchmark artifact. */
  punterBenchmark: number
  punterBenchmarkSe: number
  /** score − punterBenchmark: the P1 statistic. */
  delta: number
  /** sqrt(se² + benchmarkSe²) — conservative under shared deals (file header). */
  deltaSe: number
}

export interface CounterTableProvenance {
  artifact: string
  recordsDigest: string
  engineCommit: string
  generatedAt: string
  pairsPerCell: number
}

export interface FingerprintProvenanceSummary {
  generatedAt: string
  command: string
  gamesPerStyle: number
  seedPrefix: string
  variant: string
  stepCap: number
}

export interface AdaptiveResultsMeta {
  schemaVersion: number
  generatedAt: string
  engineCommit: string
  rulesHash: string
  rulesFile: string
  ruleSet: 'us54'
  config: AdaptiveLabConfig
  gamesTotal: number
  seedSet: { prefix: string; count: number }
  wallMs: number
  recordsDigest: string
  health: AdaptiveHealthSummary
  benchmark: AdaptiveBenchmark
  counterTableProvenance: CounterTableProvenance
  fingerprintProvenance: FingerprintProvenanceSummary
  predictions: AdaptivePrediction[]
}

/** The one artifact `/lab/adaptive` reads — `src/lab/data/adaptive-results.json`. */
export interface AdaptiveResults {
  meta: AdaptiveResultsMeta
  gauntlet: GauntletRow[]
  mirror: MirrorResult
  mixed: MixedResult
  oracle: OracleRow[]
  classifier: ClassifierResult
  styleUsage: StyleUsageRow[]
  verdicts: AdaptiveVerdict[]
}
