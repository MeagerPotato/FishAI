/**
 * conceal.ts — the broadcast term on an ordinary ask, and the second half of the owner's
 * off-limits request ([CONCESSION.md](../../../CONCESSION.md) §4 is its nearest relative).
 *
 * ## What the owner asked for
 *
 * > *"the strategy that is diverting the attention by asking for another card, since other bots
 * > may infer that you do not have another card from the half-suit they are asking from and skip
 * > you on the next ask. The strategy is to hold the card until you locate who has all of the
 * > other cards in the half-suit, unless your team holds the entire half-suit (then you want to
 * > signal)."*
 *
 * Stated in this engine's terms: RULES_US54.md row 6 lets a seat ask only into a set it holds a
 * card of, so **every ask publishes "the asker holds a card of this set"** — the one reliable
 * public fact about a hand, and the fact [threat.ts](threat.ts) builds its whole reach estimate
 * out of. **Concealment is the decision to decline to publish that fact in a set `H`**, paying
 * whatever the best ask into `H` was worth, to buy the opponents' continued ignorance.
 *
 * The publication is not decorative. `knowledge.ts` `addAskConstraint` records the row-6 basis as
 * a live set-constraint on the asker, and `refinedHitProbability` folds surviving constraints
 * straight into an opponent's hit estimate for every member of the set. Publishing a basis in `H`
 * therefore measurably raises the chance that a `refinedInference` opponent comes and asks *this
 * seat* for the `H` cards it is holding. [defuse.ts](defuse.ts) is the same fact read from the
 * other side of the table.
 *
 * ## Why this is a dangerous family, and what shape the answer had to take
 *
 * CONCESSION.md §4.1 states the structural objection that killed two earlier mechanisms:
 *
 * > A linear ask score whose positive mass is hit-probability-driven cannot express a *deliberate
 * > miss*: the hit term is zero by construction and every remaining term is a penalty, so such an
 * > ask can never win an argmax at any weight. FishAI's score has that shape — set `pHit` to 0 and
 * > 70 of the mass vanishes.
 *
 * Signalling measured flat and failed to replicate (49.97%, −0.013 ± 0.033 over 1,500 duplicate
 * pairs; the free-tie-break version +0.008 ± 0.074). Stalling measured −1.14 ± 0.19 sets at strong
 * settings. Concealment is in the same family — it declines the better ask — so the design has to
 * answer the objection up front rather than discover it in the sweep.
 *
 * Two things make concealment structurally *less* hopeless than its relatives, and both are worth
 * stating because they are also the reasons it might still fail:
 *
 *  1. **The charge is paid at most once per set, not per ask.** Signalling and stalling re-pay
 *     their distortion on every decision; concealment stops the moment the basis is public,
 *     because a second ask into `H` publishes nothing `H`'s first ask did not (gate 3 below). So
 *     the mechanism is a *bounded* perturbation of the policy rather than a standing bias.
 *  2. **It does not require a deliberate miss.** It moves the argmax between two *hits* — the best
 *     ask into `H` and the best ask outside it — which is exactly the region the score can express.
 *     At a small appetite it can only re-order asks that were already within a hair of each other,
 *     which is CONCESSION.md §4's *"spend only the free choice"* formulation reached by a single
 *     scalar instead of by a second tie-break code path.
 *
 * That second point cuts both ways, and honestly: when the appetite is small enough to be free it
 * is also small enough to be inert, and when it is large enough to bite it is buying ignorance
 * with material. Measured, it is the second: only **7.9%** of the decisions the term changes are
 * free, and the mean change costs **6.97** score points — about 10 percentage points of hit
 * probability at `wHit` 70. Concealment buys silence with material, and wins anyway.
 *
 * ## What it measured, and why it nonetheless ships OFF
 *
 * Duplicate deals throughout, against a control that reproduces `decide` byte-for-byte at
 * appetite 0 (`0.0000 +/- 0.0000`, and pinned statically in `tests/bots/conceal.test.ts`).
 *
 *  - **+0.97 [0.69, 1.24] sets per duplicate pair** at the derived break-even over 600 pairs,
 *    confirmed at **+0.89** and **+0.83** on two disjoint held-out banks of 800 pairs each.
 *  - Against an information-free perturbation of the same shape and magnitude — CONCESSION.md
 *    §5a.3's null control — which measures **−0.72**. The disturbance loses; the signal wins.
 *  - A clean dose-response in the opponents' ability to read the leak: **+0.97** at hard skill
 *    (the constraint is folded into `refinedHitProbability`), **+0.31** at medium (recorded but
 *    never folded), **+0.11** with `useConstraints: false` (never recorded at all).
 *
 * **And then the decomposition that decides it.** Vary only the opponents' defusal appetite,
 * holding everything else fixed: against an opponent with `defuse: 0` concealment is worth
 * **−0.15 [−0.41, +0.11]**, and −0.28 when driven hard. The whole effect is the denial of
 * [defuse.ts](defuse.ts) — that mechanism fires on the *target's* published basis and aims at the
 * publisher's own hand, and this one is the refusal to become that target. It is a counter-move to
 * one specific shipped mechanism, not a general information policy.
 *
 * Every shipped tier carries `defuse: 0`, so the tiers have no customer for it; the nine roster
 * styles do carry `defuse: 1`, but every committed number about them was measured with this field
 * absent. So the mechanism lands **off everywhere**, and the result belongs in the counter table
 * `adaptive.ts` best-responds over rather than in a preset.
 *
 * ## The valuation
 *
 * For a legal ask of card `c`, where `H = cardBook(c)`:
 *
 * ```
 * penalty = conceal * wHit * perPrey * mine(H) / (1 + E)   if this ask would publish a NEW basis
 *         = 0                                              otherwise
 * ```
 *
 * Term by term, and each against the term of {@link defuse.defusalBonus} it mirrors:
 *
 *  - **`mine(H)`** — cards of `H` in this seat's own hand. It is exactly the prey the publication
 *    exposes, and the count is *provably* the hidden part: a card of `H` can only become publicly
 *    located at this seat by a public hit, and a public hit into `H` requires an ask into `H`,
 *    which is the very publication gate 3 tests for. So while the basis is unpublished, **every**
 *    card of `H` in this hand is hidden, and `mine(H)` is the whole exposure rather than an upper
 *    bound on it. (The one leak this cannot see is count-exhaustion — an opponent deducing the
 *    holding from `unknownSlots` without any ask. That is a real over-charge and is recorded as an
 *    assumption rather than papered over.)
 *  - **`perPrey`** — {@link THREAT_COEFFICIENTS}, the same fitted cards-per-prey-card slope
 *    `defuse.ts` credits itself with. Using the defusal slope is deliberate: it makes the two
 *    mechanisms commensurable, so that when both fire on the same ask the arbitration between them
 *    is exact arithmetic rather than a clash of two independently chosen scales (see below).
 *    Global, not a style knob — STYLES.md §3.1 forbids a style from tuning its own geometry.
 *  - **`/(1 + E)`** and **`wHit`** — the same conversion from cards into the ranker's own units
 *    `defuse.ts` uses, for the same reason: without it the appetite would mean something different
 *    in every game. The two conversions being identical is what makes the arbitration cancel.
 *  - **No `p` factor, and this is the one place the two terms genuinely differ.** A defusal is
 *    collected only on the hit branch, so it is weighted by `p`. A *publication* happens on both
 *    branches — row 17 logs the ask whether it hit or missed — so concealment is charged
 *    unconditionally. A guaranteed-miss ask into `H` leaks exactly as much as a certain hit does.
 *  - **`conceal`** — the style's appetite, and the only thing a style contributes.
 *
 * **What the appetite means.** `perPrey` is fitted as cards harvested per reachable prey card per
 * *conceded turn*, so `conceal: 1` charges the publication with **one turn's worth** of exposure.
 * The publication is in fact permanent for the life of the set, so 1 is a deliberate under-charge
 * and the interesting range of the sweep is at and above it. This is stated rather than fitted
 * because there is no honest way to fit it: the number of future turns on which the leak is
 * exploited is a property of the opponents' policy, not of the position.
 *
 * ## The arbitration against defusal, exactly
 *
 * Both terms live in `pickAsk`'s score and they point opposite ways at the same position: defusal
 * says *ask into `B` at the seat that published a basis in it*, concealment says *do not make the
 * first ask into `H`*. They collide precisely when the target has published a basis in `H` and
 * this seat has not. There, on one ask:
 *
 * ```
 * net = (wHit * perPrey / (1 + E)) * ( defuse * p * prey(H)  -  conceal * mine(H) )
 * ```
 *
 * — every shared factor cancels, so **defusal wins iff `defuse * p * prey(H) > conceal * mine(H)`**.
 * At the roster's `defuse: 1` and an appetite of 1 that is `p > mine(H) / prey(H)`. Note
 * `prey(H) >= mine(H)` always ({@link preyInBook} counts cards of `H` certainly on this team, and
 * this seat's own hand is certainly located to itself), so the ratio is a genuine fraction and the
 * two mechanisms split the position on the hit probability. Worked: holding two of `H` with a
 * teammate certainly holding a third, defusal wins above `p = 2/3` and concealment below it. That
 * is the decision/risk matrix's central cell, and it is arithmetic rather than taste.
 *
 * ## When the mechanism is refused, and why each gate is a rule and not a preference
 *
 * 1. **Appetite 0, or `pagat48`.** {@link concealmentActive}. Same compatibility gate
 *    `contained.ts` and `defuse.ts` document, for the same reason: the 48-card game is held
 *    byte-identical and this was measured under `us54` alone.
 * 2. **The set is resolved.** Nothing to conceal in a banked set.
 * 3. **The basis is already public** — this seat has already asked into `H` (row 6, read off the
 *    log through the same {@link LicenceLookup} `defuse.ts` consumes). The second ask into a set
 *    publishes nothing the first did not, so concealment is over and costs nothing. This gate is
 *    what bounds the whole mechanism to one charge per set.
 * 4. **`H` is contained on this team** — every card of it certainly on the viewer's side. This is
 *    the owner's *"unless your team holds the entire half-suit, then signal"* exception, and it is
 *    grounded rather than assumed: CONTAINMENT.md C1 (row 6 again) says no opponent may ask into a
 *    set it holds no card of, so the publication cannot be exploited and the leak is worth exactly
 *    zero. `contained.ts` already owns what to *do* in that position; this file simply gets out of
 *    its way. The predicate is written out here rather than imported so the concealment layer keeps
 *    no dependency on the containment policy — the same discipline `threat.ts` applies to its
 *    duplicate of `E`. **Nothing pins the two agreeing**; they are kept in step by hand, and the
 *    cross-module test is recorded as follow-up in CONCESSION.md §9.
 * 5. **Every card of `H` is certainly located** — the owner's release condition, *"hold the card
 *    until you locate who has all of the other cards in the half-suit"*, verbatim. Once the set is
 *    fully located there is a declare plan for it and the information race is over; withholding the
 *    basis after that buys nothing and only delays the ask that converts it.
 *
 * Pure and deterministic over its arguments. Off at `conceal: 0` — which is the absence of the
 * field, and therefore what every shipped tier and every roster style carries without any of them
 * being edited.
 */
