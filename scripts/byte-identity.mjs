/**
 * byte-identity.mjs — MONET.md §3.1 acceptance item 1, made re-runnable.
 *
 * *"Byte identity to FishAI v2.0 — 0 action mismatches over >= 20,000 us54 decisions across the
 * roster against committed HEAD. This is a pass/fail with no floor: one mismatch fails it."*
 *
 * A vitest file cannot check out another revision, so the *cross-revision* half of that promise
 * has to live here. It ran once from a session scratchpad and would have vanished with it,
 * leaving v0.1's whole premise unverifiable the moment v0.2 landed. This is that sweep, in the
 * repository, pointed at any revision rather than at one machine's temp directory.
 *
 *   ARM A (the candidate) : the WORKING TREE's lib/, policy = `monetPolicy(--version)`.
 *   ARM B (the reference) : a COMMITTED revision's lib/, materialised file by file with
 *                           `git show <rev>:<path>` — never a hand-copied subset. A partial copy
 *                           silently inherits the working tree's roster through a stale import,
 *                           which is exactly how the roster-defuse contamination happened.
 *                           The reference policy is spelled both ways the v2.0 arm was ever
 *                           addressed in (MONET.md §1.1, STYLES.md §2):
 *                             B1 = { skill: SKILL_PRESETS.hard, style: STYLE_ROSTER.<style> }
 *                             B2 = STYLE_ROSTER.<style>                (played at full strength)
 *
 * The two arms are separate module graphs loaded from different paths, so this is a real
 * cross-revision comparison and not `x === x`. The object-identity guard below is what enforces
 * that, and it is fatal: a sweep that cannot tell the two trees apart proves nothing.
 *
 * ## Usage
 *
 *   node scripts/byte-identity.mjs                        # working tree vs HEAD, 8 seeds/table
 *   node scripts/byte-identity.mjs --ref v2.0-tag         # ...against any revision
 *   node scripts/byte-identity.mjs --seeds 2              # quick
 *   MUTATE=hoarder node scripts/byte-identity.mjs         # NEGATIVE CONTROL: must FAIL
 *   node scripts/byte-identity.mjs --emit-bank tests/bots/data/monet-v01-bank.ts
 *
 * `MUTATE=<styleId>` re-points the reference arm at a different roster style. It must make the
 * harness fail: a sweep reporting 0 mismatches no matter what it is pointed at is not evidence
 * of anything, and this is the cheapest way to keep proving that it is wired up. Never set it in
 * a real run.
 *
 * `--emit-bank <path>` writes the HEAD-pinned action bank that `tests/bots/monet.test.ts`
 * replays. That fixture is what survives this session: the sweep proves identity *now*, the bank
 * keeps failing on a `decide.ts` regression a month from now, when no reference tree is at hand.
 * The bank is generated entirely from the REFERENCE tree — its `newGame`, its `reduce`, its
 * `decide`, its roster — so it records what FishAI v2.0 did, not what the candidate does.
 *
 * Exit code is the verdict: 0 pass, 1 fail, 2 the harness could not be trusted to answer.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { ActionDigest, canonicalAction } from '../tests/bots/action-digest.ts'

/* ------------------------------------------------------------------------ arguments --- */
const argv = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = argv.indexOf(name)
  return i === -1 ? fallback : argv[i + 1]
}
const REF = argOf('--ref', 'HEAD')
const VERSION = argOf('--version', 'v0.1')
const SEEDS_PER_TABLE = Number(argOf('--seeds', process.env.SEEDS ?? 8))
const EMIT_BANK = argOf('--emit-bank', null)
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')

const git = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28 })

/* --------------------------------------------------- materialise the reference tree --- */
const refSha = git(['rev-parse', REF]).trim()
const refRoot = mkdtempSync(path.join(tmpdir(), 'fishai-byte-identity-'))
process.on('exit', () => {
  try {
    rmSync(refRoot, { recursive: true, force: true })
  } catch {
    /* a leftover temp directory is not worth failing the verdict over */
  }
})
const refFiles = git(['ls-tree', '-r', '--name-only', refSha, '--', 'lib']).split('\n').filter(Boolean)
if (refFiles.length === 0) {
  console.error(`FATAL: ${REF} (${refSha}) has no lib/ tree`)
  process.exit(2)
}
for (const rel of refFiles) {
  const dest = path.join(refRoot, rel)
  mkdirSync(path.dirname(dest), { recursive: true })
  // Byte-for-byte from the object store. `git show` writes the blob, not the worktree file, so
  // an unstaged edit in the working copy cannot leak into the reference arm.
  writeFileSync(dest, execFileSync('git', ['show', `${refSha}:${rel}`], { cwd: REPO, maxBuffer: 1 << 28 }))
}

