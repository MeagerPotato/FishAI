/**
 * The assistant pane — reserved, honestly.
 *
 * Hidden by default: the table renders this only under `?assist=1`. When the engine's
 * `decideExplained` lands (a parallel task — see advisor.ts, the seam this pane sits on),
 * `advise()` starts returning an `ExplainedDecision` and this component grows the real surface:
 * the recommended action, its headline and notes, the top ranked asks, the claim plan, and a
 * "play the suggestion" control. Until then it says plainly that the assistant has not arrived,
 * because a pane that improvised advice from nothing would be worse than no pane.
 */
import type { SeatView } from '../../lib/engine/index.ts'
import { STYLE_ROSTER } from '../../lib/engine/index.ts'
import { Eyebrow } from '../components/index.ts'
import { advise } from './advisor.ts'
import lab from '../lab/ui/lab.module.css'
import s from './play.module.css'

export interface AdvisorPaneProps {
  view: SeatView
}

export function AdvisorPane({ view }: AdvisorPaneProps) {
  const explained = advise(view, STYLE_ROSTER.balanced, 0)

  return (
    <aside className={s.advisor} aria-label="Assistant">
      <Eyebrow tone="muted" track="head" as="h2">
        Assistant
      </Eyebrow>
      {explained === null ? (
        <p className={lab.figNote}>
          The assistant arrives with the engine&apos;s reasoning surface
          (<code>decideExplained</code>), which is being built now. This pane is its seat: once
          it lands, every human decision point shows the recommended action and the reasoning
          behind it. Nothing is shown until then — a guess dressed as advice would be worse than
          silence.
        </p>
      ) : (
        <p className={lab.figNote}>{explained.trace.headline}</p>
      )}
    </aside>
  )
}
