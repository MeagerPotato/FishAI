// GENERATED FILE — DO NOT EDIT.
// Copied verbatim from lib/engine/reduce.ts by scripts/sync-room-engine.mjs.
// Edit the original and re-run the script; tests/room/engine-copy.test.ts enforces the match.

/**
 * newGame + reduce — the pure heart of the engine.
 * Implements RULES.md exactly: §2 ask legality (error order), §3 claim resolution,
 * §4 out-of-cards / endgame cascade. Never throws, never mutates its input;
 * changed paths are new objects (structural sharing elsewhere).
 *
 * The second rule set, RULES_US54.md, is layered on top of the same reducer rather than
 * forked into a second engine: every difference is read from `rulesFor(state.config)`
 * (§6's derived table) and `deckFor(state.config)`. Nothing here is switched on a module-level
 * flag, so `pagat48` behaviour is reached by exactly the code paths it always was.
 */
import type {
  BookId,
  BookResult,
  Card,
  EngineError,
  ErrorCode,
  GameAction,
  GameState,
  PublicEvent,
  ReduceResult,
  RulesConfig,
  Seat,
  Team,
} from './types.ts'
import { allBooks, bookCards, cardBook, deckFor, isCard, seatTeam, sortHand, teamSeats } from './cards.ts'
import { dealHands } from './deal.ts'
import { turnHolderCanAsk } from './helpers.ts'
import { clinchTarget, rulesFor } from './variants.ts'

/** The shipped default: RULES.md, 48 cards, every optional toggle off (RULES.md §5). */
export const defaultConfig: RulesConfig = {
  playerCount: 6,
  variant: 'pagat48',
  toggles: {
    jokers: false,
    rankQuartet: false,
    mandatoryDeclare: false,
    announceLastCard: false,
    highBooksDouble: false,
    askOwnCardAllowed: false,
    declarerChoosesNext: false,
    claimAnyTurn: false,
    strictMemory: false,
  },
}

/** The US student 54-card rule set: RULES_US54.md. Same toggles, all off. */
export const us54Config: RulesConfig = {
  ...defaultConfig,
  variant: 'us54',
  toggles: { ...defaultConfig.toggles },
}

/**
 * Config coherence check. Returns [] when the config is a rule set the engine can actually
 * run, else one human-readable violation per problem (same shape as `checkInvariants`).
 *
 * These are not gameplay rules but construction-time contradictions: a config that trips one
 * of them would produce a game whose behaviour is undefined rather than merely unusual.
 */
export function validateConfig(config: RulesConfig): string[] {
  const v: string[] = []
  if (config.playerCount !== 6) v.push(`playerCount is ${String(config.playerCount)}, expected 6 (RULES.md row 24)`)
  if (config.variant !== 'pagat48' && config.variant !== 'us54')
    v.push(`variant ${String(config.variant)} is not a rule set ('pagat48' | 'us54')`)

  // RULES_US54.md §5 safety requirement 1: `us54` ends on a clinch at 5 *sets*, and the 9-set
  // pigeonhole that proves it cannot hang counts sets, not points. Doubling HIGH sets makes
  // points and sets diverge, so the two are declared incompatible rather than composed.
  if (config.toggles.highBooksDouble && config.variant === 'us54')
    v.push("toggle highBooksDouble is incompatible with variant 'us54' (RULES_US54.md §5 and §6)")

  // The legacy T1 flag is superseded by `variant`. It was declared but read nowhere, so it
  // never built the 54-card deck it advertised; honouring it now would give two independent
  // switches for one rule set. Say so instead of silently ignoring it a second time.
  if (config.toggles.jokers)
    v.push("toggle jokers is superseded by variant: 'us54' — set the variant instead (RULES_US54.md §6)")

  // RULES_US54.md §1 row 3 fixes the `us54` set list to the 8 half-suits plus EIGHTS; a
  // rank-quartet set list is a different partition of a different deck and cannot compose.
  if (config.toggles.rankQuartet && config.variant === 'us54')
    v.push("toggle rankQuartet is incompatible with variant 'us54' (RULES_US54.md §1 row 3)")

  return v
}

