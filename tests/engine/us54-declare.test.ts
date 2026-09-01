/**
 * RULES_US54.md §7 vectors 4-9: wrong declares, the declare window (§3), turn semantics
 * (row 16), running out of cards (§4) and the clinch (§5).
 *
 * The scripted states below are hand-built to isolate one rule each, so several are
 * deliberately mid-cascade shapes that `checkInvariants` has no reason to accept; conservation
 * is asserted directly instead, by `conserved()`. The soak at the foot of the file, which
 * plays only real reducer output, does call `checkInvariants` on every state.
 *
 * Whole-game invariant coverage lives in tests/engine/invariants.test.ts and in the §7
 * vector 10 gate, tests/engine/fuzz-variant.test.ts.
 */
import { describe, expect, it } from 'vitest'
import {
  allBooks,
  bookCards,
  checkInvariants,
  clinchTarget,
  deckFor,
  defaultConfig,
  legalActionsSummary,
  legalAsks,
  newGame,
  publicView,
  randInt,
  reduce,
  rngFromSeed,
  rulesFor,
  seatTeam,
  sortHand,
  teamSeats,
  turnHolderCanAsk,
  us54Config,
  validateConfig,
} from '../../lib/engine/index.ts'
import type { BookId, BookResult, Card, GameAction, GameState, Seat } from '../../lib/engine/index.ts'
import { asg } from './util.ts'

const DECK54 = deckFor(us54Config).cards

/* ------------------------------------------------------------- fixtures --- */

function ok(state: GameState, action: GameAction) {
  const r = reduce(state, action)
  if (!r.ok) throw new Error(`expected success, got ${r.error.code}: ${r.error.message}`)
  return r
}

function refuse(state: GameState, action: GameAction) {
  const r = reduce(state, action)
  expect(r.ok).toBe(false)
  if (r.ok) throw new Error('expected failure')
  return r.error
}

/** Named cards to their seats; everything left in `pool` goes round-robin over `rest`. */
function deal(pool: readonly Card[], spec: Partial<Record<Seat, Card[]>>, rest: readonly Seat[]): Card[][] {
  const hands: Card[][] = [[], [], [], [], [], []]
  const placed = new Set<Card>()
  for (const [seatStr, cards] of Object.entries(spec)) {
    const seat = Number(seatStr) as Seat
    for (const c of cards ?? []) {
      hands[seat].push(c)
      placed.add(c)
    }
  }
  let i = 0
  for (const c of pool) {
    if (placed.has(c)) continue
    hands[rest[i % rest.length]].push(c)
    i++
  }
  return hands.map((h) => sortHand(h, us54Config))
}

/** The whole 54-card deck distributed: named cards first, the rest over `rest`. */
function hands54(spec: Partial<Record<Seat, Card[]>>, rest: readonly Seat[] = [0, 1, 2, 3, 4, 5]): Card[][] {
  return deal(DECK54, spec, rest)
}

/** A crafted `us54` game: turn at `turn`, so the declare window opens on `turn` (§3). */
function game54(hands: Card[][], turn: Seat = 0, patch: Partial<GameState> = {}): GameState {
  return { ...newGame('us54-crafted', us54Config, turn), hands, ...patch }
}

/** A resolved set awarded to `team`, for pre-loading a mid-game score. */
function awarded(book: BookId, team: 0 | 1): BookResult {
  const seat: Seat = team === 0 ? 0 : 1
  const map = {} as Record<Card, Seat>
  for (const c of bookCards(book, us54Config)) map[c] = seat
  return { book, outcome: team === 0 ? 'team0' : 'team1', claimer: seat, assignments: map, actualHolders: map }
}

/** Every card of the 54 is in exactly one hand or one resolved set. */
function conserved(s: GameState): boolean {
  const seen = new Set<Card>()
  for (const h of s.hands) for (const c of h) seen.add(c)
  for (const b of allBooks(s.config)) if (s.books[b]) for (const c of bookCards(b, s.config)) seen.add(c)
  const total = s.hands.reduce((n, h) => n + h.length, 0) + Object.keys(s.books).length * 6
  return seen.size === 54 && total === 54
}

/** Decline around the window until `seat` holds the option (RULES_US54.md §3). */
function optionTo(s: GameState, seat: Seat): GameState {
  let cur = s
  for (let i = 0; i < 6; i++) {
    const w = cur.declareWindow
    if (!w) throw new Error('no declare window is open')
    if (w.option === seat) return cur
    cur = ok(cur, { type: 'decline', seat: w.option }).state
  }
  throw new Error(`the option never reached seat ${seat}`)
}

/** Decline from every seat until the window closes; throws if it does not close in one cycle. */
function closeWindow(s: GameState): GameState {
  let cur = s
  for (let i = 0; i < 6; i++) {
    const w = cur.declareWindow
    if (!w) throw new Error('window was already closed')
    cur = ok(cur, { type: 'decline', seat: w.option }).state
  }
  if (cur.declareWindow) throw new Error('window did not close after a full cycle of declines')
  return cur
}

/** LOW-C on team A: 0:{2C,3C}, 2:{4C,5C}, 4:{6C,7C}. */
const LOW_C_ON_TEAM_A = () => ({ 0: ['2C', '3C'] as Card[], 2: ['4C', '5C'] as Card[], 4: ['6C', '7C'] as Card[] })
const LOW_C_CORRECT = () =>
  asg([
    ['2C', 0],
    ['3C', 0],
    ['4C', 2],
    ['5C', 2],
    ['6C', 4],
    ['7C', 4],
  ])
/** The same six cards with 4C and 6C swapped — every card still on team A, two in the wrong hand. */
const LOW_C_SWAPPED = () => ({ ...LOW_C_CORRECT(), '4C': 4 as Seat, '6C': 2 as Seat })

/** HIGH-S on team A: 0:{9S,TS}, 2:{JS,QS}, 4:{KS,AS}. */
const HIGH_S_CORRECT = () =>
  asg([
    ['9S', 0],
    ['TS', 0],
    ['JS', 2],
    ['QS', 2],
    ['KS', 4],
    ['AS', 4],
  ])

/* ------------------------------------------------------ derived settings --- */

describe('variant-derived rule effects (RULES_US54.md §6)', () => {
  it('derives wrongDeclare, declareTiming, winCondition and the clinch target per variant', () => {
    expect(rulesFor(defaultConfig)).toEqual({
      variant: 'pagat48',
      wrongDeclare: 'void',
      declareTiming: 'ownTurn',
      winCondition: 'allResolved',
      wholeTeamOut: 'endgame',
    })
    expect(rulesFor(us54Config)).toEqual({
      variant: 'us54',
      wrongDeclare: 'opponents',
      declareTiming: 'anyTime',
      winCondition: 'clinch',
      wholeTeamOut: 'declareWindow',
    })
    // floor(nBooks / 2) + 1, derived from the set list rather than written as a literal.
    expect(clinchTarget(us54Config)).toBe(5)
    expect(allBooks(us54Config)).toHaveLength(9)
    // An unknown or missing variant falls back to the shipped default, never throws.
    expect(rulesFor(undefined)).toBe(rulesFor(defaultConfig))
  })
})

