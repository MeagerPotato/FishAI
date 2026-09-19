"""
belief_train.py: ATHENA P1's belief-head pipeline (ATHENA.md §8.3): prepare (a)'s views, train an arm as registered,
score it on the test populations for belief-baselines.mjs's paired bootstrap, and export it to G0d's weight format
with the registered agreement check against `lib/athena`'s deterministic JavaScript forward.

    python scripts/athena/belief_train.py prepare --games <games>/test --out <views>/a-test [--dedup] [--max-games N]
    python scripts/athena/belief_train.py train --arch M --train <views>/a-train[,<D2 dirs>] --val <views>/a-val \\
        --test a=<views>/a-test,b=<b views>,c=<c views> --out <run> [--seed athena-p1-B-M]
    python scripts/athena/belief_train.py eval --run <run> --views <dirs> --name a [--scaled]
    python scripts/athena/belief_train.py export --run <run> --views <views>/a-test [--cards 10000]

**Training, as registered:** the cross-entropy of the true holder over the unit cards; Adam at 3e-4; batches of 256
games; at most 20 epochs, stopping after 2 epochs without a better validation NLL; the epoch with the best validation
NLL is kept (`best.pt`), and the test populations are read once, after training, with that epoch. Training runs
under bf16 autocast on the GPU; every read (validation, test, export) is float32 with TF32 off, so the numbers read
are the ones the export check compares. The initial weights and the batch order follow `--seed` (a label, hashed).

**The reads** write, per test population, `<name>.clusters.tsv` in belief-baselines.mjs's cluster format (the belief
named `head`, or `scaled` for B-M-scaled), and `<name>.json` with the totals. `belief-baselines.mjs boot` joins it by
cluster key with the baselines' file and bootstraps the head, the marginal and their difference on the same
resamples; every shared cluster must hold the same number of unit cards.

**B-M-scaled** (`eval --scaled`): each decision's head table over its unit cards, rescaled by `scale_to_margins`
(marginal.ts's `scaleToMargins`, whose export this pipeline's check compares) to the unknown slots of each seat: the
seat's hand count less the cards the facts place there for certain.

**The export check** (`export`): decisions of the views are sampled (seed `athena-p1-export`) until 10,000 unit cards;
PyTorch's float32 beliefs are written beside each decision's inputs, and `scripts/athena/check-belief-export.mjs`
recomputes them with net.ts's forward and `beliefOf`. It passes when every card's argmax agrees and no probability
differs by more than 1e-4.

**Placeholder facts.** Views made with `facts: placeholder` (belief_data.py) are smoke data: a run over them is
labelled `smoke` in every output and is not a registered read.
"""
import argparse
import base64
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))
import belief_data as bd  # noqa: E402
import belief_model as bm  # noqa: E402

LR = 3e-4
BATCH_GAMES = 256
MAX_EPOCHS = 20
PATIENCE = 2


def seed_int(label):
    return int.from_bytes(hashlib.md5(label.encode()).digest()[:4], 'little')


def dirs_of(s):
    return [d for d in (s or '').split(',') if d]


class Batches(torch.utils.data.Dataset):
    """Batch i of a fixed list of game-id batches, built by a BeliefViews opened lazily (so loader workers can)."""

    def __init__(self, dirs, facts, batches):
        self.dirs, self.facts, self.batches = dirs, facts, batches
        self.views = None

    def __len__(self):
        return len(self.batches)

    def __getitem__(self, i):
        if self.views is None:
            self.views = bd.BeliefViews(self.dirs, self.facts)
        return self.views.batch(self.batches[i])


def loader(dirs, facts, batches, workers):
    return torch.utils.data.DataLoader(Batches(dirs, facts, batches), batch_size=None, shuffle=False,
                                       num_workers=workers, persistent_workers=False, pin_memory=True)


def game_batches(G, order=None):
    order = np.arange(G) if order is None else order
    return [order[i:i + BATCH_GAMES] for i in range(0, G, BATCH_GAMES)]


def exact_reads():
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False