/**
 * Fill in an **absent** variant, and only that.
 *
 * `variant` was added by RULES_US54.md §6; every config serialized before it — a persisted
 * room, a saved drill, anything deserialized across a deploy — is a `{ playerCount, toggles }`
 * object with no `variant` key at all. Every projection helper already degrades such a config
 * to `pagat48` (`deckFor`, `rulesFor`, `allBooks`, `handSize`, `isCard`), so `newGame` throwing
 * `TypeError` on exactly the same input was a lone, backward-incompatible outlier. It normalizes
 * instead, which is what the pre-variant `newGame` effectively did.
 *
 * Scope, deliberately narrow: only an absent variant is filled in. An unknown non-empty variant
 * string is a genuine construction error the caller must see (`validateConfig` rejects it), and
 * every other coherence rule — `highBooksDouble` with `us54`, `rankQuartet` with `us54`, the
 * legacy `jokers` flag, a wrong `playerCount` — still throws exactly as before.
 *
 * The config object is returned **by identity** when nothing is missing, so a `pagat48` game
 * built from `defaultConfig` still carries that very object on its state (RULES_US54.md §2.4:
 * a default game's state must stay identical in shape and content to what it always was).
 */
function normalizeConfig(config: RulesConfig): RulesConfig {
  const raw = (config as { variant?: unknown }).variant
  const absent = raw === undefined || raw === null || raw === ''
  return absent ? { ...config, variant: 'pagat48' } : config
}

/**
 * Start a new deterministic game. Same seed (and config/startingSeat) => identical state.
 * Throws on an incoherent config (see `validateConfig`) — that is a construction bug in the
 * caller, not a player action, so it must not reach the reducer as a silently odd game. A
 * config with no `variant` at all is not incoherent, merely old: see `normalizeConfig`.
 */
export function newGame(seed: string, config: RulesConfig = defaultConfig, startingSeat: Seat = 0): GameState {
  const cfg = normalizeConfig(config)
  const problems = validateConfig(cfg)
  if (problems.length > 0) throw new TypeError(`invalid RulesConfig: ${problems.join('; ')}`)
  return {
    config: cfg,
    seed,
    phase: 'playing',
    turn: startingSeat,
    hands: dealHands(seed, cfg),
    books: {},
    score: [0, 0],
    log: [{ type: 'game_started', startingSeat }],
    moveIndex: 0,
    // RULES_US54.md §3 opens a declare window "after every action resolves"; the deal is the
    // first such moment, so a `us54` game starts with the option at the starting seat rather
    // than with an ask. Under `pagat48` this spreads nothing at all (see `windowAfter`).
    ...windowAfter(cfg, startingSeat),
  }
}

function err(code: ErrorCode, message: string): { ok: false; error: EngineError } {
  return { ok: false, error: { code, message } }
}

function isSeat(x: unknown): x is Seat {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 5
}

function teamCardCount(hands: readonly (readonly Card[])[], t: Team): number {
  return teamSeats(t).reduce<number>((n, s) => n + hands[s].length, 0)
}

/** Book point value (highBooksDouble toggle: HIGH books score 2). */
function bookPoints(config: RulesConfig, book: BookId): number {
  return config.toggles.highBooksDouble && book.startsWith('HIGH') ? 2 : 1
}

/* ------------------------------------------------- the declare window (§3) --- */

/**
 * The `declareWindow` patch to apply once an action has resolved: `open` is the seat offered
 * the first option, or `null` to close the window (RULES_US54.md §3).
 *
 * Under `pagat48` this returns an **empty** patch — not `{ declareWindow: undefined }` — so a
 * default game's state object never grows the key and stays byte-identical in shape to what
 * it was before this variant existed. Every `us54` accept path must call this: a window left
 * over from the previous action would otherwise survive the object spread and offer the option
 * to a stale seat.
 */
function windowAfter(config: RulesConfig, open: Seat | null): Partial<GameState> {
  if (rulesFor(config).declareTiming !== 'anyTime') return {}
  return open === null ? { declareWindow: undefined } : { declareWindow: { option: open, declined: 0 } }
}

/**
 * The next seat strictly after `from`, ascending and cyclic, that still holds cards; `from`
 * itself is the last candidate, and `null` means nobody holds anything.
 *
 * RULES_US54.md §4 [DERIVED]: this is where the turn goes when a declare empties the current
 * turn-holder — a case that cannot arise under the 48-card default, where claims are
 * turn-only and so only the claimant can be emptied by their own claim.
 */
function nextSeatWithCards(hands: readonly (readonly Card[])[], from: Seat): Seat | null {
  for (let i = 1; i <= 6; i++) {
    const s = ((from + i) % 6) as Seat
    if (hands[s].length > 0) return s
  }
  return null
}

