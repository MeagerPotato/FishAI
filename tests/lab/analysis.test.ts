/**
 * analysis.test.ts — the BOT_LAB.md §6 analysis pipeline.
 *
 * The runner's tests assert its *controls*; these assert its **math**. That distinction is the
 * whole reason this file is long: a wrong payoff matrix shows up as a strange number, but a wrong
 * Nash averaging or a wrong alpha-Rank produces a plausible-looking distribution over nine styles
 * that no human can check by eye. So every one of them is pinned against a fixture whose answer
 * is known before the code runs:
 *
 * - **rock-paper-scissors** — cyclicEnergy must be exactly 1, Nash must be uniform 1/3, alpha-Rank
 *   must be uniform 1/3, and the Hodge rating must be identically 0. There is no ranking of RPS,
 *   and any method that produces one is broken.
 * - **a strictly transitive population** — cyclicEnergy must be 0 (to machine precision, not
 *   "small"), Nash must collapse onto the dominant strategy, alpha-Rank must too, and
 *   Bradley-Terry must recover the generating logits *exactly* when the matrix was generated from
 *   the Bradley-Terry model.
 * - **one 3-cycle embedded in an otherwise transitive population** — exactly one cycle enumerated,
 *   naming the right three styles, with a small but strictly positive cyclic energy.
 * - **rock-paper-scissors with a duplicated strategy** — the property Nash averaging exists for
 *   (BOT_LAB.md §1.2: *"automatically robust to you adding five near-duplicate variants of your
 *   favourite bot"*). The duplicate must split one weight, giving (1/6, 1/6, 1/3, 1/3). This is
 *   not academic here: the lab's own pilot found Hoarder plays byte-identically to Balanced, so
 *   the shipped roster already contains a literal duplicate.
 *
 * Plus the NIST SHA-256 vectors, the textbook Benjamini-Hochberg worked example, and the two
 * degenerate cases the real data actually produces (a cell with zero SE, and a candidate whose
 * paired difference has zero variance).
 */
import { describe, expect, it } from 'vitest'
import {
  alphaRank,
  analyze,
  benjaminiHochberg,
  bootstrapCell,
  bradleyTerry,
  antisymmetryErrorOf,
  buildPayoff,
  buildStyleResults,
  DEFAULT_EXPLOIT_CONFIG,
  decideVerdict,
  findCycles,
  hodgeDecompose,
  invert,
  KNOB_LADDER,
  maximins,
  maxentNash,
  meanScores,
  normalCdf,
  normalCi95,
  percentileSorted,
  playPairs,
  renderAnalysis,
  rulesHash,
  scoreP,
  searchBestResponse,
  searchExploitability,
  sha256,
  solveLinear,
  sprtBounds,
  sprtLlr,
  sprtVerdict,
  twoSidedP,
} from '../../lib/lab/analysis/index.ts'
import type { AnalyzeInput, Matrix } from '../../lib/lab/analysis/index.ts'
import { DEFAULT_LAB_CONFIG, runLab, runTask } from '../../lib/lab/index.ts'
import type { LabRunConfig, LabTask } from '../../lib/lab/index.ts'
import { STYLE_ROSTER, validateStyle } from '../../lib/engine/index.ts'
import type { StyleId } from '../../lib/engine/index.ts'

// --- fixtures with known answers ---------------------------------------------------------------

/** `A = P - P^T` for a payoff matrix satisfying `P[i][j] + P[j][i] = 1`. */
function anti(p: Matrix): Matrix {
  return p.map((row, i) => row.map((v, j) => v - p[j][i]))
}

/** Rock beats scissors, scissors beats paper, paper beats rock. No ranking exists. */
const RPS: Matrix = [
  [0.5, 0, 1],
  [1, 0.5, 0],
  [0, 1, 0.5],
]

/** Rock duplicated. The Nash set is `{R1 + R2 = 1/3, P = 1/3, S = 1/3}`; maxent picks the middle. */
const RPS_DUP: Matrix = [
  [0.5, 0.5, 0, 1],
  [0.5, 0.5, 0, 1],
  [1, 1, 0.5, 0],
  [0, 0, 1, 0.5],
]

/** A strictly transitive population: `P[i][j] = 0.5 + (r_i - r_j) / 2` with `r` strictly ordered. */
const TRANSITIVE_R = [0.3, 0.1, -0.1, -0.3]
const TRANSITIVE: Matrix = TRANSITIVE_R.map((ri, i) =>
  TRANSITIVE_R.map((rj, j) => (i === j ? 0.5 : 0.5 + (ri - rj) / 2)),
)

/**
 * One 3-cycle (`s1 > s2 > s3 > s1`) inside an otherwise transitive five-style population, with
 * `s0` dominating everything and `s4` losing to everything.
 */
const CYCLE_STYLES = ['s0', 's1', 's2', 's3', 's4'] as unknown as StyleId[]
const CYCLE_MATRIX: Matrix = (() => {
  const r = [0.4, 0.1, 0.05, 0.0, -0.55]
  const p = r.map((ri, i) => r.map((rj, j) => (i === j ? 0.5 : 0.5 + (ri - rj) / 2)))
  // s3 beats s1, which the ratings alone would forbid — this is the single injected cycle.
  p[3][1] = 0.58
  p[1][3] = 0.42
  return p
})()

const ALL_TRUE = (n: number): boolean[][] => Array.from({ length: n }, () => new Array<boolean>(n).fill(true))
const ALL_Q = (n: number, v: number): Matrix => Array.from({ length: n }, () => new Array<number>(n).fill(v))

// --- linear algebra ----------------------------------------------------------------------------

