/**
 * Replay — BOT_LAB.md §7.1's *"replays store actions, not states"*.
 *
 * The artifact carries `seed`, `startSeat` and a `GameAction[]`. Everything else on
 * `/lab/replay/:id` is reconstructed here by running the SHIPPED reducer over that list, one
 * action at a time. Nothing is read back out of the artifact: if `reduce()` and the stored log
 * ever diverged, this page would show the divergence rather than paper over it, which is the
 * whole reason the artifact is small.
 *
 * Only the PUBLIC projection is kept per frame. `publicView` is the same function the live table
 * uses and it exposes no hand card identity, so a replay reader sees exactly what a seat at the
 * table would have seen, plus the per-seat counts row 17 makes public.
 */

import {
  newGame,
  publicView,
  reduce,
  us54Config,
  type EngineError,
  type GameAction,
  type PublicEvent,
  type PublicState,
} from '../../lib/engine/index.ts'
import type { ReplayRecord } from './artifact.ts'

export interface Frame {
  /** 0 is the deal, before any action. */
  step: number
  /** The action that produced this frame, or `null` for the deal. */
  action: GameAction | null
  /** Events emitted by that one action. */
  events: PublicEvent[]
  view: PublicState
  /** Sets awarded so far, per team. `score` counts points; the clinch counts SETS. */
  sets: [number, number]
  /** Sets neither team has resolved yet. A clinched game always finishes with some. */
  unresolved: number
}

export interface Replay {
  record: ReplayRecord
  frames: Frame[]
  /**
   * Set when the stored action list stopped being legal. The message is the engine's own, and
   * the page prints it rather than truncating the replay silently.
   */
  error: { step: number; action: GameAction; engine: EngineError } | null
  /** Steps whose action is not a `decline` — the material moves worth stepping between. */
  material: number[]
}

const NBOOKS = 9

function tally(view: PublicState): { sets: [number, number]; unresolved: number } {
  let a = 0
  let b = 0
  for (const result of Object.values(view.books)) {
    if (!result) continue
    if (result.outcome === 'team0') a++
    else if (result.outcome === 'team1') b++
  }
  return { sets: [a, b], unresolved: NBOOKS - Object.keys(view.books).length }
}

/**
 * Run the record through `reduce()`. Pure and synchronous — a 650-action us54 game is a few
 * milliseconds, and the engine's structural sharing keeps 650 retained frames cheap.
 */
export function replayGame(record: ReplayRecord): Replay {
  let state = newGame(record.seed, us54Config, record.startSeat)
  const first = publicView(state)
  const frames: Frame[] = [
    { step: 0, action: null, events: state.log.slice(), view: first, ...tally(first) },
  ]
  const material: number[] = []
  let error: Replay['error'] = null

  for (const [i, action] of record.actions.entries()) {
    const before = state.log.length
    const result = reduce(state, action)
    if (!result.ok) {
      error = { step: i + 1, action, engine: result.error }
      break
    }
    state = result.state
    const view = publicView(state)
    frames.push({
      step: i + 1,
      action,
      events: state.log.slice(before),
      view,
      ...tally(view),
    })
    if (action.type !== 'decline') material.push(i + 1)
  }

  return { record, frames, error, material }
}

/** One line of engineering-drawing copy per action. Short enough for a dense list. */
export function describeAction(action: GameAction | null): string {
  if (!action) return 'DEAL · 9 CARDS TO EACH OF 6 SEATS'
  switch (action.type) {
    case 'ask':
      return `SEAT ${action.seat} ASKS SEAT ${action.target} FOR ${action.card}`
    case 'claim':
      return `SEAT ${action.seat} DECLARES ${action.book}`
    case 'pass':
      return `SEAT ${action.seat} PASSES THE TURN TO SEAT ${action.to}`
    case 'designate':
      return `SEAT ${action.seat} DESIGNATES SEAT ${action.to}`
    case 'decline':
      return `SEAT ${action.seat} DECLINES THE DECLARE OPTION`
    default:
      return 'UNKNOWN ACTION'
  }
}

/** One line per public event, in the register the live table's log uses. */
export function describeEvent(event: PublicEvent): string {
  switch (event.type) {
    case 'game_started':
      return `Game starts at seat ${event.startingSeat}.`
    case 'ask':
      return (
        `Seat ${event.asker} asked seat ${event.target} for ${event.card} — ` +
        (event.hit ? 'hit; the card transfers and the turn is kept.' : 'miss; the turn passes.')
      )
    case 'claim': {
      const who = event.outcome === 'team0' ? 'team 0' : event.outcome === 'team1' ? 'team 1' : 'nobody'
      return `Seat ${event.claimer} declared ${event.book} — ${who} scores the set.`
    }
    case 'pass':
      return `Seat ${event.from} passed the turn to seat ${event.to}.`
    case 'designate':
      return `Seat ${event.from} designated seat ${event.to}.`
    case 'player_out':
      return `Seat ${event.seat} is out of cards.`
    case 'endgame':
      return `Endgame: team ${event.claimingTeam} must resolve the remaining sets.`
    case 'game_over':
      return `Game over — score ${event.score[0]}–${event.score[1]}, winner ${String(event.winner)}.`
    default:
      return 'Unrecognised event.'
  }
}

/** Team of a seat: `seat % 2`, seats 0/2/4 against 1/3/5. */
export const teamOf = (seat: number): 0 | 1 => (seat % 2) as 0 | 1
