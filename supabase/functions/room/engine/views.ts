// GENERATED FILE — DO NOT EDIT.
// Copied verbatim from lib/engine/views.ts by scripts/sync-room-engine.mjs.
// Edit the original and re-run the script; tests/room/engine-copy.test.ts enforces the match.

/**
 * Read-only projections. publicView never exposes any hand card identity;
 * seatView adds exactly the viewer's own hand.
 */
import type { Card, GameState, PublicState, Seat } from './types.ts'

/** The shared public table state: counts, score, resolved books, log — no hands. */
export function publicView(s: GameState): PublicState {
  return {
    phase: s.phase,
    turn: s.turn,
    counts: s.hands.map((h) => h.length),
    score: [s.score[0], s.score[1]],
    books: s.books,
    log: s.log,
    moveIndex: s.moveIndex,
    config: s.config,
    // `us54` only, and public by construction: whose declare option it is has to be visible
    // for a client to know who moves next, and it reveals nothing hidden (RULES_US54.md §3).
    // Under `pagat48` the field is absent on the state and stays absent here.
    ...(s.declareWindow ? { declareWindow: s.declareWindow } : {}),
  }
}

/** Public state plus the viewing seat's own hand (a copy). */
export function seatView(s: GameState, seat: Seat): PublicState & { seat: Seat; hand: Card[] } {
  return {
    ...publicView(s),
    seat,
    hand: [...s.hands[seat]],
  }
}
