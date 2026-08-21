/**
 * alpharank.ts — alpha-Rank (Omidshafiei et al., *alpha-Rank: Multi-Agent Evaluation by
 * Evolution*, Scientific Reports 2019), the evolutionary ranking BOT_LAB.md §4.4 asks for as the
 * *"ranking that survives intransitivity"*.
 *
 * ## What it computes
 *
 * A single population of `m` individuals all playing one style. A mutant style appears; the
 * mutation rate is taken to zero, so the population is monomorphic except during a single
 * fixation attempt. Under a Moran process with Fermi selection at intensity `alpha`, the mutant
 * `sigma` invading a resident `s` fixates with probability
 *
 * ```
 * rho(s -> sigma) = 1 / (1 + sum_{l=1..m-1} prod_{k=1..l} exp(-alpha * (f_sigma(k) - f_s(k))))
 * ```
 *
 * with the single-population fitnesses (self-play excluded from a player's own payoff)
 *
 * ```
 * f_sigma(k) = [ (k-1) M(sigma,sigma) + (m-k) M(sigma,s) ] / (m-1)
 * f_s(k)     = [ k     M(s,sigma)     + (m-k-1) M(s,s)   ] / (m-1)
 * ```
 *
 * Those fixation probabilities are the off-diagonal of a Markov chain over styles; its stationary
 * distribution is the alpha-Rank score. High score = a style the evolutionary process spends time
 * in, which is a statement about the whole response structure rather than about an average.
 *
 * **`M(s, s)` is why [matrix.ts](matrix.ts) fills the diagonal at 0.5 rather than leaving it
 * unmeasured.** The fitness of a resident among residents is a real term in the arithmetic above;
 * dropping it (or leaving it 0) changes every fixation probability in the chain.
 *
 * ## The two knobs, and how they are set rather than guessed
 *
 * `alpha` is the selection intensity, and the paper's prescription is the **infinite-alpha
 * limit** — sweep upward and take the ranking once it stops moving. `alphaSweep` does exactly
 * that and the result records both the value used and the whole sweep, so a reader can see the
 * ranking was stable rather than take it on faith. `m` (population size) is fixed at the paper's
 * default of 50; it scales the fitness *differences* and so interacts with `alpha`, which is a
 * second reason to report the sweep rather than a single number.
 *
 * A vanishing uniform perturbation (`irreducibilityEpsilon`, 1e-10) is mixed into the chain. At
 * large `alpha` the chain becomes absorbing at a dominant style — correct, and exactly what the
 * transitive fixture must show — but an absorbing chain has a non-unique stationary distribution
 * as a *linear system*, and the perturbation restores uniqueness without moving the answer beyond
 * the tenth decimal.
 */
import { solveLinear } from './linalg.ts'
import type { Matrix } from './linalg.ts'

export interface AlphaRankResult {
  /** Stationary distribution over styles, in the matrix's order. Sums to 1. */
  scores: number[]
  /**
   * 1-based **competition** rank (1, 2, 2, 4) by score, with near-equal scores sharing a rank.
   *
   * The tie tolerance is not cosmetic. The pilot roster contains two styles that play
   * byte-identically, so their true alpha-Rank scores are equal — but the chain's stationary
   * solve returns them differing in the eighth significant digit, and a strict ordering would
   * publish a rank difference that is pure floating point.
   */
  ranks: number[]
  alpha: number
  populationSize: number
  /** `max_i |(pi C)_i - pi_i|` — the stationary-distribution residual. */
  residual: number
  converged: boolean
  /** Every sweep point evaluated, so the concentration is visible rather than asserted. */
  sweep: { alpha: number; scores: number[] }[]
  /**
   * True when essentially all the mass sits on one style.
   *
   * **When this is true the ordering of the remaining styles must not be read as a ranking.** At
   * large `alpha` a matrix with a strategy that beats everything has a single absorbing state, so
   * the other styles' scores are of the order of the irreducibility perturbation itself. That is
   * the correct evolutionary answer to "where does the process spend its time" — but the tail is
   * regulariser, not evidence.
   */
  concentrated: boolean
}

