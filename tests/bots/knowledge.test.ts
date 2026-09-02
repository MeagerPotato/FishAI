/**
 * Knowledge-engine correctness: scripted inference scenarios plus a
 * ground-truth soundness sweep over 300 full games per rule set (the TEST reads
 * true state; the bots never do).
 *
 * This file is the **only** detector for deck-pinned inference bugs. A knowledge
 * core that keeps a 48-card assumption under `us54` does not crash and does not
 * produce a type error — it silently eliminates seats that were still possible
 * and starts returning confident wrong answers from `holderOf`. So both sweeps
 * assert the same two soundness properties against the true hands:
 *   1. every card the knowledge calls CERTAIN really is where it says, and
 *   2. the true holder of every live card is always still a candidate
 * and both throw with the seed, step and seat on the first violation.
 */
import { describe, expect, it } from 'vitest'
import {
  BASELINE_ASK_WEIGHTS,
  STYLE_ROSTER,
  allBooks,
  allCards,
  bookCards,
  buildKnowledge,
  candidates,
  cardBook,
  certainCards,
  decide,
  hashSeed,
  holderOf,
  legalActionsSummary,
  legalAsks,
  newGame,
  randInt,
  rankAsks,
  rankAsksWith,
  reduce,
  rngFromSeed,
  seatTeam,
  seatView,
  teamSeats,
  turnHolderCanAsk,
  us54Config,
} from '../../lib/engine/index.ts'
import type {
  BookId,
  BookResult,
  Card,
  GameAction,
  GameState,
  PublicEvent,
  Seat,
  SeatView,
} from '../../lib/engine/index.ts'
import { ask, collectBotViews, gs, mkView } from './util.ts'

/** `mkView` with the 54-card rule set swapped in (RULES_US54.md §6). */
function mkView54(v: Parameters<typeof mkView>[0]): SeatView {
  return { ...mkView(v), config: us54Config }
}

/** Deck coverage: every card of the config's deck is either live or gone, never missing. */
function expectCoversDeck(k: ReturnType<typeof buildKnowledge>, size: number): void {
  expect(Object.keys(k.cands).length + k.gone.length).toBe(size)
}

