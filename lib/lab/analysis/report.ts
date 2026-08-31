/**
 * report.ts — the console rendering of the analysis.
 *
 * The layout follows BOT_LAB.md §7.2's ranking view: the five rankings **side by side**, because
 * *"where the rankings disagree — that disagreement is the finding"*. A single sorted table would
 * hide exactly the thing the analysis exists to surface.
 *
 * The verdict banner is printed first and with its four criteria shown as pass / fail, per §4.4:
 * *"it must render `dominant`, `cyclic`, or `inconclusive` honestly [...] Resist the urge to
 * always crown a winner."*
 */
import type { StyleId } from '../../engine/index.ts'
import type { Analysis } from './analyze.ts'
import type { StyleResults } from './types.ts'

function pad(s: string | number, w: number, right = false): string {
  const t = String(s)
  return right ? t.padEnd(w) : t.padStart(w)
}

function f(n: number, d = 4): string {
  return Number.isFinite(n) ? n.toFixed(d) : '-'
}

function verdictBlock(r: StyleResults): string[] {
  const lines: string[] = []
  lines.push(`VERDICT: ${r.ranking.verdict.toUpperCase()}`)
  lines.push(r.ranking.verdictSummary)
  lines.push('')
  lines.push('BOT_LAB.md §4.4 decision rule — all four must hold to declare a superior style:')
  for (const c of r.ranking.criteria) {
    const mark = c.pass === true ? 'PASS' : c.pass === false ? 'FAIL' : '????'
    lines.push(`  [${mark}] (${c.id}) ${c.label}`)
    lines.push(`         ${c.detail}`)
  }
  return lines
}

function rankingBlock(r: StyleResults): string[] {
  const styles = r.styles.map((s) => s.id)
  const mean = new Map(r.ranking.meanScore.map((e) => [e.style, e]))
  const maximin = new Map(r.ranking.maximin.map((e) => [e.style, e]))
  const elo = new Map(r.ranking.bradleyTerry.map((e) => [e.style, e]))
  const nash = new Map(r.ranking.nash.map((e) => [e.style, e]))
  const ar = new Map(r.ranking.alphaRank.map((e) => [e.style, e]))
  const hodge = new Map(r.ranking.hodgeRating.map((e) => [e.style, e]))

  const ordered: StyleId[] = r.ranking.meanScore.map((e) => e.style)
  const header =
    `${pad('style', 11, true)}${pad('meanScore', 11)}${pad('maximin', 9)}${pad('worstVs', 11)}` +
    `${pad('elo', 9)}${pad('eloSE', 8)}${pad('nash', 8)}${pad('alphaRank', 11)}${pad('aRk', 5)}` +
    `${pad('hodgeR', 9)}`
  const lines: string[] = [header, '-'.repeat(header.length)]
  for (const s of ordered) {
    const m = mean.get(s)
    const mm = maximin.get(s)
    const e = elo.get(s)
    const nw = nash.get(s)
    const a = ar.get(s)
    const h = hodge.get(s)
    lines.push(
      `${pad(s, 11, true)}${pad(f(m?.value ?? 0), 11)}${pad(f(mm?.value ?? 0), 9)}` +
        `${pad(mm?.worstVs ?? '-', 11)}${pad((e?.elo ?? 0).toFixed(1), 9)}${pad((e?.se ?? 0).toFixed(1), 8)}` +
        `${pad(f(nw?.weight ?? 0), 8)}${pad(f(a?.score ?? 0), 11)}${pad(a?.rank ?? '-', 5)}` +
        `${pad(f(h?.value ?? 0), 9)}`,
    )
  }
  lines.push('')
  lines.push(
    `styles unused by ${styles.length}-style roster: none · ` +
      'rankings printed in meanScore order so disagreements read as out-of-order columns',
  )
  return lines
}

