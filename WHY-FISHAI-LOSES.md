# WHY-FISHAI-LOSES.md — it declares as accurately as the frontier and proves three times slower

*Slower proving is the largest identified term, not a demonstrated cause of the loss; §3.1 states
what the evidence does and does not separate.*

> **Correction (2026-08-31).** The first version of this document was written against a defective
> bridge. It explained a 24.22% loss to SESTINA v1.0 and named **declaration quality** as the
> largest genuine channel, on a measured 93.53%-against-98.37% declare-accuracy deficit. The bridge
> defect (CROSSPLAY.md §9.5) accounted for essentially all of that deficit. On the corrected arm
> **FishAI declares at 98.42% against SESTINA's 98.46%** — four hundredths of a point — and the
> headline is **27.83%** on three matched seeds, **27.08%** pooled over six. **The diagnosis
> reverses.** Declaration accuracy is not a channel at all; it is at parity. What survives, and is
> now the only surviving declaration-side gap, is *when* FishAI declares: **9.30 events of lock hold
> against 2.92, a factor of 3.2**. The thesis of §3 is unchanged and stronger, because it no longer
> competes with a rival explanation. Everything the first version priced was priced against a
> baseline 3.44 points too low, and its power floors were quoted in the wrong unit — per game rather
> than per deal, which is 2.449× too tight. Every superseded figure is named in §8 rather than
> deleted.

**Provenance convention.** Two adapter arms exist and every figure names one:

| arm | what it is |
|---|---|
| `bot:fishai` | **defective bridge.** Every H1–H6 figure and every pre-2026-08-31 number. |
| `bot:pf2` | **corrected bridge.** One guard in the adapter's `opPoll`; all re-measurement. |

A bracket gives arm, sample and the governing floor: `[pf2, 3 seeds, 600 deals, ±4.00]`. A cell is
200 deals × 6 rotations = 1,200 games. Figures with no bracket are from a committed FishAI document
or from this document's arithmetic over bracketed inputs. Claims are tagged **[measured]**,
**[inferred]** or **[speculative]** where the distinction carries weight.

**The floors are per deal, not per game**, and the engine prints both on every cell:

```
power  98/sqrt(N): +/-2.83 pts unpaired over 1200 games; +/-6.93 pts over 200 deals (the paired
       floor).  1 pt needs 9604 games, 0.5 pt 38416, 0.25 pt 153664
```

| sample | deals | paired floor |
|---|---:|---:|
| one cell | 200 | **±6.93** |
| three seeds | 600 | **±4.00** |
| five seeds | 1,000 | **±3.10** |
| six seeds | 1,200 | **±2.83** |

The first version of this document quoted `98/√N` with N counted in games and declared several
comparisons resolved that were not. Every floor below is per deal.

**Licensing.** github.com/dylann4500/FishLab carries no licence file, so default copyright applies.
Their repository is read here for mechanism designs and measured findings only; nothing of theirs
is copied, and their results are cited as theirs. The adapter lives in a session scratchpad and is
never committed.

---

## 0. The headline, in one table

139 cells and 166,800 games of re-measurement on `bot:pf2` settle most of what the first version
left open, reverse two of its conclusions, and dissolve one of its three "instrument artifacts"
into another.

**One of the three largest terms in the published deficit was not FishAI playing badly.** It was
the adapter, and it is worth 3.44 points. The rest is FishAI, and the largest identified part of it
is a single capability: FishAI cannot say *which of my two teammates holds each card* of a set its
team already owns.

| cause | kind | win-rate points | bridge | evidence |
|---|---|---:|---|---|
| **Cardless turn-holder compelled to declare** | **instrument artifact — adapter** | **+3.44** recovered | both | 6 seeds, 1,200 deals, ±2.83; 6/6 |
| **Proof latency: the team owns a set and no seat can allocate it** | **genuine; the largest identified term, 25.9% of the gap** | **≤ +5.75** ceiling | pf2 | oracle, 3 seeds, 600 deals, ±4.00; 3/3 |
| λ = 0.60 licence conditioning, derived at home, never shipped | genuine, **large and unshipped** | **+3.71** on the shipped config | pf2 | 6 seeds, 1,200 deals, ±2.83; 6/6 |
| `defuse` appetite, already shipped at 1 | genuine, already banked | **+3.42** vs removing it | pf2 | 6 seeds, 1,200 deals, ±2.83; 6/6 |
| Ordinary declare accuracy, net of the artifact | **no measurable term** | ~0 | pf2 | 98.37% vs 98.33% on 3 seeds |
| Terminal (9th) half-suit | **reclassified — mostly the same artifact** | not separately priced | pf2 | §2.2 |
| Forced endgame | genuine, **negligible; sign unresolved** | ≤ 0.5 | pf2 | 79 vs 145 declarations; intervals overlap |
| Dead asks | genuine, negligible | ≪ 1 (≈0.1 cards/game) | fishai | mechanism counts; code defect confirmed |
| Ask **selection** | **not a cause — FishAI selects better** | +5.49 ask-accuracy pts, in FishAI's favour (net gap −4.89 against); not priced in win rate | fishai | replay at 100.000% fidelity |
| `containedPass` turn-pass | **not a cause** | +0.100 [−0.053, +0.253] | fishai | paired ablation, 5,994/6,000 games identical |
| Cheap determinization search | **re-opened — refutation not reproduced** | −1.1 to +0.2, all unresolved | pf2 | 3 arms, 3 seeds, 600 deals, ±4.00 |
| Unattributed residual | — | **~16.4** | — | nobody measured it |

> **"Largest identified" is not "dominant."** The unattributed residual in the last row is ~16.4
> points, about three times the proof-latency ceiling, and §6.1 records that nothing here measured
> it. No row of this table may be described as dominant while that row stands.

**The terms do not sum, and adding them is the specific error this project has already
documented.** ASKING.md §6 measured two mechanisms worth +1.915 and +2.068 sets alone and **+1.565
together** — substitutes, not complements. The re-measurement confirms that in cross-play with an
explicit factorial: `defuse` and λ have an **interaction of −4.12 points** (§6.2), and the first
version's §2.1 and §2.2 turn out to have double-counted one mechanism (§2.2). The table is a
ranking, not a budget.

**One sentence.** FishAI's largest *identified* deficit is proof latency — **9.30 events to reach a
proof SESTINA reaches in 2.92** [pf2, s90210] — and closing it perfectly by cheating is worth
**+5.75 of the 22.17 points to even**, 25.9%; the remaining ~16.4 points are unattributed, and 3.44
points of the published gap was never FishAI at all, but a position the bridge invented and FishAI's
own rules made illegal to decline. **[measured] for the 9.30 / 2.92 gap and for the +5.75 ceiling;
[inferred] that the gap is a cause of the loss rather than partly a symptom of it — see the confound
note in §3.1.**

---

## 1. The deficit, as arithmetic

The engine's own accounting closes on the corrected bridge exactly as it did on the defective one.
Mean sets for side A equals declarations made times their accuracy, plus declarations the opponent
got wrong:

```
mean_sets_A  =  decl_A · acc_A  +  decl_B · (1 − acc_B)  +  auto_A
```

Seed 90210, `bot:pf2`: `3.63917 · 0.98420 + 5.30667 · 0.015389 = 3.6633` against a reported
`mean_sets_A = 3.69667`. **The identity reconciles to 0.0333 sets/game** — and this time the
residual has a name. Mean sets sum to **exactly 9.000** on every cell; declarations sum to
**8.9458/game**. The difference, **0.0542 half-suits per game, is the terminal half-suit that is
awarded without ever being declared**, split 0.0333 to A and 0.0208 to B. The two residuals
reproduce it to four decimals. This matters in §2.2. [measured; pf2, s90210, 200 deals]

**The deficit is 1.573 sets/game** [pf2, 3 seeds, 600 deals], down from the 1.866 the first version
reported on the defective bridge. FishLab's own fitted line — 1 unit of mean half-suit differential
= **14.7** win-rate points (their `SUBOPTIMALITY-LEDGER.md` §0.2) — prices it at **23.12 points**
against an observed gap to even of **22.17**. Over six seeds: 1.605 sets → 23.60 against an
observed 22.92. The agreement tightens from the first version's 1.3 points to **0.95 and 0.68**.

That conversion is used four more times below, and it is worth recording how well it travels:

| mechanism | Δ differential | 14.7 × Δ, predicted | measured | bridge |
|---|---:|---:|---:|---|
| the bridge guard (§2.1) | +0.2267 | +3.33 | **+3.44** | both, 6 seeds |
| the cheating oracle (§3.4) | +0.3978 | +5.85 | **+5.75** | pf2, 3 seeds |
| λ = 0.60 on the shipped config (§6.2) | +0.2382 | +3.50 | **+3.71** | pf2, 6 seeds |
| `defuse: 1` vs `defuse: 0` (§6.3) | +0.3298 | +4.85 | **+3.42** | pf2, 6 seeds |

Three of four land inside 0.25 points; `defuse` overshoots by 1.4. **[inferred]** The conversion is
a cross-check, not an instrument, and no number below is priced by it alone.

### Where the 1.573 sets are

The deficit decomposes exactly into a count term, an accuracy term and the auto-award term:

```
deficit  =  (decl_B − decl_A)·(2·ā − 1)  +  (decl_A + decl_B)·(acc_B − acc_A)  +  (auto_B − auto_A)
```

Seed 90210, both bridges, same games, same opponent:

| term | defective (`bot:fishai`) | share | **corrected (`bot:pf2`)** | **share** |
|---|---:|---:|---:|---:|
| **declarations made** | 1.3404 | 73.1% | **1.6155** | **100.6%** |
| **declaration accuracy** | 0.5046 | 27.5% | **0.0037** | **0.2%** |
| terminal half-suit auto-award | −0.0117 | −0.6% | −0.0125 | −0.8% |
| **deficit** | **1.8333** | | **1.6067** | |

**The accuracy term was the bridge.** It falls by a factor of 137 and its share collapses from
27.5% to 0.2%. On the three-seed pool the term reverses sign: FishAI declares at **98.371%** to
SESTINA's **98.335%**, so the accuracy term is **−0.0033 sets/game, −0.21% of the deficit** —
FishAI is, by a hair, the more accurate declarer of the two.

