"""
belief_data.py: ATHENA P1's belief-head data (ATHENA.md §8.3): population (a)'s stored games replayed through the port
into belief views, and the loader that batches any belief-views directory for training and scoring.

**Belief views** (`athena-p1-belief-views-3`) are one directory of `.npy` arrays, written for (a) by `replay_split`
here and for the bridge records by `scripts/athena/export-belief-views.mjs` (populations (b) and (c), and D2's extra
training views), in the same layout, P1's encoding (API.md §5: the obs row's regime byte, the start-seat rule):

- `streams` uint8 [R, 19]: event rows (API.md §5.3), relative to their seat, stream after stream;
- `stream_off` int64 [G, 6], `stream_len` int32 [G, 6]: each (game, seat)'s stream, in the order the seat received the
  rows (length 0 for a seat with no ask);
- per ask decision, sorted by game: `ask_game` int32, `ask_seat` uint8 (absolute), `ask_pos` int32 (rows of the
  seat's stream received before the decision: the recurrent state folds these; 0 at a game's first decision, under
  the start-seat rule), `ask_obs` uint8 [A, 95] (the obs row, §5.2), `ask_cands` uint8 [A, 54] (the rules facts'
  candidate seats of each card, a six-bit mask relative to the asker: the facts row's `F_CAND`, §5.5),
  `ask_holder` uint8 [A, 54] (each card's true holder relative to the asker, 255 once out of play: the critic buffer,
  §5.4), `ask_facts` uint8 [A, 278] (the whole facts row, §5.5);
- `game_keys.json`: each game's cluster key for the bootstrap; `meta.json`.

**The unit** (§3.8ah's) is every card whose candidate mask has two or more bits: an open set's card the asker cannot
place. The belief head's softmax runs over the card's candidate seats, and its loss and scores are over the units.

**The facts** of (a) are the port's facts buffer (ATHENA.md §8.1, G1a PASS): what `buildKnowledge(view)` computes
under Monet v1.0's knowledge options, the set the (a) scorer's units come from. At every ask `replay_split` checks the
buffer's unknown slots (`F_UNKNOWN`) against the hand counts less the certain cards (what B-M-scaled rescales to), and
that every unit card's true holder is a candidate. The record exporter writes `encodeFactsRow` over `buildKnowledge`.

**The decision features** (`decision_features`, net.ts's `decisionFeatures`, 516) are followed, for P1's heads, by the
facts features (`facts_features`, net.ts's `factsFeatures`, 396): 912 in all (`DEC_F_FACTS`).
"""
import hashlib
import json
from pathlib import Path

import numpy as np

FORMAT = 'athena-p1-belief-views-3'
NONE = 255
EVENT_LEN = 19
OBS_LEN = 95
O_HAND, O_COUNTS, O_PHASE, O_TURN, O_WINDOW, O_OPTION, O_DECLINED, O_SCORE, O_SETS = 0, 54, 60, 61, 62, 63, 64, 65, 67
O_REGIME = 94
SET_FIELDS = 3
N_SETS = 9
# the facts row (API.md §5.5; encode.ts)
F_CAND, F_UNKNOWN, F_SET_CERTAIN, F_SET_LOST, F_RAIL, F_RAIL_ASSIGN, F_NCONS, F_CONS = 0, 54, 60, 69, 78, 79, 85, 86
CONS_FIELDS, MAX_CONS = 3, 64
FACTS_LEN = F_CONS + MAX_CONS * CONS_FIELDS  # 278
N_ASK = 162
EVENT_F = 176
DEC_F = 516
FACTS_F = 6 * N_SETS * 7 + 2 * N_SETS  # 396
DEC_F_FACTS = DEC_F + FACTS_F  # 912
ARRAYS = ('streams', 'stream_off', 'stream_len', 'ask_game', 'ask_seat', 'ask_pos', 'ask_obs', 'ask_cands',
          'ask_holder', 'ask_facts')


def popcount6(m):
    m = np.asarray(m).astype(np.uint8)
    return sum(((m >> b) & 1) for b in range(6)).astype(np.uint8)


