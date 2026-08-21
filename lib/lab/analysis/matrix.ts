/**
 * matrix.ts — the payoff matrix `P` and its antisymmetric form `A`, with the antisymmetry
 * **asserted** rather than assumed.
 *
 * BOT_LAB.md §4.4 defines `P[i][j]` as the duplicate-averaged score rate of style *i* against
 * style *j*, with `P[i][j] + P[j][i] = 1`. Everything after this module depends on that identity:
 * the Hodge split of [hodge.ts](hodge.ts) decomposes an *antisymmetric* matrix, Nash averaging
 * ([nash.ts](nash.ts)) is only a symmetric zero-sum game because `A = -A^T`, and the maximin of a
 * matrix that is not antisymmetric is not the quantity §4.4's decision rule refers to.
 *
 * So `buildPayoff` throws on a violation instead of returning a matrix that is *nearly*
 * antisymmetric. The identity is exact by construction upstream — every game contributes
 * `aResult` to one side and `1 - aResult` to the other, and `aggregateCell` forms `bScore` as
 * `1 - aScore` — so any drift here is a bug in the pipeline, not a rounding artefact, and the
 * tolerance is set at 1e-12 to say so.
 *
 * ## The diagonal
 *
 * The lab plays no mirror cells (a style scores exactly 0.5 against itself once the deals are
 * duplicated, so a mirror cell costs games and carries no matrix signal). The diagonal is
 * therefore *filled in* at its known value, 0.5, rather than measured — which is what makes
 * `A[i][i] = 0` and lets alpha-Rank read `M(s, s)` as the fitness of a monomorphic population.
 */
import type { StyleId } from '../../engine/index.ts'
import type { LabCellAggregate } from '../types.ts'
import type { Matrix } from './linalg.ts'

export interface PayoffMatrix {
  styles: readonly StyleId[]
  /** `P[i][j]` — score rate of *i* vs *j*. Diagonal is 0.5 (unmeasured, known by symmetry). */
  p: Matrix
  /** `A = 2P - 1 = P - P^T` — the antisymmetric form every §4.4 tool consumes. */
  a: Matrix
  /** Games behind each cell, `n[i][j] = n[j][i]`. Diagonal 0. */
  n: Matrix
  /** Standard error of `P[i][j]`, symmetric. Diagonal 0. */
  se: Matrix
  /** The cell each off-diagonal entry came from, for provenance in the drill-down. */
  cellOf: (string | null)[][]
  /** Largest `|P[i][j] + P[j][i] - 1|` observed. Asserted below tolerance by `buildPayoff`. */
  antisymmetryError: number
}

/** Largest `|P[i][j] + P[j][i] - 1|` in a matrix. Zero for a perfectly antisymmetric one. */
export function antisymmetryErrorOf(p: Matrix): number {
  let worst = 0
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < p.length; j++) worst = Math.max(worst, Math.abs(p[i][j] + p[j][i] - 1))
  }
  return worst
}

/**
 * Build `P`, `A` and their metadata from the aggregated cells.
 *
 * @throws if a pairing is missing (the matrix would have a hole a decomposition cannot see), if
 *         two cells disagree about the same pairing, or if antisymmetry fails beyond `tol`.
 */
export function buildPayoff(
  styles: readonly StyleId[],
  cells: readonly LabCellAggregate[],
  tol = 1e-12,
): PayoffMatrix {
  const n = styles.length
  const idx = new Map<StyleId, number>()
  styles.forEach((s, i) => idx.set(s, i))

  const p: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(Number.NaN))
  const games: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  const se: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  const cellOf: (string | null)[][] = Array.from({ length: n }, () => new Array<string | null>(n).fill(null))
  for (let i = 0; i < n; i++) p[i][i] = 0.5

  const conflicts: string[] = []
  for (const c of cells) {
    const i = idx.get(c.a)
    const j = idx.get(c.b)
    if (i === undefined || j === undefined) continue
    if (Number.isFinite(p[i][j]) && Math.abs(p[i][j] - c.aScore) > tol) {
      conflicts.push(`${c.id}: ${c.aScore} conflicts with an earlier cell's ${p[i][j]}`)
    }
    p[i][j] = c.aScore
    p[j][i] = 1 - c.aScore
    games[i][j] = c.games
    games[j][i] = c.games
    se[i][j] = c.se
    se[j][i] = c.se
    cellOf[i][j] = c.id
    cellOf[j][i] = c.id
  }

  const missing: string[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && !Number.isFinite(p[i][j])) missing.push(`${styles[i]} vs ${styles[j]}`)
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `buildPayoff: ${missing.length} unmeasured pairing(s) — ${missing.slice(0, 6).join(', ')}` +
        `${missing.length > 6 ? ', ...' : ''}. BOT_LAB.md §4.4 decomposes a COMPLETE matrix; a hole is not a zero.`,
    )
  }

  if (conflicts.length > 0) {
    throw new Error(
      `buildPayoff: ${conflicts.length} pairing(s) measured twice with different results — ` +
        `${conflicts.slice(0, 4).join('; ')}. One cell per unordered pairing (plan.ts:cellList).`,
    )
  }

  const antisymmetryError = antisymmetryErrorOf(p)
  if (antisymmetryError > tol) {
    throw new Error(
      `buildPayoff: P is not antisymmetric — max |P[i][j] + P[j][i] - 1| = ${antisymmetryError} > ${tol}. ` +
        'BOT_LAB.md §4.4 requires duplicate averaging to make this exact; a drift here is a pipeline bug.',
    )
  }

  const a: Matrix = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => p[i][j] - p[j][i]))

  return { styles, p, a, n: games, se, cellOf, antisymmetryError }
}

/** `mean_j P[i][j]` over the measured off-diagonal row — BOT_LAB.md §4.4's naive ranking. */
export function meanScores(m: PayoffMatrix): number[] {
  const n = m.styles.length
  return m.p.map((row, i) => {
    let s = 0
    let k = 0
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      s += row[j]
      k++
    }
    return k === 0 ? 0 : s / k
  })
}

export interface Maximin {
  value: number
  worstVs: StyleId | null
}

/**
 * `min_j P[i][j]` over the measured off-diagonal row.
 *
 * BOT_LAB.md §4.4: *"a style with maximin > 0.5 beats everything"* — this is criterion 2 of the
 * four-part decision rule, and the reason the diagonal is excluded is that 0.5 against itself
 * would cap every style's maximin at 0.5 and make the criterion unsatisfiable by construction.
 */
export function maximins(m: PayoffMatrix): Maximin[] {
  const n = m.styles.length
  return m.p.map((row, i) => {
    let worst = Number.POSITIVE_INFINITY
    let worstVs: StyleId | null = null
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      if (row[j] < worst) {
        worst = row[j]
        worstVs = m.styles[j]
      }
    }
    return { value: worstVs === null ? 0 : worst, worstVs }
  })
}
