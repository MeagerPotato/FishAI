/**
 * nash.ts — Nash averaging (Balduzzi et al., *Re-evaluating Evaluation*, NeurIPS 2018), i.e. the
 * **maximum-entropy Nash equilibrium** of the antisymmetric payoff matrix.
 *
 * BOT_LAB.md §1.2 gives the reason it exists rather than an Elo table: Nash averaging
 * *"plays a meta-game on the evaluation data itself and returns a maximum-entropy Nash
 * equilibrium — a distribution over styles, automatically robust to you adding five
 * near-duplicate variants of your favourite bot."* That robustness is not hypothetical in this
 * lab: the pilot found Hoarder plays **byte-identically** to Balanced, so the roster already
 * contains a literal duplicate, and a mean-score ranking counts its evidence twice while Nash
 * averaging splits one weight between them.
 *
 * ## The game
 *
 * `A` is antisymmetric, so the symmetric two-player zero-sum game with payoff `A` has value 0 and
 * its equilibria are exactly
 *
 * ```
 * N = { p in simplex : (A p)_i <= 0 for every i }
 * ```
 *
 * `N` is a convex polytope and is generally not a single point, so "the" Nash equilibrium is
 * under-determined. Balduzzi et al. break the tie with maximum entropy — the unique point of `N`
 * that assumes the least beyond the equilibrium conditions.
 *
 * ## How it is computed, and why this is the honest way
 *
 * Solve the **entropy-regularised** game at temperature `tau` and let `tau -> 0`:
 *
 * ```
 * p(tau) = softmax(A p(tau) / tau)
 * ```
 *
 * For a fixed `tau > 0` this saddle point is unique (the regulariser is strictly concave), and
 * regularisation of a monotone variational inequality selects, in the limit, the solution
 * minimising the regulariser over the solution set — here, the **maximum-entropy** element of
 * `N`. So the annealed fixed point is not an approximation *of a different method*, it is the
 * definition, computed.
 *
 * The fixed point is found by damped Newton on `F(p) = softmax(A p / tau) - p`, whose Jacobian is
 * `J = (1/tau) S A - I` with `S = diag(q) - q q^T`. `S A` is similar to the antisymmetric matrix
 * `S^{1/2} A S^{1/2}`, so its eigenvalues are purely imaginary and `J`'s are `+-i*lambda - 1` —
 * **never zero**, so `J` is nonsingular at every temperature and Newton is well posed. (That same
 * pure rotation is why a plain damped fixed-point iteration is useless here: it is the algebraic
 * form of rock-paper-scissors cycling, and its stable step size shrinks like `tau^2`.)
 *
 * The result carries its own certificate: `residual = max_i (A p)_i`, which must be <= 0 up to
 * tolerance for `p` to be a Nash equilibrium at all. A caller that does not look at it is
 * publishing an unchecked number.
 */
import { matVec, solveLinear } from './linalg.ts'
import type { Matrix } from './linalg.ts'

export interface NashResult {
  /** The maxent Nash mixture over styles, in the matrix's style order. Sums to 1. */
  weights: number[]
  /**
   * `max_i (A p)_i` — the best deviation available against the mixture. Zero (to tolerance) for a
   * genuine equilibrium of an antisymmetric game; a positive value means the solve did not
   * converge and the weights must not be published.
   */
  residual: number
  /** Shannon entropy of the mixture, in nats. `log(n)` for the uniform mixture. */
  entropy: number
  /** The final temperature reached by the annealing schedule. */
  tau: number
  /** Total Newton steps taken across the whole schedule. */
  iterations: number
  converged: boolean
}

/** Numerically stable softmax. */
function softmax(x: readonly number[], tau: number): number[] {
  let max = Number.NEGATIVE_INFINITY
  for (const v of x) if (v > max) max = v
  const e = x.map((v) => Math.exp((v - max) / tau))
  const z = e.reduce((s, v) => s + v, 0)
  return z === 0 ? x.map(() => 1 / x.length) : e.map((v) => v / z)
}

function norm2(x: readonly number[]): number {
  let s = 0
  for (const v of x) s += v * v
  return Math.sqrt(s)
}

