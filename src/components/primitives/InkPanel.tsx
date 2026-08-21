import type { ReactNode } from 'react'
import { cx } from '../lib/cx.ts'
import { Eyebrow } from './Eyebrow.tsx'
import s from './InkPanel.module.css'

export interface InkPanelProps {
  /**
   * Engineering-drawing copy, left of the head rule. The one borrowed device
   * that must carry real information: `FIG. 005 — Verdict`, not decoration.
   */
  fig: string
  /** Right of the head rule, beside the pulsing square. Keep it a live fact. */
  live?: string
  children: ReactNode
  className?: string
}

/**
 * The inverted block. Spend it once per page — on the sign-off, the verdict, or
 * whatever the page is actually for.
 */
export function InkPanel({ fig, live, children, className }: InkPanelProps) {
  return (
    <div className={cx(s.panel, className)}>
      <div className={s.inner}>
        <div className={s.head}>
          <Eyebrow tone="muted" track="badge">
            {fig}
          </Eyebrow>
          {live ? (
            <Eyebrow track="badge" className={s.live}>
              {live}
            </Eyebrow>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  )
}

export const inkPanelBody = s.body
export const inkPanelNote = s.note
