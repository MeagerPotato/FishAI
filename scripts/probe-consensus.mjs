/**
 * probe-consensus.mjs - what a determinization consensus would declare that Monet's certain claim
 * does not, and how right it would be.
 *
 *   node scripts/probe-consensus.mjs [--games 60] [--version v0.4c] [--det 16] [--label pc]
 *
 * Mirror games under VERSION. At every declare window, for the seat holding the option: what the
 * policy does (claim or decline), and for every unresolved book the seat holds a card of that the
 * policy does NOT claim, D deals are sampled from the seat's posterior (lib/engine/search's
 * sampleDeal). A book is a TEAM lock in a deal when its six cards sit in the seat's team's hands;
 * the modal assignment is the most frequent full holder assignment among the deals where it is a
 * team lock; the agreement is that fraction. Reported by agreement bin: how many such books, how
 * often the modal assignment is exactly right on the true deal (a claim would succeed), and how
 * often the six are truly on the team at all. Windows where the option seat could have declared
 * a set it does not know it has are the sets SESTINA cashes three events after the lock and
 * Monet nine (the bridge's lock-hold instrument).
 */
import { pathToFileURL } from 'node:url'
const ENG = await import(pathToFileURL(process.cwd() + '/lib/engine/index.ts').href)
const MON = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/monet.ts').href)
const KN = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/knowledge.ts').href)
const ST = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/style.ts').href)
const S = await import(pathToFileURL(process.cwd() + '/lib/engine/search/index.ts').href)
const CARDS = await import(pathToFileURL(process.cwd() + '/lib/engine/cards.ts').href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, reduce, decide } = ENG
const { mulberry32 } = await import(pathToFileURL(process.cwd() + '/lib/engine/rng.ts').href)

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const GAMES = Number(argOf('--games', 60))
const VERSION = argOf('--version', 'v0.4c')
const DET = Number(argOf('--det', 16))
const LABEL = argOf('--label', 'pc')
const OVER = argOf("--override", "") ? JSON.parse(argOf("--override", "")) : null
const base = MON.monetPolicy(VERSION)
const pol = OVER ? { ...base, style: { ...base.style, ...OVER } } : base
const { skill, style } = ST.resolvePolicy(pol)
const marginal = style.pModel === 'marginal'
const OPTS = { logWindow: skill.logWindow, useConstraints: skill.useConstraints, marginal, choiceKappa: marginal ? style.choiceKappa : undefined, choiceAdapt: marginal ? style.choiceAdapt : undefined, choicePrior: marginal ? style.choicePrior : undefined }
const team = (seat) => seat % 2
const bookOf = (c) => CARDS.cardBook(c)

const BINS = [['1.00', (f) => f >= 1], ['[0.90,1)', (f) => f >= 0.9 && f < 1], ['[0.75,0.90)', (f) => f >= 0.75 && f < 0.9], ['[0.50,0.75)', (f) => f >= 0.5 && f < 0.75], ['<0.50', (f) => f < 0.5]]
const bins = BINS.map(([name]) => ({ name, n: 0, exact: 0, onTeam: 0 }))
let windows = 0, claims = 0, evaluated = 0, nullDraws = 0, books = 0
const t0 = Date.now()
for (let g = 0; g < GAMES; g++) {
  const label = `${LABEL}-${g}`
  let s = newGame(label, us54Config, 0)
  let n = 0
  while (s.phase !== 'finished' && n++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const seed = hashSeed(`${label}:${s.moveIndex}`)()
    const a = decide(view, pol, seed)
    if (view.declareWindow && view.phase === 'playing') {
      windows++
      if (a.type === 'claim') claims++
      const claimed = a.type === 'claim' ? a.book : null
      const own = new Set(view.hand.map(bookOf))
      const open = Object.keys(view.books).length ? null : null
      const unresolved = []
      for (const b of own) if (!view.books[b] && b !== claimed) unresolved.push(b)
      if (unresolved.length > 0) {
        evaluated++
        const k = KN.buildKnowledge(view, OPTS)
        const rng = mulberry32(seed)
        const deals = []
        for (let d = 0; d < DET; d++) {
          const h = S.sampleDeal(view, k, rng)
          if (h === null) { nullDraws++; continue }
          deals.push(h)
        }
        if (deals.length === 0) continue
        for (const b of unresolved) {
          books++
          const keys = new Map()
          let teamLocks = 0
          for (const h of deals) {
            const assign = []
            let ours = true
            for (let x = 0; x < 6 && ours; x++) {
              for (const c of h[x]) if (bookOf(c) === b) { if (team(x) !== team(seat)) { ours = false; break } assign.push(`${c}@${x}`) }
            }
            if (!ours) continue
            teamLocks++
            const key = assign.sort().join(',')
            keys.set(key, (keys.get(key) ?? 0) + 1)
          }
          if (teamLocks === 0) continue
          let modal = '', mc = 0
          for (const [key, c] of keys) if (c > mc) { modal = key; mc = c }
          const f = mc / deals.length
          const truth = []
          let truthOurs = true
          for (let x = 0; x < 6; x++) for (const c of s.hands[x]) if (bookOf(c) === b) { if (team(x) !== team(seat)) truthOurs = false; truth.push(`${c}@${x}`) }
          const exact = truthOurs && truth.sort().join(',') === modal
          const bin = bins[BINS.findIndex(([, test]) => test(f))]
          bin.n++
          if (exact) bin.exact++
          if (truthOurs) bin.onTeam++
        }
      }
    }
    const r = reduce(s, a)
    if (!r.ok) throw new Error(`${label}: ${r.error.code} at ${s.moveIndex}`)
    s = r.state
  }
}
const secs = (Date.now() - t0) / 1000
console.log(`=== probe-consensus: ${VERSION}${OVER ? " " + JSON.stringify(OVER) : ""}, ${GAMES} mirror games (${LABEL}-*), D ${DET}, ${secs.toFixed(1)}s ===`)
console.log(`windows ${windows}; the policy claimed at ${claims} (${(claims / GAMES).toFixed(2)} a game); windows evaluated ${evaluated}; own unresolved books looked at ${books}; failed draws ${nullDraws}`)
console.log(`books NOT claimed by the policy whose sampled deals put all six on the team, by agreement of the modal assignment:`)
for (const b of bins) console.log(`  ${b.name.padEnd(12)} n ${String(b.n).padStart(6)}  (${(b.n / GAMES).toFixed(2)} a game)  modal assignment exactly right ${b.n ? (100 * b.exact / b.n).toFixed(1) : '-'}%   six truly on the team ${b.n ? (100 * b.onTeam / b.n).toFixed(1) : '-'}%`)
