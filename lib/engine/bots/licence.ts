/**
 * licence.ts — conditioning the hit probability on a published row-6 licence
 * ([MONET.md](../../../MONET.md) §3.3a, [ASKING.md](../../../ASKING.md) §4.1).
 *
 * ## The blindness this closes
 *
 * [knowledge.ts](knowledge.ts) records an ask as a deal-time at-least-one-of constraint and
 * DROPS it the moment it is satisfied or exhausted ([types.ts](types.ts) `KnowledgeConstraint`)
 * — which is exactly when the target has been shown to hold a card of the set.
 * `refinedHitProbability` folds only the SURVIVING constraints in, so it goes blind precisely
 * where the evidence is strongest. Measured at home, on asks whose target holds a live row-6
 * licence in the asked set, the engine believed **0.2386** against a realised **0.3221**
 * (ASKING.md §4.1, N = 23,345). [threat.ts](threat.ts) already reads licences off the public
 * log for the threat side; this reads them the same way for the probability.
 *
 * ## The correction, and why it is a conditioning rather than a bonus
 *
 * A live licence in set B at seat t says t holds at least one unresolved card of B. Under the
 * engine's own per-card estimates q_j, treated as independent,
 *
 *     P(c at t | at least one of B at t)  =  q_c / (1 − Π_j (1 − q_j))
 *
 * Every card of B at t is scaled by the SAME factor 1/Z, so the correction can never reorder
 * asks *within* a (set, seat) pair — it promotes licensed asks against unlicensed ones, which is
 * the one reordering the defusal appetite reaches by another route (ASKING.md §6.2; the two are
 * substitutes, and MONET.md §3.3b is where that is priced). Applied at strength λ,
 * `p = q + λ (q/Z − q)`: λ = 0 is the shipped number, byte for byte, and λ = 1 is the full
 * conditioning. ASKING.md §4.1's home ladder puts the residual bias nearest zero at λ = 0.60.
 *
 * ## Scope: every live licence the model has not discharged — measured, against the roadmap's guess
 *
 * MONET.md §3.3a asked for the conditioning to be scoped to licences whose constraint the model
 * has DROPPED, on the reasoning that a constraint still held is already folded in by
 * `refinedHitProbability`. `scripts/calibration.mjs` splits the licensed population three ways
 * and the split does not support the guess. On v0.2's own trajectory (300 mirror games,
 * 115,253 licensed legal asks) the refined number is short by **−0.0950** where the model dropped
 * the constraint, by **−0.0401** where it still HOLDS it — the first-order fold is itself
 * under-priced — and by −0.0005 where a member is certainly at the target. [measured, home] Only
 * the last is calibrated. So the correction fires on every licence the log carries that the
 * model has not discharged (a member certainly at t leaves nothing to condition on), and at
 * λ = 0.60 the pooled licensed bias reads +0.0026 on v0.2's trajectory and −0.0032 on v0.3's,
 * every subset within ±0.03 (MONET.md §3.3a is the record; an earlier draft of this comment
 * said −0.0027 / ±0.02). The dropped-only variant is kept in the harness as the rejected
 * alternative, and `modelHoldsLicence` is exported for it.
 *
 * Pure and deterministic over `(view, k, card, target, λ, licences)`: no rng, no clock, no
 * module-level state — the same contract every consumer of `refinedHitProbability` relies on.
 */
import type { BookId, Card, Seat } from '../types.ts'
import { bookCards, cardBook } from '../cards.ts'
import { holderOf, refinedHitProbability } from './knowledge.ts'
import type { LicenceLookup } from './defuse.ts'
import type { Knowledge, SeatView } from './types.ts'

/**
 * Below this normaliser the licence is (in the model's own numbers) nearly impossible to hold,
 * and dividing by it would turn a rounding-scale belief into a near-certainty. Leave the estimate
 * alone there: the position is one the model already misdescribes, and inflating it is not a fix.
 */
export const LICENCE_MIN_Z = 0.02

/**
 * Does the model still carry a live at-least-one-of constraint for `target` in `book`? Not read
 * by the shipped path (see the header); exported for the calibration harness's subset split.
 */
export function modelHoldsLicence(k: Knowledge, target: Seat, book: BookId): boolean {
  for (const kc of k.constraints) {
    if (kc.seat !== target) continue
    for (const c of kc.cards) if (cardBook(c) === book) return true
  }
  return false
}

/**
 * The normaliser `Z = 1 − Π_j (1 − q_j)` over the members of `book` still possibly at `target`,
 * or `null` when the licence is discharged in the model (a member certainly at `target`).
 * Exported for the calibration harness, which needs the factor without the scoping.
 */
export function licenceNormaliser(view: SeatView, k: Knowledge, target: Seat, book: BookId): number | null {
  let prod = 1
  for (const member of bookCards(book, view.config)) {
    const h = holderOf(k, member)
    if (h === target) return null // discharged: a named member is certainly there
    if (h !== null) continue // certainly elsewhere: a dead disjunct
    prod *= 1 - refinedHitProbability(k, member, target)
  }
  return 1 - prod
}

/**
 * `refinedHitProbability`, conditioned on a live row-6 licence at strength `lambda`. Returns the
 * unconditioned number in every other case, so that at `lambda` 0 — and for every seat whose style carries no `licenceLambda`
 * — this is `refinedHitProbability` exactly.
 *
 * `licences` is the log-side lookup `pickAsk` already builds for the concession terms
 * (`logLicences`); one scan serves all three.
 */
export function licenceConditionedHitProbability(
  view: SeatView,
  k: Knowledge,
  card: Card,
  target: Seat,
  lambda: number,
  licences: LicenceLookup,
): number {
  const q = refinedHitProbability(k, card, target)
  if (!(lambda > 0) || q <= 0 || q >= 1) return q
  const book = cardBook(card)
  if (!licences(target).has(book)) return q
  const z = licenceNormaliser(view, k, target, book)
  if (z === null || !(z > LICENCE_MIN_Z)) return q
  // Never certainty from a probabilistic correction — the same ceiling `refinedHitProbability`
  // keeps, so a conditioned ask can still never outrank a certain hit on the p term alone.
  return Math.min(1 - 1e-9, q + lambda * (q / z - q))
}
