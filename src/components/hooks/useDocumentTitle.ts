import { useEffect } from 'react'

const SUFFIX = 'FishAI'

/**
 * Sets `document.title` for the route that is mounted.
 *
 * `index.html` can only carry one title, and this is a client-routed site: without
 * this hook every route — report, matrix, replay, specimen — announces itself as
 * whatever that one static title says, in the tab, in the history, in the
 * bookmark, and to a screen reader that reads the title on navigation. WCAG 2.4.2
 * asks for a title that describes the page; four pages sharing one is four pages
 * with a wrong title, not one page with a right one.
 *
 * Restores nothing on unmount on purpose: the next route sets its own, and
 * restoring in between would flash the previous page's name.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} — ${SUFFIX}` : SUFFIX
  }, [title])
}
