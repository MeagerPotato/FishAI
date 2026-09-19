/**
 * perturb-weights.mjs: a perturbed copy of an `athena-weights-1` file, for the pin's mutation check (ATHENA.md §4.6
 * G0d part 2: "the package with its weight file perturbed must differ").
 *
 *     node scripts/athena/perturb-weights.mjs --in <file> --out <file> [--scale 0.01] [--seed athena-g0d-perturb]
 *
 * Every weight w becomes fround(w * (1 + scale * u)), u uniform on [-1, 1) from `lib/athena/net.ts`'s seeded stream,
 * so the file keeps its layout and its header (with the perturbation recorded in `meta.perturbed`) and only the
 * numbers move. A zero weight stays zero (the stub's head biases are zero). Prints both md5s.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = await import(pathToFileURL(`${ROOT}/lib/athena/index.ts`).href)
const RNG = await import(pathToFileURL(`${ROOT}/lib/engine/rng.ts`).href)

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const IN = argOf('--in', '')
const OUT = argOf('--out', '')
const SCALE = Number(argOf('--scale', '0.01'))
const SEED = argOf('--seed', 'athena-g0d-perturb')
if (!IN || !OUT || !(SCALE > 0)) {
  console.error('usage: node scripts/athena/perturb-weights.mjs --in <file> --out <file> [--scale 0.01] [--seed athena-g0d-perturb]')
  process.exit(2)
}

const bytes = readFileSync(resolve(IN))
const net = A.parseWeights(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
const rand = RNG.mulberry32(RNG.hashSeed(SEED)())
const blob = new Float32Array(net.blob.length)
let moved = 0
let maxRel = 0
for (let i = 0; i < blob.length; i++) {
  const w = net.blob[i]
  blob[i] = Math.fround(w * (1 + SCALE * (2 * rand() - 1)))
  if (blob[i] !== w) moved++
  if (w !== 0) maxRel = Math.max(maxRel, Math.abs(blob[i] / w - 1))
}
const out = A.serializeWeights({ arch: net.arch, blob, meta: { ...net.meta, perturbed: { from: createHash('md5').update(bytes).digest('hex'), scale: SCALE, seed: SEED } } })
writeFileSync(resolve(OUT), out)
const md5 = (b) => createHash('md5').update(b).digest('hex')
console.log(`perturb-weights: ${IN} (md5 ${md5(bytes)}) -> ${OUT} (md5 ${md5(out)})`)
console.log(`  ${blob.length.toLocaleString('en-US')} weights, ${moved.toLocaleString('en-US')} moved, scale ${SCALE}, largest relative change ${maxRel.toExponential(3)}, seed ${JSON.stringify(SEED)}`)
