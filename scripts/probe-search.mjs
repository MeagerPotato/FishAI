/**
 * probe-search.mjs - MONET.md 3.8a's home marker for the search arm, read against the truth.
 *
 *   node scripts/probe-search.mjs [--games 40] [--version v0.4c] [--label probe] [--search '{"det":8,...}']
 *
 * Plays mirror games with the search arm at every seat and, at every ask decision it searches,
 * scores what it did against the true deal: the pick and the played action are each rolled out
 * from the TRUE state with the same rollout key the arm uses (paired), and the difference is the
 * true paired advantage of what it played. Reported: ask decisions; searched; played a candidate
 * (the arm's own mean advantage and SE, averaged); the true paired advantage of the played
 * candidate over the pick (mean, SE) - the marker, which must be positive or the arm is a no-op;
 * the same for the best-mean candidate on every searched decision whether or not the guard let
 * it play (what the guard is holding back); and the true hit rates of pick and played ask.
 */
import { pathToFileURL } from 'node:url'
const ENG = await import(pathToFileURL(process.cwd() + '/lib/engine/index.ts').href)
const MON = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/monet.ts').href)
const S = await import(pathToFileURL(process.cwd() + '/lib/engine/search/index.ts').href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, reduce } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const GAMES = Number(argOf('--games', 40))
const VERSION = argOf('--version', 'v0.4c')
const LABEL = argOf('--label', 'probe')
const params = { ...S.SEARCH_DEFAULTS, ...JSON.parse(argOf('--search', '{}')) }
const pol = MON.monetPolicy(VERSION)
const team = (seat) => (seat % 2)

function stat(xs) {
  const n = xs.length
  if (n === 0) return { n, mean: NaN, se: NaN }
  const mean = xs.reduce((a, b) => a + b, 0) / n
  const v = n > 1 ? xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1) : 0
  return { n, mean, se: Math.sqrt(v / n) }
}
const fmt = (s) => `${s.mean.toFixed(3)} (SE ${s.se.toFixed(3)}, n ${s.n})`

let asks = 0, searched = 0, played = 0, hitPick = 0, hitPlayed = 0, bestHeld = 0
const ownAdv = [], ownSe = [], trueAdv = [], trueBest = [], trueHeld = []
const t0 = Date.now()
for (let g = 0; g < GAMES; g++) {
  const label = `${LABEL}-${g}`
  let s = newGame(label, us54Config, 0)
  let n = 0
  while (s.phase !== 'finished' && n++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const seed = hashSeed(`${label}:${s.moveIndex}`)()
    let a
    if (!view.declareWindow && view.phase === 'playing') {
      const d = S.decideSearch(view, pol, seed, params)
      a = d.action
      if (a.type === 'ask') asks++
      if (d.info.searched) {
        searched++
        const pick = ENG.decide(view, pol, seed)
        const key = `${seed}:true`
        const rollTrue = (act) => {
          const r = reduce(s, act)
          if (!r.ok) throw new Error(`illegal on the true state: ${r.error.code}`)
          return S.rollout(r.state, pol, key, params.steps, team(seat), params.leafLock, params.leafCard)
        }
        const vPick = rollTrue(pick)
        const holder = (card) => s.hands.findIndex((h) => h.includes(card))
        if (holder(pick.card) === pick.target) hitPick++
        if (d.info.played === 'candidate') {
          played++
          ownAdv.push(d.info.advantage)
          ownSe.push(d.info.se)
          trueAdv.push(rollTrue(a) - vPick)
          if (holder(a.card) === a.target) hitPlayed++
        } else if (holder(pick.card) === pick.target) hitPlayed++
        // the best-mean candidate, played or not
        const m = d.info.means
        let best = 0
        for (let i = 1; i < m.length; i++) if (m[i] > m[best]) best = i
        if (best !== 0) {
          // reconstruct the candidate list the arm used: the pick, then the ranking's top C less the pick
          const ex = ENG.decideExplained(view, pol, seed)
          const cands = [{ target: pick.target, card: pick.card }]
          for (const r of ex.trace.ranked ?? []) {
            if (cands.length >= params.cand) break
            if (cands.some((c) => c.target === r.target && c.card === r.card)) continue
            cands.push({ target: r.target, card: r.card })
          }
          const c = cands[best]
          const v = rollTrue({ type: 'ask', seat, target: c.target, card: c.card }) - vPick
          trueBest.push(v)
          if (d.info.played !== 'candidate') { bestHeld++; trueHeld.push(v) }
        }
      }
    } else {
      a = ENG.decide(view, pol, seed)
    }
    const r = reduce(s, a)
    if (!r.ok) throw new Error(`${label}: ${r.error.code} at ${s.moveIndex}`)
    s = r.state
  }
}
const secs = (Date.now() - t0) / 1000
console.log(`=== probe-search: ${VERSION} search ${JSON.stringify(params)}, ${GAMES} mirror games (${LABEL}-*), ${secs.toFixed(1)}s ===`)
console.log(`ask decisions ${asks}; searched ${searched} (${(100 * searched / Math.max(1, asks)).toFixed(1)}%); played a candidate ${played} (${(100 * played / Math.max(1, searched)).toFixed(1)}% of searched, ${(played / GAMES).toFixed(2)} a game)`)
console.log(`arm's own advantage of the played candidate: ${fmt(stat(ownAdv))}; its SE averaged ${stat(ownSe).mean.toFixed(3)}`)
console.log(`TRUE paired advantage of the played candidate over the pick: ${fmt(stat(trueAdv))}   <- the marker`)
console.log(`TRUE paired advantage of the best-mean candidate on every searched decision: ${fmt(stat(trueBest))}; held back by the guard: ${bestHeld} with true advantage ${fmt(stat(trueHeld))}`)
console.log(`true hit rate on searched decisions: pick ${(100 * hitPick / Math.max(1, searched)).toFixed(1)}%, what played ${(100 * hitPlayed / Math.max(1, searched)).toFixed(1)}%`)
