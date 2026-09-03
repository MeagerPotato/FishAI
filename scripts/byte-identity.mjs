/**
 * byte-identity.mjs — MONET.md §3.1 acceptance item 1, made re-runnable.
 *
 * *"Byte identity to Bass v2.0 — 0 action mismatches over >= 20,000 us54 decisions across the
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
 *   node scripts/byte-identity.mjs --version v0.2 --emit-tree wt --bank-seeds 4 \
 *     --emit-bank tests/bots/data/monet-v02-bank.ts        # the v0.2 forward pin
 *
 *   node scripts/byte-identity.mjs --gate dead-ask --seeds 22        # MONET.md §3.2 acceptance 1
 *   node scripts/byte-identity.mjs --gate dead-ask --seeds 22 --gate-tree wt
 *   node scripts/byte-identity.mjs --gate dead-ask-full --seeds 22   # ...over the whole milestone
 *   MUTATE_FLOOR=0.5 node scripts/byte-identity.mjs --gate dead-ask  # NEGATIVE CONTROL: must FAIL
 *
 * `--gate dead-ask` and `--gate dead-ask-full` run DIFFERENT comparisons from the sweep above and
 * are documented at their own blocks below: the first isolates v0.2's `minHitP` knob, the second
 * diffs the whole milestone against a reference revision. **`--seeds 22`, not the default 8**: the
 * gate's bar is 20,000 asks with a live hit probability, and that population is about an eighth of
 * all decisions (measured: 3 seeds -> 22,446 decisions but only 2,774 protected).
 *
 * `MUTATE=<styleId>` re-points the reference arm at a different roster style. It must make the
 * harness fail: a sweep reporting 0 mismatches no matter what it is pointed at is not evidence
 * of anything, and this is the cheapest way to keep proving that it is wired up. Never set it in
 * a real run.
 *
 * `--emit-bank <path>` writes the action bank that `tests/bots/monet.test.ts` replays. That fixture
 * is what survives this session: the sweep proves identity *now*, the bank keeps failing on a
 * `decide.ts` regression a month from now, when no reference tree is at hand.
 *
 * `--emit-tree` chooses whose module graph records it:
 *   `ref` (default) — the REFERENCE tree entirely: its `newGame`, its `reduce`, its `decide`, its
 *                     roster. This records what the reference arm did, not what the candidate
 *                     does, and it is the only mode that can certify a *cross-revision* identity
 *                     claim. `monet-v01-bank.ts` was emitted this way.
 *   `wt`            — the WORKING TREE's, with the candidate's own policy as the arm. This proves
 *                     nothing about another revision; it is a forward baseline, recorded at the
 *                     moment a milestone ships so that the NEXT change has something to break.
 *                     Emit one only after the cross-revision gates have passed, because whatever
 *                     the working tree does at that moment is what gets frozen.
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
const EMIT_TREE = argOf('--emit-tree', 'ref')
// Seeds per roster table in an emitted bank. 3 is what `monet-v01-bank.ts` was built at (27 games,
// 20,217 decisions); a version whose games run shorter needs more of them to carry the same weight.
const BANK_SEEDS = Number(argOf('--bank-seeds', 3))
const GATE = argOf('--gate', null)
const GATE_TREE = argOf('--gate-tree', 'ref')
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
  /* expected of any Bass v2.0-era revision */
}

