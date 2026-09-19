"""
p2_train.py: ATHENA P2's learner (ATHENA.md §9.4, §9.6) -- PPO over `p2_rollout.Rollout`, with checkpoints, a jsonl
log, the learning-curve hook and the format v3 weight export.

    python scripts/athena/p2_train.py train --out <run> --prefix athena-p2-run1- [--athena-env <build>]
    python scripts/athena/p2_train.py train --out <run> --resume <run>/latest.pt
    python scripts/athena/p2_train.py export --ckpt <run>/latest.pt --weights <file> [--check <n decisions>]
    python scripts/athena/p2_train.py smoke --out <dir>          # the CPU round trip, seconds: see `cmd_smoke`

**The learner, as §9.4 registers it.** Every one of these is a default of this file and a line of `config.json`:

| choice | value |
|---|---|
| games in flight | 8,192 |
| an iteration | 2,048 finished games |
| epochs an iteration | 2 |
| minibatch | 256 games |
| clip epsilon | 0.2 |
| discount gamma | 1.0 |
| GAE lambda | 0.95 |
| optimiser | Adam, lr 3e-4, gradient clip 1.0 |
| entropy bonus | 0.01 |
| loss weights | policy 1.0, value 0.5, belief 0.25, set difference 0.05 |
| precision | bf16 autocast, fp32 master weights |
| reward | the game's result: +1 to the winning team's seats, -1 to the losing team's, 0 at every other step |

- **The advantage is the critic's, by GAE** (§9.4). The critic is the perfect-information MLP, which sees the true deal
  and is training only; its value at act time is stored with the decision, and GAE runs over a seat's own decisions.
  Rail decisions are not the policy's (§9.3) and are not in the trajectory at all, so a seat's sequence skips them --
  harmless at gamma = 1 with no intermediate reward.
- **Staleness.** A game still in flight when an iteration is cut keeps its rows and is trained when it finishes, its
  ratio taken against the log-probability stored at act time. Nothing is discarded.
- **The value loss** covers both value outputs: the critic and the actor's value head, each regressed to the GAE
  return. §9.4 registers one value weight, and this is what it weighs.
- **The belief loss** is the cross-entropy of the true holder over the unit cards (a card whose facts leave two or more
  candidate seats), plus §8.3's D2 data replayed from the stored belief views at a fixed 10% of each minibatch's cards
  (`--d2-views`). Without `--d2-views` the D2 term is absent, the run is labelled `d2: false`, and the log says so at
  every iteration: §9.1 records "D2 holds" for P2.
- **The set-difference head** predicts the game's paired set difference from the seat's team's side. It is predicted,
  never rewarded (§1).
- **Every window offer trains.** No decline is subsampled (§9.4). §3.1's subsampling options are not registered and
  this file has no switch for them.

**Checkpoints and the curve.** `--checkpoint-minutes` (30, D4's terms) writes `latest.pt` with the weights, the
optimiser state, the iteration count and the games played, so a run can be paused and resumed at any time.
`--curve-hours` (2) exports the weights and calls the JS evaluation arm (§9.6: 600 duplicate pairs against Monet v1.0
at home on the fixed bank `athena-p2-curve`).

**The evaluation arm** is `scripts/athena/p2-read.mjs`, built in parallel on `claude/athena-p2-fwd`. It is called in
one place, `run_curve`, through one command template, `CURVE_CMD`, and `--curve-cmd` replaces the template without
touching this file. The command is

    node scripts/athena/p2-read.mjs curve --weights <file> --b v1.0 --bank <bank> --pairs <n> --procs <n>
                                          --work <dir> --out <json> --quiet

and `<json>` is the summary p2-read.mjs writes, whose top-level `winRate` is ATHENA's win rate as a fraction (beside
`games`, `wins`, `diffMean` and `diffSe`). The whole JSON is copied into the curve log, and a missing win rate is
logged as a fault, never a crash. `--b athena:<the same weight file>` turns the same command into §9.7's byte-exact
null arm, which must read `winRate` 0.5 and `diffMean` 0.

**The reveal at the bridge** (§9.5, `p2_rollout`). Half the training games are bridge-regime, where the host
publishes only the reduced reveal of a wrong declare. The rollout asks the opponent service for that reveal, and
**a run stops before its first game unless the service says it supports it**, naming `--bridge-reveal full` -- the
escape hatch that takes the full-reveal Monet deliberately, off by default -- rather than training against an
opponent that sees more than a bridge host would give it. The `smoke` subcommand defaults to `full`, because it is
wiring and not training, and says so on every run.

**Before and after a run** `replay-check` must still print `G0a (i), port replay: PASS` on the 10,800-game corpus
(§9.5). This file does not build Rust; the command is

    cargo run --release --bin replay-check -- --corpus <corpus> --threads 2

and `--replay-check-cmd` runs it at the run's start and end when it is given.
"""
import argparse
import base64
import hashlib
import json
import os
import shlex
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))
import p2_model as pm  # noqa: E402
import p2_rollout as pr  # noqa: E402

BENCH_ENV_DEFAULT = 'C:/Projects/FishAI-bench/athena/p1/a/builds/default'

# §9.4, registered. Nothing below reads a number that is not here.
IN_FLIGHT = 8192
ITERATION_GAMES = 2048
EPOCHS = 2
MINIBATCH_GAMES = 256
CLIP = 0.2
GAMMA = 1.0
LAM = 0.95
LR = 3e-4
GRAD_CLIP = 1.0
ENTROPY = 0.01
W_POLICY, W_VALUE, W_BELIEF, W_SETDIFF = 1.0, 0.5, 0.25, 0.05
D2_SHARE = 0.10  # §9.4: "a fixed 10% of each minibatch's cards"

# §9.6, registered.
CURVE_BANK = 'athena-p2-curve'
CURVE_PAIRS = 600
CURVE_OPPONENT = 'v1.0'
CURVE_HOURS = 2.0
CHECKPOINT_MINUTES = 30.0
CURVE_CMD = ('node scripts/athena/p2-read.mjs curve --weights {weights} --b {opponent} --bank {bank} '
             '--pairs {pairs} --procs {threads} --work {work} --out {json} --quiet')


def seed_int(label):
    return int.from_bytes(hashlib.md5(label.encode()).digest()[:4], 'little')


def md5_file(p):
    h = hashlib.md5()
    with open(p, 'rb') as f:
        for blk in iter(lambda: f.read(1 << 20), b''):
            h.update(blk)
    return h.hexdigest()


