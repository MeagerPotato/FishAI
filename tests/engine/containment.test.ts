/**
 * The contained-book result — CONTAINMENT.md §1.
 *
 * A book held entirely by one team is an absorbing state: no opponent can ask into it, and an
 * opponent declaring it gifts it back. Leaving it unclaimed keeps a repeatable, targetable
 * turn-pass that claiming destroys.
 *
 * These are the assertions that promote CONTAINMENT.md's claims from "derived from the rules" to
 * "measured", so they run on every commit rather than once in a scratch script.
 */
import { describe, expect, it } from 'vitest'
import {
  STYLE_PRESETS,
  STYLE_ROSTER,
  bookCards,
  buildKnowledge,
  cardBook,
  containedBooks,
  decide,
  deckFor,
  defaultConfig,
  legalAsks,
  newGame,
  publicView,
  reduce,
  seatView,
  us54Config,
} from '../../lib/engine/index.ts'
import type { BookId, Card, GameState, PublicEvent, Seat } from '../../lib/engine/index.ts'

const BOOK: BookId = 'LOW-C'
const MEMBERS = bookCards(BOOK, us54Config)

/** A us54 position where team A (0,2,4) collectively holds every card of BOOK. */
function containedPosition(): GameState {
  const base = newGame('containment', us54Config, 0)
  const rest = deckFor(us54Config).cards.filter((c) => !MEMBERS.includes(c))
  const hands: Card[][] = [[], [], [], [], [], []]
  hands[0].push(MEMBERS[0], MEMBERS[1])
  hands[2].push(MEMBERS[2], MEMBERS[3])
  hands[4].push(MEMBERS[4], MEMBERS[5])
  let i = 0
  for (const seat of [0, 2, 4]) while (hands[seat].length < 9) hands[seat].push(rest[i++])
  for (const seat of [1, 3, 5]) while (hands[seat].length < 9) hands[seat].push(rest[i++])
  return { ...base, hands }
}

/**
 * A `us54` position in which the contained book is **provable from the public view** and the
 * opponents' hands are uneven, which is what the policy needs: containment alone says the ask
 * cannot hit, and the hand sizes say whether aiming the concession is worth a turn.
 *
 * Seat 0 holds `2C`–`6C` and `9D`; `7C` is with teammate seat 2. The log records three misses
 * by seat 0 for `7C` — one against each opponent — which clears seats 1, 3 and 5 from it, so
 * `7C`'s candidates are the two teammates and every card of LOW-C is certainly on team A. The
 * three hits ahead of them are what the valuation reads the table's hit rate off.
 */
function policyPosition(): GameState {
  const base = newGame('containment-policy', us54Config, 0)
  const hand0: Card[] = ['2C', '3C', '4C', '5C', '6C', '9D']
  const rest = deckFor(us54Config).cards.filter((c) => !hand0.includes(c) && c !== '7C')
  const sizes = [0, 20, 7, 5, 13, 2] // seat 2 also holds 7C, so its hand is 8
  const hands: Card[][] = [hand0, [], ['7C'], [], [], []]
  let i = 0
  for (const seat of [1, 2, 3, 4, 5]) {
    while (hands[seat].length < sizes[seat] + (seat === 2 ? 1 : 0)) hands[seat].push(rest[i++])
  }
  const log: PublicEvent[] = [
    { type: 'game_started', startingSeat: 0 },
    { type: 'ask', asker: 0, target: 1, card: '2C', hit: true },
    { type: 'ask', asker: 0, target: 3, card: '3C', hit: true },
    { type: 'ask', asker: 0, target: 5, card: '4C', hit: true },
    { type: 'ask', asker: 0, target: 1, card: '7C', hit: false },
    { type: 'ask', asker: 0, target: 3, card: '7C', hit: false },
    { type: 'ask', asker: 0, target: 5, card: '7C', hit: false },
  ]
  return { ...base, hands, log, turn: 0 }
}

function step(state: GameState, action: Parameters<typeof reduce>[1]): GameState {
  const r = reduce(state, action)
  if (!r.ok) throw new Error(`${action.type} refused: ${r.error.code}`)
  return r.state
}

/** Decline through the declare window until it closes (RULES_US54.md §3). */
function closeWindow(state: GameState): GameState {
  let guard = 0
  let s = state
  while (s.declareWindow !== undefined && guard++ < 20) {
    s = step(s, { type: 'decline', seat: s.declareWindow.option })
  }
  return s
}

