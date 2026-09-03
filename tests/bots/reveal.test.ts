/**
 * reveal.test.ts — MONET.md §3.7 item 1: `reveal`, the reveal ask.
 *
 * Pinned: (1) `reveal` absent or 0 is byte identity — every decision of whole games is the
 * base's; (2) the public walk is a teammate's inference minus its hand: on real positions every
 * certainty of the public walk is a certainty of every seat's private build and is true of the
 * deal, and no private candidate list is wider than the public one; (3) the simulation is sound
 * against ground truth: wherever `revealAsk` names an ask, the ask is legal, no seat of the team
 * could prove the set before it, the asker's lock belief is honest (1 only when the deal agrees),
 * and whenever the set IS on the team and the cards lie where the simulation put them, the named
 * teammate proves the set from its real hand once the ask is on the record — and proves it right;
 * where the set is not on the team the teammate's build stays sound and never claims it; (4) with
 * the knob on, whole games are legal, the term fires, and every decision that leaves the base is
 * exactly the ask `revealAsk` names; (5) `validateStyle` closes both knobs. Whether the term is
 * *worth* the turn is the home fit's question (duplicate pairs, `scripts/probe-score.mjs`) and
 * belongs in MONET.md.
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { BookId, Card, PolicySpec, Seat, SeatView } from '../../lib/engine/index.ts'
import { bookCards, cardBook, seatTeam } from '../../lib/engine/cards.ts'
import { legalAsksFromView } from '../../lib/engine/helpers.ts'
import { buildKnowledge, publicKnowledge } from '../../lib/engine/bots/knowledge.ts'
import type { Knowledge } from '../../lib/engine/bots/types.ts'
import { revealAsk } from '../../lib/engine/bots/reveal.ts'
import { validateStyle } from '../../lib/engine/bots/style.ts'
import type { BotPolicy } from '../../lib/engine/bots/style.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { canonicalAction } from './action-digest.ts'

const BASE = monetPolicy('v0.4c') as BotPolicy
const withReveal = (reveal: number | undefined, revealFar: number | undefined): PolicySpec => ({
  skill: BASE.skill,
  style: { ...BASE.style, reveal, revealFar },
})
const OPTS = { logWindow: BASE.skill.logWindow, useConstraints: BASE.skill.useConstraints }
/** The decision's own knowledge: the base plays the marginal, so the reveal's beliefs read it. */
const OPTS_MODEL = { ...OPTS, marginal: BASE.style.pModel === 'marginal' }
const SEATS: Seat[] = [0, 1, 2, 3, 4, 5]

type State = ReturnType<typeof newGame>
interface Pos {
  state: State
  view: SeatView
}

/** Every `every`-th decision of a mirror game `spec` plays against itself, with the state. */
function positions(seed: string, spec: PolicySpec, every = 5): Pos[] {
  const out: Pos[] = []
  let s = newGame(seed, us54Config, 0)
  let steps = 0
  while (s.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    if (steps % every === 0) out.push({ state: s, view })
    const r = reduce(s, decide(view, spec, hashSeed(`${seed}:${s.moveIndex}`)()))
    if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
    s = r.state
    steps++
  }
  return out
}

/** Every card of `book` certainly located, by `k`, on `seat`'s team. */
function provable(k: Knowledge, seat: Seat, book: BookId): boolean {
  const team = seatTeam(seat)
  for (const c of bookCards(book, us54Config)) {
    const h = k.holders[c]
    if (h === undefined || seatTeam(h) !== team) return false
  }
  return true
}

const trueHolder = (s: State, c: Card): Seat => s.hands.findIndex((h) => h.includes(c)) as Seat

/** Is `book` wholly in the hands of `team`, by the true deal? */
function lockedOn(s: State, team: 0 | 1, book: BookId): boolean {
  if (s.books[book]) return false
  return bookCards(book, us54Config).every((c) => {
    const h = trueHolder(s, c)
    return h >= 0 && seatTeam(h) === team
  })
}

