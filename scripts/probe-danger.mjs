/**
 * probe-danger.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * Validates the estimator mechanism (1) would be built on, BEFORE building the policy on it.
 *
 * The quantity that matters is: when I miss on seat X, X takes the turn (row 10) and then runs
 * a chain of hits (row 9) until it misses. How many cards does it take from my team? If a score
 * computed from the public view predicts that number, the off-limits mechanism has a foundation.
 * If it does not, the mechanism is theatre.
 *
 * Candidate estimators, all pure over (view, k, X):
 *   handSize  — the proxy contained.ts::valueContainedPass already uses: counts[X].
 *   licence   — sets X has publicly shown a basis in (row 6, read off the log), times the cards
 *               of those sets this seat can certainly locate on its OWN team (X's reachable prey).
 *   combined  — licence, falling back on hand size where nothing is known.
 */
import { newGame, reduce, seatView, us54Config, allBooks, bookCards, cardBook, seatTeam, ALL_SEATS } from '../lib/engine/index.ts'
import { buildKnowledge, holderOf, rankAsksWith, refinedHitProbability } from '../lib/engine/bots/knowledge.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const books = allBooks(config)
const GAMES = Number(process.argv[2] ?? 300)

/** Sets `s` has publicly shown a basis in (row 6), minus sets already resolved. */
function logLicences(view, s) {
  const out = new Set()
  for (const ev of view.log) {
    if (ev.type !== 'ask') continue
    if (ev.asker === s) out.add(cardBook(ev.card))
    else if (ev.hit && ev.target === s) { /* s just lost that card; no basis implied */ }
  }
  for (const b of [...out]) if (view.books[b]) out.delete(b)
  return out
}

/** Cards of `b` this seat can certainly locate on its own team — X's reachable prey in b. */
function preyIn(view, k, b) {
  const myTeam = seatTeam(view.seat)
  let n = 0
  for (const c of bookCards(b, config)) {
    const h = holderOf(k, c)
    if (h !== null && seatTeam(h) === myTeam) n++
  }
  return n
}

const rows = []   // { handSize, licence, combined, actual }
const oppRows = []  // { danger, p } — danger of each opponent vs the best hit probability there

for (let g = 0; g < GAMES; g++) {
  let st = newGame(`dgr-${g}`, config, 0)
  let steps = 0
  const pending = []   // { seat: X, victimTeam, taken }
  while (st.phase !== 'finished' && steps < 4000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const action = decide(view, STYLE_ROSTER.balanced, steps)

    // record the estimate at the moment a miss is about to concede the turn
    // For every ask decision, record each opponent's danger against the best hit probability
    // this seat could get by asking THAT opponent. This is the confound test.
    if (action.type === 'ask') {
      const k2 = buildKnowledge(view, { useConstraints: true })
      const rk = rankAsksWith(view, k2, STYLE_ROSTER.balanced)
      const bestP = new Map()
      for (const r of rk) {
        const pr = refinedHitProbability(k2, r.card, r.target)
        if (!bestP.has(r.target) || pr > bestP.get(r.target)) bestP.set(r.target, pr)
      }
      for (const [tgt, pr] of bestP) {
        let d = 0
        for (const b of logLicences(view, tgt)) d += preyIn(view, k2, b)
        oppRows.push({ danger: d, p: pr })
      }
    }
    let record = null
    if (action.type === 'ask') {
      const willHit = st.hands[action.target].includes(action.card)
      if (!willHit) {
        const k = buildKnowledge(view, { useConstraints: true })
        const X = action.target
        const lic = logLicences(view, X)
        let licScore = 0
        for (const b of lic) licScore += preyIn(view, k, b)
        record = { phase: view.log.length, handSize: view.counts[X], licence: licScore, combined: licScore > 0 ? licScore : view.counts[X] / 3, victimTeam: seatTeam(seat), X, taken: 0 }
      }
    }

    // Settle any open run. Only ASKS move cards or the turn: declines and out-of-turn declares
    // interleave freely inside a us54 window (RULES_US54.md §3) and must NOT truncate the run.
    if (action.type === 'ask' && pending.length > 0) {
      const cur = pending[pending.length - 1]
      if (action.seat === cur.X) {
        const hit = st.hands[action.target].includes(action.card)
        if (hit && seatTeam(action.target) === cur.victimTeam) cur.taken++
        if (!hit) { rows.push(cur); pending.pop() }
      } else {
        // somebody else is asking, so X's run is over
        rows.push(cur); pending.pop()
      }
    }
    if (record) pending.push(record)

    const r = reduce(st, action)
    if (!r.ok) break
    st = r.state
    steps++
  }
  while (pending.length) rows.push(pending.pop())
}

