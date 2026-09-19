"""
g0c-pin.py: ATHENA P0's gate G0c, the harness and the opponents (ATHENA.md §4.6). All three checks must hold:

1. **The cross-instrument identity pin.** The home harness (`home_harness.py`, geometry A) drives the games with the
   port and takes Monet v1.0's and v0.33's moves from the Node opponent service. It must reproduce
   `node scripts/duplicate-pairs.mjs --a v1.0 --b v0.33 --pairs 200 --bank athena-p0-pin` game for game: all 400
   games' final set counts identical, and the printed paired set difference, SD and win rate equal to four decimals.
   These are harness checks on a named bank, not a read: no number from them is quoted as strength.
2. **The reference rides along.** The service's reference-state digest d equals the port's at every step of those
   400 games (and at every deal).
3. **With M1 planted in the port,** check 2 fails: at least one step's digest differs.

What this script runs, each step in its own process, with every output kept in --out:

- the reference: duplicate-pairs.mjs with `--games-out` (one JSON line a game; nothing else about it changes), unless
  --reference DIR names a directory holding an earlier run's `reference-printout.txt` and `reference-games.jsonl`;
- the harness on the default build (the venv's `athena_env`, or --athena-env DIR);
- the harness on the mutants build (--mutant-env DIR, an unpacked `maturin build --features mutants` wheel) with M1.

`--build-envs DIR` first builds both wheels of this tree (default and mutants, `maturin build --release`) and unpacks
them into DIR/default and DIR/mutants, so neither run touches the venv's installed build. It needs cargo on PATH.

    python scripts/athena/g0c-pin.py --build-envs C:/Projects/FishAI-bench/athena/g0c/builds \\
        --out C:/Projects/FishAI-bench/athena/g0c
    python scripts/athena/g0c-pin.py --athena-env <dir>/default --mutant-env <dir>/mutants --out <dir>

Prints each check with its numbers and writes `g0c-result.json`. Exit 0 when all three hold, 1 otherwise.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
HARNESS = REPO / 'scripts' / 'athena' / 'home_harness.py'
PY = sys.executable


def run(cmd, out_file, cwd=REPO, env=None):
    """Run a command, its stdout into out_file (and echoed); returns (exit code, seconds)."""
    t = time.perf_counter()
    print('$ ' + ' '.join(str(c) for c in cmd), flush=True)
    with open(out_file, 'w', encoding='utf-8', newline='\n') as fh:
        p = subprocess.run([str(c) for c in cmd], cwd=str(cwd), stdout=subprocess.PIPE, text=True, env=env)
        fh.write(p.stdout)
    print(p.stdout, end='', flush=True)
    return p.returncode, time.perf_counter() - t


def build_envs(dest):
    """Build this tree's default and mutants wheels and unpack them into dest/default and dest/mutants."""
    dest = Path(dest)
    py_crate = REPO / 'athena-env' / 'py'
    for name, feats in (('default', []), ('mutants', ['--features', 'mutants'])):
        wheels = dest / f'{name}-wheel'
        for w in wheels.glob('*.whl') if wheels.exists() else []:
            w.unlink()
        env = dict(os.environ, CARGO_TARGET_DIR=str(py_crate / 'target' / f'g0c-{name}'))
        env.setdefault('CARGO_BUILD_JOBS', '2')
        cmd = [PY, '-m', 'maturin', 'build', '--release', '-i', PY, '-o', str(wheels)] + feats
        print('$ ' + ' '.join(cmd), flush=True)
        subprocess.run(cmd, cwd=str(py_crate), env=env, check=True)
        (whl,) = list(wheels.glob('*.whl'))
        target = dest / name
        if target.exists():
            for f in sorted(target.rglob('*'), reverse=True):
                f.unlink() if f.is_file() else f.rmdir()
        with zipfile.ZipFile(whl) as z:
            z.extractall(target)
    return dest / 'default', dest / 'mutants'


def read_jsonl(path):
    with open(path, encoding='utf-8') as fh:
        return [json.loads(line) for line in fh if line.strip()]


PRINTED = {
    'sets': re.compile(r'^sets\s+(\d+) vs (\d+)'),
    'winRate': re.compile(r'^win rate \(A\)\s+([-0-9.]+)%'),
    'setDiff': re.compile(r'^paired set-diff ([-0-9.]+) \+/- ([-0-9.]+)\s+\(SD ([-0-9.]+) sets/pair.*SE ([-0-9.]+)\)'),
    'wins': re.compile(r'A won (\d+) of (\d+)'),
    'pairs': re.compile(r', (\d+) pairs \((\d+) games\)'),
}