/**
 * Sets **awarded** to each team, counted from `books` by outcome.
 *
 * Deliberately not `score`: RULES_US54.md §5 safety requirement 1 — `score` accumulates
 * `bookPoints`, which is 2 per HIGH set under `highBooksDouble`, so a naive `score[t] >= 5`
 * would clinch at 3 sets. `validateConfig` already refuses that toggle combination on `us54`;
 * counting outcomes here is the second line of defence, and is correct however the toggle
 * table later grows. Voids (a `pagat48`-only outcome) count for neither team.
 */
function awardedSets(books: GameState['books']): [number, number] {
  const won: [number, number] = [0, 0]
  for (const r of Object.values(books)) {
    if (!r) continue
    if (r.outcome === 'team0') won[0]++
    else if (r.outcome === 'team1') won[1]++
  }
  return won
}

function accept(state: GameState, patch: Partial<GameState>, events: PublicEvent[]): ReduceResult {
  return {
    ok: true,
    state: {
      ...state,
      ...patch,
      log: [...state.log, ...events],
      moveIndex: state.moveIndex + 1,
    },
    events,
  }
}

/** Pure reducer. Validates per RULES.md and returns the new state + public events, or a coded error. */
export function reduce(state: GameState, action: GameAction): ReduceResult {
  switch (action.type) {
    case 'ask':
      return reduceAsk(state, action)
    case 'claim':
      return reduceClaim(state, action)
    case 'pass':
      return reducePass(state, action)
    case 'designate':
      return reduceDesignate(state, action)
    case 'decline':
      return reduceDecline(state, action)
    default:
      return err('INVALID_ACTION', `unknown action type ${String((action as { type?: unknown }).type)}`)
  }
}

/* ------------------------------------------------------------------ ask --- */

function reduceAsk(state: GameState, action: { seat: Seat; target: Seat; card: Card }): ReduceResult {
  const { seat, target, card } = action
  // RULES.md §2, checks in listed order.
  if (state.phase !== 'playing') return err('WRONG_PHASE', `cannot ask in phase ${state.phase}`)
  // RULES_US54.md §3: the window comes first. "When no seat declares, the window closes and
  // the turn-holder asks" — so while it is open nobody asks, not even the turn-holder, who
  // had (and declined) the very first option in it. `pagat48` never opens a window, so this
  // is inert there and the §2 error order below is untouched.
  if (state.declareWindow)
    return err('DECLARE_WINDOW_OPEN', `seat ${state.declareWindow.option} still has the declare option`)
  if (seat !== state.turn) return err('NOT_YOUR_TURN', `it is seat ${state.turn}'s turn, not seat ${seat}'s`)
  if (state.hands[seat].length === 0) return err('ASKER_OUT', `seat ${seat} has no cards`)
  if (!isSeat(target)) return err('INVALID_ACTION', `target ${String(target)} is not a seat`)
  if (seatTeam(target) === seatTeam(seat) && target !== seat)
    return err('TARGET_TEAMMATE', `seat ${target} is a teammate of seat ${seat}`)
  if (target === seat) return err('TARGET_SELF', 'cannot ask yourself')
  if (state.hands[target].length === 0) return err('TARGET_OUT', `seat ${target} has no cards`)
  // The two book-relative checks below presuppose a real card; a fake card has no book.
  // "Real" is deck-relative: an 8 or a joker is a real card under `us54` and not under `pagat48`.
  if (typeof card !== 'string' || !isCard(card, state.config))
    return err('INVALID_CARD', `${String(card)} is not one of the ${deckFor(state.config).cards.length} cards`)
  // RULES_US54.md §1 row 6: the ask licence is uniform inside EIGHTS, which falls out of
  // cardBook alone — holding any 8 or either joker puts an EIGHTS card in hand.
  const book = cardBook(card)
  const hand = state.hands[seat]
  if (!hand.some((c) => cardBook(c) === book))
    return err('NO_CARD_OF_BOOK', `seat ${seat} holds no card of book ${book}`)
  if (!state.config.toggles.askOwnCardAllowed && hand.includes(card))
    return err('ASKING_OWN_CARD', `seat ${seat} already holds ${card}`)

  const hit = state.hands[target].includes(card)
  const events: PublicEvent[] = [{ type: 'ask', asker: seat, target, card, hit }]

  if (!hit) {
    // Miss: turn passes to the player who was asked (row 10). The window re-opens on the new
    // turn-holder — §3 offers the option "starting from the current turn-holder".
    return accept(state, { turn: target, ...windowAfter(state.config, target) }, events)
  }

  // Hit: card moves target -> asker, both hands re-sorted; asker keeps the turn (row 9).
  const hands = state.hands.map((h, i) => {
    if (i === seat) return sortHand([...h, card], state.config)
    if (i === target) return h.filter((c) => c !== card)
    return h
  })
  let phase: GameState['phase'] = state.phase
  if (hands[target].length === 0) {
    events.push({ type: 'player_out', seat: target })
    const targetTeam = seatTeam(target)
    if (rulesFor(state.config).wholeTeamOut === 'endgame' && teamCardCount(hands, targetTeam) === 0) {
      // Whole team emptied by the hit; unresolved books necessarily remain
      // (the taken card's book is unresolved). Asker has cards and keeps the turn (§4).
      // RULES_US54.md §4 keeps this phase out of `us54` entirely: there the emptied team stays
      // in the declare window, the team with cards declares out the rest, and §5 ends the game.
      phase = 'endgame'
      events.push({ type: 'endgame', claimingTeam: seatTeam(seat) })
    }
  }
  return accept(state, { hands, phase, ...windowAfter(state.config, state.turn) }, events)
}

