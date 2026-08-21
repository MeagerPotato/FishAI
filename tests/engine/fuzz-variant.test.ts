/**
 * RULES_US54.md §7 vector 10 — the variant fuzz gate — plus the §2.4 / non-negotiable-1
 * counterpart for the 48-card default.
 *
 * Vector 10 asks for 10,000 `us54` games in which all terminate, every winner is a clinch at
 * exactly 5 sets, the `resolved === 9` fallback never fires, no `tie` is ever emitted, and
 * `checkInvariants` returns `[]` at every step. All five are asserted below, together with a
 * sixth the §5 proof silently depends on: the union of every hand and every resolved set is
 * always exactly the 54-card deck.
 *
 * ## How "the fallback never fires" is proven
 *
 * The terminator in reduce.ts is `if (clinched || resolved === nBooks)`. About a quarter of
 * random `us54` games do reach a 9th resolution — a 4-4 game whose last set makes it 5-4 — so
 * `resolved === nBooks` is *true* at that final step. It still never **fires**, because `||`
 * short-circuits and `clinched` is already true there. The proof obligation is therefore
 * exactly: **every finished `us54` state has a team on `clinchTarget` sets**, which makes the
 * left operand true at every termination and the right operand dead code. The gate counts both
 * cases (`FALLBACK.aloneCount` must be 0; `FALLBACK.coincidedCount` is reported as a
 * statistic) rather than asserting a bare "never true", which would be false and would have to
 * be loosened later — the failure mode §5 safety requirement 2 is written against.
 *
 * The counter lives here and not in reduce.ts on purpose: `reduce` is a pure function and an
 * exported mutable tally inside the engine would be exactly the module-level state the whole
 * variant design forbids. `clinched` is recomputable from the state the reducer returns, so
 * the instrumentation costs the engine nothing.
 */
import { describe, expect, it } from 'vitest'
import {
  ALL_BOOKS,
  allBooks,
  bookCards,
  checkInvariants,
  clinchTarget,
  deckFor,
  defaultConfig,
  newGame,
  randInt,
  reduce,
  rngFromSeed,
  us54Config,
} from '../../lib/engine/index.ts'
import type { Card, GameState, Seat } from '../../lib/engine/index.ts'
import { policyAction, us54PolicyAction } from './policy.ts'

/**
 * Full §7 vector 10 size. ~6s, so it runs at full size in the default suite; `FISH_FUZZ_GAMES`
 * shrinks it while iterating. Read off `globalThis` because the repo has no `@types/node` and
 * lib/engine must stay free of platform imports — a bare `process` would not typecheck.
 */
const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
const US54_GAMES = Number(ENV?.FISH_FUZZ_GAMES ?? 10_000)
/** Longest observed random `us54` game is ~180 reduces; this is a hang detector, not a budget. */
const MAX_STEPS = 5_000
const TIMEOUT = 300_000

/** Sets awarded to each team, counted from `books` by outcome — never from `score` (§5 req 1). */
function awardedSets(s: GameState): [number, number] {
  const won: [number, number] = [0, 0]
  for (const b of allBooks(s.config)) {
    const o = s.books[b]?.outcome
    if (o === 'team0') won[0]++
    else if (o === 'team1') won[1]++
  }
  return won
}

/**
 * Every card the state accounts for: the six hands plus the membership of every resolved set.
 * Returns them in a Set so the caller can check both the size (nothing lost) and the coverage
 * (nothing invented, nothing duplicated across two hands).
 */
function accountedCards(s: GameState): Set<Card> {
  const seen = new Set<Card>()
  let counted = 0
  for (const h of s.hands) {
    for (const c of h) {
      seen.add(c)
      counted++
    }
  }
  for (const b of allBooks(s.config)) {
    if (!s.books[b]) continue
    for (const c of bookCards(b, s.config)) {
      seen.add(c)
      counted++
    }
  }
  // A duplicate anywhere makes `counted` exceed the set size; the caller compares both.
  if (counted !== seen.size) seen.add('DUPLICATE' as Card)
  return seen
}

