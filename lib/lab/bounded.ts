/**
 * bounded.ts — the FishAI v1.5 experiment suite: ladder monotonicity, tier calibration,
 * evidence-age analysis, style under memory pressure (SPEC v1.5 Phase 2; the data contract is
 * [bounded-types.ts](bounded-types.ts), the pre-registered predictions are written there too).
 *
 * Everything substantial lives HERE, typechecked, for the reason [types.ts](types.ts) gives:
 * `scripts/bounded-sim.mjs` is linted but never typechecked, so it is kept to flag parsing,
 * worker plumbing and file writes. `runBoundedTask` is — exactly like the adaptive suite's
 * `runAdaptiveTask` — a **pure function of its argument**: same task in, byte-identical result
 * out, on any thread, in any order. The pool is a throughput device, not a source of variation.
 *
 * ## The four experiments, and what each one holds fixed
 *
 * 1. **E1 — ladder monotonicity.** A team of three `{bounded: true, bits, style: 'balanced'}`
 *    seats against the unbounded balanced reference (a bare roster style, which `decide`
 *    resolves at hard skill — the same full-strength engine the bounded arm caps), at every
 *    budget of the ladder, on ONE shared seed list (`bounded-v1`), both orientations, start
 *    seat `pair % 6`. Every budget replays the identical deals, so adjacent rungs are compared
 *    per seed and the P1 test runs on truly paired SEs. The metric is mean set-share
 *    (`setsA / (setsA + setsB)`), not win rate — the ladder needs a dial that keeps moving
 *    after the win rate saturates.
 * 2. **E2 — tier calibration.** The three shipped tiers (`easy` / `medium` / `hard`, the
 *    skill × style preset pairs `decide` resolves from a tier name) against the SAME balanced
 *    reference, on the HEAD of the ladder seed list, so a tier's share sits on the E1 curve
 *    per-deal and the bits-equivalent interpolation compares like with like.
 * 3. **E3 — evidence age.** No games of its own and NO engine instrumentation: computed
 *    post-hoc from the E1/E2 records, which retain the full public log (`elog`, the compact
 *    per-event encoding below). The estimator is the spec's: at ask event `i`, every card
 *    whose public location a hit established at event `j` (and nothing since moved or retired)
 *    that the acting seat could legally have asked of the correct holder is one availability
 *    observation at age `i − j`; the seat exploited it iff its actual ask WAS that card at
 *    that holder. Hands are reconstructed exactly from the seed's deal plus the log's hits and
 *    claims — the deal is `newGame(seed)`'s, hits move one named card, claims retire a book —
 *    so ask legality (the seat holds a card of the book) is decided from ground truth, not
 *    guessed.
 * 4. **E4 — style under memory pressure.** The v1.0 classifier-accuracy harness, budget-capped:
 *    for each budget, the 36 unordered style pairings play single games with BOTH teams bounded
 *    at that budget (team 0 the first style, team 1 the second), on the v1.0 accuracy seed list
 *    (`clsacc-v1`), and `classifySeats` reads every seat once at end of game against the
 *    calibrated fingerprints. At the ∞ budget the bounded arm is decision-identical to the bare
 *    styles (the Phase 1 anchor pin), so that cell is a byte-identical re-run of the v1.0
 *    accuracy experiment — its top-1 must reproduce the committed 22.4% exactly, which the
 *    analyze step reports against the committed adaptive artifact.
 *
 * ## Health discipline
 *
 * The BOT_LAB.md §4.3 gates apply to every experiment: 0 illegal actions, 0 capped games (each
 * one named, never dropped), 0 invariant violations, and under `us54` 0 ties, 0 voids, 0
 * non-clinch endings; `distinctSeeds` must equal the expected count per cell. Two
 * suite-specific gates are added: the tier cells must have replayed the ladder seed list's
 * head (the interpolation claim is checked, not assumed), and the ∞ ladder cell must be an
 * exact mirror on integer set counts — P2 is a health gate, and a deviation VOIDS the run.
 */
import {
  ALL_SEATS,
  STYLE_IDS,
  STYLE_ROSTER,
  allBooks,
  bookCards,
  cardBook,
  checkInvariants,
  classifySeats,
  clinchTarget,
  decide,
  hashSeed,
  legalActionsSummary,
  newGame,
  publicView,
  reduce,
  seatTeam,
  seatView,
} from '../engine/index.ts'
import type {
  BookId,
  BotDifficulty,
  Card,
  PolicySpec,
  PublicEvent,
  RulesConfig,
  Seat,
  StyleId,
  StyleParams,
  Team,
} from '../engine/index.ts'
import { seedFor, startSeatFor } from './plan.ts'
import { configFor } from './play.ts'
import { digest } from './run.ts'
import type { CappedGame, CellHealth, Orientation } from './types.ts'
import type { AccuracyByStyle } from './adaptive-types.ts'
import {
  BOUNDED_INF_BITS,
  BOUNDED_PREDICTIONS,
  BOUNDED_SCHEMA_VERSION,
  BOUNDED_TIERS,
} from './bounded-types.ts'
import type {
  AccuracyAdjacentDelta,
  BitsEquivalent,
  BoundedAccuracy,
  BoundedAccuracyCell,
  BoundedArtifactInputs,
  BoundedGameRecord,
  BoundedHealthSummary,
  BoundedLabConfig,
  BoundedResults,
  BoundedRunOutput,
  BoundedRunSummary,
  BoundedShareCell,
  BoundedTaskResult,
  BoundedVerdict,
  CertainAskObservation,
  ClusteredDiff,
  EvidenceAgeRow,
  EvidenceCurve,
  EvidenceRate,
  EvidenceWindow,
  LadderAdjacentDelta,
  LadderCell,
  MirrorExact,
  TierCell,
} from './bounded-types.ts'

/**
 * The full v1.5 experiment as pre-registered: the ten-budget ladder and the three tiers on one
 * shared 2,000-seed list, the accuracy grid on the v1.0 seed list at 50 games per pairing.
 * Pair counts were sized by pilot (see the committed artifact's meta): the adjacent-rung
 * paired SE lands well under the 0.01 the P1 test needs to bite.
 */
export const DEFAULT_BOUNDED_CONFIG: BoundedLabConfig = {
  ladderBits: [0, 8, 16, 24, 32, 48, 64, 96, 128, BOUNDED_INF_BITS],
  ladderPairs: 2000,
  ladderSeedPrefix: 'bounded-v1',
  tierPairs: 2000,
  accBits: [16, 32, 64, BOUNDED_INF_BITS],
  accGames: 50,
  accSeedPrefix: 'clsacc-v1',
  chunkPairs: 25,
  variant: 'us54',
  stepCap: 5000,
  invariantCheck: 'every',
}

/* -- cell ids and policy labels -------------------------------------------------------------- */

/** Zero-padded so the lexical and numeric orders agree — `1_000_000` (∞) needs 7 digits. */
function padBits(bits: number): string {
  return String(bits).padStart(7, '0')
}

export function ladderCellId(bits: number): string {
  return `ladder-b${padBits(bits)}`
}

export function tierCellId(tier: BotDifficulty): string {
  return `tier-${tier}`
}

export function accuracyCellId(bits: number, a: StyleId, b: StyleId): string {
  return `bacc-b${padBits(bits)}-${a}-vs-${b}`
}

/** The E3 policy label for a bounded budget: `bounded-8` … `bounded-inf`. */
export function boundedPolicyLabel(bits: number): string {
  return bits >= BOUNDED_INF_BITS ? 'bounded-inf' : `bounded-${bits}`
}

/** The unordered style pairings of the accuracy grid, in roster order — 36 for 9 styles. */
export function boundedAccuracyPairings(): (readonly [StyleId, StyleId])[] {
  const out: (readonly [StyleId, StyleId])[] = []
  for (let i = 0; i < STYLE_IDS.length; i++) {
    for (let j = i + 1; j < STYLE_IDS.length; j++) out.push([STYLE_IDS[i], STYLE_IDS[j]])
  }
  return out
}

/* -- the task plan --------------------------------------------------------------------------- */

export type BoundedTask =
  | { kind: 'ladder'; index: number; config: BoundedLabConfig; bits: number; pairFrom: number; pairTo: number }
  | { kind: 'tier'; index: number; config: BoundedLabConfig; tier: BotDifficulty; pairFrom: number; pairTo: number }
  | {
      kind: 'accuracy'
      index: number
      config: BoundedLabConfig
      bits: number
      a: StyleId
      b: StyleId
      gameFrom: number
      gameTo: number
    }

