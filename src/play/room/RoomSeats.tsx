/**
 * The shared table, in the round, seen from your own chair.
 *
 * A wrapper rather than a use of `src/play/Seats.tsx`, which cannot render this: that component
 * labels seat 0 "You (seat 0)" and team 0 "Your team", which is correct for the only seat the solo
 * table has and wrong for five of the six here. It also has no concept of a player's NAME, and at
 * a table of six people the names are the point — "Seat 3" is not somebody you can ask for a card.
 *
 * Everything else follows the solo table deliberately, so a player who has used one recognises the
 * other: seats on an ellipse with the reader at the bottom, every state carried by TEXT first and
 * decoration second, the DOM in seat order 0..5 so a screen reader walks the table the way the
 * rules number it, and the newest log line lying in the middle of the felt where it would be on a
 * real table.
 */
import type { CSSProperties } from 'react'
import type { PublicState, Seat } from '../../../lib/engine/index.ts'
import { cx } from '../../components/index.ts'
import { placesFor, sameTeam } from './view.ts'
import s from './room.module.css'

export interface RoomSeatsProps {
  /** Counts, turn and phase — a seat view or a spectator's public state; only the public half is read. */
  table: Pick<PublicState, 'counts' | 'turn' | 'phase'>
  /** The reader's own seat, or null when they are only watching. */
  viewer: Seat | null
  nameOf: (seat: Seat) => string
  /** Whose decision it is — the declare-option holder while a window is open. */
  acting: Seat
  windowOpen: boolean
  finished: boolean
  /** The newest public event, in words. */
  lastMove: string
}

export function RoomSeats({ table, viewer, nameOf, acting, windowOpen, finished, lastMove }: RoomSeatsProps) {
  // A spectator has no chair, so the table is drawn from seat 0 — the orientation the solo surface
  // has always used, and the only neutral one available.
  const places = placesFor(viewer ?? 0)

  return (
    <div className={s.table}>
      {/* Purely decorative, so the ring reads as one object rather than six floating cards. */}
      <div className={s.felt} aria-hidden="true" />

      <ul className={s.seatRing} aria-label="The table, six seats in playing order">
        {[...places]
          .sort((a, b) => a.seat - b.seat)
          .map((place) => {
            const seat = place.seat
            const mine = viewer !== null && sameTeam(seat, viewer)
            const isYou = seat === viewer
            const isTurn = !finished && !windowOpen && table.turn === seat
            const isOption = !finished && windowOpen && acting === seat
            const state = isTurn ? 'Playing now' : isOption ? 'Declare option' : null
            const count = table.counts[seat] ?? 0
            const label = isYou ? `${nameOf(seat)} — you` : nameOf(seat)

            return (
              <li
                key={seat}
                className={cx(
                  s.seat,
                  viewer === null ? s.seatNeutral : mine ? s.seatMine : s.seatTheirs,
                  isYou && s.seatYou,
                  isTurn && s.seatTurn,
                  isOption && s.seatOption,
                )}
                style={{ '--seat-x': `${place.x}%`, '--seat-y': `${place.y}%` } as CSSProperties}
              >
                <span className={s.seatTeam}>
                  {viewer === null ? (seat % 2 === 0 ? 'Evens' : 'Odds') : mine ? 'Your side' : 'Opponent'}
                </span>
                <span className={s.seatWho}>{label}</span>
                <span className={s.seatMeta}>
                  Seat {seat} · {count} {count === 1 ? 'card' : 'cards'}
                </span>
                {state ? (
                  <span className={cx(s.seatState, isTurn ? s.seatStateTurn : s.seatStateOption)}>{state}</span>
                ) : null}
                {/* The same facts as one sentence, so a screen reader is not made to assemble
                    them out of four sibling spans. */}
                <span className={s.srOnly}>
                  {`${label}, seat ${seat}, ${viewer === null ? '' : mine ? 'your side, ' : 'the opposing side, '}` +
                    `${count} cards${state ? `, ${state.toLowerCase()}` : ''}.`}
                </span>
              </li>
            )
          })}
      </ul>

      {/* Not a live region: the log narrating itself over a player's own turn is exactly the
          firehose the solo surface removed. The one live region is on the page. */}
      <p className={s.lastMove}>
        <span className={s.lastMoveLabel}>Last move</span>
        <span>{lastMove}</span>
      </p>
    </div>
  )
}
