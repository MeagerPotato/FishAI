# ADAPTIVE.md — FishAI v1.0: the adaptive engine, and the theorem that makes it moot

FishAI v1.0 is the adaptive layer over the measured roster: it watches the public log, forms a
style posterior per opponent seat, and best-responds over the committed payoff matrix. This
document records its architecture, the degeneracy that the committed matrix forces on it, and the
measured verdict from the 125,600-game experiment suite — which is **negative**, was predicted to
be negative before the run, and is reported as a negative result rather than dressed up.

The one-paragraph version: [matrix v2](STYLES.md) measured Punter's row above every other row in
every column, the adaptive expectation is linear in the opponent posterior, and therefore a warm
adaptive team provably delegates to Punter under every belief it can possibly hold. The
experiments confirm the implication in play and price what is left: the engine pays a measurable
warmup toll for the anchor it plays before it has evidence (every gauntlet delta negative; the
mixed-population delta −0.0136 ± 0.0022), and perfect classification is worth **exactly zero** —
all nine oracle cells measure 0.0000 with SE 0, because both arms delegate identically at every
decision. Over this roster, at this level of play, adaptation converges to the dominant style and
then underpays for the time it spent deciding to.

Companions: [STYLES.md](STYLES.md) for the roster and matrix v2, [BOT_LAB.md](BOT_LAB.md) for the
measurement discipline the suite inherits, [RULES_US54.md](RULES_US54.md) for every rule row cited
below. Everything marked **[measured]** was executed against this repo's engine; every number is
pinned to the committed artifact or source file that carries it.

---

## 1. What v1.0 is

Four stages, one direction, no state:

```
observe            classify              best-respond          delegate
public log  ──►  SeatObservation  ──►  posterior per seat  ──►  argmax over the       ──►  the chosen
(SeatView)       per seat              (9 styles)               counter table's rows       StyleParams,
                                                                                           played at hard
observe.ts       classify.ts +         adaptive.ts              data/counter-table.ts      skill (decide.ts)
                 data/fingerprints.ts
```

- **`SeatView` only.** The adaptive engine consumes exactly what any bot consumes — the public
  log, the seat, the hand, the config — and nothing else.
  [tests/bots/public-view.test.ts](tests/bots/public-view.test.ts) already makes any other hand
  structurally unreachable, and the adaptive layer adds no new channel.
- **Stateless.** `chooseStyle(view, spec)` is a pure function: no remembered last choice, no
  clock, no rng. Everything — the observation, the posterior, the expected payoffs, even whether
  the current choice differs from the previous phase's — is re-derived from the log at every
  decision ([lib/engine/bots/adaptive.ts](lib/engine/bots/adaptive.ts)).
- **Deterministic.** Same view, same spec → identical choice; same seed → byte-identical game,
  exactly as for every static style.

Statelessness is not a purity affectation; it buys three things this project actually uses:

1. **Two seats with the same information reach the same read.** A stateful adaptive seat could
   diverge from its teammate on private history, and the "one shared engine" discipline of
   [STYLES.md §2](STYLES.md) — the thing that makes *style* measurable rather than *skill* —
   would die quietly right here. The equality is pinned by a test, not assumed
   ([tests/bots/adaptive.test.ts](tests/bots/adaptive.test.ts): two seats of one team, same log,
   same choice).
2. **Reproducibility from the seed alone.** A game involving adaptive seats replays
   byte-identically from `(seed, config, startSeat)`, so duplicate pairing, cross-cell shared
   seed sets and the digest discipline of [BOT_LAB.md §5](BOT_LAB.md) all apply unchanged.
3. **The lab inherits every metric.** Because the adaptive engine is just another `PolicySpec`
   resolved inside `decide`, it enters `playGameSeats` as an ordinary seat and every counter,
   health gate and estimator the lab already had applies to it for free — nothing in
   [lib/lab/](lib/lab/) special-cases it beyond a `leakStyle` anchor for the leak metric.

The delegation target is always a roster style at full-strength inference: the adaptive layer
picks *which* `StyleParams` vector enters the ordinary v0.5 pipeline, never a different pipeline
([lib/engine/bots/decide.ts](lib/engine/bots/decide.ts), `resolveWithView`).

---

## 2. The observation layer — [lib/engine/bots/observe.ts](lib/engine/bots/observe.ts)

One O(events) pass over `view.log`, producing a fixed `SeatObservation` per seat. No constraint
propagation and no `buildKnowledge` — the point is to describe *behaviour*, not to solve the
position. The classifier and the calibration script share this exact code path, because
fingerprints taken through a different instrument would describe a different instrument.

### 2.1 What the public log certifies exactly

Everything observed is an exact public fact, never an estimate:

