/**
 * Shared helpers for the bot test suites: deterministic position generation
 * (via the engine fuzz policy) and hand-crafted SeatView fabrication.
 */
import {
  decide,
  defaultConfig,
  hashSeed,
  legalActionsSummary,
  newGame,
  reduce,
  rngFromSeed,
  seatView,
} from '../../lib/engine/index.ts'
import type {
  Card,
  GameState,
  PublicEvent,
  RulesConfig,
  Seat,
  SeatView,
} from '../../lib/engine/index.ts'
import { policyAction } from '../engine/policy.ts'

/**
 * A deterministic stream of `count` reachable positions sampled from seeded
 * random-policy games. Rare phases (awaitPass / awaitDesignate / endgame) are
 * always kept; 'playing' states are sampled so positions span the whole game.
 */
export function collectPositions(count: number): GameState[] {
  const out: GameState[] = []
  for (let g = 0; out.length < count && g < count * 3 + 50; g++) {
    const seed = `botpos-${g}`
    const rng = rngFromSeed(`${seed}:policy`)
    const sample = rngFromSeed(`${seed}:sample`)
    let state = newGame(seed)
    let steps = 0
    while (state.phase !== 'finished' && steps < 5000 && out.length < count) {
      const r = reduce(state, policyAction(state, rng))
      if (!r.ok) throw new Error(`collectPositions: policy rejected (${r.error.code})`)
      state = r.state
      steps++
      const rare = state.phase !== 'playing' && state.phase !== 'finished'
      if (rare || (state.phase === 'playing' && sample() < 0.08)) out.push(state)
    }
  }
  if (out.length < count) throw new Error(`collectPositions: only ${out.length}/${count} positions`)
  return out
}

/**
 * Every acting seat's view along `games` complete hard-vs-hard bot games, under either rule set.
 *
 * A *better* position source than `collectPositions` for style work. The random fuzz policy
 * wanders into positions no competent seat ever reaches, and under `us54` it produces almost
 * nothing but declare windows in which every style trivially declines — so a style scan over
 * those positions reports "no style ever does anything different" and is simply wrong. These are
 * the positions the policy layer actually has to make decisions in.
 *
 * The mover is the turn-holder under `pagat48` and the declare-option holder inside a
 * RULES_US54.md §3 window; `legalActionsSummary` names it for both.
 */
export function collectBotViews(
  games: number,
  config?: RulesConfig,
): { state: GameState; view: SeatView; seed: number }[] {
  const out: { state: GameState; view: SeatView; seed: number }[] = []
  for (let g = 0; g < games; g++) {
    const gameSeed = `botviews-${config?.variant ?? 'pagat48'}-${g}`
    let state = newGame(gameSeed, config, (g % 6) as Seat)
    let steps = 0
    while (state.phase !== 'finished' && steps < 5000) {
      const { seat } = legalActionsSummary(state)
      const view = seatView(state, seat)
      const seed = hashSeed(`${gameSeed}:${state.moveIndex}`)()
      out.push({ state, view, seed })
      const r = reduce(state, decide(view, 'hard', seed))
      if (!r.ok) throw new Error(`collectBotViews: hard tier rejected (${r.error.code})`)
      state = r.state
      steps++
    }
  }
  return out
}

/** Phase histogram of a position set (used to pin coverage in assertions). */
export function phaseCounts(positions: readonly GameState[]): Record<string, number> {
  const c: Record<string, number> = {}
  for (const p of positions) c[p.phase] = (c[p.phase] ?? 0) + 1
  return c
}

/** Fabricate a SeatView directly (for scripted knowledge scenarios). */
export function mkView(v: {
  seat: Seat
  hand: Card[]
  counts: number[]
  log: PublicEvent[]
  turn?: Seat
  phase?: SeatView['phase']
  books?: SeatView['books']
  score?: [number, number]
  /** Defaults to the 48-card `pagat48` rule set; pass `us54Config` for the variant. */
  config?: SeatView['config']
  /** RULES_US54.md §3. Only ever set under `us54`; the key is omitted when absent. */
  declareWindow?: SeatView['declareWindow']
}): SeatView {
  return {
    phase: v.phase ?? 'playing',
    turn: v.turn ?? v.seat,
    counts: v.counts,
    score: v.score ?? [0, 0],
    books: v.books ?? {},
    log: v.log,
    moveIndex: Math.max(0, v.log.length - 1),
    config: v.config ?? defaultConfig,
    seat: v.seat,
    hand: v.hand,
    ...(v.declareWindow ? { declareWindow: v.declareWindow } : {}),
  }
}

export const gs: PublicEvent = { type: 'game_started', startingSeat: 0 }

export function ask(asker: Seat, target: Seat, card: Card, hit: boolean): PublicEvent {
  return { type: 'ask', asker, target, card, hit }
}
