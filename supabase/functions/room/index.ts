/**
 * `room` — the only thing in this system with the authority to change a game.
 *
 * ## Why an Edge Function and not the client
 *
 * Fish is a hidden-information game, and hidden information that lives in the browser is not
 * hidden, it is merely inconvenient to look at. The split that makes it real is the one
 * `lib/engine/views.ts` already drew: `publicView(state)` is everything a person sitting at the
 * table can see, and `seatView(state, seat)` is that plus exactly one hand.
 *
 * So the full `GameState` — all six hands — exists in exactly two places: inside this function
 * while a move is being reduced, and in `room_private`, which has RLS on, zero policies and no
 * grants to anon. The row every client subscribes to, `rooms`, carries only `publicView` output.
 * A player's browser is never sent another player's cards, so no amount of devtools gets them.
 *
 * ## Why the real reducer
 *
 * The rules run here as `lib/engine`'s own `reduce`, copied verbatim into `./engine/` by
 * scripts/sync-room-engine.mjs and pinned byte-for-byte by tests/room/engine-copy.test.ts.
 * Reimplementing Fish in SQL or in the client would have created a second rule set to disagree
 * with the first, and the disagreements would surface as a legal move being refused.
 *
 * ## Why `verify_jwt: false`
 *
 * Not a relaxation — the documented path for the new key format. The platform's built-in
 * `verify_jwt` only understands legacy JWT keys; `sb_publishable_...` keys are not JWTs and are
 * sent on the `apikey` header, which that check does not read. So the check is done here instead
 * (`authorized` below), against `SUPABASE_PUBLISHABLE_KEYS`. It is a throttle on strangers, never
 * an identity: the publishable key ships to every browser by design. The identity that matters is
 * the per-player token, which is what maps a request to a seat.
 */
// Pinned inline rather than through a `deno.json` import map. The deploy API records the import
// map as an ABSOLUTE path into the temporary source directory of the version that introduced it,
// and every later version re-resolves that stored path against its own directory — so the second
// deploy of a function with an import map fails with a path that has one source dir nested inside
// another. A fully-qualified specifier has no such state: it means the same thing on every deploy.
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { GameState, PublicState, Seat, Team } from './engine/types.ts'
import { seatTeam, teamSeats } from './engine/cards.ts'
import { newGame, reduce } from './engine/reduce.ts'
import { publicView, seatView } from './engine/views.ts'
import { checkInvariants } from './engine/invariants.ts'
import { newCode, normalizeCode, sha256Hex } from './code.ts'
import type { Json, LobbyState, SeatRecord } from './protocol.ts'
import {
  cleanName,
  cleanPace,
  int,
  isObject,
  isTeam,
  isToken,
  isUuid,
  parseAction,
  ROOM_CONFIG,
  SEAT_COUNT,
  str,
} from './protocol.ts'

/* ------------------------------------------------------------------ wire --- */

// No cookies and no ambient authority are involved: every request carries its own token in the
// body, so a permissive origin grants a stranger's page nothing it could not get with fetch from
// anywhere else. Narrowing this would give the appearance of a control without the substance.
const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

/**
 * A refusal, in words. Every failure path in this function ends here rather than at a bare status
 * code: the surface this backs explains why it will not do something instead of quietly showing
 * something wrong, and it can only do that if the reason travels.
 */
function fail(code: string, message: string, status = 400): Response {
  return json({ ok: false, error: { code, message } }, status)
}

/** The publishable keys this project will accept on `apikey`. */
function acceptedKeys(): Set<string> {
  const keys = new Set<string>()
  const bundle = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (bundle) {
    try {
      const parsed: unknown = JSON.parse(bundle)
      if (isObject(parsed)) {
        for (const v of Object.values(parsed)) if (typeof v === 'string') keys.add(v)
      }
    } catch {
      // A malformed bundle must not take the legacy key down with it.
    }
  }
  const legacy = Deno.env.get('SUPABASE_ANON_KEY')
  if (legacy) keys.add(legacy)
  return keys
}

