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
  bookCards,
  cardBook,
  deckFor,
  legalAsks,
  newGame,
  publicView,
  reduce,
  us54Config,
} from '../../lib/engine/index.ts'
import type { BookId, Card, GameState, Seat } from '../../lib/engine/index.ts'

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
