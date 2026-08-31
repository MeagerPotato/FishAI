/**
 * probe-declare.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * Grounds mechanism (2), signalling. Signalling is only worth turns if declares are actually
 * failing for want of information. This measures the declare error rate, split by whether the
 * ask channel was still open (some opponent still held cards) at the moment of the declare —
 * because once it closes, every remaining set must be declared on the log as it then stood.
 */
import { newGame, reduce, seatView, us54Config, allBooks, bookCards, seatTeam, ALL_SEATS } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const books = allBooks(config)
const GAMES = Number(process.argv[2] ?? 200)
const STYLE = process.argv[3] ?? 'balanced'

let open = { n: 0, right: 0 }, closed = { n: 0, right: 0 }
let asksIntoSetBeforeRight = 0, asksIntoSetBeforeWrong = 0
let nRight = 0, nWrong = 0

for (let g = 0; g < GAMES; g++) {
  let st = newGame(`decl-${g}`, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 4000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const myTeam = seatTeam(seat)
    const oppHave = ALL_SEATS.some((s) => seatTeam(s) !== myTeam && st.hands[s].length > 0)
    const action = decide(view, STYLE_ROSTER[STYLE], steps)
    // how many asks had already been made into this set, by anyone, before the declare
    let priorAsks = 0
    if (action.type === 'claim') {
      for (const ev of st.log) {
        if (ev.type === 'ask' && bookCards(action.book, config).includes(ev.card)) priorAsks++
      }
    }
    const r = reduce(st, action)
    if (!r.ok) break
    if (action.type === 'claim') {
      const res = r.state.books[action.book]
      const correct = res !== undefined && res.outcome === (myTeam === 0 ? 'team0' : 'team1')
      const bucket = oppHave ? open : closed
      bucket.n++
      if (correct) { bucket.right++; nRight++; asksIntoSetBeforeRight += priorAsks }
      else { nWrong++; asksIntoSetBeforeWrong += priorAsks }
    }
    st = r.state
    steps++
  }
}

const pct = (a, b) => (b === 0 ? ' n/a' : `${((100 * a) / b).toFixed(1)}%`)
console.log(`style ${STYLE}, games ${GAMES}`)
console.log(`declares with the ask channel OPEN   : ${open.n}, correct ${open.right} (${pct(open.right, open.n)})`)
console.log(`declares with the ask channel CLOSED : ${closed.n}, correct ${closed.right} (${pct(closed.right, closed.n)})`)
console.log(`overall correct                      : ${nRight}/${nRight + nWrong} (${pct(nRight, nRight + nWrong)})`)
console.log(`mean prior asks into the set  | correct declare : ${(asksIntoSetBeforeRight / Math.max(1, nRight)).toFixed(2)}`)
console.log(`mean prior asks into the set  | WRONG declare   : ${(asksIntoSetBeforeWrong / Math.max(1, nWrong)).toFixed(2)}`)
