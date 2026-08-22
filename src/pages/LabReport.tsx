/**
 * `/lab` — the report.
 *
 * SITE_SPEC.md §1: hero -> the rule set -> style roster -> method -> payoff matrix (pin act 1)
 * -> counter-graph (pin act 2) -> verdict -> exploitability -> cross-play -> sources.
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
import { LabShell, withCase } from '../lab/ui/LabShell.tsx'
import { ArtifactBroken, RulesMismatch } from '../lab/ui/Refusal.tsx'
import { RuleStamp, SyntheticNotice, Us54Facts } from '../lab/ui/RuleStamp.tsx'
import { VerdictBody } from '../lab/ui/Verdict.tsx'
import s from '../lab/ui/lab.module.css'

const FAMILY_LABEL: Record<string, string> = {
  control: 'Control',
  aggressive: 'Aggressive',
  conservative: 'Conservative',
  passive: 'Passive',
  information: 'Information',
  optionality: 'Optionality',
}

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
          </Reveal>
        </div>

        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <RuleStamp artifact={artifact} check={check} />
          <SyntheticNotice artifact={artifact} />
        </div>
      </Section>

      {/* ---- the rule set --------------------------------------------------------------- */}
      <Section id="rules" badge="The rule set">
        <SectionHead
          lines={['54 cards, nine sets of six,', 'and *no way to draw*.']}
          sub={`Results are only meaningful against the rules that produced them. This page reports ${RULES_FILE}, stamped above from meta.rulesHash and verified in the browser against the shipped document's own bytes — not the pagat48 rule set the live table plays.`}
        />
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
            role: FAMILY_LABEL[style.family] ?? style.family,
            body: style.rationale ? `${style.thesis}. ${style.rationale}.` : `${style.thesis}.`,
          }))}
        />

        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Eyebrow tone="muted" track="head">
            What the styles actually do differently
          </Eyebrow>
          <div className={s.stackWide} style={{ marginTop: 20 }}>
            <BarChart model={concedeRateBar(results, 'FIG. 02')} />
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
            <TurnMachine figNo="FIG. 05a" />
            <DeclareWindowMachine figNo="FIG. 05b" />
          </div>
        </details>
      </Section>

      {/* ---- pin act 1: the payoff matrix ------------------------------------------------ */}
      <PinAct steps={matrixBeats.length} badge="Payoff matrix">
        {(progress) => (
          <>
            <div className={pinHead} id="matrix">
              <MaskedLines lines={['Who beats whom,', 'and by *how much*.']} />
              <div className={pinHeadAside}>
                <p>
                  {count(meta.seedSet.count)} duplicate pairs per cell, SE ≤{' '}
                  {rate3(Math.max(...artifact.matrix.map((c) => c.se)))}. The figure does not
                  change as you scroll — only the reading does.
                </p>
              </div>
            </div>
            <PayoffMatrix results={results} figNo="FIG. 07" />
            <Beats beats={matrixBeats} progress={progress} />
          </>
        )}
      </PinAct>

      {/* ---- pin act 2: the counter-graph ------------------------------------------------ */}
      <PinAct steps={graphBeats.length} badge="Counter-graph">
        {(progress) => (
          <>
            <div className={pinHead} id="counter-graph">
              <MaskedLines lines={['Every edge here', 'survived *correction*.']} />
              <div className={pinHeadAside}>
                <p>
                  Built from <code>matrix[].significant</code>, the Benjamini-Hochberg flag — never
                  from a raw p-value. Uncorrected, four more cells in this matrix would have
                  emitted an edge.
                </p>
              </div>
            </div>
            <CounterGraph results={results} figNo="FIG. 08" />
            <Beats beats={graphBeats} progress={progress} />
          </>
        )}
      </PinAct>

      {/* ---- the verdict ---------------------------------------------------------------- */}
      <Section id="verdict" noMarks>
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
            <div className={s.scroll}>
              <table className={s.table}>
                <caption>
                  E(i) per style, lowest first · {count(exploit[0]?.evalGames ?? 0)} fresh games per
                  evaluation · search {count(exploit[0]?.searchGames ?? 0)} games
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Style</th>
                    <th scope="col">E(i)</th>
                    <th scope="col">BR score</th>
                    <th scope="col">CI 95%</th>
                    <th scope="col">Search score</th>
                    <th scope="col">Detectable δ</th>
                    <th scope="col">Maximin</th>
                    <th scope="col">Worst vs</th>
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
            </div>
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

        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
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
            <div className={s.scroll}>
              <table className={s.table}>
                <caption>Cross-play cells · shared seed list published before the match</caption>
                <thead>
                  <tr>
                    <th scope="col">Us</th>
                    <th scope="col">Them</th>
                    <th scope="col">Mode</th>
                    <th scope="col">Pairs</th>
                    <th scope="col">Our score</th>
                    <th scope="col">CI 95%</th>
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
            </div>
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