| Observation | Mechanism | Rule |
|---|---|---|
| **A hit locates a card.** After `ask{hit: true}` the named card is publicly at the asker until it moves again or its book resolves — the `publicHolder` map. | Card transfers face up | [RULES_US54.md](RULES_US54.md) row 9 |
| **An ask certifies a licence.** Every ask proves the asker held ≥ 1 card of that book at that time (and lacked the named card). The flag is decayed conservatively — dropped when the book resolves, when the seat empties, and when a hit strips a card of that book from the seat, because a possibly-stale certification is worth less than an honest one. | Holding ≥ 1 card is the only licence to ask | rows 6, 7 |
| **A declare reveals true holders.** The `claim` event carries `actualHolders` for all six cards, so a *foreign* declare (claimer not among the values) and an *own-hand-only* declare (every value = the claimer) are **exact**, not inferred — the public signatures of `foreignDeclare` (Archivist) and `declareOnlyOwnHand` (Turtle). | Full public log of declares | row 17 |
| **Hand counts replay.** Counts are re-derived from the log — deal size, one card asker ← target per hit, six removals per claim — rather than read from `view.counts`, because a truncated view's top-level counts describe the end of the game, not the truncation point. Pinned against `view.counts` at full length in [tests/bots/observe.test.ts](tests/bots/observe.test.ts). | | |

### 2.2 What the log cannot show

`decline` emits **no event** ([lib/engine/types.ts](lib/engine/types.ts): the declare window
advances silently), so declare-window *patience* — how long a seat sat on its option — is
invisible to any public observer, and no feature depends on it. `declareBackload` measures where
in the observed event stream a seat's declares landed, which is the observable stand-in for the
declare move-index a god's-eye harness would use. This same silence returns in §6.6 with teeth:
it is the mechanism by which the warmup consumes half the game.

### 2.3 The 14 features, and why they are shares

The classifier consumes `FEATURE_KEYS` — 14 entries, every one a rate or a share:

`hitRate · askDiversity · sameBookRepeatRate · certainAskShare · deadAskShare · leakyAskShare ·
completionAskShare · missFewestShare · missMostShare · askShare · declareShare ·
foreignDeclareShare · ownHandOnlyShare · declareBackload`

Length-invariance is by construction, and the reason is a measured failure, not taste: the first
calibration ran over raw counts, and it read every short cross-play game as "not the style" simply
because the mirror games it was calibrated on ran longer — **a fact about the opponents, not the
seat**. The raw counts survive in `SeatObservation` as the primary observations; the classifier
never touches them. (`asks`, `hits` and `declaresCorrect` are deliberately absent from the key
list: the first two are the denominators already inside `hitRate` and `askShare`, and declare
correctness is near-ceiling for every full-strength style, so it separates nothing.)

Two features deserve a note. `deadAskShare` counts asks for a card whose public holder was known
and was not the target — a *guaranteed* public miss, which is exactly the
[CONTAINMENT.md](CONTAINMENT.md) turn-pass, so the mechanism's public signature is a first-class
observable here. And `leakyAskShare` counts certifications only for team seats with no located
card of the book, so a certification is never double-counted against the card that proved it.

---

## 3. The classifier — [lib/engine/bots/classify.ts](lib/engine/bots/classify.ts) + [data/fingerprints.ts](lib/engine/bots/data/fingerprints.ts)

The model is deliberately the simplest thing that can be honest: a **diagonal Gaussian** per style
over the feature vector, scored as a pure z-distance `Σ −½·z²` and softmaxed over the nine styles.
Diagonal on purpose — with 14 features and a few hundred calibration vectors per bucket, a full
covariance would be an estimate of noise — and the classifier's accuracy is *measured* downstream
(§6.5), never assumed here.

### 3.1 Calibration

`node scripts/gen-fingerprints.mjs` plays, per style, 150 `us54` **mirror** games (all six seats
the style; seeds `fingerprint-v1-<style>-<i>`, start seat `i % 6`, step cap 5000) and commits the
mean and sample SD of the feature vector over every seat of every qualifying game. Mirrors on
purpose: a fingerprint should describe what a style does, not what its opponents let it do.

One bucket per checkpoint in {60, 120, 200, 300} (log prefixes of running games) plus `full`
(completed games), because the shares themselves drift over a game — declares concentrate late,
certainty accumulates — so a mid-game observation must be read against fingerprints taken at the
same horizon. A view whose log ends in `game_over` reads `full` whatever its length; otherwise the
nearest checkpoint at or below the observed event count. The committed calibration
(`FINGERPRINT_PROVENANCE`, generated 2026-08-24) records bucket occupancy honestly: **only the
Turtle's mirror games ever outlive 200 events** (246 seat-vectors in its '200' bucket; every other
style has 0 there and falls back to full-game stats), which is §3.4's separability structure
showing up in the calibration itself.

