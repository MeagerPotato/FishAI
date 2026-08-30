/**
 * The game surface: score strip, the table in the round, the human's hand, the action area, the
 * pace controls and the public log.
 *
 * ## The reading order, which is the whole design
 *
 * A player needs four things per turn, and they are now in that order and within one screen of
 * each other: WHOSE TURN it is, WHAT THE TABLE LOOKS LIKE, WHAT I HOLD, and WHAT I CAN DO. The
 * previous layout put the last of those — the ask panel, used on literally every turn — below
 * the seats, the hand, both toggles and a paragraph of rules commentary, which is why it sat a
 * long scroll down the page. It now sits beside the table at desktop widths and directly under
 * it below them.
 *
 * ## Announcements
 *
 * The visible status line is NOT a live region and the log is NOT a live region. Between them
 * they used to narrate every bot move, every decline and every advisor musing to a screen
 * reader, which is a firehose that buries the one event a player has to act on. Instead a single
 * visually-hidden `role="status"` carries only the text that means "it is your move now", so it
 * changes when — and only when — the human is owed a decision. Refusals are `role="alert"`,
 * because a move the engine rejected is not something to discover by scrolling.
 *
 * The accent budget on this surface (SITE_SPEC.md §2.1) is spent on the score strip's leading
 * team, the game-over verdict, and — added deliberately — the seat holding the turn. That third
 * one is the fact a player looks for most often, and every cheaper signal had been tried; see
 * Seats.tsx.
 *
 * Remounted by the page via `key` whenever the seed or the rematch counter changes — a fresh
 * `useGame` is the entire reset mechanism, so no state ever needs manual clearing.
 *
 * ## The controls, and what the owner asked them to say
 *
 * "Declare" is one word in both states, and the line under it is one sentence. That is the
 * owner's wording, verbatim, and the two things it dropped were a state suffix and a paragraph
 * about a pace menu that no longer exists — the pace is a number now, and a field labelled
 * "Step every 3 seconds" needs no paragraph to explain it.
 */
import { useState } from 'react'
import type { BookId, Card, EngineError, Seat } from '../../lib/engine/index.ts'
import { hashSeed } from '../../lib/engine/index.ts'
import { Button, Eyebrow, buttonRow, cx } from '../components/index.ts'
import lab from '../lab/ui/lab.module.css'
import { advise } from './advisor.ts'
import { AdvisorPane } from './AdvisorPane.tsx'
import { AskPanel } from './AskPanel.tsx'
import { DeclareDialog } from './DeclareDialog.tsx'
import { describePlayEvent, seatName, seatNameCap } from './format.ts'
import { Hand } from './Hand.tsx'
import type { PlayParams } from './params.ts'
import { PACE_MAX, PACE_MIN, PACE_STEP } from './params.ts'
import { ADAPTIVE_LABEL, ADAPTIVE_POLICY } from './policies.ts'
import s from './play.module.css'
import { PublicLog } from './PublicLog.tsx'
import { Seats } from './Seats.tsx'
import { StyleMirror } from './StyleMirror.tsx'
import { useGame } from './useGame.ts'

export interface TableProps {
  play: PlayParams
  onRematch: () => void
  onNewGame: () => void
}

