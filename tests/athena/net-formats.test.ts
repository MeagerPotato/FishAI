/**
 * ATHENA P2 (ATHENA.md §9.2): the forward reads its shape from the weight header, and supports exactly three formats.
 *
 * - **The three formats load, and nothing else does.** v1 (decF 516, heads 517, the 21-slot fold), v2 (912, 517, 21)
 *   and v3 (912, 518, 19) each round-trip through a weight file; any other (`eventF`, `decF`, `heads`) triple is
 *   refused, by a message that names what it read and what this forward supports.
 * - **v1 and v2 are untouched.** Their headers, their `arch` objects and their heads are what they were before
 *   format 3 existed: no `heads` key is written, and the fold still adds the embedding's column 0 twice.
 * - **The golden fixture** (`tests/athena/data/v3-forward.json`, written by `scripts/athena/gen-v3-fixture.mjs`) pins
 *   a v3 forward on 22 corpus views of both regimes: all 518 heads bit for bit, the belief, and `decideNet`'s move.
 * - **The mutation check**: with the embedding's column 0 zeroed, the 19-slot fold and the 21-slot fold agree bit for
 *   bit on every event — the two extra columns are column 0 — and with it non-zero they disagree, at every event,
 *   by exactly twice that column. That is what it means for v3 to read 19 slots and not 21.
 * - **The format 3 window policy** (§9.1, G1c: every offer reaches the network): after the rail, the declare head
 *   chooses between the legal sets and its tenth output, the decline.
 */
import { describe, expect, it } from 'vitest'
import * as A from '../../lib/athena/index.ts'
import { newGame, reduce, us54Config } from '../../lib/engine/reduce.ts'
import { seatView } from '../../lib/engine/views.ts'
import { decide, STYLE_ROSTER } from '../../lib/engine/bots/index.ts'
import type { GameAction, GameState, Seat } from '../../lib/engine/types.ts'

interface NodeFs {
  readFileSync(path: URL, encoding: 'utf8'): string
}
const nodeModule = async <T,>(name: string): Promise<T> => (await import(/* @vite-ignore */ name)) as T
const readText = async (rel: string): Promise<string> => (await nodeModule<NodeFs>('node:fs')).readFileSync(new URL(rel, import.meta.url), 'utf8')

const TINY: A.Arch = { d: 8, width: 16, depth: 2 }
const actorOf = (s: GameState): Seat => (s.declareWindow && s.phase !== 'finished' ? s.declareWindow.option : s.turn)
const netAt = (version: 1 | 2 | 3, seed = 'athena-p2-formats'): A.AthenaNet => {
  const arch = A.withFormat(TINY, version)
  return A.makeNet(arch, A.initBlob(arch, seed), { test: version })
}
/** The float64 values behind a base64 of their little-endian bytes (the fixture's `heads`). */
const unb64 = (s: string): Float64Array => {
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Float64Array(bytes.buffer)
}
const bitEqual = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
  return true
}

