/**
 * ATHENA P0's replay oracle (ATHENA.md §4.2, §4.6 G0a (i)): the codec of `scripts/athena/replay-codec.ts` against
 * its specification, `scripts/athena/replay-format.md`.
 *
 * - the digest is the house `ActionDigest`, element for element;
 * - the specification's test vectors (§10) hold, so the document and the code cannot drift;
 * - the encoding is deterministic and blind to TypeScript key order and to the `declareWindow: undefined` trap;
 * - a hand-built change to any field of the state changes its digest;
 * - the probe generator is reproducible;
 * - an emitted game replays to the same digests from its actions alone, and a tampered record does not;
 * - a planted mutant (M2: a misassigned own-team declare scored for the declarer) is caught at the step it acts.
 *
 * Everything here runs in about a second: a handful of fuzz games and two mixed-stub games.
 */
import { describe, expect, it } from 'vitest'
import { ActionDigest } from '../bots/action-digest.ts'
import { us54PolicyAction } from '../engine/policy.ts'
import { hashSeed, randInt, rngFromSeed, mulberry32 } from '../../lib/engine/rng.ts'
import { reduce, us54Config, newGame } from '../../lib/engine/reduce.ts'
import { legalActionsSummary, legalAsks, turnHolderCanAsk } from '../../lib/engine/helpers.ts'
import { seatView } from '../../lib/engine/views.ts'
import type { BookResult, Card, GameAction, GameState, Seat } from '../../lib/engine/types.ts'
import {
  ByteDigest,
  ByteWriter,
  CARDS,
  GameRecorder,
  KIND_ASK,
  KIND_CLAIM,
  KIND_DECLINE,
  KIND_PASS,
  SETS,
  aggregateDigest,
  cardIndex,
  classifyEnd,
  classifyStep,
  digestBytes,
  encodeLegal,
  encodeState,
  encodeView,
  fromHex,
  generateProbes,
  legalKinds,
  logDigestOf,
  parseLine,
  probeAction,
  probeStateCount,
  recordLine,
  replayRecord,
  toHex,
  verdictOf,
} from '../../scripts/athena/replay-codec.ts'
import type { ReduceFn, Tally } from '../../scripts/athena/replay-codec.ts'
import { mixedStubAction, mixedStubRng } from '../../scripts/athena/mixed-stub.ts'

const META = { driver: 'test', revision: '0'.repeat(40), rulesHash: 'e9311958e811b7bc'.padEnd(64, '0') }

/** A whole mixed-stub game (H5's rule), recorded. */
function mixedGame(seed: string, start: Seat): GameRecorder {
  const rec = new GameRecorder(seed, start)
  const rng = mixedStubRng(seed)
  while (rec.state.phase !== 'finished') {
    const obs = rec.observe()
    rec.apply(mixedStubAction(rec.state, obs.acting, rng))
  }
  rec.finish()
  return rec
}

/** A whole fuzz game, seeded as fuzz-variant.test.ts seeds its games (H4's rule), recorded. */
function fuzzGame(seed: string, reduceFn?: ReduceFn): GameRecorder {
  const rng = rngFromSeed(`${seed}:policy`)
  const rec = new GameRecorder(seed, randInt(rng, 6) as Seat, { reduce: reduceFn })
  while (rec.state.phase !== 'finished') {
    rec.observe()
    rec.apply(us54PolicyAction(rec.state, rng))
  }
  rec.finish()
  return rec
}

function stateBytes(s: GameState): string {
  const w = new ByteWriter()
  encodeState(w, s)
  return toHex(w.buf, w.n)
}

/** A mid-game state with resolved sets, an open window and cards in every hand: mixed stub, first state after 3 declares. */
function midGameState(): GameState {
  const seed = 'athena-test-midgame'
  let s = newGame(seed, us54Config, 2)
  const rng = mixedStubRng(seed)
  while (Object.keys(s.books).length < 3 || !s.declareWindow || s.hands.some((h) => h.length === 0)) {
    const r = reduce(s, mixedStubAction(s, legalActionsSummary(s).seat, rng))
    if (!r.ok) throw new Error(r.error.code)
    s = r.state
    if (s.phase === 'finished') throw new Error('the mid-game fixture finished first')
  }
  return s
}

