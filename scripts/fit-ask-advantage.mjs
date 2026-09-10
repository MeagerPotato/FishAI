/**
 * fit-ask-advantage.mjs - MONET.md 3.8aw stage B: fit the learned ask ADVANTAGE on
 * gen-ask-advantage-data.mjs's pairs, and read gate B1.
 *
 *   node scripts/fit-ask-advantage.mjs --data C:/Projects/FishAI-bench/v51/A --out C:/Projects/FishAI-bench/v51/adv-1.json
 *        [--hidden 64,64] [--epochs 12] [--lr 0.001] [--l2 0.00001] [--batch 256] [--holdout-mod 5]
 *        [--seed 1] [--target set|win] [--max-pairs 0]
 *
 * THE OBJECT. A score f over one ask's feature row, fitted so that f(alternative) - f(played) matches the
 * measured difference between the two rollouts in the asking team's final set differential (`--target
 * set`, the registered target) or in whether it won (`--target win`). The fit is PAIRWISE on purpose: the
 * two asks share the state, so any part of f that only describes the position cancels, and what is left
 * is how much better or worse one ask is than another AT THIS POSITION - the quantity a policy acts on.
 * At play the arm scores every legal ask and leaves the clone's choice only where the best score beats
 * the clone's own by a margin (scripts/probe-ask-advantage.mjs reads that margin against the true deal).
 *
 * THE MODEL. An MLP with ReLU between hidden layers (no hidden layers is a linear model), Adam over
 * shuffled minibatches of pairs, L2 as weight decay, the epoch with the lowest holdout mean squared error
 * kept. Inputs are standardised on the training rows; the `DenseModel` written (lib/engine/bots/net.ts)
 * carries the standardisation, so `compileNet` + `forwardNet` play it as it stands.
 *
 * THE HOLDOUT is by GAME (every game whose index is 0 mod `--holdout-mod`), never by row: the rows of one
 * decision share a state and the decisions of one game share a deal.
 *
 * THREE BASELINES on the same split, in closed form:
 *   zero   - predict no difference; its MSE is the label's own second moment.
 *   clone  - the clone's opinion alone, least squares on the pair differences of `cloneRel` and
 *            `isCloneTop`. THE GATE'S BASELINE: a model that cannot beat "leaving the clone's choice costs
 *            about this much, more the lower the clone rates the ask" has found no choice signal of its own.
 *   linear - every feature, ridge on the standardised pair differences: 3.8as's model class, on paired labels.
 *
 * GATE B1 (3.8aw): the MLP's holdout MSE must beat the clone baseline's by more than two standard errors,
 * the SE clustered by held-out game. Printed as PASS or FAIL beside the number.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { mulberry32 } = await import(pathToFileURL(join(ROOT, 'lib/engine/rng.ts')).href)

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const PREFIXES = argOf('--data', '').split(',').filter(Boolean)
const OUT = argOf('--out', '')
const HIDDEN = argOf('--hidden', '64,64').split(',').map(Number).filter((n) => n > 0)
const EPOCHS = Number(argOf('--epochs', 12))
const LR = Number(argOf('--lr', 0.001))
const L2 = Number(argOf('--l2', 0.00001))
const BATCH = Math.max(1, Number(argOf('--batch', 256)))
const HOLD = Number(argOf('--holdout-mod', 5))
const SEED = Number(argOf('--seed', 1))
const TARGET = argOf('--target', 'set')
const MAXP = Number(argOf('--max-pairs', 0))
if (PREFIXES.length === 0 || !OUT) {
  console.error('--data and --out are required')
  process.exit(2)
}
if (TARGET !== 'set' && TARGET !== 'win') {
  console.error('--target is set or win')
  process.exit(2)
}

/** A Float32 file read in 1 GiB slices straight into its array (readFileSync refuses a file over 2 GiB). */
function readF32(f) {
  const size = fs.statSync(f).size
  if (size % 4 !== 0) throw new Error(`${f}: ${size} bytes is not a Float32 file`)
  const out = new Float32Array(size / 4)
  const view = Buffer.from(out.buffer)
  const fd = fs.openSync(f, 'r')
  let off = 0
  while (off < size) {
    const n = fs.readSync(fd, view, off, Math.min(1 << 30, size - off), off)
    if (n <= 0) throw new Error(`${f}: short read at ${off}`)
    off += n
  }
  fs.closeSync(fd)
  return out
}

