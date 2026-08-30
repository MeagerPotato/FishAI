import type { CSSProperties, ReactNode, RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import s from './lab.module.css'

/**
 * Is this box actually scrolling right now, on EITHER axis?
 *
 * The design system's `useScrollable` asks the same question about the horizontal axis alone,
 * which was the whole truth while `.scroll` was `overflow-y: hidden`. It is not any more: the
 * sticky-header fix gave `.scroll` a `max-height`, so a table can now be perfectly narrow and
 * still scroll — the 36-cell table on `/lab/matrix` at 1440px is exactly that, 1,268px wide in a
 * 1,268px box and 1,536px tall in a 646px one.
 *
 * A box that scrolls only vertically and is not focusable is the same WCAG 2.1.1 failure the
 * horizontal case is (`scrollable-region-focusable`): pannable by mouse and wheel, unreachable
 * from a keyboard. So this measures both axes, and is deliberately local rather than a change to
 * the shared hook — `Frame.tsx`, its other caller, has no `max-height` and would gain nothing but
 * a second `ResizeObserver` read. The shared hook growing a vertical axis is the right long-term
 * fix and is noted as such; it is not this file's to make.
 */
function useScrollportFocusable(ref: RefObject<HTMLElement | null>): 0 | undefined {
  const [scrollable, setScrollable] = useState(false)
  // Mirrored in a ref so the observer can skip identical readings without re-subscribing on
  // every state change.
  const last = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const read = () => {
      const next = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
      if (next === last.current) return
      last.current = next
      setScrollable(next)
    }

    read()

    // The box changes on viewport resize; the CONTENT changes when a font swaps in or a
    // `<details>` opens. One observer on each covers both.
    const ro = new ResizeObserver(read)
    ro.observe(el)
    for (const child of el.children) ro.observe(child)

    return () => {
      ro.disconnect()
    }
  }, [ref])

  return scrollable ? 0 : undefined
}

export interface ScrollRegionProps {
  /**
   * Names the region for a screen reader while it is scrollable. Say what the
   * table holds, not that it scrolls — the role already carries that.
   */
  label: string
  style?: CSSProperties
  children: ReactNode
}

/**
 * A table too big for the column, wrapped so it scrolls itself rather than the
 * page.
 *
 * The tab stop is the point. A scrolling box is pannable with a mouse or a
 * finger and completely unreachable from a keyboard unless it is focusable —
 * WCAG 2.1.1, the failure axe reports as `scrollable-region-focusable` — and on
 * this site the matrix table is 1,092px wide inside a 340px column at 390px, so
 * two thirds of it are simply gone.
 * `role="region"` plus a name is the W3C table tutorial's own recommendation
 * for exactly this wrapper.
 *
 * Both attributes appear only while the box really is scrolling: at 1280px most
 * of these tables fit on both axes, and a tab order full of stops that do
 * nothing is its own accessibility problem.
 */
export function ScrollRegion({ label, style, children }: ScrollRegionProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const tabIndex = useScrollportFocusable(ref)
  const scrolls = tabIndex !== undefined
  return (
    <div
      ref={ref}
      className={s.scroll}
      style={style}
      tabIndex={tabIndex}
      role={scrolls ? 'region' : undefined}
      aria-label={scrolls ? label : undefined}
    >
      {children}
    </div>
  )
}
