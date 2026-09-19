/**
 * ATHENA P1 (ATHENA.md §8.3): the belief head's JavaScript side.
 *
 * - **`beliefOf`** (net.ts): each card's softmax over exactly its candidate relative seats, zero elsewhere, all zero
 *   for a card with no candidate; the argmax is the highest candidate logit; and on a real network it is the same
 *   softmax `planSet` multiplies into a declare's confidence, bit for bit.
 * - **`scaleToMargins`** (marginal.ts), exported for B-M-scaled: rows sum to 1 and columns to the margins on exit.
 * - **The `.npy` reader** (`scripts/athena/npz.mjs`, which reads the stored games): numeric and fixed-width unicode
 *   members, built here byte by byte as NumPy writes them.
 * - **`factsFeatures`** (net.ts, P1's decision features 516 + 396 = 912): equal to `belief_data.py`'s `facts_features`
 *   on the fixture's facts rows (`tests/athena/data/facts-features.json`, written by `belief_train.py fixture` from the
 *   (a)-test views, the port's facts, and (c)'s, the reference's at the bridge, plus three synthetic rows), and the
 *   tightest-constraint rule by hand.
 * - **The decF = 912 net**: its layout, a weight file's round trip, the refusal of any other width, G0d's 516 header
 *   unchanged, and `forwardView` reading the facts row's features exactly as the export check composes them.
 */