/* ------------------------------------------- §7 vector 4: wrong declares --- */

describe('wrong declare gifts the set to the opponents (§1 row 14, §7 vector 4)', () => {
  it('own team holds all six but two are misattributed -> Team B scores LOW-C, not void', () => {
    const s = game54(hands54(LOW_C_ON_TEAM_A()), 0)
    const r = ok(s, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_SWAPPED() })
    const res = r.state.books['LOW-C']
    if (!res) throw new Error('set missing')
    expect(res.outcome).toBe('team1')
    expect(res.actualHolders).toEqual(LOW_C_CORRECT())
    expect(r.state.score).toEqual([0, 1])
    // `void` is abolished under us54 — no resolved set may ever carry it.
    expect(Object.values(r.state.books).every((b) => b.outcome !== 'void')).toBe(true)
    expect(conserved(r.state)).toBe(true)
  })

  it('an opponent holding one of the six also scores for the opponents (unchanged)', () => {
    const s = game54(hands54({ 0: ['2C', '3C'], 2: ['4C', '5C'], 4: ['6C'], 1: ['7C'] }), 0)
    const r = ok(s, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() })
    expect(r.state.books['LOW-C']?.outcome).toBe('team1')
    expect(r.state.score).toEqual([0, 1])
  })

  it('a flawless declare still scores for the declarer team', () => {
    const s = game54(hands54(LOW_C_ON_TEAM_A()), 0)
    const r = ok(s, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() })
    expect(r.state.books['LOW-C']?.outcome).toBe('team0')
    expect(r.state.score).toEqual([1, 0])
  })

  it('the identical misattribution is still VOID under pagat48 (RULES.md row 15 untouched)', () => {
    const base = newGame('pagat48-void-check')
    const hands: Card[][] = [[], [], [], [], [], []]
    const placed = new Set<Card>(['2C', '3C', '4C', '5C', '6C', '7C'])
    hands[0].push('2C', '3C')
    hands[2].push('4C', '5C')
    hands[4].push('6C', '7C')
    let i = 0
    for (const c of deckFor(defaultConfig).cards) {
      if (placed.has(c)) continue
      hands[i % 6].push(c)
      i++
    }
    const s: GameState = { ...base, hands: hands.map((h) => sortHand(h)) }
    const r = ok(s, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_SWAPPED() })
    expect(r.state.books['LOW-C']?.outcome).toBe('void')
    expect(r.state.score).toEqual([0, 0])
  })
})

/* ------------------------------------------------- §3: the declare window --- */

describe('the declare window (RULES_US54.md §3)', () => {
  it('opens on the starting seat at deal time, and never exists under pagat48', () => {
    const g = newGame('window-open', us54Config, 3)
    expect(g.declareWindow).toEqual({ option: 3, declined: 0 })
    expect(publicView(g).declareWindow).toEqual({ option: 3, declined: 0 })
    const p = newGame('window-open')
    expect(p.declareWindow).toBeUndefined()
    expect('declareWindow' in publicView(p)).toBe(false)
  })

  it('offers each seat in turn order from the turn-holder, cycling 0..5', () => {
    let cur = game54(hands54({}), 4)
    const offered: Seat[] = []
    for (let i = 0; i < 6; i++) {
      const w = cur.declareWindow
      if (!w) throw new Error('window closed early')
      offered.push(w.option)
      expect(w.declined).toBe(i)
      cur = ok(cur, { type: 'decline', seat: w.option }).state
    }
    expect(offered).toEqual([4, 5, 0, 1, 2, 3])
    // A full cycle of six declines closes it; the turn-holder then asks.
    expect(cur.declareWindow).toBeUndefined()
    expect(cur.turn).toBe(4)
    expect(legalAsks(cur, 4).length).toBeGreaterThan(0)
  })

  it('blocks asking while it is open, and re-opens on the new turn-holder after the ask', () => {
    // Seats 0 and 1 hold exactly their named cards; everything else sits with seats 2-5.
    const s = game54(hands54({ 0: ['2C'], 1: ['3C', '4C'] }, [2, 3, 4, 5]), 0)
    expect(legalAsks(s, 0)).toEqual([])
    expect(legalActionsSummary(s)).toEqual({ seat: 0, kinds: ['claim', 'decline'] })
    expect(refuse(s, { type: 'ask', seat: 0, target: 1, card: '3C' }).code).toBe('DECLARE_WINDOW_OPEN')

    const open = closeWindow(s)
    expect(legalActionsSummary(open).kinds).toContain('ask')
    // Hit: the asker keeps the turn, so the window re-opens on them (row 9).
    const hit = ok(open, { type: 'ask', seat: 0, target: 1, card: '3C' })
    expect(hit.state.declareWindow).toEqual({ option: 0, declined: 0 })
    expect(hit.state.turn).toBe(0)
    // Miss: the turn passes to the target, and the window re-opens on the target (row 10).
    const miss = ok(closeWindow(hit.state), { type: 'ask', seat: 0, target: 1, card: '5C' })
    expect(miss.state.turn).toBe(1)
    expect(miss.state.declareWindow).toEqual({ option: 1, declined: 0 })
  })

  it('enforces the offered order: only the option seat may declare or decline', () => {
    const s = game54(hands54(LOW_C_ON_TEAM_A()), 3)
    expect(refuse(s, { type: 'decline', seat: 4 }).code).toBe('NOT_YOUR_OPTION')
    const early = refuse(s, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() })
    expect(early.code).toBe('NOT_YOUR_OPTION')
    // §3.1: NOT_YOUR_TURN is not a declare error in this variant, at any point.
    expect(early.code).not.toBe('NOT_YOUR_TURN')
    // The same declare is accepted once the option reaches seat 0 — nothing is denied, only queued.
    const r = ok(optionTo(s, 0), { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() })
    expect(r.state.books['LOW-C']?.outcome).toBe('team0')
  })

  it('refuses a declare and a decline once the window has closed', () => {
    const closed = closeWindow(game54(hands54(LOW_C_ON_TEAM_A()), 0))
    expect(refuse(closed, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() }).code).toBe(
      'NO_DECLARE_WINDOW',
    )
    expect(refuse(closed, { type: 'decline', seat: 0 }).code).toBe('NO_DECLARE_WINDOW')
  })

  it('re-opens from the top when a declare resolves, so several resolve in one window', () => {
    // §7 vector 6: seat 0's declare is what makes LOW-D deducible; seat 2 takes it in the
    // same window, before seat 3 (the turn-holder) ever asks.
    const s = game54(
      hands54({
        0: ['9S', 'TS'],
        2: ['JS', 'QS', '2D', '3D', '4D'],
        4: ['KS', 'AS', '5D', '6D', '7D'],
      }),
      3,
    )
    const first = ok(optionTo(s, 0), {
      type: 'claim',
      seat: 0,
      book: 'HIGH-S',
      assignments: HIGH_S_CORRECT(),
    })
    expect(first.state.books['HIGH-S']?.outcome).toBe('team0')
    // The window restarts at the (unchanged) turn-holder with a fresh count.
    expect(first.state.declareWindow).toEqual({ option: 3, declined: 0 })

    const second = ok(optionTo(first.state, 2), {
      type: 'claim',
      seat: 2,
      book: 'LOW-D',
      assignments: asg([['2D', 2], ['3D', 2], ['4D', 2], ['5D', 4], ['6D', 4], ['7D', 4]]),
    })
    expect(second.state.books['LOW-D']?.outcome).toBe('team0')
    expect(second.state.score).toEqual([2, 0])
    // No ask happened in between: the log holds the deal and the two declares only.
    expect(second.state.log.filter((e) => e.type === 'ask')).toEqual([])
    expect(second.state.log.filter((e) => e.type === 'claim')).toHaveLength(2)
    expect(second.state.turn).toBe(3)
  })

  it('is replayable from the action log alone', () => {
    const actions: GameAction[] = [
      { type: 'decline', seat: 0 },
      { type: 'decline', seat: 1 },
      { type: 'claim', seat: 2, book: 'LOW-C', assignments: LOW_C_SWAPPED() },
      { type: 'decline', seat: 0 },
      { type: 'decline', seat: 1 },
      { type: 'decline', seat: 2 },
      { type: 'decline', seat: 3 },
      { type: 'decline', seat: 4 },
      { type: 'decline', seat: 5 },
    ]
    const replay = () => {
      let cur = game54(hands54(LOW_C_ON_TEAM_A()), 0)
      for (const a of actions) cur = ok(cur, a).state
      return cur
    }
    expect(JSON.stringify(replay())).toBe(JSON.stringify(replay()))
    expect(replay().declareWindow).toBeUndefined()
    expect(replay().books['LOW-C']?.outcome).toBe('team1')
  })
})

