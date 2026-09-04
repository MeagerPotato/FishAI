/**
 * closing.ts — the closing ask (MONET.md §3.8h, Monet v0.12).
 *
 * ## What the majority study found (MONET.md §3.8g)
 *
 * On 14,400 recorded games of Monet v0.9 against SESTINA v1.0, and replicated on 28,800 more, the
 * largest remaining bucket of the margin is the two-against-four split: the half-suits one side
 * holds four or five of and still does not cash. Three facts about it, each measured at the ask
 * decision through Monet's own inference:
 *
 *  - Where a *chase* is legal — an unresolved set the side holds four or five of, the asker holds
 *    a card of it (row 6's licence), and an opponent holds one of the cards still missing — the
 *    ask taken chases at **31.6%** of Monet's decisions and **36.2%** of SESTINA's, behind on
 *    twelve seeds of twelve.
 *  - The majorities a side ever chased are cashed by it **59.8%** of the time for Monet and
 *    **68.7%** for SESTINA, and SESTINA resolves them about six events sooner.
 *  - Where every missing card is *known* to sit with an opponent, both policies chase only about
 *    one decision in five: each prefers another certain hit somewhere else on the table. **That
 *    preference is what this file prices** — not a belief, and not a new probability.
 *
 * The bound the record put on it is 0.39 sets a game.
 *
 * ## The term
 *
 * One credit, behind a Monet-only knob that is byte identity when absent or 0:
 *
 *  - **`closing`** — a credit on the HIT branch for an ask that would bring the set within reach
 *    of the side that is already holding most of it: `closing · wHit · p · lock`, where `lock` is
 *    1 when the hit would leave nothing of the set outside the side's own hands, 0.5 when it
 *    would leave one card, and 0 at two or more. The seat measures its side's holding **as it
 *    knows it** — its own cards and the cards it can certainly place with a teammate — so the
 *    credit is a statement about certainties, not about the posterior. `lock` is larger on the
 *    completing ask than on the one before it, which is the shape §3.8g's "weighted by the side's
 *    holding" asks for; the record reports the fit split by that rung, because the base ranker
 *    already pays `gambleBonus` on the completing ask and pays nothing extra one card earlier.
 *  - **`closingBelief`** — the same credit with the seat's *belief* let into the count: a card
 *    nobody can place counts against the side only by the chance an opponent holds it. Because
 *    that chance is at most 1, the belief form is pointwise the larger credit over the larger
 *    population, and the difference between the two forms is exactly what §3.8g's R1 measured —
 *    Monet's marginal rates 21.4% of the opponent-held missing cards as sitting on its own side
 *    (the same inference at SESTINA's positions reads 11.1%), so the belief form will over-credit
 *    the sets that are not in fact near closing. Which trade is worth more is a question for the
 *    fit, not for this file. Inert without a live `closing`.
 *
 * ## What it may not do
 *
 * **It never moves an uncertain ask above a certain hit.** `pickAsk` gates it below every legal
 * certain hit exactly as it gates the concession terms — and, unlike the priced terms of §3.8e,
 * with no ungating switch: §3.8g measured that NEITHER policy prefers an uncertain chase to a
 * certain hit, so a credit that bought that trade would be arguing with its own evidence. The
 * credit is live *among* certain hits, which is the bucket the study named.
 *
 * **It never pays for a sure miss.** An ask for a card a teammate certainly holds is a miss by
 * construction (no opponent can hold it), and §3.8g counts those as a third of the non-chase asks
 * on both sides. `p` is already 0 there — `pHit` returns 0 for a target outside the card's
 * candidates — but the guard is written out rather than inherited from a probability convention
 * in another file.
 *
 * Pure and deterministic over `(view, k, style, ask, p)`: no clock, no rng, no module state. It
 * reads the certain holders through `holderOf` and, under `closingBelief` only, the same
 * `askHitProbability` the ranker itself scores with — never `attachMarginal`, which would install
 * a table into the shared cache and change what every later reader of that `Knowledge` answers.
 * It never reads `view.hand`: a seat's own cards carry a certain holder equal to that seat in its
 * own `Knowledge` (`materialise` fixes them from `pos`), so the walk needs no hand scan and has
 * no array to be malformed.
 */
