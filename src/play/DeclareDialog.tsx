/**
 * The declare dialog — RULES_US54.md rows 12–14, made operable for a seated human.
 *
 * A real `<dialog>` opened with `showModal()`, so focus trapping, inertness of the page behind
 * it and Escape handling come from the platform rather than from a hand-rolled trap. Escape is
 * allowed to stand the declare down (decline the offer) EXCEPT in a `MUST_DECLARE` position,
 * where declining is illegal (§3.2) and the dialog explains why instead of closing. A `close`
 * this component did not initiate — a force-close from outside — is resynced rather than
 * ignored: treated as the stand-down it visually was where declining is legal, reopened where
 * it is not, so the platform and `declareOpen` can never disagree about whether a MUST_DECLARE
 * decision is still owed.
 *
 * The assignment grid prefills what `buildKnowledge` of the HUMAN'S OWN view can prove — own
 * hand plus the public log, the same inference the bots run — and says so honestly. A prefill
 * is a certainty, not a suggestion: the interface still lets it be overridden, because the rules
 * do, and row 14 answers a wrong override the same way it answers any other error.
 */
import { useEffect, useRef, useState } from 'react'
import type { BookId, Card, Seat, SeatView } from '../../lib/engine/index.ts'
import { allBooks, bookCards, buildKnowledge, holderOf } from '../../lib/engine/index.ts'
import { Button } from '../components/index.ts'
import type { ExplainedDecision } from './advisor.ts'
import { describeSuggestion } from './AdvisorPane.tsx'
import { bookLabel, cardLabel, cardName } from './format.ts'
import s from './play.module.css'

const TEAMMATES: readonly Seat[] = [0, 2, 4]

export interface DeclareDialogProps {
  view: SeatView
  mustDeclare: boolean
  /** The assistant's suggestion for this decision (`?assist=1` only) — the pane behind the
   *  modal backdrop is inert, so the advice renders here too. */
  advice: ExplainedDecision | null
  onDeclare: (book: BookId, assignments: Record<Card, Seat>) => void
  onStandDown: () => void
}