function cellsBlock(r: StyleResults): string[] {
  const header =
    `${pad('cell', 24, true)}${pad('aScore', 9)}${pad('se', 8)}${pad('ci95lo', 9)}${pad('ci95hi', 9)}` +
    `${pad('bootLo', 9)}${pad('bootHi', 9)}${pad('p', 10)}${pad('q(BH)', 10)}${pad('sig', 5)}`
  const lines: string[] = [header, '-'.repeat(header.length)]
  for (const c of r.matrix) {
    const boot = c.aScoreBootCi95
    lines.push(
      `${pad(`${c.a}-vs-${c.b}`, 24, true)}${pad(f(c.aScore), 9)}${pad(f(c.se), 8)}` +
        `${pad(f(c.ci95[0]), 9)}${pad(f(c.ci95[1]), 9)}` +
        `${pad(boot ? f(boot[0]) : '-', 9)}${pad(boot ? f(boot[1]) : '-', 9)}` +
        `${pad(c.pValue.toExponential(2), 10)}${pad(c.qValue.toExponential(2), 10)}` +
        `${pad(c.significant ? 'YES' : '.', 5)}`,
    )
  }
  return lines
}

function cyclesBlock(r: StyleResults, analysis: Analysis): string[] {
  const lines: string[] = []
  lines.push(
    `cyclicEnergy ${f(r.ranking.cyclicEnergy, 6)} (threshold ${r.meta.analysis.cyclicThreshold}) · ` +
      `transitive ${f(analysis.hodge.transitiveEnergy / Math.max(1e-300, analysis.hodge.totalEnergy), 6)} · ` +
      `orthogonality error ${analysis.hodge.orthogonalityError.toExponential(2)}`,
  )
  lines.push(`3-cycles: ${r.ranking.cyclesAll} directed, ${r.ranking.cycles.length} significant after BH`)
  const show = analysis.cycles.slice(0, 20)
  if (show.length === 0) {
    lines.push('  (none)')
    return lines
  }
  lines.push(
    `  ${pad('cycle', 40, true)}${pad('edges', 26, true)}${pad('minEdge', 9)}${pad('maxQ', 11)}${pad('sig', 5)}`,
  )
  for (const c of show) {
    lines.push(
      `  ${pad(`${c.styles[0]} > ${c.styles[1]} > ${c.styles[2]} >`, 40, true)}` +
        `${pad(c.edges.map((e) => e.toFixed(3)).join(' '), 26, true)}${pad(f(c.minEdge, 4), 9)}` +
        `${pad(c.maxQ.toExponential(2), 11)}${pad(c.significant ? 'YES' : '.', 5)}`,
    )
  }
  if (analysis.cycles.length > show.length) {
    lines.push(`  ... and ${analysis.cycles.length - show.length} more (see the JSON)`)
  }
  return lines
}

function exploitBlock(r: StyleResults): string[] {
  if (r.exploitability.length === 0) return ['  (exploitability search did not run)']
  const header =
    `${pad('style', 11, true)}${pad('E(i)', 9)}${pad('score', 9)}${pad('se', 8)}${pad('ci95lo', 9)}` +
    `${pad('ci95hi', 9)}${pad('search', 9)}${pad('detect', 9)}${pad('cands', 7)}${pad('inert', 7)}` +
    `${pad('games', 9)}${pad('  best response', 10, true)}`
  const lines: string[] = [header, '-'.repeat(header.length + 30)]
  for (const e of [...r.exploitability].sort((a, b) => b.gap - a.gap)) {
    if (!e.searched) {
      lines.push(`${pad(e.style, 11, true)}${pad(`(not searched — ${e.skippedReason})`, 30, true)}`)
      continue
    }
    lines.push(
      `${pad(e.style, 11, true)}${pad(f(e.gap), 9)}${pad(f(e.score), 9)}${pad(f(e.se), 8)}` +
        `${pad(f(e.ci95[0]), 9)}${pad(f(e.ci95[1]), 9)}${pad(f(e.searchScore), 9)}` +
        `${pad(f(e.detectableDelta, 3), 9)}${pad(e.candidatesTried, 7)}${pad(e.inertCandidates, 7)}` +
        `${pad(e.searchGames + e.evalGames, 9)}  ` +
        `${e.acceptedMoves.length === 0 ? '(mirror — no move accepted)' : e.acceptedMoves.join(' ')}`,
    )
  }
  lines.push('')
  lines.push(
    '  `detect` is the smallest per-move improvement this search COULD have accepted at its pair budget.',
  )
  lines.push(
    '  E(i) is a max over a search, so E(i) = 0 means "no single-coordinate move beat the mirror by',
  )
  lines.push('  at least `detect`" — a bounded claim, not "this style is unexploitable".')
  return lines
}

