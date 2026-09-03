/**
 * joint.ts — MONET.md §3.4b: `pAssignment`, the joint over a set's open cards.
 *
 * ## What it replaces
 *
 * `planClaim` (decide.ts) has assigned a set's open cards to teammates by a capacity-greedy rule
 * since the first bot — each card to the candidate teammate with the most unidentified slots,
 * decrementing a working capacity — with the plan's probability the PRODUCT OF INDEPENDENT
 * PER-CARD MARGINALS (a card's chosen capacity over its total candidate capacity). §2.3's third
 * structural loss is that product: two open cards at ~0.55 each give p ≈ 0.30 against Punter's
 * 0.775 bar, so the speculative branch cannot fire even when the two cards, taken together,
 * leave the set almost certainly placed.
 *
 * ## What it is
 *
 * A chain over §3.4a's table. The open cards of the set are assigned one at a time, **the most
 * certain first**: the (card, teammate) pair with the highest probability on the current table is
 * fixed, the table is re-scaled with that card removed and that seat's free slots reduced by one,
 * and the next pair is read off the re-scaled table. The plan's probability is the product of the
 * conditionals read at each step — the chain rule, on the maximum-entropy table the marginal
 * already is. Most-certain-first is both the natural order for the chain rule (each conditional is
 * the sharpest available) and the greedy maximiser of the product; the roadmap's replay
 * measurement prices an exact joint maximiser at +1.45 points of assignment accuracy over greedy
 * and a sampled posterior at +4.24, and this sits between the two by construction.
 *
 * Every conditional is read over all six seats, so a card whose candidates include an opponent
 * carries the opponents' share into the product exactly as the greedy planner's capacity ratio
 * did: `p` is the probability the WHOLE claim is right, not the probability the set is the
 * team's. `evClaim`'s structural gate (every open card's candidates all teammates) is kept by
 * default and dropped only under `claimOwnership: 'priced'` (decide.ts), which is measured as its
 * own arm.
 *
 * ## What it is not
 *
 * Not a new belief: the chain reads the table `attachMarginal` left on the `Knowledge` and
 * nothing else, so BOUNDED.md's fact pool keeps its shape and its cost model (§3.4b's scope
 * decision, §8.3 decision 3). Not exact: each conditional is Sinkhorn's, not the matching count's
 * own, and `tests/bots/joint.test.ts` measures the gap between the chain's probability and the
 * exact one over small instances. Not a change to what "certain" means: a card with one candidate
 * never reaches this file — `planClaim` places it before the chain starts — so a plan with no open
 * card still has p = 1 exactly and `certainClaim` is untouched.
 *
 * ## Purity
 *
 * Deterministic, rng-free, allocation-light: a working copy of the table, a fixed round cap and
 * tolerance shared with `marginal.ts`, ties broken by canonical card order then by seat number.
 * `decideExplained`'s parity with `decide` holds because the chain is a pure function of the
 * `Knowledge` object and the set.
 */
import type { Card, Seat } from '../types.ts'
import type { Knowledge } from './types.ts'
import { MARGINAL_ROUNDS, MARGINAL_TOLERANCE, type MarginalTable } from './marginal.ts'

/** One step of the chain: the card fixed, the seat it was fixed at, and the conditional read. */
export interface JointStep {
  readonly card: Card
  readonly seat: Seat
  /** P(card at seat | the steps before this one), off the re-scaled table. */
  readonly p: number
}

/** The chain's answer for one set's open cards. */
export interface JointAssignment {
  /** Open card -> the teammate it was fixed at, every open card present. */
  readonly assignments: Readonly<Record<Card, Seat>>
  /** The product of the steps' conditionals; 0 when some open card had no room on the team. */
  readonly p: number
  /** The steps in the order they were taken (most certain first). */
  readonly steps: readonly JointStep[]
}

/**
 * Re-scale the live rows to the current margins from where they are (a warm start: the table was
 * at its margins before one row was removed and one column's target dropped by one, so a few
 * rounds recover them). Rows are exact on exit; a column whose target reached 0 is emptied.
 */
