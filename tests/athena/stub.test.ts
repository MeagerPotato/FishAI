/**
 * ATHENA P0 G0d (ATHENA.md §4.5 item 6, §4.6): the inference contract in `lib/athena/`.
 *
 * - **The encoder**: API.md's constants and worked examples; every action code round-trips; the legal row's asks are
 *   exactly the engine's legal asks; and the fixture games (`tests/athena/data/encoder-fixture.json`, written by
 *   `scripts/athena/dump-actor-buffers.py` from the Rust port's own buffers, in both of P1's regimes with the facts
 *   row) replay here to the port's digests, byte for byte. The full comparison is `scripts/athena/check-encoder.mjs`.
 * - **The forward is deterministic**: `expDet` against `Math.exp`; the init is a pure function of its seed; the weight
 *   file round-trips bit for bit; the frozen stub's file has the md5 its manifest pins; the incremental per-seat cache
 *   equals a full refold bit for bit at every decision of real games.
 * - **The rail**: a complete set in hand is declared on the window at confidence 1; over in-engine games against the
 *   G0a mixed stub (whose games reach the rail and the compelled claims far more often than Balanced's) every rail
 *   declaration names the true holders; a plan's confidence is 1 exactly when the rules make it certain.
 *
 * The network in the game tests is a tiny member of the family (d 8, width 16), so the suite stays fast; the frozen
 * stub's size S is built once, for its md5.
 */
import { describe, expect, it } from 'vitest'
import * as A from '../../lib/athena/index.ts'
import { decide, STYLE_ROSTER } from '../../lib/engine/bots/index.ts'
import { legalAsksFromView } from '../../lib/engine/helpers.ts'
import { newGame, reduce, us54Config } from '../../lib/engine/reduce.ts'
import type { Card, GameAction, GameState, Seat } from '../../lib/engine/types.ts'
import { seatView } from '../../lib/engine/views.ts'
import { mixedStubAction, mixedStubRng } from '../../scripts/athena/mixed-stub.ts'
import { digestBytes } from '../../scripts/athena/replay-codec.ts'
import { ReducedReveal } from '../../scripts/athena/facts-codec.ts'

/** Node's own modules, loaded by a computed specifier: this project has no @types/node, so the parts used are typed here. */
interface NodeFs {
  readFileSync(path: URL, encoding: 'utf8'): string
}
interface NodeCrypto {
  createHash(algorithm: 'md5'): { update(bytes: Uint8Array): { digest(encoding: 'hex'): string } }
}
const nodeModule = async <T,>(name: string): Promise<T> => (await import(/* @vite-ignore */ name)) as T
const readText = async (rel: string): Promise<string> => (await nodeModule<NodeFs>('node:fs')).readFileSync(new URL(rel, import.meta.url), 'utf8')

const TINY: A.Arch = { d: 8, width: 16, depth: 2 }
const tinyNet = (seed = 'athena-g0d-test'): A.AthenaNet => A.makeNet(TINY, A.initBlob(TINY, seed), { test: true })
const actorOf = (s: GameState): Seat => (s.declareWindow && s.phase !== 'finished' ? s.declareWindow.option : s.turn)
const bitEqual = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
  return true
}

/**
 * Play one game: the stub on team 0 (tiny net, a cache per seat), Balanced or the G0a mixed stub on team 1. `visit`
 * sees every stub decision.
 */
function playStubGame(
  net: A.AthenaNet,
  seed: string,
  start: Seat,
  opp: 'balanced' | 'mixed',
  visit: (s: GameState, seat: Seat, d: A.StubDecision, cache: A.SeatForward) => void,
): GameState {
  let s = newGame(seed, us54Config, start)
  const rng = mixedStubRng(seed)
  const caches = [0, 1, 2, 3, 4, 5].map(() => new A.SeatForward(net))
  for (let guard = 0; s.phase !== 'finished'; guard++) {
    if (guard > 6000) throw new Error(`${seed}: no finish`)
    const seat = actorOf(s)
    let action: GameAction
    if (seat % 2 === 0) {
      const d = A.decideStub(net, seatView(s, seat), caches[seat])
      visit(s, seat, d, caches[seat])
      action = d.action
    } else {
      action = opp === 'mixed' ? mixedStubAction(s, seat, rng) : decide(seatView(s, seat), STYLE_ROSTER.balanced, (s.log.length + seat) >>> 0)
    }
    const r = reduce(s, action)
    if (!r.ok) throw new Error(`${seed}: ${r.error.code} ${r.error.message}`)
    s = r.state
  }
  return s
}

