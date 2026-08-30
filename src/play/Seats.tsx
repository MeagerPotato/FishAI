/**
 * The table, in the round.
 *
 * Six seats on an ellipse (geometry.ts), the human at bottom centre, partners at the top corners
 * and opponents alternating between them — the seating a Fish table actually has. The flat row
 * this replaced was legible as six boxes and illegible as a table.
 *
 * ## What a seat has to say, and how
 *
 * Four facts per seat, in the order a player needs them: who it is, whose team it is on, what it
 * is doing right now, and how many cards it holds. The count used to be the biggest thing in the
 * card and is now the smallest — it is the fact you need least often.
 *
 * Every state is carried by TEXT first and decoration second, so none of it is conveyed by
 * colour alone:
 *
 *   · turn holder — the word "Playing now" plus a 3px ink ring (>= 3:1 against the seat ground,
 *     which the old --fa-sheet -> --fa-tile tint was not: 1.20:1) and an amber marker. This is
 *     the one state on the surface that has earned an accent outside the strip's budget: it is
 *     the single fact a player looks for most often, and everything cheaper had been tried.
 *   · declare option — the words "Declare option" plus a dashed ring, a different SHAPE of
 *     border rather than a different hue.
 *   · your team / theirs — the words "Your team" / "Opponent" on every card, plus a solid vs
 *     hatched header band. Two teams, two textures, no hue.
 *
 * ## Order and degradation
 *
 * The DOM is seats 0..5 in order — a screen reader walks the table in seat order, which is the
 * order the rules use — and every position is CSS. Below 700px the ellipse would overlap itself,
 * so the ring is dropped for a two-column grid: same DOM, same content, no absolute positioning.
 */
import type { CSSProperties } from 'react'
import type { Seat, SeatView } from '../../lib/engine/index.ts'
import { cx } from '../components/index.ts'
import { seatPlaces } from './geometry.ts'
import type { BotNames } from './format.ts'
import { teamOf } from './format.ts'
import s from './play.module.css'

/**
 * Radii as percentages of the table box, and the ONLY place they are chosen. `minTableHeight`
 * in geometry.ts derives the box's floor from them, play.module.css states that floor, and
 * tests/play/table-ui.test.ts pins both against these two numbers — so widening the ring is a
 * three-line change with a test that fails if the seats would start colliding.
 *
 * Under 50 so a seat card's centre stays inside the box and only half of it overhangs.
 */
const RX = 38
const RY = 34

export interface SeatsProps {
  view: SeatView
  /** The newest public event, in words. Rendered in the middle of the felt. */
  lastMove: string
  /** Whose decision it is — the declare-option holder while a window is open. */
  acting: Seat
  /** True while a declare window is open (so `acting` is an option holder, not a turn holder). */
  windowOpen: boolean
  /** The seat holding the turn, independent of any open declare window. */
  turn: Seat
  finished: boolean
  /** What each bot seat is playing; seat 0 renders as "You". */
  policyLabelFor: (seat: Seat) => string
  /** What the player called the bots. Absent at the shared table, where there are none. */
  names?: BotNames
}

export function Seats({
  view,
  lastMove,
  acting,
  windowOpen,
  turn,
  finished,
  policyLabelFor,
  names = [],
}: SeatsProps) {
  const places = seatPlaces(RX, RY)

  /**
   * A named seat keeps its NUMBER as well as its name. The rules are written in seat numbers,
   * the log and the ask panel are read against the ring, and a table where seat 3 is only ever
   * "Nina" makes row 5 unreadable — a name is meant to add an identity, not replace the
   * coordinate every other surface addresses the seat by.
   */
  const who = (seat: Seat): string => {
    if (seat === 0) return 'You (seat 0)'
    const name = names[seat - 1]
    return name !== undefined && name !== '' ? `${name} (seat ${seat})` : `Seat ${seat}`
  }

  return (
    <div className={s.table}>
      {/* The felt: a plain ellipse, purely decorative, so the ring of seats reads as one object
          rather than six floating cards. Hidden from the accessibility tree. */}
      <div className={s.felt} aria-hidden="true" />

      <ul className={s.seatRing} aria-label="The table, six seats in playing order">
        {places.map(({ seat, x, y }) => {
          const mine = teamOf(seat) === 0
          const isTurn = !finished && !windowOpen && turn === seat
          const isOption = !finished && windowOpen && acting === seat
          // One line of plain language per seat, because "turn holder" at 10.5px uppercase in
          // the faintest ink on the page was not a signal anybody was going to catch.
          const state = isTurn ? 'Playing now' : isOption ? 'Declare option' : null

          return (
            <li
              key={seat}
              className={cx(
                s.seat,
                mine ? s.seatMine : s.seatTheirs,
                isTurn && s.seatTurn,
                isOption && s.seatOption,
              )}
              style={{ '--seat-x': `${x}%`, '--seat-y': `${y}%` } as CSSProperties}
            >
              <span className={s.seatTeam}>{mine ? 'Your team' : 'Opponent'}</span>
              <span className={s.seatWho}>{who(seat)}</span>
              {/* Count and policy share a line: two facts, neither of them the one a player
                  scans for, and a line each is a line of table height each. */}
              <span className={s.seatPolicy}>
                {view.counts[seat]} {view.counts[seat] === 1 ? 'card' : 'cards'} ·{' '}
                {policyLabelFor(seat)}
              </span>
              {state ? (
                <span className={cx(s.seatState, isTurn ? s.seatStateTurn : s.seatStateOption)}>
                  {state}
                </span>
              ) : null}
              {/* The accessible name gets the same four facts as one sentence, so a screen
                  reader is not made to assemble them out of five sibling spans. */}
              <span className={s.srOnly}>
                {`${who(seat)}, ${mine ? 'your team' : 'the opposing team'}, ` +
                  `${view.counts[seat]} cards${state ? `, ${state.toLowerCase()}` : ''}.`}
              </span>
            </li>
          )
        })}
      </ul>

      {/* The middle of the felt is where a real table's last action is still lying, so that is
          where the newest log line goes — beside the seat that produced it, rather than in a
          column on the far side of the page. Not a live region: the log narrating itself over
          a player's own turn is exactly the firehose this surface removed. */}
      <p className={s.lastMove}>
        <span className={s.lastMoveLabel}>Last move</span>
        <span>{lastMove}</span>
      </p>
    </div>
  )
}
