/**
 * net.ts — a fitted dense model as plain JSON, and its forward pass. Shared by the learned leaf
 * (MONET.md 3.8ab, `search/value.ts`) and the imitation ask policy (3.8ac, `imitation.ts`): a
 * standardisation of the inputs and a stack of dense layers, ReLU between them and none after the
 * last, so one layer is a linear model and two hidden layers a small net. `compileNet` turns the
 * JSON into typed arrays once; `forwardNet` is the pass. Fitting is a script's job (`scripts/
 * fit-value.mjs`, `scripts/fit-imitation.mjs`); nothing here trains. Pure over its inputs.
 */

export interface DenseModel {
  /** The input width the model was fitted at; a mismatch is refused. */
  features: number
  mean: number[]
  std: number[]
  /** Row-major `w` of `out × in` and `b` of `out`; the last layer's width is the model's output. */
  layers: { w: number[]; b: number[] }[]
  /** Free-form provenance (the data, the fit, the holdout error). */
  meta?: Record<string, unknown>
}

export interface CompiledNet {
  features: number
  outputs: number
  mean: Float64Array
  invStd: Float64Array
  layers: { w: Float64Array; b: Float64Array; out: number; inp: number }[]
  /** Scratch buffers for the forward pass, one per layer's output. */
  buf: Float64Array[]
  /** The standardised input, scratch. */
  input: Float64Array
}

/** Compile a JSON model; `outputs` is the width the caller requires of the last layer (1 for a value, 1 for a score). */
export function compileNet(m: DenseModel, features: number, outputs = 1): CompiledNet {
  if (m.features !== features) throw new Error(`model has ${m.features} features; this build has ${features}`)
  if (m.mean.length !== m.features || m.std.length !== m.features) throw new Error('model: standardisation length')
  let inp = m.features
  const layers = m.layers.map((l) => {
    const out = l.b.length
    if (l.w.length !== out * inp) throw new Error(`model: layer of ${out}×${inp} has ${l.w.length} weights`)
    const layer = { w: Float64Array.from(l.w), b: Float64Array.from(l.b), out, inp }
    inp = out
    return layer
  })
  if (layers.length === 0 || layers[layers.length - 1].out !== outputs) throw new Error(`model: the last layer must have ${outputs === 1 ? 'one output' : `${outputs} outputs`}`)
  return {
    features: m.features,
    outputs,
    mean: Float64Array.from(m.mean),
    invStd: Float64Array.from(m.std, (v) => (v > 0 ? 1 / v : 0)),
    layers,
    buf: layers.map((l) => new Float64Array(l.out)),
    input: new Float64Array(m.features),
  }
}

/** The forward pass over one input vector; the last layer's first output (the scratch buffers are reused, so read the result before the next call). */
export function forwardNet(m: CompiledNet, x: ArrayLike<number>): number {
  let cur: Float64Array = m.input
  for (let i = 0; i < m.features; i++) cur[i] = (x[i] - m.mean[i]) * m.invStd[i]
  for (let li = 0; li < m.layers.length; li++) {
    const l = m.layers[li]
    const out = m.buf[li]
    const last = li === m.layers.length - 1
    for (let o = 0; o < l.out; o++) {
      let acc = l.b[o]
      const base = o * l.inp
      for (let i = 0; i < l.inp; i++) acc += l.w[base + i] * cur[i]
      out[o] = last || acc > 0 ? acc : 0
    }
    cur = out
  }
  return cur[0]
}
