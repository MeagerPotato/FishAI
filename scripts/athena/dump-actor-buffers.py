"""dump-actor-buffers.py: the Rust port's actor buffers over corpus games, for the encoder comparison.

ATHENA.md §4.5 item 6 asks for a JavaScript observation encoder (`lib/athena/encode.ts`) that builds the port's actor
observation from a SeatView. A network trained on the port's observations must see the same inputs inside a package,
so this script drives `athena_env.BatchEnv` over games of the G0a corpus (their own recorded actions, converted to the
API's action codes as `athena-env/py/tests/test_corpus.py` converts them) and writes every actor buffer the port
produced: at every step of every game, the acting seat's `seat`, `n_events`, `obs` row, `legal` row, with `--facts`
its facts row (API.md §5.5), and the delivered event rows, and once more after the game's last step (the ended game
observed, API.md §3.1). `--regimes` plays every game under each regime named (P1, ATHENA.md §8.2 G1b: `home`, and
`bridge`, the reduced reveal). `scripts/athena/check-encoder.mjs` replays the same actions on the TypeScript reference
and compares the JavaScript encoder's bytes with these, byte for byte.

The dump (little-endian), one record a game after an 8-byte magic `ATHOBS2\\n`:
    u16 seed length, the seed (ASCII), u8 start seat, u8 population index (H1 = 1 ... H5 = 5), u8 regime (0 home,
    1 bridge), u8 flags (bit 0: facts rows present), u32 steps T, T x i32 action codes, then T + 1 observations:
    u8 seat, u8 n_events, 95 obs bytes, 174 legal bytes, [278 facts bytes], n_events x 19 event bytes.
(`ATHOBS1`, P0's layout, had no regime, flags or facts, and a 94-byte obs row.)

With --fixture FILE it also writes a small JSON fixture for `tests/athena/stub.test.ts`: for the first --fixture-games
games of each population under each regime, the seed, start, regime, action codes and the house digest
(replay-format.md §3) of the game's concatenated observation bytes (with the facts rows when --facts is on).

Run with the venv's python and an athena_env build of this tree (PYTHONPATH=<an unpacked wheel>; never `maturin
develop` into the shared venv); at most --threads threads (default 2):
    python scripts/athena/dump-actor-buffers.py --out <file> [--games H1=200,H2=200,H3=200,H4=2000,H5=200]
        [--regimes home,bridge] [--facts] [--threads 2]
        [--fixture tests/athena/data/encoder-fixture.json --fixture-games 2]
"""
import argparse
import json
import struct
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'athena-env' / 'py' / 'tests'))
import athena_env as ae  # noqa: E402
from _common import CORPUS, decode_actions, house_digest, read_block  # noqa: E402

MAGIC = b'ATHOBS2\n'
REGIMES = {'home': 0, 'bridge': 1}


def obs_bytes(bufs, i, facts):
    ne = int(bufs['n_events'][i])
    return (bytes([int(bufs['seat'][i]), ne]) + bufs['obs'][i].tobytes() + bufs['legal'][i].tobytes()
            + (bufs['facts'][i].tobytes() if facts else b'') + bufs['events'][i, :ne].tobytes())


def dump_population(pop, limit, threads, regime, facts):
    recs = read_block(pop, limit)
    n = len(recs)
    codes = []
    for r in recs:
        _, c = decode_actions(r['actions'])
        assert len(c) == r['steps']
        codes.append(c)
    T = np.array([r['steps'] for r in recs])
    maxT = int(T.max())
    A = np.full((maxT, n), ae.A_DECLINE, dtype=np.int32)
    for i, c in enumerate(codes):
        A[:len(c), i] = c
    env = ae.BatchEnv(n, threads=threads, facts=facts)
    env.reset([r['seed'] for r in recs], np.array([r['start'] for r in recs]), regimes=[regime] * n)
    bufs = env.make_buffers(critic=False, facts=facts)
    env.observe(bufs)
    per_game = [bytearray() for _ in range(n)]
    for t in range(maxT + 1):
        # the observation before step t (t < T), and the ended game's observation after its last step (t == T)
        for i in np.flatnonzero(T >= t):
            per_game[i] += obs_bytes(bufs, i, facts)
        if t == maxT:
            break
        env.step(A[t], bufs)
    assert (env.steps() == T).all(), f'{pop}: a game did not take its recorded step count'
    return recs, codes, per_game


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', required=True)
    ap.add_argument('--games', default='H1=200,H2=200,H3=200,H4=2000,H5=200')
    ap.add_argument('--regimes', default='home')
    ap.add_argument('--facts', action='store_true')
    ap.add_argument('--threads', type=int, default=2)
    ap.add_argument('--fixture', default='')
    ap.add_argument('--fixture-games', type=int, default=2)
    args = ap.parse_args()
    if not hasattr(ae, 'O_REGIME'):
        raise SystemExit(f'{ae.__file__} is a P0 build without the regime bit: set PYTHONPATH to a build of this tree')
    plan = [(k, int(v)) for k, v in (x.split('=') for x in args.games.split(','))]
    regimes = [REGIMES[x.strip()] for x in args.regimes.split(',')]
    fixture = []
    total_games = 0
    total_obs = 0
    with open(args.out, 'wb') as fh:
        fh.write(MAGIC)
        for regime in regimes:
            for pop, limit in plan:
                recs, codes, per_game = dump_population(pop, limit, args.threads, regime, args.facts)
                popi = int(pop[1:])
                for r, c, b in zip(recs, codes, per_game):
                    seed = r['seed'].encode('ascii')
                    fh.write(struct.pack('<H', len(seed)) + seed
                             + struct.pack('<BBBBI', r['start'], popi, regime, 1 if args.facts else 0, len(c)))
                    fh.write(c.astype('<i4').tobytes())
                    fh.write(bytes(b))
                if args.fixture:
                    for r, c, b in list(zip(recs, codes, per_game))[:args.fixture_games]:
                        d = house_digest(bytes(b))
                        fixture.append({'population': pop, 'seed': r['seed'], 'start': r['start'], 'regime': regime,
                                        'codes': [int(x) for x in c], 'digest': f'{d:016x}'})
                n_obs = int(sum(len(c) + 1 for c in codes))
                total_games += len(recs)
                total_obs += n_obs
                print(f'  {pop} {args.regimes.split(",")[regimes.index(regime)]}: {len(recs)} games, '
                      f'{n_obs:,} observations')
    print(f'dump-actor-buffers: {total_games} games, {total_obs:,} observations -> {args.out} (corpus {CORPUS}; '
          f'facts {"on" if args.facts else "off"}; athena_env {ae.__file__})')
    if args.fixture:
        Path(args.fixture).parent.mkdir(parents=True, exist_ok=True)
        with open(args.fixture, 'w', encoding='ascii', newline='\n') as fh:
            json.dump({'format': 'athena-encoder-fixture-2', 'source': 'athena_env.BatchEnv over the G0a corpus',
                       'digest': 'replay-format.md §3, one element: the game\'s observations concatenated',
                       'facts': bool(args.facts), 'games': fixture}, fh, separators=(',', ':'))
            fh.write('\n')
        print(f'  fixture: {len(fixture)} games -> {args.fixture}')


if __name__ == '__main__':
    main()
