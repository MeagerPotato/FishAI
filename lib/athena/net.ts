/**
 * net.ts: ATHENA's candidate network as a deterministic plain-JavaScript forward pass (ATHENA.md §1, §3.1, §4.5 item
 * 6: "the inference contract"). G0d.
 *
 * ## The family
 *
 * The actor of §3.1's candidates, as `gpu-bench.py` shaped them: a linear embedding of each public event into a
 * GRU's input, a GRU folding the event sequence into the seat's recurrent state, an MLP trunk over that state
 * concatenated with the decision's features, and one linear layer of heads. The critic (training only) is not here.
 *
 * | part | shape |
 * |---|---|
 * | event features | {@link EVENT_F} = 176 one-hot slots over the 19 bytes of an event row (encode.ts), 21 active per event |
 * | embedding | `embed`: 176 -> d, linear |
 * | recurrence | `gru`: PyTorch's GRUCell, d -> d, gates r, z, n stacked in that order |
 * | decision features | {@link DEC_F} = 516: the obs row as one-hots and scaled counts, plus the rules-derived candidate seats of every card (54 x 6, relative). P1's heads (ATHENA.md §8.3) append {@link FACTS_F} = 396 more from the facts row ({@link factsFeatures}): {@link DEC_F_FACTS} = 912 |
 * | trunk | `depth` layers of `width`, ReLU; the first reads [h, decision features] |
 * | heads | one linear layer to {@link HEADS} = 517 outputs: ask 162 (the ask codes), declare 10 (nine sets, then none), assignment 18 (six set positions x three teammates), pass 2, belief 324 (card x relative seat), value 1 |
 *
 * {@link ARCHS} names §3.1's three sizes: S (GRU 256, trunk 2 x 512), M (512, 3 x 1,024), L (1,024, 4 x 2,048).
 *
 * ## Determinism (the contract)
 *
 * - **float64 arithmetic, fixed order.** Weights are stored as float32 and read exactly into float64; every sum,
 *   product and activation is float64, and every dot product adds its terms in ascending input index, starting from
 *   zero, with the bias added last. JavaScript's number arithmetic is IEEE-754 binary64 with round-to-nearest and no
 *   fused multiply-add, so the same weights and inputs give the same bits on every conforming engine and platform.
 * - **No library transcendentals.** `Math.exp` and `Math.tanh` are implementation-defined in their last bits, so the
 *   sigmoid, the tanh and the softmax use {@link expDet}: a Cody-Waite range reduction, a degree-13 Taylor polynomial
 *   in Horner form, and an exact power-of-two scaling from a table built by doubling. Only `+ - * /`, `Math.round`
 *   and comparisons are used, each exactly specified by the language.
 * - **The embedding is sparse.** An event activates 21 of its 176 slots with the value 1, so the embedding adds the
 *   21 weight columns in ascending slot order; the omitted terms are exact zeros.
 * - The GRU fold is a left fold over the log, so a seat that folds events as they arrive and a seat that refolds the
 *   whole log from zero produce the same bits (policy.ts's cache relies on this; the tests assert it).
 *
 * ## The weight file, `athena-weights-1`
 *
 * The 8 ASCII bytes `ATHENAW1`, a u32 little-endian header length H, H bytes of UTF-8 JSON padded with spaces so the
 * blob starts on a 4-byte boundary, then every tensor as float32 little-endian in {@link tensorLayout}'s order (each
 * row-major, PyTorch's `[out, in]`). The header names the format, the arch, the tensors with their shapes and float
 * offsets, and the init. A package records the file's md5 in its manifest.
 *
 * The header's `arch.decF` is the trunk's decision-feature width: {@link DEC_F} (G0d's stub; an {@link Arch} without
 * `decF`) or {@link DEC_F_FACTS} (P1's belief heads, whose decision features end with {@link factsFeatures}). No other
 * width is accepted.
 */
