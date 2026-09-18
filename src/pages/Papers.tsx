/**
 * `/papers` — the index of the papers: each entry is its title, the PDF built from the committed
 * `.tex` by `npm run papers:build`, and the LaTeX source on GitHub.
 *
 * Adding a paper is one object in `PAPERS`: a `kind` starting `System` files it under the series,
 * anything else under the focused results.
 *
 * ## The PDF sizes
 *
 * Page counts and byte sizes come from `papers-manifest.json`, which `scripts/build-papers.mjs`
 * rewrites on every full build. They are read defensively: a missing or malformed entry drops
 * the annotation rather than printing a stale number or breaking the page.
 */

import { useLocation } from 'react-router-dom'
import { Eyebrow, Section, SectionHead } from '../components/index.ts'
import { caseFromSearch } from '../lab/case.ts'
import { LabContents, type LabSection } from '../lab/ui/LabContents.tsx'
import { LabShell } from '../lab/ui/LabShell.tsx'
import manifestRaw from './papers-manifest.json?raw'
import p from './Papers.module.css'

/**
 * Every id below exists on a `<Section>` further down; the component asserts nothing, so a
 * renamed section would silently break the jump — keep the two in step.
 */
const CONTENTS: readonly LabSection[] = [
  { id: 'series', label: 'System papers' },
  { id: 'results', label: 'Focused results' },
]

const REPO = 'https://github.com/MeagerPotato/FishAI'
const SOURCE_BASE = `${REPO}/blob/main/papers`

/* ---- the generated manifest ---------------------------------------------------------------- */

interface PdfStat {
  pages: number
  bytes: number
}

/**
 * Read the build manifest without trusting it. It is generated, but it is also *committed*, so
 * it can be edited by hand, be left behind by a partial build, or arrive from a merge. Anything
 * that does not parse into `{ pages, bytes }` positive integers is dropped, and the link then
 * renders without its annotation — a link that says less, never a link that lies.
 */
