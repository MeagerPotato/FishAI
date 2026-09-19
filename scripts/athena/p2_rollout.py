"""
p2_rollout.py: ATHENA P2's game driver (ATHENA.md §9.3, §9.5) over `athena_env.BatchEnv`.

One `Rollout` keeps `in_flight` games going at once (§9.4: 8,192), acts for every ATHENA seat with `p2_model.P2Net`,
and writes the trajectories `p2_train.py` consumes. What it implements, clause by clause:

- **Games in flight.** One `BatchEnv` with auto-reset (API.md §3.2): a game that ends is replaced in the same `step`,
  its seed `<prefix><k>` and its start seat `k % 6`, k counting up in slot order. Nothing waits for a batch to drain.
- **Regimes** (§9.5, §8.2). `auto_reset_regime='draw'`: game k is at the bridge when `rngFromSeed(seed + ':regime')()`
  is below 1/2. The first batch's regimes are drawn here by the same rule -- `rng_from_seed` is the reference's xmur3
  and mulberry32, ported -- and `verify_auto_reset` checks the port agrees on the games it deals itself.
- **Action masking** (§9.3 rail 3). Every draw is masked by the legal row, so an action the row forbids is never
  sampled (`p2_model.sample_actions`).
- **The rules-certain declare rail** (§9.3 rail 1). At a window offer whose facts row names a rail
  (`F_RAIL` / `F_RAIL_ASSIGN`; G1a check 3 pinned them to `lib/athena/policy.ts`'s `railPlan`), the rail's set and
  assignment are played **without a forward pass**, and the decision is not the policy's: it is not stored, and it
  trains nothing.
- **The opponent mix** (§9.5). Each new game draws its opponent from its own seed: self-play 93%, Monet v1.0 5%,
  Monet v0.33 2%. In an opponent game ATHENA holds one team (drawn from the seed too) and only its seats' decisions
  are stored. Monet's seats are played by `scripts/athena/opponent-service.mjs`, the P0 service, which keeps the
  reference's `GameState` of every such game and answers `decide(...)` with the lab's seeding.
- **Faults.** Every reply of the service is checked for a refused apply, a refused decision, a finished/unfinished
  disagreement and an acting-seat disagreement -- the cheap half of the harness's divergence check, which needs no
  `track_digests` and so costs the other 93% of games nothing. `digest_check` turns the digest comparison on for a
  smoke or a run's first hours. Any divergence raises `Divergence` (§9.8 stop rule 1: "Stop, and report").

**The reveal at the bridge.** In a **bridge-regime** game the host publishes only the reduced reveal of a wrong
declare, and the port does. A service whose reference publishes every holder would show Monet more than the bridge
host would give it, which would train ATHENA against an opponent that cannot exist. So this driver **asks for the
reduced reveal and will not train without it**: every `open` spec carries `reveal` (`reduced` for a bridge-regime
game, `full` for a home one), and `check_service_reveal` refuses to start unless the service's `hello` says it
supports the reduced reveal (`REVEAL_HELLO_KEYS`). The message names `--bridge-reveal full`, the escape hatch that
takes the old behaviour deliberately; it is off by default.

With the reduced reveal in force the reference and the port agree on the bridge too, so `digest_check='full'`
compares `l` and `v` in every game. Under `--bridge-reveal full` it compares them in home-regime games only, because
there the `v` digest differs by construction.

**The trajectory store** is flat and append-only. An *episode* is one (game, ATHENA seat): its decisions in time order
and the seat's event rows. A decision holds the raw bytes the network read (the obs row, the facts row, the legal row
and the critic row), the action as the policy drew it, the behaviour log-probability, and the two value estimates taken
at act time. Games that have not finished when an iteration is cut keep their rows: §9.4's "a game that began under
earlier weights is kept" is exactly this, and PPO's ratio against the stored log-probability corrects for it.
"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import home_harness as hh  # noqa: E402  (the P0 opponent-service client)
import p2_model as pm  # noqa: E402

OPP_SELF, OPP_V10, OPP_V033 = 0, 1, 2
OPP_VERSION = {OPP_V10: 'v1.0', OPP_V033: 'v0.33'}
# §9.5's mix, named here and nowhere else.
OPP_SHARES = {OPP_SELF: 0.93, OPP_V10: 0.05, OPP_V033: 0.02}
DECISIONS_PER_GAME = 654  # §3.1's re-cost, measured on P1's test games

# The reveal a game's `open` spec asks for: the bridge host's reduced reveal, or the full one a home game gives.
REVEAL_REDUCED, REVEAL_FULL = 'reduced', 'full'
# The keys a service's `hello` may use to say it supports the reduced reveal. The service is built on another branch
# (`claude/athena-p2-reveal`), so this reads every shape the reply might take rather than pinning one.
REVEAL_HELLO_KEYS = ('reveal', 'reveals', 'reducedReveal', 'reduced_reveal', 'capabilities', 'features')

M32 = 0xFFFFFFFF


class Divergence(RuntimeError):
    """The port and the reference disagreed (§9.8 stop rule 1)."""


# ------------------------------------------------------------------------- the reference's PRNG, ported ---

def _imul(a, b):
    return ((a & M32) * (b & M32)) & M32


def hash_seed(s):
    """`lib/engine/rng.ts`'s xmur3. Seeds here are ASCII, so `ord` is `charCodeAt`."""
    h = (1779033703 ^ len(s)) & M32
    for ch in s:
        h = _imul(h ^ ord(ch), 3432918353)
        h = ((h << 13) | (h >> 19)) & M32
    st = [h]

    def nxt():
        x = _imul(st[0] ^ (st[0] >> 16), 2246822507)
        x = _imul(x ^ (x >> 13), 3266489909)
        x = (x ^ (x >> 16)) & M32
        st[0] = x
        return x
    return nxt


