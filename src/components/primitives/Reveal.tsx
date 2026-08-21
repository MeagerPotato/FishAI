import type { ElementType, ReactNode } from 'react'
import { createElement } from 'react'
import { useReveal } from '../hooks/useReveal.ts'
import { cx } from '../lib/cx.ts'
import s from './primitives.module.css'

export interface RevealProps {
  children: ReactNode
  as?: ElementType
  /** Raise for something that should not start until properly in frame. */
  threshold?: number
  className?: string
}

/**
 * Fade-and-rise on first sight. Latching: scrolling back up does not re-hide.
 * Under `prefers-reduced-motion` the CSS neutralises it entirely, so the
 * content is simply there.
 */
export function Reveal({ children, as = 'div', threshold = 0.16, className }: RevealProps) {
  const [ref, shown] = useReveal<HTMLElement>(threshold)
  return createElement(
    as,
    { ref, className: cx(s.rv, shown && s.rvIn, className) },
    children,
  )
}
