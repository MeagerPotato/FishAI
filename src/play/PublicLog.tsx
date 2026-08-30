/**
 * The public log — every event the bots can see, and the whole information channel under row 17.
 *
 * ## Two views, and which of them is the real rule
 *
 * The printed rulebook this dialect comes from says: *"You may ask what the previous two asks by
 * players were if you forget. You cannot ask or reveal any previous information."* Row 17's
 * unlimited public log is a DEVIATION from that — the one the rules audit found and this control
 * answers — so **`recent` is the default**, because it is the accurate one. `all` is a
 * convenience that goes beyond what a real table allows, and the view says so in words rather
 * than leaving a player to discover they have been reading with an advantage.
 *
 * ## `recent` is not `slice(-2)`, and must never be simplified into it
 *
 * The rule restricts **asks**. The log also carries declares, out-of-cards notices and the
 * game's start and end, and those are not "previous information" a player is being asked to
 * forget — they are the state of the table, still sitting in front of everyone. A resolved set
 * is a physical pile of six cards nobody can un-see; a seat with no cards is visibly empty; the
 * score is on the strip above regardless of which view is chosen. So `recent` hides exactly one
 * thing — ask history beyond the last two — and keeps every other event, however old.
 *
 * A `slice(-2)` over the whole log would be shorter, would look right on a quiet turn, and would
 * be wrong in both directions at once: it would hide sets that were declared an hour ago and are
 * still on the table, and it would spend one of the two remembered slots on a declare, leaving a
 * player entitled to two asks able to see one. The original indices are kept and printed for the
 * same reason — a numbered gap is honest about what is being withheld.
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
import { cx } from '../components/index.ts'
import type { BotNames } from './format.ts'
import { describePlayEvent } from './format.ts'
import s from './play.module.css'

/** `recent` is the rule (the last two asks); `all` is the convenience that exceeds it. */
export type LogView = 'recent' | 'all'

/** How many asks the rulebook lets a player be reminded of. Two. */
export const RECENT_ASKS = 2

/** A log row keeps its ORIGINAL index, so a filtered view shows honestly where the gaps are. */
export interface LogRow {
  index: number
  event: PublicEvent
}

/**
 * The rows a view shows, oldest first. Pure and exported so the rule above is testable without
 * a DOM — see tests/play/log-view.test.ts, which pins the two properties that matter: `recent`
 * keeps at most RECENT_ASKS asks, and it keeps EVERY non-ask event no matter how old.
 */
export function visibleEvents(events: readonly PublicEvent[], view: LogView): LogRow[] {
  const rows = events.map((event, index) => ({ index, event }))
  if (view === 'all') return rows
  const asks = rows.filter((row) => row.event.type === 'ask')
  // The index of the older of the two asks a player may still be told about. With two or fewer
  // asks played there is nothing to withhold, and -1 keeps them all.
  const cutoff = asks.length > RECENT_ASKS ? asks[asks.length - RECENT_ASKS].index : -1
  return rows.filter((row) => row.event.type !== 'ask' || row.index >= cutoff)
}

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
  /** What the player called the bots. Absent at the shared table, where there are none. */
  names?: BotNames
}

export function PublicLog({ events, names }: PublicLogProps) {
  const box = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState<LogView>('recent')
  const tabIndex = useScrollsVertically(box)
  const scrolls = tabIndex !== undefined
  const rows = visibleEvents(events, view).reverse()
  const hidden = events.length - rows.length

  return (
    <>
      {/* Not a radio group: two mutually exclusive buttons carrying `aria-pressed` are the same
          toggle pattern as the pace and Declare controls three inches to the left, and one
          surface should ask a player to learn one idiom. */}
      <div className={s.logViews} role="group" aria-label="How much of the log to show">
        <button
          type="button"
          className={cx(s.toggle, s.paceBtn, view === 'recent' && s.toggleOn)}
          aria-pressed={view === 'recent'}
          onClick={() => {
            setView('recent')
          }}
        >
          Last two asks
        </button>
        <button
          type="button"
          className={cx(s.toggle, s.paceBtn, view === 'all' && s.toggleOn)}
          aria-pressed={view === 'all'}
          onClick={() => {
            setView('all')
          }}
        >
          Everything
        </button>
      </div>

      <p className={s.logNote}>
        {view === 'recent' ? (
          <>
            The table&rsquo;s own rule: you may be reminded of the previous two asks, and nothing
            older. Declares, out-of-cards notices and the score are not memory — they are the
            board, and stay in both views.
            {hidden > 0 ? ` ${hidden} older ask${hidden === 1 ? '' : 's'} withheld.` : ''}
          </>
        ) : (
          <>
            <strong>Beyond the table.</strong> Row 17&rsquo;s full log is more than a seated
            player is allowed to recall; the bots reason over all of it, and this view lets you
            check their work. Switch back to play by the rule.
          </>
        )}
      </p>

      <div
        ref={box}
        className={s.logBox}
        tabIndex={tabIndex}
        role={scrolls ? 'region' : undefined}
        aria-label={scrolls ? 'Public log, newest first' : undefined}
      >
        <ol className={s.log} aria-label={scrolls ? undefined : 'Public log, newest first'}>
          {rows.map((row) => (
            <li key={row.index} className={s.logRow}>
              <span className={s.logIx}>{String(row.index).padStart(3, '0')}</span>
              <span>{describePlayEvent(row.event, names)}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  )
}