### 3.2 Two modelling choices made by measurement, not taste

Both are recorded in the [classify.ts](lib/engine/bots/classify.ts) header and both were forced by
calibration probes:

- **The Gaussian normaliser (−ln σ) is dropped.** With sample SDs over a few hundred vectors,
  `Σ −ln σ` is a large constant bonus for whichever style happened to calibrate tightest — in the
  first calibration it handed the Ghost **40 of 60** mirror-Balanced reads. Without it the score
  is a pure z-distance, whose argmax at a style's own mean is that style itself.
- **The per-style σ is shrunk halfway to the pooled σ**: `σ′² = (σ_style² + σ_pooled²)/2`. Raw
  per-style SDs make the widest-variance style an outlier magnet ("everything unusual must be the
  Scout"); fully pooled SDs throw away real information (the Turtle genuinely is more repetitive
  than its mean alone says). The halfway blend beat both ends on cross-play reads and tied them
  on mirror self-reads.

Two structural honesty mechanisms sit on top: the posterior is blended toward uniform by
`min(1, asks/12)` — at 0 asks the answer is exactly "I don't know", and full confidence needs a
dozen of the seat's *own* observed choices, not merely a long game — and `sd` is floored at 0.01
so a literally-constant calibration column becomes a very strong finite vote rather than an
infinite log-penalty.

### 3.3 What the posterior is, honestly

A damped softmax over nine calibrated hypotheses. It is a *projection*: an opponent who is none of
the nine styles — a human, a foreign bot — still gets a posterior over the nine, because there is
nothing else to give. §7 returns to this.

### 3.4 The separability structure, and its tie to [STYLES.md §6.1](STYLES.md)

§6.1 measured how much of each style's *decision stream* differs from Balanced on identical
views: Scout 2.89%, Ghost 2.15%, Archivist 1.66%, Banker 1.19%, Turtle 0.83%, Punter 0.47%,
Hoarder 0.47%, Blitz 0.39%. The classifier sees the same structure from the outside:

- **The balanced/blitz/punter/banker quadrangle is ≈ one point in feature space.** Those four
  diverge from Balanced on under 1.3% of decisions, their public fingerprints nearly coincide,
  and §6.5 measures end-of-game top-1 for them at 0.06–0.13 — at or *below* the 1/9 ≈ 0.111
  chance line. A public log simply does not carry what would tell them apart.
- **The Turtle is the far pole** — not because it makes many divergent decisions (0.83%) but
  because the decisions it does change reshape the whole game: `declareOnlyOwnHand` leaves books
  unbanked, its games run long (it alone populates the 200-event calibration bucket), and it is
  the one style with a real `deadAskShare` signature. Ghost, Scout and Hoarder are the other
  readable poles (end-of-game top-1 0.50, 0.41, 0.31).

This is [STYLES.md §6.1](STYLES.md)'s finding restated as an observability result: the roster's
labels advertise a declare-threshold axis that never fires, and the styles that *can* be told
apart are told apart by ask-policy and game-shape signatures — the knobs that actually do the
work.

---

## 4. The policy — [lib/engine/bots/adaptive.ts](lib/engine/bots/adaptive.ts)

### 4.1 The counter table, with its provenance attached

The payoffs are [data/counter-table.ts](lib/engine/bots/data/counter-table.ts), generated by
`node scripts/gen-counter-table.mjs` from the **matrix v2** artifact
(`src/lab/data/style-results.v2.json` — [STYLES.md §6.4](STYLES.md)): `p[i][j]` is the
duplicate-averaged score rate of style *i* against style *j* over 4,300 pairs per cell,
antisymmetric about 0.5, with the diagonal 0.5 by duplicate-pair symmetry — unmeasured on
purpose. The provenance travels with the numbers (`recordsDigest 0c3cb524a3534d4a`, engine commit
`1667a1d-dirty`, generated 2026-08-22), because an adaptive decision is only as honest as the
matrix it consults, and [tests/bots/adaptive.test.ts](tests/bots/adaptive.test.ts) pins the table
against the artifact. The experiment pipeline enforces the same discipline at the other end: the
artifact builder **throws** if the benchmark's digest and the counter table's source digest
differ — the row the engine is judged against and the table it played from must come from the
same matrix.

### 4.2 The selection rule, exactly

Opponents are the three seats of the other team. For each candidate style *i* (every row of the
table),

```
expected[i] = mean over opponent seats of  Σ_s posterior(s) · P[i][s]
```

