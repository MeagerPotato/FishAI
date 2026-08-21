/**
 * Seeded shuffle + deal. RULES.md row 4 (48 dealt, 8 per player) and RULES_US54.md §1 row 4
 * (54 dealt, 9 per player). Both are the same round-robin: 48/6 = 8, 54/6 = 9.
 */
import type { Card, RulesConfig } from './types.ts'
import { deckFor, sortHand } from './cards.ts'
import { randInt, rngFromSeed } from './rng.ts'

/** Fisher-Yates shuffle (new array; input untouched). */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1)
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

/**
 * Deal the config's whole deck round-robin into 6 equal hands, each canonically sorted.
 * Deterministic: same seed (and config) => byte-identical hands. Omitting the config deals
 * the 48-card default, byte-identical to every previously recorded seed (RULES_US54.md §2.4).
 */
export function dealHands(seed: string, config?: RulesConfig): Card[][] {
  const deck = shuffle(deckFor(config).cards, rngFromSeed(seed))
  const hands: Card[][] = [[], [], [], [], [], []]
  deck.forEach((c, i) => hands[i % 6].push(c))
  return hands.map((h) => sortHand(h, config))
}
