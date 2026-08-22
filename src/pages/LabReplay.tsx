/**
 * `/lab/replay/:id` — one stored game, replayed through `reduce()` one action at a time.
 *
 * SITE_SPEC.md §1: *"Replays a stored game through `reduce()` step by step, with the public log
 * and per-seat counts."*
 *
 * The artifact stores a seed, a starting seat and a `GameAction[]` — no states (BOT_LAB.md
 * §7.1). Every frame on this page is reconstructed by running the shipped reducer over that
 * list, and only the PUBLIC projection is kept: `publicView` is the same function the live table
 * uses and it exposes no hand card identity, so the reader sees exactly what a seat would have
 * seen plus the per-seat counts row 17 makes public. If the stored actions ever stopped being
 * legal against the current engine, the page would print the engine's own error at the step it
 * happened rather than quietly truncating.
 *
 * A `us54` game spends most of its moves in the declare window — six seats are offered the
 * option after every action resolves, and declining is a real move. That is why the controls
 * distinguish "next step" from "next material move": stepping one action at a time through 400
 * declines teaches nothing, and hiding them would misrepresent what the engine did.
 */

import { useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Eyebrow, Hairline, Section, SectionHead, TextLink } from '../components/index.ts'
import { caseFromSearch, styleLabel } from '../lab/artifact.ts'
import { count } from '../lab/format.ts'
import { labModel } from '../lab/model.ts'
import { describeAction, describeEvent, replayGame, teamOf } from '../lab/replay.ts'
import { shortHash } from '../lab/rules.ts'
import { LabShell, withCase } from '../lab/ui/LabShell.tsx'
import { ArtifactBroken, ReplayNotFound, RulesMismatch } from '../lab/ui/Refusal.tsx'
import { RuleStamp, SyntheticNotice, Us54Facts } from '../lab/ui/RuleStamp.tsx'
import s from '../lab/ui/lab.module.css'

const SEATS = [0, 1, 2, 3, 4, 5] as const

function Control({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button className={s.pill} type="button" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  )
}