then `expected[anchor] += switchMargin` — hysteresis expressed as an anchor bias: a candidate must
*beat* the anchor by the margin, not merely tie it — and the choice is the argmax, ties resolving
to the earlier row in table order. During warmup (fewer than `warmupEvents` observed events) the
anchor plays unconditionally: an early posterior is mostly the damping prior, and a best response
to ignorance is noise. The defaults, exported as `ADAPTIVE_DEFAULTS` so prose and tests state the
same numbers: `warmupEvents 40`, `switchMargin 0.01`, `anchor 'balanced'`.

### 4.3 Statelessness, and the phase quantisation that stands in for memory

A stateful bot would remember its last choice and demand a margin to move off it. This bot owns no
state, so hysteresis is expressed statelessly, twice over: the memoryless anchor bias above, and
**phase quantisation** — the choice may only change when `floor(events / 30)` changes
(`ADAPTIVE_PHASE_EVENTS = 30`). The rationale is worth quoting from the source rather than
paraphrasing, because it is the load-bearing design sentence of the file:

> *"This bot deliberately owns no state — `decide` is pure per call, and two adaptive seats with
> the same public information MUST reach the same read, or the 'one shared engine' discipline
> (STYLES.md §2) dies here."*

The quantisation is expressed as truncation, not memory: the posterior is evaluated on the log
**cut** to the last multiple of 30 events, so every view inside one phase — and every seat looking
at it — evaluates the identical prefix and reaches the identical choice. A seat therefore cannot
flip styles mid-phase, which is the behavioural point of hysteresis, without a single byte of
remembered state. The warmup gate reads the truncated length too, for the same reason —
consequence, stated honestly: with the defaults, **the first warm phase begins at 60 observed
events**, the first multiple of 30 at or above 40. `switched` is recomputed the only way a
stateless function can: by evaluating the previous phase's truncation as well, one extra
observe-and-classify pass per call past phase 0.

### 4.4 Oracle mode (lab only)

`oracleStyles` bypasses the classifier with a point-mass posterior per non-null seat — the
ablation that prices what perfect classification would buy (§6.3). Oracle reads still carry the
truncated event count, so warmup and phase behaviour are identical in both modes and the ablation
isolates exactly one thing: the posterior.

### 4.5 Where it resolves

`AdaptiveSpec` is the fourth `PolicySpec` shape. It resolves inside
[decide.ts](lib/engine/bots/decide.ts) — not in `resolvePolicy`, which refuses it structurally —
because it needs the view: `chooseStyle` picks the roster style, and the chosen vector is played
at **hard** skill, per [STYLES.md §2](STYLES.md)'s one-shared-engine rule. The `chooseStyle` call
sits inside the same try/catch as everything else, so a throwing classifier degrades to the same
fallback as any other policy failure and both wrappers keep their never-throws / never-illegal
contract by construction. `decideExplained` prepends the read — the chosen style with its
expected payoff, then one line per opponent seat with its top classification — before the
ordinary branch narration, so the assistant pane shows *why this style* above *why this move*.

---

## 5. The degeneracy theorem **[measured + derived]**

**Over the committed counter table, the warm adaptive engine selects Punter under every belief it
can hold.** The dominance is measured; the consequence is arithmetic, and that is a theorem about
the committed table rather than a tendency observed in play.

**The measurement.** Punter's row of matrix v2 is the argmax of `P[·][s]` for every column `s` —
the nine best-response values, verified against
[data/counter-table.ts](lib/engine/bots/data/counter-table.ts):

| BR against | balanced | blitz | punter | banker | turtle | hoarder | scout | ghost | archivist |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `P[punter][s]` | 0.5190 | 0.5198 | 0.5000 | 0.5469 | 0.6581 | 0.5795 | 0.6603 | 0.5867 | 0.5926 |

The punter column's 0.5000 is the diagonal — no style beats Punter, so Punter is its own best
response. In every one of the nine columns Punter's entry strictly exceeds every other row's; the
smallest margin over the nearest rival row is **0.0112** (the hoarder column, over Blitz), and the
smallest margin over the anchor's row is **0.0171** (the hoarder column, over Balanced).

**The derivation.** The expected payoff of §4.2 is linear in the posterior:
`expected[i] = mean over seats of Σ_s q(s)·P[i][s]`. If `P[punter][s] ≥ P[i][s] + m` for every
rival row *i* and column *s*, then `expected[punter] ≥ expected[i] + m` for **every** posterior
`q` — point mass, uniform damping prior, or anything the classifier can emit — because a convex
combination of dominated columns is dominated by the same margin. With m = 0.0112 the argmax is
Punter under every belief. The anchor bias cannot rescue another choice either: the default
`switchMargin` is 0.01, and Punter clears the Balanced anchor's row by at least 0.0171 in every
column — the hysteresis is priced *inside* the margin. So once the warmup gate opens, the choice
is Punter, always, whatever the classifier says.