function rescaleLive(p: Float64Array, n: number, live: Uint8Array, need: readonly number[]): number {
  let rounds = 0
  while (rounds < MARGINAL_ROUNDS) {
    rounds++
    let moved = 0
    for (let s = 0; s < 6; s++) {
      let sum = 0
      for (let i = 0; i < n; i++) if (live[i] === 1) sum += p[i * 6 + s]
      if (sum > 0) {
        const scale = need[s] / sum
        for (let i = 0; i < n; i++) {
          if (live[i] !== 1) continue
          const before = p[i * 6 + s]
          const after = before * scale
          p[i * 6 + s] = after
          const d = Math.abs(after - before)
          if (d > moved) moved = d
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (live[i] !== 1) continue
      let sum = 0
      for (let s = 0; s < 6; s++) sum += p[i * 6 + s]
      if (sum > 0) {
        const scale = 1 / sum
        for (let s = 0; s < 6; s++) {
          const before = p[i * 6 + s]
          const after = before * scale
          p[i * 6 + s] = after
          const d = Math.abs(after - before)
          if (d > moved) moved = d
        }
      }
    }
    if (moved < MARGINAL_TOLERANCE) break
  }
  return rounds
}

/**
 * Assign `open` (cards of one set that the table knows — more than one candidate each) to seats
 * among `mates`, most certain first, conditioning the table after each step. `open` cards that the
 * table does not carry are a caller error and are reported as p = 0 rather than guessed.
 *
 * Pure over the table, `k.unknownSlots`, the card list and the seat list.
 */
export function assignJointly(
  k: Knowledge,
  table: MarginalTable,
  open: readonly Card[],
  mates: readonly Seat[],
): JointAssignment {
  const assignments = {} as Record<Card, Seat>
  const steps: JointStep[] = []
  if (open.length === 0) return { assignments, p: 1, steps }
  const n = table.cards.length
  const rows: number[] = []
  for (const c of open) {
    const i = table.index.get(c)
    if (i === undefined) return { assignments, p: 0, steps }
    rows.push(i)
  }
  const p = Float64Array.from(table.p)
  const need = [0, 1, 2, 3, 4, 5].map((s) => Math.max(0, k.unknownSlots[s] ?? 0))
  const live = new Uint8Array(n).fill(1)
  const pending = new Set(rows)
  let prob = 1
  while (pending.size > 0) {
    // The sharpest available conditional: highest probability over the pending cards and the
    // team's seats. Ties go to the earlier row (canonical card order), then the lower seat, so the
    // chain is a pure function of the table.
    let bi = -1
    let bs: Seat = 0
    let bp = -1
    for (const i of rows) {
      if (!pending.has(i)) continue
      for (const s of mates) {
        const v = p[i * 6 + s]
        if (v > bp) {
          bp = v
          bi = i
          bs = s
        }
      }
    }
    if (!(bp > 0)) {
      // Some open card has no room on the team once the earlier steps are fixed: the claim cannot
      // be right. Name the remaining cards legally so the plan keeps its shape; the probability
      // is what says it is worthless.
      for (const i of rows) if (pending.has(i)) assignments[table.cards[i]] = mates[0]
      return { assignments, p: 0, steps }
    }
    const conditional = Math.min(1, bp)
    prob *= conditional
    const card = table.cards[bi]
    assignments[card] = bs
    steps.push({ card, seat: bs, p: conditional })
    pending.delete(bi)
    // Condition: the card is at `bs`, so its row leaves the table and `bs` has one slot fewer for
    // the cards still live. Then recover the margins from where the table stands.
    live[bi] = 0
    for (let s = 0; s < 6; s++) p[bi * 6 + s] = 0
    need[bs] = Math.max(0, need[bs] - 1)
    if (pending.size > 0) rescaleLive(p, n, live, need)
  }
  return { assignments, p: prob, steps }
}
