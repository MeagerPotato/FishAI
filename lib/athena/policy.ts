/**
 * policy.ts: the ATHENA stub's decision over a `SeatView` (ATHENA.md §1, §4.5 item 6, G0d): the rules-certain declare
 * rail, and the network's choice among the legal moves everywhere else. The same code runs in-engine (the pin, the
 * tests, home play) and, type-stripped, inside the FishLab package.
 *
 * ## What the stub decides, and how
 *
 * - **An ask** (window closed, the seat's turn, `playing`): the ask head's logit over the legal ask codes, highest
 *   first; a tie goes to the lower code.
 * - **A declare window at this seat:**
 *   1. **The rail** (ATHENA.md §1, "Hard rails"). If an open set is certain by the rules, meaning every one of its six
 *      cards has a holder fixed by `lib/engine/bots/knowledge.ts` on this seat's team, the first such set in
 *      canonical order is declared with that assignment. The network is not consulted, and the rail does not wait.
 *   2. **Otherwise, where declining is legal, the stub declines.** The speculative-declare head is computed by the
 *      network but not played: its gating is P1's to register (ATHENA.md §3, "Decisions a game": about 560 window
 *      offers a game). So a stub window costs the rules facts and no forward pass.
 *   3. **Where declining is illegal** (`MUST_DECLARE`: the turn-holder cannot ask), the claim is compelled. The set is
 *      the declare head's highest logit among the open sets that the rules do not already prove lost (all open sets
 *      if every one is lost); a tie goes to the lower set. Its assignment is {@link planSet}'s.
 * - **A pass** (`awaitPass`): the pass head's logit over the legal passes; a tie goes to teammate rel 2.
 *
 * {@link planSet} places each card of a set: at its rules-fixed holder when that is a teammate; otherwise at the
 * own-team candidate with the highest belief-plus-assignment logit (a tie to the lower relative seat); at the declarer
 * itself when no teammate is a candidate. Its confidence p is 1 exactly for a set certain by the rules, 0 when the
 * rules prove the set lost, and otherwise the product over the uncertain cards of the belief head's softmax (over the
 * card's rule candidates) at the stated seat, capped at 1 - 1e-6. The adapter's MUSTFIX reads "certain" as p >= 1.
 *
 * ## The forward, incrementally
 *
 * {@link SeatForward} keeps one seat's recurrent state and the event rows it has folded. A new view whose rows extend
 * the folded ones folds only the new rows; any other view refolds from zero. The GRU is a left fold, so both paths
 * give the same bits; the pin refolds every view from zero and so checks the package's cache too.
 */
import type { BookId, Card, GameAction, Seat } from '../engine/types.ts'
import type { Knowledge, SeatView } from '../engine/bots/types.ts'
import { buildKnowledge } from '../engine/bots/knowledge.ts'
import {
  CARDS,
  EVENT_LEN,
  FACTS_LEN,
  L_ASK,
  L_DECLARE,
  L_DECLINE,
  L_PASS,
  LEGAL_LEN,
  N_ASK,
  N_SETS,
  OBS_LEN,
  SET_CARDS,
  SETS,
  abs,
  decodeAction,
  encodeEventRows,
  encodeFactsRow,
  encodeObservation,
  rel,
} from './encode.ts'
import {
  DEC_F,
  DEC_F_FACTS,
  H_ASK,
  H_ASSIGN,
  H_BELIEF,
  H_DECLARE,
  H_PASS,
  HEADS,
  decFOf,
  decisionFeatures,
  expDet,
  factsFeatures,
  foldAll,
  foldEvent,
  headsOf,
  zeroState,
} from './net.ts'
import type { AthenaNet } from './net.ts'

const team = (s: number): number => s % 2

/** The largest confidence an uncertain declare reports: only a set certain by the rules reads 1. */
export const UNCERTAIN_CAP = 1 - 1e-6

/* ------------------------------------------------------------------------------------- the rules facts --- */

/** The rules-derived facts of the view (knowledge.ts, the full log, its constraints on): no fitted model. */
export function factsOf(view: SeatView): Knowledge {
  return buildKnowledge(view)
}

/** The candidate matrix: 54 x 6 bytes, 1 where relative seat r may hold card c now (all zero once c is out of play). */
export function candidateMatrix(view: SeatView, k: Knowledge): Uint8Array {
  const out = new Uint8Array(324)
  for (let ci = 0; ci < 54; ci++) {
    const cs = k.cands[CARDS[ci]]
    if (!cs) continue
    for (const s of cs) out[ci * 6 + rel(s, view.seat)] = 1
  }
  return out
}

/* ------------------------------------------------------------------------------------------ the plans --- */

export interface DeclarePlan {
  set: number
  book: BookId
  assignments: Record<Card, Seat>
  /** The confidence: 1 exactly iff `certain`; 0 when the rules prove the set lost. */
  p: number
  /** Every card's holder is fixed by the rules on the declarer's team. */
  certain: boolean
  /** The rules prove the declare wrong: a card is certainly with an opponent, or no teammate is a candidate for it. */
  lost: boolean
}