describe('knowledge: scripted scenarios', () => {
  it('a hit fixes the holder (public transfer)', () => {
    const view = mkView({
      seat: 0,
      hand: ['2C', '3C', '4C', '5C', '6C', '7C', '2D', '3D'],
      counts: [8, 9, 7, 8, 8, 8],
      log: [gs, ask(1, 2, '9H', true)],
    })
    const k = buildKnowledge(view)
    expect(holderOf(k, '9H')).toBe(1)
    expect(candidates(k, '9H')).toEqual([1])
    expect(certainCards(k, 1)).toContain('9H')
    expectCoversDeck(k, 48) // the default deck stays 48 cards (RULES.md row 2)
  })

  it('a miss excludes both the asker and the target', () => {
    const view = mkView({
      seat: 0,
      hand: ['2C', '3C', '4C', '5C', '6C', '7C', '2D', '3D'],
      counts: [8, 8, 8, 8, 8, 8],
      log: [gs, ask(1, 2, '9H', false)],
    })
    const k = buildKnowledge(view)
    const cand = candidates(k, '9H')
    expect(cand).not.toContain(1)
    expect(cand).not.toContain(2)
    expect(cand).not.toContain(0) // own hand: not mine either
    expect(cand.sort()).toEqual([3, 4, 5])
  })

  it('an ask implies an asker-holds-book constraint that later collapses to certainty', () => {
    // Seat 1 asks for 5H => holds >= 1 of {2H,3H,4H,6H,7H}. Subsequent misses
    // rule seat 1 out of 2H/3H/4H/6H, so elimination forces 7H onto seat 1.
    const view = mkView({
      seat: 0,
      hand: ['2C', '3C', '4C', '5C', '6C', '7C', '2D', '3D'],
      counts: [8, 8, 8, 8, 8, 8],
      log: [
        gs,
        ask(1, 0, '5H', false),
        ask(2, 1, '2H', false),
        ask(4, 1, '3H', false),
        ask(2, 1, '4H', false),
        ask(4, 1, '6H', false),
      ],
    })
    const k = buildKnowledge(view)
    expect(holderOf(k, '7H')).toBe(1)
    expect(candidates(k, '7H')).toEqual([1])
    // The collapsed constraint is gone from the surviving list.
    expect(k.constraints.every((c) => !(c.seat === 1 && c.cards.includes('7H')))).toBe(true)
  })

  it('a claim reveal marks all six cards out of play', () => {
    const book: BookId = 'LOW-H'
    const actualHolders = {
      '2H': 1,
      '3H': 1,
      '4H': 3,
      '5H': 3,
      '6H': 5,
      '7H': 5,
    } as Record<Card, Seat>
    const claim: PublicEvent = {
      type: 'claim',
      claimer: 1,
      book,
      assignments: actualHolders,
      actualHolders,
      outcome: 'team1',
    }
    const view = mkView({
      seat: 0,
      hand: ['2C', '3C', '4C', '5C', '6C', '7C', '2D', '3D'],
      counts: [8, 6, 8, 6, 8, 6],
      log: [gs, claim],
      books: {
        [book]: { book, outcome: 'team1', claimer: 1, assignments: actualHolders, actualHolders },
      },
      score: [0, 1],
    })
    const k = buildKnowledge(view)
    for (const c of ['2H', '3H', '4H', '5H', '6H', '7H'] as Card[]) {
      expect(holderOf(k, c)).toBeNull()
      expect(candidates(k, c)).toEqual([])
      expect(k.gone).toContain(c)
    }
  })

  it('count exhaustion: a seat with k cards and k known cards holds nothing else', () => {
    // Seat 3 publicly took 9C and TC and now holds exactly 2 cards.
    const view = mkView({
      seat: 0,
      hand: ['2C', '3C', '4C', '5C', '6C', '7C', '2D', '3D'],
      counts: [8, 8, 6, 2, 8, 8],
      log: [gs, ask(3, 2, '9C', true), ask(3, 2, 'TC', true)],
    })
    const k = buildKnowledge(view)
    expect(holderOf(k, '9C')).toBe(3)
    expect(holderOf(k, 'TC')).toBe(3)
    expect(certainCards(k, 3)).toEqual(['9C', 'TC'])
    expect(k.unknownSlots[3]).toBe(0)
    for (const c of ['AH', 'QS', '4D', 'JC'] as Card[]) {
      expect(candidates(k, c)).not.toContain(3)
    }
  })

  it('own hand is fully known: YES for me, NO elsewhere', () => {
    const view = mkView({
      seat: 2,
      hand: ['9H', 'TH', 'JH'],
      counts: [8, 8, 3, 8, 8, 8],
      log: [gs],
      turn: 2,
    })
    const k = buildKnowledge(view)
    expect(certainCards(k, 2)).toEqual(['9H', 'TH', 'JH'])
    expect(candidates(k, 'QH')).not.toContain(2) // not in my hand => not mine
    expect(holderOf(k, '9H')).toBe(2)
  })
})

