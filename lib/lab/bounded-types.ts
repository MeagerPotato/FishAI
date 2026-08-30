/**
 * bounded-types.ts — the data contract of the FishAI v1.5 experiment suite (SPEC v1.5 Phase 2;
 * the bounded-memory ladder of PLAYSTYLES.md S44–S48; [bounded.ts](bounded.ts) for the
 * machinery that fills these shapes).
 *
 * Everything here is **plain data** — structured-cloneable across a `worker_threads` boundary
 * and JSON-serialisable without a replacer — for the reason [types.ts](types.ts) gives:
 * `scripts/` is linted but never typechecked, so every substantial shape must live where `tsc`
 * can see it. The site's boundary validator (`src/lab/bounded-artifact.ts`) re-derives its
 * types from this file, so the emitter and the reader cannot drift apart silently.
 *
 * ## The seven pre-registered predictions this suite tests
 *
 * Written down HERE, before the run (pre-registered 2026-08-29 in SPEC-v15.md), with the
 * verdict rules fixed alongside them in [bounded.ts](bounded.ts)'s `computeBoundedVerdicts`.
 * Honest measurement either confirms or refutes; nothing in the suite is tuned toward a
 * prediction, and a refuted or mixed prediction is emitted as such, never massaged.
 *
 * ## The metric
 *
 * Every E1/E2 cell is scored on **mean set-share** — `setsA / (setsA + setsB)` per game,
 * duplicate-pair averaged — not the win rate. The spec names set-share because the ladder's
 * whole point is a smooth strength dial: a win rate saturates long before the top budgets
 * separate, while the share of banked sets keeps moving.
 */
import type { BotDifficulty, Seat, StyleId, Team, Variant } from '../engine/index.ts'
import type { CellHealth, InvariantCheck, Orientation } from './types.ts'
import type { AccuracyByStyle, AdaptiveHealthSummary, VerdictValue } from './adaptive-types.ts'

/**
 * The schema of the PUBLISHED artifact (`src/lab/data/bounded-results.json`). Bump when the
 * emitted JSON shape changes in a way a reader must notice. Version 2 added the E4b single-seat
 * attribution block (`accuracySingle`), the P8 verdict, and the `multiplicity` annotation.
 * Version 3 (E4b-power, registered 2026-08-30 before any run) makes the 300-seed power run the
 * P8 verdict of record in `accuracySingle`, retains the 50-seed pilot verbatim in
 * `accuracySinglePilot`, and adds the labelled `crossDesign` block.
 */
export const BOUNDED_SCHEMA_VERSION = 3

/**
 * The schema of the pilot-extended artifact — what `extendBoundedResults` emits and what
 * `extendBoundedResultsPower` consumes and upgrades. The committed schema-2 artifact is the
 * only file of this shape; the site reads schema {@link BOUNDED_SCHEMA_VERSION} alone.
 */
export const BOUNDED_PILOT_SCHEMA_VERSION = 2

/**
 * The schema of the BASE suite outputs — `run.json` and the pre-E4b artifact shape
 * `buildBoundedResults` emits, which `extendBoundedResults` consumes and upgrades. Held at the
 * committed value so the E1–E4 aggregates it stamps stay byte-identical across the extension.
 */
export const BOUNDED_BASE_SCHEMA_VERSION = 1

/**
 * The E4b-power run's registered shape (SPEC-v15.md E4b-power, registered 2026-08-30 AFTER the
 * E4b review and BEFORE any run): 300 seeds per pairing — reads 1,800 → 10,800 per cell,
 * matching P7's read count — on a fresh seed prefix disjoint from the pilot's `clsacc-v1`
 * (seeds are `${prefix}-${index}`, so a different prefix shares no seed string). The mapping,
 * bits grid, estimator and P8 rule are UNCHANGED from the pilot.
 */
export const BOUNDED_POWER_ACC_GAMES = 300
export const BOUNDED_POWER_SEED_PREFIX = 'clsacc-power-v1'

