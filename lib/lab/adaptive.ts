/**
 * adaptive.ts — the FishAI v1.0 experiment suite: gauntlet, mixed screen, oracle ablation,
 * classifier accuracy (SPEC Stage 2b/2c; the data contract is
 * [adaptive-types.ts](adaptive-types.ts), the predictions it tests are written there too).
 *
 * Everything substantial about the v1.0 experiments lives HERE, typechecked, for the reason
 * [types.ts](types.ts) gives: `scripts/adaptive-sim.mjs` is linted but never typechecked, so it
 * is kept to flag parsing, worker plumbing and file writes. `runAdaptiveTask` is — exactly like
 * [task.ts](task.ts)'s `runTask` — a **pure function of its argument**: same task in,
 * byte-identical result out, on any thread, in any order. The pool is a throughput device, not
 * a source of variation.
 *
 * ## The four experiments, and what each one holds fixed
 *
 * 1. **Gauntlet** — a pure adaptive team against each of the nine static styles, on seed prefix
 *    `style-v1` at 4,300 pairs per cell: **matrix v2's exact seed list**, both orientations,
 *    start seat `pair % 6`. That choice is the experiment: every deal behind punter's committed
 *    v2 row is replayed by the adaptive team, so the punter row is a per-deal benchmark (the
 *    caveat — the pairing is cross-run — is documented in adaptive-types.ts). Gauntlet games
 *    also record, via `SeatPlayOptions.observe`, which style every adaptive decision delegated
 *    to (`chooseStyle` re-run in the observer on the exact view `decide` received — the same
 *    spec object, so the recorded delegation IS what was played), split warmup/warm by the same
 *    phase-truncation rule the engine itself gates on.
 * 2. **Adaptive mirror** — 400 pairs of adaptive-vs-adaptive on the same prefix. The adaptive
 *    policy is deterministic and identical on both teams, so the two orientations of a pair are
 *    literally the same game and the paired score is **exactly** 0.5 with SE exactly 0. It is
 *    a plumbing symmetry check, not a measurement, and is asserted as such in the tests.
 * 3. **Mixed screen** — 24 opponent compositions × 400 pairs on prefix `mixed-v1`, each played
 *    TWICE: adaptive team vs the composition, and punter team vs the same composition on the
 *    same seeds, start seats and orientations. The headline is the pooled per-deal delta
 *    (adaptive − punter), truly paired within this run — with its SE clustered by seed,
 *    because every composition replays the identical seed list and the per-deal deltas at one
 *    seed share the deal (`mixedPooledFromRecords`). Compositions are the stride-7 sample
 *    of the 165 lexicographic 3-multisets of the roster — deterministic, documented, no seeded
 *    shuffle to argue about (see `mixedCompositionList`). A composition's three styles sit on
 *    the opposing team's three seats in ascending style-id order against ascending seat order.
 * 4. **Oracle ablation** — the nine gauntlet cells re-run at 400 pairs with `oracleStyles`
 *    handing the adaptive seats the true opponent styles. The classifier arm is not re-run:
 *    the gauntlet's first 400 pairs ARE the classifier arm on the identical seeds, so the
 *    per-deal delta is formed against them directly. (With the committed counter table the
 *    dominance argument makes both arms delegate identically at every decision, so the
 *    expected measurement is exactly zero — which is the P3 prediction, measured rather than
 *    assumed.)
 * 5. **Classifier accuracy** — the 36 style pairings, 50 single games each on prefix
 *    `clsacc-v1`, start seat rotating; no duplicate orientation, because the measured quantity
 *    is classification, not payoff. At event checkpoints {40, 80, 150, 250} the finished
 *    game's public log is truncated by the exact slice discipline of
 *    `scripts/gen-fingerprints.mjs` — `{ ...pv, log: pv.log.slice(0, cp) }`, and a checkpoint
 *    only scores games whose log is strictly longer than it — plus once on the full log
 *    (recorded as events 0), and `classifySeats` top-1 is scored per seat against the seat's
 *    true style. `observeSeats` replays hand counts from the log alone, which is what makes
 *    the truncation honest (observe.ts header).
 *
 * ## Health discipline
 *
 * The BOT_LAB.md §4.3 gates apply to every experiment: 0 illegal actions, 0 capped games
 * (each one **named**, never dropped), 0 invariant violations, and under `us54` 0 ties,
 * 0 voids, 0 non-clinch endings; `distinctSeeds` must equal the expected count per cell
 * (§5.2: a repeated seed is not extra data). Two suite-specific gates are added: the mixed
 * screen's two arms must have played identical (pair, orientation, seed, start seat) sets per
 * composition — the pairing claim is checked, not assumed — and the oracle cells must share
 * their seed list with the gauntlet's head, for the same reason.
 */
import {
  ADAPTIVE_DEFAULTS,
  ADAPTIVE_PHASE_EVENTS,
  ALL_SEATS,
  COUNTER_TABLE,
  STYLE_IDS,
  STYLE_ROSTER,
  checkInvariants,
  chooseStyle,
  classifySeats,
  clinchTarget,
  allBooks,
  decide,
  hashSeed,
  legalActionsSummary,
  newGame,
  publicView,
  reduce,
  seatTeam,
  seatView,
  teamSeats,
} from '../engine/index.ts'
import type { AdaptiveSpec, Seat, SeatView, StyleId, StyleParams, Team } from '../engine/index.ts'
import { FINGERPRINT_PROVENANCE } from '../engine/bots/data/fingerprints.ts'
import { addCounters, sideMetrics, zeroCounters } from './aggregate.ts'
import { seedFor, startSeatFor } from './plan.ts'
import { configFor, playGameSeats } from './play.ts'
import type { PlayedGame, SeatPlayOptions, SeatSpec } from './play.ts'
import { digest } from './run.ts'
import type { CappedGame, CellHealth, Orientation, SideCounters } from './types.ts'
import { ADAPTIVE_PREDICTIONS, ADAPTIVE_SCHEMA_VERSION } from './adaptive-types.ts'
import type {
  AccuracyByStyle,
  AccuracyCheckpoint,
  AccuracyRow,
  AdaptiveCellAggregate,
  AdaptiveGameRecord,
  AdaptiveHealthSummary,
  AdaptiveLabConfig,
  AdaptiveResults,
  AdaptiveRunOutput,
  AdaptiveTaskResult,
  AdaptiveVerdict,
  ClassifierResult,
  GauntletCell,
  GauntletRow,
  MirrorResult,
  MixedResult,
  MixedRow,
  OracleRow,
  StyleUsageRow,
} from './adaptive-types.ts'

/**
 * The full v1.0 experiment as pre-registered: gauntlet on matrix v2's exact seed set (4,300
 * pairs of `style-v1` — the paired benchmark), the smaller experiments at the budgets SPEC
 * Stage 2b names. 125,600 games in total (`adaptiveGamesTotal`, pinned in the tests).
 */
export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveLabConfig = {
  gauntletPairs: 4300,
  gauntletSeedPrefix: 'style-v1',
  mirrorPairs: 400,
  mixedPairs: 400,
  mixedSeedPrefix: 'mixed-v1',
  mixedCompositions: 24,
  oraclePairs: 400,
  accGames: 50,
  accSeedPrefix: 'clsacc-v1',
  accCheckpoints: [40, 80, 150, 250],
  chunkPairs: 25,
  variant: 'us54',
  stepCap: 5000,
  invariantCheck: 'every',
}

/* -- compositions --------------------------------------------------------------------------- */

