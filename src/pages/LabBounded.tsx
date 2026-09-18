/**
 * `/lab/bounded` — the Bass v1.5 results page: the bounded-memory ladder, priced.
 *
 * The page reports one committed artifact (`src/lab/data/bounded-results.json`, parsed at the
 * boundary by `bounded-artifact.ts`) against eight predictions that were written down before
 * their runs — P1–P7 before the base suite, P8 before the E4b follow-up, the E4b-power grid
 * before the run of record. It carries the data only; the explanations live in the v1.5 paper
 * (`papers/fishai-v15.tex`, served at `/papers/fishai-v15.pdf`).
 *
 * ## The accent budget (SITE_SPEC.md §2.1)
 *
 * One accent-text spend: the verdict chip on the ink panel. The nav gets no `cta`, and the
 * tables are ink. The remaining amber belongs to the diagram system's own per-figure budgets —
 * each line chart's one focal series — which §3.2 requires of every figure regardless of what
 * this page wants.
 *
 * ## What is recomputed and what is read
 *
 * The eight verdict words are the artifact's own, printed verbatim. The z columns of the delta
 * tables are recomputed in the browser from each row's delta and SE. MIXED verdicts are printed
 * as MIXED.
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
import { LineChart } from '../diagrams/index.ts'
import type { BoundedResults } from '../../lib/lab/bounded-types.ts'
import type { VerdictValue } from '../../lib/lab/adaptive-types.ts'
import { loadBoundedArtifact } from '../lab/bounded-artifact.ts'
import { accuracyLine, bitsLabel, evidenceLine, ladderLine } from '../lab/boundedFigures.ts'
import { caseFromSearch } from '../lab/artifact.ts'
import { count, interval, isoDate, pct, rate } from '../lab/format.ts'
import { checkRules, shortHash } from '../lab/rules.ts'
import { LabContents, type LabSection } from '../lab/ui/LabContents.tsx'
import { LabShell, withCase } from '../lab/ui/LabShell.tsx'
import { ArtifactBroken, RulesMismatch } from '../lab/ui/Refusal.tsx'
import { ScrollRegion } from '../lab/ui/ScrollRegion.tsx'
import s from '../lab/ui/lab.module.css'

/** `−.0136` / `+.0100` — a signed four-place delta, true minus sign. */
function sgn4(v: number): string {
  return `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(4).replace(/^0/, '')}`
}

/** `−2.75` — a z-score, two places. */
function z2(v: number): string {
  return `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}`
}

/** `.0348` / `<.0001` — a p-value, four places, never a rounded zero. */
function pv(v: number): string {
  return v < 0.0001 ? '<.0001' : v.toFixed(4).replace(/^0/, '')
}

const VERDICT_MARK: Record<VerdictValue, { cls: string; word: string }> = {
  confirmed: { cls: s.markPass, word: 'Confirmed' },
  refuted: { cls: s.markFail, word: 'Refuted' },
  mixed: { cls: s.markUnknown, word: 'Mixed' },
}

const CONTENTS: readonly LabSection[] = [
  { id: 'ladder', label: 'The ladder' },
  { id: 'tiers', label: 'Tier calibration' },
  { id: 'evidence', label: 'Evidence age' },
  { id: 'pressure', label: 'Style under pressure' },
  { id: 'verdict', label: 'The verdicts' },
]

/** One-line names for the pre-registered predictions; the full text sits in the detail. */
const PREDICTION_LABEL: Record<string, string> = {
  P1: 'The ladder is monotone at every adjacent rung',
  P2: 'The ∞ pairing is an exact mirror (health)',
  P3: 'Each shipped tier prices at a finite, ordered bits-equivalent',
  P4: 'Full-memory policies are age-flat',
  P5: 'Bounded policies decay, half-life rising with bits',
  P6: 'The noise tier is flat inside its window, cliff-edged at it',
  P7: 'Accuracy is non-increasing as bits shrink — both teams bounded',
  P8: 'Accuracy is non-increasing as bits shrink — the read seat alone',
}