function corr(xs, ys) {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy)
}

const actual = rows.map((r) => r.taken)
console.log(`conceded turns observed: ${rows.length}  (${GAMES} games)`)
console.log(`mean cards taken from the conceding team per conceded turn: ${(actual.reduce((a, b) => a + b, 0) / rows.length).toFixed(3)}`)
console.log(`  P(0 taken) = ${((100 * actual.filter((a) => a === 0).length) / rows.length).toFixed(1)}%   P(>=2 taken) = ${((100 * actual.filter((a) => a >= 2).length) / rows.length).toFixed(1)}%   max = ${Math.max(...actual)}`)
for (const key of ['handSize', 'licence', 'combined']) {
  console.log(`corr(${key.padEnd(9)}, cards actually taken) = ${corr(rows.map((r) => r[key]), actual).toFixed(4)}`)
}
// decile lift on the licence score
const sorted = [...rows].sort((a, b) => a.licence - b.licence)
const top = sorted.slice(Math.floor(sorted.length * 0.9))
const bot = sorted.slice(0, Math.floor(sorted.length * 0.1))
const mean = (a) => a.reduce((s, r) => s + r.taken, 0) / Math.max(1, a.length)
console.log(`licence score, top decile   -> mean cards taken ${mean(top).toFixed(3)}`)
console.log(`licence score, bottom decile-> mean cards taken ${mean(bot).toFixed(3)}`)

// Phase control: the negative hand-size correlation could be an artifact of hand sizes falling
// as the game goes on and information accumulating at the same time. Re-run both correlations
// WITHIN log-length buckets, where phase is roughly held constant.
// Least-squares fit of cards-taken on the licence score: the coefficients mechanism (1)'s
// danger term needs, in cards.
{
  const xs = rows.map((r) => r.licence), ys = actual
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2 }
  const slope = sxy / sxx, intercept = my - slope * mx
  console.log('')
  console.log(`LINEAR FIT  cardsTaken ~= ${intercept.toFixed(4)} + ${slope.toFixed(4)} * licence   (mean licence ${mx.toFixed(2)})`)
}
console.log('')
console.log('--- is DANGER confounded with OPPORTUNITY? ---')
console.log('  (if the dangerous seat is also the seat most likely to hold the card I want,')
console.log('   then penalising danger is penalising the best ask, and the mechanism backfires)')
{
  const xs = oppRows.map((r) => r.danger), ys = oppRows.map((r) => r.p)
  console.log(`  n = ${xs.length}`)
  console.log(`  corr(danger(target), best hit probability available at that target) = ${corr(xs, ys).toFixed(4)}`)
  const bySeatHi = oppRows.filter((r) => r.danger >= 2), bySeatLo = oppRows.filter((r) => r.danger < 2)
  const m = (a, f) => a.reduce((s2, r) => s2 + f(r), 0) / Math.max(1, a.length)
  console.log(`  high-danger targets (>=2 prey-cards): n=${bySeatHi.length}  mean best p = ${m(bySeatHi, (r) => r.p).toFixed(3)}`)
  console.log(`  low-danger  targets (< 2 prey-cards): n=${bySeatLo.length}  mean best p = ${m(bySeatLo, (r) => r.p).toFixed(3)}`)
}
console.log('')
console.log('--- controlling for game phase (log-length buckets) ---')
const edges = [0, 40, 80, 120, 160, 220, 1e9]
for (let i = 0; i < edges.length - 1; i++) {
  const bucket = rows.filter((r) => r.phase >= edges[i] && r.phase < edges[i + 1])
  if (bucket.length < 200) continue
  const a = bucket.map((r) => r.taken)
  console.log(`  log ${String(edges[i]).padStart(3)}-${String(edges[i+1] === 1e9 ? 'inf' : edges[i+1]).padEnd(3)} n=${String(bucket.length).padStart(5)}  mean taken ${(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2)}  corr(hand)=${corr(bucket.map((r) => r.handSize), a).toFixed(3)}  corr(licence)=${corr(bucket.map((r) => r.licence), a).toFixed(3)}`)
}
