/**
 * The contained-book turn-pass as a POLICY option — [CONTAINMENT.md](../../CONTAINMENT.md) §3.2.1
 * and STYLES.md §6.3.
 *
 * [tests/engine/containment.test.ts](../engine/containment.test.ts) measures the *mechanism*:
 * a book held entirely by one team is absorbing (C1/C2), a holder's ask into it is a guaranteed
 * miss aimed at a chosen opponent (C3/C4), it is repeatable (C5), and claiming destroys it (C6).
 * This file measures the *decision*: that the bot recognises the state, prices it honestly, and
 * — the part that matters — **declines it far more often than it takes it**.
 *
 * > *"Do NOT simply make it fire whenever it is legal."*
 *
 * So the centre of this file is the pair of positions that differ only in the opponents' hand
 * sizes: with the concession already aimed where the style wants it the move is refused, and it
 * is refused for the reason the derivation gives — the aiming gain is what pays for the
 * surrendered tempo, and there is none.
 */
import { describe, expect, it } from 'vitest'
import {
  SKILL_PRESETS,
  STYLE_IDS,
  STYLE_PRESETS,
  STYLE_ROSTER,
  bookCards,
  buildKnowledge,
  containedBooks,
  containedPassCard,
  decide,
  defaultConfig,
  firstUseInfoCost,
  legalAsksFromView,
  planContainedPass,
  rankAsksWith,
  us54Config,
} from '../../lib/engine/index.ts'
import type {
  BookId,
  GameAction,
  PublicEvent,
  RulesConfig,
  SeatView,
  StyleParams,
} from '../../lib/engine/index.ts'
import { ask, gs, mkView } from './util.ts'

const BALANCED = STYLE_ROSTER.balanced
const HOARDER = STYLE_ROSTER.hoarder

function key(a: GameAction): string {
  return a.type === 'ask' ? `ask ${a.card}@${a.target}` : a.type
}

/**
 * **The contained-book ask spot.** A `us54` state with the declare window CLOSED, so the only
 * legal move is an ask (RULES_US54.md §3) and no declare knob is in the picture.
 *
 * Seat 0 holds five of `LOW-C` (`2C`–`6C`) and one `HIGH-D` card. Three recorded misses — seat 0
 * asking each opponent in turn for `7C` — clear seats 1, 3 and 5 from it, and seat 0's own hand
 * clears itself, so `7C`'s candidates are exactly the two teammates `{2, 4}`. **Every card of
 * `LOW-C` is therefore certainly on team A while no seat is pinned**, which is the recogniser's
 * predicate: an ask for `7C` cannot hit whichever opponent it names (C1/C3).
 *
 * The seat's *other* asks are the five missing `HIGH-D` cards, live at five candidate seats, so
 * `counts` alone slides the position between "the ordinary ask is worth taking" and "it is not".
 *
 * `fillers` are six misses between other seats in six other sets. They are inert for `LOW-C` and
 * for `HIGH-D`, and they exist to move exactly one quantity: the public hit rate the valuation
 * reads off the log (`hits / max(1, misses)`), from 3/3 = 1 down to 3/9 = 1/3.
 */
const FILLERS: PublicEvent[] = [
  ask(1, 2, 'AS', false),
  ask(3, 2, 'AH', false),
  ask(5, 2, 'AC', false),
  ask(1, 4, '2D', false),
  ask(3, 4, '2H', false),
  ask(5, 4, '2S', false),
]

function containedSpot(counts: number[], o?: { fillers?: number; config?: RulesConfig }): SeatView {
  const n = o?.fillers ?? 0
  return mkView({
    seat: 0,
    hand: ['2C', '3C', '4C', '5C', '6C', '9D'],
    counts,
    turn: 0,
    log: [
      gs,
      ask(0, 1, '2C', true),
      ask(0, 3, '3C', true),
      ask(0, 5, '4C', true),
      ask(0, 1, '7C', false),
      ask(0, 3, '7C', false),
      ask(0, 5, '7C', false),
      ...FILLERS.slice(0, n),
    ],
    config: o?.config ?? us54Config,
  })
}

