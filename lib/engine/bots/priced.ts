/**
 * priced.ts — the two priced terms on an ordinary ask (MONET.md §3.8d, Monet v0.9).
 *
 * ## What the attribution study found (MONET.md §3.8c)
 *
 * At SESTINA's own ask decisions, Monet v0.4c's greedy pick would hit 62.5% of the time against
 * SESTINA's actual 55.7% — on every seed, in every holding bucket — and SESTINA wins two games in
 * three. Its hits are taken back before the set resolves 32% of the time against Monet's 41%, and
 * end in a set it cashes 76% of the time against Monet's 62%. The hit chance is not the value of
 * an ask. Two things an ask does beside landing a card are priced here, each behind a Monet-only
 * knob that is byte-identity when absent or 0:
 *
 *  - **`contest`** — a credit on the MISS branch for asking into a set the opponents dominate and
 *    whose ownership is still open. A miss there publishes a licence the opponents already knew
 *    the team had a card for (the set is theirs to lose, not ours to hide), narrows the open
 *    cards for the whole team, and hands the turn to a seat busy with a set it is about to lock
 *    anyway; the credit is proportional to the chance of the miss, the opponents' expected share
 *    of the set, and the share of its cards nobody can yet place. FishLab's own attribution of
 *    SESTINA v1.0 names a term of this shape as its largest single component — an ask policy that
 *    "plays a worse game by its own KPIs" (FishLab, ADVERSARIES.md) and takes more half-suits —
 *    which is the finding this term tests in Monet's own units; the arithmetic is ours.
 *  - **`exposure`** — a charge on the HIT branch for what a hit gives away. A hit puts the card
 *    publicly in the asker's hand; if the opponents keep a card of the set they keep a licence,
 *    and a certain ask on a public card is the first thing any policy plays, so the card comes
 *    back unless the team locks the set first. The charge is proportional to the hit chance, the
 *    chance the opponents still hold a card of the set after the hit, and the chance the team
 *    cannot run the rest of the set out in one turn.
 *
 * Both terms are in the ranker's own units (`wHit` buys one unit of hit probability), both are
 * computed from the seat's public knowledge only — the marginal table and the certain holders —
 * and both are gated in `pickAsk` the way the concession terms are: they never move an uncertain
 * ask above a certain hit, and a certain hit pays neither — unless `exposureCertain` is on
 * (MONET.md §3.8e, the v0.10 form): then a certain hit pays the exposure charge like any other,
 * and `pickAsk` leaves both terms in place beside a legal certain hit, so an exposed certain hit
 * can lose to a contested ask. `pricedUngated` below is that switch, read once per decision.
 *
 * Pure and deterministic over `(view, k, style, ask, p)`: no clock, no rng, no module state.
 */
import type { BookId, Card, Seat } from '../types.ts'
import { ALL_SEATS, bookCards, cardBook, seatTeam } from '../cards.ts'
import { askHitProbability, holderOf } from './knowledge.ts'
import type { StyleParams } from './style.ts'
import type { Knowledge, RankedAsk, SeatView } from './types.ts'

/** Is either priced term live for this style? Read once per decision. */
export function pricedActive(style: StyleParams): boolean {
  return (style.contest ?? 0) > 0 || (style.exposure ?? 0) > 0
}

/**
 * MONET.md §3.8e — are the priced terms ungated, and the exposure charge due on certain hits? Only
 * with a live exposure charge AND `exposureCertain: true`; `exposureCertain` alone changes nothing.
 */
export function pricedUngated(style: StyleParams): boolean {
  return (style.exposure ?? 0) > 0 && style.exposureCertain === true
}

/** How the set looks to this seat: the opponents' expected share of it, and how much of it nobody can place. */
export interface SetPicture {
  /** Expected number of the set's cards in opponents' hands (certain ones count 1, unknown ones their probability). */
  oppMass: number
  /** Cards of the set whose holder this seat cannot name (not in its hand, no certain holder). */
  ambiguous: number
}