/* ---------------------------------------- §3.1: declare legality under us54 --- */

describe('declare legality table (RULES_US54.md §3.1)', () => {
  it('never returns NOT_YOUR_TURN — a declare is legal from any seat', () => {
    const s = game54(hands54(LOW_C_ON_TEAM_A()), 3)
    for (const seat of [0, 1, 2, 3, 4, 5] as Seat[]) {
      const cur = optionTo(s, seat)
      const r = reduce(cur, { type: 'claim', seat, book: 'LOW-C', assignments: LOW_C_CORRECT() })
      // Seats on team B cannot assign team A's seats (ASSIGN_OPPONENT); team A's seats succeed.
      if (seat % 2 === 0) expect(r.ok).toBe(true)
      else if (!r.ok) expect(r.error.code).toBe('ASSIGN_OPPONENT')
    }
    // ...whereas pagat48 keeps the own-turn restriction exactly as it was (RULES.md row 11).
    const p = newGame('pagat48-turn-check')
    expect(refuse(p, { type: 'claim', seat: 2, book: 'LOW-C', assignments: LOW_C_CORRECT() }).code).toBe(
      'NOT_YOUR_TURN',
    )
  })

  it('keeps the other four checks and their codes', () => {
    const s = game54(hands54(LOW_C_ON_TEAM_A()), 0)
    const resolved = ok(s, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() }).state
    expect(refuse(resolved, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() }).code).toBe(
      'BOOK_RESOLVED',
    )
    expect(
      refuse({ ...s, phase: 'finished' }, { type: 'claim', seat: 0, book: 'LOW-D', assignments: LOW_C_CORRECT() })
        .code,
    ).toBe('WRONG_PHASE')
    const five = LOW_C_CORRECT()
    delete (five as Partial<Record<Card, Seat>>)['7C']
    expect(refuse(s, { type: 'claim', seat: 0, book: 'LOW-C', assignments: five }).code).toBe('BAD_ASSIGNMENTS')
    expect(
      refuse(s, { type: 'claim', seat: 0, book: 'LOW-C', assignments: { ...LOW_C_CORRECT(), '7C': 1 as Seat } }).code,
    ).toBe('ASSIGN_OPPONENT')
  })

  it('declares EIGHTS like any other set under us54', () => {
    const eights = bookCards('EIGHTS', us54Config)
    const s = game54(hands54({ 0: [eights[0], eights[1]], 2: [eights[2], eights[3]], 4: [eights[4], eights[5]] }), 0)
    const r = ok(s, {
      type: 'claim',
      seat: 0,
      book: 'EIGHTS',
      assignments: asg([
        [eights[0], 0],
        [eights[1], 0],
        [eights[2], 2],
        [eights[3], 2],
        [eights[4], 4],
        [eights[5], 4],
      ]),
    })
    expect(r.state.books.EIGHTS?.outcome).toBe('team0')
    expect(conserved(r.state)).toBe(true)
  })
})

/* --------------------------------- §7 vector 5 + row 16: turn after a declare --- */

describe('turn after a declare (RULES_US54.md §1 row 16, §7 vector 5)', () => {
  it('an out-of-turn declare leaves the turn where it was, and that seat asks next', () => {
    const s = game54(hands54({ 0: ['9S', 'TS'], 2: ['JS', 'QS'], 4: ['KS', 'AS'] }), 3)
    const r = ok(optionTo(s, 0), {
      type: 'claim',
      seat: 0,
      book: 'HIGH-S',
      assignments: HIGH_S_CORRECT(),
    })
    expect(r.state.books['HIGH-S']?.outcome).toBe('team0')
    expect(r.state.score).toEqual([1, 0])
    // The interjection does not move the turn.
    expect(r.state.turn).toBe(3)
    expect(r.state.phase).toBe('playing')
    // And once the re-opened window closes with no declare, seat 3 is the one who asks.
    const closed = closeWindow(r.state)
    expect(legalActionsSummary(closed).seat).toBe(3)
    const opponent = closed.hands[0].length > 0 ? 0 : 2
    const asked = closed.hands[opponent][0]
    expect(ok(closed, { type: 'ask', seat: 3, target: opponent as Seat, card: asked }).state.turn).toBe(3)
  })

  it('the turn-holder who declares keeps the turn', () => {
    const s = game54(hands54(LOW_C_ON_TEAM_A()), 0)
    const r = ok(s, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() })
    expect(r.state.turn).toBe(0)
    expect(r.state.declareWindow).toEqual({ option: 0, declined: 0 })
  })
})

/* ----------------------------------- §4 + §7 vectors 8-9: running out of cards --- */