function checkLadder(name: string, bits: readonly number[]): void {
  for (let i = 0; i < bits.length; i++) {
    if (!Number.isInteger(bits[i]) || bits[i] < 0) {
      throw new Error(`planBoundedTasks: ${name}[${i}] = ${bits[i]} is not a budget (>= 0 integer)`)
    }
    if (i > 0 && bits[i] <= bits[i - 1]) {
      throw new Error(`planBoundedTasks: ${name} must ascend strictly; ${bits[i - 1]} then ${bits[i]}`)
    }
  }
  if (bits.length > 0 && bits[bits.length - 1] !== BOUNDED_INF_BITS) {
    throw new Error(
      `planBoundedTasks: ${name} must end on the ∞ rung (${BOUNDED_INF_BITS}) — ` +
        'P2 (the exact mirror) and P7 (the full-strength anchor) are read there',
    )
  }
}

/**
 * Slice the whole suite into worker tasks — contiguous pair (or game) ranges within one cell,
 * emitted cell-major across every experiment exactly as the adaptive planner does, so the
 * early tasks spread over all cells and the slow low-budget ladder cells overlap the cheap
 * accuracy cells instead of forming a serial tail.
 */
export function planBoundedTasks(config: BoundedLabConfig): BoundedTask[] {
  checkLadder('ladderBits', config.ladderBits)
  checkLadder('accBits', config.accBits)
  if (config.tierPairs > config.ladderPairs) {
    throw new Error(
      `planBoundedTasks: tierPairs ${config.tierPairs} > ladderPairs ${config.ladderPairs} — ` +
        "the tier cells replay the ladder seed list's HEAD so the bits-equivalent interpolation is per-deal",
    )
  }
  const chunk = Math.max(1, Math.floor(config.chunkPairs))

  interface Desc {
    total: number
    make: (from: number, to: number, index: number) => BoundedTask
  }
  const descs: Desc[] = []
  for (const bits of config.ladderBits) {
    descs.push({
      total: config.ladderPairs,
      make: (from, to, index) => ({ kind: 'ladder', index, config, bits, pairFrom: from, pairTo: to }),
    })
  }
  for (const tier of BOUNDED_TIERS) {
    descs.push({
      total: config.tierPairs,
      make: (from, to, index) => ({ kind: 'tier', index, config, tier, pairFrom: from, pairTo: to }),
    })
  }
  for (const bits of config.accBits) {
    for (const [a, b] of boundedAccuracyPairings()) {
      descs.push({
        total: config.accGames,
        make: (from, to, index) => ({ kind: 'accuracy', index, config, bits, a, b, gameFrom: from, gameTo: to }),
      })
    }
  }

  const tasks: BoundedTask[] = []
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
export function boundedGamesTotal(config: BoundedLabConfig): number {
  const pairings = (STYLE_IDS.length * (STYLE_IDS.length - 1)) / 2
  return (
    config.ladderBits.length * config.ladderPairs * 2 +
    BOUNDED_TIERS.length * config.tierPairs * 2 +
    config.accBits.length * pairings * config.accGames
  )
}

/* -- the compact log encoding (the E3 input) ------------------------------------------------- */

/**
 * One public event, re-read from an `elog`. The payloads carry exactly what the E3 hand replay
 * and age arithmetic need; a claim's assignments and a game_over's score snapshot are elided
 * (stated in `meta.notes` — they are derivable or unused, and the elision is what keeps ~50k
 * retained logs inside memory).
 */
export type DecodedEvent =
  | { type: 'g'; seat: Seat }
  | { type: 'a'; asker: Seat; target: Seat; hit: boolean; card: Card }
  | { type: 'c'; claimer: Seat; book: BookId; outcome: '0' | '1' | 'v' }
  | { type: 'p'; from: Seat; to: Seat }
  | { type: 'd'; from: Seat; to: Seat }
  | { type: 'o'; seat: Seat }
  | { type: 'e'; team: Team }
  | { type: 'w'; winner: '0' | '1' | 't' }

/**
 * Encode a full public log, one self-delimiting token per event, preserving event ORDER and
 * COUNT exactly — evidence age is a log-index difference, so the encoding must never drop or
 * merge an event. Tokens: `g0` started · `a12+7H` ask (asker, target, hit, card) · `c305`
 * claim (claimer, book index in `allBooks` order, outcome) · `p02`/`d03` pass/designate ·
 * `o4` out · `e1` endgame · `w0` game over.
 */
export function encodeElog(log: readonly PublicEvent[], rules: RulesConfig): string {
  const bookIndex = new Map<BookId, number>(allBooks(rules).map((b, i) => [b, i]))
  const parts: string[] = []
  for (const ev of log) {
    switch (ev.type) {
      case 'game_started':
        parts.push(`g${ev.startingSeat}`)
        break
      case 'ask':
        parts.push(`a${ev.asker}${ev.target}${ev.hit ? '+' : '-'}${ev.card}`)
        break
      case 'claim': {
        const bi = bookIndex.get(ev.book)
        if (bi === undefined) throw new Error(`encodeElog: claim names unknown book ${ev.book}`)
        parts.push(`c${ev.claimer}${bi}${ev.outcome === 'team0' ? '0' : ev.outcome === 'team1' ? '1' : 'v'}`)
        break
      }
      case 'pass':
        parts.push(`p${ev.from}${ev.to}`)
        break
      case 'designate':
        parts.push(`d${ev.from}${ev.to}`)
        break
      case 'player_out':
        parts.push(`o${ev.seat}`)
        break
      case 'endgame':
        parts.push(`e${ev.claimingTeam}`)
        break
      case 'game_over':
        parts.push(`w${ev.winner === 'tie' ? 't' : ev.winner}`)
        break
    }
  }
  return parts.join('')
}

function seatDigit(text: string, at: number, context: string): Seat {
  const d = text.charCodeAt(at) - 48
  if (d < 0 || d > 5) throw new Error(`decodeElog: ${context} at ${at}: "${text[at]}" is not a seat`)
  return d as Seat
}

/** Decode an `elog`. Throws on any malformed byte — a corrupted record must never parse. */
export function decodeElog(text: string, rules: RulesConfig): DecodedEvent[] {
  const books = allBooks(rules)
  const out: DecodedEvent[] = []
  let i = 0
  while (i < text.length) {
    const t = text[i]
    switch (t) {
      case 'g':
        out.push({ type: 'g', seat: seatDigit(text, i + 1, 'game_started seat') })
        i += 2
        break
      case 'a': {
        const asker = seatDigit(text, i + 1, 'asker')
        const target = seatDigit(text, i + 2, 'target')
        const h = text[i + 3]
        if (h !== '+' && h !== '-') throw new Error(`decodeElog: ask hit flag at ${i + 3}: "${h}"`)
        const card = text.slice(i + 4, i + 6)
        if (card.length !== 2) throw new Error(`decodeElog: truncated ask card at ${i + 4}`)
        out.push({ type: 'a', asker, target, hit: h === '+', card: card as Card })
        i += 6
        break
      }
      case 'c': {
        const claimer = seatDigit(text, i + 1, 'claimer')
        const bi = text.charCodeAt(i + 2) - 48
        if (bi < 0 || bi >= books.length) throw new Error(`decodeElog: book index at ${i + 2}: "${text[i + 2]}"`)
        const oc = text[i + 3]
        if (oc !== '0' && oc !== '1' && oc !== 'v') throw new Error(`decodeElog: claim outcome at ${i + 3}: "${oc}"`)
        out.push({ type: 'c', claimer, book: books[bi], outcome: oc })
        i += 4
        break
      }
      case 'p':
      case 'd':
        out.push({ type: t, from: seatDigit(text, i + 1, 'from'), to: seatDigit(text, i + 2, 'to') })
        i += 3
        break
      case 'o':
        out.push({ type: 'o', seat: seatDigit(text, i + 1, 'player_out seat') })
        i += 2
        break
      case 'e': {
        const team = text.charCodeAt(i + 1) - 48
        if (team !== 0 && team !== 1) throw new Error(`decodeElog: endgame team at ${i + 1}`)
        out.push({ type: 'e', team: team as Team })
        i += 2
        break
      }
      case 'w': {
        const wv = text[i + 1]
        if (wv !== '0' && wv !== '1' && wv !== 't') throw new Error(`decodeElog: winner at ${i + 1}: "${wv}"`)
        out.push({ type: 'w', winner: wv })
        i += 2
        break
      }
      default:
        throw new Error(`decodeElog: unknown event tag "${t}" at ${i}`)
    }
  }
  return out
}

/* -- playing one game ------------------------------------------------------------------------ */

interface BoundedPlayed {
  steps: number
  finished: boolean
  capped: boolean
  illegal: number
  invariantViolations: number
  sets: [number, number]
  unresolved: number
  voids: number
  clinch: boolean
  tie: boolean
  /** The complete public log, present when the caller asked for it. */
  log: PublicEvent[] | null
  /** The final state, for the accuracy read. */
  finalTop: StyleId[] | null
}

/**
 * One game: the action-selection half of play.ts with the exact lab seeding
 * (`hashSeed(seed:moveIndex)`), keeping the final state so the public log can be retained
 * (E1/E2 → E3) or classified (E4). No emergency substitution, exactly as the adaptive
 * accuracy loop: every policy here is pinned illegal-free by the engine's own contract, and
 * if one ever slipped, the single `illegal` count voids the whole run at the health gate.
 */
function playBoundedGame(
  policies: readonly PolicySpec[],
  seed: string,
  startSeat: Seat,
  config: BoundedLabConfig,
  want: 'log' | 'classify',
): BoundedPlayed {
  const rules = configFor(config.variant)
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

  return {
    steps,
    finished,
    capped,
    illegal,
    invariantViolations,
    sets: [t0, t1],
    unresolved: books.length - resolved,
    voids,
    clinch: finished && Math.max(t0, t1) === target,
    tie,
    log: want === 'log' ? s.log : null,
    finalTop: want === 'classify' ? classifySeats(publicView(s)).map((c) => c.top) : null,
  }
}

/** `Object.hasOwn` before the roster lookup: task fields cross a worker boundary. */
function rosterStyle(id: StyleId): StyleParams {
  if (typeof id !== 'string' || !Object.hasOwn(STYLE_ROSTER, id)) {
    throw new Error(`bounded lab: unknown style id ${String(id)}`)
  }
  return STYLE_ROSTER[id]
}

function shareOf(setsA: number, setsB: number): number {
  const total = setsA + setsB
  return total === 0 ? 0.5 : setsA / total
}

const ORIENTS: readonly Orientation[] = [0, 1]

/** One worker task. Pure — see the file header. */
export function runBoundedTask(task: BoundedTask): BoundedTaskResult {
  const t0 = Date.now()
  const cfg = task.config
  const rules = configFor(cfg.variant)
  const records: BoundedGameRecord[] = []

  if (task.kind === 'accuracy') {
    // Validate the ids against the roster before playing anything — task fields cross a
    // worker boundary. The specs then carry the ids themselves.
    rosterStyle(task.a)
    rosterStyle(task.b)
    const specA: PolicySpec = { bounded: true, bits: task.bits, style: task.a }
    const specB: PolicySpec = { bounded: true, bits: task.bits, style: task.b }
    const policies = ALL_SEATS.map((seat): PolicySpec => (seatTeam(seat) === 0 ? specA : specB))
    for (let game = task.gameFrom; game < task.gameTo; game++) {
      const seed = seedFor(cfg.accSeedPrefix, game)
      const startSeat = startSeatFor(game)
      const g = playBoundedGame(policies, seed, startSeat, cfg, 'classify')
      records.push({
        exp: 'accuracy',
        cell: accuracyCellId(task.bits, task.a, task.b),
        pair: game,
        orient: 0,
        seed,
        startSeat,
        aTeam: 0,
        steps: g.steps,
        finished: g.finished,
        capped: g.capped,
        illegal: g.illegal,
        invariantViolations: g.invariantViolations,
        setsA: g.sets[0],
        setsB: g.sets[1],
        unresolved: g.unresolved,
        voids: g.voids,
        aShare: shareOf(g.sets[0], g.sets[1]),
        clinch: g.clinch,
        tie: g.tie,
        bits: task.bits,
        pairing: [task.a, task.b],
        top: g.finalTop ?? [],
      })
    }
    return { taskIndex: task.index, records, wallMs: Date.now() - t0 }
  }

  // E1 and E2 share the reference opposition and the seed list (the tier cells replay its head).
  const reference: PolicySpec = STYLE_ROSTER.balanced
  const mine: PolicySpec =
    task.kind === 'ladder' ? { bounded: true, bits: task.bits, style: 'balanced' } : task.tier
  const cell = task.kind === 'ladder' ? ladderCellId(task.bits) : tierCellId(task.tier)

  for (let pair = task.pairFrom; pair < task.pairTo; pair++) {
    const seed = seedFor(cfg.ladderSeedPrefix, pair)
    const startSeat = startSeatFor(pair)
    for (const orient of ORIENTS) {
      const aTeam: Team = orient === 0 ? 0 : 1
      const policies = ALL_SEATS.map((seat): PolicySpec => (seatTeam(seat) === aTeam ? mine : reference))
      const g = playBoundedGame(policies, seed, startSeat, cfg, 'log')
      const setsA = g.sets[aTeam]
      const setsB = g.sets[(1 - aTeam) as Team]
      const rec: BoundedGameRecord = {
        exp: task.kind,
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
        aShare: shareOf(setsA, setsB),
        clinch: g.clinch,
        tie: g.tie,
        elog: encodeElog(g.log ?? [], rules),
      }
      if (task.kind === 'ladder') rec.bits = task.bits
      else rec.tier = task.tier
      records.push(rec)
    }
  }

  return { taskIndex: task.index, records, wallMs: Date.now() - t0 }
}

/* -- canonical order and the digest ---------------------------------------------------------- */

const EXP_ORDER: ReadonlyMap<BoundedGameRecord['exp'], number> = new Map([
  ['ladder', 0],
  ['tier', 1],
  ['accuracy', 2],
])

/** Sort key: experiment, cell, pair, orientation — never worker-arrival order. */
function canonical(a: BoundedGameRecord, b: BoundedGameRecord): number {
  const ea = EXP_ORDER.get(a.exp) ?? 9
  const eb = EXP_ORDER.get(b.exp) ?? 9
  if (ea !== eb) return ea - eb
  if (a.cell !== b.cell) return a.cell < b.cell ? -1 : 1
  if (a.pair !== b.pair) return a.pair - b.pair
  return a.orient - b.orient
}

/** One JSON object per line, canonical order. The per-game artifact and the digest's input. */
export function boundedToJsonl(records: readonly BoundedGameRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '')
}

