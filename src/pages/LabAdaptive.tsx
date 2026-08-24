/**
 * `/lab/adaptive` — the FishAI v1.0 results page, led by its negative result.
 *
 * The page reports one committed artifact (`src/lab/data/adaptive-results.json`, parsed at the
 * boundary by `adaptive-artifact.ts`) against four predictions that were written down before
 * the run. The headline is stated in the hero because it is the finding: best-response
 * adaptation over this roster degenerates to always-Punter — provably from the committed
 * counter table, and measured at 100% of warm delegations — and then underpays for its warmup.
 * A negative result is reported here with the same pride as a positive one; nothing is
 * softened, and nothing is dressed up as an ablation of a success.
 *
 * ## The accent budget (SITE_SPEC.md §2.1)
 *
 * One accent-text spend: the verdict chip on the ink panel (`live="VERDICT · NEGATIVE"`).
 * Every Button is `line` or `ghost`, the nav gets no `cta`, and the tables are ink. The
 * remaining amber belongs to the diagram system's own per-figure budgets — the mechanism
 * strip's focal stage and delegation arrow, the dumbbell's solid series dot, the line chart's
 * focal series — which §3.2 requires of every figure regardless of what this page wants.
 *
 * ## What is recomputed and what is read
 *
 * The best-response table is recomputed in the browser from `COUNTER_TABLE` — the constant the
 * engine actually plays from — and the gauntlet z column is recomputed from each row's delta
 * and SE. The four P1–P4 verdict words are the artifact's own, printed verbatim; every number
 * they cite appears in the sections above them, so a reader can check the words against the
 * evidence without trusting the emitter.
 */

import { useLocation } from 'react-router-dom'
import {
  Board,
  Button,
  Eyebrow,
  Hairline,
  InkPanel,
  MaskedLines,
  Reveal,
  Section,
  SectionHead,
  TextLink,
  buttonRow,
  inkPanelBody,
} from '../components/index.ts'
import { AdaptiveMechanism, DumbbellChart, LineChart } from '../diagrams/index.ts'
import type { StyleId } from '../../lib/engine/index.ts'
import type { AdaptiveResults, VerdictValue } from '../../lib/lab/adaptive-types.ts'
import { loadAdaptiveArtifact } from '../lab/adaptive-artifact.ts'
import {
  bestResponseColumns,
  classifierLine,
  gauntletDumbbell,
  styleName,
} from '../lab/adaptiveFigures.ts'
import { caseFromSearch } from '../lab/artifact.ts'
import { count, interval, isoDate, pct, rate } from '../lab/format.ts'
import { checkRules, shortHash } from '../lab/rules.ts'
import { LabShell, withCase } from '../lab/ui/LabShell.tsx'
import { ArtifactBroken, RulesMismatch } from '../lab/ui/Refusal.tsx'
import { ScrollRegion } from '../lab/ui/ScrollRegion.tsx'
import s from '../lab/ui/lab.module.css'

/** `−.0136` / `+.0100` — a signed score-rate delta, four places, true minus sign. */
function sgn4(v: number): string {
  return `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(4).replace(/^0/, '')}`
}

/** `−3.53` — a z-score, two places. */
function z2(v: number): string {
  return `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}`
}

const VERDICT_MARK: Record<VerdictValue, { cls: string; word: string }> = {
  confirmed: { cls: s.markPass, word: 'Confirmed' },
  refuted: { cls: s.markFail, word: 'Refuted' },
  mixed: { cls: s.markUnknown, word: 'Mixed' },
}

/** One-line names for the pre-registered predictions; the full text sits in the detail. */
const PREDICTION_LABEL: Record<string, string> = {
  P1: 'The warm gauntlet matches punter’s row within CI',
  P2: 'The mixed-population delta is ≈ 0',
  P3: 'Oracle classification buys ≈ nothing',
  P4: 'Classifier: strong on the loners, confused in the quadrangle',
}

function StampCell({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.stampCell}>
      <Eyebrow tone="muted" track="legal">
        {label}
      </Eyebrow>
      <span className={s.stampValue} data-numeric="">
        {value}
      </span>
    </div>
  )
}

/**
 * The provenance stamp, above the fold. The adaptive artifact carries everything the style
 * stamp does PLUS the provenance of the two committed calibrations the engine played from —
 * an adaptive result is only as honest as the data it consulted, so both travel with it.
 */