/** The ordinary ask a style would play here — exactly the input `planContainedPass` prices. */
function ordinaryAsk(view: SeatView, style: StyleParams) {
  const k = buildKnowledge(view)
  const ranked = rankAsksWith(view, k, style)
  const a = decide(view, { skill: SKILL_PRESETS.hard, style: { ...style, containedPass: 0 } }, 7)
  expect(a.type).toBe('ask')
  if (a.type !== 'ask') throw new Error('not an ask')
  const r = ranked.find((x) => x.card === a.card && x.target === a.target)
  expect(r, 'the ordinary ask must appear in the ranking').toBeDefined()
  return { k, ranked, ordinary: r! }
}

function plan(view: SeatView, style: StyleParams) {
  const { k, ordinary } = ordinaryAsk(view, style)
  return planContainedPass(view, k, style, SKILL_PRESETS.hard, ordinary)
}

/** Opponents 20 / 5 / 2: the concession is badly aimed, so aiming it is worth something. */
const SPREAD = [6, 20, 8, 5, 8, 2]
/** Opponents 8 / 8 / 8: the concession is already as well aimed as it can be. */
const LEVEL = [6, 8, 8, 8, 8, 8]

/* ------------------------------------------------------------- recogniser --- */

describe('the recogniser (CONTAINMENT.md C1)', () => {
  it('finds a book whose every card is certainly on the viewer’s team', () => {
    const v = containedSpot(SPREAD)
    const k = buildKnowledge(v)
    expect(k.cands['7C']).toEqual([2, 4])
    expect(containedBooks(v, k)).toEqual(['LOW-C'])
  })

  it('does not require the holders to be pinned — which is why every style can reach it', () => {
    // `7C` sits at {2, 4}, so `certainClaim` cannot bank LOW-C and no style has already
    // resolved it away. A recogniser keyed on pinned holders would only ever fire for the two
    // styles that refuse a certain declare.
    const v = containedSpot(SPREAD)
    const k = buildKnowledge(v)
    expect(k.holders['7C']).toBeUndefined()
    expect(containedBooks(v, k)).toContain('LOW-C')
  })

  it('excludes a book with a live opponent candidate', () => {
    // Drop the miss that cleared seat 5 from `7C`: an opponent may hold it, so the ask could
    // hit and the move is not a turn-pass at all.
    const v = mkView({
      seat: 0,
      hand: ['2C', '3C', '4C', '5C', '6C', '9D'],
      counts: SPREAD,
      turn: 0,
      log: [gs, ask(0, 1, '7C', false), ask(0, 3, '7C', false)],
      config: us54Config,
    })
    const k = buildKnowledge(v)
    expect(k.cands['7C']).toEqual([2, 4, 5])
    expect(containedBooks(v, k)).toEqual([])
  })

  it('excludes a book the seat holds none of (row 6) and one it holds all of (row 7)', () => {
    const v = containedSpot(SPREAD)
    const k = buildKnowledge(v)
    const books = containedBooks(v, k)
    // HIGH-D: seat 0 holds one card but the rest are live at five seats — not contained.
    expect(books).not.toContain('HIGH-D')
    // Row 6 is the licence and row 7 is the legal name: every returned book must have at least
    // one card in hand and at least one out of it. Seat 0 holds nothing of LOW-D, so however
    // the position develops LOW-D can never be one of them.
    expect(books).not.toContain('LOW-D')
    for (const b of books) {
      const cards = bookCards(b, us54Config)
      expect(cards.some((c) => v.hand.includes(c)), `${b} row 6`).toBe(true)
      expect(cards.some((c) => !v.hand.includes(c)), `${b} row 7`).toBe(true)
    }
    // Holding all six leaves no legal card to name (row 7), so it is not a turn-pass either.
    const whole = mkView({
      seat: 0,
      hand: ['2C', '3C', '4C', '5C', '6C', '7C'],
      counts: [6, 20, 8, 5, 8, 7],
      turn: 0,
      log: [gs],
      config: us54Config,
    })
    expect(containedBooks(whole, buildKnowledge(whole))).toEqual([])
  })
})