/* -- E1/E2 aggregation ----------------------------------------------------------------------- */

/** Sample standard deviation (n-1). Zero for fewer than two observations. */
function sd(xs: readonly number[]): number {
  if (xs.length < 2) return 0
  const m = xs.reduce((s, v) => s + v, 0) / xs.length
  let ss = 0
  for (const x of xs) ss += (x - m) * (x - m)
  return Math.sqrt(ss / (xs.length - 1))
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length
}

/**
 * A JSON-safe z: `delta / se`, with the zero-SE degenerate cases mapped to finite sentinels
 * (JSON cannot carry ±∞ — `JSON.stringify` would silently write `null` and the boundary
 * validator rightly refuses a non-finite number). A zero-SE nonzero delta reports ±1e9; the
 * `pass` field, which is computed from the inequality directly, is the authoritative test.
 */
function finiteZ(delta: number, se: number): number {
  if (se > 0) return delta / se
  return delta === 0 ? 0 : Math.sign(delta) * 1e9
}

/** Per-pair duplicate means of `aShare`: pair -> mean over the two orientations. */
function pairShareMeans(records: readonly BoundedGameRecord[]): Map<number, number> {
  const acc = new Map<number, number[]>()
  for (const r of records) {
    const slot = acc.get(r.pair)
    if (slot === undefined) acc.set(r.pair, [r.aShare])
    else slot.push(r.aShare)
  }
  const out = new Map<number, number>()
  for (const [pair, results] of acc) {
    if (results.length !== 2) continue
    out.set(pair, (results[0] + results[1]) / 2)
  }
  return out
}