class NpyAppender:
    """An .npy file written as it grows (export-belief-views.mjs's NpyWriter): a fixed 128-byte header patched with the
    shape on close, so a split's arrays never have to be held whole in memory."""

    def __init__(self, path, dtype, row_shape=()):
        self.path, self.dtype, self.row_shape, self.rows = Path(path), np.dtype(dtype), tuple(row_shape), 0
        self.f = open(self.path, 'wb')
        self.f.write(b' ' * 128)

    def write(self, arr):
        arr = np.ascontiguousarray(arr, dtype=self.dtype)
        if arr.shape[1:] != self.row_shape:
            raise ValueError(f'{self.path.name}: rows of shape {arr.shape[1:]}, not {self.row_shape}')
        self.f.write(arr.tobytes())
        self.rows += len(arr)

    def close(self):
        shape = (self.rows,) + self.row_shape
        text = f'({shape[0]},)' if len(shape) == 1 else '(' + ', '.join(str(x) for x in shape) + ')'
        d = f"{{'descr': '{self.dtype.str}', 'fortran_order': False, 'shape': {text}, }}".ljust(128 - 10 - 1) + '\n'
        head = b'\x93NUMPY\x01\x00' + (118).to_bytes(2, 'little') + d.encode('latin1')
        if len(head) != 128:
            raise ValueError('an .npy header outgrew 128 bytes')
        self.f.seek(0)
        self.f.write(head)
        self.f.close()


# ------------------------------------------------------------------------------------ population (a): replay ---

def read_parts(parts_dir, max_games=0):
    """A split's stored games (gen-belief-games.py; one folder, or several joined by '+'): lists of seed, start,
    actions (uint16), score, and the game key (seed, start seat, the md5 of the actions)."""
    parts = sorted(p for d in str(parts_dir).split('+') for p in Path(d).glob('part-*.npz'))
    if not parts:
        raise FileNotFoundError(f'no part-*.npz in {parts_dir}')
    games = []
    for p in parts:
        with np.load(p) as npz:  # an NpzFile decompresses a member at every access: read each once
            z = {k: npz[k] for k in ('index', 'seed', 'start', 'score', 'deal', 'rot', 'offsets', 'actions')}
        off, acts = z['offsets'], z['actions']
        for i in range(len(z['index'])):
            a = acts[off[i]:off[i + 1]].copy()
            games.append({'seed': str(z['seed'][i]), 'start': int(z['start'][i]), 'actions': a,
                          'score': z['score'][i].tolist(), 'deal': int(z['deal'][i]), 'rot': int(z['rot'][i]),
                          'key': f'{z["seed"][i]}|{int(z["start"][i])}|{hashlib.md5(a.tobytes()).hexdigest()}'})
            if max_games and len(games) >= max_games:
                return games
    return games


def check_facts(obs, facts, holder):
    """At a batch of asks: the facts row's unknown slots are the hand counts less the certain (singleton) cards, and
    every unit card's true holder is a candidate. Raises on any row that breaks either."""
    cands = facts[:, F_CAND:F_CAND + 54]
    bits = (cands[:, :, None] >> np.arange(6, dtype=np.uint8)) & 1  # (A, 54, 6)
    single = bits.sum(axis=2) == 1
    certain = (bits * single[:, :, None]).sum(axis=1)
    need = obs[:, O_COUNTS:O_COUNTS + 6].astype(np.int64) - certain
    if (need != facts[:, F_UNKNOWN:F_UNKNOWN + 6]).any():
        raise RuntimeError('the facts row\'s unknown slots are not the hand counts less the certain cards')
    unit = popcount6(cands) >= 2
    h = holder.astype(np.int64)
    if (h[unit] == NONE).any() or not bits[unit, h[unit].clip(0, 5)].all():
        raise RuntimeError('a unit card\'s true holder is not among its candidates')
    if (obs[:, O_REGIME] != 0).any():
        raise RuntimeError('a replayed game is not in the home regime')