describe('the weight formats (ATHENA.md §9.2)', () => {
  it('names three, and their shapes are v1 516/517/21, v2 912/517/21, v3 912/518/19', () => {
    expect(A.WEIGHT_FORMATS.map((f) => [f.version, f.decF, f.heads, f.foldSlots])).toEqual([
      [1, 516, 517, 21],
      [2, 912, 517, 21],
      [3, 912, 518, 19],
    ])
    expect([A.EVENT_SLOTS, A.FOLD_SLOTS_LEGACY, A.HEADS, A.HEADS_V3]).toEqual([19, 21, 517, 518])
    expect(A.H_SETDIFF).toBe(A.H_VALUE + 1)
    expect(A.H_SETDIFF).toBe(A.HEADS_V3 - 1)
  })

  it('loads each of the three from its header, and reads the shape from there', () => {
    for (const f of A.WEIGHT_FORMATS) {
      const net = netAt(f.version)
      const back = A.parseWeights(A.serializeWeights(net))
      expect([A.decFOf(back.arch), A.headCountOf(back.arch), back.foldSlots, back.heads]).toEqual([f.decF, f.heads, f.foldSlots, f.heads])
      expect(A.formatOf(back.arch).version).toBe(f.version)
      expect(Array.from(back.blob)).toEqual(Array.from(net.blob))
      expect(back.headB.length).toBe(f.heads)
      expect(back.headW.length).toBe(f.heads * TINY.width)
      // the head layer is the only tensor the extra output touches
      expect(A.paramCount(back.arch) - A.paramCount(A.withFormat(TINY, f.version === 3 ? 2 : f.version))).toBe(f.version === 3 ? TINY.width + 1 : 0)
    }
  })

  it('refuses any other header, naming what it read and what it supports', () => {
    const net = netAt(3)
    const bytes = A.serializeWeights(net)
    const patched = (edit: (h: Record<string, number>) => void): Uint8Array => {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const hl = dv.getUint32(8, true)
      const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + hl))) as { arch: Record<string, number> }
      edit(header.arch)
      let json = JSON.stringify(header)
      while ((12 + new TextEncoder().encode(json).length) % 4 !== 0) json += ' '
      const hb = new TextEncoder().encode(json)
      const out = new Uint8Array(12 + hb.length + (bytes.length - 12 - hl))
      out.set(bytes.subarray(0, 8), 0)
      new DataView(out.buffer).setUint32(8, hb.length, true)
      out.set(hb, 12)
      out.set(bytes.subarray(12 + hl), 12 + hb.length)
      return out
    }
    // 912/517 is a real format, so a v3 file relabelled v2 gets past the format table and is caught by the layout
    expect(() => A.parseWeights(patched((h) => (h.heads = 517)))).toThrow(/the weight file header does not match its arch layout/)
    // 516/518, 519 heads and eventF 175 are no format at all
    expect(() => A.parseWeights(patched((h) => (h.decF = 516)))).toThrow(
      /the weights were built for eventF 176, decF 516, heads 518; this forward supports v1 \(eventF 176, decF 516, heads 517\), v2 \(eventF 176, decF 912, heads 517\), v3 \(eventF 176, decF 912, heads 518\)/,
    )
    expect(() => A.parseWeights(patched((h) => (h.eventF = 175)))).toThrow(/eventF 175, decF 912, heads 518; this forward supports/)
    expect(() => A.parseWeights(patched((h) => (h.heads = 519)))).toThrow(/heads 519; this forward supports/)
    expect(() => A.makeNet({ ...TINY, decF: A.DEC_F, heads: A.HEADS_V3 }, new Float32Array(0))).toThrow(/decF 516, heads 518; this forward supports/)
    expect(() => A.withFormat(TINY, 4 as 1)).toThrow(/weight format 4/)
  })

  it('leaves v1 and v2 byte for byte as they were: no heads key, and the 21-slot fold', () => {
    for (const version of [1, 2] as const) {
      const net = netAt(version)
      expect(net.arch).toEqual(version === 1 ? TINY : { ...TINY, decF: A.DEC_F_FACTS })
      expect(Object.keys(net.arch)).not.toContain('heads')
      expect(net.foldSlots).toBe(21)
      expect(net.heads).toBe(517)
      const json = new TextDecoder().decode(A.serializeWeights(net).subarray(12)).trimEnd()
      const head = json.slice(0, json.lastIndexOf('}}') + 2)
      expect(head).toContain(version === 1 ? `"arch":{"d":8,"width":16,"depth":2,"eventF":176,"decF":516,"heads":517}` : `"arch":{"d":8,"width":16,"depth":2,"decF":912,"eventF":176,"heads":517}`)
    }
  })
})

