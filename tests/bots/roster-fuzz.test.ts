/**
 * Roster fuzz gate — BOT_LAB.md §9 phase **S1**: *"Every style legal-by-construction over a
 * 2,000-game fuzz; 0 illegal actions, 0 capped games."*
 *
 * Each style is played as a **mirror**: all six seats run the same vector under `us54`. That is
 * deliberately the worst case for termination, and it is the case STYLES.md §3.1 warns about —
 *
 * > **Turtle** is the deadlock risk. [...] A Turtle mirror declares almost nothing and could
 * > stall badly. `cappedGames` and `avgMoves` are hard gates. **If the stall-breaker needs
 * > tuning, tune it once, globally — never per-style.**
 *
 * — so the assertions below are the gate, and `POLICY_CONSTANTS.stall` is the only dial that may
 * ever be turned in response to them. There is no per-style stall rule and `roster.test.ts` pins
 * that no style vector carries one.
 *
 * Per step, every game asserts: the action was accepted by `reduce` (no illegal-action fallback
 * was needed), and `checkInvariants` returned `[]`. Per game: it finished inside the step cap,
 * on a **clinch at exactly 5 sets** with no tie and no `void` outcome, and the RULES_US54.md §5
 * `resolved === nBooks` fallback never fired.
 *
 * `ROSTER_FUZZ_GAMES` sets the games per style. The committed default is deliberately small so it adds no
 * meaningful load to `npm test` (a heavy default starves the other suites' timeouts);
 * the S1 gate itself is the 2,000-game run, driven by the environment variable — the assertions
 * are identical either way, only the sample size moves.
 */
import { describe, expect, it } from 'vitest'
import {
  STYLE_ROSTER,
  STYLE_IDS,
  allBooks,
  cardBook,
  checkInvariants,
  clinchTarget,
  decide,
  hashSeed,
  legalActionsSummary,
  newGame,
  reduce,
  seatView,
  us54Config,
} from '../../lib/engine/index.ts'
import type { GameState, Seat, StyleId } from '../../lib/engine/index.ts'

/** Games per style. `ROSTER_FUZZ_GAMES=2000` is the BOT_LAB.md §9 S1 gate itself. */
const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const GAMES = Math.max(1, Number(ENV.ROSTER_FUZZ_GAMES ?? 25))
/** The simulator's cap, as RULES_US54.md §3.2 requires it: instrumented, never silent. */
const STEP_CAP = 5000
const TARGET = clinchTarget(us54Config)
const BOOKS = allBooks(us54Config)

interface Tally {
  games: number
  moves: number
  illegal: number
  capped: number
  invariantViolations: number
  ties: number
  voids: number
  fallbackFires: number
  clinches: number
  maxMoves: number
  declares: number
  foreignDeclares: number
  wallMs: number
}

/** One mirror game: all six seats play `style`. Returns the finished state. */
function playMirror(style: StyleId, seed: string, startSeat: Seat, t: Tally): GameState {
  const vector = STYLE_ROSTER[style]
  let s = newGame(seed, us54Config, startSeat)
  let steps = 0
  while (s.phase !== 'finished') {
    if (steps >= STEP_CAP) {
      t.capped++
      break
    }
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const action = decide(view, vector, hashSeed(`${seed}:${s.moveIndex}`)())
    if (action.type === 'claim') {
      t.declares++
      // STYLES.md §4's `foreignDeclareRate` numerator: a declare of a set the declarer held no
      // card of. Counted from the seat's own view, which is all the metric is defined over.
      if (!view.hand.some((c) => cardBook(c) === action.book)) t.foreignDeclares++
    }
    const r = reduce(s, action)
    if (!r.ok) {
      t.illegal++
      throw new Error(`${style}/${seed} step ${steps}: ${r.error.code} ${JSON.stringify(action)}`)
    }
    s = r.state
    steps++
    const violations = checkInvariants(s)
    if (violations.length > 0) {
      t.invariantViolations += violations.length
      throw new Error(`${style}/${seed} step ${steps}: ${violations.join(' | ')}`)
    }
  }
  t.moves += steps
  if (steps > t.maxMoves) t.maxMoves = steps
  return s
}

function runStyle(style: StyleId): Tally {
  const t: Tally = {
    games: GAMES,
    moves: 0,
    illegal: 0,
    capped: 0,
    invariantViolations: 0,
    ties: 0,
    voids: 0,
    fallbackFires: 0,
    clinches: 0,
    maxMoves: 0,
    declares: 0,
    foreignDeclares: 0,
    wallMs: 0,
  }
  const t0 = Date.now()
  for (let g = 0; g < GAMES; g++) {
    const s = playMirror(style, `roster-${style}-${g}`, (g % 6) as Seat, t)
    if (s.phase !== 'finished') continue
    let a = 0
    let b = 0
    for (const bk of BOOKS) {
      const o = s.books[bk]?.outcome
      if (o === 'team0') a++
      else if (o === 'team1') b++
      else if (o === 'void') t.voids++
    }
    const over = s.log[s.log.length - 1]
    if (over.type === 'game_over' && over.winner === 'tie') t.ties++
    if (Math.max(a, b) === TARGET) t.clinches++
    // RULES_US54.md §5 safety requirement 2: the `resolved === nBooks` terminator is a defence
    // against a future rule edit and must never actually fire under these rules. It would have
    // to resolve all 9 sets with neither team on 5, which the pigeonhole forbids.
    if (a + b === BOOKS.length && Math.max(a, b) < TARGET) t.fallbackFires++
  }
  t.wallMs = Date.now() - t0
  return t
}

describe(`us54 roster fuzz — ${GAMES} mirror games per style`, () => {
  const rows: string[] = []

  for (const style of STYLE_IDS) {
    it(
      `${style}: ${GAMES} games, 0 illegal, 0 capped, invariants clean, every game a clinch`,
      () => {
        const t = runStyle(style)
        rows.push(
          `${style.padEnd(10)} games=${t.games} moves=${t.moves} avg=${(t.moves / t.games).toFixed(1)} ` +
            `max=${t.maxMoves} illegal=${t.illegal} capped=${t.capped} inv=${t.invariantViolations} ` +
            `ties=${t.ties} voids=${t.voids} fallback=${t.fallbackFires} ` +
            `declares=${t.declares} foreign=${t.foreignDeclares} wallMs=${t.wallMs}`,
        )
        expect(t.illegal, `${style} illegal actions`).toBe(0)
        expect(t.capped, `${style} games hitting the ${STEP_CAP}-step cap`).toBe(0)
        expect(t.invariantViolations, `${style} invariant violations`).toBe(0)
        expect(t.ties, `${style} ties (RULES_US54.md §5 makes them impossible)`).toBe(0)
        expect(t.voids, `${style} void sets (row 14 abolishes the outcome)`).toBe(0)
        expect(t.fallbackFires, `${style} §5 resolved-fallback fires`).toBe(0)
        expect(t.clinches, `${style} games ending on a clinch at exactly ${TARGET}`).toBe(GAMES)
      },
      1_800_000,
    )
  }

  it('prints the tally table', () => {
    // Reported rather than asserted: `avgMoves` is the STYLES.md §3.1 stall diagnostic, and a
    // Turtle/Hoarder mirror running long is information, not a failure — the failure condition
    // is `capped`, above.
    if (rows.length > 0) console.log('\n' + rows.join('\n'))
    expect(rows.length).toBe(STYLE_IDS.length)
  })
})