/* ------------------------------------------------------------------ load both graphs --- */
const wtUrl = (p) => pathToFileURL(path.join(REPO, p)).href
const refUrl = (p) => pathToFileURL(path.join(refRoot, p)).href

const WT = await import(wtUrl('lib/engine/index.ts'))
const wtMonet = await import(wtUrl('lib/engine/bots/monet.ts'))
const wtRoster = await import(wtUrl('lib/engine/bots/roster.ts'))

const REFENG = await import(refUrl('lib/engine/index.ts'))
const refRoster = await import(refUrl('lib/engine/bots/roster.ts'))
const refStyle = await import(refUrl('lib/engine/bots/style.ts'))

const CANDIDATE = wtMonet.monetPolicy(VERSION)
const REF_STYLE = process.env.MUTATE ?? 'punter'
const REF_ARMS = [
  {
    name: `${REF} explicit { skill: hard, style: ${REF_STYLE} }`,
    policy: { skill: refStyle.SKILL_PRESETS.hard, style: refRoster.STYLE_ROSTER[REF_STYLE] },
  },
  { name: `${REF} bare STYLE_ROSTER.${REF_STYLE}`, policy: refRoster.STYLE_ROSTER[REF_STYLE] },
]
if (refRoster.STYLE_ROSTER[REF_STYLE] === undefined) {
  console.error(`FATAL: ${REF} has no roster style '${REF_STYLE}'`)
  process.exit(2)
}
// The one guard that makes the whole run non-vacuous. If the two imports resolved to the same
// module instance there is only one revision in the room and every comparison is `x === x`.
if (refRoster.STYLE_ROSTER[REF_STYLE] === wtRoster.STYLE_ROSTER[REF_STYLE]) {
  console.error('FATAL: reference and working-tree rosters are the SAME object — not a cross-revision run')
  process.exit(2)
}
// Not fatal: a later reference revision may legitimately ship monet.ts. Worth saying out loud,
// because against such a reference "identical to the v2.0 arm" is no longer what is being tested.
let refHasMonet = false
try {
  await import(refUrl('lib/engine/bots/monet.ts'))
  refHasMonet = true
} catch {
  /* expected of any FishAI v2.0-era revision */
}

/* ------------------------------------------------------------------------ the sweep --- */
const STYLE_IDS = wtRoster.STYLE_IDS
const tally = {
  games: 0,
  decisions: 0,
  comparisons: 0,
  mismatches: 0,
  keyOrderDiffs: 0,
  byKind: Object.create(null),
  tables: new Set(),
  seeds: new Set(),
}
const examples = []

function playIdentity(tableName, policyFor, gameSeed, startSeat) {
  let s = WT.newGame(gameSeed, WT.us54Config, startSeat)
  let steps = 0
  while (s.phase !== 'finished') {
    if (steps >= 5000) throw new Error(`${tableName}/${gameSeed}: 5000-step cap`)
    const { seat } = WT.legalActionsSummary(s)
    const view = WT.seatView(s, seat)
    const moveSeed = WT.hashSeed(`${gameSeed}:${s.moveIndex}`)()

    const a = WT.decide(view, CANDIDATE, moveSeed)
    const ca = canonicalAction(a)
    const ra = JSON.stringify(a)
    tally.byKind[a.type] = (tally.byKind[a.type] ?? 0) + 1

    for (const arm of REF_ARMS) {
      const b = REFENG.decide(view, arm.policy, moveSeed)
      tally.comparisons++
      if (canonicalAction(b) !== ca) {
        tally.mismatches++
        if (examples.length < 10) {
          examples.push({ table: tableName, gameSeed, step: steps, seat, arm: arm.name, candidate: a, reference: b })
        }
      } else if (JSON.stringify(b) !== ra) {
        tally.keyOrderDiffs++
      }
    }
    tally.decisions++

    const r = WT.reduce(s, WT.decide(view, policyFor(seat), moveSeed))
    if (!r.ok) throw new Error(`${tableName}/${gameSeed} step ${steps}: ${r.error.code}`)
    s = r.state
    steps++
  }
  tally.games++
  tally.tables.add(tableName)
  tally.seeds.add(gameSeed)
}

const t0 = Date.now()

