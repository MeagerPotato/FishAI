/**
 * play.ts — one instrumented game.
 *
 * This is the only file in the lab that touches the engine's reducer, and it is deliberately the
 * *same loop* the S1 fuzz gate runs (`tests/bots/roster-fuzz.test.ts`) with measurement bolted
 * on: `legalActionsSummary` names the acting seat (under `us54` that is the declare-window
 * option seat, not the turn-holder), `decide` is seeded exactly as the server chain seeds it —
 * `hashSeed(seed:moveIndex)` — and `checkInvariants` runs after every step.
 *
 * ## Measurement is god's-eye; the *policy* still only sees `SeatView`
 *
 * Every counter below is computed by the harness from `GameState`, never handed to a bot. The
 * hidden-information guarantee (`tests/bots/public-view.test.ts`) is about what `decide` can
 * reach, and `decide` here receives exactly `seatView(state, seat)` and nothing else. Measuring
 * from the full state is what lets metrics like `raceLosses` ("a correct declare *was* available
 * to the team") be defined at all.
 *
 * ## Where a definition had to be sharpened
 *
 * Two STYLES.md §4 metrics are stated in terms a harness cannot observe directly, and the
 * operational definition is written at each site rather than left implicit:
 *
 * - **`declareLatency`** — §4 says "between a set becoming *provable* and the team declaring
 *   it". Provability is per-seat and needs `buildKnowledge` for all three teammates at every
 *   step, which is ~4x the cost of the game itself. Measured here from the moment the set became
 *   **holdable** — the first step at which the team collectively held all six cards, i.e. the
 *   earliest step at which a *correct* declare existed for that team at all (row 12). That is an
 *   upper bound on the §4 quantity and a lower bound on nothing: a set can be team-held long
 *   before any single seat can prove it.
 * - **`raceLosses`** — §4 says "times a teammate declared a set wrongly that *this seat* could
 *   have declared correctly". Counted here as the team-level event: a wrong declare on a set the
 *   team fully held, which under RULES_US54.md row 14 is exactly the misassignment arm (the
 *   opponents held none of it, so the error was internal). Whether some particular teammate
 *   could have *proved* it is again a `buildKnowledge` question; the event this counts is the
 *   one that cost the team the set.
 */
import {
  ALL_SEATS,
  allBooks,
  bookCards,
  cardBook,
  checkInvariants,
  clinchTarget,
  decide,
  defaultConfig,
  hashSeed,
  legalActionsSummary,
  legalAsks,
  newGame,
  reduce,
  seatTeam,
  seatView,
  teamSeats,
  us54Config,
  SKILL_PRESETS,
} from '../engine/index.ts'
import type {
  BookId,
  BotDifficulty,
  Card,
  GameAction,
  GameState,
  PolicySpec,
  RulesConfig,
  Seat,
  SeatView,
  StyleParams,
  Team,
  Variant,
} from '../engine/index.ts'
import type { InvariantCheck, Orientation, SideCounters } from './types.ts'

export function configFor(variant: Variant): RulesConfig {
  return variant === 'us54' ? us54Config : defaultConfig
}

/** A style at full strength, or at a forced skill for the BOT_LAB.md §1.3 ablation. */
export function policyFor(style: StyleParams, skill?: BotDifficulty): PolicySpec {
  return skill === undefined ? style : { skill: SKILL_PRESETS[skill], style }
}

