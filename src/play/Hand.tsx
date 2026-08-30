/**
 * Your hand — the cards you are holding, drawn as cards.
 *
 * This used to render with the same chip class as the ask picker's buttons, so the two blurred
 * into one wall of small grey boxes and a player could not tell what they HELD from what they
 * could ASK FOR. The hand is now unmistakably a different object: real card-sized faces in suit
 * ink, laid in a row per book on a felt-toned well, and nothing in it is clickable — a hand is
 * something you have, not something you choose from. (In Fish you never ask for a card you hold;
 * the picker is the only place a card is a control.)
 */
import type { SeatView } from '../../lib/engine/index.ts'
import { allBooks, cardBook, sortHand } from '../../lib/engine/index.ts'
import { CardFace } from './CardFace.tsx'
import { bookLabel } from './format.ts'
import s from './play.module.css'

export interface HandProps {
  view: SeatView
}

export function Hand({ view }: HandProps) {
  const sorted = sortHand(view.hand, view.config)
  const groups = allBooks(view.config)
    .map((book) => ({ book, cards: sorted.filter((c) => cardBook(c) === book) }))
    .filter((group) => group.cards.length > 0)

  return (
    <section className={s.handWell} aria-labelledby="hand-head">
      <div className={s.handHeadRow}>
        <h2 id="hand-head" className={s.handHead}>
          Your hand
        </h2>
        <span className={s.handCount}>
          {view.hand.length} {view.hand.length === 1 ? 'card' : 'cards'} in{' '}
          {groups.length === 1 ? '1 set' : `${groups.length} sets`}
        </span>
      </div>

      {groups.length === 0 ? (
        <p className={s.handEmpty}>
          You are out of cards. You can no longer ask or be asked, but you may still declare —
          arm the Declare control and take your next window offer.
        </p>
      ) : (
        <div className={s.hand}>
          {groups.map((group) => (
            <div key={group.book} className={s.handBook}>
              <span className={s.handBookName}>{bookLabel(group.book)}</span>
              <div className={s.handCards}>
                {group.cards.map((c) => (
                  <CardFace key={c} card={c} size="lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
