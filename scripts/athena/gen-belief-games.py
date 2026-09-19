"""
gen-belief-games.py: ATHENA P1's population (a), Monet v1.0 self-play for the belief-head study (ATHENA.md §8.3).

The games are Monet v1.0 in all six seats, in geometry B (§4.6 G0c amendment 3, `home_harness.geometry_b`): deal d
is the seed `<label>-<d>`, and rotation r plays it from start seat 2 * (r // 2) with arm A on team r % 2. Both arms
are `v1.0`. The port (`athena_env.BatchEnv`) plays every game and the opponent service (`opponent-service.mjs`)
answers every decision, comparing the reference's digests d, l and v with the port's at every step
(`home_harness.play`, full check). Games are taken in geometry B's order, index 6d + r, and the first `--games` of
them are played: 10,000 for `athena-p1-belief-test`, 5,000 for `-val`, 100,000 for `-train`.

**Each game is stored compactly**: its seed, start seat, geometry label (deal, rotation, arm A's team) and the action
codes the port applied (uint16, `athena-env/API.md` §4), from which the port or the reference replays it exactly.
Chunks of `--chunk` games are written as `part-<k>.npz` in `<out>/<split>/`; a part already on disk whose manifest
entry matches is skipped, so a stopped run resumes. `manifest.json` in the split's folder holds the counts, the md5
of every part, the revision, the command, the digest check's totals, the rate and the CPU time.

    python scripts/athena/gen-belief-games.py --split test --games 10000 --out C:/Projects/FishAI-bench/athena/p1/b/games \\
        --athena-env C:/Projects/FishAI-bench/athena/p1/b/builds/default --workers 4

**A mirror table in geometry B.** With the same arm on both teams, rotations 2p and 2p + 1 are the same seed, the same
start seat and the same policy in every seat, so they are the same game (Monet decides from the view and the move
seed alone). They are both played, as registered, and the manifest counts the pairs whose actions are identical.
"""
import argparse
import ctypes
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))
import home_harness as hh  # noqa: E402

SPLITS = {'train': 'athena-p1-belief-train', 'val': 'athena-p1-belief-val', 'test': 'athena-p1-belief-test'}
REGISTERED = {'train': 100_000, 'val': 5_000, 'test': 10_000}
ARM = 'v1.0'


def md5_file(p):
    h = hashlib.md5()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def git(*args):
    return subprocess.run(['git', '-C', str(REPO), *args], capture_output=True, text=True).stdout.strip()


class _FILETIME(ctypes.Structure):
    _fields_ = [('lo', ctypes.c_uint32), ('hi', ctypes.c_uint32)]


def process_cpu_seconds(handle):
    """User + kernel CPU seconds of a process by its Windows handle (the opponent service's), or None elsewhere."""
    try:
        k32 = ctypes.windll.kernel32
    except AttributeError:
        return None
    c, e, k, u = _FILETIME(), _FILETIME(), _FILETIME(), _FILETIME()
    if not k32.GetProcessTimes(ctypes.c_void_p(int(handle)), ctypes.byref(c), ctypes.byref(e), ctypes.byref(k),
                               ctypes.byref(u)):
        return None
    return (((k.hi << 32) | k.lo) + ((u.hi << 32) | u.lo)) / 1e7


def specs_for(split, games):
    label = SPLITS[split]
    deals = (games + hh.ROTATIONS - 1) // hh.ROTATIONS
    return label, hh.geometry_b(label, deals)[:games]


def save_part(path, specs, res):
    acts = res['action_codes']
    offsets = np.zeros(len(specs) + 1, dtype=np.int64)
    offsets[1:] = np.cumsum([len(a) for a in acts])
    g = res['games']
    np.savez_compressed(
        path,
        index=np.array([s.index for s in specs], dtype=np.int32),
        seed=np.array([s.seed for s in specs]),
        start=np.array([s.start for s in specs], dtype=np.uint8),
        team_a=np.array([s.team_a for s in specs], dtype=np.uint8),
        deal=np.array([s.deal for s in specs], dtype=np.int32),
        rot=np.array([s.rot for s in specs], dtype=np.uint8),
        moves=np.array([x['moves'] for x in g], dtype=np.int32),
        # the final score by team (team 0 = seats 0, 2, 4), from arm A's and arm B's sets
        score=np.array([[x['setsA'], x['setsB']] if s.team_a == 0 else [x['setsB'], x['setsA']]
                        for s, x in zip(specs, g)], dtype=np.uint8),
        offsets=offsets,
        actions=np.concatenate(acts).astype(np.uint16) if acts else np.zeros(0, dtype=np.uint16),
    )


