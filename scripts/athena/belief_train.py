"""
belief_train.py: ATHENA P1's belief-head pipeline (ATHENA.md §8.3): prepare (a)'s views, train an arm as registered,
score it on the test populations for belief-baselines.mjs's paired bootstrap, and export it to G0d's weight format
with the registered agreement check against `lib/athena`'s deterministic JavaScript forward.

    python scripts/athena/belief_train.py prepare --games <games>/test --out <views>/a-test --athena-env <P1 build> \\
        [--keep-mirrors] [--cluster game] [--max-games N]
    python scripts/athena/belief_train.py prepare --games <games>/train+<games>/train-ext --out <views>/a-train ...
    python scripts/athena/belief_train.py train --arch M --train <views>/a-train[,<D2 dirs>] --val <views>/a-val \\
        --test a=<views>/a-test,b=<b views joined by +>,c=<views>/c --out <run> --seed athena-p1-B-M
    python scripts/athena/belief_train.py eval --run <run> --views <dirs> --name a [--scaled]
    python scripts/athena/belief_train.py export --run <run> --views <views>/a-test [--cards 10000]
    python scripts/athena/belief_train.py fixture --views <dirs> --out tests/athena/data/facts-features.json

**The network** reads P1's decision features by default (`--dec-f 912`: net.ts's `decisionFeatures`, then its
`factsFeatures` over the facts row; `belief_data.py` mirrors both).

**Training, as registered:** the cross-entropy of the true holder over the unit cards; Adam at 3e-4; batches of 256
games; at most 20 epochs, stopping after 2 epochs without a better validation NLL; the epoch with the best validation
NLL is kept (`best.pt`; every epoch's weights are kept too, `epoch-NN.pt`), and the test populations are read once,
after training, with that epoch. Training runs under bf16 autocast on the GPU; every read (validation, test, export) is
float32 with TF32 off, so the numbers read are the ones the export check compares. The initial weights follow `--seed`
(a label, hashed), and epoch e's batch order is the permutation drawn from `<seed>:order:<e>`. `md5s.json` lists every
file of the run at its end.

**The reads** write, per test population, `test-<name>.clusters.tsv` in belief-baselines.mjs's cluster format (the
belief named `head`, or `scaled` for B-M-scaled), and `test-<name>.json` with the totals. `belief-baselines.mjs boot`
joins it by cluster key with the baselines' file and bootstraps the head, the marginal and their difference on the same
resamples; every shared cluster must hold the same number of unit cards.

**B-M-scaled** (`eval --scaled`): each decision's head table over its unit cards, rescaled by `scale_to_margins`
(marginal.ts's `scaleToMargins`) to the unknown slots of each seat: the seat's hand count less the cards the facts
place there for certain.

**The export check** (`export`): decisions of the views are sampled (seed `athena-p1-export`) until 10,000 unit cards;
PyTorch's float32 beliefs are written beside each decision's inputs (the facts row among them), and
`scripts/athena/check-belief-export.mjs` recomputes them with net.ts's forward and `beliefOf`. It passes when every
card's argmax agrees and no probability differs by more than 1e-4.

**Smoke runs.** A run is labelled `smoke` in every output, and is not a registered read, when it stops short of the
registered loop (`--max-epochs` below 20, or `--max-train-games`), or with `--smoke`.
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


def md5_file(p):
    h = hashlib.md5()
    with open(p, 'rb') as f:
        for blk in iter(lambda: f.read(1 << 20), b''):
            h.update(blk)
    return h.hexdigest()


class EpochBatches(torch.utils.data.Dataset):
    """Item `e * nb + b`: batch b of epoch e, 256 games of the epoch's order (the permutation drawn from
    `<seed>:order:<e>`, or the views' own order without a seed), built by a BeliefViews opened lazily in whichever
    process asks, so persistent loader workers serve every epoch."""

    def __init__(self, dirs, dec_f, G, seed=None):
        self.dirs, self.dec_f, self.G, self.seed = dirs, dec_f, G, seed
        self.nb = (G + BATCH_GAMES - 1) // BATCH_GAMES
        self.views, self.epoch, self.order = None, None, None

    def __len__(self):
        return self.nb

    def order_of(self, epoch):
        if self.seed is None:
            return np.arange(self.G)
        return np.random.default_rng(seed_int(f'{self.seed}:order:{epoch}')).permutation(self.G)

    def __getitem__(self, i):
        if self.views is None:
            self.views = bd.BeliefViews(self.dirs, self.dec_f)
        e, b = divmod(int(i), self.nb)
        if e != self.epoch:
            self.epoch, self.order = e, self.order_of(e)
        return self.views.batch(self.order[b * BATCH_GAMES:(b + 1) * BATCH_GAMES])


class EpochSampler(torch.utils.data.Sampler):
    def __init__(self, nb):
        self.nb, self.epoch = nb, 0

    def __len__(self):
        return self.nb

    def __iter__(self):
        return iter(range(self.epoch * self.nb, (self.epoch + 1) * self.nb))


def make_loader(dirs, dec_f, G, workers, seed=None):
    ds = EpochBatches(dirs, dec_f, G, seed)
    sampler = EpochSampler(ds.nb)
    dl = torch.utils.data.DataLoader(ds, batch_size=None, sampler=sampler, num_workers=workers,
                                     persistent_workers=workers > 0, pin_memory=True)
    return dl, sampler


def exact_reads():
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False


@torch.no_grad()
def read(model, dirs, device, workers=0, scaled=False, dl=None):
    """Score the model over every unit card of the views: totals, and per-cluster sums keyed as the views' games are.
    With `scaled`, the head's table is rescaled to the unknown slots first (B-M-scaled)."""
    exact_reads()
    model.eval()
    views = bd.BeliefViews(dirs, model.dec_f)
    if dl is None:
        dl, _ = make_loader(dirs, model.dec_f, views.G, workers)
    clusters = {}
    tot = {'n': 0, 'top1': 0.0, 'nll': 0.0}
    fallback = 0
    for b in dl:
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
        for g, n, r, l in zip(as_numpy(b['cluster']), n_a, r_a, l_a):
            key = views.keys[int(g)]
            c = clusters.setdefault(key, [0, 0, 0.0])
            c[0] += int(n)
            c[1] += int(r)
            c[2] += float(l)
        tot['n'] += int(n_a.sum())
        tot['top1'] += float(r_a.sum())
        tot['nll'] += float(l_a.sum())
    out = {'cards': tot['n'], 'top1': tot['top1'] / max(1, tot['n']), 'nll': tot['nll'] / max(1, tot['n']),
           'clusters': len(clusters), 'games': views.G, 'facts_in_views': sorted(views.facts_in), 'dec_f': model.dec_f}
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


