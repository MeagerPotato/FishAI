/**
 * contained.ts — the contained-book turn-pass ([CONTAINMENT.md](../../../CONTAINMENT.md)).
 *
 * A book every card of which sits with one team is an **absorbing state**: no opponent can
 * legally ask into it (C1, RULES_US54.md row 6), and an opponent who declares it hands it back
 * (C2, row 14). While it stays unresolved a *holder* may still ask into it (C3) — naming a card
 * a teammate holds is legal and is a **guaranteed miss**, which under row 10 passes the turn to
 * whichever opponent the asker names (C4). A miss moves no cards, so the licence is never
 * consumed and the move is repeatable (C5); claiming the book destroys it (C6). All six are
 * executed against this engine in [tests/engine/containment.test.ts](../../../tests/engine/containment.test.ts).
 *
 * This file is the **policy** half: recognise the state, price the move honestly, and pick the
 * card and the target. It is deliberately separate from [decide.ts](decide.ts) so the valuation
 * can be unit-tested as arithmetic rather than only through a decision.
 *
 * ## What "contained" means here, and why it is weaker than CONTAINMENT.md's position
 *
 * CONTAINMENT.md's measured position pins all six cards to named seats. The policy does not need
 * that: the ask is a guaranteed miss as soon as every card of the book is **certainly on the
 * viewer's team**, whether or not the exact teammate is known. That is the same predicate
 * `evClaim` uses for "the set is certainly ours", and it matters because a book whose holders are
 * pinned is a book `certainClaim` has already banked — so a recogniser that required pinning
 * would only ever fire for the two styles that refuse a certain declare. The weaker predicate is
 * reachable by every style, which is what makes the per-style measurement meaningful.
 *
 * ## The trigger is derived, not switched on when legal
 *
 * Passing the turn is normally bad: you surrender tempo for nothing. The move is worth playing
 * only when the ordinary alternative is poor *and* aiming the concession is worth something. Both
 * quantities are read off public data (row 17) — see {@link valueContainedPass} for the full
 * derivation. The style contributes exactly one number, `containedPass`, and it is an *appetite*
 * in the same sense `hoardBooks` is: the expected number of times the licence will be used before
 * the book is banked.
 *
 * ## The move is not information-free (CONTAINMENT.md §1.2)
 *
 * Each ask publishes that the asker holds >= 1 card of the book and **lacks the named card**
 * (row 17). The first time a card is named that is one card of hand information spent; naming the
 * *same* card again publishes nothing new. So {@link containedPassCard} reuses one card rather
 * than cycling: it prefers a card whose absence from this hand is already public, and otherwise
 * takes the canonical-first legal card of the book — which is stable for the rest of the game,
 * because a contained book's cards can never move (C1 closes the only channel), so every later
 * use finds that same card already published and is free.
 */
import type { BookId, Card, Seat } from '../types.ts'
import { allBooks, bookCards, seatTeam, teamSeats } from '../cards.ts'
import { rulesFor } from '../variants.ts'
import { refinedHitProbability } from './knowledge.ts'
import type { SkillParams, StyleParams } from './style.ts'
import type { Knowledge, RankedAsk, SeatView } from './types.ts'

function opponentsOf(seat: Seat): readonly Seat[] {
  return teamSeats(seatTeam(seat) === 0 ? 1 : 0)
}

/**
 * The unresolved books this seat can play the turn-pass into: it holds at least one card
 * (row 6 — the licence), it does *not* hold at least one card (row 7 — something legal to name),
 * and every card of the book is certainly on its own team (C1 — so the ask cannot hit).
 *
 * Returned in canonical book order, so the choice downstream is deterministic.
 */
export function containedBooks(view: SeatView, k: Knowledge): BookId[] {
  const myTeam = seatTeam(view.seat)
  const held = new Set<Card>(view.hand)
  const out: BookId[] = []
  for (const b of allBooks(view.config)) {
    if (view.books[b]) continue
    const cards = bookCards(b, view.config)
    if (cards.length === 0) continue
    let mine = 0
    for (const c of cards) if (held.has(c)) mine++
    if (mine === 0 || mine === cards.length) continue
    let contained = true
    for (const c of cards) {
      const cand = k.cands[c]
      if (cand === undefined || cand.length === 0 || !cand.every((s) => seatTeam(s) === myTeam)) {
        contained = false
        break
      }
    }
    if (contained) out.push(b)
  }
  return out
}

