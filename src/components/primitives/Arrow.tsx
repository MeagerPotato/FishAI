import { cx } from '../lib/cx.ts'
import s from './primitives.module.css'

export type ArrowDirection = 'ne' | 'e' | 'sw'

export interface ArrowProps {
  /** `ne` leaves the page, `e` continues along it, `sw` jumps down to an anchor. */
  direction?: ArrowDirection
  className?: string
}

/**
 * One 24x24 glyph for the entire site, rotated into three meanings. Drawing a
 * second arrow shape would be the first crack in the system: direction is
 * carried by rotation, so an arrow always reads as the same object.
 */
export function Arrow({ direction = 'ne', className }: ArrowProps) {
  return (
    <svg
      className={cx(
        s.arrow,
        direction === 'e' && s.arrowE,
        direction === 'sw' && s.arrowSw,
        className,
      )}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5.5 18.5 L18.5 5.5" />
      <path d="M9.5 5.5 H18.5 V14.5" />
    </svg>
  )
}