describe('the format 3 fold reads 19 slots (ATHENA.md §9.2)', () => {
  const rows = (() => {
    // every event of a real game, from one seat: types, hits, declares, the lot
    let s = newGame('athena-p2-fold', us54Config, 0)
    for (let guard = 0; s.phase !== 'finished' && guard < 4000; guard++) {
      const seat = actorOf(s)
      const r = reduce(s, decide(seatView(s, seat), STYLE_ROSTER.balanced, (s.log.length + seat) >>> 0))
      if (!r.ok) throw new Error(r.error.code)
      s = r.state
    }
    return A.encodeEventRows(s.log, 0)
  })()
  const n = rows.length / A.EVENT_LEN

  it('writes exactly 19 slots, never a twentieth', () => {
    const out = new Int32Array(21).fill(-1)
    for (let i = 0; i < n; i++) {
      A.eventSlots(rows, i * A.EVENT_LEN, out)
      expect(out[19]).toBe(-1)
      expect(out[20]).toBe(-1)
      for (let k = 0; k < A.EVENT_SLOTS; k++) expect(out[k]).toBeGreaterThanOrEqual(0)
    }
  })

  it('agrees with the 21-slot fold exactly when the embedding\'s column 0 is zero, and not otherwise', () => {
    expect(n).toBeGreaterThan(80)
    const seed = 'athena-p2-fold-mutation'
    const zeroed = (version: 2 | 3): A.AthenaNet => {
      const arch = A.withFormat(TINY, version)
      const blob = A.initBlob(arch, seed)
      const net = A.makeNet(arch, blob, {})
      for (let i = 0; i < TINY.d; i++) net.embW[i * A.EVENT_F] = 0
      return net
    }
    // the two extra columns of the 21-slot fold ARE column 0: zero it and the two folds are the same function
    expect(bitEqual(A.foldAll(zeroed(2), rows, n), A.foldAll(zeroed(3), rows, n))).toBe(true)

    // the mutation: put a value back into column 0. The 19-slot fold must now differ from the 21-slot one.
    const mutated = (version: 2 | 3, col0: number): A.AthenaNet => {
      const net = zeroed(version)
      for (let i = 0; i < TINY.d; i++) net.embW[i * A.EVENT_F] = Math.fround(col0 * (i + 1))
      return net
    }
    const h2 = A.foldAll(mutated(2, 0.125), rows, n)
    const h3 = A.foldAll(mutated(3, 0.125), rows, n)
    expect(bitEqual(h2, h3)).toBe(false)

    // and the difference is exactly two more columns, not one and not three: fold one event each way and compare the
    // embedded input through a net whose GRU is the identity-free path, by giving the 19-fold the doubled column back
    const doubled = mutated(3, 0.125)
    for (let i = 0; i < TINY.d; i++) doubled.embB[i] = Math.fround(doubled.embB[i] + 2 * doubled.embW[i * A.EVENT_F])
    expect(bitEqual(A.foldAll(doubled, rows, n), h2)).toBe(false) // fround of a sum is not the sum of the frounds
    let worst = 0
    const a = A.foldAll(doubled, rows, n)
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - h2[i]))
    expect(worst).toBeLessThan(1e-6)
  })
})

describe('the v3 forward, pinned on corpus views', () => {
  it('reproduces tests/athena/data/v3-forward.json bit for bit', async () => {
    const fx = JSON.parse(await readText('./data/v3-forward.json')) as {
      format: string
      arch: A.Arch
      weights: { seed: string; params: number; md5: string }
      views: {
        game: number
        seed: string
        start: number
        regime: number
        t: number
        seat: number
        rows: number
        kind: string
        code: number
        p: number | null
        card: number
        belief: number[] | null
        value: number
        setDiff: number
        heads: string
      }[]
    }
    expect(fx.format).toBe('athena-v3-forward-1')
    expect(fx.arch).toEqual({ d: 8, width: 16, depth: 2, decF: 912, heads: 518 })
    expect(fx.views.length).toBeGreaterThan(15)
    expect(new Set(fx.views.map((v) => v.regime))).toEqual(new Set([A.REGIME_HOME, A.REGIME_BRIDGE]))

    const net = A.makeNet(fx.arch, A.initBlob(fx.arch, fx.weights.seed), { fixture: fx.format, seed: fx.weights.seed })
    expect(A.paramCount(fx.arch)).toBe(fx.weights.params)
    const { ReducedReveal } = await import('../../scripts/athena/facts-codec.ts')
    const { REGIME_BRIDGE } = A
    const enc = JSON.parse(await readText('./data/encoder-fixture.json')) as {
      games: { seed: string; start: number; regime: number; codes: number[] }[]
    }

    // replay each fixture game through its own recorded codes, forwarding at the steps the fixture names
    const byGame = new Map<number, typeof fx.views>()
    for (const v of fx.views) {
      if (!byGame.has(v.game)) byGame.set(v.game, [])
      ;(byGame.get(v.game) as typeof fx.views).push(v)
    }
    let checked = 0
    for (const [gi, views] of byGame) {
      const game = enc.games[gi]
      expect([game.seed, game.start, game.regime]).toEqual([views[0].seed, views[0].start, views[0].regime])
      let s = newGame(game.seed, us54Config, game.start as Seat)
      const red = new ReducedReveal()
      for (const e of s.log) red.push(e)
      const want = new Map(views.map((v) => [v.t, v]))
      for (let t = 0; t <= Math.max(...views.map((v) => v.t)); t++) {
        const seat = actorOf(s)
        const v = want.get(t)
        if (v !== undefined) {
          expect(seat).toBe(v.seat)
          const view = v.regime === REGIME_BRIDGE ? red.view(s, seat) : seatView(s, seat)
          const k = A.factsOf(view)
          const f = A.forwardView(net, view, null, k)
          expect(f.heads.length).toBe(518)
          expect(bitEqual(f.heads, unb64(v.heads)), `${v.seed} regime ${v.regime} step ${t}`).toBe(true)
          expect(f.heads[A.H_VALUE]).toBe(v.value)
          expect(f.heads[A.H_SETDIFF]).toBe(v.setDiff)
          expect(A.encodeEventRows(view.log, seat).length / A.EVENT_LEN).toBe(v.rows)
          if (v.belief !== null) {
            const p = A.beliefOf(f.heads, A.candidateMatrix(view, k))
            expect(Array.from(p.subarray(v.card * 6, v.card * 6 + 6))).toEqual(v.belief)
          }
          const d = A.decideNet(net, view, null)
          expect([d.kind, A.encodeAction(d.action)]).toEqual([v.kind, v.code])
          expect(d.plan === undefined ? null : d.plan.p).toBe(v.p)
          checked++
        }
        const r = reduce(s, A.decodeAction(seat, game.codes[t]) as GameAction)
        expect(r.ok, `${game.seed} step ${t}`).toBe(true)
        if (!r.ok) break
        for (const e of r.events) red.push(e)
        s = r.state
      }
    }
    expect(checked).toBe(fx.views.length)
  })
})