const t0 = Date.now()
const el = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`

// ---- load
let NF = -1
let COLS = -1
let NAMES = null
const parts = []
for (const p of PREFIXES) {
  const h = JSON.parse(fs.readFileSync(`${p}.json`, 'utf8'))
  if (h.kind !== 'ask-advantage') throw new Error(`${p}.json: kind ${h.kind}, not ask-advantage`)
  if (NF < 0) {
    NF = h.features
    COLS = h.cols
    NAMES = h.featureNames
  } else if (h.features !== NF || h.cols !== COLS) {
    throw new Error(`${p}: ${h.features} features and ${h.cols} columns against the first file's ${NF} and ${COLS}`)
  }
  const buf = readF32(`${p}.bin`)
  if (buf.length % COLS !== 0) throw new Error(`${p}.bin: ${buf.length} values is not a whole number of ${COLS}-column rows`)
  parts.push({ buf, rows: buf.length / COLS })
}
const C_SET = 2 * NF
const C_WIN = 2 * NF + 1
const C_GAME = 2 * NF + 2
const C_MOVE = 2 * NF + 3
const I_REL = NAMES.indexOf('cloneRel')
const I_TOP = NAMES.indexOf('isCloneTop')
if (I_REL < 0 || I_TOP < 0) throw new Error('the files carry no cloneRel / isCloneTop columns')

let N = 0
for (const p of parts) N += p.rows
if (MAXP > 0 && N > MAXP) N = MAXP
const XA = new Float32Array(N * NF)
const XP = new Float32Array(N * NF)
const Y = new Float32Array(N)
const CLUSTER = new Int32Array(N)
const DECISION = new Int32Array(N)
const HOLDOUT = new Uint8Array(N)
let nClusters = 0
let nDecisions = 0
{
  let i = 0
  let lastCl = ''
  let lastDec = ''
  for (let pi = 0; pi < parts.length && i < N; pi++) {
    const { buf, rows } = parts[pi]
    for (let r = 0; r < rows && i < N; r++, i++) {
      const o = r * COLS
      XA.set(buf.subarray(o, o + NF), i * NF)
      XP.set(buf.subarray(o + NF, o + 2 * NF), i * NF)
      Y[i] = TARGET === 'set' ? buf[o + C_SET] : buf[o + C_WIN]
      const game = buf[o + C_GAME]
      const ck = `${pi}:${game}`
      if (ck !== lastCl) {
        nClusters++
        lastCl = ck
      }
      CLUSTER[i] = nClusters - 1
      const dk = `${ck}:${buf[o + C_MOVE]}`
      if (dk !== lastDec) {
        nDecisions++
        lastDec = dk
      }
      DECISION[i] = nDecisions - 1
      HOLDOUT[i] = game % HOLD === 0 ? 1 : 0
    }
  }
}
parts.length = 0

