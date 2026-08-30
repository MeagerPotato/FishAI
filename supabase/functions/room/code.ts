/**
 * Join codes, and the hashes the database stores instead of them.
 *
 * The code IS the invitation — it gets read aloud across a room and typed by someone who heard
 * it — so the alphabet is chosen for the ear and the eye rather than for density.
 */

/**
 * Digits 2-9 and A-Z without I and O: the two letters that are indistinguishable from 1 and 0
 * when spoken and, in most faces, when read. Dropping them (and 0/1 with them) costs four
 * characters and removes the only confusions this alphabet had.
 *
 * That it leaves EXACTLY 32 is what makes the draw in `newCode` unbiased. 32 divides 256, so a
 * random byte masked to 5 bits selects a character uniformly with no rejection step and no
 * modulo skew — `byte % 33` would have made the first characters of a 33-letter alphabet
 * measurably more common than the last, which is the kind of thing that is invisible until
 * someone is counting collisions.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Six characters of a 32-letter alphabet: 32^6, a bit over a billion codes. */
export const CODE_LENGTH = 6

/** A fresh code from the platform CSPRNG. */
export function newCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b & 31]
  return out
}

/**
 * What a typed code means. Case is not part of a code — someone reading one aloud does not say
 * which — and neither are the spaces and dashes people add to make six characters readable.
 * A code that survives this and is still not six letters of the alphabet is not a code at all,
 * and the caller says so rather than hashing nonsense and reporting "no such room".
 */
export function normalizeCode(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[\s-]+/g, '')
  if (cleaned.length !== CODE_LENGTH) return null
  for (const ch of cleaned) {
    if (!CODE_ALPHABET.includes(ch)) return null
  }
  return cleaned
}

/**
 * SHA-256, hex. Used for two different things, and the difference matters:
 *
 *   · Player tokens are 256 bits of client-side CSPRNG. Hashing them means a database dump does
 *     not hand out anyone's seat, and a plain digest is the right primitive — there is nothing
 *     to brute-force in a 256-bit random string, so no salt or stretching would buy anything.
 *   · Join codes carry only ~30 bits, so their digest IS brute-forceable by anyone holding it.
 *     The hash is not what protects a code: `room_private` is unreadable to anon (RLS on, zero
 *     policies, no grants), and the join endpoint is metered. What hashing buys is that the
 *     readable `rooms` row never carries a code, so enumerating rooms yields spectatable public
 *     state and never a way in.
 */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
