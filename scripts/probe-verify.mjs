/**
 * probe-verify.mjs — scratch check that the SHIPPED mechanism reproduces the prototype's result.
 * Plays the roster style (defuse: 1) against an otherwise-identical clone with defuse: 0, on
 * duplicate deals, through the real `decide`.
 */
import { newGame, reduce, seatView, us54Config, seatTeam } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const GAMES = Number(process.argv[2] ?? 300)
const NAME = process.argv[3] ?? 'balanced'
const BANK = process.argv[4] ?? 'holdoutA'
const ON = STYLE_ROSTER[NAME]
const OFF = Object.freeze({ ...ON, defuse: 0 })

function play(seed, onTeam) {
  let st = newGame(seed, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 6000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const style = seatTeam(seat) === onTeam ? ON : OFF
    const r = reduce(st, decide(view, style, steps))
    if (!r.ok) return null
    st = r.state
    steps++
  }
  return st.phase === 'finished' ? { on: st.score[onTeam], off: st.score[1 - onTeam] } : null
}

let pairs = 0, onW = 0, offW = 0, onS = 0, offS = 0
const d = []
for (let g = 0; g < GAMES; g++) {
  const a = play(`${BANK}-${g}`, 0), b = play(`${BANK}-${g}`, 1)
  if (!a || !b) continue
  pairs++
  onS += a.on + b.on; offS += a.off + b.off
  onW += (a.on > a.off ? 1 : 0) + (b.on > b.off ? 1 : 0)
  offW += (a.on < a.off ? 1 : 0) + (b.on < b.off ? 1 : 0)
  d.push((a.on - a.off) + (b.on - b.off))
}
const m = d.reduce((x, y) => x + y, 0) / d.length
const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1))
console.log(`${NAME} defuse:1 vs defuse:0 — ${pairs} duplicate pairs, bank ${BANK}`)
console.log(`  sets ${onS} vs ${offS}; wins ${onW} vs ${offW} (${((100 * onW) / (2 * pairs)).toFixed(2)}%)`)
console.log(`  paired set-difference ${m.toFixed(4)} +/- ${(1.96 * sd / Math.sqrt(d.length)).toFixed(4)}`)
