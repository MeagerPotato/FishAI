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
import { Eyebrow, Section, SectionHead, TextLink } from '../../components/index.ts'
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
          <p className={s.prose}>
            Nothing is rendered below this point on purpose. Results are only meaningful against
            the rules that produced them, and a page that showed them anyway would be labelling
            every score rate with a rule set it was not measured under.
          </p>
          <TextLink href="/design">Design specimen — still readable, it reports nothing</TextLink>
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
      sub={`The artifact stamps a rulesHash that ${RULES_FILE} no longer hashes to. Either the rule document changed after the run, or the artifact came from a different one — and both mean the numbers describe a game other than the one documented here.`}
      rows={[
        { label: 'Artifact', value: check.file },
        { label: 'Stamped', value: check.stamped },
        { label: `SHA-256 of ${RULES_FILE}`, value: check.shipped },
      ]}
    >
      <p className={s.prose}>
        The hash is computed in the browser from the shipped document&rsquo;s own bytes, with the
        same <code>rulesHash()</code> the emitter uses — line endings normalised, trailing
        whitespace trimmed. It is not a constant baked in at build time, which would only prove
        that one number matches another number someone typed.
      </p>
      <p className={s.prose}>
        To clear it: re-run the simulator against the current {RULES_FILE} and re-emit the
        artifact. Do not edit the stamp.
      </p>
    </RefusalPage>
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
      sub="The site is a pure reader of one JSON document, and that document failed validation at the boundary. The exact path is below — it is the fastest thing to fix."
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
      sub="Replays are part of the artifact, not a database — the site can only replay games the committed run actually recorded."
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
