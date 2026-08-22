/**
 * analyze.ts — BOT_LAB.md §6 step 3, in the order §6 gives it.
 *
 * ```
 * 1. Build antisymmetric P (duplicate-averaged).                      matrix.ts
 * 2. Transitivity test — Hodge/Schur; cyclicEnergy and all
 *    significant 3-cycles.                                            hodge.ts + stats.ts (BH)
 * 3. If transitive: fit Bradley-Terry / Elo, publish with CIs.        bradleyTerry.ts
 * 4. If cyclic: Nash averaging weights + alpha-Rank ordering.         nash.ts + alpharank.ts
 * 5. Always publish maximin and exploitability alongside.             matrix.ts + exploit.ts
 * ```
 *
 * One deliberate departure from the letter of steps 3 and 4: **all five rankings are always
 * computed**, and the verdict decides which one the site leads with rather than which ones exist.
 * BOT_LAB.md §7.2's ranking view asks for them *"side by side"* and says why —
 * *"show where the rankings **disagree** — that disagreement is the finding"* — and a ranking
 * that is only computed in the branch where it agrees can never disagree.
 *
 * The other ordering constraint is real and is enforced by the code's shape: **Benjamini-Hochberg
 * runs before anything is called significant.** `significant` and `qValue` are produced once,
 * here, from the whole set of 36 p-values, and the cycle enumeration and the maximin criterion
 * both read that output. Nothing downstream can see a raw p-value.
 */
import { STYLE_ROSTER } from '../../engine/index.ts'
import type { StyleId } from '../../engine/index.ts'
import type { LabCellAggregate, LabGameRecord, LabRunOutput } from '../types.ts'
import { alphaRank } from './alpharank.ts'
import { bootstrapCell, BOOTSTRAP_METRICS } from './bootstrap.ts'
import type { BootstrapMetric, CellBootstrap } from './bootstrap.ts'
import { bradleyTerry } from './bradleyTerry.ts'
import { findCycles, hodgeDecompose } from './hodge.ts'
import type { Cycle3 } from './hodge.ts'
import { buildPayoff, maximins, meanScores } from './matrix.ts'
import type { PayoffMatrix } from './matrix.ts'
import { maxentNash } from './nash.ts'
import { benjaminiHochberg, normalCi95, scoreP } from './stats.ts'
import { RESULTS_SCHEMA_VERSION } from './types.ts'
import type {
  AlphaRankEntry,
  EloEntry,
  MatrixCell,
  MaximinEntry,
  NashEntry,
  Ranking,
  RankingEntry,
  SideMetricsWithCi,
  StyleEntry,
  StyleResults,
} from './types.ts'
import { decideVerdict } from './verdict.ts'
import type { ExploitabilityEntry } from './exploit.ts'

export interface AnalyzeOptions {
  /** FDR level for BH across all cells. BOT_LAB.md §5.6. */
  alpha?: number
  /** BOT_LAB.md §4.4 criterion 3. */
  cyclicThreshold?: number
  /** Bootstrap replicates per cell. 0 disables the bootstrap. */
  bootstrapSamples?: number
  bootstrapSeed?: string
  /** Styles excluded from the exploitability search (BOT_LAB.md §5.8). */
  holdout?: readonly StyleId[]
  /** How much worse than the rivals' median exploitability counts as "materially worse". */
  exploitabilityMargin?: number
}

export interface AnalyzeInput {
  run: LabRunOutput
  /** The full text of the pinned rule document, for `meta.rulesHash`. */
  rulesText: string
  /** Which file that text came from, e.g. `RULES_US54.md`. */
  rulesFile: string
  engineCommit: string
  generatedAt: string
  exploitability?: readonly ExploitabilityEntry[]
  /**
   * True only for a hand-built fixture. Defaults to `false`, because everything that reaches this
   * function through the runner IS simulator output, and a default of "synthetic" would let a
   * real result be silently stamped as a mock.
   */
  synthetic?: boolean
  /** The banner the site prints beside that stamp. Defaults to empty for real output. */
  notice?: string
  options?: AnalyzeOptions
}

/** Everything the analysis computed, before it is flattened into the published artifact. */
export interface Analysis {
  payoff: PayoffMatrix
  cells: LabCellAggregate[]
  pValues: number[]
  qValues: number[]
  significant: boolean[]
  hodge: ReturnType<typeof hodgeDecompose>
  cycles: Cycle3[]
  nash: ReturnType<typeof maxentNash>
  alphaRank: ReturnType<typeof alphaRank>
  bradleyTerry: ReturnType<typeof bradleyTerry>
  meanScore: number[]
  maximin: ReturnType<typeof maximins>
  bootstrap: Map<string, CellBootstrap>
  ranking: Ranking
}

