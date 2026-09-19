/**
 * mixed-stub.ts: the mixed stub of ATHENA.md §4.3, which is G0a's population H5 and G0b's stub.
 *
 * Its rule is the scoping prototype's `--mode mixed`, restated line for line from
 * `C:/Projects/FishAI-bench/athena/p0-scoping/bench/p0-throughput.mjs` (`mixedStub`, `oracleStub`, `randomStub`,
 * `randomDeclare`), draw for draw, so a game's actions depend only on its seed and start seat:
 *
 * - At a window offer, with probability EPS = 0.01 (one draw, taken only while a window is open), a uniformly
 *   random declare: a uniform open set, then a uniform own-team seat for each of its six cards (card order).
 * - Otherwise, at a window offer, the first open set (canonical order) that the offered seat's team holds entirely
 *   is declared correctly, reading the true deal.
 * - Otherwise the offered seat declines when a decline is legal, and makes the random declare when it is not.
 * - In `awaitPass`, a uniform teammate (ascending, not the passer) holding cards.
 * - With the window closed, a uniform ask over `legalAsks` in its order.
 *
 * Draws are `rng()` floats, `Math.floor(rng() * n)`, from `mulberry32(hashSeed(`${seed}:stub`)())`.
 */
import type { BookId, Card, GameAction, GameState, Seat } from '../../lib/engine/types.ts'
import { legalActionsSummary, legalAsks } from '../../lib/engine/helpers.ts'
import { allBooks, bookCards, seatTeam, teamSeats } from '../../lib/engine/cards.ts'
import { hashSeed, mulberry32 } from '../../lib/engine/rng.ts'

export const MIXED_EPS = 0.01

/** The stub's generator for a game seed. */
export function mixedStubRng(seed: string): () => number {
  return mulberry32(hashSeed(`${seed}:stub`)())
}

function randomDeclare(s: GameState, seat: Seat, rng: () => number): GameAction {
  const open = allBooks(s.config).filter((b) => !s.books[b])
  const book: BookId = open[Math.floor(rng() * open.length)]
  const mates = teamSeats(seatTeam(seat))
  const assignments = {} as Record<Card, Seat>
  for (const c of bookCards(book, s.config)) assignments[c] = mates[Math.floor(rng() * 3)]
  return { type: 'claim', seat, book, assignments }
}

function randomStub(s: GameState, seat: Seat, rng: () => number): GameAction {
  if (s.declareWindow) {
    const { kinds } = legalActionsSummary(s)
    if (kinds.includes('decline')) return { type: 'decline', seat }
    return randomDeclare(s, seat, rng)
  }
  if (s.phase === 'awaitPass') {
    const mates = teamSeats(seatTeam(seat)).filter((t) => t !== seat && s.hands[t].length > 0)
    return { type: 'pass', seat, to: mates[Math.floor(rng() * mates.length)] }
  }
  const asks = legalAsks(s, seat)
  const a = asks[Math.floor(rng() * asks.length)]
  return { type: 'ask', seat, target: a.target, card: a.card }
}

function oracleStub(s: GameState, seat: Seat, rng: () => number): GameAction {
  if (s.declareWindow) {
    const mates = teamSeats(seatTeam(seat))
    for (const b of allBooks(s.config)) {
      if (s.books[b]) continue
      const assignments = {} as Record<Card, Seat>
      let ok = true
      for (const c of bookCards(b, s.config)) {
        const h = mates.find((m) => s.hands[m].includes(c))
        if (h === undefined) {
          ok = false
          break
        }
        assignments[c] = h
      }
      if (ok) return { type: 'claim', seat, book: b, assignments }
    }
  }
  return randomStub(s, seat, rng)
}

/** The mixed stub's action for `seat`, the seat whose move it is (`legalActionsSummary(s).seat`). */
export function mixedStubAction(s: GameState, seat: Seat, rng: () => number): GameAction {
  if (s.declareWindow && rng() < MIXED_EPS) return randomDeclare(s, seat, rng)
  return oracleStub(s, seat, rng)
}