describe('running out of cards (RULES_US54.md §4, §7 vectors 8-9)', () => {
  it("vector 8: a declare that empties the turn-holder passes the turn to a teammate", () => {
    // Seat 3 (the turn-holder) holds exactly the two LOW-C cards seat 0's declare removes.
    const s = game54(hands54({ 0: ['2C', '3C'], 2: ['4C', '5C'], 3: ['6C', '7C'] }, [0, 1, 2, 4, 5]), 3)
    expect(s.hands[3]).toEqual(['6C', '7C'])
    const r = ok(optionTo(s, 0), { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() })
    // An opponent held two of the six, so the opponents score it (row 14 / RULES.md §3.1).
    expect(r.state.books['LOW-C']?.outcome).toBe('team1')
    expect(r.events).toContainEqual({ type: 'player_out', seat: 3 })
    expect(r.state.hands[3]).toEqual([])
    // §4: the turn is the emptied holder's to pass, and it goes to a teammate — the same rule
    // and the same phase as being emptied by your own declare. It does NOT advance to seat 4,
    // which is an opponent; that was the derived rule this vector used to pin, and it was wrong.
    expect(r.state.phase).toBe('awaitPass')
    expect(r.state.turn).toBe(3)
    expect(r.state.declareWindow).toBeUndefined()
    expect(refuse(r.state, { type: 'pass', seat: 3, to: 4 }).code).toBe('PASS_TARGET_NOT_TEAMMATE')
    const passed = ok(r.state, { type: 'pass', seat: 3, to: 5 })
    expect(passed.state.phase).toBe('playing')
    expect(passed.state.turn).toBe(5)
    expect(passed.state.declareWindow).toEqual({ option: 5, declined: 0 })
    expect(conserved(passed.state)).toBe(true)
  })

  it('advances instead, wrapping, when the emptied turn-holder has no teammate left', () => {
    // Only seats 0 and 2 hold anything besides the declared set, so team B is wholly out the
    // moment seat 3 is emptied and there is no teammate to receive a pass.
    const s = game54(hands54({ 0: ['2C', '3C'], 2: ['4C', '5C'], 3: ['6C', '7C'] }, [0, 2]), 3)
    const r = ok(optionTo(s, 0), { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() })
    expect(r.state.hands.map((h) => h.length > 0)).toEqual([true, false, true, false, false, false])
    // Seats 4 and 5 are out too, so the scan wraps past them to seat 0.
    expect(r.state.phase).toBe('playing')
    expect(r.state.turn).toBe(0)
  })

  it('an out-of-turn declarer who empties themselves drops out and does NOT pass', () => {
    // Seat 0 holds exactly the two cards its own (correct) declare removes; the turn is seat 3.
    const s = game54(hands54(LOW_C_ON_TEAM_A(), [1, 2, 3, 4, 5]), 3)
    expect(s.hands[0]).toEqual(['2C', '3C'])
    const r = ok(optionTo(s, 0), { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() })
    expect(r.events).toContainEqual({ type: 'player_out', seat: 0 })
    // awaitPass is a turn action, and seat 0 never held the turn (§4 [DERIVED]).
    expect(r.state.phase).toBe('playing')
    expect(r.state.turn).toBe(3)
    expect(r.state.declareWindow).toEqual({ option: 3, declined: 0 })
  })

  it('the turn-holder emptied by their own declare still passes to a teammate (row 20 in force)', () => {
    const s = game54(hands54(LOW_C_ON_TEAM_A(), [1, 2, 3, 4, 5]), 0)
    const r = ok(s, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() })
    expect(r.state.phase).toBe('awaitPass')
    // The window closes for the duration: awaitPass is not a declare phase (§3.1).
    expect(r.state.declareWindow).toBeUndefined()
    expect(refuse(r.state, { type: 'decline', seat: 0 }).code).toBe('NO_DECLARE_WINDOW')
    const passed = ok(r.state, { type: 'pass', seat: 0, to: 2 })
    expect(passed.state.phase).toBe('playing')
    expect(passed.state.turn).toBe(2)
    expect(passed.state.declareWindow).toEqual({ option: 2, declined: 0 })
  })

  it('vector 9: a cardless seat is still offered the option and declares normally', () => {
    // Seat 2 is dealt nothing; team A's LOW-C sits with seats 0 and 4.
    const s = game54(hands54({ 0: ['2C', '3C', '4C'], 4: ['5C', '6C', '7C'] }, [0, 1, 3, 4, 5]), 0)
    expect(s.hands[2]).toEqual([])
    const at2 = optionTo(s, 2)
    expect(at2.declareWindow).toEqual({ option: 2, declined: 2 })
    const r = ok(at2, {
      type: 'claim',
      seat: 2,
      book: 'LOW-C',
      assignments: asg([['2C', 0], ['3C', 0], ['4C', 0], ['5C', 4], ['6C', 4], ['7C', 4]]),
    })
    expect(r.state.books['LOW-C']?.outcome).toBe('team0')
    expect(r.state.turn).toBe(0)
    expect(conserved(r.state)).toBe(true)
  })

  it('never enters endgame/awaitDesignate, and refuses the decline when no ask can follow', () => {
    // Team B's last card is taken by a hit: pagat48 would go to `endgame` here (RULES.md §4).
    const s = game54(hands54({ 0: ['2C'], 1: ['3C'] }, [0, 2, 4]), 0)
    // Team B (1,3,5) holds one card in total: seat 1's 3C.
    expect(s.hands.map((h) => h.length > 0)).toEqual([true, true, true, false, true, false])
    const hit = ok(closeWindow(s), { type: 'ask', seat: 0, target: 1, card: '3C' })
    expect(hit.state.phase).toBe('playing')
    expect(hit.events.some((e) => e.type === 'endgame')).toBe(false)
    expect(hit.events).toContainEqual({ type: 'player_out', seat: 1 })
    // Team B is out, so seat 0 — the turn-holder, who holds the option first — has no legal
    // ask. §3: the window has nothing to close into, so `decline` is not a move at all.
    const cur = hit.state
    expect(legalAsks(cur, 0)).toEqual([])
    expect(cur.declareWindow).toEqual({ option: 0, declined: 0 })
    expect(refuse(cur, { type: 'decline', seat: 0 }).code).toBe('MUST_DECLARE')
    // The only affordance offered is the declare, and it is genuinely available (§4).
    expect(legalActionsSummary(cur)).toEqual({ seat: 0, kinds: ['claim'] })
    expect(checkInvariants(cur)).toEqual([])
  })
})

/* ------------------------ §3/§4: a decline that cannot lead anywhere is illegal --- */

/**
 * The latent deadlock this closes. §3 says a full cycle of six declines closes the window; the
 * engine used to re-open it instead (`{ option: turn, declined: 0 }`) whenever the turn-holder
 * could not ask, because closing would have left a running game with no legal action. That kept
 * every state legal and every state *identical*: three consecutive full cycles of six declines
 * returned the window to exactly `{ option: <turn>, declined: 0 }` with `checkInvariants` clean
 * at every step, so a table that only declines looped forever and the §5 deadlock invariant
 * could not see it — `hasLegalAction` counted the decline itself as the legal action.
 *
 * The rule now refuses the decline (`MUST_DECLARE`), which is sound because rows 12/15 make a
 * declare *always* legal while any set is unresolved: name the set, assign all six cards to
 * seats on your own team, possibly wrongly (row 14 gifts it to the opponents) but always
 * legally. The forced declare resolves a set, so the resolved count strictly increases and §5's
 * termination becomes a property of the rules rather than of how the bots happen to play.
 */
