/**
 * Play-surface formatting: card faces, book names, seat names, and the public-log phrasing.
 *
 * The log lines deliberately keep the register of `describeEvent` in src/lab/replay.ts — one
 * sentence per event, plain, engine-faithful — but this table has a *seated reader*, so seat 0
 * is "you" and card codes render as faces (`9H` -> `9♥`). The jokers keep their canonical `XR`/
 * `XB` names: RULES_US54.md §2.1 makes them individually nameable, and inventing a prettier
 * alias here would detach the surface from the notation every other page uses.
 */
import type { Card, PublicEvent, Seat, Team } from '../../lib/engine/index.ts'

const SUIT_GLYPH = new Map<string, string>([
  ['C', '♣'],
  ['D', '♦'],
  ['H', '♥'],
  ['S', '♠'],
])

/** `9H` -> `9♥`, `TS` -> `T♠`, jokers stay `XR`/`XB` (their canonical, declarable names). */
export function cardLabel(card: Card): string {
  if (card === 'XR' || card === 'XB') return card
  return `${card[0]}${SUIT_GLYPH.get(card[1]) ?? card[1]}`
}

/** The long form for prose: `9♥`, `the red joker`. */
export function cardName(card: Card): string {
  if (card === 'XR') return 'the red joker'
  if (card === 'XB') return 'the black joker'
  return cardLabel(card)
}

/** `LOW-H` -> `LOW ♥`; `EIGHTS` stays itself. */
export function bookLabel(book: string): string {
  const dash = book.indexOf('-')
  if (dash === -1) return book
  const suit = SUIT_GLYPH.get(book.slice(dash + 1))
  return suit ? `${book.slice(0, dash)} ${suit}` : book
}

/** Team of a seat: seats 0/2/4 against 1/3/5. */
export const teamOf = (seat: Seat): Team => (seat % 2) as Team

/** `seat 0` reads as `you` at this table; everyone else stays a numbered seat. */
export function seatName(seat: Seat): string {
  return seat === 0 ? 'you' : `seat ${seat}`
}

function seatNameCap(seat: Seat): string {
  return seat === 0 ? 'You' : `Seat ${seat}`
}

/** One line per public event, in the replay page's register, addressed to the seated reader. */
export function describePlayEvent(event: PublicEvent): string {
  switch (event.type) {
    case 'game_started':
      return `Game starts at ${seatName(event.startingSeat)}.`
    case 'ask':
      return (
        `${seatNameCap(event.asker)} asked ${seatName(event.target)} for ${cardName(event.card)} — ` +
        (event.hit ? 'hit; the card transfers and the turn is kept.' : 'miss; the turn passes.')
      )
    case 'claim': {
      const declarerTeam = teamOf(event.claimer)
      const wonTeam = event.outcome === 'team0' ? 0 : event.outcome === 'team1' ? 1 : null
      if (wonTeam === null)
        return `${seatNameCap(event.claimer)} declared ${bookLabel(event.book)} — nobody scores the set.`
      if (wonTeam === declarerTeam)
        return `${seatNameCap(event.claimer)} declared ${bookLabel(event.book)} — correct; team ${wonTeam} scores the set.`
      return `${seatNameCap(event.claimer)} declared ${bookLabel(event.book)} wrongly — the set is gifted to team ${wonTeam} (row 14).`
    }
    case 'pass':
      return `${seatNameCap(event.from)} passed the turn to ${seatName(event.to)}.`
    case 'designate':
      return `${seatNameCap(event.from)} designated ${seatName(event.to)}.`
    case 'player_out':
      return `${seatNameCap(event.seat)} ${event.seat === 0 ? 'are' : 'is'} out of cards.`
    case 'endgame':
      return `Endgame: team ${event.claimingTeam} must resolve the remaining sets.`
    case 'game_over':
      return `Game over — team ${String(event.winner)} clinches at ${event.score[0]}–${event.score[1]}.`
    default:
      return 'Unrecognised event.'
  }
}