describe('linalg', () => {
  it('solves a system whose answer is known by hand', () => {
    // 2x + y = 5, x - 3y = -8  =>  x = 1, y = 3
    const x = solveLinear(
      [
        [2, 1],
        [1, -3],
      ],
      [5, -8],
    )
    expect(x).not.toBeNull()
    expect((x as number[])[0]).toBeCloseTo(1, 12)
    expect((x as number[])[1]).toBeCloseTo(3, 12)
  })

  it('returns null for a singular system rather than a vector of NaNs', () => {
    expect(
      solveLinear(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toBeNull()
  })

  it('inverts, and the inverse round-trips to the identity', () => {
    const a: Matrix = [
      [4, 7, 2],
      [3, 6, 1],
      [2, 5, 3],
    ]
    const inv = invert(a)
    expect(inv).not.toBeNull()
    const id = a.map((row) => row.map((_, j) => row.reduce((s, v, k) => s + v * (inv as Matrix)[k][j], 0)))
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) expect(id[i][j]).toBeCloseTo(i === j ? 1 : 0, 10)
    }
  })
})

// --- stats -------------------------------------------------------------------------------------

describe('stats — the inference layer', () => {
  it('normalCdf matches published values of the standard normal', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 12)
    expect(normalCdf(1)).toBeCloseTo(0.8413447460685429, 12)
    expect(normalCdf(1.959963984540054)).toBeCloseTo(0.975, 12)
    expect(normalCdf(-1.959963984540054)).toBeCloseTo(0.025, 12)
    expect(normalCdf(-3)).toBeCloseTo(0.0013498980316301, 12)
    expect(normalCdf(5)).toBeCloseTo(0.9999997133484281, 12)
  })

  it('twoSidedP is the two-tailed area, and is symmetric in the sign of z', () => {
    expect(twoSidedP(1.959963984540054)).toBeCloseTo(0.05, 12)
    expect(twoSidedP(-1.959963984540054)).toBeCloseTo(0.05, 12)
    expect(twoSidedP(0)).toBeCloseTo(1, 12)
  })

  it('a zero SE is a decision, not a NaN — the pilot produced exactly this cell', () => {
    // balanced-vs-hoarder measured aScore 0.5000 with se 0.0000, because Hoarder plays
    // byte-identically to Balanced. A NaN here would have corrupted all 36 BH q-values.
    expect(scoreP(0.5, 0)).toBe(1)
    expect(scoreP(0.6, 0)).toBe(0)
    expect(Number.isNaN(scoreP(0.5, 0))).toBe(false)
  })

  it('Benjamini-Hochberg reproduces the textbook worked example', () => {
    // The canonical BH(1995) illustration.
    const p = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216]
    const bh = benjaminiHochberg(p, 0.05)
    expect(bh.q[0]).toBeCloseTo(0.01, 12)
    expect(bh.q[1]).toBeCloseTo(0.04, 12)
    expect(bh.q[2]).toBeCloseTo(0.084, 12)
    expect(bh.q[3]).toBeCloseTo(0.084, 12)
    expect(bh.q[4]).toBeCloseTo(0.084, 12)
    expect(bh.rejected).toBe(2)
    expect(bh.significant).toEqual([true, true, false, false, false, false, false, false, false, false])
  })

  it('BH q-values are monotone in p, clamped to [0,1], and never reject more than uncorrected', () => {
    const p = [0.6, 0.01, 0.3, 0.9, 0.001, 0.049, 0.05, 0.2]
    const bh = benjaminiHochberg(p, 0.05)
    const order = p.map((_, i) => i).sort((a, b) => p[a] - p[b])
    for (let k = 1; k < order.length; k++) {
      expect(bh.q[order[k]]).toBeGreaterThanOrEqual(bh.q[order[k - 1]] - 1e-15)
    }
    for (const q of bh.q) {
      expect(q).toBeGreaterThanOrEqual(0)
      expect(q).toBeLessThanOrEqual(1)
    }
    // BH is a step-up procedure over the same p-values: it can never be more permissive.
    expect(bh.rejected).toBeLessThanOrEqual(p.filter((v) => v <= 0.05).length)
    // ...and it IS less permissive here — which is the entire point of running it.
    expect(bh.rejected).toBeLessThan(p.filter((v) => v <= 0.05).length)
  })

  it('BH with 36 nulls at alpha 0.05 rejects nothing, which uncorrected testing would not', () => {
    // 36 cells, all true nulls, p-values spread uniformly. Uncorrected, ~1.8 look significant.
    const p = Array.from({ length: 36 }, (_, i) => (i + 0.5) / 36)
    const bh = benjaminiHochberg(p, 0.05)
    expect(bh.rejected).toBe(0)
    expect(p.filter((v) => v <= 0.05).length).toBeGreaterThan(0)
  })

  it('percentileSorted interpolates like the standard type-7 quantile', () => {
    const xs = [1, 2, 3, 4]
    expect(percentileSorted(xs, 0)).toBe(1)
    expect(percentileSorted(xs, 1)).toBe(4)
    expect(percentileSorted(xs, 0.5)).toBeCloseTo(2.5, 12)
    expect(percentileSorted(xs, 0.25)).toBeCloseTo(1.75, 12)
  })

  it('normalCi95 is the mean plus/minus 1.96 SE', () => {
    const [lo, hi] = normalCi95(0.6, 0.01)
    expect(lo).toBeCloseTo(0.6 - 0.0195996, 6)
    expect(hi).toBeCloseTo(0.6 + 0.0195996, 6)
  })

  it('SPRT crosses the right bound for the right evidence', () => {
    const b = sprtBounds(0.05, 0.05)
    expect(b.upper).toBeCloseTo(Math.log(0.95 / 0.05), 12)
    expect(b.lower).toBeCloseTo(Math.log(0.05 / 0.95), 12)
    // Strong evidence for H1 (mean well above the midpoint of H0/H1).
    expect(sprtVerdict(sprtLlr(200, 0.05, 0.01, 0, 0.02), b)).toBe('h1')
    // Strong evidence for H0.
    expect(sprtVerdict(sprtLlr(200, -0.05, 0.01, 0, 0.02), b)).toBe('h0')
    expect(sprtVerdict(sprtLlr(4, 0.005, 0.01, 0, 0.02), b)).toBe('continue')
  })

  it('an inert knob — zero paired variance — is rejected immediately, not run to maxPairs', () => {
    // A candidate that plays a byte-identical game gives every paired difference exactly 0.
    const b = sprtBounds(0.05, 0.05)
    const llr = sprtLlr(24, 0, 0, 0, 0.02)
    expect(llr).toBeLessThan(b.lower)
    expect(sprtVerdict(llr, b)).toBe('h0')
  })
})