/**
 * The ∞ rung of the ladder, as a concrete budget provably above the maximum derivable pool.
 * The pool's cost is bounded by construction of `deriveBoundedFacts`: at most one card fact
 * (2 bits) OR five lacks facts (10 bits) per live card — 54 × 10 = 540 — plus one 1-bit basis
 * fact per surviving record-time constraint (at most one constraint per ask event, so ≤ the
 * 5,000-step cap) plus ≤ 9 books × 5 seats = 45 no-basis bits. Total < 5,600 ≪ 1,000,000.
 * The same value the Phase 1 anchor test pins large-budget equivalence at.
 */
export const BOUNDED_INF_BITS = 1_000_000

/** The three shipped tiers E2 calibrates, in ladder order. */
export const BOUNDED_TIERS: readonly BotDifficulty[] = Object.freeze(['easy', 'medium', 'hard'])

/* -- predictions ---------------------------------------------------------------------------- */

export type BoundedPredictionId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8'

export interface BoundedPrediction {
  id: BoundedPredictionId
  text: string
}

/** The pre-registered predictions, verbatim from SPEC-v15.md Phase 2 — written into `meta`. */
export const BOUNDED_PREDICTIONS: readonly BoundedPrediction[] = [
  {
    id: 'P1',
    text:
      'E1 (ladder monotonicity): set-share is non-decreasing in bits, within 2·(paired SE) at ' +
      'every adjacent pair.',
  },
  {
    id: 'P2',
    text:
      'E1 (health, not prediction): at ∞ the pairing is an exact mirror; duplicate-deal ' +
      'set-share is 0.5000 exactly by construction. A deviation is a harness bug, full stop.',
  },
  {
    id: 'P3',
    text:
      'E2 (question, direction only): each shipped tier lands at a finite, orderable ' +
      'bits-equivalent (easy < medium < hard). No numeric prediction — this is the measurement ' +
      'the ladder exists to provide.',
  },
  {
    id: 'P4',
    text: 'E3: full-memory policies are age-flat (the S48 log-reader regime, by construction).',
  },
  {
    id: 'P5',
    text:
      'E3: bounded policies decay with age, and the decay half-life increases with bits (the ' +
      'S45 signature, by construction of spotlight + recency eviction).',
  },
  {
    id: 'P6',
    text:
      'E3: the OLD easy tier (logWindow 6 + 25% uniform noise) is age-flat inside its window ' +
      'and cliff-edged at it — i.e. noise is not human-shaped; the paper’s motivating contrast.',
  },
  {
    id: 'P7',
    text:
      'E4 (direction): top-1 accuracy is non-increasing as bits shrink — memory pressure ' +
      'erodes the behavioural signature. Where it lands relative to the 22.4% full-strength ' +
      'baseline is the measurement, not a prediction.',
  },
]

/**
 * The E4b prediction, registered separately (SPEC-v15.md, 2026-08-30 — AFTER the Phase 2
 * review and BEFORE any E4b run) and therefore not part of {@link BOUNDED_PREDICTIONS}, which
 * the base suite stamps verbatim. `extendBoundedResults` appends it to the published artifact.
 */
export const BOUNDED_P8_PREDICTION: BoundedPrediction = {
  id: 'P8',
  text:
    'E4b (single-seat attribution): top-1 accuracy at the bounded read seat is non-increasing ' +
    'as its bits shrink, by the same adjacent-rung 2·SE rule as P7 (any violating rung ' +
    'refutes). The ∞ cell must reproduce the corresponding full-strength read exactly ' +
    '(health, not prediction).',
}

export interface BoundedVerdict {
  id: BoundedPredictionId
  prediction: string
  verdict: VerdictValue
  /** The numbers the verdict was computed from, in prose. Never a bare pass/fail. */
  detail: string
}

/* -- run configuration ---------------------------------------------------------------------- */

export interface BoundedLabConfig {
  /** The E1 budget ladder, ascending, ∞ last as {@link BOUNDED_INF_BITS}. */
  ladderBits: readonly number[]
  /** Duplicate pairs per E1 budget cell. Every budget replays the identical seed list. */
  ladderPairs: number
  ladderSeedPrefix: string
  /**
   * Duplicate pairs per E2 tier cell — the HEAD of the ladder seed list (same prefix), so a
   * tier's share and every ladder point share deals and the interpolation is per-deal honest.
   */
  tierPairs: number
  /** The E4 budgets, ascending, ∞ last. */
  accBits: readonly number[]
  /** Single games per style pairing per E4 budget. 50 mirrors the v1.0 accuracy experiment. */
  accGames: number
  /** `clsacc-v1` replays the v1.0 accuracy seed list, making the ∞ cell its exact re-run. */
  accSeedPrefix: string
  chunkPairs: number
  variant: Variant
  stepCap: number
  invariantCheck: InvariantCheck
}

