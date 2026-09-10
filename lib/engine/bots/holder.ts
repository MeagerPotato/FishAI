/**
 * holder.ts — MONET.md §3.8ah: the holder clone, a fitted belief about who holds each card the viewer
 * cannot place. §3.8af found the clone's remaining disagreement with SESTINA is the seat — its belief
 * about which seat holds a card is not ours — and §3.8ad's F2 found the width buys nothing there. The
 * bridge records hold the true deal of every game, so the belief can be fitted rather than modelled:
 * at every unplaced card, one feature row per candidate seat (the marginal, the slot prior, the prior
 * under SESTINA's ask-choice strength, the seat's hand and slots, its dealings with the half-suit off
 * the log, what it certainly holds of it, the constraints on it), the true holder the label, a
 * conditional logit over the candidates the model — the same fit as the ask clone's over another
 * list (scripts/gen-holder-data.mjs, scripts/fit-imitation.mjs `--kind holder`).
 *
 * In play the belief is a feature of the ask clone's third set (imitation.ts, `ASK_FEATURES_3`): the
 * probability the model gives the target for the asked card, beside the marginal's. Nothing on the
 * decision path reads a holder model unless an ask model at the third width names one. Public-view
 * only, as everything in this directory: the view, the knowledge built from it, the log.
 */
import type { BookId, Card, Seat, Team } from '../types.ts'
import { allBooks, bookCards, cardBook, seatTeam } from '../cards.ts'
import { askHitProbability, slotPriorHitProbability } from './knowledge.ts'
import type { Knowledge, SeatView } from './types.ts'
import { compileNet, forwardNet } from './net.ts'
import type { CompiledNet, DenseModel } from './net.ts'
import { agoOf, indepK, seatBookHistory } from './askhistory.ts'
import type { SeatBookHistory } from './askhistory.ts'

/** The features of one (card, candidate seat) row, in order. */
export const HOLDER_FEATURES = [
  /** Our marginal's probability that the seat holds the card (`askHitProbability`). */
  'pMarg',
  /** The slot prior's. */
  'pSlot',
  /** The slot prior under the ask-choice prior at SESTINA's strength (`indepK`). */
  'pIndepK',
  /** The card's candidate seats, over five. */
  'candCount',
  /** The seat's unidentified slots, over twelve, capped at one. */
  'seatUnknown',
  /** The seat's hand size, over twelve, capped at one. */
  'seatCount',
  /** The seat is on the viewer's team. */
  'sameTeam',
  /** The seat's asks into the card's half-suit, their hits and misses, the cards taken from it and the misses at it (each capped at three). */
  'seatBookAsks',
  'seatBookHits',
  'seatBookMisses',
  'seatBookTaken',
  'seatBookMissedAt',
  /** Asks since the seat last asked into the half-suit, and since it last asked at all. */
  'seatBookAgo',
  'seatAgo',
  /** The distinct half-suits the seat has asked into, over the half-suits. */
  'seatBooks',
  /** The cards of the half-suit the seat certainly holds, over six. */
  'seatKnownInBook',
  /** The tightest live constraint naming the seat and the card: one over the cards still possibly with it. */
  'seatConstraint',
  /** The half-suit's cards still unplaced with two or more candidates, over six. */
  'bookUnknown',
  /** Asks into the half-suit so far, capped at ten. */
  'bookAsks',
  /** Asks so far, capped at a hundred. */
  'progress',
] as const

export const HOLDER_FEATURE_COUNT = HOLDER_FEATURES.length

/** What one decision's rows share, built once per view (`holderContext`). */
export interface HolderContext {
  readonly me: Seat
  readonly myTeam: Team
  readonly NB: number
  readonly bookIdx: ReadonlyMap<BookId, number>
  readonly hist: SeatBookHistory
  /** Per seat × half-suit, the cards the seat certainly holds (`k.holders`). */
  readonly knownInBook: Int32Array
  /** Per half-suit, the cards still unplaced with two or more candidate seats. */
  readonly bookUnknown: Int32Array
  /** Every card of an unresolved half-suit the viewer cannot place: two or more candidates, in deck order. */
  readonly unknownCards: readonly Card[]
}

export function holderContext(view: SeatView, k: Knowledge): HolderContext {
  const me = view.seat
  const myTeam = seatTeam(me)
  const books = allBooks(view.config)
  const NB = books.length
  const bookIdx = new Map<BookId, number>()
  books.forEach((b, i) => bookIdx.set(b, i))
  const hist = seatBookHistory(view, bookIdx, myTeam)
  const knownInBook = new Int32Array(6 * NB)
  const bookUnknown = new Int32Array(NB)
  const unknownCards: Card[] = []
  books.forEach((b, bi) => {
    if (view.books[b]) return
    for (const c of bookCards(b, view.config)) {
      const h = k.holders[c]
      if (h !== undefined) {
        knownInBook[h * NB + bi]++
        continue
      }
      const cand = k.cands[c]
      if (cand && cand.length >= 2) {
        bookUnknown[bi]++
        unknownCards.push(c)
      }
    }
  })
  return { me, myTeam, NB, bookIdx, hist, knownInBook, bookUnknown, unknownCards }
}

