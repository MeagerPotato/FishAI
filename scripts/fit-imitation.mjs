/**
 * fit-imitation.mjs - MONET.md 3.8ac: fit the imitation ask policy on scripts/gen-imitation-data.mjs's files
 * and write it as an `AskModel` JSON (lib/engine/bots/imitation.ts) a style can name through `askModel`.
 *
 *   node scripts/fit-imitation.mjs --data data/imit-1.bin[,data/imit-2.bin] --out models/v30-lin.json
 *        [--model linear|mlp] [--hidden 64 or 64,64] [--epochs 10] [--lr 0.001] [--l2 0.00001] [--seed 1] [--max-decisions 0] [--train-frac 0.5]
 *
 * A conditional logit: each decision's legal asks are scored by the model, the softmax over them is the
 * policy, the loss is the negative log-probability of the ask SESTINA chose. `linear` scores with one
 * dense layer, `mlp` with hidden layers of ReLU; both by Adam over decisions (one decision = one step's
 * worth of rows), the epoch with the best holdout log-likelihood kept. Read on the holdout (the games of
 * the files gen-imitation-data marked): the mean log-likelihood, the top-1 agreement with SESTINA's
 * choice (and top-3), against the baselines - the ranker's own top ask (the pre-model order) and the
 * shipped stack's decision at the same views (recorded by the generator).
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const { mulberry32 } = await import(pathToFileURL(join(ROOT, 'lib/engine/rng.ts')).href)

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const FILES = argOf('--data', '').split(',').filter(Boolean)
const OUT = argOf('--out', '')
const MODEL = argOf('--model', 'linear')
const HIDDEN = argOf('--hidden', '32').split(',').map(Number).filter((n) => n > 0)
const EPOCHS = Number(argOf('--epochs', 10))
const LR = Number(argOf('--lr', 0.001))
const L2 = Number(argOf('--l2', 0.00001))
const SEED = Number(argOf('--seed', 1))
const MAXD = Number(argOf('--max-decisions', 0))
if (FILES.length === 0 || !OUT) {
  console.error('--data and --out are required')
  process.exit(2)
}

// ---- load: rows [id, chosen, features...], decisions [id, file, game, ev, asks, chosen, ours, hit, holdout, seat]
/** A Float32 file read in 1 GiB slices straight into its array: readFileSync refuses a file over 2 GiB, and a group at the second feature set is larger. */
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
// the feature set is the data's (gen-imitation-data's --features; 1 unless the header says 2), the width this build gives it
let NF = 0, SET = 1
let COLS = 0, DCOLS = 0
const rowParts = [], decParts = []
for (const f of FILES) {
  const h = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8'))
  const set = h.featureSet ?? 1
  if (BOTS.askFeatureCount(set) !== h.features) throw new Error(`${f}: ${h.features} features of set ${set}, this build has ${BOTS.askFeatureCount(set)}`)
  if (NF === 0) { NF = h.features; SET = set }
  else if (h.features !== NF || set !== SET) throw new Error(`${f}: ${h.features} features of set ${set}, the first file has ${NF} of set ${SET}`)
  COLS = h.cols; DCOLS = h.dcols
  rowParts.push(readF32(f))
  decParts.push(readF32(`${f}.dec`))
}
// decisions are contiguous in the row files; rebuild the offsets file by file
const dec = [] // { part, start, n, chosen, ours, holdout } - the rows stay in their files' arrays (no copy: the data may exceed one array)
let rowTotal = 0
for (let p = 0; p < decParts.length; p++) {
  const D = decParts[p]
  let off = 0
  for (let d = 0; d < D.length / DCOLS; d++) {
    const n = D[d * DCOLS + 4]
    dec.push({ part: p, start: off, n, chosen: D[d * DCOLS + 5], ours: D[d * DCOLS + 6], holdout: D[d * DCOLS + 8] === 1 })
    off += n * COLS
  }
  if (off !== rowParts[p].length) throw new Error(`${FILES[p]}: decisions cover ${off} floats, rows hold ${rowParts[p].length}`)
  rowTotal += off
}
const useDec = MAXD > 0 ? dec.slice(0, MAXD) : dec
// --train-frac f keeps a fraction of the training decisions, by a hash of the decision's place (the learning curve)
const TRAIN_FRAC = Number(argOf('--train-frac', 1))
const keepFrac = (d) => TRAIN_FRAC >= 1 || (Math.imul(d.part * 1000003 + d.start / COLS, 2654435761) >>> 0) / 4294967296 < TRAIN_FRAC
const train = useDec.filter((d) => !d.holdout && keepFrac(d)), hold = useDec.filter((d) => d.holdout)
console.log(`decisions ${useDec.length} (${FILES.length} files): train ${train.length}${TRAIN_FRAC < 1 ? ` (a ${TRAIN_FRAC} fraction)` : ''}, holdout ${hold.length}; rows ${rowTotal / COLS}; features ${NF}`)