describe('the format 3 declare window (ATHENA.md §9.1, §9.3)', () => {
  it('takes every offer to the network, and the declare head\'s tenth output is the decline', () => {
    const net = netAt(3, 'athena-p2-window')
    let s = newGame('athena-p2-window', us54Config, 0)
    let offers = 0
    let declines = 0
    let declares = 0
    for (let guard = 0; s.phase !== 'finished' && guard < 4000; guard++) {
      const seat = actorOf(s)
      const view = seatView(s, seat)
      if (s.declareWindow && A.railPlan(view, A.factsOf(view)) === null) {
        const obs = new Uint8Array(A.OBS_LEN)
        const legal = new Uint8Array(A.LEGAL_LEN)
        A.encodeObservation(view, obs, legal)
        if (legal[A.L_DECLINE] === 1) {
          offers++
          // the decline head raised above every set: the offer is declined, and the forward ran
          const big = A.makeNet(net.arch, net.blob.slice(), {})
          big.headB[A.H_DECLARE + A.N_SETS] = 1e6
          const d = A.decideNet(big, view, null)
          expect([d.kind, d.forward]).toEqual(['decline', true])
          declines++
          // and dropped below every set: the offer is taken, as a declare and not as a compelled claim
          big.headB[A.H_DECLARE + A.N_SETS] = -1e6
          const e = A.decideNet(big, view, null)
          expect([e.kind, e.action.type, e.forward]).toEqual(['declare', 'claim', true])
          expect(e.plan?.certain).toBe(false)
          declares++
        }
      }
      const r = reduce(s, decide(view, STYLE_ROSTER.balanced, (s.log.length + seat) >>> 0))
      if (!r.ok) throw new Error(r.error.code)
      s = r.state
    }
    expect(offers).toBeGreaterThan(20)
    expect([declines, declares]).toEqual([offers, offers])
  })

  it('leaves a v1 and a v2 net declining without a forward pass, as the stub always did', () => {
    for (const version of [1, 2] as const) {
      const net = netAt(version, 'athena-p2-window')
      let s = newGame('athena-p2-window', us54Config, 0)
      let offers = 0
      for (let guard = 0; s.phase !== 'finished' && guard < 4000; guard++) {
        const seat = actorOf(s)
        const view = seatView(s, seat)
        if (s.declareWindow && A.railPlan(view, A.factsOf(view)) === null) {
          const obs = new Uint8Array(A.OBS_LEN)
          const legal = new Uint8Array(A.LEGAL_LEN)
          A.encodeObservation(view, obs, legal)
          if (legal[A.L_DECLINE] === 1) {
            offers++
            expect(A.decideStub(net, view, null)).toEqual({ action: { type: 'decline', seat }, kind: 'decline', forward: false })
          }
        }
        const r = reduce(s, decide(view, STYLE_ROSTER.balanced, (s.log.length + seat) >>> 0))
        if (!r.ok) throw new Error(r.error.code)
        s = r.state
      }
      expect(offers).toBeGreaterThan(20)
    }
    expect(A.decideStub).toBe(A.decideNet)
  })
})
