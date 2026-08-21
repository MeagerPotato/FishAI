/**
 * types.ts — the data contract of the duplicate-deal simulation runner
 * ([BOT_LAB.md](../../BOT_LAB.md) §5/§6, metrics §4, plus the `us54` deltas of
 * [STYLES.md](../../STYLES.md) §4).
 *
 * Everything here is **plain data**: structured-cloneable across a `worker_threads` boundary,
 * JSON-serialisable without a replacer, and free of any platform import. That is the whole
 * reason the lab's substance lives under `lib/` — `scripts/` is outside `tsconfig.app.json`'s
 * `include` and is linted but never typechecked, so a shape mismatch there is found at runtime
 * or not at all. The only things left in `scripts/` are the `new Worker(...)` call and the file
 * writes.
 *
 * ## Counter-first, ratio-later
 *
 * Every per-game measurement below is an integer **counter**, never a pre-divided rate. Rates
 * are formed once, in [aggregate.ts](aggregate.ts), from summed counters across a whole cell.
 * Averaging per-game ratios would weight a 40-ask game the same as a 400-ask one and would make
 * a game with zero declares an undefined term rather than a zero contribution.
 */
import type { BotDifficulty, BookId, Seat, StyleId, Team, Variant } from '../engine/index.ts'

/** Bump when the emitted JSON shape changes in a way a reader must notice. */
export const LAB_SCHEMA_VERSION = 1

/**
 * Which orientation of a duplicate pair a game is (BOT_LAB.md §5.1). `0` seats style *a* on
 * team 0 (seats 0/2/4); `1` seats it on team 1 (seats 1/3/5). Seed and starting seat are held
 * identical across the two, so the **only** difference is which style sits on which team.
 */
export type Orientation = 0 | 1

/** One unordered style pairing — a cell of the BOT_LAB.md §4.4 payoff matrix. */
export interface CellSpec {
  index: number
  /** `${a}-vs-${b}`, stable and filename-safe. */
  id: string
  a: StyleId
  b: StyleId
}

/**
 * A unit of work handed to one worker: a contiguous slice of pairs of a single cell.
 *
 * Chunking by *pairs within a cell* rather than by whole cells is what keeps 36 cells busy on
 * 22 workers. Both orientations of a pair always stay in the same task, so the paired estimator
 * of §5.1 is never split across threads and the duplicate difference is computed on data one
 * thread produced.
 */
export interface LabTask {
  index: number
  cell: CellSpec
  /** Inclusive. */
  pairFrom: number
  /** Exclusive. */
  pairTo: number
  seedPrefix: string
  variant: Variant
  stepCap: number
  invariantCheck: InvariantCheck
  /**
   * Optional BOT_LAB.md §1.3 skill ablation: force both styles onto a weaker inference engine.
   * Absent (the default) means every style plays at full strength, which is the §1.3 rule that
   * keeps "style" from silently becoming "skill".
   */
  skill?: BotDifficulty
}

/**
 * How often `checkInvariants` runs. `every` is the BOT_LAB.md §4.3 health gate as written and
 * is the default; the cheaper settings exist for throughput experiments and are recorded in the
 * run's `meta` so a result can never quietly claim a gate it did not run.
 */
export type InvariantCheck = 'every' | 'final' | 'off'

/**
 * One side's raw counters for one game. Integers only (see the file header).
 *
 * "Side" means *the three seats of one team in this game*. Which style that was is fixed by the
 * record's `orient`.
 */
export interface SideCounters {
  // --- tempo (BOT_LAB.md §4.2) ---------------------------------------------
  asks: number
  hits: number
  /** Times the turn arrived at one of this side's seats, counting the opening seat. */
  turnsGained: number

  // --- declares (BOT_LAB.md §4.2 + STYLES.md §4) ---------------------------
  declares: number
  /** Row 13: the set was awarded to the declarer's own team. */
  declaresCorrect: number
  /** Row 14: any error at all — the set was awarded to the opponents. Replaces `void`. */
  declaresWrong: number
  /**
   * Declares made while `decline` was **illegal** (RULES_US54.md §3.2 `MUST_DECLARE`). These
   * are not policy choices, so every rate below is also reported with them removed — a style's
   * `foreignDeclareRate` must not be inflated by declares the rules forced on it.
   */
  declaresForced: number
  /** Of `declares`: the declarer held no card of the set (STYLES.md §1.3 / §4). */
  foreignDeclares: number
  /** Of `declaresForced`: same, so the chosen-only rate is a clean subtraction. */
  foreignDeclaresForced: number
  /** Of `declaresForced`: wrong, likewise. */
  declaresWrongForced: number