/**
 * The card to name — CONTAINMENT.md §1.2's *"reuse one card as your turn-pass"*.
 *
 * Prefers a card of the book this seat has already publicly asked for and missed on: that ask
 * already published "the asker lacks this card", so naming it again costs nothing. Otherwise the
 * canonical-first card of the book the seat does not hold, which is a **first use** and is
 * charged as such. Because a contained book's cards cannot move, that canonical choice is fixed
 * for the rest of the game and every subsequent call finds it in the log instead — the reuse
 * discipline holds without any state being carried between decisions.
 */
export function containedPassCard(
  view: SeatView,
  book: BookId,
): { card: Card; reused: boolean } | null {
  const held = new Set<Card>(view.hand)
  const legal = bookCards(book, view.config).filter((c) => !held.has(c))
  if (legal.length === 0) return null
  const me = view.seat
  for (let i = view.log.length - 1; i >= 0; i--) {
    const ev = view.log[i]
    if (ev.type !== 'ask' || ev.asker !== me || ev.hit) continue
    if (legal.includes(ev.card)) return { card: ev.card, reused: true }
  }
  return { card: legal[0], reused: false }
}

/** The arithmetic behind one turn-pass decision, exposed so it can be asserted directly. */
export interface PassValuation {
  /**
   * Cards an opponent extracts from one conceded turn, measured off the public log:
   * `hits / max(1, misses)`. Row 9 keeps the turn on a hit and row 10 ends it on a miss, so a
   * turn is a geometric run of hits and its expected length is `h / (1 - h)` — which on counts is
   * exactly hits over misses. No table constant: an engine, a roster or a rule set that hits more
   * often prices a conceded turn higher, automatically.
   */
  E: number
  /** Mean hand size over the seats still holding cards (public counts, row 17). */
  meanHand: number
  /** Cards saved by aiming the concession: `E * (n_ordinary - n_chosen) / meanHand`. */
  gain: number
  /** Cards forgone by not playing the ordinary ask: `1 + E * n_ordinary / meanHand`. */
  tempo: number
  /** CONTAINMENT.md §1.2 first-use information cost, in cards. Exactly 0 on a reuse. */
  infoCost: number
  /** The ordinary ask's hit probability below which the pass is the better move. */
  threshold: number
}

/**
 * Price one turn-pass against the ordinary ask it would replace. **The derivation, in full.**
 *
 * Write `t_o` for the opponent the ordinary ask would hand the turn to on a miss and `t_c` for
 * the opponent this style would choose (`missTarget`). Then
 *
 * ```
 * value(ordinary) = p * V_hit + (1 - p) * V_miss(t_o)
 * value(pass)     =             1       * V_miss(t_c)      - infoCost
 * ```
 *
 * so the pass wins iff `p * (V_hit - V_miss(t_o)) + infoCost < V_miss(t_c) - V_miss(t_o)`, i.e.
 * **`p < (gain - infoCost) / tempo`**. Everything below is those two terms in *cards*:
 *
 *  - **Conceding the turn to seat `t` costs `E * n_t / meanHand` cards.** `E` is the measured
 *    number of cards a turn yields (see {@link PassValuation.E}); a seat with a bigger hand holds
 *    more ask-licences (row 6) and converts a turn better, and hand size is the only part of that
 *    which is public — it is also exactly the quantity `missTarget` already ranks on.
 *  - **`gain`** is the difference between conceding to `t_o` and conceding to `t_c`. It is `<= 0`
 *    whenever the ordinary ask already aims where the style wants, and the whole mechanism is
 *    then off. That is the reason this cannot fire merely because it is legal.
 *  - **`tempo`** is the swing between hitting and missing on the ordinary ask: one card taken
 *    from an opponent, plus the turn *not* conceded to `t_o`.
 *  - **`infoCost`** is CONTAINMENT.md §1.2, priced at the only channel that survives C1 and C2 —
 *    see {@link firstUseInfoCost}.
 *
 * `containedPass` (the style's appetite) multiplies `gain`, because the licence is repeatable
 * (C5) and the single-move comparison above counts one use of it. See roster.ts for how each
 * style's number is read.
 *
 * The threshold is clamped strictly below 1: a certain hit is riskless material *and* keeps the
 * turn (row 9), so nothing may displace it. `decide` also refuses to reach here on one.
 *
 * **`minHitP` is deliberately not consulted.** That knob refuses *long shots* — asks whose chance
 * of taking a card does not justify the turn they risk. This ask has no chance of taking a card
 * by construction and risks nothing, because the turn is the entire content of the move rather
 * than its downside. The bar it has to clear is the one derived above, and applying a hit-
 * probability floor to it as well would refuse it always, at every style that carries one.
 */
