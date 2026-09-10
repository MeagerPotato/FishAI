// 3.8av's decision-type census: how often each kind of decision happens and how many legal options
// it carries. No rollouts -- this is what the sweep's pre-registration is sized on, measured rather
// than guessed, per the discipline 3.8au established.
import { pathToFileURL } from 'node:url'
const ENG = await import(pathToFileURL(process.cwd() + '/lib/engine/index.ts').href)
const MON = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/monet.ts').href)
const { newGame, us54Config, legalActionsSummary, legalAsksFromView, seatView, hashSeed, reduce, allBooks } = ENG

const argOf = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d }
const GAMES = Number(argOf('--games', 20))
const pol = MON.monetPolicy('v0.33')
const ALL_SEATS = [0, 1, 2, 3, 4, 5]
const teamOf = (s) => s % 2

const kinds = {}
const bump = (k, opts) => {
  const e = kinds[k] ?? (kinds[k] = { n: 0, opts: 0, optMax: 0, optOne: 0 })
  e.n++; e.opts += opts; if (opts > e.optMax) e.optMax = opts; if (opts <= 1) e.optOne++
}

for (let g = 0; g < GAMES; g++) {
  const label = `cen-${g}`
  let s = newGame(label, us54Config, 0)
  let n = 0
  while (s.phase !== 'finished' && n++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const a = ENG.decide(view, pol, hashSeed(`${label}:${s.moveIndex}`)())

    if (a.type === 'pass') {
      // a teammate with cards
      bump('pass', ALL_SEATS.filter((t) => t !== seat && teamOf(t) === teamOf(seat) && s.hands[t].length > 0).length)
    } else if (a.type === 'designate') {
      // an opponent with cards
      bump('designate', ALL_SEATS.filter((t) => teamOf(t) !== teamOf(seat) && s.hands[t].length > 0).length)
    } else if (a.type === 'ask') {
      bump('ask', legalAsksFromView(view).length)
    } else if (a.type === 'decline') {
      bump('decline', 2) // declare or decline
    } else if (a.type === 'claim') {
      const unresolved = allBooks(view.config).filter((b) => !view.books[b]).length
      bump(view.phase === 'endgame' ? 'claim-endgame' : (view.declareWindow ? 'claim-window' : 'claim-turn'), unresolved)
      // and, holding the book fixed, how many DIFFERENT legal assignments exist for it?
      const cards = Object.keys(a.assignments)
      const mates = ALL_SEATS.filter((t) => teamOf(t) === teamOf(seat) && s.hands[t].length > 0)
      let variants = 0
      const tryAssign = (i, acc) => {
        if (variants > 400) return
        if (i === cards.length) { if (reduce(s, { type: 'claim', seat, book: a.book, assignments: acc }).ok) variants++; return }
        for (const m of mates) tryAssign(i + 1, { ...acc, [cards[i]]: m })
      }
      tryAssign(0, {})
      bump('claim-assignment', variants)
    }

    const r = reduce(s, a)
    if (!r.ok) throw new Error(`${label}: ${r.error.code}`)
    s = r.state
  }
}

console.log(`=== 3.8av decision-type census: ${GAMES} games ===`)
console.log('| decision the bot makes | a game | legal options (mean) | max | forced (<=1 option) |')
console.log('|---|---:|---:|---:|---:|')
for (const [k, e] of Object.entries(kinds).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`| ${k} | ${(e.n / GAMES).toFixed(1)} | ${(e.opts / e.n).toFixed(1)} | ${e.optMax} | ${e.optOne} of ${e.n} (${(100 * e.optOne / e.n).toFixed(1)}%) |`)
}
console.log('')
console.log('REAL choices a game (more than one legal option):')
for (const [k, e] of Object.entries(kinds).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${k.padEnd(18)} ${((e.n - e.optOne) / GAMES).toFixed(1)}`)
}
