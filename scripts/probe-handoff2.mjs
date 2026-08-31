/**
 * probe-handoff2.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * The estimator study for mechanism (5). `awaitPass` with a real choice happens ~0.07 times per
 * us54 game (probe-handoff.mjs), so a win-rate A/B on it has no power at any bank size this
 * machine can run. The measurable quantity is instead the LOCAL one, and it is the same design
 * probe-danger.mjs used for the concession estimator: at every real pass decision, fork the game
 * once per candidate teammate, force the pass there, and count the cards that teammate then takes
 * before losing the turn. That is ground truth per candidate. Then ask which estimator, computed
 * from the passer's SeatView alone, ranks the candidates correctly.
 *
 * Estimators compared:
 *   handSize   view.counts[X]                       — what the engine ships (passTarget 'most')
 *   reach      cards of X's licensed sets that the passer can certainly locate on the OPPONENTS
 *   hybrid     reach, hand size breaking ties
 */
import { newGame, reduce, seatView, us54Config, allBooks, bookCards, seatTeam, ALL_SEATS } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { buildKnowledge, holderOf } from '../lib/engine/bots/knowledge.ts'
import { seatLicences } from '../lib/engine/bots/threat.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const GAMES = Number(process.argv[2] ?? 600)
const STYLE = process.argv[3] ?? 'balanced'
const pol = STYLE_ROSTER[STYLE]

/** Cards of `book` the viewer can certainly locate on the team OPPOSITE to the viewer's own. */
function preyOnOpponents(view, k, book) {
  const myTeam = seatTeam(view.seat)
  let n = 0
  for (const c of bookCards(book, view.config)) {
    const h = holderOf(k, c)
    if (h !== null && seatTeam(h) !== myTeam) n++
  }
  return n
}

/** Play `st` forward and count cards `rec` takes before it misses. */
function cardsTakenBy(st, rec, seedBase) {
  let taken = 0
  let guard = 0
  while (st.phase !== 'finished' && guard < 300) {
    const sv = st.declareWindow ? st.declareWindow.option : st.turn
    const a = decide(seatView(st, sv), pol, seedBase + guard)
    const r = reduce(st, a)
    if (!r.ok) break
    st = r.state
    guard++
    if (a.type === 'ask') {
      const ev = st.log[st.log.length - 1]
      if (!ev || ev.type !== 'ask') break
      if (a.seat === rec) { if (ev.hit) taken++; else break }
      else break // the turn left the receiving seat
    }
  }
  return taken
}

const rows = []   // one per (decision, candidate): { est..., truth }
let decisions = 0
let agreeMost = 0, agreeReach = 0, agreeHybrid = 0
let bestPossible = 0, gotMost = 0, gotReach = 0, gotHybrid = 0
let ties = 0

for (let g = 0; g < GAMES; g++) {
  let st = newGame(`ho2-${g}`, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 4000) {
    if (st.phase === 'awaitPass') {
      const seat = st.turn
      const myTeam = seatTeam(seat)
      const cands = ALL_SEATS.filter((s) => s !== seat && seatTeam(s) === myTeam && st.hands[s].length > 0)
      if (cands.length > 1) {
        const view = seatView(st, seat)
        const k = buildKnowledge(view, { useConstraints: true })
        const scored = cands.map((c) => {
          const lic = [...seatLicences(view, k, c)]
          let reach = 0
          for (const b of lic) reach += preyOnOpponents(view, k, b)
          const forked = reduce(st, { type: 'pass', seat, to: c })
          const truth = forked.ok ? cardsTakenBy(forked.state, c, steps + 1) : 0
          return { seat: c, hand: view.counts[c], reach, truth }
        })
        const pick = (cmp) => scored.reduce((a, b) => (cmp(b, a) ? b : a)).seat
        const byMost = pick((x, y) => x.hand > y.hand)
        const byReach = pick((x, y) => x.reach > y.reach)
        const byHybrid = pick((x, y) => x.reach > y.reach || (x.reach === y.reach && x.hand > y.hand))
        const best = Math.max(...scored.map((s) => s.truth))
        const truthOf = (s) => scored.find((x) => x.seat === s).truth
        decisions++
        bestPossible += best
        gotMost += truthOf(byMost)
        gotReach += truthOf(byReach)
        gotHybrid += truthOf(byHybrid)
        if (truthOf(byMost) === best) agreeMost++
        if (truthOf(byReach) === best) agreeReach++
        if (truthOf(byHybrid) === best) agreeHybrid++
        if (scored.every((s) => s.truth === scored[0].truth)) ties++
        for (const s of scored) rows.push(s)
      }
    }
    const sv = st.declareWindow ? st.declareWindow.option : st.turn
    const a = decide(seatView(st, sv), pol, steps)
    const r = reduce(st, a)
    if (!r.ok) break
    st = r.state
    steps++
  }
}

function corr(xs, ys) {
  const n = xs.length
  if (n < 2) return 0
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0
}
const truth = rows.map((r) => r.truth)
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) + '%' : 'n/a')
console.log(`handoff estimators — ${GAMES} us54 games, ${STYLE}`)
console.log(`real pass decisions (>1 candidate)   ${decisions}   candidate rows ${rows.length}`)
console.log(`  ... all candidates equal (no signal to find)  ${ties}  (${pct(ties, decisions)})`)
console.log(`corr(handSize, cards taken)          ${corr(rows.map((r) => r.hand), truth).toFixed(3)}`)
console.log(`corr(reach,    cards taken)          ${corr(rows.map((r) => r.reach), truth).toFixed(3)}`)
console.log(`mean cards captured, per decision:`)
console.log(`  oracle (best candidate)            ${(bestPossible / Math.max(1, decisions)).toFixed(3)}`)
console.log(`  handSize  (shipped, passTarget most) ${(gotMost / Math.max(1, decisions)).toFixed(3)}   picks best ${pct(agreeMost, decisions)}`)
console.log(`  reach                              ${(gotReach / Math.max(1, decisions)).toFixed(3)}   picks best ${pct(agreeReach, decisions)}`)
console.log(`  hybrid (reach, hand breaks ties)   ${(gotHybrid / Math.max(1, decisions)).toFixed(3)}   picks best ${pct(agreeHybrid, decisions)}`)
