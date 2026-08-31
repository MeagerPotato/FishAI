/**
 * Directional coverage for the concession layer — CONCESSION.md §9's *"tests that would catch a
 * sign flip"*.
 *
 * A **directional** test is one that fails when a term's sign is reversed and passes when it is
 * not, for a reason a reader can see in the assertion. `tests/bots/defuse.test.ts` and
 * `tests/bots/conceal.test.ts` pin the arithmetic of the two terms and the gates that switch them
 * off; this file pins which way they push.
 *
 * ## What the existing suites already caught, measured rather than assumed
 *
 * §9 states that *"both concession terms currently pass their suites with the sign reversed"*.
 * That was checked here by actually reversing each sign and running the suites, and **it is only
 * true of the third of the three sign errors that can be made**:
 *
 *  - Negating `defusalBonus`'s return **fails 2 of 25** — `defuse.test.ts`'s exact-value fixture
 *    (which asserts `toBeCloseTo(...)` against the positive formula and `toBeGreaterThan(0)`) and
 *    `conceal.test.ts`'s arbitration test. Caught.
 *  - Negating `concealmentPenalty`'s return **fails 3 of 25**, on the same kind of exact-value
 *    assertion. Caught.
 *  - Reversing the *application* in `decide.ts` `pickAsk` — `bonus - charge` written as
 *    `charge - bonus`, so that defusal repels and concealment attracts — **passes both suites
 *    entirely**. That is the real gap: every assertion in both files calls the two exported
 *    functions directly, and no assertion anywhere pins what `pickAsk` does with the numbers they
 *    return.
 *
 * (For the record, the application flip is not invisible to the repository as a whole: it also
 * perturbs two *statistical smoke* tests that know nothing about this layer —
 * `bounded.test.ts`'s monotone-in-bits smoke and `classify.test.ts`'s turtle smoke — because the
 * roster carries `defuse: 1`. Those are collateral, not coverage: neither names the mechanism,
 * neither would tell a reader which sign was wrong, and both are the kind of test that is
 * expected to wobble. They are not a substitute for the decision-level tests below.)
 *
 * ## So the tests that matter here are the decision-level ones
 *
 * Each of the two `decide` tests constructs a position where the term genuinely changes which ask
 * is played, and asserts the **choice**. Turning the appetite from 0 to 1 must move the pick a
 * specific way; a reversed sign moves it the other way and the assertion fails. Neither can pass
 * for the wrong reason, because each also asserts the position's premise — that the plain ranker
 * prefers the *other* ask — so the test would fail loudly if the fixture ever stopped isolating
 * the mechanism.
 *
 * The unit-level tests below are ordering assertions (`more prey => more credit`), which the
 * existing exact-value fixtures do **not** imply: a single `toBeCloseTo` at one `p` and one prey
 * count says nothing about behaviour at another. Each also re-asserts strict positivity of the
 * term on its lower arm. That part *is* belt-and-braces — `defuse.test.ts` and `conceal.test.ts`
 * already pin it — and it is kept only because an ordering assertion whose lower arm is zero would
 * hold for a term that never fires, so the two assertions are worth reading together.
 */
