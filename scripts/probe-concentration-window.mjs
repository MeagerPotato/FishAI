/**
 * probe-concentration-window.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * The owner's claim (2) is about what a WATCHER sees, and a watcher sees a stretch of play, not a
 * whole-game histogram. This measures the local view: over a sliding window of k consecutive asks,
 * how many distinct sets appear, and what share the window's top set takes.
 *
 * Null model: the same games' ask sequences, randomly permuted within the game (seeded). That
 * preserves the whole-game set frequencies exactly and destroys only the ORDER, so any gap between
 * observed and permuted is temporal clustering and nothing else.
 *
 * usage: node scripts/probe-concentration-window.mjs <games> <arm>
 */
import { newGame, reduce, seatView, us54Config, allBooks, cardBook } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER, STYLE_IDS } from '../lib/engine/bots/roster.ts'
import { rngFromSeed, randInt } from '../lib/engine/rng.ts'

const config = us54Config
const BOOKS = allBooks(config)
const GAMES = Number(process.argv[2] ?? 600)
const ARM = process.argv[3] ?? 'balanced'
const WINDOWS = [6, 10, 20]

const noDefuse = ARM.endsWith('-nodefuse')
const strip = (s) => (noDefuse ? Object.freeze({ ...s, defuse: 0 }) : s)
function stylesFor(g) {
  if (ARM.startsWith('roster')) {
    return [0, 1, 2, 3, 4, 5].map((i) => strip(STYLE_ROSTER[STYLE_IDS[(g + i) % STYLE_IDS.length]]))
  }
  return [0, 1, 2, 3, 4, 5].map(() => strip(STYLE_ROSTER.balanced))
}

const obs = new Map(WINDOWS.map((w) => [w, { distinct: [], topShare: [] }]))
const perm = new Map(WINDOWS.map((w) => [w, { distinct: [], topShare: [] }]))
let contiguityObs = 0
let contiguitySpans = 0

function windowStats(seq, into) {
  for (const w of WINDOWS) {
    if (seq.length < w) continue
    for (let i = 0; i + w <= seq.length; i++) {
      const slice = seq.slice(i, i + w)
      const c = new Map()
      for (const b of slice) c.set(b, (c.get(b) ?? 0) + 1)
      into.get(w).distinct.push(c.size)
      into.get(w).topShare.push(Math.max(...c.values()) / w)
    }
  }
}

for (let g = 0; g < GAMES; g++) {
  const styles = stylesFor(g)
  let st = newGame(`conc-${g}`, config, g % 6)
  let steps = 0
  const seq = []
  while (st.phase !== 'finished' && steps < 4000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const action = decide(seatView(st, seat), styles[seat], steps)
    if (action.type === 'ask') seq.push(cardBook(action.card))
    const r = reduce(st, action)
    if (!r.ok) break
    st = r.state
    steps++
  }
  windowStats(seq, obs)

  // seeded Fisher-Yates permutation of the same sequence
  const rng = rngFromSeed(`perm-${g}`)
  const sh = [...seq]
  for (let i = sh.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1)
    const t = sh[i]
    sh[i] = sh[j]
    sh[j] = t
  }
  windowStats(sh, perm)

  // contiguity: per set, (last index - first index + 1) / (number of asks into it)
  for (const b of BOOKS) {
    const idx = []
    for (let i = 0; i < seq.length; i++) if (seq[i] === b) idx.push(i)
    if (idx.length < 2) continue
    contiguityObs += idx.length
    contiguitySpans += idx[idx.length - 1] - idx[0] + 1
  }
}

const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)
console.log(`=== windowed diversity, arm ${ARM}, games ${GAMES} ===`)
console.log('  window |  distinct sets: observed / order-permuted  |  top set\'s share: observed / permuted  |  N windows')
for (const w of WINDOWS) {
  const o = obs.get(w)
  const p = perm.get(w)
  console.log(
    `  ${String(w).padStart(6)} |  ${mean(o.distinct).toFixed(2)} / ${mean(p.distinct).toFixed(2)}  |  ${(100 * mean(o.topShare)).toFixed(1)}% / ${(100 * mean(p.topShare)).toFixed(1)}%  |  ${o.distinct.length}`,
  )
}
console.log(
  `\n  share of 10-ask windows showing <=3 distinct sets: observed ${(100 * obs.get(10).distinct.filter((d) => d <= 3).length / Math.max(1, obs.get(10).distinct.length)).toFixed(1)}%  vs order-permuted ${(100 * perm.get(10).distinct.filter((d) => d <= 3).length / Math.max(1, perm.get(10).distinct.length)).toFixed(1)}%`,
)
console.log(
  `  share of 20-ask windows showing <=4 distinct sets: observed ${(100 * obs.get(20).distinct.filter((d) => d <= 4).length / Math.max(1, obs.get(20).distinct.length)).toFixed(1)}%  vs order-permuted ${(100 * perm.get(20).distinct.filter((d) => d <= 4).length / Math.max(1, perm.get(20).distinct.length)).toFixed(1)}%`,
)
console.log(
  `\n  a set's asks span ${(contiguitySpans / Math.max(1, contiguityObs)).toFixed(2)} ask-slots per ask into it (1.00 = perfectly contiguous; higher = spread through the game)`,
)
