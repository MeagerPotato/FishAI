/**
 * log-view.test.ts — the two-ask rule, pinned so it cannot be "simplified" into `slice(-2)`.
 *
 * The printed rulebook allows a player to be reminded of the previous two ASKS and nothing
 * older. It does not ask anyone to forget the board: a resolved set is six cards physically
 * claimed, an emptied seat is visibly empty, and both stay in front of everyone for the rest of
 * the game. `visibleEvents` therefore withholds exactly one thing, and the tests below are
 * written to fail loudly for the two ways a shorter implementation gets it wrong — hiding old
 * declares, and spending one of the two remembered slots on a non-ask.
 *
 * The last block drives real games through the reducer rather than hand-building events, so the
 * rule is checked against logs the engine actually produces, in the proportions it produces
 * them.
 */
import { describe, expect, it } from 'vitest'
import type { Card, PublicEvent, Seat } from '../../lib/engine/index.ts'
import {
  decide,
  hashSeed,
  legalActionsSummary,
  newGame,
  reduce,
  seatView,
  us54Config,
} from '../../lib/engine/index.ts'
import { ADAPTIVE_POLICY } from '../../src/play/policies.ts'
import { RECENT_ASKS, visibleEvents } from '../../src/play/PublicLog.tsx'

const NO_CARDS = {} as Record<Card, Seat>

const ask = (asker: Seat, hit: boolean): PublicEvent => ({
  type: 'ask',
  asker,
  target: asker === 0 ? 1 : 0,
  card: '9H',
  hit,
})

const declare = (claimer: Seat): PublicEvent => ({
  type: 'claim',
  claimer,
  book: 'LOW-H',
  assignments: NO_CARDS,
  actualHolders: NO_CARDS,
  outcome: 'team0',
})

describe('visibleEvents — "all" is the whole log', () => {
  it('returns every event, in engine order, with its own index', () => {
    const log = [ask(0, true), declare(0), ask(1, false), ask(2, true)]
    const rows = visibleEvents(log, 'all')
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2, 3])
    expect(rows.map((r) => r.event)).toEqual(log)
  })
})

describe('visibleEvents — "recent" withholds old ASKS and nothing else', () => {
  it('keeps every ask while there are only two of them', () => {
    const log = [ask(0, true), ask(1, false)]
    expect(visibleEvents(log, 'recent')).toHaveLength(2)
  })

  it('keeps exactly the last two asks once there are more', () => {
    const log = [ask(0, true), ask(1, false), ask(2, true), ask(3, false), ask(4, true)]
    expect(visibleEvents(log, 'recent').map((r) => r.index)).toEqual([3, 4])
  })

  it('keeps a declare from the very start of the game — the board is not memory', () => {
    const log = [declare(0), ask(1, true), ask(2, false), ask(3, true), ask(4, false)]
    const kept = visibleEvents(log, 'recent')
    // The declare survives at index 0; only the two newest asks come with it.
    expect(kept.map((r) => r.index)).toEqual([0, 3, 4])
    expect(kept[0].event.type).toBe('claim')
  })

  it('does not spend a remembered slot on a non-ask — the trap `slice(-2)` falls into', () => {
    // Newest-last: ask, ask, declare. A naive tail of two would show ONE ask and the declare,
    // leaving a player entitled to two asks able to see one.
    const log = [ask(0, true), ask(1, false), declare(2)]
    const kept = visibleEvents(log, 'recent')
    expect(kept.filter((r) => r.event.type === 'ask')).toHaveLength(2)
    expect(kept).toHaveLength(3)
  })

  it('keeps the game-start and out-of-cards notices however old', () => {
    const log: PublicEvent[] = [
      { type: 'game_started', startingSeat: 0 },
      { type: 'player_out', seat: 4 },
      ask(0, true),
      ask(1, false),
      ask(2, true),
    ]
    const kept = visibleEvents(log, 'recent')
    expect(kept.map((r) => r.event.type)).toEqual(['game_started', 'player_out', 'ask', 'ask'])
  })

  it('preserves original indices, so the gap it leaves is visible in the numbering', () => {
    const log = [ask(0, true), ask(1, false), ask(2, true), ask(3, false)]
    expect(visibleEvents(log, 'recent').map((r) => r.index)).toEqual([2, 3])
  })

  it('is a no-op on an empty log rather than reaching past the start of it', () => {
    expect(visibleEvents([], 'recent')).toEqual([])
  })
})

describe('visibleEvents — over logs the engine actually produces', () => {
  /** One whole adaptive-vs-adaptive game, driven the way useGame drives the table. */
  function playOut(seed: string): PublicEvent[] {
    let state = newGame(seed, us54Config, 0)
    for (let i = 0; i < 4000 && state.phase !== 'finished'; i++) {
      const { seat } = legalActionsSummary(state)
      const action = decide(
        seatView(state, seat),
        ADAPTIVE_POLICY,
        hashSeed(`${seed}:${state.moveIndex}`)(),
      )
      const result = reduce(state, action)
      if (!result.ok) break
      state = result.state
    }
    return state.log
  }

  for (const seed of ['logview-a', 'logview-b', 'logview-c']) {
    it(`holds both properties over a real game (seed ${seed})`, () => {
      const log = playOut(seed)
      const allAsks = log.filter((e) => e.type === 'ask')
      // A finished us54 game always has more asks than the rule lets anyone remember, so these
      // seeds are genuinely exercising the withholding rather than the two-or-fewer shortcut.
      expect(allAsks.length).toBeGreaterThan(RECENT_ASKS)

      const kept = visibleEvents(log, 'recent')
      expect(kept.filter((r) => r.event.type === 'ask')).toHaveLength(RECENT_ASKS)

      // Every non-ask event survives, whatever its age.
      const keptOther = kept.filter((r) => r.event.type !== 'ask').map((r) => r.index)
      const allOther = log
        .map((event, index) => ({ event, index }))
        .filter((r) => r.event.type !== 'ask')
        .map((r) => r.index)
      expect(keptOther).toEqual(allOther)
    })
  }
})