/**
 * Every 3-multiset of `styles`, in lexicographic order of roster indices (i <= j <= k). For
 * the nine-style roster that is C(9+3-1, 3) = 165 compositions.
 */
export function allThreeMultisets(styles: readonly StyleId[]): (readonly StyleId[])[] {
  const out: (readonly StyleId[])[] = []
  for (let i = 0; i < styles.length; i++) {
    for (let j = i; j < styles.length; j++) {
      for (let k = j; k < styles.length; k++) out.push([styles[i], styles[j], styles[k]])
    }
  }
  return out
}

/**
 * The mixed screen cannot afford all 165 compositions, and a seeded shuffle would be one more
 * thing to document and defend. So the sample is the simplest fully-specified rule there is:
 * enumerate the 165 lexicographic 3-multisets and take **every 7th, starting at index 0** —
 * indices 0, 7, 14, …, 161 — which yields exactly 24 compositions spread across the whole
 * space (from `balanced×3` at index 0 to a deep-roster mix at 161). `count` below 24 takes a
 * prefix of that sample (the tests run 2); above 24 there is nothing left to take and the
 * request is refused rather than silently truncated.
 */
export const MIXED_COMPOSITION_STRIDE = 7

export function mixedCompositionList(count: number): (readonly StyleId[])[] {
  const all = allThreeMultisets(STYLE_IDS)
  const available = Math.floor((all.length - 1) / MIXED_COMPOSITION_STRIDE) + 1
  if (!Number.isInteger(count) || count < 0 || count > available) {
    throw new Error(
      `mixedCompositionList: ${count} compositions requested but the stride-${MIXED_COMPOSITION_STRIDE} ` +
        `sample of ${all.length} multisets has exactly ${available}`,
    )
  }
  const out: (readonly StyleId[])[] = []
  for (let n = 0; n < count; n++) out.push(all[n * MIXED_COMPOSITION_STRIDE])
  return out
}

/** `mixed-07-banker+turtle+ghost` — index-stable and filename-safe. */
export function mixedCellId(index: number, composition: readonly StyleId[]): string {
  return `mixed-${String(index).padStart(2, '0')}-${composition.join('+')}`
}

/* -- the task plan -------------------------------------------------------------------------- */

export type AdaptiveTask =
  | { kind: 'gauntlet'; index: number; config: AdaptiveLabConfig; opponent: StyleId; pairFrom: number; pairTo: number }
  | { kind: 'mirror'; index: number; config: AdaptiveLabConfig; pairFrom: number; pairTo: number }
  | {
      kind: 'mixed'
      index: number
      config: AdaptiveLabConfig
      comp: number
      arm: 'adaptive' | 'punter'
      pairFrom: number
      pairTo: number
    }
  | { kind: 'oracle'; index: number; config: AdaptiveLabConfig; opponent: StyleId; pairFrom: number; pairTo: number }
  | { kind: 'accuracy'; index: number; config: AdaptiveLabConfig; a: StyleId; b: StyleId; gameFrom: number; gameTo: number }

/** The unordered style pairings of the accuracy experiment, in roster order — 36 for 9 styles. */
export function accuracyPairings(): (readonly [StyleId, StyleId])[] {
  const out: (readonly [StyleId, StyleId])[] = []
  for (let i = 0; i < STYLE_IDS.length; i++) {
    for (let j = i + 1; j < STYLE_IDS.length; j++) out.push([STYLE_IDS[i], STYLE_IDS[j]])
  }
  return out
}

/**
 * Slice the whole suite into worker tasks — contiguous pair (or game) ranges within one cell,
 * emitted **cell-major across every experiment** exactly as [plan.ts](plan.ts) does, so the
 * early tasks spread over all ~115 cells and the long adaptive cells overlap the cheap static
 * ones instead of forming a serial tail. An experiment given a zero budget simply emits no
 * tasks (the tests use this to isolate one experiment).
 */
export function planAdaptiveTasks(config: AdaptiveLabConfig): AdaptiveTask[] {
  if (config.oraclePairs > config.gauntletPairs) {
    throw new Error(
      `planAdaptiveTasks: oraclePairs ${config.oraclePairs} > gauntletPairs ${config.gauntletPairs} — ` +
        "the ablation is paired against the gauntlet's own games and cannot outrun them",
    )
  }
  const comps = mixedCompositionList(config.mixedCompositions)
  const chunk = Math.max(1, Math.floor(config.chunkPairs))

  interface Desc {
    total: number
    make: (from: number, to: number, index: number) => AdaptiveTask
  }
  const descs: Desc[] = []
  for (const opponent of STYLE_IDS) {
    descs.push({
      total: config.gauntletPairs,
      make: (from, to, index) => ({ kind: 'gauntlet', index, config, opponent, pairFrom: from, pairTo: to }),
    })
  }
  descs.push({
    total: config.mirrorPairs,
    make: (from, to, index) => ({ kind: 'mirror', index, config, pairFrom: from, pairTo: to }),
  })
  for (let c = 0; c < comps.length; c++) {
    for (const arm of ['adaptive', 'punter'] as const) {
      descs.push({
        total: config.mixedPairs,
        make: (from, to, index) => ({ kind: 'mixed', index, config, comp: c, arm, pairFrom: from, pairTo: to }),
      })
    }
  }
  for (const opponent of STYLE_IDS) {
    descs.push({
      total: config.oraclePairs,
      make: (from, to, index) => ({ kind: 'oracle', index, config, opponent, pairFrom: from, pairTo: to }),
    })
  }
  for (const [a, b] of accuracyPairings()) {
    descs.push({
      total: config.accGames,
      make: (from, to, index) => ({ kind: 'accuracy', index, config, a, b, gameFrom: from, gameTo: to }),
    })
  }

  const tasks: AdaptiveTask[] = []
  const maxTotal = descs.reduce((m, d) => Math.max(m, d.total), 0)
  for (let from = 0; from < maxTotal; from += chunk) {
    for (const d of descs) {
      if (from >= d.total) continue
      tasks.push(d.make(from, Math.min(d.total, from + chunk), tasks.length))
    }
  }
  return tasks
}

/** Total games the config will play, per experiment and summed. */
export function adaptiveGamesTotal(config: AdaptiveLabConfig): number {
  const n = STYLE_IDS.length
  const pairings = (n * (n - 1)) / 2
  return (
    n * config.gauntletPairs * 2 +
    config.mirrorPairs * 2 +
    config.mixedCompositions * config.mixedPairs * 2 * 2 +
    n * config.oraclePairs * 2 +
    pairings * config.accGames
  )
}

/* -- seat tables ---------------------------------------------------------------------------- */

/** Row/column index per style id, built once. A `Map`, per the house rule for id lookups. */
const STYLE_INDEX: ReadonlyMap<StyleId, number> = new Map(STYLE_IDS.map((s, i) => [s, i]))

/**
 * `Object.hasOwn` before the roster lookup: task fields cross a worker boundary, so the id is
 * treated as untrusted even though the planner only ever writes roster ids into it.
 */
function rosterStyle(id: StyleId): StyleParams {
  if (typeof id !== 'string' || !Object.hasOwn(STYLE_ROSTER, id)) {
    throw new Error(`adaptive lab: unknown style id ${String(id)}`)
  }
  return STYLE_ROSTER[id]
}

/**
 * An adaptive seat's `leakStyle` is the anchor style, per the play.ts header's caveat: a seat
 * whose style moves over the game still needs one declared threshold for the harness to price
 * leaks against, and the anchor is the only style the spec names.
 */