describe('decline is illegal when no ask can follow the window (RULES_US54.md §3, §4)', () => {
  /**
   * Team A (0/2/4) cardless, team B (1/3/5) holding everything, turn on seat 1 — the exact
   * position the audit drove three full decline cycles through.
   */
  function wholeTeamAOut(): GameState {
    const s = game54(hands54({}, [1, 3, 5]), 1)
    expect(s.hands.map((h) => h.length)).toEqual([0, 18, 0, 18, 0, 18])
    return s
  }

  it('refuses every seat, at the very first decline, and never advances the window', () => {
    const s = wholeTeamAOut()
    expect(turnHolderCanAsk(s)).toBe(false)
    const w = s.declareWindow
    expect(w).toEqual({ option: 1, declined: 0 })
    const e = refuse(s, { type: 'decline', seat: 1 })
    expect(e.code).toBe('MUST_DECLARE')
    expect(e.message).toContain('must declare')
    // A refusal is not a move: the state, the window and moveIndex are all untouched.
    const r = reduce(s, { type: 'decline', seat: 1 })
    expect(r.ok).toBe(false)
    expect(s.declareWindow).toEqual({ option: 1, declined: 0 })
    expect(s.moveIndex).toBe(0)
    // Out-of-option seats still get their own code first — the new check does not reorder §3.1.
    expect(refuse(s, { type: 'decline', seat: 3 }).code).toBe('NOT_YOUR_OPTION')
  })

  it('leaves exactly one legal action, and it strictly resolves a set', () => {
    const s = wholeTeamAOut()
    expect(legalActionsSummary(s)).toEqual({ seat: 1, kinds: ['claim'] })
    expect(checkInvariants(s)).toEqual([])
    const before = Object.keys(s.books).length
    const r = ok(s, {
      type: 'claim',
      seat: 1,
      book: 'LOW-C',
      assignments: asg([['2C', 1], ['3C', 1], ['4C', 3], ['5C', 3], ['6C', 5], ['7C', 5]]),
    })
    expect(Object.keys(r.state.books).length).toBe(before + 1)
    expect(conserved(r.state)).toBe(true)
  })

  it('terminates: a table that can only declare reaches the clinch, it does not loop', () => {
    // The deadlock reproduction, driven to completion. Every step takes the only legal action
    // the engine offers; the old engine returned to the identical state forever instead.
    let s = wholeTeamAOut()
    const seen = new Set<string>()
    let steps = 0
    while (s.phase !== 'finished') {
      if (++steps > 50) throw new Error(`no termination after ${steps} steps (phase ${s.phase})`)
      const { seat, kinds } = legalActionsSummary(s)
      expect(kinds, `step ${steps}`).toEqual(['claim'])
      // A position repeating verbatim is precisely the old bug's signature.
      const key = `${seat}|${JSON.stringify(s.declareWindow)}|${Object.keys(s.books).sort().join(',')}`
      expect(seen.has(key), `step ${steps}: position repeated — the window is looping`).toBe(false)
      seen.add(key)
      const book = allBooks(s.config).find((b) => !s.books[b])
      if (!book) throw new Error('no unresolved set but the game is still running')
      // Rows 12/15: assign all six to my own team. Team B holds them all, so these are correct.
      const assignments = {} as Record<Card, Seat>
      for (const c of bookCards(book, s.config)) {
        assignments[c] = s.hands.findIndex((h) => h.includes(c)) as Seat
      }
      s = ok(s, { type: 'claim', seat, book, assignments }).state
      expect(checkInvariants(s)).toEqual([])
    }
    // Team B declared out its own sets, so it clinches at exactly 5 (§5).
    expect(steps).toBe(clinchTarget(us54Config))
    expect(s.score).toEqual([0, 5])
    expect(s.log[s.log.length - 1]).toEqual({ type: 'game_over', score: [0, 5], winner: 1 })
    expect(s.declareWindow).toBeUndefined()
  })

  it('a cardless team forced to declare gifts the sets away — and that still terminates', () => {
    // §4: "if your whole team is cardless, any declare you make is necessarily wrong and gifts
    // the set to the opponents". Reached here by handing the option to a cardless seat, which
    // is why the refusal must not be conditional on the declarer holding cards.
    const s = { ...wholeTeamAOut(), declareWindow: { option: 0 as Seat, declined: 3 } }
    expect(refuse(s, { type: 'decline', seat: 0 }).code).toBe('MUST_DECLARE')
    const r = ok(s, {
      type: 'claim',
      seat: 0,
      book: 'LOW-C',
      assignments: asg([['2C', 0], ['3C', 0], ['4C', 2], ['5C', 2], ['6C', 4], ['7C', 4]]),
    })
    // Every card is really with team B, so the set goes to team B (row 14) — a set resolves
    // either way, which is all termination needs.
    expect(r.state.books['LOW-C']?.outcome).toBe('team1')
    expect(r.state.score).toEqual([0, 1])
  })

  it('also fires when the turn-holder simply has no askable card, opponents or not', () => {
    // The other way to have no legal ask, and the one "no seat anywhere can ask" would miss:
    // seat 0's whole hand is complete unresolved sets, while seats 1-5 could all ask freely.
    const mine: Card[] = [...bookCards('LOW-C', us54Config), ...bookCards('HIGH-C', us54Config)]
    const s = game54(hands54({ 0: mine }, [1, 2, 3, 4, 5]), 0)
    expect(s.hands[0]).toEqual(sortHand(mine, us54Config))
    expect(turnHolderCanAsk(s)).toBe(false)
    expect(legalAsks(s, 0)).toEqual([])
    // Opponents are anything but out — 1, 3 and 5 hold plenty.
    expect(s.hands.map((h) => h.length > 0)).toEqual([true, true, true, true, true, true])
    expect(refuse(s, { type: 'decline', seat: 0 }).code).toBe('MUST_DECLARE')
    // Seat 0 declares one of the two sets it holds outright; now it can ask again.
    const r = ok(s, {
      type: 'claim',
      seat: 0,
      book: 'LOW-C',
      assignments: asg([['2C', 0], ['3C', 0], ['4C', 0], ['5C', 0], ['6C', 0], ['7C', 0]]),
    })
    expect(r.state.books['LOW-C']?.outcome).toBe('team0')
    // HIGH-C is still a complete set in hand, so the block persists until that goes too.
    expect(refuse(r.state, { type: 'decline', seat: 0 }).code).toBe('MUST_DECLARE')
    const r2 = ok(r.state, {
      type: 'claim',
      seat: 0,
      book: 'HIGH-C',
      assignments: asg([['9C', 0], ['TC', 0], ['JC', 0], ['QC', 0], ['KC', 0], ['AC', 0]]),
    })
    expect(r2.state.hands[0]).toEqual([])
    expect(checkInvariants(r2.state)).toEqual([])
  })

  it('leaves the ordinary window untouched: six declines still close it (§3, literally)', () => {
    // No re-open hack any more — the plain §3 reading holds whenever an ask can follow.
    const s = game54(hands54(LOW_C_ON_TEAM_A()), 0)
    expect(turnHolderCanAsk(s)).toBe(true)
    let cur = s
    for (let i = 0; i < 5; i++) {
      const w = cur.declareWindow
      if (!w) throw new Error(`window closed early, after ${i} declines`)
      expect(w).toEqual({ option: ((0 + i) % 6) as Seat, declined: i })
      cur = ok(cur, { type: 'decline', seat: w.option }).state
    }
    expect(cur.declareWindow).toEqual({ option: 5, declined: 5 })
    const closed = ok(cur, { type: 'decline', seat: 5 }).state
    expect(closed.declareWindow).toBeUndefined()
    expect(legalActionsSummary(closed).kinds).toContain('ask')
    expect(checkInvariants(closed)).toEqual([])
  })
})

