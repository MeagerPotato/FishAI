"""
home_harness.py: ATHENA P0's home head-to-head harness (ATHENA.md §4.5 item 5, §4.6 G0c).

The port (`athena_env.BatchEnv`, the Rust rules core behind its Python API) plays the games. Monet's seats are played
by the Node opponent service (`scripts/athena/opponent-service.mjs`), which keeps the reference's `GameState` of every
game, applies the port's actions to it, and answers `decide(seatView, monetPolicy(v), hashSeed(`${seed}:${moveIndex}`)())`.
Other seats are played by a Python policy over the port's buffers (ATHENA, later; the NumPy mixed stub in the tests).

**The live replay check.** Every reply of the service carries the reference's rolling state digest d
(`scripts/athena/replay-format.md` §5) after the port's last action; the harness compares it with the port's own
`digests()` at every step of every game, and the deal digest before the first. With `full` (the default) it also
compares the legal-move digest l and the view digest v of the acting seat at every step. A game whose digests differ,
or whose port action the reference refuses, is *divergent*: from then on it is played out by a fallback (the NumPy
mixed stub over the port's legal row) so the batch can finish, and it is reported, never scored.

**Geometry A** (`geometry_a`) is `scripts/duplicate-pairs.mjs`'s: pair g is the seed `${bank}-${g}` dealt at start
seat 0 and played twice, arm A on team 0 and then on team 1. G0c pins this harness to that script game for game.

**Geometry B** (`geometry_b`) is the bridge cell's shape, 200 deals x 6 rotations = 1,200 games a cell, with the
rotation rule defined here (FishLab's own is not read; it has no licence). Rotation r of deal d:

    seed = f'{bank}-{d}',  p, o = divmod(r, 2),  start seat = 2p,  arm A's team = o

So each deal is three duplicate pairs: in pair p both arms play the identical position (the same deal, the same start
seat 0, 2 or 4), once from each side. Rotations 0 and 1 are geometry A's pair on the same seed. Across the six, each
arm holds each of the six dealt hands three times and starts three games, and three of the six hands (those of seats
0, 2 and 4) each start one pair. Geometry B is for P2's and P3's reads; G0c does not score it.

Usage (the venv's python; the default `athena_env` build is `maturin develop --release` in athena-env/py):

    python scripts/athena/home_harness.py --geometry A --a v1.0 --b v0.33 --pairs 200 --bank athena-p0-pin
    python scripts/athena/home_harness.py --geometry B --a v1.0 --b v0.33 --deals 200 --bank <seed>
    python scripts/athena/home_harness.py ... --athena-env <dir of an unpacked mutants build> --mutant M1

An arm is a Monet version (`v1.0`, `v0.33`, ...) or `stub` (the NumPy mixed stub of g0b-bench.py, for tests: it reads
the critic buffer and is not a player). Geometry A prints duplicate-pairs.mjs's lines in its format. `--games-out`
writes one JSON line a game; `--json` writes the whole result, with the digest check's counts and the service's cost.
"""
import argparse
import importlib
import importlib.util
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
SERVICE = REPO / 'scripts' / 'athena' / 'opponent-service.mjs'
ROTATIONS = 6

_AE = None


def athena_env(path=None):
    """Import `athena_env` once. With `path`, a directory holding an unpacked build (e.g. the mutants build), that
    build is imported instead of the venv's; the harness checks that it was the one loaded."""
    global _AE
    if _AE is not None:
        if path is not None and Path(_AE.__file__).resolve().parents[1] != Path(path).resolve():
            raise RuntimeError(f'athena_env is already loaded from {_AE.__file__}, not from {path}')
        return _AE
    if path is not None:
        sys.path.insert(0, str(Path(path).resolve()))
    ae = importlib.import_module('athena_env')
    if path is not None and Path(ae.__file__).resolve().parents[1] != Path(path).resolve():
        raise RuntimeError(f'asked for the athena_env build in {path}, but {ae.__file__} was imported')
    _AE = ae
    return ae


def build_info(ae):
    return {'file': str(Path(ae.__file__).resolve()), 'mutants': bool(getattr(ae, 'MUTANTS', False))}


