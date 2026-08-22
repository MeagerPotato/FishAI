import type { CSSProperties, ReactNode } from 'react'
import { useRef } from 'react'
import { useScrollable } from '../../components/hooks/useScrollable.ts'
import s from './lab.module.css'

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
 * A table too wide for the column, wrapped so it scrolls itself rather than the
 * page.
 *
 * The tab stop is the point. A `overflow-x: auto` box is pannable with a mouse
 * or a finger and completely unreachable from a keyboard unless it is
 * focusable — WCAG 2.1.1, the failure axe reports as
 * `scrollable-region-focusable` — and on this site the matrix table is 978px
 * wide inside a 325px column, so the right two thirds of it are simply gone.
 * `role="region"` plus a name is the W3C table tutorial's own recommendation
 * for exactly this wrapper.
 *
 * Both attributes appear only while the box really is scrolling: at 1280px most
 * of these tables fit, and a tab order full of stops that do nothing is its own
 * accessibility problem.
 */
export function ScrollRegion({ label, style, children }: ScrollRegionProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const tabIndex = useScrollable(ref)
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
