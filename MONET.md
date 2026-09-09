# MONET.md — the roadmap from Monet v0.1 to Monet v1.0

**Bass v2.0 is frozen as LEGACY.** Monet is a new line, starting at v0.1, whose stated goal is
**Monet v1.0 beats SESTINA v1.0**. Bass v2.0 is the baseline Monet must beat and the thing Monet
inherits from: the engine, the rules, the harness, the documents, and one measured policy.

> **Correction carried into this document.** Every number in the two draft write-ups this roadmap
> supersedes (`NEXT-GENERATION.md`, `WHY-FISHAI-LOSES.md`) was measured on a defective bridge
> (`bot:fishai`), which cost FishAI **3.44 points of win rate** and **5.59 points of declare
> accuracy**. Those drafts are not cited here as sources of levels. Where a mechanism finding from
> them survives, it is restated against the corrected arm (`bot:pf2`) and labelled. Three of the
> drafts' load-bearing claims are withdrawn outright in §5 and §8. In particular: **the declare
> accuracy deficit does not exist** (98.42 vs 98.46 is parity), **the +4.00 bridge repair is not
> available to spend** (it is already inside the 27.08% baseline), and **the measured refutation of
> search did not reproduce** on the corrected bridge.

**Confidence labels.** `[measured]` — a cell was run and is reported with its N and its floor.
`[inferred]` — the mechanism is measured, the consequence is arithmetic over measured quantities.
`[speculative]` — neither. Every measurement carries the bridge it came from: `[corrected]` is
`bot:pf2`, `[defective]` is `bot:fishai`, `[home]` is FishAI's own engine with no adapter in the
path. **A number from one bridge is never subtracted from a number on another.**

**Effort.** XS ≤ 1 day · S = 1–3 days · M = 1–2 weeks · L = 1–2 months · XL = rewrite.

---

## 0. The target, stated honestly

**Monet v1.0 beats SESTINA v1.0. That means crossing 50%.** Restated by the owner on 2026-09-03: about
50%, or a statistically significant win — on this document's floors ≥ 52.9% at six seeds or ≥ 52.0%
at twelve (§0.3).

| | win rate vs SESTINA v1.0 | deals | floor |
|---|---:|---:|---:|
| Bass v2.0, corrected bridge — **the baseline** | **27.08%** | 1,200 | ±2.83 |
| the target | **50.00%** | — | — |
| **Monet v0.3** (§3.3), same bridge, 2026-09-03 | **30.96%** | 1,200 | ±2.83 |
| **Monet v0.4a** (§3.4a), same bridge, 2026-09-03 | **31.94%** | 1,200 | ±2.83 |
| **Monet v0.4b** (§3.4b), same bridge, 2026-09-03 | **32.75%** | 1,200 | ±2.83 |
| **Monet v0.9** (§3.8d), same bridge, twelve seeds, 2026-09-04 | **38.92%** | 2,400 | ±2.00 |
| **Monet v0.9**, the bridge's compulsion translated (§3.8f) — §3.8m's two twelves, 2026-09-06 | **40.11% / 41.31%** | 2,400 / 2,400 | ±2.00 |
| **to find** | **22.92 points** from the baseline on its bridge; **8.69** from v0.9 on the translated one (§3.8m) | — | — |

[measured, corrected] Six seeds, 1,950 of 7,200 games, `bot:pf2` vs the frozen v1.0 spec. Every
seed of the six moved the same way under the bridge repair; mean delta +3.44, SD 0.48, min +2.67.

### 0.1 What the evidence says about whether 22.92 points is reachable

**No combination of the mechanisms this project has measured reaches parity.** That is a weaker
claim than "belief cannot get there", and it is the only one the evidence supports. [inferred]

**First, the cashing channel has a measured ceiling, and it is small.** An oracle arm that shares
its team's true hands and cashes every lock the instant it exists scores **33.58%** against the same
opponent on the same three seeds where the honest arm scores **27.83%** — a delta of **+5.75 points**,
positive on 3 of 3 seeds, clearing the ±4.00 floor over 600 deals. Its `lockHoldA` collapses from
**9.24 to 0.41** events, so it really is doing the thing. [measured, corrected]

That is the entire cashing channel, solved perfectly and for free by cheating, and **it leaves Monet
16.42 points under even.** No implementation of a real belief beats a cheat that already knows the
answer.

**Second, the asking channel is measured too, and it is also small.** The best arm anywhere in the
corrected factorial is licence-conditioned hit probability with the defusal appetite off, at
**31.50%** — **+4.42** over the 27.08% baseline on 1,200 deals, clearing ±2.83. [measured, corrected]

**Third, the two channels are the same object read twice, so they do not add.** The factorial says so
directly: the defusal appetite is worth **+3.42** when licence conditioning is off and **−0.71** when
it is on. The interaction term is **−4.12**. Both terms promote asks at seats carrying a live row-6
licence; they compete for the same effect. [measured, corrected] The same argument applies to the
licence fold and the joint posterior, for a structural reason given in §2.4: **the licence fold is a
first-order approximation of exactly what the posterior computes.**

Stacking the two channels with **full additivity that the evidence says will not hold**:

| stack, most favourable reading the evidence permits | win rate |
|---|---:|
| baseline (Bass v2.0, corrected bridge) | 27.08% |
| + best measured asking arm (licence conditioning, defuse off) | 31.50% |
| + the cashing channel **at its cheating ceiling** (+5.75) | **≈ 37.3%** |
| **still under even by** | **≈ 12.7 points** |

> **What this bound does not cover.** The oracle shares the three FishAI seats' true hands; it grants
> nothing about opponent holdings, and so it bounds own-team lock detection, not belief. The
> opponent-certainty deficit — 1.594 located cards per decision against 2.218, flat by phase where
> SESTINA's climbs (WHY §3.3) — has no ceiling arm at all, and `conceal`, the one built term that
> prices what an ask publishes, has fired on 0.000% of asks under every shipped style and has never
> been measured on either bridge (WHY §6.4). **≈37.3% is an upper bound over the measured set, not
> over the achievable one**, and no milestone below may be justified by treating it as the latter.
> [inferred]

**That is the optimistic sum of everything this project has measured, and it does not reach parity.**
It is not a forecast; it is an upper bound built by ignoring a substitution the same measurement
already found.

### 0.2 What the residual is made of, and what architecture would be required

The **ask-accuracy** gap sits in position, not in move choice, and that much is measured. Replaying
both agents through `decideExplained` at matched positions decomposes it:

| component | value |
|---|---:|
| FishAI at its own positions | 52.33% |
| FishAI at SESTINA's positions | 62.71% |
| SESTINA at its own positions | 57.22% |
| **POSITION** (the positions Monet arrives at are worse) | **−10.38** |
| **SELECTION** (Monet picks better moves once there) | **+5.49** |

[measured, defective — and the defect is not ruled out of this term. The starting quantity 52.334%
sits 0.02 points from the corrected 52.32%, which pins the *level*; POSITION is a statement about
arrived-at trajectories, and the guard removed ~253 wrong declares per cell, which are trajectory
changes. **Re-recording positions on `bot:pf2` and re-running the replay is one cell and it has not
been done.**]

**Monet picks better moves than the frontier at matched positions. The positions it arrives at are
worse.** What the decomposition does *not* say is why. It is a one-step counterfactual with history
held fixed, so it cannot distinguish a trajectory gap caused by shallow planning from one caused by
a weaker belief driving worse asks — and the oracle, a belief-only intervention, moves ask accuracy
3.75 points and the set differential 0.398, which is trajectory movement from belief alone. **That
POSITION is reachable only by lookahead is [speculative], not a consequence of the decomposition.**

**The architecture this roadmap therefore plans for is a calibrated joint posterior over deals with a
search over information sets on top of it — both, not either.** That is a working hypothesis about
where the residual lives, not a conclusion the decomposition licenses. What *is* known is the price:

| | cost per ask decision | per six-seat game |
|---|---:|---:|
| Monet today (the FishAI policy) | ~0.14 ms | ~82 ms |
| a posterior at the affordable budget | ≤ 1.4 ms (10×) | ~0.8 s |
| determinized search at det=12 / cand=4 / depth=12 | ~81 ms (578×) | ~6.6 s desktop, 20–26 s phone |

[measured, home — `bench.mjs`; 12 × 4 × 12 = 576 `decide` calls × 0.14 ms ≈ 81 ms]

**A 578× per-decision engine does not seat behind a human-facing move in a browser, and does not run
on a phone at all.** That is not a tuning problem; it is a product fork. §3.9 makes it an explicit
owner decision rather than a discovery made late.

### 0.3 The call this document makes

**Monet v0.1 through v0.4 is the belief programme. It is fully specified below, every milestone has a
falsifiable acceptance test, and the evidence supports it landing somewhere in the 31–37% band —
short of the target by roughly 13 points.** [inferred, from §0.1's measured components]

**Monet v0.5's gate (§3.5b) is a gate, not a milestone.** There the belief programme is done and
the number is whatever it is. If Monet is under 40%, the remaining gap is POSITION and the owner
chooses between building a lab-only search arm (§3.5c → v1.0, which does not ship on `/play`) and
publishing the negative result. **Both are honourable outcomes and one is much cheaper.**

**What is not honourable** is shipping search, measuring two points, and calling it a frontier
engine. This lab has already published three negative results that hold up — the degeneracy theorem,
the bounded-memory refutation, and the off-limits refutation. *"Monet plays at v0.4 strength and here
is exactly which capability it lacks, priced"* is a result of the same kind.

> **The owner's call, 2026-09-03.** The gate read **32.75%** (§3.5b's record, the third row). Given the
> forced choice — stop, split the engine, publish — the owner chose a fourth option this document had
> not written: **keep building the fast policy toward 50%**, along the levers the record itself names,
> one rung at a time: **v0.5 opponent reading**, with the defusal appetite made a function of the state
> (§3.6); **v0.6 communication** — asks chosen to reveal, and the handoff played (§3.7); **v0.7 the
> search arm**, only if a gap is left and only through §3.5c's cost-first test (§3.8). v1.0 keeps its
> definition (§3.9); the owner restated the target as about 50%, or a statistically significant win —
> on this document's floors ≥ 52.9% at six seeds or ≥ 52.0% at twelve. **The physics is unchanged:**
> no mechanism on record is priced at the 17.25 points the target needs, the oracle bounds every
> belief mechanism at 38.28% on the current ask policy, and each rung is measured before the next is
> defined, with §3.5b's rows re-read at every gate. The project's recommendation — publish — stands on
> the record beside the call.

> **The owner's call, 2026-09-06.** §3.9's table was read on v0.9's vector (§3.8m): 41.31% and 40.11%,
> v1.0 does not exist there, and the fork above stood in front of the owner as row 19. The owner took
> **the first option — publish**: v0.9 stays what the site's table seats, the negative result is the
> eleventh paper (`papers/monet.tex`, §3.8n), and the bridge is archived outside the public tree so every
> number in this document can be re-read. And the owner set the direction from here in one sentence:
> *"going forward, we should just pick whatever will improve the winning percentage of Monet."* This
> document reads that as its rule for choosing rungs (§3.8n): the objective is the paired win rate
> against SESTINA v1.0 on the translated bridge; a rung is chosen by its expected gain there and by
> nothing else; and it ships when a pre-registered read on twelve fresh seeds, pinned in-engine, puts
> its paired mean at least two standard errors above zero — a real point is a real improvement — with
> the ±2.00 floor kept as the definition of a *rung*. **The physics is what §3.8m measured:** the
> frontier is nine points away, the wall at v0.4 is unmoved, and no measured channel is priced at the
> gap. The owner may tighten the rule on return.

---

## 1. What Monet inherits

### 1.1 The policy

Monet v0.1 is Bass v2.0's `STYLE_ROSTER.punter` at `SKILL_PRESETS.hard`, unchanged. That arm is
the one every corrected number in this document was measured on, and it carries `defuse: 1` from the
`BALANCED` base (`lib/engine/bots/roster.ts:165`), which every roster entry inherits through
`style()`.

### 1.2 The corrected bridge

`bot:pf2` — the shipped adapter plus one guard in `opPoll` — is the instrument, and it is a
**bridge** artifact, not a Monet artifact. It lives in the session scratchpad and is never committed.
Monet inherits the corrected *measurement*, not a stronger policy. **There is no +3.44 left to
spend: it is already inside 27.08%.**

### 1.3 The lineage placement, complete for the first time

Corrected-bridge cells, 3 seeds (90210 / 4242 / 7011001) × 200 deals × 6 rotations = 600 deals each,
paired floor ±4.00:

| opponent | Monet's inherited win rate | ask acc (A / B) | declare acc (A / B) | lock hold (A / B) |
|---|---:|---:|---:|---:|
| FishBot v0.2 | **67.42%** | 55.82 / 55.50 | 98.90 / 87.29 | 6.67 / 19.84 |
| FishBot v0.3 | **62.06%** | 56.81 / 57.38 | 98.22 / 85.62 | 7.94 / 12.05 |
| FishBot v0.4 | **34.25%** | 53.99 / 57.24 | 97.69 / 98.30 | 8.02 / 4.87 |
| FishBot v0.5 | **33.31%** | 55.01 / 58.72 | 98.24 / 97.55 | 8.34 / 4.00 |
| FishBot v0.6 | **32.86%** | 54.57 / 58.17 | 97.53 / 97.86 | 8.34 / 3.70 |
| SESTINA v1.0 | **27.83%** | 52.35 / 57.35 | 98.37 / 98.33 | 9.24 / 2.97 |

[measured, corrected] `v01` is not in the panel: the engine rejects the spec (`fish: unknown policy
'v01'`). The panel is six opponents, not seven.

**The finding that sets Monet's first architectural target.** Their own lineage is not a ladder of
even rungs. Playing their bots against each other on the same harness: v0.3 beats v0.2 at 51.17%,
v0.5 beats v0.4 at 50.86% — but **v0.4 beats v0.3 at 74.72%.** [measured, corrected, 3 seeds]
Essentially all of the lineage's strength arrives in one step, and **that step is exactly the step
Monet fails**: it clears v0.3 by 12 points and loses to v0.4 by 16.

> **Correction to the drafts.** `NEXT-GENERATION.md` §6.4 places FishAI as *"clearing one rung and no
> other"* at v0.3 55.17% / v0.4 30.00%. Both levels are defective-bridge and both are withdrawn. The
> corrected placement clears **two** rungs (v0.2 at 67.42%, v0.3 at 62.06%) and the v0.4 cell is
> **34.25%**, not 30.00%. The qualitative placement — between v0.3 and v0.4, nearer v0.3 — survives.

**Consequence for the roadmap: the v0.4 cell is a better acceptance instrument than the SESTINA
cell.** The effect Monet is trying to produce is 24.72 points wide there and 22.9 wide against
SESTINA, but the v0.4 opponent is not a search agent, so a belief change should move it much further.
Every belief milestone below is gated on **both** cells.

### 1.4 The record debt Monet inherits

CROSSPLAY.md §9 has been re-issued and is correct. Three items remained when this section was
written, because Monet's baseline was quoted from documents that still contradicted themselves.
**All three are closed in v0.1.** The table is kept rather than deleted: a debt that disappears
silently is indistinguishable from one that was never paid, which is the whole complaint §1.4
exists to make. Locations are section references, not line anchors — the version of this table
that pinned "`CROSSPLAY.md` §2, line 115" was wrong within the day, because closing the item moved
the paragraph.

| item | location | what was wrong | status |
|---|---|---|---|
| lineage summary | `CROSSPLAY.md` §2, the "earlier draft" paragraph | read "28.6% (v0.6), 28.2% (v0.5) and 24.2% (SESTINA v1.0) — 21 to 26 points under even". Corrected: **32.86 / 33.31 / 27.83**, i.e. **17 to 22 points under even** | **closed in v0.1.** Rewritten to the three corrected figures, with the three withdrawn ones named as superseded rather than quietly dropped |
| rules table | `CROSSPLAY.md` §1 | no win-condition row. `us54` clinches at five sets; their engine plays all nine half-suits | **closed in v0.1.** A seventh row, plus two paragraphs on what the difference does and does not change: win rates stay comparable across the two rule sets, set margins do not |
| stale comment | `decide.ts`, the hoard-gate comment above `withinHoardLimits` | asserted no speculative declare ever cleared `declareThreshold 0.775` across 51,420 decisions. Abroad, `ev-claim` fires **30 times in 3,858 traced declares** (0.78%) [measured, corrected] | **closed in v0.1.** The measurement is now stated as what it was — a `declareThreshold` sweep of *Balanced* on one home bank — with the away result beside it. The gate move survives: it never needed `evClaim` to be dead everywhere, only too thin to carry a style |

### 1.5 What Monet is allowed to break, and what it is not

| may break | must not break |
|---|---|
| `Knowledge`'s internal representation (`knowledge.ts:134-157`, `:540-568`) | `SeatView` (`bots/types.ts:13`) — every input a posterior needs is already in it |
| `planClaim` (`decide.ts:391-439`) and `certainClaim` (`decide.ts:696-717`) | `reduce.ts` — verified needing no change: `actualHolders` is always complete (`:367-379`), `windowAfter` resets on every accept path (`:169-172`), `publicView` never leaks hidden identity (`views.ts:8-23`) |
| the ask scorer's probability term (`knowledge.ts:722-733`) | determinism and purity: a policy must remain a pure function of `SeatView`, and must not draw from the rng, or `tests/bots/explain.test.ts`'s bit-identity pin (`decide.ts:1975-1979`) fails |
| `BOUNDED.md`'s cost model — see below | `us54`'s rules. §4 is an owner decision, not an implementation detail (§4.2) |

**`bounded.ts` is the scoped casualty, and it must be scoped before code is written, not after.**
`BoundedFact` (`bounded.ts:127-142`) prices belief in 1–2 bit atoms, and `replayFacts` (`:358`)
reconstructs a `Work` from the kept facts and finishes through the identical `finishKnowledge`
(`knowledge.ts:502`) — which is what makes BOUNDED.md's large-budget equivalence pin hold *by
construction* rather than by two implementations staying in step (`knowledge.ts:495-501` says so).
**A joint posterior has no atomic-fact decomposition, so the bit budget becomes undefined.** Monet
v0.5 must choose, in writing, between confining the posterior to the unbounded arm and giving
BOUNDED.md a new cost model. This is a roadmap decision and it is listed as an acceptance item.

---

## 2. The defect Monet exists to fix, in the real code

**Lock hold: 9.30 events against SESTINA's 2.92, a factor of 3.2.** [measured, corrected, seed 90210,
1,200 games] It is the largest behavioural gap that survives the bridge correction, it barely moved
across the correction (9.55 → 9.30), and unlike ask accuracy it names a specific missing capability.

### 2.1 The split that decides where the work goes

The metric is a single number and the code makes it two. Instrumented at home — Punter at all six
seats, `us54`, 40 games, 286 declares (`scratchpad/probe-lockhold.mjs`, `probe-infer.mjs`):

| half | definition | mean events | share |
|---|---|---:|---:|
| **inference** | the set is on one team in ground truth → some seat on that team can *prove* it | **6.16** | **91.4%** |
| **decision** | a seat can prove it → that seat declares it | **0.58** | **8.6%** |
| total | ground truth → declared | 6.74 | 100% |

Decision-half distribution **over the 275 declares made with zero uncertain cards**: mean 0.01,
p50 0, p90 0, max 3 events. The table's 0.58 is the mean over **all 286**, and the difference is
carried by the 11 declares outside that population — so the 8.6% share rests on 11 samples and is
[inferred], not resolved. Declare-path attribution over the same 286 declares, read off
`decideExplained().trace.kind`:

| trace kind | count | share | code path |
|---|---:|---:|---|
| `certain-claim` | 163 | 57.0% | `decide.ts:696` |
| `own-book-claim` | 112 | 39.2% | `decide.ts:268` |
| `must-declare` | 5 | 1.7% | `decide.ts:1502` |
| `ev-claim` | 5 | 1.7% | `decide.ts:740` |
| `forced-claim` | 1 | 0.3% | `decide.ts:843` |

**275 of 286 declares (96.2%) were made with zero uncertain cards. Once a set is provable, Monet
cashes it essentially instantly.** [measured, home]

> **Caveat, stated rather than buried.** 6.74 is a home cell against Punter; 9.30 is the bridge
> instrument against SESTINA, and the two do not share a definition of "events before cashing". The
> home numbers are used here **only for the ratio between the two halves**, which is a property of
> the code rather than of the opponent. The 9.30 and 2.92 stay as the brief states them. The split is
> [measured, home]; that it explains the bridge gap is [inferred].

Corroborated on the bridge from the other side: the lag decomposition over 1,970 declared locks gives
HOLD 8.97, LAG 8.27, **POLICY 0.01**, with 99.1% of locks declared at the first provable poll and
265,884 declined polls in which no provable set was in hand. [measured, defective — but the brief
shows the defect moved the marker by 0.25 events, so the causal arrow survives]

**Consequence, and it is the single most useful sentence in this document: every declare knob in the
codebase addresses 8.6% of the wait** — a share carried by 11 declares, so [inferred] rather than
resolved. The direction does not depend on the share: 96.2% of declares carry zero uncertain cards,
and §2.2's structural gate is the reason.

### 2.2 The knobs this rules out, with their code paths

`decideWindow`'s gate order (`decide.ts:1411-1520`):

```
ownTeamCards == 0            :1402   §4 hard rule, no style may override
forced = stalled || must     :1419-1421
declarableOwnBook            :1435   -> withinHoardLimits, bypassed when forced
certainClaim                 :1460   -> withinHoardLimits
evClaim                      :1476   -> threshold, clinch, hoard, eagerness
forcedClaim                  :1487
decline                      :1503
```

| knob | consumed at | reachable? |
|---|---|---|
| `declareEagerness` | `eagerEnoughToDeclare:624` → `windowTicksWanted:641` | `evClaim` only |
| `declareThreshold` / `declareThresholdStalled` | `evClaim:736` | `evClaim` only |
| `declareMaxUncertain` | `evClaim:749` | `evClaim` only |
| `foreignDeclareThreshold` | `evClaim:762` | `evClaim` only |
| `clinchAggression` / `denialWeight` | `clinchAdjustedThreshold:581-592` | `evClaim` only |
| `foreignDeclare` | `certainClaim:681`, `evClaim:747` | both |
| `hoardBooks` / `minHandSize` | `withinHoardLimits:496-515` | all refusable declares |

**Nine of ten declare knobs sit behind a branch that fires on 1.7% of declares at home and 0.78%
abroad.** They cannot buy a 3.2× factor and Monet does not spend effort on them. The corrected
ablations agree: four of five declare knobs reproduce base to four decimals, and the fifth buys speed
by guessing at −0.97 points [−2.44, +0.50]. [measured, defective, paired — the arms share the defect
and the contrast is paired, so the null is safe]

The structural reason is one line: `evClaim`'s `allOnTeam` gate (`decide.ts:766-775`) rejects
**415,822 of 417,010** candidate plans (99.72%) before any threshold is read.

### 2.3 Why proving a set costs ~9 events and not ~3

`certainClaim`'s test at **`decide.ts:705`** is the operative definition of "provably ours":

```
plan.uncertain.length === 0 && plan.p === 1
```

`plan.uncertain` is empty iff `holderOf(k, c) !== null` for all six cards (`decide.ts:400-411`), and
`plan.p === 1` iff every one of those certain holders is on the viewer's team. **So "provably ours"
is six independent per-card certainties**, and a certainty arrives from exactly one of:

| rule | line | yield |
|---|---:|---|
| hit on an `ORIGINAL` card — `fixX(ci, target)` | `knowledge.ts:263` | 1 event → 1 card |
| miss — `clearCand` asker and target, **on that card only** | `knowledge.ts:272-277` | 1 event → 2 bits on 1 card |
| ask licence (row 6) — pushes an at-least-one-of disjunction | `knowledge.ts:220-246` | 1 event → 1 constraint |
| claim reveal — `fixX` all six, then `GONE` | `knowledge.ts:281-295` | 1 event → 6 cards, of another set |
| own-hand injection — YES on held, NO on every unheld card | `knowledge.ts:511-534` | free, no events |
| count exhaustion / forcing | `knowledge.ts:196-208`, `:323-343` | global, late only |

For a six-card set the viewer typically holds 1–3 members free. **Each remaining card then needs its
own certifying chain**, and the information yield per public event is roughly one card. That is the
~9-event shape.

**The three structural losses, each with its line:**

1. **A miss constrains one card.** `knowledge.ts:272-277` clears two bits on the card that was named.
   Under a joint posterior the same miss reweights the whole deal distribution — *"seat t lacks 5H"*
   combined with *"t has 6 unknown slots of 30"* shifts mass across every unresolved card. The rest
   is discarded.
2. **The constraint pool never reaches the declare decision.** `planClaim` (`decide.ts:391-439`)
   reads `k.cands` and `k.unknownSlots` and **never touches `k.constraints`**. Verified: the only
   reader in the decision path is `refinedHitProbability` (`knowledge.ts:703-719`, called from
   `decide.ts:1098`, `decide.ts:1734`, `contained.ts:316`), which is ask-ranking only and gated on
   `skill.refinedInference`. The one piece of joint structure the engine holds is invisible to the
   code that decides whether a set is ours.
3. **The speculative escape hatch is arithmetically dead.** `evClaim` already tests the correct
   weaker condition at `decide.ts:766-775` — every uncertain card's candidates are all teammates,
   i.e. the set is certainly the team's and only the *assignment* is open. But `plan.p` is a
   **product of independent per-card marginals** (`decide.ts:427`), so two uncertain cards at ~0.55
   give p ≈ 0.30 against Punter's 0.775 bar (`roster.ts:214`). The branch cannot fire.

### 2.4 The one seam, and the one thing that is already free

`knowledgeFor(view, pol)` — **`decide.ts:263-265`**. Every policy path takes its belief from there
(`decide.ts:1256`, `:1473`, `:1548`, `:1555`). A posterior is introduced behind that seam.

**The seam is necessary and not sufficient**: if the posterior materialises a `Knowledge` through
`finishKnowledge` (`knowledge.ts:502-569`), the collapse to masks at `:540-568` throws the joint away
again.

**The cheapest fact in this roadmap:** `SeatView = PublicState & { seat, hand }` (`bots/types.ts:13`,
built by `views.ts:26-32`) already carries the log, per-seat counts, own hand, config and resolved
books. **Every input a joint posterior needs is already there. The missing thing is not information;
it is the representation over it.**

**And the load-bearing insight for the version ordering.** `refinedHitProbability`
(`knowledge.ts:703-719`) folds surviving constraints into `pHit` by taking a `max` over **one**
constraint, and its own comment says it ignores overlap between constraints. **The licence
conditioning of v0.3 is the first-order version of the same computation the posterior of v0.5 does
exactly.** That is why v0.3 comes before v0.5, why they are expected to be substitutes, and why v0.3
is the cheapest real evidence available that the constraint channel carries win-rate points at all.

---

## 3. The version ladder

Every milestone states what ships, what it must measure, and a **falsifiable acceptance test with a
detection floor and the sample size that floor implies**. **No milestone is accepted on a single
cell.** Minimum three seeds; headline milestones six; anything claiming under 3 points needs twelve.

**Win-rate figures in the "target" column are design targets, not forecasts.** v0.3's
target is measured; v0.4's is an extrapolation bounded above by the oracle, and §0.1
explains why the band is 31–37% rather than a point. The readout (§3.5) carried no target by design;
the rungs the owner added after it (§3.6–§3.8) carry pre-registered bars.

> **Compacted 2026-09-01 on the owner's instruction.** The ladder ran to ten rungs; it now runs to
> six. **v0.5 carries what v1.0 was going to carry, and is measured before v1.0 is defined** — the
> point of the exercise is to find out where the capability actually lies rather than to march
> toward a number the evidence does not support. Old v0.3+v0.4 merge into **v0.3**; old v0.5+v0.6
> merge into **v0.4**; old v0.7+v0.8+v0.9 merge into **v0.5**. Every merged rung's engineering
> detail is preserved below as a sub-part; nothing was deleted.
>
> **What compaction does not do is change the physics.** §0.1's measured ceiling is unchanged:
> everything this project has measured, stacked with a full additivity the evidence contradicts,
> reaches ≈37.3%. Fewer rungs make the same points arrive in fewer releases, not more points
> arrive.
>
> **What it does cost is attribution, and that has to be paid for explicitly.** A rung that ships
> three mechanisms and does not move cannot tell you which of the three failed — and per-mechanism
> attribution is the whole reason this project's numbers are worth anything. **So each bundled
> mechanism keeps its own marker and its own ablation cell even though it ships in one version.**
> A compacted rung is a release boundary, never a measurement boundary.
>
> **Extended 2026-09-03 on the owner's instruction.** The readout kept its section (§3.5) and lost its
> version name: the ladder now runs **v0.5 opponent reading (§3.6) → v0.6 communication (§3.7) → v0.7
> the search arm (§3.8) → v1.0 (§3.9)**, each rung pre-registered when it opens, each carrying its own
> markers and ablation arms, each able to stop the programme at its own gate.

| version | ships | target vs SESTINA | primary acceptance metric | effort |
|---|---|---:|---|---|
| **v0.1** ✅ | fork, instrument, record — no behaviour change | 27.08% (did not move) | byte identity + op coverage | S — **shipped** |
| **v0.2** | ask-scorer correctness (`minHitP`, two `rankAsksWith` defects) · the pre/post-clinch metric split | 27.08% (must not move) | DEAD counter; the split reported | XS–S |
| **v0.3** ✅ | λ = 0.60 licence conditioning · `defuse` frozen at 1 with its interval · the score term measured and not shipped | **30.96%** (target ≥ 30.5%) | calibration bias — home ✓, abroad ✗, the finding · the `defuse` ladder at ±3.10 · lock hold for the score term (0.01–0.05 events: nothing to move) | S–M — **shipped** |
| **v0.4a** ✅ | `pCardAt`, the calibrated marginal (`pModel: 'marginal'`) · λ measured against it and taken out | **31.94%** (bar ≥ 33.0% — **not met**; the λ-on arm reads 33.78%) | calibration — aggregate abroad ✓ 0.002, deciles ✗ · ask accuracy 51.71 → 53.91 · the marginal's own effect +4.74 (6/6) | L — **shipped, item 4 missed, on the record** |
| **v0.4b** ✅ | `pAssignment: 'joint'`, the chain over the marginal · `claimOwnership: 'priced'` measured and not shipped | **32.75%** (bar ≥ 36.0% — **not met**; +0.81 over v0.4a, inside the floor) | lock hold 9.98 → 10.07 — **did not move: the item's FAIL and the finding** · declare accuracy 97.86 → 98.32 (6/6) · speculative declares 37 → 101 per 1,200 games at 72 → 93% | L — **shipped; the cashing channel is communication, not belief** |
| **v0.4c** ✅ | `licenceLambda` back on the joint at **0.3** — the 24-seed cell decision 5 named (0.6: +1.88 over v0.4b, 22 of 24), the finding that λ buys tempo, not accuracy, and the pre-registered 0.3-vs-0.6 confirmation on 24 fresh seeds (+1.19 paired, SE 0.30, 19 of 24) | **35.12%** over the 24 confirmation seeds at 0.3 (34.08% at 0.6 over the first 24) | calibration cost +0.020 at 0.3 (0.6: +0.050) · lock hold 9.46 → 9.42 · ask accuracy 53.12 → 53.57 | S — **shipped** |
| **the gate readout** ✅ (2026-09-03; was to be v0.5) | **the capability readout** — the §3.5b gate at six seeds on v0.4b, the `r12`-off control, the handoff emulated at home; the search arm not priced (§3.5c is gated on the owner's row-3 choice) | **32.75%** — the rule's third row | panel 35.5 / 36.9 / 36.4 / 64.7 / 69.3 against v0.6 … v0.2 · `r12` off −0.69 · handoff 47.8 → 77.6% at home · **§8.3 decision 6 to the owner** | M — **the measurement is on the record; no code shipped** |
| **v0.5** | **opponent reading** — ask-choice inference into the marginal's prior (`pPrior: 'choice'`, with a per-seat in-game variant) · the defusal appetite as a function of the state (`defusePolicy: 'state'`) | ≥ 35.0% (design target; expectation +1 to +3 over the base) — **read 2026-09-03: 34.92% at κ = 1 against the base's 34.46%, +0.47 paired (SE 0.59), inside the floor; nothing shipped (§3.6c)** | opponent-location score at home · ask accuracy · sets lost to opponent declarations · the 2 × 2 abroad at twelve seeds, ±2.00 | M–L |
| **v0.6** | **communication** — asks chosen to reveal · the handoff played as an out-of-turn convention | ≥ 38.0% (design target; the ceiling is measured, 38.28%) — **read 2026-09-03: both items behind or flat at home (§3.7a), nothing went abroad, nothing shipped** | lock hold · compelled-declare accuracy · twelve seeds, ±2.00 | M |
| **v0.7** | **the search arm**, only if a gap is left, only through §3.5c's cost-first test | no target until priced — **read 2026-09-03: priced at 96 ms an ask (budget 100); the pre-registered form a no-op at home (§3.8a); the lock-only leaf, post-hoc, abroad: 35.05% against the base's 34.91%, +0.14 paired (SE 0.67), inside the floor; nothing shipped** | cost budget first, then paired arms on shared determinizations | XL |
| **v0.33** — the belief's seat: the clone's second feature set (2026-09-08) | **row 39's, by the standing rule**: sixteen features per legal ask on top of the clone's 33 — the slot prior (the independent per-card belief) beside the marginal, the slot prior under an ask-choice prior of SESTINA's `kappa`, and the target's own dealings with the asked half-suit off the log (its asks, hits, misses, the cards taken from it, how long ago) — fitted at §3.8ad's F1's width and data so the features are the one variable (§3.8af); the instrument costs 0.02 ms an ask | pre-registered 18:14Z 2026-09-08; M1 (F3) lands about 05:00Z 2026-09-09, eligible at +1.0 point of holdout top-1 over F1; then the pairs against C at home and the bridge | M |
| **v0.32** — the declare clone, read and not built (2026-09-08) | **row 38's, by the standing rule**: the reader of the records' declare events (`scripts/probe-declares.mjs`) read before a feature was written — per completed half-suit SESTINA declares as we do (1.20 cards placed by belief a declare against our 1.24, right 97.8% against 97.5%; declared at once 78% against 75%); the gap is the count of completed half-suits, which the asks make: +16% over v0.20c's vector, +6% over v0.30's (§3.8ae) | a records read: no cell played, nothing to ship; the instrument committed | S |
| **v0.31** — the clone re-fitted (2026-09-08) | **row 37's, by the standing rule**: the same ask clone, its 33 features, fitted wider (128·128), longer (24 epochs) and on two and a half times the data with the 2026-09-08 cells added; nothing in the engine changes — a new data module and a registry entry (§3.8ad); the declare clone (v0.32) pre-registered when its reader exists, expert iteration after M4's read | a fit must beat C's margin over the stack's own decision by half a point on the same holdout (M1; the half-suit-and-seat agreement read beside it — C 82.7%, the ceiling on top-1 about 72%: SESTINA's card among equals is a random pick); C2 against C at home ≥ +2 SE and a majority of banks (M2); ships by §3.8n's bar against v0.30's vector on twelve fresh seeds (M3); the registry change a PR for the owner; the fits start when M4 releases the machine, the rung inside two days after — **F1 read 21:32Z: holdout top-1 56.56%, margin 12.83, not eligible at 13.2 (C's 12.67 + 0.16 for 2.5× the data and 2× the epochs); F2 lands about 05:00Z 2026-09-09** | M |
| **v0.30** — the SESTINA clone (2026-09-08) | **row 35's, under the owner's direction of 2026-09-08 ("learning from sestina's play is essential … we should be learning to beat sestina")**: an ask policy fitted on SESTINA's own ask decisions from the bridge records — 33 features per legal ask over the stack's own ranking, a conditional logit, the argmax the policy (`lib/engine/bots/imitation.ts`, `StyleParams.askModel`, `gen-imitation-data.mjs`, `fit-imitation.mjs`) — read as a player (M2 at home, M3 abroad) and as the search's opponent model in the rollouts of §3.8aa's t32 form (`SearchParams.oppAskModel`; M4 abroad, the one-variable comparison to t32's own bridge read of −1.61 points; §3.8ac) | the clone must predict SESTINA's choice at least 5 points better than the stack itself does on held-out games (M1); a player cell must read ≥ +2 SE at home before it goes abroad (M2); ships by §3.8n's bar against v0.20c's vector on twelve fresh seeds (M3, M4); the registry change a PR for the owner, stacked on #41; the whole rung inside two days of wall clock — **read 2026-09-08: M1 every fit eligible (C, the 64·64 net, predicts SESTINA's choice on 56.32% of held-out decisions; the stack's own choice 43.65%, the ranker's top 38.94%); M2 the MLP-64 clone +1.056 ± 0.145 a pair at home (+7.89 points, 14.2 SE, twelve of twelve banks), C +0.954 ± 0.146 (+7.13 points, 12.8 SE, twelve of twelve); M3 C +7.24 ± 0.63 points against SESTINA v1.0 on the twelve fresh seeds (48.0% against the base's 40.8%, 11.5 SE, every seed ahead; the MLP-64 clone +6.67 ± 0.61) — §3.8n's bar cleared, the registry PR #49 for the owner (row 36); M4 the t32 form with C at its rollouts' opponent seats −1.33 ± 0.74 points abroad (−1.80 SE, 5 of 12) against the same form's −1.61 with S — the opponent model is not the search's loss abroad** | L |
| **v0.29** — the learned leaf (2026-09-08) | **row 34's, under the direction — the plan §3.8aa wrote**: a value function over the full-information state (118 features: the score, the cards and, per half-suit, who holds them and which seats have located them, from the engine's own knowledge walk) fitted on 48,000 self-play games of the shipped stack to the FINAL set differential (`lib/engine/search/value.ts`, `gen-value-data.mjs`, `fit-value.mjs`), evaluated at the search's horizon in place of the lock count (`leafNet`), with S 0 a one-ply expectation over the deals; read by duplicate pairs at home (S 0 at D 128 and 512, and s128's form with the leaf swapped), the marker re-read at the game's end, the bridge on twelve fresh seeds at the eligible cell (§3.8ab) | the fit must beat the static lock count as a predictor of the end (M1), a cell must read ≥ +2 SE at home (M2); ships by §3.8n's bar against v0.20c's vector on the twelve; the registry change a PR for the owner, stacked on #41 — **read 2026-09-08: M1 every fit eligible (the 128·128 net R² 0.302 against the static lock count's 0.209); M2 the dense n128 eligible at the bar's edge — +0.161 ± 0.144 (2.2 SE, eight of twelve banks, +1.2 points), the sparse forms +0.022 and +0.002, the linear leaf in the game −1.053 ± 0.143 on twelve banks (exploited by the search that optimises against it); n512 and n24 deferred, and n128's bridge read deferred behind v0.30's cells, under the owner's wall-clock direction; nothing shipped — the leaf buys little, the opponent model is the piece (§3.8ac)** | XL |
| **v0.28** — the search re-scoped, compute unconstrained (2026-09-07) | **row 33's (s), under the owner's direction of 2026-09-07 ("I don't care about any cost of compute")**: §3.8a's arm with the shipped stack as its rollout policy and the lock-only leaf, the deals scaled 8 → 512 with §3.8a's marker read at every rung and pooled twenty processes wide, a second candidate generator (`candMode` `'sets'`: the pick and one ask per other half-suit), duplicate pairs at home at D 32 and at the largest D the marker justifies, the bridge on twelve fresh seeds at the eligible cell with the wall clock reported and not gated (§3.8aa) | the yield must grow with the deals or the leaf is the limit (v0.29, the learned leaf); ships by §3.8n's bar against v0.20c's vector on the twelve; the registry change a PR for the owner, stacked on #41 — **read 2026-09-07/08: M1 the cost as predicted; M2 the marker grows with the deals for `'sets'` (s128 +0.082 a searched decision, the grid's best) and caps at 32 for `'top'`; M3 s128 −0.333 ± 0.144 a pair at home (−4.5 SE, 3 of 16 banks) — the marker is not the objective, the leaf's units are not the game's; the sparse form −0.040 ± 0.127 (a searched move alone worth about nothing by the game's end); t32 +0.248 ± 0.144 (+3.4 SE, 9 of 10 banks — eligible at home) and −1.61 ± 0.77 abroad (−2.1 SE, 4 of 12 seeds) — the rollouts' model of the opponents is S, and abroad it is wrong; s32 −0.191 ± 0.140 (−2.7 SE, one of ten banks) — nine candidates are more than thirty-two deals resolve; nothing ships — the leaf is the limit (§3.8ab), the opponent model the piece (§3.8ac)** | XL |
| **v0.27** — the joint re-fit (2026-09-07) | **row 31's (j): the shipped doses moved two at a time — the one-at-a-time surface (§3.8v, §3.8y) is flat within a point on every axis but `contest`, and the one interaction measured is positive (§3.8r: the two closing rungs together +0.301 against +0.043 + 0.172 apart)** — `closing` 1 + `closingFour` 3, `closing` 0.25 + `closingFour` 1, `contest` 0.8 + `closingFour` 3, `contest` 0.5 + `closing` 1, 2,400 duplicate pairs each against the shipped stack at home, the control at zero first; the markers on every eligible arm; the primary abroad on twelve fresh seeds against v0.20c's vector (§3.8z); no change to `lib/` | eligible at home at ≥ +2 SE with the sure-miss share within 3 points; the primary ships by §3.8n's bar against v0.20c's vector on the twelve (±2.00 still the rung; the registry change a PR for the owner, stacked on #41); the secondary reported, unable to ship; if no arm is eligible the family is closed at its shipped point on every axis and on the diagonals read — **read 2026-09-07: NO ARM IS ELIGIBLE; THE FAMILY IS CLOSED AT ITS SHIPPED POINT. `closing` 1 + `closingFour` 3 −0.033 ± 0.077 a pair (SD 1.93), `closing` 0.25 + `closingFour` 1 −0.041 ± 0.097 (2.42), `contest` 0.8 + `closingFour` 3 −0.128 ± 0.111 (2.77; BEHIND at 2.3 SE), `contest` 0.5 + `closing` 1 −0.103 ± 0.098 (2.44; BEHIND at 2.1 SE); the control 0.0000; every joint read within one SE of the sum of its parts (§3.8v): the surface is additive from the shipped point, and §3.8r's interaction was the credit's arrival on a vector without it, not a slope. The markers on the first: the move changes one ask in ninety and takes a chase hitting 16% over the stack's ask that would hit 50%; the chase share +0.3. v0.20c is the family's optimum (PR #41). Q1 four of four ranges, no arm eligible as the likelier side; Q2 two of four; Q3 and Q4 not reached. Row 32 hands the direction to the owner: (s) the search arm on the shipped vector or (t) a clinch-aware ask** | the control at zero; nothing exported, nothing abroad; the twelve seeds unspent | S |
| **v0.26** — the five rung's dose above one (2026-09-07) | **row 30's (f): the closing credit at five of six, `closing`, whose shipped 0.5 pays half of what the four rung's `closingFour` 2 pays and whose §3.8v ladder (0.25 / 0.75 / 1.0) never left the region where a certain hit elsewhere outranks the completing ask** — `closing` 2 / 3 / 4 / 6 with `closingFour` 2 and `contest` 0.6 held, 2,400 duplicate pairs each against the shipped stack at home, the control at zero first; the markers (the move's disagreement with the stack, the sure-miss share, the chase share and hit rate, the five-rung share of the asks) on every eligible arm; the primary abroad on twelve fresh seeds against v0.20c's vector (§3.8y); no change to `lib/` | eligible at home at ≥ +2 SE with the sure-miss share within 3 points; the primary ships by §3.8n's bar against v0.20c's vector on the twelve (±2.00 still the rung; the registry change a PR for the owner, stacked on #41); the secondary reported, unable to ship — **read 2026-09-07: NO ARM IS ELIGIBLE; THE RUNG STOPS AT HOME. `closing` 2 / 3 / 4 / 6 read −0.007 / −0.013 / −0.012 / −0.018 sets a pair (± 0.040–0.045 at 95%; SD 1.00–1.13), every one within one SE of zero; the control 0.0000. The markers say why: the dose changes one ask in three hundred at 2 and at 6 alike (99.7% agreement with the stack), and where it does it takes a completing ask hitting 42–44% over the stack's ask that would hit 67–69%; the five-rung share of the asks rises a quarter of a point (8.4 → 8.7%); the sure-miss share, the chase share and hit rate and the starter share unmoved. The completing ask is almost always a certain hit already first, or an uncertain one `gambleBonus` and `closing` 0.5 already put first; the dose above one reaches only the residue, a poor bet. The closing family is now read at every rung and every dose and the shipped point is its optimum one axis at a time. Q1 two of four ranges, no arm eligible as the likelier side; Q2 four of six (the disagreement share and the five-rung lift an order smaller than predicted); Q3 not reached; Q4 the lib md5 equal to v0.22's. Row 31 takes the joint re-fit, v0.27** | the tree's lib md5 equal to v0.22's (d30542fb…; §3.8u's identity cell this rung's); the control at zero; the six arm packages built and none played; no cell abroad | S |
| **v0.25** — the trailer's ask, a records read (2026-09-07) | **row 29's (b): the take-back against the ask elsewhere** — at every trail decision (§3.8q: a side holding two of six in an opened, unresolved, even set) whether a take-back is legal, the trailer's picture (`cert6`), the action (the take-back / an uncertain ask into the set / a certain or uncertain ask elsewhere / no card held), what the ask elsewhere bought (its hit, the set it went into and that set's outcome), and the trail set's recovery — Monet's and SESTINA's side of the fs and base corpora and the home mirror (§3.8x); no `lib/` change | a trail term is built as v0.26 only if, on fs, SESTINA's recovery after declining a legal take-back is within 5 points of its recovery after taking it AND the ask elsewhere it takes instead hits ≥ 50% and its set is taken ≥ 50%; else the trailer's story is closed — **read 2026-09-07: THE STORY IS CLOSED. (a) fails: SESTINA recovers 57.5% of its trail sets after taking a legal take-back and 44.9% after declining one, −12.6 points (SE 0.5) against a bar of 5; (b) holds: the ask elsewhere hits 57.7% and its set is taken 60.5% (67.9% and 71.2% on the asks that went elsewhere). No trail term is built. The split says why without reopening it: 11.0 of the 12.6 points are the set left open at the clinch and 1.6 the set lost — SESTINA declines into the sets it holds most of, in the games it is about to finish — and a take-back costs no tempo (a hit keeps the turn), so Monet, taking 78.6% of its legal take-backs against SESTINA's 39.1%, leaves one only for a certain hit elsewhere (its asks elsewhere at a trail decision hit 100.0%) and recovers the set as often either way (+2.0, SE 1.0). Both bots recover best by the uncertain ask into the trail set from a picture of four placed (67.0% / 70.4%), taken at 3–4% of trail sets. Q1 two of seven, Q2 three of six, Q3 missed both ways, Q4 held (25 walks pinned at 100.0%, EXACT, no assertion). Row 30 turns to the five rung's dose above one, v0.26** | every walk pinned in-engine at 100.0%; races EXACT; the trail decisions and take-backs reconciled EXACT with §3.8q; every certainly-placed card asserted against the live hands; the home mirror under `--validate` with the start rotating | S |
| **v0.24** — the placement value, a records read (2026-09-07) | **row 28's (n): what an ask buys the team's later decisions** — at every lead decision (§3.8q) the asking seat's certain count of the lead set's six cards (`cert6`) and whether a certain hit is on the table, and at the side's next decision on the set the change, by the action taken (chase hit / chase miss / ask elsewhere); the intervening asks into the set by each side; the conversion by the picture at the leader's first lead decision — Monet's and SESTINA's side of the fs and base corpora and the home mirror (§3.8w); no `lib/` change | a placement credit (row 28's (o)) is built as v0.25 only if, on fs, Monet's side, the chase places ≥ 0.5 certain cards more than an ask elsewhere AND the conversion at `cert6` ≥ 4 exceeds that at `cert6` ≤ 2 by ≥ 10 points; else the placement story is closed — **read 2026-09-07: THE STORY IS CLOSED. The chase places: Δ`cert6` +0.535 after a chase against −0.017 after an ask elsewhere, +0.553 (SE 0.004) for Monet on fs (SESTINA +0.538) — the first condition met. The picture does not convert: Monet converts 53.4% of the races it leads from `cert6` ≥ 4 against 51.9% from ≤ 2, +1.5 points (SE 1.6); SESTINA +8.0 (0.9); a seat that can place three converts worst of all — the second condition missed, no credit built. SESTINA converts more at every level of the picture (61.9 / 54.9 / 68.8 against 51.9 / 41.3 / 51.9), so its edge is in the race's play, not in what it knows when the lead begins; a chase miss is answered by a take-back hit 61% of the time; where a chase is legal Monet chases 36%, SESTINA 72%. Q1 three of four, Q2 one of four, Q3 at the edges, Q4 held (25 walks pinned at 100.0%, EXACT, no assertion). Row 29 takes the trailer's ask, v0.25** | every walk pinned in-engine at 100.0%; races EXACT; every certainly-placed card asserted against the live hands; the home mirror under `--validate` with the start rotating | S |
| **v0.23** — the appetite re-fit on the shipped vector (2026-09-07) | **row 27's (d): the three appetite doses that ship together — `contest` 0.6 (fit on v0.4c's vector, §3.8d), `closing` 0.5 (on v0.9's, §3.8h), `closingFour` 2 (on v0.9's, §3.8r) — were each fit with the other two absent; one-knob moves from the shipped point at home** — `contest` 0.4 / 0.8 / 1.0, `closing` 0.25 / 0.75 / 1.0, `closingFour` 1 / 3, 2,400 duplicate pairs each against the shipped stack, two controls at zero first; the combined move in a second round if two knobs are eligible; the primary and secondary abroad on twelve fresh seeds against v0.20c's vector (§3.8v); no change to `lib/` | eligible at home at ≥ +2 SE with the sure-miss share within 3 points; the primary ships by §3.8n's bar against v0.20c's vector on the twelve (±2.00 still the rung; the registry change a PR for the owner, stacked on #41); the secondary reported, unable to ship — **read 2026-09-07: THE RUNG STOPS AT HOME. No one-knob move is eligible: `contest` 0.4 −0.53 a pair (7.3 SE below zero), 0.8 −0.13 (2.5 SE), 1.0 −0.13 (2.1 SE); `closing` 0.25 +0.03 (1.7 SE), 0.75 −0.01, 1.0 +0.00; `closingFour` 1 −0.05, 3 −0.04; both controls at zero exact. The shipped point is a local optimum at home along every axis — `contest` sharply (it opens the even races: 13 points fewer at 0.4), `closing` flat (its dose decides 0.2% of the asks), `closingFour` slightly down on both sides of 2. Nothing abroad; the vector unchanged. Post hoc the markers exposed the home harness's first-mover bias — team A took the first turn in every `--home` game, and identical policies read 56% / 42% of the race starts — fixed by rotating the start (`--home-start`); §3.8u's starter line corrected (the three rung opened 10–13 points fewer races than the stack, not parity); no paired number on the ladder is touched. Q1's local-optimum claim held, four of eight dose ranges; Q2–Q4 not reached beyond the md5. Row 28 takes the placement value, v0.24** | the tree's lib md5 equal to v0.22's, making §3.8u's identity cell this rung's (else replayed); every cell pinned in-engine at 100.0%; races EXACT; the fourteen counters zero; ≤ 3 containers, a short cell replayed | S |
| **v0.22** — the rung below the four: `closingThree` (2026-09-07) | **row 26's (e): the closing credit's dose where the hit would leave two cards of the set outside the side's certain hands** — the ask that makes a seat-known four, §3.8p's decisive stage, 18% of Monet's asks by §3.8t — `closingThree · wHit · p · 0.25` on the same ungated arm as the four and five rungs, never above a certain hit; a home ladder over doses 1, 2, 4, 8 on the shipped vector (the control at zero first), the primary and secondary abroad on twelve fresh seeds against v0.20c's vector (§3.8u) | eligible at home at ≥ +2 SE with the sure-miss share within 3 points; the primary ships by §3.8n's bar against v0.20c's vector on the twelve (±2.00 still the rung; the registry change a PR for the owner, stacked on #41); the secondary reported, unable to ship — **read 2026-09-07: THE RUNG STOPS AT HOME. Against the shipped stack in 2,400 duplicate pairs the three rung reads −0.16 a pair at dose 1 (2.4 SE below zero), −0.21 at 2, −0.28 at 4, −0.46 at 8 — a loss at every dose, growing with it; the control at zero exact; no arm eligible, nothing abroad, the knob stays off the vector. The markers, post hoc on doses 1 and 2: the credit moves 4–5% of Monet's asks and makes its first lead decision a chase 8–9 points more often, the side opens fewer of the even races (43.7% against the stack's 54.1% once §3.8v corrected the home harness's first-mover bias; 48.4% against 49.2% as first read), the chases bought hit two points less. The identity cell on the v0.22 tree IDENTICAL. Q1 missed outright, Q2 one of five, Q3 and Q4 not reached. The closing family is read at every rung: the five pays, the four pays at its own dose, the three costs. Row 27 takes the appetite re-fit, v0.23** | the identity cell IDENTICAL (§3.8l's); every cell pinned in-engine at 100.0%; races EXACT; the fourteen counters zero; ≤ 3 containers, a short cell replayed; the knob byte identity absent or 0 on every path, pinned by its tests | M |
| **v0.21** — the rules-certain count, a records read (2026-09-07) | **row 25's (a): how much of the four rung's reach do two rules facts recover** — a teammate's licence live by the rules (an ask into the set, no hit taken from that seat in it since) and a side-certain card (every candidate holder on the side) counted in the seat's picture of a set — read on §3.8s's own records of the shipped vector, its base, §3.8r's twelve and the home mirror, every claim asserted against the live hands as the walk goes (§3.8t) | the reach at four with licences counted ≥ 1.5 × the certain reach on the shipped vector's records → v0.21b, the knob, at row 26; under → the rung stops and row 26 goes to row 25's (b) — **read 2026-09-07: THE RUNG STOPS. On the shipped vector's records the licence lifts the four rung's reach from 11.5% to 15.1% of Monet's lead sets (× 1.32; 12.9% of the seat-known-three sets), side-certain cards add a tenth of a point, the two together × 1.33 — under the bar on every corpus (× 1.31 on the base, × 1.30 on §3.8r's twelve, × 1.12 at home); SESTINA's 24.3% → 27.7%. The credit's population at the asks taken grows from 20.2% to 22.1%. The shipped licence lookup over-counts: it puts the side over its own holding at 5% of the lead sets, so a knob could not have read it. §3.8r's count replicated to the tenth (12.1% / 24.8%); no assertion fired on 43,200 games and the mirror. Q1 three of five, Q2 half, Q3 missed, Q4 half, Q5 held. Row 26 leaves (b) and takes the rung below the four: `closingThree`, v0.22** | the instrument's assertions on every decision of 43,200 games and the home mirror; the base corpora replicate §3.8r's 12.1% within 2 points; no bridge cell; nothing under `lib/` | S |
| **v0.20c** — the bridge read of the four rung (2026-09-06) | **v0.20b's two best home arms abroad, the marker bar dropped and the reason stated** — `closing` 0.5 + `closingFour` 2 (the primary; +0.30 a pair at 4.9 × SE at home) and `closingFour` 2 (the secondary; +0.17 at 2.8 × SE) against the base on the twelve fresh seeds drawn for §3.8r and unread (§3.8s) | the primary ships by §3.8n's bar (≥ 2 SE above zero, ahead on a majority of the twelve; ±2.00 still the rung; the registry change waiting for the owner); the secondary reported, unable to ship from this rung — **read 2026-09-07: THE PRIMARY CLEARS THE BAR, THE FIRST TERM ON THE LADDER TO DO SO. `closing` 0.5 + `closingFour` 2: 41.25% against the base's 40.31%, +0.94 paired (SD 1.49, SE 0.43, 2.18 × SE), ahead on 8 of 12 with one tie — under the ±2.00 floor and marked as such. The secondary `closingFour` 2: +0.34 (SE 0.42, 0.81 × SE), ahead on 8, does not clear; the stack beats it by +0.60 on the same seeds at 6 × SE paired. Every cell pinned in-engine at 100.0% (36 of 36), the counters zero, the cover files complete after one IDENTICAL replay, calibration over its bars by a hundredth on a third of the cells as on the base. The credit moves 3.0% of Monet's asks abroad and the race markers by their smallest units (chase share at lead decisions +0.5, first-chase +1.6, the lead converted +0.4); the margin +0.046 sets a game, the locks cashed 0.2 events sooner. Q1 six of seven, Q2 half, Q3 held. The registry PR is opened for the owner; row 25 names the next rung** | the identity cell IDENTICAL (§3.8r); every cell of every arm pinned in-engine at 100.0%; the fourteen counters zero; ≤ 3 containers, the short cell replayed; the markers abroad through `--race42` | M |
| **v0.20b** — the race-pace term (2026-09-06) | **the closing credit's four-of-six rung at its own dose** — `closingFour`, a Monet-only knob: at a seat-known four of six the credit is `closingFour · wHit · p · 0.5` in place of `closing`'s dose, the five rung and §3.8h's gate untouched; the population §3.8q put two-thirds of SESTINA's chase surplus in (§3.8r) | a home fit over `closingFour` 1 / 2 / 4 / 8 and the stack with `closing` 0.5 (2,400 duplicate pairs each; eligibility = no home loss at 95%, the chase share at lead decisions up ≥ 5 points, the sure-miss share within 5); the primary and a secondary abroad on twelve fresh seeds; ships by §3.8n's bar — **read 2026-09-06: STOPPED AT HOME BY ITS OWN BAR. The home pairs are the strongest on the ladder — `closingFour` 1 +0.150 a pair (2.7 × SE, +1.1 points), 2 +0.172 (2.8 × SE, +1.3), 4 +0.075, 8 −0.101, and the stack `closing` 0.5 + `closingFour` 2 +0.301 (4.9 × SE, +2.3 points), the first home cell on the ladder to clear two standard errors — with the chases it buys hitting more, not less, and the sure-miss share unmoved. But the chase share at lead decisions moved 0.5–3.1 points against the pre-registered 5, because the seat can place four of the set on its side at only 12% of Monet's lead sets against SESTINA (25% of SESTINA's own): the four rung reaches 10.7% of Monet's lead decisions, and no dose can move the share five points. The rule stands: nothing goes abroad from this rung; the twelve fresh seeds are unspent; row 24 re-registers the bridge read as v0.20c with the bar corrected (§3.8s). Q1 one of four, Q2 one of four, Q3 missed; the identity cell IDENTICAL** | the identity cell IDENTICAL at 6269924; the knob's six tests; typecheck, lint, 1,084 tests; the markers through `--race42` at home; the post-hoc reach count | M |
| **v0.20** — the four-of-six decision (2026-09-06) | **an instrument, no vector change** — at every ask decision of a side holding four (or two) of six in an opened, unresolved, even-by-the-deal set, what it did about the set — the chase, the take-back, a certain hit elsewhere, an uncertain ask elsewhere — Monet against SESTINA against the counterfactual at the same points; the outcome by the first choice (§3.8q) | a race-pace term is fitted (v0.20b) only if the counterfactual's choice differs from SESTINA's by ≥ 5 points at the lead or the trail, in the direction that converts more — **read 2026-09-06: THE PACE IS A CHOICE, AT THE LEAD. SESTINA asks into the race at 59.4% of its lead decisions; v0.9's picker at the same points would at 39.9% — Δ_lead +19.6 (SE 0.2), +19.2 on the replication twelve. The two agree on the certain chases and differ on the uncertain one, and SESTINA forgoes a legal certain hit at 12.6% of its lead decisions, a thing Monet's picker never does. Two-thirds of the gap (13.6 of 19.6) is uncertain chases where the counterfactual asks an uncertain ask elsewhere — no certain hit on the table, the population §3.8h's credit competes in and v0.9 ships nothing for; one-third (6.8) is the uncertain chase over a certain hit, §3.8i's population, closed. Quality is not the edge: Monet's chases hit 53.0% to SESTINA's 49.3% and both carry 22–24% sure misses. SESTINA's first lead decision is a chase 98.3% of the time and its lead converts 60.8% when it is; Monet's 49.5%, converting 47.9% when it is and 49.3% when it is not. At the trail SESTINA takes back LESS than the counterfactual (41.7% of its legal take-backs against 75.4%; Δ_trail −17.1) and asks uncertain elsewhere instead — against the direction R3 favours, so no trail term. v04 and v06 chase more than the counterfactual too (Δ +7.4, +17.8) and Monet's wall falls in that order. The rule calls v0.20b: the closing credit's four-of-six rung at its own dose, a home fit, twelve fresh seeds abroad (row 23)** | `--race42` on `attribute.mjs`; the races reconciled with `--races` on 61 of 61 cells; the pin at 100.0% on 49 of 49 v0.9 cells; the home walk clean, the counterfactual's class identical to the policy's at every decision of both sides | S |
| **v0.19** — the even-set race (2026-09-06) | **an instrument, no vector change** — §3.8c R1's bucket priced on v0.9's vector from the records on hand: the race (who asks into a 3–3 set first, who takes it), the targeting (each side's share of asks into even sets, actual and counterfactual) and the price with its two bounds (§3.8p) | a mechanism is built only at a reachable price ≥ 1.0 point — **read 2026-09-06: the bucket is −0.190 sets a game (SE 0.012; the replication −0.196), 2.8 points; the race has two numbers — the opener's edge, +8 at any modern table (Monet's own mirror +8.9, SESTINA's +8.4, v04 and v06 ~0), and SESTINA's in-race edge +9.4 over Monet, which is not in who opens (Monet opens 64% of the races) and not in which set is asked into (34.8% against 35.3%; the counterfactual at SESTINA's decisions 35.6%) but at the 4–2 stage: the first side to four converts it at 56% between SESTINAs and 56% between Monets, at 49% for Monet against SESTINA and 61% for SESTINA against Monet; SESTINA asks into the race it opened every four events and resolves it in 26, Monet every six and a half in 36. The ceiling +2.8, the priority bound +1.1 (priced at zero by the v04 and v06 corpora), the conversion bound +2.6 — the price is reachable and the rule's call is the in-race play; row 22 names the step** | `--races` on `attribute.mjs`; the sums exact against the split table on 61 of 61 cells; the pin at 100.0% on 36 of 36 v0.9 cells; the home walk clean under `--validate` | S |
| **v0.18** — the stack read (2026-09-06) | **the two measured terms under the floor, apart and together** — `exposure` 0.6 + `exposureCertain` (§3.8e, +1.07) and `closing` 0.5 (§3.8h, +0.58) on v0.9's vector, read against v0.9 on twelve fresh seeds under §3.8n's rule (§3.8o) | ships at ≥ 2 SE above zero and ahead on 7 of 12; the floor +2.00 reported beside it — **read 2026-09-06: NOTHING CLEARS. The base 40.70 (SD 1.49); `e` −0.15 (SD 2.31, SE 0.67, ahead on 7 of 12) — §3.8e's +1.07 does not replicate on the translated bridge, its markers intact and SESTINA's ask accuracy down by as much as Monet's; `c` +0.25 (SD 0.97, SE 0.28, 7 of 12) — the closing credit +0.42 pooled over twenty-four seeds (2.3 × SE), under the bar on its fresh twelve; `ec` +0.70 (SD 1.87, SE 0.54, 8 of 12), the interaction +0.60 on ±0.9. The identity cell IDENTICAL, four pins at 100.0%, the fourteen zero on every intact process file, §6.2's table complete on 49 of 49 after seven byte-identical replays of cells the bridge's kill window had left a file short. The rule's resolution at twelve seeds: 1.3 points for a loud term, 0.6 for a quiet one. Nothing ships; row 21 open** | the paired read; the identity pin first; the in-engine pin of every arm; §6.2's table on 48 cells | S |
| **v0.17** — the §3.9 read (2026-09-06) | **§3.9's protocol on v0.9's vector** — the shipped bot under all six conditions, nothing fitted, nothing shipped (§3.8m) | ≥ 50.0% at twelve seeds — **read 2026-09-06: NOT MET. 41.31% on §3.8l's twelve (SD 1.29) and 40.11% on §3.8f's (SD 1.55); the panel monotone, v02 and v03 beaten on every seed (74.18 / 70.40), v04, v05 and v06 on none (47.62 / 46.81 / 44.72); declare accuracy ≥ 99.2% and the fourteen fault counters zero on every restated-adapter cell; §6.2's table clean, the per-process op counts equal to the engine's on 73 of 73 cells; the number reproduced to the hundredth on all twelve seeds by an independently built arm, the records identical on ten. Conditions 1 and 3 fail; 2, 4, 5 and 6 hold. Nothing ships; the §0.3 fork is the owner's (row 19)** | the pre-registered read of the six conditions; the panel on the same twelve seeds; a second adapter written from the documented protocol by an independent agent, compared game for game | M |
| **v0.16** | **the licence likelihood, calibrated** — §3.8l: a seat that asked into a set holds about 1.5 of its alive cards whatever their number (§3.8k); three knob families calibrated on the records through §3.8k's seam and read through the same falsifiers; `licenceHold` at 1.5 selected, the per-cell `choiceKappa` families void (each adds hard zeros at true holders) | ≥ 43.31% (the base on §3.8l's twelve, 41.31%, + 2.00) — **read 2026-09-06: 40.58% against 41.31%, −0.74 paired (SD 1.58, SE 0.46), ahead on 4 of 12, inside the floor; behind 0.024 sets a game on 10 of 12 — the wrong declares double through the chain over the held table, a path the falsifiers never read; recorded, not shipped; the belief axis closes** | the records study first (fit on three seeds, 39 runs; held out on 21), then one paired read abroad on twelve fresh seeds | M |
| **v0.13** | **the chase appetite** — §8.3 row 13's rung and the last ask-ranker term to be tried: a second, separately fitted appetite paying §3.8h's `lock` credit to the UNCERTAIN chases §3.8h's gate refuses, flat in the hit chance with the scaled form as its control (`chase`, `chaseScaled`, §3.8i) | ≥ 42.11% (the corrected v0.9 + 2.00) on twelve fresh seeds, and a marker gate on the three fit seeds before those twelve are spent — **read 2026-09-04: CLOSED ON THE FIT, twelve seeds never spent. Every dose loses, monotonically: −1.08, −2.50, −5.17, −7.56 at `chase` 2.0/2.5/3.0/4.0 and −3.44 at the scaled control. On the asks it moved the base's preferred ask hit 100.0% against 29.7–50.1% taken; the chase rate did not move (31.5 → 31.8%, bar +1.5) because the asks it buys are sure misses into the side's own majority, not chases. Nothing ships** | fit abroad on three fresh seeds over seven arms; markers from the records through §3.8g's instrument, with bars and a ceiling | M |
| **v0.12** | **the closing ask** — §3.8g's rung: a ranker credit for an ask that would bring a set the side already holds most of within reach, counted by certainty and by belief (`closing`, `closingBelief`, §3.8h) | ≥ 42.1% (the corrected v0.9 + 2.00) on twelve fresh seeds — **read 2026-09-04: 40.69% against the corrected v0.9's 40.11%, +0.58 paired (SD 0.79, SE 0.23), ahead on 9 of 12; every pre-registered marker moved as written and each by about a tenth of its gap; the belief form loses on every seed; nothing ships** | fit abroad on three fresh seeds, confirm on twelve; markers from the records through §3.8g's instrument | M |
| **v0.11** | **the declare priced on the records, and the compulsion translated** — the risk bar priced at a quarter of a point and not built; the bridge's MUSTFIX (§3.8f), the home compulsion no longer answered into the host's optional poll | the fix's paired value on §3.8e's twelve seeds against the recorded v0.9 cells; predicted +1.4 to +2.0 — **read 2026-09-04: +1.28 paired (SD 0.29, SE 0.08), ahead on 12 of 12; the corrected v0.9 reads 40.11%; every marker as written; not a rung, no policy ships, the bar not built** | the records first, one identity cell, twelve paired cells | S |
| **v0.10** | **the exposure rung** — §3.8d's exposure charge fitted on v0.9's vector, gated as built and with the charge on certain hits (`exposureCertain`, §3.8e) | ≥ 40.9% (v0.9 + 2.00) — **read 2026-09-04: 39.90% against v0.9's 38.83%, +1.07 paired (SD 1.89, SE 0.54), ahead on 8 of 12; every pre-registered marker as written, about a point each; nothing shipped** | fit abroad on three fresh seeds, confirm on twelve; markers from the records | M |
| **v0.9** ✅ | **the priced ask** — the contest credit on the miss branch of the ask ranker, `contest: 0.6` on v0.4c's vector (§3.8d); the exposure charge measured +3.31 alone and +0.67 on top, and stays off the vector | ≥ 37.1% (v0.4c + 2.00) — **read 2026-09-04: 38.92% against the base's 34.88%, +4.04 paired (SD 1.63, SE 0.47), ahead on 12 of 12 fresh seeds** | fit abroad on three seeds (pre-registered ladder, then the amendment's extension at +1.0 over the pick — not met), confirm on twelve; the instrument's markers from the records (two of five as written; the mechanism that won is the contest, not the take-back) | S — **shipped** |
| **v0.8** | **the determinized declare** — a sure set cashed when the posterior proves it, not when the walk locates it (§3.8b) | ≥ 37.1% (v0.4c + 2.00) — **read 2026-09-03: 35.15% against the base's 35.07%, +0.08 paired (SE 0.08), inside the floor; 0.13 consensus claims a game at 99.6%; nothing shipped** | home markers (claim accuracy ≥ 95%, pairs ahead ≥ +0.20), then twelve seeds abroad | M |
| **v1.0** | **the version that passes §3.9's six conditions** | ≥ 50.0% — the owner, 2026-09-03: "about 50%, or significantly above", i.e. ≥ 52.0% at twelve seeds | §3.9 | — |

> **v0.5 is a readout, not an attempt.** It deliberately carries no win-rate target, because the
> honest expectation from §0.1 is **31–37%**, not 50%. If v0.5 lands there, that is the answer to
> "where do the capabilities lie", and v1.0 is then a decision about architecture — or about
> publishing a negative result — taken with the number in hand rather than in advance. Writing a
> 50% target onto v0.5 would be writing down the answer we want.
> **It landed at 32.75% (§3.5b), and the owner's answer was a fourth option: keep building (§0.3, §8.3
> decision 6). The version name v0.5 now belongs to §3.6's rung; this readout is §3.5.**

> **These targets are additive and the evidence says the terms are not.** v0.4's 36.0% is λ's
> shipped-config +3.71 plus the oracle's entire +5.75, stacked — the same pair §0.1 and §2.4 argue
> are substitutes, and the same subsumption §3.5 lists as its own risk. **They are stated as design
> targets so that a miss is legible, not because a stack of substitutes is expected to hold.** Each
> milestone's real acceptance is its mechanism marker (calibration bias, lock hold, DEAD counts,
> declaration counts); the win-rate column is reported last and a miss against it is *not* a failure
> if the mechanism marker moved. **[speculative]** — and if v0.3 freezes at `defuse: 1`, the 31.50%
> arm §0.1's bound is built on is never built, so §0.1's ≈37.3% ceiling must be re-derived on the arm
> actually shipped before v0.5's readout is interpreted against it. **It did freeze (§3.3b,
> 2026-09-03), so that re-derivation is owed at v0.5's readout; the defuse-0 arm exists as a measured
> rung on the v0.3 tree — 31.81% over six seeds — and not as the shipped bot.**

### 3.1 Monet v0.1 — the fork, the instrument, and the record

**Ships.** The Bass v2.0 policy, unchanged in every reachable path, under the Monet name. Plus:

- **The confirmed `major` audit finding, fixed.** The defect was `observe.ts:301-304` *as of
  `d918d76`* — line anchors are given against the revision the defect lived in, because the fix
  moves them. The claim branch decremented `counts` **per entry present in `actualHolders`**, not
  per card of the resolved book. At home the map always has six entries (`reduce.ts:367-379`) so
  nothing showed; on the bridge a failed declare emits only cards already public from an earlier
  hit, and every unlisted card left its hand without the replay noticing. Verified directly
  (`scratchpad/probe-observe.mjs`, `us54`, `LOW-C` resolved with one card per seat, `handSize` 9):
  [measured, home]

  | `actualHolders` | `replayedCounts` |
  |---|---|
  | complete (6 entries) | `8,8,8,8,8,8` — correct |
  | partial (2 entries) | `8,9,8,9,9,9` — four seats permanently +1 |
  | empty (0 entries) | `9,9,9,9,9,9` — six cards vanish with no hand debited |

  The error was permanent and cumulative: nothing re-syncs `counts` against `view.counts`, and
  `observe.ts` never reads `view.books`, so it has no `markResolvedGone` equivalent
  (`knowledge.ts:425-433`). It corrupted `missFewest`/`missMost` and both `certified[...].clear()`
  guards, which puts three of the fourteen `FEATURE_KEYS` downstream — `missFewestShare`,
  `missMostShare`, `leakyAskShare`. On a constructed position, one revealed card instead of six
  moved seat 1's `missFewestShare` from **0 → 1**, the maximum possible swing on that feature.
  `replayedCounts` is also exported publicly, from both barrels.

  **What shipped** iterates `bookCards(book, config)` rather than `Object.entries(actualHolders)`,
  clears `publicHolder` for every card of the resolved book whether the reveal named it or not,
  debits only where a witness supplies a holder, and clamps at 0 — i.e. adopts
  `knowledge.ts:286-293`'s shape, which is why `knowledge.ts` was always immune. That leaves a
  partial map *weaker* rather than *wrong*, matching the failed-declare asymmetry CROSSPLAY §9.6
  already relies on. Two things the first draft of this bullet missed and the review caught: the
  two declare *signatures* read off the same partial map and had to be gated on a complete reveal
  (an empty map scored `foreignDeclareShare` 1.0 on every bridged failed declare), and a reveal
  that contradicts an earlier hit leaves the losing seat over by one, so it clears `countsExact`
  too. The regression tests sit beside the existing `replayedCounts`-vs-`view.counts` pin in
  `tests/bots/observe.test.ts`, which sees **complete** logs only and therefore could never catch
  any of this.

  It is unreachable at a fixed roster style — the only caller chain is `observeSeats` ←
  `classifySeats` (`classify.ts:172`) ← `chooseAtCut` (`adaptive.ts:218`) ← `chooseStyle`
  (`adaptive.ts:261`) ← `resolveWithView` (`decide.ts:1933-1934`), and that last edge fires only
  when `isAdaptiveSpec(policy)`. **So it does not touch the 27.08% and it did block every adaptive
  arm Monet may later want.** Fixed first because it is free and it is a correctness bug, not a
  research question.
- **The op-coverage harness** (§6.2), armed on every cell.
- **The three record items of §1.4.**
- **The win-condition assertion in the adapter's `new_game`.** The adapter checks deck sets,
  out-of-turn declares and cardless-may-declare, and not the win condition. `us54` clinches at five
  sets (`RULES_US54.md` row 19); their engine plays all nine. Assert the difference loudly.

  > **Correction to the drafts.** `NEXT-GENERATION.md` A4 sizes this at *"196 of 299 wrong declares
  > in a phase FishAI's rule set does not model"*. The sizing does not survive the corrected bridge.
  > The per-declare trace finds **24 wrong declares of 3,858** (0.62%), and **the `us+them == 8`
  > bucket is unobservable from the guest seat** — the seat's history carries at most 8 declare
  > events per game (3,577 of 3,600 seat-game histories carry exactly 8; the other 23 carry 7), so
  > the ninth declare is never delivered to the bot. That is a limit of the instrument, not proof the
  > terminal declare does not happen: the engine's own arithmetic (8.9458 declarations against 9.000
  > mean sets, WHY-FISHAI-LOSES §1) says the ninth half-suit **is** declared in about 94.6% of games.
  > Wrong declares among the traced population concentrate at the *last declared* half-suit instead:
  > **13 of 24 at `us+them == 7`**. [measured, corrected] The instrument check is still right and
  > still free; the urgency is withdrawn, and the question *"should Monet play the post-clinch phase
  > at all"* is unanswered by the trace rather than closed by it.
  >
  > The trace sees 3.215 of the engine's 3.639 side-A declarations per game (88.3%, 3,858 of 4,367),
  > and the engine's own 98.42% implies ≈69 wrong side-A declarations per cell against the 24 the
  > trace can see. The total is **24–69, not 299**, and the terminal share is a residual of that
  > range, not a measurement.

**Acceptance test.**

1. **Byte identity to Bass v2.0** — 0 action mismatches over ≥ 20,000 `us54` decisions across the
   roster against committed HEAD. This is a pass/fail with no floor: one mismatch fails it.

   **PASS, and re-runnable.** `scripts/byte-identity.mjs` materialises the reference revision file
   by file with `git show <rev>:<path>` and sweeps both module graphs: **64,198 decisions, 128,396
   comparisons, 0 mismatches** against `d918d76`, in both spellings the v2.0 arm was ever addressed
   in. `MUTATE=<styleId>` re-points the reference at another roster style and must fail — it does,
   at 940 mismatches on a two-seed run — so the harness is known to be wired up rather than assumed
   to be. The sweep needs a second revision on disk, which a vitest file cannot have, so it also
   emits `tests/bots/data/monet-v01-bank.ts`: a per-game digest of what the v2.0 arm actually did,
   generated from the *reference* module graph and committed. `tests/bots/monet.test.ts` replays
   the same 27 games against it (20,217 decisions). That fixture is the half of this item that
   still fails a month from now, when no reference tree is at hand — the in-graph comparison alone
   cannot, because both its arms are the same imported `decide` and a regression moves them
   together.
2. **Baseline reproduction** — `bot:monet-v0.1` vs SESTINA, 6 seeds × 200 deals, must return
   **27.08% ± 2.83**, and the per-seed vector must match 28.25 / 28.83 / 26.42 / 26.17 / 27.25 /
   25.58 to the digit. This is a cross-instrument identity pin, not a measurement: a new arm
   reproduces a known arm's numbers on a known cell **before** its own numbers are read. The
   precedent worked — `arm_passfix` returned 28.25% / ask 52.3193 / dAcc 98.42 / lock 9.30118 at seed
   90210, byte-identical to `bot:pf2`.
3. **Op coverage** — `opPass > 0`, `opAsk` and `opPoll` in their expected bands, every fault counter
   zero, and **every op with a written expectation** (§6.2).

   > **NOT ACCEPTED. This item failed on the run of 2026-09-01 and is open.** The run's own verdict
   > file ends `OP COVERAGE: FAIL (5 failures)`. Recorded here rather than in a scratchpad, because
   > a failed pre-registered expectation that lives only next to the arm that failed it is how a
   > wrong number gets published.
   >
   > | counter | written expectation (§6.2, pre-registered) | observed, seed 90210 | ratio |
   > |---|---:|---:|---:|
   > | `opAsk` | 50,649 | 51,998 | 1.027 |
   > | `opPoll` | 354,303 | 363,984 | 1.027 |
   > | `opPass` | 176 | 178 | 1.011 |
   > | `passfixDeclines` | 182 | 184 | 1.011 |
   > | `opForced` | 445 | 467 | 1.049 |
   >
   > Two further written expectations fail and were absent from the run's own table: §E's ±30%
   > per-game band fails on `opForced` for **3 of the 5** non-reference seeds (0.389 / 0.424 / 0.555
   > / 0.578 / 0.472 / 0.493 against a 0.371 base), and §D1's ±10% cross-check fails at **1.95×**
   > (`declaresEmitted` 8,522 against the engine's ≈4,367).
   >
   > **What is on offer is not a pass.** The argument for the arm is that §6.2's row was itself
   > produced by splicing a shared `bot.log` and lost about one seat process of 36. That argument is
   > *inference, not measurement*: its only evidence is that this run's spliced logs sum *below* the
   > published figure, the one-lost-process prediction (51,998 × 35/36 = 50,554) misses 50,649 by
   > 0.19%, and the five per-counter ratios are **not uniform** (1.027 / 1.027 / 1.011 / 1.011 /
   > 1.049) where a whole lost process predicts a flat 1.029. And the remedy on offer is to rewrite
   > a pre-registered expectation after seeing the result, which `OP-EXPECTATIONS.md` line 9
   > forbids in terms: *every value below is fixed at the moment this file is written and is not
   > revised afterwards*.
   >
   > **A third measurement has since settled it, and it is independent of BOTH collectors.**
   > [measured, corrected, lead session] The engine reports its own `events/game` for this cell:
   > **101.116** over 1,200 games = 121,339 events. A declare poll goes to every seat before every
   > move, and the arm holds 3 side-A seats, so the expected `opPoll` total is **364,018** — a
   > figure neither collector produced and neither could bias.
   >
   > | `opPoll` source | value | ratio to the engine's 364,018 |
   > |---|---:|---:|
   > | per-process JSON collector | 363,984 | **0.99991** |
   > | `bot.log` splice (the §6.2 row) | 354,303 | 0.97331 |
   >
   > The JSON collector matches the engine's own arithmetic to **0.009%**; the pre-registered row
   > is **2.67% short**, and losing one seat process of 36 predicts 353,873 — within 0.12% of it.
   > That is three independent facts agreeing on the same mechanism: the pre-registered row was
   > measured through a lossy channel, because every seat of a match inherits one `bot.log`
   > descriptor and keeps its own offset, so seats overwrite one another.
   >
   > **This is evidence, not an amendment.** The row below is left exactly as pre-registered.
   > Amending a pre-registered expectation is Allen's call and is recorded as an open decision in
   > §8.3 — the discipline that makes pre-registration worth anything is that a result may not
   > rewrite the expectation it was tested against, however good the result's argument is.
   >
   > **The originally-proposed control, now redundant but still cheap:** rebuild the `bot:pf2` arm with the *same*
   > per-process JSON collector (`$MONET_COVER_DIR`, not `bot.log` splicing) and re-measure seed
   > 90210. `bot:monet-v01` and `bot:pf2` produce a byte-identical engine statistics block on that
   > cell, so their true op totals are equal by construction and exactly one of the two counts can
   > be right. If pf2 returns 51,998 / 363,984 / 178 / 184 / 467, the defect is in the old row: fix
   > §6.2 with a provenance note naming log splicing, **get Allen's sign-off on amending a
   > pre-registered expectation**, and only then mark this item passed. If it does not, the
   > divergence is in the `monet-v01` instrumentation and the arm is what needs fixing, not the
   > reference. Until that control has run, item 3 is a **FAIL** and v0.1 is not accepted on it.
4. **`observe.ts` regression** — `tests/bots/observe.test.ts` pins the claim replay against
   reveals that name fewer than six holders. **Not to `8,8,8,8,8,8`** — this item asked for that
   in an earlier draft and no correct implementation can deliver it: a card the reveal omits left
   a hand the log does not identify, and the honest replay leaves that hand undebited rather than
   inventing a seat. The partial map therefore still returns `8,9,8,9,9,9` and the empty one
   `9,9,9,9,9,9`; those two vectors are the *same* before and after the fix, because
   `probe-observe.mjs` builds its claim with no earlier hits, so nothing was publicly located for
   the old loop to strand. What the fix does make true, and what the tests pin:
   - every card of the resolved book leaves `publicHolder`, named by the reveal or not — before
     the fix an unnamed card stayed publicly located after its book was gone, so a later ask for
     it scored `certainAsks` or `provablyDeadAsks` against a hand it had already left;
   - a holder the reveal omits but an earlier hit had made public is still debited;
   - no count goes negative (a reveal naming an emptied seat clamps at 0), and none is attributed
     to a seat the reveal never named;
   - `replayCounts(view).countsExact` — the new sibling export of `replayedCounts`, exported from
     both barrels — is true on a complete reveal and false on a partial or empty one, false when a
     reveal names an already-emptied seat, and false when a reveal names one seat for a card an
     earlier hit located at another (the reveal wins the debit; the hit is already in the counts
     and cannot be un-replayed, so a second seat is over by one and only the flag can say so);
   - the flag is also carried on every `SeatObservation`, because `classifySeats` hands a consumer
     those and nothing else — a flag left in the scan's own return type would be unreachable from
     the one place that weighs `missFewestShare` / `missMostShare`. It is deliberately **not** in
     `FEATURE_KEYS`: `featureVector` projects that list and nothing else, so the classifier's input
     vector and every calibrated fingerprint are provably untouched;
   - the two declare *signatures* are gated on a reveal that names the whole book. `foreignDeclares`
     and `ownHandOnlyDeclares` are claims about *all* the holders, and on an empty map "the claimer
     is not among the holders" is vacuously true — which scored every bridged failed declare as
     foreign, at `foreignDeclareShare` 1.0, straight into `FEATURE_KEYS`. Both now read 0 on a log
     that cannot certify them. At home every reveal is complete, so the gate never fires.

   On a construction with four LOW-C cards publicly located and one of them named, the fix moves
   the counts from `7,10,7,11,9,9` to `7,9,7,9,9,9` and the later asker's score from 1 certain /
   2 provably dead to 0 / 0 (`scratchpad/probe-observe-2.mjs`). [measured, home] **The residual
   weakness is now reported instead of silent**, which is the part that generalises: every
   consumer that compares one seat's count against another's — `missFewest`, `missMost` — can ask
   first whether the counts are worth comparing.

   **Home-invariance control.** The claim that none of this is reachable at home is not an argument
   from `reduce.ts`; it was measured against the committed revision. Over **25,721 real `us54`
   positions** — nine roster tables, four seeds each, every prefix of every game — the working
   tree's `featureVector`s, `replayedCounts` and `classifySeats` are byte-identical to HEAD's, and
   `countsExact` is true at all 25,721. Zero differences, so no home decision, fingerprint or
   classification moves. [measured, home]

**Cost.** S. **Risk.** None to the number; this is the milestone that makes the rest measurable.

### 3.2 Monet v0.2 — ask-scorer correctness, with no points claimed

**Ships.** **One roster spec change and two `knowledge.ts` fixes**, all verified in the shipped
source. The mix matters and is not a pedantic distinction: the spec change is what invalidated
v0.1's by-reference registry pin, and the two code changes are what the version table cannot pin
(see *What v0.2 did to v0.1's identity mechanisms* below).

- **`minHitP: 1e-9` on the roster styles** — a **spec** change, in `roster.ts` (the `BALANCED` base
  at :116 and Punter's restatement at :224). It removes the asks the seat's own knowledge proves
  dead from the ask ranking, it has a legality-preserving waiver for genuinely starved turns, and
  **it cannot change any other ask**, because no ask has p in (0, 1e-9). Consumed at
  `decide.ts:985` and `decide.ts:1109-1112`. **Punter ships 1e-9**, as does every roster style that
  took 0 from `BALANCED`; Banker (0.25) and Turtle (0.4) already carried an appetite and are
  untouched. Before this milestone Punter shipped 0, and `MONET_VERSIONS['v0.1']` is where that 0
  still lives.
  - **Scope: roster-only.** `STYLE_PRESETS.easy/medium/hard` spread `BASELINE`, which spreads
    `BASELINE_ASK_WEIGHTS` (`style.ts:352-359`), and that still carries `minHitP: 0` — so the three
    shipped difficulty tiers take no floor. Deliberate: the tiers are frozen and every mechanism
    since CONTAINMENT.md has been introduced switched off in `BASELINE` and carried at its measured
    appetite in the roster, and §3.2's arm is Punter throughout. **The gap is latent rather than
    live**: the two scoring fixes below *do* reach the tiers, and over 40 whole `us54` games they
    take the tiers' *avoidable* dead asks (a provable miss with a live ask on the board) from
    **20 → 0 at hard and 42 → 0 at medium**. [measured, home — `git show HEAD:lib` vs the working
    tree; pinned in `tests/bots/roster.test.ts`]
  - **What the floor does not refuse, by design:** CONTAINMENT.md's turn-pass deliberately plays a
    guaranteed miss to hand the turn to a chosen opponent, and it is selected *after* the filter.
    All 30 avoidable dead asks the shipped Punter still plays in 40 games are that mechanism,
    identified by trace kind. [measured, home] "Removes every unintended dead ask" is the honest
    reading of the bullet above.
- **`knowledge.ts:845`** — `const narrowing = cand.includes(a.target) ? (cand.length > 1 ? 1 /
  (cand.length - 1) : 1) : 0`. The test is **membership, not cardinality**. An ask can only narrow a
  card's candidate set by removing the seat it was addressed to, so a target outside `cand` narrows
  nothing *whatever the set's size*. An earlier shape of this fix keyed on `cand.length <= 1` and so
  only zeroed the credit for a card pinned to one seat — leaving the dominant class, a card pinned
  to two or more of the asker's own **teammates**, collecting the full 12 while no opponent could
  possibly answer. **A known miss narrows nothing**, and the membership test is what makes that true
  rather than merely stated.
- **`knowledge.ts:861-866`** — award `gambleBonus` only when the **asked** card is the set's missing
  one, not merely when the team accounts for five of six. The comment that used to sit directly
  above it — that the asked card is by construction not one of them, by row 7 — **was wrong**:
  `teamKnownOfBook` (`knowledge.ts:759-762`) counts every card whose certain holder is on the
  asker's team, **teammates included**, and row 7 only forbids asking for a card *you* hold. Fixed
  with the code, via the shared `teamCertainlyHolds` predicate (`knowledge.ts:744`) so that the
  count and the per-card test cannot disagree about what "the team holds it" means.

Both scoring fixes are structurally confined to `p == 0`: the narrowing credit is now gated on the
target being a live candidate, which is exactly the condition under which `pHit` is non-zero, and
the gamble guard fires only when a card the asker's own team certainly holds is being asked for,
which is dead by construction. That confinement is what makes acceptance item 1 answerable over the
whole milestone rather than over the knob alone, and it is checked rather than argued — see item 1.

**Evidence.** Before the milestone every avoidable dead ask scored exactly `52.00 = 18·(5/6) + 12 +
25`, which reproduces from the shipped weights (`knowledge.ts:772-779`, mirrored at
`style.ts:352-359`). 71 dead asks in 240 games (0.685%) against SESTINA's 10; 61 of the 71 are
repeats of an identical earlier guaranteed miss. [measured, defective — ask-side, and the
declare-side defect moved ask accuracy 0.37 points, so the census is essentially untouched]

**After the two scoring fixes the same census position scores 40.00 = 18·(5/6) + 25** — the 12 is
gone, the 25 stays because that position's completion bonus is earned, and the ask is *still* the
top of the ranking (the best live ask there scores 23.50). That last part is why `minHitP` is a
third fix rather than belt-and-braces: the scoring corrections alone do not stop a Punter seat
asking. Where the completion bonus is *not* earned — a teammate certainly holds the asked card —
the same ask falls from 52.00 to 15.00, the progress term alone. [measured, home;
`tests/bots/knowledge.test.ts`, `tests/bots/roster.test.ts`]

**Expected gain: approximately zero win rate.** 0.23 avoidable dead asks/game, ~0.1 cards/game.

**Acceptance test — and the point of this milestone is that it is not a win-rate test.**

> **Re-measured after the rebase (2026-09-02).** v0.2 was written against `97e0257` and rebased
> onto `a232371`, which carries the turn-pass correction (`f3390c6`, [RULES_US54.md](RULES_US54.md)).
> Every home number in this section was re-taken on the rebased tree: the three gates and their
> controls, the v0.2 bank (36 games, 25,838 decisions, emitted from a clean `lib/` at `94e9e6c`),
> the fingerprint table (`generatedAt` 2026-09-03) and the classifier read. The pre-rebase figures
> — 20,023 / 20,129 protected asks, 641 / 26 / 913 dead asks moved, a 25,920-decision bank at
> `8f87722`, reads of 0.3741 and 0.3889 — survive only in this branch's history. The cross-play
> numbers, items 2 and 3, were not re-taken: the bridge plays the host's rules, and `f3390c6`
> touched `reduce.ts` alone, which `bots/` never imports.

1. **Home identity on the unaffected population** — every ask with p > 0 unchanged, 0 mismatches
   over **≥ 20,000 asks with p > 0**. The denominator is the protected population itself, not the
   total decision count: non-ask decisions are out of the fixes' reach entirely and are about
   six-sevenths of every sweep, so gating on total decisions clears a 20,000 bar on roughly 2,800
   of the asks the claim is actually about. On the current shape that needs `--seeds 22`.
   `scripts/byte-identity.mjs` enforces the corrected denominator and prints both numbers.

   Two gates, both required, both PASS:

   | gate | what varies | protected asks | mismatches | dead asks moved |
   |---|---|---:|---:|---:|
   | `--gate dead-ask --seeds 22` | the knob alone, on v0.1's scorer | 20,048 | **0** | 638 / 1,832 |
   | `--gate dead-ask --seeds 22 --gate-tree wt` | the knob alone, on v0.2's scorer | 20,136 | **0** | 26 / 1,224 |
   | `--gate dead-ask-full --seeds 22` | **the whole milestone**, v0.1 entire vs v0.2 entire | 20,048 | **0** | 910 / 1,832 |

   [measured, home] Non-ask decisions moved 0 in every run (134,828 of them on the v0.1-scorer
   tree, 131,735 on v0.2's). Negative controls fire: `MUTATE_FLOOR=0.5` gives 231 protected
   mismatches and exit 1; `MUTATE=turtle` on the full gate gives 1,607 and exit 1. The
   `dead-ask-full` gate is the one that answers this item for the
   milestone rather than for the knob — an earlier docstring claimed no whole-milestone diff could,
   on the false premise that the two scoring fixes move live asks on purpose.
2. **Mechanism counter** — the host's DEAD counter on 3 seeds × 200 deals, **side-attributed to
   our seats** (the Monet arm's asks, not pooled with SESTINA's); require the same direction and
   at least a halving.

   > **Amended 2026-09-02, at the owner's decision.** The item was first written pooled — `fish
   > pathology` reports one DEAD number for both teams (CORRECTED-FACTS §6) — and was calibrated
   > pooled on the defective bridge (76 → 39 with `minHitP`, 76 → 60 with `gambleBonus: 0`).
   > Pooled, v0.2 does **not** clear it: **795 → 434 = 0.5459**, a halving missed by four
   > hundredths, because SESTINA's half of the pool is a denominator the change cannot move
   > (150 → 152). Side-attributed to our seats it reads **645 → 282 = 0.4372**, and the bot-side
   > instrument corroborates at **1,372 → 594 = 0.4329** over six seeds. Restating the bar changes
   > what it measures rather than clarifying it, so the restatement was put to the owner as an
   > amendment instead of being adopted by a reviewer; the owner granted it. **PASSES as restated.**
   > The pooled figure stays on the record so the amendment cannot be mistaken for a measurement.
   > Direction is unambiguous on every counter, every seed.

3. **Win rate must NOT move** — 6 seeds × 200 deals, |Δ| < 2.83 against v0.1. A move that clears the
   floor here is evidence of a mistake, not of a gain. **PASSES**: 27.0833% → 27.2083%, Δ = +0.1250,
   SD 0.2875 across the six seeds, and the v0.1 arm reproduces §0's published 27.0833% exactly.

**What v0.2 did to v0.1's identity mechanisms, and what replaced them.** v0.1's byte-identity claim
(§3.1) rested on three things. The spec change broke two of them, and the decision is recorded here
rather than left to be rediscovered from a red suite:

- **The registry's by-reference pin.** `MONET_VERSIONS['v0.1']` held `STYLE_ROSTER.punter` itself,
  so editing the roster silently turned `monetPolicy('v0.1')` into v0.2's policy — an arm invoked
  as `bot:monet-v0.1` would have measured v0.2 under v0.1's label. **Fixed:** `v0.2` is now a named
  version and takes the by-reference slot; `v0.1` pins `minHitP: 0` explicitly, and
  `tests/bots/monet.test.ts` pins the deviation set to exactly `{ minHitP }` so the next roster
  spec change fails a test instead of re-labelling a measurement.
- **The v0.1 action bank.** `tests/bots/data/monet-v01-bank.ts` digests whole games, and the two
  scoring fixes move the `p == 0` asks; one such choice re-deals every position after it. **13 of
  the bank's 27 games diverge on this tree even with v0.1's spec restored**, 15 with v0.2's — the
  13 are the code and only the last two are the knob, which is how we know a registry pin cannot
  make that bank green. (Re-measured on the rebased tree against main's rebaselined bank,
  `fd19486`, 20,291 decisions.) **Decision: the v0.1 bank is frozen as the record of the revision it
  was taken at and is no longer replayed**; a `monet-v02-bank.ts` (36 games, 25,838 decisions) is
  emitted as the forward baseline in its place. Regenerating the v0.1 bank was refused — it is the
  only surviving evidence of what v0.1 played.
- **The cross-revision sweep** is the one mechanism that survives, because it alone can materialise
  another revision. v0.1's claim now lives there in its re-scoped, still-true form: item 1's
  `--gate dead-ask-full` above.

**The classifier had to be recalibrated, and this is the milestone's one real capability risk.**
`FEATURE_KEYS` includes `deadAskShare`, so `lib/engine/bots/data/fingerprints.ts` is calibrated
against the ask **scorer** and not merely against the styles. The two scoring fixes moved that
population while the committed table stayed put, and the turtle-vs-punter read fell from **0.3407
of reads to 0.2370** over 180 games — barely above the 2/9 = 0.2222 chance rate. Re-running
`node scripts/gen-fingerprints.mjs --games 150` against the v0.2 scorer restored it to **0.3741**.
After the milestone was rebased onto the turn-pass correction (`f3390c6`) the table was regenerated
once more under the corrected rules — same command, same seeds — and the committed table
(`generatedAt` 2026-09-03) reads **0.3685** at 180 games, 0.3827 at the smoke test's 54.
[measured, home] The smoke test in `tests/bots/classify.test.ts` was widened from 18 games to 54
in the same pass: at 18 it read 0.2593 even on the pre-v0.2 tree, close enough to the bar to be a
coin flip on a real effect. **The v0.5 capability readout must be taken against the recalibrated
table**, and any later milestone that changes what a style plays has to regenerate it — the
generator's header now says so.

> **Do not run a win-rate A/B to justify this.** At 0.1 cards/game the effect is far under the
> **9,604-deals-per-point** line. The drafts quote that figure in games; the engine prints it per
> deal and the per-deal floor governs (§6.3).

**Cost.** XS for the knob, S for the two scoring fixes plus their home regression, and S again for
the three things the milestone turned out to drag with it: the version registry, the bank decision,
and the fingerprint recalibration.

### 3.3 Monet v0.3 — the cheap measured wins, bundled

**Ships three mechanisms.** Each keeps its own marker and its own ablation cell (§3 preamble):
λ licence conditioning, the `defuse` appetite decision, and score-conditioned declare urgency.
The third is new and is the owner's. The policy today never reads `view.score` — it plays a
position at 4–4 exactly as it plays 0–0, though at 4–4 the next set ends the game and at 0–0 it
does not. **It is deliberately sequenced before §3.4's L–XL belief rewrite, because it is the
cheap test of the same channel**: if cashing urgency alone moves lock hold, the posterior is
buying less than §3.4 assumes.

#### 3.3a Licence conditioning (λ = 0.60), the first real points

**Ships.** ASKING.md §4.1's correction, in `refinedHitProbability` (`knowledge.ts:703-719`):
condition the hit probability on a live row-6 licence,

```
P(c at t | at least one of B at t) = q_c / (1 − Π_j (1 − q_j))
```

applied at λ = 0.60. It removes the measured calibration bias almost exactly: **−0.0835 → −0.0002**
at home. [measured, home] Scope it where the blindness is — apply the conditioning where the
satisfied constraint has been **dropped**, which is where the bias lives, not to licensed asks
generally.

**Why it is worth more than the drafts thought, and why the drafts' number was wrong.** The factorial
resolves the dossier's largest open question:

| arm | win rate vs SESTINA |
|---|---:|
| defuse 0, λ 0 | 23.67% |
| defuse 1, λ 0 — **the shipped baseline** | 27.08% |
| **defuse 0, λ 0.6** | **31.50%** |
| defuse 1, λ 0.6 | 30.79% |

[measured, corrected — 6 seeds × 200 deals per arm, 1,200 deals, paired floor ±2.83, all four arms
built on the same patched lib root]

- λ at defuse 0: **+7.83**, positive on 6 of 6 seeds, clears.
- λ at defuse 1: **+3.71**, positive on 6 of 6 seeds, clears.
- defuse at λ 0: **+3.42**, positive on 6 of 6, clears.
- defuse at λ 0.6: **−0.71**, unresolved.
- **interaction −4.12** — the two mechanisms are substitutes, not additive (the term itself does not
  clear at this N).

> **This is where the drafts' +7.0 came from, and it is not the value of λ for the shipped bot.** λ
> is worth **+7.83 only when the defusal appetite is switched off**. On the shipped configuration,
> which carries `defuse: 1` from `roster.ts:165`, λ is worth **+3.71**. Quoting +7.0 as the value of
> λ for a bot that already defuses adds a gain the defusal term has already banked. `NEXT-GENERATION`
> B3 called +7.0 *"the least-supported large number in the dossier"* and was right to; it is now
> supported, and it is a number about a different bot.

**Why this is also the first step of the posterior programme, not a detour.** §2.4: the fold is the
first-order version of what v0.5 computes exactly. **The +7.83 is the first measured evidence that
`k.constraints` carries win-rate points when it reaches a probability** — better evidence for the
posterior than the oracle is, because it is a real policy change and not a cheat.

**Acceptance test.**

1. **Calibration first** — the dropped-constraint bias must move from **−0.0881 pooled / −0.0340 for
   Monet's own asks** toward zero, measured on the corrected bridge over ≥ 6,000 asks. Mechanism
   before win rate, always.
2. **Win rate** — ≥ **30.5%** pooled over 6 seeds × 200 deals (1,200 deals, ±2.83) against v0.2's
   27.08%. A gain of +3.42 or more clears; a gain of +2.0 does not and must be reported as
   unresolved, not as a win.
3. **Panel** — the v0.4 and v0.6 cells must move in the same direction, 3 seeds each (600 deals,
   ±4.00). **A change that closes the SESTINA gap without moving v0.4 and v0.6 is a fit, not a fix.**
4. **Home regression** — ≥ 800 duplicate pairs, `us54`. ASKING §6 measured this costing ~0.35
   sets/pair in self-play with defusal on, so a loss here is expected and must be *quantified*, not
   discovered later. Use the cell's own SD, never the generic one (§6.3).
5. **Confirmation on a selection-free bank** — §6.5.

> **Measured 2026-09-03 — v0.3a ships at λ = 0.60, on Monet's own vector.** Bridge: the corrected
> engine and §3.2's binaries, tree `eab76b4`, 200 deals × 6 rotations per cell. Identity control
> before anything else was read: the null arm (`licenceLambda: 0` on the v0.3 tree) and the
> registry's own v0.2 on the same tree both reproduce v0.2's seed-90210 cell to the digit — 28.25%,
> ask 52.3825 / 57.4515, lock hold 9.3672 — with every engine line identical but the arm's name.
> Home: 300 mirror games per calibration read (`scripts/calibration.mjs`), 800 duplicate pairs per
> regression cell (`scripts/duplicate-pairs.mjs`, the cell's own SD).
>
> **Scope, decided by measurement and not as written above.** The paragraph above says to apply the
> conditioning where the satisfied constraint has been *dropped* and not to licensed asks generally.
> The calibration split on v0.2's own trajectory (115,253 licensed legal asks) says the refined
> number is short by **−0.0950** where the model dropped the constraint (n = 43,042), **−0.0401**
> where it still holds it (38,387) and **−0.0005** where the licence is discharged (33,824).
> Dropped-only scoping would have left a third of licensed asks at −0.04, so the shipped rule
> conditions **every undischarged licence** and nothing else. At λ = 0.60 the pooled licensed bias
> reads **+0.0026** on v0.2's trajectory and **−0.0032** on v0.3's own, every subset within ±0.03;
> the dropped-only alternative would have read −0.0082 / −0.0146 (`calibration.mjs` prints both
> columns). `tests/bots/licence.test.ts` pins the shape — one factor per set and seat, monotone in
> λ, never reaching certainty — and λ = 0 is byte-identical to v0.2: 0 mismatches over 62,874
> decisions against `2b89895`.
>
> 1. **Calibration — PASSES at home, FAILS abroad, and the failure is the milestone's finding.**
>    Home, v0.2's trajectory: licensed **−0.0490 → +0.0026**. Abroad, on the arm's own asks with
>    the host's outcomes (51,878 asks at seed 90210, the same arm re-run with the split counters
>    and identical to the digit): the licensed subset is **already calibrated at λ = 0** —
>    uncertain licensed asks read believed 0.4539 against realised 0.4596, **−0.0057** — and every
>    λ above it over-states them, **+0.054 at 0.3, +0.140 at 0.6, +0.262 at 1.0**. Unlicensed
>    uncertain asks are **+0.05 over-confident at every λ**; the conditioning never touches them.
>    Pooled with the certain asks, the licensed bias goes −0.0029 → +0.0769 and the aggregate
>    +0.0218 → +0.0638. A licence is informative at home because Monet's own asks are progress-
>    driven; it says nothing extra about SESTINA's holdings, and λ was fitted to Monet's. The item
>    asked for movement *toward* zero on the bridge and the number moved away from it: **FAIL as
>    written**, recorded as such, and §3.4a item 1 now has to be read abroad and at home
>    separately. The chosen-ask decile table is v0.4a's baseline: aggregate **+0.0194**, worst
>    decile **0.1180** at [0.6, 0.7) (believed 0.666, realised 0.548) on v0.3's own trajectory;
>    −0.0248 / 0.1834 on v0.2's. Neither passes §3.4a's bar, and neither was expected to.
> 2. **Win rate — PASSES.** **30.96%** over 6 seeds × 200 deals against v0.2's **27.21%** on the
>    same seeds and bridge: **+3.75**, positive on 6 of 6 (90210 +3.83, 4242 +3.42, 7011001 +6.00,
>    13579 +2.08, 24680 +0.83, 31415 +6.33), over the +3.42 line at a ±2.83 floor. Against the
>    27.08% baseline, +3.88. Per seed: 32.08 / 32.42 / 32.92 / 28.58 / 28.17 / 31.58. The factorial
>    forecast 30.79% for this arm.
> 3. **Panel — PASSES on direction, unresolved on size.** Paired with the null arm on the same
>    three seeds: v0.4 **34.56 → 37.31 (+2.75)**, v0.6 **32.67 → 34.97 (+2.31)**, positive on 3 of
>    3 each, both under ±4.00. The change moves the lineage the way it moves SESTINA.
> 4. **Home regression — PASSES, and the predicted loss did not appear.** v0.3 against v0.2 on
>    duplicate pairs: **+0.06 ± 0.23** sets/pair on the fitting bank `home-a` (SD 3.38, win rate
>    50.19%) and **+0.46 ± 0.23** on the held-out `home-b` (SD 3.31, 54.31%). ASKING §6's −0.35
>    was measured with the dropped-only rule on an older scorer; on v0.2's scorer with the blanket
>    rule there is no loss on either bank.
> 5. **Confirmation on a selection-free bank — PASSES by construction, and read the hard way.** λ
>    was fitted at home (mirror games, seeds `calib-*`), so no bridge seed took part in choosing it.
>    On the three seeds no fit of this project has ever used (13579, 24680, 31415) v0.3 reads
>    **29.44% against v0.2's 26.36%, +3.08** on 600 deals (±4.00); on the historic triple, +4.41.
>    Same direction on both triples; the pooled six clear.
>
> **What the points are made of, and what they are not.** Three measurements from the same cells.
> (i) Monet's own ask accuracy **fell**, 52.26% → 51.71% over six seeds: fewer certain asks are
> played (14,757 → 14,066 at 90210) and the uncertain asks' hit rate did not move (0.3345 → 0.3341).
> (ii) **SESTINA's ask accuracy fell more**, 57.33% → 56.17%. (iii) The abroad response to λ is
> flat once it is on — **28.06 / 32.22 / 32.47 / 31.75** at λ = 0 / 0.3 / 0.6 / 1.0 on the historic
> triple (the 0.3 and 1.0 rungs are information cells, not a fit) — where a calibration mechanism
> would show an optimum and a re-ranking mechanism saturates. What λ changes is *which book is
> asked for at the target*: about 2,100 uncertain asks per cell move from unlicensed books to books
> the target has shown a card of and is collecting. **λ's value abroad is interference with the
> opponents' sets, not a better probability** [interpretation of three measurements, not itself
> measured] — the channel the defusal appetite buys explicitly, which is why the factorial found
> the two to be substitutes. Monet's engine-reported lock hold moved 9.14 → 8.77 events on the way.
> Two consequences for the roadmap, both written where they bite: §3.4a's "it also subsumes λ" is
> now expected to be **false** (amendment there), and §0.1's ask-accuracy-to-win-rate chain has its
> first counterexample — +3.75 points with ask accuracy down 0.55.

**Cost.** S — the patch exists (`scripts/probe-licence.mjs`, `probe-licence3.mjs`) and the byte-exact
λ = 0 control is already built. There is no λ or licence conditioning anywhere in `lib/` today
[verified by grep].

**Risk.** ASKING.md §6's binding lesson: *a term that corrects a probability and a term that rewards
the same evidence are not additive.* That is now measured rather than argued, and it is what v0.4 is
for.

#### 3.3b The defusal-appetite decision, taken deliberately

**The problem.** With λ shipped, the shipped `defuse: 1` is worth **−0.71 [unresolved]**. The
appetite may now be worth nothing, or worth removing. Deciding that by eye is exactly the error this
project has already made once.

**What is measured, and what is not.** The equal-N ladder, 5 seeds × 200 deals per rung = 1,000 deals
per rung, paired floor ±3.10, against SESTINA on the pre-λ policy:

| defuse | win rate | vs rung 1 | resolved at ±3.10? |
|---:|---:|---:|---|
| 0 | 23.50% | −3.88 | **yes** |
| 0.5 | 27.00% | −0.38 | no |
| **1 (shipped)** | **27.38%** | — | — |
| 2 | 29.30% | +1.92 | no |
| **4 (apparent peak)** | **29.95%** | +2.57 | no |
| 8 | 28.78% | +1.40 | no |

[measured, corrected] Holdout bank 31415, which took no part in fitting: d0 24.50%, d1 25.58%,
d4 29.58% — the 4-vs-1 gap replicates at +4.00 there.

> **Correction to the drafts, and it goes the wrong way for them.** `NEXT-GENERATION` B2 reports
> `defuse: 4` as **+3.333 points [+1.258, +5.409], positive on all five seeds individually**. On the
> corrected bridge at six seeds it is **+2.81, positive on 5 of 6 — seed 24680 is −1.83** — and it
> does **not** clear its floor. The inverted U is visible and the apparent peak sits at 4, but
> **every rung-to-rung contrast above 0 is inside the floor.** The only resolved statement the ladder
> supports is *"some defusal beats none"*. Anyone quoting "defuse 4 is the optimum" is quoting an
> unresolved maximum of six noisy points. Resolving the peak needs roughly 4× the deals per rung.

**Ships.** A decision, in writing, and whichever constant it names. Three admissible outcomes and no
others:

1. **Freeze at `defuse: 1`** and record the interval. Cheapest, and defensible.
2. **Move to `defuse: 0`**, if the ladder under λ says so at a resolved margin.
3. **Make the appetite opponent-conditional.** The adaptive layer already exists (ADAPTIVE.md), and
   CONCESSION §8's body prices per-decision tactic-level adaptation at **+1.43 and +1.58 ± 0.32**
   against style-switching's **+0.13 ± 0.06** — *"roughly eleven to twelve times"*. (CONCESSION §0's
   headline table says ~15×; the body is the measurement and the table is the outlier. Quote 11–12×,
   and fix the table.) **Blocked on the `observe.ts` fix, which is why that fix is in v0.1.**

**Acceptance test.**

1. **The ladder re-run on top of λ**, equal N on every rung, `defuse ∈ {0, 0.5, 1, 2, 4}`, **5 seeds
   × 200 deals per rung minimum** (1,000 deals, ±3.10). A rung is only "better" if it clears.
2. **Home re-fit first if the constant moves.** CROSSPLAY §7's holdout rule is binding: **never move
   a shipped roster constant on a cross-play fit.** CONCESSION §3.1 fitted the appetite at 1 at home;
   moving it requires the home ladder to agree, at ≥ 800 duplicate pairs per rung.
3. **Confirmation on a selection-free bank.** Every seed this project has ever named is now spent
   (§6.5). Draw new ones and write them down before the fitting cell runs.
4. **Report the interval, and report when the effect is under the floor.** This milestone is allowed
   to conclude "unresolved, frozen at 1" and that is a pass.

> **Measured 2026-09-03 — frozen at `defuse: 1` (outcome 1).** The ladder on top of λ = 0.60, the
> v0.3 tree, 5 seeds × 200 deals per rung (1,000 deals, ±3.10), rung 1 being v0.3's own cells on
> the same seeds:
>
> | defuse | win rate (5 seeds) | vs rung 1 | positive on | resolved at ±3.10? |
> |---:|---:|---:|---|---|
> | **0** | **31.82%** | **+0.98** | 2 of 5 | no |
> | 0.5 | 31.68% | +0.85 | 4 of 5 | no |
> | **1 (shipped)** | **30.83%** | — | — | — |
> | 2 | 29.45% | −1.38 | 0 of 5 | no |
> | 4 | 28.13% | −2.70 | 0 of 5 | no |
>
> [measured, corrected] Rung 0's sixth seed (31415) reads 31.75%, so the rung's own six-seed cell
> is **31.81%** against v0.3's 30.96%. The pre-λ ladder's inverted U is gone: with λ on, the
> appetite is worth nothing below 1 and costs above it, which is what "substitutes" predicts, and
> **no contrast clears the floor**. Item 1 forbids calling a rung better on that, so the constant
> does not move. Every rung trades Monet's ask accuracy the same way λ does (52.02% at 0, 51.20% at
> 4), so the two are also the same channel by that measure.
>
> **The home ladder resolves it the other way, and is on the record for the next decision.** Same
> rungs, 800 duplicate pairs each on `home-a`, the cell's own SD: defuse 0 **+0.24 ± 0.19**
> sets/pair (ahead at 95%), 0.5 +0.09 ± 0.15, 2 **−0.24 ± 0.15**, 4 **−0.47 ± 0.18**; the harness
> control (v0.3 against v0.3) prints 0.0000 ± 0.0000. The held-out `home-b` replicates rung 0 at
> **+0.23 ± 0.20**. So item 2's home re-fit would permit a move to 0 — the fit domain resolves it —
> but item 1's bridge does not, and outcome 2 requires a resolved margin *there*. Moving on the home
> number alone would be moving a constant on a self-play fit that the target domain reads as +0.98
> inside ±3.10, which is CROSSPLAY §7's rule stated the other way round. Resolving the abroad
> contrast at its measured size needs roughly ten times the deals per rung; that cell is the first
> thing to run if the appetite is revisited, on the defuse-0 vector as a candidate v0.3.1 rather
> than folded into v0.4 (§8.3 decision 4).
>
> **The factorial replicates.** Its forecasts for the two arms — 30.79% for defuse 1 / λ 0.6 and
> 31.50% for defuse 0 / λ 0.6 — read **30.96%** and **31.81%** on the v0.3 tree with the corrected
> instruments.

**Cost.** S–M. **Target.** ≥ 31.0%, or a written freeze at v0.3's level. Both are acceptances.

#### 3.3c Score-conditioned declare urgency — measured, and not shipped

**What it was for.** The preamble: the policy never reads the score, and the cheap test of §3.4's
channel is whether cashing urgency alone moves lock hold. The marker was lock hold for the score
term.

**What was measured, before any code.** `scripts/probe-score.mjs` (PROBES.md) traces every window
decision of 300 v0.3 mirror games — 153,682 windows, 2,288 declares — and splits them by the
deciding team's score state against the clinch target T = 5: neither / own = T−1 / opp = T−1 /
both (126,987 / 11,965 / 11,984 / 2,746 windows).

1. **Lock hold's decision half is already zero in every score state.** From "provable to some seat
   on the owning team" to the cash: mean **0.01 / 0.04 / 0.05 / 0.02** events (neither / own / opp
   / both; n = 1,745 / 197 / 236 / 83), p90 = 0 in all four; from "provable to the claimer" to the
   cash, 0.01–0.03. A provable set is cashed at the next window whatever the score. §1's 6.16
   events of lock hold are the inference half entirely, and no declare-side term can shorten a wait
   that is not on the declare side.
2. **The only population a lower bar could reach is the speculative near-miss set, and it is small
   and poor.** Plans that passed every structural gate and were refused by the bar alone, per 300
   games: at own = T−1 **178 window decisions** (mean p 0.43, median 0.50, p90 0.57, against a mean
   bar of 0.63); at opp = T−1, 586 (mean p 0.43, bar 0.93); at both, 14 with p = 0. Declaring at
   own = 4 on a p = 0.5 plan wins the game half the time and hands the opponents a set the other
   half — for a set that is *already safe*: every uncertain card of a plan that passed `allOnTeam`
   sits with a teammate, no opponent ask can take it, and the only cost of waiting is the inference
   lag. That trade is not positive at any score, and at 0.6 window decisions per game it could not
   be measured if it were (§3.2's 9,604-deals-per-point line).
3. **Declares by kind × score state** (own-book / certain / speculative / must / forced): neither
   735 / 1,001 / 9 / 0 / 3; own 62 / 135 / 13 / 1 / 0; opp 72 / 158 / 0 / 5 / 0; both 42 / 35 / 0 /
   17 / 0. The speculative branch already fires more at own = T−1 than anywhere else, through the
   stalled bar.

**Decision.** No score term ships in v0.3, and `view.score` stays unread. The preamble's question is
answered by measurement: cashing urgency cannot move lock hold, so §3.4's posterior is buying the
whole of the channel, not less than it assumed. **The lever the probe does expose is on the ask
side, at the clinch**: the 178 near-miss positions are sets that are safe but unprovable to the
claimer, and one ask at a teammate for the uncertain card resolves the set whether it hits or
misses — a value the ask scorer does not model, because it prices hits and not the information in a
miss. That is §3.5a's count-exhaustion and cross-seat-handoff capability at the one score where it
decides the game, and it is carried there as a candidate with this probe's near-miss count as its
baseline marker.

**Cost.** XS — a probe and a paragraph. **Target.** None; the measurement is the deliverable.

### 3.4 Monet v0.4 — the belief rewrite

**Ships two mechanisms in sequence**, each with its own marker and ablation cell: the calibrated
marginal first, then the joint. `pCardAt` must be read before `pAssignment` is built.

#### 3.4a `pCardAt`, the calibrated marginal

**Ships.** A calibrated per-card probability, replacing `pHit` (`knowledge.ts:722-733`) — today a
slot-uniform prior over a support set, and **the whole probability model behind Monet's ask
accuracy**.

**The construction.** Matrix scaling (Sinkhorn / permanent approximation) over the card × seat
capacity bipartite graph, seeded from `w.cand` (`knowledge.ts:148`) and `unknownSlots`
(`knowledge.ts:563`), with `w.constraints` (`knowledge.ts:152`) as side constraints. It gives a
calibrated `pCardAt(card, seat)` for every card at once, and it is a pure function of `SeatView`
requiring no new state.

**What must not change.** `Knowledge` keeps its shape. `holders`, `cands`, `gone`, `unknownSlots` and
`constraints` remain, **derived as marginals**, so the twelve existing readers keep working:
`decide.ts:400, 412, 686, 688, 769, 1009, 1303, 1346, 1677`, plus `knowledge.ts:643-660` and `:741-749`,
plus `conceal.ts`, `defuse.ts`, `contained.ts`, `threat.ts`. This is what makes v0.5 an L and not an XL.

**Why it is the right next step.** It attacks the ask-accuracy deficit directly (52.32 vs 57.38), it
leaves the declare path alone, and **it is the input `pAssignment` needs** — so §3.4b is a
continuation rather than a second rewrite. It also subsumes λ, which is the substitution risk.

> **Amended 2026-09-03 by §3.3a's measurement.** λ's points abroad arrived with Monet's ask accuracy
> *down* 0.55 and SESTINA's down 1.16, and the licensed number was already calibrated abroad at λ =
> 0. A calibrated marginal is therefore expected to remove λ's over-statement without replacing its
> points. Item 8's λ-off arm is a real test, not a formality, and the roadmap's expectation is now
> that λ stays as a separate term until a mechanism that prices the interference explicitly
> replaces it — at which point the two are measured against each other, not assumed to nest.

**Acceptance test.**

1. **Calibration harness first, and it is a new permanent instrument.** Believed vs realised, per
   decile, over ≥ 20,000 ask decisions. Every decile's |believed − realised| < 0.05, and the
   aggregate within 0.01. **This harness runs on every cell from v0.5 onward** — see §7.
2. **Ask accuracy** — 52.32% → **≥ 55.0%** on 6 seeds × 200 deals. The corrected instrument reads
   52.35% on the 3-seed panel and 52.3193% at seed 90210, so the starting point is pinned to four
   decimals and a 2.7-point move is far outside cell noise on the *rate*, not the win rate.
3. **The DEAD and own-locked-ask counters must move**, not just the rate.
4. **Win rate ≥ 33.0%** on 6 seeds × 200 deals (±2.83) — reported **last**, because it is the noisiest
   of the four.
5. **Panel: the v0.4 cell must move from 34.25% toward parity**, 3 seeds (±4.00). This is the rung
   Monet fails and it is the cleanest signal available (§1.3).
6. **Cost budget** — ≤ 1.4 ms per decision (10× of 0.14 ms), ≤ 0.9 s per six-seat game. **A
   posterior that costs 10× is affordable; one that costs 500× is a different product** (§0.2).
7. **The BOUNDED.md scope decision, in writing, before code** (§1.5). Unbounded-arm-only, or a new
   cost model. Not both, not neither.
8. **Substitution measured, not assumed** — a λ-off arm on the same build. If `pCardAt` subsumes λ,
   the λ term comes out and the roadmap says so.

> **Scope decision (item 7), written 2026-09-03 before the code.** v0.4a's marginal is a *read* of
> a finished `Knowledge`, not a stored belief: `buildKnowledge` attaches a card × seat table derived
> from `cands`, `unknownSlots` and the surviving constraints, and nothing in the fact pool changes
> shape. BOUNDED.md's cost model therefore stays defined and untouched — the bounded arm replays
> atomic facts into the same `finishKnowledge`, and a read of the result costs it no bits. The
> marginal is confined to the unbounded arm all the same: it is switched on by a Monet style knob
> (`pModel: 'marginal'`) that no `BoundedSpec` carries, so Bass v1.5's numbers cannot move. The
> joint (§3.4b) is where the decision bites, and it is taken there; §8.3 decision 3 stays open until
> then. Registry id: `v0.4a`, the a-half of v0.4 on its own vector (v0.3 plus the knob); §3.4b lands
> under its own id, so each half's cells name the spec they measured.
>
> **The construction, as built** *(the fold's placement corrected by the record below: once, after
> the margins are met, not on each round)*. Sinkhorn scaling of the 0/1 candidate matrix over the
> unknown cards × six seats to row sums 1 and column sums `unknownSlots`, with every surviving
> ≥1-of-set constraint folded in by the same conditioning §3.3a ships (`p → p / (1 − Π(1 − p))`
> over the constraint's alive cards at its seat) and the margins restored after it. A memoised pure
> read of the `Knowledge` object; an infeasible table (slots and unknown cards disagree, which only
> an inconsistent view produces) falls back to the slot prior rather than fabricating a number.
> `refinedHitProbability`'s first-order fold is skipped when the table exists, because the
> constraints are already inside it; the λ conditioning sits on top of it unchanged.
>
> **Pre-registered expectations (§7.1), written before the run.** Home calibration on ≥ 20,000 chosen
> asks: the slot prior reads aggregate +0.0194 / worst decile 0.1180 on v0.3's trajectory (§3.3a);
> the marginal is expected to at least halve the worst decile, and is a FAIL on item 1 if the
> table does not move it. Cost: ≤ 0.5 ms per decision expected against the 1.4 ms budget. Byte
> identity with the knob absent: 0 mismatches over ≥ 20,000 protected asks, or the change is not a
> knob. Ask accuracy abroad: item 2's bar is written against v0.2's 52.32%, but v0.3 reads 51.71%
> and is the base this milestone is measured from, so the item is read as *up from 51.71%, toward
> 55.0%*, and a reading under 51.71% is a FAIL whatever the win rate does. Item 8's λ-off arm: six
> seeds beside the λ-on arm; inside ±2.83 of each other means λ is subsumed and comes out; λ-on
> ahead by more means it stays, which is what §3.3a's interference reading predicts.

> **Measured 2026-09-03 — v0.4a ships the marginal alone, at λ = 0, on Monet's own vector.**
> Bridge: the corrected engine and §3.2's binaries unchanged (`fish_portable` f58f6f45…,
> `fish_split` 95b82b18…), tree `58e4032`, 200 deals × 6 rotations per cell. Identity controls
> before anything else was read: the null arm (`pModel: 'slot'` on the v0.4a tree, which is v0.3's
> vector) reproduces v0.3's seed-90210 cell to the digit — 32.0833%, ask 51.6525 / 56.0333, lock
> hold 9.03156 — and all six of v0.3's panel cells the same way (v0.4 36.08 / 38.75 / 37.08, v0.6
> 34.25 / 37.25 / 33.42); the arm on the registry's own id reproduces the λ = 0 ablation arm's
> 30.3333% at 90210 to the digit, so the vector that shipped is the vector that was measured. Every
> engine line identical but the arm's name. With the knob absent, the roster arm is byte-identical
> to v0.2's reference tree: 0 mismatches over 338,360 comparisons (22 seeds; 125,748 on the standard
> gate). Home: 300 mirror games per calibration read, 800 duplicate pairs per regression cell.
>
> **The construction, corrected against brute force.** The paragraph above first said the
> constraint fold runs "on each round". The first build did, and compounding the fold on every
> scaling round drove a constrained card to certainty — 0.32 off an exhaustive enumeration of the
> same position. The shipped `marginal.ts` scales to the margins first, conditions on each surviving
> ≥1-of-set constraint **once** (duplicates and implied supersets at a seat dropped), repairs the
> touched row and column locally, then re-scales. Against exhaustive enumeration over 200 random
> small positions the worst card is 0.167 off and the mean 0.007 (`tests/bots/marginal.test.ts`;
> the bars were written from that measured distribution after a 0.05 bar written before measuring
> failed, and the assertion says so). Never exactly 0 or 1 for a card with more than one candidate
> seat.
>
> **The 2 × 2, six seeds × 200 deals against SESTINA v1.0** (the slot cells are v0.2's and v0.3's,
> on the same seeds and bridge):
>
> | | slot prior | marginal |
> |---|---:|---:|
> | λ = 0 | **27.21%** (v0.2) | **31.94%** — **v0.4a, ships** |
> | λ = 0.60 | **30.96%** (v0.3) | **33.78%** |
> | λ = 0.95 | — | 32.96% |
>
> Paired per-seed contrasts, floor ±2.83, the cell's own paired 1.96 SE in brackets:
>
> | contrast | mean | ahead | per seed (13579 / 24680 / 31415 / 4242 / 7011001 / 90210) |
> |---|---:|---:|---|
> | marginal over slot at λ = 0 — **the marginal's own effect** | **+4.74** [±1.31] | 6/6 | +6.00 / +5.92 / +6.08 / +3.50 / +4.83 / +2.08 |
> | marginal over slot at λ = 0.60 | **+2.82** [±1.26] | 6/6 | +4.83 / +4.08 / +1.67 / +1.67 / +3.67 / +1.00 |
> | λ = 0.60 over λ = 0 on the marginal — **item 8** | +1.83 [±1.55] | 5/6 | +0.92 / −1.00 / +1.92 / +1.58 / +4.83 / +2.75 |
> | λ = 0.60 over λ = 0 on the slot prior (v0.3 over v0.2) | +3.75 | 6/6 | §3.3a |
> | v0.4a over v0.3 — **the milestone contrast**, two keys apart | +0.99 [±2.26] | 3/6 | +3.92 / +5.08 / −0.25 / +0.08 / −1.17 / −1.75 |
>
> The interaction is **−1.92**: the marginal takes about half of λ's points, which is what §2.4
> predicts of a first-order fold and the posterior it approximates — and the other half is the
> interference §3.3a measured, which no probability model reproduces.
>
> 1. **Calibration — FAILS the decile bar everywhere, PASSES the aggregate abroad, and the
>    disagreement between home and abroad is the finding.** Home, 25,540 chosen asks on v0.4a's
>    own trajectory: aggregate **−0.0516**, worst decile 0.1394 (a 40-ask decile; the worst
>    populated one is −0.113 at [0.1, 0.2), n = 1,763) — the marginal *under*-states at home in
>    every decile, and the worst decile did not halve from 0.1180: the pre-registered FAIL. Abroad,
>    the six shipped cells, believed against the host's outcomes: aggregate |bias| **0.0019**
>    (0.0002 – 0.0040 per seed; v0.3 read 0.0672, v0.2 0.0218 at 90210), worst decile **0.0805**
>    (0.0548 – 0.1202; v0.3 0.1963). With λ = 0.60 on the marginal: home −0.0003 / 0.1138, abroad
>    **+0.0488 / 0.1734**; at λ = 0.95 abroad +0.0835 / 0.1474. So the same table reads −0.05
>    against Monet and 0.00 against SESTINA, and the licence term's +0.05 cancels the one and is
>    added to the other: **calibration is a property of the belief and the opponent together, not
>    of the belief.** §7's rule that the harness runs abroad is the right one, and §3.4b is read
>    there. The home aggregate under λ = 0.60, −0.0003, is two errors cancelling, and it is why
>    v0.3's home read passed.
> 2. **Ask accuracy — up, bar not reached.** **51.71% → 53.91%** over six seeds (53.69 – 54.07; the
>    bar was 55.0). SESTINA's own read rose with it, 56.17 → 57.78. λ lowers it again on the new
>    base — 53.13 at 0.60, 52.88 at 0.95 — §3.3a's reading reproduced: λ's points are not made of
>    accuracy.
> 3. **Counters — did not move.** DEAD asks **451 → 495** over six seeds (0.146% → 0.159% of
>    311,318 asks; v0.2 594). The marginal floors every multi-candidate card at 1e-9 rather than 0,
>    so a dead ask is `minHitP`'s floor tied at the top of a ranking with nothing above it — not
>    the thing this milestone changed. `lastResort` 31 → 64. A FAIL on the item as written; the
>    item was written for a mechanism that removes candidates, and this one does not.
> 4. **Win rate — 31.94%, FAIL at the ≥ 33.0% bar.** +0.99 over v0.3 on 3 of 6 seeds, unresolved.
>    The λ-on arm on the same build reads **33.78%** (+2.82 over v0.3, 6 of 6, resolved) and would
>    pass; it does not ship, by item 8's rule, and the choice is §8.3 decision 5. Reported last, as
>    the item says, and not hidden.
> 5. **Panel — unresolved, and the shipped arm reads *against* v0.3 on the v0.4 lineage.** Three
>    seeds, ±4.00, paired with the null arm (v0.3's vector): v0.4 **37.31 → 35.81 (−1.50, 0 of 3)**,
>    v0.6 34.97 → 35.25 (+0.28, 2 of 3). The λ-on marginal on the same cells: v0.4 38.25 (+0.94,
>    2 of 3), v0.6 36.06 (+1.08, 2 of 3). Against the item's own reference — the v0.4 cell at
>    34.25, which reads 34.56 on these seeds — the shipped arm is +1.25 and the λ-on arm +3.69.
>    Inside the floor both ways.
> 6. **Cost — PASSES.** **0.039 ms per decision** mean (median 0.034, p99 0.106, max 0.665),
>    **24.3 ms per six-seat game** (max 34.9), against v0.3's 0.030 / 19.0 ms on the same bench
>    (`scripts/bench-decide.mjs`, 24 games after 4 warm-ups). The table adds about a third to a
>    decision that was already cheap; 36× under the 1.4 ms budget.
> 7. **Scope — held as written.** `pModel` is a Monet style knob no `BoundedSpec` carries; Bass
>    v1.5's cost model is untouched, and the roster arm's byte identity above is the proof.
> 8. **λ — out, by the rule written before the run.** +1.83 (5 of 6) is inside ±2.83. The
>    mechanism marker agrees with the rule: the λ = 0 arm is the calibrated one abroad, the λ = 0.60
>    arm over-states by +0.049. Every *other* instrument leans the other way, and none abroad
>    clears its floor: the panel +2.44 (3 of 3) on v0.4 and +0.81 (2 of 3) on v0.6; home duplicate
>    pairs **+0.24 ± 0.24** (`home-a`) and **+0.32 ± 0.24** (`home-b`) sets/pair, resolved and
>    small. The build follows the pre-registration; the roadmap records the tension instead of
>    re-deciding after the fact (§8.3 decision 5).
>
> **Home regression — no loss.** v0.4a against v0.3 on duplicate pairs: **+0.18 ± 0.25** (`home-a`,
> SD 3.57, win rate 51.44%) and **−0.15 ± 0.24** (`home-b`, SD 3.45, 48.75%), unresolved both
> ways. The λ-on marginal against v0.3: +0.46 ± 0.23 and +0.33 ± 0.24, ahead on both banks.
> Agreement with Bass v2.0 on mirror positions: 96.86% of decisions (v0.3 98.07%).
>
> **The ceiling, re-built on the shipped belief (§3.4b item 5's reference).** The oracle arm — the
> three seats of a team share their true hands and cash every lock the instant it forms; a
> measurement of headroom, never a proposal — scores **38.28%** on three seeds (37.17 / 39.58 /
> 38.08) where the honest arm scores 31.53 on the same seeds: **+6.75**, 3 of 3, over ±4.00. Its
> lock hold is 0.39 – 0.42 events, its declarations 3.9 – 4.0 per game at 99.6 – 99.7%. On the
> λ-on belief the same arm reads 40.94% against 34.58, +6.36. The cashing channel is worth on this
> belief what it was worth at Bass (+5.75, §0.1): the belief rewrite did not shrink it, and that is
> the whole case for §3.4b.
>
> **What v0.4b inherits, six seeds, the shipped arm.** Lock hold **9.98** events before cashing —
> v0.3's 8.77 *plus* 1.21: a calibrated ask policy asks into locks it cannot yet cash, and the
> engine counts every one. Declarations 3.80 per game at **97.86%** (v0.3 3.76 at 98.41; SESTINA
> 5.0 – 5.2 at 98.3 – 98.5). §3.4b's parity guard was written against 98.4 and this arm is already
> 0.55 under it, so the guard is read from 97.86. Forward bank: `tests/bots/data/monet-v04a-bank.ts`,
> 36 games and 25,709 decisions recorded from the committed tree, replayed by
> `tests/bots/monet.test.ts`.

**Cost.** L. **Risk.** This is the first milestone that can be wrong in a new way: it replaces a
certainty with a probability, and a probability can be miscalibrated where a certainty cannot. §7 is
about exactly that.

#### 3.4b `pAssignment`, and the proof-lag milestone

**Ships.** The change that moves the 3.2×.

1. **`planClaim` (`decide.ts:391-439`) is rewritten.** Today it is a deterministic greedy assignment
   by remaining capacity (`:420-429`) with an **independent product** for `p` (`:427`). It becomes an
   argmax over the joint, with the joint's own probability.
2. **`certainClaim:689` stops being the definition of "ours".** `plan.p >= threshold` subsumes
   `plan.p === 1`; `certainClaim` (`decide.ts:696-717`) becomes the p = 1 special case of `evClaim`.
   **The nine dead knobs of §2.2 become live for the first time** — which is a risk, not a prize, and
   the acceptance test treats it as one.
3. **The two structural losses of §2.3 close together**: a miss reweights the deal distribution
   rather than clearing two bits on one card, and the constraint pool finally reaches the declare
   decision.

**The direction is measured; the magnitude is not.** At team-ownership positions, replayed over the
same positions so a bridge defect cannot reorder them: greedy allocation **46.52%**, an exact joint
maximiser over the same marginals **47.97%**, a 128-world Monte Carlo joint posterior **50.76%**
[measured, defective, 5,453 positions — a replay over positions, not a play measurement]. The acting
seat can prove its own team's allocation at **2.90%** of ownership positions, and **12.73%** of
ownership onsets are never proved before the deal ends [defective, 22,480 positions].

**Acceptance test — lock hold is the primary metric, and the oracle is the ceiling control.**

1. **Lock hold** — **9.30 → ≤ 5.0**, against the oracle's floor of **0.41** and SESTINA's 2.92.
   6 seeds × 200 deals. This is the mechanism's own marker and it moves before the win rate does.
2. **Declarations per game** — 3.64 → **≥ 4.5**, toward SESTINA's 5.31.
3. **Declare accuracy must not fall below 98.0%.** This is a **parity guard**, not a target. Monet
   inherits 98.42% against SESTINA's 98.46%; a posterior that cashes sooner by cashing wrongly has
   traded the one channel that is already at the frontier. **Any milestone that breaks this gate
   fails, whatever the win rate does.**
4. **Win rate ≥ 36.0%**, 6 seeds × 200 deals (±2.83) — **conditional on the re-measured oracle
   clearing 36.0% first.** If it does not, 36.0% is above the channel's own ceiling and the target is
   restated at the re-measured ceiling minus the floor, in writing, before the cell runs. And the
   v0.4 cell ≥ 45%, 3 seeds (±4.00).
5. **Measured against the oracle in the same harness, and the oracle is re-built on the §3.4a belief
   before §3.4b is read.** The existing arm's 33.58% [3 seeds] is a ceiling for the *shipped* belief
   at λ = 0; it is not the ceiling for a §3.4a build and must not be quoted as one. Re-run the oracle
   on the §3.4a lib root, 3 seeds, and record its level **before** §3.4b's own number is read. An
   implementation that beats the *re-measured* oracle is a defect in the oracle arm and must be
   investigated as one.
6. **Cost budget** unchanged from v0.5: ≤ 10×.
7. **Home regression** at ≥ 800 duplicate pairs, plus the `decideExplained` bit-identity pin
   (`decide.ts:1975-1979`): the sink stays write-only and the posterior draws no rng.

> **Do not use the +20-point figure from the structural decomposition.** Equalising declaration
> counts at 4.5 moves the set differential −1.86 → −0.50 and prices out at "+20 points". It is an
> accounting identity that assumes cards Monet never wins. The oracle says the reachable part of that
> channel is **+5.75**. With the oracle's own levels now re-derived, the temptation to reach for +20
> is larger, and it is still wrong.

> **Scope decision (§1.5, §8.3 decision 3), written 2026-09-03 before the code.** v0.4b's joint is
> a *chain of reads* of the same table v0.4a attaches: `pAssignment` assigns a set's open cards one
> at a time, most certain first, each conditional read off the table re-scaled with the previous
> assignments fixed, and the plan's probability is the product of those conditionals — the chain
> rule, on the maximum-entropy table. No fact enters the pool, no fact leaves it, and no
> `BoundedSpec` carries the knob, so BOUNDED.md's cost model stays defined and Bass v1.5's numbers
> cannot move. Decision 3 is therefore taken the way v0.4a took it — **the posterior is confined to
> the unbounded arm** — and stays open only for v0.5 to reopen if the readout wants the bounded arm
> to carry one. Registry id `v0.4b` = v0.4a plus `pAssignment: 'joint'`; the null arm
> (`pAssignment: 'greedy'` on the v0.4b tree) is v0.4a's vector and must reproduce its six cells to
> the digit before anything else is read.
>
> **Two mechanisms, two knobs, one rung.** Item 1 of the ships list is the knob above. Item 2 —
> `certainClaim` stopping being the definition of "ours" — is a second knob, `claimOwnership:
> 'certain' | 'priced'`: under `'priced'`, `evClaim`'s structural gate (every open card's
> candidates all teammates, §2.3 loss 3) is dropped and the plan's chain probability, which already
> carries the opponents' share of every open card, is what meets the bar. It is the mechanism that
> can move lock hold by more than a fraction, and it is the one that can break the parity guard, so
> it is measured as its own arm and **ships only if the rule below admits it**; the registry vector
> carries `'joint'` alone until that reading is on the record. `certainClaim` itself is unchanged:
> a plan with no open card and p = 1 is found by the same planner, so the roadmap's "p = 1 special
> case" holds by construction and the gate order is not touched. The bridge arm counts each declare
> by the branch that made it — certain, speculative, forced — with its outcome, so accuracy is read
> per branch and not only pooled.
>
> **Pre-registered expectations (§7.1), written before the run.** Every bar is read against v0.4a's
> own six-seed numbers (§3.4a's record), not v0.3's.
>
> 1. Lock hold: **9.98** → the bar is ≤ 5.0 as written. The replay measurement above prices the
>    joint's assignment accuracy at +1.5 to +4 points over greedy at ownership positions, and the
>    mechanism reaches lock hold only through speculative declares that now clear 0.775; so the
>    expectation for `'joint'` alone is a move of 0.3 – 1.5 events, for `'priced'` more, and **the
>    ≤ 5.0 bar is expected to FAIL on this rung.** The marker must move ≥ 0.5 events paired over
>    six seeds, or the mechanism is not reaching the board and the rung is a FAIL whatever else
>    moves.
> 2. Declarations per game: **3.80** → bar ≥ 4.5; expected +0.1 – 0.4 for `'joint'`.
> 3. Declare accuracy: the guard is **≥ 97.86%**, v0.4a's own (the 98.0 line was written against
>    98.42, which v0.4a already sits under). `'joint'` is expected non-decreasing (forced claims
>    improve); `'priced'` is expected to cost 0.5 – 1.5 points, and **`'priced'` ships only if its
>    six-seed accuracy is ≥ 97.86% and its lock hold is under `'joint'`'s by ≥ 0.5.**
> 4. Win rate: the oracle on the shipped belief reads 38.28% on three seeds (§3.4a), so the 36.0%
>    target stands as written. Expected: `'joint'` inside ±2.83 of v0.4a's 31.94; a resolved gain
>    is not expected on this rung. The v0.4 panel cell at ≥ 45% is expected to FAIL (v0.4a reads
>    35.81 there).
> 5. The ceiling is on the record already (done at v0.4a); an arm above 38.28% on those seeds is a
>    defect in the oracle arm first.
> 6. Cost: expected ≤ 0.3 ms per decision mean (the chain runs on window decisions, memoised per
>    `Knowledge` and set), against the 1.4 ms budget.
> 7. Home regression at 800 pairs on both banks, expected inside its interval; `decideExplained`
>    parity holds because the chain is a pure function of the `Knowledge` and draws no rng.
> 8. λ, again (§8.3 decision 5): the λ = 0.60 arm beside the `'joint'` arm, six seeds. Inside
>    ±2.83 and the vector stays as it is; ahead by more than the floor and the roadmap records that
>    as the measured answer to decision 5, for the owner to take.

> **Measured 2026-09-03 — v0.4b ships the joint alone; `'priced'` measured and not shipped.**
> Bridge unchanged (binaries f58f6f45… / 95b82b18…), tree `b3198db`, 200 deals × 6 rotations per
> cell. Identity first: the null arm (`pAssignment: 'greedy'` on the v0.4b tree, which is v0.4a's
> vector) reproduces all six of v0.4a's cells to the digit — 30.33 / 32.50 / 31.75 / 32.50 / 33.25
> / 31.33 — every engine line identical but the arm's name; the roster arm is byte-identical with
> the knobs absent (0 mismatches over 62,874 decisions against `79e4dc5`). The bridge arm now
> attributes every declare to the branch that made it, with the believed p (`sum-declare.mjs`),
> so accuracy is read per branch below. Home: 800 duplicate pairs per cell; the cost bench on 24
> games after 4 warm-ups.
>
> **Before the bridge, at home: the joint alone barely reaches the board, and the gate is why.**
> Over 60 mirror games (36,093 decisions, 189,308 planned sets) the chain changes the probability
> of 78% of the sets with open cards and the placement of 46%, and changes **13 decisions** —
> because `evClaim`'s structural gate (every open card's candidates all teammates) admits 1,081 of
> the 186,565 sets with open cards (0.58%), and among those the chain lifts ten over the 0.775 bar
> that the independent product did not (12 against 3). Dropping the gate (`claimOwnership:
> 'priced'`) changes 68 decisions, every one a decline turned into a speculative declare. The pins
> in `tests/bots/monet.test.ts` say exactly that; §2.2's nine dead knobs stay dead behind the gate.
>
> **The cells, six seeds × 200 deals against SESTINA v1.0** (per seed 90210 / 4242 / 7011001 /
> 13579 / 24680 / 31415; v0.4a's cells are the null arm's, on record in §3.4a):
>
> | arm | win rate | vs v0.4a (31.94) | lock hold | declarations / game | declare accuracy | speculative declares per 1,200 games |
> |---|---:|---:|---:|---:|---:|---:|
> | v0.4a (the null arm: greedy) | 31.94% | — | 9.98 | 3.80 | 97.86% | 37 at 72.5% |
> | **v0.4b: joint — ships** | **32.75%** (31.42 / 34.00 / 32.42 / 32.83 / 34.50 / 31.33) | **+0.81** [±0.46], 5 of 6, one tie | **10.07** (+0.09) | 3.80 | **98.32%** (+0.46, 6 of 6) | 101 at 92.8% |
> | joint + `'priced'` | 32.49% | +0.54, 5 of 6 (−0.26 against the joint, 1 of 6) | 9.95 (−0.12 against the joint) | 3.81 | 97.90% (−0.42 against the joint) | 236 at 89.1% |
> | joint + λ = 0.60 | 34.32% | +2.38 (+1.57 against the joint [±1.60], 5 of 6) | 9.49 | 3.87 | 98.24% | — |
>
> 1. **Lock hold — FAIL, and the marker did not move: 9.98 → 10.07.** Under the rule written above
>    (≥ 0.5 events, or the mechanism is not reaching the board) this is the rung's FAIL on its
>    primary item, recorded as such.
> 2. **Declarations per game — FAIL**, 3.80 → 3.80, against a bar of 4.5.
> 3. **Declare accuracy — PASSES the guard, and is the rung's measured gain: 97.86 → 98.32%, ahead
>    on 6 of 6 seeds.** Per branch: speculative declares 37 → 101 per 1,200 games at 72.5 → 92.8%
>    accuracy, the chain's believed p calibrated where the branch fires (believed 0.89 – 0.91
>    against realised 0.86 – 0.96 per cell); must-declares 48 → 36 per 1,200 games at 37.9 → 66.8%
>    — the chain's placement is right where the greedy one guessed; the certain and own-hand
>    branches unchanged at 100%. The gain is fewer gifted sets, not sooner-cashed ones.
> 4. **Win rate — FAIL at 36.0%: 32.75%**, +0.81 over v0.4a on 5 of 6 seeds with one tie, inside
>    ±2.83 as expected. Panel, three seeds, ±4.00, against v0.4a's own cells: v0.4 **35.81 →
>    36.94** (+1.14, 3 of 3), v0.6 35.25 → 36.11 (+0.86, 3 of 3); the v0.4 cell at ≥ 45% FAILS as
>    expected.
> 5. **Ceiling — held.** No arm reads above the 38.28% oracle on its seeds (the λ arm's 37.00 at
>    7011001 sits under the oracle's 38.08 there).
> 6. **Cost — PASSES: 0.105 ms per decision** mean (median 0.092, p99 0.277), 63 ms per six-seat
>    game (max 100); 2.6× v0.4a's 0.040 because the chain runs at every window poll, inside the
>    0.3 ms written above and 13× under the 1.4 ms budget.
> 7. **Home regression — no loss, and almost no change.** Joint against v0.4a: **+0.04 ± 0.04**
>    (`home-a`) and **+0.05 ± 0.05** (`home-b`) sets per pair, with the pair SD at 0.65 rather than
>    3.4 because the two arms play the same game in nearly every pair. `decideExplained` parity is
>    pinned on real positions (`tests/bots/joint.test.ts`). The ask path is untouched: ask accuracy
>    53.9 – 54.1, abroad calibration aggregate 0.0020 / worst decile 0.082 (v0.4a 0.0019 / 0.081).
> 8. **λ, third reading, same answer.** +1.57 on the joint (5 of 6, [±1.60]), inside ±2.83; home
>    **+0.22 ± 0.24** (`home-a`) and **+0.32 ± 0.24** (`home-b`, ahead); calibration cost identical
>    to §3.4a's (+0.049 aggregate over-statement abroad, worst decile 0.17 against 0.08). The vector
>    stays as it is; §8.3 decision 5 carries the reading.
>
> **`'priced'` does not ship, by the rule written above.** Its accuracy, 97.90%, clears the 97.86%
> guard by four hundredths; its lock hold, 9.95, is under the joint's by 0.12 rather than 0.5. It
> fires 6.4× the null arm's speculative declares (236 per 1,200 games at 89.1%) and the total
> declarations per game do not move (3.81 against 3.80): the speculative cashes *replace* certain
> cashes of the same sets, an event or two earlier. Home: +0.03 ± 0.04 and +0.02 ± 0.05 sets per
> pair over the joint. Kept behind its knob for v0.5's readout.
>
> **The finding, and it changes the roadmap.** §3.4b was written as "the change that moves the
> 3.2×". Measured, the joint moves declare accuracy and not lock hold, and `'priced'` — which fires
> on everything the chain prices above the bar — moves lock hold by a tenth of an event. The
> ten-event proof lag is not spent waiting for a belief to sharpen: a locked set's six cards sit in
> three private hands, and nothing but a public event moves a teammate's holding into any seat's
> view. **Lock hold is a communication problem, not a belief problem.** The oracle collapses it to
> 0.4 by sharing hands, which no belief can do; the honest channel left is the ask policy choosing
> asks that reveal — a hit moves a card in public, a miss licenses a set in public — which is v0.5's
> cross-seat handoff readout, now the item that carries the cashing channel's +6.75. §0.1's
> arithmetic stands; §3.4b's premise does not.
>
> **What v0.5 inherits.** v0.4b's vector, six seeds: 32.75%, lock hold 10.07, declarations 3.80 per
> game at 98.32%, speculative declares 101 per 1,200 games at 92.8%. Forward bank
> `tests/bots/data/monet-v04b-bank.ts`, 36 games and 26,648 decisions from the committed tree,
> replayed by `tests/bots/monet.test.ts`.

**Cost.** L–XL. **This is the largest single item in the roadmap and it is unavoidable.**

#### 3.4c Monet v0.4c — the licence term at power, and what it buys

**Pre-registered 2026-09-03, before any cell** (`monet-v04c-lambda/PREREG.md` in the session
scratchpad): the confirmatory paired contrast λ = 0.6 against λ off on v0.4b's vector over **24 seeds**
— the six on record (§3.4b item 8) taken as recorded, plus 18 fresh seeds drawn from the engine's own
`hashSeed("monet-v0.4c-lambda-24seeds")` and listed in §6.5 — at the ±1.41 floor §8.3 decision 5 named
as the abroad cell that resolves it. Expectation +1.5 ± 1.4, ahead on ≥ 15 of 24. Reading rule on the
paired mean: ≥ +1.41 clears; between 0 and +1.41 positive but unresolved; ≤ 0 out. Calibration recorded
per arm as a cost, not a veto. A λ = 0.3 arm, derived only after the 36 confirmatory cells, runs on the
same 24 seeds as **exploratory** and cannot ship by itself. The owner delegated the decision to the
project on 2026-09-03 — *do the research and decide on what most improves Monet's winning probability*.

**Identity first.** Both recorded cells at seed 90210 re-run on the tree of the day reproduce the record
to the digit (31.4167% / 33.75%, every engine line but `elapsed` identical, the calibration tables
identical), so the instrument is the one every number below is quoted against.

**The 24-seed table** (Monet win %, n = 1,200 games per cell; rows 1–6 from the record):

| # | seed | λ off (v0.4b) | λ 0.6 | 0.6 − off | λ 0.3 *exploratory* | 0.3 − off | 0.3 − 0.6 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 90210 | 31.42 | 33.75 | +2.33 | 32.00 | +0.58 | −1.75 |
| 2 | 4242 | 34.00 | 35.08 | +1.08 | 35.08 | +1.08 | 0.00 |
| 3 | 7011001 | 32.42 | 37.00 | +4.58 | 37.17 | +4.75 | +0.17 |
| 4 | 13579 | 32.83 | 33.75 | +0.92 | 34.58 | +1.75 | +0.83 |
| 5 | 24680 | 34.50 | 33.00 | −1.50 | 34.50 | 0.00 | +1.50 |
| 6 | 31415 | 31.33 | 33.33 | +2.00 | 33.42 | +2.08 | +0.08 |
| 7 | 1517444 | 33.58 | 36.67 | +3.08 | 35.83 | +2.25 | −0.83 |
| 8 | 9243041 | 30.50 | 32.83 | +2.33 | 34.00 | +3.50 | +1.17 |
| 9 | 8193645 | 28.92 | 31.33 | +2.42 | 31.25 | +2.33 | −0.08 |
| 10 | 7365267 | 33.58 | 34.83 | +1.25 | 35.42 | +1.83 | +0.58 |
| 11 | 5020863 | 32.83 | 33.58 | +0.75 | 34.58 | +1.75 | +1.00 |
| 12 | 4180429 | 29.75 | 35.17 | +5.42 | 34.25 | +4.50 | −0.92 |
| 13 | 4388333 | 34.75 | 34.83 | +0.08 | 36.17 | +1.42 | +1.33 |
| 14 | 4983432 | 32.42 | 35.00 | +2.58 | 36.33 | +3.92 | +1.33 |
| 15 | 9686644 | 31.42 | 34.50 | +3.08 | 34.42 | +3.00 | −0.08 |
| 16 | 6224971 | 32.25 | 33.33 | +1.08 | 33.42 | +1.17 | +0.08 |
| 17 | 5298162 | 33.25 | 34.42 | +1.17 | 37.75 | +4.50 | +3.33 |
| 18 | 6588311 | 31.42 | 34.00 | +2.58 | 35.83 | +4.42 | +1.83 |
| 19 | 7776405 | 32.33 | 32.92 | +0.58 | 33.25 | +0.92 | +0.33 |
| 20 | 8102136 | 31.50 | 36.50 | +5.00 | 35.92 | +4.42 | −0.58 |
| 21 | 4867666 | 29.75 | 31.92 | +2.17 | 32.75 | +3.00 | +0.83 |
| 22 | 8667566 | 33.50 | 33.58 | +0.08 | 36.25 | +2.75 | +2.67 |
| 23 | 2053779 | 31.17 | 34.33 | +3.17 | 36.00 | +4.83 | +1.67 |
| 24 | 8555342 | 33.42 | 32.33 | −1.08 | 33.92 | +0.50 | +1.58 |
| | **mean** | **32.20** | **34.08** | **+1.88** | *34.75* | *+2.55* | *+0.67* |

(Differences are computed from the exact win counts; the table rounds to two places.) The paired
contrast **λ 0.6 − off: mean +1.8819, SD 1.7271, SE 0.3526, ahead on 22 of 24**, behind on two
(24680 −1.50, 8555342 −1.08). The six recorded seeds alone read +1.57 (5 of 6); the 18 fresh seeds
alone +1.99 (17 of 18) — the fresh half repeats the recorded half. **+1.88 ≥ +1.41: the term clears the
floor, and v0.4c ships it.** Pooled, 34.08% against 32.20% for the same bot without it.

**The cost, as pre-registered** (aggregate believed − realised on the arm's own asks, summed over
the 24 cells; the worst decile beside it):

| arm | own asks | believed | realised | aggregate | worst decile |
|---|---:|---:|---:|---:|---:|
| λ off (v0.4b) | 1,244,250 | 0.5405 | 0.5384 | **+0.0022** | 0.083 |
| λ 0.6 | 1,235,467 | 0.5801 | 0.5304 | **+0.0497** | 0.178 at [0.6, 0.7) |
| λ 0.3 *exploratory* | 1,235,001 | 0.5556 | 0.5350 | +0.0206 | 0.081 |

**What the term buys, on the markers — and it is not what §3.3a said it was.** λ was shipped at v0.3
as a calibration correction: licensed asks were under-priced by eight points at home and λ = 0.6
removed the bias. At home that is still exactly true — on v0.4c's own vector the chosen-ask aggregate
reads −0.0003 (believed 0.5816, realised 0.5819, 300 mirror games) against **−0.0521** for v0.4b
without it. Abroad the same term **over**-states by +0.0497 where the bare marginal is calibrated to
+0.0022: **the licence bias is opponent-dependent** — a licence predicts a hit against the roster and
predicts it much less against SESTINA. And the win rate rises anyway, through a channel the markers
name: over 24 cells, λ 0.6 **lowers ask accuracy** (53.84 → 53.04, behind on 24 of 24) and **shortens
lock hold** (10.28 → 9.58 events, ahead on 24 of 24), with declarations per game up (+0.08, 22 of 24)
and mean sets up (+0.077, 22 of 24). The term makes the bot ask into the sets it is licensed in —
the sets its team is invested in — more often than a calibrated ranker would; each such ask cashes a
lock sooner. **λ buys tempo, not accuracy.** That is the cashing channel of §3.4b, opened a crack by
an ask-side bias rather than by communication, and it is why the correct-by-calibration reading and
the wins-more reading disagree.

**The exploratory arm, labelled.** λ = 0.3 reads 34.75% on the same 24 seeds: +2.55 over λ off
(ahead on 23, one tie), **+0.67 over λ 0.6 (SD 1.16, SE 0.24, ahead on 17 of 24, behind on 6)**, at less
than half the over-statement (+0.0206) and the same worst decile as the bare marginal. It was derived
after the confirmatory cells and selected on the seeds it was read on, so it is a hypothesis with a
price, not a result: a smaller λ may buy the tempo at a lower calibration cost. It cannot ship on these
seeds.

**Pre-registered 2026-09-03, before any cell: the 0.3-versus-0.6 confirmation.** Both arms on **24
fresh seeds** from `hashSeed("monet-v0.4c-lambda03-confirm-24")` (§6.5), paired. The two arms share
every deal and most decisions, so the document's binomial floor (±1.41 at 24 seeds, built for two
independent cells) overstates their noise by about three to one (measured paired SD 1.16 against the
floor's implied 3.46); the reading rule is therefore the paired one, written here: **λ moves to 0.3
if the fresh paired mean (0.3 − 0.6) is ≥ 2 × its own SE, ahead on ≥ 15 of 24, and its aggregate
over-statement is below 0.6's; otherwise v0.4c stays at 0.6.** The ±1.41 reading is recorded beside it
either way. If it clears, the registry entry moves to 0.3 and the forward bank is regenerated on the
same branch before the rung merges.

> **Confirmed 2026-09-03 — λ moves to 0.3.** The 48 cells ran 07:59 – 08:30 UTC on the unchanged
> bridge (image, binaries, SESTINA spec and `--games=200 --rotations=6` as every recorded cell; the
> tree at `46a63ae` read-only throughout; both arms re-run at seed 90210 first and identical to their
> recorded cells, every engine line but `elapsed`). The rule, applied verbatim: **(1) paired mean
> (0.3 − 0.6) +1.1875, SD 1.4841, SE 0.3029 — 3.92 × SE against the required 2; (2) ahead on 19 of
> 24, one tie, behind on 4, against the required 15; (3) aggregate over-statement +0.0202 against
> 0.6's +0.0493** (worst decile 0.081 against 0.175). Pooled **35.12%** at 0.3 against 33.93% at 0.6.
> The ±1.41 reading recorded beside it, as promised: the same +1.19 is inside the two-independent-cells
> floor, and the paired SD (1.48) is again below that floor's implied 3.46, so the paired rule was the
> right one to write. The markers move the way §3.4c's finding predicted for a smaller λ: ask accuracy
> 53.12 → 53.57, declarations 3.878 → 3.922 per game, lock hold 9.46 → 9.42 events — more tempo at
> less than half the over-statement. Seed 24 (9195024) is the one large reversal (−2.83) and is
> reported, not explained.
>
> | # | seed | λ 0.6 | λ 0.3 | 0.3 − 0.6 |
> |---|---|---|---|---|
> | 1 | 4118411 | 34.83 | 35.00 | +0.17 |
> | 2 | 5513005 | 35.25 | 35.75 | +0.50 |
> | 3 | 1242624 | 35.58 | 35.17 | −0.42 |
> | 4 | 1908182 | 33.17 | 36.75 | +3.58 |
> | 5 | 8217906 | 31.08 | 32.25 | +1.17 |
> | 6 | 4364985 | 32.92 | 34.58 | +1.67 |
> | 7 | 7116864 | 34.08 | 35.17 | +1.08 |
> | 8 | 2154839 | 32.92 | 33.92 | +1.00 |
> | 9 | 9236699 | 35.25 | 37.83 | +2.58 |
> | 10 | 5736580 | 35.50 | 34.58 | −0.92 |
> | 11 | 4285114 | 32.50 | 35.42 | +2.92 |
> | 12 | 3981270 | 32.67 | 32.67 | 0.00 |
> | 13 | 2579303 | 33.83 | 35.50 | +1.67 |
> | 14 | 3992572 | 33.75 | 33.50 | −0.25 |
> | 15 | 1229699 | 34.33 | 35.67 | +1.33 |
> | 16 | 8314641 | 34.00 | 35.08 | +1.08 |
> | 17 | 7420129 | 32.08 | 35.42 | +3.33 |
> | 18 | 4330275 | 33.42 | 35.83 | +2.42 |
> | 19 | 5928678 | 34.58 | 35.17 | +0.58 |
> | 20 | 3267537 | 33.58 | 36.75 | +3.17 |
> | 21 | 3469159 | 34.08 | 36.00 | +1.92 |
> | 22 | 9730512 | 34.33 | 36.08 | +1.75 |
> | 23 | 9455971 | 33.67 | 34.67 | +1.00 |
> | 24 | 9195024 | 37.00 | 34.17 | −2.83 |
> | | **mean** | **33.93** | **35.12** | **+1.19** |
>
>
> The registry entry is `licenceLambda: 0.3` from this commit and the forward bank is regenerated on
> the same branch (36 games, 25,463 decisions, from the clean tree). Every seed of the run is spent
> and listed in §6.5; the run's PREREG.md and REPORT.md sit beside its 48 cell files in the session
> scratchpad.

**Decision 5 (§8.3) is resolved:** the term is on the vector. **Shipped:** `v0.4c` = v0.4b +
`licenceLambda: 0.3` (by the rule above; 0.6 until the confirmation cleared), last in the registry, so the lobby seats it; its
forward bank replays; suite, lint and type check green. **Home, on record:** +0.22 ± 0.24 sets per pair
on the joint (§3.4b item 8), cost unchanged (the term is a multiply in `pickAsk`).

### 3.5 The capability readout — was to be Monet v0.5; read 2026-09-03 on v0.4b

**This was the rung the whole roadmap existed to reach, and it carried no win-rate target.** It was
to ship the cheap extractions, then stop and measure, then price the only architecture anyone had
argued could cross 50%. Its output was a number and a written decision, not a release: **32.75%
(§3.5b's record) and the owner's call (§0.3).** On the owner's instruction of 2026-09-03 the version
names v0.5, v0.6 and v0.7 belong to the rungs that follow it (§3.6–§3.8); this section keeps its
number so that every cross-reference to §3.5a–c stays true.

#### 3.5a The cheaper extractions on top of the posterior

Three items that are cheap **only once §3.4b exists**, because each is a way of getting more out of a
representation that can hold it.

**(a) Negative certificates and count exhaustion.** **79% of the *lagging* locks — 21.6% of all locks
— are unblocked by a teammate's ask that missed**: proved at the instant of lock 72.5%, teammate ask
that missed 21.6%, opponent miss 0.9%, over 1,937 lagging-lock episodes [measured, defective — an
event-adjacency census over the same games as the lag decomposition, which the correction barely
moved]. This is also the exact channel SESTINA's `r12` coordinate attacks.

> **It is a last-event attribution, and that is why this is §3.5a and not §3.3.** In a sequential
> process, whatever event completes a chain is credited by construction, so 21.6% is a lever only if
> it exceeds the base rate of teammate misses among all events in the lagging window. **That base
> rate was not measured** (WHY §3.2, §6.4), and until it is, the channel is [inferred] rather than
> the mechanistic statement the drafts read it as. The `r12` control that would price it does not
> clear its floor either — see the withdrawal immediately below.

> **The price on it is withdrawn.** `NEXT-GENERATION` C2 quotes *"+1.91 points is the measured size of
> the denial component"* at ±2.83 — the unpaired per-game figure. Re-run on the corrected bridge, the
> `r12`-off contrast is **27.83% → 30.42%, +2.58**, against a paired floor of **±4.00** at 600 deals.
> **It does not clear, and it did not clear before either.** `lockHoldA` moves 9.24 → 8.16, so the
> mechanism is real and its win-rate price is unresolved. Do not quote +1.91 or +2.58 as a gain.
> Resolving it needs ≥ 1,200 deals per arm.

**(b) Cross-seat handoff of a compelled declaration.** Allow a `MUST_DECLARE` seat to hand the
obligation to a teammate whose `planClaim` p is higher. Emulated inside FishAI's own engine over
1,036 endgame declarations across 9,000 games: as shipped **39.86% [36.9, 42.9]**, most-confident
teammate **72.10% [69.3, 74.7]**, fewest-guesses selector 70.41%, best-of-three oracle **86.58%**; it
relocates the declaration 77.90% of the time. [measured, home — no adapter in the path, so nothing
about the bridge touches it]

**The caution travels with it.** `planClaim`'s p is a poor **within-position** predictor in the
endgame — AUC 0.551, Brier 0.2648 against a constant's 0.2481 and 0.2434 for a function of the
guessed-card count — but a good **across-seat** one, which is exactly the use here. **Use p to choose
the declarer; never to gate declaring.** Its level in the `forced-claim` branch is badly
under-confident (states 20.15% where reality is 63.69%, n = 157) and must be corrected before the
number goes on the wire. [measured, home]

**Expect less abroad than at home**, because the host's own ladder already supplies much of the
benefit. The forced channel is one of the few quantities the bridge correction left completely alone:
**forced declares 0.02/game at 62.5% on both bridges** [brief §4]. Quote 62.5% from the brief, not
64.08% from the defective H1 cell.

**(c) The forced endgame is not in this milestone, and here is the measurement that keeps it out.**
Corrected: Monet 60.76% (48 of 79) against SESTINA's 46.21% (67 of 145); Wilson [49.7, 70.8] vs
[38.3, 54.3], **overlapping**. [measured, corrected] The sign is unresolved and resolving it needs
~40,000 **deals** — the drafts say games, and the per-deal floor governs. **Monet may well already be
the better team there.**

**Acceptance test.** Lock hold and endgame declaration accuracy as primaries, `r12`-on vs `r12`-off
as the sensitivity control (if (a) works the gap between those cells narrows), 6 seeds × 200 deals,
home regression at 800 pairs with endgame accuracy as the primary metric because the win-rate effect
is near the floor.

> **Measured 2026-09-03 on v0.4b, as readouts — no code shipped.**
>
> **(a) The sensitivity control, six seeds, and it goes the other way.** v0.4b against SESTINA
> with `r12` off reads **32.06%** (30.42 / 35.25 / 33.50 / 31.75 / 29.17 / 32.25) against 32.75%
> with it on: **−0.69** paired [±2.00], ahead on 3 of 6, inside ±2.83. The mechanism is real and
> priced at nothing: with the host's denial coordinate off, SESTINA's own lock hold rises 3.37 →
> 4.41 and Monet's ask accuracy rises 53.9 → 55.4, Monet's lock hold falls 10.07 → 9.62 — and the
> win rate does not move. The earlier +2.58 was three seeds at ±4.00 on a Bass-era arm; on v0.4b
> at six seeds the channel §3.5a(a) was written to attack is not what holds Monet down, and the
> base rate it needed (the withdrawal above) is moot for this arm. Negative certificates and count
> exhaustion stay unbuilt, on this evidence.
>
> **(b) The handoff, emulated at home on three versions, 6,000 mirror games each** (the same
> instrument as the drafts', rebuilt: every compelled declaration — `must-declare` and
> `forced-claim` — scored against the true hands, beside the claim each teammate would make
> from its own view by `forcedClaim`'s rule):
>
> | version | compelled per game | as shipped | most-confident teammate | fewest guesses | best of three | relocated |
> |---|---:|---:|---:|---:|---:|---:|
> | v0.2 | 0.103 (n = 620) | 43.55% | 76.29% | 75.97% | 88.55% | 84.8% |
> | v0.4a | 0.142 (n = 854) | 39.46% | 70.61% | 70.26% | 83.37% | 81.7% |
> | **v0.4b** | 0.130 (n = 778) | **47.81%** | **77.63%** | 75.58% | **90.62%** | 83.0% |
>
> The drafts' 39.86 → 72.10 → 86.58 reproduces on v0.4a (39.46 → 70.61 → 83.37); the chain lifts
> every column by five to eight points. **Use p to choose the declarer** holds: the most-confident
> teammate is right 77.6% of the time where the compelled seat is right 47.8%. **Never to gate
> declaring** also holds: on the compelled claims v0.4b's believed p is under-stated by 0.08 –
> 0.17 across [0.1, 0.5), calibrated at [0.5, 0.6) (n = 300, −0.009), and over-stated by 0.15 –
> 0.33 above 0.7 (n = 42) — a ranking, not a probability. **The price of the channel is small:**
> +30 points of accuracy on 0.13 compelled declarations per game is about 0.04 sets per game at
> home, and the host compels through its own sweep abroad (`engine-forced` 8 – 12 per 1,200
> games), so the number the bridge could show is smaller still. It is not built; it is a readout,
> and it is the one cheap honest communication mechanism the record has priced.
>
> **(c)** Unchanged: the forced endgame stays out.

**Cost.** M. **Target.** ≥ 37.0% — **the top of the band §0.1 licenses**, and reached only if these
extractions are not already inside §3.4b's posterior. If §3.5a moves nothing, that is a result about
§3.4b having done the job, not a failure, and it must be reported that way.

#### 3.5b The gate — measure, decide, be willing to stop

**This milestone ships no code.** It runs the full panel at power and writes down the answer.

**What runs.** Six seeds × 200 deals against SESTINA, v0.6, v0.5, v0.4, v0.3, v0.2 — 36 cells, plus
the oracle arm as the ceiling control, plus the home regression suite. Roughly the size of the
139-cell re-measurement that produced this roadmap's numbers, and therefore known to be affordable.

> **Pre-registered 2026-09-03 for v0.4b, before the cells.** The gate runs on v0.4b's vector as it
> stands (§3.4b), with §3.5a's extractions *not* built: (a)'s sensitivity control runs as a
> readout, (b) waits on an emulation this repo does not yet carry, (c) stays out. What runs: the
> SESTINA six already on record (32.75%), the v0.4 and v0.6 cells completed to six seeds (the first
> three on record), v0.5 / v0.3 / v0.2 on all six — 36 cells at ±2.83 each — plus SESTINA with
> `r12` off on six seeds as the §3.5a(a) control, the oracle on record (38.28% on the same ask path),
> and the home suite on record. Every seed is a spent bank (§6.5); nothing is fitted here, so
> nothing new is drawn. **Expectations:** the third row of the rule (< 40%), read against 32.75%
> — the belief mechanisms this project has measured are exhausted, and §3.4b's finding names the
> residual as communication before position; the panel monotone (v0.4b ahead of every lineage arm,
> each cell over 50% against v0.2 and v0.3, over 33% against v0.4, v0.5 and v0.6); the `r12`-off
> contrast +2 to +3 on six seeds, inside ±2.83 (the earlier three-seed reading was +2.58 at ±4.00),
> its lock hold under the `r12`-on cells' 10.07 by about one event; no fault counter non-zero.
> The forced choice below then goes to the owner as §8.3 decision 6, with this project's
> recommendation written beside it.

**The decision rule, written before the run so it cannot be negotiated after it.**

| Monet at the §3.5b gate | what it means | what happens |
|---|---|---|
| **≥ 50%** | the belief programme was enough; nothing in §0.1 predicted it | v1.0 immediately; re-audit everything, because this contradicts a measured ceiling |
| **40–50%** | the residual is small enough that search might close it | price §3.5c properly and take it to the owner |
| **< 40%** | the belief mechanisms this project has measured are exhausted; POSITION is the leading hypothesis for the residual, not a finding (§0.2) | **the forced choice below** |

**§0.1 says the third row is the likely one.** The choice it forces:

1. **Accept v0.4/v0.5-era strength in-browser and stop.** One rewrite, no latency cost, and the
   honest maximum for the shipped product. Monet ships at ~33–37% against the frontier and the
   README says so.
2. **Split the engine.** Keep the fast policy on the `/play` surface, build the searching engine as a
   lab/server arm. Then the frontier claim is about a bot the site does not seat, and that needs
   saying the way ADAPTIVE.md's degeneracy result and BOUNDED.md's refuted prediction are said.
3. **Publish the negative result and do not chase it.** *"Monet reaches v0.4-era strength, the
   remaining 13 points are trajectory rather than belief, here is the decomposition and here is the
   price of closing it"* is a result of the same kind as this lab's other three, and it is cheaper
   and more defensible than a frontier claim the project cannot afford to back.

> **The gate, read 2026-09-03 on v0.4b — the third row.** Thirty-six cells at six seeds × 200
> deals, ±2.83 each, tree `35f1aaa` (v0.4b's vector), bridge unchanged:
>
> | opponent | 90210 | 4242 | 7011001 | 13579 | 24680 | 31415 | **mean** | SD |
> |---|---:|---:|---:|---:|---:|---:|---:|---:|
> | **SESTINA v1.0** | 31.42 | 34.00 | 32.42 | 32.83 | 34.50 | 31.33 | **32.75%** | 1.31 |
> | v0.6 | 32.92 | 39.67 | 35.75 | 35.08 | 32.75 | 36.58 | **35.46%** | 2.57 |
> | v0.5 | 36.33 | 35.50 | 36.67 | 37.50 | 38.08 | 37.00 | **36.85%** | 0.90 |
> | v0.4 | 35.42 | 37.25 | 38.17 | 35.42 | 38.33 | 33.67 | **36.38%** | 1.84 |
> | v0.3 | 65.00 | 66.83 | 64.00 | 65.00 | 63.25 | 64.08 | **64.69%** | 1.24 |
> | v0.2 | 68.58 | 68.83 | 71.08 | 69.67 | 68.08 | 69.42 | **69.28%** | 1.05 |
> | SESTINA, `r12` off | 30.42 | 35.25 | 33.50 | 31.75 | 29.17 | 32.25 | 32.06% | 2.17 |
>
> The panel is monotone inside the floor: the frontier hardest, v0.6 next, v0.4 and v0.5 within
> half a point of each other, v0.3 and v0.2 beaten two games in three. Every seed of every row is
> reported; no fault counter fired (the expected `win-condition` warnings only, §3.1). The oracle
> on the same ask path reads 38.28% (§3.4a); no arm is above it. **32.75% is the third row: the
> belief mechanisms this project has measured are exhausted.** v0.2 → v0.4b bought +5.54 points
> on this bridge (27.21 → 32.75, every rung inside its own floor except the marginal's +4.74), the
> ceiling of the cashing channel is +6.75 by cheating (§3.4a), and §3.4b found that the channel is
> communication rather than belief. The 17.25 points that remain are, on this record: about 6.75
> in a cashing channel that only public events can close, a point or two of licence interference
> that no calibrated model reproduces (three readings, §8.3 decision 5), and a residual the
> roadmap's own §0.2 names as position — the leading hypothesis, not a finding.
>
> **The forced choice goes to the owner as §8.3 decision 6, with this project's recommendation
> beside it:** option 3 — publish the negative result with the decomposition above — and option
> 2 only if the frontier claim is wanted, at §3.5c's cost-first test, because search over a
> calibrated posterior is the one untested cell and its price is known to be 300 – 600×. Option 1
> is what the site ships today either way: the lobby seats the latest registry version.

#### 3.5c The lab arm, and why it cannot be priced before §3.4b

**Ships (only if §3.5b says so).** Information-set determinization search over §3.4b's posterior, with
a paired lower-confidence-bound guard.

**The honest update on search, and it goes against the drafts.**

> **`NEXT-GENERATION` §4.1's refutation of search did not reproduce on the corrected bridge.** The
> draft reports −3.7 to −4.2 points across three search arms. Re-run on `bot:pf2`, the same three
> arms give **26.75% / 28.00% / 27.19% against a base of 27.83%** — **all three unresolved** at their
> floor. Search is no longer a measured negative. It is **unresolved and expensive**, which is a
> materially weaker case against it than the drafts make.

**But the cell that matters has never been run, and cannot be until §3.4b exists.** Every search arm
measured so far searched on top of the *shipped* belief — a slot-uniform prior over a support set
(`knowledge.ts:722-733`). Search over a wrong belief is expected to be worth little, and both labs'
numbers are consistent with that. **Search over a correct posterior is the untested cell.** That is
why §3.5c is genuinely gated on §3.4b and not merely sequenced after it.

**What is known about the price, and it is the binding constraint:**

- det=12 / cand=4 / depth=12 = **576 `decide` calls ≈ 81 ms per ask decision** — ~578× the current
  0.14 ms — **~6.6 s per six-seat game on desktop and 20–26 s on a phone**, against ~82 ms today.
  [measured, home — `bench.mjs`]
- The tie group that search would resolve is large and irreducible: **57.9% of 2,209 ask decisions
  end in an exact top-score tie**, mean 3.21 candidates, and the tie-break is already fully
  deterministic — eight rng seeds gave identical actions in 100% of positions. [measured, defective —
  a structural property of the scoring function; FishLab independently measures the same object at
  54.74%, and reports every tie-break rule realising the same hit rate.]
- FishLab's own published price for the correct form of search is **+2.08 points over v0.6 at
  300–420× cost**, attributed to them. That is less than the *bridge repair* delivered, and the
  bridge repair made Monet no stronger at all.

**Acceptance test.** Cost budget **first** — an arm that misses its latency target is rejected before
its win rate is read. Then paired arms on shared determinizations, 6 seeds × 200 deals, with the
unguarded determinized argmax as a named negative control.

### 3.6 Monet v0.5 — opponent reading, and the appetite made a function

**Pre-registered 2026-09-03, before any code, on the owner's direction** (§0.3): *play as aggressive
or conservative as is most beneficial*, and *read the patterns of the opponents*. Two mechanisms,
each with its own knob, marker and ablation arm, shipping as one version — a release boundary, never
a measurement boundary (§3's compaction note).

**The base vector** is v0.4c (§3.4c: the licence term cleared its 24-seed floor). Every number below is
a paired contrast against it on shared deals.

#### 3.6a Mechanism A — ask-choice inference (`choiceKappa`)

**What the belief ignores today.** Every fact the record proves is used: an ask proves the asker holds
a card of that half-suit and lacks the card asked; a miss proves the target lacks it; a hit moves it;
a successful declaration places six cards. What is ignored is the **choice**. An opponent with several
licensed half-suits chose this one, and with several opponents chose this target. A policy chases the
sets it is invested in, so the choice is evidence about the chooser's hand — weak per event, and there
are many events per game.

**The mechanism.** The marginal's candidate matrix (§3.4a) becomes a weighted prior: every admissible
candidate starts at 1, and each ask by seat `s` into half-suit `B` multiplies the weight of every
unknown card of `B` still admissible at `s` by `1 + κ`. Sinkhorn scaling, the constraints and the
joint chain (§3.4b) are unchanged — the fixpoint has the same margins over a different prior.
`κ = 0` is byte identity with the base. Deliberately not modelled at first: which target was chosen
(a miss already proves the target lacks the card, and a hit moves it) and declaration choices.

> **Built 2026-09-03 as `choiceKappa`** (`StyleParams` / `KnowledgeOptions`; the evidence is `Knowledge.asksInto`,
> asks per half-suit by every seat but the viewer, read off the walked log; the weight saturates at three asks so
> the matrix stays conditioned). The prior's shape is `choicePrior`: `'count'` (absent) is the form above;
> `'once'` weights a seat that asked at all by `1 + κ` once. Building it found a repair the flat prior never
> needed: the fold's clamp could scale a column by the ratio of two vanishing remainders and drive cells
> negative (−28,912 at κ = 4 on a saturated prior); the repair is now monotone (`after = max(before, …)`)
> and every κ = 0 bank replays unchanged.

**Reading the patterns — the second knob, its own arm.** `κ` fixed offline is a prior about
opponents in general. The owner asked for the opponents at the table to be read: `κ_s` per opponent
seat, updated inside the game from every **successful** declaration — the one event that publishes
true holders on the host, where a wrong declaration reveals nothing (§3.1), and Monet must play the
same game under both rule sets. The update compares how many times `s` had asked into the resolved
half-suit with how many of its cards `s` actually held, and moves `κ_s` toward what that says. Nine
half-suits a game is a thin signal, so A2 is a separate ablation arm on top of A1, is expected to read
near zero, and ships only on its own marker.

> **Built as `choiceAdapt`** (the step η): at every successful declaration, each seat that had asked into the
> resolved half-suit has its multiplier on κ moved by η · (cards of that half-suit it was dealt − 1.58), clipped
> to [0, 2]; 1.58 is the fit-seed mean for a seat that asked, so a seat whose asks say no more than everyone's
> stays at 1. The dealt count is the walk's own `xfix` (a card that never moved is fixed by the declaration, one
> that moved by its first hit); a half-suit with any deal holder unknown is skipped. Every seat but the viewer is
> read, teammates included. η = 0 is A1 byte for byte.

**Markers.** Ask accuracy (believed against realised on the asks, the belief rungs' marker); the
calibration deciles (aggregate |bias| may not grow by more than 0.01 at home; abroad recorded); and a
new home instrument with ground truth, **the opponent-location score** — the mean marginal probability
the belief assigns to the true holder over opponent-held unknown cards, per decision. A1 must move that
score; if it does not, `κ` is a fit to noise whatever the win rate says.

**Fitting and seeds.** `κ` and A2's step size are fitted at home on this rung's six fit seeds —
`hashSeed("monet-v0.5-fit-6")`: 5794175 8559464 5154915 1779838 6681908 4228422 — and on nothing the
confirmation uses. Confirmation at home on the twelve — `hashSeed("monet-v0.5-confirm-12")`: 4389297
5139251 5352970 3370441 3663060 5699158 4140136 3497573 4750522 7905601 9971419 9954521 — then abroad
on the same twelve.

> **Home record, 2026-09-03 — A goes abroad; the shape and κ are chosen; A2's marker does not move.**
> Everything below is on the six fit seeds unless it says the twelve; the base is v0.4c at λ = 0.3 (§3.4c).
>
> 1. **The evidence, with ground truth** (240 mirror games, 1,798 successful declarations): a seat that had
>    asked into the resolved half-suit was dealt **1.565** of its six cards if it asked once, 1.612 twice,
>    1.570 three or more times, against **1.185** for a seat that held one and never asked. The choice is
>    evidence, as §3.6a said; the *count* of asks says nothing more about the deal. The count form still
>    locates better (item 2): repeated asks say where the cards still are, not where they were dealt.
> 2. **The opponent-location score moves — the marker is met.** p(true holder) over uncertain cards, one
>    row per κ on the same 24,423 ask positions (`scripts/probe-location.mjs`):
>
>    | κ | count: p(true) | top-1 | marginal bias on the base's asks | once: p(true) | top-1 |
>    |---|---|---|---|---|---|
>    | 0 | 0.2594 | 0.3486 | −0.0575 | 0.2594 | 0.3486 |
>    | 0.5 | 0.2717 | 0.3581 | −0.0380 | 0.2650 | 0.3546 |
>    | 1 | **0.2820** | 0.3608 | −0.0215 | 0.2695 | 0.3572 |
>    | 2 | 0.2958 | 0.3622 | +0.0015 | 0.2765 | 0.3593 |
>    | 3 | 0.3036 | 0.3621 | +0.0158 | 0.2817 | 0.3600 |
>    | 4 | 0.3085 | 0.3620 | +0.0256 | 0.2858 | 0.3602 |
>
> 3. **Calibration improves rather than costs, at λ = 0.3.** The chosen-ask aggregate of the policy playing
>    itself (`scripts/calibration.mjs`, 300 games): base **−0.0353** / worst decile 0.1269 — the base
>    under-states at 0.3 where it was exact at 0.6 (§3.4c) — and with the count prior −0.0216 / 0.099 at
>    κ = 0.5, **−0.0122 / 0.061 at κ = 1**, +0.0003 / 0.071 at 1.5, +0.0089 / 0.097 at 2, +0.0234 / 0.167 at 3.
>    The chosen asks hit more often: realised 0.5876 → 0.5944 (0.5) → 0.6068 (1). The bar (aggregate |bias|
>    may not grow by 0.01) admits every κ up to 2 on this base; at λ = 0.6 it had admitted only 0.5 (κ = 1
>    read +0.0131, κ = 2 +0.0348: the licence term and the prior over-state together).
> 4. **Sets at home do not move, and fall past κ = 1.** Duplicate pairs against the base, fit bank, 600 pairs:
>    count **+0.05 ± 0.24 at 0.5, −0.11 ± 0.25 at 1, −0.39 ± 0.27 at 2** (behind); once −0.12 / −0.06 / −0.12 /
>    −0.32 (κ = 3) / −0.34 (κ = 4). A sharper belief that hits more asks and wins no more sets: the same shape
>    as λ (§3.4c). On the twelve confirmation banks (100 pairs each) κ = 0.5 reads −0.03 ± 0.17 (ahead 6 of
>    12) and κ = 1 **+0.02 ± 0.19** (ahead 8 of 12).
> 5. **Chosen before any abroad cell:** the count form (the pre-registered shape, and the better marker),
>    **κ = 1 primary** (the higher confirmation read, inside the noise; the larger marker move), κ = 0.5
>    secondary, both to the twelve seeds abroad. Larger κ is behind at home and is not run.
> 6. **A2's marker does not move.** With η = 0.25 / 0.5 on κ = 1 the location score reads 0.2692 → 0.2689 →
>    0.2685 (κ = 2: 0.2761 → 0.2757 → 0.2750): the in-game estimate has nine half-suits to learn from and adds
>    noise. A home mirror has no seat differences to read, so one information arm (κ = 0.5, η = 0.25) goes
>    abroad, labelled; by the rule above it cannot ship on that run.

#### 3.6b Mechanism B — the defusal appetite as a function of the state (`defusePolicy: 'state'`)

**What exists.** `defuse.ts` prices every ask's hit branch from the threat model at every call, and
`defuse` (§3.3b) is the one scalar that multiplies the credit, fitted at 1 as break-even. The knob's
whole range read inside the floor abroad (§3.3b; §8.3 decision 4), so a better constant is not on
offer. What a constant cannot do is be right both in the position where a set of ours is one ask from
being taken and in the position where nothing of ours is threatened.

**The mechanism.** The appetite becomes a table over public state: sets of ours under threat (0 / 1 /
2+), the score state (behind / level / ahead in sets) and the phase (cards left above / below the
median) — nine to eighteen cells, fitted on the home duplicate-pair bank on the fit seeds, with
monotone constraints imposed (more threat, more appetite) so the table cannot fit noise cell by cell.
`defusePolicy: 'scalar'` is byte identity with the base. The roster stays frozen, as with every Monet
knob.

**Markers.** Sets lost to opponent declarations per game (the thing the appetite is paid to prevent);
the paired set-difference at home; and lock hold, which the appetite must not worsen.

> **Built 2026-09-03 as `defusePolicy: 'state'` with `defuseState {threat, score, late}`**: the appetite is
> `defuse · max(0, 1 + threat·(T − 1) + score·S + late·L)`, read once per decision (`defusalAppetite`), where
> T counts (capped at 2) the unresolved half-suits in which this team has located cards and an opponent with
> cards holds a live licence, S is the signed set lead clipped to ±1, and L is 1 once fewer than half the
> cards are in hands — the linear form of the table above, with the monotone constraint `threat ≥ 0` enforced
> by `validateStyle`. `'scalar'`, absent, or all-zero slopes is the base byte for byte.
>
> **Home record — B does not go abroad.** One slope at a time against the base on the second fit seed's bank,
> 600 pairs: threat 0.5 **−0.17 ± 0.13**, threat 1 **−0.25 ± 0.15** (both behind), score −0.5 −0.04 ± 0.13,
> score +0.5 −0.12 ± 0.15, late −0.5 +0.02 ± 0.06, late +0.5 −0.07 ± 0.06. Nothing moves the marker the
> right way, and the one slope the pre-registration required to be positive is the one that loses most. The
> scalar itself sits at a home optimum on the same bank: defuse 0 −0.13 ± 0.28, defuse 2 −0.20 ± 0.22. §3.6c's
> rule applies: a mechanism whose marker does not move at home does not go abroad. The knob stays in the
> code, off the vector, as §3.3b's `defuse` ladder did; the roster is untouched.

#### 3.6c Acceptance, cost, target

**Home first**, on shared deals: each mechanism against the base and against the other, floors as
§3.3b's (about ±0.20 sets per pair on 600 pairs). A mechanism whose marker does not move at home does
not go abroad.

**Abroad**, the 2 × 2 of §3.4a's shape — base, +A, +B, +A+B — at **twelve seeds** each (the twelve
confirmation seeds above), paired floor ±2.00: 48 cells, about half an hour of bridge. **A mechanism
ships if its paired main effect clears +2.00.** Inside the floor with the marker moved: recorded, not
shipped, as λ was at §3.4a — unless the owner directs otherwise, which decision 5 shows is his to do.
The interaction is reported either way.

**Cost** M–L. **Target** ≥ 35.0% against SESTINA — a design target: the honest expectation is +1 to
+3 over the base, and nothing here can pass the oracle's 38.28% on the current ask policy (§3.4a),
because both mechanisms leave that policy's information alone. **At the rung's gate, §3.5b's rows are
re-read against the shipped number.**

> **Abroad record, 2026-09-03 — nothing ships from v0.5; the decision goes to the owner (§8.3 item 7).**
> B did not go abroad (§3.6b), so the 2 × 2 became A's three arms against the base: `choiceKappa: 1`
> (primary), `choiceKappa: 0.5` (secondary), `choiceKappa: 0.5, choiceAdapt: 0.25` (information — cannot
> ship on this run), on v0.4c at λ = 0.3, the twelve confirmation seeds, 200 deals × 6 rotations a cell
> (48 cells, 09:08 – 09:37Z). The base arm at 90210 reproduced §3.4c's λ-0.3 cell line for line before a
> fresh seed was spent. Monet's win rate, paired per seed:
>
> | seed | base | κ 0.5 | κ 1 | κ 0.5 + η 0.25 | κ 0.5 − base | **κ 1 − base** | +η − base |
> |---|---|---|---|---|---|---|---|
> | 3370441 | 30.00 | 33.33 | 34.08 | 32.92 | +3.33 | +4.08 | +2.92 |
> | 3497573 | 35.83 | 34.75 | 35.33 | 35.00 | −1.08 | −0.50 | −0.83 |
> | 3663060 | 37.25 | 34.83 | 35.08 | 35.08 | −2.42 | −2.17 | −2.17 |
> | 4140136 | 34.42 | 34.33 | 33.58 | 34.25 | −0.08 | −0.83 | −0.17 |
> | 4389297 | 32.67 | 31.42 | 34.42 | 33.00 | −1.25 | +1.75 | +0.33 |
> | 4750522 | 34.83 | 33.75 | 32.08 | 35.17 | −1.08 | −2.75 | +0.33 |
> | 5139251 | 33.58 | 36.00 | 34.17 | 35.58 | +2.42 | +0.58 | +2.00 |
> | 5352970 | 32.33 | 35.50 | 35.17 | 34.33 | +3.17 | +2.83 | +2.00 |
> | 5699158 | 36.42 | 37.08 | 35.33 | 36.58 | +0.67 | −1.08 | +0.17 |
> | 7905601 | 34.58 | 38.25 | 35.83 | 36.42 | +3.67 | +1.25 | +1.83 |
> | 9954521 | 36.92 | 33.92 | 37.25 | 34.92 | −3.00 | +0.33 | −2.00 |
> | 9971419 | 34.67 | 34.75 | 36.75 | 35.75 | +0.08 | +2.08 | +1.08 |
> | **pooled** | **34.46** | 34.83 | **34.92** | 34.92 | +0.37 | **+0.47** | +0.46 |
>
> **The primary arm's paired main effect is +0.47 (SD 2.04, SE 0.59, 0.79 × SE; ahead on 7 of 12) — inside
> the ±2.00 floor. By the rule above, A does not ship.** The secondary reads +0.37 (SE 0.66, 6 of 12) and
> the information arm +0.46 (SE 0.46, 8 of 12): three arms agreeing on a small positive effect the twelve
> seeds cannot resolve, and a hundred would be needed to read +0.4 at 2 × SE. The markers, mean over the
> twelve cells (calibration n-weighted over Monet's own asks):
>
> | arm | win | our sets | ask accuracy | declarations / game | lock hold | calibration bias | ev-claims n / accuracy | must-declare n / accuracy |
> |---|---|---|---|---|---|---|---|---|
> | base | 34.46 | 3.966 | 53.53 | 3.906 | 9.46 | +0.021 | 1,084 / 92.9% | 415 / 63.6% |
> | κ 0.5 | 34.83 | 3.969 | 54.01 | 3.910 | 9.72 | +0.033 | 1,191 / 92.3% | 467 / 71.9% |
> | κ 1 | 34.92 | 3.970 | 54.26 | 3.919 | 9.75 | **+0.046** | 1,366 / 91.5% | 471 / 70.3% |
> | κ 0.5 + η | 34.92 | 3.970 | 53.97 | 3.909 | 9.69 | +0.033 | 1,190 / 91.6% | 442 / 71.7% |
>
> Three readings. **The prior over-states abroad as λ did**: at home it repaired the base's
> under-statement (item 3 above, −0.035 → −0.012), and against SESTINA — whose asks say less about its own
> hand than Monet's do about Monet's — it adds to an over-statement the base already carries (+0.021 →
> +0.046 at κ = 1); the home bar would fail every arm here. **Ask accuracy rises and sets do not**
> (53.5 → 54.3; 3.966 → 3.970): the shape of every belief sharpening on this ladder, tempo and not sets
> (§3.4c). **The compelled declarations improve** (must-declare 63.6% → 70 – 72% on 415 – 471 events): the
> one place a sharper belief changes an outcome, and the population §3.5a sized at ~0.04 sets a game.
> Lock hold does not fall (9.46 → 9.7), which is §3.4b's finding again: no belief helps a teammate prove a
> set. The knobs stay in the code, off the vector; the roster and the registry are untouched, v0.4c
> remains the base, and v0.6 is built on it. Run directory `monet-v05` (PREREG.md, REPORT.md, 48 cells).

### 3.7 Monet v0.6 — communication: asks chosen to reveal, and the handoff played

**Opens after §3.6's record; its pre-registration is written then.** The record's central finding
(§3.4b) is that lock hold is a communication problem: a locked set's cards sit in three private hands,
and only public events move a teammate's holding into view. The oracle on shared hands sizes the whole
channel at **+6.75** (38.28% against 32.75%, §3.4a) and collapses lock hold from ten events to under
one. No bot plays any of it yet.

Two items, each with a marker, each an ablation arm:

1. **Asks chosen to reveal.** An ask publishes a licence — the asker holds a card of that half-suit.
   Today the ask policy pays nothing for what that tells a teammate; `signalling` spends only a
   provably dead turn on it. The term prices the information an ask gives the two teammates about the
   set they are trying to cash, against the hit it forgoes. **Marker: lock hold** (10.07, toward the
   oracle's 0.4), with speculative declares' accuracy (92.8% at §3.4b) not falling.
2. **The handoff, as policy.** §3.5a(b) measured on the emulation that the most-confident teammate is
   right 77.6% of the time where the compelled seat is right 47.8%, and the rules let anyone declare
   at any moment. The policy: at a window that will compel a declaration, a teammate that estimates
   the compelled seat's confidence from the public record and beats it declares first, out of turn. A
   shared convention, no message. **Marker: compelled-declare accuracy** at home (47.8%, toward
   77.6%) and its price in sets per game, which §3.5a(b) sized at about 0.04 at home and left open
   abroad.

**Target** a design target of ≥ 38.0%, since this is the one rung whose ceiling the record has
measured. Twelve seeds, ±2.00, drawn and written down when the rung opens.

#### 3.7a Pre-registration — written 2026-09-03 when the rung opened, before any v0.6 code

**The base** is whatever §3.6's abroad run ships (v0.4c at λ = 0.3 if nothing does). Every number is a paired
contrast against it on shared deals, and the twelve-seed floor abroad is ±2.00.

**Item 2 as written above cannot be built, and the census says so.** RULES_US54.md §3.2 offers the option to
the turn-holder *first* and makes `decline` illegal while the turn-holder has no legal ask, so in a
`MUST_DECLARE` window the option never travels: no teammate can declare first. On v0.4c at λ = 0.3 (2,000
mirror games, 1,178,641 decisions) the compelled declarations are **240 — 227 `must-declare`, 13
`forced-claim`** (an on-turn claim with no window at all). Neither kind has a moment at which a teammate
holds the option. The emulation's numbers reproduce (as shipped 47.92%, most-confident teammate 74.17%,
best of three 87.92%) and still measure a channel the rules do not open at that moment. **What replaces it —
the pre-emptive declare.** The compulsion is foreseeable from the public counts: it arrives when the last
opponent card leaves. In the windows *before* it, every teammate holds the option in turn, and the one whose
speculative plan is best can declare then — the same information the emulation priced, spent one window
earlier. The knob: `compelHorizon` (opponents' cards in hands, in total, at or below which the position is
*near compulsion*; 0 = off, byte identity) and `declareThresholdCompelled` (the speculative bar played
there, in place of `declareThreshold`'s 0.775; the compelled seat is right 47.9% believing 0.43, so any bar
above that is a gain over what the position will otherwise get). **Marker:** the accuracy of declarations
made near compulsion at home (`scripts/probe-handoff-declare.mjs`, extended to score every declaration at
opponents' cards ≤ horizon, ground truth), toward the emulation's 74%; and their count per game, which must
not exceed the compelled population it replaces by more than the fit explains. **Price:** sets per game on
duplicate pairs; §3.5a(b) sized the whole channel at about 0.04 sets per game at home, so this item is
small by construction and is built because it is cheap, not because it is large.

**Item 1 gets a readout before a line of policy.** Its family has a record: signalling measured flat
(49.97%, −0.013 ± 0.033 over 1,500 pairs) and stalling lost 1.14 sets at strength (conceal.ts's header),
because a deliberate miss concedes the turn and a licence is one bit. An ask into a set the team already
holds in full is *always* a miss (no opponent holds a card of it), so the reveal term is exactly that
family, and it is worth building only where one bit finishes a teammate's proof. **The readout**
(`scripts/probe-reveal.mjs`, ground truth at home): at every ask decision, for every set locked on the
asker's team that no teammate can prove, append the asker's licence to the log and rebuild each teammate's
knowledge — does the proof complete, or does a teammate's best plan clear the bar? **The floor, written
now: the term is built only if such opportunities number ≥ 0.30 per game on the fit seeds; below that the
channel is too thin to move lock hold by the ±0.20-sets floor's worth and item 1 is recorded as a readout,
as §3.5a(b)'s handoff was.** If built: `reveal` (≥ 0, absent = identity) credits an ask into a set the
asker's knowledge places wholly on its team, when its licence there is not yet public, by `reveal · wHit ·
u / (1 + E)` with `u` the set's cards the public record has not placed and `E` `turnYield` — paid on both
branches, once per set, the mirror image of `conceal`. **Markers:** lock hold at home (`probe-score.mjs`'s
team half; the abroad engine's *lock hold*), which must fall; speculative-declare accuracy (92 – 94%), which
must not.

> **The readout cleared the floor, and item 1 was built 2026-09-03 — in a different form from the one above,
> changed before any fit cell was run.** `scripts/probe-reveal.mjs` on v0.4c at λ = 0.3, the six fit seeds ×
> 100 mirror games (48,555 ask decisions): 38.4 locked (decision, set) pairs a game, none provable by any
> teammate (the definition of lock hold); the asker can ask into 33.3 of them; **one ask completes a
> teammate's proof 3.41 times a game** (4.55 with the card chosen freely), against a floor of 0.30; 0.18 of
> those a game would clinch; the best legal ask forgone at such a moment hits with probability 0.563.
>
> **Why the form changed.** The paragraph above credits an ask "into a set the asker's knowledge places
> wholly on its team". Built that way the term never fired: a seat whose knowledge places all six cards on
> its team can prove the set itself and has already declared it, so the residue — locked *by the asker's
> knowledge* and yet unprovable — is empty in practice. The readout's 3.41 a game are sets locked *by the
> deal*, which the asker does not know. So the term is a hybrid (`reveal.ts`): the card is asked of the
> opponent most likely to hold it, at the model's hit probability p, and is credited
> **`reveal · urgency · P(locked)`** on top of p — P(locked) the model's belief that every card of the set is
> on the team (the product over its unlocated cards of the probability a teammate holds it) — playing over
> the ordinary pick when the sum exceeds the pick's hit probability. If it hits, the turn continues as any
> hit does; if it misses and the set is on the team, the teammate cashes it. Urgency is 1 when cashing the
> set would clinch the game and `revealFar` otherwise, the two knobs the fit reads.
>
> **What the asker computes.** A teammate's knowledge is the public walk plus its own hand and nothing else,
> so `publicKnowledge` (knowledge.ts) walks the log with no hand injected — `finishKnowledge` minus exactly
> its own-hand step, the materialisation shared so every existing build is byte for byte what it was —
> and takes one seat's hypothesised holdings over named cards (`AssumedHand`). For each card it could
> name, the asker builds the record as it would stand after the ask, injects the likeliest split of the
> set's cards between the two teammates as each one's holdings, and reads whether that teammate then
> places all six cards on the team. The simulation is sound: the teammate's real build injects its whole
> hand and the fixpoint is monotone, so whenever the set is on the team and the split is right, the
> teammate proves what the simulation says it proves (`tests/bots/reveal.test.ts`, against the true hands);
> where the split is wrong the ask is a miss and nothing is cashed. A teammate who could already prove the
> set under the same split gets no credit — had the split been right, the set would have been declared.
> Cost: two public walks per candidate set for the standing record, and one per named card per open
> teammate for the record after the ask. Absent or 0 is byte identity (pinned over whole games).

> **Home record, 2026-09-03 — item 1 does not go abroad.** Duplicate pairs against the base on the first fit
> seed's bank (9220628), 600 pairs, the arm's sets minus the base's:
>
> | `reveal` | `revealFar` | paired set-diff | SD (sets/pair) |
> |---|---|---|---|
> | 1 | 0 (clinch only) | −0.07 ± 0.08 | 0.96 |
> | 2 | 0 | −0.08 ± 0.08 | 0.98 |
> | 4 | 0 | −0.09 ± 0.08 | 1.02 |
> | 1 | 0.25 | −0.20 ± 0.29 | 3.57 |
> | 2 | 0.25 | **−0.25 ± 0.28** | 3.49 |
> | 4 | 0.25 | −0.18 ± 0.27 | 3.38 |
> | 2 | 1 | −0.36 ± 0.28 | 3.45 |
> | 4 | 1 | **−0.39 ± 0.29** | 3.58 |
>
> Every cell is behind. The firing diagnostic (`scripts/probe-reveal-fire.mjs`, ground truth, 200 mirror
> games at `reveal: 4, revealFar: 1`) says why: the term fires **11.9 times a game**, the set is really on
> the team **9.9%** of the time (the belief is honest — mean P(locked) 0.085 — and *weak*), the split is
> right in two thirds of those, and a teammate cashes the set at the next window **5.8%** of the time. The
> price is paid every time: the reveal ask hits 25.9% where the base's ask at the same position would have
> hit 35.3%. By believed P(locked): below 0.1 (79% of the fires) the set is on the team 2.3% of the time
> and the fire is an ask swap that costs four points of hit probability for nothing; at 0.2 – 0.4 the set is
> on the team about half the time and cashes at the next window 7 – 18%, but the base's ask there would
> have hit 64 – 74% against the reveal's 23%; above 0.5 the hand holds three or four cards of the set and
> the "reveal" is the base's own ask (base-hit 85 – 94%), which completes the set the ordinary way. No
> gate on P(locked) finds a bin where the cash is worth the hit given up. The clinch-only cells
> (`revealFar: 0`, 0.88 fires a game, 8.0% cashed at the next window, hit 35.1% against the base's 42.9%)
> sit inside the ±0.20 floor and lose a little. **The marker moves by a hair**: locked (decision, set)
> pairs per game — lock hold integrated from the deal's lock, the abroad engine's definition — 35.06 →
> 34.07 at `reveal: 2, revealFar: 0.25` (three fit seeds × 100 games), a 2.8% shortening bought with the
> sets above.
>
> The finding is the family's (signalling flat, stalling −1.14): a deliberate miss buys one bit, and the
> bit is worth a turn only when the asker can tell *which* set is locked — and the asker cannot; a seat
> that could would prove the set itself. The 3.41 opportunities a game are real and are the teammates'
> to see, not the asker's. The knobs stay in the code, off the vector; the readout, the diagnostic and
> the public walk remain (the walk is what any later teammate-side inference will be built on).

> **Item 2′ built 2026-09-03 as `compelHorizon` / `declareThresholdCompelled`** (style.ts; the window plays the
> compelled bar, as written and without the clinch response, where declining is still legal and the opponents
> hold at most `compelHorizon` cards; absent or 0 is byte identity — `tests/bots/compel.test.ts`). **Home
> record — item 2′ does not go abroad either.** Duplicate pairs against the base, bank 9220628, 600 pairs:
>
> | horizon | bar | paired set-diff |
> |---|---|---|
> | 10 | 0.5 | −0.07 ± 0.08 |
> | 6 | 0.5 | −0.04 ± 0.05 |
> | 6 | 0.6 | −0.05 ± 0.04 |
> | 4 | 0.5 | −0.02 ± 0.04 |
> | 2 | 0.5 | **0.00 ± 0.02** |
> | 2 | 0.6 | −0.00 ± 0.01 |
> | 1 | 0.5 | −0.02 ± 0.02 |
>
> Behind at wide horizons, a no-op at tight ones, and the marker says why (`scripts/probe-handoff-declare.mjs
> --horizon`, 2,000 mirror games, every window declaration with the opponents at or below the horizon scored
> against the true hands). At horizon 6 the base makes 0.06 speculative window declarations a game there at
> 82.6% and 0.114 compelled ones at 48.9%; with the bar at 0.5 the speculative ones become **0.226 a game at
> 60.6%** while the compelled fall only to 0.079 — and the *certain* claims fall from 0.840 to 0.764 a game.
> The pre-emptive declare does not mostly replace the compulsion it was built to pre-empt; it replaces
> certain claims that would have come a few actions later, with a guess right three times in five. At
> horizon 2 the same shape at a smaller scale (speculative 0.032 → 0.086 a game at 69.4%, compelled 0.114 →
> 0.095, certain 0.257 → 0.243) nets to nothing. The emulation's 74% was the accuracy of the *best-informed*
> teammate's plan at the compelled moment; a bar cannot pick that seat, it can only lower every seat's
> price, and the seats that clear it first are the ones whose plans are not yet proofs.
>
> **The rung's verdict: v0.6 ships nothing.** Both communication items are built, pinned and off the vector;
> neither moved sets at home, so neither went abroad (§3.6c's rule). §3.4b's channel — the 3.4 sets a game a
> teammate could prove with one more fact — is real and stays open, and this rung's finding is that the
> *asker* cannot see it and the *window* cannot select for it. What is left on the record is position (§0.2),
> and §3.8 opens.

**Seeds.** Fit on six from `hashSeed("monet-v0.6-fit-6")`: **9220628 8580707 6389604 5910092 2121575
1884435**; confirm at home and abroad on twelve from `hashSeed("monet-v0.6-confirm-12")`: **6021520 8438705
3195511 9141082 5082131 7701419 2601210 4621978 6478725 2793161 2568302 2796767** — drawn by §6.5's rule
excluding every seed read or reserved so far (87 after the draw, all distinct), the engine's `hashSeed`
against the verbatim copy, no draw skipped.

**Acceptance.** As §3.6c's: each item its own arm, home first (the marker must move; duplicate pairs not
behind at ±0.20 on 600 pairs), then abroad at the twelve seeds; **an item ships if its paired main effect
over the base clears +2.00**; inside the floor with the marker moved, recorded and not shipped unless the
owner directs otherwise. The oracle's +6.75 stays the ceiling this rung is read against.

### 3.8 Monet v0.7 — the search arm, only if a gap is left and only through the cost-first test

**Opens only if §3.7's record leaves a gap the middle row of §3.5b's rule says search might close** —
the shipped bot under 50% and the decomposition on record naming no cheaper lever. Everything §3.5c
says stands: cost budget first, so an arm that misses its latency target is rejected before its win
rate is read; the unguarded determinized argmax is the named negative control; and the lab arm does
not ship on `/play` unless the split-engine decision (§3.5b, option 2) is taken separately by the
owner. Its pre-registration is written when it opens.

#### 3.8a Pre-registration — written 2026-09-03 when the rung opened, before any v0.7 code

**Opened by the rule.** §3.5b's third row (32.75% on v0.4b; 34.5 – 35.1% at λ = 0.3) leaves the shipped bot
under 50%. §3.6 read the last belief lever at +0.47 inside the floor; §3.7 found both communication items
flat or behind at home — the asker cannot tell which set is locked, and the compulsion is a channel of
about 0.04 sets a game. The decomposition on record names no cheaper lever: position (§0.2) is what is
left, and search over a correct posterior is the one untested cell (§3.5c). The base is v0.4c.

**The arm** (`lib/engine/search/`, a lab arm: `/play` seats the fast policy unchanged, and the bots
directory's public-view proof is untouched because the search lives outside it and reaches the engine's
`reduce` there). Information-set determinization search on the **ask decision only** — windows are v0.4c's.
At an ask decision: (1) **D determinizations** of the unseen cards are sampled from §3.4a's table — each
unlocated card to a candidate seat with free capacity, in proportion to the marginal, the licence
constraints honoured by rejection; the viewer's own hand and every located card are fixed; (2) the
**candidates** are the fast ranker's top C asks, the pick among them; (3) each candidate is played on each
determinization and the game **rolled out for S actions under v0.4c at every seat**, the same rollout seed
for every candidate on a determinization (paired), scored by the team's set differential at the horizon,
a finished game scoring its result; (4) the candidate with the highest mean paired advantage over the pick
plays only if its **lower confidence bound** over the D determinizations clears zero (mean − z · SE > 0),
otherwise the pick plays. Knobs `det` (D), `cand` (C), `steps` (S), `z`; **the unguarded argmax (z = 0
with no bound, the plain best mean) is the named negative control.** The sampler's fidelity is its own
reading at home (`scripts/probe-determinize.mjs`: the sampled deal's per-card accuracy against the true
deal, beside the marginal's top-1).

**Cost first.** The budget is **≤ 100 ms mean per ask decision** on the bench machine at the arm's fitted
(D, C, S) (`scripts/bench-decide.mjs`, the search arm named), about 700× today's 0.14 ms and the order
§3.5c measured (81 ms at 576 `decide` calls). An arm over budget is rejected before its win rate is read.
At the bridge the arm's wall clock per game is reported beside the cell.

**Markers at home.** The rollout's paired advantage of the played candidate over the pick, which must be
positive on the fit seeds or the arm is a no-op; duplicate pairs against v0.4c on the fit bank (not behind
at ±0.20; the expectation is ahead — this is the first rung whose home marker is the number itself); the
negative control beside it.

**Seeds.** Fit on six from `hashSeed("monet-v0.7-fit-6")`: **3150867 9742538 4824841 8665093 2488551
9695050**; confirm at home and abroad on twelve from `hashSeed("monet-v0.7-confirm-12")`: **9715909 1657910
5562102 8242985 3593118 2057008 6962430 6081385 9709672 3768516 5398011 2496080** — §6.5's rule (each draw
1,000,000 + h mod 9,000,000 off the engine's `hashSeed` against the verbatim label, no draw skipped), all
distinct from every seed this document names.

**Acceptance.** Cost first, as above. Then the arm ships to the registry as v0.7 — a lab entry the lobby does
not seat unless the owner takes §3.5b's option 2 — if its paired main effect over v0.4c clears **+2.00** at
the twelve seeds abroad, the negative control and the wall clock reported beside it; inside the floor,
recorded and not shipped. **Expectation:** +1 to +3. FishLab's published +2.08 for the correct form of
search, at their cost, is the prior, attributed; the correct-posterior cell is untested, which is the
reason to run it.

> **Amendment, 2026-09-03, written before any fit cell was read.** The arm was built as above
> (`lib/engine/search/`, commit 72d16af) and costed first: **96 ms mean per ask decision** at D = 8, C = 3,
> S = 24 (7.8 s a mirror game against 68 ms), inside the budget. Its per-decision arithmetic was then
> looked at, and at that horizon — three or four asks and their windows — the set differential almost never
> moves: nine candidate means in ten read exactly 0.00 and the guard fired on 6% of decisions with nothing
> behind it. So the leaf value takes two weights, **`leafLock`** per locked set at the horizon (an unresolved
> half-suit wholly in one team's hands, exact on the determinized deal) and **`leafCard`** per card in hand,
> each ours minus theirs. Both 0 is the pre-registered form, which stays the default and is run as its own
> cells; with 0.5 / 0.15 the search leaves the pick on 26% of decisions at a mean advantage of 0.33 (SE
> 0.19). The fit reads both forms. Nothing else in the pre-registration changes: the guard, the control,
> the budget, the seeds and the acceptance stand.

> **Home record, 2026-09-03.** Cost first: 96 ms a searched ask decision at the pre-registered D 8 · C 3 · S 24
> (`scripts/bench-decide.mjs --search`), inside the 100 ms budget; the wider form (D 12 · C 4) costs twice the
> budget and the deeper one (S 40) 1.7 times it, so both are out on the cost rule whatever they read, and they
> were read only to see whether either would have been worth pricing. Duplicate pairs against v0.4c on the
> first fit bank (3150867), 100 pairs a cell, the search at every ask decision of the A arm:
>
> | form | paired set-diff | SE |
> |---|---|---|
> | **pre-registered** — D 8 · C 3 · S 24 · z 1, guarded | **+0.41** | 0.31 |
> | the negative control — the same, unguarded argmax | +0.42 | 0.35 |
> | deeper, S 40 (1.7× the budget) | +0.60 | 0.34 |
> | wider, D 12 · C 4 (2× the budget) | −0.08 | 0.33 |
> | leaf 0.7 / 0.10 | −0.01 | 0.39 |
> | leaf 0.5 / 0.15 | −0.53 | 0.34 |
> | leaf 0.3 / 0.20 | −1.36 | 0.35 |
> | leaf 0.5 / 0.15, unguarded | −1.48 | 0.34 |
> | leaf 1.0 / 0 (a locked set counts as a set, no card term) | +0.61 | 0.32 |
>
> The confirmation at 600 pairs, 100 on each of the six fit banks: the pre-registered form **−0.14 ± 0.25 (SE 0.13; the six banks +0.41, +0.09, +0.21, −0.90, −0.44, −0.21 — the first bank's +0.41 was the
> one every search form read hot on, all of them sharing its B games)**; the
> control −0.12 ± 0.28 (SE 0.14); and the lock-only leaf (1.0 / 0), a third leaf form added after the two above read behind and so
> post-hoc, **+0.16 ± 0.26** (SE 0.14; five banks of six positive) — and its marker, on the same 100 probe games, a true paired
> advantage of **+0.043 (SE 0.020)** in its own units of sets-and-locks, 12.9% of searched decisions played, hit rate 59.1% →
> 57.1%.
>
> **The marker** (`scripts/probe-search.mjs`: 100 mirror games a form with the search at every seat, and every
> searched decision scored by a paired rollout of the pick and of what was played from the *true* state, the
> arm's own rollout key):
>
> | form | played a candidate | the arm's own belief in it | its **true** paired advantage | true hit rate, pick → played |
> |---|---|---|---|---|
> | pre-registered | 8.8% of searched decisions (7.3 a game) | +0.39 sets | **+0.033 (SE 0.026)** | 59.2% → 57.8% |
> | control, unguarded | 25.5% (21.6 a game) | +0.24 | +0.001 (SE 0.014) | 61.7% → 56.5% |
> | leaf 0.5 / 0.15 | 22.2% | +0.37 | +0.049 (SE 0.017), in its own leaf units | 60.0% → 55.6% |
> | leaf 0.7 / 0.10 | 22.0% | +0.31 | −0.010 (SE 0.016) | 60.5% → 56.3% |
>
> What the pre-registered guard held back — the best-mean candidate on the 1,467 searched decisions where it
> did not clear — had a true advantage of −0.034 (SE 0.015): the guard holds back the right things. What it
> lets through is worth +0.03 of a set at the horizon, against a belief of +0.39. That gap is the optimiser's
> curse at eight deals: a candidate's mean over the deals carries an SE of 0.20, the best of two such means
> clears `mean − SE > 0` on noise, and the true effect is a tenth of the belief. Resolving a +0.03 effect per
> decision would take of the order of 350 deals — forty times the budget. The leaf evaluator is a design error,
> recorded as one: its card term charges a cashed set its six cards (a set is +1, the cards −0.9 at 0.15, a lock
> kept +0.5), so rollouts that claim score below rollouts that sit on a lock; the metric is optimised (+0.049 in
> its own units) and the sets go the other way (−0.53). Every form trades hit rate for what the rollout
> believes in, two to five points of it.
>
> **The rung's verdict: the pre-registered form is a no-op and does not go abroad; the lock-only leaf goes abroad as the
> fit's form, flagged post-hoc.** The pre-registered form fails both home markers (pairs −0.14 ± 0.25, true advantage
> +0.03 ± 0.03) and so does its control. The lock-only leaf — *a locked set is a set*, by the licence-rule fact §3.8b
> records — clears them as written, by a hair (true advantage +0.043, SE 0.020; pairs +0.16 ± 0.26, not behind), and it is
> the third setting of the leaf knobs, chosen after two read behind, so it carries a post-hoc flag: §3.8a's acceptance
> abroad, +2.00 on the twelve confirmation seeds against the base on the same tree, is the only number that can ship it.
> Cost unchanged at 96 ms. Whatever it reads, the finding stands: at this budget the search's per-decision signal is
> about a twentieth of its noise, the ranker's own alternatives are not better than its pick, and a search that could
> help would need a different candidate generator and a leaf that is not a rollout. §3.5c's untested cell is tested:
> the correct posterior does not make the search pay at 100 ms.

#### Abroad record — 2026-09-03: the lock-only leaf on the twelve confirmation seeds

`monet-v07-s` (MONET_SEARCH D 8 · C 3 · S 24 · z 1, guarded, `leafLock` 1, `leafCard` 0) against SESTINA v1.0, 1,200
games a cell, paired against the v0.4c base on the same seeds and the same tree (73bf8cd; identity at 90210 identical).
The search lanes ran four, then three, containers wide on a 12-CPU, 23.5 GB VM — the cells are slow (96 ms an ask)
and nine containers at once ran a bot out of memory, which is now a recorded limit of the bridge. `monet-v07/report.mjs`:

| seed | base | lock-only leaf | leaf − base |
|---|---|---|---|
| 1657910 | 36.17 | 33.83 | −2.33 |
| 2057008 | 32.67 | 35.17 | +2.50 |
| 2496080 | 34.67 | 36.83 | +2.17 |
| 3593118 | 37.67 | 35.42 | −2.25 |
| 3768516 | 37.50 | 33.58 | −3.92 |
| 5398011 | 34.83 | 36.00 | +1.17 |
| 5562102 | 30.92 | 34.92 | +4.00 |
| 6081385 | 35.92 | 34.33 | −1.58 |
| 6962430 | 35.67 | 35.58 | −0.08 |
| 8242985 | 35.17 | 35.33 | +0.17 |
| 9709672 | 34.75 | 35.17 | +0.42 |
| 9715909 | 33.00 | 34.42 | +1.42 |
| **pooled** | **34.91** | **35.05** | **+0.14** |

**Paired +0.14 points, SD 2.31, SE 0.67 (0.21 × SE), ahead on 7 seeds and behind on 5, against a floor of
+2.00: inside the floor; nothing ships from v0.7.** The lock-only leaf's home read (+0.16 ± 0.26) said as much, and the
marker said why: at eight deals the search's per-decision signal is a twentieth of its noise, and a locked set counted
as a set does not change what the ranker's own alternatives are worth. §3.5c's cell is closed: the correct posterior
does not make a 100 ms search pay, in either leaf.

### 3.8b Monet v0.8 — the determinized declare

#### Pre-registration — written 2026-09-03 after §3.8a's record and before any v0.8 cell

**What the record says.** Three facts, all read on the true deal at home while §3.8a was being closed:

1. **A locked set cannot be broken.** The licence rule (an ask needs a card of the half-suit, RULES_US54.md §3)
   means no opponent can ask into a set held wholly by one team, and a declaration names holders on the
   declarer's own team only. `scripts/probe-lockfate.mjs`, 200 v0.4c mirror games: 8.19 locks a game (both
   teams), **93.0% cashed whole, 1.0% gifted by a wrong declaration, 6.0% dead when the clinch ends the game.**
   A lock's only risk is the race. Between forming and being cashed a lock waits 44.7 events and 19.8 declare
   windows of its own team.
2. **Monet declares certainties.** On the bridge (a recorded v0.4c cell, 1,200 games) 96.6% of its declarations
   are certain or own-book claims; the EV claim fires 0.06 a game. The FishLab engine's lock-hold instrument
   reads Monet cashing a lock **9.0–9.8 events** after it forms and SESTINA **3.2–3.4**, on every recorded cell.
   §3.7's channel was real, then, but its value is not the sets a teammate could prove — those get cashed
   anyway, 93% of them — it is the *time*: under the clinch rule a sure set uncashed when the opponents reach
   five is a set lost, and a set cashed early is a step in the race.
3. **A determinization consensus reads locks the walk cannot locate.** `scripts/probe-consensus.mjs` (100 mirror
   games, 64 deals a window from `determinize.ts`'s sampler, every unresolved set the option seat holds a card
   of and does not claim): with the v0.4c posterior, window-sets where all 64 deals agree on the six holders
   0.50 a game, **100% right**; with the choice prior on (`choiceKappa` 1, `choicePrior` `count`, §3.6's knob)
   **1.20 a game at 100%**, and 1.13 a game at [0.9, 1) agreement 93.8% right; with κ 2.5, 1.22 a game at 97.5%
   and 5.28 a game at [0.9, 1) 90.2%. (These count a lock at every window it persists through; distinct locks
   are fewer.) The idea is SESTINA's own documented mechanism — a declaration on the agreement of its
   determinizations (`det=12` in its spec) — implemented here on FishAI's sampler and posterior.

**Mechanism.** At a declare window, after the certain claim and before the EV claim: D deals are sampled from
the seat's posterior; for every unresolved set the seat holds a card of (the certain claim's foreign and hoard
rules), the modal full assignment among the deals that put the set on this team, its share of the D deals
requested the *agreement* (failed draws count against it); the set with the highest agreement is declared with
those holders if the agreement is at least the bar. Knobs `consensusDet` (D; 0 or absent is byte identity —
`tests/bots/consensus.test.ts`) and `consensusBar` (absent is 1, unanimity). `lib/engine/bots/consensus.ts`;
the sampler moved from `lib/engine/search/` to `lib/engine/bots/determinize.ts`, inside the public-view
boundary it never crossed. Cost about a millisecond a window at D 64.

**Why this and not another ask-side change.** v0.5 sharpened the posterior and asks did not turn into sets
(asks are near the oracle's ceiling, §3.6c); v0.6 tried to let *teammates* prove sets and the asker cannot
see the lock (§3.7a); v0.7 searched the ask (§3.8a). The one decision none of them touched is the window's
own, taken on the seat's own posterior, and it is the decision the clinch rule prices.

**Forms.** F1: v0.4c + `consensusDet` 64 at unanimity, no choice prior. **F2 (the candidate): F1 with the choice
prior on (`choiceKappa` 1, `choicePrior` `count`).** F3: F2 at bar 0.95. F4: κ 2.5 at unanimity. F2 is what
goes abroad unless F1 reads as well (then F1, the smaller change); F3 and F4 are read beside them and go abroad
only if F2 fails at home and one of them clears.

**Markers at home.** (i) Consensus claims a game and their accuracy on the true deal
(`scripts/probe-handoff-declare.mjs --horizon 54`, which scores every window declaration by trace kind): a
consensus claim under **95%** right is a losing gamble against a lock that waits and gets cashed 93% of the
time, so the accuracy must clear that and the certain claim's own rate must not fall. (ii) Duplicate pairs
against v0.4c on the fit bank at 600 pairs: **the expectation is ahead by +0.20 or more** — the mechanism's
home ceiling is the 6% of locks that die at the clinch, about 0.5 sets a pair, and a read that is not a visible
fraction of it means the claims come too late to matter.

**Seeds.** Fit on six from `hashSeed("monet-v0.8-fit-6")`: **1040131 6238226 6457974 9867486 2523658 1497907**;
confirm at home and abroad on twelve from `hashSeed("monet-v0.8-confirm-12")`: **8718162 7308760 6281262
9492659 5628665 2751758 6520945 3420750 6055122 7723592 4637435 8159782** — §6.5's rule, no draw skipped, all
distinct from every seed this document names (checked by grep before they were written down).

**Acceptance.** Home markers first, in the order above. Abroad: the chosen form against SESTINA v1.0 on the
twelve confirmation seeds, paired against the v0.4c base on the same seeds and the same tree, **+2.00 win-rate
points or better**; the base lane is re-run in the same containers. Expectation: +1 to +3 points. The bound is
the bridge's 9-versus-3 lock hold: if every event of it were converted the gain would be of the order of a
third of a set a team-game, and nothing here can exceed what the posterior can prove.

#### Home record — 2026-09-03

**Two amendments before any cell was read as a verdict.** (1) The hook as first committed (56a3863) sampled its D
deals once per candidate set; it samples once per window since 0430402, the probe's own arithmetic. (2) The
pre-registered forms put the choice prior on the *asks* as well as the declare (`choiceKappa` is a knob of the
whole posterior), and at 100 pairs the asks' divergence buries the declare: k1 (the prior alone, §3.6's knob)
+0.01 ± 0.64, F2 +0.07 ± 0.65, F3 +0.03 ± 0.64, F4 −0.30 ± 0.63, against F1 (the consensus on the v0.4c posterior,
asks untouched) +0.06 ± 0.10 with a paired SD of 0.49 — the games are the same games but for the claims. So a
knob was added, `consensusKappa` (000154e): the choice prior for the posterior the *declare* samples from, and for
that only; every ask stays byte-identical to v0.4c (pinned), and duplicate pairs read the declare by itself. The
forms below are those; F2 as pre-registered is superseded by them and its 100-pair read stands above.

**The declare-only forms, 200 pairs on the first fit bank (1040131), paired against v0.4c:**

> | form | D | bar | κ (declare only) | paired set-diff | SE |
> |---|---|---|---|---|---|
> | d1 | 64 | 1 | — | +0.075 | 0.036 |
> | d2 | 64 | 1 | 1 | +0.095 | 0.044 |
> | d3 | 64 | 1 | 2.5 | +0.200 | 0.070 |
> | d4 | 64 | 0.95 | 1 | +0.155 | 0.065 |
> | d5 | 128 | 1 | 1 | +0.105 | 0.043 |
> | d6 | 64 | 0.90 | 2.5 | +0.250 | 0.141 |
>
> Every form ahead, and the more it claims the more it gains and the wider its read. The confirmation at 600 pairs,
> 100 on each of the six fit banks: **d2 +0.088 ± 0.046 (SE 0.023; every bank positive, +0.01 to +0.15); d3 +0.103 ± 0.062 (SE 0.032); d4 +0.130 ± 0.057 (SE 0.029; every bank positive, +0.01 to +0.19).**

**The marker** (`scripts/probe-handoff-declare.mjs --horizon 54`, 2,000 mirror games a form, every window declaration
scored on the true deal by trace kind; the base's certain claims are 4.30 a game at 100% and its EV claims 0.15 a game
at 84.1%):

> | form | consensus claims a game | right | certain claims a game (base 4.303) | EV claims a game (base 0.151, 84.1%) |
> |---|---|---|---|---|
> | d2 | **0.275** | **99.82%** (549 claims, one wrong) | 4.109 | 0.093, 76.3% |
> | d3 | 0.447 | 97.54% | 3.983 | 0.081, 73.9% |
> | d4 | 0.378 | 98.81% | 4.027 | 0.086, 76.2% |
> | d6 | 1.188 | 75.12% — fails the gate | 3.535 | 0.038, 72.7% |
>
> The consensus claims are certain claims made earlier — the certain claims fall by about what the consensus
> claims add, and the declarations a game and their accuracy over all kinds hold (d2: 7.612 a game at 98.90%
> against the base's 7.596 at 98.86%). d6, the widest form, is a losing gamble as the pre-registration said a
> claim under 95% would be, and its wide 200-pair read was that gamble's noise.
>
> And abroad, a 60-game pilot of the pre-registered F2 at seed 90210 (`monet-v08/pilot.log`): 10 consensus claims,
> 10 right, beside 158 certain claims — the path through the bridge is proven and the claim is as sound against
> SESTINA's deals as against Monet's.

> **Home verdict: the mechanism is real, sound and small.** Ahead on every fit bank at four standard errors, right
> 99.8% of the time, and worth +0.09 to +0.13 of a set a pair — under the +0.20 the pre-registration expected. The
> pool is the limit: 0.28–0.38 provable-but-unlocated locks a game, cashed some windows earlier, and the probe's
> ceiling (the 6% of locks that die at the clinch) is only reachable for the ones the posterior can prove. **d2**
> (D 64, unanimity, κ 1 on the declare alone) is the form abroad — launched on the probe's and the pilot's accuracy
> before this marker landed, the marker confirming it — as `monet-v08-f2` on the twelve confirmation seeds beside
> the base on the same tree (000154e). The expectation from the home read is inside the +2.00 floor: v0.4c's λ
> read about +0.4 a pair at home for +2.4 points abroad, and +0.09 is a fifth of that. If the race against SESTINA
> prices an early cash higher than mirror play does, the number will say so; if it reads inside the floor, that
> is the result and nothing ships. d4 (bar 0.95) is the one alternative worth a second abroad read if d2 lands
> near the floor.

#### Abroad record — 2026-09-03: nothing ships from v0.8

d2 (`monet-v08-f2`: `consensusDet` 64, `consensusBar` 1, `consensusKappa` 1) against SESTINA v1.0 on the twelve
confirmation seeds, 1,200 games a cell, paired against the v0.4c base on the same seeds and the same tree (000154e;
identity at 90210 identical, engine lines and calibration). `monet-v08/report.mjs`:

| seed | base | d2 | d2 − base |
|---|---|---|---|
| 2751758 | 34.50 | 34.25 | −0.25 |
| 3420750 | 34.17 | 34.50 | +0.33 |
| 4637435 | 33.75 | 33.50 | −0.25 |
| 5628665 | 33.75 | 33.58 | −0.17 |
| 6055122 | 36.42 | 36.92 | +0.50 |
| 6281262 | 33.92 | 34.25 | +0.33 |
| 6520945 | 36.42 | 36.67 | +0.25 |
| 7308760 | 38.50 | 38.42 | −0.08 |
| 7723592 | 33.33 | 33.58 | +0.25 |
| 8159782 | 37.50 | 37.67 | +0.17 |
| 8718162 | 34.67 | 34.83 | +0.17 |
| 9492659 | 33.92 | 33.67 | −0.25 |
| **pooled** | **35.07** | **35.15** | **+0.08** |

**Paired +0.083 points, SD 0.27, SE 0.08 (1.1 × SE), ahead on 7 seeds and behind on 5, against a floor of ±2.00.**
Inside the floor by a wide margin; nothing ships. The mechanism did what it does at home: **1,885 consensus claims
in 14,400 games (0.13 a game), 1,877 right (99.58%)**, the certain claims down from 37,595 to 34,355 as some of them
were cashed earlier by the consensus; sets a game 3.976 against 3.977, ask accuracy 53.57 against 53.55, and the
lock-hold instrument 9.42 events against 9.50. The paired SD of 0.27 points is the tightest this document has
recorded — the asks are byte-identical and the games diverge only at a consensus claim — so the read is exact for
its size: the sets the consensus cashes early would have been cashed anyway, before anyone's clinch, and the race
does not price the earlier cash.

**What the rung leaves on the record.** The 9-versus-3 lock hold is not a proving problem. A 64-deal consensus
on the seat's posterior finds a tenth of a set a game that the walk cannot locate, at 99.6%, and moves the hold
by 0.08 events; SESTINA's three-event cash is not made of locks proved from the public log, at least not by any
posterior this codebase can sample. Four rungs have now tested the four levers the design named — belief (§3.6),
communication (§3.7), search (§3.8a) and the declare (§3.8b) — and each is real and small or null against the
same opponent on the same seeds. The next rung, if there is one, is not a mechanism but an attribution: where,
on full-information records of Monet against SESTINA, the 1.2 sets a game go — and that is a decision for the
owner (§8.3).

### 3.8c The attribution study — where the sets go

**Decision 8.3 row 8, taken by the owner on 2026-09-03: (a).** Not a mechanism. Full-information
records of Monet v0.4c against SESTINA v1.0 from the bridge, read by one instrument that splits
the set differential four ways and adds the ask policy's counterfactual at the other side's
decisions. What comes out is a ranked list of where SESTINA's extra set a game comes from, and
the next rung is chosen from that list by the rule written below — before the tables are read.

**The data.** Their engine keeps a per-game event trace in memory and writes none of it (no flag,
no subcommand; `v7decide --dump` is per decision and carries no hands). `fish_record` is the
split fork (§3.2's counters-only instrument) plus a `--record=FILE` flag on `match` that
appends, after each game, the deal and the trace as one JSON line: ground truth read after the
game, changing no branch a policy can see, and controlled the way the split fork was — its whole
cell output must equal `fish_split`'s on the same cell. Read 2026-09-03 on 20 deals × 6 at seed 90210 against SESTINA: identical, timing lines excluded (`monet-attr/step0.log`; 121 record lines). The record then loaded on the host with every check passing, and the counterfactual at Monet's own decisions agreed with the bridge play at 100% of its asks — the mirror cell (Monet against Monet in their engine, 120 games) at 100% on both sides — so the reconstruction is exact abroad as well as at home. The records are their
engine's output — data under §9 — and live in the scratchpad; the loader and the instrument are
ours and are committed (`scripts/attribute.mjs`).

**The instrument, validated at home before a record was read.** On mirror games in our own engine
the walk reconstructs every seat's view from the deal and the public log alone, and with the
game's own decision seeds the counterfactual agrees with the play at every ask decision of both
sides — 100% under `--validate`, which makes a disagreement fatal — while every recorded hit is
checked against the deal the walk tracks. Abroad the loader checks every event against the
engine's own public hand counts and every declare against its half-suit awards, so a record whose
events and deal disagree is refused, not attributed. Everything is read over the pre-clinch
record only: `us54` ends at five, the host plays on, and what it plays after the clinch is not
the game.

**The four splits**, per side and per game:

1. **Sets by the deal's split.** For each half-suit, how many of its six cards side A was dealt
   (0–6) against who took it and how — cashed by a correct declare, gifted by the other side's
   wrong one, or open at the clinch (who led it; whether it was locked). The decomposition is A − B
   per game by bucket: A majority (4–6), even (3), B majority (0–2).
2. **Asks.** Asks a game and the hit rate; the share whose target was public-certain (a prior hit
   put the card there) and the hit rate on the uncertain rest; by phase (0–1 / 2–3 / 4+ sets
   resolved); the share of decisions at which a hit was available on the true deal and the hit
   rate at those. And **the counterfactual**: at every ask decision of either side, what Monet
   v0.4c asks from the same hand and the same public log, scored on the true deal beside the
   actual ask — agreement, the counterfactual's hit rate against the actual's at the same points,
   and both on the disagreements alone.
3. **Tempo.** Share of all asks, runs a game and asks per run, hits a game, passes.
4. **Declares and locks.** Declares a game, accuracy, gifts, forced declares; locks formed a game
   and their fates (cashed / broken / gifted / open at the clinch) and the lock hold in events.

**The cells** — every one recorded, 200 deals × 6 rotations = 1,200 games a seed, one container in
sequence, about 25 minutes of bridge:

> | cell | arms | seeds | for |
> |---|---|---|---|
> | S | `monet-v08-base` (v0.4c, every knob off, on the 000154e export whose `lib/` tree is byte-identical to main's) against SESTINA v1.0 | twelve fresh, §6.5's rule from `monet-attribution-2026-09-03`: 8083995 4646803 7167747 7149252 3737595 9459020 2922748 5753167 8102326 9719629 2543289 1225735 | the study |
> | SS | SESTINA against SESTINA | the same twelve | SESTINA's own baseline for every figure |
> | MM | Monet against Monet, in their engine | the first two | the same figures in their engine beside the home mirror in ours — the engine-equivalence check of the whole pipeline — and the counterfactual at Monet's own decisions abroad, which agrees with the play up to seed-dependent tie-breaks |
> | home | v0.4c against v0.4c, and v0.4c against v0.2, 2,000 games each in our engine | `hm-*`, `hv2-*` | the mirror's shape, and the shape of a KNOWN gap (v0.2 is eight points behind on the bridge) on record before the unknown one is read |

**Readouts, and what each points to** — written now so the decision is not read off the tables
after the fact:

- **R1, where the set goes.** The bucket carrying most of SESTINA's margin. A-majority sets ending
  with B → the conversion (asks or defence); steals from B's majority → SESTINA's asks; gifts →
  the declare bar (§8.3 (c) becomes the rung); open at the clinch → the race and the declare's
  timing.
- **R2, the counterfactual at SESTINA's decisions.** If SESTINA's actual asks hit more often than
  Monet's counterfactual at the same points by more than the paired standard error, SESTINA
  selects better asks from the same public information — the lever is the ask scorer, and §3.6c's
  oracle ceiling bounds how much of that is knowledge. If they are level, the ask policy is not the
  gap and the difference is positional. And the third case, which the control cell showed before
  this was fixed (120 games: the counterfactual 62.9% against SESTINA's actual 54.8% at the same
  points, and SESTINA 67.5% of the games): if SESTINA's asks hit LESS than Monet's counterfactual
  and SESTINA still takes more sets, the hit chance is not the value of an ask — what a miss reveals,
  what a hit denies, where the turn goes — and the rung is an ask valuation beyond the hit, which
  §3.8a's search was the first attempt at with the wrong leaf. The control's 120 games at seed
  90210 were read before this paragraph was written; the study's twelve seeds were not.
- **R3, tempo.** A share of asks below SESTINA's by more than two points at equal hit rates puts the
  difference in who is asked and when the turn moves, not in the hits — a targeting rung.
- **R4, declares.** Gifts above SESTINA's rate → the bar; locks broken or open at the clinch that
  SESTINA would have cashed → timing (§3.8b said the hold is not a proving problem; this says
  whether it costs sets at all).
- **The rule.** The next rung is the readout whose bucket carries the largest share of the margin,
  written into §8.3 as row 9 with its numbers. If no bucket carries more than a third of it, the
  answer is (b): v0.4c is v1.0's vector and §3.9's acceptance runs as written.

**Acceptance of the study itself.** The control identical; the loader's checks pass on every game
of every cell; the MM cell's side figures inside the home mirror's range; and every seed listed.

#### Record — 2026-09-03

Every cell ran as pre-registered (`monet-attr/step1.log`): S, SS on the twelve seeds, MM on the first
two, 1,200 games each, one container in sequence, 16 minutes; every record loaded with every check
passing (14,400 + 14,400 + 2,400 games; `report.sh` → `report-s/ss/mm.txt`). The acceptance of the
study itself holds: the control identical (above), the loader's checks clean on every game, and the MM
cell inside the home mirror's range on every side figure — sets a game 3.78 against 3.81/3.85, hit
58.1% against 57.9/58.7%, declares 3.78 a game at 99.1% against 3.81/3.85 at 98.7/98.9%, locks 4.04 a
game cashed 92.7% with a hold of 7.86 events against 4.06/4.09, 92.7/93.0% and 7.83/7.70 — with the
counterfactual at Monet's own decisions agreeing with the bridge play at 100.0% of 102,000 asks. The
two engines play the same game, and the instrument reads it the same way in both.

**S — Monet v0.4c against SESTINA v1.0, twelve seeds, 14,400 games.** Per seed (A = Monet; the gap
columns are A − B sets a game by the deal's split; the last three are at SESTINA's ask decisions —
what Monet would have asked there, scored on the true deal, against what SESTINA asked):

> | seed | A win | sets A | sets B | A-maj | even | B-maj | hit A | hit B | cf hit | SESTINA's | agree |
> |---|---|---|---|---|---|---|---|---|---|---|---|
> | 1225735 | 33.00% | 3.187 | 4.263 | +0.544 | −0.388 | −1.233 | 52.49% | 55.78% | 62.14% | 55.78% | 42.8% |
> | 2543289 | 34.58% | 3.198 | 4.211 | +0.602 | −0.415 | −1.199 | 52.51% | 55.79% | 62.80% | 55.79% | 42.8% |
> | 2922748 | 35.00% | 3.232 | 4.245 | +0.646 | −0.399 | −1.259 | 52.06% | 55.17% | 61.54% | 55.17% | 42.6% |
> | 3737595 | 36.92% | 3.289 | 4.197 | +0.692 | −0.407 | −1.192 | 53.05% | 55.98% | 62.90% | 55.98% | 43.2% |
> | 4646803 | 35.08% | 3.295 | 4.197 | +0.654 | −0.347 | −1.209 | 52.39% | 55.35% | 62.25% | 55.35% | 42.6% |
> | 5753167 | 33.08% | 3.212 | 4.291 | +0.643 | −0.430 | −1.292 | 52.30% | 55.57% | 62.63% | 55.57% | 42.9% |
> | 7149252 | 34.50% | 3.240 | 4.244 | +0.525 | −0.381 | −1.148 | 52.86% | 56.02% | 62.91% | 56.02% | 43.2% |
> | 7167747 | 35.00% | 3.209 | 4.253 | +0.637 | −0.436 | −1.245 | 52.38% | 55.94% | 63.11% | 55.94% | 43.2% |
> | 8083995 | 33.00% | 3.152 | 4.285 | +0.612 | −0.463 | −1.281 | 52.08% | 55.58% | 62.49% | 55.58% | 42.6% |
> | 8102326 | 33.83% | 3.208 | 4.251 | +0.594 | −0.442 | −1.195 | 53.00% | 56.21% | 62.70% | 56.21% | 42.8% |
> | 9459020 | 35.08% | 3.202 | 4.238 | +0.581 | −0.437 | −1.181 | 51.93% | 55.17% | 62.23% | 55.17% | 42.4% |
> | 9719629 | 32.25% | 3.174 | 4.315 | +0.567 | −0.418 | −1.289 | 51.86% | 55.48% | 61.99% | 55.48% | 42.7% |
> | **mean (SE over seeds)** | **34.28% (0.37)** | 3.22 | 4.25 | **+0.608 (0.014)** | **−0.414 (0.009)** | **−1.227 (0.013)** | 52.41% (0.12) | 55.67% (0.10) | **62.48% (0.13)** | 55.67% | 42.8% |

Sets a game A − B: **−1.033, SE 0.021**; SESTINA's win rate is the ladder's 65.7%. The pooled tables:

> | A cards of six | sets/g | A cashed | A gifted | B cashed | B gifted | open at the clinch (A lead / B lead / locked) | P(A takes) | A − B |
> |---|---|---|---|---|---|---|---|---|
> | 0 | 0.11 | 0.00 | 0.01 | 0.07 | 0.00 | 0.04 (0.00 / 0.04 / 0.04) | 8.8% | −0.062 |
> | 1 | 0.76 | 0.07 | 0.02 | 0.49 | 0.00 | 0.18 (0.01 / 0.16 / 0.04) | 15.5% | −0.398 |
> | 2 | 2.10 | 0.47 | 0.02 | 1.25 | 0.00 | 0.36 (0.07 / 0.26 / 0.03) | 28.0% | −0.767 |
> | 3 | 3.06 | 1.10 | 0.02 | 1.53 | 0.00 | 0.40 (0.15 / 0.06 / 0.02) | 42.2% | −0.414 |
> | 4 | 2.10 | 1.01 | 0.01 | 0.77 | 0.01 | 0.30 (0.27 / 0.03 / 0.09) | 56.8% | +0.245 |
> | 5 | 0.76 | 0.44 | 0.00 | 0.11 | 0.01 | 0.19 (0.19 / 0.00 / 0.13) | 78.8% | +0.326 |
> | 6 | 0.11 | 0.04 | 0.00 | 0.00 | 0.00 | 0.06 (0.06 / 0.00 / 0.06) | 89.4% | +0.037 |
> | **A majority 4–6** | 2.97 | 1.50 | 0.02 | 0.88 | 0.02 | 0.56 (0.52 / 0.03 / 0.28) | 62.6% | **+0.608** |
> | **even 3** | 3.06 | 1.10 | 0.02 | 1.53 | 0.00 | 0.40 (0.15 / 0.06 / 0.02) | 42.2% | **−0.414** |
> | **B majority 0–2** | 2.97 | 0.54 | 0.04 | 1.81 | 0.00 | 0.58 (0.09 / 0.46 / 0.10) | 24.4% | **−1.227** |
> | all | 9.00 | 3.13 | 0.08 | 4.22 | 0.03 | 1.53 (0.76 / 0.54 / 0.41) | 43.1% | −1.033 |
>
> | side | asks/g | hit | public-certain share | hit on the uncertain | early / mid / late | a hit was available | hit when available | cf agree | cf hit vs actual, same points | on the disagreements: cf / actual (n) |
> |---|---|---|---|---|---|---|---|---|---|---|
> | Monet | 39.1 | 52.4% | 19.0% | 41.3% | 48.1% / 52.4% / 56.7% | 98.6% | 53.2% | 100.0% | 52.4% vs 52.4% | — |
> | SESTINA | 41.7 | 55.7% | 20.2% | 44.5% | 51.8% / 56.2% / 59.1% | 98.6% | 56.4% | 42.8% | **62.5% vs 55.7%** | 53.0% / 41.1% (343,525) |
>
> | side | asks by the side's holding of the asked set, 1 / 2 / 3 / 4 / 5 cards: share, hit | the counterfactual's: share, hit |
> |---|---|---|
> | Monet | 5.4% 90.4% · 14.7% 76.6% · 24.0% 61.8% · 25.7% 50.2% · 30.2% 28.4% | the same (it is the play) |
> | SESTINA | 6.0% 88.0% · 15.2% 76.6% · 23.6% 63.7% · 25.3% 53.4% · 29.9% 34.1% | 7.8% 94.5% · 16.1% 86.2% · 23.9% 71.0% · 25.4% 56.8% · 26.9% 36.7% |
>
> | side | share of asks | runs/g | asks per run | hits/g | declares/g | right | gifts/g | locks formed/g | cashed | open at the clinch | lock hold (events) |
> |---|---|---|---|---|---|---|---|---|---|---|---|
> | Monet | 48.4% | 18.88 | 2.07 | 20.49 | 3.16 | 99.1% | 0.03 | 3.46 | 90.5% | 8.7% (0.30/g) | 7.84 |
> | SESTINA | 51.6% | 19.02 | 2.19 | 23.22 | 4.30 | 98.1% | 0.08 | 4.37 | 96.7% | 2.4% (0.10/g) | 4.34 |

**SS — SESTINA against itself, 14,400 games**, the baseline for its figures: sets 3.79 a side, 1.43
open at the clinch, 92.6 events to it; asks 41.4 a game at **49.4%** (Monet's mirror: 58.1%), public-
certain share 16.7% (Monet's: 22.2%), by phase 44.8 / 48.6 / 54.7% (Monet's: 56.9 / 59.0 / 58.4%);
21.4 runs a game of 1.94 asks (Monet's: 17.3 of 2.33); a majority is converted 70.9% (Monet's mirror:
68.2%); declares 3.79 a game at 97.2% with 0.11 gifts (Monet's: 99.1%, 0.03); locks 3.85 a game, 95.6%
cashed, 3.4% open at the clinch, hold **4.86** events (Monet's: 4.04, 92.7%, 6.5%, 7.86). And at
SESTINA's decisions against itself, Monet's counterfactual would hit **54.7% against SESTINA's 49.4%**
(SE 0.09 over seeds), agreeing with 39.6% of its asks.

**Home, the known gap** — v0.4c against v0.2, 2,000 games: 53.5% and +0.32 sets a game for v0.4c,
from every bucket (+1.016 / +0.104 / −0.800 against the mirror's +0.922 / −0.040 / −0.928); at v0.2's
decisions the counterfactual hits **59.7% against v0.2's 57.4%**, agreeing 79.6% of the time. That is
what a better hit-picker looks like in these tables: a small counterfactual surplus and a high
agreement.

**The readouts.**

- **R1.** Of SESTINA's 1.09 extra cashed sets a game, the even sets carry **0.43 (40%)** — a 3–3 deal
  is won by SESTINA 58 to 42 — SESTINA's steals from Monet's majorities 0.34 (0.88 of Monet's 2.97
  majority sets against Monet's 0.54 of SESTINA's; 31%) and its better conversion of its own 0.31
  (1.81 of 2.97 against Monet's 1.50; 29%). Gifts run the other way (Monet receives 0.08 a game,
  SESTINA 0.03). Open at the clinch, Monet leads 0.76 sets to SESTINA's 0.54 and holds 0.30 locked
  and uncashed to SESTINA's 0.10 — the game ends while Monet is still collecting. The pre-registration
  named four mechanisms and left the even bucket unnamed; it is the contested race, and the largest
  bucket by the rule, above a third.
- **R2, the third case, decisively.** At SESTINA's own decisions Monet's counterfactual would hit
  **62.5% against SESTINA's 55.7%** — +6.81 points, SE 0.08 over twelve seeds, the same on every seed
  (+6.2 to +7.2), in every holding bucket (1 card: 94.5 vs 88.0; 2: 86.2 vs 76.6; 3: 71.0 vs 63.7;
  4: 56.8 vs 53.4; 5: 36.7 vs 34.1), and in SESTINA's own mirror (54.7 vs 49.4). SESTINA agrees with
  Monet's pick 42.8% of the time, and where they differ SESTINA's ask hits 41.1% to the pick's 53.0%.
  SESTINA leaves a quarter of the available hit chance on the table at every decision and wins
  65.7% of the games. **The hit chance is not the value of an ask.** What SESTINA's asks buy shows in
  the same tables: its positions are richer — the same Monet policy hits 52.4% on Monet's own
  positions and 62.5% on SESTINA's — and they get richer as the game goes (SESTINA's hit rate rises
  51.8 → 56.2 → 59.1% by phase against itself 44.8 → 48.6 → 54.7%; Monet's is flat at home, 56.9 →
  59.0 → 58.4%); its play leaves fewer public-certain asks for anyone (16.7% of asks in its mirror
  against 22.2% in Monet's) and takes back more of what Monet's hits announce (the 0.88 steals). A hit
  publishes a card's location to the table and a miss publishes a licence; SESTINA prices both and
  Monet's scorer (`wHit` 90 of a 120-point scale, §3.2) prices neither.
- **R3.** Monet's share of asks is 3.2 points below SESTINA's (48.4 / 51.6%) with runs a game equal
  (18.9 / 19.0) and asks per run 2.07 / 2.19 — the share follows the hit rates (52.4 / 55.7%), which
  are not equal, so R3's condition is not met and tempo is not a lever of its own.
- **R4.** Gifts are not the problem (Monet 0.03, SESTINA 0.08 a game). The hold is 7.84 events
  against 4.34 and 0.30 locked sets a game are still in Monet's hands when the game ends against
  SESTINA's 0.10: the timing lever is bounded at about 0.2 sets a game, and §3.8b measured the
  provable part of it at +0.08 points. What is left is the unprovable part — SESTINA declares at
  98.1% and cashes 4.3 events after the lock, Monet at 99.1% and 7.8 — which is §8.3 (c)'s risk bar.

**The rule, applied.** The largest bucket is the even sets at 40%, above a third, so (b) does not
follow. The mechanism behind a contested race is R2's: the ask's value beyond its hit — information
kept and information given away — and that is the rung, written into §8.3 as row 9 with (c) as the
second rung, bounded by R4. Nothing in this study is a mechanism; nothing ships from it; the numbers
are the deliverable.

### 3.8d Monet v0.9 — the priced ask

**Decision 8.3 row 9, taken by the owner on 2026-09-03: build v0.9 by the recommendation.** Two
terms beside the hit chance in the ask ranker, each a Monet-only knob that is byte identity when
absent, fitted against SESTINA directly because that is the opponent the terms are for and a cell
costs a minute, then confirmed on fresh seeds at the floor.

**The facts, all from §3.8c's records and two readouts added to the instrument since (14,400 games,
twelve seeds):**

- At SESTINA's own ask decisions Monet v0.4c's pick would hit 62.5% against SESTINA's 55.7%. Of that
  6.8-point surplus, **4.6 points are sure misses SESTINA plays and Monet would not**: SESTINA asks
  for a card that is on its own side of the table 26.1% of the time against the pick's 21.5% —
  7.3% of its asks are into a set its team already holds entirely (Monet 8.9% at its own decisions,
  5.7% for the pick at SESTINA's), the rest a card a teammate holds. The remaining 2.2 points are
  live asks of lower probability. So SESTINA's low hit rate is two things: asks it cannot know are
  dead, and asks it prefers although they will probably miss.
- **A hit is not kept.** Monet's hits are taken back before the set resolves **41.0%** of the time,
  SESTINA's **31.9%**; a Monet hit ends in a set Monet cashes 62.4% of the time, a SESTINA hit
  75.6%. In the mirrors the rates are 38.2% (Monet) and 33.8% (SESTINA). A miss costs both sides
  the same: the other side's run after a miss is 2.09 asks / 1.12 hits against 2.02 / 1.04, it opens
  with a certain take-back 17.1% against 20.7%, and neither side chooses safer targets than the
  other (the danger of the chosen target 0.90 against 0.92; §3.8c's pick would choose 0.93).
- FishLab's own attribution of SESTINA v1.0 (their holdout lattice, read as a finding) names as its
  largest component a linear term that rewards asks likely to miss into half-suits the opponents
  dominate and whose ownership is still open; under it the acting team's ask accuracy falls, its
  declaration accuracy falls, and it claims more half-suits and cashes its locks sooner — their
  summary is that it "plays a worse game by its own KPIs" (FishLab, ADVERSARIES.md) and wins. Their
  sweeps found ask accuracy anti-correlated with strength near the optimum, and a fit whose
  objective was hit rate lost. Nothing of theirs is copied; the term below is that idea in this
  ranker's units, and the exposure term is this document's own reading of the take-back rows.

**The mechanism** (`lib/engine/bots/priced.ts`; the hook in `pickAsk`, gated below every certain
hit exactly as the concession terms are, so "certain hits first" survives and a certain hit pays
neither term):

- **`contest`** — the credit on the miss branch: `contest · wHit · (1 − p) · oppMass/6 ·
  ambiguous/6` for an ask into an unresolved set, where `oppMass` is the opponents' expected
  share of the set on the seat's marginal table (certain holders count one) and `ambiguous` the
  cards of it the seat cannot place. Zero for a certain hit.
- **`exposure`** — the charge on the hit branch: `exposure · wHit · p · risk`, with
  `risk = min(1, oppAfter) · (1 − closeChance)`: `oppAfter` the expected cards of the set still
  with opponents after the hit (a licence they keep), `closeChance` the product over the set's
  other unplaced cards of the best single-ask chance of taking each (the chance to run the set out
  in one turn), and `risk` 0 when the hit would lock the set. Uncertain asks only.
- Both are computed from the seat's public knowledge (the marginal table and the certain holders);
  `tests/bots/priced.test.ts` pins identity at 0 or absent, the bounds and signs, certain-first
  with both knobs on, liveness, determinism, and `validateStyle`.

**The fit, abroad, pre-registered.** Every cell is 200 deals × 6 rotations = 1,200 games against
SESTINA v1.0 on the v0.9 tree export, the base arm (v0.4c, every knob off) on the same seeds and the
same tree, recorded with `fish_record` so the markers come from the same games. Fit seeds, three,
drawn by §6.5's rule from `monet-v0.9-2026-09-03`: **2534720 1361408 5981661**. Arms:

> | arm | override | for |
> |---|---|---|
> | base | — | the pair |
> | c1 / c2 / c3 | `contest` 0.15 / 0.3 / 0.6 | the contest dose |
> | x1 / x2 | `exposure` 0.3 / 0.6 | the exposure dose |
> | cx | `contest` 0.3 + `exposure` 0.3 | both |

The chosen arm is the one with the best mean paired gain over the three fit seeds, provided it is
positive on at least two of them; if none is, the pair of doses nearest the best is not re-fitted —
v0.9 closes as measured. Home duplicate pairs against v0.4c (100 on `home-a` per dose, then 600
for the chosen arm) are **reported, not gating**: the terms price an opponent that takes cards
back and probes contested sets, and the mirror is not that opponent.

**The confirmation.** The chosen arm against SESTINA on twelve fresh seeds, drawn with the fit
seeds from the same label: **4566970 1199342 6316791 2547589 4418288 9925819 5348261 6105833
5507420 9426818 9607741 6361645**, paired against the base on the same seeds and tree, acceptance
**+2.00 points** as every rung before it. Every seed listed, the SD published.

**The markers**, read from the confirmation records by the attribution instrument, expected if the
mechanism does what the facts say and recorded either way: Monet's hit rate **falls** (the pick at
its own decisions, with v0.4c as the counterfactual, would hit more than it plays — SESTINA's
signature, the reverse of every rung before); the share of its hits taken back falls from 41%;
the share of its hits ending in a cashed set rises from 62%; the even-split sets move toward 50%;
the lock hold is unchanged. A win-rate gain without these is a gain this document cannot explain
and says so.

**Amendment, 2026-09-03, written after the pre-registered fit and before any of its cells — the
dose extension.** The pre-registered ladder topped out at 0.6 on both knobs and the response was
monotone to the top: on the three fit seeds, paired against the base, `contest` 0.15 / 0.6 read
+0.36 / +5.83 and `exposure` 0.6 read +3.31 (0.3 and the joint 0.3 + 0.3 inside a point). A ladder
whose best rung is its last has not found the dose. So, as a **labelled extension** and not a
re-fit of the pre-registered arms: `contest` 1.0 / 1.5 / 2.5 (c4 / c5 / c6), `exposure` 1.0 (x3),
and the joints 0.6 + 0.6 (cx2) and 1.0 + 0.6 (cx3), on the same three fit seeds against the base
cells already run. The pre-registered pick (the best of the original ladder) is confirmed on the
twelve confirmation seeds exactly as written above. The best extension arm — if it beats the
pre-registered pick on the fit seeds by at least +1.0 paired — is confirmed separately on **twelve
new fresh seeds**, drawn by §6.5's rule from `monet-v0.9-ext-2026-09-03`: **5682873 5690135
6007102 4920114 7140858 4334282 8816427 6848576 8516315 2344938 9677918 7951876**, paired against
the base on those seeds, acceptance +2.00, the same markers. v0.9 ships as the best arm that
cleared its own confirmation on its own fresh seeds; a fit-seed lead that does not reproduce on
fresh seeds is reported as that and does not ship.

#### Record — 2026-09-04

**v0.9 ships as v0.4c plus `contest: 0.6`. It is the first rung after v0.4c to clear the floor
abroad: +4.04 paired against v0.4c on the twelve pre-registered seeds against SESTINA v1.0, ahead
on all twelve.** Registered as `monetPolicy('v0.9')`; the lobby's Monet entry follows the registry.
Every cell 200 deals × 6 rotations = 1,200 games, both arms on the same tree export (commit
`035c6c9`, lib md5 `1430131d…`), the base arm proven byte-identical to the recorded v0.4c cell at
seed 90210 before a fresh seed was spent, every game recorded.

**The fit (three seeds, paired against the base's 33.25%).** The pre-registered ladder, then the
amendment's extension on the same seeds and base cells:

> | arm | override | 1361408 | 2534720 | 5981661 | paired mean | SD | ahead |
> |---|---|---|---|---|---|---|---|
> | c1 | `contest` 0.15 | −0.50 | +0.33 | +1.25 | +0.36 | 0.88 | 2 of 3 |
> | c2 | `contest` 0.3 | −2.33 | +0.17 | +0.92 | −0.42 | 1.70 | 2 of 3 |
> | **c3** | **`contest` 0.6** | **+5.83** | **+5.25** | **+6.42** | **+5.83** | **0.58** | **3 of 3** |
> | x1 | `exposure` 0.3 | −1.42 | +1.08 | 0.00 | −0.11 | 1.25 | 1 of 3 |
> | x2 | `exposure` 0.6 | +1.83 | +4.33 | +3.75 | +3.31 | 1.31 | 3 of 3 |
> | cx | 0.3 + 0.3 | +0.42 | +1.08 | +1.17 | +0.89 | 0.41 | 3 of 3 |
> | c4 *(ext.)* | `contest` 1.0 | +2.00 | +2.25 | +4.58 | +2.94 | 1.42 | 3 of 3 |
> | c5 *(ext.)* | `contest` 1.5 | +3.83 | +2.42 | +7.00 | +4.42 | 2.35 | 3 of 3 |
> | c6 *(ext.)* | `contest` 2.5 | −1.08 | +1.00 | +4.17 | +1.36 | 2.64 | 2 of 3 |
> | x3 *(ext.)* | `exposure` 1.0 | −1.17 | +3.08 | +3.75 | +1.89 | 2.67 | 2 of 3 |
> | cx2 *(ext.)* | 0.6 + 0.6 | +6.25 | +7.00 | +6.25 | +6.50 | 0.43 | 3 of 3 |
> | cx3 *(ext.)* | 1.0 + 0.6 | +6.00 | +5.17 | +6.67 | +5.94 | 0.75 | 3 of 3 |

The pre-registered rule picked c3. The contest dose peaks at 0.6 and falls away by 2.5; the
exposure dose is worth +3.31 alone at 0.6 and inside the noise at 1.0. The amendment's rule
closed the extension: the best extension arm, the joint 0.6 + 0.6, leads c3 by +0.67 on the fit
seeds (+0.42 / +1.75 / −0.17), under the +1.0 bar written before its cells ran, so it earned no
second confirmation and the exposure charge stays off the vector. It is the forward bank: a
candidate for its own rung with its own fresh seeds, not a knob to turn on the strength of a
fit-seed lead.

**The confirmation (twelve fresh seeds, contest 0.6 against the base, 14,400 games a side).**

> | seed | base | v0.9 | paired |
> |---|---|---|---|
> | 4566970 | 34.58 | 40.92 | +6.33 |
> | 1199342 | 33.58 | 39.25 | +5.67 |
> | 6316791 | 35.75 | 39.33 | +3.58 |
> | 2547589 | 33.42 | 39.08 | +5.67 |
> | 4418288 | 36.08 | 39.25 | +3.17 |
> | 9925819 | 36.50 | 38.25 | +1.75 |
> | 5348261 | 34.42 | 37.50 | +3.08 |
> | 6105833 | 33.17 | 39.42 | +6.25 |
> | 5507420 | 36.08 | 38.17 | +2.08 |
> | 9426818 | 36.50 | 39.00 | +2.50 |
> | 9607741 | 34.00 | 38.67 | +4.67 |
> | 6361645 | 34.42 | 38.17 | +3.75 |
> | **mean** | **34.88** | **38.92** | **+4.04** (SD 1.63, SE 0.47; ahead on 12 of 12) |

Against the floor of +2.00 it clears by more than four standard errors; against §3.9's v1.0 bar
it does not (38.9% is not 50%). The base's 34.88% over these seeds sits with §3.8c's 34.28% and
§3.4c's 35.12% over other seeds — the same v0.4c. Their engine's own markers, means over the
twelve cells: ask accuracy 55.28% from 53.66%, declarations 4.08 a game from 3.90 at 97.9% right
from 98.3%, lock hold 6.75 events from 9.41, the calibration bias +0.007 from +0.021. At home,
600 duplicate pairs on `home-a` (reported, not gating, as pre-registered): +0.28 ± 0.28 sets a
pair for contest 0.6 (52.9% of pairs), +0.24 ± 0.24 for exposure 0.6 — the mirror does not price
the terms the way SESTINA does, which is the reason the fit ran abroad.

**The markers, read from the confirmation records by §3.8c's instrument (v0.9 against the base,
14,400 games each; the counterfactual is v0.4c at v0.9's own decisions).** Two of the five
pre-registered markers came in as written; the document said it would say so, and does:

> | marker | pre-registered | base | v0.9 | as written? |
> |---|---|---|---|---|
> | Monet's hit rate | falls, below its v0.4c counterfactual | 52.5% | 54.4% (counterfactual 54.1%) | **no** — it rose, and sits 0.3 above the counterfactual |
> | Monet's hits later taken back | falls from 41% | 41.0% | 43.4% | **no** — it rose |
> | Monet's hits ending in a cashed set | rises from 62% | 62.6% | 63.5% | barely |
> | the even sets, P(Monet takes) | toward 50% | 42.0% (gap −0.415) | 46.1% (gap −0.206) | **yes** |
> | lock hold (events, cashed) | unchanged | 7.90 | 5.93 | **no** — it fell |

What the records show instead, in the order the numbers carry it:

- **The contest credit moves 15.2% of Monet's asks (91,304 of them), at the decisions where the
  greedy pick is poor.** At those decisions v0.4c's pick would hit 22.4%; the priced ask hits
  24.4%. They are not worse asks; they are placed elsewhere: into sets where Monet holds one to
  three cards (48.6% of its asks from 44.0%) and away from the five-card closing asks (25.8% from
  30.3%), which hit 28.5% and, on a miss, hand the turn over with the set exposed. Its sure misses
  — asks into a set its own side already holds entirely — fall to 5.9% from 8.9%.
- **Monet keeps the turn longer.** 41.7 asks a game from 39.2, 2.16 asks a run from 2.08, 22.7 hits
  a game from 20.6, and the game runs 94.5 events to the clinch from 90.5. Its hit rate rises in
  every phase (50.0 / 55.7 / 58.2% from 48.3 / 52.3 / 56.9%).
- **The sets it was losing move.** The even sets go to Monet 46.1% from 42.0% (+0.21 a game); its
  four-card majorities 62.1% from 57.2% (+0.16); its two-card minorities are unchanged (29.5% from
  28.2%). Sets 3.41 / 4.14 from 3.24 / 4.24: +0.17 a game for Monet, −0.10 for SESTINA.
- **It pays what §3.8c said a hit costs, and more.** Its own hits are taken back more (43.4% from
  41.0%), its misses are made at more dangerous targets (mean danger 0.65 from 0.50; SESTINA opens
  with a certain take-back after 21.7% of them from 17.2%), and SESTINA's greedy option at its own
  decisions gets richer (its v0.4c counterfactual 66.1% from 62.6%) — which SESTINA does not take
  (its hit rate 56.0% from 55.7%). Against that, Monet takes back more of SESTINA's hits (36.3% of
  them from 32.1%) and SESTINA's hits end in a cashed set 72.0% of the time from 75.5%.
- **Declares and locks.** Monet declares 3.37 a game from 3.19 at 98.8% from 99.1%, forms 3.64
  locks from 3.48, cashes 91.5% of them from 90.7%, and holds a lock 5.93 events from 7.90 —
  faster because the run that formed it is still going. SESTINA's lock hold rises to 5.16 from
  4.27. Gifts stay at 0.04 a game.

So the rung that cleared is not the one §3.8c's take-back rows suggested. The take-back cost is
real and v0.9 pays more of it; the gain is that asking into the opponents' open sets — the asks a
hit-maximiser never plays — keeps the turn, turns the even sets, and converts the majorities.
FishLab's finding about SESTINA (ask accuracy is anti-correlated with strength near the optimum)
is confirmed in kind, not in the letter: Monet's accuracy rose because the decisions it changed
were the poorest ones. The exposure charge, which is the take-back story in a knob, is worth
+3.31 alone on the fit seeds and +0.67 on top of the contest credit, and waits for its own rung.

**What is fixed by this record.** `monetPolicy('v0.9')` = v0.4c + `contest: 0.6`;
`tests/bots/monet.test.ts` pins the vector's deviation from v0.4c to exactly `{ contest }` and
replays v0.9's forward bank (`tests/bots/data/monet-v09-bank.ts`, emitted from the clean tree at
the commit that registered it); `tests/bots/priced.test.ts` pins identity at the knobs absent.
The lobby's agreement with Bass v2.0 over the models test's twenty games is 95.78% at contest 0.6
(97.02% at v0.4c; 95.32% at 1.0, 94.93% at 1.5), so the copy says "about 96%" and the 95% honesty
floor stands. Scratch state, not committed: `$SP/monet-v09` (cells, calib files, REPORT-fit.txt,
REPORT-fit-ext.txt, REPORT-conf.txt, markers-*.txt, 341 MB of records), `$SP/arm_v09`,
`$SP/fishai-v09`.


### 3.8e Monet v0.10 — the exposure rung

**The owner's direction, 2026-09-04: "merge 26 then build the exposure rung by your
recommendation."** The exposure charge — §3.8d's second term, what a hit gives away — fitted on
v0.9's vector and confirmed on fresh seeds at the floor, with the one form change the v0.9
pre-registration deferred: the charge on certain hits.

**The facts this rung starts from (§3.8d's records).**

- On the v0.9 fit seeds the exposure charge alone read +3.31 paired over v0.4c at 0.6 (SD 1.31,
  ahead on 3 of 3), −0.11 at 0.3 and +1.89 at 1.0 (SD 2.67). On top of `contest` 0.6 it read
  **+0.67** (0.6 + 0.6 against 0.6 alone: +0.42 / +1.75 / −0.17) and +0.11 (1.0 + 0.6). **The
  honest prior for the dose ladder as built is under the +2.00 floor.**
- What the charge did at v0.4c (the x2 records, 3,600 games): it changed 5.9% of asks, at
  decisions where the greedy pick would hit 37.4% and the priced ask hit 14.6% — it gave up
  exposed hits for near-sure misses; its sure-miss asks rose to 11.8% from 9.4%; its hit rate fell
  below its own counterfactual (50.7% against 52.0%, the SESTINA signature); its locks cashed
  92.6% from 89.8%. It did not cut its own take-backs much (39.6% from 40.9%).
- v0.9 pays the take-back cost and wins anyway: its hits are later taken back 43.4% of the time
  against v0.4c's 41.0%, SESTINA's 36.3%. The cost the charge prices is real and larger under
  v0.9 than before.
- SESTINA leaves hits on the table: at its own decisions v0.4c's pick would hit 66.1% against its
  56.0% (v0.9 games), a hit was available 98.4% of the time and it hit 56.9% of those. Some of
  the hits it declines are certain. v0.9's form cannot decline a certain hit: both priced terms
  are gated below any legal certain hit and a certain hit pays neither.

**The mechanism.** The charge as built (`exposure · wHit · p · risk`, priced.ts) at four doses on
v0.9's vector, and one new knob, **`exposureCertain`** (§3.8e; style.ts, priced.ts, the gate in
`pickAsk`): with it true and a live exposure charge, a certain hit the opponents can take back
pays `exposure · wHit · risk` like any other hit, and an uncertain ask keeps its contest credit
and exposure charge beside a legal certain hit — so an exposed certain hit can lose to a
contested ask. False, absent, or true without `exposure` is byte identity (pinned in
`tests/bots/priced.test.ts`, with the v0.9 forward bank unchanged).

**The fit, abroad, pre-registered before its cells.** Base: v0.9 (`contest` 0.6, the recorded
form of the arm that shipped), on the v0.10 tree export, proven byte-identical to §3.8d's
recorded c3 cell at seed 2534720 before a fresh seed is spent. Fit seeds, three, drawn by §6.5's
rule from `monet-v0.10-2026-09-04`: **6032457 5204470 7996480**. Every cell 1,200 games against
SESTINA v1.0, recorded. Arms, every one on v0.9's vector:

> | arm | override beside `contest` 0.6 | for |
> |---|---|---|
> | base | — | the pair |
> | e1 / e2 / e3 / e4 | `exposure` 0.3 / 0.6 / 1.0 / 1.5 | the dose, gated as built |
> | u1 / u2 | `exposure` 0.6 / 1.0 + `exposureCertain` | the dose, the charge on certain hits, ungated |

The chosen arm is the one with the best mean paired gain over the three fit seeds, provided it is
positive on at least two of them; if none is, v0.10 closes as measured and the exposure charge is
recorded as worth what the fit says on top of v0.9. Home duplicate pairs (600 on `home-a` for the
chosen arm) are reported, not gating.

**The confirmation.** The chosen arm against SESTINA on twelve fresh seeds: the twelve §3.8d's
amendment drew on 2026-09-03 from `monet-v0.9-ext-2026-09-03` for a second confirmation that
never ran, unused since — **5682873 5690135 6007102 4920114 7140858 4334282 8816427 6848576
8516315 2344938 9677918 7951876** — paired against the base (v0.9) on the same seeds and tree,
acceptance **+2.00 points over v0.9** (≥ 40.9%). Every seed listed, the SD published.

**The markers**, from the confirmation records through §3.8c's instrument, expected if the charge
does what its name says and recorded either way: Monet's hits later taken back **fall** from
43.4%; its hit rate sits **below** its v0.4c counterfactual (the signature v0.9 did not show);
its sure-miss asks rise; under `exposureCertain`, its "hit when available" falls below v0.9's
55.3% while its sets a game rise; lock cashing rises from 91.5%. A win-rate gain without these is
a gain this document cannot explain and says so; a rung that closes under the floor is recorded
with the same table.

#### Record — 2026-09-04

**v0.10 closes as measured: the exposure charge on v0.9's vector is worth +1.07 paired on twelve
fresh seeds, under the +2.00 floor. Nothing ships; `monetPolicy('v0.9')` stays the shipped
policy and `exposureCertain` is off everywhere.** Every cell 1,200 games against SESTINA v1.0,
both arms on the v0.10 tree export (commit `8ab3fe0`), the base arm — v0.9's recorded form,
`contest` 0.6 on v0.4c — proven byte-identical to §3.8d's recorded c3 cell at seed 2534720
before a fresh seed was spent, every game recorded.

**The fit (three fresh seeds, paired against v0.9's 37.86%).**

> | arm | beside `contest` 0.6 | 5204470 | 6032457 | 7996480 | paired mean | SD | ahead |
> |---|---|---|---|---|---|---|---|
> | e1 | `exposure` 0.3 | +1.33 | −1.08 | −1.33 | −0.36 | 1.47 | 1 of 3 |
> | e2 | `exposure` 0.6 | +3.08 | +1.67 | −0.42 | +1.44 | 1.76 | 2 of 3 |
> | e3 | `exposure` 1.0 | −1.25 | +2.17 | −0.17 | +0.25 | 1.75 | 1 of 3 |
> | e4 | `exposure` 1.5 | −4.25 | −3.08 | −7.58 | −4.97 | 2.34 | 0 of 3 |
> | **u1** | **`exposure` 0.6 + `exposureCertain`** | **+2.92** | **+2.67** | **−0.75** | **+1.61** | **2.05** | **2 of 3** |
> | u2 | `exposure` 1.0 + `exposureCertain` | −1.00 | +2.58 | +0.08 | +0.56 | 1.84 | 2 of 3 |

The rule picked u1. The dose peaks at 0.6 in both forms and is ruinous at 1.5 (the charge then
outweighs the hit: ask accuracy 47.3% from 55.1%); the gated and ungated forms at 0.6 sit within
noise of each other (+1.44 and +1.61, SE about 1.0 at three seeds).

**The confirmation (twelve fresh seeds, u1 against v0.9, 14,400 games a side).**

> | seed | v0.9 | u1 | paired |
> |---|---|---|---|
> | 5682873 | 40.25 | 39.33 | −0.92 |
> | 5690135 | 37.92 | 40.75 | +2.83 |
> | 6007102 | 38.17 | 38.33 | +0.17 |
> | 4920114 | 39.33 | 39.83 | +0.50 |
> | 7140858 | 37.00 | 40.17 | +3.17 |
> | 4334282 | 39.50 | 41.33 | +1.83 |
> | 8816427 | 38.33 | 39.75 | +1.42 |
> | 6848576 | 39.83 | 39.75 | −0.08 |
> | 8516315 | 40.42 | 39.67 | −0.75 |
> | 2344938 | 35.75 | 40.83 | +5.08 |
> | 9677918 | 40.17 | 40.92 | +0.75 |
> | 7951876 | 39.25 | 38.08 | −1.17 |
> | **mean** | **38.83** | **39.90** | **+1.07** (SD 1.89, SE 0.54, t 1.96; ahead on 8 of 12) |

Two standard errors above zero and two under the floor: real, and half a rung. v0.9's 38.83% over
these seeds sits with its 38.92% over §3.8d's twelve. Their engine's markers, means over the
cells: ask accuracy 54.60% from 55.25%, declarations 4.11 a game from 4.08 at 98.2% from 98.0%,
lock hold 6.76 from 6.78, the calibration bias +0.007 from +0.006. At home, 600 duplicate pairs on
`home-a` (reported, not gating): +0.04 ± 0.25 sets a pair for u1, +0.10 ± 0.25 for the gated
0.6 — nothing, as with every priced term in the mirror.

**The markers, from the confirmation records through §3.8c's instrument (u1 against v0.9,
14,400 games each; the counterfactual is v0.9 at u1's own decisions).** Every pre-registered
marker came in as written, and the rung still did not clear: the charge does what its name says,
by about a point each.

> | marker | pre-registered | v0.9 | u1 | as written? |
> |---|---|---|---|---|
> | Monet's hits later taken back | falls from 43% | 43.3% | 42.2% | **yes**, by 1.1 |
> | Monet's hit rate against its counterfactual | below it | 54.3% (= its own) | 53.7% (counterfactual 54.4%) | **yes**, by 0.7 |
> | sure-miss asks (into a set its side holds entirely) | rise | 6.0% | 6.9% | **yes** |
> | hit when available (`exposureCertain`) / sets a game | falls below 55.3% / rise | 55.3% / 3.41 | 54.6% / 3.45 | **yes** |
> | locks cashed | rise from 91.5% | 91.5% | 91.9% | **yes**, barely |

What the records show:

- **The charge changes 7.1% of Monet's asks (42,200), and at those decisions it gives up hits.**
  v0.9's pick would hit 38.8% there; u1's ask hits 28.7%. Its hits a game fall to 22.1 from 22.6,
  its asks a game to 41.2 from 41.6, and the game runs 93.4 events to the clinch from 94.3. Its
  own hits are taken back less (42.2% from 43.3%) and end in a cashed set more (64.8% from
  63.6%); its misses are made at slightly safer targets (mean danger 0.60 from 0.64; SESTINA opens
  with a certain take-back after 21.1% of them from 21.7%).
- **The freedom to skip a certain hit is barely used.** The gated form at the same dose changes
  6.5% of asks against u1's 7.1% on the fit records and reads the same markers within noise; the
  extra decisions are about a quarter of a game each. "Hit when available" falls to 54.6% from
  55.3%.
- **The sets barely move.** 3.45 / 4.10 from 3.41 / 4.14: +0.04 a game for Monet, −0.04 for
  SESTINA. The even sets 46.3% from 46.0%; the two-card sets 30.8% from 29.1%; the four-card
  61.8% from 62.5%. Declares 3.40 a game from 3.37 at 99.0% from 98.9%; lock hold 6.00 from 5.92.

So the take-back cost that §3.8c measured is priced correctly by the charge, and pricing it is
worth about a point on top of the contest credit, not two: the exposed hits it declines were
mostly worth taking. The exposure charge is recorded, off the vector, and this document does not
recommend a third look at the ask ranker's terms.

**What is fixed by this record.** Nothing on Monet's vector. `exposureCertain` stays in the code
behind byte identity (off on every version and every roster style) with its pins in
`tests/bots/priced.test.ts`; the v0.9 forward bank replays unchanged. Scratch state, not
committed: `$SP/monet-v10` (cells, calib files, REPORT-fit.txt, REPORT-conf.txt, markers-*.txt,
the records), `$SP/arm_v10`, `$SP/fishai-v10`.


### 3.8f Monet v0.11 — the declare priced on the records, and the compulsion translated

**The owner's direction, 2026-09-04: "let's go with your recommendation"** — §8.3 row 10's (c), the
risk bar on the declare. Before a knob was built, the declare was priced on the records v0.9's
runs left behind (§3.8e's twelve base cells and §3.8d's twelve c3 cells, 28,800 games against
SESTINA, every window of every game), because a bar can only move the sets a declare can reach
and the records say which those are.

**The instrument.** `scripts/attribute.mjs --locks` (with `--locks-both`, `--locks-why`): at every
window of every recorded game, every unresolved set with at least four of its six cards on a side
by the deal is probed from every seat of that side that holds cards, through v0.9's own planner
(`planClaimFor`, the chain over the marginal): the plan's p, its guessed-card count, whether the
speculative gate would pass, and whether the plan is right by the deal — the set entirely on that
side and every holder named right. From those probes: the reliability of p (probes binned by
guessed cards and p against the truth); each side's declarations binned by the claimer's own plan
p; and declare *rules* priced at the earliest window that satisfies them, before the side's own
declaration of the set, against what actually happened to the set, in sets of differential —
right: 0 if the side cashed it anyway, +2 if the other side had got it, +1 if it stayed open at
the clinch; wrong: −2 / 0 / −1 — with the reason a fired plan was never played read off
`decide()` itself at that window. A failed declaration's claim event carries only the holders a
hit had shown, as the bridge bot builds it, so the counterfactual knows exactly what the live
bot knew (the same numbers either way on the seed read).

**What the records say** (the first seed read in full, 5682873 of §3.8e's confirmation, v0.9
against SESTINA, 1,200 games; the 24-seed run goes into the record beside it):

1. **The plan's p is over-confident with one guessed card and under-confident with two or
   more.** Probes of Monet's declarable sets from Monet's seats, right by the deal: one guess at
   p [0.5, 0.7) **30.9%** right (10,093 probes), at [0.7, 0.9) 47.2%; two guesses at [0.3, 0.5)
   **53.6%** (22,218), at [0.5, 0.7) 71.6%, at [0.7, 0.9) 86.1%; three or more at [0.3, 0.5)
   60.9%, at [0.5, 0.7) **82.7%**, above 0.7 100% — and three-guess plans are never fired
   (`declareMaxUncertain` 2). SESTINA's positions, probed the same way from its seats, show the
   same curve (one guess at [0.5, 0.7) 27.7%; two at [0.3, 0.5) 52.3%; three or more at [0.5,
   0.7) 96.9%).
2. **The bar is worth about nothing.** Rules priced at the earliest window, sets of differential a
   game: the speculative gate as shipped at 0.775 **+0.003** (27 fires, 85.2% right), at 0.9
   +0.003; the plan's p alone at 0.9 +0.013, at 0.775 −0.010, at 0.5 −0.921; the best
   guess-count-aware rule (never on one guess, 0.7 on two, 0.5 on three or more) **+0.018**
   (147 fires, 89.8% right). The reason is structural: a set the other side got was never a
   lock — the licence rule means a lock cannot be broken — so no declaration could have saved it
   (of 237 such sets the plan's p reached 0.5 on, the plan was right on 10); a set Monet cashes
   anyway pays nothing for being cashed earlier; and a wrong declaration on one of those costs
   two. What is left for a bar is the 14.2% of Monet's declarable sets open at the clinch, and a
   plan right on those is rare below certainty. At v0.9's exchange rate (0.27 sets a game bought
   +4.04) the whole lever is a quarter of a point.
3. **SESTINA declares where Monet's planner says under 0.5, and is right.** Its declarations by
   Monet's plan p at its own seat: p = 1 53,448 on the twelve §3.8e seeds; [0.775, 1) 311 at
   74.3%; [0.5, 0.775) 1,162 at **85.4%**; (0, 0.5) **5,300 at 84.3%, 0.37 a game, with Monet's
   own plan right 81.1% of them**. Monet's below-certainty declarations are 0.077 a game at
   57%. Item 1 says this is selection, not a different planner: SESTINA declares the positions
   its belief (the choice prior at κ 2.5 and its determinizations, in its spec) has sharpened,
   and Monet's chain rates them by the same under-confident product. Cashing those sets is an
   inference question (§3.6's prior, §3.8b's consensus), and both were measured small at home.
4. **The certain plans that were never cashed are the finding.** 538 times a Monet seat held a
   plan with every card certain that its side did not cash at that window; 497 were cashed a
   window later; **41 never were: 17 given to SESTINA by a teammate's wrong declaration, every
   one with Monet at four sets and 14 with SESTINA at four as well — a won game handed over — 21
   left open in games already decided (5-x or x-5), and 3 foreign.** `decide()` asked at each
   of those windows declares the set. The tails show what happened instead: a `player_out`
   event, then the lowest-numbered Monet seat's claim of that set, wrong, at p about 0.5. That is
   RULES_US54.md §3.2's compulsion — with every opponent out of cards the window can never
   close, `decline` is illegal, and every Monet seat's `decideWindow` returns `forcedClaim`'s
   argmax with no style gate — answered into this host's *optional* `declare_poll`, where the
   lowest seat that answers wins the round. The host's own compulsion for that position is its
   forced endgame: a sweep of confidence thresholds set by set, each seat asked whether it is
   willing at that threshold, and only then a demand (BOT_PACKAGE.md §5.2's `forced`, which the
   adapter already answers with the honest p). In the recorded cells Monet's `must-declare`
   claims are 40–45 a cell at 55–78% right, believing 0.50–0.53; its `forced-claim`s (the
   stall-breaker, a home rule for a table of decliners that this host never needs) 4–7 at
   14–50%.

**The mechanism is a bridge correction, not a policy knob: MUSTFIX.** In the adapter's
`opPoll`, a claim whose trace kind is `must-declare` or `forced-claim` and whose plan is not
certain (p < 1) is answered `none`; a certain one goes out as before; the `forced` op is
unchanged. The certain teammate's claim then lands in the same poll round, and where nobody is
certain the host's ladder orders the team by reported confidence — the most-confident-teammate
selector §3.5a(b) emulated (77.6% right where the compelled seat was 47.8%), provided here by
the host's rules at no cost. It is the same class of translation as the adapter's PASSFIX
(§3.1): a home rule that exists because `us54` has no pass, spent on a host that has one.
Behind `MONET_MUSTFIX=1`; with the switch absent the patched file reproduced §3.8d's recorded
c3 cell at seed 2534720 byte for byte (every engine line but `elapsed`) before any cell was
spent. Nothing in `lib/` changes; the lobby and every home number are untouched.

**The measurement, pre-registered before its cells.** The fix arm (v0.9's recorded form,
`contest` 0.6 on `MONET_ARM=v0.4c`, the v0.10 tree export `8ab3fe0` that §3.8e proved is v0.9
in their engine) on §3.8e's twelve confirmation seeds — 5682873 5690135 6007102 4920114 7140858
4334282 8816427 6848576 8516315 2344938 9677918 7951876 — paired against §3.8e's recorded v0.9
cells on the same seeds and tree, SESTINA unchanged, every cell recorded. **Prediction, from the
seed read in full: +1.4 to +2.0 points** (17 games in 1,200 lost with a certain teammate, 24 with
a teammate at p ≥ 0.5), read against v0.9's 38.83% on these seeds. The rule: the fix becomes the
bridge's translation if the paired mean is positive and the markers move as written; its value
is recorded either way, and it is not a rung — it ships no policy, and every abroad number Monet
has published carried the handicap it removes. **The corrected v0.9 is the ladder's base from
here**, and a rung still needs +2.00 over it.

**Markers** (the fix's cells against the base's, through §3.8c's instrument and the bot's own
counters): `mustfixDeclines` > 0 with `dk_must_declare` and `dk_forced_claim` near 0 and
`opForced` up; the instrument's "the other side got it by a teammate's wrong declare, A at four"
column near 0 from 17 a seed; Monet's gifts a game down from 0.03 and its declarations a game
and their accuracy up; SESTINA's lines unchanged within noise. A win-rate gain without these is a
gain this document cannot explain and says so.

**Not built: the risk bar.** Item 2 is the reason — its price on the records is a quarter of a
point at best, and §8.3 row 11 puts that beside the finding for the owner.

#### Record — 2026-09-04

**MUSTFIX is the bridge's translation from here: +1.28 paired on the twelve seeds, ahead on
every one, every marker as written. The corrected v0.9 reads 40.11% against SESTINA v1.0 on
§3.8e's seeds, from 38.83%. Nothing on Monet's vector changes; nothing in `lib/` changes; the
risk bar is not built.** Twelve cells of 1,200 games, the fix arm (v0.9's recorded form on the
v0.10 tree export `8ab3fe0`, the patched bridge file with `MONET_MUSTFIX=1`) against the
recorded v0.9 cells on the same seeds, tree and opponent; the patched file with the switch off
reproduced §3.8d's c3 cell at seed 2534720 line for line before the first cell.

> | seed | v0.9, old bridge | v0.9, MUSTFIX | paired |
> |---|---|---|---|
> | 2344938 | 35.75 | 37.25 | +1.50 |
> | 4334282 | 39.50 | 40.58 | +1.08 |
> | 4920114 | 39.33 | 40.75 | +1.42 |
> | 5682873 | 40.25 | 41.83 | +1.58 |
> | 5690135 | 37.92 | 39.17 | +1.25 |
> | 6007102 | 38.17 | 39.25 | +1.08 |
> | 6848576 | 39.83 | 41.17 | +1.33 |
> | 7140858 | 37.00 | 38.00 | +1.00 |
> | 7951876 | 39.25 | 40.42 | +1.17 |
> | 8516315 | 40.42 | 42.33 | +1.92 |
> | 8816427 | 38.33 | 39.17 | +0.83 |
> | 9677918 | 40.17 | 41.42 | +1.25 |
> | **mean** | **38.83** | **40.11** | **+1.28** (SD 0.29, SE 0.08, t 15.3; ahead on 12 of 12) |

**Against the prediction.** The pre-registration predicted +1.4 to +2.0 from the one seed read in
full; the 24-seed count, finished after the cells were launched, says that seed ran high: the
certain plans a teammate gave away with Monet at four are **144 in 14,400 games on §3.8e's seeds
and 162 on §3.8d's** — 1.0 to 1.1 points — and the measured +1.28 sits with that count, not with
the one-seed range. The difference over the count is what the host's ladder adds where no
teammate is certain. The spread is a quarter of the exposure rung's (SD 0.29 against 1.89):
the fix moves a fixed population of endgames and nothing else.

**The markers, as written.** Over the twelve cells (14,400 games), the fix's bot against the
recorded base's: `mustfixDeclines` **4,817** (0.33 a game); the compelled claims Monet still
makes in a poll 21, every one certain and right, from 483 at 61.9% (`must-declare`) and 55 at
34.5% (`forced-claim`, the stall-breaker); `opForced` 34,927 from 17,789 and the host's
`last_resort` demands 492 from 249, every one answered; the host's ladder now makes 265 of
Monet's compelled declarations at 59.6% right (`engine-forced-decide` 220 at 67.3%,
`engine-forced-plan` 45 at 22.2%) where the old bridge's poll made 538 at 59.1% — the
compelled population halves, because the certain teammate takes the set in the same poll round
(certain claims 39,506 from 39,294, own-book claims 11,196 from 11,139). Their engine's lines:
declarations **4.03 a game at 99.73%** from 4.08 at 98.01% (Monet's wrong declarations 0.011 a
game from 0.081), sets 4.16 from 4.12, lock hold 6.98 from 6.78, ask accuracy 55.26 from 55.25,
the calibration bias +0.006 both. On the fix's own records through the instrument, the certain plans a teammate gave away fall to **10 in 14,400 games, 8 with Monet at four, from 174 and 144**; the plans cashed a window later 5,859 from 5,678; those open in decided games 282 from 302.
SESTINA's lines are unchanged within noise.

**The 24-seed study, for the record** (both record sets, 28,800 games; the one-seed numbers of
the pre-registration held on every item):

1. The reliability of the plan's p, Monet's seats over its declarable sets, right by the deal:
   one guess at p [0.5, 0.7) **31.8% / 31.5%** (119,091 / 116,935 probes), at [0.7, 0.9) 47.1% /
   48.0%; two guesses at [0.3, 0.5) **53.8% / 52.9%**, at [0.5, 0.7) 74.9% / 74.7%, at [0.7, 0.9)
   88.9% / 90.1%; three or more at [0.3, 0.5) 57.2% / 57.2%, at [0.5, 0.7) **78.8% / 77.7%**, at
   [0.7, 0.9) 91.3% / 97.4%. SESTINA's seats over its sets: one guess at [0.5, 0.7) 30.7% /
   30.1%; two at [0.3, 0.5) 54.4% / 53.8%; three or more at [0.5, 0.7) 85.4% / 84.2%.
2. The rules, sets of differential a game: the gated bar at 0.775 **+0.001 / +0.002** (270 / 286
   fires at 79.6% / 79.7%), at 0.9 +0.003 / +0.003; the plan's p alone at 0.9 +0.013 / +0.013
   (98.8% / 98.7% right), at 0.775 −0.016 / −0.015, at 0.5 −0.870 / −0.883; the best
   guess-count-aware form (0.9 on one guess, 0.8 on two, 0.7 on three or more) **+0.013 /
   +0.014** (1,100 / 1,079 fires at 97.7% / 97.8%). Monet's declarable sets: 6.69 / 6.70 a game;
   cashed by Monet 50.4% / 50.2%, got by the other side 35.4% / 35.5%, open at the clinch 14.2%
   / 14.2%.
3. SESTINA's declarations by Monet's plan p at its seat: (0, 0.5) **5,300 at 84.3% / 5,204 at
   83.5%**, 0.37 / 0.36 a game, Monet's own plan right 81.1% / 80.8% of them; [0.5, 0.775) 1,162
   at 85.4% / 1,145 at 83.2%; [0.775, 1) 311 at 74.3% / 324 at 74.4%. Monet's own below
   certainty: 0.077 / 0.081 a game, right 50.6% / 52.1%.
4. The certain plans never cashed: 6,154 / 6,153 fires a set, 5,678 / 5,645 cashed a window
   later, **174 / 191 given away by a teammate's wrong declaration — 144 / 162 with Monet at
   four, 155 / 165 with SESTINA at four, none by an engine-forced declaration** — 302 / 317
   open in decided games, 41 / 43 foreign; no game on any of the 24 seeds ended with Monet at
   four holding an uncashed lock the other side's clinch cut off — what was lost was given, not
   left.

**What is fixed by this record.** The bridge: every arm from here carries MUSTFIX
(`$SP/mkarm-v11.mjs`, the v0.7 template plus the poll rule, `MONET_MUSTFIX=1` in the manifest,
the label carrying `mustfix=1`), and every Monet number abroad before 2026-09-04 — v0.4c's
34.28%, v0.9's 38.92% and 38.83%, v0.10's 39.90% — was read on the old bridge and is lower than
the same policy reads on the corrected one by about 1.3 points; the pairs within a rung were on
the same bridge and stand. **The ladder's base is the corrected v0.9, 40.11% on these twelve
seeds, and a rung needs +2.00 over it.** Nothing ships in the repo but the instrument
(`scripts/attribute.mjs --locks`, `--locks-both`, `--locks-why`) and this record; the lobby
plays the same v0.9. Scratch state, not committed: `$SP/monet-v11` (the identity cell, the twelve
cells and their records, REPORT-fix.txt, the three instrument passes, the lane logs,
sum-counters.mjs), `$SP/arm_v11`, `$SP/mkarm-v11.mjs`.


### 3.8g The majority conversion — a records study

**The owner's direction, 2026-09-04: "merge 27 and 28 then go on the study."** The study §3.8f
proposed in place of a rung: where the two-against-four bucket's 0.35 sets a game — 47% of the
0.73 sets a game between Monet and SESTINA at the clinch — actually goes, read on the corrected
v0.9 records (§3.8f's twelve fix cells, 14,400 games) and replicated on the twenty-four old-bridge
cells of §3.8d and §3.8e (28,800 games; the bridge correction touches only the endgame after the
opponents are out of cards, where no ask is made). No cell is spent. The decision rule below was
written before any corrected record was read.

**The instrument.** `scripts/attribute.mjs --majority --cf v0.9`. At every ask decision, for
every unresolved set the asker's side holds four or five of by the deal and the asker holds a card
of — an *actionable majority*, one the asker has the licence to close — the cards the opponents
hold: the asker's own-side mass on each through v0.9's marginal (every such card is with an
opponent by construction, so that mass is the miscalibration itself), whether the ask taken
*chases* one of them (asks an opponent for it), the best chase's target by the marginal against
the true holder, and what the non-chase asks were (the side's holding of the set asked into). An
*episode* runs from the first ask decision at which a side holds four of six to the set's
resolution or the clinch, split by whether the side ever chased. Both sides, SESTINA's decisions
through Monet's inference. Validated on one old-bridge seed before this was written (5682873 of
§3.8e's base cell, 1,200 games), the pilot:

> | | Monet | SESTINA (Monet's inference) |
> |---|---|---|
> | opponent-held cards of actionable majorities at ask decisions | 146,582 | 131,078 |
> | of them rated ≥ 0.5 on the asker's own side | **20.9%** | 11.1% |
> | decisions with a legal chase, a game | 39.4 | 38.5 |
> | the ask taken chases | **31.7%** | **36.3%** |
> | a chase hits | 71.9% | 69.4% |
> | the marginal's best target is right, where the ask did not chase | 40.7% | 46.3% |
> | the non-chase asks: sure misses into the side's own majority | 32.7% | 35.2% |
> | episodes a game / ever chased | 6.69 / 83.3% | 6.59 / 88.9% |
> | converted when chased / when never chased | 60.1% / 4.9% | **68.2%** / 9.6% |
> | events to resolution, chased | 39.3 | 32.8 |

**The readouts, pre-registered.**

- **R1, the belief.** The share of opponent-held majority cards on which Monet's own-side mass is
  at or above 0.5, against the same inference at SESTINA's decisions (pilot 20.9% / 11.1%), and
  the chase rate by that mass.
- **R2, the chase.** The chase rate at decisions with a legal chase (pilot 31.7% / 36.3%), the
  chase's hit rate, the best chase target's accuracy where the ask did not chase, and the
  composition of the non-chase asks.
- **R3, the episodes.** Episodes a game, the share ever chased (pilot 83.3% / 88.9%), the
  conversion when chased and when never chased (60.1% / 68.2%; 4.9% / 9.6%), and the events to
  resolution. Every readout pooled over the twelve corrected cells and per seed for the spread.

**The rule.** (a) If Monet chases less than SESTINA per legal decision *and* converts less when it
chases, each by more than two seed-to-seed standard deviations, the rung is **the closing ask**:
a ranker credit for chasing an opponent-held card of the side's own majority, a Monet-only knob at
byte identity when absent, fitted abroad on three fresh seeds and confirmed on twelve at +2.00
over 40.11%. Its bound on paper is the conversion gap times the 2.16 four-card majorities a game
at v0.9's exchange rate (0.27 sets a game bought +4.04), and the honest prior for a third ranker
term is v0.10's: under the floor. It is built only if the bound clears the floor. (b) If the chase
rate falls with the own-side mass and R1's share at Monet's decisions stands well above
SESTINA's, the lever is **the calibration** of the marginal's own-side mass on the cards of a
majority, and the rung is a correction to that mass on the ask path. (c) If Monet chases as often
and converts as well, the bucket's margin sits in the target (R2's best-target accuracy) or in
tempo, neither a policy knob, and the next rung goes to the even sets. Row 12 says which. Nothing
ships from the study; the numbers are the deliverable.

#### Record — 2026-09-04

**The rule's clause (a) fires, and (b) with it: SESTINA chases its majorities more often and
converts them better, by ten seed-to-seed standard deviations each, and Monet's chase is dulled
by a belief that rates one opponent-held card in five as its own. The rung is the closing ask,
weighted by the side's holding and not by that belief; its bound on paper is 0.39 sets a game,
about +5.8 points at v0.9's exchange rate, and clears the floor.** The twelve corrected cells
(14,400 games) pooled; the two old-bridge replications (§3.8e's twelve base cells, §3.8d's twelve
c3 cells, 28,800 games) read the same to a tenth of a point on every line, as the fix touches no
ask — the same result, reported as such. The per-seed spread is over the twelve corrected cells.

**R1, the belief.** Of the 1,808,653 opponent-held cards of Monet's actionable majorities at its
ask decisions, **21.4%** carry an own-side mass at or above 0.5 (21.41 ± 0.40 a seed); at
SESTINA's decisions through the same inference 11.1% (11.13 ± 0.20; paired +10.28, SE 0.12,
12 of 12). The card-level chase rate by that mass, Monet against SESTINA: [0, 0.1) **72.3% /
65.1%**, [0.1, 0.3) 27.2 / 24.6, [0.3, 0.5) 5.6 / 6.5, [0.5, 0.7) **7.0 / 16.0**, [0.7, 1] **11.7 /
16.9**. The cards Monet wrongly rates as its own it chases at half SESTINA's rate, and it has
twice as many of them.

**R2, the chase.** Decisions with a legal chase 39.6 a game (SESTINA 38.7). The ask taken
chases **31.6% / 36.2%** (paired −4.59, SD 0.40, SE 0.11, ahead on 0 of 12). A chase hits 72.1% /
70.1%. The marginal's best target for the most-located missing card is right 50.5% / 55.5% over
all decisions and **40.9% / 45.3%** where the ask did not chase (−4.41, SE 0.28, 0 of 12). The
non-chase asks: **a third are sure misses into the side's own majority on both sides** (33.2% /
35.7%: a card a teammate holds, asked of an opponent), 35.3% / 33.1% into a three-card set (hit
60.4% / 61.6%), 23.2% / 22.8% into a two-card set (71.2% / 73.1%), 8.3% / 8.4% into a one-card
set (83.2% / 86.3%). By the largest own-side mass on a missing card, the chase rate is not
monotone on either side — [0, 0.1) 21.2% / 26.3%, [0.1, 0.3) 52.6 / 52.8, [0.3, 0.5) 26.8 / 31.4,
[0.5, 0.7) 37.5 / 48.7, [0.7, 1] 42.0 / 44.1 — and SESTINA chases more at every level but one:
where every missing card is known to be with an opponent, a chase that would hit is taken at one
decision in five by either policy, because other certain hits are on offer and both prefer them.
That preference is what a closing credit prices.

**R3, the episodes.** 6.69 / 6.60 a game, 13.4 / 12.0 legal-chase decisions each, 1.87 / 2.12
chases each (13.9% / 17.7% of legal decisions), ever chased **83.5% / 89.2%** (−5.72, SE 0.15,
0 of 12). Converted when chased **59.8% / 68.7%** (−8.94, SD 0.89, SE 0.26, 0 of 12); taken by
the other side 29.9% / 26.3%; open at the clinch 10.3% / 5.0%; events to resolution **39.9 /
33.7** (+6.14, SE 0.10, 12 of 12). Never chased: converted 4.3% / 8.3%, taken 62.4% / 52.5%,
open 33.3% / 39.2%.

**The bound.** On the deal's split, Monet cashes 50.9% of its four-card sets (2.16 a game) and
SESTINA 62.5% of its own, 56% against 75% of the five-card (0.75 a game): 0.25 + 0.14 = **0.39
sets a game**, which at v0.9's exchange rate (0.27 sets a game bought +4.04) is +5.8 points if
captured whole; a third of it is a rung. The mechanism named by the reads: SESTINA closes its
majorities first, sooner and more often, and Monet's ranker prefers a certain hit elsewhere or an
ask into an even set, with a fifth of its closing chances hidden behind a belief that the missing
card is already its own.

**What is fixed by this record.** Nothing on Monet's vector; the instrument
(`scripts/attribute.mjs --majority`) and this record. Decision row 12 carries the rung it names:
**v0.12, the closing ask** — a credit in `pickAsk` for an ask that would close the side's own
majority, fitted abroad in two forms, one weighted by the side's holding of the set as the seat
knows it (four or five of six: its own cards and the cards certainly with teammates) and one
weighted also by the marginal's chance that the card is not the side's own — the second inherits
R1's miscalibration and the fit says by how much. Byte identity at 0. Markers from the records:
the chase rate at legal-chase decisions toward 36%, the conversion when chased toward 69%, the
events to resolution toward 34, the two-against-four bucket up from −0.35 sets a game, the hit
rate allowed to fall. Scratch state, not committed: `$SP/monet-v11/maj` (the pooled and per-seed
outputs, SPREAD-fix.txt, the replications), `maj-spread.mjs`, `run-majority.sh`.


### 3.8h Monet v0.12 — the closing ask

**The owner's direction, 2026-09-04: "open the pr then build v0.12 by your recommendation."**
§8.3 row 12's rung, built on §3.8g's records: a credit in the ask ranker for an ask that would
bring a set the side already holds most of within reach.

**What the study fixed before a line of code** (§3.8g, 14,400 corrected games, replicated on
28,800): where a chase is legal Monet takes it at 31.6% of decisions against SESTINA's 36.2%; the
majorities a side chases are cashed 59.8% against 68.7%, six events later; Monet's marginal rates
21.4% of the opponent-held missing cards as its own side's against 11.1% at SESTINA's positions;
and where every missing card is *known* to sit with an opponent both policies chase only one
decision in five, preferring another certain hit. The bound on the deal's split is 0.39 sets a
game, about +5.8 points at v0.9's exchange rate.

**The mechanism** (`lib/engine/bots/closing.ts`, its own module and its own predicate):

> `closing · wHit · p · lock`, where `lock = 1 − outstanding / horizon`, `outstanding` is the
> number of the set's other cards the seat cannot certainly place on its own team, and
> `horizon` is what a bare majority may be missing (2 of 6). So `lock` is 1 when the hit would
> leave nothing of the set outside the side's hands, 0.5 when it would leave one card, and 0 at
> two or more: the credit fires only at a **seat-known holding of four or five of six** and pays
> double on the completing ask. `closingBelief` counts the open cards by belief instead — a card
> nobody can place counts against the side only by its opponent mass — so the belief form is
> pointwise the larger credit over the larger population, and the gap between the forms is §3.8g's
> R1 priced.

Four properties are pinned in `tests/bots/closing.test.ts` rather than argued: the knob absent
or 0 (and the form switch without it) is byte identity at every decision; the credit is bounded by
`closing · wHit`, is 0 for a resolved set, for `p` 0 and for a sure miss into the side's own
majority, and fires only at a seat-known four or five; the belief form is pointwise at least the
certain form; and **the credit never promotes an uncertain ask above a certain hit** — it is
gated below every legal certain hit with *no* ungating switch, because §3.8g measured that neither
policy makes that trade, so a credit that bought it would be arguing with its own evidence. It is
live *among* certain hits, which is the bucket the study named. The hook is one appended `+ (…)`
group in each of `pickAsk`'s two score branches, the existing text untouched, so the five
committed replay banks reproduce with the knob absent; the full suite is green at 1,061 tests.

**Three limits, written down before the cells rather than discovered after them.**

1. **The gate narrows the reachable population.** With a certain hit legal anywhere in the
   ranking, an uncertain candidate is gated to 0. So the credit reaches (a) chases that are
   themselves certain hits, competing against another certain hit — precisely §3.8g's one-in-five
   bucket — and (b) positions with no certain hit at all. It does *not* reach most of the raw
   31.6%-against-36.2% gap, which is uncertain chases. The rung is therefore a test of the
   mechanism the study named, not of the whole bound.
2. **The seat-known majority is a subset of the deal-time one.** §3.8g counted a side holding four
   or five *by the deal*; a seat can only count what it can place, so a real majority whose
   teammate cards are unlocated earns nothing. Measured at home on v0.9 self-play, a seat-known
   holding of four or more is **16.0%** of the (seat, unresolved set it holds a card of) pairs
   (125 at four and 31 at five of 977), so the population is real but strictly smaller than the
   bound's. A null at every dose is partly a statement about coverage, and the record will say so.
3. **The dose must clear the near-tie window.** `leakEpsilon` is 0.5 and `leaky` is true at
   `leakThreshold` 4 — exactly this credit's population — and the near-tie sort puts leaky books
   *last*, so the existing information-protection tiebreak actively deprioritises closing asks. At
   `wHit` 70 the smallest dose below fires 3.5 points at `lock` 0.5 and `p` 1, well outside the
   window; low-`p` candidates at that dose sit inside it and are ordered by the leak rule, not by
   this credit. Whatever the fit measures therefore includes overriding that preference.

**The fit, abroad, pre-registered before its cells.** Base: the corrected v0.9 (`contest` 0.6 on
`MONET_ARM=v0.4c`, MUSTFIX on — §3.8f), on the v0.12 tree export, proven byte-identical to
§3.8f's recorded `conf-fix` cell at seed 5682873 before a fresh seed is spent. Fit seeds, three,
drawn by §6.5's rule from `monet-v0.12-2026-09-04` and skipping every seed any Monet run has
spent: **2952702 7314900 3847388**. Every cell 1,200 games against SESTINA v1.0, recorded.

> | arm | override beside `contest` 0.6 | for |
> |---|---|---|
> | base | — | the pair |
> | w1 / w2 / w3 / w4 | `closing` 0.1 / 0.25 / 0.5 / 1.0 | the dose, counted by certainty |
> | b2 / b3 | `closing` 0.25 / 0.5 + `closingBelief` | the same doses, counted by belief |

The scale, so the ladder is not a guess: `wHit` is 70, so the credit's ceiling is `closing · 70`
and the gap between its two rungs is `closing · 35`. Beside it the base ranker already pays
`gambleBonus` 25 on the completing ask, `wProgress` 18 a card, and `certaintyBonus` 20 for a
certain hit. w1 can just reorder two certain hits; w4 is deliberately hot, to bracket the fit from
above rather than assume the top.

The chosen arm is the one with the best mean paired gain over the three fit seeds, provided it is
positive on at least two of them; if none is, v0.12 closes as measured and the closing credit is
recorded as worth what the fit says. Home duplicate pairs (600 on `home-a` for the chosen arm)
are reported, not gating. **The lobby agreement is read at every arm, not only the winner**:
`src/play/models.ts` seats the newest version and `tests/play/models.test.ts` requires above 95%
agreement with Bass v2.0, where v0.9 sits at 95.78% — a breach is a finding about the dose, and
the "about 96%" copy is asserted honest, so the floor does not move to fit the bot.

**The confirmation.** The chosen arm against SESTINA on twelve fresh seeds, drawn by the same rule
from `monet-v0.12-confirm-2026-09-04` — **7252293 8962154 7103556 7871142 1027753 8456196
7184028 1717986 2495762 8576423 3622224 7871039** — paired against the base on the same seeds and
tree, acceptance **+2.00 points over the corrected v0.9** (≥ 42.1%, against its 40.11% on
§3.8f's twelve). Every seed listed, the SD published.

**The markers**, from the confirmation records through §3.8g's own instrument, expected if the
credit does what its name says and recorded either way: the chase rate at legal-chase decisions
**rises** from 31.6% toward SESTINA's 36.2%; the conversion of chased majorities rises from 59.8%
toward 68.7%; the events to resolution fall from 39.9 toward 33.7; the two-against-four bucket
rises from −0.35 sets a game; and the ask hit rate is **allowed to fall** — §3.8c established that
the hit chance is not the value of an ask, and this credit deliberately buys a worse hit rate for
a closed set. The record will also report the fit split by rung (seat-known four against five),
because the base already pays `gambleBonus` on the second and nothing extra on the first. A
win-rate gain without these is a gain this document cannot explain and says so; a rung that closes
under the floor is recorded with the same table.

**THE RECORD, 2026-09-04. v0.12 closes under the floor.** The chosen arm reads **40.69%
against the corrected v0.9's 40.11% on twelve fresh seeds — paired +0.583, SD 0.79, SE 0.23,
t 2.55, ahead on 9 of 12** against an acceptance of +2.00. Real, and about a quarter of a rung.
**Nothing ships on Monet's vector**: no registry entry, no bank regeneration, `src/play/models.ts`
untouched, the lobby unchanged. The code stays in the tree behind a knob that is absent from every
roster style and every tier and is byte identity when absent, so it costs nothing and the next
rung may build on it or delete it.

**The fit, abroad — three fresh seeds, 1,200 games a cell, every arm paired against the base on
the same seed and the same tree.**

> | seed | base | w1 | w2 | w3 | w4 | b2 | b3 |
> |---|---|---|---|---|---|---|---|
> | 2952702 | 40.75 | 41.75 | 40.75 | 41.42 | 41.17 | 40.42 | 39.33 |
> | 3847388 | 41.08 | 41.33 | 42.92 | 41.92 | 42.33 | 40.92 | 36.25 |
> | 7314900 | 40.33 | 39.75 | 41.17 | 41.75 | 40.83 | 39.42 | 40.08 |
> | **mean** | **40.72** | 40.94 | 41.61 | **41.69** | 41.44 | 40.25 | 38.56 |
>
> | arm | dose | paired mean | SD | SE | ahead / tie / behind |
> |---|---|---|---|---|---|
> | w1 | `closing` 0.1 | +0.222 | 0.79 | 0.46 | 2 / 0 / 1 |
> | w2 | `closing` 0.25 | +0.889 | 0.92 | 0.53 | 2 / 1 / 0 |
> | **w3** | **`closing` 0.5** | **+0.972** | **0.39** | **0.23** | **3 / 0 / 0** |
> | w4 | `closing` 1.0 | +0.722 | 0.46 | 0.26 | 3 / 0 / 0 |
> | b2 | 0.25 + `closingBelief` | −0.472 | 0.39 | 0.23 | 0 / 0 / 3 |
> | b3 | 0.5 + `closingBelief` | −2.167 | 2.38 | 1.38 | 0 / 0 / 3 |

**w3 is the pick by the rule as written** — the best mean, positive on all three. Nothing else in
the dose ladder should be read as a shape: 0.25, 0.5 and 1.0 give +0.89, +0.97 and +0.72 on three
seeds each, which is one number and not three.

**The two belief arms lose on every seed, and that is §3.8g's R1 showing its sign.** The marginal
that rates 21.4% of opponent-held missing cards as already the side's own is the same marginal the
belief form counts the open cards with, so the belief credit fires hardest exactly where the
inference is worst: it pays a set the side does not hold as though it nearly did. The certain
form counts only what the seat can place and has no such failure mode. This is the cleanest
statement the ladder has yet produced that Monet's miscalibration is not a rounding error but a
term that changes sign when you spend against it — and it was pre-registered as an ordered pair
precisely so the answer would mean something either way.

**The confirmation — twelve fresh seeds, 14,400 games a side.**

> | seed | base | w3 | w3 − base |
> |---|---|---|---|
> | 1027753 | 40.67 | 40.75 | +0.08 |
> | 1717986 | 41.08 | 41.92 | +0.83 |
> | 2495762 | 37.83 | 39.00 | +1.17 |
> | 3622224 | 40.33 | 41.33 | +1.00 |
> | 7103556 | 38.83 | 39.33 | +0.50 |
> | 7184028 | 39.67 | 40.92 | +1.25 |
> | 7252293 | 39.92 | 40.33 | +0.42 |
> | 7871039 | 41.58 | 41.50 | −0.08 |
> | 7871142 | 39.67 | 41.33 | +1.67 |
> | 8456196 | 41.83 | 41.17 | −0.67 |
> | 8576423 | 39.33 | 38.67 | −0.67 |
> | 8962154 | 40.58 | 42.08 | +1.50 |
> | **mean** | **40.11** | **40.69** | **+0.583** |
>
> paired mean +0.583, SD 0.79, SE 0.23, t 2.55, ahead on 9 of 12. **Acceptance was ≥ 42.1%. Not
> met.**

Two things worth saying about that base column. It is **40.11%**, and §3.8f's twelve confirmation
seeds — a different twelve, run a day earlier — also read 40.11% for the same arm. That is an
independent replication of the corrected v0.9 to the second decimal on 28,800 games in total, and
it is the number every later rung should be measured against. And the spread of the base across
seeds (37.83 to 41.83, a four-point range) is four times the effect being measured, which is why
the pairing is not optional and why three fit seeds can only ever choose an arm, never price one.

**The markers, from the confirmation records through §3.8g's own instrument** (pooled over each
arm's twelve cells: 14,400 games a side, about 570,000 ask decisions a side). Every one moved in
the pre-registered direction. Every one moved by roughly a tenth of the gap it was aimed at.

> | marker, at Monet's decisions | base | w3 | SESTINA | written direction |
> |---|---|---|---|---|
> | chases, where a chase is legal | 31.4% | **31.7%** | 36.2% | rises |
> | conversion of a majority ever chased | 59.6% | **60.0%** | 68.5% | rises |
> | events from four-of-six to resolution | 39.79 | **39.09** | 33.88 | falls |
> | episodes ever chased | 83.5% | **84.1%** | 89.1% | rises |
> | chases each episode | 1.86 | **1.88** | 2.12 | rises |
> | opponent-held missing cards rated ≥ 0.5 own-side | 21.0% | 20.7% | 11.3% | not targeted |
> | chase hit rate | 72.0% | 71.7% | 70.1% | allowed to fall |
> | ask accuracy | 55.16 | 55.03 | — | allowed to fall |
> | sets cashed a game | 3.33 | 3.37 | 4.10 → 4.08 | rises |
> | set differential a game | −0.710 | **−0.656** | — | rises |
> | the A-holds-two bucket, sets a game | −0.761 | −0.738 | — | rises |
> | lock hold (events to cash) | 7.035 | 6.911 | 5.16 | falls |
> | declarations a game | 4.020 | 4.038 | — | — |

One correction to the pre-registration's own wording: it wrote the bucket marker as "rises from
−0.35 sets a game", but −0.35 was §3.8g's estimate of **how much of SESTINA's 0.73-set lead sits
in that bucket**, not the bucket's own differential. Read on the bucket itself the movement is
−0.761 → −0.738, and on the whole game −0.710 → −0.656: **+0.054 sets a game**, which at the
exchange rate is the +0.58 points and nothing else. The two numbers agree, which is the only
reason to report both.

**What the credit actually did, measured rather than inferred.** `attribute.mjs` scores every ask
against the counterfactual the base ranker would have taken. On the base arm that counterfactual
agrees with the ask taken **100.0%** of the time, which is the instrument certifying itself. On
w3 it agrees **98.6%** — so the closing credit moved **8,287 asks of 599,000, 1.4% of them, about
0.58 a game.** On exactly those asks the base's own preferred ask would have hit **35.3%** and the
ask taken hit **28.1%**. The rung deliberately buys a seven-point-worse hit on the asks it moves
and is worth +0.58 points overall. §3.8c's finding — the hit chance is not the value of an ask —
is now stated twice from opposite ends: once by SESTINA hitting less and winning more, and once
by Monet hitting less on purpose and winning slightly more.

**The split by rung**, which the pre-registration promised. The bridge does not log the credit, so
the abroad records cannot separate the rungs; this is measured at home, on 120 games of v0.9
self-play with the chosen arm, and is a statement about where the credit fires, not about what it
is worth:

> | | share |
> |---|---|
> | ask decisions where the credit fires past the gate | **27.4%** (2,853 of 10,403) |
> | ask decisions where every credited candidate was gated out | 7.8% |
> | firings at a seat-known **four** of six (`lock` 0.5) | **85.9%** |
> | firings at a seat-known **five** of six (`lock` 1) | 14.1% |
> | ask decisions whose top pick the credit moves | 1.9%, **1.66 a game** across the six seats |
> | of the moved picks: the new ask's rung, four / five | 164 / 35 — and never an uncredited ask |

So the completing ask is not where the term lives: six firings in seven are one card earlier, on
the rung the base ranker pays nothing extra for, which is the shape §3.8g asked for and the reason
`gambleBonus` did not already cover it.

**Home duplicate pairs** (600 on `home-a`, reported and not gating, §6.4): **+0.0433 ± 0.1944
sets a pair** (SD 2.4293, SE 0.0992), win rate 50.58%. Unresolved at this N — as every priced term
has been in the mirror, because the mirror gives both sides the same credit.

**The three pre-registered limits, read back against what the cells found.**

1. **The gate narrows the population — confirmed, and the population is larger than the limit
   assumed.** It reaches a quarter of all ask decisions (27.4%), not the study's one-in-five slice
   of chase decisions, because a certain closing ask competing against another certain hit is
   common. At a further 7.8% of decisions every candidate the credit would pay is gated out, and
   that 7.8% is the part of §3.8g's 31.6%-against-36.2% gap this rung provably cannot touch.
2. **The seat-known majority is a strict subset — confirmed, and it is the four-rung that carries
   it**, 85.9% of firings. The coverage measured at home before the run (16.0% of the seat/set
   pairs) understated the reachable decisions, because one decision offers many candidates.
3. **The near-tie window — cleared.** At `closing` 0.5 and `wHit` 70 the credit is 17.5 points at
   `lock` 0.5 and `p` 1, thirty-five times `leakEpsilon`. The leak tiebreak still orders the
   low-`p` candidates, and the fit's answer includes overriding that preference where it does not.

**The tests, corrected before this record was written.** An adversarial review of the diff — five
dimensions, twenty candidate findings, three refuters each, three surviving — found **no defect in
the shipped code and three in the test file**, each of which the pre-registration had described as
a property "pinned rather than argued". Each was reproduced here by mutation, on the tree, before
being fixed:

> | the rewrite the test was supposed to forbid | before | after |
> |---|---|---|
> | delete the certain-hit gate: `+ closingCr` | 7 passed | fails — an uncertain ask at `p` 0.205 is picked |
> | let the priced switch buy it: `+ (gated && !ungated ? 0 : closingCr)` | 7 passed | fails — `p` 0.346 |
> | a located opponent card counts 0 in the belief mass | 7 passed | fails — 2.182 against 3.182 |
> | halve the open-card belief mass | 7 passed | fails — 0.300 against 0.600 |

Why they were blind is worth recording, because the same trap will be there next time. The gate
test asserted its property at the fit's dose, where the credit is too small to overtake
`certaintyBonus` — so it held with the gate deleted, and it held identically with the whole
feature absent. The ungating arm set `exposure` 0 beside `exposureCertain`, but `pricedUngated`
needs both, so the test compared a policy against itself. The belief test asserted only
inequalities, all of which survive an arbitrary rescaling of the very mass they describe. The
fixes are an overdosed arm read against its own closing-free twin (the gate is load-bearing at
`closing` 1.0 and at 0.5-with-belief, two of the six arms above, so this was not hypothetical),
a live `exposure` beside the switch, and an independent re-derivation of the belief mass asserted
equal. **No line of `closing.ts` or `decide.ts` changed**, so every cell in this section stands
and the identity check at seed 5682873 is unaffected. Suite 1,061 green, typecheck and lint clean.

**The read.** The closing ask is a real term that does what its name says and is worth about a
quarter of what the ladder calls a rung. Three ranker terms in a row have now landed in the same
place — v0.10's exposure charge at +1.07, this at +0.58, with v0.11 not a rung at all — while the
bound on the bucket was +5.8 points. The gap between the bound and the rung is not mystery: it is
the gate. The credit is confined to closing asks that are already certain hits, and §3.8g's
36.2%-against-31.6% gap is mostly made of **uncertain** chases the gate refuses to pay for. That
is a deliberate refusal, taken because §3.8g measured that neither policy trades a certain hit for
an uncertain chase — but §3.8g measured that only in the positions where every missing card is
*known* to sit with an opponent, and those are not the positions the gap lives in. **Row 13 puts
that to the owner.**

### 3.8i Monet v0.13 — the chase appetite

**The owner's direction, 2026-09-04: "let's go with your recommendation on v0.13."** §8.3 row 13's
rung, and the one that **deliberately reverses §3.8h's refusal**: a second, separately fitted
appetite that pays §3.8h's own `lock` credit to the UNCERTAIN chases §3.8h's gate refuses. Row 13
also names it the **last ask-ranker term to be tried**.

**The licence for the reversal, stated before the mechanism.** §3.8h gated its credit below every
certain hit because §3.8g measured that neither policy prefers an uncertain chase to a certain hit
— about one decision in five. That reading was taken **only in the positions where every missing
card is known to be with an opponent**, and it is not a finding that the trade is bad; it is a
count of how often it is taken. §3.8g R2's own bucket table settles the direction: in that very
bucket SESTINA chases **26.3%** to Monet's **21.2%**, a wider gap than the aggregate
36.2-against-31.6. So the reversal is licensed by the study, just not by §3.8h's prose about it.
What v0.13 may **not** claim is that it avoids that bucket. It does not, and a certainty guard is
not the complement of a bucket defined by belief — a candidate refinement (`located > 0`) was
designed, measured and **refused** on exactly that ground, plus a second: at `lock` 1 it is
unsatisfiable, so it would have deleted the better half of the population.

**The mechanism** (`lib/engine/bots/chase.ts`, a new module with its own header and its own
predicate — *not* an addition to `closing.ts`, whose header states as a module-level contract that
it never moves an uncertain ask above a certain hit):

> `chase · wHit · lock`, or `chase · wHit · p · lock` under `chaseScaled`, where `lock` is
> `closing.ts`'s own — re-used through `closingPicture` rather than re-derived, so the two
> appetites differ in nothing but which side of the gate they sit on and their shape in `p`.

The hook is **the other arm of §3.8h's own ternary**: `+ (gated ? chaseCr : closingCr)`, where
v0.12 wrote a literal `0`. It is therefore the only shape that adds **no addend** — the expression,
its operands, its arity and its association are bit for bit v0.12's when `chase` is absent, so the
**six** committed replay banks reproduce and requirement identity is a `git diff` read rather than
an argument about IEEE `x + 0`. It also makes double payment *unrepresentable*: a candidate is
gated or it is not, so the two doses can never be confounded in a fit.

**The flat form is the primary hypothesis and the scaled form is the control**, and the reason is
measured rather than aesthetic. §3.8g R1's card-level table has Monet chasing the missing cards it
rates at 0.5–0.7 own-side at **7.0%** and at 0.7–1 at **11.7%**, against SESTINA's **16.0%** and
**16.9%**. High own-side mass is low `p` on the opponent, so the chases Monet declines are the
low-`p` ones — and `p` is read off the very marginal that produces R1's miscalibration. A credit
multiplied by `p` pays least exactly where the gap is. The scaled form is §3.8h's expression with
the gate lifted and nothing else changed, which makes it the maximally comparable null.

**Two forms were designed, measured at home and refused**, and the refusals are recorded here so
they are not re-proposed: a **floor on `p`** (measured pointwise identical to the scaled form at
every dose worth running, because the promoted population's `p` is centred well above any floor
worth having), and **anything in `(1 − p)`** (two targets of one card share `progress` and
`narrowing`, so such a credit inverts target order once `chase · lock > 1` — true across the whole
eligible ladder — on a base already behind SESTINA on best-target accuracy; pin P7 refuses the
class). A **belief form is not offered at all**: §3.8h measured it at −0.472 and −2.167, losing six
seeds of six, and the gated population is exactly where the marginal carries the whole inference.

**What the rung actually trades, measured at home before any cell** (200 games of v0.9 self-play,
`measure-gated.mjs` / `measure-arms.mjs` / `measure-trade.mjs`). This is the sentence the record
will be read against:

> A legal certain hit exists at **33.0%** of ask decisions and the base takes it at **100.0%** of
> them (3,390 of 3,390). At **11.9%** of ask decisions there is at least one gated candidate
> carrying a lock — **83.4%** at a seat-known four, **16.6%** at a five, and only **21.0%** of them
> are chases the seat can actually see. So every promotion this rung makes gives up a card it was
> **certain** of, and a kept turn, for a shot:

> | arm | promotions a game (six seats) | the promoted ask truly hits | at `lock` 1 | mean `p` | the displaced hit truly hits |
> |---|---|---|---|---|---|
> | `chase` 2.0 | 2.15 | **53.7%** | 71.4% | 0.410 | **100.0%** |
> | `chase` 2.5 | 3.58 | **39.0%** | 46.9% | 0.356 | **100.0%** |
> | `chase` 3.0 | 4.89 | 33.0% | 36.3% | 0.325 | **100.0%** |
> | `chase` 4.0 | 5.74 | 32.5% | 27.7% | 0.326 | **100.0%** |
> | `chase` 7.0 + `chaseScaled` | 3.21 | 48.7% | 48.2% | 0.401 | **100.0%** |

The 100% column is definitional — a certain hit is a card whose holder is known — and it is in the
table because it is the whole price. The four-rung is the weaker half of the bet for a reason the
seat cannot see: the sure-miss guard kills only *certain* teammate holdings, so a four-rung "chase"
whose asked card sits with an **unlocated** teammate is §3.8g's own *sure miss into the side's own
majority* wearing this rung's name, and no seat-side guard can refuse it.

**The doses below 2.0 may not be run, and that is a rule and not a preference.** §6.3 forbids a
win-rate A/B whose predicted effect is under the cell's floor. At `chase` 1.0 the credit moves 1.11
asks a game across six seats — about half of v0.12's own behavioural budget — and the sets it wants
to chase are already cashed by Monet's own side on the base trajectory, so the zero-cost ceiling,
computed with every promotion converting a lost set into a won one at no cost, lands under +1
point. **Every dose at or below 1.5 is therefore ineligible**, which retires v0.12's own 0.1–1.0
ladder for this rung: the closing credit only ever reordered candidates on the same side of the
certainty boundary, and this one has to cross it.

**The fit, abroad, pre-registered before its cells.** Base: the corrected v0.9 (`contest` 0.6 on
`MONET_ARM=v0.4c`, MUSTFIX on — §3.8f), with **both** new knobs absent, so `chase` is priced
against the same 40.11% that v0.10's +1.07 and v0.12's +0.583 were read against and row 13's
"three in a row" comparison stays honest. Fit seeds, three, drawn by §6.5's rule from
`monet-v0.13-2026-09-04` and skipping every seed any Monet run has spent, v0.12's fifteen
included: **7650374 2628643 5128867**. Every cell 1,200 games against SESTINA v1.0, recorded.

> | arm | override beside `contest` 0.6 | what the arm is |
> |---|---|---|
> | base | — | the pair |
> | w3 | `closing` 0.5 | v0.12's shipped-dose arm: the identity reference, and a second read of §3.8h on fresh seeds |
> | h2 / h25 / h3 / h4 | `chase` 2.0 / 2.5 / 3.0 / 4.0 | the dose, counted flat. h4 is deliberately hot and expected negative, to bracket from above |
> | s7 | `chase` 7.0 + `chaseScaled` | the control, matched to h25 on rung mix (48.2% against 46.9% at `lock` 1) |
> | j25 | `chase` 2.5 + `closing` 0.5 | the interaction: a shipped v0.13 would sit beside v0.12's term, and 35 points of closing credit protecting a competing certain hit raises h25's threshold |

The control's dose is 7.0 rather than 2.5 because matching the *knob* would confound shape with
size: the scaled credit is about 2.3× smaller at the population's mean `p`. 7.0 is the dose that
lands on h25's rung mix. It does not also land on h25's move rate — 3.21 a game against 3.58, a
10% mismatch — and the record will read the pair with that in mind rather than pretend otherwise.

**Selection**, by §3.8d's rule and one disqualifier: the best mean paired gain over the three fit
seeds, provided it is positive on at least two. **An arm that breaches the lobby agreement floor
(`tests/play/models.test.ts`, above 95% against Bass v2.0, where v0.9 sits at 95.78%), drops
declare accuracy below 98.0%, or trips any fault counter is disqualified regardless of its mean** —
read at every arm, and a breach at h4 is a finding about the dose and never a reason to move a
floor. Three seeds resolve ±4.00, so the fit **chooses and cannot price**: nothing in the fit table
may be quoted as a value.

**A marker gate stands between the fit and the twelve seeds.** The confirmation runs only if the
chosen arm's own fit records show, against the base on those same three seeds, **the chase rate at
legal-chase decisions up by at least 1.5 points and episodes ever chased up by at least 1.5
points**. Those deltas carry hundreds of thousands of decisions and resolve orders of magnitude
better than a ±4.00 win rate. If the markers have not moved, the mechanism has not done what its
name says and twelve more seeds cannot make it; the rung closes on the fit and the record says so.

**The confirmation.** The chosen arm against SESTINA on twelve fresh seeds, drawn by the same rule
from `monet-v0.13-confirm-2026-09-04` — **7461197 9936837 9971133 8718782 2816644 4110631 5148246
8790887 1701171 8673686 6710945 1144313** — paired against the base on the same seeds and tree,
acceptance **+2.00 over the corrected v0.9 (≥ 42.11%)**. Every seed listed, the SD published. This
rung changes behaviour far more than v0.12 did, so the paired SD is expected larger than §3.8h's
0.79 and the floor does not move for that.

**Before a fresh seed is spent, three identity checks, two of them replays of already-spent seeds.**
(i) the six committed banks reproduce with `chase` absent; (ii) the v0.13 tree export with both
knobs absent reproduces §3.8f's recorded `conf-fix` cell at seed **5682873**; (iii) **new for this
rung** — the v0.13 tree with `closing` 0.5 and `chase` absent reproduces §3.8h's recorded
`conf-w3` cell at seed **7252293**. Check (iii) is the byte-identity-with-v0.12 clause proven
*abroad*, and it is the one that would catch a hook identical under vitest but not in the arm build.

**The markers**, from the confirmation records through §3.8g's instrument, **with bars and a
ceiling** — because v0.12 moved every marker in the written direction and by a tenth of its gap, so
"moved as written" is no longer evidence of anything.

> | marker | base | SESTINA | bar |
> |---|---|---|---|
> | episodes ever chased (row 13's named marker) | 83.5% | 89.2% | **at least +1.5** (v0.12 managed +0.6) |
> | chases where a chase is legal | 31.6% | 36.2% | **at least +1.5**, and **above 40% disqualifies the arm** — it has stopped imitating SESTINA and started overriding, and no marker from it may then be read as evidence |
> | pooled majority conversion — `everChased·chasedCashed + (1−everChased)·neverChasedCashed` | ≈50.5% | ≈62.2% | **rises**; the composition-free one, because a rung can raise the chased-side figure by adding chases to hopeless episodes |
> | conversion of a majority ever chased | 59.8% | 68.7% | rises |
> | never-chased episodes taken by the opponents | 62.4% | 52.5% | falls, and the bucket shrinks |
> | events from four-of-six to resolution | 39.9 | 33.7 | falls |
> | set differential a game / the A-holds-two bucket | −0.710 / −0.761 | | rise — the only two that can carry the win rate |

**Required to get worse, as a diagnostic and not a permission: the chase hit rate (72.1%) must
FALL**, toward and past SESTINA's 70.1%. The rung's entire content is lowering a `p` threshold. If
the chase rate rises and the hit rate does not fall, the credit bought chases Monet was already
inclined to take — it behaved like its own control — and **the arm is recorded as a null on its own
hypothesis whatever the win rate did.** Allowed to get worse and pre-registered so it is not read
as a fault: ask accuracy falls, by far more than v0.12's 0.13; counterfactual agreement falls from
v0.12's 98.6% to a predicted 90–96%; and on the moved asks the base's own preferred ask hits
**≈100%** against a taken hit of 33–54%. **If that base-preferred figure is not ≈100%, the abroad
arm is not the arm that was fitted and no marker from it may be read at all.** Controls, expected
flat: the share of opponent-held missing cards rated ≥ 0.5 own-side (this rung touches no belief),
and best-chase-target over all decisions. Best chase target *where the ask did not chase* is
declared **uninterpretable** for this rung — its denominator is re-composed by the rung's own
success — printed for continuity and never concluded from.

**Four null verdicts are pre-committed**, so "it moved something" cannot be mistaken for a gain.
(i) chase rate and ever-chased rise while **pooled** conversion does not: chases added to hopeless
episodes. (ii) The A-majority bucket rises while the even-3 bucket falls by as much: sets moved
between buckets rather than into the score. (iii) Conversion and sets cashed rise while the set
differential is flat: cashing more and conceding more. (iv) The win rate moves while the chase rate
moves under a point: the gain is not this mechanism.

**The tests, and the standard §3.8h's postmortem set.** `tests/bots/chase.test.ts` carries fourteen
pins and `public-view.test.ts` a fifteenth, and **every one was proved by running its mutation on
the tree before this pre-registration was signed** — the discipline §3.8h applied only after the
fact. Thirteen mutations, thirteen kills, each by its own pin: a non-zero default appetite, the arm
swap `(gated ? closingCr : chaseCr)`, the ungated refusal deleted, a `horizon` drift against
`closing.ts`, the belief walk dragged in, a target-dependent credit, the credit inverted in `p`,
the hook reverted to v0.12's, the priced switch reaching the credit, the hook made unconditional,
the `p > 0` guard deleted, `validateStyle` written `> 0`, and `chase: 0` pinned on the BASELINE
tier. Two of them are recorded here because what they revealed is worth keeping: **a default
appetite inside `chaseCredit` alone is an equivalent mutant** (`chaseActive` decides whether the
credit is called at all, so both sites must move), and **making the hook unconditional is inert on
its own** because the module refuses an ungated candidate on its own account — the defence in depth
is real, and the live mutant has to remove both. Suite 1,075 green, typecheck and lint clean.

**The strongest argument that this rung reads null, written before the cells.** The credit's ceiling
is under the floor everywhere it is safe and above it only where it is measurably reckless. At the
dose that reproduces v0.12's behavioural budget the sets it wants to chase are already cashed by
Monet's own side over nine times in ten, so the headroom is worth well under a point even if every
promotion converted a lost set into a won one at no cost. Headroom only clears +2.00 at doses where
the arm is giving up two to six **certain** cards a game — each one a card it knew the location of,
plus the turn — for asks that truly hit 54% at best and 33% at the hot end, on a four-rung where
six in ten of the "chases" are sure misses into the side's own majority that no seat-side guard can
see. So the rung is squeezed from both ends, and the honest expectation is a fifth sub-floor read,
most likely declining from h2 to h4 with h4 clearly negative — which would say the certainty margin
was right all along and §3.8g's one-in-five refusal generalises past the bucket it was measured in.
That is a publishable finding and it closes row 13 either way. It is also why the twelve seeds sit
behind a marker gate, and why the record should be prepared to say — as row 13 already anticipates
— that four consecutive sub-floor reads are no longer four disappointments but one result: **the
remaining points to 50% are not in the ask ranker, and row 14 changes axis.**

**THE RECORD, 2026-09-04. v0.13 closes ON THE FIT, and the twelve confirmation seeds were never
spent.** Every chase arm loses, monotonically in the dose, and the selection rule stops there: no
arm is positive on two of the three fit seeds, so by §3.8d's rule as written the rung closes as
measured. The marker gate and the +2.00 floor never came into play. **Nothing ships**: no registry
entry, no bank regeneration, `src/play/models.ts` untouched.

**The fit — three fresh seeds, 1,200 games a cell, every arm paired against the base on the same
seed and the same tree.**

> | seed | base | w3 | h2 | h25 | h3 | h4 | s7 | j25 |
> |---|---|---|---|---|---|---|---|---|
> | 2628643 | 40.33 | 39.92 | 38.42 | 36.83 | 34.42 | 31.67 | 35.67 | 37.67 |
> | 5128867 | 40.50 | 41.25 | 41.33 | 39.83 | 36.08 | 34.00 | 38.92 | 39.92 |
> | 7650374 | 41.67 | 40.42 | 39.50 | 38.33 | 36.50 | 34.17 | 37.58 | 38.08 |
> | **mean** | **40.83** | 40.53 | 39.75 | 38.33 | 35.67 | 33.28 | 37.39 | 38.56 |
>
> | arm | dose | paired mean | SD | SE | t | ahead / tie / behind |
> |---|---|---|---|---|---|---|
> | w3 | `closing` 0.5 (v0.12's arm) | −0.306 | 1.00 | 0.58 | −0.53 | 1 / 0 / 2 |
> | h2 | `chase` 2.0 | −1.083 | 1.66 | 0.96 | −1.13 | 1 / 0 / 2 |
> | h25 | `chase` 2.5 | −2.500 | 1.59 | 0.92 | −2.72 | 0 / 0 / 3 |
> | h3 | `chase` 3.0 | −5.167 | 0.75 | 0.43 | −11.93 | 0 / 0 / 3 |
> | h4 | `chase` 4.0 | −7.556 | 1.08 | 0.63 | −12.07 | 0 / 0 / 3 |
> | s7 | `chase` 7.0 + `chaseScaled` | −3.444 | 1.64 | 0.95 | −3.64 | 0 / 0 / 3 |
> | j25 | `chase` 2.5 + `closing` 0.5 | −2.278 | 1.54 | 0.89 | −2.57 | 0 / 0 / 3 |

The dose ladder is monotone across its whole eligible range and the two hot arms are resolved far
beyond the cell's noise (t −11.9 and −12.1 on three seeds). This is the shape §3.8i named in
advance as the likely one, and it says the certainty margin the base ranker keeps is not a
conservatism to be corrected: **it is worth about two points of win rate for every point of dose.**

The pre-registered ordered pair resolves as written but both members lose: **flat beats scaled**
(h25 −2.50 against s7 −3.44 at a matched rung mix), so the flat form is the better of the two, and
the hypothesis that the low-`p` chases are the valuable ones is not what fails here. What fails is
the trade itself. The interaction arm j25 (−2.28) sits a fraction above h25 (−2.50), which is
v0.12's own `closing` 0.5 worth about a fifth of a point in this company and inside the noise.

**A caution the fit hands to §3.8h, and it is not a correction.** The w3 arm here **is** v0.12 —
proven byte-identical abroad at seed 7252293 before a fresh seed was spent — and on these three
fresh seeds it reads **−0.306 (SE 0.58)** against the +0.583 (SE 0.23) it read on twelve. The two
are about 1.5 standard errors apart, so they do not contradict each other; but three seeds against
a base whose own spread here is 40.33 to 41.67 cannot price anything, which §3.8i said in advance
and which this is the same instrument demonstrating on itself. §3.8h's twelve-seed number stands as
the estimate of v0.12; this is a reminder of how little a three-seed cell carries.

**THE MARKERS, AND THIS IS THE RESULT.** Read from the fit records through §3.8g's own instrument,
pooled over each arm's three cells (3,600 games a side, about 140,000 legal-chase decisions):

> | marker, at Monet's decisions | base | h2 | h25 | h4 | s7 | the pre-registered bar |
> |---|---|---|---|---|---|---|
> | **chases where a chase is legal** | 31.5% | 31.7% | 31.8% | **31.2%** | 31.6% | **at least +1.5. Never met, and it falls at h4** |
> | episodes ever chased | 83.3% | 83.1% | 83.0% | **81.8%** | 83.2% | at least +1.5. **Moves the wrong way** |
> | conversion of a majority ever chased | 60.2% | 60.2% | 59.9% | 57.3% | 59.0% | rises. Falls |
> | pooled majority conversion | 51.0% | 50.8% | 50.5% | 47.7% | 49.9% | rises. Falls monotonically |
> | chase hit rate | 72.2% | 71.8% | 71.5% | 70.5% | 71.5% | falls — the one bar that is met |
> | **own-locked asks (sure misses into our own majority)** | 6.3% | 6.4% | 6.6% | **6.8%** | 6.4% | — |
> | the counterfactual's own-locked, same decisions | 6.3% | 6.0% | 5.8% | **5.3%** | 5.9% | — |
> | **live asks (the card is on the other side at all)** | 72.5% | 72.2% | 71.7% | **70.5%** | 71.8% | — |
> | the counterfactual's live asks | 72.5% | 72.6% | 72.7% | **73.2%** | 72.7% | — |
> | ask accuracy | 54.0% | 53.5% | 52.9% | 51.5% | 53.1% | allowed to fall |
> | sets cashed a game | 4.188 | 4.143 | 4.093 | 3.911 | 4.061 | — |

**And the counterfactual, which is the finding in one row.** `attribute.mjs` scores every ask
against the ask the base ranker would have taken. On the disagreements — the asks this credit
actually moved:

> | arm | asks moved | the base's preferred ask hit | the ask taken hit |
> |---|---|---|---|
> | h2 | 1,996 | **100.0%** | 50.1% |
> | h25 | 3,529 | **100.0%** | 39.7% |
> | s7 | 3,546 | **100.0%** | 44.5% |
> | h4 | 7,219 | **100.0%** | 29.7% |

§3.8i predicted that row before the cells — "the base's own preferred ask hits ≈100% against a
taken hit of 33–54%" — and it is reproduced to the digit at every arm. The mechanism is live, it is
large, and it does exactly what it was built to do.

**So why does the chase rate not move?** Because **the asks it buys are not chases.** The
instrument scores a chase on the true deal: the side holds four or five *by the deal*, and an
opponent really holds one of the missing cards. The credit fires on the **seat-known** majority,
and its sure-miss guard can only refuse a teammate holding the seat can *certainly* place. Measured
at home before the run, at the four-rung — 83.4% of the population — the asked card is truly with
an opponent only about four times in ten. The instrument agrees from the other side: as the dose
rises the arm's **own-locked asks rise** (6.3 → 6.8%) while its counterfactual's **fall** (6.3 →
5.3%), and the arm's **live asks fall** (72.5 → 70.5%) while its counterfactual's **rise** (72.5 →
73.2%). Every one of those four series moves the wrong way for this rung and the right way for the
ask it displaced. **The credit is not buying chases. It is buying §3.8g's own sure misses into the
side's own majority, at the price of a certain card and a kept turn.**

That is why no dose can rescue it, and it is not a statement about appetite. A seat cannot tell a
chase from a sure miss into its own majority, because that distinction is exactly the thing
§3.8g R1 measured Monet getting wrong twice as often as SESTINA (21.4% against 11.1%). **The
binding constraint is the inference about which side holds a missing card, and no term in the ask
ranker can be built on top of it.**

**What ships: nothing.** The knobs stay in the tree, absent from every roster style and every tier,
byte identity when absent, with fifteen pins and thirteen demonstrated mutations behind them. Both
identity checks held before a fresh seed was spent — the tree with the knobs absent reproduced
§3.8f's `conf-fix` cell at 5682873, and with `closing` 0.5 it reproduced §3.8h's `conf-w3` cell
at 7252293, both byte-identical on every engine line but `elapsed`.

**The ask ranker is finished, and this is what four rungs bought.** `contest` shipped at +4.04.
Then `exposure` +1.07, the declare bar priced at under 0.02 sets a game and not built, `closing`
+0.583, and `chase` negative at every eligible dose. Four consecutive terms fitted on the same
vector against a bound of +5.8 points, and the last one is the informative one: it went looking for
the missing chases, found that a seat cannot identify them, and paid a hundred points a decision to
learn it. **Row 14 changes axis.**

### 3.8j The assignment — a records study, pre-registered

**The owner's direction, 2026-09-04: "open the prs then go on v0.14."** Decision row 14's
recommendation, taken: the ask ranker is closed after four terms and the reading that closed it —
§3.8i's — names the binding constraint as *the inference about which side holds a missing card*.
That is a claim about a belief and it has never been measured directly. This study measures it,
prices what perfect side knowledge would be worth, and is written so that it can come back and say
**the assignment is not the constraint either**. Nothing ships from it; the numbers are the
deliverable, and the deliverable includes "do nothing". Run on records already on disk —
28,800 games — so **no cell is spent**, exactly as §3.8c and §3.8g were. The rules below were
written before any record was read through the new flag, with the one disclosed exception in §3.8j
item 12.

**Why the premise is in doubt before the study starts, and this is the study's own reason to
exist.** §3.8g R1 reports that Monet rates 21.4% of opponent-held missing cards as its own side's
against 11.1% at SESTINA's positions. Read in `attribute.mjs`'s `majDecision`, that statistic is
computed over a population *conditioned on the truth* — `if (x === undefined || side(x) === T)
continue` keeps only cards an opponent actually holds — and it counts certainly-located cards in
its denominator. So it is `P(q ≥ 0.5 | y = 0)`: **a false-positive rate on a truth-selected,
certainty-diluted population, not a calibration error.** A perfectly calibrated belief also puts
own-side mass on cards that turn out to be with an opponent; that is what a probability means. And
the two sides' numbers come from two different distributions of position, with nothing controlling
for phase, hand size, score or log length. Against that, `monet-v11/REPORT-fix.txt` records v0.9's
own believed-vs-realised **hit** calibration abroad, on this very corpus, at **+0.0059** — near
§3.4a's λ = 0 read (0.0019), not its λ = 0.60 read (+0.0488). The side mass is a coarsening of that
same table. **Row 14's premise may not survive its own study, and the pre-registration says so
before the numbers are read.**

#### The seam — the whole real policy runs on an injected belief, with nothing in `lib/` touched

`decide` → `resolveWithView` (`decide.ts:2150`): the spec is not a `BoundedSpec`
(`isBoundedShaped` tests `Object.hasOwn(p, 'bounded')`) and not an `AdaptiveSpec`, so it falls to
`resolvePolicy` (`style.ts:735`), where `isBotPolicy` — `'style' in p && 'skill' in p` — is true
and the spec is **returned verbatim**, extra properties and all. `knowledgeFor` (`decide.ts:287`)
then returns `pol.boundedK()` in place of its own build. So

> `decide(view, { ...monetPolicy('v0.9'), boundedK: () => kInjected }, seed)`

runs the entire real ask path — `rankAsksWith` then `pickAsk` with `contest`, the gate,
`licenceConditionedHitProbability`, `minHitP` and both near-tie windows — on a belief of the
study's choosing. **Verified on records before this was written: injecting the *same* Knowledge
reproduces `decide()` bit-identically at 4,527 of 4,527 Monet ask decisions, zero throws.** The
`--locks` declare channel takes the same seam through `planClaimFor(view, {...pol, boundedK}, b)`.
`attachMarginal`'s table is memoised in a `WeakMap` keyed on the Knowledge object and its `p` is a
live `Float64Array`, so an arm may patch the belief either by mutating `p` or by narrowing `cands`
and re-scaling. This is what makes the study a *policy* counterfactual rather than a ranker one:
the raw ranker's top-1 is the policy's chosen ask only **72.5%** of the time (measured, 3,910 of
5,396), so a bound read off `rankAsksWith` would have been measuring the wrong function.

#### The estimand and the population

At an ask decision `d` by seat `s` on side `T`, for a card `c`:

- **`q(d,c)`** = the seat's **own-side mass** = `Σ_{side(s')=T} tbl.p[j*6+s']`, from
  `k = buildKnowledge(view, OPTS)` with v0.9's own `OPTS`, `tbl = attachMarginal(k)`. This is
  character-for-character the expression `majDecision` already computes, so §3.8g R1 falls out as a
  special case rather than a second implementation.
- **`y(d,c)`** = 1 iff the true holder is on side `T`, from `dealt` via the walk's `seatOf`.

The estimand is the **joint law of `(q, y)`** — a reliability curve plus proper scores, never one
number. Two justifications for choosing the side mass over the six-seat distribution or the argmax:
the one ranker term that ever cleared the floor is an explicit function of it (`priced.ts`'s
`contestBonus` reads `opponentMass = Σ_{opponents} askHitProbability`, and since rows sum to 1 with
the asker's own entry at 0, `opponentMass = 1 − q` exactly); and an argmax discards the confidence
that a Murphy decomposition needs.

A pair is in the population iff `d` is a **pre-clinch** ask decision and `c` **is a row of the
marginal table**. The second clause does the work: `marginal.ts` defines its rows as the cards with
more than one candidate, so certainties, the seat's own hand and resolved sets are excluded **by
the data structure rather than by a filter**, and no score is inflated by free correctness or made
a function of how many certainties a position happens to carry. The population is pre-clinch **by
construction**: the walk `break`s out of the game the moment a side is awarded its fifth set
("whatever a host plays after the clinch is not the game"), which drops 8,936 of the 110,391 asks
a 1,200-game cell records — **8.1%**, and every one of them from a deal already decided. The
instrument nonetheless asserts the cut itself and reports the count, so the guarantee is pinned
rather than remembered; it reads **0**. Two nested populations:
**P_ask**, where `s` also holds a card of `cardBook(c)` so the ask is legal — **primary for the
bound and every falsifier**, because the licence rule means nothing outside it can become an action
— and **P_all**, primary for the mechanism diagnosis. Measured, the split is **56.1% / 43.9%**, and
the two are never pooled without saying so. Both sides' decisions: Monet's seats are **A**,
SESTINA's seats through Monet's inference are **B**.

**The belief is sound, which is what makes the estimand well posed.** Over 477,985 (decision, card)
checks, `cands[c]` contained the true holder **477,985 times — zero exclusions**. The inference is
never *wrong* in the sense of ruling the truth out; it can only be miscalibrated, spreading mass
badly among candidates it correctly keeps alive. `truthNotCandidate > 0` anywhere **voids the
study** rather than becoming a finding.

#### The corpora and their roles, fixed now

| role | records | seeds | games |
|---|---|---|---|
| primary, and the **fitting** set for any recalibration map | `monet-v12/records --prefix conf-base-` | 12 | 14,400 |
| replication, and **out-of-sample** evaluation | `monet-v11/records --prefix conf-fix-` | 12 (disjoint) | 14,400 |
| third read | `monet-v13/records --prefix fit-base-` | 3 | 3,600 |

The two twelves share **no seed** (checked). Nothing fitted on one is evaluated on itself.
**Corpus-integrity check, done before the pre-registration rather than assumed:**
`monet-v11 conf-fix-*` carries three arm ids in a 4/4/4 split (`bot:monet-v11-fix`, `-fix-l1`,
`-fix-l2`); all three `EXPECT-` files read identically — `override={"contest":0.6} mustfix=1` —
under one `ARM_MD5` and one `specB`, so they are lane labels for a single vector and the corpus
pools. `monet-v12 conf-base-*` is uniformly `bot:monet-v12-base`.

**Identity pins, checked before any new number is believed.** (a) The `--majority` block on
`monet-v11 conf-fix-*` reproduces §3.8g's published R1 to the digit — 21.41 ± 0.40 / 11.13 ± 0.20,
paired +10.28, SE 0.12, 12 of 12 — since §3.8g was measured there. (b) `--validate-assign` at
100.0%: the unpatched `shipped` arm must equal `decide()` everywhere. (c) The refactor that hoists
the belief build out of `majDecision` is diffed to the digit on one seed before and after.

#### The readouts

**R1 — the reliability curve.** Deciles of `q` against realised `ȳ`, so §3.4a's standing bar
("every decile within 0.05, the aggregate within 0.01") transfers unchanged. Per bin: `n`, mean
`q`, realised share, bias, and the per-seed spread. Then **Brier with its Murphy decomposition into
reliability, resolution and uncertainty**, and **log loss**. Reliability says whether the belief is
*honest*; resolution says whether it is *informative*. Only the pair distinguishes "correct the
calibration" from "there is no signal to correct", and that distinction is what decides whether the
cheapest mechanism is alive. The slot prior is scored alongside (nearly free) so the marginal's own
contribution on this population is visible. Reported at A and at B.

**R2 — where the error lives.** Splits chosen so each indicts a mechanism rather than describing a
quantity: `|cands|` (2/3/4/5/6 — the Sinkhorn spread itself); cards live; sets awarded; **whether a
licence for `c`'s set was published for the true holder** (constraint propagation from the ask
log); the side's holding of `c`'s set; surviving constraints mentioning `c` (the one-shot
conditioning in `marginal.ts` step 3); **whether the true holder later asked into the set**
(`choiceKappa`'s evidence, absent from v0.9's vector); and the table's `converged` flag.

**R3 — the position control, and it is the answer to §3.8g's composition problem.** At every eighth
ask decision, build the Knowledge for **all six seats over the same byte-identical log** and score
every one. The position is then held literally constant and only the chair and the hand differ.
Verified feasible: 1,706 builds over 300 sampled positions, every one scaled, zero throws. This
replaces reweighting, which can only adjust for the covariates someone thought to name.

#### The bound — a bracket, and a pricer that must first reproduce answers already known

No bound here uses a hit rate as a value (§3.8c: SESTINA hits less and wins more; §3.8h: Monet hit
seven points worse on purpose and won +0.58), none replays forward past a changed action, and
**none may be quoted until the same arithmetic has reproduced the measured abroad deltas of arms
already on disk.** That last clause is what §3.8g's 0.39-sets-a-game bound lacked; it over-stated
the delivered result by a factor of ten.

**B0, the pricer.** Currency is **asks moved a game** in matched one-step counterfactual units,
which `attribute.mjs --cf` already counts. Fit measured paired points on matched move rate over the
thirteen-plus arm-points on disk, spanning **+4.04 to −7.56** across four mechanisms — an
interpolation across the sign, not an extrapolation. The two known anchors: `closing` moved 1.38%
of Monet's asks for **+0.583** (+0.422 points per 1% moved) and the `chase` ladder moved 1.33–4.82%
for **−1.08 to −7.56** (−0.81 to −1.57 per 1%). **Favourable and adverse rates are reported
separately, because the ladder shows them asymmetric**, and a flip budget is priced at the
favourable rate only as an upper bound. Quoted only if leave-one-out RMSE ≤ 1.5 points with the
sign right on ≥ 12 of the arm-points; otherwise the study reports asks and sets and **refuses to
convert to points at all**, and says so in its headline.

> **The kill switch this produces:** +2.00 (the twelve-seed floor) ÷ +0.422 (the best favourable
> rate any rung has recorded) = **4.74% of Monet's asks = 1.97 asks a game.**

**B1, the reachability bracket.** At every Monet ask decision, build a fresh Knowledge, patch it,
and call the **real `decide`** through the seam. Six nested arms — `shipped` (the identity control),
`recal` (a fitted monotone map: what a recalibration knob would actually ship), `side-p` (own-side
entries zeroed, true side renormalised, `cands` untouched), `seat-p` (side masses held, mass moved
*within* each side onto the truth), `side-c` (`cands` narrowed to the true side and re-scaled), and
a **`nuisance` control** of equal total variation carrying no side information. `flips(recal) ≤
flips(side-p) ≤ flips(side-c)` is checked as a free consistency test; a violation is a bug, not a
finding. **The bracket is the deliverable, never a single arm.** A p-only patch cannot cross the
certainty boundary — `pHit` short-circuits on `cands` before consulting the table, and on v0.9
(`pricedUngated` false) a certain hit always outscores any uncertain ask — so `side-p` is the
**lower** end and `side-c` the upper. That same structural fact is the sharpest difference from
v0.13: **no assignment mechanism, at any dose, can displace an ask that hits 100.0%.** Certain-hit
displacement is therefore predicted at exactly 0 for the p-arms, and anything else is a bug in the
patch. Each flip is classified — dead→live, retarget, re-card, live→dead, became a deliberate
`containedPass`, or the arm declared instead of asking (counted separately, a free read on the
declare channel).

**B1b, the declare budget.** The same patched Knowledge through `planClaimFor`, re-running
`--locks`' existing RULES/EV table, which is already denominated in **sets of differential**. §3.4b
and §3.6c predict this is near zero. If it is not, v0.14 is a declare rung and not an ask rung, and
the study has found something row 14 did not name.

**B2, the misattributed-set ceiling.** Reusing `--majority`'s episode tracker: episodes that ended
taken or open in which a Monet seat on turn carried `q ≥ θ` on an opponent-held card of that set,
had the ask legally available, and a B1 arm actually flipped there. Reported in **sets a game** at
θ = 0.3 / 0.5 / 0.7. **Its own validation comes first and is mandatory: computed retroactively on
v0.12's and v0.13's own flip sets, it must price those two at or under +1 point, or it is
discarded.** A ceiling that would not have caught the last two failures is not a ceiling. §3.8g's
tenfold shrinkage is printed in the header of every table carrying it, as the class prior.

#### The falsifiers — seven numbers, any three of which close the axis

**F2 and F5 are computed and read first**, before any calibration table is interpreted; that
ordering is what stops the study becoming another marker hunt. **F2 or F5 alone refuses a dose.**

| | fires when | and then |
|---|---|---|
| **F1** the belief is already calibrated | `REL/B < 0.12` **and** aggregate \|bias\| < 0.02 **and** Cox slope in [0.90, 1.10] on P_ask at A | a recalibration knob is dead, and §3.8g R1 was a threshold statistic |
| **F2** **the kill test** | the `side-c` arm changes Monet's ask at **< 4.74% of pre-clinch decisions (< 1.97 a game)** | perfect side knowledge cannot clear the floor, so no approximation to it can — answer row 14 with the null and stop |
| **F3** the axis is not distinguished | `flips(side-p) ≤ flips(nuisance)`, or `flips(seat-p) ≫ flips(side-p)` | the injection does nothing specific, or row 14 named the wrong half of the belief (seat, not side) |
| **F4** the position confound | the **six-seat synchronous** A−B gap ≤ **+3.0** points against the cross-position +10.28 | ≥ 70% of R1 was position generation; the object is whatever makes Monet's positions harder, which is not a belief axis |
| **F5** the sets are not there | B2 < **0.30** sets a game at (θ = 0.3, any), or < **0.10** at (θ = 0.5, only-chance) | against a 0.134 floor and §3.8g's realised tenth, not a rung |
| **F6** nothing is reducible | out-of-sample Brier reduction < 15%, map fitted on `monet-v12` and evaluated on `monet-v11` | with F1, the axis closes outright |
| **F7** leakage, not inference | the A−B gap dissolves under the true-holder's-policy split, or A seats locate ≥ 0.5 more teammate cards a decision | the lever is `conceal` — publication, not inference |

**The study is void rather than negative if:** `truthNotCandidate > 0`; the `shipped` arm disagrees
with `decide()` anywhere; §3.8g R1 is not reproduced on `monet-v11`; or the error concentrates on
non-converged tables.

**What the roadmap does on a negative, named now** so the branch is not invented afterwards: the
ladder will have measured out both the ask ranker (four terms) and the belief, and row 15 goes to
**(i) the even-3 bucket** — §3.8c R1's largest single bucket, ~40% of SESTINA's extra sets a game, a
3–3 deal won 58–42, never attacked by any rung and not a belief question; **(ii) `conceal`**, the
only built mechanism in the tree with no number at all, which has fired on 0.000% of asks under
every shipped style; or **(iii) stop** — §3.9's acceptance on v0.9's vector. Five consecutive
well-measured negatives is a stronger artefact than a sixth fitted knob.

#### The instrument, its cost, and the stop-ladder

New flags on `scripts/attribute.mjs`; **nothing in `lib/` is touched**: `--assign`,
`--assign-pop licensed|all|both`, `--assign-null`, `--assign-sync N`, `--assign-splits`,
`--assign-rerank <arms>`, `--assign-recal FILE`, `--assign-declare`, `--assign-episodes`,
`--flip-json`, `--assign-json`, `--validate-assign`. The belief build is hoisted out of
`majDecision` and shared, so R1 and §3.8g's block read one table. `--per-seed` walks every record
twice and must never be combined with `--assign`; per-file JSON is pooled offline.

**Cost, measured rather than estimated:** a Knowledge and marginal at every one of 101,455 ask
decisions costs **12.5 s per 1,200-game file**; the real-plus-oracle double pass costs about the
same; `--majority` over 14,400 games is 198.4 s. Everything but the declare channel is ~8.5 minutes
single-process per 14,400 games, and the corpus is twelve independent files, so **2–4 minutes wall
at four lanes** (more lanes contend: the same class of cell reads 749 s at three lanes and 1,529 s
at twelve). **This is not a compute-constrained study, and no sampling scheme is needed.**

The staging *is* the stop-ladder: (0) B0's retro-validation on existing flags only, and the
thresholds freeze after it; (1) tripwires on one already-spent seed of the replication corpus;
(2) `side-c`, `side-p`, `nuisance` on that seed — **F2 and F3, and if F2 fires, stop and write the
negative**; (3) the primary twelve; (4) the six-seat control on four seeds; (5) the replication
twelve and the out-of-sample map; (6) the declare channel, conditional and off the critical path;
(7) the three-seed third read.

#### The disclosure — the one number already seen, and why it is reported here

Proving the seam bites required running it, and the flip count came with it. §3.8g set the
precedent by publishing its own one-seed pilot inside its pre-registration; this does the same
rather than pretend the number was not seen.

> **Pilot, `conf-base-1027753`, 1,200 games, 4,527 Monet ask decisions.** The `side-c`
> full-information side oracle changes Monet's chosen ask at **38.6%** of them (1,748). All 1,748
> are ask→ask: **1,657 change the card, 91 keep the card and change the opponent, none becomes a
> claim or a pass.** The identity control was exact at 4,527 of 4,527.

**So F2 does not fire on the upper arm.** 38.6% is roughly 16 of Monet's ~41.6 asks a game, eight
times the 1.97 bar; the belief demonstrably reaches the policy at scale. That settles *connection*
and leaves *value* entirely open — v0.13 moved 2 asks a game and lost 7.56 points. Because this
quantity was seen, **no prediction is offered for `side-c`**; the predictions below cover the arms
that have not been run and the twelve-seed spread.

#### Predictions, written before the rest is read

| # | prediction | why |
|---|---|---|
| P0 | `truthNotCandidate` exactly 0; `noTable` ≈ 0 | pins, not guesses — both measured at 0 already |
| P1 | `ȳ` on P_ask **0.28–0.40** both sides; `ȳ_A − ȳ_B` **+0.01 to +0.05** | two teammates against three opponents, own cards excluded |
| P2 | aggregate bias at A **+0.005 to +0.03**, own side over-stated | v0.9's abroad hit calibration is measured at **+0.0059**; the side mass coarsens that table |
| **P3** | **`REL/B < 0.12` — the loss is RESOLUTION, not calibration** | a max-entropy Sinkhorn scaling under hard constraints is near-calibrated on average and weak at discrimination. **The prediction I am least sure of, and the one that decides whether a recalibration knob is alive at all.** If it holds, §3.8g R1's 21.4% was a false-positive rate and row 14's premise does not survive |
| P4 | the **six-seat synchronous** A−B gap **+4 to +7**, against +10.28 cross-position | i.e. R1 is a third to a half position artefact |
| P5 | `side-p` **3–12%** of asks; `recal` **< 1.5%**; `nuisance` ≪ `side-p` | a monotone map preserves within-decision order and can bite only through the mix |
| P6 | certain-hit displacement **0** for `side-p`/`seat-p`/`recal` | structural; anything else is a bug |
| P7 | at least half of Monet's own-locked asks are deliberate `containedPass` turn-passes | `containedPass: 1` is on the vector, so §3.8g R2's 33.2% may be partly a working policy |
| P8 | B2 at (θ = 0.5, any) **0.10–0.30 sets a game** | against §3.8g's 0.39 for the whole conversion |
| **P9** | **on the balance of P2–P4, the study returns "not the binding constraint"** | stated against the recommendation that opened row 14, so the study can be wrong out loud |

**What may not be concluded, written now.** No claim about SESTINA's belief — column B is Monet's
engine in a B chair. No A−B claim from cross-position tables alone. The hit rate of moved asks is
printed and is **not** evidence of value. Nothing ships from this study.

**Seeds.** These corpora are already spent as records. 8675309 / 271828 / 1618033 remain reserved by
§6.5. Any v0.14 fit that follows draws fresh banks from `hashSeed("monet-v0.14-fit-3")` and
`hashSeed("monet-v0.14-confirm-12")`, written here before the first fitting cell runs.

**The candidates row 15 will choose between**, ranked by the evidence this study can deliver
against cost and the prior from four dead ranker terms: **M3, the deduction fix** (arc-consistency
over the at-least-one-of constraints, or exact conditioning on the small residual instance) — a
correctness fix rather than a dose, the only candidate that can reach the `side-c` − `side-p` gap;
**M1, a fitted monotone recalibration** of the own-side mass on the ask path, which carries §3.8h's
warning that a belief-weighted closing form read **−0.472 and −2.167, losing six seeds of six**;
**M2, `choiceKappa`**, already in the tree, off the vector, read at +0.37 to +0.47 inside the floor
(§3.6c) and reopened here on an instrument thousands of times sharper and on the subpopulation
where it should bite; **M4, `conceal`**; **M5, within-side resolution**, against §3.5c's 300–600×
price; and **M-NULL, nothing on this axis — a first-class candidate.**


#### Record — 2026-09-04

**The premise of row 14 does not survive its own study. The belief about which side holds a missing
card is CALIBRATED — reliability is 0.22% of its Brier score over 19 million labelled pairs on two
disjoint twelve-seed corpora — and §3.8g R1's 21.4% against 11.1% is a base rate and a confidence
distribution, not an error. Three falsifiers fire (F1, F3's second clause, F6), so by the rule as
written the assignment axis CLOSES. Nothing ships. What the study found instead is a
deduction defect, and it names the rung.** No cell was spent; every number below is read off
records already on disk.

**The instrument certifies itself three ways before a number is believed.** The `shipped` arm —
the belief injected through the `boundedK` seam without a patch — reproduces `decide()` at
**49,787 of 49,787** Monet decisions, so any later difference is the injected belief and nothing
else. The hoist that shares one belief build between `--majority` and `--assign` leaves §3.8g's
report **identical to the digit** on a re-run seed. And Stage 0's move rates reproduce the
published counts exactly: `closing` w3 **8,287 asks, 1.38%** (§3.8h's 8,287 / 1.4%), `chase` h2
**1,996** and h4 **7,219** (§3.8i's), `contest` **15.21%** (§3.8d's 15.2%). Tripwires on both
corpora: the true holder outside `cands` **0 of 19,158,000** — the belief is sound and can only be
miscalibrated, never wrong — tables that would not scale **0**, post-clinch decisions **0**.

**B0, the pricer, FAILS its own retro-validation, and that is the first result.** Fitted on fifteen
arm-points spanning +4.04 to −7.56: leave-one-out RMSE **3.71** against a 1.50 bar, sign right on
**9 of 15** against a bar of 12, R² **0.069**. The pre-registered consequence binds — **this study
reports asks and sets and refuses to convert either into points.** The reason is worth more than the
pricer would have been: **the sign belongs to the mechanism, not to the move rate.** `contest`
moved **15.21%** of Monet's asks for **+4.04**; `chase` h4 moved **5.05%** for **−7.56**. Within a
family the relation is tight (chase R² 0.810, the favourable arms 0.903); across families it carries
no information at all. "Asks moved" is a magnitude with no direction — which is also the
retrospective explanation of §3.8g's tenfold over-statement, since it assumed a single conversion
rate that does not exist.

**R1, the belief.** Licensed population, at Monet's own decisions:

> | corpus | pairs | mean q | realised y | bias q−y | Brier | reliability | resolution | uncertainty | REL/Brier |
> |---|---|---|---|---|---|---|---|---|---|
> | primary, `conf-base` × 12 | 9,503,599 | 0.4232 | 0.4246 | **−0.0014** | 0.2280 | 0.0005 | 0.0159 | 0.2443 | **0.0022** |
> | replication, `conf-fix` × 12 | 9,475,021 | 0.4238 | 0.4259 | **−0.0020** | 0.2281 | 0.0006 | 0.0160 | 0.2445 | **0.0026** |

The two disjoint twelves agree to **0.0006** on the bias and **0.0001** on reliability. **F1 fires
by a factor of about fifty** on both, on all three of its conditions, and the sign of what little
bias there is runs **negative** — Monet slightly *under*-states its own side, the opposite of the
direction row 14 assumed. Where the curve does leave the diagonal it is under-confident at the top:
[0.6, 0.7) reads 0.645 → 0.722 and [0.8, 0.9) 0.840 → 0.928, so §3.4a's decile bar of 0.05 is
failed by one bin at 0.077 while its aggregate bar of 0.01 passes at 0.0014. The belief is honest
and **not very informative**: resolution 0.0159 against an uncertainty of 0.2443. The loss, such as
it is, is resolution and not calibration — the pre-registered prediction P3, the one flagged as
least certain, and it decides the cheapest mechanism.

**F6 fires by arithmetic, with nothing fitted.** Murphy gives Brier = REL − RES + UNC, so a perfect
monotone recalibration removes at most REL: **0.22% of Brier**, against F6's bar of 15%. **No
recalibration map, fitted on any corpus, can reach the bar.** M1 is dead twice over.

**Why §3.8g R1 is not diagnostic, measured directly.** Recomputing its own statistic on this
broader population reproduces its structure — P(q ≥ 0.5 | y = 0) is **11.48%** at Monet's decisions
against **5.48%** at SESTINA's, a ratio of 2.1× where §3.8g read 1.9×. **But the identical gap is
present on the cards the seat gets RIGHT: 26.71% against 15.78%, a ratio of 1.7×.** A
miscalibration would be asymmetric — inflated false positives beside normal true positives. There
is no asymmetry. Monet's belief is more confident at Monet's positions because those positions
carry more of its own side outstanding: the base rate is **42.4%** against **39.6%**. §3.8g's
clause (b), and row 14's premise with it, rested on a statistic that a perfectly calibrated
forecaster reproduces.

**B1, the reachability bracket** (one seed, 49,787 Monet ask decisions; reported in asks because
Stage 0 licensed no conversion):

> | arm | flips | % of Monet's asks | a game | the base ask was a sure miss | sure miss → live | column drift |
> |---|---|---|---|---|---|---|
> | `shipped` | **0** | 0.0% | 0.00 | — | 0 | 0 |
> | `side-p` | 17,510 | **35.2%** | 14.59 | 73.5% | 12,281 | 0.017 |
> | `side-c` | 19,464 | **39.1%** | 16.22 | 68.2% | 12,338 | 0.000 |
> | `seat-p` | 24,558 | **49.3%** | 20.46 | 45.8% | 10,895 | 0.020 |

**F2 does not fire**: 35–39% against a bar of 4.74% pre-registered, or 8.7% at the fitted
favourable slope — clear by four to eight times either way. Perfect side knowledge reaches the
policy at scale, and three flips in four displace an ask that was a **sure miss into the seat's own
side**, which is exactly the channel §3.8i named. Connection was never the problem.

**F3's second clause fires, and it relocates the question.** `seat-p` moves **49.3%** of asks
against `side-p`'s **35.2%** — and `side-c`, the full side oracle *with* the certainties it creates,
still only reaches 39.1%. **The ranker is markedly more sensitive to which SEAT holds a card than
to which SIDE holds it.** Row 14 named the half of the belief the policy cares about less.

**F3's first clause is not evaluable, and the reason is a finding in its own right.** An
equal-magnitude, information-free null cannot be constructed: pinning cards to sides other than the
truth violates the seats' slot counts, the instance becomes infeasible, and Sinkhorn cannot restore
the margins. Measured column drift is **12.0** for a coin-flip side and **3.0** even for a
count-preserving label shuffle, against **0.017** for `side-p` and **0.000** for `side-c`.
**Feasibility is not separable from correctness here**, so the nuisance arm is reported and not
used. An arm that reorders asks because it is incoherent would price the incoherence.

**R2, where the error lives — and this is what the study found instead.** Bias · Brier · n:

> | split | A (Monet) | B |
> |---|---|---|
> | **a licence for the set is on record at the TRUE holder — yes** | **−0.0851** · 0.1325 · 2.20M | **+0.1161** · 0.0984 · 2.57M |
> | — no | +0.0129 · 0.2403 · 14.51M | −0.0203 · 0.2421 · 14.68M |
> | \|cands\| = 2 / 3 / 4 / 5 | −0.0178 / −0.0258 / −0.0074 / +0.0030 | +0.0134 / +0.0120 / +0.0019 / −0.0015 |
> | the true holder later asks into the set — no / yes | −0.0299 / +0.0146 | −0.0016 / +0.0008 |

**The licence split is the largest effect in the study by an order of magnitude.** Where the ask log
carries a licence for the card's true holder — 13% of the population — the belief becomes far more
informative (Brier **0.1325** against an aggregate 0.2280) and far more biased (**−0.085** at A,
**+0.116** at B, a twenty-point spread). The evidence is being read, and read with a systematic
offset. The error also concentrates at **|cands| = 2–3**, precisely where the counting argument is
near-exact and only a missed deduction can separate two seats. Both point the same way, and away
from the mechanism row 14 assumed.

**What was pre-registered and NOT run when this record was written.** Three readouts of §3.8j were
not built for it: **R3, the synchronous six-seat control** (and with it F4 as written), **B1b, the
declare budget**, and **B2, the misattributed-set ceiling** (and with it F5). R3 was verified
*feasible* before the pre-registration — 1,706 Knowledge builds over 300 sampled positions, all
scaled, zero throws — and it remains the cleanest way to separate position generation from
inference. It was not needed to reach this record's conclusion: three falsifiers fire without it
(F1, F3's second clause, F6), which is the rule's own threshold, and the question R3 exists to answer
is answered more directly by the true-positive mirror above — the A/B gap is the same size on the
cards the seat gets right as on the ones it gets wrong, which no amount of position control can
explain away. B1b and B2 price a rung that F1 and F6 had already killed, so they were left off the
critical path exactly as the staged plan allowed — **and were run the next day, at the owner's
word, before row 16 was written: the addendum at the end of this section carries them, and F5 is
read there.** R3 is still unrun. **If row 16 revisits the axis, R3 is the first thing to build.**

**What is fixed by this record.** Nothing on Monet's vector. The instrument
(`scripts/attribute.mjs --assign`, with `--assign-rerank`'s injection arms and the `boundedK` seam
that needs no engine change), the pricer's failure, and the numbers above. **Decision row 15
carries the reading: the assignment axis is closed on its calibration, and the candidate that
survives is M3, the deduction fix** — arc-consistency over the at-least-one-of constraints, or exact
conditioning on the small residual instance in `marginal.ts` — justified by the licence split and
the |cands| = 2–3 concentration, and it is a **correctness fix rather than a dose**, so §6.3's
floor does not gate it and no seeds are burned choosing a knob. M1 is dead (F1 and F6). M2 is not
supported: the "true holder later asks" split moves the bias by 4.5 points against the licence
split's twenty. Against all of it stands the honest prior of five consecutive measured negatives,
and **M-NULL — §3.9's acceptance on v0.9's vector — remains a first-class candidate.**

**Predictions, scored.** P0 **hit** (soundness 0 of 19.2M, `noTable` 0). P2 **missed** — I predicted
+0.005 to +0.03 and the answer is −0.0014, an order of magnitude smaller and the other sign.
**P3 hit**, and it was the one I flagged as least certain. P5's `side-p` band of 3–12% **missed
badly** at 35.2%. **P9 hit**: the study returns "not the binding constraint". The pilot disclosure
stands — the `side-c` flip rate was seen on one seed before the rest was read, and no prediction was
offered for it.

**Scratch state, not committed:** `$SP/monet-v14/{stage0.sh,pricer.mjs,out/}` with the fifteen
arm-point cells, `HOIST-BEFORE/AFTER.txt`, `out/{PRICER,stage1,stage2,assign-primary,assign-replication}.txt`;
the probes `$SP/{cost,feas,sound,drift,mutcheck,pop,fidelity2,seam2}-v14.mjs`; the design panel's
output at `$SP/v14-synthesis.md` and the measured ground facts at `$SP/v14-ground-facts.md`.

#### Addendum — 2026-09-05: B1b and B2, run the day after the record

**Why now.** The record above closed the axis on F1, F3 and F6 and left B1b and B2 unrun. The
owner asked for both before row 16 was written, so they were built and run — on the records, no
cell spent — and are reported here in full, including the half of B2 that fails its own validation.

**The instrument, and its pins.** Two flags on `scripts/attribute.mjs`. `--locks-arm <arm>` sends
one B1 arm's patched Knowledge through `planClaimFor` by the same `boundedK` seam — `planClaimFor`
resolves a `{skill, style}` spec verbatim exactly as `decide` does, and `planClaim`'s joint reads
`marginalFor(k)`, the WeakMap memo `attachMarginal` filled, which is the table patched in place;
the instrument asserts that identity rather than assuming it. `--b2` counts the
misattributed-set ceiling over `--majority`'s existing episode tracker, per `--assign-rerank` arm;
`--b2-arm <knobs>` adds a `retro` arm — an arm whose abroad value is already measured, decided as
a one-step counterfactual at the base's own decisions — and `--cf-knobs` pins that arm to its
bridge records before it prices anything. Pins, before a number was read: `--locks-arm shipped`
reproduces plain `--locks` **byte for byte** on `conf-fix-5682873`; the B2 patch leaves the
`--majority` report identical; the `shipped` arm reads 0 flips and 0 episodes; `--b2-arm wHit=70`
(v0.9's own value) flips **0 of 49,819** decisions; and the in-engine arms are the bridge arms —
`closing` 0.5 reproduces `bot:monet-v12-w3`'s recorded play at **100.0%** on its own records and
`chase` 4 reproduces `bot:monet-v13-h4`'s at **100.0%**.

**B2's validation, which the pre-registration made mandatory, discards half of it.** The ceiling
computed on the flip sets of four arms whose value is measured, in sets a game, against the bar of
+1 point = **0.067** sets (14.96 points a set). "Any" = at least one legal chance in the episode was
hidden (own-side mass q ≥ θ on an opponent-held card of the set, the seat on turn holding a card of
it); "only" = every legal chance in the episode was.

> | flip set — the arm as a counterfactual at the base's decisions | measured | flips | (0.3, any) | (0.5, any) | (0.7, any) | (0.3, only) | **(0.5, only)** | (0.7, only) |
> |---|---|---|---|---|---|---|---|---|
> | v0.12 `closing` 0.5 on `conf-base` × 12 | **+0.583** | 1.8% | 0.486 ✗ | 0.168 ✗ | 0.017 | 0.341 ✗ | **0.031** | 0.001 |
> | v0.13 `chase` 4 on `fit-base` × 3 | **−7.56** | 7.0% | 0.793 ✗ | 0.318 ✗ | 0.035 | 0.526 ✗ | **0.031** | 0.000 |
> | (extra) v0.13 `chase` 2 | −1.08 | 2.1% | 0.269 ✗ | 0.086 ✗ | 0.006 | 0.174 ✗ | 0.010 | 0.000 |
> | (extra) `closing` 0.5 on v0.13's three seeds | −0.306 | 1.8% | 0.472 ✗ | 0.168 ✗ | 0.015 | 0.332 ✗ | 0.036 | 0.002 |

**The (θ = 0.3, any) cell — F5's first — would have promised +7 and +12 points to arms that
delivered +0.58 and −7.56. It is discarded, and with it every "any" cell below θ = 0.7 and the
(0.3, only) cell. The (θ = 0.5, only-chance) cell — F5's second — prices all four at ≤ +0.5 and
survives, as does everything at θ = 0.7.** That a surviving cell reads the same 0.03 for +0.58 and
for −7.56 is what a ceiling is: a bound on a channel, not a prediction for a mechanism, and the
pre-registration said so ("an upper bound").

**B2 on the B1 arms, read on the surviving cells only.** Both twelve-seed corpora, sets a game;
the class prior printed in every header applies — §3.8g's 0.39 delivered 0.039. Monet's majority
episodes run 6.69 a game, 3.30–3.32 of them at risk (taken 2.36, open 0.95), and in 0.44 a game
every legal chance was hidden at θ = 0.5 before any flip is asked for.

> | arm | flips, `conf-fix` / `conf-base` × 12 | **(0.5, only)** `conf-fix` | **(0.5, only)** `conf-base` | one seed | (0.7, only) | (0.7, any) | (0.5, any) — discarded | (0.3, any) — discarded |
> |---|---|---|---|---|---|---|---|---|
> | `shipped` | 0.0% / 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
> | `side-p` | 35.5% / 35.6% | **0.334** | **0.328** | 0.318 | 0.013 / 0.015 | 0.234 / 0.238 | 1.553 / 1.563 | 2.552 / 2.565 |
> | `seat-p` | 49.4% / 49.4% | **0.419** | **0.412** | 0.406 | 0.013 / 0.014 | 0.219 / 0.220 | 1.730 / 1.741 | 2.962 / 2.978 |
> | `side-c` | 39.3% / 39.4% | **0.344** | **0.342** | 0.325 | 0.013 / 0.016 | 0.240 / 0.243 | 1.579 / 1.591 | 2.600 / 2.615 |

(The one-seed B1 bracket of the record replicates on both twelves in passing: `side-p` 35.5 /
35.6%, `seat-p` 49.4 / 49.4%, `side-c` 39.3 / 39.4% of Monet's 598,882 and 599,740 asks,
`shipped` 0 on both. F3's second clause stands at twelve seeds.)

**F5 does not fire**: the (θ = 0.5, only-chance) cell reads **0.334 / 0.328** for `side-p`,
**0.419 / 0.412** for `seat-p` and **0.344 / 0.342** for `side-c` sets a game on the two twelves,
against a bar of **0.10**. So the misattribution channel is real and bounded — under a *perfect*
belief about a third of a set a game (0.33 with the side, 0.42 with the seat), +5 to +6 points at
the exchange rate, is at stake in Monet's own majority episodes where every chance was hidden by
the belief; with the tenfold class prior, about half a point. That is the whole room a belief
mechanism has in the two-against-four bucket, and it sits inside the 47% of the residual §3.8g
located there. It is the room for M3, the deduction fix, and not for a recalibration — F1 and F6
stand — and even a deduction fix reaches only the part of it a better-resolved belief can see.

**B1b, the declare budget: not near zero in sets, near zero in wins.** `--locks`' RULES/EV table,
in sets of differential a game (right: 0 if A cashed the set anyway, +2 if the other side had got
it, +1 if it stayed open at the clinch; wrong: −2 / 0 / −1), under each arm, per seed on the twelve
replication seeds — Δ against `shipped` as mean ± SE over seeds, `shipped` being plain `--locks`:

> | rule | `shipped` fires/g · right · EV | `side-p` EV · Δ | `seat-p` EV · Δ | `side-c` EV · Δ |
> |---|---|---|---|---|
> | certain plan (u = 0), any seat | 0.427 · 100.0% · 0.021 | 0.021 · +0.000 | 0.021 · +0.000 | **0.108 · +0.087 ± 0.003** (0.924/g) |
> | any u ≥ 1, p ≥ 0.9 | 0.071 · 98.8% · 0.011 | **0.136 · +0.126 ± 0.003** (0.759/g at 99.8%) | 0.126 · +0.115 ± 0.003 | −0.012 · −0.023 ± 0.004 |
> | any u ≥ 1, p ≥ 0.775 | 0.133 · 77.6% · −0.019 | 0.097 · +0.117 ± 0.004 | 0.144 · +0.163 ± 0.004 | −0.020 · −0.000 ± 0.004 |
> | gated u ≥ 1, p ≥ 0.775 (the gate as shipped) | 0.019 · 79.7% · −0.001 | 0.002 · +0.002 ± 0.001 | 0.073 · +0.074 ± 0.002 | −0.029 · −0.028 ± 0.005 |
> | by u: 0.9 on one guess, 0.7 on two, 0.6 on three or more | 0.110 · 91.3% · 0.008 | −0.011 · −0.019 ± 0.005 | **0.161 · +0.153 ± 0.003** (0.471/g at 97.2%) | −0.020 · −0.028 ± 0.004 |
> | **the budget: the arm's best rule against `shipped`'s best (the certain plan), per seed** | 0.021 | **+0.115 ± 0.003** (ahead on 12 of 12) | **+0.140 ± 0.004** (12 of 12) | **+0.087 ± 0.003** (12 of 12) |

The primary corpus (`conf-base` × 12, per seed the same way) replicates it: the budget **+0.115 ±
0.004** for `side-p`, **+0.137 ± 0.004** for `seat-p`, **+0.089 ± 0.003** for `side-c`, ahead on 12
of 12 each, `shipped`'s best 0.026; the open-set share of the arms' best rules 96% / 82% / 95%, the
win-relevant units 54 / 300 / 39.

**In the pre-registered currency the budget is not near zero: the best rule gains +0.09 to +0.14
sets of differential a game under a perfect belief, at the +2.00 floor of 0.134.** §3.4b's and
§3.6c's prediction fails in that currency, and the pre-registered consequence would read "v0.14 is a
declare rung". **It is not, and the table's own columns say why** — a reading made after the
numbers, on columns the table already carried. For `side-p`'s best rule (10,936 fires on the
twelve seeds, 13.2 events earlier than A's own declare, 99.8% right) the accounting is 8,974 fires
on sets A cashed anyway (8 wrong), **44** on sets the other side got (all right), and **1,918 on
sets open at the clinch (1,906 right) — 96% of its EV**. `seat-p`'s best (6,787 fires, 97.2%
right) is 4,438 / 361 (308 right) / 1,988 (1,928 right) — 80% from open sets; `side-c`'s certain
plan (13,301 fires against `shipped`'s 6,151, 9.3 events earlier) is 11,772 / 29 / 1,500 — 96%.
In `us54` a set open at the clinch sits in a decided game: nine sets, the clinch at five, so the
losing side plus every open set is at most four, and a `+1` there never changes the winner of the
game it was counted in — the `open at A = 4, a win if cashed` column is **0** on every rule and
every arm because it cannot be otherwise. §3.8f read the same lever the same way ("what is left
for a bar is the 14.2% of Monet's declarable sets open at the clinch"). What the accounting cannot
see, in either direction, is tempo — a set cashed thirteen events earlier changes the rest of the
game and the accounting holds it fixed. The win-relevant units — a set the other side got which the
rule would have cashed first — are **44** for `side-p` and **29** for `side-c` in 14,400 games,
0.002–0.003 a game, under a tenth of a point; and **308** for `seat-p` against 80 gifts of sets A
would have cashed and 60 wrong calls on open ones, a net 0.03 a game, under half a point — all of
it under an oracle. **The declare is not the rung.** §3.4b and §3.6c were right about wins and
wrong about sets, and the oracle's sets are the ones §3.8f already priced at a quarter of a point.

**What changes in the record above.** None of its conclusions. F5, now evaluable on its surviving
cell, does not fire, so the falsifier count stays at three (F1, F3's second clause, F6): the axis is
closed on calibration, and the channel's ceiling is measured instead of assumed. One more
prediction is scored: **P8 missed** — it put B2 at (θ = 0.5, any) in 0.10–0.30 sets a game and the
cell reads 1.55–1.74, five times the top of the band; that the validation then discarded the cell
makes the miss moot for the reading, not for the score. R3 remains unrun. Row 16 was the owner's,
and the owner took it.

**Scratch state, not committed:** `$SP/monet-v14b/{run-b2.sh,run-b1b.sh,b1b-table.mjs,b1b-agg.mjs,out/}`
— the pins (`b1b-plain/shipped`, `b2-majplain/shipped`, `b2-retro-ident`, `pin-w3`, `pin-h4`),
the retro rows, the per-seed B1b outputs on both twelves, and the B2 arm runs.

### 3.8k Monet v0.15 — the deduction fix, studied on the records before any code

**The question, in one sentence.** How much of Monet's belief error is the *approximation* —
Sinkhorn scaling plus one-shot conditioning in `marginal.ts` — as opposed to the *model* it
approximates, and does removing the approximation move asks?

**Why this question and not another.** §3.8j closed the assignment axis on calibration (F1, F6)
and located what error there is in two places: where the ask log carries a licence for the card's
true holder (bias −0.085 at a Brier of 0.133, 13% of the population) and at |cands| = 2–3. Both
are exactly where `marginal.ts` approximates: the one-shot conditioning `p ← p / (1 − Π(1 − p))`
uses the product of marginals for the event's probability and is applied once, and the Sinkhorn
table is the maximum-entropy table with the right margins, not the matching count's own marginals
— `marginal.ts`'s own header says both. The exact object it approximates is well defined: the
marginal of the uniform distribution over every assignment of the unknown cards to seats that
honours the candidates, the slot counts and every surviving at-least-one-of constraint. So M3 has
a ceiling that can be measured without deciding how to build it: **compute the exact posterior
under the same model, inject it through the same seam, and read Brier and asks moved.** If the
exact posterior is not better, M3 is dead before a line of `lib/` is written; if it is better and
moves nothing, likewise. Only if both survive does the design question — how to approximate the
exact posterior within the engine's time budget — get asked. §3.8j's addendum bounds the answer
from above before it is asked: the misattribution channel carries 0.33 sets a game under a
*perfect* side belief, and this is not a perfect belief but the exact one under an incomplete
model.

#### The instrument

`scripts/exact-marginal.mjs`: a forward–backward DP over the table's cards, state = (remaining
slots per seat, bitmask of the constraints already satisfied), counts as doubles, the constraints
deduplicated exactly as `marginal.ts`'s `minimalConstraints` does (an implied constraint is
redundant for an exact count, so dropping it changes nothing). **Verified before this was
written:** against brute-force enumeration on 218 feasible random instances the worst entry differs
by **4.4e-16**; on 1,769 real pre-clinch decisions (home self-play, v0.9 both sides) it never fell
back at a constraint cap of 10, its rows sum to 1 and its columns to `unknownSlots` to 1e-14, and it
costs **75 ms a decision** (p50 29, p90 173, p99 695, max 2,342 ms; p50 65k states, max 5.3M). The
residual instance at a Monet decision is 28 unknown cards at the median (p90 43), with 3 surviving
constraints (p90 5, p99 8, max 10); Sinkhorn costs 0.04 ms. **So the exact table is a study
instrument, not a shippable one**, and the study measures the ceiling of M3 before any bounded
form of it is designed.

Two additions to `scripts/attribute.mjs`, both inside §3.8j's frame:

- `--assign-rerank exact` — a p-only arm in B1's bracket: `tbl.p` replaced in place by the exact
  marginal (`cands` untouched, so it can neither create nor destroy a certainty, like `side-p`),
  then the real `decide` through `boundedK`. `sink` is its identity control — the same replacement
  by the table's own values. Both run at the sampled decisions only.
- `--assign-exact` — at the sampled decisions, both tables' `q` on the **same** (card, side) pairs:
  Brier and Murphy's decomposition for each, the S1 / S3 / S8 splits for each, the size of the
  disagreement `|q_exact − q_Sinkhorn|`, the pairs the two tables put on opposite sides of 0.5 and
  how often the exact one is right there, and the exact table's own soundness pin. The exact table
  is computed once a decision and shared with the arm.

**Population and cost.** Pre-clinch ask decisions on `conf-base` × 12 (primary) and `conf-fix` × 12
(replication), **sampled one decision in eight by the walk's event index** (`i % 8 === 0`; fixed
here, not a knob), scored at both sides' decisions for R1 and at Monet's for R2–R3: about 10
scored decisions a game, ~16 minutes a seed, both twelves in under two hours four-wide. No cell is
spent. The `shipped` and `side-p` arms run at every decision beside them, so the bracket is on the
page.

**Pins, run before this was written, on `conf-fix-5682873` at every 64th event index:** `shipped`
**0 of 49,787**; `sink` **0 flips of 503**; exact fallbacks **0**; the exact marginal at the true
holder **positive at every scored pair** (503 decisions at A, 558 at B); the table cache leaves the
output byte-identical to the uncached run. **Disclosure, in §3.8g's manner:** that pin run wrote
its full report to disk, including the exact-against-Sinkhorn comparison at those 1,061 decisions;
only the tripwire lines were read, and the comparison was not. The one size seen while checking the
instrument is the largest single entry by which the two tables differed on the 1,769 self-play
decisions: **0.283**. It is a size, not a score.

**The study is void rather than negative if:** the exact marginal is 0 at any true holder (the
truth is feasible under the model, so this is a bug); `sink` or `shipped` flips anywhere; fallbacks
exceed 1% of sampled decisions; or the two corpora disagree on the sign of R1.

#### The readouts

- **R1, the ceiling on accuracy.** Brier(exact) against Brier(Sinkhorn) on the licensed
  population at A, pooled and on S3 (a licence for the set on record at the true holder: no / yes),
  S1 (|cands|) and S8 (phase), with Murphy's decomposition for both — §3.8j says the loss is
  resolution, so the exact table's gain should be resolution, not reliability.
- **R2, the ceiling on reach.** `flips(exact)` as a share of Monet's sampled asks, beside
  `shipped` 0 and `side-p` 35.5%, with B1's classification (sure miss → live, certain hit
  displaced — predicted 0 exactly, as for every p-arm).
- **R3, the ceiling on sets.** B2's surviving cell, (θ = 0.5, only-chance), for the `exact` arm at
  the sampled decisions — its own channel ceiling, against `side-p`'s 0.33 on the same cell (an
  episode counts when a sampled hidden chance flipped, so the read is a lower bound on the
  unsampled one, and is quoted as such).
- **R4, where the tables disagree.** `|q_exact − q_Sinkhorn|` by size, and the share of pairs on
  opposite sides of 0.5 with the exact table's accuracy there.

#### The falsifiers

| | fires when | and then |
|---|---|---|
| **K1** the approximation is not the error | Brier(exact) is not below Brier(Sinkhorn) by **≥ 5%** on S3 = yes at A, on both corpora | the licence-split error belongs to the model, not to the approximation: M3 is dead, and what is left is evidence the model does not read (M2's `choiceKappa`, already unsupported) or M-NULL |
| **K2** nothing moves | `flips(exact)` < **2%** of Monet's sampled asks | an exact belief changes almost nothing the ranker does, so no bounded approximation to it can do more |
| **K3** the sets are not there | R3 < **0.05** sets a game at (0.5, only-chance) | the channel is closed to a belief that is exact under this model |
| **K4** the gain is calibration after all | ≥ 70% of the exact table's Brier gain is reliability | contradicts §3.8j P3; the study is re-read before anything is designed |

**K1 or K2 alone closes M3.** Any of them fires → row 17 carries M-NULL as the leading candidate.

#### Predictions, written before the rest is read

| # | prediction | why |
|---|---|---|
| Q0 | soundness exactly 0; `sink` and `shipped` 0 flips; fallbacks 0 | pins, already measured on one seed |
| Q1 | Brier(exact) below Brier(Sinkhorn) by **1–3%** pooled at A | the approximation is good on average — §3.8j measured REL 0.0005 |
| Q2 | on S3 = yes, by **8–20%**, and the bias there moves from −0.085 toward **−0.03 … +0.02** | the one-shot conditioning is where the two tables differ most |
| Q3 | the gain is **≥ 70% resolution** | §3.8j P3, and REL is already 0.22% of Brier |
| Q4 | `flips(exact)` **4–12%** of Monet's sampled asks | below `side-p`'s 35%, above F2's old bar; the largest entry seen differs by 0.28 |
| Q5 | R3 at (0.5, only) **0.08–0.20** sets a game | a quarter to a half of `side-p`'s 0.33 |
| Q6 | at \|cands\| = 2 the two tables agree to 0.02 on average; the disagreement lives at 3–6 | with two candidates and one constraint the one-shot rule is nearly exact |

**What may not be concluded.** Nothing about a shippable form: the exact table costs 2,000× the
Sinkhorn one at the median, and this study prices the ceiling of any bounded approximation, not one
of them. No points: the pricer failed (§3.8j Stage 0). If M3 survives, the design that follows —
exact where the state count is under a cap and Sinkhorn elsewhere, or a better conditioning — is
its own pre-registration with its own identity pins, and its abroad read is a twelve-seed cell
against the corrected v0.9 base with the +2.00 floor reported even though a correctness fix is not
gated on it.

**Seeds.** No cell. `hashSeed("monet-v0.15-fit-3")` and `hashSeed("monet-v0.15-confirm-12")` are
reserved now for whatever follows, unspent.

#### Record — 2026-09-05

**M3 is dead, and the reason is the most useful thing v0.15 measured: the approximation in
`marginal.ts` is not the error — the MODEL it approximates is.** The exact posterior under the same
model — uniform over every assignment the candidates, the slot counts and the licence constraints
allow — is *worse* than the Sinkhorn table it was supposed to correct: Brier **+0.19% / +0.18%** at
Monet's decisions on the two twelves, worse on **24 of 24 seeds**, and **+4.5% / +4.5%** on the
licence split where §3.8j had located the error. **K1 fires on both corpora and K3 fires.** Nothing
is built, nothing in `lib/` is touched, no cell was spent, and the study ran as pre-registered —
one decision in eight, both twelves, about 10.5 minutes a seed against the 16 predicted.

**Tripwires.** Sampled decisions A 71,852 / B 74,516 (primary) and 72,419 / 73,730 (replication);
exact fallbacks **7 and 6** (0.005% of sampled decisions, against a 1% void bar); the exact marginal
at the true holder **positive at every scored decision** (`unsound` 0); the true holder outside
`cands` **0**; `sink` **0 flips** of 144,271; `shipped` **0** of 1,198,622. The two corpora agree on
the sign of every readout, so the study is not void.

**R1, the ceiling on accuracy — it is below the floor it stands on.** Licensed population, the
same pairs for both tables, at the sampled decisions:

> | corpus, side | pairs | y | Sinkhorn bias · Brier · REL · RES | exact bias · Brier · REL · RES | Brier change | per seed |
> |---|---|---|---|---|---|---|
> | primary, A | 1,105,780 | 0.4267 | −0.0018 · 0.2271 · 0.0006 · 0.0171 | −0.0019 · 0.2276 · 0.0006 · 0.0166 | **+0.0004 (+0.19%)** | worse on 12 of 12 |
> | primary, B | 1,117,888 | 0.3957 | −0.0041 · 0.2231 · 0.0006 · 0.0156 | −0.0047 · 0.2235 · 0.0006 · 0.0151 | +0.0004 (+0.19%) | 12 of 12 |
> | replication, A | 1,112,750 | 0.4279 | −0.0024 · 0.2272 · 0.0006 · 0.0171 | −0.0025 · 0.2276 · 0.0006 · 0.0167 | **+0.0004 (+0.18%)** | 12 of 12 |
> | replication, B | 1,101,108 | 0.3949 | −0.0043 · 0.2229 · 0.0006 · 0.0157 | −0.0049 · 0.2233 · 0.0006 · 0.0153 | +0.0004 (+0.18%) | 12 of 12 |

Reliability is unchanged at 0.0006 and **resolution falls** (0.0171 → 0.0166): the exact table is
not less honest, it is less informative. The unlicensed population reads the same way, +0.31 to
+0.33%, worse on every seed.

By split (primary shown; the replication agrees within 0.1 point on every row; Sinkhorn bias ·
Brier → exact bias · Brier, then the change):

> | split | A | B |
> |---|---|---|
> | **S3 licence at the true holder — yes** | −0.0877 · 0.1327 → −0.0886 · 0.1387 (273,030), **+4.5%** | +0.1158 · 0.0984 → +0.1164 · 0.1030 (319,748), **+4.7%** |
> | S3 — no | +0.0142 · 0.2402 → +0.0144 · 0.2398 (1,680,900), −0.1% | −0.0219 · 0.2421 → −0.0220 · 0.2418 (1,688,951), −0.1% |
> | S1 \|cands\| = 2 | −0.0182 · 0.1681 → −0.0131 · 0.1719 (45,152), **+2.3%** | +0.0126 · 0.1295 → +0.0070 · 0.1330 (53,424), **+2.7%** |
> | S1 = 3 | −0.0258 · 0.1952 → −0.0241 · 0.1970 (126,877), +0.9% | +0.0125 · 0.1811 → +0.0103 · 0.1829 (147,758), +1.0% |
> | S1 = 4 | −0.0079 · 0.2154 → −0.0077 · 0.2170 (155,950), +0.7% | +0.0005 · 0.2112 → −0.0002 · 0.2126 (153,806), +0.7% |
> | S1 = 5 | +0.0033 · 0.2300 → +0.0030 · 0.2303 (1,625,951), +0.1% | −0.0016 · 0.2263 → −0.0011 · 0.2265 (1,653,711), +0.1% |
> | S8 early / mid / late | −0.0% / +0.1% / **+1.3%** | 0.0% / +0.1% / +1.2% |

**Where §3.8j located the error, the exact table is worse, not better.** On the licence split the
exact posterior raises the Brier by 4.5% and leaves the bias where it was (−0.088); at |cands| = 2
it is worse by 2.3%, at 3 by 0.9%, at 5 by 0.1%; late in the game, when the constraints are many
and the exact table departs furthest from Sinkhorn, by 1.3%. **K1 fires** — the bar was a 5%
*improvement* on S3 = yes at A, and the reading is a 4.5% deterioration, on both twelves.

**R2, reach.** The `exact` arm changes Monet's ask at **2.74% / 2.71%** of the sampled decisions
(1,969 of 71,852; 1,963 of 72,419; per-seed SE 0.07 / 0.04) — above K2's 2% bar, so K2 does not
fire; beside it `side-p` reads 35.56% / 35.47% at every decision. The flips are symmetric — 203 /
188 turn a sure miss into a live ask and **248 / 266 turn a live ask into a sure miss** — which is
what noise around a near-identical table looks like, not a direction. Certain-hit displacement is
**0**, as predicted for a p-only arm.

**R3, sets.** B2's surviving cell for the `exact` arm reads **0.003 / 0.005** sets a game at
(θ = 0.5, only-chance) — a lower bound, since only a sampled hidden chance can count, but 0.071 /
0.067 even at θ = 0.3 and 0.037 on the discarded (0.5, any) cell — against `side-p`'s 0.328 / 0.334
on the same cell and the same records. **K3 fires** against a bar of 0.05.

**R4, where the tables disagree.** 92.5% / 92.4% of A's pairs differ by under 0.02, 0.2% by 0.1 or
more, 0.0% by 0.2 or more (the 0.283 disclosed in the pre-registration was the largest single entry
on 1,769 self-play decisions). The two tables put **1.92% / 1.93%** of Monet's pairs on opposite
sides of 0.5 — and there the exact one is right **47.6% / 47.4%** of the time, the Sinkhorn one
52.4% / 52.6%; at B, 0.99% / 1.02% of pairs, the exact one right 43.2% / 44.2%.

**What this means.** A posterior computed exactly under a model can be further from the truth than
an approximation to it only if the truth is not drawn from the model. The deal is uniform and every
public fact is honoured exactly, so what the model lacks is not inference but a **likelihood** —
the players' choices carry information the constraints do not. The post-hoc diagnostic below
measures the gap directly: a seat that has asked into a set holds "at least one" of its alive cards
under the model and in fact holds about **1.5** of them, whether two or five are alive. The exact
table expects *less* than the Sinkhorn table at every alive count — the one-shot conditioning
under-conditions relative to the exact rule — and at two to four alive cards that shortfall points
toward the truth, so removing it made the Brier worse exactly where the licence-split error lives
(S3 = yes, |cands| = 2–3, late in the game) and better only where the model over-shoots, at five.
**The "deduction defect" §3.8j named was the model's flat prior showing through an approximation
that softened it.** M3 — arc-consistency, exact conditioning, any better inference under this model
— cannot help, because the model is already inferred better than it deserves.

**Post hoc, and labelled so — where the truth leaves the model.** Added to the instrument after
the pre-registered study had finished and run on six seeds, three of each corpus, to explain the
result rather than to reach it: for every surviving licence constraint at the sampled decisions —
"seat *t* holds at least one of these alive cards of the set" — the true count at *t* against what
each table expects, by the number of alive cards:

> | licensed seat (relative to the decider) | alive cards | constraints | truth: mean count (per-seed min–max, six seeds) | truth: P(2 or more) | Sinkhorn expects | exact expects |
> |---|---|---|---|---|---|---|
> | own side | 2 | 28832 | 1.496 (1.469–1.507) | 49.6% | 1.147 | 1.133 |
> | own side | 3 | 28358 | 1.524 (1.501–1.568) | 40.5% | 1.272 | 1.246 |
> | own side | 4 | 28876 | 1.495 (1.463–1.566) | 37.3% | 1.386 | 1.349 |
> | own side | 5 | 18035 | 1.460 (1.438–1.485) | 35.9% | 1.525 | 1.465 |
> | other side | 2 | 49073 | 1.469 (1.455–1.490) | 46.9% | 1.138 | 1.134 |
> | other side | 3 | 46780 | 1.521 (1.484–1.556) | 40.3% | 1.282 | 1.259 |
> | other side | 4 | 50287 | 1.461 (1.440–1.480) | 35.7% | 1.380 | 1.350 |
> | other side | 5 | 41973 | 1.427 (1.404–1.459) | 33.9% | 1.504 | 1.456 |
> | primary only, own side | 2 | 14511 | 1.486 (1.469–1.502) | 48.6% | 1.148 | 1.134 |
> | primary only, other side | 2 | 24461 | 1.465 (1.455–1.474) | 46.5% | 1.140 | 1.135 |
> | replication only, own side | 2 | 14321 | 1.505 (1.504–1.507) | 50.5% | 1.147 | 1.132 |
> | replication only, other side | 2 | 24612 | 1.474 (1.465–1.490) | 47.4% | 1.136 | 1.133 |

A licensed seat holds **about 1.5** of the set's alive cards whether two, three, four or five are
alive. The model's expectation, uniform over the feasible assignments, rises with the alive count
from 1.14 to 1.52 instead — a third of a card short at two alive cards, a quarter at three, a tenth
at four, and slightly over at five. At two alive cards the seat holds **both about half the time;
the Sinkhorn table says 14 to 15%, the exact one 13%.** §3.6a saw the same thing from the deal on the fit
seeds: a seat that had asked into a set was dealt **1.565** of it against **1.185** for one that
held a card and never asked, where the plain deal gives **1.46** to any seat holding at least one —
the ask says the seat holds more than a licence-holder, silence says it holds less, and the model
reads both as "at least one".

**What is fixed by this record.** Nothing on Monet's vector. `scripts/exact-marginal.mjs` stays as
an instrument — the exact posterior under the model, pinned against brute force — with
`attribute.mjs --assign-rerank exact|sink --assign-exact` (which now also prints the licence-holding
readout, marked post hoc in the code) and the seam that carried it. **Decision row 17 carries the
reading.** What the result points at is a likelihood over the players' choices, and the code
already holds the crude form of exactly that: §3.6a's `choiceKappa` with `choicePrior: 'once'`
multiplies the asker's cell for every card of the asked set by (1 + κ), which weights an assignment
by (1 + κ) to the power of the holding — a geometric likelihood in the very quantity the diagnostic
finds under-modelled. §3.8j's "M2 unsupported" rested on the licence split belonging to M3; with M3
dead, the licence split is M2's by elimination, and the diagnostic measures it directly. The
arithmetic on one bucket says how far v0.5 was from the dose: at two alive cards the model's odds
on "both" are 0.15 to 0.85 and the truth's are 0.49 to 0.51, a factor of about six, so a geometric
likelihood wants (1 + κ) ≈ 6 where v0.5 took κ = 1 abroad (+0.47, SE 0.59, inside the floor) and
the count form saturates at three asks. That is arithmetic, not a calibration; the calibration is a
records study through the same seam, with the same instrument and the same falsifiers, and no cell.
Against it stands the honest prior of **six consecutive measured negatives** — v0.10 through v0.15
— and the ceiling §3.8j's addendum put on the whole channel: 0.33 sets a game under a *perfect*
belief, half a point at the class prior. **M-NULL, §3.9's acceptance on v0.9's vector, is now the
leading candidate**, and the even-3 bucket — §3.8c R1's largest single bucket, never attacked by
any rung — the leading alternative to it.

**Predictions, scored.** Q0 **hit on three of its four pins** — soundness 0, `sink` 0, `shipped` 0
— and missed on the fourth: fallbacks were 7 and 6, not 0. **Q1 missed on the sign**: the exact
table is worse pooled, not 1–3% better. **Q2 missed badly**: S3 = yes reads +4.5% worse, not 8–20%
better, and the bias did not move. Q3 is moot as written — there is no gain to decompose — though
what did move is all resolution, downward (REL 0.0006 → 0.0006, RES 0.0171 → 0.0166). **Q4 missed**:
2.7% of asks, under the 4–12% band. **Q5 missed by an order of magnitude**: 0.003–0.005 against
0.08–0.20. **Q6 missed on what can be read**: the Brier change is largest at |cands| = 2 (+2.3%)
and falls with the candidate count, the opposite of "the disagreement lives at 3–6"; the mean
disagreement by |cands| was not among the readouts recorded, so its first clause is unscored. None
of the seven cleanly. The pre-registration was wrong about the direction of nearly everything it
predicted, and the falsifiers it wrote caught that in an afternoon, on records, for nothing.

**Scratch state, not committed:** `$SP/monet-v15/{run-v15.sh,v15-agg.mjs,run-diag.sh,diag-agg.mjs,attribute-diag.mjs,out/}`
— the 24 per-seed outputs, the pin runs (`pins-seed*.txt`, whose comparison table was not read
before the pre-registration was committed), and the six diagnostic runs (`diag-*.txt`; the scratch
copy of the instrument that produced them is byte-identical to the committed one).

### 3.8l Monet v0.16 — the licence likelihood, calibrated on the records before any cell

**The question, in one sentence.** §3.8k left one thing open on the belief axis — the model has no
likelihood over the players' choices, and a seat that has asked into a set holds about 1.5 of its
alive cards where the model expects 1.14 to 1.29 at two or three — so: does a likelihood
*calibrated on the records to that holding* repair the licence split, move asks, and carry sets,
read through the same seam with the same falsifiers §3.8k wrote, before any cell is spent?

**Why this and not M-NULL directly.** Row 17's recommendation was M-NULL with this one probe
before it, because the probe costs no cell and settles the axis either way: v0.5 measured the crude
form of this likelihood (`choiceKappa` = 1, count form) as a *dose*, fitted at home and read abroad
at +0.47 inside the floor, and never against the quantity it models. §3.8k's diagnostic gives that
quantity a number. The owner took row 17 on 2026-09-05 with full authority for the direction of
v1.0 development from here.

#### The instrument — three knob families through one seam

`attribute.mjs --alt-knobs <knobs> --assign-alt --assign-rerank shipped,alt,side-p`: the
**alternative belief** is the `--cf` policy's own knowledge built with extra `KnowledgeOptions`,
scored against the shipped table on the **same** pairs through §3.8k's machinery (Brier and Murphy,
the S1 / S3 / S8 splits, the disagreement, the licence-holding readout with "alt expects" beside the
truth), and played through the `boundedK` seam as the arm `alt` at **every** decision — pinned, at
every decision, to the policy carrying the same knobs in its style through its own knowledge path
(a disagreement voids the run). The alt table is Sinkhorn-cheap, so nothing is sampled. `shipped`
must read 0 flips; `side-p` is the bracket; B2's cell is read for `alt`.

The families, each a single knob on v0.9's vector:

- **`once`** — §3.6a's `choiceKappa` κ with `choicePrior: 'once'`: the asker's cell for every
  unknown card of the asked set weighted by (1 + κ) before the scaling. Grid κ ∈ {1, 2, 3, 5, 8}.
- **`count`** — the same with `'count'`, (1 + κ)^min(asks, 3), v0.5's pre-registered shape. Grid
  κ ∈ {1, 2, 3}.
- **`hold`** — new in this rung, `licenceHold` = h: the licence conditioning **calibrated to a
  holding**. After the one-shot "at least one" conditioning, each surviving constraint's cells are
  scaled so the licensed seat's expected count over the set's alive cards is min(h, alive), as one
  more margin in the same proportional fitting (eight rounds, each alternated with a full row and
  column pass; a seat whose targets would claim more than 95% of its free slots has them cut back
  pro rata). It is the direct form of what §3.8k measured — a holding flat in the alive count —
  where a per-cell weight is geometric in it. Built as `StyleParams.licenceHold` /
  `KnowledgeOptions.licenceHold`, read by `marginal.ts` only, **absent on every roster style and
  every tier; absent or 0 is byte identity** (`tests/bots/licence-hold.test.ts`: identical tables
  on 652 positions of three games; with h = 1.5 the rows still sum to 1 and the columns to the
  seats' slots, and the licensed seats' gap to min(1.5, alive) falls from 0.285 to 0.084 a
  constraint). Grid h ∈ {1.2, 1.35, 1.5, 1.65, 1.8}.

**Pins, run before this was written, on fit seed `conf-base-1027753` at every 64th event index
(516 decisions at A, 548 at B):** `alt` at κ = 0 and at h = 0 — **0 flips of 516, every Brier
identical to the shipped table's to four decimals**; `alt` at κ = 5 (once) and at h = 1.5 — seam
disagreements **0**, alt rows differing from the shipped rows **0**, alt marginal 0 at a true holder
**0**, `shipped` **0 of 49,819**. The full test suite passes with the knob absent.

**Disclosure, in §3.8g's manner — and larger than §3.8k's.** The κ = 5 pin's full report was
displayed by a grep whose pattern carried an empty alternative, and was read, before this was
written: on that one fit seed at every 64th decision, licensed/A Brier 0.2146 → 0.2113 (−1.5%),
S3 = yes at A 0.1422 → **0.0851 (−40%)** with the bias −0.137 → −0.117, S3 = no at A 0.2338 →
0.2480 (**+6%**), |cands| = 2 0.1719 → 0.1590, `alt` flips 58 of 516 (11.2%), and the holding
readout 1.140 → 1.358 at two alive cards (truth 1.545) but 1.513 → **2.151** at five (truth
1.617). Two things follow and are stated as such. The `hold` family was designed *after* that read:
the per-cell weight over-shoots exactly where the truth is flat, which is why a target on the
holding itself was built. And the predictions below for the `once` family are informed by one fit
seed; the held-out read is not — the fit seeds are the fit seeds, and nothing outside them has been
seen with any knob set.

#### Fit and read, fixed now

**Fit** on the three primary seeds §3.8k's post-hoc diagnostic already read — **1027753, 1717986,
2495762** — over the thirteen arms above (39 runs, no cell). **Selection rule:** the arm with the
lowest pooled Brier on the **licensed population at A** over the three fit seeds — a proper score
over the whole population, so an arm cannot buy the licence split by wrecking the rest; ties within
0.0001 go to the arm with fewer flips. The S3 = yes Brier, the S3 = no Brier and the holding readout
are reported beside it and do not choose. **Read** the chosen arm on the **nine held-out primary
seeds and the twelve replication seeds** (`conf-fix` ×12; the three of them whose Sinkhorn and exact
holdings the diagnostic read have seen no knob), with `shipped` and `side-p` beside it and B2's
cell.

#### The falsifiers (on the held-out twenty-one; the bars carried from §3.8k)

| | fires when | and then |
|---|---|---|
| **L1** the licence split is not repaired | Brier(alt*) is not below Brier(Sinkhorn) by **≥ 5%** on S3 = yes at A, on both corpora | the likelihood does not reach the error §3.8k located: the belief axis closes |
| **L2** nothing moves | `flips(alt*)` < **2%** of Monet's asks | an honest belief the ranker does not act on |
| **L3** the sets are not there | B2 (θ = 0.5, only-chance) < **0.05** sets a game for `alt*` | the channel is closed to this belief, as it was to the exact one |
| **L4** the fit bought the split with the rest | the pooled licensed Brier at A is not below the shipped one on both corpora | a likelihood that is wrong elsewhere |

**Void rather than negative:** a seam disagreement; alt rows differing from the shipped rows; the
κ = 0 or h = 0 control flipping an ask or moving a Brier; the two corpora disagreeing on L1's sign.

**Any of L1–L4 closes the belief axis for good**, and row 18 chooses between §3.9's acceptance on
v0.9's vector and the even-3 bucket. **If none fires, the rung goes abroad:** the chosen arm as a
bridge arm — `MONET_OVERRIDE` carrying the knob on v0.9's vector with MUSTFIX, built and pinned the
way §3.8j's addendum pinned v0.12's and v0.13's arms to their bridge arms (the in-engine `alt`
must reproduce the bridge arm's own play at 100.0% on one recorded cell before its cells are
read) — against the corrected v0.9 base on twelve fresh seeds, paired, at §6.3's floor: **it ships
at ≥ +2.00**, and inside the floor it is recorded and not shipped. A calibrated likelihood is a
correctness fix, and §3.8k said the floor is reported for one even so; after six measured
negatives it is *gated* on it.

**Seeds.** The abroad twelve, drawn now under the label §3.8k reserved, by §6.5's rule (85 seeds
excluded — every seed spent, read or reserved so far — `$SP/seeds-v16.mjs`), from
`hashSeed("monet-v0.15-confirm-12")`: **6269924 7549725 5242661 6002277 9277927 1700521 7863927
1836519 8279242 7472431 4385920 1411503**. No fit cell abroad: the fit is on the records.

#### Predictions, written before the fit is read

| # | prediction | why |
|---|---|---|
| Q1 | the fit picks the **`hold`** family, h in **1.35–1.65** | the truth is flat at ~1.5 and a target on the holding is the direct form; the per-cell weight over-shoots at four and five alive cards on the disclosed seed |
| Q2 | S3 = yes at A: Brier **−25% to −45%** on both corpora, bias −0.088 → within **±0.03** | the disclosed κ = 5 read −40% with the bias still −0.117; a holding target should take more of the bias |
| Q3 | S3 = no at A: Brier not worse by more than **+1.5%** | the disclosed κ = 5 read +6%; the holding target moves less mass off the unlicensed cards |
| Q4 | pooled licensed Brier at A: **−1.5% to −3.5%** on both corpora, better on **≥ 20 of 21** seeds | 13% of the population improving by a third |
| Q5 | `flips(alt*)` **8–15%** of Monet's asks | the disclosed 11.2% at κ = 5; between `exact`'s 2.7% and `side-p`'s 35% |
| Q6 | B2 (0.5, only) for `alt*`: **0.03–0.10** sets a game — **L3 is the likeliest to fire** | `side-p` reads 0.33 with a perfect side belief; this is a partial one |
| Q7 | the holding readout under `alt*`: 1.40–1.55 at two alive cards and at five | the target is the measured holding |
| Q8 | abroad, if reached: **+0.5 to +2.0** paired, inside the floor | six measured negatives, and B2's ceiling of ~+5 for a perfect belief |

**What may not be concluded.** Nothing about a shippable form until the abroad cell — a records
study prices a belief, not a bot. No points from the records: the pricer failed (§3.8j Stage 0).
Nothing about the search or the position channel (§3.8a, §0.2), which no belief study reads.

#### Amendment — 2026-09-05, before any fit number was read

The first launch of the fit died on its own soundness pin at every family: "the alt marginal is 0
at the true holder", within the first sixty games of each fit seed. The h = 0 identity arm — the
shipped table itself — dies at the same event of the same game. **The zeros are the shipped
Sinkhorn table's own.** Where they come from, measured on 2,075 positions of three self-play games
(v0.9 both sides, `$SP/monet-v16/zero-diag.mjs`): 727 candidate cells (0.26% of 277,564, in 8.0%
of positions) are exactly 0 in the shipped table; every one of them sits at a seat carrying a
surviving licence constraint, and 670 of the 727 at a seat whose conditioned cells sum to at least
its free slots — `marginal.ts` step 3's repair, "the other cards at t give up what A gained", with
`need[t] − sumAfter ≤ 0`, so they give up everything. In self-play none of the 727 was at the true
holder; on the bridge records one is, early in each fit seed. So the pin as written — "alt marginal
0 at a true holder must be 0" — was a pin on the shipped table's defect, not on the knob, and the
pin runs at every 64th decision were too sparse to meet it. **Changed now, before the fit:** under
`--assign-alt` a zero at the true holder is counted, not fatal, and the shipped table's own zeros
at the true holder are counted beside it; **the pin is that the knob adds no zero — alt's count may
not exceed the shipped table's — and the seam and row pins stay fatal.** The families, the grid, the
selection rule, the falsifiers and the predictions are unchanged. The defect itself — a hard zero on
a feasible cell, which no belief should carry — is a shipped-table correction and is **not** taken
inside this rung: it is named for the next pre-registration, with its rate on the records reported
by this one.

#### Record — 2026-09-06

**The calibrated licence is real on the records and loses abroad: 40.58% against the base's 41.31%
on twelve fresh seeds, −0.74 paired (SE 0.46, ahead on 4 of 12), inside the floor — recorded and
not shipped, as pre-registered. The loss is located. In sets the arm is behind on 10 of 12 seeds by
0.024 a game (3.6 × SE); its wrong declares double, 0.0125 → 0.0239 a game (worse on 12 of 12,
7 × SE), while its ask accuracy does not move. The declare places a set's open cards by the chain
over the same table (§3.4b), and that path was never among the falsifiers: on the same windows the
held table prices one-guess plans above 0.9 nineteen times as often, and they come right 43% of the
time against the shipped table's 70%. The belief axis closes — seven measured negatives in a row,
this one with the belief repaired where §3.8k located the error.**

**The fit, on the three fit seeds (3,600 games, 39 runs, no cell).** Every arm of the two per-cell
families — `once` at κ 1, 2, 3, 5, 8 and `count` at κ 1, 2, 3 — **fails the amended pin**: the
knob adds hard zeros at true holders, 4 / 12 / 38 / 119 / 315 for `once` and 55 / 423 / 1,088 for
`count`, against the shipped table's **one** (in 2495762, game 10 — the amendment's "early in each
fit seed" was wrong about that: the other two early deaths were the per-cell families' own zeros).
The mechanism is the amendment's, compounded: a prior that inflates the licensed seat's cells makes
the one-shot repair's `g = 0` branch fire more often, and every zero it leaves is on a feasible cell.
**So the form v0.5 shipped abroad at κ = 1 carried, on these records, four hard zeros at true
holders that the flat prior did not** — small, but a correctness defect no dose can be read
through, and the families are void here as pre-registered. The `hold` family adds none (1 = 1 on
every arm) and is the selection:

> | arm | licensed/A Brier, Sinkhorn → alt (per seed) | S3 = yes at A: bias, Brier → bias, Brier | S3 = no at A | \|cands\| = 2 | flips | B2 (0.5, only) | holding own/2: truth · Sinkhorn · alt | own/5 |
> |---|---|---|---|---|---|---|---|---|
> | `hold 1.2` | 0.2278 → 0.2295 (+0.72%, worse on 3 of 3) | −0.085, 0.132 → −0.089, 0.156 (**+17.7%**) | −0.5% | +5.6% | 5.56% | 0.064 | 1.485 · 1.147 · 1.180 | 1.458 · 1.522 · 1.208 |
> | `hold 1.35` | 0.2278 → 0.2281 (+0.12%, 3 of 3 worse) | → −0.089, 0.131 (−1.2%) | +0.3% | +2.5% | 4.69% | 0.063 | 1.315 | 1.352 |
> | **`hold 1.5`** | **0.2278 → 0.2276 (−0.12% ± 0.03, better on 3 of 3)** | → −0.088, **0.110 (−16.7%)** | +1.2% | +0.3% | **5.53%** | **0.068** | **1.445** | **1.493** |
> | `hold 1.65` | 0.2278 → 0.2277 (−0.06%, 3 of 3) | → −0.087, 0.094 (−29.4%) | +2.2% | −1.0% | 6.95% | 0.076 | 1.569 | 1.630 |
> | `hold 1.8` | 0.2278 → 0.2285 (+0.29%, 0 of 3) | → −0.085, 0.080 (−39.5%) | +3.4% | −1.5% | 8.66% | 0.092 | 1.693 | 1.762 |

**`hold 1.5` is chosen by the rule** — the lowest pooled licensed-population Brier at A — and the
table already says what the held-out read will be about: the calibrated conditioning puts the
licensed seat's expected holding where the truth is (1.445 against 1.485 at two alive cards, 1.493
against 1.458 at five — the flatness §3.8k measured, reproduced by one knob), the licence split's
Brier falls by a sixth, **and the pooled Brier moves by a tenth of a percent**, because what the
licensed cards gain the unlicensed cards on the same seat lose (S3 = no +1.2%). The bias on the
licence split does not move (−0.085 → −0.088): mass shifted toward the licensed seat raises q where
y = 1 and lowers it where y = 0, and the two cancel in the mean while the Brier falls. For the
per-cell families beside it, void as they are, the same shape at a larger dose: `once 5` reads
−44% on the split and **+0.60% pooled** — the more the licence split is repaired, the worse the rest.

**The held-out read — nine primary and twelve replication seeds, 25,200 games, no cell.** Tripwires:
seam disagreements **0**, alt rows differing **0**, `shipped` **0 flips**, the true holder outside
`cands` **0**, and the knob adds no zero — alt's zeros at true holders **11 = 11** and **6 = 6**, the
shipped table's own (about one in a thousand games). The two corpora agree on the sign of every
readout.

> | readout | primary (9 seeds) | replication (12 seeds) | falsifier |
> |---|---|---|---|
> | licensed/A Brier, Sinkhorn → alt | 0.2280 → **0.2276** (**−0.17%** ± 0.02, better on **9 of 9**) | 0.2280 → **0.2276** (**−0.18%** ± 0.02, **12 of 12**) | L4 does not fire |
> | licensed/B · unlicensed/A | −0.06% · −0.25% | −0.13% · −0.23% | |
> | S3 = yes at A: bias, Brier → bias, Brier | −0.085, 0.1325 → −0.088, **0.1103 (−16.8%)** | −0.086, 0.1326 → −0.088, **0.1109 (−16.4%)** | **L1 does not fire** (bar 5%) |
> | S3 = no at A | +1.2% | +1.2% | |
> | \|cands\| = 2 at A | +0.3% | +0.1% | |
> | `alt` flips, of Monet's asks | **5.48%** ± 0.04 (sure miss → live 3,800; live → sure miss 2,532; certain displaced 4) | **5.52%** ± 0.04 (5,110; 3,458; 3) | L2 does not fire (bar 2%) |
> | B2 (θ 0.5, only-chance), `alt` vs `side-p` | **0.065** ± 0.003 vs 0.331 | **0.067** ± 0.002 vs 0.334 | L3 does not fire (bar 0.05) |
> | holding at the licensed seat, own side, 2 alive: truth · Sinkhorn · alt | 1.497 · 1.148 · **1.446** | 1.501 · 1.147 · **1.446** | |
> | 5 alive | 1.473 · 1.524 · **1.493** | 1.499 · 1.529 · **1.494** | |

**None of L1–L4 fires**, on either corpus, so the rung goes abroad as pre-registered. What the
held-out read says about the size of the thing before a cell is spent: the licence split — 13% of
the pairs — is a sixth better; everything else on the same seats is 1.2% worse; the net is **a
seventh of a percent of Brier**, on every one of 21 seeds. The knob moves **one ask in eighteen**,
more of them from a sure miss to a live ask than the reverse (3,800 : 2,532), and B2's surviving
cell holds **0.065 sets a game** for it against 0.33 for a perfect side belief — a fifth of the
channel's ceiling, +1.0 point at the exchange rate and inside the floor before it is measured. So
the abroad read is a test of the exchange rate and of the floor, not of the belief: the belief
does what it was calibrated to do.

**Abroad — the pre-registered read, 2026-09-06.** `hold 1.5` as a bridge arm (`monet-v16-hold15`:
the MUSTFIX adapter with `licenceHold: 1.5` overlaid on v0.9's vector, bot.mjs md5 330328d9…
unchanged, the tree export of `bae7b7b`) against the base on §3.8l's twelve seeds, 1,200 games a
cell, 28,800 games, three lanes. Pins first: the base on the v0.16 export reproduces §3.8f's
recorded cell at 5682873 to the game (41.8333%, IDENTICAL); the arm's play on its own recorded
cell (6269924) is reproduced by `--cf v0.9 --cf-knobs licenceHold=1.5` at **100.0%** of A's
decisions; every lane's hello line carries the label and the override; n = 1,200 on all 24 cells;
FATAL 0; declare accuracy ≥ 99.4% on every cell.

> | seed | base | `hold 1.5` | arm − base |
> |---|---|---|---|
> | 6269924 | 40.75 | 41.83 | +1.08 |
> | 7549725 | 39.58 | 40.25 | +0.67 |
> | 5242661 | 39.42 | 39.75 | +0.33 |
> | 6002277 | 42.83 | 42.75 | −0.08 |
> | 9277927 | 41.00 | 41.08 | +0.08 |
> | 1700521 | 40.83 | 40.00 | −0.83 |
> | 7863927 | 42.17 | 37.75 | −4.42 |
> | 1836519 | 41.42 | 38.25 | −3.17 |
> | 8279242 | 42.42 | 41.67 | −0.75 |
> | 7472431 | 42.58 | 42.08 | −0.50 |
> | 4385920 | 39.75 | 39.58 | −0.17 |
> | 1411503 | 43.00 | 41.92 | −1.08 |
> | **pooled (12 seeds)** | **41.31** (SD 1.29) | **40.58** (SD 1.58) | **−0.74** (SD 1.58, SE 0.46, −1.61 × SE; ahead on 4 of 12) — **inside the floor** |
> | sets a game, Monet | 4.186 | 4.163 | **−0.024** (SE 0.0065, −3.6 × SE; ahead on 2 of 12) |
> | wrong declares a game (accuracy) | 0.0125 (99.69%) | 0.0239 (99.41%) | **+0.0114** (SE 0.0016, +7.1 × SE; worse on 12 of 12) |
> | forced declares a game, right | 0.101 at 53.0% | 0.095 at 49.1% | |
> | ask accuracy, Monet / SESTINA | 55.16% / 57.17% | 55.27% / 57.32% | unchanged |
> | declares a game · events a game | 4.048 · 101.4 | 4.048 · 101.4 | unchanged |

**Where the sets go.** A wrong declare hands the set to the other side. The extra wrong declares
are 0.011 sets a game of Monet's own, the forced declares at the clinch (right 49.1% from 53.0%)
another 0.004, and the rest — 0.009 ± 0.007 — is not separately located and not distinguishable
from zero: the hit rate, the asks a game and the tempo do not move. **The read for the calibrated
belief on the ask path is about zero, inside its own error, and the loss abroad is the declare.**

**The mechanism, on the records, on the same windows.** Under `pAssignment: 'joint'` the speculative
declare (`evClaim`, decide.ts) places a set's open cards by `joint.ts`'s chain over the marginal,
most certain first, and fires when the chain's product clears the declare bar — the same table the
ask ranker reads, through a path §3.8l's falsifiers did not. The declare pricer (`--locks`, §3.8e's
instrument) was run through the counterfactual planner over every declare window of the *base*
records, once with the shipped table and once with `--cf-knobs licenceHold=1.5` — the same
windows, the same truth, two seeds:

> | plans by guessed cards and the plan's p | shipped table: probes / right | held table, same windows | shipped | held |
> |---|---|---|---|---|
> | | *seed 6269924* | | *seed 7863927* | |
> | 1 card, p ∈ [0.9, 1) | 30 / 70.0% | **568 / 43.0%** | 8 / 100% | **424 / 30.7%** |
> | 1 card, p ∈ [0.7, 0.9) | 1,240 / 50.8% | 1,505 / 43.2% | 981 / 39.8% | 1,247 / 39.1% |
> | 2 cards, p ∈ [0.9, 1) | 65 / 100% | **352 / 58.2%** | 35 / 100% | **497 / 66.4%** |
> | 2 cards, p ∈ [0.7, 0.9) | 193 / 92.7% | 328 / 70.1% | 173 / 83.8% | 392 / 68.9% |
> | 3+ cards, p ∈ [0.9, 1) | 17 / 100% | 70 / 65.7% | 19 / 100% | 58 / 67.2% |

And on the arm's own record (6269924) A's speculative declares priced in [0.775, 1) number 32 and
come right 56.3% of the time, against the base record's 8 at 75.0%. **The held table is
over-confident exactly where the declare gate selects.** The hold rule raises the licensed seat's
cells in the set it asked into, and the column pass keeps that seat's total at its hand size, so
its other cards give up mass to the other candidates evenly — right in expectation, which is what
the pooled Brier measures (−0.17%; the |cands| = 2 split +0.3%), and wrong at the maximum, which is
what a declare is: the gate takes the highest-p plan over every set at every window, and the cells
the rule moved most are the ones it picks. A Brier over all pairs cannot see a selected population.
§3.8k's falsifiers (K1–K3) and §3.8l's (L1–L4) both read the ask path's pairs. **The pin any belief
change must carry from here is the declare's: the plan's reliability through the counterfactual
planner on the same windows, alt against shipped, by guessed cards and p bin — within the shipped
table's on every bin at p ≥ 0.7, or the arm does not go abroad.**

**A disclosure from the botlogs, found while reading this cell's coverage.** The bridge adapter's
`planMismatch` and `planMismatchP` counters — §6.2 lists the first among the fault counters that
must read zero — have read non-zero on every cell whose botlog is kept: 171 of 171, v0.10 through
this rung, the attribution runs included; here 220–456 and 424–861 a cell against ~11,000 declares
emitted. They are the adapter's own restatement of the declare's card placement by the
capacity-greedy rule, compared with `decide()`'s; since v0.4b placed the open cards by the chain
over the marginal (`pAssignment: 'joint'`) the two cannot agree wherever the chain and the greedy
rule differ, and the warnings say exactly that (`local 2 vs decide 4`, both teammates; `local
p = 0.3 vs trace p = 0.311`), most of them at the game-end forced declares. **The other twelve fault
counters read zero on every kept botlog**, and the engine's own limit and fault lines are clean.
So the counter is a stale instrument, not a bot fault — but the records from v0.10 on did not say
it had fired, and v0.13's rule ("trips any fault counter is disqualified") was written as if it
could not. Fixed for the next arm: the wire check restated through the engine's own `planClaimFor`,
the greedy comparison kept as information and not as a fault; and every record from here reports
the fourteen counters by name.

**Verdict.** As pre-registered: inside the floor, recorded and not shipped. `licenceHold` stays in
`lib/` as a measured knob, absent from every registry version (byte identity when absent,
`tests/bots/licence-hold.test.ts`, 652 positions). The roadmap does not recommend a repaired form
abroad — the declare could read the plain table while the asks read the held one — because the
ask path's own value is already read: the residual after the declares is 0.009 ± 0.007 sets a game,
B2's surviving cell holds 0.065 sets for it, +1.0 at the exchange rate, inside the floor before it
is measured, and a seventh cell for a belief whose read is about zero is the artefact §3.8j warned
against. **The belief axis is closed**: the model was wrong where §3.8k said (the licence carries a
holding the constraints do not), the repair is real on the records (a sixth off the split's Brier,
the holding at the truth), and it is worth nothing in play. What is left of the residual against
SESTINA is not this belief. Row 18 says what the ladder does with that.

**Predictions, scored.** Q1 **hit**: the fit picks `hold` at 1.5. Q2 **missed**: the licence split
improves by a sixth, not by a quarter to a half, and the bias there does not move at all (−0.088
against a predicted ±0.03) — the shift raises q where y = 1 and lowers it where y = 0, which is a
Brier gain and a bias wash. Q3 **hit**: S3 = no worsens by 1.2%, under the 1.5% bar. Q4 **missed
on the size by an order of magnitude** — −0.17% against −1.5 to −3.5% — and hit on the sign and on
the count (21 of 21 against a predicted 20). Q5 **missed**: 5.5% of asks, under the 8–15% band.
Q6 **hit** on the number (0.065–0.067 in 0.03–0.10) and wrong on the call: L3 was named the
likeliest to fire and cleared its bar by 0.015. Q7 **hit**: 1.446 and 1.493 at two and five alive
cards, in 1.40–1.55. Q8 **missed on the sign**: −0.74, not +0.5 to +2.0, inside the floor as
written. The direction was right seven times in eight on the records and wrong abroad, and the size
was over-predicted every time it was predicted: the calibrated licence is a real, small thing on the
records and a loss in play, through a path no prediction named.

**What is fixed by this record.** The knob and its test; `attribute.mjs --alt-knobs` /
`--assign-alt` and the `unsoundShipped` counter; the declare pin above, for any future belief
change; the fault-counter disclosure and the restated wire check for the next arm; row 18 and the
ladder row. Nothing on Monet's vector.

**Scratch state, not committed:** the records study `$SP/monet-v16/{run-v16-fit.sh, run-v16-held.sh,
v16-agg.mjs, fit-agg.txt, held-agg.txt, hold-diag.mjs, zero-diag.mjs, out/}` (39 fit and 21 held-out
outputs, the identity and tripwire pins, `out/locks-*` the declare pricer on the base and arm
records); the bridge run `$SP/monet-v16/{DOSES.json, common.sh, export-v16.sh, step0.sh, step2.sh,
run-conf-lanes.sh, pin-arm.sh, report-v16.mjs, records/, cell-*.txt, calib-*, botlog-*}` (the 24
cells, the 25 records, every botlog with its coverage line), the tree export `$SP/fishai-v16` (lib
of `bae7b7b`, md5 16f52e16…), the arms `$SP/arm_v16` from `$SP/mkarm-v16.mjs` (the v0.11 MUSTFIX
bot.mjs, md5 330328d9…, unchanged), and the draw `$SP/seeds-v16.mjs`.

### 3.8m Monet v0.17 — the §3.9 read on v0.9's vector: the ladder's closing artefact, and nothing ships

#### Pre-registration — written 2026-09-06, before any panel cell or second-arm cell was played

**Opened by row 18**, taken under the owner's standing authorization of 2026-09-05. §3.8l closed the
belief axis, the seventh measured negative in a row; the ask ranker (§3.8d–§3.8i), the assignment
(§3.8j), the inference (§3.8k) and the likelihood (§3.8l) are measured out, and the search arm at
the affordable budget was a no-op abroad (§3.8a). What the ladder owes now is not a mechanism but
the number: **§3.9's six conditions, executed in full on v0.9's vector — the shipped bot — and
reported whether met or not.** Nothing is fitted, nothing ships, no dose is read; the deliverable
is the table the owner's fork in §0.3 needs (ship v0.9 in the browser at about 40% and publish the
negative result, or fund the lab-only search at twice the budget). The version number is kept so
the ladder's rows stay one per decision, as "the gate readout (was to be v0.5)" did.

**Condition 1 and 2 — the win rate against SESTINA v1.0, every seed, the SD.** Already read twice,
on seed sets that share nothing, both on the MUSTFIX bridge with the identity pin passed: **§3.8l's
twelve** (41.31%, SD 1.29 across seeds, SE 0.37, every seed in §3.8l's record; 14,400 games) is the
read, and **§3.8f's twelve** (40.11%) its replication. The bar is 50.0% at the paired floor:
**not met, by about nine points, on both.** No new cell is spent on this condition — a third twelve
would say nothing the floor does not already say, and §6.5 keeps its seeds.

**Condition 3 — the panel.** `monet-v17-base` (v0.9's vector: `MONET_ARM` v0.4c with `contest` 0.6
overlaid, MUSTFIX, on the export of `4658a51`, main after #34, whose `lib/` is byte-identical to
`bae7b7b`'s) against the lineage in their engine — **`v02 v03 v04 v05 v06`**, the panel §6.4 names —
on §3.8l's twelve seeds, 1,200 games a cell, **60 cells**, every cell recorded. Read as: **"beats"
= the twelve-seed mean is above 50.0% by at least the floor (≥ 52.00), every seed reported**;
**"monotone" = Monet's win rate is ordered v02 ≥ v03 ≥ v04 ≥ v05 ≥ v06 ≥ SESTINA**, ties inside the
floor allowed. §6.4's inherited levels at v0.1 were 67.42 / 62.06 / 34.25 / 33.31 / 32.86% against
27.83% at SESTINA.

**Condition 4 — declare accuracy ≥ 98.0% and zero fault counters.** Declare accuracy per cell from
the engine's line, on the twelve §3.8l base cells and the 60 panel cells. The fault counters are
the adapter's **fourteen, by name** (`traceFallback`, `traceErrorBranch`, `askNotAsk`,
`pollNotWindowMove`, `passNotPass`, `passNotCandidate`, `declareShapeBad`, `planMismatch`,
`planMismatchP`, `booksDisagree`, `successHolderClash`, `viewInvariant`, `forcedOwnTeamOut`,
`forcedNone`), summed over every process of every cell from the botlogs' `COVER` lines, **with the
wire check restated** (§3.8l's disclosure): `planMismatch` / `planMismatchP` now compare the
declaration that goes out — `decide()`'s own assignments and p — with the engine's own
`planClaimFor(view, policy, book)`, the planner every declare branch of `decide()` runs; the old
capacity-greedy restatement is kept as `planGreedyDiff` / `planGreedyDiffP`, information and not a
fault. The restatement touches no play; the adapter's md5 is recorded in `$SP/monet-v17/ARM_MD5`
beside the v0.11 arm's, and the identity pin of condition 5 proves the play unchanged. The engine's
own lines — `limit hits`, `FATAL` — are read on every cell. §3.8l's twelve base cells were played by
the previous adapter, whose stale counters fired on every cell; for them the fourteen are reported
as they read, with the two stale ones so labelled.

**Condition 5 — §6.2's controls, the mirror cell not among them.** (i) **Op coverage, expectations
written now** from the twelve §3.8l base cells against SESTINA, per cell: `opAsk` 49,862–53,733 ·
`opPoll` 337,151–364,791 · `opPass` 252–305 (**> 0, the tripwire**) · `passfixDeclines` 270–327 ·
`mustfixDeclines` 344–490 · `opForced` 1,821–3,218 · `lastResort` 22–55 · `decisions`
389,988–420,850 · `declaresEmitted` 10,203–11,587. Against the lineage the bands are expected to
shift with the opponent's play; the expectation for every panel cell is **every op exercised and
`opPass` > 0**, the totals reported, and `opAsk` / 1,200 cross-checked against the engine's asks a
game. (ii) **Byte-exact null arm**: the restated adapter replays §3.8l's base cell at 6269924
against SESTINA and must reproduce it — 40.75%, every engine line but `elapsed` — **before any
panel cell is played**. (iii) **Cross-instrument pin**: condition 6's arm is the cross-instrument.
(iv) **Paired deals**: every cell on §3.8l's twelve seeds at 200 deals × 6 rotations. (v) **Fault
counters**: condition 4. (vi) **Calibration harness**: the twelve base cells' `calib` files (own
asks realised ≈ 50,000–54,000 a cell, believed against realised per decile, the licensed and the
uncertain subsets); expectation **aggregate |bias| < 0.01 and the worst decile |bias| < 0.10 on
every cell**. (vii) **Completion**: every cell has a win-rate line. (viii) **Home regression**: not
applicable — nothing ships; **the mirror cell is not run.**

**Condition 6 — a second, independently built arm on the same spec.** An adapter written by an
independent agent from FishLab's *documented* wire protocol alone (`docs/BOT_PACKAGE.md`,
`docs/PLAY.md` — the documented protocol, permitted; no FishLab source read or copied; the present
adapter never shown to its author, nor any `bot.mjs`), to the spec at `$SP/monet-v17/INDEP-SPEC.md`,
written before the agent was started: `monetPolicy('v0.9')` from the same export at every decision
through `decideExplained(view, policy, seed)`; the view rebuilt from the host's `state` and
`history`; the decision seed `hashSeed(\`fishlab:${seat}:${sortedHand}:${eventCount}:${ordinal}\`)()`;
MUSTFIX's two semantics (§3.8f: a compelled claim below certainty answered `none` in the optional
poll; the forced endgame answered about the polled set — FishAI's own claim when it names that set,
otherwise the capacity-greedy plan for it, which is what the present bridge sends there and is
disclosed here as a choice of the instrument, not of the bot); the clinch left to the host. The
arm plays SESTINA on §3.8l's twelve seeds, every cell recorded. **Reproduction = IDENTICAL to
§3.8l's base cell on every seed** (every engine line but `elapsed`) — the seed rule makes that the
expectation, not a hope; failing identity, each difference is located to a view or a request
before the number is read, and the twelve-seed mean is reported paired against the base's with the
floor. An agent that cannot finish is reported as such; a cell it cannot play is void, not a
failure of condition 6.

**Void, not negative.** A cell without a win-rate line; the identity pin not identical; a hello line
not carrying its arm's label; any of the fourteen counters non-zero on a restated-adapter cell (now
a real fault) — each voids the cell and is investigated before anything is read from it.

**Predictions, before any cell.** P1 the panel: **v02 and v03 beaten** (≥ 70% and ≥ 65%); **v04, v05
and v06 not beaten** — each between 44 and 50% (the inherited 33–34% plus the 13.5 points v0.9
gained over v0.1 against SESTINA), so **condition 3 fails**, with the order monotone. P2 the second
arm **IDENTICAL on 12 of 12**; if not, the discrepancy sits in the forced endgame or the declare
window and the twelve-seed mean is within ±2.00 of 41.31. P3 calibration: aggregate |bias| < 0.01 on
12 of 12, worst decile < 0.10. P4 declare accuracy ≥ 99.3% on every cell, the panel included. P5
the fourteen counters **zero on every restated-adapter cell**; `planGreedyDiff` at 2–4% of declares.
P6 the verdict: **conditions 1 and 3 not met, 2, 4, 5 and 6 met — Monet v1.0 does not exist at
v0.9's vector, and the ladder's number is 41.31% on §3.8l's twelve and 40.11% on §3.8f's.**

**What may not be concluded.** No mechanism, no dose, nothing about why the lineage reads as it
does; nothing ships; the §0.3 fork is the owner's, and this record only puts the table in front of
it.

**Seeds.** §3.8l's twelve, replayed for pairing (spent seeds replayed, not sampled); 6269924
replayed for the identity pin. No fresh draw.

#### Record — 2026-09-06

**Monet v1.0 does not exist at v0.9's vector, and §3.9's table now says so in full.** 41.31%
against SESTINA v1.0 on §3.8l's twelve seeds and 40.11% on §3.8f's (conditions 1 and 2); the
panel monotone, v02 and v03 beaten on every seed and v04, v05 and v06 beaten on none — 47.6 /
46.8 / 44.7% — so condition 3 fails; declare accuracy above 99.2% and every one of the fourteen
fault counters zero on every cell played by the restated adapter (4); §6.2's controls all passing,
the per-process op counts equal to the engine's own on 73 of 73 cells (5); and the number
reproduced to the hundredth on all twelve seeds — the records identical on ten — by a second
adapter written from the protocol document alone (6). Nothing ships. The fork of §0.3 is the
owner's, and row 19 puts it in front of the owner.

**Condition 1 and 2 — not met, twice.** The two reads of v0.9's vector against SESTINA v1.0 on the
MUSTFIX bridge, each twelve seeds × 200 deals × 6 rotations, every seed on record:

> | read | seeds | mean | SD across seeds | SE | min – max | bar |
> |---|---|---|---|---|---|---|
> | §3.8l's twelve (the read) | 6269924 7549725 5242661 6002277 9277927 1700521 7863927 1836519 8279242 7472431 4385920 1411503 | **41.31%** | 1.29 | 0.37 | 39.42 – 43.00 | 50.0 — **not met by 8.7** |
> | §3.8f's twelve (the replication) | 2344938 4334282 4920114 5682873 5690135 6007102 6848576 7140858 7951876 8516315 8816427 9677918 | **40.11%** | 1.55 | 0.45 | 37.25 – 42.33 | 50.0 — **not met by 9.9** |

The two seed sets differ by 1.20 points with a standard error of 0.58 between them — two seeds'
worth of the same bot, not two bots. Every one of the 24 seeds is under 44%.

**Condition 3 — the panel: two of five beaten, the order monotone, and the wall where §6.4 put it.**
`monet-v17-base` against `v02 v03 v04 v05 v06` in their engine on the twelve seeds, 60 cells,
72,000 games, every cell recorded and every lane clean — `FATAL` 0 and `COVERAGE FAIL` 0 on all
60, every hello line carrying the label, `limit hits 0%` everywhere:

> | seed | v02 | v03 | v04 | v05 | v06 | SESTINA (§3.8l) |
> |---|---|---|---|---|---|---|
> | 6269924 | 74.33 | 70.58 | 44.75 | 48.08 | 45.08 | 40.75 |
> | 7549725 | 73.17 | 69.50 | 47.67 | 43.58 | 43.83 | 39.58 |
> | 5242661 | 71.75 | 71.83 | 46.92 | 45.92 | 42.67 | 39.42 |
> | 6002277 | 75.92 | 69.92 | 49.33 | 48.00 | 44.50 | 42.83 |
> | 9277927 | 73.83 | 69.42 | 48.75 | 47.67 | 43.75 | 41.00 |
> | 1700521 | 73.58 | 72.33 | 47.08 | 47.17 | 45.25 | 40.83 |
> | 7863927 | 73.83 | 70.17 | 47.33 | 46.50 | 43.92 | 42.17 |
> | 1836519 | 74.17 | 70.33 | 48.25 | 47.83 | 46.58 | 41.42 |
> | 8279242 | 75.42 | 71.92 | 43.83 | 47.83 | 43.67 | 42.42 |
> | 7472431 | 75.67 | 69.25 | 47.83 | 44.67 | 46.42 | 42.58 |
> | 4385920 | 74.50 | 70.17 | 49.83 | 47.42 | 47.17 | 39.75 |
> | 1411503 | 74.00 | 69.33 | 49.83 | 47.00 | 43.83 | 43.00 |
> | **mean** | **74.18** (SD 1.15) | **70.40** (SD 1.07) | **47.62** (SD 1.86) | **46.81** (SD 1.42) | **44.72** (SD 1.39) | **41.31** (SD 1.29) |
> | seeds above 50% | 12 of 12 | 12 of 12 | 0 of 12 | 0 of 12 | 0 of 12 | 0 of 12 |
> | sets a game, Monet − opponent | 5.41 − 3.59 | 5.22 − 3.78 | 4.44 − 4.56 | 4.40 − 4.60 | 4.32 − 4.69 | 4.19 − 4.81 |
> | beaten at the floor (mean ≥ 52.00) | **yes** | **yes** | no | no | no | — |

**v02 and v03 are beaten on every seed; v04, v05 and v06 on none.** The order is monotone —
74.18 ≥ 70.40 ≥ 47.62 ≥ 46.81 ≥ 44.72 ≥ 41.31 — and the panel is what §6.4 said it was: the two
rungs Monet clears, then a wall at v0.4, "the rung that carries the lineage's whole strength", with
the frontier 6.3 points behind the wall. Against v0.1's inherited levels (67.42 / 62.06 / 34.25 /
33.31 / 32.86 / 27.83%) the ladder gained +6.8 and +8.3 on the two it already beat and **+13.4 /
+13.5 / +11.9 / +13.5 on the four it does not** — the same thirteen points on each, which says the
shipped gains (v0.4c's λ, v0.9's contest credit, the MUSTFIX) are worth the same against the wall
as against the frontier and bought no ground on the wall itself. From v04 to SESTINA Monet loses
0.1 to 0.6 sets a game. **Condition 3 is not met, on three of five.**

**Condition 4 — declare accuracy and the fault counters.** Declare accuracy on the twelve §3.8l base
cells: 99.51–99.79% (bar 98.0%); on the sixty panel cells **99.20–99.82%** (the minimum a v03
cell) — every cell of the 73 read here above 99.2%. The fourteen fault counters,
summed from the per-process cover files (§6.2: never from `bot.log` — and the botlogs did lose
lines here: 33–36 `COVER` lines kept of 36 processes on every cell, so the botlog sums quoted in
§3.8l's disclosure, 220–456 a cell, were undercounts of the 220–459 the files hold):

> | cells | adapter | the fourteen | of which stale | `planGreedyDiff` / `planGreedyDiffP` (information) |
> |---|---|---|---|---|
> | §3.8l's twelve base cells | v0.11 MUSTFIX (md5 330328d9…) | twelve of fourteen **zero** on 12 of 12; `planMismatch` 220–459, `planMismatchP` 543–870 a cell | both — the greedy restatement against the joint chain | — |
> | the identity cell 6269924 | restated (md5 c1fc7316…) | **all fourteen zero** | — | 360 / 723 — the same numbers the stale counters read on the same cell under the old adapter (360 / 723): the disclosure's equivalence, exact |
> | the 60 panel cells | restated | **all fourteen zero on 60 of 60** | — | 186–782 a cell against v02, v03, v05 and v06; 8,151–18,226 against v04, where the count takes in the compelled claims MUSTFIX then declined (the check runs before the decline, and the wire check ran on every one of them and stayed at zero) |
> | the second arm's twelve cells | independent (its own counters) | `viewFaults`, `fallbacks`, `errors`, `forcedNone` **zero** on every cell; `FATAL` 0 | — | — |

The engine's own lines: `limit hits 0%` and no `FATAL` on every cell read here.

**Condition 5 — §6.2's controls.** (i) **Op coverage.** The pre-registration's bands were summed
from the botlogs; §6.2 says to sum the per-process files, and the difference is exactly the one
§6.2 warned of (a process in 36 lost to the shared descriptor). The bands from the files, over the
twelve base cells: `opAsk` **53,224–54,679** — equal to the engine's own count of A's asks on
**13 of 13** cells (the identity cell included), the cross-check §6.2 asks for, exact; `opPoll`
361,224–369,201; `opPass` **265–305, > 0 on every cell** (the tripwire); `passfixDeclines`
278–327; `mustfixDeclines` 365–510; `opForced` 2,050–3,284; `lastResort` 22–55;
`declaresEmitted` 10,709–11,856; `decisions` 417,540–426,846; `newGames` 3,600 = 1,200 games ×
3 seats on every cell. The sixty panel cells, from the files: `opAsk` 52,761–61,376 — **equal to
the engine's count of A's asks on 60 of 60**; `opPoll` 356,064–393,303; `opPass` **245–349, > 0
on 60 of 60**; `passfixDeclines` 263–415; `opForced` 1,067–4,625; `lastResort` 11–82;
`declaresEmitted` 11,039–13,544; `decisions` 412,219–456,173; `newGames` 3,600 on every cell;
every op exercised on every cell. One band moves with the opponent and is worth a line:
`mustfixDeclines` — the compelled, below-certainty claims MUSTFIX answers `none` in the optional
poll — runs 368–1,035 a cell against v02, v03, v05 and v06 and **12,673–24,561 against v04**, ten
to twenty a game: v04's games spend long stretches in the position where FishAI's rule set would
compel Monet to declare and this host polls instead, and the forced endgame (`opForced`
2,030–3,385, `lastResort` 27–58 against v04) settles those sets as §3.8f designed. Not a fault;
a property of the pairing, recorded so the next reader of a v04 cell is not surprised by it.
(ii) **Byte-exact null arm**: the restated
adapter replayed 6269924 against SESTINA before any panel cell — **IDENTICAL** to §3.8l's base
cell, every engine line but `elapsed` (40.75%, n = 1,200), and identical on every one of the
adapter's own counters. (iii) **Cross-instrument pin**: condition 6. (iv) **Paired deals**: every
cell on the twelve seeds at 200 × 6. (v) **Fault counters**: condition 4. (vi) **Calibration
harness**, the twelve base cells' own asks (50,127–54,679 realised a cell), believed against
realised: aggregate |bias| **0.0046–0.0096** (bar 0.01, **12 of 12**), worst decile |bias|
**0.065–0.098** (bar 0.10, **12 of 12**); the licensed subset's bias +0.004 to +0.011 (its
uncertain part +0.009 to +0.022), the [0.3, 0.5) deciles over-believed by 0.02–0.04 and the
[0.6, 0.9) deciles under-believed by 0.02–0.10 on every one of the twelve — the same shape §3.3a
first measured: the belief is a little too sure of its long shots and not sure enough of its good
ones. (vii) **Completion**: every cell
named here has a win-rate line. (viii) **Home regression**: not applicable, nothing ships; **the
mirror cell was not run.**

**Condition 6 — the second arm reproduces the number exactly.** The independent adapter
(`$SP/arm_v17_indep/monet-v17-indep`: `bot.mjs` md5 4f524e71…, with `arm.mjs` and
`translate.mjs`; its author read `docs/BOT_PACKAGE.md` and `docs/PLAY.md` and nothing else of
FishLab's, never an adapter of this project's, and built the view directly from the host's `state`
and `history` — checked at home against FishAI's own `seatView` on 87,575 views with 0 differences
and 16,449 of 16,449 decisions in parity; its `NOTES.md` is beside it) played the twelve seeds
against SESTINA, every cell recorded, `FATAL` 0 and its own `viewFaults`, `fallbacks` and `errors`
0 on every cell:

> | seed | base (§3.8l) | second arm | the record, game for game |
> |---|---|---|---|
> | 6269924 · 7549725 · 5242661 · 6002277 · 1700521 · 7863927 · 8279242 · 7472431 · 4385920 · 1411503 | 40.75 · 39.58 · 39.42 · 42.83 · 40.83 · 42.17 · 42.42 · 42.58 · 39.75 · 43.00 | the same, to the hundredth, on each | **IDENTICAL** — every engine line but `elapsed`, every event of every game |
> | 9277927 | 41.00 | 41.00 | 2 games of 1,200 differ, at one event each; the win-rate and set lines identical, the ask-accuracy line off in the fourth decimal |
> | 1836519 | 41.42 | 41.42 | 1 game of 1,200 differs, at one event; the win-rate and set lines identical, the out-of-turn line off by one declare |
> | **pooled** | **41.31** | **41.31** | paired **+0.00** on 12 of 12 |

**Where the three games differ**, located in the records (`locate-diff.mjs`, games keyed by deal
and rotation): each at the same position — a seat has just declared its last cards, holds the turn
with a pass pending, and the host polls the table. The first adapter's seat passes first and the
next teammate polled declares the team's next certain set; the second arm's seat declares it itself
before passing. Same set, same side, same hands in two of the three games, which are then identical
to the end; in the third (deal 182, rotation 1 of 9277927) the pass goes to a different teammate
and the trajectory diverges, to the same final score. The spec did not name that position: FishAI's
own reducer closes the window for the duration of a pending pass (reduce.ts, §3.1 of the rules),
and this host has no such phase — it polls — so both adapters answer a position FishAI's rules never
reach, each author resolved it, and the two resolutions differ on 3 events in 28,800 games and on
no result. **Condition 6 is met**: the number is reproduced seed for seed, and the one difference
between two adapters written apart is located and is not a defect of either.

**Verdict — §3.9's table.**

> | condition | reads | met? |
> |---|---|---|
> | 1 · win rate ≥ 50.0% against SESTINA v1.0, 12 seeds × 200 deals, floor ±2.00 | **41.31%** on §3.8l's twelve, **40.11%** on §3.8f's | **no** — short by 8.7 and by 9.9 |
> | 2 · every seed reported, the SD published | 24 seeds on record; SD 1.29 and 1.55 | yes |
> | 3 · the panel monotone; v0.2 through v0.6 beaten | monotone; v02 74.18 and v03 70.40 beaten on every seed; v04 47.62, v05 46.81 and v06 44.72 beaten on none | **no** — three of five |
> | 4 · declare accuracy ≥ 98.0%; zero fault counters | 99.20–99.82% on 73 cells; the fourteen zero on every restated-adapter cell (the two stale ones disclosed on the twelve base cells, re-read at zero on the identity cell) | yes |
> | 5 · §6.2's controls, the mirror not among them | op counts equal to the engine's on 73 of 73, `opPass` > 0 everywhere; the null arm IDENTICAL; paired deals; calibration inside its bars on 12 of 12; every cell complete; no mirror | yes |
> | 6 · reproduced by a second, independently built arm | the same win rate to the hundredth on 12 of 12 seeds (41.31 = 41.31); the records identical on 10 of 12; the 3 differing games located to one position the spec did not name, no result changed | yes |

**Monet v1.0 does not exist at v0.9's vector.** The ladder's number for the shipped bot against
SESTINA v1.0 is **41.31% on §3.8l's twelve seeds and 40.11% on §3.8f's**, reproduced to the
hundredth on every seed by a second adapter written from the protocol document alone, with the panel's
wall at v0.4 — 47.6% — unmoved by the thirteen points the ladder gained everywhere else. The belief
programme's honest expectation (§0.3, "31–37%") was beaten by about five points, and the frontier is
still nine away. Nothing ships from this record. The fork in §0.3 is the owner's, with this table in
front of it: row 19.

**Predictions, scored.** P1 **hit, in every part**: v02 74.18 (≥ 70), v03 70.40 (≥ 65), v04 47.62,
v05 46.81 and v06 44.72 (each in 44–50), condition 3 failed, the order monotone. P2 **hit on the number and, in the letter, on 10 of 12**: identical records on ten seeds, the
same win rate on all twelve; the discrepancy sat where the prediction put it — a declare-window
position, the pending pass — and not in the forced endgame. P3
**hit**: aggregate |bias| < 0.01 on 12 of 12, worst decile < 0.10 on 12 of 12. P4 **missed by a
tenth of a point on one cell**: a v03 cell reads 99.20% against a predicted ≥ 99.3% everywhere;
the other 72 cells clear it. P5 **hit on the counters** — the fourteen zero on every one of the 73
restated-adapter cells — and **wide on the information counter**: `planGreedyDiff` runs 1.6–6.5%
of declares against four of the five lineage bots, not 2–4%, and is not comparable against v04 at
all. P6 **hit**: conditions 1 and 3 not met, 2, 4, 5 and 6 met. Six predictions, five hits and a
miss by a tenth of a point; the one thing this read could not have predicted from the roadmap —
that the panel's wall would stand at v04 with the same thirteen points gained on it as on the
frontier — is the finding.

**What is fixed by this record.** The table above; the restated wire check in the bridge adapter
(scratch, `$SP/arm_v17/bot.mjs`, md5 c1fc7316…), which every arm from here carries; §6.2's
op-coverage row is to be read from the per-process files and this record's bands; decision row 19.
Nothing on Monet's vector. Nothing ships.

**Scratch state, not committed:** `$SP/monet-v17/{common.sh, export-v17.sh, step0.sh,
step-panel.sh, run-panel-lanes.sh, step-indep.sh, sum-cover.mjs, report-panel.mjs,
report-indep.mjs, INDEP-SPEC.md, cell-*.txt, cover-*/, calib-*.txt, botlog-*.log, records/,
step0.log, panel-*.log}`, the tree export `$SP/fishai-v17` (lib of `4658a51`, md5 16f52e16…, the
same bytes as v0.16's), the arms `$SP/arm_v17` from `$SP/mkarm-v17.mjs` and
`$SP/v17-patch-adapter.cjs`, and the second arm `$SP/arm_v17_indep/monet-v17-indep` with its
`NOTES.md`.

### 3.8n The publication — 2026-09-06: row 19 taken as (1), and the rule from here

**Decision row 19, taken by the owner on 2026-09-06: (1).** Nothing on Monet's vector changes;
`monetPolicy('v0.9')` stays what the lobby seats. What this rung ships is the record's public form:

- **The paper.** `papers/monet.tex` — the eleventh in `papers/` and the second cross-engine result —
  built by `npm run papers:build` into `public/papers/monet.pdf` (10 pages) and listed on `/papers`
  beside the other ten. Every number in it is a number in this document, cited by section; it adds no
  measurement. Its headline is §3.8m's table; its second finding is the panel's wall (+13 points on
  v04, v05, v06 and SESTINA alike, none of the four beaten); its third is §3.8c's — the hit chance is
  not the value of an ask.
- **The copy.** The README's row for this document and its papers paragraph; the `/papers` page (the
  entry, the counts, and the research topic *"do these styles survive contact with an independently
  written bot?"* moved from open to answered — not at the frontier); the lab report's papers card; and
  the lobby's Monet note, which had said "under development" since v0.1 and now says what v0.9 is. The
  "about 96%" agreement figure stays: `tests/play/models.test.ts` measures it at 95.78% on v0.9.
- **The bridge, archived.** The FishLab clone, the engine binaries, every arm (the second adapter
  included), every records corpus and the Docker image — 42,165 files, 7.46 GB, and the image — copied
  from the session scratchpad to the owner's bench directory outside the public tree, with a manifest,
  the six md5 pins verified after the copy, and the scratchpad's layout kept so every `$SP/...` path
  this document quotes resolves under that root. §9 stands: FishLab carries no licence file, and
  nothing of it enters this repository.

**The rule from here (§0.3, the owner's call of 2026-09-06).** The objective is the paired win rate
against SESTINA v1.0 on the translated bridge. A rung is chosen by its expected gain there — the
record's own priors and nothing else — and ships when a pre-registered read on twelve fresh seeds,
pinned in-engine at 100% before it is read, puts its paired mean at least **two standard errors above
zero** and ahead on a majority of seeds. The ±2.00 floor stays the definition of a *rung* in the
ladder table; a term that ships under it is marked as such. Two guards against the winner's curse a
looser bar invites: the confirmation seeds are always fresh (§6.5), and a stack of shipped terms is
re-read **as a whole** against the last shipped vector before another term is fitted on it. Still not
recommended: a belief change without the declare pin (§3.8l); a fresh ranker term fitted from scratch
(four measured out, §3.8i); a v1.0 claim on any seed count under twelve (§3.9).

**What runs next: decision row 20.** The record already holds two measured terms above two standard
errors and under the floor on v0.9's vector, both off the shipped vector: the exposure charge on
certain hits (`exposure` 0.6 + `exposureCertain`: +1.07 paired, SE 0.54, ahead on 8 of 12 — §3.8e,
read on the old bridge, the pair standing) and the closing credit (`closing` 0.5: +0.58, SE 0.23,
9 of 12 — §3.8h). Under the rule above they are the cheapest rung there is: **v0.18 reads the stack**
— v0.9 + exposure, v0.9 + closing, v0.9 + both — paired against v0.9 on twelve fresh seeds, about one
bridge hour, its pre-registration (§3.8o) written before a cell. Behind it, in order: the even-3
bucket as a target (§3.8c R1, 40% of SESTINA's extra sets, never attacked) and the deeper search form
(§3.8a, +0.60 at home at 1.7× the budget, never abroad).

### 3.8o Monet v0.18 — the stack read: the two measured terms under the floor, apart and together

**Decision row 20, taken 2026-09-06 under the owner's direction of the same day — *"going forward,
we should just pick whatever will improve the winning percentage of Monet"* — by the rule of
§3.8n.** Not a new mechanism. Two terms already built, fitted and read on v0.9's vector, each under
the ±2.00 floor and above two standard errors, read again on twelve fresh seeds against v0.9 — apart
and together — with the arm that clears §3.8n's rule shipping as `monetPolicy('v0.18')`.

#### Pre-registration — written 2026-09-06, before any cell

**The facts this rung starts from.**

- The exposure charge on certain hits (§3.8e, the u1 arm: `exposure` 0.6 + `exposureCertain`):
  **+1.07** paired over v0.9 on twelve fresh seeds (SD 1.89, SE 0.54, t 1.96, ahead on 8 of 12),
  read on the old bridge — the pair within the rung stands (§3.8f). Its markers there: ask accuracy
  54.60% from 55.25%, declarations 4.11 a game from 4.08, lock hold 6.76 from 6.78.
- The closing credit (§3.8h, the w3 arm: `closing` 0.5): **+0.583** paired over the corrected v0.9
  on twelve fresh seeds (SD 0.79, SE 0.23, ahead on 9 of 12), on the translated bridge; every
  pre-registered marker moved as written, each by about a tenth of its gap.
- Neither has been read beside the other. Both act in `pickAsk` on the same candidates — the charge
  prices what a hit gives away, the credit pays for an ask that brings a held set within reach —
  and under `exposureCertain` the priced terms are ungated beside a legal certain hit while the
  closing credit keeps its own certain-hit gate (§3.8h's tests). §0.1's rule, that terms promoting
  the same asks do not add, is the prior for the joint arm.
- §3.4a's oracle bound (38.28%) is on v0.4's ask policy and does not bind here; the bound the four
  ranker terms were fitted against is §3.8c's counterfactual surplus at SESTINA's decisions, +6.8
  points of hit chance, of which v0.9 took +4.04.

**The arms**, every one v0.9's vector (`MONET_ARM` v0.4c + `contest` 0.6) plus the override, MUSTFIX,
the restated adapter of §3.8m (md5 c1fc7316…, unchanged — the bridge does not move for this rung),
on the v0.18 tree export (`5d49d1e`, lib md5 16f52e16…, the same bytes as v0.16's and v0.17's):

> | arm | override beside `contest` 0.6 | for |
> |---|---|---|
> | base | — | the pair |
> | e | `exposure` 0.6 + `exposureCertain` | §3.8e's u1, re-read on the translated bridge |
> | c | `closing` 0.5 | §3.8h's w3, re-read on fresh seeds |
> | ec | both | the stack |

**The read.** Twelve fresh seeds by §6.5's rule from `monet-v0.18-confirm-12` (85 seeds spent or
reserved before the draw, none drawn twice): **9502823 8047376 7423220 5202785 5458804 5543368
8844324 4136509 6890891 5005191 8317657 7029023**. Every cell 200 deals × 6 rotations = 1,200 games
against SESTINA v1.0, recorded; 48 cells, four containers wide (one per arm), about half an hour of
bridge. Before a fresh seed is spent, the base arm replays seed 6269924 and must be IDENTICAL to
§3.8l's base cell, every engine line but `elapsed` (§6.2's byte-exact null arm; the tree and the
adapter are the ones §3.8m pinned). After the cells, every arm is pinned in-engine on its own
records — `attribute.mjs --cf v0.9 --cf-knobs <the arm's override>` must agree with the play at
100.0% of A's decisions on seed 9502823 (§3.8l's pin) — or the arm's number is not read.

**The rule (§3.8n), fixed now.** An arm clears when its paired mean over the twelve seeds is at
least two standard errors (over seeds) above zero **and** it is ahead on at least seven of the
twelve. **The arm with the largest paired mean among those that clear ships as
`monetPolicy('v0.18')`** — its deviation from v0.9 pinned in `tests/bots/monet.test.ts` with a
forward bank emitted from the clean tree, the registry and the lobby following. If `ec` clears but
a single term clears with a larger mean, the single term ships: each arm is a whole vector read
against v0.9, so the stack is re-read as a whole by construction. If no arm clears, nothing ships
and the record says what each term is worth on the translated bridge on fresh seeds. The ±2.00
floor is reported beside the rule and decides the word: an arm that ships under it is a *term
shipped under the floor*, not a rung. Home duplicate pairs — 600 on `home-a`, the shipped arm
against v0.9 — are reported, not gating, as in §3.8d: the mirror does not price these terms. The
lobby's honesty floor stands as `tests/play/models.test.ts` writes it: if the shipped arm's
agreement with Bass v2.0 over the test's games falls under 95%, the sentence in `models.ts` is
rewritten, not the threshold.

**The markers**, from the engine's own lines as means over the twelve cells, arm against base: ask
accuracy, declarations a game and their accuracy, forced declarations, lock hold, events a game,
the calibration bias and worst decile. And §6.2's table on every cell: the fourteen fault counters
from the per-process cover files zero; `opAsk` equal to the engine's count of A's asks; `opPass`
> 0; every cell with a win-rate line.

**Void rules.** The identity cell differing: nothing runs. A cell without a win-rate line: rerun
once, then the seed is reported as missing and the arm read on eleven with the fact stated. A fault
counter non-zero on an arm's cells: that arm is disqualified from shipping and its number reported
with the fault. A pin under 100.0%: the arm's number is not read.

**Predictions, written before any cell.**

- **P1.** The base reads 39.5–42.5% on the fresh twelve (the two prior twelves: 41.31, SD 1.29;
  40.11, SD 1.55), SD 1.0–1.9.
- **P2.** `e`: +0.3 to +1.8 paired, ahead on 7 to 10 of 12; ask accuracy 0.4 to 0.9 points under
  the base's; declarations a game up by 0.02 to 0.06.
- **P3.** `c`: +0.2 to +1.0 paired, ahead on 7 to 10 of 12; ask accuracy within 0.3 of the base's.
- **P4.** `ec`: +0.6 to +2.2 paired, ahead on 8 to 11 of 12; sub-additive — under `e` + `c` by 0.1
  to 0.6.
- **P5.** The rule: `e` and `ec` clear; `c` is the one in doubt (its +0.58 was 2.5 × SE on an SD of
  0.79 that a fresh twelve need not repeat); the ship candidate is `ec`.
- **P6.** §6.2's table clean on 48 of 48: the fourteen zero, `opAsk` equal to the engine's count,
  `opPass` > 0; calibration aggregate |bias| < 0.01 and worst decile < 0.10 on every base cell.
- **P7.** The identity cell IDENTICAL; every arm pinned at 100.0%.

**Cost** S. **Scratch, not committed:** `$SP/monet-v18/{DOSES.json, common.sh, export-v18.sh,
step0.sh, step-conf.sh, run-lanes.sh, report-v18.mjs, pin-arm.sh}`, `$SP/mkarm-v18.mjs`,
`$SP/seeds-v18.mjs`, `$SP/arm_v18/monet-v18-{base,e,c,ec}`, `$SP/fishai-v18`.

#### Record — 2026-09-06

**Nothing clears the rule, and nothing ships.** The base — v0.9's vector, MUSTFIX, the restated
adapter — read **40.70%** on the fresh twelve (SD 1.49, SE 0.43; the two prior twelves 41.31 and
40.11). The three stack arms, paired against it seed by seed:

> | arm | paired mean | SD over seeds | SE | × SE | ahead | the rule (≥ 2 SE and ≥ 7 of 12) | the floor (+2.00) |
> |---|---|---|---|---|---|---|---|
> | **e** — `exposure` 0.6 + `exposureCertain` | **−0.15** | 2.31 | 0.67 | −0.2 | 7 of 12 | **no** — the wrong sign | no |
> | **c** — `closing` 0.5 | **+0.25** | 0.97 | 0.28 | 0.9 | 7 of 12 | **no** | no |
> | **ec** — both | **+0.70** | 1.87 | 0.54 | 1.3 | 8 of 12 | **no** | no |

> | seed | base | e | e − base | c | c − base | ec | ec − base |
> |---|---|---|---|---|---|---|---|
> | 9502823 | 39.75 | 41.17 | +1.42 | 41.25 | +1.50 | 41.75 | +2.00 |
> | 8047376 | 40.83 | 39.75 | −1.08 | 42.08 | +1.25 | 40.33 | −0.50 |
> | 7423220 | 43.67 | 39.92 | −3.75 | 42.67 | −1.00 | 40.92 | −2.75 |
> | 5202785 | 40.83 | 40.92 | +0.08 | 42.08 | +1.25 | 43.00 | +2.17 |
> | 5458804 | 41.00 | 43.50 | +2.50 | 41.08 | +0.08 | 43.92 | +2.92 |
> | 5543368 | 39.83 | 37.92 | −1.92 | 39.08 | −0.75 | 39.50 | −0.33 |
> | 8844324 | 39.50 | 41.33 | +1.83 | 39.75 | +0.25 | 41.83 | +2.33 |
> | 4136509 | 37.50 | 40.50 | +3.00 | 39.33 | +1.83 | 39.17 | +1.67 |
> | 6890891 | 41.58 | 40.83 | −0.75 | 41.08 | −0.50 | 43.00 | +1.42 |
> | 5005191 | 41.17 | 36.92 | −4.25 | 40.75 | −0.42 | 38.75 | −2.42 |
> | 8317657 | 41.67 | 42.42 | +0.75 | 41.75 | +0.08 | 43.50 | +1.83 |
> | 7029023 | 41.08 | 41.42 | +0.33 | 40.50 | −0.58 | 41.17 | +0.08 |
> | **mean** | **40.70** | **40.55** | **−0.15** | **40.95** | **+0.25** | **41.40** | **+0.70** |

**The exposure charge does not replicate.** §3.8e read it at **+1.07** (SE 0.54, ahead on 8 of 12)
on the old bridge, on the twelve of its own rung; on the translated bridge, on twelve seeds fresh
to it, the same term on the same vector reads **−0.15** (SE 0.67). The two reads are 1.22 apart on
a standard error of the difference of 0.86 — 1.4 SE — which is consistent with a term worth a few
tenths read twice through noise, and consistent with the old read having been a high draw; the
record cannot tell those apart and the rule does not need it to. Its markers moved exactly as
§3.8e described them and as P2 predicted: ask accuracy **0.60 under** the base's (55.06 → 54.46),
declarations up 0.018 a game, forced declarations down (0.112 → 0.094 a game), lock hold down
(7.21 → 7.02 events). And the other side of the ledger is on the same lines: SESTINA's ask accuracy
fell by **0.55** under the charge (57.19 → 56.64) — the term does take from the certain hit what it
was built to take, and it costs Monet's own asks almost exactly as much. Net, nothing. That is
§3.8c's finding a second time, on the other team: the hit chance an ask gives away is not the
value of the ask any more than the hit chance it keeps.

**The closing credit is what it was, and small.** §3.8h read it at **+0.583** (SD 0.79, SE 0.23,
ahead on 9 of 12) on the translated bridge; here **+0.25** (SD 0.97, SE 0.28, ahead on 7 of 12).
The two are 0.33 apart on a standard error of the difference of 0.36 — the same term read twice.
Pooled at equal weight over the twenty-four seeds it is **+0.42 (SE 0.18, 2.3 × SE)**: a real few
tenths, on the record as information and nothing else. The rule reads twelve *fresh* seeds so that
a term is never shipped on the twelve that picked it, and on its fresh twelve the credit is under
the bar (2 × 0.28 = 0.56). Its ask accuracy stayed within 0.13 of the base's, as P3 wrote; SESTINA's
moved 0.22.

**The stack is the sum of its parts, read through noise.** `ec` at +0.70 (SE 0.54) is ahead on 8 of
12 and inside P4's band at its bottom edge; the interaction `ec − (e + c)` is **+0.60**, the sign
opposite to P4's sub-additive prior, on an uncertainty of about ±0.9 (the three differences share
the base cells, so the naive standard error is a guide, not a number). The read says nothing about
the interaction and nothing new about the stack: with `e` at about zero on this bridge, `ec` is
`c` plus noise, and it is under the bar by the same margin.

**What twelve seeds can read, fixed by this rung.** The three paired standard deviations — 2.31,
0.97, 1.87 — set the rule's resolution at twelve seeds: two standard errors is **1.33 points** for a
term that moves as many asks as the exposure charge and **0.56** for one as quiet as the closing
credit. A term worth half a point is unreadable at twelve seeds unless it is very consistent; to
read +0.5 at two standard errors on an SD of 2.3 takes about 85 seeds — 100,000 games, seven bridge
hours an arm. The consequence for row 21 is direct: under the rule the next rung has to be a
mechanism priced at a point or more, not another sub-point ranker term, and pricing it comes
before building it.

**The markers**, means over the twelve cells (arm against base, from the engine's lines):

> | marker | base | e | c | ec |
> |---|---|---|---|---|
> | sets a game, Monet − SESTINA | 4.164 − 4.836 | 4.172 − 4.828 | 4.182 − 4.818 | 4.192 − 4.808 |
> | ask accuracy, Monet (SESTINA) | 55.06 (57.19) | 54.46 (56.64) | 54.93 (56.97) | 54.41 (56.50) |
> | declarations a game, at accuracy | 4.016 at 99.68% | 4.034 at 99.69% | 4.040 at 99.67% | 4.054 at 99.68% |
> | forced declarations a game, at accuracy | 0.112 at 54.8% | 0.094 at 52.6% | 0.108 at 53.0% | 0.089 at 53.6% |
> | lock hold, events / cashed | 7.21 / 4.71 | 7.02 / 4.64 | 7.11 / 4.68 | 6.92 / 4.60 |
> | events a game | 101.5 | 100.9 | 101.3 | 100.9 |
> | calibration, aggregate bias / worst decile | +0.0065 / 0.090 | +0.0080 / 0.083 | +0.0066 / 0.092 | +0.0085 / 0.088 |

The set gap narrows by 0.016, 0.036 and 0.056 sets a game under `e`, `c` and `ec` — a few
hundredths, in the order of the win-rate differences, none of it at the floor. Declare accuracy
stays at 99.67–99.69% on every arm (§3.9's bar 98.0).

**Home duplicate pairs** (600 on `home-a`, the arm against v0.9; reported, not gating): `e` +0.042
± 0.249 sets a pair at 49.50%; `c` +0.043 ± 0.194 at 50.58%; `ec` +0.093 ± 0.254 at 49.67%. About
zero, all three, as §3.8d found for these terms: the mirror does not price them.

**§6.2's table.** (i) **The identity cell.** The base arm at 6269924, before any fresh seed was
spent: **IDENTICAL** to §3.8l's recorded cell on every engine line but `elapsed` (40.75%). (ii) **The
in-engine pins.** Every arm on its own records at 9502823, `attribute.mjs --cf v0.9` with the arm's
knobs overlaid: **100.0%** of A's decisions on all four (base, `e`, `c`, `ec`). (iii) **The cells.**
48 of 48 with a win-rate line, 1,201 record lines each, exit 0 on every lane; `FATAL` 0 and
`COVERAGE FAIL` 0 in every cell's bot log. (iv) **The fault counters.** The fourteen **zero on every
one of the 1,754 intact per-process cover files**; `planGreedyDiff` 176–540 and `planGreedyDiffP`
402–1,019 a cell, information as before. (v) **Op coverage.** `opAsk` equal to the engine's count of
A's asks, exact, on **42 of 49** cells as harvested (the identity cell and 41 read cells); `opPass`
224–304, above zero on every cell. On the other seven — base 4136509 and 6890891, `e` 8317657 and
7029023, `c` 5543368, `ec` 8844324 and 6890891 — one seat process's file was missing or empty (two on
`ec` 6890891): eight of 1,764 seat exits. The mechanism, read in the engine's bridge source: it
closes a seat's stdin and allows it about 300 ms before a kill, and the adapter's close-out writes
its stderr lines and then one file to the bind mount; four containers on one host pushed eight
exits past the window. v0.16 and v0.17 saw none in 3,096 files with fewer containers running at
once. On those seven cells the intact files' `opAsk` is short of the engine's by 1,269–1,678 for one
seat (2,826 for the two), a seat's share (about 1,470 asks a cell), and the fourteen are zero on
every intact file. **The control was then completed:** each of the seven cells was replayed under
its own tag two containers wide, and a cell is byte-deterministic in its seed — all seven replays
are **IDENTICAL** to the originals on every engine line but `elapsed`, with **36 of 36** files each,
the fourteen zero and `opAsk` equal to the engine's count on all seven; the win rates read are the
originals', unchanged, and the harvest defect is on the record with its fix (§6.2, below). (vi)
**Calibration** on the base cells: aggregate bias +0.0037 to **+0.0110**, worst decile 0.053 to
**0.114** — one cell over P6's bias bar (6890891) and four over its decile bar (9502823, 5458804,
6890891, 7029023), where v0.16's twelve sat inside both on 12 of 12 (0.065–0.098) and its identity
cell read 0.109. The decile is the belief's thinnest bin and a fresh twelve put four cells a
hundredth over it; reported, not a control, and no arm's number turns on it.

**Predictions, scored.** P1 **hit**: 40.70 (39.5–42.5), SD 1.49 (1.0–1.9). P2 **missed on the number,
hit on the mechanism**: −0.15 against +0.3 to +1.8; ahead on 7 (7–10); ask accuracy 0.60 under
(0.4–0.9); declarations +0.018 a game (0.02–0.06, a hair under). P3 **hit**: +0.25 (+0.2 to +1.0),
ahead on 7 (7–10), ask accuracy within 0.13 (0.3). P4 **half**: +0.70 inside +0.6 to +2.2 at its
edge and ahead on 8 (8–11), but super-additive by 0.60 where sub-additive by 0.1–0.6 was written.
P5 **missed**: nothing clears, and the term "in doubt" is the one whose read held. P6 **missed as
written**: the fourteen zero and `opPass` > 0 everywhere, but the per-process harvest complete on 41
of 48 before the replay, and the calibration bars exceeded on one and four base cells. P7 **hit**:
IDENTICAL; 100.0% on all four pins. Three hits, one half, three misses — the misses all in the
direction of a term worth less than its prior.

**What is fixed by this record.** Nothing on Monet's vector; `monetPolicy('v0.9')` stays what the
lobby seats and the registry is unchanged. Two values on the translated bridge on fresh seeds: the
exposure charge on certain hits at **about zero** (−0.15 ± 0.67) with its markers intact, and the
closing credit at **about +0.4** (twenty-four seeds, 2.3 × SE) — under the rule's bar on its fresh
twelve, under the floor by a factor of five. The rule's resolution at twelve seeds (1.3 points for a
loud term, 0.6 for a quiet one). And a harvest defect in the per-process control with its fix, into
§6.2's practice for every rung from here: **at most three containers at once**, and **a missing or
empty cover file replays the cell** — byte-identical, under its own tag — before the cell is read.

**Scratch state, not committed:** `$SP/monet-v18/{DOSES.json, common.sh, export-v18.sh, step0.sh,
step-conf.sh, run-lanes.sh, report-v18.mjs, pin-arm.sh, sum-cover-v18.mjs, step-rerun.sh,
run-rerun.sh}`, `report-v18.txt`, `cover-summary.txt`, the 48 read cells, the identity cell and the
seven replays (`cell-*.txt`, `records/*.jsonl`, `cover-*/`, `calib-*.txt` — two of the latter
recomputed from the intact files, so marked — `botlog-*.log`), `out/pin-{base,e,c,ec}-9502823.txt`,
`out/home-{e,c,ec}.txt`, `$SP/arm_v18/monet-v18-{base,e,c,ec}`, `$SP/fishai-v18`,
`$SP/mkarm-v18.mjs`, `$SP/seeds-v18.mjs`; copied to the bench beside the rest (§3.8n).

### 3.8p Monet v0.19 — the even-set race: §3.8c R1's bucket priced on v0.9's vector before anything is built for it

**Decision row 21, taken 2026-09-06 under the owner's direction of the same day, by §3.8n's rule
and §3.8o's finding that the next rung has to be priced at a point or more before it is built.**
An instrument rung: no bridge cell, no change under `lib/`, nothing ships. The question is what the
even bucket — the 3–3 deals, §3.8c R1's largest pool — is worth on v0.9's vector against SESTINA,
and whether any of it is reachable by a mechanism this document can name.

#### Pre-registration — written 2026-09-06, before the instrument exists

**The facts this rung starts from.**

- §3.8c R1, on v0.4c (34.28%, twelve seeds): the even sets carried **0.43 of SESTINA's 1.09 extra
  cashed sets a game (40%)** — a 3–3 deal won by SESTINA 58 to 42, A − B **−0.414** sets a game —
  named the contested race and left unattacked. v0.9's contest credit (§3.8d) is an appetite for
  asks into sets the opponents *dominate*, the B-majority bucket, not this one.
- One v0.9 cell, §3.8o's pin at seed 9502823 (39.75%): even sets 2.92 a game, A cashed 1.15, B 1.37,
  open 0.35 — A − B **−0.186**; the majorities +0.797 and −1.348; all −0.737.
- §0.1's conversion, as §3.8j used it: about **15 points of win rate a set a game** (14.96).
- The instrument: `scripts/attribute.mjs` walks every recorded game on the true deal and reproduces
  Monet's play at 100.0% through `--cf v0.9` (§3.8l's pin). It reports the deal's split against the
  set's fate; it does not report the *race* — who asked into the set first, what each side spent,
  who took it — nor how each side's asks are spread over the split classes.

**The instrument, to build: `--races` on `scripts/attribute.mjs`**, nothing under `lib/`. Per game
and per set: the deal's split class (even 3 / A majority / B majority); the side whose ask first
went into the set, its event index and whether it hit; asks, hits and misses by side into the set
until it resolves; the outcome (A, B, or open at the clinch); contested (both sides asked) or not;
the race length in events. Reported per class and per starter (A started / B started / resolved
before any ask): sets a game, P(A takes) among the resolved with the open share beside it, asks
and hits a set by side, the race length, the contested share. And the asks by class: of each
side's asks, the share into each class and the hit rate there — by the deal's split and by the
side's own holding at the time of the ask — and at each side's decisions the counterfactual's
class beside the actual's, so the question *does Monet's picker open a 3–3 race as often as
SESTINA does at SESTINA's positions?* has a number. **Checks:** the races' outcomes by class sum
exactly to the split table's `A cashed + A gifted`, `B cashed + B gifted` and `open` on every cell;
`--cf v0.9` agrees with the play at 100.0% of A's decisions on every v0.9 cell (the pin); a home
game under `--validate` walks clean; the two class assignments (by the deal, by the holding) agree
on every ask made before any hit into the set.

**The corpora**, all on record, none new:

> | corpus | cells | games | for |
> |---|---|---|---|
> | v0.18's base cells (§3.8o) | 12 | 14,400 | v0.9 against SESTINA on the fresh twelve — the read |
> | v0.16's base cells (§3.8l) | 12 | 14,400 | v0.9 against SESTINA on §3.8l's twelve — the replication |
> | §3.8c's SS cells | 12 | 14,400 | SESTINA against itself — its race between equals |
> | v0.17's panel cells, v04 and v06 | 24 | 28,800 | v0.9 against the lineage it beats — the race when Monet is the stronger side |
> | home, v0.9 against v0.9 | 1 | 2,400 | Monet's own mirror in our engine |

**The readouts.** Write N for even sets a game; f_A, f_B for the shares of them whose first ask
is Monet's and SESTINA's; p_A = P(Monet takes | Monet started), q_A = P(Monet takes | SESTINA
started), and p_B, q_B the same for SESTINA — all among the resolved.

- **R1, the bucket on v0.9's vector.** A − B in the even sets a game, mean and SE over the twelve
  fresh cells, the majorities beside it, the replication beside that.
- **R2, the starter.** f_A and f_B; P(the starter takes) by side; p_A, q_A, p_B, q_B; asks spent a
  race by side; the race length; the uncontested share; the share resolved before any ask.
- **R3, the targeting.** Each side's share of asks into even sets and its hit rate there; at
  SESTINA's decisions, the counterfactual's even-set share beside SESTINA's own.
- **R4, the price**, in points at 15 a set: **(i) the ceiling** — the even bucket's gap closed to
  zero; **(ii) the priority bound** — N · f_B · (p_A − q_A): the sets Monet adds if it started the
  even races SESTINA now starts and took them at its own starter's rate, a bound that treats
  starting as the cause; **(iii) the conversion bound** — N · f_A · (p_B − p_A): if Monet took the
  races it starts at SESTINA's starter rate. The reachable price is the larger of (ii) and (iii),
  and the record names which.

**The rule, fixed now.** A mechanism is built — as v0.20, pre-registered with its own home fit and
bridge read under §3.8n — only if the reachable price is at least **1.0 point** (§3.8o's rule
reads 1.3 on a loud term and 0.6 on a quiet one at twelve seeds), and only along the readout that
carries it: **priority** (an ask-ranker credit for opening a 3–3 race the side is placed to win) if
(ii) carries it, **the in-race ask** (what to ask once the race is on) if (iii) does. Under 1.0 on
both, the even bucket joins the measured-out channels and row 22 says what is left. Nothing in
this rung is a mechanism; nothing ships from it; the numbers are the deliverable.

**Predictions, written before the instrument exists.**

- **P1.** The even bucket on v0.9's vector: A − B between **−0.32 and −0.10** sets a game (SE over
  seeds ≤ 0.03); the replication within 0.06 of it. v0.9 has recovered 0.1–0.3 of v0.4c's −0.414
  through the priced ask.
- **P2.** Starting matters, for both sides: P(the starter takes) **56–66%**, the two sides within 4
  points of each other; SESTINA starts 50–56% of the even races.
- **P3.** SESTINA's edge is split: p_B exceeds p_A by **2 to 10** points, and q_B exceeds q_A by 0 to 8.
- **P4.** SESTINA spends a larger share of its asks on even sets than Monet, by **2 to 6** points; at
  SESTINA's decisions the counterfactual chooses an even set less often than SESTINA did, by 2 to
  6; hit rates on even-set asks 55–62% (Monet) and 58–66% (SESTINA).
- **P5.** The ceiling 1.5–4.8 points; the priority bound **under 1.0**; the conversion bound **0.5–2.0**
  — the rule's call is the conversion readout, and it is close.
- **P6.** Against v04 and v06 the even bucket is Monet's (+0.05 to +0.40) and the starter effect is
  the same size as against SESTINA (within 5 points); in SESTINA's mirror the same size again —
  starting is a property of the game, not of SESTINA.
- **P7.** The checks hold on every cell: the sums exact, the pin 100.0%, the home walk clean, the
  two class assignments in agreement before any hit.

**Cost** S — no bridge; about 60 attribution runs, under an hour six wide. **Scratch, not
committed:** `$SP/monet-v19/{run-races.sh, report-races.mjs}` and the per-cell outputs
`out/races-<corpus>-<seed>.txt`.

#### Record — 2026-09-06

**The even bucket is worth 2.8 points on v0.9's vector, and the race is lost at one stage: the
first side to four of six converts its lead at 56% between equals, at 49% when it is Monet against
SESTINA, and at 61% when it is SESTINA against Monet.** The instrument ran as pre-registered on 61
cells and 74,400 games — every even sum exact against the split table, the two classings in
agreement on every pre-hit ask, the counterfactual at 100.0% of A's decisions on all 36 v0.9 cells
against SESTINA and the panel, and the home walk clean under `--validate` — and read this:

> | readout | v0.9 vs SESTINA, the fresh twelve | the replication (§3.8l's twelve) | SESTINA's mirror | v0.9 vs v04 | v0.9 vs v06 | v0.9's mirror at home |
> |---|---|---|---|---|---|---|
> | A win | 40.70% | 41.31% | 50.00% | 47.62% | 44.72% | 50.42% |
> | R1 · A − B by bucket: A majority / **even** / B majority | +0.806 / **−0.190 (SE 0.012)** / −1.306 | +0.843 / **−0.196 (0.011)** / −1.298 | ±1.027 / **0** | +0.964 / **−0.015 (0.012)** / −1.193 | +0.883 / **−0.070 (0.017)** / −1.339 | +1.124 / **+0.033** / −1.066 |
> | even sets a game; opened by A / by B / by nobody | 2.93; **63.7% / 34.0%** / 2.3% | 2.98; 63.0 / 34.8 / 2.2 | 3.06; 47.6 / 47.6 / 4.9 | 2.98; 69.6 / 26.8 / 3.6 | 2.98; 71.6 / 25.9 / 2.6 | 2.94; 56.8 / 41.4 / 1.8 |
> | R2 · P(the opener takes the set) | 52.6% | 52.0% | 54.2% | 50.3% | 49.4% | 54.4% |
> | R2 · p_A / q_A (Monet takes it: Monet opened / the other side opened) | **49.2% / 41.4%** | 48.6 / 42.3 | 54.2 / 45.8 | 49.9 / 48.7 | 48.7 / 48.6 | 54.3 / 45.4 |
> | R2 · p_B / q_B (the other side takes it: it opened / Monet opened) | **58.6% / 50.8%** | 57.7 / 51.4 | 54.2 / 45.8 | 51.3 / 50.1 | 51.4 / 51.3 | 54.6 / 45.7 |
> | the opener's edge s = p_A − q_A; the other side's in-race edge e = p_B − p_A | **s +7.8, e +9.4** | s +6.3, e +9.1 | s +8.4, e 0 | s +1.2, e +1.4 | s +0.1, e +2.7 | s +8.9, e +0.3 |
> | R2 · asks a race, A / B: Monet opened; the other side opened | 5.47 / 4.81; 4.34 / 6.26 | 5.48 / 4.84; 4.40 / 6.21 | 6.36 / 3.91; 3.91 / 6.36 | 5.74 / 5.40; 3.87 / 5.53 | 5.59 / 5.07; 3.84 / 5.12 | 5.79 / 4.98; 4.91 / 5.72 |
> | R2 · race length in events, Monet opened / the other opened; left open at the clinch, the same | 35.6 / 26.3; **12.3% / 5.4%** | 35.0 / 26.3; 12.6 / 5.7 | 25.4 / 25.4; 8.8 / 8.8 | 33.7 / 25.5; 9.7 / 8.5 | 33.5 / 22.7; 10.7 / 6.4 | 34.7 / 34.0; 8.0 / 10.2 |
> | R3 · share of asks into even sets by the deal, A / B (hit there) | 34.8 / 35.3% (59.2 / 60.3%) | 35.7 / 36.2 (59.3 / 60.5) | 36.1 / 36.1 (54.2) | 33.6 / 34.5 (62.6 / 61.4) | 36.1 / 35.3 (61.0 / 62.9) | 36.0 / 35.9 (64.5 / 65.1) |
> | R3 · at B's decisions, the counterfactual's even share by the deal / by the holding, against B's own | 35.6 / 26.9 against 35.3 / 24.0 | 36.4 / 27.0 against 36.2 / 24.1 | 36.5 / 27.1 against 36.1 / 24.2 | 36.2 / 25.6 against 34.5 / 22.3 | 36.9 / 27.2 against 35.3 / 22.7 | 35.9 / 24.7 against 35.9 / 24.7 |
> | R4 · ceiling / priority bound / **conversion bound**, points at 14.96 a set | +2.84 (0.18) / +1.14 (0.07) / **+2.62 (0.13)** | +2.94 / +0.99 / **+2.56** | 0 / +1.82 / 0 | +0.22 / +0.15 / +0.42 | +1.04 / +0.01 / +0.86 | −0.49 / +1.63 / +0.06 |

**R1 — the bucket.** −0.190 sets a game on the fresh twelve, −0.196 on the replication: **2.8 points**
of the 9.3 between v0.9 and the frontier, a quarter of the set gap (0.69). v0.9 recovered 0.22 of
v0.4c's −0.414 through the priced ask — the contest credit targets the sets the opponents dominate,
and a game in which Monet steals more is a game in which its even races go better too. Against v04
and v06 the bucket is not Monet's either: −0.015 and −0.070. Monet beats the lineage on the
majorities (+0.96 and +0.88 against −1.19 and −1.34) and breaks even or worse in every contested
race it has played; in its own mirror the bucket is +0.033, the seating's share.

**R2 — the race has two numbers, and only one of them is SESTINA's.** By construction p_B = 1 − q_A
and q_B = 1 − p_A, so the four rates are two: the **opener's edge** s = p_A − q_A, what a side gains
by being the one whose ask went in first, and the **other side's in-race edge** e = p_B − p_A, how
much more often it takes the races it opens than Monet takes the races Monet opens. Against SESTINA
s is +7.8 (replication +6.3) and e is **+9.4** (+9.1). In the mirrors s is +8.4 (SESTINA's) and +8.9
(Monet's) with e zero, as symmetry demands; against v04 and v06 s is +1.2 and +0.1 and e is +1.4
and +2.7. So:

- The opener's edge is a property of the table, not of SESTINA: about +8 wherever two modern bots
  race — Monet against Monet as much as SESTINA against SESTINA — and nothing at all against the
  v04 lineage, whose races go to whoever opened them exactly as often as to whoever did not. P6
  predicted the same edge at every table; the lineage's tables have none.
- Monet opens the most races of anyone: 64% against SESTINA, 70% against v04 and v06, 57% a side
  in its own mirror. SESTINA opens the fewest: 34% against Monet and 47.6% a side in its own
  mirror, with 4.9% of even sets resolved before either SESTINA asked into them. SESTINA is
  selective about which 3–3 races it starts; Monet starts nearly all of them, and the v04 and v06
  corpora price that at nothing — Monet opens 70% there and its races go 49.9 and 48.7.
- Monet takes the races it opens at **49%** against every opponent (49.2, 48.6, 49.9, 48.7) and at
  54.3 against itself. The opponent's rate on its own openings is where the opponents differ:
  **SESTINA 58.6%, v04 51.3%, v06 51.4%**. The whole of SESTINA's even-bucket margin is in the races
  it chooses to open and then prosecutes — 6.3 asks a race against Monet's 5.5 as opener, an ask
  into the set every four events against Monet's every six and a half, 26 events to a resolution
  against 36, and 5.4% of its openings left unresolved at the clinch against 12.3% of Monet's.

**R3 — targeting is not the difference.** Every side at every table puts 34–36% of its asks into
even sets by the deal, Monet no less than SESTINA (34.8 against 35.3), and at SESTINA's own
decisions Monet's counterfactual would choose an even set as often as SESTINA did by the deal (35.6
against 35.3) and *more* often by the holding at the time (26.9 against 24.0). What SESTINA prefers
at those decisions is its own majorities — the sets it already holds most of — where Monet's
picker would spread to the even and opponent-majority sets. The hit rate on even-set asks is 59.2%
for Monet against 60.3% for SESTINA (60.9 against 63.7 by the holding): a point or three, not a
race. The lever is not which set to ask into, and P4 missed on both shares.

**R4 — the price.** The ceiling **2.8 points** (2.9 on the replication). The priority bound
**+1.1** (+1.0) — what Monet would add by opening the 34% of races SESTINA opens and taking them at
its own 49% — which the v04 and v06 corpora already price at zero. The conversion bound **+2.6**
(+2.6) — what Monet would add by taking the races it opens at SESTINA's 58.6% instead of its
49.2%. The conversion bound carries the price, at more than twice the rule's 1.0, and the rule's
call is **the in-race play, not the opening**. The bound is a bound: it treats SESTINA's rate as
attainable by a Monet that keeps its 64% opening share, and SESTINA's rate is earned partly by
opening fewer races.

**Post hoc — inside the race** (the second table of `--races`, designed after the readouts above
were read and so labelled; the runs re-done into their own directory, every check holding again):

> | corpus | opener | first to four: opener / the other / neither | converted the lead when first to four: Monet / the other side | first lock: Monet / the other | take-backs a race: Monet / the other |
> |---|---|---|---|---|---|
> | v0.9 vs SESTINA, the fresh twelve | Monet | 68.1% / 28.8% / 3.1% | **49.1% / 60.7%** | 42.9% / 44.8% | 1.21 / 1.34 |
> | | SESTINA | 61.8 / 37.1 / 1.1 | **47.0 / 60.6** | 38.0 / 55.7 | 1.16 / 1.21 |
> | the replication | Monet | 68.5 / 28.4 / 3.1 | 48.7 / 61.6 | 42.4 / 45.2 | 1.23 / 1.36 |
> | | SESTINA | 60.8 / 38.3 / 0.9 | 48.0 / 60.2 | 38.8 / 54.8 | 1.17 / 1.22 |
> | SESTINA's mirror | either | 68.5 / 29.1 / 2.4 | 55.9 / 56.5 | 49.5 / 40.0 | 0.92 / 0.98 |
> | v0.9 vs v04 | Monet | 63.6 / 33.8 / 2.6 | 51.2 / 55.6 | 44.4 / 45.8 | 1.51 / 1.62 |
> | | v04 | 53.9 / 44.0 / 2.0 | 54.7 / 54.8 | 44.1 / 47.6 | 1.00 / 1.03 |
> | v0.9 vs v06 | Monet | 67.3 / 29.3 / 3.4 | 49.4 / 59.1 | 43.2 / 46.2 | 1.35 / 1.46 |
> | | v06 | 54.7 / 44.1 / 1.2 | 55.3 / 55.7 | 45.2 / 48.3 | 0.95 / 1.00 |
> | v0.9's mirror | either | 58.7 / 40.5 / 0.8 | 56.5 / 51.5 | 50.3 / 42.4 | 1.56 / 1.54 |

Every lock is cashed (98.4–99.5% on every row, the hold from the lock to the declare 1.5–2.7
events) and none is broken, which is the rules: a set that sits wholly in one team's hands cannot
be asked out of it. So the race is decided before the lock, at **four of six**. The opener reaches
four first about two thirds of the time at every table (68% against SESTINA, 68.5% in SESTINA's
mirror, 64–67% against v04 and v06, 59% in Monet's). What differs between tables is what the lead
is worth. Between equals the first side to four converts it at **56%** — 55.9 and 56.5 between
SESTINAs, 56.5 and 55.8 between Monets. Monet against SESTINA converts its leads at **49.1% and
47.0%**; SESTINA against Monet at **60.7% and 60.6%**. Since a lead is converted or recovered,
those are two facts about the 4–2 stage: SESTINA recovers 51–53% of Monet's leads where a Monet
defender recovers 44% of a Monet lead and a SESTINA defender 44% of a SESTINA lead, and SESTINA
holds its own leads at 61% where either bot holds 56% against its own kind. Against v06 the shape
holds on Monet's openings (49.4 against 59.1) and vanishes on v06's (55.3 against 55.7); against
v04 it is small on both (51.2 against 55.6; 54.7 against 54.8). The
first-lock line says the same thing from the lock's side: Monet, first to four on 68% of its
openings, is first to the lock on 43% of them against SESTINA and on 50% against itself.

The concrete difference on the record is **pace**: SESTINA asks into the race it opened every four
events and resolves it in 26; Monet asks into its own every six and a half and takes 36, with the
located cards taken back in between (1.34 take-backs a race by SESTINA on Monet's openings; 0.95 a
race between SESTINAs, whose races end before the take-back). Whether the pace is a choice the fast
policy can make — the next ask into the set at 4–2, the turn kept for it — or the product of
SESTINA's lookahead knowing where the two missing cards sit, the records on hand do not say: the
ladder's one attempt at the chase (§3.8g, v0.13) read negative because the seat could not tell
which side held the missing cards, and §3.8j found that belief calibrated. That is the question
row 22 puts.

**Predictions, scored.** P1 **hit**: −0.190 in −0.32 to −0.10, SE 0.012, the replication 0.006
away, 0.22 of v0.4c's bucket recovered. P2 **missed**: P(the opener takes) 52.6% against 56–66;
SESTINA opens 34% against 50–56; and "the two sides within 4 points" was vacuous, the opener's edge
being one number by construction. P3 **half**: p_B − p_A = 9.4 inside 2–10; q_B − q_A = 9.4 outside
0–8 — and the prediction counted one quantity twice. P4 **missed on the shares, hit on the hits**:
no 2–6 point targeting gap in either direction (34.8 / 35.3; the counterfactual 35.6); hit rates
59.2 and 60.3 inside their bands. P5 **one of three**: the ceiling 2.84 inside 1.5–4.8; the priority
bound 1.14 not under 1.0 (0.99 on the replication); the conversion bound 2.62 above 0.5–2.0 — the
call went to the conversion readout as written, but "close" it was not. P6 **missed on both
counts**: the even bucket is not Monet's against v04 and v06 (−0.015, −0.070) and the opener's edge
there is 1.2 and 0.1 against 7.8. P7 **hit**: 61 of 61 sums exact, the classings in agreement, the
pins at 100.0% on 36 of 36, the home walk clean. Two hits, two halves, three misses — every miss
saying the same thing: the race is not about who opens it or which set is chosen.

**The rule, applied.** The reachable price is the conversion bound, **+2.6 points** on both twelves,
above 1.0: a mechanism is to be built as v0.20 along the in-race ask, and along nothing else —
not the opening (priced at zero on two corpora), not the targeting (no gap), not the chase credit
(measured negative). The stage is four of six in a contested set; the behaviour is pace; whether
the fast policy has the choice is what v0.20's first step must price before its term is fitted
(row 22).

**What is fixed by this record.** Nothing on Monet's vector. `--races` on `scripts/attribute.mjs`
— the race per set and the asks by class, with the even sums checked against the split table on
every run, and the post-hoc table so labelled. The numbers above, on 74,400 games. **Scratch, not
committed:** `$SP/monet-v19/{run-races.sh, run-races-posthoc.sh, report-races.mjs}`, `out/` and
`out-posthoc/` (`races-<corpus>-<cell>.{txt,json}`, 61 each), `report-races-prereg.txt`,
`report-races-posthoc.txt`; copied to the bench beside the rest.

### 3.8q Monet v0.20 — the four-of-six decision: is the pace of a race a choice the fast policy can make?

**Decision row 22, taken 2026-09-06 under the owner's direction of the same day — (a).** §3.8p priced
the even bucket at 2.8 points and put the loss at one stage: the first side to four of six converts
its lead at 56% between equals, at 49% when it is Monet against SESTINA, at 61% when it is SESTINA
against Monet, and the difference on the record is pace — SESTINA asks into the race it opened every
four events, Monet every six and a half. This rung is the first step of the mechanism §3.8p's rule
calls for: before a term is fitted, the records say whether the pace is a *choice* Monet's picker
makes differently from SESTINA at the same positions, or whether the two make the same choices
and SESTINA's simply hit more. An instrument rung: no bridge cell, nothing under `lib/`, nothing
ships.

#### Pre-registration — written 2026-09-06, before the instrument exists

**The population.** A *lead decision* is an ask decision by a side that, at that moment, holds
four of six in an opened, unresolved, even-by-the-deal set (by the true holding; the seat may not
know it) — the *lead set* — with the other side holding the other two. A *trail decision* is the
mirror: the side holds two of six in such a set. A decision can be both (a lead in one set, a trail
in another); it is counted in both populations. Within the population the ask is classed by what
it did about the set: **into the lead set** (a *chase*; certain or uncertain by the public record;
hit or miss; a *sure miss* when the card asked for sat with the asker's own side), **a certain hit
elsewhere** (the turn kept), or **an uncertain ask elsewhere**; for the trailer, **a take-back**
(a certain ask into the set), **an uncertain ask into the set**, **elsewhere certain**, **elsewhere
uncertain**. At every decision of the other side, and at Monet's own, the counterfactual
(`--cf v0.9`) is classed the same way at the same point.

**The instrument, to build: `--race42` on `scripts/attribute.mjs`**, beside `--races`, nothing under
`lib/`. Per side: lead decisions a game and the class shares (chase certain / chase uncertain /
elsewhere certain / elsewhere uncertain), the chase hit rate and sure-miss share, and the
counterfactual's class shares at the same decisions; the same for trail decisions with the
take-back in place of the chase. Per race (even, opened, first to four by side X): at X's **first**
lead decision, whether X chased, and whether X converted; the number of lead decisions and chases
until resolution; the same at the trailer's first trail decision (took back or not) and the outcome.
**Checks:** the races counted here equal `--races`' first-to-four counts on every cell; every lead
decision's lead set is at 4–2 by the tracked deal at the moment of the ask (asserted in the walk);
`--cf v0.9` at 100.0% of A's decisions on every v0.9 cell; a home game under `--validate` walks
clean.

**The corpora**, the same as §3.8p's: v0.18's twelve base cells, v0.16's twelve, SESTINA's mirror,
v04 and v06 from the panel, and the validated home mirror — 61 cells, 74,400 games, all on record.

**The readouts.**

- **R1, the choice.** At lead decisions, the chase share (any chase) for Monet and for SESTINA,
  and the counterfactual's chase share at SESTINA's lead decisions beside SESTINA's own: the
  *choice gap* Δ_lead = SESTINA's chase share − the counterfactual's at the same points. At trail
  decisions the take-back share the same way: Δ_trail.
- **R2, the quality.** The chase hit rate and sure-miss share, Monet against SESTINA; the
  counterfactual's chase hit rate at SESTINA's lead decisions where both chased.
- **R3, the outcome.** P(convert | chased at the first lead decision) against P(convert | did not),
  per side and per corpus; the same for the trailer's first take-back.
- **R4, the mirrors.** R1–R3 in SESTINA's mirror, Monet's mirror and against v04 and v06.

**The rule, fixed now.** The pace is *a choice Monet's picker does not make* if **Δ_lead ≥ 5 points
or Δ_trail ≥ 5 points** on both twelves against SESTINA, in the direction R3 says converts more.
Then v0.20b — its own pre-registration, under §3.8n — fits a race-pace term in the ask ranker (a
credit on the next ask into a lead set the side has just reached four in, or on the take-back at
two, or both, whichever readout carries Δ) at home and reads it abroad on twelve fresh seeds,
shipping only by §3.8n's bar. If both gaps are under 5 points — the counterfactual already chases
and takes back as often as SESTINA at SESTINA's positions and the difference is in R2, the hit
rate of the same choices — then the fast policy has no pace choice to make, the race is decided by
what SESTINA knows at four of six, and row 23 says whether the search arm (row 22's (b)) or the
belief is the next question; no term is fitted from this rung. Nothing here is a mechanism;
nothing ships from it.

**Predictions, written before the instrument exists.**

- **P1.** SESTINA chases at 55–70% of its lead decisions; Monet at 40–55%; the counterfactual at
  SESTINA's lead decisions chases 8–20 points less than SESTINA does: **Δ_lead 8–20**.
- **P2.** SESTINA takes back at 60–80% of its trail decisions where a take-back is legal; Monet at
  45–65%; **Δ_trail 5–15**.
- **P3.** Monet's chases hit 3–8 points less than SESTINA's and carry 2–6% sure misses against
  SESTINA's 0–2%.
- **P4.** Chasing at the first lead decision converts more than not, by 5–15 points, for both
  sides and on every corpus; the trailer's first take-back recovers more than not, by 10–25.
- **P5.** In the mirrors Δ_lead and Δ_trail are within 3 points of zero (the counterfactual is the
  policy itself, up to seat and tie-break); against v04 and v06 the choice gaps run the other way
  (Monet chases more than v04 and v06, by 0–10).
- **P6.** The checks hold on every cell.

**Cost** S — no bridge; the 61 attribution runs again, under an hour six wide. **Scratch, not
committed:** `$SP/monet-v20/{run-race42.sh, report-race42.mjs}` and `out/race42-<corpus>-<cell>.{txt,json}`.

#### Record — 2026-09-06 (the runs the same day)

**The runs.** `--race42` built beside `--races` on `scripts/attribute.mjs` (nothing under `lib/`), run
over the 61 cells six wide in seven minutes: the 60 record cells (v0.18's twelve, v0.16's twelve,
SESTINA's mirror, v04 and v06 from the panel) and the 2,400-game home mirror under `--validate`.
**The checks, all clean:** the races counted here reconcile EXACTLY with `--races`' even
first-to-four counts, both leaders, on 61 of 61 cells; `--cf v0.9` at 100.0% of A's decisions on
49 of 49 v0.9 cells; the home walk clean; and at home the counterfactual's class equals the
policy's own at every lead and trail decision of BOTH sides (Δ_lead and Δ_trail identically 0.0,
the pin extended to the class). Scratch: `$SP/monet-v20/{run-race42.sh, report-race42.mjs,
report-race42.txt}` and `out/`.

**The table.** Six corpora; A / B, where A is v0.9 except in SESTINA's mirror; means over cells
with the SE over cells where it is wider than a tenth. "The counterfactual" is v0.9's picker run at
the same decision.

*The lead — a side holding four of six in an opened, unresolved, even-by-the-deal set.*

| readout | v0.18's twelve (v0.9 / SESTINA) | v0.16's twelve (replication) | SESTINA / SESTINA | v0.9 / v04 | v0.9 / v06 | home (v0.9 / v0.9) |
|---|---|---|---|---|---|---|
| lead decisions a game | 9.85 / 6.56 | 10.13 / 6.64 | 6.21 | 7.15 / 8.14 | 8.09 / 6.59 | 9.61 / 9.50 |
| **R1** chase share (of which uncertain) | **34.7% (32.1) / 59.4% (53.7)** | 34.8 (32.2) / 59.7 (53.8) | 63.7 (57.9) | 47.6 (43.4) / 47.5 (43.2) | 40.6 (37.1) / 56.5 (52.1) | 38.3 (35.5) / 39.0 (36.1) |
| R1 the counterfactual's chase share at B's decisions | 39.9% | 40.5 | 47.2 | 40.1 | 38.7 | 39.0 |
| **R1 Δ_lead** (SE over cells) | **+19.6 (0.2)** | **+19.2 (0.1)** | +16.5 (0.2) | +7.4 (0.4) | +17.8 (0.2) | 0.0 |
| R1 B elsewhere, certain / uncertain; the counterfactual at B's | 12.8 / 27.8; cf 24.1 / 36.0 | 12.7 / 27.5; cf 24.2 / 35.2 | 8.6 / 27.7; cf 12.5 / 40.4 | 15.0 / 37.5; cf 15.9 / 44.0 | 14.3 / 29.2; cf 21.5 / 39.8 | 17.6 / 43.4 |
| R1 A elsewhere, certain / uncertain | 14.8 / 50.6 | 15.0 / 50.2 | — | 12.3 / 40.1 | 13.2 / 46.2 | 17.5 / 44.2 |
| **R2** chase hit rate; sure-miss share | 53.0; 23.9 / 49.3; 21.9 | 52.6; 24.5 / 49.6; 21.7 | 47.5; 26.0 | 59.0; 23.1 / 48.8; 19.1 | 60.3; 21.7 / 50.1; 19.0 | 54.0; 21.0 / 52.5; 21.3 |
| R2 where both chased at B's decisions: B's hit / the counterfactual's | 54.7 / 57.4 | 55.2 / 57.7 | 53.3 / 54.4 | 52.0 / 56.1 | 54.7 / 56.2 | 52.5 / 52.5 |
| **R3** races led (first to four) a game | 1.64 / 1.15 | 1.69 / 1.17 | 1.42 | 1.67 / 1.13 | 1.78 / 1.05 | 1.47 / 1.39 |
| R3 the first lead decision was a chase | **49.5% / 98.3%** | 50.2 / 98.6 | 98.3 | 54.2 / 95.0 | 47.4 / 99.1 | 56.5 / 63.1 |
| R3 converted when it chased first / when it did not | **47.9 / 49.3; 60.8 / 53.4 (SE 4.0)** | 48.0 / 49.1; 61.0 / 52.4 (3.7) | 56.3 / 48.5 (2.2) | 51.7 / 52.2; 55.7 / 48.6 (1.4) | 50.7 / 50.4; 57.8 / 51.0 (5.5) | 53.5 / 55.6; 51.9 / 56.9 |
| R3 lead decisions a race; chases a race | 5.87; 1.60 / 3.38; 2.07 | 5.87; 1.63 / 3.33; 2.06 | 3.25; 2.06 | 3.81; 1.59 / 4.50; 2.01 | 4.41; 1.47 / 3.41; 1.93 | 5.28; 1.76 / 5.20; 1.80 |

*The trail — the side holding two of six in such a set.*

| readout | v0.18's twelve (v0.9 / SESTINA) | v0.16's twelve | SESTINA / SESTINA | v0.9 / v04 | v0.9 / v06 | home |
|---|---|---|---|---|---|---|
| trail decisions a game; a take-back legal | 4.99; 35.4% / 8.72; 50.9% | 5.03; 35.7 / 8.97; 50.8 | 4.98; 41.1 | 6.57; 30.4 / 5.65; 55.4 | 5.12; 32.8 / 6.81; 59.4 | 7.90; 36.3 / 7.86; 38.7 |
| **R1** take-back share: A; B; the counterfactual at B's; **Δ_trail** | 28.4; 21.2; 38.4; **−17.1 (0.2)** | 28.8; 21.3; 37.8; **−16.5 (0.2)** | 22.6; cf 31.0; −8.5 | 23.8; 40.3; 43.1; −2.8 | 27.4; 32.3; 47.0; −14.7 | 27.7; 29.1; 29.1; 0.0 |
| R1 among legal take-backs, taken: A; B; the counterfactual at B's | **80.1; 41.7; 75.4** | 80.7; 41.9; 74.4 | 55.0; cf 75.6 | 78.3; 72.7; 77.8 | 83.4; 54.4; 79.1 | 76.4; 75.2; 75.2 |
| R1 trail elsewhere, certain / uncertain: A; B; the counterfactual at B's | 9.6 / 58.8; 14.2 / 59.7; cf 19.1 / 40.0 | 9.6 / 58.5; 14.4 / 59.5; cf 19.3 / 40.3 | 7.6 / 62.0; cf 8.4 / 54.9 | 12.6 / 62.0; 14.1 / 39.8; cf 14.3 / 38.5 | 11.3 / 59.5; 13.7 / 49.6; cf 16.6 / 33.5 | 16.4 / 54.5; 16.6 / 52.6 |
| **R3** the trailer's first decision took back (in A-led races, the trailer is B; in B-led, A) | 27.1 / 43.4 | 27.0 / 43.3 | 34.1 | 52.1 / 40.1 | 42.4 / 42.8 | 38.9 / 38.1 |
| R3 recovered when it took back first / when not (A-led; B-led) | 53.1 / 43.7; 43.6 / 38.4 | 51.7 / 42.3; 43.8 / 38.3 | 49.2 / 42.4 | 49.6 / 48.0; 44.2 / 40.5 | 52.2 / 48.3; 44.0 / 39.4 | 43.9 / 39.9; 42.2 / 43.2 |

**R1, the choice — the pace is a choice, at the lead.** At SESTINA's own lead decisions it asks
into the race **59.4%** of the time; v0.9's picker, run at the same points with the same view,
would ask into it **39.9%**: **Δ_lead = +19.6** (SE 0.2), **+19.2** on the replication twelve.
The two policies agree on the certain chases (5.8% against 5.9%); the whole gap is in the
uncertain chase, 53.6% against 33.9%. Where the counterfactual goes instead: a certain hit
elsewhere 24.1% of the time against SESTINA's 12.8%, and an uncertain ask elsewhere 36.0%
against 27.8%. So a certain hit is on the table at 30.1% of SESTINA's lead decisions and SESTINA
takes one at 18.6% — **it forgoes a legal certain hit at 12.6% of its lead decisions** (11.5% net
of the 1.1% where it takes a certain hit the counterfactual would not; 12.9% on the replication),
a thing v0.9's picker never does (0.0% at every corpus: the `certaintyBonus` order is a rule, not a weight). At Monet's own lead
decisions the chase share is 34.7% and the counterfactual's is the same by construction. The
pattern is SESTINA's whole line: v04 chases 47.5% at its lead decisions against the
counterfactual's 40.1% (Δ +7.4), v06 56.5% against 38.7% (Δ +17.8), SESTINA 59.4% against 39.9%;
and Monet's wall against that line falls in the same order — 47.6%, 44.7%, 40.7%. Three policies
make a correlation, not a mechanism; it is written down because it is the first ranker-level
quantity on record that orders the panel.

**R1 at the trail — a choice too, and the other way.** SESTINA takes back at **21.2%** of its trail
decisions where v0.9's picker would at **38.4%**: **Δ_trail = −17.1**, −16.5 on the replication.
Among the decisions where a take-back is legal SESTINA takes it **41.7%** of the time; Monet
**80.1%**, and the counterfactual at SESTINA's positions 75.4%. What SESTINA does instead is ask an
*uncertain* ask elsewhere: 59.7% of its trail decisions against the counterfactual's 40.0% —
including, by the joint below, 14.4% where the counterfactual would take back and 5.9% where it
would take a certain hit elsewhere. The take-back is a certain hit that publishes the trailer's
holding in the race set; SESTINA declines more than half of them.

**R2, the quality — not SESTINA's edge.** Monet's chases HIT MORE than SESTINA's: **53.0% against
49.3%** (52.6 against 49.6 on the replication; 59.0 and 60.3 against v04 and v06, who hit 48.8 and
50.1). Both sides' chases carry about the same share of sure misses — asks for a card that sat with
the asker's own teammate — **23.9% for Monet, 21.9% for SESTINA**, 26.0% between SESTINAs, 21.0
and 21.3 between Monets: a quarter of every policy's chases, ten times what P3 predicted, and not a
Monet defect. Where SESTINA and the counterfactual both chase at the same decision, the
counterfactual's card-and-target hits **57.4%** against SESTINA's 54.7% (57.7 against 55.2 on the
replication): at the same points, Monet's picker chases *better* and chases *less*. The edge is in
R1, not R2.

**R3, the outcome — chasing first converts more for every policy but Monet's.** SESTINA's first
lead decision is a chase **98.3%** of the time (98.6; 98.3 in its mirror; v04 95.0, v06 99.1); it
converts the lead at **60.8%** when it chased first and 53.4% when it did not — a +7.4 that stands
on 1.7% of its races (SE 4.0) and is replicated at +8.6 (SE 3.7), +7.8 between SESTINAs, +7.1 for
v04 and +6.8 for v06. **Monet's first lead decision is a chase 49.5% of the time and converts at
47.9% when it chased first and 49.3% when it did not** (48.0 / 49.1 on the replication; −0.5
against v04, +0.3 against v06; −2.1 and −5.0 at home). Monet's races take 5.87 lead decisions and
1.60 chases to resolve, SESTINA's 3.38 and 2.07: SESTINA chases and is done; Monet chases once in
four decisions and wanders. The contrast for Monet is an observational one selected by its own
picker — it chases first exactly when the chase is its best ask by hit chance and goes elsewhere
when it is not, so the two populations differ in more than the choice — and it says nothing about
what a term would buy; it says only that Monet's *existing* chases-first are not its better races.
The take-back first recovers more than not for every trailer in every corpus (SESTINA +9.4 and
+9.4; Monet +5.2 and +5.5; between SESTINAs +6.8; +1.6 to +4.6 on the panel; +4.0 and −1.0 at
home), under P4's 10–25.

**R4, the mirrors.** At home the counterfactual reproduces the policy's class at every decision of
both sides — Δ_lead and Δ_trail identically 0.0, sure-miss shares 21.0 and 21.3, first-chase 56.5
and 63.1 (the seat asymmetry of `--home`'s seating). Between SESTINAs Δ_lead is +16.5 and Δ_trail
−8.5 at SESTINA's positions against v0.9's picker: the same shape as against Monet, smaller at the
trail. P5's second half was wrong: v04 and v06 chase MORE than the counterfactual at their
positions, not less, and v06 chases 16 points more than Monet does at its own.

**POST HOC — the joint of the two classes, added after the read** (`$SP/v20-patch-attribute-joint.cjs`;
`out-joint/`, `report-joint.mjs`, `report-joint.txt`; the pre-registered counters unchanged, the
checks re-verified EXACT on 61 of 61 and the home joint diagonal on both sides). The marginals above cannot say how much of SESTINA's chase
surplus stands against a certain hit elsewhere and how much against an uncertain ask elsewhere;
the 4 × 4 of (SESTINA's class, the counterfactual's class) at the same decision can. **At SESTINA's
lead decisions, of Δ_lead's 19.6 points, 6.8 are uncertain chases where the counterfactual takes
a certain hit elsewhere, 13.6 are uncertain chases where the counterfactual asks an uncertain ask
elsewhere, and 0.8 run the other way** (the replication: 6.6, 13.5, 0.9; between SESTINAs 2.2, 15.0,
0.7; v06 3.9, 14.9, 1.0; v04 0.2, 10.2, 3.1). **Two-thirds of the gap is in the population where no
certain hit is on the table** — the population §3.8h's closing credit was built for and competes
in, and where v0.9 ships no term at all; one-third is the uncertain chase over a certain hit, the
gated population §3.8i measured at −1.08 to −7.56 across its whole eligible dose range. At the
trail, of Δ_trail's −17.2, 14.4 points are SESTINA asking an uncertain ask elsewhere where the
counterfactual would take back, 5.9 where it would take a certain hit elsewhere (the replication
13.9 and 5.9; between SESTINAs 6.1 and 1.4; v06 12.6 and 4.1; v04 0.6 and 1.5). In games, the
ungated lead gap is 13.6% of SESTINA's 6.56 lead decisions a game — **0.89 decisions a game where
SESTINA chases and Monet's picker would ask an uncertain ask somewhere else.**

**The predictions, scored.** **P1** two of three: SESTINA's chase share 59.4 / 59.7 in 55–70 and
Δ_lead +19.6 / +19.2 in 8–20 (at its top); Monet's 34.7 / 34.8 under the predicted 40–55. **P2**
missed, sign and all: SESTINA takes 41.7% of its legal take-backs (predicted 60–80), Monet 80.1%
(predicted 45–65), Δ_trail −17.1 / −16.5 (predicted +5 to +15). **P3** missed on both counts:
Monet's chases hit 3.7 / 3.0 points MORE, and both sides carry 22–24% sure misses against the
predicted 2–6 and 0–2. **P4** half: chasing first converts +7 to +9 more for SESTINA, its mirror,
v04 and v06, and 0 to −5 for Monet at every table; the take-back first recovers more everywhere,
by +1.6 to +9.4 against the predicted 10–25. **P5** half: the home identity holds exactly (0.0,
not "within 3"); v04 and v06 chase more than the counterfactual, not less. **P6** held on every
cell.

**The rule, applied.** Δ_lead is +19.6 and +19.2 on the two twelves — above 5 on both — and in
the direction R3 says converts more for the policy whose choice it is: SESTINA converts 60.8%
when it chases first and 53.4% when it does not, replicated. **The pace at the lead is a choice
Monet's picker does not make.** Δ_trail is −17.1 and −16.5: SESTINA takes back LESS than the
counterfactual, and R3 says the take-back first recovers MORE for every trailer, so the trail gap
runs against the direction the rule requires and **no trail term is fitted**; Monet already takes
80% of its legal take-backs. The rule therefore calls **v0.20b: a race-pace term at the lead,
pre-registered on its own (§3.8r), fitted at home and read abroad on twelve fresh seeds, shipping
by §3.8n's bar.** What the joint fixes about that term is written into row 23: the population that
carries two-thirds of the gap is the ungated one, where §3.8h's credit already stands at the
four-of-six rung at a quarter of a hit's value and moved a tenth of the gap; the gated third is
§3.8i's and stays closed.

**What this rung does not say.** It does not say that chasing more will convert more for Monet:
Monet's own chases-first are not its better races, and the reason SESTINA's are — the pace
itself, or something the pace stands in for in SESTINA's play after the miss — is not on this
instrument. It does not say what the trailer's uncertain asks elsewhere buy SESTINA, and the
trailer's side is the other half of every conversion number: Monet's lead against SESTINA
converts at 49% where SESTINA's against Monet converts at 61% and either's at 56% against its own
kind (§3.8p), and what the trailer does is in each of those. It does not
price anything; §3.8p's bounds stand (+2.6 along the conversion, +2.8 the ceiling). Nothing ships.

### 3.8r Monet v0.20b — the race-pace term: the closing credit's four-of-six rung at its own dose

**Decision row 23, taken 2026-09-06 under the owner's direction of the same day — (a).** §3.8q read
the pace as a choice: at its lead decisions SESTINA asks into the race 59.4% of the time where v0.9's
picker at the same points would 39.9%, and two-thirds of that gap (13.6 of 19.6 points) stands where
no certain hit is on the table — the population §3.8h's closing credit was built for, where it
already prices the four-of-six ask at `closing · wHit · p · 0.5` and, at v0.12's dose of 0.5, moved a
tenth of the gap. The remaining third is the uncertain chase over a certain hit, §3.8i's population,
measured negative at every eligible dose and not reopened here. This rung fits the four rung's dose
on its own, at home, and reads the chosen dose abroad on twelve fresh seeds under §3.8n's rule. It
changes `lib/` — one knob, off by default — and may change the shipped vector if it clears the bar,
which is the owner's call at review.

#### Pre-registration — written 2026-09-06, before the knob exists and before any cell

**The term.** A Monet-only style knob **`closingFour`** (a number ≥ 0; absent on every roster style
and every tier). In `closingCredit` the dose of the credit is `closingFour` where the seat's certain
picture of the asked set has exactly **one** card outstanding after the hit (`lock` 0.5 — a
seat-known four of six under `us54`) and `closing` elsewhere (none outstanding — the five rung —
stays at `closing`'s dose). The credit is live when either knob is positive. Everything else is
§3.8h's, untouched: the count is the certain one (own cards and the cards the seat can certainly
place with a teammate); the credit pays nothing for a sure miss into the side's own majority, for a
resolved set, or at `p` 0; and it is **gated below every legal certain hit with no ungating
switch** — it competes only among uncertain asks when no certain hit is legal, and among certain
hits otherwise. **Byte identity:** `closingFour` absent, or 0, leaves every decision where it was
(`closing` absent → no credit; `closing` 0.5 → v0.12's credit exactly); `closingFour` without
`closing` pays the four rung only. Under `closingBelief` the rung is still named by the certain
picture and the lock factor is the belief one, as in §3.8h; no belief arm is run here (§3.8h: the
belief form lost on every seed). Tests pin identity, the bound (`closingFour · wHit · 0.5`), the rung
(fires only at a seat-known four; the five rung's credit is unchanged at any `closingFour`), the
gate at a hot dose, the validator, and absence from every roster style and tier.

**The arithmetic, so the doses mean something.** v0.9 scores an uncertain ask at about `wHit · p`
with `wHit` 70, so an ask at `p` 0.5 stands at 35 points. At the four rung `closingFour` 1 adds
`35 · p` (a 50% premium on the chase's own hit value), 2 adds `70 · p` (doubles it: a chase at `p`
0.35 now beats an ask elsewhere at `p` 0.65), 4 adds `140 · p` (a chase at `p` 0.25 beats
anything uncertain at `p` under 0.75), 8 adds `280 · p` (any chase beats any uncertain ask
elsewhere). The `leakEpsilon` window (0.5) is cleared by every dose at any `p` above 0.02.

**The fit, at home.** `scripts/duplicate-pairs.mjs --a v0.9 --a-override '{"closingFour":D}'
--b v0.9 --bank home-a --pairs 2400` for **D ∈ {1, 2, 4, 8}**, and the stack **`closing` 0.5 +
`closingFour` 2**; five arms, 4,800 games each, the paired set-difference with the cell's own SD
(§6.3). The markers, from `scripts/attribute.mjs --home 2400 --a v0.9 --a-knobs closingFour=D
--b v0.9 --cf v0.9 --race42` (a new `--a-knobs` / `--b-knobs` on the home mode, the same
`parseKnobs` as `--cf-knobs`): the counterfactual v0.9 at A's decisions no longer agrees at 100% —
the disagreements are exactly the decisions the credit moved — and the `--race42` table gives A's
chase share at lead decisions, first-chase share, chase hit rate and sure-miss share beside B's
(v0.9's own: 38–39%, 56–63%, 52–54%, 21%).

**Eligibility and the choice, fixed now.** An arm is *eligible* for the bridge if (i) its home paired
mean is not below −2 SE (no loss at 95% at home) and (ii) its chase share at lead decisions is at
least 5 points above v0.9's at home and its sure-miss share within 5 points of v0.9's — the term
must move R1 and not buy R2's sure misses (§3.8i's failure). **The primary arm** is the eligible
arm with the best home paired mean; a tie within one SE goes to the larger dose (SESTINA's gap is
20 points and the home trailer, taking 80% of its legal take-backs, punishes a lost turn harder than
SESTINA does). **The secondary arm** is the next larger eligible dose (or the stack, if the primary
is a plain dose and the stack is eligible), read on the same twelve seeds and reported beside the
primary; it cannot ship from this rung. If no arm is eligible the rung stops at home and row 24
says so; nothing goes abroad.

**The bridge read.** Twelve fresh seeds under the label `"monet-v0.20b-confirm-12"` by §6.5's rule
(`$SP/seeds-v20b.mjs`, spent set = v0.18's plus its twelve), written into this section before a cell
is played: **7906316 6521858 2233537 7628061 9720189 9747216 6988108 5749649 8961205 2810823 3499054 6256001**. The tree: the v0.20b commit's
`lib/` exported by `git archive` to `$SP/fishai-v20b` and mounted read-only, its commit and lib md5
recorded, the preamble refusing any other. The arms: the unchanged adapter (`bot.mjs` md5 c1fc7316…),
`MONET_ARM` v0.4c, `MONET_MUSTFIX` 1, `MONET_OVERRIDE` carrying `contest` 0.6 plus the arm's knobs;
the hello label the cell's expected substring. **Pins before a number is read:** the identity cell —
the base arm at 6269924 diffed against §3.8l's recorded cell, every engine line but `elapsed`,
IDENTICAL (the knob absent is byte identity, and the tree has moved); the in-engine pin of every arm
on one of its own cells — `--cf v0.9 --cf-knobs closingFour=D` at 100.0% of A's decisions; the
fourteen fault counters zero; **at most three containers at once** (§6.2's harvest race), and any
cell short of its 36 cover files replayed byte-identically before it is read. Cells: the base, the
primary and the secondary on the twelve — 36 cells of 1,200 games, about ninety minutes three wide.
The statistic: the paired win-rate difference against the base on the same seeds, the SD and SE
over the twelve, the seeds ahead. **The ship rule is §3.8n's:** the primary ships when its paired
mean is at least two standard errors above zero and it is ahead on a majority of the twelve; ±2.00
stays the definition of a rung and a term under it is marked as such. A ship changes the vector
Monet plays on `/play`, so the registry change (`v0.20b` beside `v0.9`, or `v0.9`'s vector moved) is
opened as its own PR and **waits for the owner's review** under the PR policy of 2026-09-05; this
rung's record, the knob and the instrument merge on self-verification as before.

**Readouts.** R1 the home fit table (five arms: paired mean, SD, SE, verdict; chase share and
first-chase share at lead decisions, chase hit rate, sure-miss share, the credit's firing share = the
counterfactual's disagreement rate at A's decisions); R2 the eligible set and the two arms named;
R3 the bridge table (base, primary, secondary: win rate by seed, the paired difference, SD, SE,
ahead/behind); R4 the markers abroad through `--race42` on the arm's records (A's chase share at
lead decisions, first-chase share, sure-miss share, lead conversion, races led a game, lead
decisions a race) beside the base's twelve; R5 the §6.2 checks (identity, pins, counters, cover
files, calibration).

**Predictions, written before the knob exists.**

- **Q1.** At home, `closingFour` 2 lifts A's chase share at lead decisions from v0.9's 38–39% to
  45–55% and the first-chase share from 56–63% to 70–85%; the counterfactual disagrees at 3–8% of
  A's ask decisions; the sure-miss share stays within 3 points of 21%; the chase hit rate falls by
  0–4 points. The credit fires at a MINORITY of lead decisions — the seat-known four is rarer than
  the true four — so the chase share does not reach SESTINA's 59% at any dose.
- **Q2.** Home pairs: `closingFour` 1 and 2 inside their intervals (within ±0.4 points of win rate
  of zero); 4 negative; 8 negative by more than a point; the stack within 0.3 points of
  `closingFour` 2 alone.
- **Q3.** Eligibility: doses 1, 2 and the stack eligible; 4 doubtful; 8 not. The primary is
  `closingFour` 2 or the stack.
- **Q4.** Abroad, the primary: +0.3 to +1.2 points paired against the base (SD 1.0–1.8), ahead on
  7–9 of 12; the bar (about 0.6–1.0 at two SE) cleared with odds of about one in three. Its markers:
  Monet's chase share at lead decisions against SESTINA up 5–12 points from 34.7%, the first-chase
  share up 10–20 from 49.5%, the lead conversion up 1–4 from 48.6%, the sure-miss share within 3
  of 23.9%.
- **Q5.** The identity cell IDENTICAL; every pin 100.0%; the fourteen counters zero on every
  process file; every cell's 36 cover files present at three containers; calibration within
  §3.4a's bars on every arm.

**Cost** M — the knob and its tests an hour; the home fit under an hour; the bridge about two hours
with its pins and reports. **Scratch, not committed:** `$SP/monet-v20b/` (DOSES.json, the arm
builder, `export-v20b.sh`, `common.sh`, `step0.sh`, `step-conf.sh`, `run-lanes.sh`, `pin-arm.sh`,
`report-v20b.mjs`, `home/`, `records/`, `out/`), `$SP/seeds-v20b.mjs`, `$SP/v20b-{prereg,record}.md`.

#### Record — 2026-09-06 (the knob, the home fit and the identity cell the same day; no bridge read)

**What was built.** `closingFour` (closing.ts, style.ts; `tests/bots/closing-four.test.ts`, six cases
pinning identity, the rung and the exact credit, the gate at a hot dose beside the priced switch,
liveness, the validator, absence from every roster style and tier) and `--a-knobs` / `--b-knobs` on
`attribute.mjs`'s home mode. Typecheck, lint (0 warnings), 68 files / 1,084 tests green. The tree
exported (`72b8362`, lib md5 `8249ddc7…`), the base arm built on the unchanged adapter (`c1fc7316…`),
and **the identity cell played: the base at 6269924 IDENTICAL to §3.8l's recorded cell, every
engine line but `elapsed`** (40.75%, 36 cover files, 0 FATAL, the fourteen counters zero).

**R1 — the home fit** (`scripts/duplicate-pairs.mjs`, 2,400 pairs on `home-a` an arm, 4,800 games,
the cell's own SD; points of win rate by §0.1's conversion of the per-game difference):

| arm | dose | paired set-diff a pair ± 1.96 SE (SD) | in points of win rate ± SE | verdict at 95% |
|---|---|---|---|---|
| f1 | `closingFour` 1 | +0.150 ± 0.110 (2.75) | +1.12 ± 0.42 | AHEAD, 2.7 × SE |
| f2 | `closingFour` 2 | +0.172 ± 0.119 (2.98) | +1.29 ± 0.45 | AHEAD, 2.8 × SE |
| f4 | `closingFour` 4 | +0.075 ± 0.124 (3.11) | +0.56 ± 0.47 | inside |
| f8 | `closingFour` 8 | −0.101 ± 0.131 (3.27) | −0.75 ± 0.50 | inside |
| **fs** | **`closing` 0.5 + `closingFour` 2** | **+0.301 ± 0.119 (2.98)** | **+2.25 ± 0.46** | **AHEAD, 4.9 × SE** |

The dose ladder has a shape — up to 2, down past 4, negative at 8 — and the stack is worth more than
its parts at home: `closing` 0.5 alone read +0.043 ± 0.194 on 600 pairs in §3.8h (+0.3 points,
unresolved), `closingFour` 2 alone +1.3 here, the two together +2.3 with the SE at 0.46. **This is
the first home cell on the ladder to clear two standard errors.**

**R1 — the markers at home** (`attribute.mjs --home 2400 --a v0.9 --a-knobs … --b v0.9 --cf v0.9
--race42`; A is the arm, B is v0.9; v0.9's own mirror in §3.8q reads 38.3 / 39.0% chase share,
56.5 / 63.1% first-chase by seat, 54.0 / 52.5% chase hit, 21.0 / 21.3% sure misses):

| arm | the counterfactual v0.9 agrees at A's asks (the credit moved the rest) | chase share at lead decisions A / B | first-chase share A / B | chase hit rate A / B | sure-miss share A / B | lead conversion A / B | lead decisions a game A / B |
|---|---|---|---|---|---|---|---|
| f1 | 97.42% | 39.1 / 38.6 | 57.4 / 61.2 | 53.4 / 52.4 | 21.2 / 21.6 | 53.5 / 53.4 | 9.42 / 9.63 |
| f2 | 96.20% | 40.9 / 37.8 | 57.9 / 59.4 | 54.2 / 51.9 | 19.7 / 21.4 | 54.3 / 50.7 | 9.05 / 9.87 |
| f4 | 94.97% | 41.0 / 39.1 | 58.1 / 59.6 | 54.5 / 51.2 | 20.1 / 23.1 | 55.0 / 52.7 | 8.94 / 9.71 |
| f8 | 94.06% | 40.4 / 38.3 | 58.2 / 58.6 | 54.5 / 51.9 | 20.1 / 22.3 | 53.4 / 53.8 | 9.08 / 10.04 |
| fs | 96.06% | 40.5 / 39.3 | 56.8 / 59.2 | 54.9 / 51.1 | 19.4 / 22.6 | 55.2 / 49.8 | 9.22 / 9.57 |

The credit moves 2.6% of the arm's ask decisions at dose 1, 3.8% at 2, 5.0% at 4, 5.9% at 8. The
chase share at lead decisions rises by **0.5 / 3.1 / 1.9 / 2.1 / 1.2 points** — never the five the
rule asked for. The chases it buys hit MORE, not less (54–55% against 51–52%), and the sure-miss
share is unmoved or lower (19–21% against 21–23%): the credit fires only where the seat can place
four of the set on its side and never for a card a teammate certainly holds, which is the
population §3.8i's gated credit could not confine itself to. The arm takes fewer lead decisions a
game (9.05 against 9.87 at dose 2: its leads resolve in fewer asks), and at the two stronger arms
the OPPONENT's leads convert less (50.7 and 49.8 against 53–54 in the mirror) — a 2,400-game
reading with an SE near 1.5 points, noted and not built on.

**R2 — eligibility, the rule applied.** Every arm passes (i) (no home loss; four of five are ahead)
and (iii) (sure misses within 5 points), and **every arm fails (ii)**: the chase share at lead
decisions moved 0.5–3.1 points against the pre-registered 5. **By §3.8r's rule no arm is eligible
and the rung stops at home; nothing goes abroad from it.** The twelve fresh seeds drawn for it are
unspent.

**POST HOC — why the share cannot move five points: the four rung's reach**
(`$SP/v20b-patch-attribute-known4.cjs`; `$SP/monet-v20b/known4/`, `report-known4.mjs`): at every lead
decision, the number of the lead set's cards the deciding seat can CERTAINLY place on its own side
(its own hand and `holderOf` through v0.9's knowledge) — the credit fires only at four — and at
four whether a certain hit was on the table by the public record (the ungated reach). On v0.18's
twelve against SESTINA: **Monet's seat can place four at 12.1% of its lead sets, SESTINA's at
24.8% of its**; two of every three of those fours have no certain hit beside them; **the credit's
ungated reach is 10.7% of Monet's lead decisions** (15,146 of 141,842) and would be 15.8% of
SESTINA's. At home (the v0.9 mirror, 2,400 games) the reach is 17.3 / 17.6%. The counts by
seat-known holding, Monet against SESTINA: 0 / 1 / 2 / 3 / 4 at 0.0 / 13.5 / 47.7 / 26.6 / 12.1%
of Monet's lead sets and 0.0 / 8.3 / 34.4 / 32.5 / 24.8% of SESTINA's — the true four is, to
Monet's seat, usually a known two or three: the teammate's cards it cannot place. So a credit at a
seat-known four can lift the chase share by ten points at the very most, and lifts it by one to
three; the rule's five was written on Q1's guess of a 45–55% chase share, which this population
cannot deliver at any dose. The rule stands as written and the guess is scored wrong below.

**Predictions, scored.** **Q1** one of four: the counterfactual disagrees at 3.8% of A's decisions
at dose 2 (predicted 3–8) and the sure-miss share holds (19.7 against 21.4); the chase share reaches
40.9%, not 45–55; the chase hit rate RISES 2.3 points (predicted a fall of 0–4); the "minority"
clause held, and by more than written. **Q2** one of four: dose 8 is negative (−0.75, predicted
under −1.0 — near); doses 1 and 2 are not inside ±0.4 but ahead by 1.1–1.3 at 2.7–2.8 SE; dose 4
is not negative (+0.56); the stack is not within 0.3 of dose 2 but a point above it. **Q3**
missed: no arm eligible — for the reason above, not for want of a gain. **Q4, Q5** not reached
(the identity cell, the one pin played, IDENTICAL).

**What this rung says.** The four rung's dose is worth 1–2 points of win rate at home against v0.9
on 4,800-game cells, at two to five standard errors, without buying sure misses or worse chases —
and it moves the race-pace choice by a tenth of SESTINA's gap, because the seat can seldom place
its side's four. Whether that home gain survives the translated bridge is exactly the question
the rule refused to ask on a marker that the population cannot meet; **row 24 re-registers the
bridge read, with the bar corrected and stated, as v0.20c (§3.8s), on the same unspent twelve,
before any cell.** Nothing ships; v0.9 stays the shipped vector.

### 3.8s Monet v0.20c — the bridge read of v0.20b's arms, re-registered with the bar corrected

**Decision row 24, taken 2026-09-06 under the owner's direction of the same day — (a).** §3.8r's
home fit read the four rung's dose at +1.1 to +2.3 points of win rate against v0.9 at two to five
standard errors, buying chases that hit more and no more sure misses, and then refused every arm
the bridge on its marker bar: the chase share at lead decisions moved one to three points against a
required five. The post-hoc reach count says why — the seat can place four of the lead set on its
side at 12% of Monet's lead sets, so the credit reaches 10.7% of Monet's lead decisions and no
dose can move the share five points — and that the bar was written on a wrong prediction (Q1),
not on a measured population. **This rung re-registers the bridge read with that bar dropped and
the reason stated, before any cell, on the twelve fresh seeds drawn for §3.8r and still unread.**
What is NOT changed: the knob, the tree, the arms' construction, the twelve seeds, the pins, the
statistic, the ship rule. What the winner's-curse guards require and still get: the arms are chosen
at home on 4,800-game pairs, the confirmation seeds are fresh and unread, and the secondary cannot
ship from this rung.

#### Pre-registration — written 2026-09-06, before any cell of the read

**The arms**, by the home pairs alone (§3.8r R1), both with the sure-miss share within five points
of v0.9's and the credit moving under 4% of ask decisions: **the primary, `fs` = `closing` 0.5 +
`closingFour` 2** (+0.301 a pair, 4.9 × SE at home); **the secondary, `f2` = `closingFour` 2**
(+0.172, 2.8 × SE). Both on v0.9's vector (`contest` 0.6), MUSTFIX, the unchanged adapter
(`c1fc7316…`), the v0.20b tree export (`72b8362`, lib md5 `8249ddc7…`), `MONET_OVERRIDE` carrying
the knobs; the hello label the cell's expected substring.

**The cells.** The base, `fs` and `f2` on **7906316 6521858 2233537 7628061 9720189 9747216 6988108
5749649 8961205 2810823 3499054 6256001** against SESTINA, 1,200 games a cell, 36 cells, **three
containers at once and never four**; any cell short of its 36 cover files replayed byte-identically
before it is read. **Pins before a number is read:** the identity cell, already played and
IDENTICAL (§3.8r); the in-engine pin of EVERY cell of every arm — the walk with `--cf v0.9
--cf-knobs <the arm's knobs>` agreeing at 100.0% of A's decisions on all twelve, not one; the
fourteen fault counters zero on every process file; calibration within §3.4a's bars.

**The statistic and the rule.** Per arm, the paired win-rate difference against the base on the
same seeds, the SD and SE over the twelve, the seeds ahead; sets a game beside it. **The primary
ships by §3.8n's rule** — the paired mean at least two standard errors above zero and ahead on a
majority of the twelve; ±2.00 stays the definition of a rung and a term under it is marked as such.
**The secondary is reported beside it and cannot ship from this rung**: if the primary fails the
bar and the secondary clears it, the secondary is read on a further fresh twelve as its own rung
before anything is said about it. A ship changes the vector Monet plays, so the registry change
(`v0.20c` beside `v0.9`, or `v0.9`'s vector moved) is opened as its own PR and **waits for the
owner's review**; this record, the knob and the instrument merge on self-verification.

**Readouts.** R3 the bridge table per arm (win rate by seed, the paired difference, SD, SE,
ahead/behind, sets a game); R4 the markers abroad through `--race42` on every cell of every arm
beside the base's twelve (chase share at lead decisions, first-chase share, chase hit rate,
sure-miss share, the lead converted, races led a game, lead decisions a race, take-backs among
legal; ask accuracy; the engine's declaration and forced-declare lines); R5 the §6.2 checks.

**Predictions, written before the cells.**

- **Q1.** The primary `fs` reads **+0.5 to +1.5 points paired** against the base (SD 1.2–2.0, SE
  0.35–0.6), ahead on 7–9 of 12; the bar (two SE, about 0.7–1.2) is cleared with odds of about
  two in five. The secondary `f2` reads +0.2 to +1.0, ahead on 6–8; the two arms differ by under
  one SE of each other (the five rung's abroad value is §3.8h's +0.4, not the home's +1.0).
- **Q2.** The markers abroad: Monet's chase share at lead decisions up 1–4 points from the base's
  34.7%, the first-chase share up 0–5 from 49.5%, the sure-miss share within 3 of 23.9%, the chase
  hit rate not lower; the lead converted up 0–3 from 48.6%; lead decisions a race down 0.2–0.6 from
  5.87; ask accuracy within 0.5 of the base's; SESTINA's numbers unmoved within noise.
- **Q3.** Every cell pinned at 100.0%; the fourteen counters zero; every cell's 36 cover files
  present at three containers; calibration within the bars on every arm.

**Cost** M — 36 cells, about ninety minutes three wide, the walks ten minutes. **Scratch, not
committed:** `$SP/monet-v20b/` (`DOSES.json` with the two arms, `run-lanes.sh`, `run-race42-v20b.sh`,
`report-v20b.mjs`, `report-race42-v20b.mjs`, `records/`, `out/`), `$SP/v20c-{prereg,record}.md`.

#### Record — 2026-09-07 (the cells played 2026-09-06 23:48Z to 00:06Z, read the same night)

**The runs.** The base, `fs` (`closing` 0.5 + `closingFour` 2) and `f2` (`closingFour` 2) on the
twelve fresh seeds against SESTINA v1.0, 1,200 games a cell, three containers at once, eighteen
minutes; every cell recorded. **The checks, all clean before any number was read:** the identity
cell IDENTICAL (§3.8r); **every cell of every arm pinned in-engine at 100.0% of A's decisions** by
the walk with `--cf v0.9 --cf-knobs <the arm's knobs>` (36 of 36; the races reconciled EXACT on 36
of 36); the fourteen fault counters zero on every process file of every cell; 0 FATAL lines; the
cover files complete on 35 of 36 cells as harvested and on 36 of 36 after one byte-identical replay
(`f2` at 2233537: 35 files; replayed alone under its own tag, IDENTICAL on every engine line but
`elapsed`, 36 files, none empty — the original's number stands). Calibration (§3.4a's bars, the
aggregate |bias| under 0.01 and the worst decile under 0.10) is met on the aggregate on 34 of 36
cells (0.0100 and 0.0104 on one cell each of `fs` and `f2`) and on the worst decile on 25 of 36
(0.1004–0.1332 on 2 base, 5 `fs`, 4 `f2` cells) — the same hundredth-over §3.8o reported on the
base, reported and not disqualifying. Scratch: `$SP/monet-v20b/{run-lanes.sh, step-rerun.sh,
run-race42-v20b.sh, report-v20b.mjs, report-race42-v20b.mjs, records/, out/, out-plaincf/}`.

**R3 — the bridge table.** The base 40.31% (SD 1.48) on the twelve.

| seed | base | **fs** (`closing` 0.5 + `closingFour` 2) | fs − base | f2 (`closingFour` 2) | f2 − base |
|---|---|---|---|---|---|
| 7906316 | 39.33 | 40.42 | +1.08 | 40.42 | +1.08 |
| 6521858 | 40.33 | 38.58 | −1.75 | 38.00 | −2.33 |
| 2233537 | 39.50 | 41.50 | +2.00 | 40.75 | +1.25 |
| 7628061 | 41.42 | 43.42 | +2.00 | 43.00 | +1.58 |
| 9720189 | 42.08 | 43.67 | +1.58 | 42.42 | +0.33 |
| 9747216 | 38.25 | 38.75 | +0.50 | 38.58 | +0.33 |
| 6988108 | 39.67 | 42.58 | +2.92 | 41.58 | +1.92 |
| 5749649 | 38.50 | 41.42 | +2.92 | 40.83 | +2.33 |
| 8961205 | 40.42 | 40.42 | +0.00 | 39.83 | −0.58 |
| 2810823 | 43.50 | 42.50 | −1.00 | 42.08 | −1.42 |
| 3499054 | 40.17 | 41.50 | +1.33 | 41.00 | +0.83 |
| 6256001 | 40.58 | 40.25 | −0.33 | 39.33 | −1.25 |
| **pooled** | **40.31** | **41.25** | **+0.94 (SD 1.49, SE 0.43, 2.18 × SE; ahead 8, tie 1, behind 3)** | 40.65 | +0.34 (SD 1.45, SE 0.42, 0.81 × SE; ahead 8, behind 4) |

**The primary clears §3.8n's rule: +0.94 paired, 2.18 standard errors above zero, ahead on eight of
the twelve with one tie.** It does not clear the ±2.00 floor and is marked as a term under it. The
secondary reads +0.34 at 0.81 × SE, ahead on eight of twelve — a gain in the same direction that
does not clear, and by the rule it cannot ship from this rung. The two arms differ by +0.60 on the
same seeds — and, paired on the seed, that difference is almost constant: SD 0.35, SE 0.10, 6 × SE,
`fs` ahead of `f2` on eleven seeds and tied on one. The five rung's `closing` 0.5, read alone at
+0.58 (§3.8h) and +0.25 (§3.8o), is worth about that much again beside the four rung — a third
read of the same term, consistent with the two before it — while moving only 0.08% more of Monet's
asks (below).

**The engine's markers** (means over the twelve, arm against base): sets a game 4.192 − 4.808
against 4.169 − 4.831 (the margin +0.046 sets a game, +0.7 points by §0.1's conversion, inside the
win-rate read's interval); ask accuracy 54.78% against 55.14%, SESTINA's 56.82% against 57.22% —
both sides' asks hit 0.4 points less, as under §3.8e's exposure charge; declarations 4.055 a game
at 99.69% against 4.034 at 99.72%; forced declares 0.093 a game right 52.75% against 0.103 at
53.24%; **lock hold 6.86 / 4.60 against 7.06 / 4.73** (Monet cashes its locks 0.2 events sooner —
§3.8h's marker, moved again); events a game 101.2 against 101.6.

**R4 — the markers abroad** (`--race42` on every cell, the counterfactual carrying the arm's
knobs; A is Monet, B SESTINA; means over the twelve, SE ≤ 0.5 unless given):

| readout | base | fs | f2 |
|---|---|---|---|
| the credit moved (the plain v0.9 counterfactual's disagreement at A's asks) | — | **3.02%** (SE 0.03) | 2.94% |
| Monet's chase share at lead decisions | 34.8% | 35.3% | 35.4% |
| Monet's first lead decision a chase | 50.0% | 51.6% | 51.6% |
| Monet's chase hit rate; sure-miss share | 52.8; 24.1 | 52.9; 23.7 | 53.0; 23.6 |
| Monet's lead converted | 48.7% | 49.1% | 48.7% |
| Monet's lead decisions a game; a race; chases a race | 10.08; 5.82; 1.61 | 9.71; 5.74; 1.59 | 9.70; 5.74; 1.59 |
| Monet's races led a game | 1.68 | 1.64 | 1.64 |
| Monet among legal take-backs | 80.6% | 80.4% | 80.4% |
| SESTINA's chase share; first-chase; lead converted | 59.4; 98.4; 61.4 | 60.1; 98.3; 60.3 | 60.1; 98.4; 60.4 |
| ask accuracy Monet / SESTINA | 54.3 / 55.9 | 53.9 / 55.4 | 53.9 / 55.5 |

The credit moves three asks in a hundred abroad (3.8% at home), and the race-pace markers move by
their smallest units: the chase share at lead decisions +0.5, the first-chase share +1.6, the lead
converted +0.4, lead decisions a game −0.4; sure misses down 0.4; SESTINA's lead conversion −1.1
and its ask accuracy −0.5. **The win rate moved a point on decisions that the race instrument
barely sees**, which is what §3.8r's reach count predicts: the credit fires at a seat-known four,
a tenth of Monet's lead decisions, and a chase there is one ask in a race of six. Where the point
comes from is not in R4's rows; the engine's lines say the margin moved 0.046 sets a game and the
locks cashed 0.2 events sooner, and no other marker moved by more than its noise.

**Predictions, scored.** **Q1** six of seven: `fs` +0.94 in +0.5 to +1.5, SD 1.49 in 1.2–2.0,
ahead on 8 in 7–9, the bar cleared (the odds were put at two in five); `f2` +0.34 in +0.2 to
+1.0, ahead on 8 in 6–8; the two arms differ by +0.60, more than one SE (0.43), not less. **Q2**
half: the sure-miss share within 3 (−0.4), the chase hit rate not lower (+0.1), the lead converted
in 0–3 (+0.4), ask accuracy within 0.5 (−0.4), the first-chase share in 0–5 (+1.6); the chase share
+0.5 against the predicted +1 to +4, lead decisions a race −0.08 against −0.2 to −0.6, and
SESTINA's lead conversion moved −1.1 (within about twice its noise). **Q3** held on the pins, the
counters and the cover files (after the one replay); calibration over its bars by a hundredth on a
third of the cells, as on the base.

**The rule, applied.** The primary, **`closing` 0.5 + `closingFour` 2 on v0.9's vector, ships under
§3.8n's rule** — the first term on the ladder to do so — and under the ±2.00 floor, marked as such.
The vector Monet plays on `/play` therefore changes, and by the PR policy of 2026-09-05 the
registry change is not this record's to merge: **the registry PR is opened beside this one and
waits for the owner** (`v0.20c` as a registry version beside `v0.9`, `MONET_VERSION_IDS` extended so
`/play` offers it, the `models.ts` note re-measured; nothing else). This record, the knob and the
instrument merge on self-verification. The secondary does not ship; a fresh twelve on
`closingFour` 2 alone is not recommended — its reading is inside the primary's, and the five rung
now has three reads in the same direction.

**What this rung does not say.** It does not say the four rung's dose has reached the race:
Monet's chase share at lead decisions is 35.3% against SESTINA's 60.1%, the first-chase share
51.6% against 98.3%, the lead converted 49.1% against 60.3%; the +0.94 is a tenth of the even
bucket's 2.8 points and a twentieth of the 9-point wall. It does not say why the stack is worth
more than its parts abroad on the same seeds (6 × SE on the paired difference) — a reading, not a
mechanism. It does not move the §3.9 verdict: Monet v1.0 does not exist at 41.25% either. The next
rung is row 25's.

### 3.8t Monet v0.21 — the rules-certain count: the four rung's reach with teammate licences and side-certain cards counted

**Decision row 25, taken 2026-09-07 under the owner's direction of 2026-09-06 — (a), its records
read.** §3.8s shipped the four rung at three asks in a hundred, and §3.8r's count says why so few:
the credit fires only where the seat can CERTAINLY place four of the set on its side, which at
Monet's lead decisions against SESTINA is true of 12.1% of the lead sets (§3.8r's twelve; 24.8% at
SESTINA's), because a teammate's cards are usually unplaced in the public record. The count the
credit uses is `holderOf` — a card is on the side only if one seat of the side is its certain
holder. Two rules facts place cards on the side without naming the holder, and neither is a
belief: **a live licence** (RULES_US54.md row 6: a seat that asked into a set held a card of it at
that moment, and cards leave a hand only by a public hit), and **a side-certain card** (a card
whose every remaining candidate holder — `knowledge.ts`'s `cands`, the seats not yet proved not to
hold it — is on the side). This rung measures how much of the four rung's reach the two facts
recover, on the records, with no bridge cell and no change under `lib/`. The knob, if the read
warrants one, is v0.21b's and is pre-registered then.

#### Pre-registration — written 2026-09-07, before the instrument exists and before any walk

**The count.** At a decision by seat `s` on side `T` with knowledge `k` (the seat's own build, as
§3.8r's count used), for a set `b`:

- **certain** — the cards of `b` whose certain holder is on `T` (`holderOf`; the seat's own hand
  included). §3.8r's number.
- **+ licences** — plus one for every teammate `t ≠ s` on `T` that has **no** member of `b`
  placed at it (a placed member already discharges the licence) and whose licence in `b` is live
  **by the rules**: `t` asked into `b` at some event `j`, and no later event before the decision is
  a hit taken from `t` in `b` (the only way a card leaves a hand while the set is unresolved). Not
  the shipped lookup: `seatLicences` (`threat.ts`) retires a licence only when every member is
  certainly located elsewhere, which keeps a shed basis alive; the shipped lookup is reported
  beside the rules one as a fifth variant, not used by the rule.
- **+ side-certain** — plus one for every card of `b` with no certain holder whose candidate set
  is non-empty and entirely on `T`.
- **+ both** — the certain count plus the larger of the two additions: a side-certain card may be
  a licensed teammate's card, so the two are not summed. A lower bound on the side's holding, and
  the count a knob would use.

**Every claim is checked against the live hands while the walk has them:** a teammate counted
licensed must hold a card of the set, and a side-certain card must sit on the side, at that
decision; one violation aborts the cell. The count is rules-certain or the instrument is wrong,
and the walk says which.

**The instrument.** `scripts/attribute.mjs --licences` (implies `--race42`; needs `--cf`): at
every lead decision (§3.8q's class: the deciding side holds four of an unresolved 3–3 set) it
records, per lead set, the joint of the certain count with each variant's count, and at four by
each variant whether a certain hit was on the table (the counterfactual's pick certain by the
public record, as §3.8r); and at every ask actually taken, the asked set's cards outstanding after
the hit by each variant (0, 1, 2 or more — the five rung, the four rung, none). Pooled over cells
by counts, so pooling is exact. Text output: one line a side; the JSON carries the counters.

**The readouts.**

- **R1 — the reach at lead sets, per side and corpus:** the share of lead sets at a count of four
  by certainty, with licences, with side-certain cards, with both, and by the shipped lookup; the
  joint (which certain counts the additions lift to four); and the ungated reach — four and no
  certain hit on the table — per lead decision, the population the credit acts in.
- **R2 — the credit's population at the asks taken:** the share of each side's asks whose asked
  set would stand at one or no card outstanding after the hit, by each variant.
- **R3 — the shipped lookup against the rules:** the licensed count by `seatLicences` beside the
  rules-live one, so a knob knows which lookup to read.

**The corpora.** (i) `fs` — the shipped vector's own records, §3.8s's twelve cells of `closing`
0.5 + `closingFour` 2 against SESTINA (14,400 games), walked with `--cf v0.9 --cf-knobs
closing=0.5,closingFour=2` (the pin holds at 100.0% on every cell, §3.8s) — **the operative
corpus: the knob would sit on v0.20c's vector**; (ii) `base` — §3.8s's twelve base cells (v0.9 on
the same seeds); (iii) `v18base` — §3.8r's twelve, the corpus its 12.1% was read on, a replication
of the count; (iv) the home mirror — v0.9 against v0.9, 2,400 games under `--validate`. Forty-eight
record walks and one home run, six wide.

**Predictions, written before the walk.**

- **Q1** On `fs` at Monet's lead sets the certain reach at four is 11–14% (§3.8r's 12.1% on
  another corpus and vector); **with licences it is 18–28%** — by half again or more; side-certain
  cards add fewer than 5 points on their own; the combined count is under 30%. The ungated reach
  per lead decision grows in the same proportion (10.7% → 16–24%).
- **Q2** At SESTINA's lead sets the certain reach is 23–27% and with licences 32–40%: SESTINA asks
  into its majorities at 59% of its lead decisions, so its seats are licensed in them more often.
- **Q3** R2: the share of Monet's asks whose asked set stands at one or no card outstanding after
  the hit grows by at least a third with licences counted.
- **Q4** The shipped lookup counts more licensed teammates than the rules do, by less than a fifth
  relative; the base corpora agree with §3.8r's 12.1% within 2 points on `v18base`.
- **Q5** No assertion fires on any cell: the count is sound on every decision of 43,200 games and
  the home mirror.

**The rule, fixed now.** If on `fs` the rules-certain reach at four with licences counted is at
least **one and a half times** the certain reach (the ratio pooled over the twelve cells, at
Monet's lead sets), row 26 takes **v0.21b**: a Monet-only knob that makes `closingPicture` count
by the rules (the licences and the side-certain cards, the *both* variant), pre-registered with a
home read at the shipped doses (`closing` 0.5, `closingFour` 2 — no dose re-fit: the rung changes
the count, not the appetite) and a fresh twelve abroad under §3.8n. If the ratio is under one and
a half, the rung stops here, no knob is built, and row 26 goes to row 25's (b). If an assertion
fires, the instrument is wrong and the read is void until it is fixed and re-run.

**What ships.** Nothing under `lib/`. The instrument on `scripts/attribute.mjs`, this section, the
ladder row and row 26. **Cost** S — a day: the instrument, forty-eight walks and a home run
(about twenty minutes six wide), the record. **Scratch, not committed:** `$SP/monet-v21/`
(`run-lic.sh`, `out/`, `report-lic.mjs`, `report-lic.txt`), `$SP/v21-{prereg,record}.md`.

#### Record — 2026-09-07 (the walks 00:46Z to 01:02Z, read at once)

**The runs.** Thirty-six record walks — §3.8s's twelve cells of the shipped vector (`fs`, walked with
`--cf v0.9 --cf-knobs closing=0.5,closingFour=2`), its twelve base cells and §3.8r's twelve (`--cf
v0.9`) — five wide in under three minutes, and the home mirror, 2,400 games of v0.9 against v0.9
under `--validate`, in five and a half. A second pass with R2's buckets split (0 / 1 / 2 / 3 or
more) reproduced every R1 counter and R2's merged buckets on all 74 side-cells; the numbers below
are the second pass. **The checks:** no assertion fired on any decision of the 43,200 games or the
mirror — every teammate counted licensed held a card of the set and every side-certain card sat on
the side, at every decision; the counterfactual pinned at 100.0% of A's decisions on 37 of 37
walks; the races reconciled EXACT on 37 of 37; §3.8r's count replicated to the tenth (12.1% /
24.8% on its twelve). Scratch: `$SP/monet-v21/{run-lic3.sh, out/, out-v1/, report-lic.mjs,
report-lic.txt}`, `$SP/v21-patch-attribute-lic*.cjs`.

**R1 — the reach at lead sets** (the share of lead sets at a count of four; Monet is A).

| corpus, side | lead decisions; lead sets | certain | + licences (rules) | + side-certain | + both | + shipped lookup (over four) | ungated reach per lead decision: certain → licences |
|---|---|---|---|---|---|---|---|
| **`fs`, A** | 139,864; 159,609 | **11.5%** | **15.1% (× 1.32)** | 11.6% (× 1.01) | 15.3% (× 1.33) | 14.6% (5.1% over) | **10.0% → 13.7% (× 1.37)** |
| `fs`, B (SESTINA) | 95,136; 100,676 | 24.3% | 27.7% (× 1.14) | 24.3% | 27.7% (× 1.14) | 25.9% (9.6% over) | 15.7% → 18.4% (× 1.17) |
| `base`, A | 145,131; 165,932 | 12.5% | 16.3% (× 1.31) | 12.6% | 16.4% (× 1.32) | 15.3% (5.5% over) | 10.9% → 14.8% (× 1.36) |
| `base`, B | 96,157; 101,840 | 25.1% | 28.3% (× 1.13) | 25.1% | 28.3% (× 1.13) | 26.2% (10.1% over) | 15.9% → 18.4% (× 1.16) |
| `v18base`, A | 141,842; 162,970 | 12.1% | 15.8% (× 1.30) | 12.2% | 15.9% (× 1.31) | 14.9% (5.5% over) | 10.7% → 14.4% (× 1.35) |
| `v18base`, B | 94,401; 99,983 | 24.8% | 28.1% (× 1.13) | 24.9% | 28.1% (× 1.13) | 26.2% (9.9% over) | 15.8% → 18.4% (× 1.16) |
| home, A | 24,171; 27,665 | 20.5% | 23.0% (× 1.12) | 20.5% | 23.0% (× 1.12) | 21.6% (10.7% over) | 17.3% → 19.8% (× 1.14) |
| home, B | 23,369; 26,482 | 21.6% | 23.7% (× 1.10) | 21.6% | 23.7% | 23.9% (10.2% over) | 18.0% → 20.0% (× 1.11) |

**The lift, on `fs` at Monet's lead sets:** the certain count is 0 / 1 / 2 / 3 / 4 at 0.0 / 13.3 /
48.8 / 26.4 / 11.5% of the lead sets; the licence carries **5,429 sets from a certain three and
404 from a certain two** to four — 3.7% of the lead sets, **12.9% of the seat-known-three sets**
and 0.5% of the seat-known-two — and nothing from lower. Side-certain cards carry 185 (0.1%). The
shipped lookup (`seatLicences`, the concession terms' source) would carry 8.2% of the lead sets to
four — 30.0% of the seat-known-three sets — but **puts the side over its own holding of four at
5.1% of the lead sets** abroad and 10.7% at home: it keeps a shed basis alive until every member
of the set is located elsewhere, which is sound for acting on an opponent's proven reach and
unsound as a count of one's own side. The rules-live licence, checked against the hands at every
decision, over-counted nowhere.

**R2 — the credit's population at the asks taken** (`fs`, Monet's 597,744 asks; the asked set's
cards outstanding after the hit):

| count | 0 (the five rung) | 1 (the four rung) | 2 (a three rung, not built) | 3 or more | at 0 or 1 |
|---|---|---|---|---|---|
| certain | 7.2% | 13.0% | **18.2%** | 61.6% | **20.2%** |
| + licences (rules) | 8.3% | 13.8% | 19.2% | 58.6% | **22.1%** |
| + both | 8.6% | 13.8% | 19.4% | 58.2% | 22.4% |

The credit's population grows by 1.9 points of Monet's asks (a tenth, relative); the base and
§3.8r's corpora read 18.3% → 20.4%, home 21.4% → 23.4%; SESTINA's asks on `fs` 22.5% → 25.5%. The
asks whose set would stand at exactly two outstanding after the hit — the ask that makes a
seat-known four, the rung below the four, which no knob prices — are **18.2%** of Monet's asks,
more than the four and five rungs together.

**Predictions, scored.** **Q1** three of five: the certain reach 11.5% (in 11–14); side-certain
cards 0.1 points (under 5); the combined count 15.3% (under 30); **the licensed reach 15.1%
against a predicted 18–28%**, and the ungated reach 13.7% against 16–24% (its proportion, × 1.37,
as predicted). **Q2** half: SESTINA's certain reach 24.3% (in 23–27); with licences 27.7% against
32–40%. **Q3** missed: the credit's population grew by a tenth, not a third. **Q4** half: the base
corpora replicate §3.8r's 12.1% within 2 points (12.5%, 12.1%); the shipped lookup counts far more
than a fifth beyond the rules — it lifts 8.2% of lead sets against 3.7%, a twentieth of them past
the side's holding. **Q5** held: no assertion on any decision.

**The rule, applied.** On the shipped vector's records the licensed reach at four is **1.32 times
the certain reach**, under the pre-registered one and a half — and the same on every corpus (1.31,
1.30, 1.12). **The rung stops here: no knob is built.** What the read says is that the four rung's
reach is what the public record makes it. A teammate's licence recovers a third of what is missing
because a licensed teammate is the exception at a seat-known three: the usual missing card is one
nobody has asked about, and only a belief can count it — §3.8h's belief form, which lost on every
seed. §3.8t's default sent row 26 to row 25's (b); row 26 departs from it, with the reason stated
there, and takes the rung below the four instead.

### 3.8u Monet v0.22 — the rung below the four: `closingThree`, the closing credit's dose at a seat-known three

**Decision row 26, taken 2026-09-07 under the owner's direction of 2026-09-06 — (e).** §3.8p put
the even-set race's decision at four of six: the first side to four converts its lead 56% of the
time between equals, 49% for Monet against SESTINA and 61% the other way. §3.8q read the pace as a
choice — SESTINA asks into the race at 60% of its lead decisions, Monet at 35% — and §3.8r and
§3.8s priced the ask that makes a seat-known five (the four rung) at its own dose: +0.94 with the
five rung beside it, the first term to clear the ladder's bar. §3.8t then measured the four rung's
reach as the public record makes it — 15% of Monet's lead sets with every rules fact counted — and
put the population of the rung below it, the ask whose hit would leave two cards of the set
outside the side's certain hands, at **18% of Monet's asks**, more than the four and five rungs
together. This rung prices that ask: the one that makes a seat-known four, the stage §3.8p named,
on the same ungated arm as the two rungs that read positive (§3.8i's chase credit, which lost, sat
on the gated arm). A home ladder over doses on the shipped vector fixes the dose; twelve fresh
seeds under §3.8n read it. It changes `lib/` — one knob, off by default — and may change the
shipped vector if it clears the bar, which is the owner's call at review.

#### Pre-registration — written 2026-09-07, before the knob exists and before any cell

**The term.** A Monet-only style knob **`closingThree`** (a number ≥ 0; absent on every roster style
and every tier). In `closingCredit`, where the seat's **certain** picture of the asked set has
exactly the horizon's worth of cards outstanding after the hit — two under `us54`, where the lock
is 0 and v0.12's credit pays nothing; a seat-known three of six — the credit is
**`closingThree · wHit · p · 0.25`**, the halving continued (1 at the five rung, 0.5 at the four,
0.25 here). The rung is named by the certain picture whatever form the lock takes (under
`closingBelief` too, with the constant factor). Everything else is §3.8h's and §3.8r's, untouched:
the four rung's dose is `closingFour`'s, the five rung's `closing`'s; the credit pays nothing for a
sure miss into the side's own majority, for a resolved set, or at `p` 0; and it is **gated below
every legal certain hit with no ungating switch**. **Byte identity:** `closingThree` absent, or 0,
leaves every decision where it was on every path — with the shipped stack (`closing` 0.5 +
`closingFour` 2) it is that stack exactly, and alone it is the base. Tests pin identity with the
base and with the stack, the rung (fires only at a seat-known three; exactly the credit; the four
and five rungs on the full stack pay what the shipped stack pays), the gate at a hot dose with the
priced switch live, liveness and determinism, the validator, and absence from every roster style
and tier.

**The arithmetic, so the doses mean something.** An uncertain ask at `p` stands at about
`wHit · p` with `wHit` 70. At the three rung `closingThree` 1 adds `17.5 · p` (a quarter premium on
the ask's own hit value), 2 adds `35 · p` (half), 4 adds `70 · p` (doubles it — the four rung's
premium at the shipped dose: a chase at `p` 0.35 beats an ask elsewhere at `p` 0.65), 8 adds
`140 · p`.

**The fit, at home, on the shipped vector.** `scripts/duplicate-pairs.mjs --a v0.9 --a-override
'{"closing":0.5,"closingFour":2,"closingThree":D}' --b v0.9 --b-override
'{"closing":0.5,"closingFour":2}' --bank home-a --pairs 2400` for **D ∈ {1, 2, 4, 8}** — four arms,
4,800 games each, the paired set-difference with the cell's own SD (§6.3). The vector is spelled by
overrides on both sides because v0.20c enters the registry only when the owner merges #41; the
harness's control — the same override on both arms — must print `0.0000 +/- 0.0000` and is run
first. The markers, from `scripts/attribute.mjs --home 2400 --a v0.9 --a-knobs
closing=0.5,closingFour=2,closingThree=D --b v0.9 --b-knobs closing=0.5,closingFour=2 --cf v0.9
--cf-knobs closing=0.5,closingFour=2 --races --race42` on the primary and the secondary: the credit
moved (the counterfactual stack disagrees exactly where the knob moved), A's first-to-four share of
the even sets (`--races`: the side that starts the race), A's chase share at lead decisions,
first-chase share, chase hit rate, sure-miss share and lead conversion beside B's.

**Eligibility and the choice, fixed now.** An arm is *eligible* for the bridge if (i) its home
paired mean is at least +2 SE (a gain at 95% at home) and (ii) its sure-miss share at home is
within 3 points of the shipped stack's — the credit must not buy sure misses (§3.8i's failure). No
reach bar this time: §3.8t measured the reach. **The primary arm** is the eligible arm with the
best home paired mean; a tie within one SE goes to the larger dose. **The secondary arm** is the
next-best eligible dose, read on the same twelve and reported beside the primary; it cannot ship
from this rung. If no arm is eligible the rung stops at home and row 27 says so; nothing goes
abroad.

**The bridge read.** Twelve fresh seeds under the label `"monet-v0.22-confirm-12"` by §6.5's rule
(`$SP/seeds-v22.mjs`, spent set = v0.20b's plus its twelve), written into this section before a
cell is played: **5594240 8792627 4733371 4311448 9252632 9599680 2641105 2254076 5393671 6482925 6734115 4029127**. The tree: the v0.22
commit's `lib/` exported by `git archive` to `$SP/fishai-v22` and mounted read-only, its commit
and lib md5 recorded, the preamble refusing any other. The arms: the unchanged adapter (`bot.mjs`
md5 c1fc7316…), `MONET_ARM` v0.4c, `MONET_MUSTFIX` 1, `MONET_OVERRIDE` carrying `contest` 0.6 +
`closing` 0.5 + `closingFour` 2 (the base: v0.20c's vector) plus `closingThree` D for the arms.
**Pins before a number is read:** the identity cell — the v0.9-vector arm (no closing knobs) at
6269924 diffed against §3.8l's recorded cell, every engine line but `elapsed`, IDENTICAL (the tree
has moved; the knobs absent are byte identity); the in-engine pin of **every** cell — `--cf v0.9
--cf-knobs <the arm's knobs>` at 100.0% of A's decisions; the races reconciled EXACT; the fourteen
fault counters zero; 36 cover files a cell, a short cell replayed IDENTICAL before it is read; at
most three containers at once. **The ship rule is §3.8n's, paired against v0.20c's vector on the
twelve:** the primary ships if its paired mean is at least two standard errors above zero and it is
ahead on a majority of the twelve; ±2.00 stays the rung and a term under it is marked as such; the
registry change (v0.22 = v0.20c plus `closingThree` D) is a PR for the owner, stacked on #41 — if
#41 is declined, this read still stands on v0.20c's vector and the record says what a re-base
would need.

**Predictions, written before the knob exists.**

- **Q1 (home)** `closingThree` 1 and 2 read positive, at least +0.10 a pair; the ladder turns down
  by 8 (8 below 2); the best arm +0.15 to +0.40 a pair; the primary is 2 or 4.
- **Q2 (markers at the primary)** The credit moves 6–12% of A's asks (the four rung moved 3.8% at
  home at its dose, and this rung's population is larger by half before the dose's reach); A's
  first-to-four share of the even sets rises 2–6 points; the chase share at lead decisions +3 to
  +8; the sure-miss share within 3; the chase hit rate not lower by more than 2 points.
- **Q3 (abroad)** The primary +0.3 to +1.0 paired against v0.20c's vector, SD 1.3–1.8, ahead on 7–9
  of 12; the bar cleared with odds one in three; the secondary in the same direction.
- **Q4** The checks hold: identity IDENTICAL, every cell pinned at 100.0%, races EXACT, counters
  zero, cover files complete.

**What ships.** The knob, off by default, and the record merge on self-verification; the shipped
vector changes only by the owner's merge of a registry PR. **Cost** M — the knob and its tests,
the control and four home arms (about forty minutes), the markers, 36 cells three wide (about
twenty minutes), the walks, the record. **Scratch, not committed:** `$SP/monet-v22/` (`DOSES.json`,
`run-home.sh`, `home/`, `run-lanes.sh`, `run-race42-v22.sh`, `report-v22.mjs`, `records/`,
`out/`), `$SP/v22-{prereg,record}.md`.

#### Record — 2026-09-07 (the knob committed 01:11Z, the home ladder played 01:09Z to 01:20Z on that tree, the identity cell 01:12Z, read at once)

**The runs.** The knob (`closingThree`, commit 6101f4f, its six tests green with the rest of the
suite: 69 files, 1,090 tests) and, at home on the shipped vector spelled by overrides on both arms,
the control first — the same override on both sides, `0.0000 +/- 0.0000` over 400 pairs — then
`closingThree` 1, 2, 4 and 8 against the shipped stack (`closing` 0.5 + `closingFour` 2) in 2,400
duplicate pairs each, four at once, eleven minutes. The tree was exported for the bridge
(`$SP/fishai-v22`, commit 6101f4f, lib md5 d30542fb…) and the arms built (`$SP/arm_v22`, the
adapter unchanged at c1fc7316…); **the identity cell on the v0.22 tree — the v0.9-vector arm at
6269924 — read IDENTICAL** to §3.8l's recorded cell on every engine line but `elapsed` (40.75%, 36
cover files, the fourteen counters zero): the knob absent is byte identity abroad as at home. No
confirmation cell was played; the twelve drawn under `"monet-v0.22-confirm-12"` are unspent and
join the spent set as drawn, as §3.8i's did. Scratch: `$SP/monet-v22/{DOSES.json, run-home.sh,
home/, run-markers.sh, step0.log}`, `$SP/arm_v22`, `$SP/fishai-v22`.

**R1 — the home ladder** (`scripts/duplicate-pairs.mjs`, 2,400 pairs on `home-a` an arm, 4,800
games, the cell's own SD; points of win rate by §0.1's conversion of the per-game difference, as
§3.8r's table; a positive number favours the knob).

| arm | dose | paired set-diff a pair ± 1.96 SE (SD) | in points of win rate ± SE | verdict at 95% |
|---|---|---|---|---|
| control | the shipped stack on both sides, 400 pairs | **0.0000 ± 0.0000** (0.00) | 0 | — |
| t1 | `closingThree` 1 | **−0.160 ± 0.132** (3.30) | −1.20 ± 0.50 | BEHIND, 2.4 × SE |
| t2 | `closingThree` 2 | **−0.208 ± 0.135** (3.37) | −1.56 ± 0.52 | BEHIND, 3.0 × SE |
| t4 | `closingThree` 4 | **−0.275 ± 0.135** (3.38) | −2.06 ± 0.52 | BEHIND, 4.0 × SE |
| t8 | `closingThree` 8 | **−0.458 ± 0.140** (3.51) | −3.43 ± 0.54 | BEHIND, 6.4 × SE |

**A loss at every dose, and more the larger the dose.** No arm is eligible (the bar was +2 SE);
**the rung stops at home by its own rule, and nothing goes abroad.**

**R2 — the markers, post hoc** (the pre-registration named them for the primary and the
secondary, and there is neither; run on the two smallest doses to say why the ladder loses.
`attribute.mjs --home 2400`, A the stack plus the knob, B the shipped stack, the counterfactual the
shipped stack; B is the reference in the same games; `$SP/monet-v22/home/markers-t{1,2}.txt`).

| readout | `closingThree` 1: A / B | `closingThree` 2: A / B |
|---|---|---|
| the credit moved (the counterfactual's disagreement at A's asks) | **4.0%** | **5.5%** |
| lead decisions a game | 8.60 / 8.63 | 8.11 / 8.16 |
| chase share at lead decisions (certain + uncertain); Δ against the counterfactual | 43.7% / 41.9%; +1.4 | 44.7% / 43.1%; +2.2 |
| chase hit rate | **51.9% / 53.9%** | **51.6% / 53.7%** |
| chase sure-miss share | 20.2% / 21.5% | 20.8% / 21.2% |
| first lead decision a chase (the lead converted when chased / when not) | **67.2% (50.9 / 55.4)** / 59.5% (52.4 / 53.1) | **69.9% (51.8 / 54.7)** / 60.5% (53.9 / 51.8) |
| even sets: the race starter, the side whose ask first went into the set (A / B) — **CORRECTED in §3.8v R3:** the harness gave team A the first turn in every home game, and identical policies read 56% / 42% on it; re-walked with the start rotating, `closingThree` 1 opens 43.7% of the even races against the stack's 54.1%, `closingThree` 2 42.5% against 55.3% | **48.4% / 49.2%** | **48.7% / 48.3%** |
| the leader's conversion when it started (p_A / p_B) | 52.3% / 52.8% | 51.0% / 52.1% |
| lead decisions a race; chases a race | 4.79; 1.74 / 4.86; 1.70 | 4.73; 1.74 / 4.63; 1.68 |

The credit does what it was built to do at the surface — Monet's first lead decision is a chase
8 to 9 points more often — and buys nothing underneath: **the side opens fewer of the even races** (48.4% against 49.2% and 48.7% against 48.3% as first
read, under a harness that gave it 56% by the first turn alone — **corrected in §3.8v R3:** 43.7%
against 54.1% and 42.5% against 55.3% with the start rotating; the credit diverts asks from
opening even sets into continuing seat-known-three ones, and the starter converts 53% of the races
it opens), the chases it buys **hit two points less**,
and the lead converted when the first decision is a chase is lower than when it is not (50.9
against 55.4). The added chases themselves, from the table's rounded shares: where A and the
counterfactual both chase (8,591 lead decisions at dose 1) the hit rate is 52.7% on both; the
chases only A makes — about 430 of its 9,020 at dose 1, 650 of 8,700 at dose 2 — hit at about
**36% and 34%**. The seat-known-three ask is mostly an ask into a set the side already leads
(§3.8t: a certain three is 26% of Monet's lead sets), so the credit spends hit probability on a
race whose first stage the side has already won, at the doses' own low `p`, and the paired sets
say what that costs.

**Predictions, scored.** **Q1** missed outright: no dose positive, the ladder falls from dose 1,
there is no primary. **Q2** one of five, post hoc (two at dose 1): the sure-miss share within 3
points (−1.3, −0.4); the chase hit rate 2.0 and 2.1 points below B's, exactly at its bar at dose 1
and past it at 2; the credit moved 4.0% and 5.5% against a predicted 6–12; the first-to-four share
−0.8 and +0.4 as first read, −10 and −13 against the stack under §3.8v's corrected harness, against
+2 to +6; the chase share at lead decisions +1.4 and +2.2 against the
counterfactual (+1.8 and +1.6 against B) against +3 to +8. **Q3** not reached. **Q4** the identity
check held; the rest not reached.

**The rule, applied.** No arm is eligible at home; **the rung stops, nothing goes abroad, and
the knob stays off the vector** — merged as an off-by-default knob with its tests, for the record
and for any later reader who wants the rung's arithmetic. **What the read says:** the closing
credit's value lives within two cards of the claim. The five rung pays (§3.8h), the four rung pays
at its own dose (§3.8r, §3.8s), the three rung costs at every dose — the family is now read at
every rung, and the ask that makes a seat-known four is not worth a hit's probability. Row 27
takes the family's doses back to the vector they ship on.

### 3.8v Monet v0.23 — the appetite re-fit: the shipped doses moved one at a time, on the vector they ship on

**Decision row 27, taken 2026-09-07 under the owner's direction of 2026-09-06 — (d).** The three
appetite doses that ship together on v0.20c's vector were each fit with the other two absent.
`contest` 0.6 was chosen abroad on v0.4c's vector among six doses over three seeds (§3.8d: 0.15 /
0.3 / 0.6 / 1.0 / 1.5 / 2.5 read +0.36 / −0.42 / **+5.83** / +2.94 / +4.42 / +1.36 paired against
the base, the peak at 0.6 with the neighbours a seed's SD apart), before a closing credit existed.
`closing` 0.5 was chosen abroad on v0.9's vector among four (§3.8h: 0.1 / 0.25 / 0.5 / 1.0 read
+0.22 / +0.89 / **+0.97** / +0.72 over three seeds; +0.58 on its twelve), with no four rung.
`closingFour` 2 was chosen at home on v0.9's vector among four (§3.8r: 1 / 2 / 4 / 8 read +0.150 /
**+0.172** / +0.075 / −0.101 a pair), with the five rung absent from the ladder and present only in
the stack read beside it — and the stack read more than its parts (+0.301 against +0.043 + 0.172),
which is the one measured interaction. §3.8u then found the family's third rung costs at every dose,
so the family is complete at two rungs and its doses are the open question: **is the shipped point
a local optimum on its own vector?** This rung reads one-knob moves from the shipped point at home,
in duplicate pairs against the shipped stack, and takes the best eligible move abroad under §3.8n.
It changes no code — `lib/` is untouched — and may change the shipped vector if a move clears the
bar, which is the owner's call at review.

#### Pre-registration — written 2026-09-07, before any cell

**The arms.** The shipped stack S is v0.9 with `closing` 0.5 + `closingFour` 2 (`contest` 0.6 from
the registry). Eight one-knob moves from S, each the stack with one dose changed: **`contest` 0.4 /
0.8 / 1.0** (c04, c08, c10), **`closing` 0.25 / 0.75 / 1.0** (k025, k075, k10), **`closingFour`
1 / 3** (f1, f3). The doses bracket the shipped point at the spacing the earlier ladders used; no
new knob, no new mechanism, nothing that was not already on the vector.

**The fit, at home.** `scripts/duplicate-pairs.mjs --a v0.9 --a-override <the move> --b v0.9
--b-override <S> --bank home-a --pairs 2400` an arm — 4,800 games, the paired set-difference with
the cell's own SD (§6.3), four arms at once. Two controls first, each 400 pairs, each required to
print `0.0000 +/- 0.0000`: S against S (the harness's own control), and S with `contest` 0.6
spelled in the override against S with it implicit (the override key is honoured and equals the
registry's dose). The move overrides spell all three doses; a `contest` arm that prints exactly
`0.0000` means the key was not honoured and the ladder is void. The markers on every eligible arm:
`scripts/attribute.mjs --home 2400 --a v0.9 --a-knobs <the move> --b v0.9 --b-knobs
closing=0.5,closingFour=2 --cf v0.9 --cf-knobs closing=0.5,closingFour=2 --races --race42` — the
move's disagreement with S at A's own asks, the sure-miss share, the chase share and hit rate at
lead decisions, the first-to-four share of the even sets, beside B's.

**Eligibility and the choice, fixed now.** An arm is *eligible* for the bridge if (i) its home
paired mean is at least +2 SE and (ii) its sure-miss share at home is within 3 points of S's. **The
primary** is the eligible arm with the best home paired mean; a tie within one SE goes to the
smaller move from the shipped dose (the shipped point is the prior). **The secondary** is the best
eligible arm on a different knob, else the next-best eligible dose on the same knob. **A second
round, only if the primary and the secondary move different knobs:** the combined move (both doses
changed) is read at home in 2,400 pairs against S; if its home mean beats the primary's, it becomes
the primary and the former primary the secondary. If no arm is eligible the rung stops at home,
row 28 says so, and the shipped doses stand as fit where they ship.

**The bridge read.** Twelve fresh seeds under the label `"monet-v0.23-confirm-12"` by §6.5's rule
(`$SP/seeds-v23.mjs`, spent set = v0.22's plus its twelve, drawn and never played), written here
before a cell is played: **7812476 3107165 4205667 6642697 6042682 8740967 8852434 5279031 4833011 4949308 5613450 4420296**.
The tree: this commit's `lib/` exported by `git archive` to `$SP/fishai-v23` and mounted read-only,
its commit and lib md5 recorded — **the lib md5 must equal v0.22's (d30542fb95df1f9834d6e4f1825ffc23),
since this rung changes no code; that equality makes §3.8u's identity cell this rung's identity
cell, and if it does not hold the identity cell is replayed before a number is read.** The arms:
the unchanged adapter (`bot.mjs` md5 c1fc7316…), `MONET_ARM` v0.4c, `MONET_MUSTFIX` 1,
`MONET_OVERRIDE` carrying `contest` 0.6 + `closing` 0.5 + `closingFour` 2 (the base: v0.20c's
vector) and, for the primary and the secondary, the same three keys with the moved dose(s). **Pins
before a number is read:** the in-engine pin of **every** cell — `--cf v0.9 --cf-knobs <the arm's
three doses>` at 100.0% of A's decisions; the races reconciled EXACT; the fourteen fault counters
zero; 36 cover files a cell, a short cell replayed IDENTICAL before it is read; at most three
containers at once. **The ship rule is §3.8n's, paired against v0.20c's vector on the twelve:** the
primary ships if its paired mean is at least two standard errors above zero and it is ahead on a
majority of the twelve; ±2.00 stays the rung and a term under it is marked as such; the registry
change (v0.23 = v0.20c with the moved dose or doses) is a PR for the owner, stacked on #41 — if #41
is declined, this read still stands on v0.20c's vector and the record says what a re-base would
need. The secondary is reported beside the primary and cannot ship from this rung.

**Predictions, written before any cell.**

- **Q1 (home)** The shipped point is near a local optimum: the `contest` moves read negative at 0.4
  and 1.0 (−0.05 to −0.25 a pair) and within ±0.10 at 0.8; `closing` 0.75 is the likeliest eligible
  arm (+0.05 to +0.20), `closing` 1.0 within −0.05 to +0.10, `closing` 0.25 negative (−0.15 to
  0.00); `closingFour` 1 within −0.10 to +0.05 and `closingFour` 3 within −0.10 to +0.10. Odds two
  in five that any arm is eligible; if one is, the best reads +0.10 to +0.25.
- **Q2 (markers at the primary)** The move disagrees with S at 2–6% of A's asks; the sure-miss share
  within 3 points; the chase share at lead decisions within ±3 of S's for a `closing` or
  `closingFour` move and the chase hit rate within 2.
- **Q3 (abroad)** The primary +0.0 to +0.6 paired against v0.20c's vector, SD 1.3–1.8, ahead on
  6–8 of 12; the bar cleared with odds one in four; the secondary in the same direction.
- **Q4** The checks hold: the lib md5 equal to v0.22's, every cell pinned at 100.0%, races EXACT,
  counters zero, cover files complete.

**What ships.** Nothing but the record merges on self-verification; the shipped vector changes only
by the owner's merge of a registry PR. **Cost** S — two controls and eight home arms (about half an
hour), the markers, at most one second-round arm, 36 cells three wide (about twenty minutes), the
walks, the record. **Scratch, not committed:** `$SP/monet-v23/` (`SEEDS`, `DOSES.json`,
`run-home.sh`, `home/`, `run-markers.sh`, `run-lanes.sh`, `run-race42-v23.sh`, `report-v23.mjs`,
`records/`, `out/`), `$SP/v23-{prereg,record}.md`.

#### Record — 2026-09-07 (the controls and the eight arms 01:44Z to 02:07Z, read at once; the markers and the harness finding post hoc, 02:08Z to 02:29Z)

**The runs.** The pre-registration committed (272fe12), then at home on the shipped vector spelled
by overrides on both arms: the two controls first, 400 pairs each — the stack against itself, and
the stack with `contest` 0.6 spelled against the stack with it implicit — both `0.0000 +/- 0.0000`
(the key is honoured and equals the registry's dose; no `contest` arm printed an exact zero); then
the eight one-knob moves against the stack in 2,400 duplicate pairs each, four at once, nineteen
minutes. The tree was exported for the bridge (`$SP/fishai-v23`, commit 272fe12) and its lib md5
came out **d30542fb95df1f9834d6e4f1825ffc23, equal to v0.22's** — this rung changes no code, so
§3.8u's identity cell (IDENTICAL) is this rung's; the ten arm packages were built (`$SP/arm_v23`)
and none played. No cell went abroad; the twelve drawn under `"monet-v0.23-confirm-12"` join the
spent set unspent. Scratch: `$SP/monet-v23/{DOSES.json, run-home.sh, home/, run-markers.sh,
run-markers-ctl.sh, run-markers-rot.sh, report-home.mjs}`, `$SP/arm_v23`, `$SP/fishai-v23`.

**R1 — the home ladder** (`scripts/duplicate-pairs.mjs`, 2,400 pairs on `home-a` an arm, 4,800
games, the cell's own SD; points of win rate by §0.1's conversion of the per-game difference, as
§3.8r's table; a positive number favours the move).

| arm | the move from the shipped point | paired set-diff a pair ± 1.96 SE (SD) | in points of win rate ± SE | verdict at 95% | eligible |
|---|---|---|---|---|---|
| control | the stack against itself, 400 pairs | **0.0000 ± 0.0000** (0.00) | 0 | — | — |
| control2 | `contest` 0.6 spelled against implicit, 400 pairs | **0.0000 ± 0.0000** (0.00) | 0 | — | — |
| c04 | `contest` 0.4 | **−0.526 ± 0.142** (3.54) | −3.94 ± 0.54 | BEHIND, 7.3 × SE | no |
| c08 | `contest` 0.8 | **−0.135 ± 0.106** (2.66) | −1.01 ± 0.41 | BEHIND, 2.5 × SE | no |
| c10 | `contest` 1.0 | **−0.130 ± 0.121** (3.02) | −0.98 ± 0.46 | BEHIND, 2.1 × SE | no |
| k025 | `closing` 0.25 | **+0.026 ± 0.030** (0.74) | +0.20 ± 0.11 | inside, 1.7 × SE | no |
| k075 | `closing` 0.75 | **−0.006 ± 0.024** (0.60) | −0.05 ± 0.09 | inside | no |
| k10 | `closing` 1.0 | **+0.002 ± 0.030** (0.74) | +0.01 ± 0.11 | inside | no |
| f1 | `closingFour` 1 | **−0.051 ± 0.095** (2.37) | −0.38 ± 0.36 | inside | no |
| f3 | `closingFour` 3 | **−0.036 ± 0.076** (1.89) | −0.27 ± 0.29 | inside | no |

**The shipped point is a local optimum at home along every axis, and no move is eligible.**
`contest` is sharply peaked: both neighbours lose, 0.4 by four points of win rate. `closing` is flat
— the SD says why: a `closing` move changes 0.6–0.74 sets a pair against 2.7–3.5 for a `contest`
move, because the five rung's credit rarely decides the ask (at 0.25 the move disagrees with the
stack at 0.2% of Monet's asks, 160 of some 103,000). `closingFour` is slightly down on both sides
of 2, within one SE, the shape §3.8r found on v0.9's vector (1 / 2 / 4 at +0.150 / +0.172 /
+0.075). **The rung stops at home by its rule; nothing goes abroad; the shipped doses stand as fit
where they ship.**

**R2 — the markers, post hoc** on the two extremes — `closing` 0.25 (the only positive read) and
`contest` 0.4 (the largest loss) — against the stack, the stack the counterfactual, 2,400 games
each, **under the rotating-start harness of R3** (the first pass under the old harness,
`home/markers-{k025,c04}.txt`, reads the same on every per-side rate but the starter share).

| readout | `closing` 0.25: A / B | `contest` 0.4: A / B |
|---|---|---|
| the move disagrees with the stack at A's asks (n; the stack's ask would hit / the move's hit) | **0.2%** (160; 45.6% / 70.0%) | **7.6%** (7,630; 25.2% / 21.9%) |
| asks a game; hit | 43.0; 58.7% / 42.9; 58.5% | 42.1; 57.9% / 42.6; 58.4% |
| own-locked asks (sure misses) | 8.0% / 8.0% | **9.7% / 7.7%** |
| lead decisions a game | 9.19 / 8.96 | 8.11 / 7.35 |
| chase share at lead decisions; Δ against the counterfactual | 41.0%; +0.2 / 40.8% | 45.0%; +3.1 / 47.1% |
| chase hit rate | 52.0% / 52.8% | 50.2% / 58.3% |
| even sets: the race starter, the side whose ask first went into the set | 48.2% / 49.6% | **35.4% / 61.6%** |
| the starter's conversion (p_A / p_B) | 55.0% / 54.2% | 47.6% / 51.3% |
| first lead decision a chase (the lead converted when chased / when not) | 60.5% (52.3 / 52.1) / 57.3% (51.3 / 52.4) | 79.8% (50.0 / 47.5) / 58.9% (54.4 / 48.8) |

`closing` 0.25 differs from the stack on one ask in five hundred, and there it takes the ask at 70%
over the closing ask the stack takes at 46% — a rounding of the vector, +0.20 points at 1.7 SE,
not a term. `contest` 0.4 is the load-bearing move: with less appetite for the probable miss into
a contested set, Monet **opens 13 points fewer of the even races** (35.4% against 48.6% between
equals) and the starter converts the race it opens at 53–55% against 46–47% for the other side;
its alternative ask is more often a sure miss (9.7% against 7.7%); its lead decisions fall by a
tenth. The contest credit's value is the race it opens, and its form (the `(1 − p)` factor, the
domination condition) is unread — row 28's (q).

**R3 — the harness, post hoc: the first mover's advantage in `--home`.** The first `closing` 0.25
walk printed "A starts 56.0%, B starts 41.9%" for two sides that agree with the stack at 99.8% and
100.0% of their asks. Three controls with **identical policies** on both sides (the stack spelled
with `contest` 0.6, unspelled, and mixed; `home/markers-ctl{X,N,M}.txt`): A starts 56.1 / 56.3 /
56.4% of the even races, B 41.6 / 41.5 / 41.6%; A wins 51.8 / 50.7 / 51.1% of the games, 3.82–3.87
sets a game against 3.71–3.77. The cause is in `playHome`: every home game began at seat 0, so
**team A took the first turn in all 2,400 games of every `--home` walk since §3.8p's instrument**,
and the first mover opens the first race; the starter converts 53–54% of the races it opens (p_A
53.6%, p_B 53.4% in the control) against 46–47% for the side it opens against. **What it touches:**
the A-versus-B rates a `--home` walk prints — the starter share above all, and the A/B win rate of
the marker games. **What it does not touch:** every paired number on the ladder — the
duplicate-pairs harness (§6.3) swaps the sides within a pair and is immune, and its controls print
zero exactly; the records walks (§3.8p–§3.8t abroad), which play no games and take the engine's
starting seat; within-side ratios (§3.8t's home ×1.12; §3.8q's and §3.8t's home mirrors, which
validated an instrument's reconciliation, not a rate). **The fix**, this rung's instrument commit:
`--home` rotates the starting seat over the games (game g starts at seat g % 6, as
`models.test.ts` does), the head line names the mode, and `--home-start 0` reproduces the old
harness for any reader replaying an archived walk. The identical-policy control under the rotation:
A starts 48.6%, B 49.1%; A wins 48.9%, 3.77 sets a game against 3.81.

**What it corrects.** §3.8u's R2 table labelled the `--races` starter share "the side that reaches
four first" and read 48.4% / 49.2% (dose 1) and 48.7% / 48.3% (dose 2) as parity. Against the old
harness's 56% / 42% for identical policies those were about eight points fewer starts by the knob,
and re-walked under the rotation (`home/markers-t{1,2}r.txt`) **`closingThree` 1 opens 43.7% of the
even races against the stack's 54.1%, `closingThree` 2 42.5% against 55.3%: the three rung diverted
Monet's asks from opening even sets into continuing seat-known-three ones, and the starter converts
53% of the races it opens.** The rest of §3.8u's markers re-read the same under the rotation (dose
1: the credit moved 3.8% of Monet's asks, the first lead decision a chase 68.3% against 57.9%, the
chase hit rate 51.2% against 54.6%, the sure-miss share within one point), and §3.8u's result — a
loss at every dose by the paired sets — was never a marker's; its record and ladder row carry the
correction inline. §3.8r's record made no claim on the starter share (its markers were read for the
chase share and the reach); §3.8p's starter shares abroad are the engine's.

**Predictions, scored.** **Q1** the local-optimum claim held and no arm is eligible (the
three-in-five side of the odds); the dose ranges four of eight — `contest` 1.0, `closing` 1.0,
`closingFour` 1 and 3 inside; `contest` 0.4 below its range (−0.53 against −0.05 to −0.25),
`contest` 0.8 outside ±0.10 (−0.135), `closing` 0.75 not the eligible arm (−0.006 against +0.05 to
+0.20), `closing` 0.25 positive where a loss was predicted. **Q2** not reached as pre-registered
(no primary); the post-hoc markers on the two extremes are R2's. **Q3** not reached. **Q4** the lib
md5 equal to v0.22's, as required; the rest not reached.

**The rule, applied.** No arm is eligible at home; **the rung stops, nothing goes abroad, and the
shipped doses stand** — the record and the harness fix merge on self-verification, the vector is
unchanged. **What the read says:** the appetite family is closed at its shipped doses; the closing
credit's dose is nearly inert; the contest credit is the family's load-bearing term and the race it
opens is where its value lives. Row 28 takes the placement value, the records read that would say
what an ask buys the team's later decisions — the reason SESTINA's chases pay where Monet's did not
— before anything is built on it.

### 3.8w Monet v0.24 — the placement value: what an ask buys the team's later decisions, a records read

**Decision row 28, taken 2026-09-07 under the owner's direction of 2026-09-06 — (n).** The race
for an even set is decided at four of six (§3.8p): the first side to four converts 56% between
equals, Monet 49% against SESTINA, SESTINA 61% the other way. SESTINA asks into the race at 60% of
its lead decisions, Monet at 35% (§3.8q); the credit that copied the pace flat in the hit chance
lost every dose (§3.8i), the credit priced at the four rung paid +0.94 (§3.8r, §3.8s), the rung
below it cost at every dose (§3.8u), and the doses ship at a local optimum (§3.8v). What is left
unmeasured is the reason SESTINA's pace pays where Monet's copy did not: its seats can certainly
place four of a lead set twice as often as Monet's (24.8% against 12.1% of lead sets, §3.8r,
§3.8t), and every ask — hit or miss — places cards and licences for the team. This rung measures
that placement and its worth before anything is built on it: at a lead decision, what does the ask
into the race buy the side's next decision on the set that an ask elsewhere does not, and does the
side's certain picture of the set convert the race? It changes no code in `lib/` — an instrument
on `scripts/attribute.mjs` — and ships nothing.

#### Pre-registration — written 2026-09-07, before the instrument exists and before any walk

**The instrument.** `scripts/attribute.mjs --placement` (implies `--race42`; needs `--cf`, whose
knowledge build gives the asking seat's certain picture, as §3.8t's `--licences` does). At every
**lead decision** — §3.8q's: an ask decision by a side holding four of six in an opened,
unresolved, even-by-the-deal set — and for each such set b, through the asking seat's knowledge:
**`cert6`**, the number of b's six cards whose holder the seat can place with certainty (its own
hand counts, so 1 ≤ `cert6` ≤ 6); **`certHit`**, whether a certain hit into b is on the table for
the asking seat (it holds a card of b and can place a card of b at an opponent); and the
**action**: a *chase hit* (the ask went into b and hit), a *chase miss*, or *elsewhere*. At the
side's **next decision on the set** — its next ask decision, by any of its seats, while it still
holds four or five of b and b is unresolved — the same picture again, and the **transition** is
credited to the action at the earlier decision: Δ`cert6`, and `certHit` at the next decision. In
between, the **intervening asks into b** by each side (asks and hits). At the leader's **first**
lead decision on b (§3.8q's leader, the side first to four) the picture is kept with the race's
outcome. Every certainly-placed card is asserted against the live hands (a wrong placement aborts
the walk), the races are reconciled EXACT with `--races`, and every walk is pinned in-engine at
100.0% as before.

**The corpora.** `fs` — v0.20c's own records (`monet-v20b/records`, conf-fs × 12, the twelve of
§3.8s; `--cf v0.9 --cf-knobs closing=0.5,closingFour=2`), the operative corpus; `base` —
conf-base × 12 of the same seeds (`--cf v0.9`); and the **home mirror** — 2,400 games of the
shipped stack against itself under `--home 2400 --validate`, with the start rotating (§3.8v R3).
Monet is side A; SESTINA is side B abroad, the stack is B at home. **Readouts, per corpus and
side:**

- **R1 — the placement.** For the transitions, by the action at the lead decision: n, the mean
  Δ`cert6`, the share with `certHit` at the next decision, the mean number of decisions between.
  The headline: Δ`cert6` after a chase (hit and miss pooled as they occur) minus Δ`cert6` after an
  ask elsewhere.
- **R2 — the attribution.** The intervening asks into b by the side and by the other side (asks,
  hits), by the action — who places the cards the next decision sees, and whether the other side
  takes back after a miss.
- **R3 — the worth.** At the leader's first lead decision: the distribution of `cert6` (bucketed
  ≤ 2 / 3 / 4 / ≥ 5) and of `certHit`, and the conversion rate in each bucket.
- **R4 — SESTINA beside Monet.** R1–R3 on the other side of the same corpora: the pace's placement
  and worth for the bot that converts at 61%.

**The rule for what follows, fixed now.** A placement credit (row 28's (o)) is built as v0.25
**only if both hold on `fs`, Monet's side:** (i) the chase places — Δ`cert6` after a chase exceeds
Δ`cert6` after an ask elsewhere by at least **0.5** certain cards; and (ii) the placement converts
— the conversion at `cert6` ≥ 4 exceeds the conversion at `cert6` ≤ 2 by at least **10 points**,
each bucket with n ≥ 300. If either fails the placement story is closed and row 29 turns elsewhere
(the contest credit's form, or another records read).

**Predictions, written before the instrument exists.**

- **Q1 (R1, Monet on `fs`)** Δ`cert6` after a chase hit +0.8 to +1.3 (the hit itself and what the
  public record adds), after a chase miss +0.2 to +0.5 (the elimination), after an ask elsewhere
  −0.1 to +0.2 (only the other side's asks touch the set, and they can take a card away); the
  headline difference between +0.4 and +0.8, clearing 0.5 with odds three in five.
- **Q2 (R3)** Monet on `fs` converts 60–70% of the races it leads from `cert6` ≥ 4 and 40–50% from
  `cert6` ≤ 2; SESTINA converts more in every bucket and reaches its first lead decision at
  `cert6` ≥ 4 in 35–50% of its races against Monet's 20–30%.
- **Q3 (R2)** After a chase miss the other side asks into the set 1.0–1.5 times before the side's
  next decision on it, with 0.4–0.6 hits (the take-back); after an ask elsewhere 0.5–0.9 times.
- **Q4 (checks)** Every walk pinned at 100.0%; races EXACT on every cell; no placement assertion
  fires on 28,800 games abroad and the mirror; the mirror under `--validate`.

**What ships.** Nothing: the instrument and the record merge on self-verification; the vector is
untouched. **Cost** S — the instrument, twenty-five walks five wide (about fifteen minutes), the
report, the record. **Scratch, not committed:** `$SP/monet-v24/` (`run-place.sh`, `out/`,
`report-place.mjs`, `smoke-place.txt`), `$SP/v24-{prereg,record}.md`.

#### Record — 2026-09-07 (the instrument built 02:40Z, the walks 02:44Z to 02:50Z, read at once)

**The runs.** The pre-registration committed (154af1e), then the instrument (`--placement`, commit
a2c3615; a 40-game home smoke under `--validate` first), then the twenty-five walks five wide in
six minutes: `fs` (`monet-v20b/records` conf-fs × 12, `--cf v0.9 --cf-knobs
closing=0.5,closingFour=2`), `base` (conf-base × 12, `--cf v0.9`), and the home mirror (2,400
games of the stack against itself, the start rotating, `--validate`). **Every walk pinned at
100.0% of A's decisions (and B's at home); every cell EXACT on the races and on this instrument's
own reconciliation with §3.8q's races by leader; no placement assertion fired on 28,800 games
abroad and the mirror.** Scratch: `$SP/monet-v24/{run-place.sh, out/, report-place.mjs,
report-place.txt, smoke-place.txt}`.

**R1 — the placement** (the transition from a lead decision to the side's next decision on the
set, Δ`cert6` credited to the action taken at the lead decision; `fs`, Monet = A, SESTINA = B; the
SE over the twelve cells).

| side | lead decisions a game | `cert6` at the lead decision 1 / 2 / 3 / 4 / 5 / 6 | action | transitions (share) | Δ`cert6` | a certain hit at the next |
|---|---|---|---|---|---|---|
| Monet | 11.08 | 13.1 / 47.5 / 26.2 / 9.7 / 2.0 / 1.5% | chase hit | 26,099 (17.4%) | **+0.690** (0.003) | 12.8% |
| | | | chase miss | 17,824 (11.9%) | **+0.309** (0.008) | 24.4% |
| | | | elsewhere, a chase legal | 78,147 (52.2%) | **−0.017** (0.002) | 1.2% |
| | | | could not chase | 27,713 (18.5%) | +0.338 (0.004) | 1.6% |
| SESTINA | 6.99 | 7.4 / 34.9 / 29.6 / 22.3 / 2.7 / 3.1% | chase hit | 27,945 (30.0%) | **+0.720** (0.003) | 13.7% |
| | | | chase miss | 23,849 (25.6%) | **+0.274** (0.010) | 18.6% |
| | | | elsewhere, a chase legal | 20,443 (21.9%) | **−0.023** (0.002) | 1.9% |
| | | | could not chase | 21,036 (22.6%) | +0.309 (0.005) | 2.1% |

**The headline: Δ`cert6` after a chase (hit and miss pooled) +0.535 against −0.017 after an ask
elsewhere — +0.553 (SE 0.004) for Monet on `fs`; the bar of +0.5 is met.** SESTINA +0.538
(0.005); on `base` +0.561 / +0.542; at home +0.474 / +0.498 (under the bar, on the mirror the rule
did not name). A chase places about half a certain card that an ask elsewhere does not, and the
ask elsewhere places nothing for the set — the leader's picture of it moves only when the other
side asks into it. The pace restated on this instrument: **where a chase is legal Monet chases 36%
of the time and SESTINA 72%** (29.3 against 52.2 of Monet's lead decisions, 55.6 against 21.9 of
SESTINA's), and Monet sits at the lead for 11.1 decisions a game against SESTINA's 7.0.

**R2 — the attribution** (the asks into the set between the two decisions, per transition; `fs`).

| side | after | own asks (hits) | the other side's asks (hits) | events between |
|---|---|---|---|---|
| Monet | a chase hit | 0.00 | 0.00 | 1.0 (the same seat decides again at once) |
| Monet | a chase miss | 0.61 (0.61) | **0.97 (0.61)** | 4.7 |
| Monet | an ask elsewhere | 0.15 (0.15) | 0.27 (0.15) | 2.6 |
| SESTINA | a chase miss | 0.56 (0.56) | **0.84 (0.56)** | 4.6 |
| SESTINA | an ask elsewhere | 0.12 (0.12) | 0.17 (0.12) | 2.2 |

**A chase miss is answered by a take-back hit 61% of the time** (0.61 hits in 0.97 asks by the
other side before the leader's next decision on the set; 56% against SESTINA's misses): the miss
hands the trailer the licence — the chaser certainly holds a card of the set — and the trailer
cashes it. The own asks between (0.61 after a miss, every one a hit) are the leader's re-entry from
three after that take-back. After an ask elsewhere the set is left alone (0.27 asks by the other
side).

**R3 — the worth** (the leader's first lead decision on the set: its picture against the race's
outcome; `fs`).

| side | races with a lead decision | first picture `cert6` ≤ 2 / 3 / 4 / ≥ 5 | converted at ≤ 2 | 3 | 4 | ≥ 5 | ≥ 4 − ≤ 2 |
|---|---|---|---|---|---|---|---|
| Monet | 23,638 (EXACT) | 65.2 / 27.4 / 7.2 / 0.2% | **51.9%** (15,417) | 41.3% (6,476) | 51.9% (1,691) | 100.0% (54) | **+1.5 points** (SE 1.6) |
| SESTINA | 17,312 (EXACT) | 64.8 / 28.8 / 6.1 / 0.3% | **61.9%** (11,221) | 54.9% (4,988) | 68.8% (1,057) | 95.7% (46) | **+8.0 points** (SE 0.9) |

On `base` +2.9 the other way for Monet (SE 1.2), +5.0 for SESTINA (1.4); at home +4.1 and +2.0 for
the two stacks. **The bar of +10 is not met; the picture at the first lead decision does not
convert the race.** Two things stand out. The picture is a poor predictor for either bot — a
seat that can place three converts worse than one that can place two (41.3 against 51.9; 54.9
against 61.9), because `cert6` 3 is mostly a seat holding three of the set itself with the fourth
unplaced, not a seat that has learnt anything — and a certain hit at the first lead decision is
one race in three hundred. And **SESTINA converts more than Monet at every level of the picture:
61.9 against 51.9 at ≤ 2, 54.9 against 41.3 at 3, 68.8 against 51.9 at 4.** Its edge is not in
what it knows when the lead begins; it is in the race's play after it.

**Predictions, scored.** **Q1** three of four: a chase miss +0.31 (predicted +0.2 to +0.5), an ask
elsewhere −0.02 (−0.1 to +0.2), the headline +0.55 (+0.4 to +0.8, clearing 0.5) — a chase hit
+0.69 against +0.8 to +1.3, below the range (the next decision is often a teammate's, whose
picture is its own). **Q2** one of four: SESTINA converts more in every bucket; Monet converts 53%
from `cert6` ≥ 4 against a predicted 60–70 and 52% from ≤ 2 against 40–50; the first lead
decision comes at `cert6` ≥ 4 in 6.4% of SESTINA's races and 7.4% of Monet's against a predicted
35–50 and 20–30 — the prediction took §3.8t's share of lead decisions (28% of SESTINA's, 13% of
Monet's, reproduced here) for the share of first lead decisions, which come before the picture
forms. **Q3** at the edges: after a chase miss the other side asks 0.97 times (1.0–1.5) with 0.61
hits (0.4–0.6); after an ask elsewhere 0.27 (0.5–0.9). **Q4** held throughout.

**The rule, applied.** Condition (i) holds and condition (ii) does not; **the placement story is
closed and no placement credit is built** — the instrument and the record merge on
self-verification; the vector is untouched. **What the read says:** the chase buys half a certain
card and the certain picture is not what converts the race. SESTINA's edge lives in the race's
play after the lead begins, and the instrument put a number on the play's hinge: a chase miss is
answered by a take-back hit three times in five. The trailer's take-back — taken by Monet at 80%
of its legal chances and declined by SESTINA at 58% (§3.8q) — is the half of the race the ladder
has named and not read since row 23. Row 29 takes it.

### 3.8x Monet v0.25 — the trailer's ask: the take-back against the ask elsewhere, a records read

**Decision row 29, taken 2026-09-07 under the owner's direction of 2026-09-06 — (b).** The race
for an even set is decided at four of six (§3.8p); the leader's side has been read twice — the
pace is a choice (§3.8q), the four rung pays (§3.8r, §3.8s), the rung below it costs (§3.8u), the
chase places half a certain card and the picture does not convert (§3.8w) — and every read has
left the same fact standing: SESTINA converts its leads at 61% and Monet at 49%, at every level of
what the leader knows. The trailer's side has been read once, in passing: at a trail decision with
a take-back legal, Monet takes it 80% of the time and SESTINA 42%, asking uncertain elsewhere
instead (§3.8q); and §3.8w put the leader's exposure on the same hinge — a chase miss is answered
by a take-back hit three times in five. The take-back is a certain hit that returns the race to
three-all. Declining it is either SESTINA's loss or its edge, and the records can say which: what
the ask elsewhere buys, and whether the set is recovered as often without the take-back as with
it. This rung reads that, on both sides of the same corpora, before any term is named. It changes
no code in `lib/` — the instrument on `scripts/attribute.mjs` grows a trail side — and ships
nothing.

#### Pre-registration — written 2026-09-07, before the instrument exists and before any walk

**The instrument.** `scripts/attribute.mjs --trail` (implies `--race42`; needs `--cf` for the
trailer's picture, as `--placement` does). At every **trail decision** — §3.8q's: an ask decision
by a side holding two of six in an opened, unresolved, even-by-the-deal set b — and for each such
set: whether the asking seat **holds a card of b** and whether a **take-back is legal** (§3.8q's
definition: it holds a card of b and a card of b sits publicly with the other side); the trailer's
picture, **`cert6`** as §3.8w defines it; and the **action**: the *take-back* (a certain ask into
b), an *uncertain ask into b*, a *certain ask elsewhere*, an *uncertain ask elsewhere*, or *could
not* (no card of b held). For every ask elsewhere: its **hit** (the turn kept), the set it went
into and that set's **outcome for the side** by the end of the game (taken / lost / open), and
whether that set was one the side led (a chase in another race) or held a majority of. For every
trail decision: the trail set's **outcome for the trailer** — *recovered* (the trailer took it),
lost, or open. The first trail decision of each race is reconciled with §3.8q's per-race counts
(took back / not, recovered) EXACT; every certainly-placed card is asserted against the live
hands; every walk pinned in-engine at 100.0%.

**The corpora.** As §3.8w: `fs` (conf-fs × 12, `--cf v0.9 --cf-knobs closing=0.5,closingFour=2`),
`base` (conf-base × 12, `--cf v0.9`), and the home mirror (2,400 games of the stack against itself,
the start rotating, `--validate`). Monet is A; SESTINA is B abroad, the stack is B at home.
**Readouts, per corpus and side:**

- **R1 — the trail decisions by action:** n and share, the trailer's `cert6`, and the recovery rate
  of the trail set after each action.
- **R2 — the legal take-back, taken against declined:** among the trail decisions where a
  take-back was legal — the share taken; the recovery after taking against after declining; and
  for the declined, what the ask elsewhere bought: its hit rate, the share into a set the side led
  or held a majority of, and that set's outcome for the side.
- **R3 — SESTINA beside Monet:** R1 and R2 on the other side of the same corpora; the two bots'
  recoveries after the same action at the same picture.

**The rule for what follows, fixed now.** A trail term — the take-back priced by what the ask
elsewhere buys, so that Monet declines some of the take-backs it now takes — is built as v0.26
**only if, on `fs`, both hold for SESTINA:** (a) its recovery of the trail set after declining a
legal take-back is within **5 points** of its recovery after taking it; and (b) the ask elsewhere
it takes instead hits at **≥ 50%** and the set it went into is taken by SESTINA at **≥ 50%**. If
either fails, the decline is SESTINA's loss and not its edge, the trailer's story is closed, and
row 30 turns elsewhere. If both hold, the term is named from R2's shape and fitted at home in
duplicate pairs before any cell abroad.

**Predictions, written before the instrument exists.**

- **Q1 (R2, `fs`)** Monet: a take-back legal at 38–44% of its trail decisions, taken 78–82%;
  recovery 46–52% after taking, 36–46% after declining. SESTINA: taken 40–46%; recovery 54–62%
  after taking, 46–56% after declining — within 10 points, not within 5 (odds two in five that (a)
  holds).
- **Q2 (R2, the ask elsewhere)** SESTINA's declined take-backs buy an ask that hits 55–65% and goes
  into a set it leads or holds a majority of 55–70% of the time, taken by SESTINA 50–60%; Monet's
  declined ones (a fifth of its legal chances) hit 45–55% and their sets are taken 45–55%.
- **Q3 (R1)** The trailer's `cert6` at a take-back is a card higher than at an ask elsewhere
  (the public card that makes the take-back legal); recovery after an uncertain ask into the set
  is the lowest of the actions for both bots.
- **Q4 (checks)** Every walk pinned at 100.0%; races EXACT; the first trail decisions reconciled
  EXACT with §3.8q; no assertion on 28,800 games and the mirror.

**What ships.** Nothing: the instrument and the record merge on self-verification; the vector is
untouched. **Cost** S — the instrument, twenty-five walks five wide, the report, the record.
**Scratch, not committed:** `$SP/monet-v25/` (`run-trail.sh`, `out/`, `report-trail.mjs`,
`smoke-trail.txt`), `$SP/v25-{prereg,record}.md`.

#### Record — 2026-09-07 (the instrument committed 03:02Z, the walks 03:02Z to 03:07Z, read at once)

**The runs.** The pre-registration committed (29cd3e5), then the instrument (`--trail`, commit
70ddaad; a 40-game home smoke under `--validate` first), then the twenty-five walks five wide in
five and a half minutes: `fs` (`monet-v20b/records` conf-fs × 12, `--cf v0.9 --cf-knobs
closing=0.5,closingFour=2`), `base` (conf-base × 12, `--cf v0.9`), and the home mirror (2,400
games of the stack against itself, the start rotating, `--validate`). **Every walk pinned at
100.0% of A's decisions (and B's at home); every cell EXACT on the races and on this instrument's
own reconciliation with §3.8q's trail decisions and take-backs; no placement assertion and no
take-back assertion fired on 28,800 games abroad and the mirror.** Two facts of the engine the
reading needs, both from `reduce.ts`: a game ends at the clinch, five sets of nine, so a set *open*
at the end is one unresolved when a side reached five; and a hit keeps the turn, so a certain
take-back costs the trailer no tempo. Scratch: `$SP/monet-v25/{run-trail.sh, out/,
report-trail.mjs, report-trail.txt, post-trail.mjs, post-trail.txt, smoke-trail.txt}`.

**R1 — the trail decisions by action** (`fs`; Monet = A, SESTINA = B; a trail decision is §3.8q's,
and every opened, unresolved, even set the side holds two of at that decision is a trail set; the
outcome is the trail set's, for the trailer).

| side | trail decisions a game; trail sets | action | n (share of trail sets) | `cert6` | recovered / lost / open | the ask elsewhere: hit; into a set the side led / held four or more of; that set taken |
|---|---|---|---|---|---|---|
| Monet | 5.04; 76,027 | the take-back | 20,813 (27.4%) | 3.38 | **58.3** / 38.2 / 3.5 | — |
| | | an uncertain ask into the set | 2,346 (3.1%) | 4.37 | **67.0** / 30.9 / 2.0 | — |
| | | a certain ask elsewhere | 2,491 (3.3%) | 3.06 | 55.3 / 39.2 / 5.5 | 100.0%; 3.6 / 23.9; 73.6% |
| | | an uncertain ask elsewhere | 843 (1.1%) | 3.19 | 56.1 / 37.8 / 6.0 | **100.0%**; 10.4 / 66.8; 84.0% |
| | | could not (no card of the set) | 49,534 (65.2%) | 1.80 | 43.2 / 51.1 / 5.7 | — |
| SESTINA | 8.63; 140,236 | the take-back | 26,321 (18.8%) | 3.00 | **57.5** / 38.9 / 3.7 | — |
| | | an uncertain ask into the set | 6,148 (4.4%) | 4.18 | **70.4** / 26.6 / 3.0 | — |
| | | a certain ask elsewhere | 11,350 (8.1%) | 2.38 | 42.2 / 42.1 / 15.7 | 100.0%; 3.8 / 26.8; 72.4% |
| | | an uncertain ask elsewhere | 23,507 (16.8%) | 2.28 | 39.5 / 43.2 / 17.2 | **52.4%**; 11.7 / 70.6; 70.6% |
| | | could not (no card of the set) | 72,910 (52.0%) | 1.36 | 43.0 / 42.8 / 14.3 | — |

Two shapes before the rule. **Both bots recover the trail set best by the uncertain ask into it**
— 67.0% for Monet and 70.4% for SESTINA, from the strongest picture of any action (`cert6` 4.4 and
4.2: a trailer that can place four of the six and asks for one of the other two) — and both take
it rarely (3.1% and 4.4% of trail sets). And **Monet's asks elsewhere at a trail decision hit
100.0%, the uncertain ones included** (843 of 843 on `fs`, 790 of 790 on `base`, 304 of 304 at
home): "uncertain" is by the counterfactual's certain placement, and Monet leaves the take-back
only for a hit it is sure of by its own inference, keeping the turn. SESTINA's uncertain ask
elsewhere hits 52.4%.

**R2 — the legal take-back, taken against declined** (`fs`; the SE over the twelve cells).

| side | a take-back legal (share of trail sets) | taken | declined | recovered after taking (lost / open; `cert6`) | after declining (lost / open; `cert6`) | declining − taking | the declined: the ask elsewhere hit; into a led set / a majority; that set taken / lost / open |
|---|---|---|---|---|---|---|---|
| Monet | 26,493 (34.8%) | 20,813 (**78.6%**) | 5,680 (21.4%) | **58.3%** (38.2 / 3.5; 3.38) | **60.2%** (35.6 / 4.2; 3.62) | **+2.0** (SE 1.0) | 58.7%; 3.1 / 20.4; 44.8 / 12.4 / 1.5 |
| SESTINA | 67,326 (48.0%) | 26,321 (**39.1%**) | 41,005 (60.9%) | **57.5%** (38.9 / 3.7; 3.00) | **44.9%** (40.4 / 14.7; 2.59) | **−12.6** (SE 0.5) | 57.7%; 7.7 / 47.9; 60.5 / 21.7 / 2.7 |

The last column's denominator is every decline, as the pre-registration wrote it, and a decline is
either an uncertain ask into the set or an ask elsewhere; conditioned on the ask going elsewhere
(SESTINA's 34,857 of 41,005 declines; Monet's 3,334 of 5,680) SESTINA's ask hits **67.9%** (SE
0.4), goes into a set it holds four or more of 56.3% of the time and a set it leads 9.1%, and that
set is taken **71.2%** (SE 0.6); Monet's hits 100.0% and its set is taken 76.2%. On `base` the same
to a point: SESTINA takes 38.6% and recovers 56.8 against 45.6 (−11.2, SE 0.6), the ask elsewhere
hits 68.2% and its set is taken 70.8%; Monet takes 78.7% and recovers 58.7 against 59.2 (+0.5, SE
1.2). At home both stacks take 74–75% of their legal take-backs and recover 5–6 points less after
declining (one cell, no SE).

**The rule, applied.** On `fs`, SESTINA's side: **(a) is not met** — its recovery after declining
a legal take-back is 12.6 points under its recovery after taking it (SE 0.5), against a bar of 5;
**(b) is met** — the ask elsewhere hits 57.7% and its set is taken 60.5% on the pre-registered
denominator, 67.9% and 71.2% on the asks that went elsewhere. **The trailer's story is closed by
its rule: no trail term is built, and row 30 turns elsewhere.** The instrument and the record merge
on self-verification; the vector is untouched.

**What the read says, and a caution.** The 12.6 points split in a way the rule did not name:
**11.0 of them are the trail set left open** (14.7% after declining against 3.7% after taking, SE
0.4) and **1.6 are the set lost** (40.4 against 38.9, SE 0.6). An open set is one unresolved at
the clinch, and SESTINA's declines are asks into the sets it holds most of (56% of the asks that
went elsewhere into a four or more, taken 71% of the time): the decline marks the games SESTINA is
about to finish, not a set it gives up — the instrument did not record which side clinched, so
this is the reading of the split and not a measurement. The reading does not reopen the story,
because what a trail term would have Monet do is decline a certain hit that costs no tempo: a hit
keeps the turn, so the take-back and then the ask elsewhere is open to any trailer that wants
both, and Monet takes both — its "declines" are certain hits elsewhere with the take-back still
on the table, and its trail set is recovered as often either way (+2.0; −2.8, SE 1.4, on the asks
that went elsewhere). SESTINA's declines are two-thirds uncertain asks that end its turn half the
time with the take-back untaken, and its trail set is lost 1.6 points more for it. §3.8q's word on
the take-back stands — the take-back first recovers more than not for every trailer — and Monet
takes it. One fact is left for a later row that wants it: a take-back is legal at 34.8% of Monet's
trail sets and 48.0% of SESTINA's, so the deciding seat holds a card of the set a third of the time
for Monet and half for SESTINA — the shape of two cards at one seat against one at each of two,
and a take-back joins the public card to a seat that already holds one. The instrument did not
count seats, and whether the leader's chase is easier against a holding gathered at one seat is
not read here.

**Predictions, scored.** **Q1** two of seven ranges: Monet takes 78.6% of its legal take-backs
(78–82) and SESTINA recovers 57.5% after taking (54–62); Monet's take-backs are legal at 34.8% of
its trail sets (38–44 predicted) and its recoveries run ten points over the ranges (58.3 after
taking against 46–52, 60.2 after declining against 36–46); SESTINA takes 39.1% (40–46) and
recovers 44.9% after declining (46–56), the gap −12.6 outside the predicted "within 10, not within
5" — and (a) fails, the three-in-five side of the odds. **Q2** three of six, two more at the edge:
SESTINA's declined take-backs buy an ask that hits 57.7% (55–65) and goes into a set it leads or
holds a majority of 55.6% of the time (55–70), taken 60.5% (50–60, a half-point over); Monet's
declines are a fifth of its legal chances (21.4%), but the ask they buy hits 100%, not 45–55, and
its set is taken 44.8% by every decline (45–55, at the edge) and 76.2% by the asks elsewhere — the
prediction did not see that Monet leaves the take-back only for a certain hit. **Q3** missed both
ways: the trailer's `cert6` at a take-back is 0.2–0.3 of a card over an ask elsewhere for Monet
and 0.6–0.7 for SESTINA, not a card; and recovery after an uncertain ask into the set is the
**highest** of the actions for both bots, not the lowest — the ask is made from the strongest
picture, four of six placed. **Q4** held: twenty-five walks pinned at 100.0%, races EXACT, the
trail decisions and take-backs reconciled EXACT with §3.8q on every cell, no assertion.

### 3.8y Monet v0.26 — the five rung's dose above one: the completing ask credited before a certain hit elsewhere

**Decision row 30, taken 2026-09-07 under the owner's direction of 2026-09-06 — (f).** The closing
credit (`closing.ts`) pays `dose · wHit · p · lock` on the hit branch of an ask that would bring
the side's certain holding of a set within reach of the lock: `lock` is `1 − outstanding / 2`, so
0.5 at the four rung (one card outstanding after the hit) and 1 at the five rung (none). The
shipped `closingFour` 2 therefore pays `wHit · p` for the ask that makes a five, and the shipped
`closing` 0.5 pays `0.5 · wHit · p` for the ask that completes the set — half, one card from the
whole set, beside the base ranker's own `gambleBonus` on the completing ask. Against a bare certain
hit elsewhere, which scores `wHit` on its hit branch and keeps the turn, the completing ask at hit
chance p scores `p · wHit` plus the credit, the ranker's other terms aside: at `closing` 0.5 it
outranks the certain hit only when p exceeds two-thirds, at 1.0 one-half, at 2 one-third, at 3
one-quarter, at 4 one-fifth. §3.8v's ladder (0.25, 0.75, 1.0) read flat and the dose decided one
ask in five hundred at 0.25: it never left the region where the certain hit elsewhere comes first.
The four rung at its dose of 2 — the same credit, where the chase outranks a certain hit at p above
one-half — is the one term that has cleared §3.8n's bar (§3.8s, +0.94 at 2.18 SE); §3.8t put the
five-rung population at 7.2% of Monet's asks; §3.8p put 12.3% of Monet's openings unresolved at
the clinch against SESTINA's 5.4%. This rung reads the five rung's dose above one at home, in
duplicate pairs against the shipped stack, and takes the best eligible dose abroad under §3.8n. It
changes no code — `lib/` is untouched — and may change the shipped vector if a dose clears the bar,
which is the owner's call at review.

#### Pre-registration — written 2026-09-07, before any pair

**The arms.** The shipped stack S is v0.9 with `closing` 0.5 + `closingFour` 2 (`contest` 0.6 from
the registry). Four one-knob moves from S on the five rung's dose: **`closing` 2 / 3 / 4 / 6** (k2,
k3, k4, k6), the last the overdose that shows the shape, as `closingFour` 8 did in §3.8r.
`closingFour` stays 2 on every arm, so the four rung's credit is unchanged and the move is the five
rung's alone. No new knob, no new mechanism, nothing that was not already on the vector.

**The fit, at home.** `scripts/duplicate-pairs.mjs --a v0.9 --a-override <the move> --b v0.9
--b-override <S> --bank home-a --pairs 2400` an arm — 4,800 games, the paired set-difference with
the cell's own SD (§6.3), four arms at once. The control first, 400 pairs, S against S with every
dose spelled on both sides, required to print `0.0000 +/- 0.0000`. The markers on every eligible
arm, and on k6 whatever it reads: `scripts/attribute.mjs --home 2400 --home-start rotate --a v0.9
--a-knobs <the move> --b v0.9 --b-knobs contest=0.6,closing=0.5,closingFour=2 --cf v0.9 --cf-knobs
contest=0.6,closing=0.5,closingFour=2 --races --race42 --licences` — the move's disagreement with S
at A's own asks and what the two asks would hit, the sure-miss share, the chase share and hit rate
at lead decisions, the starter share of the even sets, and the five-rung share of A's asks (§3.8t's
count-0 bucket), beside B's.

**Eligibility and the choice, fixed now.** An arm is *eligible* for the bridge if (i) its home
paired mean is at least +2 SE and (ii) its sure-miss share at home is within 3 points of S's. **The
primary** is the eligible arm with the best home paired mean; a tie within one SE goes to the
smaller dose (the shipped point is the prior). **The secondary** is the next-best eligible dose. If
no arm is eligible the rung stops at home, row 31 says so, and `closing` 0.5 stands as fit where it
ships.

**The bridge read.** Twelve fresh seeds under the label `"monet-v0.26-confirm-12"` by §6.5's rule
(`$SP/seeds-v26.mjs`, spent set = v0.23's plus its twelve, drawn and never played), written here
before a cell is played: **6241922 3959635 2452588 2508194 3439903 6291055 9399884 5510112 7201121 3463860 5688060 4035624**.
The tree: this commit's `lib/` exported by `git archive` to `$SP/fishai-v26` and mounted read-only,
its commit and lib md5 recorded — **the lib md5 must equal v0.22's (d30542fb95df1f9834d6e4f1825ffc23),
since this rung changes no code; that equality makes §3.8u's identity cell this rung's identity
cell, and if it does not hold the identity cell is replayed before a number is read.** The arms:
the unchanged adapter (`bot.mjs` md5 c1fc7316…), `MONET_ARM` v0.4c, `MONET_MUSTFIX` 1,
`MONET_OVERRIDE` carrying `contest` 0.6 + `closing` 0.5 + `closingFour` 2 (the base: v0.20c's
vector) and, for the primary and the secondary, the same three keys with the moved `closing`.
**Pins before a number is read:** the in-engine pin of **every** cell — `--cf v0.9 --cf-knobs <the
arm's three doses>` at 100.0% of A's decisions; the races reconciled EXACT; the fourteen fault
counters zero; 36 cover files a cell, a short cell replayed IDENTICAL before it is read; at most
three containers at once. **The ship rule is §3.8n's, paired against v0.20c's vector on the
twelve:** the primary ships if its paired mean is at least two standard errors above zero and it is
ahead on a majority of the twelve; ±2.00 stays the rung and a term under it is marked as such; the
registry change (v0.26 = v0.20c with the moved dose) is a PR for the owner, stacked on #41 — if #41
is declined, this read still stands on v0.20c's vector and the record says what a re-base would
need. The secondary is reported beside the primary and cannot ship from this rung.

**Predictions, written before any pair.**

- **Q1 (home)** The dose response rises and turns: `closing` 2 reads +0.00 to +0.15 a pair, 3
  −0.05 to +0.15, 4 −0.15 to +0.10, 6 −0.40 to −0.05; the SD grows with the dose, from about 1.0 at
  2 to about 2.5 at 6, as the move changes more asks. Odds one in three that any arm is eligible;
  if one is, it is 2 or 3 and reads +0.08 to +0.20.
- **Q2 (markers at the primary, or at k6 if none is eligible)** The move disagrees with S at 1–4%
  of A's asks at 2 and 4–8% at 6; where they disagree the move's ask hits less than S's would (the
  completing ask taken over a certain hit); the sure-miss share within 2 points; the chase share at
  lead decisions within ±2; the five-rung share of A's asks up 0.5–2 points from about 7%; the
  starter share of the even sets within 2 points of the rotating control's.
- **Q3 (abroad)** The primary +0.0 to +0.5 paired against v0.20c's vector, SD 1.3–1.8, ahead on
  6–8 of 12; the bar cleared with odds one in five; the secondary in the same direction.
- **Q4** The checks hold: the lib md5 equal to v0.22's, every cell pinned at 100.0%, races EXACT,
  counters zero, cover files complete.

**What ships.** Nothing but the record merges on self-verification; the shipped vector changes only
by the owner's merge of a registry PR. **Cost** S — the control and four home arms (about a quarter
of an hour), the markers, 36 cells three wide (about twenty minutes) if an arm is eligible, the
walks, the record. **Scratch, not committed:** `$SP/monet-v26/` (`SEEDS`, `DOSES.json`,
`run-home.sh`, `home/`, `report-home.mjs`, `run-markers.sh`, `run-lanes.sh`, `run-race42-v26.sh`,
`report-v26.mjs`, `records/`, `out/`), `$SP/v26-{prereg,record}.md`.

#### Record — 2026-09-07 (the pre-registration committed before the first pair, the control and the four arms 03:37Z to 03:48Z, the markers 03:49Z to 03:55Z, read at once)

**The runs.** The pre-registration committed (a350617), the tree exported for the bridge
(`$SP/fishai-v26`, lib md5 **d30542fb95df1f9834d6e4f1825ffc23, equal to v0.22's**, so §3.8u's
identity cell is this rung's) and the six arm packages built (`$SP/arm_v26`), none played. At
home: the control first, 400 pairs, **`0.0000 +/- 0.0000`**; then the four arms against the
shipped stack in 2,400 duplicate pairs each, four at once, ten minutes; then the markers on the
overdose (as pre-registered) and on the smallest dose (for the shape), 2,400 rotating-start games
each against the stack. No cell went abroad; the twelve drawn under `"monet-v0.26-confirm-12"`
join the spent set unspent. Scratch: `$SP/monet-v26/{DOSES.json, run-home.sh, home/,
report-home.mjs, report-home.txt, run-markers.sh, report-markers.mjs, report-markers.txt,
smoke-markers.txt}`, `$SP/arm_v26`, `$SP/fishai-v26`.

**R1 — the home ladder** (`scripts/duplicate-pairs.mjs`, 2,400 pairs on `home-a` an arm, 4,800
games, the cell's own SD; points of win rate by §0.1's conversion, as §3.8v's table; a positive
number favours the move).

| arm | the move from the shipped point | paired set-diff a pair ± 1.96 SE (SD) | in points of win rate ± SE | verdict at 95% | eligible |
|---|---|---|---|---|---|
| control | the stack against itself, 400 pairs | **0.0000 ± 0.0000** (0.00) | 0 | — | — |
| k2 | `closing` 2 | **−0.007 ± 0.040** (1.00) | −0.05 ± 0.15 | inside | no |
| k3 | `closing` 3 | **−0.013 ± 0.044** (1.11) | −0.10 ± 0.17 | inside | no |
| k4 | `closing` 4 | **−0.012 ± 0.045** (1.12) | −0.09 ± 0.17 | inside | no |
| k6 | `closing` 6 | **−0.018 ± 0.045** (1.13) | −0.13 ± 0.17 | inside | no |

**Every dose above one reads the same: flat, a hundredth of a set a pair under zero, within one
SE; no arm is eligible.** From 0.25 (§3.8v) to 6 the five rung's dose moves the paired result by
less than ±0.02 sets a pair.

**R2 — the markers** (the move at A against the stack at B, the stack the counterfactual, 2,400
games each, the start rotating; `--races --race42 --licences`).

| readout | `closing` 2: A / B | `closing` 6: A / B |
|---|---|---|
| the move disagrees with the stack at A's asks (n; the stack's ask would hit / the move's hit) | **0.3%** (295; 68.8% / 42.0%) | **0.3%** (361; 66.8% / 44.3%) |
| asks a game; hit | 43.5; 58.6% / 43.1; 58.2% | 43.0; 58.7% / 43.0; 58.7% |
| own-locked asks (sure misses) | 8.2% / 8.2% | 7.8% / 7.7% |
| lead decisions a game | 9.13 / 8.96 | 9.13 / 9.01 |
| chase share at lead decisions; chase hit rate | 40.5%; 52.2% / 41.0%; 52.3% | 40.5%; 53.0% / 40.9%; 52.9% |
| the five-rung share of the asks (§3.8t's count-0 bucket, the certain way) | 8.7% / 8.4% | 8.7% / 8.5% |
| even sets: the race starter; the starter's conversion | 48.5%; 54.1% / 49.3%; 52.4% | 49.0%; 54.5% / 48.5%; 53.1% |
| A's win rate of the walk's 2,400 games | 53.2% | 49.0% |

**The dose changes one ask in three hundred, at 2 and at 6 alike**, and where it changes one it
takes a completing ask that hits 42–44% over the stack's ask that would have hit 67–69%. The
five-rung share of the asks rises a quarter of a point (8.4 → 8.7%); the sure-miss share, the
chase share and hit rate at lead decisions and the starter share of the even sets do not move
(the starter share within a point of the rotating control's 48.6%). The reason is the population:
an ask that would complete a set the side holds five of is, by the certain picture, almost always
a certain hit already first in the ranking, or an uncertain one the base ranker's `gambleBonus`
and `closing` 0.5 already put first; the dose above one reaches the residue — the completing ask
that is a poor bet against a likelier hit elsewhere — and that residue is a tenth of a percent of
the asks and a small loss where it is taken. (The two walks' A win rates, 53.2% and 49.0%, are the
walks' own noise at ±1 point; the pairs are the read.)

**Predictions, scored.** **Q1** two of four ranges — 3 and 4 inside; 2 at −0.007 against +0.00
to +0.15, 6 at −0.018 against −0.40 to −0.05, the overdose costing far less than predicted; the SD
1.00 at 2 as predicted and 1.13 at 6 against about 2.5; no arm eligible, the two-in-three side of
the odds. **Q2** four of six — where the move disagrees it hits less (42–44 against 67–69), the
sure-miss share within 2 points, the chase share within ±2, the starter share within 2 points of
the rotating control's; the disagreement share 0.3% against 1–4% at 2 and 4–8% at 6, and the
five-rung lift +0.3 against +0.5 to +2 — both an order of magnitude smaller than predicted, for
the reason above. **Q3** not reached. **Q4** the lib md5 equal to v0.22's, as required; the rest
not reached.

**The rule, applied.** No arm is eligible at home; **the rung stops, nothing goes abroad, and
`closing` 0.5 stands as fit where it ships** — the record merges on self-verification, the vector
is unchanged. **What the read says:** the closing family is now read at every rung and every dose
— the three rung costs at every dose (§3.8u), the four rung pays at 2 and not more (§3.8r, §3.8v),
the five rung is inert from 0.25 to 6 (§3.8v, here) — and the shipped point is its optimum one
axis at a time. The credit's form, `dose · wHit · p · lock`, has been pushed as far as a dose can
push it: the ordering it buys — the chase before the certain hit elsewhere — is bought at the four
rung, and at the five there is nothing left to buy. SESTINA's conversion of its leads (61% against
Monet's 49–52%, §3.8w) is not a dose of this credit away. Row 31 closes the family on its
diagonals, the one thing the one-at-a-time ladders have not read, and names the search for the
owner.

### 3.8z Monet v0.27 — the joint re-fit: the shipped doses moved two at a time, the family closed on its diagonals

**Decision row 31, taken 2026-09-07 under the owner's direction of 2026-09-06 — (j).** §3.8v
moved each shipped dose alone and found the shipped point a local optimum on every axis; §3.8y
pushed the five rung's dose to six and found it inert. One interaction has been measured: on
v0.9's vector the two closing rungs together read +0.301 a pair against +0.043 + 0.172 apart
(§3.8r), more than the sum, so the surface is not additive and a one-at-a-time ladder can miss a
diagonal. This rung reads four joint moves from the shipped point at home, in duplicate pairs
against the shipped stack, and takes the best eligible move abroad under §3.8n. It changes no
code — `lib/` is untouched — and may change the shipped vector if a move clears the bar, which is
the owner's call at review. It is the family's last dose rung: with it the closing credit and the
contest credit are read on every axis and on the diagonals the measured interaction points at.

#### Pre-registration — written 2026-09-07, before any pair

**The arms.** The shipped stack S is v0.9 with `closing` 0.5 + `closingFour` 2 (`contest` 0.6 from
the registry). Four two-knob moves from S: **`closing` 1 + `closingFour` 3** (up — both closing
rungs up, the direction the measured interaction favours), **`closing` 0.25 + `closingFour` 1**
(down — both rungs down), **`contest` 0.8 + `closingFour` 3** (c08f3 — more appetite for the
probable miss into a contested set with more chase credit), **`contest` 0.5 + `closing` 1** (c05k1
— a shade less contest with the five rung doubled). Every dose but `contest` 0.5 is one the
one-at-a-time ladders have read alone (§3.8v: `contest` 0.4 / 0.8 / 1.0, `closing` 0.25 / 0.75 /
1.0, `closingFour` 1 / 3; `contest` 0.5 is the midpoint of 0.4 and the shipped 0.6). No new knob,
no new mechanism.

**The fit, at home.** As §3.8y: `scripts/duplicate-pairs.mjs --a v0.9 --a-override <the move> --b
v0.9 --b-override <S> --bank home-a --pairs 2400` an arm — 4,800 games, the paired set-difference
with the cell's own SD (§6.3), four arms at once; the control first, 400 pairs, S against S with
every dose spelled on both sides, required to print `0.0000 +/- 0.0000`. The markers on every
eligible arm: `scripts/attribute.mjs --home 2400 --home-start rotate --a v0.9 --a-knobs <the
move> --b v0.9 --b-knobs contest=0.6,closing=0.5,closingFour=2 --cf v0.9 --cf-knobs
contest=0.6,closing=0.5,closingFour=2 --races --race42 --licences` — the move's disagreement with
S at A's asks and what the two asks would hit, the sure-miss share, the chase share and hit rate
at lead decisions, the starter share of the even sets, the four- and five-rung shares of the asks,
beside B's.

**Eligibility and the choice, fixed now.** An arm is *eligible* for the bridge if (i) its home
paired mean is at least +2 SE and (ii) its sure-miss share at home is within 3 points of S's. **The
primary** is the eligible arm with the best home paired mean; a tie within one SE goes to the
smaller move (the sum of the doses' distances from the shipped point in the ladders' steps). **The
secondary** is the next-best eligible arm. If no arm is eligible the rung stops at home, row 32
says so, and the family is closed at its shipped point on every axis and on the diagonals read.

**The bridge read.** Twelve fresh seeds under the label `"monet-v0.27-confirm-12"` by §6.5's rule
(`$SP/seeds-v27.mjs`, spent set = v0.26's plus its twelve, drawn and never played), written here
before a cell is played: **7196521 6332651 7026896 1518145 9339794 3395719 8076725 4914504 7254379 7472654 5631502 5124898**.
The tree: this commit's `lib/` exported by `git archive` to `$SP/fishai-v27` and mounted
read-only, its commit and lib md5 recorded — **the lib md5 must equal v0.22's
(d30542fb95df1f9834d6e4f1825ffc23), since this rung changes no code; that equality makes §3.8u's
identity cell this rung's, and if it does not hold the identity cell is replayed before a number is
read.** The arms as §3.8y's: the unchanged adapter (`bot.mjs` md5 c1fc7316…), `MONET_ARM` v0.4c,
`MONET_MUSTFIX` 1, `MONET_OVERRIDE` carrying the three doses (the base: v0.20c's vector; the
primary and the secondary: the moved pair). **Pins before a number is read:** the in-engine pin of
every cell (`--cf v0.9 --cf-knobs <the arm's three doses>` at 100.0% of A's decisions); the races
reconciled EXACT; the fourteen fault counters zero; 36 cover files a cell, a short cell replayed
IDENTICAL before it is read; at most three containers at once. **The ship rule is §3.8n's, paired
against v0.20c's vector on the twelve:** the primary ships if its paired mean is at least two
standard errors above zero and it is ahead on a majority of the twelve; ±2.00 stays the rung and a
term under it is marked as such; the registry change (v0.27 = v0.20c with the moved pair) is a PR
for the owner, stacked on #41 — if #41 is declined, this read still stands on v0.20c's vector and
the record says what a re-base would need. The secondary is reported beside the primary and cannot
ship from this rung.

**Predictions, written before any pair.**

- **Q1 (home)** up −0.05 to +0.15 a pair (the interaction's direction; SD 2.0–2.6); down −0.20 to
  0.00 (SD 2.0–2.6); c08f3 −0.30 to −0.05 (`contest` 0.8 alone read −0.135 and `closingFour` 3
  alone −0.036; SD 2.8–3.4); c05k1 −0.25 to +0.05 (SD 2.0–2.8). Odds one in four that any arm is
  eligible; if one is, it is up and reads +0.08 to +0.20.
- **Q2 (markers at the primary, or at up if none is eligible)** The move disagrees with S at 3–7%
  of A's asks; the sure-miss share within 3 points; the chase share at lead decisions up 2–5 points
  for up and down 2–5 for down; the starter share of the even sets within 2 points of the rotating
  control's 48.6%.
- **Q3 (abroad)** The primary +0.0 to +0.5 paired against v0.20c's vector, SD 1.3–1.8, ahead on
  6–8 of 12; the bar cleared with odds one in five; the secondary in the same direction.
- **Q4** The checks hold: the lib md5 equal to v0.22's, every cell pinned at 100.0%, races EXACT,
  counters zero, cover files complete.

**What ships.** Nothing but the record merges on self-verification; the shipped vector changes only
by the owner's merge of a registry PR. **Cost** S — the control and four home arms (about a quarter
of an hour), the markers, 36 cells three wide (about twenty minutes) if an arm is eligible, the
walks, the record. **Scratch, not committed:** `$SP/monet-v27/` (`SEEDS`, `DOSES.json`,
`run-home.sh`, `home/`, `report-home.mjs`, `run-markers.sh`, `report-markers.mjs`, and the bridge
scripts if an arm goes abroad), `$SP/v27-{prereg,record}.md`.

#### Record — 2026-09-07 (the pre-registration committed 04:03Z, the control and the four arms 04:03Z to 04:15Z, the markers 04:15Z to 04:21Z, read at once)

**The runs.** The pre-registration committed (48ff2a0); at home the control first, 400 pairs,
**`0.0000 +/- 0.0000`**; then the four joint moves against the shipped stack in 2,400 duplicate
pairs each, four at once, ten minutes; then the markers on `up`, the arm the pre-registration
named for the case that none is eligible, 2,400 rotating-start games against the stack. No tree
was exported and no arm built: no cell went abroad, and the twelve drawn under
`"monet-v0.27-confirm-12"` join the spent set unspent. Scratch: `$SP/monet-v27/{DOSES.json,
run-home.sh, home/, report-home.mjs, report-home.txt, run-markers.sh, report-markers.mjs,
report-markers.txt}`.

**R1 — the home ladder** (as §3.8v's table; a positive number favours the move; §3.8v's
one-at-a-time reads of the parts beside each, and their sum).

| arm | the move from the shipped point | paired set-diff a pair ± 1.96 SE (SD) | in points of win rate ± SE | verdict at 95% | the parts alone (§3.8v) → their sum | eligible |
|---|---|---|---|---|---|---|
| control | the stack against itself, 400 pairs | **0.0000 ± 0.0000** (0.00) | 0 | — | — | — |
| up | `closing` 1 + `closingFour` 3 | **−0.033 ± 0.077** (1.93) | −0.24 ± 0.30 | inside | +0.002, −0.036 → −0.034 | no |
| down | `closing` 0.25 + `closingFour` 1 | **−0.041 ± 0.097** (2.42) | −0.31 ± 0.37 | inside | +0.026, −0.051 → −0.025 | no |
| c08f3 | `contest` 0.8 + `closingFour` 3 | **−0.128 ± 0.111** (2.77) | −0.96 ± 0.42 | BEHIND, 2.3 × SE | −0.135, −0.036 → −0.171 | no |
| c05k1 | `contest` 0.5 + `closing` 1 | **−0.103 ± 0.098** (2.44) | −0.77 ± 0.37 | BEHIND, 2.1 × SE | `contest` 0.5 unread alone (0.4: −0.526); +0.002 | no |

**No joint move is eligible: the two closing-rung diagonals are flat, the two `contest` diagonals
lose at two SE, and every joint read is within one SE of the sum of its parts.** The surface is
additive at these steps from the shipped point. The interaction §3.8r measured on v0.9's vector —
the two closing rungs worth more together than apart, +0.301 against +0.043 + 0.172 — was the
credit's arrival on a vector that had none of it, not a slope the shipped point can still climb.
**The family is closed at its shipped point on every axis and on the diagonals read.**

**R2 — the markers on `up`** (2,400 games, the start rotating, the stack the counterfactual).

| readout | `closing` 1 + `closingFour` 3: A / B |
|---|---|
| the move disagrees with the stack at A's asks (n; the stack's ask would hit / the move's hit) | **1.1%** (1,132; 50.0% / **16.4%**) |
| asks a game; hit | 43.0; 58.4% / 43.3; 58.7% |
| own-locked asks (sure misses) | 8.2% / 8.0% |
| lead decisions a game | 8.90 / 9.06 |
| chase share at lead decisions; chase hit rate | 41.1%; 52.2% / 40.8%; 52.4% |
| the five-rung share of the asks | 8.6% / 8.6% |
| even sets: the race starter; the starter's conversion | 48.7%; 53.8% / 48.7%; 55.0% |
| A's win rate of the walk's 2,400 games | 48.5% |

The joint move changes one ask in ninety, and where it does it takes a chase that hits 16% over
the stack's ask that would have hit 50%: at `closingFour` 3 the four rung's credit is `1.5 · wHit
· p`, and a chase outranks a coin-flip ask elsewhere from p above a fifth. The chase share at lead
decisions rises a third of a point, not the 2–5 predicted — the extra credit buys few chases, and
poor ones.

**Predictions, scored.** **Q1** four of four ranges (up −0.033 in −0.05 to +0.15; down −0.041 in
−0.20 to 0.00; c08f3 −0.128 in −0.30 to −0.05; c05k1 −0.103 in −0.25 to +0.05); the SDs two of
four (down 2.42 and c05k1 2.44 inside; up 1.93 and c08f3 2.77 a hair under); no arm eligible, the
three-in-four side of the odds. **Q2** two of four — the sure-miss share within 3 and the starter
share within 2 of the rotating control's; the disagreement share 1.1% against 3–7% and the chase
share +0.3 against +2 to +5. **Q3** not reached. **Q4** not reached (nothing was exported; nothing
went abroad).

**The rule, applied.** No arm is eligible at home; **the rung stops, nothing goes abroad, and the
family is closed at its shipped point on every axis and on the diagonals read** — the record
merges on self-verification, the vector is unchanged. **What the ladder now says, in one place.**
The priced ask (§3.8d) and the closing credit (§3.8h, §3.8r) are the two terms on the shipped
vector; their doses have been read alone (§3.8v, §3.8y), together (here) and at the rung below
(§3.8u): `contest` peaks at 0.6 and loses on either side, the four rung pays at 2 and not more, the
five rung is inert from 0.25 to 6, the three rung costs at every dose, and the diagonals are the
sums of their parts. **v0.20c — `closing` 0.5 + `closingFour` 2 on v0.9's vector, +0.94 at 2.18 SE
on twelve fresh seeds (§3.8s), registry PR #41 — is the family's optimum and the ladder's shipped
point.** What the records say SESTINA has that no dose buys is the conversion of the leads it
takes (61% against 49–52%, §3.8w), which the picture (§3.8w), the pace dose (§3.8r–§3.8v), the
trailer's take-back (§3.8x) and the completing ask (§3.8y) do not explain. Row 32 hands the
direction to the owner.

### 3.8aa Monet v0.28 — the search re-scoped: compute unconstrained, the marker read against the deals

**Decision row 33, taken 2026-09-07 under the owner's direction of the same day.** The owner's
message, in full: *"what's next? Know that I don't care about any cost of compute, the only thing
I care about is to develop the greatest fish playing game engine ever."* Two things change with
it. §3.8a's cost rule — 100 ms an ask, the budget that rejected every wider or deeper form before
its win rate was read — is lifted: cost is reported beside every cell and gates nothing. And row
32's (s) is taken: the search arm on the shipped vector, which is the one lever on the record
whose failure was measured as a *budget* failure and not a mechanism failure. §3.8a's marker said
what the search lacked at eight deals: a per-decision signal a twentieth of its noise, "of the
order of 350 deals" to resolve it, and "a different candidate generator". This rung buys the
deals, adds the generator, and reads the marker at each rung of deals before a pair is played.

**What the record says the search is for.** SESTINA searches (twelve deals, four candidates,
depth twelve) where Monet ranks one ply, and what SESTINA has that no dose buys is the conversion
of the leads it takes — 61% against 49–52% (§3.8w), a chase now against the take-back and the
re-take that follow it. That is a lookahead's kind of thing. The closing/contest family is closed
at its optimum on every axis and diagonal (§3.8v, §3.8y, §3.8z); the ranker's surface has no
term left that a dose can buy. The search is the next term.

#### Pre-registration — written 2026-09-07, before any probe game is read

**The arm.** §3.8a's mechanism unchanged: D determinizations from the marginal (§3.4a's table,
`sampleDeal`), each candidate played on each deal and rolled out S actions with the fast policy at
every seat, paired by the rollout seed, the best mean playing only if `mean − z · SE > 0`. What is
fixed for this rung: **the rollout policy and the searching seat's policy are the shipped stack S**
(v0.9 with `closing` 0.5 + `closingFour` 2, `contest` 0.6 from the registry — spelled by
`--override` / `MONET_OVERRIDE` everywhere, since v0.20c is PR #41's and not a version); **the
lock-only leaf** (`leafLock` 1, `leafCard` 0 — *a locked set is a set*, §3.8a's post-hoc form,
pre-registered here as the form; no other leaf is read); **the LCB guard at z 1**; **S 24**. The
one new mechanism is a second candidate generator, the knob **`candMode`** in `SearchParams`:
`'top'` is §3.8a's list — the pick, then the ranker's top C less the pick — and the default, so
every existing caller is unchanged; **`'sets'`** is the pick, then the best-ranked ask into each
other half-suit the seat can ask into, in the ranking's order, up to C — every set the seat could
chase or take back is on the table once, so the lead's chase-or-take-back choice is searched even
where the ranker's top C all sit in one set. C is **4** for `'top'` (SESTINA's number) and **9**
for `'sets'` (one per half-suit at most). `SearchInfo` carries the searched list (`cands`), and the
instruments take `--override` (`scripts/probe-search.mjs`, `scripts/bench-decide.mjs`, composed as
`duplicate-pairs.mjs`'s `withOverride`). `/play` is untouched, the bots directory is untouched,
and `tests/bots/search.test.ts` pins `'sets'` (the pick first, one legal ask per half-suit, the
list reported) and the default.

**M1 — cost, read before this text (an instrument check, not a read of the arm).** On the bench
machine (AMD Ryzen 9 9900X, Node v24.19.0, one process), `scripts/bench-decide.mjs --version v0.9
--override <S> --search …`, the lock-only leaf, S 24:

| form | ms a searched ask | s a mirror game |
|---|---|---|
| D 8 · C 3 (§3.8a's size) | 96 | 8.7 |
| D 32 · C 4 | 586 | 43 |
| D 128 · C 4 | 2,192 | 205 |

Linear in D · C · S at about 0.15 ms a rollout step; D 512 · C 4 is read in M2 and costed there
(expected 8.8 s an ask, 14 minutes a mirror game). `'sets'` costs its candidate count, 1.2–1.5× of
`'top'` at the same D.

**M2 — the marker against the deals, the rung's primary read at home.** `scripts/probe-search.mjs
--version v0.9 --override <S> --search <form>`: mirror games with the search at every seat, and
every searched decision scored by a paired rollout of the pick and of what was played from the
*true* state (§3.8a's marker). Six cells, every one the lock-only leaf, z 1, S 24, run twenty
processes wide under disjoint labels (`v28-<cell>-<k>`, the label seeding the games) and pooled
by decisions (`$SP/monet-v28/pool-probe.mjs`; means weighted by n, the SE from the cells' own SDs):

| cell | candidates | D | games |
|---|---|---|---|
| t8 | `'top'`, C 4 | 8 | 100 |
| t32 | `'top'`, C 4 | 32 | 100 |
| t128 | `'top'`, C 4 | 128 | 80 |
| t512 | `'top'`, C 4 | 512 | 40 |
| s32 | `'sets'`, C 9 | 32 | 100 |
| s128 | `'sets'`, C 9 | 128 | 80 |

Read per cell: the played share of searched decisions; **the marker** (the true paired advantage
of the played candidate over the pick, per played decision); **the yield** — the marker times the
played share, the true gain per *searched* decision, which is the number a game feels and the
statistic that orders the cells; the best-mean candidate's true advantage on every searched
decision and the held-back set's; the true hit rates of pick and played; and the split by whether
the pick was a certain hit (its p 1 in the ranking) — where the search leaves a certain hit for a
chase, the decision §3.8w and §3.8x say SESTINA makes and Monet does not.

**M3 — duplicate pairs at home, the number itself.** `scripts/duplicate-pairs.mjs --a v0.9
--a-override <S> --a-search <form> --b v0.9 --b-override <S>`, 2,400 pairs a cell in twenty banks
(`v28-<k>`, 120 pairs each, pooled by pairs with the cells' own SDs, §6.3), the control first (S
against S, no search, 400 pairs, required to print `0.0000 +/- 0.0000`). **Which cells, fixed
now:** the first block is t32 and s32 (both, at once); the second block is the mode with the
better M2 yield at D 128 (a tie within one SE goes to `'top'`) at **the largest D in {128, 512}
whose M2 yield exceeds the next-smaller D's by at least one SE — if neither does, the second block
is not played and D 32 is the rung's size.** Eligibility for the bridge: the home paired mean at
least +2 SE above zero, and the cell's true hit rate of what played (M2) within 5 points of the
pick's. The primary is the eligible cell with the best home paired mean; a tie within one SE goes
to the cheaper cell.

**M4 — the bridge, the ship rule.** Twelve fresh seeds under the label `"monet-v0.28-confirm-12"`
by §6.5's rule (`$SP/seeds-v28.mjs`; the spent set v0.27's plus its twelve, drawn and never
played), written here before a cell is played: **9530470 8775043 5318699 2942726 6746805 8325339
8220040 4027070 8085724 3978858 8632114 1600170**. The tree: this rung's `lib/` exported by `git
archive` to `$SP/fishai-v28`, mounted read-only, its commit and lib md5 recorded — the md5 differs
from v0.22's because `search.ts` changed, so **the identity cell at 90210 is replayed and must read
IDENTICAL to §3.8u's before a number is read** (the fast policy is untouched by this rung; a
difference is a defect, not a finding). The arms: the unchanged adapter (`bot.mjs` md5 c1fc7316…,
`MONET_SEARCH` → `decideSearch` at every ask, the missing `candMode` key taking the default),
`MONET_ARM` v0.4c, `MONET_MUSTFIX` 1, `MONET_OVERRIDE` the three doses on both sides, the primary
carrying its `MONET_SEARCH`. **Pins before a number is read:** the in-engine pin at 100.0% of A's
decisions (`--cf v0.9 --cf-knobs contest=0.6,closing=0.5,closingFour=2` on the base; on the arm
the pin is the adapter's own counter of searched asks against its asks, 100.0%), the races
reconciled EXACT, the fourteen fault counters zero, 36 cover files a cell, a short cell replayed
IDENTICAL. The bridge's recorded limit (nine search containers ran a bot out of memory, §3.8a) is
met by capping every bot's heap (`--max-old-space-size` 1024 on the arm's node command) and
running at most six containers at once; the wall clock is reported beside the cell — at D 32 the
primary is of the order of 100 CPU-hours (14,400 games × 43 asks × 0.59 s) and at D 128 four
times that, which under the owner's direction is run and not argued with. **The ship rule is
§3.8n's, paired against v0.20c's vector on the twelve:** the primary ships if its paired mean is
at least two standard errors above zero and it is ahead on a majority of the twelve; ±2.00 stays
the rung and a term under it is marked as such; the registry change is a PR for the owner,
stacked on #41 (the search arm becomes a version's `search` field, or stays an adapter-level arm —
the owner's call at review, since it is the first term that would put a search on `/play`'s cost
line).

**Predictions, written before any probe game.**

- **Q1 (cost)** as M1; D 512 · C 4 at 8–10 s an ask; `'sets'` 1.2–1.5× `'top'` at the same D.
- **Q2 (M2)** t8: the marker +0.02 to +0.06 (§3.8a's +0.043 on v0.4c's vector), 12–17% of
  searched decisions played, the yield +0.003 to +0.010 a searched decision. **The rung's
  question is whether the yield grows with D:** t128's yield at least twice t8's and t32's above
  t8's by one SE (odds 60%); the alternative — the yield flat within one SE from 32 to 512 — means
  the marginal's deals and the rollout leaf cap the search, not the deal count (odds 40%), and
  the rung's finding is that the leaf must change (v0.29 below). The played share rises with D
  (t128 20–35%); the held-back set's true advantage is ≤ 0 at every D (the guard holds back the
  right things, as at §3.8a); the best-mean candidate's true advantage over *all* searched
  decisions turns positive by D 128. **s32 against t32 and s128 against t128:** the yield at least
  equal, and the played decisions more often at a certain pick (10–25% of `'sets'`' played
  against under 10% of `'top'`'s — the take-back left for a chase); the true hit rate of what
  played 2–6 points under the pick's in every cell (§3.8a traded two to five).
- **Q3 (M3)** t32 +0.05 to +0.25 a pair (0.4–1.9 points of win rate), SD 2.4–3.2; s32 within
  0.10 of t32; the second block, if played, +0.10 to +0.40 (0.75–3.0 points). Eligible (≥ +2 SE,
  ≥ +0.12 at 2,400 pairs): odds 50% for a D 32 cell, 65% for the second block.
- **Q4 (M4)** the primary +0.5 to +2.0 points on the twelve, paired; clears §3.8n's bar with
  odds 45%; the arm's wall clock at the bridge within 1.5× of M1's projection.

**What follows this rung, under the direction (the plan the owner asked for).** Whatever v0.28
reads, the search is now the line's mechanism and the fast policy its rollout and its candidate
generator. **v0.29 — a learned leaf**: a value function fitted on self-play of S (the public state
and the viewer's belief features → the expected set differential at the end), replacing the
rollout at the horizon; a leaf of microseconds makes thousands of deals an ask affordable where a
rollout makes hundreds, and takes the rollout policy's noise out of the leaf — §3.8a's "a leaf
that is not a rollout". **v0.30 — expert iteration**: the search's choices as the targets the fast
ranker is re-fitted to, then the search over the better ranker, repeated while §3.9's number
moves. **The belief sampler** after that: a joint sampler carrying the licence and the choice
likelihoods (§3.8g–§3.8l closed the *marginal* belief axis; the search's deals are its consumer,
and a determinization is where a joint matters). §3.9's acceptance test is run at every step that
ships; ±2.00 stays the rung. Every read is pre-registered as this one is; the owner may stop,
reverse or redirect any of it.

The files: `$SP/monet-v28/{run-probe.sh, pool-probe.mjs, run-pairs.sh, pool-pairs.mjs, seeds.txt}`,
`$SP/seeds-v28.mjs`, `$SP/v28-{prereg,record}.md`.

#### Record — M1 to M4, 2026-09-07 to 2026-09-08 (the cost, the marker against the deals, the pairs at home, the bridge)

**M1 — cost** (`scripts/bench-decide.mjs --version v0.9 --override <S> --search …`, one process, this
machine): D 8 · C 3 96 ms a searched ask (8.7 s a mirror game); D 32 · C 4 586 ms (43 s); D 128 · C 4
2,192 ms (205 s); read from the probe's own clock at twenty processes wide (the per-process speed
about 1.5× slower than alone), D 512 · C 4 about 9 s an ask (1,174 s a game) and `'sets'` 1.25× of
`'top'` at the same D (s32 102 s a game against t32's 81; s128 456 against 358). Q1 as predicted.

**M2 — the marker against the deals.** 120 processes, 500 mirror games, 42,220 searched decisions,
`$SP/monet-v28/probe/`, pooled by `pool-probe.mjs` (`probe-pooled.md`):

| cell | games; s a game | searched | played (share) | the arm's belief | **the marker** (true adv. of the played) | **the yield** (per searched decision) | best-mean's true adv., all searched | held back: n; true adv. | true hit: pick → played | certain pick: played (share); true adv. | uncertain pick: played (share); true adv. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| t8 | 100; 19 | 8,545 | 1,363 (16.0%) | +0.387 | **+0.021** (SE 0.019) | **+0.0034** (SE 0.0030) | −0.025 (SE 0.012) | 2,194; −0.054 (SE 0.015) | 60.8% → 58.4% | 198 (6.9%); +0.076 (SE 0.046) | 1,165 (20.5%); +0.012 (SE 0.021) |
| t32 | 100; 81 | 8,799 | 2,064 (23.5%) | +0.194 | **+0.046** (SE 0.015) | **+0.0108** (SE 0.0034) | +0.013 (SE 0.010) | 2,007; −0.020 (SE 0.014) | 60.4% → 56.9% | 255 (8.6%); +0.165 (SE 0.044) | 1,809 (31.0%); +0.029 (SE 0.015) |
| t128 | 80; 358 | 6,903 | 2,091 (30.3%) | +0.125 | **+0.023** (SE 0.014) | **+0.0069** (SE 0.0042) | +0.004 (SE 0.011) | 1,166; −0.031 (SE 0.017) | 60.1% → 55.8% | 221 (10.1%); +0.104 (SE 0.043) | 1,870 (39.7%); +0.014 (SE 0.015) |
| t512 | 40; 1,174 | 3,332 | 1,155 (34.7%) | +0.083 | **+0.004** (SE 0.017) | **+0.0015** (SE 0.0059) | −0.009 (SE 0.014) | 436; −0.046 (SE 0.028) | 61.0% → 55.9% | 128 (12.1%); +0.070 (SE 0.051) | 1,027 (45.1%); −0.004 (SE 0.018) |
| s32 | 100; 102 | 8,078 | 1,486 (18.4%) | +0.168 | **+0.041** (SE 0.015) | **+0.0076** (SE 0.0027) | +0.002 (SE 0.011) | 1,290; −0.043 (SE 0.015) | 62.1% → 57.5% | 273 (9.8%); +0.139 (SE 0.038) | 1,213 (22.9%); +0.019 (SE 0.016) |
| **s128** | 80; 456 | 6,563 | 1,558 (23.7%) | +0.119 | **+0.082** (SE 0.013) | **+0.0195** (SE 0.0030) | **+0.053** (SE 0.010) | 755; −0.007 (SE 0.018) | 61.1% → 54.9% | 335 (14.9%); +0.125 (SE 0.029) | 1,223 (28.4%); +0.070 (SE 0.014) |

**What the deals buy, and for which generator.** With the ranker's own top four (`'top'`) the yield
rises from eight deals to thirty-two (+0.0034 → +0.0108, 1.6 SE) and then falls — +0.0069 at 128,
+0.0015 at 512 — while the played share keeps rising (16% → 35%): more deals let more candidates
clear the guard, and what they let through is worth less each time, the arm's own belief shrinking
toward the truth (+0.39 → +0.08) as the marker shrinks with it. That is not the optimiser's curse
(the curse fades with deals); it is the belief. As D grows the search's estimate converges to the
value under the *determinized* belief, and where that belief differs from the deal the candidate
it prefers is not better on the true state. For the ranker's own alternatives — asks in the sets
the ranker already likes, the differences among them mostly *which seat holds the card* — the
marginal's deals are the limit, and thirty-two of them is as many as help. With one ask per
half-suit (`'sets'`) the picture is the other way: worse than `'top'` at thirty-two (+0.0076
against +0.0108, the wider list unresolved at that depth — nine candidates need more deals than
four) and **the best cell of the grid at 128: the marker +0.082 (SE 0.013), the yield +0.0195
(SE 0.0030) — 2.6× s32's (3.0 SE), 1.8× t32's (1.9 SE), 2.8× t128's (2.4 SE)** — and the only cell
where the best-mean candidate is better than the pick over *every* searched decision (+0.053, SE
0.010: the search's choice beats the ranker's before the guard is applied at all), and where the
held-back set is worth about zero (−0.007): the guard is no longer throwing away good moves. The
split says where the value is: at s128 the search leaves a *certain hit* on 14.9% of the decisions
where the pick was one (6.9–12.1% in the `'top'` cells) and those moves are worth +0.125 a decision;
at an uncertain pick it changes 28.4% of decisions for +0.070 — against +0.014 to +0.029 for `'top'`
at any D. The set the ranker would not have asked into is what a chase-or-take-back search is for,
and it is the set that pays. Q2 as written: t32 above t8 by one SE (yes, 1.6); "t128's yield at
least twice t8's" (yes, 2.0×, but not by the route predicted — it is t32 that carries it and t128 is
lower); the held-back set ≤ 0 at every D (yes); the best-mean over all searched positive by D 128
(for `'sets'`, yes at 5 SE; for `'top'` no); `'sets'` at least `'top'`'s yield (no at 32, yes at 128
by 2.4 SE); more played decisions at a certain pick for `'sets'` (yes: 9.8% and 14.9% against 6.9–12.1%);
the played hit rate 2–6 points under the pick's (yes: 2.4 to 6.2). **The 60% branch — the yield grows
with the deals — held for the generator that puts every set on the table, and the 40% branch — the
marginal's deals cap the search — held for the ranker's own list.** Both are on the record; the
learned leaf (v0.29) is still the next term, since even s128's marker is a tenth of the arm's
belief in it and the leaf is a rollout.

**The rule, applied.** M3's second block is `'sets'` (the better yield at D 128, by 2.4 SE) at
**D 128** (D 512 was read for `'top'` only; the grid carried no s512 cell, so 128 is the largest D
the rule can name for `'sets'`). The blocks are played in the other order for the wall clock — s128
first (16 banks of 150 pairs, the long cell), t32 and s32 after (10 banks of 240 each) — both in
full; the order changes no read. The bridge: the base's twelve cells on the v0.28 tree are played
(40.63%, SD 1.73; 36 covers a cell, 0 faults; the identity cell at 6269924 IDENTICAL to §3.8l's,
40.75%), t32's lanes were started before its home read and s128's queue behind them — their cells
are read only for a cell the home read makes eligible, and the wall clock is what it is: a t32 cell
is about 20 s a game on the VM (6 games in flight, 1,200 games a seed ≈ 1.1 hours a container,
two containers at 6–7 GiB each — the memory limit that put nine uncapped containers out of memory
in §3.8a is 18 processes a container at 350 MB), an s128 cell about five times that.

**M3 — duplicate pairs at home, 2026-09-08.** The control first (S against S, no search, four banks of
100): `0.0000 +/- 0.0000` on every bank. The second block, played first for the wall clock — **s128**,
the cell M2 named, 2,400 pairs in sixteen banks of 150 (`pairs/s128-*.txt`, `pairs-pooled.md`):

| arm | pairs | paired set-diff a pair ± 1.96 SE (SD) | points of win rate ± SE | × SE | banks ahead / behind |
|---|---|---|---|---|---|
| control | 400 | **+0.000 ± 0.000** (0.00) | +0.00 ± 0.00 | 0 | — |
| **s128** | 2,400 | **−0.333 ± 0.144** (3.60) | **−2.48 ± 0.55** | **−4.5** | 3 / 13 |

**The best cell of the marker grid loses at home by two and a half points at four and a half standard
errors.** Not eligible; nothing from s128 goes abroad, and the lanes queued for it were stopped
before a cell was played. Q3 as written for the second block (+0.10 to +0.40, eligible at 65%): the
sign is wrong. The per-decision arithmetic: s128 changes 22.7% of its searched asks, about nine a
game a side, eighteen a pair — **−0.019 of a set per changed decision in the game, against +0.082
sets-and-locks per changed decision at the arm's own horizon on the true deal.**

**The diagnosis, run before the first block (post-hoc, and marked so).** Two readings the
pre-registration did not name, because the marker was supposed to be the answer:

*(a) The horizon.* `scripts/probe-horizon.mjs` (new): the same mirror games and the same paired
true-state rollout of the pick and of what was played, but carried to the **end of the game** and
read on the way — the arm's own lock-only value after 24, 48 and 96 further actions, the set
differential alone at the same horizons, and the final set differential. 144 games, 2,642 played
decisions (`horizon/`, `horizon-pooled.md`):

| set | n | lock 24 | lock 48 | lock 96 | sets 24 | sets 48 | sets 96 | **the game's end** |
|---|---|---|---|---|---|---|---|---|
| played | 2,642 | +0.064 (0.010) | +0.040 (0.014) | +0.089 (0.022) | +0.038 (0.009) | +0.001 (0.013) | +0.052 (0.020) | **+0.061 (0.053)** |
| best-mean, all searched | 3,860 | +0.037 (0.008) | +0.039 (0.012) | +0.069 (0.018) | +0.014 (0.007) | −0.006 (0.010) | +0.027 (0.017) | +0.007 (0.044) |
| held back | 1,218 | −0.023 (0.015) | +0.035 (0.021) | +0.026 (0.033) | −0.038 (0.012) | −0.023 (0.018) | −0.029 (0.030) | −0.107 (0.079) |

The advantage the leaf sees at 24 actions does not decay: on the same trajectories it is +0.09 at
96 actions in the leaf's units, +0.05 in sets alone, and **+0.06 (SE 0.05) at the end of the game**.
The held-back set ends −0.11: the guard was right about those. So the leaf is not myopic under the
continuation the rollout assumes — **the fast policy at every seat after the one searched move.**
That is the marker's setting, and it is not the pairs' setting: in the pairs every decision of the
searching side is a searched decision, the teammates' included. A move that is worth +0.06 when the
fast policy plays on from it is worth −0.02 when the search plays on from it. The rollouts price
each move against a future the search then does not play — the take-back the rollout assumed the
fast policy would collect next turn is deferred again by the next search, and again — and three
seats each improving on the fast policy's continuation are not a team improving on the fast policy.
This is the known failure of a one-move improvement over a rollout policy that is not the policy
actually played; it is not the belief and it is not the deal count.

*(b) The sparse search* (`scripts/duplicate-pairs.mjs --a-search-prob p`, new: a decision is searched
only when a uniform from its own seed is below p): s128's form at p 0.2, 2,400 pairs in twelve
banks — the search's moves one at a time in a game the fast policy otherwise plays, which is the
marker's setting, against the dense form above. Written before the read: **if the sparse form reads
ahead per changed decision where the dense form reads behind, the interaction is the cause and
v0.29 is a search whose rollout policy is the policy it plays (the search distilled into the fast
policy, then searched over again — expert iteration); if the sparse form also reads behind, the
end-of-game reading above is the noise it looks like and the leaf is the limit (the learned leaf).**

**The sparse form, read (diagnosis b).** s128's form searching a fifth of its decisions, 2,400 pairs
in twelve banks of 200 (`pairs/s128p02-*.txt`):

| arm | pairs | paired set-diff a pair ± 1.96 SE (SD) | points of win rate ± SE | × SE | banks ahead / behind | per changed decision (SE) |
|---|---|---|---|---|---|---|
| s128, every decision searched | 2,400 | −0.333 ± 0.144 (3.60) | −2.48 ± 0.55 | −4.5 | 3 / 13 | −0.019 (0.004) |
| s128, one decision in five | 2,400 | **−0.040 ± 0.127** (3.17) | −0.29 ± 0.48 | −0.6 | 6 / 6 | **−0.011 (0.018)** |

(The per-decision arithmetic from the probe's rates — 22.7% of searched decisions changed, about
eighteen changed decisions a pair when every decision is searched and 3.6 when one in five is;
`duplicate-pairs.mjs` counts them itself from v0.29 on.) Neither branch of the rule written above
is clean: the sparse form is not ahead, and it is not behind either. A searched move played alone
in a game the fast policy otherwise plays is worth **about nothing** in sets by the game's end
(−0.011, SE 0.018; the horizon probe's +0.061, SE 0.053, is the same number at a third of the
precision) where the leaf credited it +0.082 at 24 actions; played with the others it is worth
−0.019 (SE 0.004). Whatever part of the dense loss is the interaction — and the sparse read cannot
resolve a difference of 0.008 at an SE of 0.018 — **the leaf's +0.082 is not in the game at all.**
A lock at 24 actions is not a set: the holding team must still prove it, the fast policy's
declares and its opponents' asks between the horizon and the end move what the count called
settled, and the ask that bought the lock also told the table something. The marker measured the
leaf's units on the true deal, precisely; the leaf's units are not the game's. **The leaf is the
limit, and the objective is the game's end** — v0.29 (§3.8ab).

**M4 — the bridge, t32 (played ahead of its home read; final now that the first block is in, above).** The identity cell at 90210 IDENTICAL to §3.8u's (40.75%); the base's twelve fresh cells
40.63% (SD 1.73), 36 cover files and 0 faults each; t32 under per-lane arm ids (below), twelve
cells, 36 covers and 0 faults each, the in-engine pin `searchRun / asks` 96.4% (the 3.6% are ask
decisions with fewer than two candidates — one legal set — which the search cannot search) and
`searchPlayed / searchRun` 24.3% (the probe's 23.5%):

| seed | base | t32 | t32 − base |
|---|---|---|---|
| 9530470 | 42.25 | 36.75 | −5.50 |
| 8775043 | 37.83 | 39.58 | +1.75 |
| 5318699 | 40.50 | 38.17 | −2.33 |
| 2942726 | 40.08 | 34.75 | −5.33 |
| 6746805 | 37.92 | 40.83 | +2.92 |
| 8325339 | 42.17 | 39.83 | −2.33 |
| 8220040 | 43.75 | 39.42 | −4.33 |
| 4027070 | 40.67 | 40.08 | −0.58 |
| 8085724 | 39.58 | 39.92 | +0.33 |
| 3978858 | 40.17 | 37.83 | −2.33 |
| 8632114 | 41.67 | 39.92 | −1.75 |
| 1600170 | 41.00 | 41.17 | +0.17 |
| **pooled (12)** | **40.63** | **39.02** | **−1.61** (SD 2.66, SE 0.77, **−2.10 × SE**; ahead 4 / behind 8) |

Ask accuracy 53.49 against the base's 54.65 (SESTINA's 56.18 against 56.79): the search trades
hits for chases abroad as at home, and abroad the chases do not pay either. The wall clock: a t32
cell about 1.1 hours a container at six games in flight (about 20 s a game), two containers at
6–7 GiB each; s128's lanes were queued behind t32's and stopped before a game was played when its
home read came in (two stubs, `never-played/`). About 30 container-hours were spent on a cell the
rule did not need — the price of running the bridge ahead of the home read for the wall clock,
paid once and not again: v0.29's bridge waits for its home read.

**A fault of the bridge, found and fixed on the way.** Two containers of the SAME arm id share the
arm's stage directory, its `bot.log` and its install directory under the fishlab mount, so two
concurrent t32 cells mixed their cover files (66 and 3 instead of 36 and 36) and their pin
counters. Play was unaffected — the four affected cells were set aside (`invalid-shared-stage/`)
and replayed IDENTICAL under the fix — and the fix is the one v0.17's lanes used: every lane its
own arm id (`monet-v28-<arm>-l<k>`, `mkarm-v28-lanes.mjs`, `run-lanes-v28.sh` as N workers each
playing every N-th seed). Recorded because it will bite again the day two containers of one arm
run at once without it. The host's other limit, for the record: 31 GB carries sixteen pair
processes beside two containers with 0.3–1.5 GB free and no paging; a third container does not fit.

**The first block, read (2026-09-08, after v0.29's and v0.30's cells had taken the machine).** `'top'` at
D 32 — the form the bridge had already played — and `'sets'` at D 32, ten banks of 240 pairs each
(`pairs/t32-*.txt`, `pairs/s32-*.txt`), the control `0.0000 +/- 0.0000` on all four of its banks:

| arm | banks; pairs | paired set-diff a pair ± 1.96 SE (SD) | points of win rate ± SE | × SE | banks ahead / behind |
|---|---|---|---|---|---|
| **t32** | 10; 2,400 | **+0.248 ± 0.144** (3.59) | **+1.85 ± 0.55** | **+3.4** | 9 / 1 |
| s32 | 10; 2,400 | **−0.191 ± 0.140** (3.49) | **−1.43 ± 0.53** | **−2.7** | 1 / 9 — the first two banks read −0.077 ± 0.319 on the record's first draft; the other eight landed 2026-09-08 afternoon |

**t32 is eligible at home — +0.248 a pair, +1.85 points, three and a half standard errors, nine banks
of ten — and it is the form that read −1.61 ± 0.77 abroad (−2.1 SE, four seeds of twelve).** So the
bridge cell the rule needed was played after all, and the rule's answer is the one above: t32 does
not clear §3.8n's bar. The pair of reads says what M3's sparse form said, from the other side. At
home the searching side plays against S — the stack itself, whose belief the determinized deals are
drawn from and whose play the rollouts assume at every other seat — and there its moves are worth
+1.85 points. Abroad every rollout still assumes the opponents play as S does, and SESTINA does not:
the search optimises against the wrong model of its opponents, and the +3.4 SE it earns at home
against the right one is what that model is worth. §3.8ac's M4 is the one-variable test of exactly
this — the same t32 form, the same twelve seeds, the clone of SESTINA at the opponents' seats of its
rollouts.

**s32, read on its ten banks (2026-09-08 afternoon, the eight that had queued behind v0.30's lanes).**
The wider generator at the same thirty-two deals loses at home: −0.191 ± 0.140 a pair, −1.43 points,
2.7 standard errors, one bank of ten ahead — 0.44 below t32, where the pre-registration wrote "within
0.10". Its marker said so (+0.0076 a searched decision against t32's +0.0108, M2): nine candidates
need more deals than four to be told apart, and at thirty-two the list is not resolved — the search
plays a candidate the belief ranked below the pick on the strength of noise. The `'sets'` generator
earns its yield at D 128 (M2's s128 +0.0223), and there it costs 456 s a game.

**Q1–Q4, as written.** Q1 (cost): as predicted — D 512 · C 4 at 8.8 s an ask (predicted 8–10),
`'sets'` at 1.25× (predicted 1.2–1.5×). Q2 (M2): the 60% branch held for `'sets'` and the 40%
branch for `'top'` (the yield grows with D under the generator that puts every set on the table,
and the marginal's deals cap the ranker's own list at 32); the held-back set ≤ 0 at every D (yes),
the best-mean over all searched positive by D 128 (`'sets'` yes, `'top'` no), `'sets'` at least
`'top'`'s yield (no at 32, yes at 128), the played hit rate 2–6 points under the pick's (yes). Q3
(M3): **the sign was wrong** — s128 −0.333 where +0.10 to +0.40 was written at 65% odds; t32
+0.248 ± 0.144 (eligible at home; the bridge read it makes final is −1.61, below the bar); s32 −0.191 ± 0.140 on
ten banks (−2.7 SE, one bank ahead): below t32, where "within 0.10" was written; it is 0.44 below. Q4 (M4): t32 −1.61 where +0.5 to +2.0 was written; nothing clears §3.8n's bar.

**The rung's verdict: nothing ships; the marker is not the objective.** Every number the
pre-registration named as the search's signal — the marker, the yield, the arm's own belief — grew
as predicted for the generator that puts every set on the table, and every number the
pre-registration named as the *read* — the pairs at home, the bridge — went the other way. §3.8a's
marker was the true paired advantage of the played move in the leaf's own units at the leaf's own
horizon on the true deal; it is a precise measurement of the wrong quantity, and this rung is the
record that it is. What the rung leaves: `candMode` (`'sets'`, the generator that finds the
chase-or-take-back decision), the deals scaled and read, the sparse search and the horizon probe as
the diagnostic pair every later search rung reads before its pairs, the lane rule for the bridge,
and the leaf as the named limit. Row 34 (§3.8ab): **v0.29 is a leaf fitted on the game's end.**

### 3.8ab Monet v0.29 — the learned leaf: a value fitted on the game's end, in place of the lock count at the horizon

**Decision row 34, taken 2026-09-08 under the owner's direction of 2026-09-07 (the plan §3.8aa
wrote: "v0.29 — a learned leaf").** What §3.8aa read before its first block was even in: the best
cell of the marker grid, s128, **loses at home by −0.333 ± 0.144 a pair (2,400 pairs, thirteen of
sixteen banks behind)** where its marker — the true-state paired advantage of what it played, a
24-action rollout scored in sets and locks — read **+0.082 (SE 0.013)**. The diagnosis (the horizon
probe and the sparse pairs, §3.8aa's record): carried to the game's end under the fast policy the
same moves read +0.061 (SE 0.053) — unresolved — and played one at a time in a game the fast policy
otherwise plays (a fifth of the decisions searched) they read **−0.040 ± 0.127 a pair, about zero
per changed decision (−0.011, SE 0.018)** against −0.019 (SE 0.004) when every decision is
searched. A searched move is worth about nothing in sets by the game's end, alone or together,
where the leaf credits it a twelfth of a set at 24 actions. **The marker was the objective and it
is not the game's; the leaf counts locks and sets at a horizon, and what it counts does not
convert.** §3.8a said the search needed "a leaf that is not a rollout"; this rung fits one on the
one thing the search should be optimising, the final set differential.

**What the leaf is.** `lib/engine/search/value.ts`: a feature vector of the FULL-INFORMATION state
for a team — a determinized deal at the search's horizon, or the true one — and a fitted model
over it. Ten global terms (the score differential, the resolved count, the card differential,
whose turn and the turn-holder's hand, seats still in and the smallest hands a side, the asks so
far) and twelve per unresolved half-suit laid out in nine slots in a canonical order (ours
descending, then how many of its six locations our best-informed seat knows, then how few theirs
does, then our concentration): the cards each side holds, how many of ours the public log pins and
how many of theirs, how many of ours some opponent has located and how many of theirs some seat of
ours has, the best-informed seat's count on each side, the largest holding in one hand on each
side, the seats holding any on each side, and whether the turn-holder can ask into it. The
knowledge is the engine's own — the public walk once and one `buildKnowledge` per seat, 0.15 ms a
state — because in this game a set's worth is who knows where its cards are: a card the opponents
have located is theirs to take back, a lock nobody on the holding team can prove is not yet a set.
118 features. The model is JSON — a standardisation and dense layers, ReLU between, none after —
so one layer is ridge regression and two hidden layers is a small net; the forward pass is
microseconds. **The target is the final set differential for the team**, from self-play of the
shipped stack S at every seat (`scripts/gen-value-data.mjs`), every ask-decision state read for
both teams. The search takes it through one optional key, **`leafNet`** in `SearchParams` — the
name of a model registered with `registerValueModel` — evaluated at the rollout's horizon in place
of `leafValue`; absent, §3.8aa's arm byte for byte (`tests/bots/value.test.ts` and `search.test.ts`
pin both). **With S 0 the search is a one-ply expectation over the deals**: the ask, its outcome on
the deal, the model — no rollout policy in the leaf at all, and thousands of deals at the cost of
§3.8aa's hundreds. The instruments take `--leaf-model <file>` (`bench-decide`, `probe-search`,
`probe-horizon`; `--a-leaf-model` / `--b-leaf-model` on `duplicate-pairs`), `duplicate-pairs` now
counts each side's searched and changed decisions and prints the paired set-difference per changed
decision (the arithmetic §3.8aa did by hand), and `probe-horizon` reads `leaf0`, the search's own
leaf on the true state right after the ask, beside what the game then does. `/play` and the bots
directory are untouched.

#### Pre-registration — written 2026-09-08, before a data game is played

**M0 — cost, read before this text (an instrument check).** Bench machine, one process,
`scripts/bench-decide.mjs --version v0.9 --override <S> --search … --leaf-model <a linear
smoke model>`, `'sets'` C 9: **S 0 · D 128: 110 ms a searched ask (10 s a mirror game); S 0 · D 512:
494 ms (46 s)** — against §3.8aa's s128 at 2,700 ms (456 s a game at twenty processes). A leaf
evaluation is the six knowledge builds (0.15 ms) and the arithmetic; at S 0 a candidate-deal is one
`reduce` and one leaf, so D scales twenty-five times further than a rollout leaf at the same cost.
S 24 with the model costs s128's rollouts plus the leaf, about s128.

**M1 — the fit.** `$SP/monet-v29/run-data.sh`: **eight processes of 6,000 games — 48,000 games of
S at every seat**, labels `v29d-<k>-<g>` (disjoint from every bank and probe label on record),
**ε 0.1** (at an ask decision, with probability 0.1 from the decision's own seed, a uniformly random
candidate from the search's `'sets'` list plays instead of the pick — so the states after asks the
ranker would not make, which the search evaluates, are in the data; the continuation stays the
fast policy's, so the target is close to its value), **each ask-decision state kept with
probability 0.25** (states within a game share its outcome; thinning buys games for rows), both
teams' rows per kept state — of the order of 2.1 million rows. Every row carries `lock0`, the arm's
static lock-only leaf at the state (§3.8a's `leafValue`, `leafLock` 1: the evaluation a learned
leaf replaces); games 0 mod 5 — the holdout — also carry `lock24`, the arm's 24-step lock-only
rollout from the true state (the search's actual horizon value). `scripts/fit-value.mjs`, the
holdout every game 0 mod 5 (a split by game, never by row): **three fits — `linear` (ridge, λ
10⁻⁵ a row), `mlp` 64·64 and `mlp` 128·128 (Adam, batch 256, learning rate 10⁻³, 30 epochs, the
epoch with the best holdout error kept, seed 1)** — read by holdout mean squared error against the
constant, the score differential calibrated, **`lock0` calibrated (the static baseline)** on the
whole holdout, and **`lock24` calibrated (the dynamic baseline)** on the holdout rows that carry it.
**Eligibility for M2: a leaf's holdout MSE below `lock0` calibrated's on the same rows** — it must
at least match, as a static evaluation of a state, the count it replaces. The leaf carried forward
(**V**) is the eligible fit with the lowest holdout MSE; the linear fit (**L**) is carried beside it
when it is eligible and not V (it reads the features alone, and it is the cheaper leaf). Nothing
eligible: the rung stops at M1 and the record says the features are the limit — a raw
card-by-seat representation is the next term, not more deals. The fit's antisymmetry (the two
teams' rows of one state summing to zero) is reported, not gated.

**M2 — duplicate pairs at home, the leaf in the game.** Not the marker: §3.8aa read the marker
ahead where the game was behind, and the game is the read. `scripts/duplicate-pairs.mjs --a v0.9
--a-override <S> --a-search <form> --a-leaf-model <V> --b v0.9 --b-override <S>`, **2,400 pairs a
cell in twelve banks of 200** (`v29-<k>`, pooled by pairs with the cells' own SDs, §6.3), the
control (S against S, two banks, required to print `0.0000 +/- 0.0000`) first. Every form is
`'sets'` C 9, z 1, the LCB guard. **The cells, in this order, every one played** (compute is not
the constraint; the wall clock is reported):

| cell | leaf | S | D | ms an ask (M0) | about, at twelve processes |
|---|---|---|---|---|---|
| **n128** | V | 0 | 128 | 110 | 1 h |
| **n512** | V | 0 | 512 | 494 | 4–5 h |
| **n24** | V | 24 | 128 | ≈ 2,700 | 13 h — s128's form with the leaf swapped, the one-variable comparison to §3.8aa's −0.333 ± 0.144 |
| **l512** | L | 0 | 512 | 494 | 4–5 h; only when L is eligible and not V |

Before n128 and n512 their **sparse forms** (`--a-search-prob 0.2`, the same banks, 2,400 pairs
each, a fifth of the cost) are played as the diagnostic §3.8aa ended on — a searched move one at a
time, per changed decision, against the dense form's — and reported, not gated. Read per cell: the
paired set-difference a pair with its SE and the banks ahead, the changed decisions a pair and the
paired set-difference per changed decision (the pairs script's own count now). **Eligibility for
the bridge: the home paired mean at least +2 SE above zero and ahead on a majority of the twelve
banks.** The primary is the eligible cell with the best paired mean; a tie within one SE goes to
the cheaper cell. If no cell is eligible, the rung records where the leaf failed — n24 against s128
says whether the leaf at the horizon of a rollout is better than the count (the leaf), n512 against
n128 whether the deals help under the leaf (the belief), and the sparse forms whether a single move
now pays (the objective) — and stops.

**M3 — the marker, re-read at the end (a diagnostic, not a gate).** `scripts/probe-horizon.mjs
--leaf-model <V> --search <the primary's form, or n512's if none is eligible>`, 300 mirror games
twenty processes wide: `leaf0` (the leaf's own paired reading of what it played, on the true deal),
the lock-only value at 24/48/96 actions, sets alone at the same, and the final set differential,
for the played candidates, the best-mean set and the held-back set. What the search believed
beside what the game did — the read that would have caught §3.8aa's leaf before its pairs.

**M4 — the bridge, the ship rule.** Twelve fresh seeds under `"monet-v0.29-confirm-12"` by §6.5's
rule (`$SP/seeds-v29.mjs`; the spent set §3.8aa's plus its twelve), drawn and written here before a
cell is played: **7550864 7751223 7315504 6449732 6962668 8281481 1832694 8353852 1312979 5131071
4074049 7809288**. The tree exported by `git archive` with the model file inside the arm's
directory, the adapter taking **`MONET_LEAF_MODEL`** (a path) and registering it before its first
decision — the adapter's one change, its md5 recorded; the base's twelve cells on the new seeds (the
fast policy is untouched by this rung: the identity cell at 90210 must read IDENTICAL to §3.8u's);
per-lane arm ids (§3.8aa's lane rule), the heap cap, at most two containers of six games; the pins
as §3.8aa's — the adapter's own counter of searched asks against its asks at 100.0%, the leaf's
registration logged in the hello, the races EXACT, the fault counters zero, 36 cover files a cell,
a short cell replayed IDENTICAL. **The ship rule is §3.8n's, paired against v0.20c's vector on the
twelve:** at least two standard errors above zero and ahead on a majority; ±2.00 stays the rung;
the registry change a PR for the owner stacked on #41 (a search with a fitted leaf on `/play`'s
cost line is the owner's call at review).

**§3.8aa's first block** (t32 and s32 at home, running as this is written) is read under §3.8aa's
rules and does not change this rung's cells: if a D 32 lock-leaf cell is eligible there it goes
abroad under §3.8aa beside this rung, and the leaf is then read on top of whatever ships.

**Predictions, written before a data game.**

- **Q1 (M1).** The constant's holdout MSE 4.5–5.5 (the final differential from a mid-game state
  has an SD of about 2.2 sets); `lock0` calibrated R² 0.28–0.40; `lock24` calibrated 0.03–0.08
  above `lock0`'s. The linear leaf above `lock0` by at least 0.03 of R² (odds 75%) and level with
  `lock24` (40%); the 64·64 net above the linear by at least 0.02 (65%) and above `lock24` (50%);
  the 128·128 net within 0.01 of the 64·64 (the data, not the width, is the limit). At least one
  fit eligible: 85%.
- **Q2 (M2).** n128 −0.10 to +0.20 a pair; n512 above n128 by 0 to +0.10 (more deals help under a
  leaf that does not exploit them the way the rollout count did — or they do not, and the belief is
  the next limit); **n24 above s128's −0.333 by at least +0.20** (the leaf swapped, everything else
  equal: the count at the horizon was the loss — odds 70%); the sparse forms within 0.10 of zero.
  At least one cell eligible (≥ +2 SE, a majority of banks): **odds 35%** — a first fitted component
  more often reads flat than ahead, and the pairs are the honest place to find out.
- **Q3 (M3).** The primary's `leaf0` exceeds its true end-of-game reading by at least 0.05 a
  played decision (the leaf's own optimism about what it chose, 70%); the end reading itself ≥ 0
  (60%).
- **Q4 (M4).** If a cell is eligible: the primary clears §3.8n's bar with odds 40%; the wall clock
  at the bridge within 1.5× of M0's projection.

**After this rung.** V is the first value the line has; whatever it reads, **v0.30 — expert
iteration** re-fits it on the search's own games (the states the search reaches, the outcomes it
produces) and re-fits the fast ranker to the search's choices, then searches over both, repeated
while §3.9's number moves; the joint belief sampler after that. Every read pre-registered as this
one is; the owner may stop, reverse or redirect any of it.

The files: `$SP/monet-v29/{run-data.sh, run-pairs.sh, pool-pairs.mjs, SEEDS}`, `$SP/seeds-v29.mjs`,
`$SP/v29-{prereg,record}.md`.

#### Record — M0 to M2, 2026-09-08 (the cost, the fit and the pairs at home; M3 and M4 deferred behind v0.30)

**M0 — cost**, as written above (S 0 · D 128: 110 ms an ask; S 0 · D 512: 494 ms), plus S 12 · D 128
at 2,006 ms an ask read under full contention (twenty-seven processes on twenty-four threads — the
same form alone would read about 1.2 s); the S 12 cell was not in the grid and this number is for
the record only.

**M1 — the fit.** `run-data.sh`: 48,000 games in 1,250 s a process (eight processes), 4.27 million
ask decisions, 397,000 explored (9.3%), **2,134,344 rows**, the holdout 427,248 rows (9,600 games).
`run-fit.sh`, three fits, the holdout's mean squared error against the baselines
(`fit-{lin,mlp64,mlp128}.log`, `models/v29-*.json`):

| predictor of the final set differential | holdout MSE | R² | on the 427,248 rows with `lock24` |
|---|---|---|---|
| the constant (the train mean) | 6.811 | 0 | 6.811 |
| the score differential, calibrated (0.965 x) | 5.086 | 0.253 | — |
| **`lock0` — the static lock-only leaf, calibrated (0.814 x)** | **5.389** | **0.209** | 5.389 |
| `lock24` — the 24-step lock-only rollout from the true state, calibrated (0.835 x) | — | — | 5.093 (R² 0.252) |
| **linear leaf (ridge)** | **4.877** | **0.284** | 4.877 (0.284) |
| **mlp 64·64 (kept epoch 6 of 30)** | **4.755** | **0.302** | 4.755 (0.302) |
| **mlp 128·128 (kept epoch 4 of 30)** | **4.752** | **0.302** | 4.752 (0.302) |

The SD of the final differential from a mid-game ask-decision state is 2.61 sets; the score alone
explains a quarter of its variance and the best leaf here three tenths — most of a game is still
to be played from most of its states, and no static evaluation will read much more than that.
What the table says about §3.8a's leaf is the finding: **the lock count is worse than the score
alone as a predictor of the end (R² 0.209 against 0.253), and the 24-step rollout in the leaf's
units is no better than the current score (0.252 against 0.253).** "A locked set is a set" was the
amendment that made the search read ahead on its marker, and it is false at the states a game is
actually in: a half-suit wholly in one team's hands at an ask decision is one that team could not
prove at the last window — the holders cannot learn more about it by asking (the opponents hold
none, so every ask into it misses and gives the turn away), so it sits unprovable until someone
declares it on inference or guesses it at the endgame, and under `us54` a wrong declare is the
opponents' set. Calibrated, the lock is worth 0.81 of the differential it sits in and less than
nothing on top of the score. The search of §3.8aa optimised, precisely, a count with no
information about the end beyond the score it already had. **Both nets and the linear fit are
eligible** (below `lock0` calibrated's 5.389, and below `lock24`'s 5.093 on the rows that carry
it); V is the 128·128 net by the rule (the lowest holdout MSE, by a margin that is noise against
the 64·64's), L the linear fit. Antisymmetry: V(team 0) + V(team 1) on one state has an RMS of
0.27 (linear), 0.34 (64·64) — a tenth of the SD, not enforced and not needed. The linear fit's
largest standardised weights, for what the leaf learned: the score +1.36; **cards in hand −0.54**
(at a given score, holding more cards than the other side is worse — they are what the other
side asks for); the resolved count −0.43; **their sets' `theirsBestKnown` −0.16 to −0.41 across
the slots** (a half-suit their best-informed seat can nearly prove is the term the leaf fears
most); their spread −0.17 to −0.22; our `ours` and `oursBestKnown` in the top slots +0.17 to
+0.30; the turn +0.16. Q1 as written: the constant 6.81 (predicted 4.5–5.5 — the SD is larger
than §3.8aa's pairs suggested, since a pair's differential is two games' worth and correlated
within a deal); `lock0` 0.209 (predicted 0.28–0.40 — lower, and the finding above); `lock24` above
`lock0` by 0.043 (predicted 0.03–0.08, yes); the linear leaf above `lock0` by 0.075 (yes) and
level with `lock24` (above it by 0.032 — yes, at 40% odds); the 64·64 above the linear by 0.018
(predicted ≥ 0.02 at 65% — just under) and above `lock24` (yes); the 128·128 within 0.01 of the
64·64 (yes: the data, not the width, is the limit).

**M2 — duplicate pairs at home, the leaf in the game (read 2026-09-08 04:50–08:00Z; `$SP/monet-v29/pairs-pooled.md`).**
The control (S against S, two banks of 200) printed `0.0000 +/- 0.0000`. The cells, every one S 0
(a one-ply expectation over the deals) with V = the 128·128 net unless marked, `'sets'` C 9, z 1, the
LCB guard, twelve processes:

| cell | leaf | form | banks; pairs | paired set-diff a pair ± 1.96 SE (SD) | points | × SE | banks ahead | changed a pair (of searched) | per changed decision (SE) |
|---|---|---|---|---|---|---|---|---|---|
| n128p02 (sparse) | V | D 128, a fifth of the decisions | 12; 2,400 | **+0.022 ± 0.132** (3.29) | +0.16 | 0.3 | 6 of 12 | 4.74 (30.0%) | +0.005 (0.0142) |
| n512p02 (sparse) | V | D 512, a fifth | 12; 2,400 | **+0.002 ± 0.133** (3.33) | +0.01 | 0.0 | 5 of 12 | 5.31 (33.6%) | +0.000 (0.0128) |
| **n128** (dense) | V | D 128 | 12; 2,400 | **+0.161 ± 0.144** (3.60) | +1.20 ± 0.55 | 2.2 | 8 of 12 | 28.16 (36.2%) | +0.006 (0.0026) |
| l512 (dense) | L (linear) | D 512 | 12; 2,400 | **−1.053 ± 0.143** (3.59) | −7.87 ± 0.55 | −14.4 | 0 of 12 | 18.01 (23.3%) | −0.059 (0.0041) — the first eight banks read −0.978 ± 0.172; the last four landed 2026-09-08 afternoon |
| n512 (dense) | V | D 512 | — | deferred under the owner's wall-clock direction of 2026-09-08 (4–5 h) | | | | | |
| n24 | V | S 24, D 128 | — | deferred under the same direction (13 h) | | | | | |

**One cell is eligible, at the bar's edge.** The dense n128 on its twelve banks (the last six landed at
08:50Z, after this record's first draft had read the first six at +0.150 ± 0.204, 1.4 SE) reads **+0.161 ±
0.144, 2.2 SE, eight of twelve banks ahead** — eligible by the rule, by a fifth of a standard error, and
worth +1.2 points of win rate; its per-changed-decision reading (+0.006, SE 0.003) is the sparse forms'
(+0.005, +0.000): a searched move under the learned leaf is worth about a two-hundredth of a set, dense
or sparse, D 128 or D 512 — §3.8aa's finding again with a fitted leaf in place of the count, just
resolvable from zero when every decision is searched. **The linear leaf in the game is the rung's sharpest read: −1.053 ± 0.143 on twelve banks (−0.978 ± 0.172
on the first eight), every bank behind, −0.059 a changed decision.** A static evaluation fitted by least squares on states the fast
policy reached is exploited by a search that optimises against it — the fit's correlations are not the
game's causes (its `cardDiff` term at −0.54 penalises the hit that took a card; its `resolved` −0.43
rewards leaving sets open), and a one-ply search finds every seam. The 128·128 net, fitted on the same
data, is not exploited the same way (n128 +0.150, not −0.978): the seams are narrower, but nothing in
it converts either. Q2 predicted n128 −0.10 to +0.20 (✓ at +0.161), n512 above n128 (not read), the
sparse forms within 0.10 of zero (✓), at least one cell eligible at 35% (✓, at the edge). **M3 (the marker
re-read) and M4 (n128 at the bridge) are deferred behind v0.30's cells under the owner's wall-clock
direction** — a +1.2-point search at 110 ms an ask, against a +6.7-point ask policy at no cost (§3.8ac) —
and are played if the machine has the time after them. **What the rung says:** the leaf buys little; the
opponent model is the piece. Under the direction
of 2026-09-08 the line moves to the opponent model (§3.8ac): §3.8aa's block 1 read t32 — the rollout
search with the shipped stack at every seat of its rollouts — **+0.248 ± 0.144 at home, eligible, where
its bridge read was −1.61 points**, and a search that helps against the opponent it models and hurts
against the one it does not is missing its opponent model, not its leaf.

### 3.8ac Monet v0.30 — the SESTINA clone: an ask policy fitted on SESTINA's own play, as a player and as the search's opponent model

**Decision row 35, taken 2026-09-08 under the owner's direction of 2026-09-08** — *"i think learning
from sestina's play is essential to improving, since thus far it is still a superior model. Also, if
possible, we should be learning to beat sestina if possible"*, and *"a bigger machine might be worth it
… but also balance between using compute and the quality of results, I don't want this to be running
for weeks"*. What was on the table when this was written. §3.8ab's sparse reads: the learned leaf's
searched moves, one at a time in a game the fast policy otherwise plays, are worth nothing in sets —
n128p02 **+0.022 ± 0.132** a pair, n512p02 **+0.002 ± 0.133** (+0.005 and +0.000 per changed
decision, 2,400 pairs each); the linear leaf in a one-ply expectation at D 512 **−1.053 ± 0.143** on twelve banks (a
static fitted evaluation, no rollout under it, is exploited by the search that optimises against it:
correlation is not causation, and the search finds the features' seams); the dense n128 still
running. And §3.8aa's first block: **t32** — the rollout search at D 32, S 24, the lock-only leaf,
the shipped stack S as its rollout policy at every seat — **+0.248 ± 0.144 a pair at home (nine of
ten banks ahead, eligible by the home rule)** where the same form at the bridge had read **−1.61
points (−2.10 SE, behind on eight of twelve seeds)**. The search helps against the opponent it models
and hurts against the one it does not: at home the rollouts' opponents ARE S; at the bridge they are
SESTINA, whose asks the rollouts play as S's. **The opponent model is the missing piece — and
SESTINA's play is on record.** Every bridge cell since v0.9 was played by the recording engine build
that writes the deals and the events: about 440 files, about half a million games, about 25 million
of SESTINA's ask decisions (47 a game), each a choice at a state this codebase rebuilds exactly (the
records are their engine's output — data, not code — and the bot on the other side of every one of
them is ours).

**What the clone is.** `lib/engine/bots/imitation.ts`. At an ask decision the ranker's list of every
legal ask (`rankAsksWith`, the stack's own knowledge) is described ask by ask — 33 features: the hit
probability, whether it is certain and whether it is a known miss; the ranker's score relative to
its top, the rank and whether it is the top; the seat's candidate count; the half-suit's state (how
many of six this hand holds, how many the opponents are known to hold, how many are unlocated, how
many of it the target holds as far as the seat knows, the target's hand size); the history (whether
this seat, a teammate or an opponent has asked into the half-suit, how many asks it has taken,
whether the card was asked before and by this seat, whether the target asked this seat, whether it
is the seat's last target again, the seat's hit run); the narrowing (whether the target is one of
the few seats the card can be at); whether the half-suit is the hand's largest and its rank among
the hand's half-suits; the eights; the score, the resolved count, the hand size, the asks so far and
the seats still in on each side. A fitted model scores each row; **the policy is the argmax**, ties
to the ranker's order. The model is `net.ts`'s dense JSON — v0.29's leaf format, the same compile
and forward pass (`value.ts` now takes its model code from there, byte for byte; `tests/bots/value.test.ts`
unchanged). **`StyleParams.askModel`** names a registered model (`registerAskModel`) and `pickAsk`
returns the model's choice in place of its own, in every branch that reaches `pickAsk` — the
certain-hit branch included, deliberately: SESTINA declines an available certain hit one time in
five, and a clone that cannot is not a clone; the reveal ask and the declare policy stay the
stack's. Absent, byte identity — every roster style, every tier, every version (`tests/bots/imitation.test.ts`
pins the features, the argmax, the hook and the validation). **The fit is a conditional logit**: the
softmax over each decision's legal asks is the policy and the loss is the negative log-probability
of the ask SESTINA chose. `scripts/bridge-records.mjs` reads the records into the engine's own
events (attribute.mjs's reader, the tracked deal checked event by event) and replays them;
`scripts/gen-imitation-data.mjs` rebuilds, at every SESTINA ask decision, the asking seat's view,
writes the feature rows with the chosen ask marked, and records the stack's own decision at the same
view beside it — the agreement baseline every fit is read against; `scripts/fit-imitation.mjs` fits
a linear scorer or an MLP by Adam and keeps the epoch with the best holdout log-likelihood. **The
search takes the clone as its opponent model** through **`SearchParams.oppAskModel`**: the rollouts
play the spec with `askModel` laid over its style at the OPPONENTS' seats and the spec itself at
ours (`opponentSpec`); absent, byte identity (`search.test.ts` unchanged). The instruments:
`--a-ask-model` / `--b-ask-model` on `duplicate-pairs`, `--ask-model` on `bench-decide`; the
adapter takes `MONET_ASK_MODEL` (the clone plays) and `MONET_OPP_ASK_MODEL` (the clone in the
rollouts). `/play` and the bots directory's public-view proof are untouched.

#### Pre-registration — written 2026-09-08, after the instrument's smoke and before a fitting row of M1 is read

**What the smoke read (an instrument check, not M1).** One v0.22 record file (1,200 games, 56,351
SESTINA ask decisions, the whole file the holdout, S's features): **the stack's own decision is
SESTINA's on 43.3% of its decisions, the ranker's top ask on 39.4%, the top three hold it on
66.8%**; SESTINA's asks hit 57.7%; **a certain hit was on the table at 42.2% of its decisions and it
took one at 79.4% of those**; its chosen ask's hit probability averages 0.558 against the ranker's
top's 0.647; legal asks a decision 46.5 (median 45, at most 135). Four v0.28 files (226,006
decisions, file 0 the holdout): a linear scorer reaches **50.65% top-1 on the holdout** (top-3
81.7%, NLL 1.319) and a 64-unit MLP **55.35%** (top-3 85.7%, NLL 1.081) against the stack's 43.61%
on the same decisions — a clone that predicts SESTINA better than Monet's own stack does is within
reach, and the linear weights read as a policy: **keep asking into the half-suit you asked before**
(+2.29 standardised), never a known miss (−2.00), the hit probability (+1.36), **smaller hands as
targets** (−1.12), the half-suits a teammate or an opponent has asked into (+1.01, +0.73), the
ranker's score (+0.89), the last target again (+0.42), a certain hit slightly less than its
probability alone says (−0.17).

**M1 — the fit.** The data (`$SP/monet-v30/run-data.sh`): every archived record file whose arm B is
SESTINA v1.0's spec and arm A a bot of ours (`--spec-b`, the default; anything else is skipped and
counted), **a 2% sample of SESTINA's ask decisions** (each decision kept by a uniform drawn from its
own label, `--sample 0.02`) — about 500,000 decisions and 23 million rows — **the holdout every
fifth file** (a split by file = by seed cell, never by row; `--holdout-mod 5`), the features under
S's style (`--override` v0.20c's vector: the ranker's order the clone reads is the one it replaces).
Six processes by directory group, labels `v30d-<k>`. **Three fits** (`$SP/monet-v30/run-fit.sh`) —
`linear`, `mlp` 64, `mlp` 64·64 — Adam, batch 64 decisions, learning rate 10⁻³, L2 10⁻⁵, 12 epochs,
the best holdout NLL kept, seed 1 — read by **holdout top-1 agreement with SESTINA's choice (the
primary: the argmax is what plays)**, top-3 and NLL, against the two baselines on the same
decisions: the ranker's top and the stack's own decision. A learning curve on the best form
(`--train-frac 0.5` against 1) says whether more data would move it. **Eligibility for M2 and M4:
holdout top-1 at least 5 points above the stack's own agreement.** The clone carried (**C**) is the
eligible fit with the highest holdout top-1. Nothing eligible: the rung stops and the record says
the features are the limit — the next term is a per-card representation of the half-suit, or
SESTINA's belief, not more data.

**M2 — the clone as a player, at home.** `scripts/duplicate-pairs.mjs --a v0.9 --a-override <S>
--a-ask-model <C> --b v0.9 --b-override <S>`, **2,400 pairs in twelve banks of 200** (`v30-<k>`,
pooled by pairs with the cells' own SDs, §6.3), the control (S against S, two banks, required to
print `0.0000 +/- 0.0000`) first. This reads SESTINA's ask choices, as C approximates them, inside
Monet's stack — its belief, its declare policy, its teammates — against the stack's own choices.
Read: the paired set-difference a pair with its SE and the banks ahead. **Eligibility for M3: at
least +2 SE above zero and ahead on a majority of the twelve banks.**

**M3 — the clone as a player, at the bridge (only if M2 is eligible).** Twelve fresh seeds under
`"monet-v0.30-confirm-12"` by §6.5's rule (`$SP/seeds-v30.mjs`; the spent set §3.8ab's plus its
twelve, drawn there and never played), drawn and written here before a cell is played: **1485985
2632525 3494862 9948698 3131149 2398534 5193753 5103273 2487047 8924909 6177040 8235295**. The base
(v0.20c's vector) on the twelve first, then C playing through `MONET_ASK_MODEL` (the model file
inside the arm's directory, its md5 prefix in the hello label). **The ship rule is §3.8n's, paired
against v0.20c's vector on the twelve: at least two standard errors above zero and ahead on a
majority; ±2.00 stays the rung**; the registry change a PR for the owner stacked on #41.

**M4 — the clone as the search's opponent model, at the bridge: the line the direction opened.**
§3.8aa's t32 form exactly — `{"det":32,"cand":4,"steps":24,"z":1,"guard":"lcb","leafLock":1,"leafCard":0,"candMode":"top"}`,
S as the rollout policy at our seats — with **C at the opponents' seats of its rollouts**
(`oppAskModel`, through `MONET_OPP_ASK_MODEL`), on the same twelve seeds, paired against the base:
the one-variable comparison to t32's own bridge read (**−1.61 points, −2.10 SE**) — the same
search, its opponents modelled as SESTINA instead of as S. **Not read at home first**: at home the
opponents ARE S, and a model of SESTINA there is the wrong model by construction; t32 at home
(+0.248 ± 0.144) is the reference for what this search buys when its opponent model is right. The
ship rule is §3.8n's, as M3's. M4 runs whether or not M2 is eligible (a clone that loses as a
player can still be the right model of the opponent). The adapter is `$SP/arm_v30/bot.mjs` (md5
`37e4f264456784e7280149333c325cfa`: v29's adapter plus the two variables, the hello label carrying
each model's md5 prefix — its one change); the pins as §3.8ab's M4 (the identity cell at 90210
IDENTICAL to §3.8u's; the adapter's own counter of searched asks against its asks at 100.0%; the
races EXACT; the fault counters zero; 36 cover files a cell; a short cell replayed IDENTICAL);
per-lane arm ids; at most two containers of six games.

**Wall clock — the owner's constraint (nothing runs for weeks), projected here and reported
against.** M1: the extraction 10–30 minutes across six processes (21 s a file at full sampling; the
2% sample is cheaper), the three fits under two hours in one process each (the smoke's MLP 64 read
54 s an epoch on 169,000 training decisions). M2: about 30 minutes at twelve processes (the clone's
cost is a forward pass per legal ask). M3: about an hour at the bridge (a base cell takes 2.5
minutes; the fast policy's about the same). **M4: about 17 hours at the bridge** — §3.8aa's t32
cells took 2 h 50 min a pair of containers, six pairs — the cost of the rollout search, unchanged by
the clone. The whole rung inside two days of wall clock. Nothing here needs the bigger machine; it
pays at expert iteration (v0.31) if this rung's M4 says the opponent model is the piece.

**Predictions, written before a fitting row of M1 is read.**

- **Q1 (M1).** The linear clone's holdout top-1 49–53% (odds 80%); the MLP 64's 55–59% (75%); the
  64·64 within 1.5 points of the 64 (60%); the learning curve at half the data within 1 point of the
  whole (60% — the smoke's 226,000 decisions already plateaued the linear form). At least one fit
  eligible (the stack's agreement + 5): **90%**.
- **Q2 (M2).** C as a player at home against S: **−0.40 to +0.15 a pair** (odds 70% within);
  eligible (≥ +2 SE, a majority of banks): **20%**. SESTINA's asks are chosen with SESTINA's belief
  and cashed by SESTINA's declares; the clone plays them with Monet's. What the sign says matters
  more than the size: if C loses at home, SESTINA's edge is not in which card it asks for.
- **Q3 (M3, if reached).** C clears §3.8n's bar at the bridge: 35%.
- **Q4 (M4).** The t32 form with C in its rollouts' opponent seats, paired against v0.20c's vector
  on the twelve: **−1.0 to +2.5 points** (odds 70% within); **above t32's own bridge read (−1.61) by
  at least 1 point: 65%** (the opponent model is the piece); clears the bar (≥ +2 SE, a majority of
  seeds): **30%**; below t32's own read: 15% (the clone's errors in the rollouts cost more than S's
  wrong model did).
- **Q5.** Every wall clock within 1.5× of its projection: 75%.

**After this rung.** Whatever M4 reads, C is the first model of SESTINA the line has, and the records
are the first data a model of its DECLARE policy can be fitted on (its guesses and its forced
declares are in the same events). **v0.31 — expert iteration against the clone**: the search with
C as its opponent, its games the data for the leaf's re-fit and the ranker's; the clone re-fitted on
the bridge records the search itself produces. Every read pre-registered as this one is; the owner
may stop, reverse or redirect any of it.

The files: `$SP/monet-v30/{run-data.sh, run-fit.sh, run-pairs.sh, pool-pairs.mjs, SEEDS, ARM_MD5}`,
`$SP/seeds-v30.mjs`, `$SP/arm_v30/bot.mjs`, `$SP/v30-{prereg,record}.md`.

#### Record — M1 to M4, 2026-09-08/09 (the fit, the pairs at home, the bridge as a player and as the opponent model)

**M1 — the fit (read 2026-09-08 07:47–08:30Z).** The extraction, six processes, 85 s of wall clock:
**367 record files** (75 skipped — their arm B was not SESTINA: the v0.17 panel cells against `v02`, the
attribution cells), **438,126 games, 20,516,416 SESTINA ask decisions, 409,994 kept (the 2% sample),
19,060,662 rows** (2.6 GB); the holdout every fifth file, 84,222 decisions. On the holdout **the stack's own
decision is SESTINA's on 43.65%, the ranker's top ask on 38.94%, the top three hold it on 66.07%**;
SESTINA's kept asks hit 56.85%. The fits (their logs and models outside the repo; C is committed as data on the ship branch,
`lib/engine/bots/data/sestina-clone.ts`, source md5 `2138c38e…`):

| fit | holdout top-1 | top-3 | NLL | kept epoch | wall clock | eligible (≥ 48.65%) |
|---|---|---|---|---|---|---|
| the ranker's top (no model) | 38.94% | 66.07% | — | — | — | — |
| the stack's own decision | 43.65% | — | — | — | — | the baseline |
| **linear** | **49.92%** | 81.24% | 1.3414 | 10 of 12 | 42 s | **yes (+6.27)** |
| **mlp 64** | **55.78%** | 85.50% | 1.0761 | 11 of 12 | 16 min | **yes (+12.13)** |
| **mlp 64·64 = C** | **56.32%** | 86.28% | 1.0508 | 12 of 12 | 55 min | **yes (+12.67)** |
| mlp 64 on half the training decisions (the learning curve) | 55.32% | 85.31% | 1.0900 | 10 of 12 | 10 min | (−0.46 against the whole: the data is not the limit at this width) |

Every fit is eligible; **C is the 64·64 net** (the highest holdout top-1; its NLL was still falling at
epoch 12, so a longer fit would gain a little more).

The linear clone's standardised weights, in order of size: `bookAskedByMe` +2.27, `knownMiss` −1.94,
`p` +1.36, `targetHand` −1.11, `bookAskedByMate` +1.04, `scoreRel` +0.88, `bookAskedByThem` +0.66,
`lastTargetSame` +0.41, `targetAskedMe` +0.40, `bookAsks` +0.25, `bookIsMyMax` −0.23,
`targetKnownOfBook` −0.23, `narrowing` −0.18, `certain` −0.18, `ownHeld` −0.17, `unknownOfBook` −0.16,
`cardAskedBefore` −0.16, `candCount` −0.15, `ownHeldRank` +0.15, `gamble` +0.14, `theirsKnown` +0.12,
`rankInv` +0.11, `progress` +0.09; the global terms (the score, the resolved count, the hand size, the
asks, the seats in) at zero — they are constant across a decision's rows and a conditional logit cannot
read them, as it should not. **Read as a policy: SESTINA asks into the half-suit it (or its partner)
asked into before, at the target it asked last, from the smaller hands; it weighs the hit probability
about as the ranker does and it takes a certain hit for its probability and no more.** Q1: the linear
clone inside 49–53% (predicted 80%) ✓; the MLP 64 at 55.78% inside 55–59% ✓; the 64·64 within 1.5
points of the 64 ✓ (+0.54); the learning curve within 1 point ✓ (−0.46); at least one fit eligible ✓.

**M2 — the clone as a player, at home (read 2026-09-08 07:52Z).** The control first: S against S, two
banks of 200, **`0.0000 +/- 0.0000`** ✓. Then — as an exploratory cell ahead of the carried clone, the
linear fit being eligible and the cell costing two minutes — **the linear clone inside S's stack against
S: +0.500 ± 0.144 a pair (SD 3.59; 2,400 pairs in twelve banks of 200), +3.73 ± 0.55 points of win
rate, +6.8 SE, twelve of twelve banks ahead** (+0.760 +0.210 +0.580 +0.640 +0.725 +0.115 +0.395 +0.465
+0.450 +0.475 +0.710 +0.470). **Eligible for M3, and the largest paired home read on the ladder.** Q2
predicted −0.40 to +0.15 (70%) and eligibility at 20%: **wrong on both** — SESTINA's ask choices, as a
linear scorer of the stack's own features approximates them, beat the stack's own choices inside the
stack's own belief and declare policy. The cost (`bench-decide`, 24 mirror games each, this machine
under load): the clone's ask decision 0.30 ms mean against S's 0.48 (the model is 33 multiplies per
legal ask; the difference is noise); the decision mean 0.37 ms against 0.39; both PASS §3.4a's budget.
**The MLP-64 clone (read 08:08Z): +1.056 ± 0.145 a pair (SD 3.63; 2,400 pairs, twelve banks), +7.89
± 0.55 points of win rate, +14.2 SE, twelve of twelve banks ahead** (+0.765 +1.005 +0.980 +1.360 +1.650
+1.165 +0.525 +1.075 +0.725 +1.515 +0.690 +1.215). The better the clone predicts SESTINA, the better it
plays inside the stack: 49.9% agreement buys +0.500 a pair, 55.8% buys +1.056. **C, the 64·64 net
(read 08:45Z): +0.954 ± 0.146 a pair (SD 3.66), +7.13 ± 0.56 points, 12.8 SE, twelve of twelve banks
ahead** (+1.055 +0.885 +1.265 +1.295 +0.900 +1.260 +0.745 +1.010 +0.550 +0.525 +1.170 +0.785) — level
with the MLP 64's +1.056 within the two cells' SEs (the two nets agree with SESTINA within half a point
of each other, and with each other far more often than either does with the stack). Both are eligible
for M3.

**M3 — the clone as a player, at the bridge (read 2026-09-08 08:04–08:41Z).** The tree export of
b1664fe (lib md5 `25e75723707de07b89d25cf54a78f319`); the identity cell — v0.9's vector on this tree at
6269924 — **IDENTICAL** to §3.8l's recorded base cell, every line but `elapsed` (the fast policy is
untouched). The base (v0.20c's vector, `monet-v30-base`) on the twelve seeds first, one container, 33
minutes; then the MLP-64 clone (`monet-v30-clone`, the model file inside the package, the hello label
carrying `ask=6ae34c26`, 30 of 32 hello lines whole and every whole one carrying it), one container, 37
minutes; 36 cover files a cell, the fault counters zero, no FATAL line, no COVERAGE FAIL line, the
calibration bias +0.011 on the base's first cell as on every base cell since §3.8m.

| seed | base | the MLP-64 clone | paired |
|---|---|---|---|
| 1485985 | 42.92% | 46.75% | +3.83 |
| 2632525 | 39.08% | 47.17% | +8.08 |
| 3494862 | 38.92% | 45.17% | +6.25 |
| 9948698 | 41.50% | 48.58% | +7.08 |
| 3131149 | 41.75% | 46.92% | +5.17 |
| 2398534 | 41.58% | 48.83% | +7.25 |
| 5193753 | 39.50% | 49.33% | +9.83 |
| 5103273 | 39.25% | 48.08% | +8.83 |
| 2487047 | 42.42% | 45.67% | +3.25 |
| 8924909 | 40.42% | 49.33% | +8.92 |
| 6177040 | 39.33% | 46.33% | +7.00 |
| 8235295 | 42.58% | 47.17% | +4.58 |
| **twelve** | **40.77% (SD 1.51)** | **47.44%** | **+6.67 (SD 2.11, SE 0.61), 10.97 SE, ahead on 12 of 12** |

**The clone clears §3.8n's bar against SESTINA itself: +6.67 ± 0.61 points of win rate, eleven standard
errors, every seed ahead — the first rung since v0.20c to clear it, and by seven times v0.20c’s +0.94.** The
base's 40.77% is v0.20c's 40.6% again (§3.8s's twelve read 40.61%; the seeds are fresh). Q3 predicted
35%. At home the same clone read +7.89 points against S; against SESTINA it reads +6.67: what it learned
from SESTINA's play transfers to play against SESTINA nearly whole. **The ship rule is met; the registry
change is the owner's** (§3.8n: a PR stacked on #41 — v0.30 = v0.20c's vector with `askModel:
'sestina-clone'`, the fitted model committed as data). 

**C — the 64·64 clone (`monet-v30-clone2`, the model `clone-2138c38e.json` inside the package; read
08:46–08:59Z, one container, thirteen minutes):** 352 whole hello lines, every one carrying `ask=2138c38e`;
36 cover files a cell, `planMismatch` 0 on all 432, no FATAL line, no COVERAGE FAIL line.

| seed | base | C | paired |
|---|---|---|---|
| 1485985 | 42.92% | 47.50% | +4.58 |
| 2632525 | 39.08% | 48.08% | +9.00 |
| 3494862 | 38.92% | 47.33% | +8.42 |
| 9948698 | 41.50% | 46.67% | +5.17 |
| 3131149 | 41.75% | 48.50% | +6.75 |
| 2398534 | 41.58% | 48.42% | +6.83 |
| 5193753 | 39.50% | 49.33% | +9.83 |
| 5103273 | 39.25% | 50.25% | +11.00 |
| 2487047 | 42.42% | 48.67% | +6.25 |
| 8924909 | 40.42% | 47.00% | +6.58 |
| 6177040 | 39.33% | 48.00% | +8.67 |
| 8235295 | 42.58% | 46.42% | +3.83 |
| **twelve** | **40.77%** | **48.01%** | **+7.24 (SD 2.18, SE 0.63), 11.52 SE, ahead on 12 of 12** |

**C clears the bar as well: +7.24 ± 0.63 points, eleven and a half standard errors, every seed ahead —
48.0% against SESTINA v1.0, the highest twelve-seed read the line has made** (the rungs before it peaked at
v0.20c's 41.25%). Against the MLP-64 clone on the same seeds C reads +0.57 ± 0.49 a seed (seven seeds
ahead, one level, four behind): the two nets are level abroad as they were at home, and C is the carried
candidate as pre-registered (the highest holdout top-1). Q3 predicted 35% to clear; both clones cleared, by
ten standard errors and more. **The registry change is the owner's** (§3.8n): v0.30 = v0.20c's vector with
`askModel: 'sestina-clone'`, C committed as data (`lib/engine/bots/data/sestina-clone.ts`, source md5
`2138c38e…`, written by `scripts/gen-ask-model-module.mjs`), on the ship branch as a PR stacked on #41.

**M4 — the clone as the search's opponent model, at the bridge (read 17:49Z 2026-09-08; two lanes, `monet-v30-t32opp-l1`
and `-l2`, 8.8 hours of wall clock from 09:01Z).** §3.8aa's t32 form exactly, with C at the opponents' seats of
its rollouts (`oppAskModel` through `MONET_OPP_ASK_MODEL`, the hello label carrying `opp=2138c38e`) and S as the
rollout policy at ours, paired against the base on the same twelve seeds; the same tree export as M3 (its identity
cell IDENTICAL), 36 cover files a cell, the fault counters zero.

| seed | base | t32 with C at the opponents' seats | paired |
|---|---|---|---|
| 1485985 | 42.92% | 38.67% | −4.25 |
| 2632525 | 39.08% | 41.25% | +2.17 |
| 3494862 | 38.92% | 39.92% | +1.00 |
| 9948698 | 41.50% | 37.58% | −3.92 |
| 3131149 | 41.75% | 40.50% | −1.25 |
| 2398534 | 41.58% | 37.50% | −4.08 |
| 5193753 | 39.50% | 35.58% | −3.92 |
| 5103273 | 39.25% | 40.83% | +1.58 |
| 2487047 | 42.42% | 38.58% | −3.83 |
| 8924909 | 40.42% | 40.92% | +0.50 |
| 6177040 | 39.33% | 37.92% | −1.42 |
| 8235295 | 42.58% | 44.00% | +1.42 |
| **twelve** | **40.77% (SD 1.51)** | **39.44%** | **−1.33 (SD 2.57, SE 0.74), −1.80 SE, ahead on 5 of 12** |

**The clone in the rollouts does not help the search abroad: −1.33 ± 0.74 against t32's own −1.61 ± 0.77 (§3.8aa; Q4's 15% branch).** The search's loss abroad is not its model of the opponents — the rollouts' assumption that every seat after the searched move plays the fast policy (§3.8aa's M3) stands as the diagnosis — and the search line stays closed at this cost (586 ms an ask against §3.8a's 100 ms rule). Nothing ships from this cell; v0.30 (+7.24) is the candidate on the table.

**The ship (row 36).** v0.30 = v0.20c's vector plus `askModel: 'sestina-clone'` — C committed as data,
registered when `monet.ts` loads, its forward bank (36 games, 26,510 decisions from the clean tree) and
its pin; the /play note re-measured at 91.33% agreement with Bass v2.0 (§3.8s's 95.91%: the clone
chooses the ask wherever the stack leaves the choice to its ranker). PR #49, `claude/monet-v0.30-ship`,
stacked on #41 — for the owner.

### 3.8ad Monet v0.31 — the clone re-fitted: wider, longer, on more of the records

**Decision row 37, taken 2026-09-08 by the standing rule** (§3.8n: *"just pick whatever will improve the
winning percentage of Monet"*). v0.30's read says two things: the ask clone is the piece, and the read
scales with how well the clone predicts SESTINA — the linear fit at 49.9% holdout agreement bought
+0.500 a pair at home, the MLP 64 at 55.8% bought +1.056, and abroad the two nets read +6.67 and +7.24
points against SESTINA itself. v0.30's fit was a 2% sample of the decisions on file, twelve epochs with
its holdout loss still falling at the last one, and the narrowest net that beat the linear scorer by more
than a point. The cheapest rung on the table is therefore a better clone of the same policy: **the same
33 features, fitted wider (128·128), longer (24 epochs) and on two and a half times the data**, the
2026-09-08 cells added (SESTINA against three different opponents — v0.20c's vector and the two
clones — and M4's lanes as they land). Nothing in the engine changes: a v0.31 is v0.30's vector with a
different `askModel` — a new data module and a new registry entry, the ship the owner's as before. The
other half of SESTINA's edge, its declare policy, needs a reader of the records' declare events and its
own features: that is v0.32's line, pre-registered when its instrument exists. Expert iteration (§3.8ac's
"after this rung") waits for M4's read.

#### Pre-registration — written 2026-09-08 09:55Z, before a row is extracted

**M1 — the fit.** The data (`$SP/monet-v31/run-v31.sh`): §3.8ac's 367 files plus `$SP/monet-v30/records`
(the base's, the two clones' and M4's cells, whichever have landed when the extraction starts), **a 5%
sample** of SESTINA's ask decisions under a fresh salt (`--sample 0.05 --sample-salt 31`: a different
draw, not v0.30's 2% plus more of the same rows), the holdout every fifth file as before (`--holdout-mod
5`, a split by seed cell), the features under S's style (`--override` v0.20c's vector). About 1.1
million decisions and 50 million rows. **Two fits, in parallel, one process each:** **F1** `mlp` 64·64,
24 epochs — C's recipe at twice the epochs and 2.5× the data, the control for "more and longer" at the
same width; **F2** `mlp` 128·128, 24 epochs — the width. Adam, batch 64 decisions, learning rate
10⁻³, L2 10⁻⁵, the best holdout NLL kept, seed 1; read by holdout top-1 agreement with SESTINA's
choice (the primary), top-3 and NLL, against the ranker's top and the stack's own decision on the same
holdout. **Eligibility for M2 — stated as a margin, because this rung's holdout files are not v0.30's:
holdout top-1 minus the stack's own agreement on the same holdout at least 13.2 points** (C's margin
was 56.32 − 43.65 = 12.67; the bar is C's margin plus half a point). The candidate carried (**C2**) is
the eligible fit with the highest margin. Nothing eligible: the rung stops and the record says these
features are the limit at this data — the next term is the representation (a per-card view of the
half-suit, SESTINA's belief), not a third fit.

**M2 — the re-fitted clone as a player, at home.** `scripts/duplicate-pairs.mjs`, 2,400 pairs in
twelve banks of 200, the control first (`0.0000 +/- 0.0000`): **C2 inside S's stack against C inside
S's stack** — the one-variable comparison to the vector v0.30 ships, the same belief and declares on
both sides, only the ask model different — and, as the anchor, C2 against S (v0.20c's vector), where C
read +0.954 ± 0.146. **Eligibility for M3: C2 against C at least +2 SE above zero and ahead on a
majority of the twelve banks.**

**M3 — at the bridge (only if M2 is eligible).** Twelve fresh seeds by §6.5's rule under
`"monet-v0.31-confirm-12"` (the spent set v0.30's plus its twelve), drawn and written in the record
before a cell is played. **Drawn 2026-09-08 18:20Z (`$SP/seeds-v31.mjs`; the spent set §3.8ac's plus v0.29's
twelve, reserved, and v0.30's twelve): 2084753 3014474 6756708 8119149 3333333 8366602 6841788 1616231 7621259 1307763 6562295 5339521.** **C — arm `clone2`, the hello label `ask=2138c38e` on every cell — played them 18:32Z to 18:38Z on the
v0.30 tree export (one container, the machine otherwise idle under the fits; the identity cell IDENTICAL
on record; 36 cover files a cell, FATAL 0): 47.40% (SD 1.98, SE 0.57) — the same read as its 48.01% on
§3.8ac's twelve.** The single-64 net (arm `clone`, `ask=6ae34c26`; +6.67 points on the first twelve
against C's +7.24) was played on them first by mistake, 18:21Z to 18:29Z, and is kept as a second read
of the same question: 47.94% (SD 1.75), +0.53 ± 1.41 paired over C (+0.74 SE, ahead on 7 of 12) — the two nets
are the same abroad at this sample, as on the first twelve. A fast arm plays a cell in about 40 seconds on
an idle machine (32 games a second on twelve threads; 7.4 under §3.8ac's load). A candidate's M3 pairs
against C's cells on file; the twelve are spent by these reads whatever M1 and M2 say.

| seed | C (`clone2`, `ask=2138c38e`) | the single-64 net (`clone`, `ask=6ae34c26`) | paired |
|---|---|---|---|
| 2084753 | 45.42% | 45.58% | +0.17 |
| 3014474 | 49.25% | 49.92% | +0.67 |
| 6756708 | 51.67% | 47.42% | −4.25 |
| 8119149 | 47.83% | 48.25% | +0.42 |
| 3333333 | 48.67% | 47.17% | −1.50 |
| 8366602 | 45.08% | 49.25% | +4.17 |
| 6841788 | 46.50% | 50.25% | +3.75 |
| 1616231 | 44.67% | 46.33% | +1.67 |
| 7621259 | 47.42% | 46.50% | −0.92 |
| 1307763 | 46.75% | 46.25% | −0.50 |
| 6562295 | 47.00% | 50.83% | +3.83 |
| 5339521 | 48.58% | 47.50% | −1.08 |
| **twelve** | **47.40% (SD 1.98, SE 0.57)** | **47.94% (SD 1.75)** | **+0.53 (SD 2.50, SE 0.72), +0.74 SE, ahead on 7 of 12** | **C — v0.30's vector — on the twelve first, then C2**, each through
`MONET_ASK_MODEL` with its md5 prefix in the hello label; the pins as §3.8ac's M3. **The ship rule is
§3.8n's, paired against v0.30's vector on the twelve: at least two standard errors above zero and
ahead on a majority; ±2.00 stays the rung.** The registry change a PR for the owner — v0.31 = v0.30's
vector with `askModel: 'sestina-clone-2'`, the model as data — stacked on #49, or replacing its entry
at the owner's choice.

**Wall clock.** The extraction about five minutes across seven processes. **F1 about 4.5 hours and F2
about 14 hours**, one process each (C took 51 minutes for 410,000 decisions × 12 epochs; F1 is 2.5 × 2
that, F2 about 3.3 × F1's multiplies). **Both start only when M4's two containers have released the
machine** — 3.1 GB of the host's 31 are free with them up, and each fit holds its rows (about 7 GB);
the chain script waits on `docker ps`. M2 about 40 minutes at twelve processes; M3 about an hour. The
rung inside two days of wall clock after M4.

**Predictions, written before a row is extracted.**
- **Q1 (M1).** F1's margin over the stack's own decision 13.0–14.0 points (odds 65%); F2's 13.4–15.0
  (60%); F2 above F1 (70%); at least one fit eligible (≥ 13.2): 65%. §3.8ac's learning curve (half
  the data cost 0.46 at width 64) says the data buys about half a point at this width; the epochs and
  the width the rest.
- **Q2 (M2).** C2 against C at home: **+0.05 to +0.30 a pair** (odds 65% within; between the linear
  and the MLP-64 clones a point of agreement bought about 0.09 a pair); eligible: 45%.
- **Q3 (M3, if reached).** C2 clears §3.8n's bar against v0.30's vector at the bridge: 35%; the paired
  read +0.3 to +1.5 points (60% within).
- **Q4.** Every wall clock within 1.5× of its projection: 70%.

**After this rung.** Whatever it reads, the ask clone's ceiling under these 33 features is then
measured at two widths and two data sizes. If F2 gains less than a point of margin over C, the features
are the limit and the next term is v0.32's declare clone or the representation — not a third fit.

#### The clone's disagreements, read before the fits — 2026-09-08 09:58Z (`scripts/probe-clone-errors.mjs`)

Written before a row of M1 is extracted, so the fits are read against it. The instrument rebuilds the
stack's ranking and features at SESTINA's ask decisions on twelve held-out files (14,400 games; a 2%
sample, 13,381 decisions; the true deal known) and takes the clone's choice by the engine's own
`chooseAskByModel`:

| clone | agrees | the same half-suit and seat, another card | the same half-suit, another seat | another half-suit | the same half-suit and seat, the card aside |
|---|---|---|---|---|---|
| linear | 49.14% | 26.58% | 14.21% | 10.07% | **75.72%** |
| C (64·64) | 55.18% | 27.57% | 11.52% | 5.74% | **82.74%** |

**Half the disagreement is a card the clone cannot learn.** In 27.6% of decisions C names SESTINA's
half-suit and seat and another card of it, and in 97.5% of those the two cards sit at the same belief
p — our marginal cannot tell them apart. SESTINA's own pick among the legal cards of that half-suit at
that seat is the lowest in the engine's order 31.7% of the time and the highest 28.0%, against a random
pick's 28.5%: a tie broken at random (its spec's `rtie=1`, most likely) or by something no feature of
ours sees; either way it is not in the features, and the linear clone loses the same share (26.6%).
**The ceiling on top-1 agreement is about 72%, and C stands at 55; on the half-suit and the seat — the
choice that moves the count of completed half-suits — C agrees with SESTINA on 82.7% of decisions, the
linear clone on 75.7%.** The re-fit is read against both: the half-suit-and-seat agreement is M1's
secondary read, and the primary margin's ceiling is understood.

**Where the other half is.** The remaining 17.3% — the same half-suit at another seat (11.5%) and
another half-suit (5.7%) — is the belief: our marginal's seat for a card against SESTINA's. On every
disagreement SESTINA's ask hits 42.6% at our p 0.395 and the clone's would have hit 43.4% at 0.415:
neither alternative is the better ask by the immediate hit, so the difference is in the sequel — which
seat collects, which half-suit the team can finish. Agreement is lowest early (46.3% in the first third
of a game, 69.9% in the last) and with the most legal asks (48.4% at 81 or more): the open positions a
search sees furthest into.

**The certain hit.** One is on the table at 38.1% of SESTINA's decisions; it takes it 83.9% of the
time and C 85.9%. Where SESTINA declines (823 decisions), its ask hits 50.9% at p 0.41 — into a
half-suit it had asked before 85% of the time, one an opponent had asked 88%: it races for a contested
half-suit over banking a sure card in a quiet one, and 19.8% of those asks are gambles in our term. C
agrees with 52.5% of those declines, and its own choice would have hit 59.9%: at the margin the clone is
the more cautious player.

**What it means for v0.31 and after.** F1 and F2 can gain at most on the 17.3%; the pre-registered
margins stand (top-1 numbers, the ceiling the same for every fit), and the half-suit-and-seat agreement
is read beside them. The representation rung after it (§3.8ae's decision) is the belief's, not the
card's: a per-card view is the wrong term for a tie broken at random; the seat is the term. The count
the clone still trails by (+6% completed half-suits for SESTINA, §3.8ae) lives in those 17.3% of
decisions and in what a search sees past them.

#### Record — M1, the first fit (F1 read 2026-09-08 21:32Z; F2 running)

**F1 — `mlp` 64·64, 24 epochs on the 5% sample (1,160,665 decisions, 54.0 million rows; holdout 238,508
decisions of the files 0 mod 5) — 3 h 41 min of one core.** The holdout loss fell to the last epoch, as
C's did, and the last epoch was kept:

| fit | width | decisions | epochs | holdout top-1 | top-3 | NLL | the stack's own | **margin** | eligible (≥ 13.2) |
|---|---|---|---|---|---|---|---|---|---|
| C (§3.8ac) | 64·64 | 410,000 (a 2% sample) | 12 | 56.32% | — | — | 43.65% | 12.67 | — |
| **F1** | 64·64 | 1,160,665 (5%) | 24 | **56.56%** | 86.42% | 1.0289 | 43.73% | **12.83** | **no** |
| F2 | 128·128 | 1,160,665 (5%) | 24 | running (about 28 minutes an epoch; lands about 05:00Z 2026-09-09) | | | | | |

**Two and a half times the data and twice the epochs at C's width buy 0.16 of a point of margin.** Q1
wrote F1 at 13.0–14.0 (65%); it reads 12.83, below the band and below the bar by 0.37. The learning
curve §3.8ac drew (half the data cost 0.46 at this width) does not continue upward at this width: the
ceiling under these 33 features at 64·64 is about 56.6% agreement, and whether the width moves it is
F2's question alone. The secondary read, `probe-clone-errors` on the same twelve holdout files
(13,381 SESTINA decisions, the files of §3.8ad's addendum; C re-read beside it on the same run):

| clone | agrees | the same half-suit, another seat | another half-suit | **the same half-suit and seat, the card aside** | SESTINA's ask hits / the clone's would, on disagreements |
|---|---|---|---|---|---|
| C | 55.18% | 11.52% | 5.74% | **82.74%** | 42.56% / 43.41% |
| **F1** | 55.88% | — | — | **83.13%** | 41.29% / 45.04% |

The same picture as C's, four tenths of a point up on the seat: on the decisions where the two differ,
F1's ask would have hit 45.0% against SESTINA's 41.3% — the fit is, if anything, the more immediate
player. What is left for v0.31 is F2; what is left for the seat is §3.8af (F3, the same recipe as F1 at
the second feature set, on F1's core from 21:35Z — its first start at 21:33Z died in the fitter's loader,
which read each file in one call and Node refuses a file over 2 GiB; the largest group at 51 columns is
2.18 GB; the loader now reads in slices, and the smoke fit's standardisation is byte for byte the old
loader's — read against these numbers: eligible at holdout top-1 ≥ 57.56% with the half-suit-and-seat
agreement ≥ 83.13%).

### 3.8ae Monet v0.32 — the declare clone, read off the records and not built

**Decision row 38, taken 2026-09-08 by the standing rule.** §3.8ad named SESTINA's declare policy as the
other half of its edge and made a reader of the records' declare events the instrument its
pre-registration waited on. The reader exists — `scripts/probe-declares.mjs` — and its first read closes
the rung before a feature is written: **per completed half-suit, SESTINA declares as we do.**

#### The read — 2026-09-08 10:20Z, the instrument's first run (a records read; no cell played)

What the probe reads, with no engine view built: for every declare in a record, the true deal tracked and
what a hit had published — of the half-suit's six cards, how many the claimer held (*own*), how many a
hit had publicly placed at the seat it named (*public*), how many it placed by belief (*guessed*, and how
many of those were right); whether the six were on its team (a declare of an incomplete half-suit is
wrong by construction: a *gamble*); and the delay since the half-suit completed, in events and in the
team's own asks (asks it chose over declaring). A half-suit complete on one team cannot be asked into by
the other — no card of it is on that side — so waiting costs nothing but tempo, and the probe's count
of complete half-suits broken by a hit is zero everywhere, as it must be.

| records | side | declares a game | right | forced | gambles | own / public / guessed a declare | guess accuracy | declared at once | five or more own asks first | complete half-suits (a game) |
|---|---|---|---|---|---|---|---|---|---|---|
| the archive — 367 files, 429,726 games, every Monet from v0.9 on | SESTINA | 4.906 | 97.97% | 0.57% | 1.11% | 2.56 / 2.25 / 1.20 | 97.76% | 77.9% | 11.9% | 2,084,581 (4.85) |
| | ours | 4.094 | 98.27% | 1.93% | 0.02% | 2.70 / 2.07 / 1.24 | 97.46% | 75.1% | 16.9% | 1,759,215 (4.09) |
| 2026-09-08, the base (v0.20c's vector) — 12 cells, 14,400 games | SESTINA | 4.865 | 97.89% | 0.52% | 1.17% | 2.53 / 2.27 / 1.21 | 97.67% | 77.9% | 11.9% | 69,238 (4.81) |
| | ours | 4.135 | 98.66% | 2.15% | 0.00% | 2.70 / 2.08 / 1.22 | 98.08% | 75.8% | 16.0% | 59,541 (4.13) |
| 2026-09-08, C (v0.30's vector) — 12 cells, 14,400 games | SESTINA | 4.658 | 97.48% | 0.60% | 1.57% | 2.65 / 2.11 / 1.24 | 97.35% | 78.8% | 11.2% | 66,026 (4.59) |
| | ours | 4.342 | 99.35% | 0.85% | 0.00% | 2.72 / 2.05 / 1.23 | 99.05% | 76.9% | 13.3% | 62,519 (4.34) |

**What it says.** Per declare the two policies are the same policy to the second decimal: 1.20 cards
placed by belief against our 1.24, right 97.8% against 97.5% (99.1% under v0.30's vector — our belief
places a guessed card better than SESTINA's does); declared at once 78% against 75–77%. SESTINA's one
difference is 1.1% of its declares on half-suits its team does not hold, every one wrong — a gamble
that costs it a set each time and that we never make — and 0.6% forced declares against our 1.9%
(fewer of its players run out of cards holding an unfinished half-suit). **The whole of the gap is in
the count: SESTINA's team completes 4.81 half-suits a game to v0.20c's 4.13 (+16%), and 4.59 to v0.30's
4.34 (+6% — the clone closed two thirds of it).** A half-suit is completed by asks; a declare only
cashes it, and both sides cash it the same way. There is no declare policy to clone.

**What it does not say.** The probe reads the declare as an event, not the decision not to declare: a
player who could declare and asks instead is counted in the delay (the 22% not declared at once, the
11–17% five asks or more later), and there the sides differ a little — ours waits longer. Waiting costs
nothing in the count (the half-suit cannot be broken) and something in tempo only where the game ends
first; it is inside one declare in a hundred.

**The decision.** v0.32 is not built. The rung after v0.31 is the ask policy's representation — the
clone's 33 features are the limit at 56% agreement, and the count of completed half-suits is where
SESTINA's remaining 6% is — unless M4 says the search with the right opponent model is worth its cost,
and §3.8a's rule (100 ms an ask) still stands over that line. The instrument stays: the probe reads any
record directory in about a minute (`--records <dir>[,<dir>] [--max-files N] [--out summary.json]`).

### 3.8af Monet v0.33 — the belief's seat: the clone's second feature set

**Decision row 39, taken 2026-09-08 by the standing rule** (§3.8n: *"just pick whatever will improve the
winning percentage of Monet"*). §3.8ad's addendum located the clone's learnable disagreement with SESTINA:
not the card — 27.6% of its decisions are SESTINA's half-suit and seat with another card at the same
belief p, a tie broken by something no feature of ours sees — but the seat. On 11.5% of decisions SESTINA
asks the same half-suit at another seat and on 5.7% another half-suit, and the seat it prefers is one our
ranker ranks lower, at a lower marginal p, one that did not ask it into the half-suit, one it has not asked
before: its belief about who holds the card is not ours. Its spec says why — `rbelief=indep`, an
independent per-card belief, where ours is the joint over the set — and the clone, fed our p and our rank,
follows our belief. §3.8ae found no declare policy to clone; §3.8ac's M4 (the same seat's read from the
other side) found the search's loss abroad is not its opponent model. The rung on the table is therefore
**the representation: the same conditional logit over sixteen more features per legal ask — the
independent belief beside the marginal, and what the log says about the target's own dealings with the
asked half-suit** — fitted at §3.8ad's F1's width and data, so the features are the one variable.

**The instrument (committed with this section; nothing shipped reads it).** `ASK_FEATURES_2` in
`lib/engine/bots/imitation.ts` is `ASK_FEATURES` and, after it: `pSlot`, the slot prior — the independent
per-card belief, the target's free slots over the candidates' — of the hit; `pDiff`, the ranker's p less
it, what the coupling over the set adds; `pIndepK`, the slot prior under an ask-choice prior of strength
κ = 2.5 (the value SESTINA's spec names as `kappa`, whatever its own use of it; each candidate's slots
multiplied by 3.5 per ask it made into the half-suit, saturating at three); `targetSlotMax`, 1 when the
target is a seat the slot prior puts the card at first; the target's asks into the half-suit, their hits
and their misses (`targetAsksIntoBook`, `targetHitsInBook`, `targetMissesInBook`, each over three); the
cards of the half-suit taken from the target and the misses at it (`takenFromTargetInBook`,
`missedAtTargetInBook`); how long ago anyone last asked into the half-suit, the target last asked, and the
target last asked into it (`bookLastAskAgo`, `targetLastAskAgo`, `targetBookLastAgo`, asks over twenty, 1
for never); the opponents' asks into it (`bookAsksByThem`); the target's distinct half-suits asked and its
unidentified cards (`targetBooksAsked`, `targetUnknownSlots`); the opponent seats among the card's
candidates (`oppCands`). 49 columns. `askFeatureRows` takes the set (1 the default, its rows byte for byte
what they were — the v0.30 bank replays unchanged); `registerAskModel` tells a model's set by its width and
`scoreAsks` builds the rows it reads, so a model at the second width plays through `askModel` and through
the search's `oppAskModel` with no other change; any other width is refused. The scripts follow the set:
`gen-imitation-data --features 2`, `fit-imitation` reading it off the data's header, `gen-ask-model-module`
and `probe-clone-errors` off the model. **Cost, read on the smoke fit before this section was written
(`bench-decide`, v0.20c's vector, 16 games): a linear model at the second width 0.127 ms an ask against
the first width's 0.105 and the shipped MLP clone's 0.163** — the sixteen features cost about 0.02 ms;
§3.4a's budget is 1.4 ms a decision.

#### Pre-registration — written 2026-09-08 18:14Z, before a row is extracted at the second width

**M1 — the fit.** The data: §3.8ad's seven groups, the same 5% sample under the same salt (`--sample 0.05
--sample-salt 31`), the same holdout rule (`--holdout-mod 5`), S's features (`--override` v0.20c's vector),
extracted at `--features 2` — **the same decisions as §3.8ad's F1, sixteen columns wider** (about 1.16
million decisions, 54 million rows × 51). **One fit, F3: `mlp` 64·64, 24 epochs, Adam, batch 64, learning
rate 10⁻³, L2 10⁻⁵, the best holdout NLL kept, seed 1 — F1's recipe exactly, the feature set the one
variable.** Read as F1 is read: holdout top-1 agreement with SESTINA's choice (the primary), top-3 and NLL,
the margin over the stack's own decision on the same holdout; and beside them the half-suit-and-seat
agreement by `probe-clone-errors` on the same twelve holdout files §3.8ad's addendum used (a 2% sample),
F1 read the same way on the same files. **Eligibility for M2: F3's holdout top-1 at least 1.0 point above
F1's** (the width, the data and the epochs equal, the point is the features'), **and its half-suit-and-seat
agreement not below F1's.** The candidate carried is **C3**, F3 as data. Not eligible: the rung stops, and
the record says the seat is not in what the log and the slot prior offer either — the next term is then
SESTINA's belief itself, a per-card holder model fitted on the records' true deals, not a feature.

**M2 — at home.** `scripts/duplicate-pairs.mjs`, 2,400 pairs in twelve banks of 200, the control first
(`0.0000 +/- 0.0000`): **C3 inside S's stack against C inside S's stack** — the same one-variable
comparison §3.8ad's M2 makes for C2, so the two rungs' reads sit on one scale — and, as the anchor, C3
against S (v0.20c's vector), where C read +0.954 ± 0.146. **Eligibility for M3: C3 against C at least +2
SE above zero and ahead on a majority of the twelve banks.** Where §3.8ad's C2 is also eligible, the
higher of the two reads against C goes to the bridge first; the other after it.

**M3 — at the bridge (only if M2 is eligible).** Twelve fresh seeds by §6.5's rule under
`"monet-v0.33-confirm-12"`, drawn and written in the record before a cell is played — unless §3.8ad's M3
has already played C on its twelve, in which case those twelve and C's cells are shared and no new draw is
made. **C — v0.30's vector — on the twelve first (where not already played), then C3**, each through
`MONET_ASK_MODEL` with its md5 prefix in the hello label; the pins as §3.8ac's M3. **The ship rule is
§3.8n's, paired against v0.30's vector on the twelve: at least two standard errors above zero and ahead
on a majority; ±2.00 stays the rung.** The registry change a PR for the owner — v0.33 = v0.30's vector with
`askModel: 'sestina-clone-3'`, the model as data — stacked on #49, or replacing its entry at the owner's
choice.

**Wall clock.** The extraction about ten minutes (seven groups, three processes at a time — 4.5 GB of the
host's 31 are free with §3.8ad's two fits up; 11 GB on disk). **F3 holds its rows (about 11 GB) and starts
only when F1 has released the machine** — the chain script (`$SP/monet-v33/run-v33.sh`) waits on
§3.8ad's timeline for `fit f1 exit`, about 23:00Z; **F3 about 6 hours** (F1's epoch is 769 s at 33
inputs; the first layer is half again as wide), landing about 05:00Z on 2026-09-09, before F2. M2 about
40 minutes at twelve processes; M3 about an hour. The rung inside a day of wall clock.

**Predictions, written before a row is extracted.**
- **Q1 (M1).** F3's holdout top-1 above F1's by **+1.5 to +4.0 points** (odds 60%); eligible (≥ +1.0):
  65%. The room is the 17.3% of decisions where SESTINA's seat or half-suit differs; a fit takes a fifth to
  a quarter of it. The half-suit-and-seat agreement above F1's by +1.5 to +4.0 points (60%). Its NLL
  below F1's (80%).
- **Q2 (M2).** C3 against C at home: **+0.10 to +0.40 a pair** (odds 60% within; a point of agreement has
  bought about 0.09 a pair); eligible: 50%.
- **Q3 (M3, if reached).** C3 clears §3.8n's bar against v0.30's vector at the bridge: 40%; the paired
  read +0.5 to +2.0 points (55% within).
- **Q4.** Every wall clock within 1.5× of its projection: 70%.

**After this rung.** If F3 gains a point or more over F1, the wider net at the second width is the rung
after (F2's answer on width, stacked); if it gains nothing, the seat is not in the public log's counts and
the slot prior — SESTINA's belief is the term, and it is fitted, not featured.

### 3.9 Monet v1.0 — defined by its acceptance test and nothing else

**Monet v1.0 exists when, and only when:**

1. **Win rate ≥ 50.0% against SESTINA v1.0**, pooled over **12 seeds × 200 deals = 2,400 deals**,
   paired floor **±2.00** — so a 50.0% reading is separated from 48% at the instrument's own
   resolution. Never on three seeds, never on one cell.
2. **Every seed of the twelve is reported**, and the SD across them is published. The bridge
   correction was believable because all six seeds moved the same way; a v1.0 claim carrying one
   negative seed is a claim about a seed.
3. **The panel is monotone** — Monet beats v0.2 through v0.6 as well. A bot that beats SESTINA and
   loses to v0.5 has been fitted, not built.
4. **Declare accuracy ≥ 98.0%** (the §3.9 parity guard) and **zero fault counters** across the whole
   run.
5. **Every control of §6.2 passes**, including op coverage, and **the mirror cell is not among them.**
6. **The result is reproduced by a second, independently built arm** on the same spec. The seeds share
   a build and an adapter; §9.5's shared-adapter defect is what that is worth as a risk.

---

## 4. Tier A: the call on the four inherited items

### 4.1 A1 — done, banked, and not available to spend

The adapter guard is shipped in `bot:pf2` and every corrected number in this document already
contains it. **It is worth +3.44 points of measurement and zero points of strength.** [measured,
corrected, 6 seeds] The drafts' +4.00 came from 300-game cells on the native-FP build and is
superseded. **Delete the row; do not add it to any stack.**

The associated restatement matters more than the number: post-fix declare accuracy is **98.42%
against SESTINA's 98.46%**, which is **parity**, not "above 97%". That is what retires the whole
declaration channel as a target, and it is why §2 is about proof latency rather than about declaring.

### 4.2 A2 — REJECTED. The defect was in the adapter, and `us54` genuinely has no pass

The drafts propose changing `decide.ts:556` so that an empty hand no longer implies compulsion,
calling it an XS robustness fix. **It is not a robustness fix. It is a rules change to `us54`, and
Monet does not make it.**

**The source facts, all verified directly in `C:/Projects/FishAI/lib/engine`:**

- `mustDeclareNow` (`decide.ts:550`) returns
  `windowCannotClose(view) || (view.turn === view.seat && !viewerCouldAskIfWindowClosed(view))`.
- `viewerCouldAskIfWindowClosed` (`decide.ts:564`) returns false on `view.hand.length === 0`
  (`decide.ts:566`). Its own doc comment says it is *"exactly the engine's own `turnHolderCanAsk`,
  restated over the public view"*.
- `turnHolderCanAsk` (`helpers.ts:29`) contains `if (s.hands[seat].length === 0) return false`.
- `reduceDecline` (`reduce.ts:588`) calls it at **`reduce.ts:595`** and returns
  `err('MUST_DECLARE', ...)` when it is false.

**So `decide.ts:556` is not a trap the bot fell into. It is the bot's copy of the engine's legality
rule.** Changing one without the other makes `decide` emit a `decline` that its own reducer refuses,
in exactly the position the change targets — and the server's bot chain breaks on the first
`if (!r.ok)`, leaving the room stuck.

**And the behaviour is intended, by the owner, in writing.** `RULES_US54.md` §4 carries an `[OWNER]`
ruling: **"A cardless seat forced to declare gifts the set away, and that is intended."** A set still
resolves, which is all termination requires; a team that has run out of cards does not get to stall
the game by declining forever.

**The defect was a rules-dialect mismatch at the boundary, and the boundary is where it was fixed.**
FishLab's engine has a `pass` op for that position; `us54` does not. Translating between two dialects
is the adapter's job, A1 did it, and it is the correct place for it.

**What Monet does instead, and it is the actionable version of A2's intent.** Make the dialect
boundary explicit and *asserted*, not implicit and *inferred*. The adapter's `new_game` handler gains
a **dialect capability descriptor** — does the host have a pass? what is its win condition? does it
resolve all nine half-suits? — and every position where FishAI's rules and the host's rules differ
becomes a named, asserted translation with a counter, rather than a silent identity. **The next
dialect difference should be caught by an assertion in an hour, not by a three-point hole in a
published win rate.** [design, not measured]

**If the owner does want `us54` to give a cardless turn-holder a pass**, that is a legitimate rules
question and it is his call — but it is a change to `reduce.ts`, the invariants, and the 10,000-game
fuzz gate (`RULES_US54.md` §10 item 10), it needs `[OWNER]` sign-off in `RULES_US54.md` §3.2 and §4,
and **it invalidates every home measurement in this repository**. It is not an XS item and it is not
Monet's to take.

### 4.3 A3 and A4 — the record and the instrument

A3's remaining items are in §1.4 and land in v0.1. A4's instrument check lands in v0.1; its sizing is
withdrawn in §3.1's blockquote.

---

## 5. What will not close the gap

Each row carries the corrected measurement that kills it. Where the corrected measurement *weakened*
the case, that is stated rather than buried.

| do not do | because | bridge |
|---|---|---|
| Tune any declare threshold or eagerness knob against lock hold | Nine of ten sit behind `evClaim`, which fires on 1.7% of home declares and 0.78% abroad; `allOnTeam` rejects 99.72% of plans before a threshold is read; four of five knobs reproduce base to four decimals and the fifth buys speed at −0.97 [−2.44, +0.50] | home + defective, paired |
| Treat declare accuracy as a target | **98.42% vs 98.46% is parity.** Believed − realised is **−0.000776** over 3,858 declares, and the certainty tier is **3,795 / 3,795 exact** on one bank and **3,924 / 3,924** on another. Monet is not lying to itself about what it knows | corrected |
| Replace the greedy allocator with an exact joint maximiser **over the same marginals** | Measured null: it disagrees with greedy on 4 of ~2,400 emitted declarations, and 46.52% → 47.97% in replay against the 128-world posterior's 50.76%. **The marginals are the defect, not the allocator** | defective, paired |
| Rewrite `planClaim`'s probability without rewriting its belief | p equals the exact urn probability of its own allocation to four decimals; the shipped allocation **is** the model argmax; a joint MLE over the same marginals is worse (44.45% vs 46.85%) | home |
| Work on the forced endgame | Corrected: Monet 60.76% vs SESTINA 46.21%, Wilson intervals **overlapping**; resolving the sign needs ~40,000 **deals**. Monet may already be the better team there | corrected |
| Work on the ask *ranker* | SELECTION is **+5.49** in Monet's favour at matched positions. POSITION is **−10.38**. Effort on the ask score is effort on a symptom | defective; the starting quantity is within 0.02 pts of corrected, which pins the level but **not** the position distribution the term is about (§0.2, §7.6) |
| Ship `conceal: 1` on top of `defuse: 1` | CONCESSION §5a.3 measures conceal alone at **−0.1483 ± 0.2571** against an MDE of ~0.38, and §8a.1 lists that exact row as *below floor — not resolved*. Its paired **+0.97** with defusal does clear at 2.5×. **The asymmetry must be stated, and both must be measured against a common `defuse: 0` baseline** | home |
| Spend more on `containedPass` or ASKING §4.2's conceded-turn fix | `contained-pass` fires 6 times in 240 games; the `missTarget` tiebreak moves the ask on 0.79% of decisions; `containedPass` measured **+0.100 [−0.053, +0.253]** over 6,000 games/arm | defective, paired |
| Re-fit `declareEagerness` against a foreign opponent | **The premise is gone.** The 6.5-point cross-play accuracy gap it was fitting against was the bridge. At 98.42% vs 98.46% there is nothing to re-fit, and the ≤ +2-point estimate has no derivation left | corrected |
| Poll the window more aggressively | 3 extra polls −1.81 (unresolved), 20 polls **−4.19** (clears). The drafts' "corner of the knob" asymmetry is refuted; more polling is measurably worse at the far end and unresolved at the near one | corrected |
| Add determinization search **as the next step** | Not because it is measured negative — **that refutation did not reproduce** (§3.9) — but because it costs 578× and cannot be priced until v0.6 exists | corrected |

---

## 6. Measurement discipline

### 6.1 The standard cell

- **200 deals × 6 rotations = 1,200 games**, duplicate deals, so the deal is never a confound.
- **Build:** `g++ -O2 -std=c++20 -ffp-contract=off`, **without** `-march=native`. Native enables FMA,
  changes tie-breaks and makes FishLab's published identity digests irreproducible; the portable
  build reproduces the generic digest and **all three of their identity controls PASS on it**. Require
  all three before a game is played.
- **Opponent:** the frozen v1.0 spec, verified byte-identical in its `spec` and `allparamsSpec` fields
  to the release asset before the cell is trusted:

  ```
  v07:r12=25,rtie=1,pool=-1,oppfloor=-1,force=1000000,askfloor=-1,stall=12,s1=1,det=12,cand=4,kappa=2.5,rbelief=indep,depth=12,maxq=26
  ```
- **`--games=N` is deals**, not games. Total games = N × rotations.
- **Handshake `timeout_ms` = 90,000.** The 20 s default expires while Node type-strips the TypeScript
  engine under host contention.
- **Quiet host.** Cell wall times ranged 42 s to 1,025 s under twelve concurrent sibling containers.
- **Clean the shared bot tree.** ~75 bot packages are currently registered in it. An arm built in a
  contaminated tree measures its neighbour — the same failure mode as the roster-defuse contamination
  already on record. **Name the arms that must survive a cleanup** (`bot:pf2` and Monet's own) and
  delete the rest.
- **Bot ids are lowercased on install.** Two cells in the re-measurement failed with
  `no bot package called 'p2trS' is installed`. Register lowercase.

### 6.2 Controls — and the mirror cell is not one of them

> **This is the lesson that cost this project a published wrong number, and it belongs in the process
> rather than in a footnote.** The first version of CROSSPLAY §9 called a FishAI-vs-FishAI mirror
> *"the control that makes any number mean what it says"*. It is not a control. A mirror plays one
> policy against itself on duplicate deals, every deal is replayed with the seats rotated, and the
> aggregate is **forced to 50% by construction before a card is dealt**. Their engine prints the
> reason on every mirror cell: `MIRROR CELL: win-rate effective sample is 0 (per-deal outcome is
> deterministic). Rate denominators are halved.` **It returned a perfect 50.0000% across a
> 3.44-point hole**, because the defect affected both mirrored seats identically. **A control that
> cannot fail is not a control.** Keep the mirror as a smoke test if you like. It must never appear
> in a control table, and no milestone's acceptance may depend on it.

**What to use instead. All mandatory, all cheap.**

| control | requirement |
|---|---|
| **Op coverage** | Every protocol op exercised, **with a written expectation for each, recorded before the run**. `opPass > 0` is the tripwire that would have caught the bridge defect in an hour. Reference values on one cell pair, seed 90210: `opAsk` **51,998** · `opPoll` **363,984** · `opPass` **0 → 178** · `passfixDeclines` **184** · `opForced` **467**. **Amended 2026-09-01 on the owner's sign-off** — the previous row (50,649 / 354,303 / 176 / 182 / 445) was summed from `bot.log`, where every seat process inherits one descriptor and keeps its own offset, so seats overwrite one another and the total loses about one process in 36. Superseded values are in §8.1; the evidence that settled it is in §3.1 item 3. **Collect from a per-process JSON file, never from `bot.log`,** and cross-check the total against the engine's own `events/game` |
| **Byte-exact null arm** | The arm with the mechanism off reproduces the shipped policy to four decimals. Worked precedent: `bot:fishai-base` reproduced the published defective ladder exactly (three-seed mean 24.2222% against the published 24.22%), and `arm_passfix` reproduced `bot:pf2` at 28.25 / 52.3193 / 98.42 / 9.30118 |
| **Cross-instrument identity pin** | A newly built arm reproduces a *known* arm's numbers on a *known* cell before any of its own numbers are read |
| **Paired deals** | Both arms of every contrast play identical deals and rotations, and every contrast is reported against the **paired per-deal** floor |
| **Fault counters** | `planMismatch`, `booksDisagree`, `successHolderClash`, `viewInvariant`, `declareShapeBad`, `traceFallback`, `askNotAsk`, `forcedOwnTeamOut`, `forcedNone`, `pollNotWindowMove`, `passNotPass` all zero; `auditViolations` zero; action-limit games 0%. **Necessary, not sufficient** — all eight read zero across the defective run |
| **Calibration harness** | From v0.5: believed vs realised per decile on ≥ 20,000 decisions, on every cell |
| **Completion** | Every cell must have produced a win-rate line. Cells have died silently on handshake timeouts. **Check, do not assume** |
| **Home regression** | Every shipped change gets ≥ 800 `us54` duplicate pairs before it is called a ship |

> **Correction to the op-coverage assertion the audit proposed.** *"`opForced` within 0.01–0.05 per
> game"* **would fail on every corrected cell.** `opForced` counts forced *polls received* and runs at
> **0.371/game**; the 0.01–0.05 band belongs to the engine's `forced decls` line, which counts
> declares *emitted* and runs at 0.02/game. **The assertion must name which of the two it means.**
> [measured, corrected]
>
> Two later facts, both from Monet v0.1's run and both **pending the §3.1 item 3 control**. First,
> the `0.371/game` here is 445/1200 and therefore moves with the disputed count — the same cell
> measured with the per-process collector gives `0.389/game`. Second, and independent of the
> dispute: **`opForced` is far more seed-variable than one cell suggests.** Across six seeds it
> reads 467 / 509 / 666 / 693 / 566 / 592, a mean of **0.485/game** over a range of 0.389–0.578.
> A single-cell `opForced` figure should not be quoted as *the* rate, and the ±30% per-game
> coverage band written for the five non-reference seeds fails on three of them for that reason —
> a fault in the band, not in the arm.

### 6.3 Power — the floors are per deal

The engine prints both floors on every cell, verbatim:

```
power  98/sqrt(N): +/-2.83 pts unpaired over 1200 games; +/-6.93 pts over 200 deals (the paired
       floor).  1 pt needs 9604 games, 0.5 pt 38416, 0.25 pt 153664
```

**The per-deal floor governs.** A cell is 1,200 games but only 200 deals, replayed six ways.

| sample | seeds | **deals** | **paired floor** |
|---|---:|---:|---:|
| one cell | 1 | 200 | **±6.93** |
| three seeds | 3 | 600 | **±4.00** |
| five seeds | 5 | 1,000 | **±3.10** |
| six seeds | 6 | 1,200 | **±2.83** |
| twelve seeds | 12 | 2,400 | **±2.00** |
| — | 48 | 9,604 | **±1.00** |

> **Correction to the drafts.** `NEXT-GENERATION` §6.3 labels this row **"N (games)"**, which
> understates every floor in the programme by **2.45×**. Under that label a standard cell reads
> ±2.83 when it actually resolves ±6.93; B3's four-arm design was specified at 2.45× the power it
> had; the "9,604 games per point" line and the forced endgame's "~40,000 games" are both quoted in
> the wrong unit. **Wilson intervals of ~±2.4 points per cell treat 1,200 games as independent draws.
> They are not.**

**Rules that follow, and they are binding:**

- **No milestone is accepted on a single cell.** Any single-cell difference under ~6.9 points is not
  resolvable, full stop.
- **Do not run a win-rate A/B whose predicted effect is under the cell's floor.** v0.2 (0.1
  cards/game) and the forced endgame (≤ 0.48 points, ~40,000 deals) both fail this test and are
  verified on mechanism counters instead.
- **Report the interval, and report when the effect is under the floor.** CONCESSION §8a.1 already
  lists which published numbers sit below their instrument's resolution. Do not add to it silently.
- For home `us54` duplicate-pair cells, use **that cell's own SD**, never the generic one: the generic
  per-pair SD is 3.15–3.44 sets, CROSSPLAY §3's harness runs at 4.57–4.95, and two-adaptive-arm cells
  run far lower. Interval coverage at N = 400 is **8.0% false positives [5.2%, 11.7%]**, excluding 5%.
  **Prefer N = 800.**

### 6.4 The opponent panel

| opponent | why it is in the panel | Monet's inherited level |
|---|---|---:|
| **SESTINA v1.0** | the headline and the target | 27.83% (3 seeds) / 27.08% (6) |
| **v0.6, v0.5** | non-searching, and Monet loses to both. A change that closes the SESTINA gap without moving these is a fit, not a fix | 32.86% / 33.31% |
| **v0.4** | **the rung Monet fails, and the rung that carries the lineage's whole strength.** Every belief milestone is gated here | 34.25% |
| **v0.3, v0.2** | the rungs Monet clears. Regression guards | 62.06% / 67.42% |
| **the oracle arm** | the **ceiling control** for the cashing channel. Built once, on the shipped belief at λ = 0 — **it must be re-built on each new belief before it is quoted as that build's ceiling** (§3.6 item 5) | 33.58% (3 seeds), shipped belief only |
| **home `us54` self-play** | every shipped change needs a home regression | — |
| ~~FishAI mirror~~ | **struck.** Zero effective sample; see §6.2 | — |

`v01` is not in the panel — the engine rejects the spec.

### 6.5 Holdout discipline, and the seeds are all spent

**Every seed this project has named in an artifact is now spent.** The headline uses 90210 / 4242 /
7011001 / 13579 / 24680 / 31415; the ladder uses the first three; 31415 was additionally burned as
the defusal holdout; and 31 / 515253 — the "reserve" the drafts name — were used as fitting banks in
the original ablations.

**Rules:**

- **Draw three new banks and write them into the milestone's artifact before the fitting cell runs.**
  Reserved from this document forward and not to be used for any fit: **8675309 / 271828 / 1618033.**
  Drawn 2026-09-03 and written down before any cell, by the engine's own `hashSeed`: the licence
  term's 24-seed cell (§8.3 decision 5) spends **18 fresh seeds** from `"monet-v0.4c-lambda-24seeds"`
  — 1517444 9243041 8193645 7365267 5020863 4180429 4388333 4983432 9686644 6224971 5298162 6588311
  7776405 8102136 4867666 8667566 2053779 8555342 — beside the six on record; v0.5 (§3.6) fits on
  **six** from `"monet-v0.5-fit-6"` and confirms on **twelve** from `"monet-v0.5-confirm-12"`, both
  listed there. A seed that has been read is spent for fitting anything.
  The 0.3-versus-0.6 confirmation (§3.4c) spends **24 fresh seeds** from `"monet-v0.4c-lambda03-confirm-24"`:
  4118411 5513005 1242624 1908182 8217906 4364985 7116864 2154839 9236699 5736580 4285114 3981270
  2579303 3992572 1229699 8314641 7420129 4330275 5928678 3267537 3469159 9730512 9455971 9195024.
- **Fit on 90210 / 4242. Confirm on 7011001 plus at least one reserved bank.**
- **Never move a shipped roster constant on a cross-play fit.** CROSSPLAY §7 and §9.6. A constant that
  moves because SESTINA liked it has burned SESTINA as a holdout.
- **Common baseline.** Anything that promotes licensed asks — the defusal appetite, licence
  conditioning, `conceal` — is measured in a factorial against a common `defuse: 0`, λ = 0 baseline.
  **Measured against its own baseline the calibration fix looked like a flat +0.04 ± 0.41; against
  the common one it is a substitute.** This has already cost the project one wrong conclusion.
- **Name which banks are spent and which are held in every document that quotes a number**, or the
  holdout rule cannot be enforced by a reader.

---

## 7. How we will know Monet is not fooling itself

The bridge defect is the best-documented failure this project has, and it happened despite a control
table, two independent adversarial audits, and eight fault counters reading zero. The lesson is
specific enough to be operationalised.

**7.1 A counter reading zero where zero is impossible is a defect, not a coverage gap.**

`opPass` read **0 across 3,600 games** and was recorded in the first version of CROSSPLAY §9 as
*"unreached, not verified"*. It was not an unreached branch. It was the symptom, printed in the
artifact, of a three-point hole. It now reads 176 on a single cell.

**The rule Monet adopts:** every counter gets a **written expected range before the run, not after**.
A counter outside its range halts the cell. **Zero is a value that must be explained, never filed.**
If a zero has no written explanation, it is a defect until proven otherwise.

Two zeros in the current codebase *are* explained, and they are the template for what an acceptable
explanation looks like: `conceal` fired on **0.000% of 10,370 asks** because it is switched off at
every shipped roster tier (`style.ts:208`), and `contained-pass` fires 6 times in 240 games because
the position it needs is rare. Both are written down. Neither is a defect.

**7.2 A control that cannot fail is not a control.**

Any control whose result is forced by construction is deleted from the table, not demoted. The mirror
cell is the worked example (§6.2). When a control returns a perfect score, the first question is
whether it *could* have returned anything else.

**7.3 An audit returning "sound with caveats" is a fact about the audit.**

Two independent adversarial audits passed the defective bridge. Record that as evidence about audits,
not as reassurance about the code. **Audits do not substitute for an assertion that fires.**

**7.4 Mechanism markers move before win rates, so measure them first.**

Every milestone in §3 states a mechanism marker as its **primary** metric and win rate as its last.
Win rate is the noisiest measurement in the harness — a standard cell resolves ±6.93 — and it is the
slowest to respond. Lock hold, DEAD counts, calibration bias and declaration counts all resolve at
far smaller N, and each of them names *which* mechanism moved.

**7.5 The new self-deception risk that arrives with the posterior, and the instrument for it.**

**From v0.5 onward Monet emits a probability where FishAI emitted a certainty, and a probability can
be wrong in a way a certainty cannot.** The current evidence is unusually clear about which tiers are
trustworthy and which are not: [measured, corrected, seed 90210]

| tier | n | believed | realised | believed − realised |
|---|---:|---:|---:|---:|
| certain-claim | 3,110 | 1.000000 | 1.000000 | **0.000000** |
| own-book-claim | 685 | 1.000000 | 1.000000 | **0.000000** |
| ev-claim | 30 | 0.745540 | 0.666667 | +0.078873 |
| must-declare | 24 | 0.484425 | 0.583333 | −0.098909 |
| forced-claim | 8 | 0.233917 | 0.625000 | −0.391083 |
| **all** | **3,858** | 0.993003 | 0.993779 | **−0.000776** |

**The certainty tier is exact — 3,795 / 3,795 on this bank and 3,924 / 3,924 on a second.** And
**`ev-claim` is not calibrated and is not miscalibrated: it has no population.** Its believed −
realised is **+0.0789 against SESTINA and −0.1291 against v0.5** — the sign flips between banks on
n = 30 and n = 34.

**The consequence for Monet is exact and uncomfortable: today 96.2% of declares carry zero uncertain
cards, and the posterior's entire purpose is to move them into a tier that currently has thirty
samples and an unstable sign.** So:

- **The calibration harness ships before the posterior does**, not alongside it (§3.4a acceptance item
  1). Believed vs realised, per decile, ≥ 20,000 decisions, on every cell.
- **The declare-accuracy parity guard (≥ 98.0%) is a hard gate at every milestone from §3.4b.** Monet
  inherits parity with the frontier on the one channel it has already won. Trading it for speed is
  the single most likely way for this roadmap to produce a worse bot with a better story.

**7.6 Never quote a number across bridges.**

The whole re-measurement exists because a defective-bridge level was about to be subtracted from a
corrected-bridge level, which would have priced the project's largest rewrite at about +2 points.
**Every figure in this document carries its bridge. Every future figure must too.** A difference
between two bridges is not a measurement of anything.

**And "replay over recorded positions" is bridge-independent only for claims about the decision
function *given* a position.** It is not bridge-independent for any claim whose answer depends on
which positions arise — the allocator comparison (46.52 / 47.97 / 50.76, §3.4b and §5), the
ownership-onset shares (2.90%, 12.73%, §3.4b) and the POSITION/SELECTION decomposition (§0.2) are all
of that second kind, and all were replayed over positions generated by an arm that spent ~253 extra
sets per cell. **The distinction was asserted as a category and never tested. Re-recording one cell
of positions on `bot:pf2` and re-running one replay settles it, and it has not been run.**
[inferred] Until it is, every `[defective]` label on a distribution-dependent replay means
*unverified*, not *safe*.

---

## 8. Numbers this document refuses to quote, and what is still open

### 8.1 Withdrawn from the drafts

**Amended 2026-09-01 — the §6.2 op-coverage reference row.** Superseded, and superseded by an
amendment to a *pre-registered* expectation, which this project otherwise forbids. It was allowed
here because the correction came from outside the disputed measurement: the engine's own
`events/game` (101.116 × 1,200 games × 3 side-A seats = **364,018** expected polls) is produced by
FishLab's code, not by either counter, and the replacement lands within **0.009%** of it while the
pre-registered row is **2.67%** short. The defect is `bot.log` descriptor sharing, and losing one
seat process of 36 predicts the old figure to within 0.12%.

| counter | withdrawn | replacement |
|---|---:|---:|
| `opAsk` | 50,649 | **51,998** |
| `opPoll` | 354,303 | **363,984** |
| `opPass` | 176 | **178** |
| `passfixDeclines` | 182 | **184** |
| `opForced` | 445 | **467** |

**The rule this does not repeal.** A result may not rewrite the expectation it was tested against.
An amendment needs a third source that neither side of the dispute produced, and it is recorded
where the old value stays visible. Anything less is choosing the answer you wanted.

| withdrawn | was | status |
|---|---|---|
| **+4.00** for the bridge repair | A1's gain | superseded by **+3.44** [measured, corrected, 6 seeds], and **already banked** — not available to any stack |
| the **5.24-point declare-accuracy deficit** | the mechanism of the loss | **reversed.** 98.42 vs 98.46 is parity |
| **24.22% / 30.17% / 24.42% / 69.83%** | levels vs SESTINA | all defective-bridge. Corrected: **27.83% / 33.58% / 27.83% / 66.42%** |
| **"the remaining ~40 points are unattributed"** | §5.2's conclusion | **double-counts.** It uses the A-vs-B spread instead of the gap to even. Corrected: **16.42 points** |
| **"C1 alone, ~30% against SESTINA"** | §5.3's step one | **invalid as written** — it invites a cross-bridge subtraction. The oracle is **33.58%**, and the delta **+5.75 survives exactly** |
| **+3.333, positive on all five seeds** | the defusal appetite | **+2.81 on six seeds, positive on 5 of 6 — seed 24680 is −1.83 — and it does not clear its floor** |
| **"the ladder peaks at 4"** | the appetite's shape | **unresolved.** Every rung-to-rung contrast above 0 is inside ±3.10 |
| **+7.0 for λ** | the least-supported large number | **supported, but it is a number about a different bot**: +7.83 at `defuse: 0`, **+3.71** on the shipped configuration |
| **+1.91 for the denial component** | C2's price | **does not clear.** Corrected +2.58 against a ±4.00 paired floor |
| **−3.7 to −4.2 for search** | §4.1's refutation | **did not reproduce.** 26.75 / 28.00 / 27.19 against 27.83, all unresolved |
| **"196 of 299 wrong declares in the terminal half-suit"** | A4's sizing | **the sizing does not survive.** 24 of 3,858 traced; the terminal bucket is unobservable from the guest side, not empty — the implied total is **24–69**, not 299 |
| **"the mirror makes any number mean what it says"** | the control table | **void** (§6.2) |
| **"N (games)"** on the power table | §6.3 | **wrong unit.** The per-deal floor governs; every floor in the drafts is 2.45× too tight |
| **v0.4 at 30.00%, v0.3 at 55.17%** | the lineage anchors | defective-bridge. Corrected: **34.25%** and **62.06%** |
| **64.08%** forced-endgame accuracy | C3's abroad figure | quote **62.5%** from the brief instead; corrected the channel reads 60.76% against SESTINA's 46.21%, **overlapping** |
| **"~15×"** for per-decision adaptation | CONCESSION §0's table | quote **11–12×** from CONCESSION §8's body, which is the measurement. Fix the table there too |

### 8.2 Open questions this roadmap does not answer

- **The defusal ladder's peak is not located.** Five seeds per rung buys ±3.10 and every contrast
  among rungs 0.5–8 is smaller than that. Resolving it needs ~4× the deals per rung. v0.4 is allowed
  to conclude "unresolved" and freeze.
- **The `r12` denial component's win-rate price is unresolved** at +2.58 against ±4.00. Needs ≥ 1,200
  deals per arm.
- **The forced-endgame sign is unresolved** and needs ~40,000 deals. Not worth it.
- **The defuse × λ interaction (−4.12) does not itself clear** at 1,200 deals per arm, though both
  main effects do. The substitution is established; its size is not.
- **The home calibration figure was not re-measured.** The drafts' "+0.0010 over 3,055 home declares"
  is outside the cross-play instrument; a second cross-play bank (v0.5, 4,025 declares,
  all-tier −0.000092) was substituted and is labelled as such.
- **~45 of Monet's wrong declares per cell are invisible to the guest-side trace** (it sees 88.3% of
  side-A declarations, 3,858 of 4,367). The total is 24–69 rather than 24, and **the terminal
  half-suit is exactly the bucket the guest seat cannot see** — the engine's arithmetic says it is
  declared in about 94.6% of games, so its wrong-declare share is a residual of the 24–69 range and
  is not measured. Reading it out needs an engine-side declare log, not a guest-side trace.
- **The base rate of teammate-missed asks among all events in the lagging window** is not counted.
  Without it, §3.5a(a)'s 21.6% is a last-event attribution, not a lever, and §3.5a's first item is
  sized on an unverified premise. It is a count over an event stream that already exists.
- **Whether search over a *correct* posterior is worth anything** is the single largest unknown in
  this roadmap, and it cannot be measured until §3.4b exists (§3.5c).

---

### 8.3 Decisions waiting on the owner

| # | decision | state |
|---|---|---|
| 1 | ~~**Amend §6.2's pre-registered op-coverage row?**~~ **RESOLVED 2026-09-01 — amended on the owner's sign-off.** See §8.1 for the withdrawal record and §3.1 item 3 for the evidence. Original text: Three independent facts say the row was measured through a lossy channel and the true values are `opAsk` 51,998 · `opPoll` 363,984 · `opPass` 178 · `passfixDeclines` 184 · `opForced` 467 (§3.1 item 3). The row is left as written regardless, because a result may not rewrite the expectation it was tested against. Amending it is Allen's call. | **open** |
| 2 | ~~**Should Monet play the post-clinch phase at all?**~~ **DOWNGRADED 2026-09-01 — it cannot change a result.** `clinchTarget` is 5 of 9 and `2 x 5 > 9`, so both teams cannot clinch; sets are never taken back, so reaching 5 is a permanent lock. **The winner under `us54` and under the host's play-all-nine is therefore identical by construction**, and the 73.9-76.5% of seat-games that run past the clinch cannot change who won. An earlier note here called it the largest un-modelled region of the foreign game and implied it might be worth points; that was wrong and is withdrawn. **What survives is a measurement hazard, not a strategy one:** the per-decision metrics the whole diagnosis rests on — ask accuracy 52.32 vs 57.38, lock hold 9.30 vs 2.92 — are summed over all ops, including the **47,868 of 416,627 (11.5%)** played after the game was already decided. If Monet behaves differently there, those headline figures are contaminated. **v0.2 splits them pre/post clinch**; nothing may be tuned against the unsplit figures after that. **DELIVERED at v0.2, 6 seeds x 7,200 games, and the split changes two readings.** (a) *Declare accuracy.* The pooled 98.32 / 98.35 parity is contaminated: on the LIVE game FishAI is **ahead**, 99.24 vs 98.18, +1.07 pts, positive on 6 of 6 seeds (sign test p = 0.031 two-sided, per-seed range +0.64 to +1.50; declares cluster within a deal, so this is a paired sign test and NOT a pooled binomial interval). The post-clinch column reverses it, -4.87 — but that column is a phase `us54` does not have and **carries no roadmap target**. (b) *Lock hold.* Splitting it by when the set was CASHED was wrong: the quantity is a DURATION that straddles the clinch, so a lock formed while the deal was live and cashed after it ended had its whole wait credited to post. Split AT THE CLINCH instead, the live-phase wait is **8.44 events, not the 6.72 the cash-time bucketing reported**, and the live-phase ratio to SESTINA is **2.96x** — indistinguishable from the pooled 2.96x, where the cash-time shape had suggested 2.41x live against 4.24x post. **The apparent "the lock problem lives after the clinch" contrast was an artefact of the bucketing.** Ask accuracy is the one metric the split leaves alone: the deficit is -4.95 pre and -5.11 post against -5.08 pooled. | **downgraded; the split is DELIVERED at v0.2** |
| 3 | **`bounded.ts`'s cost model** (§1.5). A joint posterior has no atomic-fact decomposition, so the bit budget becomes undefined. v0.5 must choose in writing between confining the posterior to the unbounded arm and giving BOUNDED.md a new cost model. **Taken for v0.4a and v0.4b by construction (2026-09-03): both are reads of a finished `Knowledge` behind Monet-only style knobs, so the posterior is confined to the unbounded arm and the cost model is untouched — §3.4a's and §3.4b's scope decisions.** v0.5 may reopen it if the readout wants the bounded arm to carry a posterior. | taken by construction; v0.5 may reopen |
| 4 | ~~**Move Monet's `defuse` to 0, or buy the cell that would decide it?**~~ **RESOLVED 2026-09-03 by the owner's direction: neither. The appetite becomes a function of the state in v0.5 (§3.6b), and 0-versus-1 is moot once the scalar is a table.** Original text: §3.3b: the home ladder resolves rung 0 ahead of rung 1 on both banks (+0.24 ± 0.19, +0.23 ± 0.20 sets/pair) and the bridge reads it at +0.98 inside ±3.10 — frozen at 1 by the roadmap's own rule. The abroad cell that resolves it costs roughly ten times the deals per rung. Either answer is a v0.3.1, not a v0.4 item. | **resolved by direction — v0.5, §3.6b** |
| 5 | **Put λ back on the marginal base?** §3.4a item 8: the rule written before the run (inside ±2.83 → subsumed, out) took it out at +1.83 (5 of 6). Every other instrument leans the other way and none abroad clears its floor — panel +2.44 (3/3) and +0.81 (2/3), home +0.24 ± 0.24 and +0.32 ± 0.24 sets/pair (resolved, small) — and the λ-on arm is the one that clears item 4 (33.78% against 31.94%), at the price of the calibration marker (+0.049 aggregate over-statement abroad, worst decile 0.17 against 0.08). The abroad cell that resolves it is 24 seeds per arm (±1.41, about 25 minutes of bridge). §3.4b's joint is the mechanism that prices the interference explicitly (§3.4a's amendment) and re-runs the 2 × 2 with λ as a factor; the cheapest answer is to wait for it. **Second reading, v0.4b (§3.4b item 8): +1.57 on the joint (5 of 6, inside ±2.83), home +0.22 ± 0.24 and +0.32 ± 0.24, the same calibration cost. Three readings, one shape — a point or two abroad inside the floor, a quarter of a set per pair at home, +0.05 of over-statement — and nothing in v0.4b priced the interference. The 24-seed cell (±1.41) would resolve it; otherwise the wait is for v0.5's readout or the owner.** **Delegated to the project by the owner on 2026-09-03 — "do the research and make the decision based on what most improves Monet's capabilities and winning probability" — so the 24-seed cell this row prices is running on 18 fresh seeds (§6.5) beside the six on record, with an exploratory λ = 0.3 arm; its reading and the decision are recorded at §3.4b's addendum when it lands.** **RESOLVED 2026-09-03 (§3.4c): +1.88 paired over 24 seeds, ahead on 22, clearing ±1.41 — the term ships on v0.4c; its cost (+0.050 over-statement abroad, none at home) and the finding that it buys tempo rather than accuracy are on the record, with the 0.3-versus-0.6 confirmation pre-registered.** | **resolved — v0.4c** |
| 6 | ~~**The row-3 choice (§3.5b): stop in-browser at v0.4b-era strength, split the engine for a searching lab arm, or publish the negative result?**~~ **RESOLVED 2026-09-03 — the owner chose a fourth option: keep building the fast policy toward 50%, as v0.5 opponent reading (§3.6), v0.6 communication (§3.7) and v0.7 the search arm through §3.5c's cost-first test (§3.8); v1.0 stays §3.9, restated as about 50% or a significant win (§0). The project's recommendation stands on the record beside the call.** Original text: **The row-3 choice (§3.5b): stop in-browser at v0.4b-era strength, split the engine for a searching lab arm, or publish the negative result?** The gate read 32.75% on v0.4b — third row — with the decomposition written beside it (§3.5b's record). The project recommends option 3, with option 2 taken only if the frontier claim is wanted and only through §3.5c's cost-first test (search over a calibrated posterior is the one untested cell; its price is 300 – 600×). The one honest lever the record has not built is communication — asks chosen to reveal, the handoff's +30 points of compelled-declare accuracy at 0.13 per game — sized by the oracle at +6.75 and by nothing yet that a bot could play. v1.0 stays defined by §3.9 alone. | **resolved — keep building** |
| 7 | **v0.5's arms read +0.4 abroad, inside the ±2.00 floor (§3.6c): ship `choiceKappa` anyway, buy the seeds that would decide it, or move on?** The rule as written ships nothing. Three arms agree on +0.37 to +0.47 (0.6 – 1.0 × SE); reading +0.4 at 2 × SE would take about a hundred seeds, an hour of bridge. The markers say the prior over-states against SESTINA (calibration +0.021 → +0.046 at κ = 1) and buys ask accuracy, not sets. **Recommendation: move on.** `choiceKappa` stays in the code off the vector, v0.6 is built on v0.4c, and if a later rung changes the calibration picture the twelve cells are re-run then (35 minutes). | open |
| 8 | **After v0.8: four levers measured, none moved the number — what is the next rung?** Belief (§3.6, +0.47 abroad inside the floor), communication (§3.7a, behind at home), search (§3.8a, a no-op at the budget; the post-hoc lock-only leaf's abroad read is recorded there) and the declare (§3.8b, +0.08 abroad, exact to ±0.16) are each real-and-small or null against SESTINA v1.0 on twelve seeds, and the oracle ceiling (§3.6c, 38.28%) says the 15 points to the owner's 50% are not in card knowledge at all. Three ways forward, in the order this document recommends them: **(a) an attribution rung** — full-information records of Monet against SESTINA from the bridge (their engine's game output is data, not code), split by phase and mechanism to say where the 1.2 sets a game go, before any further mechanism is built; **(b) stop at v0.4c** as v1.0's vector and run §3.9's acceptance as written; **(c) another mechanism on a hypothesis this document cannot yet support** — the declare bar re-fitted against SESTINA's theft rate (the adaptive risk/benefit the owner asked for; §3.7a's home read says the bar is right at home, and abroad it has never been read). The recommendation is (a), then (b) or (c) on what it finds. | **taken 2026-09-03 — the owner chose (a)**; the study is §3.8c, and its readout writes row 9. |
| 9 | **After the attribution study (§3.8c): the rung is the ask's value beyond its hit.** SESTINA's 1.09 extra cashed sets a game are 40% the even sets, 31% steals from Monet's majorities, 29% its own conversion; at SESTINA's decisions Monet's counterfactual hits 62.5% to SESTINA's 55.7% (SE 0.08, every seed, every holding bucket) and SESTINA wins 65.7% — the hit chance is not the value of an ask, position is, and a hit publishes a location the opponent takes back. **Recommendation: v0.9, the priced ask** — the scorer gains two terms beside the hit: what a hit gives away (the chance the published card is taken back before the set is cashed) and what a miss reveals or learns; fitted at home on the instrument's own markers (the counterfactual surplus at the opponent's decisions, the hit rate by phase, the steals row) and confirmed abroad on twelve fresh seeds at ±2.00. **Second: (c), the risk bar on the declare**, bounded by R4 at about 0.2 sets a game (SESTINA cashes a lock in 4.3 events at 98.1%; Monet in 7.8 at 99.1%). | **taken 2026-09-03 — the owner chose v0.9 ("build v0.9 by your recommendation"); CLEARED 2026-09-04**: contest 0.6 at +4.04 paired against v0.4c on twelve fresh seeds, ahead on all twelve (§3.8d). The exposure charge (the take-back half of the recommendation) is the forward bank. (c), the declare risk bar, stays second. |
| 10 | **After v0.10: the ask ranker's terms are measured out — what is the next rung?** The contest credit moved the even sets and the majorities and shipped (+4.04); the exposure charge on top of it is worth +1.07 on twelve seeds, real and under the floor (§3.8e). SESTINA's remaining 0.73 sets a game over v0.9, by the deal's split on v0.9's twelve base cells of this rung (14,400 games): **47% is the two-against-four bucket** — SESTINA converts its four-card majorities 70.9% of the time, Monet its own 62.5% — 28% the even sets (46.0% to Monet), 21% the one-against-five (SESTINA 87.4%, Monet 81.8%), 4% the rest. Where a majority becomes a set is the declare: SESTINA declares 4.18 sets a game at 98.2% right and holds a lock 5.3 events; Monet 3.37 at 98.9% and 5.9, on a fixed threshold of 0.775 that does not ask what the wait costs. **Recommendation: (c), the risk bar on the declare** — a declare threshold that prices the position (the chance of being right against what a wrong declare gifts and what waiting concedes: the licence the opponents keep while the set is open, the take-back the records count) in place of the fixed 0.775 — the owner's own direction of 2026-09-03 (adaptive risk/benefit), bounded by §3.8c's R4 at about 0.2 sets a game, which at v0.9's exchange rate (0.27 sets a game bought +4.04) is a rung. Fitted abroad on three fresh seeds, confirmed on twelve at +2.00 over v0.9, its markers the declare count, accuracy and gifts and the lock hold. Second: the closing ask at four and five cards, where SESTINA's asks hit 33.8% to Monet's 32.9% at the same holding. Not recommended: a third term on the ask ranker. | **TAKEN 2026-09-04** — the owner chose (c); §3.8f priced it on the records before building it. |
| 11 | **After §3.8f's records: the declare's lever is not the bar.** Priced on v0.9's own records at the earliest window a rule fires, every bar and every guess-count-aware form is worth under 0.02 sets a game, because a set the other side gets was never a lock and a set Monet cashes anyway pays nothing for coming earlier. What the records found instead is a bridge translation: Monet's home compulsion (`MUST_DECLARE`) answered into the host's optional poll, the lowest seat guessing while a teammate is certain, at four sets — 17 won games handed over in 1,200 on the seed read. That is fixed in the bridge (MUSTFIX) and measured paired on twelve seeds; it is not a rung. **The next rung, on the corrected base:** SESTINA's 0.37 declarations a game at positions Monet's chain rates under 0.5 (right 84%, Monet's own plan right 81% there) are an inference gap — its belief is sharpened by an ask-choice prior and determinizations, Monet's chain is an under-confident product of conditionals (two guesses at p 0.3–0.5 are right 54%). The candidates are §3.6's choice prior on the plan's table and §3.8b's consensus at a calibrated bar, both measured small at home on v0.4c and never abroad on v0.9; the other candidate is the closing ask at four and five cards (row 10's second). | **TAKEN 2026-09-04** — the owner chose the records study first (§3.8g); row 12 carries its verdict. |
| 12 | **After §3.8g's study: the two-against-four bucket is the closing ask.** On 14,400 corrected games, replicated on 28,800 old-bridge ones to a tenth of a point, SESTINA chases an opponent-held card of its own majority at 36.2% of the decisions where it can and Monet at 31.6% (SE 0.11), converts the majorities it chases 68.7% of the time to Monet's 59.8% (SE 0.26) and 6 events sooner, and Monet rates 21% of the missing cards as already its own (SESTINA's positions 11%) and chases those at half the rate. Where every missing card is known to sit with an opponent both policies chase only one decision in five, preferring another certain hit. The bound is 0.39 sets a game, +5.8 points at the exchange rate. **Recommendation: v0.12, the closing ask** — a `pickAsk` credit for an ask that closes the side's own four- or five-card majority, in two forms (weighted by the side's holding as the seat knows it; weighted also by the marginal's chance the card is not the side's own), fitted abroad on three fresh seeds by §3.8d's rule and confirmed on twelve at +2.00 over the corrected v0.9 (≥ 42.1%); the honest prior for a third ranker term is v0.10's, under the floor, against a bound three times a rung. Not recommended: a calibration correction to the marginal alone — the belief explains the chase's dullness but not the preference. | **ANSWERED 2026-09-04** — built as v0.12 (§3.8h) and measured at +0.583 paired, under the floor. The rung the study named is real and small; the belief form is measurably worse than useless. Row 13 carries what follows. |
| 13 | **After v0.12: the closing credit is worth a quarter of a rung, and the gate is why — lift it, or change axis?** The credit does exactly what §3.8g asked and reads **+0.583 paired (SE 0.23, 9 of 12)** against a +5.8-point bound. It fires at 27.4% of ask decisions and moves 1.4% of the asks abroad, six firings in seven one card short of completing, buying a seven-point-worse hit on the asks it moves. Every marker moved as written by about a tenth of its gap. The reason the rung is a tenth of the bound is structural and was pre-registered as limit 1: the credit is gated below every certain hit, so it never reaches an **uncertain** chase, and uncertain chases are where SESTINA's 36.2%-against-31.6% lead actually sits. §3.8g does not license lifting the gate — it measured the one-in-five preference only where every missing card is *known* to be with an opponent, which is not those positions. **Recommendation: v0.13, the chase appetite** — a second, separately fitted appetite paying the same `lock` credit to uncertain chases, pre-registered as its own arm with its own dose ladder and with the never-chased episode share (Monet 83.5% ever chased against SESTINA 89.2%; the never-chased episodes are taken by the opponents 61.9% of the time) as the marker it must move. It is the one rung the study's numbers still point at, and it should be the **last ranker term tried**: three in a row have read between +0.5 and +1.1 against floors of +2.00, which is itself evidence that the ask ranker is close to spent and the remaining 4.4 points are somewhere else. Not recommended: refitting the belief form at a smaller dose — it lost on six seeds of six and the mechanism for why is measured. | **ANSWERED 2026-09-04** — built as v0.13 (§3.8i) on the owner's word and **closed on the fit**: every eligible dose loses, monotonically to −7.56, and the twelve confirmation seeds were never spent. The gate was not the story. The credit moved 2,000 to 7,200 asks and gave up an ask that hit 100.0% for one that hit 29.7–50.1%, yet the chase rate did not move — because a seat cannot tell a chase from a sure miss into its own majority. Row 14 carries what follows. |
| 14 | **After v0.13: the ask ranker is finished, and the binding constraint is the inference — what is the next axis?** Four terms fitted on one vector: `contest` shipped at +4.04, then `exposure` +1.07, the declare bar priced at under 0.02 sets a game and not built, `closing` +0.583, and `chase` negative at **every** dose §6.3 permitted, monotonically to −7.56 (§3.8i). The last one is the informative one. It moved thousands of asks, gave up an ask that hit **100.0%** for one that hit 29.7–50.1%, and **did not move the chase rate at all** (31.5% → 31.8% against a +1.5 bar), because its own-locked asks rose while its counterfactual's fell: the asks a seat-known majority credit buys are §3.8g's sure misses into the side's own majority, not chases. That converges with §3.8g R1 from the other direction — Monet rates 21.4% of opponent-held missing cards as its own side's against 11.1% at SESTINA's positions. **The constraint is not how the ranker spends its belief; it is the belief.** Recommendation: **v0.14, the assignment**, on the one quantity every remaining marker runs through — which side holds a missing card. §3.8g named it as clause (b) and row 12 declined it while a ranker term was still untried; none is now. It is measurable without a rung: the calibration of `pAssignment`/the marginal on the opponent-held missing cards is already recorded on every bridge cell, and the study should be run on the records first (§3.8c's and §3.8g's shape) before any code, so the bound is priced before a dose is fitted. Not recommended: another ranker term, at any gate, in any form — four reads say the axis is spent. | **TAKEN 2026-09-04** — the owner chose it ("open the prs then go on v0.14"). §3.8j is pre-registered on the records before any code: the instrument, the bound as a bracket, seven falsifiers and the predictions. Row 15 carries the answer. |
| 15 | **After §3.8j: is the assignment the binding constraint, and what does v0.14 build?** The study is pre-registered and its corpora are on disk; the reads and the falsifiers are written in §3.8j. The pilot already says the belief REACHES the policy at scale — a full side oracle changes Monet's chosen ask at **38.6%** of its decisions on one seed, eight times the 1.97-asks-a-game bar — so the cheap kill does not fire and the question is value, not connection. Candidates ranked in §3.8j: **M3** the deduction fix, **M1** a fitted recalibration (carrying §3.8h's −0.472 / −2.167 warning on belief-weighted forms), **M2** `choiceKappa` rescoped, **M4** `conceal`, **M5** within-side resolution, and **M-NULL**. Pre-registered prediction, against row 14's own premise: **the study returns "not the binding constraint".** | **ANSWERED 2026-09-04** — the axis is CLOSED on its calibration. Reliability is **0.22% of Brier** over 19M pairs on two disjoint twelves (bias −0.0014 / −0.0020, agreeing to 0.0006), so F1 fires ~50× and F6 fires by arithmetic: a perfect recalibration can remove at most 0.22%, against a 15% bar. §3.8g R1 is a base rate — its A/B gap is the same size on the cards the seat gets RIGHT (26.7% vs 15.8%) as on the ones it gets wrong (11.5% vs 5.5%). F3 relocates the question: `seat-p` moves 49.3% of asks against `side-p`'s 35.2%, so the ranker cares more about WHICH SEAT than WHICH SIDE. **Recommendation: M3, the deduction fix** — the licence split is the largest effect in the study (bias −0.085 at a Brier of 0.133 on 13% of the population, against an aggregate 0.228) and the error concentrates at \|cands\| = 2–3; it is a correctness fix, not a dose, so §6.3's floor does not gate it. M1 is dead twice over; M2 unsupported (4.5 points against the licence split's 20). **M-NULL stays first-class** on the prior of five measured negatives. Row 16 is the owner's call. |
| 16 | **After B1b and B2: is the declare the rung, or the deduction — and what is v0.15?** The two readouts the record left unrun were run the next day (§3.8j's addendum). B2 discards half of itself on its own validation — the (θ = 0.3, any) cell would have promised +7 and +12 points to arms that delivered +0.58 and −7.56 — and on the surviving (θ = 0.5, only-chance) cell F5 does not fire: a perfect side belief has **0.33 sets a game** at stake in Monet's majority episodes where every chance was hidden (0.42 with the seat), +5 to +6 points at the exchange rate, half a point at the tenfold class prior. B1b's declare budget is **+0.09 to +0.14 sets of differential a game** under the oracles, at the floor — but 80–96% of it is sets open at the clinch, which in `us54` sit in decided games, and the win-relevant units are 0.002–0.03 a game. **Recommendation: v0.15 is M3, the deduction fix, studied on the records before any code** — the exact conditioning on the residual instance measured against the Sinkhorn table on the licence split and at \|cands\| = 2–3, and injected through the same seam so its flips sit inside B1's bracket, before `marginal.ts` is touched; the room is bounded above by B2's 0.33. Not recommended: the declare (B1b), a recalibration (F1, F6), another ranker term (rows 12–14). M-NULL stays first-class. | **TAKEN 2026-09-05** — the owner: run B1b and B2, then "we'll go with your recommendations". B1b's budget is at the floor in sets and under half a point in wins under an oracle, so the declare is not the rung. **v0.15 is M3, studied on the records first.** |
| 17 | **After §3.8k: the deduction fix is dead — the model, not the inference, is the error. What is v0.16, if anything?** The exact posterior under `marginal.ts`'s own model is *worse* than the Sinkhorn table on 24 of 24 seeds (+0.19% Brier pooled, **+4.5% on the licence split**), moves 2.7% of asks symmetrically, and carries 0.003–0.005 sets a game on B2's surviving cell; K1 and K3 fire. The post-hoc diagnostic says why: a seat that has asked into a set holds **about 1.5** of its alive cards whether two or five are alive — both of two about half the time, where the model says 15% — so the players' choices carry a likelihood the constraints do not, and exact inference only sharpens the wrong prior. Six rungs have now read negative in a row (v0.10–v0.15), and the belief channel's ceiling is 0.33 sets a game under a *perfect* belief (§3.8j addendum). **Recommendation: M-NULL leads — §3.9's acceptance on v0.9's vector.** Before it is taken, one probe costs no cell and settles the last open question on this axis: **the licence likelihood** — `choiceKappa` with `choicePrior: 'once'`, the geometric-in-the-holding weight the code already carries, **calibrated on the records** to the measured holding (the crude arithmetic on the two-alive bucket wants (1 + κ) ≈ 6, against the κ = 1 v0.5 took abroad) and read through the same seam with the same falsifiers: K1's bar on S3 = yes, K2's on asks moved, B2's cell. If it cannot clear them the belief axis closes for good, and row 18 chooses between §3.9 and **the even-3 bucket** — §3.8c R1's largest single bucket, ~40% of SESTINA's extra sets a game, never attacked by any rung. Not recommended: any dose fitted abroad on the belief before that probe; any further inference change under this model; another ranker term. | **TAKEN 2026-09-05** — the owner: "lets go with your recommendation for row 17", with full authorization for the direction of v1.0 development from here ("just go ahead with the best path you think is"). **v0.16 is the licence-likelihood probe on the records, pre-registered first (§3.8l); M-NULL is taken if it fails.** |
| 18 | **After §3.8l: the belief axis is closed — seven measured negatives (v0.10–v0.16), the last with the belief repaired where the error was and worth nothing in play. What does the ladder do with the residual?** The channels this document measured are out: the ask ranker (four terms, §3.8d–§3.8i), the assignment (§3.8j), the inference (§3.8k) and the likelihood (§3.8l); the search arm at the affordable budget was a no-op abroad (§3.8a); §0.2's POSITION is what is left, and it is not a knob. **Recommendation: M-NULL — §3.9's protocol executed on v0.9's vector in full, as the ladder's closing artefact (§3.8m).** Conditions 1–2 are already read twice on seed sets that share nothing — 40.11% on §3.8e's twelve (§3.8f) and 41.31% on §3.8l's twelve (SD 1.29) — and what remains is the panel against v0.2–v0.6 at home (3), the §6.2 table with the adapter's restated wire check and every fault counter by name (5), and a second, independently built arm on the same spec (6): one bridge run, nothing fitted, nothing shipped. The result is the number the owner's fork in §0.3 needs — ship v0.9 in the browser at about 40% and publish the negative result, or fund the lab-only search at twice the budget. The even-3 bucket (§3.8c R1, ~40% of SESTINA's extra sets, never attacked as a target) stays the leading alternative for a further rung, at the honest prior of a ranker term: under the floor. Not recommended: a repaired `hold` form abroad (bounded at +1.0 by B2's cell and read at about zero here); any belief change without §3.8l's declare pin; the search arm wider or deeper than the budget (§3.8a read −0.08 and +0.60 at home). | **TAKEN 2026-09-06 under the owner's standing authorization of 2026-09-05 ("just go ahead with the best path you think is") — v0.17 is the §3.9 read on v0.9's vector (§3.8m); nothing ships from it; the §0.3 fork stays the owner's, and the owner may reverse this row on return.** |
| 19 | **After §3.8m: §3.9's table is on the record — Monet v1.0 does not exist at v0.9's vector (41.31% and 40.11% on two twelves; the panel's wall at v0.4 unmoved by thirteen points of ladder gains). What does the owner do with it?** The fork §0.3 wrote for this outcome, and only the owner can take: **(1)** ship v0.9 in the browser at about 40% against the frontier — the honest maximum of the belief programme, one rewrite, no latency — and publish the negative result with this document as the artefact; or **(2)** fund the lab-only search arm beyond the affordable budget (§3.8a: the pre-registered form a no-op at 96 ms an ask, the wider and deeper forms out on the cost rule at −0.08 and +0.60 at home), the one channel with a ceiling above the gap and no measured gain yet. Under (1) the even-3 bucket (§3.8c R1, ~40% of SESTINA's extra sets, never attacked as a target) remains the leading candidate for one more rung, at the honest prior of a ranker term. Not recommended: any belief change (§3.8l closed the axis); any further ask-ranker term (four measured out); a v1.0 claim on any seed count under twelve. | **TAKEN 2026-09-06 by the owner — (1): v0.9 stays what the lobby seats; the negative result is the eleventh paper (`papers/monet.tex`, §3.8n); the bridge archived outside the public tree. And the owner's direction from here, in one sentence — *"going forward, we should just pick whatever will improve the winning percentage of Monet"* — read into the rule of §3.8n.** |
| 20 | **After row 19: under the rule of §3.8n — whatever the bridge measures as an improvement — what runs next?** The record holds two measured terms above two standard errors and under the floor on v0.9's vector, both off the shipped vector: the exposure charge on certain hits (§3.8e, +1.07, SE 0.54, 8 of 12) and the closing credit (§3.8h, +0.58, SE 0.23, 9 of 12). **Recommendation: v0.18 reads the stack** — v0.9 + exposure, v0.9 + closing, v0.9 + both — paired against v0.9 on twelve fresh seeds, pre-registered in §3.8o, about one bridge hour; the arm that clears the rule ships, the stack re-read as a whole. Behind it, in order: the even-3 bucket as a target (§3.8c R1, 40% of SESTINA's extra sets, never attacked) and the deeper search form (§3.8a, +0.60 at home at 1.7× the budget, never abroad). Not recommended: any belief change without the declare pin (§3.8l); a fresh ranker term fitted from scratch (§3.8i). | **TAKEN 2026-09-06 under the owner's direction of the same day ("just pick whatever will improve the winning percentage of Monet") — v0.18 reads the stack (§3.8o), pre-registered before a cell; the owner may reverse this row on return.** |
| 21 | **After §3.8o: nothing clears — the exposure charge reads about zero on the translated bridge with its markers intact, the closing credit about +0.4 over twenty-four seeds and under the bar on its fresh twelve; at twelve seeds the rule resolves 1.3 points for a loud term and 0.6 for a quiet one, and nothing on record is priced at either. What runs next under the rule?** Four candidates, priced as far as the record can price them. **(a) Price the even-3 bucket before building for it** — §3.8c R1's largest pool (~40% of SESTINA's extra sets a game, a 3–3 deal won 58–42, never attacked by any rung), read from this rung's 58,800 recorded games with SESTINA's own asks in them: an instrument rung, no bridge time, no vector change, and a mechanism built only if the counterfactual prices at a point or more on the bridge. **(b) The search arm abroad** — §3.8a's forms were read at home only (+0.41 and +0.60 sets a pair, SE 0.3, against v0.4c, 100 pairs), and the cost rule that put them out is the browser's, not the bridge's; but at 96 ms an ask a twelve-seed read is about seventeen bridge hours an arm (thirty at the deeper form), the engine's stall limits are unchecked against it, and §3.8d's finding that the mirror does not price a term cuts both ways. **(c) A third fresh twelve on `closing` 0.5 alone** — fifteen minutes and about one chance in three of clearing 0.56 on a term worth +0.4; a second try at the same bar by the term that just failed it is the winner's curse the rule was written against, not recommended unless declared the last read and pooled with the two on record. **(d) Stop the ladder at the paper.** **Recommendation: (a), as v0.19.** Under the rule a rung is chosen by its expected gain on the bridge, and after ten measured zeros the expected gain of an unpriced mechanism is about zero: the price comes first. Then (b) only if (a) prices under a point; (c) never on its own. | **TAKEN 2026-09-06 under the owner's direction of the same day — (a): v0.19 prices the even bucket from the records (§3.8p), pre-registered before the instrument exists; the owner may reverse this row on return.** |
| 22 | **After §3.8p: the even bucket is 2.8 points on v0.9's vector, the race is lost at the 4–2 stage — Monet reaches four first as often as anyone and converts the lead at 49% where SESTINA converts at 61% and either bot at 56% against its own kind; SESTINA asks into the race it opened every four events and resolves it in 26, Monet every six and a half in 36 — and the price along the in-race play is +2.6 by the conversion bound. §3.8p's rule says build v0.20 along the in-race ask. Along what, exactly?** The records do not yet say what the leader at 4–2 does differently, and the ladder has measured the fast policy's ask terms four times (§3.8d–§3.8i): the chase appetite at a majority reads negative (§3.8g, v0.13), the belief about the missing cards is calibrated (§3.8j), and a term fitted from scratch is not recommended (§3.8i). Two candidates carry the price. **(a) The 4–2 decision study, then the term** — at every ask decision of a side leading or trailing 4–2 in a contested set, on the 74,400 recorded games: what it asked (into the set, a certain hit elsewhere, an uncertain ask elsewhere), the hit, the take-back it allowed, and the race's outcome; Monet against SESTINA against the counterfactual at the same points. A day, no bridge. If SESTINA's edge at 4–2 is in a choice the fast policy can make — patience with the chase, the take-back taken, the turn kept — the term is named, fitted at home and read abroad under §3.8n as v0.20; a term that ships on `/play`. **(b) The search arm as the race player** — §3.8a's pre-registered form (D 8 · C 3 · S 24) is the one mechanism on record that plays a race as a race, read once at home at +0.41 sets a pair (SE 0.31, 100 pairs, against v0.4c) and never abroad; a 600-pair home re-read against v0.9 with `--races` on its records (does lookahead convert 4–2 leads?) costs about an hour, and a twelve-seed bridge read about seventeen bridge hours at 96 ms an ask, with the engine's stall limits checked on one cell first. It would improve the bridge number and not the browser's: a lab-only Monet, which the owner declined in row 19's fork and may decline again under the rule. **Recommendation: (a) as v0.20, with (b)'s home re-read as its second step if (a) names no term the fast policy can make.** Not recommended: opening more races (priced at zero by the v04 and v06 corpora, where Monet opens 70% and gains nothing), a targeting credit for even sets (no gap to close), or a chase credit (measured negative). | **TAKEN 2026-09-06 under the owner's direction of the same day — (a): v0.20 reads the four-of-six decision on the records (§3.8q), pre-registered before the instrument exists; the owner may reverse this row on return.** |
| 23 | **After §3.8q: the pace is a choice at the lead — SESTINA asks into the race at 59% of its lead decisions where Monet's picker at the same points would at 40%, and two-thirds of that gap stands where no certain hit is on the table. What is v0.20b's term?** The joint fixes the population: 13.6 of the 19.6 points are uncertain chases the counterfactual trades for an uncertain ask elsewhere — the ungated population, where §3.8h's closing credit already prices the ask at the four-of-six rung (`lock` 0.5) at `closing` 0.5, a quarter of a hit's value at `p`, and moved a tenth of the gap (+0.58 on twelve seeds, +0.25 on twelve fresh ones); 6.8 points are the uncertain chase over a certain hit, §3.8i's population, measured −1.08 to −7.56 across its eligible doses and not reopened. v0.12's dose ladder moved the four rung and the five rung together (0.1 / 0.25 / 0.5 / 1.0 on three seeds: +0.22 / +0.89 / +0.97 / +0.72, the top two within noise) and never fitted the four rung on its own, and the five rung has nothing left to buy (every seat-known lock cashed, §3.8p). **(a) v0.20b = the closing credit's four-of-six rung at its own dose** — a Monet-only knob `closingFour` (byte identity absent; at `lock` 0.5 the credit is paid at `closingFour · wHit · p · 0.5` in place of `closing`'s dose, the five rung unchanged; the certain count; the gate exactly as §3.8h left it, no ungating): a home fit over doses in duplicate pairs against v0.9; the chosen dose's markers read on its own records through `--race42` (the chase share at lead decisions, the first-chase share, the sure-miss share — the term must move R1 and not R2); then twelve fresh seeds abroad under §3.8n. Its price is bounded by the 0.89 decisions a game in the population and §3.8p's +2.6 along the conversion. Its risk is §3.8g's: a credit on a set the seat KNOWS four of fires only where the seat can place four on its side, and the seat-known four is a minority of the true fours, so the term may fire too rarely to move the gap — which the home markers will show before a bridge cell is spent. **(b) The trailer's ask, first** — Δ_trail is −17 the other way: SESTINA declines 58% of its legal take-backs and asks uncertain elsewhere (14.4% of its trail decisions where the counterfactual would take back); what those asks buy is not on the instrument, and the trailer's side is the larger half of the even bucket. A records rung, no bridge, a day. **(c) The search arm** (row 22's (b)) as the race player, unchanged. **Recommendation: (a), with (b) as the next records rung if (a)'s home markers show the credit firing at under a fifth of Monet's lead decisions, or its abroad read is under the bar.** Not recommended: reopening §3.8i's gated chase (a third of the gap, measured negative at every dose); the belief count at the four rung (§3.8h: lost on every seed); a fresh momentum term keyed on the side's last hit (a term from scratch, §3.8n). | **TAKEN 2026-09-06 under the owner's direction of the same day — (a): v0.20b, pre-registered as §3.8r before any cell; the owner may reverse this row on return.** |
| 24 | **After §3.8r: the four rung's dose wins at home — `closing` 0.5 + `closingFour` 2 is +0.30 sets a pair at 4.9 × SE on 4,800 games, `closingFour` 2 alone +0.17 at 2.8 × SE — and the rung's own bar refused it the bridge, because the chase share at lead decisions moved one to three points against a required five. Does the read go abroad, and on what rule?** The bar was written on a guess (Q1: a 45–55% chase share at dose 2) that the population cannot deliver at any dose: the seat can place four of the lead set on its side at 12% of Monet's lead sets, so the credit reaches 10.7% of Monet's lead decisions and can move the share ten points at the very most. The marker did its job — it caught a wrong prediction — and it is the wrong gate for the win rate, which §3.8n names as the objective. **(a) v0.20c — the bridge read re-registered, before any cell (§3.8s):** the same knob, the two best home arms by the pairs alone — `closing` 0.5 + `closingFour` 2 as the primary, `closingFour` 2 as the secondary — against the base on the twelve fresh seeds drawn for v0.20b and still unspent, three containers, every cell pinned in-engine, the markers abroad through `--race42`; the ship rule §3.8n's, the registry change the owner's. Eligibility this time is the pairs at two standard errors and the sure-miss share within five points, both already met; the chase-share bar is dropped and the reason written down. Two hours. **(b) Stop here and go to the trailer** (row 23's (b)): the term moves a tenth of the gap, so its bridge value is bounded by that tenth — but +2.3 at home is not a tenth of anything on this ladder, and the seeds are drawn. **(c) Widen the reach** — a belief count at the four rung (§3.8h: the belief form lost on every seed) or a momentum form keyed on the side's last hit (a term from scratch, §3.8n) — to be considered only after (a) has read. **Recommendation: (a).** The winner's-curse guards hold: the arms are chosen at home, the confirmation seeds are fresh and unread, the secondary cannot ship from the rung, and the deviation from §3.8r's bar is stated in §3.8s before a cell is played. | **TAKEN 2026-09-06 under the owner's direction of the same day — (a): v0.20c, pre-registered as §3.8s before any cell; the owner may reverse this row on return.** |
| 25 | **After §3.8s: `closing` 0.5 + `closingFour` 2 clears §3.8n's bar (+0.94, 2.18 × SE, 8 of 12) under the ±2.00 floor — the first term to ship by the rule — on three asks in a hundred, with the race-pace markers barely moved and the wall at 41.25%. The registry PR waits for the owner. What is fitted on the new vector next?** §3.8n's stack rule is met (the stack was read as a whole against v0.9 on the same seeds). The four rung's reach is the binding fact: the credit fires only where the seat can CERTAINLY place four of the set on its side, 12% of Monet's lead sets, because the teammate's cards are usually unplaced. **(a) The licensed count at the four rung** — the rules make a teammate's ask into a set a certainty that it holds a card of it (row 6; Monet already tracks the licence and retires it), so a seat holding three with a licensed teammate KNOWS its side holds four without knowing which card: count a live teammate licence as one unplaced card of the set in `closingPicture`'s certain count, and nothing else — a rules fact, not a belief (§3.8h's belief form lost on every seed; this is not it). First a records read of the reach with licences counted (§3.8r's instrument, a day, no bridge), then the fit at home and the read abroad on fresh seeds under §3.8n if the reach grows by half or more. **(b) The trailer's ask** (row 23's (b)): what SESTINA's uncertain asks elsewhere buy it at the trail, where it declines 58% of its legal take-backs and Monet takes 80% — the larger half of the even bucket, a records rung. **(c) The exposure charge on the new vector** (§3.8e, §3.8o: −0.15 on the old base; the pair with the closing credit read +0.70 at 1.3 × SE): a re-read costs twelve cells and its prior is under the bar. **Recommendation: (a), its records read first; (b) beside it as the next instrument.** Not recommended: `closingFour` 4 or 8 (the home ladder turns down past 2); the belief count; a second twelve on `closingFour` 2 alone. | **TAKEN 2026-09-07 under the owner's direction of 2026-09-06 — (a), its records read: v0.21, pre-registered as §3.8t before any walk (no bridge cell, nothing under `lib/`); the registry PR #41 for the ship stays the owner's to merge; the owner may reverse this row on return.** |
| 26 | **After §3.8t: the rules recover a third of the four rung's missing reach, not half — the licence lifts it from 11.5% to 15.1% of Monet's lead sets, side-certain cards nothing — and the rung stops by its own rule. The four rung's reach is what the public record makes it; what is the next lever on the race?** §3.8t's default was row 25's (b), the trailer's ask, a records read; §3.8q's R3 already found the take-back first recovers more for every trailer, so (b) is a likely null and buys no win rate. **(b) The trailer's ask** — kept as the next records instrument. **(d) The appetite re-fit on the shipped vector** — `contest`, `closing`, `closingFour` jointly at home in duplicate pairs (the doses were each fit on an earlier vector), the best arm abroad under §3.8n: a hygiene rung with an unknown prior. **(e) The rung below the four — `closingThree`** — the closing credit's dose where the hit would leave exactly two cards of the set outside the side's certain hands: the ask that makes a seat-known four, which is §3.8p's decisive stage (the first side to four converts its lead 56% between equals, 61% for SESTINA against Monet) and the stage SESTINA reaches by chasing at 60% of its lead decisions to Monet's 35%. Its population is large where the four rung's is small: the seat can place three of the set at 26% of Monet's lead sets (29% with licences) against 12% for four, and §3.8t's R2 puts the asks whose set would stand at two outstanding after the hit at a share the record states. Mechanically continuous with the two rungs that read positive (§3.8h's five and four rungs, §3.8r's four at its own dose) and on the same ungated arm, never above a certain hit; §3.8i's chase credit, which lost, sat on the gated arm. A home ladder over doses fixes the dose; twelve fresh seeds under §3.8n read it. **TAKEN 2026-09-07 under the owner's direction of 2026-09-06 — (e), pre-registered as §3.8u before any cell; a deviation from §3.8t's default, stated as such: (b) reads records and (e) is the only one of the three that can move the win rate at the stage §3.8p named. The owner may reverse this row on return.** | **TAKEN — (e): v0.22 = `closingThree`, §3.8u** |
| 27 | **After §3.8u: the rung below the four loses at home at every dose, and more the larger the dose — the closing credit's value lives within two cards of the claim, not three. The closing family is now read at every rung: the five rung pays, the four rung pays at its own dose, the three rung costs. What next?** **(b) The trailer's ask** — row 25's, still a records instrument, still a likely null after §3.8q's R3. **(d) The appetite re-fit on the shipped vector** — `contest` (0.6, fit on v0.4c's vector at §3.8d), `closing` (0.5, on v0.9's at §3.8h) and `closingFour` (2, on v0.9's at §3.8r) have each been fit on a vector other than the one they ship on together; a home ladder of one-knob moves against the shipped stack — `contest` 0.4 / 0.8 / 1.0, `closing` 0.25 / 0.75 / 1.0, `closingFour` 1 / 3 — in duplicate pairs, the best arm abroad on twelve fresh seeds under §3.8n if it is eligible at home. No new mechanism; an hour at home; it closes the family with its doses fit where they ship. **(n) The placement value** — SESTINA's seats can certainly place four of a lead set twice as often as Monet's (24% against 12%, §3.8r, §3.8t) because SESTINA asks into its majorities more, and every ask places a card or a licence for the team; a records read of what a chase buys the teammates' later decisions — the seat-known count at the side's next decisions after a chase against after an ask elsewhere — the mechanism that would make the pace worth its hit probability, if it is. **Recommendation: (d) first, (n) as the next records rung; not (b), and not a belief count.** **TAKEN 2026-09-07 under the owner's direction of 2026-09-06 — (d), pre-registered as §3.8v before any cell; the owner may reverse this row on return.** | **TAKEN — (d): v0.23 = the appetite re-fit, §3.8v** |
| 28 | **After §3.8v: the shipped point is a local optimum at home along every axis — `contest` sharply (−0.53 a pair at 0.4, −0.13 at 0.8 and 1.0), `closing` flat (the five rung's dose moves a handful of games between 0.25 and 1.0), `closingFour` slightly down on both sides of 2 — and no one-knob move is eligible; the appetite family is fit where it ships. The closing family is read at every rung and dose; the belief axis is closed (§3.8l); four ranker rungs read sub-floor (§3.8g). What is left is the reason SESTINA's chases pay where Monet's do not: its seats can certainly place four of a lead set twice as often (24% against 12%, §3.8r, §3.8t), and the chase credit that copied the pace without the placement lost (§3.8i). What next?** **(n) The placement value** — a records read: at every ask of Monet's and SESTINA's, what the ask buys the team's later decisions — the side's certain count of the asked set at its next decisions after a chase against after an ask elsewhere, the teammates' certain hits made available, and the licences left — on the fs corpus, the base corpus and SESTINA's side of both; the mechanism that would make the pace worth its hit probability, measured before anything is built on it. No `lib/` change; an hour of walks. **(o) A team-information credit built blind** — an ask credited by the cards it places for the teammates, fit at home; §3.8i's failure was exactly a credit built on a story before the story was measured. **(p) The closing dose re-fit abroad** — the home read says the five rung's dose moves too few games to matter anywhere. **(q) The contest credit's shape** — the dose is sharply peaked, so the term is worth a lot and its form (the `(1 − p)` factor, the domination condition) is unread; a mechanism rung without a records read behind it. **Recommendation: (n) now, and (o) only if (n) finds the placement; not (p), and (q) after (n).** **TAKEN 2026-09-07 under the owner's direction of 2026-09-06 — (n), pre-registered as §3.8w before any walk; the owner may reverse this row on return.** | **TAKEN — (n): v0.24 = the placement value, §3.8w** |
| 29 | **After §3.8w: the chase places half a certain card and the certain picture does not convert the race — SESTINA converts more than Monet at every level of it — and a chase miss is answered by a take-back hit three times in five. The placement story is closed by its rule. Where is SESTINA's edge in the race's play?** The instrument has now read the leader's side twice (§3.8q, §3.8w) and the trailer's side once, in passing: SESTINA declines 58% of its legal take-backs and asks uncertain elsewhere, Monet takes 80% of its own (§3.8q), and the take-back is the hinge the leader's chase turns on. **(b) The trailer's ask** — row 23's, named at every row since and never read: `--placement` extended to trail decisions (a side holding two of six in an opened, unresolved, even set): the action (the take-back, an uncertain ask into the set, a certain or uncertain ask elsewhere, no card of the set held), the trailer's picture, what the ask elsewhere bought (its hit, the set it went into, whether the turn was kept), the leader's next decision on the set after each action, and the recovery — Monet's and SESTINA's side of fs and base and the mirror. A records rung, no `lib/` change, no bridge, an hour. If SESTINA's declined take-backs recover more than Monet's taken ones at the same picture, or buy a set elsewhere, a term is named — the take-back priced by what it costs the side's turn — and fitted at home under §3.8n as v0.26. **(o) A placement credit** — closed by §3.8w's rule (+1.5 points against a bar of 10). **(q) The contest credit's form** — the family's load-bearing term (§3.8v), its `(1 − p)` factor and domination condition unread; a mechanism rung without a records read behind it, after (b). **(w) A chase credit keyed on the take-back risk** — the miss's cost is the licence handed over; a term from scratch until (b) has read what the trailer does with it. **Recommendation: (b) now; (q) and (w) only with a read behind them; not (o).** **TAKEN 2026-09-07 under the owner's direction of 2026-09-06 — (b), pre-registered as §3.8x before any walk; the owner may reverse this row on return.** | **TAKEN — (b): v0.25 = the trailer's ask, §3.8x** |
| 30 | **After §3.8x: the trailer's story is closed by its rule — SESTINA's declined take-backs recover 12.6 points less, and the split says the decline marks the games it is about to finish rather than a set it gives up; a take-back costs no tempo and Monet takes it. The race has now been read from both sides and the reads agree: SESTINA's edge is the in-race conversion of the leads it takes (§3.8p's +2.6 bound, §3.8q, §3.8w), and the closing credit at the four rung is the one term that has bought any of it (§3.8s). Where does the next rung go?** **(f) The five rung's dose above one** — the closing credit pays `dose · wHit · p · lock` (closing.ts); at the four rung `lock` is 0.5 and the shipped `closingFour` 2 pays `wHit · p`, at the five rung `lock` is 1 and the shipped `closing` 0.5 pays half that — the ask that would complete a set the side holds five of is credited half of what the ask that makes a four is, beside the base ranker's own `gambleBonus` on the completing ask — and §3.8v's ladder (0.25, 0.75, 1.0) read flat, the credit deciding one ask in five hundred at 0.25: the dose never left the region where a certain hit elsewhere outranks the completing ask. `closing` 2, 3 and 4 with `closingFour` 2 held, on the shipped stack at home in 2,400 duplicate pairs each after the control; markers: the share of Monet's asks each move changes and what those asks hit against what the stack's would have, the five-rung population (7.2% of Monet's asks by §3.8t); an arm ≥ 2 SE ahead at home goes to twelve fresh seeds abroad under §3.8n as v0.26. No new code: a dose on a knob that ships. **(q) The contest credit's form** — the `(1 − p)` factor and the domination condition (`oppMass/6 · ambiguous/6`) unread; but its value is the race it opens (§3.8v), Monet already opens 64% of the even races against SESTINA and takes them at 49% (§3.8p), and the corpora price more openings at nothing: after (f), if at all. **(w) A chase credit keyed on the take-back risk** — closed by this read as motivated: the take-back is a certain hit that keeps the turn, taken and given back for free, and the chase miss's cost is the turn, which `p` already carries. **(j) The joint re-fit of the shipped doses** — §3.8v's one-at-a-time surface is flat within a point on every axis but `contest`; a joint move is cheap and its prior is low; after (f). **(b′) The trailer's story re-read on the set lost rather than recovered, or with the clinch's winner** — not taken: a measure chosen after the read, on a story its rule closed; the fact is recorded in §3.8x for a later row that wants it. **Recommendation: (f) now, at home first; (j) and (q) after it; not (w), not (b′).** **TAKEN 2026-09-07 under the owner's direction of 2026-09-06 — (f), to be pre-registered as §3.8y before any pair; the owner may reverse this row on return.** | **TAKEN — (f): v0.26 = the five rung's dose above one, §3.8y** |
| 31 | **After §3.8y: the five rung's dose is inert from 0.25 to 6 — the dose changes one ask in three hundred and loses where it changes one — and the closing family is read at every rung and every dose: the three rung costs (§3.8u), the four rung pays at 2 and not more (§3.8r, §3.8v), the five rung buys nothing (§3.8v, §3.8y). The shipped point is the family's optimum one axis at a time. What is left?** **(j) The joint re-fit** — the one-at-a-time surface (§3.8v, §3.8y) is flat within a point on every axis but `contest`, and the one interaction measured is positive (§3.8r: the two closing rungs together +0.301 against +0.043 + 0.172 apart); four joint moves from the shipped point at home, 2,400 duplicate pairs each after the control — `closing` 1 + `closingFour` 3 (both rungs up), `closing` 0.25 + `closingFour` 1 (both down), `contest` 0.8 + `closingFour` 3, `contest` 0.5 + `closing` 1 — an eligible arm abroad under §3.8n; a quarter of an hour at home; no code. The family closed on its diagonals, or a move found; prior low. **(q) The contest credit's form** — unread, a mechanism rung; but the race it opens is priced at nothing abroad (§3.8p) and its neighbours lose at home (§3.8v): after (j), if at all. **(s) The search arm on the shipped vector** — SESTINA runs a determinized search (twelve deals, depth twelve, four candidates) where Monet ranks one ply with priced terms; §3.8a's search arm on v0.4c's vector was a no-op at home at 96 ms an ask against a budget of 100, and the ranker it searched over has since gained the contest and closing terms that carry the ladder; the conversion gap no dose buys (61% against 49–52%, §3.8w) may be lookahead's. Cost M–L (the budget first, then a fit at home, then the bridge); for the owner's decision on return. **(x) A new records read** — none proposed: the race has been read from both sides (§3.8p–§3.8x) and every read ends at the same wall. **Recommendation: (j) now, closing the family; (s) for the owner; (q) after; not (x).** **TAKEN 2026-09-07 under the owner's direction of 2026-09-06 — (j), to be pre-registered as §3.8z before any pair; the owner may reverse this row on return.** | **TAKEN — (j): v0.27 = the joint re-fit, §3.8z** |
| 32 | **After §3.8z: the family is closed at its shipped point on every axis and on the diagonals — the joint moves are the sums of their parts, the closing diagonals flat and the `contest` diagonals losing at two SE. Since §3.8n's rule (2026-09-06) the ladder has read five rungs on the race and fit three dose ladders; one term cleared the bar (v0.20c, PR #41) and nothing since. What is left costs M–L and has no read behind it. Where does the ladder go?** **(s) The search arm on the shipped vector** — `lib/engine/search/` (§3.8a: D determinizations from the marginal, the fast ranker's top C asks, S-step rollouts, the pick overridden only when the lower bound clears zero; knobs `det`, `cand`, `steps`, `z`; `scripts/bench-decide.mjs` for the cost) re-fit with the rollout policy the shipped stack rather than v0.4c's. SESTINA searches (twelve deals, depth twelve, four candidates) where Monet ranks one ply, and the lead conversion no dose buys (61% against 49–52%, §3.8w) is the kind of thing lookahead sees — a chase now against the take-back and the re-take that follow it. §3.8a's form was a no-op at home on v0.4c's vector at 96 ms an ask; on the shipped vector unread. Cost M–L: the budget first (the stack's rollout is dearer than v0.4c's), then duplicate pairs at home (a slow arm, hours a ladder), then the bridge at its per-move limit. **(t) A clinch-aware ask** — Monet leaves 12.3% of the races it opens unresolved at the clinch against SESTINA's 5.4% (§3.8p), and 14–17% of SESTINA's trail sets are open at the clinch (§3.8x): Monet's leads left on the table when the game ends. A term that weighs the ask by the score — the fifth set that ends the game, the opponents' fifth that must be denied — has not been on the ladder since §3.3c read the declare's urgency at a quarter of a point on v0.3's vector; a mechanism rung of cost M, with a records read in front of it (the state of every side's leads at the clinch, by the winner; S). **(q) The contest credit's form** — after (s) or (t), if at all. **(u) Another axis on the shipped vector** — the belief (closed, §3.8l), communication (§3.7, flat), the determinized declare (§3.8b, +0.08): each read on an earlier vector; a re-read is a records rung of cost S each, with low priors. **Recommendation: the owner's call between (s) and (t), each pre-registered before any code; (t)'s records read first if (t); not (q), not (u) yet.** **FOR THE OWNER 2026-09-07 — no rung is opened under the direction of 2026-09-06: every remaining candidate is a mechanism of cost M–L without a read behind it, and the ladder's state is reviewable as it stands (v0.20c the family's optimum, PR #41 pending). The owner may open (s) or (t) or another direction on return.** | **FOR THE OWNER — (s) or (t); the ladder paused at v0.27 with the family closed** |
| 33 | **After §3.8z and the owner's direction of 2026-09-07 — *"what's next? Know that I don't care about any cost of compute, the only thing I care about is to develop the greatest fish playing game engine ever."* What runs, and in what order?** **TAKEN — (s), re-scoped (§3.8aa, v0.28):** the search arm on the shipped vector with §3.8a's cost rule lifted — the deals scaled until the marker stops growing, a candidate generator that puts every half-suit on the table, the lock-only leaf, duplicate pairs at home and the bridge on twelve fresh seeds at whatever wall clock the eligible cell costs. The order after it, written as the plan the owner asked for: **v0.29 a learned leaf** (a value function on self-play of the stack, in place of the rollout — the leaf §3.8a said the search needed), **v0.30 expert iteration** (the search's choices as the ranker's targets, repeated while §3.9's number moves), then **a joint belief sampler** for the determinizations; §3.9's test at every step that ships, ±2.00 the rung, every read pre-registered. Not taken: (t) the clinch-aware ask (a one-ply term; the search sees the clinch through its rollouts, so (t) is subsumed if the search pays and is read on its own only if it does not), (q) and (u). The full-strength bridge read is of the order of 100–400 CPU-hours on a 12-CPU Docker VM (a day to three) — a larger box would cut the wall clock and is the owner's call; the ladder runs on this one meanwhile. | **TAKEN (s) re-scoped — the owner may reverse at review** |
| 34 | **After §3.8aa's home read (s128 −0.333 ± 0.144 a pair where its marker read +0.082; the sparse form −0.040 ± 0.127: a searched move worth about nothing in sets by the game's end, alone or together) — what is v0.29?** **TAKEN — the learned leaf (§3.8ab), the plan §3.8aa wrote:** a value fitted on self-play outcomes in place of the lock count at the horizon, the search then a one-ply expectation over the deals at S 0 or the same rollouts with a better leaf at S 24; read in the game (pairs) and not by the marker, the marker re-read at the game's end as a diagnostic. Not taken: (a) the search's form grid (S, z, C, D 256 for `'sets'`) — the form is not the loss, the leaf is; (b) racing the candidates (an efficiency change; worth having once a leaf pays); (c) the joint sampler — the belief caps the `'top'` search (§3.8aa M2), but the leaf is the larger term and the sampler's consumer must work first. §3.8aa's first block (t32 and s32 at home) is read under §3.8aa's rules and can only add a D 32 lock-leaf cell abroad beside this rung. | **TAKEN — the owner may reverse at review** |
| 35 | **After §3.8ab's sparse reads (n128p02 +0.022 ± 0.132, n512p02 +0.002 ± 0.133 a pair — the learned leaf's searched moves worth nothing in sets, one at a time; l512 −0.978 ± 0.172 — a static fitted evaluation exploited by the search that optimises against it) and §3.8aa's first block (t32 +0.248 ± 0.144 at home, eligible, where its bridge read was −1.61 points: the search helps against the opponent it models and hurts against the one it does not), under the owner's direction of 2026-09-08 — *"learning from sestina's play is essential to improving … we should be learning to beat sestina if possible … I don't want this to be running for weeks"* — what is v0.30?** **TAKEN — the SESTINA clone (§3.8ac):** its ask policy fitted on its own decisions from the bridge records (about 25 million of them on file), read as a player at home and abroad, and as the opponent model in the t32 form's rollouts abroad — the one-variable comparison to t32's own bridge read; the whole rung inside two days of wall clock. **Deferred by the same direction:** §3.8ab's n24 (13 h) and dense n512 (4–5 h), played only if the machine has the time after this rung's cells. |
| 36 | **v0.30 clears §3.8n's bar against SESTINA itself — +7.24 ± 0.63 points of win rate on twelve fresh seeds, 48.0% against v0.20c's 40.8%, every seed ahead (§3.8ac). Does it ship?** | **FOR THE OWNER** — the shipped vector changes, which the authorization of 2026-09-05 keeps for the owner: PR #49 (`claude/monet-v0.30-ship`, stacked on #41) carries the registry entry (v0.20c's vector plus `askModel: 'sestina-clone'`), the clone as data, its forward bank and pin, and the /play note re-measured. Merged, 48.0% becomes the shipped number; left open, v0.20c stays shipped and v0.30 stays on the record. M4 read 17:49Z 2026-09-08: −1.33 ± 0.74 points for the t32 form with the clone at its rollouts' opponent seats (§3.8ac) — it does not change this row's question. |
| 37 | **After v0.30 clears — what is v0.31?** | **TAKEN — the clone re-fitted (§3.8ad)**, by the standing rule: the read scaled with the clone's agreement with SESTINA (49.9% bought +0.500 a pair at home, 55.8% +1.056; abroad +6.67 and +7.24 points), v0.30's fit was a 2% sample at twelve epochs with its loss still falling, and a re-fit is the cheapest rung on the table — wider, longer, two and a half times the data, the engine untouched, the ship the owner's as before. **The declare clone (v0.32)** is pre-registered when its reader of the records' declare events exists; **expert iteration** waits for M4's read. |
| 38 | **After §3.8ad named the declare clone as v0.32 — is there a declare policy to clone?** | **TAKEN — no: v0.32 is read off the records and not built (§3.8ae).** Per completed half-suit the two declare policies are the same to the second decimal; SESTINA's edge is the count of completed half-suits (+16% over v0.20c's vector, +6% over v0.30's), which the asks make. The rung after v0.31 is the ask clone's representation, unless M4's read says the search with the right opponent model is worth its cost under §3.8a's 100 ms rule. |
| 39 | **After §3.8ad's addendum (the clone's learnable disagreement with SESTINA is the seat, not the card), §3.8ae (no declare policy to clone) and §3.8ac's M4 (the search's loss abroad is not its opponent model) — what is v0.33?** | **TAKEN — the belief's seat, the clone's second feature set (§3.8af)**, by the standing rule: sixteen features per legal ask — the independent per-card belief beside the marginal, and the target's own dealings with the asked half-suit off the log — fitted at §3.8ad's F1's width and data, so the fit F3 against F1 is a one-variable read; eligible at +1.0 point of holdout top-1 with the half-suit-and-seat agreement not below; the pairs against C at home, then the bridge under §3.8n's rule against v0.30's vector. The instrument is committed and nothing shipped reads it. The owner may reverse at review. |

---

## 9. Licensing

github.com/dylann4500/FishLab carries **no licence file**, so default copyright applies. Their
repository is read for **ideas, mechanism designs and measured findings only**. No code or prose of
theirs appears in FishAI or in Monet. Their published numbers are cited as theirs, with attribution.
The engine clone and the adapter live only in a session scratchpad and are never committed.