_STUB = None


def mixed_stub_class():
    """G0b's NumPy mixed stub (`scripts/athena/g0b-bench.py`'s MixedStub), loaded after athena_env."""
    global _STUB
    if _STUB is None:
        athena_env()
        spec = importlib.util.spec_from_file_location('g0b_bench', REPO / 'scripts' / 'athena' / 'g0b-bench.py')
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _STUB = mod.MixedStub
    return _STUB


# --------------------------------------------------------------------------------------------- the geometries ---

@dataclass(frozen=True)
class GameSpec:
    """One game of a geometry: its batch index, seed, start seat, arm A's team, and its (deal, rotation) label."""
    index: int
    seed: str
    start: int
    team_a: int
    deal: int
    rot: int


def geometry_a(bank, pairs):
    """duplicate-pairs.mjs's geometry: pair g is `${bank}-${g}` at start seat 0, arm A on team 0, then on team 1."""
    return [GameSpec(2 * g + o, f'{bank}-{g}', 0, o, g, o) for g in range(pairs) for o in (0, 1)]


def rotation(r):
    """Geometry B's rotation rule: rotation r (0-5) is the start seat 2 * (r // 2) with arm A on team r % 2."""
    if not 0 <= r < ROTATIONS:
        raise ValueError(f'rotation {r} is not 0-5')
    p, o = divmod(r, 2)
    return 2 * p, o


def geometry_b(bank, deals):
    """The bridge cell's shape: deal d (seed `${bank}-${d}`) played at each of the six rotations of `rotation`."""
    out = []
    for d in range(deals):
        for r in range(ROTATIONS):
            start, team_a = rotation(r)
            out.append(GameSpec(ROTATIONS * d + r, f'{bank}-{d}', start, team_a, d, r))
    return out


# ------------------------------------------------------------------------------------------------ the service ---

class ServiceError(RuntimeError):
    pass


class OpponentService:
    """The Node opponent service as a child process, newline-delimited JSON over its stdin and stdout."""

    def __init__(self, workers=2, node=None, stderr=None):
        node = node or os.environ.get('ATHENA_NODE', 'node')
        self.proc = subprocess.Popen([node, str(SERVICE), '--workers', str(workers)], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=stderr, cwd=str(REPO), bufsize=0)
        self._id = 0
        self._next_g = 0
        self.wall = {}  # op -> seconds spent waiting on the service
        self.calls = {}
        t = time.perf_counter()
        self.hello = self.request({'op': 'hello'})
        self.startup = time.perf_counter() - t
        self.workers = self.hello['workers']

    def request(self, msg):
        self._id += 1
        msg = dict(msg, id=self._id)
        t = time.perf_counter()
        self.proc.stdin.write((json.dumps(msg, separators=(',', ':')) + '\n').encode())
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        op = msg.get('op')
        self.wall[op] = self.wall.get(op, 0.0) + time.perf_counter() - t
        self.calls[op] = self.calls.get(op, 0) + 1
        if not line:
            raise ServiceError(f'the opponent service closed its output (exit {self.proc.poll()})')
        reply = json.loads(line)
        if reply.get('id') != self._id:
            raise ServiceError(f'reply {reply.get("id")} to request {self._id}')
        if not reply.get('ok'):
            raise ServiceError(reply.get('error', 'the opponent service failed'))
        return reply

    def game_numbers(self, n):
        """n fresh game numbers (a service may host several batches over its life)."""
        base = self._next_g
        self._next_g += n
        return base

    def open(self, games):
        return self.request({'op': 'open', 'games': games})['games']

    def step(self, items, full):
        return self.request({'op': 'step', 'full': bool(full), 'items': items})['items']

    def close(self, gs):
        return self.request({'op': 'close', 'games': [int(g) for g in gs]})['closed'] if len(gs) else 0

    def stats(self):
        return self.request({'op': 'stats'})

    def quit(self):
        if self.proc.poll() is None:
            try:
                self.request({'op': 'quit'})
            except (ServiceError, OSError):
                pass
            try:
                self.proc.wait(timeout=30)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        return self.proc.returncode

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.quit()


