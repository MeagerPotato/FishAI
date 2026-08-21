/**
 * linalg.ts — the two dense linear-algebra routines the analysis needs, at the sizes it needs
 * them (n = 9).
 *
 * Deliberately no dependency and deliberately no generality. Everything downstream —
 * [nash.ts](nash.ts)'s Newton step, [alpharank.ts](alpharank.ts)'s stationary distribution,
 * [bradleyTerry.ts](bradleyTerry.ts)'s Fisher information — solves one 9x9 system, so a
 * partial-pivoting Gaussian elimination is both the right tool and small enough to be read and
 * checked by eye. A library would be a supply-chain and typecheck cost for 40 lines.
 *
 * Both functions are **pure and total**: a singular system returns `null` rather than `NaN`s, so
 * a caller must decide what a failure means instead of discovering it three modules later as a
 * `NaN` in the published artifact.
 */

/** A square matrix, row-major. Rows must all have the same length as the outer array. */
export type Matrix = number[][]

/** Deep copy — every routine here is non-mutating in its arguments. */
export function cloneMatrix(m: Matrix): Matrix {
  return m.map((row) => row.slice())
}

/**
 * Solve `A x = b` by Gaussian elimination with partial pivoting.
 *
 * Returns `null` when the matrix is numerically singular (a pivot at or below `tol` in
 * magnitude), never a vector of `NaN`s.
 */
export function solveLinear(a: Matrix, b: readonly number[], tol = 1e-12): number[] | null {
  const n = b.length
  if (a.length !== n) return null
  const m = a.map((row, i) => {
    if (row.length !== n) return null
    return [...row, b[i]]
  })
  if (m.some((row) => row === null)) return null
  const w = m as number[][]

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(w[r][col]) > Math.abs(w[pivot][col])) pivot = r
    }
    if (!(Math.abs(w[pivot][col]) > tol)) return null
    if (pivot !== col) {
      const t = w[pivot]
      w[pivot] = w[col]
      w[col] = t
    }
    const p = w[col][col]
    for (let r = col + 1; r < n; r++) {
      const f = w[r][col] / p
      if (f === 0) continue
      for (let c = col; c <= n; c++) w[r][c] -= f * w[col][c]
    }
  }

  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = w[r][n]
    for (let c = r + 1; c < n; c++) s -= w[r][c] * x[c]
    x[r] = s / w[r][r]
  }
  return x.every((v) => Number.isFinite(v)) ? x : null
}

/** Invert a square matrix, or `null` if it is numerically singular. */
export function invert(a: Matrix, tol = 1e-12): Matrix | null {
  const n = a.length
  const out: Matrix = []
  for (let j = 0; j < n; j++) {
    const e = new Array<number>(n).fill(0)
    e[j] = 1
    const col = solveLinear(a, e, tol)
    if (col === null) return null
    out.push(col)
  }
  // `out[j]` is column j; transpose into row-major.
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => out[j][i]))
}

/** `y = A x`. */
export function matVec(a: Matrix, x: readonly number[]): number[] {
  return a.map((row) => {
    let s = 0
    for (let i = 0; i < row.length; i++) s += row[i] * x[i]
    return s
  })
}

/** Squared Frobenius norm, `sum_ij m[i][j]^2`. */
export function frobeniusSq(m: Matrix): number {
  let s = 0
  for (const row of m) for (const v of row) s += v * v
  return s
}