describe('the encoder (API.md)', () => {
  it('has the layout constants', () => {
    expect([A.N_CARDS, A.N_SETS, A.N_ASK, A.A_DECLINE, A.A_PASS, A.A_DECLARE, A.N_ACTIONS]).toEqual([54, 9, 162, 162, 163, 165, 6726])
    expect([A.OBS_LEN, A.LEGAL_LEN, A.EVENT_LEN, A.NONE]).toEqual([95, 174, 19, 255])
    expect([A.L_ASK, A.L_DECLARE, A.L_DECLINE, A.L_PASS]).toEqual([0, 162, 171, 172])
    expect(A.SET_CARDS[8]).toEqual([6, 19, 32, 45, 52, 53])
    expect(['2C', '8C', 'AC', '8S', 'XR', 'XB'].map((c) => A.cardIndex(c as Card))).toEqual([0, 6, 12, 45, 52, 53])
  })

  it("reproduces API.md's two worked examples", () => {
    expect(A.encodeAction({ type: 'ask', seat: 4, target: 1, card: '8H' })).toBe(86)
    expect(A.decodeAction(4, 86)).toEqual({ type: 'ask', seat: 4, target: 1, card: '8H' })
    const eights = { '8C': 1, '8D': 1, '8H': 1, '8S': 3, XR: 3, XB: 5 } as Record<Card, Seat>
    expect(A.encodeAction({ type: 'claim', seat: 1, book: A.SETS[8], assignments: eights })).toBe(6591)
    const back = A.decodeAction(1, 6591)
    expect(back?.type).toBe('claim')
    expect(back && back.type === 'claim' ? back.assignments : null).toEqual(eights)
  })

  it('round-trips every action code at every seat', () => {
    let n = 0
    for (let seat = 0; seat < 6; seat++) {
      for (let code = 0; code < A.N_ACTIONS; code++) {
        const a = A.decodeAction(seat as Seat, code)
        expect(a).not.toBeNull()
        expect(A.encodeAction(a as GameAction)).toBe(code)
        n++
      }
    }
    expect(n).toBe(6 * 6726)
  })

  it("marks exactly the engine's legal asks", () => {
    const obs = new Uint8Array(A.OBS_LEN)
    const legal = new Uint8Array(A.LEGAL_LEN)
    let asks = 0
    for (let g = 0; g < 4; g++) {
      let s = newGame(`athena-g0d-legal-${g}`, us54Config, (g % 6) as Seat)
      while (s.phase !== 'finished') {
        const seat = actorOf(s)
        const v = seatView(s, seat)
        if (s.phase === 'playing' && !s.declareWindow) {
          A.encodeObservation(v, obs, legal)
          const want = legalAsksFromView(v).map((a) => A.encodeAction({ type: 'ask', seat, ...a }) as number).sort((x, y) => x - y)
          const got: number[] = []
          for (let c = 0; c < A.N_ASK; c++) if (legal[A.L_ASK + c] === 1) got.push(c)
          expect(got).toEqual(want)
          asks++
        }
        const r = reduce(s, decide(v, STYLE_ROSTER.balanced, (s.log.length + seat) >>> 0))
        if (!r.ok) throw new Error(r.error.message)
        s = r.state
      }
    }
    expect(asks).toBeGreaterThan(50)
  })

  it("replays the Rust port's fixture games to the port's digests", async () => {
    const fx = JSON.parse(await readText('./data/encoder-fixture.json')) as {
      format: string
      facts: boolean
      games: { population: string; seed: string; start: number; regime: number; codes: number[]; digest: string }[]
    }
    expect([fx.format, fx.facts, fx.games.length]).toEqual(['athena-encoder-fixture-2', true, 20])
    expect(new Set(fx.games.map((g) => g.regime))).toEqual(new Set([A.REGIME_HOME, A.REGIME_BRIDGE]))
    const obs = new Uint8Array(A.OBS_LEN)
    const legal = new Uint8Array(A.LEGAL_LEN)
    const facts = new Uint8Array(A.FACTS_LEN)
    for (const game of fx.games) {
      let s = newGame(game.seed, us54Config, game.start as Seat)
      const red = new ReducedReveal()
      for (const e of s.log) red.push(e)
      const seen = [0, 0, 0, 0, 0, 0]
      const bytes: number[] = []
      for (let t = 0; t <= game.codes.length; t++) {
        const seat = actorOf(s)
        const v = game.regime === A.REGIME_BRIDGE ? red.view(s, seat) : seatView(s, seat)
        A.encodeObservation(v, obs, legal, game.regime)
        A.encodeFactsRow(v, A.factsOf(v), facts)
        const all = A.encodeEventRows(v.log, seat)
        const rows = all.subarray(seen[seat] * A.EVENT_LEN)
        seen[seat] = all.length / A.EVENT_LEN
        bytes.push(seat, rows.length / A.EVENT_LEN, ...obs, ...legal, ...facts, ...rows)
        if (t === game.codes.length) break
        const r = reduce(s, A.decodeAction(seat, game.codes[t]) as GameAction)
        if (!r.ok) throw new Error(`${game.seed} step ${t}: ${r.error.code}`)
        for (const e of r.events) red.push(e)
        s = r.state
      }
      expect(s.phase).toBe('finished')
      expect(digestBytes(bytes), `${game.population} ${game.seed} regime ${game.regime}`).toBe(game.digest)
    }
  })
})