**Two hedges, stated rather than buried.** First, the theorem is exact *given the table*: the
engine best-responds to the committed point estimates, so "provably selects Punter" is a statement
about this artifact, not about the platonic matchup graph. The cells behind the smallest margin
carry paired SEs of ≈ 0.004 each, so 0.0112 is about 1.9 naive combined SEs — conservative,
since the cells share a seed set — and a re-measured matrix could in principle re-order a
column. Second, nothing in the code hard-codes the winner:
[tests/bots/adaptive.test.ts](tests/bots/adaptive.test.ts) **re-derives the argmax from the
table** and pins the choice per oracle opponent against it, so a future counter table with an
intransitive cycle flows through the engine unchanged and simply makes the adaptation
non-trivial. The mechanism was built in full anyway, on purpose: the architecture is the
contribution, and the degeneracy is the *result*.

---

## 6. The experiment suite **[measured]**

Design in [lib/lab/adaptive.ts](lib/lab/adaptive.ts) (typechecked, tested), data contract and
**pre-registered predictions** in [lib/lab/adaptive-types.ts](lib/lab/adaptive-types.ts), thin
launcher in [scripts/adaptive-sim.mjs](scripts/adaptive-sim.mjs), artifact folding in
[scripts/adaptive-analyze.mjs](scripts/adaptive-analyze.mjs), and one committed artifact the site
reads: [src/lab/data/adaptive-results.json](src/lab/data/adaptive-results.json). Every number in
this section is extracted from that artifact.

The four predictions were written down *before* the run, in
[adaptive-types.ts](lib/lab/adaptive-types.ts), because the committed counter table already
implies all four — the experiments exist to check the implication against play, not to discover
it. Abbreviated: **P1** the warm gauntlet should match Punter's matrix-v2 row within CI, with any
detectable shortfall being the price of the warmup anchor; **P2** the adaptive-vs-punter
mixed-population delta should be ≈ 0; **P3** oracle classification should add ≈ nothing; **P4**
classifier top-1 should be good for turtle/ghost/hoarder and heavily confused inside the
quadrangle. A refuted prediction is emitted as `refuted`, not massaged — and two of the four
were.

**The run.** 125,600 games (gauntlet 9 × 4,300 pairs on matrix v2's exact `style-v1` seed list;
mirror 400 pairs; mixed screen 24 compositions × 400 pairs × 2 arms on `mixed-v1`; oracle 9 × 400
pairs; classifier accuracy 36 pairings × 50 games on `clsacc-v1`), generated 2026-08-24, engine
commit `45ec9f3-dirty`, records digest `ce3316641a8f38fe`, wall clock 579,634 ms ≈ 9.7 minutes
across the worker pool. Health gate ([BOT_LAB.md §4.3](BOT_LAB.md) plus the suite's own pairing
gates): `illegalActions 0 · cappedGames 0 · invariantViolations 0 · ties 0 · voids 0 ·
nonClinch 0`, every cell's `distinctSeeds` equal to its pairs, the mixed screen's two arms
verified to have played identical (pair, orientation, seed, start seat) sets, and the oracle
cells verified to share the gauntlet's head seeds. All clean; the artifact's `health.ok` is
`true`.

**The benchmark caveat, up front.** The gauntlet replayed matrix v2's seed list exactly — both
orientations, same start seats — so every deal behind Punter's committed row was replayed by the
adaptive team and the comparison is per-deal. But the pairing is **cross-run**: the two runs'
per-game records are not joined, so the delta SE is the conservative independent combination
`sqrt(se² + benchSe²)`, an upper bound on the true paired SE (shared deals correlate the two
means positively). Every gauntlet z below is therefore, if anything, understated.

### 6.1 The gauntlet: nine cells, nine negative deltas — P1 **refuted**

Adaptive team vs each pure style, 4,300 pairs (8,600 games) per cell, against Punter's matrix-v2
row on the same deals:

| opponent | adaptive score | SE | punter benchmark | Δ (adaptive − punter) | SE(Δ) | z |
|---|---:|---:|---:|---:|---:|---:|
| balanced | 0.5114 | 0.0027 | 0.5190 | −0.0076 | 0.0045 | −1.68 |
| blitz | 0.5086 | 0.0040 | 0.5198 | −0.0112 | 0.0058 | −1.93 |
| **punter** | **0.4892** | 0.0031 | 0.5000 | **−0.0108** | 0.0031 | **−3.53** |
| banker | 0.5393 | 0.0048 | 0.5469 | −0.0076 | 0.0067 | −1.12 |
| turtle | 0.6485 | 0.0045 | 0.6581 | −0.0097 | 0.0065 | −1.49 |
| hoarder | 0.5709 | 0.0039 | 0.5795 | −0.0086 | 0.0057 | −1.51 |
| scout | 0.6512 | 0.0046 | 0.6603 | −0.0092 | 0.0065 | −1.40 |
| ghost | 0.5691 | 0.0049 | 0.5867 | −0.0177 | 0.0069 | −2.55 |
| archivist | 0.5778 | 0.0046 | 0.5926 | −0.0148 | 0.0066 | −2.24 |

