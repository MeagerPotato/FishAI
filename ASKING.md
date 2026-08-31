# ASKING.md — who to ask, for what, and what silence is worth

The owner raised a specific worry:

> "If you have a low spade, you ask for a low spade but don't get it, and they don't ask for a low
> spade back, don't automatically infer that they don't have any low spades."

This document answers it, and then generalises the answer into the full reasoning matrix for
choosing an ask. It is the inference-side companion to [CONCESSION.md](CONCESSION.md), which covers
the turn-side.

---

## 0. The direct answer: the engine does not make that inference, and the residual error runs the other way

**FishAI never treats silence as evidence.** After A asks B for the 3♠ and misses, the engine
concludes exactly one negative fact — *B lacks the 3♠* — and nothing whatever about B's
2♠/4♠/5♠/6♠/7♠. B's later asks into other sets move those beliefs by zero.

The reason is structural rather than careful: `ingest` in [knowledge.ts](lib/engine/bots/knowledge.ts)
is a `switch` over events that **are** in the log. There is no scan for "who has not asked into
set S", no silence counter, no candidate-mask decay. An absence is not representable, so it cannot
be acted on.

Demonstrated rather than asserted — a treatment where the 3♠ ask happens against a control where it
does not, with seat 1 then asking four more times, never into low spades:

| card | candidates (treatment) | candidates (control) | p(seat 1) treat | p(seat 1) control |
|---|---|---|---:|---:|
| 3♠ | [2,3,4,5] | [1,2,3,4,5] | 0.0000 | 0.2000 |
| 5♠ | [1,2,3,4,5] | [1,2,3,4,5] | **0.2000** | **0.2000** |
| 6♠ | [1,2,3,4,5] | [1,2,3,4,5] | **0.2000** | **0.2000** |
| 7♠ | [1,2,3,4,5] | [1,2,3,4,5] | **0.2000** | **0.2000** |

Only the named card moves. The rest are bit-identical.

**And the measured residual runs opposite to the worry.** In the owner's exact position — I missed
on this seat, and it has never asked back into the set — the engine believes **14.0%** and the truth
is **2.0%** (N = 19,003). It is *too generous* to the silent seat, not too harsh. It never writes
that seat off; if anything it should write it off slightly more than it does.

So the principle is right and the engine already honours it — with room to spare.

---

## 1. Every way a candidate can be eliminated, and whether it is sound

| trigger | justification | verdict |
|---|---|---|
| a miss — the target is cleared for the **named card** | the logged event | **sound** |
| a miss — the asker is cleared for the named card | row 7: you may not ask for a card you hold (correctly disabled when `askOwnCardAllowed`) | **sound** |
| historical count exhaustion | pigeonhole on log-replayed counts; disabled when the log is windowed | **sound** |
| current count exhaustion | pigeonhole on the public counts of row 17 | **sound** |
| own-hand injection | the viewer's own hand is ground truth | **sound** |
| singleton collapse, count forcing, constraint forcing, claim reveal | positive fixes, downstream of the above or read from a claim's revealed holders (row 12) | **sound** |

**Not one is keyed on an absence.** The bounded (v1.5) fact pool's `lacks-card` and `no-basis` are
compressions of already-certified eliminations, and forgetting can only *widen* a candidate set, so
they are sound too. `refinedHitProbability` short-circuits at zero and is monotone
non-decreasing — its only failure mode is over-confidence, never a false negative.

