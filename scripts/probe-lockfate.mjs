/**
 * probe-lockfate.mjs - what happens to a LOCKED set (all six cards in one team's hands) between
 * the moment it forms and the moment it is resolved, in mirror games at home.
 *
 *   node scripts/probe-lockfate.mjs [--games 200] [--version v0.4c] [--label plf]
 *
 * For every (game, team, book): the first event after which the six cards sit in one team's
 * hands with the book unresolved is the lock's formation. Then: CASHED - the team claims the
 * book correctly while it is still whole; BROKEN - an opponent takes a card of the book first
 * (and then who finally wins the book); GIFTED - the team declares it wrongly while whole;
 * OPEN - the game ends with the lock still unresolved. Events are engine actions (asks, claims,
 * window moves alike). Reported: locks a game, the fate shares, events from formation to cash,
 * and the number of declare windows the holding team had between formation and cash (the
 * chances it had to cash earlier).
 */
import { pathToFileURL } from 'node:url'
const ENG = await import(pathToFileURL(process.cwd() + '/lib/engine/index.ts').href)
const MON = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/monet.ts').href)
const CARDS = await import(pathToFileURL(process.cwd() + '/lib/engine/cards.ts').href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, reduce, decide } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const GAMES = Number(argOf('--games', 200))
const VERSION = argOf('--version', 'v0.4c')
const LABEL = argOf('--label', 'plf')
const pol = MON.monetPolicy(VERSION)
const team = (seat) => seat % 2
const bookOf = (c) => CARDS.cardBook(c)
const BOOKS = [...new Set(CARDS.allCards(us54Config).map(bookOf))]

function lockOwner(s, b) {
  // the team holding every card of book b, or -1
  let t = -1
  for (let x = 0; x < 6; x++) for (const c of s.hands[x]) if (bookOf(c) === b) { const tx = team(x); if (t === -1) t = tx; else if (t !== tx) return -1 }
  return t
}

const fates = { cashed: 0, broken: 0, gifted: 0, open: 0 }
const brokenFinal = { us: 0, them: 0, open: 0 }
const toCash = [], windowsToCash = []
let locks = 0
const t0 = Date.now()
for (let g = 0; g < GAMES; g++) {
  const label = `${LABEL}-${g}`
  let s = newGame(label, us54Config, 0)
  const live = new Map() // book -> { team, formedAt, windows }
  let n = 0
  while (s.phase !== 'finished' && n++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    // a declare window for the holding team counts as a chance
    if (view.declareWindow) for (const L of live.values()) if (team(seat) === L.team) L.windows++
    const a = decide(view, pol, hashSeed(`${label}:${s.moveIndex}`)())
    const before = s
    const r = reduce(s, a)
    if (!r.ok) throw new Error(`${label}: ${r.error.code} at ${s.moveIndex}`)
    s = r.state
    // resolve fates on the transition
    for (const [b, L] of [...live]) {
      if (s.books[b] !== undefined && before.books[b] === undefined) {
        // the book was resolved by this action
        const winner = s.books[b].outcome === "team0" ? 0 : s.books[b].outcome === "team1" ? 1 : -1
        const stillWhole = lockOwner(before, b) === L.team
        if (a.type === 'claim' && team(a.seat) === L.team && stillWhole) {
          if (winner === L.team) { fates.cashed++; toCash.push(s.moveIndex - L.formedAt); windowsToCash.push(L.windows) }
          else fates.gifted++
        } else if (!stillWhole) {
          // already counted as broken when it broke; here we learn the final owner
          if (winner === L.team) brokenFinal.us++; else brokenFinal.them++
        } else {
          // resolved while whole by someone else (an opponent's declaration of our locked set, or a rule)
          if (winner === L.team) fates.cashed++; else fates.gifted++
        }
        live.delete(b)
        continue
      }
      if (lockOwner(s, b) !== L.team && !L.broken) { L.broken = true; fates.broken++ }
    }
    // new locks
    for (const b of BOOKS) {
      if (s.books[b] !== undefined) continue
      if (live.has(b)) continue
      const t = lockOwner(s, b)
      if (t !== -1) { locks++; live.set(b, { team: t, formedAt: s.moveIndex, windows: 0, broken: false }) }
    }
  }
  for (const L of live.values()) { if (L.broken) brokenFinal.open++; else fates.open++ }
}
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
const secs = (Date.now() - t0) / 1000
console.log(`=== probe-lockfate: ${VERSION}, ${GAMES} mirror games (${LABEL}-*), ${secs.toFixed(1)}s ===`)
console.log(`locks formed ${locks} (${(locks / GAMES).toFixed(2)} a game)`)
console.log(`fates: cashed whole ${fates.cashed} (${(100 * fates.cashed / locks).toFixed(1)}%), broken by an opponent's hit ${fates.broken} (${(100 * fates.broken / locks).toFixed(1)}%; the book finally ours ${brokenFinal.us}, theirs ${brokenFinal.them}, open ${brokenFinal.open}), gifted by a wrong declaration ${fates.gifted}, open at the end ${fates.open}`)
console.log(`cashed locks: events from formation to cash mean ${mean(toCash).toFixed(2)}; declare windows the holding team had first: mean ${mean(windowsToCash).toFixed(2)}`)
