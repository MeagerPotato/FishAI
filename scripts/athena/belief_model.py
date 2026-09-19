"""
belief_model.py: ATHENA P1's belief head in PyTorch (ATHENA.md §8.3), the network family of `lib/athena/net.ts`.

The model is net.ts's candidate network, parameter for parameter, so a trained head exports to G0d's weight format
(`athena-weights-1`) and runs under `lib/athena`'s deterministic JavaScript forward:

| part | PyTorch | net.ts tensor |
|---|---|---|
| event embedding | `embed` Linear(176, d) over the event's 21 one-hot slots | `embed.weight` [d, 176], `embed.bias` |
| recurrence | `gru` GRU(d, d), gates r, z, n (PyTorch's order, as net.ts's `foldEvent`) | `gru.weight_ih` [3d, d], `gru.weight_hh`, `gru.bias_ih`, `gru.bias_hh` |
| trunk | `depth` Linear + ReLU, the first over [h, the decision's 516 features] | `trunk.<i>.weight`, `trunk.<i>.bias` |
| heads | Linear(width, 517) | `heads.weight`, `heads.bias` |

Only the belief head's 324 outputs (card x relative seat) are trained here; the other heads are carried so the file
is G0d's format, and they stay at their initial values. The belief is each card's softmax over its candidate seats
(`net.ts` `beliefOf`), and the loss is the cross-entropy of the true holder over the unit cards.

Sizes (§3.1, net.ts `ARCHS`): S = GRU 256, trunk 2 x 512; M = 512, 3 x 1,024; L = 1,024, 4 x 2,048.
"""
import json
import struct

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

EVENT_F = 176
DEC_F = 516
HEADS = 517
N_ASK = 162
H_BELIEF = N_ASK + 10 + 18 + 2
ARCHS = {'S': (256, 512, 2), 'M': (512, 1024, 3), 'L': (1024, 2048, 4)}
WEIGHTS_FORMAT = 'athena-weights-1'
NLL_CLAMP = -float(np.log(1e-12))  # belief-baselines.mjs clamps p(true holder) at 1e-12


class BeliefNet(nn.Module):
    def __init__(self, d, width, depth):
        super().__init__()
        self.d, self.width, self.depth = d, width, depth
        self.embed = nn.Linear(EVENT_F, d)
        self.gru = nn.GRU(d, d, batch_first=True)
        self.trunk = nn.ModuleList([nn.Linear(d + DEC_F if i == 0 else width, width) for i in range(depth)])
        self.heads = nn.Linear(width, HEADS)

    @classmethod
    def of(cls, arch):
        return cls(*ARCHS[arch])

    def states(self, slots):
        """The recurrent state after each event: slots (S, L, 21) -> (S, L, d)."""
        x = F.embedding(slots, self.embed.weight.t()).sum(dim=-2) + self.embed.bias
        out, _ = self.gru(x)
        return out

    def forward(self, slots, ask_seq, ask_pos, dec):
        """The heads (A, 517) at each ask: the state after its `ask_pos` events (>= 1: game_started comes first)."""
        h = self.states(slots)[ask_seq, ask_pos - 1]
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

def tensor_layout(d, width, depth):
    """net.ts's `tensorLayout`: (name, shape) in blob order."""
    shapes = [('embed.weight', [d, EVENT_F]), ('embed.bias', [d]), ('gru.weight_ih', [3 * d, d]),
              ('gru.weight_hh', [3 * d, d]), ('gru.bias_ih', [3 * d]), ('gru.bias_hh', [3 * d])]
    for i in range(depth):
        shapes += [(f'trunk.{i}.weight', [width, d + DEC_F if i == 0 else width]), (f'trunk.{i}.bias', [width])]
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
    layout = tensor_layout(model.d, model.width, model.depth)
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
              'arch': {'d': model.d, 'width': model.width, 'depth': model.depth, 'eventF': EVENT_F, 'decF': DEC_F,
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
