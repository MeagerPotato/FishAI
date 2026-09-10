/**
 * gen-ask-advantage-worker.mjs - the worker thread of scripts/gen-ask-advantage-data.mjs (MONET.md 3.8aw
 * stage A). A task is a contiguous range of games; its result is that range's labelled pairs as one
 * Float32Array, transferred back. The design and the row layout are the orchestrator's header.
 */
import { parentPort } from 'node:worker_threads'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { advFeatureRows } from './ask-advantage-features.mjs'

if (!parentPort) throw new Error('gen-ask-advantage-worker.mjs must be run as a worker thread')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const IMI = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/imitation.ts')).href)
const S = await import(pathToFileURL(join(ROOT, 'lib/engine/search/index.ts')).href)
const { newGame, us54Config, legalActionsSummary, seatView, seatTeam, hashSeed, mulberry32, reduce, decide } = ENG

const END = 5000

function runTask(t) {
  const pol = MON.monetPolicy(t.version)
  const { skill, style } = BOTS.resolvePolicy(pol)
  if (style.askModel === undefined) throw new Error(`${t.version} names no askModel; the advantage is a correction to a clone`)
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
  const c = { games: 0, askDecisions: 0, sampled: 0, overridden: 0, noAlt: 0, pairs: 0, rollouts: 0 }
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
            const order = ranked.map((_, i) => i).sort((x, y) => cs[y] - cs[x] || x - y)
            const rankOf = new Array(ranked.length)
            order.forEach((idx, r) => {
              rankOf[idx] = r
            })
            const chosen = new Set([ti])
            const alts = []
            const add = (i, kind) => {
              if (!chosen.has(i)) {
                chosen.add(i)
                alts.push({ i, kind })
              }
            }
            for (let r = 0, got = 0; r < order.length && got < t.cloneAlts; r++) {
              if (!chosen.has(order[r])) {
                add(order[r], 1)
                got++
              }
            }
            for (let i = 0, got = 0; i < ranked.length && got < t.rankerAlts; i++) {
              if (!chosen.has(i)) {
                add(i, 2)
                got++
              }
            }
            const rest = []
            for (let i = 0; i < ranked.length; i++) if (!chosen.has(i)) rest.push(i)
            for (let j = 0; j < t.randomAlts && rest.length > 0; j++) {
              const x = Math.floor(rng() * rest.length)
              add(rest[x], 3)
              rest.splice(x, 1)
            }
            if (alts.length === 0) {
              c.noAlt++
            } else {
              const team = seatTeam(seat)
              const key = `${label}:${s.moveIndex}:adv`
              const roll = (act) => {
                const r = reduce(s, act)
                if (!r.ok) return null
                c.rollouts++
                return S.rollout(r.state, pol, key, END, team, 0, 0)
              }
              const vP = roll(a)
              if (vP !== null) {
                const holder = (card) => s.hands.findIndex((h) => h.includes(card))
                const playedHit = holder(a.card) === a.target ? 1 : 0
                const xp = rows[ti]
                for (const alt of alts) {
                  const q = ranked[alt.i]
                  const vA = roll({ type: 'ask', seat, target: q.target, card: q.card })
                  if (vA === null) continue
                  const xa = rows[alt.i]
                  for (let f = 0; f < xa.length; f++) out.push(xa[f])
                  for (let f = 0; f < xp.length; f++) out.push(xp[f])
                  out.push(vA - vP, (vA > 0 ? 1 : 0) - (vP > 0 ? 1 : 0), g, s.moveIndex, seat, alt.kind, rankOf[alt.i], ranked.length, holder(q.card) === q.target ? 1 : 0, playedHit, vP)
                  c.pairs++
                }
              }
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
  if (buf.length !== c.pairs * t.cols) throw new Error(`task ${t.index}: ${buf.length} values for ${c.pairs} rows of ${t.cols} columns`)
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
