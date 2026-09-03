/**
 * consensus.ts - MONET.md 3.8b: the determinized declare's evidence.
 *
 * A seat that holds a card of an unresolved set, and whose posterior says the other five are on
 * its team, cannot claim the set under the certain claim unless every card is LOCATED - a
 * candidate list of one. The joint constraints the walk cannot reduce to singletons (counts,
 * licences, the choice prior) can still leave one consistent placement, or one dominant one, and
 * sampling is how that is read: D deals are drawn from the posterior (`determinize.ts`), the
 * set's six holders are read off each, and the modal full assignment among the deals that put
 * the set on this team is the claim, its share of the D deals requested the agreement. Failed
 * draws count against the agreement, never for it. Pure: a view, a knowledge, a book, a count
 * and a seeded generator in; no engine state.
 */
import type { BookId, Card, Seat } from '../types.ts'
import { bookCards, seatTeam } from '../cards.ts'
import type { Knowledge, SeatView } from './types.ts'
import { sampleDeal } from './determinize.ts'
import type { Rng } from './determinize.ts'

export interface Consensus {
  book: BookId
  /** Deals requested (D). */
  det: number
  /** Draws the sampler could not complete within its tries. */
  failed: number
  /** Deals in which every card of the set sits on the viewer's team. */
  teamDeals: number
  /** The modal full assignment's share of the D deals requested. */
  agreement: number
  /** The modal assignment (card -> seat, the viewer's own cards at the viewer), or null when no deal put the set on the team. */
  assignment: Record<Card, Seat> | null
}

/** The determinization consensus for `book` from the viewer's posterior over `det` sampled deals. */
export function consensusFor(view: SeatView, k: Knowledge, book: BookId, det: number, rng: Rng): Consensus {
  const cards = bookCards(book, view.config)
  const want = new Set<Card>(cards)
  const team = seatTeam(view.seat)
  const counts = new Map<string, number>()
  let failed = 0
  let teamDeals = 0
  for (let d = 0; d < det; d++) {
    const hands = sampleDeal(view, k, rng)
    if (hands === null) {
      failed++
      continue
    }
    const holder = new Map<Card, Seat>()
    for (let s = 0; s < 6; s++) for (const c of hands[s]) if (want.has(c)) holder.set(c, s as Seat)
    let ours = true
    for (const c of cards) {
      const s = holder.get(c)
      if (s === undefined || seatTeam(s) !== team) {
        ours = false
        break
      }
    }
    if (!ours) continue
    teamDeals++
    const key = cards.map((c) => holder.get(c)).join(',')
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let modal = ''
  let modalCount = 0
  for (const [key, n] of counts) {
    if (n > modalCount || (n === modalCount && key < modal)) {
      modal = key
      modalCount = n
    }
  }
  let assignment: Record<Card, Seat> | null = null
  if (modalCount > 0) {
    const seats = modal.split(',').map((x) => Number(x) as Seat)
    const built: Partial<Record<Card, Seat>> = {}
    cards.forEach((c, i) => {
      built[c] = seats[i]
    })
    assignment = built as Record<Card, Seat>
  }
  return { book, det, failed, teamDeals, agreement: det > 0 ? modalCount / det : 0, assignment }
}
