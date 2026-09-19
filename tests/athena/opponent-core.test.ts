/**
 * The rules half of ATHENA P0's Node opponent service (ATHENA.md §4.5 item 4, §4.6 G0c):
 * `scripts/athena/opponent-core.ts`. The service process itself is `opponent-service.test.mjs`'s.
 *
 * - the action codes are `athena-env/API.md` §4's, both ways, for every seat and every code, with the API's examples;
 * - `ReferenceGame` keeps the replay format's digests exactly as `GameRecorder` does: the deal digest, d after every
 *   step, and l and v at every state, over whole mixed-stub games, the spec's vector included;
 * - a refused action changes nothing, and a judged decision applies identically to a fresh reduce.
 * - the reveal regimes (ATHENA.md §8.2 G1b): a `'reduced'` game shows the replay codec's reduced view, field for
 *   field, and withholds the holders a bridge host withholds; a `'full'` game is P0's, unchanged.
 */
import { describe, expect, it } from 'vitest'
import type { BookId, Card, GameAction, Seat } from '../../lib/engine/types.ts'
import { ByteWriter, GameRecorder, SETS, SET_CARDS, digestBytes, encodeView } from '../../scripts/athena/replay-codec.ts'
import { ReducedReveal } from '../../scripts/athena/facts-codec.ts'
import { mixedStubAction, mixedStubRng } from '../../scripts/athena/mixed-stub.ts'
import {
  A_DECLARE,
  A_DECLINE,
  A_PASS,
  N_ACTIONS,
  REVEALS,
  ReferenceGame,
  actionCode,
  actionOfCode,
  checkReveal,
  moveSeed,
} from '../../scripts/athena/opponent-core.ts'

describe('the action codes are API.md §4', () => {
  it('every code round-trips for every seat', () => {
    expect(N_ACTIONS).toBe(6726)
    for (let seat = 0; seat < 6; seat++)
      for (let code = 0; code < N_ACTIONS; code++) {
        const a = actionOfCode(seat, code)
        expect(a.seat).toBe(seat)
        expect(actionCode(a)).toBe(code)
      }
  })

  it("the API's examples, and the actions with no code", () => {
    // Seat 4 asking seat 1 (opponent 1) for 8H (card 32).
    expect(actionCode({ type: 'ask', seat: 4, target: 1, card: '8H' })).toBe(54 + 32)
    expect(actionOfCode(4, 86)).toEqual({ type: 'ask', seat: 4, target: 1, card: '8H' })
    // Seat 1 declaring EIGHTS: 8C 8D 8H at itself, 8S XR at seat 3, XB at seat 5.
    const eights = { '8C': 1, '8D': 1, '8H': 1, '8S': 3, XR: 3, XB: 5 } as Record<string, Seat>
    const code = A_DECLARE + 8 * 729 + 27 + 81 + 2 * 243
    expect(actionCode({ type: 'claim', seat: 1, book: 'EIGHTS', assignments: eights } as GameAction)).toBe(code)
    expect(actionOfCode(1, code)).toEqual({ type: 'claim', seat: 1, book: 'EIGHTS', assignments: eights })
    expect(actionOfCode(2, A_PASS + 1)).toEqual({ type: 'pass', seat: 2, to: 0 })
    expect(actionOfCode(5, A_DECLINE)).toEqual({ type: 'decline', seat: 5 })
    expect(actionCode({ type: 'ask', seat: 0, target: 2, card: '2C' })).toBeNull()
    expect(actionCode({ type: 'pass', seat: 0, to: 1 })).toBeNull()
    expect(actionCode({ type: 'pass', seat: 3, to: 3 })).toBeNull()
    const opp = { '8C': 0, '8D': 0, '8H': 0, '8S': 0, XR: 0, XB: 1 } as Record<string, Seat>
    expect(actionCode({ type: 'claim', seat: 0, book: 'EIGHTS', assignments: opp } as GameAction)).toBeNull()
    const five = { '8C': 0, '8D': 0, '8H': 0, '8S': 0, XR: 0 } as Record<string, Seat>
    expect(actionCode({ type: 'claim', seat: 0, book: 'EIGHTS', assignments: five } as GameAction)).toBeNull()
    expect(() => actionOfCode(0, N_ACTIONS)).toThrow()
    expect(() => actionOfCode(0, -1)).toThrow()
    expect(() => actionOfCode(6, 0)).toThrow()
  })
})

