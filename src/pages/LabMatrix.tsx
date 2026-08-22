/**
 * `/lab/matrix` — the drill-down. Dense data, no decoration.
 *
 * SITE_SPEC.md §1: *"Full N×N drill-down: every cell's CIs, sample size, BH q-value, and the
 * whole §4.2 diagnostic table for both sides."*
 *
 * Three deliberate absences. **No accent.** The report spends its three amber marks on the
 * verdict and the two headline figures; this page marks nothing, because on a page that is
 * entirely numbers an accent would be picking a winner by typography. **No selection state.**
 * The N×N grid is a grid of in-page anchors, so a cell is addressable by URL, survives a reload,
 * and works without the JavaScript that would otherwise be needed to remember which cell you
 * clicked. **No collapsing of the non-significant cells.** They are marked and kept; a matrix
 * that hides its failures reads tidier than the run was.
 *
 * The ink ramp behind a cell is redundant: the score rate is printed in every one of them.
 */

import { useLocation } from 'react-router-dom'
import { Eyebrow, Hairline, Section, SectionHead, TextLink } from '../components/index.ts'
import { cellIndex, scoreOf, type MatrixCell } from '../diagrams/index.ts'
import { caseFromSearch, styleLabel, type LabArtifact } from '../lab/artifact.ts'
import { count, interval, qValue, rate, rate3 } from '../lab/format.ts'
import { labModel } from '../lab/model.ts'
import { shortHash } from '../lab/rules.ts'
import { LabShell, withCase } from '../lab/ui/LabShell.tsx'
import { ArtifactBroken, RulesMismatch } from '../lab/ui/Refusal.tsx'
import { ScrollRegion } from '../lab/ui/ScrollRegion.tsx'
import { RuleStamp, SyntheticNotice, Us54Facts } from '../lab/ui/RuleStamp.tsx'
import { VerdictStrip } from '../lab/ui/Verdict.tsx'
import s from '../lab/ui/lab.module.css'

/** BOT_LAB.md §4.2, with the two `us54` additions. `voidRate` is absent, and cannot return. */
const DIAGNOSTICS: Array<{ key: keyof MatrixCell['metrics']['a']; label: string; note: string }> = [
  { key: 'askHitRate', label: 'Ask hit rate', note: 'hits ÷ asks — the tempo engine' },
  { key: 'turnRetention', label: 'Turn retention', note: 'mean consecutive asks per turn gained' },
  { key: 'claimPrecision', label: 'Claim precision', note: 'correct declares ÷ declares attempted' },
  { key: 'claimYield', label: 'Claim yield', note: 'sets scored ÷ declares attempted' },
  {
    key: 'concedeRate',
    label: 'Concede rate',
    note: 'declares that handed the set to the opposition — replaces the abolished void rate',
  },
  {
    key: 'foreignDeclareRate',
    label: 'Foreign declare rate',
    note: 'us54 row 15 — declares for sets the declarer held no card of',
  },
  {
    key: 'declareLatency',
    label: 'Declare latency',
    note: 'window-cycles between the set becoming team-held and the declare',
  },
  { key: 'leakIndex', label: 'Leak index', note: 'asks into sets the team already accounts for' },
  { key: 'hoardIndex', label: 'Hoard index', note: 'mean distinct sets the seat holds ≥ 1 card of' },
  { key: 'avgMoves', label: 'Average moves', note: 'game length — the passive-deadlock guard' },
]

/** Four steps, floor to ceiling. The printed number is the reading; this is only the texture. */
function level(score: number): string {
  if (score >= 0.55) return s.lvl1
  if (score >= 0.51) return s.lvl2
  if (score >= 0.49) return s.lvl3
  return s.lvl4
}

const anchorFor = (cell: MatrixCell): string => `cell-${cell.a}-${cell.b}`