/* Every uniform roster table: the identity claim is about the policy, so it must hold at every
 * position us54 can produce — including the ones Punter's own play never reaches. */
for (const id of STYLE_IDS) {
  const st = wtRoster.STYLE_ROSTER[id]
  for (let g = 0; g < SEEDS_PER_TABLE; g++) playIdentity(id, () => st, `gate4-${id}-${g}`, (g * 5 + 1) % 6)
}
/* One mixed table: six different styles at the six seats, rotated per seed. */
for (let g = 0; g < SEEDS_PER_TABLE; g++) {
  const pick = (seat) => wtRoster.STYLE_ROSTER[STYLE_IDS[(seat + g) % STYLE_IDS.length]]
  playIdentity('mixed', pick, `gate4-mixed-${g}`, (g * 5 + 1) % 6)
}
/* One table where every seat plays the candidate itself — the arm's own positions. */
for (let g = 0; g < SEEDS_PER_TABLE; g++) {
  playIdentity(`monet-${VERSION}-mirror`, () => CANDIDATE, `gate4-monet-${g}`, (g * 5 + 1) % 6)
}

const secs = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`=== byte identity: Monet ${VERSION} (working tree) vs ${REF} = ${refSha.slice(0, 12)} ===`)
console.log(`reference tree : ${refRoot} (${refFiles.length} files, git show ${refSha.slice(0, 12)}:<path>)`)
if (refHasMonet) console.log('NOTE           : the reference revision ships monet.ts — this is not a v2.0-era reference')
if (process.env.MUTATE) console.log(`NEGATIVE CONTROL: reference re-pointed at STYLE_ROSTER.${REF_STYLE} — this run MUST fail`)
console.log(`tables         : ${tally.tables.size} (${[...tally.tables].join(', ')})`)
console.log(`game seeds     : ${tally.seeds.size}`)
console.log(`games          : ${tally.games}`)
console.log(`DECISIONS      : ${tally.decisions}`)
console.log(`COMPARISONS    : ${tally.comparisons}  (${REF_ARMS.length} reference spellings per decision)`)
console.log(`action kinds   : ${JSON.stringify(tally.byKind)}`)
console.log(`key-order-only : ${tally.keyOrderDiffs}`)
console.log(`MISMATCHES     : ${tally.mismatches}`)
console.log(`elapsed        : ${secs}s`)
for (const e of examples) console.log(`MISMATCH ${JSON.stringify(e)}`)

/* ---------------------------------------------------------------- the action bank --- */
/**
 * The bank schedule. It is written INTO the fixture rather than duplicated in the test, so the
 * two cannot drift: `monet.test.ts` replays whatever schedule the bank says it was built from.
 */
function bankSchedule(styleIds, seedsPerTable) {
  // `v0.1` -> `v01`: the seed strings the in-graph pin has always used, kept so the bank covers
  // the same 27 games and the same 20,217 decisions rather than a differently-shaped bank that
  // happens to be the same size.
  const tag = VERSION.replace(/\./g, '')
  const rows = []
  for (const id of styleIds) {
    for (let g = 0; g < seedsPerTable; g++) {
      rows.push({ table: id, seed: `monet-${tag}-${id}-${g}`, startSeat: (g * 2 + 1) % 6 })
    }
  }
  return rows
}

