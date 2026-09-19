"""
g0b-bench.py: ATHENA P0's gate G0b, throughput end to end (ATHENA.md §4.6).

What G0b registers, and what this script does for each part:

- "the Rust core behind its Python batch API": `athena_env.BatchEnv` (athena-env/py), stepped with auto-reset, every
  step one action for every game's acting seat, on `--threads` threads with the GIL released.
- "the mixed stub's rule implemented in NumPy over the port's legal masks": `MixedStub` below, vectorised over the
  batch. It reads only the observation buffers: the legal row, the window and phase bytes, and, because the mixed
  stub declares the sets its team holds entirely "reading the true deal" (§4.3), the critic buffer. It is a stub,
  not a player; no actor ever reads that buffer.
- "the observation buffers filled": every step passes the buffers (`seat`, `obs`, `legal`, `events`, `n_events` and
  `critic`) to `step`, which fills them for every game after the step.
- "at least 200,000 games after 10,000 of warm-up": games are counted as they end (finished or capped; capped games
  are counted and reported, never dropped). Timing starts when the warm-up count is reached and stops at the first
  step on which --games more have ended.
- "on a host at <= 10% load before the start": with --registered the script samples the total processor load with
  typeperf (five one-second samples) and refuses to run above 10%. Without it the run is labelled CONTENDED.

The mixed stub's rule (§4.3; scripts/athena/mixed-stub.ts): at a window offer, with probability 0.01 a uniformly random
declare (a uniform open set, a uniform own-team seat for each of its six cards); otherwise the first open set the
offered seat's team holds entirely, declared at its true holders; otherwise a decline if one is legal, else the random
declare. In awaitPass, a uniform teammate holding cards. With the window closed, a uniform legal ask. Here the draws
come from NumPy's PCG64 rather than the reference's mulberry32: the rule is the same, the random stream is not (the
draw-for-draw stub is the Rust `stub::mixed_stub_action`, which regenerated the corpus's H5 in G0a).

How T threads are used (--mode, default pipeline): the batch is two halves, each a BatchEnv(threads=T-1). The calling
thread runs the NumPy stub on one half while a helper thread steps the other (the helper is one of that env's T-1
workers), then they swap. So at most T threads are busy at once: T-1 in Rust, one in NumPy. At T = 1 the pipeline
falls back to mode single, one BatchEnv(threads=T) with the stub between steps. Mode actors (one Python thread and one
BatchEnv(threads=1) a thread) is kept for comparison; the GIL serialises its stubs.

Usage (the venv's python; athena_env built with `maturin develop --release` in athena-env/py, API.md §1):

    python scripts/athena/g0b-bench.py --threads 1,2,4 --batch 32768      # contended or informational, <= 4 threads
    python scripts/athena/g0b-bench.py --registered --threads 8,1,2,4 --batch 32768    # the registered measurement

--registered refuses to start above 10% load, and more than 4 threads are refused without it. Prints the load
samples, one line a thread count with the time split (Rust step + observe vs the NumPy stub), the verdict at 8
threads, and a JSON summary line.
"""
import argparse
import json
import os
import platform
import re
import subprocess
import sys
import threading
import time

import numpy as np
import athena_env as ae

EPS = 0.01
SET_CARDS = np.asarray(ae.SET_CARDS, dtype=np.intp)  # (9, 6), set card order
SET_BITS = [np.uint64(sum(1 << c for c in cards)) for cards in ae.SET_CARDS]  # each set's cards as a 54-bit mask
POW3 = (3 ** np.arange(6)).astype(np.int32)  # a declare's assignment digits, card j's digit weighted 3**j
DECL_ROW = slice(ae.L_DECLARE, ae.L_DECLARE + ae.N_SETS)
PASS_ROW = slice(ae.L_PASS, ae.L_PASS + 2)
# FIRST[h] for a 9-bit set of held sets: the first (lowest) set held, or 9 for none.
FIRST = np.array([((h & -h).bit_length() - 1) if h else 9 for h in range(512)], dtype=np.int32)
# BYTE_SELECT[v, r]: the position of the r-th set bit (from bit 0) of the byte v.
BYTE_SELECT = np.full((256, 8), 255, dtype=np.uint8)
for _v in range(256):
    for _r, _b in enumerate(b for b in range(8) if _v >> b & 1):
        BYTE_SELECT[_v, _r] = _b
