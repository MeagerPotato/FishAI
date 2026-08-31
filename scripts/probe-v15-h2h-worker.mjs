/**
 * probe-v15-h2h-worker.mjs — worker thread for probe-v15-h2h.mjs. Moves messages only; the
 * game loop is the lab's own `playGameSeats`, so the seeding, the invariant checks and the
 * health counters are the shipped ones.
 */
import { parentPort } from 'node:worker_threads'
import { ALL_SEATS, STYLE_ROSTER, seatTeam } from '../lib/engine/index.ts'
import { playGameSeats, seedFor, startSeatFor } from '../lib/lab/index.ts'

if (!parentPort) throw new Error('worker thread only')

const OPTS = { variant: 'us54', stepCap: 5000, invariantCheck: 'every' }

/** A serializable arm descriptor -> the {policy, leakStyle} pair playGameSeats wants. */
function armOf(d) {
  if (d.kind === 'bounded') {
    return { policy: { bounded: true, bits: d.bits, style: d.style }, leakStyle: STYLE_ROSTER[d.style] }
  }
  if (d.kind === 'adaptive') {
    return { policy: { adaptive: true }, leakStyle: STYLE_ROSTER[d.anchor ?? 'balanced'] }
  }
  return { policy: STYLE_ROSTER[d.id], leakStyle: STYLE_ROSTER[d.id] }
}

function runTask(task) {
  const A = armOf(task.a)
  const B = armOf(task.b)
  const rows = []
  for (let pair = task.pairFrom; pair < task.pairTo; pair++) {
    const seed = seedFor(task.bank, pair)
    const startSeat = startSeatFor(pair)
    const row = { pair, seed, startSeat, sets: [null, null], health: 0 }
    for (const orient of [0, 1]) {
      // orient 0: arm A on team 0. orient 1: arm A on team 1. Seed and start seat identical.
      const aTeam = orient === 0 ? 0 : 1
      const seats = ALL_SEATS.map((s) => (seatTeam(s) === aTeam ? A : B))
      const g = playGameSeats(seats, seed, startSeat, OPTS)
      const bad =
        g.illegal > 0 || g.invariantViolations > 0 || g.capped || !g.finished || g.tie || g.voids > 0 || !g.clinch
      if (bad) row.health++
      row.sets[orient] = [g.sets[aTeam], g.sets[1 - aTeam]] // [A sets, B sets] in this orientation
    }
    rows.push(row)
  }
  return { index: task.index, cell: task.cell, rows }
}

parentPort.on('message', (msg) => {
  if (msg?.type === 'quit') return void parentPort.close()
  try {
    parentPort.postMessage({ type: 'result', result: runTask(msg.task) })
  } catch (err) {
    parentPort.postMessage({ type: 'error', index: msg?.task?.index ?? -1, message: String(err?.stack ?? err) })
  }
})