if (EMIT_BANK) {
  if (tally.mismatches > 0) {
    console.error('REFUSING to emit a bank from a run with mismatches — fix the divergence first')
    process.exit(1)
  }
  if (process.env.MUTATE) {
    console.error('REFUSING to emit a bank from a MUTATE negative-control run')
    process.exit(2)
  }
  const refPunter = refRoster.STYLE_ROSTER.punter
  const refArm = { skill: refStyle.SKILL_PRESETS.hard, style: refPunter }
  const games = []
  let total = 0
  // Driven ENTIRELY by the reference tree — its newGame, its reduce, its roster, its decide.
  // The bank must record what FishAI v2.0 did; borrowing the candidate's game loop would let a
  // change there hide inside the fixture it is supposed to be measured against.
  for (const row of bankSchedule(refRoster.STYLE_IDS, 3)) {
    const table = refRoster.STYLE_ROSTER[row.table]
    let s = REFENG.newGame(row.seed, REFENG.us54Config, row.startSeat)
    const d = new ActionDigest()
    let steps = 0
    while (s.phase !== 'finished') {
      if (steps >= 5000) throw new Error(`bank ${row.table}/${row.seed}: 5000-step cap`)
      const { seat } = REFENG.legalActionsSummary(s)
      const view = REFENG.seatView(s, seat)
      const moveSeed = REFENG.hashSeed(`${row.seed}:${s.moveIndex}`)()
      d.push(canonicalAction(REFENG.decide(view, refArm, moveSeed)))
      const r = REFENG.reduce(s, REFENG.decide(view, table, moveSeed))
      if (!r.ok) throw new Error(`bank ${row.table}/${row.seed} step ${steps}: ${r.error.code}`)
      s = r.state
      steps++
    }
    total += d.count
    games.push({ ...row, decisions: d.count, digest: d.hex() })
  }

  const L = []
  L.push('/**')
  L.push(' * monet-v01-bank.ts — GENERATED. Do not edit by hand.')
  L.push(' *')
  L.push(` * \`node scripts/byte-identity.mjs --ref ${REF} --emit-bank ${EMIT_BANK}\``)
  L.push(' *')
  L.push(' * The FishAI v2.0 arm\'s own decisions, recorded from a COMMITTED revision and pinned here so')
  L.push(' * that Monet\'s identity claim survives the session it was measured in. Each row is one whole')
  L.push(' * `us54` game: the table style drives it, and the digest runs over the canonical form of the')
  L.push(' * action the v2.0 arm — `{ skill: SKILL_PRESETS.hard, style: STYLE_ROSTER.punter }` — returned')
  L.push(' * at every decision point, in order (`tests/bots/action-digest.ts`).')
  L.push(' *')
  L.push(' * The in-graph pin in `monet.test.ts` cannot fail on a `decide.ts` regression: both of its arms')
  L.push(' * are the same imported `decide`, so an edit moves them together and the suite stays green.')
  L.push(' * This fixture is the half that can. It was generated from another revision\'s module graph, so')
  L.push(' * a `decide.ts`, `roster.ts`, `style.ts` or `reduce.ts` change that moves a single action of a')
  L.push(' * single game breaks a digest here — which is exactly what "no behaviour change" means.')
  L.push(' *')
  L.push(' * Regenerating it is a deliberate act, not a fix for a red test: a changed digest is a report')
  L.push(' * that v0.1 no longer plays FishAI v2.0\'s games, and that is the acceptance criterion itself.')
  L.push(' */')
  L.push('')
  L.push('/** One whole `us54` game of the bank. */')
  L.push('export interface BankGame {')
  L.push('  /** Roster style every seat plays; it drives the game, so it fixes the positions visited. */')
  L.push('  table: string')
  L.push('  /** Game seed. Move seeds are `hashSeed(`${seed}:${moveIndex}`)()`, as the lab derives them. */')
  L.push('  seed: string')
  L.push('  startSeat: number')
  L.push('  /** Decision points in this game — a shrunken bank is a silently weakened pin. */')
  L.push('  decisions: number')
  L.push('  /** `ActionDigest` over the reference arm\'s canonical actions, in order. */')
  L.push('  digest: string')
  L.push('}')
  L.push('')
  L.push('export const MONET_V01_BANK = {')
  L.push(`  /** The revision the bank was recorded from. */`)
  L.push(`  revision: '${refSha}',`)
  L.push(`  /** How that revision's v2.0 arm was addressed while recording. */`)
  L.push(`  arm: '{ skill: SKILL_PRESETS.hard, style: STYLE_ROSTER.punter }',`)
  L.push(`  totalDecisions: ${total},`)
  L.push('  games: [')
  for (const g of games) {
    L.push(
      `    { table: '${g.table}', seed: '${g.seed}', startSeat: ${g.startSeat}, ` +
        `decisions: ${g.decisions}, digest: '${g.digest}' },`,
    )
  }
  L.push('  ] as const satisfies readonly BankGame[],')
  L.push('} as const')
  L.push('')
  const outPath = path.isAbsolute(EMIT_BANK) ? EMIT_BANK : path.join(REPO, EMIT_BANK)
  mkdirSync(path.dirname(outPath), { recursive: true })
  // CRLF: every file in this repository is CRLF and a mixed-ending fixture shows up as a
  // whole-file diff the next time anything touches it.
  writeFileSync(outPath, L.join('\r\n'))
  console.log(`BANK           : ${games.length} games, ${total} decisions -> ${outPath}`)
}

const pass = tally.mismatches === 0 && tally.decisions >= 20000
console.log(pass ? 'RESULT=PASS' : 'RESULT=FAIL')
process.exit(pass ? 0 : 1)