import { describe, expect, it } from 'vitest'
import * as A from '../../lib/athena/index.ts'
import { scaleToMargins } from '../../lib/engine/bots/marginal.ts'
import { buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import { hashSeed, mulberry32 } from '../../lib/engine/rng.ts'
import { newGame, reduce, us54Config } from '../../lib/engine/reduce.ts'
import { legalActionsSummary } from '../../lib/engine/helpers.ts'
import { seatView } from '../../lib/engine/views.ts'
import { decide } from '../../lib/engine/bots/index.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import type { BotPolicy } from '../../lib/engine/bots/style.ts'

describe('beliefOf: the belief head masked by the rules', () => {
  it('is a softmax over each card\'s candidates and zero elsewhere', () => {
    const rng = mulberry32(20260919)
    const heads = new Float64Array(A.HEADS)
    for (let i = 0; i < heads.length; i++) heads[i] = 6 * rng() - 3
    const cands = new Uint8Array(324)
    for (let c = 0; c < 54; c++) {
      const k = c % 7 // 0..6 candidates
      for (let r = 0; r < Math.min(k, 6); r++) cands[c * 6 + ((r * 5 + c) % 6)] = 1
    }
    const p = A.beliefOf(heads, cands)
    for (let c = 0; c < 54; c++) {
      let sum = 0
      let best = -1
      let bestLogit = -Infinity
      for (let r = 0; r < 6; r++) {
        const on = cands[c * 6 + r] === 1
        if (!on) expect(p[c * 6 + r]).toBe(0)
        else {
          expect(p[c * 6 + r]).toBeGreaterThan(0)
          sum += p[c * 6 + r]
          if (heads[A.H_BELIEF + c * 6 + r] > bestLogit) {
            bestLogit = heads[A.H_BELIEF + c * 6 + r]
            best = r
          }
        }
      }
      if (best < 0) expect(sum).toBe(0)
      else {
        expect(Math.abs(sum - 1)).toBeLessThan(1e-12)
        let arg = -1
        let bv = -Infinity
        for (let r = 0; r < 6; r++) if (cands[c * 6 + r] && p[c * 6 + r] > bv) { bv = p[c * 6 + r]; arg = r }
        expect(arg).toBe(best)
      }
    }
  })

  it('is the softmax planSet multiplies into a declare\'s confidence, bit for bit', () => {
    const net = A.makeNet({ d: 8, width: 16, depth: 1 }, A.initBlob({ d: 8, width: 16, depth: 1 }, 'athena-p1-belief-test'))
    // The opening view of a fresh deal: every open card the viewer lacks has several candidates.
    const view = seatView(newGame('athena-p1-belief-test-0', us54Config, 0), 0)
    const k = buildKnowledge(view)
    const { heads } = A.forwardView(net, view, null, k)
    const cands = A.candidateMatrix(view, k)
    const p = A.beliefOf(heads, cands)
    for (let set = 0; set < A.N_SETS; set++) {
      const plan = A.planSet(view, k, set, heads)
      if (plan.lost || plan.certain) continue
      let q = 1
      for (const ci of A.SET_CARDS[set]) {
        const c = A.CARDS[ci]
        if (k.holders[c] !== undefined) continue
        q *= p[ci * 6 + A.rel(plan.assignments[c], view.seat)]
      }
      expect(plan.p).toBe(Math.min(q, A.UNCERTAIN_CAP))
    }
  })
})

describe('scaleToMargins, exported for B-M-scaled', () => {
  it('scales rows to one and columns to the margins', () => {
    const rng = mulberry32(7)
    const n = 6
    const need = [0, 2, 1, 1, 0, 2]
    const p = new Float64Array(n * 6)
    for (let i = 0; i < n; i++) for (const s of [1, 2, 3, 5]) p[i * 6 + s] = 0.1 + rng()
    const { converged } = scaleToMargins(p, n, need)
    expect(converged).toBe(true)
    for (let i = 0; i < n; i++) {
      let row = 0
      for (let s = 0; s < 6; s++) row += p[i * 6 + s]
      expect(Math.abs(row - 1)).toBeLessThan(1e-9)
    }
    for (let s = 0; s < 6; s++) {
      let col = 0
      for (let i = 0; i < n; i++) col += p[i * 6 + s]
      expect(Math.abs(col - need[s])).toBeLessThan(1e-8)
    }
  })
})

/** An .npy member as NumPy 1.0 writes it: magic, version, a header padded to 64 bytes with a newline, the data. */
function npy(descr: string, shape: number[], data: Uint8Array): Uint8Array {
  const shapeText = shape.length === 1 ? `(${shape[0]},)` : `(${shape.join(', ')})`
  let dict = `{'descr': '${descr}', 'fortran_order': False, 'shape': ${shapeText}, }`
  const total = Math.ceil((10 + dict.length + 1) / 64) * 64
  dict = dict.padEnd(total - 10 - 1, ' ') + '\n'
  const out = new Uint8Array(total + data.length)
  out[0] = 0x93
  for (let i = 0; i < 5; i++) out[1 + i] = 'NUMPY'.charCodeAt(i)
  out[6] = 1
  out[7] = 0
  out[8] = dict.length & 0xff
  out[9] = dict.length >> 8
  for (let i = 0; i < dict.length; i++) out[10 + i] = dict.charCodeAt(i)
  out.set(data, total)
  return out
}

/** Node's fs by a computed specifier (the project has no @types/node), as stub.test.ts reads its fixture. */
interface NodeFs {
  readFileSync(path: URL, encoding: 'utf8'): string
}
const nodeModule = async <T,>(name: string): Promise<T> => (await import(/* @vite-ignore */ name)) as T
const readText = async (rel: string): Promise<string> => (await nodeModule<NodeFs>('node:fs')).readFileSync(new URL(rel, import.meta.url), 'utf8')
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0))