// ---- standardise on the training rows, both members of every pair
const mean = new Float64Array(NF)
const second = new Float64Array(NF)
let nTrain = 0
for (let i = 0; i < N; i++) {
  if (HOLDOUT[i]) continue
  nTrain++
  const o = i * NF
  for (let f = 0; f < NF; f++) {
    const a = XA[o + f]
    const p = XP[o + f]
    mean[f] += a + p
    second[f] += a * a + p * p
  }
}
if (nTrain === 0) throw new Error('no training rows')
const std = new Float64Array(NF)
for (let f = 0; f < NF; f++) {
  mean[f] /= 2 * nTrain
  const v = second[f] / (2 * nTrain) - mean[f] * mean[f]
  std[f] = v > 1e-12 ? Math.sqrt(v) : 0
}
for (let i = 0; i < N; i++) {
  const o = i * NF
  for (let f = 0; f < NF; f++) {
    const inv = std[f] > 0 ? 1 / std[f] : 0
    XA[o + f] = (XA[o + f] - mean[f]) * inv
    XP[o + f] = (XP[o + f] - mean[f]) * inv
  }
}
const trainIdx = new Int32Array(nTrain)
const holdIdx = new Int32Array(N - nTrain)
{
  let a = 0
  let b = 0
  for (let i = 0; i < N; i++) {
    if (HOLDOUT[i]) holdIdx[b++] = i
    else trainIdx[a++] = i
  }
}
console.log(`=== fit-ask-advantage: ${PREFIXES.join(', ')}; ${N} pairs from ${nDecisions} decisions in ${nClusters} games; train ${nTrain}, holdout ${holdIdx.length} (games 0 mod ${HOLD}); target ${TARGET}; ${NF} features; loaded in ${el()} ===`)

// ---- baselines
function mseOf(pred) {
  let s = 0
  for (let j = 0; j < holdIdx.length; j++) {
    const e = pred[j] - Y[holdIdx[j]]
    s += e * e
  }
  return s / holdIdx.length
}
const predZero = new Float64Array(holdIdx.length)

// clone: y = b1 * d(cloneRel) + b0 * d(isCloneTop), standardised differences
let predClone
let cloneCoef
{
  let suu = 0
  let suv = 0
  let svv = 0
  let suy = 0
  let svy = 0
  for (const i of trainIdx) {
    const o = i * NF
    const u = XA[o + I_REL] - XP[o + I_REL]
    const v = XA[o + I_TOP] - XP[o + I_TOP]
    const y = Y[i]
    suu += u * u
    suv += u * v
    svv += v * v
    suy += u * y
    svy += v * y
  }
  const ridge = 1e-9 * nTrain
  const a11 = suu + ridge
  const a22 = svv + ridge
  const det = a11 * a22 - suv * suv
  const b1 = (suy * a22 - suv * svy) / det
  const b0 = (a11 * svy - suv * suy) / det
  cloneCoef = { cloneRel: b1, isCloneTop: b0 }
  predClone = new Float64Array(holdIdx.length)
  for (let j = 0; j < holdIdx.length; j++) {
    const o = holdIdx[j] * NF
    predClone[j] = b1 * (XA[o + I_REL] - XP[o + I_REL]) + b0 * (XA[o + I_TOP] - XP[o + I_TOP])
  }
}

// linear: ridge on the standardised differences, Cholesky
let predLinear
{
  const A = new Float64Array(NF * NF)
  const bv = new Float64Array(NF)
  const d = new Float64Array(NF)
  for (const i of trainIdx) {
    const o = i * NF
    for (let f = 0; f < NF; f++) d[f] = XA[o + f] - XP[o + f]
    const y = Y[i]
    for (let f = 0; f < NF; f++) {
      const df = d[f]
      if (df === 0) continue
      bv[f] += df * y
      const row = f * NF
      for (let g = f; g < NF; g++) A[row + g] += df * d[g]
    }
  }
  const lambda = 1e-3 * nTrain
  for (let f = 0; f < NF; f++) {
    A[f * NF + f] += lambda
    for (let g = 0; g < f; g++) A[f * NF + g] = A[g * NF + f]
  }
  const L = new Float64Array(NF * NF)
  for (let f = 0; f < NF; f++) {
    for (let g = 0; g <= f; g++) {
      let s = A[f * NF + g]
      for (let h = 0; h < g; h++) s -= L[f * NF + h] * L[g * NF + h]
      L[f * NF + g] = f === g ? Math.sqrt(Math.max(s, 1e-12)) : s / L[g * NF + g]
    }
  }
  const z = new Float64Array(NF)
  for (let f = 0; f < NF; f++) {
    let s = bv[f]
    for (let h = 0; h < f; h++) s -= L[f * NF + h] * z[h]
    z[f] = s / L[f * NF + f]
  }
  const beta = new Float64Array(NF)
  for (let f = NF - 1; f >= 0; f--) {
    let s = z[f]
    for (let h = f + 1; h < NF; h++) s -= L[h * NF + f] * beta[h]
    beta[f] = s / L[f * NF + f]
  }
  predLinear = new Float64Array(holdIdx.length)
  for (let j = 0; j < holdIdx.length; j++) {
    const o = holdIdx[j] * NF
    let s = 0
    for (let f = 0; f < NF; f++) s += beta[f] * (XA[o + f] - XP[o + f])
    predLinear[j] = s
  }
}
console.log(`baselines fitted (${el()}): zero MSE ${mseOf(predZero).toFixed(5)}, clone ${mseOf(predClone).toFixed(5)}, linear ${mseOf(predLinear).toFixed(5)}`)