const ACCEPTED = acceptedKeys()

function authorized(req: Request): boolean {
  const key = req.headers.get('apikey')
  return key !== null && ACCEPTED.has(key)
}

/** The caller's address, for metering. Behind the platform's proxy this is the first hop. */
function clientAddress(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? ''
  const first = forwarded.split(',')[0]?.trim()
  return first && first.length > 0 ? first : 'unknown'
}

/* -------------------------------------------------------------- database --- */

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

interface RoomRow {
  id: string
  status: string
  public_state: PublicState | null
  lobby: LobbyState
  pace_ms: number
  version: number
  last_activity: string
}

interface PrivateRow {
  room_id: string
  code_hash: string
  state: GameState | null
  seats: SeatRecord[]
}

interface Loaded {
  room: RoomRow
  priv: PrivateRow
}

async function loadById(db: SupabaseClient, roomId: string): Promise<Loaded | null> {
  const { data } = await db
    .from('rooms')
    .select('id, status, public_state, lobby, pace_ms, version, last_activity, room_private(*)')
    .eq('id', roomId)
    .maybeSingle()
  if (!data) return null
  const nested = (data as unknown as { room_private: PrivateRow | PrivateRow[] }).room_private
  const priv = Array.isArray(nested) ? nested[0] : nested
  if (!priv) return null
  return { room: data as unknown as RoomRow, priv }
}

async function loadByCodeHash(db: SupabaseClient, codeHash: string): Promise<Loaded | null> {
  const { data } = await db
    .from('room_private')
    .select('room_id, code_hash, state, seats, rooms(*)')
    .eq('code_hash', codeHash)
    .maybeSingle()
  if (!data) return null
  const nested = (data as unknown as { rooms: RoomRow | RoomRow[] }).rooms
  const room = Array.isArray(nested) ? nested[0] : nested
  if (!room) return null
  return { room, priv: data as unknown as PrivateRow }
}

/**
 * Write both rows, or neither, and only if the room is still at `expectedVersion`.
 *
 * Returns the new version, or null when someone else moved first. The compare-and-swap lives in
 * SQL (`public.room_commit`) because a move touches two tables and PostgREST has no transaction
 * spanning two requests — a crash between them could leave a room whose public projection and
 * private authority disagree about what has happened.
 */
async function commit(
  db: SupabaseClient,
  loaded: Loaded,
  next: { status: string; state: GameState | null; lobby: LobbyState; paceMs: number; seats: SeatRecord[] },
): Promise<number | null> {
  const { data, error } = await db.rpc('room_commit', {
    p_room: loaded.room.id,
    p_expected_version: loaded.room.version,
    p_status: next.status,
    p_public: next.state ? publicView(next.state) : null,
    p_lobby: next.lobby,
    p_pace: next.paceMs,
    p_state: next.state,
    p_seats: next.seats,
  })
  if (error) throw new Error(`commit failed: ${error.message}`)
  return typeof data === 'number' ? data : null
}

/** Meter a bucket. `false` means this caller has had its allowance for the window. */
async function meter(db: SupabaseClient, bucket: string, limit: number, window: string): Promise<boolean> {
  const { data, error } = await db.rpc('rate_take', {
    p_bucket: bucket,
    p_limit: limit,
    p_window: window,
  })
  // A metering outage must not become an outage of the whole feature, but it also must not
  // silently become an unmetered endpoint — so it is allowed, and logged loudly.
  if (error) {
    console.error(`rate_take failed for ${bucket}: ${error.message}`)
    return true
  }
  return data !== false
}

/* ------------------------------------------------------------------ room --- */

function takenSeats(seats: SeatRecord[]): Set<Seat> {
  return new Set(seats.map((s) => s.seat))
}

