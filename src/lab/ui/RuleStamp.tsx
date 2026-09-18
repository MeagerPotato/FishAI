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
import { shortHash, type RulesCheck } from '../rules.ts'
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


export function SyntheticNotice({ artifact }: { artifact: LabArtifact }) {
  if (!artifact.meta.synthetic) return null
  return (
    <div className={s.synthetic}>
      <Eyebrow tone="muted" track="badge">
        {artifact.meta.notice}
      </Eyebrow>
      <p className={s.syntheticBody}>
        Synthetic fixture (<code>src/diagrams/fixture.ts</code>), not simulation output.
      </p>
    </div>
  )
}
