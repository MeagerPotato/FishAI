import type { ReactNode } from 'react'
import { useRef } from 'react'
import { useMediaQuery, usePrefersReducedMotion } from '../hooks/useMediaQuery.ts'
import { useStepProgress } from '../hooks/useStepProgress.ts'
import { cx } from '../lib/cx.ts'
import { CropMarks } from '../primitives/Hairline.tsx'
import { Wrap } from '../layout/Wrap.tsx'
import s from './PinAct.module.css'

export interface PinActProps {
  /**
   * How many beats the act has. The track's height is
   * `100vh + (steps - 1) * stepVh`, so this is the one number that decides how
   * much of the reader's scroll the act spends. Budget it: two acts at four
   * steps each is roughly half a long page.
   */
  steps: number
  stepVh?: number
  badge?: string
  /**
   * Receives 0..1 while the act is running, or `null` when it is switched off —
   * short viewport, or reduced motion. `null` means "render the finished
   * state", which is not the same as 1 and must be handled explicitly.
   */
  children: (progress: number | null) => ReactNode
  className?: string
}

/**
 * A sticky-pin scroll act. Nothing in here is bespoke to a particular
 * visualisation: it owns the track, the pin, the crop marks and the fallback,
 * and hands the scrub position to whatever is being scrubbed.
 */
export function PinAct({ steps, stepVh = 55, badge, children, className }: PinActProps) {
  const trackRef = useRef<HTMLElement | null>(null)
  const reduced = usePrefersReducedMotion()

  // A viewport shorter than 620px cannot pin anything usefully — the pinned
  // content would be taller than the space it is pinned into.
  const tallEnough = useMediaQuery('(min-height: 620px)')
  const enabled = tallEnough && !reduced

  const progress = useStepProgress(trackRef, { steps, stepVh, enabled })

  return (
    <section ref={trackRef} className={cx(s.track, !enabled && s.flat, className)}>
      <div className={s.pin}>
        <CropMarks badge={badge} />
        <Wrap className={s.body}>{children(progress)}</Wrap>
      </div>
    </section>
  )
}

export const pinHead = s.head
export const pinHeadAside = s.headAside
