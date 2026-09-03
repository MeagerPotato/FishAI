/**
 * search.ts — MONET.md §3.8a: the search arm. Information-set determinization search on the ask
 * decision, over the fast policy's own candidates, with a paired lower-confidence-bound guard.
 *
 * ## What it does
 *
 * At an ask decision the fast policy (`decideExplained`) supplies its pick and its ranking. The top
 * C asks are the candidates, the pick among them. D determinizations of the unseen cards are drawn
 * from the viewer's posterior (`determinize.ts`), and on each one every candidate is played and the
 * game rolled out for S further actions with the fast policy at every seat — the same rollout seed
 * for every candidate on a deal, so the comparison is paired — and scored by the viewer's team's
 * set differential at the horizon (a finished game scores its result). The candidate with the
 * highest mean advantage over the pick plays only if its lower confidence bound over the D deals
 * clears zero (`mean − z · SE > 0`); otherwise the pick plays. `guard: 'none'` plays the best mean
 * unguarded — §3.8a's named negative control.
 *
 * ## What it is not
 *
 * Not a policy of the bots directory: it reaches the engine's `reduce`, `seatView` and
 * `legalActionsSummary`, which that directory's public-view proof forbids, so it lives here and
 * imports the bots one way. Not on `/play`: a lab arm, reached by the home instruments and the
 * bridge adapter by name. Not a change to any window decision — those are the fast policy's.
 * Deterministic for a given (view, spec, seed, params).
 *
 * ## Cost
 *
 * D · C rollouts of S `decide` calls each: at the defaults (8 · 3 · 24 = 576 calls) about 80 ms
 * per ask decision on the bench machine — §3.8a's budget is 100 ms, and `scripts/bench-decide.mjs`
 * is the instrument. Everything else is a few sampled deals and copies of the state.
 */
import type { Card, GameAction, GameState, Seat } from '../types.ts'
import { seatTeam } from '../cards.ts'
import { legalActionsSummary } from '../helpers.ts'
import { reduce } from '../reduce.ts'
import { hashSeed, mulberry32 } from '../rng.ts'
import { seatView } from '../views.ts'
import { decide, decideExplained } from '../bots/decide.ts'
import { buildKnowledge } from '../bots/knowledge.ts'
import { resolvePolicy } from '../bots/style.ts'
import type { PolicySpec } from '../bots/bounded.ts'
import type { KnowledgeOptions, SeatView } from '../bots/types.ts'
import { sampleDeal } from './determinize.ts'

export interface SearchParams {
  /** Determinizations per decision (D). 0 disables the search: the fast policy's pick plays. */
  det: number
  /** Candidate asks (C), the fast ranker's top C with the pick among them. Below 2 nothing is searched. */
  cand: number
  /** Rollout length in engine actions (S), windows' declines included. */
  steps: number
  /** The guard's z: the best candidate plays only if `mean − z · SE > 0` over the deals. */
  z: number
  /** `'lcb'` is the arm; `'none'` is the unguarded argmax, the negative control. */
  guard: 'lcb' | 'none'
}

export const SEARCH_DEFAULTS: SearchParams = Object.freeze({ det: 8, cand: 3, steps: 24, z: 1, guard: 'lcb' })

export interface SearchInfo {
  /** Whether a search ran at all (an ask decision with at least two candidates and one deal). */
  searched: boolean
  candidates: number
  /** Deals actually drawn (failed draws are not counted). */
  deals: number
  failedDraws: number
  /** What was played: the fast policy's pick or a searched candidate. */
  played: 'pick' | 'candidate'
  /** The played candidate's mean paired advantage over the pick and its SE (0 when the pick played unsearched). */
  advantage: number
  se: number
  /** Per-candidate mean advantage over the pick, in candidate order (the pick's own row is 0). */
  means: number[]
}

export interface SearchDecision {
  action: GameAction
  info: SearchInfo
}

const NONE: SearchInfo = Object.freeze({ searched: false, candidates: 0, deals: 0, failedDraws: 0, played: 'pick', advantage: 0, se: 0, means: [] })

/** A game state with the viewer's public view and a full deal of hands. */
export function stateFromView(view: SeatView, hands: readonly (readonly Card[])[]): GameState {
  const s: GameState = {
    config: view.config,
    seed: 'determinized',
    phase: view.phase,
    turn: view.turn,
    hands: hands.map((h) => [...h]),
    books: { ...view.books },
    score: [view.score[0], view.score[1]],
    log: [...view.log],
    moveIndex: view.moveIndex,
  }
  if (view.declareWindow) s.declareWindow = { ...view.declareWindow }
  return s
}