function adaptiveSeat(spec: AdaptiveSpec): SeatSpec {
  return { policy: spec, leakStyle: rosterStyle(spec.anchor ?? ADAPTIVE_DEFAULTS.anchor) }
}

function styleSeat(style: StyleParams): SeatSpec {
  return { policy: style, leakStyle: style }
}

/**
 * The lab-oracle seat assignment for one gauntlet cell: the true style at every opponent seat,
 * `null` at the adaptive team's own. Exported so the tests can pin the plumbing that reaches
 * `chooseStyle` without replaying a game.
 */
export function oracleStylesFor(opponent: StyleId, adaptiveTeam: Team): (StyleId | null)[] {
  return ALL_SEATS.map((seat) => (seatTeam(seat) === adaptiveTeam ? null : opponent))
}

/* -- playing one task ----------------------------------------------------------------------- */

const ORIENTS: readonly Orientation[] = [0, 1]

/** BOT_LAB.md §4.1 score rate for the measured side: win 1, tie 0.5, loss 0. */
function scoreRate(setsA: number, setsB: number): number {
  if (setsA > setsB) return 1
  if (setsB > setsA) return 0
  return 0.5
}

function playOpts(config: AdaptiveLabConfig): SeatPlayOptions {
  return { variant: config.variant, stepCap: config.stepCap, invariantCheck: config.invariantCheck }
}

function recordCore(
  exp: AdaptiveGameRecord['exp'],
  cell: string,
  pair: number,
  orient: Orientation,
  seed: string,
  startSeat: Seat,
  aTeam: Team,
  g: PlayedGame,
): AdaptiveGameRecord {
  const bTeam = (1 - aTeam) as Team
  const setsA = g.sets[aTeam]
  const setsB = g.sets[bTeam]
  return {
    exp,
    cell,
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
    aResult: scoreRate(setsA, setsB),
    clinch: g.clinch,
    tie: g.tie,
  }
}

/**
 * The gauntlet's delegation recorder. Warm/warmup is decided by the SAME rule the engine
 * gates on — the phase-truncated event count against `warmupEvents` (adaptive.ts's header:
 * both gates read the truncation, so the first warm phase begins at the first multiple of 30
 * at or above 40) — so the split reported here is the split that was played.
 */
function usageRecorder(
  spec: AdaptiveSpec,
  adaptiveTeam: Team,
): { observe: NonNullable<SeatPlayOptions['observe']>; warmup: number[]; warm: number[] } {
  const warmup = new Array<number>(STYLE_IDS.length).fill(0)
  const warm = new Array<number>(STYLE_IDS.length).fill(0)
  const warmupEvents = spec.warmupEvents ?? ADAPTIVE_DEFAULTS.warmupEvents
  const observe = (seat: Seat, view: SeatView): void => {
    if (seatTeam(seat) !== adaptiveTeam) return
    const choice = chooseStyle(view, spec)
    const idx = STYLE_INDEX.get(choice.style)
    if (idx === undefined) return
    const cut = Math.floor(view.log.length / ADAPTIVE_PHASE_EVENTS) * ADAPTIVE_PHASE_EVENTS
    if (cut >= warmupEvents) warm[idx]++
    else warmup[idx]++
  }
  return { observe, warmup, warm }
}

/**
 * One classifier-accuracy game: a plain engine loop (the action-selection half of play.ts with
 * the exact lab seeding) that keeps the final state so the public log can be truncated and
 * classified. No counters and no emergency substitution: static styles are pinned illegal-free
 * by the roster fuzz, and if one ever slipped through, the single `illegal` count voids the
 * whole run at the health gate anyway — a truncated game record is then the least of it.
 */
function playAccuracyGame(
  a: StyleId,
  b: StyleId,
  game: number,
  config: AdaptiveLabConfig,
): AdaptiveGameRecord {
  const rules = configFor(config.variant)
  const seed = seedFor(config.accSeedPrefix, game)
  const startSeat = startSeatFor(game)
  const styleA = rosterStyle(a)
  const styleB = rosterStyle(b)
  const policies: StyleParams[] = ALL_SEATS.map((seat) => (seatTeam(seat) === 0 ? styleA : styleB))

  let s = newGame(seed, rules, startSeat)
  let steps = 0
  let illegal = 0
  let invariantViolations = 0
  let capped = false
  while (s.phase !== 'finished') {
    if (steps >= config.stepCap) {
      capped = true
      break
    }
    const { seat } = legalActionsSummary(s)
    const action = decide(seatView(s, seat), policies[seat], hashSeed(`${seed}:${s.moveIndex}`)())
    const r = reduce(s, action)
    if (!r.ok) {
      illegal++
      break
    }
    s = r.state
    steps++
    if (config.invariantCheck === 'every') invariantViolations += checkInvariants(s).length
  }
  if (config.invariantCheck === 'final') invariantViolations += checkInvariants(s).length

  // Final tallies from the reducer's own books — the authority — exactly as play.ts recounts.
  const books = allBooks(rules)
  const target = clinchTarget(rules)
  let t0 = 0
  let t1 = 0
  let voids = 0
  let resolved = 0
  for (const bk of books) {
    const o = s.books[bk]?.outcome
    if (o === undefined) continue
    resolved++
    if (o === 'team0') t0++
    else if (o === 'team1') t1++
    else voids++
  }
  const finished = s.phase === 'finished'
  const over = s.log[s.log.length - 1]
  const tie = over !== undefined && over.type === 'game_over' && over.winner === 'tie'

  // Classifier checkpoints: gen-fingerprints' exact slice discipline (file header).
  const pv = publicView(s)
  const cls: AccuracyCheckpoint[] = []
  for (const cp of config.accCheckpoints) {
    if (pv.log.length <= cp) continue
    const truncated = { ...pv, log: pv.log.slice(0, cp) }
    cls.push({ events: cp, top: classifySeats(truncated).map((c) => c.top) })
  }
  cls.push({ events: 0, top: classifySeats(pv).map((c) => c.top) })

  return {
    exp: 'accuracy',
    cell: `acc-${a}-vs-${b}`,
    pair: game,
    orient: 0,
    seed,
    startSeat,
    aTeam: 0,
    steps,
    finished,
    capped,
    illegal,
    invariantViolations,
    setsA: t0,
    setsB: t1,
    unresolved: books.length - resolved,
    voids,
    aResult: scoreRate(t0, t1),
    clinch: finished && Math.max(t0, t1) === target,
    tie,
    pairing: [a, b],
    cls,
  }
}

