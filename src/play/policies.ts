/**
 * The ONE seam between the play table and the engine's policy layer.
 *
 * Every bot seat at this table is the FishAI v1.0 adaptive engine: per-seat classification from
 * the public log plus best-response style selection off the measured counter table
 * (`lib/engine/bots/adaptive.ts`). One shared frozen spec, because the spec carries no state —
 * everything is re-derived from the seat's own `SeatView` at each decision, which is why no
 * style can be assigned to a seat here and the lobby does not offer to.
 *
 * ## Why there is only one policy left
 *
 * The v0.5 mode — five fixed roster styles, optionally under a v1.5 bit budget — is retired
 * FROM PLAY, at the owner's request, so that solo testing is testing of one thing. It is not
 * retired from the project: `STYLE_ROSTER`, the bounded specs and every game measured under
 * them are untouched in lib/, /lab/bounded still renders the ladder, and the papers still argue
 * from it. The engine keeps every policy it has ever measured; the table just stops offering a
 * choice nobody wanted to make while testing the adaptive engine.
 *
 * What went with it: the `PlayMode` type, `policyForSeat`'s mode/style/bits arguments, and the
 * `?v=` and `?bits=` params (see params.ts, which now REFUSES a `?v=05` link rather than
 * quietly dealing a different game under its seed).
 */
import type { PolicySpec } from '../../lib/engine/index.ts'

/**
 * The one adaptive spec every bot seat and the advisor share — defaults from ADAPTIVE_DEFAULTS
 * apply. Frozen and module-level because it is genuinely one value: two seats holding the same
 * spec object cannot drift apart, and there is no per-seat state for them to drift with.
 */
export const ADAPTIVE_POLICY: PolicySpec = Object.freeze({ adaptive: true as const })

/**
 * What a bot seat's card prints under its name. Kept as a named constant rather than inlined at
 * the three surfaces that show it (the seat ring, the style mirror's Played column, the
 * lobby), because a seat's policy is research-relevant information and all three must agree on
 * what it says.
 */
export const ADAPTIVE_LABEL = 'FishAI v1.0 · adaptive'
