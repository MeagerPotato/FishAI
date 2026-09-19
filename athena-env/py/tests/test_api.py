"""The batch API's contract (athena-env/API.md): the action codes, argument checks, determinism across thread counts,
auto-reset, the GIL released while Rust works, and G0b's NumPy stub (legal, and the mixed stub's game length).

Run: python athena-env/py/tests/test_api.py
"""
import threading
import time

import numpy as np
import athena_env as ae
from _common import CORPUS, load_bench, read_block, run_tests

G = load_bench()


def test_layout_constants():
    assert (ae.N_ASK, ae.A_DECLINE, ae.A_PASS, ae.A_DECLARE, ae.N_ASSIGN, ae.N_ACTIONS) == (162, 162, 163, 165, 729,
                                                                                             6726)
    assert (ae.L_ASK, ae.L_DECLARE, ae.L_DECLINE, ae.L_PASS, ae.LEGAL_LEN) == (0, 162, 171, 172, 174)
    assert (ae.O_HAND, ae.O_COUNTS, ae.O_PHASE, ae.O_TURN, ae.O_WINDOW, ae.O_OPTION, ae.O_DECLINED, ae.O_SCORE,
            ae.O_SETS, ae.SET_FIELDS, ae.O_REGIME, ae.OBS_LEN) == (0, 54, 60, 61, 62, 63, 64, 65, 67, 3, 94, 95)
    assert (ae.E_TYPE, ae.E_ACTOR, ae.E_TARGET, ae.E_CARD, ae.E_HIT, ae.E_SET, ae.E_RESULT, ae.E_ASSIGN, ae.E_HOLDERS,
            ae.EVENT_LEN, ae.MAX_EVENTS) == (0, 1, 2, 3, 4, 5, 6, 7, 13, 19, 32)
    assert ae.CRITIC_LEN == 54 and ae.NONE == 255 and ae.STEP_CAP == 6000
    assert ae.SET_CARDS[8] == [6, 19, 32, 45, 52, 53] and ae.SET_NAMES[8] == 'EIGHTS'
    b = ae.BatchEnv(3).make_buffers()
    assert {k: (v.shape, v.dtype.str) for k, v in b.items()} == {
        'seat': ((3,), '|u1'), 'obs': ((3, 95), '|u1'), 'legal': ((3, 174), '|u1'), 'events': ((3, 32, 19), '|u1'),
        'n_events': ((3,), '|u1'), 'critic': ((3, 54), '|u1')}
    assert 'critic' not in ae.BatchEnv(3).make_buffers(critic=False)


def test_action_codes_round_trip():
    rng = np.random.default_rng(3)
    for seat in range(6):
        for code in list(range(0, ae.A_DECLARE + 1)) + list(rng.integers(ae.A_DECLARE, ae.N_ACTIONS, 300)):
            a = ae.decode_action(seat, int(code))
            assert a[1] == seat
            assert ae.encode_action(*a) == code, (seat, code, a)
    assert ae.decode_action(4, 54 + 32) == ('ask', 4, 1, 32)
    assert ae.decode_action(1, ae.A_DECLARE + 8 * 729 + 27 + 81 + 2 * 243) == ('declare', 1, 8, [1, 1, 1, 3, 3, 5])
    assert ae.decode_action(2, ae.A_PASS + 1) == ('pass', 2, 0)
    for bad in [('ask', 0, 2, 5), ('pass', 0, 1), ('pass', 3, 3), ('declare', 0, 0, [0, 0, 0, 0, 0, 1])]:
        try:
            ae.encode_action(*bad)
            raise AssertionError(f'{bad} has no code')
        except ValueError:
            pass
    for code in (-1, ae.N_ACTIONS):
        try:
            ae.decode_action(0, code)
            raise AssertionError(code)
        except ValueError:
            pass


def expect(exc, fn):
    try:
        fn()
    except exc as e:
        return str(e)
    raise AssertionError(f'expected {exc.__name__}')


