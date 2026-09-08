/**
 * search.ts — MONET.md §3.8a: the search arm. Information-set determinization search on the ask
 * decision, over the fast policy's own candidates, with a paired lower-confidence-bound guard.
 *
 * ## What it does
 *
 * At an ask decision the fast policy (`decideExplained`) supplies its pick and its ranking. The top
 * C asks are the candidates, the pick among them (`candMode` `'top'`), or — MONET.md 3.8aa — the pick
 * and the best-ranked ask into each other half-suit the seat can ask into, up to C (`'sets'`: every
 * set the seat could chase or take back is on the table once). D determinizations of the unseen cards are drawn
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
 * ## The leaf
 *
 * At the horizon a rollout is scored by `leafValue` — the set differential plus the locked sets
 * (§3.8a's amendment) — or, MONET.md 3.8ab, by a learned value model (`leafNet`, the name of a
 * model registered with `registerValueModel`): the model's estimate of the FINAL set differential
 * from the full-information state at the horizon, `value.ts`. With `steps` 0 and a model the
 * search is a one-ply expectation over the deals: the ask, its outcome on the deal, the model.
 *
 * ## Cost
 *
 * D · C rollouts of S `decide` calls each: at the defaults (8 · 3 · 24 = 576 calls) about 80 ms
 * per ask decision on the bench machine — §3.8a's budget is 100 ms, and `scripts/bench-decide.mjs`
 * is the instrument. Everything else is a few sampled deals and copies of the state.
 */
import type { BookId, Card, GameAction, GameState, Seat } from '../types.ts'
import { cardBook, seatTeam } from '../cards.ts'
import { legalActionsSummary } from '../helpers.ts'
import { reduce } from '../reduce.ts'
import { hashSeed, mulberry32 } from '../rng.ts'
import { seatView } from '../views.ts'
import { decide, decideExplained } from '../bots/decide.ts'
import { buildKnowledge, rankAsksWith } from '../bots/knowledge.ts'
import { resolvePolicy } from '../bots/style.ts'
import type { PolicySpec } from '../bots/bounded.ts'
import type { Knowledge, KnowledgeOptions, SeatView } from '../bots/types.ts'
import { sampleDeal } from './determinize.ts'
import { compileValueModel, valueOf } from './value.ts'
import type { CompiledValueModel, ValueModel } from './value.ts'
import { askModelOf } from '../bots/imitation.ts'

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
  /**
   * The leaf evaluator's weight on LOCKED sets at the horizon - unresolved half-suits whose six
   * cards all sit in one team's hands (exact on a determinized deal), ours minus theirs. 0 is
   * the pre-registered form (the set differential alone); the amendment in MONET.md 3.8a says
   * why a weight is needed at a short horizon.
   */
  leafLock: number
  /** The leaf evaluator's weight per card in hand at the horizon, ours minus theirs. 0 is the pre-registered form. */
  leafCard: number
  /**
   * The candidate generator (MONET.md 3.8aa). `'top'`: the fast ranker's top C asks, the pick among
   * them — 3.8a's form and the default. `'sets'`: the pick, then the best-ranked ask into each other
   * half-suit, in the ranking's order, up to C — so the chase-or-take-back choice at a lead or a
   * trail is searched even where the ranker's top C all sit in one set.
   */
  candMode: 'top' | 'sets'
  /**
   * MONET.md 3.8ab — the learned leaf: the name of a value model registered with
   * `registerValueModel`, evaluated at the rollout's horizon in place of `leafValue` (`leafLock`
   * and `leafCard` are then unread). Absent: the lock-only leaf, byte for byte.
   */
  leafNet?: string
  /**
   * MONET.md 3.8ac — the opponent model: the name of an ask model registered with `registerAskModel`
   * (bots/imitation.ts). Present, the rollouts play the spec with `askModel` laid over its style at the
   * OPPONENTS' seats — their asks are the model's argmax (the SESTINA clone), everything else the
   * spec's — and the spec itself at ours. Absent: the spec at every seat, byte for byte.
   */
  oppAskModel?: string
}

export const SEARCH_DEFAULTS: SearchParams = Object.freeze({ det: 8, cand: 3, steps: 24, z: 1, guard: 'lcb', leafLock: 0, leafCard: 0, candMode: 'top' })

const MODELS = new Map<string, CompiledValueModel>()

/** Register a value model under a name `SearchParams.leafNet` can refer to (compiled once here). */
export function registerValueModel(name: string, model: ValueModel): void {
  MODELS.set(name, compileValueModel(model))
}

export function valueModelOf(name: string): CompiledValueModel {
  const m = MODELS.get(name)
  if (!m) throw new Error(`no value model registered as ${JSON.stringify(name)}`)
  return m
}

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
  /** The candidates searched, in candidate order, the pick first (empty when nothing was searched). */
  cands: readonly { target: Seat; card: Card }[]
}

export interface SearchDecision {
  action: GameAction
  info: SearchInfo
}

const NONE: SearchInfo = Object.freeze({ searched: false, candidates: 0, deals: 0, failedDraws: 0, played: 'pick', advantage: 0, se: 0, means: [], cands: [] })

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

/**
 * The leaf value of a (determinized) state for `team`: the set differential, plus `leafLock` per
 * locked set (an unresolved half-suit wholly in one team's hands) and `leafCard` per card in hand,
 * each ours minus theirs. Both weights 0 is the set differential alone.
 */