**All nine deltas are negative.** At the pre-registered Bonferroni bound for nine simultaneous
cells (|z| > 2.773), one cell rejects — the punter cell, z **−3.53** — and that is enough:
**P1 is refuted**. Ghost (−2.55) and archivist (−2.24) sit between 1.96 and the bound, named but
not counted; with nine cells, ~0.45 land there by chance. The punter cell is the sharpest for a
structural reason: its benchmark is the diagonal 0.5 exactly, with SE exactly 0, so its delta SE
is the adaptive cell's own 0.0031 and nothing else. Read plainly: **the adaptive team measurably
loses to the very style it converges to** — 0.4892 against Punter — because it spends its warmup
as Balanced, and Balanced's row sits 0.017–0.032 below Punter's in every column. The smallest
shortfall the widest cell could have rejected is ~0.0192, so the eight cells that stay under the
corrected bound are not evidence of no shortfall; the sign pattern (nine of nine negative)
and §6.2 are.

### 6.2 The mixed screen: the warmup priced under true pairing — P2 **refuted**

24 opponent compositions (the stride-7 sample of the 165 lexicographic 3-multisets — every 7th,
indices 0 to 161, deterministic and documented rather than seeded-shuffled), each played twice on
identical seeds, start seats and orientations: adaptive team vs the composition, and a pure
Punter team vs the same composition. The headline is the pooled per-deal delta, **truly paired
within this run** — no cross-run caveat here:

> **adaptive − punter = −0.0136 ± 0.0022** (z −6.30; 95% CI [−0.0178, −0.0094]);
> pooled means 0.5626 (adaptive) vs 0.5761 (punter) over 24 × 400 pairs.

**P2 is refuted**, at six standard errors. Per composition, 21 of 24 deltas are negative; the
three positive ones (+0.0037 vs balanced+balanced+ghost, +0.0100 vs banker+banker+scout, +0.0050
vs hoarder+archivist+archivist) are each within ~1 SE of zero. The magnitude is consistent with
the warmup story to first order: §6.6 measures ~52–58% of adaptive decisions spent on the
Balanced anchor, and half a game at Balanced's 0.017–0.032 row shortfall is on the order of
0.01 — which is what both this screen and the gauntlet's deltas measure. Adaptation does not buy
what the fixed Punter team already has; it pays for the time spent deciding to become it.

### 6.3 The oracle ablation: perfect classification is worth exactly zero — P3 **confirmed**

The nine gauntlet cells re-run at 400 pairs with `oracleStyles` handing the adaptive seats the
true opponent styles, per-deal paired against the gauntlet's own first 400 pairs (same seeds —
checked, not assumed). Result, per the artifact:

> **Every oracle cell measured a delta of exactly 0.0000, with SE exactly 0.**

Not "small" — identically zero, in all nine cells (classifier-arm and oracle-arm scores agree to
the fourth digit cell by cell: 0.5238, 0.5138, 0.4975, 0.5450, 0.6587, 0.5775, 0.6663, 0.5625,
0.5975). The mechanism is §5 doing exactly what it proves: with a dominant row, the warm argmax
is Punter under a point-mass posterior *and* under the classifier's posterior, and the warmup
anchor is the same in both arms, so **the two arms delegate to the same style at every decision
and the paired games are identical move for move**. The measured value of upgrading the
classifier to perfection, under dominance, is zero — not approximately, exactly. This is the
suite's cleanest single number, and it is the degeneracy theorem arriving as an outcome.

### 6.4 The adaptive mirror: 0.5000 ± 0.0000

400 pairs of adaptive-vs-adaptive. The policy is deterministic and identical on both teams, so
the two orientations of a pair are literally the same game and the paired score is **exactly**
0.5 with SE exactly 0 — a plumbing symmetry check, asserted as such in the tests, not a
measurement. It is reported because a mirror that came out anything else would mean the
statelessness discipline of §1 had failed somewhere.

### 6.5 Classifier accuracy: the curve, the poles, the attractors — P4 **mixed**

36 style pairings × 50 single games (team 0 one style, team 1 the other; no duplicate
orientation, because the measured quantity is classification, not payoff), scored top-1 per seat
at log truncations of {40, 80, 150, 250} events and at end of game, against a 1/9 ≈ 0.111 chance
line:

