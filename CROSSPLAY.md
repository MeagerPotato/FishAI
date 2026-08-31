# CROSSPLAY.md — FishAI against the fishlabs bots, in the fishlabs engine

The owner asked for simulations against **SESTINA v1.0**, the frontier agent in
[github.com/dylann4500/fishlabs](https://github.com/dylann4500/fishlabs), reporting win
percentages, common occurrences, key strategies and common failure points.

This document reports what was actually played. The short version is at the top, because one part
of the request could not be honoured and that matters more than any number below.

> **Provenance and licensing.** The fishlabs repository carries **no licence file**, so default
> copyright applies. Nothing from it is copied into FishAI — not code, not prose. A clone lives in
> this session's scratchpad only, is never committed, and the adapter that lets FishAI play inside
> it is original work. Their *measured findings* are cited as theirs, with attribution, in §4.

---

## 0. What ran, and what did not

| | |
|---|---|
| **SESTINA v1.0 itself** | **not played.** It is C++ (`engine/src/`, built with `clang++ -std=c++20`) and this machine has no C++ toolchain — `g++`, `clang++`, `cl`, `gcc`, `make`, `cmake` all absent. Their binary cannot be produced here. |
| what was played instead | The fishlabs **TypeScript** engine (`lib/fish-engine.ts`) and the eight bots shipped in it, which run under Node with no compiler. FishAI plays inside it as a guest. |
| how far that is from SESTINA | The TS lab's strongest bot is **FishBot v0.3**. Their lineage runs v0.2 → v0.6, and SESTINA v1.0 is v0.7. The opponent here is roughly **four releases behind** their frontier. |

**A naming correction, made explicitly because it briefly went the other way.** The bot was
referred to as "SISTINA". The correct name is **SESTINA v1.0**, and it is real: their README
documents it as the successor to the FishBot lineage, developed and evaluated as FishBot v0.7. A
first search of their repository for "sistina" returned nothing and momentarily suggested the agent
did not exist. It does, under the other spelling.

So: **no result below is a result against SESTINA v1.0.** Everything below is against the v0.3-era
TypeScript lab. §4 reports what their own materials say about SESTINA, which is the only honest
thing available on that question without a compiler.

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

**FishAI is competitive with their top four and slightly behind them** — 42.7% to 48.7%, one to
seven points under even, while playing without the channel that carries 45% of its declares. It is
decisively ahead of the rest of their field.

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

1. **Frontier margins in this game are small.** A seventh development cycle, with a determinized
   search over a particle belief, buys about **three percentage points** over the cheapest
   configuration already on the previous frontier. That is the realistic scale of returns here, and
   a useful corrective to any expectation that a new mechanism should swing a match. It also puts
   §3's +1.6 sets in perspective — that is a large effect by this game's standards.
2. **They publish a negative about their own flagship**, which is the mark of a serious measurement
   culture: SESTINA v1.0 does not measurably beat a composite configuration assembled earlier in
   the same cycle. They also report it costs **at least 4.52×** the non-searching blueprint.
3. **They explicitly decline the strongest claim.** Their README separates "strongest configuration
   this project has produced", which they record as established, from global standing, which they
   record as *"not established, not claimed"*. There is no published basis for treating SESTINA as
   the strongest Canadian Fish agent in existence, and they are the ones saying so.

Their repository also documents a JSON-line cross-play protocol (`docs/BOT_PACKAGE.md`, third-party
bots added with `./fish bots add`). **A true FishAI-vs-SESTINA match is therefore possible, and is
blocked only by the missing compiler** — not by anything about either project. Installing an LLVM
or MSVC toolchain would make it a day's work.

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
below their top four.

**FishAI's own visible weakness in this host** is the declare channel of §1: without the off-turn
window it must hold a set until its turn comes round, and a set held is a set an opponent may take
a card out of first.

---

## 7. What this document does not establish

- **Nothing about SESTINA v1.0.** No game was played against it. §4 is their reported evidence, not
  a measurement made here.
- The opponents are the **TypeScript lab bots**, which their README places at the v0.2–v0.3 end of
  a lineage that reached v0.7.
- FishAI played **without its declare window** (§1), the channel carrying 45.4% of its declares at
  home. Its win rates are floors.
- §2 is 150 duplicate pairs per cell and reports win rates without CIs; §3 is 300 properly paired
  duplicate pairs with CIs and is the load-bearing measurement.
- `psychologicalTells` was left **off** in their engine. It is a channel their bots can use and
  FishAI has no notion of; leaving it on would have measured something other than card play.
- `defuse` is the only knob moved in §3. No other FishAI parameter was tuned against their bots,
  and doing so would burn them as a holdout.

## 8. Reproducing this

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