import { hashSeed, mulberry32 } from '../engine/rng.ts'
import {
  CONS_FIELDS,
  EVENT_LEN,
  F_CONS,
  F_NCONS,
  F_SET_CERTAIN,
  F_SET_LOST,
  MAX_CONS,
  N_ASK,
  N_SETS,
  NONE,
  O_COUNTS,
  O_DECLINED,
  O_HAND,
  O_OPTION,
  O_PHASE,
  O_SCORE,
  O_SETS,
  O_TURN,
  O_WINDOW,
  SET_FIELDS,
} from './encode.ts'

/* ------------------------------------------------------------------------------------------- the shape --- */

export const EVENT_F = 176
export const DEC_F = 516
/** P1's facts features ({@link factsFeatures}): 6 relative seats x 9 sets x 7, then 9 sets x 2. */
export const FACTS_F = 6 * N_SETS * 7 + 2 * N_SETS
/** The decision features of P1's heads: {@link DEC_F}'s, then {@link FACTS_F}'s. */
export const DEC_F_FACTS = DEC_F + FACTS_F
export const HEADS = 517
export const H_ASK = 0
export const H_DECLARE = H_ASK + N_ASK
export const H_ASSIGN = H_DECLARE + 10
export const H_PASS = H_ASSIGN + 18
export const H_BELIEF = H_PASS + 2
export const H_VALUE = H_BELIEF + 324

export interface Arch {
  /** The GRU's state and the embedding's width. */
  d: number
  /** The trunk's width. */
  width: number
  /** The trunk's layers. */
  depth: number
  /** The decision features the trunk reads: {@link DEC_F} when absent (G0d's stub), or {@link DEC_F_FACTS} (P1's heads). */
  decF?: number
}

/** The arch's decision-feature width (module header): {@link DEC_F} or {@link DEC_F_FACTS}, nothing else. */
export function decFOf(a: Arch): number {
  const f = a.decF ?? DEC_F
  if (f !== DEC_F && f !== DEC_F_FACTS) throw new Error(`decision features ${f}: a net reads ${DEC_F} or ${DEC_F_FACTS}`)
  return f
}

/** The arch as a net keeps it: `decF` named only when it is not {@link DEC_F}, so G0d's stub is byte for byte as it was. */
function archOf(a: Arch): Arch {
  const f = decFOf(a)
  return f === DEC_F ? { d: a.d, width: a.width, depth: a.depth } : { d: a.d, width: a.width, depth: a.depth, decF: f }
}

/** ATHENA.md §3.1's three candidate sizes. */
export const ARCHS: Readonly<Record<'S' | 'M' | 'L', Arch>> = Object.freeze({
  S: Object.freeze({ d: 256, width: 512, depth: 2 }),
  M: Object.freeze({ d: 512, width: 1024, depth: 3 }),
  L: Object.freeze({ d: 1024, width: 2048, depth: 4 }),
})

export interface TensorSpec {
  name: string
  shape: number[]
  /** Offset into the blob, in floats. */
  offset: number
  length: number
}

/** Every tensor of an arch, in blob order. */
export function tensorLayout(a: Arch): TensorSpec[] {
  const shapes: [string, number[]][] = [
    ['embed.weight', [a.d, EVENT_F]],
    ['embed.bias', [a.d]],
    ['gru.weight_ih', [3 * a.d, a.d]],
    ['gru.weight_hh', [3 * a.d, a.d]],
    ['gru.bias_ih', [3 * a.d]],
    ['gru.bias_hh', [3 * a.d]],
  ]
  for (let i = 0; i < a.depth; i++) {
    shapes.push([`trunk.${i}.weight`, [a.width, i === 0 ? a.d + decFOf(a) : a.width]])
    shapes.push([`trunk.${i}.bias`, [a.width]])
  }
  shapes.push(['heads.weight', [HEADS, a.width]])
  shapes.push(['heads.bias', [HEADS]])
  let offset = 0
  return shapes.map(([name, shape]) => {
    const length = shape.reduce((x, y) => x * y, 1)
    const t = { name, shape, offset, length }
    offset += length
    return t
  })
}

