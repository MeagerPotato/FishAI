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
  /**
   * THREE links, down from nine.
   *
   * The nine were six lab surfaces plus Papers, Play and Design, and from their labels alone a
   * visitor could not tell Report from Matrix from Adaptive from Bounded — they read as
   * synonyms for "some numbers". They are not siblings and never were: five of them are the
   * evidence behind claims the report makes, so they belong *under* the report, indexed on
   * `/lab` where each one has room to say what it measures and what it found.
   *
   * What is left is the three things a visitor actually chooses between — play the game, read
   * the evidence, read the write-ups — and the row now fits far below the 1080px collapse in
   * SiteNav.module.css rather than pressing against it.
   */
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

      {/*
        The footer is where the lab surfaces the nav no longer carries stay one click from
        anywhere — a demoted link is not a deleted one, and every route below is still a live
        deep link somebody may have bookmarked.

        A replay is the one surface reached through the index rather than named here, because
        its URL contains an id that only the artifact knows. The evidence index resolves a real
        one from data `/lab` has already loaded; the footer would have to load it on every page.
      */}
      <SiteFooter
        standfirst="A bot that plays Canadian Fish, and the lab that measures whether any play style is actually superior."
        columns={[
          {
            title: 'Research',
            items: [
              { href: withCase('/lab', which), label: 'The style report' },
              { href: withCase('/lab/matrix', which), label: 'Full matrix' },
              { href: withCase('/lab/adaptive', which), label: 'Adaptive engine' },
              { href: withCase('/lab/bounded', which), label: 'Bounded memory' },
              { href: withCase('/lab/live', which), label: 'Live simulator' },
              { href: withCase('/lab', which) + '#evidence', label: 'The evidence index' },
            ],
          },
          {
            title: 'Play',
            items: [
              { href: '/play', label: 'The lobby' },
              { href: '/play/table', label: 'Solo table' },
            ],
          },
          {
            title: 'Reference',
            items: [
              { href: '/papers', label: 'Research papers' },
              { href: withCase('/lab', which) + '#rules', label: 'The us54 rule set' },
              { href: withCase('/lab', which) + '#method', label: 'Method' },
              { href: '/design', label: 'Design specimen' },
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