import type { BookId } from '../types.ts'
import { bookCards, cardBook, seatTeam } from '../cards.ts'
import { rulesFor } from '../variants.ts'
import { holderOf } from './knowledge.ts'
import { THREAT_COEFFICIENTS } from './threat.ts'
import type { LicenceLookup } from './defuse.ts'
import type { StyleParams } from './style.ts'
import type { Knowledge, RankedAsk, SeatView } from './types.ts'

/**
 * The style's appetite, read through the optional field.
 *
 * `StyleParams.conceal` is optional so that the **nine roster vectors** are unchanged as source
 * text: none of them mentions the field, and `roster.ts` is untouched by the concealment work.
 *
 * The three shipped tiers are a different story and the distinction is worth keeping honest:
 * `BASELINE` carries an explicit `conceal: 0` beside its explicit `defuse: 0` and `containedPass:
 * 0`, and the tiers spread it. So tier byte-identity rests on a hand-written zero there, exactly as
 * `style.ts` says beside the field, not on the optionality of the type.
 */
export function concealAppetite(style: StyleParams): number {
  return style.conceal ?? 0
}

/** Is the concealment term live for this seat at all? Cheap, and checked before any scan. */
export function concealmentActive(view: SeatView, style: StyleParams): boolean {
  return concealAppetite(style) > 0 && rulesFor(view.config).wrongDeclare === 'opponents'
}