/* ---------------------------------------------------------------- claim --- */

function reduceClaim(
  state: GameState,
  action: { seat: Seat; book: BookId; assignments: Record<Card, Seat> },
): ReduceResult {
  const { seat, book, assignments } = action
  const rules = rulesFor(state.config)
  // Legality, in the order the rule set's own table lists the checks. Both tables are written
  // as ORDERED tables and they order these two differently, so the order is derived from the
  // rule set like every other rule effect rather than picked once for both:
  //
  //   RULES.md §3        "legal iff: book unresolved (`BOOK_RESOLVED`), it's the claimant's turn
  //                       in `playing`/`endgame` phase (`NOT_YOUR_TURN`/`WRONG_PHASE`) ..."
  //                       -> BOOK_RESOLVED first.
  //   RULES_US54.md §3.1  the table runs `WRONG_PHASE`, then `BOOK_RESOLVED`.
  //
  // Either order refuses the same actions, so no game ever plays differently — but a client may
  // branch on the code, and `pagat48`'s codes are frozen (a claim of a resolved book in
  // `awaitPass` is `BOOK_RESOLVED`, pinned by tests/engine/claim.test.ts).
  const bookResolved = (): ReduceResult | null =>
    state.books[book] ? err('BOOK_RESOLVED', `book ${book} is already resolved`) : null
  const wrongPhase = (): ReduceResult | null =>
    state.phase !== 'playing' && state.phase !== 'endgame'
      ? err('WRONG_PHASE', `cannot claim in phase ${state.phase}`)
      : null
  for (const check of rules.declareTiming === 'anyTime' ? [wrongPhase, bookResolved] : [bookResolved, wrongPhase]) {
    const refusal = check()
    if (refusal) return refusal
  }
  if (rules.declareTiming === 'ownTurn') {
    // RULES.md row 11: claims on your own turn only.
    if (seat !== state.turn) return err('NOT_YOUR_TURN', `it is seat ${state.turn}'s turn, not seat ${seat}'s`)
  } else if (!state.declareWindow) {
    // RULES_US54.md §3.1 drops NOT_YOUR_TURN as a declare error: a declare is legal from ANY
    // seat (row 11). What replaces it is the window's turn *order* — every seat is offered
    // the option within one cycle, so nothing legal is ever refused, only queued. Declaring
    // out of the offered order would erase the §3 race ("priority runs from the turn-holder
    // outward, so a slower teammate can be beaten to a set"), which is the whole point of it.
    return err('NO_DECLARE_WINDOW', `no declare window is open; seat ${state.turn} must ask`)
  } else if (seat !== state.declareWindow.option) {
    return err('NOT_YOUR_OPTION', `the declare option is at seat ${state.declareWindow.option}, not seat ${seat}`)
  }
  // Every set is six cards in both rule sets; only the number of sets differs (8 vs 9).
  // A set id the config's rule set does not define yields [] here and is rejected — that is
  // how a `pagat48` game refuses an EIGHTS claim (RULES_US54.md §1 row 3).
  const cards = bookCards(book, state.config)
  if (cards.length !== 6) return err('INVALID_ACTION', `${String(book)} is not a book`)
  // Assignments must cover exactly the 6 cards of the book.
  const keys = assignments && typeof assignments === 'object' ? Object.keys(assignments) : null
  if (
    keys === null ||
    keys.length !== 6 ||
    !cards.every((c) => Object.prototype.hasOwnProperty.call(assignments, c))
  )
    return err('BAD_ASSIGNMENTS', `assignments must cover exactly the 6 cards of ${book}`)
  const claimerTeam = seatTeam(seat)
  for (const c of cards) {
    const s = assignments[c]
    if (!isSeat(s) || seatTeam(s) !== claimerTeam)
      return err('ASSIGN_OPPONENT', `card ${c} assigned to seat ${String(s)}, not on team ${claimerTeam}`)
  }

  // Resolution (§3). Actual holders recorded from the true pre-removal state.
  const actualHolders = {} as Record<Card, Seat>
  let opponentHolds = false
  let allCorrect = true
  for (const c of cards) {
    const holder = state.hands.findIndex((h) => h.includes(c)) as Seat | -1
    if (holder === -1) {
      // Unreachable for an unresolved book (deck conservation), but never throw.
      return err('INVALID_ACTION', `card ${c} of unresolved book ${book} is not in any hand`)
    }
    actualHolders[c] = holder
    if (seatTeam(holder) !== claimerTeam) opponentHolds = true
    if (assignments[c] !== holder) allCorrect = false
  }
  const opposingTeam: Team = claimerTeam === 0 ? 1 : 0
  const scores = (t: Team): BookResult['outcome'] => (t === 0 ? 'team0' : 'team1')
  // RULES.md §3 / RULES_US54.md §1 row 14. Both rule sets agree on the first two lines: an
  // opponent holding any of the six gives the set to the opponents, and a flawless declare
  // gives it to the declarer's team. They part on the third — own team holds all six but a
  // location is wrong. `pagat48` voids it (row 15); `us54` abolishes `void` outright and
  // awards it to the opponents too, so that EVERY resolved set goes to exactly one team,
  // which is precisely what makes the §5 clinch proof (4+4 = 8 < 9) work.
  const outcome: BookResult['outcome'] = opponentHolds
    ? scores(opposingTeam)
    : allCorrect
      ? scores(claimerTeam)
      : rules.wrongDeclare === 'opponents'
        ? scores(opposingTeam)
        : 'void'

  const result: BookResult = {
    book,
    outcome,
    claimer: seat,
    assignments: { ...assignments },
    actualHolders,
  }
  const books = { ...state.books, [book]: result }
  const score: [number, number] = [state.score[0], state.score[1]]
  if (outcome === 'team0') score[0] += bookPoints(state.config, book)
  else if (outcome === 'team1') score[1] += bookPoints(state.config, book)

  // Remove the 6 cards from all hands; note newly emptied seats.
  const cardSet = new Set<Card>(cards)
  const hands = state.hands.map((h) => (h.some((c) => cardSet.has(c)) ? h.filter((c) => !cardSet.has(c)) : h))
  const events: PublicEvent[] = [
    { type: 'claim', claimer: seat, book, assignments: result.assignments, actualHolders, outcome },
  ]
  for (let s = 0; s < 6; s++) {
    if (state.hands[s].length > 0 && hands[s].length === 0) events.push({ type: 'player_out', seat: s as Seat })
  }

  // --- termination, highest precedence (RULES.md §4: a claim that ends the game ends it
  // regardless of any pending pass/designate). ---
  const nBooks = allBooks(state.config).length
  const resolved = Object.keys(books).length
  const sets = awardedSets(books)
  // RULES_US54.md §1 row 19: `us54` ends the *instant* either team has been AWARDED
  // `clinchTarget` (= floor(9/2)+1 = 5) sets — counted from `books` by outcome, never from
  // `score`; see `awardedSets`. Row 20: sets won because the opponents declared wrongly count
  // exactly the same as sets won by declaring correctly, which is automatic here since both
  // record the same `outcome`.
  const clinched = rules.winCondition === 'clinch' && Math.max(sets[0], sets[1]) >= clinchTarget(state.config)
  // `resolved === nBooks` is RULES.md row 22 for `pagat48` and a **defensive second
  // terminator** for `us54`, where RULES_US54.md §5 proves it unreachable: 9 resolved sets
  // with none void means some team holds ≥ 5 and clinched earlier. It is kept deliberately, as
  // §5 safety requirement 2 asks, so that a future rule edit that breaks the pigeonhole cannot
  // silently reintroduce the hang — the live table this engine also ships to abandons a stuck
  // bot chain in silence, and that host is a different repository (see invariants.ts).
  if (clinched || resolved === nBooks) {
    /** The ordinary "more is better, equal is a tie" comparison. */
    const ahead = (a: number, b: number): 0 | 1 | 'tie' => (a > b ? 0 : b > a ? 1 : 'tie')
    // Three terminators, and each needs its own answer:
    //
    // 1. A **clinch**. One team has been awarded `clinchTarget` sets; both cannot have, since
    //    2 * clinchTarget > nBooks. So the winner is simply whichever set count is larger and
    //    there is deliberately no tie arm — the asymmetry is asserted, not merely assumed.
    // 2. The **§5 fallback** (`resolved === nBooks`) under a clinch rule set. This branch exists
    //    only to survive a future rule edit that breaks the §5 pigeonhole — and an edit that can
    //    make it reachable at all (a re-introduced `void`, an even set count, a different
    //    `clinchTarget`) is exactly an edit that can produce a drawn board. It therefore counts
    //    sets, as §5 safety requirement 1 demands, AND admits a tie: sharing the clinch's
    //    arm here would have silently crowned team 1 the winner of a 4-4 board.
    // 3. `pagat48`'s RULES.md row 22/23 finish: compare `score` (which carries `bookPoints`,
    //    not set counts), ties included. Unchanged, byte for byte.
    const winner: 0 | 1 | 'tie' = clinched
      ? sets[0] > sets[1]
        ? 0
        : 1
      : rules.winCondition === 'clinch'
        ? ahead(sets[0], sets[1])
        : ahead(score[0], score[1])
    events.push({ type: 'game_over', score: [score[0], score[1]], winner })
    // A clinched game legitimately finishes with unresolved sets and cards still in hands
    // (§5.1) — the final screen must say so, e.g. "5-3 · 1 unresolved".
    return accept(state, { hands, books, score, phase: 'finished', ...windowAfter(state.config, null) }, events)
  }

  // --- post-declare turn and window handling, `us54` (RULES_US54.md §1 row 16, §3, §4) ---
  if (rules.declareTiming === 'anyTime') return declareTail(state, { hands, books, score }, seat, events)

  // --- post-claim cascade, `pagat48` (RULES.md §4 precedence) ---
  if (state.phase === 'endgame') {
    // Endgame: the designated/claiming seat keeps the turn until finished.
    return accept(state, { hands, books, score }, events)
  }
  const someTeamEmpty = teamCardCount(hands, 0) === 0 || teamCardCount(hands, 1) === 0
  if (someTeamEmpty) {
    if (hands[seat].length > 0) {
      // Claimant emptied the opposing team and still has cards: endgame, turn stays (§4).
      events.push({ type: 'endgame', claimingTeam: claimerTeam })
      return accept(state, { hands, books, score, phase: 'endgame' }, events)
    }
    if (teamCardCount(hands, claimerTeam) > 0) {
      // Claimant emptied themselves and the opposing team; pass resolves first, then endgame.
      return accept(state, { hands, books, score, phase: 'awaitPass' }, events)
    }
    // Claimant's whole team is out: they must designate an opponent to claim out the endgame.
    return accept(state, { hands, books, score, phase: 'awaitDesignate' }, events)
  }
  if (hands[seat].length === 0) {
    // Emptied by own claim: must pass to a teammate with cards (row 20).
    return accept(state, { hands, books, score, phase: 'awaitPass' }, events)
  }
  // Turn continues with the claimant (row 17).
  return accept(state, { hands, books, score }, events)
}

