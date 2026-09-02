/**
 * gen-fingerprints.mjs — calibrates the v1.0 style classifier's fingerprints and writes them
 * to `lib/engine/bots/data/fingerprints.ts` as committed, typechecked data.
 *
 * `node scripts/gen-fingerprints.mjs [--games N] [--out FILE]`
 *
 * Per style (all nine of STYLES.md §3): `--games` (default 150) **mirror** games — all six
 * seats play the same style — under `us54`, seeds `fingerprint-v1-<style>-<i>`, start seat
 * `i % 6`, step cap 5000. Mirrors on purpose: a fingerprint should describe what a style does,
 * not what its opponents let it do, and in a mirror every seat's behaviour carries the label.
 * Both orientations of a duplicate pair would be pointless here — the two teams are the same
 * policy — so single games with rotating start seats stand in for the lab's pairing discipline.
 *
 * The play loop is the action-selection half of lib/lab/play.ts (no counters, no god's-eye
 * bookkeeping), with the exact lab seeding: `decide(seatView, style, hashSeed(seed:moveIndex))`.
 * Each finished game is observed through `observeSeats` — the same code path the classifier
 * reads at runtime, which is the whole point — once on the full log and once per checkpoint in
 * {60, 120, 200, 300} by slicing the log. A sliced view's top-level `counts` describe the end
 * of the game, not the truncation point; `observeSeats` replays counts from the log alone and
 * never reads them, which is what makes the truncation honest (see observe.ts's header).
 * A checkpoint only collects games whose log is strictly longer than it — a shorter game
 * belongs to the 'full' bucket, and letting it also stand in for "300 events of a running
 * game" would blur the two populations the classifier distinguishes.
 *
 * Deliberately thin, like every script here: `scripts/` is linted but NOT typechecked, so this
 * file only parses flags, runs the loop, and writes the file; the observation semantics live in
 * lib/engine/bots/observe.ts, which is typechecked and tested.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 23 || (major === 23 && minor < 6)) {
  console.error(
    `node ${process.versions.node} cannot import TypeScript directly; run with Node 23.6+ (this repo develops on Node 24).`,
  )
  process.exit(1)
}

const {
  STYLE_IDS,
  STYLE_ROSTER,
  decide,
  hashSeed,
  legalActionsSummary,
  newGame,
  publicView,
  reduce,
  seatView,
  us54Config,
} = await import('../lib/engine/index.ts')
const { FEATURE_KEYS, featureVector, observeSeats } = await import('../lib/engine/bots/observe.ts')

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1)
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i]
    else out[a.slice(2)] = 'true'
  }
  return out
}

const opt = args(process.argv.slice(2))
const games = Math.max(1, Number(opt.games ?? 150))
const outPath = resolve(process.cwd(), opt.out ?? 'lib/engine/bots/data/fingerprints.ts')

const SEED_PREFIX = 'fingerprint-v1'
const STEP_CAP = 5000
const CHECKPOINTS = [60, 120, 200, 300]
const BUCKETS = [...CHECKPOINTS.map(String), 'full']

/**
 * `Object.hasOwn` before the roster lookup, per the house convention for any id-keyed read of
 * a plain object — here the ids come from STYLE_IDS itself, so this is a tripwire against the
 * two constants ever drifting apart, not against untrusted input.
 */
function styleOf(id) {
  if (typeof id !== 'string' || !Object.hasOwn(STYLE_ROSTER, id)) {
    throw new Error(`gen-fingerprints: STYLE_IDS names a style the roster does not have: ${String(id)}`)
  }
  return STYLE_ROSTER[id]
}

/** One mirror game; returns the final public view. Throws on any illegal action or a capped game. */
function playMirror(style, seed, startSeat) {
  const policy = styleOf(style)
  let s = newGame(seed, us54Config, startSeat)
  let steps = 0
  while (s.phase !== 'finished') {
    if (steps >= STEP_CAP) throw new Error(`gen-fingerprints: ${seed} hit the ${STEP_CAP}-step cap — run void`)
    const { seat } = legalActionsSummary(s)
    const action = decideAt(s, seat, policy, seed)
    const r = reduce(s, action)
    if (!r.ok) {
      throw new Error(`gen-fingerprints: ${seed} rejected ${JSON.stringify(action)} — ${r.error.code}`)
    }
    s = r.state
    steps++
  }
  return publicView(s)
}