/** One worker task. Pure — see the file header. */
export function runAdaptiveTask(task: AdaptiveTask): AdaptiveTaskResult {
  const t0 = Date.now()
  const cfg = task.config
  const records: AdaptiveGameRecord[] = []

  if (task.kind === 'accuracy') {
    for (let game = task.gameFrom; game < task.gameTo; game++) {
      records.push(playAccuracyGame(task.a, task.b, game, cfg))
    }
    return { taskIndex: task.index, records, wallMs: Date.now() - t0 }
  }

  const comps = task.kind === 'mixed' ? mixedCompositionList(cfg.mixedCompositions) : []
  const seedPrefix = task.kind === 'mixed' ? cfg.mixedSeedPrefix : cfg.gauntletSeedPrefix

  for (let pair = task.pairFrom; pair < task.pairTo; pair++) {
    const seed = seedFor(seedPrefix, pair)
    const startSeat = startSeatFor(pair)
    for (const orient of ORIENTS) {
      const aTeam: Team = orient === 0 ? 0 : 1
      const bTeam = (1 - aTeam) as Team

      if (task.kind === 'gauntlet') {
        const spec: AdaptiveSpec = { adaptive: true }
        const opp = styleSeat(rosterStyle(task.opponent))
        const mine = adaptiveSeat(spec)
        const seats = ALL_SEATS.map((seat) => (seatTeam(seat) === aTeam ? mine : opp))
        const usage = usageRecorder(spec, aTeam)
        const g = playGameSeats(seats, seed, startSeat, { ...playOpts(cfg), observe: usage.observe })
        const rec = recordCore('gauntlet', `adaptive-vs-${task.opponent}`, pair, orient, seed, startSeat, aTeam, g)
        rec.opponent = task.opponent
        rec.ca = g.counters[aTeam]
        rec.cb = g.counters[bTeam]
        rec.usage = { warmup: usage.warmup, warm: usage.warm }
        records.push(rec)
      } else if (task.kind === 'mirror') {
        const mine = adaptiveSeat({ adaptive: true })
        const seats = ALL_SEATS.map(() => mine)
        const g = playGameSeats(seats, seed, startSeat, playOpts(cfg))
        records.push(recordCore('mirror', 'adaptive-mirror', pair, orient, seed, startSeat, aTeam, g))
      } else if (task.kind === 'oracle') {
        const spec: AdaptiveSpec = { adaptive: true, oracleStyles: oracleStylesFor(task.opponent, aTeam) }
        const opp = styleSeat(rosterStyle(task.opponent))
        const mine = adaptiveSeat(spec)
        const seats = ALL_SEATS.map((seat) => (seatTeam(seat) === aTeam ? mine : opp))
        const g = playGameSeats(seats, seed, startSeat, playOpts(cfg))
        const rec = recordCore('oracle', `oracle-vs-${task.opponent}`, pair, orient, seed, startSeat, aTeam, g)
        rec.opponent = task.opponent
        records.push(rec)
      } else {
        const comp = comps[task.comp]
        const mine =
          task.arm === 'adaptive' ? adaptiveSeat({ adaptive: true }) : styleSeat(rosterStyle('punter'))
        const seats: SeatSpec[] = new Array<SeatSpec>(6)
        for (const seat of teamSeats(aTeam)) seats[seat] = mine
        // Composition styles onto the opposing team's seats: ascending style-id order (the
        // multiset is enumerated ascending) against ascending seat order — documented, fixed.
        const oppSeats = teamSeats(bTeam)
        for (let i = 0; i < oppSeats.length; i++) seats[oppSeats[i]] = styleSeat(rosterStyle(comp[i]))
        const g = playGameSeats(seats, seed, startSeat, playOpts(cfg))
        const rec = recordCore('mixed', mixedCellId(task.comp, comp), pair, orient, seed, startSeat, aTeam, g)
        rec.arm = task.arm
        rec.composition = comp
        records.push(rec)
      }
    }
  }

  return { taskIndex: task.index, records, wallMs: Date.now() - t0 }
}

/* -- canonical order and the digest --------------------------------------------------------- */

const EXP_ORDER: ReadonlyMap<AdaptiveGameRecord['exp'], number> = new Map([
  ['gauntlet', 0],
  ['mirror', 1],
  ['mixed', 2],
  ['oracle', 3],
  ['accuracy', 4],
])

/** Sort key: experiment, cell, arm, pair, orientation — never worker-arrival order. */
function canonical(a: AdaptiveGameRecord, b: AdaptiveGameRecord): number {
  const ea = EXP_ORDER.get(a.exp) ?? 9
  const eb = EXP_ORDER.get(b.exp) ?? 9
  if (ea !== eb) return ea - eb
  if (a.cell !== b.cell) return a.cell < b.cell ? -1 : 1
  const armA = a.arm ?? ''
  const armB = b.arm ?? ''
  if (armA !== armB) return armA < armB ? -1 : 1
  if (a.pair !== b.pair) return a.pair - b.pair
  return a.orient - b.orient
}

/** One JSON object per line, canonical order. The per-game artifact and the digest's input. */
export function adaptiveToJsonl(records: readonly AdaptiveGameRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '')
}

/* -- aggregation ---------------------------------------------------------------------------- */

/** Sample standard deviation (n-1). Zero for fewer than two observations. */
function sd(xs: readonly number[]): number {
  if (xs.length < 2) return 0
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length
  let ss = 0
  for (const x of xs) ss += (x - mean) * (x - mean)
  return Math.sqrt(ss / (xs.length - 1))
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length
}

/** The §5.1 paired estimator over one cell — the aggregate.ts arithmetic, record-for-record. */
function pairedAggregate(id: string, records: readonly AdaptiveGameRecord[], expectedPairs: number): AdaptiveCellAggregate {
  const byPair = new Map<number, number[]>()
  const seeds = new Set<string>()
  let aWins = 0
  let bWins = 0
  let ties = 0
  let steps = 0
  let maxMoves = 0
  let illegalActions = 0
  let invariantViolations = 0
  let cappedGames = 0
  let voids = 0
  let nonClinch = 0

  for (const r of records) {
    seeds.add(r.seed)
    const slot = byPair.get(r.pair)
    if (slot === undefined) byPair.set(r.pair, [r.aResult])
    else slot.push(r.aResult)
    if (r.aResult === 1) aWins++
    else if (r.aResult === 0) bWins++
    else ties++
    steps += r.steps
    if (r.steps > maxMoves) maxMoves = r.steps
    illegalActions += r.illegal
    invariantViolations += r.invariantViolations
    voids += r.voids
    if (r.capped) cappedGames++
    if (!r.clinch) nonClinch++
  }

  const paired: number[] = []
  for (const [, results] of byPair) {
    if (results.length !== 2) continue
    paired.push((results[0] + results[1]) / 2)
  }
  const flat = records.map((r) => r.aResult)
  const score = mean(paired)
  const se = paired.length > 0 ? sd(paired) / Math.sqrt(paired.length) : 0
  const seUnpaired = flat.length > 0 ? sd(flat) / Math.sqrt(flat.length) : 0
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
    id,
    pairs: paired.length,
    games: records.length,
    distinctSeeds: seeds.size,
    score,
    se,
    ci95: [score - 1.96 * se, score + 1.96 * se],
    seUnpaired,
    aWins,
    bWins,
    ties,
    avgMoves: records.length === 0 ? 0 : steps / records.length,
    maxMoves,
    health,
  }
}

/** Per-pair duplicate means for one cell's records: pair -> (sum, n). Complete pairs only. */
function pairMeans(records: readonly AdaptiveGameRecord[]): Map<number, number> {
  const acc = new Map<number, number[]>()
  for (const r of records) {
    const slot = acc.get(r.pair)
    if (slot === undefined) acc.set(r.pair, [r.aResult])
    else slot.push(r.aResult)
  }
  const out = new Map<number, number>()
  for (const [pair, results] of acc) {
    if (results.length !== 2) continue
    out.set(pair, (results[0] + results[1]) / 2)
  }
  return out
}

/** The mixed screen's pooled estimate, with the SE clustered by seed. */
export interface MixedPooled {
  pairedDelta: number
  deltaSe: number
  ci95: [number, number]
  adaptiveMean: number
  punterMean: number
  /** Distinct seeds behind the SE — the cluster count. */
  seeds: number
}

