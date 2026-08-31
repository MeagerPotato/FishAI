/**
 * threat.ts — what a seat could do with the turn, priced in cards
 * ([CONCESSION.md](../../../CONCESSION.md)).
 *
 * Every ask is three things at once: a bet on a card, a broadcast to the table, and — on a miss —
 * a concession of the turn to a named opponent. RULES_US54.md row 10 hands the turn to whoever
 * was asked; row 9 keeps it on a hit. So the miss branch of every ask carries a cost that depends
 * on *which seat receives the turn*, and until now the engine has priced that cost by hand size
 * alone: `missTarget` ranks candidates by `counts[]` ([decide.ts](decide.ts) `pickAsk`), and
 * `valueContainedPass` charges `E * n_t / meanHand` ([contained.ts](contained.ts)).
 *
 * **Measured, and this is the reason the file exists: hand size has the wrong sign.** Over 12,376
 * observed concessions the correlation between the conceded seat's hand size and the cards it
 * then actually took was **-0.147**, negative in every game-phase bucket. The licence-based
 * estimate below scores **+0.421** on the same data, with a 3.2x lift between its bottom and top
 * deciles. CONCESSION.md §1.2 carries the table.
 *
 * ## What the estimate is, and why it is derivable at all
 *
 * A seat can only ask into a set it holds a card of (row 6), and an ask publishes exactly that:
 * *the asker holds at least one card of this set*. That fact is public, permanent until the set
 * resolves, and it is the only thing about an opponent's hand that is reliably knowable. So a
 * seat's **reach** is the sets it has publicly shown a basis in, and its **prey** is the cards of
 * those sets that the viewer can certainly locate on the viewer's own team — the cards it could
 * actually come and take.
 *
 * The licence is read off the **public log**, not off `Knowledge.constraints`, and the difference
 * is large rather than stylistic. `knowledge.ts` records an ask as a deal-time set-constraint and
 * **drops it the moment it is satisfied or exhausted** ([types.ts](types.ts) `KnowledgeConstraint`),
 * which is exactly when the seat has been shown to hold a card of the set — i.e. precisely when
 * the threat is most real. Measured: reading the licence off the log instead roughly doubles the
 * share of harvest threats a seat can see (6.0% -> 11.7%) and takes detection of the canonical
 * five-and-one position from 7.1% to 35.0%.
 *
 * ## What this file deliberately does NOT model
 *
 * **Declares.** Under RULES_US54.md row 11 a declare needs no turn — every seat is offered the
 * option in the §3 window. Pricing an opponent's declare into the value of a *turn* would charge
 * twice for a resource it already has. The turn buys asks, and asks alone.
 *
 * **The receiving seat's hidden hand.** Nothing here reads any hand but the viewer's own, so the
 * estimate is a lower bound on reach that ignores every basis the seat has not yet published. It
 * is worst early, before anyone has asked, where it correctly returns almost nothing.
 *
 * Pure and deterministic over `(view, k, seat)`: no clock, no rng, no module-level state.
 */
import type { BookId, Seat } from '../types.ts'
import { bookCards, cardBook, seatTeam } from '../cards.ts'
import { holderOf } from './knowledge.ts'
import type { Knowledge, SeatView } from './types.ts'

/**
 * The unresolved sets `seat` has publicly shown a basis in — RULES_US54.md row 6, read off the
 * log. An ask proves the asker held a card of the set at that moment.
 *
 * Two retirements, and both matter:
 *
 *  - **The set resolved.** A banked set is no longer a place anything can be taken from.
 *  - **The seat has provably shed the basis.** A seat that was asked and hit on every card of the
 *    set it held keeps no reach into it, and that is public too. Encoded as: the licence dies once
 *    every card of the set is *certainly located somewhere else*, or the seat holds no cards at
 *    all. This is the same retirement `knowledge.ts` applies to its own deal-time constraints
 *    ([types.ts](types.ts) `KnowledgeConstraint`), so the two agree about when a basis is spent.
 *
 * **A bounded seat is NOT exempt from this scan, and that is a known limitation rather than a
 * design.** `decide` builds the licence lookup from the whole public log for every seat, bounded
 * or not; only the *retirement* half is budgeted, because it reads that seat's restricted `k`.
 * BOUNDED.md caps retention, and a licence is derived here rather than retained, so the v1.5 cost
 * model does not price it. Moving it into the fact pool as a first-class 1-bit `basis` read is the
 * correct end state and is recorded as follow-up in CONCESSION.md §9; doing it now would move every
 * committed v1.5 number.
 *
 * It remains an over-estimate in one direction that public information cannot close: a seat that
 * shed its basis onto cards whose new holder is not certainly known still looks live here. That
 * is sound for the use this estimate is put to — see `defuse.ts` on why the model may be used to
 * act on proven reach and never to certify a seat as harmless.
 */
