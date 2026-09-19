"""P1's additions to the batch API (ATHENA.md §8.1, §8.2; athena-env/API.md §5.2, §5.3, §5.5, §8): the facts buffer,
the reveal regimes and their bit, the start-seat rule, and G1c's window rule.

The gates themselves run elsewhere (`facts-check` over the corpus and the bridge's records; `check-encoder.mjs` for
the JavaScript encoder); these tests pin the Python surface.

Run: python athena-env/py/tests/test_facts.py
(ATHENA_ENV_MUTANTS=<an unpacked `maturin build --features mutants` wheel> adds the planted M6, M7 and G1b's control.)
"""
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import athena_env as ae
from _common import actor_bytes, load_bench, run_tests

G = load_bench()


def test_layout_constants():
    assert (ae.F_CAND, ae.F_UNKNOWN, ae.F_SET_CERTAIN, ae.F_SET_LOST, ae.F_RAIL, ae.F_RAIL_ASSIGN, ae.F_NCONS,
            ae.F_CONS, ae.CONS_FIELDS, ae.MAX_CONS, ae.FACTS_LEN) == (0, 54, 60, 69, 78, 79, 85, 86, 3, 64, 278)
    assert (ae.O_REGIME, ae.OBS_LEN, ae.REGIME_HOME, ae.REGIME_BRIDGE) == (94, 95, 0, 1)
    assert (ae.WINDOW_DECLINED, ae.WINDOW_RAIL, ae.WINDOW_LIVE, ae.WINDOW_COMPELLED) == (0, 1, 2, 3)
    assert 'facts' not in ae.BatchEnv(3).make_buffers()
    b = ae.BatchEnv(3, facts=True).make_buffers(critic=False)
    assert {k: (v.shape, v.dtype.str) for k, v in b.items()} == {
        'seat': ((3,), '|u1'), 'obs': ((3, 95), '|u1'), 'legal': ((3, 174), '|u1'), 'events': ((3, 32, 19), '|u1'),
        'n_events': ((3,), '|u1'), 'facts': ((3, 278), '|u1')}
    assert 'facts' not in ae.BatchEnv(3, facts=True).make_buffers(facts=False)
    assert ae.BatchEnv(3, facts=True).facts and not ae.BatchEnv(3).facts


def expect(exc, fn):
    try:
        fn()
    except exc as e:
        return str(e)
    raise AssertionError(f'expected {exc.__name__}')


def test_errors_are_loud():
    env = ae.BatchEnv(2)
    env.reset(['a', 'b'], [0, 1])
    b = env.make_buffers(facts=True)
    assert 'facts on' in expect(ValueError, lambda: env.observe(b))
    expect(ValueError, lambda: env.reset(['a', 'b'], [0, 1], regimes=[0, 2]))
    expect(ValueError, lambda: env.reset(['a', 'b'], [0, 1], regimes=[0]))
    expect(ValueError, lambda: ae.BatchEnv(2, auto_reset_regime='abroad'))
    env = ae.BatchEnv(2, facts=True)
    env.reset(['a', 'b'], [0, 1])
    b = env.make_buffers()
    expect(ValueError, lambda: env.observe({**b, 'facts': np.zeros((2, 277), np.uint8)}))


def play(n, regimes, facts, seed='athena-p1-api-', steps=None):
    """G0b's NumPy stub over n games; yields (env, bufs) before every step."""
    env = ae.BatchEnv(n, threads=2, facts=facts)
    env.reset([f'{seed}{i}' for i in range(n)], np.arange(n) % 6, regimes=regimes)
    b = env.make_buffers()
    env.observe(b)
    stub = G.MixedStub(n, 9)
    t = 0
    while (env.ended() == 0).any() and (steps is None or t < steps):
        yield env, b
        env.step(stub(b), b)
        t += 1
    yield env, b


def test_the_regime_bit_and_the_regimes():
    n = 40
    regimes = [i % 2 for i in range(n)]
    for env, b in play(n, regimes, False, steps=5):
        assert list(env.regimes()) == regimes
        assert list(b['obs'][:, ae.O_REGIME]) == regimes
    # Auto-reset draws each new game's regime from its seed; both occur.
    env = ae.BatchEnv(64, auto_reset='athena-p1-draw-', auto_reset_start=64, auto_reset_regime='draw')
    env.reset([f'athena-p1-draw-{i}' for i in range(64)], np.arange(64) % 6)
    b = env.make_buffers()
    env.observe(b)
    stub = G.MixedStub(64, 4)
    drawn = set()
    for _ in range(4000):
        env.step(stub(b), b)
        drawn.update(int(x) for x in env.regimes())
    assert drawn == {0, 1}, drawn


def test_facts_on_changes_no_other_byte():
    n = 24
    a = play(n, None, False, seed='athena-p1-same-')
    f = play(n, None, True, seed='athena-p1-same-')
    states = 0
    for (ea, ba), (ef, bf) in zip(a, f):
        for i in np.flatnonzero(ea.ended() == 0):
            assert actor_bytes(ba, i) == actor_bytes(bf, i)
            states += 1
    assert states > 5000


def test_the_start_seat_waits_for_the_first_event():
    n = 60
    first = [None] * n
    for env, b in play(n, None, False, seed='athena-p1-start-'):
        for i in range(n):
            ne = int(b['n_events'][i])
            rows = b['events'][i, :ne]
            if first[i] is None and env.steps()[i] == 0:
                assert ne == 0, 'an event before the first event'
            for k in range(ne):
                if rows[k, ae.E_TYPE] == 0:
                    assert k == 0 and ne >= 2 and rows[0, ae.E_ACTOR] == rows[1, ae.E_ACTOR]
                    first[i] = int(rows[1, ae.E_TYPE])
    assert all(x is not None for x in first)


