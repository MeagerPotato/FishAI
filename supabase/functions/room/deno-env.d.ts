/**
 * The ambient surface the Deno edge runtime provides, declared so that this repository's own
 * TypeScript can check the function.
 *
 * The four project gates typecheck `src`, `lib`, `tests` and `vite.config.ts` (tsconfig.app.json
 * and tsconfig.node.json). `supabase/` is in none of them — deliberately, since this code is not
 * part of the site bundle and imports things the browser build has never heard of. That leaves the
 * Edge Function, which is the only thing in the system with the authority to change a game, as the
 * one piece of TypeScript nothing typechecks.
 *
 * `tsconfig.check.json` next to this file closes that gap:
 *
 *     npx tsc -p supabase/functions/room/tsconfig.check.json
 *
 * Only the two members the function actually uses are declared. A fuller `Deno` namespace would
 * mean this file could drift from the runtime without anything noticing; a narrow one fails to
 * compile the moment the function reaches for something that was never checked.
 */
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

/**
 * supabase-js is imported by its fully-qualified `npm:` specifier (see the note in index.ts about
 * why the import map is not used). TypeScript will not resolve that through `paths` — it reads the
 * `npm:` prefix as a URL scheme and stops — so the installed package's own declarations are
 * re-exported under that exact specifier here. `createClient` and `SupabaseClient` are therefore
 * the real types, not `any`, which is the whole point of running this check at all.
 */
declare module 'npm:@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js'
}
