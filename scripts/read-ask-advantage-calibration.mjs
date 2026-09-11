/**
 * read-ask-advantage-calibration.mjs - MONET.md 3.8ax: a fitted ask-advantage model's predicted differences
 * against the measured ones on the HOLDOUT pairs, by the kind of alternative.
 *
 *   node scripts/read-ask-advantage-calibration.mjs --model C:/Projects/FishAI-bench/v52/adv-2.json
 *        --data C:/Projects/FishAI-bench/v51/A,C:/Projects/FishAI-bench/v52/R [--holdout-mod 5]
 *
 * The holdout is fit-ask-advantage.mjs's exactly: every pair whose game index is 0 mod `--holdout-mod`. The
 * model is played the way `compileNet` + `forwardNet` play it (with the standardisation it carries), so
 * what is read is what the marker would score. For each kind of alternative (1 the clone's next, 2 the
 * ranker's top, 3 random, 4 a model's own choice) and for all holdout pairs together: the pairs, the mean
 * predicted f(alternative) - f(played), the mean measured difference in the final set differential with
 * its SE clustered by game, and the mean squared error.
 *
 * THE PIN. On the fitter's own data, its own holdout and its own model, the all-pairs mean squared error
 * must equal the MLP holdout MSE the fitter printed.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'
import { advFeatureCount } from './ask-advantage-features.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IMI = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/imitation.ts')).href)
const NET = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/net.ts')).href)

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const MODEL_PATH = argOf('--model', '')
const PREFIXES = argOf('--data', '').split(',').filter(Boolean)
const HOLD = Number(argOf('--holdout-mod', 5))
if (!MODEL_PATH || PREFIXES.length === 0) {
  console.error('--model and --data are required')
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

const NF = advFeatureCount(IMI)
const net = NET.compileNet(JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8')), NF)
const KIND_NAMES = new Map([
  [1, "the clone's next"],
  [2, "the ranker's top"],
  [3, 'random'],
  [4, "a model's own choice"],
])

const groups = new Map()
const groupOf = (key) => {
  let g = groups.get(key)
  if (!g) {
    g = { n: 0, pred: 0, y: 0, sq: 0, games: new Map() }
    groups.set(key, g)
  }
  return g
}
const xa = new Float64Array(NF)
const xp = new Float64Array(NF)
for (let pi = 0; pi < PREFIXES.length; pi++) {
  const p = PREFIXES[pi]
  const h = JSON.parse(fs.readFileSync(`${p}.json`, 'utf8'))
  if (h.kind !== 'ask-advantage') throw new Error(`${p}.json: kind ${h.kind}, not ask-advantage`)
  if (h.features !== NF) throw new Error(`${p}: ${h.features} features; this build reads ${NF}`)
  const COLS = h.cols
  const buf = readF32(`${p}.bin`)
  if (buf.length % COLS !== 0) throw new Error(`${p}.bin: ${buf.length} values is not a whole number of ${COLS}-column rows`)
  const rows = buf.length / COLS
  for (let r = 0; r < rows; r++) {
    const o = r * COLS
    const game = buf[o + 2 * NF + 2]
    if (game % HOLD !== 0) continue
    for (let f = 0; f < NF; f++) {
      xa[f] = buf[o + f]
      xp[f] = buf[o + NF + f]
    }
    const fa = NET.forwardNet(net, xa)
    const fp = NET.forwardNet(net, xp)
    const pred = fa - fp
    const y = buf[o + 2 * NF]
    const kind = buf[o + 2 * NF + 5]
    for (const key of [kind, 'all']) {
      const g = groupOf(key)
      g.n++
      g.pred += pred
      g.y += y
      g.sq += (pred - y) * (pred - y)
      const ck = `${pi}:${game}`
      let gs = g.games.get(ck)
      if (!gs) {
        gs = { n: 0, s: 0 }
        g.games.set(ck, gs)
      }
      gs.n++
      gs.s += y
    }
  }
}

const sign = (x, d = 3) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`
console.log(`=== read-ask-advantage-calibration: ${MODEL_PATH} on ${PREFIXES.join(', ')}; holdout games 0 mod ${HOLD} ===`)
console.log('| alternatives | holdout pairs | mean predicted | mean measured | holdout MSE |')
console.log('|---|---:|---:|---:|---:|')
const keys = [...groups.keys()].filter((k) => k !== 'all').sort((a, b) => a - b)
for (const key of [...keys, 'all']) {
  const g = groups.get(key)
  const mean = g.y / g.n
  let v = 0
  for (const gs of g.games.values()) {
    const r = gs.s - gs.n * mean
    v += r * r
  }
  const se = Math.sqrt(v) / g.n
  const name = key === 'all' ? '**all**' : `${key} - ${KIND_NAMES.get(key) ?? 'unknown'}`
  console.log(`| ${name} | ${g.n} | ${sign(g.pred / g.n)} | ${sign(mean)} (SE ${se.toFixed(3)}) | ${(g.sq / g.n).toFixed(5)} |`)
}