def write_md5s(run):
    run = Path(run)
    files = sorted(p for p in run.iterdir() if p.is_file() and p.name != 'md5s.json')
    (run / 'md5s.json').write_text(json.dumps({p.name: {'md5': md5_file(p), 'bytes': p.stat().st_size}
                                               for p in files}, indent=1))


# ------------------------------------------------------------------------------------------------ the commands ---

def cmd_prepare(args):
    sys.path.insert(0, str(Path(args.athena_env).resolve())) if args.athena_env else None
    import athena_env as ae
    t0 = time.perf_counter()
    meta = bd.replay_split(args.games, args.out, ae, batch=args.batch, threads=args.threads,
                           dedup=not args.keep_mirrors, cluster=args.cluster, max_games=args.max_games)
    meta['secs'] = round(time.perf_counter() - t0, 1)
    pyd = next(Path(ae.__file__).parent.glob('athena_env*.pyd'), None) or next(Path(ae.__file__).parent.glob('*.so'), None)
    meta['athena_env_md5'] = md5_file(pyd) if pyd else None
    (Path(args.out) / 'meta.json').write_text(json.dumps(meta, indent=1))
    print(json.dumps(meta))


def cmd_train(args):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    if device.type == 'cuda' and args.gpu_mem_fraction:
        # Batches vary in shape (events per game, asks per batch), and the caching allocator's reserve grew past the
        # card during B-M (15.8 of 16.3 GB by epoch 11): under WDDM the driver then backs allocations with system
        # memory and a step ran 2-3x slower. With a cap the allocator frees its cache and retries instead; the
        # numbers are unchanged, since only where the tensors live changes.
        torch.cuda.set_per_process_memory_fraction(args.gpu_mem_fraction)
    run = Path(args.out)
    run.mkdir(parents=True, exist_ok=True)
    train_dirs, val_dirs = dirs_of(args.train), dirs_of(args.val)
    smoke = bool(args.smoke or args.max_epochs != MAX_EPOCHS or args.max_train_games)
    torch.manual_seed(seed_int(args.seed))
    model = bm.BeliefNet.of(args.arch, dec_f=args.dec_f).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    train = bd.BeliefViews(train_dirs, args.dec_f)
    G = min(train.G, args.max_train_games) if args.max_train_games else train.G
    val_G = bd.BeliefViews(val_dirs, args.dec_f).G
    config = {'arch': args.arch, 'dec_f': args.dec_f, 'params': sum(p.numel() for p in model.parameters()), 'lr': LR,
              'batch_games': BATCH_GAMES, 'max_epochs': args.max_epochs, 'patience': PATIENCE, 'seed': args.seed,
              'order': f'{args.seed}:order:<epoch>', 'train': train_dirs, 'train_games': G,
              'train_games_by_dir': [p['G'] for p in train.parts], 'val': val_dirs, 'val_games': val_G,
              'smoke': smoke, 'amp': args.amp, 'workers': args.workers, 'gpu_mem_fraction': args.gpu_mem_fraction,
              'device': str(device),
              'gpu': torch.cuda.get_device_name(0) if device.type == 'cuda' else None, 'torch': torch.__version__,
              'command': ' '.join(sys.argv)}
    (run / 'config.json').write_text(json.dumps(config, indent=1))
    print(json.dumps(config), flush=True)
    tdl, tsampler = make_loader(train_dirs, args.dec_f, G, args.workers, seed=args.seed)
    vdl, _ = make_loader(val_dirs, args.dec_f, val_G, args.workers)
    log = open(run / 'epochs.jsonl', 'a', encoding='utf-8')
    best, since, best_epoch = float('inf'), 0, 0
    t0 = time.perf_counter()
    gpu_total = 0.0
    for epoch in range(1, args.max_epochs + 1):
        te = time.perf_counter()
        model.train()
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        tsampler.epoch = epoch - 1
        loss_sum = torch.zeros((), dtype=torch.float64, device=device)
        n_sum, steps = 0, 0
        events = []
        for b in tdl:
            t = bm.to_torch(b, device)
            if device.type == 'cuda':
                e0 = torch.cuda.Event(enable_timing=True)
                e1 = torch.cuda.Event(enable_timing=True)
                e0.record()
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
            if device.type == 'cuda':
                e1.record()
                events.append((e0, e1))
            loss_sum += loss.detach().double() * n
            n_sum += n
            steps += 1
        if device.type == 'cuda':
            torch.cuda.synchronize()
        gpu_s = sum(a.elapsed_time(z) for a, z in events) / 1000
        gpu_total += gpu_s
        train_s = time.perf_counter() - te
        torch.save(model.state_dict(), run / f'epoch-{epoch:02d}.pt')
        tv = time.perf_counter()
        val, _ = read(model, val_dirs, device, dl=vdl)
        rec = {'epoch': epoch, 'train_nll': float(loss_sum) / max(1, n_sum), 'train_cards': n_sum, 'steps': steps,
               'val_nll': val['nll'], 'val_top1': val['top1'], 'val_cards': val['cards'],
               'train_s': round(train_s, 2), 'gpu_step_s': round(gpu_s, 2), 'val_s': round(time.perf_counter() - tv, 2),
               'epoch_s': round(time.perf_counter() - te, 2), 'games_per_s': round(G / train_s, 1)}
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
    train_wall = time.perf_counter() - t0
    model.load_state_dict(torch.load(run / 'best.pt', map_location=device))
    summary = {'best_epoch': best_epoch, 'best_val_nll': best, 'epochs_run': epoch, 'stopped_by': 'patience'
               if since >= PATIENCE else 'max_epochs', 'train_wall_s': round(train_wall, 1),
               'gpu_step_s': round(gpu_total, 1), 'smoke': smoke, 'tests': {}}
    for spec in dirs_of(args.test):
        name, _, d = spec.partition('=')
        tdirs = d.split('+')
        tt = time.perf_counter()
        res, clusters = read(model, tdirs, device, args.workers)
        res['smoke'] = smoke
        res['epoch'] = best_epoch
        res['secs'] = round(time.perf_counter() - tt, 1)
        write_clusters(run / f'test-{name}.clusters.tsv', clusters, 'head')
        (run / f'test-{name}.json').write_text(json.dumps(res, indent=1))
        summary['tests'][name] = res
        print(f'test {name}: {json.dumps(res)}', flush=True)
    summary['wall_s'] = round(time.perf_counter() - t0, 1)
    (run / 'summary.json').write_text(json.dumps(summary, indent=1))
    write_md5s(run)