def mirror_pairs(parts_dir, names):
    """Rotations 2p and 2p + 1 of a deal: how many pairs are both present, and how many have identical actions."""
    by = {}
    for nm in names:
        z = np.load(parts_dir / nm)
        for i in range(len(z['index'])):
            a = z['actions'][z['offsets'][i]:z['offsets'][i + 1]]
            by[(int(z['deal'][i]), int(z['rot'][i]))] = hashlib.md5(a.tobytes()).hexdigest()
    pairs = same = 0
    for (d, r), h in by.items():
        if r % 2 == 0 and (d, r + 1) in by:
            pairs += 1
            same += h == by[(d, r + 1)]
    return pairs, same


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--split', required=True, choices=sorted(SPLITS))
    ap.add_argument('--games', type=int, default=None, help='games to play (default: the registered count)')
    ap.add_argument('--out', required=True, help='the games folder; the split goes in <out>/<split>/')
    ap.add_argument('--chunk', type=int, default=1200, help='games a batch (default 1,200: one geometry-B cell)')
    ap.add_argument('--workers', type=int, default=4, help='opponent service worker threads (default 4)')
    ap.add_argument('--threads', type=int, default=1, help='BatchEnv threads (default 1)')
    ap.add_argument('--athena-env', default=None, help='a directory holding an unpacked athena_env build')
    args = ap.parse_args(argv)
    games = args.games if args.games is not None else REGISTERED[args.split]
    label, specs = specs_for(args.split, games)
    out = Path(args.out) / args.split
    out.mkdir(parents=True, exist_ok=True)
    mpath = out / 'manifest.json'
    old = json.loads(mpath.read_text()) if mpath.exists() else None

    ae = hh.athena_env(args.athena_env)
    info = hh.build_info(ae)
    pyd = next(Path(info['file']).parent.glob('athena_env*.pyd'), None) or next(Path(info['file']).parent.glob('*.so'))
    rev = git('rev-parse', 'HEAD')
    dirty = git('status', '--porcelain', '--untracked-files=no')
    command = ' '.join(['python', 'scripts/athena/gen-belief-games.py'] + (argv if argv is not None else sys.argv[1:]))
    chunks = [specs[i:i + args.chunk] for i in range(0, len(specs), args.chunk)]
    print(f'{args.split}: {label}, {len(specs)} games in {len(chunks)} parts of up to {args.chunk}; athena_env '
          f'{info["file"]}; revision {rev}{" (dirty)" if dirty else ""}', flush=True)

    manifest = {
        'format': 'athena-p1-belief-games-1',
        'split': args.split, 'label': label, 'games': len(specs), 'registered': REGISTERED[args.split],
        'geometry': 'B (ATHENA.md 4.6 G0c amendment 3): seed <label>-<d>, rotation r: start 2*(r//2), arm A team r%2',
        'arms': [ARM, ARM], 'chunk': args.chunk, 'workers': args.workers, 'threads': args.threads,
        'revision': rev, 'dirty': bool(dirty), 'command': command,
        'athena_env': {'file': info['file'], 'mutants': info['mutants'], 'pyd_md5': md5_file(pyd)},
        'node': None, 'parts': [],
    }
    done = {p['file']: p for p in (old or {}).get('parts', [])} if old and old.get('label') == label else {}
    counts = {k: 0 for k in ('deals_compared', 'd_compared', 'd_mismatch', 'l_compared', 'l_mismatch', 'v_compared',
                             'v_mismatch', 'scores_compared', 'score_mismatch', 'decisions')}
    load_before = hh.sample_load()
    service = hh.OpponentService(workers=args.workers)
    manifest['node'] = service.hello.get('node')
    t0 = time.perf_counter()
    cpu0 = time.process_time()
    played = 0
    try:
        for k, chunk in enumerate(chunks):
            name = f'part-{k:05d}.npz'
            path = out / name
            prev = done.get(name)
            if prev and path.exists() and md5_file(path) == prev['md5'] and prev['games'] == len(chunk):
                manifest['parts'].append(prev)
                for key in counts:
                    counts[key] += prev['counts'][key]
                continue
            tc = time.perf_counter()
            res = hh.play(chunk, ARM, ARM, service, threads=args.threads, full=True, record=True)
            wall = time.perf_counter() - tc
            if res['games_diverged'] or res['games_refused']:
                for x in res['divergences'][:10]:
                    print(f'  DIVERGENCE {x}', flush=True)
            save_part(path, chunk, res)
            c = res['counts']
            for key in counts:
                counts[key] += c[key]
            ends = [g['end'] for g in res['games']]
            entry = {'file': name, 'md5': md5_file(path), 'bytes': path.stat().st_size, 'games': len(chunk),
                     'first': chunk[0].index, 'last': chunk[-1].index, 'actions': int(res['actions']),
                     'capped': ends.count('capped'), 'unfinished': sum(e != 'finished' for e in ends),
                     'diverged': res['games_diverged'], 'refused': res['games_refused'],
                     'divergences': res['divergences'][:20], 'counts': c, 'wall_s': round(wall, 3),
                     'service_wait_s': round(res['service_s'], 3), 'env_s': round(res['env_s'], 3)}
            manifest['parts'].append(entry)
            played += len(chunk)
            el = time.perf_counter() - t0
            print(f'  {name}: {len(chunk)} games, {res["actions"]} actions, {wall:.1f}s ({len(chunk) / wall:.1f} games/s); '
                  f'd {c["d_compared"]} ({c["d_mismatch"]} differ), l {c["l_compared"]} ({c["l_mismatch"]}), '
                  f'v {c["v_compared"]} ({c["v_mismatch"]}); diverged {res["games_diverged"]}, refused '
                  f'{res["games_refused"]}; {played} played in {el:.0f}s', flush=True)
            mpath.write_text(json.dumps({**manifest, 'counts': counts, 'complete': False}, indent=1))
        stats = service.stats()
    finally:
        service.quit()
        service_cpu = process_cpu_seconds(service.proc._handle) if hasattr(service.proc, '_handle') else None
    wall = time.perf_counter() - t0
    names = [p['file'] for p in manifest['parts']]
    pairs, same = mirror_pairs(out, names)
    manifest.update({
        'counts': counts,
        'games_diverged': sum(p['diverged'] for p in manifest['parts']),
        'games_refused': sum(p['refused'] for p in manifest['parts']),
        'games_capped': sum(p['capped'] for p in manifest['parts']),
        'actions': sum(p['actions'] for p in manifest['parts']),
        'mirror_pairs': {'pairs': pairs, 'identical': same},
        'played_this_run': played,
        'wall_s': round(wall, 1),
        'games_per_s': round(played / wall, 2) if played else None,
        'cpu_s': {'harness': round(time.process_time() - cpu0, 1),
                  'service': round(service_cpu, 1) if service_cpu is not None else None},
        'service_workers_busy_s': [round(w['busyMs'] / 1000, 1) for w in stats['workers']],
        'service_decide_s': [round(w['decideMs'] / 1000, 1) for w in stats['workers']],
        'load_before': load_before,
        'complete': True,
    })
    mpath.write_text(json.dumps(manifest, indent=1))
    c = counts
    print(f'{args.split} done: {manifest["games"]} games, {manifest["actions"]} actions; deals {c["deals_compared"]}, '
          f'd {c["d_compared"]} ({c["d_mismatch"]} differ), l {c["l_compared"]} ({c["l_mismatch"]}), v {c["v_compared"]} '
          f'({c["v_mismatch"]}), scores {c["scores_compared"]} ({c["score_mismatch"]}); diverged '
          f'{manifest["games_diverged"]}, refused {manifest["games_refused"]}, capped {manifest["games_capped"]}; '
          f'mirror pairs {same} of {pairs} identical; {wall:.0f}s, {manifest["games_per_s"]} games/s; CPU '
          f'{manifest["cpu_s"]}', flush=True)
    return manifest


if __name__ == '__main__':
    main()
