/**
 * The ask panel — the human's turn, made operable, and made SHORT.
 *
 * Two choices, in rule order: an opponent who still holds cards (rows 5 and 8), then a card.
 *
 * ## Why it is no longer nine books tall
 *
 * It used to render all nine books at full size on every turn — around sixty card buttons, of
 * which a handful were ever legal — which is what pushed the one control a player uses every
 * single turn most of a page below the fold. The rules-teaching those exclusions do is real, so
 * it is kept, but it is kept at the size of the information: a book you hold a licence in is
 * expanded and clickable; every book you do not is named on ONE line that says why. A player
 * still learns that LOW ♥ is closed to them, without paying six dead buttons for the lesson.
 *
 * ## The legality guarantee
 *
 * `legalAsksFromView` is the only source of what is offered — the same enumeration the bots and
 * the reducer agree on. A card chip is enabled if and only if the pair (target, card) is in that
 * list, so the panel is structurally incapable of offering an illegal ask: not "we filtered the
 * illegal ones out", but "we only ever built buttons from the legal ones". Cards excluded for a
 * reason worth teaching are still DRAWN, disabled, with the reason on them — a card already in
 * your hand reads "yours" (row 7).
 *
 * ## State
 *
 * The selection resets when the position moves on, via the render-time reset React documents for
 * exactly this (a `key` remount would take the keyboard's focus with it — and on a hit you keep
 * the turn, so that used to throw a player back to the top of the document mid-turn).
 */
import { useEffect, useRef, useState } from 'react'
import type { BookId, Card, Seat, SeatView } from '../../lib/engine/index.ts'
import { allBooks, bookCards, cardBook, legalAsksFromView } from '../../lib/engine/index.ts'
import { cx } from '../components/index.ts'
import { CardFace } from './CardFace.tsx'
import { bookLabel, cardName, seatName } from './format.ts'
import s from './play.module.css'

const OPPONENTS: readonly Seat[] = [1, 3, 5]

export interface AskPanelProps {
  view: SeatView
  onAsk: (target: Seat, card: Card) => void
}

export function AskPanel({ view, onAsk }: AskPanelProps) {
  const [picked, setPicked] = useState<Seat | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  // React's own "adjusting state when a prop changes" pattern: cheaper and less destructive than
  // remounting, and it leaves the focused element where the player left it.
  const [atMove, setAtMove] = useState(view.moveIndex)
  const head = useRef<HTMLHeadingElement | null>(null)

  if (atMove !== view.moveIndex) {
    setAtMove(view.moveIndex)
    setPicked(null)
    setCard(null)
  }

  // The panel mounting IS the announcement that the turn came back to the human, so it takes the
  // focus rather than leaving a keyboard player to tab in from the top of the document.
  // `block: 'nearest'` and the default instant behaviour: no motion to suppress.
  useEffect(() => {
    head.current?.focus()
    head.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  const legal = legalAsksFromView(view)
  const liveTargets = OPPONENTS.filter((seat) => view.counts[seat] > 0)
  const target = picked !== null && liveTargets.includes(picked) ? picked : (liveTargets[0] ?? null)
  const held = new Set(view.hand)
  const myBooks = new Set(view.hand.map(cardBook))

  if (legal.length === 0 || target === null) return null

  // The offer, straight from the engine's enumeration, narrowed to the chosen opponent.
  const askable = new Set(legal.filter((a) => a.target === target).map((a) => a.card))

  const open: BookId[] = []
  const shut: BookId[] = []
  const done: BookId[] = []
  for (const book of allBooks(view.config)) {
    if (view.books[book]) done.push(book)
    else if (myBooks.has(book)) open.push(book)
    else shut.push(book)
  }

  // A stale selection is possible for one render after the opponent changes: the card the player
  // had chosen may not be offered against the new target. Treat it as no selection rather than
  // letting the submit button carry an ask the engine would refuse.
  const chosen = card !== null && askable.has(card) ? card : null

  return (
    <section className={s.panel} aria-labelledby="ask-head">
      <h2 id="ask-head" className={s.panelHead} ref={head} tabIndex={-1}>
        Your ask
      </h2>
      <p className={s.panelNote}>
        Name one opponent, then one card. You may only ask into a set you hold at least one card
        of (row 6), never for a card already in your hand (row 7). A hit keeps your turn; a miss
        passes it to the seat you asked.
      </p>

      <h3 className={s.step}>1 · Who are you asking?</h3>
      <div className={s.choiceRow} role="group" aria-label="Opponent to ask">
        {OPPONENTS.map((seat) => {
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
              Seat {seat}
              <span className={s.chipSub}>
                {out ? 'out of cards' : `${view.counts[seat]} cards`}
              </span>
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
                const mine = held.has(c)
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

      {/* The exclusions, at the size of the information rather than the size of the deck. */}
      {shut.length > 0 ? (
        <p className={s.excluded}>
          <span className={s.excludedWhat}>Not askable:</span>{' '}
          {shut.map((b) => bookLabel(b)).join(', ')} — you hold nothing in{' '}
          {shut.length === 1 ? 'it' : 'them'}, so row 6 closes {shut.length === 1 ? 'it' : 'them'}{' '}
          to you.
        </p>
      ) : null}
      {done.length > 0 ? (
        <p className={s.excluded}>
          <span className={s.excludedWhat}>Already resolved:</span>{' '}
          {done
            .map((b) => {
              const result = view.books[b]
              const who = result?.outcome === 'team0' ? 'your team' : 'team 1'
              return `${bookLabel(b)} (${who})`
            })
            .join(', ')}
          .
        </p>
      ) : null}

      <div className={s.panelActions}>
        <button
          type="button"
          className={cx(s.submit, chosen === null && s.submitOff)}
          disabled={chosen === null}
          onClick={() => {
            if (chosen !== null) onAsk(target, chosen)
          }}
        >
          {chosen === null ? (
            'Pick a card above to ask for'
          ) : (
            <>
              Ask {seatName(target)} for <CardFace card={chosen} />
            </>
          )}
        </button>
      </div>
    </section>
  )
}