describe('a team-contained book is an absorbing state (CONTAINMENT.md §1)', () => {
  it('C1 — no opponent has any legal ask into it', () => {
    const s = closeWindow(containedPosition())
    for (const seat of [1, 3, 5] as Seat[]) {
      const into = legalAsks(s, seat).filter((a) => cardBook(a.card) === BOOK)
      expect(into, `seat ${seat} could ask into a contained book`).toEqual([])
    }
  })

  it('C2 — an opponent declaring it gifts it to the holders', () => {
    // Advance the window option to seat 1 so an opponent may declare.
    const s = step(containedPosition(), { type: 'decline', seat: 0 })
    const assignments = Object.fromEntries(MEMBERS.map((c) => [c, 1])) as Record<Card, Seat>
    const r = reduce(s, { type: 'claim', seat: 1, book: BOOK, assignments })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Every assignment is to the declarer's own team and every one is wrong -> row 14.
    expect(r.state.books[BOOK]?.outcome).toBe('team0')
  })

  it('C3/C4 — a holder can ask into it: a guaranteed miss aimed at a chosen opponent', () => {
    const s = closeWindow(containedPosition())
    const card = MEMBERS[2] // held by teammate seat 2, so no opponent can have it
    expect(legalAsks(s, 0).some((a) => a.card === card && a.target === 3)).toBe(true)

    const r = reduce(s, { type: 'ask', seat: 0, target: 3, card })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const ev = r.state.log[r.state.log.length - 1]
    expect(ev.type === 'ask' && ev.hit).toBe(false)
    expect(r.state.turn).toBe(3)
  })

  it('C4 — the turn-pass can be aimed at any opponent', () => {
    const s = closeWindow(containedPosition())
    const targets = new Set(
      legalAsks(s, 0)
        .filter((a) => cardBook(a.card) === BOOK)
        .map((a) => a.target),
    )
    expect([...targets].sort()).toEqual([1, 3, 5])
  })

  it('C5 — it is repeatable: a miss moves no cards, so the licence is never consumed', () => {
    let s = closeWindow(containedPosition())
    const handBefore = [...s.hands[0]]
    let uses = 0
    for (let k = 0; k < 5; k++) {
      const cand = legalAsks(s, 0).find((a) => cardBook(a.card) === BOOK)
      expect(cand, `no contained-book ask available on use ${k + 1}`).toBeDefined()
      if (cand === undefined) break
      const r = reduce(s, { type: 'ask', seat: 0, target: cand.target, card: cand.card })
      expect(r.ok).toBe(true)
      if (!r.ok) break
      const ev = r.state.log[r.state.log.length - 1]
      expect(ev.type === 'ask' && ev.hit, 'a contained-book ask must never hit').toBe(false)
      uses++
      // Restore the turn so the same seat can use the move again.
      s = closeWindow({ ...r.state, turn: 0 })
    }
    expect(uses).toBe(5)
    expect(s.hands[0]).toEqual(handBefore)
  })

  it('C6 — claiming the book destroys the move', () => {
    const assignments = {
      [MEMBERS[0]]: 0, [MEMBERS[1]]: 0,
      [MEMBERS[2]]: 2, [MEMBERS[3]]: 2,
      [MEMBERS[4]]: 4, [MEMBERS[5]]: 4,
    } as Record<Card, Seat>
    const r = reduce(containedPosition(), { type: 'claim', seat: 0, book: BOOK, assignments })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.books[BOOK]?.outcome).toBe('team0')
    const after = closeWindow(r.state)
    expect(legalAsks(after, 0).filter((a) => cardBook(a.card) === BOOK)).toEqual([])
  })

  it('C7 — the POLICY plays it: a whole game step, through decide() and reduce()', () => {
    // C1–C6 measure the mechanism. This measures the decision: a real `us54` state, the public
    // SeatView a bot actually gets, `decide` choosing the turn-pass over its best ordinary ask,
    // and the reducer producing the miss and the aimed turn transfer.
    //
    // Seat 0 holds five of LOW-C and one HIGH-D card; `7C` sits with teammate seat 2 and three
    // recorded misses have cleared every opponent from it, so LOW-C is contained (C1) without
    // being pinned. The opponents hold 20 / 5 / 2, so the ordinary ask — a live HIGH-D card at
    // the 20-card seat 1 — would concede the turn to the seat best able to use it.
    const s = closeWindow(policyPosition())
    const view = seatView(s, 0)
    expect(containedBooks(view, buildKnowledge(view))).toEqual(['LOW-C'])

    // The shipped tiers do not use the move at all (`containedPass: 0`), so they take the
    // material ask — which is exactly what makes the Hoarder's choice a style and not a bug.
    const tier = decide(view, 'hard', 7)
    expect(tier.type === 'ask' && cardBook(tier.card)).toBe('HIGH-D')
    expect(STYLE_PRESETS.hard.containedPass).toBe(0)

    const a = decide(view, STYLE_ROSTER.hoarder, 7)
    expect(a).toEqual({ type: 'ask', seat: 0, target: 5, card: '7C' })

    const r = reduce(s, a)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const ev = r.state.log[r.state.log.length - 1]
    expect(ev.type === 'ask' && ev.hit, 'C3 — it must be a guaranteed miss').toBe(false)
    expect(r.state.turn, 'C4 — the turn goes to the seat the style chose').toBe(5)
    expect(r.state.hands, 'C5 — a miss moves no cards').toEqual(s.hands)

    // C5 again, from the policy side: offered the identical position it names the same card
    // rather than cycling to a new one, so the repeat publishes nothing new (§1.2).
    const again = decide(seatView(closeWindow({ ...r.state, turn: 0 }), 0), STYLE_ROSTER.hoarder, 7)
    expect(again).toEqual(a)
  })

  it('§1.2 — the turn-pass is NOT information-free, but repeats of one card are', () => {
    const s = closeWindow(containedPosition())
    const card = MEMBERS[2]
    const before = publicView(s)
    const r = reduce(s, { type: 'ask', seat: 0, target: 3, card })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    // The first use publishes that seat 0 holds >=1 of the book and lacks this exact card.
    const after = publicView(r.state)
    expect(after.log.length).toBe(before.log.length + 1)
    const ev = after.log[after.log.length - 1]
    expect(ev.type).toBe('ask')
    if (ev.type !== 'ask') return
    expect(ev.card).toBe(card)
    expect(ev.hit).toBe(false)

    // Naming the SAME card again publishes nothing that was not already public, which is why
    // CONTAINMENT.md §1.2 says to reuse one card rather than cycle through distinct ones.
    const again = reduce(closeWindow({ ...r.state, turn: 0 }), {
      type: 'ask', seat: 0, target: 3, card,
    })
    expect(again.ok).toBe(true)
  })
})

