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
  slotPriorHitProbability,
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
export { decide, decideExplained, planClaimFor } from './decide.ts'
export type { ClaimPlan, DecisionTrace, ExplainedDecision } from './decide.ts'
// --- Bass v1.0: observation, classification, adaptive selection ----------------------------
export { FEATURE_KEYS, featureVector, observeSeats, replayCounts, replayedCounts } from './observe.ts'
export type { CountReplay, FeatureKey, SeatObservation } from './observe.ts'
export { checkpointBucket, classifySeat, classifySeats } from './classify.ts'
export type { SeatClassification, StyleFingerprint } from './classify.ts'
export { FINGERPRINTS, FINGERPRINT_BUCKET_IDS } from './data/fingerprints.ts'
export type { FingerprintBucketId, FingerprintStats, FingerprintTable } from './data/fingerprints.ts'
export { COUNTER_TABLE } from './data/counter-table.ts'
export type { CounterTable } from './data/counter-table.ts'
export { ADAPTIVE_DEFAULTS, ADAPTIVE_PHASE_EVENTS, chooseStyle, isAdaptiveSpec } from './adaptive.ts'
export type { AdaptiveChoice, AdaptiveSpec } from './adaptive.ts'
// --- Bass v1.5: the bounded-memory ladder --------------------------------------------------
export {
  BOUNDED_DEFAULTS,
  boundedRead,
  deriveBoundedFacts,
  isBoundedSpec,
  keepWithinBudget,
  rankBoundedFacts,
  restrictedKnowledge,
} from './bounded.ts'
export type { BoundedFact, BoundedFactKind, BoundedRanking, BoundedRead, BoundedSpec } from './bounded.ts'
// --- Bass v2.0: the concession layer (CONCESSION.md) ---------------------------------------
export { THREAT_COEFFICIENTS, preyInBook, seatLicences, seatThreat, turnYield } from './threat.ts'
export type { SeatThreat } from './threat.ts'
export { defusalActive, defusalBonus, logLicences } from './defuse.ts'
export type { LicenceLookup } from './defuse.ts'
export { LICENCE_MIN_Z, licenceConditionedHitProbability, licenceNormaliser, modelHoldsLicence } from './licence.ts'
export { MARGINAL_ROUNDS, MARGINAL_TOLERANCE, attachMarginal, computeMarginalTable, marginalFor, marginalHitProbability } from './marginal.ts'
export type { MarginalTable } from './marginal.ts'
// `PolicySpec` is re-exported from bounded.ts, where adaptive.ts's widened union gains
// `BoundedSpec` — the acyclic arrangement documented in both file headers. Everything
// importing the barrel gets the full five-shape union.
export type { PolicySpec } from './bounded.ts'
// --- Monet v0.1: the agent line's version registry (MONET.md §3.1) ---------------------------
export { MONET_VERSIONS, MONET_VERSION_IDS, isMonetVersion, monetPolicy } from './monet.ts'
export type { MonetVersion } from './monet.ts'
