/**
 * The verdict, recomputed — BOT_LAB.md §4.4 and §7.2's *"the verdict banner is the single most
 * important element ... Resist the urge to always crown a winner."*
 *
 * The site does not print `ranking.verdict`. It re-derives every input to the decision rule from
 * the matrix and runs the shipped `decideVerdict()` over them, then reports whether its answer
 * agrees with the artifact's. Three reasons that is worth the code:
 *
 * 1. **Criterion 2 is an interval claim.** "No losing matchup" needs the worst cell's CI lower
 *    bound and its post-BH significance, and those are properties of the matrix, not of a
 *    summary line someone wrote next to it.
 * 2. **A cycle is not a cycle until every edge survives Benjamini-Hochberg.** Cycles are found
 *    here by brute force over SIGNIFICANT edges only. The committed fixture declares a second
 *    cycle its own matrix does not contain; drawing it would put a spurious edge on the headline
 *    diagram, which is exactly the failure BH exists to prevent.
 * 3. **An unmeasured criterion is a failed criterion.** If the exploitability search did not run,
 *    criterion 4 is undetermined and no verdict may be `dominant` — a style is not crowned
 *    because nobody checked (BOT_LAB.md §5.7).
 *
 * `reconcile()` then hands the DIAGRAMS the recomputed ranking, so the counter-graph highlights
 * the cycle the banner is talking about and never one the banner rejected.
 */

import { cellIndex, scoreOf, type Cycle, type MatrixCell } from '../diagrams/index.ts'
import { decideVerdict, type Criterion, type Verdict } from '../../lib/lab/analysis/index.ts'
import type { StyleId } from '../../lib/engine/index.ts'
import type { LabArtifact, LabMaximin } from './artifact.ts'

/**
 * `decideVerdict` types its style names as the engine's `StyleId` union, which is the roster the
 * engine ships. An artifact is data and may legitimately name a style the engine has never heard
 * of — a roster addition, or a foreign bot from a cross-play run. The decision rule only ever
 * interpolates these into its `detail` strings, never dispatches on them, so widening here costs
 * nothing and refusing to widen would make the site unable to read its own future artifacts.
 */
const asStyleId = (id: string): StyleId => id as StyleId

const r4 = (v: number): number => Math.round(v * 10000) / 10000

export interface Edge {
  from: string
  to: string
  score: number
  qValue: number
}

export interface Derived {
  candidate: string | null
  meanScore: Array<{ style: string; value: number; ci95: [number, number] }>
  maximin: LabMaximin[]
  cycles: Cycle[]
  /** Every directed edge that survived BH — what the counter-graph is allowed to draw. */
  edges: Edge[]
  verdict: Verdict
  criteria: Criterion[]
  summary: string
  /** True when the recomputation lands somewhere other than the artifact's stated verdict. */
  disagrees: boolean
  statedVerdict: Verdict
  cyclicEnergy: number
  cyclicThreshold: number
  significantCells: number
  cells: number
}

interface Found {
  score: number
  lower: number
  upper: number
  cell: MatrixCell
}

function orient(index: Map<string, MatrixCell>, a: string, b: string): Found | undefined {
  const found = scoreOf(index, a, b)
  if (!found) return undefined
  const { cell } = found
  // `scoreOf` flips the score for a mirrored cell but not the interval; flip it here so the
  // bound always belongs to the score beside it.
  const mirrored = cell.a !== a
  return {
    score: found.score,
    lower: mirrored ? r4(1 - cell.ci95[1]) : cell.ci95[0],
    upper: mirrored ? r4(1 - cell.ci95[0]) : cell.ci95[1],
    cell,
  }
}

export function meanScores(ids: string[], index: Map<string, MatrixCell>) {
  return ids
    .map((id) => {
      const xs: number[] = []
      let se2 = 0
      for (const o of ids) {
        if (o === id) continue
        const f = orient(index, id, o)
        if (!f) continue
        xs.push(f.score)
        se2 += f.cell.se * f.cell.se
      }
      const n = Math.max(1, xs.length)
      const value = r4(xs.reduce((s, v) => s + v, 0) / n)
      const half = r4((1.96 * Math.sqrt(se2)) / n)
      return { style: id, value, ci95: [r4(value - half), r4(value + half)] as [number, number] }
    })
    .sort((p, q) => q.value - p.value)
}

export function maximins(ids: string[], index: Map<string, MatrixCell>): LabMaximin[] {
  return ids
    .map((id) => {
      let value = Number.POSITIVE_INFINITY
      let worstVs = ''
      let lower95 = 0
      let significant = false
      for (const o of ids) {
        if (o === id) continue
        const f = orient(index, id, o)
        if (!f || f.score >= value) continue
        value = f.score
        worstVs = o
        lower95 = f.lower
        significant = f.cell.significant
      }
      return { style: id, value: r4(value), worstVs, lower95: r4(lower95), significant }
    })
    .sort((p, q) => q.value - p.value)
}

