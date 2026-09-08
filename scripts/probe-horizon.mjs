/**
 * probe-horizon.mjs - MONET.md 3.8aa: the search's true advantage against the horizon it is read at.
 *
 *   node scripts/probe-horizon.mjs [--games 40] [--version v0.9] [--override '{...}'] [--label horizon] [--search '{...}'] [--leaf-model models/x.json]
 *
 * The same mirror games as probe-search.mjs (the search at every seat, every searched decision scored
 * from the TRUE state by a paired rollout of the pick and of what was played), but the rollout is
 * carried to the END of the game and its value read at several horizons on the way: the lock-only
 * value (sets + locked sets, the arm's own leaf) after 24, 48 and 96 further actions, the set
 * differential alone at the same horizons, and the final set differential when the game ends. One
 * trajectory per action, the same rollout key for the pick and the candidate (paired), so the curve
 * across horizons is read on the same play. Reported for the played candidates (the marker's set),
 * for the best-mean candidate on every searched decision, and for the held-back set. `leaf0` (MONET.md
 * 3.8ab) is the search's own leaf on the true state right after the ask - the registered model's estimate
 * with --leaf-model, else the lock-only value - so what the search believed sits beside what the game did.
 *
 * Why: the 3.8aa home pairs read the search behind (s128 -0.30 a pair) where its 24-step lock-only
 * marker read ahead (+0.082 a played decision). If the advantage the leaf sees at 24 actions decays
 * to nothing or below by the game's end on the same trajectories, the leaf is myopic and the search
 * has been optimising the wrong horizon; if it holds to the end, the pairs' loss is elsewhere (the
 * determinized belief, the opponent model of the rollouts).
 */
import { pathToFileURL } from 'node:url'
import { basename } from 'node:path'
import fs from 'node:fs'
const ENG = await import(pathToFileURL(process.cwd() + '/lib/engine/index.ts').href)
const MON = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/monet.ts').href)
const S = await import(pathToFileURL(process.cwd() + '/lib/engine/search/index.ts').href)
const SS = await import(pathToFileURL(process.cwd() + '/lib/engine/search/search.ts').href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, reduce, decide } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const GAMES = Number(argOf('--games', 40))
const VERSION = argOf('--version', 'v0.9')
const LABEL = argOf('--label', 'horizon')
const params = { ...S.SEARCH_DEFAULTS, ...JSON.parse(argOf('--search', '{}')) }
// MONET.md 3.8ab: --leaf-model <file> registers a value model under the file's basename and names it as the leaf
const LEAF = argOf('--leaf-model', '')
if (LEAF) {
  S.registerValueModel(basename(LEAF), JSON.parse(fs.readFileSync(LEAF, 'utf8')))
  params.leafNet = basename(LEAF)
}
const OVER = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
const pol0 = MON.monetPolicy(VERSION)
const pol = OVER ? Object.freeze({ skill: pol0.skill, style: Object.freeze({ ...pol0.style, ...OVER }) }) : pol0
const team = (seat) => (seat % 2)
const HORIZONS = [24, 48, 96]

/** Roll `start` to the end under `pol` with `key`; the lock-only and set-only values at each horizon and the final set differential. */
function trace(start, key, tm) {
  let s = start
  let n = 0
  const lock = {}
  const sets = {}
  // the search's own leaf on the true state right after the ask (MONET.md 3.8ab): the model when one is registered, else the lock-only value
  const leaf0 = params.leafNet ? S.valueOf(S.valueModelOf(params.leafNet), s, tm) : SS.leafValue(s, tm, 1, 0)
  const snap = () => { lock[n] = SS.leafValue(s, tm, 1, 0); sets[n] = SS.leafValue(s, tm, 0, 0) }
  while (s.phase !== 'finished' && n < 100000) {
    if (HORIZONS.includes(n)) snap()
    const { seat } = legalActionsSummary(s)
    const a = decide(seatView(s, seat), pol, hashSeed(`${key}:${s.moveIndex}`)())
    const r = reduce(s, a)
    if (!r.ok) break
    s = r.state
    n++
  }
  // a game that ends before a horizon reads its final value there
  for (const h of HORIZONS) if (lock[h] === undefined) { lock[h] = SS.leafValue(s, tm, 1, 0); sets[h] = SS.leafValue(s, tm, 0, 0) }
  return { lock, sets, end: SS.leafValue(s, tm, 0, 0), steps: n, leaf0 }
}
function stat(xs) {
  const n = xs.length
  if (n === 0) return { n, mean: NaN, se: NaN }
  const mean = xs.reduce((a, b) => a + b, 0) / n
  const v = n > 1 ? xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1) : 0
  return { n, mean, se: Math.sqrt(v / n) }
}
const fmt = (s) => `${s.mean >= 0 ? '+' : ''}${s.mean.toFixed(3)} (SE ${s.se.toFixed(3)})`
const keys = ['leaf0', ...HORIZONS.map((h) => `lock${h}`), ...HORIZONS.map((h) => `sets${h}`), 'end']
const mk = () => Object.fromEntries(keys.map((k) => [k, []]))
const played = mk(), best = mk(), held = mk()
const push = (acc, a, b) => { acc.leaf0.push(a.leaf0 - b.leaf0); for (const h of HORIZONS) { acc[`lock${h}`].push(a.lock[h] - b.lock[h]); acc[`sets${h}`].push(a.sets[h] - b.sets[h]) } acc.end.push(a.end - b.end) }
let asks = 0, searched = 0, nPlayed = 0, nBest = 0, nHeld = 0, endSteps = 0
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
        const pick = decide(view, pol, seed)
        const key = `${seed}:true`
        const tm = team(seat)
        const roll = (act) => { const r = reduce(s, act); if (!r.ok) throw new Error(`illegal on the true state: ${r.error.code}`); return trace(r.state, key, tm) }
        const m = d.info.means
        let b = 0
        for (let i = 1; i < m.length; i++) if (m[i] > m[b]) b = i
        if (b !== 0) {
          const tPick = roll(pick)
          const c = d.info.cands[b]
          const tBest = roll({ type: 'ask', seat, target: c.target, card: c.card })
          nBest++
          push(best, tBest, tPick)
          endSteps += tPick.steps
          if (d.info.played === 'candidate') { nPlayed++; push(played, tBest, tPick) } else { nHeld++; push(held, tBest, tPick) }
        }
      }
    } else {
      a = decide(view, pol, seed)
    }
    const r = reduce(s, a)
    if (!r.ok) throw new Error(`${label}: ${r.error.code} at ${s.moveIndex}`)
    s = r.state
  }
}
const secs = (Date.now() - t0) / 1000
console.log(`=== probe-horizon: ${VERSION}${OVER ? ' ' + JSON.stringify(OVER) : ''} search ${JSON.stringify(params)}, ${GAMES} mirror games (${LABEL}-*), ${secs.toFixed(1)}s ===`)
console.log(`ask decisions ${asks}; searched ${searched}; best-mean not the pick ${nBest}; played ${nPlayed} (${(100 * nPlayed / Math.max(1, searched)).toFixed(1)}% of searched); held back ${nHeld}; rollout length to the end ${(endSteps / Math.max(1, nBest)).toFixed(0)} actions`)
for (const [name, acc, n] of [['played', played, nPlayed], ['best-mean (all searched)', best, nBest], ['held back', held, nHeld]]) {
  console.log(`${name} (n ${n}): ` + keys.map((k) => `${k} ${fmt(stat(acc[k]))}`).join('; '))
}
