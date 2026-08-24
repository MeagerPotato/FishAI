/**
 * policyForSeat — the ONE seam between the play table and the engine's policy layer.
 *
 * The table never constructs a `PolicySpec` anywhere else, and it never needs to know what kind
 * of spec it was handed: `decide(view, policyForSeat(...), seed)` is the whole contract. That is
 * deliberate, because the two play modes resolve their seats very differently and only one of
 * them exists yet:
 *
 *   · `v05` — the shipped mode. Each bot seat plays one fixed `StyleParams` from the measured
 *     roster, chosen in the lobby (or derived from the seed), for the whole game.
 *
 *   · `v10` — the adaptive mode. NOT BUILT YET. The adaptive engine (per-seat classification
 *     from the public log + best-response style selection off the measured counter-table) is
 *     being built in a parallel task, and until it lands this function answers `v10` with a
 *     STAND-IN: every bot seat plays Balanced. The table labels that honestly wherever `?v=10`
 *     is rendered — see PlayTable — and the lobby refuses to launch the mode at all.
 *
 * When the adaptive spec lands, extending the `v10` branch here (to return an `AdaptiveSpec`,
 * or whatever shape `PolicySpec` gains) is the entire integration: no component changes.
 */
import type { PolicySpec, Seat, StyleId } from '../../lib/engine/index.ts'
import { STYLE_ROSTER } from '../../lib/engine/index.ts'

/** The two play modes the table's `?v=` param names: `05` -> 'v05', `10` -> 'v10'. */
export type PlayMode = 'v05' | 'v10'

/**
 * The policy a bot seat plays. `styles` carries five ids, one per bot seat in seat order
 * (index 0 = seat 1 … index 4 = seat 5); seat 0 is always the human and never resolved here.
 */
export function policyForSeat(mode: PlayMode, seat: Seat, styles: readonly StyleId[]): PolicySpec {
  if (mode === 'v10') {
    // The stand-in until the adaptive engine lands. See the file header.
    return STYLE_ROSTER.balanced
  }
  const id = styles[seat - 1]
  return id === undefined ? STYLE_ROSTER.balanced : STYLE_ROSTER[id]
}

/** What the seat card prints for a bot seat. Honest about the v10 stand-in. */
export function policyLabel(mode: PlayMode, seat: Seat, styles: readonly StyleId[]): string {
  if (mode === 'v10') return 'Adaptive · stand-in: Balanced'
  const id = styles[seat - 1]
  return id === undefined ? 'Balanced' : STYLE_ROSTER[id].label
}
