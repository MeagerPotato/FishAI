import type { RefObject } from 'react'
import { useEffect, useState } from 'react'

export interface StepProgressOptions {
  /** How many discrete beats the act has. Track length scales with this. */
  steps: number
  /** Extra scroll length per beat after the first, in vh. */
  stepVh?: number
  /** When false the act does not run and the hook returns `null`. */
  enabled?: boolean
}

/**
 * Drives a sticky-pin scroll act.
 *
 * The technique, in one sentence: a tall TRACK element scrolls normally while
 * the PIN inside it is `position: sticky`, and the track's own
 * `getBoundingClientRect().top` is the scrub position. No scroll hijacking, no
 * wheel handlers, no animation library — the browser keeps doing exactly what
 * it already does, and this hook only reads the result.
 *
 * The track's height IS the scrub length, which is why it is set here rather
 * than in CSS: it depends on `steps`, and a value that lies about the number of
 * beats produces an act that finishes early or never finishes at all.
 *
 * Returns 0..1 while enabled, or `null` when the act is switched off — a
 * distinct value, not 1, so a consumer can tell "act complete" from "no act"
 * and render its static full-on fallback.
 */
export function useStepProgress(
  trackRef: RefObject<HTMLElement | null>,
  { steps, stepVh = 55, enabled = true }: StepProgressOptions,
): number | null {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const el = trackRef.current
    if (!el) return

    if (!enabled) {
      el.style.height = 'auto'
      return
    }

    el.style.height = `calc(100vh + ${(steps - 1) * stepVh}vh)`

    let raf = 0
    const read = () => {
      raf = 0
      const rect = el.getBoundingClientRect()
      const scrubbable = rect.height - window.innerHeight
      if (scrubbable <= 0) return
      setProgress(Math.min(1, Math.max(0, -rect.top / scrubbable)))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }

    // Deferred rather than immediate so the first read happens after layout,
    // and so no state is set synchronously inside the effect body.
    onScroll()

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
      el.style.height = ''
    }
  }, [trackRef, steps, stepVh, enabled])

  return enabled ? progress : null
}