describe('ReferenceGame keeps the replay format digests', () => {
  it('equals GameRecorder at every step of whole mixed-stub games: deal, d, l and v', () => {
    for (const [seed, start] of [
      ['athena-p0-g0a-h5-0', 0],
      ['athena-test-opponent-1', 3],
    ] as const) {
      const rec = new GameRecorder(seed, start)
      const ref = new ReferenceGame(seed, start)
      expect(ref.deal).toBe(rec.deal)
      expect(ref.d).toBe(rec.deal)
      const rng = mixedStubRng(seed)
      const l: string[] = []
      const v: string[] = []
      const d: string[] = []
      while (rec.state.phase !== 'finished') {
        const obs = rec.observe()
        expect(ref.acting()).toBe(obs.acting)
        l.push(ref.legalDigest())
        v.push(ref.viewDigest())
        const action = mixedStubAction(rec.state, obs.acting, rng)
        rec.apply(action)
        const code = actionCode(action)
        expect(code).not.toBeNull()
        expect(ref.applyCode(obs.acting, code as number)).toEqual({ ok: true })
        d.push(ref.d)
      }
      rec.finish()
      const p = rec.partial()
      expect(d.join('')).toBe(p.d)
      expect(l.join('')).toBe(p.l)
      expect(v.join('')).toBe(p.v)
      expect(ref.finished).toBe(true)
      expect(ref.state.score).toEqual(rec.state.score)
      expect(ref.steps).toBe(rec.steps)
      // The first spec vector (replay-format.md §10.5): the H5 game 0 takes 1,124 steps and ends at d 71b3baa794a6f4de.
      if (seed === 'athena-p0-g0a-h5-0') {
        expect(ref.steps).toBe(1124)
        expect(ref.d).toBe('71b3baa794a6f4de')
      }
    }
  })

  it('a refused action changes nothing; a judged decision applies as a fresh reduce does', () => {
    const ref = new ReferenceGame('athena-test-opponent-2', 1)
    const d = ref.d
    const before = ref.state
    // Seat 1 holds the opening option; seat 2 may not decline, and an ask is refused while the window is open.
    expect(ref.applyCode(2, A_DECLINE)).toEqual({ ok: false, error: 'NOT_YOUR_OPTION' })
    expect(ref.applyCode(1, 0).ok).toBe(false)
    expect(ref.applyCode(1, N_ACTIONS).ok).toBe(false)
    expect(ref.state).toBe(before)
    expect(ref.d).toBe(d)
    expect(ref.steps).toBe(0)
    const twin = new ReferenceGame('athena-test-opponent-2', 1)
    const rng = mixedStubRng('x')
    for (let t = 0; t < 300 && !ref.finished; t++) {
      const action = mixedStubAction(ref.state, ref.acting(), rng)
      const j = ref.judge(action)
      expect(j.error).toBeNull()
      const seat = ref.acting()
      expect(ref.applyCode(seat, j.code as number)).toEqual({ ok: true })
      expect(twin.applyCode(seat, j.code as number)).toEqual({ ok: true })
      expect(ref.d).toBe(twin.d)
    }
    // A decision the reference refuses is reported, and an apply of it is judged afresh (and refused).
    const other = ((ref.acting() + 1) % 6) as Seat
    const d1 = ref.d
    expect(ref.judge({ type: 'decline', seat: other }).error).not.toBeNull()
    expect(ref.applyCode(other, A_DECLINE).ok).toBe(false)
    expect(ref.d).toBe(d1)
  })

  it('the move seed is the lab seed', () => {
    expect(moveSeed('athena-p0-pin-0', 0)).toBe(new ReferenceGame('athena-p0-pin-0', 0).moveSeed())
    expect(moveSeed('a', 17)).not.toBe(moveSeed('a', 18))
  })
})