function readStats(raw: string): Record<string, PdfStat> {
  const out: Record<string, PdfStat> = {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return out
  }
  if (typeof parsed !== 'object' || parsed === null) return out
  const papers = (parsed as { papers?: unknown }).papers
  if (typeof papers !== 'object' || papers === null) return out
  for (const [slug, value] of Object.entries(papers as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue
    const { pages, bytes } = value as { pages?: unknown; bytes?: unknown }
    if (typeof pages !== 'number' || typeof bytes !== 'number') continue
    if (!Number.isInteger(pages) || !Number.isInteger(bytes) || pages <= 0 || bytes <= 0) continue
    out[slug] = { pages, bytes }
  }
  return out
}

const PDF_STATS = readStats(manifestRaw)

/** `PDF · 18 pages · 421 KB`, or plain `PDF` when the manifest has nothing to say. */
function pdfNote(slug: string): string {
  const stat = PDF_STATS[slug]
  if (!stat) return 'PDF'
  return `PDF · ${stat.pages} pages · ${Math.round(stat.bytes / 1024)} KB`
}

/* ---- the papers ---------------------------------------------------------------------------- */

interface Paper {
  /** The `.tex` basename, which is also the PDF name and the anchor id. */
  slug: string
  serial: string
  /** `System paper · v0.5` / `Focused result` — what kind of document this is. */
  kind: string
  title: string
}

const PAPERS: Paper[] = [
  {
    slug: 'fishai-v05',
    serial: '01',
    kind: 'System paper · v0.5',
    title: 'FishAI v0.5: Measuring Play Style Without Skill in a 54-Card Literature Variant',
  },
  {
    slug: 'fishai-v10',
    serial: '02',
    kind: 'System paper · v1.0',
    title: 'FishAI v1.0: When Best-Response Adaptation Is Worth Less Than Nothing',
  },
  {
    slug: 'fishai-v15',
    serial: '03',
    kind: 'System paper · v1.5',
    title: 'FishAI v1.5: A Bit-Budget Memory Ladder as an Honest Difficulty Axis',
  },
  {
    slug: 'fishai-v20',
    serial: '04',
    kind: 'System paper · v2.0',
    title: 'FishAI v2.0: The Three-Sided Ask — Refuting an Avoidance Rule and Shipping Its Inverse',
  },
  {
    slug: 'contained-book',
    serial: '05',
    kind: 'Focused result',
    title: 'The Contained Book: An Absorbing Resource Measured to Be Worth Nothing',
  },
  {
    slug: 'inert-axis',
    serial: '06',
    kind: 'Focused result',
    title: 'The Inert Axis: When a Style Parameter Is Wired, Swept, and Never Reached',
  },
  {
    slug: 'style-observability',
    serial: '07',
    kind: 'Focused result',
    title: 'What a Public Log Reveals: Observing Play Style in Literature (Canadian Fish)',
  },
  {
    slug: 'asking',
    serial: '08',
    kind: 'Focused result',
    title: 'Inference From a Miss: What Silence Licenses, and Two Corrections That Overlap',
  },
  {
    slug: 'detection-floor',
    serial: '09',
    kind: 'Focused result',
    title: 'The Detection Floor: What a Null Result Was Measured With',
  },
  {
    slug: 'frontier',
    serial: '10',
    kind: 'Cross-engine result',
    title: 'Against the Frontier: A Cross-Engine Measurement and the Bridge Defect That Nearly Buried It',
  },
  {
    slug: 'monet',
    serial: '11',
    kind: 'Cross-engine result',
    title: 'Toward the Frontier: Seventeen Measured Rungs Against a Frontier Canadian Fish Agent, and the Wall Where They Stopped',
  },
]

/* ---- rendering ----------------------------------------------------------------------------- */

function PaperEntry({ paper }: { paper: Paper }) {
  const titleId = `paper-${paper.slug}`
  const note = pdfNote(paper.slug)
  return (
    <article className={p.paper} aria-labelledby={titleId}>
      <div className={p.rail}>
        <Eyebrow tone="muted" track="badge">
          {paper.serial}
        </Eyebrow>
        <span className={p.railNote}>{paper.kind}</span>
      </div>

      <div className={p.body}>
        <h3 className={p.title} id={titleId}>
          {paper.title}
        </h3>

        {/*
          Each link's accessible name names the PAPER as well as the destination, because a
          screen reader's link list has no entry context: every entry's "Read the paper" and
          "LaTeX source" would otherwise be the same pair of names.
        */}
        <ul className={p.links}>
          <li>
            <a
              className={p.link}
              href={`/papers/${paper.slug}.pdf`}
              type="application/pdf"
              aria-label={`Read ${paper.title} — ${note}`}
            >
              Read the paper
              <span className={p.linkNote}>{note}</span>
            </a>
          </li>
          <li>
            <a
              className={p.link}
              href={`${SOURCE_BASE}/${paper.slug}.tex`}
              aria-label={`LaTeX source of ${paper.title} on GitHub`}
            >
              LaTeX source
            </a>
          </li>
        </ul>
      </div>
    </article>
  )
}

export function Papers() {
  const { search } = useLocation()
  const which = caseFromSearch(search)

  return (
    <LabShell
      current="/papers"
      docTitle="Research papers"
      which={which}
      stamp={`${PAPERS.length} papers · built from papers/*.tex`}
    >
      <Section noRule noMarks>
        <SectionHead level="h1" lines={['Research papers']} />
        <LabContents sections={CONTENTS} />
      </Section>

      <Section id="series" badge="Series">
        <SectionHead lines={['System papers']} />
        <div className={p.papers}>
          {PAPERS.filter((paper) => paper.kind.startsWith('System')).map((paper) => (
            <PaperEntry key={paper.slug} paper={paper} />
          ))}
        </div>
      </Section>

      <Section id="results" badge="Results">
        <SectionHead lines={['Focused results']} />
        <div className={p.papers}>
          {PAPERS.filter((paper) => !paper.kind.startsWith('System')).map((paper) => (
            <PaperEntry key={paper.slug} paper={paper} />
          ))}
        </div>
      </Section>
    </LabShell>
  )
}

export default Papers
