/**
 * probe-window.mjs — scratch. How much of FishAI's declaring happens through the us54 declare
 * window rather than on its own turn? That is the channel the fishlabs host does not offer a
 * guest bot, so it is the size of the handicap in the cross-engine comparison (CROSSPLAY.md).
 */
import { newGame, reduce, seatView, us54Config, allBooks } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const GAMES = Number(process.argv[2] ?? 300)
let claims = 0, claimsOnOwnTurn = 0, claimsInWindow = 0, correct = 0, correctInWindow = 0, correctOwnTurn = 0
for (let g = 0; g < GAMES; g++) {
  let st = newGame(`win-${g}`, us54Config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 4000) {
    const inWindow = Boolean(st.declareWindow)
    const seat = inWindow ? st.declareWindow.option : st.turn
    const isOwnTurn = seat === st.turn
    const a = decide(seatView(st, seat), STYLE_ROSTER.balanced, steps)
    const r = reduce(st, a)
    if (!r.ok) break
    st = r.state
    if (a.type === 'claim') {
      const ev = st.log[st.log.length - 1]
      const ok = ev && ev.type === 'claim' && ((ev.outcome === 'team0') === (seat % 2 === 0))
      claims++
      if (ok) correct++
      // "window" = the seat was offered the option while NOT holding the turn: the channel a
      // fishlabs guest never gets.
      if (inWindow && !isOwnTurn) { claimsInWindow++; if (ok) correctInWindow++ }
      else { claimsOnOwnTurn++; if (ok) correctOwnTurn++ }
    }
    steps++
  }
}
const p = (n, d) => (d ? ((100 * n) / d).toFixed(1) + '%' : 'n/a')
console.log(`declare channel — ${GAMES} us54 games, balanced`)
console.log(`total claims                       ${claims}   correct ${p(correct, claims)}`)
console.log(`  made on the seat's own turn      ${claimsOnOwnTurn} (${p(claimsOnOwnTurn, claims)})  correct ${p(correctOwnTurn, claimsOnOwnTurn)}`)
console.log(`  made off-turn, via the window    ${claimsInWindow} (${p(claimsInWindow, claims)})  correct ${p(correctInWindow, claimsInWindow)}`)