  // --- sets ----------------------------------------------------------------
  /** Sets awarded to this side, from any cause (RULES_US54.md row 20). */
  setsWon: number
  /** Of `setsWon`: awarded because the **opponents** declared wrongly. */
  setsGifted: number

  // --- STYLES.md §4 new metrics -------------------------------------------
  /**
   * Wrong declares made on a set this side **fully held** at that moment — i.e. a correct
   * declare was available to the team and a seat took the wrong one first. STYLES.md §4's
   * "cost of hesitation", measured as the team-level event.
   */
  raceLosses: number
  /** Correct declares made while the opponents stood at `clinchTarget - 1` sets. */
  clinchDenials: number
  /**
   * The single set award that took this side to `clinchTarget` and ended the game — **either**
   * its own correct declare **or** the opponents' wrong one (RULES_US54.md row 20: every set
   * awarded to your team counts, including sets won because the opponents declared wrongly).
   * Exactly one side scores 1 in every finished `us54` game, which is asserted, not assumed.
   */
  clinchWins: number
  /** Sum of per-set declare latency, in declare-window offers made to this side. */
  latencySum: number
  /** Number of terms in `latencySum` (correct declares of a set that became holdable). */
  latencyCount: number
  /** Declare-window offers this side received across the game — the latency denominator unit. */
  declareOffers: number

  // --- information / hoarding (BOT_LAB.md §4.2) ----------------------------
  /** Asks into a set this side already held >= its own `leakThreshold` cards of. */
  leakyAsks: number
  /** Sum of the per-sample mean, over this side's 3 seats, of distinct sets held. */
  hoardSum: number
  hoardSamples: number

  // --- Row 19 --------------------------------------------------------------
  /** Step index at which each of this side's seats first emptied; absent seats never did. */
  dropoutSteps: number[]
}

/** One played game. This is the JSONL line. */
export interface LabGameRecord {
  cell: string
  a: StyleId
  b: StyleId
  pair: number
  orient: Orientation
  seed: string
  startSeat: Seat
  /** The team style *a* played in this game — `0` when `orient` is 0, else `1`. */
  aTeam: Team
  steps: number
  finished: boolean
  /** Hit `stepCap` without finishing. Load-bearing: RULES_US54.md §3.2 proves livelock exists. */
  capped: boolean
  /** Actions `reduce` rejected. Health gate: must be 0. */
  illegal: number
  /** `checkInvariants` findings. Health gate: must be 0. */
  invariantViolations: number
  setsA: number
  setsB: number
  unresolved: number
  /** `pagat48` only (RULES.md row 15); row 14 abolishes the outcome under `us54`. */
  voids: number
  /** `pagat48` only (RULES.md row 21); always false under `us54`. */
  endgameReached: boolean
  /** Score rate contribution for *a*: win 1, tie 0.5, loss 0 (BOT_LAB.md §4.1). */
  aResult: number
  /** True when the game ended on a clinch at exactly `clinchTarget` sets. */
  clinch: boolean
  ca: SideCounters
  cb: SideCounters
}

/** Everything one worker task produces. */
export interface LabTaskResult {
  taskIndex: number
  cellIndex: number
  records: LabGameRecord[]
  wallMs: number
}

/** The derived, publishable rates for one side of one cell (BOT_LAB.md §4.2, STYLES.md §4). */
export interface SideMetrics {
  askHitRate: number
  turnRetention: number
  claimPrecision: number
  /**
   * BOT_LAB.md §4.2's "books scored ÷ claims attempted". Under `us54` this is **identical to
   * `claimPrecision`** by construction: row 14 abolishes the void, so every declare resolves the
   * set to exactly one team and "scored" and "correct" are the same event. Emitted anyway for
   * schema fidelity with §7.1, and reported as coinciding rather than as two findings.
   */
  claimYield: number
  /** STYLES.md §4: `voidRate` -> `concedeRate`. A different event, not a rename. */
  concedeRate: number
  /** `concedeRate` over declares the style actually chose (forced declares removed). */
  concedeRateChosen: number
  foreignDeclareRate: number
  foreignDeclareRateChosen: number
  /** Mean declare-window offers this side received between a set becoming holdable and banking it. */
  declareLatency: number
  raceLossesPerGame: number
  clinchDenialsPerGame: number
  leakIndex: number
  hoardIndex: number
  /** Sets awarded to this side per game because the opponents declared wrongly. */
  giftsPerGame: number
  setsPerGame: number
  declaresPerGame: number
  forcedDeclareRate: number
  /** Mean step index at which a seat of this side emptied, over seats that emptied. */
  dropoutStep: number
  /** Fraction of this side's seat-games that ended cardless. */
  dropoutRate: number
}