export function leafValue(s: GameState, team: 0 | 1, leafLock: number, leafCard: number): number {
  const other = team === 0 ? 1 : 0
  let v = s.score[team] - s.score[other]
  if (leafCard !== 0) {
    let ours = 0
    let theirs = 0
    for (let x = 0; x < 6; x++) {
      if (seatTeam(x as Seat) === team) ours += s.hands[x].length
      else theirs += s.hands[x].length
    }
    v += leafCard * (ours - theirs)
  }
  if (leafLock !== 0 && s.phase !== 'finished') {
    const owner = new Map<string, 0 | 1 | -1>()
    for (let x = 0; x < 6; x++) {
      const t = seatTeam(x as Seat)
      for (const c of s.hands[x]) {
        const b = cardBook(c)
        const o = owner.get(b)
        if (o === undefined) owner.set(b, t)
        else if (o !== t) owner.set(b, -1)
      }
    }
    for (const [b, o] of owner) {
      if (o === -1 || s.books[b as BookId]) continue
      v += o === team ? leafLock : -leafLock
    }
  }
  return v
}

/**
 * Roll a state forward `steps` actions under `spec` at every seat; the leaf value for `team` at the
 * end — `leafValue` with the weights, or the learned model's estimate when `leaf` is given.
 */
export function rollout(start: GameState, spec: PolicySpec, key: string, steps: number, team: 0 | 1, leafLock = 0, leafCard = 0, leaf?: CompiledValueModel, oppSpec?: PolicySpec): number {
  let s = start
  let n = 0
  while (s.phase !== 'finished' && n < steps) {
    const { seat } = legalActionsSummary(s)
    const a = decide(seatView(s, seat), oppSpec !== undefined && seatTeam(seat) !== team ? oppSpec : spec, hashSeed(`${key}:${s.moveIndex}`)())
    const r = reduce(s, a)
    if (!r.ok) break
    s = r.state
    n++
  }
  return leaf ? valueOf(leaf, s, team) : leafValue(s, team, leafLock, leafCard)
}

/** MONET.md 3.8ac: the spec with the named ask model laid over its style — the rollout policy at the opponents' seats. */
export function opponentSpec(spec: PolicySpec, askModel: string): PolicySpec {
  askModelOf(askModel) // registered, or a clear error before the first rollout
  const { skill, style } = resolvePolicy(spec)
  return Object.freeze({ skill, style: Object.freeze({ ...style, askModel }) })
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

/** The fast policy's pick at an ask decision and the search's candidate list over it (the pick first), with the knowledge both were built on. */
export interface CandidateAsks {
  pick: GameAction
  cands: { target: Seat; card: Card }[]
  k: Knowledge
}

/**
 * The candidates the search would put on the table at `view` (MONET.md 3.8a, 3.8aa): the pick first,
 * then ('top') the ranking's top C less the pick, or ('sets') the best-ranked ask into each half-suit
 * the pick is not in, in the ranking's order, up to C. Null when the decision is not an ask. The
 * trace's ranking is the fast policy's top five; 'sets' needs the whole ranking, and asks the ranker
 * itself on the same knowledge (the ranking the stack's ask path used, in full).
 */
export function candidateAsks(view: SeatView, spec: PolicySpec, seed: number, params: SearchParams): CandidateAsks | null {
  const ex = decideExplained(view, spec, seed)
  const pick = ex.action
  if (pick.type !== 'ask') return null
  const k = buildKnowledge(view, knowledgeOptionsOf(spec))
  const cands: { target: Seat; card: Card }[] = [{ target: pick.target, card: pick.card }]
  if (params.candMode === 'sets') {
    const books = new Set<string>([cardBook(pick.card)])
    for (const r of rankAsksWith(view, k, resolvePolicy(spec).style)) {
      if (cands.length >= params.cand) break
      const b = cardBook(r.card)
      if (books.has(b)) continue
      books.add(b)
      cands.push({ target: r.target, card: r.card })
    }
  } else {
    for (const r of ex.trace.ranked ?? []) {
      if (cands.length >= params.cand) break
      if (cands.some((c) => c.target === r.target && c.card === r.card)) continue
      cands.push({ target: r.target, card: r.card })
    }
  }
  return { pick, cands, k }
}

/**
 * The search arm's decision. Everything but an ask decision with at least two candidates is the
 * fast policy's own decision, unchanged.
 */
export function decideSearch(view: SeatView, spec: PolicySpec, seed: number, params: SearchParams = SEARCH_DEFAULTS): SearchDecision {
  if (view.phase !== 'playing' || view.declareWindow || params.det <= 0 || params.cand < 2) {
    return { action: decide(view, spec, seed), info: NONE }
  }
  const ca = candidateAsks(view, spec, seed, params)
  if (ca === null) return { action: decide(view, spec, seed), info: NONE }
  const { pick, cands, k } = ca
  if (pick.type !== 'ask') return { action: pick, info: NONE }
  const seat = view.seat
  const team = seatTeam(seat)
  const leaf = params.leafNet ? valueModelOf(params.leafNet) : undefined
  const oppSpec = params.oppAskModel ? opponentSpec(spec, params.oppAskModel) : undefined
  if (cands.length < 2) return { action: pick, info: NONE }

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
      values[i].push(r.ok ? rollout(r.state, spec, key, params.steps, team, params.leafLock, params.leafCard, leaf, oppSpec) : Number.NaN)
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
  const info: SearchInfo = { searched: true, candidates: cands.length, deals, failedDraws: failed, played: 'pick', advantage: 0, se: 0, means, cands }
  if (best === 0) return { action: pick, info }
  const clears = params.guard === 'none' ? means[best] > 0 : means[best] - params.z * ses[best] > 0
  if (!clears) return { action: pick, info: { ...info, advantage: means[best], se: ses[best] } }
  return {
    action: { type: 'ask', seat, target: cands[best].target, card: cands[best].card },
    info: { ...info, played: 'candidate', advantage: means[best], se: ses[best] },
  }
}