| events | seats scored | top-1 |
|---:|---:|---:|
| 40 | 10,800 | 0.164 |
| 80 | 10,464 | 0.202 |
| 150 | 672 | 0.375 |
| 250 | 0 | — (no game's log outlived 250 events) |
| end of game | 10,800 | 0.224 |

The 150-event column is read with its sample size in view: only 112 of 1,800 games ran that long,
a length-biased subpopulation. Per style at end of game: **ghost 0.504, scout 0.413, hoarder
0.309, turtle 0.272** — then archivist 0.118, and the quadrangle at **punter 0.129, banker 0.126,
blitz 0.093, balanced 0.056**, the last at half of chance.

The confusion matrix's structure is attractors, not uniform noise: **ghost soaks up 26.6% of all
predictions and scout 20.8%**, against 11.1% each under uniformity, while balanced attracts 3.7%.
Every quadrangle style's most common label is Ghost (26.1–32.3% of its seats); the Archivist is
read as Scout more often than as itself (33.1% vs 11.8%). The shrunken-σ z-distance sends
everything the quadrangle's near-identical fingerprints cannot claim toward the styles with the
most distinctive calibrated profiles.

Against P4's three pre-registered conditions: the quadrangle *is* unreadable (mean top-1 0.101 ≤
0.35 — condition holds), but the distinctive trio fell short (turtle/ghost/hoarder mean 0.362 <
0.50 — fails), and quadrangle errors leak *out* to the ghost/scout attractors rather than staying
inside the quadrangle (internal error shares 0.401, 0.398, 0.303, 0.326, each < 0.5 — fails). So
**P4 is mixed**: the separability *structure* predicted from [STYLES.md §6.1](STYLES.md) is
confirmed — the quadrangle is one point — but the absolute accuracy on the readable styles was
overestimated. Worth stating against §6.3: at the horizons the engine actually acts on (40–80
events), top-1 was 0.16–0.20, barely above chance — and under dominance that costs exactly
nothing, which is precisely the problem.

### 6.6 What the engine actually delegated: styleUsage, and the silent declines

The gauntlet's recorder re-runs `chooseStyle` on the exact view every adaptive `decide` received
and splits decisions warmup/warm by the same phase-truncation rule the engine gates on, so the
split reported is the split that was played:

- **Warm: 12,145,316 decisions across the nine cells — 100.00% delegated to Punter.** Not one
  warm decision, in twelve million, went anywhere else. §5, measured.
- **Warmup: 15,393,771 decisions — 100% the Balanced anchor**, by construction (warmup plays the
  anchor unconditionally).
- **The warmup share of decisions runs 52.2% (vs turtle) to 58.2% (vs blitz).** Over half of
  everything the adaptive team ever decided was decided by the anchor.

That last number is the one that needs a mechanism, because "warmup ends at 60 observed events"
sounds early. It is not, and the reason is §2.2's silence: **declines emit no public event**, and
a `us54` game spends several hundred steps in declare windows (the gauntlet's games average
681–767 steps), while its *public log* typically runs only ~80–150 events — in the accuracy
population, 96.9% of games outlived 80 events, 6.2% outlived 150, none outlived 250. The warmup
gate is calibrated in events, but decisions accrue per step, so the first warm phase at 60 events
lands past the midpoint of the decision stream. The engine spends the majority of its decisions
being Balanced, against a table in which Balanced's row is dominated by 0.017–0.032 everywhere —
and that, quantitatively, is the whole of the P1/P2 shortfall.

---

## 7. The verdict, plainly

**Over this roster, best-response adaptation converges to the dominant style and then underpays
for its warmup.** The observation layer is exact, the classifier is calibrated and honest about
its ignorance, the policy best-responds correctly — and the measured matrix makes the composition
of all three equal "play Punter, eventually" at a price of roughly a hundredth of a score-rate
point per game (−0.0136 ± 0.0022 in the truly-paired screen; every gauntlet delta negative).
**Perfect classification is worth exactly zero under dominance** — §6.3 measured 0.0000 with SE 0
in all nine cells, because the read never changes the argmax. A dominant environment does not
reward knowing your opponent; it rewards already being the counter.

### 7.1 The obvious remedies, and why each is the degeneracy restated

- **Anchor Punter** (`anchor: 'punter'`). The warmup then plays Punter, the warm phase plays
  Punter, and the "adaptive" engine is a Punter team with an observation layer it never consults.
  That is not a fix; it is conceding the theorem and hard-coding its conclusion.
- **Warmup 0** (`warmupEvents: 0`). The engine then best-responds to the damping prior — a
  uniform posterior — from the first decision. By §5, the argmax under the uniform belief is
  Punter. Same team, same theorem, one fewer knob.

Any tweak that closes the measured gap does it by making the engine Punter sooner, because Punter
is the unique fixed point the table admits. The degeneracy is not a bug in the adaptive layer; it
is a property of the environment the layer was pointed at, and the honest response is this
document rather than a knob.

### 7.2 What this does **not** settle

