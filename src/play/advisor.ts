/**
 * The assistant — the table's side of the `decideExplained` contract, now live.
 *
 * This file began as a seam that pinned the `DecisionTrace` / `ExplainedDecision` shapes while
 * the engine's traced twin of `decide` was built in a parallel task. The engine landed with the
 * exact contracted shapes, so the local declarations are gone: the types are re-exported from
 * the engine barrel, and `advise()` is the one-line delegation the seam promised. What the seam
 * bought survives in the module boundary — nothing else in `src/play/` mentions the engine's
 * decision internals, and the pane renders whatever the engine's own trace says, never a
 * paraphrase of it.
 *
 * `advise` inherits `decideExplained`'s contract: pure over `(view, policy, seed)`, never
 * throws, and its `action` is bit-identical to what `decide` would play with the same inputs —
 * the equivalence is pinned by `tests/bots/explain.test.ts`, so "play the suggestion" really
 * does play the move the advisor bot would have played from this seat.
 */
import { decideExplained } from '../../lib/engine/index.ts'
import type { ExplainedDecision, PolicySpec, SeatView } from '../../lib/engine/index.ts'

export type { DecisionTrace, ExplainedDecision } from '../../lib/engine/index.ts'

/** What the pane asks for at a human decision point. */
export function advise(view: SeatView, policy: PolicySpec, seed: number): ExplainedDecision {
  return decideExplained(view, policy, seed)
}
