# CROSSPLAY.md — FishAI against the fishlabs bots, in the fishlabs engine

The owner asked for simulations against **SESTINA v1.0**, the frontier agent in
[github.com/dylann4500/fishlabs](https://github.com/dylann4500/fishlabs), reporting win
percentages, common occurrences, key strategies and common failure points.

This document reports what was actually played. The short version is at the top.

> **The frontier match has since been played, and §9 carries it.** In their own C++ engine, over
> their own bot-package protocol, **FishAI wins 24.22% of games against SESTINA v1.0** and sits
> below their entire published lineage — it loses to v0.5 and v0.6 as well. The mirror control
> passed at exactly 50%.
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
Against the shipped lineage FishAI wins 28.6% (v0.6), 28.2% (v0.5) and 24.2% (SESTINA v1.0) — 21 to
26 points under even, not one to seven. §2 measures standing against the lab and nothing more.

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

**That generalisation was a prediction, and §9 is the test it passed.** It was made against a
v0.3-era lab, about a mechanism — declare calibration outranking ask quality under gift rules — and
it was stated before any frontier game was played. Against SESTINA v1.0 the same shape appears in
the same place, at roughly a quarter of the magnitude and to the same effect:

| | §6, `kv_search` vs `fishbot` | §9, FishAI vs SESTINA v1.0 |
|---|---|---|
| ask accuracy, loser / winner | 49.5% / 62.1% | 51.89% / 57.28% |
| **declare accuracy, loser / winner** | **73.0% / 95.3%** | **93.25% / 98.49%** |
| what decided it | declaration | declaration |

Read the second column carefully, because it makes the point more sharply than the first. Against
SESTINA the two deficits are **the same size**: 5.39 points of ask accuracy, 5.24 points of declare
accuracy. They do not cost the same. A missed ask transfers a turn; a wrong declare transfers a
set, permanently, to the team that did not earn it. Equal deficits, unequal prices — which is
exactly what "declare calibration dominates ask quality" asserts, and it is now visible against an
agent four releases stronger than the bot the claim was derived from. §9.3 takes the pricing apart.
**Recorded here as a prediction that held**, not as a restatement.

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
  there and 24.22% is a plain number, not a lower bound.
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

The match §0 said could not be run has been run. Their engine builds from source in a Linux
container; FishAI plays as a **guest bot** over their documented `fishlabs-json-v1` protocol
(`docs/BOT_PACKAGE.md`), installed with `fish bots add`. 1,200 games per cell — 200 deals × 6
rotations, duplicate deals — zero faults and zero action-limit games in every cell.

### 9.1 The result

**FishAI wins 24.22% of games against SESTINA v1.0.**

| cell | FishAI win rate | 95% CI | mean sets (FishAI − opp) |
|---|---:|---|---|
| vs SESTINA v1.0, seed 90210 | 24.33% | [21.99, 26.84] | 3.58 − 5.42 |
| vs SESTINA v1.0, seed 4242 | 25.08% | [22.71, 27.61] | 3.61 − 5.39 |
| vs SESTINA v1.0, seed 7011001 | 23.25% | [20.95, 25.72] | 3.60 − 5.40 |
| vs SESTINA v1.0, native-FP build | 22.58% | [20.31, 25.03] | 3.56 − 5.44 |
| vs FishBot v0.6 | 28.58% | [26.10, 31.20] | 3.74 − 5.26 |
| vs FishBot v0.5 | 28.17% | [25.69, 30.78] | 3.79 − 5.21 |
| SESTINA vs v0.6 (anchor) | 54.17% | [51.34, 56.97] | 4.63 − 4.37 |
| SESTINA vs v0.5 (anchor) | 55.58% | [52.76, 58.37] | 4.70 − 4.31 |

Pooled across the three portable-build seeds: **872 / 3,600 games = 24.22%**. The native-FP build is
reported separately and is not pooled, for the reason in §9.4.

**FishAI sits below their entire published lineage.** Not only below the frontier: it loses to
**v0.6 at 28.58%** and to **v0.5 at 28.17%**, the two policies SESTINA was built to beat. There is
no rung of their ladder FishAI clears. The three seeds and the fourth build agree inside their
intervals, so this is not one unlucky bank.

The two anchor cells are their own bots against each other, run through the same harness as a check
on the instrument. Their README reports SESTINA at +4.63 pp over v0.6 and +5.18 pp over v0.5; read
as margins over even, that is 54.63% and 55.18%. The anchors here measure 54.17% and 55.58%, and
both of their published figures fall inside the measured intervals. The harness reproduces their
result when it is pointed at their own matchups.

### 9.2 The control passed

**FishAI vs FishAI, same harness, same protocol: exactly 50.0000%** [47.18, 52.82], sets 4.5 − 4.5.

This is the number that makes 24.22% mean what it says. A mirror match through a foreign engine, a
JSON protocol and an adapter written from a spec has many ways to come out lopsided — a seat-order
bias, a rotation bug, a first-mover advantage in the translation layer, an adapter that hands one
side more information than the other. Any of those would have shown here. None did. The instrument
is symmetric, so the 25.8 points are lost at the table and not in the adapter.

### 9.3 The mechanism: declaration, not asking

Per-decision detail from the seed-90210 cell:

| | FishAI | SESTINA v1.0 |
|---|---:|---:|
| **declare accuracy** | **93.25%** | **98.49%** |
| ask accuracy | 51.89% | 57.28% |
| lock hold, events before cashing | 9.69 | 2.78 |
| out-of-turn declares per game | 2.58 | 3.61 |

The declare column is the finding. Both deficits are the same size — 5.39 points of ask accuracy,
5.24 points of declare accuracy — and they are not worth the same. A missed ask costs a turn. A
wrong declare hands a set to the other team and cannot be undone. §6 predicted exactly this
ordering from `kv_search`'s collapse, and §6 now records it as a prediction that held.

The `pathology` KPIs, over 240 games against SESTINA, say where the declares go wrong:

| KPI | value |
|---|---|
| **forced endgame declarations** | **13, of which 7 wrong = 53.85%** |
| asks into FishAI's own locked sets | 1,924 = **8.83% of asks**, all guaranteed misses |
| declarations, all contexts | 2,160, of which 91 wrong = 4.21% |
| DEAD asks (actor could prove the target lacks the card) | 49 = 0.225% of asks |
| starved turns | 12 = 0.055% |
| repeat (actor, suit, target) | 47.68% |
| action-limit games | 0% |

**53.85% is the single worst number in the run.** When FishAI is forced to declare — out of cards,
out of legal asks, no choice left — it is wrong more often than a coin. Its ordinary declares are
wrong 4.21% of the time; forced ones are wrong at nearly thirteen times that rate. The policy
arrives at the endgame holding sets it has not resolved, and then pays for them. The 9.69-vs-2.78
lock-hold figure is the same fact seen earlier in the game: FishAI sits on a resolved set for
roughly three and a half times as many events before cashing it, and a set held is a set that can
still be taken apart. n = 13 is small and the 53.85% carries a wide interval, but the direction is
consistent with the lock-hold gap and with the 4.21% base rate it sits above.

The 8.83% of asks fired into FishAI's own locked sets is a second, separate leak: one ask in eleven
is a guaranteed miss by construction, spent against cards the asking team has already secured. That
is not a calibration error, it is a target-selection bug, and it is cheap to look for.

### 9.4 What this comparison is not

**It is not like-for-like, and the gap is not a surprise.** SESTINA v1.0 is a determinization
*search* agent: it samples worlds from a particle belief and searches each one. FishAI's
`STYLE_ROSTER.punter` is a heuristic policy that scores the legal moves once. Their own README
prices SESTINA at **at least 4.52×** the cost of the non-searching blueprint it descends from.
Expecting a policy that scores moves once to hold parity against a search agent spending four and a
half times the compute would be naive. This document did not expect it.

A gap was expected. **Its size is the finding**: 25.8 points under even against the frontier, and
21.4 points under even against v0.6 — a policy from before the search was added. The second number
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

### 9.5 Instrument caveats that travel with the numbers

Every one of these is part of the result. None is filed away somewhere the number can travel
without it.

- **Two independent adversarial audits returned sound-with-caveats.** Not clean. The caveats are
  below.
- **Every corruption counter was zero** over the whole measurement: `planMismatch`,
  `booksDisagree`, `successHolderClash`, `viewInvariant`, `declareShapeBad`, `traceFallback`,
  `askNotAsk`, `forcedOwnTeamOut`.
- **The failed-declare asymmetry, and why it runs the safe way.** On a failed declare their protocol
  reveals nothing about true holders, but FishAI's internal `PublicEvent.claim` carries
  `actualHolders`. The adapter emits only cards already public from an earlier hit. FishAI therefore
  sees *less* than its home engine would give it and never sees anything false: strictly weaker
  inference, never wrong inference. It cannot inflate 24.22%.
- **`opPass` never fired (`opPass = 0`).** Report that op as **unreached, not verified**. Nothing in
  this run exercises it.
- **One `major` audit finding stands.** `observe.ts` mis-replays counts from the partial holders
  map. It is unreachable at a fixed roster style, so it does not touch this result — and it means
  **the adapter must not be reused for the adaptive arm without a fix.**
- **Their engine is sensitive to floating-point contraction.** `-march=native`, their Makefile
  default, enables FMA and changes tie-breaks, so their published identity digests do not reproduce
  across machines. `-march=native -ffp-contract=off` reproduces the generic digest exactly. All
  three of their own identity controls **PASS** on this build. The native-FP cell (22.58%) is
  reported to show what the flag is worth and is excluded from the pooled headline.
- **Licensing.** github.com/dylann4500/FishLab carries **no licence file**. No code or prose of
  theirs is copied here. The adapter was written from their published protocol document alone, lives
  in a scratchpad, and is never committed.

### 9.6 What §9 does not establish

- Nothing about a **tuned** FishAI. No FishAI parameter was fitted against SESTINA, and doing so
  would burn it as a holdout exactly as §7 says of their lab bots.
- Nothing about the **adaptive arm** — see the `observe.ts` finding in §9.5.
- The 53.85% forced-endgame figure rests on **13 events**. It is the worst number in the run and
  the least precisely measured one; both are true.
- The three seeds share a build and an adapter. They are not independent implementations, only
  independent deals.

### 9.7 Reproducing §9

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

# 4. Play each cell: 200 deals x 6 rotations = 1,200 games, duplicate deals, seeds 90210 / 4242 /
#    7011001. Opponent is the frozen v1.0 spec in 9.4; verify it byte-identical against
#    `fishbot_v07.json` from the sestina-v1.0 release before trusting the cell.
```

Exact target names, Makefile variables and match-runner flags are in their `docs/BOT_PACKAGE.md`
and their Makefile, and are **not reproduced here** — the repository has no licence, so this section
describes the procedure and leaves their text where it is. The adapter is original work written
from that protocol document, lives in the session scratchpad beside the clone, and is not committed
to FishAI.