// ---- standardisation on the training rows
const mean = new Float64Array(NF), std = new Float64Array(NF)
let nTrainRows = 0
for (const d of train) { const X = rowParts[d.part]; for (let j = 0; j < d.n; j++) { const b = d.start + j * COLS + 2; for (let f = 0; f < NF; f++) mean[f] += X[b + f]; nTrainRows++ } }
for (let f = 0; f < NF; f++) mean[f] /= nTrainRows
for (const d of train) { const X = rowParts[d.part]; for (let j = 0; j < d.n; j++) { const b = d.start + j * COLS + 2; for (let f = 0; f < NF; f++) { const v = X[b + f] - mean[f]; std[f] += v * v } } }
for (let f = 0; f < NF; f++) std[f] = Math.sqrt(std[f] / Math.max(1, nTrainRows - 1))
const inv = Float64Array.from(std, (v) => (v > 0 ? 1 / v : 0))

// ---- baselines
const baseline = (idx) => {
  let top1 = 0, top3 = 0, ours = 0
  for (const d of idx) { if (d.chosen === 0) top1++; if (d.chosen < 3) top3++; if (d.ours === d.chosen) ours++ }
  return { top1: top1 / idx.length, top3: top3 / idx.length, ours: ours / idx.length }
}
const bT = baseline(train), bH = baseline(hold)
console.log(`baselines - the ranker's top ask agrees with SESTINA: train ${(100 * bT.top1).toFixed(2)}% (top-3 ${(100 * bT.top3).toFixed(2)}%), holdout ${(100 * bH.top1).toFixed(2)}% (top-3 ${(100 * bH.top3).toFixed(2)}%); the stack's own decision agrees: train ${(100 * bT.ours).toFixed(2)}%, holdout ${(100 * bH.ours).toFixed(2)}%`)