describe('containment is absorbing under pagat48 too (STYLES.md §6.3.7)', () => {
  /**
   * An earlier draft claimed RULES.md row 15 VOIDS an opponent's declare of a contained book, so
   * that containment was not absorbing under the 48-card rules. That is false: row 15 covers
   * "my own team holds all six and I misassigned", which cannot describe a seat whose OPPONENTS
   * hold all six. Row 14 fires instead, and it is worded identically in both rule sets.
   *
   * These assertions exist so the corrected fact cannot decay back into folklore. The policy's
   * refusal to run under pagat48 is a COMPATIBILITY decision (the shipped 48-card game is held
   * byte-identical), not a rules one.
   */
  const BOOK48: BookId = 'LOW-C'
  const M48 = bookCards(BOOK48, defaultConfig)

  function contained48(): GameState {
    const base = newGame('pg48-contain', defaultConfig, 1)
    const rest = deckFor(defaultConfig).cards.filter((c) => !M48.includes(c))
    const hands: Card[][] = [[], [], [], [], [], []]
    hands[0].push(M48[0], M48[1])
    hands[2].push(M48[2], M48[3])
    hands[4].push(M48[4], M48[5])
    let i = 0
    for (const seat of [0, 2, 4]) while (hands[seat].length < 8) hands[seat].push(rest[i++])
    for (const seat of [1, 3, 5]) while (hands[seat].length < 8) hands[seat].push(rest[i++])
    return { ...base, hands, turn: 1 }
  }

  it('C1 under pagat48 — no opponent has any legal ask into a contained book (row 6)', () => {
    const s = contained48()
    for (const seat of [1, 3, 5] as Seat[]) {
      const into = legalAsks({ ...s, turn: seat }, seat).filter((a) => cardBook(a.card) === BOOK48)
      expect(into, `seat ${seat} could ask into a contained book`).toEqual([])
    }
  })

  it('C2 under pagat48 — an opponent declaring it is GIFTED BACK, not voided (row 14, not row 15)', () => {
    const assignments = Object.fromEntries(M48.map((c) => [c, 1])) as Record<Card, Seat>
    const r = reduce(contained48(), { type: 'claim', seat: 1, book: BOOK48, assignments })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.books[BOOK48]?.outcome).not.toBe('void')
    expect(r.state.books[BOOK48]?.outcome).toBe('team0')
    expect(r.state.score).toEqual([1, 0])
  })
})