export function DeclareDialog({ view, mustDeclare, advice, onDeclare, onStandDown }: DeclareDialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null)
  // Set while the unmount cleanup is closing the dialog itself, so the `close` listener below
  // can tell our own teardown apart from a force-close and not recurse into a reopen.
  const closing = useRef(false)
  const [book, setBook] = useState<BookId | null>(null)
  const [assign, setAssign] = useState<Partial<Record<Card, Seat>>>({})

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    closing.current = false
    if (!dialog.open) dialog.showModal()
    return () => {
      closing.current = true
      dialog.close()
    }
  }, [])

  // Escape: stand down where declining is legal; explain and stay where it is not.
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

  // `close` without our teardown means the platform shut the dialog under us (Escape lands on
  // `cancel` above and is prevented, but nothing stops a stray close()). Left alone that
  // desyncs from `declareOpen` — the page believes the dialog is open — and a MUST_DECLARE
  // position soft-locks with no way to act. Where declining is legal, a forced close is
  // treated as the stand-down it visually was; where it is not, the dialog is reopened.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onClose = () => {
      if (closing.current) return
      if (mustDeclare) {
        if (!dialog.open) dialog.showModal()
      } else {
        onStandDown()
      }
    }
    dialog.addEventListener('close', onClose)
    return () => {
      dialog.removeEventListener('close', onClose)
    }
  }, [mustDeclare, onStandDown])

  const unresolved = allBooks(view.config).filter((b) => !view.books[b])
  const knowledge = buildKnowledge(view)

  const pick = (b: BookId) => {
    const prefill: Partial<Record<Card, Seat>> = {}
    for (const c of bookCards(b, view.config)) {
      const holder = holderOf(knowledge, c)
      if (holder !== null && TEAMMATES.includes(holder)) prefill[c] = holder
    }
    setBook(b)
    setAssign(prefill)
  }

  const cards = book ? bookCards(book, view.config) : []
  const allAssigned = book !== null && cards.every((c) => assign[c] !== undefined)
  const certain = new Set(
    cards.filter((c) => {
      const holder = holderOf(knowledge, c)
      return holder !== null && TEAMMATES.includes(holder)
    }),
  )

  return (
    <dialog ref={ref} className={s.dialog} aria-labelledby="declare-title">
      <h2 id="declare-title" className={s.panelHead}>
        {mustDeclare ? 'You must declare' : 'Declare a set'}
      </h2>
      {mustDeclare ? (
        <p className={s.panelNote}>
          The turn-holder has no legal ask, so this window cannot close into a turn and declining
          is illegal here (<code>MUST_DECLARE</code>, RULES_US54.md §3.2). A declare is always
          constructible: name the set you can place best. A wrong one gifts the set — but a set
          must resolve, and that is what ends the game rather than hanging it.
        </p>
      ) : (
        <p className={s.panelNote}>
          Name an unresolved set and place all six of its cards with your own team — you, seat 2
          and seat 4. You may declare a set you hold no card of (row 15).
        </p>
      )}

      {advice ? (
        <div className={s.dialogAdvice}>
          <span className={s.dialogAdviceHead}>Assistant</span>
          <p className={s.panelNote} style={{ margin: 0 }}>
            <strong>{describeSuggestion(advice.action)}</strong> — {advice.trace.headline}
          </p>
          {advice.trace.claim ? (
            <p className={s.panelNote} style={{ margin: '6px 0 0' }}>
              Declare plan: {bookLabel(advice.trace.claim.book)} · p ={' '}
              {advice.trace.claim.p.toFixed(2)} · {advice.trace.claim.uncertain} guessed
              {advice.trace.claim.foreign ? ' · a set this seat holds no card of' : ''}
            </p>
          ) : null}
          {advice.action.type === 'decline' ? (
            <p className={s.panelNote} style={{ margin: '6px 0 0' }}>
              The advisor would not declare from here — any error gifts the whole set (row 14),
              and declining this offer is legal. Stand down below if you agree.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={s.choiceRow} role="group" aria-label="Unresolved sets">
        {unresolved.map((b) => (
          <button
            key={b}
            type="button"
            className={`${s.chip} ${b === book ? s.chipOn : ''}`}
            aria-pressed={b === book}
            onClick={() => {
              pick(b)
            }}
          >
            {bookLabel(b)}
          </button>
        ))}
      </div>

      {book ? (
        <>
          <p className={s.panelNote} style={{ marginBottom: 0 }}>
            Prefilled where the public log and your hand make it certain; everything else is
            yours to place.
          </p>
          <div className={s.assign}>
            {cards.map((c) => (
              <div key={c} className={s.assignRow}>
                <div className={s.assignCard}>
                  <span className={`${s.chipFace}`}>{cardLabel(c)}</span>
                  {certain.has(c) ? <span className={s.known}>certain</span> : null}
                </div>
                <div className={s.assignSeats} role="group" aria-label={`Holder of ${cardName(c)}`}>
                  {TEAMMATES.map((seat) => (
                    <button
                      key={seat}
                      type="button"
                      className={`${s.chip} ${assign[c] === seat ? s.chipOn : ''}`}
                      aria-pressed={assign[c] === seat}
                      onClick={() => {
                        setAssign((prev) => ({ ...prev, [c]: seat }))
                      }}
                    >
                      {seat === 0 ? 'You' : `Seat ${seat}`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className={s.warn}>
            Row 14: any error at all — an opponent holding one of the six, or one card placed
            with the wrong teammate — gifts the whole set to the opposing team. There is no void
            outcome in this rule set.
          </p>
        </>
      ) : null}

      <div className={s.dialogActions}>
        <Button
          variant="ghost"
          arrow={false}
          disabled={!allAssigned}
          onClick={() => {
            if (book && allAssigned) onDeclare(book, { ...assign } as Record<Card, Seat>)
          }}
        >
          {book ? `Declare ${bookLabel(book)}` : 'Pick a set to declare'}
        </Button>
        {!mustDeclare ? (
          <Button variant="line" arrow={false} onClick={onStandDown}>
            Stand down — decline this offer
          </Button>
        ) : null}
      </div>
    </dialog>
  )
}