describe('knowledge under us54: the 54-card deck and the EIGHTS set', () => {
  /** Nine cards, none of them an 8 or a joker — a clean `us54` viewer hand. */
  const MY_NINE: Card[] = ['2C', '3C', '4C', '5C', '6C', '7C', '9C', 'TC', 'JC']

  it('reasons over all 54 cards, jokers included', () => {
    const view = mkView54({
      seat: 0,
      hand: MY_NINE,
      counts: [9, 10, 8, 9, 9, 9],
      log: [gs, ask(1, 2, 'XR', true)],
    })
    const k = buildKnowledge(view)
    expectCoversDeck(k, 54)
    // A hit is a public transfer in either rule set — including of a joker,
    // which a 48-card index would simply have dropped on the floor.
    expect(holderOf(k, 'XR')).toBe(1)
    expect(candidates(k, 'XR')).toEqual([1])
    expect(certainCards(k, 1)).toEqual(['XR'])
    // The 8s are real cards here, not the absent ranks of RULES.md row 2.
    expect(candidates(k, '8H').length).toBeGreaterThan(0)
    expect(candidates(k, '8H')).not.toContain(0) // not in my hand => not mine
  })

  it('the EIGHTS ask licence is uniform: a miss chain forces the last joker (§1 row 6)', () => {
    // Seat 1 asks for 8C, so seat 1 was dealt >= 1 of {8D,8H,8S,XR,XB} — RULES_US54.md
    // §1 row 6 makes holding *any* EIGHTS card licence *any* EIGHTS ask, so the
    // disjunction spans 8s and jokers alike with no suit reasoning anywhere.
    // Four later misses kill every disjunct but XB, which is therefore seat 1's.
    const view = mkView54({
      seat: 0,
      hand: MY_NINE,
      counts: [9, 9, 9, 9, 9, 9],
      log: [
        gs,
        ask(1, 0, '8C', false),
        ask(2, 1, '8D', false),
        ask(4, 1, '8H', false),
        ask(2, 1, '8S', false),
        ask(4, 1, 'XR', false),
      ],
    })
    const k = buildKnowledge(view)
    expect(holderOf(k, 'XB')).toBe(1)
    expect(candidates(k, 'XB')).toEqual([1])
    expect(k.constraints.every((c) => !(c.seat === 1 && c.cards.includes('XB')))).toBe(true)
  })

  it('a resolved EIGHTS set is out of play even when its claim is not in the log', () => {
    // `view.books` is public table state, not memory, so resolved sets are re-applied
    // from the set list after the walk. That list must be the CONFIG's — a 48-card
    // ALL_BOOKS has no 'EIGHTS' entry and would leave six phantom cards in circulation.
    const eights = bookCards('EIGHTS', us54Config)
    const actualHolders = Object.fromEntries(eights.map((c, i) => [c, (i % 6) as Seat])) as Record<Card, Seat>
    const result: BookResult = {
      book: 'EIGHTS',
      outcome: 'team0',
      claimer: 0,
      assignments: actualHolders,
      actualHolders,
    }
    const view = mkView54({
      seat: 0,
      // 8C went with the resolved set, so the viewer is down to eight cards.
      hand: MY_NINE.slice(0, 8),
      counts: [8, 8, 8, 8, 8, 8], // 48 live cards = 54 - the resolved six
      log: [gs], // deliberately no claim event: `view.books` alone must do it
      books: { EIGHTS: result },
      score: [1, 0],
    })
    const k = buildKnowledge(view)
    expect(eights).toHaveLength(6)
    for (const c of eights) {
      expect(holderOf(k, c)).toBeNull()
      expect(candidates(k, c)).toEqual([])
      expect(k.gone).toContain(c)
    }
    expectCoversDeck(k, 54)
  })

  it('historical count exhaustion uses the 9-card deal size, never a hardcoded 8', () => {
    // THE canary for the highest-risk literal in knowledge.ts. Seat 2 is stripped of
    // exactly 8 of its 9 dealt cards, so it still holds one unknown card. Replaying the
    // deal at 8 per seat would make seat 2's replayed count hit 0 here and "prove" it
    // holds nothing else — eliminating a seat that is genuinely still possible for every
    // unfixed card. Nothing throws when that happens; the knowledge just goes wrong.
    const taken: Card[] = ['2C', '3C', '4C', '5C', '6C', '7C', '9C', 'TC']
    const view = mkView54({
      seat: 0,
      hand: ['2D', '3D', '4D', '5D', '6D', '7D', '9D', 'TD', 'JD'],
      counts: [9, 17, 1, 9, 9, 9], // 9 + 17 + 1 + 9 + 9 + 9 = 54
      log: [gs, ...taken.map((c) => ask(1, 2, c, true))],
    })
    const k = buildKnowledge(view)
    expect(view.counts.reduce((a, b) => a + b, 0)).toBe(54)
    for (const c of taken) expect(holderOf(k, c)).toBe(1)
    // Seat 2's last card is still unidentified, so seat 2 is still a live candidate.
    expect(k.unknownSlots[2]).toBe(1)
    for (const c of ['XR', 'XB', '8H', 'AS'] as Card[]) {
      expect(candidates(k, c)).toContain(2)
    }
    expect(certainCards(k, 2)).toEqual([])
  })

  it('coach reasons name jokers in words — an EIGHTS card has no suit to render', () => {
    // The `'EIGHTS'.split('-')` / `card[1] as Suit` family of bugs, in the one place
    // knowledge.ts formats a card. 'XR'[1] is 'R', which is not a Suit.
    const view = mkView54({
      seat: 0,
      hand: ['8C', '2C', '3C', '4C', '5C', '6C', '7C', '9C', 'TC'],
      counts: [9, 9, 9, 9, 9, 9],
      log: [gs],
      turn: 0,
    })
    // certainCards reports in the config's canonical order, which slots the 8 into
    // its natural rank position between the 7 and the 9 (RULES_US54.md §2.3).
    expect(certainCards(buildKnowledge(view), 0)).toEqual([
      '2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', 'TC',
    ])
    const ranked = rankAsks(view)
    expect(ranked.length).toBeGreaterThan(0)
    for (const r of ranked) {
      expect(r.reason.length).toBeGreaterThan(0)
      expect(r.reason).not.toContain('undefined')
    }
    // Holding 8C licences asking for either joker (§1 row 6), and both render readably.
    const jokerAsks = ranked.filter((r) => r.card === 'XR' || r.card === 'XB')
    expect(jokerAsks.length).toBeGreaterThan(0)
    for (const r of jokerAsks) expect(r.reason).toContain('joker')
    const eightAsks = ranked.filter((r) => r.card === '8H')
    expect(eightAsks.length).toBeGreaterThan(0)
    for (const r of eightAsks) expect(r.reason).toContain('8♥')
  })
})

