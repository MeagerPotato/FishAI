import type { ReactNode } from 'react'
import { createElement } from 'react'
import { useReveal } from '../hooks/useReveal.ts'
import { cx } from '../lib/cx.ts'
import s from './primitives.module.css'

/**
 * Parses the authoring convention: `*asterisks*` mark the muted half of a
 * headline. Keeping emphasis in the copy rather than in the markup means a
 * headline can be edited without touching a component.
 */
export function parseDim(line: string): ReactNode[] {
  return line.split(/\*([^*]+)\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="fa-dim">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

export interface MaskedLinesProps {
  /** One string per rendered line. Three is the practical maximum. */
  lines: string[]
  level?: 'h1' | 'h2' | 'h3'
  className?: string
}

/**
 * The heading entrance: each line is a clipping box and the text slides up out
 * of it, staggered 80ms per line. Line breaks are authored, not computed —
 * where a headline breaks is a typographic decision.
 */
export function MaskedLines({ lines, level = 'h2', className }: MaskedLinesProps) {
  const [ref, shown] = useReveal<HTMLHeadingElement>(0.16)

  return createElement(
    level,
    { ref, className: cx(s.lines, shown && s.linesIn, className) },
    lines.map((line, i) => (
      <span key={i} className={s.ln}>
        <span>{parseDim(line)}</span>
      </span>
    )),
  )
}
