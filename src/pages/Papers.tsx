/**
 * `/papers` — the nine papers, and the questions the project has actually put to a measurement.
 *
 * Everything on this page is a pointer at something the reader can open: a PDF built from the
 * committed `.tex` by `npm run papers:build`, the LaTeX source on GitHub, and the lab page that
 * carries that paper's evidence. Nothing here is a number this page invented — every figure is
 * the paper's own, and the lab link beside it is where the same figure is rendered from the
 * committed artifact.
 *
 * ## The arc, and why the order is not chronological-by-importance
 *
 * v0.5 → v1.0 → v1.5 → v2.0 first, because each answers the question the one before it raised:
 * is any style superior (yes), does reading the table beat committing to the winner (no, and it
 * costs), what should difficulty be if not noise (bits), and what is an ask actually for (three
 * things at once, and the engine only ever scored one). Then the five focused results, which are
 * the load-bearing caveats of the first four broken out and measured to the end.
 *
 * ## Negative results are findings here
 *
 * Seven of the nine headline results are negative or refutations, and they are printed in the
 * same voice as the positive ones — no hedging verb, no "unfortunately", no framing as an
 * ablation of a success. That is the series' whole method: the contained book is a proved theorem
 * worth nothing, the declare axis is a knob that was never reached, adaptation over this roster is
 * worth less than nothing, the avoidance rule the owner asked for loses to not having it, the
 * inference he worried about is one the engine structurally cannot make, and two of this
 * project's own published nulls turn out to be non-measurements rather than zeros. A page that
 * softened those would be misreporting the project.
 *
 * Two of the nine now carry addenda rather than corrections — v0.5 and v1.5 were both re-measured
 * after the engine gained a defusal term every roster style carries. Where an addendum weakens a
 * headline, the entry below says so in the same line as the headline, not in a footnote.
 *
 * ## The accent budget (SITE_SPEC.md §2.1)
 *
 * Zero accent-TEXT spends. The section badges are amber tabs, which are free, and the answered
 * / partly / open marks are the lab's colour-free `.mark` shapes plus the word itself. A page
 * that is entirely links has no room for a hue that means something.
 *
 * ## The PDF sizes
 *
 * Page counts and byte sizes come from `papers-manifest.json`, which `scripts/build-papers.mjs`
 * rewrites on every full build. They are read defensively: a missing or malformed entry drops
 * the annotation rather than printing a stale number or breaking the page.
 */

import { useLocation } from 'react-router-dom'
import {
  Board,
  Button,
  Eyebrow,
  Hairline,
  MaskedLines,
  Reveal,
  Section,
  SectionHead,
  TextLink,
  buttonRow,
} from '../components/index.ts'
import { caseFromSearch, type ArtifactCase } from '../lab/case.ts'
import { LabContents, type LabSection } from '../lab/ui/LabContents.tsx'
import { LabShell, withCase } from '../lab/ui/LabShell.tsx'

/**
 * This page is a long index — nine entries and then the topics — so it carries the same
 * contents rail the long lab pages do.
 * Every id below exists on a `<Section>` further down; the component asserts nothing, so a
 * renamed section would silently break the jump — keep the two in step.
 */
const CONTENTS: readonly LabSection[] = [
  { id: 'how-to-read', label: 'How to read this page', note: 'what each entry carries' },
  { id: 'series', label: 'The series', note: 'v0.5, v1.0, v1.5, v2.0' },
  { id: 'results', label: 'Focused results', note: 'five caveats, measured' },
  { id: 'topics', label: 'Research topics', note: 'answered and open' },
  { id: 'sources', label: 'Sources' },
]
import s from '../lab/ui/lab.module.css'
import manifestRaw from './papers-manifest.json?raw'
import p from './Papers.module.css'

const REPO = 'https://github.com/MeagerPotato/FishAI'
const SOURCE_BASE = `${REPO}/blob/main/papers`

/* ---- the generated manifest ---------------------------------------------------------------- */

interface PdfStat {
  pages: number
  bytes: number
}

/**
 * Read the build manifest without trusting it. It is generated, but it is also *committed*, so
 * it can be edited by hand, be left behind by a partial build, or arrive from a merge. Anything
 * that does not parse into `{ pages, bytes }` positive integers is dropped, and the link then
 * renders without its annotation — a link that says less, never a link that lies.
 */