@torch.no_grad()
def read(model, dirs, facts, device, workers=0, scaled=False):
    """Score the model over every unit card of the views: totals, and per-cluster sums keyed as the views' games are.
    With `scaled`, the head's table is rescaled to the unknown slots first (B-M-scaled)."""
    exact_reads()
    model.eval()
    views = bd.BeliefViews(dirs, facts)
    clusters = {}
    tot = {'n': 0, 'top1': 0.0, 'nll': 0.0}
    fallback = 0
    for b in loader(dirs, facts, game_batches(views.G), workers):
        t = bm.to_torch(b, device)
        heads = model(t['slots'], t['ask_seq'], t['ask_pos'], t['dec'])
        logp = bm.belief_logp(heads, t['mask'])
        if scaled:
            logp, fb = scaled_logp(logp, b, device)
            fallback += fb
        right, nll = bm.card_scores(logp, t['holder'], t['unit'], t['seat'])
        n_a = t['unit'].sum(dim=1).cpu().numpy()
        r_a = right.sum(dim=1).cpu().numpy()
        l_a = nll.double().sum(dim=1).cpu().numpy()
        for g, n, r, l in zip(b['cluster'], n_a, r_a, l_a):
            key = views.keys[int(g)]
            c = clusters.setdefault(key, [0, 0, 0.0])
            c[0] += int(n)
            c[1] += int(r)
            c[2] += float(l)
        tot['n'] += int(n_a.sum())
        tot['top1'] += float(r_a.sum())
        tot['nll'] += float(l_a.sum())
    out = {'cards': tot['n'], 'top1': tot['top1'] / max(1, tot['n']), 'nll': tot['nll'] / max(1, tot['n']),
           'clusters': len(clusters), 'games': views.G, 'facts_in_views': sorted(views.facts_in), 'facts': facts}
    if scaled:
        out['scaled_fallback_decisions'] = fallback
    return out, clusters


def scaled_logp(logp, b, device):
    """B-M-scaled: rescale each decision's head table over its unit cards to the unknown slots (scale_to_margins)."""
    p = logp.exp().double().cpu().numpy()  # (A, 54, 6), relative seats
    unit, mask, dec = (as_numpy(b[k]) for k in ('unit', 'mask', 'dec'))
    single = mask.sum(axis=2) == 1
    counts = dec[:, 54:60].astype(np.float64) * 9.0
    certain = np.einsum('ac,acr->ar', single.astype(np.float64), mask.astype(np.float64))
    need = np.maximum(0.0, np.rint(counts) - certain)
    n_unit = unit.sum(axis=1)
    ok = np.abs(need.sum(axis=1) - n_unit) < 0.5
    tables = np.where(unit[:, :, None], p, 0.0)
    good = np.flatnonzero(ok)
    if len(good):
        q, _, _ = bm.scale_to_margins(tables[good].copy(), need[good])
        tables[good] = q
    out = np.where(unit[:, :, None], tables, p)
    out = np.where(mask, out, 0.0)
    with np.errstate(divide='ignore'):
        lp = np.log(np.maximum(out, 0.0))
    return torch.as_tensor(lp, dtype=torch.float32, device=device), int((~ok).sum())


def as_numpy(x):
    """A loader's batch holds tensors (the DataLoader converts the numpy arrays); the views' own batches hold numpy."""
    return x.cpu().numpy() if torch.is_tensor(x) else np.asarray(x)


def write_clusters(path, clusters, belief, split='test'):
    lines = ['\t'.join(['split', 'key', 'n', f'{belief}.top1', f'{belief}.nll'])]
    for key, (n, r, l) in clusters.items():
        if n:
            lines.append(f'{split}\t{key}\t{n}\t{r}\t{float(l):.17g}')
    Path(path).write_text('\n'.join(lines) + '\n', newline='\n')  # LF on Windows too, as the scorer writes them


def smoke_label(dirs, facts):
    views_facts = set()
    for d in dirs:
        views_facts.add(json.loads((Path(d) / 'meta.json').read_text()).get('facts', 'buildKnowledge'))
    return facts == 'placeholder' or 'placeholder' in views_facts


# ------------------------------------------------------------------------------------------------ the commands ---

def cmd_prepare(args):
    sys.path.insert(0, str(Path(args.athena_env).resolve())) if args.athena_env else None
    import athena_env as ae
    t0 = time.perf_counter()
    meta = bd.replay_split(args.games, args.out, ae, facts=args.facts, batch=args.batch, threads=args.threads,
                           dedup=args.dedup, max_games=args.max_games)
    meta['secs'] = round(time.perf_counter() - t0, 1)
    (Path(args.out) / 'meta.json').write_text(json.dumps(meta, indent=1))
    print(json.dumps(meta))