/**
 * Where the turn and the declare window go after a `us54` declare resolves. Reached only past
 * the clinch test, so the game is certainly still running.
 *
 * RULES_US54.md §1 row 16: the turn is **unaffected**. An out-of-turn declare is an
 * interjection — play resumes with whoever held the turn; if the turn-holder declared, their
 * turn continues and they ask next (once the re-opened window closes on them). §4 adds the two
 * derived out-of-cards rules that the 48-card default can never reach, both handled below.
 *
 * Whatever the turn ends up being, the window re-opens on it from the top (§3): a declare that
 * resolves is new public information that may make another set declarable, so the offer starts
 * again at the turn-holder and runs a fresh cycle.
 */
function declareTail(
  state: GameState,
  patch: Pick<GameState, 'hands' | 'books' | 'score'>,
  declarer: Seat,
  events: PublicEvent[],
): ReduceResult {
  const { hands } = patch
  const turn = state.turn
  const config = state.config

  if (declarer !== turn) {
    // Out-of-turn declare. It does not move the turn — unless it emptied the turn-holder, who
    // drops out; §4 [DERIVED] then sends the turn to the next seat in ascending cyclic order
    // that still holds cards. If the *declarer* emptied themselves they simply drop out and do
    // NOT pass: `awaitPass` is a turn action and they never held the turn (§4 [DERIVED]).
    const next = hands[turn].length > 0 ? turn : (nextSeatWithCards(hands, turn) ?? turn)
    return accept(state, { ...patch, turn: next, ...windowAfter(config, next) }, events)
  }

  // The turn-holder declared: their turn continues (row 16).
  if (hands[turn].length > 0) return accept(state, { ...patch, ...windowAfter(config, turn) }, events)

  // Emptied by their own declare. RULES.md row 20's pass is still in force here — §4 scopes it
  // to exactly this case — but only while a teammate actually holds cards. The window closes
  // for the duration: `awaitPass` is not a declare phase (§3.1), and it re-opens on the seat
  // that receives the turn.
  if (teamSeats(seatTeam(turn)).some((s) => s !== turn && hands[s].length > 0))
    return accept(state, { ...patch, phase: 'awaitPass', ...windowAfter(config, null) }, events)

  // Whole team out. `us54` has no `endgame`/`awaitDesignate` machinery (§4): the turn simply
  // moves on to the next seat holding cards, the team with cards declares out the remaining
  // sets in the ordinary window, and §5 guarantees the clinch arrives.
  const next = nextSeatWithCards(hands, turn)
  // `next === null` means no seat holds a card at all, i.e. all 54 are in resolved sets — which
  // is `resolved === nBooks`, already terminated above. Kept total rather than asserted.
  const to = next ?? turn
  return accept(state, { ...patch, turn: to, ...windowAfter(config, to) }, events)
}

