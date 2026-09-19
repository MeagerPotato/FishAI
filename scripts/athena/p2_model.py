"""
p2_model.py: ATHENA P2's network (ATHENA.md §9.2) in PyTorch, with the format v3 weight export.

The network is §9.2's, part for part, and it is the family of `lib/athena/net.ts` with two changes that §9.2 registers
for P2 ("The weight format is v3"):

| part | shape | v1/v2 (G0d's stub, P1's heads) | v3 (P2) |
|---|---|---|---|
| event embedding | the event row's active one-hot slots of 176 -> d, linear | folds 21 slots | folds **19**, the active ones |
| sequence encoder | a GRU of width d over the seat's public events | same | same |
| trunk | `depth` layers of `width`, ReLU, over [h, the decision's 912 features] | same | same |
| heads | one linear layer | 517 | **518**: the set-difference head is appended |
| critic | a `critic_width` MLP over [the trunk's output, the true deal's 324], training only | not in the family | **new** |

- **The 19 slots.** `net.ts`'s `eventSlots` writes exactly 19 entries (type, actor, target, card, hit, set, result, six
  assignment digits, six holders), but its fold adds 21 embedding columns, the two unwritten scratch entries staying 0,
  so every event also added column 0 twice. That was a reparametrisation of the embedding bias and cost nothing; §9.2
  fixes it for P2's new weights, and this module folds the 19.
- **The heads**, in order: ask 162, declare 10 (the nine sets, then decline), assignment 18 (six set positions x three
  teammates), pass 2, belief 324 (card x relative seat), value 1, set difference 1. Indices 0..516 are v1/v2's exactly,
  so a v3 file is a v2 file with one more head row.
- **The critic never reaches the weight file.** It is training only (§9.2, §1: "The actor never sees it"), and
  `tensor_layout` -- which is `net.ts`'s `tensorLayout` -- holds the actor's tensors alone.

Sizes are §3.1's (`net.ts` `ARCHS`): S = GRU 256, trunk 2 x 512; **M = 512, 3 x 1,024** (§8.7 sized P2 at M);
L = 1,024, 4 x 2,048. `tiny` is not one of them: it exists for the CPU smoke of `p2_train.py smoke` and is labelled a
smoke everywhere it is written.

This module imports torch and numpy only, never `athena_env`, so the trainer, the exporter and a test can load it
without the port.
"""
import json
import struct

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

# --- the event row and the decision features (athena-env/API.md §5; net.ts) ---
EVENT_LEN = 19
EVENT_F = 176
EVENT_SLOTS = 19  # v3: the active slots, and only those (v1/v2 folded 21)
OBS_LEN = 95
FACTS_LEN = 278
LEGAL_LEN = 174
CRITIC_LEN = 54
DEC_F = 516
N_SETS = 9
FACTS_F = 6 * N_SETS * 7 + 2 * N_SETS  # 396
DEC_F_FACTS = DEC_F + FACTS_F  # 912
NONE = 255

# --- the legal row (API.md §5.1) ---
L_ASK, L_DECLARE, L_DECLINE, L_PASS = 0, 162, 171, 172

# --- the action codes (API.md §4) ---
N_ASK = 162
A_DECLINE = 162
A_PASS = 163
A_DECLARE = 165
N_ASSIGN = 729

# --- the heads (§9.2) ---
N_DECLARE_OUT = 10  # the nine sets, then decline
DECLINE_SLOT = 9
N_ASSIGN_OUT = 18  # six set positions x three teammates
N_PASS_OUT = 2
N_BELIEF = 324
HEADS = 518
H_ASK = 0
H_DECLARE = H_ASK + N_ASK  # 162
H_ASSIGN = H_DECLARE + N_DECLARE_OUT  # 172
H_PASS = H_ASSIGN + N_ASSIGN_OUT  # 190
H_BELIEF = H_PASS + N_PASS_OUT  # 192
H_VALUE = H_BELIEF + N_BELIEF  # 516
H_SETDIFF = H_VALUE + 1  # 517

# --- the critic (§9.2: "a 1,024-wide MLP over the trunk's output and the true deal (324)") ---
CRITIC_IN = 324
CRITIC_WIDTH = 1024
CRITIC_DEPTH = 1  # hidden layers; see the note in `P2Net` on why one

