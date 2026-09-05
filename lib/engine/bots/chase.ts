/**
 * chase.ts — the chase appetite (MONET.md §3.8i, Monet v0.13).
 *
 * The other arm of §3.8h's gate. `closing.ts` prices the closing asks that stand BESIDE a legal
 * certain hit; this prices the ones that stand BELOW one — the uncertain chases `pickAsk` gates the
 * closing credit out of — at a second, separately fitted appetite. The two PARTITION the
 * candidates, so no candidate is ever paid twice and the two doses are separable in a fit.
 *
 * ## Why this deliberately reverses §3.8h's refusal
 *
 * §3.8h refused to move an uncertain ask above a certain hit, on §3.8g's reading that neither
 * policy makes that trade. That reading was measured only where every missing card is *known* to
 * be with an opponent — and §3.8g R2's own bucket table shows SESTINA chases more THERE too
 * (26.3% against Monet's 21.2%, by the largest own-side mass on a missing card), a wider gap than
 * the aggregate. The refusal is not a general finding about the trade; it is a statement about how
 * often either policy takes it. §8.3 row 13 put the reversal to the owner and the owner approved
 * it. What this file may NOT claim is that it avoids that bucket: it does not, and a certainty
 * guard would not be its complement, because the bucket is defined by belief.
 *
 * ## The term
 *
 * `chase · wHit · lock`, or `chase · wHit · p · lock` under `chaseScaled` — which is §3.8h's own
 * expression with the gate lifted and nothing else changed, and so the control. `lock` is
 * `closing.ts`'s, re-used through `closingPicture` rather than re-derived: the fit's whole claim is
 * that the two appetites differ in nothing but which side of the gate they sit on and their shape
 * in `p`, and a second copy of the majority walk could drift and make the difference between the
 * arms unattributable.
 *
 * The flat form is the primary hypothesis and the reason is measured, not aesthetic. §3.8g R1's
 * card-level table has Monet chasing the missing cards it rates at 0.5–0.7 own-side at 7.0% and at
 * 0.7–1 at 11.7%, against SESTINA's 16.0% and 16.9%. High own-side mass is low `p` on the
 * opponent, so the chases Monet declines are the low-`p` ones, and `p` is read off the very
 * marginal that produces R1's miscalibration. A credit multiplied by `p` pays least exactly where
 * the gap is.
 *
 * Counted by CERTAINTY only. `closingBelief` deliberately does not reach this credit and a test
 * pins that: §3.8h measured the belief form losing on six seeds of six, and the gated population is
 * exactly where the marginal carries the whole inference, so R1's miscalibration is larger there.
 *
 * ## What it may not do
 *
 * **It never pays a certain hit.** `p >= 1` returns 0 on this module's own account, so no edit to
 * the hook and no future caller can turn this appetite into a bonus on the very hits it exists to
 * be able to lose to. **It never pays an ungated candidate** — the `gated` argument, likewise
 * refused here and not only at the call site, so the partition is a property this module can be
 * tested for. Neither guard is what stops a later rung widening the population: only `pickAsk`'s
 * own `gated` does that, and this file says so rather than claiming otherwise. **It never pays a
 * sure miss** into the side's own majority, and **it never pays a resolved set**.
 *
 * Pure and deterministic over `(view, k, style, ask, p, gated)`: no clock, no rng, no module state.
 * It reads certain holders through `holderOf` and nothing else — never `askHitProbability`, never
 * `attachMarginal`, never `view.hand` (a seat's own cards carry a certain holder equal to that seat
 * in its own `Knowledge`, so the walk needs no hand scan).
 */
import { bookCards, cardBook, seatTeam } from '../cards.ts'
import { holderOf } from './knowledge.ts'
import { closingPicture } from './closing.ts'
import type { StyleParams } from './style.ts'
import type { Knowledge, RankedAsk, SeatView } from './types.ts'

/** Is the chase appetite live for this style? Read once per decision, beside `closingActive`. */
export function chaseActive(style: StyleParams): boolean {
  return (style.chase ?? 0) > 0
}

/** Does the chase credit scale with the hit chance? Inert without a live `chase`. */
export function chaseScaled(style: StyleParams): boolean {
  return (style.chase ?? 0) > 0 && style.chaseScaled === true
}

/**
 * The chase credit: `chase · wHit · lock`, or `chase · wHit · p · lock` under `chaseScaled`, for an
 * UNCERTAIN ask that would bring the asker's side within reach of a set it already accounts for
 * four or five of. Zero when the knob is absent or 0, for an ungated candidate, at `p` 0, at `p` 1,
 * for a resolved set, for an ask a teammate's certain holding makes a sure miss, and whenever the
 * hit would still leave the horizon's worth of the set outside the side's hands — which under
 * `us54` means it fires only at a seat-known holding of four or five of six.
 *
 * The `!(p > 0)` guard is load-bearing here in a way it is not in `closing.ts`: the flat form has
 * no `p` in its product, so without that line a known miss would collect the whole credit.
 */
export function chaseCredit(
  view: SeatView,
  k: Knowledge,
  style: StyleParams,
  ask: RankedAsk,
  p: number,
  gated: boolean,
): number {
  const appetite = style.chase ?? 0
  if (!(appetite > 0)) return 0
  if (!gated) return 0
  if (!(p > 0)) return 0
  if (p >= 1) return 0
  const book = cardBook(ask.card)
  if (view.books[book]) return 0
  // A card a teammate certainly holds cannot be with the opponent being asked: the ask is a sure
  // miss into the side's own majority, and §3.8g counts it on the other side of the ledger.
  const owner = holderOf(k, ask.card)
  if (owner !== null && seatTeam(owner) === seatTeam(view.seat)) return 0
  const size = bookCards(book, view.config).length
  const horizon = size - (Math.floor(size / 2) + 1)
  if (horizon <= 0) return 0
  // Certainty only — `closingBelief` is deliberately not read here; see the header.
  const { outstanding } = closingPicture(view, k, ask.card, false)
  const lock = 1 - outstanding / horizon
  if (!(lock > 0)) return 0
  return appetite * style.wHit * (style.chaseScaled === true ? p : 1) * Math.min(1, lock)
}
