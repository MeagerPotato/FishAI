/**
 * Public surface of the deterministic inference bots (SPEC.md §5, Phase 3).
 * Pure TypeScript over the public SeatView only — no GameState ever enters
 * this module (enforced by tests/bots/public-view.test.ts).
 */
export type {
  SeatView,
  AskWeights,
  BotDifficulty,
  Knowledge,
  KnowledgeConstraint,
  KnowledgeOptions,
  RankedAsk,
} from './types.ts'
export type { StyleId } from './roster.ts'
export { STYLE_ROSTER, STYLE_IDS, rosterStyles } from './roster.ts'
export type {
  StyleParams,
  StyleFamily,
  SkillParams,
  BotPolicy,
} from './style.ts'
export {
  BASELINE_ASK_WEIGHTS,
  POLICY_CONSTANTS,
  SKILL_PRESETS,
  STYLE_PRESETS,
  resolvePolicy,
  validateStyle,
} from './style.ts'
export {
  buildKnowledge,
  holderOf,
  candidates,
  certainCards,
  rankAsks,
  rankAsksWith,
  unaskableBooks,
  foreignProvableBooks,
  askHitProbability,
  refinedHitProbability,
  pc,
} from './knowledge.ts'
export type { ContainedPassPlan, PassValuation } from './contained.ts'
export {
  containedBooks,
  containedPassCard,
  firstUseInfoCost,
  planContainedPass,
  valueContainedPass,
} from './contained.ts'
export { decide, decideExplained } from './decide.ts'
export type { DecisionTrace, ExplainedDecision } from './decide.ts'
// --- FishAI v1.0: observation, classification, adaptive selection ----------------------------
export { FEATURE_KEYS, featureVector, observeSeats, replayedCounts } from './observe.ts'
export type { FeatureKey, SeatObservation } from './observe.ts'
export { checkpointBucket, classifySeat, classifySeats } from './classify.ts'
export type { SeatClassification, StyleFingerprint } from './classify.ts'
export { FINGERPRINTS, FINGERPRINT_BUCKET_IDS } from './data/fingerprints.ts'
export type { FingerprintBucketId, FingerprintStats, FingerprintTable } from './data/fingerprints.ts'
export { COUNTER_TABLE } from './data/counter-table.ts'
export type { CounterTable } from './data/counter-table.ts'
export { ADAPTIVE_DEFAULTS, ADAPTIVE_PHASE_EVENTS, chooseStyle, isAdaptiveSpec } from './adaptive.ts'
export type { AdaptiveChoice, AdaptiveSpec } from './adaptive.ts'
// `PolicySpec` is re-exported from adaptive.ts, where the union is widened with `AdaptiveSpec`
// — the acyclic arrangement documented in that file's header. Everything importing the barrel
// gets the full four-shape union.
export type { PolicySpec } from './adaptive.ts'
