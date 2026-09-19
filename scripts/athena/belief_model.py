"""
belief_model.py: ATHENA P1's belief head in PyTorch (ATHENA.md §8.3), the network family of `lib/athena/net.ts`.

The model is net.ts's candidate network, parameter for parameter, so a trained head exports to G0d's weight format
(`athena-weights-1`) and runs under `lib/athena`'s deterministic JavaScript forward:

| part | PyTorch | net.ts tensor |
|---|---|---|
| event embedding | `embed` Linear(176, d) over the event's 21 one-hot slots | `embed.weight` [d, 176], `embed.bias` |
| recurrence | `gru` GRU(d, d), gates r, z, n (PyTorch's order, as net.ts's `foldEvent`) | `gru.weight_ih` [3d, d], `gru.weight_hh`, `gru.bias_ih`, `gru.bias_hh` |
| trunk | `depth` Linear + ReLU, the first over [h, the decision's `dec_f` features: 912 for P1's heads, 516 + the facts features] | `trunk.<i>.weight`, `trunk.<i>.bias` |
| heads | Linear(width, 517) | `heads.weight`, `heads.bias` |

Only the belief head's 324 outputs (card x relative seat) are trained here; the other heads are carried so the file
is G0d's format, and they stay at their initial values. The belief is each card's softmax over its candidate seats
(`net.ts` `beliefOf`), and the loss is the cross-entropy of the true holder over the unit cards.

Sizes (§3.1, net.ts `ARCHS`): S = GRU 256, trunk 2 x 512; M = 512, 3 x 1,024; L = 1,024, 4 x 2,048. The export writes
`arch.decF` = `dec_f` (net.ts accepts 516, G0d's stub, or 912, `DEC_F_FACTS`).
"""
import json
import struct

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

EVENT_F = 176
DEC_F = 516
DEC_F_FACTS = 912  # net.ts: DEC_F + FACTS_F
HEADS = 517
N_ASK = 162
H_BELIEF = N_ASK + 10 + 18 + 2
ARCHS = {'S': (256, 512, 2), 'M': (512, 1024, 3), 'L': (1024, 2048, 4)}
WEIGHTS_FORMAT = 'athena-weights-1'
NLL_CLAMP = -float(np.log(1e-12))  # belief-baselines.mjs clamps p(true holder) at 1e-12


class BeliefNet(nn.Module):
    def __init__(self, d, width, depth, dec_f=DEC_F_FACTS):
        super().__init__()
        if dec_f not in (DEC_F, DEC_F_FACTS):
            raise ValueError(f'dec_f {dec_f}: net.ts reads {DEC_F} or {DEC_F_FACTS}')
        self.d, self.width, self.depth, self.dec_f = d, width, depth, dec_f
        self.embed = nn.Linear(EVENT_F, d)
        self.gru = nn.GRU(d, d, batch_first=True)
        self.trunk = nn.ModuleList([nn.Linear(d + dec_f if i == 0 else width, width) for i in range(depth)])
        self.heads = nn.Linear(width, HEADS)

    @classmethod
    def of(cls, arch, dec_f=DEC_F_FACTS):
        return cls(*ARCHS[arch], dec_f=dec_f)

    def states(self, slots):
        """The recurrent state after each of 0..L events: slots (S, L, 21) -> (S, L + 1, d), position 0 the zero
        state (net.ts's fold starts from zeros, and nn.GRU's h0 is zeros).

        Each event's input is embed(one-hot counts): the sum of the weight columns its slots name, a slot named twice
        counted twice (net.ts's fold, quirk and all). The counts are built as an (S * L, 176) tensor and go through the
        Linear once; gathering the 21 columns per event instead materialises (S, L, 21, d), which ran the GPU out of
        memory at M's width."""
        S, L, K = slots.shape
        idx = slots.reshape(S * L, K).long()
        counts = torch.zeros(S * L, EVENT_F, device=slots.device, dtype=torch.float32)
        counts.scatter_add_(1, idx, torch.ones(S * L, K, device=slots.device, dtype=torch.float32))
        x = F.linear(counts, self.embed.weight, self.embed.bias).view(S, L, -1)
        out, _ = self.gru(x)
        return torch.cat([out.new_zeros(S, 1, out.shape[2]), out], dim=1)

    def forward(self, slots, ask_seq, ask_pos, dec):
        """The heads (A, 517) at each ask: the state after its `ask_pos` events. Under the start-seat rule a game's
        first decision has none (ask_pos 0), and folds nothing: the zero state, as `foldAll(net, rows, 0)`."""
        h = self.states(slots)[ask_seq, ask_pos]
        u = torch.cat([h, dec], dim=-1)
        for lin in self.trunk:
            u = F.relu(lin(u))
        return self.heads(u)


def belief_logp(heads, mask):
    """Log-probabilities (A, 54, 6) of each card's holder over its candidates (mask (A, 54, 6) bool), float32;
    a card with no candidate gets a harmless uniform row (never a unit)."""
    logits = heads[:, H_BELIEF:H_BELIEF + 324].float().view(-1, 54, 6)
    live = mask | ~mask.any(dim=-1, keepdim=True)
    return torch.log_softmax(logits.masked_fill(~live, float('-inf')), dim=-1)