describe('factsFeatures: the facts row as P1\'s heads read it', () => {
  it('equals belief_data.py\'s facts_features on the fixture\'s rows', async () => {
    const fx = JSON.parse(await readText('./data/facts-features.json')) as {
      facts_f: number
      sources: { views: string; rows: number }[]
      rows: { facts: string; nz: [number, number][] }[]
    }
    expect(fx.facts_f).toBe(A.FACTS_F)
    expect(A.FACTS_F).toBe(396)
    expect(A.DEC_F_FACTS).toBe(912)
    expect(fx.rows.length).toBe(fx.sources.reduce((a, s) => a + s.rows, 0))
    const out = new Float64Array(A.DEC_F_FACTS)
    let constraintsOn = 0
    for (const row of fx.rows) {
      const facts = fromB64(row.facts)
      expect(facts.length).toBe(A.FACTS_LEN)
      out.fill(7)
      A.factsFeatures(facts, out)
      for (let i = 0; i < A.DEC_F; i++) expect(out[i]).toBe(7) // nothing before its offset is touched
      const want = new Float64Array(A.FACTS_F)
      for (const [i, v] of row.nz) want[i] = v
      for (let i = 0; i < A.FACTS_F; i++) {
        // PyTorch's side is float32: the certain counts' sixths differ in the last bits, every 0/1 is exact
        if (want[i] === 0 || want[i] === 1) expect(out[A.DEC_F + i]).toBe(want[i])
        else expect(Math.abs(out[A.DEC_F + i] - want[i])).toBeLessThan(1e-7)
      }
      for (let j = 0; j < 54; j++) constraintsOn += out[A.DEC_F + 7 * j]
    }
    expect(constraintsOn).toBeGreaterThan(fx.rows.length) // the sample is not vacuous
  })

  it('takes the tightest constraint of a (seat, set): the smallest popcount, then the smaller mask', () => {
    const facts = new Uint8Array(A.FACTS_LEN).fill(A.NONE)
    for (let b = 0; b < A.N_SETS; b++) {
      facts[A.F_SET_CERTAIN + b] = b % 4
      facts[A.F_SET_LOST + b] = b % 2
    }
    facts[A.F_SET_CERTAIN + 5] = A.NONE // set 5 resolved
    const cons: [number, number, number][] = [[1, 2, 0b000111], [1, 2, 0b011000], [1, 2, 0b100001], [2, 5, 0b000101], [4, 0, 0b000001]]
    facts[A.F_NCONS] = cons.length
    cons.forEach(([r, b, m], i) => facts.set([r, b, m], A.F_CONS + A.CONS_FIELDS * i))
    const out = new Float64Array(A.DEC_F_FACTS)
    A.factsFeatures(facts, out)
    const at = (r: number, b: number): number[] => Array.from(out.subarray(A.DEC_F + 7 * (9 * r + b), A.DEC_F + 7 * (9 * r + b) + 7))
    expect(at(1, 2)).toEqual([1, 0, 0, 0, 1, 1, 0]) // 0b011000 = 24 beats 0b100001 = 33 at popcount 2
    expect(at(2, 5)).toEqual([0, 0, 0, 0, 0, 0, 0]) // a resolved set's constraint is ignored
    expect(at(4, 0)).toEqual([1, 1, 0, 0, 0, 0, 0])
    let on = 0
    for (let j = 0; j < 54; j++) on += out[A.DEC_F + 7 * j]
    expect(on).toBe(2)
    for (let b = 0; b < A.N_SETS; b++) {
      expect(out[A.DEC_F + 378 + 2 * b]).toBe(b === 5 ? 0 : (b % 4) / 6)
      expect(out[A.DEC_F + 378 + 2 * b + 1]).toBe(b === 5 ? 0 : b % 2)
    }
    facts.set([1, 2, 0], A.F_CONS) // an empty mask is refused
    expect(() => A.factsFeatures(facts, out)).toThrow(/out of range/)
  })
})

