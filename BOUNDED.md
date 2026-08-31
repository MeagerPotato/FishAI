# BOUNDED.md — FishAI v1.5: the bounded-memory ladder, and what it prices

FishAI v1.5 replaces the project's difficulty knob. The old tiers handicapped a bot with a
6-event log window plus 25% uniform decision noise; v1.5 caps **memory, in bits**, with an
explicit eviction policy — a first-class policy axis (PLAYSTYLES.md S44–S48) alongside style and
skill. This document records the model, the engine design, the four pre-registration episodes
(including the one where this project corrected its own overclaim), and the measured verdicts
from the 85,200-game base suite plus the two registered E4b follow-up runs.

The one-paragraph version: the dial works, and it was priced honestly. Set-share against an
unbounded team is non-decreasing in bits at every one of nine adjacent rungs (P1 **confirmed**,
no rung even needing its 2·SE tolerance), and the shipped tiers now have measured positions on
that curve — medium ≈ 32.2 bits, hard indistinguishable from full memory, and the old
noise-based easy tier **below the zero-bit floor**: a memoryless bot that reasons (set-share
0.1313) beats a remembering bot that dices (0.0446). The decay curves are human-shaped where the
budget bites (half-life rising 5 → 13 → 17 → 33 → 49 with the budget) and the noise tier is not
(a z-259 cliff at its window edge). The suite's one refutation, P7, is a headline rather than a
footnote: in the whole-ecology design, a 64-bit budget makes a style *easier* for the v1.0
classifier to read than full memory (−0.0053 ± 0.0019 at the 64→∞ rung, surviving Bonferroni ×3
at corrected one-sided p .00885) — and the registered single-seat follow-up, re-run at 6× the
pilot's sample after a power review exposed the pilot's CONFIRMED as an underpowered null, shows
the effect is a property of the bounded-vs-bounded *ecology*, not of the read seat's own
signature, with the within-design caveat retained either way.

Companions: [STYLES.md](STYLES.md) for the roster the budgets are applied to,
[ADAPTIVE.md](ADAPTIVE.md) for the v1.0 classifier the E4 experiments read with,
[BOT_LAB.md](BOT_LAB.md) for the measurement discipline the suite inherits,
[RULES_US54.md](RULES_US54.md) for every rule row cited below. Everything marked **[measured]**
was executed against this repo's engine; every number is pinned to the committed artifact
[src/lab/data/bounded-results.json](src/lab/data/bounded-results.json) (schema 3, base digest
`fe829b581f665c9a`, E4b-power digest `53668ad79186621d`) or the source file that carries it.

---

## 1. The model — S44, verbatim

A bounded seat is the same engine, the same style policy, the same skill; only its memory is
capped. The cost tariff is Sanjay Kannan's, quoted verbatim in S44 and implemented at exactly
those prices ([lib/engine/bots/bounded.ts](lib/engine/bots/bounded.ts)):

| Fact | Costs |
|---|---|
| "player X has card Z" | **2 bits** |
| "player X does not have card Z" | **2 bits** |
| "player X has a basis in book Y" (and its negative) | **1 bit** |

The reference `ActivePlayer` *refills memory from scratch each turn*: full-fidelity derivation,
budget-capped retention. The faithful implementation is therefore a **stateless, pure
re-derivation from the whole public log at every decision** — never an incremental store. That
choice is load-bearing, not aesthetic, and it buys the same three things statelessness bought
v1.0 (ADAPTIVE.md §1): two seats with the same information reach the same read, every game
replays byte-identically from `(seed, config, startSeat)`, and the lab inherits every metric
because a bounded seat is just another `PolicySpec` resolved inside `decide`.

The spec shape is the fifth arm of the policy union:

```ts
interface BoundedSpec {
  bounded: true
  /** The memory budget in bits. >= 0 integer; anything else degrades to 0, never throws. */
  bits: number
  /** The style whose policy runs over the restricted knowledge. Default 'balanced'. */
  style?: StyleId
}
```

