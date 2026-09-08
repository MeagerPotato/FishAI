/**
 * fit-value.mjs - MONET.md 3.8ab: fit the learned leaf on scripts/gen-value-data.mjs's files and write it
 * as a `ValueModel` JSON (lib/engine/search/value.ts) the search arm can register.
 *
 *   node scripts/fit-value.mjs --data data/vdata-1.bin,data/vdata-2.bin --out models/v29-lin.json
 *        [--model linear|mlp] [--hidden 64,64] [--epochs 10] [--batch 256] [--lr 0.001] [--l2 0.00001]
 *        [--holdout-mod 5] [--seed 1] [--max-rows 0]
 *
 * The holdout is every game whose index is 0 mod `--holdout-mod` (a split by game, never by row: the
 * rows of one game share its outcome). Features are standardised on the training rows. `linear` is
 * ridge regression in closed form (the normal equations, Cholesky); `mlp` is dense layers with ReLU,
 * He-initialised, trained by Adam on the mean squared error, the epoch with the best holdout error
 * kept (so the holdout number is mildly optimistic; the read that matters is the game). Reported
 * against the baselines every leaf must beat as a predictor of the final set differential: the
 * constant, the current score differential as-is and calibrated, the arm's static lock-only leaf
 * (lock0: the set differential plus the locked sets, the evaluation a learned leaf replaces) as-is and
 * calibrated, and - where the data carries it - the arm's 24-step lock-only rollout from the true state
 * (lock24, the search's actual horizon value), as-is and calibrated.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const S = await import(pathToFileURL(join(ROOT, 'lib/engine/search/index.ts')).href)
const { mulberry32 } = await import(pathToFileURL(join(ROOT, 'lib/engine/rng.ts')).href)

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const FILES = argOf('--data', '').split(',').filter(Boolean)
const OUT = argOf('--out', '')
const MODEL = argOf('--model', 'linear')
const HIDDEN = argOf('--hidden', '64,64').split(',').map(Number).filter((n) => n > 0)
const EPOCHS = Number(argOf('--epochs', 10))
const BATCH = Number(argOf('--batch', 256))
const LR = Number(argOf('--lr', 0.001))
const L2 = Number(argOf('--l2', 0.00001))
const HOLD = Number(argOf('--holdout-mod', 5))
const SEED = Number(argOf('--seed', 1))
const MAXROWS = Number(argOf('--max-rows', 0))
if (FILES.length === 0 || !OUT) {
  console.error('--data and --out are required')
  process.exit(2)
}

// ---- load
const NF = S.VALUE_FEATURE_COUNT
let COLS = 0
const parts = []
let total = 0
for (const f of FILES) {
  const h = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8'))
  if (h.features !== NF) throw new Error(`${f}: ${h.features} features, this build has ${NF}`)
  if (COLS && h.cols !== COLS) throw new Error(`${f}: ${h.cols} cols`)
  COLS = h.cols
  const buf = fs.readFileSync(f)
  const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  parts.push(arr)
  total += arr.length / COLS
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
const names = S.valueFeatureNames()
const T = NF // target column
const LOCK0C = NF + 1
const LOCKC = NF + 2
const GAMEC = NF + 3
const train = []
const hold = []
for (let i = 0; i < N; i++) (X[i * COLS + GAMEC] % HOLD === 0 ? hold : train).push(i)
console.log(`rows ${N} (${FILES.length} files); train ${train.length}, holdout ${hold.length} (games 0 mod ${HOLD}); features ${NF}`)

// ---- standardisation on the training rows
const mean = new Float64Array(NF)
const std = new Float64Array(NF)
for (const i of train) for (let j = 0; j < NF; j++) mean[j] += X[i * COLS + j]
for (let j = 0; j < NF; j++) mean[j] /= train.length
for (const i of train) for (let j = 0; j < NF; j++) { const d = X[i * COLS + j] - mean[j]; std[j] += d * d }
for (let j = 0; j < NF; j++) std[j] = Math.sqrt(std[j] / Math.max(1, train.length - 1))
const inv = Float64Array.from(std, (v) => (v > 0 ? 1 / v : 0))
const Z = new Float32Array(N * NF)
const Y = new Float32Array(N)
for (let i = 0; i < N; i++) {
  for (let j = 0; j < NF; j++) Z[i * NF + j] = (X[i * COLS + j] - mean[j]) * inv[j]
  Y[i] = X[i * COLS + T]
}

// ---- baselines
let model_lock = null
const mse = (idx, pred) => { let s = 0; for (const i of idx) { const d = pred(i) - Y[i]; s += d * d } return s / idx.length }
const meanY = train.reduce((a, i) => a + Y[i], 0) / train.length
const varHold = mse(hold, () => meanY)
const r2 = (m) => 1 - m / varHold
const fmt = (m) => `MSE ${m.toFixed(4)} (R2 ${r2(m).toFixed(4)})`
function calib(idx, col) { // a + b·x fitted on the training rows where x is present
  let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0
  for (const i of idx) { const x = X[i * COLS + col]; if (Number.isNaN(x)) continue; sx += x; sy += Y[i]; sxx += x * x; sxy += x * Y[i]; n++ }
  if (n < 2) return null
  const b = (n * sxy - sx * sy) / Math.max(1e-12, n * sxx - sx * sx)
  return { a: (sy - b * sx) / n, b, n }
}
console.log(`holdout: constant ${fmt(varHold)}`)
{
  const sd = 0 // scoreDiff column
  console.log(`holdout: scoreDiff as-is ${fmt(mse(hold, (i) => X[i * COLS + sd]))}`)
  const c = calib(train, sd)
  console.log(`holdout: scoreDiff calibrated (${c.a.toFixed(3)} + ${c.b.toFixed(3)} x) ${fmt(mse(hold, (i) => c.a + c.b * X[i * COLS + sd]))}`)
  const c0 = calib(train, LOCK0C)
  console.log(`holdout: lock0 (the static lock-only leaf) as-is ${fmt(mse(hold, (i) => X[i * COLS + LOCK0C]))}; calibrated (${c0.a.toFixed(3)} + ${c0.b.toFixed(3)} x) ${fmt(mse(hold, (i) => c0.a + c0.b * X[i * COLS + LOCK0C]))}`)
  const lockRows = hold.filter((i) => !Number.isNaN(X[i * COLS + LOCKC]))
  if (lockRows.length > 0) {
    // lock24 is recorded on the holdout games only (gen-value-data --lock-mod = the holdout modulus), so its
    // two-parameter calibration is fitted on the rows it is read on - a negligible optimism at this size, stated here
    const cl = calib(lockRows, LOCKC)
    const varL = mse(lockRows, () => meanY)
    const asIs = mse(lockRows, (i) => X[i * COLS + LOCKC])
    const cal = mse(lockRows, (i) => cl.a + cl.b * X[i * COLS + LOCKC])
    const l0 = calib(train, LOCK0C)
    const stat0 = mse(lockRows, (i) => l0.a + l0.b * X[i * COLS + LOCK0C])
    console.log(`holdout (the ${lockRows.length} rows with lock24): constant MSE ${varL.toFixed(4)}; lock0 calibrated MSE ${stat0.toFixed(4)} (R2 ${(1 - stat0 / varL).toFixed(4)}); lock24 as-is MSE ${asIs.toFixed(4)} (R2 ${(1 - asIs / varL).toFixed(4)}); lock24 calibrated on these rows (${cl.a.toFixed(3)} + ${cl.b.toFixed(3)} x) MSE ${cal.toFixed(4)} (R2 ${(1 - cal / varL).toFixed(4)})`)
    model_lock = { rows: lockRows.length, constant: varL, lock0Calibrated: stat0, lock24AsIs: asIs, lock24Calibrated: cal, lockRowsIdx: lockRows }
  }
}

// ---- the model
let layers
const t0 = Date.now()
if (MODEL === 'linear') {
  // ridge: (ZᵀZ + λI) w = Zᵀy with a bias column
  const D = NF + 1
  const A = new Float64Array(D * D)
  const bv = new Float64Array(D)
  const zi = new Float64Array(D)
  for (const i of train) {
    for (let j = 0; j < NF; j++) zi[j] = Z[i * NF + j]
    zi[NF] = 1
    for (let a = 0; a < D; a++) {
      const za = zi[a]
      if (za === 0) continue
      bv[a] += za * Y[i]
      const row = a * D
      for (let b = a; b < D; b++) A[row + b] += za * zi[b]
    }
  }
  for (let a = 0; a < D; a++) for (let b = 0; b < a; b++) A[a * D + b] = A[b * D + a]
  const lam = L2 * train.length
  for (let a = 0; a < NF; a++) A[a * D + a] += lam
  // Cholesky
  const Lm = new Float64Array(D * D)
  for (let i = 0; i < D; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * D + j]
      for (let k = 0; k < j; k++) s -= Lm[i * D + k] * Lm[j * D + k]
      if (i === j) {
        if (s <= 0) throw new Error(`not positive definite at ${i} (${names[i] ?? 'bias'})`)
        Lm[i * D + i] = Math.sqrt(s)
      } else Lm[i * D + j] = s / Lm[j * D + j]
    }
  }
  const y1 = new Float64Array(D)
  for (let i = 0; i < D; i++) { let s = bv[i]; for (let k = 0; k < i; k++) s -= Lm[i * D + k] * y1[k]; y1[i] = s / Lm[i * D + i] }
  const w = new Float64Array(D)
  for (let i = D - 1; i >= 0; i--) { let s = y1[i]; for (let k = i + 1; k < D; k++) s -= Lm[k * D + i] * w[k]; w[i] = s / Lm[i * D + i] }
  layers = [{ w: Array.from(w.subarray(0, NF)), b: [w[NF]] }]
  const top = Array.from({ length: NF }, (_, j) => [names[j], w[j]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 24)
  console.log('largest standardised weights: ' + top.map(([n, v]) => `${n} ${v >= 0 ? '+' : ''}${v.toFixed(3)}`).join(', '))
} else if (MODEL === 'mlp') {
  const sizes = [NF, ...HIDDEN, 1]
  const rng = mulberry32(SEED)
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
  const W = [], B = [], mW = [], vW = [], mB = [], vB = [], gW = [], gB = []
  for (let l = 0; l + 1 < sizes.length; l++) {
    const inp = sizes[l], out = sizes[l + 1]
    const w = new Float64Array(out * inp)
    const sc = Math.sqrt(2 / inp)
    for (let i = 0; i < w.length; i++) w[i] = gauss() * sc
    W.push(w); B.push(new Float64Array(out))
    mW.push(new Float64Array(out * inp)); vW.push(new Float64Array(out * inp)); gW.push(new Float64Array(out * inp))
    mB.push(new Float64Array(out)); vB.push(new Float64Array(out)); gB.push(new Float64Array(out))
  }
  const NL = W.length
  const acts = sizes.map((n) => new Float64Array(n))
  const deltas = sizes.map((n) => new Float64Array(n))
  const forward = (row) => {
    const x = acts[0]
    for (let j = 0; j < NF; j++) x[j] = Z[row * NF + j]
    for (let l = 0; l < NL; l++) {
      const inp = sizes[l], out = sizes[l + 1], w = W[l], b = B[l], a = acts[l], o = acts[l + 1]
      const last = l === NL - 1
      for (let u = 0; u < out; u++) {
        let acc = b[u]
        const base = u * inp
        for (let i = 0; i < inp; i++) acc += w[base + i] * a[i]
        o[u] = last || acc > 0 ? acc : 0
      }
    }
    return acts[NL][0]
  }
  const evalMse = (idx) => { let s = 0; for (const i of idx) { const d = forward(i) - Y[i]; s += d * d } return s / idx.length }
  const order = Int32Array.from(train)
  let step = 0
  let best = { mse: Number.POSITIVE_INFINITY, W: null, B: null, epoch: -1 }
  const b1 = 0.9, b2 = 0.999, eps = 1e-8
  for (let ep = 1; ep <= EPOCHS; ep++) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t }
    let trainLoss = 0
    for (let start = 0; start < order.length; start += BATCH) {
      const end = Math.min(order.length, start + BATCH)
      const bs = end - start
      for (let l = 0; l < NL; l++) { gW[l].fill(0); gB[l].fill(0) }
      for (let r = start; r < end; r++) {
        const row = order[r]
        const y = forward(row)
        const d = y - Y[row]
        trainLoss += d * d
        deltas[NL][0] = (2 * d) / bs
        for (let l = NL - 1; l >= 0; l--) {
          const inp = sizes[l], out = sizes[l + 1], w = W[l], a = acts[l], dl = deltas[l + 1], dprev = deltas[l]
          if (l > 0) dprev.fill(0)
          for (let u = 0; u < out; u++) {
            const du = dl[u]
            if (du === 0) continue
            gB[l][u] += du
            const base = u * inp
            const gw = gW[l]
            for (let i = 0; i < inp; i++) gw[base + i] += du * a[i]
            if (l > 0) for (let i = 0; i < inp; i++) if (a[i] > 0) dprev[i] += du * w[base + i]
          }
        }
      }
      step++
      const c1 = 1 - Math.pow(b1, step), c2 = 1 - Math.pow(b2, step)
      for (let l = 0; l < NL; l++) {
        const w = W[l], g = gW[l], m = mW[l], v = vW[l]
        for (let i = 0; i < w.length; i++) {
          const gi = g[i] + L2 * w[i]
          m[i] = b1 * m[i] + (1 - b1) * gi
          v[i] = b2 * v[i] + (1 - b2) * gi * gi
          w[i] -= (LR * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + eps)
        }
        const b = B[l], gb = gB[l], mb = mB[l], vb = vB[l]
        for (let i = 0; i < b.length; i++) {
          mb[i] = b1 * mb[i] + (1 - b1) * gb[i]
          vb[i] = b2 * vb[i] + (1 - b2) * gb[i] * gb[i]
          b[i] -= (LR * (mb[i] / c1)) / (Math.sqrt(vb[i] / c2) + eps)
        }
      }
    }
    const h = evalMse(hold)
    console.log(`epoch ${ep}: train MSE ${(trainLoss / order.length).toFixed(4)}; holdout ${fmt(h)}; ${((Date.now() - t0) / 1000).toFixed(0)}s`)
    if (h < best.mse) best = { mse: h, W: W.map((w) => Float64Array.from(w)), B: B.map((b) => Float64Array.from(b)), epoch: ep }
  }
  layers = best.W.map((w, l) => ({ w: Array.from(w), b: Array.from(best.B[l]) }))
  console.log(`kept epoch ${best.epoch}`)
} else {
  console.error(`--model must be linear or mlp; got ${MODEL}`)
  process.exit(2)
}

// ---- report through the engine's own forward pass, and write
const model = { features: NF, mean: Array.from(mean), std: Array.from(std), layers, meta: { model: MODEL, hidden: MODEL === 'mlp' ? HIDDEN : [], epochs: EPOCHS, batch: BATCH, lr: LR, l2: L2, holdoutMod: HOLD, seed: SEED, files: FILES, rows: N, train: train.length, holdout: hold.length } }
const compiled = S.compileValueModel(model)
const xrow = new Float64Array(NF)
const predict = (i) => { for (let j = 0; j < NF; j++) xrow[j] = X[i * COLS + j]; return S.valueOfFeatures(compiled, xrow) }
const mTrain = mse(train, predict)
const mHold = mse(hold, predict)
model.meta.trainMse = mTrain
model.meta.holdoutMse = mHold
model.meta.holdoutR2 = r2(mHold)
model.meta.holdoutConstantMse = varHold
{
  const l0 = calib(train, LOCK0C)
  model.meta.holdoutLock0CalibratedMse = mse(hold, (i) => l0.a + l0.b * X[i * COLS + LOCK0C])
  if (model_lock) {
    const mine = mse(model_lock.lockRowsIdx, predict)
    model.meta.lockRows = { rows: model_lock.rows, constant: model_lock.constant, lock0Calibrated: model_lock.lock0Calibrated, lock24AsIs: model_lock.lock24AsIs, lock24Calibrated: model_lock.lock24Calibrated, model: mine }
    console.log(`${MODEL} on the ${model_lock.rows} lock24 rows: MSE ${mine.toFixed(4)} (R2 ${(1 - mine / model_lock.constant).toFixed(4)}) against lock24 calibrated ${model_lock.lock24Calibrated.toFixed(4)} and lock0 calibrated ${model_lock.lock0Calibrated.toFixed(4)}`)
  }
}
console.log(`${MODEL}: train ${fmt(mTrain)}; holdout ${fmt(mHold)}; ${((Date.now() - t0) / 1000).toFixed(0)}s`)
{ // antisymmetry: the two teams' rows of one state should sum to ~0 (they are consecutive in the files)
  let s = 0, n = 0
  for (const i of hold) if (i + 1 < N && X[i * COLS + NF + 5] === 0 && X[(i + 1) * COLS + NF + 5] === 1 && X[i * COLS + NF + 4] === X[(i + 1) * COLS + NF + 4]) { const d = predict(i) + predict(i + 1); s += d * d; n++ }
  if (n > 0) console.log(`antisymmetry on ${n} holdout state pairs: RMS of V(team0)+V(team1) = ${Math.sqrt(s / n).toFixed(4)}`)
}
fs.mkdirSync(dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(model))
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`)