/**
 * The mixed screen's pooled estimator, from per-game records alone. Every composition replays
 * the IDENTICAL seed list, so the per-deal deltas at one seed share that deal and are not
 * independent observations — treating all composition × pair deltas as independent would
 * understate the pooled SE and overstate z. The estimator therefore clusters by seed: per-deal
 * deltas are averaged within seed first, and the SE is `sd(seed-level deltas) / sqrt(seeds)`.
 * The point estimate is the plain pooled mean — identical to the mean of seed-level means
 * whenever every seed carries every composition, which the balanced design of every real run
 * guarantees. Per-composition row SEs are within-composition and unaffected.
 *
 * Exported (and used by `assembleAdaptiveRun` itself) so `scripts/adaptive-analyze.mjs` can
 * compute the same number from games.jsonl rather than trusting a stored aggregate.
 */
export function mixedPooledFromRecords(records: readonly AdaptiveGameRecord[]): MixedPooled {
  const cells = new Map<string, { adaptive: AdaptiveGameRecord[]; punter: AdaptiveGameRecord[] }>()
  for (const r of records) {
    if (r.exp !== 'mixed' || r.arm === undefined) continue
    let slot = cells.get(r.cell)
    if (slot === undefined) {
      slot = { adaptive: [], punter: [] }
      cells.set(r.cell, slot)
    }
    slot[r.arm].push(r)
  }
  const pooledDeltas: number[] = []
  const pooledAdaptive: number[] = []
  const pooledPunter: number[] = []
  const bySeed = new Map<string, number[]>()
  for (const [, slot] of cells) {
    const meansA = pairMeans(slot.adaptive)
    const meansP = pairMeans(slot.punter)
    const seedOfPair = new Map<number, string>()
    for (const r of slot.adaptive) seedOfPair.set(r.pair, r.seed)
    for (const [pair, ma] of meansA) {
      const mp = meansP.get(pair)
      if (mp === undefined) continue
      const d = ma - mp
      pooledDeltas.push(d)
      pooledAdaptive.push(ma)
      pooledPunter.push(mp)
      const seed = seedOfPair.get(pair) ?? String(pair)
      const seedSlot = bySeed.get(seed)
      if (seedSlot === undefined) bySeed.set(seed, [d])
      else seedSlot.push(d)
    }
  }
  const seedDeltas: number[] = []
  for (const [, ds] of bySeed) seedDeltas.push(mean(ds))
  const pairedDelta = mean(pooledDeltas)
  const deltaSe = seedDeltas.length > 0 ? sd(seedDeltas) / Math.sqrt(seedDeltas.length) : 0
  return {
    pairedDelta,
    deltaSe,
    ci95: [pairedDelta - 1.96 * deltaSe, pairedDelta + 1.96 * deltaSe],
    adaptiveMean: mean(pooledAdaptive),
    punterMean: mean(pooledPunter),
    seeds: bySeed.size,
  }
}

function sharesOf(counts: readonly number[]): Record<StyleId, number> {
  const total = counts.reduce((s, v) => s + v, 0)
  const out = {} as Record<StyleId, number>
  for (let i = 0; i < STYLE_IDS.length; i++) out[STYLE_IDS[i]] = total === 0 ? 0 : counts[i] / total
  return out
}

/**
 * Score the classifier-accuracy records: top-1 per checkpoint (overall and per true style) and
 * the end-of-game confusion counts. Exported so the tests can feed a hand-built record with a
 * known answer through the exact scorer the artifact uses. Truth per seat is structural:
 * `pairing[0]` played team 0 (seats 0/2/4), `pairing[1]` team 1 — every accuracy game is
 * seated that way and `aTeam` pins it.
 */
export function scoreClassifier(
  records: readonly AdaptiveGameRecord[],
  checkpoints: readonly number[],
): ClassifierResult {
  const cps = [...checkpoints, 0]
  interface Tally {
    seats: number
    correct: number
    byStyle: Map<StyleId, { seats: number; correct: number }>
  }
  const rows = new Map<number, Tally>()
  for (const cp of cps) rows.set(cp, { seats: 0, correct: 0, byStyle: new Map() })
  const n = STYLE_IDS.length
  const confusion: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))

  for (const r of records) {
    if (r.exp !== 'accuracy' || r.cls === undefined || r.pairing === undefined) continue
    for (const c of r.cls) {
      const tally = rows.get(c.events)
      if (tally === undefined) continue
      for (const seat of ALL_SEATS) {
        const truth = seatTeam(seat) === 0 ? r.pairing[0] : r.pairing[1]
        const predicted = c.top[seat]
        tally.seats++
        let by = tally.byStyle.get(truth)
        if (by === undefined) {
          by = { seats: 0, correct: 0 }
          tally.byStyle.set(truth, by)
        }
        by.seats++
        if (predicted === truth) {
          tally.correct++
          by.correct++
        }
        if (c.events === 0) {
          const ti = STYLE_INDEX.get(truth)
          const pi = STYLE_INDEX.get(predicted)
          if (ti !== undefined && pi !== undefined) confusion[ti][pi]++
        }
      }
    }
  }

  const accuracy: AccuracyRow[] = []
  const deadCheckpoints: number[] = []
  for (const events of cps) {
    const tally = rows.get(events)
    const seats = tally?.seats ?? 0
    if (seats === 0) {
      // A checkpoint no game's log outlived recorded nothing. Encoding it as `top1: 0` would
      // invent a measured zero, so it is named dead instead and carries no accuracy row.
      deadCheckpoints.push(events)
      continue
    }
    const byStyle = {} as Record<StyleId, AccuracyByStyle>
    for (const style of STYLE_IDS) {
      const by = tally?.byStyle.get(style)
      byStyle[style] =
        by === undefined ? { seats: 0, top1: 0 } : { seats: by.seats, top1: by.seats === 0 ? 0 : by.correct / by.seats }
    }
    const correct = tally?.correct ?? 0
    accuracy.push({ events, seats, top1: correct / seats, byStyle })
  }

  return {
    checkpoints: cps,
    accuracy,
    deadCheckpoints,
    confusion: { events: 0, styles: [...STYLE_IDS], matrix: confusion },
  }
}

/* -- the run -------------------------------------------------------------------------------- */

/**
 * Fold the raw task results into the run output: canonical order, per-experiment aggregates,
 * the health gate, the digest. Pure — same results in any order, same output; `wallMs` and
 * `generatedAt` are provenance, supplied by the caller.
 */
