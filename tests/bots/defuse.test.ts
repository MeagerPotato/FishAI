/**
 * The CONCESSION.md concession layer: threat.ts (what a seat could do with a turn) and defuse.ts
 * (the ask-side credit for taking the card that gives it reach).
 *
 * The behavioural anchor is the project owner's own worked example — one seat holding five cards
 * of a half-suit while an opponent holds the sixth — which is the position the whole mechanism
 * was requested for.
 *
 * What this file pins is the arithmetic, the gates and the compatibility guarantees. The term's
 * *direction* — that the credit is a credit, and that switching it on moves `decide`'s choice onto
 * the ask into the target's published basis rather than away from it — is pinned separately in
 * [concession-direction.test.ts](concession-direction.test.ts), which also records which of the
 * three possible sign errors this file does and does not catch.
 */
import { describe, expect, it } from 'vitest'
import { us54Config } from '../../lib/engine/index.ts'
import type { Card, PublicEvent, Seat } from '../../lib/engine/index.ts'
import { buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import { decide } from '../../lib/engine/bots/decide.ts'
import { STYLE_PRESETS, validateStyle } from '../../lib/engine/bots/style.ts'
import { STYLE_IDS, STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import {
  THREAT_COEFFICIENTS,
  preyInBook,
  seatLicences,
  seatThreat,
  turnYield,
} from '../../lib/engine/bots/threat.ts'
import { defusalActive, defusalBonus, logLicences } from '../../lib/engine/bots/defuse.ts'
import { ask, collectBotViews, gs, mkView } from './util.ts'

/**
 * The owner's five-and-one position, built from public events alone.
 *
 * Seat 0 (team 0) holds 2H and 3H. Teammate seat 2 has taken 4H, 5H and 6H off seat 1 on public
 * hits, so this team certainly accounts for five of LOW-H. Seat 1 asked for 2H and missed, which
 * under RULES_US54.md row 6 publishes that it holds at least one card of LOW-H — and the only one
 * left is 7H. Taking 7H off seat 1 both wins the set and removes seat 1's reach into it.
 */
const FILLER: Card[] = ['9S', 'TS', 'JS', 'QS', 'KS', 'AS', '2C']

/**
 * Building this fixture is itself instructive, and the first two attempts failed for the same
 * reason. Every ask publishes a deal-time basis (row 6), and `buildKnowledge` propagates those
 * constraints to a fixpoint — so once enough of a set is pinned, the location of the rest is
 * *forced*. An earlier draft had seat 2 win 4H/5H/6H off seat 1 directly; seat 2's own basis
 * could then only have been 7H, and the engine placed 7H on seat 2, making the set contained
 * rather than split.
 *
 * The order below explains seat 2's basis with 5H instead. Seat 2 wins 4H and 6H while still
 * holding 5H; seat 1 then takes 5H, which *proves* 5H was dealt to seat 2 and discharges the
 * constraint; seat 2 wins it straight back. Seat 1's own basis is discharged by the 4H and 6H it
 * was dealt.
 *
 * The result is the owner's position exactly — five of LOW-H on team 0, the sixth with an
 * opponent — and it is worth recording what this engine then does with it: `buildKnowledge`
 * deduces `7H` at seat 1 **outright**, by elimination over the whole set. The five-and-one is not
 * a position the inference layer struggles with. What it lacked was any notion of what to *do*
 * about it, which is what this file adds.
 */
const LOG: PublicEvent[] = [
  gs,
  ask(2, 1, '4H', true),
  ask(2, 1, '6H', true),
  ask(1, 2, '5H', true),
  ask(2, 1, '5H', true),
  // Seat 1 asks seat 2 for a card seat 0 is holding: a miss, and a published LOW-H basis.
  ask(1, 2, '2H', false),
  // An unrelated ask so the turn-yield denominator is not degenerate.
  ask(3, 0, '9C', false),
]

function fiveAndOne() {
  return mkView({
    seat: 0,
    hand: ['2H', '3H', ...FILLER],
    counts: [9, 7, 11, 9, 9, 9],
    log: LOG,
    turn: 0,
    config: us54Config,
  })
}

describe('threat.ts — what a seat could do with a turn', () => {
  it('reads a row-6 licence off the public log, not off the retired constraint', () => {
    const view = fiveAndOne()
    // Seat 1's only ask was into LOW-H.
    expect([...seatLicences(view, buildKnowledge(view, { useConstraints: true }), 1)]).toEqual(['LOW-H'])
    // Seat 2 asked into LOW-H three times; the set is unresolved, so the licence stands.
    expect([...seatLicences(view, buildKnowledge(view, { useConstraints: true }), 2)]).toEqual(['LOW-H'])
    // Seat 3 asked into HIGH-C.
    expect([...seatLicences(view, buildKnowledge(view, { useConstraints: true }), 3)]).toEqual(['HIGH-C'])
    // Seats that never asked have published nothing.
    expect([...seatLicences(view, buildKnowledge(view, { useConstraints: true }), 4)]).toEqual([])
    expect([...seatLicences(view, buildKnowledge(view, { useConstraints: true }), 5)]).toEqual([])
  })

  it('drops a licence once the set is resolved — nothing can be taken from a banked set', () => {
    const view = mkView({
      seat: 0,
      hand: ['2H', '3H', ...FILLER],
      counts: [9, 7, 11, 9, 9, 9],
      log: LOG,
      config: us54Config,
      books: {
        'LOW-H': {
          book: 'LOW-H',
          outcome: 'team0',
          claimer: 0,
          assignments: {} as Record<Card, Seat>,
          actualHolders: {} as Record<Card, Seat>,
        },
      },
    })
    expect([...seatLicences(view, buildKnowledge(view, { useConstraints: true }), 1)]).toEqual([])
  })

  it('counts as prey only the cards certainly located on the viewer own team', () => {
    const view = fiveAndOne()
    const k = buildKnowledge(view, { useConstraints: true })
    // 2H and 3H in hand, plus 4H/5H/6H proven at seat 2 = five. 7H is not located.
    expect(preyInBook(view, k, 'LOW-H')).toBe(5)
    // A set nobody has touched exposes nothing.
    expect(preyInBook(view, k, 'LOW-D')).toBe(0)
  })

  it('prices the threat on the fitted coefficients, and exposes its evidence', () => {
    const view = fiveAndOne()
    const k = buildKnowledge(view, { useConstraints: true })
    const t = seatThreat(view, k, 1)
    expect(t.seat).toBe(1)
    expect(t.licences).toEqual(['LOW-H'])
    expect(t.prey).toBe(5)
    expect(t.cards).toBeCloseTo(
      THREAT_COEFFICIENTS.base + THREAT_COEFFICIENTS.perPrey * 5,
      12,
    )
    // A seat with no published reach is priced at the base alone, never at zero: a turn is
    // always worth something.
    expect(seatThreat(view, k, 5).cards).toBeCloseTo(THREAT_COEFFICIENTS.base, 12)
  })

  it('turnYield reproduces contained.ts hits-over-misses derivation of a turn', () => {
    const view = fiveAndOne()
    let hits = 0
    let misses = 0
    for (const ev of view.log) {
      if (ev.type !== 'ask') continue
      if (ev.hit) hits++
      else misses++
    }
    expect(turnYield(view)).toBe(hits / Math.max(1, misses))
    // Degenerate log: no asks at all must not divide by zero.
    expect(turnYield(mkView({ seat: 0, hand: ['2H'], counts: [1, 1, 1, 1, 1, 1], log: [gs], config: us54Config }))).toBe(0)
  })
})

describe('defuse.ts — the concession credit', () => {
  it('is off for every shipped tier and under pagat48', () => {
    const us54 = fiveAndOne()
    for (const tier of ['easy', 'medium', 'hard'] as const) {
      expect(STYLE_PRESETS[tier].defuse).toBe(0)
      expect(defusalActive(us54, STYLE_PRESETS[tier])).toBe(false)
    }
    // The roster carries the measured appetite, but the 48-card rule set refuses it anyway.
    const pagat = mkView({ seat: 0, hand: ['2H', '3H'], counts: [2, 8, 8, 8, 8, 8], log: [gs] })
    expect(STYLE_ROSTER.balanced.defuse).toBeGreaterThan(0)
    expect(defusalActive(pagat, STYLE_ROSTER.balanced)).toBe(false)
    expect(defusalActive(us54, STYLE_ROSTER.balanced)).toBe(true)
  })

  it('credits the ask that takes back the card giving an opponent its reach', () => {
    const view = fiveAndOne()
    const k = buildKnowledge(view, { useConstraints: true })
    const style = STYLE_ROSTER.balanced
    const E = turnYield(view)
    const seven = { target: 1 as Seat, card: '7H' as Card, score: 0, p: 0.5, reason: '' }
    const bonus = defusalBonus(view, k, style, seven, 0.5, E, logLicences(view, k))
    // defuse * wHit * p * perPrey * prey / (1 + E)
    expect(bonus).toBeCloseTo(
      (style.defuse * style.wHit * 0.5 * THREAT_COEFFICIENTS.perPrey * 5) / (1 + E),
      12,
    )
    expect(bonus).toBeGreaterThan(0)
  })

  it('credits nothing where the confound is absent or the ask protects nothing', () => {
    const view = fiveAndOne()
    const k = buildKnowledge(view, { useConstraints: true })
    const style = STYLE_ROSTER.balanced
    const E = turnYield(view)
    const mk = (target: Seat, card: Card) => ({ target, card, score: 0, p: 0.5, reason: '' })

    // Seat 5 has published no basis in LOW-H, so taking a card off it removes no reach.
    expect(defusalBonus(view, k, style, mk(5, '7H'), 0.5, E, logLicences(view, k))).toBe(0)
    // Seat 3's only basis is in HIGH-C, of which this team holds nothing located.
    expect(defusalBonus(view, k, style, mk(3, '9C'), 0.5, E, logLicences(view, k))).toBe(0)
    // A hit that cannot happen protects nothing: the credit is weighted by p and vanishes at 0.
    expect(defusalBonus(view, k, style, mk(1, '7H'), 0, E, logLicences(view, k))).toBe(0)
    // And an appetite of 0 switches the whole term off.
    expect(defusalBonus(view, k, { ...style, defuse: 0 }, mk(1, '7H'), 0.5, E, logLicences(view, k))).toBe(0)
  })

  it('scales linearly in the appetite, so the knob means what its doc comment says', () => {
    const view = fiveAndOne()
    const k = buildKnowledge(view, { useConstraints: true })
    const E = turnYield(view)
    const one = { target: 1 as Seat, card: '7H' as Card, score: 0, p: 0.5, reason: '' }
    const at = (defuse: number) => defusalBonus(view, k, { ...STYLE_ROSTER.balanced, defuse }, one, 0.5, E, logLicences(view, k))
    expect(at(2)).toBeCloseTo(2 * at(1), 12)
    expect(at(0.5)).toBeCloseTo(0.5 * at(1), 12)
  })
})

describe('the roster and the style vector', () => {
  it('every roster style carries the measured appetite and still validates', () => {
    for (const id of STYLE_IDS) {
      expect(STYLE_ROSTER[id].defuse).toBe(1)
      expect(validateStyle(STYLE_ROSTER[id])).toEqual([])
    }
  })

  it('refuses a negative appetite — that is the avoidance rule, which was measured losing', () => {
    expect(validateStyle({ ...STYLE_ROSTER.balanced, defuse: -1 })).toContain('defuse -1 < 0')
  })
})

describe('compatibility', () => {
  it('the rule-set gate alone holds pagat48 unchanged, even at a style that wants the mechanism', () => {
    // Two independent guards protect the 48-card game: every tier carries `defuse: 0`, and
    // `defusalActive` refuses `pagat48` outright. This pins the second one on its own, by running
    // a roster style that DOES carry the appetite against the same style with it switched off.
    let n = 0
    for (const { view, seed } of collectBotViews(6)) {
      const on = decide(view, STYLE_ROSTER.balanced, seed)
      const off = decide(view, { ...STYLE_ROSTER.balanced, defuse: 0 }, seed)
      expect(on).toEqual(off)
      n++
    }
    expect(n).toBeGreaterThan(0)
  })

  it('changes at least one us54 decision for the roster — a knob that never fires is not a knob', () => {
    let changed = 0
    for (const { view, seed } of collectBotViews(8, us54Config)) {
      const on = decide(view, STYLE_ROSTER.balanced, seed)
      const off = decide(view, { ...STYLE_ROSTER.balanced, defuse: 0 }, seed)
      if (JSON.stringify(on) !== JSON.stringify(off)) changed++
    }
    expect(changed).toBeGreaterThan(0)
  })
})
