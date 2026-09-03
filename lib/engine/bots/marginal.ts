/**
 * marginal.ts — MONET.md §3.4a: `pCardAt`, the calibrated marginal.
 *
 * ## What it replaces
 *
 * The ask scorer's probability that a seat holds a card has been the SLOT PRIOR since the first
 * bot: the target's unidentified slots over the unidentified slots of every candidate seat
 * (`knowledge.ts` `pHit`). It treats each unknown card on its own. It is wrong whenever the
 * candidate sets overlap unevenly — a seat whose two free slots must be filled by two cards that
 * can be nowhere else has no room for a third card the prior still gives it a share of — and the
 * fixpoint propagation only catches the cases where that argument ends in a certainty.
 *
 * ## What it is
 *
 * The marginal of the uniform distribution over every assignment of the unknown cards to seats
 * that the model allows: each card at one of its candidate seats, each seat holding exactly its
 * `unknownSlots`, and every surviving "holds ≥ 1 of these" constraint honoured. Computing that
 * exactly is a permanent; this file computes the Sinkhorn approximation of it, which is what the
 * roadmap asked for (§3.4a "matrix scaling / permanent approximation"):
 *
 *   1. start from the 0/1 candidate matrix over the unknown cards × six seats;
 *   2. scale rows to 1 (a card is somewhere) and columns to `unknownSlots[s]` (a seat's free slots
 *      are all filled), alternately, until nothing moves;
 *   3. condition on each surviving constraint ONCE, in the way §3.3a's licence term conditions:
 *      for "at least one of A at t", `p ← p / (1 − Π(1 − p))` over A at t, the rest of each such
 *      row shrinking to keep it at 1, the other cards at t giving up the same mass to keep the
 *      column at its slots, and their rows repaired likewise;
 *   4. scale rows and columns again, gently, to take up the second-order drift step 3 leaves.
 *
 * Step 3 is applied once per constraint and never compounded: conditioning on the same event on
 * every scaling round drives one of its cards to certainty, which is a different (and wrong)
 * table — the first cut of this file did exactly that, and the brute-force test caught it at
 * 0.32 off. Duplicate constraints at a seat, and constraints a tighter one at the same seat
 * implies (A ⊂ A′: at least one of A is at t, so at least one of A′ is), are dropped before step
 * 3 for the same reason: `finishKnowledge` keeps every surviving ask separately, and the same
 * evidence may not be conditioned on twice.
 *
 * `refinedHitProbability`'s first-order fold takes a `max` over ONE constraint and ignores overlap
 * between constraints (its own comment says so); step 3 folds all of them, each against the table
 * the previous ones left, with the margins repaired after each.
 *
 * ## What it is not
 *
 * Not exact: Sinkhorn returns the maximum-entropy table with these margins, not the matching
 * count's own marginals, and the one-shot conditioning uses the product of marginals for the
 * event's probability. `tests/bots/marginal.test.ts` measures the gap against brute force on small
 * instances and pins its size. Whether the number is *calibrated* is an empirical question
 * answered by `scripts/calibration.mjs`, and MONET.md §3.4a's acceptance reads that harness first.
 * Not a memory: the table is a pure read of a finished `Knowledge` — `cands`, `unknownSlots`,
 * `constraints`, and the ask-choice prior (`asksInto`, `choiceKappa`) when MONET.md §3.6a's knob put
 * one there — and nothing else — memoised per object, so BOUNDED.md's fact pool keeps its shape
 * and its cost model (the §3.4a scope decision). Not the joint: §3.4b's `pAssignment` is a
 * different object, and the declare planner does not read this table.
 *
 * ## Purity
 *
 * Deterministic and allocation-light: fixed round cap, fixed tolerance, no rng, no module state
 * beyond a `WeakMap` cache keyed by the `Knowledge` object it was derived from — the same object
 * always yields the same table, and two builds from one view yield equal tables. `null` is the
 * honest answer for a `Knowledge` whose slots and unknown cards disagree (only an inconsistent
 * or truncated view produces one): the reader falls back to the slot prior rather than trusting a
 * table that could not be scaled.
 */
import type { Card, Seat } from '../types.ts'
import { cardBook } from '../cards.ts'
import type { Knowledge } from './types.ts'

/**
 * Round cap for each scaling pass. Convergence is geometric away from the boundary and linear
 * toward it (an entry the counting argument sends to 0 approaches it one factor per round), so
 * the cap is generous; a mid-game table typically stops on the tolerance within a few dozen.
 */