/** The §5.1 paired estimator over one cell, on set-share. */
function shareCell(id: string, records: readonly BoundedGameRecord[], expectedPairs: number): BoundedShareCell {
  const seeds = new Set<string>()
  let steps = 0
  let maxMoves = 0
  let illegalActions = 0
  let invariantViolations = 0
  let cappedGames = 0
  let ties = 0
  let voids = 0
  let nonClinch = 0
  for (const r of records) {
    seeds.add(r.seed)
    steps += r.steps
    if (r.steps > maxMoves) maxMoves = r.steps
    illegalActions += r.illegal
    invariantViolations += r.invariantViolations
    if (r.capped) cappedGames++
    if (r.tie) ties++
    voids += r.voids
    if (!r.clinch) nonClinch++
  }
  const paired = [...pairShareMeans(records).values()]
  const flat = records.map((r) => r.aShare)
  const share = mean(paired)
  const se = paired.length > 0 ? sd(paired) / Math.sqrt(paired.length) : 0
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
    share,
    se,
    ci95: [share - 1.96 * se, share + 1.96 * se],
    seUnpaired: flat.length > 0 ? sd(flat) / Math.sqrt(flat.length) : 0,
    avgMoves: records.length === 0 ? 0 : steps / records.length,
    maxMoves,
    health,
  }
}

/**
 * The P1 statistic at every adjacent rung: budgets replay the identical seed list, so the
 * delta is per-seed (duplicate-pair means joined on the pair index, which IS the seed index)
 * and the SE is sd of those per-seed deltas over √seeds — the "paired SE" the spec names.
 */
export function ladderAdjacentDeltas(
  ladderBits: readonly number[],
  byBits: ReadonlyMap<number, readonly BoundedGameRecord[]>,
): LadderAdjacentDelta[] {
  const out: LadderAdjacentDelta[] = []
  for (let k = 0; k + 1 < ladderBits.length; k++) {
    const lo = ladderBits[k]
    const hi = ladderBits[k + 1]
    const meansLo = pairShareMeans(byBits.get(lo) ?? [])
    const meansHi = pairShareMeans(byBits.get(hi) ?? [])
    const deltas: number[] = []
    for (const [pair, mLo] of meansLo) {
      const mHi = meansHi.get(pair)
      if (mHi === undefined) continue
      deltas.push(mHi - mLo)
    }
    const delta = mean(deltas)
    const se = deltas.length > 0 ? sd(deltas) / Math.sqrt(deltas.length) : 0
    out.push({
      fromBits: lo,
      toBits: hi,
      seeds: deltas.length,
      delta,
      se,
      z: finiteZ(delta, se),
      pass: delta >= -2 * se,
    })
  }
  return out
}

/**
 * The P2 exactness check on INTEGERS: at ∞ both teams play bit-identical balanced, so the two
 * orientations of a pair are literally the same game — same step count, sets mirrored exactly.
 * Floats never enter the test (a float share sum can miss 1.0 by an ulp and prove nothing).
 */
export function mirrorExactness(records: readonly BoundedGameRecord[]): MirrorExact {
  const byPair = new Map<number, BoundedGameRecord[]>()
  for (const r of records) {
    const slot = byPair.get(r.pair)
    if (slot === undefined) byPair.set(r.pair, [r])
    else slot.push(r)
  }
  let pairs = 0
  let deviations = 0
  for (const [, recs] of byPair) {
    if (recs.length !== 2) continue
    pairs++
    const [r0, r1] = recs[0].orient === 0 ? [recs[0], recs[1]] : [recs[1], recs[0]]
    const mirrored = r0.setsA === r1.setsB && r0.setsB === r1.setsA && r0.steps === r1.steps
    if (!mirrored) deviations++
  }
  return { pairs, deviations, share: mean([...pairShareMeans(records).values()]) }
}

/**
 * Place a share on the finite segment of the E1 curve (∞ excluded — a share above the top
 * finite rung has no finite equivalent, which is itself a finding). First-crossing rule,
 * scanning ascending; a flat bracketing segment resolves to its left edge; a share below
 * every finite point clamps to the 0-bit floor. Deliberately point-estimate interpolation:
 * the curve's own noise is not propagated, and the CI comes from mapping `share ∓ 1.96·se`
 * through the same rule.
 */
export function bitsEquivalentOf(share: number, se: number, ladder: readonly LadderCell[]): BitsEquivalent {
  const finite = ladder.filter((c) => c.bits < BOUNDED_INF_BITS)
  if (finite.length < 2) {
    return { finite: false, bits: null, lo: null, hi: null, note: 'fewer than two finite ladder points' }
  }
  const place = (s: number): number | null => {
    for (let k = 0; k + 1 < finite.length; k++) {
      const a = finite[k]
      const b = finite[k + 1]
      if ((a.share - s) * (b.share - s) <= 0) {
        if (b.share === a.share) return a.bits
        return a.bits + ((s - a.share) / (b.share - a.share)) * (b.bits - a.bits)
      }
    }
    if (finite.every((c) => s < c.share)) return finite[0].bits
    return null
  }
  const bits = place(share)
  if (bits === null) {
    return {
      finite: false,
      bits: null,
      lo: place(share - 1.96 * se),
      hi: null,
      note: `share ${share.toFixed(4)} sits above every finite rung — between ${finite[finite.length - 1].bits} bits and ∞`,
    }
  }
  const note =
    finite.every((c) => share < c.share) && bits === finite[0].bits
      ? `share ${share.toFixed(4)} sits at or below the 0-bit floor — clamped`
      : 'first ascending crossing of the finite ladder segment'
  return { finite: true, bits, lo: place(share - 1.96 * se), hi: place(share + 1.96 * se), note }
}

/* -- E3: the evidence-age estimator ---------------------------------------------------------- */

/**
 * The fixed age bands of every reported curve. Chosen (before the run) to give the P6 window
 * test its exact edges — the old easy tier reads the last 6 log events, so ages 1–6 are inside
 * the window and 7–12 just past it — and to widen geometrically where availability thins.
 */
export const EVIDENCE_AGE_BANDS: readonly { lo: number; hi: number | null }[] = Object.freeze([
  { lo: 1, hi: 2 },
  { lo: 3, hi: 4 },
  { lo: 5, hi: 6 },
  { lo: 7, hi: 8 },
  { lo: 9, hi: 12 },
  { lo: 13, hi: 16 },
  { lo: 17, hi: 24 },
  { lo: 25, hi: 32 },
  { lo: 33, hi: 48 },
  { lo: 49, hi: 64 },
  { lo: 65, hi: 96 },
  { lo: 97, hi: 128 },
  { lo: 129, hi: null },
])

/** Minimum availability for a band to anchor the half-life read — thinner bands are noise. */
export const EVIDENCE_MIN_BAND = 200

/**
 * The estimator core, over one game: reconstruct every hand from the deal plus the log's own
 * card movements (a hit moves the named card target → asker; a claim retires the book from
 * every hand; nothing else moves cards), and at every ask event emit one observation per
 * available certain ask. Availability is exactly the spec's: the card's current public
 * location was established by a hit at event `j`, its holder is an opponent of the acting
 * seat, and the ask is legal for that seat (holds a card of the book — read off the
 * reconstructed hand; the asked card itself is at the holder, so the no-own-card rule is
 * satisfied by construction; the book is live, or the card would already be retired).
 */
export function evidenceObservationsFromLog(
  hands: readonly (readonly Card[])[],
  events: readonly DecodedEvent[],
  rules: RulesConfig,
): { observations: CertainAskObservation[]; asksBySeat: number[] } {
  const books = allBooks(rules)
  const bookIndex = new Map<BookId, number>(books.map((b, i) => [b, i]))
  const hand: Set<Card>[] = hands.map((h) => new Set(h))
  // Per seat, per book: how many cards of the book the seat holds — the O(1) legality read.
  const bookCount: Int32Array[] = ALL_SEATS.map(() => new Int32Array(books.length))
  for (const seat of ALL_SEATS) {
    for (const c of hand[seat]) {
      const bi = bookIndex.get(cardBook(c))
      if (bi !== undefined) bookCount[seat][bi]++
    }
  }
  const located = new Map<Card, { holder: Seat; at: number }>()
  const observations: CertainAskObservation[] = []
  const asksBySeat = new Array<number>(6).fill(0)

  const moveCard = (card: Card, from: Seat, to: Seat): void => {
    const bi = bookIndex.get(cardBook(card))
    if (hand[from].delete(card) && bi !== undefined) bookCount[from][bi]--
    if (!hand[to].has(card)) {
      hand[to].add(card)
      if (bi !== undefined) bookCount[to][bi]++
    }
  }

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    if (ev.type === 'a') {
      const s = ev.asker
      asksBySeat[s]++
      const sTeam = seatTeam(s)
      for (const [card, loc] of located) {
        if (loc.holder === s || seatTeam(loc.holder) === sTeam) continue
        const bi = bookIndex.get(cardBook(card))
        if (bi === undefined || bookCount[s][bi] === 0) continue
        observations.push({
          event: i,
          seat: s,
          age: i - loc.at,
          exploited: ev.card === card && ev.target === loc.holder,
          hit: ev.hit,
        })
      }
      if (ev.hit) {
        moveCard(ev.card, ev.target, ev.asker)
        located.set(ev.card, { holder: ev.asker, at: i })
      }
    } else if (ev.type === 'c') {
      for (const c of bookCards(ev.book, rules)) {
        const bi = bookIndex.get(ev.book)
        for (const seat of ALL_SEATS) {
          if (hand[seat].delete(c) && bi !== undefined) bookCount[seat][bi]--
        }
        located.delete(c)
      }
    }
  }
  return { observations, asksBySeat }
}