def parse_printout(text):
    """The numbers duplicate-pairs.mjs prints (the harness prints the same lines)."""
    out = {}
    for line in text.splitlines():
        for k, rx in PRINTED.items():
            m = rx.search(line)
            if m and k not in out:
                out[k] = m.groups()
    need = set(PRINTED) - set(out)
    if need:
        raise ValueError(f'the printout lacks {sorted(need)}')
    wins, games = int(out['wins'][0]), int(out['wins'][1])
    return {
        'pairs': int(out['pairs'][0]), 'games': int(out['pairs'][1]),
        'sets': [int(out['sets'][0]), int(out['sets'][1])],
        'setDiff': out['setDiff'][0], 'ci': out['setDiff'][1], 'sd': out['setDiff'][2], 'se': out['setDiff'][3],
        'winRatePercent': out['winRate'][0], 'winsA': wins,
        # The win rate as a fraction to four decimals, from the exact count (the percent is printed to two).
        'winRate4': f'{wins / games:.4f}',
        'lines': [ln for ln in text.splitlines() if not ln.startswith('===') and not ln.startswith('athena_env ')
                  and not ln.startswith('digest check') and not ln.startswith('  ') and not ln.startswith('service')],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--out', required=True, help='the output directory')
    ap.add_argument('--pairs', type=int, default=200)
    ap.add_argument('--bank', default='athena-p0-pin')
    ap.add_argument('--a', default='v1.0')
    ap.add_argument('--b', default='v0.33')
    ap.add_argument('--workers', type=int, default=2, help='opponent service workers (default 2)')
    ap.add_argument('--reference', default=None, help='reuse the reference run in this directory')
    ap.add_argument('--athena-env', default=None, help='the default build to run (default: the venv\'s)')
    ap.add_argument('--mutant-env', default=None, help='the unpacked mutants build (check 3)')
    ap.add_argument('--build-envs', default=None, help='build both wheels into this directory first')
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if args.build_envs:
        default_env, mutant_env = build_envs(args.build_envs)
        args.athena_env = args.athena_env or str(default_env)
        args.mutant_env = args.mutant_env or str(mutant_env)
    if not args.mutant_env:
        ap.error('check 3 needs --mutant-env (or --build-envs)')
    revision = subprocess.run(['git', '-C', str(REPO), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    dirty = subprocess.run(['git', '-C', str(REPO), 'status', '--porcelain'], capture_output=True, text=True).stdout
    result = {'revision': revision, 'dirty': bool(dirty.strip()), 'pairs': args.pairs, 'bank': args.bank,
              'arms': [args.a, args.b], 'workers': args.workers}

    # The reference.
    if args.reference:
        ref_dir = Path(args.reference)
        ref_seconds = None
    else:
        ref_dir = out
        code, ref_seconds = run(['node', 'scripts/duplicate-pairs.mjs', '--a', args.a, '--b', args.b, '--pairs',
                                 args.pairs, '--bank', args.bank, '--games-out', out / 'reference-games.jsonl'],
                                out / 'reference-printout.txt')
        if code:
            sys.exit(f'duplicate-pairs.mjs exited {code}')
    ref_text = (ref_dir / 'reference-printout.txt').read_text(encoding='utf-8')
    ref_games = read_jsonl(ref_dir / 'reference-games.jsonl')
    result['reference'] = {'dir': str(ref_dir), 'seconds': ref_seconds, 'printout': ref_text.splitlines()}

    # The harness, default build, then M1.
    common = ['--geometry', 'A', '--a', args.a, '--b', args.b, '--pairs', args.pairs, '--bank', args.bank,
              '--workers', args.workers]
    normal = [PY, HARNESS] + common + ['--games-out', out / 'harness-games.jsonl', '--json', out / 'harness.json']
    if args.athena_env:
        normal += ['--athena-env', args.athena_env]
    code, _ = run(normal, out / 'harness-printout.txt')
    if code:
        sys.exit(f'the harness exited {code}')
    m1 = [PY, HARNESS] + common + ['--athena-env', args.mutant_env, '--mutant', 'M1', '--json', out / 'harness-m1.json',
                                   '--games-out', out / 'harness-m1-games.jsonl']
    code, _ = run(m1, out / 'harness-m1-printout.txt')
    if code:
        sys.exit(f'the M1 harness exited {code}')
    h = json.loads((out / 'harness.json').read_text(encoding='utf-8'))
    hm = json.loads((out / 'harness-m1.json').read_text(encoding='utf-8'))

    # Check 1: game for game, and the printed numbers to four decimals.
    key = lambda g: (g['seed'], g['teamA'])  # noqa: E731
    ref_by = {key(g): g for g in ref_games}
    har_by = {key(g): g for g in h['games']}
    matched = moves_matched = 0
    differ = []
    for k, r in ref_by.items():
        x = har_by.get(k)
        if x is not None and (r['setsA'], r['setsB']) == (x['setsA'], x['setsB']) and not x['diverged']:
            matched += 1
        else:
            differ.append({'key': list(k), 'reference': r, 'harness': x})
        if x is not None and r['moves'] == x['moves']:
            moves_matched += 1
    rp = parse_printout(ref_text)
    hp = parse_printout((out / 'harness-printout.txt').read_text(encoding='utf-8'))
    fields = ['setDiff', 'sd', 'winRate4', 'winRatePercent', 'se', 'ci', 'sets', 'winsA', 'pairs', 'games']
    agree = {f: rp[f] == hp[f] for f in fields}
    games = 2 * args.pairs
    check1 = (len(ref_games) == games and len(h['games']) == games and matched == games
              and agree['setDiff'] and agree['sd'] and agree['winRate4'])
    result['check1'] = {
        'holds': check1, 'games': games, 'referenceGames': len(ref_games), 'harnessGames': len(h['games']),
        'gamesMatched': matched, 'movesMatched': moves_matched, 'differ': differ[:20],
        'reference': {f: rp[f] for f in fields}, 'harness': {f: hp[f] for f in fields}, 'agree': agree,
        'printedLinesIdentical': rp['lines'] == hp['lines'],
    }

    # Check 2: every step's digest.
    c = h['counts']
    steps = sum(g['moves'] for g in h['games'])
    check2 = (c['d_mismatch'] == 0 and h['games_diverged'] == 0 and h['games_refused'] == 0
              and c['deals_compared'] == games and c['d_compared'] == steps and c['score_mismatch'] == 0
              and c['scores_compared'] == games)
    result['check2'] = {'holds': check2, 'stepsInGames': steps, **c, 'gamesDiverged': h['games_diverged'],
                        'build': h['build']}

    # Check 3: M1 makes check 2 fail.
    cm = hm['counts']
    first = sorted(hm['divergences'], key=lambda x: x['game'])
    check3 = hm['build']['mutants'] and hm['mutant'] == 'M1' and cm['d_mismatch'] > 0
    result['check3'] = {'holds': bool(check3), 'gamesDiverged': hm['games_diverged'], **cm, 'build': hm['build'],
                        'divergences': first,
                        'stepsComparedBeforeDivergence': cm['d_compared'] - cm['d_mismatch']}
    result['service'] = h.get('service')
    result['serviceM1'] = hm.get('service')
    result['harnessSeconds'] = h['elapsed_s']
    result['loadBefore'] = {'harness': h.get('load_before'), 'm1': hm.get('load_before')}
    result['verdict'] = 'PASS' if check1 and check2 and check3 else 'FAIL'
    (out / 'g0c-result.json').write_text(json.dumps(result, indent=1), encoding='utf-8')

    print('\n=== G0c ===')
    print(f'check 1 (identity pin): {"HOLDS" if check1 else "FAILS"}: {matched} of {games} games\' final set counts '
          f'equal ({moves_matched} of {games} move counts equal)')
    for f in ('setDiff', 'sd', 'winRate4', 'winRatePercent', 'se', 'sets', 'winsA'):
        print(f'    {f:15s} reference {rp[f]!s:14s} harness {hp[f]!s:14s} {"equal" if agree[f] else "DIFFERENT"}')
    print(f'    printed lines after the header identical: {rp["lines"] == hp["lines"]}')
    print(f'check 2 (the reference rides along): {"HOLDS" if check2 else "FAILS"}: {c["deals_compared"]} deals and '
          f'{c["d_compared"]} steps compared ({steps} actions in the games), {c["d_mismatch"]} differ; l and v '
          f'at {c["l_compared"]} steps, {c["l_mismatch"]} and {c["v_mismatch"]} differ; final scores '
          f'{c["scores_compared"]}, {c["score_mismatch"]} differ')
    print(f'check 3 (M1 caught): {"HOLDS" if check3 else "FAILS"}: {hm["games_diverged"]} of {games} games diverge '
          f'({cm["d_mismatch"]} digest mismatches; {cm["d_compared"]} steps compared)')
    print(f'G0c: {result["verdict"]}')
    sys.exit(0 if result['verdict'] == 'PASS' else 1)


if __name__ == '__main__':
    main()
