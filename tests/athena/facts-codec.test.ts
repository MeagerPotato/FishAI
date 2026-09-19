/**
 * ATHENA P1, G1a and G1b (ATHENA.md §8.1, §8.2): the reference side's codec (`scripts/athena/facts-codec.ts`) and the
 * encoder's P1 additions (`lib/athena/encode.ts`: the regime bit, the start-seat rule, the facts row).
 *
 * - The facts options are Monet v1.0's without the marginal, and resolve to `factsOf`'s.
 * - The canonical encoding compares the constraints as a set.
 * - The reduced reveal publishes a right declare whole and a wrong one only where a hit had located a card.
 * - Two cross-language vectors: mixed-stub games' facts, home and bridge, digested; `athena-env/src/facts.rs` pins the
 *   same digests from the Rust port (`the_cross_language_vectors`). The full gates are `facts-check` over the corpus.
 * - The start-seat rule and the facts row in the encoder.
 */
import { describe, expect, it } from 'vitest'
import * as A from '../../lib/athena/index.ts'
import { newGame, reduce, us54Config } from '../../lib/engine/reduce.ts'
import { legalActionsSummary } from '../../lib/engine/helpers.ts'
import type { Knowledge } from '../../lib/engine/bots/types.ts'
import type { Card, GameState, PublicEvent, Seat } from '../../lib/engine/types.ts'
import { seatView } from '../../lib/engine/views.ts'
import { mixedStubAction, mixedStubRng } from '../../scripts/athena/mixed-stub.ts'
import { ByteDigest } from '../../scripts/athena/replay-codec.ts'
import { KOPTS, ReducedReveal, constraintSet, encodeFacts, factsOfView, koptsAreFactsOfs } from '../../scripts/athena/facts-codec.ts'

/** Play a mixed-stub game, calling `visit` before every step with the state, the acting seat and the reduced reveal. */
function play(seed: string, visit: (s: GameState, seat: Seat, red: ReducedReveal) => void): { s: GameState; red: ReducedReveal } {
  let s = newGame(seed, us54Config, 0)
  const rng = mixedStubRng(seed)
  const red = new ReducedReveal()
  for (const e of s.log) red.push(e)
  while (s.phase !== 'finished') {
    const seat = legalActionsSummary(s).seat
    visit(s, seat, red)
    const r = reduce(s, mixedStubAction(s, seat, rng))
    if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
    for (const e of r.events) red.push(e)
    s = r.state
  }
  return { s, red }
}

