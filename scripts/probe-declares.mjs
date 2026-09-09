/**
 * probe-declares.mjs - MONET.md 3.8ae's instrument: SESTINA's declare policy read off the bridge records (their
 * engine's output - data, not code), against ours in the same games. No engine view is built; the walk tracks
 * the true deal and what a hit has published, and reads every declare for what its maker knew and when it came:
 *
 *   - own / public / guessed: of the half-suit's six cards, how many the claimer held, how many a hit had
 *     publicly placed at the seat the claimer named, and how many it had to place by belief (and how many of
 *     those were right);
 *   - complete: whether the six were all on the claimer's team at that moment (a declare of an incomplete
 *     half-suit is wrong by construction - a gamble), and the delay since completion in events and in the
 *     team's own asks (asks the team chose over declaring);
 *   - forced declares, outcomes, declares a game.
 *
 *     node scripts/probe-declares.mjs --records <dir>[,<dir>...] [--max-files N] [--spec-b <spec>] [--out summary.json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { recordFiles, readHeader, readRecordFile } from './bridge-records.mjs'
const CARDS = await import(pathToFileURL(process.cwd() + '/lib/engine/cards.ts').href)
const ENG = await import(pathToFileURL(process.cwd() + '/lib/engine/index.ts').href)
const { us54Config } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const DIRS = argOf('--records', '').split(',').filter(Boolean)
const MAX_FILES = Number(argOf('--max-files', 0))
const SPEC_B = argOf('--spec-b', 'v07:r12=25,rtie=1,pool=-1,oppfloor=-1,force=1000000,askfloor=-1,stall=12,s1=1,det=12,cand=4,kappa=2.5,rbelief=indep,depth=12,maxq=26')
const OUT = argOf('--out', '')
if (DIRS.length === 0) {
  console.error('--records is required')
  process.exit(2)
}
const team = (seat) => seat % 2

function newSide() {
  return {
    declares: 0, forced: 0, right: 0, gambles: 0, gamblesRight: 0,
    own: 0, pub: 0, guessed: 0, guessedRight: 0,
    guessHist: [0, 0, 0, 0, 0, 0, 0], // by the number of guessed cards
    rightByGuessed: [0, 0, 0, 0, 0, 0, 0],
    delayEvents: 0, delayAsks: 0, delayN: 0, immediate: 0, delayAsksHist: [0, 0, 0, 0, 0, 0], // 0,1,2,3,4,5+
    completeOwn: 0, // half-suits that became complete on this side (opportunities)
    completeDeclaredBySelf: 0, completeLost: 0, broken: 0, // ... declared by the side itself; taken by the other side; broken by the other side's hit before the declare
  }
}
const sides = { sestina: newSide(), ours: newSide() }
let games = 0, files = 0, skipped = 0
const seen = new Set()

for (const dir of DIRS) {
  for (const file of recordFiles(dir)) {
    if (MAX_FILES && files >= MAX_FILES) break
    const h = readHeader(file)
    if (h.specB !== SPEC_B || !String(h.specA).startsWith('bot:')) { skipped++; continue }
    files++
    for (const rec of readRecordFile(file)) {
      games++
      const key = rec.label
      if (seen.has(key)) continue
      seen.add(key)
      const sestinaTeam = 1 - rec.teamA
      const sideOf = (seat) => (team(seat) === sestinaTeam ? 'sestina' : 'ours')
      const seatOf = new Map()
      rec.hands0.forEach((hand, x) => hand.forEach((c) => seatOf.set(c, x)))
      const publicAt = new Map()
      const complete = new Map() // book -> { team, since: event index, asks: the team's asks since }
      const resolvedBooks = new Set()
      const books = [...new Set([...seatOf.keys()].map((c) => CARDS.cardBook(c)))]
      const cardsOf = new Map(books.map((b) => [b, CARDS.bookCards(b, us54Config)]))
      const refresh = (i) => {
        for (const b of books) {
          if (resolvedBooks.has(b)) continue
          const cs = cardsOf.get(b)
          let t = -1, ok = true
          for (const c of cs) {
            const x = seatOf.get(c)
            if (x === undefined) { ok = false; break }
            const tx = team(x)
            if (t < 0) t = tx
            else if (tx !== t) { ok = false; break }
          }
          const cur = complete.get(b)
          if (ok) {
            if (!cur || cur.team !== t) complete.set(b, { team: t, since: i, asks: 0 })
          } else if (cur) {
            // a complete half-suit broken by the other team's hit: the price of waiting to declare
            sides[cur.team === sestinaTeam ? 'sestina' : 'ours'].broken++
            complete.delete(b)
          }
        }
      }
      refresh(-1)
      for (let i = 0; i < rec.events.length; i++) {
        const ev = rec.events[i]
        if (ev.type === 'ask') {
          for (const [b, st] of complete) if (st.team === team(ev.asker)) st.asks++
          if (ev.hit) { seatOf.set(ev.card, ev.asker); publicAt.set(ev.card, ev.asker) }
          refresh(i)
        } else if (ev.type === 'claim') {
          const side = sides[sideOf(ev.claimer)]
          const cs = cardsOf.get(ev.book)
          const st = complete.get(ev.book)
          const isComplete = !!st && st.team === team(ev.claimer)
          const right = ev.outcome === `team${team(ev.claimer)}`
          let own = 0, pub = 0, guessed = 0, guessedRight = 0
          for (const c of cs) {
            const truth = seatOf.get(c)
            const named = ev.assignments[c]
            if (truth === ev.claimer) own++
            else if (publicAt.get(c) === named) pub++
            else { guessed++; if (named === truth) guessedRight++ }
          }
          side.declares++
          if (ev.forced) side.forced++
          if (right) side.right++
          if (!isComplete) { side.gambles++; if (right) side.gamblesRight++ }
          side.own += own; side.pub += pub; side.guessed += guessed; side.guessedRight += guessedRight
          side.guessHist[Math.min(guessed, 6)]++
          if (right) side.rightByGuessed[Math.min(guessed, 6)]++
          if (isComplete) {
            side.delayEvents += i - st.since; side.delayAsks += st.asks; side.delayN++
            if (st.asks === 0) side.immediate++
            side.delayAsksHist[Math.min(st.asks, 5)]++
          }
          // the opportunity: a half-suit complete on some team is resolved here
          if (st) {
            const owner = sides[st.team === sestinaTeam ? 'sestina' : 'ours']
            owner.completeOwn++
            if (st.team === team(ev.claimer)) owner.completeDeclaredBySelf++
            else owner.completeLost++
          }
          resolvedBooks.add(ev.book)
          complete.delete(ev.book)
          for (const c of cs) { seatOf.delete(c); publicAt.delete(c) }
          refresh(i)
        }
      }
      // half-suits complete at the end and never declared
      for (const [, st] of complete) { const owner = sides[st.team === sestinaTeam ? 'sestina' : 'ours']; owner.completeOwn++ }
    }
  }
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(2) + '%' : '-')
const num = (a, b, d = 2) => (b ? (a / b).toFixed(d) : '-')
const rows = []
rows.push(`files ${files} (skipped ${skipped}), games ${seen.size}`)
rows.push('')
rows.push('| side | declares a game | right | forced | gambles (incomplete) | own / public / guessed a declare | guess accuracy | 0 / 1 / 2 / 3+ guessed (right) | delay since complete: events, team asks | declared at once | 1 / 2 / 3 / 4 / 5+ asks first | complete half-suits: declared by self / lost / undeclared / broken by a hit |')
rows.push('|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const name of ['sestina', 'ours']) {
  const s = sides[name]
  const gh = (k) => `${s.guessHist[k]} (${pct(s.rightByGuessed[k], s.guessHist[k])})`
  const g3 = s.guessHist.slice(3).reduce((a, b) => a + b, 0), r3 = s.rightByGuessed.slice(3).reduce((a, b) => a + b, 0)
  rows.push(`| **${name}** | ${num(s.declares, seen.size, 3)} | ${pct(s.right, s.declares)} | ${pct(s.forced, s.declares)} | ${s.gambles} (${pct(s.gambles, s.declares)}; right ${pct(s.gamblesRight, s.gambles)}) | ${num(s.own, s.declares)} / ${num(s.pub, s.declares)} / ${num(s.guessed, s.declares)} | ${pct(s.guessedRight, s.guessed)} | ${gh(0)} / ${gh(1)} / ${gh(2)} / ${g3} (${pct(r3, g3)}) | ${num(s.delayEvents, s.delayN)}, ${num(s.delayAsks, s.delayN)} | ${pct(s.immediate, s.delayN)} | ${s.delayAsksHist.slice(1).map((n) => pct(n, s.delayN)).join(' / ')} | ${s.completeDeclaredBySelf} / ${s.completeLost} / ${s.completeOwn - s.completeDeclaredBySelf - s.completeLost} / ${s.broken} |`)
}
console.log(rows.join('\n'))
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ files, skipped, games: seen.size, sides }, null, 1))
