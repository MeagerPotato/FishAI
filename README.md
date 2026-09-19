# FishAI

Bots for **Canadian Fish** (Literature), the six-player team card game, and the simulation lab
that measures them. FishAI is the project, and Bass, Monet and ATHENA are its bot lines. The site is
**https://fishai.allenkh.com**. This README points to where things are; the documents and
papers hold the explanations.

## The bot lines

| Line | Status | What it is | Document |
|---|---|---|---|
| **Bass** v0.5–v2.0 | frozen | Nine play styles over one shared inference engine (v0.5), an adaptive layer that classifies each seat and best-responds (v1.0), memory as a bit budget for difficulty (v1.5), and a defusal term (v2.0). Its papers are titled "FishAI v0.5" to "FishAI v2.0". | [STYLES.md](STYLES.md), [ADAPTIVE.md](ADAPTIVE.md), [BOUNDED.md](BOUNDED.md), [CONCESSION.md](CONCESSION.md) |
| **Monet** v0.1–v1.0 | current: **v1.0**, published 2026-09-18 | Starts from Bass v2.0 and aims to beat SESTINA v1.0. It asks with a small network that imitates SESTINA's choice, which a second network trained on paired play-outs of what wins can overrule. Its belief is hand-built constraint tracking with a fitted card-by-seat table, its declarations are hand-written, and it does no search at play time. | [MONET.md](MONET.md) |
| **ATHENA** | next | Learns its own play from game outcomes, from scratch, to beat Monet v1.0. | [ATHENA.md](ATHENA.md) |

Each frozen Bass version is an annotated tag: `bass-v0.5`, `bass-v1.0`, `bass-v1.5` and `bass-v2.0`.
Build an old arm from its tag, never from today's roster, because the roster's shared base carries
v2.0's `defuse` term. Monet versions are named specs in
[lib/engine/bots/monet.ts](lib/engine/bots/monet.ts). `v1.0` is v0.54's vector under a second name.

## Headline results

- **Monet v1.0 against SESTINA v1.0**, in FishLab's engine: 58.38% of 14,400 games on twelve fresh
  seeds, lowest seed 56.58%. It also beat FishLab's five earlier bots, v0.2 to v0.6 (84.43 / 81.20 /
  56.91 / 57.92 / 58.24%), and an independently built adapter reproduced every game byte for byte.
  This was the pre-registered read of MONET.md §3.9's six conditions ([§3.8ba](MONET.md)). Condition 5
  passed on the registration's own rules after its locked reader printed NOT MET, and the owner
  accepted it on those rules the same day.
- **The starting point:** Bass v2.0 won 27.08% of 7,200 games against SESTINA v1.0, which places it
  between FishLab's v0.3 and v0.4 ([CROSSPLAY.md](CROSSPLAY.md) §9).
- **Why Bass lost:** it declared as accurately as SESTINA (98.42% against 98.46%). But it took 9.30
  events to prove a set that SESTINA proved in 2.92 ([WHY-FISHAI-LOSES.md](WHY-FISHAI-LOSES.md)).
- **Is there a best style?** On Bass's nine-style roster there is: the lab's verdict is that Punter
  dominates, with all four of [BOT_LAB.md](BOT_LAB.md) §4.4's criteria holding. So Bass v1.0's
  adaptation converges to Punter and pays for its warmup (−0.0136 ± 0.0043 against pure Punter),
  and perfect classification is worth exactly zero ([ADAPTIVE.md](ADAPTIVE.md)).
- **Concession:** refusing to ask opponents who would punish a conceded turn loses 4.5–11.7 points
  of win rate. Asking them to take the card their threat rests on gained +1.50 and +1.65 sets per
  duplicate pair on two held-out banks, and shipped as Bass v2.0 ([CONCESSION.md](CONCESSION.md)).

## The rule set

FishAI plays the US student 54-card dialect, `us54`, which is specified in
[RULES_US54.md](RULES_US54.md). The engine also supports the 48-card pagat baseline
([RULES.md](RULES.md)), and the config chooses between them.

| | `us54` | `pagat48` |
|---|---|---|
| Deck | 54: the standard 52 plus two jokers | 48 (the four 8s removed) |
| Sets | 9 half-suits of 6, the ninth being `8C 8D 8H 8S XR XB` | 8 |
| Hand | 9 cards | 8 cards |
| Declaring | any time, out of turn, in a declare window | on your own turn only |
| Your team holds all six, one misassigned | the opponents score the set | the set is void |
| Game ends | the moment a team has been awarded 5 sets | when all 8 sets are resolved |
| Ties | impossible | possible (4–4) |

## The site and the papers

| Route | What is there |
|---|---|
| `/play` | You and five bots. A menu picks which bot takes the five seats (Monet v1.0 or Bass v2.0, which is the default), and an optional assistant is available. `/play/room` seats six people at one shared table. |
| `/lab` | The style report and its matrix, game replays, the Bass v1.0 and v1.5 results (`/lab/adaptive`, `/lab/bounded`), and in-browser simulations (`/lab/live`). |
| `/papers` | The twelve papers, each linking to its PDF and its LaTeX source. Paper 12 also has an Overleaf project. |