/**
 * A free seat on the side the player picked, or on either side when they did not pick.
 *
 * "Select which team you are playing on" resolves to a seat here, because the ENGINE has no
 * concept of choosing a team — `seatTeam` in lib/engine/cards.ts makes the team a property of the
 * seat (0/2/4 against 1/3/5), so picking a side is picking from that side's three seats.
 */
function freeSeat(seats: SeatRecord[], team: Team | null): Seat | null {
  const taken = takenSeats(seats)
  const wanted: readonly Seat[] =
    team === null ? ([0, 1, 2, 3, 4, 5] as const) : teamSeats(team)
  return wanted.find((s) => !taken.has(s)) ?? null
}

/** The public lobby, rebuilt from the private seat records — one source of truth for who is here. */
function lobbyOf(seats: SeatRecord[], hostSeat: Seat | null): LobbyState {
  return {
    players: [...seats]
      .sort((a, b) => a.seat - b.seat)
      .map((s) => ({ seat: s.seat, name: s.name })),
    hostSeat,
  }
}

/**
 * What a client is told about a room. The player's OWN hand is here, from `seatView`; nobody
 * else's is, and there is no code path in this function that would put one here.
 *
 * `paceRemainingMs` is computed HERE rather than left to the client to derive from a timestamp.
 * The client would have to compare a server timestamp against its own clock, and a browser whose
 * clock is a few minutes out would either hold a player back from a table that is ready or let
 * them act into a refusal. A remaining duration is the same number on every clock.
 */
function snapshot(loaded: Loaded, seat: Seat | null, extra: Record<string, unknown> = {}): Response {
  const { room, priv } = loaded
  const view = seat !== null && priv.state ? seatView(priv.state, seat) : null
  const since = Date.now() - Date.parse(room.last_activity)
  const remaining = Number.isFinite(since) ? Math.max(0, room.pace_ms - since) : 0
  return json({
    ok: true,
    room: {
      roomId: room.id,
      status: room.status,
      version: room.version,
      paceMs: room.pace_ms,
      paceRemainingMs: remaining,
      lobby: room.lobby,
      seat,
      view,
      publicState: view ? null : room.public_state,
    },
    ...extra,
  })
}

/**
 * The room as it stands after a commit this function just made.
 *
 * Deliberately built from what was written rather than re-read from the database. A second SELECT
 * could observe a LATER version — another player's move landing in the millisecond between — and
 * would then answer this request with a position that is not the one it produced, which is how a
 * client ends up holding a view whose `version` it never saw acknowledged.
 */
function afterCommit(
  loaded: Loaded,
  version: number,
  next: { status: string; state: GameState | null; lobby: LobbyState; seats: SeatRecord[] },
): Loaded {
  return {
    room: {
      ...loaded.room,
      status: next.status,
      version,
      lobby: next.lobby,
      public_state: next.state ? publicView(next.state) : null,
      last_activity: new Date().toISOString(),
    },
    priv: { ...loaded.priv, state: next.state, seats: next.seats },
  }
}

/** The seat this token holds, or null. */
function seatFor(priv: PrivateRow, tokenHash: string): Seat | null {
  return priv.seats.find((s) => s.tokenHash === tokenHash)?.seat ?? null
}

/**
 * Six seats or no deal. 54 cards divide evenly among 6, and among 2 or 3 — but not among 4 or 5,
 * so a five-player game cannot be dealt at all. The owner asked for no bots, so the room waits
 * rather than filling the gap; this is the only place a game is ever started.
 */
function dealIfFull(seats: SeatRecord[]): GameState | null {
  if (seats.length < SEAT_COUNT) return null
  const seed = crypto.randomUUID()
  return newGame(seed, ROOM_CONFIG, 0)
}

/* --------------------------------------------------------------- actions --- */

