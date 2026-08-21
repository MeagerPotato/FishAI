/**
 * plan.ts — the deterministic experiment plan: the seed set, the cells, and the worker tasks.
 *
 * Nothing here plays a game. It exists so that the *design* of a run is a pure function of its
 * config — which is what makes BOT_LAB.md §5.2's controls checkable rather than merely intended:
 *
 * - **Shared seed set.** `seedSet()` depends on the prefix and the pair count and on nothing
 *   else, so every one of the 36 cells is handed the identical list. Cross-cell comparisons then
 *   share deals, not just the two orientations within a cell.
 * - **Seat rotation.** `startSeatFor(i) = i mod 6`, exactly as the shipped harness does, and
 *   held *identical across the two orientations of a pair* — the orientation swap must move the
 *   styles and nothing else.
 * - **Determinism is not sampling.** §5.2 and §10.6: re-running a seed returns a byte-identical
 *   game, so a repeated seed is not extra data. `seedSet` emits distinct seeds by construction
 *   and `aggregate.ts` re-checks it against the games actually played.
 */
import { STYLE_IDS } from '../engine/index.ts'
import type { Seat, StyleId } from '../engine/index.ts'
import type { CellSpec, LabRunConfig, LabTask } from './types.ts'

/** The default experiment: the full nine-style roster, C(9,2) = 36 cells. */
export const DEFAULT_LAB_CONFIG: LabRunConfig = {
  styles: STYLE_IDS,
  pairs: 200,
  seedPrefix: 'style-v1',
  chunkPairs: 25,
  variant: 'us54',
  stepCap: 5000,
  invariantCheck: 'every',
}

/**
 * The shared seed list. Zero-padded so the lexical and numeric orders agree, which keeps a
 * sorted JSONL and a sorted set of filenames in the same order as the run.
 */
export function seedSet(prefix: string, pairs: number): string[] {
  const out: string[] = []
  for (let i = 0; i < pairs; i++) out.push(seedFor(prefix, i))
  return out
}

export function seedFor(prefix: string, pair: number): string {
  return `${prefix}-${String(pair).padStart(6, '0')}`
}

/** BOT_LAB.md §5.2 seat rotation, shared by both orientations of the pair. */
export function startSeatFor(pair: number): Seat {
  return (pair % 6) as Seat
}

/**
 * The unordered pairings, in a stable order: every `{a, b}` with `a` earlier than `b` in the
 * roster. Mirror cells (`a` vs `a`) are excluded — a style scores exactly 0.5 against itself by
 * symmetry once the deals are duplicated, so a mirror cell costs games and carries no signal for
 * the matrix. (Mirror *diagnostics* are the S1 fuzz gate's job, not the matrix's.)
 */
export function cellList(styles: readonly StyleId[]): CellSpec[] {
  const cells: CellSpec[] = []
  for (let i = 0; i < styles.length; i++) {
    for (let j = i + 1; j < styles.length; j++) {
      cells.push({ index: cells.length, id: `${styles[i]}-vs-${styles[j]}`, a: styles[i], b: styles[j] })
    }
  }
  return cells
}

/**
 * Slice the run into worker tasks: contiguous pair ranges within one cell.
 *
 * Both orientations of a pair stay together (see `LabTask`), and tasks are emitted
 * **cell-major** so that the early tasks spread across every cell — a long-running cell
 * (a Turtle pairing runs ~1.7x the moves of a Balanced one) then overlaps with the rest
 * instead of being the tail everything waits on.
 */
export function planTasks(config: LabRunConfig): LabTask[] {
  const cells = cellList(config.styles)
  const chunk = Math.max(1, Math.floor(config.chunkPairs))
  const tasks: LabTask[] = []
  for (let from = 0; from < config.pairs; from += chunk) {
    const to = Math.min(config.pairs, from + chunk)
    for (const cell of cells) {
      tasks.push({
        index: tasks.length,
        cell,
        pairFrom: from,
        pairTo: to,
        seedPrefix: config.seedPrefix,
        variant: config.variant,
        stepCap: config.stepCap,
        invariantCheck: config.invariantCheck,
        ...(config.skill === undefined ? {} : { skill: config.skill }),
      })
    }
  }
  return tasks
}

/** Total games a config will play: 36 cells x pairs x 2 orientations. */
export function gamesTotal(config: LabRunConfig): number {
  return cellList(config.styles).length * config.pairs * 2
}
