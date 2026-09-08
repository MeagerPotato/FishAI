/**
 * The search arm (MONET.md §3.8a) — a lab arm outside the bots directory, so that directory's
 * public-view proof stays exact: nothing in `lib/engine/bots` can reach a `GameState`, and the
 * search, which rolls determinized states forward through the engine, lives here instead.
 */
export { SEARCH_DEFAULTS, candidateAsks, decideSearch,
  opponentSpec, registerValueModel, rollout, stateFromView, valueModelOf } from './search.ts'
export type { CandidateAsks, SearchDecision, SearchInfo, SearchParams } from './search.ts'
export { VALUE_FEATURE_COUNT, compileValueModel, tableKnowledge, valueFeatureNames, valueFeatures, valueOf, valueOfFeatures } from './value.ts'
export type { CompiledValueModel, TableKnowledge, ValueModel } from './value.ts'
export { sampleDeal } from './determinize.ts'
