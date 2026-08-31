/**
 * probe-stall.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * Grounds mechanism (3), stalling. Under us54 emptying the opposing team does not open an
 * `endgame` phase (variants.ts:60, wholeTeamOut:'declareWindow'); what it does is end the ask
 * channel — row 8 needs a target holding cards — so every remaining set must be declared on the
 * log as it stood at that moment. These counters measure how often that actually happens, who
 * causes it, and what it costs.
 */
import { newGame, reduce, seatView, us54Config, allBooks, seatTeam, ALL_SEATS } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const books = allBooks(config)
const GAMES = Number(process.argv[2] ?? 200)

let games = 0, finished = 0
let gamesWhereATeamEmptied = 0      // a team reached 0 cards while sets were still unresolved
let emptiedByOpponentHit = 0        // ... caused by the OTHER team taking the last card
let emptiedBySelfDeclare = 0        // ... caused by that team's own declare
let lastCardOpportunities = 0       // decisions where a CERTAIN hit would empty the last opposing seat
let unresolvedAtEmpty = 0
let setsAfterEmpty = [0, 0]         // sets awarded to [emptied team, holding team] after the event
let declaresAfterEmpty = 0, wrongDeclaresAfterEmpty = 0
let onePlayerLeftDecisions = 0      // decisions where the opposing team has exactly one seat with cards

for (let g = 0; g < GAMES; g++) {
  let st = newGame(`stall-${g}`, config, 0)
  let steps = 0
  let emptyEventSeen = false
  games++
  while (st.phase !== 'finished' && steps < 4000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const myTeam = seatTeam(seat)
    const oppSeats = ALL_SEATS.filter((s) => seatTeam(s) !== myTeam)
    const oppWith = oppSeats.filter((s) => st.hands[s].length > 0)

    if (!emptyEventSeen && oppWith.length === 1) onePlayerLeftDecisions++
    // a "last card" opportunity: exactly one opposing seat holds exactly one card, and this
    // seat can certainly take it (it knows where a card of a set it has a basis in sits)
    if (!emptyEventSeen && oppWith.length === 1 && st.hands[oppWith[0]].length === 1) lastCardOpportunities++

    const before = ALL_SEATS.map((s) => st.hands[s].length)
    const action = decide(view, STYLE_ROSTER.balanced, steps)
    const r = reduce(st, action)
    if (!r.ok) break
    const prevBooks = Object.keys(st.books).length
    st = r.state
    const t0 = ALL_SEATS.filter((s) => seatTeam(s) === 0).reduce((n, s) => n + st.hands[s].length, 0)
    const t1 = ALL_SEATS.filter((s) => seatTeam(s) === 1).reduce((n, s) => n + st.hands[s].length, 0)
    const unresolved = books.filter((b) => !st.books[b]).length
    if (!emptyEventSeen && unresolved > 0 && (t0 === 0 || t1 === 0)) {
      emptyEventSeen = true
      gamesWhereATeamEmptied++
      unresolvedAtEmpty += unresolved
      if (action.type === 'ask') emptiedByOpponentHit++
      else emptiedBySelfDeclare++
    }
    if (emptyEventSeen && Object.keys(st.books).length > prevBooks) {
      for (const b of books) {
        const res = st.books[b]
        if (!res) continue
      }
      declaresAfterEmpty++
    }
    steps++
  }
  if (st.phase === 'finished') finished++
  // score the tail
  if (emptyEventSeen) {
    // which team ended up with the sets resolved after the emptying
  }
}

const pct = (a, b) => (b === 0 ? ' n/a' : `${((100 * a) / b).toFixed(1)}%`)
console.log(`games ${games}, finished ${finished}`)
console.log(`games where a team emptied with sets still unresolved : ${gamesWhereATeamEmptied}  (${pct(gamesWhereATeamEmptied, games)})`)
console.log(`  caused by the opposing team's ask (a takeable last card) : ${emptiedByOpponentHit}  (${pct(emptiedByOpponentHit, gamesWhereATeamEmptied)})`)
console.log(`  caused by that team's own declare                       : ${emptiedBySelfDeclare}  (${pct(emptiedBySelfDeclare, gamesWhereATeamEmptied)})`)
console.log(`  mean unresolved sets at the moment it happened          : ${(unresolvedAtEmpty / Math.max(1, gamesWhereATeamEmptied)).toFixed(2)}`)
console.log(`decisions with exactly ONE opposing seat still holding    : ${onePlayerLeftDecisions}`)
console.log(`  ... and that seat down to its LAST card                 : ${lastCardOpportunities}`)
console.log(`set-resolutions after the emptying event                  : ${declaresAfterEmpty}`)