describe('the forward is deterministic', () => {
  it('expDet matches Math.exp to a few ulps, and the gates follow from it', () => {
    let worst = 0
    for (let i = -4000; i <= 4000; i++) {
      const x = i / 80 + 1e-3 * Math.sin(i)
      worst = Math.max(worst, Math.abs(A.expDet(x) / Math.exp(x) - 1))
    }
    expect(worst).toBeLessThan(1e-14)
    expect(A.expDet(0)).toBe(1)
    expect(A.sigmoidDet(0)).toBe(0.5)
    expect(A.tanhDet(0)).toBe(0)
    for (const x of [-20, -3, -0.5, 0.25, 2, 15]) {
      expect(A.sigmoidDet(x)).toBeCloseTo(1 / (1 + Math.exp(-x)), 14)
      expect(A.tanhDet(x)).toBeCloseTo(Math.tanh(x), 14)
    }
  })

  it('counts the three sizes, and the init is a pure function of its seed', () => {
    expect([A.paramCount(A.ARCHS.S), A.paramCount(A.ARCHS.M), A.paramCount(A.ARCHS.L)]).toEqual([1_363_717, 5_349_381, 23_283_205])
    const a = A.initBlob(TINY, 'seed-a')
    expect(a.length).toBe(A.paramCount(TINY))
    expect(bitEqual(a, A.initBlob(TINY, 'seed-a'))).toBe(true)
    expect(bitEqual(a, A.initBlob(TINY, 'seed-b'))).toBe(false)
  })

  it('round-trips the weight file bit for bit, and refuses a bad one', () => {
    const net = tinyNet()
    const bytes = A.serializeWeights(net)
    const back = A.parseWeights(bytes)
    expect(back.arch).toEqual(TINY)
    expect(bitEqual(back.blob, net.blob)).toBe(true)
    expect(bitEqual(A.serializeWeights(back), bytes)).toBe(true)
    const bad = bytes.slice()
    bad[0] ^= 1
    expect(() => A.parseWeights(bad)).toThrow(/magic/)
  })

  it("builds the frozen stub's weight file with the md5 its manifest pins", async () => {
    const spec = JSON.parse(await readText('../../athena-stub/stub-weights.json')) as { arch: 'S'; seed: string }
    const manifest = JSON.parse(await readText('../../athena-stub/fishbot.json')) as { env: { ATHENA_WEIGHTS_MD5: string } }
    const { createHash } = await nodeModule<NodeCrypto>('node:crypto')
    const arch = A.ARCHS[spec.arch]
    const bytes = A.serializeWeights({ arch, blob: A.initBlob(arch, spec.seed), meta: { stub: true, size: spec.arch, seed: spec.seed, init: A.INIT_SCHEME } })
    expect(createHash('md5').update(bytes).digest('hex')).toBe(manifest.env.ATHENA_WEIGHTS_MD5)
  })

  it('the incremental cache equals a full refold at every decision, bit for bit', () => {
    const net = tinyNet()
    let compared = 0
    for (let g = 0; g < 3; g++) {
      playStubGame(net, `athena-g0d-cache-${g}`, (g % 6) as Seat, g % 2 === 0 ? 'balanced' : 'mixed', (s, seat, d, cache) => {
        const v = seatView(s, seat)
        const inc = A.forwardView(net, v, cache).heads
        const full = A.forwardView(net, v, null).heads
        expect(bitEqual(inc, full)).toBe(true)
        const again = A.decideStub(net, v, null)
        expect(again.action).toEqual(d.action)
        compared++
      })
    }
    expect(compared).toBeGreaterThan(200)
  })
})

