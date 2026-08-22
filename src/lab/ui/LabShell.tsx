/**
 * The shell every lab route sits in: one `SheetRoot`, the nav, the footer, and the skip link.
 *
 * `SiteNav` navigates with plain anchors, which is deliberate rather than an oversight to route
 * around: the three lab routes are separate documents in every sense a reader cares about, and a
 * full navigation guarantees the lazily-loaded chunk boundary is real. In-page drill-downs use
 * router `Link`s, where preserving scroll and state does matter.
 */

import type { ReactNode } from 'react'
import { SheetRoot, SiteFooter, SiteNav } from '../../components/index.ts'
import type { ArtifactCase } from '../artifact.ts'
import { RULES_FILE } from '../rules.ts'

export interface LabShellProps {
  children: ReactNode
  /** `href` of the current route, for the nav's active dot. */
  current: string
  /** `dots` for the dense routes — a rule every 5px fights a table row. */
  ground?: 'ruling' | 'dots'
  /** Stamped into the footer's right-hand slot, so provenance closes every page. */
  stamp: string
  which: ArtifactCase
}

/** `?case=` is carried across routes so a reader stays in the fixture they opened. */
export function withCase(href: string, which: ArtifactCase): string {
  return which === 'cyclic' ? href : `${href}?case=${which}`
}

export function LabShell({ children, current, ground = 'ruling', stamp, which }: LabShellProps) {
  const links = [
    { href: withCase('/lab', which), label: 'Report' },
    { href: withCase('/lab/matrix', which), label: 'Matrix' },
    { href: withCase('/lab/replay/blitz-vs-banker', which), label: 'Replay' },
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
              { href: withCase('/lab/replay/blitz-vs-banker', which), label: 'Replay a game' },
            ],
          },
          {
            title: 'Reference',
            items: [
              { href: '/design', label: 'Design specimen' },
              { href: 'https://github.com/MeagerPotato', label: 'Repository' },
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