def mulberry32(a):
    st = [a & M32]

    def nxt():
        s = (st[0] + 0x6D2B79F5) & M32
        st[0] = s
        t = _imul(s ^ (s >> 15), s | 1)
        t = (t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & M32)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return nxt


def rng_from_seed(seed):
    return mulberry32(hash_seed(seed)())


def regime_of(seed):
    """API.md §3.5: game k is at the bridge when `rngFromSeed(seed + ':regime')()` is below 1/2."""
    return 1 if rng_from_seed(f'{seed}:regime')() < 0.5 else 0


def opponent_of(seed, shares=OPP_SHARES):
    """§9.5's draw, from the game's own seed, so a run's mix is reproducible from its prefix alone."""
    u = rng_from_seed(f'{seed}:p2-opponent')()
    acc = 0.0
    for k in (OPP_SELF, OPP_V10, OPP_V033):
        acc += shares[k]
        if u < acc:
            return k
    return OPP_SELF


def athena_team_of(seed):
    """Which team ATHENA holds in an opponent game (§9.5: "ATHENA holds one team")."""
    return 1 if rng_from_seed(f'{seed}:p2-team')() < 0.5 else 0


# ------------------------------------------------------------------------------------- the opponent service ---

def says_reduced_reveal(hello):
    """Does an opponent service's `hello` reply acknowledge the reduced reveal?

    True for any of: a `reveal`/`reveals` list (or dict, or comma-joined string) naming `reduced`; a truthy
    `reducedReveal` / `reduced_reveal`; a `capabilities` or `features` entry naming a reveal. Anything else -- an
    older service, which answers `{protocol, workers, node, pid}` and nothing more -- is a no."""
    if not isinstance(hello, dict):
        return False
    for k in REVEAL_HELLO_KEYS:
        if k not in hello:
            continue
        v = hello[k]
        if v is True:
            return True
        if isinstance(v, str):
            parts = [p.strip().lower() for p in v.replace(',', ' ').split()]
            if any(REVEAL_REDUCED in p for p in parts):
                return True
        elif isinstance(v, dict):
            if v.get(REVEAL_REDUCED) or says_reduced_reveal(v):
                return True
        elif isinstance(v, (list, tuple)):
            if any(isinstance(x, str) and REVEAL_REDUCED in x.strip().lower() for x in v):
                return True
    return False


def check_service_reveal(service, bridge_reveal):
    """§9.5, the bridge regime: stop before a game is played unless the service serves Monet the reduced reveal.

    Raises `RuntimeError` naming `--bridge-reveal full`, so a run never trains against a Monet that sees every holder
    of a wrong declare without someone having asked for that."""
    if bridge_reveal not in (REVEAL_REDUCED, REVEAL_FULL):
        raise ValueError(f'bridge_reveal {bridge_reveal!r}: {REVEAL_REDUCED} or {REVEAL_FULL}')
    hello = dict(getattr(service, 'hello', None) or {})
    if bridge_reveal == REVEAL_FULL:
        return hello
    if not says_reduced_reveal(hello):
        keys = ', '.join(sorted(k for k in hello if k != 'id'))
        raise RuntimeError(
            'the opponent service does not acknowledge the reduced reveal, so in a bridge-regime game it would serve '
            'Monet every holder of a wrong declare -- more than the bridge host gives it -- and ATHENA would train '
            f'against an opponent that cannot exist. Its hello answered: {{{keys}}}, none of which names '
            f'"{REVEAL_REDUCED}" (looked in {", ".join(REVEAL_HELLO_KEYS)}). Use a service that supports it '
            '(scripts/athena/opponent-service.mjs with the reduced reveal of scripts/athena/opponent-core.ts), or '
            'pass --bridge-reveal full to take the full-reveal Monet deliberately.')
    return hello


