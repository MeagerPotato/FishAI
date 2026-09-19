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
 * **There is no parser here.** The file is read by `lib/athena`'s own `parseWeights`, folded by its `foldAll` and put
 * through its `headsOf` and `beliefOf` — the same reference arithmetic that plays every read (`decideNet`, through
 * `scripts/duplicate-pairs.mjs`'s ATHENA arm). `formatOf` must call the file v3, which `net.ts` reads off
 * (`arch.decF` = 912, `arch.heads` = 518); the 19-slot fold comes with that row of `WEIGHT_FORMATS`.
 *
 * **The container round trip.** `serializeWeights` over the parsed net must give back the file's bytes exactly. That
 * is what "the exporter produces what `serializeWeights` produces" means, and it is checked here rather than assumed.
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
// the barrel, so `EVENT_LEN` and `N_ASK` (encode.ts) come from the same place as the forward (net.ts)
const NET = await import(pathToFileURL(join(ROOT, 'lib/athena/index.ts')).href)

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}

/** P2's weight format (ATHENA.md §9.2): the version `formatOf` must name for a file this check accepts. */
export const VERSION_V3 = 3
export const BELIEF_TOLERANCE = 1e-4

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

  const net = NET.parseWeights(raw)
  const fmt = NET.formatOf(net.arch)
  if (fmt.version !== VERSION_V3) {
    throw new Error(`the weight file is format v${fmt.version} (decF ${fmt.decF}, heads ${fmt.heads}); P2 writes v${VERSION_V3}`)
  }
  // what the exporter promises: the same bytes `serializeWeights` writes for this arch, blob and meta
  const again = NET.serializeWeights(net)
  let roundTrip = again.length === raw.length
  for (let i = 0; roundTrip && i < raw.length; i++) if (again[i] !== raw[i]) roundTrip = false

  const decF = NET.decFOf(net.arch)
  const heads = NET.headCountOf(net.arch)
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
    if (rows.length !== it.pos * NET.EVENT_LEN) throw new Error(`a decision has ${rows.length} row bytes for ${it.pos} rows`)
    const h = NET.foldAll(net, rows, it.pos)
    const cands = new Uint8Array(324)
    for (let c = 0; c < 54; c++) for (let r = 0; r < 6; r++) cands[c * 6 + r] = (facts[c] >> r) & 1
    NET.decisionFeatures(obs, cands, dec)
    NET.factsFeatures(facts, dec, NET.DEC_F)
    NET.headsOf(net, h, dec, out)
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
    for (let a = 0; a < NET.N_ASK; a++) {
      if (!legal[NET.L_ASK + a]) continue
      any = true
      if (out[NET.H_ASK + a] > bv) { bv = out[NET.H_ASK + a]; best = a }
      if (pt[NET.H_ASK + a] > bvT) { bvT = pt[NET.H_ASK + a]; bestT = a }
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
  const pass = bad === 0 && askDiffer === 0 && maxBelief <= BELIEF_TOLERANCE && roundTrip
  const res = {
    weights: chk.weights, md5, reader: 'lib/athena/net.ts parseWeights', format: fmt.version, arch: net.arch,
    params: net.blob.length, serializeRoundTrip: roundTrip, decisions: chk.items.length,
    headsCompared: chk.items.length * heads, decisionsOverTolerance: bad, tolerance: tol,
    maxAbsHeadDiff: maxDiff, worst, askDecisions: asks, askArgmaxDiffer: askDiffer,
    maxBeliefDiff: maxBelief, beliefTolerance: BELIEF_TOLERANCE, pass, secs: (Date.now() - t0) / 1000,
  }
  const outPath = argOf('--out', '')
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(res, null, 1))
  console.log(`p2 export check (${res.reader}, v${fmt.version}): ${res.decisions} decisions, ${res.headsCompared} head `
    + `values; ${bad} decisions over tolerance; ask argmax differs on ${askDiffer} of ${asks}; max |dhead| `
    + `${maxDiff.toExponential(3)}; max |dp| ${maxBelief.toExponential(3)} (bar ${BELIEF_TOLERANCE}); `
    + `serializeWeights round trip ${roundTrip ? 'byte-exact' : 'DIFFERS'}; `
    + `${pass ? 'PASS' : 'FAIL'} (${res.secs.toFixed(1)}s)`)
  process.exit(pass ? 0 : 1)
}

main()