export function paramCount(a: Arch): number {
  const l = tensorLayout(a)
  const last = l[l.length - 1]
  return last.offset + last.length
}

/* ---------------------------------------------------------------------------- deterministic arithmetic --- */

const INV_LN2 = 1.4426950408889634
// fdlibm's split of ln 2: the high part has 32 trailing zero bits, so k * LN2_HI is exact for |k| < 2^20.
const LN2_HI = 6.93147180369123816490e-1
const LN2_LO = 1.90821492927058770002e-10
/** 1/n! for n = 0..13, each computed by one division from the last. */
const INV_FACT: readonly number[] = (() => {
  const c = [1]
  for (let n = 1; n <= 13; n++) c.push(c[n - 1] / n)
  return c
})()
/** 2^k for k = -1022..1023, built by exact doubling and halving from 1. */
const POW2: Float64Array = (() => {
  const t = new Float64Array(2046)
  t[1022] = 1
  for (let k = 1; k <= 1023; k++) t[1022 + k] = t[1022 + k - 1] * 2
  for (let k = 1; k <= 1022; k++) t[1022 - k] = t[1022 - k + 1] / 2
  return t
})()

/**
 * e^x from `+ - * /` and `Math.round` only, so its bits are the same on every conforming engine. Relative error
 * about 1e-16 (checked against `Math.exp` in the tests); 0 below -708 and Infinity above 709.
 */
export function expDet(x: number): number {
  if (x !== x) return Number.NaN
  if (x > 709) return Number.POSITIVE_INFINITY
  if (x < -708) return 0
  const k = Math.round(x * INV_LN2)
  const r = x - k * LN2_HI - k * LN2_LO
  let p = INV_FACT[13]
  for (let n = 12; n >= 0; n--) p = p * r + INV_FACT[n]
  return p * POW2[1022 + k]
}

export function sigmoidDet(x: number): number {
  if (x >= 0) return 1 / (1 + expDet(-x))
  const e = expDet(x)
  return e / (1 + e)
}

export function tanhDet(x: number): number {
  if (x !== x) return Number.NaN
  const a = x < 0 ? -x : x
  const t = a > 22 ? 1 : 1 - 2 / (expDet(2 * a) + 1)
  return x < 0 ? -t : t
}

/* ------------------------------------------------------------------------------------------ the net --- */

export interface AthenaNet {
  arch: Arch
  /** Every weight, in {@link tensorLayout}'s order. */
  blob: Float32Array
  /** Free-form provenance from the weight file's header (the init, a training run). */
  meta: Record<string, unknown>
  embW: Float32Array
  embB: Float32Array
  wih: Float32Array
  whh: Float32Array
  bih: Float32Array
  bhh: Float32Array
  trunkW: Float32Array[]
  trunkB: Float32Array[]
  headW: Float32Array
  headB: Float32Array
  /** Scratch, reused by every call: the embedded event, the two gate pre-activations, the trunk's input and layers. */
  sx: Float64Array
  sgi: Float64Array
  sgh: Float64Array
  su: Float64Array
  st: Float64Array[]
  sidx: Int32Array
}

