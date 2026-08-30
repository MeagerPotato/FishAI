/**
 * The room before the deal: who is here, which side they are on, and what it is waiting for.
 *
 * ## Why waiting is a state and not an error
 *
 * A game needs all six seats because 54 cards divide evenly among six and among two or three, and
 * not among four or five — five players cannot be dealt at all. The owner asked for no bots, so
 * the room does not paper over the gap; it says how many people it is short and shows the empty
 * chairs. A lobby that reads as "3 of 6 · waiting for 3 more" is a room somebody will go and fetch
 * three people for. One that reads as an error is a room they close.
 *
 * ## Sides
 *
 * Every seat's team is `seatTeam(seat)` — the engine's, not a rule invented here — so choosing a
 * side is choosing which of that side's three seats you take. It stays changeable right up to the
 * deal, because the only reason to fix it earlier would be to save the server some work.
 */
import { useState } from 'react'
import type { Seat, Team } from '../../../lib/engine/index.ts'
import { teamSeats } from '../../../lib/engine/index.ts'
import { Button, cx } from '../../components/index.ts'
import { joinRoom } from './client.ts'
import { forgetToken } from './identity.ts'
import { TEAM_LABEL, type RoomRefusal, type RoomSnapshot } from './protocol.ts'
import { namesFrom } from './view.ts'
import s from './room.module.css'

export interface RoomLobbyProps {
  code: string
  token: string
  snapshot: RoomSnapshot
  busy: boolean
  /**
   * Is the push channel up? The lobby needs this more than the table does: a room nobody has
   * joined yet and a room whose socket died look EXACTLY alike here — five empty chairs — and a
   * player cannot tell "nobody has arrived" from "I stopped being told when they do". The table
   * at least has a log that visibly stops.
   */
  live: boolean
  /** Persisted-token warning: a browser that refused storage cannot survive a reload. */
  durable: boolean
  onSwitchTeam: (team: Team) => void
  onLeave: () => void
  onJoined: () => void
  onRefused: (refusal: RoomRefusal) => void
}

const SIDES: readonly Team[] = [0, 1]

