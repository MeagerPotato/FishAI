/**
 * `/lab` — the report.
 *
 * SITE_SPEC.md §1: hero -> the rule set -> style roster -> method -> payoff matrix (pin act 1)
 * -> counter-graph (pin act 2) -> verdict -> exploitability -> cross-play -> sources. The
 * interpretability overhaul adds a "How to read" strip between the hero and the rule set — six
 * plain-language ideas that carry the whole report — plus one plain-language sentence of body
 * prose ahead of every figure and a glossary in the Sources section. Plain language is not a
 * different register here: the numbers are the same numbers, said once in words first.
 *
 * ## The accent budget (SITE_SPEC.md §2.1)
 *
 * §2.1 spends accent TEXT on three things: the verdict banner, the one focal matrix cell, and
 * the highlighted cycle. Those are exactly the three here —
 *
 *   1. the verdict chip on the ink panel — `live="VERDICT · …"`, the page's only accent text
 *      outside a figure;
 *   2. the one focal cell of the payoff matrix (inside FIG. 07);
 *   3. the highlighted cycle of the counter-graph, or the dominant node when there is no cycle
 *      to highlight (inside FIG. 08).
 *
 * Section badges, crop marks, the ink panel's registration corner and chart bar/dot fills are
 * MARKS, which §2.1 makes free. Every `Button` here is `ghost` or `line` and `SiteNav` is given
 * no `cta`, so no amber fill appears in the page chrome at all.
 *
 * The remaining amber on the page belongs to the diagram system, not to this page: §3.2 requires
 * every figure to carry exactly one focal element, so FIG. 01 marks the EIGHTS set and FIG. 04
 * marks the Analyze step whether this page wants them to or not. What that budget does control
 * is HOW MANY figures the page shows, so the two state machines — reference material rather than
 * argument — are collapsed behind a `<details>` and cost nothing until a reader asks for them.
 *
 * ## What is drawn from what
 *
 * The counter-graph is drawn from `matrix[].significant` — post-Benjamini-Hochberg — via the
 * reconciled ranking, never from a raw p-value. In the pilot BH demoted four cells that looked
 * significant uncorrected; drawing edges from p-values would have put those on the headline
 * diagram as findings.
 */

import { useLocation } from 'react-router-dom'
import {
  Board,
  Button,
  Eyebrow,
  Hairline,
  InkPanel,
  MaskedLines,
  PinAct,
  Reveal,
  Section,
  SectionHead,
  TextLink,
  buttonRow,
  inkPanelBody,
  pinHead,
  pinHeadAside,
} from '../components/index.ts'
import {
  AnalysisPipeline,
  BarChart,
  CounterGraph,
  DeckAssembly,
  DeclareWindowMachine,
  DumbbellChart,
  LineChart,
  PayoffMatrix,
  TurnMachine,
  claimPrecisionDumbbell,
  concedeRateBar,
  degradationLine,
} from '../diagrams/index.ts'
import { caseFromSearch, styleLabel } from '../lab/artifact.ts'
import { count, edge, interval, rate, rate3 } from '../lab/format.ts'
import { labModel } from '../lab/model.ts'
import { RULES_FILE, shortHash } from '../lab/rules.ts'
import { Beats } from '../lab/ui/Beats.tsx'
import { LabContents, type LabSection } from '../lab/ui/LabContents.tsx'
import { LabShell, withCase } from '../lab/ui/LabShell.tsx'
import { ArtifactBroken, RulesMismatch } from '../lab/ui/Refusal.tsx'
import { RuleStamp, SyntheticNotice, Us54Facts } from '../lab/ui/RuleStamp.tsx'
import { ScrollRegion } from '../lab/ui/ScrollRegion.tsx'
import { VerdictBody } from '../lab/ui/Verdict.tsx'
import s from '../lab/ui/lab.module.css'

/**
 * Family -> display label.
 *
 * A `Map`, not an object literal, for the same reason as `FAMILY_CODE` in the
 * counter-graph layout: `family` is a value out of the results document, and
 * `{...}[family]` walks `Object.prototype`. `family: "constructor"` would
 * return the `Object` constructor, which is truthy, so `?? style.family` never
 * fires and a function is passed as a React child. `Map.get` has no prototype
 * chain.
 */