/** A net over an existing blob (not copied). */
export function makeNet(arch: Arch, blob: Float32Array, meta: Record<string, unknown> = {}): AthenaNet {
  const layout = tensorLayout(arch)
  const n = paramCount(arch)
  if (blob.length !== n) throw new Error(`the weights hold ${blob.length} floats; arch ${JSON.stringify(arch)} needs ${n}`)
  const t = new Map(layout.map((s) => [s.name, blob.subarray(s.offset, s.offset + s.length)]))
  const get = (name: string): Float32Array => t.get(name) as Float32Array
  const trunkW: Float32Array[] = []
  const trunkB: Float32Array[] = []
  for (let i = 0; i < arch.depth; i++) {
    trunkW.push(get(`trunk.${i}.weight`))
    trunkB.push(get(`trunk.${i}.bias`))
  }
  return {
    arch: archOf(arch),
    blob,
    meta,
    embW: get('embed.weight'),
    embB: get('embed.bias'),
    wih: get('gru.weight_ih'),
    whh: get('gru.weight_hh'),
    bih: get('gru.bias_ih'),
    bhh: get('gru.bias_hh'),
    trunkW,
    trunkB,
    headW: get('heads.weight'),
    headB: get('heads.bias'),
    sx: new Float64Array(arch.d),
    sgi: new Float64Array(3 * arch.d),
    sgh: new Float64Array(3 * arch.d),
    su: new Float64Array(arch.d + decFOf(arch)),
    st: Array.from({ length: arch.depth }, () => new Float64Array(arch.width)),
    sidx: new Int32Array(21),
  }
}

/** The stub's init scheme, recorded in the weight file's header. */
export const INIT_SCHEME =
  'mulberry32(xmur3(seed)) in blob order; each weight fround((2u - 1) * a): a = 1/sqrt(fan_in) for the embedding, the trunk and their biases, 1/sqrt(d) for the GRU (PyTorch defaults), 0.01/sqrt(width) for the head weights; the head biases are 0 and draw nothing'

/** A fixed-seed random init (the stub's weights): deterministic in `seed`. */
export function initBlob(arch: Arch, seed: string): Float32Array {
  const blob = new Float32Array(paramCount(arch))
  const rng = mulberry32(hashSeed(seed)())
  for (const t of tensorLayout(arch)) {
    let a: number
    if (t.name === 'heads.bias') continue
    if (t.name === 'heads.weight') a = 0.01 / Math.sqrt(arch.width)
    else if (t.name.startsWith('gru.')) a = 1 / Math.sqrt(arch.d)
    else if (t.name.startsWith('embed.')) a = 1 / Math.sqrt(EVENT_F)
    else {
      const i = Number(t.name.split('.')[1])
      a = 1 / Math.sqrt(i === 0 ? arch.d + decFOf(arch) : arch.width)
    }
    for (let j = 0; j < t.length; j++) blob[t.offset + j] = Math.fround((2 * rng() - 1) * a)
  }
  return blob
}

/* --------------------------------------------------------------------------------------- the weight file --- */

const MAGIC = 'ATHENAW1'
export const WEIGHTS_FORMAT = 'athena-weights-1'

/** The weight file's bytes. */
export function serializeWeights(net: Pick<AthenaNet, 'arch' | 'blob' | 'meta'>): Uint8Array {
  const layout = tensorLayout(net.arch)
  const header = {
    format: WEIGHTS_FORMAT,
    arch: { ...archOf(net.arch), eventF: EVENT_F, decF: decFOf(net.arch), heads: HEADS },
    params: paramCount(net.arch),
    tensors: layout.map((t) => [t.name, t.shape, t.offset, t.length]),
    meta: net.meta,
  }
  let json = JSON.stringify(header)
  while ((12 + new TextEncoder().encode(json).length) % 4 !== 0) json += ' '
  const hb = new TextEncoder().encode(json)
  const out = new Uint8Array(12 + hb.length + 4 * net.blob.length)
  const dv = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) out[i] = MAGIC.charCodeAt(i)
  dv.setUint32(8, hb.length, true)
  out.set(hb, 12)
  const base = 12 + hb.length
  for (let i = 0; i < net.blob.length; i++) dv.setFloat32(base + 4 * i, net.blob[i], true)
  return out
}

