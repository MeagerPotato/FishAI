"""The home harness and the opponent service (ATHENA.md §4.5 items 4 and 5, §4.6 G0c): scripts/athena/home_harness.py.

- geometry B's rotation rule and geometry A's pairs, as registered and as documented;
- the JavaScript number formatting the printout copies, and duplicate-pairs.mjs's statistics;
- a small identity pin: two pairs through the harness equal `node scripts/duplicate-pairs.mjs` on the same bank, game for
  game and line for line, with every digest equal;
- geometry B live, with rotations 0 and 1 equal to geometry A's pair on the same seed;
- a Python arm against a Monet arm: the service applies the port's actions for the Python seats, every digest equal;
- the service's errors, and the default build's lack of mutants (a mutants build, if ATHENA_ENV_MUTANTS names one, is
  checked in a child process: M1 is caught, and an unknown mutant is refused).

At most two service workers. Run: python athena-env/py/tests/test_harness.py
(ATHENA_ENV_PATH names an unpacked athena_env build to test instead of the venv's.)
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
if os.environ.get('ATHENA_ENV_PATH'):
    sys.path.insert(0, os.environ['ATHENA_ENV_PATH'])
sys.path.insert(0, str(REPO / 'scripts' / 'athena'))

import home_harness as hh  # noqa: E402
from _common import run_tests  # noqa: E402

ae = hh.athena_env()
BANK = 'athena-test-harness'


def test_rotation_rule():
    assert [hh.rotation(r) for r in range(6)] == [(0, 0), (0, 1), (2, 0), (2, 1), (4, 0), (4, 1)]
    for bad in (-1, 6):
        try:
            hh.rotation(bad)
            raise AssertionError(bad)
        except ValueError:
            pass
    specs = hh.geometry_b('cell', 200)
    assert len(specs) == 1200
    assert [s.index for s in specs] == list(range(1200))
    assert len({(s.deal, s.rot) for s in specs}) == 1200
    for d in range(200):
        games = specs[6 * d:6 * d + 6]
        assert {s.seed for s in games} == {f'cell-{d}'} and [s.rot for s in games] == list(range(6))
        # three duplicate pairs: each start seat 0, 2, 4 twice, once with arm A on each team
        assert sorted((s.start, s.team_a) for s in games) == [(0, 0), (0, 1), (2, 0), (2, 1), (4, 0), (4, 1)]
        # arm A starts three of the six (the start seat is on arm A's team)
        assert sum(s.start % 2 == s.team_a for s in games) == 3
        # arm A holds each dealt hand (the hand of seat h) three times
        for h in range(6):
            assert sum(h % 2 == s.team_a for s in games) == 3
        # rotations 0 and 1 are geometry A's pair on this seed
        a = hh.geometry_a('cell', d + 1)[2 * d:2 * d + 2]
        assert [(s.seed, s.start, s.team_a) for s in a] == [(s.seed, s.start, s.team_a) for s in games[:2]]


def test_geometry_a():
    specs = hh.geometry_a('athena-p0-pin', 200)
    assert len(specs) == 400
    assert specs[0] == hh.GameSpec(0, 'athena-p0-pin-0', 0, 0, 0, 0)
    assert specs[1] == hh.GameSpec(1, 'athena-p0-pin-0', 0, 1, 0, 1)
    assert specs[399] == hh.GameSpec(399, 'athena-p0-pin-199', 0, 1, 199, 1)
    assert all(s.start == 0 for s in specs)


def test_javascript_formatting_and_the_statistics():
    # Values checked against Node's Number.prototype.toFixed.
    for x, k, want in [(0.125, 2, '0.13'), (1.005, 2, '1.00'), (-0.5, 0, '-1'), (2.5, 0, '3'), (-2.5, 0, '-3'),
                       (-0.0, 4, '0.0000'), (-0.00001, 4, '-0.0000'), (0.54, 4, '0.5400'), (3.5695648, 4, '3.5696'),
                       (0.00005, 4, '0.0001'), (-1.3333333333333333, 4, '-1.3333'), (1234.5678, 1, '1234.6')]:
        assert hh.js_fixed(x, k) == want, (x, k, hh.js_fixed(x, k), want)
    g = lambda deal, ta, a, b, end='finished': {'deal': deal, 'teamA': ta, 'setsA': a, 'setsB': b, 'end': end,  # noqa
                                                'refused': False, 'diverged': False}
    games = [g(0, 0, 5, 3), g(0, 1, 2, 5), g(1, 0, 5, 0), g(1, 1, 5, 4), g(2, 0, 1, 5), g(2, 1, 0, 5, 'capped')]
    s = hh.pairs_summary(games)
    # pairs 0 and 1 (pair 2 is dropped at the cap): d = [-1, 6], won = [1, 2]
    assert (s['pairs'], s['capped'], s['setsA'], s['setsB'], s['winsA']) == (2, 1, 17, 12, 3)
    assert s['mean'] == 2.5 and abs(s['sd'] - 4.949747468305833) < 1e-15
    text = hh.pairs_printout(s, 'v1.0', 'v0.33', 'b', 1.25)
    assert '!!! 1 pairs hit the step cap and were dropped' in text
    assert 'paired set-diff 2.5000 +/- 6.8600   (SD 4.9497 sets/pair' in text
    assert 'win rate (A)    75.00%' in text
    c = hh.cell_summary([dict(x, deal=0) for x in games[:4]] + [dict(g(1, 0, 5, 0), rot=r) for r in range(6)])
    assert c['deals'] == 1 and c['dropped'] == 1 and c['games'] == 6 and c['winsA'] == 6


def reference_pairs(pairs, bank):
    """`node scripts/duplicate-pairs.mjs --a v1.0 --b v0.33` on `bank`: its printout lines and per-game lines."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / 'games.jsonl'
        p = subprocess.run(['node', 'scripts/duplicate-pairs.mjs', '--a', 'v1.0', '--b', 'v0.33', '--pairs',
                            str(pairs), '--bank', bank, '--games-out', str(out)], cwd=str(REPO), capture_output=True,
                           text=True, check=True)
        return p.stdout.splitlines(), [json.loads(x) for x in out.read_text().splitlines()]


