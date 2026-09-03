/**
 * The search arm (MONET.md §3.8a) — a lab arm outside the bots directory, so that directory's
 * public-view proof stays exact: nothing in `lib/engine/bots` can reach a `GameState`, and the
 * search, which rolls determinized states forward through the engine, lives here instead.
 */
export { SEARCH_DEFAULTS, decideSearch, rollout, stateFromView } from './search.ts'
export type { SearchDecision, SearchInfo, SearchParams } from './search.ts'
export { sampleDeal } from './determinize.ts'