describe('knowledge: ground-truth soundness (300 medium games)', () => {
  it(
    'certainty NEVER contradicts the true state; the true holder is always a candidate',
    () => {
      const GAMES = 300
      let checkedStates = 0
      let certaintyChecks = 0
      for (let g = 0; g < GAMES; g++) {
        const seed = `ktruth-${g}`
        let state = newGame(seed, undefined, (g % 6) as Seat)
        let steps = 0
        while (state.phase !== 'finished' && steps < 5000) {
          const action = decide(seatView(state, state.turn), 'medium', hashSeed(`${seed}:${state.moveIndex}`)())
          const r = reduce(state, action)
          if (!r.ok) throw new Error(`${seed} step ${steps}: medium bot illegal (${r.error.code})`)
          state = r.state
          steps++
          // Verify the acting seat's knowledge every step; all six seats
          // periodically (broader coverage at bounded cost).
          const seats: Seat[] =
            steps % 25 === 0 ? [0, 1, 2, 3, 4, 5] : [state.turn]
          for (const seat of seats) {
            const k = buildKnowledge(seatView(state, seat))
            checkedStates++
            assertSound(k, state, seed, steps, seat)
            certaintyChecks += Object.keys(k.holders).length
          }
        }
        if (state.phase !== 'finished') throw new Error(`${seed}: did not finish (${state.phase})`)
      }
      expect(checkedStates).toBeGreaterThan(10_000)
      expect(certaintyChecks).toBeGreaterThan(50_000)
    },
    300_000,
  )
})

/* ------------------------------------ us54 ground-truth soundness sweep --- */

/**
 * A seeded random `us54` driver, lifted from the §7 vector-10 soak in
 * tests/engine/us54-declare.test.ts. The bot policy in decide.ts is still
 * pagat48-pinned (it rejects every out-of-turn declare and has no `decline`),
 * so the 54-card sweep drives the engine directly rather than through `decide`.
 * The knowledge under test is built from `seatView` either way — the driver only
 * decides which positions get visited.
 */