describe('reveal absent or 0 is byte identity', () => {
  it('every decision of whole games is the base decision', () => {
    for (const seed of ['reveal-id-a', 'reveal-id-b', 'reveal-id-c']) {
      let s = newGame(seed, us54Config, 0)
      let steps = 0
      let decisions = 0
      while (s.phase !== 'finished' && steps++ < 5000) {
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        const rng = hashSeed(`${seed}:${s.moveIndex}`)()
        const base = decide(view, BASE, rng)
        expect(canonicalAction(decide(view, withReveal(0, 0.5), rng))).toBe(canonicalAction(base))
        expect(canonicalAction(decide(view, withReveal(undefined, undefined), rng))).toBe(canonicalAction(base))
        decisions++
        const r = reduce(s, base)
        if (!r.ok) throw new Error(r.error.code)
        s = r.state
      }
      expect(decisions).toBeGreaterThan(100)
    }
  })
})

describe('the public walk is every seat’s inference minus its hand', () => {
  it('public certainties are private certainties and true of the deal; private candidates never widen', () => {
    let certainties = 0
    for (const seed of ['reveal-pub-a', 'reveal-pub-b']) {
      for (const { state, view } of positions(seed, BASE, 7)) {
        const pub = publicKnowledge(view, OPTS)
        const privates = SEATS.map((x) => buildKnowledge(seatView(state, x), OPTS))
        for (const [card, holder] of Object.entries(pub.holders) as [Card, Seat][]) {
          expect(trueHolder(state, card)).toBe(holder)
          for (const kx of privates) expect(kx.holders[card]).toBe(holder)
          certainties++
        }
        for (const [card, cand] of Object.entries(pub.cands) as [Card, Seat[]][]) {
          const h = trueHolder(state, card)
          if (h >= 0) expect(cand).toContain(h)
          for (const kx of privates) {
            for (const s of kx.cands[card] ?? []) expect(cand).toContain(s)
          }
        }
      }
    }
    expect(certainties).toBeGreaterThan(0)
  })

  it('a true hypothesis about a seat’s holdings never contradicts that seat’s own build', () => {
    let checked = 0
    for (const { state, view } of positions('reveal-assume-a', BASE, 9)) {
      for (const m of SEATS) {
        if (m === view.seat || state.hands[m].length === 0) continue
        const cards = bookCards(cardBook(state.hands[m][0]), us54Config)
        const holds = cards.filter((c) => state.hands[m].includes(c))
        const lacks = cards.filter((c) => !state.hands[m].includes(c))
        const assumed = publicKnowledge(view, OPTS, { seat: m, holds, lacks })
        const own = buildKnowledge(seatView(state, m), OPTS)
        for (const [card, holder] of Object.entries(assumed.holders) as [Card, Seat][]) {
          expect(trueHolder(state, card)).toBe(holder)
          expect(own.holders[card]).toBe(holder)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('the simulation is sound against the true hands', () => {
  it('a named reveal ask is legal, nobody on the team could prove the set before it, and where the set and the split are real the prover proves it after', () => {
    const style = { ...BASE.style, reveal: 1, revealFar: 1 }
    let named = 0
    let locked = 0
    let matched = 0
    for (const seed of ['reveal-pin-a', 'reveal-pin-b', 'reveal-pin-c', 'reveal-pin-d', 'reveal-pin-e', 'reveal-pin-f']) {
      for (const { state, view } of positions(seed, BASE, 1)) {
        if (view.phase !== 'playing' || view.declareWindow) continue
        if (decide(view, BASE, hashSeed(`${seed}:${state.moveIndex}`)()).type !== 'ask') continue
        const k = buildKnowledge(view, OPTS_MODEL)
        const rv = revealAsk(view, k, style, OPTS)
        if (rv === null) continue
        named++
        const me = view.seat
        const team = seatTeam(me)
        const cards = bookCards(rv.book, us54Config)
        expect(seatTeam(rv.prover)).toBe(team)
        expect(rv.prover).not.toBe(me)
        expect(cardBook(rv.card)).toBe(rv.book)
        expect(view.hand.some((c) => cardBook(c) === rv.book)).toBe(true)
        expect(view.hand).not.toContain(rv.card)
        expect(legalAsksFromView(view).some((a) => a.target === rv.target && a.card === rv.card)).toBe(true)
        expect(rv.pHit).toBeGreaterThanOrEqual(0)
        expect(rv.pHit).toBeLessThanOrEqual(1)
        expect(rv.pLock).toBeGreaterThan(0)
        expect(rv.pLock).toBeLessThanOrEqual(1)
        expect(rv.value).toBeCloseTo(rv.pHit + 1 * rv.urgency * rv.pLock, 12)
        for (const c of rv.assumed) expect(cardBook(c)).toBe(rv.book)
        // before: nobody on the team proves it (else it would have been declared at the last window)
        for (const x of SEATS) {
          if (seatTeam(x) !== team) continue
          expect(provable(buildKnowledge(seatView(state, x), OPTS), x, rv.book)).toBe(false)
        }
        const isLocked = lockedOn(state, team, rv.book)
        // an honest belief: certainty only where the deal agrees
        if (rv.pLock === 1) expect(isLocked).toBe(true)
        // the record as it will stand, and the prover's private build on its true hand
        const ev = { type: 'ask' as const, asker: me, target: rv.target, card: rv.card, hit: state.hands[rv.target].includes(rv.card) }
        const v2 = seatView(state, rv.prover)
        const k2 = buildKnowledge({ ...v2, log: [...v2.log, ev] }, OPTS)
        if (isLocked) {
          locked++
          expect(ev.hit).toBe(false)
          const proverHolds = cards.filter((c) => state.hands[rv.prover].includes(c))
          const splitRight = proverHolds.length === rv.assumed.length && proverHolds.every((c) => rv.assumed.includes(c))
          if (splitRight) {
            matched++
            expect(provable(k2, rv.prover, rv.book)).toBe(true)
            for (const c of cards) expect(k2.holders[c]).toBe(trueHolder(state, c))
          }
        } else if (!ev.hit) {
          // not on the team (and the record consistent: a hit would move a card the view's counts
          // do not know about): the prover's knowledge stays sound and can never claim the set for the team
          expect(provable(k2, rv.prover, rv.book)).toBe(false)
          for (const c of cards) if (k2.holders[c] !== undefined) expect(k2.holders[c]).toBe(trueHolder(state, c))
        }
      }
    }
    expect(named).toBeGreaterThan(0)
    expect(locked).toBeGreaterThan(0)
    expect(matched).toBeGreaterThan(0)
  })
})

describe('the knob is live and every action is legal', () => {
  it('a reveal policy plays legal games, fires, and leaves the base only for the ask revealAsk names', () => {
    const style = { ...BASE.style, reveal: 4, revealFar: 1 }
    const spec: PolicySpec = { skill: BASE.skill, style }
    let diverged = 0
    let decisions = 0
    for (const seed of ['reveal-live-a', 'reveal-live-b', 'reveal-live-c', 'reveal-live-d']) {
      let s = newGame(seed, us54Config, 0)
      let steps = 0
      while (s.phase !== 'finished' && steps++ < 5000) {
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        const rng = hashSeed(`${seed}:${s.moveIndex}`)()
        const a = decide(view, spec, rng)
        decisions++
        if (canonicalAction(a) !== canonicalAction(decide(view, BASE, rng))) {
          // the only new branch is the reveal ask, and it plays exactly what revealAsk names
          expect(a.type).toBe('ask')
          const rv = revealAsk(view, buildKnowledge(view, OPTS_MODEL), style, OPTS)
          expect(rv).not.toBeNull()
          if (a.type === 'ask' && rv !== null) {
            expect(a.card).toBe(rv.card)
            expect(a.target).toBe(rv.target)
          }
          diverged++
        }
        const r = reduce(s, a)
        expect(r.ok).toBe(true)
        if (!r.ok) throw new Error(r.error.code)
        s = r.state
      }
      expect(s.phase).toBe('finished')
    }
    expect(decisions).toBeGreaterThan(400)
    expect(diverged).toBeGreaterThan(0)
  })
})

describe('validateStyle closes both knobs', () => {
  it('accepts finite non-negative reveal and revealFar in [0, 1], rejects the rest', () => {
    const base = BASE.style
    expect(validateStyle({ ...base, reveal: 0, revealFar: 0 })).toEqual([])
    expect(validateStyle({ ...base, reveal: 0.7, revealFar: 0.25 })).toEqual([])
    expect(validateStyle({ ...base, reveal: 3 })).toEqual([])
    expect(validateStyle({ ...base, reveal: -1 })).toHaveLength(1)
    expect(validateStyle({ ...base, reveal: Number.NaN })).toHaveLength(1)
    expect(validateStyle({ ...base, reveal: 1, revealFar: 1.5 })).toHaveLength(1)
    expect(validateStyle({ ...base, reveal: 1, revealFar: -0.1 })).toHaveLength(1)
  })
})
