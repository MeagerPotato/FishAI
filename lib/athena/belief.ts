/**
 * belief.ts: a belief head's per-card holder probabilities, read off `lib/athena`'s deterministic forward (G0d), and
 * the seam that lays them over Monet's marginal table (ATHENA.md §8.3's declare-pin arm, §8.4's H sampler).
 *
 * The head is the network's `belief` block (net.ts, `H_BELIEF`: card x relative seat). For a card with two or more
 * candidate seats under the rules (`k.cands`), its holder distribution is the softmax of the block's logits over
 * those candidates only (the rules' mask), in `expDet`, exactly as `policy.ts`'s `planSet` reads it. A card the rules
 * place is not the head's to say.
 *
 * {@link patchTableWithHead} writes those rows into the table `marginalFor(k)` holds for the `Knowledge`, in place:
 * each row's candidate cells get the head's probabilities and every other cell 0. Every reader of that table then
 * reads the head: the deal sampler (`sampleDeal`, which weights a seat by the cell times its free share), the hit
 * probability, and the claim planner's joint chain. Nothing is rescaled to the column margins (that is B-M-scaled's
 * arm, §8.3, registered apart). A `Knowledge` built without the marginal, or whose table could not be scaled (null),
 * is left alone and the call returns false, so the caller counts the fallback.
 *
 * Not in the barrel (`index.ts`): the stub package does not ship it.
 */
import type { Card } from '../engine/types.ts'
import type { Knowledge, SeatView } from '../engine/bots/types.ts'
import { marginalFor } from '../engine/bots/marginal.ts'
import { cardIndex, rel } from './encode.ts'
import { H_BELIEF, expDet } from './net.ts'
import type { AthenaNet } from './net.ts'
import { forwardView } from './policy.ts'
import type { SeatForward } from './policy.ts'

/**
 * The head's distribution for `card` over `seats` (its rule candidates, absolute), written into `out` (six entries,
 * absolute seats, zero off the candidates). `heads` is a forward's output for the viewer `me`.
 */
export function headHolder(heads: Float64Array, me: number, card: Card, seats: readonly number[], out: Float64Array): Float64Array {
  out.fill(0)
  const base = H_BELIEF + cardIndex(card) * 6
  let m = Number.NEGATIVE_INFINITY
  for (const s of seats) m = Math.max(m, heads[base + rel(s, me)])
  let sum = 0
  for (const s of seats) {
    const e = expDet(heads[base + rel(s, me)] - m)
    out[s] = e
    sum += e
  }
  for (const s of seats) out[s] /= sum
  return out
}

/**
 * Lay the head's rows over the marginal table of `k` (built from `view` with the marginal on), in place. Returns
 * false, changing nothing, when `k` carries no table. `cache` is the viewer seat's incremental fold, or null to refold
 * the log from zero (the same bits either way, policy.ts).
 */
export function patchTableWithHead(net: AthenaNet, view: SeatView, k: Knowledge, cache: SeatForward | null = null): boolean {
  const table = marginalFor(k)
  if (!table) return false
  const { heads } = forwardView(net, view, cache, k)
  const row = new Float64Array(6)
  for (let i = 0; i < table.cards.length; i++) {
    const c = table.cards[i]
    headHolder(heads, view.seat, c, k.cands[c] ?? [], row)
    for (let s = 0; s < 6; s++) table.p[i * 6 + s] = row[s]
  }
  return true
}
