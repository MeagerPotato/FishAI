/**
 * Card and set data + pure helpers. RULES.md rows 1-3 (the 48-card `pagat48` default)
 * and RULES_US54.md §2 (the 54-card `us54` variant).
 *
 * Deck data is **derived from the config that is passed in**, never from a mutable
 * module-level "active rule set" (RULES_US54.md §2.4): two rooms running different
 * variants at the same time must not be able to corrupt each other. The per-variant
 * decks are therefore built once, up front, into a frozen lookup table that nothing
 * ever writes to — a memo table by construction rather than a cache that mutates.
 */
import type { BookId, Card, Half, Rank, RulesConfig, Seat, Suit, Team, Variant } from './types.ts'

export const SUITS: readonly Suit[] = ['C', 'D', 'H', 'S']
/** The 12 `pagat48` ranks — a standard deck minus the 8s (RULES.md row 2). */
export const RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '9', 'T', 'J', 'Q', 'K', 'A']
/** All 13 suited ranks, 8 included — the `us54` suited deck (RULES_US54.md §1 row 2). */
export const RANKS_WITH_EIGHT: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
export const LOW_RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7']
export const HIGH_RANKS: readonly Rank[] = ['9', 'T', 'J', 'Q', 'K', 'A']
/** The two distinguishable jokers, red then black (RULES_US54.md §2.1). */
export const JOKERS: readonly Card[] = ['XR', 'XB']
/** The `us54`-only ninth set: the four 8s and both jokers (RULES_US54.md §1 row 3). */
export const EIGHTS: BookId = 'EIGHTS'

/** Everything the engine derives from a rule set's deck. Immutable; shared per variant. */
export interface Deck {
  readonly variant: Variant
  /** The deck in canonical order — 48 for `pagat48`, 54 for `us54`. */
  readonly cards: readonly Card[]
  /** The set list — 8 for `pagat48`, 9 for `us54`. Every set holds exactly 6 cards. */
  readonly books: readonly BookId[]
  /** set -> its six cards, in canonical order. */
  readonly bookCards: ReadonlyMap<BookId, readonly Card[]>
  /** Membership test backing `isCard`. */
  readonly cardSet: ReadonlySet<string>
  /** card -> canonical index, backing `cardCompare`/`sortHand`. */
  readonly order: ReadonlyMap<Card, number>
  /** Cards dealt to each of the six seats: `cards.length / 6` (8 or 9). */
  readonly handSize: number
}

function buildDeck(variant: Variant): Deck {
  // Canonical order is suit-major (C, D, H, S), then rank. `us54` slots the 8 into its
  // natural rank position and appends both jokers **after all 52 suited cards**, so that
  // sortHand yields a stable, deterministic hand for a joker holder (RULES_US54.md §2.3).
  const ranks = variant === 'us54' ? RANKS_WITH_EIGHT : RANKS
  const suited: Card[] = SUITS.flatMap((s) => ranks.map((r): Card => `${r}${s}`))
  const cards: readonly Card[] = variant === 'us54' ? [...suited, ...JOKERS] : suited

  const halfBooks: BookId[] = (['LOW', 'HIGH'] as const).flatMap((h) =>
    SUITS.map((s): BookId => `${h}-${s}`),
  )
  const books: readonly BookId[] = variant === 'us54' ? [...halfBooks, EIGHTS] : halfBooks

  const bookCardMap = new Map<BookId, readonly Card[]>(
    books.map((b) => {
      // EIGHTS order is fixed by RULES_US54.md §2.3: 8C, 8D, 8H, 8S, XR, XB.
      if (b === EIGHTS) return [b, [...SUITS.map((s): Card => `8${s}`), ...JOKERS]]
      const half = b.startsWith('LOW') ? LOW_RANKS : HIGH_RANKS
      const suit = b.slice(-1) as Suit
      return [b, half.map((r): Card => `${r}${suit}`)]
    }),
  )

  return {
    variant,
    cards,
    books,
    bookCards: bookCardMap,
    cardSet: new Set(cards),
    order: new Map(cards.map((c, i) => [c, i])),
    handSize: cards.length / 6,
  }
}

/**
 * The per-variant decks, built once. Frozen and never reassigned — `deckFor` only ever
 * reads from it, so concurrent games on different configs are fully isolated.
 */
const DECKS: Readonly<Record<Variant, Deck>> = Object.freeze({
  pagat48: buildDeck('pagat48'),
  us54: buildDeck('us54'),
})

/**
 * The deck derived from a config. Omitting the config (or passing one without a variant,
 * e.g. an older persisted room, or a config that arrived over the wire carrying a variant
 * this build does not know) yields the 48-card `pagat48` deck, which keeps the ~30 existing
 * default-deck call sites working unchanged. These helpers are total by design — a bad
 * variant is caught once, loudly, by `validateConfig` at game construction, not by throwing
 * from deep inside a projection.
 *
 * The lookup is **own-property only**. `DECKS` is a plain object, so a plain `DECKS[variant]`
 * resolves inherited keys through `Object.prototype`: a config carrying
 * `variant: 'constructor'` returned the `Object` constructor as a `Deck` (and
 * `deckFor(...).cards.length` threw `TypeError`), and `'toString'` / `'valueOf'` /
 * `'hasOwnProperty'` returned functions. A `RulesConfig` can arrive over the wire or out of
 * storage as untrusted data, so an unrecognised variant — inherited key or not — must degrade
 * to `pagat48` exactly like an absent one, and never to a prototype member.
 */