/**
 * Every card of `book` certainly on the viewer's own team — CONTAINMENT.md C1's absorbing state,
 * read one book at a time.
 *
 * Identical in meaning to membership of `contained.ts`'s `containedBooks`, restricted to the books
 * a legal ask can name. `containedBooks` additionally requires that the seat holds at least one
 * card of the book and not all six; row 6 guarantees the first for any legal ask and row 7 the
 * second, so on this file's inputs the two predicates coincide — which is what
 * `tests/bots/conceal.test.ts` pins.
 */
export function bookContainedOnOwnTeam(view: SeatView, k: Knowledge, book: BookId): boolean {
  const myTeam = seatTeam(view.seat)
  for (const c of bookCards(book, view.config)) {
    const cand = k.cands[c]
    if (cand === undefined || cand.length === 0) return false
    if (!cand.every((s) => seatTeam(s) === myTeam)) return false
  }
  return true
}

/** Cards of `book` whose current holder is not certainly known to the viewer. */
export function unlocatedInBook(view: SeatView, k: Knowledge, book: BookId): number {
  let n = 0
  for (const c of bookCards(book, view.config)) {
    if (holderOf(k, c) === null) n++
  }
  return n
}

/** Cards of `book` in the viewer's own hand — the exposure a first ask into `book` publishes. */
export function ownCardsInBook(view: SeatView, book: BookId): number {
  let n = 0
  for (const c of view.hand) {
    if (cardBook(c) === book) n++
  }
  return n
}