describe('the digest is the house ActionDigest', () => {
  it('push(bytes) equals ActionDigest.push of the Latin-1 string, over every byte value and many streams', () => {
    const rng = mulberry32(12345)
    for (let trial = 0; trial < 200; trial++) {
      const a = new ByteDigest()
      const b = new ActionDigest()
      const elements = 1 + Math.floor(rng() * 12)
      for (let e = 0; e < elements; e++) {
        const len = Math.floor(rng() * 300)
        const bytes = Array.from({ length: len }, () => Math.floor(rng() * 256))
        a.push(bytes)
        b.push(String.fromCharCode(...bytes))
        expect(a.hex()).toBe(b.hex())
      }
      expect(a.count).toBe(b.count)
    }
    const all = Array.from({ length: 256 }, (_, i) => i)
    expect(new ByteDigest().push(all).hex()).toBe(new ActionDigest().push(String.fromCharCode(...all)).hex())
  })

  it('pushAscii(s) equals ActionDigest.push(s), and refuses a non-ASCII string', () => {
    for (const s of ['', 'athena', '0123456789abcdef'.repeat(100), 'athena-replay-1|0|athena-p0-g0a-h5-0'])
      expect(new ByteDigest().pushAscii(s).pushAscii(s).hex()).toBe(new ActionDigest().push(s).push(s).hex())
    expect(() => new ByteDigest().pushAscii('é')).toThrow()
  })
})

describe('the specification test vectors (replay-format.md §10)', () => {
  it('10.1 the digest', () => {
    expect(new ByteDigest().hex()).toBe('baab8e9a1aee8d83')
    expect(new ByteDigest().push([0x00, 0x01, 0x7f, 0x80, 0xff]).hex()).toBe('3269ff52857644ca')
  })

  it('10.2 the generator of the deal and the probes', () => {
    const h = hashSeed('athena-p0-g0a-h5-0')
    expect([h(), h(), h()]).toEqual([3775514569, 2325701542, 2974494939])
    const r = rngFromSeed('athena-p0-g0a-h5-0')
    expect([0, 1, 2].map(() => Math.floor(r() * 4294967296))).toEqual([4047008728, 2782573905, 2890889111])
  })

  it('10.3 the first state, legal-move record and view of athena-p0-g0a-h5-0 from seat 0', () => {
    const rec = new GameRecorder('athena-p0-g0a-h5-0', 0)
    const s0 = rec.state
    expect(stateBytes(s0)).toBe(
      '0000000000000100000104010203000203040005030501000302040300050002050503020504020005030104030205010000040104030102040401050002' +
        '01' +
        'ff'.repeat(126) +
        '0000',
    )
    expect(rec.deal).toBe('e6810acfac4e1db1')
    const acting = legalActionsSummary(s0).seat
    const asks = legalAsks(s0, acting)
    const w = new ByteWriter()
    encodeLegal(w, acting, legalKinds(s0, acting, asks), asks)
    expect(toHex(w.buf, w.n)).toBe('000a0000')
    expect(digestBytes(w.buf, w.n)).toBe('915460b5ef59eaa3')
    expect(logDigestOf(s0.log)).toBe('c11386b34de6204b')
    w.reset()
    encodeView(w, seatView(s0, acting), 1, logDigestOf(s0.log))
    expect(w.n).toBe(175)
    expect(toHex(w.buf, w.n)).toBe(
      '01000000000000000100000909090909090000' +
        'ff'.repeat(126) +
        '0905090e13151e272833' +
        '01000000' +
        '63313133383662333464653632303462',
    )
    expect(digestBytes(w.buf, w.n)).toBe('2ff1e19e507ad997')
  })

  it('10.4 the probes at t = 0', () => {
    const s0 = newGame('athena-p0-g0a-h5-0', us54Config, 0)
    const probes = generateProbes('athena-p0-g0a-h5-0', 0, 0, [])
    expect(probes).toEqual([
      { kind: 2, seat: 0, target: 5, card: 49, set: 8, assignments: [2, 4, 2, 4, 2, 0], to: 5 },
      { kind: 2, seat: 1, target: 6, card: 42, set: 6, assignments: [1, 3, 1, 3, 1, 1], to: 6 },
      { kind: 1, seat: 0, target: 1, card: 8, set: 9, assignments: [4, 2, 4, 4, 0, 4], to: 1 },
      { kind: 1, seat: 0, target: 1, card: 8, set: 7, assignments: [4, 0, 2, 0, 4, 0], to: 1 },
    ])
    // accepted; NOT_YOUR_OPTION (index 17); INVALID_ACTION (index 19); accepted
    expect(probes.map((p) => verdictOf(reduce, s0, probeAction(p)))).toEqual([0, 18, 20, 0])
  })

  it('10.5 the whole H5 game 0: its length, first digests and game digest', () => {
    const c = mixedGame('athena-p0-g0a-h5-0', 0).columns()
    expect([c.steps, c.end]).toEqual([1124, 'finished'])
    expect(c.actions.slice(0, 24)).toBe('040004010402040304040405')
    expect(c.d.slice(0, 48)).toBe('1b053de995b9134de43a37e763f9ea92709752830ec82e48')
    expect(c.l.slice(0, 48)).toBe('915460b5ef59eaa30cf34926d51f8d947f0617ea2284446b')
    expect(c.v.slice(0, 48)).toBe('2ff1e19e507ad997ada3994e0a85c87463ebecea07cff608')
    expect(c.probes.slice(0, 16)).toBe('0012140000120110')
    expect(c.d.slice(-16)).toBe('71b3baa794a6f4de')
    expect(c.game).toBe('195ec9ea09381660')
    expect(aggregateDigest([c.game])).toBe(new ByteDigest().pushAscii(c.game).hex())
  })
})