/* ----------------------------------------- §5 + §7 vector 7: the clinch --- */

describe('clinch at 5 awarded sets (RULES_US54.md §1 row 19, §5, §7 vector 7)', () => {
  /** Four sets already awarded to `team`; the rest of the deck is still in hands. */
  function fourAwarded(team: 0 | 1, spec: Partial<Record<Seat, Card[]>>): GameState {
    const books: GameState['books'] = {
      'LOW-C': awarded('LOW-C', team),
      'LOW-D': awarded('LOW-D', team),
      'LOW-H': awarded('LOW-H', team),
      'LOW-S': awarded('LOW-S', team),
    }
    const gone = new Set<Card>(Object.keys(books).flatMap((b) => bookCards(b as BookId, us54Config)))
    const pool = DECK54.filter((c) => !gone.has(c))
    const score: [number, number] = team === 0 ? [4, 0] : [0, 4]
    return game54(deal(pool, spec, [0, 1, 2, 3, 4, 5]), 0, { books, score })
  }

  const HIGH_C_ON_TEAM_A = () => ({ 0: ['9C', 'TC'] as Card[], 2: ['JC', 'QC'] as Card[], 4: ['KC', 'AC'] as Card[] })
  const HIGH_C_CORRECT = () =>
    asg([
      ['9C', 0],
      ['TC', 0],
      ['JC', 2],
      ['QC', 2],
      ['KC', 4],
      ['AC', 4],
    ])

  it('vector 7: the 5th awarded set finishes the game on the spot, sets unresolved and cards in hand', () => {
    const s = fourAwarded(0, HIGH_C_ON_TEAM_A())
    const r = ok(s, { type: 'claim', seat: 0, book: 'HIGH-C', assignments: HIGH_C_CORRECT() })
    expect(r.state.phase).toBe('finished')
    expect(r.state.score).toEqual([5, 0])
    expect(r.events).toContainEqual({ type: 'game_over', score: [5, 0], winner: 0 })
    // The game legitimately ends with unresolved sets and cards still in hands (§5.1).
    expect(Object.keys(r.state.books)).toHaveLength(5)
    expect(allBooks(us54Config).filter((b) => !r.state.books[b])).toHaveLength(4)
    expect(r.state.hands.some((h) => h.length > 0)).toBe(true)
    expect(r.state.declareWindow).toBeUndefined()
    expect(conserved(r.state)).toBe(true)
    // Nothing is legal afterwards.
    expect(legalActionsSummary(r.state)).toEqual({ seat: 0, kinds: [] })
    expect(refuse(r.state, { type: 'decline', seat: 0 }).code).toBe('NO_DECLARE_WINDOW')
  })

  it('row 20: a set won because the opponents declared wrongly clinches just the same', () => {
    // Team A is on 4. Team B's seat 1 declares HIGH-C, which team A actually holds.
    const s = fourAwarded(0, HIGH_C_ON_TEAM_A())
    const at1 = optionTo(s, 1)
    const r = ok(at1, {
      type: 'claim',
      seat: 1,
      book: 'HIGH-C',
      assignments: asg([
        ['9C', 1],
        ['TC', 1],
        ['JC', 3],
        ['QC', 3],
        ['KC', 5],
        ['AC', 5],
      ]),
    })
    expect(r.state.books['HIGH-C']?.outcome).toBe('team0')
    expect(r.state.phase).toBe('finished')
    expect(r.events).toContainEqual({ type: 'game_over', score: [5, 0], winner: 0 })
  })

  it('does not finish at 4 awarded sets', () => {
    const s = fourAwarded(0, { 0: ['9C', 'TC'], 2: ['JC', 'QC'], 4: ['KC'], 1: ['AC'] })
    // An opponent holds AC, so this one goes to team B: 4-1, nobody has clinched.
    const r = ok(s, { type: 'claim', seat: 0, book: 'HIGH-C', assignments: HIGH_C_CORRECT() })
    expect(r.state.phase).toBe('playing')
    expect(r.state.score).toEqual([4, 1])
    expect(r.state.declareWindow).toEqual({ option: 0, declined: 0 })
  })

  it('counts sets by outcome, never `score` (§5 safety requirement 1)', () => {
    // A state whose score has run ahead of its set count — exactly the divergence
    // highBooksDouble would produce. Three sets awarded, score already at 6.
    const books: GameState['books'] = {
      'HIGH-C': awarded('HIGH-C', 0),
      'HIGH-D': awarded('HIGH-D', 0),
      'HIGH-H': awarded('HIGH-H', 0),
    }
    const gone = new Set<Card>(Object.keys(books).flatMap((b) => bookCards(b as BookId, us54Config)))
    const pool = DECK54.filter((c) => !gone.has(c))
    const s = game54(deal(pool, LOW_C_ON_TEAM_A(), [0, 1, 2, 3, 4, 5]), 0, { books, score: [6, 0] })
    const r = ok(s, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() })
    // 4 sets, score 7: a `score >= 5` clinch would have ended this game two sets ago.
    expect(r.state.score).toEqual([7, 0])
    expect(r.state.phase).toBe('playing')
    // ...and the config that would create the divergence for real is rejected outright.
    const bad = { ...us54Config, toggles: { ...us54Config.toggles, highBooksDouble: true } }
    expect(validateConfig(bad)).toHaveLength(1)
    expect(() => newGame('never', bad)).toThrow(/invalid RulesConfig/)
  })

  it('keeps `resolved === nBooks` as an unreachable second terminator, and never emits a tie', () => {
    // Eight sets resolved 4-4 — a split RULES_US54.md §5 proves impossible, reachable only by
    // hand-building the state. The 9th resolution must still terminate, with a winner.
    const books: GameState['books'] = {}
    allBooks(us54Config)
      .filter((b) => b !== 'LOW-C')
      .forEach((b, i) => {
        books[b] = awarded(b, (i % 2) as 0 | 1)
      })
    const gone = new Set<Card>(Object.keys(books).flatMap((b) => bookCards(b as BookId, us54Config)))
    const s = game54(deal(DECK54.filter((c) => !gone.has(c)), LOW_C_ON_TEAM_A(), [0, 2, 4]), 0, {
      books,
      score: [4, 4],
    })
    const r = ok(s, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() })
    expect(r.state.phase).toBe('finished')
    expect(Object.keys(r.state.books)).toHaveLength(9)
    const over = r.events.find((e) => e.type === 'game_over')
    expect(over).toEqual({ type: 'game_over', score: [5, 4], winner: 0 })
    // pagat48 still reports a 4-4 finish as a tie (RULES.md row 23) — unchanged.
    expect(rulesFor(defaultConfig).winCondition).toBe('allResolved')
  })
})

