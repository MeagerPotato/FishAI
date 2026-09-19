"""The batch API reproduces the G0a reference corpus (ATHENA.md §4.6; scripts/athena/replay-format.md).

H4 (the repo's us54 fuzz policy, 4,000 games) and H5 (the mixed stub, 2,000 games) are each played as one batch
through `athena_env.BatchEnv`, driven by the corpus's own actions converted to the API's action codes. At every step,
for every game still running:

- the observation's acting seat is the recorded action's seat, and the recorded action's code is legal in the legal
  row (every action the reference played is in the mask);
- the legal-move digest l_t and the view digest v_t of the state before the step, and the state-chain digest d_t
  after it, equal the corpus's (`track_digests=True`);
- on a sample of steps, the legal row itself, re-encoded in Python as the reference's legal-move record L_t (kind
  bits by the reducer's verdict, the asks in `legalAsks` order) and digested with the house digest, equals l_t:
  the masks are the reference's legal set, not only a superset of the played actions;
- the game ends exactly at its recorded step count, finished (terminated) or capped (truncated) as recorded, with
  the winner's reward +1 and the loser's -1 agreeing with the final score.

Run: python athena-env/py/tests/test_corpus.py   (the corpus at ATHENA_CORPUS, default the bench archive's)
"""
import numpy as np
import athena_env as ae
from _common import decode_actions, hex_u64, house_digest, read_block, run_tests

SAMPLE_EVERY = 23  # the L_t re-encoding check runs on every 23rd step (and step 0) of every game


def legal_record(seat, row):
    """L_t (replay-format.md §4.6) built from one legal row: acting seat, kind bits, asks in the reference order."""
    asks = []
    for k in range(3):
        target = (seat + 2 * k + 1) % 6
        for card in np.flatnonzero(row[ae.L_ASK + 54 * k:ae.L_ASK + 54 * (k + 1)]):
            asks.append((target, int(card)))
    asks.sort()
    kinds = ((1 if asks else 0) | (2 if row[ae.L_DECLARE:ae.L_DECLARE + 9].any() else 0)
             | (4 if row[ae.L_PASS:ae.L_PASS + 2].any() else 0) | (8 if row[ae.L_DECLINE] else 0))
    out = bytes([seat, kinds]) + len(asks).to_bytes(2, 'little')
    return out + b''.join(bytes(a) for a in asks)


def mask_col(codes):
    """For each action code, its column in the legal row."""
    col = np.empty(codes.shape, dtype=np.intp)
    ask = codes < ae.A_DECLINE
    col[ask] = ae.L_ASK + codes[ask]
    col[codes == ae.A_DECLINE] = ae.L_DECLINE
    p = (codes >= ae.A_PASS) & (codes < ae.A_DECLARE)
    col[p] = ae.L_PASS + codes[p] - ae.A_PASS
    d = codes >= ae.A_DECLARE
    col[d] = ae.L_DECLARE + (codes[d] - ae.A_DECLARE) // ae.N_ASSIGN
    return col


def replay_population(pop, threads=4):
    recs = read_block(pop)
    n = len(recs)
    games = []
    for r in recs:
        seats, codes = decode_actions(r['actions'])
        assert len(codes) == r['steps']
        games.append({
            'seats': seats, 'codes': codes, 'd': hex_u64(r['d'], r['steps']), 'l': hex_u64(r['l'], r['steps']),
            'v': hex_u64(r['v'], r['steps']), 'steps': r['steps'], 'end': r['end'],
        })
    T = np.array([g['steps'] for g in games])
    maxT = int(T.max())
    # Step-major arrays, padded past each game's end.
    S = np.zeros((maxT, n), dtype=np.uint8)
    A = np.full((maxT, n), ae.A_DECLINE, dtype=np.int32)
    D = np.zeros((maxT, n), dtype=np.uint64)
    L = np.zeros((maxT, n), dtype=np.uint64)
    V = np.zeros((maxT, n), dtype=np.uint64)
    for i, g in enumerate(games):
        k = g['steps']
        S[:k, i], A[:k, i], D[:k, i], L[:k, i], V[:k, i] = g['seats'], g['codes'], g['d'], g['l'], g['v']

    env = ae.BatchEnv(n, threads=threads, track_digests=True)
    env.reset([r['seed'] for r in recs], np.array([r['start'] for r in recs]))
    bufs = env.make_buffers(critic=False)
    env.observe(bufs)
    d0, _, _ = env.digests()
    assert (d0 == np.array([r['deal'] for r in recs], dtype=np.uint64)).all(), f'{pop}: deal digests differ'

    sampled = 0
    ended_at = np.full(n, -1)
    rewards = np.zeros((n, 2), dtype=np.float32)
    truncated_seen = np.zeros(n, dtype=bool)
    for t in range(maxT):
        live = np.flatnonzero(T > t)
        _, l_now, v_now = env.digests()
        assert (bufs['seat'][live] == S[t, live]).all(), f'{pop} step {t}: acting seat differs'
        assert (bufs['legal'][live, mask_col(A[t, live])] == 1).all(), f'{pop} step {t}: a played action is masked'
        assert (l_now[live] == L[t, live]).all(), f'{pop} step {t}: l_t differs'
        assert (v_now[live] == V[t, live]).all(), f'{pop} step {t}: v_t differs'
        if t % SAMPLE_EVERY == 0:
            for i in live:
                rec = legal_record(int(bufs['seat'][i]), bufs['legal'][i])
                assert house_digest(rec) == int(L[t, i]), f'{pop} game {i} step {t}: the legal row is not L_t'
                sampled += 1
        rew, term, trunc = env.step(A[t], bufs)
        d_now, _, _ = env.digests()
        assert (d_now[live] == D[t, live]).all(), f'{pop} step {t}: d_t differs'
        endnow = np.flatnonzero(term | trunc)
        assert (T[endnow] == t + 1).all(), f'{pop} step {t}: a game ended early'
        ended_at[endnow] = t + 1
        rewards[endnow] = rew[endnow]
        truncated_seen[np.flatnonzero(trunc)] = True
        assert not (term | trunc)[np.setdiff1d(np.arange(n), live)].any(), f'{pop} step {t}: an ended game re-ended'
    assert (ended_at == T).all(), f'{pop}: some game did not end at its recorded step count'
    assert (env.steps() == T).all()
    ends = np.array([g['end'] for g in games])
    assert (truncated_seen == (ends == 'capped')).all(), f'{pop}: capped games differ'
    assert (env.ended() == np.where(ends == 'capped', 2, 1)).all()
    scores = env.scores()
    fin = ends == 'finished'
    winner = np.argmax(scores, axis=1)
    assert (scores[fin].max(axis=1) == 5).all(), 'a finished game without a clinch'
    assert (rewards[fin, 0] == np.where(winner[fin] == 0, 1, -1)).all()
    assert (rewards[fin, 1] == -rewards[fin, 0]).all()
    assert (rewards[~fin] == 0).all()
    st = env.stats()
    print(f'  {pop}: {n} games, {int(T.sum()):,} steps (longest {maxT}); every d_t, l_t and v_t equal; every played '
          f'action legal in its mask; {sampled:,} legal rows re-encoded as L_t equal; finished {int(fin.sum())}, '
          f'capped {int((~fin).sum())}; max event backlog {st["max_backlog"]}')


def test_h5_mixed_stub():
    replay_population('H5')


def test_h4_fuzz_policy():
    replay_population('H4')


if __name__ == '__main__':
    run_tests(globals())