export const MARGINAL_ROUNDS = 200
/** The round-to-round movement below which a scaling pass is taken as converged. */
export const MARGINAL_TOLERANCE = 1e-9
/**
 * The marginal never returns a certainty for a card with more than one candidate: `p === 0` and
 * `p === 1` are reserved for what `holders` / `cands` prove, exactly as `refinedHitProbability`'s
 * own ceiling reserves them, so no reader mistakes a scaled number for a fact.
 */
const EPS = 1e-9

/** The scaled table. Rows are the unknown cards in canonical order; entry `i * 6 + seat`. */
export interface MarginalTable {
  /** The unknown cards (more than one candidate), in the deck's canonical order. */
  readonly cards: readonly Card[]
  /** Card -> row index. */
  readonly index: ReadonlyMap<Card, number>
  /** Flattened `i * 6 + seat`: P(cards[i] is at seat). Rows sum to 1; columns to `unknownSlots`. */
  readonly p: Float64Array
  /** Scaling rounds used across both passes. */
  readonly rounds: number
  /** Whether both scaling passes reached the tolerance inside the round cap. */
  readonly converged: boolean
  /** Constraints conditioned on, after duplicates and implied ones were dropped. */
  readonly conditioned: number
}

/** Alternate row and column scaling until nothing moves. Rows are exact on exit. */
function scaleToMargins(p: Float64Array, n: number, need: readonly number[]): { rounds: number; converged: boolean } {
  let rounds = 0
  let converged = false
  while (rounds < MARGINAL_ROUNDS) {
    rounds++
    let moved = 0
    for (let s = 0; s < 6; s++) {
      let sum = 0
      for (let i = 0; i < n; i++) sum += p[i * 6 + s]
      if (sum > 0) {
        const scale = need[s] / sum
        for (let i = 0; i < n; i++) {
          const before = p[i * 6 + s]
          const after = before * scale
          p[i * 6 + s] = after
          const d = Math.abs(after - before)
          if (d > moved) moved = d
        }
      }
    }
    for (let i = 0; i < n; i++) {
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
    if (moved < MARGINAL_TOLERANCE) {
      converged = true
      break
    }
  }
  return { rounds, converged }
}

/** Scale every entry of row `i` except column `t` by `f`. */
function scaleRowExcept(p: Float64Array, i: number, t: number, f: number): void {
  for (let s = 0; s < 6; s++) if (s !== t) p[i * 6 + s] *= f
}

/**
 * The constraints worth conditioning on, over row indices: exact duplicates collapsed, and any
 * constraint implied by a tighter one at the same seat dropped.
 */
function minimalConstraints(k: Knowledge, index: ReadonlyMap<Card, number>, p: Float64Array): { seat: Seat; rows: number[] }[] {
  const seen = new Set<string>()
  const all: { seat: Seat; rows: number[]; key: string }[] = []
  for (const kc of k.constraints) {
    const rows: number[] = []
    for (const c of kc.cards) {
      const i = index.get(c)
      if (i !== undefined && p[i * 6 + kc.seat] > 0) rows.push(i)
    }
    if (rows.length === 0) continue
    rows.sort((a, b) => a - b)
    const key = `${kc.seat}:${rows.join(',')}`
    if (seen.has(key)) continue
    seen.add(key)
    all.push({ seat: kc.seat, rows, key })
  }
  const out: { seat: Seat; rows: number[] }[] = []
  for (const a of all) {
    let implied = false
    for (const b of all) {
      if (b === a || b.seat !== a.seat || b.rows.length >= a.rows.length) continue
      if (b.rows.every((r) => a.rows.includes(r))) {
        implied = true
        break
      }
    }
    if (!implied) out.push({ seat: a.seat, rows: a.rows })
  }
  return out
}

/**
 * Scale the table for a finished `Knowledge`. Pure over `cands`, `unknownSlots` and `constraints`.
 * Returns `null` when the margins cannot agree — the number of unknown cards is not the number of
 * free slots, or some unknown card has no candidate seat with a free slot — which a consistent,
 * fully propagated view never produces.
 */
export function computeMarginalTable(k: Knowledge): MarginalTable | null {
  const cards: Card[] = []
  for (const c of Object.keys(k.cands) as Card[]) {
    const cand = k.cands[c]
    if (cand !== undefined && cand.length > 1) cards.push(c)
  }
  const n = cards.length
  const index = new Map<Card, number>()
  for (let i = 0; i < n; i++) index.set(cards[i], i)
  const need = [0, 1, 2, 3, 4, 5].map((s) => Math.max(0, k.unknownSlots[s] ?? 0))
  let slots = 0
  for (const u of need) slots += u
  if (slots !== n) return null
  const p = new Float64Array(n * 6)
  if (n === 0) return { cards, index, p, rounds: 0, converged: true, conditioned: 0 }
  // MONET.md §3.6a: the prior. Flat (1 on every admissible cell) unless the Knowledge carries the
  // ask-choice evidence, in which case a seat's `a` asks into a card's half-suit weight that seat's
  // cell by (1 + κ)^a before the scaling — the margins are the same, the fixpoint is not.
  const kappa = k.choiceKappa ?? 0
  const asksInto = kappa > 0 ? k.asksInto : undefined
  for (let i = 0; i < n; i++) {
    let any = false
    const row = asksInto === undefined ? undefined : asksInto[cardBook(cards[i])]
    for (const s of k.cands[cards[i]] ?? []) {
      if (need[s] > 0) {
        const a = row === undefined || s === k.seat ? 0 : (row[s] ?? 0)
        p[i * 6 + s] = a > 0 ? Math.pow(1 + kappa, a) : 1
        any = true
      }
    }
    if (!any) return null
  }

  const first = scaleToMargins(p, n, need)

  const constraints = minimalConstraints(k, index, p)
  for (const { seat: t, rows } of constraints) {
    let none = 1
    for (const i of rows) none *= 1 - p[i * 6 + t]
    if (!(none > 0) || !(none < 1)) continue
    const z = 1 - none
    let sumBefore = 0
    let sumAfter = 0
    const inA = new Set(rows)
    for (const i of rows) {
      const before = p[i * 6 + t]
      const after = Math.min(1 - EPS, before / z)
      p[i * 6 + t] = after
      sumBefore += before
      sumAfter += after
      scaleRowExcept(p, i, t, (1 - after) / (1 - before))
    }
    // The other cards at t give up what A gained, pro rata, and their rows are repaired the same way.
    const rest = need[t] - sumBefore
    if (rest > 0) {
      const g = Math.max(0, need[t] - sumAfter) / rest
      for (let i = 0; i < n; i++) {
        if (inA.has(i)) continue
        const before = p[i * 6 + t]
        if (!(before > 0) || before >= 1) continue
        const after = before * g
        p[i * 6 + t] = after
        scaleRowExcept(p, i, t, (1 - after) / (1 - before))
      }
    }
  }

  const second = constraints.length > 0 ? scaleToMargins(p, n, need) : { rounds: 0, converged: true }
  return {
    cards,
    index,
    p,
    rounds: first.rounds + second.rounds,
    converged: first.converged && second.converged,
    conditioned: constraints.length,
  }
}

/**
 * Read P(`card` at `target`) off a table. `undefined` when the card is not an unknown card (certain
 * or gone — the caller's `holders` / `cands` rule applies), else a number strictly inside (0, 1).
 */
export function marginalHitProbability(table: MarginalTable, card: Card, target: Seat): number | undefined {
  const i = table.index.get(card)
  if (i === undefined) return undefined
  const v = table.p[i * 6 + target]
  if (!(v > 0)) return EPS
  return Math.min(1 - EPS, Math.max(EPS, v))
}

/* ------------------------------------------------------------------- cache --- */

const TABLES = new WeakMap<Knowledge, MarginalTable | null>()

/**
 * Derive and remember the table for a `Knowledge` object. Called once by `buildKnowledge` when the
 * caller asked for the marginal (`KnowledgeOptions.marginal`); never by `finishKnowledge`, so the
 * bounded arm's replay path is untouched (MONET.md §3.4a scope decision).
 */
export function attachMarginal(k: Knowledge): MarginalTable | null {
  const existing = TABLES.get(k)
  if (existing !== undefined) return existing
  const table = computeMarginalTable(k)
  TABLES.set(k, table)
  return table
}

/**
 * The table attached to this `Knowledge`, if any. `undefined` when the object was built without the
 * marginal (every Bass tier, and every Monet version before v0.4a); `null` when it was asked for and
 * could not be scaled, in which case the reader uses the slot prior.
 */
export function marginalFor(k: Knowledge): MarginalTable | null | undefined {
  return TABLES.get(k)
}
