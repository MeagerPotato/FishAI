#!/usr/bin/env node
/**
 * probe-determinize.mjs - MONET.md 3.8a: the determinization sampler's fidelity at home, with
 * ground truth. At every ask decision of mirror games, one deal is sampled from the viewer's
 * knowledge and every card the viewer has not located is scored: was it placed at its true holder?
 * Beside it, the marginal's top-1 (the most likely seat) on the same cards, and the sampler's
 * failure rate (no consistent deal in the draw budget).
 *
 *   node scripts/probe-determinize.mjs [--version v0.4c] [--games 100] [--seeds det] [--samples 1]
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const KNOW = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/knowledge.ts')).href)
const MARG = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/marginal.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const RNG = await import(pathToFileURL(join(ROOT, 'lib/engine/rng.ts')).href)
const SEARCH = await import(pathToFileURL(join(ROOT, 'lib/engine/search/index.ts')).href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, decide, reduce } = ENG

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const version = argOf('--version', 'v0.4c')
const games = Number(argOf('--games', 100))
const seeds = argOf('--seeds', 'det').split(',')
const samples = Number(argOf('--samples', 1))
const policy = MON.monetPolicy(version)
const opts = { logWindow: policy.skill.logWindow, useConstraints: policy.skill.useConstraints, marginal: policy.style.pModel === 'marginal' }

const A = { games: 0, decisions: 0, draws: 0, nulls: 0, cards: 0, sampledRight: 0, top1Right: 0, oppCards: 0, oppSampledRight: 0, oppTop1Right: 0, byCands: {} }
const t0 = Date.now()
for (const s0 of seeds) {
  for (let g = 0; g < games; g++) {
    const seed = `${s0}-${g}`
    let s = newGame(seed, us54Config, g % 6)
    let steps = 0
    while (s.phase !== 'finished' && steps++ < 5000) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const moveSeed = hashSeed(`${seed}:${s.moveIndex}`)()
      const a = decide(view, policy, moveSeed)
      if (!view.declareWindow && view.phase === 'playing' && a.type === 'ask') {
        A.decisions++
        const k = KNOW.buildKnowledge(view, opts)
        const table = MARG.marginalFor(k)
        const rng = RNG.mulberry32(moveSeed)
        const holder = (c) => s.hands.findIndex((h) => h.includes(c))
        for (let n = 0; n < samples; n++) {
          const hands = SEARCH.sampleDeal(view, k, rng)
          if (hands === null) { A.nulls++; continue }
          A.draws++
          for (const [card, cands] of Object.entries(k.cands)) {
            if (cands.length < 2) continue
            const truth = holder(card)
            const at = hands.findIndex((h) => h.includes(card))
            let top = cands[0]
            if (table) {
              const i = table.index.get(card)
              let best = -1
              for (const c of cands) { const v = table.p[i * 6 + c]; if (v > best) { best = v; top = c } }
            }
            A.cards++
            if (at === truth) A.sampledRight++
            if (top === truth) A.top1Right++
            const row = A.byCands[cands.length] ?? (A.byCands[cands.length] = { n: 0, s: 0, t: 0 })
            row.n++; if (at === truth) row.s++; if (top === truth) row.t++
            if ((truth % 2) !== (seat % 2)) { A.oppCards++; if (at === truth) A.oppSampledRight++; if (top === truth) A.oppTop1Right++ }
          }
        }
      }
      const r = reduce(s, a)
      if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
      s = r.state
    }
    A.games++
  }
}
const pct = (x, n) => (n > 0 ? ((100 * x) / n).toFixed(2) + '%' : 'n/a')
console.log(`=== determinization fidelity: Monet ${version}, seeds ${seeds.join(',')} x ${games} (${A.games} games, ${A.decisions} ask decisions, ${samples} sample(s) each), ${((Date.now() - t0) / 1000).toFixed(1)}s ===`)
console.log(`draws ${A.draws}  failed (null) ${A.nulls}  (${pct(A.nulls, A.draws + A.nulls)})`)
console.log(`unlocated cards scored ${A.cards}  (${(A.cards / Math.max(1, A.draws)).toFixed(1)} per deal)`)
console.log(`  sampled deal places the card right   ${pct(A.sampledRight, A.cards)}`)
console.log(`  marginal top-1 places the card right ${pct(A.top1Right, A.cards)}`)
console.log(`  opponents' cards only: sampled ${pct(A.oppSampledRight, A.oppCards)}  top-1 ${pct(A.oppTop1Right, A.oppCards)}  (n ${A.oppCards})`)
console.log('  by candidate count:  cands  n  sampled  top-1')
for (const [c, row] of Object.entries(A.byCands).sort((x, y) => Number(x[0]) - Number(y[0]))) console.log(`    ${c}  ${String(row.n).padStart(7)}  ${pct(row.s, row.n).padStart(7)}  ${pct(row.t, row.n).padStart(7)}`)
