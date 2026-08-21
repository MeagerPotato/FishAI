/**
 * Random-play policies shared by the fuzz, determinism and variant-gate tests.
 * They may read the true state to build actions (the tests' assertions use only
 * engine results), and they only ever emit legal actions.
 *
 * There are two, because the two rule sets have genuinely different move shapes:
 * `policyAction` drives RULES.md (turn-only claims, the endgame cascade) and
 * `us54PolicyAction` drives RULES_US54.md (the §3 declare window and its `decline`).
 * Everything deck-shaped below is read from `state.config`, so neither policy carries a
 * hardcoded 48- or 54-card assumption.
 */
import {
  allBooks,
  bookCards,
  legalAsks,
  randInt,
  seatTeam,
  teamSeats,
  turnHolderCanAsk,
} from '../../lib/engine/index.ts'
import type { Card, GameAction, GameState, Seat } from '../../lib/engine/index.ts'

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[randInt(rng, items.length)]
}

/**
 * A random declare from `seat`, over the sets and cards this config actually defines.
 *
 * `allBooks(defaultConfig)` is the same list `ALL_BOOKS` always was and `bookCards(b, config)`
 * the same membership, in the same order, so the rng is consumed in exactly the same sequence
 * as before this became config-derived: the recorded `pagat48` fuzz and determinism runs are
 * unchanged (verified against the pre-variant engine — see fuzz-variant.test.ts).
 */
function randomClaim(state: GameState, seat: Seat, rng: () => number): GameAction {
  const unresolved = allBooks(state.config).filter((b) => !state.books[b])
  const book = pick(unresolved, rng)
  const team = teamSeats(seatTeam(seat))
  // 50% informed (true holders for own-team cards -> correct/opponent outcomes),
  // 50% uniform over the claimer's team (-> exercises voids under pagat48, and under
  // us54 the RULES_US54.md row 14 "own team, wrong seat" gift to the opponents).
  const informed = rng() < 0.5
  const assignments = {} as Record<Card, Seat>
  for (const c of bookCards(book, state.config)) {
    if (informed) {
      const holder = state.hands.findIndex((h) => h.includes(c)) as Seat
      assignments[c] = seatTeam(holder) === seatTeam(seat) ? holder : pick(team, rng)
    } else {
      assignments[c] = pick(team, rng)
    }
  }
  return { type: 'claim', seat, book, assignments }
}

/** One legal action for the current state under the random RULES.md (`pagat48`) policy. */
export function policyAction(state: GameState, rng: () => number): GameAction {
  const seat = state.turn
  switch (state.phase) {
    case 'awaitPass': {
      const targets = teamSeats(seatTeam(seat)).filter((t) => state.hands[t].length > 0)
      return { type: 'pass', seat, to: pick(targets, rng) }
    }
    case 'awaitDesignate': {
      const opponents = teamSeats(seatTeam(seat) === 0 ? 1 : 0).filter((t) => state.hands[t].length > 0)
      return { type: 'designate', seat, to: pick(opponents, rng) }
    }
    case 'endgame':
      return randomClaim(state, seat, rng)
    case 'playing': {
      const asks = legalAsks(state, seat)
      const p = Math.min(0.02 + state.moveIndex / 1500, 0.6)
      if (asks.length === 0 || rng() < p) return randomClaim(state, seat, rng)
      const a = pick(asks, rng)
      return { type: 'ask', seat, target: a.target, card: a.card }
    }
    case 'finished':
      throw new Error('policyAction called on a finished game')
  }
}

/**
 * One legal action under RULES_US54.md.
 *
 * The move shape differs from `pagat48` in exactly one structural way: whose move it is comes
 * from the §3 declare window when one is open, not from `state.turn`. The option seat then has
 * precisely two choices — declare, or `decline` and pass the option on, and only ONE of them
 * when no ask can follow the window: §3 refuses the decline there (`MUST_DECLARE`), so the
 * option seat must declare. With the window closed a declare is illegal (§3.1 replaces
 * `NOT_YOUR_TURN` with `NO_DECLARE_WINDOW`), so the turn-holder must ask; `reduceDecline`
 * guarantees the window only ever closes into a state where at least one legal ask exists, and
 * the gate asserts that rather than assuming it.
 *
 * `endgame`/`awaitDesignate` are unreachable here (§4) and throw rather than being handled, so
 * that a rule edit which reintroduced them would fail loudly instead of being quietly driven.
 */
export function us54PolicyAction(state: GameState, rng: () => number): GameAction {
  if (state.phase === 'finished') throw new Error('us54PolicyAction called on a finished game')
  if (state.declareWindow) {
    const seat = state.declareWindow.option
    // §3: declining is illegal when no ask can follow this window, so the only move left is the
    // declare that §5's termination argument now rests on. Emitting it here is not the policy
    // being helpful — it is the policy having no alternative.
    if (!turnHolderCanAsk(state)) return randomClaim(state, seat, rng)
    // Declaring is rare on purpose. A high rate ends games in a handful of blind declares and
    // never exercises the long window/ask interleavings the §5 termination argument covers.
    return rng() < 0.12 ? randomClaim(state, seat, rng) : { type: 'decline', seat }
  }
  switch (state.phase) {
    case 'awaitPass': {
      // RULES.md row 20 survives in `us54` only for a turn-holder emptied by their own
      // declare while a teammate still holds cards (RULES_US54.md §4).
      const targets = teamSeats(seatTeam(state.turn)).filter((t) => state.hands[t].length > 0)
      return { type: 'pass', seat: state.turn, to: pick(targets, rng) }
    }
    case 'playing': {
      const asks = legalAsks(state, state.turn)
      if (asks.length === 0)
        throw new Error(`us54: the declare window closed on seat ${state.turn} with no legal ask`)
      const a = pick(asks, rng)
      return { type: 'ask', seat: state.turn, target: a.target, card: a.card }
    }
    default:
      throw new Error(`us54: phase ${state.phase} is pagat48-only (RULES_US54.md §4)`)
  }
}
