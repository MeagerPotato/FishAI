import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from './useMediaQuery.ts'

const DURATION_MS = 1100

/**
 * Counts an integer up to `target` once `active` turns true.
 *
 * `easeOutCubic` rather than linear: a linear count reads like a loading
 * counter, an eased one reads like a value settling. Under reduced motion it
 * returns the final value immediately — a number that races is exactly the kind
 * of motion that setting exists to remove.
 */
export function useCountUp(target: number, active: boolean): number {
  const reduced = usePrefersReducedMotion()
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active) return

    let raf = 0
    if (reduced) {
      raf = requestAnimationFrame(() => {
        setValue(target)
      })
      return () => {
        cancelAnimationFrame(raf)
      }
    }

    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const u = Math.min(1, (now - start) / DURATION_MS)
      const eased = 1 - Math.pow(1 - u, 3)
      setValue(Math.round(target * eased))
      if (u < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
    }
  }, [active, target, reduced])

  return value
}
