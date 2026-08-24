/**
 * The ask panel — the human's turn, made operable.
 *
 * Two choices, in rule order: an opponent who still holds cards (rows 5 and 8), then a card.
 * The card picker shows the WHOLE deck's books rather than only the legal remainder, because the
 * exclusions teach the rules: a book you hold nothing in is labelled "no licence" (row 6), a
 * card already in your hand is disabled as "yours" (row 7), and a resolved book is labelled with
 * where it went. Everything offered for clicking comes from `legalAsksFromView`, the same
 * enumeration the bots and the reducer agree on, so the panel can never offer an illegal ask.
 *
 * Mounted with `key={moveIndex}` by the table, so a stale selection never survives into the
 * next decision point.
 */
import { useState } from 'react'
import type { Card, Seat, SeatView } from '../../lib/engine/index.ts'
import { allBooks, bookCards, cardBook, legalAsksFromView } from '../../lib/engine/index.ts'
import { Button } from '../components/index.ts'
import { bookLabel, cardLabel, cardName } from './format.ts'
import s from './play.module.css'

const OPPONENTS: readonly Seat[] = [1, 3, 5]

export interface AskPanelProps {
  view: SeatView
  onAsk: (target: Seat, card: Card) => void
}

export function AskPanel({ view, onAsk }: AskPanelProps) {
  const [picked, setPicked] = useState<Seat | null>(null)
  const [card, setCard] = useState<Card | null>(null)

  const legal = legalAsksFromView(view)
  const liveTargets = OPPONENTS.filter((seat) => view.counts[seat] > 0)
  const target = picked !== null && liveTargets.includes(picked) ? picked : (liveTargets[0] ?? null)
  const myBooks = new Set(view.hand.map(cardBook))
  const held = new Set(view.hand)

  if (legal.length === 0 || target === null) return null

  return (
    <div className={s.panel}>
      <h2 className={s.panelHead}>Your ask</h2>
      <p className={s.panelNote}>
        Name one opponent and one card. You may only ask into a set you hold at least one card of
        (row 6), never for a card already in your hand (row 7). A hit keeps your turn; a miss
        passes it to the seat you asked.
      </p>

      <div className={s.choiceRow} role="group" aria-label="Opponent to ask">
        {OPPONENTS.map((seat) => {
          const out = view.counts[seat] === 0
          return (
            <button
              key={seat}
              type="button"
              className={`${s.chip} ${seat === target ? s.chipOn : ''}`}
              disabled={out}
              aria-pressed={seat === target}
              onClick={() => {
                setPicked(seat)
              }}
            >
              Seat {seat}
              <span className={s.chipSub}>{out ? 'out of cards' : `${view.counts[seat]} cards`}</span>
            </button>
          )
        })}
      </div>

      {allBooks(view.config).map((book) => {
        const resolved = view.books[book]
        const licence = myBooks.has(book)
        const why = resolved
          ? `resolved — ${resolved.outcome === 'team0' ? 'team 0' : 'team 1'} has it`
          : licence
            ? null
            : 'no licence — you hold nothing in it'
        return (
          <div key={book} className={s.bookBlock}>
            <div className={s.bookHead}>
              <span className={s.bookName}>{bookLabel(book)}</span>
              {why ? <span className={s.bookWhy}>{why}</span> : null}
            </div>
            {!resolved && licence ? (
              <div className={s.bookCards} role="group" aria-label={`Cards of ${bookLabel(book)}`}>
                {bookCards(book, view.config).map((c) => {
                  const mine = held.has(c)
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`${s.chip} ${s.chipFace} ${c === card ? s.chipOn : ''}`}
                      disabled={mine}
                      aria-pressed={c === card}
                      aria-label={mine ? `${cardName(c)} — in your hand` : cardName(c)}
                      onClick={() => {
                        setCard(c)
                      }}
                    >
                      {cardLabel(c)}
                      {mine ? <span className={s.chipSub}>yours</span> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}

      <div className={s.dialogActions}>
        <Button
          variant="ghost"
          arrow={false}
          disabled={card === null}
          onClick={() => {
            if (card !== null) onAsk(target, card)
          }}
        >
          {card === null ? 'Pick a card to ask for' : `Ask seat ${target} for ${cardLabel(card)}`}
        </Button>
      </div>
    </div>
  )
}