/* -------------------------------------------------------------- decline --- */

/**
 * Decline the declare option (RULES_US54.md §3).
 *
 * This is the single action that turns §3's prose into a state machine. Each `decline` advances
 * the option to the next seat, cyclically; six in a row mean "a full cycle of six seats passed
 * with no declare", so the window closes and the turn-holder asks. Any `claim` in between
 * resolves immediately and re-opens the window from the top (see `declareTail`), which is what
 * "any number of declares may resolve in one window, each immediately and in that order" means
 * when the reducer only ever sees one action at a time.
 *
 * ## Why a decline can be *illegal* (RULES_US54.md §3, §4)
 *
 * §3 closes the window into "the turn-holder asks". When the turn-holder has no legal ask —
 * a whole team out of cards (§4), or a hand that is a union of complete unresolved sets —
 * there is nothing for the window to close into. Declining cannot then lead anywhere:
 * declines move no cards, so `turnHolderCanAsk` cannot change during a window, and a table that
 * only declines revisits the same position forever. The engine used to answer that by re-opening
 * the window (`{ option: turn, declined: 0 }`) instead of closing it, which kept every state
 * *legal* and every state *identical*: three full cycles of six declines left the window
 * exactly as it started, `checkInvariants` returned `[]` at every step, and termination
 * survived only as a property of how the bots happened to play.
 *
 * So the rule, not the policy, forbids it: **while no ask can follow the window, `decline` is
 * refused with `MUST_DECLARE`.** That is sound because a declare is ALWAYS legal while any set
 * is unresolved — rows 12/15 let you name any unresolved set and assign all six of its cards to
 * seats on your own team, possibly wrongly (row 14 then gifts it to the opponents) but always
 * legally, and the six cards of an unresolved set are provably still in hands. The option seat
 * therefore always has a move, that move resolves a set, and the resolved count strictly
 * increases — so the game reaches `clinchTarget` (or `resolved === nBooks`) in at most `nBooks`
 * declares. §5's termination guarantee is restored as a property of the rules, and the §5
 * deadlock invariant becomes meaningful again: it can no longer be satisfied by a `decline`
 * that provably leads nowhere.
 *
 * The refusal is keyed on the **turn-holder**, not on "no seat anywhere can ask", because only
 * the turn-holder ever asks out of a closed window: a turn-holder whose hand is a union of
 * complete sets blocks the window even while five other seats could happily ask. Note this also
 * means the option can never travel: the turn-holder holds cards in every `playing` state
 * (`checkInvariants`) and is offered the option first, so a window that no ask can follow is
 * refused at `declined: 0` and answered by that seat's own declare.
 */
