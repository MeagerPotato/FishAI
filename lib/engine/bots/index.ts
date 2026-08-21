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
  PolicySpec,
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
} from './knowledge.ts'
export { decide } from './decide.ts'
