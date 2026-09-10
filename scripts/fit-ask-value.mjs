/**
 * fit-ask-value.mjs - MONET.md 3.8as stage B: fit the learned ask value on gen-ask-value-data.mjs's
 * files and RUN THE GATE. Writes the ask half as an `AskModel` JSON (lib/engine/bots/net.ts's
 * `DenseModel`) that `registerAskModel` takes, so the stage-C knob can score the clone's shortlist.
 *
 *   node scripts/fit-ask-value.mjs --data data/av-1.bin,data/av-2.bin --out models/av-1.json
 *        [--holdout-mod 5] [--l2 0.00001] [--max-rows 0] [--explored-only 0]
 *
 * THE MODEL IS LINEAR, AND THAT IS THE DESIGN AND NOT A SHORTCUT. 3.8as commits to an ADDITIVE score
 * over the ask block and the state block, because the state block is read from the TRUE state at
 * generation time and the arm cannot compute it at play. A linear model is additive by construction:
 *
 *     score(ask, state) = w_ask . ask + w_state . state + b
 *
 * so at one decision the state term is the same for every candidate and drops out of the argmax. Only
 * `w_ask` is written to `--out`, and it is the whole of what the arm needs. An MLP over the two blocks
 * TOGETHER would let the state tilt the argmax and could not be played; an additive MLP (two towers
 * summed) is the next form if this one is too weak, and is not this script.
 *
 * THREE FITS, all ridge in closed form on the same rows and the same split:
 *   state - the state block alone. THE BASELINE THE GATE IS AGAINST: the position, not the ask, is
 *           most of what decides a game, and a value that does not beat it has found no choice signal.
 *   full  - the ask block and the state block.
 *   ask   - the ask block alone, for information: what one ask carries with no position to stand on.
 *
 * THE GATE (3.8as): `full` must beat `state` on HELD-OUT GAMES. The holdout is every game whose index
 * is 0 mod `--holdout-mod` - a split by game and never by row, because the rows of one game share its
 * outcome. If the gate closes, the rung stops before the engine is touched.
 *
 * `--explored-only 1` refits on the rows where the taken ask was NOT the clone's top (the eps
 * deviations). Those rows are the ones that carry alternatives, and the contrast between the two fits
 * says whether the ask block is learning a choice signal or the clone's own selection.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const S = await import(pathToFileURL(join(ROOT, 'lib/engine/search/index.ts')).href)
const IMI = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/imitation.ts')).href)

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const FILES = argOf('--data', '').split(',').filter(Boolean)
const OUT = argOf('--out', '')
const HOLD = Number(argOf('--holdout-mod', 5))
const L2 = Number(argOf('--l2', 0.00001))
const MAXROWS = Number(argOf('--max-rows', 0))
const EXPONLY = argOf('--explored-only', '0') === '1'
if (FILES.length === 0 || !OUT) {
  console.error('--data and --out are required')
  process.exit(2)
}

const NA = IMI.askFeatureCount(2)
const NV = S.VALUE_FEATURE_COUNT
const askNames = IMI.askFeatureNames(2)
const stateNames = S.valueFeatureNames()

// ---- load
let COLS = 0
let META = null
const parts = []
let total = 0
const heads = []
for (const f of FILES) {
  const h = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8'))
  if (h.askFeatures !== NA) throw new Error(`${f}: ${h.askFeatures} ask features, this build has ${NA}`)
  if (h.stateFeatures !== NV) throw new Error(`${f}: ${h.stateFeatures} state features, this build has ${NV}`)
  if (COLS && h.cols !== COLS) throw new Error(`${f}: ${h.cols} cols against ${COLS}`)
  COLS = h.cols
  META = META ?? h.meta
  heads.push(h)
  const buf = fs.readFileSync(f)
  parts.push(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4))
  total += buf.byteLength / 4 / COLS
}
const N = MAXROWS > 0 ? Math.min(total, MAXROWS) : total
const X = new Float32Array(N * COLS)
{
  let off = 0
  for (const p of parts) {
    const take = Math.min(p.length, N * COLS - off)
    if (take <= 0) break
    X.set(take === p.length ? p : p.subarray(0, take), off)
    off += take
  }
}
// the meta columns, by the header's own order
const mi = (name) => NA + NV + META.indexOf(name)
const TC = mi('target')
const GAMEC = mi('game')
const EXPC = mi('explored')
const RANKC = mi('rank')
// a file's games are numbered from 0, so pair each file's game index with its file to keep the
// holdout honest when several files are loaded
const fileOf = new Int32Array(N)
{
  let off = 0
  for (let fi = 0; fi < parts.length; fi++) {
    const rowsHere = Math.min(parts[fi].length / COLS, N - off)
    for (let i = 0; i < rowsHere; i++) fileOf[off + i] = fi
    off += rowsHere
    if (off >= N) break
  }
}
const keep = []
for (let i = 0; i < N; i++) {
  if (EXPONLY && X[i * COLS + EXPC] === 0) continue
  keep.push(i)
}
const train = []
const hold = []
for (const i of keep) ((X[i * COLS + GAMEC] + 7919 * fileOf[i]) % HOLD === 0 ? hold : train).push(i)
const explored = keep.filter((i) => X[i * COLS + EXPC] === 1).length
const rankHist = {}
for (const i of keep) {
  const r = X[i * COLS + RANKC]
  rankHist[r] = (rankHist[r] ?? 0) + 1
}
console.log(`rows ${N} in ${FILES.length} file(s); kept ${keep.length}${EXPONLY ? ' (explored only)' : ''}; train ${train.length}, holdout ${hold.length} (games 0 mod ${HOLD})`)
console.log(`  explored ${explored} (${((100 * explored) / Math.max(keep.length, 1)).toFixed(2)}%); by rank ${Object.entries(rankHist).map(([r, c]) => `${r}:${c}`).join(' ')}`)
console.log(`  ask features ${NA}, state features ${NV}; eps ${heads.map((h) => h.eps).join(',')}, topk ${heads.map((h) => h.topk).join(',')}, eps-team ${heads.map((h) => h.epsTeam ?? 'both').join(',')}`)
if (train.length === 0 || hold.length === 0) {
  console.error('the split left one side empty')
  process.exit(2)
}

// ---- standardisation on the training rows, over both blocks
const NALL = NA + NV
const mean = new Float64Array(NALL)
const std = new Float64Array(NALL)
for (const i of train) for (let j = 0; j < NALL; j++) mean[j] += X[i * COLS + j]
for (let j = 0; j < NALL; j++) mean[j] /= train.length
for (const i of train) for (let j = 0; j < NALL; j++) { const d = X[i * COLS + j] - mean[j]; std[j] += d * d }
for (let j = 0; j < NALL; j++) std[j] = Math.sqrt(std[j] / Math.max(1, train.length - 1))
const inv = Float64Array.from(std, (v) => (v > 0 ? 1 / v : 0))
const Y = new Float64Array(N)
for (let i = 0; i < N; i++) Y[i] = X[i * COLS + TC]
const z = (i, j) => (X[i * COLS + j] - mean[j]) * inv[j]

// ---- ridge in closed form over a chosen column set
function ridge(cols, rows) {
  const D = cols.length + 1
  const A = new Float64Array(D * D)
  const bv = new Float64Array(D)
  const zi = new Float64Array(D)
  for (const i of rows) {
    for (let a = 0; a < cols.length; a++) zi[a] = z(i, cols[a])
    zi[D - 1] = 1
    for (let a = 0; a < D; a++) {
      const za = zi[a]
      if (za === 0) continue
      bv[a] += za * Y[i]
      const row = a * D
      for (let b = a; b < D; b++) A[row + b] += za * zi[b]
    }
  }
  for (let a = 0; a < D; a++) for (let b = 0; b < a; b++) A[a * D + b] = A[b * D + a]
  const lam = L2 * rows.length
  for (let a = 0; a + 1 < D; a++) A[a * D + a] += lam
  const Lm = new Float64Array(D * D)
  for (let i = 0; i < D; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * D + j]
      for (let k = 0; k < j; k++) s -= Lm[i * D + k] * Lm[j * D + k]
      if (i === j) {
        if (s <= 0) throw new Error(`not positive definite at column ${i}`)
        Lm[i * D + i] = Math.sqrt(s)
      } else Lm[i * D + j] = s / Lm[j * D + j]
    }
  }
  const y1 = new Float64Array(D)
  for (let i = 0; i < D; i++) { let s = bv[i]; for (let k = 0; k < i; k++) s -= Lm[i * D + k] * y1[k]; y1[i] = s / Lm[i * D + i] }
  const w = new Float64Array(D)
  for (let i = D - 1; i >= 0; i--) { let s = y1[i]; for (let k = i + 1; k < D; k++) s -= Lm[k * D + i] * w[k]; w[i] = s / Lm[i * D + i] }
  return { cols, w: w.subarray(0, cols.length), b: w[D - 1] }
}
const predict = (m, i) => {
  let s = m.b
  for (let a = 0; a < m.cols.length; a++) s += m.w[a] * z(i, m.cols[a])
  return s
}
const mseOf = (m, rows) => {
  let s = 0
  for (const i of rows) { const d = predict(m, i) - Y[i]; s += d * d }
  return s / rows.length
}

// The seven ask features that are IDENTICAL for every candidate at a decision - measured over 60
// self-play games and 5,000+ decisions: they never differ across the clone's top three, nor across the
// whole legal ask list. They describe the POSITION and sit in the ask block only because the clone was
// given them. A weight on one of them can never move an argmax over candidates, so a gate that lets the
// ask block gain on them proves nothing the arm can play - and in the pilot fit `scoreDiff` carried the
// LARGEST ask weight of all. They are therefore counted on the baseline's side. Resolved by name, so a
// change to ASK_FEATURES_2's order cannot silently break this.
const POSITION_ASK = ['hitRun', 'scoreDiff', 'resolved', 'myHand', 'asks', 'matesIn', 'oppsIn']
const POSC = POSITION_ASK.map((nm) => {
  const j = askNames.indexOf(nm)
  if (j < 0) throw new Error(`ASK_FEATURES_2 has no ${nm}: re-measure which ask columns are constant across a decision's candidates`)
  return j
})
const VARYC = Array.from({ length: NA }, (_, j) => j).filter((j) => !POSC.includes(j))
const ASKC = Array.from({ length: NA }, (_, j) => j)
const STATEC = Array.from({ length: NV }, (_, j) => NA + j)
const meanY = train.reduce((a, i) => a + Y[i], 0) / train.length
let varHold = 0
for (const i of hold) varHold += (meanY - Y[i]) ** 2
varHold /= hold.length
const r2 = (m) => 1 - m / varHold
const t0 = Date.now()
const mState = ridge(STATEC, train)
const mBase = ridge([...POSC, ...STATEC], train)
const mFull = ridge([...ASKC, ...STATEC], train)
const mAsk = ridge(ASKC, train)
const mVary = ridge(VARYC, train)
const eState = mseOf(mState, hold)
const eBase = mseOf(mBase, hold)
const eFull = mseOf(mFull, hold)
const eAsk = mseOf(mAsk, hold)
const eVary = mseOf(mVary, hold)
const secs = (Date.now() - t0) / 1000

console.log('')
console.log('| fit | columns | holdout MSE | holdout R2 |')
console.log('|---|---:|---:|---:|')
console.log(`| constant | 0 | ${varHold.toFixed(5)} | 0.00000 |`)
console.log(`| ask only, all ${NA} | ${NA} | ${eAsk.toFixed(5)} | ${r2(eAsk).toFixed(5)} |`)
console.log(`| ask only, the ${VARYC.length} that vary | ${VARYC.length} | ${eVary.toFixed(5)} | ${r2(eVary).toFixed(5)} |`)
console.log(`| state only | ${NV} | ${eState.toFixed(5)} | ${r2(eState).toFixed(5)} |`)
console.log(`| **state + the ${POSC.length} position asks (THE BASELINE)** | ${NV + POSC.length} | **${eBase.toFixed(5)}** | ${r2(eBase).toFixed(5)} |`)
console.log(`| **full (state + all ${NA} asks)** | ${NA + NV} | **${eFull.toFixed(5)}** | ${r2(eFull).toFixed(5)} |`)
console.log('')
const rel = (100 * (eBase - eFull)) / eBase
const relNaive = (100 * (eState - eFull)) / eState
const open = eFull < eBase
console.log(`the PLAYABLE gain - the ${VARYC.length} ask columns that vary across a decision's candidates, over state + the ${POSC.length} that do not:`)
console.log(`  ${rel >= 0 ? '+' : ''}${rel.toFixed(3)}% of held-out MSE (B2 predicted under 3%)`)
console.log(`  for contrast, the naive comparison against state-only reads ${relNaive >= 0 ? '+' : ''}${relNaive.toFixed(3)}%, and it is NOT the gate: it credits the ask block for position columns the argmax can never use`)
console.log(`THE GATE: full ${open ? 'BEATS' : 'DOES NOT BEAT'} state + the position asks on held-out games -> ${open ? 'OPEN' : 'CLOSED'}`)
console.log('')
const topAsk = VARYC.map((j) => [askNames[j], mFull.w[j]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 16)
console.log('largest standardised weights among the ask columns that VARY (the only ones an argmax can use): ' + topAsk.map(([n, v]) => `${n} ${v >= 0 ? '+' : ''}${v.toFixed(4)}`).join(', '))
const topPos = POSC.map((j) => [askNames[j], mFull.w[j]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
console.log('the position asks, carried for the record and inert at the argmax: ' + topPos.map(([n, v]) => `${n} ${v >= 0 ? '+' : ''}${v.toFixed(4)}`).join(', '))

// ---- the ask half, as a model the arm can register. Only the ask block goes out: the state term is
// the same for every candidate at one decision and cannot change the argmax.
const model = {
  features: NA,
  mean: Array.from(mean.subarray(0, NA)),
  std: Array.from(std.subarray(0, NA)),
  layers: [{ w: Array.from(mFull.w.subarray(0, NA)), b: [0] }],
  meta: {
    section: '3.8as',
    kind: 'ask-value (linear, additive; only the ask half is written)',
    data: FILES,
    games: heads.reduce((a, h) => a + h.games, 0),
    eps: heads.map((h) => h.eps),
    topk: heads.map((h) => h.topk),
    epsTeam: heads.map((h) => h.epsTeam ?? 'both'),
    rows: N,
    kept: keep.length,
    exploredRows: explored,
    exploredOnly: EXPONLY,
    train: train.length,
    holdout: hold.length,
    holdoutMod: HOLD,
    l2: L2,
    positionAsk: POSITION_ASK,
    varyingAskColumns: VARYC.length,
    holdoutMse: { constant: varHold, askOnly: eAsk, varyOnly: eVary, stateOnly: eState, base: eBase, full: eFull },
    holdoutR2: { askOnly: r2(eAsk), varyOnly: r2(eVary), stateOnly: r2(eState), base: r2(eBase), full: r2(eFull) },
    gateOpen: open,
    playableImprovementPct: rel,
    naiveImprovementPct: relNaive,
    // the bias is dropped: it shifts every candidate alike and the arm only takes an argmax
    biasDropped: mFull.b,
    secs,
  },
}
fs.writeFileSync(OUT, JSON.stringify(model))
console.log('')
console.log(`fit-ask-value: ${secs.toFixed(1)}s -> ${OUT} (${NA} ask weights; the state half and the bias stay here, both constant across a decision's candidates)`)
