/**
 * `/lab` — the style report: the nine-style roster's payoff matrix, counter-graph and verdict, read
 * from one committed artifact, with the verdict re-derived in the browser.
 *
 * Titles, figures and tables only. On the owner's direction of 2026-09-18 the explanations live in
 * the papers (/papers), and the site keeps the results.
 *
 * ## The accent budget (SITE_SPEC.md §2.1)
 *
 * Accent TEXT is spent on three things: the verdict chip on the ink panel, the one focal cell of
 * the payoff matrix, and the highlighted cycle of the counter-graph (or the dominant node when
 * there is no cycle). Every `Button` here is `ghost` or `line`, so no amber fill appears in the
 * page chrome.
 *
 * The counter-graph is drawn from `matrix[].significant` — post-Benjamini-Hochberg — never from a
 * raw p-value.
 */

import { useLocation } from 'react-router-dom'
import {
  Board,
  Button,
  InkPanel,
  MaskedLines,
  Section,
  SectionHead,
  buttonRow,
  inkPanelBody,
} from '../components/index.ts'
import {
  BarChart,
  CounterGraph,
  DeckAssembly,
  DumbbellChart,
  LineChart,
  PayoffMatrix,
  claimPrecisionDumbbell,
  concedeRateBar,
  degradationLine,
} from '../diagrams/index.ts'
import { caseFromSearch, styleLabel } from '../lab/artifact.ts'
import { count, interval, rate } from '../lab/format.ts'
import { labModel } from '../lab/model.ts'
import { shortHash } from '../lab/rules.ts'
import { LabContents, type LabSection } from '../lab/ui/LabContents.tsx'
import { LabShell, withCase } from '../lab/ui/LabShell.tsx'
import { replayHref } from '../lab/ui/replayHref.ts'
import { ArtifactBroken, RulesMismatch } from '../lab/ui/Refusal.tsx'
import { RuleStamp, SyntheticNotice } from '../lab/ui/RuleStamp.tsx'
import { ScrollRegion } from '../lab/ui/ScrollRegion.tsx'
import { VerdictBody } from '../lab/ui/Verdict.tsx'
import s from '../lab/ui/lab.module.css'

/** The contents of this page, in document order. Every `id` is a real element below. */
const CONTENTS: readonly LabSection[] = [
  { id: 'rules', label: 'Rule set' },
  { id: 'roster', label: 'Roster' },
  { id: 'matrix', label: 'Payoff matrix' },
  { id: 'counter-graph', label: 'Counter-graph' },
  { id: 'verdict', label: 'Verdict' },
  { id: 'exploitability', label: 'Exploitability' },
]

/**
 * Family -> display label. A `Map`, not an object literal: `family` is a value out of the results
 * document, and `{...}[family]` walks `Object.prototype` (`"constructor"` would render a function).
 */
const FAMILY_LABEL = new Map<string, string>([
  ['control', 'Control'],
  ['aggressive', 'Aggressive'],
  ['conservative', 'Conservative'],
  ['passive', 'Passive'],
  ['information', 'Information'],
  ['optionality', 'Optionality'],
])