def test_identity_pin_in_miniature():
    lines, ref = reference_pairs(2, BANK)
    with hh.OpponentService(workers=2) as svc:
        res = hh.play(hh.geometry_a(BANK, 2), 'v1.0', 'v0.33', svc)
    c = res['counts']
    assert res['games_diverged'] == 0 and res['divergences'] == []
    assert c['deals_compared'] == 4 and c['d_mismatch'] == c['l_mismatch'] == c['v_mismatch'] == 0
    assert c['d_compared'] == sum(g['moves'] for g in res['games']) == res['actions']
    assert c['scores_compared'] == 4 and c['score_mismatch'] == 0
    got = [(g['seed'], g['teamA'], g['setsA'], g['setsB'], g['moves']) for g in res['games']]
    want = [(r['seed'], r['teamA'], r['setsA'], r['setsB'], r['moves']) for r in ref]
    assert got == want, (got, want)
    mine = hh.pairs_printout(hh.pairs_summary(res['games']), 'v1.0', 'v0.33', BANK, 0.0).splitlines()
    assert mine[1:] == lines[1:], (mine, lines)


def test_geometry_b_live_and_consistent_with_a():
    specs = hh.geometry_b(BANK, 1)
    with hh.OpponentService(workers=2) as svc:
        res = hh.play(specs, 'v1.0', 'v0.33', svc, full=False)
        pair = hh.play(hh.geometry_a(BANK, 1), 'v1.0', 'v0.33', svc, threads=2)
        assert svc.stats()['workers'][0]['live'] == 0
    assert res['games_diverged'] == 0 and res['counts']['d_mismatch'] == 0 and res['counts']['l_compared'] == 0
    assert res['counts']['d_compared'] == res['actions'] and res['counts']['deals_compared'] == 6
    assert all(g['end'] == 'finished' for g in res['games'])
    key = lambda g: (g['setsA'], g['setsB'], g['moves'])  # noqa: E731
    assert [key(g) for g in res['games'][:2]] == [key(g) for g in pair['games']]
    # the six rotations are six different games
    assert len({(g['setsA'], g['setsB'], g['moves']) for g in res['games']}) > 1


