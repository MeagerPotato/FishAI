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
 */
import { useState } from 'react'
import type { GameAction, SeatView, StyleId } from '../../lib/engine/index.ts'
import { STYLE_IDS, STYLE_ROSTER, hashSeed } from '../../lib/engine/index.ts'
import { Eyebrow } from '../components/index.ts'
import { advise } from './advisor.ts'
import { bookLabel, cardLabel, seatName } from './format.ts'
import type { PlayMode } from './policies.ts'
import { advisorPolicy } from './policies.ts'
import lab from '../lab/ui/lab.module.css'
import s from './play.module.css'

export interface AdvisorPaneProps {
  view: SeatView
  mode: PlayMode
  seed: string
  /** The human holds a decision the pane can advise on right now. */
  active: boolean
  /** The suggestion can be submitted directly (no modal dialog owns the interaction). */
  playable: boolean
  onPlay: (action: GameAction) => void
}

function describeSuggestion(action: GameAction): string {
  switch (action.type) {
    case 'ask':
      return `Ask ${seatName(action.target)} for ${cardLabel(action.card)}`
    case 'claim':
      return `Declare ${bookLabel(action.book)}`
    case 'pass':
      return `Pass the turn to ${seatName(action.to)}`
    case 'designate':
      return `Designate ${seatName(action.to)}`
    case 'decline':
      return 'Decline the declare offer'
  }
}

export function AdvisorPane({ view, mode, seed, active, playable, onPlay }: AdvisorPaneProps) {
  const [style, setStyle] = useState<StyleId>('balanced')

  const explained = active
    ? advise(view, advisorPolicy(mode, style), hashSeed(`${seed}:${view.moveIndex}`)())
    : null

  return (
    <aside className={s.advisor} aria-label="Assistant">
      <Eyebrow tone="muted" track="head" as="h2">
        Assistant
      </Eyebrow>

      {mode === 'v05' ? (
        <div className={s.pickerRow} style={{ marginTop: 10 }}>
          <label className={s.pickerLabel} htmlFor="advisor-style">
            Advisor style
          </label>
          <select
            id="advisor-style"
            className={s.select}
            value={style}
            onChange={(e) => {
              setStyle(e.target.value as StyleId)
            }}
          >
            {STYLE_IDS.map((id) => (
              <option key={id} value={id}>
                {STYLE_ROSTER[id].label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className={lab.figNote} style={{ marginTop: 10 }}>
          The v1.0 advisor is the same engine the bot seats play — advice and opposition share
          one policy.
        </p>
      )}

      {explained === null ? (
        <p className={lab.figNote}>
          Advice appears when a decision is yours — your turn to ask, a declare offer while the
          control is armed, or a forced declare. The advisor sees exactly what you see: your hand
          and the public log, nothing else.
        </p>
      ) : (
        <div className={s.panel} style={{ marginTop: 12 }}>
          <h3 className={s.panelHead}>{describeSuggestion(explained.action)}</h3>
          <p className={s.panelNote}>
            <strong>{explained.trace.headline}</strong>
          </p>
          {explained.trace.notes.length > 0 ? (
            <ul className={s.advisorNotes}>
              {explained.trace.notes.map((note) => (
                <li key={note} className={lab.figNote}>
                  {note}
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

          {explained.trace.ranked && explained.trace.ranked.length > 0 ? (
            <>
              <h4 className={s.advisorSub}>Top asks considered</h4>
              <ol className={s.advisorRanked}>
                {explained.trace.ranked.slice(0, 5).map((r) => (
                  <li key={`${r.target}:${r.card}`} className={lab.figNote}>
                    {seatName(r.target)} · {cardLabel(r.card)} — {r.reason}
                  </li>
                ))}
              </ol>
            </>
          ) : null}

          {explained.trace.refused.length > 0 ? (
            <details className={lab.detail}>
              <summary>Considered and refused ({explained.trace.refused.length})</summary>
              <div className={lab.detailBody}>
                {explained.trace.refused.map((r) => (
                  <p key={`${r.kind}:${r.reason}`} className={lab.figNote}>
                    <code>{r.kind}</code> — {r.reason}
                  </p>
                ))}
              </div>
            </details>
          ) : null}

          <button
            type="button"
            className={lab.pill}
            disabled={!playable}
            onClick={() => {
              onPlay(explained.action)
            }}
          >
            Play the suggestion
          </button>
          {!playable ? (
            <p className={lab.figNote} style={{ margin: '8px 0 0' }}>
              The declare dialog owns this decision — the suggestion above is what the advisor
              would declare; commit or cancel in the dialog.
            </p>
          ) : null}
        </div>
      )}
    </aside>
  )
}
