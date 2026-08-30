/**
 * The assistant pane — the engine's own reasoning, shown at the human's decision points.
 *
 * Renders only under `?assist=1`. At every point where the table is waiting on the human, the
 * pane runs the advisor policy through `decideExplained` on the human's own `SeatView` — the
 * identical information a bot in this seat would have, nothing more — and shows the move it
 * would play, the engine's one-sentence reason, the supporting notes, the top ranked asks, and
 * the branches it considered and refused. "Play the suggestion" submits exactly that action
 * through the same `act` path the dialogs use; the advice is never a paraphrase, because the
 * trace is the engine's own and `decideExplained`'s action is pinned bit-identical to `decide`.
 *
 * The advisor's seed follows the lab convention (`hashSeed(seed:moveIndex)`), so the suggestion
 * at any position is the move the advisor bot would genuinely have played there — reproducible
 * from the URL like everything else at this table.
 *
 * There is no advisor-style picker any more, and no memory-budget note. Both were v0.5 fixtures:
 * a choice of which roster style should advise you, and a warning that the bots were bounded
 * while the advisor was not. With one policy at the table the advisor and the opposition are
 * provably the same engine, which is a stronger statement than either control was.
 */
import type { GameAction, SeatView } from '../../lib/engine/index.ts'
import { hashSeed } from '../../lib/engine/index.ts'
import { Eyebrow, cx } from '../components/index.ts'
import { advise } from './advisor.ts'
import { CardFace } from './CardFace.tsx'
import type { BotNames } from './format.ts'
import { bookLabel, cardLabel, seatName, withSeatNames } from './format.ts'
import { ADAPTIVE_POLICY } from './policies.ts'
import lab from '../lab/ui/lab.module.css'
import s from './play.module.css'

export interface AdvisorPaneProps {
  view: SeatView
  seed: string
  /** The human holds a decision the pane can advise on right now. */
  active: boolean
  /** The suggestion can be submitted directly (no modal dialog owns the interaction). */
  playable: boolean
  onPlay: (action: GameAction) => void
  /** What the player called the bots. Absent at the shared table, where there are none. */
  names?: BotNames
}

/** One line naming the suggested move — shared with the declare dialog's advice strip. */
export function describeSuggestion(action: GameAction, names: BotNames = []): string {
  switch (action.type) {
    case 'ask':
      return `Ask ${seatName(action.target, names)} for ${cardLabel(action.card)}`
    case 'claim':
      return `Declare ${bookLabel(action.book)}`
    case 'pass':
      return `Pass the turn to ${seatName(action.to, names)}`
    case 'designate':
      return `Designate ${seatName(action.to, names)}`
    case 'decline':
      return 'Decline the declare offer'
  }
}

export function AdvisorPane({ view, seed, active, playable, onPlay, names = [] }: AdvisorPaneProps) {
  const explained = active
    ? advise(view, ADAPTIVE_POLICY, hashSeed(`${seed}:${view.moveIndex}`)())
    : null

  return (
    <aside className={s.advisor} aria-label="Assistant">
      <Eyebrow tone="muted" track="head" as="h2">
        Assistant
      </Eyebrow>

      <p className={lab.figNote} style={{ marginTop: 10 }}>
        The advisor is the same engine the bot seats play — advice and opposition share one
        policy, at full memory on both sides.
      </p>

      {explained === null ? (
        <p className={lab.figNote}>
          Advice appears when a decision is yours — your turn to ask, a declare offer while the
          control is armed, or a forced declare. The advisor sees exactly what you see: your hand
          and the public log, nothing else.
        </p>
      ) : (
        <div className={s.panel} style={{ marginTop: 12 }}>
          {/* Only the suggestion and its one-line reason are announced — the ranked and
              refused lists below would drown a screen reader at every decision. */}
          <div aria-live="polite">
            <h3 className={s.panelHead}>{describeSuggestion(explained.action, names)}</h3>
            <p className={s.panelNote}>
              <strong>{withSeatNames(explained.trace.headline, names)}</strong>
            </p>
          </div>
          {explained.trace.notes.length > 0 ? (
            <ul className={s.advisorNotes}>
              {explained.trace.notes.map((note, i) => (
                // Positional per decision: engine prose can repeat verbatim within one trace.
                <li key={`${view.moveIndex}:${i}`} className={lab.figNote}>
                  {withSeatNames(note, names)}
                </li>
              ))}
            </ul>
          ) : null}

          {explained.trace.claim ? (
            <p className={lab.figNote}>
              Declare plan: {bookLabel(explained.trace.claim.book)} · p ={' '}
              {explained.trace.claim.p.toFixed(2)} · {explained.trace.claim.uncertain} guessed
              {explained.trace.claim.foreign ? ' · a set this seat holds no card of' : ''}
            </p>
          ) : null}

          {/* The two long lists are collapsed by default. Open, they ran to a couple of
              thousand pixels and pushed the log off the bottom of the world; the suggestion and
              its reason above are what a player reads every turn, and the working is what they
              open when they want to argue with it. */}
          {explained.trace.ranked && explained.trace.ranked.length > 0 ? (
            <details className={s.advisorDetail}>
              <summary>Top asks considered ({explained.trace.ranked.length})</summary>
              <ol className={s.advisorRanked}>
                {explained.trace.ranked.slice(0, 5).map((r) => (
                  <li key={`${r.target}:${r.card}`} className={lab.figNote}>
                    {seatName(r.target, names)} · <CardFace card={r.card} /> — {withSeatNames(r.reason, names)}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}

          {explained.trace.refused.length > 0 ? (
            <details className={s.advisorDetail}>
              <summary>Considered and refused ({explained.trace.refused.length})</summary>
              <div className={s.advisorDetailBody}>
                {explained.trace.refused.map((r, i) => (
                  // Positional per decision: two refusals can share kind AND reason.
                  <p key={`${view.moveIndex}:${i}`} className={lab.figNote}>
                    <code>{r.kind}</code> — {withSeatNames(r.reason, names)}
                  </p>
                ))}
              </div>
            </details>
          ) : null}

          <button
            type="button"
            className={cx(s.submit, !playable && s.submitOff)}
            disabled={!playable}
            onClick={() => {
              onPlay(explained.action)
            }}
          >
            Play the suggestion
          </button>
          {!playable ? (
            <p className={lab.figNote} style={{ margin: '8px 0 0' }}>
              {explained.action.type === 'decline'
                ? 'The declare dialog owns this decision — the advisor would stand down rather ' +
                  'than declare; use the dialog’s stand-down if you agree.'
                : 'The declare dialog owns this decision — the suggestion above is what the ' +
                  'advisor would declare; commit or stand down in the dialog.'}
            </p>
          ) : null}
        </div>
      )}
    </aside>
  )
}