/* ------------------------------------------------------ termination soak --- */

/**
 * A reduced form of RULES_US54.md §7 vector 10 — 2,000 games rather than 10,000, kept here
 * because it drives the window through this file's own dispatch and so fails close to the
 * rules it is testing. The full-size gate is tests/engine/fuzz-variant.test.ts.
 *
 * Asserted here: every game terminates, every win is a clinch at exactly 5 sets, the
 * `resolved === 9` fallback never fires, no tie is ever emitted, and — now that invariants.ts
 * is config-derived — `checkInvariants` returns [] after every single reduce.
 */
describe('us54 random play always terminates on a clinch (§5, §7 vector 10 in part)', () => {
  function randomDeclare(s: GameState, seat: Seat, rng: () => number): GameAction {
    const unresolved = allBooks(s.config).filter((b) => !s.books[b])
    const book = unresolved[randInt(rng, unresolved.length)]
    const team = teamSeats(seatTeam(seat))
    const informed = rng() < 0.5
    const assignments = {} as Record<Card, Seat>
    for (const c of bookCards(book, s.config)) {
      const holder = s.hands.findIndex((h) => h.includes(c)) as Seat
      assignments[c] =
        informed && seatTeam(holder) === seatTeam(seat) ? holder : team[randInt(rng, team.length)]
    }
    return { type: 'claim', seat, book, assignments }
  }

  it('2000 seeded games: all finish, all at exactly 5 awarded sets, never on the fallback', () => {
    for (let g = 0; g < 2000; g++) {
      const rng = rngFromSeed(`us54-soak-${g}`)
      let s = newGame(`us54-soak-${g}`, us54Config, randInt(rng, 6) as Seat)
      let steps = 0
      while (s.phase !== 'finished') {
        if (++steps > 4000) throw new Error(`game ${g} did not terminate (phase ${s.phase})`)
        // The fallback terminator of §5 must never be what ends a game.
        expect(Object.keys(s.books).length, `game ${g} reached the unreachable 9th resolution`).toBeLessThan(9)
        let action: GameAction
        if (s.declareWindow) {
          const seat = s.declareWindow.option
          // §3: with no ask able to follow the window, `decline` is refused (`MUST_DECLARE`)
          // and the option seat's only move is the declare that guarantees termination.
          action = !turnHolderCanAsk(s) || rng() < 0.12 ? randomDeclare(s, seat, rng) : { type: 'decline', seat }
        } else if (s.phase === 'awaitPass') {
          const mates = teamSeats(seatTeam(s.turn)).filter((t) => s.hands[t].length > 0)
          action = { type: 'pass', seat: s.turn, to: mates[randInt(rng, mates.length)] }
        } else {
          const asks = legalAsks(s, s.turn)
          // The window only ever closes into a state where the turn-holder can ask (§4).
          expect(asks.length, `game ${g}: window closed with no legal ask`).toBeGreaterThan(0)
          const a = asks[randInt(rng, asks.length)]
          action = { type: 'ask', seat: s.turn, target: a.target, card: a.card }
        }
        const r = reduce(s, action)
        if (!r.ok) throw new Error(`game ${g} step ${steps}: ${r.error.code} ${r.error.message}`)
        s = r.state
        // §7 vector 10's fifth clause, now that invariants.ts derives everything from s.config.
        const violations = checkInvariants(s)
        if (violations.length > 0) throw new Error(`game ${g} step ${steps}: ${violations.join(' | ')}`)
        // `endgame` and `awaitDesignate` are pagat48-only (§4).
        expect(s.phase === 'endgame' || s.phase === 'awaitDesignate', `game ${g} entered ${s.phase}`).toBe(false)
      }
      const over = s.log[s.log.length - 1]
      if (over.type !== 'game_over') throw new Error(`game ${g} finished without game_over`)
      expect(over.winner).not.toBe('tie')
      const sets = allBooks(s.config).reduce<[number, number]>(
        (acc, b) => {
          const o = s.books[b]?.outcome
          if (o === 'team0') acc[0]++
          else if (o === 'team1') acc[1]++
          return acc
        },
        [0, 0],
      )
      expect(sets[over.winner === 0 ? 0 : 1]).toBe(clinchTarget(us54Config))
      expect(Object.values(s.books).every((b) => b.outcome !== 'void')).toBe(true)
      expect(conserved(s)).toBe(true)
    }
    // 2,000 full games is seconds of real work, not milliseconds. Left on
    // vitest's 5 s default this passes on an idle machine and fails under load —
    // a flaky gate is worse than no gate. 120 s matches the explicit budget the
    // other soak suites already use (tests/bots/*.test.ts).
  }, 120_000)
})

/* ------------------------------- §5 safety requirement 2: the fallback arm --- */

/**
 * `resolved === nBooks` is the defensive second terminator §5 safety requirement 2 asks for:
 * unreachable under the shipped rules, kept so that a future rule edit which breaks the 9-set
 * pigeonhole cannot silently reintroduce the hang. It used to share the clinch's winner
 * expression, `sets[0] > sets[1] ? 0 : 1` — which has no tie arm, so in exactly the situation
 * the fallback exists for it would have declared team 1 the winner of a drawn board.
 *
 * The board below is reached by pre-loading a `void` outcome, which is a `pagat48`-only result
 * (row 14 abolishes it here). That IS the simulation: a rule edit that can make the fallback
 * fire is an edit that puts some resolved set on neither team, and a drawn board follows.
 */
