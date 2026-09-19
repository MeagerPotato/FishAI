/**
 * bench-forward.mjs: the JavaScript forward's cost per decision at the three candidate sizes (ATHENA.md §4.6 G0d
 * part 3: information for P1 and D5; it gates nothing).
 *
 *     node scripts/athena/bench-forward.mjs [--sizes S,M,L] [--games 12] [--reps 20] [--format 1|3]
 *
 * One thread (Node's main thread; nothing here spawns a worker). The games are played first, in-engine, by Monet v1.0
 * in all six seats (`bench-forward-<i>`, start seat i mod 6), so the event logs and the decision mix are a strong
 * bot's. Then, for each size, a network of that size (`initBlob(arch, "athena-g0d-bench-<size>")`: the stub's init,
 * so the weights have the family's shapes and magnitudes) is timed over the same games:
 *
 * - **fold**: the GRU step per event (a full refold of every seat's final log, `foldAll`), in microseconds per event;
 * - **heads**: the trunk and the heads once per decision (`headsOf` on a fixed state), in milliseconds;
 * - **as the net plays**: `decideNet` at every decision of every seat, with a per-seat incremental cache (the
 *   package's arrangement). The stub runs the network at asks, passes and compelled claims; the declare windows it
 *   declines run the encoder and the rules' facts only. Reported per network decision and per six-seat game;
 * - **the network at every decision**: `forwardView` at every decision of every seat, every declare-window offer
 *   included, with the same caching: the cost of a policy that consults the network whenever it is asked (P1's
 *   speculative declare head, ATHENA.md §3.1), per decision and per six-seat game.
 *
 * The host's load (`typeperf`, % processor time over all cores) is sampled for 5 s before and 3 s after, and printed
 * with the numbers: the costs are this machine's, at that load.
 */
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = await import(pathToFileURL(`${ROOT}/lib/athena/index.ts`).href)
const ENG = await import(pathToFileURL(`${ROOT}/lib/engine/index.ts`).href)
const MON = await import(pathToFileURL(`${ROOT}/lib/engine/bots/monet.ts`).href)

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const SIZES = argOf('--sizes', 'S,M,L').split(',')
const GAMES = Number.parseInt(argOf('--games', '12'), 10)
const REPS = Number.parseInt(argOf('--reps', '20'), 10)
// ATHENA.md §9.2: `--format 3` times P2's net instead of G0d's stub (912 decision features, 518 heads, the 19-slot
// fold, and the window policy that takes every offer to the network). The default 1 is G0d's number, unchanged.
const FORMAT = Number.parseInt(argOf('--format', '1'), 10)

function sampleLoad(n) {
  try {
    const out = execFileSync('typeperf', ['\\Processor(_Total)\\% Processor Time', '-si', '1', '-sc', String(n)], { encoding: 'utf8', timeout: (n + 15) * 1000 })
    const vals = []
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^"[^"]+","([0-9.]+)"$/)
      if (m) vals.push(Number(m[1]))
    }
    return vals
  } catch (err) {
    return [`unavailable: ${err && err.message ? err.message.split('\n')[0] : err}`]
  }
}
const fmtLoad = (v) => (typeof v[0] === 'number' ? `${v.map((x) => x.toFixed(1)).join(', ')} % (mean ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)} %)` : v[0])

const loadBefore = sampleLoad(5)

/* ------------------------------------------------------------------------------------ the games (Monet) --- */

const POL = MON.monetPolicy('v1.0')
const games = []
const tGen = Date.now()
for (let g = 0; g < GAMES; g++) {
  let s = ENG.newGame(`bench-forward-${g}`, ENG.us54Config, g % 6)
  const states = []
  while (s.phase !== 'finished') {
    if (states.length > 6000) throw new Error(`game ${g} did not finish`)
    states.push(s)
    const w = s.declareWindow
    const actor = w ? w.option : s.turn
    const r = ENG.reduce(s, ENG.decide(ENG.seatView(s, actor), POL, ENG.hashSeed(`bench-forward-${g}:${states.length}`)()))
    if (!r.ok) throw new Error(`game ${g}: ${r.error.code} ${r.error.message}`)
    s = r.state
  }
  games.push({ states, final: s })
}
const genS = (Date.now() - tGen) / 1000
const decisions = games.reduce((n, g) => n + g.states.length, 0)
const events = games.reduce((n, g) => n + g.final.log.length, 0)

const actorOf = (s) => (s.declareWindow ? s.declareWindow.option : s.turn)
const now = () => Number(process.hrtime.bigint()) / 1e6
const q = (xs, p) => {
  const a = [...xs].sort((x, y) => x - y)
  return a.length === 0 ? Number.NaN : a[Math.min(a.length - 1, Math.floor(p * a.length))]
}
const mean = (xs) => (xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length)

console.log(`bench-forward: ${GAMES} games of Monet v1.0 in all six seats (${genS.toFixed(1)} s to play): ${decisions} decisions, ${events} events, ${(decisions / GAMES).toFixed(1)} decisions and ${(events / GAMES).toFixed(1)} events a game`)
console.log(`  host: ${os.cpus()[0].model}, ${os.cpus().length} logical CPUs, Node ${process.version}, one thread; weight format ${FORMAT}`)
console.log(`  load before: ${fmtLoad(loadBefore)}`)

/* ------------------------------------------------------------------------------------------- the sizes --- */