/** Roll a state forward `steps` actions under `spec` at every seat; the team's set differential at the end. */
export function rollout(start: GameState, spec: PolicySpec, key: string, steps: number, team: 0 | 1): number {
  let s = start
  let n = 0
  while (s.phase !== 'finished' && n < steps) {
    const { seat } = legalActionsSummary(s)
    const a = decide(seatView(s, seat), spec, hashSeed(`${key}:${s.moveIndex}`)())
    const r = reduce(s, a)
    if (!r.ok) break
    s = r.state
    n++
  }
  return s.score[team] - s.score[team === 0 ? 1 : 0]
}

function knowledgeOptionsOf(spec: PolicySpec): KnowledgeOptions {
  const { skill, style } = resolvePolicy(spec)
  const marginal = style.pModel === 'marginal'
  return {
    logWindow: skill.logWindow,
    useConstraints: skill.useConstraints,
    marginal,
    choiceKappa: marginal ? style.choiceKappa : undefined,
    choiceAdapt: marginal ? style.choiceAdapt : undefined,
    choicePrior: marginal ? style.choicePrior : undefined,
  }
}

/**
 * The search arm's decision. Everything but an ask decision with at least two candidates is the
 * fast policy's own decision, unchanged.
 */
export function decideSearch(view: SeatView, spec: PolicySpec, seed: number, params: SearchParams = SEARCH_DEFAULTS): SearchDecision {
  if (view.phase !== 'playing' || view.declareWindow || params.det <= 0 || params.cand < 2) {
    return { action: decide(view, spec, seed), info: NONE }
  }
  const ex = decideExplained(view, spec, seed)
  const pick = ex.action
  if (pick.type !== 'ask') return { action: pick, info: NONE }
  const seat = view.seat
  const team = seatTeam(seat)

  // The candidates: the pick first, then the ranking's top C less the pick.
  const cands: { target: Seat; card: Card }[] = [{ target: pick.target, card: pick.card }]
  for (const r of ex.trace.ranked ?? []) {
    if (cands.length >= params.cand) break
    if (cands.some((c) => c.target === r.target && c.card === r.card)) continue
    cands.push({ target: r.target, card: r.card })
  }
  if (cands.length < 2) return { action: pick, info: NONE }

  const k = buildKnowledge(view, knowledgeOptionsOf(spec))
  const rng = mulberry32(seed)
  const values: number[][] = cands.map(() => [])
  let deals = 0
  let failed = 0
  for (let d = 0; d < params.det; d++) {
    const hands = sampleDeal(view, k, rng)
    if (hands === null) {
      failed++
      continue
    }
    deals++
    const base = stateFromView(view, hands)
    const key = `${seed}:${d}`
    for (let i = 0; i < cands.length; i++) {
      const r = reduce(base, { type: 'ask', seat, target: cands[i].target, card: cands[i].card })
      // A candidate the sampled deal makes illegal cannot happen (legality is public), but the
      // engine is the authority: a refused ask scores as the pick's deal, i.e. no advantage.
      values[i].push(r.ok ? rollout(r.state, spec, key, params.steps, team) : Number.NaN)
    }
  }
  if (deals === 0) return { action: pick, info: { ...NONE, candidates: cands.length, failedDraws: failed } }

  const means: number[] = []
  const ses: number[] = []
  for (let i = 0; i < cands.length; i++) {
    let sum = 0
    let sumSq = 0
    for (let d = 0; d < deals; d++) {
      const v = values[i][d]
      const diff = Number.isNaN(v) ? 0 : v - values[0][d]
      sum += diff
      sumSq += diff * diff
    }
    const mean = sum / deals
    const variance = deals > 1 ? Math.max(0, (sumSq - deals * mean * mean) / (deals - 1)) : 0
    means.push(mean)
    ses.push(Math.sqrt(variance / deals))
  }
  let best = 0
  for (let i = 1; i < cands.length; i++) if (means[i] > means[best]) best = i
  const info: SearchInfo = { searched: true, candidates: cands.length, deals, failedDraws: failed, played: 'pick', advantage: 0, se: 0, means }
  if (best === 0) return { action: pick, info }
  const clears = params.guard === 'none' ? means[best] > 0 : means[best] - params.z * ses[best] > 0
  if (!clears) return { action: pick, info: { ...info, advantage: means[best], se: ses[best] } }
  return {
    action: { type: 'ask', seat, target: cands[best].target, card: cands[best].card },
    info: { ...info, played: 'candidate', advantage: means[best], se: ses[best] },
  }
}
