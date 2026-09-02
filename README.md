# FishAI

A bot that plays **Canadian Fish** (Literature), and the simulation lab built to answer one question:

> **Is there a quantitatively superior play style — or do styles just counter each other?**

Four engines now live here. **FishAI v0.5** is the style-conditioned engine that question is
asked of: nine parameterized styles over one shared inference engine, with a traced assistant.
**FishAI v1.0** is the adaptive engine built on top — it classifies what the other seats appear
to be playing from the public log and best-responds off the measured payoff table. Its measured
verdict is a negative result reported with the same care as a positive one: over this roster the
best response to *everything* is Punter, so adaptation converges to the dominant style and then
underpays for its warmup ([ADAPTIVE.md](ADAPTIVE.md)). **FishAI v1.5** is the bounded-memory
ladder — difficulty as a bit budget with an explicit eviction policy, replacing the old noise
knob. Measured: strength is monotone in bits at every rung, the shipped medium tier prices at ≈
32 bits, the old noise-based easy tier prices *below keeping nothing at all*, and mild memory
pressure makes styles *easier* to classify in the whole-ecology design — a refuted prediction
reported as the headline it is ([BOUNDED.md](BOUNDED.md)). **FishAI v2.0** is the concession
layer — what a conceded turn costs, why the off-limits avoidance rule loses, and why inverting
it into a defusal term wins ([CONCESSION.md](CONCESSION.md)).

**What the `/play` table actually seats.** Every bot seat is the v1.0 adaptive engine, and only
v1.0: no bounded-memory budget is built anywhere on the play surface, and there is no
bot-or-difficulty selector at all. But the roster styles it delegates to all carry v2.0's
`defuse: 1` (it sits on the shared `BALANCED` base in `lib/engine/bots/roster.ts`), so the
concession layer's defusal half is live at the table while `conceal` is not. The seat cards say
so: **v1.0 architecture, v2.0 defusal**. v0.5 is retired *from play* — a `/play/table?v=05` link
is refused with an explanation rather than silently redealt — and is untouched everywhere else
in the project.

Nine bot styles, labelled from aggressive to passive, all sharing one identical inference engine so
that *style* is measured rather than *skill*. They play tens of thousands of duplicate-dealt games
against each other, and the resulting payoff matrix is decomposed into its transitive and cyclic
parts. If it is mostly transitive, there is a best style and the lab names it. If it has real cyclic
energy, there isn't one — and the counter-structure is the finding.

**Read the labels with [STYLES.md §6.1](STYLES.md) next to them.** The nine are measurably distinct
— between 0.39% and 2.89% of decisions differ from the Balanced control — but *not along the
declare-threshold axis the aggressive-to-passive naming advertises. Across the range the roster
actually spans, that knob changes nothing at all*, because the inference engine's confidence
estimates turn out to be bimodal. The distinctions are real; the axis they are named after is
inert.

This is deliberately **not** framed as "Stockfish for Fish." That analogy holds for the engineering
(a pure deterministic engine, policy separated from knowledge, SPRT-gated A/B testing) and breaks for
the evaluation: Fish is a six-player, two-team, imperfect-information game with partners who must
coordinate without talking. Ranking systems that assume transitive skill are the wrong tool, and this
lab is built to detect exactly that.

---

## The rule set

FishAI plays the **US student dialect** (`us54`) — the variant played at olympiad camps and in most
American student circles, which differs from the pagat baseline in ways that change the strategy
substantially. It is specified in full, with derived consequences and test vectors, in
[RULES_US54.md](RULES_US54.md).

| | `us54` (this repo) | pagat 48-card baseline |
|---|---|---|
| Deck | **54** — standard 52 + two jokers | 48 (8s removed) |
| Sets | **9** half-suits of 6, the 9th being `8C 8D 8H 8S XR XB` | 8 |
| Hand | 9 cards | 8 |
| Declaring | **Any time, out of turn**, in a declare window | On your own turn only |
| Wrong declare | **The opponents score the set** | The set is *void* — nobody scores |
| Game ends | **The moment a team is awarded 5 sets** | When all sets are resolved |
| Ties | **Arithmetically impossible** | Possible (4–4) |

