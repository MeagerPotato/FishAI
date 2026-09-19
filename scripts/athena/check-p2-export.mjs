/**
 * check-p2-export.mjs: ATHENA P2's export check (ATHENA.md §9.2, "Deterministic inference: every weight file P2
 * produces is read by `lib/athena`'s float64 forward for every read").
 *
 * `scripts/athena/p2_train.py` writes a **format v3** weight file and, beside it, the inputs of a sample of decisions
 * with PyTorch's float32 head vector at each. This script recomputes those heads with the deterministic JavaScript
 * forward and compares them.
 *
 *   node scripts/athena/check-p2-export.mjs --check <run>/export-check.json [--out result.json] [--tolerance 1e-4]
 *
 * **What v3 is** (§9.2), against v1/v2 (`lib/athena/net.ts`'s `athena-weights-1`):
 * - the event fold reads the **19 active slots** and only those. v1 and v2 added 21 embedding columns, the two
 *   unwritten scratch entries of `eventSlots` naming column 0 twice;
 * - the head layer is **518** wide: v1/v2's 517 with the set-difference head appended, so indices 0..516 are
 *   unchanged;
 * - the header says `format: "athena-weights-3"`, the magic is `ATHENAW3`, and `arch.eventSlots` is 19.
 *
 * **Which reader is used.** `lib/athena/net.ts` is agent D's on `claude/athena-p2-fwd`; when its `parseWeights`
 * accepts a v3 file (`NET.HEADS === 518`), this script uses net.ts throughout and says so. Until then it parses the
 * file and folds the events here, reusing net.ts's own deterministic pieces -- `expDet`, `sigmoidDet`, `tanhDet`,
 * `eventSlots`, `decisionFeatures`, `factsFeatures` and `beliefOf`, none of which changed in v3 -- so what is compared
 * is still the reference arithmetic. The result names the reader it used.
 *
 * **The bar.** Every head value agrees within `--tolerance` (absolute plus relative), the ask head's argmax over the
 * legal asks agrees, and no belief probability differs by more than 1e-4 (P1's bar in `check-belief-export.mjs`).
 * Exit 0 on a pass, 1 on a fail.
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const NET = await import(pathToFileURL(join(ROOT, 'lib/athena/net.ts')).href)

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}

export const FORMAT_V3 = 'athena-weights-3'
export const MAGIC_V3 = 'ATHENAW3'
export const HEADS_V3 = 518
export const EVENT_SLOTS_V3 = 19
export const BELIEF_TOLERANCE = 1e-4

/** The v3 layout: net.ts's `tensorLayout`, with 518 heads. */
export function tensorLayoutV3(a) {
  const shapes = [
    ['embed.weight', [a.d, NET.EVENT_F]],
    ['embed.bias', [a.d]],
    ['gru.weight_ih', [3 * a.d, a.d]],
    ['gru.weight_hh', [3 * a.d, a.d]],
    ['gru.bias_ih', [3 * a.d]],
    ['gru.bias_hh', [3 * a.d]],
  ]
  for (let i = 0; i < a.depth; i++) {
    shapes.push([`trunk.${i}.weight`, [a.width, i === 0 ? a.d + a.decF : a.width]])
    shapes.push([`trunk.${i}.bias`, [a.width]])
  }
  shapes.push(['heads.weight', [a.heads, a.width]])
  shapes.push(['heads.bias', [a.heads]])
  let offset = 0
  return shapes.map(([name, shape]) => {
    const length = shape.reduce((x, y) => x * y, 1)
    const t = { name, shape, offset, length }
    offset += length
    return t
  })
}

