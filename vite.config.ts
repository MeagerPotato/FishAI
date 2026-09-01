import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// No dev proxy: FishAI has no backend. The lab site is a pure reader of a
// committed results artifact, and the simulator runs in Node, not the browser.
export default defineConfig({
  plugins: [react()],
  test: {
    // `.claude/worktrees` holds throwaway checkouts of this same repository, each with its own
    // copy of every test file. Without this exclude vitest collected 36,147 tests instead of 742
    // and reported failures belonging to other checkouts.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
    // Several lab tests run real bounded-simulation work — `tests/lab/bounded.test.ts`'s two P8
    // health-gate cases take ~5.5s each — and vitest's 5s default failed them as timeouts rather
    // than assertions. No test in this repo sets its own timeout, so the budget belongs here.
    testTimeout: 30_000,
  },
})
