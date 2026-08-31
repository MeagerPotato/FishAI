/**
 * The table's search-param contract:
 * `?seed=...&names=a,b,c,d,e&pace=<seconds>&assist=0|1`.
 *
 * The URL is the whole configuration — there is no hidden lobby state — so a shared link
 * reproduces the exact game: `seed` drives the deal AND every bot decision (the lab's own
 * seeding convention, see useGame.ts), `names` carries what the player called the five bots,
 * and `pace` carries the interval the table steps itself at.
 *
 * Everything here is defensive: params arrive as untrusted strings, and every failure falls
 * back to something playable rather than to an error page — a game surface that refuses to deal
 * over a typo would be the wrong kind of strict. "Falls back" is not "makes the best of it",
 * though: a name too long or carrying characters the seat cards cannot show is REFUSED and the
 * seat stays numbered, rather than being silently truncated into a word the player never chose.
 *
 * ## The one thing that IS refused outright
 *
 * `?v=` used to select between the v0.5 roster and the v1.0 adaptive engine. v0.5 is retired
 * from play (policies.ts), so `?v=05` names a mode that no longer exists. `retiredMode` reports
 * it and /play/table says so, because the alternative — dealing the adaptive engine under the
 * same seed — is
 * the one failure mode this whole file exists to prevent. A link that promises a reproducible
 * game must not quietly reproduce a DIFFERENT one: the seed would still be honoured, the styles
 * would still be named in the URL, and every card would fall somewhere else. Better to stop and
 * explain than to hand someone a game that looks like the one they shared.
 */

/** Seconds between the table's own steps: the range, and the lobby's default. */
export const PACE_MIN = 0.5
export const PACE_MAX = 10
export const PACE_STEP = 0.5
export const PACE_DEFAULT = 3

/**
 * The longest bot name a seat card can hold on one line beside its card count. Counted in code
 * POINTS, not UTF-16 units, so an emoji or an accented letter costs what it looks like it costs
 * rather than twice that.
 */
export const NAME_MAX = 12

/**
 * What a bot name may contain: a letter or digit first, then letters, digits, combining marks,
 * spaces and the three punctuation marks names actually use. Everything else is refused —
 * notably the comma, which is the `names` separator, and the angle brackets and control
 * characters that have no business in a label rendered into six different surfaces.
 */
const NAME_OK = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} '._-]*$/u

export interface PlayParams {
  seed: string
  /**
   * Five display names, one per bot seat in seat order (index 0 = seat 1 … index 4 = seat 5).
   * An empty string leaves that seat numbered; five empty strings is the default table.
   */
  names: readonly string[]
  /** Joined with commas — a stable string identity for effect deps and URL round-trips. */
  namesKey: string
  /** Seconds between the table's own steps, already clamped into the offered range. */
  paceSeconds: number
  assist: boolean
}

/** The five-empty-names default, as its own value so nothing has to spell it out twice. */
export const NO_NAMES: readonly string[] = ['', '', '', '', '']

/**
 * One name, normalised then judged. Leading, trailing and doubled whitespace are NORMALISED
 * away — that is tidying, and a name is the same name with or without them. Length and
 * character set are JUDGED: over the cap or outside the set returns `null`, and the caller
 * falls back to a numbered seat rather than inventing a truncation the player never typed.
 */
export function sanitizeName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/gu, ' ')
  if (name === '') return ''
  if ([...name].length > NAME_MAX) return null
  return NAME_OK.test(name) ? name : null
}

/**
 * `?names=` parsed all-or-nothing, exactly as `?styles=` was: five slots or none of them. One
 * bad slot discarding the other four looks harsh, but the alternative is a link that renders
 * four of the five names it promised with no indication which one was dropped, and the lobby
 * caps its own inputs at NAME_MAX so only a hand-edited URL can ever reach this branch.
 */
export function parseNames(raw: string | null): readonly string[] {
  if (raw === null || raw === '') return NO_NAMES
  const parts = raw.split(',')
  if (parts.length !== 5) return NO_NAMES
  const names = parts.map(sanitizeName)
  return names.every((n) => n !== null) ? (names as string[]) : NO_NAMES
}

/**
 * `?pace=` parsed defensively: one or two digits with at most one decimal place, inside the
 * offered range, else the default. Out of range is refused rather than clamped — `?pace=600`
 * is far more likely to be a typo for 6.00 than a request for a ten-minute step, and silently
 * answering it with 10 would hide the mistake behind a table that looked merely slow.
 */
export function parsePace(raw: string | null): number {
  if (raw === null || !/^\d{1,2}(\.\d)?$/.test(raw)) return PACE_DEFAULT
  const n = Number(raw)
  return n >= PACE_MIN && n <= PACE_MAX ? n : PACE_DEFAULT
}

/**
 * The value of a `?v=` that names a mode this table no longer has, or `null` when the link is
 * fine. An ABSENT `?v=` is fine: there is one mode now, so the bare URL means it. Only a link
 * that explicitly asks for something other than `10` is refused — which is exactly the shape
 * every v0.5 link the old lobby ever wrote (`/play/table?v=05&…`) has.
 */
export function retiredMode(search: string): string | null {
  const v = new URLSearchParams(search).get('v')
  return v === null || v === '10' ? null : v
}

/** A fresh, non-deterministic seed — for "new game" and a first visit with no `?seed=`. */
export function freshSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * The `names` and `pace` half of a launch URL, omitting whatever is at its default so a plain
 * table produces a plain link. Each returned pair carries its own leading `&`, which the lobby
 * appends after `seed=` — and a cleared seed field leaves the whole query starting with one,
 * which `URLSearchParams` reads as an empty pair and ignores, so `?&names=…` still parses. The
 * lobby trims it anyway rather than sharing a URL that looks broken.
 */
export function playQuery(names: readonly string[], paceSeconds: number): string {
  const named = names.some((n) => n !== '')
  const namesQuery = named ? `&names=${names.map(encodeURIComponent).join(',')}` : ''
  const paceQuery = paceSeconds === PACE_DEFAULT ? '' : `&pace=${paceSeconds}`
  return `${namesQuery}${paceQuery}`
}

/** Parse a location search string. `seed` must be supplied (the page canonicalises the URL first). */
export function parsePlayParams(search: string, seed: string): PlayParams {
  const params = new URLSearchParams(search)
  const names = parseNames(params.get('names'))
  return {
    seed,
    names,
    namesKey: names.join(','),
    paceSeconds: parsePace(params.get('pace')),
    assist: params.get('assist') === '1',
  }
}
