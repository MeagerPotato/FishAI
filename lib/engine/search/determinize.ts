/**
 * determinize.ts — MONET.md §3.8a: one determinization of the unseen cards, sampled from the
 * viewer's posterior.
 *
 * A determinization is a full deal consistent with everything the viewer knows: its own hand and
 * every located card fixed, every other live card placed at one of its candidate seats, the public
 * counts met exactly, and every licence constraint on the record (a seat holds at least one card of
 * a half-suit it asked into) satisfied. The placement is sampled, not maximised: the search arm
 * plays each candidate ask against D such deals and reads the paired difference, so the deals must
 * be draws from the belief, and the belief is §3.4a's table when the policy carries one.
 *
 * The sampler is a sequential draw, most-constrained card first (fewest candidates, ties in the
 * deck's canonical order): each card goes to a candidate seat with free capacity, with weight the
 * table's marginal for that (card, seat) scaled by the seat's remaining share of its unknown slots
 * — the cheap correction for the capacity earlier draws have already used, in place of re-scaling
 * the table after every card (joint.ts does that for a claim's few cards; a whole deal has forty).
 * A draw that runs a seat out of room, misses a count, or breaks a constraint is rejected and drawn
 * again, up to `maxTries`; null means the belief and the counts could not be reconciled in that
 * many draws, and the caller falls back to the fast policy's pick.
 *
 * Without a table (a policy without `pModel: 'marginal'`) the weight is the seat's free capacity —
 * the slot prior every bot shipped with before Monet v0.4a. `scripts/probe-determinize.mjs` measures
 * the sampler's per-card accuracy against the true deal at home, beside the marginal's top-1.
 */
import type { Card, Seat } from '../types.ts'
import type { Knowledge, SeatView } from '../bots/types.ts'
import { marginalFor } from '../bots/marginal.ts'

export type Rng = () => number

/**
 * One deal consistent with `k` (built from `view`), or null when `maxTries` draws all failed.
 * `rng` yields uniform numbers in [0, 1).
 */
export function sampleDeal(view: SeatView, k: Knowledge, rng: Rng, maxTries = 32): Card[][] | null {
  const counts = view.counts
  const table = marginalFor(k) ?? null
  const fixed: Card[][] = [[], [], [], [], [], []]
  const open: { card: Card; cands: readonly Seat[]; row: number }[] = []
  for (const [card, cands] of Object.entries(k.cands) as [Card, Seat[]][]) {
    if (cands.length === 0) continue
    if (cands.length === 1) {
      fixed[cands[0]].push(card)
      continue
    }
    const row = table === null ? -1 : (table.index.get(card) ?? -1)
    open.push({ card, cands, row })
  }
  // Most constrained first; `k.cands` is materialised in the deck's canonical order, and the
  // sort is stable, so ties keep that order.
  open.sort((a, b) => a.cands.length - b.cands.length)
  const slots = k.unknownSlots
  const w = new Array<number>(6).fill(0)

  for (let t = 0; t < maxTries; t++) {
    const hands = fixed.map((h) => [...h])
    const cap = counts.map((c, s) => c - fixed[s].length)
    let ok = true
    for (const { card, cands, row } of open) {
      let total = 0
      for (let i = 0; i < cands.length; i++) {
        const s = cands[i]
        let v = 0
        if (cap[s] > 0) {
          if (row >= 0 && table !== null) {
            const p = table.p[row * 6 + s]
            v = (p > 0 ? p : 1e-9) * (cap[s] / Math.max(1, slots[s]))
          } else {
            v = cap[s]
          }
          if (!(v > 0)) v = 1e-9
        }
        w[i] = v
        total += v
      }
      if (!(total > 0)) {
        ok = false
        break
      }
      let r = rng() * total
      let pick = cands[cands.length - 1]
      for (let i = 0; i < cands.length; i++) {
        r -= w[i]
        if (r < 0) {
          pick = cands[i]
          break
        }
      }
      hands[pick].push(card)
      cap[pick]--
    }
    if (!ok) continue
    let exact = true
    for (let s = 0; s < 6; s++) {
      if (cap[s] !== 0) {
        exact = false
        break
      }
    }
    if (!exact) continue
    let satisfied = true
    for (const c of k.constraints) {
      const hand = hands[c.seat]
      let any = false
      for (const x of c.cards) {
        if (hand.includes(x)) {
          any = true
          break
        }
      }
      if (!any) {
        satisfied = false
        break
      }
    }
    if (!satisfied) continue
    return hands
  }
  return null
}