export function deckFor(config?: RulesConfig): Deck {
  const v: string = config?.variant ?? ''
  return Object.prototype.hasOwnProperty.call(DECKS, v) ? DECKS[v as Variant] : DECKS.pagat48
}

/** The deck for a config, in canonical order (RULES.md row 2 / RULES_US54.md §1 row 2). */
export function allCards(config?: RulesConfig): readonly Card[] {
  return deckFor(config).cards
}

/** The set list for a config: 8 half-suits, plus EIGHTS under `us54` (RULES_US54.md §1 row 3). */
export function allBooks(config?: RulesConfig): readonly BookId[] {
  return deckFor(config).books
}

/** Cards dealt to each seat under a config: 8 for `pagat48`, 9 for `us54` (RULES_US54.md §1 row 4). */
export function handSize(config?: RulesConfig): number {
  return deckFor(config).handSize
}

/** All 48 cards in canonical order: suit-major (C, D, H, S), then rank (2..7, 9..A). */
export const ALL_CARDS: readonly Card[] = DECKS.pagat48.cards

/** All 8 books: LOW-C..LOW-S then HIGH-C..HIGH-S. */
export const ALL_BOOKS: readonly BookId[] = DECKS.pagat48.books

/** Runtime guard: is this string a real card of the config's deck? */
export function isCard(x: string, config?: RulesConfig): x is Card {
  return deckFor(config).cardSet.has(x)
}

/**
 * The set a card belongs to. RULES_US54.md §2.2 pins the branch order: EIGHTS is tested
 * **before** the LOW/HIGH split, because `LOW_RANKS.includes('8')` is false and an 8 would
 * otherwise fall through and mis-bucket as `HIGH-<suit>` (the bug this replaces:
 * `cardBook('8H')` used to return `'HIGH-H'`).
 *
 * Deliberately config-free: the classification is variant-independent. Neither an 8 nor a
 * joker is in the `pagat48` deck, so the EIGHTS branch is unreachable for any card that
 * `isCard(c, pagat48)` accepts — a config parameter here would never change an answer.
 */
export function cardBook(c: Card): BookId {
  if (c === 'XR' || c === 'XB') return EIGHTS
  if (c[0] === '8') return EIGHTS
  const half: Half = LOW_RANKS.includes(c[0] as Rank) ? 'LOW' : 'HIGH'
  return `${half}-${c[1] as Suit}`
}

/**
 * The six cards of a set, in canonical rank order. Ids that the config's rule set does not
 * define yield [] — so `bookCards('EIGHTS')` is [] under `pagat48`, as it must be.
 */
export function bookCards(b: BookId, config?: RulesConfig): readonly Card[] {
  return deckFor(config).bookCards.get(b) ?? []
}

/**
 * A canonical comparator over one rule set's deck: suit-major, then rank, jokers last
 * (RULES_US54.md §2.3). The config is captured in the closure, so what comes back takes
 * **exactly two arguments** and is safe to hand to `Array.prototype.sort`.
 *
 * This is a factory rather than a `cardCompare(a, b, config)` overload on purpose. A
 * comparator's third positional slot is one `Array.prototype.sort` never fills but that the
 * `.sort(fn)` / `.map(fn)` idioms fill with whatever they please, so a trailing optional
 * `config` is a silent-wrong-answer waiting to happen: `[...deckFor(us54Config).cards].sort(cardCompare)`
 * sorted every 8 and both jokers to the FRONT, because the `pagat48` order map has no entry
 * for them and the `?? -1` fallback then beats every real index. Curried, the mistake is not
 * expressible — the returned function has no third parameter to hijack.
 */
export function cardComparator(config?: RulesConfig): (a: Card, b: Card) => number {
  const order = deckFor(config).order
  return (a, b) => (order.get(a) ?? -1) - (order.get(b) ?? -1)
}

/**
 * Canonical comparison over the 48-card `pagat48` deck: suit-major, then rank. Deliberately
 * arity-2 and config-free — `.sort(cardCompare)` is exactly what it says, and a `us54` sort
 * must go through `cardComparator(config)` (or `sortHand`), which cannot silently fall back.
 */
export const cardCompare: (a: Card, b: Card) => number = cardComparator()

/**
 * Return a new array of the hand in the canonical sorted order of the config's deck.
 *
 * Unlike a comparator this is safe to leave config-positional: `.map(sortHand)` does not
 * compile, because `.map` would pass the element index where `RulesConfig` is required.
 */
export function sortHand(hand: readonly Card[], config?: RulesConfig): Card[] {
  return [...hand].sort(cardComparator(config))
}

/** Teams alternate by seat: 0,2,4 = team 0; 1,3,5 = team 1 (RULES.md row 1). */
export function seatTeam(s: Seat): Team {
  return (s % 2) as Team
}

export const ALL_SEATS: readonly Seat[] = [0, 1, 2, 3, 4, 5]

/** The three seats of a team, ascending. */
export function teamSeats(t: Team): readonly Seat[] {
  return t === 0 ? [0, 2, 4] : [1, 3, 5]
}
