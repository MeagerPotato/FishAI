/**
 * bench-decide.mjs — the cost of a decision, for MONET.md §3.4a item 6 (≤ 1.4 ms per decision,
 * ≤ 0.9 s per six-seat game) and §0.2's cost line (Monet at ~0.14 ms per decision, ~82 ms per game).
 *
 *     node scripts/bench-decide.mjs --version v0.4a [--games 24] [--warmup 4]
 *
 * Plays `us54` mirror games of the named Monet version and times every `decide` call with
 * `performance.now()`, the engine's `reduce` excluded. Reports the mean, median and p99 per
 * decision, the mean per game, and the ask-decision subset (the marginal is built on the ask path).
 * Warm-up games are played and discarded so the JIT is not part of the number. Seeds `bench-<g>`,
 * disjoint from every fitting bank (MONET.md §6.5). Wall-clock: quote the machine beside the number.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import os from 'node:os'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const { newGame, reduce, seatView, us54Config, legalActionsSummary, hashSeed } = ENG
const { monetPolicy, isMonetVersion, MONET_VERSION_IDS, decide } = BOTS

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const VERSION = argOf('--version', '')
if (!isMonetVersion(VERSION)) {
  console.error(`--version must name a Monet version (${MONET_VERSION_IDS.join(', ')}); got ${JSON.stringify(VERSION)}`)
  process.exit(2)
}
const GAMES = Number(argOf('--games', 24))
const WARMUP = Number(argOf('--warmup', 4))
const POLICY = monetPolicy(VERSION)

function playTimed(seed, sink) {
  let s = newGame(seed, us54Config, 0)
  let guard = 0
  let gameMs = 0
  while (s.phase !== 'finished') {
    if (guard++ >= 6000) throw new Error(`${seed}: step cap`)
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const moveSeed = hashSeed(`${seed}:${s.moveIndex}`)()
    const t0 = performance.now()
    const action = decide(view, POLICY, moveSeed)
    const dt = performance.now() - t0
    gameMs += dt
    if (sink) {
      sink.all.push(dt)
      if (!view.declareWindow && view.phase === 'playing') sink.ask.push(dt)
    }
    const r = reduce(s, action)
    if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
    s = r.state
  }
  return gameMs
}

for (let g = 0; g < WARMUP; g++) playTimed(`bench-warmup-${g}`, null)
const sink = { all: [], ask: [] }
const perGame = []
for (let g = 0; g < GAMES; g++) perGame.push(playTimed(`bench-${g}`, sink))

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const q = (a, p) => {
  const t = [...a].sort((x, y) => x - y)
  return t[Math.min(t.length - 1, Math.floor(p * t.length))]
}
const f = (x) => x.toFixed(4)
console.log(`=== bench: Monet ${VERSION}, ${GAMES} us54 mirror games after ${WARMUP} warm-up, ${os.cpus()[0]?.model ?? 'cpu'} ===`)
console.log(`decisions ${sink.all.length}  (ask decisions ${sink.ask.length})`)
console.log(`per decision  mean ${f(mean(sink.all))} ms  median ${f(q(sink.all, 0.5))}  p99 ${f(q(sink.all, 0.99))}  max ${f(Math.max(...sink.all))}`)
console.log(`per ask       mean ${f(mean(sink.ask))} ms  median ${f(q(sink.ask, 0.5))}  p99 ${f(q(sink.ask, 0.99))}`)
console.log(`per game      mean ${mean(perGame).toFixed(1)} ms  max ${Math.max(...perGame).toFixed(1)} ms`)
console.log(`budget (3.4a item 6): ${mean(sink.all) <= 1.4 ? 'PASS' : 'FAIL'} at 1.4 ms per decision; ${mean(perGame) <= 900 ? 'PASS' : 'FAIL'} at 0.9 s per game`)