def cmd_train(args):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    run = Path(args.out)
    run.mkdir(parents=True, exist_ok=True)
    train_dirs, val_dirs = dirs_of(args.train), dirs_of(args.val)
    smoke = smoke_label(train_dirs + val_dirs, args.facts)
    torch.manual_seed(seed_int(args.seed))
    rng = np.random.default_rng(seed_int(args.seed + ':order'))
    model = bm.BeliefNet.of(args.arch).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    train = bd.BeliefViews(train_dirs, args.facts)
    G = min(train.G, args.max_train_games) if args.max_train_games else train.G
    config = {'arch': args.arch, 'params': sum(p.numel() for p in model.parameters()), 'lr': LR,
              'batch_games': BATCH_GAMES, 'max_epochs': args.max_epochs, 'patience': PATIENCE, 'seed': args.seed,
              'train': train_dirs, 'train_games': G, 'val': val_dirs, 'facts': args.facts, 'smoke': smoke,
              'amp': args.amp, 'device': str(device), 'torch': torch.__version__, 'command': ' '.join(sys.argv)}
    (run / 'config.json').write_text(json.dumps(config, indent=1))
    print(json.dumps(config), flush=True)
    log = open(run / 'epochs.jsonl', 'a', encoding='utf-8')
    best, since, best_epoch = float('inf'), 0, 0
    t0 = time.perf_counter()
    for epoch in range(1, args.max_epochs + 1):
        te = time.perf_counter()
        model.train()
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        order = rng.permutation(G)
        loss_sum, n_sum, steps = 0.0, 0, 0
        for b in loader(train_dirs, args.facts, game_batches(G, order), args.workers):
            t = bm.to_torch(b, device)
            with torch.autocast(device.type, dtype=torch.bfloat16, enabled=args.amp == 'bf16' and device.type == 'cuda'):
                heads = model(t['slots'], t['ask_seq'], t['ask_pos'], t['dec'])
            logp = bm.belief_logp(heads, t['mask'])
            nll = -torch.gather(logp, 2, t['holder'][:, :, None]).squeeze(-1)
            unit = t['unit']
            n = int(unit.sum())
            loss = nll[unit].mean()
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            loss_sum += float(loss.detach()) * n
            n_sum += n
            steps += 1
        train_s = time.perf_counter() - te
        val, _ = read(model, val_dirs, args.facts, device, args.workers)
        rec = {'epoch': epoch, 'train_nll': loss_sum / max(1, n_sum), 'train_cards': n_sum, 'steps': steps,
               'val_nll': val['nll'], 'val_top1': val['top1'], 'val_cards': val['cards'],
               'train_s': round(train_s, 2), 'epoch_s': round(time.perf_counter() - te, 2),
               'games_per_s': round(G / train_s, 1)}
        if val['nll'] < best:
            best, since, best_epoch = val['nll'], 0, epoch
            torch.save(model.state_dict(), run / 'best.pt')
            rec['best'] = True
        else:
            since += 1
        log.write(json.dumps(rec) + '\n')
        log.flush()
        print(json.dumps(rec), flush=True)
        if since >= PATIENCE:
            break
    log.close()
    model.load_state_dict(torch.load(run / 'best.pt', map_location=device))
    summary = {'best_epoch': best_epoch, 'best_val_nll': best, 'epochs_run': epoch,
               'train_wall_s': round(time.perf_counter() - t0, 1), 'smoke': smoke, 'tests': {}}
    for spec in dirs_of(args.test):
        name, _, d = spec.partition('=')
        tdirs = d.split('+')
        res, clusters = read(model, tdirs, args.facts, device, args.workers)
        res['smoke'] = smoke
        write_clusters(run / f'test-{name}.clusters.tsv', clusters, 'head')
        (run / f'test-{name}.json').write_text(json.dumps(res, indent=1))
        summary['tests'][name] = res
        print(f'test {name}: {json.dumps(res)}', flush=True)
    (run / 'summary.json').write_text(json.dumps(summary, indent=1))


def load_run(run, device):
    cfg = json.loads((Path(run) / 'config.json').read_text())
    model = bm.BeliefNet.of(cfg['arch']).to(device)
    model.load_state_dict(torch.load(Path(run) / 'best.pt', map_location=device))
    return cfg, model


def cmd_eval(args):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    cfg, model = load_run(args.run, device)
    facts = args.facts or cfg['facts']
    dirs = dirs_of(args.views.replace('+', ','))
    belief = 'scaled' if args.scaled else 'head'
    res, clusters = read(model, dirs, facts, device, args.workers, scaled=args.scaled)
    res['smoke'] = smoke_label(dirs, facts) or cfg.get('smoke', False)
    write_clusters(Path(args.run) / f'{args.name}-{belief}.clusters.tsv', clusters, belief)
    (Path(args.run) / f'{args.name}-{belief}.json').write_text(json.dumps(res, indent=1))
    print(json.dumps(res))


