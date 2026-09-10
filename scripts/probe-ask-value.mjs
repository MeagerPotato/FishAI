/**
 * probe-ask-value.mjs - MONET.md 3.8as prediction B3, and the read that says whether the stage-C knob
 * would do anything at all: how often the fitted ask value's argmax over the CLONE'S TOP k differs from
 * the clone's own top, and - since these are self-play games with the true state in hand - whether the
 * asks it prefers hit more often than the ones it passes over.
 *
 *   node scripts/probe-ask-value.mjs --model models/av-1.json --games 300 --label av-probe [--topk 3]
 *        [--version v0.33] [--skip 0]
 *
 * The arm plays v0.33 unchanged: this probe CHANGES NOTHING, it only reads what a knob would have done
 * at each decision. `--skip g` starts at game index g, so the probe can be pointed at games the fit
 * never saw (the generator's seeds are `<label>-<g>`, so a disjoint game range is a disjoint sample).
 *
 * The immediate-hit column is the same measure 3.8ao and 3.8aq used, and it carries the same caveat,
 * stated here rather than after the numbers: 3.8ao measured that the ask which maximises the immediate
 * hit is the GREEDY player that lost by 3.64 points at the bridge. So a value that hits more often has
 * not thereby been shown to be better, and one that hits less often has not been shown to be worse.
 * The measure is reported because it is cheap and legible, and it settles nothing on its own.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const IMI = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/imitation.ts')).href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, reduce, decide } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const MODEL = argOf('--model', '')
const GAMES = Number(argOf('--games', 300))
const LABEL = argOf('--label', 'av-probe')
const TOPK = Number(argOf('--topk', 3))
const VERSION = argOf('--version', 'v0.33')
const SKIP = Number(argOf('--skip', 0))
if (!MODEL) {
  console.error('--model is required')
  process.exit(2)
}
const AV = JSON.parse(fs.readFileSync(MODEL, 'utf8'))
IMI.registerAskModel('ask-value-probe', AV)
const VALUE = IMI.askModelOf('ask-value-probe')

const POL = MON.monetPolicy(VERSION)
const { skill, style } = BOTS.resolvePolicy(POL)
const CLONE = IMI.askModelOf(style.askModel)
const marginal = style.pModel === 'marginal'
const KOPTS = {
  logWindow: skill.logWindow,
  useConstraints: skill.useConstraints,
  marginal,
  choiceKappa: marginal ? style.choiceKappa : undefined,
  choiceAdapt: marginal ? style.choiceAdapt : undefined,
  choicePrior: marginal ? style.choicePrior : undefined,
}

let decisions = 0
let agree = 0
let overridden = 0
const pickRank = new Array(TOPK).fill(0) // where in the clone's order the value's choice sits
let cloneHit = 0
let valueHit = 0
let bothSame = 0
let disagreeCloneHit = 0
let disagreeValueHit = 0
let disagreeN = 0
const t0 = Date.now()
for (let g = SKIP; g < SKIP + GAMES; g++) {
  const label = `${LABEL}-${g}`
  let s = newGame(label, us54Config, 0)
  let n = 0
  while (s.phase !== 'finished' && n++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const a = decide(view, POL, hashSeed(`${label}:${s.moveIndex}`)())
    if (a.type === 'ask' && !view.declareWindow && view.phase === 'playing') {
      const k = BOTS.buildKnowledge(view, KOPTS)
      const ranked = BOTS.rankAsksWith(view, k, style)
      if (ranked.length > 0) {
        const sc = IMI.scoreAsks(CLONE, view, k, ranked)
        const order = ranked.map((_, i) => i).sort((x, y) => sc[y] - sc[x] || x - y)
        const armIdx = ranked.findIndex((r) => r.target === a.target && r.card === a.card)
        if (armIdx !== order[0]) {
          overridden++ // a branch after pickAsk decided this one; the knob would never see it
        } else {
          const short = order.slice(0, TOPK)
          // Score the WHOLE ranked list, never the shortlist on its own: three of the forty-nine
          // features are list-relative (scoreRel is measured against the list best, rankInv is 1/(1+j)
          // and isTop is j === 0), so scoring a three-element sublist would hand the model feature
          // values the fit never saw. The generator built its rows on the full list, the arm has the
          // full list at pickAsk, and this reads it the same way.
          const vsAll = IMI.scoreAsks(VALUE, view, k, ranked)
          let best = 0
          for (let j = 1; j < short.length; j++) if (vsAll[short[j]] > vsAll[short[best]]) best = j
          decisions++
          pickRank[best]++
          if (best === 0) agree++
          const top = ranked[short[0]]
          const pick = ranked[short[best]]
          const hit = (r) => s.hands[r.target].includes(r.card)
          const ch = hit(top)
          const vh = hit(pick)
          if (ch) cloneHit++
          if (vh) valueHit++
          if (best === 0) bothSame++
          else {
            disagreeN++
            if (ch) disagreeCloneHit++
            if (vh) disagreeValueHit++
          }
        }
      }
    }
    const r = reduce(s, a)
    if (!r.ok) throw new Error(`${label}: ${r.error.code}`)
    s = r.state
  }
}
const secs = (Date.now() - t0) / 1000
const pct = (x, n) => (n > 0 ? ((100 * x) / n).toFixed(2) : 'n/a')
console.log(`probe-ask-value: ${GAMES} games (${LABEL}-${SKIP}..${SKIP + GAMES - 1}), ${decisions} clone decisions, ${overridden} overridden after pickAsk, shortlist depth ${TOPK}, ${secs.toFixed(1)}s`)
console.log(`  model ${MODEL} (${AV.features} features; gate ${AV.meta?.gateOpen === undefined ? 'unknown' : AV.meta.gateOpen ? 'open' : 'closed'}, playable gain ${AV.meta?.playableImprovementPct === undefined ? 'n/a' : `${AV.meta.playableImprovementPct.toFixed(3)}%`})`)
console.log('')
console.log(`B3 - the value's argmax agrees with the clone's top on ${agree}/${decisions} = ${pct(agree, decisions)}% of decisions (B3 predicted 55 to 75%)`)
console.log(`  the value's choice by the clone's rank: ${pickRank.map((c, i) => `${i}:${pct(c, decisions)}%`).join(' ')}`)
console.log('')
console.log(`immediate hit (the 3.8ao caveat above applies - this settles nothing on its own):`)
console.log(`  over every decision: the clone's top hits ${pct(cloneHit, decisions)}%, the value's choice ${pct(valueHit, decisions)}%`)
console.log(`  over the ${disagreeN} where they differ: the clone's top ${pct(disagreeCloneHit, disagreeN)}%, the value's choice ${pct(disagreeValueHit, disagreeN)}%`)
console.log('')
const verdict = decisions > 0 && (100 * agree) / decisions >= 55 && (100 * agree) / decisions <= 75
console.log(`B3 verdict: ${verdict ? 'HELD' : 'MISSED'}${decisions > 0 && agree === decisions ? ' - the value never disagrees, so the knob would be a no-op' : ''}`)
