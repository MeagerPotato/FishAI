/**
 * gen-value-data.mjs - MONET.md 3.8ab: the learned leaf's data. Self-play games of a Monet version (the
 * shipped stack by default), every ask-decision state read as a feature vector for BOTH teams
 * (`valueFeatures`, lib/engine/search/value.ts) with the game's final set differential for that team as
 * the target, written as a flat Float32 file for scripts/fit-value.mjs.
 *
 *   node scripts/gen-value-data.mjs --games 500 --label vdata-1 --out data/vdata-1.bin
 *        [--version v0.9] [--override '{"contest":0.6,...}'] [--eps 0.1] [--sample 0.5] [--lock-mod 5]
 *
 * `--eps p`: at an ask decision, with probability p (from the decision's own seed) a uniformly random
 * candidate from the search's 'sets' list (the pick and the best ask into each other half-suit, up to
 * nine) plays instead of the pick - so the states after asks the ranker would not have made, which the
 * search evaluates, are in the data; the continuation is the fast policy's, so the target is close to
 * its value. `--sample q`: each ask-decision state is kept with probability q (states within a game are
 * correlated; thinning buys games for rows). Every kept row carries `lock0`, the arm's static lock-only
 * leaf at the state (3.8a's `leafValue` with `leafLock` 1: the set differential plus the locked sets) -
 * the predictor a learned leaf must beat as a static evaluation. `--lock-mod m` (0 = never): on games
 * whose index is 0 mod m, also `lock24`, the arm's 24-step lock-only rollout from the TRUE state (~3.6 ms
 * each) - the search's actual horizon value, the dynamic predictor to be read against; m 5 matches the
 * fitter's default holdout so the comparison is on holdout games only.
 *
 * Row layout (Float32, little-endian): the features, then target, lock0, lock24 (NaN when not recorded),
 * game index, moveIndex, team. The header `<out>.json` names the columns. Seeds `<label>-<g>`.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const S = await import(pathToFileURL(join(ROOT, 'lib/engine/search/index.ts')).href)
const SS = await import(pathToFileURL(join(ROOT, 'lib/engine/search/search.ts')).href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, reduce, decide } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const GAMES = Number(argOf('--games', 100))
const LABEL = argOf('--label', 'vdata')
const OUT = argOf('--out', '')
const VERSION = argOf('--version', 'v0.9')
const OVER = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
const EPS = Number(argOf('--eps', 0))
const SAMPLE = Number(argOf('--sample', 1))
const LOCKMOD = Number(argOf('--lock-mod', 0))
if (!OUT) {
  console.error('--out is required')
  process.exit(2)
}
const pol0 = MON.monetPolicy(VERSION)
const pol = OVER ? Object.freeze({ skill: pol0.skill, style: Object.freeze({ ...pol0.style, ...OVER }) }) : pol0
const KOPTS = { logWindow: pol.skill.logWindow, useConstraints: pol.skill.useConstraints }
const CAND = { ...S.SEARCH_DEFAULTS, cand: 9, candMode: 'sets' }
const NF = S.VALUE_FEATURE_COUNT
const COLS = NF + 6
const names = [...S.valueFeatureNames(), 'target', 'lock0', 'lock24', 'game', 'moveIndex', 'team']
const uniform = (key) => (hashSeed(key)() >>> 0) / 4294967296

const fd = fs.openSync(OUT, 'w')
let rows = 0
let explored = 0
let askDecisions = 0
let lockRows = 0
const t0 = Date.now()
for (let g = 0; g < GAMES; g++) {
  const label = `${LABEL}-${g}`
  const lock24 = LOCKMOD > 0 && g % LOCKMOD === 0
  let s = newGame(label, us54Config, 0)
  const pending = [] // rows of this game, the target filled when it ends
  let n = 0
  while (s.phase !== 'finished' && n++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const seed = hashSeed(`${label}:${s.moveIndex}`)()
    let a = null
    if (!view.declareWindow && view.phase === 'playing') {
      askDecisions++
      if (SAMPLE >= 1 || uniform(`${label}:${s.moveIndex}:sample`) < SAMPLE) {
        const tk = S.tableKnowledge(s, KOPTS)
        for (const team of [0, 1]) {
          const row = new Float32Array(COLS)
          row.set(S.valueFeatures(s, team, tk, KOPTS), 0)
          row[NF + 1] = SS.leafValue(s, team, 1, 0)
          row[NF + 2] = lock24 ? S.rollout(s, pol, `${label}:${s.moveIndex}:lock`, 24, team, 1, 0) : Number.NaN
          row[NF + 3] = g
          row[NF + 4] = s.moveIndex
          row[NF + 5] = team
          pending.push(row)
          if (lock24) lockRows++
        }
      }
      if (EPS > 0 && uniform(`${label}:${s.moveIndex}:eps`) < EPS) {
        const ca = S.candidateAsks(view, pol, seed, CAND)
        if (ca && ca.cands.length > 1) {
          const c = ca.cands[Math.floor(uniform(`${label}:${s.moveIndex}:pickc`) * ca.cands.length)]
          a = { type: 'ask', seat, target: c.target, card: c.card }
          explored++
        }
      }
    }
    if (a === null) a = decide(view, pol, seed)
    const r = reduce(s, a)
    if (!r.ok) throw new Error(`${label}: ${r.error.code} at ${s.moveIndex}`)
    s = r.state
  }
  if (s.phase !== 'finished') throw new Error(`${label}: step cap`)
  const diff = s.score[0] - s.score[1]
  if (pending.length > 0) {
    const chunk = new Float32Array(pending.length * COLS)
    for (let i = 0; i < pending.length; i++) {
      const row = pending[i]
      row[NF] = row[NF + 5] === 0 ? diff : -diff
      chunk.set(row, i * COLS)
    }
    fs.writeSync(fd, Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))
    rows += pending.length
  }
}
fs.closeSync(fd)
const secs = (Date.now() - t0) / 1000
const header = { cols: COLS, rows, features: NF, names, games: GAMES, label: LABEL, version: VERSION, override: OVER, eps: EPS, sample: SAMPLE, lockMod: LOCKMOD, lockRows, askDecisions, explored, secs }
fs.writeFileSync(`${OUT}.json`, JSON.stringify(header))
console.log(`gen-value-data: ${GAMES} games (${LABEL}-*), ${askDecisions} ask decisions, ${explored} explored (eps ${EPS}), ${rows} rows x ${COLS} (sample ${SAMPLE}; lock24 on ${lockRows} rows, games 0 mod ${LOCKMOD}), ${secs.toFixed(1)}s -> ${OUT}`)
