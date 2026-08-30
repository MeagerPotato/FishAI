/**
 * useGame — one us54 game, owned by React state, human at seat 0, bots at seats 1–5.
 *
 * ## Determinism
 *
 * The deal comes from `newGame(seed, us54Config, 0)` and every bot decision from
 * `decide(seatView(state, seat), policyForSeat(...), hashSeed(`${seed}:${moveIndex}`)())` —
 * the EXACT seeding convention the simulation lab uses, so a game at this table is reproducible
 * from its URL and, given the same human actions, move-for-move identical on every visit. The
 * only non-determinism at the table is the human. The v0.5 memory budget (`bits`) rides into
 * `policyForSeat` and nowhere else — a bounded seat is the same pure decide over a restricted
 * knowledge, so the determinism story is unchanged.
 *
 * ## The drive loop
 *
 * One action per timer tick, never a synchronous loop: after every state change this hook's one
 * effect looks at `legalActionsSummary(state)`, and
 *
 *   · a bot's move is precomputed (the engine is microsecond-fast) and applied on a timeout —
 *     ~500 ms for material moves so the game is watchable, ~120 ms for declines so the six-seat
 *     declare window does not drag, both near 0 with fast-forward on;
 *   · the HUMAN's declare-window offers are auto-declined on the fast cadence — RULES_US54.md §3
 *     opens a window after every action, and a table that stopped for six explicit "no thanks"
 *     clicks per action would be unplayable — unless the standing "Declare" control is armed,
 *     in which case the dialog opens at the next offer instead;
 *   · a `MUST_DECLARE` position (§3.2: `decline` is illegal while the turn-holder has no legal
 *     ask) force-opens the dialog whether armed or not — `legalActionsSummary` drops `decline`
 *     from the offered kinds in exactly that position, so the hook never schedules an action
 *     the reducer would refuse.
 *
 * Staleness is handled twice over: any state change re-runs the effect and clears the pending
 * timer, and the applier itself is a pure functional update that no-ops unless `moveIndex`
 * still matches the state the action was computed against. A human click can therefore never
 * race a queued bot move into an illegal application.
 *
 * `reduce` never throws — an illegal action comes back `{ok: false}`. For the human that result
 * is returned to the caller (the dialogs surface it); for a bot it would mean the engine and its
 * own policy disagree, which is recorded as a `fault` and shown rather than papered over.
 */
import { useEffect, useState } from 'react'
import type {
  EngineError,
  GameAction,
  GameState,
  ReduceResult,
  Seat,
  SeatView,
  StyleId,
} from '../../lib/engine/index.ts'
import {
  allBooks,
  decide,
  hashSeed,
  legalActionsSummary,
  newGame,
  reduce,
  seatView,
  us54Config,
} from '../../lib/engine/index.ts'
import type { PlayMode } from './policies.ts'
import { policyForSeat } from './policies.ts'

/** Visible-move cadence. Asks and declares at reading speed; declines quick; fast-forward ~0. */
const MOVE_MS = 500
const DECLINE_MS = 120
const FAST_MS = 0

export interface GameFault {
  seat: Seat
  action: GameAction
  error: EngineError
}

export interface Game {
  state: GameState
  /** The human's view — everything seat 0 is allowed to know, and all any dialog reads. */
  view: SeatView
  /** Whose move it is and what kinds are legal — under us54 the declare-window option holder. */
  acting: Seat
  kinds: readonly ('ask' | 'claim' | 'pass' | 'designate' | 'decline')[]
  /** Sets banked per team. The clinch counts these, never `score` (RULES_US54.md §5). */
  sets: [number, number]
  unresolved: number
  finished: boolean
  winner: 0 | 1 | null
  /** True while a declare window is open at seat 0 with `decline` illegal (§3.2). */
  mustDeclare: boolean
  /** True while the declare dialog should be open for the human. */
  declareOpen: boolean
  /** The standing "Declare" control: armed = take the next offer instead of declining it. */
  armed: boolean
  setArmed: (on: boolean) => void
  fast: boolean
  setFast: (on: boolean) => void
  /** Apply a human action. The result is the engine's own; dialogs surface `ok: false`. */
  act: (action: GameAction) => ReduceResult
  /** Decline the current offer and stand the Declare control down (the dialog's cancel). */
  standDown: () => void
  fault: GameFault | null
}

