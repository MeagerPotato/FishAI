import type { ElementType, ReactNode } from 'react'
import { createElement } from 'react'
import { cx } from '../lib/cx.ts'
import s from './Wrap.module.css'

export interface WrapProps {
  children: ReactNode
  as?: ElementType
  className?: string
  id?: string
}

/** The container. Everything that is not deliberately full-bleed sits in one. */
export function Wrap({ children, as = 'div', className, id }: WrapProps) {
  return createElement(as, { className: cx(s.wrap, className), id }, children)
}

export const wrapClass = s.wrap
export const bleedToFrame = s.bleedToFrame
export const measure = s.measure
export const measureFull = s.measureFull
