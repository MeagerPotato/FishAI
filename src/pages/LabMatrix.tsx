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
import { Eyebrow, Hairline, Section, SectionHead } from '../components/index.ts'
import { cellIndex, scoreOf, type MatrixCell } from '../diagrams/index.ts'
import { caseFromSearch, styleLabel, type LabArtifact } from '../lab/artifact.ts'
import { count, interval, qValue, rate, rate3 } from '../lab/format.ts'
import { labModel } from '../lab/model.ts'
import { shortHash } from '../lab/rules.ts'
import { LabContents, type LabSection } from '../lab/ui/LabContents.tsx'
import { LabShell, withCase } from '../lab/ui/LabShell.tsx'
import { ArtifactBroken, RulesMismatch } from '../lab/ui/Refusal.tsx'
import { ScrollRegion } from '../lab/ui/ScrollRegion.tsx'
import { RuleStamp, SyntheticNotice } from '../lab/ui/RuleStamp.tsx'
import { VerdictStrip } from '../lab/ui/Verdict.tsx'
import s from '../lab/ui/lab.module.css'

/** BOT_LAB.md §4.2, with the two `us54` additions. `voidRate` is absent, and cannot return. */
const DIAGNOSTICS: Array<{ key: keyof MatrixCell['metrics']['a']; label: string }> = [
  { key: 'askHitRate', label: 'Ask hit rate' },
  { key: 'turnRetention', label: 'Turn retention' },
  { key: 'claimPrecision', label: 'Claim precision' },
  { key: 'claimYield', label: 'Claim yield' },
  { key: 'concedeRate', label: 'Concede rate' },
  { key: 'foreignDeclareRate', label: 'Foreign declare rate' },
  { key: 'declareLatency', label: 'Declare latency' },
  { key: 'leakIndex', label: 'Leak index' },
  { key: 'hoardIndex', label: 'Hoard index' },
  { key: 'avgMoves', label: 'Average moves' },
]

const CONTENTS: readonly LabSection[] = [
  { id: 'payoff-matrix', label: 'N × N grid' },
  { id: 'cells', label: 'Every cell' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'rankings', label: 'Rankings and cycles' },
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
            <th scope="col">
              Δ ({styleLabel(artifact, cell.a)} − {styleLabel(artifact, cell.b)})
            </th>
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
              </tr>
            )
          })}
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
        <SectionHead level="h1" lines={['Every cell,', 'every *q-value*.']} />
        <RuleStamp artifact={artifact} check={check} />
        <SyntheticNotice artifact={artifact} />
        <VerdictStrip derived={derived} />

        <LabContents sections={CONTENTS} />
      </Section>

      {/* ---- the N x N grid --------------------------------------------------------------- */}
      <Section id="payoff-matrix" badge="N × N">
        <Eyebrow tone="muted" track="head" as="h2">
          Score rate, row vs column
        </Eyebrow>
        <ScrollRegion
          label="Payoff matrix, row style against column style"
          style={{ marginTop: 20 }}
        >
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
      <Section id="cells" badge="Every cell">
        <Eyebrow tone="muted" track="head" as="h2">
          The {derived.cells} stored cells
        </Eyebrow>
        <ScrollRegion
          label="Every stored cell: score rate, interval, sample size, q-value"
          style={{ marginTop: 20 }}
        >
          <table className={s.table}>
            <caption>Cells · BH at α = {artifact.meta.analysis.alpha}</caption>
            <thead>
              <tr>
                <th scope="col">Style A (row)</th>
                <th scope="col">Style B (column)</th>
                <th scope="col">A score rate</th>
                <th scope="col">A SE</th>
                <th scope="col">A CI 95%</th>
                <th scope="col">Duplicate pairs</th>
                <th scope="col">Games</th>
                <th scope="col">A wins</th>
                <th scope="col">B wins</th>
                <th scope="col">Ties</th>
                <th scope="col">Set margin (A − B)</th>
                <th scope="col">q-value</th>
                <th scope="col">After BH</th>
              </tr>
            </thead>
            <tbody>
              {cells.map((cell) => (
                <tr key={`${cell.a}-${cell.b}`} id={anchorFor(cell)} className={s.cellRow}>
                  <th scope="row">
                    {styleLabel(artifact, cell.a)}
                    {/* Only rendered visibly while this row is the `:target` — the way back for a
                        reader who arrived by clicking a cell of the grid. */}
                    <a className={s.backToGrid} href="#payoff-matrix">
                      ↑ Back to grid
                    </a>
                  </th>
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
      <Section id="diagnostics" badge="Diagnostics">
        <Eyebrow tone="muted" track="head" as="h2">
          Diagnostics, both sides
        </Eyebrow>
        <div style={{ marginTop: 20 }}>
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
        </div>
      </Section>

      {/* ---- rankings side by side ------------------------------------------------------- */}
      <Section id="rankings" badge="Rankings">
        <Eyebrow tone="muted" track="head" as="h2">
          Mean score against maximin
        </Eyebrow>
        <ScrollRegion label="Rankings, recomputed from the matrix on load" style={{ marginTop: 20 }}>
          <table className={s.table}>
            <caption>Rankings</caption>
            <thead>
              <tr>
                <th scope="col">Style</th>
                <th scope="col">Mean score rate</th>
                <th scope="col">Mean CI 95%</th>
                <th scope="col">Maximin score rate</th>
                <th scope="col">Worst matchup</th>
                <th scope="col">Worst-cell CI lower bound</th>
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
          <p className={s.figNote}>No 3-cycle survives BH.</p>
        ) : (
          <ScrollRegion label="Three-cycles over significant edges">
            <table className={s.table}>
              <caption>3-cycles · widest minimum edge first</caption>
              <thead>
                <tr>
                  <th scope="col">Cycle</th>
                  <th scope="col">Weakest edge (score rate)</th>
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
          Cyclic energy {rate3(derived.cyclicEnergy)} · threshold {rate3(derived.cyclicThreshold)}
        </p>
      </Section>
    </LabShell>
  )
}

export default LabMatrix