# Eight 0/1 bytes of a little-endian uint64 to eight bits: ((x & ONES) * MAGIC) >> 56 puts byte i's bit at bit i.
ONES = np.uint64(0x0101010101010101)
MAGIC = np.uint64(0x0102040810204080)


def pick_uniform(mask, rng):
    """For each row of a (k, w) 0/1 array with at least one 1, a uniformly drawn column holding a 1."""
    k, w = mask.shape
    nz = np.flatnonzero(mask)
    counts = np.count_nonzero(mask, axis=1)
    if counts.min(initial=1) == 0:
        raise AssertionError('a row the stub must act on has no legal entry')
    starts = np.cumsum(counts) - counts
    r = (rng.random(k) * counts).astype(np.intp)
    return nz[starts + r] - np.arange(k, dtype=np.intp) * w


def pick_uniform_packed(mask, rng):
    """pick_uniform for wide rows, over the rows packed to bits: draw r uniform below the row's count of 1s, find
    the byte holding the r-th 1 from the per-byte popcounts, and the bit within it from BYTE_SELECT. Exact."""
    k = mask.shape[0]
    p = np.packbits(mask, axis=1, bitorder='little')
    c = np.bitwise_count(p)
    cs = np.cumsum(c, axis=1, dtype=np.int16)
    total = cs[:, -1]
    if total.min(initial=1) == 0:
        raise AssertionError('a row the stub must act on has no legal entry')
    r = (rng.random(k) * total).astype(np.int16)
    byte = (cs > r[:, None]).argmax(axis=1)
    rows = np.arange(k)
    rank = r - (cs[rows, byte] - c[rows, byte])
    return byte.astype(np.intp) * 8 + BYTE_SELECT[p[rows, byte], rank]


class MixedStub:
    """The mixed stub's rule over a batch's observation buffers. `stub(bufs)` returns an int32 action per game."""

    def __init__(self, n, seed=0):
        self.rng = np.random.default_rng(seed)
        self.out = np.empty(n, dtype=np.int32)
        self.words = np.empty((n, 6), dtype=np.uint64)
        self.tail = np.empty(n, dtype=np.uint64)
        self.packed = np.zeros((n, 8), dtype=np.uint8)
        self.held = np.empty(n, dtype=np.uint16)
        self.tmp64 = np.empty(n, dtype=np.uint64)
        self.tmpb = np.empty(n, dtype=bool)

    def __call__(self, bufs):
        obs, legal, critic = bufs['obs'], bufs['legal'], bufs['critic']
        n = obs.shape[0]
        assert critic.flags.c_contiguous and critic.shape == (n, ae.CRITIC_LEN)
        out, rng = self.out, self.rng
        out.fill(ae.A_DECLINE)  # the decline rows keep it; a finished game's action is ignored (auto-reset off)
        window = obs[:, ae.O_WINDOW] == 1
        phase = obs[:, ae.O_PHASE]

        # At a window offer: the 1% random declare first (one draw, used only at a window).
        rand = window & (rng.random(n) < EPS)
        # The oracle: the first open set the offered seat's team holds entirely, by the true deal. Holders are
        # relative to the acting seat, so its team is rel 0, 2, 4 (even), and a card out of play is NONE = 255
        # (odd): a set is held iff none of its six cards has an odd byte. Pack the odd bits into one uint64 a game,
        # eight bytes at a time through unaligned uint64 views of each 54-byte row: bytes 0-47, then bytes 46-53
        # (in bounds for the last row) shifted past the two already counted.
        head = np.ndarray((n, 6), dtype=np.uint64, buffer=critic, offset=0, strides=(ae.CRITIC_LEN, 8))
        last = np.ndarray((n,), dtype=np.uint64, buffer=critic, offset=46, strides=(ae.CRITIC_LEN,))
        w, t = self.words, self.tail
        np.bitwise_and(head, ONES, out=w)
        np.multiply(w, MAGIC, out=w)
        np.right_shift(w, np.uint64(56), out=w)
        self.packed[:, :6] = w
        np.bitwise_and(last, ONES, out=t)
        np.multiply(t, MAGIC, out=t)
        np.right_shift(t, np.uint64(58), out=t)
        self.packed[:, 6] = t
        bits = self.packed.view(np.uint64)[:, 0]
        held, t64, tb = self.held, self.tmp64, self.tmpb
        held.fill(0)
        for s, m in enumerate(SET_BITS):
            np.bitwise_and(bits, m, out=t64)
            np.equal(t64, 0, out=tb)
            np.bitwise_or(held, np.left_shift(tb.view(np.uint8), s, dtype=np.uint16), out=held)
        first = FIRST[held]
        has = first < 9
        oracle = window & ~rand & has
        rest = window & ~rand & ~has
        rand |= rest & (legal[:, ae.L_DECLINE] == 0)  # a forced window with nothing held: the random declare

        idx = np.flatnonzero(oracle)
        if idx.size:
            s = first[idx]
            h = critic[idx[:, None], SET_CARDS[s]].astype(np.int32)  # rel 0, 2, 4 -> teammate digit 0, 1, 2
            out[idx] = ae.A_DECLARE + s * ae.N_ASSIGN + ((h >> 1) * POW3).sum(axis=1)

        idx = np.flatnonzero(rand)
        if idx.size:
            s = pick_uniform(legal[idx, DECL_ROW], rng)
            d = rng.integers(0, 3, size=(idx.size, 6), dtype=np.int32)
            out[idx] = ae.A_DECLARE + s * ae.N_ASSIGN + (d * POW3).sum(axis=1)

        idx = np.flatnonzero(phase == 1)  # awaitPass
        if idx.size:
            out[idx] = ae.A_PASS + pick_uniform(legal[idx, PASS_ROW], rng)

        idx = np.flatnonzero(~window & (phase == 0))  # the window is closed: ask
        if idx.size:
            out[idx] = pick_uniform_packed(legal[idx, ae.L_ASK:ae.L_ASK + ae.N_ASK], rng)
        return out


