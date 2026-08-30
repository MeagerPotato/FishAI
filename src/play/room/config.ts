/**
 * Where the shared rooms live.
 *
 * ## Why these two values are committed to the repository
 *
 * They are build-time constants that a deploy cannot supply. This site builds on Vercel from a
 * repository nobody sets environment variables on, so a config that read `import.meta.env` and
 * had no fallback would compile perfectly, ship, and fail in production with `undefined` where a
 * URL should be — the worst kind of failure, because it is invisible until a user hits it.
 * Committed defaults mean the build that works locally is the build that works deployed.
 *
 * ## Why a publishable key in public source is not a leak
 *
 * `sb_publishable_...` is Supabase's replacement for the `anon` key and is **designed to be
 * public**: it is shipped inside the JavaScript bundle of every page that talks to the project,
 * so anyone with devtools has it whether it is in this file or not. It identifies the project,
 * not a person, and it grants exactly what the `anon` Postgres role grants — here, `SELECT` on
 * `public.rooms` and nothing else. `room_private`, which holds the hands and the hashed join
 * codes, has RLS on with zero policies and no grants to anon, so this key cannot read a single
 * byte of it. That is the whole architecture: the key is public because the data it reaches is
 * public.
 *
 * The SECRET key (`sb_secret_...` / `SUPABASE_SERVICE_ROLE_KEY`) is a different thing entirely
 * and must never appear in anything the browser downloads. It does not appear in this repository:
 * Supabase injects it into the `room` Edge Function's environment, which is the only code that
 * ever holds all six hands at once.
 *
 * The overrides exist for a fork pointing at its own project, and for local development against a
 * `supabase start` stack. They are read defensively rather than trusted, because a `.env` that
 * defines the variable as an empty string is a likelier mistake than one that omits it.
 */

function fromEnv(key: string): string | undefined {
  const value: unknown = import.meta.env[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** The Supabase project the shared rooms live in. */
export const SUPABASE_URL = fromEnv('VITE_SUPABASE_URL') ?? 'https://fnandjtzwhihgefkfwzj.supabase.co'

/** Public by design — see the file header before "fixing" this. */
export const SUPABASE_PUBLISHABLE_KEY =
  fromEnv('VITE_SUPABASE_PUBLISHABLE_KEY') ?? 'sb_publishable_d1b4UsjCjPbUj_T7Nf4Z3A_huFE0Ol9'

/** The one endpoint with the authority to change a game. */
export const ROOM_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/room`