Two of those rows do more work than they look like.

**Abolishing the void flips the sign of every risk calculation.** A bad declare used to burn the set
(0 for everyone); now it gifts it — −1 for you and +1 for them, a two-point swing in a race to five.
Every threshold tuned against the 48-card game is therefore too loose, and the styles here are tuned
from scratch.

**Ties cannot happen**, and that is a theorem rather than a convention: every resolved set is awarded
to exactly one team, there are nine of them, and if neither team reached five then both hold at most
four — totalling at most eight. Contradiction. A clinch is guaranteed.

---

## The engine

Pure TypeScript, no dependencies, fully deterministic: the same seed produces a byte-identical game.
It supports both rule sets behind one config, with no mutable module-level state, so two games on
different rules can run concurrently in the same process without touching each other.

Bots consume **only** `SeatView` — the exact public-information payload a human player would see —
and a test enforces that no other hand is reachable. Cheating is structurally impossible rather than
policed, which is what makes it safe to run a third-party bot against this engine.

The engine is adversarially audited. Highlights from the audit record:

- A **250-game lockstep differential** against the pre-variant engine (8,155 reduce steps, full state
  JSON compared after every action, 0 mismatches) proving the 48-card path is unchanged.
- **130,480 deliberately-illegal actions** fired to confirm no error code shifted.
- A **10,000-game fuzz gate** under `us54` asserting every game terminates, every winner is a clinch
  at exactly five sets, no tie is ever emitted, and invariants hold at every step.

### One thing worth knowing about Fish

The game can **livelock**. An adversarial policy that always takes the last legal ask will ping-pong
misses between two seats forever, with the position repeating exactly — no rule broken, every state
having a legal move. This is a property of Fish itself, not of this variant; it reproduces in the
48-card game too. Real play escapes it because information accumulates until declaring becomes
compelling.

The consequence is architectural: **whole-game termination is a property of the acting policy, not of
the rules.** The simulator's step cap is load-bearing and instrumented, and any third-party bot is
assumed capable of livelocking — the host enforces the cap, never the guest.

---

## Layout

```
lib/engine/        the rules engine — pure, deterministic, both rule sets
lib/engine/bots/   inference (knowledge state) + the parameterized policy
lib/lab/           the simulation runner and the analysis pipeline
src/               the results site — a pure reader of one committed artifact
tests/             engine, bot, and lab test suites
botpkg/            the FishLab bot-package adapter (see "Playing it elsewhere")
```

Documents:

| | |
|---|---|
| [RULES_US54.md](RULES_US54.md) | The rule set, derived consequences, test vectors |
| [RULES.md](RULES.md) | The 48-card pagat baseline, for comparison |
| [STYLES.md](STYLES.md) | The nine styles, the `StyleParams` vector, and §6's two measured caveats on the roster |
| [BOT_LAB.md](BOT_LAB.md) | Experimental design — duplicate deals, metrics, Nash averaging, α-Rank, exploitability |
| [CONTAINMENT.md](CONTAINMENT.md) | The contained-book result: why an unclaimed team-held book is a resource |
| [ADAPTIVE.md](ADAPTIVE.md) | FishAI v1.0 — observe → classify → best-respond, the dominance degeneracy, and the measured verdict |
| [BOUNDED.md](BOUNDED.md) | FishAI v1.5 — memory in bits, the ladder that prices the tiers, and the P7/P8 attribution record |
| [CONCESSION.md](CONCESSION.md) | FishAI v2.0 — what a conceded turn costs, why the off-limits rule loses, and why inverting it wins |
| [ASKING.md](ASKING.md) | Who to ask and for what: the inference soundness audit, ask calibration, and the full ask matrix |
| [CROSSPLAY.md](CROSSPLAY.md) | FishAI played inside a third-party engine: the foreign-engine replication of defusal, and **27.08% against SESTINA v1.0** — below their whole published lineage. Its §9 was corrected after a bridge defect, a powerless control and four pooled counters were found in the first version |
| [WHY-FISHAI-LOSES.md](WHY-FISHAI-LOSES.md) | The account of the cross-play deficit: FishAI declares as accurately as the frontier (98.42% vs 98.46%) and takes **9.30 events to prove a set SESTINA proves in 2.92**. 139 cells, 166,800 games |
| [MONET.md](MONET.md) | The roadmap from **Monet v0.1 to v1.0**, whose goal is to beat SESTINA. States plainly what the measured ceilings imply about the 22.92 points to find |
| [SITE_SPEC.md](SITE_SPEC.md) | The results site |