# ---------------------------------------------------------------------------------------------------- the arms ---

class PolicyArm:
    """A seat policy in Python: `act(bufs, rows)` returns an int32 action code for each of the batch rows `rows`
    (a sorted index array), reading the port's buffers. ATHENA's network will be one; `stub_arm` is the test one."""

    def __init__(self, name, act):
        self.name = name
        self.act = act

    def __repr__(self):
        return f'PolicyArm({self.name})'


def stub_arm(n, seed=0):
    """The NumPy mixed stub as an arm (for tests: it reads the critic buffer, so it is not a player)."""
    stub = mixed_stub_class()(n, seed)
    return PolicyArm(f'stub:{seed}', lambda bufs, rows: stub(bufs)[rows].copy())


def arm_label(arm):
    return arm if isinstance(arm, str) else arm.name


def is_legal(ae, legal_row, code):
    """Whether action code `code` is legal in one game's legal row (API.md §5.1)."""
    code = int(code)
    if 0 <= code < ae.N_ASK:
        return bool(legal_row[ae.L_ASK + code])
    if code == ae.A_DECLINE:
        return bool(legal_row[ae.L_DECLINE])
    if ae.A_PASS <= code < ae.A_DECLARE:
        return bool(legal_row[ae.L_PASS + code - ae.A_PASS])
    if ae.A_DECLARE <= code < ae.N_ACTIONS:
        return bool(legal_row[ae.L_DECLARE + (code - ae.A_DECLARE) // ae.N_ASSIGN])
    return False


# ------------------------------------------------------------------------------------------------ the driver ---

def hex16(x):
    return f'{int(x):016x}'


def play(specs, arm_a, arm_b, service=None, *, threads=1, full=True, mutant=None, fallback_seed=20260919,
         progress=None, record=False):
    """Play `specs` with arm A on each spec's team_a and arm B on the other team, the port stepping every game, and
    check the reference's digests against the port's at every step. Returns a dict (see the keys at the end).

    With `record`, the result also holds `action_codes`: per game, in spec order, the action codes the port applied
    (uint16, API.md §4), so a game can be replayed from its seed, start seat and actions alone (ATHENA.md §8.3's
    stored games). Recording reads the codes the loop already has; it changes nothing that is played."""
    ae = athena_env()
    n = len(specs)
    if n == 0:
        raise ValueError('no games')
    arms = (arm_a, arm_b)
    monet = [[None] * 6 for _ in range(n)]  # per game and seat: the Monet version the service plays, or None
    seat_arm = np.zeros((n, 6), dtype=np.int8)  # 0 arm A, 1 arm B
    for i, s in enumerate(specs):
        for seat in range(6):
            k = 0 if seat % 2 == s.team_a else 1
            seat_arm[i, seat] = k
            if isinstance(arms[k], str):
                monet[i][seat] = arms[k]
    uses_service = np.array([any(v is not None for v in m) for m in monet])
    if uses_service.any() and service is None:
        raise ValueError('a Monet arm needs the opponent service')
    is_monet = np.array([[v is not None for v in m] for m in monet])

    env = ae.BatchEnv(n, threads=threads, track_digests=True)
    if mutant:
        if not hasattr(env, 'set_mutant'):
            raise RuntimeError('this athena_env build cannot plant a mutant: build it with --features mutants')
        env.set_mutant(mutant)
    env.reset([s.seed for s in specs], [s.start for s in specs])
    bufs = env.make_buffers(critic=True)  # the critic buffer is read by the fallback stub only, never by an arm
    env.observe(bufs)
    fallback = mixed_stub_class()(n, fallback_seed)

    base = service.game_numbers(n) if service is not None else 0
    live = uses_service.copy()  # the service still holds this game's reference state
    diverged = np.zeros(n, dtype=bool)
    refused = np.zeros(n, dtype=bool)  # a Monet decision the reference refused (duplicate-pairs.mjs drops the pair)
    divergences = []
    counts = {'deals_compared': 0, 'd_compared': 0, 'd_mismatch': 0, 'l_compared': 0, 'l_mismatch': 0,
              'v_compared': 0, 'v_mismatch': 0, 'scores_compared': 0, 'score_mismatch': 0, 'decisions': 0}

    def diverge(i, kind, step, detail):
        if diverged[i]:
            return
        diverged[i] = True
        divergences.append({'game': int(i), 'seed': specs[i].seed, 'team_a': specs[i].team_a, 'kind': kind,
                            'step': int(step), 'detail': detail})

    t0 = time.perf_counter()
    if live.any():
        rows = np.flatnonzero(live)
        opened = service.open([{'g': base + int(i), 'seed': specs[i].seed, 'start': specs[i].start,
                                'seats': monet[i]} for i in rows])
        d0 = env.digests()[0]
        for g, deal, acting in opened:
            i = g - base
            counts['deals_compared'] += 1
            if deal != hex16(d0[i]):
                counts['d_mismatch'] += 1
                diverge(i, 'deal', -1, f'deal digest {deal} vs the port\'s {hex16(d0[i])}')
            elif acting != int(bufs['seat'][i]):
                diverge(i, 'acting seat', 0, f'the reference acts at seat {acting}, the port at {bufs["seat"][i]}')

    pend_seat = np.full(n, -1, dtype=np.int64)
    pend_code = np.zeros(n, dtype=np.int64)
    trace = [] if record else None  # per batch step: (the games stepped, their codes)
    step_t = 0
    t_env = t_service = t_policy = 0.0
    service_steps = 0
    while True:
        ended_now = env.ended()
        running = ended_now == 0
        detach = [i for i in np.flatnonzero(live & diverged)]
        if detach:
            service.close([base + int(i) for i in detach])
            live[detach] = False
        acting = bufs['seat'].astype(np.int64)
        idx = np.arange(n)
        steps_now = env.steps().astype(np.int64)
        want_decide = live & running & is_monet[idx, acting]
        want = live & ((pend_seat >= 0) | want_decide | (running & full))
        codes = np.full(n, ae.A_DECLINE, dtype=np.int32)
        have_code = np.zeros(n, dtype=bool)
        if want.any():
            pd, pl, pv = env.digests()
            items = [[base + int(i), int(pend_seat[i]), int(pend_code[i]), 1 if want_decide[i] else 0]
                     for i in np.flatnonzero(want)]
            ts = time.perf_counter()
            replies = service.step(items, full)
            t_service += time.perf_counter() - ts
            service_steps += 1
            closing = []
            scores_now = None
            for g, d, seat, code, l, v, end, err in replies:
                i = g - base
                applied = pend_seat[i] >= 0
                pend_seat[i] = -1
                if applied:
                    counts['d_compared'] += 1
                    if err and err.startswith('apply'):
                        counts['d_mismatch'] += 1
                        diverge(i, 'refused apply', steps_now[i] - 1, err)
                        continue
                    if d != hex16(pd[i]):
                        counts['d_mismatch'] += 1
                        diverge(i, 'd', steps_now[i] - 1, f'the reference\'s d {d} vs the port\'s {hex16(pd[i])}')
                        continue
                if not running[i]:
                    if ended_now[i] == 2:
                        # Capped at 6,000 steps in the port: the reference, one step behind it all along, is unfinished.
                        if end is not None:
                            diverge(i, 'end', steps_now[i], f'the reference finished {end}; the port was capped')
                    else:
                        counts['scores_compared'] += 1
                        if scores_now is None:
                            scores_now = env.scores()
                        sc = [int(x) for x in scores_now[i]]
                        if end is None or list(end) != sc:
                            counts['score_mismatch'] += 1
                            diverge(i, 'end', steps_now[i], f'the reference ends {end}, the port {sc}')
                    closing.append(g)
                    live[i] = False
                    continue
                if end is not None:
                    diverge(i, 'end', steps_now[i], f'the reference finished {end}; the port plays on')
                    continue
                if seat != int(acting[i]):
                    diverge(i, 'acting seat', steps_now[i], f'the reference acts at seat {seat}, the port at {acting[i]}')
                    continue
                if full:
                    counts['l_compared'] += 1
                    counts['v_compared'] += 1
                    if l != hex16(pl[i]):
                        counts['l_mismatch'] += 1
                        diverge(i, 'l', steps_now[i], f'the reference\'s l {l} vs the port\'s {hex16(pl[i])}')
                        continue
                    if v != hex16(pv[i]):
                        counts['v_mismatch'] += 1
                        diverge(i, 'v', steps_now[i], f'the reference\'s v {v} vs the port\'s {hex16(pv[i])}')
                        continue
                if want_decide[i]:
                    if err:
                        refused[i] = True
                        divergences.append({'game': int(i), 'seed': specs[i].seed, 'team_a': specs[i].team_a,
                                            'kind': 'decision refused', 'step': int(steps_now[i]), 'detail': err})
                        live[i] = False
                        closing.append(g)
                        continue
                    counts['decisions'] += 1
                    if not is_legal(ae, bufs['legal'][i], code):
                        diverge(i, 'illegal in the port', steps_now[i], f'the reference plays code {code}, which the '
                                'port\'s legal row refuses')
                        continue
                    codes[i] = code
                    have_code[i] = True
                elif err:
                    diverge(i, 'service error', steps_now[i], err)
            if closing:
                service.close(closing)
        if not running.any():
            break
        # Python arms: every running seat no Monet decision covers, except divergent or refused games.
        py_rows = np.flatnonzero(running & ~is_monet[idx, acting] & ~diverged & ~refused)
        tp = time.perf_counter()
        for k in (0, 1):
            rows = py_rows[seat_arm[py_rows, acting[py_rows]] == k]
            if rows.size:
                codes[rows] = arms[k].act(bufs, rows)
                have_code[rows] = True
        spare = np.flatnonzero(running & (diverged | refused))
        if spare.size:
            codes[spare] = fallback(bufs)[spare]
            have_code[spare] = True
        t_policy += time.perf_counter() - tp
        missing = np.flatnonzero(running & ~have_code)
        if missing.size:
            raise RuntimeError(f'no action for games {missing[:8].tolist()} at batch step {step_t}')
        te = time.perf_counter()
        env.step(codes, bufs)
        t_env += time.perf_counter() - te
        if trace is not None:
            rows = np.flatnonzero(running)
            trace.append((rows, codes[rows].astype(np.uint16)))
        stepped = running & live
        pend_seat[stepped] = acting[stepped]
        pend_code[stepped] = codes[stepped]
        step_t += 1
        if progress and step_t % 200 == 0:
            progress(step_t, int(np.count_nonzero(env.ended() == 0)))
    wall = time.perf_counter() - t0

    scores = env.scores()
    steps = env.steps()
    ended = env.ended()
    games = []
    for i, s in enumerate(specs):
        sc = scores[i]
        games.append({
            'index': s.index, 'seed': s.seed, 'start': s.start, 'teamA': s.team_a, 'deal': s.deal, 'rot': s.rot,
            'setsA': int(sc[s.team_a]), 'setsB': int(sc[1 - s.team_a]), 'moves': int(steps[i]),
            'end': {1: 'finished', 2: 'capped'}.get(int(ended[i]), 'running'),
            'diverged': bool(diverged[i]), 'refused': bool(refused[i]),
        })
    out = {}
    if trace is not None:
        rows = np.concatenate([r for r, _ in trace]) if trace else np.zeros(0, dtype=np.int64)
        codes_all = np.concatenate([c for _, c in trace]) if trace else np.zeros(0, dtype=np.uint16)
        order = np.argsort(rows, kind='stable')  # stable: each game's codes stay in step order
        bounds = np.searchsorted(rows[order], np.arange(n + 1))
        sorted_codes = codes_all[order]
        out['action_codes'] = [sorted_codes[bounds[i]:bounds[i + 1]].copy() for i in range(n)]
        for i in range(n):
            if len(out['action_codes'][i]) != int(steps[i]):
                raise RuntimeError(f'game {i}: {len(out["action_codes"][i])} recorded actions, the port applied {steps[i]}')
    return {
        **out,
        'games': games,
        'divergences': divergences,
        'counts': counts,
        'games_diverged': int(np.count_nonzero(diverged)),
        'games_refused': int(np.count_nonzero(refused)),
        'batch_steps': step_t,
        'actions': int(steps.sum()),
        'wall_s': wall,
        'env_s': t_env,
        'service_s': t_service,
        'service_steps': service_steps,
        'policy_s': t_policy,
        'build': build_info(ae),
        'mutant': mutant,
        'arms': [arm_label(arm_a), arm_label(arm_b)],
        'threads': threads,
        'full': bool(full),
    }


# ---------------------------------------------------------------------------------------------- the statistics ---

def js_fixed(x, k):
    """JavaScript's Number.prototype.toFixed(k): the exact binary value, ties away from zero, and -0 as 0."""
    s = str(Decimal(x).quantize(Decimal(1).scaleb(-k), rounding=ROUND_HALF_UP))
    return s[1:] if x == 0 and s.startswith('-') else s


def pairs_summary(games):
    """duplicate-pairs.mjs's statistics over geometry A's games (pairs in order; a pair with a capped or refused game
    is dropped, as that script drops it). Divergent games are the harness's failure and are counted apart."""
    by_pair = {}
    for g in games:
        by_pair.setdefault(g['deal'], {})[g['teamA']] = g
    pairs = wins_a = sets_a = sets_b = capped = 0
    diverged = sum(1 for g in games if g['diverged'])
    d, w = [], []
    for k in sorted(by_pair):
        x, y = by_pair[k].get(0), by_pair[k].get(1)
        if x is None or y is None:
            raise ValueError(f'pair {k} lacks an orientation')
        if any(g['end'] != 'finished' or g['refused'] for g in (x, y)):
            capped += 1
            continue
        pairs += 1
        sets_a += x['setsA'] + y['setsA']
        sets_b += x['setsB'] + y['setsB']
        won = (x['setsA'] > x['setsB']) + (y['setsA'] > y['setsB'])
        wins_a += won
        w.append(won / 2)
        d.append(x['setsA'] - x['setsB'] + (y['setsA'] - y['setsB']))
    # The same float operations, in the same order, as duplicate-pairs.mjs.
    mean = sum(d) / len(d) if d else float('nan')
    sd = (sum((x - mean) ** 2 for x in d) / max(1, len(d) - 1)) ** 0.5
    se = sd / len(d) ** 0.5 if d else float('nan')
    w_mean = sum(w) / max(1, len(w))
    w_se = (sum((x - w_mean) ** 2 for x in w) / max(1, len(w) - 1)) ** 0.5 / max(1, len(w)) ** 0.5
    wr = wins_a / max(1, 2 * pairs)
    return {'pairs': pairs, 'capped': capped, 'diverged': diverged, 'setsA': sets_a, 'setsB': sets_b, 'winsA': wins_a, 'mean': mean,
            'sd': sd, 'se': se, 'winRate': wr, 'winSeBinomial': (wr * (1 - wr) / max(1, 2 * pairs)) ** 0.5,
            'winSePair': w_se}


def pairs_printout(summary, label_a, label_b, bank, elapsed):
    """duplicate-pairs.mjs's printout, line for line in its format (the header names this harness)."""
    s = summary
    p = s['pairs']
    mean, sd, se = s['mean'], s['sd'], s['se']
    lines = [f'=== duplicate pairs (athena harness, geometry A): Monet {label_a} vs Monet {label_b}, bank {bank}, '
             f'{p} pairs ({2 * p} games), {js_fixed(elapsed, 1)}s ===']
    if s['capped']:
        lines.append(f'!!! {s["capped"]} pairs hit the step cap and were dropped')
    if s['diverged']:
        lines.append(f'!!! {s["diverged"]} games diverged from the reference and were played out by the fallback: '
                     'these numbers are not the reference\'s')
    lines.append(f'sets            {s["setsA"]} vs {s["setsB"]}  (per game {js_fixed(s["setsA"] / (2 * p), 4)} vs '
                 f'{js_fixed(s["setsB"] / (2 * p), 4)})')
    lines.append(f'win rate (A)    {js_fixed(100 * s["winsA"] / (2 * p), 2)}%')
    lines.append(f'paired set-diff {js_fixed(mean, 4)} +/- {js_fixed(1.96 * se, 4)}   (SD {js_fixed(sd, 4)} sets/pair, '
                 f'this cell\'s own; SE {js_fixed(se, 4)})')
    verdict = ((f'{label_a} AHEAD' if mean > 0 else f'{label_a} BEHIND') + ' at 95%') if abs(mean) > 1.96 * se \
        else 'inside the interval: unresolved at this N'
    lines.append(f'verdict         {verdict}')
    lines.append(f'win rate SE     {js_fixed(100 * s["winSeBinomial"], 2)}% binomial over the games, '
                 f'{js_fixed(100 * s["winSePair"], 2)}% by pair  (A won {s["winsA"]} of {2 * p})')
    return '\n'.join(lines)


def cell_summary(games):
    """Geometry B's cell, for information: arm A's set difference summed over each deal's six rotations (the unit is
    the deal, whose six games share one deal), its mean, SD and SE, and the win rate over the games."""
    by_deal = {}
    for g in games:
        by_deal.setdefault(g['deal'], []).append(g)
    d = []
    wins = n = dropped = 0
    for k in sorted(by_deal):
        gs = by_deal[k]
        if len(gs) != ROTATIONS or any(g['end'] != 'finished' or g['refused'] or g['diverged'] for g in gs):
            dropped += 1
            continue
        d.append(sum(g['setsA'] - g['setsB'] for g in gs))
        wins += sum(g['setsA'] > g['setsB'] for g in gs)
        n += len(gs)
    mean = sum(d) / len(d) if d else float('nan')
    sd = (sum((x - mean) ** 2 for x in d) / max(1, len(d) - 1)) ** 0.5
    return {'deals': len(d), 'dropped': dropped, 'games': n, 'winsA': wins, 'winRate': wins / max(1, n),
            'meanPerDeal': mean, 'sdPerDeal': sd, 'sePerDeal': sd / max(1, len(d)) ** 0.5}


# ------------------------------------------------------------------------------------------------------ the CLI ---

def service_cost(res, stats):
    """The service's cost, from the harness's side (wall time waiting on step replies) and from the workers'."""
    ws = stats['workers']
    dec = sum(w['decisions'] for w in ws)
    return {
        'workers': len(ws),
        'decisions': dec,
        'games': len(res['games']),
        'service_wait_s': res['service_s'],
        'service_wait_ms_per_decision': 1000 * res['service_s'] / max(1, dec),
        'service_wait_ms_per_game': 1000 * res['service_s'] / max(1, len(res['games'])),
        'decide_ms_per_decision': sum(w['decideMs'] for w in ws) / max(1, dec),
        'apply_ms_per_action': sum(w['applyMs'] for w in ws) / max(1, sum(w['applies'] for w in ws)),
        'digest_ms_per_step': sum(w['digestMs'] for w in ws) / max(1, sum(w['items'] for w in ws)),
        'worker_busy_s': [w['busyMs'] / 1000 for w in ws],
        'worker_decide_s': [w['decideMs'] / 1000 for w in ws],
        'relay_ms_per_request': (stats['main']['stepMs'] / max(1, stats['main']['steps'])),
    }


def resolve_arm(name, n, seed):
    if name == 'stub':
        return stub_arm(n, seed)
    return name


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--geometry', choices=['A', 'B'], default='A')
    ap.add_argument('--a', required=True, help='arm A: a Monet version, or stub')
    ap.add_argument('--b', required=True, help='arm B: a Monet version, or stub')
    ap.add_argument('--pairs', type=int, default=200, help='geometry A: pairs (2 games each)')
    ap.add_argument('--deals', type=int, default=200, help='geometry B: deals (6 games each)')
    ap.add_argument('--bank', required=True, help='the seed label: games are dealt from `<bank>-<g>`')
    ap.add_argument('--workers', type=int, default=2, help='opponent service worker threads (default 2)')
    ap.add_argument('--threads', type=int, default=1, help='BatchEnv threads (default 1)')
    ap.add_argument('--d-only', action='store_true', help='compare the state digest d only, not l and v')
    ap.add_argument('--athena-env', default=None, help='a directory holding an unpacked athena_env build to use')
    ap.add_argument('--mutant', default=None, help='plant M1..M5 in the port (a mutants build only)')
    ap.add_argument('--games-out', default=None, help='write one JSON line a game')
    ap.add_argument('--json', default=None, help='write the whole result as JSON')
    args = ap.parse_args(argv)

    ae = athena_env(args.athena_env)
    info = build_info(ae)
    print(f'athena_env {info["file"]} (mutants build: {info["mutants"]}); mutant planted: {args.mutant}', flush=True)
    specs = geometry_a(args.bank, args.pairs) if args.geometry == 'A' else geometry_b(args.bank, args.deals)
    arm_a = resolve_arm(args.a, len(specs), 1)
    arm_b = resolve_arm(args.b, len(specs), 2)
    needs = isinstance(arm_a, str) or isinstance(arm_b, str)
    load_before = sample_load()
    t0 = time.perf_counter()
    service = OpponentService(workers=args.workers) if needs else None
    try:
        res = play(specs, arm_a, arm_b, service, threads=args.threads, full=not args.d_only, mutant=args.mutant,
                   progress=lambda t, left: print(f'  batch step {t}: {left} games running', flush=True))
        stats = service.stats() if service else None
    finally:
        if service:
            service.quit()
    elapsed = time.perf_counter() - t0
    res['load_before'] = load_before
    res['elapsed_s'] = elapsed
    res['command'] = ' '.join([Path(sys.argv[0]).name] + (argv if argv is not None else sys.argv[1:]))
    if service:
        res['service'] = service_cost(res, stats)
        res['service']['startup_s'] = service.startup
        res['service_stats'] = stats
    c = res['counts']
    print(f'digest check: deals {c["deals_compared"]}, d at {c["d_compared"]} steps ({c["d_mismatch"]} differ), '
          f'l at {c["l_compared"]} ({c["l_mismatch"]} differ), v at {c["v_compared"]} ({c["v_mismatch"]} differ), '
          f'final scores {c["scores_compared"]} ({c["score_mismatch"]} differ); games diverged '
          f'{res["games_diverged"]} of {len(specs)}; decisions refused {res["games_refused"]}')
    for x in res['divergences'][:10]:
        print(f'  divergence: game {x["game"]} ({x["seed"]}, teamA {x["team_a"]}) at step {x["step"]}: '
              f'{x["kind"]}: {x["detail"]}')
    if args.geometry == 'A':
        res['summary'] = pairs_summary(res['games'])
        res['printout'] = pairs_printout(res['summary'], arm_label(arm_a), arm_label(arm_b), args.bank, elapsed)
        print(res['printout'])
    else:
        res['summary'] = cell_summary(res['games'])
        print(json.dumps(res['summary']))
    if service:
        sc = res['service']
        print(f'service cost: {sc["decisions"]} decisions on {sc["workers"]} workers; waited '
              f'{sc["service_wait_ms_per_decision"]:.4f} ms a decision, {sc["service_wait_ms_per_game"]:.1f} ms a game; '
              f'decide {sc["decide_ms_per_decision"]:.4f} ms a decision inside the workers')
    if args.games_out:
        with open(args.games_out, 'w', encoding='utf-8', newline='\n') as fh:
            for g in res['games']:
                fh.write(json.dumps(g, separators=(',', ':')) + '\n')
    if args.json:
        with open(args.json, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(res, fh, indent=1)
    return res


def sample_load(samples=3):
    """The host's total processor load, `samples` one-second samples (typeperf), or [] where it is unavailable."""
    try:
        import re
        cmd = ['typeperf', r'\Processor(_Total)\% Processor Time', '-sc', str(samples)]
        text = subprocess.run(cmd, capture_output=True, text=True, timeout=30 + 2 * samples).stdout
        return [float(m.group(1)) for m in (re.match(r'^"[^"]+","([0-9.]+)"\s*$', ln.strip())
                                              for ln in text.splitlines()) if m]
    except (OSError, subprocess.SubprocessError):
        return []


if __name__ == '__main__':
    main()
