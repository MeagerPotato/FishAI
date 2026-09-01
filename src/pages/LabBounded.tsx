/**
 * `/lab/bounded` — the FishAI v1.5 results page: the bounded-memory ladder, priced.
 *
 * The page reports one committed artifact (`src/lab/data/bounded-results.json`, parsed at the
 * boundary by `bounded-artifact.ts`) against eight predictions that were written down before
 * their runs — P1–P7 before the base suite, P8 before the E4b follow-up, the E4b-power grid
 * before the run of record. The headline is the ladder itself: memory capped in bits is a
 * monotone, interpretable difficulty dial (P1 confirmed at all nine rungs), and the shipped
 * tiers now have measured prices on it — including the honest one, that the old noise-based
 * easy tier measures BELOW the zero-bit floor. The suite's one refutation, P7, is presented
 * with the two obligations the Phase 2 review attached riding beside the headline: the
 * Bonferroni annotation on its violated rung, and the attribution caveat that E4's both-teams
 * design cannot separate the read seat's signature from the changed ecology — which is what
 * E4b/P8 was registered to isolate, twice, at two sample sizes, both reported.
 *
 * ## The accent budget (SITE_SPEC.md §2.1)
 *
 * One accent-text spend: the verdict chip on the ink panel. Every Button is `line` or `ghost`,
 * the nav gets no `cta`, and the tables are ink. The remaining amber belongs to the diagram
 * system's own per-figure budgets — each line chart's one focal series — which §3.2 requires
 * of every figure regardless of what this page wants.
 *
 * ## What is recomputed and what is read
 *
 * The eight verdict words are the artifact's own, printed verbatim; every number they cite
 * appears in the sections above them. The z columns of the delta tables are recomputed in the
 * browser from each row's delta and SE, and the tier-vs-floor comparison is recomputed from
 * the ladder's own 0-bit rung — so the reader can check the words against the evidence without
 * trusting the emitter. MIXED verdicts are printed as MIXED, with both sides shown.
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
import { LineChart } from '../diagrams/index.ts'
import type { BoundedResults } from '../../lib/lab/bounded-types.ts'
import { BOUNDED_INF_BITS } from '../../lib/lab/bounded-types.ts'
import type { VerdictValue } from '../../lib/lab/adaptive-types.ts'
import { loadBoundedArtifact } from '../lab/bounded-artifact.ts'
import {
  accuracyLine,
  bitsLabel,
  evidenceLine,
  gridMoveSpread,
  ladderLine,
} from '../lab/boundedFigures.ts'
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

/**
 * `.00885` — five places, for the two P7-rung p-values only: the artifact carries
 * 0.0088497…, and the v1.5 paper prints .00885, so four places here (.0088) would put the
 * two surfaces a rounding apart on the suite's single most-quoted number.
 */
function pv5(v: number): string {
  return v < 0.00001 ? '<.00001' : v.toFixed(5).replace(/^0/, '')
}

const VERDICT_MARK: Record<VerdictValue, { cls: string; word: string }> = {
  confirmed: { cls: s.markPass, word: 'Confirmed' },
  refuted: { cls: s.markFail, word: 'Refuted' },
  mixed: { cls: s.markUnknown, word: 'Mixed' },
}

