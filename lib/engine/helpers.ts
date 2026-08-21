/**
 * Legal-move enumeration helpers (used by UI, bots, and the fuzzer's policy).
 */
import type { Card, DeclareWindow, GameState, Phase, RulesConfig, Seat } from './types.ts'
import { ALL_SEATS, allBooks, allCards, cardBook, seatTeam } from './cards.ts'

/**
 * Every legal ask for `seat`: [] unless it is that seat's turn in 'playing'.
 * A seat can legally hold cards yet have zero legal asks (hand is a union of
 * complete books) — this simply returns [] in that case.
 */
export function legalAsks(s: GameState, seat: Seat): { target: Seat; card: Card }[] {
  // RULES_US54.md §3: while a declare window is open nobody asks; the window must close first.
  // `pagat48` never opens one, so this is inert there.
  if (s.declareWindow) return []
  return asksIgnoringWindow(s, seat)
}

/**
 * Could the turn-holder ask if the declare window closed right now? The RULES.md §2 checks
 * only, with §3's window gate deliberately skipped — the reducer consults this *to decide*
 * whether a `decline` is a move at all (RULES_US54.md §3/§4), so asking `legalAsks` would be
 * circular.
 *
 * Answered as "is the cross product non-empty" rather than by building it: this runs on every
 * `decline`, which is by far the most common `us54` action, and the list it would otherwise
 * materialise is up to 3 x 54 entries per call.
 */
export function turnHolderCanAsk(s: GameState): boolean {
  const seat = s.turn
  if (s.phase !== 'playing') return false
  if (s.hands[seat].length === 0) return false
  return askTargets(s, seat).length > 0 && askableCards(s, seat).length > 0
}

/** `legalAsks` without the §3 window gate — the one place the ask-legality filter is written. */
function asksIgnoringWindow(s: GameState, seat: Seat): { target: Seat; card: Card }[] {
  if (s.phase !== 'playing' || s.turn !== seat) return []
  if (s.hands[seat].length === 0) return []
  const askable = askableCards(s, seat)
  const out: { target: Seat; card: Card }[] = []
  for (const target of askTargets(s, seat)) {
    for (const card of askable) out.push({ target, card })
  }
  return out
}

/**
 * The cards `seat` may name: rows 6-7 — a card of a book they hold at least one of, and not
 * one already in hand (unless the `askOwnCardAllowed` toggle says otherwise). Deck is
 * config-derived, so `us54` adds the four 8s and both jokers to the pool.
 */
function askableCards(s: GameState, seat: Seat): readonly Card[] {
  const hand = s.hands[seat]
  const myBooks = new Set(hand.map(cardBook))
  const held = new Set(hand)
  const allowOwn = s.config.toggles.askOwnCardAllowed
  return allCards(s.config).filter((c) => myBooks.has(cardBook(c)) && (allowOwn || !held.has(c)))
}

/** The seats `seat` may ask: rows 5 and 8 — an opponent who still holds at least one card. */
function askTargets(s: GameState, seat: Seat): readonly Seat[] {
  return ALL_SEATS.filter((t) => seatTeam(t) !== seatTeam(seat) && s.hands[t].length > 0)
}

/**
 * The public-data subset a viewer needs to enumerate its own legal asks.
 * `seatView(state, seat)` satisfies this structurally.
 */
export interface AskableView {
  seat: Seat
  hand: readonly Card[]
  counts: readonly number[]
  phase: Phase
  turn: Seat
  config: RulesConfig
  /** `us54` only; present on every `PublicState` and absent under `pagat48` (RULES_US54.md §3). */
  declareWindow?: DeclareWindow
}

/**
 * legalAsks computed from a seat view alone (own hand + public counts/phase/turn).
 * Produces exactly the same list, in the same order, as `legalAsks(state, seat)`
 * for the state the view was projected from — a bot holding only a SeatView can
 * therefore enumerate asks without ever touching hidden hands.
 */
export function legalAsksFromView(v: AskableView): { target: Seat; card: Card }[] {
  if (v.declareWindow) return [] // §3, exactly as in legalAsks
  if (v.phase !== 'playing' || v.turn !== v.seat) return []
  if (v.hand.length === 0) return []
  const myBooks = new Set(v.hand.map(cardBook))
  const held = new Set(v.hand)
  const allowOwn = v.config.toggles.askOwnCardAllowed
  const askable = allCards(v.config).filter((c) => myBooks.has(cardBook(c)) && (allowOwn || !held.has(c)))
  const out: { target: Seat; card: Card }[] = []
  for (const target of ALL_SEATS) {
    if (seatTeam(target) === seatTeam(v.seat) || v.counts[target] === 0) continue
    for (const card of askable) out.push({ target, card })
  }
  return out
}

/**
 * Which action kinds are available to the seat whose move it is.
 * In 'playing', 'ask' appears only when at least one legal ask exists;
 * 'claim' appears whenever an unresolved book remains (always, pre-finish).
 *
 * Under `us54` an open declare window moves "whose move it is" off the turn-holder and onto
 * the seat holding the option, whose only choices are to declare or to decline
 * (RULES_US54.md §3). The turn-holder gets the option first, so this still starts with them.
 * `decline` is dropped from that pair in the one position where RULES_US54.md §3 makes it
 * illegal — a window no ask can follow, where the option seat must declare (`MUST_DECLARE`) —
 * so the UI never offers a button the reducer would refuse.
 */
export function legalActionsSummary(s: GameState): {
  seat: Seat
  kinds: ('ask' | 'claim' | 'pass' | 'designate' | 'decline')[]
} {
  const seat = s.turn
  const kinds: ('ask' | 'claim' | 'pass' | 'designate' | 'decline')[] = []
  if (s.declareWindow && s.phase !== 'finished') {
    const optionSeat = s.declareWindow.option
    if (allBooks(s.config).some((b) => !s.books[b])) kinds.push('claim')
    if (turnHolderCanAsk(s)) kinds.push('decline')
    return { seat: optionSeat, kinds }
  }
  switch (s.phase) {
    case 'playing': {
      if (legalAsks(s, seat).length > 0) kinds.push('ask')
      if (allBooks(s.config).some((b) => !s.books[b])) kinds.push('claim')
      break
    }
    case 'endgame':
      kinds.push('claim')
      break
    case 'awaitPass':
      kinds.push('pass')
      break
    case 'awaitDesignate':
      kinds.push('designate')
      break
    case 'finished':
      break
  }
  return { seat, kinds }
}