/**
 * The concealment charge for one ask, in the ask ranker's own score units, to be **subtracted**
 * from the score. See the file header for the derivation and for each gate's grounding. Returns 0
 * whenever the mechanism is off, the publication is not new, or the leak is worth nothing.
 *
 * `licences` is the same lookup `defusalBonus` consumes, and it is queried at the **viewer's own**
 * seat: "have I already published a basis in this set". Sharing the lookup keeps one log scan per
 * decision serving both halves of the concession layer.
 */
export function concealmentPenalty(
  view: SeatView,
  k: Knowledge,
  style: StyleParams,
  askOf: RankedAsk,
  turn: number,
  licences: LicenceLookup,
): number {
  if (!concealmentActive(view, style)) return 0
  const book = cardBook(askOf.card)
  // 2. A banked set has nothing left to conceal.
  if (view.books[book]) return 0
  // 3. The basis is already public — the charge is paid once per set and this is not that ask.
  if (licences(view.seat).has(book)) return 0
  // 4. CONTAINMENT.md C1: no opponent may ask into a set it holds no card of, so a publication
  //    about a contained set cannot be exploited. This is the owner's "then you want to signal".
  if (bookContainedOnOwnTeam(view, k, book)) return 0
  // 5. The owner's release condition: once every card of the set is located the race is over.
  if (unlocatedInBook(view, k, book) === 0) return 0
  const mine = ownCardsInBook(view, book)
  // Unreachable for a legal ask (row 6 requires a card of the set in hand), kept as a guard so the
  // term can never be negative or free.
  if (mine === 0) return 0
  return (concealAppetite(style) * style.wHit * THREAT_COEFFICIENTS.perPrey * mine) / (1 + turn)
}