function DiagnosticTable({ artifact, cell }: { artifact: LabArtifact; cell: MatrixCell }) {
  return (
    <ScrollRegion
      label={`§4.2 diagnostics — ${styleLabel(artifact, cell.a)} against ${styleLabel(artifact, cell.b)}`}
    >
      <table className={s.table}>
        <caption>
          §4.2 diagnostics, both sides · {count(cell.pairs)} duplicate pairs · {count(cell.games)}{' '}
          games
        </caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">{styleLabel(artifact, cell.a)}</th>
            <th scope="col">{styleLabel(artifact, cell.b)}</th>
            <th scope="col">Δ</th>
            <th scope="col">Definition</th>
          </tr>
        </thead>
        <tbody>
          {DIAGNOSTICS.map((metric) => {
            const a = cell.metrics.a[metric.key]
            const b = cell.metrics.b[metric.key]
            const delta = a - b
            return (
              <tr key={metric.key}>
                <th scope="row">{metric.label}</th>
                <td>{a.toFixed(2)}</td>
                <td>{b.toFixed(2)}</td>
                <td className={s.ns}>
                  {delta >= 0 ? '+' : '−'}
                  {Math.abs(delta).toFixed(2)}
                </td>
                <td style={{ textAlign: 'left', whiteSpace: 'normal' }} className={s.ns}>
                  {metric.note}
                </td>
              </tr>
            )
          })}
          <tr>
            <th scope="row">Ties</th>
            <td colSpan={4} style={{ textAlign: 'left', whiteSpace: 'normal' }} className={s.ns}>
              0, and structurally so — 9 sets and a clinch at 5 make a draw arithmetically
              impossible under us54. The field is retained only so the schema is stable across
              variants.
            </td>
          </tr>
        </tbody>
      </table>
    </ScrollRegion>
  )
}

