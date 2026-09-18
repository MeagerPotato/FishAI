/**
 * The refusal screens — SITE_SPEC.md §1.1: *"the site must refuse to render (with a clear
 * message, not a blank page) if the hash does not match the shipped RULES_US54.md."*
 *
 * Two things this deliberately does NOT do. It does not render the results anyway behind a
 * warning strip — the results describe rules that are not the rules this build ships, so every
 * number on the page would be mislabelled. And it does not render an error boundary's stack: the
 * reader of a research site is not debugging the site, they need to know which document moved
 * and what to do about it.
 */

import type { ReactNode } from 'react'
import { Eyebrow, Section, SectionHead } from '../../components/index.ts'
import { LabShell } from './LabShell.tsx'
import type { ArtifactCase } from '../artifact.ts'
import { RULES_FILE, type RulesCheck } from '../rules.ts'
import s from './lab.module.css'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.refuseRow}>
      <Eyebrow tone="muted" track="legal">
        {label}
      </Eyebrow>
      <span className={s.mono}>{value}</span>
    </div>
  )
}

export interface RefusalProps {
  which: ArtifactCase
  current: string
  title: string[]
  sub: string
  rows: Array<{ label: string; value: string }>
  children?: ReactNode
}

function RefusalPage({ which, current, title, sub, rows, children }: RefusalProps) {
  return (
    <LabShell current={current} docTitle="Refused" which={which} stamp="Rule set us54 · refused">
      <Section noRule badge="Refused">
        <SectionHead level="h1" lines={title} sub={sub} />
        <div className={s.refuse}>
          <div className={s.refuseBox}>
            {rows.map((row) => (
              <Row key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
          {children}
        </div>
      </Section>
    </LabShell>
  )
}

/** The §1.1 case: the artifact parsed, but it was produced under different rules. */
export function RulesMismatch({
  which,
  current,
  check,
}: {
  which: ArtifactCase
  current: string
  check: RulesCheck
}) {
  return (
    <RefusalPage
      which={which}
      current={current}
      title={['These results are for', 'rules this build *does not ship*.']}
      sub={`The artifact's rulesHash does not match ${RULES_FILE}. Re-run the simulator and re-emit the artifact.`}
      rows={[
        { label: 'Artifact', value: check.file },
        { label: 'Stamped', value: check.stamped },
        { label: `SHA-256 of ${RULES_FILE}`, value: check.shipped },
      ]}
    />
  )
}

/** The artifact did not satisfy the schema. Same refusal, different cause. */
export function ArtifactBroken({
  which,
  current,
  file,
  detail,
}: {
  which: ArtifactCase
  current: string
  file: string
  detail: string
}) {
  return (
    <RefusalPage
      which={which}
      current={current}
      title={['The artifact does not', 'match its *schema*.']}
      sub="The artifact failed validation."
      rows={[
        { label: 'Artifact', value: file },
        { label: 'Problem', value: detail },
      ]}
    />
  )
}

/** A `/lab/replay/:id` that names nothing in the artifact. */
export function ReplayNotFound({
  which,
  id,
  available,
}: {
  which: ArtifactCase
  id: string
  available: string[]
}) {
  return (
    <RefusalPage
      which={which}
      current="/lab/replay"
      title={['No replay is stored', 'under *that id*.']}
      sub="Only games the committed run recorded can be replayed."
      rows={[
        { label: 'Asked for', value: id },
        {
          label: 'Available',
          value: available.length > 0 ? available.join(', ') : 'none in this artifact',
        },
      ]}
    />
  )
}