export function assembleAdaptiveRun(
  config: AdaptiveLabConfig,
  results: readonly AdaptiveTaskResult[],
  opts: { wallMs: number; workers: number; generatedAt: string },
): AdaptiveRunOutput {
  const all: AdaptiveGameRecord[] = []
  for (const r of results) for (const rec of r.records) all.push(rec)
  all.sort(canonical)

  const groups = new Map<string, AdaptiveGameRecord[]>()
  for (const r of all) {
    const key = `${r.exp}:${r.cell}${r.arm === undefined ? '' : `#${r.arm}`}`
    const slot = groups.get(key)
    if (slot === undefined) groups.set(key, [r])
    else slot.push(r)
  }
  const group = (key: string): AdaptiveGameRecord[] => groups.get(key) ?? []

  const violations: string[] = []
  const checkCell = (agg: AdaptiveCellAggregate, expectedPairs: number): void => {
    if (agg.distinctSeeds !== expectedPairs) {
      violations.push(
        `cell ${agg.id}: distinctSeeds ${agg.distinctSeeds} != pairs ${expectedPairs} ` +
          '(BOT_LAB.md §5.2 — a repeated seed returns a byte-identical game, so it is not extra data)',
      )
    }
    if (agg.pairs !== expectedPairs) {
      violations.push(`cell ${agg.id}: ${agg.pairs} complete duplicate pairs, expected ${expectedPairs}`)
    }
  }

  // --- gauntlet + styleUsage ----------------------------------------------------------------
  const gauntlet: GauntletCell[] = []
  const styleUsage: StyleUsageRow[] = []
  for (const opponent of STYLE_IDS) {
    const recs = group(`gauntlet:adaptive-vs-${opponent}`)
    if (recs.length === 0 && config.gauntletPairs === 0) continue
    const agg = pairedAggregate(`adaptive-vs-${opponent}`, recs, config.gauntletPairs)
    checkCell(agg, config.gauntletPairs)
    const ca: SideCounters = zeroCounters()
    const cb: SideCounters = zeroCounters()
    const warmup = new Array<number>(STYLE_IDS.length).fill(0)
    const warm = new Array<number>(STYLE_IDS.length).fill(0)
    for (const r of recs) {
      if (r.ca !== undefined) addCounters(ca, r.ca)
      if (r.cb !== undefined) addCounters(cb, r.cb)
      if (r.usage !== undefined) {
        for (let i = 0; i < STYLE_IDS.length; i++) {
          warmup[i] += r.usage.warmup[i] ?? 0
          warm[i] += r.usage.warm[i] ?? 0
        }
      }
    }
    gauntlet.push({
      ...agg,
      opponent,
      metrics: { a: sideMetrics(ca, recs.length), b: sideMetrics(cb, recs.length) },
    })
    styleUsage.push({
      opponent,
      decisions: {
        warmup: warmup.reduce((s, v) => s + v, 0),
        warm: warm.reduce((s, v) => s + v, 0),
      },
      warmupShares: sharesOf(warmup),
      warmShares: sharesOf(warm),
    })
  }

  // --- mirror -------------------------------------------------------------------------------
  const mirrorRecs = group('mirror:adaptive-mirror')
  const mirrorAgg = pairedAggregate('adaptive-mirror', mirrorRecs, config.mirrorPairs)
  if (config.mirrorPairs > 0) checkCell(mirrorAgg, config.mirrorPairs)
  const mirror: MirrorResult = {
    pairs: mirrorAgg.pairs,
    games: mirrorAgg.games,
    score: mirrorAgg.score,
    se: mirrorAgg.se,
  }

  // --- mixed screen -------------------------------------------------------------------------
  const comps = mixedCompositionList(config.mixedCompositions)
  const rows: MixedRow[] = []
  for (let c = 0; c < comps.length; c++) {
    const cell = mixedCellId(c, comps[c])
    const recsA = group(`mixed:${cell}#adaptive`)
    const recsP = group(`mixed:${cell}#punter`)
    const aggA = pairedAggregate(`${cell}#adaptive`, recsA, config.mixedPairs)
    const aggP = pairedAggregate(`${cell}#punter`, recsP, config.mixedPairs)
    checkCell(aggA, config.mixedPairs)
    checkCell(aggP, config.mixedPairs)
    // The pairing claim, checked: both arms must have played the identical (pair, orient,
    // seed, startSeat) set, or the per-deal delta below is not per-deal.
    const signature = (recs: readonly AdaptiveGameRecord[]): string =>
      recs
        .map((r) => `${r.pair}:${r.orient}:${r.seed}:${r.startSeat}`)
        .sort()
        .join('|')
    if (signature(recsA) !== signature(recsP)) {
      violations.push(`cell ${cell}: the adaptive and punter arms played different (pair, orient, seed) sets`)
    }
    const meansA = pairMeans(recsA)
    const meansP = pairMeans(recsP)
    const deltas: number[] = []
    for (const [pair, ma] of meansA) {
      const mp = meansP.get(pair)
      if (mp === undefined) continue
      deltas.push(ma - mp)
    }
    rows.push({
      composition: comps[c],
      pairs: deltas.length,
      adaptive: aggA.score,
      punter: aggP.score,
      delta: mean(deltas),
      deltaSe: deltas.length > 0 ? sd(deltas) / Math.sqrt(deltas.length) : 0,
    })
  }
  // The pooled numbers come from the shared seed-clustered estimator, so the runner and the
  // re-analysis script cannot drift apart (mixedPooledFromRecords: every composition replays
  // the identical seed list, so the SE must not treat its replays as independent).
  const pooled = mixedPooledFromRecords(all)
  const mixed: MixedResult = {
    compositions: comps.length,
    pairsPer: config.mixedPairs,
    adaptiveMean: pooled.adaptiveMean,
    punterMean: pooled.punterMean,
    pairedDelta: pooled.pairedDelta,
    deltaSe: pooled.deltaSe,
    ci95: pooled.ci95,
    rows,
  }

  // --- oracle ablation ----------------------------------------------------------------------
  const oracle: OracleRow[] = []
  if (config.oraclePairs > 0) {
    for (const opponent of STYLE_IDS) {
      const recsO = group(`oracle:oracle-vs-${opponent}`)
      const aggO = pairedAggregate(`oracle-vs-${opponent}`, recsO, config.oraclePairs)
      checkCell(aggO, config.oraclePairs)
      // The classifier arm IS the gauntlet's head: same prefix, same pairs, same games.
      const recsC = group(`gauntlet:adaptive-vs-${opponent}`).filter((r) => r.pair < config.oraclePairs)
      const seedsO = new Set(recsO.map((r) => r.seed))
      const seedsC = new Set(recsC.map((r) => r.seed))
      if (seedsO.size !== seedsC.size || [...seedsO].some((s) => !seedsC.has(s))) {
        violations.push(`cell oracle-vs-${opponent}: seed list does not match the gauntlet's head — not paired`)
      }
      const meansO = pairMeans(recsO)
      const meansC = pairMeans(recsC)
      const deltas: number[] = []
      const classifierSide: number[] = []
      const oracleSide: number[] = []
      for (const [pair, mo] of meansO) {
        const mc = meansC.get(pair)
        if (mc === undefined) continue
        deltas.push(mo - mc)
        oracleSide.push(mo)
        classifierSide.push(mc)
      }
      const d = mean(deltas)
      const se = deltas.length > 0 ? sd(deltas) / Math.sqrt(deltas.length) : 0
      oracle.push({
        opponent,
        pairs: deltas.length,
        classifier: mean(classifierSide),
        oracle: mean(oracleSide),
        delta: d,
        se,
        ci95: [d - 1.96 * se, d + 1.96 * se],
      })
    }
  }

  // --- classifier accuracy ------------------------------------------------------------------
  const accuracyRecs = all.filter((r) => r.exp === 'accuracy')
  const classifier = scoreClassifier(accuracyRecs, config.accCheckpoints)
  if (config.accGames > 0) {
    for (const [a, b] of accuracyPairings()) {
      const recs = group(`accuracy:acc-${a}-vs-${b}`)
      const seeds = new Set(recs.map((r) => r.seed))
      if (recs.length !== config.accGames || seeds.size !== config.accGames) {
        violations.push(
          `cell acc-${a}-vs-${b}: ${recs.length} games over ${seeds.size} distinct seeds, expected ${config.accGames}`,
        )
      }
    }
  }

  // --- the health gate ----------------------------------------------------------------------
  const capped: CappedGame[] = []
  let illegalActions = 0
  let invariantViolations = 0
  let ties = 0
  let voids = 0
  let nonClinch = 0
  for (const r of all) {
    illegalActions += r.illegal
    invariantViolations += r.invariantViolations
    if (r.tie) ties++
    voids += r.voids
    if (!r.clinch) nonClinch++
    if (r.capped) {
      capped.push({
        cell: `${r.cell}${r.arm === undefined ? '' : `#${r.arm}`}`,
        seed: r.seed,
        orient: r.orient,
        startSeat: r.startSeat,
        steps: r.steps,
      })
    }
  }
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
  if (config.variant === 'us54') {
    if (ties > 0) violations.push(`ties ${ties} — RULES_US54.md §5 proves ties are arithmetically impossible`)
    if (voids > 0) violations.push(`voids ${voids} — RULES_US54.md row 14 abolishes the void outcome`)
    if (nonClinch > 0) violations.push(`nonClinch ${nonClinch} games did not end on a clinch at exactly 5 sets`)
  }
  const health: AdaptiveHealthSummary = {
    ok: violations.length === 0,
    illegalActions,
    cappedGames: capped.length,
    invariantViolations,
    ties,
    voids,
    nonClinch,
    capped,
    violations,
  }

  const movesTotal = all.reduce((s, r) => s + r.steps, 0)
  const seconds = opts.wallMs / 1000
  return {
    meta: {
      schemaVersion: ADAPTIVE_SCHEMA_VERSION,
      generatedAt: opts.generatedAt,
      config,
      gamesTotal: all.length,
      movesTotal,
      workers: opts.workers,
      wallMs: opts.wallMs,
      gamesPerSecond: seconds === 0 ? 0 : all.length / seconds,
      recordsDigest: digest(adaptiveToJsonl(all)),
    },
    health,
    gauntlet,
    mirror,
    mixed,
    oracle,
    classifier,
    styleUsage,
    records: all,
  }
}