export function LabReport() {
  const { search } = useLocation()
  const which = caseFromSearch(search)
  const model = labModel(which)

  if (!model.ok) {
    return <ArtifactBroken which={which} current="/lab" file={model.file} detail={model.detail} />
  }
  // SITE_SPEC.md §1.1 — refuse before rendering a single number.
  if (!model.check.ok) return <RulesMismatch which={which} current="/lab" check={model.check} />

  const { artifact, results, derived, check } = model
  const { meta } = artifact
  const exploit = [...artifact.exploitability].sort((a, b) => a.gap - b.gap)
  const maximinOf = new Map(derived.maximin.map((m) => [m.style, m]))

  return (
    <LabShell
      current={withCase('/lab', which)}
      docTitle="The style report"
      which={which}
      stamp={`us54 · rulesHash ${shortHash(meta.rulesHash)}`}
    >
      <Section noRule noMarks>
        <MaskedLines level="h1" lines={['The style report', `*${artifact.styles.length} styles, one engine*`]} />
        <div className={buttonRow} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Button href="#verdict" variant="line">
            Verdict: {derived.verdict}
          </Button>
          <Button href={withCase('/lab/matrix', which)} variant="ghost">
            Full matrix
          </Button>
          <Button href={withCase('/lab/adaptive', which)} variant="ghost">
            Adaptive
          </Button>
          <Button href={withCase('/lab/bounded', which)} variant="ghost">
            Bounded
          </Button>
          <Button href={replayHref(which)} variant="ghost">
            Replay
          </Button>
          <Button href={withCase('/lab/live', which)} variant="ghost">
            Live
          </Button>
          <Button href="/papers" variant="ghost">
            Papers
          </Button>
        </div>
        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <RuleStamp artifact={artifact} check={check} />
          <SyntheticNotice artifact={artifact} />
        </div>
        <LabContents sections={CONTENTS} />
      </Section>

      <Section id="rules" badge="Rule set">
        <SectionHead lines={['us54: 54 cards,', '*nine sets of six*']} />
        <DeckAssembly figNo="FIG. 01" />
      </Section>

      <Section id="roster" badge="Roster">
        <SectionHead lines={[`${artifact.styles.length} styles`]} />
        <Board
          items={artifact.styles.map((style, i) => ({
            ix: `S${i + 1}`,
            title: style.label,
            role: FAMILY_LABEL.get(style.family) ?? style.family,
            body: style.thesis.replace(/\.*$/, '.'),
          }))}
        />
        <div className={s.stackWide} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <BarChart model={concedeRateBar(results, 'FIG. 02')} />
          <DumbbellChart model={claimPrecisionDumbbell(results, 'FIG. 03')} />
        </div>
      </Section>

      <Section id="matrix" badge="Payoff matrix">
        <SectionHead
          lines={['Payoff matrix']}
          sub={`${derived.significantCells} of ${derived.cells} cells significant after BH`}
        />
        <PayoffMatrix results={results} figNo="FIG. 04" />
      </Section>

      <Section id="counter-graph" badge="Counter-graph">
        <SectionHead lines={['Counter-graph']} sub={`${derived.edges.length} significant edges`} />
        <CounterGraph results={results} figNo="FIG. 05" />
      </Section>

      <Section id="verdict" noMarks>
        <InkPanel fig="FIG. 06 — The verdict" live={`VERDICT · ${derived.verdict.toUpperCase()}`}>
          <div className={inkPanelBody} style={{ display: 'block' }}>
            <VerdictBody derived={derived} />
          </div>
        </InkPanel>
      </Section>

      <Section id="exploitability" badge="Exploitability">
        <SectionHead lines={['Exploitability']} />
        {exploit.length === 0 ? (
          <p className={s.prose}>Not measured in this artifact.</p>
        ) : (
          <ScrollRegion label="Exploitability per style">
            <table className={s.table}>
              <caption>
                {count(exploit[0]?.evalGames ?? 0)} fresh games an evaluation · search{' '}
                {count(exploit[0]?.searchGames ?? 0)} games
              </caption>
              <thead>
                <tr>
                  <th scope="col">Style</th>
                  <th scope="col">E(i)</th>
                  <th scope="col">Best response</th>
                  <th scope="col">CI 95%</th>
                  <th scope="col">Search score</th>
                  <th scope="col">Detectable δ</th>
                  <th scope="col">Maximin</th>
                  <th scope="col">Worst matchup</th>
                </tr>
              </thead>
              <tbody>
                {exploit.map((e) => {
                  const mm = maximinOf.get(e.style)
                  return (
                    <tr key={e.style}>
                      <th scope="row">{styleLabel(artifact, e.style)}</th>
                      <td>{rate(e.gap)}</td>
                      <td>{rate(e.score)}</td>
                      <td>{interval(e.ci95)}</td>
                      <td className={s.ns}>{rate(e.searchScore)}</td>
                      <td className={s.ns}>{rate(e.detectableDelta)}</td>
                      <td>{mm ? rate(mm.value) : '—'}</td>
                      <td>{mm ? styleLabel(artifact, mm.worstVs) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollRegion>
        )}
        <div className={s.stackWide} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <LineChart model={degradationLine(results, 'FIG. 07')} />
        </div>
        {artifact.crossplay.length === 0 ? null : (
          <ScrollRegion label="Cross-play cells against foreign bots">
            <table className={s.table}>
              <caption>Cross-play</caption>
              <thead>
                <tr>
                  <th scope="col">Our style</th>
                  <th scope="col">Foreign bot</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Duplicate pairs</th>
                  <th scope="col">Our score rate</th>
                  <th scope="col">Our CI 95%</th>
                  <th scope="col">Seed set</th>
                  <th scope="col">rulesHash agreed</th>
                </tr>
              </thead>
              <tbody>
                {artifact.crossplay.map((row) => (
                  <tr key={`${row.us}-${row.them}-${row.mode}`}>
                    <th scope="row">{styleLabel(artifact, row.us)}</th>
                    <td>{row.them}</td>
                    <td>{row.mode}</td>
                    <td>{count(row.pairs)}</td>
                    <td>{rate(row.usScore)}</td>
                    <td>{interval(row.ci95)}</td>
                    <td>{row.seedSet}</td>
                    <td className={s.ns}>{shortHash(row.rulesHashAgreed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
      </Section>
    </LabShell>
  )
}

export default LabReport