// --- SHA-256 -----------------------------------------------------------------------------------

describe('sha256 — meta.rulesHash', () => {
  it('matches the NIST test vectors', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  it('hashes a multi-block message (crosses the 64-byte boundary correctly)', () => {
    expect(sha256('a'.repeat(1000000).slice(0, 1000))).toHaveLength(64)
    expect(sha256('a'.repeat(64))).toBe('ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb')
  })

  it('rulesHash is line-ending independent, so Windows and CI agree', () => {
    const unix = '# RULES\n\nrow 1\nrow 2\n'
    const windows = '# RULES\r\n\r\nrow 1\r\nrow 2\r\n'
    expect(rulesHash(unix)).toBe(rulesHash(windows))
    expect(rulesHash(unix)).toBe(rulesHash(`${unix}\n\n`))
    expect(rulesHash(unix)).not.toBe(rulesHash('# RULES\n\nrow 1\nrow 3\n'))
  })
})

// --- the payoff matrix -------------------------------------------------------------------------

describe('matrix — antisymmetry is asserted, not assumed', () => {
  const cells = [
    { index: 0, id: 'x-vs-y', a: 'x' as StyleId, b: 'y' as StyleId, aScore: 0.6, se: 0.01, games: 400 },
    { index: 1, id: 'x-vs-z', a: 'x' as StyleId, b: 'z' as StyleId, aScore: 0.7, se: 0.02, games: 400 },
    { index: 2, id: 'y-vs-z', a: 'y' as StyleId, b: 'z' as StyleId, aScore: 0.55, se: 0.03, games: 400 },
  ]
  const styles = ['x', 'y', 'z'] as unknown as StyleId[]
  // Only the fields buildPayoff reads; the rest of LabCellAggregate is irrelevant here.
  const asCells = cells as unknown as Parameters<typeof buildPayoff>[1]

  it('builds P with a 0.5 diagonal and exact antisymmetry', () => {
    const m = buildPayoff(styles, asCells)
    expect(m.p[0][0]).toBe(0.5)
    expect(m.p[0][1]).toBe(0.6)
    expect(m.p[1][0]).toBeCloseTo(0.4, 15)
    expect(m.antisymmetryError).toBeLessThan(1e-12)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) expect(m.p[i][j] + m.p[j][i]).toBeCloseTo(1, 12)
    }
    // A = P - P^T is exactly antisymmetric with a zero diagonal.
    for (let i = 0; i < 3; i++) {
      expect(m.a[i][i]).toBe(0)
      for (let j = 0; j < 3; j++) expect(m.a[i][j]).toBeCloseTo(-m.a[j][i], 15)
    }
  })

  it('throws on an incomplete matrix — a hole is not a zero', () => {
    expect(() => buildPayoff(styles, [cells[0]] as unknown as Parameters<typeof buildPayoff>[1])).toThrow(
      /unmeasured pairing/,
    )
  })

  it('throws when two cells disagree about the same pairing', () => {
    const broken = [...cells, { index: 3, id: 'x-vs-y-again', a: 'x' as StyleId, b: 'y' as StyleId, aScore: 0.9, se: 0, games: 1 }]
    expect(() => buildPayoff(styles, broken as unknown as Parameters<typeof buildPayoff>[1])).toThrow(
      /measured twice with different results/,
    )
  })

  it('the antisymmetry guard itself fires on a matrix that violates it', () => {
    // `buildPayoff` mirrors every cell, so it cannot construct a violation — the guard exists for
    // a future change that stops mirroring. Test the measurement directly so it is not dead code.
    expect(
      antisymmetryErrorOf([
        [0.5, 0.6],
        [0.3, 0.5],
      ]),
    ).toBeCloseTo(0.1, 15)
    expect(
      antisymmetryErrorOf([
        [0.5, 0.6],
        [0.4, 0.5],
      ]),
    ).toBeLessThan(1e-15)
  })

  it('mean score and maximin exclude the diagonal — otherwise maximin > 0.5 is unsatisfiable', () => {
    const m = buildPayoff(styles, asCells)
    expect(meanScores(m)[0]).toBeCloseTo((0.6 + 0.7) / 2, 12)
    const mm = maximins(m)
    expect(mm[0].value).toBeCloseTo(0.6, 12)
    expect(mm[0].worstVs).toBe('y')
    // With the diagonal included every maximin would be capped at 0.5.
    expect(mm[0].value).toBeGreaterThan(0.5)
  })
})

// --- the transitivity test ---------------------------------------------------------------------