// ---- the MLP
const dims = [NF, ...HIDDEN, 1]
const NL = dims.length - 1
const rng = mulberry32(SEED)
const gauss = () => {
  let u = 0
  while (u === 0) u = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}
const W = []
const B = []
for (let l = 0; l < NL; l++) {
  const w = new Float64Array(dims[l + 1] * dims[l])
  const scale = Math.sqrt(2 / dims[l]) * (l === NL - 1 ? 0.1 : 1)
  for (let i = 0; i < w.length; i++) w[i] = gauss() * scale
  W.push(w)
  B.push(new Float64Array(dims[l + 1]))
}
const gW = W.map((w) => new Float64Array(w.length))
const gB = B.map((b) => new Float64Array(b.length))
const mW = W.map((w) => new Float64Array(w.length))
const vW = W.map((w) => new Float64Array(w.length))
const mB = B.map((b) => new Float64Array(b.length))
const vB = B.map((b) => new Float64Array(b.length))
const actsA = dims.map((d) => new Float64Array(d))
const actsP = dims.map((d) => new Float64Array(d))
const deltas = dims.map((d) => new Float64Array(d))

function forward(X, off, acts) {
  let inp = X
  let io = off
  for (let l = 0; l < NL; l++) {
    const w = W[l]
    const b = B[l]
    const out = acts[l + 1]
    const nIn = dims[l]
    const nOut = dims[l + 1]
    const last = l === NL - 1
    for (let o = 0; o < nOut; o++) {
      let s = b[o]
      const base = o * nIn
      for (let i = 0; i < nIn; i++) s += w[base + i] * inp[io + i]
      out[o] = last || s > 0 ? s : 0
    }
    inp = out
    io = 0
  }
  return acts[NL][0]
}

function backward(X, off, acts, g) {
  let d = deltas[NL]
  d[0] = g
  for (let l = NL - 1; l >= 0; l--) {
    const w = W[l]
    const nIn = dims[l]
    const nOut = dims[l + 1]
    const inp = l === 0 ? X : acts[l]
    const io = l === 0 ? off : 0
    const gw = gW[l]
    const gb = gB[l]
    const prev = deltas[l]
    if (l > 0) prev.fill(0)
    for (let o = 0; o < nOut; o++) {
      const go = d[o]
      if (go === 0) continue
      gb[o] += go
      const base = o * nIn
      if (l > 0) {
        for (let i = 0; i < nIn; i++) {
          gw[base + i] += go * inp[io + i]
          prev[i] += go * w[base + i]
        }
      } else {
        for (let i = 0; i < nIn; i++) gw[base + i] += go * inp[io + i]
      }
    }
    if (l > 0) {
      const a = acts[l]
      for (let i = 0; i < nIn; i++) if (a[i] <= 0) prev[i] = 0
    }
    d = prev
  }
}

function predictHoldout() {
  const pred = new Float64Array(holdIdx.length)
  for (let j = 0; j < holdIdx.length; j++) {
    const o = holdIdx[j] * NF
    pred[j] = forward(XA, o, actsA) - forward(XP, o, actsP)
  }
  return pred
}

