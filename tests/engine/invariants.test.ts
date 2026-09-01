/**
 * `checkInvariants` under both rule sets.
 *
 * Three things are under test here, in the order RULES_US54.md asks for them:
 *  - the whole file is **config-derived** (§6) — deck size, set list, canonical order;
 *  - the two `finished` invariants are relaxed for a clinch (§5.1) and *only* for a clinch,
 *    staying in full force for the 48-card default (RULES.md row 22);
 *  - the new deadlock gate of §5 safety requirement 2 — "no legal action exists but phase ≠
 *    finished" — actually fires, and does not fire on healthy play.
 */
import { describe, expect, it } from 'vitest'
import {
  ALL_CARDS,
  allBooks,
  bookCards,
  checkInvariants,
  clinchTarget,
  deckFor,
  defaultConfig,
  newGame,
  randInt,
  reduce,
  rngFromSeed,
  seatTeam,
  sortHand,
  teamSeats,
  us54Config,
} from '../../lib/engine/index.ts'
import type { Card, GameAction, GameState, Seat } from '../../lib/engine/index.ts'
import { distribute, forceState } from './util.ts'

const DECK54 = deckFor(us54Config).cards

/* ------------------------------------------------------------- fixtures --- */

/** Named cards to their seats; everything left of the 54 goes round-robin over `rest`. */
function deal54(spec: Partial<Record<Seat, Card[]>>, rest: readonly Seat[]): Card[][] {
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
  for (const c of DECK54) {
    if (placed.has(c)) continue
    hands[rest[i % rest.length]].push(c)
    i++
  }
  return hands.map((h) => sortHand(h, us54Config))
}

/** A `us54` state with force-set hands, no window unless the patch asks for one. */
function us54State(hands: Card[][], patch: Partial<GameState> = {}): GameState {
  const base = newGame('invariants-crafted', us54Config)
  return {
    ...base,
    hands: hands.map((h) => sortHand(h, us54Config)),
    declareWindow: undefined,
    ...patch,
  }
}

/** One legal action for a running `us54` game, biased towards asking. */
function us54Action(s: GameState, rng: () => number): GameAction {
  if (s.declareWindow) {
    const seat = s.declareWindow.option
    // §3/§4 MUST_DECLARE: while no ask can follow the window there is nothing to close it
    // into, so `decline` is refused and the option seat's only move is a declare. Re-derived
    // locally, like `legalAsksOf`, rather than leaning on the engine's own predicate.
    if (legalAsksOf(s).length > 0 && rng() >= 0.12) return { type: 'decline', seat }
    const unresolved = allBooks(s.config).filter((b) => !s.books[b])
    const book = unresolved[randInt(rng, unresolved.length)]
    const team = teamSeats(seatTeam(seat))
    const informed = rng() < 0.5
    const assignments = {} as Record<Card, Seat>
    for (const c of bookCards(book, s.config)) {
      const holder = s.hands.findIndex((h) => h.includes(c)) as Seat
      assignments[c] = informed && seatTeam(holder) === seatTeam(seat) ? holder : team[randInt(rng, team.length)]
    }
    return { type: 'claim', seat, book, assignments }
  }
  if (s.phase === 'awaitPass') {
    const mates = teamSeats(seatTeam(s.turn)).filter((t) => t !== s.turn && s.hands[t].length > 0)
    return { type: 'pass', seat: s.turn, to: mates[randInt(rng, mates.length)] }
  }
  const asks = legalAsksOf(s)
  const a = asks[randInt(rng, asks.length)]
  return { type: 'ask', seat: s.turn, target: a.target, card: a.card }
}

/** Local re-derivation of the turn-holder's asks, so the test does not lean on one helper. */
function legalAsksOf(s: GameState): { target: Seat; card: Card }[] {
  const hand = s.hands[s.turn]
  const held = new Set(hand)
  const out: { target: Seat; card: Card }[] = []
  const myBooks = new Set(hand.map((c) => bookOf(c, s)))
  for (const target of [0, 1, 2, 3, 4, 5] as Seat[]) {
    if (seatTeam(target) === seatTeam(s.turn) || s.hands[target].length === 0) continue
    for (const card of deckFor(s.config).cards) {
      if (myBooks.has(bookOf(card, s)) && !held.has(card)) out.push({ target, card })
    }
  }
  return out
}