async function doCreate(db: SupabaseClient, body: Json, req: Request): Promise<Response> {
  if (!(await meter(db, `create:${clientAddress(req)}`, 10, '10 minutes'))) {
    return fail(
      'RATE_LIMITED',
      'That is a lot of rooms from one place in ten minutes. Wait a few minutes, or join an existing room with its code.',
      429,
    )
  }

  const token = str(body, 'token')
  if (!isToken(token)) return fail('BAD_REQUEST', 'A player token is missing or malformed.')

  const teamRaw = body.team
  const team: Team | null = isTeam(teamRaw) ? teamRaw : null
  const paceMs = cleanPace(int(body, 'paceMs'))
  const seat: Seat = team === null ? 0 : teamSeats(team)[0]
  const name = cleanName(str(body, 'name'), seat)

  const code = newCode()
  const codeHash = await sha256Hex(code)
  const seats: SeatRecord[] = [{ seat, tokenHash: await sha256Hex(token), name }]
  const lobby = lobbyOf(seats, seat)

  const { data: created, error: roomError } = await db
    .from('rooms')
    .insert({ status: 'lobby', public_state: null, lobby, pace_ms: paceMs, version: 0 })
    .select('id, status, public_state, lobby, pace_ms, version, last_activity')
    .single()
  if (roomError || !created) {
    return fail('SERVER', `The room could not be created: ${roomError?.message ?? 'no row'}`, 500)
  }

  const room = created as unknown as RoomRow
  const { error: privError } = await db
    .from('room_private')
    .insert({ room_id: room.id, code_hash: codeHash, state: null, seats })
  if (privError) {
    // The public row exists but has no private half, so nobody can ever join it. Remove it rather
    // than leaving a room that is permanently unopenable sitting in the table.
    await db.from('rooms').delete().eq('id', room.id)
    return fail('SERVER', `The room could not be created: ${privError.message}`, 500)
  }

  return snapshot({ room, priv: { room_id: room.id, code_hash: codeHash, state: null, seats } }, seat, {
    code,
  })
}

async function doJoin(db: SupabaseClient, body: Json, req: Request): Promise<Response> {
  // A six-character code is ~30 bits. Unmetered, this endpoint would be a guessing oracle, so a
  // caller gets a modest number of tries per window — enough for typos, useless for a search.
  if (!(await meter(db, `join:${clientAddress(req)}`, 30, '10 minutes'))) {
    return fail('RATE_LIMITED', 'Too many join attempts from here. Wait a few minutes and try again.', 429)
  }

  const token = str(body, 'token')
  if (!isToken(token)) return fail('BAD_REQUEST', 'A player token is missing or malformed.')

  const raw = str(body, 'code')
  const code = raw === null ? null : normalizeCode(raw)
  if (code === null) {
    return fail(
      'BAD_CODE',
      'A room code is six characters, digits 2-9 and letters without I or O. Check the one you were given.',
    )
  }

  const loaded = await loadByCodeHash(db, await sha256Hex(code))
  if (!loaded) {
    return fail('NO_SUCH_ROOM', `No room is open under the code ${code}. Codes are per-room and do not outlive them.`, 404)
  }

  const tokenHash = await sha256Hex(token)
  const existing = seatFor(loaded.priv, tokenHash)
  // Rejoining is not an error, it is the whole point of the token: the same player coming back
  // to the same seat, after a reload or on a second device.
  if (existing !== null) return snapshot(loaded, existing, { code })

  const taken = takenSeats(loaded.priv.seats)

  // Fullness is checked BEFORE the room's status, because it is the more useful reason and it is
  // the one that is almost always true: a game only starts when the sixth seat fills, so a
  // seventh player meets a room that is both full and playing. "All six seats are taken" tells
  // them what to do about it; "the game already started" invites them to wait for a next one
  // that this room will never have.
  if (taken.size >= SEAT_COUNT) {
    return fail(
      'ROOM_FULL',
      'That room has all six seats taken. A table is exactly six — 54 cards divide evenly among six and not among seven.',
      409,
    )
  }

  if (loaded.room.status !== 'lobby') {
    return fail(
      'ALREADY_STARTED',
      'That room is already playing. All six hands are dealt at once, so nobody can be added part-way through.',
      409,
    )
  }

  const teamRaw = body.team
  const team: Team | null = isTeam(teamRaw) ? teamRaw : null
  const seat = freeSeat(loaded.priv.seats, team)
  if (seat === null) {
    const other: Team = team === 0 ? 1 : 0
    const free = teamSeats(other).filter((s) => !taken.has(s)).length
    return fail(
      'SIDE_FULL',
      `That side already has its three players. The other side has ${free} ${free === 1 ? 'seat' : 'seats'} free.`,
      409,
    )
  }

  const name = cleanName(str(body, 'name'), seat)
  const seats = [...loaded.priv.seats, { seat, tokenHash, name }]
  // One deal, held in a variable: `dealIfFull` draws a fresh seed every call, so asking it twice
  // — once for the status and once for the state — would deal two different games and store the
  // second under a status decided by the first.
  const dealt = dealIfFull(seats)
  const next = {
    status: dealt ? 'playing' : 'lobby',
    state: dealt,
    lobby: lobbyOf(seats, loaded.room.lobby?.hostSeat ?? null),
    seats,
  }

  const version = await commit(db, loaded, { ...next, paceMs: loaded.room.pace_ms })
  if (version === null) {
    return fail(
      'VERSION_CONFLICT',
      'Someone took that seat while you were sitting down. Try again — the lobby has moved on.',
      409,
    )
  }

  return snapshot(afterCommit(loaded, version, next), seat, { code })
}

