import { describe, expect, it } from 'vitest'
import {
  ALL_BOOKS,
  ALL_CARDS,
  allBooks,
  allCards,
  bookCards,
  cardBook,
  cardCompare,
  cardComparator,
  deckFor,
  dealHands,
  defaultConfig,
  handSize,
  isCard,
  newGame,
  reduce,
  rulesFor,
  sortHand,
  us54Config,
  validateConfig,
} from '../../lib/engine/index.ts'
import type { Card, GameState, RulesConfig, Seat } from '../../lib/engine/index.ts'

/**
 * RULES_US54.md §7 vectors 1 and 3, plus the §2.4 non-negotiable: making the deck
 * config-derived must not move a single card of the 48-card default.
 */

/**
 * Golden deals recorded from the pre-variant engine (`dealHands(seed)` at the commit before
 * deck construction became config-derived). RULES_US54.md §2.4: every previously recorded
 * seed must keep meaning exactly what it meant, or `tests/engine/deal.test.ts` and every
 * stored room seed silently change games.
 */
const PAGAT48_GOLDEN: Record<string, string[][]> = {
  'deal-seed': [
    ['QD', 'KD', 'JH', 'KH', '4S', '6S', 'JS', 'AS'],
    ['2C', '5C', 'KC', '6D', 'TD', '3H', '6H', 'AH'],
    ['3C', '7C', 'TC', '2D', 'JD', 'TH', '5S', 'TS'],
    ['6C', '9C', 'QC', 'AC', '9D', 'AD', '9H', '3S'],
    ['4D', '2H', '4H', '5H', '7H', '2S', '9S', 'KS'],
    ['4C', 'JC', '3D', '5D', '7D', 'QH', '7S', 'QS'],
  ],
  'seed-x': [
    ['3C', 'KC', 'AC', '3H', '6H', '3S', '4S', 'TS'],
    ['6C', 'TC', 'QC', 'TD', '2H', '9H', 'JH', 'KH'],
    ['4C', '9D', 'JD', '7H', 'TH', 'AH', '9S', 'JS'],
    ['2C', '5C', '7C', '5H', '5S', '6S', 'QS', 'KS'],
    ['9C', '4D', '5D', '6D', 'KD', '4H', '2S', '7S'],
    ['JC', '2D', '3D', '7D', 'QD', 'AD', 'QH', 'AS'],
  ],
  'det-seed': [
    ['6C', '9C', '5D', '6D', '7D', '4H', '7H', '7S'],
    ['5C', 'QC', 'AC', '9D', '6H', '2S', '5S', '6S'],
    ['2C', '2D', 'QD', '3H', '9H', '3S', 'TS', 'KS'],
    ['4C', '7C', 'TD', 'JD', 'KD', '5H', 'KH', 'JS'],
    ['3C', 'TC', 'JC', '3D', 'JH', 'AH', '4S', '9S'],
    ['KC', '4D', 'AD', '2H', 'TH', 'QH', 'QS', 'AS'],
  ],
  'learn-2026': [
    ['2C', '3C', 'JC', 'AC', '3D', 'JD', '2H', 'TH'],
    ['6C', '4D', '6D', '3H', '5H', 'JH', 'KH', '7S'],
    ['4C', '5C', '5D', 'KD', '4H', '9H', '2S', '3S'],
    ['7C', '9C', 'TC', 'QC', '9D', '7H', '4S', 'AS'],
    ['TD', 'QD', '6H', '6S', '9S', 'TS', 'JS', 'QS'],
    ['KC', '2D', '7D', 'AD', 'QH', 'AH', '5S', 'KS'],
  ],
  alpha: [
    ['KC', 'AC', '6H', '7H', '4S', '6S', 'TS', 'AS'],
    ['3C', '2D', 'QD', 'KH', '3S', '5S', '9S', 'KS'],
    ['5C', '7C', '4D', '9D', 'TD', 'JD', 'AD', '3H'],
    ['9C', 'TC', '3D', '6D', 'KD', 'TH', 'JH', 'QS'],
    ['2C', '7D', '2H', '5H', '9H', '2S', '7S', 'JS'],
    ['4C', '6C', 'JC', 'QC', '5D', '4H', 'QH', 'AH'],
  ],
  'room-42': [
    ['JC', '7D', 'AD', 'TH', 'JH', 'AH', '3S', 'KS'],
    ['TC', 'KC', '9D', '7H', 'KH', '4S', '5S', '7S'],
    ['7C', 'QC', 'AC', '3D', 'QD', '6H', '2S', 'TS'],
    ['2C', '6C', '4D', '3H', '4H', '5H', '6S', 'JS'],
    ['3C', '4C', '5D', '6D', 'TD', '2H', '9H', '9S'],
    ['5C', '9C', '2D', 'JD', 'KD', 'QH', 'QS', 'AS'],
  ],
}

