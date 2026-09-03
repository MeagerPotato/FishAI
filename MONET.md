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
| **to find** | **22.92 points** from the baseline, **17.25** from v0.4b | — | — |

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
| **v0.5** | **opponent reading** — ask-choice inference into the marginal's prior (`pPrior: 'choice'`, with a per-seat in-game variant) · the defusal appetite as a function of the state (`defusePolicy: 'state'`) | ≥ 35.0% (design target; expectation +1 to +3 over the base) | opponent-location score at home · ask accuracy · sets lost to opponent declarations · the 2 × 2 abroad at twelve seeds, ±2.00 | M–L |
| **v0.6** | **communication** — asks chosen to reveal · the handoff played as an out-of-turn convention | ≥ 38.0% (design target; the ceiling is measured, 38.28%) — **read 2026-09-03: both items behind or flat at home (§3.7a), nothing went abroad, nothing shipped** | lock hold · compelled-declare accuracy · twelve seeds, ±2.00 | M |
| **v0.7** | **the search arm**, only if a gap is left, only through §3.5c's cost-first test | no target until priced — **read 2026-09-03: priced at 96 ms an ask (budget 100); the pre-registered form a no-op at home (§3.8a); the lock-only leaf, post-hoc, abroad on the twelve seeds** | cost budget first, then paired arms on shared determinizations | XL |
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

---

## 9. Licensing

github.com/dylann4500/FishLab carries **no licence file**, so default copyright applies. Their
repository is read for **ideas, mechanism designs and measured findings only**. No code or prose of
theirs appears in FishAI or in Monet. Their published numbers are cited as theirs, with attribution.
The engine clone and the adapter live only in a session scratchpad and are never committed.