def load_run(run, device):
    cfg = json.loads((Path(run) / 'config.json').read_text())
    model = bm.BeliefNet.of(cfg['arch'], dec_f=cfg.get('dec_f', bm.DEC_F)).to(device)
    model.load_state_dict(torch.load(Path(run) / 'best.pt', map_location=device))
    return cfg, model


def cmd_eval(args):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    cfg, model = load_run(args.run, device)
    dirs = dirs_of(args.views.replace('+', ','))
    belief = 'scaled' if args.scaled else 'head'
    tt = time.perf_counter()
    res, clusters = read(model, dirs, device, args.workers, scaled=args.scaled)
    res['smoke'] = cfg.get('smoke', False)
    res['secs'] = round(time.perf_counter() - tt, 1)
    write_clusters(Path(args.run) / f'{args.name}-{belief}.clusters.tsv', clusters, belief)
    (Path(args.run) / f'{args.name}-{belief}.json').write_text(json.dumps(res, indent=1))
    print(json.dumps(res))
    write_md5s(args.run)


def cmd_export(args):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    cfg, model = load_run(args.run, device)
    run = Path(args.run)
    weights = run / 'weights.bin'
    data = bm.export_weights(model, weights, {'arm': cfg.get('seed'), 'arch': cfg['arch'], 'smoke': cfg.get('smoke'),
                                               'trained': 'scripts/athena/belief_train.py'})
    md5 = hashlib.md5(data).hexdigest()
    views = bd.BeliefViews(dirs_of(args.views.replace('+', ',')), model.dec_f)
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
        p_, lg = views._where(int(g))
        arr = p_['arr']
        lo = p_['ask_start'][lg]
        for a in rng.permutation(len(b['ask_seq'])):
            if cards >= args.cards:
                break
            unit = np.flatnonzero(b['unit'][a])[:args.cards - cards]
            if not len(unit):
                continue
            pos = int(b['ask_pos'][a])
            s = int(b['seat'][a])
            off = int(arr['stream_off'][lg, s])
            ev = np.asarray(arr['streams'][off:off + pos])
            cands = b['mask'][a].astype(np.uint8).reshape(324)
            items.append({'game': int(g), 'seat': s, 'pos': pos, 'rows': base64.b64encode(ev.tobytes()).decode(),
                          'obs': base64.b64encode(np.asarray(arr['ask_obs'][lo + a]).tobytes()).decode(),
                          'facts': base64.b64encode(np.asarray(arr['ask_facts'][lo + a]).tobytes()).decode(),
                          'cands': base64.b64encode(cands.tobytes()).decode(),
                          'cards': unit.tolist(), 'p': [p[a, c].tolist() for c in unit]})
            cards += len(unit)
    check = run / 'export-check.json'
    check.write_text(json.dumps({'weights': str(weights), 'md5': md5, 'cards': cards, 'decisions': len(items),
                                 'items': items}))
    print(f'exported {weights} (md5 {md5}, decF {model.dec_f}); {cards} cards over {len(items)} decisions -> {check}',
          flush=True)
    r = subprocess.run(['node', str(REPO / 'scripts' / 'athena' / 'check-belief-export.mjs'), '--check', str(check),
                        '--out', str(run / 'export-check-result.json')], cwd=str(REPO), capture_output=True, text=True)
    print(r.stdout + r.stderr)
    write_md5s(run)
    if r.returncode != 0:
        sys.exit(r.returncode)