export function RoomLobby({
  code,
  token,
  snapshot,
  busy,
  live,
  durable,
  onSwitchTeam,
  onLeave,
  onJoined,
  onRefused,
}: RoomLobbyProps) {
  const [name, setName] = useState('')
  const [side, setSide] = useState<Team | null>(null)
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null)

  const nameOf = namesFrom(snapshot.lobby)
  const taken = new Map<Seat, string>(snapshot.lobby.players.map((p) => [p.seat, p.name]))
  const seated = snapshot.seat !== null
  const missing = 6 - taken.size
  const shareUrl = `${window.location.origin}/play/room/${code}`

  const copyLink = () => {
    void navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setCopied('yes')
      })
      .catch(() => {
        // Clipboard access is refused in plenty of ordinary situations (an insecure origin, a
        // permission the user declined). The link is on the page either way, so this says which
        // happened rather than failing silently at a control that looked like it worked.
        setCopied('no')
      })
  }

  const takeSeat = async () => {
    setJoining(true)
    const result = await joinRoom({ token, code, name, team: side })
    setJoining(false)
    if (result.ok) onJoined()
    else onRefused(result.error)
  }

  return (
    <div className={s.lobbyGrid}>
      <section className={s.panel} aria-labelledby="invite-head">
        <h2 id="invite-head" className={s.panelHead}>
          The invitation
        </h2>
        <p className={s.panelNote}>
          Five other people need one of these two things. The code is the one you can read out; the
          link is the one you can send.
        </p>
        <p className={s.code} aria-label={`Room code: ${code.split('').join(' ')}`}>
          {code}
        </p>
        <div className={s.panelActions}>
          <input className={cx(s.input, s.shareInput)} type="text" readOnly value={shareUrl} aria-label="Link to this room" />
          <Button variant="line" arrow={false} onClick={copyLink}>
            Copy link
          </Button>
        </div>
        {copied === 'yes' ? <p className={s.panelNote}>Copied.</p> : null}
        {copied === 'no' ? (
          <p className={s.panelNote}>
            This browser would not let the page reach the clipboard. Select the link above and copy
            it yourself.
          </p>
        ) : null}
      </section>

      <section className={s.panel} aria-labelledby="table-head">
        <h2 id="table-head" className={s.panelHead}>
          {taken.size} of 6 seated
        </h2>
        <p className={s.panelNote}>
          {missing === 0
            ? 'All six seats are taken. Dealing now.'
            : `Waiting for ${missing} more ${missing === 1 ? 'player' : 'players'}. A hand is nine cards and the deck is 54, so a game needs all six at once — and this table has no bots to stand in.`}
          {live
            ? ''
            : ' The live connection is down, so this page is asking for updates every few seconds instead — new arrivals will show up a moment late.'}
        </p>

        <div className={s.sides}>
          {SIDES.map((team) => (
            <div key={team} className={s.side}>
              <h3 className={s.sideName}>
                {TEAM_LABEL[team]}
                <span className={s.sideSeats}>seats {teamSeats(team).join(', ')}</span>
              </h3>
              <ul className={s.sideList}>
                {teamSeats(team).map((seat) => {
                  const who = taken.get(seat)
                  const isYou = seat === snapshot.seat
                  return (
                    <li key={seat} className={cx(s.sideSeat, who === undefined && s.sideSeatEmpty, isYou && s.sideSeatYou)}>
                      <span className={s.sideSeatWho}>{who ?? 'Empty'}</span>
                      <span className={s.sideSeatMeta}>
                        Seat {seat}
                        {isYou ? ' · you' : ''}
                        {snapshot.lobby.hostSeat === seat ? ' · set the pace' : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        <p className={s.panelNote}>
          This room plays a step every {snapshot.paceMs === 0 ? 'moment — no wait between moves' : `${snapshot.paceMs / 1000}s`}
          {snapshot.lobby.hostSeat === null ? '' : `, set by ${nameOf(snapshot.lobby.hostSeat)}`}.
        </p>
      </section>

      {seated ? (
        <section className={s.panel} aria-labelledby="your-seat-head">
          <h2 id="your-seat-head" className={s.panelHead}>
            Your seat
          </h2>
          <p className={s.panelNote}>
            You are {nameOf(snapshot.seat as Seat)} in seat {snapshot.seat}, playing{' '}
            {TEAM_LABEL[((snapshot.seat as Seat) % 2) as Team]}. You can change sides until the cards
            are dealt.
          </p>
          {!durable ? (
            <p className={s.warn}>
              This browser would not store your seat, so reloading this page will lose it. Keep the
              tab open.
            </p>
          ) : null}
          <div className={s.choiceRow} role="group" aria-label="Change sides">
            {SIDES.map((team) => {
              const mine = ((snapshot.seat as Seat) % 2) === team
              const full = teamSeats(team).every((seat) => taken.has(seat)) && !mine
              return (
                <button
                  key={team}
                  type="button"
                  className={cx(s.chip, mine && s.chipOn)}
                  aria-pressed={mine}
                  disabled={busy || mine || full}
                  onClick={() => {
                    onSwitchTeam(team)
                  }}
                >
                  {TEAM_LABEL[team]}
                  <span className={s.chipSub}>{mine ? 'your side' : full ? 'full' : 'switch here'}</span>
                </button>
              )
            })}
          </div>
          <div className={s.panelActions}>
            <Button
              variant="line"
              arrow={false}
              onClick={() => {
                forgetToken(code)
                onLeave()
              }}
            >
              Leave this room
            </Button>
          </div>
        </section>
      ) : (
        <section className={s.panel} aria-labelledby="take-seat-head">
          <h2 id="take-seat-head" className={s.panelHead}>
            Take a seat
          </h2>
          <p className={s.panelNote}>
            {missing === 0
              ? 'Every seat here is taken. A table is exactly six.'
              : 'Give a name the others will recognise, and pick a side.'}
          </p>
          <label className={s.field}>
            <span className={s.fieldLabel}>Your name</span>
            <input
              className={s.input}
              type="text"
              value={name}
              maxLength={24}
              autoComplete="nickname"
              placeholder="Bo"
              disabled={missing === 0}
              onChange={(e) => {
                setName(e.target.value)
              }}
            />
          </label>
          <div className={s.choiceRow} role="group" aria-label="Which side to play on">
            {[null, ...SIDES].map((team) => {
              const full = team !== null && teamSeats(team).every((seat) => taken.has(seat))
              return (
                <button
                  key={String(team)}
                  type="button"
                  className={cx(s.chip, team === side && s.chipOn)}
                  aria-pressed={team === side}
                  disabled={full || missing === 0}
                  onClick={() => {
                    setSide(team)
                  }}
                >
                  {team === null ? 'Either' : TEAM_LABEL[team]}
                  <span className={s.chipSub}>
                    {team === null
                      ? 'first free seat'
                      : full
                        ? 'full'
                        : `${teamSeats(team).filter((seat) => !taken.has(seat)).length} free`}
                  </span>
                </button>
              )
            })}
          </div>
          <div className={s.panelActions}>
            <button
              type="button"
              className={cx(s.submit, (joining || missing === 0) && s.submitOff)}
              disabled={joining || missing === 0}
              onClick={() => {
                void takeSeat()
              }}
            >
              {missing === 0 ? 'This room is full' : joining ? 'Sitting down…' : 'Sit down'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