**The count term is now the whole deficit.** It is not merely dominant; at 100.6% it is slightly
larger than the deficit itself, because the other two terms are negative. FishAI declares
**3.650 sets a game against SESTINA's 5.288** [pf2, 3 seeds] — a gap of **1.638 declarations per
game** between two policies dealt the same cards and declaring at the same accuracy.

Everything after this section is about why.

---

## 2. Instrument artifacts

There is **one**, not the three the first version claimed. Its cost is +3.44 points and it is the
largest single recoverable term measured anywhere in this dossier, so it goes first.

### 2.1 The cardless turn-holder — the adapter's, +3.44 points

FishLab's engine has a dedicated `pass` op for the position *"you hold the turn and you have no
cards"*, and sends it the moment a declare poll is answered "none". The adapter answered the
**declare poll first**. `opPoll` built a view with `phase: 'playing'` and an open `declareWindow` at
the seat whatever the hand size, and FishAI's `mustDeclareNow`
([decide.ts:550](lib/engine/bots/decide.ts#L550)) is

```ts
function mustDeclareNow(view: SeatView): boolean {
  if (windowCannotClose(view)) return true
  return view.turn === view.seat && !viewerCouldAskIfWindowClosed(view)
}
```

`viewerCouldAskIfWindowClosed` ([decide.ts:556](lib/engine/bots/decide.ts#L556)) returns false on an
empty hand, so a cardless turn-holder is compelled to declare and **declining is illegal**. At home
that state is `awaitPass`, not a declare window, and the branch is unreachable; the bridge made it
reachable. RULES_US54 §3.2 `MUST_DECLARE` exists because `us54` has no pass — the alternative is a
table that never progresses. The host does not impose that, and the adapter translated the
compulsion anyway. **Every such declare spent a set to avoid a move that costs nothing.**

The guard is one condition in the `declare_poll` handler and is deliberately narrow: it fires only
when `action.type === 'claim' && view.hand.length === 0 && state.turn === state.seat` and the trace
kind is `must-declare` or `forced-claim` — the compelled variants
([decide.ts:1699](lib/engine/bots/decide.ts#L1699)). Confident `own-book-claim`, `certain-claim` and
`ev-claim` go through untouched.

**What it was worth**, six seeds on identical deals, both arms:

| seed | `bot:fishai` | `bot:pf2` | delta |
|---|---:|---:|---:|
| 90210 | 24.33% | 28.25% | +3.92 |
| 4242 | 25.08% | 28.83% | +3.75 |
| 7011001 | 23.25% | 26.42% | +3.17 |
| 13579 | 22.83% | 26.17% | +3.33 |
| 24680 | 23.42% | 27.25% | +3.83 |
| 31415 | 22.92% | 25.58% | +2.67 |
| **pooled** | **23.64%** | **27.08%** | **+3.44** |

Mean +3.44, SD 0.48, min +2.67, **6/6 positive**, against a ±2.83 floor over 1,200 deals. Declare
accuracy moves 92.83% → 98.42% on seed 90210. [measured; CORRECTED-FACTS §2, reproduced
independently here]

**The repair is present against every opponent in the lineage**, which the first version could not
see because it never played the lower rungs:

| opponent | `bot:fishai` | `bot:pf2` | win-rate delta | declare accuracy, defective → corrected |
|---|---:|---:|---:|---|
| FishBot v0.2 | 61.53% | 67.42% | **+5.89** | 90.30% → **98.90%** |
| FishBot v0.3 | 58.33% | 62.06% | **+3.72** | 94.37% → **98.22%** |
| FishBot v0.4 | 30.17% | 34.25% | +4.08 | 91.54% → 97.69% |
| FishBot v0.5 | 29.17% | 33.31% | +4.14 | 93.10% → 98.24% |
| FishBot v0.6 | 29.56% | 32.86% | +3.31 | 94.06% → 97.53% |
| SESTINA v1.0 | 24.22% | 27.83% | +3.61 | 92.95% → 98.37% |

[pf2 and fishai, 3 seeds, 600 deals, ±4.00 on each delta]. Six deltas spanning **+3.31 to +5.89**,
all positive, on six different opponents. **The one that stands out is v0.2**, where the repair is
+5.89 points and lifts declare accuracy by 8.60 — and it is the only one whose distance from the
others survives a ±4.00 floor. **[speculative]** The mechanism would predict exactly that ordering,
since a weak opponent leaves FishAI cardless-with-the-turn more often and so offers more compulsion
to suppress; but the five non-v0.2 deltas are not separable from one another at this N, and the
declare-accuracy repairs (+3.47 to +8.60) do not order the same way as the win-rate ones. **No
gradient is claimed.**

**What caught it.** `opPass` read **0** across 3,600 games of the shipped adapter — a cardless
turn-holder never once passed. The first version of CROSSPLAY §9.5 recorded that number and filed
it as *"unreached, not verified"*. It was the printed symptom. The instrument, re-run on one cell
pair with the shared log truncated before each arm:

| counter | `bot:fishai` | `bot:pf2` |
|---|---:|---:|
| win rate | 24.3333% | 28.25% |
| `opAsk` | 49,648 | 50,649 |
| `opPoll` | 349,456 | 354,303 |
| **`opPass`** | **0** | **176** |
| `passfixDeclines` | — | 182 |
| `opForced` | 444 (0.370/game) | 445 (0.371/game) |
| `forcedNone`, `traceFallback`, `traceErrorBranch`, `pollNotWindowMove`, `passNotPass`, `planMismatch`, `booksDisagree`, `successHolderClash`, `viewInvariant`, `forcedOwnTeamOut` | 0 | 0 |

[both arms, s90210, 200 deals, 34 and 35 seats reporting].

> **Correction to the assertion CROSSPLAY §9.9 step 4 recommends.** An assertion of the form
> "`opForced` within 0.01–0.05 per game" would **fail on every corrected cell**. `opForced` counts
> forced *polls received* and runs at **0.371/game**; the 0.01–0.05 band belongs to the engine's
> `forced decls` line, which counts declares *emitted*, at 0.02/game. The assertion must name which
> of the two it means. **`opPass > 0` is the sound tripwire** and is the one that fires. The
> 176-vs-182 gap between `opPass` and `passfixDeclines` is a splicing artefact of the shared
> `bot.log` across concurrent seats, not a fault.

**Consequence, already discharged.** The first version predicted that every published cross-play
declare-accuracy figure was depressed by this defect and had to be re-measured. CROSSPLAY §9.8 now
carries 93.25% as withdrawn and superseded by 98.42%. That prediction was correct.

### 2.2 The terminal half-suit — reclassified: mostly the same artifact, not a second one

The first version filed this as a **separate** instrument artifact belonging to the host's rules,
costing **~0 win rate but two thirds of the error rate**: 568 terminal declares of which 196 wrong,
out of 299 wrong declares in the cell. **Both halves of that are withdrawn.**

The rules fact underneath is correct and stands. FishLab resolves **all nine** half-suits; FishAI's
`us54` ends the instant a team reaches five (`winCondition: 'clinch'`, RULES_US54 row 19). The
adapter's `new_game` rules check verifies deck sets, out-of-turn declares and cardless-may-declare —
**not the win condition** — so a mismatched seat is accepted silently. CROSSPLAY §1's
rules-comparison table does not carry that row and should. This is a genuine and unfixed omission
in the rules comparison.

What does not stand is the error attribution built on top of it.

> **Correction.** The guard in §2.1 fires exactly at `view.hand.length === 0`, which is the
> terminal-phase condition. The corrected cell has **at most 69 wrong side-A declarations** in
> total (4,367 declares at 98.42%), against roughly 322 on the defective arm — the guard removed
> about **253**. The first version attributed **77** of them to non-terminal cardless declares. The
> remaining ~176 can only have come from the terminal bucket the first version filed as a
> *separate* artifact. **The two rows double-counted one mechanism, and "costs little win rate"
> cannot survive alongside a guard worth +3.92 points on that seed.** [inferred, from two measured
> endpoints]

The per-declare trace on the corrected arm confirms the size and reverses the shape. `bot:p2trs` is
`bot:pf2` plus the trace and returns 28.25% / ask 52.3193 / declare 98.42 / lock 9.30118 at seed
90210 — identical to `bot:pf2` on every field.

| bank | joined declares | wrong | at `us+them == 8` | largest wrong bucket |
|---|---:|---:|---:|---|
| vs SESTINA v1.0 | 3,858 | **24 (0.62%)** | **0** | `us+them == 7`: 13 of 24 |
| vs FishBot v0.5 | 4,025 | **50 (1.24%)** | **0** | `us+them == 7`: 34 of 50 |

Non-terminal wrong declares fall from the first version's **103** to **24** — a drop of 79, which
matches the 77 the first version attributed to cardless turn-holders. That is a clean independent
confirmation of §2.1's forensics.

> **What the trace cannot see, stated rather than buried.** The trace joins 3,858 of the engine's
> 4,367 side-A declarations (88.3%). The missing 509 is almost exactly one bucket's worth — the
> traced declares are spread evenly across `us+them` 0–7 at ~482 each. The guest seat's history
> carries exactly **8 declare events per game**; the ninth is not delivered to the bot, because the
> game is over. So **`us+them == 8` reading zero is a limit of the instrument, not proof the
> terminal declare does not happen**, and the engine's own arithmetic (§1) says it happens in about
> 94.6% of games. The honest statement is: the cell contains **24 traced wrong declares and at most
> 45 more in the unobservable terminal bucket** — a total of 24–69, not 299, and the terminal share
> is a residual, not a measurement. What is settled is that the population shrank 4.6× when the
> adapter guard was applied, which is what makes it the adapter's.

### 2.3 `pathology`'s counters are pooled over both teams

`fish pathology` aggregates both teams' events; `fish match` reports side A. H1 proved this on the
defective bridge by swapping A/B on identical seeds and reconciling to the unit (240 games:
4 + 14 = 18 forced, 1 + 6 = 7 wrong, against a reported 18 / 7; 480 games: 25 / 8, exact). **Pooling
is a property of the tool, not of the bridge**, so that reconciliation is unaffected by the arm it
ran on — and FishLab's own documentation states it in two places (`docs/FISHBOT_V05.md`, once as a
cross-match caveat and once in the KPI notes).

**Four counters are withdrawn as FishAI-attributed, not three.** The first version listed three and
mentioned the fourth in passing:

| briefed as FishAI's | status |
|---|---|
| **53.85%** of forced declarations wrong — "the single worst number in the run" | **withdrawn.** Pooled. |
| **8.83%** of asks into own locked sets | **withdrawn.** Pooled. |
| **47.68%** repeat (actor, suit, target) | **withdrawn.** Pooled. |
| **4.21%** of declarations wrong | **withdrawn.** Pooled. |

CROSSPLAY §9.8 carries all four. **None of them may be decomposed into a FishAI figure**, and this
document does not do so. Where a per-bot quantity is needed it is measured directly — by an A/B
swap on the corrected bridge (§5.1), or by FishAI's own instrumentation, labelled as such.

### 2.4 Artifacts ruled out, with the measurement that ruled them out

Named so they are not re-litigated. All were measured on the defective bridge; each entry says why
that does or does not matter.

- **The failed-declare information asymmetry costs nothing.** FishAI's reducer publishes true
  holders on every claim (`types.ts:102`); FishLab publishes nothing on a failure, and the adapter
  correctly withholds it. H6 re-ran the referee with true holders injected: **0 of 21,894 decisions
  differed** on chosen p, candidate-set size, best-p or certainty availability. A counterfactual
  over FishAI's own decision function, so the bridge does not enter — and CROSSPLAY §9.6 records
  independently that the asymmetry runs the safe way: strictly weaker inference, never wrong
  inference. It cannot have inflated the corrected result either. [fishai, but bridge-independent
  in kind]
- **The synthesized `declareWindow.declined` tick count is inert.** The load-bearing leg is
  FishAI-internal: `declareEagerness` pinned to 1.0 reproduces base bit-for-bit on every KPI, and
  the PATIENCE refusal is cited **0 times in 88,674 declined polls** [H4]. The H5 leg that pinned
  the adapter field to 0 and to 5 is an adapter-side measurement on the defective adapter and is
  weak evidence about a field the guard now interacts with; the conclusion stands on the internal
  leg alone. [fishai; internal leg bridge-independent]
- **`planClaim`'s transcription into the adapter is exact.** A mechanical diff against
  `decide.ts:391-438` shows two differences, both brace style, and `planMismatch = 0` on both arms
  (§2.1's counter table). The corruption-counter leg of the original argument is dropped: the
  counters were all zero *and the run was defective anyway*. They detect corruption, not
  mistranslation. [bridge-independent]
- **Every instrumented build is decision-neutral, and was proved so rather than assumed.** H1's
  `bot:fishaix` and `bot:fabase` returned identical win rate, mean sets, forced count and accuracy;
  H3's `bot:h3d` and `bot:h3base` returned byte-identical JSON on a 150-game cell; H6's
  `bot:fishaitrace` and `bot:fishai` played identically. These are *equalities between two arms on
  the same bridge*, which a shared defect does not break. The property was re-verified on the
  corrected arm: `bot:p2trs` reproduces `bot:pf2` on every field (§2.2). [both]
- **The reconstruction of FishAI's own view is exact.** H6 replayed `decideExplained` on synthesized
  views and reproduced **10,370/10,370** and **10,390/10,390** played asks, card and target —
  100.000%. This validates the replay instrument §5.4 rests on, and it is a reconstruction over
  *asks*, which the declare-path defect never touched. [fishai; ask channel is bridge-stable]

### 2.5 Things wrong with the environment, not with the result

- **Build sensitivity.** `-march=native`, FishLab's Makefile default, enables FMA and changes
  tie-breaks, and makes their published identity digests irreproducible across machines.
  `-ffp-contract=off` reproduces the generic digest exactly and all three of their identity controls
  **PASS** on it. **Every cell in this document is the portable `-ffp-contract=off` build.** The
  first version carried several figures from a native-FP build whose levels sat ~1.75 points low;
  those are superseded rather than adjusted.
- **The engine does not recognise `v01`.** It answers `fish: unknown policy 'v01'`. The lineage
  panel in §4 is six opponents, not seven. Skipped, not interpolated.
- **The engine lowercases bot ids on install.** Two cells died with *no bot package called 'p2trS'
  is installed*; they were re-run against the lowercased id and those are the cells reported. No
  other failures, no substituted moves, and every fault counter zero across all 139 cells.
- **The host was shared.** Up to twelve sibling containers ran concurrently, and cells died on the
  bot's 20 s handshake timeout while Node type-stripped FishAI's TypeScript. Raising `timeout_ms` to
  90,000 survives it. **Any measurement in this tree must be checked for missing output rather than
  assumed complete.**
- **The shared bot tree is contaminated.** Eleven packages were installed by agents who did not
  remove them. This is the same failure mode as the roster-defuse contamination already on record:
  an arm that inherits a neighbour's parameters measures the neighbour. Every `bot:pf2` variant
  reported here was built from a clean lib root.

### 2.6 There was no control that could have caught this

The first version offered a mirror cell — *"FishAI vs FishAI, same harness: exactly 50.0000%
[47.18, 52.82]"* — as validation of the harness, in §4.1 and by implication everywhere the harness
was used. **That appeal is void, and it is void twice over.**

A mirror cell plays one policy against itself on duplicate deals, so every game's outcome is the
mirror of another's and the aggregate is forced to 50% before a card is dealt. The engine prints
the reason on the mirror cell's own power line: the win-rate effective sample is **zero**, and rate
denominators are halved. The `[47.18, 52.82]` beside it was a Wilson interval on a denominator the
engine had already declared meaningless.

**It is also uninformative about exactly the defect that was present.** A mirror cannot see a bug
that affects both sides equally, and this one did: it cost the defective arm 3.44 points against
SESTINA while leaving the mirror at 50.0000%.

**There is no cell in this setup that can detect a symmetric bridge defect.** What found it was a
per-op counter reading zero where zero was impossible. That is the only detection story this
document is entitled to tell, and mirror cells appear nowhere below as controls. Where the first
version used a mirror cell to establish a *rate* rather than a win rate, the reading is retained
and labelled, because rate denominators are merely halved, not annihilated.

---

## 3. The genuine weakness: FishAI cannot prove what its team owns

This is the spine of the document. On the defective bridge it competed with a five-point declare
accuracy story. **That rival is gone.** Declaration accuracy is at parity, and lock hold barely
moved across the correction — 9.55 → 9.30 against SESTINA's 2.92. **The correction explained away
one story and left this one standing alone.**

Per-decision detail, seed 90210, both bridges against the same SESTINA:

| | defective | **corrected** | SESTINA v1.0 |
|---|---:|---:|---:|
| win rate | 24.33% | **28.25%** | — |
| declare accuracy | 92.83% | **98.42%** | **98.46%** |
| ask accuracy | 51.95% | **52.32%** | **57.38%** |
| **lock hold**, events before cashing | 9.55 | **9.30** | **2.92** |
| declarations / game | 3.74 | 3.64 | 5.31 |
| out-of-turn declares / game | 2.60 | 2.67 | 3.65 |
| events / game | 99.8 | 101.1 | — |

Two gaps survive, both essentially untouched by the correction: **asking, −5.06 points**, and
**cashing, 9.30 against 2.92, a factor of 3.2.** On the three-seed pool the same figures are −5.00
and 9.24 against 2.97, a factor of 3.11. §3.3 argues the first is downstream of the second.

### 3.1 `lockHold` is not a hold

The first version of CROSSPLAY §9.3 read `lockHold 9.69 vs 2.78` — now **9.30 vs 2.92** — as a
policy leak, FishAI sitting on resolved sets. **It is not a policy leak. FishAI's policy delay is
essentially zero.** H4 reconstructed the ground-truth moment each half-suit became locked on
FishAI's team (three seats joined per deal by a hash of the shared history prefix; 600/600 deals
grouped into exactly three streams, zero ambiguity) and decomposed the hold over 1,970 declared
locks:

| | mean | median | p90 |
|---|---:|---:|---:|
| **HOLD** (declare − true lock) | 8.97 | 0 | 34 |
| **LAG** (first proof − true lock) | **8.27** | 0 | 30 |
| **POLICY** (declare − first proof) | **0.01** | 0 | 0 |

[H4, fishai, 600 deals — **not re-run on the corrected bridge**]. HOLD = LAG + POLICY by
construction and 8.27 + 0.01 ≠ 8.97; §3.2's census reports 1,937 episodes against this table's
1,970 locks, so the means are over different subsets — 33 locks that never proved. The table as
printed looks like an arithmetic error and is not one, but it should not be quoted without that
note.

The load-bearing evidence for POLICY ≈ 0 is bridge-independent and does not depend on the
decomposition. Across **265,884 declined declare polls** in two independent probes, **not one was
declined while a provable set sat in hand**, and `certainClaim` is gated only by
`withinHoardLimits`, which returns true before touching the hand at Punter's `hoardBooks = 0,
minHandSize = 0` ([decide.ts:512](lib/engine/bots/decide.ts#L512) and
[decide.ts:696](lib/engine/bots/decide.ts#L696), both verified). The bridge
defect produced *extra* declares, never extra declines, so it cannot have hidden a withheld provable
set. [measured; internal counter over declines, bridge-independent in kind]

**The causal arrow runs backwards from the first reading.** The metric measures how long FishAI is
blind, not how long it waits.

> **The confound this document does not separate, stated once and referred to from §0.** Lock hold
> is not a pure capability. A team that is winning acquires its proofs from the same events that win
> it cards — §3.2's census records **72.5% of locks proved at the instant of lock** — so a short
> hold is partly a *consequence* of doing well, and a long one partly a consequence of doing badly.
> §4.1's lineage table is the direct evidence: one byte-identical FishAI arm moves **6.67 → 9.24**
> across six opponents with no code change, ordered by its own win rate in the cell. **Nothing here
> separates "FishAI proves slowly, therefore it loses" from "FishAI loses, therefore it proves
> slowly."** §3.4's oracle is the only intervention in this dossier that bears on the direction, and
> it prices the whole channel at +5.75 of 22.17. Everything below is written as a description of the
> channel, not as a demonstration that the channel causes the loss. **[inferred]**

**Control 1 — sitting longer costs, and the cost is roughly linear** [pf2, 3 seeds, 600 deals,
±4.00]:

| arm | lock hold | declare acc | ask acc | declares/game | win rate | vs base | resolved? |
|---|---:|---:|---:|---:|---:|---:|---|
| base | 9.24 | 98.37% | 52.35% | 3.65 | 27.83% | — | — |
| hold 3 further polls | 11.10 | 97.06% | 51.43% | 3.38 | 26.03% | **−1.81** | no |
| hold 20 further polls | 20.15 | 95.73% | 49.71% | 2.82 | 23.64% | **−4.19** | **yes** |

Every KPI degrades monotonically and the large perturbation clears the floor. **What does not
survive is the first version's shape claim.** It reported −2.00 for three polls and −2.25 for
twenty and called the flatness *"the signature of a policy already at the corner of its knob"*. The
corrected figures are −1.81 and −4.19: the response keeps growing, and **the corner-of-the-knob
reading is withdrawn.**

**Control 2 — cashing sooner does not help** [H4, fishai, 3 banks, 600 deals — **not re-run**].
`declareThreshold` 0.775 → 0.65 → 0.50 → 0.34 moved `lockHold` monotonically 9.33 / 9.13 / 8.75 /
8.56 and bought the speed **entirely by guessing** (declare accuracy 0.9324 → 0.9187, allocation
error 0.0158 → 0.0276), for a net **−0.97 points**, which at a ±4.00 paired floor is a null rather
than a measured loss. **The asymmetry argument now rests on one re-measured arm and one that was
not re-run**, and the accuracy-degradation channel it relies on was measured against a defective
baseline. The *direction* is a mechanical consequence of lowering a threshold and does not depend on
where the baseline sits.

FishLab's own adversary tables agree from the other direction, on their bots and their engine with
no FishAI adapter present: their `v06:force=1` arm forces early declarations, drops target
`lockHold` 4.66 → 2.59, and **loses 15.31 points** with declaration accuracy collapsing to 0.8115.
[bridge-independent; their measurement, cited as theirs]

### 3.2 What the lag is made of

The event immediately before FishAI first *proves* a lagging lock [H4, fishai, 1,937 episodes —
**not re-run**]:

| certificate | share |
|---|---:|
| proved at the instant of lock | 72.5% |
| **an ask by a teammate that MISSED** | **21.6%** (79% of all *lagging* locks) |
| opponent hit 2.2%; teammate hit 1.4%; another set's declare 1.3%; opponent miss 0.9% | 5.8% |

**79% of the *lagging* locks — 21.6% of all locks — are unblocked by a teammate's ask that missed**,
and only 0.9% by an opponent's miss. This is a census over FishAI's own event stream, not a match
outcome; the bridge changed which declares were emitted, not which asks produced which certificates,
and events/game moved only 99.8 → 101.1.

**What it is not is a lever, yet.** This is a **last-event attribution over a sequential process**:
whatever event completes a chain is credited by construction, so the share is a lever only if it
exceeds the base rate of teammate misses among all events in the lagging window. **That base rate
was not measured, and until it is, this is [inferred], not the mechanistic statement it was read
as.** The `r12` control that would price the channel does not clear its floor (+2.58 against ±4.00,
below).

That is also the channel SESTINA's `r12` coordinate attacks. Turning it off, re-measured:

| arm | FishAI win rate | FishAI lock hold | FishAI ask acc | SESTINA lock hold | SESTINA declare acc |
|---|---:|---:|---:|---:|---:|
| SESTINA v1.0 | 27.83% | 9.24 | 52.35% | 2.97 | 98.33% |
| SESTINA, `r12` off | **30.42%** | **8.16** | **54.04%** | 4.24 | 99.60% |

[pf2, 3 seeds, 600 deals, ±4.00]. **The win-rate delta of +2.58 does not clear the floor and is not
resolvable** — the first version reported +1.91 against a floor it had quoted 2.449× too tight. The
behavioural movements are larger relative to their own scatter and all run the predicted way:
denying FishAI the coordinate moves its lock hold down 1.08 events and its ask accuracy up 1.69
points, while SESTINA's own cashing slows by 1.27 events. **[inferred]** The information-denial
component is real and its win-rate size is unmeasured at this N.

### 3.3 The same fact, seen from the ask side

FishAI's team wholly owns **0.3669** undeclared half-suits per decision against SESTINA's
**0.1681**, and **0.00%** of them are allocatable by the acting seat [H6, fishai, 240g — **not
re-run**]. Guaranteed misses follow: FishAI's asks land in half-suits its own team already owns at a
rate roughly 1.8× SESTINA's, and **0 of 1,960 such asks were provable by the asker**. The rate is
present from the first phase of the deal (ev 0–30), so it is not a consequence of losing.

> These per-bot own-locked rates come from H6's own instrumentation of FishAI's asks. **They are
> not, and must not be read as, a decomposition of the withdrawn pooled 8.83% counter** (§2.3).
> They were measured on the defective bridge and have not been re-run. The ask channel is the
> bridge-stable half of the bot — ask accuracy moved only 51.95% → 52.32% across the correction, and
> H6's own 52.334% baseline matches the *corrected* 52.32% more closely than the defective 51.95% —
> so they are likely to transfer, but that is inference.

The corrected bridge supplies a cleaner substitute for the same conclusion. §3.4's cheating oracle
gives FishAI perfect lock detection and nothing else, and its effect on the ask channel is direct:
FishAI's ask accuracy rises **52.35% → 56.10%**. SESTINA's rises too (57.35% → 60.20%), so the
*gap* closes only from 5.00 to 4.10 — **18.0% of the ask gap is bought by lock detection alone**
[pf2, 3 seeds, 600 deals]. That is smaller than H6's defective-bridge counterfactual implied, and it
is measured on the corrected arm against a moving opponent, which is the harder and more honest
test.

The second ask-side channel is downstream of the same thing. SESTINA can certainly locate **2.218**
opponent cards per decision against FishAI's **1.594**. The *inferred* component is equal (0.448 vs
0.413); the entire 0.62 gap is **publicly-transferred cards still sitting where a hit put them**
(1.770 vs 1.181). By phase, FishAI's opponent-certainty is flat (1.34 / 1.82 / 1.64 / 1.62) while
SESTINA's climbs (1.47 / 2.40 / 2.60 / 2.79) [H6, fishai — **not re-run**]. **The gap is not in what
FishAI can infer; it is in what it has cashed.**

FishLab ranks this same channel as **L3** in its own suboptimality ledger, records it at 9.75–16.46%
across its own versions, and attributes it to the gap between a team *owning* a half-suit and any
seat being able to *prove* it. **It is not a FishAI-specific bug.** FishAI is simply worse at it.
[bridge-independent; their measurement, cited as theirs]

### 3.4 How big it is, measured rather than argued

A cheating oracle — the three FishAI seats share their true hands and cash every lock instantly —
re-measured on the corrected bridge:

| | base (`bot:pf2`) | oracle | delta |
|---|---:|---:|---:|
| win rate | 27.83% | **33.58%** | **+5.75** |
| lock hold | 9.24 | **0.41** | −8.83 |
| declare accuracy | 98.37% | 99.64% | +1.27 |
| ask accuracy | 52.35% | 56.10% | +3.75 |
| declarations / game | 3.650 | 3.810 | +0.160 |
| set differential | −1.573 | −1.175 | +0.398 |

[pf2, 3 seeds, 600 deals, ±4.00; per seed +4.17 / +4.58 / +8.50, **3/3 positive**].

**+5.75 points is the ceiling of the whole detection channel, and it is a cheat.** The first version
measured the same delta on the defective bridge — 30.17% against 24.42% — and **the delta survived
the correction to two decimals** while both of its levels moved ~3.4 points. That is the strongest
single result in this document: both arms carried the same defect, so it cancelled.

Three things follow, and all three matter:

1. **Perfect lock detection closes 25.9% of the gap to even** (5.75 of 22.17). The first version
   said 22%; the corrected share is larger.
2. **The internal accounting agrees.** The oracle closes 0.398 of the 1.573-set differential —
   25.3% — and 0.398 × 14.7 = 5.85 predicted points against +5.75 measured. Two routes, agreeing
   inside 0.10 points.
3. **The count gap is not closable by proving faster.** The oracle buys only 0.160 declarations per
   game, closing **19.5%** of the 1.638-declaration gap. The structural decomposition that says
   *"equalise declaration counts at 4.5 and the differential moves −1.86 → −0.50, worth +20
   points"* is an accounting identity, not a reachable target: declaring more sets requires
   **winning more cards**, not only proving faster. The oracle is the binding evidence and it says
   the reachable part is 5.75 points, not 20.

**Something else owns the other 16.4 points, and nothing in this dossier measured what** (§6.1).

### 3.5 The representation, not the maximiser

Two rival explanations for a 3.2× lock-hold gap are miscalibration and a bad maximiser. Both are
closed, and the correction closed them a third way by putting declare accuracy at parity.

**The maximiser is not the problem** [H5, fishai — in-play arms defective, replay
bridge-independent]:

- In play, an exact capacity-feasible joint maximiser over the same marginals (≤3⁶ enumeration)
  disagreed with the shipped greedy rule on **4 emitted declarations in 600 games**. The win-rate
  arms are defective-bridge levels, but arms that differ in four decisions cannot differ in outcome;
  the null is structural.
- In a zero-games replay over 5,453 recorded team-ownership positions: greedy **46.52%**, exact
  joint **47.97%**, a 128-world Monte-Carlo joint posterior **50.76%**, most-frequent whole sampled
  allocation 42.62%. **Every rule lands in a 43–51% band.**

**The inference layer is calibrated, and this is now measured on the corrected arm.** The
per-declare trace, seed 90210 [pf2 + trace, 200 deals]:

| tier | n | believed | realised | believed − realised |
|---|---:|---:|---:|---:|
| certain-claim | 3,110 | 1.000000 | 1.000000 | **0.000000** |
| own-book-claim | 685 | 1.000000 | 1.000000 | **0.000000** |
| ev-claim | 30 | 0.745540 | 0.666667 | +0.078873 |
| must-declare | 24 | 0.484425 | 0.583333 | −0.098909 |
| forced-claim | 8 | 0.233917 | 0.625000 | −0.391083 |
| adapter-plan | 1 | 0.142857 | 0.000000 | +0.142857 |
| **all tiers** | **3,858** | 0.993003 | 0.993779 | **−0.000776** |

**The certainty tier — every declare emitted with believed p = 1 — is 3,795 / 3,795 exact.** On a
second bank (vs FishBot v0.5) it is 3,924 / 3,924 exact and the all-tier residual is −0.000092 over
4,025 declares. **FishAI never claims certainty it does not have.**

> **Correction to the first version's §8 finding on `ev-claim`.** It called `ev-claim` *"the only
> tier where FishAI's declare belief is measurably optimistic, +0.0486 in cross-play"*. On the
> corrected bridge the sign **flips between banks**: +0.0789 against SESTINA (n = 30) and −0.1291
> against v0.5 (n = 34). `must-declare` flips too (−0.0989 and +0.0331). **No tier below the two
> p = 1 tiers has the population to be called calibrated or miscalibrated at one cell**, and the
> optimism finding is withdrawn as unresolved rather than reversed.

H1 closes the same door from the model side, on recorded positions: `planClaim`'s reported p
**equals the exact urn probability of its own allocation to four decimals** (0.4190 vs 0.4190,
n = 1,253); the shipped allocation **is** the model argmax; a joint MLE is no better (44.45% vs
46.85%); and the true allocation is feasible under FishAI's knowledge in **241 of 241** endgame
positions — the inference layer never excludes the truth. [H1, fishai; analysis over recorded
positions, bridge-independent in kind]

**The information is not in the representation.** Candidate sets plus capacity counts cannot express
"which of my two teammates holds each card", and no maximiser over them recovers it. With
miscalibration and the maximiser both closed *empirically*, and with declare accuracy at parity,
**representational capacity is the strongest surviving account of the 3.2× lock-hold gap — not the
only one.** Two rivals are not closed here: lock hold is partly endogenous to who is winning cards
(§4.1's table moves it 6.67 → 9.24 for a fixed policy), and a team that wins fewer cards generates
fewer certifying events regardless of how it represents them. Separating those from a representation
deficit needs a cell that holds position quality fixed, and no such cell has been run. **[inferred]**
The representation account points at the v0.4-era mechanism — an exact deal posterior plus the
locked-half-suit theorem — and FishAI does not have it.

One measured consequence shuts a tempting shortcut: the MC posterior's own confidence is **not
usable as a declaration threshold**. At confidence ≥0.95 it is 74.95% accurate (n = 515); 0.85–0.95
→ 93.33% (n = 15); 0.70–0.85 → 82.52% (n = 143); 0.50–0.70 → 54.58% (n = 1,475) [H5, replay over
recorded positions]. The bar it fails to reach is **98.42%**, which the shipped policy actually
achieves — a wider gap than the first version's target implied.

---

## 4. Why FishAI also loses to v0.5 and v0.6

This is the half of the question that rules the search explanation out, and the re-measurement
sharpens it considerably by playing the whole lineage rather than a fragment of it.

### 4.1 The lineage, measured in this harness

Six opponents × three matched seeds, corrected arm [pf2, 600 deals, ±4.00]:

| FishAI vs | win rate | under / over even | FishAI lock hold | opponent lock hold | FishAI declare acc | opponent declare acc |
|---|---:|---:|---:|---:|---:|---:|
| FishBot v0.2 | **67.42%** | +17.42 | 6.67 | 19.84 | 98.90% | 87.29% |
| FishBot v0.3 | **62.06%** | +12.06 | 7.94 | 12.05 | 98.22% | 85.62% |
| FishBot v0.4 | **34.25%** | −15.75 | 8.02 | 4.87 | 97.69% | 98.30% |
| FishBot v0.5 | **33.31%** | −16.69 | 8.34 | 4.00 | 98.24% | 97.55% |
| FishBot v0.6 | **32.86%** | −17.14 | 8.34 | 3.71 | 97.53% | 97.86% |
| SESTINA v1.0 | **27.83%** | −22.17 | 9.24 | 2.97 | 98.37% | 98.33% |

> **The lock-hold column is not a policy constant, and this table is the proof.** The FishAI arm is
> byte-identical in all six rows, and its lock hold still moves **6.67 → 9.24** — ordered by its own
> win rate in the cell. Both columns co-vary with who is winning cards, which is what a team that
> acquires locks *at the moment of proof* 72.5% of the time (§3.2) should do. **Lock hold is
> therefore a joint measure of capability and of position, and no cross-cell comparison of it is
> admissible here.** Only the within-cell contrast (FishAI against the bot it actually played) is
> quoted below, and even that ordering is consistent with the confound. [inferred]

Their own bots against each other, through the same harness [pf2 harness, 3 seeds, 600 deals]:

| anchor | win rate | resolved against even at ±4.00? |
|---|---:|---|
| v0.3 vs v0.2 | 51.17% | **no** |
| **v0.4 vs v0.3** | **74.72%** | **yes — +24.72** |
| v0.5 vs v0.4 | 50.86% | **no** |

**Their lineage is not a ladder of even rungs.** Two of its three measured steps are inside the
floor. Essentially all of its strength arrives in one step, **v0.3 → v0.4**, and FishAI sits on the
near side of exactly that step: it beats v0.2 and v0.3 comfortably and loses to v0.4 by 15.75
points.

> **Correction.** The first version said FishAI *"clears one rung of their ladder and no other"* on
> 600-game cells whose true paired floor is ±9.80, and validated the harness with a mirror cell.
> It clears **two** rungs, v0.2 and v0.3, and one of those rungs is not a rung. The mirror-cell
> validation is void (§2.6). The placement conclusion — **between v0.3 and v0.4** — survives, on
> better evidence than it had.

**The behavioural profile no longer matches the placement, and that is the finding.** The first
version's profile table put FishAI's declare accuracy at 92.7–93.6%, between v0.3 (87.5%) and v0.4
(98.0%), and read it as confirming a v0.3-era bot. **That row reverses.** At 97.5–98.9% FishAI
declares at or above every post-v0.3 bot in the lineage, including SESTINA. What places it below
v0.4 is the lock-hold column alone: **inside the same cell, FishAI cashes faster than v0.2 and v0.3
and slower than v0.4, v0.5, v0.6 and SESTINA, without exception.**

### 4.2 What v0.4 added is exactly what §3 says is missing

v0.4 added the exact deal posterior and the locked-half-suit theorem — **four releases before search
existed in that lineage**. FishAI beats the version before it and loses to the version after it, and
the step it fails to clear is the belief representation. That is the same step §3 identifies from
six independent directions (H4's lag decomposition, the corrected oracle, H5's replay, H5's
allocation band, H6's board census, and the ask-side ownership census), and §4.1's corrected profile
sharpens the statement: **FishAI matches the post-v0.4 lineage on declaration judgement, and in
every cell it cashes slower than the bot it is losing to.** Whether that is a missing detection
capability or a consequence of arriving at worse positions is **not separated by these cells**;
§3.4's oracle is the only intervention that bears on it, and it prices the whole channel at +5.75.
[inferred]

[bridge-independent — this is a claim about what v0.4 added, from FishLab's published release
history, cited as theirs]

### 4.3 The rest of the v0.5 / v0.6 loss, priced

| term | vs v0.5 | vs v0.6 |
|---|---:|---:|
| corrected win rate | **33.31%** | **32.86%** |
| of which the bridge guard is worth | +4.14 | +3.31 |
| `defuse: 1`, already carried and already paying | +10.28 | +10.39 |
| **residual to even** | **16.69** | **17.14** |

[pf2 and fishai, 3 seeds, 600 deals, ±4.00]. **`defuse` pays FishAI three times as much against the
weak bots as against the frontier** (+10.28 and +10.39 against +3.42 vs SESTINA), and FishAI is
*still* 16.7 and 17.1 points under even. The mechanism that transfers best to the weak opponents is
nowhere near enough, and what is left over is the capability v0.4 has and FishAI does not.

**The search explanation is refuted on its own terms, and only on those terms.** v0.5 and v0.6 do
not search, and FishAI loses to both by more than sixteen points. FishLab's own price for the
correct search is **+2.08 points over v0.6 at 300–420× cost** — **less than the bridge fix delivered
for nothing**, at +3.44. That comparison got *cheaper* to defend under the correction, not dearer.

What is **not** established is the converse: that adding search to FishAI would hurt. §5.5's
refutation of that does not reproduce.

---

## 5. What is not the cause

Six refutations. **Each states the bridge it was measured on**, and where it rests on the defective
bridge and was not re-run, it says so rather than presenting itself as settled.

### 5.1 The forced endgame — refuted on materiality; the sign is unresolved

**Bridge:** `bot:pf2`, **re-run** by A/B swap. The home-engine leg has no bridge in the loop.

The pooled 53.85% is withdrawn (§2.3). The first version replaced it with a positive counter-claim —
*"FishAI is the better of the two teams in the forced endgame, 64.08% against 52.50%"* — derived
from H1's A/B swap on the defective bridge. Re-measured by an A/B swap on the corrected bridge, same
games, sides relabelled (the swap cell returns 72.1667% against the base cell's 27.8333%, exactly
complementary, which is what makes the two forced counts comparable):

| | forced declarations | right | rate | Wilson 95% |
|---|---:|---:|---:|---|
| FishAI | 79 | 48 | **60.76%** | [49.7, 70.8] |
| SESTINA v1.0 | 145 | 67 | **46.21%** | [38.3, 54.3] |

[pf2, 3 seeds, 3,600 games each side]. **The intervals overlap by five points and the sign is not
resolved** — and even these overstate the precision, because forced declarations within a deal are
not independent draws. The claim's own note says ~40,000 games would be needed. **The ranking is
withdrawn; only the withdrawal of the pooled figure stands.**

**Materiality settles it regardless of sign.** Forced declarations run at **0.02/game at 62.5% on
both bridges, identical to four significant figures** — about 24 per 1,200-game cell. They supply
0.43% of FishAI's sets; the wrong ones gift on the order of 0.01 sets/game, under 1% of a
1.573-set deficit. **A perfect forced-endgame oracle is worth well under half a point** against a
22.17-point gap. A channel this small cannot move the result in either direction.

**A separate real finding, at home, which cuts against the intuition that the bridge degrades
FishAI: the foreign protocol makes FishAI's endgame better by about 32 points.** In FishAI's own
engine with no adapter present, endgame declaration accuracy over 4,143 declarations and ~38,000
games is **43.74% [42.2, 45.3]**. FishLab's confidence ladder polls all three teammates about the
same half-suit and takes the most confident answer; `us54` §3.2 hands the declaration to whichever
seat the window reaches and forbids it to decline. Emulating the ladder inside FishAI's own engine
lifts accuracy **39.86% [36.9, 42.9] → 72.10% [69.3, 74.7]** on the same 1,036 positions, against a
best-of-three oracle ceiling of 86.58%. [H1, **home engine, no bridge in the loop** — the largest
sample in the dossier and untouched by anything in the correction. This is the most actionable
home-engine finding here.]

### 5.2 `containedPass` — refuted at every appetite

**Bridge:** `bot:fishai`, **not re-run.** Why it transfers is argued below rather than assumed.

+0.100 points [−0.053, +0.253] and +0.003 net sets [−0.004, +0.009], paired by seed over five seeds
× 1,200 duplicate-deal games per arm. Across all 6,000 games the win column moved by **six games**
(1,432 → 1,438); `containedPass: 2` moved four. Secondary KPIs are unchanged to four decimals [H2].

The narrow interval is legitimate here and is not a misapplication of the per-deal floor: 5,994 of
6,000 games are **identical between the two arms**, so the arms are not independent policies and the
generic floor does not govern. The mechanism does not route through the cardless-turn-holder declare
poll, so the bridge defect could not have suppressed it.

The mechanism fires exactly as derived: 50 fires in 129,303 ask decisions (0.039%), **4.0% of the
1,259 decisions where a contained book existed, against 3.8% of opportunities at home**
(STYLES.md §6.3.4). All 50 reused an already-named card at `infoCost` exactly 0. The conditional
trigger rate transfers unchanged and only the opportunity is rarer (0.97% here against 3.65% at
home). The move is simply too small: 0.014 conceded turns per game × ~0.14 cards ≈ **0.002
cards/game**.

The premise that tied it to the 8.83% own-locked figure is refuted three ways: **the counter is
pooled** (§2.3); turning the mechanism off moves own-locked asks by **7 of 3,742**; and SESTINA,
which bans provably dead asks outright at 0.032% DEAD, still shows a comparable own-locked rate — so
the move class is not deliberate for anyone.

> **One open item the first version could not have known.** The corrected bridge now exercises
> `opPass` (176 times per cell). The **opportunity rate for turn-conceding moves should be
> re-counted** on the corrected arm even though the trigger logic is unaffected. The refutation is
> not in doubt at this size; the opportunity denominator is stale.

### 5.3 Declare thresholds and eagerness — refuted structurally

**Bridge:** `bot:fishai` for the path counters, **not re-run**; the gate itself is a code fact,
verified against the shipped tree.

`declareEagerness` 1.0, `declareThresholdStalled` 0.34, `declareMaxUncertain` 3 and
`foreignDeclareThreshold` 0.50 each reproduce base to four decimals on every KPI; `declareThreshold`
buys speed by guessing at a net loss (§3.1). **The reason is structural, not tuned.** `evClaim`'s
gate at [decide.ts:767-775](lib/engine/bots/decide.ts#L767) requires **every** uncertain card's
candidate list to be entirely teammates —

```ts
if (cand.length === 0 || !cand.every((s) => seatTeam(s) === myTeam)) { allOnTeam = false; break }
```

— and **415,822 of 417,010 speculative plans (99.72%) fail it before any threshold is consulted**.
Over 88,674 declined polls the threshold is cited 1.32% of the time and the structural gate 98.14%
[H4, fishai; internal path counters]. A gate that rejects 99.72% of plans is not a quantity a
3.44-point baseline shift can move, and it correctly explains why four separate knobs reproduce base
to four decimals.

> **Withdrawn.** The first version's `declareOnlyWhenCertain` result — *"removes all 33 speculative
> declares and their 10 errors and moves declare accuracy 93.25% → at most 93.43%, 3.4% of the gap
> to SESTINA"* — is void in both baseline and denominator. 93.25% is withdrawn (CROSSPLAY §9.8) and
> superseded by 98.42%; the gap to SESTINA that 93.43% was a percentage *of* is **0.04 points**, so
> "3.4% of the gap" has no referent. The ablation's absolute counts may still hold on the defective
> arm; nothing derived from the share survives, and the ablation was **not re-run**.

**93.25% is not a calibration target** — and for a better reason than the first version gave. It
argued the figure was unreachable by tuning because the structural gate blocks it. The correction
shows something stronger: **93.25% was never FishAI's declare accuracy at all.** It was an
instrument reading.

### 5.4 Ask **selection** — refuted; FishAI selects better

**Bridge:** `bot:fishai`, **not re-run.** The ask channel is the bridge-stable half of the bot.

The ask-accuracy gap decomposes exactly, replayed through FishAI's own `decideExplained` at
100.000% fidelity [H6, fishai, 240g]:

```
52.334  FishAI at its own positions
62.713  FishAI's decide() at SESTINA's positions      →  POSITION  −10.379
57.220  SESTINA at its own positions                  →  SELECTION  +5.493  (FishAI's favour)
                                                          net       −4.886
```

Seed 4242 replicates at −9.560 / +5.881. On the 6,866 SESTINA decisions where the two policies
disagree, FishAI would hit **50.99% [49.42, 52.55]** against SESTINA's **41.77% [40.63, 42.91]**.
Neither targets nor cards are the problem: when FishAI misses with a hit available, the chosen
target held some other askable card 93.127% of the time against SESTINA's 93.140%, and position
richness is equal (a true hit was available 98.50% against 98.84%).

**This runs FishAI's decision function over recorded positions, so the adapter's declare path never
enters**, and ask accuracy is the bridge-stable KPI (51.95% → 52.32%). H6's 52.334% baseline is
closer to the *corrected* 52.32% than to the defective 51.95%, and the corrected three-seed gap
(−5.00) brackets the measured net (−4.886). It is the cleanest surviving refutation in §5, though it
has not been re-run.

FishAI is also *greedier* and never wrong about certainty: it plays 0.0243 below the referee argmax
against SESTINA's 0.0791, takes a certain ask in **2,957 of 2,957** opportunities against SESTINA's
89.02%, and **all 2,957 hit**. **SESTINA deliberately declines value and wins anyway.** The one-step
metric cannot credit whatever it is buying, and this document does not claim to know what that is
(§6.4).

**The ask-accuracy gap is a symptom of §3, not a cause** — but the share attributable to lock
detection is smaller than the first version claimed. The corrected oracle buys 18.0% of it (§3.3),
against the 61% H6's defective-bridge counterfactual implied. **[measured for 18.0%; the 61% is
withdrawn as a defective-bridge counterfactual against a different denominator.]**

### 5.5 Search — **re-opened.** The refutation does not reproduce

**Bridge:** `bot:pf2`, **re-run** on three arms. The all-candidates arm and the tie-group census
were not re-run and are labelled where they appear.

The first version reported cheap determinization search on FishAI's own `trace.ranked` tie group at
26.33% / 25.83% / 25.83% against a base of 30.00% — **−3.7 to −4.2 points** — on 600-game cells
whose true paired floor is ±9.80. Re-measured:

| arm | win rate | vs base | ask acc | lock hold | declare acc | resolved at ±4.00? |
|---|---:|---:|---:|---:|---:|---|
| base (`bot:pf2`) | 27.83% | — | 52.35% | 9.24 | 98.37% | — |
| det = 12, κ = 2.5 | 26.75% | −1.08 | 51.85% | 9.42 | 98.57% | **no** |
| det = 12, κ = 0 | 28.00% | **+0.17** | 51.70% | 9.76 | 98.72% | **no** |
| det = 24, κ = 2.5 | 27.19% | −0.64 | 51.92% | 9.35 | 98.62% | **no** |

[pf2, 3 seeds, 600 deals, ±4.00]. **All three arms are inside the floor and one is positive.** The
secondary movements reproduce in sign — ask accuracy falls, lock hold rises — but at a fraction of
the reported size. **The claim that cheap search costs FishAI 3.7 to 4.2 points is withdrawn.** What
replaces it is a null: at this N, cheap determinization search neither helps nor hurts measurably.

Two legs of the original argument survive and both are worth keeping:

- **The tie group is the right target and it is large**: 57.9% of 2,209 ask decisions end in an
  exact tie at the top of the linear score, mean 3.21 tied candidates, and FishAI's tie-break is
  fully deterministic — eight rng seeds produced identical actions in 100% of cases, so there is no
  random tie-break defect to fix [H5, fishai; a structural census]. FishLab's own measurement of the
  same object records 54.74% ties with every tie-break rule realising the same hit rate, and calls
  them exchangeable [their measurement, cited as theirs].
- **Searching all ranked candidates rather than the tie group scored 11.00%** [H5, fishai, **not
  re-run**] — a delta far outside any plausible floor, and consistent with FishLab's own record that
  the unguarded determinized argmax is 35.69 points worse than their blueprint. **[inferred]** The
  unguarded form is still refuted; the guarded cheap form is not.

**The honest limit is unchanged and now larger.** H5's rollout is perfect-information PIMC;
FishLab's explicitly is not — their continuation players are reconstructed at their own information
sets. **The correct information-set search was never tested and is not ruled out — only priced**, at
roughly 500× FishAI's per-decision cost.

### 5.6 Dead asks — real, small, and a scoring bug rather than an inference gap

**Bridge:** `bot:fishai` for the counts, **not re-run**; both code defects verified against the
shipped tree today.

FishAI made 71 asks (0.685%) at which its own `pHit` was exactly 0, against SESTINA's 10 (0.087%)
[H6, fishai, 240g — **not re-run**]. `dead` and `chosen p == 0` are the **identical set of rows** —
FishAI knew and asked anyway. 56 of 71 were avoidable (mean forgone best-p 0.2719); 61 of 71 were
repeats of an identical earlier guaranteed miss.

Every one scored exactly **52.00 = wProgress·(5/6) + wNarrow·1 + gambleBonus = 18·(5/6) + 12 + 25**,
verified here against the shipped weights (`roster.ts:212` Punter `gambleBonus: 25`;
`style.ts:354-355` `wProgress: 18, wNarrow: 12`). Two defects in `rankAsksWith`, both confirmed in
the current tree:

- **knowledge.ts:809** — `const narrowing = cand.length > 1 ? 1 / (cand.length - 1) : 1`. A card
  whose holder is already **certain** gets the maximum narrowing credit of 12 points. When that
  certain holder is a teammate, the ask is a guaranteed miss that narrows nothing.
- **knowledge.ts:807, 810-816** — the gamble fires whenever `known === bookMembers.length - 1`,
  without checking that the asked card is the missing one. The comment above it asserts that the
  asked card is by construction not one of the known cards; that is wrong, because
  `teamKnownOfBook` (knowledge.ts:741) counts every card whose certain holder is on the asker's
  **team**, teammates included, while RULES_US54 row 7 only forbids asking for a card **you** hold.

Size: 0.23 asks/game, ~0.1 cards/game. `minHitP: 1e-9` moves FishLab's DEAD counter 76 → 39 and the
pooled hit rate 54.906% → 54.928%; `gambleBonus: 0` gives 76 → 60 and 55.189%. **Ship it as a
correctness fix; it is not a win-rate lever.** The residual 39 are asks FishAI's prover cannot
refute at all (~0.18% of asks), and nobody characterised them.

**Starved turns are handled correctly and need no work**: 15 decisions in 240 games have every legal
ask at estimated p = 0, and in every one FishAI played a legal ask from the ordinary ranking with
`traceFallback = 0`, `traceErrorBranch = 0`, `askNotAsk = 0` — all three of which remain 0 on the
corrected arm (§2.1).

---

## 6. What is not quantified

Stated as gaps rather than guessed at.

### 6.1 The residual, which is the largest single unknown

FishAI is **22.17 points under even** against SESTINA on three matched seeds (22.92 over six). The
cheating oracle claims **5.75** of that as the ceiling of the entire detection channel. **The
remaining ~16.4 points are unattributed.** Nothing in this dossier measured what owns them.

> **Correction.** The first version wrote *"a cheating oracle reaches 30.17% against SESTINA's
> 69.83%; the last ~40 points are unattributed"*, and separately estimated the residual at 10–20
> points in its own headline table. **The ~40 figure double-counts.** It measures the A-minus-B
> spread rather than the gap to even, so every point of deficit is charged twice. The two numbers
> were never reconciled in that document. The correct figure against the gap to even is **16.42**,
> which sits at the top of the first version's own 10–20 range.

**Any claim that closing §3 closes the gap is unsupported by anything here.**

### 6.2 λ = 0.60 — resolved, and much larger than the first version could show

This was the first version's least-supported large number: *"+7.0 points on 600 games and
contested"*, from two banks of 300-game cells on a native-FP build, with an explicit instruction
that it *must not be quoted as a result*. **That caution was correct at the time and the figure has
now been measured properly.** A full four-arm factorial, six seeds, on one patched lib root
[pf2, 1,200 deals, ±2.83]:

| arm | win rate |
|---|---:|
| `defuse: 0`, λ = 0 | 23.67% |
| `defuse: 1`, λ = 0 (**shipped**) | 27.08% |
| `defuse: 0`, λ = 0.6 | **31.50%** |
| `defuse: 1`, λ = 0.6 | 30.79% |

| contrast | delta | seeds positive | resolved at ±2.83? |
|---|---:|---:|---|
| `defuse` at λ = 0 | **+3.42** | 6/6 | **yes** |
| `defuse` at λ = 0.6 | −0.71 | 3/6 | no |
| **λ at `defuse` = 0** | **+7.83** | 6/6 | **yes** |
| **λ at `defuse` = 1 (the shipped config)** | **+3.71** | 6/6 | **yes** |
| interaction | −4.12 | — | no |

> **Where the +7.0 came from, and why it must not be quoted for the shipped bot.** λ is worth
> **+7.83 only when `defuse` is switched off**. On the shipped configuration, which carries
> `defuse: 1` on the `BALANCED` base at `roster.ts:165`, λ is worth **+3.71**. Quoting +7.0 as the
> value of λ for the shipped bot adds a gain its `defuse` term has already banked. **The two
> mechanisms are substitutes**, exactly as ASKING.md §6 found in self-play (+1.915 alone, +2.068
> alone, **+1.565 stacked**), and the cross-play interaction of −4.12 reproduces that shape in a
> foreign engine.

**+3.71 points, 6/6 seeds, clearing the floor, is nonetheless the largest unshipped lever measured
anywhere in this dossier** — larger than the bridge fix. Three cautions travel with it:

1. **The mechanism does not exist in `lib/`.** ASKING.md §4.1 derives the correction and measures
   its bias ladder (λ = 0.60 removes the dropped-constraint bias almost exactly, −0.0835 →
   −0.0002); §6 shelved it with *"ship neither change now"*. It lives only in
   `scripts/probe-licence.mjs` and `scripts/probe-licence3.mjs`. It is unshipped deliberately.
2. **λ = 0.60 was derived at home, not fitted against SESTINA**, so measuring it abroad is a
   transfer test rather than a fit — which is the strongest form of evidence available under
   CROSSPLAY §7's holdout rule. **Tuning λ further against SESTINA would burn the holdout.**
3. **It does not work by making asks better.** FishAI's ask accuracy falls slightly (52.18% →
   51.65%) while its declarations rise (3.636 → 3.757/game) and its lock hold falls (9.14 → 8.81).
   ASKING.md §6 predicted exactly this: the term works as a **reordering** that promotes licensed
   asks. H6's separate finding that the residual bias abroad is weaker for FishAI's own asks
   (−0.0340, n = 6,923) than pooled (−0.0881, n = 10,800) is not contradicted — it explains why the
   gain is +3.71 and not larger.

### 6.3 The `defuse` ladder's peak is not located

`defuse` is shipped at 1. An equal-N ladder [pf2, 5 seeds, 1,000 deals per rung, ±3.10]:

| `defuse` | win rate | vs rung 1 | resolved? |
|---:|---:|---:|---|
| 0 | 23.50% | −3.88 | **yes** |
| 0.5 | 27.00% | −0.38 | no |
| **1 (shipped)** | **27.38%** | — | — |
| 2 | 29.30% | +1.92 | no |
| **4 (argmax)** | **29.95%** | +2.57 | no |
| 8 | 28.78% | +1.40 | no |

The inverted U is visible and the argmax sits at 4, but **every rung-to-rung contrast above 0 is
inside the floor. Only "some `defuse` beats none" is resolved.** On six seeds the 4-vs-1 contrast is
**+2.81, 5/6 positive** — seed 24680 is −1.83 — which does not clear ±2.83. A holdout bank never
used in fitting (seed 31415) gives d1 25.58%, d4 29.58%, d0 24.50%, replicating the 4-vs-1 gap at
+4.00 on one cell against a ±6.93 floor.

**Anyone quoting "defuse 4 is the optimum" is quoting an unresolved maximum of six noisy points.**
Resolving the peak needs roughly 4× the deals per rung. **[speculative]** The ladder's shape is
suggestive and the direction is consistent; the location is not measured.

### 6.4 Other open items

- **The base rate of teammate-missed asks among all events in the lagging window.** Without it,
  §3.2's 21.6% share is a last-event attribution rather than a lever, and the certificate census
  cannot be read as naming a channel. It is a count over the same event stream H4 already recorded.
- **The 39 dead asks FishAI's prover cannot refute** (~0.18% of asks). H6 measured the size, not the
  missing inference.
- **What SESTINA buys** by declining a certain hit 11.0% of the time and playing 0.0791 below the
  greedy argmax. The one-step counterfactual cannot credit it, and it is one-directional: SESTINA
  cannot be run on FishAI's positions. **This is the sharpest open question in the dossier.**
- **The correct information-set search.** Priced at ~500× per decision, never run (§5.5).
- **`conceal`** fired on 0.000% of 10,370 asks because every shipped style carries `conceal: 0`. It
  is the one built term that prices what an ask publishes about the asker, and it targets the
  measured 0.62-card certainty deficit and the licence asymmetry (P(target holds the card | live
  row-6 licence) = 0.5167 at a FishAI seat, 0.3973 at a SESTINA seat). **Never measured, on either
  bridge**, and with declaration accuracy at parity it is now the largest untested lever on the
  surviving ask/certainty channel.
- **The `containedPass` opportunity denominator** should be re-counted on the corrected arm, which
  now exercises `opPass` (§5.2).
- **`ev-claim`'s calibration** is unresolved: the sign flips between banks on n = 30 and n = 34
  (§3.5). The **home** declare population (+0.0010 over 3,055 home declares, certainty tier
  2,968/2,968) was **not re-measured**; a second cross-play bank was substituted for it and is
  labelled as such.
- **Three H1 ablations never completed** (forced answer suppressed / confidence clamped / sqrt
  recalibration) because the shared host was saturated.

---

## 7. What this document does not establish

- **Nothing about a tuned FishAI.** No shipped FishAI parameter was changed on the strength of
  anything here. CROSSPLAY §7's holdout rule applies: fitting against SESTINA burns it. This binds
  §6.2 and §6.3 in particular.
- **Nothing about the adaptive arm.** CROSSPLAY §9.6's `observe.ts` finding stands — the adapter
  must not be reused for it without a fix.
- **Roster style was never varied in any corrected cell.** The arm is `STYLE_ROSTER.punter` at
  `SKILL_PRESETS.hard` throughout, and **no claim is made that Punter is the right arm abroad** —
  only that it is the arm that ran.
- **The seeds share a build and an adapter.** They are independent deals, not independent
  implementations — and §2.1 is what a shared adapter is worth as a risk.
- **Every H1–H6 figure carried in this document ran on the defective bridge**, and each is labelled.
  Where a figure is a match outcome it is superseded or re-measured; where it is a code fact, a
  mechanism count, a replay over recorded positions, or an equality between two arms on the same
  bridge, it is retained with the reason stated. **Retention is an argument, not a default.**
- **"Replay over recorded positions" is bridge-independent only for claims about the decision
  function *given* a position.** It is not bridge-independent for any claim whose answer depends on
  which positions arise — the allocator comparison (46.52 / 47.97 / 50.76, §3.5), the
  POSITION/SELECTION decomposition (§5.4) and the ownership-onset shares MONET §3.6 carries (2.90%,
  12.73%) are all of that second kind, and all were replayed over positions generated by an arm that
  spent ~253 extra sets per cell (§2.2). **The distinction was asserted as a category and never
  tested. Re-recording one cell of positions on `bot:pf2` and re-running one replay settles it, and
  it has not been run.** [inferred] This qualifies §2.4's "bridge-independent in kind" labels and
  §5.4's "the bridge does not enter", both of which are sound for the fidelity and urn-probability
  claims and unproven for the distribution-dependent ones.
- **The re-measurement is not exhaustive.** 139 cells settle 22 numbered priorities; §5.2, §5.4,
  §5.6, §3.1's speed-side control and §3.2's certificate census were **not re-run**, and neither was
  the home declare population.
- **`opForced` is adapter-authored.** `us54` has no forced endgame, so the branch is a decision the
  bridge makes. It counts polls received, at 0.371/game, and must not be confused with the engine's
  `forced decls` line at 0.02/game (§2.1).
- **No FishLab implementation source was read** by any investigator — only their published protocol
  document, their published docs, and the CLI's own output. FishLab carries no licence file, and
  nothing of theirs is copied here.
- **Nothing under `C:/Projects/FishAI` was modified** by any probe. Every one imports it read-only.

---

## 8. Numbers withdrawn from the first version

Named rather than deleted, because a published number does not stop existing. Every entry below was
published in the first version of this document or in the CROSSPLAY sections it drew on.

| withdrawn | was reported as | status |
|---|---|---|
| **24.22% / 28.58% / 28.17%** | the document's subject: three measured losses | superseded by **27.83% / 32.86% / 33.31%** on three matched seeds; **27.08%** pooled over six vs SESTINA |
| **21.4 and 21.8 points** under even vs v0.5 / v0.6 | the size of the non-search losses | **16.69 and 17.14.** The search refutation is unaffected |
| **±2.83 at 1,200 games; ±1.63 at 3,600; ±1.26 at 6,000** | the power line, N in games | **wrong unit.** The per-deal paired floor governs: ±6.93 per cell, ±4.00 at three seeds, ±2.83 at six |
| **+4.00** for the bridge fix | H3 `passfix`, 300-game cells | superseded by **+3.44**, six seeds, 7,200 games. H3's estimate landed within 0.56 points of it |
| **93.53% vs 98.37%** declare accuracy; **0.305 sets/game**, 16.4% of the deficit | FishAI's declaration channel | **the bridge.** Corrected: 98.371% vs 98.335% on three seeds; the accuracy term is −0.0033 sets/game, −0.21% |
| **93.25%** declare accuracy, and **93.43%** / "3.4% of the gap" derived from it | FishAI's declare rate and a tuning ceiling | **void.** Already withdrawn in CROSSPLAY §9.8; the denominator it was a share of is 0.04 points |
| **1.866 sets/game** deficit; 27.4 points priced against 26.15 observed | the deficit as arithmetic | **1.573** (3 seeds) / **1.605** (6 seeds); 23.12 against 22.17, and 23.60 against 22.92 |
| **"two of the three largest terms are not FishAI playing badly"** | §0's framing | **one is.** §2.1 and §2.2 double-counted a single mechanism |
| terminal half-suit as a **separate host-rules artifact**, "~0 win rate, 2/3 of the error rate", 568 declares / 196 wrong of 299 | §2.2 | **reclassified.** The guard fires at `hand.length === 0`, the terminal condition, and removed ~253 of ~322 wrong declares. The corrected cell holds 24 traced wrong plus at most 45 unobservable |
| **"64.08% vs 52.50%"** — FishAI the better team in the forced endgame | §2.3 / §5.1 | **unresolved.** 60.76% (48/79) vs 46.21% (67/145); Wilson intervals overlap by five points |
| **three** pooled `pathology` counters | §2.3 | **four.** 4.21% declarations-wrong is also pooled |
| **exactly 50.0000% [47.18, 52.82]** mirror control | validation of the H5 harness (§4.1) | **void.** Zero effective sample; and a mirror cannot see a symmetric defect, which is what this was |
| **8.27 events vs 2.79** | the one-sentence summary | **9.30 vs 2.92** — and the first pair compared a LAG against a HOLD |
| **lockHold 9.69 vs 2.78** | the figures §3.1 rebutted | **9.30 vs 2.92.** The rebuttal is unaffected; the digits are superseded |
| **−2.00** for 3 further polls, **−2.25** for 20; "the corner of its knob" | §3.1 control 2 | **−1.81 (unresolved) and −4.19 (resolved).** The asymmetry, and the corner reading, are withdrawn |
| **+1.91** for `r12` off, "clears ±2.83" | §3.2 | **+2.58 against a ±4.00 floor — unresolved.** The behavioural movements survive |
| **30.17% vs 24.42%** for the oracle | §3.4 levels | superseded by **33.58% vs 27.83%.** The **+5.75 delta survives to two decimals** |
| **"perfect lock detection closes about 22%"** | §3.4 | **25.9%** of the corrected gap to even |
| **~40 points unattributed** (§6.1) and **~10–20** (§0) | the residual, two irreconcilable figures | **16.42.** The ~40 double-counts by using the A-minus-B spread instead of the gap to even |
| **+3.33 [+1.26, +5.41]** for `defuse` | §0 | **+3.42**, six seeds, 6/6 positive, clears ±2.83 |
| **+8.88 / +9.29 / +3.50** for `defuse` vs v0.5 / v0.6 / SESTINA | §4.3 | **+10.28 / +10.39 / +3.42.** The shape holds; all three are larger |
| **+7.0** for λ = 0.60 | §0 and §6.2, flagged as unquotable | **+3.71 on the shipped configuration.** +7.83 is the `defuse: 0` figure and is not available to the shipped bot |
| **−3.7 to −4.2** for cheap determinization search | §5.5 | **not reproduced.** −1.08 / +0.17 / −0.64 against a ±4.00 floor. §5.5 is **re-opened** |
| **"clears one rung of their ladder and no other"** | §4.1 | **clears two** (v0.2 and v0.3), and v0.2 → v0.3 is not a resolvable rung |
| **FishAI declare accuracy 92.7–93.6%, between v0.3 and v0.4** | §4.1's profile table | **reversed.** At 97.5–98.9% FishAI is at or above every post-v0.3 bot, level with SESTINA |
| **4.89-point** ask gap; own-locked asks are **61%** of it | §3.3 / §5.4 | gap is **5.06** (s90210) / **5.00** (3 seeds). The corrected oracle buys **18.0%** of it; the 61% counterfactual is withdrawn |
| bridge worth **+4.5 to +4.8** vs v0.5 | §4.3 | **+4.14** vs v0.5, **+3.31** vs v0.6 |
| **`ev-claim` is the only optimistic tier, +0.0486 in cross-play** | §8's `decide.ts` correction | **unresolved.** The sign flips between banks: +0.0789 vs SESTINA (n = 30), −0.1291 vs v0.5 (n = 34) |
| **−0.0013 over 3,864** declares; certainty tier **3,714/3,714** | §8's calibration finding | **−0.000776 over 3,858**; certainty tier **3,795/3,795 exact.** The finding survives, restated |
| all figures from the **`-march=native`** build | H3's cells | superseded. Every cell here is the portable `-ffp-contract=off` build |

**What survived the correction unchanged**, and is worth naming for the same reason: the mechanism
identification in §2.1; the `opPass = 0` diagnostic; the pooled-counter correction; the oracle's
**+5.75** delta; the structural `evClaim` gate; the accounting identity's method and its 0.033
residual; the ask-selection decomposition; the `containedPass` refutation; and the central thesis of
§3, which the correction strengthened by removing its only rival.

---

## 9. Reproducing

`CORRECTED-FACTS` §7 and CROSSPLAY §9.9 carry the full procedure. The parts specific to this
document:

```bash
SESTINA='v07:r12=25,rtie=1,pool=-1,oppfloor=-1,force=1000000,askfloor=-1,stall=12,s1=1,det=12,\
cand=4,kappa=2.5,rbelief=indep,depth=12,maxq=26'

# Build the engine with FP contraction OFF and require PASS on all three identity controls first.
g++ -O2 -std=c++20 -ffp-contract=off /src/engine/src/main.cpp -o /tmp/fish_portable -pthread

# Apply the 2.1 guard to the adapter BEFORE playing anything, and assert opPass > 0 after the
# first cell. No other control in this setup can detect a symmetric bridge defect.
/tmp/fish_portable match --a=bot:pf2 --b="$SESTINA" --games=200 --rotations=6 --seed=90210
```

- **`--games=N` is deals**; total games = N × rotations. A cell is 200 deals × 6 rotations.
- **Seeds.** Ladder and ablations: 90210 / 4242 / 7011001. Six-seed banks add 13579 / 24680 / 31415.
  31415 is the `defuse` holdout and must not be used to fit anything.
- **Opponents.** `v02`…`v06` and the frozen v1.0 spec above. **`v01` is not a recognised policy** —
  the engine answers `fish: unknown policy 'v01'`.
- **Bot ids are lowercased on install.** Register `p2trs`, not `p2trS`.
- **Read the power line the engine prints.** It states both floors; **the per-deal one governs.**
- **Assert `opPass > 0`**, not a band on `opForced` — the two count different things (§2.1).
- Raw output for all 139 cells, the parsed `cells.tsv`, the batch logs and the per-declare traces
  live in the session scratchpad under `remeasure/` and are not committed.

Exact target names, Makefile variables and match-runner flags are in FishLab's own documentation and
are **not reproduced here** — their repository has no licence, so this section describes the
procedure and leaves their text where it is.