The `papers/` directory carries nine research papers in LaTeX (v0.5, v1.0, v1.5, v2.0, the
contained-book negative result, the inert axis, style observability, inference from a miss, and
the detection floor), each compiling standalone under pdflatex with every number traced to a
committed artifact by digest. The site presents all nine at `/papers` — each with the question
it asks, its headline finding, its abstract, and links to the PDF, the source, and the lab page
carrying its evidence.

**The built PDFs are committed, under `public/papers/`, and must be rebuilt when a `.tex`
changes.** `npm run papers:build` compiles every paper twice, fails the build if any log
finishes with an undefined reference or citation, copies the PDFs into `public/` for the site to
serve, and rewrites `src/pages/papers-manifest.json` with the page count and byte size `/papers`
prints beside each link. A `.tex` edited without a rebuild leaves the site serving the old paper.

## Running it

Requires Node ≥ 23.6 (the engine is erasable-syntax TypeScript that Node strips natively).

```bash
npm install
npm test          # engine, bot, and lab suites
npm run lab       # the style-vs-style simulation (matrix)
npm run adaptive  # the FishAI v1.0 experiment suite (gauntlet, mixed screen, oracle, classifier)
npm run bounded   # the FishAI v1.5 experiment suite (ladder, tiers, evidence age, accuracy)
npm run papers:build  # compile papers/*.tex into the committed public/papers/*.pdf
npm run dev       # the results site — /lab report, /play solo table, /lab/live in-browser sims
```

---

## Playing it elsewhere

The engine can be exported as a **FishLab bot package** — a zip that a third-party host unpacks
and seats over a line-delimited JSON protocol, with no shared code between the two projects.

```bash
npm run botpkg        # -> dist/botpkg/ and dist/bass-2.0.zip
npm run botpkg:check  # 40 games over real stdio + the branches those games cannot reach
```

The build strips the type annotations from the runtime import closure of
`lib/engine/bots/index.ts` (through Node's own stripper, the same one `node file.ts` uses) and
rewrites the import specifiers; nothing is bundled, rewritten or re-tuned, so the packaged
engine differs from the source by type annotations alone. The adapter that fronts it lives in
[botpkg/](botpkg/) and decides nothing — all it does is build a `SeatView` out of the host's
state object and translate the `GameAction` that comes back.

`npm run botpkg:check` is the guarantee that matters: it plays complete games with the packaged
bot in three child processes, refereed by this repository's own engine wearing the foreign
host's half-suit numbering and card names, and asserts **move-for-move equality** with what
`decide` plays on the same position. Two things do not survive the trip, and both are stated at
[botpkg/README.md](botpkg/README.md): that host publishes no true holders on a *failed* declare
(this engine does), and its forced endgame has no counterpart in `us54`.

The exported seat's one deliberate difference from the in-repo default is its adaptive anchor —
Punter rather than Balanced, which is [ADAPTIVE.md §7.1](ADAPTIVE.md)'s own named remedy for the
warmup toll §6.1-6.2 measure. The lab declines that remedy because conceding the dominance
theorem is the thing it exists to report; a bot playing a match has no such obligation.

---

## Related

The teaching-and-play side of this project — the rules walkthrough, practice drills, and live
multiplayer table — lives separately in
[Canadian-Fish-Demo](https://github.com/MeagerPotato/Canadian-Fish-Demo). This repository shares
none of that code; it carries the engine, the bots, the lab, and the static site that reports the
lab's results. Documents here cite that repository by file and line where a rule or a number was
sourced from it — those are citations to a public repository, not a dependency.

## License

MIT — see [LICENSE](LICENSE).
