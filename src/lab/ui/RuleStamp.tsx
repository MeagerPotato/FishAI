/**
 * The rule-set stamp and the two `us54` facts, on every results page.
 *
 * SITE_SPEC.md §1.1: the site reports `us54`, which is **not** what the live table plays. A
 * reader who arrives from `/r/:code` is looking at results for a different game, and the page
 * has to say so before it says anything else — hence a stamp above the fold on all three routes,
 * carrying the hash the results were produced under and the hash the shipped document actually
 * has.
 */

import { Eyebrow } from '../../components/index.ts'
import type { LabArtifact } from '../artifact.ts'
import { count, isoDate } from '../format.ts'
import { US54_FACTS, shortHash, type RulesCheck } from '../rules.ts'
import s from './lab.module.css'

function Cell({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className={s.stampCell}>
      <Eyebrow tone="muted" track="legal">
        {label}
      </Eyebrow>
      <span className={s.stampValue} data-numeric={numeric ? '' : undefined}>
        {value}
      </span>
    </div>
  )
}

export function RuleStamp({ artifact, check }: { artifact: LabArtifact; check: RulesCheck }) {
  const { meta } = artifact
  return (
    <div className={s.stamp}>
      <Cell label="Rule set" value={`${meta.ruleSet} · ${meta.rulesFile}`} />
      <Cell label="rulesHash — stamped" value={shortHash(meta.rulesHash)} numeric />
      <Cell
        label="rulesHash — shipped"
        value={check.ok ? `${shortHash(check.shipped)} · matches` : `${shortHash(check.shipped)} · MISMATCH`}
        numeric
      />
      <Cell label="Engine" value={meta.engineCommit} />
      <Cell
        label="Games"
        value={`${count(meta.gamesTotal)} · ${count(meta.seedSet.count)} seeds/cell`}
        numeric
      />
      <Cell label="Generated" value={isoDate(meta.generatedAt)} numeric />
    </div>
  )
}

/**
 * The two things SITE_SPEC.md §5 requires the site to *say plainly* rather than only assert in
 * code. They are prose, not a footnote: the comparison a reader is most likely to make by
 * reflex — this matrix against a `pagat48` one — is the comparison these two facts forbid.
 */
export function Us54Facts() {
  return (
    <div className={s.stack}>
      {US54_FACTS.map((fact) => (
        <div key={fact.id}>
          <h3 className={s.criterionLabel}>{fact.head}</h3>
          <p className={s.figNote}>{fact.body}</p>
        </div>
      ))}
    </div>
  )
}

export function SyntheticNotice({ artifact }: { artifact: LabArtifact }) {
  if (!artifact.meta.synthetic) return null
  return (
    <div className={s.synthetic}>
      <Eyebrow tone="muted" track="badge">
        {artifact.meta.notice}
      </Eyebrow>
      <p className={s.syntheticBody}>
        Every number on this page comes from the committed fixture in{' '}
        <code>src/diagrams/fixture.ts</code>, generated deterministically so two builds are
        byte-identical. It satisfies the BOT_LAB.md §7.1 schema and exercises both verdict render
        paths, and it is not simulation output. Nothing here is a finding about how Canadian Fish
        is best played.
      </p>
    </div>
  )
}