def replay_split(parts_dir, out_dir, ae, *, batch=2048, threads=4, dedup=True, cluster='deal', max_games=0,
                 lmax=512, log=print):
    """Replay a split's stored games through `ae.BatchEnv` (the home regime, the facts buffer on) and write its belief
    views to `out_dir`, batch by batch.

    Every step applies the stored action of every running game; every observation's event rows go to the observing
    seat's stream; at every ask decision (a legal row with an ask) the asker's obs, facts row and critic row are kept.
    Checks that every game finishes at its stored length with its stored score, and `check_facts` at every ask.

    §8.3's amendment of 2026-09-19: with `dedup` (the default), a game whose game key (seed, start seat, actions)
    repeats one already kept is skipped, so each of geometry B's mirror pairs counts once; the cluster written to
    `game_keys.json` is the deal (its seed; `cluster='game'`: the game key), which is what the (a) bootstrap
    resamples."""
    if cluster not in ('deal', 'game'):
        raise ValueError(f'cluster must be deal or game, not {cluster}')
    if OBS_LEN != getattr(ae, 'OBS_LEN', OBS_LEN) or FACTS_LEN != getattr(ae, 'FACTS_LEN', FACTS_LEN):
        raise RuntimeError('athena_env\'s OBS_LEN / FACTS_LEN are not the views\': load a P1 build')
    games = read_parts(parts_dir, max_games)
    n_all = len(games)
    if dedup:
        seen, kept = set(), []
        for g in games:
            if g['key'] not in seen:
                seen.add(g['key'])
                kept.append(g)
        games = kept
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    W = {'streams': NpyAppender(out / 'streams.npy', 'u1', (EVENT_LEN,)),
         'stream_off': NpyAppender(out / 'stream_off.npy', '<i8', (6,)),
         'stream_len': NpyAppender(out / 'stream_len.npy', '<i4', (6,)),
         'ask_game': NpyAppender(out / 'ask_game.npy', '<i4'),
         'ask_seat': NpyAppender(out / 'ask_seat.npy', 'u1'),
         'ask_pos': NpyAppender(out / 'ask_pos.npy', '<i4'),
         'ask_obs': NpyAppender(out / 'ask_obs.npy', 'u1', (OBS_LEN,)),
         'ask_cands': NpyAppender(out / 'ask_cands.npy', 'u1', (54,)),
         'ask_holder': NpyAppender(out / 'ask_holder.npy', 'u1', (54,)),
         'ask_facts': NpyAppender(out / 'ask_facts.npy', 'u1', (FACTS_LEN,))}
    rows_total = asks = units = 0
    for b0 in range(0, len(games), batch):
        gs = games[b0:b0 + batch]
        n = len(gs)
        env = ae.BatchEnv(n, threads=threads, facts=True)
        env.reset([g['seed'] for g in gs], np.array([g['start'] for g in gs], dtype=np.int64))
        bufs = env.make_buffers(critic=True)
        env.observe(bufs)
        lens = np.array([len(g['actions']) for g in gs])
        T = int(lens.max())
        acts = np.full((n, T), ae.A_DECLINE, dtype=np.int32)
        for i, g in enumerate(gs):
            acts[i, :len(g['actions'])] = g['actions']
        stream = np.zeros((n, 6, lmax, EVENT_LEN), dtype=np.uint8)
        slen = np.zeros((n, 6), dtype=np.int64)
        a_game, a_seat, a_pos, a_obs, a_facts, a_holder = [], [], [], [], [], []
        idx = np.arange(n)
        for t in range(T):
            active = t < lens
            seat = bufs['seat'].astype(np.int64)
            ne = bufs['n_events'].astype(np.int64)
            ne = np.where(active, ne, 0)
            for k in range(int(ne.max()) if ne.size else 0):
                m = ne > k
                gi, si = idx[m], seat[m]
                pos = slen[gi, si] + k
                if pos.max() >= lmax:
                    raise RuntimeError(f'a stream passed {lmax} rows')
                stream[gi, si, pos] = bufs['events'][m, k]
            slen[idx, seat] += ne
            ask = active & bufs['legal'][:, :N_ASK].any(axis=1)
            if ask.any():
                rows = np.flatnonzero(ask)
                if (acts[rows, t] >= N_ASK).any():
                    raise RuntimeError(f'step {t}: a stored action at an ask decision is not an ask')
                obs = bufs['obs'][rows].copy()
                holder = bufs['critic'][rows].copy()
                fr = bufs['facts'][rows].copy()
                check_facts(obs, fr, holder)
                a_game.append(rows + b0)
                a_seat.append(seat[rows].astype(np.uint8))
                a_pos.append(slen[rows, seat[rows]].astype(np.int32))
                a_obs.append(obs)
                a_facts.append(fr)
                a_holder.append(holder)
            env.step(np.ascontiguousarray(acts[:, t]), bufs)
        steps, ended, scores = env.steps(), env.ended(), env.scores()
        for i, g in enumerate(gs):
            if int(steps[i]) != len(g['actions']) or int(ended[i]) != 1 or scores[i].tolist() != g['score']:
                raise RuntimeError(f'{g["seed"]} start {g["start"]}: the replay ends at {steps[i]} steps, end {ended[i]}, '
                                   f'score {scores[i].tolist()}; stored {len(g["actions"])} and {g["score"]}')
        # the streams, (game, seat) in order
        off = np.zeros((n, 6), dtype=np.int64)
        for i in range(n):
            for s in range(6):
                off[i, s] = rows_total
                L = int(slen[i, s])
                W['streams'].write(stream[i, s, :L])
                rows_total += L
        W['stream_off'].write(off)
        W['stream_len'].write(slen.astype(np.int32))
        ag = np.concatenate(a_game).astype(np.int32)
        order = np.argsort(ag, kind='stable')  # by game, each game's asks in step order
        facts_b = np.concatenate(a_facts)[order]
        for name, arr in (('ask_game', ag[order]), ('ask_seat', np.concatenate(a_seat)[order]),
                          ('ask_pos', np.concatenate(a_pos)[order]), ('ask_obs', np.concatenate(a_obs)[order]),
                          ('ask_cands', facts_b[:, F_CAND:F_CAND + 54]), ('ask_holder', np.concatenate(a_holder)[order]),
                          ('ask_facts', facts_b)):
            W[name].write(arr)
        asks += len(ag)
        units += int((popcount6(facts_b[:, F_CAND:F_CAND + 54]) >= 2).sum())
        log(f'  replayed {b0 + n} of {len(games)} games: {asks} asks, {rows_total} rows')
    for w in W.values():
        w.close()
    (out / 'game_keys.json').write_text(json.dumps([g['seed'] if cluster == 'deal' else g['key'] for g in games]))
    meta = {'format': FORMAT, 'source': 'port-replay', 'parts': str(parts_dir), 'games': len(games),
            'games_in_split': n_all, 'dedup': dedup, 'deals': len({g['seed'] for g in games}), 'cluster': cluster,
            'facts': 'port', 'regime': 'home', 'asks': asks, 'units': units, 'rows': rows_total,
            'athena_env': str(Path(ae.__file__).resolve())}
    (out / 'meta.json').write_text(json.dumps(meta, indent=1))
    return meta