function reduceDecline(state: GameState, action: { seat: Seat }): ReduceResult {
  const w = state.declareWindow
  if (!w) return err('NO_DECLARE_WINDOW', `no declare window is open in phase ${state.phase}`)
  if (!isSeat(action.seat)) return err('INVALID_ACTION', `seat ${String(action.seat)} is not a seat`)
  if (action.seat !== w.option)
    return err('NOT_YOUR_OPTION', `the declare option is at seat ${w.option}, not seat ${action.seat}`)
  // §3/§4, above: nothing to close the window into, so passing the option on is not a move.
  if (!turnHolderCanAsk(state))
    return err(
      'MUST_DECLARE',
      `seat ${state.turn} has no legal ask, so this window cannot close: seat ${action.seat} must declare`,
    )

  const declined = w.declined + 1
  if (declined < 6) {
    // Next seat in turn order, cyclically. A cardless seat is offered the option like any
    // other: row 15/18 keep a player with no cards in the declare game.
    return accept(state, { declareWindow: { option: ((w.option + 1) % 6) as Seat, declined } }, [])
  }
  // A full cycle declined with no declare: §3 literally — the window closes and the turn-holder
  // asks. Reaching here at all proves they can, since every one of those six declines was
  // checked against `turnHolderCanAsk` and declines move no cards.
  return accept(state, { declareWindow: undefined }, [])
}

