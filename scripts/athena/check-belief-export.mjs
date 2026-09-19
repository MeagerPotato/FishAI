/**
 * check-belief-export.mjs: ATHENA.md §8.3's export check. A belief head trained in PyTorch
 * (`scripts/athena/belief_train.py export`) is written in G0d's weight format; this script runs `lib/athena`'s
 * deterministic forward (net.ts: `foldAll`, `decisionFeatures`, `headsOf`, and `beliefOf`) on the same inputs and
 * compares each unit card's belief with PyTorch's. The bar: the argmax agrees on every card (the first maximum over
 * the candidates in ascending absolute seat order, as belief-baselines.mjs takes it), and no probability differs by
 * more than 1e-4.
 *
 *   node scripts/athena/check-belief-export.mjs --check <run>/export-check.json [--out result.json]
 *
 * The check file holds the weight file's path and md5, and per decision: the seat, the event rows it folds (base64,
 * `pos` rows of 19 bytes), the obs row, the candidate matrix (324 bytes, relative) and, per unit card, PyTorch's six
 * probabilities (relative seats). Exit 0 on a pass, 1 on a fail.
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const NET = await import(pathToFileURL(join(ROOT, 'lib/athena/net.ts')).href)

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}

export const TOLERANCE = 1e-4

/** The argmax over a card's candidates, first maximum in ascending absolute seat order; -1 without a candidate. */
export function argmaxAbs(p, cands, c, seat) {
  let best = -1
  let bv = -Infinity
  for (let a = 0; a < 6; a++) {
    const r = (a - seat + 6) % 6
    if (!cands[c * 6 + r]) continue
    if (p[r] > bv) {
      bv = p[r]
      best = a
    }
  }
  return best
}

function main() {
  const file = argOf('--check', '')
  if (!file) {
    console.error('usage: --check <export-check.json> [--out result.json]')
    process.exit(2)
  }
  const chk = JSON.parse(fs.readFileSync(file, 'utf8'))
  const bytes = fs.readFileSync(chk.weights)
  const md5 = createHash('md5').update(bytes).digest('hex')
  if (md5 !== chk.md5) throw new Error(`the weight file's md5 is ${md5}, the check file names ${chk.md5}`)
  const net = NET.parseWeights(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
  const dec = new Float64Array(NET.DEC_F)
  const heads = new Float64Array(NET.HEADS)
  const belief = new Float64Array(324)
  let cards = 0
  let argmaxDiffer = 0
  let maxDiff = 0
  let worst = null
  const t0 = Date.now()
  for (const it of chk.items) {
    const rows = new Uint8Array(Buffer.from(it.rows, 'base64'))
    const obs = new Uint8Array(Buffer.from(it.obs, 'base64'))
    const cands = new Uint8Array(Buffer.from(it.cands, 'base64'))
    if (rows.length !== it.pos * 19) throw new Error(`decision of game ${it.game}: ${rows.length} row bytes for ${it.pos} rows`)
    const h = NET.foldAll(net, rows, it.pos)
    NET.decisionFeatures(obs, cands, dec)
    NET.headsOf(net, h, dec, heads)
    NET.beliefOf(heads, cands, belief)
    it.cards.forEach((c, j) => {
      const pt = it.p[j]
      const pj = belief.subarray(c * 6, c * 6 + 6)
      for (let r = 0; r < 6; r++) {
        const d = Math.abs(pj[r] - pt[r])
        if (d > maxDiff) {
          maxDiff = d
          worst = { game: it.game, card: c, rel: r, js: pj[r], torch: pt[r] }
        }
      }
      if (argmaxAbs(pj, cands, c, it.seat) !== argmaxAbs(pt, cands, c, it.seat)) argmaxDiffer++
      cards++
    })
  }
  const pass = argmaxDiffer === 0 && maxDiff <= TOLERANCE
  const res = { weights: chk.weights, md5, arch: net.arch, decisions: chk.items.length, cards, argmaxDiffer, maxAbsDiff: maxDiff, worst, tolerance: TOLERANCE, pass, secs: (Date.now() - t0) / 1000 }
  const out = argOf('--out', '')
  if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1))
  console.log(`export check: ${cards} cards over ${res.decisions} decisions; argmax differs on ${argmaxDiffer}; max |dp| ${maxDiff.toExponential(3)} (bar ${TOLERANCE}); ${pass ? 'PASS' : 'FAIL'} (${res.secs.toFixed(1)}s)`)
  process.exit(pass ? 0 : 1)
}

main()