ARCHS = {'S': (256, 512, 2), 'M': (512, 1024, 3), 'L': (1024, 2048, 4), 'tiny': (32, 64, 2)}
SMOKE_ARCHS = ('tiny',)

# The container is `net.ts`'s, and there is only one: `serializeWeights` writes `athena-weights-1` behind the magic
# `ATHENAW1` at every format, and `parseWeights` tells v1, v2 and v3 apart by (`arch.decF`, `arch.heads`) alone
# (net.ts `WEIGHT_FORMATS`). v3 is decF 912 with heads 518, which is what `export_weights` writes.
WEIGHTS_FORMAT = 'athena-weights-1'
WEIGHTS_MAGIC = b'ATHENAW1'

# A masked logit. A finite value, not -inf: a non-unit card whose stored holder is not one of its candidates would
# otherwise gather -inf, and inf * 0 is NaN. exp(-1e9 - max) underflows to 0, so every live entry is exactly what
# -inf would have given it.
MASK_LOGIT = -1e9

# --- the decision kinds (exactly one is open at a time, API.md §5.1) ---
KIND_ASK, KIND_WINDOW, KIND_PASS, KIND_NONE = 0, 1, 2, 255


# ------------------------------------------------------------------------------------------------- the network ---

class P2Net(nn.Module):
    """§9.2's network. `critic_depth` hidden layers of `critic_width` sit between [the trunk's output, the deal's 324]
    and the critic's scalar.

    **`critic_depth = 1` is a choice §9.2 leaves open.** It says "a 1,024-wide MLP" without a layer count. One hidden
    layer puts the whole model at 7,138,311 weights at M, which is §9.2's "about 7 million"; two puts it at 8,187,911,
    which is not. The actor is 5,755,910 of it either way.
    """

    def __init__(self, d, width, depth, dec_f=DEC_F_FACTS, critic_width=CRITIC_WIDTH, critic_depth=CRITIC_DEPTH,
                 embed_mode='bag'):
        super().__init__()
        if dec_f != DEC_F_FACTS:
            raise ValueError(f'dec_f {dec_f}: P2 reads {DEC_F_FACTS} (§9.1: G0d\'s 516 plus the facts features)')
        if embed_mode not in ('bag', 'counts'):
            raise ValueError(f'embed_mode {embed_mode}: bag or counts')
        self.d, self.width, self.depth, self.dec_f = d, width, depth, dec_f
        self.critic_width, self.critic_depth, self.embed_mode = critic_width, critic_depth, embed_mode
        self.embed = nn.Linear(EVENT_F, d)
        self.gru = nn.GRU(d, d, batch_first=True)
        self.trunk = nn.ModuleList([nn.Linear(d + dec_f if i == 0 else width, width) for i in range(depth)])
        self.heads = nn.Linear(width, HEADS)
        cl, n_in = [], width + CRITIC_IN
        for _ in range(critic_depth):
            cl += [nn.Linear(n_in, critic_width), nn.ReLU()]
            n_in = critic_width
        cl.append(nn.Linear(n_in, 1))
        self.critic = nn.Sequential(*cl)

    @classmethod
    def of(cls, arch, **kw):
        if arch not in ARCHS:
            raise ValueError(f'arch {arch}: one of {sorted(ARCHS)}')
        d, width, depth = ARCHS[arch]
        return cls(d, width, depth, **kw)

    # -- the event fold --

    def embed_events(self, slots):
        """The embedding of events whose active slots are `slots` (..., 19) int64: the sum of the 19 named columns of
        `embed.weight`, plus the bias. The 19 slots lie in disjoint ranges, so no column is named twice.

        `bag` sums the columns with `embedding_bag`; `counts` builds the (N, 176) one-hot matrix and puts it through
        the Linear, which is `belief_model.py`'s path. They agree to float rounding, and `p2_train.py smoke` prints the
        largest difference between them."""
        flat = slots.reshape(-1, slots.shape[-1]).long()
        if self.embed_mode == 'bag':
            x = F.embedding_bag(flat, self.embed.weight.t().contiguous(), mode='sum') + self.embed.bias
        else:
            counts = torch.zeros(flat.shape[0], EVENT_F, device=slots.device, dtype=self.embed.weight.dtype)
            counts.scatter_add_(1, flat, torch.ones_like(counts[:, :flat.shape[1]]))
            x = F.linear(counts, self.embed.weight, self.embed.bias)
        return x.view(*slots.shape[:-1], self.d)

    def states(self, slots):
        """The recurrent state after each of 0..L events: slots (S, L, 19) -> (S, L + 1, d), position 0 the zero state
        (net.ts's fold starts from zeros, and nn.GRU's h0 is zeros). Position p is the state that folds the first p
        rows, which is what a decision's `pos` names."""
        S, L = slots.shape[0], slots.shape[1]
        x = self.embed_events(slots).view(S, L, self.d)
        out, _ = self.gru(x)
        return torch.cat([out.new_zeros(S, 1, out.shape[2]), out], dim=1)

    def fold(self, slots, h):
        """One event a row, for the acting loop: slots (N, 19) and the states (N, d) -> the states after the event."""
        x = self.embed_events(slots).view(-1, 1, self.d)
        _, hn = self.gru(x, h.unsqueeze(0).contiguous())
        return hn[0]

    # -- the trunk and the heads --

    def trunk_of(self, h, dec):
        u = torch.cat([h, dec], dim=-1)
        for lin in self.trunk:
            u = F.relu(lin(u))
        return u

    def heads_of(self, u):
        return self.heads(u)

    def critic_of(self, u, deal):
        """The perfect-information critic: `deal` is the true deal one-hot (A, 324), from `deal_one_hot`."""
        return self.critic(torch.cat([u, deal], dim=-1)).squeeze(-1)

    def forward(self, slots, ask_seq, ask_pos, dec, deal=None):
        """The heads at each decision (A, 518), and the critic (A,) when `deal` is given. `ask_seq` names each
        decision's sequence among the (game, seat) sequences of `slots`, and `ask_pos` how many of its rows the
        decision folds."""
        h = self.states(slots)[ask_seq, ask_pos]
        u = self.trunk_of(h, dec)
        heads = self.heads_of(u)
        return (heads, self.critic_of(u, deal)) if deal is not None else heads

    # -- sizes --

    def actor_params(self):
        return sum(p.numel() for n, p in self.named_parameters() if not n.startswith('critic.'))

    def critic_params(self):
        return sum(p.numel() for n, p in self.named_parameters() if n.startswith('critic.'))

    def param_report(self):
        a, c = self.actor_params(), self.critic_params()
        return {'d': self.d, 'width': self.width, 'depth': self.depth, 'dec_f': self.dec_f, 'heads': HEADS,
                'event_slots': EVENT_SLOTS, 'critic_width': self.critic_width, 'critic_depth': self.critic_depth,
                'actor_params': a, 'critic_params': c, 'params': a + c,
                'exported_params': param_count(self.d, self.width, self.depth, self.dec_f)}