A bounded Hoarder is still a Hoarder — the budget caps the knowledge, never the policy — which
is the composability S44 asks for and the old noise tier could not offer. The union widens in
bounded.ts itself, one acyclic layer outside [adaptive.ts](lib/engine/bots/adaptive.ts), with an
`Object.hasOwn` guard (`isBoundedSpec`); resolution happens inside
[decide.ts](lib/engine/bots/decide.ts) (the arm needs the view), and `decideExplained` prepends
the memory read to its trace — *"Bounded: 32-bit memory — kept 14 of 41 derivable facts (30
bits), spotlight on …"* — so the /play assistant stays honest about what a bounded opponent
actually knew.

---

## 2. The engine — derivation, spotlight, budget, replay

Two passes over public information, both in
[lib/engine/bots/bounded.ts](lib/engine/bots/bounded.ts):

1. **Derivation** (`deriveBoundedFacts`): the full-fidelity recorded walk of
   [knowledge.ts](lib/engine/bots/knowledge.ts) — the identical ingestion `buildKnowledge` runs
   at hard skill — read back as timestamped atomic facts. Nothing is invented: a hit locates a
   card, an ask certifies the asker's basis and their lack of the named card, a miss certifies
   the target's lack, historical count exhaustion certifies eliminations, and a claim resolves
   its book and retires every fact on it — exactly the certifications
   [observe.ts](lib/engine/bots/observe.ts) documents for the public log.
2. **Reconstruction** (`restrictedKnowledge`): the kept facts are replayed in log order onto a
   fresh working state through the same primitives, then finished by the same `finishKnowledge`
   — own-hand injection, fixpoint propagation over the *current* public counts, the
   materialization `buildKnowledge` itself runs. Every `StyleParams` policy then runs over the
   result unchanged, because it IS the `Knowledge` shape the unbounded path produces.

**What is free.** Own hand (the seat can see it), and the public board state — resolved books
are seeded GONE from `view.books`, current counts drive the final propagation — because S48
keeps observation history and display policy separate axes. The S45 subtlety is handled the way
knowledge.ts's `logWindow` path already handles it: the reconstruction never replays running
hand counts at all, so an evicted hit's fact can never corrupt a count. Facts the free state
reproduces at any budget are *retired* — never enumerated, so the budget is never spent on them.

**Spotlight ranking** (S47 names the policy: **contestability, not recency**). Each live book is
scored by how much the seat's own hand plus the derived facts bear on it; facts rank by (book
score desc, recency desc, then a stable total order — card in deck order, seat, kind), and the
kept set is the longest ranked prefix whose cost fits the budget. Deterministic throughout: no
`Date`, no `Math.random`, ties broken by construction. The S45 recency decay the experiments
measure is not coded anywhere — it *emerges* from spotlight + recency eviction, which is why E3
could be a genuine test rather than a tautology.

**The anchor and the ∞ sentinel.** `BOUNDED_INF_BITS = 1,000,000` is a concrete budget provably
above the maximum derivable pool (< 5,600 bits by construction — the bound is derived in
[lib/lab/bounded-types.ts](lib/lab/bounded-types.ts)). The Phase 1 anchor test pins that at this
budget the restricted knowledge — and therefore every decision over whole games — is IDENTICAL
to the unbounded style's, by shared machinery rather than by a parallel implementation staying
in step ([tests/bots/bounded.test.ts](tests/bots/bounded.test.ts)). Everything downstream leans
on this pin: the ladder's top rung, E4's ∞ cell reproducing the committed v1.0 baseline, and
E4b's in-run all-bare replay gate.

---

## 3. The pre-registrations — four episodes, in order

