/**
 * The assistant seam — the table's side of the `decideExplained` contract.
 *
 * The v0.5 assistant is a side pane that, at every human decision point, shows what the engine
 * would do and WHY: the recommended action, a one-sentence headline, supporting notes, the top
 * ranked asks, the claim plan. All of that comes from `decideExplained(view, policy, seed)` — a
 * traced twin of `decide` that is being built in a parallel task inside `lib/engine/bots/` and
 * DOES NOT EXIST in this tree yet.
 *
 * This file is therefore a seam, not a feature. It pins the contract both sides agreed on:
 *
 *   · `DecisionTrace` / `ExplainedDecision` below are the master spec's shapes, verbatim. The
 *     engine task implements a function of this exact return type; the pane renders it.
 *   · `advise()` is the one call the table makes. Today it returns `null`, and the pane treats
 *     `null` as "the assistant has not arrived" — an honest placeholder, never a fake trace.
 *
 * When `decideExplained` lands, the integration is one line: import it and return its result.
 * Nothing else in `src/play/` mentions the engine's decision internals.
 */
import type {
  BookId,
  GameAction,
  PassValuation,
  PolicySpec,
  RankedAsk,
  SeatView,
} from '../../lib/engine/index.ts'

/** Which pipeline branch produced the action. */
export type DecisionTraceKind =
  | 'own-book-claim'
  | 'certain-claim'
  | 'ev-claim'
  | 'forced-claim'
  | 'guess-claim'
  | 'certain-hit'
  | 'ranked-ask'
  | 'signalling-ask'
  | 'contained-pass'
  | 'decline'
  | 'must-declare'
  | 'pass'
  | 'designate'
  | 'error-branch'
  | 'fallback'

export interface DecisionTrace {
  /** Which pipeline branch produced the action. */
  kind: DecisionTraceKind
  /** One-sentence headline, human-readable, e.g. "Declared LOW-H — all six cards are certain." */
  headline: string
  /** Ordered supporting notes. Plain prose; card names via the pc() renderer (9♥, the red joker). */
  notes: string[]
  /** Top ranked asks at the moment of decision (<= 5), when an ask was considered. */
  ranked?: RankedAsk[]
  /** The claim plan (book, p, uncertain count) when a declare was considered/made. */
  claim?: { book: BookId; p: number; uncertain: number; foreign: boolean }
  /** Contained-pass valuation when that mechanism fired (the existing PassValuation, plumbed through). */
  passValue?: PassValuation
  /** Branches that were considered and refused, in order, with the reason. */
  refused: { kind: string; reason: string }[]
}

export interface ExplainedDecision {
  action: GameAction
  trace: DecisionTrace
}

/**
 * What the pane asks for at a human decision point. Returns `null` until the engine's
 * `decideExplained` lands — the pane renders the honest "not arrived" state on `null` and must
 * never synthesise a trace of its own.
 */
export function advise(view: SeatView, policy: PolicySpec, seed: number): ExplainedDecision | null {
  // The parameters are the contract; they go deliberately unused until decideExplained lands.
  void view
  void policy
  void seed
  return null
}