def cmd_export(args):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    cfg, model = load_run(args.run, device)
    facts = args.facts or cfg['facts']
    run = Path(args.run)
    weights = run / 'weights.bin'
    data = bm.export_weights(model, weights, {'arm': cfg.get('seed'), 'arch': cfg['arch'], 'smoke': cfg.get('smoke'),
                                               'trained': 'scripts/athena/belief_train.py'})
    md5 = hashlib.md5(data).hexdigest()
    views = bd.BeliefViews(dirs_of(args.views.replace('+', ',')), facts)
    rng = np.random.default_rng(seed_int('athena-p1-export'))
    exact_reads()
    model.eval()
    items, cards = [], 0
    for g in rng.permutation(views.G):
        if cards >= args.cards:
            break
        b = views.batch([g])
        if not len(b['ask_seq']):
            continue
        t = bm.to_torch(b, device)
        with torch.no_grad():
            heads = model(t['slots'], t['ask_seq'], t['ask_pos'], t['dec'])
            p = bm.belief_logp(heads, t['mask']).exp().cpu().numpy()
        for a in rng.permutation(len(b['ask_seq'])):
            if cards >= args.cards:
                break
            unit = np.flatnonzero(b['unit'][a])[:args.cards - cards]
            if not len(unit):
                continue
            pos = int(b['ask_pos'][a])
            p_, lg = views._where(int(g))
            arr = p_['arr']
            s = int(b['seat'][a])
            off = int(arr['stream_off'][lg, s])
            ev = np.asarray(arr['streams'][off:off + pos])
            cands = b['mask'][a].astype(np.uint8).reshape(324)
            obs_i = views_obs(views, g, a)
            items.append({'game': int(g), 'seat': s, 'pos': pos, 'rows': base64.b64encode(ev.tobytes()).decode(),
                          'obs': base64.b64encode(obs_i.tobytes()).decode(),
                          'cands': base64.b64encode(cands.tobytes()).decode(),
                          'cards': unit.tolist(), 'p': [p[a, c].tolist() for c in unit]})
            cards += len(unit)
    check = run / 'export-check.json'
    check.write_text(json.dumps({'weights': str(weights), 'md5': md5, 'cards': cards, 'decisions': len(items),
                                 'items': items}))
    print(f'exported {weights} (md5 {md5}); {cards} cards over {len(items)} decisions -> {check}', flush=True)
    r = subprocess.run(['node', str(REPO / 'scripts' / 'athena' / 'check-belief-export.mjs'), '--check', str(check),
                        '--out', str(run / 'export-check-result.json')], cwd=str(REPO), capture_output=True, text=True)
    print(r.stdout + r.stderr)
    if r.returncode != 0:
        sys.exit(r.returncode)


def views_obs(views, g, a):
    p, lg = views._where(int(g))
    lo = p['ask_start'][lg]
    return np.asarray(p['arr']['ask_obs'][lo + a])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('prepare')
    p.add_argument('--games', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--facts', default='placeholder')
    p.add_argument('--dedup', action='store_true', help='keep one of each identical mirror pair')
    p.add_argument('--max-games', type=int, default=0)
    p.add_argument('--batch', type=int, default=2048)
    p.add_argument('--threads', type=int, default=2)
    p.add_argument('--athena-env', default=None)
    p = sub.add_parser('train')
    p.add_argument('--arch', required=True, choices=sorted(bm.ARCHS))
    p.add_argument('--train', required=True)
    p.add_argument('--val', required=True)
    p.add_argument('--test', default='', help='name=dir[+dir...],... read once with the best epoch')
    p.add_argument('--out', required=True)
    p.add_argument('--seed', default='athena-p1-belief')
    p.add_argument('--facts', default='file', choices=['file', 'placeholder'])
    p.add_argument('--max-epochs', type=int, default=MAX_EPOCHS)
    p.add_argument('--max-train-games', type=int, default=0)
    p.add_argument('--amp', default='bf16', choices=['bf16', 'off'])
    p.add_argument('--workers', type=int, default=0, help='data loader worker processes')
    p = sub.add_parser('eval')
    p.add_argument('--run', required=True)
    p.add_argument('--views', required=True)
    p.add_argument('--name', required=True)
    p.add_argument('--scaled', action='store_true')
    p.add_argument('--facts', default=None)
    p.add_argument('--workers', type=int, default=0)
    p = sub.add_parser('export')
    p.add_argument('--run', required=True)
    p.add_argument('--views', required=True)
    p.add_argument('--cards', type=int, default=10000)
    p.add_argument('--facts', default=None)
    args = ap.parse_args()
    {'prepare': cmd_prepare, 'train': cmd_train, 'eval': cmd_eval, 'export': cmd_export}[args.cmd](args)


if __name__ == '__main__':
    main()
