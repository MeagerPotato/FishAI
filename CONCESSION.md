# CONCESSION.md — FishAI v2.0: the three-sided ask

> **Naming.** "v1.5" is taken: it is the bounded-memory ladder ([BOUNDED.md](BOUNDED.md),
> `papers/fishai-v15.tex`). This generation is **FishAI v2.0**, always written with its prefix and
> two decimals — bare "v2" already means *matrix v2*, the payoff artifact.

Every ask in Canadian Fish is three things at once:

- a **bet** on a card — the only one of the three the engine has ever scored;
- a **broadcast**, because [RULES_US54.md](RULES_US54.md) rows 6 and 7 make an ask publish that the
  asker holds a card of that set and lacks the named one;
- a **concession**, because row 10 hands the turn to whoever was asked, on a miss.

This document is about the second and third. It reports one mechanism that works, three that do
not, and one defect in the shipped engine that the work found on the way.

**Read it with [CONTAINMENT.md](CONTAINMENT.md) next to it.** That document establishes the value
of a turn and the arithmetic for spending one deliberately; this one is about who receives it.

---

## 0. The headline, in one table

Every number below is measured on duplicate deals — every seed played in both orientations, so the
deal is never a confound ([BOT_LAB.md](BOT_LAB.md) §5.1) — against a prototype control that
reproduces `decide` **byte-for-byte** when the mechanism is switched off.

| the owner asked for | measured | shipped? |
|---|---|---|
| **Off-limits**: refuse to ask opponents who would punish a conceded turn | **loses** 4.5–11.7 points of win rate; the paired set-difference falls monotonically with appetite | **no** |
| the same threat model, **inverted**: ask them, to strip the card their reach rests on | **+1.50 and +1.65 sets per duplicate pair** on two held-out banks; **+1.08 to +1.96 against opponents that also defuse** | **yes** — `defuse.ts` |
| **Signalling**: bias asks toward sets the team cannot yet prove | flat; the one positive arm failed to replicate | no |
| **Stalling**: decline to take the opponents' last card | inert when weak, **−1.14 sets** when strong | no |
| **Concealment**: hide your own basis by not asking back into the set | **+0.97 sets — but only against opponents that defuse**; nothing otherwise | no — §5a |
| **Turn handoff**: choose the pass target by what it could do with the turn | built; the shipped rule already picks best 84.8% of the time, and 73% of these choices carry no signal at all | **no** — §7 |
| **Tactic-level adaptation** instead of style switching | the right architecture: per-decision terms are worth ~15x the v1.0 style-switching layer | **partly** — §8 |

And one defect, found by measurement rather than by reading:

> **The engine's existing model of a conceded turn has the wrong sign.** `missTarget: 'fewest'`
> prefers to concede to the opponent with the smallest hand, on the stated grounds that *"the
> surrendered turn is worth least"* there. Over 12,376 observed concessions, hand size correlates
> **−0.147** with the cards that seat then actually takes — negative in every game-phase bucket.

---

## 1. What a conceded turn actually costs

### 1.1 The instrument