/** A us54 state with hand-picked hands; conserves the whole 54-card deck. */
function us54State(hands: Card[][], turn: Seat): GameState {
  return {
    config: us54Config,
    seed: 'us54-crafted',
    phase: 'playing',
    turn,
    hands: hands.map((h) => sortHand(h, us54Config)),
    books: {},
    score: [0, 0],
    log: [{ type: 'game_started', startingSeat: turn }],
    moveIndex: 0,
  }
}

describe('pagat48 deck is untouched by config-derived construction (RULES_US54.md §2.4)', () => {
  it('deals byte-identically to the recorded baseline for every golden seed', () => {
    for (const [seed, golden] of Object.entries(PAGAT48_GOLDEN)) {
      expect(dealHands(seed), seed).toEqual(golden)
      // The zero-argument overload and an explicit pagat48 config must agree exactly.
      expect(JSON.stringify(dealHands(seed, defaultConfig)), seed).toBe(JSON.stringify(golden))
      expect(JSON.stringify(newGame(seed).hands), seed).toBe(JSON.stringify(golden))
    }
  })

  it('keeps 48 cards in 8 books of 6, with no 8s and no jokers', () => {
    expect(allCards(defaultConfig)).toEqual([...ALL_CARDS])
    expect(allBooks(defaultConfig)).toEqual([...ALL_BOOKS])
    expect(ALL_CARDS).toHaveLength(48)
    expect(ALL_BOOKS).toHaveLength(8)
    expect(handSize(defaultConfig)).toBe(8)
    expect(ALL_CARDS.some((c) => c.startsWith('8') || c.startsWith('X'))).toBe(false)
    expect(ALL_BOOKS.includes('EIGHTS')).toBe(false)
    // EIGHTS is not a set this rule set defines, so it has no cards and cannot be claimed.
    expect(bookCards('EIGHTS')).toEqual([])
    expect(bookCards('EIGHTS', defaultConfig)).toEqual([])
    expect(isCard('8H')).toBe(false)
    expect(isCard('XR')).toBe(false)
  })
})

describe('us54 deck (RULES_US54.md §1 rows 2-4, §2)', () => {
  const deck = deckFor(us54Config)

  it('deals 6 hands of 9 whose union is exactly the 54 cards', () => {
    const hands = dealHands('us54-seed', us54Config)
    expect(hands).toHaveLength(6)
    for (const h of hands) {
      expect(h).toHaveLength(9)
      // Canonically sorted, jokers last (§2.3).
      expect([...h].sort(cardComparator(us54Config))).toEqual(h)
    }
    const all = hands.flat()
    expect(all).toHaveLength(54)
    expect(new Set(all).size).toBe(54)
    expect([...all].sort(cardComparator(us54Config))).toEqual([...deck.cards])
    expect(handSize(us54Config)).toBe(9)
  })

  it('is the 52 suited cards plus XR and XB, jokers sorting last (§2.1, §2.3)', () => {
    expect(deck.cards).toHaveLength(54)
    expect(deck.cards.slice(0, 52).every((c) => c.length === 2 && !c.startsWith('X'))).toBe(true)
    expect(deck.cards.slice(52)).toEqual(['XR', 'XB'])
    expect(deck.cards.filter((c) => c.startsWith('8'))).toEqual(['8C', '8D', '8H', '8S'])
    // sortHand must agree: a joker never sorts before a suited card.
    expect(sortHand(['XB', 'AS', 'XR', '2C', '8H'], us54Config)).toEqual(['2C', '8H', 'AS', 'XR', 'XB'])
  })

  it('has 9 books of 6, EIGHTS being 8C,8D,8H,8S,XR,XB (§1 row 3, §2.3)', () => {
    const books = allBooks(us54Config)
    expect(books).toHaveLength(9)
    expect(books[8]).toBe('EIGHTS')
    expect(bookCards('EIGHTS', us54Config)).toEqual(['8C', '8D', '8H', '8S', 'XR', 'XB'])
    for (const b of books) expect(bookCards(b, us54Config)).toHaveLength(6)
    const union = books.flatMap((b) => bookCards(b, us54Config))
    expect(union).toHaveLength(54)
    expect(new Set(union).size).toBe(54)
    for (const b of books) for (const c of bookCards(b, us54Config)) expect(cardBook(c)).toBe(b)
  })

  it('newGame(us54) deals 9 to every seat', () => {
    const g = newGame('us54-newgame', us54Config)
    expect(g.hands.map((h) => h.length)).toEqual([9, 9, 9, 9, 9, 9])
    expect(g.hands.flat()).toHaveLength(54)
  })
})

