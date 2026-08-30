# The room backend

Shared-room multiplayer runs on Supabase project `fnandjtzwhihgefkfwzj`
(`https://fnandjtzwhihgefkfwzj.supabase.co`). This file records what is deployed there, because
the schema is otherwise invisible from the repository — and the one thing this feature cannot
afford is a backend nobody can reconstruct or review.

## The security model, in one sentence

`rooms` carries only what the engine's `publicView()` carries, so reading it teaches you nothing
you would not learn sitting at the table; hands live in `room_private`, which no browser can read
at all; and every move is applied by an Edge Function running the real `lib/engine` reducer.

That is a claim worth re-testing rather than trusting. From any browser, with the publishable key:

```js
const URL = 'https://fnandjtzwhihgefkfwzj.supabase.co'
const KEY = 'sb_publishable_d1b4UsjCjPbUj_T7Nf4Z3A_huFE0Ol9'
const h = { apikey: KEY, Authorization: 'Bearer ' + KEY }
await (await fetch(`${URL}/rest/v1/rooms?select=*`, { headers: h })).json()      // 200, no hands
await (await fetch(`${URL}/rest/v1/room_private?select=*`, { headers: h })).text() // 401
```

Measured on a table of seven live games: the whole readable payload held **zero** hand
identities. The only card names in it were inside `ask` events in the public log, which is
correct — an ask is spoken aloud, and RULES_US54.md row 17 makes it public.

## Tables

```sql
-- Readable by anyone, writable by nobody. Every mutation goes through the Edge Function.
create table public.rooms (
  id            uuid primary key default gen_random_uuid(),
  status        text not null default 'lobby' check (status in ('lobby','playing','finished')),
  public_state  jsonb,                                   -- publicView(); null while in lobby
  version       integer not null default 0,              -- optimistic concurrency, see room_commit
  lobby         jsonb not null default '{"players": []}',
  pace_ms       integer not null default 3000,
  created_at    timestamptz not null default now(),
  last_activity timestamptz not null default now()
);
create index rooms_last_activity_idx on public.rooms (last_activity);

-- The authority. RLS on with ZERO policies and no grants: anon is refused before RLS is even
-- consulted. Only the service role, inside the Edge Function, ever reads this.
create table public.room_private (
  room_id    uuid primary key references public.rooms(id) on delete cascade,
  code_hash  text not null unique,   -- the join code is hashed here and never stored readable
  state      jsonb,                  -- the full GameState, all six hands
  seats      jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  bucket       text primary key,
  count        integer not null default 0,
  window_start timestamptz not null default now()
);
```

The join code lives only as a hash, and only on the table nobody can read. Enumerating `rooms`
therefore yields spectatable public state but never a code to join with.

## Functions

| Function | Why it exists |
| --- | --- |
| `room_commit(...)` | One move touches two tables and PostgREST has no cross-request transaction. Bumps `rooms.version` only if it still holds the value the caller read, and writes both rows or neither. Contains **no game logic** — the rules run in the Edge Function. |
| `rate_take(bucket, limit, window)` | Fixed-window counter taken in a single statement, so concurrent callers cannot both read 4 and both write 5. |
| `bump_rate_limit(bucket)` | Superseded by `rate_take`. |

`EXECUTE` is revoked from `anon` and `authenticated` on all three.

## Realtime, and scheduled cleanup

`public.rooms` is in the `supabase_realtime` publication, so every seat is pushed the new public
row on each move and then asks the function for its own `seatView`.

Two `pg_cron` jobs, both from the original migration:

- `delete-stale-rooms` — every 15 minutes, drops rooms untouched for 6 hours. The cascade on
  `room_private` is what actually discards the hands.
- `clean-rate-limits` — hourly.

**There is exactly one room sweeper, deliberately.** A second one was added during this work on
the belief that none existed, and reverted in `drop_redundant_room_sweeper`: the 6-hour job always
deletes first, so the additional 12-hour job was a scheduled no-op that read like policy.

## Deploying the Edge Function

The function is `room`, `verify_jwt: false`, at
`POST https://fnandjtzwhihgefkfwzj.supabase.co/functions/v1/room`, with actions
`create | join | team | sync | leave | act`.

> **Every redeploy must pass `import_map_path: "deno.json"` explicitly.** The API stores
> `import_map_path` as an absolute path into the temp directory of the version that set it, then
> re-resolves that stale path against the next deploy — so the second and every later deploy fails
> unless the path is given again.

`supabase/functions/room/engine/` is a **generated** flat copy of the nine non-bot modules of
`lib/engine/`. Regenerate it with `node scripts/sync-room-engine.mjs`; `tests/room/engine-copy.test.ts`
fails if the copy has drifted by so much as a character. A silently drifted copy of the rules
engine is the worst failure this feature has available to it — the server would enforce one rule
set while every client explained a different one.

The function is outside the four gates' scope, so it has its own typecheck:

```bash
npx tsc -p supabase/functions/room/tsconfig.check.json
```

## Known gaps

- A player who abandons a game mid-play is simply waited for. There is no timeout and no
  substitution.
- The publishable key is committed on purpose. It is shipped to every browser that loads the site
  and grants only what the policies above allow. The service role key is never in client code;
  Supabase injects it into the function's environment.
