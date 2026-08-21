import type { ReactNode } from 'react'
import { cx } from '../lib/cx.ts'
import s from './SheetRoot.module.css'

export interface SheetRootProps {
  children: ReactNode
  /**
   * `ruling` is the 5px ledger ground used everywhere the page is prose.
   * `dots` is the 22px dot grid, for dense-data routes where a horizontal rule
   * every 5px would fight the table rows.
   */
  ground?: 'ruling' | 'dots'
  className?: string
}

/**
 * The outermost page element. Owns the fixed ruling, the fixed sheet, and the
 * two frame hairlines that every other component aligns to.
 *
 * Exactly one of these per page.
 */
export function SheetRoot({ children, ground = 'ruling', className }: SheetRootProps) {
  return (
    <div className={cx(s.root, ground === 'dots' && s.dots, className)}>{children}</div>
  )
}

/** Class name for a band that must re-paint the ledger ruling over itself. */
export const ruledBand = s.ruled
