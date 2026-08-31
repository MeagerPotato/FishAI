/**
 * The ONE seam between the play table and the engine's policy layer.
 *
 * Every bot seat at this table is the FishAI v1.0 adaptive engine: per-seat classification from
 * the public log plus best-response style selection off the measured counter table
 * (`lib/engine/bots/adaptive.ts`). One shared frozen spec, because the spec carries no state —
 * everything is re-derived from the seat's own `SeatView` at each decision, which is why no
 * style can be assigned to a seat here and the lobby does not offer to.
 *
 * ## Why the label names two versions
 *
 * The *architecture* here is v1.0 and only v1.0: observe → classify → best-respond → play, with
 * nothing between the classifier and the roster style it delegates to. But what that style then
 * plays is not frozen at v1.0. The adaptive engine hands the decision to an entry of
 * `STYLE_ROSTER`, and every entry spreads from the `BALANCED` base in
 * [roster.ts](../../lib/engine/bots/roster.ts), which carries `defuse: 1` — CONCESSION.md's
 * defusal term, shipped with v2.0. So the v2.0 concession layer is live at this table, in every
 * bot seat, on every style the classifier can pick.
 *
 * Two things it is NOT. It is not v2.0 in the sense of new adaptive or bounded machinery: none
 * of that changed, and the classifier, the counter table and the fingerprints are the v1.0
 * artifact's. And it is not the whole concession layer — `conceal` is not set anywhere on the
 * roster, so the concealment half of CONCESSION.md is dormant here.
 *
 * Hence the label below names both halves. Writing plain "v2.0" would tell a player the
 * bounded/adaptive machinery moved, which it did not; leaving plain "v1.0" would hide a term
 * that changes what the bot actually does with its turn.
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
 *
 * Both versions are load-bearing — see "Why the label names two versions" above.
 */
export const ADAPTIVE_LABEL = 'FishAI v1.0 adaptive · v2.0 defusal'
