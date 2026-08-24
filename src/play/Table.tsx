/**
 * The game surface: score strip, seat cards, the human hand, the action area and the public
 * log. Everything visual reuses the replay page's grammar (lab.module.css) — this is the same
 * table the lab replays, with the human seated at 0 — plus the play-only chrome in
 * play.module.css.
 *
 * The accent budget on this surface (SITE_SPEC.md §2.1): accent TEXT appears on the score
 * strip's leading team and on the game-over verdict, and nowhere else. Every Button is `ghost`
 * or `line`.
 *
 * Remounted by the page via `key` whenever mode, seed, styles or the rematch counter change —
 * a fresh `useGame` is the entire reset mechanism, so no state ever needs manual clearing.
 */
import { useState } from 'react'
import type { BookId, Card, EngineError, Seat, StyleId } from '../../lib/engine/index.ts'
import { allBooks, cardBook, hashSeed, sortHand } from '../../lib/engine/index.ts'
import { Button, Eyebrow, buttonRow } from '../components/index.ts'
import lab from '../lab/ui/lab.module.css'
import { advise } from './advisor.ts'
import { AdvisorPane } from './AdvisorPane.tsx'
import { AskPanel } from './AskPanel.tsx'
import { DeclareDialog } from './DeclareDialog.tsx'
import { cardLabel, bookLabel, describePlayEvent, seatName, teamOf } from './format.ts'
import type { PlayParams } from './params.ts'
import { advisorPolicy, policyLabel } from './policies.ts'
import s from './play.module.css'
import { useGame } from './useGame.ts'

const SEATS: readonly Seat[] = [0, 1, 2, 3, 4, 5]

export interface TableProps {
  play: PlayParams
  onRematch: () => void
  onNewGame: () => void
}