/* -- per-game records ----------------------------------------------------------------------- */

export type BoundedExperimentId = 'ladder' | 'tier' | 'accuracy' | 'accuracySingle'

/**
 * One played game — the JSONL line. `a` is always the measured side (the bounded team in E1,
 * the tier team in E2, the `pairing[0]` bounded style in E4); `orient` 0 seats it on team 0.
 *
 * E1/E2 records retain the FULL public log as `elog` — the compact per-event encoding of
 * [bounded.ts](bounded.ts) `encodeElog` — because E3 is computed post-hoc from these records
 * and needs every event's index (evidence age is a log-index difference) and every hit and
 * claim (hand reconstruction). E4 records carry the end-of-game classifier read instead.
 */
export interface BoundedGameRecord {
  exp: BoundedExperimentId
  cell: string
  pair: number
  orient: Orientation
  seed: string
  startSeat: Seat
  aTeam: Team
  steps: number
  finished: boolean
  capped: boolean
  illegal: number
  invariantViolations: number
  setsA: number
  setsB: number
  unresolved: number
  voids: number
  /** THE metric: `setsA / (setsA + setsB)`. Never 0/0 under us54 — the winner holds 5. */
  aShare: number
  clinch: boolean
  tie: boolean
  /** Ladder and accuracy: the bounded budget ({@link BOUNDED_INF_BITS} encodes ∞). */
  bits?: number
  /** Tier: which shipped tier the measured team played. */
  tier?: BotDifficulty
  /** Accuracy: the two styles, `pairing[0]` on team 0. */
  pairing?: readonly [StyleId, StyleId]
  /** Accuracy: classifySeats end-of-game top-1 per seat 0..5. */
  top?: readonly StyleId[]
  /** Ladder/tier: the compact full public log (`encodeElog`), the E3 input. */
  elog?: string
  /**
   * AccuracySingle: the ONE bounded seat of the game — the seat P8 reads. `top` still carries
   * all six end-of-game reads (they are free — `classifySeats` reads the whole table at once)
   * but the P8 scoring uses `top[readSeat]` only; the other five are retained data, clearly
   * separated by this field, and enter no verdict.
   */
  readSeat?: Seat
  /**
   * AccuracySingle, ∞ budget only: whether this game — replayed with all six seats bare
   * full-strength — was event-identical (elog) with an identical six-seat classifier read and
   * step count. The P8 health gate requires `true` on every ∞ record.
   */
  infExact?: boolean
}

export interface BoundedTaskResult {
  taskIndex: number
  records: BoundedGameRecord[]
  wallMs: number
}

/* -- E1/E2 aggregates ----------------------------------------------------------------------- */

/** The paired set-share estimator over one cell — §5.1 arithmetic on `aShare`. */
export interface BoundedShareCell {
  id: string
  pairs: number
  games: number
  distinctSeeds: number
  /** Mean duplicate-pair set-share for the measured side. */
  share: number
  /** SE of the paired mean. */
  se: number
  ci95: [number, number]
  seUnpaired: number
  avgMoves: number
  maxMoves: number
  health: CellHealth
}

export interface LadderCell extends BoundedShareCell {
  bits: number
}

/**
 * One adjacent rung of the P1 test. Both budgets replay the identical seed list, so the delta
 * is formed per seed (duplicate-pair means subtracted within seed) and `se` is the SE of those
 * per-seed deltas — the "paired SE" the prediction names.
 */
export interface LadderAdjacentDelta {
  fromBits: number
  toBits: number
  /** Seeds contributing a complete duplicate pair at BOTH budgets. */
  seeds: number
  /** share(toBits) − share(fromBits), per-seed paired. */
  delta: number
  se: number
  z: number
  /** The P1 clause at this rung: `delta >= -2 * se`. */
  pass: boolean
}