def nudge_decline_bias(model, b):
    """Add `b` to the declare head's decline bias, and nothing else.

    **Not registered.** §9.2 and §9.4 fix no initialisation, so the default everywhere is PyTorch's, with b = 0. It is
    offered because at PyTorch's init the declare head is near uniform over its ten outputs, so a fresh policy declares
    about nine window offers in ten; every such declare is a wrong speculative claim, the game clinches after five, and
    the first games last about five decisions and hold no ask at all. PPO corrects this within a few thousand games --
    declaring at random always loses -- but a run (or a smoke) that wants the ask, pass and rail paths exercised from
    the first game can nudge the bias instead. Whatever is used is exported in the weight file like any other bias."""
    with torch.no_grad():
        model.heads.bias[H_DECLARE + DECLINE_SLOT] += float(b)
    return model


def deal_one_hot(critic_bytes):
    """API.md §5.4: the critic buffer (A, 54) uint8 holds each card's holder relative to the observer, NONE once the
    card is out of play. `F.one_hot(clamp(max=6), 7)[..., :6]` expands it, so an out-of-play card is all zero."""
    return F.one_hot(critic_bytes.long().clamp(max=6), 7)[..., :6].reshape(critic_bytes.shape[0], CRITIC_IN).float()


# -------------------------------------------------------------------------------------- the features (net.ts) ---

