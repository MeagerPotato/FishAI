// GENERATED FILE — DO NOT EDIT.
// Copied verbatim from lib/engine/variants.ts by scripts/sync-room-engine.mjs.
// Edit the original and re-run the script; tests/room/engine-copy.test.ts enforces the match.

/**
 * Rule *effects* derived from `RulesConfig.variant` — the RULES_US54.md §6 table, which
 * pins every one of these as "derived per variant (never hardcoded anywhere)".
 *
 * Same discipline as [cards.ts](cards.ts): the table is built once, frozen, and only ever
 * read through `rulesFor(config)`. There is deliberately **no** mutable module-level
 * "active rule set" (RULES_US54.md §2.4) — two rooms running different variants at the
 * same time must not be able to corrupt each other, and a projection helper must be a
 * pure function of the config handed to it.
 */
import type { RulesConfig, Variant } from './types.ts'
import { deckFor } from './cards.ts'

/** The variant-derived rule effects. Immutable; shared per variant. */
export interface VariantRules {
  readonly variant: Variant
  /**
   * What happens to a declare whose six cards are all on the declarer's team but at least
   * one is assigned to the wrong teammate. `pagat48` voids the set — nobody scores
   * (RULES.md row 15). `us54` abolishes `void` outright: **any** error at all, opponent-held
   * or merely misassigned, awards the set to the opposing team (RULES_US54.md §1 row 14).
   * That abolition is exactly what makes the §5 clinch proof work — every resolved set is
   * awarded to exactly one team, so 9 sets cannot split 4–4.
   */
  readonly wrongDeclare: 'void' | 'opponents'
  /**
   * When a declare may be made. `pagat48`: on your own turn only (RULES.md row 11).
   * `us54`: any time, inside the declare window of RULES_US54.md §3 (row 11).
   */
  readonly declareTiming: 'ownTurn' | 'anyTime'
  /**
   * How the game ends. `pagat48`: when every set is resolved (RULES.md row 22).
   * `us54`: the instant a team has been awarded `clinchTarget` sets (RULES_US54.md row 19).
   */
  readonly winCondition: 'allResolved' | 'clinch'
  /**
   * What happens when a whole team runs out of cards. `pagat48` enters the `endgame` /
   * `awaitDesignate` cascade of RULES.md §4. `us54` needs none of that machinery
   * (RULES_US54.md §4, "Whole team out"): the team holding cards simply declares the
   * remaining sets in the ordinary window, and §5 guarantees the game ends. Those two
   * phases therefore stay reachable **only** under the 48-card default.
   */
  readonly wholeTeamOut: 'endgame' | 'declareWindow'
}

/** Built once, frozen, never reassigned — see the file header. */
const VARIANT_RULES: Readonly<Record<Variant, VariantRules>> = Object.freeze({
  pagat48: Object.freeze({
    variant: 'pagat48',
    wrongDeclare: 'void',
    declareTiming: 'ownTurn',
    winCondition: 'allResolved',
    wholeTeamOut: 'endgame',
  }),
  us54: Object.freeze({
    variant: 'us54',
    wrongDeclare: 'opponents',
    declareTiming: 'anyTime',
    winCondition: 'clinch',
    wholeTeamOut: 'declareWindow',
  }),
})

/**
 * The rule effects of a config. Total by the same argument as `deckFor`: omitting the config,
 * or passing one carrying a variant this build does not know, yields the `pagat48` rules
 * rather than throwing. An unknown variant is caught once, loudly, by `validateConfig` at
 * game construction.
 *
 * Own-property lookup, for the same reason `deckFor` uses one: `VARIANT_RULES` is a plain
 * object, so `VARIANT_RULES[variant]` resolved inherited keys through `Object.prototype` —
 * `rulesFor({ ...defaultConfig, variant: 'constructor' })` returned the `Object` constructor,
 * whose `.wrongDeclare` is `undefined` rather than `'void'`, which would have silently voided
 * nothing and awarded nothing. An unrecognised variant must degrade to `pagat48` exactly like
 * an absent one.
 */
export function rulesFor(config?: RulesConfig): VariantRules {
  const v: string = config?.variant ?? ''
  return Object.prototype.hasOwnProperty.call(VARIANT_RULES, v) ? VARIANT_RULES[v as Variant] : VARIANT_RULES.pagat48
}

/**
 * Sets one team must be **awarded** for the game to end immediately (RULES_US54.md §1 row 19,
 * §5). Derived from the set list, never a literal: `floor(nBooks / 2) + 1`, so 5 of the 9
 * `us54` sets.
 *
 * The proof that this cannot hang, from §5: row 14 abolishes `void`, so every resolved set
 * goes to exactly one team; if neither team reached 5 then both hold ≤ 4, totalling ≤ 8 < 9 —
 * contradiction. A clinch is guaranteed and a tie impossible.
 *
 * Meaningful only when `rulesFor(config).winCondition === 'clinch'`; under `pagat48` the game
 * ends on `allResolved` and this number is never consulted.
 */
export function clinchTarget(config?: RulesConfig): number {
  return Math.floor(deckFor(config).books.length / 2) + 1
}