export function seatLicences(view: SeatView, k: Knowledge, seat: Seat): Set<BookId> {
  const out = new Set<BookId>()
  for (const ev of view.log) {
    if (ev.type !== 'ask' || ev.asker !== seat) continue
    out.add(cardBook(ev.card))
  }
  if (out.size === 0) return out
  const cardless = view.counts[seat] === 0
  for (const b of [...out]) {
    if (view.books[b] || cardless) {
      out.delete(b)
      continue
    }
    // Every member certainly located away from `seat` means the basis is spent.
    let reachable = false
    for (const c of bookCards(b, view.config)) {
      const h = holderOf(k, c)
      if (h === null || h === seat) {
        reachable = true
        break
      }
    }
    if (!reachable) out.delete(b)
  }
  return out
}

/**
 * Cards of `book` that the viewer can certainly locate on the **viewer's own team** — the cards
 * an opponent with a licence in `book` could come and take.
 *
 * Certainly located, not merely believed: a card whose holder is still ambiguous is one the
 * asking seat is no more likely to find than the viewer is, and crediting it would inflate every
 * threat uniformly, which is the same as crediting none of them.
 */
export function preyInBook(view: SeatView, k: Knowledge, book: BookId): number {
  const myTeam = seatTeam(view.seat)
  let n = 0
  for (const c of bookCards(book, view.config)) {
    const h = holderOf(k, c)
    if (h !== null && seatTeam(h) === myTeam) n++
  }
  return n
}

/** What one seat could do with the turn, and the evidence it was derived from. */
export interface SeatThreat {
  seat: Seat
  /** Unresolved sets this seat has publicly shown a basis in (row 6). */
  licences: readonly BookId[]
  /** Cards of those sets certainly located on the viewer's team — the reachable prey. */
  prey: number
  /** The estimate in cards: {@link THREAT_COEFFICIENTS} applied to `prey`. */
  cards: number
}

/**
 * The fitted cost of conceding a turn, in cards.
 *
 * `cards = base + perPrey * prey`, least-squares over the 12,376 concessions of CONCESSION.md §1.1
 * (300 `us54` games, all-Balanced seats, ground truth read from the hands, estimate read from the
 * public view). `base` is what a conceded turn costs when the receiving seat has published no
 * reach at all, so it sits *below* the unconditional cost by construction and is not the quantity
 * to cross-check against `E`.
 *
 * The cross-check belongs to the **unconditional** mean: CONCESSION.md §1.1 measures 1.304 cards
 * per conceded turn, and `contained.ts`'s independent `E = hits / max(1, misses)` derivation of
 * the same quantity lands beside it — two different arguments agreeing on the value of a turn,
 * which is the reason to trust either. `base` and `perPrey` are the conditional decomposition of
 * that same mean.
 *
 * **Global, not a style field**, by the STYLES.md §3.1 argument: this is the *geometry* of the
 * mechanism, measured off the game rather than chosen. A style contributes only its appetite
 * (`defuse`), so no style can win by re-fitting the world in its own favour.
 */
export const THREAT_COEFFICIENTS = Object.freeze({ base: 0.885, perPrey: 0.391 })

/** The threat one seat poses to the viewer's team, with the evidence. */
export function seatThreat(view: SeatView, k: Knowledge, seat: Seat): SeatThreat {
  const licences = [...seatLicences(view, k, seat)]
  let prey = 0
  for (const b of licences) prey += preyInBook(view, k, b)
  return {
    seat,
    licences,
    prey,
    cards: THREAT_COEFFICIENTS.base + THREAT_COEFFICIENTS.perPrey * prey,
  }
}

/**
 * Cards a turn yields its holder, measured off the public log: `hits / max(1, misses)`.
 *
 * Row 9 keeps the turn on a hit and row 10 ends it on a miss, so a turn is a geometric run of
 * hits whose expected length is `h / (1 - h)` — which on counts is exactly hits over misses.
 * Identical in form and intent to `contained.ts`'s `PassValuation.E`, and duplicated here rather
 * than imported so the threat layer keeps no dependency on the containment policy. **Nothing pins
 * the two equal — they are kept in step by hand**, and a cross-module test asserting it is recorded
 * as follow-up in CONCESSION.md §9. No table constant: a roster that hits more often prices a turn
 * higher by itself.
 */
export function turnYield(view: SeatView): number {
  let hits = 0
  let misses = 0
  for (const ev of view.log) {
    if (ev.type !== 'ask') continue
    if (ev.hit) hits++
    else misses++
  }
  return hits / Math.max(1, misses)
}
