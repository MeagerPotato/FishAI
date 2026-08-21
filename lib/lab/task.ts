/**
 * task.ts — the unit of work a worker thread executes.
 *
 * `runTask` is a **pure function of its argument**: same `LabTask` in, byte-identical
 * `LabTaskResult` out, on any thread, in any order, on any machine running this engine. That is
 * what makes the worker pool a throughput device and not a source of variation — BOT_LAB.md §5.2
 * requires the run to be reproducible from the seed set alone, and it can only be that if
 * scheduling is invisible to the result.
 *
 * The duplicate pair (BOT_LAB.md §5.1) is formed here and nowhere else: one seed, one starting
 * seat, played twice with the seating swapped.
 */
import { STYLE_ROSTER } from '../engine/index.ts'
import type { StyleParams } from '../engine/index.ts'
import { seedFor, startSeatFor } from './plan.ts'
import { playGame } from './play.ts'
import type { PlayOptions } from './play.ts'
import type { LabGameRecord, LabTask, LabTaskResult, Orientation, SideCounters } from './types.ts'

/**
 * Score-rate contribution for style *a* (BOT_LAB.md §4.1: win 1 / tie 0.5 / loss 0).
 *
 * A tie is arithmetically impossible under `us54` (RULES_US54.md §5) and the health gate asserts
 * it never occurred — but the 0.5 arm stays, because the runner also accepts `pagat48`, where
 * ~25% of mirror games tie and discarding them would throw away a quarter of the signal
 * (BOT_LAB.md §4.1).
 */
function scoreRate(setsA: number, setsB: number): number {
  if (setsA > setsB) return 1
  if (setsB > setsA) return 0
  return 0.5
}

export function runTask(task: LabTask): LabTaskResult {
  const t0 = Date.now()
  const a: StyleParams = STYLE_ROSTER[task.cell.a]
  const b: StyleParams = STYLE_ROSTER[task.cell.b]
  const opts: PlayOptions = {
    variant: task.variant,
    stepCap: task.stepCap,
    invariantCheck: task.invariantCheck,
    ...(task.skill === undefined ? {} : { skill: task.skill }),
  }
  const records: LabGameRecord[] = []

  for (let pair = task.pairFrom; pair < task.pairTo; pair++) {
    const seed = seedFor(task.seedPrefix, pair)
    const startSeat = startSeatFor(pair)
    for (const orient of [0, 1] as Orientation[]) {
      const g = playGame(a, b, seed, startSeat, orient, opts)
      // Orientation 0 seats `a` on team 0; orientation 1 seats it on team 1. Re-index the
      // per-team counters into per-STYLE counters here, so every consumer downstream reads
      // `ca` as "style a" without ever needing to know which side of the table that was.
      const aTeam = orient === 0 ? 0 : 1
      const ca: SideCounters = g.counters[aTeam]
      const cb: SideCounters = g.counters[1 - aTeam]
      const setsA = g.sets[aTeam]
      const setsB = g.sets[1 - aTeam]
      records.push({
        cell: task.cell.id,
        a: task.cell.a,
        b: task.cell.b,
        pair,
        orient,
        seed,
        startSeat,
        aTeam,
        steps: g.steps,
        finished: g.finished,
        capped: g.capped,
        illegal: g.illegal,
        invariantViolations: g.invariantViolations,
        setsA,
        setsB,
        unresolved: g.unresolved,
        voids: g.voids,
        endgameReached: g.endgameReached,
        aResult: scoreRate(setsA, setsB),
        clinch: g.clinch,
        ca,
        cb,
      })
    }
  }

  return { taskIndex: task.index, cellIndex: task.cell.index, records, wallMs: Date.now() - t0 }
}