export interface AlphaRankOptions {
  /** Selection intensity. Omit to sweep and take the infinite-alpha limit. */
  alpha?: number
  /** Moran population size. Default 50, the paper's. */
  populationSize?: number
  /** Ascending sweep used when `alpha` is not given. */
  sweep?: readonly number[]
  /** L-infinity change between consecutive sweep points below which the ranking is called stable. */
  stableTol?: number
  /**
   * The sweep may not stop below this selection intensity even if the distribution has stopped
   * moving. Without it a matrix whose answer is uniform at *every* intensity (rock-paper-scissors
   * is exactly that) would stop at the second sweep point and report `alpha = 0.3` as its
   * "infinite-alpha limit", which is true but reads as a much weaker claim than it is.
   */
  minAlphaForStop?: number
  irreducibilityEpsilon?: number
}

const DEFAULT_SWEEP = [0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000] as const

/**
 * Fixation probability of one `sigma` mutant in a resident population of `s`.
 *
 * The product is accumulated in log space and the sum is guarded: when the mutant is decisively
 * worse the sum overflows to `Infinity`, which is the correct limit (`rho -> 0`) rather than an
 * error to propagate.
 */
export function fixationProbability(m: Matrix, s: number, sigma: number, popSize: number, alpha: number): number {
  if (popSize < 2) return 0
  let sum = 0
  let logProd = 0
  for (let k = 1; k <= popSize - 1; k++) {
    const fSigma = ((k - 1) * m[sigma][sigma] + (popSize - k) * m[sigma][s]) / (popSize - 1)
    const fS = (k * m[s][sigma] + (popSize - k - 1) * m[s][s]) / (popSize - 1)
    logProd += -alpha * (fSigma - fS)
    if (logProd > 700) return 0
    sum += Math.exp(logProd)
    if (!Number.isFinite(sum)) return 0
  }
  return 1 / (1 + sum)
}

/** The mutation-limited transition matrix over styles. Rows sum to 1. */
export function transitionMatrix(m: Matrix, popSize: number, alpha: number, epsilon: number): Matrix {
  const n = m.length
  const eta = n > 1 ? 1 / (n - 1) : 0
  const c: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let s = 0; s < n; s++) {
    let off = 0
    for (let sigma = 0; sigma < n; sigma++) {
      if (sigma === s) continue
      const v = eta * fixationProbability(m, s, sigma, popSize, alpha)
      c[s][sigma] = v
      off += v
    }
    c[s][s] = 1 - off
  }
  if (epsilon > 0) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) c[i][j] = (1 - epsilon) * c[i][j] + epsilon / n
    }
  }
  return c
}

/** Stationary distribution of a row-stochastic matrix, by direct solve of `pi (C - I) = 0`. */
export function stationaryDistribution(c: Matrix): { pi: number[]; residual: number } | null {
  const n = c.length
  if (n === 0) return null
  // Rows of the system: (C^T - I) pi = 0, with the last row replaced by sum(pi) = 1.
  const sys: Matrix = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => c[j][i] - (i === j ? 1 : 0)),
  )
  const b = new Array<number>(n).fill(0)
  sys[n - 1] = new Array<number>(n).fill(1)
  b[n - 1] = 1
  const sol = solveLinear(sys, b)
  if (sol === null) return null

  const clipped = sol.map((v) => (v > 0 ? v : 0))
  const z = clipped.reduce((s, v) => s + v, 0)
  if (!(z > 0)) return null
  const pi = clipped.map((v) => v / z)

  let residual = 0
  for (let j = 0; j < n; j++) {
    let s = 0
    for (let i = 0; i < n; i++) s += pi[i] * c[i][j]
    residual = Math.max(residual, Math.abs(s - pi[j]))
  }
  return { pi, residual }
}

