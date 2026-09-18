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