describe('the resolved===nBooks fallback reports a draw as a tie (§5 safety requirement 2)', () => {
  /**
   * The eight half-suits resolved with the given outcomes, EIGHTS still in team B's hands.
   * `voids` are the simulated rule edit — they are what lets nine resolved sets fail to clinch.
   */
  function eightResolved(outcomes: readonly ('team0' | 'team1' | 'void')[]): GameState {
    const half = allBooks(us54Config).filter((b) => b !== 'EIGHTS')
    expect(outcomes).toHaveLength(half.length)
    const books: GameState['books'] = {}
    const score: [number, number] = [0, 0]
    half.forEach((b, i) => {
      const o = outcomes[i]
      const base = awarded(b, o === 'team1' ? 1 : 0)
      books[b] = o === 'void' ? { ...base, outcome: 'void' } : base
      if (o === 'team0') score[0]++
      else if (o === 'team1') score[1]++
    })
    const eights = bookCards('EIGHTS', us54Config)
    // Team B (1/3/5) holds all six EIGHTS, two each.
    return game54(deal(eights, { 1: [...eights.slice(0, 2)], 3: [...eights.slice(2, 4)], 5: [...eights.slice(4)] }, [1, 3, 5]), 1, {
      books,
      score,
    })
  }

  /** Seat 1's correct declare of EIGHTS: every card assigned to its true (team B) holder. */
  function eightsCorrect(s: GameState): Record<Card, Seat> {
    const assignments = {} as Record<Card, Seat>
    for (const c of bookCards('EIGHTS', us54Config)) assignments[c] = s.hands.findIndex((h) => h.includes(c)) as Seat
    return assignments
  }

  function setsOf(s: GameState): [number, number] {
    return allBooks(s.config).reduce<[number, number]>(
      (acc, b) => {
        const o = s.books[b]?.outcome
        if (o === 'team0') acc[0]++
        else if (o === 'team1') acc[1]++
        return acc
      },
      [0, 0],
    )
  }

  it('a level board finishing on the fallback is a tie, not a win for team 1', () => {
    // 4 to team 0, 3 to team 1, 1 void; the ninth set goes to team 1 -> 4-4, nobody on 5.
    const s = eightResolved(['team0', 'team0', 'team0', 'team0', 'team1', 'team1', 'team1', 'void'])
    const r = ok(s, { type: 'claim', seat: 1, book: 'EIGHTS', assignments: eightsCorrect(s) })
    expect(r.state.phase).toBe('finished')
    expect(Object.keys(r.state.books)).toHaveLength(allBooks(us54Config).length)
    expect(setsOf(r.state)).toEqual([4, 4])
    expect(Math.max(...setsOf(r.state))).toBeLessThan(clinchTarget(us54Config))
    // The regression: sharing the clinch arm, this reported `winner: 1` on a drawn board.
    expect(r.events).toContainEqual({ type: 'game_over', score: [4, 4], winner: 'tie' })
  })

  it('still names the leader when the fallback board is not level', () => {
    // 4 to team 0, 2 to team 1, 2 voids; the ninth goes to team 1 -> 4-3 on the fallback.
    const s = eightResolved(['team0', 'team0', 'team0', 'team0', 'team1', 'team1', 'void', 'void'])
    const r = ok(s, { type: 'claim', seat: 1, book: 'EIGHTS', assignments: eightsCorrect(s) })
    expect(r.state.phase).toBe('finished')
    expect(setsOf(r.state)).toEqual([4, 3])
    expect(r.events).toContainEqual({ type: 'game_over', score: [4, 3], winner: 0 })
  })

  it('the clinch path is unaffected and still has no tie arm to reach', () => {
    // 4 to team 1 and nothing void: the ninth set clinches at 5 and the fallback is dead code.
    const s = eightResolved(['team0', 'team0', 'team0', 'team0', 'team1', 'team1', 'team1', 'team1'])
    const r = ok(s, { type: 'claim', seat: 1, book: 'EIGHTS', assignments: eightsCorrect(s) })
    expect(setsOf(r.state)).toEqual([4, 5])
    expect(r.events).toContainEqual({ type: 'game_over', score: [4, 5], winner: 1 })
  })
})

/* ----------------------------- §3.1's ordered check table (declare legality) --- */

describe('the declare legality table is checked in its own rule set order (§3.1)', () => {
  it('us54 reports WRONG_PHASE before BOOK_RESOLVED', () => {
    const s = game54(hands54(LOW_C_ON_TEAM_A()), 0)
    const resolved = ok(s, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() }).state
    // Both checks fail at once: LOW-C is resolved AND `awaitPass` offers no declare. §3.1 is an
    // ordered table listing `WRONG_PHASE` first, and clients may branch on the code.
    const both = { ...resolved, phase: 'awaitPass' as const }
    expect(refuse(both, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() }).code).toBe(
      'WRONG_PHASE',
    )
    // Each on its own still reports itself.
    expect(refuse(resolved, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() }).code).toBe(
      'BOOK_RESOLVED',
    )
    const wrongPhaseOnly = { ...s, phase: 'awaitPass' as const }
    expect(refuse(wrongPhaseOnly, { type: 'claim', seat: 0, book: 'LOW-C', assignments: LOW_C_CORRECT() }).code).toBe(
      'WRONG_PHASE',
    )
  })

  it('pagat48 keeps RULES.md §3 opposite order — BOOK_RESOLVED first', () => {
    // RULES.md §3: "legal iff: book unresolved (BOOK_RESOLVED), it's the claimant's turn in
    // playing/endgame phase (NOT_YOUR_TURN/WRONG_PHASE)". The two rule sets genuinely order
    // these differently, so the order is derived per rule set; `pagat48`'s codes are frozen.
    const g = newGame('pagat48-order')
    const book = allBooks(defaultConfig)[0]
    const assignments = {} as Record<Card, Seat>
    const holders = {} as Record<Card, Seat>
    for (const c of bookCards(book, defaultConfig)) {
      assignments[c] = 0
      holders[c] = 0
    }
    const both: GameState = {
      ...g,
      phase: 'awaitPass',
      books: { [book]: { book, outcome: 'team0', claimer: 0, assignments, actualHolders: holders } },
    }
    expect(refuse(both, { type: 'claim', seat: 0, book, assignments }).code).toBe('BOOK_RESOLVED')
  })
})

/* ------------------------------------------------- pagat48 stays untouched --- */

describe('the 48-card default is unaffected (RULES.md, non-negotiable)', () => {
  it('has no window, refuses `decline`, and keeps NOT_YOUR_TURN on claims', () => {
    const g = newGame('pagat48-untouched')
    expect(g.declareWindow).toBeUndefined()
    expect(refuse(g, { type: 'decline', seat: 0 }).code).toBe('NO_DECLARE_WINDOW')
    expect(legalAsks(g, 0).length).toBeGreaterThan(0)
    expect(legalActionsSummary(g)).toEqual({ seat: 0, kinds: ['ask', 'claim'] })
    // Asking is never gated by a window that does not exist.
    const a = legalAsks(g, 0)[0]
    const r = ok(g, { type: 'ask', seat: 0, target: a.target, card: a.card })
    expect(r.state.declareWindow).toBeUndefined()
    expect(Object.keys(r.state)).not.toContain('declareWindow')
  })
})
