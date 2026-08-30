/**
 * Your ask, at a table where the other five are people.
 *
 * A wrapper rather than a use of `src/play/AskPanel.tsx`, which cannot render this: that component
 * holds `const OPPONENTS = [1, 3, 5]`, correct for a player who is always seat 0 and wrong for
 * anyone on the odd side. Here the opponents come from `teamSeats(other side)` via `opponentsOf`,
 * so they are right from every chair, and each is offered by NAME.
 *
 * The legality guarantee is the solo panel's, kept exactly: `legalAsksFromView` is the only source
 * of what is offered, so the panel is structurally incapable of proposing an ask the engine would
 * refuse — not "we filtered the illegal ones out" but "we only ever built buttons from the legal
 * ones". Cards excluded for a reason worth teaching are still drawn, disabled, with the reason on
 * them.
 *
 * The selection resets when the position moves on, via the render-time state adjustment React
 * documents for exactly this. A `key` remount would take the keyboard's focus with it, and on a
 * hit you keep the turn — so that would throw a player to the top of the document mid-turn.
 */
import { useState } from 'react'
import type { BookId, Card, Seat } from '../../../lib/engine/index.ts'
import { allBooks, bookCards, cardBook, legalAsksFromView } from '../../../lib/engine/index.ts'
import { cx } from '../../components/index.ts'
import { CardFace } from '../CardFace.tsx'
import { bookLabel, cardName } from '../format.ts'
import type { RoomSeatView } from './protocol.ts'
import { opponentsOf } from './view.ts'
import s from './room.module.css'

export interface RoomAskProps {
  view: RoomSeatView
  nameOf: (seat: Seat) => string
  /** True while the room's pace timer still has time to run; the ask is built but not sendable. */
  held: boolean
  disabled: boolean
  onAsk: (target: Seat, card: Card) => void
}

export function RoomAsk({ view, nameOf, held, disabled, onAsk }: RoomAskProps) {
  const [picked, setPicked] = useState<Seat | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [atMove, setAtMove] = useState(view.moveIndex)

  if (atMove !== view.moveIndex) {
    setAtMove(view.moveIndex)
    setPicked(null)
    setCard(null)
  }

  const legal = legalAsksFromView(view)
  const opponents = opponentsOf(view.seat)
  const liveTargets = opponents.filter((seat) => view.counts[seat] > 0)
  const target = picked !== null && liveTargets.includes(picked) ? picked : (liveTargets[0] ?? null)

  if (legal.length === 0 || target === null) return null

  const askable = new Set(legal.filter((a) => a.target === target).map((a) => a.card))
  const held0 = new Set(view.hand)
  const myBooks = new Set(view.hand.map(cardBook))

  const open: BookId[] = []
  const shut: BookId[] = []
  for (const book of allBooks(view.config)) {
    if (view.books[book]) continue
    if (myBooks.has(book)) open.push(book)
    else shut.push(book)
  }

  // A stale selection is possible for one render after the opponent changes: the card the player
  // chose may not be offered against the new target. Treat that as no selection rather than
  // letting the submit button carry an ask the engine would refuse.
  const chosen = card !== null && askable.has(card) ? card : null

  return (
    <section className={s.panel} aria-labelledby="room-ask-head">
      <h2 id="room-ask-head" className={s.panelHead}>
        Your ask
      </h2>
      <p className={s.panelNote}>
        Name one opponent, then one card. You may only ask into a set you hold at least one card of
        (row 6), never for a card already in your hand (row 7). A hit keeps your turn; a miss passes
        it to the person you asked.
      </p>

      <h3 className={s.step}>1 · Who are you asking?</h3>
      <div className={s.choiceRow} role="group" aria-label="Opponent to ask">
        {opponents.map((seat) => {
          const out = view.counts[seat] === 0
          return (
            <button
              key={seat}
              type="button"
              className={cx(s.chip, seat === target && s.chipOn)}
              disabled={out}
              aria-pressed={seat === target}
              onClick={() => {
                setPicked(seat)
              }}
            >
              {nameOf(seat)}
              <span className={s.chipSub}>{out ? 'out of cards' : `${view.counts[seat]} cards`}</span>
            </button>
          )
        })}
      </div>

      <h3 className={s.step}>2 · Which card?</h3>
      <div className={s.books}>
        {open.map((book) => (
          <div key={book} className={s.bookRow}>
            <span className={s.bookName}>{bookLabel(book)}</span>
            <div className={s.bookCards} role="group" aria-label={`Cards of ${bookLabel(book)}`}>
              {bookCards(book, view.config).map((c) => {
                const mine = held0.has(c)
                const offered = askable.has(c)
                return (
                  <button
                    key={c}
                    type="button"
                    className={cx(s.chip, s.chipFace, c === card && s.chipOn)}
                    disabled={!offered}
                    aria-pressed={c === card}
                    aria-label={mine ? `${cardName(c)} — already in your hand` : cardName(c)}
                    onClick={() => {
                      setCard(c)
                    }}
                  >
                    <CardFace card={c} />
                    {mine ? <span className={s.chipSub}>yours</span> : null}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {shut.length > 0 ? (
        <p className={s.excluded}>
          <span className={s.excludedWhat}>Not askable:</span> {shut.map((b) => bookLabel(b)).join(', ')} — you
          hold nothing in {shut.length === 1 ? 'it' : 'them'}, so row 6 closes{' '}
          {shut.length === 1 ? 'it' : 'them'} to you.
        </p>
      ) : null}

      <div className={s.panelActions}>
        <button
          type="button"
          className={cx(s.submit, (chosen === null || held || disabled) && s.submitOff)}
          disabled={chosen === null || held || disabled}
          onClick={() => {
            if (chosen !== null) onAsk(target, chosen)
          }}
        >
          {chosen === null ? (
            'Pick a card above to ask for'
          ) : held ? (
            'Waiting for the table to catch up'
          ) : (
            <>
              Ask {nameOf(target)} for <CardFace card={chosen} />
            </>
          )}
        </button>
      </div>
    </section>
  )
}