export function valueContainedPass(
  view: SeatView,
  style: StyleParams,
  ordinaryTarget: Seat,
  chosenTarget: Seat,
  infoCost: number,
): PassValuation {
  let hits = 0
  let misses = 0
  for (const ev of view.log) {
    if (ev.type !== 'ask') continue
    if (ev.hit) hits++
    else misses++
  }
  const E = hits / Math.max(1, misses)
  let sum = 0
  let seats = 0
  for (const n of view.counts) {
    if (n > 0) {
      sum += n
      seats++
    }
  }
  const meanHand = seats > 0 ? sum / seats : 0
  const perCard = meanHand > 0 ? E / meanHand : 0
  const nOrd = view.counts[ordinaryTarget] ?? 0
  const nChosen = view.counts[chosenTarget] ?? 0
  const gain = perCard * (nOrd - nChosen)
  const tempo = 1 + perCard * nOrd
  const raw = (style.containedPass * gain - infoCost) / tempo
  return { E, meanHand, gain, tempo, infoCost, threshold: Math.max(0, Math.min(1 - 1e-9, raw)) }
}

/**
 * CONTAINMENT.md §1.2's information cost, in cards, for a **first** use of a card.
 *
 * The published fact is *"the asker lacks card X of book B"*. For a contained book the two direct
 * uses of that fact are closed by the result itself: an opponent cannot ask into B at all (C1),
 * and an opponent who declares B hands it back (C2). What is left is the count-exhaustion channel
 * the inference engine runs for everyone — one card removed from the opponents' model of this
 * hand, out of the `U` live cards whose holder is not yet publicly certain. Priced at `1 / U`
 * cards, which is deliberately small: it is the honest magnitude, not a deterrent.
 *
 * **Develin's second framing, kept separate.** The same publication reaches the *teammates*, and
 * they are the only seats that can convert it into points — they may declare B (row 12), which
 * C2 denies the opponents. A `signalling` style therefore books the fact as delivered rather than
 * spent and pays nothing. This is a value on the *information*, not on turn control; the two are
 * never added together, and the turn-control term above is the one that decides. Nothing here
 * models a teammate *decoding* the ask: the receiving seats gain exactly the row-17 public facts
 * `buildKnowledge` already ingests for any ask, so no prearranged convention exists to forbid.
 */
export function firstUseInfoCost(k: Knowledge, style: StyleParams): number {
  if (style.signalling) return 0
  let unknown = 0
  for (const c of Object.keys(k.cands) as Card[]) {
    if ((k.cands[c] ?? []).length > 1) unknown++
  }
  return unknown > 0 ? 1 / unknown : 0
}

/** A chosen turn-pass: what to play, and the arithmetic that chose it. */
export interface ContainedPassPlan {
  book: BookId
  card: Card
  target: Seat
  /** False on the one ask that publishes a new card-fact (CONTAINMENT.md §1.2). */
  reused: boolean
  value: PassValuation
}

/**
 * The opponent this style aims the concession at. `'random'` returns null — a style that
 * expresses no aim buys nothing by aiming, and the mechanism is off for it rather than being
 * handed a seeded target that the valuation could not honestly price.
 */
function aimedTarget(view: SeatView, style: StyleParams): Seat | null {
  if (style.missTarget === 'random') return null
  const pool = opponentsOf(view.seat).filter((s) => view.counts[s] > 0)
  if (pool.length === 0) return null
  let to = pool[0]
  for (const s of pool) {
    const better = style.missTarget === 'most' ? view.counts[s] > view.counts[to] : view.counts[s] < view.counts[to]
    if (better) to = s
  }
  return to
}