describe('hodge — the transitivity test (BOT_LAB.md §4.4)', () => {
  it('rock-paper-scissors is 100% cyclic and has no ratings at all', () => {
    const h = hodgeDecompose(anti(RPS))
    expect(h.cyclicEnergy).toBeCloseTo(1, 12)
    expect(h.transitiveEnergy).toBeCloseTo(0, 12)
    for (const r of h.ratings) expect(Math.abs(r)).toBeLessThan(1e-15)
    expect(h.orthogonalityError).toBeLessThan(1e-12)
  })

  it('a strictly transitive matrix is 0% cyclic, and the rating IS the generator', () => {
    const h = hodgeDecompose(anti(TRANSITIVE))
    expect(h.cyclicEnergy).toBeLessThan(1e-24)
    // A = grad(r) with A_ij = r_i - r_j, so the recovered rating is the generating r.
    TRANSITIVE_R.forEach((r, i) => expect(h.ratings[i]).toBeCloseTo(r, 12))
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) expect(h.cyclic[i][j]).toBeCloseTo(0, 12)
    }
  })

  it('the split is orthogonal, so the two energies add to the total', () => {
    for (const p of [RPS, TRANSITIVE, CYCLE_MATRIX, RPS_DUP]) {
      const h = hodgeDecompose(anti(p))
      const cyclicAbs = h.cyclic.reduce((s, row) => s + row.reduce((t, v) => t + v * v, 0), 0)
      expect(h.transitiveEnergy + cyclicAbs).toBeCloseTo(h.totalEnergy, 10)
      expect(h.orthogonalityError).toBeLessThan(1e-12)
      expect(h.cyclicEnergy).toBeGreaterThanOrEqual(0)
      expect(h.cyclicEnergy).toBeLessThanOrEqual(1 + 1e-12)
    }
  })

  it('one cycle embedded in a transitive population: small energy, exactly one cycle, named right', () => {
    const h = hodgeDecompose(anti(CYCLE_MATRIX))
    expect(h.cyclicEnergy).toBeGreaterThan(0)
    expect(h.cyclicEnergy).toBeLessThan(0.15)
    const cycles = findCycles(CYCLE_STYLES, CYCLE_MATRIX, ALL_TRUE(5), ALL_Q(5, 0.001))
    expect(cycles).toHaveLength(1)
    expect([...cycles[0].styles].sort()).toEqual(['s1', 's2', 's3'])
    expect(cycles[0].significant).toBe(true)
    expect(cycles[0].minEdge).toBeCloseTo(0.525, 12)
  })

  it('a transitive matrix has no 3-cycles and RPS has exactly one', () => {
    expect(findCycles(['a', 'b', 'c', 'd'] as unknown as StyleId[], TRANSITIVE, ALL_TRUE(4), ALL_Q(4, 0))).toHaveLength(0)
    const rpsCycles = findCycles(['r', 'p', 's'] as unknown as StyleId[], RPS, ALL_TRUE(3), ALL_Q(3, 0))
    expect(rpsCycles).toHaveLength(1)
    expect(rpsCycles[0].minEdge).toBe(1)
  })

  it('BH gates the cycle: the same cycle is enumerated but not significant when q > alpha', () => {
    const cycles = findCycles(CYCLE_STYLES, CYCLE_MATRIX, Array.from({ length: 5 }, () => new Array<boolean>(5).fill(false)), ALL_Q(5, 0.4))
    expect(cycles).toHaveLength(1)
    expect(cycles[0].significant).toBe(false)
    expect(cycles[0].maxQ).toBeCloseTo(0.4, 12)
  })
})

// --- Nash averaging ----------------------------------------------------------------------------

describe('nash — maximum-entropy Nash averaging', () => {
  it('rock-paper-scissors is uniform 1/3, exactly', () => {
    const n = maxentNash(anti(RPS))
    for (const w of n.weights) expect(w).toBeCloseTo(1 / 3, 12)
    expect(n.residual).toBeLessThanOrEqual(1e-9)
    expect(n.converged).toBe(true)
    expect(n.entropy).toBeCloseTo(Math.log(3), 12)
  })

  it('a strictly transitive matrix concentrates on the dominant strategy', () => {
    const n = maxentNash(anti(TRANSITIVE))
    expect(n.weights[0]).toBeGreaterThan(1 - 1e-9)
    for (let i = 1; i < 4; i++) expect(n.weights[i]).toBeLessThan(1e-9)
    expect(n.converged).toBe(true)
  })

  it('a duplicated strategy SPLITS one weight — the property Nash averaging exists for', () => {
    const n = maxentNash(anti(RPS_DUP))
    expect(n.weights[0]).toBeCloseTo(1 / 6, 6)
    expect(n.weights[1]).toBeCloseTo(1 / 6, 6)
    expect(n.weights[0] + n.weights[1]).toBeCloseTo(1 / 3, 6)
    expect(n.weights[2]).toBeCloseTo(1 / 3, 6)
    expect(n.weights[3]).toBeCloseTo(1 / 3, 6)
    // Mean score would instead have rewarded the duplicate: the two rocks each average 0.5 while
    // the honest 3-strategy game averages 0.5 too, so a mean-score table cannot see the padding.
    expect(n.residual).toBeLessThanOrEqual(1e-6)
  })

  it('always returns a probability vector and a non-positive best deviation', () => {
    for (const p of [RPS, TRANSITIVE, CYCLE_MATRIX, RPS_DUP]) {
      const n = maxentNash(anti(p))
      expect(n.weights.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12)
      for (const w of n.weights) expect(w).toBeGreaterThanOrEqual(0)
      expect(n.residual).toBeLessThanOrEqual(1e-6)
    }
  })
})

// --- alpha-Rank --------------------------------------------------------------------------------

