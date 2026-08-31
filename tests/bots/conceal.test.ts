/**
 * conceal.ts — the broadcast half of the concession layer: the charge an ask carries for the
 * RULES_US54.md row-6 basis it publishes about the ASKER.
 *
 * The anchor positions are the owner's own two cases: *"hold the card until you locate who has all
 * of the other cards in the half-suit"* (the release condition, §5 below) and *"unless your team
 * holds the entire half-suit, then you want to signal"* (the containment exception, §4).
 */
import { describe, expect, it } from 'vitest'
import { allBooks, bookCards, us54Config } from '../../lib/engine/index.ts'
import type { Card, Knowledge, PublicEvent, Seat } from '../../lib/engine/index.ts'
import { buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import { decide } from '../../lib/engine/bots/decide.ts'
import { STYLE_PRESETS, validateStyle } from '../../lib/engine/bots/style.ts'
import { STYLE_IDS, STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { containedBooks } from '../../lib/engine/bots/contained.ts'
import { THREAT_COEFFICIENTS, preyInBook, turnYield } from '../../lib/engine/bots/threat.ts'
import { defusalBonus, logLicences } from '../../lib/engine/bots/defuse.ts'
import {
  bookContainedOnOwnTeam,
  concealAppetite,
  concealmentActive,
  concealmentPenalty,
  ownCardsInBook,
  unlocatedInBook,
} from '../../lib/engine/bots/conceal.ts'
import { ask, collectBotViews, gs, mkView } from './util.ts'

const FILLER: Card[] = ['9S', 'TS', 'JS', 'QS', 'KS', 'AS', '2C']

/**
 * The arbitration position: seat 0 (team 0) holds 2H and 3H of LOW-H and has published **nothing**
 * about them, while seat 1 (an opponent) has published a LOW-H basis of its own by asking seat 2
 * for 5H and missing (row 6). Teammate seat 2 won 4H off seat 1 on a public hit, so this team can
 * certainly account for three of LOW-H while only two of them are hidden in this hand.
 *
 * That gap is the whole point of the fixture: `prey = 3` is what a defusal protects, `mine = 2` is
 * what a publication exposes, and the two mechanisms therefore split this position at
 * `p = mine / prey = 2/3`. 5H, 6H and 7H are all still unlocated, so neither the containment
 * exception nor the release condition fires and both terms are genuinely live.
 */
const SPLIT_LOG: PublicEvent[] = [
  gs,
  ask(2, 1, '4H', true),
  ask(1, 2, '5H', false),
  // An unrelated ask so the turn-yield denominator is not degenerate.
  ask(3, 0, '9C', false),
]

function splitPosition() {
  return mkView({
    seat: 0,
    hand: ['2H', '3H', ...FILLER],
    counts: [9, 8, 10, 9, 9, 9],
    log: SPLIT_LOG,
    turn: 0,
    config: us54Config,
  })
}

const mkAsk = (target: Seat, card: Card, p = 0.5) => ({ target, card, score: 0, p, reason: '' })

describe('conceal.ts — the broadcast charge', () => {
  it('is off for every shipped tier, off for every roster style, and off under pagat48', () => {
    const view = splitPosition()
    for (const tier of ['easy', 'medium', 'hard'] as const) {
      expect(STYLE_PRESETS[tier].conceal).toBe(0)
      expect(concealmentActive(view, STYLE_PRESETS[tier])).toBe(false)
    }
    // The roster carries no field at all — the mechanism ships switched off everywhere, which is
    // what keeps every committed measurement in the repository meaningful.
    for (const id of STYLE_IDS) {
      expect(STYLE_ROSTER[id].conceal).toBeUndefined()
      expect(concealAppetite(STYLE_ROSTER[id])).toBe(0)
      expect(concealmentActive(view, STYLE_ROSTER[id])).toBe(false)
    }
    // And the compatibility gate refuses the 48-card rule set even at a style that wants it.
    const pagat = mkView({ seat: 0, hand: ['2H', '3H'], counts: [2, 8, 8, 8, 8, 8], log: [gs] })
    const wants = { ...STYLE_ROSTER.balanced, conceal: 1 }
    expect(concealmentActive(pagat, wants)).toBe(false)
    expect(concealmentActive(view, wants)).toBe(true)
  })

  it('charges the first ask into a set on the derived formula', () => {
    const view = splitPosition()
    const k = buildKnowledge(view, { useConstraints: true })
    const style = { ...STYLE_ROSTER.balanced, conceal: 1 }
    const E = turnYield(view)
    const lic = logLicences(view, k)
    // Two cards of LOW-H in hand, and none of them publicly placed: a card can only become
    // publicly located at this seat by a hit, and a hit into LOW-H needs an ask into LOW-H.
    expect(ownCardsInBook(view, 'LOW-H')).toBe(2)
    const charge = concealmentPenalty(view, k, style, mkAsk(1, '7H'), E, lic)
    // conceal * wHit * perPrey * mine / (1 + E)
    expect(charge).toBeCloseTo((1 * style.wHit * THREAT_COEFFICIENTS.perPrey * 2) / (1 + E), 12)
    expect(charge).toBeGreaterThan(0)
    // Charged on BOTH branches, unlike the defusal credit: the publication happens whether the ask
    // hits or misses (row 17), so the charge carries no `p` factor and a hopeless ask leaks just
    // as much as a certain one.
    expect(concealmentPenalty(view, k, style, mkAsk(1, '7H', 0), E, lic)).toBe(charge)
    expect(concealmentPenalty(view, k, style, mkAsk(1, '7H', 1), E, lic)).toBe(charge)
  })

  it('scales linearly in the appetite, so the knob means what its doc comment says', () => {
    const view = splitPosition()
    const k = buildKnowledge(view, { useConstraints: true })
    const E = turnYield(view)
    const lic = logLicences(view, k)
    const at = (conceal: number) =>
      concealmentPenalty(view, k, { ...STYLE_ROSTER.balanced, conceal }, mkAsk(1, '7H'), E, lic)
    expect(at(0)).toBe(0)
    expect(at(2)).toBeCloseTo(2 * at(1), 12)
    expect(at(0.5)).toBeCloseTo(0.5 * at(1), 12)
  })

  it('stops charging once the basis is public — the cost is paid at most once per set', () => {
    const view = mkView({
      seat: 0,
      hand: ['2H', '3H', ...FILLER],
      counts: [9, 8, 10, 9, 9, 9],
      // The same position, except this seat has already asked into LOW-H and missed. The second
      // ask publishes nothing the first did not.
      log: [...SPLIT_LOG, ask(0, 1, '6H', false)],
      turn: 0,
      config: us54Config,
    })
    const k = buildKnowledge(view, { useConstraints: true })
    const style = { ...STYLE_ROSTER.balanced, conceal: 1 }
    const lic = logLicences(view, k)
    expect(lic(0).has('LOW-H')).toBe(true)
    expect(concealmentPenalty(view, k, style, mkAsk(1, '7H'), turnYield(view), lic)).toBe(0)
    // A set this seat has NOT asked into is still charged, so the gate is per set and not global.
    // (LOW-C, of which this hand holds only 2C — the spade filler is a whole set in hand and is
    // refused by the containment gate instead.)
    expect(
      concealmentPenalty(view, k, style, mkAsk(1, '3C'), turnYield(view), lic),
    ).toBeGreaterThan(0)
  })

  it('charges nothing once every card of the set is located — the owner release condition', () => {
    // The owner's five-and-one, built exactly as tests/bots/defuse.test.ts builds it. This engine
    // deduces the sixth card outright, so the set is fully located and the information race over
    // it is finished: there is nothing left to conceal and the ask that converts it is not delayed.
    const view = mkView({
      seat: 0,
      hand: ['2H', '3H', ...FILLER],
      counts: [9, 7, 11, 9, 9, 9],
      log: [
        gs,
        ask(2, 1, '4H', true),
        ask(2, 1, '6H', true),
        ask(1, 2, '5H', true),
        ask(2, 1, '5H', true),
        ask(1, 2, '2H', false),
        ask(3, 0, '9C', false),
      ],
      turn: 0,
      config: us54Config,
    })
    const k = buildKnowledge(view, { useConstraints: true })
    const style = { ...STYLE_ROSTER.balanced, conceal: 1 }
    expect(unlocatedInBook(view, k, 'LOW-H')).toBe(0)
    expect(preyInBook(view, k, 'LOW-H')).toBe(5)
    expect(concealmentPenalty(view, k, style, mkAsk(1, '7H'), turnYield(view), logLicences(view, k))).toBe(0)
  })

  it('charges nothing for a set contained on this team — the owner signal exception (C1)', () => {
    const view = splitPosition()
    const real = buildKnowledge(view, { useConstraints: true })
    expect(bookContainedOnOwnTeam(view, real, 'LOW-H')).toBe(false)
    // A contained book whose holders are still ambiguous *within* this team is reachable in play
    // (count exhaustion produces it) but not in a six-event fabricated log, so the predicate is
    // exercised here against a Knowledge value built directly. `Knowledge` is a plain serializable
    // record queried only through pure functions, which is exactly what makes that legitimate.
    const contained: Knowledge = {
      ...real,
      cands: {
        ...real.cands,
        // Seats 0, 2 and 4 are team 0. Every card of LOW-H sits somewhere among them, and two of
        // them are not pinned to a seat: contained (C1) without being located.
        '2H': [0],
        '3H': [0],
        '4H': [2],
        '5H': [2, 4],
        '6H': [2, 4],
        '7H': [4],
      },
    }
    expect(bookContainedOnOwnTeam(view, contained, 'LOW-H')).toBe(true)
    expect(unlocatedInBook(view, contained, 'LOW-H')).toBeGreaterThan(0)
    const style = { ...STYLE_ROSTER.balanced, conceal: 1 }
    expect(
      concealmentPenalty(view, contained, style, mkAsk(1, '7H'), turnYield(view), logLicences(view, contained)),
    ).toBe(0)
  })

  it('agrees with contained.ts on every book a legal ask could name', () => {
    // The predicate is written out in conceal.ts rather than imported, so that the concealment
    // layer keeps no dependency on the containment policy — the same discipline threat.ts applies
    // to its duplicate of `E`. This is the test that pins the two equal, dynamically, over the
    // positions a real `us54` game reaches.
    let checked = 0
    let agreedTrue = 0
    for (const { view } of collectBotViews(6, us54Config)) {
      const k = buildKnowledge(view, { useConstraints: true })
      const byContained = new Set(containedBooks(view, k))
      // The books `containedBooks` considers at all — unresolved, and this seat holds some but
      // not all of them, which is exactly the set a legal ask (rows 6 and 7) can name.
      const askable = new Set(
        allBooks(view.config).filter((b) => {
          if (view.books[b]) return false
          const cards = bookCards(b, view.config)
          const mine = cards.filter((c) => view.hand.includes(c)).length
          return mine > 0 && mine < cards.length
        }),
      )
      for (const book of askable) {
        expect(bookContainedOnOwnTeam(view, k, book)).toBe(byContained.has(book))
        checked++
        if (byContained.has(book)) agreedTrue++
      }
    }
    expect(checked).toBeGreaterThan(0)
    // And the positive case is actually exercised, not merely the trivial "both false" one.
    expect(agreedTrue).toBeGreaterThan(0)
  })
})

describe('conceal.ts vs defuse.ts — the arbitration', () => {
  it('splits the shared position at exactly defuse * p * prey = conceal * mine', () => {
    const view = splitPosition()
    const k = buildKnowledge(view, { useConstraints: true })
    const E = turnYield(view)
    const lic = logLicences(view, k)
    // Seat 1 published a LOW-H basis; this team can account for three of LOW-H; two of them are
    // the hidden cards in this hand.
    expect([...lic(1)]).toEqual(['LOW-H'])
    expect([...lic(0)]).toEqual([])
    expect(preyInBook(view, k, 'LOW-H')).toBe(3)
    expect(ownCardsInBook(view, 'LOW-H')).toBe(2)

    const net = (p: number, defuse: number, conceal: number) => {
      const style = { ...STYLE_ROSTER.balanced, defuse, conceal }
      const a = mkAsk(1, '7H', p)
      return defusalBonus(view, k, style, a, p, E, lic) - concealmentPenalty(view, k, style, a, E, lic)
    }
    // At defuse 1 / conceal 1 the crossover is p = mine / prey = 2/3, and every shared factor
    // (wHit, perPrey, 1 + E) cancels out of it.
    expect(net(2 / 3, 1, 1)).toBeCloseTo(0, 12)
    expect(net(0.9, 1, 1)).toBeGreaterThan(0) // defusal wins the high-probability ask
    expect(net(0.4, 1, 1)).toBeLessThan(0) // concealment wins the speculative one
    // And the appetites move the crossover the way the arithmetic says: doubling the concealment
    // appetite pushes it to p = 4/3, i.e. out of reach — concealment takes the whole position.
    expect(net(0.99, 1, 2)).toBeLessThan(0)
    // Doubling the defusal appetite instead pulls it down to p = 1/3.
    expect(net(0.4, 2, 1)).toBeGreaterThan(0)
  })
})

describe('the style vector and compatibility', () => {
  it('accepts an absent appetite and refuses a negative one', () => {
    expect(validateStyle(STYLE_ROSTER.balanced)).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.balanced, conceal: 2 })).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.balanced, conceal: -1 })).toContain('conceal -1 < 0')
  })

  it('the rule-set gate alone holds pagat48 unchanged, at a style that wants the mechanism', () => {
    let n = 0
    for (const { view, seed } of collectBotViews(6)) {
      const on = decide(view, { ...STYLE_ROSTER.balanced, conceal: 1 }, seed)
      const off = decide(view, STYLE_ROSTER.balanced, seed)
      expect(on).toEqual(off)
      n++
    }
    expect(n).toBeGreaterThan(0)
  })

  it('carrying the field at zero is byte-identical to not carrying it at all', () => {
    // The control every measurement in the report rests on: the presence of the knob, switched
    // off, must not perturb a single decision under either rule set.
    for (const config of [undefined, us54Config]) {
      let n = 0
      for (const { view, seed } of collectBotViews(4, config)) {
        expect(decide(view, { ...STYLE_ROSTER.balanced, conceal: 0 }, seed)).toEqual(
          decide(view, STYLE_ROSTER.balanced, seed),
        )
        n++
      }
      expect(n).toBeGreaterThan(0)
    }
  })

  it('changes at least one us54 decision — a knob that never fires is not a knob', () => {
    let changed = 0
    for (const { view, seed } of collectBotViews(8, us54Config)) {
      const on = decide(view, { ...STYLE_ROSTER.balanced, conceal: 1 }, seed)
      const off = decide(view, STYLE_ROSTER.balanced, seed)
      if (JSON.stringify(on) !== JSON.stringify(off)) changed++
    }
    expect(changed).toBeGreaterThan(0)
  })
})