/**
 * The contents of this page, in document order.
 *
 * Every `id` here is a real element below, and the two pin acts got wrapper elements to carry
 * theirs — a `PinAct` owns its own `<section>` and takes no `id`, and the headline div inside it
 * is far too short for the scroll observer to ever find. The wrapper is a plain `<div>`, which
 * `position: sticky` inside the act is indifferent to.
 */
const CONTENTS: readonly LabSection[] = [
  { id: 'how-to-read', label: 'How to read this page', note: 'Six ideas, in plain language' },
  { id: 'rules', label: 'The rule set', note: 'us54, and why the ninth set decides everything' },
  { id: 'roster', label: 'The roster', note: 'Nine styles, and two caveats on them' },
  { id: 'method', label: 'Method', note: 'Duplicate deals and multiplicity control' },
  { id: 'matrix', label: 'The payoff matrix', note: 'Who beats whom, and by how much' },
  { id: 'counter-graph', label: 'The counter-graph', note: 'Only edges that survived correction' },
  { id: 'verdict', label: 'The verdict', note: 'Four criteria, recomputed in your browser' },
  { id: 'exploitability', label: 'Exploitability', note: 'Topping the table is not being strong' },
  { id: 'crossplay', label: 'Cross-play', note: 'Against a bot nobody here wrote' },
  { id: 'sources', label: 'Sources and glossary', note: 'Every document, every term' },
]

const FAMILY_LABEL = new Map<string, string>([
  ['control', 'Control'],
  ['aggressive', 'Aggressive'],
  ['conservative', 'Conservative'],
  ['passive', 'Passive'],
  ['information', 'Information'],
  ['optionality', 'Optionality'],
])