/** A net from a weight file's bytes; refuses a file whose header disagrees with the layout it names. */
export function parseWeights(bytes: Uint8Array): AthenaNet {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) throw new Error('not an athena-weights-1 file (bad magic)')
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const hl = dv.getUint32(8, true)
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + hl))) as {
    format: string
    arch: Arch & { eventF: number; decF: number; heads: number }
    params: number
    tensors: [string, number[], number, number][]
    meta?: Record<string, unknown>
  }
  if (header.format !== WEIGHTS_FORMAT) throw new Error(`weight format ${header.format}, not ${WEIGHTS_FORMAT}`)
  const a = header.arch
  if (a.eventF !== EVENT_F || (a.decF !== DEC_F && a.decF !== DEC_F_FACTS) || a.heads !== HEADS) {
    throw new Error(`the weights were built for eventF ${a.eventF}, decF ${a.decF}, heads ${a.heads}; this forward has ${EVENT_F}, ${DEC_F} or ${DEC_F_FACTS}, ${HEADS}`)
  }
  const arch: Arch = archOf({ d: a.d, width: a.width, depth: a.depth, decF: a.decF })
  const layout = tensorLayout(arch)
  const same =
    header.tensors.length === layout.length &&
    layout.every((t, i) => {
      const [name, shape, offset, length] = header.tensors[i]
      return name === t.name && JSON.stringify(shape) === JSON.stringify(t.shape) && offset === t.offset && length === t.length
    })
  if (!same || header.params !== paramCount(arch)) throw new Error('the weight file header does not match its arch layout')
  const base = 12 + hl
  if (bytes.length !== base + 4 * header.params) throw new Error(`the weight file has ${bytes.length} bytes; its header needs ${base + 4 * header.params}`)
  const blob = new Float32Array(header.params)
  for (let i = 0; i < blob.length; i++) blob[i] = dv.getFloat32(base + 4 * i, true)
  return makeNet(arch, blob, header.meta ?? {})
}

/* --------------------------------------------------------------------------------------- the features --- */

/** The event row's 21 active one-hot slots, ascending, written into `out`. */
export function eventSlots(row: Uint8Array, off: number, out: Int32Array): void {
  const slot = (v: number, n: number, what: string): number => {
    if (v === NONE) return n - 1
    if (v >= n - 1) throw new Error(`event byte ${what} = ${v} is out of range`)
    return v
  }
  let k = 0
  const type = row[off]
  if (type > 5) throw new Error(`event type ${type} is out of range`)
  out[k++] = type
  out[k++] = 6 + slot(row[off + 1], 7, 'actor')
  out[k++] = 13 + slot(row[off + 2], 7, 'target')
  out[k++] = 20 + slot(row[off + 3], 55, 'card')
  out[k++] = 75 + slot(row[off + 4], 3, 'hit')
  out[k++] = 78 + slot(row[off + 5], 10, 'set')
  out[k++] = 88 + slot(row[off + 6], 4, 'result')
  for (let j = 0; j < 6; j++) out[k++] = 92 + 7 * j + slot(row[off + 7 + j], 7, 'assign')
  for (let j = 0; j < 6; j++) out[k++] = 134 + 7 * j + slot(row[off + 13 + j], 7, 'holder')
}

/**
 * The decision's features (DEC_F = 516) from the obs row and the candidate matrix `cands` (54 x 6 bytes, 1 where the
 * rules leave relative seat r a possible current holder of card c; all zero for a card out of play).
 */
export function decisionFeatures(obs: Uint8Array, cands: Uint8Array, out: Float64Array): void {
  out.fill(0)
  for (let c = 0; c < 54; c++) out[c] = obs[O_HAND + c]
  for (let r = 0; r < 6; r++) out[54 + r] = obs[O_COUNTS + r] / 9
  const one = (base: number, v: number, n: number): void => {
    if (v !== NONE && v < n) out[base + v] = 1
  }
  one(60, obs[O_PHASE], 3)
  one(63, obs[O_TURN], 6)
  out[69] = obs[O_WINDOW]
  one(70, obs[O_OPTION], 6)
  one(76, obs[O_DECLINED], 6)
  out[82] = obs[O_SCORE] / 9
  out[83] = obs[O_SCORE + 1] / 9
  for (let b = 0; b < 9; b++) {
    const o = O_SETS + SET_FIELDS * b
    const base = 84 + 12 * b
    one(base, obs[o], 3)
    one(base + 3, obs[o + 1], 6)
    one(base + 9, obs[o + 2], 3)
  }
  for (let i = 0; i < 324; i++) out[192 + i] = cands[i]
}