/** Change sides while still in the lobby. */
async function doTeam(db: SupabaseClient, body: Json): Promise<Response> {
  const token = str(body, 'token')
  const roomId = str(body, 'roomId')
  if (!isToken(token) || !isUuid(roomId)) return fail('BAD_REQUEST', 'A room id and player token are required.')

  const loaded = await loadById(db, roomId)
  if (!loaded) return fail('NO_SUCH_ROOM', 'That room no longer exists.', 404)
  if (loaded.room.status !== 'lobby') {
    return fail('ALREADY_STARTED', 'The cards are dealt. Sides are fixed once a game starts.', 409)
  }

  const tokenHash = await sha256Hex(token)
  const mine = seatFor(loaded.priv, tokenHash)
  if (mine === null) return fail('NOT_SEATED', 'You are not seated in this room.', 403)

  const teamRaw = body.team
  if (!isTeam(teamRaw)) return fail('BAD_REQUEST', 'A side is 0 or 1.')
  if (seatTeam(mine) === teamRaw) return snapshot(loaded, mine)

  const others = loaded.priv.seats.filter((s) => s.seat !== mine)
  const seat = freeSeat(others, teamRaw)
  if (seat === null) {
    return fail('SIDE_FULL', 'That side already has its three players. Nobody has to move for you.', 409)
  }

  const name = loaded.priv.seats.find((s) => s.seat === mine)?.name ?? ''
  const seats = [...others, { seat, tokenHash, name }]
  const dealt = dealIfFull(seats)
  // The host moved seats, so the seat the pace setting is attributed to moves with them.
  const hostSeat = loaded.room.lobby?.hostSeat === mine ? seat : (loaded.room.lobby?.hostSeat ?? null)
  const next = {
    status: dealt ? 'playing' : 'lobby',
    state: dealt,
    lobby: lobbyOf(seats, hostSeat),
    seats,
  }

  const version = await commit(db, loaded, { ...next, paceMs: loaded.room.pace_ms })
  if (version === null) {
    return fail('VERSION_CONFLICT', 'The lobby changed while you were switching. Try again.', 409)
  }

  return snapshot(afterCommit(loaded, version, next), seat)
}