describe('the facts codec', () => {
  it("uses Monet v1.0's knowledge options without the marginal, which are factsOf's", () => {
    expect(KOPTS).toEqual({ logWindow: undefined, useConstraints: true, marginal: false })
    expect(koptsAreFactsOfs()).toBe(true)
  })

  it('compares the constraints as a set', () => {
    const k: Knowledge = {
      seat: 2,
      counts: [9, 9, 9, 9, 9, 9],
      holders: {},
      cands: {},
      gone: [],
      unknownSlots: [9, 9, 9, 9, 9, 9],
      constraints: [
        { seat: 3, cards: ['3C', '2C'] as Card[] },
        { seat: 1, cards: ['XR', '8S'] as Card[] },
        { seat: 3, cards: ['2C', '3C'] as Card[] },
      ],
    }
    expect(constraintSet(k)).toEqual([
      [1, 8, 0b011000],
      [3, 0, 0b000011],
    ])
    const bytes = encodeFacts(k)
    expect(bytes.length).toBe(131 + 3 * 2)
    expect([bytes[129], bytes[130]]).toEqual([2, 0])
  })

  it('reveals a right declare whole and a wrong one only where a hit had located a card', () => {
    let wrong = 0
    let hidden = 0
    for (let g = 0; g < 12; g++) {
      const { s, red } = play(`athena-p1-reveal-${g}`, () => {})
      const hits = new Map<Card, Seat>()
      s.log.forEach((e, i) => {
        const p = red.log[i]
        if (e.type === 'ask' && e.hit) hits.set(e.card, e.asker)
        if (e.type !== 'claim' || p.type !== 'claim') {
          expect(p).toEqual(e)
          return
        }
        const right = e.outcome === `team${e.claimer % 2}`
        for (const c of Object.keys(e.actualHolders) as Card[]) {
          if (right || hits.has(c)) expect(p.actualHolders[c]).toBe(e.actualHolders[c])
          else {
            expect(p.actualHolders[c]).toBeUndefined()
            hidden++
          }
          hits.delete(c)
        }
        if (!right) wrong++
      })
      expect(red.hiddenHolders).toBe([...red.log].filter((e): e is Extract<PublicEvent, { type: 'claim' }> => e.type === 'claim').reduce((n, e) => n + 6 - Object.keys(e.actualHolders).length, 0))
    }
    expect(wrong).toBeGreaterThan(10)
    expect(hidden).toBeGreaterThan(10)
  })

  it('reproduces the cross-language vectors (pinned in athena-env/src/facts.rs too)', () => {
    const want: Record<string, [number, string, string]> = {
      'athena-p1-facts-vector-0': [544, '87ef9b65f434595b', '5cb37f1c5156f084'],
      'athena-p1-facts-vector-1': [529, '95573bb8b1ec8ebc', 'd036ab39819c92cc'],
    }
    for (const [seed, [steps, homeHex, bridgeHex]] of Object.entries(want)) {
      const home = new ByteDigest()
      const bridge = new ByteDigest()
      let n = 0
      play(seed, (s, seat, red) => {
        for (let x = 0; x < 6; x++) home.push(encodeFacts(factsOfView(seatView(s, x as Seat))))
        bridge.push(encodeFacts(factsOfView(red.view(s, seat))))
        n++
      })
      expect([n, home.hex(), bridge.hex()]).toEqual([steps, homeHex, bridgeHex])
    }
  })
})

describe("the encoder's P1 additions", () => {
  it('withholds game_started until the first event, then names its actor', () => {
    const started: PublicEvent = { type: 'game_started', startingSeat: 0 }
    expect(A.encodeEventRows([started], 0).length).toBe(0)
    const claim: PublicEvent = {
      type: 'claim',
      claimer: 3,
      book: A.SETS[0],
      assignments: {} as Record<Card, Seat>,
      actualHolders: {} as Record<Card, Seat>,
      outcome: 'team0',
    }
    const rows = A.encodeEventRows([started, claim], 1)
    expect(rows.length).toBe(2 * A.EVENT_LEN)
    expect([rows[A.E_TYPE], rows[A.E_ACTOR]]).toEqual([0, 2])
    expect(A.eventActor(claim)).toBe(3)
  })

  it('writes the regime bit, and the facts row from the facts', () => {
    expect([A.O_REGIME, A.OBS_LEN, A.FACTS_LEN, A.MAX_CONS]).toEqual([94, 95, 278, 64])
    const obs = new Uint8Array(A.OBS_LEN)
    const legal = new Uint8Array(A.LEGAL_LEN)
    const row = new Uint8Array(A.FACTS_LEN)
    play('athena-p1-encoder-0', (s, seat) => {
      const v = seatView(s, seat)
      A.encodeObservation(v, obs, legal, A.REGIME_BRIDGE)
      expect(obs[A.O_REGIME]).toBe(A.REGIME_BRIDGE)
      const k = A.factsOf(v)
      A.encodeFactsRow(v, k, row)
      for (let ci = 0; ci < A.N_CARDS; ci++) {
        const h = k.holders[A.CARDS[ci]]
        if (h !== undefined) expect(row[A.F_CAND + ci]).toBe(1 << A.rel(h, seat))
      }
      const plan = A.railPlan(v, k)
      expect(row[A.F_RAIL]).toBe(plan ? plan.set : A.NONE)
    })
  })
})
