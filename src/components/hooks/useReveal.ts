import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'

function inViewport(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.top < window.innerHeight && r.bottom > 0 && r.width > 0
}

/**
 * The reveal primitive.
 *
 * An IntersectionObserver that LATCHES: once an element has been seen it stays
 * revealed forever. Scrolling back up must not re-hide content — a reveal is
 * an entrance, not a state.
 *
 * The `check()` fallback is the part that is easy to leave out and expensive to
 * omit. An observer created for an element that is already on screen at mount
 * usually fires, but not on every path (restored scroll position, a background
 * tab that never composited, a threshold the element cannot satisfy because it
 * is taller than the viewport). The rect test catches all of those, and the
 * paired rAF + 260ms timeout covers the case where layout is not settled on the
 * very first frame.
 *
 * @param threshold fraction of the element that must be visible. 0.16 for prose
 *   and cards; raise it (0.3) for something that should not start until it is
 *   properly in frame, like a chart.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.16,
): readonly [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || shown) return

    let raf = 0
    let timer = 0
    const fire = () => {
      setShown(true)
    }
    const check = () => {
      if (!inViewport(el)) return
      raf = requestAnimationFrame(fire)
      timer = window.setTimeout(fire, 260)
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) fire()
        }
      },
      { threshold },
    )
    io.observe(el)
    check()

    const onVisibility = () => {
      if (!document.hidden) check()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [shown, threshold])

  return [ref, shown] as const
}