def test_window_classes_is_the_rule_on_the_row():
    n = 48
    seen = np.zeros((3, 4), dtype=np.int64)
    for env, b in play(n, [i % 2 for i in range(n)], True, seed='athena-p1-window-'):
        rows = np.flatnonzero((env.ended() == 0) & (b['obs'][:, ae.O_WINDOW] == 1))
        if rows.size == 0:
            continue
        f = np.ascontiguousarray(b['facts'][rows])
        lg = np.ascontiguousarray(b['legal'][rows])
        for j, k in enumerate((2, 3, 4)):
            got = ae.window_classes(f, lg, k)
            certain = f[:, ae.F_SET_CERTAIN:ae.F_SET_CERTAIN + 9]
            lost = f[:, ae.F_SET_LOST:ae.F_SET_LOST + 9]
            live = ((certain != ae.NONE) & (lost == 0) & (certain >= k)).any(axis=1)
            want = np.where(f[:, ae.F_RAIL] != ae.NONE, ae.WINDOW_RAIL,
                            np.where(live, ae.WINDOW_LIVE,
                                     np.where(lg[:, ae.L_DECLINE] == 0, ae.WINDOW_COMPELLED, ae.WINDOW_DECLINED)))
            assert (got == want).all()
            seen[j] += np.bincount(got, minlength=4)
    assert (seen[:, :3] > 0).all(), seen  # a compelled window with no live set is rare under the stub
    print(f'  window classes over the stub games (declined, rail, live, compelled) for k = 2, 3, 4: {seen.tolist()}')


def test_the_facts_row_is_sound():
    n = 32
    rails = 0
    for env, b in play(n, None, True, seed='athena-p1-sound-'):
        for i in np.flatnonzero(env.ended() == 0):
            f = b['facts'][i]
            assert f[ae.F_NCONS] <= ae.MAX_CONS
            assert (f[ae.F_CONS + ae.CONS_FIELDS * int(f[ae.F_NCONS]):] == ae.NONE).all()
            if f[ae.F_RAIL] != ae.NONE:
                rails += 1
                assert all(r in (0, 2, 4) for r in f[ae.F_RAIL_ASSIGN:ae.F_RAIL_ASSIGN + 6])
    assert rails > 0


def test_the_default_build_plants_nothing():
    env = ae.BatchEnv(1, facts=True)
    planted = hasattr(env, 'set_facts_mutant') or hasattr(env, 'set_full_reveal_control')
    assert planted == ae.MUTANTS, (planted, ae.MUTANTS)


MUTANTS_CODE = '''
import sys
sys.path.insert(0, {build!r})
sys.path.insert(1, {tests!r})
import numpy as np
import athena_env as ae
from _common import actor_bytes, load_bench
assert ae.MUTANTS is True and ae.__file__.startswith({build!r}), ae.__file__
G = load_bench()
n = 24
regimes = [i % 2 for i in range(n)]
seeds = [f'athena-p1-mutants-{{i}}' for i in range(n)]

def run(plant):
    """Lockstep: the plain batch and the planted one, stepped with the plain batch's stub moves."""
    a, p = ae.BatchEnv(n, facts=True), ae.BatchEnv(n, facts=True)
    try:
        p.set_facts_mutant('M9')
        raise AssertionError('M9')
    except ValueError:
        pass
    plant(p)
    for env in (a, p):
        env.reset(seeds, np.arange(n) % 6, regimes=regimes)
    ba, bp = a.make_buffers(), p.make_buffers()
    a.observe(ba)
    p.observe(bp)
    stub = G.MixedStub(n, 9)
    facts = [0, 0]
    actor = [0, 0]
    while (a.ended() == 0).any():
        for i in np.flatnonzero(a.ended() == 0):
            facts[regimes[i]] += int((ba['facts'][i] != bp['facts'][i]).any())
            actor[regimes[i]] += int(actor_bytes(ba, i) != actor_bytes(bp, i))
        act = stub(ba)
        a.step(act, ba)
        p.step(act.copy(), bp)
    assert (p.ended() != 0).all()
    return facts, actor

m6 = run(lambda p: p.set_facts_mutant('M6'))
m7 = run(lambda p: p.set_facts_mutant('M7'))
ctl = run(lambda p: p.set_full_reveal_control(True))
print('M6', m6, 'M7', m7, 'control', ctl)
# The facts mutants change the facts row, in both regimes, and no other byte.
for f, x in (m6, m7):
    assert f[0] > 0 and f[1] > 0 and x == [0, 0], (f, x)
# The control changes the bridge regime's observations (the reveal) and none of the home regime's.
f, x = ctl
assert x[1] > 0 and x[0] == 0 and f[0] == 0, ctl
'''


def test_a_mutants_build_plants_m6_m7_and_the_control():
    path = os.environ.get('ATHENA_ENV_MUTANTS')
    if not path:
        print('  (skipped: set ATHENA_ENV_MUTANTS to an unpacked `maturin build --features mutants` wheel)')
        return
    code = MUTANTS_CODE.format(build=str(Path(path).resolve()), tests=str(Path(__file__).resolve().parent))
    p = subprocess.run([sys.executable, '-c', code], capture_output=True, text=True)
    assert p.returncode == 0, p.stdout + p.stderr
    print('  ' + p.stdout.strip())


if __name__ == '__main__':
    run_tests(globals())