/** The whole analysis report. */
export function renderAnalysis(r: StyleResults, analysis: Analysis): string {
  const lines: string[] = []
  lines.push(
    `Canadian Fish style lab — ANALYSIS (BOT_LAB.md §6) · ${r.meta.variant} · ` +
      `${r.meta.gamesTotal} games · ${r.matrix.length} cells x ${r.meta.seedSet.count} duplicate pairs`,
  )
  lines.push(
    `engineCommit ${r.meta.engineCommit} · rulesHash ${r.meta.rulesHash.slice(0, 16)}… (${r.meta.rulesFile}) · ` +
      `recordsDigest ${r.meta.recordsDigest}`,
  )
  lines.push(
    `alpha ${r.meta.analysis.alpha} (BH over ${r.meta.analysis.cells} cells, ` +
      `${r.meta.analysis.significantCells} significant) · bootstrap ${
        r.meta.analysis.bootstrapRan ? `${r.meta.analysis.bootstrapSamples} resamples over pairs` : 'NOT RUN'
      } · antisymmetry error ${r.meta.analysis.antisymmetryError.toExponential(2)}`,
  )
  lines.push('')
  lines.push(...verdictBlock(r))
  lines.push('')
  lines.push('TRANSITIVITY — Hodge decomposition of the antisymmetric payoff matrix (BOT_LAB.md §4.4)')
  lines.push(...cyclesBlock(r, analysis))
  lines.push('')
  lines.push('RANKINGS, SIDE BY SIDE (BOT_LAB.md §7.2 — the disagreement IS the finding)')
  lines.push(...rankingBlock(r))
  lines.push('')
  lines.push(
    `nash: residual ${analysis.nash.residual.toExponential(2)} (must be <= 0), ` +
      `entropy ${f(analysis.nash.entropy, 4)} nats of a possible ${f(Math.log(r.styles.length), 4)}, ` +
      `tau ${analysis.nash.tau.toExponential(1)}, converged ${analysis.nash.converged}`,
  )
  lines.push(
    `alpha-Rank: alpha ${analysis.alphaRank.alpha} (infinite-alpha limit from a ${analysis.alphaRank.sweep.length}-point sweep), ` +
      `m ${analysis.alphaRank.populationSize}, stationary residual ${analysis.alphaRank.residual.toExponential(2)}`,
  )
  if (analysis.alphaRank.concentrated) {
    lines.push(
      '  !! alpha-Rank is CONCENTRATED: the evolutionary process has a single sink, so every other ' +
        'style sits at the level of the irreducibility perturbation and THE TAIL ORDER IS NOT A RANKING.',
    )
  }
  lines.push(
    `Bradley-Terry: ${analysis.bradleyTerry.iterations} MM iterations, converged ` +
      `${analysis.bradleyTerry.converged}, mean |fitted - observed| ${f(analysis.bradleyTerry.meanAbsResidual, 4)}`,
  )
  lines.push('')
  lines.push('CELLS — normal CI, bootstrap cross-check, and BH q-value (BOT_LAB.md §5.6)')
  lines.push(...cellsBlock(r))
  lines.push('')
  lines.push('EXPLOITABILITY — E(i) = max_theta SR(theta, i) - 0.5 (BOT_LAB.md §5.7)')
  lines.push(...exploitBlock(r))
  return lines.join('\n')
}