def sample_load(samples=5):
    """Total processor load, `samples` one-second samples, from typeperf. Returns the list of percentages."""
    cmd = ['typeperf', r'\Processor(_Total)\% Processor Time', '-sc', str(samples)]
    text = subprocess.run(cmd, capture_output=True, text=True, timeout=60 + 2 * samples).stdout
    vals = []
    for line in text.splitlines():
        m = re.match(r'^"[^"]+","([0-9.]+)"\s*$', line.strip())
        if m:
            vals.append(float(m.group(1)))
    return vals


class Actor:
    """One Python thread's share: its own BatchEnv (threads=1), its own buffers and its own stub."""

    def __init__(self, j, games_in_flight, prefix, seed, env_threads=1):
        m = games_in_flight
        p = f'{prefix}a{j}-'
        self.env = ae.BatchEnv(m, threads=env_threads, auto_reset=p, auto_reset_start=m)
        self.env.reset([f'{p}{i}' for i in range(m)], np.arange(m) % 6)
        self.bufs = self.env.make_buffers(critic=True)
        self.env.observe(self.bufs)
        self.stub = MixedStub(m, seed + j)
        self.t_stub = self.t_env = 0.0
        self.snaps = {}

    def step(self):
        """One step of every game: the stub reads the buffers, the env steps and refills them. Returns games ended."""
        a = time.perf_counter()
        acts = self.stub(self.bufs)
        b = time.perf_counter()
        _, term, trunc = self.env.step(acts, self.bufs)
        c = time.perf_counter()
        self.t_stub += b - a
        self.t_env += c - b
        return int(np.count_nonzero(term)) + int(np.count_nonzero(trunc))

    def snap(self, mark):
        if mark not in self.snaps:
            s = self.env.stats()
            s['t_stub'], s['t_env'] = self.t_stub, self.t_env
            self.snaps[mark] = s


