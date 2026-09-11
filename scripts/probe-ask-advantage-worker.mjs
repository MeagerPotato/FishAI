/**
 * probe-ask-advantage-worker.mjs - the worker thread of scripts/probe-ask-advantage.mjs (MONET.md 3.8aw
 * gate B2). A task is a contiguous range of games; its result is one 9-column record per read decision.
 * The model (or the pin) arrives once, as workerData. The design is the orchestrator's header.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { advFeatureRows, advFeatureCount } from './ask-advantage-features.mjs'

if (!parentPort) throw new Error('probe-ask-advantage-worker.mjs must be run as a worker thread')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const IMI = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/imitation.ts')).href)
const NET = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/net.ts')).href)
const S = await import(pathToFileURL(join(ROOT, 'lib/engine/search/index.ts')).href)
const { newGame, us54Config, legalActionsSummary, seatView, seatTeam, hashSeed, mulberry32, reduce, decide } = ENG

const END = 5000
const PIN = workerData?.pin ?? ''
const MODEL = workerData?.model ? NET.compileNet(workerData.model, advFeatureCount(IMI)) : null
if (PIN === '' && MODEL === null) throw new Error('no model and no pin')

function runTask(t) {
  const pol = MON.monetPolicy(t.version)
  const { skill, style } = BOTS.resolvePolicy(pol)
  if (style.askModel === undefined) throw new Error(`${t.version} names no askModel`)
  const clone = IMI.askModelOf(style.askModel)
  const marginal = style.pModel === 'marginal'
  const KOPTS = {
    logWindow: skill.logWindow,
    useConstraints: skill.useConstraints,
    marginal,
    choiceKappa: marginal ? style.choiceKappa : undefined,
    choiceAdapt: marginal ? style.choiceAdapt : undefined,
    choicePrior: marginal ? style.choicePrior : undefined,
  }
  const out = []
  const c = { games: 0, askDecisions: 0, sampled: 0, overridden: 0, decisions: 0, argmaxIsClone: 0, rollouts: 0 }
  const t0 = Date.now()
  for (let g = t.from; g < t.to; g++) {
    const label = `${t.label}-${g}`
    let s = newGame(label, us54Config, 0)
    let n = 0
    while (s.phase !== 'finished' && n++ < END) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const seed = hashSeed(`${label}:${s.moveIndex}`)()
      const a = decide(view, pol, seed)
      if (!view.declareWindow && view.phase === 'playing' && a.type === 'ask') {
        c.askDecisions++
        const rng = mulberry32(hashSeed(`${label}:${s.moveIndex}:adv`)())
        if (rng() < t.sample) {
          c.sampled++
          const k = BOTS.buildKnowledge(view, KOPTS)
          const ranked = BOTS.rankAsksWith(view, k, style)
          const { rows, cs, ti } = advFeatureRows(IMI, clone, view, k, ranked)
          const top = ranked[ti]
          if (top.target !== a.target || top.card !== a.card) {
            c.overridden++
          } else {
            c.decisions++
            let f
            if (PIN === 'clone') f = cs
            else if (PIN === 'random') {
              const pr = mulberry32(hashSeed(`${label}:${s.moveIndex}:pin`)())
              f = ranked.map(() => pr())
            } else f = rows.map((x) => NET.forwardNet(MODEL, x))
            let bi = ti
            for (let j = 0; j < f.length; j++) if (f[j] > f[bi]) bi = j
            const holder = (card) => s.hands.findIndex((h) => h.includes(card))
            const playedHit = holder(a.card) === a.target ? 1 : 0
            if (bi === ti) {
              c.argmaxIsClone++
              out.push(g, s.moveIndex, 0, 0, 0, 0, playedHit, playedHit, 0)
            } else {
              const team = seatTeam(seat)
              const key = `${label}:${s.moveIndex}:adv`
              const roll = (act) => {
                const r = reduce(s, act)
                if (!r.ok) return null
                c.rollouts++
                return S.rollout(r.state, pol, key, END, team, 0, 0)
              }
              const q = ranked[bi]
              const vP = roll(a)
              const vB = roll({ type: 'ask', seat, target: q.target, card: q.card })
              if (vP === null || vB === null) throw new Error(`${label}: an ask from the ranked list did not apply at ${s.moveIndex}`)
              let rank = 0
              for (let j = 0; j < cs.length; j++) if (cs[j] > cs[bi] || (cs[j] === cs[bi] && j < bi)) rank++
              out.push(g, s.moveIndex, f[bi] - f[ti], vB - vP, (vB > 0 ? 1 : 0) - (vP > 0 ? 1 : 0), 1, holder(q.card) === q.target ? 1 : 0, playedHit, rank)
            }
          }
        }
      }
      const r = reduce(s, a)
      if (!r.ok) throw new Error(`${label}: ${r.error.code} at ${s.moveIndex}`)
      s = r.state
    }
    c.games++
  }
  const buf = Float32Array.from(out)
  return { index: t.index, ...c, secs: (Date.now() - t0) / 1000, buf: buf.buffer }
}

parentPort.on('message', (msg) => {
  if (msg?.type === 'quit') {
    parentPort.close()
    return
  }
  if (msg?.type !== 'task') return
  try {
    const result = runTask(msg.task)
    parentPort.postMessage({ type: 'result', result }, [result.buf])
  } catch (err) {
    parentPort.postMessage({ type: 'error', taskIndex: msg.task?.index ?? -1, message: String(err?.stack ?? err) })
  }
})
