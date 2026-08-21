import type { ReactNode } from 'react'
import { cx } from '../lib/cx.ts'
import { MaskedLines } from '../primitives/MaskedLines.tsx'
import { Reveal } from '../primitives/Reveal.tsx'
import s from './Section.module.css'
import w from './Wrap.module.css'

export interface SectionProps {
  children: ReactNode
  /**
   * The amber tab in the top-left corner. Sentence case, two words, plainly
   * descriptive — "The roster", "By the numbers". Never marketing language:
   * the badge is a drawing callout, not a headline.
   */
  badge?: string
  id?: string
  /** Suppress the top hairline. For an opening section, or one that follows a
   *  pinned band that already draws its own edge. */
  noRule?: boolean
  /** Suppress the crop marks. For a closing section that belongs to the footer. */
  noMarks?: boolean
  /** Full-bleed: no container, and a real border-top instead of the inset rule. */
  bleed?: boolean
  className?: string
}

/**
 * The section shell: container + vertical rhythm + top hairline + crop marks +
 * optional badge. Every band on the page is one of these.
 */
export function Section({
  children,
  badge,
  id,
  noRule = false,
  noMarks = false,
  bleed = false,
  className,
}: SectionProps) {
  return (
    <section
      id={id}
      data-badge={badge}
      className={cx(
        s.section,
        s.pad,
        !bleed && w.wrap,
        !noRule && (bleed ? s.borderTop : s.rule),
        noRule && s.noRule,
        !noMarks && s.marks,
        className,
      )}
    >
      {children}
    </section>
  )
}

export interface SectionHeadProps {
  /**
   * One string per rendered line. `*asterisks*` mark the muted half of a
   * headline — the strong-to-quiet gradient is the system's only in-heading
   * emphasis device, and it costs no colour.
   */
  lines: string[]
  sub?: ReactNode
  level?: 'h1' | 'h2' | 'h3'
  centre?: boolean
  className?: string
}

/** Masked-line headline plus an optional deck. Used verbatim in every section. */
export function SectionHead({
  lines,
  sub,
  level = 'h2',
  centre = false,
  className,
}: SectionHeadProps) {
  return (
    <div className={cx(s.head, centre && s.headCentre, className)}>
      <MaskedLines lines={lines} level={level} />
      {sub ? (
        <Reveal as="p" className={s.sub}>
          {sub}
        </Reveal>
      ) : null}
    </div>
  )
}

export const sectionHeadClass = s.head
export const sectionSubClass = s.sub
