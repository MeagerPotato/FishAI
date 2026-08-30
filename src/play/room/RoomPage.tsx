/**
 * `/play/room` and `/play/room/:code` — a table shared by six people instead of one person and
 * five bots.
 *
 * The route seam this replaces recorded the contract, and it is kept:
 *
 *  - `/play/room` with no code creates or joins; `/play/room/:code` is the shareable link, and
 *    the code in the URL is the whole invitation.
 *  - Six seats, no bots. Below six, players pick a side; the deal needs all six, because 54 cards
 *    divide evenly among 6 and not among 4 or 5.
 *  - The authority is the `room` Edge Function running lib/engine — the same reducer this site
 *    has always used. The browser never holds anyone else's hand, because `rooms` carries
 *    publicView() and hands live in `room_private`, which anon cannot read at all.
 *
 * This file is the router between the three states a room can be in — no code, waiting for six,
 * playing — and owns nothing else. The state itself lives in `useRoom`, the transport in
 * `client.ts`, and every rule in the Edge Function.
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Section, SectionHead } from '../../components/index.ts'
import { LabShell } from '../../lab/ui/LabShell.tsx'
import { identityFor } from './identity.ts'
import { normalizeCode, type RoomRefusal } from './protocol.ts'
import { RoomLobby } from './RoomLobby.tsx'
import { RoomStart } from './RoomStart.tsx'
import { RoomTable } from './RoomTable.tsx'
import { useRoom } from './useRoom.ts'
import s from './room.module.css'

/** The shell every room state sits in, so the chrome does not blink between them. */
function RoomShell({ badge, lines, sub, children }: {
  badge: string
  lines: string[]
  sub: string
  children: React.ReactNode
}) {
  return (
    <LabShell current="/play" docTitle="Room" ground="dots" stamp="us54 · shared table" which="v2">
      <Section noRule badge={badge}>
        <SectionHead level="h1" lines={lines} sub={sub} />
        {children}
      </Section>
    </LabShell>
  )
}

/** `/play/room` — no code yet. */
function StartSurface() {
  return (
    <RoomShell
      badge="Room"
      lines={['A table for six,', '*no bots*.']}
      sub="Open a room and send the code, or take a seat in one somebody sent you. The cards are dealt when all six seats are full."
    >
      <RoomStart />
    </RoomShell>
  )
}

/** `/play/room/:code` — everything from here on has a room to talk about. */
function CodeSurface({ code }: { code: string }) {
  // Minted on first sight of this room and kept in localStorage, so a reload comes back to the
  // same seat with the same hand. Per-room rather than per-browser: two tabs of one browser are
  // two players, which is exactly how a person sets up a game for the room they are sitting in.
  const { token, durable } = identityFor(code)
  const room = useRoom(code, token)
  // The lobby's own join refusal. It is held here rather than pushed into the hook because the
  // hook clears its refusal on every successful sync — and a sync is exactly what follows a failed
  // join, so "that side is full" would be wiped out by the poll that was meant to show it.
  const [joinRefusal, setJoinRefusal] = useState<RoomRefusal | null>(null)
  const { snapshot, loading } = room
  const refusal = joinRefusal ?? room.refusal

  if (loading && snapshot === null) {
    return (
      <RoomShell badge={`Room ${code}`} lines={['Finding', '*the room*.']} sub="One moment.">
        <p className={s.panelNote} role="status">
          Looking up {code}.
        </p>
      </RoomShell>
    )
  }

  if (snapshot === null) {
    const shown: RoomRefusal = refusal ?? {
      code: 'NO_SUCH_ROOM',
      message: 'There is no room under that code. Codes belong to one room and do not outlive it.',
    }
    return (
      <RoomShell
        badge={`Room ${code}`}
        lines={['That room', '*is not there*.']}
        sub="A code names one room, and only while it lasts."
      >
        <div className={s.refusal} role="alert">
          <span className={s.refusalCode}>{shown.code}</span>
          <p className={s.refusalText}>{shown.message}</p>
        </div>
        <p className={s.panelNote}>
          <a className={s.link} href="/play/room">
            Open a room of your own, or join another with its code.
          </a>
        </p>
      </RoomShell>
    )
  }

  if (snapshot.status === 'lobby') {
    const seated = snapshot.seat !== null
    return (
      <RoomShell
        badge={`Room ${code}`}
        lines={seated ? ['Waiting for', '*six*.'] : ['A seat', '*is open*.']}
        sub={
          seated
            ? 'Send the code to five people. The moment the sixth sits down, the cards are dealt.'
            : 'Give a name, pick a side, and sit down.'
        }
      >
        {refusal ? (
          <div className={s.refusal} role="alert">
            <span className={s.refusalCode}>{refusal.code}</span>
            <p className={s.refusalText}>{refusal.message}</p>
          </div>
        ) : null}
        <RoomLobby
          code={code}
          token={token}
          snapshot={snapshot}
          busy={room.busy}
          live={room.live}
          durable={durable}
          onSwitchTeam={(team) => {
            void room.switchTeam(team)
          }}
          onLeave={() => {
            void room.leave()
          }}
          onJoined={() => {
            setJoinRefusal(null)
            room.refresh()
          }}
          onRefused={setJoinRefusal}
        />
      </RoomShell>
    )
  }

  return (
    <RoomShell
      badge={`Room ${code}`}
      lines={snapshot.status === 'finished' ? ['The game', '*is done*.'] : ['Six hands,', '*one table*.']}
      sub={
        snapshot.seat === null
          ? 'You are watching this table. What you can see is what anybody sitting at it can see — counts, the log, the score, and no hands.'
          : 'Your hand is yours alone. Nobody else’s browser was ever sent it.'
      }
    >
      <RoomTable
        snapshot={snapshot}
        refusal={refusal}
        busy={room.busy}
        live={room.live}
        paceLeftMs={room.paceLeftMs}
        onPlay={(move) => {
          void room.play(move)
        }}
        onDismissRefusal={room.dismissRefusal}
        onRefresh={room.refresh}
      />
    </RoomShell>
  )
}

export function RoomPage() {
  const params = useParams<{ code?: string }>()
  const raw = params.code
  const code = raw === undefined ? null : normalizeCode(raw)

  if (raw !== undefined && code === null) {
    return (
      <RoomShell
        badge="Room"
        lines={['That is not', '*a code*.']}
        sub="Six characters, digits 2 to 9 and letters, with no I and no O."
      >
        <p className={s.panelNote}>
          <a className={s.link} href="/play/room">
            Open a room, or join one with a code that is.
          </a>
        </p>
      </RoomShell>
    )
  }

  return code === null ? <StartSurface /> : <CodeSurface code={code} />
}

export default RoomPage
