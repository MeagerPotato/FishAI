/**
 * Play-surface formatting: card faces, book names, seat names, and the public-log phrasing.
 *
 * The log lines deliberately keep the register of `describeEvent` in src/lab/replay.ts — one
 * sentence per event, plain, engine-faithful — but this table has a *seated reader*, so seat 0
 * is "you" and card codes render as faces (`9H` -> `9♥`). The jokers keep their canonical `XR`/
 * `XB` names: RULES_US54.md §2.1 makes them individually nameable, and inventing a prettier
 * alias here would detach the surface from the notation every other page uses.
 *
 * `suitColor` is the other half of a card face: which of the two suit inks it is drawn in. The
 * glyph above already carries the suit, so the colour is a recognition aid on top of a signal
 * that is complete without it — see tokens.css §3.2.
 *
 * Every seat-naming helper takes an OPTIONAL `BotNames`, defaulting to none. That default is
 * load-bearing rather than lazy: the shared table under src/play/room/ reuses these components
 * and does not seat bots at all, so a naming table it has no use for must not become a required
 * argument in its way.
 */
import type { Card, PublicEvent, Seat, Team } from '../../lib/engine/index.ts'

const SUIT_GLYPH = new Map<string, string>([
  ['C', '♣'],
  ['D', '♦'],
  ['H', '♥'],
  ['S', '♠'],
])

/**
 * The spoken half of a suited book's name. A glyph is a fine label beside a rank, where the
 * rank already carries the meaning; it is a poor label on its own, which is what a book name is
 * — `LOW ♥` asked a player to decode a 10.5px symbol to learn which set was closed to them.
 */
const SUIT_WORD = new Map<string, string>([
  ['C', 'CLUBS'],
  ['D', 'DIAMONDS'],
  ['H', 'HEARTS'],
  ['S', 'SPADES'],
])

/** `9H` -> `9♥`, `TS` -> `T♠`, jokers stay `XR`/`XB` (their canonical, declarable names). */
export function cardLabel(card: Card): string {
  if (card === 'XR' || card === 'XB') return card
  return `${card[0]}${SUIT_GLYPH.get(card[1]) ?? card[1]}`
}

/** Which ink a card face is drawn in. See tokens.css §3.2 for why there are two. */
export type SuitColor = 'red' | 'black'

/**
 * Hearts and diamonds are red; clubs and spades are ink. The two jokers follow their own names
 * — `XR` is the RED joker and `XB` the black one (RULES_US54.md §2.1 makes them individually
 * nameable), so the colour is the card's identity here rather than a decoration.
 *
 * Anything unrecognised falls to black: a card face that cannot be classified should read as
 * ordinary ink rather than silently claiming to be a red suit.
 */
export function suitColor(card: Card): SuitColor {
  if (card === 'XR') return 'red'
  if (card === 'XB') return 'black'
  return card[1] === 'H' || card[1] === 'D' ? 'red' : 'black'
}

/** The long form for prose: `9♥`, `the red joker`. */
export function cardName(card: Card): string {
  if (card === 'XR') return 'the red joker'
  if (card === 'XB') return 'the black joker'
  return cardLabel(card)
}

/**
 * `LOW-H` -> `LOW HEARTS`; `EIGHTS` stays itself. The words with no glyph, for the places a
 * string is READ ALOUD rather than looked at — an accessible name, where `♥` is announced as
 * "black heart suit" and appending it to the word it already says is a stutter, not a signal.
 */
export function bookWords(book: string): string {
  const dash = book.indexOf('-')
  if (dash === -1) return book
  const suit = SUIT_WORD.get(book.slice(dash + 1))
  return suit ? `${book.slice(0, dash)} ${suit}` : book
}

/**
 * `LOW-H` -> `LOW HEARTS ♥`; `EIGHTS` stays itself. Words first, the glyph behind them.
 *
 * The glyph is kept but demoted: it is now a recognition aid on top of a name that is already
 * complete, which is the same relationship `suitColor` has to a card face (tokens.css §3.2).
 * There is no short form and no second helper, because there is no dense table to need one —
 * every caller is a label beside cards or a sentence, and the widest of them (the ask panel's
 * `.bookRow`) had its label column widened to fit rather than being handed an abbreviation.
 */
export function bookLabel(book: string): string {
  const dash = book.indexOf('-')
  if (dash === -1) return book
  const suit = SUIT_GLYPH.get(book.slice(dash + 1))
  return suit ? `${bookWords(book)} ${suit}` : book
}

/** Team of a seat: seats 0/2/4 against 1/3/5. */
export const teamOf = (seat: Seat): Team => (seat % 2) as Team

/**
 * The five bot seats' display names, index 0 = seat 1 … index 4 = seat 5 — the same seat-order
 * convention `styles` used before it (params.ts). An empty or missing slot leaves that seat
 * numbered, which is what every caller that passes nothing gets.
 *
 * Seat 0 is deliberately not in here. The human is "you" at their own table, and a name for
 * yourself is the one name that buys no differentiation.
 */
export type BotNames = readonly string[]

function botName(seat: Seat, names: BotNames): string | null {
  const name = names[seat - 1]
  return name !== undefined && name !== '' ? name : null
}

/** `seat 0` reads as `you` at this table; everyone else is their name, or a numbered seat. */
export function seatName(seat: Seat, names: BotNames = []): string {
  if (seat === 0) return 'you'
  return botName(seat, names) ?? `seat ${seat}`
}

/** Sentence-initial `seatName`. A custom name is a proper noun and is already capitalised. */
export function seatNameCap(seat: Seat, names: BotNames = []): string {
  if (seat === 0) return 'You'
  return botName(seat, names) ?? `Seat ${seat}`
}

/** One line per public event, in the replay page's register, addressed to the seated reader. */
export function describePlayEvent(event: PublicEvent, names: BotNames = []): string {
  switch (event.type) {
    case 'game_started':
      return `Game starts at ${seatName(event.startingSeat, names)}.`
    case 'ask':
      return (
        `${seatNameCap(event.asker, names)} asked ${seatName(event.target, names)} for ${cardName(event.card)} — ` +
        (event.hit ? 'hit; the card transfers and the turn is kept.' : 'miss; the turn passes.')
      )
    case 'claim': {
      const who = seatNameCap(event.claimer, names)
      const declarerTeam = teamOf(event.claimer)
      const wonTeam = event.outcome === 'team0' ? 0 : event.outcome === 'team1' ? 1 : null
      if (wonTeam === null) return `${who} declared ${bookLabel(event.book)} — nobody scores the set.`
      if (wonTeam === declarerTeam)
        return `${who} declared ${bookLabel(event.book)} — correct; team ${wonTeam} scores the set.`
      return `${who} declared ${bookLabel(event.book)} wrongly — the set is gifted to team ${wonTeam} (row 14).`
    }
    case 'pass':
      return `${seatNameCap(event.from, names)} passed the turn to ${seatName(event.to, names)}.`
    case 'designate':
      return `${seatNameCap(event.from, names)} designated ${seatName(event.to, names)}.`
    case 'player_out':
      return `${seatNameCap(event.seat, names)} ${event.seat === 0 ? 'are' : 'is'} out of cards.`
    case 'endgame':
      return `Endgame: team ${event.claimingTeam} must resolve the remaining sets.`
    case 'game_over':
      return `Game over — team ${String(event.winner)} clinches at ${event.score[0]}–${event.score[1]}.`
    default:
      return 'Unrecognised event.'
  }
}
