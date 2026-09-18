/**
 * The shell EVERY route on this site sits in: one `SheetRoot`, the nav, the footer, and the skip
 * link. Not "every lab route" — every route, `/design` included. A page that builds its own nav
 * builds a second site, which is exactly what `/design` had done and what a reader arriving there
 * had to escape from.
 *
 * `SiteNav` navigates with plain anchors, which is deliberate rather than an oversight to route
 * around: the routes are separate documents in every sense a reader cares about, and a full
 * navigation guarantees the lazily-loaded chunk boundary is real. In-page drill-downs use router
 * `Link`s, where preserving scroll and state does matter.
 */

import type { ReactNode } from 'react'
import { SheetRoot, SiteFooter, SiteNav, useDocumentTitle } from '../../components/index.ts'
// TYPE-ONLY, and it must stay that way. A value import from `../artifact.ts` here statically
// pulls the committed results artifact into the chunk every single route loads — see the note in
// `./replayHref.ts`, which is where the one function that needs the artifact now lives.
import type { ArtifactCase } from '../artifact.ts'

/**
 * `?case=` is carried across routes so a reader stays in the case they opened. `v2` — the
 * current measured run — is the default everywhere a case is resolved, so it alone travels
 * without a parameter.
 */
export function withCase(href: string, which: ArtifactCase): string {
  return which === 'v2' ? href : `${href}?case=${which}`
}

export interface LabShellProps {
  children: ReactNode
  /** `href` of the current route, for the nav's active dot. */
  current: string
  /**
   * `document.title` for this route, without the ` — FishAI` suffix. Required
   * rather than defaulted: this is a client-routed site served from one
   * `index.html`, so without it every route carries whatever that one static
   * title says — in the tab, in history, in a bookmark, and in the title a
   * screen reader reads out on navigation (WCAG 2.4.2).
   */
  docTitle: string
  /** `dots` for the dense routes — a rule every 5px fights a table row. */
  ground?: 'ruling' | 'dots'
  /** Stamped into the footer's right-hand slot, so provenance closes every page. */
  stamp: string
  which: ArtifactCase
}

/**
 * Which of the three nav entries owns a route.
 *
 * The nav marks a SECTION, not a page. `/lab/bounded` and `/lab/matrix` are evidence *inside*
 * Research, and a reader six thousand pixels into one should still be told which part of the
 * site they are in. `/design` belongs to no section — it is a footer link — so it marks nothing
 * rather than borrowing Research's dot and claiming to be something it is not.
 */
function navSection(current: string, which: ArtifactCase): string | undefined {
  if (current.startsWith('/play')) return '/play'
  if (current.startsWith('/papers')) return '/papers'
  if (current.startsWith('/lab')) return withCase('/lab', which)
  return undefined
}

export function LabShell({
  children,
  current,
  docTitle,
  ground = 'ruling',
  stamp,
  which,
}: LabShellProps) {
  useDocumentTitle(docTitle)
  /** Three entries: play the game, read the evidence, read the papers. */
  const links = [
    { href: '/play', label: 'Play' },
    { href: withCase('/lab', which), label: 'Research' },
    { href: '/papers', label: 'Papers' },
  ]

  return (
    <SheetRoot ground={ground}>
      <a className="fa-skip" href="#main">
        Skip to content
      </a>

      <SiteNav
        links={links}
        current={navSection(current, which)}
        standfirst="us54 · deterministic"
        brandHref="/lab"
      />

      <main id="main">{children}</main>

      <SiteFooter
        columns={[
          {
            title: 'Research',
            items: [
              { href: withCase('/lab', which), label: 'Style report' },
              { href: withCase('/lab/matrix', which), label: 'Full matrix' },
              { href: withCase('/lab/adaptive', which), label: 'Adaptive' },
              { href: withCase('/lab/bounded', which), label: 'Bounded memory' },
              { href: withCase('/lab/live', which), label: 'Live simulator' },
            ],
          },
          {
            title: 'Play',
            items: [
              { href: '/play', label: 'Lobby' },
              { href: '/play/table', label: 'Solo table' },
            ],
          },
          {
            title: 'Reference',
            items: [
              { href: '/papers', label: 'Papers' },
              { href: 'https://github.com/MeagerPotato/FishAI', label: 'Repository' },
            ],
          },
        ]}
        legal="© 2026 FishAI — MIT licensed"
        stamp={stamp}
      />
    </SheetRoot>
  )
}
