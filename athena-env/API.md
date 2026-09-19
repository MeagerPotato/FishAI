# `athena_env`: the Python batch API over the us54 rules core

This is ATHENA P0's batched environment (ATHENA.md §4.5 item 2): the Rust port of `lib/engine/`, which G0a (i) gated
byte for byte against the reference, behind a NumPy API for the learner.

- The rules live in the core crate, `athena-env/` (`src/rules.rs`). It has no dependencies and forbids `unsafe`.
- The batch environment, the action codes, the legal masks and the observation encoding live in the core too, in
  `src/vecenv.rs`, so `cargo test` covers them.
- The bindings are a separate crate, `athena-env/py/` (PyO3 and rust-numpy). It only checks arguments, borrows the
  NumPy buffers and releases the GIL.

**Status.**

- The action encoding and the legal masks are fixed.
- **The observation encoding is provisional.** P1 finalises it (ATHENA.md §1: "The sizes and the event encoding are
  P1's to register"). P1 may, for example, add the rules-derived facts of `lib/engine/bots/knowledge.ts`, which P0
  does not port.
- Every layout below is a named constant of the module (`athena_env.OBS_LEN`, `athena_env.L_DECLINE`, ...). Code
  that reads the buffers should use the constants, not the numbers.

## 1. Build and install

The toolchain is the one ATHENA.md §4.10 installed: the venv at `C:\Projects\FishAI-bench\venvs\athena`, Rust 1.98
(not on PATH), and the VS 2022 Build Tools linker.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
export VIRTUAL_ENV=C:/Projects/FishAI-bench/venvs/athena
cd athena-env/py
$VIRTUAL_ENV/Scripts/python.exe -m maturin develop --release   # builds and installs `athena_env` into the venv
```

`maturin build --release` builds a wheel instead, into `athena-env/py/target/wheels/`. Build output is git-ignored.

## 2. Quick start

```python
import numpy as np
import athena_env as ae

env = ae.BatchEnv(4096, threads=4, auto_reset='run1-', auto_reset_start=4096)
env.reset([f'run1-{i}' for i in range(4096)], np.arange(4096) % 6)   # the TypeScript reference's deals
bufs = env.make_buffers()                  # preallocated uint8 arrays, filled in place from now on
env.observe(bufs)
while training:
    actions = policy(bufs['obs'], bufs['events'], bufs['n_events'], bufs['legal'], bufs['seat'])  # int32, one a game
    reward, terminated, truncated = env.step(actions, bufs)   # steps, auto-resets, and refills bufs
```

Each call to `step` applies **one action in every game, for that game's acting seat**:

- the seat holding the declare window's option, while the window is open;
- otherwise, the turn seat (to ask, or to pass in `awaitPass`).

A game is about 640 steps under G0b's stub. Most of those steps are window offers.

## 3. `BatchEnv`

| member | what it does |
|---|---|
| `BatchEnv(n, threads=1, auto_reset=None, auto_reset_start=0, track_digests=False)` | `n` games. `threads` workers do every step and observation, and the calling thread is one of them. `auto_reset` is a seed prefix (§3.2). `track_digests` keeps the replay format's digest streams for `digests()` (for tests; it slows every step) |
| `reset(seeds, start_seats)` | Deals game i from `seeds[i]` (a `str`) at `start_seats[i]` (0–5). A seed deals exactly the hands that `newGame(seed, us54Config, start)` deals in `lib/engine/`: xmur3 over UTF-16 code units, then Fisher–Yates |
| `reset_deals(holders, start_seats)` | Starts each game from a given deal. `holders` is a `(n, 54)` uint8 array holding the seat of each card. Meant for tests and hand-built positions |
| `make_buffers(critic=True)` | A dict of zeroed, C-contiguous uint8 buffers: `seat`, `obs`, `legal`, `events`, `n_events`, and `critic` unless `critic=False` (§5) |
| `observe(bufs)` | Fills the buffers **in place**, for every game's acting seat. It consumes each observing seat's pending event rows (§5.3) |
| `step(actions, bufs=None)` | `actions` is a 1-d int32 or int64 array of `n` action codes (§4). Returns `(reward, terminated, truncated)`: a float32 array `(n, 2)` and two bool arrays `(n,)` (§3.1). With `bufs`, every game is observed after the step, in the same parallel pass |
| `digests()` | Needs `track_digests=True`. Returns `(d, l, v)`, three uint64 arrays `(n,)`: `d` is the state chain after the last step (the deal digest before any step); `l` and `v` are the legal-move and view digests of the current state for its acting seat (replay-format.md §4.6, §4.7, §5) |
| `steps()`, `ended()`, `scores()`, `seeds()`, `start_seats()` | Per game: the actions applied; the end state (0 running, 1 finished, 2 capped); the absolute score `(n, 2)`; the seed; the start seat |
| `stats()` | A dict of counters over the environment's life: `steps`, `finished`, `capped`, `ended_steps`, `wins_team0`, `wins_team1`, `observations`, `max_backlog`, `auto_resets` |
| `threads` | Settable. `n` gives the number of games, as does `len(env)`. `next_game` gives the next auto-reset game number |
| `set_auto_reset(prefix, start=0)` | Turns auto-reset on (a prefix) or off (`None`) |
| `debug_permute_hidden(i, rng_seed)` | **A test hook** for the information rules (§6). It re-deals the cards that game i's acting seat cannot see, and returns whether any moved |
| `set_mutant(name)` | **Only in a mutants build** (§10). Plants one of G0a's mutants, `"M1"` to `"M5"`, in every game of the batch, and in every game dealt later; `"none"` restores the reference's rules. A default build has no such method |

The module constant `athena_env.MUTANTS` says which build is loaded: False in every default build, True in a mutants
build.

### 3.1 Rewards and ends

- **The reward is the game result:** +1 to the winning team and −1 to the losing team, on the step the game
  finishes. It is 0 otherwise.
  - `reward[:, 0]` is team 0 (seats 0, 2, 4), and `reward[:, 1]` is team 1.
  - A seat's reward is `reward[i, seat % 2]`.
  - The set difference is not a reward (ATHENA.md §1).
- `terminated[i]` means the game finished on this step: a clinch at five awarded sets.
- `truncated[i]` means the game hit the harness's cap of 6,000 steps (ATHENA.md §4.1 item 13). Its reward is 0.
  Capped games are counted in `stats()['capped']`, never dropped.
- **Without auto-reset,** an ended game stays ended. Its later actions are ignored, and its flags are raised only on
  the step it ended. It is still observed, for the seat that acted last: a finished game shows phase 2 and an
  all-zero legal row, and a capped game shows the state it was capped in.

### 3.2 Auto-reset

- With `auto_reset=prefix`, a game that ends during `step` is replaced at once, in the same call, by game k:
  - its seed is `prefix + str(k)`;
  - its start seat is `k % 6`;
  - k counts up from `auto_reset_start`.
- **The games that end in one step take their numbers in slot order.** So which games are played never depends on
  the thread count.
- The step's `reward`, `terminated` and `truncated` describe the game that ended. The buffers then hold the new
  game's first observation.
- The seed convention matches the corpus's H5: game i is `<prefix><i>`, with start seat `i % 6`.

### 3.3 Threads, the GIL, determinism

- `step`, `observe`, `reset` and `reset_deals` release the GIL for all of their Rust work.
- The batch is split into `threads` contiguous chunks, stepped with `std::thread::scope`. The calling thread takes
  the first chunk.
- **Results are identical for every thread count:** the buffers, the rewards, the digests and the auto-reset
  numbering. Both test suites assert this, for 1–4 threads.
- One call at a time per environment. A concurrent second call on the same object raises PyO3's borrow error
  (`RuntimeError`). Separate environments
  may step concurrently from separate Python threads.
- Spawning scoped threads costs about 60 µs a thread per call on this machine, measured under load. Batches of
  several thousand games per call amortise it.

### 3.4 Errors

Errors are loud: `ValueError`, `TypeError` or `KeyError`, never a silent skip.

- **An illegal action or an unknown code raises,** naming the first such game and the reducer's error code, such as
  `DECLARE_WINDOW_OPEN`. That game is unchanged, as the reference leaves a refused action. The other games were
  stepped.
- Wrong shapes, wrong dtypes and non-contiguous buffers raise. So does an array given twice.
- Observing before `reset` raises.
- So does an event backlog above `MAX_EVENTS` (§5.3).

## 4. The action encoding (fixed)

One integer per decision, **relative to the acting seat** `me`. Relative seat r is seat `(me + r) mod 6`:

- rel 0 is the actor;
- rels 2 and 4 are its teammates;
- rels 1, 3 and 5 are its opponents.

| codes | action | fields |
|---|---|---|
| `0 … 161` (`N_ASK` = 162) | **ask** | `code = k * 54 + card`. Opponent k = 0, 1, 2 is rel `2k + 1`, which is seat `(me + 2k + 1) mod 6`. The card is 0–53, in canonical order (below) |
| `162` (`A_DECLINE`) | **decline** the declare window's option | — |
| `163`, `164` (`A_PASS`, `A_PASS + 1`) | **pass** the turn (`awaitPass`) | to teammate rel 2, or to teammate rel 4 |
| `165 … 6725` (`A_DECLARE` + set · 729 + a) | **declare** (claim) a set | set 0–8. The assignment is `a = Σ_j d_j · 3^j`: card j of the set, in set card order, is stated at teammate rel `2 d_j`, with d_j in {0, 1, 2}. `N_ACTIONS` = 6,726 |

- **Cards** run suit-major C, D, H, S. Within a suit the ranks run 2 3 4 5 6 7 8 9 T J Q K A; then XR = 52 and
  XB = 53. So 2C = 0, 8C = 6, AC = 12 and 8S = 45.
- **Sets** run LOW-C, LOW-D, LOW-H, LOW-S, HIGH-C, HIGH-D, HIGH-H, HIGH-S, EIGHTS.
- **A set's card order** is ascending card index. `SET_CARDS[s]` lists it, and EIGHTS is `[6, 19, 32, 45, 52, 53]`.
- **Examples.**
  - Seat 4 asking seat 1 for 8H: seat 1 is rel 3, which is opponent 1, and 8H is card 32. The code is 54 + 32 = 86.
  - Seat 1 declaring EIGHTS, with cards 0–2 at itself, cards 3–4 at seat 3 and card 5 at seat 5: the digits are
    0, 0, 0, 1, 1, 2. The code is 165 + 8·729 + 27 + 81 + 2·243 = 6,591.
- `decode_action(seat, code)` gives an action with absolute seats, and `encode_action(kind, seat, ...)` is its
  inverse. Every action the reducer can accept has exactly one code. A code can still name an illegal action; the
  legal row says which codes are legal.

## 5. The buffers

All buffers are uint8. One row a game, in batch order. `NONE` = 255 marks an absent value.

### 5.1 `seat` (n) and `legal` (n × `LEGAL_LEN` = 174)

`seat[i]` is the absolute seat of game i's acting seat, the observer. It is public, and the learner needs it to keep
a recurrent state for each seat. The legal row holds 0 or 1 in each byte:

| bytes | constant | meaning |
|---|---|---|
| 0–161 | `L_ASK` | ask code c is legal |
| 162–170 | `L_DECLARE` | set s may be declared. Every own-team assignment of a legal set is legal, so the declare's six assignment digits are unconstrained |
| 171 | `L_DECLINE` | the decline is legal |
| 172–173 | `L_PASS` | a pass to teammate rel 2, and to teammate rel 4, is legal |

- **The legal row is the reducer's own verdict.**
  - The asks come from `Game::legal_asks`, which G0a's legal-move digests gate against `legalAsks`.
  - The declare sets, the decline and the passes are `Game::validate` on the action.
- **The Rust tests compare every one of the 6,726 codes with `validate`** at every step of 48 games: 24 of the mixed
  stub and 24 of the fuzz policy.
- **The Python corpus test re-encodes the legal row** as the reference's legal-move record L_t on 70,720 sampled
  steps of H4 and H5, and every one equals the corpus's l_t.
- `legalActionsSummary`'s over-reported `claim`, listed while the window is closed, is not copied
  (replay-format.md §4.6).
- **Exactly one decision kind is open at a time:** asks, or declare/decline, or passes.
  - A game whose window is open on the actor has declare sets, and has a decline unless it is `MUST_DECLARE`.
  - A game whose window is closed has asks, or passes in `awaitPass`.
  - A finished game (auto-reset off) has an all-zero row.

### 5.2 `obs` (n × `OBS_LEN` = 94). Provisional

| bytes | constant | field |
|---|---|---|
| 0–53 | `O_HAND` | the observer's hand: 1 if it holds card c |
| 54–59 | `O_COUNTS` | every seat's hand count, in relative order (rel 0 first) |
| 60 | `O_PHASE` | 0 playing, 1 awaitPass, 2 finished |
| 61 | `O_TURN` | the turn seat, relative |
| 62 | `O_WINDOW` | 1 if the declare window is open |
| 63 | `O_OPTION` | the window's option seat, relative (NONE when closed) |
| 64 | `O_DECLINED` | declines so far in this window, 0–5 (NONE when closed) |
| 65, 66 | `O_SCORE` | the observer's team's score, then the other team's |
| 67–93 | `O_SETS` | nine sets × `SET_FIELDS` = 3: **status** (0 open, 1 awarded to the observer's team, 2 to the other team); **claimer**, relative (NONE if open); **how** (0 right; 1 wrong, an opponent of the declarer held a card; 2 wrong, the declarer's team held all six but misassigned; NONE if open) |

### 5.3 `events` (n × `MAX_EVENTS` = 32 × `EVENT_LEN` = 19) and `n_events` (n). Provisional

`events[i, :n_events[i]]` are the public events logged since game i's observer last observed, oldest first. They are
fixed-width rows for a recurrent encoder, and fields an event lacks are NONE:

| byte | constant | field |
|---|---|---|
| 0 | `E_TYPE` | 0 game_started, 1 ask, 2 declare, 3 pass, 4 player_out, 5 game_over |
| 1 | `E_ACTOR` | relative: the start seat, the asker, the declarer, the passer, or the emptied seat |
| 2 | `E_TARGET` | relative: the ask's target, or the pass's receiver |
| 3 | `E_CARD` | the card asked for |
| 4 | `E_HIT` | the ask's outcome, 0 or 1 |
| 5 | `E_SET` | the declared set |
| 6 | `E_RESULT` | for a declare, the team awarded the set; for game_over, the winner: 0 the observer's team, 1 the other team |
| 7–12 | `E_ASSIGN` | a declare's stated seat for each card, relative, in set card order |
| 13–18 | `E_HOLDERS` | each card's true holder at the declare, relative. It is public even for a wrong declare (ATHENA.md §4.1) |

- **Each seat sees each event exactly once, in log order.**
  - `game_started` comes first.
  - Declines are not logged, as in the reference. They show only through the window bytes.
  - Rows at and past `n_events[i]` are left as they were, so read only the first `n_events[i]`.
- **The backlog is bounded.**
  - A seat observes at every window it is offered, and every ask is preceded by six consecutive declines, one from
    each seat.
  - So between two of a seat's observations there is at most one ask. With at most 9 declares, 6 player_outs,
    9 passes, the game_over and the game_started, no backlog exceeds 27.
  - The largest seen in the corpus replay is 13 (H4) and 8 (H5).
- **Observe after every step,** or pass `bufs` to `step`. A caller that skips observing lets backlogs grow, and a
  backlog past `MAX_EVENTS` raises instead of dropping events.
- **The events of a game's last step** reach no seat under auto-reset, because the slot is dealt its next game at
  once. Without auto-reset, the ended game's acting seat receives them, `game_over` included. Either way, the end is
  reported by `reward`, `terminated` and `truncated`.

### 5.4 `critic` (n × `CRITIC_LEN` = 54). Training only

- **The true deal:** each card's holder, relative to the observer. NONE marks a card out of play, once its set has
  resolved.
- The critic buffer is `54 × 6` in compact form: `F.one_hot(critic.long().clamp(max=6), 7)[..., :6]` expands it on
  the GPU. It is for ATHENA's perfect-information critic (ATHENA.md §1: "The actor never sees it").
- It is a separate buffer and never part of any actor buffer. `make_buffers(critic=False)` omits it, and the
  environment then does not compute it.
- **G0b's stub reads it,** because the mixed stub declares the sets its team holds by the true deal (ATHENA.md §4.3). That stub
  is not a player.

## 6. The information rules

- **The actor's buffers hold nothing that `seatView(S_t, acting)` does not show.** They are `seat`, `obs`, `legal`,
  `n_events` and the delivered `events` rows.
  - `seatView` is the public state plus the seat's own hand: the counts, phase, turn, window, score, the set block
    with its true holders, and the log.
  - The obs row and the event rows are functions of exactly that.
- **One legal bit depends on a hidden hand: the decline.** `MUST_DECLARE` asks whether the turn-holder could ask.
  - It is still a function of the view in every reachable state.
  - The window always opens on the turn-holder, so an option seat other than the turn-holder exists only after the
    turn-holder declined legally, and declines move no cards.
  - The Rust tests check the view-only formula against the reducer at every step.
- **Tested three ways:**
  1. **Rust, at every step of 48 games** (`hidden_cards_never_reach_the_actor_buffers`). Every game's hidden cards
     are re-dealt at random: each card the actor cannot see is dealt again among the seats holding those cards, and
     each hand keeps its count. Both copies observe. The actor bytes are equal, and the critic differs, in every
     comparison.
  2. **Python, two deals** (`test_info_rule.py`). The deals differ only in cards outside the start seat's hand. The
     start seat's actor buffers are identical at the opening window, and again at its first ask.
  3. **Python, mid-game re-deals.** The same check at ten checkpoints of NumPy-stub play, through
     `debug_permute_hidden`.
- **Both tests catch a planted leak.** A copy of the obs row with one hidden bit written into it fails the Python
  test. The same leak planted in the Rust encoder fails the Rust test.
- **`debug_permute_hidden` redraws** any permutation that changes whether the turn-holder could ask. Such a state
  has the same view but is unreachable, as the point on the decline explains.

## 7. Security (D12, ATHENA.md §5)

- **The core crate is dependency-free and `#![forbid(unsafe_code)]`.** It is pure computation: no file, network or
  process access.
- **The bindings crate depends on PyO3 0.29 and rust-numpy 0.29, and nothing else directly.** Their transitive
  crates, such as `ndarray`, `num-*` and `libc`, are pinned with them in `athena-env/py/Cargo.lock`.
  - It writes no `unsafe` code of its own, and `#![deny(unsafe_code)]` checks that. PyO3's generated glue is
    PyO3's.
  - It opens nothing and runs nothing.
- `athena-env/py/Cargo.toml` is its own workspace root. The core's `Cargo.lock` stays empty of dependencies.
- The Vercel build never sees any of this: `.vercelignore` excludes `/athena-env` and the Python scripts in
  `scripts/athena/`.

## 8. Tests

```sh
cargo test --release                          # in athena-env: the core, vecenv included
python athena-env/py/tests/test_api.py        # the contract: codes, errors, threads, auto-reset, GIL, the stub
python athena-env/py/tests/test_info_rule.py  # the information rules
python athena-env/py/tests/test_corpus.py     # H4 and H5 reproduced through the API (needs the corpus)
python athena-env/py/tests/test_harness.py    # the home harness and the opponent service (§11; needs node)
cargo test --release --features mutants       # in athena-env: the same, plus the batch's planted M1 (§10)
```

- The Python tests need only the venv (no pytest), and `python` means the venv's.
- `test_corpus.py` reads `C:/Projects/FishAI-bench/athena/corpus/7d85c2e/`. Set `ATHENA_CORPUS` to read another
  corpus.
- `test_harness.py` tests the venv's build, or the unpacked build that `ATHENA_ENV_PATH` names. With
  `ATHENA_ENV_MUTANTS` naming an unpacked mutants build (§10), it also checks that M1 is caught, in a child process.

## 9. G0b

`scripts/athena/g0b-bench.py` measures G0b as ATHENA.md §4.6 registers it: this API, the mixed stub's rule in NumPy
over the legal masks, and the buffers filled every step. Its docstring gives the modes and the exact commands.

## 10. The mutants build (G0c's control)

G0c's third check plants M1 in the port and must see the live replay check fail (ATHENA.md §4.6). The core's
`mutants` feature (G0a's M1–M5) reaches Python only through the bindings' own `mutants` feature, which is off by
default:

- **The default build** (`maturin develop --release`, or `maturin build --release`) compiles no mutant code:
  `BatchEnv` has no `set_mutant`, and `athena_env.MUTANTS` is False. `test_harness.py` asserts both.
- **A mutants build** is made only on request, and is never installed into the venv:

  ```sh
  cd athena-env/py
  CARGO_TARGET_DIR=target/g0c-mutants python -m maturin build --release --features mutants -o <dir>/mutants-wheel
  python -m zipfile -e <dir>/mutants-wheel/athena_env-*.whl <dir>/mutants
  ```

  A process that puts `<dir>/mutants` first on `sys.path` imports it instead of the venv's build. The harness does
  this with `--athena-env <dir>/mutants`, and checks which build it loaded. `scripts/athena/g0c-pin.py --build-envs`
  builds and unpacks both builds this way.
- `set_mutant` plants the mutant in every slot, and every later deal (`reset`, `reset_deals`, auto-reset) keeps it.

## 11. The home harness and the opponent service

- **The opponent service,** `scripts/athena/opponent-service.mjs`, is a Node process with a pool of worker threads.
  It keeps the TypeScript reference's `GameState` of every game and applies this API's action codes to it. It
  answers Monet's decisions with the lab's seeding, and returns the reference's digests d, l and v with every answer.
  The protocol (newline-delimited JSON) is in its header. The rules half is `opponent-core.ts`.
- **The harness,** `scripts/athena/home_harness.py`, steps a `BatchEnv(track_digests=True)`. It takes Monet's seats
  from the service and other seats from Python policies, and compares the service's digests with `digests()` at
  every step.
  - Geometry A is `duplicate-pairs.mjs`'s.
  - Geometry B is the bridge cell's shape, with its rotation rule defined in the harness's header.
- **G0c** is `scripts/athena/g0c-pin.py`. It runs the reference, the harness on the default build, and the harness on
  the mutants build with M1, and scores the three checks.
