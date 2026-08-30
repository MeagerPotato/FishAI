/**
 * The declare, at a table where your two teammates have names.
 *
 * A wrapper rather than a use of `src/play/DeclareDialog.tsx`, for three reasons and not one:
 * that component holds `const TEAMMATES = [0, 2, 4]` (wrong for anyone on the odd side), it names
 * them "You / Seat 2 / Seat 4" (a room has people), and it imports the assistant pane, which is a
 * solo-play affordance — a hint engine reading your own hand has no business at a table where the
 * other five are humans who did not opt into playing against it.
 *
 * What is kept is the part that matters: a real `<dialog>` opened with `showModal()`, so focus
 * trapping, inertness of the page behind it and Escape handling come from the platform rather
 * than from a hand-rolled trap. Escape stands the declare down where declining is legal and
 * explains itself where it is not (`MUST_DECLARE`, RULES_US54.md §3.2), and a `close` this
 * component did not initiate is resynced rather than ignored — otherwise a forced close in a
 * must-declare position soft-locks a player out of the only move they have.
 *
 * The assignment grid is NOT prefilled here. The solo dialog prefills what `buildKnowledge` can
 * prove from your own hand and the public log; that inference is the bots' and it is the same
 * work a human is supposed to be doing at a real table. Against five other people, handing one of
 * them the engine's deductions is not an accessibility affordance, it is an advantage nobody
 * agreed to. Row 14 is stated instead, because the risk is the thing a declarer needs to know.
 */
import { useEffect, useRef, useState } from 'react'
import type { BookId, Card, Seat } from '../../../lib/engine/index.ts'
import { allBooks, bookCards } from '../../../lib/engine/index.ts'
import { Button, cx } from '../../components/index.ts'
import { CardFace } from '../CardFace.tsx'
import { bookLabel, cardName } from '../format.ts'
import type { RoomSeatView } from './protocol.ts'
import { teammatesOf } from './view.ts'
import s from './room.module.css'

export interface RoomDeclareProps {
  view: RoomSeatView
  nameOf: (seat: Seat) => string
  /** True in a window no ask can follow, where declining is illegal (RULES_US54.md §3.2). */
  mustDeclare: boolean
  disabled: boolean
  onDeclare: (book: BookId, assignments: Record<Card, Seat>) => void
  onStandDown: () => void
  onClose: () => void
}

export function RoomDeclare({
  view,
  nameOf,
  mustDeclare,
  disabled,
  onDeclare,
  onStandDown,
  onClose,
}: RoomDeclareProps) {
  const ref = useRef<HTMLDialogElement | null>(null)
  // Set while our own teardown closes the dialog, so the `close` listener can tell that apart
  // from a force-close and not recurse into a reopen.
  const closing = useRef(false)
  const [book, setBook] = useState<BookId | null>(null)
  const [assign, setAssign] = useState<Partial<Record<Card, Seat>>>({})

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    closing.current = false
    const opener = document.activeElement
    if (!dialog.open) dialog.showModal()
    return () => {
      closing.current = true
      dialog.close()
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus()
    }
  }, [])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onCancel = (event: Event) => {
      event.preventDefault()
      if (!mustDeclare) onStandDown()
    }
    dialog.addEventListener('cancel', onCancel)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
    }
  }, [mustDeclare, onStandDown])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onDialogClose = () => {
      if (closing.current) return
      if (mustDeclare) {
        if (!dialog.open) dialog.showModal()
      } else {
        onClose()
      }
    }
    dialog.addEventListener('close', onDialogClose)
    return () => {
      dialog.removeEventListener('close', onDialogClose)
    }
  }, [mustDeclare, onClose])

  const unresolved = allBooks(view.config).filter((b) => !view.books[b])
  const teammates = teammatesOf(view.seat)
  const cards = book ? bookCards(book, view.config) : []
  const allAssigned = book !== null && cards.every((c) => assign[c] !== undefined)

  return (
    <dialog ref={ref} className={s.dialog} aria-labelledby="room-declare-title">
      <h2 id="room-declare-title" className={s.panelHead}>
        {mustDeclare ? 'You must declare' : 'Declare a set'}
      </h2>
      {mustDeclare ? (
        <p className={s.panelNote}>
          The turn-holder has no legal ask, so this window cannot close into a turn and declining is
          illegal here (<code>MUST_DECLARE</code>, RULES_US54.md §3.2). A declare is always
          constructible: name the set you can place best. A wrong one gifts the set — but a set must
          resolve, and that is what ends the game rather than hanging it.
        </p>
      ) : (
        <p className={s.panelNote}>
          Name an unresolved set and place all six of its cards with your own side —{' '}
          {teammates.map((seat) => (seat === view.seat ? 'you' : nameOf(seat))).join(', ')}. You may
          declare a set you hold no card of (row 15).
        </p>
      )}

      <div className={s.choiceRow} role="group" aria-label="Unresolved sets">
        {unresolved.map((b) => (
          <button
            key={b}
            type="button"
            className={cx(s.chip, b === book && s.chipOn)}
            aria-pressed={b === book}
            onClick={() => {
              setBook(b)
              setAssign({})
            }}
          >
            {bookLabel(b)}
          </button>
        ))}
      </div>

      {book ? (
        <div className={s.dialogBody}>
          <p className={s.panelNote} style={{ marginBottom: 0 }}>
            Place each of the six with the person you believe is holding it. Nothing is filled in
            for you — at a table of six people, the deductions are yours to make.
          </p>
          <div className={s.assign}>
            {cards.map((c) => (
              <div key={c} className={s.assignRow}>
                <div className={s.assignCard}>
                  <CardFace card={c} />
                </div>
                <div className={s.assignSeats} role="group" aria-label={`Holder of ${cardName(c)}`}>
                  {teammates.map((seat) => (
                    <button
                      key={seat}
                      type="button"
                      className={cx(s.chip, assign[c] === seat && s.chipOn)}
                      aria-pressed={assign[c] === seat}
                      onClick={() => {
                        setAssign((prev) => ({ ...prev, [c]: seat }))
                      }}
                    >
                      {seat === view.seat ? 'You' : nameOf(seat)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Pinned to the bottom rather than appended after six assignment rows: at narrow widths
          those rows run past the dialog's max-height, which put both the row-14 warning and the
          button below the fold OF A MODAL — the one place a reader has no page scrollbar to tell
          them there is more. */}
      <div className={s.dialogFoot}>
        {book ? (
          <p className={s.warn}>
            Row 14: any error at all — an opponent holding one of the six, or one card placed with
            the wrong teammate — gifts the whole set to the other side. There is no void outcome in
            this rule set.
          </p>
        ) : null}

        <div className={s.dialogActions}>
          <button
            type="button"
            className={cx(s.submit, (!allAssigned || disabled) && s.submitOff)}
            disabled={!allAssigned || disabled}
            onClick={() => {
              if (book && allAssigned) onDeclare(book, { ...assign } as Record<Card, Seat>)
            }}
          >
            {book === null ? 'Pick a set to declare' : `Declare ${bookLabel(book)}`}
          </button>
          {!mustDeclare ? (
            <Button variant="line" arrow={false} onClick={onStandDown}>
              Stand down — decline this offer
            </Button>
          ) : null}
        </div>
      </div>
    </dialog>
  )
}