function groupRecords(records: readonly LabGameRecord[]): Map<string, LabGameRecord[]> {
  const by = new Map<string, LabGameRecord[]>()
  for (const r of records) {
    const slot = by.get(r.cell)
    if (slot === undefined) by.set(r.cell, [r])
    else slot.push(r)
  }
  return by
}

/**
 * Run the whole §6 step-3 analysis over a finished run.
 *
 * Pure: same run in, same analysis out. The only inputs that are not the games themselves are
 * provenance (`generatedAt`, `engineCommit`) and the tuning of the tests (`alpha`, the bootstrap
 * seed), all of which are recorded in the artifact.
 */
export function analyze(input: AnalyzeInput): Analysis {
  const opts = input.options ?? {}
  const alpha = opts.alpha ?? 0.05
  const cyclicThreshold = opts.cyclicThreshold ?? 0.15
  const bootstrapSamples = opts.bootstrapSamples ?? 1000
  const bootstrapSeed = opts.bootstrapSeed ?? 'lab-bootstrap-v1'
  const exploitabilityMargin = opts.exploitabilityMargin ?? 0.02

  const styles = input.run.meta.config.styles
  const cells = input.run.cells

  // 1. The matrix. Throws if it is not complete or not antisymmetric.
  const payoff = buildPayoff(styles, cells)

  // 2a. BH across every cell, BEFORE anything is called significant.
  const pValues = cells.map((c) => scoreP(c.aScore, c.se, 0.5))
  const bh = benjaminiHochberg(pValues, alpha)

  // Lift the per-cell flags into matrix form so the cycle finder can read them by index.
  const idx = new Map<StyleId, number>()
  styles.forEach((s, i) => idx.set(s, i))
  const n = styles.length
  const sigM: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const qM: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(1))
  cells.forEach((c, k) => {
    const i = idx.get(c.a)
    const j = idx.get(c.b)
    if (i === undefined || j === undefined) return
    sigM[i][j] = bh.significant[k]
    sigM[j][i] = bh.significant[k]
    qM[i][j] = bh.q[k]
    qM[j][i] = bh.q[k]
  })

  // 2b. The transitivity test and its human-legible form.
  const hodge = hodgeDecompose(payoff.a)
  const cycles = findCycles(styles, payoff.p, sigM, qM)

  // 3-5. Every ranking, always (see the file header).
  const bt = bradleyTerry(payoff.p, payoff.n)
  const nash = maxentNash(payoff.a)
  const ar = alphaRank(payoff.p)
  const meanScore = meanScores(payoff)
  const maximin = maximins(payoff)

  // The bootstrap needs per-game records; a run written with `--jsonl false` has none.
  const bootstrap = new Map<string, CellBootstrap>()
  if (bootstrapSamples > 0 && input.run.records.length > 0) {
    const byCell = groupRecords(input.run.records)
    for (const c of cells) {
      const recs = byCell.get(c.id)
      if (recs && recs.length > 0) bootstrap.set(c.id, bootstrapCell(c.id, recs, bootstrapSamples, bootstrapSeed))
    }
  }

  // The verdict. Criterion 2 reads the CI of the worst cell, not its point estimate.
  const order = meanScore.map((v, i) => ({ v, i })).sort((x, y) => y.v - x.v || x.i - y.i)
  const topIdx = order.length > 0 ? order[0].i : -1
  const runnerIdx = order.length > 1 ? order[1].i : -1
  let maximinLower = 0
  let worstSignificant = false
  if (topIdx >= 0) {
    const worstVs = maximin[topIdx].worstVs
    const j = worstVs === null ? -1 : (idx.get(worstVs) ?? -1)
    const se = j >= 0 ? payoff.se[topIdx][j] : 0
    maximinLower = normalCi95(maximin[topIdx].value, se)[0]
    worstSignificant = j >= 0 ? sigM[topIdx][j] : false
  }
  const significantCycles = cycles.filter((c) => c.significant)
  const searched = (input.exploitability ?? []).filter((e) => e.searched)
  const topStyle = topIdx >= 0 ? styles[topIdx] : null
  const topExploit = searched.find((e) => e.style === topStyle)
  const verdict = decideVerdict({
    candidate: topStyle,
    meanScore: topIdx >= 0 ? meanScore[topIdx] : 0,
    runnerUp: runnerIdx >= 0 ? { style: styles[runnerIdx], meanScore: meanScore[runnerIdx] } : null,
    maximin: topIdx >= 0 ? maximin[topIdx].value : 0,
    maximinLower95: maximinLower,
    maximinWorstVs: topIdx >= 0 ? maximin[topIdx].worstVs : null,
    maximinWorstSignificant: worstSignificant,
    cyclicEnergy: hodge.cyclicEnergy,
    cyclicThreshold,
    significantCycles: significantCycles.length,
    exploitability: topExploit ? topExploit.gap : null,
    rivalExploitability: searched.filter((e) => e.style !== topStyle).map((e) => e.gap),
    exploitabilityMargin,
  })

  const meanScoreRank: RankingEntry[] = styles
    .map((style, i) => {
      // The mean of the row is a mean of 8 correlated cell estimates; its SE is bounded above by
      // the root-mean-square of the cells' own SEs divided by sqrt(cells). Reported as an
      // indicative interval, not an exact one — hence the comment rather than a bare number.
      let ss = 0
      let k = 0
      for (let j = 0; j < n; j++) {
        if (j === i) continue
        ss += payoff.se[i][j] * payoff.se[i][j]
        k++
      }
      const se = k === 0 ? 0 : Math.sqrt(ss) / k
      return { style, value: meanScore[i], ci95: normalCi95(meanScore[i], se) }
    })
    .sort((x, y) => y.value - x.value)

  const maximinRank: MaximinEntry[] = styles
    .map((style, i) => {
      const worstVs = maximin[i].worstVs
      const j = worstVs === null ? -1 : (idx.get(worstVs) ?? -1)
      const se = j >= 0 ? payoff.se[i][j] : 0
      return {
        style,
        value: maximin[i].value,
        worstVs,
        lower95: normalCi95(maximin[i].value, se)[0],
        significant: j >= 0 ? sigM[i][j] : false,
      }
    })
    .sort((x, y) => y.value - x.value)

  const btRank: EloEntry[] = styles
    .map((style, i) => ({ style, elo: bt.elo[i], se: bt.eloSe[i], ci95: bt.ci95[i] }))
    .sort((x, y) => y.elo - x.elo)
  const nashRank: NashEntry[] = styles
    .map((style, i) => ({ style, weight: nash.weights[i] }))
    .sort((x, y) => y.weight - x.weight)
  const alphaRankRank: AlphaRankEntry[] = styles
    .map((style, i) => ({ style, score: ar.scores[i], rank: ar.ranks[i] }))
    .sort((x, y) => x.rank - y.rank)
  const hodgeRank: RankingEntry[] = styles
    .map((style, i) => ({ style, value: hodge.ratings[i] }))
    .sort((x, y) => y.value - x.value)

  const ranking: Ranking = {
    meanScore: meanScoreRank,
    maximin: maximinRank,
    bradleyTerry: btRank,
    nash: nashRank,
    alphaRank: alphaRankRank,
    hodgeRating: hodgeRank,
    cyclicEnergy: hodge.cyclicEnergy,
    cycles: significantCycles,
    cyclesAll: cycles.length,
    verdict: verdict.verdict,
    criteria: verdict.criteria,
    verdictSummary: verdict.summary,
  }

  return {
    payoff,
    cells: [...cells],
    pValues,
    qValues: bh.q,
    significant: bh.significant,
    hodge,
    cycles,
    nash,
    alphaRank: ar,
    bradleyTerry: bt,
    meanScore,
    maximin,
    bootstrap,
    ranking,
  }
}

