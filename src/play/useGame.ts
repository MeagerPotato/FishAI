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
 * One VISIBLE step per timer tick, never a synchronous run to the end of the game: after every
 * state change this hook's one effect asks `advance` for the next step, and
 *
 *   · a bot's material move is precomputed (the engine is microsecond-fast) and applied on a
 *     timeout — long enough to read the sentence it produces in the log;
 *   · a declare window is ONE step, not six. RULES_US54.md §3 opens a window after every single
 *     action and the six seats decline round it; ticking those out individually rewrote the
 *     status line about eight times a second and strobed the table for no information at all,
 *     since a decline emits nothing. `advance` folds every consecutive decline into a single
 *     application, so the window costs one quiet beat. The state sequence is unchanged —
 *     `reduce` is pure and each fold recomputes `decide` against the intermediate state — so
 *     the game is the same game, at a cadence a human can follow;
 *   · the HUMAN's declare-window offers fold into that same quiet step unless the standing
 *     "Declare" control is armed, in which case the fold stops there and the dialog opens;
 *   · a `MUST_DECLARE` position (§3.2: `decline` is illegal while the turn-holder has no legal
 *     ask) force-opens the dialog whether armed or not — `legalActionsSummary` drops `decline`
 *     from the offered kinds in exactly that position, so the hook never schedules an action
 *     the reducer would refuse.
 *
 * ## Pace
 *
 * Three states, because the only control used to be one that made an already-fast table faster.
 * `normal` is the readable cadence, `fast` drops it to zero for a player who wants the result,
 * and `paused` schedules nothing at all — `step()` then applies exactly one visible step, so a
 * player can walk the game forward at their own speed. `step()` and the effect share one pure
 * `advance`, so stepping and running produce the identical sequence.
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

/**
 * Visible-step cadence. A material move produces a sentence in the log, and 500 ms was half a
 * second to read one; 1,200 ms is reading speed. A folded declare window emits nothing at all,
 * so it only needs to register as a beat. Fast-forward is ~0 for both.
 */
const MOVE_MS = 1200
const WINDOW_MS = 420
const FAST_MS = 0

/** How the table advances itself: held, readable, or as fast as the engine will go. */
export type Pace = 'paused' | 'normal' | 'fast'

export const PACES: readonly Pace[] = ['paused', 'normal', 'fast']

export interface GameFault {
  seat: Seat
  action: GameAction
  error: EngineError
}

interface Advance {
  /** The state after one visible step — one material move, or one folded declare window. */
  next: GameState
  /** True when the step was a run of declines rather than a material move. */
  quiet: boolean
}

interface AdvanceInputs {
  mode: PlayMode
  seed: string
  stylesKey: string
  bits: number | null
  /** The human's standing Declare control: armed stops a fold at the human's own offer. */
  armed: boolean
}

/** The action a seat would take at this state, or `null` where the table waits on the human. */
function nextAction(state: GameState, io: AdvanceInputs): GameAction | null {
  const { seat: acting, kinds } = legalActionsSummary(state)
  if (acting === 0) {
    // The human's own window offer is the only thing the table plays for them, and only while
    // the Declare control is down. Every other human decision waits for the UI.
    if (state.declareWindow && !io.armed && kinds.includes('decline'))
      return { type: 'decline', seat: 0 }
    return null
  }
  const styles = io.stylesKey.split(',') as StyleId[]
  return decide(
    seatView(state, acting),
    policyForSeat(io.mode, acting, styles, io.bits),
    hashSeed(`${io.seed}:${state.moveIndex}`)(),
  )
}

/**
 * One visible step from `state`, or `null` where the table is waiting on the human.
 *
 * Pure: same state and inputs, same result — which is what lets `step()` and the timer loop
 * share it without the two being able to disagree. A refused action comes back as a fault
 * rather than a throw, exactly as `reduce` hands it over.
 */
export function advance(
  state: GameState,
  io: AdvanceInputs,
): Advance | { fault: GameFault } | null {
  const first = nextAction(state, io)
  if (first === null) return null

  const applied = reduce(state, first)
  if (!applied.ok)
    return { fault: { seat: legalActionsSummary(state).seat, action: first, error: applied.error } }

  // A material move is its own step. A decline is not: fold the whole window into this one.
  if (first.type !== 'decline') return { next: applied.state, quiet: false }

  let cursor = applied.state
  for (;;) {
    if (cursor.phase === 'finished' || !cursor.declareWindow) break
    const action = nextAction(cursor, io)
    // `null` is the human holding an armed or forced offer — the fold stops and the dialog opens.
    if (action === null || action.type !== 'decline') break
    const result = reduce(cursor, action)
    if (!result.ok)
      return {
        fault: { seat: legalActionsSummary(cursor).seat, action, error: result.error },
      }
    cursor = result.state
  }
  return { next: cursor, quiet: true }
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
  /** How the table advances itself. `paused` schedules nothing; `step` walks it by hand. */
  pace: Pace
  setPace: (pace: Pace) => void
  /** Apply exactly one visible step. Only meaningful while paused; a no-op when it is not. */
  step: () => void
  /** True while the table has a step of its own to take — i.e. `step` would do something. */
  canStep: boolean
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
  const [pace, setPace] = useState<Pace>('normal')

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

  // The next step is DERIVED, not stored — including a fault. A fault is a pure function of the
  // position (the engine refused what a bot's own policy chose there), so keeping it in state
  // would be caching a value that can always be recomputed, and the only way to write it would
  // be a setState inside the drive effect. Nothing advances past a fault, so a derived one is
  // just as sticky as a stored one was.
  const io = { mode, seed, stylesKey, bits, armed }
  const pending = finished ? null : advance(state, io)
  const fault = pending !== null && 'fault' in pending ? pending.fault : null
  const canStep = pending !== null && !('fault' in pending)

  // The drive loop: exactly one scheduled step at a time, cleared on any state change. Paused
  // schedules nothing — `step` below is then the only thing that moves the table.
  useEffect(() => {
    if (state.phase === 'finished' || pace === 'paused') return
    const result = advance(state, { mode, seed, stylesKey, bits, armed })
    if (result === null || 'fault' in result) return
    const at = state.moveIndex
    const delay = pace === 'fast' ? FAST_MS : result.quiet ? WINDOW_MS : MOVE_MS
    const timer = setTimeout(() => {
      setState((prev) => (prev.moveIndex === at ? result.next : prev))
    }, delay)
    return () => {
      clearTimeout(timer)
    }
  }, [state, armed, pace, mode, seed, stylesKey, bits])

  /** One visible step, applied now. The same `advance` the loop uses, without the timer. */
  const step = () => {
    if (finished) return
    const result = advance(state, io)
    if (result === null || 'fault' in result) return
    setState(result.next)
  }

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
    pace,
    setPace,
    step,
    canStep,
    act,
    standDown,
    fault,
  }
}
