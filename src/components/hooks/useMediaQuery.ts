import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribe to a media query.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the first paint
 * already has the right answer, so a pinned act never mounts in the wrong mode
 * and then snaps.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => {
        mq.removeEventListener('change', onChange)
      }
    },
    [query],
  )

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  // Server / pre-hydration answer. `false` is the conservative default for
  // every query this system asks: no reduced motion, no tall viewport.
  const getServerSnapshot = useCallback(() => false, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * The one query the motion system branches on. Every scroll act must consult
 * this in JS, not only in CSS — a CSS `transition-duration: 0.01ms` does
 * nothing to a scroll-position-driven transform.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