def load_athena_env(path=None):
    p = path or os.environ.get('ATHENA_ENV_PATH') or BENCH_ENV_DEFAULT
    sys.path.insert(0, str(Path(p).resolve()))
    import athena_env as ae
    if not hasattr(ae, 'FACTS_LEN'):
        raise RuntimeError(f'{ae.__file__} is a pre-P1 build with no facts buffer: point --athena-env at a P1 build')
    if ae.OBS_LEN != pm.OBS_LEN or ae.FACTS_LEN != pm.FACTS_LEN or ae.LEGAL_LEN != pm.LEGAL_LEN:
        raise RuntimeError('athena_env\'s buffer widths are not the ones p2_model reads')
    return ae


# ------------------------------------------------------------------------------------------------------- GAE ---

def compute_gae(batch, gamma=GAMMA, lam=LAM):
    """§9.4's advantage: GAE over each episode's own decisions, from the critic values stored at act time. The reward
    lands on the last decision (+1/-1, or 0 for a capped game), so with gamma = 1 delta_t = V_{t+1} - V_t inside the
    episode and R - V_T at its end. Returns (advantage, return) per decision, in the batch's order."""
    v = batch['v_critic'].astype(np.float64)
    off, ln = batch['ep_dec_off'], batch['ep_dec_len'].astype(np.int64)
    r = batch['ep_reward'].astype(np.float64)
    E = len(ln)
    adv = np.zeros(len(v), dtype=np.float32)
    if E == 0 or len(v) == 0:
        return adv, adv.copy()
    T = int(ln.max())
    ar = np.arange(T)
    valid = ar[None, :] < ln[:, None]
    idx = np.clip(off[:, None] + ar[None, :], 0, len(v) - 1)
    V = np.where(valid, v[idx], 0.0)
    nxt = np.concatenate([V[:, 1:], np.zeros((E, 1))], axis=1)
    last = ar[None, :] == (ln - 1)[:, None]
    delta = np.where(last, r[:, None] - V, gamma * nxt - V)
    delta = np.where(valid, delta, 0.0)
    A = np.zeros((E, T))
    run = np.zeros(E)
    for t in range(T - 1, -1, -1):
        run = np.where(valid[:, t], delta[:, t] + gamma * lam * np.where(last[:, t], 0.0, run), run)
        A[:, t] = run
    adv[idx[valid]] = A[valid].astype(np.float32)
    return adv, (adv + batch['v_critic']).astype(np.float32)


# -------------------------------------------------------------------------------------------- the minibatches ---

def game_minibatches(batch, size, rng):
    """§9.4's "minibatch 256 games": the iteration's games in a fresh order, `size` at a time. Each minibatch is the
    episode indices of its games, so a game's six seats always train together."""
    games = batch['ep_game']
    uniq, inv = np.unique(games, return_inverse=True)
    order = rng.permutation(len(uniq))
    by_game = [[] for _ in range(len(uniq))]
    for e, g in enumerate(inv):
        by_game[g].append(e)
    for i in range(0, len(uniq), size):
        eps = np.concatenate([by_game[g] for g in order[i:i + size]]) if len(order[i:i + size]) else np.zeros(0, int)
        yield np.sort(eps.astype(np.int64))


def gather_minibatch(batch, eps, device):
    """The tensors of a minibatch: the episodes' event streams as slots, and every decision's inputs and labels."""
    ln = batch['ep_dec_len'][eps].astype(np.int64)
    eps = eps[ln > 0]
    ln = ln[ln > 0]
    if not len(eps):
        return None
    off = batch['ep_dec_off'][eps].astype(np.int64)
    rows = np.concatenate([np.arange(o, o + n) for o, n in zip(off, ln)])
    s_off, s_len = batch['ep_stream_off'][eps].astype(np.int64), batch['ep_stream_len'][eps].astype(np.int64)
    L = max(1, int(s_len.max()) if len(s_len) else 1)
    pad = np.zeros((len(eps), L, pm.EVENT_LEN), dtype=np.uint8)
    for j, (o, n) in enumerate(zip(s_off, s_len)):
        if n:
            pad[j, :n] = batch['streams'][o:o + n]
    slots = torch.as_tensor(pm.event_slots(pad.reshape(-1, pm.EVENT_LEN))).view(len(eps), L, pm.EVENT_SLOTS).to(device)
    seq = torch.as_tensor(np.repeat(np.arange(len(eps)), ln)).to(device)

    def t(name, dt=None):
        a = batch[name][rows]
        return torch.as_tensor(np.ascontiguousarray(a if dt is None else a.astype(dt))).to(device)

    return {'slots': slots, 'ask_seq': seq, 'ask_pos': t('pos', np.int64), 'obs': t('obs'), 'facts': t('facts'),
            'legal': t('legal'), 'critic': t('critic'), 'kind': t('kind', np.int64), 'idx': t('idx', np.int64),
            'digits': t('digits', np.int64), 'old_logp': t('logp'), 'adv': t('adv'), 'ret': t('ret'),
            'setdiff': torch.as_tensor(np.ascontiguousarray(np.repeat(batch['ep_setdiff'][eps], ln))).to(device),
            'n_decisions': len(rows), 'n_episodes': len(eps), 'stream_rows': int(s_len.sum())}


def belief_terms(heads, facts, critic):
    """The belief loss's pieces over a batch of decisions: the summed cross-entropy of the true holder and the number
    of unit cards. A unit is a card the facts leave two or more candidate seats for (§8.3's unit)."""
    mask = pm.cand_mask_of(facts)
    unit = mask.sum(dim=-1) >= 2
    logp = pm.belief_logp(heads, mask)
    holder = critic.long().clamp(max=5)
    nll = -torch.gather(logp, 2, holder[:, :, None]).squeeze(-1)
    return (nll * unit).sum(), unit.sum()


# --------------------------------------------------------------------------------------------- the D2 corpus ---

