/**
 * The one place the worker is constructed. Vite's worker bundling keys on this exact syntactic
 * pattern — `new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })` — so
 * it lives in its own two-line module beside the worker file rather than inside the page, where
 * a refactor could quietly break the static analysis that emits the worker chunk.
 */
export function createSimWorker(): Worker {
  return new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })
}