describe('the encoding is deterministic', () => {
  it('the same state encodes to the same bytes, twice and from a rebuilt game', () => {
    const s = midGameState()
    expect(stateBytes(s)).toBe(stateBytes(s))
    expect(stateBytes(midGameState())).toBe(stateBytes(s))
  })

  it('is blind to key order in books, assignments and true holders', () => {
    const s = midGameState()
    const reversed = <T extends object>(o: T): T =>
      Object.fromEntries(Object.entries(o).reverse()) as T
    const books = {} as GameState['books']
    for (const [b, r] of Object.entries(s.books).reverse()) {
      const x = r as BookResult
      ;(books as Record<string, BookResult>)[b] = {
        actualHolders: reversed(x.actualHolders),
        assignments: reversed(x.assignments),
        claimer: x.claimer,
        outcome: x.outcome,
        book: x.book,
      }
    }
    const clone = { ...reversed(s), books }
    expect(Object.keys(clone)).not.toEqual(Object.keys(s))
    expect(stateBytes(clone)).toBe(stateBytes(s))
  })

  it('reads the window by its value, not the key: `declareWindow: undefined` encodes as no key (§4.1 item 14)', () => {
    const s = midGameState()
    const { declareWindow: _dw, ...noKey } = s
    void _dw
    const undefinedKey: GameState = { ...noKey, declareWindow: undefined }
    expect(Object.keys(undefinedKey)).toContain('declareWindow')
    expect(Object.keys(noKey)).not.toContain('declareWindow')
    expect(stateBytes(undefinedKey)).toBe(stateBytes(noKey as GameState))
    // ...and the reference itself produces the undefined key after a window closes
    let t = newGame('athena-test-window', us54Config, 0)
    for (let i = 0; i < 6; i++) {
      const r = reduce(t, { type: 'decline', seat: t.declareWindow!.option })
      if (!r.ok) throw new Error(r.error.code)
      t = r.state
    }
    expect(Object.keys(t)).toContain('declareWindow')
    expect(t.declareWindow).toBeUndefined()
    expect(stateBytes(t).slice(12, 18)).toBe('00ffff')
  })
})

