/**
 * stats.ts — the inference layer: normal CIs, Benjamini-Hochberg FDR control, percentile
 * bootstrap helpers, and the SPRT used to gate the exploitability search.
 *
 * ## Why BH is a gate and not a column
 *
 * BOT_LAB.md §5.6 and §10.7: 36 simultaneous cells at alpha 0.05 produce **~1.8 cells that look
 * significant by chance**. The counter-graph is built from "i beats j significantly" edges, so an
 * uncorrected matrix would draw roughly two edges that are not there — and two spurious edges are
 * exactly how a spurious 3-cycle appears. `benjaminiHochberg` therefore returns the q-values and
 * the reject flags together, and nothing downstream is allowed to look at a raw p-value.
 *
 * ## Why the SPRT is here and not in the runner
 *
 * BOT_LAB.md §5.5 splits the two jobs cleanly: **fixed-N for reporting** (the payoff matrix's job
 * is to *estimate* payoffs, and sequential stopping biases effect sizes), **SPRT for tuning**
 * (the exploitability search of §5.7 runs ~60 candidates per style and cannot afford fixed-N on
 * each). So the matrix never touches this code, and the best-response search never uses anything
 * else — and the search's final `E(i)` is re-measured at fixed N on a *fresh* seed block, because
 * the number that stopped the SPRT is a biased estimate of the effect that stopped it.
 */

/** Chebyshev coefficients for `erfc`, Numerical Recipes 3rd ed. §6.2 (`erfccheb`). */
const ERFC_COF = [
  -1.3026537197817094, 0.6419697923564902, 0.019476473204185836, -0.00956151478680863,
  -0.000946595344482036, 0.000366839497852761, 0.000042523324806907, -0.000020278578112534,
  -0.000001624290004647, 0.00000130365583558, 1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9,
  5.059343495e-9, -9.91364156e-10, -2.27365122e-10, 9.6467911e-11, 2.394038e-12, -6.886027e-12,
  8.94487e-13, 3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15, -1.523e-15, -9.4e-17, 1.21e-16,
  -2.8e-17,
] as const

function erfcNonNegative(z: number): number {
  const t = 2 / (2 + z)
  const ty = 4 * t - 2
  let d = 0
  let dd = 0
  for (let j = ERFC_COF.length - 1; j > 0; j--) {
    const tmp = d
    d = ty * d - dd + ERFC_COF[j]
    dd = tmp
  }
  return t * Math.exp(-z * z + 0.5 * (ERFC_COF[0] + ty * d) - dd)
}

/** Complementary error function, accurate to near machine precision across the real line. */
export function erfc(x: number): number {
  return x >= 0 ? erfcNonNegative(x) : 2 - erfcNonNegative(-x)
}

/** Standard normal CDF. */
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2)
}

/** Two-sided p-value for a z statistic. */
export function twoSidedP(z: number): number {
  return erfc(Math.abs(z) / Math.SQRT2)
}

/**
 * Two-sided p-value for `H0: score == null0`, given the score's standard error.
 *
 * A zero SE is not an error and not a `NaN`: it means every paired observation was identical, so
 * either the score *is* the null (p = 1) or it provably is not (p = 0). The lab produces exactly
 * this case — `balanced-vs-hoarder` measured `se` 0.0000 at `aScore` 0.5000 because Hoarder plays
 * byte-identically to Balanced, and a `NaN` there would have propagated into BH and silently
 * corrupted all 36 q-values.
 */
export function scoreP(score: number, se: number, null0 = 0.5): number {
  if (!(se > 0)) return score === null0 ? 1 : 0
  return twoSidedP((score - null0) / se)
}

/** Normal-approximation two-sided CI. BOT_LAB.md §5.6: safe at the sample sizes used here. */
export function normalCi95(mean: number, se: number): [number, number] {
  return [mean - 1.959963984540054 * se, mean + 1.959963984540054 * se]
}

export interface BhResult {
  /** BH-adjusted q-values, in the input order. */
  q: number[]
  /** `q[i] <= alpha`, in the input order. */
  significant: boolean[]
  alpha: number
  /** How many hypotheses were rejected. */
  rejected: number
}

/**
 * Benjamini-Hochberg step-up FDR control.
 *
 * Adjusted values are the standard monotone form: sort ascending, compute `p_(k) * m / k`, then
 * sweep from the largest downward taking a running minimum so the q-values are non-decreasing in
 * p. Every value is clamped into `[0, 1]`.
 */
