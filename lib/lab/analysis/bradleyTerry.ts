/**
 * bradleyTerry.ts — the Bradley-Terry / Elo fit of BOT_LAB.md §4.4 and §6 step 3.
 *
 * §6 is precise about this ranking's standing: *"**If transitive** (`cyclicEnergy` < 0.15): fit
 * Bradley-Terry / Elo, publish the ranking with CIs."* Bradley-Terry assumes exactly what the
 * Hodge decomposition is there to test — that a single scalar per style explains every pairing —
 * so it is always **computed** (side-by-side comparison is the point of §7.2's ranking view: the
 * disagreement between rankings is itself the finding) and never the headline when the matrix is
 * cyclic.
 *
 * ## The fit
 *
 * `P(i beats j) = p_i / (p_i + p_j)`, fitted by the standard MM algorithm (Hunter 2004):
 *
 * ```
 * p_i  <-  W_i / sum_{j != i} n_ij / (p_i + p_j)
 * ```
 *
 * where `W_i` is style *i*'s total score (score rate x games, so a paired half-point counts as a
 * half-point) and `n_ij` the games between them. The iteration is monotone in the likelihood and
 * needs no step size. The scale is fixed by normalising to geometric mean 1, i.e. `mean(theta) = 0`.
 *
 * `elo = 400 * log10(p)` is the conventional presentation, so a 400-point gap is 10:1 odds.
 *
 * ## The confidence intervals, and one deliberate conservatism
 *
 * The observed Fisher information of the BT log-likelihood in `theta = log p` is the weighted
 * graph Laplacian
 *
 * ```
 * L_ij = -n_ij * pi_ij * (1 - pi_ij)   (i != j),      L_ii = sum_{j != i} n_ij * pi_ij * (1 - pi_ij)
 * ```
 *
 * whose Moore-Penrose inverse (the model has one free constant, so `L` is singular by
 * construction with null space the all-ones vector) gives `Var(theta)`. It is computed as
 * `(L + J/n)^{-1} - J/n`, the standard identity for a Laplacian with that null space.
 *
 * The conservatism: `n_ij` counts **games**, while BOT_LAB.md §5.1's duplicate pairing means the
 * two games of a pair are not independent — the pairing *removes* variance (measured 1.34x on
 * this engine). Treating them as independent therefore **over**states the standard error, so
 * these intervals are wider than the truth rather than narrower. That is the safe direction for
 * a ranking whose whole purpose is to be doubted, and it is stated here rather than discovered.
 */
import { invert } from './linalg.ts'
import type { Matrix } from './linalg.ts'

export interface BradleyTerryResult {
  /** Log-strength per style, centred at 0. */
  theta: number[]
  /** `400 * log10(p)` — the Elo presentation of `theta`. */
  elo: number[]
  /** Standard error of each Elo, from the Fisher information. */
  eloSe: number[]
  ci95: [number, number][]
  iterations: number
  converged: boolean
  /**
   * Mean absolute deviation between the fitted `P_hat[i][j]` and the observed `P[i][j]`, over the
   * off-diagonal. This is the model's *own* report of how badly the transitivity assumption fits
   * — and it should track `cyclicEnergy`, which is the assumption-free version of the same fact.
   */
  meanAbsResidual: number
}

/**
 * Fit Bradley-Terry to a payoff matrix of score rates.
 *
 * @param p score rates, `p[i][j] + p[j][i] == 1`, diagonal ignored.
 * @param n games behind each pairing, symmetric, diagonal ignored.
 */
export function bradleyTerry(p: Matrix, n: Matrix, maxIter = 5000, tol = 1e-12): BradleyTerryResult {
  const k = p.length
  if (k === 0) {
    return { theta: [], elo: [], eloSe: [], ci95: [], iterations: 0, converged: true, meanAbsResidual: 0 }
  }

  // Total score of each style, in games.
  const wins = new Array<number>(k).fill(0)
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      if (i === j) continue
      wins[i] += p[i][j] * n[i][j]
    }
  }

  let strength = new Array<number>(k).fill(1)
  let iterations = 0
  let converged = false
  for (let it = 0; it < maxIter; it++) {
    iterations = it + 1
    const next = strength.slice()
    for (let i = 0; i < k; i++) {
      let denom = 0
      for (let j = 0; j < k; j++) {
        if (i === j) continue
        const s = strength[i] + strength[j]
        if (s > 0) denom += n[i][j] / s
      }
      // A style with no score at all (or no games) has no finite strength; hold it at a floor so
      // the iteration stays defined and the caller sees a wide interval rather than a NaN.
      next[i] = denom > 0 && wins[i] > 0 ? wins[i] / denom : 1e-9
    }
    // Normalise to geometric mean 1 so the free constant is pinned every iteration.
    let logSum = 0
    for (const v of next) logSum += Math.log(v)
    const g = Math.exp(logSum / k)
    for (let i = 0; i < k; i++) next[i] /= g

    let delta = 0
    for (let i = 0; i < k; i++) delta = Math.max(delta, Math.abs(Math.log(next[i]) - Math.log(strength[i])))
    strength = next
    if (delta < tol) {
      converged = true
      break
    }
  }

  const theta = strength.map((v) => Math.log(v))
  const eloScale = 400 / Math.LN10
  const elo = theta.map((t) => t * eloScale)

  // Fisher information (a weighted Laplacian) -> Moore-Penrose inverse -> SEs.
  const j: Matrix = Array.from({ length: k }, () => new Array<number>(k).fill(0))
  for (let i = 0; i < k; i++) {
    for (let m = 0; m < k; m++) {
      if (i === m) continue
      const pi = strength[i] / (strength[i] + strength[m])
      const w = n[i][m] * pi * (1 - pi)
      j[i][m] -= w
      j[i][i] += w
    }
  }
  const jj: Matrix = Array.from({ length: k }, (_, r) => Array.from({ length: k }, (_, c) => j[r][c] + 1 / k))
  const inv = invert(jj)
  const eloSe = new Array<number>(k).fill(0)
  if (inv !== null) {
    for (let i = 0; i < k; i++) {
      const v = inv[i][i] - 1 / k
      eloSe[i] = v > 0 ? Math.sqrt(v) * eloScale : 0
    }
  }
  const ci95: [number, number][] = elo.map((e, i) => [e - 1.959963984540054 * eloSe[i], e + 1.959963984540054 * eloSe[i]])

  let resid = 0
  let count = 0
  for (let i = 0; i < k; i++) {
    for (let m = 0; m < k; m++) {
      if (i === m) continue
      const fitted = strength[i] / (strength[i] + strength[m])
      resid += Math.abs(fitted - p[i][m])
      count++
    }
  }

  return {
    theta,
    elo,
    eloSe,
    ci95,
    iterations,
    converged,
    meanAbsResidual: count === 0 ? 0 : resid / count,
  }
}