/* ------------------------------------------------- §1.2: reuse one card --- */

describe('CONTAINMENT.md §1.2 — reuse one card, never cycle', () => {
  it('names the card whose absence from this hand is already public', () => {
    const v = containedSpot(SPREAD)
    expect(containedPassCard(v, 'LOW-C')).toEqual({ card: '7C', reused: true })
  })

  it('a first use takes the canonical-first legal card, and every later use reuses it', () => {
    // No `7C` miss in the log yet: this is the one ask that publishes a new card-fact.
    const fresh = mkView({
      seat: 0,
      hand: ['2C', '3C', '4C', '5C'],
      counts: [4, 20, 8, 5, 8, 2],
      turn: 0,
      log: [gs],
      config: us54Config,
    })
    const first = containedPassCard(fresh, 'LOW-C')
    expect(first).toEqual({ card: '6C', reused: false })
    // Replay that ask into the log — which is what actually happens next — and the choice is
    // the same card, now free. A contained book's cards cannot move (C1 closes the only
    // channel), so the canonical-first choice is fixed for the rest of the game and the reuse
    // discipline needs no state carried between decisions.
    const after = { ...fresh, log: [...fresh.log, ask(0, 3, '6C', false)] }
    expect(containedPassCard(after, 'LOW-C')).toEqual({ card: '6C', reused: true })
  })

  it('the information price is charged only on that first use, and is bounded by 1/U', () => {
    const v = containedSpot(SPREAD)
    const k = buildKnowledge(v)
    const unknown = Object.values(k.cands).filter((c) => (c ?? []).length > 1).length
    expect(unknown).toBeGreaterThan(0)
    // A non-signalling style pays 1/U cards; C1 and C2 close the two channels by which the
    // opponents could otherwise convert the fact into points, leaving only count exhaustion.
    const quiet: StyleParams = { ...BALANCED, signalling: false }
    expect(firstUseInfoCost(k, quiet)).toBeCloseTo(1 / unknown, 12)
    expect(firstUseInfoCost(k, quiet)).toBeLessThan(0.1)
  })
})

/* ------------------------------------------------------ the derived trigger --- */