export function benjaminiHochberg(pvalues: readonly number[], alpha = 0.05): BhResult {
  const m = pvalues.length
  const q = new Array<number>(m).fill(1)
  if (m === 0) return { q, significant: [], alpha, rejected: 0 }

  const order = pvalues.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p || x.i - y.i)
  let running = Number.POSITIVE_INFINITY
  for (let k = m; k >= 1; k--) {
    const { p, i } = order[k - 1]
    running = Math.min(running, (p * m) / k)
    q[i] = Math.min(1, Math.max(0, running))
  }
  const significant = q.map((v) => v <= alpha)
  return { q, significant, alpha, rejected: significant.filter(Boolean).length }
}

/** Sample mean. Zero for an empty sample. */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

/** Sample variance (n-1). Zero for fewer than two observations. */
export function variance(xs: readonly number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  let ss = 0
  for (const x of xs) ss += (x - m) * (x - m)
  return ss / (xs.length - 1)
}

/**
 * Percentile of an **already sorted** ascending sample, by linear interpolation between order
 * statistics (the type-7 / R `quantile()` default).
 */
export function percentileSorted(sorted: readonly number[], p: number): number {
  const n = sorted.length
  if (n === 0) return 0
  if (n === 1) return sorted[0]
  const h = (n - 1) * Math.min(1, Math.max(0, p))
  const lo = Math.floor(h)
  const hi = Math.ceil(h)
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}

/** A percentile bootstrap interval plus the resampling spread it came from. */
export interface BootstrapCi {
  /** The point estimate on the full sample — never the bootstrap mean. */
  estimate: number
  ci95: [number, number]
  /** Standard deviation of the bootstrap replicates: the bootstrap SE. */
  se: number
  samples: number
}

/** Fold a finished set of bootstrap replicates into a percentile interval. */
export function bootstrapCi(estimate: number, replicates: number[], samples: number): BootstrapCi {
  if (replicates.length === 0) return { estimate, ci95: [estimate, estimate], se: 0, samples }
  const sorted = replicates.slice().sort((a, b) => a - b)
  return {
    estimate,
    ci95: [percentileSorted(sorted, 0.025), percentileSorted(sorted, 0.975)],
    se: Math.sqrt(variance(sorted)),
    samples,
  }
}

// --- SPRT (BOT_LAB.md §5.5) -------------------------------------------------------------------

export type SprtVerdict = 'h1' | 'h0' | 'continue'

export interface SprtBounds {
  alpha: number
  beta: number
  /** `log((1 - beta) / alpha)` — cross upward and H1 is accepted. */
  upper: number
  /** `log(beta / (1 - alpha))` — cross downward and H0 is accepted. */
  lower: number
}

export function sprtBounds(alpha = 0.05, beta = 0.05): SprtBounds {
  return {
    alpha,
    beta,
    upper: Math.log((1 - beta) / alpha),
    lower: Math.log(beta / (1 - alpha)),
  }
}

/**
 * Generalised log-likelihood ratio for `H0: mu == mu0` against `H1: mu == mu1` on a bounded
 * score, using the normal approximation fishtest uses:
 *
 * ```
 * LLR ~ n * (mu1 - mu0) * (xbar - (mu0 + mu1) / 2) / var
 * ```
 *
 * The variance is *estimated from the sample*, which is what makes this usable on a paired score
 * difference whose spread is not known in advance.
 *
 * **The zero-variance case is load-bearing, not an edge case.** The lab measured twelve
 * `StyleParams` fields that change nothing at all: a candidate carrying one of them plays a
 * byte-identical game to the incumbent, every paired difference is exactly 0, and the sample
 * variance is exactly 0. Flooring the variance at `varFloor` turns that into a large negative
 * LLR — H0 accepted at the minimum sample size — which is precisely the right answer and is what
 * keeps an inert knob from consuming its whole `maxPairs` budget.
 */
export function sprtLlr(
  n: number,
  sampleMean: number,
  sampleVariance: number,
  mu0: number,
  mu1: number,
  varFloor = 1e-9,
): number {
  if (n <= 0) return 0
  const v = Math.max(sampleVariance, varFloor)
  return (n * (mu1 - mu0) * (sampleMean - (mu0 + mu1) / 2)) / v
}

export function sprtVerdict(llr: number, bounds: SprtBounds): SprtVerdict {
  if (llr >= bounds.upper) return 'h1'
  if (llr <= bounds.lower) return 'h0'
  return 'continue'
}
