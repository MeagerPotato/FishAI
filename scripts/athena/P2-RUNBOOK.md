# P2's run: how to start it, what to watch, what to do when it breaks

ATHENA.md §9 is the registration and this file is only the procedure. **If the two disagree, §9 wins.** Every command
below was run on this machine, at a small size, on 2026-09-19; nothing here has trained a network yet.

Paths are this machine's. `$BENCH` is `C:/Projects/FishAI-bench`, `$PY` is `$BENCH/venvs/athena/Scripts/python.exe`,
and `$ENV` is a built port, `$BENCH/athena/p1/a/builds/default`.

## 1. Before the run

```bash
git -C C:/Projects/FishAI pull --ff-only origin main
npm run typecheck && npm run lint && npx vitest run
```

**The reference must still judge the port** (§9.5). The checker is a Rust binary; building it takes about 8 seconds
and needs no Python:

```bash
PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR=C:/Projects/FishAI-bench/athena/p2/target-replay cargo build --release --manifest-path athena-env/Cargo.toml --bin replay-check
```

```bash
C:/Projects/FishAI-bench/athena/p2/target-replay/release/replay-check.exe --corpus C:/Projects/FishAI-bench/athena/corpus/7d85c2e --threads 4
```

It must end with `G0a (i), port replay: PASS`. It takes about a second. **Run it again at the end of the run**, before
G2 is read.

**Prove the wiring in three seconds**, on the CPU, without touching the GPU:

```bash
PYTHONPATH=C:/Projects/FishAI-bench/athena/p1/a/builds/default C:/Projects/FishAI-bench/venvs/athena/Scripts/python.exe scripts/athena/p2_train.py smoke --out C:/Projects/FishAI-bench/athena/p2/smoke --cpu --bridge-reveal reduced --digest-check full
```

It must print `PASS`, with `divergences: []`, `service_faults: 0` and the export check's `PASS`.

Then: nothing else may hold the GPU (`nvidia-smi`), at least 20 GB free on the run's drive, and no other heavy job of
ours running. The run wants the GPU, 4–6 of 24 threads, 6–10 GB of RAM (§9.9).

## 2. Starting it

```bash
PYTHONPATH=C:/Projects/FishAI-bench/athena/p1/a/builds/default C:/Projects/FishAI-bench/venvs/athena/Scripts/python.exe scripts/athena/p2_train.py train --out C:/Projects/FishAI-bench/athena/p2/run1 --arch M --d2-views C:/Projects/FishAI-bench/athena/p1/b/views3/d2-1,C:/Projects/FishAI-bench/athena/p1/b/views3/d2-2,C:/Projects/FishAI-bench/athena/p1/b/views3/d2-3,C:/Projects/FishAI-bench/athena/p1/b/views3/d2-4,C:/Projects/FishAI-bench/athena/p1/b/views3/d2-5,C:/Projects/FishAI-bench/athena/p1/b/views3/d2-6,C:/Projects/FishAI-bench/athena/p1/b/views3/d2-7 --digest-check d --bridge-reveal reduced
```

Start it in the background and leave it. It writes into `$BENCH/athena/p2/run1`:

| file | what it holds |
|---|---|
| `train.jsonl` | one line an iteration: games, decisions, the losses, entropy, throughput, the counters |
| `curve.jsonl` | one line every two hours: the win rate over 1,200 games against Monet v1.0 on bank `athena-p2-curve` |
| `ckpt-*.pt`, `last.pt` | a checkpoint every 30 minutes, with the optimiser state |
| `summary.json` | written when it stops, whatever stopped it |

## 3. The first hour, which is the part that needs eyes

Read the first few `train.jsonl` lines and check three things.

1. **Games are ending.** `capped` should be a small share of `games`, and `decisions / games` should not sit at the
   6,000-step cap. §9.12 item 17 registered this as the open question: a fresh policy declares at nearly every window,
   and the fix for that (a decline bias) can swing the other way into games that never end. If most games are capped,
   stop, set `--init-decline-bias` to what the log suggests, record it in §9.12, and restart.
2. **Throughput.** `games_per_s` × 86,400 must stay above 5 × 10⁶ games a day (§9.8 stop rule 2), against §3.1's
   30–48 × 10⁶ estimate at M.
3. **No divergence.** `divergences` empty and `service_faults` 0. Any entry stops the run (§9.8 rule 1). After the
   first hours, `--digest-check d` can be dropped to `off` for speed.

Also worth one look: VRAM at 8–12 GB of 16. Near 16 means the batch has spilled into shared memory and throughput
collapses — that is what §3.1 measured at L.

## 4. Then leave it alone

The curve is an instrument, not a decision (§9.6): it does not choose the checkpoint and it does not stop the run.
Watch it only for stop rule 4 — if it has not moved above 30% by 3 × 10⁷ games, report to the owner before spending
the rest of the budget. A curve line with `"win_rate": null` and a fault is a read where no pair finished; that is
expected of an early policy and is not a zero (§9.12 item 19).

**If it dies:** resume from the last checkpoint, which costs at most 30 minutes.

```bash
... p2_train.py train --out .../run1 --resume .../run1/last.pt
```

A resumed run is the same run. Record what died, at which iteration, and which checkpoint it came back from. Twice
from the same cause is stop rule 3: stop and fix it.

## 5. When the three days are up

```bash
... p2_train.py export --ckpt .../run1/last.pt --weights .../run1/weights.bin --check 300
```

The export must pass its check against the JavaScript forward at §8.3's bar. Then, **once**:

```bash
node scripts/athena/p2-read.mjs g2 --weights C:/Projects/FishAI-bench/athena/p2/run1/weights.bin --procs 8 --out C:/Projects/FishAI-bench/athena/p2/run1/g2.json
```

14,400 games on the twelve registered seeds, about 30–45 minutes. Report the pooled win rate, every seed's rate, both
ship-rule numbers, §6.2's controls and §9.10's twelve predictions, scored.

**The candidate is the last checkpoint** (§9.7). Do not read G2 more than once, and do not pick a checkpoint by its G2
score — that would make the gate a hindsight oracle.