def run(mode, threads, batch, games, warmup, prefix, seed):
    """One measurement, `batch` games in flight in all. Returns a dict of the numbers.

    - mode 'pipeline' (threads >= 2): `run_pipeline`; at 1 thread it is mode 'single'.
    - mode 'actors': `threads` Python threads, each driving its own BatchEnv(threads=1) of batch / threads games with
      its own stub, so the stub and the env both run on every thread; the env releases the GIL while it steps.
    - mode 'single': one BatchEnv(threads=threads) of `batch` games, its step spread over `threads` scoped threads
      (the calling thread is one), and the stub on the calling thread between steps.
    """
    if mode == 'pipeline' and threads >= 2:
        return run_pipeline(threads, batch, games, warmup, prefix, seed)
    if mode in ('single', 'pipeline'):
        actors = [Actor(0, batch, prefix, seed, env_threads=threads)]
    else:
        actors = [Actor(j, batch // threads, prefix, seed) for j in range(threads)]
    lock = threading.Lock()
    shared = {'ended': 0, 'marks': {}}

    def loop(actor):
        while True:
            k = actor.step()
            with lock:
                shared['ended'] += k
                done = shared['ended']
                now = time.perf_counter()
                if done >= warmup and 't0' not in shared['marks']:
                    shared['marks']['t0'] = (now, done)
                if 't0' in shared['marks'] and done >= shared['marks']['t0'][1] + games and 't1' not in shared['marks']:
                    shared['marks']['t1'] = (now, done)
                marks = list(shared['marks'])
            for m in marks:
                actor.snap(m)
            if 't1' in marks:
                return

    if len(actors) == 1:
        loop(actors[0])
    else:
        ts = [threading.Thread(target=loop, args=(a,)) for a in actors]
        for t in ts:
            t.start()
        for t in ts:
            t.join()

    return summarise(mode, threads, batch, actors, shared['marks'])


def run_pipeline(threads, batch, games, warmup, prefix, seed):
    """Mode 'pipeline': two half-batches, each a BatchEnv(threads - 1). The calling thread runs the stub on one half
    while a helper thread steps the other half (the helper is one of that env's threads-1 workers), then they swap;
    so at most `threads` threads are busy at once: threads - 1 for the env and one for the stub."""
    halves = [Actor(j, batch // 2, prefix, seed, env_threads=threads - 1) for j in range(2)]
    acts = [None, None]
    marks = {}
    ended = 0
    go = threading.Semaphore(0)
    done = threading.Semaphore(0)
    box = {'k': 0, 'stop': False}

    def helper():
        while True:
            go.acquire()
            if box['stop']:
                return
            h = halves[box['j']]
            a = time.perf_counter()
            _, term, trunc = h.env.step(acts[box['j']], h.bufs)
            h.t_env += time.perf_counter() - a
            box['k'] = int(np.count_nonzero(term)) + int(np.count_nonzero(trunc))
            done.release()

    th = threading.Thread(target=helper)
    th.start()
    # Prime: the stub for half 0.
    a = time.perf_counter()
    acts[0] = halves[0].stub(halves[0].bufs).copy()
    halves[0].t_stub += time.perf_counter() - a
    j = 0
    while True:
        # The helper steps half j while this thread runs the stub on half 1 - j.
        box['j'] = j
        go.release()
        o = halves[1 - j]
        a = time.perf_counter()
        acts[1 - j] = o.stub(o.bufs).copy()
        o.t_stub += time.perf_counter() - a
        done.acquire()
        ended += box['k']
        now = time.perf_counter()
        if ended >= warmup and 't0' not in marks:
            marks['t0'] = (now, ended)
        if 't0' in marks and ended >= marks['t0'][1] + games and 't1' not in marks:
            marks['t1'] = (now, ended)
        for h in halves:
            for m in marks:
                h.snap(m)
        if 't1' in marks:
            break
        j = 1 - j
    box['stop'] = True
    go.release()
    th.join()
    return summarise('pipeline', threads, batch, halves, marks)


def summarise(mode, threads, batch, actors, marks):
    (t0, e0), (t1, e1) = marks['t0'], marks['t1']
    wall = t1 - t0
    d = {k: sum(a.snaps['t1'][k] - a.snaps['t0'][k] for a in actors)
         for k in ('steps', 'finished', 'capped', 'ended_steps', 'wins_team0', 'wins_team1', 't_stub', 't_env')}
    ended = e1 - e0
    busy = d['t_stub'] + d['t_env']
    return {
        'mode': mode,
        'threads': threads,
        'batch': batch,
        'games': ended,
        'finished': d['finished'],
        'capped': d['capped'],
        'wall_s': wall,
        'games_per_s': ended / wall,
        'steps': d['steps'],
        'steps_per_s': d['steps'] / wall,
        'actions_per_game': d['ended_steps'] / max(1, d['finished'] + d['capped']),
        'stub_share': d['t_stub'] / busy,
        'env_share': d['t_env'] / busy,
        'ns_per_action': {'stub': 1e9 * d['t_stub'] / d['steps'], 'env': 1e9 * d['t_env'] / d['steps']},
        'max_backlog': max(a.snaps['t1']['max_backlog'] for a in actors),
        'wins': [d['wins_team0'], d['wins_team1']],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--threads', default='1,2,4', help='comma-separated thread counts, run in this order')
    ap.add_argument('--mode', default='pipeline', choices=['pipeline', 'single', 'actors'],
                    help='pipeline: two half-batch BatchEnv(threads=T-1), the stub on one while the other steps; '
                         'single: one BatchEnv(threads=T); actors: one Python thread and one BatchEnv(threads=1) a '
                         'thread')
    ap.add_argument('--batch', type=int, default=16384, help='games in flight in all (split evenly over actors)')
    ap.add_argument('--games', type=int, default=200_000, help='games timed after the warm-up (>= 200,000 for G0b)')
    ap.add_argument('--warmup', type=int, default=None,
                    help='games ended before timing starts (default: max(10,000, 3 x batch), so the batch has '
                         'desynchronised from its common start and the timed window is in steady state)')
    ap.add_argument('--prefix', default='athena-p0-g0b-', help='seed prefix: game k is PREFIX + str(k)')
    ap.add_argument('--seed', type=int, default=20260919, help="the NumPy stub's generator seed")
    ap.add_argument('--registered', action='store_true',
                    help='the registered G0b run: refuse unless the host load is <= 10%% before the start')
    ap.add_argument('--load-samples', type=int, default=5)
    args = ap.parse_args()
    thread_list = [int(t) for t in args.threads.split(',')]
    if args.warmup is None:
        args.warmup = max(10_000, 3 * args.batch)

    load = sample_load(args.load_samples)
    mean_load = sum(load) / len(load) if load else float('nan')
    quiet = bool(load) and mean_load <= 10.0
    label = 'REGISTERED' if args.registered else 'CONTENDED (not the registered measurement)'
    print(f'g0b-bench: {label}')
    print(f'  host load before the start (typeperf, % processor time, {len(load)} x 1 s): '
          f'{", ".join(f"{x:.1f}" for x in load)}; mean {mean_load:.1f}%')
    if args.registered and not quiet:
        print('  REFUSED: the host is above 10% load; G0b is registered on a host at <= 10% load (ATHENA.md §4.6).')
        return 2
    if args.registered and (args.games < 200_000 or args.warmup < 10_000):
        print('  REFUSED: G0b is registered over at least 200,000 games after 10,000 of warm-up.')
        return 2
    if not args.registered and max(thread_list) > 4:
        print('  REFUSED: more than 4 threads is for the registered run only.')
        return 2
    print(f'  python {platform.python_version()}, numpy {np.__version__}, {os.cpu_count()} logical processors; '
          f'mode {args.mode}, {args.batch} games in flight, {args.games} games timed after {args.warmup} of warm-up, '
          f'seeds {args.prefix}a<actor>-<k>')

    results = []
    for t in thread_list:
        r = run(args.mode, t, args.batch, args.games, args.warmup, args.prefix, args.seed)
        results.append(r)
        print(f'  {t} thread{"s" if t > 1 else " "}: {r["games"]} games in {r["wall_s"]:.2f} s = '
              f'{r["games_per_s"]:,.0f} games/s ({r["steps_per_s"] / 1e6:.2f} M actions/s; '
              f'{r["actions_per_game"]:.1f} actions a game ended); finished {r["finished"]}, capped {r["capped"]}; '
              f'thread time in the env (Rust step + observe, GIL released) {100 * r["env_share"]:.0f}% '
              f'({r["ns_per_action"]["env"]:.0f} ns an action), in the NumPy stub {100 * r["stub_share"]:.0f}% '
              f'({r["ns_per_action"]["stub"]:.0f} ns); max event backlog {r["max_backlog"]}',
              flush=True)
    after = sample_load(3)
    print(f'  host load after (typeperf, 3 x 1 s): {", ".join(f"{x:.1f}" for x in after)}')
    for r in results:
        if r['threads'] == 8:
            verdict = 'MET' if r['games_per_s'] >= 10_000 else ('MISSED' if r['games_per_s'] >= 1_000 else
                                                                   'MISSED, below the brief\'s 1,000')
            print(f'  G0b bar (>= 10,000 games/s on 8 threads): {verdict}' +
                  ('' if args.registered else ' -- but this run is CONTENDED and does not score G0b'))
    print('JSON ' + json.dumps({'label': label, 'load_before': load, 'load_after': after, 'results': results}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