describe('a hand-built state change changes the digest', () => {
  it('every field of S_t reaches the bytes', () => {
    const s = midGameState()
    const base = stateBytes(s)
    const seatWithCards = s.hands.findIndex((h) => h.length > 0)
    const other = (seatWithCards + 1) % 6
    const moved = s.hands[seatWithCards][0]
    const resolved = Object.keys(s.books)[0] as keyof GameState['books']
    const r = s.books[resolved] as BookResult
    const firstCard = Object.keys(r.assignments)[0] as Card
    const variants: [string, GameState][] = [
      ['moveIndex', { ...s, moveIndex: s.moveIndex + 1 }],
      ['turn', { ...s, turn: ((s.turn + 1) % 6) as Seat }],
      ['phase', { ...s, phase: 'awaitPass' }],
      ['window closed', { ...s, declareWindow: undefined }],
      ['window option', { ...s, declareWindow: { option: ((s.declareWindow!.option + 1) % 6) as Seat, declined: s.declareWindow!.declined } }],
      ['window declined', { ...s, declareWindow: { option: s.declareWindow!.option, declined: (s.declareWindow!.declined + 1) % 6 } }],
      [
        'a card changes hands',
        {
          ...s,
          hands: s.hands.map((h, i) => (i === seatWithCards ? h.slice(1) : i === other ? [...h, moved] : h)),
        },
      ],
      ['a set outcome', { ...s, books: { ...s.books, [resolved]: { ...r, outcome: r.outcome === 'team0' ? 'team1' : 'team0' } } }],
      ['a set claimer', { ...s, books: { ...s.books, [resolved]: { ...r, claimer: ((r.claimer + 2) % 6) as Seat } } }],
      [
        'a stated seat',
        { ...s, books: { ...s.books, [resolved]: { ...r, assignments: { ...r.assignments, [firstCard]: ((r.assignments[firstCard] + 2) % 6) as Seat } } } },
      ],
      [
        'a true holder',
        { ...s, books: { ...s.books, [resolved]: { ...r, actualHolders: { ...r.actualHolders, [firstCard]: ((r.actualHolders[firstCard] + 1) % 6) as Seat } } } },
      ],
      ['the score', { ...s, score: [s.score[0] + 1, s.score[1]] }],
    ]
    const seen = new Set([digestBytes(fromHex(base))])
    for (const [what, v] of variants) {
      const bytes = stateBytes(v)
      expect(bytes, what).not.toBe(base)
      seen.add(digestBytes(fromHex(bytes)))
    }
    expect(seen.size).toBe(variants.length + 1)
  })

  it('the view digest sees the hand, and not another seat\'s hand', () => {
    const s = midGameState()
    const seat = legalActionsSummary(s).seat
    const enc = (st: GameState, who: Seat) => {
      const w = new ByteWriter()
      encodeView(w, seatView(st, who), st.log.length, logDigestOf(st.log))
      return toHex(w.buf, w.n)
    }
    const base = enc(s, seat)
    // another seat's hand reordered: the view is unchanged
    const other = ((seat + 1) % 6) as Seat
    const shuffled = { ...s, hands: s.hands.map((h, i) => (i === other ? [...h].reverse() : h)) }
    expect(enc(shuffled, seat)).toBe(base)
    // the viewer's own hand order is part of the view
    if (s.hands[seat].length > 1) {
      const own = { ...s, hands: s.hands.map((h, i) => (i === seat ? [...h].reverse() : h)) }
      expect(enc(own, seat)).not.toBe(base)
    }
    expect(enc(s, other)).not.toBe(base)
  })
})

