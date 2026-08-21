import type { ElementType, ReactNode } from 'react'
import { createElement } from 'react'
import { cx } from '../lib/cx.ts'
import s from './primitives.module.css'

export type EyebrowTone = 'muted' | 'accent' | 'body'
export type EyebrowTrack = 'tight' | 'name' | 'legal' | 'badge' | 'head'

export interface EyebrowProps {
  children: ReactNode
  /**
   * `muted` for a passive serial or column head, `accent` when the label marks
   * an ACTIVE or focal item, `body` for a name beside body copy. Tone is a
   * role, not a preference — an amber label always means "this one".
   */
  tone?: EyebrowTone
  /** Tracking by role: 0.10em on a card role line up to 0.18em on a column head. */
  track?: EyebrowTrack
  strong?: boolean
  as?: ElementType
  className?: string
}

/**
 * The micro-label. 10.5px, uppercase, tracked out — the system's second voice,
 * made by shrinking the one typeface rather than adding a monospace family.
 */
export function Eyebrow({
  children,
  tone = 'muted',
  track = 'legal',
  strong = false,
  as = 'span',
  className,
}: EyebrowProps) {
  const toneClass =
    tone === 'accent' ? s.toneAccent : tone === 'body' ? s.toneBody : s.toneMuted
  const trackClass = {
    tight: s.trackTight,
    name: s.trackName,
    legal: s.trackLegal,
    badge: s.trackBadge,
    head: s.trackHead,
  }[track]

  return createElement(
    as,
    {
      className: cx(s.eyebrow, toneClass, trackClass, strong && s.eyebrowStrong, className),
    },
    children,
  )
}