describe('the trigger is derived, and it is mostly a refusal', () => {
  it('refuses when the concession is already aimed where the style wants it', () => {
    // Every opponent holds 8 cards, so conceding to any of them costs the same: the aiming
    // gain is 0 and there is nothing to pay for the surrendered tempo. The book is contained
    // and the ask is legal — and the policy declines it anyway. This is the assertion that
    // separates "a policy option" from "fires whenever legal".
    const v = containedSpot(LEVEL)
    const k = buildKnowledge(v)
    expect(containedBooks(v, k)).toEqual(['LOW-C'])
    for (const id of STYLE_IDS) {
      expect(plan(v, STYLE_ROSTER[id]), id).toBeNull()
    }
  })

  it('takes it when the ordinary ask would concede the turn to the biggest hand', () => {
    const v = containedSpot(SPREAD)
    const p = plan(v, BALANCED)
    expect(p).not.toBeNull()
    if (p === null) return
    expect([p.book, p.card, p.target]).toEqual(['LOW-C', '7C', 5])
    // `E` is read off the public log: 3 hits and 3 misses, so a conceded turn is worth 1 card.
    expect(p.value.E).toBe(1)
    // gain = E * (20 - 2) / meanHand ; tempo = 1 + E * 20 / meanHand ; meanHand = 49/6.
    const meanHand = 49 / 6
    expect(p.value.meanHand).toBeCloseTo(meanHand, 12)
    expect(p.value.gain).toBeCloseTo(18 / meanHand, 12)
    expect(p.value.tempo).toBeCloseTo(1 + 20 / meanHand, 12)
    expect(p.value.threshold).toBeCloseTo(p.value.gain / p.value.tempo, 12)
  })

  it('the hit rate it prices a conceded turn with is measured, not assumed', () => {
    // Same position, six more recorded misses: a turn now yields 1/3 of a card instead of 1,
    // the aiming gain falls with it, and the same ordinary ask becomes worth keeping.
    const busy = containedSpot(SPREAD)
    const quiet = containedSpot(SPREAD, { fillers: 6 })
    const a = plan(busy, BALANCED)
    const b = plan(quiet, BALANCED)
    expect(a?.value.E).toBe(1)
    expect(b).toBeNull()
    const k = buildKnowledge(quiet)
    // Not because the book stopped being contained — only because the arithmetic changed.
    expect(containedBooks(quiet, k)).toEqual(['LOW-C'])
  })

  it('never displaces a certain hit', () => {
    // Seat 3 is publicly known to hold `TD`: the ordinary ask is riskless material AND keeps
    // the turn (row 9), so nothing may outrank it. The threshold is clamped below 1 as well.
    const v = mkView({
      seat: 0,
      hand: ['2C', '3C', '4C', '5C', '6C', '9D'],
      counts: [6, 20, 8, 5, 8, 2],
      turn: 0,
      log: [
        gs,
        ask(0, 1, '2C', true),
        ask(0, 3, '3C', true),
        ask(0, 5, '4C', true),
        ask(0, 1, '7C', false),
        ask(0, 3, '7C', false),
        ask(0, 5, '7C', false),
        ask(3, 2, 'TD', true),
      ],
      config: us54Config,
    })
    const k = buildKnowledge(v)
    expect(k.holders['TD']).toBe(3)
    expect(containedBooks(v, k)).toEqual(['LOW-C'])
    const a = decide(v, BALANCED, 7)
    expect(key(a)).toBe('ask TD@3')
    const ranked = rankAsksWith(v, k, BALANCED)
    const certain = ranked.find((x) => x.card === 'TD' && x.target === 3)!
    expect(certain.p).toBe(1)
    expect(planContainedPass(v, k, BALANCED, SKILL_PRESETS.hard, certain)).toBeNull()
  })

  it('a style that expresses no aim buys nothing by aiming', () => {
    const v = containedSpot(SPREAD)
    expect(plan(v, { ...BALANCED, missTarget: 'random' })).toBeNull()
  })

  it("Blitz's own missTarget 'most' zeroes the gain — no bespoke number needed", () => {
    // STYLES.md §3 gives Blitz `missTarget: 'most'`, i.e. it prefers to concede to the LARGEST
    // hand. The ordinary ask already does that here, so the aiming gain is <= 0 and the
    // mechanism is off for it, at the same appetite every other style carries.
    const v = containedSpot(SPREAD)
    expect(STYLE_ROSTER.blitz.containedPass).toBe(1)
    expect(STYLE_ROSTER.blitz.missTarget).toBe('most')
    expect(plan(v, STYLE_ROSTER.blitz)).toBeNull()
  })
})

/* --------------------------------------------------------- the appetite --- */

describe('the Hoarder is the style that most values the retained licence (STYLES.md §6.3)', () => {
  it('carries the roster’s highest appetite, and it is the only one above the break-even', () => {
    expect(HOARDER.containedPass).toBe(1.33)
    for (const id of STYLE_IDS) {
      if (id === 'hoarder') continue
      expect(STYLE_ROSTER[id].containedPass, id).toBe(1)
      expect(STYLE_ROSTER[id].containedPass).toBeLessThan(HOARDER.containedPass)
    }
    // Every shipped preset is OFF, which is what keeps the three tiers (and `pagat48`) fixed.
    for (const t of ['easy', 'medium', 'hard'] as const) {
      expect(STYLE_PRESETS[t].containedPass, t).toBe(0)
    }
  })

  it('the appetite scales the aiming gain and nothing else', () => {
    const v = containedSpot(SPREAD)
    const b = plan(v, BALANCED)
    const h = plan(v, HOARDER)
    expect(b).not.toBeNull()
    expect(h).not.toBeNull()
    if (b === null || h === null) return
    expect(h.value.gain).toBe(b.value.gain)
    expect(h.value.tempo).toBe(b.value.tempo)
    expect(h.value.threshold).toBeCloseTo(1.33 * b.value.threshold, 12)
  })

  it('and it takes the turn-pass in a position where Balanced keeps its ordinary ask', () => {
    // Six filler misses put the measured hit rate at 1/3, which drops the break-even threshold
    // to 0.404 while the ordinary ask's hit probability is 0.465. Balanced (appetite 1) is
    // below its bar and keeps the material ask; the Hoarder (1.33) is above its bar of 0.538
    // and spends the turn to aim the concession at the two-card seat instead.
    const v = containedSpot(SPREAD, { fillers: 6 })
    const { ordinary } = ordinaryAsk(v, BALANCED)
    expect(ordinary.p).toBeGreaterThan(0.4)
    expect(ordinary.p).toBeLessThan(0.5)
    expect(plan(v, BALANCED)).toBeNull()
    expect(plan(v, HOARDER)).not.toBeNull()
    expect(key(decide(v, BALANCED, 7))).toBe('ask TD@1')
    expect(key(decide(v, HOARDER, 7))).toBe('ask 7C@5')
  })
})