class AsyncOpponentService(hh.OpponentService):
    """`home_harness.OpponentService` with the request split in two, so the GPU can act while Node decides. The
    inherited `request` (open, close, stats, quit) must not be called while a `send` is outstanding."""

    def __init__(self, *a, **kw):
        self._outstanding = None
        super().__init__(*a, **kw)

    def send(self, msg):
        if self._outstanding is not None:
            raise hh.ServiceError('a request is already outstanding')
        self._id += 1
        msg = dict(msg, id=self._id)
        self.proc.stdin.write((json.dumps(msg, separators=(',', ':')) + '\n').encode())
        self.proc.stdin.flush()
        self._outstanding = (msg.get('op'), time.perf_counter())

    def recv(self):
        if self._outstanding is None:
            raise hh.ServiceError('no request is outstanding')
        op, t = self._outstanding
        self._outstanding = None
        line = self.proc.stdout.readline()
        self.wall[op] = self.wall.get(op, 0.0) + time.perf_counter() - t
        self.calls[op] = self.calls.get(op, 0) + 1
        if not line:
            raise hh.ServiceError(f'the opponent service closed its output (exit {self.proc.poll()})')
        reply = json.loads(line)
        if reply.get('id') != self._id:
            raise hh.ServiceError(f'reply {reply.get("id")} to request {self._id}')
        if not reply.get('ok'):
            raise hh.ServiceError(reply.get('error', 'the opponent service failed'))
        return reply


# -------------------------------------------------------------------------------------- the trajectory store ---