# ---------------------------------------------------------------------------------------------- the features ---

def event_slots(rows):
    """net.ts's `eventSlots` over rows (N, 19) uint8, as its fold reads them: (N, 21) int64 (see the end)."""
    rows = np.asarray(rows)
    t = rows[:, 0].astype(np.int64)
    if (t > 5).any():
        raise ValueError('an event type is out of range')

    def slot(v, n, what):
        v = v.astype(np.int64)
        bad = (v != NONE) & (v >= n - 1)
        if bad.any():
            raise ValueError(f'event byte {what} is out of range')
        return np.where(v == NONE, n - 1, v)

    cols = [t, 6 + slot(rows[:, 1], 7, 'actor'), 13 + slot(rows[:, 2], 7, 'target'), 20 + slot(rows[:, 3], 55, 'card'),
            75 + slot(rows[:, 4], 3, 'hit'), 78 + slot(rows[:, 5], 10, 'set'), 88 + slot(rows[:, 6], 4, 'result')]
    cols += [92 + 7 * j + slot(rows[:, 7 + j], 7, 'assign') for j in range(6)]
    cols += [134 + 7 * j + slot(rows[:, 13 + j], 7, 'holder') for j in range(6)]
    # net.ts's fold adds 21 embedding columns per event, idx[0..20], but eventSlots writes only the 19 above; the
    # last two entries of its scratch are never written and stay 0, so every event also adds column 0 twice. The
    # forward is G0d's pinned contract, so the model reproduces it: two slot-0 entries close every row.
    zero = np.zeros(len(rows), dtype=np.int64)
    return np.stack(cols + [zero, zero], axis=1)


def decision_features(obs, cands):
    """net.ts's `decisionFeatures` (DEC_F = 516), vectorised: obs rows (A, 95) and six-bit masks (A, 54) -> float32."""
    obs = np.asarray(obs)
    A = len(obs)
    out = np.zeros((A, DEC_F), dtype=np.float32)
    out[:, 0:54] = obs[:, O_HAND:O_HAND + 54]
    out[:, 54:60] = obs[:, O_COUNTS:O_COUNTS + 6] / 9.0
    ar = np.arange(A)

    def one(base, v, n):
        v = v.astype(np.int64)
        ok = (v != NONE) & (v < n)
        out[ar[ok], base + v[ok]] = 1

    one(60, obs[:, O_PHASE], 3)
    one(63, obs[:, O_TURN], 6)
    out[:, 69] = obs[:, O_WINDOW]
    one(70, obs[:, O_OPTION], 6)
    one(76, obs[:, O_DECLINED], 6)
    out[:, 82] = obs[:, O_SCORE] / 9.0
    out[:, 83] = obs[:, O_SCORE + 1] / 9.0
    for b in range(9):
        o = O_SETS + SET_FIELDS * b
        base = 84 + 12 * b
        one(base, obs[:, o], 3)
        one(base + 3, obs[:, o + 1], 6)
        one(base + 9, obs[:, o + 2], 3)
    bits = (cands[:, :, None] >> np.arange(6, dtype=np.uint8)) & 1  # (A, 54, 6)
    out[:, 192:] = bits.reshape(A, 324)
    return out