describe('the decF = 912 net of P1\'s heads', () => {
  const ARCH: A.Arch = { d: 8, width: 16, depth: 2, decF: A.DEC_F_FACTS }

  it('widens only the trunk\'s first layer, and round-trips through a weight file', () => {
    const l516 = A.tensorLayout({ d: 8, width: 16, depth: 2 })
    const l912 = A.tensorLayout(ARCH)
    expect(l912.find((t) => t.name === 'trunk.0.weight')?.shape).toEqual([16, 8 + 912])
    expect(A.paramCount(ARCH) - A.paramCount({ d: 8, width: 16, depth: 2 })).toBe(16 * 396)
    expect(l912.map((t) => t.name)).toEqual(l516.map((t) => t.name))
    const net = A.makeNet(ARCH, A.initBlob(ARCH, 'athena-p1-912'), { test: true })
    const back = A.parseWeights(A.serializeWeights(net))
    expect(back.arch).toEqual(ARCH)
    expect(Array.from(back.blob)).toEqual(Array.from(net.blob))
    // the refusal names what it read and every format this forward supports (net.ts's module header)
    expect(() => A.makeNet({ ...ARCH, decF: 600 }, new Float32Array(0))).toThrow(/decF 600, heads 517; this forward supports v1 .*v2 .*v3 /)
  })

  it('keeps G0d\'s 516 header byte for byte: no decF in the arch, and decF 516 written after eventF', () => {
    const net = A.makeNet({ d: 8, width: 16, depth: 2 }, A.initBlob({ d: 8, width: 16, depth: 2 }, 'x'))
    expect(net.arch).toEqual({ d: 8, width: 16, depth: 2 })
    const bytes = A.serializeWeights(net)
    const hl = new DataView(bytes.buffer).getUint32(8, true)
    const header = new TextDecoder().decode(bytes.subarray(12, 12 + hl))
    expect(header).toContain('"arch":{"d":8,"width":16,"depth":2,"eventF":176,"decF":516,"heads":517}')
  })

  it('forwardView reads the facts row\'s features after the 516', () => {
    const net = A.makeNet(ARCH, A.initBlob(ARCH, 'athena-p1-912'), { test: true })
    // a view some way into a Monet v1.0 game, where the facts hold set-membership constraints
    const policy = monetPolicy('v1.0') as BotPolicy
    let s = newGame('athena-p1-belief-test-912', us54Config, 3)
    let view = seatView(s, 3)
    for (let step = 0; step < 400 && s.phase !== 'finished'; step++) {
      const { seat } = legalActionsSummary(s)
      view = seatView(s, seat)
      if (step >= 40 && buildKnowledge(view).constraints.length > 0) break
      const r = reduce(s, decide(view, policy, hashSeed(`athena-p1-912:${s.moveIndex}`)()))
      if (!r.ok) throw new Error(r.error.code)
      s = r.state
    }
    const k = buildKnowledge(view)
    expect(k.constraints.length).toBeGreaterThan(0)
    const { heads, obs } = A.forwardView(net, view, null, k)
    const facts = new Uint8Array(A.FACTS_LEN)
    A.encodeFactsRow(view, k, facts)
    const dec = new Float64Array(A.DEC_F_FACTS)
    A.decisionFeatures(obs, A.candidateMatrix(view, k), dec)
    A.factsFeatures(facts, dec)
    const rows = A.encodeEventRows(view.log, view.seat)
    const want = A.headsOf(net, A.foldAll(net, rows, rows.length / A.EVENT_LEN), dec, new Float64Array(A.HEADS))
    expect(Array.from(heads)).toEqual(Array.from(want))
  })
})

describe('the .npy reader of the stored games', () => {
  it('reads little-endian numbers and fixed-width unicode', async () => {
    // A computed specifier keeps the script out of the type check; vitest loads it as Node would.
    const url = new URL('../../scripts/athena/npz.mjs', import.meta.url).href
    const { parseNpy } = (await import(/* @vite-ignore */ url)) as {
      parseNpy: (bytes: Uint8Array) => { shape: number[]; data: ArrayLike<number> | string[] }
    }
    const u2 = new Uint16Array([162, 6725, 0, 65535])
    const a = parseNpy(npy('<u2', [2, 2], new Uint8Array(u2.buffer)))
    expect(a.shape).toEqual([2, 2])
    expect(Array.from(a.data as Uint16Array)).toEqual([162, 6725, 0, 65535])
    const seeds = ['athena-p1-belief-test-0', 'x']
    const w = 23
    const bytes = new Uint8Array(seeds.length * w * 4)
    seeds.forEach((s, i) => { for (let j = 0; j < s.length; j++) bytes[(i * w + j) * 4] = s.charCodeAt(j) })
    const u = parseNpy(npy(`<U${w}`, [2], bytes))
    expect(u.data).toEqual(seeds)
    expect(() => parseNpy(npy('>f8', [1], new Uint8Array(8)))).toThrow(/not supported/)
  })
})