function decideAt(s, seat, policy, seed) {
  return decide(seatView(s, seat), policy, hashSeed(`${seed}:${s.moveIndex}`)())
}

/** Column means and sample SDs (n-1; 0 when n < 2) over a list of equal-length vectors. */
function stats(vectors) {
  const n = vectors.length
  const dim = FEATURE_KEYS.length
  const mean = new Array(dim).fill(0)
  const sd = new Array(dim).fill(0)
  if (n === 0) return { mean, sd, n }
  for (const v of vectors) for (let i = 0; i < dim; i++) mean[i] += v[i]
  for (let i = 0; i < dim; i++) mean[i] /= n
  if (n >= 2) {
    for (const v of vectors) for (let i = 0; i < dim; i++) sd[i] += (v[i] - mean[i]) ** 2
    for (let i = 0; i < dim; i++) sd[i] = Math.sqrt(sd[i] / (n - 1))
  }
  return { mean, sd, n }
}

/** Deterministic compact number rendering: 8 significant digits, round-tripped through Number. */
function fmt(x) {
  return String(Number(x.toPrecision(8)))
}

const t0 = Date.now()
const perStyle = {}
const samples = {}
for (const style of STYLE_IDS) {
  const vectors = Object.fromEntries(BUCKETS.map((b) => [b, []]))
  const st0 = Date.now()
  for (let i = 0; i < games; i++) {
    const pv = playMirror(style, `${SEED_PREFIX}-${style}-${i}`, i % 6)
    for (const obs of observeSeats(pv)) vectors.full.push(featureVector(obs))
    for (const cp of CHECKPOINTS) {
      if (pv.log.length <= cp) continue
      const truncated = { ...pv, log: pv.log.slice(0, cp) }
      for (const obs of observeSeats(truncated)) vectors[String(cp)].push(featureVector(obs))
    }
  }
  perStyle[style] = {}
  samples[style] = {}
  for (const b of BUCKETS) {
    const s = stats(vectors[b])
    samples[style][b] = s.n
    // A checkpoint no game of this style ever reached falls back to the full-game stats —
    // recorded honestly as samples 0, so the substitution is visible in the provenance.
    perStyle[style][b] = s.n > 0 ? s : { ...stats(vectors.full), n: 0 }
  }
  console.log(
    `  ${style}: ${games} mirror games in ${((Date.now() - st0) / 1000).toFixed(1)}s · ` +
      BUCKETS.map((b) => `${b}:${samples[style][b]}`).join(' '),
  )
}
const wallMs = Date.now() - t0
const generatedAt = new Date().toISOString()