/* ------------------------------------------------------------------------ the reveal regimes --- */

/** The holders a view does not publish: cards of a resolved set whose true holder is absent (§12.4's NONE). */
function unpublished(view: ReturnType<ReferenceGame['view']>): { card: Card; book: BookId }[] {
  const out: { card: Card; book: BookId }[] = []
  SETS.forEach((b, i) => {
    const r = view.books[b]
    if (!r) return
    for (const c of SET_CARDS[i]) if (r.actualHolders[c] === undefined) out.push({ card: c, book: b })
  })
  return out
}

describe('the reveal regimes (ATHENA.md §8.2 G1b)', () => {
  it('names its two regimes, defaults to the home one, and refuses anything else', () => {
    expect(REVEALS).toEqual(['full', 'reduced'])
    expect(checkReveal('full')).toBe('full')
    expect(checkReveal('reduced')).toBe('reduced')
    for (const bad of ['home', 'bridge', 'FULL', '', null, undefined, 0, 1, true, ['full']])
      expect(() => checkReveal(bad)).toThrow(/is not one of full, reduced/)
    // The two-argument constructor is P0's, and P0 is the home regime.
    expect(new ReferenceGame('athena-test-reveal-default', 0).reveal).toBe('full')
    expect(new ReferenceGame('athena-test-reveal-default', 0, 'reduced').reveal).toBe('reduced')
  })

  it("a reduced game's view is the replay codec's reduced view, field for field, at every step", () => {
    for (const [seed, start] of [
      ['athena-test-opponent-1', 3],
      ['athena-p0-g0a-h5-0', 0],
    ] as const) {
      const red = new ReferenceGame(seed, start, 'reduced')
      const full = new ReferenceGame(seed, start, 'full')
      // The reference, built the way `emit-facts.mjs home` builds G1b's B column: the same reducer, with
      // `ReducedReveal` fed every event, and `encodeView(..., 'reduced')` over the reduced log and its digest.
      const ref = new ReducedReveal()
      for (const e of red.state.log) ref.push(e)
      const w = new ByteWriter(1024)
      const rng = mixedStubRng(seed)
      let steps = 0
      let statesWithHidden = 0
      while (!red.finished) {
        const acting = red.acting()
        expect(full.acting()).toBe(acting)
        const want = ref.view(red.state, acting)
        // Field for field: the whole view object, hand, counts, score, set block and published log alike.
        expect(red.view()).toEqual(want)
        w.reset()
        encodeView(w, want, ref.log.length, ref.logDigest.hex(), 'reduced')
        expect(red.viewDigest()).toBe(digestBytes(w.buf, w.n))
        // Only the view is reduced: the rules, the state digest and the legal moves are the home game's.
        expect(red.d).toBe(full.d)
        expect(red.legalDigest()).toBe(full.legalDigest())
        expect(red.moveSeed()).toBe(full.moveSeed())
        // v differs from the home regime's exactly where a holder is unpublished, and nowhere else.
        const hidden = unpublished(red.view())
        expect(unpublished(full.view())).toEqual([])
        expect(red.viewDigest() === full.viewDigest()).toBe(hidden.length === 0)
        if (hidden.length > 0) statesWithHidden++
        expect(red.hidden.holders).toBe(ref.hiddenHolders)
        expect(red.hidden.wrongDeclares).toBe(ref.wrongDeclares)
        expect(full.hidden).toEqual({ holders: 0, wrongDeclares: 0 })

        const action = mixedStubAction(red.state, acting, rng)
        const code = actionCode(action) as number
        expect(red.applyCode(acting, code)).toEqual({ ok: true })
        expect(full.applyCode(acting, code)).toEqual({ ok: true })
        for (const e of red.state.log.slice(ref.log.length)) ref.push(e)
        steps++
      }
      expect(red.steps).toBe(full.steps)
      expect(red.state.score).toEqual(full.state.score)
      // The game has to exercise the thing: these two seeds hold wrong declares that withhold holders.
      expect(red.hidden.wrongDeclares).toBeGreaterThan(0)
      expect(red.hidden.holders).toBeGreaterThan(0)
      expect(statesWithHidden).toBeGreaterThan(0)
      expect(steps).toBeGreaterThan(100)
    }
  })

  it('a reduced view withholds the holders a hit had not located — re-publishing them fails this', () => {
    // The spec's own vector, played by the mixed stub: its five wrong declares withhold 20 holders in all, and its
    // sets end published 1, 1, 4, 2, 6, 2, 6, 6 — right declares all six, wrong ones only what a hit had located.
    const seed = 'athena-p0-g0a-h5-0'
    const red = new ReferenceGame(seed, 0, 'reduced')
    const full = new ReferenceGame(seed, 0, 'full')
    const rng = mixedStubRng(seed)
    let found: { book: BookId; cards: Card[] } | null = null
    while (!red.finished && found === null) {
      const acting = red.acting()
      const hidden = unpublished(red.view())
      if (hidden.length > 0) found = { book: hidden[0].book, cards: hidden.map((h) => h.card) }
      const action = mixedStubAction(red.state, acting, rng)
      const code = actionCode(action) as number
      expect(red.applyCode(acting, code)).toEqual({ ok: true })
      expect(full.applyCode(acting, code)).toEqual({ ok: true })
    }
    // This is the whole point of the regime: a bridge host does not publish these, and the service must not either.
    expect(found).not.toBeNull()
    const book = (found as { book: BookId }).book
    const cards = (found as { cards: Card[] }).cards
    expect(cards.length).toBeGreaterThan(0)
    const view = red.view()
    const home = full.view()
    // Home publishes all six true holders of the resolved set; the bridge publishes strictly fewer.
    const i = SETS.indexOf(book)
    expect(SET_CARDS[i].filter((c) => home.books[book]?.actualHolders[c] !== undefined)).toHaveLength(6)
    for (const c of cards) {
      expect(view.books[book]?.actualHolders[c]).toBeUndefined()
      expect(home.books[book]?.actualHolders[c]).not.toBeUndefined()
    }
    // The same silence in the log's claim, not only in the set block (replay-format.md §12.4).
    const claim = view.log.find((e) => e.type === 'claim' && e.book === book)
    expect(claim).toBeDefined()
    for (const c of cards) expect((claim as { actualHolders: Record<Card, Seat> }).actualHolders[c]).toBeUndefined()
    expect(cards.length).toBeGreaterThan(0)
    expect(red.viewDigest()).not.toBe(full.viewDigest())

    // Not every unpublished holder is every holder: a hit publishes where a card is, and a wrong declare of a set
    // some of whose cards a hit had already moved publishes exactly those. Play the game out and find one.
    const counts = new Map<BookId, number>()
    while (!red.finished) {
      const acting = red.acting()
      const v = red.view()
      SETS.forEach((b, j) => {
        const r = v.books[b]
        if (r) counts.set(b, SET_CARDS[j].filter((c) => r.actualHolders[c] !== undefined).length)
      })
      const a = mixedStubAction(red.state, acting, rng)
      expect(red.applyCode(acting, actionCode(a) as number)).toEqual({ ok: true })
    }
    const published = [...counts.values()]
    expect(published.filter((k) => k === 6).length).toBeGreaterThan(0) // right declares publish all six
    expect(published.filter((k) => k < 6).length).toBeGreaterThan(0) // wrong ones publish fewer
    expect(published.filter((k) => k > 0 && k < 6).length).toBeGreaterThan(0) // and sometimes only some
  })
})