function emptyCounters(): SideCounters {
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

/**
 * An engine-legal action used **only** when `decide` returned something `reduce` rejected. Every
 * use is counted as `illegal` and voids the run (BOT_LAB.md §4.3); the fallback exists so that a
 * single bad move produces one loud counter rather than 36 truncated cells.
 */
function emergencyAction(s: GameState): GameAction {
  const { seat, kinds } = legalActionsSummary(s)
  if (kinds.includes('ask')) {
    const asks = legalAsks(s, seat)
    if (asks.length > 0) return { type: 'ask', seat, target: asks[0].target, card: asks[0].card }
  }
  if (kinds.includes('decline')) return { type: 'decline', seat }
  if (kinds.includes('pass')) {
    const mates = teamSeats(seatTeam(seat))
    const to = mates.find((m) => m !== seat && s.hands[m].length > 0) ?? mates[0]
    return { type: 'pass', seat, to }
  }
  if (kinds.includes('designate')) {
    const opps = teamSeats((1 - seatTeam(seat)) as Team)
    const to = opps.find((o) => s.hands[o].length > 0) ?? opps[0]
    return { type: 'designate', seat, to }
  }
  const books = allBooks(s.config)
  const book = books.find((b) => !s.books[b]) ?? books[0]
  const assignments = {} as Record<Card, Seat>
  for (const c of bookCards(book, s.config)) assignments[c] = seat
  return { type: 'claim', seat, book, assignments }
}

/** What one game produces before it is folded into a `LabGameRecord`. */
export interface PlayedGame {
  steps: number
  finished: boolean
  capped: boolean
  illegal: number
  invariantViolations: number
  /** Sets won, indexed by team. */
  sets: [number, number]
  unresolved: number
  voids: number
  endgameReached: boolean
  clinch: boolean
  tie: boolean
  /** Per-team counters, indexed by team. */
  counters: [SideCounters, SideCounters]
}

export interface PlayOptions {
  variant: Variant
  stepCap: number
  invariantCheck: InvariantCheck
  skill?: BotDifficulty
}

/**
 * One seat's assignment for the per-seat entry point below. `policy` is what `decide` receives;
 * `leakStyle` is the style whose `leakThreshold` prices this seat's leak measurement (BOT_LAB.md
 * §4.2 — the denominator style is the *asker's own* claimed discretion). The two are separate
 * because a policy need not be a bare style: a skill-ablated pair, or an adaptive spec that
 * delegates to different styles over the game, still needs one declared threshold for the
 * harness to measure leaks against — an adaptive seat passes its anchor style and the file
 * header's caveat applies: the leak index of a seat whose style moves is priced at the anchor.
 */
export interface SeatSpec {
  policy: PolicySpec
  leakStyle: StyleParams
}

export interface SeatPlayOptions extends PlayOptions {
  /**
   * Called once per decision with the acting seat, the exact view `decide` received, and the
   * action the policy chose (before any emergency substitution). Measurement only — the game
   * ignores anything it does. This is how the adaptive runner records which style a v1.0 seat
   * delegated to without `play.ts` importing the adaptive machinery.
   */
  observe?: (seat: Seat, view: SeatView, action: GameAction) => void
}

/**
 * Play one game. `orient` fixes the seating: orientation 0 puts `a` on team 0, orientation 1
 * puts `a` on team 1. Seed and `startSeat` are supplied by the caller and are identical across
 * the two orientations of a duplicate pair (BOT_LAB.md §5.1).
 */
export function playGame(
  a: StyleParams,
  b: StyleParams,
  seed: string,
  startSeat: Seat,
  orient: Orientation,
  opts: PlayOptions,
): PlayedGame {
  const aTeam: Team = orient === 0 ? 0 : 1
  const policyA = policyFor(a, opts.skill)
  const policyB = policyFor(b, opts.skill)
  const seats = ALL_SEATS.map(
    (seat): SeatSpec =>
      seatTeam(seat) === aTeam ? { policy: policyA, leakStyle: a } : { policy: policyB, leakStyle: b },
  )
  return playGameSeats(seats, seed, startSeat, opts)
}

/**
 * Play one game with an explicit policy per seat — the general form `playGame` is a pure-team
 * special case of. Exists for the Tier-2 mixed-composition cells (BOT_LAB.md §5.3) and the
 * Bass v1.0 experiments, where a team's three seats need not share a policy. Counters remain
 * indexed by *team*; the caller owns the mapping from teams to whatever it is comparing. The
 * loop, the seeding, the measurement, and the emergency handling are byte-identical to
 * `playGame` — `tests/lab/play-seats.test.ts` pins that a pure-team call through this entry
 * point reproduces `playGame` exactly.
 */
export function playGameSeats(
  seats: readonly SeatSpec[],
  seed: string,
  startSeat: Seat,
  opts: SeatPlayOptions,
): PlayedGame {
  if (seats.length !== 6) throw new TypeError(`playGameSeats needs exactly 6 seat specs, got ${seats.length}`)
  const config = configFor(opts.variant)
  const books = allBooks(config)
  const target = clinchTarget(config)

  const counters: [SideCounters, SideCounters] = [emptyCounters(), emptyCounters()]
  const out: PlayedGame = {
    steps: 0,
    finished: false,
    capped: false,
    illegal: 0,
    invariantViolations: 0,
    sets: [0, 0],
    unresolved: books.length,
    voids: 0,
    endgameReached: false,
    clinch: false,
    tie: false,
    counters,
  }

  let s = newGame(seed, config, startSeat)

  // --- god's-eye bookkeeping, refreshed only when cards actually move ------------------------
  const owner = new Map<Card, Seat>()
  /** Per set, per team: the declare-offer count at the moment the team came to hold all six. */
  const holdableAt = new Map<BookId, [number | null, number | null]>()
  for (const bk of books) holdableAt.set(bk, [null, null])

  function refresh(state: GameState): void {
    owner.clear()
    for (const seat of ALL_SEATS) {
      for (const c of state.hands[seat]) owner.set(c, seat)
    }
    // Holdability: a set is holdable by team T once every one of its six cards sits on T. It can
    // also be *lost* again — an opponent's hit strips a card — so the arm is re-armed, not
    // latched, or the latency of a set that changed hands twice would be measured from a moment
    // at which no correct declare existed.
    for (const bk of books) {
      if (state.books[bk]) continue
      const cards = bookCards(bk, config)
      let t0 = 0
      let t1 = 0
      for (const c of cards) {
        const o = owner.get(c)
        if (o === undefined) continue
        if (seatTeam(o) === 0) t0++
        else t1++
      }
      const arm = holdableAt.get(bk) as [number | null, number | null]
      for (const t of [0, 1] as Team[]) {
        const held = (t === 0 ? t0 : t1) === cards.length
        if (held) {
          if (arm[t] === null) arm[t] = counters[t].declareOffers
        } else arm[t] = null
      }
    }
    // Hoard index (BOT_LAB.md §4.2): distinct sets in which a seat holds >= 1 card. Sampled on
    // every card-moving event plus the deal, which is exactly the set of moments at which it can
    // change — declines and passes move nothing.
    for (const t of [0, 1] as Team[]) {
      let sum = 0
      for (const seat of teamSeats(t)) {
        const set = new Set<BookId>()
        for (const c of state.hands[seat]) set.add(cardBook(c))
        sum += set.size
      }
      counters[t].hoardSum += sum / 3
      counters[t].hoardSamples++
    }
  }

  refresh(s)
  counters[seatTeam(startSeat)].turnsGained++

  while (s.phase !== 'finished') {
    if (out.steps >= opts.stepCap) {
      out.capped = true
      break
    }
    const { seat, kinds } = legalActionsSummary(s)
    const team = seatTeam(seat)
    const windowOpen = s.declareWindow !== undefined
    if (windowOpen) counters[team].declareOffers++

    const view = seatView(s, seat)
    const action = decide(view, seats[seat].policy, hashSeed(`${seed}:${s.moveIndex}`)())
    opts.observe?.(seat, view, action)

    // --- pre-action measurement (needs the position as the actor saw it) --------------------
    let declareCtx: { book: BookId; forced: boolean; foreign: boolean; teamHeld: boolean; oppSets: number } | null =
      null
    if (action.type === 'ask') {
      counters[team].asks++
      // Leak index: the ask names a set this side already accounts for >= its own leakThreshold
      // of. `leakThreshold` is a style parameter, so the denominator style is the *asker's*.
      const bk = cardBook(action.card)
      let held = 0
      for (const c of bookCards(bk, config)) {
        const o = owner.get(c)
        if (o !== undefined && seatTeam(o) === team) held++
      }
      if (held >= seats[seat].leakStyle.leakThreshold) counters[team].leakyAsks++
    } else if (action.type === 'claim') {
      const cards = bookCards(action.book, config)
      let teamHeld = cards.length > 0
      for (const c of cards) {
        const o = owner.get(c)
        if (o === undefined || seatTeam(o) !== team) {
          teamHeld = false
          break
        }
      }
      declareCtx = {
        book: action.book,
        // RULES_US54.md §3.2: when `decline` is illegal the seat *must* declare. Such a declare
        // is a rule consequence, not a style choice, so every rate is also reported without it.
        forced: !kinds.includes('decline'),
        foreign: !view.hand.some((c) => cardBook(c) === action.book),
        teamHeld,
        oppSets: out.sets[1 - team],
      }
    }

    const prevTurn = s.turn
    let r = reduce(s, action)
    if (!r.ok) {
      out.illegal++
      r = reduce(s, emergencyAction(s))
      if (!r.ok) break
      declareCtx = null
    }
    const next = r.state

    // --- post-action measurement -------------------------------------------------------------
    for (const ev of r.events) {
      if (ev.type === 'ask' && ev.hit) counters[seatTeam(ev.asker)].hits++
      else if (ev.type === 'player_out') counters[seatTeam(ev.seat)].dropoutSteps.push(out.steps)
    }
    if (next.phase === 'endgame') out.endgameReached = true

    if (declareCtx !== null) {
      const c = counters[team]
      c.declares++
      if (declareCtx.forced) c.declaresForced++
      if (declareCtx.foreign) {
        c.foreignDeclares++
        if (declareCtx.forced) c.foreignDeclaresForced++
      }
      const result = next.books[declareCtx.book]
      const outcome = result?.outcome
      const mine = team === 0 ? 'team0' : 'team1'
      if (outcome === mine) {
        c.declaresCorrect++
        out.sets[team]++
        counters[team].setsWon++
        // STYLES.md §4 `clinchDenials`: a correct declare taken while the opponents stood one
        // set from ending the game. Operational, not intentional — the harness cannot read
        // intent, and the style knob that produces the behaviour (`denialWeight`) is measured
        // by whether this count moves.
        if (declareCtx.oppSets === target - 1) c.clinchDenials++
        if (out.sets[team] === target) c.clinchWins++
        const arm = holdableAt.get(declareCtx.book)
        const armed = arm?.[team]
        if (armed !== null && armed !== undefined) {
          c.latencySum += c.declareOffers - armed
          c.latencyCount++
        }
      } else if (outcome === 'void') {
        // `pagat48` only (RULES.md row 15). Under `us54` this can never fire; the run health
        // gate asserts it stayed 0.
        c.declaresWrong++
        if (declareCtx.forced) c.declaresWrongForced++
        out.voids++
      } else if (outcome !== undefined) {
        c.declaresWrong++
        if (declareCtx.forced) c.declaresWrongForced++
        if (declareCtx.teamHeld) c.raceLosses++
        const opp = (1 - team) as Team
        out.sets[opp]++
        counters[opp].setsWon++
        counters[opp].setsGifted++
        // Row 20: a set won because the opponents declared wrongly counts toward the 5. So the
        // game-ending award is not always the winner's own declare, and `clinchWins` has to
        // follow the *award*, not the declarer, or a gifted clinch would belong to nobody.
        if (out.sets[opp] === target) counters[opp].clinchWins++
      }
    }

    if (next.turn !== prevTurn) counters[seatTeam(next.turn)].turnsGained++

    const moved = action.type === 'ask' || action.type === 'claim'
    s = next
    out.steps++
    if (moved) refresh(s)

    if (opts.invariantCheck === 'every') {
      const v = checkInvariants(s)
      if (v.length > 0) out.invariantViolations += v.length
    }
  }

  if (opts.invariantCheck === 'final') {
    out.invariantViolations += checkInvariants(s).length
  }
  out.finished = s.phase === 'finished'

  // Recount from the final state rather than trusting the running tallies: the reducer is the
  // authority on what a set resolved to, and a disagreement here would be a harness bug that
  // silently biased every metric.
  let t0 = 0
  let t1 = 0
  let resolved = 0
  for (const bk of books) {
    const o = s.books[bk]?.outcome
    if (o === undefined) continue
    resolved++
    if (o === 'team0') t0++
    else if (o === 'team1') t1++
  }
  out.sets = [t0, t1]
  out.unresolved = books.length - resolved
  out.clinch = out.finished && Math.max(t0, t1) === target
  const over = s.log[s.log.length - 1]
  out.tie = over !== undefined && over.type === 'game_over' && over.winner === 'tie'
  return out
}