/**
 * The P2 exactness check, on integers rather than floats: at ∞ both teams play bit-identical
 * balanced, so the two orientations of a pair are literally the same game and the sets must
 * mirror exactly (`setsA`/`setsB` swapped). `share` is the cell's float mean, printed too.
 */
export interface MirrorExact {
  pairs: number
  /** Pairs whose two orientations were NOT the same game, integer-exact. Must be 0. */
  deviations: number
  share: number
}

/**
 * A tier's position on the E1 curve. Interpolation is linear in bits over the FINITE budgets,
 * scanning ascending for the first segment that brackets the tier's share; a share above every
 * finite point is not finitely placeable (`finite: false` — between the top finite rung and ∞),
 * and one below the 0-bit floor clamps to 0. `lo`/`hi` map `share ∓ 1.96·se` through the same
 * rule (null where not finitely placeable).
 */
export interface BitsEquivalent {
  finite: boolean
  bits: number | null
  lo: number | null
  hi: number | null
  note: string
}

export interface TierCell extends BoundedShareCell {
  tier: BotDifficulty
  bitsEquivalent: BitsEquivalent
}

/* -- E3: evidence age ----------------------------------------------------------------------- */

/**
 * One availability observation of the E3 estimator, exactly as the spec states it: at ask
 * event `i` a card whose public location was established at event `j` (a hit located it, and
 * no later event moved or retired it) could legally have been asked by the acting seat with
 * the correct holder as target — the "certain ask" was available at age `i − j`. `exploited`
 * is whether the observed ask WAS that certain ask; `hit` is whether the observed ask hit.
 */
export interface CertainAskObservation {
  /** Log index of the ask event (the decision). */
  event: number
  /** The acting seat. */
  seat: Seat
  /** i − j, in log events. Always >= 1. */
  age: number
  exploited: boolean
  hit: boolean
}

/** One age band of a policy's curve. `hi: null` is the open top band. */
export interface EvidenceAgeRow {
  lo: number
  hi: number | null
  /** Availability observations in the band. */
  available: number
  /** Observations whose decision took exactly that certain ask. */
  exploited: number
  exploitRate: number
  /** Observations whose decision's actual ask hit (whatever it asked). */
  hits: number
  hitRate: number
}

export interface EvidenceRate {
  available: number
  exploited: number
  rate: number
}

/**
 * A between-class exploit-rate difference with its seed-clustered SE: per seed with
 * availability in BOTH classes, the rate difference; `diff` is the mean of those per-seed
 * differences and `se` their sd/√seeds. Observations within a deal are not independent, so
 * the cluster is the seed, exactly as the mixed screen's pooled SE clusters.
 */
export interface ClusteredDiff {
  diff: number
  se: number
  z: number
  seeds: number
}

/** The P6 window read: the old easy tier's logWindow is 6 events, so ages 1–6 are visible. */
export interface EvidenceWindow {
  /** Ages 1–6. */
  inside: EvidenceRate
  /** Ages 7–12 — just past the window edge. */
  justOutside: EvidenceRate
  /** Ages 1–3 minus ages 4–6 — flatness INSIDE the window. */
  insideSplit: ClusteredDiff
  /** Ages 1–6 minus ages 7–12 — the cliff AT the window edge. */
  cliff: ClusteredDiff
}

/**
 * One policy's evidence-age curve. `young` is ages 1–8, `old` ages 33+, `decay` their
 * clustered difference (young − old); `halfLifeAge` is the lower edge of the first age band
 * (with at least `EVIDENCE_MIN_BAND` observations) whose exploit rate falls to half the
 * youngest band's, or null when the curve never falls that far.
 */
export interface EvidenceCurve {
  /** `bounded-8` … `bounded-inf`, `reference`, `tier-easy` | `tier-medium` | `tier-hard`. */
  policy: string
  /** Ask decisions made by seats of this policy across the retained records. */
  askDecisions: number
  /** Ask decisions at which at least one certain ask was available. */
  decisionsWithCertain: number
  /** Total availability observations (one per decision × available certain ask). */
  observations: number
  rows: EvidenceAgeRow[]
  young: EvidenceRate
  old: EvidenceRate
  decay: ClusteredDiff
  window: EvidenceWindow
  halfLifeAge: number | null
}