/** One damped-Newton solve of `p = softmax(A p / tau)`, warm-started at `p0`. */
function solveAtTau(a: Matrix, p0: number[], tau: number, maxIter: number, tol: number): { p: number[]; iters: number } {
  const n = p0.length
  let p = p0.slice()
  let iters = 0
  for (let it = 0; it < maxIter; it++) {
    const q = softmax(matVec(a, p), tau)
    const f = q.map((v, i) => v - p[i])
    const fn = norm2(f)
    if (fn <= tol) break
    iters++

    // J = (1/tau) * S * A - I, with S = diag(q) - q q^T.
    const j: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0))
    for (let r = 0; r < n; r++) {
      // (S A)[r][c] = q_r * A[r][c] - q_r * sum_k q_k A[k][c]
      for (let c = 0; c < n; c++) {
        let weighted = 0
        for (let k = 0; k < n; k++) weighted += q[k] * a[k][c]
        j[r][c] = (q[r] * (a[r][c] - weighted)) / tau
      }
      j[r][r] -= 1
    }
    const step = solveLinear(
      j,
      f.map((v) => -v),
    )
    if (step === null) {
      // Jacobian is singular only when q has collapsed onto one atom, in which case q already IS
      // the fixed point; take it and stop rather than manufacturing a step.
      p = q
      break
    }
    // Backtracking on ||F|| keeps the global iteration honest when the warm start is far away.
    let alpha = 1
    let next = p
    for (let bt = 0; bt < 30; bt++) {
      const cand = p.map((v, i) => v + alpha * step[i])
      const cf = softmax(matVec(a, cand), tau).map((v, i) => v - cand[i])
      if (norm2(cf) < fn) {
        next = cand
        break
      }
      alpha /= 2
      next = q
    }
    p = next
  }
  return { p, iters }
}

export interface NashOptions {
  /** Starting temperature. Must be large enough that the regularised game is easy. */
  tauStart?: number
  /** Stop annealing at or below this temperature. */
  tauEnd?: number
  /** Geometric cooling factor in `(0, 1)`. */
  cooling?: number
  maxIterPerTau?: number
  tol?: number
  /** `residual` above this marks the result unconverged. */
  residualTol?: number
}

/**
 * Maximum-entropy Nash equilibrium of the symmetric zero-sum game with antisymmetric payoff `a`.
 *
 * @param a antisymmetric payoff matrix (`A = -A^T`), e.g. `2P - 1` from [matrix.ts](matrix.ts).
 */
export function maxentNash(a: Matrix, opts: NashOptions = {}): NashResult {
  const n = a.length
  if (n === 0) return { weights: [], residual: 0, entropy: 0, tau: 0, iterations: 0, converged: true }
  if (n === 1) return { weights: [1], residual: 0, entropy: 0, tau: 0, iterations: 0, converged: true }

  const tauStart = opts.tauStart ?? 2
  const tauEnd = opts.tauEnd ?? 1e-7
  const cooling = opts.cooling ?? 0.75
  const maxIterPerTau = opts.maxIterPerTau ?? 60
  const tol = opts.tol ?? 1e-14
  const residualTol = opts.residualTol ?? 1e-6

  let p = new Array<number>(n).fill(1 / n)
  let iterations = 0
  let tau = tauStart
  for (;;) {
    const r = solveAtTau(a, p, tau, maxIterPerTau, tol)
    p = r.p
    iterations += r.iters
    if (tau <= tauEnd) break
    tau = Math.max(tauEnd, tau * cooling)
  }

  // Project back onto the simplex: the Newton iterate can leave it between temperatures, and a
  // published mixture with a -1e-17 entry is a mixture that a reader has to explain.
  const clipped = p.map((v) => (v > 0 ? v : 0))
  const z = clipped.reduce((s, v) => s + v, 0)
  const weights = z > 0 ? clipped.map((v) => v / z) : new Array<number>(n).fill(1 / n)

  const dev = matVec(a, weights)
  const residual = Math.max(...dev)
  let entropy = 0
  for (const w of weights) if (w > 0) entropy -= w * Math.log(w)

  return {
    weights,
    residual,
    entropy,
    tau,
    iterations,
    converged: residual <= residualTol,
  }
}
