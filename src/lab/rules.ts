/**
 * The rule-set guard — SITE_SPEC.md §1.1.
 *
 * > Every results page must state its rule set, stamped from `meta.rulesHash`, and the site must
 * > refuse to render (with a clear message, not a blank page) if the hash does not match the
 * > shipped `RULES_US54.md`.
 *
 * The shipped document is imported with `?raw` and hashed **in the browser**, with the same
 * `rulesHash()` the emitter uses. That is the point: a constant baked in at build time would
 * only prove that the number in the artifact matches a number someone typed, whereas hashing the
 * real bytes proves the results describe the rules this build actually ships. `sha256.ts` exists
 * precisely so the check can run on both sides of the contract — no `node:crypto`, no platform
 * import, ~40 lines of arithmetic with a NIST vector under it.
 *
 * The cost is ~19 kB of markdown inlined into the lazily-loaded lab chunk. `/` and `/r/:code`
 * never load it.
 */

import { rulesHash } from '../../lib/lab/analysis/index.ts'
import RULES_US54_TEXT from '../../RULES_US54.md?raw'

/** SHA-256 of the shipped `RULES_US54.md`, computed at module load from the file's own bytes. */
export const SHIPPED_RULES_HASH: string = rulesHash(RULES_US54_TEXT)

export const RULES_FILE = 'RULES_US54.md'

export interface RulesCheck {
  ok: boolean
  /** What the artifact claims it was produced under. */
  stamped: string
  /** What the shipped document actually hashes to. */
  shipped: string
  file: string
}

export function checkRules(stamped: string, file: string): RulesCheck {
  return { ok: stamped === SHIPPED_RULES_HASH, stamped, shipped: SHIPPED_RULES_HASH, file }
}

/** First 12 hex characters — enough to read aloud, short enough to sit in a micro-label. */
export function shortHash(hash: string): string {
  return hash.length <= 12 ? hash : hash.slice(0, 12)
}

/**
 * The two `us54` facts SITE_SPEC.md §5 requires the site to *state*, not assume. Both are
 * rendered as prose on every results page rather than being encoded only in an assertion,
 * because a reader comparing this matrix against a `pagat48` one needs to be told why they
 * cannot.
 */
export const US54_FACTS = [
  {
    id: 'ties',
    head: 'Ties are impossible — there is no tie column, and there never can be',
    body:
      'There are 9 sets and row 14 abolishes the void, so every resolved set is awarded to ' +
      'exactly one team. If neither team reached 5 both hold at most 4, totalling at most 8 — ' +
      'fewer than 9. Contradiction. A clinch is therefore guaranteed and a draw is ' +
      'arithmetically impossible (RULES_US54.md §5). The ties field is retained in the schema ' +
      'so the shape stays stable across variants, and this site asserts it is 0 at the ' +
      'boundary rather than rendering a column that can never populate. Note what that does to ' +
      'the primary outcome: score rate is normally a win/tie/loss mean, and under pagat48 about ' +
      'a quarter of games tie. Here the tie arm is dead, so score rate is a win rate.',
  },
  {
    id: 'concede',
    head: 'Concede rate replaced void rate — a different event, not a new name',
    body:
      'Under RULES.md a wrong claim voided the set: nobody scored it, and the metric that ' +
      'counted those was voidRate, a burn rate. Under RULES_US54.md row 14 any error at all ' +
      'awards the set to the opposing team, so the event being counted is a gift, and the ' +
      'metric is concedeRate. The two are not the same number under a new name and they are ' +
      'not comparable: the declare that used to cost one set now swings two, which moves every ' +
      'threshold in every style that was tuned around it. A matrix measured before the rule ' +
      'change cannot be read against one measured after. An artifact still carrying voidRate is ' +
      'refused at the boundary rather than quietly read as if it were this one.',
  },
] as const
