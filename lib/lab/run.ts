/**
 * run.ts — orchestration: schedule the tasks, put the results back in canonical order, aggregate,
 * gate, and emit.
 *
 * ## Why the pool lives here and the `Worker` does not
 *
 * `runPool` is the *scheduling* logic — a bounded-concurrency queue over the task plan — and it
 * is written against an injected `execute(task): Promise<LabTaskResult>`. Everything substantial
 * is therefore typechecked (`scripts/` is outside `tsconfig.app.json`'s `include`), while the
 * one thing that genuinely needs a platform — `new Worker('node:worker_threads')` — stays in the
 * launcher as a dozen lines of plumbing. The same pool drives an in-process executor, which is
 * what the lab's own tests use.
 *
 * ## Canonical order is not worker-arrival order
 *
 * Results come back whenever a thread finishes. `assembleRun` re-sorts every record by
 * (cell, pair, orientation) before hashing or writing, so the JSONL and its digest are
 * properties of the seed set alone — the reproducibility claim BOT_LAB.md §5.2 asks for. Change
 * the worker count and the bytes must not move.
 */
import { allBooks, clinchTarget } from '../engine/index.ts'
import { aggregateCell, runHealth } from './aggregate.ts'
import { cellList, planTasks } from './plan.ts'
import { configFor } from './play.ts'
import { LAB_SCHEMA_VERSION } from './types.ts'
import type {
  CellSpec,
  LabCellAggregate,
  LabGameRecord,
  LabRunConfig,
  LabRunOutput,
  LabTask,
  LabTaskResult,
} from './types.ts'

/** BOT_LAB.md §5.4's worker default: leave two cores for the OS and the parent process. */
export function defaultWorkers(cpuCount: number): number {
  return Math.max(1, cpuCount - 2)
}

/**
 * Bounded-concurrency task pump. Deterministic in its *output* (results are keyed by
 * `taskIndex`) and greedy in its *scheduling* — the next free worker takes the next task, which
 * is what keeps a long Turtle cell from being a serial tail.
 *
 * `onDone` fires as each task lands, for progress reporting only; nothing downstream may depend
 * on the order it is called in.
 */
export async function runPool(
  tasks: readonly LabTask[],
  concurrency: number,
  execute: (task: LabTask) => Promise<LabTaskResult>,
  onDone?: (result: LabTaskResult, completed: number, total: number) => void,
): Promise<LabTaskResult[]> {
  const results: LabTaskResult[] = new Array<LabTaskResult>(tasks.length)
  let next = 0
  let completed = 0
  const lanes = Math.max(1, Math.min(Math.floor(concurrency), tasks.length))

  async function lane(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= tasks.length) return
      const r = await execute(tasks[i])
      results[i] = r
      completed++
      if (onDone) onDone(r, completed, tasks.length)
    }
  }

  await Promise.all(Array.from({ length: lanes }, () => lane()))
  return results
}

/** FNV-1a, run twice with different offset bases to give 16 hex characters. */
export function digest(text: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}

/** One JSON object per line, in canonical order. This is the per-game artifact. */
export function toJsonl(records: readonly LabGameRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '')
}

/** Sort key: cell, then pair, then orientation. */
function canonical(a: LabGameRecord, b: LabGameRecord): number {
  if (a.cell !== b.cell) return a.cell < b.cell ? -1 : 1
  if (a.pair !== b.pair) return a.pair - b.pair
  return a.orient - b.orient
}

/**
 * Fold the raw task results into the published run. Pure: given the same results in any order,
 * it returns the same output (`wallMs` and `generatedAt`, which are provenance rather than
 * result, are supplied by the caller).
 */
export function assembleRun(
  config: LabRunConfig,
  results: readonly LabTaskResult[],
  opts: { wallMs: number; workers: number; generatedAt: string },
): LabRunOutput {
  const cells: CellSpec[] = cellList(config.styles)
  const byCell = new Map<number, LabGameRecord[]>()
  for (const c of cells) byCell.set(c.index, [])
  const all: LabGameRecord[] = []
  for (const r of results) {
    const slot = byCell.get(r.cellIndex)
    for (const rec of r.records) {
      all.push(rec)
      if (slot) slot.push(rec)
    }
  }
  all.sort(canonical)

  const aggregates: LabCellAggregate[] = cells.map((c) =>
    aggregateCell(c, (byCell.get(c.index) ?? []).slice().sort(canonical), config.pairs),
  )
  const health = runHealth(aggregates, all, config.pairs, config.variant)

  const movesTotal = all.reduce((s, r) => s + r.steps, 0)
  const rulesConfig = configFor(config.variant)
  const seconds = opts.wallMs / 1000

  return {
    meta: {
      schemaVersion: LAB_SCHEMA_VERSION,
      generatedAt: opts.generatedAt,
      config,
      toggles: { ...rulesConfig.toggles },
      books: allBooks(rulesConfig),
      clinchTarget: clinchTarget(rulesConfig),
      cells: cells.length,
      gamesTotal: all.length,
      workers: opts.workers,
      wallMs: opts.wallMs,
      gamesPerSecond: seconds === 0 ? 0 : all.length / seconds,
      movesTotal,
      movesPerSecond: seconds === 0 ? 0 : movesTotal / seconds,
      recordsDigest: digest(toJsonl(all)),
    },
    health,
    cells: aggregates,
    records: all,
  }
}

/** The whole run, in process, with an injected executor. Used by the lab's tests. */
export async function runLab(
  config: LabRunConfig,
  concurrency: number,
  execute: (task: LabTask) => Promise<LabTaskResult>,
  onDone?: (result: LabTaskResult, completed: number, total: number) => void,
): Promise<LabRunOutput> {
  const tasks = planTasks(config)
  const t0 = Date.now()
  const results = await runPool(tasks, concurrency, execute, onDone)
  return assembleRun(config, results, {
    wallMs: Date.now() - t0,
    workers: concurrency,
    generatedAt: new Date().toISOString(),
  })
}