function timeSize(size) {
  const arch = A.withFormat(A.ARCHS[size], FORMAT)
  const tInit = now()
  const net = A.makeNet(arch, A.initBlob(arch, `athena-g0d-bench-${size}`), { bench: size })
  const initMs = now() - tInit

  // fold: every seat's final log, refolded whole
  const logs = games.flatMap((g) => [0, 1, 2, 3, 4, 5].map((seat) => A.encodeEventRows(ENG.seatView(g.final, seat).log, seat)))
  A.foldAll(net, logs[0], logs[0].length / A.EVENT_LEN) // warm
  let foldMs = 0
  let folded = 0
  for (const rows of logs) {
    const t0 = now()
    A.foldAll(net, rows, rows.length / A.EVENT_LEN)
    foldMs += now() - t0
    folded += rows.length / A.EVENT_LEN
  }

  // heads: one decision's trunk and heads, repeated
  const s0 = games[0].states[Math.floor(games[0].states.length / 2)]
  const v0 = ENG.seatView(s0, actorOf(s0))
  const f0 = A.forwardView(net, v0)
  const obs = new Uint8Array(A.OBS_LEN)
  const legal = new Uint8Array(A.LEGAL_LEN)
  A.encodeObservation(v0, obs, legal)
  const dec = new Float64Array(A.decFOf(net.arch))
  A.decisionFeatures(obs, A.candidateMatrix(v0, f0.k), dec)
  if (A.decFOf(net.arch) === A.DEC_F_FACTS) {
    const row = new Uint8Array(A.FACTS_LEN)
    A.encodeFactsRow(v0, f0.k, row)
    A.factsFeatures(row, dec, A.DEC_F)
  }
  const r0 = A.encodeEventRows(v0.log, v0.seat)
  const h = A.foldAll(net, r0, r0.length / A.EVENT_LEN)
  const out = new Float64Array(A.headCountOf(net.arch))
  for (let r = 0; r < 3; r++) A.headsOf(net, h, dec, out) // warm
  const tH = now()
  for (let r = 0; r < REPS; r++) A.headsOf(net, h, dec, out)
  const headsMs = (now() - tH) / REPS

  // as the net plays / the network at every decision
  const played = { all: [], net: [], game: [], kinds: {} }
  const every = { all: [], game: [] }
  for (const g of games) {
    const cacheA = [0, 1, 2, 3, 4, 5].map(() => new A.SeatForward(net))
    const cacheB = [0, 1, 2, 3, 4, 5].map(() => new A.SeatForward(net))
    let gameA = 0
    let gameB = 0
    for (const s of g.states) {
      const seat = actorOf(s)
      const v = ENG.seatView(s, seat)
      let t0 = now()
      const d = A.decideNet(net, v, cacheA[seat])
      let dt = now() - t0
      gameA += dt
      played.all.push(dt)
      if (d.forward) played.net.push(dt)
      played.kinds[d.kind] = (played.kinds[d.kind] ?? 0) + 1
      t0 = now()
      A.forwardView(net, v, cacheB[seat])
      dt = now() - t0
      gameB += dt
      every.all.push(dt)
    }
    played.game.push(gameA)
    every.game.push(gameB)
  }
  return { size, arch, params: A.paramCount(arch), initMs, foldUs: (1000 * foldMs) / folded, folded, headsMs, played, every }
}

const results = []
for (const size of SIZES) {
  const r = timeSize(size)
  results.push(r)
  const p = r.played
  const e = r.every
  const kinds = Object.entries(p.kinds).map(([k, n]) => `${k} ${n}`).join(', ')
  console.log(`\n  ${size} (d ${r.arch.d}, width ${r.arch.width}, depth ${r.arch.depth}; ${r.params.toLocaleString('en-US')} actor weights; init ${(r.initMs / 1000).toFixed(1)} s)`)
  console.log(`    fold            : ${r.foldUs.toFixed(1)} us per event (${r.folded.toLocaleString('en-US')} events refolded)`)
  console.log(`    trunk + heads   : ${r.headsMs.toFixed(3)} ms per decision (${REPS} reps)`)
  console.log(`    as the net plays  : ${kinds}; a network decision ${mean(p.net).toFixed(3)} ms mean (p50 ${q(p.net, 0.5).toFixed(3)}, p95 ${q(p.net, 0.95).toFixed(3)}, max ${Math.max(...p.net).toFixed(1)}), any decision ${mean(p.all).toFixed(3)} ms mean; a six-seat game ${mean(p.game).toFixed(0)} ms mean (max ${Math.max(...p.game).toFixed(0)})`)
  console.log(`    network at every decision: ${mean(e.all).toFixed(3)} ms mean per decision (p50 ${q(e.all, 0.5).toFixed(3)}, p95 ${q(e.all, 0.95).toFixed(3)}, max ${Math.max(...e.all).toFixed(1)}); a six-seat game ${mean(e.game).toFixed(0)} ms mean (max ${Math.max(...e.game).toFixed(0)})`)
}

const loadAfter = sampleLoad(3)
console.log(`\n  load after: ${fmtLoad(loadAfter)}`)
console.log('\n| size | actor weights | fold us/event | trunk+heads ms | played: ms per network decision | played: ms per six-seat game | every decision: ms | every decision: ms per six-seat game |')
console.log('|---|---|---|---|---|---|---|---|')
for (const r of results) {
  console.log(`| ${r.size} | ${r.params.toLocaleString('en-US')} | ${r.foldUs.toFixed(1)} | ${r.headsMs.toFixed(3)} | ${mean(r.played.net).toFixed(3)} | ${mean(r.played.game).toFixed(0)} | ${mean(r.every.all).toFixed(3)} | ${mean(r.every.game).toFixed(0)} |`)
}