const CONTENTS: readonly LabSection[] = [
  { id: 'ladder', label: 'The ladder', note: 'Ten budgets, nine rungs, the P1 test' },
  { id: 'tiers', label: 'Tier calibration', note: 'The shipped tiers, priced in bits' },
  { id: 'evidence', label: 'Evidence age', note: 'Decay curves, and where P4 and P6 land' },
  { id: 'pressure', label: 'Style under pressure', note: 'The P7 refutation and the E4b answer' },
  { id: 'verdict', label: 'The verdicts', note: 'P1–P8, as measured' },
  { id: 'sources', label: 'Sources', note: 'Two runs, their health, the v1.0 anchor' },
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

  // The tier-vs-floor comparison the E2 headline rests on, recomputed from the ladder itself.
  const floor = artifact.ladder.find((r) => r.bits === 0)
  const easy = artifact.tiers.find((t) => t.tier === 'easy')
  const medium = artifact.tiers.find((t) => t.tier === 'medium')
  const hard = artifact.tiers.find((t) => t.tier === 'hard')

  // The two E3 curves the P4/P6 prose quotes repeatedly, found once.
  const tierEasyCurve = artifact.evidence.find((c) => c.policy === 'tier-easy')
  const referenceCurve = artifact.evidence.find((c) => c.policy === 'reference')

  // The P7 story's four exhibits: the violated rung, its Bonferroni annotation, the ∞ anchor
  // agreement, and the game-length spread behind the ecology caveat.
  const violated = artifact.accuracy.deltas.find((d) => !d.pass)
  const p7Family = artifact.multiplicity.find((f) => f.id === 'P7')
  const p7Rung = p7Family?.rungs.find((r) => r.violatesRaw)
  const infCell = artifact.accuracy.cells.find((c) => c.bits === BOUNDED_INF_BITS)
  const moves = gridMoveSpread(artifact)
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
        <MaskedLines
          level="h1"
          lines={['Memory capped in bits,', 'and the ladder that', '*prices it*.']}
        />
        <div className={s.split} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Reveal as="p" className={s.prose}>
            FishAI v1.5 replaces the old difficulty knob — uniform decision noise — with a
            memory budget: a bounded seat re-derives every fact the public log certifies, ranks
            them by relevance to a focus book, and keeps only what fits in a budget measured in
            bits (2 a card fact, 1 a basis fact). This page reports the committed v1.5
            experiment suite — {count(meta.gamesTotal)} games in the base run, plus the
            registered E4b follow-ups — against eight predictions written down before the runs.
          </Reveal>
          <Reveal as="div" className={s.stack}>
            <p className={s.prose}>
              The dial works: <strong>set-share is non-decreasing in bits at every one of the
              nine adjacent rungs</strong> (P1 confirmed), from {floor ? rate(floor.share) : '—'}{' '}
              at zero bits to .5000 exactly at the top. The shipped tiers now carry measured
              prices — medium ≈ {medium?.bitsEquivalent.bits?.toFixed(1) ?? '—'} bits, and the
              old noise-based easy tier below the zero-bit floor. One prediction was refuted,
              and it is reported as the finding it is: in the whole-ecology design, mild memory
              pressure makes a style <em>easier</em> to classify than full memory.
            </p>
            <div className={buttonRow}>
              <Button href="#verdict" variant="line">
                Go straight to the verdicts
              </Button>
              <Button href={withCase('/lab/adaptive', which)} variant="ghost">
                The adaptive engine
              </Button>
            </div>
            {/*
              This paragraph used to say the ladder was "playable" and linked to the table's
              Memory control. That control was removed when the play surface was cut back to the
              v1.0 adaptive engine alone, and the sentence survived the cut — a research page
              offering a clickable link to a thing that no longer exists. The measurement below is
              untouched and still stands; only the claim about the table was ever false.
            */}
            <p className={s.figNote}>
              The ladder is measured here, not played: the table runs the v1.0 adaptive engine at
              full memory — with v2.0&rsquo;s defusal term live, which this page&rsquo;s ladder
              was measured without — and the bit budgets on this page belong to the simulations
              below.
            </p>
          </Reveal>
        </div>

        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <BoundedStamp artifact={artifact} shipped={check.shipped} ok={check.ok} />
        </div>

        <LabContents sections={CONTENTS} />

        {/* Folded, not cut. Each of the six defines a term the sections below then use WITH its
            numbers attached — bits in the ladder table, set-share in every cell, evidence age in
            the decay curves, bits-equivalent in the tier table — so none of them is the only
            place a fact appears. The report's glossary carries the same six terms again. */}
        <details className={s.detail}>
          <summary>
            How to read this page — six ideas, in plain language, and no prior jargon
          </summary>
          <div className={s.detailBody}>
            <Board
              items={[
                {
                  ix: '01',
                  title: 'A budget in bits, not a bot',
                  role: 'Definition',
                  body:
                    'A bounded seat runs the same engine and the same style policy as every other ' +
                    'seat; only its memory is capped. Facts derived from the public log are priced ' +
                    '— 2 bits to place a card, 1 to certify a basis — ranked by relevance and ' +
                    'recency, and kept until the budget runs out. ∞ keeps everything.',
                },
                {
                  ix: '02',
                  title: 'Set-share, not win rate',
                  role: 'Measure',
                  body:
                    'Each game scores setsA/(setsA + setsB) for the measured side, ' +
                    'duplicate-averaged. A win rate saturates long before the top budgets ' +
                    'separate; the share of banked sets keeps moving, which is what a strength ' +
                    'dial needs.',
                },
                {
                  ix: '03',
                  title: 'Every rung replays the same deals',
                  role: 'Method',
                  body:
                    'All ten budgets replay one identical 3,000-seed list, both orientations. ' +
                    'Adjacent-rung deltas are therefore formed per seed — the paired SE the P1 ' +
                    'rule names — and the tier cells replay the head of the same list, so the ' +
                    'bits-equivalent interpolation compares deal for deal.',
                },
                {
                  ix: '04',
                  title: 'Evidence age',
                  role: 'Measure',
                  body:
                    'When a hit publicly locates a card, every later turn it stays put is a ' +
                    'chance to exploit that fact. Age is the distance in public-log events from ' +
                    'the hit to the decision; the decay curves plot how often each policy takes ' +
                    'the certain ask as that distance grows.',
                },
                {
                  ix: '05',
                  title: 'Bits-equivalent',
                  role: 'Figure',
                  body:
                    'A shipped tier’s set-share is placed on the ladder by linear interpolation ' +
                    'over the finite rungs. A tier below the 0-bit rung clamps to the floor; one ' +
                    'above every finite rung has no finite equivalent, and the table says so ' +
                    'rather than inventing a number.',
                },
                {
                  ix: '06',
                  title: 'Verdicts are printed as measured',
                  role: 'Decision rule',
                  body:
                    'Eight predictions were registered before their runs, with the verdict rules ' +
                    'fixed alongside. Confirmed means the stated inequality held under the stated ' +
                    'SE discipline; anything else is refuted or mixed — and a MIXED verdict is ' +
                    'printed as MIXED, both sides shown, never rounded up.',
                },
              ]}
            />
          </div>
        </details>
      </Section>

      {/* ---- the ladder ------------------------------------------------------------------ */}
      <Section id="ladder" badge="The ladder">
        <SectionHead
          lines={['Ten budgets,', 'nine rungs, *zero violations*.']}
          sub={`${count(meta.config.ladderPairs)} duplicate pairs per budget against an unbounded team of the same style, on one shared seed list. P1 predicted set-share non-decreasing in bits within 2·(paired SE) at every adjacent pair — and every rung passed outright.`}
        />
        <div className={s.stackWide}>
          <p className={s.prose}>
            The bounded team plays Balanced at hard skill under each budget; its opposition is
            the identical style with no cap. The curve is the whole point of v1.5: one number,
            monotone in strength, with the steep money at the low end — the first 16 bits buy
            more than the next hundred.
          </p>
          <LineChart model={ladderLine(artifact)} />
        </div>
        <ScrollRegion label="Ladder cells with per-rung standard errors">
          <table className={s.table}>
            <caption>
              Set-share per budget · {count(meta.config.ladderPairs)} pairs per rung · seeds{' '}
              {meta.config.ladderSeedPrefix} · SE of the paired mean
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
        <p className={s.figNote}>
          The 128-bit and ∞ rows print SE — because the SE is exactly 0: at those budgets every
          kept-fact set equals the full pool, both teams play bit-identical Balanced, and each
          duplicate pair is literally the same game twice. That is P2, checked on integers
          rather than floats: {count(artifact.mirrorExact.pairs)} ∞ pairs,{' '}
          {count(artifact.mirrorExact.deviations)} mirror deviations, duplicate-mean set-share{' '}
          {rate(artifact.mirrorExact.share)} — a harness gate, not a measurement. The mean-moves
          column is read again in the E4 section below: game length itself is a function of the
          budget.
        </p>
        <ScrollRegion label="Adjacent-rung deltas, the P1 statistic">
          <table className={s.table}>
            <caption>
              The P1 test · share(to) − share(from), per-seed paired over{' '}
              {count(artifact.ladderDeltas[0]?.seeds ?? 0)} seeds · rule: delta ≥ −2·SE
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
        <p className={s.figNote}>
          Every delta is positive or exactly zero — no rung even needed the 2·SE tolerance the
          rule allows. The z column is recomputed in your browser from each row&rsquo;s delta
          and SE.
        </p>
      </Section>

      {/* ---- tier calibration ------------------------------------------------------------ */}
      <Section id="tiers" badge="Tier calibration">
        <SectionHead
          lines={['The old easy tier prices', '*below zero bits*.']}
          sub="The shipped easy, medium and hard tiers played the same reference opposition on the head of the ladder's seed list, and each set-share is interpolated onto the E1 curve. This is the measurement the ladder exists to provide — and its headline is the honest one."
        />
        <p className={s.prose}>
          A 0-bit seat keeps nothing, but it still <em>reasons</em>: own hand, public board, a
          legal-move policy over them. The old easy tier remembers a 6-event window and then
          rolls a 25% uniform die over its choices — and the die costs more than the memory
          buys. Its measured set-share, {easy ? rate(easy.share) : '—'}, sits far below the
          0-bit rung&rsquo;s {floor ? rate(floor.share) : '—'} on the same deals: a memoryless
          bot that reasons beats a remembering bot that dices. Medium lands at{' '}
          {medium?.bitsEquivalent.bits?.toFixed(1) ?? '—'} bits, and hard sits above every finite
          rung, indistinguishable from full memory at this resolution.
        </p>
        <ScrollRegion label="Shipped tiers interpolated onto the ladder">
          <table className={s.table}>
            <caption>
              E2 · {count(meta.config.tierPairs)} pairs per tier · bits-equivalent by linear
              interpolation over the finite rungs · CI mapped through the same rule
            </caption>
            <thead>
              <tr>
                <th scope="col">Shipped tier</th>
                <th scope="col">Set-share</th>
                <th scope="col">Set-share SE</th>
                <th scope="col">Bits-equivalent</th>
                <th scope="col">Bits-equivalent CI 95%</th>
                <th scope="col">Placement note</th>
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
                  <td className={s.ns}>{t.bitsEquivalent.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <p className={s.figNote}>
          P3 is scored <strong>mixed</strong>, and both sides are shown: the ordering easy &lt;
          medium &lt; hard holds on every point estimate — the direction the prediction named —
          but not every tier is <em>finitely placeable</em>. Easy clamps to the 0-bit floor from
          below, and hard&rsquo;s {hard ? rate(hard.share) : '—'} sits above the whole finite
          curve (its CI&rsquo;s lower edge maps to{' '}
          {hard?.bitsEquivalent.lo?.toFixed(1) ?? '—'} bits; the upper edge maps nowhere
          finite). The placement column is the artifact&rsquo;s own note, verbatim.
        </p>
      </Section>

      {/* ---- evidence age ---------------------------------------------------------------- */}
      <Section id="evidence" badge="Evidence age">
        <SectionHead
          lines={['Bounded bots forget like players.', 'Noise *falls off a cliff*.']}
          sub="Computed post-hoc from the E1/E2 game records, no engine instrumentation: whenever a hit had publicly located a card and the acting seat could legally have asked the right holder for it, that decision is one observation — exploited or not — at the evidence's age."
        />
        <div className={s.stackWide}>
          <p className={s.prose}>
            The S45 signature the budget was designed to produce: bounded policies exploit young
            evidence nearly as well as full memory and old evidence progressively worse, with
            the half-life growing as the budget does. The old noise tier does something else
            entirely — perfect recall for six events, then nothing.
          </p>
          <LineChart model={evidenceLine(artifact)} />
        </div>
        <ScrollRegion label="Decay statistics per policy">
          <table className={s.table}>
            <caption>
              E3 per policy · young = ages 1–8, old = 33+ · decay = young − old, seed-clustered
              SE · half-life = first band with ≥ 200 observations at or below half the youngest
              band&rsquo;s rate
            </caption>
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
        <div className={s.split} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>P5 — mixed, both sides</h3>
            <p className={s.figNote}>
              The signature is real where the budget bites: decay is significant at 0 through 48
              bits, and the half-life climbs the ladder exactly as designed —{' '}
              {artifact.evidence
                .filter((c) => c.halfLifeAge !== null && c.policy.startsWith('bounded-'))
                .map((c) => `${policyName(c.policy).replace(' bits', '')} bits → age ${c.halfLifeAge ?? 0}`)
                .join(', ')}
              . But the prediction claimed <em>every</em> budget decays with a defined,
              non-decreasing half-life, and it fails twice over: 48 bits decays significantly (z
              3.22) yet no band meeting the 200-observation floor falls to half, so its
              half-life is undefined; and from 64 bits up the curves are statistically
              indistinguishable from full memory — no significant decay, no half-life in range.
              The mechanism saturates once the budget holds essentially everything, which the
              prediction failed to anticipate. Mixed, as measured.
            </p>
          </div>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>P6 — the cliff is real; the flatness is not</h3>
            <p className={s.figNote}>
              The noise tier&rsquo;s cliff at its 6-event window edge is the largest effect in
              the suite: inside the window it exploits at{' '}
              {rate(tierEasyCurve?.window.inside.rate ?? 0)}, just outside at{' '}
              {rate(tierEasyCurve?.window.justOutside.rate ?? 0)} — a drop of{' '}
              {sgn4(tierEasyCurve?.window.cliff.diff ?? 0)} ±{' '}
              {rate(tierEasyCurve?.window.cliff.se ?? 0)} (z{' '}
              {z2(tierEasyCurve?.window.cliff.z ?? 0)}). Noise is not human-shaped — the
              motivating contrast, confirmed. But the prediction also claimed flatness{' '}
              <em>inside</em> the window, and the inside split (ages 1–3 vs 4–6) measures{' '}
              {sgn4(tierEasyCurve?.window.insideSplit.diff ?? 0)} ±{' '}
              {rate(tierEasyCurve?.window.insideSplit.se ?? 0)} — not flat. Mixed, as measured.
            </p>
          </div>
        </div>
        <div className={s.refuseBox} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Eyebrow tone="muted" track="badge">
            The composition-effect caveat · where the pooled and clustered estimators disagree
          </Eyebrow>
          <p className={s.figNote} style={{ marginTop: 10 }}>
            For the full-memory policies the two estimators point in opposite directions, and
            the disagreement is printed rather than resolved silently. Pooled over all
            observations, the reference&rsquo;s exploit rate falls with age —{' '}
            {rate(referenceCurve?.young.rate ?? 0)} young to {rate(referenceCurve?.old.rate ?? 0)}{' '}
            old — which reads as decay. Clustered by seed, comparing young and old{' '}
            <em>within</em> the same deals, the difference is{' '}
            {sgn4(referenceCurve?.decay.diff ?? 0)} ± {rate(referenceCurve?.decay.se ?? 0)}: old
            evidence is exploited slightly <em>more</em>, not less. The pooled fall is a
            composition effect — only long games carry old evidence, and long games are
            different games — and it is why the decay column above clusters by seed. P4 is
            scored <strong>mixed</strong> on exactly this: bounded-∞ is age-flat as predicted,
            but the reference&rsquo;s clustered tilt (z {z2(referenceCurve?.decay.z ?? 0)}) fails
            the flatness rule — in the direction opposite to forgetting.
          </p>
        </div>
      </Section>

      {/* ---- style under pressure -------------------------------------------------------- */}
      <Section id="pressure" badge="Style under pressure">
        <SectionHead
          lines={['Mild memory pressure makes styles', '*easier to read* — in one design.']}
          sub="P7 predicted the v1.0 classifier's top-1 accuracy non-increasing as the bits shrink. Accuracy rises with bits instead, at every rung — and the two obligations the review attached ride here with the headline, not in a footnote."
        />
        <div className={s.stackWide}>
          <p className={s.prose}>
            E4 seats all nine styles under budgets on <em>both</em> teams and reads every seat
            at end of game against the calibrated fingerprints — the v1.0 accuracy harness with
            the memory dial added. E4b repeats the design with only the read seat bounded. The
            two curves below disagree, and that disagreement is the attribution question.
          </p>
          <LineChart model={accuracyLine(artifact)} />
        </div>
        <ScrollRegion label="E4 whole-ecology accuracy cells and the P7 deltas">
          <table className={s.table}>
            <caption>
              E4 · both teams bounded · {count(artifact.accuracy.cells[0]?.seats ?? 0)}{' '}
              end-of-game seat reads per cell · deltas per-seed paired over{' '}
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
        <p className={s.figNote}>
          The ∞ cell reads {rate(infCell?.top1 ?? 0)} against the committed v1.0 baseline{' '}
          {meta.baseline ? rate(meta.baseline.endTop1) : '—'} (
          {meta.baseline?.artifact ?? '—'}) — the same games by the Phase 1 anchor pin, agreeing
          exactly. That agreement is the cross-artifact anchor tying this suite to{' '}
          <TextLink href={withCase('/lab/adaptive', which)}>the adaptive suite</TextLink>: the
          fingerprints, the harness and the 22.4% are one measurement, reproduced here
          bit-for-bit before the dial was turned.
        </p>

        <div className={s.refuseBox} style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Eyebrow tone="muted" track="badge">
            The rungs, with their two riders · multiplicity and attribution
          </Eyebrow>
          <p className={s.stepAction} style={{ marginTop: 10 }}>
            {violated
              ? `${bitsLabel(violated.fromBits)} → ${bitsLabel(violated.toBits)}: ${sgn4(violated.delta)} ± ${rate(violated.se)} — accuracy FALLS from 64 bits to full memory`
              : 'no rung violates: accuracy is non-decreasing in bits across all three'}
          </p>
          <p className={s.figNote}>
            <strong>Multiplicity.</strong> P7&rsquo;s rule tests three adjacent rungs, so a
            single violation would carry a family-wise caveat, annotated at registration under
            Bonferroni ×{p7Family?.comparisons ?? 3}.{' '}
            {p7Rung ? (
              <>
                The violated rung&rsquo;s one-sided p {pv5(p7Rung.pOneSided)} corrects to{' '}
                {pv5(p7Rung.pBonferroni)} — still under α = {p7Family?.alpha ?? 0.05}.{' '}
                <strong>The refutation survives the correction.</strong> The annotation changes
                no committed verdict; the registered rule already refuted on the raw rung.
              </>
            ) : (
              <>
                <strong>On this artifact no rung violates at all</strong>, so the correction has
                nothing to apply to and P7 is confirmed on its own registered rule. The
                annotation is kept in place rather than deleted: it is what the rule would have
                been read against, and a re-measurement that happens to avoid a caveat does not
                retire it.
              </>
            )}
          </p>
          <p className={s.figNote}>
            <strong>Attribution.</strong> E4 bounds BOTH teams, so a budget changes everything
            the classifier reads at once — opponents, partners, and the games themselves. Game
            length is itself a function of the budget: across the measured ladder, mean length
            runs from {moves.min.toFixed(0)} to {moves.max.toFixed(0)} engine steps — a{' '}
            {pct(moves.spread, 0)} spread with only <em>one</em> team bounded (the artifact
            aggregates no E4 game lengths, so the one-team ladder is the committed lower bound),
            and E4 bounds both, shifting its ecologies further still. The P7 shift is therefore
            a property of bounded-vs-bounded <em>ecologies</em>; whether the read seat&rsquo;s
            own signature moves is exactly what the single-seat design below was registered to
            isolate.
          </p>
        </div>

        <div style={{ marginTop: 'var(--fa-sp-head)' }}>
          <Eyebrow tone="muted" track="head" as="h3">
            E4b — the single-seat design, run twice, both reported
          </Eyebrow>
          <p className={s.prose} style={{ marginTop: 16 }}>
            Only the read seat is bounded; the other five play their bare full-strength styles,
            holding the ecology at the distribution the fingerprints were calibrated on. The
            50-seed pilot came back flat and was committed as P8 CONFIRMED — and the E4b-power
            review then computed what that verdict was worth: at the P7 effect size the pilot
            had {pct(cross.pilot.postHocPower, 1)} power (minimum detectable effect{' '}
            {rate(cross.pilot.mde)} against the effect {rate(cross.effect)}), so its CONFIRMED
            was an underpowered null that licensed only the within-design claim. The correction
            is part of the record, not a rewrite: the pilot is retained in the artifact,
            labelled, and the 300-seed power run below — registered before it ran, with the
            mapping, grid, estimator and rule unchanged — is the P8 verdict of record.
          </p>
        </div>
        <ScrollRegion label="E4b single-seat accuracy, pilot and power run">
          <table className={s.table}>
            <caption>
              E4b · read seat only · pilot ({count(pilot.cells[0]?.reads ?? 0)} reads/cell,
              seeds clsacc-v1) beside the run of record ({count(power.cells[0]?.reads ?? 0)}{' '}
              reads/cell, seeds {power.accSeedPrefix}) · seed-clustered SEs
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
        <p className={s.figNote}>
          The run of record: {power.deltas.filter((d) => !d.pass).length} of{' '}
          {power.deltas.length} rungs violate the registered rule (
          {power.deltas
            .map((d) => `${bitsLabel(d.fromBits)}→${bitsLabel(d.toBits)} ${sgn4(d.delta)} ± ${rate(d.se)}`)
            .join('; ')}
          ), at {pct(cross.postHocPower, 2)} post-hoc power for the P7 effect (MDE{' '}
          {rate(cross.mde)}). <strong>P8 is confirmed at matched read count</strong> — the
          single-seat curve is flat where the whole-ecology curve fell. The ∞ health gate held
          in both runs: every ∞-budget game replayed with all six seats bare was
          event-identical, {count(power.infReproduction.games)} of{' '}
          {count(power.infReproduction.games)} in the power run.
        </p>
        <div className={s.refuseBox}>
          <Eyebrow tone="muted" track="badge">
            The cross-design comparison · labelled as exactly that
          </Eyebrow>
          <p className={s.stepAction} style={{ marginTop: 10 }}>
            P7 rung {sgn4(cross.p7.delta)} ± {rate(cross.p7.se)} vs P8 rung{' '}
            {sgn4(cross.p8.delta)} ± {rate(cross.p8.se)} · difference {sgn4(cross.diffOfDeltas)}{' '}
            ± {rate(cross.se)} · z {z2(cross.z)} · two-sided p {pv(cross.pTwoSided)}
          </p>
          <p className={s.figNote}>
            A comparison ACROSS designs — E4&rsquo;s both-teams rung against E4b&rsquo;s
            single-seat rung on disjoint seed lists — and it enters no registered verdict rule.
            Read together: the whole-ecology fall is present and survives its correction; the
            single-seat design, at {pct(cross.postHocPower, 2)} power for that same effect,
            shows no fall; and the labelled difference between the two rungs is z {z2(cross.z)}.
            The within-design caveat stands either way — P8 bounds what a single bounded seat
            does to its own read, and nothing else.
          </p>
        </div>
      </Section>

      {/* ---- the verdicts ---------------------------------------------------------------- */}
      <Section id="verdict" noMarks>
        <p className={s.prose} style={{ marginBottom: 'var(--fa-sp-head)' }}>
          Eight predictions, all registered before their runs — P1–P7 with the base suite, P8
          with the E4b follow-up — with the verdict rules fixed alongside them. Here is how each
          landed. The verdict words are the artifact&rsquo;s own, and every number they cite is
          printed in the sections above.
        </p>
        <InkPanel
          fig="FIG. 04 — The verdicts"
          live={`VERDICT · ${confirmedCount} CONFIRMED · ${mixedCount} MIXED · ${refutedCount} REFUTED`}
        >
          <div className={inkPanelBody} style={{ display: 'block' }}>
            <div className={s.verdictHead}>
              <h2 className={s.verdictWord}>a dial that works, priced honestly</h2>
              <Eyebrow tone="muted" track="badge">
                Eight pre-registered predictions · P1–P8 · rules fixed before the runs
              </Eyebrow>
            </div>
            <p className={s.verdictSummary}>
              The ladder is monotone and exactly mirrored at the top; the shipped tiers carry
              measured prices, the old easy tier&rsquo;s being below the zero-bit floor; the
              decay curves are human-shaped where the budget bites and saturate where it
              stops biting; and the one refutation — accuracy rising under mild pressure — is
              a whole-ecology effect that the single-seat design, at full power, does not
              reproduce.
            </p>
            <p className={s.verdictSummary}>
              Four verdicts are MIXED, and they are printed as MIXED: each prediction named
              more than the measurement delivered, and the detail lines say which half held.
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
              {/* "for /play" until the table's Memory control was removed. The licence is
                  unchanged — this suite does license bits as a difficulty knob — but naming a
                  surface that no longer has one made a statement about evidence read as a
                  statement about the product. */}
              What the suite licenses: bits as a difficulty knob for a play surface, with measured
              anchors; the retirement case against the noise tier; and the P7/P8 pair as a
              measured caution that classifier accuracy is a property of the whole table, not
              of one seat. What it does not license: any claim about budgets between the rungs,
              other styles&rsquo; ladders, or the v1.0 adaptive engine under memory pressure —
              none of which was measured.
            </p>
          </div>
        </InkPanel>
      </Section>

      {/* ---- sources --------------------------------------------------------------------- */}
      <Section id="sources" badge="Sources">
        <SectionHead
          lines={['Everything above', 'is *checkable*.']}
          sub="One artifact, one schema, one rule document — carrying two runs' provenance, the committed v1.0 anchor, and the registered predictions verbatim."
        />
        <div className={s.split}>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>The runs</h3>
            <p className={s.figNote}>
              <span className={s.mono}>{loaded.file}</span> — schema {meta.schemaVersion}. Base
              suite: {count(meta.gamesTotal)} games emitted by{' '}
              <span className={s.mono}>{meta.engineCommit}</span> at {isoDate(meta.generatedAt)},
              records digest <span className={s.mono}>{meta.recordsDigest}</span>, wall clock{' '}
              {(meta.wallMs / 60000).toFixed(1)} minutes. Ladder{' '}
              {count(meta.config.ladderPairs)} pairs × {meta.config.ladderBits.length} budgets on
              seeds <span className={s.mono}>{meta.config.ladderSeedPrefix}</span>; tiers{' '}
              {count(meta.config.tierPairs)} pairs × 3; E4 accuracy {count(meta.config.accGames)}{' '}
              games per pairing per budget on{' '}
              <span className={s.mono}>{meta.config.accSeedPrefix}</span>. E4b-power run:{' '}
              {count(power.meta.gamesTotal)} games by{' '}
              <span className={s.mono}>{power.meta.engineCommit}</span> at{' '}
              {isoDate(power.meta.generatedAt)}, digest{' '}
              <span className={s.mono}>{power.meta.recordsDigest}</span>, {power.accGames} seeds
              per pairing on <span className={s.mono}>{power.accSeedPrefix}</span> — disjoint
              from the pilot&rsquo;s. The pilot is retained verbatim (digest{' '}
              <span className={s.mono}>{pilot.meta.recordsDigest}</span>). Step cap{' '}
              {count(meta.config.stepCap)}, invariants checked{' '}
              <span className={s.mono}>{meta.config.invariantCheck}</span> step. Imported, not
              fetched: Vite ships the artifact inside this route&rsquo;s chunk.
            </p>
          </div>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>Health</h3>
            <p className={s.figNote}>
              Base run, all gates zero: illegal actions {count(meta.health.illegalActions)},
              capped games {count(meta.health.cappedGames)}, invariant violations{' '}
              {count(meta.health.invariantViolations)}, ties {count(meta.health.ties)}, voids{' '}
              {count(meta.health.voids)}, non-clinch finishes {count(meta.health.nonClinch)}.
              E4b-power run: the same gates, {power.health.ok ? 'all zero' : 'NOT CLEAN'}, plus
              the ∞ reproduction gate — {count(power.infReproduction.deviations)} deviations in{' '}
              {count(power.infReproduction.games)} all-bare replays. The P2 mirror ({count(
                artifact.mirrorExact.pairs,
              )}{' '}
              ∞ pairs, {count(artifact.mirrorExact.deviations)} integer-exact deviations) is the
              same discipline read at the top of the ladder.
            </p>
          </div>
          <div className={s.stack}>
            <h3 className={s.criterionLabel}>Registrations and anchors</h3>
            <p className={s.figNote}>
              The eight predictions travel in the artifact verbatim
              (<span className={s.mono}>meta.predictions</span>), and the emitter authenticates
              them against the code&rsquo;s own registered set before writing. The v1.0 anchor —{' '}
              {meta.baseline?.artifact ?? '—'}, digest{' '}
              <span className={s.mono}>{meta.baseline?.recordsDigest ?? '—'}</span>, end top-1{' '}
              {meta.baseline ? rate(meta.baseline.endTop1) : '—'} — is the committed adaptive
              artifact&rsquo;s own number, reproduced exactly by the E4 ∞ cell. The E4b
              read-seat mapping was written into the run&rsquo;s notes before either E4b run;
              it is quoted in full in the artifact&rsquo;s{' '}
              <span className={s.mono}>accuracySingle.mapping</span>.
            </p>
          </div>
        </div>

        <Hairline variant="soft" />
        {/* Was a three-card board of cross-links. The evidence index on /lab introduces every
            lab surface once, and the footer carries all of them from every page; a third copy
            of the same three names was navigation pretending to be content. The relationships
            this page's argument actually depends on keep their sentence. */}
        <p className={s.figNote}>
          Where this page sits:{' '}
          <TextLink href={withCase('/lab/adaptive', which)}>the adaptive engine</TextLink> is the
          v1.0 suite this one anchors to — its classifier, its fingerprints and the end-of-game
          top-1 the E4 ∞ cell reproduces exactly.{' '}
          <TextLink href={withCase('/lab', which)}>The style report</TextLink> carries the
          nine-style roster this page&rsquo;s policies come from. And{' '}
          <TextLink href="/play">the table</TextLink> plays the v1.0 adaptive engine at full
          memory, over roster styles that now carry v2.0&rsquo;s defusal term — the budgets on
          this page are a property of these simulations, not a dial a player turns, and the ladder
          itself was measured before that term existed.
        </p>
        <p className={s.figNote}>
          Method vocabulary — duplicate pair, score rate, standard error, and this page&rsquo;s
          additions (memory bits, set-share, evidence age, bits-equivalent) — is defined in{' '}
          <TextLink href={withCase('/lab', which) + '#sources'}>
            the report&rsquo;s glossary
          </TextLink>
          . The pre-registration discipline is BOT_LAB.md §5&rsquo;s, extended by the E4b and
          E4b-power registrations: predictions and rules written down before each run, refuted
          and mixed verdicts emitted as such, and a correction of record stated in the artifact
          rather than rewritten out of it.
        </p>
      </Section>
    </LabShell>
  )
}

export default LabBounded
