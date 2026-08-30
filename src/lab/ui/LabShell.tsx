/**
 * The shell every lab route sits in: one `SheetRoot`, the nav, the footer, and the skip link.
 *
 * `SiteNav` navigates with plain anchors, which is deliberate rather than an oversight to route
 * around: the three lab routes are separate documents in every sense a reader cares about, and a
 * full navigation guarantees the lazily-loaded chunk boundary is real. In-page drill-downs use
 * router `Link`s, where preserving scroll and state does matter.
 */

import type { ReactNode } from 'react'
import { SheetRoot, SiteFooter, SiteNav, useDocumentTitle } from '../../components/index.ts'
import { loadArtifact, type ArtifactCase } from '../artifact.ts'
import { RULES_FILE } from '../rules.ts'

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
 * `?case=` is carried across routes so a reader stays in the case they opened. `v2` — the
 * current measured run — is the default everywhere a case is resolved, so it alone travels
 * without a parameter.
 */
export function withCase(href: string, which: ArtifactCase): string {
  return which === 'v2' ? href : `${href}?case=${which}`
}

/**
 * The nav's replay link, resolved against the case actually loaded: the stored replays are part
 * of each artifact, and the ids differ between the measured runs and the synthetic fixture. A
 * hard-coded id would 404 the nav the moment the default case changed — which is exactly how
 * this helper came to exist.
 */
export function replayHref(which: ArtifactCase): string {
  const loaded = loadArtifact(which)
  const id = loaded.ok ? loaded.artifact.replays[0]?.id : undefined
  return id === undefined ? withCase('/lab', which) : withCase(`/lab/replay/${id}`, which)
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
  // NINE links, since Papers joined — and the 1080px collapse in SiteNav.module.css (with the
  // matching matchMedia in SiteNav.tsx) did NOT have to move for it. Measured in the browser at
  // General Sans 500/16px: the nine labels and their gaps occupy 636px, the whole bar needs
  // ~823px, and at 1081px the gutters leave 979px. The row hard-wraps only around 860px.
  //
  // Papers sits between the evidence pages and the table on purpose: the reading order of this
  // site is measure it, write it up, then play it.
  const links = [
    { href: withCase('/lab', which), label: 'Report' },
    { href: withCase('/lab/matrix', which), label: 'Matrix' },
    { href: replayHref(which), label: 'Replay' },
    { href: withCase('/lab/adaptive', which), label: 'Adaptive' },
    { href: withCase('/lab/bounded', which), label: 'Bounded' },
    { href: withCase('/lab/live', which), label: 'Live' },
    { href: '/papers', label: 'Papers' },
    { href: '/play', label: 'Play' },
    { href: '/design', label: 'Design' },
  ]

  return (
    <SheetRoot ground={ground}>
      <a className="fa-skip" href="#main">
        Skip to content
      </a>

      <SiteNav links={links} current={current} standfirst="us54 · deterministic" brandHref="/lab" />

      <main id="main">{children}</main>

      <SiteFooter
        standfirst="A bot that plays Canadian Fish, and the lab that measures whether any play style is actually superior."
        columns={[
          {
            title: 'Report',
            items: [
              { href: withCase('/lab', which), label: 'The report' },
              { href: withCase('/lab/matrix', which), label: 'Full matrix' },
              { href: replayHref(which), label: 'Replay a game' },
              { href: withCase('/lab/adaptive', which), label: 'Adaptive engine' },
              { href: withCase('/lab/bounded', which), label: 'Bounded memory' },
              { href: withCase('/lab/live', which), label: 'Live simulator' },
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
              { href: '/design', label: 'Design specimen' },
              { href: 'https://github.com/MeagerPotato/FishAI', label: 'Repository' },
            ],
          },
          {
            title: 'Rule set',
            items: [
              { href: withCase('/lab', which) + '#rules', label: RULES_FILE },
              { href: withCase('/lab', which) + '#method', label: 'Method' },
            ],
          },
        ]}
        legal="© 2026 FishAI — MIT licensed"
        stamp={stamp}
      />
    </SheetRoot>
  )
}
