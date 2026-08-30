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
 * 5. **E4b — single-seat attribution** (registered 2026-08-30, after the Phase 2 review and
 *    before any E4b run). E4's grid, seeds and pairings exactly, but ONLY the read seat is
 *    bounded — the other five seats play their bare full-strength styles — so the ecology
 *    stays at the full-strength distribution the fingerprints were calibrated on and the P8
 *    read isolates the bounded seat's own signature. The registered read-seat mapping is
 *    {@link SINGLE_READ_MAPPING}; the ∞ cell is verified in-run against an all-bare replay.
 *    The artifact is extended ADDITIVELY by `extendBoundedResults`, whose guards are scoped,
 *    not total — its docstring states exactly what is authenticated (the base's digest pin,
 *    the registered prediction texts, re-derivable stored fields, the recomputed P1–P7
 *    verdicts, and the carried sections after assembly) and what is copied through unread.
 * 6. **E4b-power — the P8 run of record** (registered 2026-08-30, after the E4b review and
 *    before any run). The 50-seed pilot put ~52% power at the P7 effect size — its 64→∞ CI
 *    contained the entire P7 effect — so its CONFIRMED was an underpowered null licensing
 *    only the within-design claim. The power run replays the SAME design at 300 seeds per
 *    pairing (reads matched to P7's 10,800 per cell) on a fresh seed prefix disjoint from the
 *    pilot's; the mapping, bits grid, estimator and P8 rule are UNCHANGED.
 *    `extendBoundedResultsPower` makes it the P8 verdict of record, retains the pilot
 *    verbatim in `accuracySinglePilot`, and adds the labelled `crossDesign` comparison —
 *    both runs reported whatever they say.
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
  BOUNDED_BASE_SCHEMA_VERSION,
  BOUNDED_INF_BITS,
  BOUNDED_P8_PREDICTION,
  BOUNDED_PILOT_SCHEMA_VERSION,
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
  BoundedAccuracySingle,
  BoundedCrossDesign,
  BoundedGameRecord,
  BoundedHealthSummary,
  BoundedLabConfig,
  BoundedResults,
  BoundedResultsBase,
  BoundedResultsPilot,
  BoundedRunOutput,
  BoundedRunSummary,
  BoundedShareCell,
  BoundedSingleRunOutput,
  BoundedSingleRunSummary,
  BoundedTaskResult,
  BoundedVerdict,
  CertainAskObservation,
  ClusteredDiff,
  EvidenceAgeRow,
  EvidenceCurve,
  EvidenceRate,
  EvidenceWindow,
  InfReproduction,
  LadderAdjacentDelta,
  LadderCell,
  MirrorExact,
  MultiplicityFamily,
  MultiplicityRung,
  SingleAccuracyCell,
  TierCell,
} from './bounded-types.ts'

/**
 * The full v1.5 experiment as pre-registered: the ten-budget ladder and the three tiers on one
 * shared 3,000-seed list, the accuracy grid on the v1.0 seed list at 50 games per pairing —
 * 85,200 games. Pair counts were sized by pilot (48 pairs, all cells): the worst adjacent-rung
 * paired SE measured ≈ 0.023 at 48 pairs (per-seed sd ≈ 0.16), so 3,000 pairs lands it near
 * 0.003 — well under the 0.01 the P1 "within 2·SE" test needs to bite — inside the ~100k-game
 * budget the spec allots.
 */
