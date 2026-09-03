#!/usr/bin/env node
/**
 * probe-location.mjs — MONET.md §3.6a, the opponent-location score: how much probability the
 * belief puts on the TRUE holder of every card it is unsure about, with ground truth, at home.
 *
 *   node scripts/probe-location.mjs --version v0.4c [--kappas 0,0.25,0.5,1,2] [--seeds a,b,c] [--games 50] [--adapt 0.25]
 *
 * Mirror games of `--version` against itself. The version's own vector drives the game, so every
 * κ is scored on the same positions. At each ask decision the Knowledge is built once per κ
 * (`choiceKappa` laid over the version's inference options) and its marginal table read: for every
 * uncertain card, the probability at the true holder — averaged over cards held by opponents and
 * by teammates (the location score; higher is better) — the share of cards whose argmax seat is
 * the true holder, and, for the ask the driver chose, believed against realised (the calibration
 * aggregate of the κ belief on the driver's asks). One row per κ. A ground-truth instrument;
 * nothing here is a policy, and nothing here decides which κ ships — §3.6c does.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const KNOW = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/knowledge.ts')).href)
const MARG = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/marginal.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, decide, reduce } = ENG

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const version = argOf('--version', 'v0.4c')
if (!MON.isMonetVersion(version)) {
  console.error(`--version must be one of ${MON.MONET_VERSION_IDS.join(', ')}; got ${JSON.stringify(version)}`)
  process.exit(2)
}
const kappas = argOf('--kappas', '0,0.25,0.5,1,2').split(',').map(Number)
const seeds = argOf('--seeds', 'loc').split(',')
const games = Number(argOf('--games', 50))
// A2: the per-seat step, laid over every κ > 0 row (0 = A1)
const adapt = Number(argOf('--adapt', 0))
// the prior's shape: count (default) or once
const prior = argOf('--prior', 'count')
const policy = MON.monetPolicy(version)
if (policy.style?.pModel !== 'marginal') {
  console.error(`${version} does not build the marginal (pModel=${String(policy.style?.pModel)}); the prior has no table to weight`)
  process.exit(2)
}
const opts = { logWindow: policy.skill.logWindow, useConstraints: policy.skill.useConstraints, marginal: true }

const acc = kappas.map(() => ({
  cards: 0, sumP: 0, top1: 0,
  opp: 0, oppSumP: 0, oppTop1: 0,
  mate: 0, mateSumP: 0, mateTop1: 0,
  asks: 0, believed: 0, realised: 0,
  rounds: 0, tables: 0,
}))
const holderOf = (hands, card) => hands.findIndex((h) => h.includes(card))

let decisions = 0
let askDecisions = 0
const t0 = Date.now()
for (const s0 of seeds) {
  for (let g = 0; g < games; g++) {
    const seed = `${s0}-${g}`
    let s = newGame(seed, us54Config, 0)
    let steps = 0
    while (s.phase !== 'finished' && steps++ < 5000) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const action = decide(view, policy, hashSeed(`${seed}:${s.moveIndex}`)())
      decisions++
      if (!view.declareWindow && view.phase === 'playing' && action.type === 'ask') {
        askDecisions++
        for (let j = 0; j < kappas.length; j++) {
          const k = KNOW.buildKnowledge(view, kappas[j] > 0 ? { ...opts, choiceKappa: kappas[j], choicePrior: prior, ...(adapt > 0 ? { choiceAdapt: adapt } : {}) } : opts)
          const table = MARG.marginalFor(k)
          const a = acc[j]
          if (table) {
            a.tables++
            a.rounds += table.rounds
            for (let i = 0; i < table.cards.length; i++) {
              const h = holderOf(s.hands, table.cards[i])
              if (h < 0 || h === seat) continue
              const p = table.p[i * 6 + h]
              let best = 0
              for (let t = 1; t < 6; t++) if (table.p[i * 6 + t] > table.p[i * 6 + best]) best = t
              a.cards++; a.sumP += p; if (best === h) a.top1++
              if (h % 2 === seat % 2) { a.mate++; a.mateSumP += p; if (best === h) a.mateTop1++ }
              else { a.opp++; a.oppSumP += p; if (best === h) a.oppTop1++ }
            }
          }
          const believed = KNOW.askHitProbability(k, action.card, action.target)
          if (Number.isFinite(believed)) {
            a.asks++; a.believed += believed
            if (holderOf(s.hands, action.card) === action.target) a.realised++
          }
        }
      }
      const r = reduce(s, action)
      if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
      s = r.state
    }
  }
}
const f = (x, d = 4) => x.toFixed(d)
console.log(`=== opponent-location score: Monet ${version} mirror games, seeds ${seeds.join(',')} x ${games}, ${decisions} decisions, ${askDecisions} ask decisions, prior ${prior}, adapt ${adapt}, ${((Date.now() - t0) / 1000).toFixed(1)}s ===`)
console.log('kappa   | cards    p(true)  top1    | opp-held  p(true)  top1    | mate-held p(true)  top1    | asks   believed realised bias     | rounds/table')
for (let j = 0; j < kappas.length; j++) {
  const a = acc[j]
  console.log(
    `${String(kappas[j]).padEnd(7)} | ${String(a.cards).padStart(7)}  ${f(a.sumP / Math.max(1, a.cards))}  ${f(a.top1 / Math.max(1, a.cards))}  ` +
    `| ${String(a.opp).padStart(8)}  ${f(a.oppSumP / Math.max(1, a.opp))}  ${f(a.oppTop1 / Math.max(1, a.opp))}  ` +
    `| ${String(a.mate).padStart(8)}  ${f(a.mateSumP / Math.max(1, a.mate))}  ${f(a.mateTop1 / Math.max(1, a.mate))}  ` +
    `| ${String(a.asks).padStart(6)} ${f(a.believed / Math.max(1, a.asks))}   ${f(a.realised / Math.max(1, a.asks))}   ${(a.believed / Math.max(1, a.asks) - a.realised / Math.max(1, a.asks) >= 0 ? '+' : '') + f(a.believed / Math.max(1, a.asks) - a.realised / Math.max(1, a.asks))}  ` +
    `| ${f(a.rounds / Math.max(1, a.tables), 1)}`,
  )
}