/** The age classes every clustered comparison is formed over. */
const CLS_YOUNG = 0 // 1–8
const CLS_OLD = 1 // 33+
const CLS_IN_1_3 = 2
const CLS_IN_4_6 = 3
const CLS_IN_1_6 = 4
const CLS_OUT_7_12 = 5
const CLS_COUNT = 6

function classesOf(age: number): number[] {
  const out: number[] = []
  if (age <= 8) out.push(CLS_YOUNG)
  if (age >= 33) out.push(CLS_OLD)
  if (age <= 3) out.push(CLS_IN_1_3)
  if (age >= 4 && age <= 6) out.push(CLS_IN_4_6)
  if (age <= 6) out.push(CLS_IN_1_6)
  if (age >= 7 && age <= 12) out.push(CLS_OUT_7_12)
  return out
}

interface PolicyTally {
  asks: number
  decisionsWithCertain: number
  observations: number
  /** age -> [available, exploited, hits]. */
  byAge: Map<number, [number, number, number]>
  /** seed -> per-class [available, exploited] pairs, flattened. */
  bySeed: Map<string, Float64Array>
}

function clusteredDiff(bySeed: ReadonlyMap<string, Float64Array>, clsA: number, clsB: number): ClusteredDiff {
  const diffs: number[] = []
  for (const [, t] of bySeed) {
    const aAvail = t[clsA * 2]
    const bAvail = t[clsB * 2]
    if (aAvail === 0 || bAvail === 0) continue
    diffs.push(t[clsA * 2 + 1] / aAvail - t[clsB * 2 + 1] / bAvail)
  }
  const diff = mean(diffs)
  const se = diffs.length > 0 ? sd(diffs) / Math.sqrt(diffs.length) : 0
  return { diff, se, z: finiteZ(diff, se), seeds: diffs.length }
}

function rateOver(byAge: ReadonlyMap<number, [number, number, number]>, lo: number, hi: number | null): EvidenceRate {
  let available = 0
  let exploited = 0
  for (const [age, [a, e]] of byAge) {
    if (age < lo || (hi !== null && age > hi)) continue
    available += a
    exploited += e
  }
  return { available, exploited, rate: available === 0 ? 0 : exploited / available }
}

/**
 * Fold every retained E1/E2 record into per-policy evidence-age curves. Seats map to policies
 * structurally: the record's `aTeam` played the measured policy (`bounded-{bits}` or
 * `tier-{tier}`), the other team the unbounded balanced `reference` — which therefore pools
 * across every cell it appears in, its curve being a property of the policy, not the
 * opposition. Clustered comparisons cluster by SEED (deals recur across cells, and
 * observations within a deal are not independent).
 */
export function aggregateEvidence(
  records: readonly BoundedGameRecord[],
  rules: RulesConfig,
  opts?: { minBandAvailable?: number },
): EvidenceCurve[] {
  const minBand = opts?.minBandAvailable ?? EVIDENCE_MIN_BAND
  const tallies = new Map<string, PolicyTally>()
  const tally = (policy: string): PolicyTally => {
    let t = tallies.get(policy)
    if (t === undefined) {
      t = { asks: 0, decisionsWithCertain: 0, observations: 0, byAge: new Map(), bySeed: new Map() }
      tallies.set(policy, t)
    }
    return t
  }

  for (const r of records) {
    if (r.elog === undefined) continue
    const measured =
      r.exp === 'ladder' ? boundedPolicyLabel(r.bits ?? 0) : r.exp === 'tier' ? `tier-${r.tier ?? 'hard'}` : null
    if (measured === null) continue
    const events = decodeElog(r.elog, rules)
    const hands = newGame(r.seed, rules, r.startSeat).hands
    const { observations, asksBySeat } = evidenceObservationsFromLog(hands, events, rules)
    const policyOf = (seat: Seat): string => (seatTeam(seat) === r.aTeam ? measured : 'reference')
    for (const seat of ALL_SEATS) tally(policyOf(seat)).asks += asksBySeat[seat]
    let lastKey = -1
    for (const ob of observations) {
      const t = tally(policyOf(ob.seat))
      t.observations++
      const key = ob.event
      if (key !== lastKey) {
        t.decisionsWithCertain++
        lastKey = key
      }
      let slot = t.byAge.get(ob.age)
      if (slot === undefined) {
        slot = [0, 0, 0]
        t.byAge.set(ob.age, slot)
      }
      slot[0]++
      if (ob.exploited) slot[1]++
      if (ob.hit) slot[2]++
      let seedSlot = t.bySeed.get(r.seed)
      if (seedSlot === undefined) {
        seedSlot = new Float64Array(CLS_COUNT * 2)
        t.bySeed.set(r.seed, seedSlot)
      }
      for (const cls of classesOf(ob.age)) {
        seedSlot[cls * 2]++
        if (ob.exploited) seedSlot[cls * 2 + 1]++
      }
    }
  }

  // Canonical policy order: bounded budgets ascending, reference, then the tiers.
  const order: string[] = []
  const seen = new Set<string>()
  const push = (p: string): void => {
    if (tallies.has(p) && !seen.has(p)) {
      order.push(p)
      seen.add(p)
    }
  }
  const boundedLabels = [...tallies.keys()]
    .filter((p) => p.startsWith('bounded-') && p !== 'bounded-inf')
    .sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)))
  for (const p of boundedLabels) push(p)
  push('bounded-inf')
  push('reference')
  for (const tier of BOUNDED_TIERS) push(`tier-${tier}`)
  for (const p of [...tallies.keys()].sort()) push(p)

  const curves: EvidenceCurve[] = []
  for (const policy of order) {
    const t = tallies.get(policy)
    if (t === undefined) continue
    const rows: EvidenceAgeRow[] = EVIDENCE_AGE_BANDS.map((band) => {
      let available = 0
      let exploited = 0
      let hits = 0
      for (const [age, [a, e, h]] of t.byAge) {
        if (age < band.lo || (band.hi !== null && age > band.hi)) continue
        available += a
        exploited += e
        hits += h
      }
      return {
        lo: band.lo,
        hi: band.hi,
        available,
        exploited,
        exploitRate: available === 0 ? 0 : exploited / available,
        hits,
        hitRate: available === 0 ? 0 : hits / available,
      }
    })
    // Half-life: the youngest band anchors; the first sufficiently-fed band at or below half
    // its rate names the age. Null when the curve never falls that far — a flat curve has no
    // half-life, and that absence is the P4 finding, not a defect.
    let halfLifeAge: number | null = null
    const base = rows[0]
    if (base.available >= minBand && base.exploitRate > 0) {
      for (let k = 1; k < rows.length; k++) {
        if (rows[k].available < minBand) continue
        if (rows[k].exploitRate <= base.exploitRate / 2) {
          halfLifeAge = rows[k].lo
          break
        }
      }
    }
    const window: EvidenceWindow = {
      inside: rateOver(t.byAge, 1, 6),
      justOutside: rateOver(t.byAge, 7, 12),
      insideSplit: clusteredDiff(t.bySeed, CLS_IN_1_3, CLS_IN_4_6),
      cliff: clusteredDiff(t.bySeed, CLS_IN_1_6, CLS_OUT_7_12),
    }
    curves.push({
      policy,
      askDecisions: t.asks,
      decisionsWithCertain: t.decisionsWithCertain,
      observations: t.observations,
      rows,
      young: rateOver(t.byAge, 1, 8),
      old: rateOver(t.byAge, 33, null),
      decay: clusteredDiff(t.bySeed, CLS_YOUNG, CLS_OLD),
      window,
      halfLifeAge,
    })
  }
  return curves
}