/**
 * P1's facts features ({@link FACTS_F} = 396; ATHENA.md §8.3, "the facts of §8.1 as input") from the facts row (the
 * port's `facts` buffer, API.md §5.5; encode.ts's `encodeFactsRow` from a view), written into `out` from `off`
 * ({@link DEC_F} by default, after {@link decisionFeatures}'s). The candidate seats are already in the decision
 * features; these add what the fixpoint leaves unresolved:
 * - **the set-membership constraints**, at `off + 7 (9r + b)` for relative seat r and set b: 1 if the facts hold a
 *   constraint on (r, b), then the six bits (set card order) of the tightest one: the smallest popcount, a tie to the
 *   smaller mask. All 0 without a constraint, and for a resolved set;
 * - **per set**, at `off + 378 + 2b`: F_SET_CERTAIN / 6 and F_SET_LOST (both 0 once the set is resolved, NONE).
 *
 * `scripts/athena/belief_data.py`'s `facts_features` is the same function over the port's buffer; a fixture pins the
 * two (tests/athena/belief-views.test.ts).
 */
export function factsFeatures(facts: Uint8Array, out: Float64Array, off: number = DEC_F): void {
  out.fill(0, off, off + FACTS_F)
  const n = facts[F_NCONS]
  if (n > MAX_CONS) throw new Error(`the facts row holds ${n} constraints, above MAX_CONS = ${MAX_CONS}`)
  const best = new Int16Array(6 * N_SETS).fill(-1)
  const pop = (m: number): number => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1) + ((m >> 4) & 1) + ((m >> 5) & 1)
  for (let i = 0; i < n; i++) {
    const r = facts[F_CONS + CONS_FIELDS * i]
    const b = facts[F_CONS + CONS_FIELDS * i + 1]
    const m = facts[F_CONS + CONS_FIELDS * i + 2]
    if (r >= 6 || b >= N_SETS || m === 0 || m >= 64) throw new Error(`constraint ${i} (${r}, ${b}, ${m}) is out of range`)
    if (facts[F_SET_CERTAIN + b] === NONE) continue
    const j = N_SETS * r + b
    const cur = best[j]
    if (cur < 0 || pop(m) < pop(cur) || (pop(m) === pop(cur) && m < cur)) best[j] = m
  }
  for (let j = 0; j < 6 * N_SETS; j++) {
    const m = best[j]
    if (m < 0) continue
    const o = off + 7 * j
    out[o] = 1
    for (let k = 0; k < 6; k++) out[o + 1 + k] = (m >> k) & 1
  }
  for (let b = 0; b < N_SETS; b++) {
    const c = facts[F_SET_CERTAIN + b]
    if (c === NONE) continue
    const lost = facts[F_SET_LOST + b]
    out[off + 7 * 6 * N_SETS + 2 * b] = c / 6
    out[off + 7 * 6 * N_SETS + 2 * b + 1] = lost === NONE ? 0 : lost
  }
}

/* --------------------------------------------------------------------------------------- the forward --- */

/** A zero recurrent state. */
export function zeroState(net: AthenaNet): Float64Array {
  return new Float64Array(net.arch.d)
}