/* -------------------------------------------- MONET.md §3.2 acceptance item 1 --- */
/**
 * **The dead-ask floor's home-identity gate.** `--gate dead-ask`.
 *
 * *"Home identity on the unaffected population — every ask with p > 0 unchanged, 0 mismatches
 * over >= 20,000 decisions with `minHitP: 1e-9`."*
 *
 * This is NOT the byte-identity sweep above, and it must not be confused with it. v0.2 ships three
 * changes and only one of them is `minHitP`. This gate isolates that one, the only way that proves
 * anything about it alone: **both arms run the same code and the same weights, and differ in one
 * number.**
 *
 * It is deliberately only half of §3.2 item 1. The other two fixes are `rankAsksWith` code changes
 * that both arms here carry, so this gate holds them constant rather than testing them — and they
 * DO need testing, because item 1's claim is about the milestone, not about the knob. They are
 * structurally confined to `p == 0` (the narrowing credit is now gated on the target being a live
 * candidate, which is exactly the condition under which `pHit` is non-zero; the gamble guard fires
 * only when a card the asker's own team certainly holds is being asked for, which is dead by
 * construction) — so the whole-milestone diff CAN answer item 1, and `--gate dead-ask-full` below
 * is that diff. An earlier draft of this comment claimed the opposite, that the corrections move
 * live asks on purpose and that no whole-milestone diff could answer item 1. That was wrong, and
 * it left two thirds of the milestone with no gate at all.
 *
 *   ARM V01   : `minHitP` exactly as the reference revision ships it (0 for the seven styles
 *               that take it from BALANCED; banker 0.25 and turtle 0.4 untouched — those two
 *               already carried an appetite and v0.2 does not move them).
 *   ARM FLOOR : the same object with that 0 replaced by the floor, and nothing else.
 *
 * `--gate-tree` chooses whose code executes them:
 *   `ref` (default) — the reference revision's `lib/`, i.e. v0.1's scorer. Fixes 2 and 3 are
 *                     absent from BOTH arms by construction, so the only live variable in the
 *                     room is the knob. This is the literal "against v0.1" reading.
 *   `wt`            — the working tree's `lib/`, i.e. the shipped v0.2 scorer. Fixes 2 and 3 are
 *                     present in BOTH arms, so they are held constant and the knob is again the
 *                     only variable — but now the claim is checked on the code that ships.
 * Both readings have to hold. The first says the floor was safe to add to v0.1; the second says
 * it is still safe now that the scores underneath it moved.
 *
 * Both arms are evaluated at every position of ONE trajectory, driven by the v01 arm. A
 * re-trajectoried comparison would report divergence rather than identity: one different ask
 * early deals every later position differently, and counting those as mismatches measures the
 * game tree, not the knob.
 *
 * ## The population, and why the split is the whole point
 *
 * At each decision the v01 arm's action is classified by the base hit probability of the ask it
 * chose (`askHitProbability` — the same `pHit` both `minHitP` filter sites read, `decide.ts:986`
 * and `decide.ts:1109-1112`; the refined probability is not what the floor is applied to):
 *
 *   p > 0   the PROTECTED population. §3.2's claim is about exactly this set. Any mismatch here
 *           is a gate failure: the floor would have reordered an ask it has no business touching.
 *   p == 0  the population the floor exists to remove. Changes here are the milestone working,
 *           and they are counted rather than ignored — a run in which the floor never displaced
 *           a single dead ask has not tested the floor, and this harness refuses to pass one.
 *   non-ask claims and declares. Out of the floor's reach entirely; reported so that a surprise
 *           cannot hide in a bucket nobody prints.
 *
 * ## Proving it can fail
 *
 * `MUTATE_FLOOR=<x>` puts an arbitrary floor on the FLOOR arm instead of 1e-9. Anything above
 * 1/54 — the smallest non-zero `pHit` any us54 position can produce — starts refusing asks that
 * CAN hit, which lands in the protected population and must turn this gate red. A gate that
 * reports 0 mismatches no matter what floor it is handed is not evidence of anything. Never set
 * it in a real run.
 *
 * ---
 *
 * **The whole milestone's home-identity gate.** `--gate dead-ask-full`.
 *
 * The same claim, the same population split, the same one-trajectory discipline — but the two arms
 * are two REVISIONS rather than two values of one knob, so all three of v0.2's changes are in the
 * diff at once. This is the gate that actually answers §3.2 item 1.
 *
 *   ARM REF : the reference revision's `lib/`, at the reference revision's roster style — v0.1
 *             entire, code and spec.
 *   ARM WT  : the working tree's `lib/`, at the working tree's roster style — v0.2 entire.
 *
 * `--gate-tree` is meaningless here (the whole point is that the two arms are different trees) and
 * passing it is refused rather than ignored. The trajectory is driven by ARM REF and stepped by the
 * REFERENCE engine, so the positions are v0.1's own and the working tree cannot steer the sample it
 * is being judged on.
 *
 * Both `rankAsksWith` corrections are structurally confined to `p == 0`, so a PASS is the expected
 * result and not a surprise: what the gate buys is that the confinement is CHECKED on real games
 * rather than argued from the source. Every change it does find is reported in the `p == 0` bucket,
 * where the milestone is supposed to live.
 *
 * `MUTATE=<styleId>` is the negative control: it re-points ARM REF at a different roster style for
 * every seat, which changes live asks all over the protected population and must turn the gate red.
 *
 * Exit code is the verdict: 0 pass, 1 fail, 2 the harness could not be trusted to answer.
 */
