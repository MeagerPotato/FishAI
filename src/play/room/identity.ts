/**
 * Who you are at a table, and the join code, in the two forms the browser has to remember.
 *
 * There are no accounts here. A player is a 256-bit random token generated in their browser; the
 * server stores only its SHA-256 and maps that to a seat. That is what makes a reload work: the
 * page comes back, sends the same token, and is handed back its own seat and its own hand.
 * Without it, refreshing mid-game would lose a player their cards with no way to prove which
 * ones were theirs, which is the difference between a demo and something people can use.
 *
 * The token is per-room, not per-browser. One token for everything would have been simpler and
 * would have meant two tabs of the same browser could not be two players — which is exactly what
 * a person setting up a game for the room they are sitting in wants to do, and exactly how this
 * feature is tested.
 */

const TOKEN_PREFIX = 'fishai.room.token.'

/** 32 bytes of CSPRNG as hex — the shape `isToken` on the server insists on. */
function newToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Storage is *asked*, never assumed. A browser in private mode, or one configured to refuse site
 * data, throws on `localStorage` access rather than returning null — and a thrown exception here
 * would take the whole page down at import time. A player without storage can still play; they
 * simply cannot survive a reload, and the surface says so rather than pretending.
 */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export interface Identity {
  token: string
  /** False when the token could not be persisted, so a reload will lose this seat. */
  durable: boolean
}

/**
 * This browser's token for one room, minting one on first sight.
 *
 * Keyed by the room CODE rather than by its uuid because the code is what the page has at mount:
 * it is in the URL. Looking the room up first to key by id would mean a network round trip before
 * the page could even tell whether it already had a seat.
 */
export function identityFor(code: string): Identity {
  const key = TOKEN_PREFIX + code.toUpperCase()
  const existing = read(key)
  if (existing !== null && /^[0-9a-f]{64}$/.test(existing)) return { token: existing, durable: true }
  const token = newToken()
  return { token, durable: write(key, token) }
}

/**
 * A token for a room that does not exist yet, held until `create` returns the code it belongs to.
 * The creator's token has to be generated BEFORE the room does — it is what claims the first
 * seat — so it cannot be keyed by a code nobody knows.
 */
export function provisionalIdentity(): string {
  return newToken()
}

/** Bind a provisional token to the code the server just minted. */
export function rememberToken(code: string, token: string): boolean {
  return write(TOKEN_PREFIX + code.toUpperCase(), token)
}

/** Forget a seat — used when leaving a lobby, so the next visit is a fresh player. */
export function forgetToken(code: string): void {
  try {
    window.localStorage.removeItem(TOKEN_PREFIX + code.toUpperCase())
  } catch {
    // Nothing to forget in a browser that never stored it.
  }
}
