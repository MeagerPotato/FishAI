/**
 * `/play/room` with no code — the two ways into a shared table.
 *
 * Starting one and joining one are the same size on this page, deliberately. Five of the six
 * people who use this feature arrive holding a code somebody read out to them, so the join field
 * is not a footnote under the create form; it is the other half of the page.
 *
 * The pace is set here and nowhere else, because it is a property of the room rather than of a
 * player: the person who starts the table decides how fast it advances, and the other five inherit
 * it. What it does is stated in the control rather than left to be discovered — a floor between
 * moves, so nobody is left reading a log that has already moved past them.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Team } from '../../../lib/engine/index.ts'
import { teamSeats } from '../../../lib/engine/index.ts'
import { Button, cx } from '../../components/index.ts'
import { createRoom, joinRoom } from './client.ts'
import { provisionalIdentity, rememberToken } from './identity.ts'
import { normalizeCode, TEAM_LABEL, type RoomRefusal } from './protocol.ts'
import s from './room.module.css'

/**
 * The pace choices, in seconds. Zero is "as fast as people can click", which is the right answer
 * for six people in one room shouting at each other and the wrong one for six people on a call.
 */
const PACES: readonly { seconds: number; label: string }[] = [
  { seconds: 0, label: 'No wait' },
  { seconds: 1, label: '1s' },
  { seconds: 2, label: '2s' },
  { seconds: 3, label: '3s' },
  { seconds: 5, label: '5s' },
]

type Side = Team | null

function sideOptions(): { value: Side; label: string; detail: string }[] {
  return [
    { value: null, label: 'Either', detail: 'first free seat' },
    { value: 0, label: TEAM_LABEL[0], detail: `seats ${teamSeats(0).join(', ')}` },
    { value: 1, label: TEAM_LABEL[1], detail: `seats ${teamSeats(1).join(', ')}` },
  ]
}

export function RoomStart() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [side, setSide] = useState<Side>(null)
  const [paceSeconds, setPaceSeconds] = useState(3)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<RoomRefusal | null>(null)

  const start = async () => {
    setBusy(true)
    setRefusal(null)
    const token = provisionalIdentity()
    const result = await createRoom({ token, name, team: side, paceMs: paceSeconds * 1000 })
    setBusy(false)
    if (!result.ok) {
      setRefusal(result.error)
      return
    }
    if (result.code === undefined) {
      setRefusal({ code: 'BAD_RESPONSE', message: 'The room was created but the server sent no code back.' })
      return
    }
    // Bind the token to the code BEFORE navigating: the room page reads it at mount, and a token
    // that is not stored by then is a creator who has locked themselves out of their own room.
    rememberToken(result.code, token)
    void navigate(`/play/room/${result.code}`)
  }

  const join = async () => {
    const normalized = normalizeCode(code)
    if (normalized === null) {
      setRefusal({
        code: 'BAD_CODE',
        message: 'A room code is six characters — digits 2 to 9 and letters, with no I and no O.',
      })
      return
    }
    setBusy(true)
    setRefusal(null)
    const token = provisionalIdentity()
    const result = await joinRoom({ token, code: normalized, name, team: side })
    setBusy(false)
    if (!result.ok) {
      setRefusal(result.error)
      return
    }
    rememberToken(normalized, token)
    void navigate(`/play/room/${normalized}`)
  }

  return (
    <div className={s.startGrid}>
      <section className={s.panel} aria-labelledby="who-head">
        <h2 id="who-head" className={s.panelHead}>
          Who are you?
        </h2>
        <p className={s.panelNote}>
          The name the other five see on your seat and in the log. Leave it blank and you are
          &ldquo;Player&nbsp;N&rdquo; — which works, and makes for a duller game.
        </p>
        <label className={s.field}>
          <span className={s.fieldLabel}>Your name</span>
          <input
            className={s.input}
            type="text"
            value={name}
            maxLength={24}
            autoComplete="nickname"
            placeholder="Ada"
            onChange={(e) => {
              setName(e.target.value)
            }}
          />
        </label>

        <h3 className={s.step}>Which side?</h3>
        <p className={s.panelNote}>
          Teams alternate around the table: {TEAM_LABEL[0]} are seats {teamSeats(0).join(', ')} and{' '}
          {TEAM_LABEL[1]} are seats {teamSeats(1).join(', ')}. Picking a side picks a free seat on
          it. You can still change sides in the lobby, until the cards are dealt.
        </p>
        <div className={s.choiceRow} role="group" aria-label="Which side to play on">
          {sideOptions().map((option) => (
            <button
              key={String(option.value)}
              type="button"
              className={cx(s.chip, option.value === side && s.chipOn)}
              aria-pressed={option.value === side}
              onClick={() => {
                setSide(option.value)
              }}
            >
              {option.label}
              <span className={s.chipSub}>{option.detail}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={s.panel} aria-labelledby="start-head">
        <h2 id="start-head" className={s.panelHead}>
          Start a room
        </h2>
        <p className={s.panelNote}>
          You get a six-character code and a link to send. The game deals itself the moment all six
          seats are taken — there are no bots at this table, so it waits for six people.
        </p>

        <h3 className={s.step}>Pace</h3>
        <p className={s.panelNote}>
          The shortest time between two moves landing. It gives the other five a beat to read what
          just happened before the table moves again. Declining a declare is never held back — only
          the moves that produce something to read.
        </p>
        <div className={s.choiceRow} role="group" aria-label="Seconds between moves">
          {PACES.map((pace) => (
            <button
              key={pace.seconds}
              type="button"
              className={cx(s.chip, pace.seconds === paceSeconds && s.chipOn)}
              aria-pressed={pace.seconds === paceSeconds}
              onClick={() => {
                setPaceSeconds(pace.seconds)
              }}
            >
              {pace.label}
            </button>
          ))}
        </div>

        <div className={s.panelActions}>
          <button
            type="button"
            className={cx(s.submit, busy && s.submitOff)}
            disabled={busy}
            onClick={() => {
              void start()
            }}
          >
            {busy ? 'Opening the room…' : 'Open a room and get a code'}
          </button>
        </div>
      </section>

      <section className={s.panel} aria-labelledby="join-head">
        <h2 id="join-head" className={s.panelHead}>
          Join a room
        </h2>
        <p className={s.panelNote}>
          Six characters. Case does not matter, and neither do spaces or dashes — a code is meant
          to survive being read out loud.
        </p>
        <label className={s.field}>
          <span className={s.fieldLabel}>Room code</span>
          <input
            className={cx(s.input, s.codeInput)}
            type="text"
            value={code}
            maxLength={12}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="7KQ4MP"
            onChange={(e) => {
              setCode(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void join()
            }}
          />
        </label>
        <div className={s.panelActions}>
          <button
            type="button"
            className={cx(s.submit, busy && s.submitOff)}
            disabled={busy}
            onClick={() => {
              void join()
            }}
          >
            {busy ? 'Finding the room…' : 'Take a seat'}
          </button>
        </div>
      </section>

      {refusal ? (
        <div className={s.refusal} role="alert">
          <span className={s.refusalCode}>{refusal.code}</span>
          <p className={s.refusalText}>{refusal.message}</p>
          <Button
            variant="line"
            arrow={false}
            onClick={() => {
              setRefusal(null)
            }}
          >
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  )
}