describe('fuzz gate: 10,000 us54 games (RULES_US54.md §7 vector 10)', () => {
  it(
    `plays ${US54_GAMES} seeded us54 games to a clinch with invariants after every reduce`,
    () => {
      const DECK = deckFor(us54Config).cards
      const N_BOOKS = allBooks(us54Config).length
      const TARGET = clinchTarget(us54Config)
      expect([DECK.length, N_BOOKS, TARGET]).toEqual([54, 9, 5])

      // The §5 instrumentation. `aloneCount` is the one that must be zero.
      const FALLBACK = { aloneCount: 0, coincidedCount: 0 }
      let totalSteps = 0
      let declineCount = 0
      let awaitPassCount = 0
      const started = Date.now()

      for (let i = 0; i < US54_GAMES; i++) {
        const seed = `us54-fuzz-${i}`
        const rng = rngFromSeed(`${seed}:policy`)
        // Rotating the starting seat matters: §3 runs the declare option outward from the
        // turn-holder, so seat 0 starting every game would only ever exercise one rotation.
        let state = newGame(seed, us54Config, randInt(rng, 6) as Seat)
        let steps = 0

        while (state.phase !== 'finished' && steps < MAX_STEPS) {
          const action = us54PolicyAction(state, rng)
          if (action.type === 'decline') declineCount++
          const r = reduce(state, action)
          if (!r.ok) {
            throw new Error(
              `seed ${seed} step ${steps}: policy action rejected ` +
                `(${r.error.code}: ${r.error.message}) action=${JSON.stringify(action)}`,
            )
          }
          state = r.state
          steps++

          const violations = checkInvariants(state)
          if (violations.length > 0) {
            throw new Error(`seed ${seed} step ${steps}: invariants violated: ${violations.join(' | ')}`)
          }
          // Deck conservation, asserted independently of `checkInvariants` so that a bug which
          // disabled the invariant still cannot pass this gate.
          const accounted = accountedCards(state)
          if (accounted.size !== DECK.length || !DECK.every((c) => accounted.has(c))) {
            throw new Error(
              `seed ${seed} step ${steps}: hands + resolved sets cover ${accounted.size} cards, not the 54-card deck`,
            )
          }
          // §4: the endgame machinery stays out of this variant entirely.
          if (state.phase === 'endgame' || state.phase === 'awaitDesignate') {
            throw new Error(`seed ${seed} step ${steps}: entered pagat48-only phase ${state.phase}`)
          }
          if (state.phase === 'awaitPass') awaitPassCount++
        }

        totalSteps += steps
        if (state.phase !== 'finished') {
          throw new Error(`seed ${seed}: did not finish within ${MAX_STEPS} steps (phase ${state.phase})`)
        }

        // --- the terminator that fired (see the file header) ---
        const sets = awardedSets(state)
        const resolved = Object.keys(state.books).length
        const clinched = Math.max(sets[0], sets[1]) >= TARGET
        if (!clinched) FALLBACK.aloneCount++
        else if (resolved === N_BOOKS) FALLBACK.coincidedCount++
        if (!clinched) {
          throw new Error(
            `seed ${seed}: finished on the resolved===${N_BOOKS} fallback, not a clinch ` +
              `(sets ${sets[0]}-${sets[1]}, ${resolved} resolved)`,
          )
        }
        // Termination is immediate, so the winner is on exactly the target, never past it.
        if (Math.max(sets[0], sets[1]) !== TARGET) {
          throw new Error(`seed ${seed}: finished at ${sets[0]}-${sets[1]} sets, not a clinch at ${TARGET}`)
        }
        // Row 14 abolishes `void`; that is what makes the 4+4 < 9 pigeonhole of §5 hold.
        for (const b of allBooks(us54Config)) {
          if (state.books[b]?.outcome === 'void') throw new Error(`seed ${seed}: book ${b} resolved void`)
        }

        const over = state.log[state.log.length - 1]
        if (over.type !== 'game_over') throw new Error(`seed ${seed}: finished without a game_over event`)
        if (over.winner === 'tie') throw new Error(`seed ${seed}: emitted a tie (impossible under §5)`)
        if (sets[over.winner] !== TARGET) {
          throw new Error(`seed ${seed}: winner ${over.winner} holds ${sets[over.winner]} sets, not ${TARGET}`)
        }
        // §5.1: a clinched game legitimately stops with sets unresolved and cards in hand — the
        // opposite of the pagat48 finish, and the reason invariants.ts had to be relaxed.
        if (resolved > N_BOOKS) throw new Error(`seed ${seed}: ${resolved} resolved sets of ${N_BOOKS}`)
        if (state.declareWindow) throw new Error(`seed ${seed}: finished with the declare window open`)
        if (state.moveIndex !== steps) {
          throw new Error(`seed ${seed}: moveIndex ${state.moveIndex} !== accepted actions ${steps}`)
        }
      }

      // The gate's headline: the defensive terminator was never the reason a game ended.
      expect(FALLBACK.aloneCount, 'the resolved===9 fallback fired').toBe(0)
      // Coverage floors, so the run cannot pass by never reaching the interesting states.
      expect(FALLBACK.coincidedCount, 'no game ever ran to a 9th resolution').toBeGreaterThan(0)
      expect(declineCount, 'the declare window never ran').toBeGreaterThan(US54_GAMES)
      expect(awaitPassCount, 'no turn-holder was ever emptied by their own declare').toBeGreaterThan(0)

      const elapsed = ((Date.now() - started) / 1000).toFixed(1)
      const perGame = (totalSteps / US54_GAMES).toFixed(1)
      console.log(
        `fuzz(us54): ${US54_GAMES} games, ${totalSteps} reduces (${perGame} avg/game) in ${elapsed}s; ` +
          `${FALLBACK.coincidedCount} reached a 9th resolution, fallback fired ${FALLBACK.aloneCount}x`,
      )
      expect(totalSteps).toBeGreaterThan(0)
    },
    TIMEOUT,
  )
})

