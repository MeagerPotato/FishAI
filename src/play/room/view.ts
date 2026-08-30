/**
 * The table from a seat that is not seat 0.
 *
 * ## The gap this fills
 *
 * The solo surface is written for a player who is always seat 0 on team 0. `Seats.tsx` labels
 * seat 0 "You (seat 0)" and team 0 "Your team"; `AskPanel.tsx` holds `const OPPONENTS = [1, 3, 5]`;
 * `DeclareDialog.tsx` holds `const TEAMMATES = [0, 2, 4]`; `format.ts`'s `seatName` returns "you"
 * for seat 0. All four are correct for the only seat that surface has, and all four are wrong for
 * five of the six seats in a room.
 *
 * So the room derives both facts from the viewer's actual seat, and from `seatTeam`/`teamSeats` in
 * lib/engine/cards.ts rather than from a second copy of the 0/2/4 split written down here. A room
 * also has something the solo table does not: real people with names. "Seat 3" is not a person,
 * and five of the six labels at a shared table have to be.
 *
 * ## Layout is rotated; identity is not
 *
 * `seatPlaces` puts index 0 at the bottom of the ellipse, which is where the person reading the
 * screen sits. `placesFor(viewer)` maps place index `i` to the real seat `(viewer + i) % 6`, so
 * the viewer is at the bottom, their two partners are the top corners and their three opponents
 * alternate between — the same seating a Fish table has, seen from wherever you happen to be
 * sitting. Because the offset is applied to POSITION only, every label still names the real seat:
 * a player at seat 3 sees themselves at the bottom of the screen and reads "You (seat 3)". A
 * rotation that also renumbered the seats would have been cheaper and would have quietly lied to
 * anyone comparing the screen with the log.
 */
import type { PublicEvent, Seat, Team } from '../../../lib/engine/index.ts'
import { seatTeam, teamSeats } from '../../../lib/engine/index.ts'
import { bookLabel, cardName } from '../format.ts'
import { seatPlaces, type SeatPlace } from '../geometry.ts'
import type { RoomLobby } from './protocol.ts'

/** The ellipse radii the room's stylesheet is built around; the same pair the solo table uses. */
export const RX = 38
export const RY = 34

/**
 * The six places, with the viewer at the bottom. `seat` on each is the REAL seat — only where it
 * is drawn has moved.
 */
export function placesFor(viewer: Seat): SeatPlace[] {
  return seatPlaces(RX, RY).map((place) => ({
    ...place,
    seat: ((viewer + place.seat) % 6) as Seat,
  }))
}

/** The three seats the viewer may ask — the other side, from `teamSeats`, never a literal. */
export function opponentsOf(viewer: Seat): readonly Seat[] {
  return teamSeats(seatTeam(viewer) === 0 ? 1 : 0)
}

/** The viewer's own side, including themselves — the only seats a declare may place cards with. */
export function teammatesOf(viewer: Seat): readonly Seat[] {
  return teamSeats(seatTeam(viewer))
}

/** Are these two seats on the same side? `seatTeam` decides; nothing here re-derives it. */
export function sameTeam(a: Seat, b: Seat): boolean {
  return seatTeam(a) === seatTeam(b)
}

/**
 * A lookup from seat to the name that seat's player gave, falling back to the seat itself.
 *
 * A room in the lobby has fewer than six names, and a room mid-deal has all six; both are handled
 * by the fallback rather than by two code paths. The names are typed by strangers and were
 * already stripped of control characters and length-capped by the server — this is a lookup, not
 * a second sanitizer.
 */
export function namesFrom(lobby: RoomLobby): (seat: Seat) => string {
  const byName = new Map<Seat, string>(lobby.players.map((p) => [p.seat, p.name]))
  return (seat) => byName.get(seat) ?? `Seat ${seat}`
}

/** How a seat is named in a sentence: the viewer is "you", everyone else is their own name. */
export function speakerFor(viewer: Seat | null, nameOf: (seat: Seat) => string) {
  return (seat: Seat): string => (seat === viewer ? 'you' : nameOf(seat))
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1)
}

/**
 * One line per public event, addressed to whoever is reading it.
 *
 * The same register as `describePlayEvent` in src/play/format.ts and deliberately not a call to
 * it: that function answers "seat 0 is you" and names everyone else by number, which is right for
 * the solo table and wrong at a table of six named people. What is shared is the phrasing, so a
 * player who has read the solo log recognises this one.
 */
export function describeRoomEvent(
  event: PublicEvent,
  viewer: Seat | null,
  nameOf: (seat: Seat) => string,
): string {
  const who = speakerFor(viewer, nameOf)
  const Who = (seat: Seat): string => capitalize(who(seat))
  const are = (seat: Seat): string => (seat === viewer ? 'are' : 'is')
  const teamName = (team: Team): string => (team === 0 ? 'Evens' : 'Odds')

  switch (event.type) {
    case 'game_started':
      return `The deal is done. ${Who(event.startingSeat)} ${are(event.startingSeat)} first to move.`
    case 'ask':
      return (
        `${Who(event.asker)} asked ${who(event.target)} for ${cardName(event.card)} — ` +
        (event.hit ? 'hit; the card transfers and the turn is kept.' : 'miss; the turn passes.')
      )
    case 'claim': {
      const declarerTeam = seatTeam(event.claimer)
      const wonTeam = event.outcome === 'team0' ? 0 : event.outcome === 'team1' ? 1 : null
      if (wonTeam === null)
        return `${Who(event.claimer)} declared ${bookLabel(event.book)} — nobody scores the set.`
      if (wonTeam === declarerTeam)
        return `${Who(event.claimer)} declared ${bookLabel(event.book)} — correct; ${teamName(wonTeam)} score the set.`
      return `${Who(event.claimer)} declared ${bookLabel(event.book)} wrongly — the set is gifted to ${teamName(wonTeam)} (row 14).`
    }
    case 'pass':
      return `${Who(event.from)} passed the turn to ${who(event.to)}.`
    case 'designate':
      return `${Who(event.from)} designated ${who(event.to)}.`
    case 'player_out':
      return `${Who(event.seat)} ${are(event.seat)} out of cards.`
    case 'endgame':
      return `Endgame: ${teamName(event.claimingTeam)} must resolve the remaining sets.`
    case 'game_over':
      return `Game over — ${event.winner === 'tie' ? 'a tie' : `${teamName(event.winner)} clinch`} at ${event.score[0]}–${event.score[1]}.`
    default:
      return 'Unrecognised event.'
  }
}