/* -- E4: style under memory pressure -------------------------------------------------------- */

export interface BoundedAccuracyCell {
  bits: number
  games: number
  seats: number
  top1: number
  byStyle: Record<StyleId, AccuracyByStyle>
}

/** One adjacent rung of the P7 test; budgets share the seed list, so the delta is per-seed. */
export interface AccuracyAdjacentDelta {
  fromBits: number
  toBits: number
  seeds: number
  /** top1(toBits) − top1(fromBits), per-seed paired. */
  delta: number
  se: number
  z: number
  /** The P7 clause at this rung: `delta >= -2 * se`. */
  pass: boolean
}

export interface BoundedAccuracy {
  cells: BoundedAccuracyCell[]
  deltas: AccuracyAdjacentDelta[]
}

/* -- E4b: single-seat attribution ------------------------------------------------------------ */

/**
 * One E4b budget cell. Exactly ONE read per game — the bounded seat's — so `reads` equals
 * `games`; `byStyle` keys the truth (the team-0 style, `pairing[0]`), and its `seats` field
 * counts reads. The pairing scheme is triangular (a style is `pairing[0]` only against styles
 * later in roster order), so the by-style read counts fall with roster position and the LAST
 * roster style has none — a property of the registered design, identical at every budget, so
 * the adjacent-rung deltas always compare identical read populations.
 */
export interface SingleAccuracyCell {
  bits: number
  games: number
  /** Bounded-seat reads scored — one per game. */
  reads: number
  top1: number
  /** Seed-clustered SE of `top1`: per-seed accuracies over the pairings, sd/√seeds. */
  se: number
  /** Seeds contributing at least one read. */
  seeds: number
  byStyle: Record<StyleId, AccuracyByStyle>
}

/** The P8 ∞ health gate's tally: every ∞ game must reproduce the full-strength game exactly. */
export interface InfReproduction {
  games: number
  /** Games whose all-bare replay differed in log, read, or step count. Must be 0. */
  deviations: number
}

/** Provenance of the E4b run — the games behind `accuracySingle`, not the base suite's. */
export interface BoundedAccuracySingleMeta {
  /** When the E4b run's games were played. */
  generatedAt: string
  /** The engine commit that PLAYED the E4b games. */
  engineCommit: string
  gamesTotal: number
  movesTotal: number
  workers: number
  wallMs: number
  gamesPerSecond: number
  recordsDigest: string
  /** The run's notes — the registered read-seat mapping is written here BEFORE the run. */
  notes: string[]
}

/**
 * The E4b block of the published artifact — additive: the extension appends it beside the base
 * sections. `extendBoundedResults`'s docstring states exactly what is verified about the
 * carried sections; this comment claims no more than that.
 */
export interface BoundedAccuracySingle {
  meta: BoundedAccuracySingleMeta
  /** The registered read-seat mapping, verbatim — {@link SingleReadMapping} in bounded.ts. */
  mapping: string
  health: BoundedHealthSummary
  cells: SingleAccuracyCell[]
  /** The P8 statistic: same per-seed paired rule as P7's deltas. */
  deltas: AccuracyAdjacentDelta[]
  infReproduction: InfReproduction
}

/**
 * The E4b-power block — the P8 verdict of record since schema 3. The same shape as the pilot's
 * block plus the run's own grid parameters, which the pilot never needed (its grid was
 * guard-enforced equal to the base config's): `accGames` games per pairing on the
 * `accSeedPrefix` seed list, both registered before the run.
 */
export interface BoundedAccuracySinglePower {
  meta: BoundedAccuracySingleMeta
  /** Games per pairing — {@link BOUNDED_POWER_ACC_GAMES} per the E4b-power registration. */
  accGames: number
  /** The fresh seed prefix, disjoint from the pilot's — {@link BOUNDED_POWER_SEED_PREFIX}. */
  accSeedPrefix: string
  /** The registered read-seat mapping, verbatim at the run's game count — rule unchanged. */
  mapping: string
  health: BoundedHealthSummary
  cells: SingleAccuracyCell[]
  /** The P8 statistic: same per-seed paired rule as P7's deltas, unchanged from the pilot. */
  deltas: AccuracyAdjacentDelta[]
  infReproduction: InfReproduction
}