function withCi(
  m: LabCellAggregate['metrics']['a'],
  avgMoves: number,
  boot: CellBootstrap | undefined,
  side: 'a' | 'b',
): SideMetricsWithCi {
  const ci95: Partial<Record<BootstrapMetric, [number, number]>> = {}
  if (boot) {
    for (const k of BOOTSTRAP_METRICS) ci95[k] = boot[side].metrics[k].ci95
  }
  return { ...m, avgMoves, ci95 }
}

/** Flatten the analysis into BOT_LAB.md §7.1's artifact. */
export function buildStyleResults(input: AnalyzeInput, analysis: Analysis, rulesHashHex: string): StyleResults {
  const opts = input.options ?? {}
  const run = input.run
  const styles = run.meta.config.styles
  const holdout = opts.holdout ?? []
  const holdSet = new Set<StyleId>(holdout)

  const styleEntries: StyleEntry[] = styles.map((id) => {
    const p = STYLE_ROSTER[id]
    return {
      id,
      label: p.label,
      family: p.family,
      thesis: p.thesis,
      params: p,
      holdout: holdSet.has(id),
    }
  })

  const matrix: MatrixCell[] = analysis.cells.map((c, k) => {
    const boot = analysis.bootstrap.get(c.id)
    const cell: MatrixCell = {
      a: c.a,
      b: c.b,
      pairs: c.pairs,
      games: c.games,
      distinctSeeds: c.distinctSeeds,
      aScore: c.aScore,
      se: c.se,
      ci95: c.ci95,
      seUnpaired: c.seUnpaired,
      varianceRatio: c.varianceRatio,
      aWins: c.aWins,
      bWins: c.bWins,
      ties: c.ties,
      bookMargin: c.setMargin,
      setsAtClinch: c.setsAtClinch,
      unresolved: c.unresolved,
      avgMoves: c.avgMoves,
      maxMoves: c.maxMoves,
      endgameIncidence: c.endgameIncidence,
      pValue: analysis.pValues[k],
      qValue: analysis.qValues[k],
      significant: analysis.significant[k],
      metrics: {
        a: withCi(c.metrics.a, c.avgMoves, boot, 'a'),
        b: withCi(c.metrics.b, c.avgMoves, boot, 'b'),
      },
    }
    if (boot) cell.aScoreBootCi95 = boot.aScore.ci95
    return cell
  })

  const exploit = (input.exploitability ?? []).map((e) => ({
    style: e.style,
    searched: e.searched,
    ...(e.skippedReason === undefined ? {} : { skippedReason: e.skippedReason }),
    bestResponseParams: e.bestResponseParams,
    acceptedMoves: e.acceptedMoves,
    score: e.score,
    se: e.se,
    ci95: e.ci95,
    gap: e.gap,
    searchScore: e.searchScore,
    searchGames: e.searchGames,
    evalGames: e.evalGames,
    candidatesTried: e.candidatesTried,
    inertCandidates: e.inertCandidates,
    detectableDelta: e.detectableDelta,
    pairedVariance: e.pairedVariance,
    mirrorBaselineExact: e.mirrorBaselineExact,
  }))

  return {
    meta: {
      schemaVersion: RESULTS_SCHEMA_VERSION,
      generatedAt: input.generatedAt,
      engineCommit: input.engineCommit,
      rulesHash: rulesHashHex,
      rulesFile: input.rulesFile,
      variant: run.meta.config.variant,
      ruleSet: run.meta.config.variant,
      synthetic: input.synthetic ?? false,
      notice: input.notice ?? '',
      config: {
        ...run.meta.config,
        toggles: run.meta.toggles,
        books: run.meta.books,
        clinchTarget: run.meta.clinchTarget,
      },
      gamesTotal: run.meta.gamesTotal,
      seedSet: { count: run.meta.config.pairs, prefix: run.meta.config.seedPrefix },
      wallMs: run.meta.wallMs,
      recordsDigest: run.meta.recordsDigest,
      health: run.health,
      analysis: {
        alpha: opts.alpha ?? 0.05,
        significantCells: analysis.significant.filter(Boolean).length,
        cells: analysis.cells.length,
        cyclicThreshold: opts.cyclicThreshold ?? 0.15,
        exploitabilityMargin: opts.exploitabilityMargin ?? 0.02,
        bootstrapSamples: opts.bootstrapSamples ?? 1000,
        bootstrapSeed: opts.bootstrapSeed ?? 'lab-bootstrap-v1',
        bootstrapRan: analysis.bootstrap.size > 0,
        nash: {
          residual: analysis.nash.residual,
          entropy: analysis.nash.entropy,
          tau: analysis.nash.tau,
          converged: analysis.nash.converged,
        },
        alphaRank: {
          alpha: analysis.alphaRank.alpha,
          populationSize: analysis.alphaRank.populationSize,
          residual: analysis.alphaRank.residual,
          converged: analysis.alphaRank.converged,
          concentrated: analysis.alphaRank.concentrated,
          sweep: analysis.alphaRank.sweep,
        },
        bradleyTerry: {
          iterations: analysis.bradleyTerry.iterations,
          converged: analysis.bradleyTerry.converged,
          meanAbsResidual: analysis.bradleyTerry.meanAbsResidual,
        },
        hodge: {
          totalEnergy: analysis.hodge.totalEnergy,
          transitiveEnergy: analysis.hodge.transitiveEnergy,
          orthogonalityError: analysis.hodge.orthogonalityError,
        },
        antisymmetryError: analysis.payoff.antisymmetryError,
        holdout,
        exploitabilityRan: (input.exploitability ?? []).some((e) => e.searched),
      },
    },
    styles: styleEntries,
    matrix,
    ranking: analysis.ranking,
    exploitability: exploit,
    teams: [],
    crossplay: [],
    replays: [],
  }
}
