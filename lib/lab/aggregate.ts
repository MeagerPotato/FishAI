/**
 * aggregate.ts — per-cell metrics, the paired estimator, and the health gate.
 *
 * ## The paired estimator (BOT_LAB.md §5.1)
 *
 * A *pair* is one seed played in both orientations. The observation is the pair's mean score for
 * style *a*, `(aResult(orient 0) + aResult(orient 1)) / 2`, and the cell's SE is the standard
 * error of **those** values — not of the 2N individual games. That is the whole point: a lucky
 * deal lifts both orientations and cancels inside the pair instead of inflating the spread. The
 * §5.1 measurement on this engine was a 1.36x variance ratio, so `seUnpaired` is computed too
 * and `varianceRatio` reports what the pairing actually bought on *this* run rather than
 * asserting the published figure.
 *
 * `aScore + bScore == 1` holds by construction (`bResult = 1 - aResult` game by game), which is
 * the antisymmetry BOT_LAB.md §4.4 needs before `P` can be decomposed at all.
 *
 * ## Rates are formed once, here
 *
 * Every rate divides a summed counter by a summed counter across the whole cell. See
 * [types.ts](types.ts) — averaging per-game ratios would weight a 40-ask game like a 400-ask one.
 * A zero denominator yields 0, never `NaN`: a `NaN` in the artifact propagates silently through
 * the analysis stage, and "this style never declared" is honestly a rate of nothing, reported
 * alongside the `declaresPerGame` that makes the emptiness visible.
 */
import type {
  CappedGame,
  CellHealth,
  CellSpec,
  LabCellAggregate,
  LabGameRecord,
  RunHealth,
  SideCounters,
  SideMetrics,
} from './types.ts'

/** Safe divide: an empty denominator is 0, never NaN (see the file header). */
function rate(num: number, den: number): number {
  return den === 0 ? 0 : num / den
}

/** A zeroed `SideCounters`. Exported for the adaptive lab, which sums into the same shape. */
export function zeroCounters(): SideCounters {
  return {
    asks: 0,
    hits: 0,
    turnsGained: 0,
    declares: 0,
    declaresCorrect: 0,
    declaresWrong: 0,
    declaresForced: 0,
    foreignDeclares: 0,
    foreignDeclaresForced: 0,
    declaresWrongForced: 0,
    setsWon: 0,
    setsGifted: 0,
    raceLosses: 0,
    clinchDenials: 0,
    clinchWins: 0,
    latencySum: 0,
    latencyCount: 0,
    declareOffers: 0,
    leakyAsks: 0,
    hoardSum: 0,
    hoardSamples: 0,
    dropoutSteps: [],
  }
}

/** Sum `c` into `acc`, field by field. Exported for the adaptive lab's gauntlet cells. */
export function addCounters(acc: SideCounters, c: SideCounters): void {
  acc.asks += c.asks
  acc.hits += c.hits
  acc.turnsGained += c.turnsGained
  acc.declares += c.declares
  acc.declaresCorrect += c.declaresCorrect
  acc.declaresWrong += c.declaresWrong
  acc.declaresForced += c.declaresForced
  acc.foreignDeclares += c.foreignDeclares
  acc.foreignDeclaresForced += c.foreignDeclaresForced
  acc.declaresWrongForced += c.declaresWrongForced
  acc.setsWon += c.setsWon
  acc.setsGifted += c.setsGifted
  acc.raceLosses += c.raceLosses
  acc.clinchDenials += c.clinchDenials
  acc.clinchWins += c.clinchWins
  acc.latencySum += c.latencySum
  acc.latencyCount += c.latencyCount
  acc.declareOffers += c.declareOffers
  acc.leakyAsks += c.leakyAsks
  acc.hoardSum += c.hoardSum
  acc.hoardSamples += c.hoardSamples
  for (const d of c.dropoutSteps) acc.dropoutSteps.push(d)
}

/**
 * The published rates for one side, from summed counters (see the file header: rates are formed
 * once, here). Exported so the adaptive lab's gauntlet rows are priced by the *same* arithmetic
 * as the matrix cells they are read against — a second implementation would be a second
 * definition.
 */
