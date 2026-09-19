/**
 * ATHENA P1 (ATHENA.md §8.3): the belief head's JavaScript side.
 *
 * - **`beliefOf`** (net.ts): each card's softmax over exactly its candidate relative seats, zero elsewhere, all zero
 *   for a card with no candidate; the argmax is the highest candidate logit; and on a real network it is the same
 *   softmax `planSet` multiplies into a declare's confidence, bit for bit.
 * - **`scaleToMargins`** (marginal.ts), exported for B-M-scaled: rows sum to 1 and columns to the margins on exit.
 * - **The `.npy` reader** (`scripts/athena/npz.mjs`, which reads the stored games): numeric and fixed-width unicode
 *   members, built here byte by byte as NumPy writes them.
 */
import { describe, expect, it } from 'vitest'
import * as A from '../../lib/athena/index.ts'
import { scaleToMargins } from '../../lib/engine/bots/marginal.ts'
import { buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import { mulberry32 } from '../../lib/engine/rng.ts'
import { newGame, us54Config } from '../../lib/engine/reduce.ts'
import { seatView } from '../../lib/engine/views.ts'

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