/* ------------------------------------------------------------- the gates --- */

describe('the gates', () => {
  it('containedPass 0 never fires — the shipped tiers are untouched', () => {
    const v = containedSpot(SPREAD)
    for (const t of ['medium', 'hard'] as const) {
      expect(plan(v, STYLE_PRESETS[t]), t).toBeNull()
      expect(key(decide(v, t, 7)), t).toBe('ask TD@1')
    }
  })

  it('pagat48 is refused outright — a compatibility gate, not a rules argument (STYLES.md §6.3.7)', () => {
    const v = containedSpot(SPREAD, { config: defaultConfig })
    const k = buildKnowledge(v)
    // The book is still recognised — containment is a fact about the position, not the rules.
    expect(containedBooks(v, k)).toEqual(['LOW-C'])
    // But the policy will not act on it. NOT because containment fails under pagat48 — it does
    // not: an opponent's declare of a contained book falls under row 14 (opponents hold at
    // least one card, the opposing team scores), worded identically in both rule sets, and
    // tests/engine/containment.test.ts pins exactly that. The gate exists because this project
    // holds the shipped 48-card game byte-identical, and enabling a new policy mechanism there
    // would change it. §6.3.7 records that an earlier draft gave the wrong (row-15) reason.
    for (const id of STYLE_IDS) expect(plan(v, STYLE_ROSTER[id]), id).toBeNull()
  })

  it('a skill that cannot read hand counts cannot aim, so it does not fire', () => {
    const v = containedSpot(SPREAD)
    const k = buildKnowledge(v)
    const { ordinary } = ordinaryAsk(v, BALANCED)
    expect(SKILL_PRESETS.easy.countTargeting).toBe(false)
    expect(planContainedPass(v, k, BALANCED, SKILL_PRESETS.easy, ordinary)).toBeNull()
    expect(planContainedPass(v, k, BALANCED, SKILL_PRESETS.medium, ordinary)).not.toBeNull()
  })
})

/* --------------------------------------------------------- legality / C5 --- */

describe('what it plays is a legal, repeatable ask', () => {
  it('the chosen ask is legal from the view, and is a known miss at every opponent', () => {
    const v = containedSpot(SPREAD)
    const a = decide(v, HOARDER, 7)
    expect(a.type).toBe('ask')
    if (a.type !== 'ask') return
    const legal = legalAsksFromView(v)
    expect(legal.some((x) => x.card === a.card && x.target === a.target)).toBe(true)
    const k = buildKnowledge(v)
    for (const t of [1, 3, 5] as const) {
      expect((k.cands[a.card] ?? []).includes(t), `seat ${t}`).toBe(false)
    }
  })

  it('repeating it is free: the same view yields the same card, and the book stays contained', () => {
    // C5 — a miss moves no cards, so nothing about the position changes except the log, and
    // the log entry is a repeat of one already there (§1.2).
    let v = containedSpot(SPREAD)
    const played: string[] = []
    for (let i = 0; i < 4; i++) {
      const a = decide(v, HOARDER, 7)
      expect(a.type).toBe('ask')
      if (a.type !== 'ask') return
      played.push(`${a.card}@${a.target}`)
      v = { ...v, log: [...v.log, ask(0, a.target, a.card, false)] }
      // Hands do not move, so the recogniser still holds.
      expect(containedBooks(v, buildKnowledge(v))).toEqual(['LOW-C'])
    }
    expect(new Set(played).size, 'the policy must reuse one card, not cycle').toBe(1)
  })
})

