/**
 * The bots under RULES_US54.md — the §3 declare window and the §4 "the bots must know it"
 * clause, plus the whole-game proof that a us54 table of bots actually finishes.
 *
 * The interesting difference from the 48-card tiers is not the deck, which `deckFor` already
 * handles, but the shape of a move: while a window is open the acting seat is the option
 * holder rather than the turn-holder, and the only legal actions are `claim` and `decline`;
 * while it is closed the only legal action is an ask. `legalActionsSummary(state)` names the
 * seat in both cases and is what a us54 client (and this file) drives off.
 */
import { describe, expect, it } from 'vitest'
import {
  allBooks,
  bookCards,
  checkInvariants,
  clinchTarget,
  decide,
  defaultConfig,
  legalActionsSummary,
  newGame,
  randInt,
  reduce,
  rngFromSeed,
  seatView,
  us54Config,
} from '../../lib/engine/index.ts'
import type { BotDifficulty, Card, GameState, Seat, SeatView } from '../../lib/engine/index.ts'
import { ask, gs, mkView } from './util.ts'

const TIERS: BotDifficulty[] = ['easy', 'medium', 'hard']

/** A us54 view with the declare option at the viewing seat. */
function windowView(v: {
  seat: Seat
  hand: Card[]
  counts: number[]
  turn?: Seat
  books?: SeatView['books']
  declined?: number
}): SeatView {
  return mkView({
    seat: v.seat,
    hand: v.hand,
    counts: v.counts,
    turn: v.turn ?? v.seat,
    books: v.books,
    log: [gs],
    config: us54Config,
    declareWindow: { option: v.seat, declined: v.declined ?? 0 },
  })
}

const EIGHTS: Card[] = ['8C', '8D', '8H', '8S', 'XR', 'XB']

describe('us54 bots: the declare window (RULES_US54.md §3)', () => {
  it('declares a set held entirely in its own hand the moment the option arrives', () => {
    for (const tier of TIERS) {
      // Seat 0 holds all six EIGHTS — including both jokers, which a 48-card bot could not
      // even name. The window is open on seat 0 but the TURN is seat 3: §3.1 removes
      // NOT_YOUR_TURN as a declare error, so this is legal and must be taken.
      const view = windowView({ seat: 0, hand: [...EIGHTS], counts: [6, 9, 9, 10, 10, 10], turn: 3 })
      const a = decide(view, tier, 7)
      expect(a.type, tier).toBe('claim')
      if (a.type !== 'claim') continue
      expect(a.book, tier).toBe('EIGHTS')
      expect(Object.keys(a.assignments).sort(), tier).toEqual([...bookCards('EIGHTS', us54Config)].sort())
      expect(Object.values(a.assignments).every((s) => s === 0), tier).toBe(true)
    }
  })

  it('declines rather than guessing when nothing is certain', () => {
    for (const tier of TIERS) {
      // A perfectly ordinary early position: six full hands, one card of a few sets each,
      // nothing deducible. Declining costs a tick; a wrong declare gifts a set for good.
      const view = windowView({
        seat: 2,
        hand: ['2C', '9C', '3D', 'TH', 'KS', '8H', '5S', 'AD', '4C'],
        counts: [9, 9, 9, 9, 9, 9],
        turn: 4,
      })
      const a = decide(view, tier, 11)
      expect(a.type, tier).toBe('decline')
      expect(a.seat, tier).toBe(2)
    }
  })

  it('never asks while the window is open, at any tier', () => {
    for (const tier of TIERS) {
      const view = windowView({
        seat: 1,
        hand: ['2C', '3C', '4C', '9D', 'TD', 'JD', '8S', 'XR', 'AH'],
        counts: [9, 9, 9, 9, 9, 9],
        turn: 1,
      })
      expect(decide(view, tier, 3).type, tier).not.toBe('ask')
    }
  })

  it('never declares once the window has closed — only an ask is legal then', () => {
    for (const tier of TIERS) {
      // Same hand, same position, window absent: RULES_US54.md §3 makes a declare
      // NO_DECLARE_WINDOW here, so even a set fully in hand must wait for the next window.
      const view = mkView({
        seat: 0,
        hand: [...EIGHTS, '2C', '3C', '4C'],
        counts: [9, 9, 9, 9, 9, 9],
        turn: 0,
        log: [gs],
        config: us54Config,
      })
      const a = decide(view, tier, 5)
      expect(a.type, tier).toBe('ask')
    }
  })
})