function randomDeclare54(s: GameState, seat: Seat, rng: () => number): GameAction {
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

function us54Action(s: GameState, rng: () => number): GameAction {
  // RULES_US54.md §3: while the window is open the seat to move is the option
  // holder, not the turn-holder, and its only choices are declare or decline.
  if (s.declareWindow) {
    const seat = s.declareWindow.option
    // §3: `decline` is refused (`MUST_DECLARE`) in a window no ask can follow, so the option
    // seat's only move there is the declare that guarantees the game terminates.
    if (!turnHolderCanAsk(s)) return randomDeclare54(s, seat, rng)
    return rng() < 0.12 ? randomDeclare54(s, seat, rng) : { type: 'decline', seat }
  }
  if (s.phase === 'awaitPass') {
    const mates = teamSeats(seatTeam(s.turn)).filter((t) => s.hands[t].length > 0)
    return { type: 'pass', seat: s.turn, to: mates[randInt(rng, mates.length)] }
  }
  const asks = legalAsks(s, s.turn)
  const a = asks[randInt(rng, asks.length)]
  return { type: 'ask', seat: s.turn, target: a.target, card: a.card }
}

describe('knowledge under us54: ground-truth soundness (300 games, 54-card deck)', () => {
  it(
    'certainty NEVER contradicts the true state across the whole 54-card deck',
    () => {
      const GAMES = 300
      const deck54 = allCards(us54Config)
      let checkedStates = 0
      let certaintyChecks = 0
      let eightsCertainties = 0
      let eightsResolutions = 0
      for (let g = 0; g < GAMES; g++) {
        const seed = `ktruth54-${g}`
        const rng = rngFromSeed(`${seed}:policy`)
        let state = newGame(seed, us54Config, (g % 6) as Seat)
        let steps = 0
        while (state.phase !== 'finished' && steps < 5000) {
          const r = reduce(state, us54Action(state, rng))
          if (!r.ok) throw new Error(`${seed} step ${steps}: policy illegal (${r.error.code})`)
          state = r.state
          steps++
          // The seat to move — under an open window that is the option holder,
          // not `state.turn`. All six seats periodically, as in the 48-card sweep.
          const seats: Seat[] =
            steps % 25 === 0 ? [0, 1, 2, 3, 4, 5] : [legalActionsSummary(state).seat]
          for (const seat of seats) {
            const k = buildKnowledge(seatView(state, seat))
            checkedStates++
            assertSound(k, state, seed, steps, seat)
            // The inference must span the whole 54-card deck, not a 48-card slice.
            expectCoversDeck(k, deck54.length)
            certaintyChecks += Object.keys(k.holders).length
            for (const c of Object.keys(k.holders) as Card[]) {
              if (cardBook(c) === 'EIGHTS') eightsCertainties++
            }
          }
        }
        if (state.phase !== 'finished') throw new Error(`${seed}: did not finish (${state.phase})`)
        if (state.books.EIGHTS) eightsResolutions++
      }
      expect(deck54).toHaveLength(54)
      expect(checkedStates).toBeGreaterThan(10_000)
      expect(certaintyChecks).toBeGreaterThan(50_000)
      // Coverage floors: without these the sweep could pass by inferring nothing
      // at all about the six cards that only exist under this rule set.
      expect(eightsCertainties).toBeGreaterThan(1_000)
      expect(eightsResolutions).toBeGreaterThan(10)
    },
    600_000,
  )
})

/* ------------------------------------ the ask scorer and its dead asks --- */

/**
 * **A teammate certainly holds the asked card.** MONET.md §3.2's third defect, in one position.
 *
 * Seat 0 holds four of LOW-C. `6C` was publicly taken by seat **2**, a teammate, and `7C` by
 * seat **1**, an opponent (RULES_US54.md §1 row 1 — the seats alternate). So the team certainly
 * accounts for five of the six, and the card it is short of is `7C`, not `6C`.
 *
 * Asking an opponent for `6C` is legal — row 6 licences the set and row 7 only forbids naming a
 * card *you* hold — and is a guaranteed miss. It used to score the whole
 * `18·(5/6) + 12 + 25 = 52.00` on Punter's weights: the full progress term, the full narrowing
 * credit, and the completion bonus, for an ask that cannot hit and would complete nothing.
 */
function teammateHoldsTheAskedCard(): SeatView {
  return mkView54({
    seat: 0,
    hand: ['2C', '3C', '4C', '5C', '9D', 'TD'],
    counts: [6, 10, 10, 8, 12, 8], // 6 + 10 + 10 + 8 + 12 + 8 = 54
    turn: 0,
    log: [gs, ask(2, 5, '6C', true), ask(1, 3, '7C', true)],
  })
}

/**
 * **An opponent certainly holds the asked card**, and nothing is near completion: seat 0 holds
 * three of LOW-C, seat 3 publicly took `6C`, and the last two are unplaced. The team accounts
 * for three of six, so no `gambleBonus` is in play at any weights — which leaves the narrowing
 * credit alone to be looked at, and leaves seat 3 as a certain hit to read it against.
 */
function opponentHoldsTheAskedCard(): SeatView {
  return mkView54({
    seat: 0,
    hand: ['2C', '3C', '4C', '9D', 'TD'],
    counts: [5, 10, 10, 11, 9, 9], // 5 + 10 + 10 + 11 + 9 + 9 = 54
    turn: 0,
    log: [gs, ask(3, 5, '6C', true)],
  })
}

/**
 * **The sixth card really is the sixth, and really is unplaced.** Seat 0 holds five of LOW-C and
 * three recorded misses pin `6C` to `{2, 4}` — both of them teammates. The control for the GAMBLE
 * fix: the team is one card short, that card is `6C`, so the completion bonus is earned and the
 * gamble guard must not touch it.
 *
 * It is emphatically *not* a control for the narrowing fix, though an earlier reading of it said
 * so on the grounds that "a miss on a two-candidate card would pin it". A miss by seat 1, 3 or 5
 * pins nothing: those seats were never candidates, so the ask's outcome cannot remove one and the
 * candidate set comes back `{2, 4}` either way. This is the dominant class of provable miss and
 * the narrowing fix is exactly what removes its credit.
 *
 * (No opponent can answer the ask either, which is `minHitP`'s business — roster.test.ts.)
 */
function theSixthCardIsGenuinelyMissing(): SeatView {
  return mkView54({
    seat: 0,
    hand: ['2C', '3C', '4C', '5C', '7C', '9D'],
    counts: [6, 10, 10, 10, 6, 12], // 6 + 10 + 10 + 10 + 6 + 12 = 54
    turn: 0,
    log: [gs, ask(0, 1, '6C', false), ask(0, 3, '6C', false), ask(0, 5, '6C', false)],
  })
}

/** One ask's score, by card and target — throws rather than returning undefined. */
function scoreOf(ranked: ReturnType<typeof rankAsks>, card: Card, target: Seat): number {
  const r = ranked.find((x) => x.card === card && x.target === target)
  if (r === undefined) throw new Error(`no ranked ask ${card}@${target}`)
  return r.score
}

/** The scorer rounds to 2dp, so an expected value built from 5/6 has to be rounded the same way. */
function round2(x: number): number {
  return Math.round(x * 100) / 100
}

describe('the ask scorer pays nothing for a dead ask (MONET.md §3.2)', () => {
  it('the 52.00 signature: an ask that cannot hit and completes nothing now scores 15.00', () => {
    const view = teammateHoldsTheAskedCard()
    const k = buildKnowledge(view)
    // The position is what its builder claims: 6C is certain at a TEAMMATE, so every legal ask
    // for it is a provable miss, and the card the team is actually short of is 7C.
    expect(holderOf(k, '6C')).toBe(2)
    expect(seatTeam(2)).toBe(seatTeam(0))
    expect(holderOf(k, '7C')).toBe(1)
    const ranked = rankAsksWith(view, k, STYLE_ROSTER.punter)
    expect(ranked.find((r) => r.card === '6C' && r.target === 1)?.p).toBe(0)
    // 18·(5/6) survives — five of the six really are on this team. The 12 and the 25 do not: a
    // known miss narrows nothing, and 6C is one of the five, so a hit completes nothing.
    expect(round2(18 * (5 / 6) + 12 + 25)).toBe(52)
    expect(scoreOf(ranked, '6C', 1)).toBe(15)
    expect(scoreOf(ranked, '6C', 3)).toBe(15)
    expect(scoreOf(ranked, '6C', 5)).toBe(15)
  })

  it('...while the ask for the card the team IS missing keeps its completion bonus', () => {
    // The same position, a different card, and the reason the gamble is fixed rather than
    // deleted. 7C is the one card of LOW-C this team does not hold, so a hit really would
    // complete the set: the 25 stays. Seats 3 and 5 are not candidates for it, so only the
    // narrowing credit goes — 40.00 = 18·(5/6) + 25, down from the same 52.00.
    const view = teammateHoldsTheAskedCard()
    const ranked = rankAsksWith(view, buildKnowledge(view), STYLE_ROSTER.punter)
    for (const target of [3, 5] as Seat[]) {
      expect(ranked.find((r) => r.card === '7C' && r.target === target)?.p).toBe(0)
      expect(scoreOf(ranked, '7C', target)).toBe(40)
    }
    // And the seat that actually holds it is a certain hit, still sorted top:
    // 142 = 70 + 18·(5/6) + 12 + 20 + 25.
    expect([ranked[0].card, ranked[0].target, ranked[0].p, ranked[0].score]).toEqual(['7C', 1, 1, 142])
  })

  it('the completion bonus is refused when a TEAMMATE holds the asked card', () => {
    // `wNarrow: 0` takes the narrowing fix out of the arithmetic, so the gamble is the only term
    // left that can move: 15.00 where it is refused, 40.00 where it is earned.
    const gambleOnly = { ...BASELINE_ASK_WEIGHTS, wNarrow: 0, gambleBonus: 25 }
    const dead = teammateHoldsTheAskedCard()
    expect(scoreOf(rankAsksWith(dead, buildKnowledge(dead), gambleOnly), '6C', 1)).toBe(15)
    const earned = theSixthCardIsGenuinelyMissing()
    expect(scoreOf(rankAsksWith(earned, buildKnowledge(earned), gambleOnly), '6C', 1)).toBe(40)
  })

  it('a known miss narrows nothing when the card is PINNED, on the shipped weights', () => {
    // |cand| == 1. 6C is certain at seat 3, so asking seat 1 or seat 5 for it cannot move a
    // single candidate seat. The 12-point narrowing credit is gone and the progress term is all
    // that is left: 9.00 = 18·(3/6).
    const view = opponentHoldsTheAskedCard()
    const ranked = rankAsksWith(view, buildKnowledge(view), BASELINE_ASK_WEIGHTS)
    expect(scoreOf(ranked, '6C', 1)).toBe(9)
    expect(scoreOf(ranked, '6C', 5)).toBe(9)
  })

  it('...and when the card has TWO candidates, neither of them the seat being asked', () => {
    // |cand| >= 2, which is the case the first shape of this fix missed entirely and the one that
    // carries the volume. Keying the credit off `cand.length` alone paid a *2-candidate* miss the
    // maximum 1 — the same credit as a certain hit — because `1 / (2 - 1)` is 1. The test that
    // was supposed to cover "a known miss narrows nothing" only ever exercised `|cand| == 1`, so
    // it passed throughout.
    //
    // Here 6C is pinned to {2, 4}, both of them the asker's own teammates, so seats 1, 3 and 5
    // are all provable misses on a two-candidate card. The credit must be 0 for every one of
    // them, exactly as it is for the pinned case above.
    const view = theSixthCardIsGenuinelyMissing()
    const k = buildKnowledge(view)
    expect(candidates(k, '6C')).toEqual([2, 4])
    const withNarrow = rankAsksWith(view, k, BASELINE_ASK_WEIGHTS)
    const withoutNarrow = rankAsksWith(view, k, { ...BASELINE_ASK_WEIGHTS, wNarrow: 0 })
    for (const target of [1, 3, 5] as Seat[]) {
      expect(scoreOf(withNarrow, '6C', target), `6C@${target}`).toBe(scoreOf(withoutNarrow, '6C', target))
      // 15.00 = 18·(5/6), the progress term alone — `BASELINE_ASK_WEIGHTS` carries no gamble.
      expect(scoreOf(withNarrow, '6C', target), `6C@${target}`).toBe(15)
    }
  })

  it('...but a CERTAIN hit keeps it, which is what holds the certain-hit floor at 102', () => {
    // The other position `cand.length <= 1` covers, and the reason the guard is not simply
    // zeroed. A certain hit's floor is `wHit + wNarrow + certaintyBonus`; the dominance
    // argument in `rankAsksWith`'s doc comment (certain >= 102, uncertain < 100) is exactly
    // `wNarrow` wide, so zeroing it here would let an uncertain ask outrank a certain hit.
    // 111 = 70 + 18·(3/6) + 12 + 20.
    const view = opponentHoldsTheAskedCard()
    const ranked = rankAsksWith(view, buildKnowledge(view), BASELINE_ASK_WEIGHTS)
    expect(scoreOf(ranked, '6C', 3)).toBe(111)
    expect([ranked[0].card, ranked[0].target, ranked[0].p]).toEqual(['6C', 3, 1])
    expect(BASELINE_ASK_WEIGHTS.wHit + BASELINE_ASK_WEIGHTS.wNarrow + BASELINE_ASK_WEIGHTS.certaintyBonus).toBe(102)
  })

  it('the EARNED credit survives: the genuinely-missing sixth card keeps its 25, and loses the 12', () => {
    // The census position of MONET.md §3.2, and what the two fixes do to it between them. The
    // gamble is earned — the team holds five of LOW-C and 6C really is the sixth — so it stays.
    // The narrowing was not: no seat this ask can be addressed to is a candidate. 40.00 =
    // 18·(5/6) + 25, down from the 52.00 = 18·(5/6) + 12 + 25 the census recorded.
    const view = theSixthCardIsGenuinelyMissing()
    const k = buildKnowledge(view)
    expect(candidates(k, '6C')).toEqual([2, 4])
    const ranked = rankAsksWith(view, k, STYLE_ROSTER.punter)
    expect(round2(18 * (5 / 6) + 12 + 25)).toBe(52)
    expect(round2(18 * (5 / 6) + 25)).toBe(40)
    expect([ranked[0].card, ranked[0].p, ranked[0].score]).toEqual(['6C', 0, 40])
    // Still the top of the ranking, which is why `minHitP` is a separate fix rather than a
    // belt-and-braces one: the scoring corrections alone do not stop this seat asking.
    const bestLive = ranked.find((r) => r.p > 0)
    expect(bestLive?.score, 'the best live ask is still outscored by the dead one').toBe(23.5)
  })

  it('no ask has a hit probability strictly inside (0, 1e-9) — the floor is a partition', () => {
    // The premise MONET.md §3.2's `minHitP: 1e-9` rests on, checked rather than assumed.
    // `pHit` returns 0, or `1/|candidates|`, or `unknownSlots[target]` over the unknown slots
    // across the candidate seats — ratios of small integers bounded by the deck, so the smallest
    // reachable non-zero value is 1/54. A floor below that refuses exactly the provable misses
    // and cannot reorder anything else.
    let asks = 0
    let violations = 0
    let smallest = 1
    for (const { view } of collectBotViews(20, us54Config)) {
      for (const r of rankAsks(view)) {
        asks++
        if (!(r.p === 0 || r.p >= 1 / 54)) violations++
        if (r.p > 0 && r.p < smallest) smallest = r.p
      }
    }
    expect(asks).toBeGreaterThan(20_000)
    expect(violations).toBe(0)
    expect(smallest).toBeGreaterThanOrEqual(1 / 54)
  })
})

function assertSound(
  k: ReturnType<typeof buildKnowledge>,
  state: GameState,
  seed: string,
  step: number,
  seat: Seat,
): void {
  const trueHolder = new Map<Card, Seat>()
  for (let s = 0; s < 6; s++) {
    for (const c of state.hands[s]) trueHolder.set(c, s as Seat)
  }
  for (const [card, holder] of Object.entries(k.holders) as [Card, Seat][]) {
    if (trueHolder.get(card) !== holder) {
      throw new Error(
        `${seed} step ${step} seat ${seat}: claims ${card}@${holder}, truth ${card}@${String(trueHolder.get(card))}`,
      )
    }
  }
  for (const [card, actual] of trueHolder) {
    const cand = k.cands[card]
    if (!cand || !cand.includes(actual)) {
      throw new Error(
        `${seed} step ${step} seat ${seat}: true holder ${actual} of ${card} excluded (cand ${JSON.stringify(cand)})`,
      )
    }
  }
  // Gone cards are exactly the resolved books' cards.
  for (const c of k.gone) {
    if (trueHolder.has(c)) {
      throw new Error(`${seed} step ${step} seat ${seat}: ${c} marked gone but still in a hand`)
    }
  }
  // Certain cards never exceed the public count.
  for (let s = 0; s < 6; s++) {
    const certain = certainCards(k, s as Seat).length
    if (certain > state.hands[s].length) {
      throw new Error(`${seed} step ${step} seat ${seat}: ${certain} certain > count ${state.hands[s].length} at seat ${s}`)
    }
  }
}
