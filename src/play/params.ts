/**
 * The table's search-param contract: `?v=05|10&seed=...&styles=a,b,c,d,e|random&assist=0|1`.
 *
 * The URL is the whole configuration — there is no hidden lobby state — so a shared link
 * reproduces the exact game: `seed` drives the deal AND every bot decision (the lab's own
 * seeding convention, see useGame.ts), and `styles` pins the five bot seats. `styles=random`
 * (or an absent/invalid value) derives the five styles deterministically from the seed, so even
 * the "surprise me" lobby is reproducible from the link alone.
 *
 * Everything here is defensive: params arrive as untrusted strings, and every failure falls
 * back to something playable rather than to an error page — a game surface that refuses to deal
 * over a typo would be the wrong kind of strict.
 */
import type { StyleId } from '../../lib/engine/index.ts'
import { STYLE_IDS, randInt, rngFromSeed } from '../../lib/engine/index.ts'
import type { PlayMode } from './policies.ts'

export interface PlayParams {
  mode: PlayMode
  seed: string
  /** Five ids, one per bot seat in seat order (index 0 = seat 1 … index 4 = seat 5). */
  styles: readonly StyleId[]
  /** Joined with commas — a stable string identity for effect deps and URL round-trips. */
  stylesKey: string
  assist: boolean
}

/**
 * Five styles derived deterministically from the seed. Same map as the lobby's "Randomise"
 * and the table's `styles=random`, so every surface that says "derived from the seed" agrees.
 */
export function deriveStyles(seed: string): StyleId[] {
  const rng = rngFromSeed(`${seed}:styles`)
  return [0, 1, 2, 3, 4].map(() => STYLE_IDS[randInt(rng, STYLE_IDS.length)])
}

function parseStyles(raw: string | null, seed: string): StyleId[] {
  if (!raw || raw === 'random') return deriveStyles(seed)
  const parts = raw.split(',')
  if (parts.length !== 5) return deriveStyles(seed)
  const ids = STYLE_IDS as readonly string[]
  if (!parts.every((p) => ids.includes(p))) return deriveStyles(seed)
  return parts as StyleId[]
}

/** A fresh, non-deterministic seed — for "new game" and a first visit with no `?seed=`. */
export function freshSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Parse a location search string. `seed` must be supplied (the page canonicalises the URL first). */
export function parsePlayParams(search: string, seed: string): PlayParams {
  const params = new URLSearchParams(search)
  const mode: PlayMode = params.get('v') === '10' ? 'v10' : 'v05'
  const styles = parseStyles(params.get('styles'), seed)
  return {
    mode,
    seed,
    styles,
    stylesKey: styles.join(','),
    assist: params.get('assist') === '1',
  }
}
