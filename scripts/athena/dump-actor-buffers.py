"""dump-actor-buffers.py: the Rust port's actor buffers over corpus games, for G0d's encoder comparison.

ATHENA.md §4.5 item 6 asks for a JavaScript observation encoder (`lib/athena/encode.ts`) that builds the port's actor
observation from a SeatView. A network trained on the port's observations must see the same inputs inside a package,
so this script drives `athena_env.BatchEnv` over games of the G0a corpus (their own recorded actions, converted to the
API's action codes as `athena-env/py/tests/test_corpus.py` converts them) and writes every actor buffer the port
produced: at every step of every game, the acting seat's `seat`, `n_events`, `obs` row, `legal` row and the delivered
event rows, and once more after the game's last step (the ended game observed, API.md §3.1).
`scripts/athena/check-encoder.mjs` replays the same actions on the TypeScript reference and compares the JavaScript
encoder's bytes with these, byte for byte.

The dump (little-endian), one record a game after an 8-byte magic `ATHOBS1\\n`:
    u16 seed length, the seed (ASCII), u8 start seat, u8 population index (H1 = 1 ... H5 = 5), u32 steps T,
    T x i32 action codes, then T + 1 observations: u8 seat, u8 n_events, 94 obs bytes, 174 legal bytes,
    n_events x 19 event bytes.

With --fixture FILE it also writes a small JSON fixture for `tests/athena/stub.test.ts`: for the first --fixture-games
games of each population, the seed, start, action codes and the house digest (replay-format.md §3) of the game's
concatenated observation bytes.

Run with the venv's python (no pytest needed); at most --threads threads (default 2):
    python scripts/athena/dump-actor-buffers.py --out <file> [--games H1=200,H2=200,H3=200,H4=2000,H5=200]
        [--threads 2] [--fixture tests/athena/data/encoder-fixture.json --fixture-games 2]
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

MAGIC = b'ATHOBS1\n'


def obs_bytes(bufs, i):
    ne = int(bufs['n_events'][i])
    return (bytes([int(bufs['seat'][i]), ne]) + bufs['obs'][i].tobytes() + bufs['legal'][i].tobytes()
            + bufs['events'][i, :ne].tobytes())


def dump_population(pop, limit, threads):
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
    env = ae.BatchEnv(n, threads=threads)
    env.reset([r['seed'] for r in recs], np.array([r['start'] for r in recs]))
    bufs = env.make_buffers(critic=False)
    env.observe(bufs)
    per_game = [bytearray() for _ in range(n)]
    for t in range(maxT + 1):
        # the observation before step t (t < T), and the ended game's observation after its last step (t == T)
        for i in np.flatnonzero(T >= t):
            per_game[i] += obs_bytes(bufs, i)
        if t == maxT:
            break
        env.step(A[t], bufs)
    assert (env.steps() == T).all(), f'{pop}: a game did not take its recorded step count'
    return recs, codes, per_game


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', required=True)
    ap.add_argument('--games', default='H1=200,H2=200,H3=200,H4=2000,H5=200')
    ap.add_argument('--threads', type=int, default=2)
    ap.add_argument('--fixture', default='')
    ap.add_argument('--fixture-games', type=int, default=2)
    args = ap.parse_args()
    plan = [(k, int(v)) for k, v in (x.split('=') for x in args.games.split(','))]
    fixture = []
    total_games = 0
    total_obs = 0
    with open(args.out, 'wb') as fh:
        fh.write(MAGIC)
        for pop, limit in plan:
            recs, codes, per_game = dump_population(pop, limit, args.threads)
            popi = int(pop[1:])
            for r, c, b in zip(recs, codes, per_game):
                seed = r['seed'].encode('ascii')
                fh.write(struct.pack('<H', len(seed)) + seed + struct.pack('<BBI', r['start'], popi, len(c)))
                fh.write(c.astype('<i4').tobytes())
                fh.write(bytes(b))
            if args.fixture:
                for r, c, b in list(zip(recs, codes, per_game))[:args.fixture_games]:
                    d = house_digest(bytes(b))
                    fixture.append({'population': pop, 'seed': r['seed'], 'start': r['start'],
                                    'codes': [int(x) for x in c], 'digest': f'{d:016x}'})
            n_obs = int(sum(len(c) + 1 for c in codes))
            total_games += len(recs)
            total_obs += n_obs
            print(f'  {pop}: {len(recs)} games, {n_obs:,} observations')
    print(f'dump-actor-buffers: {total_games} games, {total_obs:,} observations -> {args.out} (corpus {CORPUS})')
    if args.fixture:
        Path(args.fixture).parent.mkdir(parents=True, exist_ok=True)
        with open(args.fixture, 'w', encoding='ascii', newline='\n') as fh:
            json.dump({'format': 'athena-encoder-fixture-1', 'source': 'athena_env.BatchEnv over the G0a corpus',
                       'digest': 'replay-format.md §3, one element: the game\'s observations concatenated',
                       'games': fixture}, fh, separators=(',', ':'))
            fh.write('\n')
        print(f'  fixture: {len(fixture)} games -> {args.fixture}')


if __name__ == '__main__':
    main()