export function LabReplay() {
  const { search } = useLocation()
  const { id = '' } = useParams<{ id: string }>()
  const which = caseFromSearch(search)
  const model = labModel(which)

  const record = model.ok ? model.artifact.replays.find((r) => r.id === id) : undefined
  // Not hand-memoised: `replayGame` is pure and the React Compiler caches it for us, whereas a
  // `useMemo` here is manual memoization the compiler cannot prove safe and therefore refuses to
  // preserve — it would opt this whole component out of compilation to keep one cheap call.
  const replay = record ? replayGame(record) : null
  const [step, setStep] = useState(0)

  if (!model.ok) {
    return (
      <ArtifactBroken which={which} current="/lab/replay" file={model.file} detail={model.detail} />
    )
  }
  if (!model.check.ok) {
    return <RulesMismatch which={which} current="/lab/replay" check={model.check} />
  }

  const { artifact, check } = model
  if (!record || !replay) {
    return (
      <ReplayNotFound which={which} id={id} available={artifact.replays.map((r) => r.id)} />
    )
  }

  const last = replay.frames.length - 1
  const at = Math.min(step, last)
  const frame = replay.frames[at]
  const { view } = frame

  const prevMaterial = [...replay.material].reverse().find((m) => m < at) ?? 0
  const nextMaterial = replay.material.find((m) => m > at) ?? last

  // Newest first, so the action you just stepped to is always the top row and the list never
  // needs to be scrolled programmatically.
  const logRows = replay.frames
    .slice(0, at + 1)
    .flatMap((f) => f.events.map((event, i) => ({ key: `${f.step}-${i}`, step: f.step, event })))
    .reverse()

  return (
    <LabShell
      current={withCase(`/lab/replay/${record.id}`, which)}
      which={which}
      ground="dots"
      stamp={`us54 · rulesHash ${shortHash(artifact.meta.rulesHash)}`}
    >
      <Section noRule badge="Replay">
        <SectionHead
          level="h1"
          lines={['One deal,', 'replayed through *reduce()*.']}
          sub={record.caption}
        />
        <RuleStamp artifact={artifact} check={check} />
        <SyntheticNotice artifact={artifact} />

        <div className={s.scroll}>
          <table className={s.table}>
            <caption>The stored record · actions, not states</caption>
            <thead>
              <tr>
                <th scope="col">Id</th>
                <th scope="col">Pairing</th>
                <th scope="col">Seed</th>
                <th scope="col">Start seat</th>
                <th scope="col">Actions</th>
                <th scope="col">Material moves</th>
                <th scope="col">Final sets</th>
                <th scope="col">Unresolved</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{record.id}</th>
                <td style={{ textAlign: 'left' }}>
                  {styleLabel(artifact, record.pairing[0])} vs{' '}
                  {styleLabel(artifact, record.pairing[1])}
                </td>
                <td style={{ textAlign: 'left' }}>{record.seed}</td>
                <td>{record.startSeat}</td>
                <td>{count(record.actions.length)}</td>
                <td>{count(replay.material.length)}</td>
                <td>
                  {record.sets[0]}–{record.sets[1]}
                </td>
                <td>{record.unresolved}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {artifact.replays.length > 1 ? (
          <p className={s.figNote}>
            Other stored replays:{' '}
            {artifact.replays
              .filter((r) => r.id !== record.id)
              .map((r) => (
                <TextLink key={r.id} href={withCase(`/lab/replay/${r.id}`, which)} arrow={false}>
                  {r.id}
                </TextLink>
              ))}
          </p>
        ) : null}
      </Section>

      {/* ---- the stepper ------------------------------------------------------------------ */}
      <Section badge="Step">
        <div className={s.controls}>
          <Control label="⏮ Deal" onClick={() => setStep(0)} disabled={at === 0} />
          <Control
            label="◀◀ Prev material"
            onClick={() => setStep(prevMaterial)}
            disabled={at === 0}
          />
          <Control label="◀ Prev" onClick={() => setStep(Math.max(0, at - 1))} disabled={at === 0} />
          <Control
            label="Next ▶"
            onClick={() => setStep(Math.min(last, at + 1))}
            disabled={at === last}
          />
          <Control
            label="Next material ▶▶"
            onClick={() => setStep(nextMaterial)}
            disabled={at === last}
          />
          <Control label="End ⏭" onClick={() => setStep(last)} disabled={at === last} />
        </div>

        <label className={s.stepLine} htmlFor="replay-scrub">
          Step {at} of {last} · move index {view.moveIndex} · phase {view.phase}
        </label>
        <input
          id="replay-scrub"
          className={s.scrub}
          type="range"
          min={0}
          max={last}
          value={at}
          onChange={(event) => setStep(Number(event.target.value))}
        />

        <p className={s.stepAction} style={{ marginTop: 22 }}>
          {describeAction(frame.action)}
        </p>
        <p className={s.figNote}>
          {frame.events.length === 0
            ? 'This action emitted no public event — a decline advances the declare window and nothing else.'
            : frame.events.map(describeEvent).join(' ')}
        </p>

        {replay.error ? (
          <p className={s.disagree}>
            <strong>The stored action list stopped being legal at step {replay.error.step}.</strong>{' '}
            The engine returned <code>{replay.error.engine.code}</code>:{' '}
            {replay.error.engine.message}. The replay is truncated there. This means the artifact
            and the engine have drifted apart — re-emit the artifact rather than editing the log.
          </p>
        ) : null}

        <Hairline variant="soft" />

        {/* ---- per-seat counts ----------------------------------------------------------- */}
        <Eyebrow tone="muted" track="head" as="h2">
          Per-seat card counts
        </Eyebrow>
        <p className={s.figNote} style={{ margin: '10px 0 18px' }}>
          Counts are public under row 17; card identities never are, and this page never has
          them. Team 0 is seats 0/2/4, team 1 is seats 1/3/5.
        </p>
        <div className={s.seats}>
          {SEATS.map((seat) => {
            const active = view.declareWindow ? view.declareWindow.option === seat : view.turn === seat
            return (
              <div key={seat} className={`${s.seat} ${active ? s.seatOn : ''}`}>
                <span className={s.seatMeta}>
                  Seat {seat} · team {teamOf(seat)}
                </span>
                <span className={s.seatCount} data-numeric>
                  {view.counts[seat]}
                </span>
                <span className={s.seatMeta}>
                  {styleLabel(artifact, record.seatStyles[seat] ?? '')}
                </span>
                <span className={s.seatMeta}>
                  {view.declareWindow?.option === seat
                    ? 'declare option'
                    : view.turn === seat
                      ? 'turn holder'
                      : ' '}
                </span>
              </div>
            )
          })}
        </div>

        <div className={s.scroll} style={{ marginTop: 24 }}>
          <table className={s.table}>
            <caption>Position at this step</caption>
            <thead>
              <tr>
                <th scope="col">Sets — team 0</th>
                <th scope="col">Sets — team 1</th>
                <th scope="col">Unresolved</th>
                <th scope="col">Points</th>
                <th scope="col">Phase</th>
                <th scope="col">Turn</th>
                <th scope="col">Declare window</th>
                <th scope="col">Declines</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{frame.sets[0]}</td>
                <td>{frame.sets[1]}</td>
                <td>{frame.unresolved}</td>
                <td>
                  {view.score[0]}–{view.score[1]}
                </td>
                <td>{view.phase}</td>
                <td>{view.turn}</td>
                <td>{view.declareWindow ? `open at seat ${view.declareWindow.option}` : 'closed'}</td>
                <td>{view.declareWindow ? view.declareWindow.declined : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className={s.figNote}>
          The clinch counts <strong>sets</strong>, not points. A clinched us54 game always
          finishes with sets unresolved and cards still in hand, so the score is reported as{' '}
          {frame.sets[0]}–{frame.sets[1]} · {frame.unresolved} unresolved rather than as a bare
          pair of numbers, which would read as a completed nine-set game.
        </p>
      </Section>

      {/* ---- resolved sets --------------------------------------------------------------- */}
      <Section badge="Sets">
        <Eyebrow tone="muted" track="head" as="h2">
          Sets resolved so far
        </Eyebrow>
        {Object.keys(view.books).length === 0 ? (
          <p className={s.figNote} style={{ marginTop: 14 }}>
            No set has been declared yet.
          </p>
        ) : (
          <div className={s.scroll} style={{ marginTop: 14 }}>
            <table className={s.table}>
              <caption>
                Every resolved set goes to exactly one team — row 14 abolished the void outcome
              </caption>
              <thead>
                <tr>
                  <th scope="col">Set</th>
                  <th scope="col">Declared by</th>
                  <th scope="col">Awarded to</th>
                  <th scope="col">Correct</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(view.books).map(([book, result]) =>
                  result ? (
                    <tr key={book}>
                      <th scope="row">{book}</th>
                      <td>seat {result.claimer}</td>
                      <td>{result.outcome}</td>
                      <td>
                        {result.outcome === `team${teamOf(result.claimer)}` ? 'yes' : 'no — conceded'}
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ---- the public log --------------------------------------------------------------- */}
      <Section badge="Public log">
        <Eyebrow tone="muted" track="head" as="h2">
          The public log, newest first
        </Eyebrow>
        <p className={s.figNote} style={{ margin: '10px 0 18px' }}>
          {count(logRows.length)} event{logRows.length === 1 ? '' : 's'} through step {at}. This is
          the whole information channel under row 17 — every ask, every result, every declare, and
          nothing else. It is what a bot at this table can see, and it is what the inference
          engine reasons over.
        </p>
        <ol className={s.log}>
          {logRows.map((row) => (
            <li key={row.key} className={`${s.logRow} ${row.step === at ? s.logNow : ''}`}>
              <span className={s.logIx}>{String(row.step).padStart(3, '0')}</span>
              <span>{describeEvent(row.event)}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section badge="Rule set" noMarks>
        <Eyebrow tone="muted" track="head" as="h2">
          Two things about us54 that this replay depends on
        </Eyebrow>
        <div style={{ marginTop: 20 }}>
          <Us54Facts />
        </div>
      </Section>
    </LabShell>
  )
}

export default LabReplay