def card_scores(logp, holder, unit, seat):
    """Per unit card: top-1 (the argmax over the candidates in ascending ABSOLUTE seat order, the first maximum winning,
    as belief-baselines.mjs takes the candidates) and the NLL of the true holder, clamped as the scorer clamps it."""
    A = logp.shape[0]
    rel_of_abs = (torch.arange(6, device=logp.device)[None, :] - seat[:, None]) % 6  # (A, 6): abs a -> rel
    lp_abs = torch.gather(logp, 2, rel_of_abs[:, None, :].expand(A, 54, 6))
    best_abs = torch.argmax(lp_abs, dim=-1)  # first maximum
    true_abs = (holder + seat[:, None]) % 6
    right = (best_abs == true_abs) & unit
    nll = (-torch.gather(logp, 2, holder[:, :, None]).squeeze(-1)).clamp(max=NLL_CLAMP)
    return right, torch.where(unit, nll, torch.zeros_like(nll))


def to_torch(b, device):
    return {k: torch.as_tensor(v, device=device) for k, v in b.items()}


# ------------------------------------------------------------------------------------------------ the export ---

def tensor_layout(d, width, depth, dec_f=DEC_F_FACTS):
    """net.ts's `tensorLayout`: (name, shape) in blob order."""
    shapes = [('embed.weight', [d, EVENT_F]), ('embed.bias', [d]), ('gru.weight_ih', [3 * d, d]),
              ('gru.weight_hh', [3 * d, d]), ('gru.bias_ih', [3 * d]), ('gru.bias_hh', [3 * d])]
    for i in range(depth):
        shapes += [(f'trunk.{i}.weight', [width, d + dec_f if i == 0 else width]), (f'trunk.{i}.bias', [width])]
    shapes += [('heads.weight', [HEADS, width]), ('heads.bias', [HEADS])]
    return shapes


def state_tensors(model):
    """The model's tensors under net.ts's names."""
    sd = model.state_dict()
    m = {'embed.weight': sd['embed.weight'], 'embed.bias': sd['embed.bias'],
         'gru.weight_ih': sd['gru.weight_ih_l0'], 'gru.weight_hh': sd['gru.weight_hh_l0'],
         'gru.bias_ih': sd['gru.bias_ih_l0'], 'gru.bias_hh': sd['gru.bias_hh_l0'],
         'heads.weight': sd['heads.weight'], 'heads.bias': sd['heads.bias']}
    for i in range(model.depth):
        m[f'trunk.{i}.weight'] = sd[f'trunk.{i}.weight']
        m[f'trunk.{i}.bias'] = sd[f'trunk.{i}.bias']
    return m


def export_weights(model, path, meta):
    """Write the model as an `athena-weights-1` file (net.ts `serializeWeights`'s layout); returns its bytes."""
    layout = tensor_layout(model.d, model.width, model.depth, model.dec_f)
    tensors = state_tensors(model)
    specs, blobs, off = [], [], 0
    for name, shape in layout:
        t = tensors[name].detach().to('cpu', torch.float32).contiguous()
        if list(t.shape) != shape:
            raise ValueError(f'{name}: shape {list(t.shape)}, net.ts expects {shape}')
        n = int(np.prod(shape))
        specs.append([name, shape, off, n])
        blobs.append(t.numpy().astype('<f4').reshape(-1))
        off += n
    header = {'format': WEIGHTS_FORMAT,
              'arch': {'d': model.d, 'width': model.width, 'depth': model.depth, 'eventF': EVENT_F, 'decF': model.dec_f,
                       'heads': HEADS},
              'params': off, 'tensors': specs, 'meta': meta}
    js = json.dumps(header, separators=(',', ':'))
    while (12 + len(js.encode('utf-8'))) % 4:
        js += ' '
    hb = js.encode('utf-8')
    data = b'ATHENAW1' + struct.pack('<I', len(hb)) + hb + np.concatenate(blobs).tobytes()
    with open(path, 'wb') as f:
        f.write(data)
    return data


# ------------------------------------------------------------------------------------ B-M-scaled's rescaling ---

def scale_to_margins(p, need, rounds=200, tol=1e-9):
    """marginal.ts's `scaleToMargins` over a batch of tables, float64: p (A, n, 6) with need (A, 6); alternate column
    then row scaling until the largest move in a round is below `tol` or `rounds` pass. Tables are independent; each
    stops on its own. In place; returns (p, rounds used, converged)."""
    A = p.shape[0]
    used = np.zeros(A, dtype=np.int64)
    done = np.zeros(A, dtype=bool)
    for _ in range(rounds):
        act = ~done
        if not act.any():
            break
        q = p[act]
        used[act] += 1
        before = q.copy()
        col = q.sum(axis=1)  # (a, 6)
        scale = np.where(col > 0, need[act] / np.where(col > 0, col, 1), 1.0)
        q *= scale[:, None, :]
        row = q.sum(axis=2)  # (a, n)
        q *= np.where(row > 0, 1 / np.where(row > 0, row, 1), 1.0)[:, :, None]
        moved = np.abs(q - before).max(axis=(1, 2)) if q.size else np.zeros(len(q))
        p[act] = q
        idx = np.flatnonzero(act)
        done[idx[moved < tol]] = True
    return p, used, done