/** Fold one event row (`rows[off .. off + EVENT_LEN)`) into the recurrent state `h`, in place. */
export function foldEvent(net: AthenaNet, h: Float64Array, rows: Uint8Array, off: number): void {
  const d = net.arch.d
  const idx = net.sidx
  eventSlots(rows, off, idx)
  const x = net.sx
  const embW = net.embW
  const embB = net.embB
  for (let i = 0; i < d; i++) {
    const o = i * EVENT_F
    let acc = 0
    for (let k = 0; k < 21; k++) acc += embW[o + idx[k]]
    x[i] = acc + embB[i]
  }
  const gi = net.sgi
  const gh = net.sgh
  const wih = net.wih
  const whh = net.whh
  const bih = net.bih
  const bhh = net.bhh
  for (let g = 0; g < 3 * d; g++) {
    const o = g * d
    let a1 = 0
    let a2 = 0
    for (let j = 0; j < d; j++) {
      a1 += wih[o + j] * x[j]
      a2 += whh[o + j] * h[j]
    }
    gi[g] = a1 + bih[g]
    gh[g] = a2 + bhh[g]
  }
  for (let i = 0; i < d; i++) {
    const r = sigmoidDet(gi[i] + gh[i])
    const z = sigmoidDet(gi[d + i] + gh[d + i])
    const n = tanhDet(gi[2 * d + i] + r * gh[2 * d + i])
    h[i] = (1 - z) * n + z * h[i]
  }
}

/** Fold `n` event rows from a zero state: the recurrent state after the whole sequence. */
export function foldAll(net: AthenaNet, rows: Uint8Array, n: number): Float64Array {
  const h = zeroState(net)
  for (let i = 0; i < n; i++) foldEvent(net, h, rows, i * EVENT_LEN)
  return h
}

/**
 * The belief head's probabilities (ATHENA.md §1's "card × seat, masked by the rules"; §8.3): for each card c, the
 * softmax of its logits `heads[H_BELIEF + 6c + r]` over the relative seats r that `cands` (54 x 6 bytes, as
 * {@link decisionFeatures} reads it) leaves possible, and 0 at every other seat; a card with no candidate is all
 * zero. The same arithmetic as policy.ts's `planSet`: the maximum candidate logit is subtracted, then
 * {@link expDet} over the candidates in ascending r, summed in that order, and each term divided by the sum.
 */
export function beliefOf(heads: Float64Array, cands: Uint8Array, out: Float64Array = new Float64Array(324)): Float64Array {
  out.fill(0)
  for (let c = 0; c < 54; c++) {
    let m = Number.NEGATIVE_INFINITY
    for (let r = 0; r < 6; r++) if (cands[c * 6 + r]) m = Math.max(m, heads[H_BELIEF + c * 6 + r])
    if (m === Number.NEGATIVE_INFINITY) continue
    let sum = 0
    for (let r = 0; r < 6; r++) if (cands[c * 6 + r]) sum += expDet(heads[H_BELIEF + c * 6 + r] - m)
    for (let r = 0; r < 6; r++) if (cands[c * 6 + r]) out[c * 6 + r] = expDet(heads[H_BELIEF + c * 6 + r] - m) / sum
  }
  return out
}

/** The heads (HEADS = 517 outputs, written into `out`) for the state `h` and the decision features `dec`. */
export function headsOf(net: AthenaNet, h: Float64Array, dec: Float64Array, out: Float64Array): Float64Array {
  const d = net.arch.d
  const u = net.su
  u.set(h, 0)
  u.set(dec, d)
  let inp: Float64Array = u
  for (let l = 0; l < net.arch.depth; l++) {
    const w = net.trunkW[l]
    const b = net.trunkB[l]
    const y = net.st[l]
    const n = inp.length
    for (let o = 0; o < y.length; o++) {
      const base = o * n
      let acc = 0
      for (let j = 0; j < n; j++) acc += w[base + j] * inp[j]
      const v = acc + b[o]
      y[o] = v > 0 ? v : 0
    }
    inp = y
  }
  const w = net.headW
  const b = net.headB
  const n = inp.length
  for (let o = 0; o < HEADS; o++) {
    const base = o * n
    let acc = 0
    for (let j = 0; j < n; j++) acc += w[base + j] * inp[j]
    out[o] = acc + b[o]
  }
  return out
}