class D2Corpus:
    """§8.3's D2 views (Monet's seats' views of SESTINA's recorded games) as an extra belief population. It reuses
    P1's loader, `belief_data.BeliefViews`; its `slots` carry v1/v2's two trailing zeros, and v3 takes the first 19."""

    def __init__(self, dirs, device, rng):
        sys.path.insert(0, str(HERE))
        import belief_data as bd
        self.bd = bd
        self.views = bd.BeliefViews(dirs, bd.DEC_F_FACTS)
        self.device, self.rng = device, rng

    def draw(self, games):
        g = self.rng.integers(0, len(self.views), size=int(games))
        b = self.views.batch(g)
        if not len(b['ask_seq']):
            return None
        dev = self.device
        return {'slots': torch.as_tensor(b['slots'][:, :, :pm.EVENT_SLOTS]).to(dev),
                'ask_seq': torch.as_tensor(b['ask_seq']).to(dev),
                'ask_pos': torch.as_tensor(b['ask_pos']).to(dev),
                'dec': torch.as_tensor(b['dec']).to(dev),
                'mask': torch.as_tensor(b['mask']).to(dev),
                'unit': torch.as_tensor(b['unit']).to(dev),
                'holder': torch.as_tensor(b['holder']).to(dev)}

    def loss(self, model, b):
        heads = model(b['slots'], b['ask_seq'], b['ask_pos'], b['dec'])
        logp = pm.belief_logp(heads, b['mask'])
        nll = -torch.gather(logp, 2, b['holder'][:, :, None]).squeeze(-1)
        return (nll * b['unit']).sum(), b['unit'].sum()


# ------------------------------------------------------------------------------------------------ the curve ---

