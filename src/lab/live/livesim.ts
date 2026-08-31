/**
 * livesim.ts — the pure heart of `/lab/live`.
 *
 * BOT_LAB.md §7 sanctions exactly one in-browser simulation: *"a Web Worker may run a few
 * hundred live games for the interactive demo."* This module is everything about that demo that
 * is NOT plumbing — the pair player, the aggregation, the message contract, the caps — kept
 * free of `Worker`, `postMessage` and the DOM so the Node-environment vitest suite can cover it
 * (SITE_SPEC.md §4.4: the test runner has no jsdom, so anything only a worker executes is
 * untested code). `sim.worker.ts` imports this and adds a message loop; `LabLive.tsx` imports
 * this and adds a page. Neither adds arithmetic.
 *
 * ## The demo replays the lab's discipline, not an approximation of it
 *
 * Seeds come from `seedFor`, start seats from `startSeatFor`, and every pair is one seed played
 * in both orientations through `playGameSeats` — the identical entry point, options and
 * seed-chain the committed matrix used, so a live cell at 4,300 pairs would reproduce the
 * artifact's numbers exactly. What the demo changes is only the sample size, which is why the
 * page around it must (and does) print the SE and point at the committed cell rather than
 * letting a 100-pair number stand as evidence.
 *
 * ## Why the cap is 400 pairs
 *
 * The engine runs tens of thousands of moves a second, but a us54 game spends several hundred
 * steps in declare windows, so 400 pairs is 800 games ≈ a few hundred thousand decisions —
 * tens of seconds of a single worker thread's wall clock. Past that the demo stops being a
 * demonstration and starts being a bad way to run the real experiment, which is what
 * `scripts/style-sim.mjs` and its worker pool are for.
 *
 * ## `fishai-v1` and the StyleId widening
 *
 * The tenth pick is the adaptive engine, `{ adaptive: true }` as its published `PolicySpec`
 * shape. The lab's record types name styles as the engine's `StyleId` union, and `fishai-v1`
 * is deliberately not in it — same situation as `verdict.ts`, and the same answer: the lab
 * only ever carries these ids into labels and keys, never dispatches on them, so a documented
 * widening cast costs nothing and refusing it would bar the demo from the one policy the page
 * exists to demonstrate. The adaptive seat's `leakStyle` is its anchor (Balanced), exactly as
 * the `play.ts` header prescribes for a seat whose style moves during the game.
 */
import { ALL_SEATS, STYLE_IDS, STYLE_ROSTER, seatTeam } from '../../../lib/engine/index.ts'
import type { PolicySpec, StyleId, StyleParams, Team } from '../../../lib/engine/index.ts'
import { aggregateCell, playGameSeats, seedFor, startSeatFor } from '../../../lib/lab/index.ts'
import type {
  CellSpec,
  LabCellAggregate,
  LabGameRecord,
  Orientation,
  PlayOptions,
  SeatSpec,
} from '../../../lib/lab/index.ts'

/* -- the picks ---------------------------------------------------------------------------- */

export const ADAPTIVE_ID = 'fishai-v1'
export type LivePolicyId = StyleId | typeof ADAPTIVE_ID

/**
 * The ten picks: the measured roster plus the adaptive engine.
 *
 * All ten defuse. `defuse: 1` sits on the `BALANCED` base in
 * [roster.ts](../../../lib/engine/bots/roster.ts) that every style spreads from, so v2.0's
 * defusal term is live in all nine roster picks, and the adaptive pick inherits it through
 * whichever style it delegates to. The nine names are names of *styles*, not of an engine
 * version: a pick labelled "Blitz" is Blitz as v2.0 plays it.
 *
 * That is what keeps the reproduction claim above true rather than breaking it. The default
 * committed matrix (`style-results.v2.json`) and the counter table the adaptive pick reads were
 * both re-measured against this same knob ladder, defusal included, so a live cell still lines
 * up with the committed cell of the same name. The older cases reachable by `?case=` predate the
 * term and do not.
 */