/**
 * The 50-seed E4b pilot, retained verbatim (schema 3). Every field of
 * {@link BoundedAccuracySingle} is carried byte-identically from the committed schema-2
 * artifact; the three additions record what the pilot said and what it licensed. The pilot's
 * CONFIRMED was an underpowered null at the P7 effect size (~52% power; its 64→∞ CI contained
 * the entire P7 effect), so it licensed only the within-design claim that no rung violated at
 * its N — the power run in `accuracySingle` is the P8 verdict of record.
 */
export interface BoundedAccuracySinglePilot extends BoundedAccuracySingle {
  /** The pilot's P8 verdict exactly as committed at schema 2 — superseded, not rewritten. */
  verdict: BoundedVerdict
  /** The pilot's ×3 Bonferroni family exactly as committed at schema 2. */
  multiplicityFamily: MultiplicityFamily
  /** The labelling: what this block is, and what its verdict did and did not license. */
  note: string
}

/**
 * The cross-design comparison the E4b-power registration names, labelled as exactly that: the
 * difference-of-deltas test between P7's violated rung (E4 — BOTH teams bounded, so ecology
 * and signature move together) and P8's same rung (E4b-power — one bounded read seat in a
 * full-strength ecology), plus P8's post-hoc power at the P7 effect size. A comparison ACROSS
 * designs, never a within-design test; no registered verdict rule reads any number here.
 */
export interface BoundedCrossDesign {
  /** The compared rung — P7's violated rung and P8's same rung ({@link BOUNDED_INF_BITS} top). */
  fromBits: number
  toBits: number
  /** P7's rung, quoted from the committed base artifact. */
  p7: { delta: number; se: number; seeds: number }
  /** P8's rung from the power run of record. */
  p8: { delta: number; se: number; seeds: number }
  /** `p8.delta − p7.delta`. */
  diffOfDeltas: number
  /** `√(p7.se² + p8.se²)` — the power run's seed list is disjoint from E4's, so the two rungs
   * are independent and the covariance term is zero by construction. */
  se: number
  z: number
  /** Two-sided p for a difference this large under H0 (equal deltas). */
  pTwoSided: number
  /** `|p7.delta|` — the effect size the power is computed at. */
  effect: number
  /** The refutation rule's minimum detectable effect at the record run's rung SE: `2·p8.se`. */
  mde: number
  /** `Φ(effect/p8.se − 2)` — P(the registered rule refutes | the true single-seat delta is −effect). */
  postHocPower: number
  /** The 50-seed pilot's same three numbers, retained for the correction record. */
  pilot: { se: number; mde: number; postHocPower: number }
  note: string
}

/**
 * One rung of a Bonferroni-annotated family. `pOneSided` is Φ(z) — the one-sided p of a
 * violation this deep under H0 (delta = 0); `pBonferroni` is min(1, m·p) for the family's m
 * comparisons. `violatesRaw` restates the registered rule (`delta < −2·SE`); the annotation
 * NEVER alters that rule or any committed verdict.
 */
export interface MultiplicityRung {
  fromBits: number
  toBits: number
  delta: number
  se: number
  z: number
  pOneSided: number
  pBonferroni: number
  violatesRaw: boolean
  /** delta < 0 and `pBonferroni` < the family alpha. */
  violatesBonferroni: boolean
}

/** The ×m Bonferroni annotation over one adjacent-rung family (P7's or P8's; m = 3 each). */
export interface MultiplicityFamily {
  id: 'P7' | 'P8'
  comparisons: number
  alpha: number
  rungs: MultiplicityRung[]
  note: string
}

/* -- run output and health ------------------------------------------------------------------ */

/** The same gate shape the adaptive suite emits — the discipline is identical by design. */
export type BoundedHealthSummary = AdaptiveHealthSummary

export interface BoundedRunMeta {
  schemaVersion: number
  generatedAt: string
  config: BoundedLabConfig
  gamesTotal: number
  movesTotal: number
  workers: number
  wallMs: number
  gamesPerSecond: number
  recordsDigest: string
  /** Anything a reader must know to trust the numbers: encodings, estimator definitions. */
  notes: string[]
}

