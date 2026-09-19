"""Shared helpers for the athena_env Python tests (run each test file with the venv's python; no pytest needed)."""
import importlib.util
import os
import sys
import time
import traceback
from pathlib import Path

import numpy as np
import athena_env as ae

REPO = Path(__file__).resolve().parents[3]
# The G0a corpus (ATHENA.md §4.6; scripts/athena/replay-format.md §7.3). Override with ATHENA_CORPUS.
CORPUS = Path(os.environ.get('ATHENA_CORPUS', 'C:/Projects/FishAI-bench/athena/corpus/7d85c2e'))


def load_bench():
    """scripts/athena/g0b-bench.py as a module (its MixedStub is G0b's NumPy stub)."""
    path = REPO / 'scripts' / 'athena' / 'g0b-bench.py'
    spec = importlib.util.spec_from_file_location('g0b_bench', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def code_of(seat, tag, fields):
    """The action code (relative to `seat`) of a corpus action given as its tag and fields."""
    if tag == 1:  # ask: seat target card
        target, card = fields
        r = (target - seat) % 6
        assert r % 2 == 1, 'an ask of a teammate'
        return (r - 1) // 2 * 54 + card
    if tag == 2:  # claim: seat set assign*6
        sset, assign = fields
        x = 0
        for j in range(5, -1, -1):
            r = (assign[j] - seat) % 6
            assert r % 2 == 0, 'a declare stating an opponent'
            x = 3 * x + r // 2
        return ae.A_DECLARE + sset * ae.N_ASSIGN + x
    if tag == 3:  # pass: seat to
        r = (fields[0] - seat) % 6
        assert r in (2, 4)
        return ae.A_PASS + r // 2 - 1
    if tag == 4:
        return ae.A_DECLINE
    raise ValueError(f'tag {tag}')


def decode_actions(hexstr):
    """A corpus actions column (replay-format.md §4.4) as (seats, codes) int arrays."""
    b = bytes.fromhex(hexstr)
    seats, codes = [], []
    i = 0
    while i < len(b):
        tag, seat = b[i], b[i + 1]
        if tag == 1:
            codes.append(code_of(seat, 1, (b[i + 2], b[i + 3])))
            i += 4
        elif tag == 2:
            codes.append(code_of(seat, 2, (b[i + 2], list(b[i + 3:i + 9]))))
            i += 9
        elif tag == 3:
            codes.append(code_of(seat, 3, (b[i + 2],)))
            i += 3
        elif tag == 4:
            codes.append(ae.A_DECLINE)
            i += 2
        else:
            raise ValueError(f'tag {tag} at {i}')
        seats.append(seat)
    return np.array(seats, dtype=np.uint8), np.array(codes, dtype=np.int32)


def hex_u64(col, steps):
    """A column of 16-hex digests (d, l or v) as a uint64 array."""
    assert len(col) == 16 * steps
    return np.array([int(col[16 * i:16 * i + 16], 16) for i in range(steps)], dtype=np.uint64)


def read_block(pop, limit=None):
    """The corpus records of one population (H1-H5), parsed: a list of dicts."""
    files = sorted(CORPUS.glob(f'{pop}-*.tsv'))
    if not files:
        raise FileNotFoundError(f'no {pop} block in {CORPUS} (set ATHENA_CORPUS)')
    out = []
    with open(files[0], encoding='ascii') as fh:
        for line in fh:
            f = line.rstrip('\n').split('\t')
            steps = int(f[8])
            out.append({
                'population': f[1], 'index': int(f[2]), 'seed': f[3], 'start': int(f[4]), 'steps': steps,
                'end': f[9], 'deal': int(f[10], 16), 'actions': f[11], 'd': f[12], 'l': f[13], 'v': f[14],
            })
            if limit and len(out) >= limit:
                break
    return out


# The house digest (replay-format.md §3), for sampled checks of encodings built in Python.
def house_digest(data: bytes) -> int:
    h1, h2 = 0xDEADBEEF, 0x41C6CE57
    M = 0xFFFFFFFF
    for c in b'1\x00' + data + b'\x01':
        h1 = ((h1 ^ c) * 2654435761) & M
        h2 = ((h2 ^ c) * 1597334677) & M
    a = ((h1 ^ (h1 >> 16)) * 2246822507) & M
    b = ((h2 ^ (h2 >> 13)) * 3266489909) & M
    a ^= b
    b ^= ((a ^ (a >> 16)) * 2246822507) & M
    return (b << 32) | a


def actor_bytes(bufs, i):
    """Game i's actor buffers: seat, n_events, the obs row, the legal row, and the delivered event rows."""
    ne = int(bufs['n_events'][i])
    return (bytes([bufs['seat'][i], ne]) + bufs['obs'][i].tobytes() + bufs['legal'][i].tobytes()
            + bufs['events'][i, :ne].tobytes())


def run_tests(module_globals):
    """Run every `test_*` function of a module, report, and exit non-zero on any failure."""
    tests = [(k, v) for k, v in module_globals.items() if k.startswith('test_') and callable(v)]
    failed = 0
    for name, fn in tests:
        t = time.perf_counter()
        try:
            fn()
            print(f'PASS {name} ({time.perf_counter() - t:.1f} s)', flush=True)
        except Exception:  # noqa: BLE001 - report every failure
            failed += 1
            print(f'FAIL {name} ({time.perf_counter() - t:.1f} s)', flush=True)
            traceback.print_exc()
    print(f'{len(tests) - failed} of {len(tests)} passed')
    sys.exit(1 if failed else 0)