/** Competition ranking (1, 2, 2, 4) with a relative tie tolerance. See `AlphaRankResult.ranks`. */
function competitionRanks(scores: readonly number[], relTol = 1e-6): number[] {
  const order = scores.map((v, i) => ({ v, i })).sort((x, y) => y.v - x.v || x.i - y.i)
  const ranks = new Array<number>(scores.length).fill(0)
  let currentRank = 0
  let previous = Number.NaN
  order.forEach((o, k) => {
    const tied = Number.isFinite(previous) && Math.abs(previous - o.v) <= relTol * Math.max(Math.abs(previous), Math.abs(o.v))
    if (!tied) currentRank = k + 1
    ranks[o.i] = currentRank
    previous = o.v
  })
  return ranks
}

/**
 * alpha-Rank of a symmetric payoff matrix (diagonal included — see the file header).
 *
 * @param payoff `M[i][j]` — the payoff to a player of style *i* against style *j*. For this lab
 *               that is the score rate `P`, whose diagonal is 0.5.
 */
export function alphaRank(payoff: Matrix, opts: AlphaRankOptions = {}): AlphaRankResult {
  const n = payoff.length
  const popSize = opts.populationSize ?? 50
  const epsilon = opts.irreducibilityEpsilon ?? 1e-10
  const stableTol = opts.stableTol ?? 1e-6
  const minAlphaForStop = opts.minAlphaForStop ?? 10

  const degenerate = (scores: number[], alpha: number, residual: number, converged: boolean): AlphaRankResult => ({
    scores,
    ranks: competitionRanks(scores),
    alpha,
    populationSize: popSize,
    residual,
    converged,
    sweep: [],
    concentrated: scores.some((v) => v > 1 - 1e-6),
  })
  if (n === 0) return degenerate([], opts.alpha ?? 0, 0, true)
  if (n === 1) return degenerate([1], opts.alpha ?? 0, 0, true)

  const at = (alpha: number): { pi: number[]; residual: number } | null =>
    stationaryDistribution(transitionMatrix(payoff, popSize, alpha, epsilon))

  const trace: { alpha: number; scores: number[] }[] = []
  const finish = (pi: number[], alpha: number, residual: number): AlphaRankResult => ({
    scores: pi,
    ranks: competitionRanks(pi),
    alpha,
    populationSize: popSize,
    residual,
    converged: residual < 1e-8,
    sweep: trace,
    concentrated: pi.some((v) => v > 1 - 1e-6),
  })

  if (opts.alpha !== undefined) {
    const r = at(opts.alpha)
    if (r === null) return degenerate(new Array<number>(n).fill(1 / n), opts.alpha, Number.POSITIVE_INFINITY, false)
    trace.push({ alpha: opts.alpha, scores: r.pi })
    return finish(r.pi, opts.alpha, r.residual)
  }

  // The infinite-alpha limit, approached from below: keep the last alpha whose solve succeeded,
  // and stop early once the distribution stops moving (never below `minAlphaForStop`).
  const sweep = opts.sweep ?? DEFAULT_SWEEP
  let best: { pi: number[]; residual: number; alpha: number } | null = null
  for (const alpha of sweep) {
    const r = at(alpha)
    if (r === null) break
    const prev = best
    best = { ...r, alpha }
    trace.push({ alpha, scores: r.pi })
    if (prev !== null && alpha >= minAlphaForStop) {
      let delta = 0
      for (let i = 0; i < n; i++) delta = Math.max(delta, Math.abs(prev.pi[i] - r.pi[i]))
      if (delta <= stableTol) break
    }
  }
  if (best === null) return degenerate(new Array<number>(n).fill(1 / n), 0, Number.POSITIVE_INFINITY, false)
  return finish(best.pi, best.alpha, best.residual)
}