/* ------------------------------------------ the 48-card default is unchanged --- */

/**
 * Whole-game outcomes recorded from the **pre-variant engine** — `lib/engine` as of the commit
 * before deck construction became config-derived — replayed through the same
 * `tests/engine/policy.ts` random policy.
 *
 * `tests/engine/deck-variant.test.ts` freezes the *deal* for a set of recorded seeds; this
 * freezes the whole reducer path downstream of it. Each entry is
 * `steps|score0-score1|winner|outcomes`, where `outcomes` is one character per book in
 * `ALL_BOOKS` order: `0` = team0, `1` = team1, `v` = void.
 *
 * A failure here means a `pagat48` game played differently than it did before this work — the
 * non-negotiable. Treat it as a regression, never as a fixture to re-record.
 */
const PAGAT48_GOLDEN_GAMES: Record<string, string> = {
  'gate-pagat48-0': '86|4-4|tie|01001011',
  'gate-pagat48-1': '155|1-6|1|1v110111',
  'gate-pagat48-2': '141|3-5|1|01101011',
  'gate-pagat48-3': '145|4-2|0|101v00v0',
  'gate-pagat48-4': '123|5-2|0|010v1000',
  'gate-pagat48-5': '96|3-5|1|01110101',
  'gate-pagat48-6': '142|2-5|1|1v011011',
  'gate-pagat48-7': '118|4-4|tie|10100011',
  'gate-pagat48-8': '112|3-5|1|01011110',
  'gate-pagat48-9': '137|2-4|1|01v111v0',
  'gate-pagat48-10': '77|5-3|0|01010100',
  'gate-pagat48-11': '145|4-4|tie|01011001',
  'gate-pagat48-12': '109|5-2|0|110v0000',
  'gate-pagat48-13': '131|5-3|0|10010100',
  'gate-pagat48-14': '131|2-5|1|110110v1',
  'gate-pagat48-15': '123|4-4|tie|10110010',
  'gate-pagat48-16': '155|2-4|1|1v110v01',
  'gate-pagat48-17': '141|6-2|0|11000000',
  'gate-pagat48-18': '118|4-4|tie|10101100',
  'gate-pagat48-19': '98|5-3|0|10100100',
  'gate-pagat48-20': '82|3-4|1|0110101v',
  'gate-pagat48-21': '154|4-2|0|v10v0100',
  'gate-pagat48-22': '169|2-4|1|1v10v101',
  'gate-pagat48-23': '123|3-5|1|01001111',
  'gate-pagat48-24': '118|3-3|tie|1v1001v0',
  'gate-pagat48-25': '115|5-2|0|010100v0',
  'gate-pagat48-26': '99|4-4|tie|11100001',
  'gate-pagat48-27': '126|3-3|tie|0010v11v',
  'gate-pagat48-28': '84|5-3|0|00110001',
  'gate-pagat48-29': '126|6-2|0|10000100',
  'gate-pagat48-30': '148|2-3|1|v10v1v01',
  'gate-pagat48-31': '107|4-3|0|110010v0',
  'gate-pagat48-32': '120|5-3|0|00000111',
  'gate-pagat48-33': '111|3-5|1|11110100',
  'gate-pagat48-34': '142|3-5|1|01011011',
  'gate-pagat48-35': '91|5-3|0|01100010',
  'gate-pagat48-36': '104|4-4|tie|01010110',
  'gate-pagat48-37': '124|4-4|tie|01101100',
  'gate-pagat48-38': '110|4-4|tie|01111000',
  'gate-pagat48-39': '134|2-6|1|11110110',
}

