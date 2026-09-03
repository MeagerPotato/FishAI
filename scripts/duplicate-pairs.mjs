/**
 * duplicate-pairs.mjs — the home regression cell: one Monet version against another on
 * duplicate `us54` deals, paired.
 *
 *     node scripts/duplicate-pairs.mjs --a v0.3 --b v0.2 [--pairs 800] [--bank home-a]
 *
 * MONET.md §3.3a item 4 / §6.2's last row: every shipped change gets ≥ 800 duplicate pairs at
 * home before it is called a ship, reported with the CELL'S OWN standard deviation (§6.3 — the
 * generic per-pair SD is wrong for every cell it was not measured on). ASKING.md §6 measured the
 * licence correction costing ~0.35 sets/pair in self-play with the defusal appetite on, so a loss
 * here is expected for v0.3 and must be quantified rather than discovered later.
 *
 * Design, verbatim from BOT_LAB.md §5.1 and `scripts/probe-licence3.mjs`: each seed is played
 * twice, once with arm A on team 0 and once with arm A on team 1, so the deal is never a
 * confound; the statistic is the paired set-difference `(A − B)` summed over the two
 * orientations, with a 1.96·SE interval from that sample's own SD. Win rate is reported beside it
 * for legibility and is the noisier number.
 *
 * The control this harness owes: `--a v0.2 --b v0.2` must print `0.0000 +/- 0.0000`. It cannot
 * do otherwise — both teams are one policy on one deal — so it is a smoke test of the harness,
 * never evidence about a policy (MONET.md §6.2 on mirror cells).
 *
 * Banks: `home-a` is the fitting bank; `home-b` and `home-c` are held out. Name the bank in every
 * number quoted from this script.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const { newGame, reduce, seatView, us54Config, legalActionsSummary, hashSeed, seatTeam } = ENG
const { monetPolicy, isMonetVersion, MONET_VERSION_IDS, decide } = BOTS

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const A = argOf('--a', '')
const B = argOf('--b', '')
for (const v of [A, B]) {
  if (!isMonetVersion(v)) {
    console.error(`--a and --b must name Monet versions (${MONET_VERSION_IDS.join(', ')}); got ${JSON.stringify(v)}`)
    process.exit(2)
  }
}
const PAIRS = Number(argOf('--pairs', 800))
const BANK = argOf('--bank', 'home-a')
const POL_A = monetPolicy(A)
const POL_B = monetPolicy(B)

/** One game: team `teamA` plays arm A, the other team arm B. Returns [setsA, setsB]. */
function play(seed, teamA) {
  let s = newGame(seed, us54Config, 0)
  let guard = 0
  while (s.phase !== 'finished') {
    if (guard++ >= 6000) return null
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const pol = seatTeam(seat) === teamA ? POL_A : POL_B
    const r = reduce(s, decide(view, pol, hashSeed(`${seed}:${s.moveIndex}`)()))
    if (!r.ok) return null
    s = r.state
  }
  return [s.score[teamA], s.score[1 - teamA]]
}

const t0 = Date.now()
let pairs = 0
let winsA = 0
let setsA = 0
let setsB = 0
let capped = 0
const d = []
for (let g = 0; g < PAIRS; g++) {
  const seed = `${BANK}-${g}`
  const x = play(seed, 0)
  const y = play(seed, 1)
  if (!x || !y) {
    capped++
    continue
  }
  pairs++
  setsA += x[0] + y[0]
  setsB += x[1] + y[1]
  winsA += (x[0] > x[1] ? 1 : 0) + (y[0] > y[1] ? 1 : 0)
  d.push(x[0] - x[1] + (y[0] - y[1]))
}
const mean = d.reduce((a, b) => a + b, 0) / d.length
const sd = Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, d.length - 1))
const se = sd / Math.sqrt(d.length)
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

console.log(`=== duplicate pairs: Monet ${A} vs Monet ${B}, bank ${BANK}, ${pairs} pairs (${2 * pairs} games), ${elapsed}s ===`)
if (capped) console.log(`!!! ${capped} pairs hit the step cap and were dropped`)
console.log(`sets            ${setsA} vs ${setsB}  (per game ${(setsA / (2 * pairs)).toFixed(4)} vs ${(setsB / (2 * pairs)).toFixed(4)})`)
console.log(`win rate (A)    ${((100 * winsA) / (2 * pairs)).toFixed(2)}%`)
console.log(`paired set-diff ${mean.toFixed(4)} +/- ${(1.96 * se).toFixed(4)}   (SD ${sd.toFixed(4)} sets/pair, this cell's own; SE ${se.toFixed(4)})`)
console.log(`verdict         ${Math.abs(mean) > 1.96 * se ? (mean > 0 ? `${A} AHEAD` : `${A} BEHIND`) + ' at 95%' : 'inside the interval: unresolved at this N'}`)