def cmd_fixture(args):
    """The factsFeatures fixture (tests/athena/belief-views.test.ts): facts rows sampled from the views, half the
    rows with the most constraints and half at random (seed `athena-p1-facts-fixture`), with facts_features' output
    as its nonzero entries."""
    rng = np.random.default_rng(seed_int('athena-p1-facts-fixture'))
    rows, sources = [], []
    for d in dirs_of(args.views):
        f = np.load(Path(d) / 'ask_facts.npy', mmap_mode='r')
        n = f[:, bd.F_NCONS]
        top = np.argsort(-n.astype(np.int64), kind='stable')[:args.rows // 2]
        rand = rng.choice(len(f), size=args.rows - len(top), replace=False)
        pick = np.concatenate([top, rand])
        rows.append(np.asarray(f[np.sort(pick)]))
        sources.append({'views': Path(d).name, 'rows': len(pick), 'max_constraints': int(n.max())})
    facts = np.concatenate(rows)
    # Synthetic rows for the rules no sampled row reaches (no view held two constraints on one (seat, set)): the
    # tightest constraint by popcount, a popcount tie to the smaller mask, and a resolved set's constraint ignored.
    syn = []
    for cons, resolved in (([(1, 2, 0b000111), (1, 2, 0b011000), (1, 2, 0b100001)], None),
                           ([(3, 4, 0b111111), (3, 4, 0b000011), (3, 4, 0b000101), (0, 0, 0b110000)], None),
                           ([(2, 5, 0b000101), (4, 5, 0b010000), (5, 8, 0b101010)], 5)):
        fr = facts[0].copy()
        fr[bd.F_CONS:] = bd.NONE
        fr[bd.F_NCONS] = len(cons)
        for i, (r, b, m) in enumerate(sorted(cons)):
            fr[bd.F_CONS + 3 * i:bd.F_CONS + 3 * i + 3] = (r, b, m)
        for b in range(bd.N_SETS):
            if fr[bd.F_SET_CERTAIN + b] == bd.NONE:
                fr[bd.F_SET_CERTAIN + b], fr[bd.F_SET_LOST + b] = 1, 0
        if resolved is not None:
            fr[bd.F_SET_CERTAIN + resolved] = fr[bd.F_SET_LOST + resolved] = bd.NONE
        syn.append(fr)
    facts = np.concatenate([facts, np.stack(syn)])
    sources.append({'views': 'synthetic', 'rows': len(syn)})
    feats = bd.facts_features(facts)
    out = {'what': 'belief_data.py facts_features over sampled facts rows; the nonzero entries [index, value]',
           'facts_f': bd.FACTS_F, 'sources': sources,
           'rows': [{'facts': base64.b64encode(fr.tobytes()).decode(),
                     'nz': [[int(i), float(x[i])] for i in np.flatnonzero(x)]} for fr, x in zip(facts, feats)]}
    Path(args.out).write_text(json.dumps(out, separators=(',', ':')) + '\n', newline='\n')
    print(f'fixture: {len(facts)} rows from {sources} -> {args.out}')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('prepare')
    p.add_argument('--games', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--keep-mirrors', action='store_true',
                   help='keep both copies of each identical mirror pair (default: one, §8.3 amendment)')
    p.add_argument('--cluster', default='deal', choices=['deal', 'game'], help='the bootstrap cluster (default: deal)')
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
    p.add_argument('--seed', required=True)
    p.add_argument('--dec-f', type=int, default=bm.DEC_F_FACTS, choices=[bm.DEC_F, bm.DEC_F_FACTS])
    p.add_argument('--max-epochs', type=int, default=MAX_EPOCHS)
    p.add_argument('--max-train-games', type=int, default=0)
    p.add_argument('--amp', default='bf16', choices=['bf16', 'off'])
    p.add_argument('--workers', type=int, default=2, help='data loader worker processes (persistent)')
    p.add_argument('--gpu-mem-fraction', type=float, default=0.7,
                   help='cap the CUDA caching allocator at this share of the card (0: no cap); see cmd_train')
    p.add_argument('--smoke', action='store_true', help='label the run a smoke')
    p = sub.add_parser('eval')
    p.add_argument('--run', required=True)
    p.add_argument('--views', required=True)
    p.add_argument('--name', required=True)
    p.add_argument('--scaled', action='store_true')
    p.add_argument('--workers', type=int, default=2)
    p = sub.add_parser('export')
    p.add_argument('--run', required=True)
    p.add_argument('--views', required=True)
    p.add_argument('--cards', type=int, default=10000)
    p = sub.add_parser('fixture')
    p.add_argument('--views', required=True)
    p.add_argument('--rows', type=int, default=100, help='rows per views directory')
    p.add_argument('--out', required=True)
    args = ap.parse_args()
    {'prepare': cmd_prepare, 'train': cmd_train, 'eval': cmd_eval, 'export': cmd_export,
     'fixture': cmd_fixture}[args.cmd](args)


if __name__ == '__main__':
    main()