function bookOf(c: Card, s: GameState): string {
  return allBooks(s.config).find((b) => bookCards(b, s.config).includes(c)) ?? '?'
}

/** Play one seeded `us54` game to the end, asserting invariants after every single step. */
function playUs54(seed: string): GameState {
  const rng = rngFromSeed(seed)
  let s = newGame(seed, us54Config, randInt(rng, 6) as Seat)
  expect(checkInvariants(s), `${seed}: fresh deal`).toEqual([])
  let steps = 0
  while (s.phase !== 'finished') {
    if (++steps > 4000) throw new Error(`${seed} did not terminate (phase ${s.phase})`)
    const r = reduce(s, us54Action(s, rng))
    if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code} ${r.error.message}`)
    s = r.state
    expect(checkInvariants(s), `${seed} step ${steps} (phase ${s.phase})`).toEqual([])
  }
  return s
}

/* -------------------------------------------- config-derived, not pinned --- */

describe('checkInvariants is derived from the state config (RULES_US54.md §6)', () => {
  it('accepts a fresh 54-card deal, jokers and all', () => {
    const g = newGame('inv-us54-fresh', us54Config)
    expect(checkInvariants(g)).toEqual([])
    // The regression this guards: a config-free `cardCompare` orders an unknown card at -1 and
    // so sorts the jokers FIRST, where `sortHand` puts them last (§2.3). Whichever seat was
    // dealt a joker would have been reported as non-canonically sorted.
    const jokerHand = g.hands.findIndex((h) => h.includes('XR') || h.includes('XB'))
    expect(jokerHand).toBeGreaterThanOrEqual(0)
    expect(g.hands[jokerHand].length).toBeGreaterThan(1)
    expect(g.hands[jokerHand].at(-1)).toMatch(/^X[RB]$/)
  })

  it('counts conservation against the 54-card deck and the 9-set list', () => {
    const g = newGame('inv-us54-conservation', us54Config)
    expect(g.hands.reduce((n, h) => n + h.length, 0)).toBe(54)
    expect(allBooks(us54Config)).toHaveLength(9)
    // Drop a card and the deck-relative conservation check must notice.
    const short = us54State(g.hands.map((h, i) => (i === 3 ? h.slice(1) : h)))
    expect(checkInvariants(short)).toContain('card conservation broken: 53 cards accounted for, expected 54')
  })

  it('reports a non-canonically sorted 54-card hand', () => {
    const g = newGame('inv-us54-sorted', us54Config)
    const scrambled = us54State(g.hands, { hands: g.hands.map((h, i) => (i === 2 ? [...h].reverse() : h)) })
    expect(checkInvariants(scrambled)).toContain('hand 2 is not canonically sorted')
  })

  it('rejects an EIGHTS result on a 48-card game', () => {
    // `bookCards('EIGHTS', pagat48)` is [] and none of its cards are in the deck, so the only
    // thing that can catch this is the set list itself being config-derived.
    const g = newGame('inv-pagat48-eights')
    const bogus = {
      ...g,
      books: {
        EIGHTS: {
          book: 'EIGHTS' as const,
          outcome: 'team0' as const,
          claimer: 0 as Seat,
          assignments: {} as Record<Card, Seat>,
          actualHolders: {} as Record<Card, Seat>,
        },
      },
    }
    expect(checkInvariants(bogus)).toContain('books contains EIGHTS, which is not a set of this rule set')
  })

  it('leaves the 48-card default reporting exactly what it always did', () => {
    const g = newGame('inv-pagat48-fresh')
    expect(checkInvariants(g)).toEqual([])
    expect(checkInvariants({ ...g, phase: 'finished' })).toEqual([
      'finished: only 0 books resolved',
      'finished: a hand still has cards',
    ])
  })
})

/* ------------------------------------------------- the declare window (§3) --- */

describe('the declare window is structurally checked (RULES_US54.md §3)', () => {
  it('refuses a window on a rule set that has none', () => {
    const g = newGame('inv-pagat48-window')
    const bogus = { ...g, declareWindow: { option: 0 as Seat, declined: 0 } }
    expect(checkInvariants(bogus)).toContain('declareWindow open under a rule set whose declares are ownTurn')
  })

  it('refuses a stale window in a phase that offers no declare', () => {
    const g = newGame('inv-us54-stale-window', us54Config)
    expect(g.declareWindow).toBeDefined()
    // `awaitPass` is not a declare phase (§3.1); a window surviving into it would let `decline`
    // churn forever while the pass that the phase is waiting for never happens.
    const stale = { ...g, phase: 'awaitPass' as const }
    expect(checkInvariants(stale)).toContain('declareWindow open in phase awaitPass')
  })

  it('refuses a decline count outside 0..5', () => {
    const g = newGame('inv-us54-declined', us54Config)
    const bogus = { ...g, declareWindow: { option: 1 as Seat, declined: 6 } }
    expect(checkInvariants(bogus)).toContain('declareWindow.declined 6 is outside 0..5')
  })
})

/* ------------------------------------------ the finished invariants (§5.1) --- */

describe('the finished invariants are relaxed for a clinch and only for a clinch (§5.1)', () => {
  it('accepts a real clinched game with sets unresolved and cards still in hands', () => {
    const s = playUs54('inv-clinch-1')
    expect(s.phase).toBe('finished')
    const resolved = allBooks(s.config).filter((b) => s.books[b]).length
    expect(resolved).toBeLessThan(9)
    expect(s.hands.some((h) => h.length > 0)).toBe(true)
    const sets = allBooks(s.config).reduce<[number, number]>(
      (acc, b) => {
        const o = s.books[b]?.outcome
        if (o === 'team0') acc[0]++
        else if (o === 'team1') acc[1]++
        return acc
      },
      [0, 0],
    )
    expect(Math.max(sets[0], sets[1])).toBe(clinchTarget(us54Config))
    // The whole point: neither "only N books resolved" nor "a hand still has cards" fires here.
    expect(checkInvariants(s)).toEqual([])
  })

  it('still reports a `us54` game that finished without clinching anything', () => {
    const g = newGame('inv-us54-early-finish', us54Config)
    const early = us54State(g.hands, { phase: 'finished' })
    expect(checkInvariants(early)).toContain(
      'finished: no team reached the clinch target of 5 sets (awarded 0-0) and only 0/9 books resolved',
    )
  })

  it('keeps both `allResolved` checks in force for the 48-card default', () => {
    // RULES.md row 22 is unchanged: a `pagat48` game is over only when all 8 sets are resolved.
    const g = newGame('inv-pagat48-early-finish')
    const v = checkInvariants({ ...g, phase: 'finished' })
    expect(v).toContain('finished: only 0 books resolved')
    expect(v).toContain('finished: a hand still has cards')
  })
})

/* -------------------------------------- the deadlock gate (§5 safety req 2) --- */

describe('no legal action exists but phase is not finished (RULES_US54.md §5 safety req 2)', () => {
  /** Seat 0 holds LOW-C entire, so every LOW-C card is either held or off-limits: zero asks. */
  const LOW_C: Card[] = ['2C', '3C', '4C', '5C', '6C', '7C']

  it('fires when a `us54` window closes onto a turn-holder who cannot ask', () => {
    // This is the exact shape `reduceDecline` refuses to create — the window stays open when
    // the turn-holder has no legal ask (§4). If that guard were ever removed, the game would
    // sit in `playing` with no legal action at all and the room would hang silently.
    const s = us54State(deal54({ 0: LOW_C }, [1, 2, 3, 4, 5]))
    expect(legalAsksOf(s)).toEqual([])
    expect(checkInvariants(s)).toEqual(['no legal action exists for seat 0 but phase is playing, not finished'])
  })

  it('does not fire on the same state with the window open — `decline` is always legal', () => {
    const s = us54State(deal54({ 0: LOW_C }, [1, 2, 3, 4, 5]), {
      declareWindow: { option: 4, declined: 3 },
    })
    expect(checkInvariants(s)).toEqual([])
  })

  it('does not fire on the same shape under `pagat48`, where a claim is a turn action', () => {
    // RULES.md row 11 makes a claim legal on your own turn, so an askless turn-holder still has
    // a move. The gate must not report the 48-card default as deadlocked.
    const s = forceState(distribute({ 0: LOW_C }, [1, 2, 3, 4, 5]))
    expect(s.hands[0]).toEqual(sortHand(LOW_C))
    expect(checkInvariants(s)).toEqual([])
  })

  it('fires in `awaitPass` when no teammate is left to receive the pass', () => {
    const hands = distribute({ 0: [], 2: [], 4: [] }, [1, 3, 5])
    const s = forceState(hands, { phase: 'awaitPass', turn: 0 })
    const v = checkInvariants(s)
    expect(v).toContain('awaitPass: no teammate with cards to receive the pass')
    expect(v).toContain('no legal action exists for seat 0 but phase is awaitPass, not finished')
  })

  it('does not fire on a healthy `awaitDesignate` — an opponent is there to designate', () => {
    // Turn team empty is exactly what `awaitDesignate` means (RULES.md §4); the opponents hold
    // the rest, so the designate is available and the gate must stay quiet.
    const s = forceState(distribute({ 1: [], 3: [], 5: [] }, [0, 2, 4]), {
      phase: 'awaitDesignate',
      turn: 1,
    })
    expect(checkInvariants(s)).toEqual([])
  })

  it('never fires across a run of complete `us54` games (§7 vector 10, invariants half)', () => {
    for (let g = 0; g < 60; g++) playUs54(`inv-soak-${g}`)
  })

  it('never fires across a run of complete `pagat48` games (RULES.md, unchanged)', () => {
    for (let g = 0; g < 40; g++) {
      const seed = `inv-pagat48-soak-${g}`
      const rng = rngFromSeed(seed)
      let s = newGame(seed, defaultConfig, randInt(rng, 6) as Seat)
      expect(checkInvariants(s)).toEqual([])
      let steps = 0
      while (s.phase !== 'finished') {
        if (++steps > 4000) throw new Error(`${seed} did not terminate`)
        const r = reduce(s, pagat48Action(s, rng))
        if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code} ${r.error.message}`)
        s = r.state
        expect(checkInvariants(s), `${seed} step ${steps} (phase ${s.phase})`).toEqual([])
      }
    }
  })
})

