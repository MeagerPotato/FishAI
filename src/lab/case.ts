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

/**
 * The three committed documents the site can serve. `v2` is the current measured run and the
 * default.
 *
 * `dominant` — matrix v1, measured at `819eebb` — was a fourth until the September 2026
 * turn-pass correction (RULES_US54.md §4). It was measured under the superseded rules document,
 * so the §1.1 guard refuses it and no honest re-stamp exists: its bytes are evidence about the
 * engine AND the rules that produced them. The file stays committed at
 * `src/lab/data/style-results.dominant.json` because the contained-book paper's central result
 * is a paired comparison between it and v2, and deleting it would delete that evidence. It is
 * simply no longer offered as a view.
 */
export type ArtifactCase = 'cyclic' | 'v2' | 'stale'

const CASES: readonly ArtifactCase[] = ['cyclic', 'v2', 'stale']

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