let best = { mse: Infinity, epoch: 0, W: null, B: null }
let step = 0
const b1 = 0.9
const b2 = 0.999
const eps = 1e-8
const order = Int32Array.from(trainIdx)
for (let ep = 1; ep <= EPOCHS; ep++) {
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  let loss = 0
  for (let start = 0; start < order.length; start += BATCH) {
    const end = Math.min(order.length, start + BATCH)
    const bs = end - start
    for (let l = 0; l < NL; l++) {
      gW[l].fill(0)
      gB[l].fill(0)
    }
    for (let j = start; j < end; j++) {
      const i = order[j]
      const o = i * NF
      const fa = forward(XA, o, actsA)
      const fp = forward(XP, o, actsP)
      const err = fa - fp - Y[i]
      loss += err * err
      const g = (2 * err) / bs
      backward(XA, o, actsA, g)
      backward(XP, o, actsP, -g)
    }
    step++
    const c1 = 1 - Math.pow(b1, step)
    const c2 = 1 - Math.pow(b2, step)
    for (let l = 0; l < NL; l++) {
      const w = W[l]
      const gw = gW[l]
      const m = mW[l]
      const v = vW[l]
      for (let i = 0; i < w.length; i++) {
        const gi = gw[i] + L2 * w[i]
        m[i] = b1 * m[i] + (1 - b1) * gi
        v[i] = b2 * v[i] + (1 - b2) * gi * gi
        w[i] -= (LR * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + eps)
      }
      const b = B[l]
      const gb = gB[l]
      const mb = mB[l]
      const vb = vB[l]
      for (let i = 0; i < b.length; i++) {
        mb[i] = b1 * mb[i] + (1 - b1) * gb[i]
        vb[i] = b2 * vb[i] + (1 - b2) * gb[i] * gb[i]
        b[i] -= (LR * (mb[i] / c1)) / (Math.sqrt(vb[i] / c2) + eps)
      }
    }
  }
  const hm = mseOf(predictHoldout())
  console.log(`epoch ${ep}: train MSE ${(loss / order.length).toFixed(5)}; holdout MSE ${hm.toFixed(5)}; ${el()}`)
  if (hm < best.mse) best = { mse: hm, epoch: ep, W: W.map((w) => Float64Array.from(w)), B: B.map((b) => Float64Array.from(b)) }
}
for (let l = 0; l < NL; l++) {
  W[l].set(best.W[l])
  B[l].set(best.B[l])
}
const predMlp = predictHoldout()

// ---- gate B1 and the reads, on the holdout
function improvement(base, model) {
  const S = new Float64Array(nClusters)
  const C = new Float64Array(nClusters)
  let tot = 0
  for (let j = 0; j < holdIdx.length; j++) {
    const i = holdIdx[j]
    const eb = base[j] - Y[i]
    const em = model[j] - Y[i]
    const d = eb * eb - em * em
    S[CLUSTER[i]] += d
    C[CLUSTER[i]] += 1
    tot += d
  }
  const n = holdIdx.length
  const m = tot / n
  let v = 0
  for (let c = 0; c < nClusters; c++) {
    if (C[c] === 0) continue
    const r = S[c] - C[c] * m
    v += r * r
  }
  const se = Math.sqrt(v) / n
  return { mean: m, se, z: se > 0 ? m / se : NaN }
}
const mZero = mseOf(predZero)
const mClone = mseOf(predClone)
const mLin = mseOf(predLinear)
const mMlp = mseOf(predMlp)
const gate = improvement(predClone, predMlp)
const vsLinear = improvement(predLinear, predMlp)
const linVsClone = improvement(predClone, predLinear)
const pass = gate.mean - 2 * gate.se > 0
console.log('')
console.log(`kept epoch ${best.epoch} of ${EPOCHS} (hidden ${HIDDEN.length ? HIDDEN.join(',') : 'none - linear'})`)
console.log('| model | holdout MSE | share of the zero predictor explained |')
console.log('|---|---:|---:|')
for (const [name, m] of [['zero', mZero], ['clone (2 terms)', mClone], ['linear (all features)', mLin], ['MLP', mMlp]]) {
  console.log(`| ${name} | ${m.toFixed(5)} | ${(100 * (1 - m / mZero)).toFixed(2)}% |`)
}
console.log('')
console.log(`GATE B1 - MLP over the clone baseline: MSE lower by ${gate.mean.toFixed(5)} (SE ${gate.se.toFixed(5)}, clustered by game; z ${gate.z.toFixed(2)}) -> ${pass ? 'PASS' : 'FAIL'}`)
console.log(`  for information: linear over clone ${linVsClone.mean.toFixed(5)} (z ${linVsClone.z.toFixed(2)}); MLP over linear ${vsLinear.mean.toFixed(5)} (z ${vsLinear.z.toFixed(2)})`)
console.log(`  clone baseline coefficients (standardised): cloneRel ${cloneCoef.cloneRel.toFixed(4)}, isCloneTop ${cloneCoef.isCloneTop.toFixed(4)}`)