describe('cardBook tests EIGHTS before the LOW/HIGH split (RULES_US54.md §2.2, §7 vector 3)', () => {
  it('buckets 8s and jokers into EIGHTS, everything else by half-suit', () => {
    // The bug this replaces: cardBook('8H') used to fall through to 'HIGH-H'.
    expect(cardBook('8H')).toBe('EIGHTS')
    expect(cardBook('8C')).toBe('EIGHTS')
    expect(cardBook('XR')).toBe('EIGHTS')
    expect(cardBook('XB')).toBe('EIGHTS')
    expect(cardBook('9H')).toBe('HIGH-H')
    expect(cardBook('7H')).toBe('LOW-H')
  })
})

describe('deck data is per-config, never a mutable module-level rule set (§2.4)', () => {
  it('gives every config of a variant the same frozen deck, and never mixes variants', () => {
    const other: RulesConfig = { ...us54Config, toggles: { ...us54Config.toggles, strictMemory: true } }
    expect(deckFor(us54Config)).toBe(deckFor(other))
    expect(deckFor(defaultConfig)).toBe(deckFor(undefined))
    expect(deckFor(defaultConfig)).not.toBe(deckFor(us54Config))
    // Interleaving lookups the way two concurrent rooms would must not disturb either deck.
    expect(allCards(us54Config)).toHaveLength(54)
    expect(allCards(defaultConfig)).toHaveLength(48)
    expect(allCards(us54Config)).toHaveLength(54)
    expect(allCards(defaultConfig)).toHaveLength(48)
  })

  it('is total: an unknown variant falls back to the default deck instead of throwing', () => {
    const bogus = { ...defaultConfig, variant: 'lit52' as RulesConfig['variant'] }
    expect(deckFor(bogus)).toBe(deckFor(defaultConfig))
    expect(() => isCard('2C', bogus)).not.toThrow()
  })
})