def test_errors_are_loud():
    expect(ValueError, lambda: ae.BatchEnv(0))
    expect(ValueError, lambda: ae.BatchEnv(4, threads=0))
    env = ae.BatchEnv(4, threads=2)
    b = env.make_buffers()
    assert 'reset' in expect(ValueError, lambda: env.observe(b))
    expect(ValueError, lambda: env.reset(['a', 'b', 'c'], [0, 1, 2]))
    expect(ValueError, lambda: env.reset(['a', 'b', 'c', 'd'], [0, 1, 2, 6]))
    env.reset(['a', 'b', 'c', 'd'], np.array([0, 1, 2, 3], dtype=np.int64))
    env.observe(b)
    # Buffers: a missing key, a wrong dtype, a wrong shape, a non-contiguous array, the same array twice.
    expect(KeyError, lambda: env.observe({k: v for k, v in b.items() if k != 'legal'}))
    expect(TypeError, lambda: env.observe({**b, 'obs': b['obs'].astype(np.int16)}))
    expect(ValueError, lambda: env.observe({**b, 'obs': np.zeros((4, 94), np.uint8)}))
    expect(ValueError, lambda: env.observe({**b, 'obs': np.zeros((4, 190), np.uint8)[:, ::2]}))
    expect(ValueError, lambda: env.observe({**b, 'n_events': b['seat']}))
    # Actions: int32 or int64; the first move is a window poll, so an ask is refused and that game is unchanged.
    expect(TypeError, lambda: env.step(np.zeros(4, np.float32)))
    before = env.steps().copy()
    msg = expect(ValueError, lambda: env.step(np.array([0, 162, 162, 162], dtype=np.int64)))
    assert 'game 0' in msg and 'DECLARE_WINDOW_OPEN' in msg, msg
    assert list(env.steps()) == [before[0], 1, 1, 1]
    expect(ValueError, lambda: env.step(np.array([ae.N_ACTIONS] * 4, dtype=np.int32)))
    expect(ValueError, lambda: env.step(np.zeros(3, np.int32)))


def stub_run(threads, steps=400, n=97):
    env = ae.BatchEnv(n, threads=threads, auto_reset='athena-p0-g0b-api-', auto_reset_start=n, track_digests=True)
    env.reset([f'athena-p0-g0b-api-{i}' for i in range(n)], np.arange(n) % 6)
    b = env.make_buffers()
    env.observe(b)
    stub = G.MixedStub(n, 5)
    trace = []
    for _ in range(steps):
        r, te, tr = env.step(stub(b), b)
        d, l, v = env.digests()
        trace.append((b['obs'].tobytes(), b['legal'].tobytes(), b['n_events'].tobytes(), b['critic'].tobytes(),
                      r.tobytes(), te.tobytes(), tr.tobytes(), d.tobytes(), l.tobytes(), v.tobytes()))
    return trace, env.stats(), env.seeds(), env.next_game


def test_threads_do_not_change_anything():
    one = stub_run(1)
    assert one[1]['auto_resets'] > 0
    for t in (2, 3, 4):
        assert stub_run(t) == one, f'threads={t}'


def test_auto_reset_numbers_games_in_slot_order():
    n = 50
    env = ae.BatchEnv(n, threads=3, auto_reset='g', auto_reset_start=n)
    env.reset([f'g{i}' for i in range(n)], np.arange(n) % 6)
    b = env.make_buffers()
    env.observe(b)
    stub = G.MixedStub(n, 1)
    seen = set(env.seeds())
    for _ in range(3000):
        before = env.seeds()
        nxt = env.next_game
        _, te, tr = env.step(stub(b), b)
        ended = np.flatnonzero(te | tr)
        after = env.seeds()
        assert [after[i] for i in ended] == [f'g{k}' for k in range(nxt, nxt + len(ended))]
        assert all(after[i] == before[i] for i in range(n) if i not in set(ended))
        assert list(env.start_seats()[ended]) == [k % 6 for k in range(nxt, nxt + len(ended))]
        seen.update(after)
    assert len(seen) == env.next_game and env.stats()['auto_resets'] == env.next_game - n