describe('alphaRank — evolutionary ranking', () => {
  it('rock-paper-scissors is uniform 1/3', () => {
    const a = alphaRank(RPS)
    for (const s of a.scores) expect(s).toBeCloseTo(1 / 3, 9)
    expect(a.residual).toBeLessThan(1e-9)
    expect(a.converged).toBe(true)
  })

  it('a strictly transitive matrix concentrates on the dominant strategy and orders the rest', () => {
    const a = alphaRank(TRANSITIVE)
    expect(a.scores[0]).toBeGreaterThan(0.99)
    expect(a.ranks[0]).toBe(1)
    expect(a.scores[0]).toBeGreaterThan(a.scores[1])
  })

  it('scores are a distribution and ranks are a valid competition ranking', () => {
    for (const p of [RPS, TRANSITIVE, CYCLE_MATRIX, RPS_DUP]) {
      const a = alphaRank(p)
      expect(a.scores.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 10)
      expect(Math.min(...a.ranks)).toBe(1)
      for (const r of a.ranks) {
        expect(r).toBeGreaterThanOrEqual(1)
        expect(r).toBeLessThanOrEqual(a.scores.length)
      }
      // Rank order must agree with score order.
      const byScore = a.scores.map((_, i) => i).sort((x, y) => a.scores[y] - a.scores[x])
      for (let k = 1; k < byScore.length; k++) {
        expect(a.ranks[byScore[k]]).toBeGreaterThanOrEqual(a.ranks[byScore[k - 1]])
      }
    }
  })

  it('two identical strategies tie rather than being ordered by floating-point noise', () => {
    // RPS_DUP's two rocks are the same strategy. Their alpha-Rank scores are equal in exact
    // arithmetic and differ in the last digits in floating point; the tie tolerance must absorb it.
    const a = alphaRank(RPS_DUP)
    expect(a.ranks[0]).toBe(a.ranks[1])
    expect(a.scores[0]).toBeCloseTo(a.scores[1], 9)
  })

  it('flags concentration, and does not flag it for a matrix with no sink', () => {
    expect(alphaRank(TRANSITIVE).concentrated).toBe(true)
    expect(alphaRank(RPS).concentrated).toBe(false)
    expect(alphaRank(RPS).sweep.length).toBeGreaterThan(1)
  })

  it('the sweep reaches a selective intensity rather than stopping at the first flat step', () => {
    // RPS is uniform at every alpha, so a naive stability rule would stop at the second point.
    expect(alphaRank(RPS).alpha).toBeGreaterThanOrEqual(10)
  })
})

// --- Bradley-Terry -----------------------------------------------------------------------------

describe('bradleyTerry', () => {
  it('recovers the generating logits exactly from a Bradley-Terry-generated matrix', () => {
    const theta = [1.2, 0.4, -0.3, -1.3]
    const p = theta.map((a, i) => theta.map((b, j) => (i === j ? 0.5 : 1 / (1 + Math.exp(-(a - b))))))
    const n = p.map((row, i) => row.map((_, j) => (i === j ? 0 : 2000)))
    const bt = bradleyTerry(p, n)
    const centred = theta.map((t) => t - theta.reduce((s, v) => s + v, 0) / theta.length)
    centred.forEach((t, i) => expect(bt.theta[i]).toBeCloseTo(t, 8))
    expect(bt.meanAbsResidual).toBeLessThan(1e-9)
    expect(bt.converged).toBe(true)
    // 400 * log10(p) — a 400-point Elo gap is 10:1 odds.
    bt.elo.forEach((e, i) => expect(e).toBeCloseTo((centred[i] * 400) / Math.LN10, 6))
    expect(bt.elo.reduce((s, v) => s + v, 0)).toBeCloseTo(0, 8)
  })

  it('reports its own misfit, and the misfit tracks cyclic energy', () => {
    const nOf = (p: Matrix): Matrix => p.map((row, i) => row.map((_, j) => (i === j ? 0 : 1000)))
    const flat = bradleyTerry(TRANSITIVE, nOf(TRANSITIVE)).meanAbsResidual
    const cyclic = bradleyTerry(RPS, nOf(RPS)).meanAbsResidual
    // BT cannot represent rock-paper-scissors at all; it can nearly represent a transitive matrix.
    expect(cyclic).toBeGreaterThan(flat)
    expect(cyclic).toBeGreaterThan(0.4)
  })

  it('produces finite positive standard errors that shrink with sample size', () => {
    const p = TRANSITIVE
    const small = bradleyTerry(p, p.map((row, i) => row.map((_, j) => (i === j ? 0 : 400))))
    const large = bradleyTerry(p, p.map((row, i) => row.map((_, j) => (i === j ? 0 : 40000))))
    for (let i = 0; i < 4; i++) {
      expect(small.eloSe[i]).toBeGreaterThan(0)
      expect(Number.isFinite(small.eloSe[i])).toBe(true)
      expect(large.eloSe[i]).toBeLessThan(small.eloSe[i])
      // SE ~ 1/sqrt(n): 100x the games is 10x the precision.
      expect(large.eloSe[i]).toBeCloseTo(small.eloSe[i] / 10, 2)
    }
  })
})

// --- the verdict -------------------------------------------------------------------------------

