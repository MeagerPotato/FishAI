"""window-rule.py: G1c's live-set window rule (ATHENA.md §8.2) measured on played games, through the batch API.

At a declare-window offer the declare head is evaluated only if the offered seat's team has a **live set**: an open
set the facts do not prove lost, with at least k of its six cards certain on the team. A rules-certain set is declared
by the rail; every other offer is declined by rule, except a compelled one (declining is illegal). The rule is the
Rust port's (`athena_env::facts::window_class`, read off the facts row by `athena_env.window_classes`).

For each k in {4, 3, 2} this replays every game's own actions through `athena_env.BatchEnv` with the facts on, and
at every window offer (a step whose observation has the window open) classifies it: rail, live, compelled or
declined. It reports, per k:
- **declares admitted**: the share of the games' declares made at offers the rule admits (rail, live or compelled);
- **offers evaluated**: the share of offers at which the declare head would run (live or compelled).
Every declare in these games is the policy's under test (both teams play it), so on Monet v1.0's games the first
share is "the share of Monet's declares at admitted windows".

Inputs (any mix):
- `.npz` parts in the P1 harness's game format (`athena-p1-belief-games-1`, as `scripts/athena/gen-belief-games.py`
  writes for population (a)): arrays `seed`, `start`, `offsets`, `actions` (the API's action codes), `moves`, `score`;
  a directory is read as its `part-*.npz` files in name order;
- `.tsv` corpus blocks (`athena-replay-1`), their actions converted to the API's codes as the Python tests convert
  them; `--population H1` keeps one population.

Run with the venv's python and an athena_env build that has the facts buffer (PYTHONPATH or --athena-env DIR, an
unpacked wheel; never `maturin develop` into the shared venv):
    python scripts/athena/window-rule.py --athena-env <dir> --games <dir or files> [--population H1] [--max-games N]
        [--batch 512] [--threads 4] [--json FILE]
"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
KS = (4, 3, 2)
CLASSES = ('declined', 'rail', 'live', 'compelled')


def load_games(paths, population, limit):
    """Every game as (label, seed, start, codes int32, moves or None, score or None)."""
    from _common import decode_actions  # noqa: E402 (after the athena_env path is set)
    games = []
    files = []
    for p in paths:
        p = Path(p)
        files += sorted(p.glob('part-*.npz')) + sorted(p.glob('H*-*.tsv')) if p.is_dir() else [p]
    for f in files:
        if f.suffix == '.npz':
            z = np.load(f)
            off = z['offsets']
            for i in range(len(z['seed'])):
                games.append((f'{f.name}:{i}', str(z['seed'][i]), int(z['start'][i]),
                              z['actions'][off[i]:off[i + 1]].astype(np.int32), int(z['moves'][i]),
                              tuple(int(x) for x in z['score'][i])))
                if limit and len(games) >= limit:
                    return games, files
        elif f.suffix == '.tsv':
            with open(f, encoding='ascii') as fh:
                for line in fh:
                    c = line.rstrip('\n').split('\t')
                    if c[0] != 'athena-replay-1' or (population and c[1] != population):
                        continue
                    _, codes = decode_actions(c[11])
                    assert len(codes) == int(c[8]), f'{f.name} {c[2]}: {len(codes)} actions, {c[8]} steps'
                    games.append((f'{c[1]}:{c[2]}', c[3], int(c[4]), codes, int(c[8]), None))
                    if limit and len(games) >= limit:
                        return games, files
        else:
            raise SystemExit(f'{f}: neither an .npz part nor a .tsv corpus block')
    return games, files


def run_batch(ae, games, threads, tally):
    n = len(games)
    env = ae.BatchEnv(n, threads=threads, facts=True)
    env.reset([g[1] for g in games], [g[2] for g in games])
    b = env.make_buffers(critic=False)
    env.observe(b)
    lens = np.array([len(g[3]) for g in games])
    T = int(lens.max())
    A = np.full((T, n), ae.A_DECLINE, dtype=np.int32)
    for i, g in enumerate(games):
        A[:len(g[3]), i] = g[3]
    for t in range(T):
        live = np.flatnonzero(lens > t)
        code = A[t, live]
        declare = code >= ae.A_DECLARE
        window = b['obs'][live, ae.O_WINDOW] == 1
        tally['declares'] += int(declare.sum())
        tally['declares_off_window'] += int((declare & ~window).sum())
        rows = live[window]
        tally['offers'] += int(rows.size)
        if rows.size:
            f = np.ascontiguousarray(b['facts'][rows])
            lg = np.ascontiguousarray(b['legal'][rows])
            dec = declare[window]
            for k in KS:
                cls = ae.window_classes(f, lg, k)
                t_k = tally['k'][k]
                for c, name in enumerate(CLASSES):
                    sel = cls == c
                    t_k[name] += int(sel.sum())
                    t_k['declares_' + name] += int((sel & dec).sum())
        env.step(A[t], b)
    steps = env.steps()
    ended = env.ended()
    scores = env.scores()
    for i, g in enumerate(games):
        if steps[i] != len(g[3]) or ended[i] != 1:
            raise SystemExit(f'{g[0]}: the replay took {steps[i]} steps (ended {ended[i]}), the record {len(g[3])}')
        if g[4] is not None and g[4] != len(g[3]):
            raise SystemExit(f'{g[0]}: {len(g[3])} actions but moves {g[4]}')
        if g[5] is not None and tuple(int(x) for x in scores[i]) != g[5]:
            raise SystemExit(f'{g[0]}: the replayed score {tuple(scores[i])} is not the record\'s {g[5]}')
    tally['games'] += n
    tally['steps'] += int(lens.sum())


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--games', nargs='+', required=True)
    ap.add_argument('--athena-env', default='')
    ap.add_argument('--population', default='')
    ap.add_argument('--max-games', type=int, default=0)
    ap.add_argument('--batch', type=int, default=512)
    ap.add_argument('--threads', type=int, default=4)
    ap.add_argument('--json', default='')
    args = ap.parse_args()
    if not 1 <= args.threads <= 4:
        raise SystemExit('--threads must be 1..4')
    if args.athena_env:
        sys.path.insert(0, str(Path(args.athena_env).resolve()))
    sys.path.insert(1, str(REPO / 'athena-env' / 'py' / 'tests'))
    import athena_env as ae
    if not hasattr(ae, 'window_classes'):
        raise SystemExit(f'{ae.__file__}: this athena_env build has no facts buffer (P1); pass --athena-env')
    t0 = time.perf_counter()
    games, files = load_games(args.games, args.population, args.max_games)
    tally = {'games': 0, 'steps': 0, 'offers': 0, 'declares': 0, 'declares_off_window': 0,
             'k': {k: {**{c: 0 for c in CLASSES}, **{'declares_' + c: 0 for c in CLASSES}} for k in KS}}
    for s in range(0, len(games), args.batch):
        run_batch(ae, games[s:s + args.batch], args.threads, tally)
    secs = time.perf_counter() - t0
    offers, declares = tally['offers'], tally['declares']
    print(f'window-rule: {tally["games"]} games, {tally["steps"]:,} steps, {offers:,} window offers, '
          f'{declares:,} declares ({tally["declares_off_window"]} not at an offer); {secs:.1f} s; athena_env {ae.__file__}')
    print('   k | declares admitted          | offers evaluated            | rail      live       compelled  declined')
    rows = []
    for k in KS:
        t = tally['k'][k]
        adm = t['declares_rail'] + t['declares_live'] + t['declares_compelled']
        ev = t['live'] + t['compelled']
        row = {'k': k, 'declaresAdmitted': adm, 'declares': declares, 'declaresAdmittedShare': adm / max(declares, 1),
               'offersEvaluated': ev, 'offers': offers, 'offersEvaluatedShare': ev / max(offers, 1),
               'offersAdmitted': t['rail'] + ev, **{c: t[c] for c in CLASSES},
               **{'declaresAt_' + c: t['declares_' + c] for c in CLASSES}}
        rows.append(row)
        print(f'   {k} | {adm:>8,} of {declares:>8,} {100 * row["declaresAdmittedShare"]:7.3f}% | '
              f'{ev:>9,} of {offers:>9,} {100 * row["offersEvaluatedShare"]:6.3f}% | '
              f'{t["rail"]:>8,} {t["live"]:>9,} {t["compelled"]:>9,} {t["declined"]:>9,}')
        print(f'     declares at: rail {t["declares_rail"]:,}, live {t["declares_live"]:,}, compelled '
              f'{t["declares_compelled"]:,}, declined-by-rule {t["declares_declined"]:,}')
    if args.json:
        out = {'tool': 'scripts/athena/window-rule.py', 'rule': 'ATHENA.md 8.2 G1c: live set = open, not proved lost, '
               '>= k cards certain on the team; rail and compelled offers admitted', 'inputs': [str(f) for f in files],
               'population': args.population or None, 'games': tally['games'], 'steps': tally['steps'],
               'offers': offers, 'declares': declares, 'declaresOffWindow': tally['declares_off_window'],
               'byK': rows, 'seconds': round(secs, 1), 'athenaEnv': ae.__file__}
        Path(args.json).write_text(json.dumps(out, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