def facts_features(facts):
    """net.ts's `factsFeatures` (FACTS_F = 396), vectorised: facts rows (A, 278) -> float32 (A, 396).

    - At 7 (9r + b), for relative seat r and set b: 1 if the facts hold a set-membership constraint on (r, b), then the
      six bits (set card order) of the tightest one: the smallest popcount, a tie to the smaller mask. All 0 without a
      constraint, and for a resolved set (F_SET_CERTAIN NONE).
    - At 378 + 2b: F_SET_CERTAIN / 6 and F_SET_LOST, both 0 once the set is resolved."""
    facts = np.asarray(facts)
    A = len(facts)
    out = np.zeros((A, FACTS_F), dtype=np.float32)
    n = facts[:, F_NCONS].astype(np.int64)
    if (n > MAX_CONS).any():
        raise ValueError(f'a facts row holds more than MAX_CONS = {MAX_CONS} constraints')
    cons = facts[:, F_CONS:F_CONS + MAX_CONS * CONS_FIELDS].reshape(A, MAX_CONS, CONS_FIELDS).astype(np.int64)
    r, b, m = cons[..., 0], cons[..., 1], cons[..., 2]
    live = np.arange(MAX_CONS)[None, :] < n[:, None]
    if ((r >= 6) | (b >= N_SETS) | (m == 0) | (m >= 64))[live].any():
        raise ValueError('a constraint is out of range')
    certain = facts[:, F_SET_CERTAIN:F_SET_CERTAIN + N_SETS]
    rows = np.repeat(np.arange(A)[:, None], MAX_CONS, axis=1)
    live &= certain[rows, np.where(live, b, 0)] != NONE
    key = popcount6(m).astype(np.int64) * 64 + m  # smaller is tighter: popcount first, then the mask
    best = np.full((A, 6 * N_SETS), 1 << 20, dtype=np.int64)
    np.minimum.at(best, (rows[live], (N_SETS * r + b)[live]), key[live])
    has = best < (1 << 20)
    mask = np.where(has, best % 64, 0)
    feats = np.zeros((A, 6 * N_SETS, 7), dtype=np.float32)
    feats[..., 0] = has
    feats[..., 1:] = (mask[..., None] >> np.arange(6)) & 1
    out[:, :7 * 6 * N_SETS] = feats.reshape(A, -1)
    lost = facts[:, F_SET_LOST:F_SET_LOST + N_SETS]
    open_ = certain != NONE
    out[:, 7 * 6 * N_SETS::2] = np.where(open_, certain.astype(np.float32) / np.float32(6), 0)
    out[:, 7 * 6 * N_SETS + 1::2] = np.where(open_ & (lost != NONE), lost, 0)
    return out


# ----------------------------------------------------------------------------------------------- the loader ---