describe('verdict — BOT_LAB.md §4.4 decision rule', () => {
  const base = {
    candidate: 'punter' as StyleId,
    meanScore: 0.59,
    runnerUp: { style: 'blitz' as StyleId, meanScore: 0.55 },
    maximin: 0.54,
    maximinLower95: 0.51,
    maximinWorstVs: 'balanced' as StyleId,
    maximinWorstSignificant: true,
    cyclicEnergy: 0.02,
    cyclicThreshold: 0.15,
    significantCycles: 0,
    exploitability: 0.04,
    rivalExploitability: [0.05, 0.06, 0.07],
    exploitabilityMargin: 0.02,
  }

  it('all four criteria pass -> dominant', () => {
    const v = decideVerdict(base)
    expect(v.verdict).toBe('dominant')
    expect(v.criteria.every((c) => c.pass === true)).toBe(true)
  })

  it('criterion 2 is tested on the CI, so a maximin whose interval straddles 0.5 fails', () => {
    const v = decideVerdict({ ...base, maximinLower95: 0.49 })
    expect(v.criteria[1].pass).toBe(false)
    expect(v.verdict).not.toBe('dominant')
  })

  it('real cyclic energy -> cyclic, never dominant, however good the top style looks', () => {
    const v = decideVerdict({ ...base, cyclicEnergy: 0.31 })
    expect(v.criteria[2].pass).toBe(false)
    expect(v.verdict).toBe('cyclic')
    expect(v.summary).toMatch(/counter-graph/)
  })

  it('a single significant 3-cycle is enough to refuse a winner', () => {
    const v = decideVerdict({ ...base, significantCycles: 1 })
    expect(v.criteria[2].pass).toBe(false)
    expect(v.verdict).toBe('cyclic')
  })

  it('an unrun exploitability search leaves criterion 4 undetermined and blocks "dominant"', () => {
    const v = decideVerdict({ ...base, exploitability: null, rivalExploitability: [] })
    expect(v.criteria[3].pass).toBeNull()
    expect(v.verdict).toBe('inconclusive')
    expect(v.criteria[3].detail).toMatch(/did not run/)
  })

  it('a top style that is materially more exploitable than its rivals is not dominant', () => {
    const v = decideVerdict({ ...base, exploitability: 0.2, rivalExploitability: [0.02, 0.03, 0.04] })
    expect(v.criteria[3].pass).toBe(false)
    expect(v.verdict).toBe('inconclusive')
  })
})

// --- the exploitability search -----------------------------------------------------------------