/** Display names for the E3 curves, in the artifact's own order. */
function policyName(policy: string): string {
  if (policy === 'reference') return 'Full memory (reference)'
  if (policy === 'tier-easy') return 'Easy tier (noise)'
  if (policy === 'tier-medium') return 'Medium tier'
  if (policy === 'tier-hard') return 'Hard tier'
  if (policy === 'bounded-inf') return '∞ bits'
  if (policy.startsWith('bounded-')) return `${policy.slice('bounded-'.length)} bits`
  return policy
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
 * The provenance stamp, above the fold. The bounded artifact carries the base suite's
 * provenance PLUS the E4b-power run's own — two runs, two digests, one document — and the
 * committed v1.0 anchor the ∞ cell is required to reproduce, because a cross-artifact anchor
 * is only as honest as the artifact it anchors to.
 */
function BoundedStamp({ artifact, shipped, ok }: { artifact: BoundedResults; shipped: string; ok: boolean }) {
  const { meta } = artifact
  const power = artifact.accuracySingle
  return (
    <div className={s.stamp}>
      <StampCell label="Rule set" value={`${meta.ruleSet} · ${meta.rulesFile}`} />
      <StampCell label="rulesHash — stamped" value={shortHash(meta.rulesHash)} />
      <StampCell
        label="rulesHash — shipped"
        value={ok ? `${shortHash(shipped)} · matches` : `${shortHash(shipped)} · MISMATCH`}
      />
      <StampCell label="Engine — base run" value={meta.engineCommit} />
      <StampCell
        label="Base run"
        value={`${count(meta.gamesTotal)} games · seeds ${meta.seedSet.prefix} · ${isoDate(meta.generatedAt)}`}
      />
      <StampCell
        label="E4b-power run"
        value={`${count(power.meta.gamesTotal)} games · seeds ${power.accSeedPrefix} · ${isoDate(power.meta.generatedAt)}`}
      />
      <StampCell label="Records digests" value={`${meta.recordsDigest} · ${power.meta.recordsDigest}`} />
      <StampCell
        label="v1.0 anchor"
        value={
          meta.baseline
            ? `${meta.baseline.artifact} · end top-1 ${rate(meta.baseline.endTop1)}`
            : 'none stamped'
        }
      />
    </div>
  )
}

export function LabBounded() {
  const { search } = useLocation()
  const which = caseFromSearch(search)

  const loaded = loadBoundedArtifact()
  if (!loaded.ok) {
    return (
      <ArtifactBroken which={which} current="/lab/bounded" file={loaded.file} detail={loaded.detail} />
    )
  }
  const check = checkRules(loaded.artifact.meta.rulesHash, loaded.file)
  // SITE_SPEC.md §1.1 — refuse, with a message, before rendering a single number.
  if (!check.ok) return <RulesMismatch which={which} current="/lab/bounded" check={check} />

  const artifact = loaded.artifact
  const { meta } = artifact

  // The ladder, with the z each rung's own delta and SE imply — recomputed here, not read.
  const ladderDeltas = artifact.ladderDeltas.map((d) => ({
    ...d,
    zHere: d.se === 0 ? 0 : d.delta / d.se,
  }))

  const cross = artifact.crossDesign
  const pilot = artifact.accuracySinglePilot
  const power = artifact.accuracySingle

  const confirmedCount = artifact.verdicts.filter((v) => v.verdict === 'confirmed').length
  const mixedCount = artifact.verdicts.filter((v) => v.verdict === 'mixed').length
  const refutedCount = artifact.verdicts.filter((v) => v.verdict === 'refuted').length

  return (
    <LabShell
      current={withCase('/lab/bounded', which)}
      docTitle="The bounded-memory ladder"
      which={which}
      stamp={`us54 · rulesHash ${shortHash(meta.rulesHash)}`}
    >
      {/* ---- hero ------------------------------------------------------------------------ */}
      <Section noRule noMarks>
        <MaskedLines level="h1" lines={['The bounded-memory ladder', '*Bass v1.5*']} />
        <p className={s.figNote} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <TextLink href="/papers/fishai-v15.pdf" arrow={false}>
            Paper (PDF)
          </TextLink>
          {' · '}
          <TextLink href={withCase('/lab/adaptive', which)} arrow={false}>
            Adaptive engine
          </TextLink>
          {' · '}
          <TextLink href={withCase('/lab', which)} arrow={false}>
            Style report
          </TextLink>
          {' · '}
          <TextLink href="/play" arrow={false}>
            Play
          </TextLink>
        </p>

        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <BoundedStamp artifact={artifact} shipped={check.shipped} ok={check.ok} />
        </div>

        <LabContents sections={CONTENTS} />
      </Section>

      {/* ---- the ladder ------------------------------------------------------------------ */}
      <Section id="ladder" badge="The ladder">
        <SectionHead lines={['Set-share by memory budget']} />
        <LineChart model={ladderLine(artifact)} />
        <ScrollRegion label="Ladder cells with per-rung standard errors">
          <table className={s.table}>
            <caption>
              Set-share per budget · {count(meta.config.ladderPairs)} pairs per rung · seeds{' '}
              {meta.config.ladderSeedPrefix}
            </caption>
            <thead>
              <tr>
                <th scope="col">Memory budget (bits)</th>
                <th scope="col">Duplicate pairs</th>
                <th scope="col">Set-share</th>
                <th scope="col">Set-share SE</th>
                <th scope="col">Set-share CI 95%</th>
                <th scope="col">Mean moves per game</th>
              </tr>
            </thead>
            <tbody>
              {artifact.ladder.map((r) => (
                <tr key={r.bits}>
                  <th scope="row">{bitsLabel(r.bits)}</th>
                  <td>{count(r.pairs)}</td>
                  <td>{rate(r.share)}</td>
                  <td className={s.ns}>{r.se === 0 ? '—' : rate(r.se)}</td>
                  <td className={s.ns}>{interval(r.ci95)}</td>
                  <td className={s.ns}>{r.avgMoves.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <ScrollRegion
          label="Adjacent-rung deltas, the P1 statistic"
          style={{ marginTop: 'var(--fa-sp-head)' }}
        >
          <table className={s.table}>
            <caption>
              The P1 test · paired over {count(artifact.ladderDeltas[0]?.seeds ?? 0)} seeds · rule:
              Δ ≥ −2·SE
            </caption>
            <thead>
              <tr>
                <th scope="col">Rung (from → to)</th>
                <th scope="col">Δ set-share (to − from)</th>
                <th scope="col">SE(Δ)</th>
                <th scope="col">z (Δ ÷ SE)</th>
                <th scope="col">P1 rule</th>
              </tr>
            </thead>
            <tbody>
              {ladderDeltas.map((d) => (
                <tr key={`${d.fromBits}-${d.toBits}`}>
                  <th scope="row">
                    {bitsLabel(d.fromBits)} → {bitsLabel(d.toBits)}
                  </th>
                  <td>{sgn4(d.delta)}</td>
                  <td className={s.ns}>{d.se === 0 ? '—' : rate(d.se)}</td>
                  <td>{z2(d.zHere)}</td>
                  <td className={s.ns}>{d.pass ? 'passes' : 'VIOLATES'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Section>

      {/* ---- tier calibration ------------------------------------------------------------ */}
      <Section id="tiers" badge="Tier calibration">
        <SectionHead lines={['Shipped tiers in bits']} />
        <ScrollRegion label="Shipped tiers interpolated onto the ladder">
          <table className={s.table}>
            <caption>E2 · {count(meta.config.tierPairs)} pairs per tier</caption>
            <thead>
              <tr>
                <th scope="col">Shipped tier</th>
                <th scope="col">Set-share</th>
                <th scope="col">Set-share SE</th>
                <th scope="col">Bits-equivalent</th>
                <th scope="col">Bits-equivalent CI 95%</th>
              </tr>
            </thead>
            <tbody>
              {artifact.tiers.map((t) => (
                <tr key={t.tier}>
                  <th scope="row">{t.tier}</th>
                  <td>{rate(t.share)}</td>
                  <td className={s.ns}>{rate(t.se)}</td>
                  <td>{t.bitsEquivalent.bits === null ? 'none finite' : t.bitsEquivalent.bits.toFixed(1)}</td>
                  <td className={s.ns}>
                    {t.bitsEquivalent.lo === null
                      ? '—'
                      : t.bitsEquivalent.hi === null
                        ? `≥ ${t.bitsEquivalent.lo.toFixed(1)}`
                        : `[${t.bitsEquivalent.lo.toFixed(1)}, ${t.bitsEquivalent.hi.toFixed(1)}]`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Section>

      {/* ---- evidence age ---------------------------------------------------------------- */}
      <Section id="evidence" badge="Evidence age">
        <SectionHead lines={['Evidence decay']} />
        <LineChart model={evidenceLine(artifact)} />
        <ScrollRegion label="Decay statistics per policy">
          <table className={s.table}>
            <caption>E3 · decay per policy</caption>
            <thead>
              <tr>
                <th scope="col">Policy</th>
                <th scope="col">Observations</th>
                <th scope="col">Young-evidence exploit rate (ages 1–8)</th>
                <th scope="col">Old-evidence exploit rate (ages 33+)</th>
                <th scope="col">Decay (young − old)</th>
                <th scope="col">Decay SE</th>
                <th scope="col">z (decay ÷ SE)</th>
                <th scope="col">Half-life (evidence age)</th>
              </tr>
            </thead>
            <tbody>
              {artifact.evidence.map((c) => (
                <tr key={c.policy}>
                  <th scope="row">{policyName(c.policy)}</th>
                  <td>{count(c.observations)}</td>
                  <td>{rate(c.young.rate)}</td>
                  <td>{rate(c.old.rate)}</td>
                  <td>{sgn4(c.decay.diff)}</td>
                  <td className={s.ns}>{rate(c.decay.se)}</td>
                  <td className={s.ns}>{z2(c.decay.z)}</td>
                  <td>{c.halfLifeAge === null ? '—' : c.halfLifeAge}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Section>

      {/* ---- style under pressure -------------------------------------------------------- */}
      <Section id="pressure" badge="Style under pressure">
        <SectionHead lines={['Accuracy under memory pressure']} />
        <LineChart model={accuracyLine(artifact)} />
        <ScrollRegion label="E4 whole-ecology accuracy cells and the P7 deltas">
          <table className={s.table}>
            <caption>
              E4 · both teams bounded · {count(artifact.accuracy.cells[0]?.seats ?? 0)}{' '}
              end-of-game seat reads per cell · deltas over{' '}
              {count(artifact.accuracy.deltas[0]?.seeds ?? 0)} seeds
            </caption>
            <thead>
              <tr>
                <th scope="col">Memory budget (bits)</th>
                <th scope="col">Top-1 accuracy</th>
                <th scope="col">Rung (from → to)</th>
                <th scope="col">Δ top-1 (to − from)</th>
                <th scope="col">SE(Δ)</th>
                <th scope="col">z (Δ ÷ SE)</th>
                <th scope="col">P7 rule</th>
              </tr>
            </thead>
            <tbody>
              {artifact.accuracy.cells.map((c, i) => {
                const d = i > 0 ? artifact.accuracy.deltas[i - 1] : undefined
                return (
                  <tr key={c.bits}>
                    <th scope="row">{bitsLabel(c.bits)}</th>
                    <td>{rate(c.top1)}</td>
                    <td className={s.ns}>
                      {d ? `${bitsLabel(d.fromBits)} → ${bitsLabel(d.toBits)}` : '—'}
                    </td>
                    <td>{d ? sgn4(d.delta) : '—'}</td>
                    <td className={s.ns}>{d ? rate(d.se) : '—'}</td>
                    <td>{d ? z2(d.se === 0 ? 0 : d.delta / d.se) : '—'}</td>
                    <td className={s.ns}>{d ? (d.pass ? 'passes' : 'VIOLATES') : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollRegion>
        <ScrollRegion
          label="E4b single-seat accuracy, pilot and power run"
          style={{ marginTop: 'var(--fa-sp-head)' }}
        >
          <table className={s.table}>
            <caption>
              E4b · read seat only · pilot {count(pilot.cells[0]?.reads ?? 0)} reads/cell (seeds
              clsacc-v1) · run of record {count(power.cells[0]?.reads ?? 0)} reads/cell (seeds{' '}
              {power.accSeedPrefix})
            </caption>
            <thead>
              <tr>
                <th scope="col">Memory budget (bits)</th>
                <th scope="col">Pilot top-1 accuracy</th>
                <th scope="col">Pilot SE</th>
                <th scope="col">Record top-1 accuracy</th>
                <th scope="col">Record SE</th>
              </tr>
            </thead>
            <tbody>
              {power.cells.map((c, i) => {
                const p = pilot.cells[i]
                return (
                  <tr key={c.bits}>
                    <th scope="row">{bitsLabel(c.bits)}</th>
                    <td className={s.ns}>{p ? rate(p.top1) : '—'}</td>
                    <td className={s.ns}>{p ? rate(p.se) : '—'}</td>
                    <td>{rate(c.top1)}</td>
                    <td className={s.ns}>{rate(c.se)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollRegion>
        <div className={s.refuseBox} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Eyebrow tone="muted" track="badge">
            Cross-design comparison · E4 vs E4b
          </Eyebrow>
          <p className={s.stepAction} style={{ marginTop: 10 }}>
            P7 rung {sgn4(cross.p7.delta)} ± {rate(cross.p7.se)} vs P8 rung{' '}
            {sgn4(cross.p8.delta)} ± {rate(cross.p8.se)} · difference {sgn4(cross.diffOfDeltas)}{' '}
            ± {rate(cross.se)} · z {z2(cross.z)} · two-sided p {pv(cross.pTwoSided)}
          </p>
          <p className={s.figNote}>
            Post-hoc power at effect {rate(cross.effect)}: pilot {pct(cross.pilot.postHocPower, 1)}{' '}
            (MDE {rate(cross.pilot.mde)}) · run of record {pct(cross.postHocPower, 2)} (MDE{' '}
            {rate(cross.mde)})
          </p>
        </div>
      </Section>

      {/* ---- the verdicts ---------------------------------------------------------------- */}
      <Section id="verdict" noMarks>
        <InkPanel
          fig="FIG. 04 — The verdicts"
          live={`VERDICT · ${confirmedCount} CONFIRMED · ${mixedCount} MIXED · ${refutedCount} REFUTED`}
        >
          <div className={inkPanelBody} style={{ display: 'block' }}>
            <div className={s.verdictHead}>
              <h2 className={s.verdictWord}>a dial that works</h2>
              <Eyebrow tone="muted" track="badge">
                Pre-registered predictions · P1–P8
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

export default LabBounded
