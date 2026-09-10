/**
 * askhistory.ts — MONET.md §3.8af: what the public log says about each seat's dealings with each
 * half-suit, read once per decision. Shared by the ask clone's second and third feature sets
 * (imitation.ts) and by the holder clone (holder.ts, §3.8ah), so the two read the same log the same
 * way. Pure over the view: the log and the seats, nothing else — and no hand but the viewer's own is
 * in the view to begin with.
 */
import type { BookId, Seat, Team } from '../types.ts'
import { cardBook, seatTeam } from '../cards.ts'
import type { Knowledge, SeatView } from './types.ts'

/** The ask-choice prior's strength `indepK` is built with: the value SESTINA's spec names (`kappa=2.5`). */
export const INDEP_KAPPA = 2.5

/**
 * Per seat × half-suit the asks, their hits and misses, the cards taken from the seat and the misses
 * at it, and when it last asked; per half-suit the asks, the opponents' asks and the last ask; per
 * seat the last ask and the distinct half-suits asked. Indices are positions in the log's ask order,
 * −1 for never; `asks` is the total.
 */
export interface SeatBookHistory {
  asks: number
  bookAsks: Int32Array
  bookAsksThem: Int32Array
  bookLast: Int32Array
  sbAsks: Int32Array
  sbHits: Int32Array
  sbMisses: Int32Array
  sbTaken: Int32Array
  sbMissedAt: Int32Array
  sbLast: Int32Array
  seatLast: Int32Array
  seatBooks: Int32Array
}

export function seatBookHistory(view: SeatView, bookIdx: ReadonlyMap<BookId, number>, myTeam: Team): SeatBookHistory {
  const NB = bookIdx.size
  const h: SeatBookHistory = {
    asks: 0,
    bookAsks: new Int32Array(NB),
    bookAsksThem: new Int32Array(NB),
    bookLast: new Int32Array(NB).fill(-1),
    sbAsks: new Int32Array(6 * NB),
    sbHits: new Int32Array(6 * NB),
    sbMisses: new Int32Array(6 * NB),
    sbTaken: new Int32Array(6 * NB),
    sbMissedAt: new Int32Array(6 * NB),
    sbLast: new Int32Array(6 * NB).fill(-1),
    seatLast: new Int32Array(6).fill(-1),
    seatBooks: new Int32Array(6),
  }
  const seen = new Uint8Array(6 * NB)
  for (const ev of view.log) {
    if (ev.type !== 'ask') continue
    const bi = bookIdx.get(cardBook(ev.card))
    if (bi === undefined) continue
    const n = h.asks++
    h.bookAsks[bi]++
    if (seatTeam(ev.asker) !== myTeam) h.bookAsksThem[bi]++
    h.bookLast[bi] = n
    const a = ev.asker * NB + bi
    const t = ev.target * NB + bi
    h.sbAsks[a]++
    if (ev.hit) {
      h.sbHits[a]++
      h.sbTaken[t]++
    } else {
      h.sbMisses[a]++
      h.sbMissedAt[t]++
    }
    h.sbLast[a] = n
    h.seatLast[ev.asker] = n
    if (seen[a] === 0) {
      seen[a] = 1
      h.seatBooks[ev.asker]++
    }
  }
  return h
}

/** Asks since the ask at `last` (−1 for never), over twenty, capped at 1. */
export function agoOf(last: number, asks: number): number {
  return last < 0 ? 1 : Math.min(20, asks - 1 - last) / 20
}

/**
 * The slot prior with an ask-choice prior laid on it: each candidate seat's free slots, multiplied by
 * (1 + κ) per ask it made into the card's half-suit (saturating at three), the target's share of the
 * total. The certainties are the slot prior's own.
 */
export function indepK(k: Knowledge, h: SeatBookHistory, cand: readonly Seat[], target: Seat, bi: number, NB: number): number {
  if (cand.length === 0 || !cand.includes(target)) return 0
  if (cand.length === 1) return 1
  let total = 0
  let mine = 0
  for (const s of cand) {
    const w = k.unknownSlots[s] * Math.pow(1 + INDEP_KAPPA, Math.min(3, h.sbAsks[s * NB + bi]))
    total += w
    if (s === target) mine = w
  }
  return total > 0 ? mine / total : 1 / cand.length
}