describe('exploit — the best-response search (BOT_LAB.md §5.7)', () => {
  const play = { variant: 'us54' as const, stepCap: 5000, invariantCheck: 'off' as const }

  it('a mirror scores EXACTLY 0.5 per pair, which is what makes E(i) a measured gain', () => {
    const scores = playPairs(STYLE_ROSTER.balanced, STYLE_ROSTER.balanced, 'mirror-test', 0, 4, play)
    expect(scores).toEqual([0.5, 0.5, 0.5, 0.5])
  })

  it('the ladder covers every policy knob and proposes no invalid style', () => {
    const fields = new Set(KNOB_LADDER.map((k) => k.field))
    for (const f of [
      'wHit',
      'wProgress',
      'wNarrow',
      'certaintyBonus',
      'minHitP',
      'gambleBonus',
      'declareThreshold',
      'declareThresholdStalled',
      'declareMaxUncertain',
      'declareOnlyWhenCertain',
      'declareOnlyOwnHand',
      'declareEagerness',
      'foreignDeclare',
      'foreignDeclareThreshold',
      'clinchAggression',
      'denialWeight',
      'leakEpsilon',
      'leakThreshold',
      'signalling',
      'missTarget',
      'passTarget',
      'hoardBooks',
      'minHandSize',
      // The three shipped policy knobs no committed exploitability number has ever priced:
      // CONTAINMENT.md's turn-pass appetite and CONCESSION.md's two concession terms.
      'containedPass',
      'defuse',
      'conceal',
    ]) {
      expect(fields.has(f)).toBe(true)
    }
    // STYLES.md §2: certaintyBonus >= 20 in every style, or an uncertain ask outranks a certain hit.
    for (const k of KNOB_LADDER) expect(k.apply(STYLE_ROSTER.balanced).certaintyBonus).toBeGreaterThanOrEqual(20)
    // No candidate may propose a style the engine's own construction gate refuses, for ANY target
    // the search can be pointed at — `searchBestResponse` silently drops those, so an invalid rung
    // is a rung that is listed and never measured.
    for (const style of Object.values(STYLE_ROSTER)) {
      for (const k of KNOB_LADDER) expect(validateStyle(k.apply(style))).toEqual([])
    }
  })

  it('the whole ladder fits the default budget — a prefix of it is a prune nobody argued for', () => {
    // KNOB_LADDER's header refuses to prune the ladder to the knobs already known to be live,
    // because that would make the search's conclusions circular. A `candidateBudget` below the
    // ladder's length is the same prune selected by authoring order: the committed v2 artifact
    // ran at 60 against a 75-entry ladder and three of the nine styles stopped at the ceiling.
    // Budget is spent only on candidates that CHANGE the incumbent, so the guarantee this pins is
    // the sufficient one — the budget can never be the reason a rung goes unmeasured.
    expect(DEFAULT_EXPLOIT_CONFIG.candidateBudget).toBeGreaterThanOrEqual(KNOB_LADDER.length)
  })

  it('the optional `conceal` reads absent as 0, so an off style is not reported as changed', () => {
    // `conceal?: number` is the one optional field in StyleParams, and every roster vector omits
    // it. A getter of `s.conceal` would compare `undefined === 0` and call the style CHANGED —
    // spending a candidate on a move to the value it already has, playing a byte-identical game
    // for it, and banking the result as an inert knob.
    const off = KNOB_LADDER.find((k) => k.id === 'conceal=0')
    expect(off).toBeDefined()
    expect(STYLE_ROSTER.balanced.conceal).toBeUndefined()
    expect(off?.unchanged(STYLE_ROSTER.balanced)).toBe(true)
    expect(off?.unchanged({ ...STYLE_ROSTER.balanced, conceal: 0 })).toBe(true)
    expect(off?.unchanged({ ...STYLE_ROSTER.balanced, conceal: 1 })).toBe(false)
    // No roster vector carries the field, so `conceal=0` is a free skip and every other conceal
    // rung is a real move, for every target the search can be pointed at.
    for (const style of Object.values(STYLE_ROSTER)) {
      for (const k of KNOB_LADDER.filter((c) => c.field === 'conceal')) {
        expect(k.unchanged(style)).toBe(k.id === 'conceal=0')
      }
    }
  })

  it('runs a tiny search, keeps the mirror baseline, and measures E on fresh seeds', () => {
    const cfg = {
      ...DEFAULT_EXPLOIT_CONFIG,
      seedPrefix: 'test-exploit',
      evalSeedPrefix: 'test-exploit-eval',
      minPairs: 2,
      maxPairs: 4,
      blockPairs: 2,
      evalPairs: 3,
      candidateBudget: 3,
      play,
    }
    const e = searchBestResponse(STYLE_ROSTER.balanced, cfg)
    expect(e.searched).toBe(true)
    expect(e.mirrorBaselineExact).toBe(true)
    expect(e.candidatesTried).toBe(3)
    expect(e.moves).toHaveLength(3)
    expect(e.evalGames).toBe(6)
    expect(e.gap).toBeCloseTo(e.score - 0.5, 12)
    expect(Number.isFinite(e.searchScore)).toBe(true)
    // E(i) is a max over a search, so the search must report what it could have seen.
    expect(e.detectableDelta).toBeGreaterThanOrEqual(0)
    expect(e.detectableDelta > 0).toBe(e.pairedVariance > 0)
    expect(e.inertCandidates).toBeLessThanOrEqual(e.candidatesTried)
    // A knob that changed no game has exactly zero paired variance and must stop at minPairs.
    for (const m of e.moves) {
      if (m.pairedVariance === 0) {
        expect(m.pairs).toBe(cfg.minPairs)
        expect(m.verdict).toBe('h0')
      }
    }
    // Deterministic: the same config re-run gives the same answer.
    const again = searchBestResponse(STYLE_ROSTER.balanced, cfg)
    expect(again.acceptedMoves).toEqual(e.acceptedMoves)
    expect(again.score).toBe(e.score)
  })

  it('an inert knob is byte-identical to the mirror; a live one is not', () => {
    // The runner's isolation probe measured `declareOnlyWhenCertain` as changing 0 of 300 games
    // when applied alone to Balanced: at the roster's tuning every declare Balanced makes is
    // already certain, so the speculative-declare path never executes. That gives the SPRT a
    // paired difference of EXACTLY zero, which is what makes the inert half of the ladder free.
    const inert = { ...STYLE_ROSTER.balanced, declareOnlyWhenCertain: true }
    expect(playPairs(inert, STYLE_ROSTER.balanced, 'inert-probe', 0, 8, play)).toEqual(
      [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    )
    const live = { ...STYLE_ROSTER.balanced, wNarrow: 40 }
    const scores = playPairs(live, STYLE_ROSTER.balanced, 'inert-probe', 0, 8, play)
    expect(scores.some((v) => v !== 0.5)).toBe(true)
  })

  it('NEVER searches a holdout style — BOT_LAB.md §5.8', () => {
    const cfg = {
      ...DEFAULT_EXPLOIT_CONFIG,
      seedPrefix: 'test-hold',
      evalSeedPrefix: 'test-hold-eval',
      minPairs: 2,
      maxPairs: 2,
      blockPairs: 2,
      evalPairs: 1,
      candidateBudget: 1,
      play,
    }
    const out = searchExploitability(['balanced', 'turtle'] as StyleId[], cfg, ['turtle'] as StyleId[])
    const turtle = out.find((e) => e.style === 'turtle')
    expect(turtle?.searched).toBe(false)
    expect(turtle?.searchGames).toBe(0)
    expect(turtle?.skippedReason).toMatch(/holdout/)
    expect(out.find((e) => e.style === 'balanced')?.searched).toBe(true)
  })
})

// --- the bootstrap -----------------------------------------------------------------------------

describe('bootstrap over pairs (BOT_LAB.md §5.6)', () => {
  const task: LabTask = {
    index: 0,
    cell: { index: 0, id: 'balanced-vs-blitz', a: 'balanced', b: 'blitz' },
    pairFrom: 0,
    pairTo: 6,
    seedPrefix: 'boot-test',
    variant: 'us54',
    stepCap: 5000,
    invariantCheck: 'off',
  }
  const records = runTask(task).records

  it('the point estimate is the pooled ratio, not the mean of per-pair ratios', () => {
    const b = bootstrapCell('balanced-vs-blitz', records, 50, 'seed-1')
    let hits = 0
    let asks = 0
    for (const r of records) {
      hits += r.ca.hits
      asks += r.ca.asks
    }
    expect(b.a.metrics.askHitRate.estimate).toBeCloseTo(hits / asks, 15)
    expect(b.pairs).toBe(6)
  })

  it('is deterministic: the same seed gives bit-identical intervals', () => {
    const x = bootstrapCell('c', records, 40, 'seed-A')
    const y = bootstrapCell('c', records, 40, 'seed-A')
    const z = bootstrapCell('c', records, 40, 'seed-B')
    expect(y.a.metrics.claimPrecision.ci95).toEqual(x.a.metrics.claimPrecision.ci95)
    expect(y.aScore.ci95).toEqual(x.aScore.ci95)
    expect(z.a.metrics.askHitRate.ci95).not.toEqual(x.a.metrics.askHitRate.ci95)
  })

  it('every interval brackets its own point estimate and stays in range', () => {
    const b = bootstrapCell('c', records, 200, 'seed-C')
    for (const side of [b.a, b.b]) {
      for (const [name, ci] of Object.entries(side.metrics)) {
        expect(ci.ci95[0]).toBeLessThanOrEqual(ci.estimate + 1e-9)
        expect(ci.ci95[1]).toBeGreaterThanOrEqual(ci.estimate - 1e-9)
        expect(Number.isNaN(ci.estimate)).toBe(false)
        if (name.endsWith('Rate') || name === 'claimPrecision' || name === 'claimYield' || name === 'leakIndex') {
          expect(ci.estimate).toBeGreaterThanOrEqual(0)
          expect(ci.estimate).toBeLessThanOrEqual(1)
        }
      }
    }
    expect(b.aScore.ci95[0]).toBeLessThanOrEqual(b.aScore.estimate)
  })
})

// --- end to end --------------------------------------------------------------------------------

describe('analyze — the whole pipeline on real games', () => {
  const config: LabRunConfig = {
    ...DEFAULT_LAB_CONFIG,
    styles: ['balanced', 'blitz', 'turtle', 'scout'] as StyleId[],
    pairs: 3,
    chunkPairs: 3,
    seedPrefix: 'analysis-e2e',
    invariantCheck: 'off',
  }

  async function pipeline(): Promise<{ input: AnalyzeInput; analysis: ReturnType<typeof analyze> }> {
    const run = await runLab(config, 2, (t) => Promise.resolve(runTask(t)))
    const input: AnalyzeInput = {
      run,
      rulesText: '# RULES_US54.md\n\ntest fixture\n',
      rulesFile: 'RULES_US54.md',
      engineCommit: 'deadbeef',
      generatedAt: '2026-01-01T00:00:00.000Z',
      options: { bootstrapSamples: 25, bootstrapSeed: 'e2e' },
    }
    return { input, analysis: analyze(input) }
  }

  it('produces a complete antisymmetric matrix, BH q-values, and a verdict', async () => {
    const { input, analysis } = await pipeline()
    expect(analysis.cells).toHaveLength(6) // C(4,2)
    expect(analysis.payoff.antisymmetryError).toBeLessThan(1e-12)
    expect(analysis.qValues).toHaveLength(6)
    for (let k = 0; k < 6; k++) expect(analysis.qValues[k]).toBeGreaterThanOrEqual(analysis.pValues[k] - 1e-15)
    expect(['dominant', 'cyclic', 'inconclusive']).toContain(analysis.ranking.verdict)
    expect(analysis.ranking.criteria).toHaveLength(4)
    // Nothing is significant at 3 pairs, and the pipeline must say so rather than crown anyone.
    expect(analysis.ranking.verdict).not.toBe('dominant')
    expect(input.run.health.ok).toBe(true)
  })

  it('every ranking is computed, whatever the verdict — §7.2 wants them side by side', async () => {
    const { analysis } = await pipeline()
    const r = analysis.ranking
    expect(r.meanScore).toHaveLength(4)
    expect(r.maximin).toHaveLength(4)
    expect(r.bradleyTerry).toHaveLength(4)
    expect(r.nash).toHaveLength(4)
    expect(r.alphaRank).toHaveLength(4)
    expect(r.hodgeRating).toHaveLength(4)
    expect(r.nash.reduce((s, e) => s + e.weight, 0)).toBeCloseTo(1, 10)
    expect(r.alphaRank.reduce((s, e) => s + e.score, 0)).toBeCloseTo(1, 10)
    expect(analysis.nash.residual).toBeLessThanOrEqual(1e-6)
  })

  it('emits a JSON artifact with no NaN, the us54 deltas honoured, and a rules hash', async () => {
    const { input, analysis } = await pipeline()
    const results = buildStyleResults(input, analysis, rulesHash(input.rulesText))
    const json = JSON.stringify(results)
    expect(json).not.toContain('NaN')
    expect(json).not.toContain('null,null')
    // SITE_SPEC.md §5 delta 1: there is no voidRate anywhere; the metric is concedeRate.
    expect(json).not.toContain('voidRate')
    expect(json).toContain('concedeRate')
    // SITE_SPEC.md §5 delta 2: ties are retained in the schema and are always 0 under us54.
    for (const cell of results.matrix) expect(cell.ties).toBe(0)
    expect(results.meta.rulesHash).toHaveLength(64)
    expect(results.meta.rulesHash).toBe(rulesHash(input.rulesText))
    expect(results.meta.engineCommit).toBe('deadbeef')
    expect(results.meta.variant).toBe('us54')
    expect(results.styles).toHaveLength(4)
    expect(results.matrix).toHaveLength(6)
    expect(results.meta.analysis.bootstrapRan).toBe(true)
    expect(results.matrix[0].aScoreBootCi95).toBeDefined()
    expect(results.matrix[0].metrics.a.ci95.claimPrecision).toBeDefined()
    // Every value survives a JSON round trip unchanged.
    expect(JSON.parse(json).ranking.cyclicEnergy).toBeCloseTo(results.ranking.cyclicEnergy, 15)
  })

  it('renders a report naming the verdict and the four criteria', async () => {
    const { input, analysis } = await pipeline()
    const results = buildStyleResults(input, analysis, rulesHash(input.rulesText))
    const text = renderAnalysis(results, analysis)
    expect(text).toContain('VERDICT:')
    expect(text).toContain('cyclicEnergy')
    expect(text).toContain('RANKINGS, SIDE BY SIDE')
    expect(text).toContain('(1) highest mean score')
    expect(text).toContain('(4) exploitability')
  })

  it('the bootstrap can be turned off, and then the artifact says so rather than faking CIs', async () => {
    const run = await runLab(config, 2, (t) => Promise.resolve(runTask(t)))
    const input: AnalyzeInput = {
      run,
      rulesText: 'x\n',
      rulesFile: 'RULES_US54.md',
      engineCommit: 'x',
      generatedAt: '2026-01-01T00:00:00.000Z',
      options: { bootstrapSamples: 0 },
    }
    const results = buildStyleResults(input, analyze(input), rulesHash('x\n'))
    expect(results.meta.analysis.bootstrapRan).toBe(false)
    expect(results.matrix[0].aScoreBootCi95).toBeUndefined()
    expect(results.matrix[0].metrics.a.ci95).toEqual({})
  })
})