`scripts/probe-danger.mjs`. A concession is recorded whenever an ask is about to miss; the outcome
variable is how many cards the conceded seat then takes from the conceding team before it misses
and loses the turn (row 9's hit chain). Ground truth is read from the hands — this is a
measurement harness, not a bot. The estimate is read from `buildKnowledge` over the acting seat's
`SeatView`, i.e. exactly what a policy has.

300 `us54` games, all-Balanced seats, **12,376 conceded turns**.

| | value |
|---|---:|
| mean cards taken per conceded turn | **1.304** |
| P(0 taken) | 46.7% |
| P(≥ 2 taken) | 33.2% |
| max observed | 11 |

The mean lands within a few hundredths of `contained.ts`'s independent
`E = hits / max(1, misses)` derivation of the same quantity. Two different arguments agreeing on
the value of a turn is the reason to trust either.

### 1.2 Two estimators, one of which is backwards

- **`handSize`** — `view.counts[X]`. What the engine uses today, in two places: `missTarget`
  (`decide.ts` `pickAsk`) and `valueContainedPass`'s `E * n_t / meanHand` (`contained.ts`).
- **`licence`** — over the sets `X` has publicly shown a basis in (row 6, read off the log), the
  cards of those sets this seat can certainly locate on its **own** team. `X`'s reachable prey.

| | corr with cards taken | bottom decile | top decile |
|---|---:|---:|---:|
| `handSize` | **−0.147** | | |
| `licence` | **+0.421** | 0.778 cards | 2.469 cards |

Controlled for game phase, because hand sizes fall as information accumulates and the raw sign
could have been an artifact. It is not:

| log length | n | mean taken | corr(hand) | corr(licence) |
|---|---:|---:|---:|---:|
| 0–40 | 5,216 | 1.19 | **−0.191** | +0.474 |
| 40–80 | 4,626 | 1.37 | **−0.149** | +0.416 |
| 80–120 | 2,452 | 1.40 | **−0.100** | +0.353 |

Least squares gives the coefficients [`threat.ts`](lib/engine/bots/threat.ts) ships:

```
cards ≈ 0.885 + 0.391 · prey
```

### 1.3 Where the licence must be read from, and why it matters

Not from `Knowledge.constraints`. `knowledge.ts` records an ask as a deal-time set-constraint and
**drops it the moment it is satisfied or exhausted** — which is exactly when the seat has been
shown to hold a card of the set, i.e. when the threat is most real. Reading the basis off the
**public log** instead:

| detection of… | via `Knowledge` | via the log |
|---|---:|---:|
| a harvest threat (opponent basis + ≥ 2 of the set on my team) | 6.0% | **11.7%** |
| the owner's strict five-and-one | 7.1% | **35.0%** |

That table is also why the mechanism is a **graded term and not a veto**: even at its best the
predicate is invisible about two thirds of the time, and a rule that fires on a third of its cases
and is silent on the rest cannot be a hard prohibition without being arbitrary.

---

## 2. Off-limits, as requested: refuted

A penalty on the miss branch, `wHit · (1−p) · appetite · D(target) / (1+E)`, subtracted from the
shipped score. 200 duplicate pairs per cell.

| appetite | 0 (control) | 0.05 | 0.10 | 0.25 | 0.50 | 1.00 |
|---|---:|---:|---:|---:|---:|---:|
| win rate | 50.00% | 45.0% | 43.0% | 45.5% | 42.3% | **38.3%** |
| paired set-difference | 0.0000 ± 0.0000 | −0.52 | −0.73 | −0.89 | −1.19 | **−1.61** |

A hard veto restricted to the narrow case — likely-miss asks only, at targets with at least *K*
certainly-located prey cards — loses too: −1.02 to −1.38 at *K* = 2…5, reaching neutral only at
*K* = 6, where it has stopped firing.

### 2.1 The null control, which is what makes this a finding

The same penalty magnitude with `D` replaced by an information-free hash of the target:

| appetite | 0.10 | 0.25 | 0.50 |
|---|---:|---:|---:|
| win rate | 48.50% | 50.25% | 50.00% |
| paired set-difference | −0.12 ± 0.44 | +0.01 ± 0.42 | −0.23 ± 0.44 |

**An information-free perturbation of the same size is free. The danger-informed one costs 4.8 to
7.7 points more than the null at the same size** (48.5 against 43.0, 50.25 against 45.5, 50.0
against 42.3). The loss is caused by the threat *information*, not by the disturbance.

### 2.2 Why: threat and opportunity are the same fact

`corr(threat(target), best hit probability available at that target) = **+0.249**`, n = 33,595.

| target | n | mean best available p |
|---|---:|---:|
| high threat (≥ 2 reachable prey-cards) | 12,691 | **0.471** |
| low threat | 20,904 | **0.326** |

Row 6 cuts both ways. A seat is dangerous *because* it holds a card of a set this team is heavily
invested in — and that is the same fact that makes it the seat most likely to be holding the card
this team wants. Penalising threat is penalising your own best set.

There is also a soundness argument that reaches the same conclusion without any win rate. A threat
model built from public information is a strict **under-approximation** of what a seat knows: a
positive fact in it is a certificate and is sound, but an absence is not evidence. So the model may
legitimately be used to act on *proven* reach, and may **never** be used to certify a seat as safe.
Avoidance is the forbidden direction; defusal is the sound one.

---

## 3. Defusal: the same model, the opposite prescription

If the dangerous seat is the seat holding the card you want, the answer is not to leave it alone —
it is to **take the card back**. A hit removes the very card the licence rests on, and row 9 keeps
the turn while doing it.

```
bonus = defuse · wHit · p · (perPrey · prey(B)) / (1 + E)     if the target has a basis in B
      = 0                                                     otherwise
```

added to the ranked ask score, where `B` is the asked card's set. The full derivation is in
[`defuse.ts`](lib/engine/bots/defuse.ts)'s header. Two design points worth surfacing:

- **Per set, not per seat.** Crediting the target's whole reach was measured too; per-set is both
  better (+1.50 against +1.21 on the same bank) and the only version whose causal story is true —
  a hit on a card of `B` cannot protect a set it is not in.
- **A term, not a branch.** Because it is added to the score, two of `pickAsk`’s three guarantees
  survive untouched for free: `minHitP` still filters the same pool, and both near-tie windows
  still break the same ties. The third did not, and that is worth stating rather than glossing. **Certain-hit dominance needs an explicit gate and now has one** — the term is
  bounded only by `defuse * wHit * perPrey * prey / (1 + E)` (~137 at `wHit` 70) against a
  certainty margin of about 2, and ungated it abandoned a certain hit 9 times over 150 games x 9
  styles, against 0 for the control. `pickAsk` therefore zeroes both concession terms for any ask
  with `p < 1` whenever a certain hit is available, leaving the credit live *among* certain hits.
  The §3.1 table below is re-measured with the gate in place and is unchanged.

### 3.1 Measured

Appetite fixed at **1** on a tuning bank (an inverted U peaking at 1–2 and back to noise by 8),
then confirmed on two disjoint **held-out** banks, and across the roster. The shipped
implementation, not the prototype: `STYLE_ROSTER[s]` against the same style with `defuse: 0`, 400
duplicate pairs per cell.

| cell | win rate | paired set-difference |
|---|---:|---:|
| balanced, holdout A | 60.88% | **+1.43 ± 0.32** |
| balanced, holdout B | 61.38% | **+1.58 ± 0.32** |
| blitz | 61.88% | +1.35 ± 0.32 |
| punter | 58.38% | +1.22 ± 0.33 |
| banker | 57.63% | +1.12 ± 0.31 |
| turtle | 61.25% | +1.35 ± 0.36 |
| hoarder | 59.75% | +1.31 ± 0.35 |
| scout | 61.63% | +1.66 ± 0.32 |
| ghost | 55.38% | +0.83 ± 0.32 |
| archivist | **65.00%** | **+1.94 ± 0.33** |

Every interval excludes zero; the sign replicates on both banks and at all nine styles.

**Two sets of numbers appear in this document and they are not the same measurement.** The
prototype — the term alone, hooked into a mirror of `pickAsk` — measured **+1.50 [1.24, 1.75]** and
**+1.65 [1.38, 1.91]** on 600-pair held-out banks, and those are the numbers
[defuse.ts](lib/engine/bots/defuse.ts) carries in its header as the result it was built from. The
table above is the **shipped implementation** re-measured at 400 pairs, and lands at +1.43 and
+1.58 on the same two banks. The gap is within the intervals and is what a smaller bank plus a real
integration should look like; both are quoted rather than the flattering one.

### 3.2 What this result is not

- **It is a mirror match.** Both teams share a base style. That gate is discharged in §3.3, where
  both arms face the same *fully-armed* opponent.
- **`perPrey` is fitted on this engine**, against this roster, under `us54`. It is one fitted
  constant and it is the only one.
- **The prototype touched one hook.** The measurement is of the ask-selection term alone.

### 3.3 The gauntlet: against opponents that also defuse

§3.1 is a mirror match, and a mirror match is the arena where a mechanism is most flattered. The
fishlabs corpus supplies the specific warning: their structurally analogous inverted coordinate
measured **+2.71** against a weak opponent, **+0.55** against a middling one and **−0.99** against
their strongest — a gain that existed only against opponents unable to punish it. So the gate is:
does defusal still pay when the opponent defuses too?

Both arms face the **same fully-armed opponent**; only the measured team's appetite changes.

- arm A — `balanced(defuse 1)` against `S(defuse 1)`
- arm B — `balanced(defuse 0)` against `S(defuse 1)`

250 duplicate pairs per cell on a third bank, reported as A minus B in sets per pair.

| opponent style | arm A | arm B | **delta** |
|---|---:|---:|---:|
| balanced | 0.000 | −1.636 | **+1.64 ± 0.40** |
| blitz | −0.028 | −1.744 | **+1.72 ± 0.45** |
| punter | −0.228 | −2.156 | **+1.93 ± 0.45** |
| banker | +0.436 | −1.112 | **+1.55 ± 0.55** |
| turtle | +3.304 | +1.724 | **+1.58 ± 0.56** |
| hoarder | +1.300 | −0.584 | **+1.88 ± 0.46** |
| scout | +1.876 | −0.088 | **+1.96 ± 0.51** |
| ghost | +0.580 | −0.504 | **+1.08 ± 0.52** |
| archivist | +0.696 | −0.916 | **+1.61 ± 0.53** |

**The gain survives at every style, and is if anything larger than in the mirror match.** Three
things in that table are worth reading separately from the headline.

1. **Arm A against balanced is exactly 0.000.** That cell is two identical policies on duplicate
   deals, so it must sum to zero by construction, and it does — to the last digit. It is a free
   internal-validity check on the harness, and it passes.
2. **Arm B is negative almost everywhere.** A team that does not defuse *loses* to one that does,
   by roughly the margin it would have gained by switching on. The mechanism is not a coordination
   gain both sides collect; it is contested, and declining to play it is a position rather than a
   neutrality.
3. **`ghost` is the narrowest cell** (+1.08) and the one to watch: it is the style with the most
   suppressed information use, so it has the least to defuse with. The ordering is mechanistic,
   which is mild evidence the effect is the stated one rather than noise.

This does not make the result unconditional — every opponent here is still a FishAI policy, and the
strongest *known* opponent to this engine is not necessarily the strongest one. But the specific
failure the corpus predicted did not occur.

### 3.4 And it replicates in a foreign engine

Every opponent above is still a FishAI policy, so the gauntlet answers "does it survive a stronger
opponent" without answering "is this a fact about Canadian Fish or a fact about this roster".

That second question is settled in [CROSSPLAY.md](CROSSPLAY.md) §3. FishAI's `decide` was run as a
guest inside the **fishlabs** engine — a different codebase, written by someone else — against
**its** bots, with `defuse` as the only knob moved. 300 duplicate pairs per opponent:

| opponent (fishlabs) | paired set-difference |
|---|---:|
| `fishbot` (FishBot v0.3) | **+1.547 ± 0.517** |
| `fishbot_v02` | **+1.693 ± 0.555** |
| `lockout` | **+1.753 ± 0.533** |
| `detective` | **+1.707 ± 0.560** |

The mechanism was derived, fitted and tuned against FishAI's roster and had never seen any of these
bots, and it transfers **at the same magnitude** as at home (+1.50 / +1.65). That is the strongest
evidence in this project that the effect is a property of the game.

---

## 4. Signalling: refuted, and the observational evidence for it was reverse-causal

An ask publishes two facts to teammates. Sets that are declared correctly have been asked into far
more often than sets declared wrongly, so the hypothesis is natural and the observational support
is strong. `scripts/probe-declare.mjs`, 200 games per style, every declare classified by whether
the **ask channel** was still open — i.e. whether row 8 still permitted an ask at all:

| | Balanced | Punter |
|---|---:|---:|
| declares with the channel open | 1,468 | 1,469 |
| … correct | **100.0%** | **99.7%** |
| declares with the channel closed | 90 | 84 |
| … correct | **78.9%** | **75.0%** |
| mean prior asks into that set, before a **correct** declare | 11.70 | 11.80 |
| mean prior asks into that set, before a **wrong** declare | **7.05** | **7.28** |

**The intervention did not reproduce the association.** A bonus for asking into sets the team
cannot yet prove, weighted by proximity to channel-close, measured +0.013 / +0.023 / +0.067 /
−0.090 / −0.203 at rising appetite over 300 pairs — and the one positive arm **failed to
replicate**: 1,500 duplicate pairs on a disjoint bank gave **49.97%, −0.013 ± 0.033**.

The likely reading is that the correlation is reverse-causal. A set that gets asked into a lot is a
set several seats hold a basis in, and *that* is what makes it provable. The ask count is a symptom
of provability, not a cause of it, and manufacturing extra asks does not manufacture provability.

**A second version was tested and is also null.** Spending only the *free* choice — a tie-break
among near-equal asks, preferring the one that most reduces the team's allocation ambiguity, at
zero cost in hit probability — measured **+0.008 ± 0.074** and **−0.010 ± 0.069** on two banks.

### 4.1 What is still open, stated precisely

Two things this section does **not** rule out.

1. **A structural objection to the whole family.** A linear ask score whose positive mass is
   hit-probability-driven cannot express a *deliberate miss*: the hit term is zero by construction
   and every remaining term is a penalty, so such an ask can never win an argmax at any weight.
   FishAI's score has that shape — set `pHit` to 0 and 70 of the mass vanishes. So "signalling is
   inert when weak" may be a fact about the scoring function rather than about signalling. The
   measured *harm* at high weight is real; the inert regime is exactly what a structurally
   unselectable tactic looks like. Defusal escapes the trap only because a defusal ask is a *hit*.
2. **The receiver side is untested.** Everything above changes what the *sender* asks. A teammate
   that reads the log's row-6 and row-7 facts more aggressively when forming a declare plan is a
   different experiment. `buildKnowledge` already ingests those facts, so there may be nothing
   left, but it has not been measured.

---

## 5. Stalling: refuted

Under `us54` there is **no endgame phase**: `variants.ts` gives the rule set
`wholeTeamOut: 'declareWindow'`, and `reduce.ts`'s `declareTail` simply moves the turn to the next
seat with cards. What emptying the opponents actually does is end the **ask channel** — row 8
requires a target holding cards — after which every remaining set must be declared on the log as it
then stands. The strategic content of the owner's request survives; the endgame framing does not.

Measured incidence (`scripts/probe-stall.mjs`, 200 games): a team empties with sets unresolved in
**41%** of games, **72%** of those caused by an ask the other side could have declined to make —
but only **1.32** sets remain unresolved on average when it happens. The clinch at 5 sets is why:
deep endgames are rare by construction.

| trigger width | strength | trigger positions | decisions changed | win rate | paired diff |
|---:|---:|---:|---:|---:|---:|
| 2 | 1 | 332 | 16 | 50.00% | +0.010 ± 0.024 |
| 6 | 1 | 1,952 | 514 | 49.67% | 0.000 ± 0.052 |
| 3 | 20 | 552 | 440 (80%) | 42.00% | **−0.42 ± 0.12** |
| 6 | 20 | 1,471 | 1,330 (90%) | **33.33%** | **−1.14 ± 0.19** |
| 6 | 100 | 1,421 | 1,329 (94%) | 31.83% | −1.22 ± 0.19 |

Inert when weak, severely harmful when strong, monotone. And not for want of alternatives: at
trigger positions there are on average **23.15** legal asks across **2.71** distinct targets, and
only 5.9% of positions offer a single target. The mechanism has room to act, and acting is bad.

**Why.** Refusing a card you can certainly take refuses free material *and* a retained turn. What
it buys is time on a channel whose product is worth very little: declares are already ~100% correct
while the channel is open (§4), and only ~1.32 sets remain when it closes. It is paying a certain
card for insurance against a rare, small loss.

The caveat of §4.1 applies here too, and with more force: a stall is a deliberately worse ask, and
the score cannot express one.

---

## 5a. Concealment: the first tactic that beats defusal — and only defusal

The owner asked for a fourth mechanism after the first three were measured: *divert*. When an
opponent asks you for a card of set H, the natural reply is to ask into H — but that reply publishes
your own row-6 basis in H. The proposal is to hold the card quietly instead, so opponents infer you
have nothing there and skip you, until you can locate the rest of H and declare it.

### 5a.1 The measured behaviour it is aimed at is real, but is not what it looks like

Before building a countermeasure, the behaviour was measured ([ASKING.md](ASKING.md) §4.3). After a
seat is asked for a card of H, misses, and takes the turn under row 10, **88.1%** of its next asks go
into H, against an availability-matched control of **21.4%**. The pattern is real and large.

**But the engine is not reciprocating; it is collecting certainties.** 99.1% of those replies are the
argmax on hit probability, and 60–94% of them are *certain hits* — the opponent's ask, combined with
what the seat already knew, located a card exactly, and `certaintyBonus` plus row 9 do the rest.
Concealment therefore proposes to decline a certain hit, which is the arithmetic that killed
stalling (§5).

### 5a.2 It escapes the structural trap anyway

§4.1 records why signalling and stalling are unshippable in this scoring function: a linear score
with 70 of its mass on hit probability cannot express a *deliberate miss*. Concealment is not one.
It moves the argmax **between two hits** — the concealed ask and some other set's ask — and its
charge is paid at most once per set rather than at every decision. So it is selectable at moderate
weight, and it measures non-zero where the other two measured flat.

Charged as `conceal · wHit · perPrey · mine(H) / (1+E)` — deliberately the same conversion
`defusalBonus` uses, so that the two arbitrate exactly rather than by accident:

> **Defusal wins iff `defuse · p · prey(H) > conceal · mine(H)`.** At both appetites 1, that is
> simply **`p > mine(H) / prey(H)`**: take the card back when it is likely enough relative to how
> much of the set you would be advertising.

Measured over 13,622 ask decisions the two mechanisms collide on **28.6%**, and defusal takes
**79.8%** of the collisions. They compose; neither cannibalises the other.

### 5a.3 The measurement, including the part that decides it

| arm | N | paired set-difference |
|---|---:|---:|
| byte-exact control | — | **0.0000 ± 0.0000** |
| held-out bank A | 800 | +0.8875 ± 0.2443 |
| held-out bank B | 800 | +0.8325 ± 0.2378 |
| headline | 600 | **+0.9683 ± 0.2744** |
| **information-free null of the same shape and magnitude** | — | **−0.7200 ± 0.2715** |
| **against opponents that do NOT defuse** | — | **−0.1483 ± 0.2571** |

Dose-response in how well the opponent can read the leak it hides: **+0.97** against a hard-skill
opponent, **+0.31** against medium, **+0.11** against one without constraints. And the decomposition
that settles what the mechanism actually is: removing only the *opponent's* defusal drops the
marginal value to **+0.157**.

**The entire effect is denial of defusal.** Concealment is not a general improvement; it is a
counter to one specific mechanism. Against an opponent that does not defuse it is worth nothing, and
slightly negative.

### 5a.4 Verdict, and the correction it forces

**Not shipped on.** `conceal` is landed as an optional style field defaulting to absent, so every
roster vector and every shipped tier is byte-identical. The tiers carry `defuse: 0` and therefore
have no customer for a counter to defusal.

It forces one correction to this document, and it belongs in the open rather than in a footnote:

> **§3's +1.50 is an over-estimate against a concealing opponent.** Defusal was measured against
> opponents that publish their bases freely. An opponent that hides them takes roughly one set per
> duplicate pair back. Nothing in §3.3's gauntlet or [CROSSPLAY.md](CROSSPLAY.md) §3 covers this,
> because no opponent in either was concealing.
---

## 6. Two defects in the shipped engine, found on the way

1. **`missTarget: 'fewest'` is backwards** (§1.2). Its trace prose tells the user the smallest hand
   makes the surrendered turn *"worth least"*; the measurement says the opposite, in every phase
   bucket, and §7's independent fork study reproduces the sign a third time (−0.261). The same
   proxy appears in `valueContainedPass`'s `n_t` term and in `contained.ts`'s `aimedTarget`.

   **The fix was built where it is soundest, and measured inert.** A contained-book turn-pass is a
   *guaranteed miss* by construction, so §2's danger/opportunity confound — the reason the owner's
   avoidance rule loses on ordinary asks — cannot arise there. This is the one place in the engine
   where "concede to the least dangerous seat" is exactly right. Replacing both the aim and the
   cost model with the threat estimate measured **−0.045 ± 0.130** over 400 duplicate pairs, and
   the diagnostic says why:

   | over 25,654 ask decisions | |
   |---|---:|
   | more than one opponent still holds cards | 99.1% |
   | the contained pass fires at all | **1.06%** |
   | it fires, and the two aims disagree | **0.11%** |

   Published reach is too sparse to separate opponents at the positions where the mechanism
   actually fires: most opponents have shown no basis at all, so every candidate prices the same
   and the aiming gain collapses to zero. The change was **reverted rather than shipped off by
   default**, on this document's own §6.2 argument — a knob that is listed, swept and reported
   while being inert contaminates the measured vector, and one of those is already one too many.

2. **`style.signalling` is unreachable under `us54`.** `signallingAsk` is gated inside
   `decideWithPlanner`, which a `us54` game enters only for `phase === 'endgame'` — a phase that
   rule set never produces. So the knob is listed, swept and reported, and buys a `us54` seat
   nothing at all except through `firstUseInfoCost`, where it zeroes the contained-pass information
   price. A dead knob in a measured vector is a contaminated comparison.

## 7. The turn handoff (capability 5): measured, and the shipped rule already wins

The owner also asked that a seat which runs out of cards on its own turn choose the teammate to
pass to by reviewing the history — which teammate could best use the turn — rather than by hand
size. The threat layer of §1 is exactly the estimator that request describes, pointed at a
teammate instead of an opponent.

**Measured, and it does not beat the shipped rule.** A win-rate A/B has no power here, so the
instrument is the local one: at every real pass decision, fork the game once per candidate
teammate, force the pass there, and count the cards that teammate then actually takes before
losing the turn. That is ground truth per candidate (`scripts/probe-handoff2.mjs`).

First, how often the decision exists at all — 300 `us54` games:

| | |
|---|---:|
| games reaching `awaitPass` | **11.3%** |
| of those events, a real choice (>1 teammate holding cards) | 62.9% |
| … no teammate holds cards (no decision to make) | 0.0% |
| … ask channel already dead (the owner's blind-declare case) | 11.4% |
| mean unresolved sets at the pass | 1.74 |

Then the estimator study, 4,000 games, 223 real decisions, 446 candidate rows:

| | corr with cards taken | mean cards captured | picks the best candidate |
|---|---:|---:|---:|
| oracle | — | 1.251 | 100% |
| **`handSize` (shipped, `passTarget: 'most'`)** | **−0.261** | **0.897** | **84.8%** |
| `reach` (the threat estimator) | **+0.352** | 0.906 | 85.2% |
| hybrid (reach, hand size breaking ties) | | 0.892 | 84.3% |

The correlations keep the signs §1.2 found — hand size negative, reach positive — and the
*decision* is still unaffected, because **73.1% of these decisions have no signal in them at all**:
every candidate takes the same number of cards, so no estimator can separate them. Among the ~60
that do carry signal, hand size and reach mostly agree. The shipped rule is already within 0.35
cards of the oracle and picks correctly 85% of the time.

So capability 5 is **built and refuted as a change**, not skipped. Three things follow, and they
are worth separating:

1. **The estimator is right and the decision is empty.** This is not a failure of the threat model —
   `corr = +0.352` against `−0.261` says the model is the better one. It is a statement about how
   rarely `us54` asks the question, and how often it has already answered itself.
2. **Where it would matter is frozen.** `awaitDesignate` and `endgame` are `pagat48`-only, and that
   rule set is held byte-identical. That is where the same decision fires in 41% of games.
3. **One premise of the request does not hold under `us54`.** "Which teammate could best declare"
   is not a reason to pass: row 11 gives every seat the declare option in the §3 window without the
   turn, so a teammate that can declare does not need to be handed anything. The exception the
   owner identified is real and is the one case where it inverts — when the opponents are all out,
   `MUST_DECLARE` puts the option on the **turn-holder alone** and teammates get `NOT_YOUR_OPTION`.
   That is 11.4% of pass events, which is 4 occurrences per 300 games.

## 8. Capability 4: switching actions instead of playstyles

The owner asked for an adaptive model that, "instead of switching between playstyles, just switches
between actions and strategies, to allow for more flexible playing".

**That is the right architecture, and it is now measured rather than argued.** The two layers can be
priced against each other in the same unit:

| layer | what it switches | worth, in sets per duplicate pair |
|---|---|---:|
| **v1.0 adaptive** ([ADAPTIVE.md](ADAPTIVE.md)) | the whole style, once per phase | **+0.13 ± 0.06** over a bare Balanced team ([BOUNDED.md](BOUNDED.md) §5a) |
| the style knob itself, chosen well | nothing — it is a constant | ±0.27 |
| **per-decision terms** — `containedPass`, `defuse` | the *action*, at every decision, from the position | **+1.43 and +1.58 ± 0.32** (§3.1, the shipped implementation on two held-out banks) |

**The per-decision layer is worth roughly eleven to twelve times the style-switching layer**, and the
style-switching layer is worth less than simply naming a better style would have been. That is the
owner's point, quantified.

There is a structural reason and ADAPTIVE.md already records it: best-response selection over the
committed counter table **provably degenerates to always-Punter**, because one row weakly dominates
every column, and the expected payoff is linear in the opponent posterior. A layer that picks one of
nine constants, from a table with a dominant row, cannot do better than that constant. A layer that
reads the *position* — has this opponent published a basis in a set my team can locate cards of? is
this set contained? is the ask channel about to close? — is not choosing from nine options at all.
It is choosing from the legal move list, every turn, and every mechanism in this document is one
predicate over that list.

**So what is shipped is a step of capability 4, not a plan for it.** `defuse` is exactly a tactic
that arms itself from the position and stands down when the position does not warrant it, and its
appetite is the only thing the style contributes.

**The arbitration layer is now worth building, and was not when this section was first written.**
A portfolio that scores several tactics in one currency and plays the argmax is only worth its
complexity when there is more than one tactic to arbitrate. Of the four originally proposed, three
measured harmful or inert — avoidance loses up to 11.7 points (§2), stalling up to 1.14 sets (§5),
signalling is flat and failed to replicate (§4) — which left an argmax over a singleton.

**Concealment (§5a) is the second survivor, and it changes the picture in a specific way: it makes
the tactic space intransitive.**

| | measured | where |
|---|---:|---|
| defusal beats plain | **+1.92 ± 0.31** | [ASKING.md](ASKING.md) §6, common-baseline bank |
| concealment beats defusal | **+0.97 ± 0.27** | §5a.3 |
| plain beats concealment | +0.15 ± 0.26 — *right sign, not significant* | §5a.3 |

The three legs come from two different banks and two different harnesses, so the triangle is not
yet a single clean experiment — which is the first reason to treat it as suggestive.

The first two legs are solid; the third is a sign, not a result, and the triangle should be treated
as suggestive until it is measured properly. But it is exactly the structure
[ADAPTIVE.md](ADAPTIVE.md) names as the thing that would make adaptation non-trivial. v1.0's
adaptive layer degenerates because its counter table has a **dominant row** — one style beats every
column, so the best response to every belief is the same style. A defuse/conceal pair has no
dominant row: what to play depends on what the opponent is playing, which is the only condition
under which reading the opponent pays for itself.

So the honest state of capability 4 is: **the per-decision layer is built and measured; the
arbitration layer over it now has something to arbitrate, and building it is the next piece of real
work rather than architecture standing in for evidence.** The first step is cheap and is not a
portfolio — extend the counter table with defuse and conceal coordinates and check whether the
intransitivity survives a full sweep. Only if it does is the portfolio the right shape.

---

## 9. What must happen before any number here is quoted as final

- ~~The gauntlet.~~ **Done — §3.3.** The gain survives against opponents that also defuse.
- **Matrix v2 is invalidated.** The roster now carries `defuse: 1`, so the committed style matrix
  no longer describes the shipped roster. `npm run lab` must be re-run and the artifact re-pinned.
- **`KNOB_LADDER` does not carry the new knob** — and it does not carry `containedPass` either, so
  the committed exploitability numbers have never priced either mechanism.
- ~~A foreign-engine check.~~ **Done — [CROSSPLAY.md](CROSSPLAY.md) §3.**
- **Defusal has not been measured against a concealing opponent at scale.** §5a shows one takes
  about a set per pair back. Neither the §3.3 gauntlet nor CROSSPLAY.md covers this, so §3's +1.50
  is an over-estimate against an opponent that hides its bases.
- **The intransitive triangle of §8 needs a real sweep.** Two of its three legs are measured; the
  third is only a sign. If it survives, the counter table needs defuse and conceal coordinates and
  v1.0's degeneracy verdict needs revisiting.
- **A stated K.** Several variants were scored before the winner was picked; the selection haircut
  is unpriced.
- **Tests that would catch a sign flip.** Both concession terms currently pass their suites with the
  sign reversed: the tests pin the arithmetic and the fixtures, not the direction. Directional tests
  are the cheapest real coverage gain available here.
- **No test pins `turnYield` equal to `contained.ts`'s `E`**, though two file headers describe the
  two as deliberately duplicated. They are kept in step by hand.
- **`tabledLicences` has no caller.** It is the seam through which a budgeted licence source would
  be injected; until that exists it is a dead export and should be either used or removed.
- **`tests/bots/public-view.test.ts` exercises the concession layer statically, not dynamically.**
  Its dynamic proxy runs the three tiers, which carry `defuse: 0`, so no code in `threat.ts`,
  `defuse.ts` or `conceal.ts` executes under it. The import allow-list is what bites for this layer.
- **The certain-hit gate is new and its rate is unmeasured beyond the sweep that found it.** It fired
  on 9 decisions across 150 games x 9 styles; §3.1 was re-measured with it in place and did not move,
  but no ladder prices the gate itself.
- **A detection floor.** Plant an edge of known size and confirm the instrument resolves it before
  reading any result off it.
- **The bounded arm's licence is derived, not retained.** `logLicences` retires each licence against
  the seat's own (budgeted) knowledge, but the ask history it scans is not itself budgeted. Moving
  the licence into the fact pool as a first-class 1-bit `basis` read is the correct end state; doing
  it now would change every committed v1.5 number.

## 10. Reproducing the measurements

The probes under `scripts/probe-*.mjs` are scratch harnesses, not part of the lab: they are not
typechecked, they emit no committed artifact, and their numbers are not digest-bound. They exist so
every table above can be regenerated.

```bash
node scripts/probe-danger.mjs 300      # §1: what a conceded turn costs, and the two estimators
node scripts/probe-offlimits.mjs 150   # §1.3: how often the position occurs and is visible
node scripts/probe-declare.mjs 200     # §4: declare accuracy either side of the ask channel
node scripts/probe-stall.mjs 200       # §5: how often the stall position arises
node scripts/probe-ab.mjs 200 0        # the byte-exact control: must print 0.0000 +/- 0.0000
node scripts/probe-verify.mjs 400      # §3.1: the shipped mechanism, defuse 1 vs defuse 0
node scripts/probe-gauntlet.mjs 250    # §3.3: against opponents that also defuse
node scripts/probe-handoff.mjs 300     # §7: how often awaitPass happens, and is a real choice
node scripts/probe-handoff2.mjs 4000   # §7: the fork study — every candidate's ground truth
node scripts/probe-window.mjs 300      # CROSSPLAY.md §1: the off-turn declare channel
```

Two probes carry a header saying so: `probe-aim.mjs` and `probe-aimdiag.mjs` measure §6.1's
contained-pass aim, whose knob was reverted after it measured inert. Their headers say exactly what
to re-add to run them. The cross-engine harness of [CROSSPLAY.md](CROSSPLAY.md) lives outside the
repository, in the session scratchpad, because it drives a clone of a third-party repository that
must not be vendored here.