/** A v3 weight file -> the tensors the local forward reads. Refuses a header that disagrees with its own layout. */
export function parseV3(bytes) {
  // The magic: `ATHENAW3` is what p2_model writes. `ATHENAW1` is accepted too, because a reader may keep v1's
  // container magic and version by the header's `format` alone; the format field below is what decides.
  const magic = String.fromCharCode(...bytes.subarray(0, 8))
  if (magic !== MAGIC_V3 && magic !== 'ATHENAW1')
    throw new Error(`not a ${FORMAT_V3} file (magic ${JSON.stringify(magic)}, expected ${MAGIC_V3} or ATHENAW1)`)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const hl = dv.getUint32(8, true)
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + hl)))
  if (header.format !== FORMAT_V3) throw new Error(`weight format ${header.format}, not ${FORMAT_V3}`)
  const a = header.arch
  if (a.eventF !== NET.EVENT_F || a.decF !== NET.DEC_F_FACTS || a.heads !== HEADS_V3)
    throw new Error(`the weights are eventF ${a.eventF}, decF ${a.decF}, heads ${a.heads}; v3 is ${NET.EVENT_F}, ${NET.DEC_F_FACTS}, ${HEADS_V3}`)
  if (a.eventSlots !== undefined && a.eventSlots !== EVENT_SLOTS_V3)
    throw new Error(`the weights fold ${a.eventSlots} slots; v3 folds ${EVENT_SLOTS_V3}`)
  const layout = tensorLayoutV3(a)
  const same = header.tensors.length === layout.length && layout.every((t, i) => {
    const [name, shape, offset, length] = header.tensors[i]
    return name === t.name && JSON.stringify(shape) === JSON.stringify(t.shape) && offset === t.offset && length === t.length
  })
  const params = layout[layout.length - 1].offset + layout[layout.length - 1].length
  if (!same || header.params !== params) throw new Error('the weight file header does not match its arch layout')
  const base = 12 + hl
  if (bytes.length !== base + 4 * params) throw new Error(`the weight file has ${bytes.length} bytes; its header needs ${base + 4 * params}`)
  const blob = new Float32Array(params)
  for (let i = 0; i < blob.length; i++) blob[i] = dv.getFloat32(base + 4 * i, true)
  const t = new Map(layout.map((s) => [s.name, blob.subarray(s.offset, s.offset + s.length)]))
  const trunkW = []
  const trunkB = []
  for (let i = 0; i < a.depth; i++) {
    trunkW.push(t.get(`trunk.${i}.weight`))
    trunkB.push(t.get(`trunk.${i}.bias`))
  }
  return {
    arch: a,
    meta: header.meta ?? {},
    params,
    embW: t.get('embed.weight'),
    embB: t.get('embed.bias'),
    wih: t.get('gru.weight_ih'),
    whh: t.get('gru.weight_hh'),
    bih: t.get('gru.bias_ih'),
    bhh: t.get('gru.bias_hh'),
    trunkW,
    trunkB,
    headW: t.get('heads.weight'),
    headB: t.get('heads.bias'),
  }
}

/** net.ts's `foldEvent`, reading the 19 active slots (v3). */
export function foldEvent19(net, h, rows, off, scratch) {
  const d = net.arch.d
  const { idx, x, gi, gh } = scratch
  NET.eventSlots(rows, off, idx)
  for (let i = 0; i < d; i++) {
    const o = i * NET.EVENT_F
    let acc = 0
    for (let k = 0; k < EVENT_SLOTS_V3; k++) acc += net.embW[o + idx[k]]
    x[i] = acc + net.embB[i]
  }
  for (let g = 0; g < 3 * d; g++) {
    const o = g * d
    let a1 = 0
    let a2 = 0
    for (let j = 0; j < d; j++) {
      a1 += net.wih[o + j] * x[j]
      a2 += net.whh[o + j] * h[j]
    }
    gi[g] = a1 + net.bih[g]
    gh[g] = a2 + net.bhh[g]
  }
  for (let i = 0; i < d; i++) {
    const r = NET.sigmoidDet(gi[i] + gh[i])
    const z = NET.sigmoidDet(gi[d + i] + gh[d + i])
    const n = NET.tanhDet(gi[2 * d + i] + r * gh[2 * d + i])
    h[i] = (1 - z) * n + z * h[i]
  }
}

/** net.ts's `headsOf`, with the arch's own head count. */
export function headsOfV3(net, h, dec, out, scratch) {
  const d = net.arch.d
  const u = scratch.u
  u.set(h, 0)
  u.set(dec, d)
  let inp = u
  for (let l = 0; l < net.arch.depth; l++) {
    const w = net.trunkW[l]
    const b = net.trunkB[l]
    const y = scratch.st[l]
    const n = inp.length
    for (let o = 0; o < y.length; o++) {
      const base = o * n
      let acc = 0
      for (let j = 0; j < n; j++) acc += w[base + j] * inp[j]
      const v = acc + b[o]
      y[o] = v > 0 ? v : 0
    }
    inp = y
  }
  const n = inp.length
  for (let o = 0; o < net.arch.heads; o++) {
    const base = o * n
    let acc = 0
    for (let j = 0; j < n; j++) acc += net.headW[base + j] * inp[j]
    out[o] = acc + net.headB[o]
  }
  return out
}

const f32 = (b64) => {
  const buf = Buffer.from(b64, 'base64')
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}
const u8 = (b64) => new Uint8Array(Buffer.from(b64, 'base64'))