/** Is `set` proved lost for the viewer's team by the rules alone? */
export function setLost(view: SeatView, k: Knowledge, set: number): boolean {
  const myTeam = team(view.seat)
  for (const ci of SET_CARDS[set]) {
    const c = CARDS[ci]
    const h = k.holders[c]
    if (h !== undefined) {
      if (team(h) !== myTeam) return true
      continue
    }
    if (!(k.cands[c] ?? []).some((s) => team(s) === myTeam)) return true
  }
  return false
}

/** The set's plan if it is certain by the rules on the viewer's team, else null. */
export function certainPlan(view: SeatView, k: Knowledge, set: number): DeclarePlan | null {
  const myTeam = team(view.seat)
  const assignments = {} as Record<Card, Seat>
  for (const ci of SET_CARDS[set]) {
    const h = k.holders[CARDS[ci]]
    if (h === undefined || team(h) !== myTeam) return null
    assignments[CARDS[ci]] = h
  }
  return { set, book: SETS[set], assignments, p: 1, certain: true, lost: false }
}

/** The rail: the first open set, in canonical order, that is certain by the rules on the viewer's team. */
export function railPlan(view: SeatView, k: Knowledge): DeclarePlan | null {
  for (let b = 0; b < N_SETS; b++) {
    if (view.books[SETS[b]]) continue
    const plan = certainPlan(view, k, b)
    if (plan !== null) return plan
  }
  return null
}

/** A declare plan for `set` (module header). `heads` may be null only when the set is certain by the rules. */
export function planSet(view: SeatView, k: Knowledge, set: number, heads: Float64Array | null): DeclarePlan {
  const sure = certainPlan(view, k, set)
  if (sure !== null) return sure
  if (heads === null) throw new Error(`planSet: set ${SETS[set]} is not certain, so its plan needs the network's heads`)
  const me = view.seat
  const myTeam = team(me)
  const assignments = {} as Record<Card, Seat>
  let p = 1
  let lost = false
  const cards = SET_CARDS[set]
  for (let j = 0; j < 6; j++) {
    const ci = cards[j]
    const c = CARDS[ci]
    const h = k.holders[c]
    if (h !== undefined) {
      if (team(h) === myTeam) {
        assignments[c] = h
      } else {
        assignments[c] = me
        p = 0
        lost = true
      }
      continue
    }
    const cands = k.cands[c] ?? []
    const mates = cands.filter((s) => team(s) === myTeam).sort((a, b) => rel(a, me) - rel(b, me))
    if (mates.length === 0) {
      assignments[c] = me
      p = 0
      lost = true
      continue
    }
    let best = mates[0]
    let bestScore = Number.NEGATIVE_INFINITY
    for (const s of mates) {
      const r = rel(s, me)
      const score = heads[H_BELIEF + ci * 6 + r] + heads[H_ASSIGN + j * 3 + r / 2]
      if (score > bestScore) {
        best = s
        bestScore = score
      }
    }
    assignments[c] = best
    // The belief head's softmax over the card's rule candidates, at the stated seat.
    let m = Number.NEGATIVE_INFINITY
    for (const s of cands) m = Math.max(m, heads[H_BELIEF + ci * 6 + rel(s, me)])
    let sum = 0
    for (const s of cands) sum += expDet(heads[H_BELIEF + ci * 6 + rel(s, me)] - m)
    p *= expDet(heads[H_BELIEF + ci * 6 + rel(best, me)] - m) / sum
  }
  return { set, book: SETS[set], assignments, p: lost ? 0 : Math.min(p, UNCERTAIN_CAP), certain: false, lost }
}

/* ---------------------------------------------------------------------------------------- the forward --- */

/** One seat's recurrent state, folded incrementally (module header). */
export class SeatForward {
  readonly net: AthenaNet
  h: Float64Array
  private fed: Uint8Array
  private nFed = 0
  /** Rows folded, and times the cache found its rows no prefix of a view's and refolded from zero. */
  folds = 0
  resets = 0

  constructor(net: AthenaNet) {
    this.net = net
    this.h = zeroState(net)
    this.fed = new Uint8Array(128 * EVENT_LEN)
  }

  /** The state after `rows` (whole events, `EVENT_LEN` bytes each). The returned array is the cache's own. */
  stateFor(rows: Uint8Array): Float64Array {
    const n = rows.length / EVENT_LEN
    let prefix = n >= this.nFed
    for (let i = 0; prefix && i < this.nFed * EVENT_LEN; i++) if (this.fed[i] !== rows[i]) prefix = false
    if (!prefix) {
      this.h = zeroState(this.net)
      this.nFed = 0
      this.resets++
    }
    if (this.fed.length < rows.length) {
      const grown = new Uint8Array(Math.max(rows.length, 2 * this.fed.length))
      grown.set(this.fed.subarray(0, this.nFed * EVENT_LEN))
      this.fed = grown
    }
    for (let i = this.nFed; i < n; i++) {
      foldEvent(this.net, this.h, rows, i * EVENT_LEN)
      this.fed.set(rows.subarray(i * EVENT_LEN, (i + 1) * EVENT_LEN), i * EVENT_LEN)
      this.folds++
    }
    this.nFed = n
    return this.h
  }
}

