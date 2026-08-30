/**
 * The shared table, mid-game.
 *
 * ## What this surface can and cannot know
 *
 * It holds a `seatView`: the public table plus exactly one hand. That is less than the solo
 * surface has, and one consequence is worth naming. `MUST_DECLARE` — the RULES_US54.md §3.2
 * position where declining is illegal because the turn-holder has no legal ask — is decided by
 * `turnHolderCanAsk`, which reads the TURN-HOLDER'S hand. No client but theirs can compute it,
 * and none should be able to: it would leak the shape of somebody else's hand.
 *
 * So this surface does not predict that position, it LEARNS it. Decline is offered; if the engine
 * refuses with `MUST_DECLARE`, the refusal is what opens the declare dialog in its must-declare
 * form. The rule is enforced in exactly one place — the reducer — and the interface follows it
 * rather than keeping a second, weaker copy that could disagree.
 *
 * ## The one live region
 *
 * `role="status"` announces whose move it is, and nothing else. Accessibility parity with the solo
 * table is deliberate: five other people moving is exactly the firehose that would bury the one
 * announcement a player needs, so the log is not a live region and refusals get `role="alert"`.
 */
import { useState } from 'react'
import type { BookId, Card, PublicState, Seat } from '../../../lib/engine/index.ts'
import { allBooks } from '../../../lib/engine/index.ts'
import { Button, cx } from '../../components/index.ts'
import { Hand } from '../Hand.tsx'
import { bookLabel } from '../format.ts'
import type { RoomMove, RoomRefusal, RoomSnapshot } from './protocol.ts'
import { TEAM_LABEL } from './protocol.ts'
import { RoomAsk } from './RoomAsk.tsx'
import { RoomDeclare } from './RoomDeclare.tsx'
import { RoomLog } from './RoomLog.tsx'
import { RoomSeats } from './RoomSeats.tsx'
import { describeRoomEvent, namesFrom } from './view.ts'
import s from './room.module.css'

export interface RoomTableProps {
  snapshot: RoomSnapshot
  refusal: RoomRefusal | null
  busy: boolean
  live: boolean
  paceLeftMs: number
  onPlay: (move: RoomMove) => void
  onDismissRefusal: () => void
  onRefresh: () => void
}