function main() {
  const file = argOf('--check', '')
  if (!file) {
    console.error('usage: --check <export-check.json> [--out result.json] [--tolerance 1e-4]')
    process.exit(2)
  }
  const tol = Number(argOf('--tolerance', '1e-4'))
  const chk = JSON.parse(fs.readFileSync(file, 'utf8'))
  const bytes = fs.readFileSync(chk.weights)
  const md5 = createHash('md5').update(bytes).digest('hex')
  if (md5 !== chk.md5) throw new Error(`the weight file's md5 is ${md5}, the check file names ${chk.md5}`)
  const raw = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // net.ts when it reads v3 (agent D's reader), otherwise the stand-in above.
  let reader = 'check-p2-export.mjs (net.ts does not read v3 yet)'
  let net = null
  if (NET.HEADS === HEADS_V3) {
    try {
      const n = NET.parseWeights(raw)
      net = {
        arch: { ...n.arch, heads: NET.HEADS, decF: NET.decFOf(n.arch) },
        embW: n.embW, embB: n.embB, wih: n.wih, whh: n.whh, bih: n.bih, bhh: n.bhh,
        trunkW: n.trunkW, trunkB: n.trunkB, headW: n.headW, headB: n.headB, meta: n.meta,
        params: n.blob.length,
      }
      reader = 'lib/athena/net.ts parseWeights'
    } catch (e) {
      console.error(`net.ts refused the v3 file (${e.message}); falling back to the local reader`)
    }
  }
  if (net === null) net = parseV3(raw)
  const { d, width, depth, decF, heads } = net.arch

  const scratch = {
    idx: new Int32Array(EVENT_SLOTS_V3),
    x: new Float64Array(d),
    gi: new Float64Array(3 * d),
    gh: new Float64Array(3 * d),
    u: new Float64Array(d + decF),
    st: Array.from({ length: depth }, () => new Float64Array(width)),
  }
  const dec = new Float64Array(decF)
  const out = new Float64Array(heads)
  const belief = new Float64Array(324)
  const beliefT = new Float64Array(324)
  const headsT = new Float64Array(heads)

  let worst = null
  let maxDiff = 0
  let maxBelief = 0
  let askDiffer = 0
  let asks = 0
  let bad = 0
  const t0 = Date.now()
  for (const it of chk.items) {
    const rows = u8(it.rows)
    const obs = u8(it.obs)
    const facts = u8(it.facts)
    const legal = u8(it.legal)
    const pt = f32(it.heads)
    if (pt.length !== heads) throw new Error(`a decision holds ${pt.length} head values; the arch has ${heads}`)
    if (rows.length !== it.pos * 19) throw new Error(`a decision has ${rows.length} row bytes for ${it.pos} rows`)
    const h = new Float64Array(d)
    for (let i = 0; i < it.pos; i++) foldEvent19(net, h, rows, i * 19, scratch)
    const cands = new Uint8Array(324)
    for (let c = 0; c < 54; c++) for (let r = 0; r < 6; r++) cands[c * 6 + r] = (facts[c] >> r) & 1
    NET.decisionFeatures(obs, cands, dec)
    NET.factsFeatures(facts, dec, NET.DEC_F)
    headsOfV3(net, h, dec, out, scratch)
    let itemBad = false
    for (let o = 0; o < heads; o++) {
      const diff = Math.abs(out[o] - pt[o])
      const bar = tol + tol * Math.abs(pt[o])
      if (diff > maxDiff) {
        maxDiff = diff
        worst = { head: o, js: out[o], torch: pt[o], bar }
      }
      if (diff > bar) itemBad = true
    }
    if (itemBad) bad++
    // the ask head's argmax over the legal asks
    let best = -1
    let bestT = -1
    let bv = -Infinity
    let bvT = -Infinity
    let any = false
    for (let a = 0; a < 162; a++) {
      if (!legal[a]) continue
      any = true
      if (out[a] > bv) { bv = out[a]; best = a }
      if (pt[a] > bvT) { bvT = pt[a]; bestT = a }
    }
    if (any) {
      asks++
      if (best !== bestT) askDiffer++
    }
    // the belief, through net.ts's own `beliefOf` (its H_BELIEF is 192 in v1, v2 and v3)
    for (let o = 0; o < heads; o++) headsT[o] = pt[o]
    NET.beliefOf(out, cands, belief)
    NET.beliefOf(headsT, cands, beliefT)
    for (let i = 0; i < 324; i++) maxBelief = Math.max(maxBelief, Math.abs(belief[i] - beliefT[i]))
  }
  const pass = bad === 0 && askDiffer === 0 && maxBelief <= BELIEF_TOLERANCE
  const res = {
    weights: chk.weights, md5, reader, arch: net.arch, params: net.params, decisions: chk.items.length,
    headsCompared: chk.items.length * heads, decisionsOverTolerance: bad, tolerance: tol,
    maxAbsHeadDiff: maxDiff, worst, askDecisions: asks, askArgmaxDiffer: askDiffer,
    maxBeliefDiff: maxBelief, beliefTolerance: BELIEF_TOLERANCE, pass, secs: (Date.now() - t0) / 1000,
  }
  const outPath = argOf('--out', '')
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(res, null, 1))
  console.log(`p2 export check (${reader}): ${res.decisions} decisions, ${res.headsCompared} head values; `
    + `${bad} decisions over tolerance; ask argmax differs on ${askDiffer} of ${asks}; max |dhead| `
    + `${maxDiff.toExponential(3)}; max |dp| ${maxBelief.toExponential(3)} (bar ${BELIEF_TOLERANCE}); `
    + `${pass ? 'PASS' : 'FAIL'} (${res.secs.toFixed(1)}s)`)
  process.exit(pass ? 0 : 1)
}

main()