/** A game that hit the step cap — reported individually and loudly, never discarded silently. */
export interface CappedGame {
  cell: string
  seed: string
  orient: Orientation
  startSeat: Seat
  steps: number
}

/** One cell of the payoff matrix (BOT_LAB.md §7.1 `matrix[]`, with the STYLES.md §4 deltas). */
export interface LabCellAggregate {
  index: number
  id: string
  a: StyleId
  b: StyleId
  pairs: number
  games: number
  /** BOT_LAB.md §5.2 / §10.6: determinism is not sampling. Must equal `pairs`. */
  distinctSeeds: number

  /** Duplicate-averaged score rate for *a*. `aScore + bScore == 1` by construction. */
  aScore: number
  /** SE of the paired mean — the §5.1 estimator, not the flat one. */
  se: number
  ci95: [number, number]
  /** SE the same data would have given unpaired; `varianceRatio` is the §5.1 1.36x, measured. */
  seUnpaired: number
  varianceRatio: number

  aWins: number
  bWins: number
  /** RULES_US54.md §5: arithmetically impossible. Asserted 0, not merely reported. */
  ties: number
  /** Mean `setsA - setsB` per game (STYLES.md §4: compressed by the clinch). */
  setMargin: number
  /** Mean sets at the moment of the clinch, a's side then b's (STYLES.md §4). */
  setsAtClinch: [number, number]
  /** Mean unresolved sets at game end (STYLES.md §4 — never print a bare "5-3"). */
  unresolved: number
  avgMoves: number
  maxMoves: number
  endgameIncidence: number

  metrics: { a: SideMetrics; b: SideMetrics }
  health: CellHealth
}

/** BOT_LAB.md §4.3 health counters, per cell. */
export interface CellHealth {
  illegalActions: number
  cappedGames: number
  invariantViolations: number
  ties: number
  /** `pagat48` only; row 14 abolishes the outcome under `us54`. */
  voids: number
  /** Games that did not end on a clinch at exactly `clinchTarget` (`us54` only). */
  nonClinch: number
  distinctSeeds: number
  expectedSeeds: number
}

/** How the run was configured. Reproducing a run needs exactly this. */
export interface LabRunConfig {
  styles: readonly StyleId[]
  pairs: number
  seedPrefix: string
  chunkPairs: number
  variant: Variant
  stepCap: number
  invariantCheck: InvariantCheck
  skill?: BotDifficulty
}

/** Run-level provenance and gates. */
export interface LabRunMeta {
  schemaVersion: number
  generatedAt: string
  config: LabRunConfig
  toggles: Record<string, boolean>
  books: readonly BookId[]
  clinchTarget: number
  cells: number
  gamesTotal: number
  workers: number
  wallMs: number
  gamesPerSecond: number
  movesTotal: number
  movesPerSecond: number
  /**
   * FNV-1a over the canonical JSONL. Two runs of the same seed set on the same engine must
   * produce the same digest — that is what "reproducible from the seed set alone" means
   * operationally, and it is checkable in one line.
   */
  recordsDigest: string
}

/** The whole run: what `assembleRun` returns and what the launcher writes out. */
export interface LabRunOutput {
  meta: LabRunMeta
  health: RunHealth
  cells: LabCellAggregate[]
  /** Canonical order: cell index, then pair, then orientation. Never worker-arrival order. */
  records: LabGameRecord[]
}

/** The §4.3 gate. `ok: false` VOIDS the run — the numbers must not be published. */
export interface RunHealth {
  ok: boolean
  illegalActions: number
  cappedGames: number
  invariantViolations: number
  ties: number
  voids: number
  nonClinch: number
  distinctSeeds: number
  expectedSeeds: number
  /** Every capped game, individually. RULES_US54.md §3.2: instrument the cap, never discard. */
  capped: CappedGame[]
  /** Human-readable gate failures, empty iff `ok`. */
  violations: string[]
}
