/**
 * probe-v15-warmup.mjs — scratch: the confound the ladder cannot hold fixed.
 *
 * A v1.0 seat's style is a function of the PUBLIC LOG LENGTH (anchor 'balanced' while the
 * phase-truncated cut < 40 events, 'punter' after). The bounded opponent's budget changes how
 * long games run and how many public events they emit — so the v1.0 baseline is not the same
 * policy mixture at every rung of the ladder. This measures the mixture directly.
 *
 * Usage: node scripts/probe-v15-warmup.mjs [games] [bank] [bitsCSV]
 */
import { ALL_SEATS, STYLE_ROSTER, seatTeam } from '../lib/engine/index.ts'
import { playGameSeats, seedFor, startSeatFor } from '../lib/lab/index.ts'
import { ADAPTIVE_DEFAULTS, ADAPTIVE_PHASE_EVENTS } from '../lib/engine/bots/adaptive.ts'

const GAMES = Number(process.argv[2] ?? 30)
const BANK = process.argv[3] ?? 'v15v10-holdout-a'
const BITS = (process.argv[4] ?? '0,16,32,64,1000000').split(',').map(Number)
const OPTS = { variant: 'us54', stepCap: 5000, invariantCheck: 'every' }

console.log(`v1.0 opponent's own style mixture, per bounded budget it faces — us54, bank ${BANK}`)
console.log(`(anchor '${ADAPTIVE_DEFAULTS.anchor}' while cut < ${ADAPTIVE_DEFAULTS.warmupEvents}, phase ${ADAPTIVE_PHASE_EVENTS})\n`)
console.log('bits         games  steps/game  logEvents/game  v1.0 decisions  warm%(punter)  warmup%(balanced)')

for (const bits of BITS) {
  let dec = 0
  let warm = 0
  let steps = 0
  let logMax = 0
  let n = 0
  for (let g = 0; g < GAMES; g++) {
    const seed = seedFor(BANK, g)
    // orientation 0 only; the point is the mixture, not a paired score.
    const seats = ALL_SEATS.map((s) =>
      seatTeam(s) === 0
        ? { policy: { bounded: true, bits, style: 'balanced' }, leakStyle: STYLE_ROSTER.balanced }
        : { policy: { adaptive: true }, leakStyle: STYLE_ROSTER.balanced },
    )
    const gm = playGameSeats(seats, seed, startSeatFor(g), {
      ...OPTS,
      observe: (seat, view) => {
        if (seatTeam(seat) !== 1) return
        dec++
        const cut = Math.floor(view.log.length / ADAPTIVE_PHASE_EVENTS) * ADAPTIVE_PHASE_EVENTS
        if (cut >= ADAPTIVE_DEFAULTS.warmupEvents) warm++
        if (view.log.length > logMax) logMax = view.log.length
      },
    })
    steps += gm.steps
    n++
    if (g === GAMES - 1) {
      // logMax is per-cell; reset happens implicitly by scoping below
    }
  }
  console.log(
    `${String(bits).padEnd(12)} ${String(n).padEnd(6)} ${(steps / n).toFixed(1).padEnd(11)} ${String(logMax).padEnd(15)} ` +
      `${String(dec).padEnd(15)} ${((100 * warm) / dec).toFixed(2).padEnd(14)} ${((100 * (dec - warm)) / dec).toFixed(2)}`,
  )
}