export function Table({ play, onRematch, onNewGame }: TableProps) {
  const game = useGame(play.seed, play.paceSeconds)
  const [humanError, setHumanError] = useState<EngineError | null>(null)
  /**
   * The pace field's TEXT, held apart from the committed number. A `type="number"` bound
   * straight to state cannot be cleared — the empty string parses to nothing, the value snaps
   * back mid-keystroke, and a player trying to type "10" over "3" fights the field for it. The
   * text is what the input shows; the number only moves when the text parses to a legal one.
   */
  const [paceText, setPaceText] = useState(() => String(play.paceSeconds))

  const names = play.names
  const { state, view, acting, kinds, sets, unresolved, finished, winner } = game
  const windowOpen = Boolean(state.declareWindow) && !finished
  const lead = sets[0] === sets[1] ? null : sets[0] > sets[1] ? 0 : 1

  const lastEvent = state.log.length > 0 ? state.log[state.log.length - 1] : null

  // The declare dialog is modal (`showModal` + backdrop), so the advisor pane behind it is
  // inert exactly when the human most wants the advice. The suggestion therefore rides into
  // the dialog itself when the assistant is on.
  const dialogAdvice =
    play.assist && game.declareOpen && !finished
      ? advise(view, ADAPTIVE_POLICY, hashSeed(`${play.seed}:${view.moveIndex}`)())
      : null

  const askTurn = !windowOpen && acting === 0 && kinds.includes('ask') && !finished
  // RULES_US54.md §4: the turn-holder whose own declare emptied their hand must pass to a
  // teammate with cards (RULES.md row 20, scoped to exactly this case). Reachable at this
  // table whenever the human banks a set that was entirely their own hand.
  const passTurn = !windowOpen && acting === 0 && kinds.includes('pass') && !finished
  const yours = askTurn || passTurn || game.declareOpen

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

  /** What the visible turn line reads. Not announced — see the header note. */
  const turnText = finished
    ? `Game over — ${winner === 0 ? 'your team' : 'team 1'} clinched.`
    : game.declareOpen
      ? game.mustDeclare
        ? 'You must declare — the dialog is open.'
        : 'Your declare offer — the dialog is open.'
      : askTurn
        ? 'Your turn. Pick an opponent and a card.'
        : passTurn
          ? 'You are out of cards. Pass the turn to a teammate.'
          : windowOpen
            ? `Declare window — the option is at ${seatName(acting, names)}.`
            : `${seatNameCap(acting, names)} is thinking…`

  /**
   * What a screen reader is actually told. Deliberately constant while the table plays itself:
   * it changes only when the human is owed a decision, which is the only change worth
   * interrupting for.
   */
  const announced = finished
    ? `Game over. ${winner === 0 ? 'Your team' : 'Team 1'} clinched at ${sets[0]} to ${sets[1]}.`
    : game.mustDeclare
      ? 'You must declare. The declare dialog is open.'
      : game.declareOpen
        ? 'You have a declare offer. The declare dialog is open.'
        : askTurn
          ? 'Your turn to ask. Choose an opponent and a card in the ask panel.'
          : passTurn
            ? 'You are out of cards. Pass the turn to a teammate.'
            : 'The other seats are playing.'

  return (
    <>
      <div className={s.score}>
        <div className={s.scoreTeam}>
          <Eyebrow tone="muted" track="legal">
            Team 0 · you, 2, 4
          </Eyebrow>
          <span className={cx(s.scoreNum, lead === 0 && s.scoreLead)}>{sets[0]}</span>
        </div>
        <span className={s.scoreDash} aria-hidden="true">
          –
        </span>
        <div className={s.scoreTeam}>
          <span className={cx(s.scoreNum, lead === 1 && s.scoreLead)}>{sets[1]}</span>
          <Eyebrow tone="muted" track="legal">
            Team 1 · seats 1, 3, 5
          </Eyebrow>
        </div>
        <span className={s.scoreMeta}>
          {unresolved} unresolved · first to 5 of 9 · seed {play.seed}
        </span>
      </div>

      {finished ? (
        <>
          <div className={s.over}>
            <p className={s.overVerdict}>
              {winner === 0 ? 'Your team clinches' : 'Team 1 clinches'} at{' '}
              {Math.max(sets[0], sets[1])} sets — {sets[0]}–{sets[1]} · {unresolved} unresolved.
            </p>
            <p className={s.overBody}>
              A clinched game always ends with sets unresolved and cards still in hand — the score
              above is complete, not truncated. Rematch replays the identical deal; a new game
              draws a fresh seed.
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
          <StyleMirror view={view} names={names} />
        </>
      ) : null}

      {/* The one live region on the surface. Visually hidden because the visible turn line
          below says the same thing louder; announcing both would say everything twice. */}
      <p className={s.srOnly} role="status">
        {announced}
      </p>

      <div className={s.surface}>
        <div>
          <p className={cx(s.turnLine, yours && s.turnLineYours)}>
            <span className={s.turnMark} aria-hidden="true" />
            {turnText}
          </p>

          <div className={s.tableRow}>
            <div className={s.tableCol}>
              <Seats
                view={view}
                lastMove={
                  lastEvent
                    ? describePlayEvent(lastEvent, names)
                    : 'The deal is done; play starts.'
                }
                acting={acting}
                windowOpen={windowOpen}
                turn={state.turn}
                finished={finished}
                names={names}
                policyLabelFor={(seat) => (seat === 0 ? 'You' : ADAPTIVE_LABEL)}
              />
            </div>

            <div className={s.actCol}>
              <Hand view={view} />
            </div>
          </div>

          {/* The action area gets the column's full width: the picker's rows are card chips,
              and squeezed into a third of it they wrapped into a two-thousand-pixel tower —
              which is the shape of the problem this whole surface was rebuilt to fix. */}
          <div className={s.act}>
            {askTurn ? <AskPanel view={view} onAsk={onAsk} names={names} /> : null}

            {passTurn ? (
              <section className={s.panel} aria-labelledby="pass-head">
                <h2 id="pass-head" className={s.panelHead}>
                  Pass the turn
                </h2>
                <p className={s.panelNote}>
                  Your declare emptied your hand, and the pass rule (row 20) is still in force in
                  exactly this case: hand the turn to a teammate who still holds cards. The
                  declare window re-opens on them.
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
                        {seatNameCap(seat, names)}
                        <span className={s.chipSub}>
                          {out ? 'out of cards' : `${view.counts[seat]} cards`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : null}

            {!yours && !finished ? (
              <p className={s.waiting}>
                Nothing is owed from you right now — the other seats are playing. Your ask panel
                reappears here the moment the turn comes back.
              </p>
            ) : null}
          </div>

          <div className={s.controls} role="group" aria-label="Table controls">
            {/* One label in both states, at the owner's word. The armed state is carried by
                `aria-pressed` for a screen reader and by `.toggleOn`'s full ground INVERSION
                for everyone else — a luminance flip, not a hue change, so it survives the
                same colour-blindness the seat ring's solid-vs-hatched bands were built for. */}
            <button
              type="button"
              className={cx(s.toggle, game.armed && s.toggleOn)}
              aria-pressed={game.armed}
              onClick={() => {
                game.setArmed(!game.armed)
              }}
            >
              Declare
            </button>

            <div className={s.paceGroup} role="group" aria-label="Table pace">
              <button
                type="button"
                className={cx(s.toggle, s.paceBtn, game.paused && s.toggleOn)}
                aria-pressed={game.paused}
                onClick={() => {
                  game.setPaused(!game.paused)
                }}
              >
                Pause
              </button>
              <label className={s.paceLabel} htmlFor="pace-seconds">
                Step every
              </label>
              <input
                id="pace-seconds"
                className={s.paceInput}
                type="number"
                inputMode="decimal"
                min={PACE_MIN}
                max={PACE_MAX}
                step={PACE_STEP}
                value={paceText}
                onChange={(event) => {
                  const text = event.target.value
                  setPaceText(text)
                  const n = Number(text)
                  if (text !== '' && Number.isFinite(n) && n >= PACE_MIN && n <= PACE_MAX)
                    game.setPaceSeconds(n)
                }}
                onBlur={() => {
                  // Snap the field back to what the table is actually running at, so a half-
                  // typed or out-of-range value never sits there claiming to be the setting.
                  setPaceText(String(game.paceSeconds))
                }}
              />
              <span className={s.paceLabel}>seconds</span>
              <button
                type="button"
                className={cx(s.toggle, s.paceBtn)}
                disabled={!game.paused || !game.canStep}
                onClick={game.step}
              >
                Step
              </button>
            </div>
          </div>
          <p className={s.controlNote}>You can declare after the next ask</p>

          {humanError ? (
            <p className={lab.disagree} role="alert">
              <strong>The engine refused that move</strong> — <code>{humanError.code}</code>:{' '}
              {humanError.message}
            </p>
          ) : null}

          {game.fault ? (
            <p className={lab.disagree} role="alert">
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
              seed={play.seed}
              names={names}
              active={!finished && acting === 0 && yours}
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
          {/*
            This used to promise "the whole information channel under row 17", which stopped being
            true the moment the two-ask view became the default — the reader would have been told
            they were seeing everything while looking at a deliberately restricted log. What row 17
            actually describes is what the *bots* read, and that is still worth saying, because the
            asymmetry is the point: they reason over the full channel whether or not you do.
          */}
          <p className={lab.figNote} style={{ margin: '10px 0 12px' }}>
            Every ask, every result, every declare. The bots reason over all of it under row 17;
            what you are shown depends on the view you choose below. Declines advance the window
            and emit nothing.
          </p>
          <PublicLog events={state.log} names={names} />
        </div>
      </div>

      {game.declareOpen ? (
        // Keyed per decision: a remount resets the dialog's book/assignment state, so a second
        // consecutive declare (a MUST_DECLARE that survives the first) never inherits the
        // first's placements. Unlike the ask panel, nothing outside the dialog holds focus
        // while it is open, so the remount costs a keyboard player nothing.
        <DeclareDialog
          key={state.moveIndex}
          view={view}
          mustDeclare={game.mustDeclare}
          advice={dialogAdvice}
          names={names}
          onDeclare={onDeclare}
          onStandDown={game.standDown}
        />
      ) : null}
    </>
  )
}