/** Directed edges that survived Benjamini-Hochberg. Never derived from a raw p-value. */
export function significantEdges(ids: string[], index: Map<string, MatrixCell>): Edge[] {
  const out: Edge[] = []
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue
      const f = orient(index, a, b)
      if (!f || !f.cell.significant || f.score <= 0.5) continue
      out.push({ from: a, to: b, score: f.score, qValue: f.cell.qValue })
    }
  }
  return out.sort((p, q) => q.score - p.score)
}

/**
 * Every directed 3-cycle over significant edges, canonicalised so `A>B>C>A` is not also emitted
 * as `B>C>A>B`, and ordered widest minimum edge first — the loosest cycle is the strongest
 * finding, so it is the one the diagram highlights.
 */
export function findCycles(ids: string[], index: Map<string, MatrixCell>): Cycle[] {
  const beats = new Set(significantEdges(ids, index).map((e) => `${e.from}>${e.to}`))
  const edge = (a: string, b: string): number => orient(index, a, b)?.score ?? 0.5
  const out: Cycle[] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = 0; j < ids.length; j++) {
      for (let k = 0; k < ids.length; k++) {
        if (i === j || j === k || i === k) continue
        if (!(i < j && i < k)) continue
        const [x, y, z] = [ids[i], ids[j], ids[k]]
        if (!beats.has(`${x}>${y}`) || !beats.has(`${y}>${z}`) || !beats.has(`${z}>${x}`)) continue
        out.push({
          styles: [x, y, z],
          minEdge: r4(Math.min(edge(x, y), edge(y, z), edge(z, x))),
        })
      }
    }
  }
  return out.sort((p, q) => q.minEdge - p.minEdge)
}

/** Re-derive the four §4.4 criteria and the verdict from the artifact's own numbers. */
export function derive(artifact: LabArtifact): Derived {
  const ids = artifact.styles.map((s) => s.id)
  const index = cellIndex(artifact.matrix)

  const meanScore = meanScores(ids, index)
  const maximin = maximins(ids, index)
  const cycles = findCycles(ids, index)
  const edges = significantEdges(ids, index)

  const candidate = meanScore[0]?.style ?? null
  const runnerUp = meanScore[1] ? { style: meanScore[1].style, meanScore: meanScore[1].value } : null
  const mm = maximin.find((m) => m.style === candidate)

  const searched = artifact.exploitability.filter((e) => e.searched)
  const ran = artifact.meta.analysis.exploitabilityRan && searched.length > 0
  const mine = candidate === null ? undefined : searched.find((e) => e.style === candidate)

  const decided = decideVerdict({
    candidate: candidate === null ? null : asStyleId(candidate),
    meanScore: meanScore[0]?.value ?? 0,
    runnerUp: runnerUp === null ? null : { ...runnerUp, style: asStyleId(runnerUp.style) },
    maximin: mm?.value ?? 0,
    maximinLower95: mm?.lower95 ?? 0,
    maximinWorstVs: mm ? asStyleId(mm.worstVs) : null,
    maximinWorstSignificant: mm?.significant ?? false,
    cyclicEnergy: artifact.ranking.cyclicEnergy,
    cyclicThreshold: artifact.meta.analysis.cyclicThreshold,
    significantCycles: cycles.length,
    exploitability: ran && mine ? mine.gap : null,
    rivalExploitability: ran ? searched.filter((e) => e.style !== candidate).map((e) => e.gap) : [],
    exploitabilityMargin: artifact.meta.analysis.exploitabilityMargin,
  })

  return {
    candidate,
    meanScore,
    maximin,
    cycles,
    edges,
    verdict: decided.verdict,
    criteria: decided.criteria,
    summary: decided.summary,
    disagrees: decided.verdict !== artifact.ranking.verdict,
    statedVerdict: artifact.ranking.verdict,
    cyclicEnergy: artifact.ranking.cyclicEnergy,
    cyclicThreshold: artifact.meta.analysis.cyclicThreshold,
    significantCells: artifact.matrix.filter((c) => c.significant).length,
    cells: artifact.matrix.length,
  }
}

/**
 * The artifact as the diagrams should see it: recomputed ranking, so the headline diagram and
 * the verdict banner can never disagree about which cycle exists.
 */
export function reconcile(artifact: LabArtifact, derived: Derived): LabArtifact {
  return {
    ...artifact,
    ranking: {
      ...artifact.ranking,
      meanScore: derived.meanScore,
      maximin: derived.maximin,
      cycles: derived.cycles,
      verdict: derived.verdict,
      criteria: derived.criteria,
      verdictSummary: derived.summary,
    },
  }
}

export const VERDICT_GLOSS: Record<Verdict, string> = {
  dominant: 'One style holds up under all four criteria.',
  cyclic: 'No dominant style. The roster counters itself, and the counter-graph is the finding.',
  inconclusive:
    'No dominant style, and no cyclic structure either. The evidence does not support crowning ' +
    'the top of the table.',
}
