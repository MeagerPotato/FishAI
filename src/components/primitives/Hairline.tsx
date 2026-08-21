import { cx } from '../lib/cx.ts'
import s from './primitives.module.css'

export type HairlineVariant = 'line' | 'soft' | 'frame' | 'dashed'

export interface HairlineProps {
  /**
   * `frame` is page architecture — it insets to the gutters and matches the
   * sheet edges. `line` / `soft` are component chrome. `dashed` belongs to the
   * inverted ink panel and nowhere else, so that a dashed rule always means the
   * same thing.
   */
  variant?: HairlineVariant
  className?: string
}

/** A 1px rule. Never a `border` on a section — see Section.module.css. */
export function Hairline({ variant = 'line', className }: HairlineProps) {
  return (
    <hr
      className={cx(
        s.hairline,
        variant === 'frame' && s.hairlineFrame,
        variant === 'soft' && s.hairlineSoft,
        variant === 'dashed' && s.hairlineDashed,
        className,
      )}
    />
  )
}

export interface MarksProps {
  /** Optional amber tab, which replaces the top-left mark. */
  badge?: string
  className?: string
}

/**
 * Standalone crop marks. Use where the element that should carry them cannot —
 * a sticky pin, or anything whose own `::after` is already spoken for.
 */
export function CropMarks({ badge, className }: MarksProps) {
  return <i className={cx(s.cropMarks, className)} data-badge={badge} aria-hidden="true" />
}

/**
 * The footer brackets: the bottom-of-page mirror of the crop marks, closing the
 * sheet the way the section marks opened it.
 */
export function FootMarks({ className }: { className?: string }) {
  return <i className={cx(s.footMarks, className)} aria-hidden="true" />
}
