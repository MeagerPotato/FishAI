/**
 * The analysis pipeline — BOT_LAB.md §6 steps 2-4, under the `us54` rule set.
 *
 * Reads what the runner in [../index.ts](../index.ts) produced and emits the site's only input,
 * `src/lab/data/style-results.json` (SITE_SPEC.md §5). Pure TypeScript with no platform import,
 * so it is inside `tsconfig.app.json`'s `include` and is typechecked and linted like the engine —
 * including the SHA-256 in [sha256.ts](sha256.ts), which exists precisely so `meta.rulesHash` can
 * be recomputed by the *site* as well as by the emitter.
 */
export { cloneMatrix, frobeniusSq, invert, matVec, solveLinear } from './linalg.ts'
export type { Matrix } from './linalg.ts'
export {
  benjaminiHochberg,
  bootstrapCi,
  erfc,
  mean,
  normalCdf,
  normalCi95,
  percentileSorted,
  scoreP,
  sprtBounds,
  sprtLlr,
  sprtVerdict,
  twoSidedP,
  variance,
} from './stats.ts'
export type { BhResult, BootstrapCi, SprtBounds, SprtVerdict } from './stats.ts'
export { rulesHash, sha256, sha256Bytes } from './sha256.ts'
export { antisymmetryErrorOf, buildPayoff, maximins, meanScores } from './matrix.ts'
export type { Maximin, PayoffMatrix } from './matrix.ts'
export { findCycles, hodgeDecompose } from './hodge.ts'
export type { Cycle3, HodgeDecomposition } from './hodge.ts'
export { maxentNash } from './nash.ts'
export type { NashOptions, NashResult } from './nash.ts'
export { alphaRank, fixationProbability, stationaryDistribution, transitionMatrix } from './alpharank.ts'
export type { AlphaRankOptions, AlphaRankResult } from './alpharank.ts'
export { bradleyTerry } from './bradleyTerry.ts'
export type { BradleyTerryResult } from './bradleyTerry.ts'
export { bootstrapCell, BOOTSTRAP_METRICS } from './bootstrap.ts'
export type { BootstrapMetric, CellBootstrap, SideBootstrap } from './bootstrap.ts'
export {
  DEFAULT_EXPLOIT_CONFIG,
  KNOB_LADDER,
  playPairs,
  searchBestResponse,
  searchExploitability,
  skippedExploitability,
} from './exploit.ts'
export type { ExploitabilityEntry, ExploitMove, ExploitSearchConfig, KnobCandidate } from './exploit.ts'
export { decideVerdict } from './verdict.ts'
export type { Criterion, Verdict, VerdictInput, VerdictResult } from './verdict.ts'
export { analyze, buildStyleResults } from './analyze.ts'
export type { Analysis, AnalyzeInput, AnalyzeOptions } from './analyze.ts'
export { renderAnalysis } from './report.ts'
export { RESULTS_SCHEMA_VERSION } from './types.ts'
export type {
  AlphaRankEntry,
  AnalysisMeta,
  EloEntry,
  ExploitabilityPublic,
  MatrixCell,
  MaximinEntry,
  NashEntry,
  Ranking,
  RankingEntry,
  ResultsMeta,
  SideMetricsWithCi,
  StyleEntry,
  StyleResults,
} from './types.ts'
