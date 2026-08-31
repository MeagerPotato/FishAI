/**
 * probe-concentration-outcome.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * Section 4 of the concentration report, done honestly. The raw correlation between a team's ask
 * concentration and its result has a mechanical confound: HHI over n asks is biased upward as n
 * falls, and the team that is losing gets fewer turns and therefore fewer asks. So a negative
 * corr(HHI, sets) may say nothing but "losing teams ask less".
 *
 * Three things are reported: the raw association, the association after controlling for the ask
 * count (partial correlation, plus a within-ask-count-stratum breakdown), and a PERMUTATION-
 * REFERENCED concentration that removes the small-sample bias by construction — the team's own HHI
 * minus the mean HHI of 40 random redraws of the same number of asks from that game's overall set
 * frequencies. Positive excess = genuinely more concentrated than its ask count alone implies.
 *
 * usage: node scripts/probe-concentration-outcome.mjs <games> <arm>
 */
import { newGame, reduce, seatView, us54Config, allBooks, cardBook, seatTeam } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER, STYLE_IDS } from '../lib/engine/bots/roster.ts'
import { rngFromSeed } from '../lib/engine/rng.ts'

const config = us54Config
const BOOKS = allBooks(config)
const GAMES = Number(process.argv[2] ?? 600)
const ARM = process.argv[3] ?? 'balanced'
const REDRAWS = 40

const noDefuse = ARM.endsWith('-nodefuse')
const strip = (s) => (noDefuse ? Object.freeze({ ...s, defuse: 0 }) : s)
function stylesFor(g) {
  if (ARM.startsWith('roster')) {
    return [0, 1, 2, 3, 4, 5].map((i) => strip(STYLE_ROSTER[STYLE_IDS[(g + i) % STYLE_IDS.length]]))
  }
  return [0, 1, 2, 3, 4, 5].map(() => strip(STYLE_ROSTER.balanced))
}

const hhiOf = (counts) => {
  const t = counts.reduce((a, b) => a + b, 0)
  return t > 0 ? counts.reduce((a, n) => a + (n / t) ** 2, 0) : 0
}

const rows = []
for (let g = 0; g < GAMES; g++) {
  const styles = stylesFor(g)
  let st = newGame(`conc-${g}`, config, g % 6)
  let steps = 0
  const byTeam = [new Map(), new Map()]
  const overall = new Map()
  while (st.phase !== 'finished' && steps < 4000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const action = decide(seatView(st, seat), styles[seat], steps)
    if (action.type === 'ask') {
      const b = cardBook(action.card)
      const t = seatTeam(seat)
      byTeam[t].set(b, (byTeam[t].get(b) ?? 0) + 1)
      overall.set(b, (overall.get(b) ?? 0) + 1)
    }
    const r = reduce(st, action)
    if (!r.ok) break
    st = r.state
    steps++
  }
  const sets = [0, 0]
  for (const b of BOOKS) {
    const o = st.books[b]?.outcome
    if (o === 'team0') sets[0]++
    else if (o === 'team1') sets[1]++
  }
  // the game's overall set frequencies, as a sampling distribution for the redraws
  const freq = BOOKS.map((b) => overall.get(b) ?? 0)
  const freqTot = freq.reduce((a, b) => a + b, 0)
  const cum = []
  let acc = 0
  for (const f of freq) {
    acc += f
    cum.push(acc)
  }
  const rng = rngFromSeed(`draw-${g}`)
  const excessFor = (n) => {
    if (n === 0 || freqTot === 0) return 0
    let sum = 0
    for (let d = 0; d < REDRAWS; d++) {
      const c = new Array(BOOKS.length).fill(0)
      for (let i = 0; i < n; i++) {
        const x = rng() * freqTot
        let j = 0
        while (j < cum.length - 1 && x >= cum[j]) j++
        c[j]++
      }
      sum += hhiOf(c)
    }
    return sum / REDRAWS
  }
  const row = { sets, n: [0, 0], hhi: [0, 0], excess: [0, 0] }
  for (const t of [0, 1]) {
    const c = BOOKS.map((b) => byTeam[t].get(b) ?? 0)
    row.n[t] = c.reduce((a, b) => a + b, 0)
    row.hhi[t] = hhiOf(c)
    row.excess[t] = row.hhi[t] - excessFor(row.n[t])
  }
  rows.push(row)
}

const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)
function pearson(xs, ys) {
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy)
}
const partial = (x, y, z) => {
  const rxy = pearson(x, y)
  const rxz = pearson(x, z)
  const ryz = pearson(y, z)
  const d = Math.sqrt((1 - rxz ** 2) * (1 - ryz ** 2))
  return d === 0 ? 0 : (rxy - rxz * ryz) / d
}

const dS = rows.map((r) => r.sets[0] - r.sets[1])
const dH = rows.map((r) => r.hhi[0] - r.hhi[1])
const dE = rows.map((r) => r.excess[0] - r.excess[1])
const dN = rows.map((r) => r.n[0] - r.n[1])

console.log(`=== concentration vs outcome, arm ${ARM}, games ${GAMES} (OBSERVATIONAL) ===`)
console.log(`mean asks per team ${mean(rows.map((r) => (r.n[0] + r.n[1]) / 2)).toFixed(1)}; mean team HHI ${mean(rows.flatMap((r) => r.hhi)).toFixed(4)}; mean EXCESS HHI over a same-size random redraw ${mean(rows.flatMap((r) => r.excess)).toFixed(4)}`)
console.log(`\ncorr(delta raw HHI,    delta sets) = ${pearson(dH, dS).toFixed(3)}   <-- confounded`)
console.log(`corr(delta ask count,  delta sets) = ${pearson(dN, dS).toFixed(3)}   <-- the confound itself`)
console.log(`corr(delta raw HHI,    delta asks) = ${pearson(dH, dN).toFixed(3)}   <-- HHI's small-sample bias`)
console.log(`PARTIAL corr(delta raw HHI, delta sets | delta asks) = ${partial(dH, dS, dN).toFixed(3)}`)
console.log(`corr(delta EXCESS HHI, delta sets) = ${pearson(dE, dS).toFixed(3)}   <-- bias removed by construction`)
console.log(`PARTIAL corr(delta EXCESS HHI, delta sets | delta asks) = ${partial(dE, dS, dN).toFixed(3)}`)

console.log('\nwithin strata of |delta ask count| (raw HHI vs sets):')
const strata = [[0, 10], [10, 25], [25, 50], [50, 1e9]]
for (const [lo, hi] of strata) {
  const idx = rows.map((_, i) => i).filter((i) => Math.abs(dN[i]) >= lo && Math.abs(dN[i]) < hi)
  if (idx.length < 20) continue
  console.log(
    `  |delta asks| in [${lo}, ${hi === 1e9 ? 'inf' : hi}): N=${idx.length}  corr(raw HHI, sets) ${pearson(idx.map((i) => dH[i]), idx.map((i) => dS[i])).toFixed(3)}  corr(EXCESS HHI, sets) ${pearson(idx.map((i) => dE[i]), idx.map((i) => dS[i])).toFixed(3)}`,
  )
}

console.log('\nwin rate of the team with the higher EXCESS concentration:')
let wins = 0
let games = 0
for (const r of rows) {
  if (r.excess[0] === r.excess[1] || r.sets[0] === r.sets[1]) continue
  games++
  const moreConc = r.excess[0] > r.excess[1] ? 0 : 1
  if (r.sets[moreConc] > r.sets[1 - moreConc]) wins++
}
console.log(`  ${((100 * wins) / Math.max(1, games)).toFixed(1)}% of ${games} decided games (50% = no association)`)