function readStats(raw: string): Record<string, PdfStat> {
  const out: Record<string, PdfStat> = {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return out
  }
  if (typeof parsed !== 'object' || parsed === null) return out
  const papers = (parsed as { papers?: unknown }).papers
  if (typeof papers !== 'object' || papers === null) return out
  for (const [slug, value] of Object.entries(papers as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue
    const { pages, bytes } = value as { pages?: unknown; bytes?: unknown }
    if (typeof pages !== 'number' || typeof bytes !== 'number') continue
    if (!Number.isInteger(pages) || !Number.isInteger(bytes) || pages <= 0 || bytes <= 0) continue
    out[slug] = { pages, bytes }
  }
  return out
}

const PDF_STATS = readStats(manifestRaw)

/** `PDF · 18 pages · 421 KB`, or plain `PDF` when the manifest has nothing to say. */
function pdfNote(slug: string): string {
  const stat = PDF_STATS[slug]
  if (!stat) return 'PDF'
  return `PDF · ${stat.pages} pages · ${Math.round(stat.bytes / 1024)} KB`
}

/* ---- the papers ---------------------------------------------------------------------------- */

interface Paper {
  /** The `.tex` basename, which is also the PDF name and the anchor id. */
  slug: string
  serial: string
  /** `System paper` / `Focused result` — what kind of document this is. */
  kind: string
  title: string
  /** One plain sentence a non-specialist understands. No jargon, no numbers. */
  question: string
  /** The headline finding WITH its measured numbers. This is the line the entry exists for. */
  finding: string
  /** Drawn from the paper's own abstract — this project's writing, quoted or condensed. */
  abstract: string
  method: string
  /**
   * Where this paper's evidence lives. `href` and `hash` are kept apart because `?case=` has to
   * land BEFORE the fragment, and a single pre-joined string would put it after.
   *
   * Six of the nine point at a lab page that renders the evidence from the committed artifact.
   * The other three cannot: the concession layer, the ask matrix and the detection floor have no
   * lab page, and their evidence is the committed markdown itself. Those set `external`, which
   * does two things — it skips `withCase`, because `?case=` means nothing off-site, and it prints
   * `pathLabel` instead of the raw URL, so the link caption stays the same shape as the others
   * rather than becoming a 60-character GitHub path.
   */
  evidence: {
    href: string
    hash?: string
    label: string
    external?: true
    pathLabel?: string
  }
}

const PAPERS: Paper[] = [
  {
    slug: 'fishai-v05',
    serial: '01',
    kind: 'System paper · v0.5',
    title: 'FishAI v0.5: Measuring Play Style Without Skill in a 54-Card Literature Variant',
    question:
      'Is one way of playing Fish actually better than the others, or do the styles just beat each other in a circle?',
    finding:
      'One style wins outright, and still does after the whole roster changed under it and again after a rules bug was fixed beneath it. Punter clears all four criteria written down before the tournament ran, over 309,600 games in 36 cells, and clears them on both re-measurements: mean score .5829 → .5684 → .5678, maximin .5190 → .5102 → .5107 above the half, cyclic energy .0112 → .0172 → .0174 against a .15 threshold. The rock-paper-scissors structure the styles were expected to form is simply not there in any of the three runs. The fourth criterion is where the movement is, and the addenda say so plainly: exploitability .0025 → .0525 → .0625 against a rivals’ median that moved .0444 → .0594 → .0637, which is a tie where the paper’s prose leaned on an eighteen-fold gap. The turn-pass correction itself is invisible here — no cell of the 36 moves two of its own standard errors, mean absolute move .0016 — which is a finding about the instrument, not a licence to call the bug harmless.',
    abstract:
      'Nine parameterized play styles share one identical full-strength inference engine, so that differences in outcome measure style rather than skill. The roster is evaluated in a full-precision duplicate-deal round-robin — 36 cells, 4,300 mirrored deal pairs per cell, per-cell standard error at most .005 — and the payoff matrix is analysed with mean score, maximin, Bradley–Terry, Nash averaging, α-Rank and a Hodge decomposition into transitive and cyclic parts. Two measured caveats qualify the headline and are reported as first-class results: the declare-threshold axis the roster’s labels advertise is inert across the range the roster spans, and the card-hoarding style’s signature benefit was derived, implemented, and measured to be worth nothing.',
    method:
      'Style, not skill: every style is the same engine with a different policy layer, and a decision-divergence instrument verifies each is measurably distinct from the control. Duplicate deals with shared seed sets and seat rotation; Benjamini–Hochberg correction across all 36 cells; a verdict rule fixed in advance under which “no dominant style, here is the counter-structure” would have been a first-class outcome.',
    evidence: { href: '/lab', label: 'The style report — roster, matrix and verdict' },
  },
  {
    slug: 'fishai-v10',
    serial: '02',
    kind: 'System paper · v1.0',
    title: 'FishAI v1.0: When Best-Response Adaptation Is Worth Less Than Nothing',
    question:
      'If one style is the best, does a bot that watches its opponents and counters them beat a bot that just plays the best style every time?',
    finding:
      'No — it does measurably worse than nothing, and the reason is a theorem. Punter’s row of the measured counter table dominates every column and expected payoff is linear in belief, so the warm best response is Punter under every possible read: the adaptive policy provably collapses into the static winner. It then underpays for the warmup it needed to get there — below the paired Punter benchmark in all nine gauntlet cells, and losing a truly-paired 24-composition screen. An oracle ablation prices perfect classification at exactly .0000: handed the true styles, the agent plays move-for-move identical games. On the regenerated artifact the theorem and the oracle are untouched, and the margins are weaker rather than gone: the screen reads −.0074 ± .0042 where it read −.0136 ± .0043, so its interval now includes zero, and no single gauntlet cell still clears the Bonferroni bound. Nine of nine cells remain below the benchmark, which is what the prediction was registered to test.',
    abstract:
      'The agent is built honestly — fourteen behavioural features certified by the public log alone, calibrated diagonal-Gaussian posteriors per opponent seat, best response over the measured 9 × 9 counter table, delegation to the unchanged style-conditioned engine, all under determinism and statelessness constraints that force co-located seats to identical reads. The answer is a theorem plus a measurement. The classifier has real but bounded skill — 22.0% end-of-game top-1 against an 11.1% chance floor — and under dominance none of it can matter. Adaptation over this roster is worth less than nothing, and every knob that repairs the tax does so by collapsing the policy into the static dominant style.',
    method:
      'Four predictions registered before the run, two of them refuted. A nine-cell gauntlet at 4,300 duplicate pairs per cell, a truly-paired seed-clustered mixed-population screen over 24 compositions, an oracle ablation handing the agent the true styles, and a classifier-accuracy experiment on held-out cross-play games.',
    evidence: { href: '/lab/adaptive', label: 'The adaptive engine — the whole suite' },
  },
  {
    slug: 'fishai-v15',
    serial: '03',
    kind: 'System paper · v1.5',
    title: 'FishAI v1.5: A Bit-Budget Memory Ladder as an Honest Difficulty Axis',
    question:
      'How do you make a bot easier to beat without making it stupid — what should a difficulty setting actually be?',
    finding:
      'Cap what it can remember, measured in bits, and the dial tells the truth. Set-share is non-decreasing in bits at every one of the nine adjacent rungs, and the shipped tiers carry prices: medium was worth 32.2 bits [30.8, 35.1], and the old noise-based easy tier measures below the zero-bit floor, so a memoryless bot that reasons beats a remembering bot that dices. The headline refutation runs the other way from the prediction: memory pressure makes styles easier to classify, not harder. On the regenerated artifact every verdict survives and the ladder is steeper: the zero-bit floor drops .1313 → .0953 and medium reprices 32.2 → 18.0 bits [17.2, 18.7]. That is the concession layer, not the rules fix and not memory — an isolation run moves no rung by more than .0003 — and it means the tier is now measured against a ruler carrying a mechanism the tier itself does not have. The two figures answer different questions rather than disagreeing about one. An addendum then re-measures the arm after the engine gained a defusal term it inherits: against the same pre-concession v1.0, the committed −0.1255 ± 0.0590 becomes +1.4065 ± 0.1399 and +1.5290 ± 0.1418 on two banks — a different question, not a correction of that cell, which a per-pair audit shows was measured clean. And because the term’s licence scan reads the full public log while retiring only against budgeted knowledge, it partly escapes the budget: holding the opponent fixed, it is worth +0.9560 ± 0.1858 and +0.8030 ± 0.1879 at zero bits. The updated ladder is therefore not a pure memory ladder. The original one, measured before the term existed, is unaffected.',
    abstract:
      'Until now the engine’s easy tier was a six-event memory window plus a 25% uniform blunder rate — a difficulty knob that is neither monotone, interpretable, nor human-shaped. v1.5 replaces it with memory capacity capped in bits under a fixed fact tariff (2 bits per card fact, 1 per basis fact), with facts ranked by contestability rather than recency, implemented as a stateless re-derivation from the full public log at every decision. Evidence-age analysis finds the predicted forgetting signature where the budget bites — half-lives of 5, 13, 17, 33 and 49 events, rising with bits — while the noise tier is cliff-edged at its window and not flat inside it. A single-seat follow-up registered after review, and re-run at 300 seeds after its 50-seed pilot was priced at 52% power, confirms the read seat’s own signature flat at matched read count.',
    method:
      'Eight predictions with verdict rules fixed before their runs; four verdicts came back MIXED and are printed as MIXED. Ten budgets replay one identical 3,000-seed list in both orientations, so adjacent-rung deltas are paired per seed. The correction of record — an underpowered pilot’s overclaim, caught by its own review — is retained in the artifact beside the run that settled it. The addendum is exploratory and marked as such: 2,000 duplicate pairs per cell, on banks held out from the original ladder, with a per-pair provenance audit against a pre-concession export.',
    evidence: { href: '/lab/bounded', label: 'The bounded-memory ladder — all eight verdicts' },
  },
  {
    slug: 'fishai-v20',
    serial: '04',
    kind: 'System paper · v2.0',
    title: 'FishAI v2.0: The Three-Sided Ask — Refuting an Avoidance Rule and Shipping Its Inverse',
    question:
      'If some opponents would punish you badly for handing them the turn, should you avoid asking them?',
    finding:
      'No — avoidance loses, and the opposite move wins. A rule that penalises asks aimed at dangerous opponents costs 4.5 to 11.7 points of win rate and gets monotonically worse the harder it is driven (−0.52 to −1.61 sets per duplicate pair), while an information-free perturbation of the same size is free. The reason is structural: the holding-licence rule makes threat and opportunity the same fact, corr(threat, best available hit probability) = +0.249 over 33,595 observations, with mean best p of 0.471 at high-threat seats against 0.326 elsewhere. Inverting the prescription — ask into the set the dangerous seat has published a basis in, taking back the card its reach rests on — is worth +1.43 and +1.58 ± 0.32 sets per duplicate pair on two held-out banks, and +1.55 to +1.75 inside a third party’s engine against their bots with one knob moved.',
    abstract:
      'Every ask in this game is three things at once: a bet on a card, a broadcast — the holding licence of the us54 dialect makes an ask publish that the asker holds a card of the named set — and a concession, because a miss hands the turn to whoever was asked. The engine had only ever scored the first. The project’s owner asked for “off-limits” reasoning: identify the opponents who would punish a conceded turn, and refuse to ask them. Implemented as a penalty on the miss branch, it loses. The cause is the paper’s central idea, and it is what makes the inverse work: because the licence makes threat and opportunity the same fact, the seat you most want to avoid is the seat you most want to ask.',
    method:
      'Every mechanism is a single-term ablation on duplicate deals — each seeded deal played in both orientations — against a control that reproduces the shipped decision function byte-for-byte when the mechanism is off, paired with an information-free null of matched magnitude to separate the effect of the information from the effect of the disturbance. Banks are held out from the tuning bank; results are re-measured on the shipped implementation rather than the prototype; and the same policy is run as a guest inside an independent third-party engine against that project’s own bots, with defusal as the only knob moved. Every null is checked against the instrument’s own detection floor, which reclassifies two of this paper’s nulls as non-measurements.',
    evidence: {
      href: 'https://github.com/MeagerPotato/FishAI/blob/main/CONCESSION.md',
      label: 'The concession record — every arm, and the four refutations',
      external: true,
      pathLabel: 'github.com/…/CONCESSION.md',
    },
  },
  {
    slug: 'contained-book',
    serial: '05',
    kind: 'Focused result',
    title: 'The Contained Book: An Absorbing Resource Measured to Be Worth Nothing',
    question:
      'When all six cards of a set already sit with one team, nobody can take it from them. Is the free move that fact gives them worth playing?',
    finding:
      'No. The absorbing property is proved under both rule sets the engine supports — correcting, on the way, the project’s own earlier claim that it fails under the 48-card baseline — and the turn-pass it licenses is renewable, aimable, and after its first use publishes nothing: 95–98% of its uses reveal no new information. Its measured value is zero. No style moves two standard errors from .5 in the paired mirror, and a full 36-cell × 4,300-pair re-run leaves the verdict, the ranking and the cyclic structure unchanged, with the heaviest intended user shifting −.0018 ± .0014. The arithmetic says why: at this roster’s hit rate a conceded turn is worth about one card, and one card does not win races to five.',
    abstract:
      'A half-suit whose six cards all sit with one team is an absorbing state: the opponents can neither ask into it nor take it by declaring, so leaving it unclaimed is a resource rather than an oversight. A holder may deliberately ask into the set, which is a guaranteed miss, and a miss hands the turn to an opponent of the asker’s choosing without moving a card. We prove the absorbing property from the rules of both rule sets, derive a trigger inequality that prices the move in cards against the ordinary ask it would displace, implement it under a strict no-convention discipline, and measure it at three scales. The mechanism fires, fires for exactly the reasons the derivation gives, and aims where the style asks. We report this as a model negative result — about the move at this level of play, not about the theorem.',
    method:
      'Three scales: per-decision mirrors, 1,200 duplicate-deal pairs per style, and a full 36-cell × 4,300-pair round-robin re-run — the matrix the lab now serves as v2. The move was implemented before it was measured, and the derivation that prices it was written before either.',
    evidence: { href: '/lab/matrix', label: 'The full matrix — the v2 re-run with the move live' },
  },
  {
    slug: 'inert-axis',
    serial: '06',
    kind: 'Focused result',
    title: 'The Inert Axis: When a Style Parameter Is Wired, Swept, and Never Reached',
    question:
      'The nine styles are named from aggressive to conservative by how sure they need to be before declaring. Does that setting change anything they do?',
    finding:
      'Not anywhere the roster actually sits. Across the band the roster spans — every shipped bar at 0.775 or above — the knob produces zero divergent decisions, in populations of up to 275,380 decisions. It is not an unreachable branch: speculative declares fire constantly, 171 against 138 certain ones in a single 40-game population, and below the band the knob is demonstrably alive (1.2968% of decisions change at 0.50; 892 change at a threshold of zero). The mechanism is bimodal confidence — a plan sits either well above ~0.975 or well below ~0.775, almost never between — so every threshold inside the band selects the identical set of declares.',
    abstract:
      'Direct decision-level instrumentation — replaying real games and handing two policy vectors the identical observation and random seed at every decision point — shows that across the range the roster actually spans this knob changes nothing. We describe the instrument, the finding, the mechanism, and the repairs: a relocated behavioural gate, a relabelled narrative, a regression test asserting that no roster vector is inert, and a search-side statistic that counts byte-identical candidates. The general lesson is methodological: parameter sweeps that report only outcomes cannot distinguish “no effect” from “never consulted.” Decision-level divergence is the honest unit.',
    method:
      'Exact comparison of two policies’ actions on identical observations and seeds at every decision point of real games, swept across thresholds at two stages — a 275,380-decision pilot audit and a roster-stage sweep — which agree exactly on the breakpoint.',
    evidence: {
      href: '/lab',
      hash: '#roster',
      label: 'The roster — the per-style divergence figures',
    },
  },
  {
    slug: 'style-observability',
    serial: '07',
    kind: 'Focused result',
    title: 'What a Public Log Reveals: Observing Play Style in Literature (Canadian Fish)',
    question:
      'Every move in this game is announced to the table. From that public record alone, how much of how someone plays can you actually work out in one game?',
    finding:
      'Twice chance, and no better. Single-game top-1 over nine styles rises from 16.1% at 40 events to 22.0% at the full log, against an 11.1% chance rate, with per-style accuracy running from 41.4% on the Ghost down to 3.6% on the Punter — on the regenerated artifact, where the hardest style to read is no longer the Balanced control at 5.6% but Punter, and Balanced itself has risen to 23.3%. The ceiling belongs to the material rather than the model: the four styles whose labelled axis is inert collapse into a cluster .20–.25 wide in observable space while the Turtle sits 3.2–3.7 away, and styles that diverge from the control on .39–2.89% of decisions offer an observer one to three revealing decisions per seat per game — some of which are structurally invisible, because declining to declare emits no event at all.',
    abstract:
      'This paper studies the observation problem in isolation from the adaptation problem treated by its companion: given only the public channel, how much of a seat’s play style can be recovered from a single game, and what fundamentally limits the recovery? We specify the channel exactly — including what it certifies (a hit locates a card; a declaration reveals its true holders, making foreign and own-hand-only declares exact public observations, not inferences) and what it structurally omits. From the channel we build a 14-dimensional feature vector of rates and shares per seat, calibrate a deliberately simple diagonal-Gaussian classifier on 1,350 mirror games, and report two small empirical methods findings: the Gaussian normaliser term must be dropped, and per-style variances must be shrunk halfway to pooled.',
    method:
      'Calibrated on 1,350 mirror games, measured on 1,800 held-out cross-play games at four log checkpoints and at end of game. Both corrections were forced by measurement rather than chosen: the normaliser handed one style 40 of 60 control-game reads through a calibration-tightness bonus.',
    evidence: {
      href: '/lab/adaptive',
      hash: '#classifier',
      label: 'The classifier — the accuracy curve',
    },
  },
  {
    slug: 'asking',
    serial: '08',
    kind: 'Focused result',
    title: 'Inference From a Miss: What Silence Licenses, and Two Corrections That Overlap',
    question:
      'You ask another player for a card, they do not have it, and they never ask you for one of those cards back. What are you actually allowed to conclude about what they are holding?',
    finding:
      'Nothing — and the engine already concludes nothing, because an absence is not an event it can see. If anything it is too kind to the quiet seat: in exactly that position it believes 14.0% where the truth is 2.0% (N = 19,003), and across 1,395,876 scored asks it runs about a point optimistic overall, while its certain calls are exactly right 16,680 times out of 16,680. The real errors run the other way, under-reading positive evidence: a seat that has publicly shown it holds a card of a set is under-priced by 8.4 points (.2386 believed against .3221 observed), and correcting that is worth +2.068 ± 0.293 sets per duplicate pair. But the shipped defusal heuristic rewards the same evidence and is worth +1.915 ± 0.315 alone, while both together measure +1.565 ± 0.317 — less than either. The three arms share one baseline and one bank, so that comparison is paired rather than cross-bank; but no interval is put on the difference between arms, and the gap is smaller than this instrument’s own floor at 400 pairs. Two corrections for one error overlapping rather than adding is the reading the numbers suggest, not one they establish.',
    abstract:
      'The owner raised a specific worry about the engine’s inference, and it is answered here and then generalised into the full matrix for choosing an ask. The engine cannot make the inference he feared: an absence is not a log event, so nothing in the ingestion switch can key on one — demonstrated by a treatment/control pair in which only the named card’s candidate set moves and the other four are bit-identical. Silence alone is worth −.0081 over 1,176,652 asks and is genuinely near-uninformative; silence after a miss is a different object, such a seat holding a card of the set 6.3% of the time against 66.3% for a silent seat never missed on. A separate observation — that sets get “ask-traded” — is confirmed at 88.1% against a 21.4% availability-matched control, and then shown not to be reciprocation at all: 99.1% of those replies are the hit-probability argmax.',
    method:
      'Every legal ask at every ask decision of 300 games was scored with the number the ask ranker actually decides on, against ground truth read from the hands — 1,395,876 asks, bucketed into a reliability table and then stratified by whether the target had been missed on and whether it had asked back. A treatment/control probe pair, identical but for one ask, isolates what a single miss moves in the candidate sets. The substitution result is 400 duplicate-deal pairs on one bank against one common baseline carrying neither mechanism, so the two corrections are comparable to each other rather than each only to itself; measured the other way — each against its own baseline — the calibration fix reads as a flat +0.04 ± 0.41, which is why the design matters.',
    evidence: {
      href: 'https://github.com/MeagerPotato/FishAI/blob/main/ASKING.md',
      label: 'The ask matrix — the calibration table and every stratum',
      external: true,
      pathLabel: 'github.com/…/ASKING.md',
    },
  },
  {
    slug: 'detection-floor',
    serial: '09',
    kind: 'Focused result',
    title: 'The Detection Floor: What a Null Result Was Measured With',
    question:
      'When this project reported that something made no difference, could its measurements have seen a difference if there had been one?',
    finding:
      'Often not. The instrument’s noise is 3.15–3.44 sets per duplicate pair, so the smallest effect it detects 80% of the time is about .47 sets at 400 pairs and .33 at 800 — and two of the project’s own published nulls sit far under that: the contained-pass aim at −.045 ± .130, and concealment against non-defusing opponents at −.1483 ± .2571 where the floor is ~.38. Both are reclassified as non-measurements rather than zeros. The power model itself is solid, holding in all twelve planted-effect cells of both runs. Two of the four parts did not replicate and are reported unsoftened: the empirical floor at 400 pairs is bounded only to .36–.50 (84.7% then 75.0% detection, pooled 81.7%), and nominal-95% interval coverage at 400 pairs pooled to 8.0% [5.2, 11.7] against a nominal 5%, while 800 was nominal in both runs — a pattern that does not scale as a real coverage defect should, for reasons that remain unknown.',
    abstract:
      'A codebase that publishes null results owes its readers a characterisation of the instrument those nulls were measured with, because an unresolved effect and an absent effect look identical in a table. This project published several nulls before anyone measured what its one instrument could resolve. The paper reports that characterisation and applies it to the back catalogue, and it names the trap the first run fell into: the minimum detectable effect depends on that cell’s own standard deviation, which is not constant — 3.645 for one cell, 4.57–4.95 implied by a foreign-engine harness — so a cell whose two arms mostly agree can resolve +0.2475 ± 0.1024 at 800 pairs while appearing to sit under a generic .33 floor. The recommendation, grounded only in this codebase’s experience, is to publish the floor beside the null.',
    method:
      'One instrument — K duplicate deal pairs of arm X against arm Y, reported as the mean paired set-difference ± 1.96 SE — characterised by planting an edge of continuously variable known size, monotone in its parameter and byte-identical to the shipped policy at zero, then counting how often independent banks of 400 and 800 pairs detected it, and how often two true nulls that still move the game produced intervals excluding zero. Everything rests on a byte-exact control that had to be rewritten to stop short-circuiting past the very wrapper whose inertness it certified. An independent agent re-ran the whole probe on fresh banks; three of four parts replicated, and the two that did not are printed as unresolved.',
    evidence: {
      href: 'https://github.com/MeagerPotato/FishAI/blob/main/CONCESSION.md',
      label: 'The floor, and the two nulls it reclassifies — §8a',
      external: true,
      pathLabel: 'github.com/…/CONCESSION.md',
    },
  },
  {
    slug: 'frontier',
    serial: '10',
    kind: 'Cross-engine result',
    title: 'Against the Frontier: A Cross-Engine Measurement and the Bridge Defect That Nearly Buried It',
    question:
      'Everything this project measured, it measured against itself. Played inside somebody else’s engine against the best bot they have written, how good is it actually?',
    finding:
      'Not good, and the reason is not the one the first measurement gave. FishAI wins 27.08% against SESTINA v1.0 over 7,200 games in that project’s own C++ engine, and sits below their entire published lineage — it loses to v0.5 and v0.6 too, placing between their v0.3 and v0.4, the release that added an exact deal posterior four versions before search existed there. But it declares as accurately as the frontier does: 98.42% against 98.46%. What it cannot do is prove what its own team already holds, sitting on a resolved set for 9.30 events where SESTINA sits for 2.92 — and a cheating oracle that cashes every lock instantly is worth +5.75 of the 22.17 points to even, a quarter of the gap. The other ~16.4 points are unattributed and nobody measured them.',
    abstract:
      'The first version of this measurement published 24.22%, a figure depressed 3.44 points by a rules-dialect mismatch in the bridge: us54 compels a cardless turn-holder to declare, their engine offers it a free pass instead, and the adapter translated the compulsion into a host that does not impose it. Every such declaration spent a set to avoid a move that costs nothing. The defect survived two adversarial audits, eight corruption counters reading zero, and a mirror-cell control that returned a perfect 50.0000% across a four-point hole — because a mirror cell plays one policy against itself on duplicate deals and is forced to 50% by construction, which their engine prints on its own power line. What caught it was a protocol counter reading zero where zero was impossible, filed at the time as a coverage gap.',
    method:
      'FishAI’s decision function registered as a guest bot over that project’s documented JSON-line protocol, their engine built from source in a container with floating-point contraction off so their three identity controls pass. Cells are 200 deals × 6 rotations = 1,200 games, duplicate-dealt, and every interval is quoted per deal rather than per game — the paired floor is ±6.93 points for one cell against the ±2.83 a game count would suggest, and several comparisons in the first version sat inside that band. Nothing of theirs is copied; their measured findings are cited as theirs.',
    evidence: {
      href: 'https://github.com/MeagerPotato/FishAI/blob/main/WHY-FISHAI-LOSES.md',
      label: 'The loss anatomy — 139 cells, and every withdrawn number',
      external: true,
      pathLabel: 'github.com/…/WHY-FISHAI-LOSES.md',
    },
  },
]

/* ---- topics -------------------------------------------------------------------------------- */

type TopicStatus = 'answered' | 'partly' | 'open'

interface Topic {
  question: string
  answer: string
  /** Where the reader checks it: a lab route, or the document the open item is stated in. */
  source: string
  status: TopicStatus
}

const STATUS_MARK: Record<TopicStatus, { cls: string; word: string }> = {
  answered: { cls: s.markPass, word: 'Answered' },
  partly: { cls: s.markUnknown, word: 'Partly' },
  open: { cls: s.markFail, word: 'Open' },
}

const ANSWERED: Topic[] = [
  {
    status: 'answered',
    question: 'Is any play style superior, or do the styles counter one another?',
    answer:
      'Superior. Punter takes the dominance verdict on all four pre-stated criteria, and the matrix carries almost no cyclic energy — .0112 against a .15 threshold, with one directed 3-cycle and zero significant ones. The counter-structure the question anticipated is absent.',
    source: '/lab/matrix · v0.5',
  },
  {
    status: 'answered',
    question: 'When one style dominates, does adapting to the table pay?',
    answer:
      'It costs. Best response over the measured table degenerates to always-Punter — provably, and observed at 100% of twelve million warm delegations — and the warmup anchor it needs to get there prices at −.0136 ± .0043 truly paired. Upgrading the classifier to perfection is worth exactly .0000.',
    source: '/lab/adaptive · v1.0',
  },
  {
    status: 'answered',
    question: 'What is an honest difficulty axis for a deduction bot?',
    answer:
      'A memory budget in bits, not decision noise. The ladder is monotone at every one of the nine adjacent rungs and saturates by 128 bits; the shipped medium tier prices at 32.2 bits; and the noise tier it replaces measures below the floor of keeping nothing at all.',
    source: '/lab/bounded · v1.5',
  },
  {
    status: 'answered',
    question: 'Do the roster’s aggressive-to-conservative labels name a knob that fires?',
    answer:
      'No. Across the whole range the roster spans, the declare threshold changes zero decisions. The styles are genuinely distinct — .39% to 2.89% of decisions differ from the control — but along other knobs entirely, and the site says so rather than keeping the old narrative.',
    source: '/lab#roster · the inert axis',
  },
  {
    status: 'answered',
    question: 'Is the contained book’s turn-pass worth playing?',
    answer:
      'No, and this is a theorem measured to zero rather than an idea abandoned. Implemented, priced above break-even and reached nearly four times as often as baseline, it moved its heaviest intended user by −.0018 ± .0014 against the field and left the ranking untouched.',
    source: '/lab/matrix · the contained book',
  },
  {
    status: 'partly',
    question: 'Can you tell what style a seat is playing from the public log alone?',
    answer:
      'Partly — twice chance at one game. 22.0% top-1 against an 11.1% floor at end of game, and only 16.1–21.7% at the 40–80 event horizons the engine actually acts on. Four styles read at or near chance; the Ghost reads best, at 41.4% on the regenerated artifact. The limit is how few decisions a style reveals, not the model.',
    source: '/lab/adaptive#classifier · observability',
  },
]

const OPEN: Topic[] = [
  {
    status: 'open',
    question: 'Does adaptation pay against an opponent the matrix never measured?',
    answer:
      'Unmeasured, and the interesting one. The classifier’s posterior is a projection onto nine calibrated hypotheses; a human at the table is none of them. This is the only setting where the observation layer could earn its keep, and nothing here tests it.',
    source: 'ADAPTIVE.md §7.2',
  },
  {
    status: 'open',
    question: 'What happens on a roster that really is intransitive?',
    answer:
      'Every v1.0 conclusion is downstream of one measured fact: a row that dominates every column. A roster with a genuine cycle would make the best response belief-dependent and hand the machinery a real decision. No such roster has been measured.',
    source: 'ADAPTIVE.md §7.2',
  },
  {
    status: 'open',
    question: 'Would a tuned roster change any of this?',
    answer:
      'The SPRT re-tuning protocol has never been run, so every result — the dominance verdict and both negative results included — is about the style as specified, not the best version of that style that exists. A re-tuned roster could push declare bars below 0.775 and bring the inert axis back to life.',
    source: 'STYLES.md §3.1.1 · v0.5 threats',
  },
  {
    status: 'open',
    question: 'Do these styles survive contact with an independently written bot?',
    answer:
      'Unknown. Cross-play against a foreign agent and the holdout roster are both specified and neither has been run; the artifact’s cross-play block is empty. Conventions formed in self-play need not transfer, which is the standard warning this design accepts.',
    source: 'v0.5 §threats · BOT_LAB.md',
  },
  {
    status: 'open',
    question: 'Does a style play differently as one seat than as a whole team?',
    answer:
      'Every measured cell is a pure team of three. The mixed-composition tier — including the standing hypothesis that the Archivist is weak in mirrors and strong as a single seat — is specified and unexplored; the artifact’s teams block is empty.',
    source: 'v0.5 §threats',
  },
  {
    status: 'open',
    question: 'Does style interact with skill?',
    answer:
      'Not measured. The specified ablation — re-running every style over weaker inference — was never run for this roster, and every style result is therefore at one level of play. The v1.5 ladder now supplies the honest dial that ablation would need.',
    source: 'v0.5 §threats · BOUNDED.md',
  },
  {
    status: 'open',
    question: 'What does the memory ladder look like off its ten rungs?',
    answer:
      'Undefined. Budgets between the rungs are interpolated, not measured; only Balanced has a measured ladder; and the v1.0 adaptive engine under memory pressure is unmeasured and deliberately refused at the table rather than guessed at.',
    source: 'BOUNDED.md §5',
  },
  {
    status: 'open',
    question: 'Is the classifier reading the seat, or the whole table?',
    answer:
      'Localised, not settled. Bounding both teams makes styles more readable (the P7 refutation, which survives its multiplicity correction); bounding only the read seat, at six times the sample, moves nothing. The difference between the two designs is +.0045 ± .0021, z 2.11 — reported as a cross-design comparison that enters no verdict rule.',
    source: 'BOUNDED.md §4.4 · v1.5',
  },
  {
    status: 'open',
    question: 'Would watching a player across many games break the observability ceiling?',
    answer:
      'Untested. Nothing in the observability work aggregates across games, and the divergence arithmetic says single-game reads of near-control styles are evidence-starved in principle. Cross-game profiles are the route past twice chance, and they remain future work.',
    source: 'style-observability §scope',
  },
  {
    status: 'open',
    question: 'Should a team hold a contained book instead of banking it?',
    answer:
      'Untouched. Everything measured changes the ask policy; the declare-side recommendation — hold contained books by default, trading tempo against the retained licence — has never been implemented. The opportunity rate is set almost entirely by how long a style leaves books unclaimed (53.86% for the Turtle against 0.38% for the Scout), which is where the leverage would have to come from.',
    source: 'CONTAINMENT.md · contained book §open',
  },
  {
    status: 'open',
    question: 'Does any of this hold under the 48-card game?',
    answer:
      'No claim either way. Every number is conditional on the us54 rule set as pinned by the artifact’s rules hash, and the v0.5 sign-flip analysis is itself evidence that results do not transfer across dialects. Nothing here is claimed for pagat48 without re-measuring it there.',
    source: 'ADAPTIVE.md §7.2 · BOUNDED.md §5',
  },
]

/* ---- rendering ----------------------------------------------------------------------------- */

function PaperEntry({ paper, which }: { paper: Paper; which: ArtifactCase }) {
  const titleId = `paper-${paper.slug}`
  const evidenceHref = paper.evidence.external
    ? paper.evidence.href + (paper.evidence.hash ?? '')
    : withCase(paper.evidence.href, which) + (paper.evidence.hash ?? '')
  const note = pdfNote(paper.slug)
  return (
    <article className={p.paper} aria-labelledby={titleId}>
      <div className={p.rail}>
        <Eyebrow tone="muted" track="badge">
          {paper.serial}
        </Eyebrow>
        <span className={p.railNote}>{paper.kind}</span>
      </div>

      <div className={p.body}>
        <h3 className={p.title} id={titleId}>
          {paper.title}
        </h3>

        <dl className={p.qa}>
          <dt>The question</dt>
          <dd>{paper.question}</dd>
          <dt>The finding</dt>
          <dd className={p.finding}>{paper.finding}</dd>
        </dl>

        <blockquote className={p.abstract}>
          <p>{paper.abstract}</p>
          <footer>From the paper&rsquo;s abstract</footer>
        </blockquote>

        <p className={p.method}>
          <b>Method.</b> {paper.method}
        </p>

        {/*
          Each link's accessible name names the PAPER as well as the destination, because a
          screen reader's link list has no entry context: eighteen links reading "Read the
          paper" three times over would be six identical triplets.
        */}
        <ul className={p.links}>
          <li>
            <a
              className={p.link}
              href={`/papers/${paper.slug}.pdf`}
              type="application/pdf"
              aria-label={`Read ${paper.title} — ${note}`}
            >
              Read the paper
              <span className={p.linkNote}>{note}</span>
            </a>
          </li>
          <li>
            <a
              className={p.link}
              href={`${SOURCE_BASE}/${paper.slug}.tex`}
              aria-label={`LaTeX source of ${paper.title} on GitHub`}
            >
              LaTeX source
              <span className={p.linkPath}>github.com/…/papers/{paper.slug}.tex</span>
            </a>
          </li>
          <li>
            <a
              className={p.link}
              href={evidenceHref}
              aria-label={`The evidence behind ${paper.title}: ${paper.evidence.label}`}
            >
              {paper.evidence.label}
              <span className={p.linkPath}>
                {paper.evidence.pathLabel ?? paper.evidence.href}
                {paper.evidence.pathLabel ? '' : (paper.evidence.hash ?? '')}
              </span>
            </a>
          </li>
        </ul>
      </div>
    </article>
  )
}

function TopicRow({ topic }: { topic: Topic }) {
  const mark = STATUS_MARK[topic.status]
  return (
    <li className={p.topic}>
      <h4 className={p.topicQ}>{topic.question}</h4>
      <span className={`${s.mark} ${mark.cls}`}>{mark.word}</span>
      <p className={p.topicA}>{topic.answer}</p>
      <span className={p.topicSrc}>{topic.source}</span>
    </li>
  )
}

export function Papers() {
  const { search } = useLocation()
  const which = caseFromSearch(search)

  return (
    <LabShell
      current="/papers"
      docTitle="Research papers"
      which={which}
      stamp="six papers · built from papers/*.tex"
    >
      {/* ---- hero ------------------------------------------------------------------------- */}
      <Section noRule noMarks>
        <MaskedLines
          level="h1"
          lines={['Six papers,', 'one question each,', 'and *four of the answers are no*.']}
        />
        <div className={s.split} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Reveal as="p" className={s.prose}>
            FishAI is a bot that plays Canadian Fish and a laboratory that measures it. The
            papers below are what the laboratory has written down: three system papers tracing
            the engine from v0.5 to v1.5, and three focused results that take one load-bearing
            caveat each and measure it to the end. Every one is built from a committed LaTeX
            source, and every number in them is a field of an artifact this site renders.
          </Reveal>
          <Reveal as="div" className={s.stack}>
            <p className={s.prose}>
              Four of the six headlines are <strong>negative results</strong>, and they are the
              point rather than an embarrassment. A proved theorem measured at zero, a knob that
              was wired and swept and never reached, an adaptive agent that provably becomes the
              static one and then bills you for the trip — those are findings, and the series
              reports them in the same voice as the win.
            </p>
            <div className={buttonRow}>
              <Button href="#topics" variant="line">
                The questions, answered and open
              </Button>
              <Button href="/lab" variant="ghost">
                The evidence, in the lab
              </Button>
            </div>
            <p className={s.figNote}>
              Every PDF on this page is compiled from the <span className={s.mono}>.tex</span>{' '}
              beside it by <span className={s.mono}>npm run papers:build</span> — two passes,
              zero undefined references — and committed, so the link you follow is the source you
              can read.
            </p>
          </Reveal>
        </div>
        <LabContents sections={CONTENTS} />
      </Section>

      {/* ---- how to read ------------------------------------------------------------------ */}
      <Section id="how-to-read" badge="How to read">
        <SectionHead
          lines={['Every entry carries', 'the same *four things*.']}
          sub="A paper is only useful if you can tell, without opening it, whether it answers your question. Each entry states the question in one plain sentence, the finding with the numbers that decide it, the abstract in the paper's own words, and three ways out — the PDF, the source, and the page where the evidence is rendered from the committed artifact."
        />
        <Board
          items={[
            {
              ix: '01',
              title: 'The question, in plain words',
              role: 'What it asks',
              body:
                'One sentence, no jargon and no numbers. If the question needs the vocabulary ' +
                'of the paper to state, it is being stated badly.',
            },
            {
              ix: '02',
              title: 'The finding, with its numbers',
              role: 'What it found',
              body:
                'The headline as measured, carrying the figures that decide it — effect, ' +
                'standard error, and the comparison it is against. A negative result gets the ' +
                'same sentence structure as a positive one.',
            },
            {
              ix: '03',
              title: 'The abstract, the paper’s own',
              role: 'In its words',
              body:
                'Drawn from the paper’s own abstract rather than paraphrased into something ' +
                'friendlier. This is the project’s writing about the project’s work, so it ' +
                'stands as written.',
            },
            {
              ix: '04',
              title: 'Three ways out',
              role: 'Where to check',
              body:
                'The compiled PDF with its page count and size, the LaTeX source on GitHub, ' +
                'and the lab page that renders the same evidence live from the committed ' +
                'artifact — so any number here can be checked against the run that produced it.',
            },
          ]}
        />
      </Section>

      {/* ---- the system papers ------------------------------------------------------------ */}
      <Section id="series" badge="The series">
        <SectionHead
          lines={['Three system papers,', 'each answering', 'the *last one’s question*.']}
          sub="v0.5 asks whether any style is superior and finds one. v1.0 asks whether reading the table beats committing to that winner, and finds it costs. v1.5 asks what difficulty should be if not random blundering, and finds bits. Read in order, they are one argument."
        />
        <div className={p.papers}>
          {PAPERS.filter((paper) => paper.kind.startsWith('System')).map((paper) => (
            <PaperEntry key={paper.slug} paper={paper} which={which} />
          ))}
        </div>
      </Section>

      {/* ---- the focused results ---------------------------------------------------------- */}
      <Section id="results" badge="Focused results">
        <SectionHead
          lines={['Three caveats,', 'taken seriously enough', 'to get *their own papers*.']}
          sub="Each of these began as a footnote in a larger paper and turned out to carry more weight than the thing it qualified: an absorbing resource worth nothing, a parameter that was never consulted, and the exact ceiling on reading a player from a public log."
        />
        <div className={p.papers}>
          {PAPERS.filter((paper) => !paper.kind.startsWith('System')).map((paper) => (
            <PaperEntry key={paper.slug} paper={paper} which={which} />
          ))}
        </div>
      </Section>

      {/* ---- topics ----------------------------------------------------------------------- */}
      <Section id="topics" badge="Research topics">
        <SectionHead
          lines={['What has been asked,', 'and what is *still open*.']}
          sub="The questions this project has actually put to a measurement, with the answer each one came back with — and, separately and labelled as such, the ones nobody has run yet. An open question below is a question with no data behind it, not a hint at a result being withheld."
        />

        <h3 className={s.criterionLabel} style={{ marginBottom: 14 }}>
          Answered, with the run that answered it
        </h3>
        <ul className={p.answered}>
          {ANSWERED.map((topic) => (
            <TopicRow key={topic.question} topic={topic} />
          ))}
        </ul>

        <Hairline variant="soft" />

        <h3 className={s.criterionLabel} style={{ marginBottom: 14 }}>
          Open — specified, unmeasured, and stated as such
        </h3>
        <p className={s.figNote} style={{ marginTop: 0, marginBottom: 18 }}>
          These are drawn from the papers’ own threats-to-validity and future-work sections and
          from the repository’s measurement documents. None of them has a number behind it. They
          are listed because a laboratory that publishes only its answered questions is
          publishing half a record.
        </p>
        <ul className={p.answered}>
          {OPEN.map((topic) => (
            <TopicRow key={topic.question} topic={topic} />
          ))}
        </ul>
      </Section>

      {/* ---- sources ---------------------------------------------------------------------- */}
      <Section id="sources" badge="Sources">
        <SectionHead
          lines={['The PDFs are built,', 'not *uploaded*.']}
          sub="Each paper compiles standalone from its committed source. The build is two pdflatex passes per paper and refuses to publish one that finishes with an undefined reference, because a PDF with a ?? where a number belongs is a broken PDF that exits zero."
        />
        <div className={s.split}>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>Rebuilding them</h3>
            <p className={s.figNote}>
              <span className={s.mono}>npm run papers:build</span> compiles every{' '}
              <span className={s.mono}>papers/*.tex</span> twice, checks each log for undefined
              references and citations, copies the PDFs into{' '}
              <span className={s.mono}>public/papers/</span>, and rewrites{' '}
              <span className={s.mono}>src/pages/papers-manifest.json</span> with the page count
              and byte size this page prints. The PDFs are committed, so they go stale the moment
              a <span className={s.mono}>.tex</span> changes without a rebuild — the same
              contract the lab&rsquo;s committed results artifacts live under.
            </p>
          </div>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>Where the numbers come from</h3>
            <p className={s.figNote}>
              Nothing on this page is recomputed. Every figure quoted here is the paper&rsquo;s
              own, and each entry&rsquo;s third link goes to the lab page that renders the same
              figure from the committed artifact — parsed at the boundary, checked against the
              rule document&rsquo;s hash, and refusing to draw anything at all if the two
              disagree.
            </p>
          </div>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>The rule set</h3>
            <p className={s.figNote}>
              Every result in every paper is conditional on the{' '}
              <span className={s.mono}>us54</span> dialect as pinned by the artifact&rsquo;s
              rules hash: 54 cards, nine half-suits of six, out-of-turn declares, any declaration
              error awarded to the opponents, and a race to five sets. The dialect is specified
              in full at{' '}
              <TextLink href={withCase('/lab', which) + '#rules'}>the report&rsquo;s rule set</TextLink>
              .
            </p>
          </div>
        </div>

        <Hairline variant="soft" />
        <Board
          items={[
            {
              ix: 'L1',
              title: 'The style report',
              role: '/lab',
              body:
                'The nine-style roster, the payoff matrix, the four-criterion verdict and the ' +
                'glossary the v0.5 and inert-axis papers are written against.',
            },
            {
              ix: 'L2',
              title: 'The adaptive engine',
              role: '/lab/adaptive',
              body:
                'The v1.0 suite: the degeneracy theorem observed in play, the warmup tax, the ' +
                'oracle ablation, and the classifier accuracy the observability paper measures.',
            },
            {
              ix: 'L3',
              title: 'The bounded ladder',
              role: '/lab/bounded',
              body:
                'The v1.5 suite: ten budgets, eight pre-registered predictions, the tier ' +
                'prices, and the refutation the paper leads with.',
            },
            {
              ix: 'L4',
              title: 'The repository',
              role: 'github.com/MeagerPotato/FishAI',
              body:
                'The engine, the simulators, the committed artifacts, and the LaTeX source of ' +
                'all six papers under papers/. MIT licensed.',
            },
          ]}
        />
      </Section>
    </LabShell>
  )
}

export default Papers
