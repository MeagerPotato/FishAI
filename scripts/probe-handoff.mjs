/**
 * probe-handoff.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * Grounds mechanism (5), the informed turn handoff. The owner asked that a seat which runs out of
 * cards on its own turn choose the teammate to pass to by what that teammate could DO with the
 * turn, rather than by hand size. Before building an estimator, measure whether the decision
 * exists: how often `awaitPass` is reached under us54, how often it is a real choice (more than
 * one candidate teammate holding cards), and how often the ask channel is already dead — the
 * blind-declare case the owner singled out.
 *
 * Also measures the ground truth the estimator would be predicting: after the pass, how many
 * cards does the receiving seat actually take before losing the turn?
 */
import { newGame, reduce, seatView, us54Config, allBooks, seatTeam, ALL_SEATS } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const books = allBooks(config)
const GAMES = Number(process.argv[2] ?? 300)
const STYLE = process.argv[3] ?? 'balanced'

let games = 0
let gamesWithPass = 0
let passEvents = 0
let passWithChoice = 0        // >1 teammate holding cards: an actual decision
let passNoCandidate = 0       // no teammate holds cards
let passChannelDead = 0       // all opponents out of cards: receiver must declare blind
let unresolvedAtPass = 0
const takenAfterPass = []     // cards the receiver took before losing the turn
const poolSizes = []

for (let g = 0; g < GAMES; g++) {
  let st = newGame(`handoff-${g}`, config, 0)
  let steps = 0
  let sawPass = false
  games++
  // when a pass fires we watch the receiver until it loses the turn
  let watching = null
  while (st.phase !== 'finished' && steps < 4000) {
    if (st.phase === 'awaitPass') {
      const seat = st.turn
      const myTeam = seatTeam(seat)
      const mates = ALL_SEATS.filter((s) => s !== seat && seatTeam(s) === myTeam)
      const withCards = mates.filter((s) => st.hands[s].length > 0)
      const oppWith = ALL_SEATS.filter((s) => seatTeam(s) !== myTeam && st.hands[s].length > 0)
      passEvents++
      poolSizes.push(withCards.length)
      if (withCards.length > 1) passWithChoice++
      if (withCards.length === 0) passNoCandidate++
      if (oppWith.length === 0) passChannelDead++
      unresolvedAtPass += books.filter((b) => !st.books[b]).length
      if (!sawPass) { sawPass = true; gamesWithPass++ }
    }
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const action = decide(view, STYLE_ROSTER[STYLE], steps)
    const wasPass = action.type === 'pass' && action.to !== action.seat
    const before = ALL_SEATS.map((s) => st.hands[s].length)
    const r = reduce(st, action)
    if (!r.ok) break
    st = r.state
    if (watching !== null) {
      if (action.type === 'ask' && action.seat === watching) {
        const ev = st.log[st.log.length - 1]
        if (ev && ev.type === 'ask' && ev.hit) watching = { ...watching, n: 0 }
      }
    }
    if (wasPass) {
      // replay forward counting hits by the receiver until it misses
      let taken = 0
      let s2 = st
      let guard = 0
      const rec = action.to
      while (s2.phase !== 'finished' && guard++ < 200) {
        const sv = s2.declareWindow ? s2.declareWindow.option : s2.turn
        const a2 = decide(seatView(s2, sv), STYLE_ROSTER[STYLE], steps + guard)
        const r2 = reduce(s2, a2)
        if (!r2.ok) break
        s2 = r2.state
        if (a2.type === 'ask' && a2.seat === rec) {
          const ev = s2.log[s2.log.length - 1]
          if (ev && ev.type === 'ask') { if (ev.hit) taken++; else break }
        } else if (a2.type === 'ask') break
      }
      takenAfterPass.push(taken)
    }
    steps++
  }
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) + '%' : 'n/a')
console.log(`handoff incidence — ${games} us54 games, ${STYLE}`)
console.log(`games reaching awaitPass at all      ${gamesWithPass}  (${pct(gamesWithPass, games)})`)
console.log(`awaitPass events                     ${passEvents}`)
console.log(`  ... a real choice (>1 candidate)   ${passWithChoice}  (${pct(passWithChoice, passEvents)})`)
console.log(`  ... no teammate holds cards        ${passNoCandidate}  (${pct(passNoCandidate, passEvents)})`)
console.log(`  ... ask channel already dead       ${passChannelDead}  (${pct(passChannelDead, passEvents)})`)
console.log(`mean unresolved sets at pass         ${(unresolvedAtPass / Math.max(1, passEvents)).toFixed(2)}`)
console.log(`mean candidate pool size             ${mean(poolSizes).toFixed(2)}`)
console.log(`mean cards receiver then took        ${mean(takenAfterPass).toFixed(3)}  (n=${takenAfterPass.length})`)