describe('the probe generator is reproducible', () => {
  it('the same seed, step, acting seat and legal asks give the same four probes; another step gives others', () => {
    const asks = [
      { target: 1, card: 3 },
      { target: 3, card: 3 },
      { target: 5, card: 40 },
    ]
    const a = generateProbes('athena-p0-g0a-h1-7', 120, 2, asks)
    expect(generateProbes('athena-p0-g0a-h1-7', 120, 2, asks)).toEqual(a)
    expect(a).toHaveLength(4)
    expect(generateProbes('athena-p0-g0a-h1-7', 130, 2, asks)).not.toEqual(a)
    expect(generateProbes('athena-p0-g0a-h1-8', 120, 2, asks)).not.toEqual(a)
    for (const p of a) {
      expect(p.seat).toBeGreaterThanOrEqual(0)
      expect(p.seat).toBeLessThanOrEqual(6)
      expect(p.card).toBeLessThanOrEqual(54)
      expect(p.set).toBeLessThanOrEqual(9)
    }
  })

  it('over a whole game, probes reach both verdicts, every kind, and asks taken from the legal list', () => {
    const rec = mixedGame('athena-p0-g0a-h5-1', 1)
    const c = rec.columns()
    const verdicts = fromHex(c.probes)
    expect(verdicts.length).toBe(4 * probeStateCount(c.steps))
    expect(verdicts.filter((x) => x === 0).length).toBeGreaterThan(0)
    expect(verdicts.filter((x) => x !== 0).length).toBeGreaterThan(0)
    // an ask probe drawn from the legal list is accepted when it is the turn-holder's
    let s = newGame('athena-probe-ask', us54Config, 0)
    for (let i = 0; i < 6; i++) {
      const r = reduce(s, { type: 'decline', seat: s.declareWindow!.option })
      if (!r.ok) throw new Error(r.error.code)
      s = r.state
    }
    const acting = legalActionsSummary(s).seat
    const idx = legalAsks(s, acting).map((x) => ({ target: x.target as number, card: cardIndex(x.card) }))
    let acceptedAsks = 0
    for (let t = 0; t < 200; t += 10)
      for (const p of generateProbes('athena-probe-ask', t, acting, idx))
        if (p.kind === 0 && verdictOf(reduce, s, probeAction(p)) === 0) acceptedAsks++
    expect(acceptedAsks).toBeGreaterThan(0)
  })
})

describe('an emitted game replays to the same digests from its actions alone', () => {
  const games = [mixedGame('athena-test-replay-mixed', 4), fuzzGame('athena-test-replay-fuzz-0'), fuzzGame('athena-test-replay-fuzz-1')]
  const lines = games.map((g, i) => recordLine(g, { ...META, population: i === 0 ? 'H5' : 'H4', index: i }))

  it('every line parses and replays with no mismatch, to the same game digest', () => {
    for (const line of lines) {
      const rec = parseLine(line)
      const r = replayRecord(rec)
      expect(r.mismatches).toEqual([])
      expect(r.ok).toBe(true)
      expect(r.game).toBe(rec.game)
      expect(r.steps).toBe(rec.steps)
    }
  })

  it('the census the checker runs sees the steps it replays', () => {
    const t: Tally = {}
    const rec = parseLine(lines[0])
    const r = replayRecord(rec, { hook: (pre, a, post, ev, obs) => classifyStep(t, pre, a, post, ev, obs.kinds) })
    classifyEnd(t, r.final, r.end)
    expect(t.steps).toBe(rec.steps)
    expect(t.games).toBe(1)
    expect(t.finished).toBe(1)
    expect(t.fallbackAlone ?? 0).toBe(0)
  })

  it('a tampered digest or action is caught at its step', () => {
    const rec = parseLine(lines[0])
    const k = 17
    const flipped = rec.d.slice(0, 16 * k) + (rec.d[16 * k] === '0' ? '1' : '0') + rec.d.slice(16 * k + 1)
    const r1 = replayRecord({ ...rec, d: flipped })
    expect(r1.ok).toBe(false)
    expect(r1.mismatches.find((m) => m.what === 'd')?.at).toBe(k)
    // re-seat the first decline: the reference refuses it (NOT_YOUR_OPTION), so the replay stops there
    const actions = Uint8Array.from(rec.actions)
    const at = actions.indexOf(4)
    actions[at + 1] = (actions[at + 1] + 1) % 6
    const r2 = replayRecord({ ...rec, actions })
    expect(r2.ok).toBe(false)
    expect(r2.mismatches[0].what).toBe('refused')
  })
})

describe('L_t kinds are the reducer verdicts the specification states in closed form (§4.6)', () => {
  it('ask, claim, pass and decline bits match their closed forms at every step of a mixed game', () => {
    const seed = 'athena-test-kinds'
    let s = newGame(seed, us54Config, 3)
    const rng = mixedStubRng(seed)
    let checked = 0
    while (s.phase !== 'finished') {
      const acting = legalActionsSummary(s).seat
      const asks = legalAsks(s, acting)
      const k = legalKinds(s, acting, asks)
      const open = !!s.declareWindow
      expect(!!(k & KIND_ASK)).toBe(!open && s.phase === 'playing' && asks.length > 0)
      expect(!!(k & KIND_CLAIM)).toBe(open && SETS.some((b) => !s.books[b]))
      expect(!!(k & KIND_PASS)).toBe(s.phase === 'awaitPass')
      expect(!!(k & KIND_DECLINE)).toBe(open && turnHolderCanAsk(s))
      const r = reduce(s, mixedStubAction(s, acting, rng))
      if (!r.ok) throw new Error(r.error.code)
      s = r.state
      checked++
    }
    expect(checked).toBeGreaterThan(100)
  })
})