/* -- E4 aggregation -------------------------------------------------------------------------- */

/**
 * Score the accuracy grid: end-of-game top-1 per budget (overall and per true style), plus the
 * P7 adjacent deltas. Truth per seat is structural — `pairing[0]` played team 0, `pairing[1]`
 * team 1 — and the adjacent deltas are per-seed: every budget replays the identical seed list,
 * so per-seed accuracies are joined and differenced within seed before the SE is taken.
 */
export function scoreBoundedAccuracy(
  records: readonly BoundedGameRecord[],
  accBits: readonly number[],
): BoundedAccuracy {
  interface LevelTally {
    games: number
    seats: number
    correct: number
    byStyle: Map<StyleId, { seats: number; correct: number }>
    bySeed: Map<string, [number, number]>
  }
  const levels = new Map<number, LevelTally>()
  for (const bits of accBits) {
    levels.set(bits, { games: 0, seats: 0, correct: 0, byStyle: new Map(), bySeed: new Map() })
  }
  for (const r of records) {
    if (r.exp !== 'accuracy' || r.bits === undefined || r.pairing === undefined || r.top === undefined) continue
    const t = levels.get(r.bits)
    if (t === undefined) continue
    t.games++
    let seedSlot = t.bySeed.get(r.seed)
    if (seedSlot === undefined) {
      seedSlot = [0, 0]
      t.bySeed.set(r.seed, seedSlot)
    }
    for (const seat of ALL_SEATS) {
      const truth = seatTeam(seat) === 0 ? r.pairing[0] : r.pairing[1]
      const predicted = r.top[seat]
      t.seats++
      seedSlot[0]++
      let by = t.byStyle.get(truth)
      if (by === undefined) {
        by = { seats: 0, correct: 0 }
        t.byStyle.set(truth, by)
      }
      by.seats++
      if (predicted === truth) {
        t.correct++
        by.correct++
        seedSlot[1]++
      }
    }
  }

  const cells: BoundedAccuracyCell[] = []
  for (const bits of accBits) {
    const t = levels.get(bits)
    if (t === undefined) continue
    const byStyle = {} as Record<StyleId, AccuracyByStyle>
    for (const style of STYLE_IDS) {
      const by = t.byStyle.get(style)
      byStyle[style] =
        by === undefined ? { seats: 0, top1: 0 } : { seats: by.seats, top1: by.seats === 0 ? 0 : by.correct / by.seats }
    }
    cells.push({ bits, games: t.games, seats: t.seats, top1: t.seats === 0 ? 0 : t.correct / t.seats, byStyle })
  }

  const deltas: AccuracyAdjacentDelta[] = []
  for (let k = 0; k + 1 < accBits.length; k++) {
    const lo = levels.get(accBits[k])
    const hi = levels.get(accBits[k + 1])
    const diffs: number[] = []
    if (lo !== undefined && hi !== undefined) {
      for (const [seed, [nLo, cLo]] of lo.bySeed) {
        const hiSlot = hi.bySeed.get(seed)
        if (hiSlot === undefined || nLo === 0 || hiSlot[0] === 0) continue
        diffs.push(hiSlot[1] / hiSlot[0] - cLo / nLo)
      }
    }
    const delta = mean(diffs)
    const se = diffs.length > 0 ? sd(diffs) / Math.sqrt(diffs.length) : 0
    deltas.push({
      fromBits: accBits[k],
      toBits: accBits[k + 1],
      seeds: diffs.length,
      delta,
      se,
      z: finiteZ(delta, se),
      pass: delta >= -2 * se,
    })
  }
  return { cells, deltas }
}

/* -- the run --------------------------------------------------------------------------------- */

/**
 * Fold the raw task results into the run output: canonical order, per-experiment aggregates,
 * the health gate, the digest. Pure — same results in any order, same output; `wallMs` and
 * `generatedAt` are provenance, supplied by the caller.
 */
export function assembleBoundedRun(
  config: BoundedLabConfig,
  results: readonly BoundedTaskResult[],
  opts: { wallMs: number; workers: number; generatedAt: string },
): BoundedRunOutput {
  const rules = configFor(config.variant)
  const all: BoundedGameRecord[] = []
  for (const r of results) for (const rec of r.records) all.push(rec)
  all.sort(canonical)

  const groups = new Map<string, BoundedGameRecord[]>()
  for (const r of all) {
    const slot = groups.get(r.cell)
    if (slot === undefined) groups.set(r.cell, [r])
    else slot.push(r)
  }
  const group = (cell: string): BoundedGameRecord[] => groups.get(cell) ?? []

  const violations: string[] = []
  const checkCell = (agg: BoundedShareCell, expectedPairs: number): void => {
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

  // --- E1: the ladder -------------------------------------------------------------------------
  const ladder: LadderCell[] = []
  const byBits = new Map<number, BoundedGameRecord[]>()
  if (config.ladderPairs > 0) {
    for (const bits of config.ladderBits) {
      const recs = group(ladderCellId(bits))
      byBits.set(bits, recs)
      const agg = shareCell(ladderCellId(bits), recs, config.ladderPairs)
      checkCell(agg, config.ladderPairs)
      ladder.push({ ...agg, bits })
    }
  }
  const ladderDeltas = config.ladderPairs > 0 ? ladderAdjacentDeltas(config.ladderBits, byBits) : []

  // --- P2: the ∞ mirror, integer-exact — a deviation is a harness bug and VOIDS the run -------
  const infBits = config.ladderBits[config.ladderBits.length - 1]
  const mirrorExact =
    config.ladderPairs > 0 && infBits !== undefined
      ? mirrorExactness(byBits.get(infBits) ?? [])
      : { pairs: 0, deviations: 0, share: 0 }
  if (mirrorExact.deviations > 0) {
    violations.push(
      `P2: ${mirrorExact.deviations} of ${mirrorExact.pairs} ∞-budget pairs were not exact mirrors — ` +
        'both teams play bit-identical balanced there, so the two orientations must be the same game; ' +
        'a deviation is a harness bug, full stop',
    )
  }

  // --- E2: the tiers --------------------------------------------------------------------------
  const tiers: TierCell[] = []
  if (config.tierPairs > 0) {
    for (const tier of BOUNDED_TIERS) {
      const recs = group(tierCellId(tier))
      const agg = shareCell(tierCellId(tier), recs, config.tierPairs)
      checkCell(agg, config.tierPairs)
      // The interpolation claim, checked: tier games must have replayed the ladder list's head.
      for (const r of recs) {
        if (r.seed !== seedFor(config.ladderSeedPrefix, r.pair)) {
          violations.push(`cell ${agg.id}: pair ${r.pair} played seed ${r.seed}, not the ladder list's`)
          break
        }
      }
      tiers.push({ ...agg, tier, bitsEquivalent: bitsEquivalentOf(agg.share, agg.se, ladder) })
    }
  }

  // --- E3: evidence age, post-hoc over the retained records -----------------------------------
  const evidence = aggregateEvidence(all, rules)

  // --- E4: the accuracy grid ------------------------------------------------------------------
  const accuracy =
    config.accGames > 0
      ? scoreBoundedAccuracy(all, config.accBits)
      : { cells: [], deltas: [] }
  if (config.accGames > 0) {
    for (const bits of config.accBits) {
      for (const [a, b] of boundedAccuracyPairings()) {
        const recs = group(accuracyCellId(bits, a, b))
        const seeds = new Set(recs.map((r) => r.seed))
        if (recs.length !== config.accGames || seeds.size !== config.accGames) {
          violations.push(
            `cell ${accuracyCellId(bits, a, b)}: ${recs.length} games over ${seeds.size} distinct seeds, ` +
              `expected ${config.accGames}`,
          )
        }
      }
    }
  }

  // --- the health gate ------------------------------------------------------------------------
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
      capped.push({ cell: r.cell, seed: r.seed, orient: r.orient, startSeat: r.startSeat, steps: r.steps })
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
  const health: BoundedHealthSummary = {
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
      schemaVersion: BOUNDED_SCHEMA_VERSION,
      generatedAt: opts.generatedAt,
      config,
      gamesTotal: all.length,
      movesTotal,
      workers: opts.workers,
      wallMs: opts.wallMs,
      gamesPerSecond: seconds === 0 ? 0 : all.length / seconds,
      recordsDigest: digest(boundedToJsonl(all)),
      notes: [
        'E1/E2 records retain the FULL public log as `elog`: one self-delimiting token per ' +
          'event, order and count preserved exactly (ages are log-index differences). A ' +
          "claim's assignments/actualHolders and a game_over's score snapshot are elided — " +
          'derivable or unused by the E3 estimator, and the elision keeps the retained logs ' +
          'in memory. Nothing else is dropped or capped.',
        'E3 estimator: at ask event i, every card whose public location a hit established at ' +
          'event j (unmoved and unretired since) that the acting seat could legally ask of the ' +
          'correct holder is one availability observation at age i−j; exploited iff the actual ' +
          'ask was exactly that card at that holder; the hit column is the actual ask’s ' +
          'outcome. Hands are reconstructed from the seed’s deal plus the log’s hits and ' +
          'claims. Clustered comparisons (decay, window) cluster by seed; the half-life read ' +
          `requires ${EVIDENCE_MIN_BAND} observations in a band.`,
        'E2 tier cells replay the HEAD of the E1 seed list (same prefix, same start seats), ' +
          'so the bits-equivalent interpolation compares per-deal.',
        'E4 replays the v1.0 accuracy seed list and pairings; the ∞ cell is decision-identical ' +
          'to the v1.0 experiment by the Phase 1 anchor pin, so its top-1 must reproduce the ' +
          'committed baseline exactly.',
      ],
    },
    health,
    ladder,
    ladderDeltas,
    mirrorExact,
    tiers,
    evidence,
    accuracy,
    records: all,
  }
}