// ---- the model: sizes [NF, ...hidden, 1]
const sizes = MODEL === 'linear' ? [NF, 1] : [NF, ...HIDDEN, 1]
const NL = sizes.length - 1
const rng = mulberry32(SEED)
const gauss = () => { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
const W = [], B = [], mW = [], vW = [], mB = [], vB = [], gW = [], gB = []
for (let l = 0; l < NL; l++) {
  const inp = sizes[l], out = sizes[l + 1]
  const w = new Float64Array(out * inp)
  const sc = MODEL === 'linear' ? 0.01 : Math.sqrt(2 / inp)
  for (let i = 0; i < w.length; i++) w[i] = gauss() * sc
  W.push(w); B.push(new Float64Array(out))
  mW.push(new Float64Array(out * inp)); vW.push(new Float64Array(out * inp)); gW.push(new Float64Array(out * inp))
  mB.push(new Float64Array(out)); vB.push(new Float64Array(out)); gB.push(new Float64Array(out))
}
const MAXA = 160 // legal asks a decision: 9 half-suits x 5 cards x 3 targets = 135 at most (the smoke data's max); a cap for the scratch
let skipped = 0
for (const d of useDec) if (d.n > MAXA) skipped++
if (skipped > 0) console.log(`WARNING: ${skipped} decisions have more than ${MAXA} legal asks and are skipped`)
const acts = sizes.map((n) => Array.from({ length: MAXA }, () => new Float64Array(n)))
const deltas = sizes.map((n) => new Float64Array(n))
const zbuf = new Float64Array(NF)
/** Score every ask of a decision; the activations kept per ask for the backward pass. */
const scoreDecision = (d, s) => {
  const X = rowParts[d.part]
  for (let j = 0; j < d.n; j++) {
    const b = d.start + j * COLS + 2
    const x = acts[0][j]
    for (let f = 0; f < NF; f++) x[f] = (X[b + f] - mean[f]) * inv[f]
    for (let l = 0; l < NL; l++) {
      const inp = sizes[l], out = sizes[l + 1], w = W[l], bb = B[l], a = acts[l][j], o = acts[l + 1][j]
      const last = l === NL - 1
      for (let u = 0; u < out; u++) {
        let acc = bb[u]
        const base = u * inp
        for (let i = 0; i < inp; i++) acc += w[base + i] * a[i]
        o[u] = last || acc > 0 ? acc : 0
      }
    }
    s[j] = acts[NL][j][0]
  }
}
const sbuf = new Float64Array(MAXA), pbuf = new Float64Array(MAXA)
const softmax = (n, s, p) => {
  let mx = -Infinity
  for (let j = 0; j < n; j++) if (s[j] > mx) mx = s[j]
  let z = 0
  for (let j = 0; j < n; j++) { p[j] = Math.exp(s[j] - mx); z += p[j] }
  for (let j = 0; j < n; j++) p[j] /= z
}
const evaluate = (idx) => {
  let nll = 0, top1 = 0, top3 = 0
  for (const d of idx) {
    if (d.n > MAXA) continue
    scoreDecision(d, sbuf)
    softmax(d.n, sbuf, pbuf)
    nll -= Math.log(Math.max(1e-12, pbuf[d.chosen]))
    let rank = 0
    for (let j = 0; j < d.n; j++) if (sbuf[j] > sbuf[d.chosen] || (sbuf[j] === sbuf[d.chosen] && j < d.chosen)) rank++
    if (rank === 0) top1++
    if (rank < 3) top3++
  }
  return { nll: nll / idx.length, top1: top1 / idx.length, top3: top3 / idx.length }
}
const fmt = (e) => `NLL ${e.nll.toFixed(4)}, top-1 ${(100 * e.top1).toFixed(2)}%, top-3 ${(100 * e.top3).toFixed(2)}%`
const t0 = Date.now()
let best = { nll: Infinity, W: null, B: null, epoch: -1 }
const order = train.slice()
const BATCH = 64
let step = 0
const b1 = 0.9, b2 = 0.999, eps = 1e-8
for (let ep = 1; ep <= EPOCHS; ep++) {
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t }
  let loss = 0
  for (let start = 0; start < order.length; start += BATCH) {
    const end = Math.min(order.length, start + BATCH)
    for (let l = 0; l < NL; l++) { gW[l].fill(0); gB[l].fill(0) }
    let used = 0
    for (let r = start; r < end; r++) {
      const d = order[r]
      if (d.n > MAXA) continue
      used++
      scoreDecision(d, sbuf)
      softmax(d.n, sbuf, pbuf)
      loss -= Math.log(Math.max(1e-12, pbuf[d.chosen]))
      for (let j = 0; j < d.n; j++) {
        const g = pbuf[j] - (j === d.chosen ? 1 : 0) // dL/ds_j
        if (g === 0) continue
        deltas[NL][0] = g
        for (let l = NL - 1; l >= 0; l--) {
          const inp = sizes[l], out = sizes[l + 1], w = W[l], a = acts[l][j], dl = deltas[l + 1], dprev = deltas[l]
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
    }
    if (used === 0) continue
    step++
    const c1 = 1 - Math.pow(b1, step), c2 = 1 - Math.pow(b2, step)
    for (let l = 0; l < NL; l++) {
      const w = W[l], g = gW[l], m = mW[l], v = vW[l]
      for (let i = 0; i < w.length; i++) {
        const gi = g[i] / used + L2 * w[i]
        m[i] = b1 * m[i] + (1 - b1) * gi
        v[i] = b2 * v[i] + (1 - b2) * gi * gi
        w[i] -= (LR * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + eps)
      }
      const bb = B[l], gb = gB[l], mb = mB[l], vb = vB[l]
      for (let i = 0; i < bb.length; i++) {
        const gi = gb[i] / used
        mb[i] = b1 * mb[i] + (1 - b1) * gi
        vb[i] = b2 * vb[i] + (1 - b2) * gi * gi
        bb[i] -= (LR * (mb[i] / c1)) / (Math.sqrt(vb[i] / c2) + eps)
      }
    }
  }
  const h = evaluate(hold)
  console.log(`epoch ${ep}: train NLL ${(loss / order.length).toFixed(4)}; holdout ${fmt(h)}; ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  if (h.nll < best.nll) best = { nll: h.nll, W: W.map((w) => Float64Array.from(w)), B: B.map((b) => Float64Array.from(b)), epoch: ep }
}
for (let l = 0; l < NL; l++) { W[l].set(best.W[l]); B[l].set(best.B[l]) }
const eT = evaluate(train), eH = evaluate(hold)
console.log(`kept epoch ${best.epoch}: train ${fmt(eT)}; holdout ${fmt(eH)}; against the ranker's top ${(100 * bH.top1).toFixed(2)}% and the stack's ${(100 * bH.ours).toFixed(2)}% on the holdout`)
if (MODEL === 'linear') {
  const names = [...BOTS.askFeatureNames(SET)]
  const top = Array.from({ length: NF }, (_, j) => [names[j], W[0][j]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  console.log('standardised weights: ' + top.map(([n, v]) => `${n} ${v >= 0 ? '+' : ''}${v.toFixed(3)}`).join(', '))
}
const model = { features: NF, mean: Array.from(mean), std: Array.from(std), layers: W.map((w, l) => ({ w: Array.from(w), b: Array.from(B[l]) })), meta: { featureSet: SET, model: MODEL, hidden: MODEL === 'mlp' ? HIDDEN : [], epochs: EPOCHS, kept: best.epoch, lr: LR, l2: L2, seed: SEED, files: FILES, decisions: useDec.length, train: train.length, trainFrac: TRAIN_FRAC, holdout: hold.length, holdoutNll: eH.nll, holdoutTop1: eH.top1, holdoutTop3: eH.top3, baselineRankerTop1: bH.top1, baselineStackTop1: bH.ours } }
// the engine's own forward pass must agree with the fitter's on a few holdout decisions
const compiled = BOTS.compileNet(model, NF, 1)
{
  let maxDiff = 0
  for (const d of hold.slice(0, 200)) {
    if (d.n > MAXA) continue
    scoreDecision(d, sbuf)
    const X = rowParts[d.part]
    for (let j = 0; j < d.n; j++) { const b = d.start + j * COLS + 2; for (let f = 0; f < NF; f++) zbuf[f] = X[b + f]; maxDiff = Math.max(maxDiff, Math.abs(BOTS.forwardNet(compiled, zbuf) - sbuf[j])) }
  }
  console.log(`engine forward pass agrees with the fitter to ${maxDiff.toExponential(2)}`)
}
fs.mkdirSync(dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(model))
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`)