describe('a planted mutant is caught (M2: a misassigned own-team declare scores for the declarer)', () => {
  /** A test-only copy of the scorer with M2's rule change, laid over the reference reducer. */
  const m2: ReduceFn = (s, a) => {
    const r = reduce(s, a)
    if (!r.ok || a.type !== 'claim') return r
    const ev = r.events[0]
    if (ev.type !== 'claim') return r
    const team = a.seat % 2
    const own = team === 0 ? 'team0' : 'team1'
    const misassigned = ev.outcome !== own && Object.values(ev.actualHolders).every((h) => h % 2 === team)
    if (!misassigned) return r
    const book = r.state.books[a.book] as BookResult
    const score: [number, number] = [r.state.score[0], r.state.score[1]]
    score[team] += 1
    score[1 - team] -= 1
    const events = r.events.map((e) => (e === ev ? { ...ev, outcome: own } : e)) as typeof r.events
    return { ok: true, events, state: { ...r.state, books: { ...r.state.books, [a.book]: { ...book, outcome: own } }, score } }
  }

  /** The first fuzz seed whose game makes a misassigned declare, and that declare's step. */
  function findMisassigned(): { seed: string; step: number } {
    for (let i = 0; i < 400; i++) {
      const seed = `athena-test-m2-${i}`
      const rng = rngFromSeed(`${seed}:policy`)
      let s = newGame(seed, us54Config, randInt(rng, 6) as Seat)
      for (let step = 0; s.phase !== 'finished'; step++) {
        const a: GameAction = us54PolicyAction(s, rng)
        const r = reduce(s, a)
        if (!r.ok) throw new Error(r.error.code)
        const ev = r.events[0]
        if (a.type === 'claim' && ev?.type === 'claim') {
          const team = a.seat % 2
          if (ev.outcome !== (team === 0 ? 'team0' : 'team1') && Object.values(ev.actualHolders).every((h) => h % 2 === team))
            return { seed, step }
        }
        s = r.state
      }
    }
    throw new Error('no misassigned declare in 400 fuzz games')
  }

  it('the reference record replays clean; under M2 the state digest diverges at the misassigned declare', () => {
    const { seed, step } = findMisassigned()
    const rec = parseLine(recordLine(fuzzGame(seed), { ...META, population: 'H4', index: 0 }))
    expect(replayRecord(rec).ok).toBe(true)
    const r = replayRecord(rec, { reduce: m2 })
    expect(r.ok).toBe(false)
    expect(r.firstDivergentStep).toBe(step)
    expect(r.mismatches.find((m) => m.what === 'd')?.at).toBe(step)
    // and nothing before it differed: M2 is invisible until its branch occurs
    expect(r.mismatches.every((m) => m.what === 'probe' || m.what === 'game' || m.what === 'end' || m.what === 'length' || m.at >= step)).toBe(true)
  })

  it('a game with no misassigned declare does not see M2 at all', () => {
    const rec = parseLine(recordLine(mixedGame('athena-p0-g0a-h5-0', 0), { ...META, population: 'H5', index: 0 }))
    expect(replayRecord(rec, { reduce: m2 }).ok).toBe(true)
  })
})

describe('cards and sets are indexed as the specification tables say', () => {
  it('54 cards suit-major with the 8, jokers last; 9 sets, EIGHTS last', () => {
    expect(CARDS.slice(0, 13).join(' ')).toBe('2C 3C 4C 5C 6C 7C 8C 9C TC JC QC KC AC')
    expect(CARDS.slice(52)).toEqual(['XR', 'XB'])
    expect(SETS).toEqual(['LOW-C', 'LOW-D', 'LOW-H', 'LOW-S', 'HIGH-C', 'HIGH-D', 'HIGH-H', 'HIGH-S', 'EIGHTS'])
    expect(cardIndex('8S')).toBe(45)
  })
})
