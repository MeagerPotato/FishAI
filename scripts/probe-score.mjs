/**
 * probe-score.mjs — the population MONET.md §3.3c's score term can reach, measured at home.
 *
 * The decision half of lock hold reads 0.01-0.05 events in every score state on Monet v0.3
 * (300 games): a provable set is cashed at the next window whatever the score. So a score term
 * on the declare path can only act on the speculative near-misses, and the table below is the
 * size of that population. MONET.md 3.3c records the decision this measurement supports.
 *
 *   node scripts/probe-score.mjs [games=300] [version=v0.3]
 *
 * Three reads over mirror games of the named version, every window decision traced:
 *  1. window declares by trace kind, split by the score state of the deciding seat's team
 *     (own sets, opp sets) relative to the clinch target T: own=T-1 / opp=T-1 / both / neither;
 *  2. the ev-claim NEAR-MISS population — a speculative plan that passed the structural gates
 *     (all uncertain cards on teammates) and was refused ONLY by its bar — with its p and bar,
 *     split the same way. This is the only population a lower bar at own=T-1 can move;
 *  3. lock hold (events from "provable to some seat on the owning team" to the cash), split by the
 *     score state at the moment of provability, and its decision half (provable to the claimer).
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const { newGame, reduce, seatView, us54Config, legalActionsSummary, hashSeed, allBooks, bookCards, seatTeam, clinchTarget } = ENG
const { monetPolicy, decideExplained, buildKnowledge } = BOTS

const GAMES = Number(process.argv[2] ?? 300)
const VERSION = process.argv[3] ?? 'v0.3'
const POLICY = monetPolicy(VERSION)
const T = clinchTarget(us54Config)
const books = allBooks(us54Config)

function scoreState(view, seat) {
  const mine = seatTeam(seat)
  let own = 0, opp = 0
  for (const b of books) {
    const o = view.books[b]?.outcome
    if (o !== 'team0' && o !== 'team1') continue
    if ((o === 'team0' ? 0 : 1) === mine) own++
    else opp++
  }
  const key = own >= T - 1 && opp >= T - 1 ? 'both' : own >= T - 1 ? 'own' : opp >= T - 1 ? 'opp' : 'neither'
  return { own, opp, key }
}
const KEYS = ['neither', 'own', 'opp', 'both']
const mk = () => Object.fromEntries(KEYS.map((k) => [k, 0]))
const windows = mk()
const declares = {}       // kind -> per-key counts
const nearMiss = mk()     // count
const nearMissP = Object.fromEntries(KEYS.map((k) => [k, []]))
const nearMissBar = Object.fromEntries(KEYS.map((k) => [k, []]))
const holds = Object.fromEntries(KEYS.map((k) => [k, []]))
const decisionHalf = Object.fromEntries(KEYS.map((k) => [k, []]))
let declaresTotal = 0, windowsTotal = 0

function provableTo(k, seat, book) {
  const team = seatTeam(seat)
  for (const c of bookCards(book, us54Config)) {
    const h = k.holders[c]
    if (h === undefined || seatTeam(h) !== team) return false
  }
  return true
}

for (let g = 0; g < GAMES; g++) {
  const seed = `score-${g}`
  let s = newGame(seed, us54Config, g % 6)
  // per (seat, book): log length at which it became provable to that seat; per (team, book): to any seat of the team
  const sinceSeat = [0, 1, 2, 3, 4, 5].map(() => ({}))
  const sinceTeam = [{}, {}]
  const stateAtTeam = [{}, {}]
  let guard = 0
  while (s.phase !== 'finished') {
    if (guard++ >= 6000) throw new Error('cap')
    const now = s.log.length
    // provability bookkeeping at this state
    for (let seat = 0; seat < 6; seat++) {
      const v = seatView(s, seat)
      const k = buildKnowledge(v)
      for (const b of books) {
        if (s.books[b]) { sinceSeat[seat][b] = null; continue }
        if (provableTo(k, seat, b)) { if (sinceSeat[seat][b] == null) sinceSeat[seat][b] = now }
        else sinceSeat[seat][b] = null
      }
    }
    for (const team of [0, 1]) {
      for (const b of books) {
        if (s.books[b]) { sinceTeam[team][b] = null; continue }
        const any = [0, 1, 2, 3, 4, 5].filter((x) => seatTeam(x) === team).some((x) => sinceSeat[x][b] != null)
        if (any) {
          if (sinceTeam[team][b] == null) {
            sinceTeam[team][b] = now
            const anySeat = [0, 1, 2, 3, 4, 5].find((x) => seatTeam(x) === team)
            stateAtTeam[team][b] = scoreState(seatView(s, anySeat), anySeat).key
          }
        } else sinceTeam[team][b] = null
      }
    }
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const moveSeed = hashSeed(`${seed}:${s.moveIndex}`)()
    const ex = decideExplained(view, POLICY, moveSeed)
    const action = ex.action
    if (view.declareWindow) {
      windowsTotal++
      const st = scoreState(view, seat)
      windows[st.key]++
      if (action.type === 'claim') {
        declaresTotal++
        const kind = ex.trace?.kind ?? 'none'
        declares[kind] ??= mk()
        declares[kind][st.key]++
        const team = seatTeam(seat)
        const b = action.book
        if (sinceTeam[team][b] != null) {
          holds[stateAtTeam[team][b]].push(now - sinceTeam[team][b])
          if (sinceSeat[seat][b] != null) decisionHalf[stateAtTeam[team][b]].push(now - sinceSeat[seat][b])
        }
      } else {
        for (const r of ex.trace?.refused ?? []) {
          if (r.kind !== 'ev-claim') continue
          const m = /best speculative plan is \S+ at p = ([0-9.]+), below the bar of ([0-9.]+)/.exec(r.reason)
          if (!m) continue
          nearMiss[st.key]++
          nearMissP[st.key].push(Number(m[1]))
          nearMissBar[st.key].push(Number(m[2]))
        }
      }
    }
    const r = reduce(s, action)
    if (!r.ok) throw new Error(r.error.code)
    s = r.state
  }
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const q = (a, p) => { const t = [...a].sort((x, y) => x - y); return t.length ? t[Math.floor(p * (t.length - 1))] : NaN }
console.log(`=== score-state probe: Monet ${VERSION}, ${GAMES} mirror games, T=${T} ===`)
console.log(`window decisions ${windowsTotal}, declares ${declaresTotal}`)
console.log('score state at the window: ' + KEYS.map((k) => `${k}=${windows[k]}`).join('  '))
console.log('--- declares by trace kind x score state ---')
for (const [kind, per] of Object.entries(declares)) console.log(`  ${kind.padEnd(16)} ` + KEYS.map((k) => `${k}=${per[k]}`).join('  '))
console.log('--- ev-claim near misses (passed allOnTeam, refused only by the bar) ---')
for (const k of KEYS) console.log(`  ${k.padEnd(8)} n=${nearMiss[k]}  mean p ${mean(nearMissP[k]).toFixed(3)}  p50 ${q(nearMissP[k], 0.5)}  p90 ${q(nearMissP[k], 0.9)}  mean bar ${mean(nearMissBar[k]).toFixed(3)}`)
console.log('--- lock hold by score state at provability (events; team half = provable to any teammate; decision half = provable to the claimer) ---')
for (const k of KEYS) console.log(`  ${k.padEnd(8)} n=${holds[k].length}  team-hold mean ${mean(holds[k]).toFixed(2)} p50 ${q(holds[k], 0.5)} p90 ${q(holds[k], 0.9)}   decision-half mean ${mean(decisionHalf[k]).toFixed(2)} (n=${decisionHalf[k].length})`)