export function sideMetrics(c: SideCounters, games: number): SideMetrics {
  const chosen = c.declares - c.declaresForced
  const dropSum = c.dropoutSteps.reduce((s, v) => s + v, 0)
  return {
    askHitRate: rate(c.hits, c.asks),
    turnRetention: rate(c.asks, c.turnsGained),
    claimPrecision: rate(c.declaresCorrect, c.declares),
    // Identical to `claimPrecision` under `us54` by construction — see the field's doc comment.
    claimYield: rate(c.declaresCorrect, c.declares),
    concedeRate: rate(c.declaresWrong, c.declares),
    concedeRateChosen: rate(c.declaresWrong - c.declaresWrongForced, chosen),
    foreignDeclareRate: rate(c.foreignDeclares, c.declares),
    foreignDeclareRateChosen: rate(c.foreignDeclares - c.foreignDeclaresForced, chosen),
    declareLatency: rate(c.latencySum, c.latencyCount),
    raceLossesPerGame: rate(c.raceLosses, games),
    clinchDenialsPerGame: rate(c.clinchDenials, games),
    leakIndex: rate(c.leakyAsks, c.asks),
    hoardIndex: rate(c.hoardSum, c.hoardSamples),
    giftsPerGame: rate(c.setsGifted, games),
    setsPerGame: rate(c.setsWon, games),
    declaresPerGame: rate(c.declares, games),
    forcedDeclareRate: rate(c.declaresForced, c.declares),
    dropoutStep: rate(dropSum, c.dropoutSteps.length),
    // Three seats per side per game.
    dropoutRate: rate(c.dropoutSteps.length, games * 3),
  }
}

/** Sample standard deviation (n-1). Zero for fewer than two observations. */
function sd(xs: number[]): number {
  if (xs.length < 2) return 0
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length
  let ss = 0
  for (const x of xs) ss += (x - mean) * (x - mean)
  return Math.sqrt(ss / (xs.length - 1))
}

/**
 * Fold one cell's games into the published cell record.
 *
 * `records` may arrive in any order (worker threads); they are keyed by `pair` and `orient`, so
 * the result does not depend on arrival order. A pair missing an orientation is dropped from the
 * paired estimator and counted as a health violation upstream rather than silently half-weighted.
 */
export function aggregateCell(cell: CellSpec, records: LabGameRecord[], expectedPairs: number): LabCellAggregate {
  const ca = zeroCounters()
  const cb = zeroCounters()
  const byPair = new Map<number, number[]>()
  const seeds = new Set<string>()

  let aWins = 0
  let bWins = 0
  let ties = 0
  let steps = 0
  let maxMoves = 0
  let marginSum = 0
  let setsASum = 0
  let setsBSum = 0
  let unresolvedSum = 0
  let endgames = 0
  let illegalActions = 0
  let invariantViolations = 0
  let cappedGames = 0
  let voids = 0
  let nonClinch = 0

  for (const r of records) {
    addCounters(ca, r.ca)
    addCounters(cb, r.cb)
    seeds.add(r.seed)
    const slot = byPair.get(r.pair)
    if (slot === undefined) byPair.set(r.pair, [r.aResult])
    else slot.push(r.aResult)

    if (r.aResult === 1) aWins++
    else if (r.aResult === 0) bWins++
    else ties++

    steps += r.steps
    if (r.steps > maxMoves) maxMoves = r.steps
    marginSum += r.setsA - r.setsB
    setsASum += r.setsA
    setsBSum += r.setsB
    unresolvedSum += r.unresolved
    if (r.endgameReached) endgames++
    illegalActions += r.illegal
    invariantViolations += r.invariantViolations
    voids += r.voids
    if (r.capped) cappedGames++
    if (!r.clinch) nonClinch++
  }

  const games = records.length
  const paired: number[] = []
  for (const [, results] of byPair) {
    if (results.length !== 2) continue
    paired.push((results[0] + results[1]) / 2)
  }
  const flat = records.map((r) => r.aResult)
  const aScore = paired.length > 0 ? paired.reduce((s, v) => s + v, 0) / paired.length : 0
  const sePaired = paired.length > 0 ? sd(paired) / Math.sqrt(paired.length) : 0
  // The estimator the same games would have given with no pairing: SE of the flat per-game
  // score over 2N games. Reported so §5.1's 1.36x is a measurement of this run, not a citation.
  const seFlat = flat.length > 0 ? sd(flat) / Math.sqrt(flat.length) : 0
  const health: CellHealth = {
    illegalActions,
    cappedGames,
    invariantViolations,
    ties,
    voids,
    nonClinch,
    distinctSeeds: seeds.size,
    expectedSeeds: expectedPairs,
  }

  return {
    index: cell.index,
    id: cell.id,
    a: cell.a,
    b: cell.b,
    pairs: paired.length,
    games,
    distinctSeeds: seeds.size,
    aScore,
    se: sePaired,
    ci95: [aScore - 1.96 * sePaired, aScore + 1.96 * sePaired],
    seUnpaired: seFlat,
    varianceRatio: sePaired === 0 ? 0 : (seFlat * seFlat) / (sePaired * sePaired),
    aWins,
    bWins,
    ties,
    setMargin: rate(marginSum, games),
    setsAtClinch: [rate(setsASum, games), rate(setsBSum, games)],
    unresolved: rate(unresolvedSum, games),
    avgMoves: rate(steps, games),
    maxMoves,
    endgameIncidence: rate(endgames, games),
    metrics: { a: sideMetrics(ca, games), b: sideMetrics(cb, games) },
    health,
  }
}