function AdaptiveStamp({ artifact, shipped, ok }: { artifact: AdaptiveResults; shipped: string; ok: boolean }) {
  const { meta } = artifact
  return (
    <div className={s.stamp}>
      <StampCell label="Rule set" value={`${meta.ruleSet} · ${meta.rulesFile}`} />
      <StampCell label="rulesHash — stamped" value={shortHash(meta.rulesHash)} />
      <StampCell
        label="rulesHash — shipped"
        value={ok ? `${shortHash(shipped)} · matches` : `${shortHash(shipped)} · MISMATCH`}
      />
      <StampCell label="Engine" value={meta.engineCommit} />
      <StampCell
        label="Games"
        value={`${count(meta.gamesTotal)} · seeds ${meta.seedSet.prefix}`}
      />
      <StampCell label="Generated" value={isoDate(meta.generatedAt)} />
      <StampCell
        label="Benchmark"
        value={`${meta.benchmark.artifact} · ${meta.benchmark.paired ? 'paired seeds' : 'UNPAIRED'}`}
      />
      <StampCell
        label="Counter table"
        value={`${meta.counterTableProvenance.artifact} · ${meta.counterTableProvenance.recordsDigest}`}
      />
      <StampCell
        label="Fingerprints"
        value={`${count(meta.fingerprintProvenance.gamesPerStyle)} games/style · ${meta.fingerprintProvenance.seedPrefix}`}
      />
    </div>
  )
}

