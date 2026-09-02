# CROSSPLAY.md — FishAI against the fishlabs bots, in the fishlabs engine

The owner asked for simulations against **SESTINA v1.0**, the frontier agent in
[github.com/dylann4500/FishLab](https://github.com/dylann4500/FishLab), reporting win
percentages, common occurrences, key strategies and common failure points.

This document reports what was actually played. The short version is at the top.

> **The frontier match has since been played, and §9 carries it.** In their own C++ engine, over
> their own bot-package protocol, **FishAI wins 27.08% of games against SESTINA v1.0** and sits
> below their entire published lineage — it loses to v0.5 and v0.6 as well.
>
> **§9 was corrected on 2026-08-31 and the first version of it was wrong three ways.** It reported
> 24.22%, a figure depressed 3.44 points by a defect in the bridge; it presented a mirror cell as a
> passing control when a mirror cell has zero statistical power and their engine says so on every
> run; and it attributed four pooled counters to FishAI. §9.8 lists every withdrawn number.
>
> Sections 0 through 8 were written when SESTINA could not be run. Every passage that result
> contradicts, or that now reads as too favourable, is rewritten in place and marked
> **[corrected]**. Nothing is deleted to make the record look better than it was.

> **Provenance and licensing.** The fishlabs repository carries **no licence file**, so default
> copyright applies. Nothing from it is copied into FishAI — not code, not prose. A clone lives in
> this session's scratchpad only, is never committed, and the adapter that lets FishAI play inside
> it is original work. Their *measured findings* are cited as theirs, with attribution, in §4.

---

## 0. What ran, and what did not

| | |
|---|---|
| **SESTINA v1.0 itself** | **[corrected] not played in §§2–6; played in §9.** It is C++ (`engine/src/`, built with `clang++ -std=c++20`) and the Windows host has no C++ toolchain — `g++`, `clang++`, `cl`, `gcc`, `make`, `cmake` all absent. Their binary cannot be produced *there*. It builds from source in a Linux container, which is how §9 was run. |
| what was played in §§2–6 | The fishlabs **TypeScript** engine (`lib/fish-engine.ts`) and the eight bots shipped in it, which run under Node with no compiler. FishAI plays inside it as a guest. |
| how far that is from SESTINA | The TS lab's strongest bot is **FishBot v0.3**. Their lineage runs v0.2 → v0.6, and SESTINA v1.0 is v0.7. The opponent in §§2–6 is roughly **four releases behind** their frontier. §9 measures how much that mattered: a lot. |

**A naming correction, made explicitly because it briefly went the other way.** The bot was
referred to as "SISTINA". The correct name is **SESTINA v1.0**, and it is real: their README
documents it as the successor to the FishBot lineage, developed and evaluated as FishBot v0.7. A
first search of their repository for "sistina" returned nothing and momentarily suggested the agent
did not exist. It does, under the other spelling.

**[corrected]** So: **no result in §§2–6 is a result against SESTINA v1.0.** Those sections are
against the v0.3-era TypeScript lab. §4 reports what their own materials say about SESTINA, which
was the only honest thing available on that question without a compiler. **§9 is the measurement**,
and it is the section to read if you want FishAI's standing against their frontier rather than
against their lab.

---

## 1. The bridge, and why it is sound

FishAI's `decide` plays inside their engine through an adapter that translates their game state
into a FishAI `SeatView` and translates FishAI's `GameAction` back. Before trusting a single
number, the two rule sets had to be compared, because a bridge that quietly changes the game
measures nothing.

| | fishlabs TS engine | FishAI `us54` | same? |
|---|---|---|---|
| deck | 54 cards, 9 half-suits of 6: low 2–7 and high 9–A per suit, plus four 8s and two jokers | identical | **yes** |
| seats and teams | 6 seats, `TEAM = [0,1,0,1,0,1]` | `seatTeam` = `[0,1,0,1,0,1]` | **yes** |
| ask legality | must hold a card of an unresolved set; may not name a card you hold; target must be an opponent holding cards | rows 6, 7, 8 | **yes** |
| turn flow | a hit keeps the turn, a miss concedes it to the seat asked | rows 9, 10 | **yes** |
| **a wrong declare** | awards the set to the **opposing** team | `wrongDeclare: 'opponents'` | **yes** |
| **who may declare** | **the turn-holder only** | **any seat, in the declare window (row 11)** | **NO** |
| **game end** | **all nine half-suits resolved** | **the fifth set awarded ends it (row 19, `winCondition: 'clinch'`)** | **NO** |

The first five make the bridge a pure renaming: no rules translation is needed, and FishAI's
inference layer — built entirely on the row-6 and row-7 facts an ask publishes — reads a log that
means exactly what it means at home.

The sixth is a real difference, and it **handicaps FishAI**. Worth quantifying rather than waving
at; measured in FishAI's own engine over 300 `us54` games (`scripts/probe-window.mjs`):

| FishAI's declares | share |
|---|---:|
| made on the seat's own turn — the channel the host provides | 54.6% |
| **made off-turn, through the declare window — the channel the host does not** | **45.4%** |

Nearly half of FishAI's declaring happens through a door their engine does not have. Some of those
sets would simply be declared later on its own turn, so 45.4% is an upper bound on the loss rather
than an estimate of it. But the direction is unambiguous, and every FishAI win rate in §2 should be
read as a **floor**.

**The seventh does not change who wins; it changes what a set margin means.** Nine sets, and `us54`
makes a tie arithmetically impossible (row 21), so a team awarded a fifth set holds a majority the
remaining four cannot overturn: stop there or play them out, the winner is the same team. Every win
rate in this document is therefore comparable across the two rule sets. Set *margins* are not.
Their engine resolves all nine — which is why §2's "mean sets, for / against" column sums to 9.00
on every row — so any set margin reported here is a nine-set margin, and does not compare with an
`us54` one that stops at the clinch.

The second consequence is subtler. FishAI's speculative-declare threshold is clinch-aware: it moves
once either team stands one set from `clinchTarget`, and the half of that which is a rule
consequence rather than a style preference reasons that a failed declare would hand the opponents
the set that *ends the game* ([decide.ts:597](lib/engine/bots/decide.ts#L597)). The reasoning
survives the crossing — five of nine decides their game too — but the sets played on after the
decision are a phase `us54` cannot reach, and FishAI goes on declaring in them under a threshold
built for a game that would already be over. That tail cannot move a win rate, since the winner is
fixed before it starts. Nothing here measures what else it does.

Two smaller notes. The adapter fell back to a default in **6 decisions out of roughly nine
thousand** (0.07%), always on FishAI emitting `decline` — the declare-window move that does not
exist here; results are bit-identical with and without the fallback, so it changes nothing. And
their engine only populates its rich event log in `detailed` mode, so the adapter maintains its own
ask-and-claim log, appended at both event sites.

---

## 2. FishAI against the fishlabs bots

150 games per cell, **each played in both orientations** so the deal is never a confound. FishAI at
roster style `balanced`, which carries `defuse: 1`.

| opponent | FishAI win % | mean sets, for / against | FishAI ask % | FishAI declare % |
|---|---:|---:|---:|---:|
| `fishbot` (FishBot v0.3) | **42.67** | 4.23 / 4.77 | 49.8 | 92.3 |
| `detective` (Bayesian detective) | **45.33** | 4.31 / 4.69 | 43.5 | 93.2 |
| `lockout` (turn-starvation specialist) | **47.00** | 4.43 / 4.57 | 34.1 | 93.8 |
| `fishbot_v02` (FishBot v0.2) | **48.67** | 4.36 / 4.64 | 45.4 | 93.8 |
| `diversifier` | 80.67 | 5.51 / 3.49 | 61.7 | 91.9 |
| `hunter` | 95.00 | 6.44 / 2.56 | 55.2 | 90.0 |
| `kv_search` | 99.33 | 7.16 / 1.84 | 42.2 | 93.2 |
| `random` | 99.67 | 8.01 / 0.99 | 49.7 | 92.4 |

**[corrected] FishAI is competitive with the top four of this lab and slightly behind them** —
42.7% to 48.7%, one to seven points under even, while playing without the channel that carries 45%
of its declares. It is decisively ahead of the rest of this lab's field.

An earlier draft of this paragraph said "their top four" and "their field" without qualification.
That reads as a claim about fishlabs' standing generally, and §9 shows it is not one. The four bots
above are the top of a **v0.2–v0.3 era TypeScript lab**, not the top of the shipped lineage.
Against the shipped lineage, on the corrected bridge and the three matched seeds the ladder uses
(§9.1), FishAI wins **33.31% (v0.5)**, **32.86% (v0.6)** and **27.83% (SESTINA v1.0)** — 17 to 22
points under even, not one to seven. (That SESTINA cell is the three-seed ladder figure; the
six-seed headline is **27.08%**.) §2 measures standing against the lab and nothing more.

The three lineage figures this paragraph carried until 2026-08-31 — 28.6%, 28.2% and 24.2% — were
defective-bridge numbers (§9.5), superseded by the three above and not to be quoted again. What
they were used to say is what survives the correction: the gap to the shipped lineage is several
times the gap to this lab.

Two further reasons to hold this table loosely, both already on the record elsewhere:
[CONCESSION.md](CONCESSION.md) §8a.1 puts **all four headline cells below its power floor** at 150
games per cell, so the ordering of the four is not resolved; and §9's cells are 1,200 games with
published intervals, which is the standard this section does not meet.

The `lockout` row is the interesting one and §5 takes it up. Note that the ask column is **FishAI's**
accuracy, not the opponent's: the low 34.1% there is FishAI asking badly in that matchup, not
`lockout` doing so.

---

## 3. The result that matters most: defusal replicates in a foreign engine

CONCESSION.md's headline — credit an ask that strips the card an opponent's published reach rests
on — was measured entirely inside FishAI, against FishAI's own roster. That is the weakest kind of
evidence a policy result can have: a mechanism can win a mirror match by exploiting a quirk shared
by every opponent it has ever met.

This is the test that could not be run at home. **A different engine, written by someone else, with
a different bot family, and the same FishAI policy with one knob moved.** Both arms play the same
fishlabs opponent on the same deals; only `defuse` changes.

300 duplicate pairs per opponent, reported as the per-deal paired difference in net sets:

| opponent | `defuse: 1` net sets | `defuse: 0` net sets | **paired delta** |
|---|---:|---:|---:|
| `fishbot` (v0.3) | −1.333 | −2.880 | **+1.547 ± 0.517** |
| `fishbot_v02` | −0.933 | −2.627 | **+1.693 ± 0.555** |
| `lockout` | −0.573 | −2.327 | **+1.753 ± 0.533** |
| `detective` | −0.593 | −2.300 | **+1.707 ± 0.560** |

Four independent opponents, four intervals excluding zero. And the effect **size** is the striking
part:

| where measured | paired set-difference |
|---|---:|
| FishAI engine, FishAI roster, holdout bank A | +1.50 |
| FishAI engine, FishAI roster, holdout bank B | +1.65 |
| FishAI engine, opponents that also defuse (CONCESSION.md §3.3) | +1.08 … +1.96 |
| **fishlabs engine, fishlabs bots** | **+1.55 … +1.75** |

The mechanism was derived, fitted and tuned entirely against FishAI's own roster and had never seen
any of these bots. It transfers, at the same magnitude, into someone else's engine.

**This is the strongest evidence in the project that defusal is a fact about Canadian Fish rather
than a fact about FishAI's roster.**

Note what it does *not* say: the `defuse: 1` column is still negative against all four: defusal
recovers about 1.6 sets of a deficit it does not close. FishAI loses to their top bots either way,
by less with the mechanism on.

**[corrected] §9 does not overturn this section, and it enlarges what "a deficit it does not close"
means.** The transfer result stands — no frontier game was a `defuse` ablation, so nothing in §9
speaks to whether the mechanism works. What §9 does is price the residual. The arm it played is
carrying `defuse: 1` (§9.4) and still finishes 3.58 sets to 5.42 against SESTINA. Defusal is a real
1.6-set effect sitting inside a gap several times its own size. This section's claim is about the
mechanism, not about standing, and it should not be read as the latter.

---

## 4. What their own materials report about SESTINA v1.0

Since SESTINA could not be run, this is their reported evidence, cited as theirs. Their README is
unusually candid and the candour is the most useful part of it.

| their reported result | margin | n |
|---|---:|---:|
| SESTINA v1.0 vs `F-cheap`, the pre-registered target | +3.33 pp [+2.88, +3.78] | 48,000 |
| vs the deployed v0.6 policy | +4.63 pp [+4.19, +5.06] | 48,000 |
| vs v0.5 | +5.18 pp [+4.56, +5.81] | 24,000 |

Three things follow, and all three are worth carrying into FishAI's own work:

1. **Frontier margins in this game are small — *within their lineage*.** A seventh development
   cycle, with a determinized search over a particle belief, buys about **three percentage points**
   over the cheapest configuration already on the previous frontier. That is the realistic scale of
   returns between successive frontier policies, and a useful corrective to any expectation that a
   new mechanism should swing a match. It also puts §3's +1.6 sets in perspective — that is a large
   effect by this game's standards. **[corrected]** It says nothing about the distance from outside
   the lineage to inside it: §9 measures FishAI 25.8 points under even against SESTINA and 21.4
   under against v0.6, an order of magnitude wider than the intra-lineage steps. Small margins
   between v0.5, v0.6 and v1.0 are compatible with a large gap to a heuristic policy, and both are
   now measured.
2. **They publish a negative about their own flagship**, which is the mark of a serious measurement
   culture: SESTINA v1.0 does not measurably beat a composite configuration assembled earlier in
   the same cycle. They also report it costs **at least 4.52×** the non-searching blueprint.
3. **They explicitly decline the strongest claim.** Their README separates "strongest configuration
   this project has produced", which they record as established, from global standing, which they
   record as *"not established, not claimed"*. There is no published basis for treating SESTINA as
   the strongest Canadian Fish agent in existence, and they are the ones saying so.

Their repository also documents a JSON-line cross-play protocol (`docs/BOT_PACKAGE.md`, third-party
bots added with `fish bots add`). **[corrected]** An earlier draft ended here saying a true
FishAI-vs-SESTINA match was possible and blocked only by the missing compiler, and that a toolchain
would make it a day's work. That was right on both counts. The match was run in a Linux container
and **§9 replaces this section as the answer to "how does FishAI do against SESTINA"**. §4 stays
because their published margins are the anchor §9 checks itself against, and because points 2 and 3
are about their measurement culture, not about the gap.

---

## 5. `lockout`: the owner's off-limits rule, already built, in their repository

Their strategy table describes `lockout` as a turn-starvation specialist: it ranks asks by posterior
and then **charges a penalty for missing into a dangerous opponent**. That is the owner's off-limits
rule, arrived at independently by someone else.

And in their own round-robin it does well. Every fishlabs bot against every other, 100 games × 2
orientations per pairing:

| bot | mean win rate vs the field |
|---|---:|
| `fishbot` (v0.3) | 82.69% |
| **`lockout`** | **77.06%** |
| `fishbot_v02` | 75.50% |
| `detective` | 75.31% |
| `diversifier` | 55.62% |
| `hunter` | 33.81% |
| `kv_search` | 30.25% |
| `random` | 14.37% |
| `bluffer` | 5.38% |

**This looks like a contradiction of CONCESSION.md §2, and it is not.** The distinction is the one
that separates a strategy from a term:

- `lockout` is a whole **strategy row** — its own declaration threshold (0.94), its own risk
  parameter, its own targeting — that happens to *contain* a danger penalty. Its 77% says a
  strategy built that way is strong. It does not isolate the penalty.
- CONCESSION.md §2 is an **ablation**: one policy, one term added, everything else byte-identical,
  duplicate deals, plus an information-free null control at matched magnitude showing that a
  perturbation of the same size is free. That isolates the penalty, and it costs up to 11.7 points.

An ablation and a strategy comparison answer different questions, and only the ablation answers
"does the danger penalty help". The `lockout` result is nonetheless a real caution, and it is
recorded here rather than buried: it is the strongest external evidence against this project's §2
finding, and the clean resolution — an ablation of `lockout`'s own penalty coefficient inside their
engine — is not something their TypeScript lab exposes as a knob.

**A supporting argument that was offered here has been withdrawn.** An earlier draft read §2's
34.1% as `lockout`'s own ask accuracy and took it as CONCESSION.md §2's mechanism — a policy that
avoids its best asks showing a low hit rate — visible from outside. That was a misread of the
column, which is FishAI's. Measured properly, both sides ask at almost exactly the same rate in
that cell:

| cell | FishAI ask % | opponent ask % |
|---|---:|---:|
| vs `fishbot` | 49.8 | 50.6 |
| vs `fishbot_v02` | 45.4 | 46.0 |
| vs `lockout` | **34.1** | **34.8** |
| vs `detective` | 43.5 | 44.4 |

Low ask accuracy in the `lockout` cell is a property of the **matchup**, depressing both sides
alike, not a signature of `lockout`'s policy. It is therefore no evidence about the danger penalty
in either direction, and the inference is retracted rather than restated. What survives is only the
narrower observation that `lockout` produces the largest `defuse` delta of the four (+1.753 in §3),
which is consistent with an opponent that publishes bases freely but does not establish why.

So §5 leaves the tension unresolved, which is the honest state: `lockout` ranks second in their
round-robin, this project's ablation says the penalty costs up to 11.7 points, and the two are not
measuring the same thing. Only an ablation of `lockout`'s own coefficient would settle it.

---

## 6. Common failure points observed

**Their `kv_search` collapses on declaration calibration, not on play.** It is their weakest
non-trivial bot in this lab (30.25% against the field; 0.0% against each of the top three) and the
mechanism is specific:

| `kv_search` vs `fishbot`, 40 games | `kv_search` | `fishbot` |
|---|---:|---:|
| mean sets | **1.5** | 7.5 |
| ask accuracy | 49.5% | 62.1% |
| **declaration accuracy** | **73.0%** | **95.3%** |

It is not being out-asked into oblivion — it is **gifting sets**. Under a rule set where a wrong
declare hands the set to the opponents, a 27% misdeclare rate is a losing position no amount of
asking recovers. Its declaration threshold (0.75) is the lowest of any serious bot in their table.
This is the clearest failure point the simulations produced, and it generalises: **under gift
rules, declare calibration dominates ask quality.**

The same lesson appears in FishAI's own numbers. Its declare accuracy against their bots is 90–94%
against `fishbot`'s 97%, and that gap is a plausible share of the one-to-seven points FishAI sits
below the top four of this lab.

**That generalisation was a prediction, §9 was its first real test, and it did not hold.** It was
made against a v0.3-era lab, about a mechanism — declare calibration outranking ask quality under
gift rules — and it was stated before any frontier game was played. The first version of §9
reported it confirmed. That confirmation was an artifact: the declare deficit it rested on was a
defect in the bridge (§9.5), not a property of FishAI.

| | §6, `kv_search` vs `fishbot` | §9, FishAI vs SESTINA v1.0 (corrected) |
|---|---|---|
| ask accuracy, loser / winner | 49.5% / 62.1% | 52.32% / 57.38% |
| **declare accuracy, loser / winner** | **73.0% / 95.3%** | **98.42% / 98.46% — parity** |
| what decided it | declaration | **asking, and time-to-cash** |

Read the second column against the first. The mechanism is not visible there. Against SESTINA v1.0
FishAI declares **as accurately as the frontier agent does** — 98.42% against 98.46%, a gap of four
hundredths of a point — so declare calibration cannot be what separates them. What does separate
them is ask accuracy (−5.06 points) and how long each sits on a resolved set before cashing it
(9.30 events against 2.92). §9.3 takes that apart.

**Recorded here as a prediction that failed its first real test**, not quietly dropped. The
mechanism may still be sound where it was derived — on a v0.3-era lab whose loser really did
declare at 73% — but it does not describe why FishAI loses to SESTINA v1.0, and the evidence that
appeared to say it did was measuring the adapter.

**FishAI's own visible weakness in this host** is the declare channel of §1: without the off-turn
window it must hold a set until its turn comes round, and a set held is a set an opponent may take
a card out of first.

---

## 7. What this document does not establish

This section scopes **§§1–6**. §9 carries its own limits in §9.5.

- **[corrected] Nothing about SESTINA v1.0 — in §§1–6.** No game in those sections was played
  against it, and §4 is their reported evidence rather than a measurement. The earlier version of
  this bullet said "no game was played against it" full stop; 4,800 were, and they are in §9.
- The opponents in §§2–6 are the **TypeScript lab bots**, which their README places at the v0.2–v0.3
  end of a lineage that reached v0.7.
- In §§2–6 FishAI played **without its declare window** (§1), the channel carrying 45.4% of its
  declares at home. Those win rates are floors. **[corrected]** Do not carry the word "floor" to
  §9: their C++ engine records out-of-turn declares for both seats, so that handicap is absent
  there and 27.08% is a plain number, not a lower bound.
- §2 is 150 duplicate pairs per cell and reports win rates without CIs; §3 is 300 properly paired
  duplicate pairs with CIs and is the load-bearing measurement.
- `psychologicalTells` was left **off** in their engine. It is a channel their bots can use and
  FishAI has no notion of; leaving it on would have measured something other than card play.
- `defuse` is the only knob moved in §3. No other FishAI parameter was tuned against their bots,
  and doing so would burn them as a holdout.

## 8. Reproducing §§2–6

This is the **TypeScript lab** harness. The frontier match of §9 is a different harness in a
different language and is reproduced in **§9.7**.

The harness lives in the session scratchpad under `xplay/`, outside the repository, beside the
fishlabs clone it drives:

```bash
node --import ./xplay/loader-reg.mjs xplay/roundrobin.mjs 100
```

`loader.mjs` resolves their `@/…` path alias and transpiles their TypeScript with the `typescript`
package already in FishAI's `node_modules` — their sources use constructor parameter properties,
which Node's built-in strip-only TypeScript mode rejects. `fishai-guest.mjs` is the adapter.
Seven small edits to their `lib/fish-engine.ts` register a guest strategy and maintain the unified
event log; they are confined to the scratchpad clone, which keeps the original beside them as
`fish-engine.orig.ts`.

---

## 9. FishAI against SESTINA v1.0, in their C++ engine

> **Correction (2026-08-31).** The first version of this section reported **24.22%**, called a
> mirror cell "the control that makes 24.22% mean what it says", and attributed four `fish
> pathology` counters to FishAI. All three were wrong, and they were wrong in the same way: the
> instrument was not checked as hard as the result. The headline was depressed **3.44 points** by a
> defect in the bridge; the mirror cell is a symmetry identity with **zero** statistical power, and
> their engine prints that fact on every mirror run; the pathology counters pool both teams, and
> their own documentation says so twice. The corrected figures are below. The withdrawn ones are
> named in §9.8 rather than deleted, because a published number does not stop existing.

The match §0 said could not be run has been run. Their engine builds from source in a Linux
container; FishAI plays as a **guest bot** over their documented `fishlabs-json-v1` protocol
(`docs/BOT_PACKAGE.md`), installed with `fish bots add`. Cells are 200 deals × 6 rotations = 1,200
games, duplicate deals — zero faults and zero action-limit games in every cell.

### 9.1 The result

**FishAI wins 27.08% of games against SESTINA v1.0** — 1,950 of 7,200 games, six seeds.

| arm | pooled win rate | games | deals |
|---|---:|---:|---:|
| **FishAI, corrected bridge** | **27.08%** | 1,950 / 7,200 | 1,200 |
| FishAI, defective bridge (withdrawn) | 23.64% | 1,702 / 7,200 | 1,200 |

Per seed, both arms on identical deals:

| seed | defective | corrected | delta |
|---|---:|---:|---:|
| 90210 | 24.33% | 28.25% | +3.92 |
| 4242 | 25.08% | 28.83% | +3.75 |
| 7011001 | 23.25% | 26.42% | +3.17 |
| 13579 | 22.83% | 26.17% | +3.33 |
| 24680 | 23.42% | 27.25% | +3.83 |
| 31415 | 22.92% | 25.58% | +2.67 |

**Every seed moves the same way.** Mean delta **+3.44 points**, SD 0.48, smallest +2.67. Pooled over
1,200 deals the paired detection floor is ±2.83 points, so the correction clears it; no single cell
would have, and that is the point of §9.6's note on which unit these floors are quoted in.

**The ladder, on three matched seeds** (90210 / 4242 / 7011001, 600 deals, both bridges on identical
deals):

| opponent | defective bridge | **corrected bridge** | under even |
|---|---:|---:|---:|
| SESTINA v1.0 | 24.22% | **27.83%** | 22.2 |
| FishBot v0.6 | 29.56% | **32.86%** | 17.1 |
| FishBot v0.5 | 29.17% | **33.31%** | 16.7 |

**FishAI still sits below their whole published lineage**, and that conclusion is unchanged. It is
also furthest under even against the frontier — 5.03 points below its v0.6 cell and 5.47 below its
v0.5 cell, both clearing the ±4.00 paired floor over 600 deals. What changed is by how much, and —
in §9.3 — why.

Two anchor cells run their own bots against each other through the same harness: SESTINA beats v0.6
at 54.17% and v0.5 at 55.58%. Their README reports +4.63 pp and +5.18 pp over even, i.e. 54.63% and
55.18%; both fall inside the measured cells. The harness reproduces their result when pointed at
their own matchups.

### 9.2 The control could not have worked, and the engine says so

The first version of this section reported *"FishAI vs FishAI, same harness: exactly 50.0000%
[47.18, 52.82]"* and read it as proof the bridge was symmetric. It proves nothing. Their engine
prints the reason on the mirror cell's own power line:

```
power  MIRROR CELL: win-rate effective sample is 0 (per-deal outcome is deterministic).
       Rate denominators are halved.
```

A mirror cell plays one policy against itself on duplicate deals. Every deal is replayed with the
seats rotated, so each game's outcome is the mirror of another game's, and the aggregate is **forced
to 50% by construction** before a card is dealt. The effective sample is zero, the engine says so in
so many words, and the `[47.18, 52.82]` interval published beside it was a Wilson interval computed
on a denominator the engine had already declared meaningless.

**It is not merely uninformative — it is uninformative about exactly the defect that was present.**
A mirror cell cannot see any bug that affects both sides equally, and the bug in §9.5 affected both
sides equally: it cost the *defective arm* 3.44 points against SESTINA while leaving the mirror at
50.0000%, because both mirrored seats lost the same sets in the same positions. The control returned
a perfect score across a four-point hole.

**What did find it was the per-op instrumentation, and it had already fired.** The adapter counts
every protocol op it services. `opPass` read **0** across 3,600 games — a cardless turn-holder never
once passed. The first version of this section recorded that number and filed it as *"unreached, not
verified"*. It was not an unreached branch. It was the symptom, printed in the artifact, of the
defect below. The lesson this section is willing to draw is narrow and unflattering: **a control
that cannot fail is not a control, and a counter that reads zero where zero is impossible is not a
coverage gap.**

There is no cell in this setup that can detect a symmetric bridge defect. That is a property of
mirror controls, not of this run, and no rearrangement of seats or seeds repairs it.

### 9.3 The mechanism: asking and cashing, not declaring

Per-decision detail, seed 90210, both bridges against the same SESTINA:

| | FishAI (defective) | **FishAI (corrected)** | SESTINA v1.0 |
|---|---:|---:|---:|
| declare accuracy | 92.83% | **98.42%** | **98.46%** |
| ask accuracy | 51.95% | **52.32%** | **57.38%** |
| lock hold, events before cashing | 9.55 | **9.30** | **2.92** |
| declarations per game | 3.74 | 3.64 | 5.31 |
| out-of-turn declares per game | 2.60 | 2.67 | 3.65 |

**The first version of this section named declaration as the mechanism. That was the bridge, and it
is withdrawn.** With the bridge corrected, FishAI's declare accuracy is **98.42% against SESTINA's
98.46% — a gap of four hundredths of a point.** FishAI declares as accurately as the frontier agent
does. The 5.24-point declare deficit reported earlier was, essentially in full, a defect in the
translation layer being read as a property of the policy.

Two gaps survive the correction, both untouched by it:

- **Asking: 52.32% against 57.38%, a 5.06-point deficit.** This is now the larger of the two
  behavioural gaps, not the smaller one.
- **Cashing: 9.30 events against 2.92, a factor of 3.2.** FishAI sits on a resolved set more than
  three times as long as SESTINA before declaring it, and a set held is a set that can still be
  taken apart. SESTINA declares 5.31 times a game to FishAI's 3.64 — it is not declaring more
  *accurately*, it is declaring more *often and sooner*, at the same accuracy.

The lock-hold figure is the one to build against. It is large, it is stable across bridges (9.55 →
9.30, i.e. the defect barely touched it), and unlike ask accuracy it names a specific missing
capability rather than a diffuse one: FishAI reaches a proof late that SESTINA reaches early.

**The `fish pathology` KPI table that stood here is withdrawn in full** — see §9.8.

### 9.4 What this comparison is not

**It is not like-for-like, and the gap is not a surprise.** SESTINA v1.0 is a determinization
*search* agent: it samples worlds from a particle belief and searches each one. FishAI's
`STYLE_ROSTER.punter` is a heuristic policy that scores the legal moves once. Their own README
prices SESTINA at **at least 4.52×** the cost of the non-searching blueprint it descends from.
Expecting a policy that scores moves once to hold parity against a search agent spending four and a
half times the compute would be naive. This document did not expect it.

A gap was expected. **Its size is the finding**: 22.9 points under even against the frontier, and
17.1 points under even against v0.6 — a policy from before the search was added. The second number
is the one that stings, because v0.6 is not a search agent either.

**Which FishAI played.** The arm is `STYLE_ROSTER.punter` at full-strength inference
(`SKILL_PRESETS.hard`). Three labels describe this same policy:

- the roster's **dominant style** (ADAPTIVE.md's counter-table row);
- **v1.5 at an unbounded budget** — a bounded seat with no cap is the bare style. BOUNDED.md
  records that identity for the *Balanced* seat, in §5a, which is itself marked
  **[measured, exploratory]**, and re-verifies the anchor out of sample at **0 mismatches in 28,464
  paired decisions**. Reading it across to Punter is the same argument about the same knob, but
  BOUNDED.md measures it on Balanced. Treat it as an extension, not a citation;
- carrying **v2.0's `defuse: 1`**, which is not a per-style choice — it sits on the `BALANCED` base
  in `lib/engine/bots/roster.ts` and every roster entry inherits it through `style()`.

**The opponent.** SESTINA v1.0's frozen spec, verified byte-identical in its `spec` and
`allparamsSpec` fields to the `sestina-v1.0` release asset `fishbot_v07.json`:

```
v07:r12=25,rtie=1,pool=-1,oppfloor=-1,force=1000000,askfloor=-1,stall=12,s1=1,det=12,cand=4,kappa=2.5,rbelief=indep,depth=12,maxq=26
```

### 9.5 The bridge defect, in full

**What it was.** `us54` has no pass. When a seat holds the turn and has no cards, RULES_US54 §3.2
`MUST_DECLARE` compels it to declare on best evidence, because the alternative is a table that never
progresses — `viewerCouldAskIfWindowClosed` returns false on an empty hand, so `mustDeclareNow`
fires, and `decide` is forbidden from declining ([decide.ts:550](lib/engine/bots/decide.ts#L550)).

Their engine **does** have a pass. It has a `pass` op for exactly that position and sends it the
moment the declare poll is answered "none". The adapter translated FishAI's compulsion into a host
that does not impose it: polled at a cardless turn-holder, FishAI answered with a compelled,
speculative declare instead of declining and being handed the pass it was about to be offered. Every
such declare spent a set to avoid a move that costs nothing.

**The fix** is one guard in the adapter's `declare_poll` handler, and it is deliberately narrow — it
fires only when the trace kind is `must-declare` or `forced-claim`, the compelled variants
([decide.ts:1699](lib/engine/bots/decide.ts#L1699)). A confident `own-book-claim`, `certain-claim`
or `ev-claim` still goes through untouched, so the guard suppresses compulsion and nothing else.

**What it cost.** 3.44 points of win rate and 5.59 points of declare accuracy. It is a defect in the
bridge, not in FishAI: the policy was answering a question the host never asked.

**Why it is a finding and not a footnote.** The defect is a *rules-dialect mismatch*, which is the
failure mode any cross-play measurement is most exposed to and least able to see. It survived a
mirror control, two adversarial audits, and eight zeroed corruption counters. It was caught by a
counter reading zero where zero was impossible.

### 9.6 Instrument caveats that travel with the numbers

Every one of these is part of the result. None is filed away somewhere the number can travel
without it.

- **The floors are quoted per deal, not per game.** A cell is 1,200 games but only **200 deals**,
  replayed 6 ways. Their engine reports both floors and they differ by 2.4×: `±2.83 pts unpaired
  over 1200 games; ±6.93 pts over 200 deals (the paired floor)`. **The deal figure governs.** The
  first version of this section printed Wilson intervals of about ±2.4 points per cell, computed as
  though 1,200 games were independent draws. They are not. Single-cell differences smaller than
  ~6.9 points are not resolvable, and several comparisons made in the first version were inside that
  band.
- **Two independent adversarial audits returned sound-with-caveats**, and both missed the §9.5
  defect. Record that as a fact about audits, not a reassurance.
- **Every corruption counter was zero** over the whole measurement — `planMismatch`,
  `booksDisagree`, `successHolderClash`, `viewInvariant`, `declareShapeBad`, `traceFallback`,
  `askNotAsk`, `forcedOwnTeamOut` — and the run was defective anyway. Corruption counters detect
  corruption, not mistranslation.
- **`opPass` now fires.** It read 0 before the fix, which was the symptom; it is exercised in every
  corrected cell.
- **The failed-declare asymmetry runs the safe way.** On a failed declare their protocol reveals
  nothing about true holders, but FishAI's internal `PublicEvent.claim` carries `actualHolders`. The
  adapter emits only cards already public from an earlier hit. FishAI therefore sees *less* than its
  home engine would give it and never sees anything false: strictly weaker inference, never wrong
  inference. It cannot inflate the result.
- **The one `major` audit finding is closed** — in Monet v0.1, and this bullet used to say it was
  still open. `observe.ts` replayed hand counts by iterating the partial `actualHolders` map
  rather than the book, so every card the map omits stayed in a hand *and* stayed publicly
  located: a later ask for one of them scored `certainAsks` or `provablyDeadAsks` against a hand
  it had already left. The fix iterates the book, clears `publicHolder` for every card of a
  resolved set whether the reveal named it or not, clamps a debit at zero, and refuses to
  attribute a card to a seat no witness names. It also gates the two declare *signatures* —
  `foreignDeclares`, `ownHandOnlyDeclares` — on a reveal that names the whole book, because on an
  empty map "the claimer is not among the holders" is vacuously true and scored every bridged
  failed declare as foreign. **What the fix does not recover:** a card the reveal omits and no
  earlier hit located left a hand the log cannot identify, so that hand's count stays one too
  high, and a reveal that contradicts an earlier hit leaves the losing seat over by one. Neither
  is guessed at. Both are now *reported* — `replayCounts(view).countsExact`, carried onto every
  `SeatObservation` — where before they were silent. None of this is reachable at a fixed roster
  style, so no number in §9 moves.
- **Their engine is sensitive to floating-point contraction.** `-march=native`, their Makefile
  default, enables FMA and changes tie-breaks, so their published identity digests do not reproduce
  across machines. `-march=native -ffp-contract=off` reproduces the generic digest exactly. All
  three of their own identity controls **PASS** on this build. Every cell reported here is the
  portable `-ffp-contract=off` build.
- **Roster style was never varied in these cells.** The arm is Punter throughout, and **no claim is
  made here that Punter is the right arm abroad** — only that it is the arm that ran. A style sweep
  on the *defective* bridge separated the four roster styles by well under a per-cell floor; it has
  not been repeated on the corrected bridge.
- **Licensing.** github.com/dylann4500/FishLab carries **no licence file**. No code or prose of
  theirs is copied here. The adapter was written from their published protocol document alone, lives
  in a scratchpad, and is never committed.

### 9.7 What §9 does not establish

- Nothing about a **tuned** FishAI. No FishAI parameter was fitted against SESTINA, and doing so
  would burn it as a holdout exactly as §7 says of their lab bots.
- Nothing about the **adaptive arm.** The `observe.ts` defect that disqualified the adapter for it
  is closed (§9.6), so the blocker is gone — but no adaptive cell has been run over this bridge,
  and the *residual* limit travels with the adapter: on a foreign log the replayed counts can be
  an upper bound, `missFewestShare` and `missMostShare` are exactly the two features that compare
  counts across seats, and anything weighing them must read `countsExact` first.
- **The ladder ordering rests on matched seeds, not on single cells.** FishAI is furthest under even
  against SESTINA — 5.03 points below its v0.6 cell and 5.47 below its v0.5 cell — and those gaps
  clear the ±4.00 paired floor over 600 deals *only because the three opponents were played on the
  same three seeds*. Read cell-to-cell across different seeds, nothing here separates them: the
  defective arm alone spans 28.58% and 30.92% against v0.6 on two seeds, a 2.3-point swing that is
  pure seed variation inside a ±6.93 floor.
- The seeds share a build and an adapter. They are not independent implementations, only independent
  deals — and §9.5 is what a shared adapter is worth as a risk.

### 9.8 Numbers withdrawn from the first version of §9

Named rather than deleted, because a published number does not stop existing.

| withdrawn | was reported as | status |
|---|---|---|
| **24.22%** | FishAI vs SESTINA v1.0 | superseded by **27.08%**; the old figure carried the §9.5 defect |
| **50.0000% [47.18, 52.82]** | "the control passed" | **void.** Zero effective sample; a forced identity, not a test (§9.2) |
| **93.25% declare accuracy** | FishAI's declare rate | superseded by **98.42%**, at parity with SESTINA (§9.3) |
| **"the mechanism is declaration, not asking"** | §9.3's finding | **reversed.** Declaration is at parity; asking and cashing are the gaps |
| **53.85% of forced declarations wrong** | "the single worst number in the run" | **withdrawn.** `fish pathology` pools both teams; not attributable to FishAI |
| **8.83% of asks into own locked sets** | a FishAI target-selection bug | **withdrawn.** Pooled over both teams |
| **47.68% repeat (actor, suit, target)** | a FishAI pathology | **withdrawn.** Pooled over both teams |
| **4.21% of declarations wrong** | FishAI's base rate | **withdrawn.** Pooled over both teams |
| per-cell **95% CIs of about ±2.4 pts** | precision of a cell | **too narrow.** The governing floor is ±6.93 pts per cell (§9.6) |

The four pooled counters are withdrawn on the authority of FishLab's own documentation, which states
in two places that `fish pathology` pools both sides, and warns that a pooled figure in a cross match
is therefore unreliable (`docs/FISHBOT_V05.md`, once as a caveat on their own cross match and once
in their KPI notes). That caveat was in the repository throughout and was read past.

### 9.9 Reproducing §9

Their engine needs a C++ toolchain, which the Windows host does not have and a Linux container
does. The image used here was `node:24-bookworm` plus `g++`, `make` and `zip` — Node is needed in
the *same* image, because the adapter is a Node process the engine spawns as a guest seat, and
building the engine with that image's compiler keeps its C++ runtime and the adapter's runtime
matched. Their Makefile defaults to `clang++`; **g++ 12 builds it unmodified** (~35 s, single
translation unit, warnings only), so a C++20 g++ is sufficient and clang is not required.

FishAI's own TypeScript needs no build step in that image: Node 24 imports `lib/engine/index.ts`
directly by type-stripping, so the adapter can mount this repository read-only and call `decide`
with no bundler, loader hook or transpile.

```bash
# 1. Build their engine inside a Linux container, from their own source tree.
docker run --rm -it -v "$PWD:/w" -w /w <linux-image-with-clang-and-make> bash

# 2. Build with FP contraction OFF. Their Makefile defaults to -march=native, which enables FMA,
#    changes tie-breaks, and makes their published identity digests unreproducible across machines:
#        -march=native -ffp-contract=off
#    reproduces the generic digest exactly. Run their three identity controls and require PASS on
#    all three before playing a single game.

# 3. Register FishAI as a guest bot over their JSON-line protocol.
fish bots add <path-to-the-fishai-adapter-package>

# 4. Apply the 9.5 guard to the adapter FIRST. Without it every cell carries the bridge defect,
#    and no control in this setup will tell you so. Confirm by asserting `opPass > 0` after a cell.

# 5. Play each cell: 200 deals x 6 rotations = 1,200 games, duplicate deals. Headline seeds
#    90210 / 4242 / 7011001 / 13579 / 24680 / 31415; the ladder uses the first three. Opponent is
#    the frozen v1.0 spec in 9.4; verify it byte-identical against `fishbot_v07.json` from the
#    sestina-v1.0 release before trusting the cell.

# 6. Read the power line the engine prints. It states BOTH floors; the per-deal one governs.
```

Exact target names, Makefile variables and match-runner flags are in their `docs/BOT_PACKAGE.md`
and their Makefile, and are **not reproduced here** — the repository has no licence, so this section
describes the procedure and leaves their text where it is. The adapter is original work written
from that protocol document, lives in the session scratchpad beside the clone, and is not committed
to FishAI.
