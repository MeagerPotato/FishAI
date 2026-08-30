/**
 * The two channels a room needs, and the reason they are two.
 *
 * ## Actions go over plain `fetch`
 *
 * Not `supabase.functions.invoke`. That helper sends the project key on BOTH `apikey` and
 * `Authorization: Bearer`, and the platform tries to parse an `Authorization` bearer as a JWT —
 * which a `sb_publishable_...` key is not, so every call comes back `Invalid JWT`. Supabase's own
 * migration guide says to send the new keys on `apikey` only. A bare `fetch` is the shortest way
 * to send exactly that header and nothing else.
 *
 * ## Pushes come over Realtime
 *
 * The `rooms` row is in the `supabase_realtime` publication, so every client subscribed to its
 * room is handed the new public state the moment a move commits. What arrives is deliberately
 * NOT enough to render with: the row carries `publicView` output and no hands, which is the whole
 * point of the architecture. So a push is treated as a doorbell rather than as data — the client
 * hears "something changed" and asks the function for its own `seatView`. One extra round trip
 * per move buys the guarantee that a browser is never sent a hand that is not its own.
 */
import { createClient } from '@supabase/supabase-js'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { ROOM_FUNCTION_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.ts'
import { readResult, type RoomMove, type RoomResult } from './protocol.ts'

/**
 * One client for the tab. Realtime holds a WebSocket, and a client per component would have
 * opened one per mount — created lazily so that importing this module (which the router does at
 * chunk load) does not open a socket for a player who never enters a room.
 */
let cached: SupabaseClient | null = null

function supabase(): SupabaseClient {
  cached ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // A room is six people; the default of 10 messages a second is a rate this table cannot
    // reach and a burst it does not need to buffer.
    realtime: { params: { eventsPerSecond: 4 } },
  })
  return cached
}

/** The public `rooms` row, readable by anyone with the publishable key. Used to prove it is safe. */
export function publicClient(): SupabaseClient {
  return supabase()
}

interface CallOptions {
  signal?: AbortSignal
}

/**
 * Post one action. Never throws: a network failure is a refusal like any other, because the
 * surface that renders this has exactly one way to report that something did not happen and it
 * should not matter to a player whether the reason was a rule or a dropped connection.
 */
async function call(body: Record<string, unknown>, options: CallOptions = {}): Promise<RoomResult> {
  let response: Response
  try {
    response = await fetch(ROOM_FUNCTION_URL, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: { code: 'ABORTED', message: 'The request was cancelled.' } }
    }
    return {
      ok: false,
      error: {
        code: 'OFFLINE',
        message: 'The table could not be reached. Check your connection — nothing was played.',
      },
    }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return {
      ok: false,
      error: {
        code: 'BAD_RESPONSE',
        message: `The server answered ${response.status} with something that is not a response.`,
      },
    }
  }
  return readResult(payload)
}

export function createRoom(
  input: { token: string; name: string; team: number | null; paceMs: number },
  options?: CallOptions,
): Promise<RoomResult> {
  return call(
    {
      action: 'create',
      token: input.token,
      name: input.name,
      paceMs: input.paceMs,
      ...(input.team === null ? {} : { team: input.team }),
    },
    options,
  )
}

export function joinRoom(
  input: { token: string; code: string; name: string; team: number | null },
  options?: CallOptions,
): Promise<RoomResult> {
  return call(
    {
      action: 'join',
      token: input.token,
      code: input.code,
      name: input.name,
      ...(input.team === null ? {} : { team: input.team }),
    },
    options,
  )
}

/**
 * Everything this browser is entitled to see, including its own hand. The reload path, and what
 * every Realtime push is answered with.
 *
 * The token is optional: without one this asks to watch, which is what an unseated visitor with a
 * link gets.
 */
export function syncRoom(
  input: { code: string; token?: string | null },
  options?: CallOptions,
): Promise<RoomResult> {
  return call(
    { action: 'sync', code: input.code, ...(input.token ? { token: input.token } : {}) },
    options,
  )
}

export function chooseTeam(
  input: { roomId: string; token: string; team: number },
  options?: CallOptions,
): Promise<RoomResult> {
  return call({ action: 'team', roomId: input.roomId, token: input.token, team: input.team }, options)
}

export function leaveRoom(
  input: { roomId: string; token: string },
  options?: CallOptions,
): Promise<RoomResult> {
  return call({ action: 'leave', roomId: input.roomId, token: input.token }, options)
}

/**
 * Play one move.
 *
 * `version` is what this client believed the room was at when the player decided. The server
 * compares it, and then compares it AGAIN as a compare-and-swap inside the commit — so of two
 * people acting on the same position, exactly one move lands and the other is told plainly that
 * the table moved.
 */
export function act(
  input: { roomId: string; token: string; version: number; move: RoomMove },
  options?: CallOptions,
): Promise<RoomResult> {
  return call(
    { action: 'act', roomId: input.roomId, token: input.token, version: input.version, move: input.move },
    options,
  )
}

/**
 * Ring when this room's public row changes.
 *
 * Returns the unsubscribe. `onStatus` reports whether the socket is actually up, because a
 * subscription that silently failed looks exactly like a table where nobody has moved yet — and
 * a player is owed the difference between "quiet" and "disconnected".
 */
export function watchRoom(
  roomId: string,
  onChange: () => void,
  onStatus: (live: boolean) => void,
): () => void {
  const channel: RealtimeChannel = supabase()
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      () => {
        onChange()
      },
    )
    .subscribe((status) => {
      onStatus(status === 'SUBSCRIBED')
    })

  return () => {
    void supabase().removeChannel(channel)
  }
}