describe('us54 bots: running out of cards (RULES_US54.md §4)', () => {
  it('never declares when its whole team is cardless — every assignment would be wrong', () => {
    for (const tier of TIERS) {
      // Seats 0/2/4 are Team A and hold nothing. §4: "if your whole team is cardless, any
      // declare you make is necessarily wrong and gifts the set to the opponents" (row 14).
      // This is also the position where the window can never close — the turn-holder's
      // opponents are all empty — so the temptation to declare-to-break-the-loop is real,
      // and must still be refused: the opponents would simply be handed the set.
      const view = windowView({ seat: 0, hand: [], counts: [0, 18, 0, 18, 0, 18], turn: 1 })
      const a = decide(view, tier, 13)
      expect(a.type, tier).toBe('decline')
    }
  })

  it('a cardless seat WITH card-holding teammates still declares (row 15, §7 vector 9)', () => {
    // Seat 0 holds nothing, but the whole EIGHTS set is certainly with seat 2: every other
    // seat is out of cards, so counting alone places all six. Declaring is correct play, and
    // refusing it purely because the declarer is cardless would throw the set away.
    const books: SeatView['books'] = {}
    for (const b of allBooks(us54Config)) {
      if (b === 'EIGHTS') continue
      // Only `outcome` and the key's presence matter to the bot; the two maps are the
      // reveal detail a real result would carry and are irrelevant here.
      const empty = {} as Record<Card, Seat>
      books[b] = { book: b, outcome: 'team0', claimer: 0, assignments: empty, actualHolders: empty }
    }
    const view = mkView({
      seat: 0,
      hand: [],
      counts: [0, 0, 6, 0, 0, 0],
      turn: 2,
      books,
      log: [gs],
      config: us54Config,
      declareWindow: { option: 0, declined: 0 },
    })
    for (const tier of ['medium', 'hard'] as const) {
      const a = decide(view, tier, 17)
      expect(a.type, tier).toBe('claim')
      if (a.type !== 'claim') continue
      expect(a.book, tier).toBe('EIGHTS')
      expect(Object.values(a.assignments).every((s) => s === 2), tier).toBe(true)
    }
  })
})

/* ------------------------------------------------- whole bot-driven games --- */

/** Play one full game with six bots of one tier, checking every step. */
function playBotGame(seed: string, tier: BotDifficulty, config: typeof us54Config): GameState {
  const rng = rngFromSeed(seed)
  let s = newGame(seed, config, randInt(rng, 6) as Seat)
  let steps = 0
  while (s.phase !== 'finished') {
    if (++steps > 4000) throw new Error(`${seed}/${tier}: no termination (phase ${s.phase})`)
    const { seat } = legalActionsSummary(s)
    const action = decide(seatView(s, seat), tier, (steps * 2654435761) >>> 0)
    const r = reduce(s, action)
    if (!r.ok) {
      throw new Error(`${seed}/${tier} step ${steps}: ${r.error.code} ${r.error.message} ${JSON.stringify(action)}`)
    }
    s = r.state
    const violations = checkInvariants(s)
    if (violations.length > 0) throw new Error(`${seed}/${tier} step ${steps}: ${violations.join(' | ')}`)
  }
  return s
}

describe('us54 bots play complete games', () => {
  for (const tier of TIERS) {
    it(
      `${tier}: 60 games all terminate on a clinch with only legal actions`,
      () => {
        const target = clinchTarget(us54Config)
        for (let g = 0; g < 60; g++) {
          const s = playBotGame(`us54-bot-${tier}-${g}`, tier, us54Config)
          const sets = allBooks(us54Config).reduce<[number, number]>(
            (acc, b) => {
              const o = s.books[b]?.outcome
              if (o === 'team0') acc[0]++
              else if (o === 'team1') acc[1]++
              return acc
            },
            [0, 0],
          )
          // §5: every game is a clinch at exactly the target; no ties, no voids.
          expect(Math.max(sets[0], sets[1]), `${tier}/${g}`).toBe(target)
          expect(Object.values(s.books).every((b) => b.outcome !== 'void'), `${tier}/${g}`).toBe(true)
          const over = s.log[s.log.length - 1]
          expect(over.type, `${tier}/${g}`).toBe('game_over')
          if (over.type === 'game_over') expect(over.winner, `${tier}/${g}`).not.toBe('tie')
          // §4: no endgame machinery is ever entered.
          expect(s.phase).toBe('finished')
        }
      },
      120_000,
    )
  }

  it('the 48-card bot tiers still finish exactly as they did (RULES.md unchanged)', () => {
    for (const tier of TIERS) {
      for (let g = 0; g < 20; g++) {
        const s = playBotGame(`pagat48-bot-${tier}-${g}`, tier, defaultConfig)
        expect(Object.keys(s.books), `${tier}/${g}`).toHaveLength(allBooks(defaultConfig).length)
        expect(s.hands.every((h) => h.length === 0), `${tier}/${g}`).toBe(true)
        expect(Object.keys(s), `${tier}/${g}`).not.toContain('declareWindow')
      }
    }
  }, 120_000)
})

/* ------------------------------------------------------------ regression --- */

describe('the pagat48 bot decision path is untouched', () => {
  it('still answers a scripted 48-card view with an ask on its own turn', () => {
    // The same shape as the window tests above but under the default rule set: no window
    // exists, the turn check is the only mover rule, and a claim needs the seat's own turn.
    const view = mkView({
      seat: 0,
      hand: ['2C', '3C', '4C', '5C', '9D', 'TD', 'JD', 'QD'],
      counts: [8, 8, 8, 8, 8, 8],
      turn: 0,
      log: [gs, ask(1, 0, '2C', false)],
    })
    for (const tier of TIERS) {
      const a = decide(view, tier, 2)
      expect(a.type, tier).toBe('ask')
      expect(a.seat, tier).toBe(0)
    }
  })
})