export function Table({ play, onRematch, onNewGame }: TableProps) {
  const game = useGame(play.mode, play.seed, play.stylesKey)
  const [humanError, setHumanError] = useState<EngineError | null>(null)
  // The advisor's style lives here, not in the pane, so the pane and the declare dialog's
  // advice strip reason with the SAME advisor: `advise` is pure over (view, policy, seed),
  // and one shared policy input keeps the two surfaces provably in agreement.
  const [advisorStyle, setAdvisorStyle] = useState<StyleId>('balanced')

  const { state, view, acting, kinds, sets, unresolved, finished, winner } = game
  const windowOpen = Boolean(state.declareWindow) && !finished
  const lead = sets[0] === sets[1] ? null : sets[0] > sets[1] ? 0 : 1

  const sorted = sortHand(view.hand, view.config)
  const handGroups = allBooks(view.config)
    .map((book) => ({ book, cards: sorted.filter((c) => cardBook(c) === book) }))
    .filter((group) => group.cards.length > 0)

  const logRows = state.log.map((event, i) => ({ key: i, event })).reverse()

  // The declare dialog is modal (`showModal` + backdrop), so the advisor pane behind it is
  // inert exactly when the human most wants the advice. The suggestion therefore rides into
  // the dialog itself when the assistant is on.
  const dialogAdvice =
    play.assist && game.declareOpen && !finished
      ? advise(view, advisorPolicy(play.mode, advisorStyle), hashSeed(`${play.seed}:${view.moveIndex}`)())
      : null

  const askTurn = !windowOpen && acting === 0 && kinds.includes('ask') && !finished
  // RULES_US54.md §4: the turn-holder whose own declare emptied their hand must pass to a
  // teammate with cards (RULES.md row 20, scoped to exactly this case). Reachable at this
  // table whenever the human banks a set that was entirely their own hand.
  const passTurn = !windowOpen && acting === 0 && kinds.includes('pass') && !finished

  const onAsk = (target: Seat, card: Card) => {
    const result = game.act({ type: 'ask', seat: 0, target, card })
    setHumanError(result.ok ? null : result.error)
  }

  const onPass = (to: Seat) => {
    const result = game.act({ type: 'pass', seat: 0, to })
    setHumanError(result.ok ? null : result.error)
  }

  const onDeclare = (book: BookId, assignments: Record<Card, Seat>) => {
    const result = game.act({ type: 'claim', seat: 0, book, assignments })
    setHumanError(result.ok ? null : result.error)
  }

  const status = finished ? null : windowOpen ? (
    <p className={s.status}>
      Declare window — the option is at <strong>{seatName(acting)}</strong>
      {state.declareWindow ? ` · ${state.declareWindow.declined} of 6 declines` : ''}
      {acting === 0 && !game.armed && !game.mustDeclare
        ? ' · declined for you (Declare is not armed)'
        : ''}
    </p>
  ) : acting === 0 ? (
    <p className={s.status}>
      {kinds.includes('pass') ? (
        <>
          <strong>You are out of cards.</strong> Pass the turn to a teammate below.
        </>
      ) : (
        <>
          <strong>Your turn.</strong> Pick an opponent and a card below.
        </>
      )}
    </p>
  ) : (
    <p className={s.status}>
      Seat {acting} ({policyLabel(play.mode, acting, play.styles)}) is thinking…
    </p>
  )

  return (
    <>
      <div className={s.score}>
        <div className={s.scoreTeam}>
          <Eyebrow tone="muted" track="legal">
            Team 0 · you, 2, 4
          </Eyebrow>
          <span className={`${s.scoreNum} ${lead === 0 ? s.scoreLead : ''}`}>{sets[0]}</span>
        </div>
        <span className={s.scoreDash} aria-hidden="true">
          –
        </span>
        <div className={s.scoreTeam}>
          <span className={`${s.scoreNum} ${lead === 1 ? s.scoreLead : ''}`}>{sets[1]}</span>
          <Eyebrow tone="muted" track="legal">
            Team 1 · seats 1, 3, 5
          </Eyebrow>
        </div>
        <span className={s.scoreMeta}>
          {unresolved} unresolved · first to 5 of 9 · seed {play.seed}
        </span>
      </div>

      {finished ? (
        <div className={s.over}>
          <p className={s.overVerdict}>
            {winner === 0 ? 'Your team clinches' : 'Team 1 clinches'} at {Math.max(sets[0], sets[1])}{' '}
            sets — {sets[0]}–{sets[1]} · {unresolved} unresolved.
          </p>
          <p className={s.overBody}>
            A clinched game always ends with sets unresolved and cards still in hand — the score
            above is complete, not truncated. Rematch replays the identical deal; a new game draws
            a fresh seed.
          </p>
          <div className={buttonRow} style={{ marginTop: 20 }}>
            <Button variant="ghost" arrow={false} onClick={onRematch}>
              Rematch — same seed
            </Button>
            <Button variant="line" arrow={false} onClick={onNewGame}>
              New game — new seed
            </Button>
          </div>
        </div>
      ) : null}

      <div className={s.surface}>
        <div>
          <div className={lab.seats}>
            {SEATS.map((seat) => {
              const active = !finished && acting === seat
              return (
                <div key={seat} className={`${lab.seat} ${active ? lab.seatOn : ''}`}>
                  <span className={lab.seatMeta}>
                    Seat {seat} · team {teamOf(seat)}
                  </span>
                  <span className={lab.seatCount} data-numeric>
                    {view.counts[seat]}
                  </span>
                  <span className={lab.seatMeta}>
                    {seat === 0 ? 'You' : policyLabel(play.mode, seat, play.styles)}
                  </span>
                  <span className={lab.seatMeta}>
                    {windowOpen && acting === seat
                      ? 'declare option'
                      : state.turn === seat && !finished
                        ? 'turn holder'
                        : ' '}
                  </span>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 24 }}>
            <Eyebrow tone="muted" track="head" as="h2">
              Your hand
            </Eyebrow>
          </div>
          <div className={s.hand} style={{ marginTop: 10 }}>
            {handGroups.map((group) => (
              <div key={group.book} className={s.handBook}>
                <span className={s.handBookName}>{bookLabel(group.book)}</span>
                <div className={s.handCards}>
                  {group.cards.map((c) => (
                    <span key={c} className={s.card}>
                      {cardLabel(c)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {handGroups.length === 0 ? (
              <p className={lab.figNote}>
                You are out of cards. You can no longer ask or be asked, but you may still declare
                — arm the control and take your next window offer.
              </p>
            ) : null}
          </div>

          <div className={lab.controls}>
            <button
              type="button"
              className={`${lab.pill} ${game.armed ? lab.pillOn : ''}`}
              aria-pressed={game.armed}
              onClick={() => {
                game.setArmed(!game.armed)
              }}
            >
              {game.armed ? 'Declare — armed' : 'Arm declare'}
            </button>
            <button
              type="button"
              className={`${lab.pill} ${game.fast ? lab.pillOn : ''}`}
              aria-pressed={game.fast}
              onClick={() => {
                game.setFast(!game.fast)
              }}
            >
              {game.fast ? 'Fast forward — on' : 'Fast forward'}
            </button>
          </div>
          <p className={lab.figNote} style={{ margin: '0 0 18px' }}>
            A declare window opens after every action and your offers are declined for you. Arm
            the control to take your next offer instead — the dialog opens at most one action
            later. Fast forward drops the bot cadence to zero.
          </p>

          {status}

          {askTurn ? <AskPanel key={state.moveIndex} view={view} onAsk={onAsk} /> : null}

          {passTurn ? (
            <div className={s.panel}>
              <h2 className={s.panelHead}>Pass the turn</h2>
              <p className={s.panelNote}>
                Your declare emptied your hand, and the pass rule (row 20) is still in force in
                exactly this case: hand the turn to a teammate who still holds cards. The declare
                window re-opens on them.
              </p>
              <div className={s.choiceRow} role="group" aria-label="Teammate to receive the turn">
                {([2, 4] as const).map((seat) => {
                  const out = view.counts[seat] === 0
                  return (
                    <button
                      key={seat}
                      type="button"
                      className={s.chip}
                      disabled={out}
                      onClick={() => {
                        onPass(seat)
                      }}
                    >
                      Seat {seat}
                      <span className={s.chipSub}>
                        {out ? 'out of cards' : `${view.counts[seat]} cards`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {humanError ? (
            <p className={lab.disagree}>
              <strong>The engine refused that move</strong> — <code>{humanError.code}</code>:{' '}
              {humanError.message}
            </p>
          ) : null}

          {game.fault ? (
            <p className={lab.disagree}>
              <strong>
                A bot at seat {game.fault.seat} produced a move the engine refused
              </strong>{' '}
              — <code>{game.fault.error.code}</code>: {game.fault.error.message}. The game is
              halted here rather than papered over; this means the table and the engine have
              drifted apart, and the seed above reproduces it.
            </p>
          ) : null}
        </div>

        <div>
          {play.assist ? (
            <AdvisorPane
              view={view}
              mode={play.mode}
              seed={play.seed}
              style={advisorStyle}
              onStyleChange={setAdvisorStyle}
              active={!finished && acting === 0 && (askTurn || passTurn || game.declareOpen)}
              playable={askTurn || passTurn}
              onPlay={(action) => {
                const result = game.act(action)
                setHumanError(result.ok ? null : result.error)
              }}
            />
          ) : null}
          <Eyebrow tone="muted" track="head" as="h2">
            Public log — newest first
          </Eyebrow>
          <p className={lab.figNote} style={{ margin: '10px 0 12px' }}>
            Every ask, every result, every declare — the whole information channel under row 17,
            and everything the bots reason over. Declines advance the window and emit nothing.
          </p>
          <ol className={lab.log} aria-live="polite">
            {logRows.map((row) => (
              <li key={row.key} className={lab.logRow}>
                <span className={lab.logIx}>{String(row.key).padStart(3, '0')}</span>
                <span>{describePlayEvent(row.event)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {game.declareOpen ? (
        // Keyed per decision, exactly like AskPanel above: a remount resets the dialog's
        // book/assignment state, so a second consecutive declare never inherits the first's.
        <DeclareDialog
          key={state.moveIndex}
          view={view}
          mustDeclare={game.mustDeclare}
          advice={dialogAdvice}
          onDeclare={onDeclare}
          onStandDown={game.standDown}
        />
      ) : null}
    </>
  )
}