def event_slots(rows):
    """net.ts's `eventSlots` over rows (N, 19) uint8 -> (N, 19) int64, the active slots and only those (v3's fold).

    `belief_data.event_slots` is the same function with v1/v2's two trailing zeros; the first 19 columns are these."""
    rows = np.asarray(rows)
    t = rows[:, 0].astype(np.int64)
    if (t > 5).any():
        raise ValueError('an event type is out of range')

    def slot(v, n, what):
        v = v.astype(np.int64)
        if ((v != NONE) & (v >= n - 1)).any():
            raise ValueError(f'event byte {what} is out of range')
        return np.where(v == NONE, n - 1, v)

    cols = [t, 6 + slot(rows[:, 1], 7, 'actor'), 13 + slot(rows[:, 2], 7, 'target'), 20 + slot(rows[:, 3], 55, 'card'),
            75 + slot(rows[:, 4], 3, 'hit'), 78 + slot(rows[:, 5], 10, 'set'), 88 + slot(rows[:, 6], 4, 'result')]
    cols += [92 + 7 * j + slot(rows[:, 7 + j], 7, 'assign') for j in range(6)]
    cols += [134 + 7 * j + slot(rows[:, 13 + j], 7, 'holder') for j in range(6)]
    return np.stack(cols, axis=1)


def event_slots_torch(rows):
    """`event_slots` on a device: rows (..., 19) uint8 tensor -> (..., 19) int64. The acting loop calls this every
    step, so the event rows never leave the device they were copied to."""
    r = rows.long()

    def slot(v, n):
        return torch.where(v == NONE, torch.full_like(v, n - 1), v)

    cols = [r[..., 0], 6 + slot(r[..., 1], 7), 13 + slot(r[..., 2], 7), 20 + slot(r[..., 3], 55),
            75 + slot(r[..., 4], 3), 78 + slot(r[..., 5], 10), 88 + slot(r[..., 6], 4)]
    cols += [92 + 7 * j + slot(r[..., 7 + j], 7) for j in range(6)]
    cols += [134 + 7 * j + slot(r[..., 13 + j], 7) for j in range(6)]
    return torch.stack(cols, dim=-1)


# The obs row's fields (API.md §5.2) and the facts row's (§5.5), as the feature builders read them.
O_HAND, O_COUNTS, O_PHASE, O_TURN, O_WINDOW, O_OPTION, O_DECLINED, O_SCORE, O_SETS, O_REGIME = \
    0, 54, 60, 61, 62, 63, 64, 65, 67, 94
SET_FIELDS = 3
F_CAND, F_UNKNOWN, F_SET_CERTAIN, F_SET_LOST, F_RAIL, F_RAIL_ASSIGN, F_NCONS, F_CONS = 0, 54, 60, 69, 78, 79, 85, 86
CONS_FIELDS, MAX_CONS = 3, 64