export function setPicture(view: SeatView, k: Knowledge, book: BookId): SetPicture {
  const me = seatTeam(view.seat)
  const held = new Set<Card>(view.hand)
  let oppMass = 0
  let ambiguous = 0
  for (const c of bookCards(book, view.config)) {
    if (held.has(c)) continue
    const h = holderOf(k, c)
    if (h !== null) {
      if (seatTeam(h) !== me) oppMass += 1
      continue
    }
    ambiguous++
    oppMass += Math.min(1, opponentMass(k, c, me))
  }
  return { oppMass, ambiguous }
}

/** P(an opponent of team `me` holds `card`), summed over the opponent seats (the events are exclusive). */
function opponentMass(k: Knowledge, card: Card, me: 0 | 1): number {
  let p = 0
  for (const s of ALL_SEATS) if (seatTeam(s) !== me) p += askHitProbability(k, card, s)
  return p
}

/**
 * The contest credit: `contest · wHit · (1 − p) · oppMass/6 · ambiguous/6` for an ask into an
 * unresolved set. Zero for a certain hit (nothing to miss), for a resolved set, and when the knob
 * is absent or 0.
 */
export function contestBonus(view: SeatView, k: Knowledge, style: StyleParams, ask: RankedAsk, p: number): number {
  const appetite = style.contest ?? 0
  if (!(appetite > 0)) return 0
  if (p >= 1) return 0
  const book = cardBook(ask.card)
  if (view.books[book]) return 0
  const pic = setPicture(view, k, book)
  const n = bookCards(book, view.config).length
  if (n === 0) return 0
  return appetite * style.wHit * (1 - p) * (pic.oppMass / n) * (pic.ambiguous / n)
}

/** The hit's exposure, decomposed for the trace. */
export interface Exposure {
  /** Cards of the set, other than the asked one, not certainly on the asker's team. */
  distance: number
  /** Expected number of those still with opponents after the hit. */
  oppAfter: number
  /** The chance the team runs those out in consecutive certain-or-best asks, as this seat sees it. */
  closeChance: number
  /** `min(1, oppAfter) · (1 − closeChance)`, 0 when the hit would lock the set. */
  risk: number
}

export function hitExposure(view: SeatView, k: Knowledge, card: Card): Exposure {
  const me = seatTeam(view.seat)
  const held = new Set<Card>(view.hand)
  let distance = 0
  let oppAfter = 0
  let closeChance = 1
  for (const c of bookCards(cardBook(card), view.config)) {
    if (c === card || held.has(c)) continue
    const h = holderOf(k, c)
    if (h !== null) {
      if (seatTeam(h) === me) continue
      // a located opponent card: one certain ask away
      distance++
      oppAfter += 1
      continue
    }
    distance++
    let pOpp = 0
    let best = 0
    for (const s of ALL_SEATS) {
      if (seatTeam(s) === me) continue
      const q = askHitProbability(k, c, s)
      pOpp += q
      if (q > best) best = q
    }
    oppAfter += Math.min(1, pOpp)
    closeChance *= best
  }
  const risk = distance === 0 ? 0 : Math.min(1, oppAfter) * (1 - closeChance)
  return { distance, oppAfter, closeChance, risk }
}

/**
 * The exposure charge: `exposure · wHit · p · risk` for an uncertain ask into an unresolved set.
 * Zero for a certain hit (it stays first) unless `exposureCertain` is on (§3.8e), for a resolved
 * set, and when the knob is absent or 0.
 */
export function exposurePenalty(view: SeatView, k: Knowledge, style: StyleParams, ask: RankedAsk, p: number): number {
  const appetite = style.exposure ?? 0
  if (!(appetite > 0)) return 0
  if (p <= 0) return 0
  if (p >= 1 && !pricedUngated(style)) return 0
  const book = cardBook(ask.card)
  if (view.books[book]) return 0
  const x = hitExposure(view, k, ask.card)
  if (x.risk <= 0) return 0
  return appetite * style.wHit * p * x.risk
}

/** Both terms at once, for the ranker: the credit less the charge. */
export function pricedAdjustment(view: SeatView, k: Knowledge, style: StyleParams, ask: RankedAsk, p: number): number {
  return contestBonus(view, k, style, ask, p) - exposurePenalty(view, k, style, ask, p)
}

export type { Seat }