/* ----------------------------------------------------------------- pass --- */

function reducePass(state: GameState, action: { seat: Seat; to: Seat }): ReduceResult {
  const { seat, to } = action
  if (state.phase !== 'awaitPass') return err('WRONG_PHASE', `cannot pass in phase ${state.phase}`)
  if (seat !== state.turn) return err('NOT_YOUR_TURN', `it is seat ${state.turn}'s turn, not seat ${seat}'s`)
  if (!isSeat(to) || seatTeam(to) !== seatTeam(seat))
    return err('PASS_TARGET_NOT_TEAMMATE', `seat ${String(to)} is not a teammate of seat ${seat}`)
  if (state.hands[to].length === 0) return err('PASS_TARGET_OUT', `seat ${to} has no cards`)
  const events: PublicEvent[] = [{ type: 'pass', from: seat, to }]
  return handoff(state, to, events)
}

/* ------------------------------------------------------------ designate --- */

function reduceDesignate(state: GameState, action: { seat: Seat; to: Seat }): ReduceResult {
  const { seat, to } = action
  if (state.phase !== 'awaitDesignate') return err('WRONG_PHASE', `cannot designate in phase ${state.phase}`)
  if (seat !== state.turn) return err('NOT_YOUR_TURN', `it is seat ${state.turn}'s turn, not seat ${seat}'s`)
  if (!isSeat(to) || seatTeam(to) === seatTeam(seat) || state.hands[to].length === 0)
    return err('DESIGNATE_TARGET_INVALID', `seat ${String(to)} is not an opponent with cards`)
  const events: PublicEvent[] = [{ type: 'designate', from: seat, to }]
  return handoff(state, to, events)
}

/** Shared tail of pass/designate: turn = to; endgame if a whole team is out, else playing. */
function handoff(state: GameState, to: Seat, events: PublicEvent[]): ReduceResult {
  const someTeamEmpty = teamCardCount(state.hands, 0) === 0 || teamCardCount(state.hands, 1) === 0
  // RULES_US54.md §4 keeps `endgame` out of `us54`; there the pass just hands the turn on and
  // the declare window re-opens on the receiving seat (§3, "after every action resolves").
  if (someTeamEmpty && rulesFor(state.config).wholeTeamOut === 'endgame') {
    events.push({ type: 'endgame', claimingTeam: seatTeam(to) })
    return accept(state, { turn: to, phase: 'endgame' }, events)
  }
  return accept(state, { turn: to, phase: 'playing', ...windowAfter(state.config, to) }, events)
}
