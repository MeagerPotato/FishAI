import type { ReactNode } from 'react'
import { cx } from '../lib/cx.ts'
import { Arrow } from './Arrow.tsx'
import s from './primitives.module.css'

export type ButtonVariant = 'amber' | 'ghost' | 'line'

export interface ButtonProps {
  children: ReactNode
  variant?: ButtonVariant
  /** Renders an anchor instead of a button. */
  href?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  /** Set false for a button whose action is not a departure (e.g. a toggle). */
  arrow?: boolean
  className?: string
  'aria-label'?: string
}

/**
 * The button. Square, ringed with an inset box-shadow, and it carries the
 * shared arrow automatically — pointing south-west for an in-page anchor and
 * north-east for everything else, so the glyph reports where you are going.
 */
export function Button({
  children,
  variant = 'amber',
  href,
  onClick,
  type = 'button',
  disabled = false,
  arrow = true,
  className,
  'aria-label': ariaLabel,
}: ButtonProps) {
  const classes = cx(
    s.btn,
    variant === 'amber' && s.btnAmber,
    variant === 'ghost' && s.btnGhost,
    variant === 'line' && s.btnLine,
    className,
  )
  const glyph = arrow ? <Arrow direction={href?.startsWith('#') ? 'sw' : 'ne'} /> : null

  if (href) {
    return (
      <a className={classes} href={href} aria-label={ariaLabel}>
        {children}
        {glyph}
      </a>
    )
  }

  return (
    <button
      className={classes}
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
      {glyph}
    </button>
  )
}

export const buttonRow = s.btnRow

export interface TextLinkProps {
  children: ReactNode
  href: string
  arrow?: boolean
  className?: string
}

/** An underlined inline link. Hover moves it to accent, rule and all. */
export function TextLink({ children, href, arrow = true, className }: TextLinkProps) {
  return (
    <a className={cx(s.tlink, className)} href={href}>
      {children}
      {arrow ? <Arrow direction={href.startsWith('#') ? 'sw' : 'ne'} /> : null}
    </a>
  )
}