def decision_features_torch(obs, facts, out=None):
    """net.ts's `decisionFeatures` then its `factsFeatures`, on a device: obs (A, 95) and facts (A, 278) uint8 tensors
    -> float32 (A, 912). `belief_data.decision_features` and `belief_data.facts_features` are the same two functions in
    numpy, and `tests/athena/belief-views.test.ts` pins the second against net.ts."""
    A = obs.shape[0]
    dev = obs.device
    o = obs.long()
    out = torch.zeros(A, DEC_F_FACTS, device=dev, dtype=torch.float32) if out is None else out.zero_()
    ar = torch.arange(A, device=dev)
    out[:, 0:54] = o[:, O_HAND:O_HAND + 54].float()
    out[:, 54:60] = o[:, O_COUNTS:O_COUNTS + 6].float() / 9.0

    def one(base, v, n):
        ok = (v != NONE) & (v < n)
        out[ar[ok], base + v[ok]] = 1.0

    one(60, o[:, O_PHASE], 3)
    one(63, o[:, O_TURN], 6)
    out[:, 69] = o[:, O_WINDOW].float()
    one(70, o[:, O_OPTION], 6)
    one(76, o[:, O_DECLINED], 6)
    out[:, 82] = o[:, O_SCORE].float() / 9.0
    out[:, 83] = o[:, O_SCORE + 1].float() / 9.0
    for b in range(9):
        p = O_SETS + SET_FIELDS * b
        base = 84 + 12 * b
        one(base, o[:, p], 3)
        one(base + 3, o[:, p + 1], 6)
        one(base + 9, o[:, p + 2], 3)
    fl = facts.long()
    six = torch.arange(6, device=dev)
    bits = (fl[:, F_CAND:F_CAND + 54, None] >> six) & 1
    out[:, 192:DEC_F] = bits.reshape(A, 324).float()
    # the facts features: the tightest constraint of each (relative seat, set), then each set's certain count and lost flag
    n = fl[:, F_NCONS]
    if bool((n > MAX_CONS).any()):
        raise ValueError(f'a facts row holds more than MAX_CONS = {MAX_CONS} constraints')
    cons = fl[:, F_CONS:F_CONS + MAX_CONS * CONS_FIELDS].reshape(A, MAX_CONS, CONS_FIELDS)
    r, b, m = cons[..., 0], cons[..., 1], cons[..., 2]
    live = torch.arange(MAX_CONS, device=dev)[None, :] < n[:, None]
    certain = fl[:, F_SET_CERTAIN:F_SET_CERTAIN + N_SETS]
    zero_b = torch.zeros_like(b)
    live = live & (torch.gather(certain, 1, torch.where(live, b, zero_b)) != NONE)
    pop = sum((m >> k) & 1 for k in range(6))
    big = 1 << 20
    key = torch.where(live, pop * 64 + m, torch.full_like(m, big))  # smaller is tighter: popcount first, then the mask
    slot = torch.where(live, N_SETS * r + b, zero_b)
    best = torch.full((A, 6 * N_SETS), big, device=dev, dtype=torch.long)
    best.scatter_reduce_(1, slot, key, reduce='amin')
    has = best < big
    mask = torch.where(has, best % 64, torch.zeros_like(best))
    feats = torch.zeros(A, 6 * N_SETS, 7, device=dev, dtype=torch.float32)
    feats[..., 0] = has.float()
    feats[..., 1:] = (((mask[..., None] >> six) & 1) * has[..., None]).float()
    out[:, DEC_F:DEC_F + 7 * 6 * N_SETS] = feats.reshape(A, -1)
    lost = fl[:, F_SET_LOST:F_SET_LOST + N_SETS]
    open_ = certain != NONE
    base = DEC_F + 7 * 6 * N_SETS
    zeros = torch.zeros(A, N_SETS, device=dev, dtype=torch.float32)
    out[:, base:base + 2 * N_SETS:2] = torch.where(open_, certain.float() / 6.0, zeros)
    out[:, base + 1:base + 2 * N_SETS:2] = torch.where(open_ & (lost != NONE), lost.float(), zeros)
    return out


# ------------------------------------------------------------------------------------------ the action space ---

def legal_masks(legal):
    """The three masks of the legal row (A, 174) uint8 tensor: asks (A, 162), the declare head's ten (A, 10: the nine
    sets, then decline) and the passes (A, 2)."""
    ask = legal[:, L_ASK:L_ASK + N_ASK] != 0
    dec = torch.cat([legal[:, L_DECLARE:L_DECLARE + N_SETS], legal[:, L_DECLINE:L_DECLINE + 1]], dim=1) != 0
    pas = legal[:, L_PASS:L_PASS + 2] != 0
    return ask, dec, pas


def kind_of(legal):
    """Which decision the legal row opens (API.md §5.1: exactly one kind at a time): KIND_ASK, KIND_WINDOW, KIND_PASS,
    or KIND_NONE for a finished game's all-zero row. numpy, over (A, 174) uint8."""
    legal = np.asarray(legal)
    ask = legal[:, L_ASK:L_ASK + N_ASK].any(axis=1)
    win = legal[:, L_DECLARE:L_DECLARE + N_SETS].any(axis=1) | (legal[:, L_DECLINE] != 0)
    pas = legal[:, L_PASS:L_PASS + 2].any(axis=1)
    out = np.full(len(legal), KIND_NONE, dtype=np.uint8)
    out[pas] = KIND_PASS
    out[win] = KIND_WINDOW
    out[ask] = KIND_ASK
    return out


