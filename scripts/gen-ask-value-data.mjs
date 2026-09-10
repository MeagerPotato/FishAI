/**
 * gen-ask-value-data.mjs - MONET.md 3.8as stage A: the learned ask value's data. Self-play games of a
 * Monet version whose style names an `askModel` (v0.33 by default, the SESTINA clone at every ask), one
 * row per ask decision: the TAKEN ask's features (`askFeatureRows`'s second set, the forty-nine the
 * clone itself reads) beside the STATE's (`valueFeatures`, lib/engine/search/value.ts), with the asking
 * team's final set differential as the target. Written as a flat Float32 file for the stage-B fit.
 *
 *   node scripts/gen-ask-value-data.mjs --games 500 --label avdata-1 --out data/avdata-1.bin
 *        [--version v0.33] [--override '{"...":1}'] [--eps 0.15] [--topk 3] [--sample 1]
 *
 * `--eps p`: at an ask decision, with probability p (from the decision's own seed) a uniformly random
 * member of the CLONE'S TOP k plays instead of the clone's top - so the alternatives the fitted value
 * will be asked to score at play have their own outcomes in the data rather than being extrapolated to.
 * This is the whole reason the rung generates its coverage instead of reading it off the bridge records,
 * which hold only the asks the clone took (3.8ao is the standing example of what extrapolating costs).
 *
 * `--topk k`: the shortlist depth, the same k the stage-C knob will take its argmax over. `--sample q`:
 * each ask decision's row is kept with probability q (rows within a game are correlated).
 *
 * THE PIN, printed before any fit reads the file: at every ask decision the arm's own `decide()` is run
 * beside this script's reconstruction of the clone's ordering, and the share on which they agree is
 * reported. It compares two readings of the same state, so it does not depend on which action then plays
 * and is computed on explored decisions too.
 *
 * IT DOES NOT READ 100%, AND THE REASON IS A REAL PROPERTY OF THE VECTOR RATHER THAN A DEFECT HERE.
 * 3.8as predicted 100.0% (A1) on the strength of 3.8ap's bridge-record identity. On v0.33 in self-play
 * it reads 99.92% over 200 games: `pickAsk` does return the clone's choice at every ask decision, but TWO BRANCHES
 * OF `decide()` SIT AFTER IT and can override the result - the reveal ask (`reveal`, absent from v0.33)
 * and the contained turn-pass (`containedPass: 1`, which v0.33 carries). Running the same games with
 * `--override '{"containedPass":0}'` returns the pin to exactly 100.00%, which locates the whole residual
 * in that one branch. So "the arm plays the clone's choice" is true of `pickAsk` and not of the vector.
 *
 * An overridden decision is therefore NOT the clone's to make: it is left to the arm, gets no row, and is
 * never explored. Substituting a shortlist ask there would be an intervention on a different policy term
 * and the row would be mislabelled as the clone's. The count is reported as `overridden`.
 *
 * A property of the target, stated here rather than discovered later (3.8as): with eps applied at every
 * ask decision independently, a row's outcome carries the effect of the other deviations in its own
 * game. That is noise and not bias - the deviations are uniform over the shortlist and independent of
 * the state - but the object fitted is the advantage under the eps-mixed policy, not under the clone
 * exactly. The alternative costs one labelled row per game and is unaffordable at these row counts.
 *
 * Row layout (Float32, little-endian): the forty-nine ask features, the state features, then target,
 * game, moveIndex, seat, team, explored, rank, nRanked, hit. `<out>.json` names every column. The state
 * block is read from the TRUE state, which is available here and not at play; 3.8as commits to an
 * ADDITIVE fit for exactly that reason - the block is constant across the candidates at one decision, so
 * it cannot tilt the argmax and never has to be computed by the arm. Seeds `<label>-<g>`.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const IMI = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/imitation.ts')).href)
const S = await import(pathToFileURL(join(ROOT, 'lib/engine/search/index.ts')).href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, reduce, decide } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const GAMES = Number(argOf('--games', 100))
const LABEL = argOf('--label', 'avdata')
const OUT = argOf('--out', '')
const VERSION = argOf('--version', 'v0.33')
const OVER = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
const EPS = Number(argOf('--eps', 0))
const TOPK = Number(argOf('--topk', 3))
const SAMPLE = Number(argOf('--sample', 1))
// which team explores: 'both' (the data run - most coverage a game) or '0'/'1' (the A2 read - one side
// deviates and the other plays the clone exactly, so the printed team-0 win rate IS the cost of exploring)
const EPSTEAM = argOf('--eps-team', 'both')
if (!OUT) {
  console.error('--out is required')
  process.exit(2)
}
if (!(TOPK >= 1)) {
  console.error('--topk must be at least 1')
  process.exit(2)
}
if (!(EPS >= 0 && EPS <= 1)) {
  console.error('--eps must be in [0, 1]')
  process.exit(2)
}
if (EPSTEAM !== 'both' && EPSTEAM !== '0' && EPSTEAM !== '1') {
  console.error("--eps-team must be 'both', '0' or '1'")
  process.exit(2)
}
const EPSOF = (team) => (EPSTEAM === 'both' || Number(EPSTEAM) === team ? EPS : 0)

const pol0 = MON.monetPolicy(VERSION)
const POL = OVER ? Object.freeze({ skill: pol0.skill, style: Object.freeze({ ...pol0.style, ...OVER }) }) : pol0
const { skill, style } = BOTS.resolvePolicy(POL)
if (style.askModel === undefined) {
  console.error(`monetPolicy(${JSON.stringify(VERSION)}) has no askModel: this rung selects over a clone's shortlist and there is none`)
  process.exit(2)
}
const CLONE = IMI.askModelOf(style.askModel)
const CLONE_SET = IMI.askFeatureSetOf(CLONE)
if (CLONE_SET !== 2) {
  console.error(`the ask model ${JSON.stringify(style.askModel)} reads feature set ${CLONE_SET}; 3.8as's row is the second set's forty-nine`)
  process.exit(2)
}
const marginal = style.pModel === 'marginal'
const KOPTS = {
  logWindow: skill.logWindow,
  useConstraints: skill.useConstraints,
  marginal,
  choiceKappa: marginal ? style.choiceKappa : undefined,
  choiceAdapt: marginal ? style.choiceAdapt : undefined,
  choicePrior: marginal ? style.choicePrior : undefined,
}
const uniform = (key) => (hashSeed(key)() >>> 0) / 4294967296
const seatTeam = (x) => x % 2

const NA = IMI.askFeatureCount(2)
const NV = S.VALUE_FEATURE_COUNT
const META = ['target', 'game', 'moveIndex', 'seat', 'team', 'explored', 'rank', 'nRanked', 'hit']
const COLS = NA + NV + META.length
const names = [
  ...IMI.askFeatureNames(2).map((x) => `ask.${x}`),
  ...S.valueFeatureNames().map((x) => `state.${x}`),
  ...META,
]
if (names.length !== COLS) throw new Error(`names ${names.length} != cols ${COLS}`)

const fd = fs.openSync(OUT, 'w')
let rows = 0
let askDecisions = 0
let explored = 0
let unranked = 0
let overridden = 0
let pinN = 0
let pinOk = 0
let shortSum = 0
let win0 = 0
let draw0 = 0
// one final set differential a game, in game order, so two runs on the same --label pair deal by deal
const diffs = []
const rankHist = new Array(Math.max(TOPK, 1)).fill(0)
const t0 = Date.now()
for (let g = 0; g < GAMES; g++) {
  const label = `${LABEL}-${g}`
  let s = newGame(label, us54Config, 0)
  const pending = [] // rows of this game, the target filled when it ends
  let n = 0
  while (s.phase !== 'finished' && n++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const seed = hashSeed(`${label}:${s.moveIndex}`)()
    const armA = decide(view, POL, seed)
    let a = armA
    if (armA.type === 'ask' && !view.declareWindow && view.phase === 'playing') {
      const k = BOTS.buildKnowledge(view, KOPTS)
      const ranked = BOTS.rankAsksWith(view, k, style)
      if (ranked.length === 0) {
        unranked++
      } else {
        // the clone's ordering, tie to the earlier entry exactly as `chooseAskByModel` breaks it
        const sc = IMI.scoreAsks(CLONE, view, k, ranked)
        const order = ranked.map((_, i) => i).sort((x, y) => sc[y] - sc[x] || x - y)
        const armIdx = ranked.findIndex((r) => r.target === armA.target && r.card === armA.card)
        pinN++
        if (armIdx !== order[0]) {
          // NOT the clone's decision: a branch AFTER `pickAsk` overrode it - on v0.33 that is
          // `containedPass: 1`, the deliberate turn-pass (decide.ts, after the reveal branch).
          // Measured at 0.08% of ask decisions over 200 self-play games (13 of 16,951), and
          // switching the knob off returns the pin to exactly 100.00%. It clusters: five of those
          // thirteen are one endgame loop in a single game, so a small sample badly overstates the
          // rate. Such a decision is left to the arm, gets no row, and is never
          // explored: substituting a shortlist ask there would be an intervention on a different
          // policy term, and the row would be mislabelled as the clone's.
          overridden++
        } else {
          pinOk++
          askDecisions++
          const short = order.slice(0, TOPK)
          shortSum += short.length
          // the taken ask: the clone's top, or with probability EPS a uniform member of its top k
          let takenRank = 0
          const epsHere = EPSOF(seatTeam(seat))
          if (epsHere > 0 && short.length > 1 && uniform(`${label}:${s.moveIndex}:eps`) < epsHere) {
            takenRank = Math.floor(uniform(`${label}:${s.moveIndex}:pick`) * short.length)
            if (takenRank >= short.length) takenRank = short.length - 1
            if (takenRank > 0) explored++
          }
          rankHist[takenRank]++
          const takenIdx = short[takenRank]
          const taken = ranked[takenIdx]
          // rank 0 plays the arm's own action object, so `--eps 0` is byte-identical self-play
          a = takenRank === 0 ? armA : { type: 'ask', seat, target: taken.target, card: taken.card }
          if (SAMPLE >= 1 || uniform(`${label}:${s.moveIndex}:sample`) < SAMPLE) {
            const feats = IMI.askFeatureRows(view, k, ranked, 2)
            const team = seatTeam(seat)
            const tk = S.tableKnowledge(s, KOPTS)
            const row = new Float32Array(COLS)
            row.set(feats[takenIdx], 0)
            row.set(S.valueFeatures(s, team, tk, KOPTS), NA)
            row[NA + NV + 1] = g
            row[NA + NV + 2] = s.moveIndex
            row[NA + NV + 3] = seat
            row[NA + NV + 4] = team
            row[NA + NV + 5] = takenRank > 0 ? 1 : 0
            row[NA + NV + 6] = takenRank
            row[NA + NV + 7] = ranked.length
            row[NA + NV + 8] = s.hands[taken.target].includes(taken.card) ? 1 : 0
            pending.push(row)
          }
        }
      }
    }
    const r = reduce(s, a)
    if (!r.ok) throw new Error(`${label}: ${r.error.code} at ${s.moveIndex}`)
    s = r.state
  }
  if (s.phase !== 'finished') throw new Error(`${label}: step cap`)
  const diff = s.score[0] - s.score[1]
  diffs.push(diff)
  if (diff > 0) win0++
  else if (diff === 0) draw0++
  if (pending.length > 0) {
    const chunk = new Float32Array(pending.length * COLS)
    for (let i = 0; i < pending.length; i++) {
      const row = pending[i]
      row[NA + NV] = row[NA + NV + 4] === 0 ? diff : -diff
      chunk.set(row, i * COLS)
    }
    fs.writeSync(fd, Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))
    rows += pending.length
  }
}
fs.closeSync(fd)
const secs = (Date.now() - t0) / 1000
const pinPct = pinN > 0 ? (100 * pinOk) / pinN : Number.NaN
const header = {
  cols: COLS,
  rows,
  askFeatures: NA,
  stateFeatures: NV,
  meta: META,
  names,
  games: GAMES,
  label: LABEL,
  version: VERSION,
  override: OVER,
  askModel: style.askModel,
  eps: EPS,
  epsTeam: EPSTEAM,
  win0,
  draw0,
  diffs,
  winRate0: GAMES > 0 ? (100 * (win0 + 0.5 * draw0)) / GAMES : 0,
  topk: TOPK,
  sample: SAMPLE,
  askDecisions,
  explored,
  unranked,
  overridden,
  pinN,
  pinOk,
  pinPct,
  rankHist,
  meanShortlist: askDecisions > 0 ? shortSum / askDecisions : 0,
  secs,
}
fs.writeFileSync(`${OUT}.json`, JSON.stringify(header))
console.log(
  `gen-ask-value-data: ${GAMES} games (${LABEL}-*), ${askDecisions} ask decisions, ${explored} explored (eps ${EPS} over the clone's top ${TOPK}), ${rows} rows x ${COLS} (${NA} ask + ${NV} state + ${META.length} meta; sample ${SAMPLE}), ${secs.toFixed(1)}s -> ${OUT}`,
)
console.log(
  `  PIN: the arm's ask is the clone's top on ${pinOk}/${pinN} = ${pinPct.toFixed(2)}% of ask decisions; ${overridden} (${((100 * overridden) / Math.max(pinN, 1)).toFixed(2)}%) were overridden by a branch after pickAsk and carry no row`,
)
console.log(`       (v0.33 carries containedPass 1; --override '{"containedPass":0}' returns this to exactly 100.00%, which is where the residual lives)`)
console.log(`  shortlist mean ${(askDecisions > 0 ? shortSum / askDecisions : 0).toFixed(2)} of ${TOPK}; taken by rank ${rankHist.join(' / ')}; ${unranked} decisions with no legal ask`)
console.log(`  team 0 win rate ${(GAMES > 0 ? (100 * (win0 + 0.5 * draw0)) / GAMES : 0).toFixed(2)}% over ${GAMES} games (eps-team ${EPSTEAM}); at --eps 0 or --eps-team both this is a symmetry check, at --eps-team 0 it is A2`)
console.log(`  rate ${(GAMES / secs).toFixed(1)} games/s, ${(rows / secs).toFixed(0)} rows/s`)
