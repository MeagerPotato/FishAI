/**
 * claimbelief.ts — MONET.md §3.8ak: `claimBelief: 'holder'`, the holder clone in the claim path.
 *
 * ## What it replaces
 *
 * Under `pAssignment: 'joint'` the claim planner (`planClaim`, decide.ts) places a set's open
 * cards by `joint.ts`'s chain over the marginal, and the plan's probability is the chain's
 * product. §3.8aj replayed the bridge records through this engine and read that product where
 * SESTINA declares a set it cannot fully place — 0.53 times a game, 84% right: the marginal sits
 * below 0.6 on 78% of those claims and is right 83 to 92% of the time at 0.3 to 0.6, so the
 * stack, at its 0.775 bar, declines every one of them. The holder clone (§3.8ah's H1,
 * `holder.ts`) read the same assignments at 0.8 or above on 71% of the right ones and was right
 * 93.9% there. This knob hands the same open cards to the holder clone.
 *
 * ## What it is
 *
 * Each open card's belief is `holderBelief` — the clone's softmax over the card's candidate
 * seats. The cards are placed **most certain first**: the (card, teammate) pair with the highest
 * belief among the teammates that still have a free slot (`k.unknownSlots`, decremented as cards
 * are placed) is fixed, and the plan's probability is the product of the beliefs read at each
 * step — SESTINA's own independent form (`rbelief=indep` in its spec), and exactly the quantity
 * §3.8aj's probe measured at its speculative claims. A card with no teammate left to hold it
 * prices the plan at 0. The belief's mass on an opponent's seat is not renormalised away: p is
 * the probability the WHOLE claim is right, as the chain's is.
 *
 * ## What it is not
 *
 * Not a change to what "certain" means (a placed card never reaches this file; `planClaim`
 * places it first). Not a change to the bar (`declareThreshold` reads the same p), nor to the
 * structural gate (`evClaim` still refuses a set with a candidate on the other team unless
 * `claimOwnership: 'priced'`), nor to the certain claim, the forced claim or the ask. Absent, or
 * `'marginal'`, is the chain byte for byte. Nothing shipped reads it.
 *
 * ## Purity
 *
 * Deterministic and rng-free: a pure function of the `Knowledge`, the view, the compiled model
 * and the card list. The holder context is built once per `Knowledge` (a `WeakMap`, as
 * `planClaim` caches its plans). Ties go to the earlier card in the order given (canonical, from
 * `planClaim`) and then to the lower seat, so `decideExplained ≡ decide`.
 */
import type { Card, Seat } from '../types.ts'
import type { Knowledge, SeatView } from './types.ts'
import type { CompiledNet } from './net.ts'
import { holderBelief, holderContext } from './holder.ts'
import type { HolderContext } from './holder.ts'
import type { JointAssignment, JointStep } from './joint.ts'

const CONTEXTS = new WeakMap<Knowledge, HolderContext>()

/** The holder clone's context for this decision, built once per `Knowledge`. */
export function holderContextFor(view: SeatView, k: Knowledge): HolderContext {
  let ctx = CONTEXTS.get(k)
  if (ctx === undefined) {
    ctx = holderContext(view, k)
    CONTEXTS.set(k, ctx)
  }
  return ctx
}

/**
 * Place `open` (cards of one set the viewer cannot place) among `mates` by the holder clone `m`,
 * most certain first under the seats' free slots; p is the product of the beliefs read at each
 * step, 0 when some open card has no teammate left to hold it.
 */
export function assignByHolder(
  k: Knowledge,
  view: SeatView,
  m: CompiledNet,
  open: readonly Card[],
  mates: readonly Seat[],
): JointAssignment {
  const assignments = {} as Record<Card, Seat>
  const steps: JointStep[] = []
  if (open.length === 0) return { assignments, p: 1, steps }
  const ctx = holderContextFor(view, k)
  const beliefs = open.map((c) => holderBelief(m, ctx, k, view, c))
  const cap = [0, 1, 2, 3, 4, 5].map((s) => Math.max(0, k.unknownSlots[s] ?? 0))
  const pending: number[] = open.map((_, i) => i)
  let p = 1
  while (pending.length > 0) {
    // The sharpest available belief over the pending cards and the teammates with a slot left.
    let bj = -1
    let bs: Seat = mates[0]
    let bp = -1
    for (let j = 0; j < pending.length; j++) {
      const i = pending[j]
      for (const s of mates) {
        if (cap[s] <= 0) continue
        const v = beliefs[i][s]
        if (v > bp) {
          bp = v
          bj = j
          bs = s
        }
      }
    }
    if (!(bp > 0)) {
      // No teammate can hold some pending card: the claim cannot be right. Name the rest legally
      // so the plan keeps its shape; the probability is what says it is worthless.
      for (const i of pending) assignments[open[i]] = mates[0]
      return { assignments, p: 0, steps }
    }
    const i = pending[bj]
    const conditional = Math.min(1, bp)
    p *= conditional
    assignments[open[i]] = bs
    steps.push({ card: open[i], seat: bs, p: conditional })
    cap[bs]--
    pending.splice(bj, 1)
  }
  return { assignments, p, steps }
}
