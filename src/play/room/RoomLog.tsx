/**
 * The public log, with the players' names in it.
 *
 * `src/play/PublicLog.tsx` takes only `events` and phrases them through `describePlayEvent`, which
 * calls seat 0 "you" and everyone else "seat N". At a shared table that is wrong twice over: the
 * reader is usually not seat 0, and the other five are people who told us what to call them. The
 * component is otherwise copied in shape, including the thing it exists for — a MEASURED tab stop.
 *
 * A scrolling box is operable with a mouse and completely unreachable from a keyboard unless it is
 * focusable (WCAG 2.1.1, the failure axe reports as `scrollable-region-focusable`), so a keyboard
 * reader could reach the newest dozen events and nothing before them. The stop is measured rather
 * than hard-coded for the reason the solo version gives: a tab stop that does nothing is its own
 * accessibility problem, and at the start of a game this box holds one line and does not scroll.
 *
 * Deliberately not a live region. `aria-live` here would narrate five other people's moves over
 * the top of the reader's own turn; the newest line is mirrored on the felt as "Last move", and
 * the surface's single `role="status"` is reserved for "it is your move now".
 */
import { useEffect, useRef, useState } from 'react'
import type { PublicEvent, Seat } from '../../../lib/engine/index.ts'
import { describeRoomEvent } from './view.ts'
import s from './room.module.css'

/** Is this box actually scrolling right now? Re-measured whenever it or its contents change. */
function useScrollsVertically(ref: React.RefObject<HTMLElement | null>): 0 | undefined {
  const [scrollable, setScrollable] = useState(false)
  const last = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const read = () => {
      const next = el.scrollHeight > el.clientHeight + 1
      if (next === last.current) return
      last.current = next
      setScrollable(next)
    }

    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    const mo = new MutationObserver(read)
    mo.observe(el, { childList: true, subtree: true })

    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [ref])

  return scrollable ? 0 : undefined
}

export interface RoomLogProps {
  /** In engine order; the component reverses for display. */
  events: readonly PublicEvent[]
  viewer: Seat | null
  nameOf: (seat: Seat) => string
}

export function RoomLog({ events, viewer, nameOf }: RoomLogProps) {
  const box = useRef<HTMLDivElement | null>(null)
  const tabIndex = useScrollsVertically(box)
  const scrolls = tabIndex !== undefined
  const rows = events.map((event, i) => ({ key: i, event })).reverse()

  return (
    <div
      ref={box}
      className={s.logBox}
      tabIndex={tabIndex}
      role={scrolls ? 'region' : undefined}
      aria-label={scrolls ? 'Public log, newest first' : undefined}
    >
      <ol className={s.log} aria-label={scrolls ? undefined : 'Public log, newest first'}>
        {rows.map((row) => (
          <li key={row.key} className={s.logRow}>
            <span className={s.logIx}>{String(row.key).padStart(3, '0')}</span>
            <span>{describeRoomEvent(row.event, viewer, nameOf)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