/* -- verdicts and the artifact --------------------------------------------------------------- */

function fmt(x: number): string {
  return x.toFixed(4)
}

function fmtBits(bits: number): string {
  return bits >= BOUNDED_INF_BITS ? '∞' : String(bits)
}

/**
 * The P1–P7 verdicts, computed by rules fixed WITH the predictions (SPEC-v15.md, pre-registered
 * before the run) rather than after seeing the data. Directional predictions the spec left
 * without a numeric threshold are operationalised here, once, in code that ships with the
 * artifact — and every rule is the same 2·SE discipline the adaptive suite used:
 *
 * - **P1**: every adjacent rung must satisfy `delta >= −2·(paired SE)`. Any violation refutes.
 * - **P2**: health — the ∞ cell must be integer-exact mirrored, every pair. Any deviation
 *   refutes (and independently VOIDS the run at the health gate).
 * - **P3**: confirmed iff all three tiers land at a finite bits-equivalent and the point
 *   estimates order strictly easy < medium < hard; an ordering violation (∞ counted as top)
 *   refutes; ordered-but-not-all-finite is mixed. Direction only — no SE clause, as
 *   pre-registered ("no numeric prediction").
 * - **P4**: the two full-memory policies (`reference`, `bounded-inf`) are age-flat iff
 *   `|young − old| <= 2·SE` (seed-clustered). Both flat confirms; neither refutes; one is
 *   mixed.
 * - **P5**: over every finite budget: significant decay (`young − old > 2·SE`) AND a defined
 *   half-life, non-decreasing in bits with at least one strict increase. All hold: confirmed;
 *   no budget decays: refuted; anything else: mixed.
 * - **P6**: the old easy tier: flat inside its window (`|rate(1–3) − rate(4–6)| <= 2·SE`) AND
 *   cliff-edged at it (`rate(1–6) − rate(7–12) > 2·SE`). Both: confirmed; neither: refuted;
 *   one: mixed.
 * - **P7**: every adjacent accuracy rung must satisfy `delta >= −2·(paired SE)`. Any
 *   violation refutes. The committed v1.0 baseline enters the DETAIL only, never the rule.
 */