export interface ForwardResult {
  obs: Uint8Array
  legal: Uint8Array
  heads: Float64Array
  k: Knowledge
}

/**
 * The network's heads for a view: the encoder's rows, the rules facts, the recurrent state (from `cache`, or refolded
 * from zero without one) and the trunk. A net reading {@link DEC_F_FACTS} decision features (P1's heads) also reads
 * the facts row's features (net.ts `factsFeatures`, from `encodeFactsRow` over the same facts); G0d's stub reads
 * {@link DEC_F} and takes exactly the path it always did.
 */
export function forwardView(net: AthenaNet, view: SeatView, cache: SeatForward | null = null, k: Knowledge | null = null): ForwardResult {
  const obs = new Uint8Array(OBS_LEN)
  const legal = new Uint8Array(LEGAL_LEN)
  encodeObservation(view, obs, legal)
  const facts = k ?? factsOf(view)
  const rows = encodeEventRows(view.log, view.seat)
  const h = cache ? cache.stateFor(rows) : foldAll(net, rows, rows.length / EVENT_LEN)
  const decF = decFOf(net.arch)
  const dec = new Float64Array(decF)
  decisionFeatures(obs, candidateMatrix(view, facts), dec)
  if (decF === DEC_F_FACTS) {
    const row = new Uint8Array(FACTS_LEN)
    encodeFactsRow(view, facts, row)
    factsFeatures(row, dec, DEC_F)
  }
  const heads = headsOf(net, h, dec, new Float64Array(HEADS))
  return { obs, legal, heads, k: facts }
}

/* --------------------------------------------------------------------------------------- the decision --- */

export type StubKind = 'ask' | 'rail' | 'compelled' | 'decline' | 'pass'

export interface StubDecision {
  action: GameAction
  kind: StubKind
  /** For a claim: its plan (the confidence, certainty, loss). */
  plan?: DeclarePlan
  /** Did the decision run the network? */
  forward: boolean
}

/** The stub's move for the view's own seat (module header). Throws where the seat has no move to make. */
export function decideStub(net: AthenaNet, view: SeatView, cache: SeatForward | null = null): StubDecision {
  const me = view.seat
  if (view.phase === 'finished') throw new Error('decideStub: the game is over')
  const w = view.declareWindow
  if (w) {
    if (w.option !== me) throw new Error(`decideStub: the window's option is seat ${w.option}, not seat ${me}`)
    const k = factsOf(view)
    const rail = railPlan(view, k)
    if (rail !== null) return { action: claimOf(me, rail), kind: 'rail', plan: rail, forward: false }
    const obs = new Uint8Array(OBS_LEN)
    const legal = new Uint8Array(LEGAL_LEN)
    encodeObservation(view, obs, legal)
    if (legal[L_DECLINE] === 1) return { action: { type: 'decline', seat: me }, kind: 'decline', forward: false }
    const f = forwardView(net, view, cache, k)
    const open: number[] = []
    for (let b = 0; b < N_SETS; b++) if (f.legal[L_DECLARE + b] === 1) open.push(b)
    if (open.length === 0) throw new Error('decideStub: a compelled window with no open set')
    const alive = open.filter((b) => !setLost(view, k, b))
    const pool = alive.length > 0 ? alive : open
    let best = pool[0]
    for (const b of pool) if (f.heads[H_DECLARE + b] > f.heads[H_DECLARE + best]) best = b
    const plan = planSet(view, k, best, f.heads)
    return { action: claimOf(me, plan), kind: 'compelled', plan, forward: true }
  }
  if (view.turn !== me) throw new Error(`decideStub: seat ${me} holds neither the option nor the turn (${view.turn})`)
  const f = forwardView(net, view, cache)
  if (view.phase === 'awaitPass') {
    let pick = -1
    for (let kk = 0; kk < 2; kk++) {
      if (f.legal[L_PASS + kk] !== 1) continue
      if (pick < 0 || f.heads[H_PASS + kk] > f.heads[H_PASS + pick]) pick = kk
    }
    if (pick < 0) throw new Error('decideStub: awaitPass with no legal pass')
    return { action: { type: 'pass', seat: me, to: abs(2 * (pick + 1), me) }, kind: 'pass', forward: true }
  }
  let code = -1
  for (let c = 0; c < N_ASK; c++) {
    if (f.legal[L_ASK + c] !== 1) continue
    if (code < 0 || f.heads[H_ASK + c] > f.heads[H_ASK + code]) code = c
  }
  if (code < 0) throw new Error('decideStub: no legal ask')
  return { action: decodeAction(me, code) as GameAction, kind: 'ask', forward: true }
}

function claimOf(seat: Seat, plan: DeclarePlan): GameAction {
  return { type: 'claim', seat, book: plan.book, assignments: { ...plan.assignments } }
}