// the predicted difference against the measured one, binned - is the model right where it says an ask is better?
const EDGES = [-Infinity, -1, -0.5, -0.2, -0.1, 0, 0.1, 0.2, 0.5, 1, Infinity]
const bins = EDGES.slice(0, -1).map(() => ({ n: 0, pred: 0, y: 0 }))
for (let j = 0; j < holdIdx.length; j++) {
  const p = predMlp[j]
  let b = 0
  while (b < bins.length - 1 && p >= EDGES[b + 1]) b++
  bins[b].n++
  bins[b].pred += p
  bins[b].y += Y[holdIdx[j]]
}
console.log('')
console.log('| MLP predicted difference | pairs | mean predicted | mean measured |')
console.log('|---|---:|---:|---:|')
bins.forEach((b, i) => {
  if (b.n === 0) return
  console.log(`| ${EDGES[i]} to ${EDGES[i + 1]} | ${b.n} | ${(b.pred / b.n).toFixed(3)} | ${(b.y / b.n).toFixed(3)} |`)
})

// per held-out decision, the labelled alternative the MLP likes best
{
  const bestAt = new Map()
  for (let j = 0; j < holdIdx.length; j++) {
    const i = holdIdx[j]
    const d = DECISION[i]
    const cur = bestAt.get(d)
    if (cur === undefined || predMlp[j] > cur.p) bestAt.set(d, { p: predMlp[j], y: Y[i], c: CLUSTER[i] })
  }
  let n = 0
  let sy = 0
  let pos = 0
  let syPos = 0
  for (const v of bestAt.values()) {
    n++
    sy += v.y
    if (v.p > 0) {
      pos++
      syPos += v.y
    }
  }
  console.log('')
  console.log(`per held-out decision, the labelled alternative the MLP rates highest: measured ${(sy / Math.max(1, n)).toFixed(4)} over ${n} decisions; rated above the played ask on ${pos} (${((100 * pos) / Math.max(1, n)).toFixed(1)}%), measured ${(syPos / Math.max(1, pos)).toFixed(4)} there`)
  console.log('  (labelled alternatives only - the marker probe prices the choice over the whole legal list)')
}

const model = {
  features: NF,
  mean: Array.from(mean),
  std: Array.from(std),
  layers: W.map((w, l) => ({ w: Array.from(w), b: Array.from(B[l]) })),
  meta: {
    kind: 'ask-advantage',
    section: '3.8aw',
    featureNames: NAMES,
    target: TARGET,
    hidden: HIDDEN,
    epochs: EPOCHS,
    kept: best.epoch,
    lr: LR,
    l2: L2,
    batch: BATCH,
    seed: SEED,
    data: PREFIXES,
    pairs: N,
    decisions: nDecisions,
    games: nClusters,
    train: nTrain,
    holdout: holdIdx.length,
    holdoutMod: HOLD,
    holdoutMse: { zero: mZero, clone: mClone, linear: mLin, mlp: mMlp },
    gateB1: { ...gate, pass },
    cloneCoef,
    secs: (Date.now() - t0) / 1000,
  },
}
fs.mkdirSync(dirname(resolve(OUT)), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(model))
console.log(`\n-> ${OUT} (${el()})`)
