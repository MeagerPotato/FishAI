/**
 * policyForSeat — the ONE seam between the play table and the engine's policy layer.
 *
 * The table never constructs a `PolicySpec` anywhere else, and it never needs to know what kind
 * of spec it was handed: `decide(view, policyForSeat(...), seed)` is the whole contract. The two
 * play modes resolve their seats differently:
 *
 *   · `v05` — each bot seat plays one fixed `StyleParams` from the measured roster, chosen in
 *     the lobby (or derived from the seed), for the whole game.
 *
 *   · `v10` — every bot seat is the FishAI v1.0 adaptive engine: per-seat classification from
 *     the public log plus best-response style selection off the measured counter table
 *     (`lib/engine/bots/adaptive.ts`). One shared frozen spec, because the spec carries no
 *     state — everything is re-derived from the seat's own `SeatView` at each decision, which
 *     is why no style can be assigned to a v1.0 seat and the lobby does not offer to.
 */
import type { PolicySpec, Seat, StyleId } from '../../lib/engine/index.ts'
import { STYLE_ROSTER } from '../../lib/engine/index.ts'

/** The two play modes the table's `?v=` param names: `05` -> 'v05', `10` -> 'v10'. */
export type PlayMode = 'v05' | 'v10'

/** The one adaptive spec every v1.0 seat shares — defaults from ADAPTIVE_DEFAULTS apply. */
const ADAPTIVE: PolicySpec = Object.freeze({ adaptive: true as const })

/**
 * The policy a bot seat plays. `styles` carries five ids, one per bot seat in seat order
 * (index 0 = seat 1 … index 4 = seat 5); seat 0 is always the human and never resolved here.
 */
export function policyForSeat(mode: PlayMode, seat: Seat, styles: readonly StyleId[]): PolicySpec {
  if (mode === 'v10') return ADAPTIVE
  const id = styles[seat - 1]
  return id === undefined ? STYLE_ROSTER.balanced : STYLE_ROSTER[id]
}

/** What the seat card prints for a bot seat. */
export function policyLabel(mode: PlayMode, seat: Seat, styles: readonly StyleId[]): string {
  if (mode === 'v10') return 'FishAI v1.0 · adaptive'
  const id = styles[seat - 1]
  return id === undefined ? 'Balanced' : STYLE_ROSTER[id].label
}

/**
 * The policy the ASSISTANT reasons with, as distinct from what the bot seats play. In `v05` the
 * advisor is one fixed roster style chosen in the pane (Balanced by default) — the advice pane
 * labels it, and switching it is switching advisors, not editing the running bots. In `v10` the
 * advisor is whatever the mode's seats play, so advice and opposition come from the same engine
 * — today that is the same stand-in `policyForSeat` returns, and when the adaptive spec lands
 * here this line follows it automatically.
 */
export function advisorPolicy(mode: PlayMode, style: StyleId): PolicySpec {
  if (mode === 'v10') return policyForSeat('v10', 1, [])
  return Object.hasOwn(STYLE_ROSTER, style) ? STYLE_ROSTER[style] : STYLE_ROSTER.balanced
}