export function LabAdaptive() {
  const { search } = useLocation()
  const which = caseFromSearch(search)

  const loaded = loadAdaptiveArtifact()
  if (!loaded.ok) {
    return (
      <ArtifactBroken which={which} current="/lab/adaptive" file={loaded.file} detail={loaded.detail} />
    )
  }
  const check = checkRules(loaded.artifact.meta.rulesHash, loaded.file)
  // SITE_SPEC.md §1.1 — refuse, with a message, before rendering a single number.
  if (!check.ok) return <RulesMismatch which={which} current="/lab/adaptive" check={check} />

  const artifact = loaded.artifact
  const { meta } = artifact
  const br = bestResponseColumns()
  const endAccuracy = artifact.classifier.accuracy.find((r) => r.events === 0)
  const chance = 1 / 9

  // The gauntlet, with the z each row's own delta and SE imply — recomputed here, not read.
  const gauntlet = artifact.gauntlet.map((g) => ({ ...g, z: g.delta / g.deltaSe }))
  const deltas = gauntlet.map((g) => g.delta)
  const worstDelta = Math.min(...deltas)
  const bestDelta = Math.max(...deltas)

  // Warmup share of all delegated decisions, per opponent and pooled.
  const usage = artifact.styleUsage.map((u) => ({
    ...u,
    share: u.decisions.warmup / (u.decisions.warmup + u.decisions.warm),
  }))
  const pooledWarmup =
    usage.reduce((t, u) => t + u.decisions.warmup, 0) /
    usage.reduce((t, u) => t + u.decisions.warmup + u.decisions.warm, 0)
  const shareLo = Math.min(...usage.map((u) => u.share))
  const shareHi = Math.max(...usage.map((u) => u.share))

  const mixedPositives = artifact.mixed.rows.filter((r) => r.delta > 0)

  return (
    <LabShell
      current={withCase('/lab/adaptive', which)}
      docTitle="The adaptive engine"
      which={which}
      stamp={`us54 · rulesHash ${shortHash(meta.rulesHash)}`}
    >
      {/* ---- hero ------------------------------------------------------------------------ */}
      <Section noRule noMarks>
        <MaskedLines
          level="h1"
          lines={['An engine that adapts,', 'measured against the style', '*it always becomes*.']}
        />
        <div className={s.split} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Reveal as="p" className={s.prose}>
            FishAI v1.0 watches the public log, keeps a running posterior over which of the nine
            styles each opponent seat is playing, and best-responds by delegating every decision
            to the style the measured counter table says pays most against that read. This page
            reports the committed v1.0 experiment suite — {count(meta.gamesTotal)} games —
            against the strongest possible null: a team that skips all of that machinery and
            simply plays Punter.
          </Reveal>
          <Reveal as="div" className={s.stack}>
            <p className={s.prose}>
              The result is <strong>negative, and it is the headline</strong>: over this roster,
              best-response adaptation degenerates to always-Punter — provably, and measured at
              100% of warm delegations — and then pays for its warmup. The adaptive team fell
              short of its own fixed-punter benchmark in all nine gauntlet cells and by{' '}
              {sgn4(artifact.mixed.pairedDelta)} ± {rate(artifact.mixed.deltaSe)} on mixed
              tables. Adaptation here is worth less than nothing.
            </p>
            <div className={buttonRow}>
              <Button href="#verdict" variant="line">
                Go straight to the verdict
              </Button>
              <Button href={withCase('/lab', which)} variant="ghost">
                The style report
              </Button>
            </div>
            <p className={s.figNote}>
              The engine is playable, not only measured:{' '}
              <TextLink href="/play" arrow={false}>
                take a seat against v1.0 yourself
              </TextLink>{' '}
              — it will be classifying your log too, and you are the off-roster opponent none of
              this page covers.
            </p>
          </Reveal>
        </div>

        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <AdaptiveStamp artifact={artifact} shipped={check.shipped} ok={check.ok} />
        </div>
      </Section>

      {/* ---- the mechanism --------------------------------------------------------------- */}
      <Section id="mechanism" badge="The mechanism">
        <SectionHead
          lines={['Watch, classify, counter —', 'and the counter is *always the same*.']}
          sub="v1.0 is four stages in a straight line. Everything it learns about its opponents flows into one decision — which style to delegate to — and over this roster that decision has exactly one answer."
        />
        <p className={s.prose}>
          The figure traces one decision through the four stages. The highlighted stage is where
          adaptation dies: the best-response lookup returns Punter whatever the classifier hands
          it.
        </p>
        <AdaptiveMechanism figNo="FIG. 01" />

        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Eyebrow tone="muted" track="head" as="h3">
            The degeneracy, stated exactly
          </Eyebrow>
          <p className={s.prose} style={{ marginTop: 16 }}>
            The adaptive team&rsquo;s expected score against a belief over opponent styles is a
            probability-weighted average of counter-table columns, so the best response to any
            belief is the row that maximises each column — and punter&rsquo;s row weakly
            dominates every column. The table below recomputes that claim in your browser from{' '}
            <code>COUNTER_TABLE</code>, the constant the engine actually plays from: nine
            columns, nine identical answers, with the margin over the runner-up printed so the
            distance from a flip is visible.
          </p>
        </div>
        <ScrollRegion label="Best response per opponent column of the counter table">
          <table className={s.table}>
            <caption>
              Best response per opponent column · counter table from{' '}
              {meta.counterTableProvenance.artifact} · {count(meta.counterTableProvenance.pairsPerCell)}{' '}
              pairs per cell · recomputed in the browser
            </caption>
            <thead>
              <tr>
                <th scope="col">Against</th>
                <th scope="col">Best response</th>
                <th scope="col">Its score</th>
                <th scope="col">SE</th>
                <th scope="col">Runner-up</th>
                <th scope="col">Its score</th>
                <th scope="col">Margin</th>
              </tr>
            </thead>
            <tbody>
              {br.map((c) => (
                <tr key={c.opponent}>
                  <th scope="row">{styleName(c.opponent)}</th>
                  <td>{styleName(c.best)}</td>
                  <td>{rate(c.bestP)}</td>
                  <td className={s.ns}>{c.bestSe === 0 ? '—' : rate(c.bestSe)}</td>
                  <td className={s.ns}>{styleName(c.runnerUp)}</td>
                  <td className={s.ns}>{rate(c.runnerUpP)}</td>
                  <td>{sgn4(c.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <p className={s.figNote}>
          Diagonal entries — punter&rsquo;s own column, and the runner-up in the blitz column —
          are the .5000 duplicate-pair identity (SE —), true by symmetry rather than measured;
          every other number is a measured cell. Warm delegation is therefore not merely
          observed at 100% Punter — under this table it cannot be anything else. The full 9×9
          matrix, with CIs and q-values, is on{' '}
          <TextLink href={withCase('/lab/matrix', which)}>the matrix page</TextLink>.
        </p>
      </Section>

      {/* ---- the gauntlet ---------------------------------------------------------------- */}
      <Section id="gauntlet" badge="The gauntlet">
        <SectionHead
          lines={['Nine pure opponents,', 'nine cells *below the line*.']}
          sub={`${count(meta.config.gauntletPairs)} duplicate pairs per cell on matrix v2's exact seed list, so every deal behind the punter benchmark was replayed by the adaptive team. P1 predicted the warm engine would match punter's row within CI. It did not — in any cell.`}
        />
        <p className={s.prose}>
          Each row below is the adaptive team against one pure style, beside punter&rsquo;s own
          score against that style on the same deals; the delta is the P1 statistic and the z is
          recomputed from the row&rsquo;s delta and SE in your browser.
        </p>
        <ScrollRegion label="Gauntlet cells against the paired punter benchmark">
          <table className={s.table}>
            <caption>
              Adaptive vs pure styles · {count(meta.config.gauntletPairs)} pairs per cell · paired
              against {meta.benchmark.artifact} · Δ = adaptive − punter row
            </caption>
            <thead>
              <tr>
                <th scope="col">Opponent</th>
                <th scope="col">Pairs</th>
                <th scope="col">Adaptive</th>
                <th scope="col">SE</th>
                <th scope="col">CI 95%</th>
                <th scope="col">Punter row</th>
                <th scope="col">SE</th>
                <th scope="col">Δ</th>
                <th scope="col">Δ SE</th>
                <th scope="col">z</th>
              </tr>
            </thead>
            <tbody>
              {gauntlet.map((g) => (
                <tr key={g.opponent}>
                  <th scope="row">{styleName(g.opponent)}</th>
                  <td>{count(g.pairs)}</td>
                  <td>{rate(g.score)}</td>
                  <td className={s.ns}>{rate(g.se)}</td>
                  <td className={s.ns}>{interval(g.ci95)}</td>
                  <td>{rate(g.punterBenchmark)}</td>
                  <td className={s.ns}>
                    {g.punterBenchmarkSe === 0 ? '—' : rate(g.punterBenchmarkSe)}
                  </td>
                  <td>{sgn4(g.delta)}</td>
                  <td className={s.ns}>{rate(g.deltaSe)}</td>
                  <td>{z2(g.z)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <p className={s.figNote}>
          Every delta is negative — from {sgn4(bestDelta)} (balanced, banker) to{' '}
          {sgn4(worstDelta)} (ghost). One cell rejects at the Bonferroni-corrected bound
          |z| &gt; 2.773 for nine simultaneous tests: punter itself, z −3.53, where the
          benchmark is the .5000 identity and the SE is smallest; ghost and archivist sit
          between 1.96 and the bound. The Δ SE is the conservative cross-run combination over
          shared deals — the runs replay the same seed list but their per-game records are not
          joined — so these tests are weaker than a jointly-recorded pairing would be, and the
          true shortfall is if anything better resolved than printed.
        </p>
        <div className={s.stackWide} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <p className={s.prose}>
            Drawn on an honest zero-anchored axis, the shortfall is nearly invisible — in every
            row the two dots almost coincide. That is the finding at a glance: v1.0 plays
            punter&rsquo;s game to within a hundredth, and loses the difference to its warmup.
          </p>
          <DumbbellChart model={gauntletDumbbell(artifact, 'FIG. 02')} />
        </div>
      </Section>

      {/* ---- the mixed screen ------------------------------------------------------------ */}
      <Section id="mixed" badge="The mixed screen">
        <SectionHead
          lines={['Twenty-four mixed tables,', 'one *paired* answer.']}
          sub="P2 predicted the delta against always-punter would be ≈ 0 on mixed opposition — the one roster setting where classifying opponents could plausibly pay, because different seats might warrant different counters. Instead, adaptation cost more."
        />
        <p className={s.prose}>
          Both arms played the same {count(artifact.mixed.compositions * artifact.mixed.pairsPer)}{' '}
          duplicate pairs — {count(artifact.mixed.compositions)} opposing compositions ×{' '}
          {count(artifact.mixed.pairsPer)} pairs — so the pooled delta below is truly paired
          within this run, deal for deal.
        </p>
        <div className={s.refuseBox}>
          <Eyebrow tone="muted" track="badge">
            Pooled per-deal delta · adaptive − punter · truly paired within this run
          </Eyebrow>
          <p className={s.stepAction} style={{ marginTop: 10 }}>
            {sgn4(artifact.mixed.pairedDelta)} ± {rate(artifact.mixed.deltaSe)} · 95% CI{' '}
            {interval(artifact.mixed.ci95)} · z {z2(artifact.mixed.pairedDelta / artifact.mixed.deltaSe)}
          </p>
          <p className={s.figNote}>
            Adaptive arm mean {rate(artifact.mixed.adaptiveMean)} · punter arm mean{' '}
            {rate(artifact.mixed.punterMean)}. The SE is clustered by seed: all{' '}
            {count(artifact.mixed.compositions)} compositions replay one identical{' '}
            {count(artifact.mixed.pairsPer)}-seed list, so a deal&rsquo;s replays are averaged
            within seed before the SE is taken — never counted as independent evidence. The
            interval still excludes zero: on mixed opposition the machinery does not merely fail
            to pay — it charges.
          </p>
        </div>
        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <ScrollRegion label="The 24 mixed compositions">
            <table className={s.table}>
              <caption>
                All {count(artifact.mixed.compositions)} opposing compositions · {count(artifact.mixed.pairsPer)}{' '}
                pairs per composition per arm · seeds {meta.config.mixedSeedPrefix}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Opposing composition</th>
                  <th scope="col">Pairs</th>
                  <th scope="col">Adaptive</th>
                  <th scope="col">Punter</th>
                  <th scope="col">Δ</th>
                  <th scope="col">Δ SE</th>
                </tr>
              </thead>
              <tbody>
                {artifact.mixed.rows.map((row) => (
                  <tr key={row.composition.join('-')}>
                    <th scope="row">{row.composition.map(styleName).join(' · ')}</th>
                    <td>{count(row.pairs)}</td>
                    <td>{rate(row.adaptive)}</td>
                    <td>{rate(row.punter)}</td>
                    <td>{sgn4(row.delta)}</td>
                    <td className={s.ns}>{rate(row.deltaSe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
          <p className={s.figNote}>
            {count(mixedPositives.length)} of {count(artifact.mixed.rows.length)} compositions
            came out positive
            {mixedPositives.length > 0
              ? ` (${mixedPositives
                  .map((r) => `${r.composition.map(styleName).join('/')} ${sgn4(r.delta)}`)
                  .join(', ')})`
              : ''}
            , none by more than one SE — scatter, not signal. The pooled paired estimate is the
            result, and it is {sgn4(artifact.mixed.pairedDelta)}.
          </p>
        </div>
      </Section>

      {/* ---- the oracle ablation --------------------------------------------------------- */}
      <Section id="oracle" badge="The oracle">
        <SectionHead
          lines={['A perfect read,', 'worth *exactly nothing*.']}
          sub="The ablation hands one arm the truth: the classifier is replaced by an oracle that knows each opponent seat's style outright. If classification quality were what holds v1.0 back, this is where it would show."
        />
        <p className={s.prose}>
          Nine paired cells, oracle arm against classifier arm on identical seeds; the delta is
          oracle − classifier.
        </p>
        <ScrollRegion label="Oracle-ablation cells">
          <table className={s.table}>
            <caption>
              Oracle vs classifier · {count(meta.config.oraclePairs)} pairs per cell · paired
              within this run
            </caption>
            <thead>
              <tr>
                <th scope="col">Opponent</th>
                <th scope="col">Pairs</th>
                <th scope="col">Classifier arm</th>
                <th scope="col">Oracle arm</th>
                <th scope="col">Δ</th>
                <th scope="col">SE</th>
              </tr>
            </thead>
            <tbody>
              {artifact.oracle.map((row) => (
                <tr key={row.opponent}>
                  <th scope="row">{styleName(row.opponent)}</th>
                  <td>{count(row.pairs)}</td>
                  <td>{rate(row.classifier)}</td>
                  <td>{rate(row.oracle)}</td>
                  <td>{rate(row.delta)}</td>
                  <td className={s.ns}>{rate(row.se)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <p className={s.figNote}>
          Zero to four decimal places, with zero variance, in all nine cells — because the two
          arms are the same games. With a dominant counter-table row, the oracle and the
          classifier delegate to the same style at every decision; the deterministic engine then
          produces identical move sequences, and the paired deltas vanish identically rather
          than statistically. This is the sharpest confirmation of the degeneracy the suite
          contains: P3 is confirmed exactly, and it is the same fact as P1&rsquo;s refutation
          seen from the other side.
        </p>
      </Section>

      {/* ---- the classifier -------------------------------------------------------------- */}
      <Section id="classifier" badge="The classifier">
        <SectionHead
          lines={['The read is real,', 'but the table is *deaf to it*.']}
          sub="The classifier is the one stage whose output the best response provably ignores here, so its accuracy is measured on its own terms: single games between pure teams, every ordered pairing of distinct styles, the three opposing seats read at each log truncation."
        />
        <div className={s.stackWide}>
          <p className={s.prose}>
            The first figure is top-1 accuracy against how much of the public log the classifier
            was allowed to see. Chance is one in nine.
          </p>
          <LineChart model={classifierLine(artifact, 'FIG. 03')} />
        </div>
        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <p className={s.prose}>
            Per style, at the full log — {endAccuracy ? count(endAccuracy.seats) : '—'} seat
            reads:
          </p>
          <ScrollRegion label="End-of-game classifier accuracy per style">
            <table className={s.table}>
              <caption>
                Top-1 accuracy at end of game · {count(endAccuracy?.seats ?? 0)} seat reads ·
                chance = 1/9 ≈ {rate(chance)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">True style</th>
                  <th scope="col">Seat reads</th>
                  <th scope="col">Top-1</th>
                  <th scope="col">vs chance</th>
                </tr>
              </thead>
              <tbody>
                {endAccuracy
                  ? artifact.classifier.confusion.styles.map((id) => {
                      const cell = endAccuracy.byStyle[id]
                      return (
                        <tr key={id}>
                          <th scope="row">{styleName(id)}</th>
                          <td>{count(cell.seats)}</td>
                          <td>{rate(cell.top1)}</td>
                          <td className={s.ns}>{sgn4(cell.top1 - chance)}</td>
                        </tr>
                      )
                    })
                  : null}
                {endAccuracy ? (
                  <tr>
                    <th scope="row">Overall</th>
                    <td>{count(endAccuracy.seats)}</td>
                    <td>{rate(endAccuracy.top1)}</td>
                    <td className={s.ns}>{sgn4(endAccuracy.top1 - chance)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </ScrollRegion>
        </div>
        <div className={s.split} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>The confusion structure, in words</h3>
            <p className={s.figNote}>
              Ghost is the one style the classifier genuinely reads (.5042), followed by Scout
              (.4125) — the two whose fingerprints diverge most from everyone else&rsquo;s.
              Hoarder (.3092) and Turtle (.2717) clear chance but fall well short of the
              &ldquo;good&rdquo; P4 predicted. And the classifier over-calls the distinctive
              styles: Ghost is the single most-predicted label for balanced, blitz, punter{' '}
              <em>and</em> banker seats, so most of the matrix&rsquo;s mass sits in the
              ghost and scout columns regardless of the truth.
            </p>
          </div>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>The quadrangle caveat</h3>
            <p className={s.figNote}>
              Balanced (.0558 — below chance), Blitz (.0925), Punter (.1292) and Banker (.1258)
              are near-unreadable, and of their misclassifications only 30–40% even land inside
              the balanced/blitz/punter/banker quadrangle — the confusion is diffuse, not a
              tidy clique. This ties directly to the inert-axis finding on the style report:
              those four styles diverge from the Balanced control on under 1.3% of decisions
              (STYLES.md §6.1), so one public log simply carries very little to tell them
              apart. P4 called the quadrangle correctly and overrated the loners — the artifact
              scores it <em>mixed</em>.
            </p>
          </div>
        </div>
      </Section>

      {/* ---- what v1.0 played ------------------------------------------------------------ */}
      <Section id="usage" badge="What it played">
        <SectionHead
          lines={['Half the game on the anchor,', 'the rest *on punter*.']}
          sub="The suite records every delegated decision, so there is no mystery about what the adaptive engine actually did — and the record is the mechanism behind the gauntlet shortfall."
        />
        <p className={s.prose}>
          Per opponent: how many decisions fell in the warmup (the anchor plays Balanced until
          the log holds roughly 60 observed events) and how many after it, and what each phase
          delegated to.
        </p>
        <ScrollRegion label="Delegation record per opponent">
          <table className={s.table}>
            <caption>
              Every adaptive decision in the gauntlet · warmup = Balanced anchor · warm =
              posterior-driven best response
            </caption>
            <thead>
              <tr>
                <th scope="col">Opponent</th>
                <th scope="col">Warmup decisions</th>
                <th scope="col">Warm decisions</th>
                <th scope="col">Warmup share</th>
                <th scope="col">Warmup delegated to</th>
                <th scope="col">Warm delegated to</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.opponent}>
                  <th scope="row">{styleName(u.opponent)}</th>
                  <td>{count(u.decisions.warmup)}</td>
                  <td>{count(u.decisions.warm)}</td>
                  <td>{pct(u.share)}</td>
                  <td>
                    {Object.entries(u.warmupShares)
                      .filter(([, v]) => v > 0)
                      .map(([id, v]) => `${styleName(id as StyleId)} ${pct(v, 0)}`)
                      .join(' · ')}
                  </td>
                  <td>
                    {Object.entries(u.warmShares)
                      .filter(([, v]) => v > 0)
                      .map(([id, v]) => `${styleName(id as StyleId)} ${pct(v, 0)}`)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <p className={s.figNote}>
          The warmup covered {pct(shareLo)}–{pct(shareHi)} of decisions depending on opponent —{' '}
          {pct(pooledWarmup)} pooled — and Balanced scores below Punter against every column of
          the counter table. The warmup is therefore not a neutral prelude but a measured tax
          paid on more than half of every game, and the all-negative gauntlet deltas are its
          bill. Warm delegation was 100% Punter in all nine cells: the degeneracy, observed.
        </p>
      </Section>

      {/* ---- the verdict ----------------------------------------------------------------- */}
      <Section id="verdict" noMarks>
        <p className={s.prose} style={{ marginBottom: 'var(--fa-sp-head)' }}>
          Four predictions were written down before the run, derived from the committed counter
          table; the suite&rsquo;s job was to check the implication against play, not to
          discover it. Here is how each landed — the verdict words are the artifact&rsquo;s
          own, and every number they cite is printed in the sections above.
        </p>
        <InkPanel fig="FIG. 04 — The verdict" live="VERDICT · NEGATIVE">
          <div className={inkPanelBody} style={{ display: 'block' }}>
            <div className={s.verdictHead}>
              <h2 className={s.verdictWord}>worth less than nothing</h2>
              <Eyebrow tone="muted" track="badge">
                Four pre-registered predictions · P1–P4 · stated before the run
              </Eyebrow>
            </div>
            <p className={s.verdictSummary}>
              Best-response adaptation over this roster degenerates to always-Punter — provably
              from the committed counter table, and measured at 100% of warm delegations — and
              then underpays for its warmup. Against every pure opponent, and pooled over 24
              mixed tables, the adaptive team scored below a team that simply plays Punter from
              the first move.
            </p>
            <p className={s.verdictSummary}>
              That is a result, not a failure: the suite measured exactly the thing it was built
              to measure, and the answer is that this roster gives adaptation nothing to buy.
            </p>
            <ol className={s.criteria}>
              {artifact.verdicts.map((v) => {
                const mark = VERDICT_MARK[v.verdict]
                return (
                  <li key={v.id} className={s.criterion}>
                    <span className={s.criterionNo}>({v.id})</span>
                    <span className={s.criterionLabel}>
                      {PREDICTION_LABEL[v.id] ?? v.prediction}
                    </span>
                    <span className={`${s.mark} ${mark.cls}`}>{mark.word}</span>
                    <span className={s.criterionDetail}>{v.detail}</span>
                  </li>
                )
              })}
            </ol>
            <p className={s.figNote}>
              What would change the answer: an intransitive roster — a counter table with no
              dominant row leaves the classifier something to buy; off-roster opponents — the
              human at <TextLink href="/play">/play</TextLink> is one; or a rule-set shift that
              re-prices the styles. On this roster, under us54, the honest engineering advice
              is: play Punter and skip the machinery.
            </p>
          </div>
        </InkPanel>
      </Section>

      {/* ---- sources --------------------------------------------------------------------- */}
      <Section id="sources" badge="Sources">
        <SectionHead
          lines={['Everything above', 'is *checkable*.']}
          sub="One artifact, one schema, one rule document — plus the provenance of the two committed calibrations the engine consulted, because an adaptive result is only as honest as the data it played from."
        />
        <div className={s.split}>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>The run</h3>
            <p className={s.figNote}>
              <span className={s.mono}>{loaded.file}</span> — schema {meta.schemaVersion},
              emitted by <span className={s.mono}>{meta.engineCommit}</span> at{' '}
              {isoDate(meta.generatedAt)}, records digest{' '}
              <span className={s.mono}>{meta.recordsDigest}</span>, wall clock{' '}
              {(meta.wallMs / 60000).toFixed(1)} minutes for {count(meta.gamesTotal)} games.
              Gauntlet {count(meta.config.gauntletPairs)} pairs × 9 cells on seeds{' '}
              <span className={s.mono}>{meta.config.gauntletSeedPrefix}</span>; mixed screen{' '}
              {count(meta.config.mixedCompositions)} compositions × {count(meta.config.mixedPairs)}{' '}
              pairs × 2 arms; oracle {count(meta.config.oraclePairs)} pairs × 9 cells; classifier
              accuracy {count(meta.config.accGames)} games per ordered pairing, checkpoints{' '}
              {meta.config.accCheckpoints.join(' / ')} events plus end of game. Step cap{' '}
              {count(meta.config.stepCap)}, invariants checked{' '}
              <span className={s.mono}>{meta.config.invariantCheck}</span> step. It is imported,
              not fetched: Vite ships it inside this route&rsquo;s chunk.
            </p>
          </div>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>Health</h3>
            <p className={s.figNote}>
              All gates zero: illegal actions {count(meta.health.illegalActions)}, capped games{' '}
              {count(meta.health.cappedGames)}, invariant violations{' '}
              {count(meta.health.invariantViolations)}, ties {count(meta.health.ties)}, voids{' '}
              {count(meta.health.voids)}, non-clinch finishes {count(meta.health.nonClinch)}.
              The adaptive mirror — {count(artifact.mirror.pairs)} self-play pairs — scored
              exactly {rate(artifact.mirror.score)} with SE {rate(artifact.mirror.se)}: the
              engine is deterministic and the duplicate design is exactly symmetric, so anything
              but .5000 there would have voided the run.
            </p>
          </div>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>Consulted calibrations</h3>
            <p className={s.figNote}>
              <strong>Counter table</strong> — {meta.counterTableProvenance.artifact}, records
              digest <span className={s.mono}>{meta.counterTableProvenance.recordsDigest}</span>,
              emitted by <span className={s.mono}>{meta.counterTableProvenance.engineCommit}</span>{' '}
              at {isoDate(meta.counterTableProvenance.generatedAt)},{' '}
              {count(meta.counterTableProvenance.pairsPerCell)} pairs per cell.
              <br />
              <strong>Fingerprints</strong> —{' '}
              <span className={s.mono}>{meta.fingerprintProvenance.command}</span>,{' '}
              {count(meta.fingerprintProvenance.gamesPerStyle)} games per style on seeds{' '}
              <span className={s.mono}>{meta.fingerprintProvenance.seedPrefix}</span>, variant{' '}
              {meta.fingerprintProvenance.variant}, step cap{' '}
              {count(meta.fingerprintProvenance.stepCap)}.
              <br />
              <strong>Benchmark</strong> — {meta.benchmark.note}
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
                'The nine-style roster, the payoff matrix the counter table was cut from, and ' +
                'the verdict machinery this page inherits its discipline from — including the ' +
                'glossary for duplicate pairs, score rate and SE.',
            },
            {
              ix: 'L2',
              title: 'The live simulator',
              role: '/lab/live',
              body:
                'Runs real duplicate pairs in this tab, and fishai-v1 is on its roster: put ' +
                'the adaptive engine against any pure style at demo scale and watch the ' +
                'numbers land near the cells above.',
            },
            {
              ix: 'L3',
              title: 'The table',
              role: '/play',
              body:
                'v1.0 is a playable mode. A human is an off-roster opponent — exactly the ' +
                'kind of population this page’s negative result does not cover, and the ' +
                'reason the machinery is kept.',
            },
          ]}
        />
        <p className={s.figNote} style={{ marginTop: 'var(--fa-sp-head)' }}>
          Method vocabulary — duplicate pair, score rate, standard error — is defined in{' '}
          <TextLink href={withCase('/lab', which) + '#sources'}>
            the report&rsquo;s glossary
          </TextLink>
          . The pre-registration discipline here is BOT_LAB.md §5&rsquo;s: predictions derived
          from committed data before the run, and a refuted prediction emitted as{' '}
          <code>refuted</code>, not massaged.
        </p>
      </Section>
    </LabShell>
  )
}

export default LabAdaptive
