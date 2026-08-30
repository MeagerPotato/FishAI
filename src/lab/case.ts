/**
 * Which committed artifact a URL asks for — and nothing else.
 *
 * This is three lines of string handling, and it lives in its own module for a measured reason.
 * `./artifact.ts` statically imports all four results documents (`?raw`), so importing *anything*
 * from it — even a pure helper like `caseFromSearch` — pulls the entire research corpus into the
 * importing chunk. `/play`, `/play/table` and `/papers` were each carrying roughly 1.4 MB of
 * simulation output in order to read one query parameter.
 *
 * So: a page that needs to know the case imports from here. A page that needs to *read* the
 * artifact imports `./artifact.ts` and pays for it deliberately.
 */

/** The four committed documents. `v2` is the current measured run and the default. */
export type ArtifactCase = 'cyclic' | 'dominant' | 'v2' | 'stale'

const CASES: readonly ArtifactCase[] = ['cyclic', 'dominant', 'v2', 'stale']

export const ARTIFACT_CASES: readonly ArtifactCase[] = CASES

/**
 * Which case a URL asks for. The site reads ONE artifact; `?case=` only chooses which committed
 * document that one is, and every page states plainly which one it read. The default is `v2` —
 * the current measured run — so a first-time visitor lands on real simulation output, not on
 * the synthetic render-path fixture.
 */
export function caseFromSearch(search: string): ArtifactCase {
  const asked = new URLSearchParams(search).get('case')
  return CASES.find((c) => c === asked) ?? 'v2'
}