describe('the reducer reads the deck from state.config', () => {
  /** Seat 0 holds only XB; the rest of the 54 is spread over seats 1-5. */
  function eightsHands(): Card[][] {
    const rest = deckFor(us54Config).cards.filter((c) => c !== 'XB')
    const hands: Card[][] = [['XB'], [], [], [], [], []]
    // 8C to seat 1 (an opponent of seat 0) so the ask below can hit.
    hands[1].push('8C')
    rest.filter((c) => c !== '8C').forEach((c, i) => hands[1 + (i % 5)].push(c))
    return hands
  }

  it('licenses an EIGHTS ask from a joker alone (§1 row 6, §7 vector 2)', () => {
    const s = us54State(eightsHands(), 0)
    const r = reduce(s, { type: 'ask', seat: 0, target: 1, card: '8C' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.state.hands[0]).toEqual(['8C', 'XB'])
  })

  it('refuses an EIGHTS ask from a seat holding no 8 and no joker', () => {
    const hands = eightsHands()
    // Seat 2 is on seat 0's team; move it to the turn and strip its EIGHTS cards to seat 4.
    const eights = new Set<Card>(bookCards('EIGHTS', us54Config))
    hands[4].push(...hands[2].filter((c) => eights.has(c)))
    hands[2] = hands[2].filter((c) => !eights.has(c))
    const r = reduce(us54State(hands, 2), { type: 'ask', seat: 2, target: 1, card: '8C' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NO_CARD_OF_BOOK')
  })

  it('accepts 8s and jokers as real cards under us54 and rejects them under pagat48', () => {
    const bad = reduce(newGame('invalid-card-48'), { type: 'ask', seat: 0, target: 1, card: 'XR' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.error.code).toBe('INVALID_CARD')
      expect(bad.error.message).toContain('48 cards')
    }
    const alsoBad = reduce(us54State(eightsHands(), 0), { type: 'ask', seat: 0, target: 1, card: 'ZZ' as Card })
    expect(alsoBad.ok).toBe(false)
    if (!alsoBad.ok) expect(alsoBad.error.message).toContain('54 cards')
  })
})

describe('config validation (RULES_US54.md §5 safety requirement 1, §6)', () => {
  it('accepts both shipped rule sets', () => {
    expect(validateConfig(defaultConfig)).toEqual([])
    expect(validateConfig(us54Config)).toEqual([])
  })

  it('rejects highBooksDouble combined with us54', () => {
    const bad: RulesConfig = { ...us54Config, toggles: { ...us54Config.toggles, highBooksDouble: true } }
    expect(validateConfig(bad)).toHaveLength(1)
    expect(validateConfig(bad)[0]).toContain('highBooksDouble')
    // …but the toggle stays legal on the 48-card default, which scores by points.
    expect(validateConfig({ ...defaultConfig, toggles: { ...defaultConfig.toggles, highBooksDouble: true } })).toEqual(
      [],
    )
  })

  it('rejects the legacy jokers toggle on either variant — it is superseded by variant', () => {
    for (const base of [defaultConfig, us54Config]) {
      const bad: RulesConfig = { ...base, toggles: { ...base.toggles, jokers: true } }
      expect(validateConfig(bad).some((m) => m.includes('jokers'))).toBe(true)
    }
  })

  it('rejects rankQuartet combined with us54', () => {
    const bad: RulesConfig = { ...us54Config, toggles: { ...us54Config.toggles, rankQuartet: true } }
    expect(validateConfig(bad).some((m) => m.includes('rankQuartet'))).toBe(true)
  })

  it('rejects an unknown variant and a non-6 player count', () => {
    expect(validateConfig({ ...defaultConfig, variant: 'lit52' as RulesConfig['variant'] })).toHaveLength(1)
    expect(validateConfig({ ...defaultConfig, playerCount: 8 as RulesConfig['playerCount'] })).toHaveLength(1)
  })

  it('newGame throws rather than starting an incoherent game', () => {
    const bad: RulesConfig = { ...us54Config, toggles: { ...us54Config.toggles, highBooksDouble: true } }
    expect(() => newGame('nope', bad)).toThrow(/invalid RulesConfig/)
    expect(() => newGame('fine', us54Config)).not.toThrow()
  })
})

/* -------------------------------------------- variant lookups are total --- */

/**
 * `deckFor` and `rulesFor` index a plain frozen object with a `variant` that may have come
 * from the wire or from storage, so the lookup has to be own-property only. Before this was
 * fixed, `variant: 'constructor'` resolved through `Object.prototype` and handed back the
 * `Object` constructor: `deckFor(...).cards.length` threw `TypeError`, and `rulesFor(...)`
 * reported `wrongDeclare === undefined` instead of `'void'` — a silently *different rule set*.
 */
describe('deckFor/rulesFor never resolve a variant through Object.prototype', () => {
  const PROTO_KEYS = ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty', 'isPrototypeOf'] as const

  for (const key of PROTO_KEYS) {
    it(`treats variant '${key}' as unknown and degrades to pagat48`, () => {
      const evil = { ...defaultConfig, variant: key as unknown as RulesConfig['variant'] }
      // Identity, not just shape: it must be the very same frozen default deck/rule record.
      expect(deckFor(evil)).toBe(deckFor(defaultConfig))
      expect(rulesFor(evil)).toBe(rulesFor(defaultConfig))
      // The concrete symptoms the bug produced.
      expect(deckFor(evil).cards.length).toBe(48)
      expect(rulesFor(evil).wrongDeclare).toBe('void')
      expect(rulesFor(evil).winCondition).toBe('allResolved')
      // Every projection built on them stays total and 48-card.
      expect(allBooks(evil)).toHaveLength(8)
      expect(handSize(evil)).toBe(8)
      expect(isCard('8H', evil)).toBe(false)
      expect(isCard('2C', evil)).toBe(true)
      // …and it is still rejected loudly at construction, exactly like any unknown variant.
      expect(validateConfig(evil)).toHaveLength(1)
      expect(() => newGame('proto', evil)).toThrow(/invalid RulesConfig/)
    })
  }

  it('still resolves the two real variants', () => {
    expect(deckFor(us54Config).cards).toHaveLength(54)
    expect(rulesFor(us54Config).wrongDeclare).toBe('opponents')
  })
})

/* ------------------------------- newGame accepts a variant-less config --- */

/**
 * `variant` post-dates the original `RulesConfig`, so any config serialized before it — a
 * persisted room, a saved drill — is `{ playerCount, toggles }` with no `variant` key. Every
 * projection helper already degrades such a config to `pagat48`; `newGame` used to be the one
 * outlier that threw `TypeError`, which would have broken every pre-deploy room on read-back.
 */
describe('newGame normalizes an absent variant to pagat48', () => {
  /** Exactly the shape the pre-variant engine's callers passed. */
  const legacyConfig = { playerCount: 6, toggles: { ...defaultConfig.toggles } } as unknown as RulesConfig

  it('starts, and starts the identical 48-card game the explicit default starts', () => {
    expect(() => newGame('legacy-cfg', legacyConfig)).not.toThrow()
    const g = newGame('legacy-cfg', legacyConfig)
    expect(g.config.variant).toBe('pagat48')
    expect(g.hands.map((h) => h.length)).toEqual([8, 8, 8, 8, 8, 8])
    // Same deal, same shape, same everything as the explicit config for the same seed.
    expect(g.hands).toEqual(newGame('legacy-cfg').hands)
    expect(Object.keys(g)).not.toContain('declareWindow')
  })

  it('normalizes null and empty-string variants too, but never mutates the caller object', () => {
    for (const raw of [undefined, null, '']) {
      const cfg = { ...defaultConfig, variant: raw as unknown as RulesConfig['variant'] }
      expect(newGame('legacy-raw', cfg).config.variant).toBe('pagat48')
      expect(cfg.variant).toBe(raw) // normalization copies; the caller's object is untouched
    }
  })

  it('keeps the config object identity when the variant is already present', () => {
    // RULES_US54.md §2.4: a default game's state must be what it always was, object included.
    expect(newGame('identity', defaultConfig).config).toBe(defaultConfig)
    expect(newGame('identity').config).toBe(defaultConfig)
    expect(newGame('identity', us54Config).config).toBe(us54Config)
  })

  it('still throws on an unknown non-empty variant and on incoherent combinations', () => {
    expect(() => newGame('x', { ...defaultConfig, variant: 'lit52' as RulesConfig['variant'] })).toThrow(
      /invalid RulesConfig/,
    )
    expect(() => newGame('x', { ...defaultConfig, variant: 'constructor' as RulesConfig['variant'] })).toThrow(
      /invalid RulesConfig/,
    )
    expect(() =>
      newGame('x', { ...us54Config, toggles: { ...us54Config.toggles, highBooksDouble: true } }),
    ).toThrow(/highBooksDouble/)
    expect(() =>
      newGame('x', { ...us54Config, toggles: { ...us54Config.toggles, rankQuartet: true } }),
    ).toThrow(/rankQuartet/)
    expect(() => newGame('x', { ...defaultConfig, playerCount: 8 as RulesConfig['playerCount'] })).toThrow(
      /playerCount/,
    )
    // A legacy config still has to be coherent in every other respect.
    const legacyWithJokers = { playerCount: 6, toggles: { ...defaultConfig.toggles, jokers: true } }
    expect(() => newGame('x', legacyWithJokers as unknown as RulesConfig)).toThrow(/jokers/)
  })
})

/* ---------------------------------- comparators cannot take a stray config --- */

/**
 * `cardCompare` used to carry an optional third positional `config`. `Array.prototype.sort`
 * never fills that slot, but `.sort(fn)`/`.map(fn)` idioms happily fill it with garbage, and
 * the `?? -1` fallback then beat every real index — so `[...deckFor(us54Config).cards].sort(cardCompare)`
 * sorted all four 8s and both jokers to the FRONT. The parameter is gone: a variant-aware sort
 * must go through the `cardComparator(config)` factory, whose result has no third slot at all.
 */
describe('cardComparator is the only variant-aware sort (no positional config)', () => {
  it('exposes a strictly two-argument default comparator', () => {
    expect(cardCompare.length).toBe(2)
    expect(cardComparator(us54Config).length).toBe(2)
    expect([...ALL_CARDS].sort(cardCompare)).toEqual([...ALL_CARDS])
  })

  it('sorts the 54-card deck canonically, jokers last', () => {
    const shuffled = [...deckFor(us54Config).cards].reverse()
    expect(shuffled.sort(cardComparator(us54Config))).toEqual([...deckFor(us54Config).cards])
    const messy: Card[] = ['XB', 'AS', 'XR', '2C', '8H']
    expect([...messy].sort(cardComparator(us54Config))).toEqual(['2C', '8H', 'AS', 'XR', 'XB'])
    expect(sortHand(messy, us54Config)).toEqual(['2C', '8H', 'AS', 'XR', 'XB'])
  })

  it('the pagat48 comparator is documented as pagat48-only and agrees with sortHand()', () => {
    // The bug's fingerprint: cards outside the pagat48 deck all score -1 and bunch at the
    // front. That is still true of `cardCompare` — it is now *labelled* pagat48, and the
    // point of the fix is that no config can be smuggled in to make it look otherwise.
    const messy: Card[] = ['XB', 'AS', 'XR', '2C', '8H']
    expect([...messy].sort(cardCompare)).toEqual(sortHand(messy))
  })
})