/** The aggregates alone — what `run.json` holds and `buildBoundedResults` consumes. */
export interface BoundedRunSummary {
  meta: BoundedRunMeta
  health: BoundedHealthSummary
  ladder: LadderCell[]
  ladderDeltas: LadderAdjacentDelta[]
  mirrorExact: MirrorExact
  tiers: TierCell[]
  evidence: EvidenceCurve[]
  accuracy: BoundedAccuracy
}

/** What `assembleBoundedRun` returns and the launcher writes out. */
export interface BoundedRunOutput extends BoundedRunSummary {
  /** Canonical order: experiment, cell, pair, orientation. Never worker-arrival order. */
  records: BoundedGameRecord[]
}

/** The E4b run's aggregates alone — what its `run.json` holds and `extendBoundedResults` reads. */
export interface BoundedSingleRunSummary {
  meta: BoundedRunMeta
  health: BoundedHealthSummary
  cells: SingleAccuracyCell[]
  deltas: AccuracyAdjacentDelta[]
  infReproduction: InfReproduction
}

/** What `assembleBoundedSingleRun` returns and the E4b launcher writes out. */
export interface BoundedSingleRunOutput extends BoundedSingleRunSummary {
  /** Canonical order, as ever. */
  records: BoundedGameRecord[]
}

/* -- the published artifact ----------------------------------------------------------------- */

/** The committed v1.0 accuracy anchor the P7 detail is read against (never a gate). */
export interface BoundedBaselineInput {
  artifact: string
  recordsDigest: string
  /** The v1.0 classifier's end-of-game top-1 over the same pairings and seeds. */
  endTop1: number
}

export interface BoundedArtifactInputs {
  engineCommit: string
  rulesHash: string
  rulesFile: string
  generatedAt: string
  baseline?: BoundedBaselineInput
}

export interface BoundedResultsMeta {
  schemaVersion: number
  generatedAt: string
  engineCommit: string
  rulesHash: string
  rulesFile: string
  ruleSet: 'us54'
  config: BoundedLabConfig
  gamesTotal: number
  seedSet: { prefix: string; count: number }
  wallMs: number
  recordsDigest: string
  notes: string[]
  health: BoundedHealthSummary
  baseline: BoundedBaselineInput | null
  predictions: BoundedPrediction[]
}

/**
 * The base-suite artifact shape (schema {@link BOUNDED_BASE_SCHEMA_VERSION}) — what
 * `buildBoundedResults` emits and what was committed before E4b. `extendBoundedResults`
 * consumes this and upgrades it, carrying every section over byte-identically.
 */
export interface BoundedResultsBase {
  meta: BoundedResultsMeta
  ladder: LadderCell[]
  ladderDeltas: LadderAdjacentDelta[]
  mirrorExact: MirrorExact
  tiers: TierCell[]
  evidence: EvidenceCurve[]
  accuracy: BoundedAccuracy
  verdicts: BoundedVerdict[]
}

/**
 * The pilot-extended artifact shape (schema {@link BOUNDED_PILOT_SCHEMA_VERSION}) — what
 * `extendBoundedResults` emits and what was committed with the E4b pilot.
 * `extendBoundedResultsPower` consumes this and upgrades it, carrying every base section over
 * byte-identically and the pilot block verbatim into `accuracySinglePilot`.
 */
export interface BoundedResultsPilot extends BoundedResultsBase {
  accuracySingle: BoundedAccuracySingle
  multiplicity: MultiplicityFamily[]
}

/**
 * The one artifact `/lab/bounded` will read — `src/lab/data/bounded-results.json`, schema
 * {@link BOUNDED_SCHEMA_VERSION}: the base suite; the E4b-power run as the P8 verdict of
 * record in `accuracySingle` (the P8 entry of `verdicts` and the P8 `multiplicity` family are
 * computed from it by the unchanged rules); the 50-seed pilot retained verbatim in
 * `accuracySinglePilot`; and the labelled `crossDesign` comparison.
 */
export interface BoundedResults extends BoundedResultsBase {
  accuracySingle: BoundedAccuracySinglePower
  accuracySinglePilot: BoundedAccuracySinglePilot
  crossDesign: BoundedCrossDesign
  multiplicity: MultiplicityFamily[]
}