/** Everything a seated client needs, including its own hand. The reload path. */
async function doSync(db: SupabaseClient, body: Json): Promise<Response> {
  // A token is optional here: without one this is a request to look at the table, which is exactly
  // what `publicView` is for. With one, and only if it matches a seat, a hand comes back.
  const answer = async (loaded: Loaded | null): Promise<Response> => {
    if (!loaded) return fail('NO_SUCH_ROOM', 'That room no longer exists.', 404)
    const token = str(body, 'token')
    return snapshot(loaded, isToken(token) ? seatFor(loaded.priv, await sha256Hex(token)) : null)
  }

  const roomId = str(body, 'roomId')
  if (isUuid(roomId)) return await answer(await loadById(db, roomId))

  const code = str(body, 'code')
  if (code === null) return fail('BAD_REQUEST', 'A room id or a code is required.')
  const normalized = normalizeCode(code)
  if (normalized === null) return fail('BAD_CODE', 'That is not a room code.')
  return await answer(await loadByCodeHash(db, await sha256Hex(normalized)))
}

/** Give up a seat before the deal. */
async function doLeave(db: SupabaseClient, body: Json): Promise<Response> {
  const token = str(body, 'token')
  const roomId = str(body, 'roomId')
  if (!isToken(token) || !isUuid(roomId)) return fail('BAD_REQUEST', 'A room id and player token are required.')

  const loaded = await loadById(db, roomId)
  if (!loaded) return fail('NO_SUCH_ROOM', 'That room no longer exists.', 404)
  if (loaded.room.status !== 'lobby') {
    return fail(
      'ALREADY_STARTED',
      'The cards are dealt. Leaving now would leave five hands nobody can play — the game has no way to go on without you.',
      409,
    )
  }

  const tokenHash = await sha256Hex(token)
  const mine = seatFor(loaded.priv, tokenHash)
  if (mine === null) return snapshot(loaded, null)

  const seats = loaded.priv.seats.filter((s) => s.seat !== mine)
  // The host left. The room does not become hostless — the pace it was created with still governs
  // it, and the longest-seated remaining player is named so the lobby can still say whose it is.
  const hostSeat =
    loaded.room.lobby?.hostSeat === mine ? (seats[0]?.seat ?? null) : (loaded.room.lobby?.hostSeat ?? null)
  const next = { status: 'lobby', state: null, lobby: lobbyOf(seats, hostSeat), seats }

  const version = await commit(db, loaded, { ...next, paceMs: loaded.room.pace_ms })
  if (version === null) return fail('VERSION_CONFLICT', 'The lobby changed. Try again.', 409)

  return snapshot(afterCommit(loaded, version, next), null)
}

/**
 * One move. The only path in this system that changes a game, and the only place the reducer runs.
 */