export const DEFAULT_BOUNDED_CONFIG: BoundedLabConfig = {
  ladderBits: [0, 8, 16, 24, 32, 48, 64, 96, 128, BOUNDED_INF_BITS],
  ladderPairs: 3000,
  ladderSeedPrefix: 'bounded-v1',
  tierPairs: 3000,
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

/** The E4b cell id — `baccs`, s for single-seat, so E4 and E4b records can never collide. */
export function singleCellId(bits: number, a: StyleId, b: StyleId): string {
  return `baccs-b${padBits(bits)}-${a}-vs-${b}`
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

/* -- E4b: the registered read-seat mapping ---------------------------------------------------- */

/**
 * The E4b read-seat mapping, REGISTERED BEFORE THE RUN (SPEC-v15.md E4b: "one bounded read
 * seat per game per team-0 style seat; the implementer chooses the cleanest faithful mapping
 * and documents it in meta.notes before running"). The mapping is written into the run's
 * `meta.notes` and into the artifact's `mapping` fields verbatim, and the health gate checks
 * every record against `singleReadSeatFor`. Parametric ONLY in the game count the prose
 * quotes: the pilot registered the text at 50 games; the E4b-power registration moved the
 * seed count to 300 with the mapping rule itself explicitly UNCHANGED, so the count is the
 * one substitution the template admits.
 */
export function singleReadMappingText(accGames: number): string {
  return (
    'E4b read seat: seat 2·(game mod 3) — the three team-0 seats 0, 2, 4 in rotation across the ' +
    `${accGames} games of every pairing, always playing the measured team-0 style (pairing[0]) under the ` +
    'bit budget while the other five seats play their bare full-strength styles exactly as the ' +
    'v1.0 accuracy harness seats them (team 0 pairing[0], team 1 pairing[1]). startSeat rotates ' +
    'game mod 6 as in E4, so the read seat occupies every relative table position uniformly ' +
    'with period 6. Truth for the read is therefore always pairing[0]; the pairing scheme is ' +
    'triangular, so by-style read counts fall with roster position (identically at every ' +
    'budget) and the last roster style is never the read truth.'
  )
}

/** The pilot's registered mapping text, byte-for-byte as committed with the E4b pilot. */
export const SINGLE_READ_MAPPING = singleReadMappingText(50)

/** The registered mapping, as arithmetic: game → the bounded read seat (team 0 by parity). */
export function singleReadSeatFor(game: number): Seat {
  return (2 * (game % 3)) as Seat
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
  | {
      kind: 'accuracySingle'
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

/**
 * Slice the E4b follow-up into worker tasks — the accuracy grid's shape exactly (`accBits` ×
 * 36 pairings × `accGames`, the v1.0 seed list), but with the single-seat task kind. The base
 * suite's ladder/tier fields are ignored; the grid checks are the same as the planner's.
 */
export function planBoundedSingleTasks(config: BoundedLabConfig): BoundedTask[] {
  checkLadder('accBits', config.accBits)
  const chunk = Math.max(1, Math.floor(config.chunkPairs))
  const tasks: BoundedTask[] = []
  for (let from = 0; from < config.accGames; from += chunk) {
    for (const bits of config.accBits) {
      for (const [a, b] of boundedAccuracyPairings()) {
        tasks.push({
          kind: 'accuracySingle',
          index: tasks.length,
          config,
          bits,
          a,
          b,
          gameFrom: from,
          gameTo: Math.min(config.accGames, from + chunk),
        })
      }
    }
  }
  return tasks
}

/** Total games the E4b config will record (the ∞ reproduction replays are checks, not records). */
export function boundedSingleGamesTotal(config: BoundedLabConfig): number {
  const pairings = (STYLE_IDS.length * (STYLE_IDS.length - 1)) / 2
  return config.accBits.length * pairings * config.accGames
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
  want: 'log' | 'classify' | 'both',
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
    log: want === 'log' || want === 'both' ? s.log : null,
    finalTop: want === 'classify' || want === 'both' ? classifySeats(publicView(s)).map((c) => c.top) : null,
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

/**
 * The E4b seat table: exactly ONE bounded seat — `readSeat`, which must be team 0, playing the
 * measured style `a` under the budget — and five bare full-strength seats seated exactly as
 * the v1.0 accuracy harness seats them. Exported so the tests can pin the construction.
 */
export function singleSeatPolicies(bits: number, a: StyleId, b: StyleId, readSeat: Seat): PolicySpec[] {
  if (seatTeam(readSeat) !== 0) {
    throw new Error(`singleSeatPolicies: read seat ${readSeat} is not a team-0 seat — the registered mapping reads team 0`)
  }
  const bareA = rosterStyle(a)
  const bareB = rosterStyle(b)
  return ALL_SEATS.map((seat): PolicySpec => {
    if (seat === readSeat) return { bounded: true, bits, style: a }
    return seatTeam(seat) === 0 ? bareA : bareB
  })
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

  if (task.kind === 'accuracySingle') {
    rosterStyle(task.a)
    rosterStyle(task.b)
    const isInf = task.bits >= BOUNDED_INF_BITS
    for (let game = task.gameFrom; game < task.gameTo; game++) {
      const seed = seedFor(cfg.accSeedPrefix, game)
      const startSeat = startSeatFor(game)
      const readSeat = singleReadSeatFor(game)
      const policies = singleSeatPolicies(task.bits, task.a, task.b, readSeat)
      const g = playBoundedGame(policies, seed, startSeat, cfg, isInf ? 'both' : 'classify')
      const rec: BoundedGameRecord = {
        exp: 'accuracySingle',
        cell: singleCellId(task.bits, task.a, task.b),
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
        readSeat,
      }
      if (isInf) {
        // The P8 ∞ health gate: replay the game with all six seats bare — the exact v1.0
        // accuracy harness — and require event identity (elog), an identical six-seat read,
        // and the same step count. At ∞ the bounded arm is decision-identical by the Phase 1
        // anchor pin; this VERIFIES it in this run rather than assuming it.
        const bare = ALL_SEATS.map((seat): PolicySpec =>
          seatTeam(seat) === 0 ? rosterStyle(task.a) : rosterStyle(task.b),
        )
        const ref = playBoundedGame(bare, seed, startSeat, cfg, 'both')
        rec.infExact =
          g.steps === ref.steps &&
          encodeElog(g.log ?? [], rules) === encodeElog(ref.log ?? [], rules) &&
          JSON.stringify(g.finalTop) === JSON.stringify(ref.finalTop)
      }
      records.push(rec)
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
  ['accuracySingle', 3],
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

/* -- E4b aggregation ------------------------------------------------------------------------- */

/**
 * Score the single-seat grid: exactly ONE read per game — `top[readSeat]`, truth `pairing[0]`
 * (the read seat is team 0 by the registered mapping). The other five reads in `top` are
 * retained data and enter nothing here. Deltas are per-seed paired exactly as P7's; each
 * cell also carries a seed-clustered SE (per-seed accuracies over the pairings, sd/√seeds)
 * so the P8 detail can print top-1 ± SE. `infReproduction` tallies the ∞ health gate.
 */
export function scoreBoundedSingleAccuracy(
  records: readonly BoundedGameRecord[],
  accBits: readonly number[],
): { cells: SingleAccuracyCell[]; deltas: AccuracyAdjacentDelta[]; infReproduction: InfReproduction } {
  interface LevelTally {
    games: number
    correct: number
    byStyle: Map<StyleId, { seats: number; correct: number }>
    bySeed: Map<string, [number, number]>
  }
  const levels = new Map<number, LevelTally>()
  for (const bits of accBits) {
    levels.set(bits, { games: 0, correct: 0, byStyle: new Map(), bySeed: new Map() })
  }
  let infGames = 0
  let infDeviations = 0
  for (const r of records) {
    if (r.exp !== 'accuracySingle' || r.bits === undefined || r.pairing === undefined) continue
    if (r.top === undefined || r.readSeat === undefined) continue
    if (r.bits >= BOUNDED_INF_BITS) {
      infGames++
      if (r.infExact !== true) infDeviations++
    }
    const t = levels.get(r.bits)
    if (t === undefined) continue
    t.games++
    const truth = r.pairing[0]
    const correct = r.top[r.readSeat] === truth
    if (correct) t.correct++
    let seedSlot = t.bySeed.get(r.seed)
    if (seedSlot === undefined) {
      seedSlot = [0, 0]
      t.bySeed.set(r.seed, seedSlot)
    }
    seedSlot[0]++
    if (correct) seedSlot[1]++
    let by = t.byStyle.get(truth)
    if (by === undefined) {
      by = { seats: 0, correct: 0 }
      t.byStyle.set(truth, by)
    }
    by.seats++
    if (correct) by.correct++
  }

  const cells: SingleAccuracyCell[] = []
  for (const bits of accBits) {
    const t = levels.get(bits)
    if (t === undefined) continue
    const byStyle = {} as Record<StyleId, AccuracyByStyle>
    for (const style of STYLE_IDS) {
      const by = t.byStyle.get(style)
      byStyle[style] =
        by === undefined ? { seats: 0, top1: 0 } : { seats: by.seats, top1: by.seats === 0 ? 0 : by.correct / by.seats }
    }
    const perSeed = [...t.bySeed.values()].filter(([n]) => n > 0).map(([n, c]) => c / n)
    cells.push({
      bits,
      games: t.games,
      reads: t.games,
      top1: t.games === 0 ? 0 : t.correct / t.games,
      se: perSeed.length > 0 ? sd(perSeed) / Math.sqrt(perSeed.length) : 0,
      seeds: perSeed.length,
      byStyle,
    })
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
  return { cells, deltas, infReproduction: { games: infGames, deviations: infDeviations } }
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
      schemaVersion: BOUNDED_BASE_SCHEMA_VERSION,
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

/**
 * Fold the E4b task results into the single-seat run output: canonical order, the P8
 * aggregates, the health gate (the suite's standard clauses plus two of its own — the
 * registered read-seat mapping checked per record, and the ∞ reproduction), the digest.
 * Pure, like `assembleBoundedRun`: same results in any order, same output.
 */
export function assembleBoundedSingleRun(
  config: BoundedLabConfig,
  results: readonly BoundedTaskResult[],
  opts: { wallMs: number; workers: number; generatedAt: string },
): BoundedSingleRunOutput {
  const all: BoundedGameRecord[] = []
  for (const r of results) for (const rec of r.records) all.push(rec)
  all.sort(canonical)

  const violations: string[] = []

  // --- cell shape: every budget × pairing cell holds accGames games over distinct seeds ------
  const groups = new Map<string, BoundedGameRecord[]>()
  for (const r of all) {
    const slot = groups.get(r.cell)
    if (slot === undefined) groups.set(r.cell, [r])
    else slot.push(r)
  }
  for (const bits of config.accBits) {
    for (const [a, b] of boundedAccuracyPairings()) {
      const recs = groups.get(singleCellId(bits, a, b)) ?? []
      const seeds = new Set(recs.map((r) => r.seed))
      if (recs.length !== config.accGames || seeds.size !== config.accGames) {
        violations.push(
          `cell ${singleCellId(bits, a, b)}: ${recs.length} games over ${seeds.size} distinct seeds, ` +
            `expected ${config.accGames}`,
        )
      }
    }
  }

  // --- the registered read-seat mapping, checked per record ----------------------------------
  let mappingViolations = 0
  let firstMapping = ''
  for (const r of all) {
    if (r.exp !== 'accuracySingle') continue
    if (r.readSeat !== singleReadSeatFor(r.pair) || r.seed !== seedFor(config.accSeedPrefix, r.pair)) {
      mappingViolations++
      if (firstMapping === '') firstMapping = `${r.cell} game ${r.pair}`
    }
  }
  if (mappingViolations > 0) {
    violations.push(
      `readSeat mapping: ${mappingViolations} record(s) stray from the registered mapping ` +
        `(seat 2·(game mod 3) on the v1.0 seed list) — first at ${firstMapping}`,
    )
  }

  // --- the P8 aggregates, and the ∞ reproduction gate they carry -----------------------------
  const { cells, deltas, infReproduction } = scoreBoundedSingleAccuracy(all, config.accBits)
  if (infReproduction.deviations > 0) {
    violations.push(
      `P8 ∞ health: ${infReproduction.deviations} of ${infReproduction.games} ∞-budget games did not ` +
        'reproduce the all-bare full-strength game exactly (elog, six-seat read and step count ' +
        'compared) — the bounded arm at ∞ is decision-identical by the Phase 1 anchor pin, so a ' +
        'deviation is a harness bug, full stop',
    )
  }

  // --- the standard gates --------------------------------------------------------------------
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
      schemaVersion: BOUNDED_BASE_SCHEMA_VERSION,
      generatedAt: opts.generatedAt,
      config,
      gamesTotal: all.length,
      movesTotal,
      workers: opts.workers,
      wallMs: opts.wallMs,
      gamesPerSecond: seconds === 0 ? 0 : all.length / seconds,
      recordsDigest: digest(boundedToJsonl(all)),
      notes: [
        singleReadMappingText(config.accGames),
        'P8 scores top[readSeat] only. The six-seat end-of-game read is retained per record ' +
          'for context, clearly separated by readSeat, and enters no verdict. Cell SEs are ' +
          'seed-clustered (per-seed accuracy over the pairings, sd/√seeds); adjacent deltas ' +
          "are per-seed paired exactly as P7's.",
        '∞ health gate: every ∞-budget game is replayed with all six seats bare (the exact ' +
          'v1.0 accuracy harness table) and required to match event-for-event (elog), ' +
          'read-for-read and step-for-step. Reproduction replays are checks, not records — ' +
          'excluded from gamesTotal, movesTotal and the digest.',
      ],
    },
    health,
    cells,
    deltas,
    infReproduction,
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
 * Fold a run summary and its provenance into the BASE artifact (the pre-E4b shape, schema
 * {@link BOUNDED_BASE_SCHEMA_VERSION}) — `extendBoundedResults` upgrades it to the published
 * schema. Nothing external enters the verdict rules — the committed v1.0 accuracy baseline,
 * when supplied, is echoed into the P7 detail and the meta as context, never as a gate.
 */
export function buildBoundedResults(run: BoundedRunSummary, inputs: BoundedArtifactInputs): BoundedResultsBase {
  return {
    meta: {
      schemaVersion: BOUNDED_BASE_SCHEMA_VERSION,
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

/* -- E4b: the P8 verdict, the multiplicity annotation, and the artifact extension ------------- */

/**
 * Φ(z), the standard normal CDF, via the Numerical Recipes erfc approximation (§6.2) — ~1e-7
 * relative accuracy over the whole line, deterministic, dependency-free. Used ONLY by the
 * multiplicity annotation; no registered verdict rule reads a p-value.
 */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.5 * x)
  const erfc =
    t *
    Math.exp(
      -x * x -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    )
  const tail = erfc / 2
  return z < 0 ? tail : 1 - tail
}

/** The corrected level the multiplicity annotation reads violations at. */
export const MULTIPLICITY_ALPHA = 0.05

/**
 * The Bonferroni ×m annotation over one adjacent-rung family (registered with E4b, SPEC-v15.md:
 * "the artifact ALSO reports Bonferroni-corrected outcomes for their rung families (×3 each)
 * as an annotation"). Annotation ONLY: the registered per-rung rule (`delta >= −2·SE`, any
 * violating rung refutes) and the committed verdicts are not altered by anything here.
 */
export function multiplicityFamilyOf(id: 'P7' | 'P8', deltas: readonly AccuracyAdjacentDelta[]): MultiplicityFamily {
  const m = deltas.length
  const rungs: MultiplicityRung[] = deltas.map((d) => {
    const pOneSided = normalCdf(d.z)
    const pBonferroni = Math.min(1, m * pOneSided)
    return {
      fromBits: d.fromBits,
      toBits: d.toBits,
      delta: d.delta,
      se: d.se,
      z: d.z,
      pOneSided,
      pBonferroni,
      violatesRaw: !d.pass,
      violatesBonferroni: d.delta < 0 && pBonferroni < MULTIPLICITY_ALPHA,
    }
  })
  return {
    id,
    comparisons: m,
    alpha: MULTIPLICITY_ALPHA,
    rungs,
    note:
      `Bonferroni ×${m} over the ${id} adjacent-rung family, as an annotation only — the ` +
      `registered ${id} rule (delta >= −2·SE per rung, any violating rung refutes) and its ` +
      `verdict are unchanged. pOneSided is Φ(z) per rung; pBonferroni = min(1, ` +
      `${m}·pOneSided); a rung violates at the corrected level iff its delta is negative and ` +
      `pBonferroni < ${MULTIPLICITY_ALPHA}.`,
  }
}

/**
 * The P8 verdict, by the rule registered with the prediction (SPEC-v15.md E4b): every adjacent
 * rung of the single-seat grid must satisfy `delta >= −2·(per-seed paired SE)`; any violating
 * rung refutes — exactly P7's rule on the bounded-seat reads. The ∞ reproduction is HEALTH,
 * not prediction, and is stated in the detail as measured.
 */
export function computeBoundedSingleVerdict(
  single: Pick<BoundedAccuracySingle, 'cells' | 'deltas' | 'infReproduction'>,
): BoundedVerdict {
  if (single.cells.length === 0) {
    return { id: 'P8', prediction: BOUNDED_P8_PREDICTION.text, verdict: 'mixed', detail: 'no single-seat grid was run.' }
  }
  const failing = single.deltas.filter((d) => !d.pass)
  const cells = single.cells
    .map(
      (c) =>
        `${fmtBits(c.bits)}: ${(100 * c.top1).toFixed(2)}% ± ${(100 * c.se).toFixed(2)}% over ${c.reads} reads`,
    )
    .join('; ')
  const steps = single.deltas
    .map((d) => `${fmtBits(d.fromBits)}→${fmtBits(d.toBits)} ${d.delta >= 0 ? '+' : ''}${fmt(d.delta)} ± ${fmt(d.se)}`)
    .join('; ')
  const inf = single.infReproduction
  const anchor =
    inf.deviations === 0
      ? ` The ∞ cell reproduced the corresponding full-strength read exactly in all ${inf.games} games.`
      : ` THE ∞ CELL FAILED ITS HEALTH GATE: ${inf.deviations} of ${inf.games} games did not reproduce ` +
        'the full-strength game — a harness bug, and the run is VOID.'
  return {
    id: 'P8',
    prediction: BOUNDED_P8_PREDICTION.text,
    verdict: failing.length > 0 ? 'refuted' : 'confirmed',
    detail:
      `bounded-seat end-of-game top-1 (seed-clustered SE) — ${cells}. ` +
      `Adjacent deltas (per-seed paired): ${steps}. ` +
      `${failing.length} of ${single.deltas.length} rungs violate delta >= −2·SE` +
      (failing.length > 0 ? ` (${failing.map((d) => `${fmtBits(d.fromBits)}→${fmtBits(d.toBits)}`).join(', ')})` : '') +
      `.${anchor}`,
  }
}

/**
 * What `extendBoundedResults` needs beyond the run: the commit whose engine PLAYED the games,
 * and the caller's pin on the base being extended.
 */
export interface BoundedExtendInputs {
  engineCommit: string
  /**
   * The committed base artifact's `meta.recordsDigest`, supplied by the caller from the
   * repository record. Extension refuses when the base in hand does not carry this digest —
   * the guard that the artifact being extended IS the committed one, not a substitute.
   */
  expectedBaseDigest: string
}

function refuse(why: string): never {
  throw new Error(`extendBoundedResults: ${why}`)
}

const BASE_VERDICT_IDS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'] as const

/** Structural admission of the base artifact — targeted guards on everything relied upon. */
function admitBase(baseText: string): BoundedResultsBase {
  let parsed: unknown
  try {
    parsed = JSON.parse(baseText)
  } catch (error) {
    refuse(`the base artifact is not valid JSON — ${(error as Error).message}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    refuse('the base artifact is not an object')
  }
  const root = parsed as Record<string, unknown>
  const meta = root.meta
  if (typeof meta !== 'object' || meta === null) refuse('the base artifact has no meta')
  const schema = (meta as Record<string, unknown>).schemaVersion
  if (schema !== BOUNDED_BASE_SCHEMA_VERSION) {
    refuse(
      `base meta.schemaVersion is ${String(schema)}; the extension consumes the base suite's ` +
        `schema ${BOUNDED_BASE_SCHEMA_VERSION} only (an already-extended artifact must not be re-extended)`,
    )
  }
  for (const key of ['ladder', 'ladderDeltas', 'tiers', 'evidence', 'verdicts'] as const) {
    if (!Array.isArray(root[key])) refuse(`base ${key} is missing or not an array`)
  }
  for (const key of ['mirrorExact', 'accuracy'] as const) {
    if (typeof root[key] !== 'object' || root[key] === null) refuse(`base ${key} is missing`)
  }
  const verdicts = root.verdicts as { id?: unknown }[]
  if (
    verdicts.length !== BASE_VERDICT_IDS.length ||
    verdicts.some((v, i) => v === null || typeof v !== 'object' || v.id !== BASE_VERDICT_IDS[i])
  ) {
    refuse('base verdicts are not exactly P1–P7 in order')
  }
  return parsed as BoundedResultsBase
}

/**
 * Extend the committed base artifact with the E4b block — ADDITIVELY. The guards are scoped,
 * and their coverage is stated exactly (an earlier draft of this comment claimed "refuses if
 * anything pre-existing moved", which was broader than what is checked):
 *
 * 1. **Identity of the base.** `meta.recordsDigest` must equal the caller-supplied committed
 *    value, and `meta.predictions` must serialise byte-identically to the code's own
 *    {@link BOUNDED_PREDICTIONS} — the base in hand is the committed artifact of record
 *    carrying the registered prediction texts, not a substitute or a paraphrase.
 * 2. **Derived fields re-derive.** Stored fields computed from other stored fields — a cell's
 *    ci95, a tier's bits-equivalent, every delta's z and pass — are recomputed from their
 *    inputs and must match byte-for-byte.
 * 3. **The verdicts are recomputed.** P1–P7 are re-derived from the base artifact's own
 *    aggregates through `computeBoundedVerdicts` — the same code, the same rules — and must
 *    reproduce the committed verdict objects byte-for-byte. A doctored aggregate that any
 *    verdict detail quotes (a share, a delta, an evidence rate) is refused here.
 * 4. **The carried sections are compared after assembly.** Every pre-existing section of the
 *    output must serialise byte-identically to the base's — a guard on this function's own
 *    future edits, not on the inputs.
 *
 * What these do NOT cover, stated plainly: a primary aggregate that no verdict detail quotes
 * and no stored field re-derives from (a cell's game and move counts, its health tallies, an
 * evidence band no rule reads) is copied through unauthenticated. The digest pin is the guard
 * that the whole base is the committed one; the per-game records behind that digest are not
 * re-read here.
 *
 * The additions: `accuracySingle` (the E4b run with its own provenance and health),
 * `multiplicity` (the ×3 Bonferroni annotation over BOTH rung families), the P8 verdict
 * appended, the P8 prediction and the E4b notes appended to meta. `meta.schemaVersion` moves
 * to {@link BOUNDED_PILOT_SCHEMA_VERSION}; nothing else in meta changes. Since E4b-power the
 * published artifact is schema {@link BOUNDED_SCHEMA_VERSION} — `extendBoundedResultsPower`
 * consumes this function's output shape and upgrades it.
 */
export function extendBoundedResults(
  baseText: string,
  run: BoundedSingleRunSummary,
  inputs: BoundedExtendInputs,
): BoundedResultsPilot {
  const base = admitBase(baseText)

  // --- identity of the base: the caller's digest pin and the registered predictions ----------
  if (base.meta.recordsDigest !== inputs.expectedBaseDigest) {
    refuse(
      `the base artifact's meta.recordsDigest ${base.meta.recordsDigest} does not match the ` +
        `committed value ${inputs.expectedBaseDigest} the caller pinned — this is not the ` +
        'committed base artifact',
    )
  }
  if (JSON.stringify(base.meta.predictions) !== JSON.stringify(BOUNDED_PREDICTIONS)) {
    refuse(
      "the base artifact's meta.predictions do not reproduce the code's BOUNDED_PREDICTIONS " +
        'byte-for-byte — the registered prediction texts are fixed in bounded-types.ts, and a ' +
        'base that disagrees with them is not the committed artifact',
    )
  }

  // --- the run must be healthy and must be E4's grid on E4's seeds --------------------------
  if (!run.health.ok) {
    refuse(`the E4b run failed its health gate — ${run.health.violations.length} violation(s): ${run.health.violations.join('; ')}`)
  }
  const bc = base.meta.config
  const rc = run.meta.config
  if (
    JSON.stringify(rc.accBits) !== JSON.stringify(bc.accBits) ||
    rc.accGames !== bc.accGames ||
    rc.accSeedPrefix !== bc.accSeedPrefix ||
    rc.variant !== bc.variant ||
    rc.stepCap !== bc.stepCap
  ) {
    refuse(
      'the E4b run does not replay the committed E4 grid — accBits, accGames, accSeedPrefix, ' +
        'variant and stepCap must all match the base config (identical pairings/seeds is the ' +
        'registered design)',
    )
  }
  const pairings = (STYLE_IDS.length * (STYLE_IDS.length - 1)) / 2
  if (run.infReproduction.games !== pairings * rc.accGames || run.infReproduction.deviations !== 0) {
    refuse(
      `the ∞ reproduction gate did not hold: ${run.infReproduction.deviations} deviation(s) over ` +
        `${run.infReproduction.games} ∞ games (expected 0 over ${pairings * rc.accGames})`,
    )
  }

  // --- byte-identity check 1a: stored derived fields re-derived from their own inputs --------
  // The verdict recompute below covers every aggregate a verdict reads; these recomputes cover
  // stored fields verdicts do NOT read (a ladder cell's interval, a delta's z), so a doctored
  // number cannot hide in a field no rule consults. All three re-run the exact expressions the
  // assembler ran, on the parsed doubles — bit-identical or refused.
  for (const cell of [...base.ladder, ...base.tiers]) {
    const ci: [number, number] = [cell.share - 1.96 * cell.se, cell.share + 1.96 * cell.se]
    if (JSON.stringify(ci) !== JSON.stringify(cell.ci95)) {
      refuse(`a pre-existing aggregate moved — ${cell.id}'s ci95 does not re-derive from its share and se`)
    }
  }
  for (const tier of base.tiers) {
    const beq = bitsEquivalentOf(tier.share, tier.se, base.ladder)
    if (JSON.stringify(beq) !== JSON.stringify(tier.bitsEquivalent)) {
      refuse(
        `a pre-existing aggregate moved — tier ${tier.tier}'s bits-equivalent does not re-derive ` +
          'from its share, its se and the ladder cells',
      )
    }
  }
  for (const d of [...base.ladderDeltas, ...base.accuracy.deltas]) {
    if (JSON.stringify(finiteZ(d.delta, d.se)) !== JSON.stringify(d.z) || d.pass !== (d.delta >= -2 * d.se)) {
      refuse(
        `a pre-existing aggregate moved — the ${d.fromBits}→${d.toBits} delta's z or pass does not ` +
          're-derive from its delta and se',
      )
    }
  }

  // --- byte-identity check 1b: recompute the committed verdicts from the committed aggregates -
  const summary: BoundedRunSummary = {
    meta: {
      schemaVersion: base.meta.schemaVersion,
      generatedAt: base.meta.generatedAt,
      config: base.meta.config,
      gamesTotal: base.meta.gamesTotal,
      movesTotal: 0,
      workers: 0,
      wallMs: base.meta.wallMs,
      gamesPerSecond: 0,
      recordsDigest: base.meta.recordsDigest,
      notes: [...base.meta.notes],
    },
    health: base.meta.health,
    ladder: base.ladder,
    ladderDeltas: base.ladderDeltas,
    mirrorExact: base.mirrorExact,
    tiers: base.tiers,
    evidence: base.evidence,
    accuracy: base.accuracy,
  }
  const recomputed = computeBoundedVerdicts(summary, base.meta.baseline ?? undefined)
  if (JSON.stringify(recomputed) !== JSON.stringify(base.verdicts)) {
    const first =
      recomputed.find((v, i) => JSON.stringify(v) !== JSON.stringify(base.verdicts[i]))?.id ?? '(count differs)'
    refuse(
      `a pre-existing aggregate or verdict moved — P1–P7 recomputed from the base artifact's own ` +
        `aggregates do not reproduce its committed verdicts byte-for-byte (first difference at ${first}). ` +
        'Refusing to write the artifact.',
    )
  }

  // --- assemble, additively ------------------------------------------------------------------
  const out: BoundedResultsPilot = {
    meta: {
      ...base.meta,
      schemaVersion: BOUNDED_PILOT_SCHEMA_VERSION,
      notes: [...base.meta.notes, ...run.meta.notes.map((n) => `E4b: ${n}`)],
      predictions: [...base.meta.predictions, { ...BOUNDED_P8_PREDICTION }],
    },
    ladder: base.ladder,
    ladderDeltas: base.ladderDeltas,
    mirrorExact: base.mirrorExact,
    tiers: base.tiers,
    evidence: base.evidence,
    accuracy: base.accuracy,
    accuracySingle: {
      meta: {
        generatedAt: run.meta.generatedAt,
        engineCommit: inputs.engineCommit,
        gamesTotal: run.meta.gamesTotal,
        movesTotal: run.meta.movesTotal,
        workers: run.meta.workers,
        wallMs: run.meta.wallMs,
        gamesPerSecond: run.meta.gamesPerSecond,
        recordsDigest: run.meta.recordsDigest,
        notes: [...run.meta.notes],
      },
      mapping: SINGLE_READ_MAPPING,
      health: run.health,
      cells: run.cells,
      deltas: run.deltas,
      infReproduction: run.infReproduction,
    },
    multiplicity: [multiplicityFamilyOf('P7', base.accuracy.deltas), multiplicityFamilyOf('P8', run.deltas)],
    verdicts: [
      ...base.verdicts,
      computeBoundedSingleVerdict({ cells: run.cells, deltas: run.deltas, infReproduction: run.infReproduction }),
    ],
  }

  // --- byte-identity check 2: the carried sections, compared after assembly ------------------
  const carried: readonly (keyof BoundedResultsBase)[] = [
    'ladder',
    'ladderDeltas',
    'mirrorExact',
    'tiers',
    'evidence',
    'accuracy',
  ]
  for (const key of carried) {
    if (JSON.stringify(out[key]) !== JSON.stringify(base[key])) {
      refuse(`the carried section "${key}" does not serialise byte-identically to the base artifact's`)
    }
  }
  if (JSON.stringify(out.verdicts.slice(0, BASE_VERDICT_IDS.length)) !== JSON.stringify(base.verdicts)) {
    refuse('the carried P1–P7 verdicts do not serialise byte-identically to the base artifact’s')
  }
  return out
}

/* -- E4b-power: the P8 run of record, the retained pilot, and the cross-design block ---------- */

/**
 * Post-hoc power of the registered refutation rule (`delta < −2·SE` refutes) against a true
 * single-seat delta of `−effect`, at a rung's measured SE: with delta ~ Normal(−effect, se),
 * P(delta < −2·se) = Φ(effect/se − 2). The degenerate se = 0 resolves by the sign of the
 * effect — an exact estimator detects any nonzero effect and no null one.
 */
function powerAt(effect: number, se: number): number {
  if (se > 0) return normalCdf(effect / se - 2)
  return effect > 0 ? 1 : 0
}

/**
 * The cross-design comparison the E4b-power registration names — the difference-of-deltas
 * test between P7's violated rung (the top rung, 64→∞ on the registered grid) and P8's same
 * rung, plus P8's post-hoc power at the P7 effect size. Labelled cross-design throughout: P7
 * measures a rung of E4 (BOTH teams bounded — ecology and signature move together), P8 a rung
 * of the single-seat design (one bounded read seat in a full-strength ecology), so this
 * compares ACROSS designs and enters no registered verdict rule. The SE adds the two rung
 * variances — the power run's seed list is disjoint from E4's, so the rungs are independent
 * by construction (the pilot, which REPLAYED E4's seeds, would not have licensed that).
 */
export function crossDesignOf(
  p7Deltas: readonly AccuracyAdjacentDelta[],
  pilotDeltas: readonly AccuracyAdjacentDelta[],
  powerDeltas: readonly AccuracyAdjacentDelta[],
): BoundedCrossDesign {
  const top = (deltas: readonly AccuracyAdjacentDelta[], name: string): AccuracyAdjacentDelta => {
    const rung = deltas.find((d) => d.toBits >= BOUNDED_INF_BITS)
    if (rung === undefined) throw new Error(`crossDesignOf: ${name} carries no top (→∞) rung`)
    return rung
  }
  const p7 = top(p7Deltas, 'P7')
  const pilot = top(pilotDeltas, 'the pilot P8')
  const p8 = top(powerDeltas, 'the power P8')
  if (p7.fromBits !== p8.fromBits || p7.fromBits !== pilot.fromBits) {
    throw new Error(
      `crossDesignOf: the top rungs disagree — P7 ${p7.fromBits}→∞, pilot ${pilot.fromBits}→∞, ` +
        `power ${p8.fromBits}→∞ must all read the same rung`,
    )
  }
  const diffOfDeltas = p8.delta - p7.delta
  const se = Math.sqrt(p7.se * p7.se + p8.se * p8.se)
  const z = se > 0 ? diffOfDeltas / se : diffOfDeltas === 0 ? 0 : Math.sign(diffOfDeltas) * 1e9
  const effect = Math.abs(p7.delta)
  return {
    fromBits: p7.fromBits,
    toBits: p7.toBits,
    p7: { delta: p7.delta, se: p7.se, seeds: p7.seeds },
    p8: { delta: p8.delta, se: p8.se, seeds: p8.seeds },
    diffOfDeltas,
    se,
    z,
    pTwoSided: 2 * (1 - normalCdf(Math.abs(z))),
    effect,
    mde: 2 * p8.se,
    postHocPower: powerAt(effect, p8.se),
    pilot: { se: pilot.se, mde: 2 * pilot.se, postHocPower: powerAt(effect, pilot.se) },
    note:
      'Cross-design comparison, labelled as exactly that (E4b-power registration): P7’s rung is ' +
      'measured in E4, where BOTH teams are bounded — ecology and signature move together — and ' +
      'P8’s in the single-seat design, where only the read seat is. The difference-of-deltas is ' +
      'therefore a comparison ACROSS designs, never a within-design test, and it enters no ' +
      'registered verdict rule. Its SE is √(se₇² + se₈²): the power run’s seed list is disjoint ' +
      'from E4’s, so the two rungs are independent by construction. Post-hoc power is ' +
      'P(delta < −2·SE | true delta = −effect) = Φ(effect/SE − 2) at each run’s measured top-rung ' +
      'SE; mde = 2·SE is the effect the registered rule detects with 50% probability. The ' +
      'pilot’s numbers are retained beside the record run’s — the correction the E4b-power ' +
      'registration exists to make.',
  }
}

/** What `extendBoundedResultsPower` needs beyond the run. Every pin is the caller's, stated. */
export interface BoundedPowerExtendInputs {
  /** The commit whose engine PLAYED the power run's games. */
  engineCommit: string
  /** The committed schema-2 artifact's base-suite `meta.recordsDigest` — the base pin. */
  expectedBaseDigest: string
  /** The committed pilot run's `accuracySingle.meta.recordsDigest` — the retained-pilot pin. */
  expectedPilotDigest: string
  /**
   * The registered power grid the run must carry — {@link BOUNDED_POWER_ACC_GAMES} and
   * {@link BOUNDED_POWER_SEED_PREFIX} from the caller of record. Parameters rather than
   * constants so the machinery is testable at tiny N; the analyze script passes the
   * registered values.
   */
  expectedAccGames: number
  expectedSeedPrefix: string
}

function refusePower(why: string): never {
  throw new Error(`extendBoundedResultsPower: ${why}`)
}

const PILOT_VERDICT_IDS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'] as const

/** Structural admission of the pilot-extended (schema-2) artifact — everything relied upon. */
function admitPilot(pilotText: string): BoundedResultsPilot {
  let parsed: unknown
  try {
    parsed = JSON.parse(pilotText)
  } catch (error) {
    refusePower(`the pilot-extended artifact is not valid JSON — ${(error as Error).message}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    refusePower('the pilot-extended artifact is not an object')
  }
  const root = parsed as Record<string, unknown>
  const meta = root.meta
  if (typeof meta !== 'object' || meta === null) refusePower('the pilot-extended artifact has no meta')
  const schema = (meta as Record<string, unknown>).schemaVersion
  if (schema !== BOUNDED_PILOT_SCHEMA_VERSION) {
    refusePower(
      `meta.schemaVersion is ${String(schema)}; the power extension consumes the pilot-extended ` +
        `schema ${BOUNDED_PILOT_SCHEMA_VERSION} only (a base artifact must first pass through ` +
        'extendBoundedResults; an already-power-extended artifact must not be re-extended)',
    )
  }
  for (const key of ['ladder', 'ladderDeltas', 'tiers', 'evidence', 'verdicts', 'multiplicity'] as const) {
    if (!Array.isArray(root[key])) refusePower(`pilot-extended ${key} is missing or not an array`)
  }
  for (const key of ['mirrorExact', 'accuracy', 'accuracySingle'] as const) {
    if (typeof root[key] !== 'object' || root[key] === null) refusePower(`pilot-extended ${key} is missing`)
  }
  const verdicts = root.verdicts as { id?: unknown }[]
  if (
    verdicts.length !== PILOT_VERDICT_IDS.length ||
    verdicts.some((v, i) => v === null || typeof v !== 'object' || v.id !== PILOT_VERDICT_IDS[i])
  ) {
    refusePower('pilot-extended verdicts are not exactly P1–P8 in order')
  }
  const families = root.multiplicity as { id?: unknown }[]
  if (
    families.length !== 2 ||
    families.some((f, i) => f === null || typeof f !== 'object' || f.id !== (['P7', 'P8'] as const)[i])
  ) {
    refusePower('pilot-extended multiplicity is not exactly the P7 and P8 families in order')
  }
  return parsed as BoundedResultsPilot
}

/**
 * Extend the committed pilot artifact with the E4b-power run — the registered correction of
 * record (SPEC-v15.md E4b-power). The 300-seed run becomes the P8 verdict of record in
 * `accuracySingle`, recomputed by the UNCHANGED rule; the 50-seed pilot moves — verbatim,
 * byte-identical — to `accuracySinglePilot`, keeping its committed verdict and Bonferroni
 * family beside a note stating what it licensed; `crossDesign` carries the registered
 * difference-of-deltas test and post-hoc power, labelled cross-design. Both runs are reported
 * whatever they say.
 *
 * The guards extend `extendBoundedResults`'s discipline to this migration, with the same
 * stated coverage: the base and pilot digests are pinned to caller-supplied committed values;
 * `meta.predictions` must reproduce the registered texts; stored derived fields (ci95,
 * bits-equivalents, every delta family's z and pass) re-derive; P1–P7 AND the pilot's P8 are
 * recomputed from the artifact's own aggregates and must reproduce byte-for-byte, as must
 * both committed multiplicity families; and every carried section — the six base sections,
 * the P1–P7 verdicts, the P7 family, and the pilot block field-for-field — is compared after
 * assembly. Aggregates no rule reads still ride on the digest pins alone, exactly as before.
 *
 * The run itself must be healthy, must carry the registered power grid (the caller states the
 * expected seed count and fresh prefix; the bits grid, variant and step cap must equal the
 * base's; the prefix must DIFFER from the base's — the registered disjointness), and must
 * have passed the ∞ reproduction gate on every ∞ game.
 */
export function extendBoundedResultsPower(
  pilotText: string,
  run: BoundedSingleRunSummary,
  inputs: BoundedPowerExtendInputs,
): BoundedResults {
  const base = admitPilot(pilotText)

  // --- identity of the base: the caller's digest pins and the registered predictions ---------
  if (base.meta.recordsDigest !== inputs.expectedBaseDigest) {
    refusePower(
      `the artifact's meta.recordsDigest ${base.meta.recordsDigest} does not match the ` +
        `committed value ${inputs.expectedBaseDigest} the caller pinned — this is not the ` +
        'committed artifact',
    )
  }
  if (base.accuracySingle.meta.recordsDigest !== inputs.expectedPilotDigest) {
    refusePower(
      `the pilot block's recordsDigest ${base.accuracySingle.meta.recordsDigest} does not match ` +
        `the committed value ${inputs.expectedPilotDigest} the caller pinned — this is not the ` +
        'committed pilot run',
    )
  }
  if (
    JSON.stringify(base.meta.predictions) !==
    JSON.stringify([...BOUNDED_PREDICTIONS, BOUNDED_P8_PREDICTION])
  ) {
    refusePower(
      "the artifact's meta.predictions do not reproduce the code's registered texts " +
        '(BOUNDED_PREDICTIONS plus BOUNDED_P8_PREDICTION) byte-for-byte',
    )
  }

  // --- the run must be healthy and must be the REGISTERED power grid -------------------------
  if (!run.health.ok) {
    refusePower(
      `the power run failed its health gate — ${run.health.violations.length} violation(s): ${run.health.violations.join('; ')}`,
    )
  }
  const bc = base.meta.config
  const rc = run.meta.config
  if (
    JSON.stringify(rc.accBits) !== JSON.stringify(bc.accBits) ||
    rc.variant !== bc.variant ||
    rc.stepCap !== bc.stepCap
  ) {
    refusePower(
      'the power run does not hold the pilot design fixed — accBits, variant and stepCap must ' +
        'all match the committed config (the registration changes the seed count and prefix ' +
        'ALONE)',
    )
  }
  if (rc.accGames !== inputs.expectedAccGames || rc.accSeedPrefix !== inputs.expectedSeedPrefix) {
    refusePower(
      `the power run plays ${rc.accGames} games per pairing on "${rc.accSeedPrefix}"; the ` +
        `registered power grid the caller stated is ${inputs.expectedAccGames} on ` +
        `"${inputs.expectedSeedPrefix}"`,
    )
  }
  if (rc.accSeedPrefix === bc.accSeedPrefix) {
    refusePower(
      `the power run's seed prefix "${rc.accSeedPrefix}" equals the pilot's — the registration ` +
        'requires a fresh prefix DISJOINT from the pilot seed list',
    )
  }
  const pairings = (STYLE_IDS.length * (STYLE_IDS.length - 1)) / 2
  if (run.infReproduction.games !== pairings * rc.accGames || run.infReproduction.deviations !== 0) {
    refusePower(
      `the ∞ reproduction gate did not hold: ${run.infReproduction.deviations} deviation(s) over ` +
        `${run.infReproduction.games} ∞ games (expected 0 over ${pairings * rc.accGames})`,
    )
  }

  // --- stored derived fields re-derived, the pilot's delta family included -------------------
  for (const cell of [...base.ladder, ...base.tiers]) {
    const ci: [number, number] = [cell.share - 1.96 * cell.se, cell.share + 1.96 * cell.se]
    if (JSON.stringify(ci) !== JSON.stringify(cell.ci95)) {
      refusePower(`a carried aggregate moved — ${cell.id}'s ci95 does not re-derive from its share and se`)
    }
  }
  for (const tier of base.tiers) {
    const beq = bitsEquivalentOf(tier.share, tier.se, base.ladder)
    if (JSON.stringify(beq) !== JSON.stringify(tier.bitsEquivalent)) {
      refusePower(
        `a carried aggregate moved — tier ${tier.tier}'s bits-equivalent does not re-derive ` +
          'from its share, its se and the ladder cells',
      )
    }
  }
  for (const d of [...base.ladderDeltas, ...base.accuracy.deltas, ...base.accuracySingle.deltas]) {
    if (JSON.stringify(finiteZ(d.delta, d.se)) !== JSON.stringify(d.z) || d.pass !== (d.delta >= -2 * d.se)) {
      refusePower(
        `a carried aggregate moved — the ${d.fromBits}→${d.toBits} delta's z or pass does not ` +
          're-derive from its delta and se',
      )
    }
  }

  // --- the committed verdicts and annotation families, recomputed ----------------------------
  const summary: BoundedRunSummary = {
    meta: {
      schemaVersion: base.meta.schemaVersion,
      generatedAt: base.meta.generatedAt,
      config: base.meta.config,
      gamesTotal: base.meta.gamesTotal,
      movesTotal: 0,
      workers: 0,
      wallMs: base.meta.wallMs,
      gamesPerSecond: 0,
      recordsDigest: base.meta.recordsDigest,
      notes: [...base.meta.notes],
    },
    health: base.meta.health,
    ladder: base.ladder,
    ladderDeltas: base.ladderDeltas,
    mirrorExact: base.mirrorExact,
    tiers: base.tiers,
    evidence: base.evidence,
    accuracy: base.accuracy,
  }
  const recomputed = computeBoundedVerdicts(summary, base.meta.baseline ?? undefined)
  if (JSON.stringify(recomputed) !== JSON.stringify(base.verdicts.slice(0, BASE_VERDICT_IDS.length))) {
    const first =
      recomputed.find((v, i) => JSON.stringify(v) !== JSON.stringify(base.verdicts[i]))?.id ?? '(count differs)'
    refusePower(
      `a carried aggregate or verdict moved — P1–P7 recomputed from the artifact's own aggregates ` +
        `do not reproduce its committed verdicts byte-for-byte (first difference at ${first})`,
    )
  }
  const pilotVerdict = computeBoundedSingleVerdict({
    cells: base.accuracySingle.cells,
    deltas: base.accuracySingle.deltas,
    infReproduction: base.accuracySingle.infReproduction,
  })
  if (JSON.stringify(pilotVerdict) !== JSON.stringify(base.verdicts[BASE_VERDICT_IDS.length])) {
    refusePower(
      "a carried aggregate or verdict moved — the pilot's P8 verdict recomputed from the " +
        "artifact's own accuracySingle block does not reproduce the committed verdict byte-for-byte",
    )
  }
  const recomputedFamilies = [
    multiplicityFamilyOf('P7', base.accuracy.deltas),
    multiplicityFamilyOf('P8', base.accuracySingle.deltas),
  ]
  if (JSON.stringify(recomputedFamilies) !== JSON.stringify(base.multiplicity)) {
    refusePower(
      'a carried annotation moved — the P7 and P8 Bonferroni families recomputed from the ' +
        "artifact's own delta families do not reproduce the committed annotation byte-for-byte",
    )
  }

  // --- assemble: the power run of record, the pilot retained, the cross-design block ---------
  const powerVerdict = computeBoundedSingleVerdict({
    cells: run.cells,
    deltas: run.deltas,
    infReproduction: run.infReproduction,
  })
  const pilotReads = base.accuracySingle.cells[0]?.reads ?? 0
  const pilotSeeds = base.accuracySingle.cells[0]?.seeds ?? 0
  const powerReads = run.cells[0]?.reads ?? 0
  const out: BoundedResults = {
    meta: {
      ...base.meta,
      schemaVersion: BOUNDED_SCHEMA_VERSION,
      notes: [
        ...base.meta.notes,
        `E4b-power (SPEC-v15.md, registered 2026-08-30 AFTER the E4b review and BEFORE any run): ` +
          `the ${pilotSeeds}-seed pilot's P8 verdict licensed only the within-design claim at its ` +
          `own read count — the registration records ~52% power at the P7 effect size for the ` +
          `committed 50-seed design. The P8 verdict of record is the ${rc.accGames}-seed power run ` +
          `(${powerReads} reads per cell) on the fresh disjoint seed prefix "${rc.accSeedPrefix}"; ` +
          `the mapping, bits grid, estimator and P8 rule are UNCHANGED. The pilot is retained ` +
          `verbatim in accuracySinglePilot; both runs are reported whatever they say. crossDesign ` +
          `carries the registered difference-of-deltas test and post-hoc power, labelled ` +
          `cross-design.`,
        ...run.meta.notes.map((n) => `E4b-power: ${n}`),
      ],
    },
    ladder: base.ladder,
    ladderDeltas: base.ladderDeltas,
    mirrorExact: base.mirrorExact,
    tiers: base.tiers,
    evidence: base.evidence,
    accuracy: base.accuracy,
    accuracySingle: {
      meta: {
        generatedAt: run.meta.generatedAt,
        engineCommit: inputs.engineCommit,
        gamesTotal: run.meta.gamesTotal,
        movesTotal: run.meta.movesTotal,
        workers: run.meta.workers,
        wallMs: run.meta.wallMs,
        gamesPerSecond: run.meta.gamesPerSecond,
        recordsDigest: run.meta.recordsDigest,
        notes: [...run.meta.notes],
      },
      accGames: rc.accGames,
      accSeedPrefix: rc.accSeedPrefix,
      mapping: singleReadMappingText(rc.accGames),
      health: run.health,
      cells: run.cells,
      deltas: run.deltas,
      infReproduction: run.infReproduction,
    },
    accuracySinglePilot: {
      ...base.accuracySingle,
      verdict: base.verdicts[BASE_VERDICT_IDS.length],
      multiplicityFamily: base.multiplicity[1],
      note:
        `The ${pilotSeeds}-seed E4b pilot, retained verbatim as committed at schema ` +
        `${BOUNDED_PILOT_SCHEMA_VERSION} (${pilotReads} reads per cell). Registered correction ` +
        `(SPEC-v15.md E4b-power): a P8 verdict at this seed count licensed only the ` +
        `within-design claim that no rung violated at its own N — never the cross-design ` +
        `attribution; the pilot's post-hoc power at the P7 effect size is reported in ` +
        `crossDesign.pilot. The power run in accuracySingle (${rc.accGames} seeds per pairing, ` +
        `${powerReads} reads per cell) is the P8 verdict of record.`,
    },
    crossDesign: crossDesignOf(base.accuracy.deltas, base.accuracySingle.deltas, run.deltas),
    multiplicity: [base.multiplicity[0], multiplicityFamilyOf('P8', run.deltas)],
    verdicts: [...base.verdicts.slice(0, BASE_VERDICT_IDS.length), powerVerdict],
  }

  // --- the carried sections, compared after assembly -----------------------------------------
  const carried: readonly (keyof BoundedResultsBase)[] = [
    'ladder',
    'ladderDeltas',
    'mirrorExact',
    'tiers',
    'evidence',
    'accuracy',
  ]
  for (const key of carried) {
    if (JSON.stringify(out[key]) !== JSON.stringify(base[key])) {
      refusePower(`the carried section "${key}" does not serialise byte-identically to the committed artifact's`)
    }
  }
  if (JSON.stringify(out.verdicts.slice(0, BASE_VERDICT_IDS.length)) !== JSON.stringify(base.verdicts.slice(0, BASE_VERDICT_IDS.length))) {
    refusePower('the carried P1–P7 verdicts do not serialise byte-identically to the committed artifact’s')
  }
  if (JSON.stringify(out.multiplicity[0]) !== JSON.stringify(base.multiplicity[0])) {
    refusePower('the carried P7 multiplicity family does not serialise byte-identically to the committed artifact’s')
  }
  const pilotKeys: readonly (keyof BoundedAccuracySingle)[] = [
    'meta',
    'mapping',
    'health',
    'cells',
    'deltas',
    'infReproduction',
  ]
  for (const key of pilotKeys) {
    if (JSON.stringify(out.accuracySinglePilot[key]) !== JSON.stringify(base.accuracySingle[key])) {
      refusePower(
        `the retained pilot's "${key}" does not serialise byte-identically to the committed ` +
          "artifact's accuracySingle block",
      )
    }
  }
  if (JSON.stringify(out.accuracySinglePilot.verdict) !== JSON.stringify(base.verdicts[BASE_VERDICT_IDS.length])) {
    refusePower('the retained pilot verdict does not serialise byte-identically to the committed P8 verdict')
  }
  return out
}