The suite's discipline is BOT_LAB.md §5's, exercised four times, each registration written down
**before** its run with the verdict rules fixed alongside
([lib/lab/bounded-types.ts](lib/lab/bounded-types.ts) carries the texts verbatim; the emitter
authenticates `meta.predictions` against the code's own registered set before writing).

1. **P1–P7** (registered 2026-08-29, SPEC-v15.md Phase 2): the ladder's monotonicity (P1) and
   its exact ∞ mirror (P2, health); the tier calibration question (P3); the three
   human-shapedness predictions (P4 reference age-flat, P5 bounded decay with rising half-life,
   P6 the noise tier flat-inside/cliff-at its window); accuracy non-increasing under memory
   pressure (P7). Verdict rules: stated inequalities under stated SE discipline; anything else
   refuted or mixed, printed as measured.
2. **E4b / P8** (registered 2026-08-30, after the Phase 2 review and before any E4b run): the
   review confirmed E4's both-teams design cannot attribute the P7 refutation to the read
   seat's signature vs the changed ecology, so E4b re-runs the grid with ONLY the read seat
   bounded — seat 2·(game mod 3), the three team-0 seats in rotation, the mapping written into
   the run's notes before it ran. P8: single-seat top-1 non-increasing, same adjacent-rung 2·SE
   rule; the ∞ cell must reproduce the corresponding full-strength read exactly (health). The
   registration also added the Bonferroni ×3 **annotation** over both rung families — additive,
   changing no committed verdict.
3. **E4b-power** (registered 2026-08-30, after the E4b review and before any run): the review
   computed the 50-seed pilot's power at exactly the P7 effect size as **~52%** (MDE 0.0051
   against the effect 0.0053; the pilot's 64→∞ CI [−0.0067, +0.0034] contains the entire P7
   effect). The pilot's CONFIRMED was therefore an underpowered null, and the E4b commit
   message had overclaimed ("not of the read seat's signature") where the licensed claim was
   only "does not appear in the single-seat design at its N". The registered corrections: the
   power run at 300 seeds per pairing (10,800 reads per cell — P7's own read count; MDE ≈
   0.0021 as registered, the run's measured MDE coming in at ≈ 0.0019) on the fresh disjoint
   prefix `clsacc-power-v1`, mapping/grid/estimator/rule
   UNCHANGED, becoming the P8 verdict of record with the pilot retained verbatim and both
   reported whatever they say; a correction commit stating the pilot conclusion's within-design
   limit (873f9f9 — no history rewriting); and the labelled cross-design difference-of-deltas
   plus post-hoc power, entering no verdict rule.
4. **Guard truthfulness** (the same review's integrity findings, commit b90735c): the extension
   guards' prose narrowed to their actual coverage, `meta.predictions` authenticated against
   the code's `BOUNDED_PREDICTIONS`, the base artifact's digest pinned, and the analyze script
   made to FAIL — not note-and-proceed — when the per-game records file is absent or disagrees
   with the aggregates.

Raising N after a null can only help refute our own headline; that is the direction honesty
points, and it is why the power run exists.

---

## 4. The experiment suite **[measured]**

Design in [lib/lab/bounded.ts](lib/lab/bounded.ts) (typechecked, tested), data contract in
[lib/lab/bounded-types.ts](lib/lab/bounded-types.ts), launchers in
[scripts/bounded-sim.mjs](scripts/bounded-sim.mjs) and
[scripts/bounded-single-sim.mjs](scripts/bounded-single-sim.mjs), artifact folding in the two
analyze scripts, and one committed artifact the site reads through its boundary validator
([src/lab/bounded-artifact.ts](src/lab/bounded-artifact.ts)).

**The base run.** 85,200 games (ladder 3,000 duplicate pairs × 10 budgets on `bounded-v1`;
tiers 3,000 pairs × 3 on the head of the same list; E4 accuracy 36 pairings × 50 games × 4
budgets replaying the v1.0 `clsacc-v1` list), generated 2026-08-30, engine commit
`ab779f3-dirty`, records digest `fe829b581f665c9a`, wall clock ≈ 5.1 minutes. Health: every
gate zero — `illegalActions 0 · cappedGames 0 · invariantViolations 0 · ties 0 · voids 0 ·
nonClinch 0`, `distinctSeeds` equal to pairs in every cell. **The E4b runs.** The 50-seed pilot
(7,200 games, digest `52bfe90b52ea7029`) and the 300-seed power run (43,200 games, engine
commit `b90735c-dirty`, digest `53668ad79186621d`, 174 s at 22 workers), each with its ∞ cell
verified in-run against an all-bare replay — event-identical, read-identical, step-identical,
0 deviations in 1,800 and 10,800 games respectively.

### 4.1 E1 — the ladder: P1 **confirmed**, P2 **confirmed**

Bounded Balanced (hard skill) vs unbounded Balanced-hard, mean duplicate-pair set-share:

| bits | 0 | 8 | 16 | 24 | 32 | 48 | 64 | 96 | 128 | ∞ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| share | .1313 | .2449 | .3921 | .4361 | .4653 | .4909 | .4977 | .4999 | .5000 | .5000 |
| SE | .0017 | .0022 | .0026 | .0023 | .0020 | .0011 | .0006 | .0001 | 0 | 0 |

Eight of the nine adjacent deltas are positive outright and the ninth, 128→∞, is exactly zero
(both rungs sit at .5000 exactly; the steepest, 8→16, is +.1472 ± .0031) — no rung needed the
−2·SE tolerance the registered rule allows. The money is at the low end: the first 16 bits buy
more share than the next hundred.
P2's gate is checked on integers, not floats: 3,000 ∞ pairs, **0** mirror deviations, share
.5000 exactly — at that budget both teams are bit-identical and each duplicate pair is
literally the same game twice.

### 4.2 E2 — tier calibration: P3 **mixed**, and the honest headline

Each shipped tier against the same reference opposition, interpolated onto the E1 curve:

| tier | set-share | bits-equivalent | 95% CI (bits) |
|---|---:|---:|---:|
| easy | .0446 ± .0011 | **0 — clamped at the floor** | [0, 0] |
| medium | .4656 ± .0024 | **32.2** | [30.8, 35.1] |
| hard | .5006 ± .0007 | none finite | lower edge 85.5; upper edge maps nowhere finite |

The headline is the honest one: the old noise-based easy tier measures **below the zero-bit
floor**. A 0-bit seat keeps nothing but still reasons — own hand, public board, a legal policy
— and scores .1313 on the same deals where the easy tier's remembered-window-plus-25%-noise
scores .0446. A memoryless bot that reasons beats a remembering bot that dices. Medium lands at
32.2 bits (the anchor the /play Memory control quotes), and hard sits above every finite rung.
P3 is **mixed** as registered: the ordering easy < medium < hard holds on every point estimate,
but not every tier is finitely placeable — and the verdict rule asked for finite, orderable
equivalents.

### 4.3 E3 — human-shapedness: P4 **mixed**, P5 **mixed**, P6 **mixed**

Computed post-hoc from the E1/E2 records (retained as compact full public logs — no engine
instrumentation): at ask event *i*, every card whose location a hit publicly established at
event *j* (unmoved, unretired) that the acting seat could legally have asked of the correct
holder is one availability observation at age *i − j*; *exploited* iff the actual ask was
exactly that certain ask. Clustered comparisons cluster by seed.

- **P5 — the S45 signature, where the budget bites.** Decay is significant at 0–48 bits and the
  half-life climbs the ladder exactly as designed: 5 → 13 → 17 → 33 → 49 events at
  0/8/16/24/32 bits. But the rule fails twice over: 48 bits decays (z 3.22) yet no band meeting
  the 200-observation floor falls to half its youngest rate, so its half-life is undefined; and
  from 64 bits up the curves are statistically indistinguishable from full memory (no
  significant decay, no half-life in range) — the mechanism saturates once the budget holds
  essentially everything, which the prediction's "every budget decays, half-life defined
  everywhere" failed to anticipate. Mixed.
- **P6 — noise is not human-shaped, and not even flat.** The easy tier's cliff at its 6-event
  window edge is the largest effect in the suite: exploit rate .5066 inside the window, .0304
  just outside — a drop of .4861 ± .0019, **z 258.9**. The motivating contrast confirmed. But
  the prediction also claimed flatness *inside* the window, and ages 1–3 vs 4–6 measure
  −.0360 ± .0035 — not flat. Mixed.
- **P4 — the composition effect.** Pooled over all observations, the full-memory reference's
  exploit rate falls with age (.5840 young → .4561 old), which reads as decay. Clustered by
  seed — young vs old *within* the same deals — the difference is **−.0212 ± .0049 (z −4.28)**:
  old evidence exploited slightly *more*, not less. Only long games carry old evidence, and
  long games are different games; the pooled fall is composition, not forgetting. The clustered
  tilt still fails the registered flatness rule (in the direction opposite to forgetting), so
  P4 is mixed: bounded-∞ is age-flat as predicted, the reference is not.

### 4.4 E4 — style under memory pressure: P7 **refuted**, with its two riders

All nine styles × bits ∈ {16, 32, 64, ∞} on both teams, read at end of game by the v1.0
classifier against its calibrated fingerprints — 10,800 seat reads per cell:

| bits | 16 | 32 | 64 | ∞ |
|---|---:|---:|---:|---:|
| top-1 | .1542 | .2101 | .2295 | .2243 |

The 64→∞ rung **falls**: −0.0053 ± 0.0019 (z −2.75), violating the registered non-increasing
rule — mild memory pressure makes a style *easier* to read than full memory, in this design.
Two obligations from the Phase 2 review ride with that headline:

- **Multiplicity.** Three rungs are tested, so the violation carries the registered Bonferroni
  ×3 annotation: one-sided p .00295 corrects to **.00885** — still under α = 0.05. The
  refutation survives its correction. (The annotation changes no committed verdict; the rule
  had already refuted on the raw rung.)
- **Attribution.** E4 bounds BOTH teams, so a budget changes everything the classifier reads at
  once — opponents, partners, and the games themselves. Game length is itself a function of the
  budget: across the E1 ladder, mean length runs 683 → 798 engine steps (a 17% spread with only
  *one* team bounded; the artifact aggregates no E4 game lengths, so the one-team ladder is the
  committed lower bound on the both-teams shift). The P7 effect is a property of
  bounded-vs-bounded *ecologies* until a single-seat design isolates the signature — which is
  E4b.

The ∞ cell reads .22426 against the committed v1.0 baseline .22426
([adaptive-results.json](src/lab/data/adaptive-results.json), digest `ce3316641a8f38fe`) — the
same games by the anchor pin, agreeing exactly. That is the cross-artifact anchor tying the two
suites together, and both `/lab/adaptive` and `/lab/bounded` print it.

### 4.5 E4b — single-seat attribution: P8 **confirmed**, twice measured, once corrected

Only the read seat is bounded; the other five seats play their bare full-strength styles,
holding the ecology at the distribution the fingerprints were calibrated on.

| bits | pilot (1,800 reads/cell) | power run (10,800 reads/cell) |
|---|---:|---:|
| 16 | .1678 ± .0100 | .1622 ± .0040 |
| 32 | .1678 ± .0104 | .1698 ± .0044 |
| 64 | .1700 ± .0105 | .1642 ± .0043 |
| ∞ | .1683 ± .0102 | .1634 ± .0043 |

The pilot came back flat and was committed as P8 CONFIRMED — and then the E4b-power review
priced that verdict: **52.4% power** at the P7 effect size, an underpowered null that licensed
only the within-design claim (§3). The 300-seed run of record, registered before it ran on a
disjoint seed list with nothing else changed, is also flat: adjacent rungs +.0076 ± .0046,
−.0056 ± .0031, −.0007 ± .0010 — **0 of 3 violate**, at **99.97% post-hoc power** for the P7
effect (MDE .0019). P8 is confirmed at matched read count. The labelled cross-design
comparison — P7's violated rung against P8's same rung, independent by disjoint seeds —
measures a difference of +.0045 ± .0021 (**z 2.11**, two-sided p .035), reported as exactly
that: a comparison ACROSS designs that enters no registered verdict rule. The within-design
caveat stands either way: P8 bounds what a single bounded seat does to its own read, nothing
else.

---

## 5. The verdict, plainly

**Memory-in-bits is the difficulty dial this project now ships**: monotone (P1, nine rungs, no
violations), interpretable (one number; the tiers priced on it), human-shaped where the budget
bites (P5's rising half-lives) — and honest about where its predictions overreached, which is
what the four MIXED verdicts are. The noise tier it replaces is doubly condemned by
measurement: weaker than keeping nothing at all (E2) and shaped like nothing human (P6's
cliff).

The one refutation is the suite's most instructive result. **Classifier accuracy is a property
of the whole table, not of one seat**: dial both teams' memory down to 64 bits and styles
become *more* readable than at full memory (P7, surviving correction); dial down only the seat
being read, at 6× the pilot's sample, and nothing moves (P8). And the project's own process is
part of the record: the pilot's overclaim was caught by review, priced in power terms, and
corrected by registration and re-run rather than by rewriting history.

What this does **not** settle: budgets between the rungs (the ladder is measured at ten points,
interpolated between them); other styles' ladders (E1 prices Balanced; E4 shows the nine styles
under pressure only through the classifier's lens); the v1.0 adaptive engine under memory
pressure (undefined, unmeasured, and deliberately refused at /play); and every number is
conditional on pinned `us54` — nothing transfers to `pagat48` without re-measuring.

---

## 5a. v1.5 against v1.0 — a style gap wearing a memory gap's clothes **[measured, exploratory]**

The owner asked for a direct check of v1.5 against v1.0. The answer needs a distinction before it
needs a number, because the two generations move **orthogonal axes**:

- **v1.0** (`AdaptiveSpec`) varies the **style** at full memory — it resolves to
  `{skill: hard, style: STYLE_ROSTER[chooseStyle(...)]}`.
- **v1.5** (`BoundedSpec`) caps **knowledge** at a fixed, named style.

They do not compose. `isBoundedSpec` is tested first in `resolveWithView`, so
`{bounded: true, adaptive: true}` resolves purely as bounded and silently drops the adaptive flag.
"v1.0 under memory pressure" remains inexpressible, exactly as §5 says.

And the anchor of §4 pins v1.5 at an unbounded budget to **v0.5**, not to v1.0: no test anywhere
relates the adaptive and bounded specs. Re-verified out of sample — **0 mismatches in 28,464 paired
decisions**, and the game-level control returned exactly `0.0000 ± 0.0000`.

Measured on a held-out bank (`v15v10-holdout-a`), 2,000 duplicate pairs per rung, 108,000 games,
every health gate zero, against a clean export of committed HEAD rather than a working tree:

| bits | v1.5(balanced) − v1.0 | memory cost alone (vs the same arm at ∞) |
|---|---:|---:|
| 0 | −8.1450 ± 0.0689 | −8.0195 ± 0.0900 |
| 8 | −6.0215 ± 0.1070 | −5.8960 ± 0.1217 |
| 16 | −2.8520 ± 0.1497 | −2.7265 ± 0.1588 |
| 24 | −1.7605 ± 0.1415 | −1.6350 ± 0.1517 |
| 32 | −0.9940 ± 0.1200 | −0.8685 ± 0.1275 |
| 48 | −0.2875 ± 0.0789 | −0.1620 ± 0.0687 |
| 64 | −0.1625 ± 0.0641 | −0.0370 ± 0.0318 |
| 96 | −0.1285 ± 0.0591 | −0.0030 ± 0.0052 |
| 128 | −0.1255 ± 0.0590 | 0.0000 ± 0.0000 |
| ∞ | **−0.1255 ± 0.0590** | — |

**The residual at ∞ is not a memory effect and must not be read as one.** At an unbounded budget the
v1.5 seat is byte-identical to a bare Balanced seat, by the anchor. The −0.1255 is the *style* gap:
a v1.0 seat is effectively a two-state machine — Balanced while the truncated log is short, Punter
after — and it spends **44.2%** of its decisions as Punter, whose counter-table row dominates
Balanced's in every column.

Naming the right style erases and reverses it:

| bits | v1.5(**punter**) − v1.0 |
|---|---:|
| 0 | −8.1450 ± 0.0689 |
| 32 | −0.6365 ± 0.1271 |
| 64 | **+0.1305 ± 0.0878** |
| ∞ | **+0.1485 ± 0.0852** |

Consistent with ADAPTIVE.md §6.1's committed finding that the adaptive team loses to the very style
it converges to. **The v1.5 `style` knob spans ±0.27 sets per pair — larger than the entire v1.0
adaptation effect**, which differencing puts at **~0.13 sets per duplicate pair over a bare v0.5
Balanced team, about 0.8% of the sets contested**, and only at high budgets: below 24 bits a v1.0
opponent is statistically indistinguishable from a bare Balanced one, because a memory-starved
opponent loses too heavily for the opponent's style to register.

One incidental result worth keeping: **at 0 bits, Punter and Balanced are byte-identical**
(`+0.0000 ± 0.0000`). Their only live difference on this engine is `gambleBonus`, which fires only
when an ask would complete a book — and with no remembered facts that condition is unreachable.

**Degradation shape.** The curve is flat from ∞ down to **96 bits** (−0.003 ± 0.005, not
distinguishable from zero), **first bites at 64** (−0.037 ± 0.032), turns material at 48, then
collapses: **59% of the whole 0-bit deficit is already paid by 16 bits, and 73% by 8.** The money is
at the low end — the first 16 bits buy more than the next hundred. All nine adjacent-rung deltas are
non-negative, so the ladder is monotone against a v1.0 opponent as well as against v0.5.

This also **replicates the shipped E1 ladder out of sample**: every rung's set-share lands within
~0.007 of §4.1's committed value on a disjoint bank, with ∞ and 128 both exactly `.5000`.

**Caveats, and they are not small.** This is exploratory, not pre-registered: no verdict rule was
fixed in advance and no multiplicity correction was applied across 27 cells. The v1.0 baseline is
not a fixed policy across rungs — its style mixture depends on public-log length, which the
opponent's budget changes (warm-Punter share runs 41.0% at ∞ to 48.6% at 0 bits), so cells at
different budgets face materially different opponents; the reference ladder does not have this
problem and agrees closely, which bounds the distortion without removing it. Only `balanced` and
`punter` were bounded, only pure teams, only `us54`. And the win rates at 0 and 8 bits are
near-floor, where the estimator is compressed.

---

## 6. Where it lives

**The engine.** [lib/engine/bots/bounded.ts](lib/engine/bots/bounded.ts) — the spec, the guard,
derivation, spotlight ranking, budget, reconstruction; resolution inside
[decide.ts](lib/engine/bots/decide.ts) with the memory read prepended to `decideExplained`'s
trace. The barrel exports `isBoundedSpec`, `boundedRead`, `deriveBoundedFacts`,
`rankBoundedFacts`, `restrictedKnowledge` and the widened `PolicySpec`. Obligations pinned in
[tests/bots/bounded.test.ts](tests/bots/bounded.test.ts): the large-budget equivalence anchor,
the zero-budget floor, budget accounting and deterministic ranking, monotone smoke, full-game
health, decide/decideExplained parity.

**The play table.** The v0.5 lobby's **Memory** control ([src/pages/PlayHub.tsx](src/pages/PlayHub.tsx))
writes `?bits=<n>` and the table applies one budget to all five bot seats
([src/play/policies.ts](src/play/policies.ts): `{bounded: true, bits, style}`). Seat cards and
the style mirror name the budget ("Punter · 32-bit memory"); the option labels quote the
measured anchors with provenance comments naming the artifact fields, never importing the
artifact into the play chunk. The advisor stays full-memory in both modes and the pane says so
whenever the bots are handicapped. v1.0 takes no bits param — bounded adaptation is undefined
and unmeasured.

**The lab page.** `/lab/bounded` ([src/pages/LabBounded.tsx](src/pages/LabBounded.tsx)) renders
the committed artifact through the boundary validator
([src/lab/bounded-artifact.ts](src/lab/bounded-artifact.ts)) — schema, rule-set, style-id,
tier, verdict and multiplicity-family refusals, an ascending-ladder check, and a rules-hash
gate against the shipped RULES_US54.md before a single number renders. Figure models and their
gates: [src/lab/boundedFigures.ts](src/lab/boundedFigures.ts) /
[boundedFigures.test.ts](src/lab/boundedFigures.test.ts), run over the real committed bytes.

**Running it** (Node ≥ 23.6, as everywhere in this repo):

```bash
npm run bounded              # the base pre-registered suite (E1/E2/E3/E4) → lab-out/
                             #   (scripts/bounded-sim.mjs; --pairs/--workers/... to shrink)
npm run bounded:analyze -- --run lab-out/<run-dir>
                             # fold + P1–P7 verdicts → the base artifact
                             #   (recomputes aggregates from games.jsonl; refuses on drift)

npm run bounded:single -- --power true
                             # the E4b single-seat run on the registered 300-seed grid of
                             #   record (omit --power for the pilot's 50-seed grid)
npm run bounded:single:analyze -- --run lab-out/<run-dir>
                             # extend the committed artifact additively (schema 3): digest pins,
                             #   prediction authentication, byte-identical carry of every base
                             #   section — refusal, not warning, on any disagreement
```

The launchers' exit codes are the health gates. The single-seat analyzer FAILS outright when
`games.jsonl` is absent or its recomputed scoring disagrees with `run.json` — the per-game
records are the evidence behind every aggregate, and an artifact is never extended from a
summary alone.