/** One legal `pagat48` action — the shape of tests/engine/policy.ts, kept local and minimal. */
function pagat48Action(s: GameState, rng: () => number): GameAction {
  const seat = s.turn
  if (s.phase === 'awaitPass') {
    const mates = teamSeats(seatTeam(seat)).filter((t) => t !== seat && s.hands[t].length > 0)
    return { type: 'pass', seat, to: mates[randInt(rng, mates.length)] }
  }
  if (s.phase === 'awaitDesignate') {
    const opp = teamSeats(seatTeam(seat) === 0 ? 1 : 0).filter((t) => s.hands[t].length > 0)
    return { type: 'designate', seat, to: opp[randInt(rng, opp.length)] }
  }
  const asks = legalAsksOf(s)
  if (s.phase === 'playing' && asks.length > 0 && rng() > Math.min(0.02 + s.moveIndex / 1500, 0.6)) {
    const a = asks[randInt(rng, asks.length)]
    return { type: 'ask', seat, target: a.target, card: a.card }
  }
  const unresolved = allBooks(s.config).filter((b) => !s.books[b])
  const book = unresolved[randInt(rng, unresolved.length)]
  const team = teamSeats(seatTeam(seat))
  const informed = rng() < 0.5
  const assignments = {} as Record<Card, Seat>
  for (const c of bookCards(book, s.config)) {
    const holder = s.hands.findIndex((h) => h.includes(c)) as Seat
    assignments[c] = informed && seatTeam(holder) === seatTeam(seat) ? holder : team[randInt(rng, team.length)]
  }
  return { type: 'claim', seat, book, assignments }
}

/* --------------------------------------------- the 48-card deck is intact --- */

describe('the pagat48 module constants are unchanged (non-negotiable)', () => {
  it('still describes a 48-card, 8-set world', () => {
    expect(ALL_CARDS).toHaveLength(48)
    expect(allBooks(defaultConfig)).toHaveLength(8)
    expect(allBooks(defaultConfig).includes('EIGHTS')).toBe(false)
  })
})