describe('the rules-certain rail', () => {
  it('declares a complete set in hand on the window, at confidence 1', () => {
    const net = tinyNet()
    const base = newGame('athena-g0d-rail', us54Config, 0)
    // Seat s holds cards 9s .. 9s+8 in card order: seat 0 has 2C..TC, the whole of LOW-C.
    const hands = [0, 1, 2, 3, 4, 5].map((s) => A.CARDS.slice(9 * s, 9 * s + 9) as Card[])
    let s: GameState = { ...base, hands }
    for (let i = 0; i < 12 && !(s.declareWindow && s.declareWindow.option === 0); i++) {
      const r = reduce(s, { type: 'decline', seat: actorOf(s) })
      if (!r.ok) throw new Error(r.error.message)
      s = r.state
    }
    expect(s.declareWindow?.option).toBe(0)
    const d = A.decideStub(net, seatView(s, 0))
    expect(d.kind).toBe('rail')
    expect(d.plan?.book).toBe(A.SETS[0])
    expect(d.plan?.p).toBe(1)
    expect(Object.values(d.plan?.assignments ?? {})).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('declares only right, at the true holders, over in-engine games; confidence 1 exactly when certain', () => {
    const net = tinyNet()
    let rails = 0
    let plans = 0
    for (let g = 0; g < 24; g++) {
      playStubGame(net, `athena-g0d-railgames-${g}`, (g % 6) as Seat, 'mixed', (s, seat, d) => {
        if (d.kind !== 'rail' && d.kind !== 'compelled') return
        const plan = d.plan as A.DeclarePlan
        plans++
        expect(plan.p === 1).toBe(plan.certain)
        if (plan.lost) expect(plan.p).toBe(0)
        if (!plan.certain) expect(plan.p).toBeLessThanOrEqual(A.UNCERTAIN_CAP)
        if (d.kind !== 'rail') return
        rails++
        expect(plan.certain).toBe(true)
        for (const [card, at] of Object.entries(plan.assignments)) expect(s.hands[at as Seat].includes(card as Card), `${card} at seat ${at}`).toBe(true)
        expect(seat % 2).toBe(0)
      })
    }
    expect(rails).toBeGreaterThan(0)
    expect(plans).toBeGreaterThanOrEqual(rails)
  })
})