class BeliefViews:
    """One or more belief-views directories, concatenated, memory-mapped. `dec_f` is the decision-feature width the
    network reads: DEC_F_FACTS (P1's heads: `decision_features` then `facts_features`) or DEC_F."""

    def __init__(self, dirs, dec_f=DEC_F_FACTS):
        if isinstance(dirs, (str, Path)):
            dirs = [dirs]
        if dec_f not in (DEC_F, DEC_F_FACTS):
            raise ValueError(f'dec_f {dec_f}: {DEC_F} or {DEC_F_FACTS}')
        self.dirs = [Path(d) for d in dirs]
        self.dec_f = dec_f
        self.parts = []
        self.keys = []
        self.metas = []
        g0 = 0
        for d in self.dirs:
            meta = json.loads((d / 'meta.json').read_text())
            if meta.get('format') != FORMAT:
                raise ValueError(f'{d}: not {FORMAT}')
            arr = {k: np.load(d / f'{k}.npy', mmap_mode='r') for k in ARRAYS}
            keys = json.loads((d / 'game_keys.json').read_text())
            G = len(arr['stream_off'])
            if len(keys) != G:
                raise ValueError(f'{d}: {len(keys)} keys for {G} games')
            ag = np.asarray(arr['ask_game'])
            if len(ag) and (np.diff(ag) < 0).any():
                raise ValueError(f'{d}: asks are not sorted by game')
            starts = np.searchsorted(ag, np.arange(G + 1))
            self.parts.append({'dir': d, 'arr': arr, 'g0': g0, 'G': G, 'ask_start': starts, 'meta': meta})
            self.keys += keys
            self.metas.append(meta)
            g0 += G
        self.G = g0
        self.facts_in = {m.get('facts', 'buildKnowledge') for m in self.metas}

    def __len__(self):
        return self.G

    def _where(self, g):
        for p in self.parts:
            if p['g0'] <= g < p['g0'] + p['G']:
                return p, g - p['g0']
        raise IndexError(g)

    def batch(self, games):
        """The tensors-to-be of a batch of games (numpy): per (game, seat) sequence with an ask, its event slots
        (S, L, 21) and length; per ask, its sequence and position, decision features (A, dec_f), candidate mask
        (A, 54, 6), unit mask (A, 54), true holder (A, 54, relative; 0 where not a unit), seat, and cluster index."""
        seq_rows, seq_len = [], []
        ask_seq, ask_pos, obs_l, cand_l, hold_l, fact_l, seat_l, clus_l = [], [], [], [], [], [], [], []
        for g in games:
            p, lg = self._where(int(g))
            a = p['arr']
            lo, hi = p['ask_start'][lg], p['ask_start'][lg + 1]
            if hi == lo:
                continue
            seats = np.asarray(a['ask_seat'][lo:hi]).astype(np.int64)
            pos = np.asarray(a['ask_pos'][lo:hi]).astype(np.int64)
            seq_of = {}
            for s in np.unique(seats):
                need = int(pos[seats == s].max())
                off = int(a['stream_off'][lg, s])
                if need > int(a['stream_len'][lg, s]):
                    raise ValueError(f'game {g}: an ask folds {need} rows of a {a["stream_len"][lg, s]}-row stream')
                seq_of[int(s)] = len(seq_rows)
                seq_rows.append(np.asarray(a['streams'][off:off + need]))
                seq_len.append(need)
            ask_seq.append(np.array([seq_of[int(s)] for s in seats]))
            ask_pos.append(pos)
            obs_l.append(np.asarray(a['ask_obs'][lo:hi]))
            cand_l.append(np.asarray(a['ask_cands'][lo:hi]))
            hold_l.append(np.asarray(a['ask_holder'][lo:hi]))
            if self.dec_f == DEC_F_FACTS:
                fact_l.append(np.asarray(a['ask_facts'][lo:hi]))
            seat_l.append(seats)
            clus_l.append(np.full(hi - lo, int(g)))
        S = len(seq_rows)
        L = max(1, max(seq_len) if seq_len else 1)  # a seat whose only ask is its game's first folds no row
        slots = np.zeros((S, L, 21), dtype=np.int64)
        if S:
            lens = np.array(seq_len, dtype=np.int64)
            flat = event_slots(np.concatenate(seq_rows))  # one call for the batch
            seq_i = np.repeat(np.arange(S), lens)
            pos_i = np.arange(len(flat)) - np.repeat(np.cumsum(lens) - lens, lens)
            slots[seq_i, pos_i] = flat
        obs = np.concatenate(obs_l)
        cands = np.concatenate(cand_l)
        unit = popcount6(cands) >= 2
        holder = np.concatenate(hold_l).astype(np.int64)
        if (holder[unit] == NONE).any():
            raise ValueError('a unit card has no holder')
        mask = ((cands[:, :, None] >> np.arange(6, dtype=np.uint8)) & 1).astype(bool)
        if not mask[unit, holder[unit].clip(0, 5)].all():
            raise ValueError('a unit card\'s true holder is not among its candidates')
        dec = decision_features(obs, cands)
        if self.dec_f == DEC_F_FACTS:
            dec = np.concatenate([dec, facts_features(np.concatenate(fact_l))], axis=1)
        return {
            'slots': slots, 'seq_len': np.array(seq_len, dtype=np.int64),
            'ask_seq': np.concatenate(ask_seq).astype(np.int64), 'ask_pos': np.concatenate(ask_pos),
            'dec': dec, 'mask': mask, 'unit': unit,
            'holder': np.where(unit, holder, 0), 'seat': np.concatenate(seat_l), 'cluster': np.concatenate(clus_l),
        }