export function RoomTable({
  snapshot,
  refusal,
  busy,
  live,
  paceLeftMs,
  onPlay,
  onDismissRefusal,
  onRefresh,
}: RoomTableProps) {
  const [declareOpen, setDeclareOpen] = useState(false)
  // Reset the dialog when the position moves on, rather than remounting the surface — a remount
  // would take the keyboard's focus with it.
  const [atMove, setAtMove] = useState(-1)

  const seatView = snapshot.view
  const table: PublicState | null = seatView ?? snapshot.publicState
  if (!table) {
    return (
      <p className={s.panelNote}>
        This room is playing, but the table has not arrived yet.{' '}
        <Button variant="line" arrow={false} onClick={onRefresh}>
          Ask again
        </Button>
      </p>
    )
  }

  if (atMove !== table.moveIndex) {
    setAtMove(table.moveIndex)
    setDeclareOpen(false)
  }

  const nameOf = namesFrom(snapshot.lobby)
  const viewer = snapshot.seat
  const windowOpen = table.declareWindow !== undefined
  const acting = table.declareWindow?.option ?? table.turn
  const finished = table.phase === 'finished'
  const mine = viewer !== null && acting === viewer && !finished

  // Learned from the engine, never predicted — see the file header.
  const mustDeclare = refusal?.code === 'MUST_DECLARE'
  const showDialog = seatView !== null && (declareOpen || mustDeclare)

  const lastEvent = table.log[table.log.length - 1]
  const lastMove = lastEvent ? describeRoomEvent(lastEvent, viewer, nameOf) : 'The cards are dealt.'
  const resolved = allBooks(table.config).filter((b) => table.books[b]).length
  const total = allBooks(table.config).length
  const paceHeld = paceLeftMs > 0

  const whoseMove = finished
    ? 'The game is over.'
    : mine
      ? windowOpen
        ? 'Your declare option — declare a set, or stand down.'
        : 'Your move.'
      : windowOpen
        ? `${nameOf(acting)} has the declare option.`
        : `${nameOf(acting)} to move.`

  return (
    <div className={s.surface}>
      <div className={s.tableCol}>
        <div className={s.score}>
          <span className={s.scoreTeam}>{TEAM_LABEL[0]}</span>
          <span className={s.scoreNum}>{table.score[0]}</span>
          <span className={s.scoreDash}>–</span>
          <span className={s.scoreNum}>{table.score[1]}</span>
          <span className={s.scoreTeam}>{TEAM_LABEL[1]}</span>
          <span className={s.scoreMeta}>
            {resolved} of {total} sets resolved
          </span>
        </div>

        {/* The one live region on the surface. */}
        <p className={cx(s.turnLine, mine && s.turnLineYours)} role="status">
          {whoseMove}
          {paceHeld && !finished ? ` The table is catching up — ${(paceLeftMs / 1000).toFixed(1)}s.` : ''}
        </p>

        <RoomSeats
          table={table}
          viewer={viewer}
          nameOf={nameOf}
          acting={acting}
          windowOpen={windowOpen}
          finished={finished}
          lastMove={lastMove}
        />

        {seatView ? <Hand view={seatView} /> : null}

        {finished ? (
          <section className={s.over} aria-labelledby="over-head">
            <h2 id="over-head" className={s.panelHead}>
              Game over
            </h2>
            <p className={s.overBody}>
              {table.score[0]}–{table.score[1]}
              {resolved < total ? ` · ${total - resolved} unresolved` : ''}. A clinched game ends
              with sets still unresolved and cards still in hands — that is the rule set, not a
              stopped clock.
            </p>
            <ul className={s.bookList}>
              {allBooks(table.config).map((book) => {
                const result = table.books[book]
                return (
                  <li key={book} className={s.bookListRow}>
                    <span className={s.bookName}>{bookLabel(book)}</span>
                    <span>
                      {result === undefined
                        ? 'unresolved'
                        : result.outcome === 'void'
                          ? 'void'
                          : `${TEAM_LABEL[result.outcome === 'team0' ? 0 : 1]}, declared by ${nameOf(result.claimer)}`}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {refusal ? (
          <div className={s.refusal} role="alert">
            <span className={s.refusalCode}>{refusal.code}</span>
            <p className={s.refusalText}>{refusal.message}</p>
            <Button variant="line" arrow={false} onClick={onDismissRefusal}>
              Dismiss
            </Button>
          </div>
        ) : null}

        {mine && seatView && !finished ? (
          windowOpen ? (
            <section className={s.panel} aria-labelledby="option-head">
              <h2 id="option-head" className={s.panelHead}>
                Your declare option
              </h2>
              <p className={s.panelNote}>
                After every action, every seat in turn order is offered the chance to declare a set
                (RULES_US54.md §3). Take it or stand down; six stand-downs in a row close the window
                and {nameOf(table.turn)} asks.
              </p>
              <div className={s.panelActions}>
                <button
                  type="button"
                  className={cx(s.submit, busy && s.submitOff)}
                  disabled={busy}
                  onClick={() => {
                    setDeclareOpen(true)
                  }}
                >
                  Declare a set
                </button>
                <Button
                  variant="line"
                  arrow={false}
                  onClick={() => {
                    onPlay({ type: 'decline' })
                  }}
                >
                  Stand down
                </Button>
              </div>
            </section>
          ) : (
            <RoomAsk
              view={seatView}
              nameOf={nameOf}
              held={paceHeld}
              disabled={busy}
              onAsk={(target, card) => {
                onPlay({ type: 'ask', target, card })
              }}
            />
          )
        ) : null}

        {showDialog && seatView ? (
          <RoomDeclare
            view={seatView}
            nameOf={nameOf}
            mustDeclare={mustDeclare}
            disabled={busy}
            onDeclare={(book: BookId, assignments: Record<Card, Seat>) => {
              setDeclareOpen(false)
              onDismissRefusal()
              onPlay({ type: 'claim', book, assignments })
            }}
            onStandDown={() => {
              setDeclareOpen(false)
              onPlay({ type: 'decline' })
            }}
            onClose={() => {
              setDeclareOpen(false)
            }}
          />
        ) : null}
      </div>

      <div className={s.logCol}>
        <h2 className={s.panelHead}>Public log</h2>
        <p className={s.panelNote}>
          Everything every seat can see — the whole information channel this game runs on.
          {live ? '' : ' The live connection is down; this page is asking for updates instead.'}
        </p>
        <RoomLog events={table.log} viewer={viewer} nameOf={nameOf} />
      </div>
    </div>
  )
}