// --- emit ------------------------------------------------------------------------------------
const lines = []
lines.push('/**')
lines.push(' * fingerprints.ts — GENERATED by `node scripts/gen-fingerprints.mjs`. Do not edit by hand;')
lines.push(' * re-run the generator and commit the result.')
lines.push(' *')
lines.push(` * Per style of STYLES.md §3: ${games} us54 mirror games (all six seats the same style),`)
lines.push(` * seeds \`${SEED_PREFIX}-<style>-<i>\`, start seat \`i % 6\`, observed through`)
lines.push(' * `observeSeats` (lib/engine/bots/observe.ts) on the full log and on log prefixes of')
lines.push(` * {${CHECKPOINTS.join(', ')}} events. Each bucket holds the mean and sample SD of the`)
lines.push(' * FEATURE_KEYS vector over every seat of every qualifying game; a checkpoint bucket only')
lines.push(' * collects games whose log outlived it (samples per bucket are in the provenance, and a')
lines.push(' * bucket nothing reached carries the full-game stats with samples 0).')
lines.push(' *')
lines.push(' * **This table is a function of the POLICY, not just of the styles.** The mirror games are')
lines.push(' * played by `decide`, and `FEATURE_KEYS` includes `deadAskShare`, `certainAskShare`,')
lines.push(' * `completionAskShare` and `hitRate` — every one of them a description of what the ask')
lines.push(' * scorer chose. A change to the scorer therefore moves the population the fingerprints')
lines.push(' * describe while leaving the committed table where it was, and a stale table degrades')
lines.push(' * `classifySeats` silently: the suite stays green except for the one loose smoke test, and')
lines.push(' * the loss shows up as a capability number nobody re-measured. MONET.md §3.2 is the worked')
lines.push(' * example — the two `rankAsksWith` corrections took the turtle-vs-punter read from 0.3407')
lines.push(' * of reads down to 0.2370, barely above the 0.2222 chance rate, until this was re-run.')
lines.push(' * **Regenerate whenever `knowledge.ts`, `decide.ts`, `style.ts` or `roster.ts` changes what')
lines.push(' * a style plays**, and record the before/after read in the milestone.')
lines.push(' */')
lines.push(`import type { StyleId } from '../roster.ts'`)
lines.push('')
lines.push(`export const FINGERPRINT_BUCKET_IDS = ['60', '120', '200', '300', 'full'] as const`)
lines.push('export type FingerprintBucketId = (typeof FINGERPRINT_BUCKET_IDS)[number]')
lines.push('')
lines.push('export interface FingerprintStats {')
lines.push('  readonly mean: readonly number[]')
lines.push('  readonly sd: readonly number[]')
lines.push('}')
lines.push('')
lines.push('export type FingerprintTable = Readonly<')
lines.push('  Record<StyleId, Readonly<Record<FingerprintBucketId, FingerprintStats>>>')
lines.push('>')
lines.push('')
lines.push('export const FINGERPRINTS: FingerprintTable = {')
for (const style of STYLE_IDS) {
  lines.push(`  ${style}: {`)
  for (const b of BUCKETS) {
    const key = b === 'full' ? 'full' : `'${b}'`
    const { mean, sd } = perStyle[style][b]
    lines.push(`    ${key}: {`)
    lines.push(`      mean: [${mean.map(fmt).join(', ')}],`)
    lines.push(`      sd: [${sd.map(fmt).join(', ')}],`)
    lines.push('    },')
  }
  lines.push('  },')
}
lines.push('}')
lines.push('')
lines.push('export const FINGERPRINT_PROVENANCE = {')
lines.push(`  generatedAt: '${generatedAt}',`)
lines.push(`  command: 'node scripts/gen-fingerprints.mjs --games ${games}',`)
lines.push(`  gamesPerStyle: ${games},`)
lines.push(`  seedPrefix: '${SEED_PREFIX}',`)
lines.push(`  variant: 'us54',`)
lines.push(`  stepCap: ${STEP_CAP},`)
lines.push(`  checkpoints: [${CHECKPOINTS.join(', ')}],`)
lines.push(`  featureKeys: [${FEATURE_KEYS.map((k) => `'${k}'`).join(', ')}],`)
lines.push('  /** Seat-vectors per style per bucket (6 per qualifying game); 0 marks a full-stats fallback. */')
lines.push('  samples: {')
for (const style of STYLE_IDS) {
  const row = BUCKETS.map((b) => `${b === 'full' ? 'full' : `'${b}'`}: ${samples[style][b]}`).join(', ')
  lines.push(`    ${style}: { ${row} },`)
}
lines.push('  },')
lines.push('} as const')
lines.push('')

await mkdir(dirname(outPath), { recursive: true })
// CRLF, like every other file in this repository (and like `scripts/byte-identity.mjs`'s bank
// emitter, for the reason recorded there). `core.autocrlf` normalises it away in the index either
// way; what this avoids is the generated file being the one file on disk that is not CRLF.
await writeFile(outPath, lines.join('\r\n'), 'utf8')
console.log(`wrote ${outPath} (${STYLE_IDS.length} styles x ${BUCKETS.length} buckets) in ${(wallMs / 1000).toFixed(1)}s`)
