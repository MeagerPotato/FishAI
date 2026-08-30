/**
 * bounded-single-analyze.test.mjs — the analyzer script's integrity gates, exercised by
 * SPAWNING the real script against a real (tiny) run written to disk. A `.mjs` test on
 * purpose: the repo's tsconfig carries no Node type definitions (the app compiles against DOM
 * libs), and these tests are about a Node script's exit codes, not about types — the vitest
 * runner picks the file up, `tsc` does not.
 *
 * What is pinned here is the FAILURE mode: the script must exit non-zero when the records
 * file is absent (the per-game records are the evidence — an artifact must never be extended
 * from run.json alone) and when run.json's aggregates disagree with the records. Both were
 * review findings against the note-and-proceed draft.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BOUNDED_INF_BITS,
  DEFAULT_BOUNDED_CONFIG,
  assembleBoundedSingleRun,
  boundedToJsonl,
  planBoundedSingleTasks,
  runBoundedTask,
} from '../../lib/lab/index.ts'

const SCRIPT = fileURLToPath(new URL('../../scripts/bounded-single-analyze.mjs', import.meta.url))

/** The same tiny grid bounded.test.ts plays — 2 budgets × 36 pairings × 1 game. */
const TINY = {
  ...DEFAULT_BOUNDED_CONFIG,
  ladderBits: [0, 24, BOUNDED_INF_BITS],
  ladderPairs: 2,
  tierPairs: 2,
  accBits: [16, BOUNDED_INF_BITS],
  accGames: 1,
}

const SINGLE_RUN = assembleBoundedSingleRun(
  TINY,
  planBoundedSingleTasks(TINY).map((t) => runBoundedTask(t)),
  { wallMs: 1, workers: 1, generatedAt: '2026-01-01T00:00:00.000Z' },
)

/** run.json exactly as bounded-single-sim.mjs writes it. */
function runJson() {
  return JSON.stringify(
    {
      engineCommit: 'test-commit',
      meta: SINGLE_RUN.meta,
      health: SINGLE_RUN.health,
      cells: SINGLE_RUN.cells,
      deltas: SINGLE_RUN.deltas,
      infReproduction: SINGLE_RUN.infReproduction,
    },
    null,
    2,
  )
}

function spawn(dir) {
  try {
    execFileSync(process.execPath, [SCRIPT, '--run', dir], { encoding: 'utf8', timeout: 110_000 })
    return { status: 0, stderr: '' }
  } catch (error) {
    return { status: error.status ?? -1, stderr: String(error.stderr ?? '') }
  }
}

describe('bounded-single-analyze.mjs: the integrity gates fail, never note-and-proceed', () => {
  it('exits non-zero when games.jsonl is absent — the records ARE the evidence', { timeout: 120_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bounded-single-'))
    try {
      writeFileSync(join(dir, 'run.json'), runJson(), 'utf8')
      const { status, stderr } = spawn(dir)
      expect(status).toBe(2)
      expect(stderr).toMatch(/games\.jsonl is missing/)
      expect(stderr).toMatch(/never be extended from run\.json alone/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when run.json aggregates disagree with the records', { timeout: 120_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bounded-single-'))
    try {
      // The JSONL is genuine (its digest matches run.json's), but a cell aggregate in run.json
      // is doctored — the re-scoring cross-check must catch what the digest alone cannot.
      const doctored = JSON.parse(runJson())
      doctored.cells[0].top1 += 0.01
      writeFileSync(join(dir, 'run.json'), JSON.stringify(doctored, null, 2), 'utf8')
      writeFileSync(join(dir, 'games.jsonl'), boundedToJsonl(SINGLE_RUN.records), 'utf8')
      const { status, stderr } = spawn(dir)
      expect(status).toBe(2)
      expect(stderr).toMatch(/cells do not serialise byte-identically/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