export const LIVE_POLICY_IDS: readonly LivePolicyId[] = [...STYLE_IDS, ADAPTIVE_ID]

export function isLivePolicyId(id: string): id is LivePolicyId {
  return id === ADAPTIVE_ID || (STYLE_IDS as readonly string[]).includes(id)
}

/**
 * The pick's name in the UI. The roster styles print their roster label; the adaptive pick names
 * its architecture (v1.0) and the concession term every style now carries (v2.0), the same two
 * halves `ADAPTIVE_LABEL` prints at the play table.
 */
export function livePolicyLabel(id: LivePolicyId): string {
  return id === ADAPTIVE_ID ? 'FishAI v1.0 adaptive · v2.0 defusal' : STYLE_ROSTER[id].label
}

/* -- the run configuration ---------------------------------------------------------------- */

/** Where the demo stops being a demo — see the file header. */
export const LIVE_PAIR_CAP = 400
/** One progress message per chunk (BOT_LAB.md §7: progress per chunk of 10 pairs). */
export const LIVE_CHUNK_PAIRS = 10
/** The pair counts the page offers. Default 100. */
export const LIVE_PAIR_CHOICES: readonly number[] = [25, 50, 100, 200]
export const LIVE_DEFAULT_PAIRS = 100
export const LIVE_DEFAULT_PREFIX = 'live'

/** Identical to `DEFAULT_LAB_CONFIG`: same step cap, same invariant discipline, same variant. */
const LIVE_PLAY_OPTS: PlayOptions = {
  variant: 'us54',
  stepCap: 5000,
  invariantCheck: 'every',
}

export interface LiveConfig {
  a: LivePolicyId
  b: LivePolicyId
  pairs: number
  seedPrefix: string
}

/** Enforce the cap and floor whatever arrives — the worker trusts no message. */
export function clampPairs(pairs: number): number {
  if (!Number.isFinite(pairs)) return LIVE_DEFAULT_PAIRS
  return Math.max(1, Math.min(LIVE_PAIR_CAP, Math.floor(pairs)))
}

export function normalisePrefix(raw: string): string {
  const trimmed = raw.trim()
  return trimmed === '' ? LIVE_DEFAULT_PREFIX : trimmed.slice(0, 64)
}

/* -- playing one duplicate pair ----------------------------------------------------------- */

/** See the file header — the same argument, verbatim, as `asStyleId` in `verdict.ts`. */
const asStyleId = (id: string): StyleId => id as StyleId

/** One shared frozen spec: the adaptive engine carries no state, so one object serves all. */
const ADAPTIVE_SPEC: PolicySpec = Object.freeze({ adaptive: true })

function policyOf(id: LivePolicyId): PolicySpec {
  return id === ADAPTIVE_ID ? ADAPTIVE_SPEC : STYLE_ROSTER[id]
}

/** The style whose `leakThreshold` prices the seat's leak measurement (play.ts header). */
function leakStyleOf(id: LivePolicyId): StyleParams {
  return id === ADAPTIVE_ID ? STYLE_ROSTER.balanced : STYLE_ROSTER[id]
}

export function liveCellSpec(config: LiveConfig): CellSpec {
  return { index: 0, id: `${config.a}-vs-${config.b}`, a: asStyleId(config.a), b: asStyleId(config.b) }
}

/** BOT_LAB.md §4.1 — win 1, tie 0.5 (impossible under us54, asserted upstream), loss 0. */
function scoreRate(setsA: number, setsB: number): number {
  if (setsA > setsB) return 1
  if (setsB > setsA) return 0
  return 0.5
}

/**
 * One duplicate pair: one seed, one start seat, both orientations — byte-for-byte the pairing
 * `runTask` forms, generalised to any `PolicySpec` per side via `playGameSeats`.
 */