export function LabMatrix() {
  const { search } = useLocation()
  const which = caseFromSearch(search)
  const model = labModel(which)

  if (!model.ok) {
    return (
      <ArtifactBroken which={which} current="/lab/matrix" file={model.file} detail={model.detail} />
    )
  }
  if (!model.check.ok) {
    return <RulesMismatch which={which} current="/lab/matrix" check={model.check} />
  }

  const { artifact, derived, check } = model
  const index = cellIndex(artifact.matrix)
  const ids = derived.meanScore.map((m) => m.style)
  const cells = [...artifact.matrix].sort((p, q) => q.aScore - p.aScore)

  return (
    <LabShell
      current={withCase('/lab/matrix', which)}
      docTitle="Full matrix"
      which={which}
      ground="dots"
      stamp={`us54 · rulesHash ${shortHash(artifact.meta.rulesHash)}`}
    >
      <Section noRule badge="Full matrix">
        <SectionHead
          level="h1"
          lines={['Every cell, every interval,', 'every *q-value*.']}
          sub={`${derived.cells} cells over ${artifact.styles.length} styles. ${derived.significantCells} survived Benjamini-Hochberg at α = ${artifact.meta.analysis.alpha}; the rest are kept and marked, because a matrix that hides what did not reach significance reads tidier than the run was.`}
        />
        <RuleStamp artifact={artifact} check={check} />
        <SyntheticNotice artifact={artifact} />
        <VerdictStrip derived={derived} />
      </Section>

      {/* ---- the N x N grid --------------------------------------------------------------- */}
      <Section badge="N × N">
        <Eyebrow tone="muted" track="head" as="h2">
          Score rate of row against column
        </Eyebrow>
        <p className={s.figNote} style={{ marginBottom: 20 }}>
          Rows and columns are ordered by mean score rate, highest first. Each cell is the row
          style&rsquo;s score rate against the column style, duplicate-averaged so a cell and its
          mirror sum to 1; below it, the q-value, with <code>ns</code> where the cell did not
          survive correction. Follow any cell to its full record. The table scrolls inside its own
          frame — the page never does.
        </p>
        <ScrollRegion label="Payoff matrix, row style against column style">
          <table className={`${s.table} ${s.grid}`}>
            <caption>
              Payoff matrix P[row][col] · N = {artifact.styles.length} · {count(artifact.meta.gamesTotal)}{' '}
              games total
            </caption>
            <thead>
              <tr>
                <th scope="col">Row \ Col</th>
                {ids.map((id) => (
                  <th key={id} scope="col">
                    {styleLabel(artifact, id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ids.map((row) => (
                <tr key={row}>
                  <th scope="row">{styleLabel(artifact, row)}</th>
                  {ids.map((col) => {
                    if (row === col) {
                      return (
                        <td key={col} className={s.diag} aria-label="diagonal, not played">
                          —
                        </td>
                      )
                    }
                    const found = scoreOf(index, row, col)
                    if (!found) {
                      return (
                        <td key={col} className={s.diag}>
                          n/a
                        </td>
                      )
                    }
                    return (
                      <td key={col} className={level(found.score)}>
                        <a
                          className={s.cell}
                          href={`#${anchorFor(found.cell)}`}
                          aria-label={`${styleLabel(artifact, row)} versus ${styleLabel(artifact, col)}, score rate ${rate(found.score)}, ${found.cell.significant ? 'significant' : 'not significant'} after correction`}
                        >
                          <span className={s.cellScore}>{rate(found.score)}</span>
                          <span className={s.cellSub}>
                            {found.cell.significant ? `q ${qValue(found.cell.qValue)}` : 'ns'}
                          </span>
                        </a>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Section>

      {/* ---- every cell, one row each ---------------------------------------------------- */}
      <Section badge="Every cell">
        <Eyebrow tone="muted" track="head" as="h2">
          The {derived.cells} stored cells
        </Eyebrow>
        <p className={s.figNote} style={{ marginBottom: 20 }}>
          One row per stored orientation; the mirror is the complement by construction. Sorted by
          score rate, descending.
        </p>
        <ScrollRegion label="Every stored cell: score rate, interval, sample size, q-value">
          <table className={s.table}>
            <caption>Cells · score rate, interval, sample size, q-value</caption>
            <thead>
              <tr>
                <th scope="col">A</th>
                <th scope="col">B</th>
                <th scope="col">A score</th>
                <th scope="col">SE</th>
                <th scope="col">CI 95%</th>
                <th scope="col">Pairs</th>
                <th scope="col">Games</th>
                <th scope="col">A wins</th>
                <th scope="col">B wins</th>
                <th scope="col">Ties</th>
                <th scope="col">Set margin</th>
                <th scope="col">q</th>
                <th scope="col">After BH</th>
              </tr>
            </thead>
            <tbody>
              {cells.map((cell) => (
                <tr key={`${cell.a}-${cell.b}`} id={anchorFor(cell)}>
                  <th scope="row">{styleLabel(artifact, cell.a)}</th>
                  <td style={{ textAlign: 'left' }}>{styleLabel(artifact, cell.b)}</td>
                  <td>{rate(cell.aScore)}</td>
                  <td>{cell.se.toFixed(4)}</td>
                  <td>{interval(cell.ci95)}</td>
                  <td>{count(cell.pairs)}</td>
                  <td>{count(cell.games)}</td>
                  <td>{count(cell.aWins)}</td>
                  <td>{count(cell.bWins)}</td>
                  <td className={s.ns}>{cell.ties}</td>
                  <td>{cell.bookMargin.toFixed(2)}</td>
                  <td>{qValue(cell.qValue)}</td>
                  <td className={cell.significant ? undefined : s.ns}>
                    {cell.significant ? 'significant' : 'ns'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Section>

      {/* ---- the full diagnostic table, per cell, both sides ------------------------------ */}
      <Section badge="Diagnostics">
        <Eyebrow tone="muted" track="head" as="h2">
          §4.2 diagnostics — both sides of all {derived.cells} cells
        </Eyebrow>
        <p className={s.figNote} style={{ marginBottom: 20 }}>
          Why a style won or lost, not just that it did. Each pair expands to the full metric
          block for both seats. Every one of these is computed by the harness from the full game
          state; none of it was ever visible to a bot, which is what makes a definition like
          &ldquo;a correct declare <em>was</em> available&rdquo; measurable at all.
        </p>
        {cells.map((cell) => (
          <details key={`${cell.a}-${cell.b}-d`} className={s.detail}>
            <summary>
              {styleLabel(artifact, cell.a)} vs {styleLabel(artifact, cell.b)} — {rate(cell.aScore)}{' '}
              {interval(cell.ci95)} · q {qValue(cell.qValue)} ·{' '}
              {cell.significant ? 'significant' : 'not significant'} after BH
            </summary>
            <div className={s.detailBody}>
              <DiagnosticTable artifact={artifact} cell={cell} />
            </div>
          </details>
        ))}
      </Section>

      {/* ---- rankings side by side ------------------------------------------------------- */}
      <Section badge="Rankings">
        <Eyebrow tone="muted" track="head" as="h2">
          Mean score against maximin
        </Eyebrow>
        <p className={s.figNote} style={{ marginBottom: 20 }}>
          Mean score is only a valid ranking if the matrix is transitive, which is exactly what
          criterion 3 tests. Maximin asks a different question — what is this style&rsquo;s worst
          matchup — and criterion 2 is decided on the lower bound of that cell&rsquo;s interval,
          not on the point estimate.
        </p>
        {/* STYLES.md §6: both caveats must be stated wherever the ranking is published, and this
            table is a ranking. Stated in full on the report; named here, with the pointer. */}
        <p className={s.figNote} style={{ marginBottom: 20 }}>
          Two measured caveats qualify every row of this table, and they are stated in full on{' '}
          <TextLink href={`${withCase('/lab', which)}#roster`}>the report</TextLink>. In short: the
          declare-threshold axis the aggressive-to-passive labels advertise is
          inert across the range this roster spans, so the styles differ along other knobs than the
          ones they are named for; and the Hoarder is measured paying hoarding&rsquo;s cost without
          the contained-book turn-pass that is its whole thesis, which no style in the roster
          <em> this run measured</em> used.
        </p>
        <ScrollRegion label="Rankings, recomputed from the matrix on load">
          <table className={s.table}>
            <caption>Rankings · recomputed from the matrix on load</caption>
            <thead>
              <tr>
                <th scope="col">Style</th>
                <th scope="col">Mean score</th>
                <th scope="col">CI 95%</th>
                <th scope="col">Maximin</th>
                <th scope="col">Worst vs</th>
                <th scope="col">Worst CI lower</th>
                <th scope="col">Worst cell after BH</th>
              </tr>
            </thead>
            <tbody>
              {derived.meanScore.map((m) => {
                const mm = derived.maximin.find((x) => x.style === m.style)
                return (
                  <tr key={m.style}>
                    <th scope="row">{styleLabel(artifact, m.style)}</th>
                    <td>{rate(m.value)}</td>
                    <td>{interval(m.ci95)}</td>
                    <td>{mm ? rate(mm.value) : '—'}</td>
                    <td style={{ textAlign: 'left' }}>
                      {mm ? styleLabel(artifact, mm.worstVs) : '—'}
                    </td>
                    <td>{mm ? rate(mm.lower95) : '—'}</td>
                    <td className={mm?.significant ? undefined : s.ns}>
                      {mm ? (mm.significant ? 'significant' : 'ns') : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollRegion>

        <Hairline variant="soft" />
        <Eyebrow tone="muted" track="head" as="h2">
          Cycles over significant edges
        </Eyebrow>
        {derived.cycles.length === 0 ? (
          <p className={s.figNote}>
            No directed 3-cycle survives Benjamini-Hochberg in this matrix. Cyclic energy is{' '}
            {rate3(derived.cyclicEnergy)} against a threshold of {rate3(derived.cyclicThreshold)}.
          </p>
        ) : (
          <ScrollRegion label="Three-cycles over significant edges">
            <table className={s.table}>
              <caption>
                3-cycles · every edge significant after BH · widest minimum edge first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Cycle</th>
                  <th scope="col">Weakest edge</th>
                </tr>
              </thead>
              <tbody>
                {derived.cycles.map((cycle) => (
                  <tr key={cycle.styles.join('-')}>
                    <th scope="row">
                      {cycle.styles.map((id) => styleLabel(artifact, id)).join(' → ')} →{' '}
                      {styleLabel(artifact, cycle.styles[0])}
                    </th>
                    <td>{rate(cycle.minEdge)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
        <p className={s.figNote}>
          Cyclic energy {rate3(derived.cyclicEnergy)}, threshold {rate3(derived.cyclicThreshold)}.
          Cycles are found here by brute force over edges that survived correction — an edge that
          only looked significant uncorrected is not an edge, and a cycle assembled from one is
          not a finding.
        </p>
      </Section>

      <Section badge="Rule set" noMarks>
        <Eyebrow tone="muted" track="head" as="h2">
          Two things about us54 that this page&rsquo;s numbers depend on
        </Eyebrow>
        <div style={{ marginTop: 20 }}>
          <Us54Facts />
        </div>
      </Section>
    </LabShell>
  )
}

export default LabMatrix
