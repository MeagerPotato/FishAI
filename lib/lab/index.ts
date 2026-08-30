/**
 * The duplicate-deal simulation runner — BOT_LAB.md §5 (experimental design) and §6 (pipeline
 * step 1: `run -> per-game records (JSONL)`), under the `us54` rule set of RULES_US54.md.
 *
 * Everything here is pure TypeScript with no platform import, so it lives inside
 * `tsconfig.app.json`'s `include` and is typechecked and linted like the engine. The thin
 * `node:worker_threads` launcher in `scripts/` is the only untypechecked part, by design.
 */
export type {
  CappedGame,
  CellHealth,
  CellSpec,
  InvariantCheck,
  LabCellAggregate,
  LabGameRecord,
  LabRunConfig,
  LabRunMeta,
  LabRunOutput,
  LabTask,
  LabTaskResult,
  Orientation,
  RunHealth,
  SideCounters,
  SideMetrics,
} from './types.ts'
export { LAB_SCHEMA_VERSION } from './types.ts'
export { DEFAULT_LAB_CONFIG, cellList, gamesTotal, planTasks, seedFor, seedSet, startSeatFor } from './plan.ts'
export { configFor, playGame, playGameSeats, policyFor } from './play.ts'
export type { PlayedGame, PlayOptions, SeatPlayOptions, SeatSpec } from './play.ts'
export { runTask } from './task.ts'
export { aggregateCell, runHealth } from './aggregate.ts'
export { assembleRun, defaultWorkers, digest, runLab, runPool, toJsonl } from './run.ts'
export { payoffMatrix, renderHealth, renderRun, styleSummaries } from './report.ts'
export type { StyleSummary } from './report.ts'
// --- FishAI v1.0 experiment suite (SPEC Stage 2b/2c) -----------------------------------------
export {
  DEFAULT_ADAPTIVE_CONFIG,
  MIXED_COMPOSITION_STRIDE,
  accuracyPairings,
  adaptiveGamesTotal,
  adaptiveToJsonl,
  allThreeMultisets,
  assembleAdaptiveRun,
  buildAdaptiveResults,
  mixedCellId,
  mixedCompositionList,
  mixedPooledFromRecords,
  oracleStylesFor,
  planAdaptiveTasks,
  runAdaptiveTask,
  scoreClassifier,
} from './adaptive.ts'
export type { AdaptiveArtifactInputs, AdaptiveBenchmarkInput, AdaptiveTask, MixedPooled } from './adaptive.ts'
export { ADAPTIVE_PREDICTIONS, ADAPTIVE_SCHEMA_VERSION } from './adaptive-types.ts'
// --- FishAI v1.5 experiment suite (SPEC v1.5 Phase 2) ----------------------------------------
export {
  DEFAULT_BOUNDED_CONFIG,
  EVIDENCE_AGE_BANDS,
  EVIDENCE_MIN_BAND,
  accuracyCellId,
  aggregateEvidence,
  assembleBoundedRun,
  bitsEquivalentOf,
  boundedAccuracyPairings,
  boundedGamesTotal,
  boundedPolicyLabel,
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
  tierCellId,
} from './bounded.ts'
export type { BoundedTask, DecodedEvent } from './bounded.ts'
export {
  BOUNDED_INF_BITS,
  BOUNDED_PREDICTIONS,
  BOUNDED_SCHEMA_VERSION,
  BOUNDED_TIERS,
} from './bounded-types.ts'
export type {
  AccuracyAdjacentDelta,
  BitsEquivalent,
  BoundedAccuracy,
  BoundedAccuracyCell,
  BoundedArtifactInputs,
  BoundedBaselineInput,
  BoundedExperimentId,
  BoundedGameRecord,
  BoundedHealthSummary,
  BoundedLabConfig,
  BoundedPrediction,
  BoundedPredictionId,
  BoundedResults,
  BoundedResultsMeta,
  BoundedRunMeta,
  BoundedRunOutput,
  BoundedRunSummary,
  BoundedShareCell,
  BoundedTaskResult,
  BoundedVerdict,
  CertainAskObservation,
  ClusteredDiff,
  EvidenceAgeRow,
  EvidenceCurve,
  EvidenceRate,
  EvidenceWindow,
  LadderAdjacentDelta,
  LadderCell,
  MirrorExact,
  TierCell,
} from './bounded-types.ts'
export type {
  AccuracyByStyle,
  AccuracyCheckpoint,
  AccuracyRow,
  AdaptiveBenchmark,
  AdaptiveCellAggregate,
  AdaptiveExperimentId,
  AdaptiveGameRecord,
  AdaptiveHealthSummary,
  AdaptiveLabConfig,
  AdaptivePrediction,
  AdaptiveResults,
  AdaptiveResultsMeta,
  AdaptiveRunMeta,
  AdaptiveRunOutput,
  AdaptiveTaskResult,
  AdaptiveVerdict,
  ClassifierResult,
  CounterTableProvenance,
  FingerprintProvenanceSummary,
  GauntletCell,
  GauntletRow,
  MirrorResult,
  MixedResult,
  MixedRow,
  OracleRow,
  PredictionId,
  StyleUsageRow,
  UsageCounts,
  VerdictValue,
} from './adaptive-types.ts'