const OUTCOME_CODE: Record<string, string> = { team0: '0', team1: '1', void: 'v' }

describe('the 48-card default plays byte-identically to the pre-variant engine', () => {
  it('replays every recorded whole game to the same length, score, winner and outcomes', () => {
    for (const [seed, golden] of Object.entries(PAGAT48_GOLDEN_GAMES)) {
      const rng = rngFromSeed(`${seed}:policy`)
      let state = newGame(seed)
      let steps = 0
      while (state.phase !== 'finished' && steps < MAX_STEPS) {
        const r = reduce(state, policyAction(state, rng))
        if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code} ${r.error.message}`)
        state = r.state
        expect(checkInvariants(state), `${seed} step ${steps}`).toEqual([])
        steps++
      }
      const over = state.log[state.log.length - 1]
      const winner = over.type === 'game_over' ? String(over.winner) : 'none'
      const outcomes = ALL_BOOKS.map((b) => OUTCOME_CODE[state.books[b]?.outcome ?? ''] ?? '?').join('')
      expect(`${steps}|${state.score[0]}-${state.score[1]}|${winner}|${outcomes}`, seed).toBe(golden)
    }
  })

  it('never grows a declareWindow key, never clinches, and always resolves all 8 books', () => {
    // The shape assertion is the one `tests/engine/fuzz.test.ts` cannot make: `us54` added an
    // optional `GameState` field, and a `pagat48` state object must still never carry it
    // (RULES_US54.md §2.4 / non-negotiable 1 — same deals, same outcomes, same objects).
    for (let i = 0; i < 400; i++) {
      const seed = `gate-shape-${i}`
      const rng = rngFromSeed(`${seed}:policy`)
      let state = newGame(seed)
      expect(Object.keys(state)).not.toContain('declareWindow')
      let steps = 0
      while (state.phase !== 'finished' && steps < MAX_STEPS) {
        const r = reduce(state, policyAction(state, rng))
        if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code} ${r.error.message}`)
        state = r.state
        if (Object.keys(state).includes('declareWindow')) {
          throw new Error(`${seed} step ${steps}: a pagat48 state grew a declareWindow key`)
        }
        steps++
      }
      expect(state.phase, seed).toBe('finished')
      // RULES.md row 22: `pagat48` ends when every book is resolved and every hand is empty —
      // it does not clinch, and a 4-4 finish is a tie, both unchanged by the variant work.
      expect(Object.keys(state.books), seed).toHaveLength(ALL_BOOKS.length)
      expect(state.hands.every((h) => h.length === 0), seed).toBe(true)
      expect(deckFor(defaultConfig).cards.length).toBe(48)
    }
  })
})