/* ------------------------------------------------- the signalling framing --- */

describe('Develin’s second framing is modelled separately and does not decide', () => {
  it('signalling zeroes the first-use price and never touches the turn-control terms', () => {
    const v = containedSpot(SPREAD)
    const k = buildKnowledge(v)
    const loud: StyleParams = { ...BALANCED, signalling: true }
    const quiet: StyleParams = { ...BALANCED, signalling: false }
    expect(firstUseInfoCost(k, loud)).toBe(0)
    expect(firstUseInfoCost(k, quiet)).toBeGreaterThan(0)
    const { ordinary } = ordinaryAsk(v, BALANCED)
    const a = planContainedPass(v, k, loud, SKILL_PRESETS.hard, ordinary)!
    const b = planContainedPass(v, k, quiet, SKILL_PRESETS.hard, ordinary)!
    expect(a.value.gain).toBe(b.value.gain)
    expect(a.value.tempo).toBe(b.value.tempo)
    // The whole information term is worth less than 1/U of a card, so on a reuse — which is
    // what the policy plays — the two are identical and turn control is doing all the work.
    expect(a.reused).toBe(true)
    expect(a.value.infoCost).toBe(0)
    expect(b.value.infoCost).toBe(0)
    expect(a.value.threshold).toBe(b.value.threshold)
  })

  it('no partner model is added: a teammate reads the ask as the ordinary public facts', () => {
    // Develin records that prearranged conventions are forbidden. Signalling through a legal
    // public ask is not one — and the line stays unblurred because nothing in the inference
    // layer knows this ask was a turn-pass. A teammate's knowledge after it is bit-for-bit the
    // knowledge it would build from any other miss on the same card by the same seat.
    const v = containedSpot(SPREAD)
    const a = decide(v, HOARDER, 7)
    if (a.type !== 'ask') throw new Error('not an ask')
    const mate: SeatView = mkView({
      seat: 2,
      hand: ['7C', 'TD', 'JD'],
      counts: SPREAD,
      turn: 0,
      log: [...v.log, ask(0, a.target, a.card, false)],
      config: us54Config,
    })
    const viaPass = buildKnowledge(mate)
    const viaOrdinary = buildKnowledge({
      ...mate,
      log: [...v.log, ask(0, a.target, '7C', false)],
    })
    expect(viaPass).toEqual(viaOrdinary)
  })
})

/* ------------------------------------------------------------ book choice --- */

describe('book choice is deterministic and prefers the free repeat', () => {
  it('picks a book whose card is already published over one that would publish a new fact', () => {
    // Seat 0 holds five of LOW-C (its `7C` already published missing) and five of HIGH-D whose
    // `AD` sits publicly on teammate seat 2 and has never been named. Both books qualify; §1.2
    // says take the free one. The single `KS` keeps an ordinary, material ask on the table so
    // the position is a real choice rather than a board of known misses.
    const v = mkView({
      seat: 0,
      hand: ['2C', '3C', '4C', '5C', '6C', '9D', 'TD', 'JD', 'QD', 'KD', 'KS'],
      counts: [11, 20, 8, 5, 8, 2],
      turn: 0,
      log: [
        gs,
        ask(0, 1, '2C', true),
        ask(0, 3, '3C', true),
        ask(0, 5, '4C', true),
        ask(0, 1, '7C', false),
        ask(0, 3, '7C', false),
        ask(0, 5, '7C', false),
        ask(2, 1, 'AD', true),
      ],
      config: us54Config,
    })
    const k = buildKnowledge(v)
    const books: BookId[] = containedBooks(v, k)
    expect(books).toEqual(['LOW-C', 'HIGH-D'])
    const p = plan(v, HOARDER)
    expect(p).not.toBeNull()
    expect(p?.card).toBe('7C')
    expect(p?.reused).toBe(true)
  })
})
