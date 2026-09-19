"""The information rules hold in the actor's buffers (ATHENA.md §4.1; replay-format.md §4.7).

The actor's buffers (`seat`, `obs`, `legal`, `n_events` and the delivered `events` rows) may hold nothing that
`seatView(S_t, acting)` does not show. Two tests, both through the Python API:

1. **Two deals that differ only in cards the acting seat cannot see.** Deal B is deal A with every card outside the
   start seat's hand re-dealt at random among the other five seats, each keeping its hand count. The start seat's
   actor buffers are identical in the two games, at the opening window and again at its first ask after all six
   seats decline; the critic buffers differ.
2. **Mid-game, along whole trajectories.** A batch is played by G0b's NumPy stub. At checkpoints, a second batch
   replays the same actions (with the same observations, so the same undelivered events), then has every game's
   hidden cards re-dealt (`debug_permute_hidden`: the acting seat's view is unchanged, and so is whether the
   turn-holder could ask, which that view implies); both observe, and every game's actor buffers must be identical
   while its critic buffer differs.

A mutant check makes sure the comparison can fail: leaking one hidden bit into a copy of the obs row is caught.

Run: python athena-env/py/tests/test_info_rule.py
"""
import numpy as np
import athena_env as ae
from _common import actor_bytes, load_bench, run_tests

G = load_bench()


def deal_holders(env):
    """Each game's absolute card holders, from the critic buffer of a fresh observation (relative to the acting
    seat, which is the start seat before any step)."""
    b = env.make_buffers()
    env.observe(b)
    seat = b['seat'].astype(np.int32)[:, None]
    return ((b['critic'].astype(np.int32) + seat) % 6).astype(np.uint8), b


def test_two_deals_differing_only_in_hidden_cards():
    n = 400
    rng = np.random.default_rng(7)
    starts = np.arange(n) % 6
    a = ae.BatchEnv(n)
    a.reset([f'athena-p0-g0b-info-{i}' for i in range(n)], starts)
    holders_a, _ = deal_holders(a)
    holders_b = holders_a.copy()
    for i in range(n):
        hidden = np.flatnonzero(holders_a[i] != starts[i])
        holders_b[i, hidden] = rng.permutation(holders_a[i, hidden])
    assert (holders_b != holders_a).any(axis=1).all()
    envs = [ae.BatchEnv(n), ae.BatchEnv(n)]
    envs[0].reset_deals(holders_a, starts)
    envs[1].reset_deals(holders_b, starts)
    bufs = [e.make_buffers() for e in envs]
    for e, b in zip(envs, bufs):
        e.observe(b)
    for i in range(n):
        assert actor_bytes(bufs[0], i) == actor_bytes(bufs[1], i), f'game {i}: opening window'
        assert (bufs[0]['critic'][i] != bufs[1]['critic'][i]).any()
    # All six seats decline (each decline is legal in both: the start seat can ask in both deals, its hand is the
    # same). The others' observations differ, legitimately; the start seat's next observation is at its ask.
    can_ask = bufs[0]['legal'][:, ae.L_DECLINE] == 1
    assert (can_ask == (bufs[1]['legal'][:, ae.L_DECLINE] == 1)).all()
    idx = np.flatnonzero(can_ask)
    assert idx.size > 0.9 * n
    for _ in range(6):
        for e, b in zip(envs, bufs):
            e.step(np.full(n, ae.A_DECLINE, dtype=np.int32), b)
    compared = 0
    for i in idx:
        assert bufs[0]['seat'][i] == starts[i] and bufs[0]['obs'][i, ae.O_WINDOW] == 0
        assert actor_bytes(bufs[0], i) == actor_bytes(bufs[1], i), f'game {i}: first ask'
        compared += 1
    print(f'  {n} deal pairs identical at the opening window; {compared} identical again at the first ask')


def play_and_checkpoint(n, checkpoints, seed=11, threads=2):
    """Play n games with the NumPy stub (auto-reset on), and at each checkpoint compare against a replayed twin with
    the hidden cards re-dealt. Returns (games compared, critic buffers that differed)."""
    seeds = [f'athena-p0-g0b-mid-{i}' for i in range(n)]
    starts = np.arange(n) % 6

    def fresh():
        e = ae.BatchEnv(n, threads=threads, auto_reset='athena-p0-g0b-mid-', auto_reset_start=n)
        e.reset(seeds, starts)
        b = e.make_buffers()
        e.observe(b)
        return e, b

    env, bufs = fresh()
    stub = G.MixedStub(n, seed)
    history = []
    compared = differ = 0
    for t in range(max(checkpoints) + 1):
        acts = stub(bufs).copy()
        history.append(acts)
        env.step(acts)  # observe separately, so a checkpoint can come between the step and the observation
        if t in checkpoints:
            twin, tb = fresh()
            for past in history[:-1]:
                twin.step(past, tb)
            twin.step(history[-1])
            moved = np.array([twin.debug_permute_hidden(i, 1000 * t + i) for i in range(n)])
            env.observe(bufs)
            twin.observe(tb)
            for i in np.flatnonzero(moved):
                assert actor_bytes(bufs, i) == actor_bytes(tb, i), f'game {i}, step {t}'
                compared += 1
                differ += bool((bufs['critic'][i] != tb['critic'][i]).any())
        else:
            env.observe(bufs)
    return compared, differ


def test_mid_game_hidden_cards_never_reach_the_actor():
    checkpoints = {0, 1, 2, 7, 30, 100, 250, 500, 900, 1400}
    compared, differ = play_and_checkpoint(256, checkpoints)
    assert compared > 2000, compared
    assert differ == compared
    print(f'  {compared} game states at {len(checkpoints)} checkpoints: actor buffers identical with the hidden cards '
          f're-dealt; the critic buffer differed in all {differ}')


def test_the_comparison_catches_a_leak():
    """A mutant: one hidden bit (does the next seat hold XB?) written into the obs row must be caught."""
    n = 64
    env = ae.BatchEnv(n)
    env.reset([f'athena-p0-g0b-leak-{i}' for i in range(n)], np.arange(n) % 6)
    twin = ae.BatchEnv(n)
    twin.reset([f'athena-p0-g0b-leak-{i}' for i in range(n)], np.arange(n) % 6)
    for i in range(n):
        twin.debug_permute_hidden(i, i)
    b1, b2 = env.make_buffers(), twin.make_buffers()
    env.observe(b1)
    twin.observe(b2)
    caught = 0
    for i in range(n):
        assert actor_bytes(b1, i) == actor_bytes(b2, i)
        for b in (b1, b2):
            b['obs'][i, ae.O_HAND + 53] |= b['critic'][i, 53] == 1  # the leak
        caught += actor_bytes(b1, i) != actor_bytes(b2, i)
    assert caught > 0
    print(f'  the planted leak differs in {caught} of {n} games')


if __name__ == '__main__':
    run_tests(globals())
