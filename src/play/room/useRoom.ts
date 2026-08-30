/**
 * One room, kept current.
 *
 * ## The update path, and why it has two halves
 *
 * A move commits on the server, the `rooms` row changes, and Supabase pushes that change to every
 * subscribed client. The push carries `publicView` output and no hands — deliberately, since it
 * travels to all six browsers — so it is used as a DOORBELL: the hook hears it and asks the
 * function for its own `seatView`. The cost is one round trip per move; what it buys is that no
 * browser is ever sent a hand that is not its own, which is the property the whole feature exists
 * to demonstrate.
 *
 * ## Why it also polls
 *
 * Only while the socket is down. A WebSocket that failed to connect looks, on screen, exactly
 * like a table where nobody has moved yet — and a player who cannot tell those apart will sit
 * waiting for a game that is already three asks ahead. So when `live` is false the hook falls
 * back to asking, and the surface says which of the two it is doing.
 *
 * ## No hand-memoization
 *
 * React 19 with the compiler: the action functions below are rebuilt every render on purpose and
 * that is fine, because they are handed to event handlers rather than to effects. Everything an
 * effect depends on is a primitive or a state setter, so nothing here needs a stable identity to
 * avoid a resubscribe loop.
 */
import { useEffect, useState } from 'react'
import type { Team } from '../../../lib/engine/index.ts'
import { act, chooseTeam, leaveRoom, syncRoom, watchRoom } from './client.ts'
import type { RoomMove, RoomRefusal, RoomSnapshot } from './protocol.ts'

/** How often to ask, when the socket is not telling us. */
const POLL_MS = 2500

export interface UseRoom {
  snapshot: RoomSnapshot | null
  /** The last refusal, whether from a rule, a race, or the network. Cleared on the next success. */
  refusal: RoomRefusal | null
  /** True until the first answer arrives — the difference between "empty" and "not asked yet". */
  loading: boolean
  /** Is the push channel actually up? False means the hook is polling instead. */
  live: boolean
  /** True while one of this player's own actions is in flight. */
  busy: boolean
  /** Milliseconds until this room will accept the next paced action, counted down locally. */
  paceLeftMs: number
  play: (move: RoomMove) => Promise<void>
  switchTeam: (team: Team) => Promise<void>
  leave: () => Promise<void>
  dismissRefusal: () => void
  /** Ask again now — the manual door out of any stuck state. */
  refresh: () => void
}