/* -- the artifact --------------------------------------------------------------------------- */

export interface AdaptiveBenchmarkInput {
  artifact: string
  recordsDigest: string
  seedPrefix: string
  pairsPerCell: number
  /** Punter's duplicate-averaged score and paired SE vs each opponent (punter oriented as a). */
  punterRow: Readonly<Record<string, { score: number; se: number }>>
}

export interface AdaptiveArtifactInputs {
  engineCommit: string
  rulesHash: string
  rulesFile: string
  generatedAt: string
  benchmark: AdaptiveBenchmarkInput
}

/** Two-sided 5% critical value — a single pre-registered comparison. */
const Z_SINGLE = 1.96
/** Two-sided 5% split over the 9 simultaneous gauntlet (or oracle) cells — Bonferroni. */
const Z_BONF9 = 2.773

/**
 * The P1–P4 verdicts, computed from the numbers by rules written down with the predictions
 * (adaptive-types.ts) rather than after seeing the data:
 *
 * - **P1 / P3** (nine simultaneous cells): a cell *rejects* when |delta| exceeds
 *   `Z_BONF9 · se` — the Bonferroni-corrected two-sided 5% level; any rejection refutes.
 *   Cells between 1.96σ and the corrected bound are named but do not refute — with nine cells
 *   ~0.45 of them land there by chance. For P1 the SE is the conservative cross-run
 *   combination (adaptive-types.ts header), which if anything overstates it and makes the
 *   test *easier* to pass — stated in the detail, with the smallest shortfall the test could
 *   have detected. For P3, deltas that are exactly zero get the structural explanation: with a
 *   dominant row, both arms delegate identically at every decision.
 * - **P2**: one comparison, truly paired within the run — |delta| <= 1.96·se confirms.
 * - **P4**: operationalised before the run as three conditions on the end-of-game reads:
 *   (a) mean top-1 over {turtle, ghost, hoarder} >= 0.50, (b) mean top-1 over the
 *   {balanced, blitz, punter, banker} quadrangle <= 0.35, (c) for every quadrangle style with
 *   any errors, at least half its errors land inside the quadrangle. All three → confirmed;
 *   none → refuted; otherwise mixed, with every number in the detail.
 */
function computeVerdicts(
  gauntlet: readonly GauntletRow[],
  mixed: MixedResult,
  oracle: readonly OracleRow[],
  classifier: ClassifierResult,
): AdaptiveVerdict[] {
  const fmt = (x: number): string => x.toFixed(4)
  const predictions = new Map(ADAPTIVE_PREDICTIONS.map((p) => [p.id, p.text]))
  const verdicts: AdaptiveVerdict[] = []

  // --- P1 -----------------------------------------------------------------------------------
  if (gauntlet.length === 0) {
    verdicts.push({
      id: 'P1',
      prediction: predictions.get('P1') ?? '',
      verdict: 'mixed',
      detail: 'no gauntlet cells were run.',
    })
  } else {
    const zs = gauntlet.map((row) => {
      const z = row.deltaSe === 0 ? (row.delta === 0 ? 0 : Number.POSITIVE_INFINITY) : row.delta / row.deltaSe
      return { row, z }
    })
    const rejecting = zs.filter((e) => Math.abs(e.z) > Z_BONF9)
    const near = zs.filter((e) => Math.abs(e.z) > Z_SINGLE && Math.abs(e.z) <= Z_BONF9)
    const worst = zs.reduce((m, e) => (Math.abs(e.z) > Math.abs(m.z) ? e : m), zs[0])
    const detail =
      `worst cell vs ${worst.row.opponent}: delta ${fmt(worst.row.delta)} ± ${fmt(worst.row.deltaSe)} ` +
      `(z ${worst.z.toFixed(2)}); ${rejecting.length} of ${zs.length} cells reject at the Bonferroni ` +
      `bound |z| > ${Z_BONF9}` +
      (near.length > 0
        ? `; ${near.length} between 1.96 and the bound (${near.map((e) => e.row.opponent).join(', ')})`
        : '') +
      '. The delta SE is the conservative cross-run combination over shared deals, so the test ' +
      'is weaker than a jointly-recorded pairing would be; smallest rejectable shortfall ~' +
      fmt(Z_BONF9 * zs.reduce((m, e) => Math.max(m, e.row.deltaSe), 0)) +
      ' at the widest cell.'
    verdicts.push({
      id: 'P1',
      prediction: predictions.get('P1') ?? '',
      verdict: rejecting.length > 0 ? 'refuted' : 'confirmed',
      detail,
    })
  }

  // --- P2 -----------------------------------------------------------------------------------
  {
    const z = mixed.deltaSe === 0 ? (mixed.pairedDelta === 0 ? 0 : Number.POSITIVE_INFINITY) : mixed.pairedDelta / mixed.deltaSe
    verdicts.push({
      id: 'P2',
      prediction: predictions.get('P2') ?? '',
      verdict: Math.abs(z) <= Z_SINGLE ? 'confirmed' : 'refuted',
      detail:
        `pooled per-deal delta ${fmt(mixed.pairedDelta)} ± ${fmt(mixed.deltaSe)} over ` +
        `${mixed.compositions} compositions × ${mixed.pairsPer} pairs (z ${z.toFixed(2)}; ` +
        `95% CI [${fmt(mixed.ci95[0])}, ${fmt(mixed.ci95[1])}]), truly paired within the run. ` +
        `The SE is clustered by seed: all ${mixed.compositions} compositions replay one ` +
        `${mixed.pairsPer}-seed list, so per-deal deltas are averaged within seed before the SE ` +
        'is taken over the seed-level means — replays of a deal are not counted as independent.',
    })
  }

  // --- P3 -----------------------------------------------------------------------------------
  {
    const allZero = oracle.length > 0 && oracle.every((row) => row.delta === 0 && row.se === 0)
    if (allZero) {
      verdicts.push({
        id: 'P3',
        prediction: predictions.get('P3') ?? '',
        verdict: 'confirmed',
        detail:
          'every oracle cell measured a delta of exactly 0.0000: with a dominant counter-table ' +
          'row, the oracle and classifier arms delegate to the same style at every decision, so ' +
          'the paired games are identical move for move. Perfect classification bought nothing, ' +
          'measurably and exactly.',
      })
    } else {
      const zs = oracle.map((row) => {
        const z = row.se === 0 ? (row.delta === 0 ? 0 : Number.POSITIVE_INFINITY) : row.delta / row.se
        return { row, z }
      })
      const rejecting = zs.filter((e) => Math.abs(e.z) > Z_BONF9)
      const worst = zs.length > 0 ? zs.reduce((m, e) => (Math.abs(e.z) > Math.abs(m.z) ? e : m), zs[0]) : undefined
      verdicts.push({
        id: 'P3',
        prediction: predictions.get('P3') ?? '',
        verdict: rejecting.length > 0 ? 'refuted' : 'confirmed',
        detail:
          worst === undefined
            ? 'no oracle cells were run.'
            : `worst cell vs ${worst.row.opponent}: delta ${fmt(worst.row.delta)} ± ${fmt(worst.row.se)} ` +
              `(z ${worst.z.toFixed(2)}); ${rejecting.length} of ${zs.length} cells reject at |z| > ${Z_BONF9}.`,
      })
    }
  }

  // --- P4 -----------------------------------------------------------------------------------
  {
    const end = classifier.accuracy.find((row) => row.events === 0)
    const distinctive: StyleId[] = ['turtle', 'ghost', 'hoarder']
    const quadrangle: StyleId[] = ['balanced', 'blitz', 'punter', 'banker']
    const top1 = (style: StyleId): number => end?.byStyle[style]?.top1 ?? 0
    const distinctiveMean = mean(distinctive.map(top1))
    const quadrangleMean = mean(quadrangle.map(top1))
    const styles = classifier.confusion.styles
    const internalShares: number[] = []
    for (const t of quadrangle) {
      const ti = styles.indexOf(t)
      if (ti < 0) continue
      const row = classifier.confusion.matrix[ti] ?? []
      const total = row.reduce((s, v) => s + v, 0)
      const errors = total - (row[ti] ?? 0)
      if (errors === 0) continue
      let internal = 0
      for (const q of quadrangle) {
        if (q === t) continue
        const qi = styles.indexOf(q)
        if (qi >= 0) internal += row[qi] ?? 0
      }
      internalShares.push(internal / errors)
    }
    const condA = distinctiveMean >= 0.5
    const condB = quadrangleMean <= 0.35
    const condC = internalShares.length > 0 && internalShares.every((s) => s >= 0.5)
    const held = [condA, condB, condC].filter(Boolean).length
    verdicts.push({
      id: 'P4',
      prediction: predictions.get('P4') ?? '',
      verdict: held === 3 ? 'confirmed' : held === 0 ? 'refuted' : 'mixed',
      detail:
        `end-of-game top-1 — turtle ${fmt(top1('turtle'))}, ghost ${fmt(top1('ghost'))}, hoarder ` +
        `${fmt(top1('hoarder'))} (mean ${fmt(distinctiveMean)}, condition >= 0.50: ${condA ? 'holds' : 'fails'}); ` +
        `quadrangle balanced ${fmt(top1('balanced'))}, blitz ${fmt(top1('blitz'))}, punter ` +
        `${fmt(top1('punter'))}, banker ${fmt(top1('banker'))} (mean ${fmt(quadrangleMean)}, condition ` +
        `<= 0.35: ${condB ? 'holds' : 'fails'}); quadrangle errors landing inside the quadrangle: ` +
        `${internalShares.map(fmt).join(', ') || 'n/a'} (condition every >= 0.50: ${condC ? 'holds' : 'fails'}).`,
    })
  }

  return verdicts
}

