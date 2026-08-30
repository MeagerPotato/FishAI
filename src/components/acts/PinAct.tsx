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
  /**
   * Extra scroll per beat after the first, in vh. Default 20.
   *
   * It was 55, then 30, and it is 20 for the same reason both times: this
   * number buys nothing but distance. The figure does not move during an act
   * and the beats do not get longer — the only thing a bigger value changes is
   * how far a reader scrolls to read the same four sentences beside the same
   * static diagram. At 55 a four-beat act was 265vh, about 2,400px on a laptop;
   * at 20 it is 160vh, and 20vh is still a deliberate flick per beat rather
   * than a scroll that skips one.
   *
   * The floor is set by the beat rail, not by taste: below roughly 15vh two
   * beats can advance inside one wheel gesture, which is the thing the act
   * exists to prevent.
   */
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
export function PinAct({ steps, stepVh = 20, badge, children, className }: PinActProps) {
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
