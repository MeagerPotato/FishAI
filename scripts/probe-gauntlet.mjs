/**
 * probe-gauntlet.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * The test the fishlabs corpus says this result could fail. Their structurally analogous inverted
 * coordinate measured +2.71 against a weak opponent, +0.55 against a middling one and **-0.99**
 * against their strongest — a gain that existed only against opponents that could not punish it.
 *
 * So: does defusal still pay when the OPPONENT defuses too? For each roster style S, both arms
 * face the same fully-armed opponent, and only the measured team's appetite changes.
 *
 *   arm A : team0 = balanced(defuse 1)   vs   team1 = S(defuse 1)
 *   arm B : team0 = balanced(defuse 0)   vs   team1 = S(defuse 1)
 *
 * The reported quantity is A's set difference minus B's, on the same deals in both orientations.
 */
import { newGame, reduce, seatView, us54Config, seatTeam } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_IDS, STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const GAMES = Number(process.argv[2] ?? 300)
const BANK = process.argv[3] ?? 'gauntlet'

function play(seed, meStyle, oppStyle, meTeam) {
  let st = newGame(seed, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 6000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const r = reduce(st, decide(seatView(st, seat), seatTeam(seat) === meTeam ? meStyle : oppStyle, steps))
    if (!r.ok) return null
    st = r.state
    steps++
  }
  return st.phase === 'finished' ? st.score[meTeam] - st.score[1 - meTeam] : null
}

console.log(`defusal against a defusing opponent — ${GAMES} duplicate pairs per cell, bank ${BANK}`)
console.log('opponent      armA(on)  armB(off)   delta = on - off        95% CI')
for (const id of STYLE_IDS) {
  const opp = STYLE_ROSTER[id]
  const on = STYLE_ROSTER.balanced                       // defuse 1
  const off = Object.freeze({ ...STYLE_ROSTER.balanced, defuse: 0 })
  const d = []
  let sumOn = 0, sumOff = 0
  for (let g = 0; g < GAMES; g++) {
    const seed = `${BANK}-${id}-${g}`
    const a0 = play(seed, on, opp, 0), a1 = play(seed, on, opp, 1)
    const b0 = play(seed, off, opp, 0), b1 = play(seed, off, opp, 1)
    if (a0 === null || a1 === null || b0 === null || b1 === null) continue
    const A = a0 + a1, B = b0 + b1
    sumOn += A; sumOff += B
    d.push(A - B)
  }
  const n = d.length
  const m = d.reduce((x, y) => x + y, 0) / n
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1))
  const ci = (1.96 * sd) / Math.sqrt(n)
  const sig = m - ci > 0 ? '  ++' : m + ci < 0 ? '  --' : '   .'
  console.log(
    `${id.padEnd(12)} ${(sumOn / n).toFixed(3).padStart(8)} ${(sumOff / n).toFixed(3).padStart(9)}   ${m.toFixed(4).padStart(8)} +/- ${ci.toFixed(4)}${sig}`,
  )
}
