import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'

/**
 * Is this element actually scrolling horizontally right now?
 *
 * The reason this is a hook rather than a constant `tabIndex={0}`: a container
 * that scrolls is operable by mouse and touch but NOT by keyboard unless it is
 * focusable (WCAG 2.1.1 — the failure axe reports as
 * `scrollable-region-focusable`). Every wide table and every diagram frame on
 * this site scrolls at 375px, and at 1280px most of them do not. Hard-coding
 * the tab stop would fix the phone and put ten dead stops in the desktop tab
 * order; hard-coding its absence loses the content on the phone. So it is
 * measured, and re-measured whenever the box or its contents change.
 *
 * Returns `0` or `undefined` so the result drops straight into `tabIndex`.
 */
export function useScrollable(ref: RefObject<HTMLElement | null>): 0 | undefined {
  const [scrollable, setScrollable] = useState(false)
  // Read in a ref too, so the observer callback can skip identical updates
  // without re-subscribing on every state change.
  const last = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const read = () => {
      const next = el.scrollWidth > el.clientWidth + 1
      if (next === last.current) return
      last.current = next
      setScrollable(next)
    }

    read()

    // The box changes on viewport resize; the CONTENT changes when a font
    // swaps in or a `<details>` opens. One observer on each covers both.
    const ro = new ResizeObserver(read)
    ro.observe(el)
    for (const child of el.children) ro.observe(child)

    return () => {
      ro.disconnect()
    }
  }, [ref])

  return scrollable ? 0 : undefined
}