export function playLivePair(config: LiveConfig, pair: number): [LabGameRecord, LabGameRecord] {
  const seed = seedFor(config.seedPrefix, pair)
  const startSeat = startSeatFor(pair)
  const cellId = `${config.a}-vs-${config.b}`
  const out: LabGameRecord[] = []
  for (const orient of [0, 1] as Orientation[]) {
    const aTeam: Team = orient === 0 ? 0 : 1
    const seats = ALL_SEATS.map(
      (seat): SeatSpec =>
        seatTeam(seat) === aTeam
          ? { policy: policyOf(config.a), leakStyle: leakStyleOf(config.a) }
          : { policy: policyOf(config.b), leakStyle: leakStyleOf(config.b) },
    )
    const g = playGameSeats(seats, seed, startSeat, LIVE_PLAY_OPTS)
    const setsA = g.sets[aTeam]
    const setsB = g.sets[(1 - aTeam) as Team]
    out.push({
      cell: cellId,
      a: asStyleId(config.a),
      b: asStyleId(config.b),
      pair,
      orient,
      seed,
      startSeat,
      aTeam,
      steps: g.steps,
      finished: g.finished,
      capped: g.capped,
      illegal: g.illegal,
      invariantViolations: g.invariantViolations,
      setsA,
      setsB,
      unresolved: g.unresolved,
      voids: g.voids,
      endgameReached: g.endgameReached,
      aResult: scoreRate(setsA, setsB),
      clinch: g.clinch,
      ca: g.counters[aTeam],
      cb: g.counters[(1 - aTeam) as Team],
    })
  }
  return [out[0], out[1]]
}

/* -- aggregation -------------------------------------------------------------------------- */

export interface LiveResult {
  config: LiveConfig
  /** True when a stop cut the run short: the numbers describe `pairsDone` pairs, not the ask. */
  partial: boolean
  pairsDone: number
  cell: LabCellAggregate
}

/**
 * Fold whatever finished into the published cell shape via the lab's own `aggregateCell` —
 * same paired estimator, same SE, same §4.2 metric formation. On a partial run the expectation
 * is set to the pairs actually completed, so the health fields describe the games that were
 * played rather than accusing a stop of losing seeds.
 */
export function aggregateLive(
  config: LiveConfig,
  records: readonly LabGameRecord[],
  partial: boolean,
): LiveResult {
  const pairsDone = Math.floor(records.length / 2)
  const cell = aggregateCell(liveCellSpec(config), [...records], pairsDone)
  return { config, partial, pairsDone, cell }
}

/* -- the matrix pointer ------------------------------------------------------------------- */

/**
 * The committed matrix stores each pairing once, in roster order (`cellList`: i < j over
 * `STYLE_IDS`), and `/lab/matrix` anchors every stored cell as `cell-{a}-{b}`. Mirrors and
 * self-pairings have no stored cell, hence `null`.
 */
export function matrixCellAnchor(a: LivePolicyId, b: LivePolicyId): string | null {
  if (a === ADAPTIVE_ID || b === ADAPTIVE_ID || a === b) return null
  const ia = STYLE_IDS.indexOf(a)
  const ib = STYLE_IDS.indexOf(b)
  return ia < ib ? `cell-${a}-${b}` : `cell-${b}-${a}`
}

/* -- the worker message contract ---------------------------------------------------------- */

/** Everything crossing the worker boundary is a plain structured-cloneable object. */
export interface LiveRunMessage {
  type: 'run'
  config: LiveConfig
}
export interface LiveStopMessage {
  type: 'stop'
}
export type LiveToWorker = LiveRunMessage | LiveStopMessage

export interface LiveProgressMessage {
  type: 'progress'
  pairsDone: number
  pairsTotal: number
  games: number
}
export interface LiveResultMessage {
  type: 'result'
  result: LiveResult
}
export interface LiveErrorMessage {
  type: 'error'
  detail: string
}
export type LiveFromWorker = LiveProgressMessage | LiveResultMessage | LiveErrorMessage