def test_a_python_arm_against_the_service():
    specs = hh.geometry_b(BANK + '-py', 1)
    with hh.OpponentService(workers=2) as svc:
        res = hh.play(specs, hh.stub_arm(len(specs), 5), 'v0.33', svc)
        stats = svc.stats()
    c = res['counts']
    assert res['games_diverged'] == 0 and c['d_mismatch'] == c['l_mismatch'] == c['v_mismatch'] == 0
    assert c['d_compared'] == res['actions'] and all(g['end'] == 'finished' for g in res['games'])
    # the service decided only for v0.33's seats, and applied every action, the stub's included
    ws = stats['workers']
    assert sum(w['applies'] for w in ws) == res['actions']
    assert 0 < sum(w['decisions'] for w in ws) < res['actions']
    assert res['arms'] == ['stub:5', 'v0.33']


def test_service_errors():
    with hh.OpponentService(workers=1) as svc:
        (g, deal, acting), = svc.open([{'g': 3, 'seed': 'x-1', 'start': 4, 'seats': ['v1.0'] * 6}])
        assert (g, acting) == (3, 4) and len(deal) == 16
        (item,) = svc.step([[3, 1, ae.A_DECLINE, 0]], True)
        assert item[7].startswith('apply of code 162 for seat 1 refused: NOT_YOUR_OPTION'), item
        for bad in ({'op': 'nope'}, {'op': 'open', 'games': [{'g': 3, 'seed': 'x', 'start': 0, 'seats': [None] * 6}]},
                    {'op': 'open', 'games': [{'g': 5, 'seed': 'x y', 'start': 0, 'seats': [None] * 6}]}):
            try:
                svc.request(bad)
                raise AssertionError(bad)
            except hh.ServiceError:
                pass
        assert svc.close([3, 5]) == 1
    assert svc.proc.returncode == 0


def test_the_default_build_has_no_mutants():
    assert getattr(ae, 'MUTANTS', False) is False
    assert not hasattr(ae.BatchEnv, 'set_mutant')
    try:
        hh.play(hh.geometry_a(BANK, 1), hh.stub_arm(2, 0), hh.stub_arm(2, 1), None, mutant='M1')
        raise AssertionError('a default build planted a mutant')
    except RuntimeError as e:
        assert 'mutants' in str(e)


def test_a_mutants_build_catches_m1():
    path = os.environ.get('ATHENA_ENV_MUTANTS')
    if not path:
        print('  (skipped: set ATHENA_ENV_MUTANTS to an unpacked `maturin build --features mutants` wheel)')
        return
    code = f'''
import sys
sys.path.insert(0, {str(REPO / "scripts" / "athena")!r})
import home_harness as hh
ae = hh.athena_env({path!r})
assert ae.MUTANTS is True and hasattr(ae.BatchEnv, "set_mutant")
try:
    ae.BatchEnv(1).set_mutant("M9")
    raise AssertionError("M9")
except ValueError:
    pass
with hh.OpponentService(workers=2) as svc:
    res = hh.play(hh.geometry_a("athena-p0-pin", 12), "v1.0", "v0.33", svc, mutant="M1")
    ok = hh.play(hh.geometry_a("athena-p0-pin", 12), "v1.0", "v0.33", svc, mutant="none")
print(res["games_diverged"], res["counts"]["d_mismatch"], [x["kind"] for x in res["divergences"]], ok["games_diverged"])
assert res["games_diverged"] >= 1 and res["counts"]["d_mismatch"] == res["games_diverged"]
assert all(x["kind"] == "d" for x in res["divergences"]) and ok["games_diverged"] == 0
'''
    p = subprocess.run([sys.executable, '-c', code], capture_output=True, text=True)
    assert p.returncode == 0, p.stdout + p.stderr
    print('  ' + p.stdout.strip())


if __name__ == '__main__':
    run_tests(globals())