async function doAct(db: SupabaseClient, body: Json): Promise<Response> {
  const token = str(body, 'token')
  const roomId = str(body, 'roomId')
  if (!isToken(token) || !isUuid(roomId)) return fail('BAD_REQUEST', 'A room id and player token are required.')

  const loaded = await loadById(db, roomId)
  if (!loaded) return fail('NO_SUCH_ROOM', 'That room no longer exists.', 404)
  if (loaded.room.status !== 'playing' || !loaded.priv.state) {
    return fail('NOT_PLAYING', 'That room is not in a game right now.', 409)
  }

  const seat = seatFor(loaded.priv, await sha256Hex(token))
  if (seat === null) {
    return fail('NOT_SEATED', 'You are not seated in this room, so you cannot act in it.', 403)
  }

  // The version the client saw when it built this move. Checked here for a clear message, and
  // again inside `room_commit` as a compare-and-swap, which is what actually decides a race: two
  // clients can both pass this check and only one can pass that one.
  const version = int(body, 'version')
  if (version !== null && version !== loaded.room.version) {
    return fail(
      'VERSION_CONFLICT',
      'The table moved while you were deciding. Your move was not played — look at what happened and choose again.',
      409,
    )
  }

  const moveBody = body.move
  if (!isObject(moveBody)) return fail('BAD_REQUEST', 'A move is required.')
  const parsed = parseAction(moveBody, seat)
  if ('error' in parsed) return fail('BAD_MOVE', parsed.error)

  // The creator's pace, enforced rather than decorated. Without a floor between resolved moves a
  // fast player can act before the other five have read what just happened, which in a six-person
  // hidden-information game is not speed, it is five people losing the thread.
  //
  // Checked AFTER the move is parsed, on purpose. Refusing a malformed move with "wait 1.5s"
  // answered the wrong question — the move was never going to be played at any speed — and it
  // made the pace timer a side channel a caller could probe without ever submitting a real move.
  //
  // `decline` is deliberately exempt. The pace exists so the table can READ what happened, and a
  // decline produces no log line and moves no card; it only advances whose declare option it is.
  // Under RULES_US54.md §3 every set-resolving action re-opens the window on all six seats, so
  // pacing declines would have multiplied the wait by six and made a 3s room take 18s to reach
  // one ask. Asks and declares — the actions that actually produce something to read — are paced.
  if (parsed.action.type !== 'decline') {
    const since = Date.now() - Date.parse(loaded.room.last_activity)
    if (Number.isFinite(since) && since < loaded.room.pace_ms) {
      const wait = Math.ceil((loaded.room.pace_ms - since) / 100) / 10
      return fail('PACED', `This room plays a step every ${loaded.room.pace_ms / 1000}s. ${wait}s to go.`, 429)
    }
  }

  const result = reduce(loaded.priv.state, parsed.action)
  if (!result.ok) {
    // The engine's own refusal, in the engine's own words. This is the same message the solo
    // table would give for the same move, because it is the same reducer.
    return fail(result.error.code, result.error.message, 422)
  }

  // The reducer is trusted, and this is what trust looks like when it is worth something: the
  // state it produced is checked against the engine's own invariants (every card accounted for
  // exactly once, scores matching resolved books, no seat holding a card of a resolved set)
  // BEFORE it is persisted. A refused commit costs one move; a corrupt `room_private` is a room
  // nobody can finish and a bug with no reproduction. This has never fired — that is the point.
  const problems = checkInvariants(result.state)
  if (problems.length > 0) {
    console.error(`invariant violation after ${parsed.action.type} in ${roomId}: ${problems.join('; ')}`)
    return fail(
      'ENGINE_INVARIANT',
      'That move produced a position the rules say is impossible, so it was not saved. The table is unchanged. Please report this.',
      500,
    )
  }

  const next = {
    status: result.state.phase === 'finished' ? 'finished' : 'playing',
    state: result.state,
    lobby: loaded.room.lobby,
    seats: loaded.priv.seats,
  }
  const committed = await commit(db, loaded, { ...next, paceMs: loaded.room.pace_ms })
  if (committed === null) {
    return fail(
      'VERSION_CONFLICT',
      'Someone else acted at the same moment and their move landed first. Yours was not played — the table is unchanged by it.',
      409,
    )
  }

  return snapshot(afterCommit(loaded, committed, next), seat)
}

/* ---------------------------------------------------------------- serve --- */

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return fail('BAD_METHOD', 'This endpoint takes POST.', 405)
  if (!authorized(req)) {
    return fail('UNAUTHORIZED', 'This endpoint needs the project publishable key on the apikey header.', 401)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('BAD_REQUEST', 'The request body is not JSON.')
  }
  if (!isObject(body)) return fail('BAD_REQUEST', 'The request body is not an object.')

  const db = serviceClient()
  const action = str(body, 'action')

  try {
    switch (action) {
      case 'create':
        return await doCreate(db, body, req)
      case 'join':
        return await doJoin(db, body, req)
      case 'team':
        return await doTeam(db, body)
      case 'sync':
        return await doSync(db, body)
      case 'leave':
        return await doLeave(db, body)
      case 'act':
        return await doAct(db, body)
      default:
        return fail('BAD_REQUEST', `${String(action)} is not something this endpoint does.`)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`room ${String(action)} failed: ${message}`)
    return fail('SERVER', 'Something went wrong on the server. The room is unchanged.', 500)
  }
})