/**
 * The BOT_LAB.md §4.3 gate. A `false` here VOIDS the run — the numbers must not be published,
 * and the launcher exits non-zero.
 *
 * `cappedGames` is listed individually rather than summarised. RULES_US54.md §3.2 proves an
 * adversarial policy can livelock the game through ordinary ask-miss ping-pong (identically
 * under `pagat48` — it is a property of Fish, not of the variant), so the step cap is
 * load-bearing: *"the simulator's step cap is load-bearing and must be instrumented rather than
 * allowed to silently discard games."* Every capped game names its cell and seed so it is
 * reproducible in one command.
 */
export function runHealth(
  cells: LabCellAggregate[],
  records: LabGameRecord[],
  expectedPairs: number,
  variant: string,
): RunHealth {
  const capped: CappedGame[] = []
  for (const r of records) {
    if (r.capped) capped.push({ cell: r.cell, seed: r.seed, orient: r.orient, startSeat: r.startSeat, steps: r.steps })
  }
  let illegalActions = 0
  let invariantViolations = 0
  let ties = 0
  let voids = 0
  let nonClinch = 0
  let minSeeds = Number.POSITIVE_INFINITY
  const violations: string[] = []

  for (const c of cells) {
    illegalActions += c.health.illegalActions
    invariantViolations += c.health.invariantViolations
    ties += c.health.ties
    voids += c.health.voids
    nonClinch += c.health.nonClinch
    minSeeds = Math.min(minSeeds, c.distinctSeeds)
    if (c.distinctSeeds !== expectedPairs) {
      violations.push(
        `cell ${c.id}: distinctSeeds ${c.distinctSeeds} != pairs ${expectedPairs} ` +
          '(BOT_LAB.md §5.2 — a repeated seed returns a byte-identical game, so it is not extra data)',
      )
    }
    if (c.pairs !== expectedPairs) {
      violations.push(`cell ${c.id}: ${c.pairs} complete duplicate pairs, expected ${expectedPairs}`)
    }
  }

  // The three hard gates of BOT_LAB.md §4.3.
  if (illegalActions > 0) violations.push(`illegalActions ${illegalActions} (must be 0)`)
  if (invariantViolations > 0) violations.push(`invariantViolations ${invariantViolations} (must be 0)`)
  if (capped.length > 0) {
    const byCell = new Map<string, number>()
    for (const g of capped) byCell.set(g.cell, (byCell.get(g.cell) ?? 0) + 1)
    const worst = [...byCell.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    violations.push(
      `cappedGames ${capped.length} (must be 0) — cells: ${worst.map(([c, n]) => `${c}=${n}`).join(', ')}`,
    )
  }
  if (variant === 'us54') {
    // STYLES.md §4: assert, do not merely report.
    if (ties > 0) violations.push(`ties ${ties} — RULES_US54.md §5 proves ties are arithmetically impossible`)
    if (voids > 0) violations.push(`voids ${voids} — RULES_US54.md row 14 abolishes the void outcome`)
    if (nonClinch > 0) violations.push(`nonClinch ${nonClinch} games did not end on a clinch at exactly 5 sets`)
  }

  return {
    ok: violations.length === 0,
    illegalActions,
    cappedGames: capped.length,
    invariantViolations,
    ties,
    voids,
    nonClinch,
    distinctSeeds: minSeeds === Number.POSITIVE_INFINITY ? 0 : minSeeds,
    expectedSeeds: expectedPairs,
    capped,
    violations,
  }
}