import { describe, expect, it } from 'vitest'
import { us54Config } from '../../lib/engine/index.ts'
import type { BookId, Card, Knowledge, PublicEvent, Seat } from '../../lib/engine/index.ts'
import { buildKnowledge, rankAsksWith, refinedHitProbability } from '../../lib/engine/bots/knowledge.ts'
import { decide } from '../../lib/engine/bots/decide.ts'
import { STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { preyInBook, turnYield } from '../../lib/engine/bots/threat.ts'
import { defusalBonus, logLicences } from '../../lib/engine/bots/defuse.ts'
import type { LicenceLookup } from '../../lib/engine/bots/defuse.ts'
import { concealmentPenalty, ownCardsInBook } from '../../lib/engine/bots/conceal.ts'
import { ask, gs, mkView } from './util.ts'

const mkAsk = (target: Seat, card: Card, p = 0.5) => ({ target, card, score: 0, p, reason: '' })

/** The roster appetite, with both concession knobs written out so each test states its own arm. */
const style = (defuse: number, conceal: number) => ({ ...STYLE_ROSTER.balanced, defuse, conceal })

/**
 * The shared position for both `decide` tests, and the fixture the whole file rests on. Seats 0, 2
 * and 4 are team 0; seat 0 is the viewer. Every ask in the log is legal — an even seat asks an odd
 * one or the reverse — which matters because a fabricated log that could not have happened would
 * make the ranking it produces meaningless.
 *
 * Two unresolved sets are live for this hand, and they are deliberately close in value:
 *
 *  - **LOW-C**, where seat 0 holds 2C-5C and teammate seat 2 certainly holds 7C. Seat 5's two
 *    probes and seat 0's own rule 6C out of seats 2, 4 and 5, leaving it with seats 1 and 3 — so
 *    `6C` at seat 1 is the best ask on the board by the plain ranker (score 64.06).
 *  - **LOW-H**, where seat 0 holds 2H and 3H and teammate seat 2 has taken 5H and 6H on public
 *    hits, so this team certainly accounts for four of the set (`prey = 4`). Seat 1 opened with a
 *    LOW-H ask that missed, which under RULES_US54.md row 6 publishes that it holds a card of
 *    LOW-H and is never discharged — nobody ever proves what seat 1 holds. That standing
 *    constraint lifts seat 1's refined hit estimate on the two unlocated cards (4H, 7H) to 0.607,
 *    which is what makes `4H` at seat 1 a real ask rather than a throwaway (plain score 57.50).
 *
 * So the plain ranker prefers `6C@1` by 6.56 points, and the defusal credit on `4H@1` is worth
 * 41.54 — a hit there takes back the card seat 1's whole published reach into this team's LOW-H
 * rests on. `6C@1` earns no credit at all, because seat 1 has published nothing about LOW-C.
 *
 * **No ask in this position is certain**, which is load-bearing: the `pickAsk` certain-hit gate
 * zeroes both concession terms for uncertain asks whenever a certain hit exists, so a fixture that
 * accidentally contained one would test the gate instead of the term. The first assertion of each
 * test pins that.
 */
const DEFUSE_HAND: Card[] = ['2H', '3H', '2C', '3C', '4C', '5C', '9D', '8D', 'TS']

const DEFUSE_LOG: PublicEvent[] = [
  gs,
  // Seat 1 publishes a LOW-H basis and misses. Its deal-time constraint is never discharged,
  // because no card of LOW-H is ever proven to be at seat 1.
  ask(1, 2, '2H', false),
  // Teammate seat 2 gathers two cards of LOW-H off the two opponents that are not seat 1.
  ask(2, 3, '5H', true),
  ask(2, 5, '6H', true),
  // Seat 5 rules 6C out of both of this team's other seats, and picks up a LOW-C basis doing it.
  ask(5, 2, '6C', false),
  ask(5, 4, '6C', false),
  // Teammate seat 2 takes 7C off seat 5. This discharges seat 5's LOW-C constraint, which is what
  // stops the engine deducing 7C's location by elimination and handing the position a certain hit.
  ask(2, 5, '7C', true),
  // Seat 0's own probe rules 6C out of seat 5, leaving seats 1 and 3.
  ask(0, 5, '6C', false),
  // An unrelated miss, so the turn-yield denominator is not degenerate.
  ask(3, 0, 'TC', false),
]

function defusePosition() {
  return mkView({
    seat: 0,
    hand: DEFUSE_HAND,
    counts: [9, 9, 12, 8, 9, 7],
    log: DEFUSE_LOG,
    turn: 0,
    config: us54Config,
  })
}

/**
 * The concealment position, which is the same shape read from the other side.
 *
 * Seat 1's opening LOW-H ask is gone (it would let the engine deduce 7H's holder outright, by
 * RULES_US54.md row 7 — a seat cannot ask for a card it holds — and hand the position a certain
 * hit). In its place seat 0 has asked seat 1 for 4H and missed, so **seat 0 has published a LOW-H
 * basis of its own and has published nothing about LOW-C**.
 *
 * That is the whole fixture. The best ask on the board is still `6C@1`, and it would be seat 0's
 * *first* ask into LOW-C — publishing to five opponents that this hand holds cards of a set it
 * holds four of. Concealment charges exactly that publication (`mine = 4`), and charges nothing
 * for a LOW-H ask, because that basis is already public and gate 3 retires the charge once per
 * set. Defusal is held at 0 throughout so the arm is unambiguous.
 */
const CONCEAL_LOG: PublicEvent[] = [
  ...DEFUSE_LOG.slice(0, 1),
  ask(2, 3, '5H', true),
  ask(2, 5, '6H', true),
  ask(5, 2, '6C', false),
  ask(5, 4, '6C', false),
  ask(2, 5, '7C', true),
  // Seat 2 rules 6C out of seat 5 here, so that seat 0's own only ask is the LOW-H one below.
  ask(2, 5, '6C', false),
  // Seat 0 publishes a LOW-H basis and misses. LOW-C stays unpublished by this seat.
  ask(0, 1, '4H', false),
  ask(3, 0, 'TC', false),
]

function concealPosition() {
  return mkView({
    seat: 0,
    hand: DEFUSE_HAND,
    counts: [9, 9, 12, 8, 9, 7],
    log: CONCEAL_LOG,
    turn: 0,
    config: us54Config,
  })
}

describe('defuse.ts — the credit is ordered, not merely arithmetic', () => {
  it('rises with the hit probability it is weighted by', () => {
    // The credit is collected only on the hit branch, so a likelier hit must buy more. The
    // existing exact-value fixture pins one `p`; a single point says nothing about the ordering.
    const view = defusePosition()
    const k = buildKnowledge(view, { useConstraints: true })
    const E = turnYield(view)
    const lic = logLicences(view, k)
    const at = (p: number) => defusalBonus(view, k, style(1, 0), mkAsk(1, '4H', p), p, E, lic)
    expect(at(0.1)).toBeGreaterThan(0)
    expect(at(0.5)).toBeGreaterThan(at(0.1))
    expect(at(0.9)).toBeGreaterThan(at(0.5))
  })

  it('rises with the prey the hit would protect', () => {
    // Prey is varied while the view — and therefore `wHit`, `E` and the appetite — is held fixed,
    // by moving one unlocated card of LOW-H onto a teammate. `Knowledge` is a plain serializable
    // record read only through pure functions, which is what makes that legitimate; the same
    // technique is used in `conceal.test.ts` for the containment predicate.
    //
    // The licence is stated inline rather than read off the log, so the only thing differing
    // between the two arms is the prey count. `LicenceLookup` is a one-line function type, so a
    // literal is a complete substitute for a helper — which is why `defuse.ts` no longer exports
    // a `tabledLicences` builder for this.
    const view = defusePosition()
    const real = buildKnowledge(view, { useConstraints: true })
    const LOW_H: ReadonlySet<BookId> = new Set<BookId>(['LOW-H'])
    const NONE: ReadonlySet<BookId> = new Set<BookId>()
    const lic: LicenceLookup = (seat: Seat) => (seat === 1 ? LOW_H : NONE)
    // `preyInBook` reads a card's holder through `holderOf`, which is the materialised `holders`
    // map rather than the candidate lists — so that is the field the arm has to move.
    const withHolder = (card: Card, seat: Seat): Knowledge => ({
      ...real,
      holders: { ...real.holders, [card]: seat },
      cands: { ...real.cands, [card]: [seat] },
    })
    // 2H and 3H in hand, 5H and 6H proven at teammate seat 2.
    const four = real
    // 4H pinned on teammate seat 2 as well: one more card this team can certainly account for,
    // and therefore one more card seat 1's published basis threatens.
    const five = withHolder('4H', 2)
    expect(preyInBook(view, four, 'LOW-H')).toBe(4)
    expect(preyInBook(view, five, 'LOW-H')).toBe(5)

    const E = turnYield(view)
    const bonusAt = (k: Knowledge) => defusalBonus(view, k, style(1, 0), mkAsk(1, '7H'), 0.5, E, lic)
    expect(bonusAt(four)).toBeGreaterThan(0)
    expect(bonusAt(five)).toBeGreaterThan(bonusAt(four))
  })
})

describe('conceal.ts — the charge is ordered, not merely arithmetic', () => {
  it('rises with the exposure the publication would leak', () => {
    // `mine(H)` is the whole hidden exposure while the basis is unpublished, so a hand holding
    // more of the set must be charged more for announcing it. Only the hand differs between the
    // two arms; the log, the appetite and the `E` denominator are identical.
    const withHand = (hand: Card[]) =>
      mkView({
        seat: 0,
        hand,
        counts: [hand.length, 9, 12, 8, 9, 7],
        log: CONCEAL_LOG,
        turn: 0,
        config: us54Config,
      })
    const lean = withHand(['2H', '3H', '2C', '3C', '9D', '8D', 'TS'])
    const rich = withHand(['2H', '3H', '2C', '3C', '4C', '5C', '9D', '8D', 'TS'])
    expect(ownCardsInBook(lean, 'LOW-C')).toBe(2)
    expect(ownCardsInBook(rich, 'LOW-C')).toBe(4)

    const chargeOf = (view: ReturnType<typeof withHand>) => {
      const k = buildKnowledge(view, { useConstraints: true })
      return concealmentPenalty(view, k, style(0, 1), mkAsk(1, '6C'), turnYield(view), logLicences(view, k))
    }
    expect(chargeOf(lean)).toBeGreaterThan(0)
    expect(chargeOf(rich)).toBeGreaterThan(chargeOf(lean))
  })
})

describe('the decision, which is the thing a sign controls', () => {
  it('defusal moves the choice ONTO the ask into the target published basis', () => {
    const view = defusePosition()
    const k = buildKnowledge(view, { useConstraints: true })
    const lic = logLicences(view, k)

    // The premise of the fixture, asserted rather than assumed.
    expect(rankAsksWith(view, k, STYLE_ROSTER.balanced).some((r) => r.p === 1)).toBe(false)
    expect([...lic(1)]).toEqual(['LOW-H'])
    expect(preyInBook(view, k, 'LOW-H')).toBe(4)

    // Switched off, the seat plays the best ask on the board — into LOW-C, at a seat that has
    // published nothing about LOW-C and whose reach a hit there would therefore not touch.
    expect(decide(view, style(0, 0), 12345)).toEqual({ type: 'ask', seat: 0, target: 1, card: '6C' })
    // Switched on, it takes back a card seat 1's published LOW-H reach rests on instead. A
    // reversed sign pushes those asks 41.54 points the other way and leaves `6C` the pick, so this
    // is the assertion that fails when the direction is wrong — in `defusalBonus` or in `pickAsk`.
    //
    // The seat is asserted, but not *which* of the two unlocated LOW-H cards: `4H@1` and `7H@1`
    // score 99.043750 each — an exact tie, since they differ in nothing the ranker reads — and the
    // winner is settled by enumeration index alone. Pinning one card would make this test fail on
    // a change to ask-enumeration order, for a reason with nothing to do with sign.
    const picked = decide(view, style(1, 0), 12345)
    expect(picked).toMatchObject({ type: 'ask', seat: 0, target: 1 })
    expect(['4H', '7H']).toContain((picked as { card: Card }).card)
  })

  it('concealment moves the choice OFF the first ask into an unpublished set', () => {
    const view = concealPosition()
    const k = buildKnowledge(view, { useConstraints: true })
    const lic = logLicences(view, k)

    // The premise: no certain hit, this seat has published LOW-H and not LOW-C, and the ask the
    // plain ranker wants would be its first publication about a set it holds four cards of.
    expect(rankAsksWith(view, k, STYLE_ROSTER.balanced).some((r) => r.p === 1)).toBe(false)
    expect([...lic(0)]).toEqual(['LOW-H'])
    expect(ownCardsInBook(view, 'LOW-C')).toBe(4)

    expect(decide(view, style(0, 0), 12345)).toEqual({ type: 'ask', seat: 0, target: 1, card: '6C' })
    // The charge is 68.42 against a 64.06 ask, so the seat declines to open LOW-C and asks into
    // the set whose basis it has already published — where gate 3 means the ask costs nothing new.
    // Reversed, the charge would become a 68.42-point *reward* for publishing and `6C` would win
    // by more than it does at appetite 0, so this assertion is what pins the sign as a cost.
    expect(decide(view, style(0, 1), 12345)).toEqual({ type: 'ask', seat: 0, target: 3, card: '4H' })
  })
})

describe('the certain-hit gate', () => {
  /**
   * PR #8 added a gate in `pickAsk` zeroing both concession terms for any ask with `p < 1`
   * whenever a certain hit is available. CONCESSION.md §9 records that no ladder prices it.
   *
   * The position: seat 0 holds four cards of LOW-H, so `prey = 4`, and seat 1 has published a
   * LOW-H basis by asking for `2H` — a card seat 0 holds, which is what keeps the constraint from
   * pinning either unlocated card and handing the board a second certain hit. Meanwhile 8S has
   * been ruled out of every seat but seat 1, so `8S@1` is certain; seat 1 has published nothing
   * about EIGHTS, so that certain hit earns no defusal credit at all.
   *
   * That is the trade the gate exists to refuse: riskless material that keeps the turn (row 9)
   * against a 65%-shot that concedes it (row 10) on a miss.
   */
  const GATE_HAND: Card[] = ['2H', '3H', '4H', '5H', '8D', '9D', 'TD', '9S', 'TS']

  const GATE_LOG: PublicEvent[] = [
    gs,
    // Seat 1 publishes a LOW-H basis, asking for a card seat 0 holds.
    ask(1, 2, '2H', false),
    // 6H narrowed towards seat 1 without being pinned there.
    ask(0, 3, '6H', false),
    ask(0, 5, '6H', false),
    // 8S ruled out of seats 2, 3, 4 and 5, leaving seat 1 as its only possible holder.
    ask(3, 2, '8S', false),
    ask(3, 4, '8S', false),
    ask(0, 3, '8S', false),
    ask(0, 5, '8S', false),
  ]

  it('keeps a certain hit that an uncertain high-prey ask would outrank ungated', () => {
    const view = mkView({
      seat: 0,
      hand: GATE_HAND,
      counts: [9, 9, 9, 9, 9, 9],
      log: GATE_LOG,
      turn: 0,
      config: us54Config,
    })
    const k = buildKnowledge(view, { useConstraints: true })
    const E = turnYield(view)
    const lic = logLicences(view, k)
    const ranked = rankAsksWith(view, k, STYLE_ROSTER.balanced)
    const find = (card: Card, target: Seat) => {
      const r = ranked.find((x) => x.card === card && x.target === target)
      if (r === undefined) throw new Error(`${card}@${target} is not a legal ask here`)
      return r
    }

    const certain = find('8S', 1)
    const uncertain = find('6H', 1)
    expect(certain.p).toBe(1)
    expect(uncertain.p).toBeLessThan(1)
    // Seat 1 has published a LOW-H basis and nothing about EIGHTS, so the credit lands entirely on
    // the uncertain ask.
    expect(defusalBonus(view, k, style(1, 0), certain, 1, E, lic)).toBe(0)
    expect(preyInBook(view, k, 'LOW-H')).toBe(4)

    // What the gate is actually holding back: scored the way `pickAsk` scores an ungated ask, the
    // uncertain one wins outright. Without this comparison the test below would pass in a position
    // where the gate never had anything to do.
    const refined = refinedHitProbability(k, uncertain.card, uncertain.target)
    const ungated =
      uncertain.score +
      STYLE_ROSTER.balanced.wHit * (refined - uncertain.p) +
      defusalBonus(view, k, style(1, 0), uncertain, refined, E, lic)
    expect(ungated).toBeGreaterThan(certain.score)

    // And the seat takes the certain hit anyway, at both appetites.
    for (const defuse of [0, 1]) {
      expect(decide(view, style(defuse, 0), 12345)).toEqual({
        type: 'ask',
        seat: 0,
        target: 1,
        card: '8S',
      })
    }

    // **This fixture pins the defusal half of the gate only, and cannot pin the other half.**
    // `pickAsk` documents the gate as zeroing *both* concession terms, but seat 0 has already
    // published a basis in both sets it can ask into here (LOW-H by its `6H` probes, EIGHTS by
    // its `8S` probes), so conceal's basis-is-public release fires and the charge is exactly zero
    // on both asks. Asserted rather than left implicit, because a reader could otherwise take the
    // appetite loop below as coverage it is not: a mutation leaving the concealment charge live
    // under a certain hit is invisible to this test.
    expect(concealmentPenalty(view, k, style(0, 1), uncertain, E, lic)).toBe(0)
    expect(concealmentPenalty(view, k, style(0, 1), certain, E, lic)).toBe(0)
    for (const conceal of [0, 1]) {
      expect(decide(view, style(0, conceal), 12345)).toMatchObject({ type: 'ask', card: '8S' })
    }
  })
})