Two places are sound-but-fragile and neither is reachable at the shipped hard tier: a first-write-wins
rule that could persist a wrong certainty on *inconsistent* input (reachable only under the easy
tier's 6-event window, which also runs without constraints), and `clearCand`'s refusal to empty a
candidate set — which is the anti-unsoundness guard itself, erring toward a superset.

**No bug found; no code change warranted.**

---

## 2. Is the engine over-inferring anywhere? Calibration says no

Every legal ask at every ask decision, scored with the number `pickAsk` actually decides on, against
ground truth from the hands. 300 `us54` games, **N = 1,395,876** scored asks.

| believed p | N | mean p | observed | observed − p |
|---|---:|---:|---:|---:|
| 0.0–0.1 | 126,303 | 0.007 | 0.0068 | +0.0002 |
| 0.1–0.2 | 454,977 | 0.171 | 0.1681 | −0.0028 |
| 0.2–0.3 | 717,054 | 0.221 | 0.2023 | −0.0184 |
| 0.3–0.4 | 37,765 | 0.337 | 0.2912 | −0.0461 |
| 0.4–0.5 | 24,124 | 0.440 | 0.4746 | +0.0349 |
| 0.5–0.6 | 10,083 | 0.533 | 0.5205 | −0.0130 |
| 0.6–0.7 | 8,181 | 0.625 | 0.6499 | +0.0249 |
| 0.7–0.8 | 631 | 0.734 | 0.7242 | −0.0095 |
| 0.8–0.9 | 78 | 0.810 | 0.7308 | −0.0790 |
| **0.9–1.0** | **16,680** | **1.000** | **1.0000** | **+0.0000** |
| all | 1,395,876 | 0.2062 | 0.1953 | −0.0109 |

**The certainty tier is exact**: 16,680 asks called certain hit 16,680 times, no exceptions. That is
the property row 9 lets the whole policy rest on, and it holds.

Overall the engine errs **optimistic** by about a point. That is the signature of an engine that is
*not* over-inferring: one that wrongly concluded "they must have none" would show hit rates *above*
its own claims in the low buckets, and it does not.

---

## 3. What silence is actually worth

Confounds removed — contained sets excluded, because the CONTAINMENT.md turn-pass deliberately
manufactures repeat misses at seats that provably hold nothing, and it reuses the same card.

| stratum | N | believed | observed | error |
|---|---:|---:|---:|---:|
| no prior miss, target **never asked** into the set | 1,176,652 | 0.2007 | 0.1927 | **−0.0081** |
| no prior miss, target **has** asked into the set | 88,419 | 0.3473 | 0.4181 | **+0.0708** |
| **1 miss by me, never asked back** (the owner's case) | 19,003 | 0.1399 | 0.0199 | **−0.1200** |
| 1 miss by me, target has asked into the set since | 21,726 | 0.3712 | 0.3792 | +0.0080 |

And the set-level question directly — does the seat hold *any* card of the set?

| position | P(holds ≥ 1 of the set) | N |
|---|---:|---:|
| no miss, silent | **0.663** | 263,016 |
| miss, then asked back | **0.761** | 6,180 |
| **miss, then silent** | **0.063** | 5,968 |
| two or more misses, then silent | **0.004** | 464 |

Three conclusions, and they are not the same conclusion:

1. **Silence on its own is genuinely near-uninformative** — 0.8 points of bias over 1.18 million
   asks. The owner's principle is validated: you cannot read anything into "they didn't ask back".
2. **Silence *after a miss* is a different object.** A seat you missed on that then stays quiet holds
   a card of that set only **6.3%** of the time. The compound event is informative even though its
   parts are not, and the engine under-uses it rather than over-using it.
3. **The engine is not making the mistake the owner was guarding against**, in either direction that
   matters. Its one large error here is generosity.

**Why the compound is not worth acting on anyway.** It is the same trap CONCESSION.md §2 documents:
a plausible small signal read off the public log cost up to 11.7 points of win rate when acted on, because
the row-6 confound made the information point the wrong way. Silence is the weaker signal of the
two. If it is ever tried, the discipline is fixed: duplicate deals, a byte-for-byte control, and an
information-free perturbation of matched magnitude as the null.

---

## 4. Two real gaps, and one pattern that looks like a third

Neither gap is the one the owner feared. Both are its opposite: the engine under-reads *positive*
evidence. §4.3 then takes the one behaviour that genuinely looks wrong from the outside and shows it
is the same row-6 fact, seen from the table rather than from the code.

### 4.1 A published licence is under-priced by 8 points

When the target has publicly asked into the set — a live row-6 licence — the engine believes
**0.2386** and the truth is **0.3221** (N = 23,345). It under-prices its best asks.

The cause is named in [threat.ts](lib/engine/bots/threat.ts)'s own header: `knowledge.ts` records an
ask as a deal-time constraint and **drops it the moment it is satisfied or exhausted** — which is
exactly when the seat has been *shown* to hold a card of the set. `refinedHitProbability` iterates
those constraints, so it goes blind precisely where the evidence is strongest. `threat.ts` already
solved this on the threat side by reading licences off the log instead (harvest detection 6.0% →
11.7%). The fix had never reached the probability.

**Conditioning fixes the calibration exactly.** A live licence says the target holds at least one
unresolved card of the set, so under the engine's own per-card estimates `q_j`:

```
P(c at t | at least one of B at t)  =  q_c / (1 - PROD_j (1 - q_j))
```

Applied at strength λ, the residual bias on the licensed subset:

| λ | 0 | 0.25 | 0.40 | 0.50 | **0.60** | 0.75 | 1.00 |
|---|---:|---:|---:|---:|---:|---:|---:|
| bias | −0.0835 | −0.0488 | −0.0280 | −0.0141 | **−0.0002** | +0.0206 | +0.0554 |

**λ = 0.60 removes the bias almost exactly.** §6 reports what that bought in play, which is the part
that matters and is not what one would guess.

### 4.2 The conceded turn is priced with the wrong sign

Covered in full by CONCESSION.md §1.2 and §6, and repeated here because it belongs in this matrix:
`missTarget`, `aimedTarget`, `valueContainedPass` and `signallingAsk` all rank the seat that receives
the turn by **hand size**, which correlates **−0.147** with the cards that seat then takes, against
**+0.421** for its published reach.

### 4.3 Why the same two or three sets get traded — and why it is not a bug

The owner also reported watching games where "two or three half-suits get ask-traded until it's
declared, while the other half-suits never show up". Both halves of that were tested.

**The trading is real, and large.** After seat B is asked for a card of set H, misses, and takes the
turn under row 10, B's next ask goes into H **88.1%** of the time when row 6 lets it (N = 9,091, 600
games). The availability-matched control — every other legally-askable set at the same decisions —
is **21.4%** (N = 203,723). The provoking set beats the control 5–6× in every bucket, so this is not
an artefact of what happens to be askable. (Unconditionally the figure is 36.0%, because 59% of
provocations land on a set B holds no card of, where row 6 forbids the reply outright.)

**But it is not a reciprocation rule. It is the certainty rule.**

| | |
|---|---:|
| replies into H that are the argmax on hit probability | **99.1%** |
| replies into H that are **certain hits**, after a miss | 60.2% |
| … after a hit | 94.3% |
| B would have chosen H *anyway*, before being provoked | **70.1%** |
| decisions the provocation actually switched into H | **18.1%** |

An ask into H publishes that the asker holds a card of H (row 6) and lacks the named one (row 7).
Combined with what B already knows, that very often *locates a card exactly* — and `certaintyBonus`
makes a certain hit dominate the sort, while row 9 keeps the turn. **The bot is not asking back; it
is taking a card it can see, and the ask it was just asked is what made it visible.** Ablations
confirm the ordering: 88.1% shipped → 84.4% with `defuse: 0` → 72.3% with refined inference off →
72.0% with constraints off, still 3.4× the control. The defusal term contributes about four points
of it and is not the cause.

**The "other sets never show up" half is false at game scale and true locally.** Per game the top
three sets take 49.2% of asks against a uniform 33.3%, HHI 0.1358 against 0.1111 — real but modest —
and only **0.55 of 9** sets receive no ask at all. But in any window of **10 consecutive asks** only
**2.96** distinct sets appear, against **5.98** for the same games' asks randomly permuted, and
**75.3%** of windows show three or fewer sets against 0.4% permuted. The owner is reporting a local
view accurately: the clustering is **temporal**, not a coverage failure. Every set does get its turn;
they just take turns in long runs.

**Does the clustering cost anything?** Not identifiably. The raw correlation between a game's ask
concentration and its set outcome is −0.443, but ask *count* correlates +0.929 with sets, and
controlling for it collapses the partial correlation to **−0.074** (−0.008 on the roster arm). Ask
count is plausibly a mediator as well as a confound, so this identifies nothing causal in either
direction, and no intervention is warranted on this evidence.
---

## 5. The holistic ask matrix

| # | factor | grounding | sign | priced today? |
|---|---|---|---|---|
| 1 | **hit probability** | rows 9/10 — a hit takes a card and keeps the turn; a miss ends it | **+**, dominant | **yes, well.** `wHit·p` is 70 of 100 of the score; overall bias −1.1 pt; the certainty tier is exact |
| 2 | **certainty vs probability** | a certain hit is riskless material *and* free tempo | **+**, must dominate | **yes.** `certaintyBonus ≥ 20` required of every style; the contained pass refuses to displace one |
| 3 | **target's published licence in the asked set** | row 6 is the only ask licence, so an ask publishes "I hold one of these", permanently | **+** on both the probability and the value of taking the card | **partly — the biggest gap.** The *choice* is priced (`defusalBonus`, +1.50/+1.65 sets). The *probability* is not: §4.1, −8.4 points |
| 4 | **what my ask publishes about me** | rows 6 and 7, both permanent | **−**, small | **yes, as a tie-break only** (`leakEpsilon`). Deliberately narrow: the best ask into a strong set is usually the ask that completes it |
| 5 | **who receives the turn on a miss** | row 10 | **−** on the miss branch — but see 6 | **wrong sign.** §4.2 |
| 6 | **threat and opportunity are the same fact** | row 6 makes it structural; `corr(threat, best available p) = +0.249`, mean best p 0.471 at high-threat seats vs 0.326 | **the naive veto is negative** | **yes, correctly.** Avoidance costs up to 11.7 points; `defuse.ts` inverts it |
| 7 | **defusal credit** | a hit strips the licence and row 9 keeps the turn | **+** | **yes**, `defuse: 1` across the roster, replicated in a foreign engine ([CROSSPLAY.md](CROSSPLAY.md) §3) |
| 8 | **is the set contained?** | C1/C2 — no opponent can ask into a one-team set, and declaring it hands it back | **flips the calculus**: the ask stops being about cards and becomes purely about aiming the turn | **yes, own branch** — but its `gain` is built on factor 5's backwards proxy |
| 9 | **progress toward the set** | row 12 needs all six holders named | **+**, modest | **yes**, `wProgress` |
| 10 | **narrowing value of a miss** | row 17 makes every ask public; a miss on a two-candidate card pins it | **+**, small | **yes**, `wNarrow` — the only term that pays for a miss |
| 11 | **clinch state** | the game ends at 5 sets; a wrong declare gifts one | **asymmetric, large late** | **declares yes, asks no.** Nothing in `pickAsk` reads the score. Defensible: an ask cannot lose a set outright |
| 12 | **silence** | not a rule — an absence | **−**, weak alone (§3) | **ignored, and that is correct** |

**Priced well:** 1, 2, 4, 7, 9, 10, 11. **Wrong sign:** 5, and 8 inherits it. **Under-priced:** 3.
**Correctly ignored:** 12.

### The one thing this matrix must not say

The owner pairs "whom to ask" with "keeping in mind the off-limits rule". This project's measured
position is that the off-limits *prescription* — refuse to ask the dangerous seat — **loses 5–12
points of win rate**, because row 6 makes threat and opportunity the same fact. The threat *model*
is kept and the prescription inverted. The only asks where the original avoidance rule is right are
the ones that **cannot hit** — and those are exactly where the engine still uses hand size (§4.2).

---

## 6. What fixing the calibration actually bought — and the trap in stacking it

§4.1's correction removes a real 8-point bias. The obvious expectation is that a better probability
plays better. It does — **but only if the engine is not already being paid for the same evidence.**

All arms mirror `pickAsk` as it now stands, defusal term included, with the zero arm verified to
reproduce the shipped policy byte-for-byte. 400 duplicate pairs, one bank, **one common baseline**
(`defuse: 0`, λ = 0) so the three treatments are directly comparable:

| arm | win rate | paired set-difference |
|---|---:|---:|
| baseline — neither | 50.00% | 0.0000 ± 0.0000 |
| **defusal alone** (`defuse: 1`, λ = 0) | 64.00% | **+1.915 ± 0.315** |
| **calibration alone** (`defuse: 0`, λ = 0.6) | 65.25% | **+2.068 ± 0.293** |
| calibration alone, over-corrected (λ = 1.0) | 61.63% | +1.620 ± 0.327 |
| **both together** (`defuse: 1`, λ = 0.6) | 60.63% | **+1.565 ± 0.317** |

Three things, in order of how much they change what one would do:

1. **The two mechanisms are substitutes, not complements.** Either alone is worth about two sets per
   duplicate pair. **Together they are worth less than either alone.** Adding the principled fix on
   top of the shipped heuristic would have made the engine *worse*, and only a common-baseline
   design shows that — measured each against its own baseline, the calibration fix looks like a
   flat +0.04 ± 0.41 rather than like a substitute.
2. **The mechanism is one reordering reached two ways.** The correction multiplies every card of one
   set at one seat by the same factor, so it can never reorder asks *within* a (set, seat) pair — it
   only promotes licensed asks against unlicensed ones. That is exactly what `defuse` does. And the
   λ = 1.0 row shows the promotion has an optimum: over-shoot it alone and the gain falls from
   +2.07 to +1.62, which is the same shape stacking produces.
3. **The 8-point calibration error is nonetheless real and worth fixing eventually** — just not
   *here*, where a term already stands in for it. `refinedHitProbability` is also read by the
   declare planner, by `valueContainedPass`, and by any future search or exploitability sweep, and
   in none of those is a defusal bonus quietly compensating.

**Recommendation: ship neither change now.** `defuse: 1` stays, on the strength of its gauntlet
(CONCESSION.md §3.3) and its foreign-engine replication ([CROSSPLAY.md](CROSSPLAY.md) §3), which the
calibration fix does not have. The calibration fix is recorded here, with its λ ladder, as the
better long-term shape: it is a bug fix rather than an appetite, it needs no style knob, and it
would help every consumer of the probability rather than only the ask ranker. Swapping the two is a
deliberate experiment for its own day, not a change to make in passing.

### The general lesson, stated once

*A term that corrects a probability and a term that rewards the same evidence are not additive.*
Measuring the second after the first has shipped will show nothing; stacking them can subtract. Any
future mechanism that promotes asks at seats with a published row-6 licence is competing with
`defuse` for the same effect, and must be measured against a baseline with `defuse` **off** before
it can be believed.

## 7. Reproducing

```bash
node scripts/probe-inference.mjs 300
```

`scripts/probe-concentration.mjs` and its `-window` / `-outcome` companions produce §4.3 —
`-nodefuse` arms there reproduce committed HEAD byte-for-byte on the ask path, which is what shows
the defusal layer is not the cause of the clustering.

`scripts/probe-inference-strata.mjs` produces §3 and `scripts/probe-licence.mjs` the §4.1
calibration ladder. §6 is `scripts/probe-licence3.mjs`, whose arguments are
`<pairs> <lambda> <bank> <defuse> <baselineDefuse>` — the common baseline is what makes the three
treatments comparable, and the `0 lic3 0 0` invocation is the byte-exact control that must print
`0.0000 +/- 0.0000`.
