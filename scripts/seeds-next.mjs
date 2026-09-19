/**
 * seeds-next.mjs — the seed rule (MONET.md §6.5, for the rungs after v0.31; ATHENA.md §4.5 item 7): twelve fresh
 * seeds under a label, `1_000_000 + floor(r() * 9_000_000)` from `mulberry32(hashSeed(label)())`, skipping every seed
 * already spent, read or reserved.
 *
 *     node scripts/seeds-next.mjs <label> [--dir <name>]
 *
 * The spent set is the historical list below (every seed through v0.31, as the scratchpad tool carried it) plus
 * every file under `scripts/seeds/`, the registry of later draws. The draw is written to
 * `scripts/seeds/<name>/SEEDS` (`<name>` defaults to the label), so it is spent from the moment it exists; commit
 * it with the read that uses it. A draw is made once: the tool refuses a name whose file exists.
 *
 * Promoted on 2026-09-19 from the copy archived on 2026-09-18 (the session scratchpad's `seeds-next.mjs`), with the
 * same rule and the same historical list. The one change is that the registry is read whole, instead of the spent
 * files being named on the command line. Its test re-draws `athena-kraken-read-12` from the registry without that
 * file and gets the twelve seeds ATHENA.md §7 played.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const REGISTRY = join(ROOT, 'scripts', 'seeds')

// Everything through v0.31, verbatim from the archived tool: seeds-v31.mjs's set (everything through v0.30) plus
// v0.31's twelve.
export const HISTORICAL_SPENT = Object.freeze([
  90210, 2534720, 1361408, 5981661,
  4566970, 1199342, 6316791, 2547589, 4418288, 9925819, 5348261, 6105833, 5507420, 9426818, 9607741, 6361645,
  5682873, 5690135, 6007102, 4920114, 7140858, 4334282, 8816427, 6848576, 8516315, 2344938, 9677918, 7951876,
  5204470, 6032457, 7996480,
  8083995, 4646803, 7167747, 7149252, 3737595, 9459020, 2922748, 5753167, 8102326, 9719629, 2543289, 1225735,
  3150867, 9742538, 4824841, 8665093, 2488551, 9695050,
  9715909, 1657910, 5562102, 8242985, 3593118, 2057008, 6962430, 6081385, 9709672, 3768516, 5398011, 2496080,
  2952702, 7314900, 3847388,
  7252293, 8962154, 7103556, 7871142, 1027753, 8456196, 7184028, 1717986, 2495762, 8576423, 3622224, 7871039,
  7650374, 2628643, 5128867,
  7461197, 9936837, 9971133, 8718782, 2816644, 4110631, 5148246, 8790887, 1701171, 8673686, 6710945, 1144313,
  6269924, 7549725, 5242661, 6002277, 9277927, 1700521, 7863927, 1836519, 8279242, 7472431, 4385920, 1411503,
  9502823, 8047376, 7423220, 5202785, 5458804, 5543368, 8844324, 4136509, 6890891, 5005191, 8317657, 7029023,
  7906316, 6521858, 2233537, 7628061, 9720189, 9747216, 6988108, 5749649, 8961205, 2810823, 3499054, 6256001,
  5594240, 8792627, 4733371, 4311448, 9252632, 9599680, 2641105, 2254076, 5393671, 6482925, 6734115, 4029127,
  7812476, 3107165, 4205667, 6642697, 6042682, 8740967, 8852434, 5279031, 4833011, 4949308, 5613450, 4420296,
  6241922, 3959635, 2452588, 2508194, 3439903, 6291055, 9399884, 5510112, 7201121, 3463860, 5688060, 4035624,
  7196521, 6332651, 7026896, 1518145, 9339794, 3395719, 8076725, 4914504, 7254379, 7472654, 5631502, 5124898,
  9530470, 8775043, 5318699, 2942726, 6746805, 8325339, 8220040, 4027070, 8085724, 3978858, 8632114, 1600170,
  // v0.29 (MONET.md 3.8ab): the twelve drawn under "monet-v0.29-confirm-12", the bridge read deferred (reserved)
  7550864, 7751223, 7315504, 6449732, 6962668, 8281481, 1832694, 8353852, 1312979, 5131071, 4074049, 7809288,
  // v0.30 (MONET.md 3.8ac): the twelve drawn under "monet-v0.30-confirm-12", spent abroad by M3 and M4
  1485985, 2632525, 3494862, 9948698, 3131149, 2398534, 5193753, 5103273, 2487047, 8924909, 6177040, 8235295,
  // v0.31 (MONET.md 3.8ad): the twelve drawn under "monet-v0.31-confirm-12", spent abroad by 3.8ad's and 3.8af's M3
  2084753, 3014474, 6756708, 8119149, 3333333, 8366602, 6841788, 1616231, 7621259, 1307763, 6562295, 5339521,
])

/** Every file under `dir` whose name starts with SEEDS, as [path relative to `dir`, its whitespace-separated seeds]. */
export function readRegistry(dir = REGISTRY) {
  const out = []
  const walk = (d, rel) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      const r = rel ? `${rel}/${name}` : name
      if (statSync(p).isDirectory()) walk(p, r)
      else if (name.startsWith('SEEDS')) {
        const seeds = readFileSync(p, 'utf8').split(/\s+/).filter(Boolean).map(Number)
        if (seeds.some((s) => !Number.isInteger(s))) throw new Error(`${r}: not a list of integer seeds`)
        out.push([r, seeds])
      }
    }
  }
  if (existsSync(dir)) walk(dir, '')
  return out
}

/** The spent set: the historical list plus the registry, leaving out any registry file named in `except`. */
export function spentSet({ dir = REGISTRY, except = [] } = {}) {
  const spent = new Set(HISTORICAL_SPENT)
  for (const [rel, seeds] of readRegistry(dir)) if (!except.includes(rel)) for (const s of seeds) spent.add(s)
  return spent
}

/** `count` fresh seeds under `label`, skipping every seed in `spent`, by the seed rule. */
export async function drawSeeds(label, spent, count = 12) {
  const { hashSeed, mulberry32 } = await import(pathToFileURL(join(ROOT, 'lib/engine/rng.ts')).href)
  const r = mulberry32(hashSeed(label)())
  const seeds = []
  let skipped = 0
  while (seeds.length < count) {
    const v = 1000000 + Math.floor(r() * 9000000)
    if (seeds.includes(v) || spent.has(v)) {
      skipped++
      continue
    }
    seeds.push(v)
  }
  return { seeds, skipped }
}

async function main() {
  const args = process.argv.slice(2)
  const label = args[0]
  const di = args.indexOf('--dir')
  const name = di >= 0 ? args[di + 1] : label
  if (!label || label.startsWith('--') || !name) throw new Error('usage: node scripts/seeds-next.mjs <label> [--dir <name>]')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new Error(`--dir ${name}: a letter or digit, then letters, digits, dots, dashes and underscores`)
  const outFile = join(REGISTRY, name, 'SEEDS')
  if (existsSync(outFile)) throw new Error(`scripts/seeds/${name}/SEEDS exists - a draw is made once`)
  const spent = spentSet()
  const { seeds, skipped } = await drawSeeds(label, spent)
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, seeds.join('\n') + '\n')
  console.log(`${label}: ${seeds.join(' ')}  (skipped ${skipped} spent; ${spent.size} spent on file) -> scripts/seeds/${name}/SEEDS`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