def assign_digits(a):
    """The assignment code a (0..728) as its six base-3 digits d_j (API.md §4: card j of the set is stated at teammate
    rel 2 d_j, and a = sum_j d_j 3^j). numpy, over any shape -> (..., 6) uint8."""
    a = np.asarray(a, dtype=np.int64)
    return np.stack([(a // 3 ** j) % 3 for j in range(6)], axis=-1).astype(np.uint8)


def assign_code(d):
    """The inverse of `assign_digits`: digits (..., 6) -> the assignment code."""
    d = np.asarray(d, dtype=np.int64)
    return sum(d[..., j] * 3 ** j for j in range(6))


def action_code(kind, idx, digits):
    """The port's action code (API.md §4) of a decision: for KIND_ASK the ask code, for KIND_PASS A_PASS + idx, and for
    KIND_WINDOW either A_DECLINE (idx == DECLINE_SLOT) or A_DECLARE + set * 729 + the assignment. numpy."""
    kind, idx = np.asarray(kind), np.asarray(idx, dtype=np.int64)
    code = np.where(kind == KIND_ASK, idx, 0)
    code = np.where(kind == KIND_PASS, A_PASS + idx, code)
    win = kind == KIND_WINDOW
    declare = win & (idx != DECLINE_SLOT)
    code = np.where(win, A_DECLINE, code)
    if declare.any():
        code = np.where(declare, A_DECLARE + idx * N_ASSIGN + assign_code(digits), code)
    return code.astype(np.int32)


def _safe_log_softmax(logits, mask):
    """log_softmax over the masked entries; a row with no legal entry gets a harmless uniform row. Such a row is never
    a decision -- the port's legal row always opens at least one action in a running game -- but the batch holds rows
    of the other two kinds, whose masks here are empty."""
    live = mask | ~mask.any(dim=-1, keepdim=True)
    return torch.log_softmax(logits.float().masked_fill(~live, MASK_LOGIT), dim=-1)


def policy_dists(heads, legal):
    """The masked log-probability tables of a batch of decisions: asks (A, 162), the declare head's ten (A, 10), the
    passes (A, 2) and the assignment's six three-way draws (A, 6, 3). Computed in float32, whatever the heads' dtype."""
    ask_m, dec_m, pass_m = legal_masks(legal)
    lp_ask = _safe_log_softmax(heads[:, H_ASK:H_ASK + N_ASK], ask_m)
    lp_dec = _safe_log_softmax(heads[:, H_DECLARE:H_DECLARE + N_DECLARE_OUT], dec_m)
    lp_pass = _safe_log_softmax(heads[:, H_PASS:H_PASS + N_PASS_OUT], pass_m)
    lp_asn = torch.log_softmax(heads[:, H_ASSIGN:H_ASSIGN + N_ASSIGN_OUT].float().view(-1, 6, 3), dim=-1)
    return lp_ask, lp_dec, lp_pass, lp_asn


def _gather_logp(lp_ask, lp_dec, lp_pass, lp_asn, kind, idx, digits):
    i = idx.long().clamp(min=0)
    g_ask = lp_ask.gather(1, i.clamp(max=N_ASK - 1)[:, None]).squeeze(1)
    g_dec = lp_dec.gather(1, i.clamp(max=N_DECLARE_OUT - 1)[:, None]).squeeze(1)
    g_pass = lp_pass.gather(1, i.clamp(max=N_PASS_OUT - 1)[:, None]).squeeze(1)
    g_asn = lp_asn.gather(2, digits.long().clamp(0, 2)[:, :, None]).squeeze(2).sum(dim=1)
    declared = (kind == KIND_WINDOW) & (idx != DECLINE_SLOT)
    win = g_dec + torch.where(declared, g_asn, torch.zeros_like(g_asn))
    return torch.where(kind == KIND_ASK, g_ask, torch.where(kind == KIND_PASS, g_pass, win))


def action_logp(heads, legal, kind, idx, digits):
    """The log-probability of each decision's action and the entropy of its distribution.

    §9.3: "A declare is two draws: the set from the declare head, then the assignment from the assignment head. The PPO
    ratio carries both." So a declare's log-probability is the set's plus the six assignment digits', and a window's
    entropy is H(declare) + P(a set) * sum_j H(assign_j) -- exact, because this architecture's assignment head does not
    depend on which set was drawn.

    `kind` (A,) is KIND_ASK/KIND_WINDOW/KIND_PASS, `idx` (A,) the ask code, the declare slot (0..9, 9 decline) or the
    pass index, and `digits` (A, 6) the assignment digits (any value where the action is not a declare)."""
    lp_ask, lp_dec, lp_pass, lp_asn = policy_dists(heads, legal)
    logp = _gather_logp(lp_ask, lp_dec, lp_pass, lp_asn, kind, idx, digits)
    h_ask = -(lp_ask.exp() * lp_ask.nan_to_num(neginf=0.0)).sum(dim=1)
    h_dec = -(lp_dec.exp() * lp_dec.nan_to_num(neginf=0.0)).sum(dim=1)
    h_pass = -(lp_pass.exp() * lp_pass.nan_to_num(neginf=0.0)).sum(dim=1)
    h_asn = -(lp_asn.exp() * lp_asn).sum(dim=2).sum(dim=1)
    p_set = 1.0 - lp_dec[:, DECLINE_SLOT].exp()
    ent = torch.where(kind == KIND_ASK, h_ask, torch.where(kind == KIND_PASS, h_pass, h_dec + p_set * h_asn))
    return logp, ent


def sample_actions(heads, legal, kind, gen=None):
    """Draw one action a decision, masked by the legal row (§9.3: "an action the legal row forbids is never sampled").
    Returns (idx, digits, logp); the caller turns them into port codes with `action_code`.

    The draw is Gumbel-max over the masked log-probabilities, which needs only `torch.rand`, so it behaves the same on
    the CPU and the GPU and takes a generator. The assignment's six digits are drawn at every decision and used only
    where the draw was a set."""
    lp_ask, lp_dec, lp_pass, lp_asn = policy_dists(heads, legal)

    def draw(lp):
        u = torch.rand(lp.shape, device=lp.device, dtype=torch.float32, generator=gen).clamp_(1e-20, 1.0)
        return (lp - torch.log(-torch.log(u))).argmax(dim=-1)

    i_ask, i_dec, i_pass = draw(lp_ask), draw(lp_dec), draw(lp_pass)
    digits = draw(lp_asn)
    idx = torch.where(kind == KIND_ASK, i_ask, torch.where(kind == KIND_PASS, i_pass, i_dec))
    return idx, digits, _gather_logp(lp_ask, lp_dec, lp_pass, lp_asn, kind, idx, digits)


def belief_logp(heads, cand_mask):
    """The belief head's log-probabilities (A, 54, 6) over each card's candidate seats (`cand_mask` (A, 54, 6) bool,
    the facts row's F_CAND expanded). net.ts's `beliefOf` is this, exponentiated."""
    logits = heads[:, H_BELIEF:H_BELIEF + N_BELIEF].float().view(-1, 54, 6)
    live = cand_mask | ~cand_mask.any(dim=-1, keepdim=True)
    return torch.log_softmax(logits.masked_fill(~live, MASK_LOGIT), dim=-1)


def cand_mask_of(facts):
    """The candidate-seat mask (A, 54, 6) bool from the facts rows (A, 278) uint8 tensor (F_CAND, API.md §5.5)."""
    bits = (facts[:, F_CAND:F_CAND + 54, None].long() >> torch.arange(6, device=facts.device)) & 1
    return bits.bool()


# --------------------------------------------------------------------------------------------- the weight file ---

def tensor_layout(d, width, depth, dec_f=DEC_F_FACTS):
    """net.ts's `tensorLayout`: (name, shape) in blob order. The actor's tensors only -- the critic is training only."""
    shapes = [('embed.weight', [d, EVENT_F]), ('embed.bias', [d]), ('gru.weight_ih', [3 * d, d]),
              ('gru.weight_hh', [3 * d, d]), ('gru.bias_ih', [3 * d]), ('gru.bias_hh', [3 * d])]
    for i in range(depth):
        shapes += [(f'trunk.{i}.weight', [width, d + dec_f if i == 0 else width]), (f'trunk.{i}.bias', [width])]
    shapes += [('heads.weight', [HEADS, width]), ('heads.bias', [HEADS])]
    return shapes


def param_count(d, width, depth, dec_f=DEC_F_FACTS):
    return int(sum(int(np.prod(s)) for _, s in tensor_layout(d, width, depth, dec_f)))


def state_tensors(model):
    """The model's actor tensors under net.ts's names."""
    sd = model.state_dict()
    m = {'embed.weight': sd['embed.weight'], 'embed.bias': sd['embed.bias'],
         'gru.weight_ih': sd['gru.weight_ih_l0'], 'gru.weight_hh': sd['gru.weight_hh_l0'],
         'gru.bias_ih': sd['gru.bias_ih_l0'], 'gru.bias_hh': sd['gru.bias_hh_l0'],
         'heads.weight': sd['heads.weight'], 'heads.bias': sd['heads.bias']}
    for i in range(model.depth):
        m[f'trunk.{i}.weight'] = sd[f'trunk.{i}.weight']
        m[f'trunk.{i}.bias'] = sd[f'trunk.{i}.bias']
    return m


def json_stable(x):
    """`meta` as a value that survives a JSON round trip through JavaScript unchanged.

    `net.ts`'s `serializeWeights` re-writes the header from what `parseWeights` read, so a weight file is byte-stable
    under a re-serialise only if its JSON is what `JSON.stringify` would produce. Python and JavaScript agree on
    strings, bools, null and integers; they disagree on an integral float, which Python writes `6.0` and JavaScript
    writes `6`. This converts those to ints and refuses NaN and the infinities, which are not JSON at all."""
    if isinstance(x, bool) or x is None or isinstance(x, (str, int)):
        return x
    if isinstance(x, float):
        if x != x or x in (float('inf'), float('-inf')):
            raise ValueError(f'meta holds {x}, which is not JSON')
        return int(x) if x.is_integer() else x
    if isinstance(x, dict):
        return {str(k): json_stable(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [json_stable(v) for v in x]
    return str(x)


def export_weights(model, path, meta, fmt=WEIGHTS_FORMAT, magic=None):
    """Write the actor as a **format v3** weight file and return its bytes.

    The file is byte for byte what `net.ts`'s `serializeWeights` writes for the same arch, blob and meta, so
    `parseWeights` reads it with no special case: the 8 ASCII bytes `ATHENAW1`, a u32 little-endian header length, that
    many bytes of UTF-8 JSON padded with spaces so the blob starts on a 4-byte boundary, then every tensor as float32
    little-endian in `tensor_layout`'s order, each row-major in PyTorch's [out, in].

    The header's keys are `serializeWeights`'s, in its order: `format` (`athena-weights-1` at every format -- the
    container never versioned), then `arch` as `d, width, depth, decF, heads, eventF`, then `params`, `tensors`,
    `meta`. **What makes the file v3 is (`decF` 912, `heads` 518)**, which is the row `net.ts`'s `WEIGHT_FORMATS`
    reads as version 3, and which carries the 19-slot fold with it. There is no `arch.eventSlots`: `parseWeights`
    would ignore such a key, but it would also put the file's bytes outside what `serializeWeights` can reproduce,
    and the fold width is a consequence of the format, not an independent field.

    `fmt` and `magic` exist so that a reader which versions the container differently costs a flag, not a change
    here; the magic defaults to the format's trailing digit, `ATHENAW<n>`."""
    magic = magic if magic is not None else (b'ATHENAW' + fmt.rsplit('-', 1)[-1].encode())
    if isinstance(magic, str):
        magic = magic.encode()
    if len(magic) != 8:
        raise ValueError(f'the magic {magic!r} is not 8 bytes')
    layout = tensor_layout(model.d, model.width, model.depth, model.dec_f)
    tensors = state_tensors(model)
    specs, blobs, off = [], [], 0
    for name, shape in layout:
        t = tensors[name].detach().to('cpu', torch.float32).contiguous()
        if list(t.shape) != shape:
            raise ValueError(f'{name}: shape {list(t.shape)}, the layout expects {shape}')
        n = int(np.prod(shape))
        specs.append([name, shape, off, n])
        blobs.append(t.numpy().astype('<f4').reshape(-1))
        off += n
    # net.ts `serializeWeights`: `{...archOf(arch), eventF, decF, heads}`, so `eventF` lands after `decF` and `heads`
    header = {'format': fmt,
              'arch': {'d': model.d, 'width': model.width, 'depth': model.depth, 'decF': model.dec_f,
                       'heads': HEADS, 'eventF': EVENT_F},
              'params': off, 'tensors': specs, 'meta': json_stable(meta)}
    js = json.dumps(header, separators=(',', ':'), allow_nan=False)
    while (12 + len(js.encode('utf-8'))) % 4:
        js += ' '
    hb = js.encode('utf-8')
    data = magic + struct.pack('<I', len(hb)) + hb + np.concatenate(blobs).tobytes()
    with open(path, 'wb') as f:
        f.write(data)
    return data


def to_torch(b, device):
    return {k: (v if torch.is_tensor(v) else torch.as_tensor(v)).to(device) for k, v in b.items()}