if (GATE === 'dead-ask' || GATE === 'dead-ask-full') {
  const FULL = GATE === 'dead-ask-full'
  // The engine that STEPS the trajectory and classifies each decision. In `dead-ask-full` it is
  // always the reference's, because the trajectory is v0.1's own; the working tree only answers
  // the questions it is asked.
  const ENG = !FULL && GATE_TREE === 'wt' ? WT : REFENG
  const OWN = !FULL && GATE_TREE === 'wt' ? wtRoster : refRoster
  const treeLabel = FULL
    ? `ARM REF ${REF} = ${refSha.slice(0, 12)}  vs  ARM WT working tree`
    : GATE_TREE === 'wt'
      ? 'WORKING TREE (v0.2 scorer)'
      : `${REF} = ${refSha.slice(0, 12)} (v0.1 scorer)`
  const GSTYLE_IDS = OWN.STYLE_IDS
  const FLOOR = Number(process.env.MUTATE_FLOOR ?? '1e-9')
  if (!Number.isFinite(FLOOR) || FLOOR <= 0) {
    console.error(`FATAL: MUTATE_FLOOR=${process.env.MUTATE_FLOOR} is not a positive number`)
    process.exit(2)
  }
  if (GATE_TREE !== 'wt' && GATE_TREE !== 'ref') {
    console.error(`FATAL: --gate-tree must be 'ref' or 'wt', got '${GATE_TREE}'`)
    process.exit(2)
  }
  // Refused rather than ignored: `--gate-tree` names one tree, and this gate's whole claim is that
  // it ran two. Silently dropping the flag would let a run be quoted as something it was not.
  if (FULL && argv.includes('--gate-tree')) {
    console.error("FATAL: --gate-tree is meaningless for 'dead-ask-full' — it diffs two trees by construction")
    process.exit(2)
  }
  if (FULL && process.env.MUTATE_FLOOR) {
    console.error("FATAL: MUTATE_FLOOR is the knob gate's negative control; use MUTATE=<styleId> for 'dead-ask-full'")
    process.exit(2)
  }
  if (FULL && refRoster.STYLE_IDS.join(',') !== wtRoster.STYLE_IDS.join(',')) {
    console.error('FATAL: the two revisions ship different roster style lists — no per-style pairing exists')
    process.exit(2)
  }

  /**
   * The two arms for one style.
   *
   * `dead-ask` — `minHitP` is read off the REFERENCE roster in both trees, so "what v0.1 shipped"
   * is never guessed from a working tree that has already been changed. Every other parameter
   * comes from the tree whose code is running, so the arms differ in one number and the spread is
   * the only thing between them.
   *
   * `dead-ask-full` — no spread at all. Each arm is its own revision's roster entry played by its
   * own revision's `decide`, which is what makes the diff the whole milestone rather than a knob.
   * `MUTATE` re-points ARM REF's style and must break it.
   */
  const armsFor = (id) => {
    if (FULL) {
      const refStyleFor = refRoster.STYLE_ROSTER[process.env.MUTATE ?? id]
      return {
        v01: { skill: refStyle.SKILL_PRESETS.hard, style: refStyleFor },
        floor: { skill: WT.SKILL_PRESETS.hard, style: wtRoster.STYLE_ROSTER[id] },
        // Two different revisions' objects: never the same object, so the pairing is never `x === x`.
        moved: true,
      }
    }
    const own = OWN.STYLE_ROSTER[id]
    const v01Floor = refRoster.STYLE_ROSTER[id].minHitP
    const base = { ...own, minHitP: v01Floor }
    const floored = { ...own, minHitP: v01Floor === 0 ? FLOOR : v01Floor }
    return {
      v01: { skill: ENG.SKILL_PRESETS.hard, style: base },
      floor: { skill: ENG.SKILL_PRESETS.hard, style: floored },
      moved: base.minHitP !== floored.minHitP,
    }
  }
  // Non-vacuity, checked before a single game is played: if the knob is identical in both arms
  // for every style there is nothing under test.
  if (!GSTYLE_IDS.some((id) => armsFor(id).moved)) {
    console.error('FATAL: the two arms carry the same minHitP for every style — nothing under test')
    process.exit(2)
  }

  const g = {
    games: 0,
    decisions: 0,
    protected: 0,
    protectedMismatch: 0,
    dead: 0,
    deadChanged: 0,
    nonAsk: 0,
    nonAskChanged: 0,
    smallestLiveP: 1,
    tables: new Set(),
  }
  const gExamples = []

  function playGate(tableName, styleForSeat, gameSeed, startSeat) {
    let s = ENG.newGame(gameSeed, ENG.us54Config, startSeat)
    let steps = 0
    while (s.phase !== 'finished') {
      if (steps >= 5000) throw new Error(`${tableName}/${gameSeed}: 5000-step cap`)
      const { seat } = ENG.legalActionsSummary(s)
      const view = ENG.seatView(s, seat)
      const moveSeed = ENG.hashSeed(`${gameSeed}:${s.moveIndex}`)()
      const arms = armsFor(styleForSeat(seat))

      // In `dead-ask-full` the second arm is a whole other revision's `decide`, run on the same
      // `SeatView` and the same move seed. `SeatView` is plain data and the two engines agree on
      // its shape (`bots/types.ts` is unchanged across the milestone), so handing the reference
      // tree's view to the working tree's policy is a read, not a crossing of module graphs.
      const a = ENG.decide(view, arms.v01, moveSeed)
      const b = FULL ? WT.decide(view, arms.floor, moveSeed) : ENG.decide(view, arms.floor, moveSeed)
      const same = canonicalAction(a) === canonicalAction(b)
      g.decisions++

      if (a.type === 'ask') {
        // The knowledge the filter sites see, rebuilt from the same view they get it from.
        const p = ENG.askHitProbability(ENG.buildKnowledge(view), a.card, a.target)
        if (p > 0) {
          g.protected++
          if (p < g.smallestLiveP) g.smallestLiveP = p
          if (!same) {
            g.protectedMismatch++
            if (gExamples.length < 10) {
              gExamples.push({ table: tableName, gameSeed, step: steps, seat, p, v01: a, floor: b })
            }
          }
        } else {
          g.dead++
          if (!same) g.deadChanged++
        }
      } else {
        g.nonAsk++
        if (!same) g.nonAskChanged++
      }

      // ONE trajectory, driven by the v01 arm, so both arms are asked the same questions.
      const r = ENG.reduce(s, ENG.decide(view, armsFor(styleForSeat(seat)).v01, moveSeed))
      if (!r.ok) throw new Error(`${tableName}/${gameSeed} step ${steps}: ${r.error.code}`)
      s = r.state
      steps++
    }
    g.games++
    g.tables.add(tableName)
  }

  const gt0 = Date.now()
  for (const id of GSTYLE_IDS) {
    for (let n = 0; n < SEEDS_PER_TABLE; n++) playGate(id, () => id, `deadask-${id}-${n}`, (n * 5 + 1) % 6)
  }
  for (let n = 0; n < SEEDS_PER_TABLE; n++) {
    const pick = (seat) => GSTYLE_IDS[(seat + n) % GSTYLE_IDS.length]
    playGate('mixed', pick, `deadask-mixed-${n}`, (n * 5 + 1) % 6)
  }
  const gsecs = ((Date.now() - gt0) / 1000).toFixed(1)

  console.log(`=== MONET.md §3.2 gate 1: home identity on the unaffected population ===`)
  console.log(`gate           : ${GATE}`)
  console.log(`code tree      : ${treeLabel}`)
  console.log(
    FULL
      ? `arms           : v0.1 entire (code + spec) vs v0.2 entire — all three changes in the diff`
      : `arms           : minHitP ${JSON.stringify(refRoster.STYLE_ROSTER.punter.minHitP)} vs ${FLOOR}, everything else held equal`,
  )
  if (process.env.MUTATE_FLOOR) console.log(`NEGATIVE CONTROL: MUTATE_FLOOR=${FLOOR} — above 1/54 this run MUST fail`)
  if (FULL && process.env.MUTATE) {
    console.log(`NEGATIVE CONTROL: ARM REF re-pointed at STYLE_ROSTER.${process.env.MUTATE} — this run MUST fail`)
  }
  console.log(`tables         : ${g.tables.size}`)
  console.log(`games          : ${g.games}`)
  console.log(`DECISIONS      : ${g.decisions}`)
  console.log(`  ask, p > 0   : ${g.protected}   <- the protected population, and the gate's denominator`)
  console.log(`  ask, p == 0  : ${g.dead}   (of which changed ${g.deadChanged})`)
  console.log(`  non-ask      : ${g.nonAsk}   (of which changed ${g.nonAskChanged})`)
  console.log(`smallest live p: ${g.smallestLiveP}  (1/54 = ${1 / 54})`)
  console.log(`MISMATCHES     : ${g.protectedMismatch}  (out of ${g.protected} protected)`)
  console.log(`elapsed        : ${gsecs}s`)
  for (const e of gExamples) console.log(`MISMATCH ${JSON.stringify(e)}`)

  const gatePass = g.protectedMismatch === 0
  // The vacuity guards qualify a PASS and only a PASS. A run that produced mismatches has plainly
  // exercised both arms — the mismatches are the proof — so it must be allowed to report FAIL
  // rather than being talked out of its verdict by a sample-size check. Ordering these the other
  // way round is how the `MUTATE_FLOOR=0.5` negative control first came back as "could not
  // answer": a high floor is waived at almost every dead ask (`preferredAsk`'s all-or-nothing
  // fallback), so `deadChanged` legitimately reads 0 while the protected population is in ruins.
  if (gatePass) {
    // 0 mismatches from a sweep where nothing was ever displaced is an artefact of nothing having
    // happened, not evidence that nothing moved. That is not a pass.
    if (g.deadChanged === 0) {
      console.error('FATAL: no dead ask changed anywhere in this sweep — the gate is vacuous')
      process.exit(2)
    }
    // §3.2 item 1 counts ASKS WITH p > 0, because that is the population its claim is about. The
    // total decision count is the wrong denominator and clears the bar with roughly a seventh of
    // the required sample: at `--seeds 3` a run has 22,446 decisions but only 2,774 protected
    // asks, so it would have "passed" a 20,000 bar on 30 games. Protected is about an eighth of
    // decisions, which puts the honest requirement at `--seeds 22` or above.
    if (g.protected < 20000) {
      console.error(
        `FATAL: ${g.protected} protected asks (of ${g.decisions} decisions) is under the 20,000 §3.2 ` +
          `requires — raise --seeds (22 clears it on the current shape)`,
      )
      process.exit(2)
    }
  }
  console.log(gatePass ? 'RESULT=PASS' : 'RESULT=FAIL')
  process.exit(gatePass ? 0 : 1)
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
  // `v0.1` -> `v01`. The seeds are VERSION-derived, so each version's bank plays its own 27 games
  // rather than sharing a schedule: two banks over the same seeds would invite a digest-to-digest
  // comparison that means nothing, since a version that moves any action re-deals every position
  // after it. Compare versions with the gates, not by eye across two fixtures.
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
  if (EMIT_TREE !== 'ref' && EMIT_TREE !== 'wt') {
    console.error(`FATAL: --emit-tree must be 'ref' or 'wt', got '${EMIT_TREE}'`)
    process.exit(2)
  }
  if (process.env.MUTATE) {
    console.error('REFUSING to emit a bank from a MUTATE negative-control run')
    process.exit(2)
  }
  // A `ref` bank certifies a cross-revision identity claim, so a sweep that found divergence has
  // already falsified the thing the bank would be evidence for. A `wt` bank claims nothing about
  // another revision — it is a forward baseline for the NEXT change — so the sweep's verdict does
  // not gate it. Said out loud rather than skipped quietly, because a reader who sees a bank
  // emitted from a red sweep is entitled to know which of the two it is.
  if (tally.mismatches > 0) {
    if (EMIT_TREE === 'ref') {
      console.error('REFUSING to emit a reference bank from a run with mismatches — fix the divergence first')
      process.exit(1)
    }
    console.log(
      `BANK NOTE      : the sweep found ${tally.mismatches} mismatches against ${REF}. A --emit-tree wt bank is a ` +
        `FORWARD baseline and certifies nothing cross-revision; its warrant is the §3.2 gates, not this sweep.`,
    )
  }
  const emitFromWt = EMIT_TREE === 'wt'
  const ENGB = emitFromWt ? WT : REFENG
  const ROSTERB = emitFromWt ? wtRoster : refRoster
  // `ref`: the reference tree's own v2.0 arm, spelled the way MONET.md §1.1 spells it.
  // `wt`:  the candidate itself, straight out of the working tree's registry — the whole point of
  //        a forward baseline is that it records what THIS version plays.
  const armB = emitFromWt
    ? CANDIDATE
    : { skill: refStyle.SKILL_PRESETS.hard, style: refRoster.STYLE_ROSTER.punter }
  // Double quotes inside: the label is emitted into a single-quoted TS string literal, and
  // `monetPolicy('v0.2')` written with apostrophes closes it early and produces a file that does
  // not parse. Caught by emitting it once and reading the result.
  const armLabel = emitFromWt
    ? `monetPolicy("${VERSION}")`
    : '{ skill: SKILL_PRESETS.hard, style: STYLE_ROSTER.punter }'
  const games = []
  let total = 0
  // Driven ENTIRELY by ONE tree — its newGame, its reduce, its roster, its decide. Mixing the two
  // game loops would let a change in either hide inside the fixture it is supposed to be measured
  // against.
  if (!Number.isInteger(BANK_SEEDS) || BANK_SEEDS < 1) {
    console.error(`FATAL: --bank-seeds must be a positive integer, got '${argOf('--bank-seeds', '')}'`)
    process.exit(2)
  }
  for (const row of bankSchedule(ROSTERB.STYLE_IDS, BANK_SEEDS)) {
    const table = ROSTERB.STYLE_ROSTER[row.table]
    let s = ENGB.newGame(row.seed, ENGB.us54Config, row.startSeat)
    const d = new ActionDigest()
    let steps = 0
    while (s.phase !== 'finished') {
      if (steps >= 5000) throw new Error(`bank ${row.table}/${row.seed}: 5000-step cap`)
      const { seat } = ENGB.legalActionsSummary(s)
      const view = ENGB.seatView(s, seat)
      const moveSeed = ENGB.hashSeed(`${row.seed}:${s.moveIndex}`)()
      d.push(canonicalAction(ENGB.decide(view, armB, moveSeed)))
      const r = ENGB.reduce(s, ENGB.decide(view, table, moveSeed))
      if (!r.ok) throw new Error(`bank ${row.table}/${row.seed} step ${steps}: ${r.error.code}`)
      s = r.state
      steps++
    }
    total += d.count
    games.push({ ...row, decisions: d.count, digest: d.hex() })
  }

  const SYM = `MONET_${VERSION.replace(/\./g, '').toUpperCase()}_BANK`
  const fileName = path.basename(EMIT_BANK)
  // A `wt` bank is recorded from the working tree, which may be ahead of HEAD. Recording the HEAD
  // sha alone would be a claim the fixture cannot support, so the uncommitted state is recorded
  // beside it and `monet.test.ts` asserts on both.
  const headSha = git(['rev-parse', 'HEAD']).trim()
  const dirty = git(['status', '--porcelain', '--', 'lib', 'scripts']).trim().length > 0
  const cmd =
    `node scripts/byte-identity.mjs --version ${VERSION}` +
    (emitFromWt ? ' --emit-tree wt' : ` --ref ${REF}`) +
    ` --emit-bank ${EMIT_BANK}`
  const L = []
  L.push('/**')
  L.push(` * ${fileName} — GENERATED. Do not edit by hand.`)
  L.push(' *')
  L.push(` * \`${cmd}\``)
  L.push(' *')
  if (emitFromWt) {
    L.push(` * Monet ${VERSION}'s own decisions, recorded from the WORKING TREE at the revision ${VERSION} shipped`)
    L.push(' * and pinned here as a FORWARD baseline. Each row is one whole `us54` game: the table style')
    L.push(` * drives it, and the digest runs over the canonical form of the action \`${armLabel}\``)
    L.push(' * returned at every decision point, in order (`tests/bots/action-digest.ts`).')
    L.push(' *')
    L.push(' * What this fixture is and is not. It certifies NOTHING about an earlier revision — it was')
    L.push(' * recorded from the same tree it will be replayed against, so on the day it was written it')
    L.push(' * could not have failed. Its warrant is the acceptance gates that ran BEFORE it was emitted')
    L.push(' * (`scripts/byte-identity.mjs --gate dead-ask` and `--gate dead-ask-full`, MONET.md §3.2).')
    L.push(' * What it buys is the future: a `decide.ts`, `knowledge.ts`, `roster.ts`, `style.ts` or')
    L.push(' * `reduce.ts` change that moves a single action of a single game breaks a digest here, in a')
    L.push(' * month, when no reference tree is at hand.')
    L.push(' *')
    L.push(' * `revision` is HEAD at the moment of recording and `dirty` says whether the tree matched it.')
    L.push(' * `dirty: true` is the normal case for a bank emitted as part of the milestone it pins: the')
    L.push(' * code was written but not yet committed, so the revision that actually reproduces these')
    L.push(' * digests is the commit that INTRODUCED this file, not the one named below.')
  } else {
    L.push(" * The Bass v2.0 arm's own decisions, recorded from a COMMITTED revision and pinned here so")
    L.push(" * that Monet's identity claim survives the session it was measured in. Each row is one whole")
    L.push(' * `us54` game: the table style drives it, and the digest runs over the canonical form of the')
    L.push(` * action the v2.0 arm — \`${armLabel}\` — returned`)
    L.push(' * at every decision point, in order (`tests/bots/action-digest.ts`).')
    L.push(' *')
    L.push(' * The in-graph pin in `monet.test.ts` cannot fail on a `decide.ts` regression: both of its arms')
    L.push(' * are the same imported `decide`, so an edit moves them together and the suite stays green.')
    L.push(' * This fixture is the half that can. It was generated from another revision\'s module graph, so')
    L.push(' * a `decide.ts`, `roster.ts`, `style.ts` or `reduce.ts` change that moves a single action of a')
    L.push(' * single game breaks a digest here — which is exactly what "no behaviour change" means.')
  }
  L.push(' *')
  L.push(' * Regenerating it is a deliberate act, not a fix for a red test: a changed digest is a report')
  L.push(` * that ${VERSION} no longer plays the games it was accepted for.`)
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
  L.push("  /** `ActionDigest` over the recorded arm's canonical actions, in order. */")
  L.push('  digest: string')
  L.push('}')
  L.push('')
  L.push(`export const ${SYM} = {`)
  L.push(`  /** The revision the bank was recorded from — HEAD when the tree is 'wt'. */`)
  L.push(`  revision: '${emitFromWt ? headSha : refSha}',`)
  L.push(`  /** Which tree's module graph recorded it: 'ref' certifies cross-revision, 'wt' does not. */`)
  L.push(`  tree: '${EMIT_TREE}',`)
  L.push(`  /** Whether lib/ or scripts/ carried uncommitted edits at the moment of recording. */`)
  L.push(`  dirty: ${emitFromWt ? dirty : false},`)
  L.push(`  /** How the recorded arm was addressed. */`)
  L.push(`  arm: '${armLabel}',`)
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

// A `--emit-tree wt` run was never asking the sweep's question. Reporting FAIL because a v0.2
// candidate diverges from a v0.1 reference would be reporting the milestone as a defect, so the
// verdict says what the run actually did instead — and says that it is not a PASS.
if (EMIT_BANK && EMIT_TREE === 'wt') {
  console.log('RESULT=BANK-EMITTED  (a forward baseline; the cross-revision sweep above is context, not a verdict)')
  process.exit(0)
}
const pass = tally.mismatches === 0 && tally.decisions >= 20000
console.log(pass ? 'RESULT=PASS' : 'RESULT=FAIL')
process.exit(pass ? 0 : 1)