/**
 * The tightest live constraint that says `seat` was dealt at least one of a set of cards still
 * possibly with it and containing `card`: one over that set's live size (as `refinedHitProbability`
 * folds it), 0 when none names the card.
 */
function seatConstraint(k: Knowledge, seat: Seat, card: Card): number {
  let best = 0
  for (const kc of k.constraints) {
    if (kc.seat !== seat) continue
    let alive = 0
    let has = false
    for (const u of kc.cards) {
      const cu = k.cands[u]
      if (cu !== undefined && cu.length > 1 && cu.includes(seat)) {
        alive++
        if (u === card) has = true
      }
    }
    if (has && alive > 0 && 1 / alive > best) best = 1 / alive
  }
  return best
}

/**
 * One feature row per candidate seat of `card`, in `HOLDER_FEATURES` order, the seats in the
 * knowledge's candidate order. A card with fewer than two candidates has no rows: it is placed, or
 * as good as. Pure over the context, the knowledge and the view.
 */
export function holderFeatureRows(ctx: HolderContext, k: Knowledge, view: SeatView, card: Card): { seats: readonly Seat[]; rows: Float64Array[] } {
  const cand = k.cands[card] ?? []
  if (cand.length < 2) return { seats: cand, rows: [] }
  const bi = ctx.bookIdx.get(cardBook(card)) ?? 0
  const h = ctx.hist
  const NB = ctx.NB
  const rows: Float64Array[] = []
  for (const s of cand) {
    const a = s * NB + bi
    const x = new Float64Array(HOLDER_FEATURE_COUNT)
    let i = 0
    x[i++] = askHitProbability(k, card, s)
    x[i++] = slotPriorHitProbability(k, card, s)
    x[i++] = indepK(k, h, cand, s, bi, NB)
    x[i++] = cand.length / 5
    x[i++] = Math.min(1, k.unknownSlots[s] / 12)
    x[i++] = Math.min(1, view.counts[s] / 12)
    x[i++] = seatTeam(s) === ctx.myTeam ? 1 : 0
    x[i++] = Math.min(3, h.sbAsks[a]) / 3
    x[i++] = Math.min(3, h.sbHits[a]) / 3
    x[i++] = Math.min(3, h.sbMisses[a]) / 3
    x[i++] = Math.min(3, h.sbTaken[a]) / 3
    x[i++] = Math.min(3, h.sbMissedAt[a]) / 3
    x[i++] = agoOf(h.sbLast[a], h.asks)
    x[i++] = agoOf(h.seatLast[s], h.asks)
    x[i++] = h.seatBooks[s] / NB
    x[i++] = ctx.knownInBook[a] / 6
    x[i++] = seatConstraint(k, s, card)
    x[i++] = ctx.bookUnknown[bi] / 6
    x[i++] = Math.min(10, h.bookAsks[bi]) / 10
    x[i] = Math.min(100, h.asks) / 100
    rows.push(x)
  }
  return { seats: cand, rows }
}

export type HolderModel = DenseModel

const MODELS = new Map<string, CompiledNet>()

/** Register a fitted holder model under a name an ask model at the third width can refer to (compiled once here; the width is checked). */
export function registerHolderModel(name: string, model: HolderModel): void {
  MODELS.set(name, compileNet(model, HOLDER_FEATURE_COUNT, 1))
}

export function holderModelOf(name: string): CompiledNet {
  const m = MODELS.get(name)
  if (!m) throw new Error(`no holder model registered as ${JSON.stringify(name)}`)
  return m
}

/**
 * The model's belief about who holds `card`: a probability per seat (six entries), the softmax of
 * the model's scores over the card's candidates — 1 for a lone candidate, 0 for a seat that cannot
 * hold it, all zeros for a card nothing can hold.
 */
export function holderBelief(m: CompiledNet, ctx: HolderContext, k: Knowledge, view: SeatView, card: Card): Float64Array {
  const out = new Float64Array(6)
  const cand = k.cands[card] ?? []
  if (cand.length === 0) return out
  if (cand.length === 1) {
    out[cand[0]] = 1
    return out
  }
  const { seats, rows } = holderFeatureRows(ctx, k, view, card)
  const scores = rows.map((x) => forwardNet(m, x))
  let mx = -Infinity
  for (const v of scores) if (v > mx) mx = v
  let z = 0
  const e = scores.map((v) => {
    const t = Math.exp(v - mx)
    z += t
    return t
  })
  seats.forEach((seat, j) => {
    out[seat] = e[j] / z
  })
  return out
}