The pages carry titles, figures, tables and controls, and the explanations are in the papers.
`papers/` holds the twelve LaTeX sources: the Bass system papers (01–04), five focused results
(05–09) and three cross-engine results (10–12). Paper 12, [papers/monet-v1.tex](papers/monet-v1.tex),
is Monet v1.0's final paper. The built PDFs are committed under `public/papers/`, so after editing a
`.tex`, run `npm run papers:build` (it needs `pdflatex`). It compiles each paper twice, fails on an
undefined reference, copies the PDFs and rewrites `src/pages/papers-manifest.json`.

## Running it

Requires Node ≥ 23.6 (`engines`): the engine is erasable-syntax TypeScript that Node runs natively.

```bash
npm install
npm run dev             # the site
npm test                # vitest: engine, bots, lab, play, room
npm run typecheck && npm run lint
npm run build           # what the Vercel build runs (vercel.json)
npm run lab             # the duplicate-deal style lab (then npm run analyze)
npm run adaptive        # the Bass v1.0 suite (and adaptive:analyze)
npm run bounded         # the Bass v1.5 suite (and bounded:analyze, bounded:single, bounded:single:analyze)
```

The repository has no CI workflows, and the Vercel build typechecks but runs no tests: run the tests
and the linter yourself before merging.

## Layout

```
lib/engine/          the rules engine: pure, deterministic, no runtime dependencies, both rule sets
lib/engine/bots/     inference, the style roster, Bass's adaptive and bounded layers, the Monet registry;
                     bots see only the public SeatView (tests/bots/public-view.test.ts enforces it)
lib/engine/search/   the determinized search arm measured on the Monet ladder (not used by v1.0)
lib/lab/             the duplicate-deal runner and analysis (Nash, α-Rank, Hodge, exploitability)
scripts/             launchers, fits, builds, and scratch probes (scripts/PROBES.md)
src/, tests/         the site (/lab, /play, /papers) and the vitest suites
papers/              LaTeX sources; PDFs in public/papers/
botpkg/              the FishLab bot-package adapter
supabase/            the shared-room backend, which runs a synced copy of the rules engine
```

## Documents

| Document | What it covers |
|---|---|
| [RULES_US54.md](RULES_US54.md) | The `us54` rule set: the decision table, the declare window, termination, and test vectors |
| [RULES.md](RULES.md) | The 48-card pagat baseline |
| [BOT_LAB.md](BOT_LAB.md) | The lab's experimental design: duplicate deals, metrics, Nash, α-Rank, and exploitability |
| [STYLES.md](STYLES.md) | Bass's nine styles under `us54`, the `StyleParams` vector, and §6's measured caveats |
| [CONTAINMENT.md](CONTAINMENT.md) | The contained book: a set one team wholly holds cannot be taken, and a holder's sure-miss ask into it passes the turn to a chosen opponent. Measured, that pass wins nothing (STYLES.md §6.3.6, paper 05) |
| [ADAPTIVE.md](ADAPTIVE.md) | Bass v1.0: observe, classify and best-respond, and why it converges to Punter |
| [BOUNDED.md](BOUNDED.md) | Bass v1.5: memory in bits, and the ladder that prices the difficulty tiers |
| [CONCESSION.md](CONCESSION.md) | Bass v2.0: what a conceded turn costs, why the off-limits rule loses, and why its inverse wins |
| [ASKING.md](ASKING.md) | Who to ask for what: the inference soundness audit, ask calibration, and the ask matrix |
| [CROSSPLAY.md](CROSSPLAY.md) | Bass inside FishLab's engine: the lab bots, and 27.08% against SESTINA v1.0 (§9, corrected) |
| [WHY-FISHAI-LOSES.md](WHY-FISHAI-LOSES.md) | Why Bass lost that match: declare accuracy at parity, and proof three times slower |
| [MONET.md](MONET.md) | The Monet ladder from v0.1 to v1.0: each rung's registration and record, and §3.9's acceptance test, which v1.0 met on 2026-09-18 (§3.8ba) |
| [ATHENA.md](ATHENA.md) | The roadmap for ATHENA: it learns its own play from game outcomes, from scratch, to beat Monet v1.0 |
| [SITE_SPEC.md](SITE_SPEC.md) | The site's routes, design system, and the rule that pages stay concise |

## Playing it elsewhere

`npm run botpkg` exports **Bass v2.0**, the adaptive engine anchored on Punter (not Monet), as a
FishLab bot package in `dist/botpkg/` and `dist/bass-2.0.zip`. The build strips the type annotations
from the runtime import closure of `lib/engine/bots/index.ts` with Node's own stripper and renames the
`.ts` import specifiers. Nothing is bundled or otherwise rewritten. After the build,
`npm run botpkg:check` plays 200 games over real stdio, checks each packaged move against the in-repo
`decide`, and drives the two protocol branches a `us54` game never reaches.
[botpkg/README.md](botpkg/README.md) covers the environment knobs and the three protocol differences.

## Related and license

- [Canadian-Fish-Demo](https://github.com/MeagerPotato/Canadian-Fish-Demo) is a separate app with
  live multiplayer rooms and practice drills. Documents here cite it by file and line.
- [FishLab](https://github.com/dylann4500/FishLab) is the third-party engine that SESTINA v1.0 runs
  in. It has no license, so nothing from it is copied here. The bridge used for the cross-engine
  reads is not committed ([MONET.md](MONET.md) §9).
- FishAI is MIT-licensed. See [LICENSE](LICENSE).
