/**
 * THE VERDICT BANNER — BOT_LAB.md §7.2's *"single most important element"*.
 *
 * > it must render `"dominant"`, `"cyclic"`, or `"inconclusive"` honestly, with the four §4.4
 * > criteria shown as pass/fail. Resist the urge to always crown a winner.
 *
 * Four decisions that follow from "honestly":
 *
 * - **The word is whatever the criteria say**, recomputed from the matrix by `derive()`, and the
 *   layout is identical in all three cases. There is no larger typeface for `dominant`, no
 *   trophy, no confetti path. A `cyclic` result is a finding, not a failure to find one.
 * - **All four criteria are always listed**, passing and failing alike, each with the number it
 *   was decided on. A banner that only shows what failed reads as an apology; one that only
 *   shows what passed is marketing.
 * - **Pass / fail / undetermined are told apart without colour** — filled, hollow and hatched
 *   squares plus the word itself. The palette has one accent and this page has already spent it
 *   on the verdict word; encoding the actual result in a red/green pair would put the most
 *   important distinction on the site into the one channel a reader might not have.
 * - **A disagreement with the artifact is shown, not resolved silently.** If the emitter said
 *   `dominant` and the recomputation says otherwise, both are printed.
 */

import { Eyebrow } from '../../components/index.ts'
import type { Criterion } from '../../../lib/lab/analysis/index.ts'
import type { Derived } from '../verdict.ts'
import s from './lab.module.css'

const MARK: Record<'pass' | 'fail' | 'unknown', { cls: string; word: string }> = {
  pass: { cls: s.markPass, word: 'Holds' },
  fail: { cls: s.markFail, word: 'Fails' },
  unknown: { cls: s.markUnknown, word: 'Not measured' },
}

function markOf(pass: boolean | null): 'pass' | 'fail' | 'unknown' {
  return pass === null ? 'unknown' : pass ? 'pass' : 'fail'
}

export function CriteriaList({ criteria }: { criteria: readonly Criterion[] }) {
  return (
    <ol className={s.criteria}>
      {criteria.map((c) => {
        const mark = MARK[markOf(c.pass)]
        return (
          <li key={c.id} className={s.criterion}>
            <span className={s.criterionNo}>({c.id})</span>
            <span className={s.criterionLabel}>{c.label}</span>
            <span className={`${s.mark} ${mark.cls}`}>{mark.word}</span>
            <span className={s.criterionDetail}>{c.detail}</span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The full banner. Rendered inside the page's one `InkPanel` — the inverted block is spent once
 * per page and this is what it is spent on.
 */
export function VerdictBody({ derived }: { derived: Derived }) {
  return (
    <>
      <div className={s.verdictHead}>
        <h2 className={s.verdictWord}>{derived.verdict}</h2>
        <Eyebrow tone="muted" track="badge">
          Four criteria · all must hold
        </Eyebrow>
      </div>

      <p className={s.verdictSummary}>{derived.summary}</p>

      <CriteriaList criteria={derived.criteria} />

      {derived.disagrees ? (
        <p className={s.disagree}>
          <strong>Disagreement:</strong> the artifact stamps <code>{derived.statedVerdict}</code>;
          recomputed from its matrix, <code>{derived.verdict}</code>.
        </p>
      ) : null}
    </>
  )
}

/**
 * The compact form, for the two utility routes. Same words, same marks, no headline: a reader
 * on `/lab/matrix` needs the verdict in view while reading cells, not a second banner.
 */
export function VerdictStrip({ derived }: { derived: Derived }) {
  return (
    <div className={s.refuseBox}>
      <div className={s.verdictHead}>
        <Eyebrow tone="muted" track="badge">
          Verdict — BOT_LAB §4.4
        </Eyebrow>
        <Eyebrow tone="muted" track="badge">
          {derived.significantCells} of {derived.cells} cells significant after BH
        </Eyebrow>
      </div>
      <p className={s.stepAction} style={{ marginTop: 10 }}>
        {derived.verdict}
      </p>
      <p className={s.figNote}>{derived.summary}</p>
      <CriteriaList criteria={derived.criteria} />
    </div>
  )
}
