/**
 * The public log — every event the bots can see, and the whole information channel under row 17.
 *
 * ## Why this is not the lab's log
 *
 * It used to be `lab.log`, whose box is `max-height: 420px; overflow-y: auto` with no tab stop.
 * A scrolling box is operable with a mouse or a finger and completely unreachable from a
 * keyboard unless it is focusable (WCAG 2.1.1, the failure axe reports as
 * `scrollable-region-focusable`), so a keyboard reader could reach the newest dozen events and
 * nothing before them — in a game that ends with well over a hundred.
 *
 * The obvious fix, the site's own `ScrollRegion`, does not apply: it measures HORIZONTAL
 * overflow, because it was built for wide tables, and this box scrolls vertically. Rather than
 * change a shared component another surface depends on, the log became play-local and brought
 * the same discipline with it — the tab stop is MEASURED, not hard-coded, for exactly the reason
 * `useScrollable` gives: a stop that does nothing is its own accessibility problem, and at the
 * start of a game this box holds one line and does not scroll at all.
 *
 * ## Not a live region
 *
 * Deliberately. `aria-live` here narrated every bot move, every decline and every result over
 * the top of the player's own turn, which buried the one announcement that mattered. The newest
 * line is mirrored in the middle of the table as "Last move", and the single `role="status"` on
 * the surface is reserved for "it is your move now" (Table.tsx).
 */
import { useEffect, useRef, useState } from 'react'
import type { PublicEvent } from '../../lib/engine/index.ts'
import { describePlayEvent } from './format.ts'
import s from './play.module.css'

/**
 * Is this box actually scrolling vertically right now? The vertical twin of the site's
 * `useScrollable`, kept here because that one measures width and this box overflows in height.
 * Re-measured whenever the box or its contents change, which for a log is every move.
 */
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

export interface PublicLogProps {
  /** In engine order; the component reverses for display. */
  events: readonly PublicEvent[]
}

export function PublicLog({ events }: PublicLogProps) {
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
            <span>{describePlayEvent(row.event)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