def test_gil_is_released_while_rust_steps():
    n = 60000
    env = ae.BatchEnv(n, threads=1, auto_reset='x', auto_reset_start=n)
    env.reset([f'x{i}' for i in range(n)], np.arange(n) % 6)
    b = env.make_buffers()
    env.observe(b)
    acts = np.full(n, ae.A_DECLINE, dtype=np.int32)  # the opening window: every start seat declines
    stamps = []
    stop = threading.Event()

    def spin():
        clock = time.perf_counter
        while not stop.is_set():
            stamps.append(clock())

    t = threading.Thread(target=spin)
    t.start()
    time.sleep(0.05)
    t0 = time.perf_counter()
    env.step(acts, b)
    t1 = time.perf_counter()
    stop.set()
    t.join()
    # The spinning thread's progress through the step: with the GIL held by the step, it would stall for the whole
    # step (one gap of about t1 - t0); with the GIL released, its largest gap is far shorter.
    inside = np.array([s for s in stamps if t0 <= s <= t1])
    gaps = np.diff(np.concatenate(([t0], inside, [t1])))
    assert inside.size > 100 and gaps.max() < 0.5 * (t1 - t0), (inside.size, gaps.max(), t1 - t0)
    print(f'  a Python thread ran {inside.size:,} iterations during a {1e3 * (t1 - t0):.1f} ms step of {n} games; '
          f'its longest stall {1e3 * gaps.max():.2f} ms')


def test_numpy_stub_plays_the_mixed_stub_rule():
    """Every stub action is legal (step raises otherwise), and its games are as long as the reference stub's: the
    corpus's H5 (the TypeScript mixed stub, 2,000 games) is the reference."""
    n = 20000
    env = ae.BatchEnv(n, threads=4)
    env.reset([f'athena-p0-g0b-len-{i}' for i in range(n)], np.arange(n) % 6)
    b = env.make_buffers()
    env.observe(b)
    stub = G.MixedStub(n, 2)
    while (env.ended() == 0).any():
        env.step(stub(b), b)
    steps = env.steps().astype(float)
    assert (env.ended() == 1).all(), 'a stub game was capped'
    ref = np.array([r['steps'] for r in read_block('H5')], dtype=float) if CORPUS.exists() else None
    se = np.hypot(steps.std() / np.sqrt(n), ref.std() / np.sqrt(ref.size)) if ref is not None else 0
    print(f'  NumPy stub: {n} games, mean {steps.mean():.1f} actions (sd {steps.std():.1f}); '
          + (f'H5 reference: {ref.size} games, mean {ref.mean():.1f} (sd {ref.std():.1f}); difference '
             f'{(steps.mean() - ref.mean()) / se:+.2f} SE' if ref is not None else 'no corpus to compare'))
    if ref is not None:
        assert abs(steps.mean() - ref.mean()) < 3 * se


def test_ask_pick_is_uniform_over_legal_asks():
    n = 4096
    env = ae.BatchEnv(n)
    env.reset([f'athena-p0-g0b-unif-{i}' for i in range(n)], np.arange(n) % 6)
    b = env.make_buffers()
    env.observe(b)
    stub = G.MixedStub(n, 3)
    for _ in range(40):
        env.step(stub(b), b)
    rows = np.flatnonzero((b['obs'][:, ae.O_WINDOW] == 0) & (b['obs'][:, ae.O_PHASE] == 0))[:60]
    mask = b['legal'][rows, :ae.N_ASK]
    rng = np.random.default_rng(4)
    counts = np.zeros(mask.shape)
    draws = 3000
    for _ in range(draws):
        counts[np.arange(rows.size), G.pick_uniform_packed(mask, rng)] += 1
    assert (counts[mask == 0] == 0).all(), 'an illegal ask was drawn'
    legal_n = mask.sum(axis=1).astype(float)
    expd = np.repeat(draws / legal_n, legal_n.astype(np.int64))
    z = (counts[mask == 1] - expd) / np.sqrt(expd)
    assert abs(z.mean()) < 0.1 and 0.8 < z.var() < 1.1, (z.mean(), z.var())
    print(f'  {rows.size} ask rows, {draws} draws each: only legal asks; standardised residuals mean '
          f'{z.mean():+.3f}, variance {z.var():.3f}')


if __name__ == '__main__':
    run_tests(globals())
