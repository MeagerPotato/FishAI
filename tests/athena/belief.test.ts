/**
 * ATHENA P1 (ATHENA.md §8.3's pin arm, §8.4's H sampler): `lib/athena/belief.ts`, the belief head laid over Monet's
 * marginal table.
 *
 * Pinned, over sampled positions of Monet v1.0 games with a tiny member of the family (d 8, width 16):
 * - `headHolder` is the belief block's softmax over the card's rule candidates (against `Math.exp` to 1e-12), zero off
 *   them, summing to 1;
 * - `patchTableWithHead` writes exactly those rows into `marginalFor(k)`'s table, in place, with the same bits through
 *   a seat's incremental fold as through a refold from zero, and changes the table;
 * - a `Knowledge` built without the marginal is refused (false) and left alone;
 * - `sampleDeal` over a patched table still draws deals that meet the counts, the candidates and the constraints.
 */
import { describe, expect, it } from 'vitest'
import * as A from '../../lib/athena/index.ts'
import { headHolder, patchTableWithHead } from '../../lib/athena/belief.ts'
import { buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import { marginalFor } from '../../lib/engine/bots/marginal.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { decide } from '../../lib/engine/bots/index.ts'
import { sampleDeal } from '../../lib/engine/bots/determinize.ts'
import type { BotPolicy } from '../../lib/engine/bots/style.ts'
import { hashSeed, mulberry32 } from '../../lib/engine/rng.ts'
import { legalActionsSummary, newGame, reduce, us54Config } from '../../lib/engine/index.ts'
import type { GameState, Seat } from '../../lib/engine/types.ts'
import { seatView } from '../../lib/engine/views.ts'

const TINY: A.Arch = { d: 8, width: 16, depth: 2 }
const NET = A.makeNet(TINY, A.initBlob(TINY, 'athena-p1-belief-test'), { test: true })
const V10 = monetPolicy('v1.0') as BotPolicy
const KOPTS = { logWindow: V10.skill.logWindow, useConstraints: V10.skill.useConstraints, marginal: true }

function positions(seed: string, every = 5): GameState[] {
  const out: GameState[] = []
  let s = newGame(seed, us54Config, 0)
  let steps = 0
  while (s.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(s)
    if (steps % every === 0) out.push(s)
    const r = reduce(s, decide(seatView(s, seat), V10, hashSeed(`${seed}:${s.moveIndex}`)()))
    if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code}`)
    s = r.state
    steps++
  }
  return out
}

const POS = ['belief-a', 'belief-b'].flatMap((seed) => positions(seed))

describe('headHolder', () => {
  it("is the belief block's softmax over the rule candidates", () => {
    let n = 0
    for (const s of POS.slice(0, 40)) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const k = buildKnowledge(view, KOPTS)
      const { heads } = A.forwardView(NET, view, null, k)
      for (const [c, cs] of Object.entries(k.cands)) {
        if (!cs || cs.length < 2) continue
        const out = headHolder(heads, seat, c as never, cs, new Float64Array(6))
        const logits = cs.map((x) => heads[A.H_BELIEF + A.cardIndex(c as never) * 6 + A.rel(x, seat)])
        const m = Math.max(...logits)
        const z = logits.reduce((acc, l) => acc + Math.exp(l - m), 0)
        cs.forEach((x, i) => expect(Math.abs(out[x] - Math.exp(logits[i] - m) / z)).toBeLessThan(1e-12))
        for (let x = 0; x < 6; x++) if (!cs.includes(x as Seat)) expect(out[x]).toBe(0)
        expect(Math.abs(out.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-12)
        n++
      }
    }
    expect(n).toBeGreaterThan(200)
  })
})

describe('patchTableWithHead', () => {
  it("writes the head's rows into the marginal table, the same bits cached or refolded, and changes it", () => {
    const caches = [0, 1, 2, 3, 4, 5].map(() => new A.SeatForward(NET))
    let patched = 0
    let changed = 0
    for (const s of POS) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const k1 = buildKnowledge(view, KOPTS)
      const k2 = buildKnowledge(view, KOPTS)
      const before = marginalFor(k1)
      const plain = before ? Float64Array.from(before.p) : null
      const ok1 = patchTableWithHead(NET, view, k1, caches[seat])
      const ok2 = patchTableWithHead(NET, view, k2, null)
      expect(ok1).toBe(before !== null && before !== undefined)
      expect(ok2).toBe(ok1)
      if (!ok1) continue
      const t1 = marginalFor(k1)
      const t2 = marginalFor(k2)
      if (!t1 || !t2) throw new Error('unreachable')
      expect(Array.from(t1.p)).toEqual(Array.from(t2.p))
      const { heads } = A.forwardView(NET, view, null, k1)
      const row = new Float64Array(6)
      for (let i = 0; i < t1.cards.length; i++) {
        headHolder(heads, seat, t1.cards[i], k1.cands[t1.cards[i]] ?? [], row)
        for (let x = 0; x < 6; x++) expect(t1.p[i * 6 + x]).toBe(row[x])
      }
      if (plain && t1.cards.length > 0 && !plain.every((v, i) => v === t1.p[i])) changed++
      patched++
    }
    expect(patched).toBeGreaterThan(100)
    expect(changed).toBeGreaterThan(patched / 2)
  })

  it('refuses a Knowledge built without the marginal', () => {
    const s = POS[10]
    const { seat } = legalActionsSummary(s)
    const k = buildKnowledge(seatView(s, seat))
    expect(marginalFor(k)).toBeUndefined()
    expect(patchTableWithHead(NET, seatView(s, seat), k)).toBe(false)
  })

  it('leaves sampleDeal drawing deals that meet the counts, the candidates and the constraints', () => {
    let drawn = 0
    for (const s of POS.filter((_, i) => i % 3 === 0)) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const k = buildKnowledge(view, KOPTS)
      if (!patchTableWithHead(NET, view, k)) continue
      const hands = sampleDeal(view, k, mulberry32(hashSeed(`belief-sample:${s.moveIndex}`)()))
      if (hands === null) continue
      drawn++
      for (let x = 0; x < 6; x++) expect(hands[x].length).toBe(view.counts[x])
      for (let x = 0; x < 6; x++) for (const c of hands[x]) expect(k.cands[c]).toContain(x)
      for (const q of k.constraints) expect(q.cards.some((c) => hands[q.seat].includes(c))).toBe(true)
    }
    expect(drawn).toBeGreaterThan(30)
  })
})