export function useRoom(code: string | null, token: string | null): UseRoom {
  // The snapshot is stored WITH the moment it arrived, because the pace countdown below needs
  // both: the server sends a remaining duration rather than a timestamp (no browser clock is
  // involved in deciding it), and a duration only means something measured from when it was said.
  const [received, setReceived] = useState<{ room: RoomSnapshot; at: number } | null>(null)
  const [refusal, setRefusal] = useState<RoomRefusal | null>(null)
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // Bumped to re-run the fetch effect: by a Realtime push, by the poll, or by hand.
  const [tick, setTick] = useState(0)

  const snapshot = received?.room ?? null

  /** Record an answer. One place, so `at` can never be forgotten on some other path. */
  const take = (room: RoomSnapshot): void => {
    setReceived({ room, at: Date.now() })
    setRefusal(null)
  }

  // The read path. Re-runs on the code, on this browser's token (a fresh join changes it), and on
  // every tick. An in-flight request is aborted when any of those change, so a slow answer to an
  // old question can never overwrite a newer one.
  useEffect(() => {
    if (code === null) return
    const controller = new AbortController()
    let cancelled = false

    void syncRoom({ code, token }, { signal: controller.signal }).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setReceived({ room: result.room, at: Date.now() })
        setRefusal(null)
      } else if (result.error.code !== 'ABORTED') {
        setRefusal(result.error)
      }
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [code, token, tick])

  // The push channel. Keyed on the room id rather than the whole snapshot, so an ordinary state
  // update does not tear the subscription down and build it again.
  const roomId = snapshot?.roomId ?? null
  useEffect(() => {
    if (roomId === null) return
    return watchRoom(
      roomId,
      () => {
        setTick((n) => n + 1)
      },
      setLive,
    )
  }, [roomId])

  // The fallback, and only while the socket is down. A finished room has nothing further to say,
  // so it is left alone rather than polled forever in a tab somebody forgot to close.
  const finished = snapshot?.status === 'finished'
  useEffect(() => {
    if (live || code === null || finished) return
    const id = window.setInterval(() => {
      setTick((n) => n + 1)
    }, POLL_MS)
    return () => {
      window.clearInterval(id)
    }
  }, [live, code, finished])

  // The pace, DERIVED rather than stored. What the server sent is a remaining DURATION, so the
  // wait left is that duration minus however long the answer has been sitting here. Storing the
  // remaining milliseconds instead would have meant setting state from inside an effect on every
  // snapshot — a cascading render, and a countdown that drifts, since "subtract 100 every 100ms"
  // accumulates every late timer.
  //
  // `now` is a piece of state that only the interval below moves, and it only runs while there is
  // actually a wait to count down. So `now` is routinely OLDER than the snapshot: an idle tab
  // stops ticking, and the next answer arrives minutes later. The elapsed time is therefore
  // clamped at zero rather than allowed to go negative.
  //
  // Writing this as `deadline - now` instead is what the first version did, and it was wrong in
  // exactly that case: with a paceRemainingMs of 0 the deadline is the arrival time, so the
  // expression returned `arrival - mountTime` — the AGE OF THE TAB. A room created with "no wait"
  // told a player who had been sitting on the page two minutes to wait 117.6 seconds, and the
  // number grew for as long as the tab stayed open.
  const paceLeftMs =
    received === null ? 0 : Math.max(0, received.room.paceRemainingMs - Math.max(0, now - received.at))

  useEffect(() => {
    if (received === null || received.room.paceRemainingMs <= 0) return
    const deadline = received.at + received.room.paceRemainingMs
    if (deadline <= Date.now()) return
    const id = window.setInterval(() => {
      setNow(Date.now())
      // Stops itself the moment the wait is over, so an idle table is not re-rendering ten times
      // a second for the rest of the game.
      if (Date.now() >= deadline) window.clearInterval(id)
    }, 100)
    return () => {
      window.clearInterval(id)
    }
  }, [received])

  /** Apply what an action returned. The response already carries the new position. */
  const absorb = (result: Awaited<ReturnType<typeof syncRoom>>): void => {
    if (result.ok) {
      take(result.room)
    } else {
      setRefusal(result.error)
      // A refusal that means "you are looking at an old table" is answered by looking again,
      // rather than by leaving the player to work out that they should reload.
      if (result.error.code === 'VERSION_CONFLICT' || result.error.code === 'PACED') {
        setTick((n) => n + 1)
      }
    }
  }

  return {
    snapshot,
    refusal,
    // Derived, not stored: "asked and not yet answered" is exactly the state of having neither a
    // snapshot nor a refusal. A `loading` flag would have needed setting from an effect, and would
    // have flashed the whole page back to a spinner on every poll of a room already on screen.
    loading: code !== null && snapshot === null && refusal === null,
    live,
    busy,
    paceLeftMs,

    play: async (move) => {
      if (!snapshot || token === null || snapshot.seat === null) return
      setBusy(true)
      absorb(await act({ roomId: snapshot.roomId, token, version: snapshot.version, move }))
      setBusy(false)
    },

    switchTeam: async (team) => {
      if (!snapshot || token === null) return
      setBusy(true)
      absorb(await chooseTeam({ roomId: snapshot.roomId, token, team }))
      setBusy(false)
    },

    leave: async () => {
      if (!snapshot || token === null) return
      setBusy(true)
      absorb(await leaveRoom({ roomId: snapshot.roomId, token }))
      setBusy(false)
    },

    dismissRefusal: () => {
      setRefusal(null)
    },

    refresh: () => {
      setTick((n) => n + 1)
    },
  }
}