export function computeBoundedVerdicts(
  run: BoundedRunSummary,
  baseline?: BoundedArtifactInputs['baseline'],
): BoundedVerdict[] {
  const predictions = new Map(BOUNDED_PREDICTIONS.map((p) => [p.id, p.text]))
  const verdicts: BoundedVerdict[] = []
  const curve = (policy: string): EvidenceCurve | undefined => run.evidence.find((c) => c.policy === policy)

  // --- P1 -------------------------------------------------------------------------------------
  if (run.ladderDeltas.length === 0) {
    verdicts.push({ id: 'P1', prediction: predictions.get('P1') ?? '', verdict: 'mixed', detail: 'no ladder was run.' })
  } else {
    const failing = run.ladderDeltas.filter((d) => !d.pass)
    const rungs = run.ladderDeltas
      .map((d) => `${fmtBits(d.fromBits)}→${fmtBits(d.toBits)} ${d.delta >= 0 ? '+' : ''}${fmt(d.delta)} ± ${fmt(d.se)}`)
      .join('; ')
    const worst = run.ladderDeltas.reduce((m, d) => (d.delta / Math.max(d.se, 1e-12) < m.delta / Math.max(m.se, 1e-12) ? d : m))
    verdicts.push({
      id: 'P1',
      prediction: predictions.get('P1') ?? '',
      verdict: failing.length > 0 ? 'refuted' : 'confirmed',
      detail:
        `adjacent rungs (share delta, per-seed paired SE over ${worst.seeds} seeds): ${rungs}. ` +
        `${failing.length} of ${run.ladderDeltas.length} rungs violate delta >= −2·SE` +
        (failing.length > 0
          ? ` (${failing.map((d) => `${fmtBits(d.fromBits)}→${fmtBits(d.toBits)}`).join(', ')})`
          : '') +
        `; most negative rung ${fmtBits(worst.fromBits)}→${fmtBits(worst.toBits)} at z ${worst.z.toFixed(2)}.`,
    })
  }

  // --- P2 -------------------------------------------------------------------------------------
  if (run.mirrorExact.pairs === 0) {
    verdicts.push({ id: 'P2', prediction: predictions.get('P2') ?? '', verdict: 'mixed', detail: 'no ∞ pairs were run.' })
  } else {
    verdicts.push({
      id: 'P2',
      prediction: predictions.get('P2') ?? '',
      verdict: run.mirrorExact.deviations === 0 ? 'confirmed' : 'refuted',
      detail:
        `${run.mirrorExact.pairs} ∞-budget pairs, ${run.mirrorExact.deviations} integer-exact mirror ` +
        `deviations (sets and step counts compared as integers, never floats); duplicate-mean ` +
        `set-share ${run.mirrorExact.share.toFixed(4)}.`,
    })
  }

  // --- P3 -------------------------------------------------------------------------------------
  if (run.tiers.length < BOUNDED_TIERS.length) {
    verdicts.push({ id: 'P3', prediction: predictions.get('P3') ?? '', verdict: 'mixed', detail: 'tiers were not all run.' })
  } else {
    const eq = (tier: BotDifficulty): TierCell => {
      const cell = run.tiers.find((t) => t.tier === tier)
      if (cell === undefined) throw new Error(`P3: tier ${tier} missing from the run`)
      return cell
    }
    const cells = BOUNDED_TIERS.map(eq)
    const values = cells.map((c) => (c.bitsEquivalent.finite ? (c.bitsEquivalent.bits ?? 0) : Number.POSITIVE_INFINITY))
    const allFinite = cells.every((c) => c.bitsEquivalent.finite)
    const strictly = values[0] < values[1] && values[1] < values[2]
    const detail = cells
      .map(
        (c) =>
          `${c.tier}: share ${fmt(c.share)} ± ${fmt(c.se)} → ` +
          (c.bitsEquivalent.finite
            ? `${(c.bitsEquivalent.bits ?? 0).toFixed(1)} bits` +
              (c.bitsEquivalent.lo !== null && c.bitsEquivalent.hi !== null
                ? ` [${c.bitsEquivalent.lo.toFixed(1)}, ${c.bitsEquivalent.hi.toFixed(1)}]`
                : '')
            : `no finite equivalent (${c.bitsEquivalent.note})`),
      )
      .join('; ')
    verdicts.push({
      id: 'P3',
      prediction: predictions.get('P3') ?? '',
      verdict: allFinite && strictly ? 'confirmed' : strictly ? 'mixed' : 'refuted',
      detail: `${detail}. Ordering easy < medium < hard ${strictly ? 'holds' : 'FAILS'} on point estimates` +
        `${allFinite ? '' : '; not every tier is finitely placeable'}.`,
    })
  }

  // --- P4 -------------------------------------------------------------------------------------
  {
    const fullMemory = ['reference', 'bounded-inf']
    const found = fullMemory.map((p) => curve(p)).filter((c): c is EvidenceCurve => c !== undefined)
    if (found.length < fullMemory.length) {
      verdicts.push({
        id: 'P4',
        prediction: predictions.get('P4') ?? '',
        verdict: 'mixed',
        detail: `only ${found.map((c) => c.policy).join(', ') || 'none'} of the full-memory policies have curves.`,
      })
    } else {
      const flat = found.map((c) => Math.abs(c.decay.diff) <= 2 * c.decay.se)
      const held = flat.filter(Boolean).length
      verdicts.push({
        id: 'P4',
        prediction: predictions.get('P4') ?? '',
        verdict: held === found.length ? 'confirmed' : held === 0 ? 'refuted' : 'mixed',
        detail: found
          .map(
            (c) =>
              `${c.policy}: young (1–8) ${fmt(c.young.rate)} over ${c.young.available}, old (33+) ` +
              `${fmt(c.old.rate)} over ${c.old.available}, decay ${fmt(c.decay.diff)} ± ${fmt(c.decay.se)} ` +
              `(z ${c.decay.z.toFixed(2)}, ${c.decay.seeds} seeds) — ${Math.abs(c.decay.diff) <= 2 * c.decay.se ? 'flat' : 'NOT flat'}`,
          )
          .join('; '),
      })
    }
  }

  // --- P5 -------------------------------------------------------------------------------------
  {
    const finiteCurves = run.evidence.filter((c) => /^bounded-\d+$/.test(c.policy))
    if (finiteCurves.length === 0) {
      verdicts.push({ id: 'P5', prediction: predictions.get('P5') ?? '', verdict: 'mixed', detail: 'no finite-budget curves.' })
    } else {
      const rows = finiteCurves.map((c) => ({
        bits: Number(c.policy.slice(8)),
        decays: c.decay.diff > 2 * c.decay.se,
        halfLife: c.halfLifeAge,
        c,
      }))
      rows.sort((a, b) => a.bits - b.bits)
      const allDecay = rows.every((r) => r.decays)
      const noneDecay = rows.every((r) => !r.decays)
      const allHalf = rows.every((r) => r.halfLife !== null)
      let ordered = allHalf
      let strictSomewhere = false
      for (let k = 0; k + 1 < rows.length && ordered; k++) {
        const a = rows[k].halfLife ?? 0
        const b = rows[k + 1].halfLife ?? 0
        if (b < a) ordered = false
        if (b > a) strictSomewhere = true
      }
      const confirmed = allDecay && allHalf && ordered && strictSomewhere
      verdicts.push({
        id: 'P5',
        prediction: predictions.get('P5') ?? '',
        verdict: confirmed ? 'confirmed' : noneDecay ? 'refuted' : 'mixed',
        detail:
          rows
            .map(
              (r) =>
                `${r.bits} bits: decay ${fmt(r.c.decay.diff)} ± ${fmt(r.c.decay.se)} ` +
                `(${r.decays ? 'significant' : 'NOT significant'}), half-life ` +
                `${r.halfLife === null ? 'none' : `age ${r.halfLife}`}`,
            )
            .join('; ') +
          `. Every budget decays: ${allDecay ? 'yes' : 'NO'}; half-life defined everywhere and ` +
          `non-decreasing with a strict increase: ${allHalf && ordered && strictSomewhere ? 'yes' : 'NO'}.`,
      })
    }
  }

  // --- P6 -------------------------------------------------------------------------------------
  {
    const easy = curve('tier-easy')
    if (easy === undefined) {
      verdicts.push({ id: 'P6', prediction: predictions.get('P6') ?? '', verdict: 'mixed', detail: 'no easy-tier curve.' })
    } else {
      const w = easy.window
      const flatInside = Math.abs(w.insideSplit.diff) <= 2 * w.insideSplit.se
      const cliff = w.cliff.diff > 2 * w.cliff.se
      const held = [flatInside, cliff].filter(Boolean).length
      verdicts.push({
        id: 'P6',
        prediction: predictions.get('P6') ?? '',
        verdict: held === 2 ? 'confirmed' : held === 0 ? 'refuted' : 'mixed',
        detail:
          `easy tier: inside the 6-event window ${fmt(w.inside.rate)} over ${w.inside.available} ` +
          `(ages 1–3 vs 4–6 split ${fmt(w.insideSplit.diff)} ± ${fmt(w.insideSplit.se)}, ` +
          `${flatInside ? 'flat' : 'NOT flat'}); just outside (7–12) ${fmt(w.justOutside.rate)} over ` +
          `${w.justOutside.available}; cliff (1–6 minus 7–12) ${fmt(w.cliff.diff)} ± ${fmt(w.cliff.se)} ` +
          `(z ${w.cliff.z.toFixed(2)}, ${cliff ? 'cliff-edged' : 'NOT cliff-edged'}).`,
      })
    }
  }

  // --- P7 -------------------------------------------------------------------------------------
  if (run.accuracy.cells.length === 0) {
    verdicts.push({ id: 'P7', prediction: predictions.get('P7') ?? '', verdict: 'mixed', detail: 'no accuracy grid was run.' })
  } else {
    const failing = run.accuracy.deltas.filter((d) => !d.pass)
    const cells = run.accuracy.cells
      .map((c) => `${fmtBits(c.bits)}: ${(100 * c.top1).toFixed(1)}% over ${c.seats} seats`)
      .join('; ')
    const steps = run.accuracy.deltas
      .map((d) => `${fmtBits(d.fromBits)}→${fmtBits(d.toBits)} ${d.delta >= 0 ? '+' : ''}${fmt(d.delta)} ± ${fmt(d.se)}`)
      .join('; ')
    const inf = run.accuracy.cells.find((c) => c.bits >= BOUNDED_INF_BITS)
    const anchor =
      baseline !== undefined && inf !== undefined
        ? ` The ∞ cell reads ${(100 * inf.top1).toFixed(1)}% against the committed v1.0 baseline ` +
          `${(100 * baseline.endTop1).toFixed(1)}% (${baseline.artifact}); the two are the same games by ` +
          `the anchor pin${Math.abs(inf.top1 - baseline.endTop1) < 1e-9 ? ', and they agree exactly' : ' — THEY DISAGREE, which is a harness bug'}.`
        : ''
    verdicts.push({
      id: 'P7',
      prediction: predictions.get('P7') ?? '',
      verdict: failing.length > 0 ? 'refuted' : 'confirmed',
      detail:
        `end-of-game top-1 — ${cells}. Adjacent deltas (per-seed paired): ${steps}. ` +
        `${failing.length} of ${run.accuracy.deltas.length} rungs violate delta >= −2·SE` +
        (failing.length > 0 ? ` (${failing.map((d) => `${fmtBits(d.fromBits)}→${fmtBits(d.toBits)}`).join(', ')})` : '') +
        `.${anchor}`,
    })
  }

  return verdicts
}

/**
 * Fold a run summary and its provenance into the published artifact. Nothing external enters
 * the verdict rules — the committed v1.0 accuracy baseline, when supplied, is echoed into the
 * P7 detail and the meta as context, never as a gate.
 */
export function buildBoundedResults(run: BoundedRunSummary, inputs: BoundedArtifactInputs): BoundedResults {
  return {
    meta: {
      schemaVersion: BOUNDED_SCHEMA_VERSION,
      generatedAt: inputs.generatedAt,
      engineCommit: inputs.engineCommit,
      rulesHash: inputs.rulesHash,
      rulesFile: inputs.rulesFile,
      ruleSet: 'us54',
      config: run.meta.config,
      gamesTotal: run.meta.gamesTotal,
      seedSet: { prefix: run.meta.config.ladderSeedPrefix, count: run.meta.config.ladderPairs },
      wallMs: run.meta.wallMs,
      recordsDigest: run.meta.recordsDigest,
      notes: [...run.meta.notes],
      health: run.health,
      baseline: inputs.baseline ?? null,
      predictions: BOUNDED_PREDICTIONS.map((p) => ({ ...p })),
    },
    ladder: run.ladder,
    ladderDeltas: run.ladderDeltas,
    mirrorExact: run.mirrorExact,
    tiers: run.tiers,
    evidence: run.evidence,
    accuracy: run.accuracy,
    verdicts: computeBoundedVerdicts(run, inputs.baseline),
  }
}