class TrajectoryStore:
    """A flat, append-only table of decisions with an episode table over it.

    The arrays are preallocated once. The table must hold every in-flight game's decisions so far plus the iteration's
    finished ones; `suggest_caps` sizes it. `take_finished()` hands the finished episodes to the trainer and `compact()`
    then keeps the rest and renumbers the episodes -- call them in that order, every iteration."""

    FIELDS = (('obs', np.uint8, pm.OBS_LEN), ('facts', np.uint8, pm.FACTS_LEN), ('legal', np.uint8, pm.LEGAL_LEN),
              ('critic', np.uint8, pm.CRITIC_LEN), ('digits', np.uint8, 6))
    SCALARS = (('ep', np.int32), ('pos', np.int32), ('kind', np.uint8), ('idx', np.int16), ('seat', np.uint8),
               ('logp', np.float32), ('v_critic', np.float32), ('v_actor', np.float32))
    EP_ARRAYS = ('ep_game', 'ep_seat', 'ep_done', 'ep_reward', 'ep_setdiff', 'ep_opp', 'ep_regime',
                 'ep_stream_off', 'ep_stream_len')

    def __init__(self, decision_cap, stream_cap, episode_cap):
        self.cap, self.n = int(decision_cap), 0
        for name, dt, w in self.FIELDS:
            setattr(self, name, np.zeros((self.cap, w), dtype=dt))
        for name, dt in self.SCALARS:
            setattr(self, name, np.zeros(self.cap, dtype=dt))
        self.stream_cap, self.n_rows = int(stream_cap), 0
        self.streams = np.zeros((self.stream_cap, pm.EVENT_LEN), dtype=np.uint8)
        self.n_ep = 0
        self._alloc_episodes(int(episode_cap))

    def _alloc_episodes(self, cap):
        self.ep_cap = int(cap)
        self.ep_game = np.zeros(cap, dtype=np.int64)
        self.ep_seat = np.zeros(cap, dtype=np.uint8)
        self.ep_done = np.zeros(cap, dtype=bool)
        self.ep_reward = np.zeros(cap, dtype=np.float32)
        self.ep_setdiff = np.zeros(cap, dtype=np.float32)
        self.ep_opp = np.zeros(cap, dtype=np.uint8)
        self.ep_regime = np.zeros(cap, dtype=np.uint8)
        self.ep_stream_off = np.zeros(cap, dtype=np.int64)
        self.ep_stream_len = np.zeros(cap, dtype=np.int32)

    @staticmethod
    def suggest_caps(in_flight, iteration_games, per_game=DECISIONS_PER_GAME, rows_per_game=140):
        """Decision rows, stream rows and episodes. An in-flight game is about half played, and all of its decisions
        so far are in the table; the iteration's finished games add their own."""
        dec = int(in_flight * per_game * 0.6 + iteration_games * per_game * 1.1) + 65536
        rows = int(iteration_games * 6 * rows_per_game * 1.5) + 65536
        eps = int((in_flight + iteration_games) * 6 * 1.2) + 4096
        return dec, rows, eps

    def bytes_used(self):
        b = sum(getattr(self, n).nbytes for n, _, _ in self.FIELDS)
        b += sum(getattr(self, n).nbytes for n, _ in self.SCALARS)
        return b + self.streams.nbytes + sum(getattr(self, n).nbytes for n in self.EP_ARRAYS)

    def new_episode(self, game, seat, opp, regime):
        if self.n_ep >= self.ep_cap:
            self._grow_episodes()
        e = self.n_ep
        self.n_ep += 1
        self.ep_game[e], self.ep_seat[e], self.ep_opp[e], self.ep_regime[e] = game, seat, opp, regime
        self.ep_done[e] = False
        self.ep_reward[e] = self.ep_setdiff[e] = 0.0
        self.ep_stream_off[e], self.ep_stream_len[e] = 0, 0
        return e

    def _grow_episodes(self):
        old = {k: getattr(self, k).copy() for k in self.EP_ARRAYS}
        self._alloc_episodes(self.ep_cap * 2)
        for k, v in old.items():
            getattr(self, k)[:len(v)] = v

    def append(self, bufs, rows, ep, pos, seat, kind, idx, digits, logp, v_critic, v_actor):
        m = len(rows)
        if self.n + m > self.cap:
            raise RuntimeError(f'the decision table is full ({self.cap} rows): raise --decision-cap')
        s = slice(self.n, self.n + m)
        self.obs[s] = bufs['obs'][rows]
        self.facts[s] = bufs['facts'][rows]
        self.legal[s] = bufs['legal'][rows]
        self.critic[s] = bufs['critic'][rows]
        self.digits[s] = digits
        self.ep[s], self.pos[s], self.seat[s], self.kind[s], self.idx[s] = ep, pos, seat, kind, idx
        self.logp[s], self.v_critic[s], self.v_actor[s] = logp, v_critic, v_actor
        self.n += m

    def finish_episode(self, e, rows, reward, setdiff):
        """Close episode `e` with its seat's event rows (`rows`, (L, 19) uint8) and the game's outcome."""
        L = len(rows)
        if self.n_rows + L > self.stream_cap:
            raise RuntimeError(f'the stream table is full ({self.stream_cap} rows): raise --stream-table-cap')
        self.streams[self.n_rows:self.n_rows + L] = rows
        self.ep_stream_off[e], self.ep_stream_len[e] = self.n_rows, L
        self.n_rows += L
        self.ep_reward[e], self.ep_setdiff[e], self.ep_done[e] = reward, setdiff, True

    # -- handing an iteration to the trainer --

    def take_finished(self):
        """Every finished episode's decisions, grouped by episode and in time order, as one dict of arrays."""
        n, ne = self.n, self.n_ep
        done = self.ep_done[:ne]
        ep = self.ep[:n]
        kept = np.flatnonzero(done[ep])
        order = kept[np.argsort(ep[kept], kind='stable')]
        eps = np.flatnonzero(done)
        counts = np.bincount(ep[order], minlength=ne)[eps].astype(np.int64)
        dec_off = (np.cumsum(counts) - counts).astype(np.int64)
        s_len = self.ep_stream_len[eps].astype(np.int64)
        s_off = (np.cumsum(s_len) - s_len).astype(np.int64)
        streams = np.zeros((int(s_len.sum()), pm.EVENT_LEN), dtype=np.uint8)
        for j, e in enumerate(eps):
            o, L = int(self.ep_stream_off[e]), int(s_len[j])
            streams[s_off[j]:s_off[j] + L] = self.streams[o:o + L]
        out = {'streams': streams, 'ep_stream_off': s_off, 'ep_stream_len': s_len.astype(np.int32),
               'ep_game': self.ep_game[eps].copy(), 'ep_seat': self.ep_seat[eps].copy(),
               'ep_reward': self.ep_reward[eps].copy(), 'ep_setdiff': self.ep_setdiff[eps].copy(),
               'ep_opp': self.ep_opp[eps].copy(), 'ep_regime': self.ep_regime[eps].copy(),
               'ep_dec_off': dec_off, 'ep_dec_len': counts.astype(np.int32)}
        for name, _, _ in self.FIELDS:
            out[name] = getattr(self, name)[order]
        for name, _ in self.SCALARS:
            if name != 'ep':
                out[name] = getattr(self, name)[order]
        out['ep_index'] = np.repeat(np.arange(len(eps), dtype=np.int32), counts)
        return out

    def compact(self):
        """Drop every finished episode's rows and renumber the survivors, so a run's tables never grow. Returns the
        old-episode-id -> new-id map (-1 for a dropped one); the driver must apply it to its own `ep_of`."""
        n, ne = self.n, self.n_ep
        alive = np.flatnonzero(~self.ep_done[:ne])
        remap = np.full(ne, -1, dtype=np.int64)
        remap[alive] = np.arange(len(alive))
        keep = np.flatnonzero(remap[self.ep[:n]] >= 0)
        for name, _, _ in self.FIELDS:
            a = getattr(self, name)
            a[:len(keep)] = a[keep]
        for name, _ in self.SCALARS:
            a = getattr(self, name)
            a[:len(keep)] = a[keep]
        self.n = len(keep)
        self.ep[:self.n] = remap[self.ep[:self.n]]
        for k in self.EP_ARRAYS:
            a = getattr(self, k)
            a[:len(alive)] = a[alive]
        self.n_ep = len(alive)
        self.n_rows = 0  # only finished episodes hold stream rows, and they have just been taken
        return remap


# --------------------------------------------------------------------------------------------- the driver ---