- **Intransitive rosters.** Every conclusion above is downstream of one measured fact — a row
  that dominates every column. A roster with a genuine cycle (matrix v2's cyclic energy is
  0.0112 against a 0.15 threshold, with zero significant 3-cycles —
  [STYLES.md §6.4.2](STYLES.md) — so this one has none) would make the argmax belief-dependent,
  and the machinery here handles that case today: the tests re-derive the best response from the
  table rather than pinning 'punter', so a new counter table flows through unchanged and simply
  makes the adaptation non-trivial.
- **Off-roster opponents.** The classifier's posterior is a projection onto nine calibrated
  hypotheses (§3.3). The human at [/play](src/pages/PlayTable.tsx) is none of the nine; so is
  any foreign bot under the [BOT_LAB.md §8](BOT_LAB.md) protocol. Whether a best response chosen
  through that projection beats a fixed style against opponents the table never measured is an
  open, measurable question — and the interesting one, since it is the only setting where the
  observation layer can earn its keep.
- **Other rule sets.** Every number here is conditional on pinned `us54`
  ([RULES_US54.md](RULES_US54.md), hash in the artifact). The dominance itself is a `us54`
  measurement; nothing transfers to `pagat48` without re-measuring the matrix there.
- **Better play.** [STYLES.md §5](STYLES.md)'s tuning protocol has never been run; the roster is
  "the styles as specified", and a re-tuned roster could re-shape the table this engine
  best-responds over. The verdict is about this population at this level of play — exactly as
  every verdict in this repository is.

---

## 8. Where it lives

**The engine.** [lib/engine/bots/observe.ts](lib/engine/bots/observe.ts) (observation),
[classify.ts](lib/engine/bots/classify.ts) (posterior),
[adaptive.ts](lib/engine/bots/adaptive.ts) (selection), the two committed calibrations
[data/fingerprints.ts](lib/engine/bots/data/fingerprints.ts) and
[data/counter-table.ts](lib/engine/bots/data/counter-table.ts), and the resolution point in
[decide.ts](lib/engine/bots/decide.ts). The barrel ([lib/engine/index.ts](lib/engine/index.ts))
exports the working surface — `observeSeats`, `replayedCounts`, `FEATURE_KEYS`, `featureVector`,
`checkpointBucket`, `classifySeat`, `classifySeats`, `FINGERPRINTS`, `COUNTER_TABLE`,
`chooseStyle`, `isAdaptiveSpec`, `ADAPTIVE_DEFAULTS`, `ADAPTIVE_PHASE_EVENTS` — plus the widened
`PolicySpec` union with `AdaptiveSpec`.

**The play table.** `?v=10` at [/play/table](src/pages/PlayTable.tsx) seats the adaptive engine
at every bot seat ([src/play/policies.ts](src/play/policies.ts)) — one shared frozen spec,
because the spec carries no state, which is also why the lobby offers no style picker for v1.0
seats. In `v10` the **assistant** reasons with the same engine the bots play, and its pane opens
with the adaptive read — chosen style, expected payoff, one classification line per opponent —
via `decideExplained` (§4.5).

**The lab pages.** `/lab/adaptive` renders the committed artifact through the boundary validator
[src/lab/adaptive-artifact.ts](src/lab/adaptive-artifact.ts) — the site stays a pure reader of
one committed JSON, with hard refusals on schema, rule set, style ids and verdict values.
[/lab/live](src/pages/LabLive.tsx) carries the adaptive engine as the tenth pick (`fishai-v1`)
next to the nine styles, replaying the lab's exact discipline (same seeding, pairing and entry
point as the committed matrix) at demo scale, capped at 400 pairs so a browser number never
stands in for the real experiment.

**Running it** (Node ≥ 23.6, as everywhere in this repo):

```bash
npm run adaptive             # the full pre-registered suite → lab-out/adaptive-4300/
                             #   (scripts/adaptive-sim.mjs; --pairs/--workers/... to shrink)
npm run adaptive:analyze -- --run lab-out/adaptive-4300
                             # fold + verdicts → src/lab/data/adaptive-results.json
                             #   (checks the run digest and the benchmark digest before folding)

node scripts/gen-fingerprints.mjs    # recalibrate the classifier (150 mirror games/style)
node scripts/gen-counter-table.mjs   # regenerate the payoff table from matrix v2
```

The launcher's exit code is the health gate: 0 when the [BOT_LAB.md §4.3](BOT_LAB.md) discipline
passes across all five experiments, 1 when the run is void. The analyze step refuses to fold a
run whose `games.jsonl` does not hash to its own manifest, or whose benchmark digest differs from
the committed counter table's source digest — the row v1.0 is judged against and the table it
played from must come from the same matrix, and that is thrown on, not warned about.
