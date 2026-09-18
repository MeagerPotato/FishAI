/**
 * `/lab/adaptive` — the Bass v1.0 results page.
 *
 * The page reports one committed artifact (`src/lab/data/adaptive-results.json`, parsed at the
 * boundary by `adaptive-artifact.ts`) against four predictions that were written down before
 * the run. It carries the data only; the explanations live in the v1.0 paper
 * (`papers/fishai-v10.tex`, served at `/papers/fishai-v10.pdf`).
 *
 * ## The accent budget (SITE_SPEC.md §2.1)
 *
 * One accent-text spend: the verdict chip on the ink panel (`live="VERDICT · NO GAIN"`).
 * The nav gets no `cta`, and the tables are ink. The remaining amber belongs to the diagram
 * system's own per-figure budgets — the mechanism strip's focal stage and delegation arrow, the
 * dumbbell's solid series dot, the line chart's focal series — which §3.2 requires of every
 * figure regardless of what this page wants.
 *
 * ## What is recomputed and what is read
 *
 * The best-response table is recomputed in the browser from `COUNTER_TABLE` — the constant the
 * engine actually plays from — and the gauntlet z column is recomputed from each row's delta
 * and SE. The four P1–P4 verdict words are the artifact's own, printed verbatim.
 */

import { useLocation } from 'react-router-dom'
import {
  Eyebrow,
  InkPanel,
  MaskedLines,
  Section,
  SectionHead,
  TextLink,
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
import { LabContents, type LabSection } from '../lab/ui/LabContents.tsx'
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

const CONTENTS: readonly LabSection[] = [
  { id: 'mechanism', label: 'The mechanism' },
  { id: 'gauntlet', label: 'The gauntlet' },
  { id: 'mixed', label: 'The mixed screen' },
  { id: 'oracle', label: 'The oracle ablation' },
  { id: 'classifier', label: 'The classifier' },
  { id: 'usage', label: 'What it played' },
  { id: 'verdict', label: 'The verdict' },
]

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

  // Warmup share of all delegated decisions, per opponent and pooled.
  const usage = artifact.styleUsage.map((u) => ({
    ...u,
    share: u.decisions.warmup / (u.decisions.warmup + u.decisions.warm),
  }))
  const pooledWarmup =
    usage.reduce((t, u) => t + u.decisions.warmup, 0) /
    usage.reduce((t, u) => t + u.decisions.warmup + u.decisions.warm, 0)

  return (
    <LabShell
      current={withCase('/lab/adaptive', which)}
      docTitle="The adaptive engine"
      which={which}
      stamp={`us54 · rulesHash ${shortHash(meta.rulesHash)}`}
    >
      {/* ---- hero ------------------------------------------------------------------------ */}
      <Section noRule noMarks>
        <MaskedLines level="h1" lines={['The adaptive engine', '*Bass v1.0*']} />
        <p className={s.figNote} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <TextLink href="/papers/fishai-v10.pdf" arrow={false}>
            Paper (PDF)
          </TextLink>
          {' · '}
          <TextLink href={withCase('/lab', which)} arrow={false}>
            Style report
          </TextLink>
          {' · '}
          <TextLink href={withCase('/lab/matrix', which)} arrow={false}>
            Full matrix
          </TextLink>
          {' · '}
          <TextLink href={withCase('/lab/bounded', which)} arrow={false}>
            Bounded memory
          </TextLink>
          {' · '}
          <TextLink href={withCase('/lab/live', which)} arrow={false}>
            Live simulator
          </TextLink>
          {' · '}
          <TextLink href="/play" arrow={false}>
            Play
          </TextLink>
        </p>

        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <AdaptiveStamp artifact={artifact} shipped={check.shipped} ok={check.ok} />
        </div>

        <LabContents sections={CONTENTS} />
      </Section>

      {/* ---- the mechanism --------------------------------------------------------------- */}
      <Section id="mechanism" badge="The mechanism">
        <SectionHead lines={['Watch, classify, counter']} />
        <AdaptiveMechanism figNo="FIG. 01" />
        <ScrollRegion
          label="Best response per opponent column of the counter table"
          style={{ marginTop: 'var(--fa-sp-head)' }}
        >
          <table className={s.table}>
            <caption>
              Best response per opponent column · counter table{' '}
              {meta.counterTableProvenance.artifact} ·{' '}
              {count(meta.counterTableProvenance.pairsPerCell)} pairs per cell
            </caption>
            <thead>
              <tr>
                <th scope="col">Opponent column</th>
                <th scope="col">Best response</th>
                <th scope="col">Best-response score rate</th>
                <th scope="col">Best-response SE</th>
                <th scope="col">Runner-up</th>
                <th scope="col">Runner-up score rate</th>
                <th scope="col">Margin (best − runner-up)</th>
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
      </Section>

      {/* ---- the gauntlet ---------------------------------------------------------------- */}
      <Section id="gauntlet" badge="The gauntlet">
        <SectionHead lines={['Adaptive vs pure styles']} />
        <ScrollRegion label="Gauntlet cells against the paired punter benchmark">
          <table className={s.table}>
            <caption>
              Gauntlet · {count(meta.config.gauntletPairs)} pairs per cell · benchmark{' '}
              {meta.benchmark.artifact}
            </caption>
            <thead>
              <tr>
                <th scope="col">Opponent style</th>
                <th scope="col">Duplicate pairs</th>
                <th scope="col">Adaptive score rate</th>
                <th scope="col">Adaptive SE</th>
                <th scope="col">Adaptive CI 95%</th>
                <th scope="col">Punter score rate</th>
                <th scope="col">Punter SE</th>
                <th scope="col">Δ (adaptive − punter)</th>
                <th scope="col">Δ SE</th>
                <th scope="col">z (Δ ÷ Δ SE)</th>
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
        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <DumbbellChart model={gauntletDumbbell(artifact, 'FIG. 02')} />
        </div>
      </Section>

      {/* ---- the mixed screen ------------------------------------------------------------ */}
      <Section id="mixed" badge="The mixed screen">
        <SectionHead lines={['Mixed opposition']} />
        <div className={s.refuseBox}>
          <Eyebrow tone="muted" track="badge">
            Pooled paired delta · adaptive − punter
          </Eyebrow>
          <p className={s.stepAction} style={{ marginTop: 10 }}>
            {sgn4(artifact.mixed.pairedDelta)} ± {rate(artifact.mixed.deltaSe)} · 95% CI{' '}
            {interval(artifact.mixed.ci95)} · z {z2(artifact.mixed.pairedDelta / artifact.mixed.deltaSe)}
          </p>
          <p className={s.figNote}>
            Adaptive arm mean {rate(artifact.mixed.adaptiveMean)} · punter arm mean{' '}
            {rate(artifact.mixed.punterMean)}
          </p>
        </div>
        <ScrollRegion label="The 24 mixed compositions" style={{ marginTop: 'var(--fa-sp-head)' }}>
          <table className={s.table}>
            <caption>
              All {count(artifact.mixed.compositions)} opposing compositions · {count(artifact.mixed.pairsPer)}{' '}
              pairs per composition per arm · seeds {meta.config.mixedSeedPrefix}
            </caption>
            <thead>
              <tr>
                <th scope="col">Opposing composition</th>
                <th scope="col">Duplicate pairs</th>
                <th scope="col">Adaptive score rate</th>
                <th scope="col">Punter score rate</th>
                <th scope="col">Δ (adaptive − punter)</th>
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
      </Section>

      {/* ---- the oracle ablation --------------------------------------------------------- */}
      <Section id="oracle" badge="The oracle">
        <SectionHead lines={['Oracle ablation']} />
        <ScrollRegion label="Oracle-ablation cells">
          <table className={s.table}>
            <caption>
              Oracle vs classifier · {count(meta.config.oraclePairs)} pairs per cell
            </caption>
            <thead>
              <tr>
                <th scope="col">Opponent style</th>
                <th scope="col">Duplicate pairs</th>
                <th scope="col">Classifier-arm score rate</th>
                <th scope="col">Oracle-arm score rate</th>
                <th scope="col">Δ (oracle − classifier)</th>
                <th scope="col">Δ SE</th>
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
      </Section>

      {/* ---- the classifier -------------------------------------------------------------- */}
      <Section id="classifier" badge="The classifier">
        <SectionHead lines={['Classifier accuracy']} />
        <LineChart model={classifierLine(artifact, 'FIG. 03')} />
        <ScrollRegion
          label="End-of-game classifier accuracy per style"
          style={{ marginTop: 'var(--fa-sp-head)' }}
        >
          <table className={s.table}>
            <caption>
              Top-1 accuracy at end of game · {count(endAccuracy?.seats ?? 0)} seat reads ·
              chance = 1/9 ≈ {rate(chance)}
            </caption>
            <thead>
              <tr>
                <th scope="col">True style</th>
                <th scope="col">Seat reads</th>
                <th scope="col">Top-1 accuracy</th>
                <th scope="col">Top-1 − chance (1/9)</th>
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
      </Section>

      {/* ---- what v1.0 played ------------------------------------------------------------ */}
      <Section id="usage" badge="What it played">
        <SectionHead lines={['Delegation record']} />
        <ScrollRegion label="Delegation record per opponent">
          <table className={s.table}>
            <caption>
              Every adaptive decision in the gauntlet · pooled warmup share {pct(pooledWarmup)}
            </caption>
            <thead>
              <tr>
                <th scope="col">Opponent style</th>
                <th scope="col">Warmup decisions</th>
                <th scope="col">Warm decisions</th>
                <th scope="col">Warmup share of decisions</th>
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
      </Section>

      {/* ---- the verdict ----------------------------------------------------------------- */}
      <Section id="verdict" noMarks>
        <InkPanel fig="FIG. 04 — The verdict" live="VERDICT · NO GAIN">
          <div className={inkPanelBody} style={{ display: 'block' }}>
            <div className={s.verdictHead}>
              <h2 className={s.verdictWord}>no gain over Punter</h2>
              <Eyebrow tone="muted" track="badge">
                Pre-registered predictions · P1–P4
              </Eyebrow>
            </div>
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
          </div>
        </InkPanel>
      </Section>
    </LabShell>
  )
}

export default LabAdaptive