class Rollout:
    """The acting loop. `run(target)` plays until `target` games have finished; `store.take_finished()` then holds
    the trajectories."""

    def __init__(self, ae, model, device, *, prefix, in_flight=8192, threads=4, service=None, store=None,
                 shares=OPP_SHARES, stream_cap=160, gen=None, amp=True, digest_check='off', first_game=0,
                 iteration_games=2048, decision_cap=None, stream_table_cap=None, episode_cap=None,
                 verify_first_reset=True, bridge_reveal=REVEAL_REDUCED):
        if service is None and (shares[OPP_V10] + shares[OPP_V033]) > 0:
            raise ValueError('the Monet share of §9.5 needs the opponent service')
        if digest_check not in ('off', 'd', 'full'):
            raise ValueError("digest_check: off, d or full")
        # the reveal handshake, before a game is dealt: it only matters where Monet plays at all
        self.bridge_reveal = bridge_reveal
        self.service_hello = check_service_reveal(service, bridge_reveal) if service is not None else None
        if service is not None and bridge_reveal == REVEAL_FULL:
            print('!!! --bridge-reveal full: at the bridge the service serves Monet every holder of a wrong declare, '
                  'which the bridge host would not (§9.5)', flush=True)
        self.ae, self.model, self.device, self.prefix = ae, model, device, prefix
        self.n, self.threads, self.service, self.shares = int(in_flight), threads, service, dict(shares)
        self.gen, self.amp, self.digest_check = gen, amp, digest_check
        d_cap, r_cap, e_cap = TrajectoryStore.suggest_caps(self.n, iteration_games)
        self.store = store or TrajectoryStore(decision_cap or d_cap, stream_table_cap or r_cap, episode_cap or e_cap)
        self.stream_cap = int(stream_cap)
        self.srows = np.zeros((self.n, 6, self.stream_cap, pm.EVENT_LEN), dtype=np.uint8)
        self.slen = np.zeros((self.n, 6), dtype=np.int64)
        self.h = torch.zeros(self.n * 6, model.d, device=device, dtype=torch.float32)
        self._dec = torch.zeros(self.n, pm.DEC_F_FACTS, device=device, dtype=torch.float32)
        self.ep_of = np.full((self.n, 6), -1, dtype=np.int64)
        self.mine = np.zeros((self.n, 6), dtype=bool)
        self.score = np.zeros((self.n, 2), dtype=np.int64)
        self.g_seed = [''] * self.n
        self.g_opp = np.zeros(self.n, dtype=np.uint8)
        self.g_team = np.full(self.n, -1, dtype=np.int8)
        self.g_regime = np.zeros(self.n, dtype=np.uint8)
        self.g_svc = np.full(self.n, -1, dtype=np.int64)
        self.pend_seat = np.full(self.n, -1, dtype=np.int64)
        self.pend_code = np.zeros(self.n, dtype=np.int64)
        self.next_game_id = 0
        self.first_game = int(first_game)
        self.start = self.first_game + self.n
        self.env = ae.BatchEnv(self.n, threads=threads, auto_reset=prefix, auto_reset_start=self.start,
                               facts=True, auto_reset_regime='draw', track_digests=digest_check != 'off')
        self.bufs = None
        self.counters = {k: 0 for k in ('steps', 'batch_steps', 'games', 'capped', 'decisions', 'rail', 'monet',
                                        'ask', 'window', 'pass', 'declares', 'declines', 'stream_grows',
                                        'service_faults', 'd_compared', 'lv_compared', 'monet_games', 'opp_games',
                                        'score_fixups', 'bridge_games')}
        self.divergences = []
        self.verify_first_reset = bool(verify_first_reset)
        self.reset_check = None
        self.time = {'env': 0.0, 'fold': 0.0, 'policy': 0.0, 'service': 0.0, 'store': 0.0, 'ends': 0.0}

    # -- setup --

    def reset(self):
        n = self.n
        ks = np.arange(self.first_game, self.first_game + n, dtype=np.int64)
        seeds = [f'{self.prefix}{k}' for k in ks]
        regimes = np.array([regime_of(s) for s in seeds], dtype=np.uint8)
        starts = ks % 6
        self.env.reset(seeds, starts, regimes)
        self.bufs = self.env.make_buffers(critic=True)
        opens = []
        for i in range(n):
            opens += self._deal(i, seeds[i], int(regimes[i]), int(starts[i]))
        self.env.observe(self.bufs)
        self._open(opens)
        return self

    def _deal(self, i, seed, regime, start):
        """Set slot i up for a freshly dealt game; returns the service `open` specs it needs (none in self-play)."""
        gid = self.next_game_id
        self.next_game_id += 1
        opp = opponent_of(seed, self.shares)
        team = athena_team_of(seed) if opp != OPP_SELF else -1
        self.g_seed[i], self.g_opp[i], self.g_team[i], self.g_regime[i] = seed, opp, team, regime
        self.slen[i] = 0
        self.score[i] = 0
        self.h.view(self.n, 6, -1)[i].zero_()
        seats = np.arange(6)
        self.mine[i] = np.ones(6, dtype=bool) if opp == OPP_SELF else (seats % 2 == team)
        self.ep_of[i] = -1
        for s in range(6):
            if self.mine[i, s]:
                self.ep_of[i, s] = self.store.new_episode(gid, s, opp, regime)
        if regime:
            self.counters['bridge_games'] += 1
        if opp == OPP_SELF:
            self.g_svc[i] = -1
            return []
        self.counters['opp_games'] += 1
        g = int(self.service.game_numbers(1))
        self.g_svc[i] = g
        versions = [None if self.mine[i, s] else OPP_VERSION[opp] for s in range(6)]
        # §9.5: a bridge-regime game asks for the host's reduced reveal; `--bridge-reveal full` asks for neither
        reveal = REVEAL_REDUCED if (regime and self.bridge_reveal == REVEAL_REDUCED) else REVEAL_FULL
        return [(i, {'g': g, 'seed': seed, 'start': int(start), 'seats': versions, 'reveal': reveal})]

    def _open(self, opens):
        if not opens:
            return
        got = self.service.open([spec for _, spec in opens])
        by_g = {int(spec['g']): i for i, spec in opens}
        for g, _deal_digest, acting in got:
            i = by_g[int(g)]
            if acting is None or int(acting) != int(self.bufs['seat'][i]):
                self._diverge(i, 'acting seat at the deal',
                              f'the reference acts at seat {acting}, the port at {self.bufs["seat"][i]}')

    # -- the loop --

    def run(self, target_games, progress=None):
        """Play until `target_games` games have finished. Returns this call's counters."""
        before = dict(self.counters)
        done_here = 0
        while done_here < target_games:
            done_here += self._one_step(progress)
        return {k: self.counters[k] - before[k] for k in self.counters}

    def _one_step(self, progress=None):
        ae, bufs, n = self.ae, self.bufs, self.n
        seat = bufs['seat'].astype(np.int64)
        idx_all = np.arange(n)
        mine_now = self.mine[idx_all, seat]
        opp_live = self.g_svc >= 0

        # A. the service: apply the last action, and decide where Monet acts now
        t0 = time.perf_counter()
        want = np.flatnonzero(opp_live)
        want_decide = opp_live & ~mine_now
        if len(want):
            items = [[int(self.g_svc[i]), int(self.pend_seat[i]), int(self.pend_code[i]), 1 if want_decide[i] else 0]
                     for i in want]
            self.service.send({'op': 'step', 'full': self.digest_check == 'full', 'items': items})
        self.time['service'] += time.perf_counter() - t0

        # B. the events every ATHENA seat that is about to act has not seen
        t0 = time.perf_counter()
        self._fold(seat, mine_now)
        self.time['fold'] += time.perf_counter() - t0

        # the running score, from the acting seat's obs row, as absolute team scores
        t_of_seat = (seat % 2)
        self.score[idx_all, t_of_seat] = bufs['obs'][:, pm.O_SCORE]
        self.score[idx_all, 1 - t_of_seat] = bufs['obs'][:, pm.O_SCORE + 1]

        # C. the decisions
        kind = pm.kind_of(bufs['legal'])
        if (kind[mine_now] == pm.KIND_NONE).any():
            raise RuntimeError('an ATHENA seat was asked to act with an all-zero legal row')
        codes = np.full(n, ae.A_DECLINE, dtype=np.int32)
        have = np.zeros(n, dtype=bool)
        self._rail(kind, mine_now, codes, have)
        pol_rows = np.flatnonzero(mine_now & ~have)
        t0 = time.perf_counter()
        if len(pol_rows):
            self._act(pol_rows, seat, kind, codes)
            have[pol_rows] = True
        self.time['policy'] += time.perf_counter() - t0

        # D. Monet's codes
        t0 = time.perf_counter()
        if len(want):
            self._read_service(want, want_decide, seat, codes, have)
        self.time['service'] += time.perf_counter() - t0
        missing = np.flatnonzero(~have)
        if len(missing):
            raise RuntimeError(f'no action for slots {missing[:8].tolist()}')

        # E. the step
        t0 = time.perf_counter()
        reward, term, trunc = self.env.step(codes, self.bufs)
        self.time['env'] += time.perf_counter() - t0
        self.counters['batch_steps'] += 1
        self.counters['steps'] += n
        self.pend_seat[:] = -1
        self.pend_seat[opp_live] = seat[opp_live]
        self.pend_code[opp_live] = codes[opp_live]

        # F. the games that ended
        t0 = time.perf_counter()
        done = np.flatnonzero(term | trunc)
        ended = 0
        if len(done):
            ended = self._finish(done, int(self.env.next_game) - len(done), reward, trunc)
        self.time['ends'] += time.perf_counter() - t0
        if progress and self.counters['batch_steps'] % 500 == 0:
            progress(self)
        return ended

    def _fold(self, seat, mine_now):
        bufs = self.bufs
        ne = bufs['n_events'].astype(np.int64)
        rows = np.flatnonzero(mine_now & (ne > 0))
        if not len(rows):
            return
        kmax = int(ne[rows].max())
        need = int((self.slen[rows, seat[rows]] + ne[rows]).max())
        if need > self.stream_cap:
            self._grow_streams(max(need, 2 * self.stream_cap))
        for k in range(kmax):
            m = rows[ne[rows] > k]
            s = seat[m]
            self.srows[m, s, self.slen[m, s] + k] = bufs['events'][m, k]
            ev = torch.as_tensor(np.ascontiguousarray(bufs['events'][m, k])).to(self.device)
            flat = torch.as_tensor(m * 6 + s).to(self.device)
            with torch.no_grad():
                self.h[flat] = self.model.fold(pm.event_slots_torch(ev), self.h[flat]).float()
        self.slen[rows, seat[rows]] += ne[rows]

    def _grow_streams(self, cap):
        old = self.srows
        self.srows = np.zeros((self.n, 6, int(cap), pm.EVENT_LEN), dtype=np.uint8)
        self.srows[:, :, :old.shape[2]] = old
        self.stream_cap = int(cap)
        self.counters['stream_grows'] += 1

    def _rail(self, kind, mine_now, codes, have):
        """§9.3 rail 1: a rules-certain set is declared by the rail, with its assignment, and the network is not
        called (API.md §5.5 F_RAIL, F_RAIL_ASSIGN)."""
        facts, legal = self.bufs['facts'], self.bufs['legal']
        rows = np.flatnonzero(mine_now & (kind == pm.KIND_WINDOW) & (facts[:, pm.F_RAIL] != pm.NONE))
        if not len(rows):
            return
        s = facts[rows, pm.F_RAIL].astype(np.int64)
        if not (legal[rows, pm.L_DECLARE + s] != 0).all():
            bad = rows[legal[rows, pm.L_DECLARE + s] == 0]
            raise Divergence(f'the facts name a rail the legal row refuses, slots {bad[:4].tolist()}')
        d = facts[rows[:, None], pm.F_RAIL_ASSIGN + np.arange(6)].astype(np.int64) // 2
        codes[rows] = self.ae.A_DECLARE + s * self.ae.N_ASSIGN + pm.assign_code(d)
        have[rows] = True
        self.counters['rail'] += len(rows)

    def _act(self, rows, seat, kind, codes):
        bufs, dev, m = self.bufs, self.device, len(rows)

        def put(name):
            return torch.as_tensor(np.ascontiguousarray(bufs[name][rows])).to(dev)

        obs, facts, legal, crit = put('obs'), put('facts'), put('legal'), put('critic')
        k_t = torch.as_tensor(kind[rows].astype(np.int64)).to(dev)
        h = self.h[torch.as_tensor(rows * 6 + seat[rows]).to(dev)]
        with torch.no_grad():
            dec = pm.decision_features_torch(obs, facts, out=self._dec[:m])
            with torch.autocast(dev.type, dtype=torch.bfloat16, enabled=self.amp and dev.type == 'cuda'):
                u = self.model.trunk_of(h, dec)
                heads = self.model.heads_of(u)
                v_critic = self.model.critic_of(u, pm.deal_one_hot(crit))
            heads = heads.float()
            idx, digits, logp = pm.sample_actions(heads, legal, k_t, gen=self.gen)
            v_actor = heads[:, pm.H_VALUE]
        idx_n = idx.to('cpu').numpy().astype(np.int64)
        dig_n = digits.to('cpu').numpy().astype(np.uint8)
        kn = kind[rows]
        codes[rows] = pm.action_code(kn, idx_n, dig_n)
        t0 = time.perf_counter()
        self.store.append(bufs, rows, self.ep_of[rows, seat[rows]], self.slen[rows, seat[rows]], seat[rows], kn,
                          idx_n.astype(np.int16), dig_n, logp.to('cpu').numpy(),
                          v_critic.float().to('cpu').numpy(), v_actor.to('cpu').numpy())
        self.time['store'] += time.perf_counter() - t0
        self.counters['decisions'] += m
        self.counters['ask'] += int((kn == pm.KIND_ASK).sum())
        w = kn == pm.KIND_WINDOW
        self.counters['window'] += int(w.sum())
        self.counters['pass'] += int((kn == pm.KIND_PASS).sum())
        self.counters['declares'] += int((w & (idx_n != pm.DECLINE_SLOT)).sum())
        self.counters['declines'] += int((w & (idx_n == pm.DECLINE_SLOT)).sum())

    def _read_service(self, want, want_decide, seat, codes, have):
        reply = self.service.recv()['items']
        pd = pl = pv = (None, None, None)
        if self.digest_check != 'off':
            pd, pl, pv = self.env.digests()
        by_g = {int(self.g_svc[i]): int(i) for i in want}
        for g, d, acting, code, lg, v, end, err in reply:
            i = by_g.get(int(g))
            if i is None:
                raise Divergence(f'the service answered for game {g}, which no slot holds')
            if err:
                self.counters['service_faults'] += 1
                self._diverge(i, 'service', err)
            if end is not None:
                self._diverge(i, 'end', f'the reference finished {end}; the port plays on')
            if acting is not None and int(acting) != int(seat[i]):
                self._diverge(i, 'acting seat', f'the reference acts at seat {acting}, the port at {seat[i]}')
            if self.digest_check != 'off' and self.pend_seat[i] >= 0:
                self.counters['d_compared'] += 1
                if d != hh.hex16(pd[i]):
                    self._diverge(i, 'd', f"the reference's d {d} vs the port's {hh.hex16(pd[i])}")
                # l/v in every game under the reduced reveal; at full reveal the bridge's v differs by construction
                lv_ok = self.g_regime[i] == 0 or self.bridge_reveal == REVEAL_REDUCED
                if self.digest_check == 'full' and lv_ok and v is not None:
                    self.counters['lv_compared'] += 1
                    if lg != hh.hex16(pl[i]) or v != hh.hex16(pv[i]):
                        self._diverge(i, 'l/v', f"the reference's {lg}/{v} vs the port's "
                                                f"{hh.hex16(pl[i])}/{hh.hex16(pv[i])}")
            if want_decide[i]:
                if code is None:
                    self._diverge(i, 'decision refused', str(err))
                codes[i] = int(code)
                have[i] = True
                self.counters['monet'] += 1

    def _diverge(self, i, kind, detail):
        self.divergences.append({'slot': int(i), 'seed': self.g_seed[i], 'regime': int(self.g_regime[i]),
                                 'opponent': int(self.g_opp[i]), 'kind': kind, 'detail': detail,
                                 'batch_step': self.counters['batch_steps']})
        raise Divergence(f'{kind} at slot {i} ({self.g_seed[i]}): {detail}')

    def _finish(self, done, k0, reward, trunc):
        """Close every episode of the games that ended, then set their slots up for the game auto-reset dealt."""
        regimes = self.env.regimes()
        if self.verify_first_reset and self.reset_check is None:
            self.reset_check = self.verify_auto_reset(k0, done)
        closing, opens = [], []
        for j, i in enumerate(done):
            i = int(i)
            capped = bool(trunc[i])
            final = self.score[i].astype(np.float64)
            if capped:
                self.counters['capped'] += 1
            else:
                win = 0 if reward[i, 0] > 0 else 1
                if reward[i, 0] == 0 and reward[i, 1] == 0:
                    raise RuntimeError(f'slot {i} finished with no winner and was not capped')
                if final[win] != 4:
                    self.counters['score_fixups'] += 1
                final[win] = 5.0
            for s in range(6):
                e = int(self.ep_of[i, s])
                if e < 0:
                    continue
                r = 0.0 if capped else float(reward[i, s % 2])
                self.store.finish_episode(e, self.srows[i, s, :int(self.slen[i, s])], r,
                                          float(final[s % 2] - final[1 - s % 2]))
            self.counters['games'] += 1
            if self.g_opp[i] != OPP_SELF:
                self.counters['monet_games'] += 1
                closing.append((i, int(self.g_svc[i]), int(self.pend_seat[i]), int(self.pend_code[i])))
            k = k0 + j
            self.g_svc[i] = -1
            self.pend_seat[i] = -1
            opens += self._deal(i, f'{self.prefix}{k}', int(regimes[i]), k % 6)
        if closing:
            for g, _d, _acting, _code, _l, _v, end, err in self.service.step([[g, ps, pc, 0] for _, g, ps, pc in closing], False):
                if err:
                    self.counters['service_faults'] += 1
                    self.divergences.append({'service_game': int(g), 'kind': 'final apply', 'detail': err})
                    raise Divergence(f'the reference refused a final action of game {g}: {err}')
                if end is None:
                    self.divergences.append({'service_game': int(g), 'kind': 'end', 'detail': 'the reference plays on'})
                    raise Divergence(f'the port finished game {g}; the reference plays on')
            self.service.close([g for _, g, _, _ in closing])
        self._open(opens)
        return len(done)

    # -- after an iteration --

    def remap_episodes(self, remap):
        """Apply `TrajectoryStore.compact`'s renumbering to the slots' live episodes."""
        m = self.ep_of >= 0
        new = remap[self.ep_of[m]]
        if (new < 0).any():
            raise RuntimeError('compact dropped an episode a live slot still holds')
        self.ep_of[m] = new

    # -- checks --

    def verify_auto_reset(self, k0, slots):
        """The seeds, start seats and regimes this driver predicts for the games auto-reset just dealt are the port's.
        One call proves the ported PRNG and API.md §3.2's slot-order numbering; the smoke runs it."""
        seeds, starts, regimes = self.env.seeds(), self.env.start_seats(), self.env.regimes()
        bad = []
        for j, i in enumerate(slots):
            k = k0 + j
            if (seeds[i] != f'{self.prefix}{k}' or int(starts[i]) != k % 6
                    or int(regimes[i]) != regime_of(f'{self.prefix}{k}')):
                bad.append((int(i), seeds[i], int(starts[i]), int(regimes[i])))
        return bad

    def close(self):
        if self.service is not None:
            if getattr(self.service, '_outstanding', None) is not None:
                return  # a request is in flight after a stop: the stream is not safe to reuse
            live = [int(g) for g in self.g_svc if g >= 0]
            try:
                self.service.close(live)
            except Exception:  # noqa: BLE001 - the service is being torn down
                pass