/**
 * Choose a contained-book turn-pass instead of `ordinary`, or null to keep the ordinary ask.
 *
 * Order of refusal, cheapest first: the style's appetite, the rule set, the skill's ability to
 * read counts at all (BOT_LAB.md §1.3 — a seat that cannot compare hand sizes cannot aim), a
 * certain hit (never displaced), then the recogniser, then the arithmetic.
 *
 * ## Why the rule set is a gate and not a parameter
 *
 * **Not because containment fails under `pagat48` — it does not.** An earlier draft of this
 * comment claimed RULES.md row 15 voids an opponent's declare of a contained book, so that
 * containment was not absorbing there. That is wrong, and measuring it says so: row 15 covers
 * *"my own team holds all six and I misassigned"*, which cannot describe a seat whose opponents
 * hold all six. The rule that fires is row 14 — opponent holds at least one, opposing team scores
 * — and it is worded identically in both rule sets. Executed under `pagat48`: outcome `team0`,
 * score `[1, 0]`, the book handed straight back. C1 is row 6, also identical. So **C1 and C2 hold
 * under both rule sets**, and `tests/engine/containment.test.ts` now pins that.
 *
 * The gate is a **compatibility** decision instead. This project holds the shipped 48-card game
 * byte-identical, verified by differential digest rather than asserted, and enabling a new policy
 * mechanism there would change it. That is the whole reason, and it is worth stating honestly:
 * the mechanism is *valid* under `pagat48` and is refused anyway, so every `pagat48` game — at
 * any style, not merely the three shipped tiers — stays bit-for-bit what it was before this file
 * existed. Should the 48-card roster ever be re-tuned as its own experiment, this gate is the
 * line to revisit, and no rules argument stands in the way.
 *
 * (CONTAINMENT.md §2's tier discipline still applies to C3–C6, which price the *turn-pass* and
 * were measured under `us54` only.)
 *
 * ## The `why` probe
 *
 * `why` is a write-only out-parameter for `decideExplained`'s traces: when the plan is refused,
 * the reason is written into it — in the same register as the RankedAsk reasons — so the
 * assistant pane can show "considered but refused" without this file's derivation being
 * duplicated in the policy layer. It is only ever *written*, never read, so a call without it
 * (which is every call `decide` makes) is bit-for-bit the call it always was. Reasons are only
 * recorded from the point the mechanism was genuinely live: the three configuration gates
 * (appetite 0, the `pagat48` compatibility gate, a skill that cannot read counts) say the
 * mechanism is off for this seat, not that a position was weighed and declined, so they stay
 * silent and the pane is not told the tiers "considered" a move they can never make.
 */
export function planContainedPass(
  view: SeatView,
  k: Knowledge,
  style: StyleParams,
  skill: SkillParams,
  ordinary: RankedAsk,
  why?: { reason?: string },
): ContainedPassPlan | null {
  if (!(style.containedPass > 0)) return null
  if (rulesFor(view.config).wrongDeclare !== 'opponents') return null
  if (!skill.countTargeting) return null
  // The seat's own best estimate of the ordinary ask's hit probability — which for a
  // `refinedInference` skill is the constraint-refined one `pickAsk` re-scored the ranking
  // with, not the slot prior carried on the RankedAsk. Comparing against the weaker number
  // would systematically undervalue the ask the pass is displacing.
  const p = skill.refinedInference
    ? refinedHitProbability(k, ordinary.card, ordinary.target)
    : ordinary.p
  if (p >= 1) {
    if (why) why.reason = 'the ordinary ask is a certain hit — riskless material that keeps the turn, which nothing may displace'
    return null
  }
  const target = aimedTarget(view, style)
  if (target === null) {
    if (why) why.reason = 'this style expresses no aim (missTarget random or no opponent holds cards), and an unaimed concession buys nothing'
    return null
  }
  const books = containedBooks(view, k)
  if (books.length === 0) {
    if (why) why.reason = 'no unresolved set is contained on this team, so no guaranteed-miss ask exists'
    return null
  }
  // Prefer a book that offers a reusable card (§1.2 — a free repeat), then canonical book order.
  let pick: { book: BookId; card: Card; reused: boolean } | null = null
  for (const b of books) {
    const c = containedPassCard(view, b)
    if (c === null) continue
    if (pick === null || (c.reused && !pick.reused)) pick = { book: b, card: c.card, reused: c.reused }
    if (pick.reused) break
  }
  if (pick === null) {
    if (why) why.reason = 'no contained set offers a card this seat may legally name'
    return null
  }
  const infoCost = pick.reused ? 0 : firstUseInfoCost(k, style)
  const value = valueContainedPass(view, style, ordinary.target, target, infoCost)
  if (!(p < value.threshold)) {
    if (why) {
      const pct = Math.round(p * 100)
      const bar = Math.round(value.threshold * 100)
      why.reason = `the ordinary ask hits ${pct}% of the time, at or above the ${bar}% break-even the pass would need — the material ask is kept`
    }
    return null
  }
  return { book: pick.book, card: pick.card, target, reused: pick.reused, value }
}