/**
 * Fold a run and its provenance into the published artifact. The benchmark's digest must match
 * the committed counter table's — the row the gauntlet is read against and the table the
 * adaptive engine best-responded with have to come from the same matrix, or the whole
 * comparison is between two different worlds — and that is thrown on, not warned about.
 */
export function buildAdaptiveResults(run: AdaptiveRunOutput, inputs: AdaptiveArtifactInputs): AdaptiveResults {
  const bench = inputs.benchmark
  if (bench.recordsDigest !== COUNTER_TABLE.provenance.recordsDigest) {
    throw new Error(
      `buildAdaptiveResults: benchmark digest ${bench.recordsDigest} != counter-table source digest ` +
        `${COUNTER_TABLE.provenance.recordsDigest} — the benchmark row and the table v1.0 played from ` +
        'must come from the same matrix artifact',
    )
  }
  const paired =
    bench.seedPrefix === run.meta.config.gauntletSeedPrefix && bench.pairsPerCell === run.meta.config.gauntletPairs
  const note = paired
    ? 'Per-deal: the gauntlet replayed the benchmark seed list exactly (both orientations, same ' +
      'start seats). The pairing is cross-run — per-game records are not joined — so the delta SE ' +
      'is the conservative independent combination, an upper bound on the true paired SE.'
    : `UNPAIRED: the gauntlet ran ${run.meta.config.gauntletPairs} pairs of ` +
      `"${run.meta.config.gauntletSeedPrefix}" against a benchmark measured on ${bench.pairsPerCell} ` +
      `pairs of "${bench.seedPrefix}" — different deals, independent samples only.`

  const gauntlet: GauntletRow[] = run.gauntlet.map((cell) => {
    if (!Object.hasOwn(bench.punterRow, cell.opponent)) {
      throw new Error(`buildAdaptiveResults: benchmark punter row has no entry for ${cell.opponent}`)
    }
    const b = bench.punterRow[cell.opponent]
    const delta = cell.score - b.score
    return {
      ...cell,
      punterBenchmark: b.score,
      punterBenchmarkSe: b.se,
      delta,
      deltaSe: Math.sqrt(cell.se * cell.se + b.se * b.se),
    }
  })

  const verdicts = computeVerdicts(gauntlet, run.mixed, run.oracle, run.classifier)

  return {
    meta: {
      schemaVersion: ADAPTIVE_SCHEMA_VERSION,
      generatedAt: inputs.generatedAt,
      engineCommit: inputs.engineCommit,
      rulesHash: inputs.rulesHash,
      rulesFile: inputs.rulesFile,
      ruleSet: 'us54',
      config: run.meta.config,
      gamesTotal: run.meta.gamesTotal,
      seedSet: { prefix: run.meta.config.gauntletSeedPrefix, count: run.meta.config.gauntletPairs },
      wallMs: run.meta.wallMs,
      recordsDigest: run.meta.recordsDigest,
      health: run.health,
      benchmark: {
        artifact: bench.artifact,
        recordsDigest: bench.recordsDigest,
        seedPrefix: bench.seedPrefix,
        pairsPerCell: bench.pairsPerCell,
        paired,
        note,
      },
      counterTableProvenance: { ...COUNTER_TABLE.provenance },
      fingerprintProvenance: {
        generatedAt: FINGERPRINT_PROVENANCE.generatedAt,
        command: FINGERPRINT_PROVENANCE.command,
        gamesPerStyle: FINGERPRINT_PROVENANCE.gamesPerStyle,
        seedPrefix: FINGERPRINT_PROVENANCE.seedPrefix,
        variant: FINGERPRINT_PROVENANCE.variant,
        stepCap: FINGERPRINT_PROVENANCE.stepCap,
      },
      predictions: ADAPTIVE_PREDICTIONS.map((p) => ({ ...p })),
    },
    gauntlet,
    mirror: run.mirror,
    mixed: run.mixed,
    oracle: run.oracle,
    classifier: run.classifier,
    styleUsage: run.styleUsage,
    verdicts,
  }
}