def run_curve(weights, out_json, *, cmd=CURVE_CMD, bank=CURVE_BANK, pairs=CURVE_PAIRS, opponent=CURVE_OPPONENT,
              threads=6, cwd=REPO, timeout=None, work=None):
    """§9.6's curve read, behind one function with the command in one place. Returns a dict: what the arm wrote,
    the win rate if one can be found, and the cost. It never raises: a curve is an instrument, and a run does not
    stop because the instrument did.

    `work` is where p2-read.mjs puts its shard files; it defaults to a directory beside `out_json`, so a run's curve
    reads do not pile up under `dist/`. A `--curve-cmd` that names no `{work}` simply ignores it.

    **Every path substituted into the template is written with forward slashes.** The line is split with
    `shlex.split`, which reads a backslash as an escape, so a Windows path would otherwise arrive at Node with its
    separators eaten; Node takes `C:/...` on Windows. A `--curve-cmd` that spells its own paths must do the same."""
    t0 = time.perf_counter()
    fwd = lambda p: Path(p).as_posix()  # noqa: E731 - the template's paths, backslash-free (see the docstring)
    work = fwd(work if work is not None else Path(str(out_json) + '.shards'))
    line = cmd.format(weights=fwd(weights), bank=bank, pairs=pairs, opponent=opponent, threads=threads,
                      json=fwd(out_json), work=work)
    rec = {'command': line, 'bank': bank, 'pairs': pairs, 'opponent': opponent}
    try:
        Path(out_json).unlink(missing_ok=True)  # never read a previous read's summary as this one's
        r = subprocess.run(shlex.split(line), cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
        rec['returncode'] = r.returncode
        rec['stdout'] = r.stdout[-4000:]
        rec['stderr'] = r.stderr[-4000:]
        if Path(out_json).exists():
            rec['result'] = json.loads(Path(out_json).read_text())
    except Exception as exc:  # noqa: BLE001 - the curve never stops the run
        rec['error'] = f'{type(exc).__name__}: {exc}'
    res = rec.get('result') or {}
    # p2-read.mjs writes `winRate` at the top level, as a fraction; the rest are fallbacks for another arm's shape.
    for path in (('winRate',), ('summary', 'winRate'), ('winRateA',), ('summary', 'winRateA')):
        v = res
        for k in path:
            v = v.get(k) if isinstance(v, dict) else None
        if isinstance(v, (int, float)):
            rec['win_rate'] = float(v)
            rec['win_rate_from'] = '.'.join(path)
            break
    if 'win_rate' not in rec:
        rec['fault'] = 'the evaluation arm gave no win rate'
    for k in ('games', 'wins', 'diffMean', 'diffSe', 'capped'):
        if isinstance(res.get(k), (int, float)):
            rec[k] = res[k]
    # A pair that hits duplicate-pairs.mjs's 6,000-move cap is dropped, and the win rate is then taken over the pairs
    # that survived -- 0 of 0 reads as 0%, which is not a number about the policy. An early checkpoint whose argmax
    # never declares does this in self-play, so it is named here rather than read as a curve point.
    if int(rec.get('capped') or 0) > 0:
        rec['fault'] = (f'{int(rec["capped"])} of {pairs} pairs hit the step cap and were dropped; '
                        f'the win rate is over the {int(rec.get("games") or 0) // 2} pairs that finished')
    if int(rec.get('games') or 0) == 0:
        rec['fault'] = 'no pair finished: every game hit the step cap, so there is no win rate'
        rec.pop('win_rate', None)
    rec['secs'] = round(time.perf_counter() - t0, 1)
    return rec


# ------------------------------------------------------------------------------------------------- the export ---

def export(model, path, meta, fmt=pm.WEIGHTS_FORMAT, magic=None):
    data = pm.export_weights(model, path, meta, fmt=fmt, magic=magic)
    return {'weights': str(path), 'md5': hashlib.md5(data).hexdigest(), 'bytes': len(data),
            'params': pm.param_count(model.d, model.width, model.depth, model.dec_f), 'format': fmt}


def write_export_check(model, batch, path, weights_info, n_decisions, device, rng):
    """The inputs of `n_decisions` sampled decisions and PyTorch's float32 heads at each, for
    `scripts/athena/check-p2-export.mjs` to recompute with the deterministic JavaScript forward."""
    n = len(batch['pos'])
    if n == 0:
        raise RuntimeError('no decisions to check the export against')
    pick = rng.permutation(n)[:min(n_decisions, n)]
    ep = batch['ep_index'][pick].astype(np.int64)
    items = []
    model.eval()
    with torch.no_grad():
        for a, e in zip(pick, ep):
            pos = int(batch['pos'][a])
            o = int(batch['ep_stream_off'][e])
            rows = batch['streams'][o:o + pos]
            slots = torch.as_tensor(pm.event_slots(rows) if pos else np.zeros((0, pm.EVENT_SLOTS), np.int64))
            slots = slots.view(1, max(pos, 1), pm.EVENT_SLOTS).to(device) if pos else \
                torch.zeros(1, 1, pm.EVENT_SLOTS, dtype=torch.long, device=device)
            st = model.states(slots)[0, pos if pos else 0]
            obs = torch.as_tensor(batch['obs'][a][None]).to(device)
            facts = torch.as_tensor(batch['facts'][a][None]).to(device)
            dec = pm.decision_features_torch(obs, facts)
            heads = model.heads_of(model.trunk_of(st[None], dec))[0].float().cpu().numpy().astype('<f4')
            items.append({'pos': pos, 'seat': int(batch['seat'][a]),
                          'rows': base64.b64encode(np.ascontiguousarray(rows).tobytes()).decode(),
                          'obs': base64.b64encode(batch['obs'][a].tobytes()).decode(),
                          'facts': base64.b64encode(batch['facts'][a].tobytes()).decode(),
                          'legal': base64.b64encode(batch['legal'][a].tobytes()).decode(),
                          'heads': base64.b64encode(heads.tobytes()).decode()})
    Path(path).write_text(json.dumps({**weights_info, 'heads': pm.HEADS, 'decisions': len(items), 'items': items}))
    return len(items)


# --------------------------------------------------------------------------------------------------- training ---

def train_iteration(model, opt, batch, cfg, device, rng, d2=None, scaler_log=None):
    """One iteration's PPO: `epochs` passes over the iteration's games in minibatches of `minibatch_games`."""
    stats = {k: 0.0 for k in ('policy', 'value', 'belief', 'setdiff', 'entropy', 'loss', 'clipfrac', 'kl',
                              'belief_cards', 'd2_cards', 'grad_norm', 'minibatches', 'decisions')}
    adv_all = batch['adv']
    if cfg['adv_norm'] == 'batch' and len(adv_all) > 1:
        batch['adv'] = ((adv_all - adv_all.mean()) / (adv_all.std() + 1e-8)).astype(np.float32)
    amp = cfg['amp'] == 'bf16' and device.type == 'cuda'
    model.train()
    for _epoch in range(cfg['epochs']):
        for eps in game_minibatches(batch, cfg['minibatch_games'], rng):
            mb = gather_minibatch(batch, eps, device)
            if mb is None:
                continue
            adv = mb['adv']
            if cfg['adv_norm'] == 'minibatch' and adv.numel() > 1:
                adv = (adv - adv.mean()) / (adv.std() + 1e-8)
            with torch.autocast(device.type, dtype=torch.bfloat16, enabled=amp):
                dec = pm.decision_features_torch(mb['obs'], mb['facts'])
                h = model.states(mb['slots'])[mb['ask_seq'], mb['ask_pos']]
                u = model.trunk_of(h, dec)
                heads = model.heads_of(u)
                v_critic = model.critic_of(u, pm.deal_one_hot(mb['critic']))
            heads32 = heads.float()
            logp, ent = pm.action_logp(heads32, mb['legal'], mb['kind'], mb['idx'], mb['digits'])
            ratio = torch.exp(logp - mb['old_logp'])
            un = ratio * adv
            cl = torch.clamp(ratio, 1 - cfg['clip'], 1 + cfg['clip']) * adv
            policy = -torch.min(un, cl).mean()
            value = 0.5 * (F.mse_loss(v_critic.float(), mb['ret']) + F.mse_loss(heads32[:, pm.H_VALUE], mb['ret']))
            b_sum, b_n = belief_terms(heads32, mb['facts'], mb['critic'])
            belief = b_sum / b_n.clamp(min=1)
            d2_cards = 0
            if d2 is not None:
                want = max(1, int(round(float(b_n) * D2_SHARE / max(1e-9, 1 - D2_SHARE) / max(1.0, cfg['d2_cards_per_game']))))
                db = d2.draw(min(want, cfg['d2_max_games']))
                if db is not None:
                    with torch.autocast(device.type, dtype=torch.bfloat16, enabled=amp):
                        d_sum, d_n = d2.loss(model, db)
                    d2_cards = int(d_n)
                    if d2_cards:
                        belief = (1 - D2_SHARE) * belief + D2_SHARE * (d_sum.float() / d_n.clamp(min=1))
            setdiff = F.mse_loss(heads32[:, pm.H_SETDIFF], mb['setdiff'])
            entropy = ent.mean()
            loss = (cfg['w_policy'] * policy + cfg['w_value'] * value + cfg['w_belief'] * belief
                    + cfg['w_setdiff'] * setdiff - cfg['entropy'] * entropy)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            gn = torch.nn.utils.clip_grad_norm_(model.parameters(), cfg['grad_clip'])
            opt.step()
            with torch.no_grad():
                stats['clipfrac'] += float(((ratio - 1).abs() > cfg['clip']).float().mean())
                stats['kl'] += float((mb['old_logp'] - logp).mean())
            for k, v in (('policy', policy), ('value', value), ('belief', belief), ('setdiff', setdiff),
                         ('entropy', entropy), ('loss', loss), ('grad_norm', gn)):
                stats[k] += float(v.detach())
            stats['belief_cards'] += int(b_n)
            stats['d2_cards'] += d2_cards
            stats['decisions'] += mb['n_decisions']
            stats['minibatches'] += 1
    m = max(1, int(stats['minibatches']))
    for k in ('policy', 'value', 'belief', 'setdiff', 'entropy', 'loss', 'clipfrac', 'kl', 'grad_norm'):
        stats[k] /= m
    _ = scaler_log
    return stats


def save_checkpoint(path, model, opt, state, cfg):
    tmp = Path(str(path) + '.tmp')
    torch.save({'model': model.state_dict(), 'opt': opt.state_dict(), 'state': state, 'config': cfg,
                'torch_rng': torch.get_rng_state()}, tmp)
    tmp.replace(path)


def cmd_train(args, sink=None):
    device = torch.device('cuda' if torch.cuda.is_available() and not args.cpu else 'cpu')
    run = Path(args.out)
    run.mkdir(parents=True, exist_ok=True)
    ae = load_athena_env(args.athena_env)
    smoke = bool(args.smoke or args.arch in pm.SMOKE_ARCHS or args.in_flight != IN_FLIGHT
                 or args.iteration_games != ITERATION_GAMES)
    torch.manual_seed(seed_int(args.seed))
    model = pm.P2Net.of(args.arch, critic_width=args.critic_width, critic_depth=args.critic_depth,
                        embed_mode=args.embed_mode).to(device)
    if args.init_decline_bias:
        pm.nudge_decline_bias(model, args.init_decline_bias)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    shares = {pr.OPP_SELF: args.share_self, pr.OPP_V10: args.share_v10, pr.OPP_V033: args.share_v033}
    if abs(sum(shares.values()) - 1.0) > 1e-9:
        raise ValueError(f'the opponent shares sum to {sum(shares.values())}, not 1')
    cfg = {'arch': args.arch, 'in_flight': args.in_flight, 'iteration_games': args.iteration_games,
           'epochs': args.epochs, 'minibatch_games': args.minibatch_games, 'clip': args.clip, 'gamma': args.gamma,
           'lam': args.lam, 'lr': args.lr, 'grad_clip': args.grad_clip, 'entropy': args.entropy,
           'w_policy': W_POLICY, 'w_value': W_VALUE, 'w_belief': W_BELIEF, 'w_setdiff': W_SETDIFF,
           'adv_norm': args.adv_norm, 'amp': args.amp, 'prefix': args.prefix, 'seed': args.seed,
           'shares': {str(k): v for k, v in shares.items()}, 'd2': bool(args.d2_views),
           'd2_views': args.d2_views, 'd2_cards_per_game': args.d2_cards_per_game, 'd2_max_games': args.d2_max_games,
           'digest_check': args.digest_check, 'bridge_reveal': args.bridge_reveal,
           'service_workers': args.service_workers, 'env_threads': args.env_threads,
           'curve_hours': args.curve_hours, 'checkpoint_minutes': args.checkpoint_minutes, 'curve_cmd': args.curve_cmd,
           'curve_bank': args.curve_bank, 'curve_pairs': args.curve_pairs, 'curve_threads': args.curve_threads,
           'device': str(device), 'torch': torch.__version__, 'athena_env': str(Path(ae.__file__).resolve()),
           'smoke': smoke, 'params': model.param_report(), 'weights_format': args.weights_format,
           'command': ' '.join(sys.argv)}
    state = {'iteration': 0, 'games': 0, 'decisions': 0, 'next_k': 0, 'wall_s': 0.0, 'curve': []}
    if args.resume:
        ck = torch.load(args.resume, map_location=device, weights_only=False)
        model.load_state_dict(ck['model'])
        opt.load_state_dict(ck['opt'])
        state.update(ck['state'])
        cfg['resumed_from'] = str(args.resume)
        torch.set_rng_state(ck['torch_rng'].cpu() if torch.is_tensor(ck['torch_rng']) else ck['torch_rng'])
    (run / 'config.json').write_text(json.dumps(cfg, indent=1))
    print(json.dumps({'config': cfg}), flush=True)
    if args.replay_check_cmd:
        r = subprocess.run(shlex.split(args.replay_check_cmd), cwd=str(REPO), capture_output=True, text=True)
        print(f'replay-check before the run: exit {r.returncode}\n{r.stdout[-2000:]}{r.stderr[-2000:]}', flush=True)
        if r.returncode != 0:
            raise RuntimeError('replay-check failed before the run (§9.5)')

    gen = torch.Generator(device=device)
    gen.manual_seed(seed_int(f'{args.seed}:act'))
    rng = np.random.default_rng(seed_int(f'{args.seed}:order'))
    service = None
    if shares[pr.OPP_V10] + shares[pr.OPP_V033] > 0:
        service = pr.AsyncOpponentService(workers=args.service_workers)
    try:
        # the reveal handshake of §9.5 is inside this call, and it refuses before a game is dealt
        rollout = pr.Rollout(ae, model, device, prefix=args.prefix, in_flight=args.in_flight,
                             threads=args.env_threads, service=service, shares=shares, gen=gen,
                             amp=args.amp == 'bf16', digest_check=args.digest_check,
                             iteration_games=args.iteration_games, first_game=state['next_k'],
                             decision_cap=args.decision_cap, stream_table_cap=args.stream_table_cap,
                             bridge_reveal=args.bridge_reveal)
        rollout.reset()
    except BaseException:
        if service is not None:
            service.quit()
        raise
    print(json.dumps({'store': {'decision_cap': rollout.store.cap, 'stream_cap': rollout.store.stream_cap,
                                'episode_cap': rollout.store.ep_cap, 'bytes': int(rollout.store.bytes_used()),
                                'event_rows_bytes': int(rollout.srows.nbytes)}}), flush=True)
    d2 = D2Corpus(args.d2_views.split(','), device, np.random.default_rng(seed_int(f'{args.seed}:d2'))) \
        if args.d2_views else None
    if d2 is None:
        print('!!! no --d2-views: the belief loss has no D2 term, which section 9.1 registers for P2', flush=True)
    log = open(run / 'iterations.jsonl', 'a', encoding='utf-8')
    curve_log = open(run / 'curve.jsonl', 'a', encoding='utf-8')
    t_run = time.perf_counter()
    last_ckpt = last_curve = time.perf_counter()
    stop = None
    try:
        while args.iterations <= 0 or state['iteration'] < args.iterations:
            t_it = time.perf_counter()
            roll = rollout.run(args.iteration_games)
            t_roll = time.perf_counter() - t_it
            batch = rollout.store.take_finished()
            batch['adv'], batch['ret'] = compute_gae(batch, args.gamma, args.lam)
            t_tr = time.perf_counter()
            stats = train_iteration(model, opt, batch, cfg, device, rng, d2)
            t_tr = time.perf_counter() - t_tr
            if sink is not None:
                sink['batch'], sink['model'], sink['rollout'] = batch, model, rollout
            rollout.remap_episodes(rollout.store.compact())
            state['iteration'] += 1
            state['games'] += int(roll['games'])
            state['decisions'] += int(roll['decisions'])
            state['next_k'] = int(rollout.env.next_game)
            state['wall_s'] = round(time.perf_counter() - t_run, 1)
            rec = {'iteration': state['iteration'], 'games': state['games'], 'decisions': state['decisions'],
                   'episodes': int(len(batch['ep_dec_len'])), 'trained_decisions': int(len(batch['pos'])),
                   'reward_mean': float(batch['ep_reward'].mean()) if len(batch['ep_reward']) else 0.0,
                   'setdiff_mean': float(batch['ep_setdiff'].mean()) if len(batch['ep_setdiff']) else 0.0,
                   'roll': {k: int(v) for k, v in roll.items()}, 'train': {k: round(float(v), 6) for k, v in stats.items()},
                   'roll_s': round(t_roll, 2), 'train_s': round(t_tr, 2),
                   'games_per_s': round(roll['games'] / max(1e-9, t_roll + t_tr), 1),
                   'rail_share': round(roll['rail'] / max(1, roll['rail'] + roll['decisions']), 4),
                   'store_bytes': int(rollout.store.bytes_used()), 'wall_s': state['wall_s'],
                   'auto_reset_verified': rollout.reset_check == [] if rollout.reset_check is not None else None,
                   'rollout_time': {k: round(v, 2) for k, v in rollout.time.items()}}
            log.write(json.dumps(rec) + '\n')
            log.flush()
            print(json.dumps(rec), flush=True)
            now = time.perf_counter()
            if (now - last_ckpt) / 60 >= args.checkpoint_minutes:
                save_checkpoint(run / 'latest.pt', model, opt, state, cfg)
                last_ckpt = now
            if args.curve_hours > 0 and (now - last_curve) / 3600 >= args.curve_hours:
                last_curve = now
                c = curve_point(model, run, state, cfg, args)
                curve_log.write(json.dumps(c) + '\n')
                curve_log.flush()
                state['curve'].append({'games': state['games'], 'win_rate': c.get('win_rate')})
                print(f'curve: {json.dumps(c.get("win_rate"))} after {state["games"]} games', flush=True)
    except pr.Divergence as exc:
        stop = {'rule': 1, 'what': 'a divergence between the port and the reference', 'detail': str(exc),
                'divergences': rollout.divergences[-8:]}
    except KeyboardInterrupt:
        stop = {'rule': None, 'what': 'interrupted'}
    finally:
        save_checkpoint(run / 'latest.pt', model, opt, state, cfg)
        log.close()
        curve_log.close()
        rollout.close()
        if service is not None:
            service.quit()
    if args.replay_check_cmd and stop is None:
        r = subprocess.run(shlex.split(args.replay_check_cmd), cwd=str(REPO), capture_output=True, text=True)
        print(f'replay-check after the run: exit {r.returncode}\n{r.stdout[-2000:]}', flush=True)
    summary = {'state': state, 'stop': stop, 'counters': {k: int(v) for k, v in rollout.counters.items()},
               'divergences': rollout.divergences, 'smoke': smoke,
               'auto_reset_check': rollout.reset_check}
    (run / 'summary.json').write_text(json.dumps(summary, indent=1))
    print(json.dumps({'summary': summary}), flush=True)
    if stop is not None and stop.get('rule') == 1:
        sys.exit(3)
    return summary


def curve_point(model, run, state, cfg, args):
    w = run / 'curve-weights.bin'
    info = export(model, w, {'run': str(run), 'iteration': state['iteration'], 'games': state['games'],
                             'smoke': cfg['smoke'], 'what': 'a curve read (§9.6), not a ship read'},
                  fmt=args.weights_format, magic=args.weights_magic or None)
    c = run_curve(w, run / 'curve-result.json', cmd=args.curve_cmd, bank=args.curve_bank, pairs=args.curve_pairs,
                  opponent=CURVE_OPPONENT, threads=args.curve_threads)
    return {**c, 'games': state['games'], 'iteration': state['iteration'], 'weights_md5': info['md5']}


def cmd_export(args):
    device = torch.device('cpu')
    ck = torch.load(args.ckpt, map_location=device, weights_only=False)
    cfg = ck['config']
    p = cfg['params']
    model = pm.P2Net(p['d'], p['width'], p['depth'], dec_f=p['dec_f'], critic_width=p['critic_width'],
                     critic_depth=p['critic_depth']).to(device)
    model.load_state_dict(ck['model'])
    info = export(model, args.weights, {'run': str(Path(args.ckpt).parent), 'iteration': ck['state']['iteration'],
                                        'games': ck['state']['games'], 'arch': cfg['arch'], 'smoke': cfg.get('smoke'),
                                        'trained': 'scripts/athena/p2_train.py'}, fmt=args.weights_format,
                  magic=args.weights_magic or None)
    print(json.dumps(info))
    if args.check:
        # decisions to check the JavaScript forward on: a few self-play games with these very weights
        ae = load_athena_env(args.athena_env)
        gen = torch.Generator(device=device)
        gen.manual_seed(seed_int('athena-p2-export-check'))
        ro = pr.Rollout(ae, model, device, prefix='athena-p2-export-check-', in_flight=max(4, args.check_games),
                        threads=2, service=None, shares={pr.OPP_SELF: 1.0, pr.OPP_V10: 0.0, pr.OPP_V033: 0.0},
                        gen=gen, amp=False, iteration_games=args.check_games, verify_first_reset=False).reset()
        ro.run(args.check_games)
        b = ro.store.take_finished()
        out = Path(str(args.weights) + '.export-check.json')
        n = write_export_check(model, b, out, info, args.check, device, np.random.default_rng(7))
        r = subprocess.run(['node', str(REPO / 'scripts' / 'athena' / 'check-p2-export.mjs'), '--check', str(out),
                            '--out', str(args.weights) + '.export-check-result.json'], cwd=str(REPO))
        print(f'{n} decisions checked', flush=True)
        if r.returncode != 0:
            sys.exit(r.returncode)
    return info


# ------------------------------------------------------------------------------------------------- the smoke ---

def cmd_smoke(args):
    """The CPU round trip, one command, seconds of compute: a tiny net trained for two iterations, exported to a
    format v3 weight file, and that file carried through every reader that will judge a real run.

        python scripts/athena/p2_train.py smoke --out <dir>

    What it proves, in order, and what it prints:

    1. **the learner's wiring** -- act, store, GAE, PPO, the checkpoint, the export (never a number);
    2. **`lib/athena` reads the file.** `scripts/athena/check-p2-export.mjs` opens it with `parseWeights`, says which
       format `formatOf` calls it, and re-writes it with `serializeWeights` to check the bytes come back identical;
    3. **the heads agree with PyTorch** on `--check-decisions` real decisions of the games just played, at §8.3's bar:
       every head within the tolerance, the ask argmax identical, no belief probability off by more than 1e-4;
    4. **`decideNet` plays it.** The curve command of §9.6 -- `scripts/athena/p2-read.mjs curve` -- runs
       `--smoke-pairs` duplicate pairs against Monet v1.0 in geometry B and prints a win rate;
    5. **the null arm holds.** The same command with `--b athena:<the same file>` must read exactly 50.0000% with a
       paired set difference of 0 (§9.7's byte-exact control). The smoke fails if it does not.

    **One thing the smoke does to its own net.** It trains with `--init-decline-bias` on, so the games it plays hold
    asks, passes and rails; before the export it moves the declare head's decline bias the other way
    (`--export-decline-nudge`, 0 to export the trained net untouched). A read is all argmax, and a near-random policy
    that always declines never finishes an ATHENA-against-ATHENA game: every pair is dropped at the 6,000-move cap and
    the null arm has nothing to read. Declaring instead resolves a set at every offer and ends the game whatever the
    weights. That cap is a property of a near-random deterministic policy, not of the arm -- but the same will be true
    of a real run's first curve points, which is why `run_curve` now names a capped read as a fault instead of reading
    0 of 0 as 0%.

    The two embedding paths (`bag` and `counts`) are compared at the end. The smoke exits non-zero if any step fails,
    and writes `smoke-summary.json` beside the weights."""
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.perf_counter()
    ns = argparse.Namespace(**vars(args))
    ns.out, ns.arch, ns.cpu, ns.smoke = str(out), 'tiny', True, True
    ns.in_flight, ns.iteration_games, ns.minibatch_games, ns.iterations = args.in_flight, args.iteration_games, 2, 2
    ns.epochs, ns.amp, ns.curve_hours, ns.checkpoint_minutes = 2, 'off', -1.0, 0.0
    ns.env_threads, ns.service_workers = 2, 2
    ns.prefix = args.prefix
    ns.share_self, ns.share_v10, ns.share_v033 = (1.0, 0.0, 0.0) if args.no_service else (0.70, 0.20, 0.10)
    sink = {}
    summary = cmd_train(ns, sink)
    print(f'-- smoke: trained, {time.perf_counter() - t0:.1f}s', flush=True)
    if 'batch' not in sink:
        raise RuntimeError('the smoke trained no iteration')

    # the export, and the JavaScript check of it
    device = torch.device('cpu')
    ck = torch.load(out / 'latest.pt', map_location=device, weights_only=False)
    p = ck['config']['params']
    model = pm.P2Net(p['d'], p['width'], p['depth'], critic_width=p['critic_width'],
                     critic_depth=p['critic_depth']).to(device)
    model.load_state_dict(ck['model'])
    # The smoke trains with the decline nudge on (`--init-decline-bias`), so its games hold asks, passes and rails and
    # the export check has real ask rows to compare argmaxes on. It then moves the decline bias the other way before
    # the export, so that the read's argmax declares: a near-random policy that always declines never finishes an
    # ATHENA-against-ATHENA game, every pair is dropped at duplicate-pairs.mjs's 6,000-move cap, and the null arm has
    # nothing to read. Declaring at every offer resolves a set each time and ends the game in a few moves, whatever
    # the weights. One file is exported, checked and read.
    nudge = float(args.export_decline_nudge)
    if nudge:
        pm.nudge_decline_bias(model, nudge)
    weights = out / 'weights.bin'
    info = export(model, weights, {'smoke': True, 'what': 'a CPU smoke', 'arch': 'tiny',
                                   'export_decline_nudge': nudge},
                  fmt=args.weights_format, magic=args.weights_magic or None)
    print(f'-- smoke: exported {info["bytes"]} bytes, {info["params"]} weights, md5 {info["md5"]}'
          f'{f" (the trained net, decline bias {nudge:+g} so the read finishes its games)" if nudge else ""}',
          flush=True)

    b = sink['batch']
    n = write_export_check(model, b, out / 'export-check.json', info, args.check_decisions, device,
                           np.random.default_rng(7))
    print(f'-- smoke: wrote {n} decisions to export-check.json', flush=True)
    r = subprocess.run(['node', str(REPO / 'scripts' / 'athena' / 'check-p2-export.mjs'), '--check',
                        str(out / 'export-check.json'), '--out', str(out / 'export-check-result.json')],
                       cwd=str(REPO), capture_output=True, text=True)
    print(r.stdout + r.stderr, flush=True)
    export_check = json.loads((out / 'export-check-result.json').read_text()) \
        if (out / 'export-check-result.json').exists() else {'pass': False}

    # §9.6's curve command, and §9.7's null arm through the same command
    arm = f'athena:{Path(weights).as_posix()}'
    curve = run_curve(weights, out / 'curve-result.json', cmd=args.curve_cmd, bank=args.curve_bank,
                      pairs=args.smoke_pairs, opponent=CURVE_OPPONENT, threads=1)
    cwr = curve.get('win_rate')
    cwr_s = 'n/a (the arm gave no win rate)' if cwr is None else f'{100 * cwr:.4f}%'
    print(f'-- smoke: curve vs Monet {CURVE_OPPONENT}, {args.smoke_pairs} pairs: win rate {cwr_s}, '
          f'paired set-diff {curve.get("diffMean")}, {curve["games"] if "games" in curve else "?"} games, '
          f'{curve["secs"]}s', flush=True)
    null = run_curve(weights, out / 'null-result.json', cmd=args.curve_cmd, bank=args.curve_bank,
                     pairs=args.smoke_pairs, opponent=arm, threads=1)
    null_ok = (null.get('win_rate') == 0.5 and null.get('diffMean') == 0
               and int(null.get('games') or 0) == 2 * args.smoke_pairs and int(null.get('capped') or 0) == 0)
    print(f'-- smoke: null arm (--b {arm}): win rate {null.get("win_rate")}, paired set-diff {null.get("diffMean")}, '
          f'{null.get("games")} games, {null.get("capped")} capped -> {"HOLDS" if null_ok else "BROKEN"}', flush=True)

    # the two embedding paths agree
    m2 = pm.P2Net(p['d'], p['width'], p['depth'], critic_width=p['critic_width'], critic_depth=p['critic_depth'],
                  embed_mode='counts')
    m2.load_state_dict(model.state_dict())
    slots = torch.as_tensor(pm.event_slots(b['streams'][:256]))[None]
    with torch.no_grad():
        diff = float((model.embed_events(slots) - m2.embed_events(slots)).abs().max())
    print(f'-- smoke: embedding bag vs counts, max |diff| {diff:.3e}', flush=True)
    res = {'weights': info, 'decisions_checked': n, 'export_check': export_check, 'curve': curve, 'null_arm': null,
           'null_arm_holds': null_ok, 'embed_bag_vs_counts': diff, 'bridge_reveal': args.bridge_reveal,
           'stop': summary['stop'], 'secs': round(time.perf_counter() - t0, 1)}
    (out / 'smoke-summary.json').write_text(json.dumps(res, indent=1))
    ok = r.returncode == 0 and null_ok and curve.get('win_rate') is not None
    print(f'-- smoke: {res["secs"]}s total; stop={summary["stop"]}; {"PASS" if ok else "FAIL"}', flush=True)
    if not ok:
        sys.exit(r.returncode or 1)
    return res


# ---------------------------------------------------------------------------------------------------- the CLI ---

def add_train_args(p):
    p.add_argument('--out', required=True)
    p.add_argument('--prefix', default='athena-p2-run1-', help='training seeds are `<prefix><n>` (§9.5)')
    p.add_argument('--seed', default='athena-p2-run1', help='a label: the init, the draw order and the act stream')
    p.add_argument('--arch', default='M', choices=sorted(pm.ARCHS), help='§8.7 sized P2 at M')
    p.add_argument('--in-flight', type=int, default=IN_FLIGHT)
    p.add_argument('--iteration-games', type=int, default=ITERATION_GAMES)
    p.add_argument('--iterations', type=int, default=0, help='the total iterations, resumed ones included; 0: until a stop rule or an interrupt')
    p.add_argument('--epochs', type=int, default=EPOCHS)
    p.add_argument('--minibatch-games', type=int, default=MINIBATCH_GAMES)
    p.add_argument('--clip', type=float, default=CLIP)
    p.add_argument('--gamma', type=float, default=GAMMA)
    p.add_argument('--lam', type=float, default=LAM)
    p.add_argument('--lr', type=float, default=LR)
    p.add_argument('--grad-clip', type=float, default=GRAD_CLIP)
    p.add_argument('--entropy', type=float, default=ENTROPY)
    p.add_argument('--adv-norm', default='minibatch', choices=['minibatch', 'batch', 'off'],
                   help='not registered in §9.4; the standard PPO default is per minibatch')
    p.add_argument('--amp', default='bf16', choices=['bf16', 'off'])
    p.add_argument('--critic-width', type=int, default=pm.CRITIC_WIDTH)
    p.add_argument('--critic-depth', type=int, default=pm.CRITIC_DEPTH)
    p.add_argument('--embed-mode', default='bag', choices=['bag', 'counts'])
    p.add_argument('--init-decline-bias', type=float, default=0.0,
                   help='not registered: the amount added to the declare head decline bias at init (see p2_model)')
    p.add_argument('--share-self', type=float, default=pr.OPP_SHARES[pr.OPP_SELF])
    p.add_argument('--share-v10', type=float, default=pr.OPP_SHARES[pr.OPP_V10])
    p.add_argument('--share-v033', type=float, default=pr.OPP_SHARES[pr.OPP_V033])
    p.add_argument('--service-workers', type=int, default=4)
    p.add_argument('--env-threads', type=int, default=4)
    p.add_argument('--digest-check', default='off', choices=['off', 'd', 'full'],
                   help='compare the reference digests in opponent games; it slows every game')
    p.add_argument('--bridge-reveal', default=pr.REVEAL_REDUCED, choices=[pr.REVEAL_REDUCED, pr.REVEAL_FULL],
                   help='the reveal the opponent service is asked for in a bridge-regime game (§9.5). The default '
                        'stops the run unless the service acknowledges the reduced reveal; `full` takes the '
                        'full-reveal Monet deliberately')
    p.add_argument('--d2-views', default='', help='§8.3 D2 belief-views directories, comma separated')
    p.add_argument('--d2-cards-per-game', type=float, default=1200.0, help='sizes the D2 draw only; the 10%% weight is exact either way')
    p.add_argument('--d2-max-games', type=int, default=256)
    p.add_argument('--decision-cap', type=int, default=0)
    p.add_argument('--stream-table-cap', type=int, default=0)
    p.add_argument('--checkpoint-minutes', type=float, default=CHECKPOINT_MINUTES)
    p.add_argument('--curve-hours', type=float, default=CURVE_HOURS, help='<= 0 turns the curve off')
    p.add_argument('--curve-cmd', default=CURVE_CMD)
    p.add_argument('--curve-bank', default=CURVE_BANK)
    p.add_argument('--curve-pairs', type=int, default=CURVE_PAIRS)
    p.add_argument('--curve-threads', type=int, default=6)
    p.add_argument('--replay-check-cmd', default='', help='§9.5: run replay-check before and after the run')
    p.add_argument('--weights-format', default=pm.WEIGHTS_FORMAT)
    p.add_argument('--weights-magic', default='', help='the 8-byte magic; empty derives ATHENAW<n> from the format')
    p.add_argument('--athena-env', default=None, help=f'a P1 athena_env build (default ATHENA_ENV_PATH or {BENCH_ENV_DEFAULT})')
    p.add_argument('--resume', default=None)
    p.add_argument('--cpu', action='store_true')
    p.add_argument('--smoke', action='store_true')


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    add_train_args(sub.add_parser('train'))
    p = sub.add_parser('export')
    p.add_argument('--ckpt', required=True)
    p.add_argument('--weights', required=True)
    p.add_argument('--weights-format', default=pm.WEIGHTS_FORMAT)
    p.add_argument('--weights-magic', default='', help="the file's 8-byte magic; empty derives ATHENAW<n> from the format")
    p.add_argument('--check', type=int, default=0, help='decisions to verify against the JavaScript forward (0: none)')
    p.add_argument('--check-games', type=int, default=8, help='self-play games played to gather those decisions')
    p.add_argument('--athena-env', default=None, help='a P1 athena_env build (only needed with --check)')
    p = sub.add_parser('smoke')
    add_train_args(p)
    # `bridge_reveal='full'`: the smoke is wiring, not training, and the service on this branch has no reduced reveal
    # yet (§9.5). It prints the `!!!` line every time, and `--bridge-reveal reduced` puts the guard back.
    p.set_defaults(prefix='athena-p2-smoke-', in_flight=24, iteration_games=3, critic_width=64,
                   init_decline_bias=6.0, bridge_reveal=pr.REVEAL_FULL)
    p.add_argument('--no-service', action='store_true', help='self-play only (skips the Monet path)')
    p.add_argument('--check-decisions', type=int, default=300,
                   help='decisions the JavaScript forward is compared with PyTorch on (§8.3\'s bar)')
    p.add_argument('--smoke-pairs', type=int, default=2,
                   help='duplicate pairs the curve read and the null arm each play')
    p.add_argument('--export-decline-nudge', type=float, default=-12.0,
                   help='added to the declare head decline bias before the export, so the read\'s argmax declares '
                        'and its games finish; 0 exports the trained net untouched, whose self-play will then hit '
                        'the step cap (see cmd_smoke)')
    args = ap.parse_args(argv)
    return {'train': cmd_train, 'export': cmd_export, 'smoke': cmd_smoke}[args.cmd](args)


if __name__ == '__main__':
    main()