function tallySets(state: GameState): { sets: [number, number]; unresolved: number } {
  let a = 0
  let b = 0
  let resolved = 0
  for (const book of allBooks(state.config)) {
    const result = state.books[book]
    if (!result) continue
    resolved++
    if (result.outcome === 'team0') a++
    else if (result.outcome === 'team1') b++
  }
  return { sets: [a, b], unresolved: allBooks(state.config).length - resolved }
}

export function useGame(mode: PlayMode, seed: string, stylesKey: string, bits: number | null): Game {
  const [state, setState] = useState<GameState>(() => newGame(seed, us54Config, 0))
  const [armed, setArmed] = useState(false)
  const [fast, setFast] = useState(false)
  const [fault, setFault] = useState<GameFault | null>(null)

  // All derived values are recomputed per render; every function here is pure and cheap, and
  // hand-memoising them is exactly what the React Compiler lint forbids (see LabReplay.tsx:60).
  const summary = legalActionsSummary(state)
  const view = seatView(state, 0)
  const { sets, unresolved } = tallySets(state)
  const finished = state.phase === 'finished'
  const winner: 0 | 1 | null = !finished ? null : sets[0] > sets[1] ? 0 : 1
  const windowOpen = Boolean(state.declareWindow) && !finished
  const humanOption = windowOpen && summary.seat === 0
  const mustDeclare = humanOption && !summary.kinds.includes('decline')
  const declareOpen = humanOption && (armed || mustDeclare)

  // The drive loop: exactly one scheduled action at a time, cleared on any state change.
  useEffect(() => {
    if (state.phase === 'finished' || fault) return
    const { seat: acting, kinds } = legalActionsSummary(state)
    const at = state.moveIndex

    /** Precompute the result, then apply it only if the state has not moved on. */
    const schedule = (action: GameAction, delay: number): (() => void) | undefined => {
      const result = reduce(state, action)
      if (!result.ok) {
        setFault({ seat: acting, action, error: result.error })
        return undefined
      }
      const timer = setTimeout(() => {
        setState((prev) => (prev.moveIndex === at ? result.state : prev))
      }, delay)
      return () => {
        clearTimeout(timer)
      }
    }

    if (acting === 0) {
      // The human's window offer: auto-decline unless armed. Every other human move waits for
      // the UI — the effect schedules nothing and the dialogs/panels call `act`.
      if (state.declareWindow && !armed && kinds.includes('decline')) {
        return schedule({ type: 'decline', seat: 0 }, fast ? FAST_MS : DECLINE_MS)
      }
      return
    }

    const styles = stylesKey.split(',') as StyleId[]
    const botView = seatView(state, acting)
    const botSeed = hashSeed(`${seed}:${state.moveIndex}`)()
    const action = decide(botView, policyForSeat(mode, acting, styles, bits), botSeed)
    const delay = fast ? FAST_MS : action.type === 'decline' ? DECLINE_MS : MOVE_MS
    return schedule(action, delay)
  }, [state, armed, fast, fault, mode, seed, stylesKey, bits])

  const act = (action: GameAction): ReduceResult => {
    const result = reduce(state, action)
    if (result.ok) {
      setState(result.state)
      // A successful human declare consumes the armed control; the next offer auto-declines.
      if (action.type === 'claim') setArmed(false)
    }
    return result
  }

  const standDown = () => {
    setArmed(false)
    if (humanOption && !mustDeclare) {
      const result = reduce(state, { type: 'decline', seat: 0 })
      if (result.ok) setState(result.state)
    }
  }

  return {
    state,
    view,
    acting: summary.seat,
    kinds: summary.kinds,
    sets,
    unresolved,
    finished,
    winner,
    mustDeclare,
    declareOpen,
    armed,
    setArmed,
    fast,
    setFast,
    act,
    standDown,
    fault,
  }
}
