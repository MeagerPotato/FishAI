import { useCallback, useEffect, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'fa-theme'
const listeners = new Set<() => void>()
let cached: Theme | null = null

function readStored(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    // Private mode / storage disabled. Light is the documented default.
    return 'light'
  }
}

export function getTheme(): Theme {
  cached ??= readStored()
  return cached
}

/** Pre-hydration answer. Light is the default for a first-time visitor. */
export function getServerTheme(): Theme {
  return 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

export function setTheme(next: Theme): void {
  cached = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Nothing to do — the choice just will not survive a reload.
  }
  applyTheme(next)
  for (const listener of listeners) listener()
}

export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/**
 * Theme is an EXPLICIT choice, stored under `fa-theme` and written to
 * `data-theme` on <html>. There is no `prefers-color-scheme` fallback: paper is
 * the intended reading surface for this system, and a dark-by-default visitor
 * would never see the sheet the whole layout is built around.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark')
  }, [])

  return { theme, toggle }
}
