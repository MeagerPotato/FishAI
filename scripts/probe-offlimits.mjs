/**
 * probe-offlimits.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * Answers the one empirical question the off-limits mechanism stands on: does the position the
 * owner describes actually occur, and can a seat SEE it from the public view alone?
 *
 * Ground truth is read from GameState.hands (this is a measurement harness, not a bot).
 * Detectability is read from buildKnowledge over each seat's SeatView — exactly what a bot has.
 */
import { newGame, reduce, seatView, us54Config, allBooks, bookCards, cardBook, seatTeam, ALL_SEATS } from '../lib/engine/index.ts'
import { buildKnowledge, holderOf } from '../lib/engine/bots/knowledge.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const books = allBooks(config)
const GAMES = Number(process.argv[2] ?? 200)

// counters
let decisions = 0
let truthPlayer51 = 0          // some seat holds 5 of an unresolved set, an opponent holds the 6th
let truthHarvest = 0           // some opponent X has a licence in B and the acting seat's team holds >=2 of B
let seenLicenceCertain = 0     // ... and the acting seat can CERTAINLY locate a card of B at X
let seenLicenceConstraint = 0  // ... or a surviving deal-time constraint pins X to B
let seenHarvestable = 0        // ... and the acting seat's team certainly accounts for >=2 of B
let detected = 0               // licence (either route) AND >=2 certainly on team => the mechanism fires
let detected51 = 0             // the strict 5-1 case, detected
let seenLicenceLog = 0         // X asked into B in the log and cannot have shed every card of B
let detectedLog = 0            // log-licence AND >=2 located
let detected51Log = 0

for (let g = 0; g < GAMES; g++) {
  const seed = `probe-${g}`
  let st = newGame(seed, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 4000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const k = buildKnowledge(view, { useConstraints: true })
    const myTeam = seatTeam(seat)

    // ---- log-derived licences: who has publicly shown a basis in which set (row 6) ----
    // An ask into B proves the asker held >= 1 card of B at that moment. It can only lose that
    // basis by handing cards of B away on later HITS against it, which are themselves public.
    const logLicence = new Map() // seat -> Set<BookId>
    for (const s0 of ALL_SEATS) logLicence.set(s0, new Set())
    for (const ev of view.log) {
      if (ev.type !== 'ask') continue
      logLicence.get(ev.asker).add(cardBook(ev.card))
      if (ev.hit) logLicence.get(ev.asker).add(cardBook(ev.card))   // the asker now holds it
    }
    // retire a licence when the set is resolved
    for (const s0 of ALL_SEATS) for (const b0 of [...logLicence.get(s0)]) if (view.books[b0]) logLicence.get(s0).delete(b0)

    // ---- ground truth over the real hands ----
    for (const b of books) {
      if (st.books[b]) continue
      const cards = bookCards(b, config)
      const bySeat = ALL_SEATS.map((s) => cards.filter((c) => st.hands[s].includes(c)).length)
      // strict 5-1 across the team line
      const five = ALL_SEATS.find((s) => bySeat[s] === 5)
      if (five !== undefined) {
        const other = ALL_SEATS.find((s) => bySeat[s] === 1 && seatTeam(s) !== seatTeam(five))
        if (other !== undefined) {
          truthPlayer51++
          // is it detected by THIS seat, about the opponent it must not hand the turn to?
          const danger = seatTeam(five) === myTeam ? other : five
          if (seatTeam(danger) !== myTeam) {
            const lic = cards.some((c) => holderOf(k, c) === danger) ||
              k.constraints.some((kc) => kc.seat === danger && kc.cards.every((c) => cardBook(c) === b))
            const mine = cards.filter((c) => { const h = holderOf(k, c); return h !== null && seatTeam(h) === myTeam }).length
            if (lic && mine >= 2) detected51++
            const licLog = lic || logLicence.get(danger).has(b)
            if (licLog && mine >= 2) detected51Log++
          }
        }
      }
      // the general harvest threat: an opponent with a licence, pointed at >=2 of my team's cards
      for (const x of ALL_SEATS) {
        if (seatTeam(x) === myTeam) continue
        if (st.hands[x].length === 0) continue
        if (bySeat[x] < 1) continue
        const mineTrue = ALL_SEATS.filter((s) => seatTeam(s) === myTeam).reduce((n, s) => n + bySeat[s], 0)
        if (mineTrue < 2) continue
        truthHarvest++
        const certain = cards.some((c) => holderOf(k, c) === x)
        const constrained = k.constraints.some((kc) => kc.seat === x && kc.cards.every((c) => cardBook(c) === b))
        if (certain) seenLicenceCertain++
        if (!certain && constrained) seenLicenceConstraint++
        const mineSeen = cards.filter((c) => { const h = holderOf(k, c); return h !== null && seatTeam(h) === myTeam }).length
        if (mineSeen >= 2) seenHarvestable++
        if ((certain || constrained) && mineSeen >= 2) detected++
        const lgl = certain || constrained || logLicence.get(x).has(b)
        if (lgl) seenLicenceLog++
        if (lgl && mineSeen >= 2) detectedLog++
        break // count each (decision, book) once
      }
    }
    decisions++

    const action = decide(view, STYLE_ROSTER.balanced, steps)
    const r = reduce(st, action)
    if (!r.ok) break
    st = r.state
    steps++
  }
}

const pct = (a, b) => (b === 0 ? '  n/a' : `${((100 * a) / b).toFixed(1)}%`)
console.log(`games ${GAMES}, decisions ${decisions}`)
console.log(`strict 5-1 positions (ground truth, per decision-book) : ${truthPlayer51}`)
console.log(`  of which the endangered seat DETECTS it              : ${detected51}  (${pct(detected51, truthPlayer51)})`)
console.log(`harvest threats (opponent licence + >=2 of mine)       : ${truthHarvest}`)
console.log(`  licence seen as a CERTAIN card at that opponent      : ${seenLicenceCertain}  (${pct(seenLicenceCertain, truthHarvest)})`)
console.log(`  licence seen only via a surviving deal constraint    : ${seenLicenceConstraint}  (${pct(seenLicenceConstraint, truthHarvest)})`)
console.log(`  >=2 of the set certainly located on my own team      : ${seenHarvestable}  (${pct(seenHarvestable, truthHarvest)})`)
console.log(`  FULLY DETECTED (licence AND >=2 located)             : ${detected}  (${pct(detected, truthHarvest)})`)
console.log('--- with the LOG-DERIVED licence (row 6: an ask publishes a basis) ---')
console.log(`  licence known by any route incl. the log             : ${seenLicenceLog}  (${pct(seenLicenceLog, truthHarvest)})`)
console.log(`  FULLY DETECTED with the log licence                  : ${detectedLog}  (${pct(detectedLog, truthHarvest)})`)
console.log(`  strict 5-1 detected with the log licence             : ${detected51Log}  (${pct(detected51Log, truthPlayer51)})`)