import type { Card, Seat } from '../types.ts'
import { ALL_SEATS, bookCards, cardBook, seatTeam } from '../cards.ts'
import { askHitProbability, holderOf } from './knowledge.ts'
import type { StyleParams } from './style.ts'
import type { Knowledge, RankedAsk, SeatView } from './types.ts'

/** Is the closing credit live for this style? Read once per decision. */
export function closingActive(style: StyleParams): boolean {
  return (style.closing ?? 0) > 0
}

/** Does the closing credit count open cards by belief rather than by certainty? Inert without `closing`. */
export function closingBelief(style: StyleParams): boolean {
  return (style.closing ?? 0) > 0 && style.closingBelief === true
}

/** What a hit would leave outstanding in the asked card's set, by certainty and by belief. */
export interface ClosingPicture {
  /** Cards of the set, other than the asked one, this seat cannot certainly place on its own team. */
  outstanding: number
  /**
   * The same cards weighted by the chance an opponent holds each — a located opponent card counts
   * 1, an open one its opponent mass. Never larger than `outstanding`. Only computed under
   * `closingBelief`; 0 otherwise, and unread.
   */
  outstandingSoft: number
}

/**
 * The asked card's set as this seat can account for it, after the hit. Walks the set once, skipping
 * the asked card and every card certainly on the seat's own team (its own hand included — see the
 * header on why no hand scan is needed). The belief sum is computed only when asked for, so the
 * certain form never pays for it.
 */
export function closingPicture(view: SeatView, k: Knowledge, card: Card, belief: boolean): ClosingPicture {
  const me = seatTeam(view.seat)
  let outstanding = 0
  let outstandingSoft = 0
  for (const c of bookCards(cardBook(card), view.config)) {
    if (c === card) continue
    const h = holderOf(k, c)
    if (h !== null) {
      if (seatTeam(h) === me) continue
      // Certainly with an opponent: one card of the set the side does not have, and knows it.
      outstanding++
      if (belief) outstandingSoft += 1
      continue
    }
    outstanding++
    if (!belief) continue
    let pOpp = 0
    for (const s of ALL_SEATS) {
      if (seatTeam(s) === me) continue
      pOpp += askHitProbability(k, c, s)
    }
    outstandingSoft += Math.min(1, pOpp)
  }
  return { outstanding, outstandingSoft }
}

/**
 * The closing credit: `closing · wHit · p · lock` for an ask that would bring the asker's side
 * within reach of a set it already holds most of. Zero when the knob is absent or 0, for a set
 * already resolved, for an ask a teammate's certain holding makes a sure miss, for `p` at 0, and
 * whenever the hit would still leave the horizon's worth of the set outside the side's hands —
 * which under `us54` means the credit fires only at a seat-known holding of four or five of six.
 *
 * `lock` is `1 − outstanding / horizon` with `horizon` the number of cards a bare majority may be
 * missing (2 of 6), so it is 1, 0.5 or nothing. The `!(lock > 0)` test also disposes of a NaN,
 * which is why the arithmetic below needs no other guard.
 */
export function closingCredit(view: SeatView, k: Knowledge, style: StyleParams, ask: RankedAsk, p: number): number {
  const appetite = style.closing ?? 0
  if (!(appetite > 0)) return 0
  if (!(p > 0)) return 0
  const book = cardBook(ask.card)
  if (view.books[book]) return 0
  // A card a teammate certainly holds cannot be with the opponent being asked: the ask is a sure
  // miss into the side's own majority, and §3.8g counts it on the other side of the ledger.
  const owner = holderOf(k, ask.card)
  if (owner !== null && seatTeam(owner) === seatTeam(view.seat)) return 0
  const size = bookCards(book, view.config).length
  const horizon = size - (Math.floor(size / 2) + 1)
  if (horizon <= 0) return 0
  const belief = style.closingBelief === true
  const picture = closingPicture(view, k, ask.card, belief)
  const outstanding = belief ? picture.outstandingSoft : picture.outstanding
  const lock = 1 - outstanding / horizon
  if (!(lock > 0)) return 0
  return appetite * style.wHit * p * Math.min(1, lock)
}

export type { Seat }
