/**
 * probe-v15-paired.mjs — post-hoc paired analysis of probe-v15-h2h.mjs's per-pair vectors.
 * Every cell replayed the SAME seed list, so any two cells difference element-wise and the deal
 * cancels a second time (on top of the within-pair orientation swap).
 *
 * Usage: node scripts/probe-v15-paired.mjs <h2h.json>
 */
import { readFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(process.argv[2] ?? 'h2h.json', 'utf8'))
const by = new Map(data.cells.map((c) => [c.cell, c]))
const BITS = data.cells.filter((c) => /^b\d+$/.test(c.cell)).map((c) => Number(c.cell.slice(1)))

const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length
const ci = (v) => {
  const m = mean(v)
  if (v.length < 2) return 0
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1))
  return (1.96 * sd) / Math.sqrt(v.length)
}
const diff = (a, b) => a.map((x, i) => x - b[i])
const fmt = (v) => `${mean(v) >= 0 ? '+' : ''}${mean(v).toFixed(4)} +/- ${ci(v).toFixed(4)}`
const z = (v) => (ci(v) === 0 ? (mean(v) === 0 ? 0 : Infinity) : (1.96 * mean(v)) / ci(v))

console.log(`bank ${data.bank}, ${data.pairs} pairs per cell, us54, duplicate deals\n`)

console.log('--- A. adjacent-rung paired deltas, v1.5 vs v1.0 (set-diff per pair) ---')
console.log('rung          delta setDiff        z')
for (let i = 1; i < BITS.length; i++) {
  const lo = by.get(`b${BITS[i - 1]}`)
  const hi = by.get(`b${BITS[i]}`)
  const d = diff(hi.d, lo.d)
  console.log(`${String(`${BITS[i - 1]}->${BITS[i]}`).padEnd(13)} ${fmt(d).padEnd(22)} ${z(d).toFixed(2)}`)
}

console.log('\n--- B. does the OPPONENT matter? v1.0 adaptive vs v0.5 bare balanced, same deals ---')
console.log('(set-diff against v1.0) - (set-diff against bare balanced), per pair')
console.log('bits          delta                 z')
for (const b of BITS) {
  const vs10 = by.get(`b${b}`)
  const vs05 = by.get(`r${b}`)
  if (!vs10 || !vs05) continue
  const d = diff(vs10.d, vs05.d)
  console.log(`${String(b).padEnd(13)} ${fmt(d).padEnd(22)} ${z(d).toFixed(2)}`)
}

console.log('\n--- C. the v0.5 reference ladder (replication of the shipped E1 design) ---')
console.log('bits          set-share             setDiff')
for (const b of BITS) {
  const c = by.get(`r${b}`)
  if (!c) continue
  console.log(`${String(b).padEnd(13)} ${`${c.share.toFixed(4)} +/- ${c.shareCi.toFixed(4)}`.padEnd(22)} ${fmt(c.d)}`)
}

console.log('\n--- D. bounded PUNTER vs v1.0, and vs bounded BALANCED at the same budget ---')
console.log('bits          punter-vs-v1.0        punter minus balanced (paired)')
for (const b of BITS) {
  const p = by.get(`p${b}`)
  if (!p) continue
  const bal = by.get(`b${b}`)
  console.log(`${String(b).padEnd(13)} ${fmt(p.d).padEnd(22)} ${fmt(diff(p.d, bal.d))}`)
}

console.log('\n--- E. headline table ---')
console.log('cell          pairs  bad  setDiff (v1.5 - v1.0)   share    winRate  sets')
for (const c of data.cells) {
  console.log(
    `${c.cell.padEnd(13)} ${String(c.pairs).padEnd(6)} ${String(c.health).padEnd(4)} ` +
      `${`${c.setDiff >= 0 ? '+' : ''}${c.setDiff.toFixed(4)} +/- ${c.setDiffCi.toFixed(4)}`.padEnd(23)} ` +
      `${c.share.toFixed(4)}   ${c.winRate.toFixed(4)}   ${c.aSets}:${c.bSets}`,
  )
}