export function LabReport() {
  const { search } = useLocation()
  const which = caseFromSearch(search)
  const model = labModel(which)

  if (!model.ok) {
    return <ArtifactBroken which={which} current="/lab" file={model.file} detail={model.detail} />
  }
  // SITE_SPEC.md §1.1 — refuse, with a message, before rendering a single number.
  if (!model.check.ok) return <RulesMismatch which={which} current="/lab" check={model.check} />

  const { artifact, results, derived, check } = model
  const { meta } = artifact
  const topStyle = derived.candidate
  const cycle = derived.cycles[0]
  const exploit = [...artifact.exploitability].sort((a, b) => a.gap - b.gap)
  const maximinOf = new Map(derived.maximin.map((m) => [m.style, m]))

  const matrixBeats = [
    {
      head: 'Read a row, not a column.',
      body: `Every cell is the score rate of the ROW style against the COLUMN style, duplicate-averaged so a cell and its mirror sum to exactly 1. ${rate3(0.5)} is an even match.`,
    },
    {
      head: 'The number is printed in every cell.',
      body: 'The ink ramp quantises the same value into four steps, so the encoding is redundant: nothing on this figure is legible only by shade.',
    },
    {
      head: 'A dashed border means "not significant".',
      body: `${derived.cells - derived.significantCells} of ${derived.cells} cells did not survive Benjamini-Hochberg at α = ${meta.analysis.alpha}. They are drawn, because hiding them would make the matrix look tidier than it is.`,
    },
    {
      head: 'Five columns of nine.',
      body: (
        <>
          The security-matrix type caps columns at six, so the headline shows the five
          highest-mean-score opponents. The whole N×N, every CI, every q-value, is one click away
          on <TextLink href={withCase('/lab/matrix', which)}>the matrix page</TextLink>.
        </>
      ),
    },
  ]

  const graphBeats = [
    {
      head: 'An edge means "beats, significantly".',
      body: `Drawn from matrix[].significant — the post-Benjamini-Hochberg flag — never from a raw p-value. ${derived.edges.length} directed edges survived; a cell that merely looks significant uncorrected emits nothing here.`,
    },
    {
      head: 'The fan-in badge is the point.',
      body: '"3 IN" reads as "three styles counter this one". A ranking cannot say that; a graph built for multi-parent fan-in can.',
    },
    cycle
      ? {
          head: 'One cycle is highlighted, and only one.',
          body: `${cycle.styles.map((id) => styleLabel(artifact, id)).join(' → ')} → ${styleLabel(artifact, cycle.styles[0])}, weakest edge ${rate3(cycle.minEdge)}. Every edge in it survived BH. Other cycles, if any, stay muted forward edges.`,
        }
      : {
          head: 'There is no cycle to highlight.',
          body: `No 3-cycle survived Benjamini-Hochberg, so the accent moves to the dominant node instead. The editorial point is still what the accent marks — it is just a different point.`,
        },
    {
      head: 'This is the headline whenever the verdict is cyclic.',
      body: `Here the verdict is "${derived.verdict}". ${derived.verdict === 'cyclic' ? 'So this figure, not a ranking, is the finding.' : 'The counter-graph is still shown, because a transitive matrix is a claim that has to be visible to be checked.'}`,
    },
  ]

  return (
    <LabShell
      current={withCase('/lab', which)}
      docTitle="The style report"
      which={which}
      stamp={`us54 · rulesHash ${shortHash(meta.rulesHash)}`}
    >
      {/* ---- hero ------------------------------------------------------------------------ */}
      <Section noRule noMarks>
        <MaskedLines
          level="h1"
          lines={['Nine play styles.', 'One inference engine.', '*Is any of them best?*']}
        />
        <div className={s.split} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Reveal as="p" className={s.prose}>
            FishAI plays the <code>us54</code> dialect of Canadian Fish and runs a nine-style
            roster against itself on duplicate deals. Every style shares the same deduction code,
            so what the payoff matrix measures is the policy, not one bot being better written
            than another. This page reports one committed artifact and computes its verdict in
            front of you.
          </Reveal>
          <Reveal as="div" className={s.stack}>
            <p className={s.prose}>
              The answer is <strong>{derived.verdict}</strong>, and the four criteria it rests on
              are printed in full further down. The site does not read that word off the artifact
              — it re-derives it from the matrix each time you load the page.
            </p>
            <div className={buttonRow}>
              <Button href="#verdict" variant="line">
                Go straight to the verdict
              </Button>
              <Button href={withCase('/lab/matrix', which)} variant="ghost">
                Full matrix
              </Button>
            </div>
            <p className={s.figNote}>
              The roster is not only measured — it is playable:{' '}
              <TextLink href="/play" arrow={false}>
                take a seat against it yourself
              </TextLink>
              , solo or assisted by the engine&rsquo;s own reasoning.
            </p>
          </Reveal>
        </div>

        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <RuleStamp artifact={artifact} check={check} />
          <SyntheticNotice artifact={artifact} />
        </div>

        <LabContents sections={CONTENTS} />
      </Section>

      {/* ---- how to read this page -------------------------------------------------------- */}
      <Section id="how-to-read" badge="How to read">
        <SectionHead
          lines={['A minute of vocabulary,', 'and the evidence *reads itself*.']}
          sub="Nothing on this page is dumbed down, but none of it needs prior jargon either. Six ideas carry the whole report; each is stated plainly here, and each term reappears in the glossary under Sources."
        />
        <Board
          items={[
            {
              ix: '01',
              title: 'A style is settings, not a bot',
              role: 'Definition',
              body:
                'Every seat runs the same deduction engine. A style is a vector of parameters ' +
                'over it — how eagerly to declare, whom to target, what to weigh — so when one ' +
                'style beats another, the difference is policy, never one bot being better ' +
                'written than the rest.',
            },
            {
              ix: '02',
              title: 'A duplicate deal cancels the cards',
              role: 'Method',
              body:
                'Each seeded deal is played twice with the teams swapped, and the pair is scored ' +
                'as one observation. A lucky hand lifts both sides equally and cancels out, so ' +
                'what remains is what the styles did with identical cards.',
            },
            {
              ix: '03',
              title: 'Score rate is a plain win rate',
              role: 'Measure',
              body:
                'The share of games a style’s team won, from 0 to 1, where .500 is an even ' +
                'match. Under us54 a tie is arithmetically impossible — nine sets, first to five ' +
                '— so nothing hides in a draw column.',
            },
            {
              ix: '04',
              title: 'The matrix and the counter-graph',
              role: 'Figures',
              body:
                'The matrix prints each style’s score rate against every other. The ' +
                'counter-graph is the same data redrawn as arrows — one per pairing whose ' +
                'advantage survived statistical correction. A cycle there (A beats B beats C ' +
                'beats A) would mean no ranking can be honest; this roster has none.',
            },
            {
              ix: '05',
              title: 'Four criteria, or no winner',
              role: 'Decision rule',
              body:
                'A style is called dominant only if it tops the table, loses no matchup even at ' +
                'the cautious end of the interval, sits in a matrix transitive enough for a ' +
                'ranking to mean anything, and folds no worse than its rivals to a counter-' +
                'strategy tuned against it. Fail one and nobody is crowned.',
            },
            {
              ix: '06',
              title: 'Two caveats, stated up front',
              role: 'Caveats',
              body:
                'The declare-threshold axis the style names advertise turns out not to fire, so ' +
                'the styles differ along other knobs than the ones they are named for; and the ' +
                'Hoarder is measured paying its strategy’s full cost without the mechanism ' +
                'that was meant to pay it back. Both are unpacked below the roster.',
            },
          ]}
        />
      </Section>

      {/* ---- the rule set --------------------------------------------------------------- */}
      <Section id="rules" badge="The rule set">
        <SectionHead
          lines={['54 cards, nine sets of six,', 'and *no way to draw*.']}
          sub={`Results are only meaningful against the rules that produced them. This page reports ${RULES_FILE}, stamped above from meta.rulesHash and verified in the browser against the shipped document's own bytes — not the pagat48 rule set the live table plays.`}
        />
        <p className={s.prose}>
          The figure below deals the 54 cards into their nine sets of six — eight ordinary
          half-suits, then the odd ninth built from the four 8s and both jokers, which is the one
          rule everything else on this page leans on.
        </p>
        <DeckAssembly figNo="FIG. 01" />
        <Hairline variant="soft" />
        <div className={s.split} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Us54Facts />
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>Why the deck composition is the load-bearing rule</h3>
            <p className={s.figNote}>
              The ninth set — four 8s and two jokers — is what makes the count odd. Nine sets and
              a clinch at five is the whole termination proof, and it is also why every threshold
              inherited from the 48-card game is wrong here: a wrong declare no longer burns a
              set, it hands one over, so the same decision that used to cost one set now swings
              two.
            </p>
            <p className={s.figNote}>
              Within EIGHTS the ask licence is uniform — holding any 8 <em>or</em> either joker
              lets you ask for any other card of the set (row 6). That is one rule, and it is
              enough to make the ninth set behave unlike the other eight.
            </p>
          </div>
        </div>
      </Section>

      {/* ---- the roster ----------------------------------------------------------------- */}
      <Section id="roster" badge="The roster">
        <SectionHead
          lines={[`${artifact.styles.length} theses about *how to play*,`, 'tuned from scratch.']}
          sub="Nine is not a round number chosen for the page — it is exactly the node budget of the counter-graph, which is the diagram the whole report turns on. Each style is a policy over the same inference engine."
        />
        <Board
          items={artifact.styles.map((style, i) => ({
            ix: `S${i + 1}`,
            title: style.label,
            role: FAMILY_LABEL.get(style.family) ?? style.family,
            body: style.rationale ? `${style.thesis}. ${style.rationale}.` : `${style.thesis}.`,
          }))}
        />

        {/* STYLES.md §6: *"Both must be stated wherever the ranking is published."* This page
            publishes the ranking, so they are stated here, beside the roster whose labels the
            first one is about — not filed in a document a reader of this page never opens. */}
        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Eyebrow tone="muted" track="head" as="h2">
            Two measured caveats on this roster
          </Eyebrow>
          <div className={s.split} style={{ marginTop: 20 }}>
            <div className={s.stack}>
              <h3 className={s.criterionLabel}>
                The axis the labels advertise does not fire
              </h3>
              <p className={s.figNote}>
                <em>Aggressive</em> and <em>conservative</em> above name a declare-threshold
                spectrum, and across the range this roster actually spans that knob changes
                nothing: swept on the control over 40 seeded games, every value from 0.775 upward
                produced <strong>zero</strong> divergent decisions, and all nine styles sit at
                0.775 or above. The path is not unreachable — the control makes 171 speculative
                declares to 138 certain ones over the same games — the inference engine&rsquo;s
                confidence estimates are simply bimodal, so any threshold inside the empty band
                selects the identical set of declares. The styles are still measurably distinct,
                between 0.39% and 2.89% of decisions differing from the control, but along{' '}
                <code>gambleBonus</code>, <code>declareMaxUncertain</code> and the ask-targeting
                weights rather than along the axis they are named after (STYLES.md §6.1).
              </p>
            </div>
            <div className={s.stack}>
              <h3 className={s.criterionLabel}>
                One style is measured without the benefit it exists to buy
              </h3>
              <p className={s.figNote}>
                A book held entirely by one team cannot be asked into by an opponent, and leaving
                it unclaimed keeps a repeatable, targetable turn-pass alive. That is the Hoarder
                thesis — and no style in the roster <em>this run measured</em> used it. The
                Hoarder therefore
                pays hoarding&rsquo;s full cost, declare latency 22.90 → 31.02 and race losses
                0.046 → 0.091, and collects none of its benefit. Its finish is a valid measurement
                of <em>this implementation</em> and not a verdict on the strategy: the cost of
                hoarding is measured, the benefit is not (CONTAINMENT.md, STYLES.md §6.2).
              </p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Eyebrow tone="muted" track="head">
            What the styles actually do differently
          </Eyebrow>
          <div className={s.stackWide} style={{ marginTop: 20 }}>
            <p className={s.prose}>
              The first chart shows how often each style&rsquo;s declares handed the set to the
              opposition — the costliest habit a style can have under us54, where any error in a
              declare gifts the whole set.
            </p>
            <BarChart model={concedeRateBar(results, 'FIG. 02')} />
            <p className={s.prose}>
              The second puts every style&rsquo;s declare precision beside the Balanced
              control&rsquo;s on the same deals, so the distance between the two dots is the
              style&rsquo;s own doing.
            </p>
            <DumbbellChart model={claimPrecisionDumbbell(results, 'FIG. 03')} />
          </div>
        </div>
      </Section>

      {/* ---- method --------------------------------------------------------------------- */}
      <Section id="method" badge="Method">
        <SectionHead
          lines={['Duplicate deals, or', 'the result is *noise*.']}
          sub="Every pairing plays the same seeded deals from both sides, so a style is never credited for the cards it happened to be dealt. The engine is pure and deterministic: one seed, one byte-identical game."
        />
        <p className={s.prose}>
          One run flows left to right below, from the seed list to the published artifact this
          page reads; the highlighted step is the analysis, because that is where a raw score
          either survives correction or stops being a finding.
        </p>
        <AnalysisPipeline figNo="FIG. 04" />

        <div className={s.split} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>Multiplicity is corrected before anything is called significant</h3>
            <p className={s.figNote}>
              {derived.cells} simultaneous cells at α = {meta.analysis.alpha} would produce roughly{' '}
              {(derived.cells * meta.analysis.alpha).toFixed(1)} false positives by chance alone.
              Benjamini-Hochberg controls the false-discovery rate across the whole matrix, and{' '}
              {derived.significantCells} of {derived.cells} cells survived it. Every edge on the
              counter-graph, and every cycle in the verdict, is drawn from that corrected flag.
            </p>
          </div>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>The health gate</h3>
            <p className={s.figNote}>
              A run is void, not merely noisy, if any of these is non-zero: illegal actions{' '}
              {meta.health.illegalActions}, capped games {meta.health.cappedGames}, invariant
              violations {meta.health.invariantViolations}. Distinct seeds:{' '}
              {count(meta.health.distinctSeeds)}.
            </p>
          </div>
        </div>

        {/* Reference, not argument — and each state machine brings its own focal accent, so
            keeping them closed by default keeps the amber on the page down to the marks that
            are doing editorial work. */}
        <details className={s.detail} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <summary>
            The turn structure and the declare window, as state machines (FIG. 05a, FIG. 05b)
          </summary>
          <div className={`${s.detailBody} ${s.stackWide}`}>
            <p className={s.prose}>
              Two loops, drawn separately so neither has to lie by omission: first the turn
              itself — ask, hit, miss, turn passes — then what happens inside a declare window,
              where the us54 rules actually bind.
            </p>
            <TurnMachine figNo="FIG. 05a" />
            <DeclareWindowMachine figNo="FIG. 05b" />
          </div>
        </details>
      </Section>

      {/* ---- pin act 1: the payoff matrix ------------------------------------------------ */}
      {/* The id lives on the wrapper, not on the headline inside: `#matrix` should mean the whole
          act, which is what the contents list links to and what the scroll observer watches. */}
      <div id="matrix">
        <PinAct steps={matrixBeats.length} badge="Payoff matrix">
          {(progress) => (
            <>
              <div className={pinHead}>
                <MaskedLines lines={['Who beats whom,', 'and by *how much*.']} />
                <div className={pinHeadAside}>
                  <p>
                    Each cell below is the share of identical deals the row style&rsquo;s team won
                    against the column style&rsquo;s. {count(meta.seedSet.count)} duplicate pairs
                    per cell, SE ≤ {rate3(Math.max(...artifact.matrix.map((c) => c.se)))}. The
                    figure does not change as you scroll — only the reading does.
                  </p>
                </div>
              </div>
              <PayoffMatrix results={results} figNo="FIG. 07" />
              <Beats beats={matrixBeats} progress={progress} />
            </>
          )}
        </PinAct>
      </div>

      {/* ---- pin act 2: the counter-graph ------------------------------------------------ */}
      <div id="counter-graph">
        <PinAct steps={graphBeats.length} badge="Counter-graph">
          {(progress) => (
            <>
              <div className={pinHead}>
                <MaskedLines lines={['Every edge here', 'survived *correction*.']} />
                <div className={pinHeadAside}>
                  <p>
                    Each arrow below points from a style to a style it reliably beats. Built from{' '}
                    <code>matrix[].significant</code>, the Benjamini-Hochberg flag — never from a
                    raw p-value. Uncorrected, four more cells in this matrix would have emitted an
                    edge.
                  </p>
                </div>
              </div>
              <CounterGraph results={results} figNo="FIG. 08" />
              <Beats beats={graphBeats} progress={progress} />
            </>
          )}
        </PinAct>
      </div>

      {/* ---- the verdict ---------------------------------------------------------------- */}
      <Section id="verdict" noMarks>
        <p className={s.prose} style={{ marginBottom: 'var(--fa-sp-head)' }}>
          Everything above compresses into one word, printed below beside the four tests it had
          to pass — recomputed from the matrix in your browser, not read off the artifact.
        </p>
        <InkPanel
          fig="FIG. 09 — The verdict"
          live={`VERDICT · ${derived.verdict.toUpperCase()}`}
        >
          <div className={inkPanelBody} style={{ display: 'block' }}>
            <VerdictBody derived={derived} artifact={artifact} />
          </div>
        </InkPanel>
      </Section>

      {/* ---- exploitability -------------------------------------------------------------- */}
      <Section id="exploitability" badge="Exploitability">
        <SectionHead
          lines={['Topping the table is not', 'the same as being *strong*.']}
          sub="E(i) is how much a best-response style, tuned specifically against i, beats it. A style with a high maximin and a low E is genuinely superior; a style that merely tops the table is the current champion of a nine-bot population."
        />

        {artifact.exploitability.length === 0 ? (
          <p className={s.prose}>
            The exploitability search did not run for this artifact. That is why criterion 4 above
            reads <em>not measured</em>, and why the verdict cannot be <code>dominant</code> no
            matter how the other three criteria land. A style is not crowned because nobody
            checked.
          </p>
        ) : (
          <>
            <ScrollRegion label="Exploitability per style">
              <table className={s.table}>
                <caption>
                  E(i) per style, lowest first · {count(exploit[0]?.evalGames ?? 0)} fresh games per
                  evaluation · search {count(exploit[0]?.searchGames ?? 0)} games
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Style</th>
                    <th scope="col">E(i) — best-response gap</th>
                    <th scope="col">Best-response score rate</th>
                    <th scope="col">Best-response CI 95%</th>
                    <th scope="col">Search score rate (biased high)</th>
                    <th scope="col">Detectable δ</th>
                    <th scope="col">Maximin score rate</th>
                    <th scope="col">Worst matchup</th>
                  </tr>
                </thead>
                <tbody>
                  {exploit.map((e) => {
                    const mm = maximinOf.get(e.style)
                    return (
                      <tr key={e.style}>
                        <th scope="row">{styleLabel(artifact, e.style)}</th>
                        <td>{rate(e.gap)}</td>
                        <td>{rate(e.score)}</td>
                        <td>{interval(e.ci95)}</td>
                        <td className={s.ns}>{rate(e.searchScore)}</td>
                        <td className={s.ns}>{rate(e.detectableDelta)}</td>
                        <td>{mm ? rate(mm.value) : '—'}</td>
                        <td>{mm ? styleLabel(artifact, mm.worstVs) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ScrollRegion>
            <p className={s.figNote}>
              E(i) is a <em>maximum over a search</em>, so a small value means nothing without the
              detectable δ beside it: the search could not have accepted an improvement smaller
              than that. &ldquo;Search score&rdquo; is the search&rsquo;s own upward-biased
              number, printed next to the fresh-block score so the bias stays visible rather than
              being quietly corrected away. Sorted by E(i), ascending.
              {topStyle ? (
                <>
                  {' '}
                  The top of the table by mean score is {styleLabel(artifact, topStyle)}; whether
                  that survives contact with a style nobody has written yet is exactly what this
                  column cannot tell you.
                </>
              ) : null}
            </p>
          </>
        )}

        <div className={s.stackWide} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <p className={s.prose}>
            The last figure asks how each style&rsquo;s score rate holds up as the opposition
            gets stronger, opponent by opponent: a flat line degrades gracefully, a steep one
            only ever beat the weak.
          </p>
          <LineChart model={degradationLine(results, 'FIG. 10')} />
        </div>
      </Section>

      {/* ---- cross-play ------------------------------------------------------------------ */}
      <Section id="crossplay" badge="Cross-play">
        <SectionHead
          lines={['Against a bot', 'nobody here *wrote*.']}
          sub="Self-play measures a population against itself. The gap between a style's self-play score and its cross-play score is the size of the overfit, which is a different question from anything the matrix above can answer."
        />
        {artifact.crossplay.length === 0 ? (
          <p className={s.prose}>
            No cross-play run exists in this artifact. The protocol is specified — line-delimited
            JSON over stdio, host as referee, a <code>rulesHash</code> handshake that refuses the
            match outright if the two sides disagree about the rules — but no foreign bot has
            been played, and an empty table is the honest render of that. It is not a placeholder
            for a result that exists somewhere else.
          </p>
        ) : (
          <>
            <ScrollRegion label="Cross-play cells against foreign bots">
              <table className={s.table}>
                <caption>Cross-play cells · shared seed list published before the match</caption>
                <thead>
                  <tr>
                    <th scope="col">Our style</th>
                    <th scope="col">Foreign bot</th>
                    <th scope="col">Mode</th>
                    <th scope="col">Duplicate pairs</th>
                    <th scope="col">Our score rate</th>
                    <th scope="col">Our CI 95%</th>
                    <th scope="col">Seed set</th>
                    <th scope="col">rulesHash agreed</th>
                  </tr>
                </thead>
                <tbody>
                  {artifact.crossplay.map((row) => (
                    <tr key={`${row.us}-${row.them}-${row.mode}`}>
                      <th scope="row">{styleLabel(artifact, row.us)}</th>
                      <td>{row.them}</td>
                      <td>{row.mode}</td>
                      <td>{count(row.pairs)}</td>
                      <td>{rate(row.usScore)}</td>
                      <td>{interval(row.ci95)}</td>
                      <td>{row.seedSet}</td>
                      <td className={s.ns}>{shortHash(row.rulesHashAgreed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
            {artifact.crossplay.map((row) => (
              <p key={`${row.us}-${row.them}-note`} className={s.figNote}>
                {row.note}
              </p>
            ))}
          </>
        )}
      </Section>

      {/* ---- sources --------------------------------------------------------------------- */}
      <Section id="sources" badge="Sources">
        <SectionHead
          lines={['Everything above', 'is *checkable*.']}
          sub="One artifact, one schema, one rule document. Nothing on this site is computed from anything the reader cannot open."
        />
        <div className={s.split}>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>Documents</h3>
            <p className={s.figNote}>
              <strong>{RULES_FILE}</strong> — the pinned rule set, hashed in the browser to{' '}
              <span className={s.mono}>{shortHash(check.shipped)}</span>.<br />
              <strong>BOT_LAB.md</strong> — §4 the metrics, §4.4 the decision rule this page
              applies, §5 the experimental design, §7.1 the data contract.
              <br />
              <strong>STYLES.md</strong> — the nine-style roster and its parameter vectors.
              <br />
              <strong>SITE_SPEC.md</strong> — the routes, the design system, the accent budget.
            </p>
          </div>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>The artifact</h3>
            <p className={s.figNote}>
              <span className={s.mono}>{model.file}</span> — schema {meta.schemaVersion}, emitted
              by <span className={s.mono}>{meta.engineCommit}</span> at {meta.generatedAt}, seed
              set <span className={s.mono}>{meta.seedSet.prefix}</span>. It is imported, not
              fetched: Vite emits it inside this route&rsquo;s chunk under{' '}
              <span className={s.mono}>/assets/</span>, so there is no request that can 404 and no
              copy at the dist root that can drift.
            </p>
          </div>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>Method references</h3>
            <p className={s.figNote}>
              Duplicate deals are the common-random-numbers estimator, standard in card-game AI
              evaluation. The cyclic/transitive split is the Hodge decomposition of the
              antisymmetric payoff matrix (Balduzzi et al., 2018). α-Rank is Omidshafiei et al.,
              2019. Multiplicity control is Benjamini-Hochberg. Exploitability follows the
              Nash-vs-exploitation framing: a style that beats today&rsquo;s roster may be
              maximally exploitable by a style nobody has written.
            </p>
          </div>
        </div>

        <Hairline variant="soft" />
        <Eyebrow tone="muted" track="head" as="h3">
          Glossary
        </Eyebrow>
        <dl className={s.glossary}>
          <dt>Duplicate pair</dt>
          <dd>
            One seeded deal played twice with the teams swapped and scored as a single
            observation, so the luck of the cards cancels.
          </dd>
          <dt>Score rate</dt>
          <dd>
            The share of games won, 0 to 1; .500 is an even match, and under us54 there are no
            ties to blur it.
          </dd>
          <dt>Maximin</dt>
          <dd>
            A style&rsquo;s score rate in its worst matchup; above .500 means it loses to nobody
            in the roster.
          </dd>
          <dt>Cyclic energy</dt>
          <dd>
            How much of the matrix is rock-paper-scissors rather than a ladder; past the
            threshold, any single ranking misleads.
          </dd>
          <dt>Nash mixture</dt>
          <dd>
            The blend of styles that would be unbeatable within this roster; a dominant style is
            the special case where one style takes all the weight.
          </dd>
          <dt>Exploitability</dt>
          <dd>
            How hard a style falls to an opponent tuned specifically against it; topping the
            table without this check is only a claim about today&rsquo;s population.
          </dd>
          <dt>Concede rate</dt>
          <dd>
            The share of a style&rsquo;s declares that handed the set to the opposition — under
            us54, any error in a declare gifts the whole set.
          </dd>
          <dt>Declare window</dt>
          <dd>
            The pause after every action in which each seat, in order, may declare a set or
            decline; declining is itself a move.
          </dd>
          <dt>Clinch</dt>
          <dd>
            The game ends the moment a team&rsquo;s fifth set resolves, so a finished game always
            leaves sets unresolved and cards in hand.
          </dd>
          <dt>Memory bits</dt>
          <dd>
            The v1.5 difficulty budget: facts derived from the public log are priced — 2 bits to
            place a card, 1 to certify a basis — and a bounded seat keeps the highest-ranked
            facts that fit. The ladder pricing it lives at /lab/bounded.
          </dd>
          <dt>Set-share</dt>
          <dd>
            A team&rsquo;s banked sets over all banked sets, per game, duplicate-averaged — the
            ladder&rsquo;s metric, chosen because it keeps moving after a win rate saturates.
          </dd>
          <dt>Evidence age</dt>
          <dd>
            Public-log events since a hit located a card; the decay curves plot how often a
            policy still exploits the fact as that distance grows.
          </dd>
          <dt>Bits-equivalent</dt>
          <dd>
            Where a shipped difficulty tier&rsquo;s set-share lands on the measured ladder,
            interpolated over the finite rungs; a tier off the curve&rsquo;s ends is reported as
            clamped or not finitely placeable, never invented.
          </dd>
        </dl>

        <Hairline variant="soft" />
        <p className={s.figNote}>
          Payoff matrix top cell for reference: {topStyle ? styleLabel(artifact, topStyle) : '—'}{' '}
          mean score {derived.meanScore[0] ? rate(derived.meanScore[0].value) : '—'}, edge over
          even {derived.meanScore[0] ? edge(derived.meanScore[0].value) : '—'}.
        </p>
      </Section>
    </LabShell>
  )
}

export default LabReport
