/**
 * One card face, in its suit's ink.
 *
 * Every place this surface draws a card goes through here — the hand, the ask picker's chips and
 * the declare dialog's assignment rows — so a card looks like the same object wherever it
 * appears and the red/black rule has exactly one implementation to be wrong in.
 *
 * `size` is the only knob: `lg` is the hand, where a card is a card and wants to be read across
 * the table; `md` is a face inside a chip or a dialog row. Both sit in a box that meets the 44px
 * touch minimum on its own, so a face can BE a control without a wrapper adding padding for it.
 *
 * On a pressed chip the ground inverts to `--fa-ink`, and the suit inks invert with it; that
 * swap is a CSS descendant rule in play.module.css (`.chipOn .face`), not a prop, because the
 * pressed state is owned by the chip and a face should not have to be told about it.
 */
import type { Card } from '../../lib/engine/index.ts'
import { cx } from '../components/index.ts'
import { cardLabel, suitColor } from './format.ts'
import s from './play.module.css'

export interface CardFaceProps {
  card: Card
  /** `lg` for the hand, `md` inside a chip or dialog row. Default `md`. */
  size?: 'md' | 'lg'
  className?: string
}

export function CardFace({ card, size = 'md', className }: CardFaceProps) {
  return (
    <span
      className={cx(
        s.face,
        size === 'lg' ? s.faceLg : s.faceMd,
        suitColor(card) === 'red' ? s.faceRed : s.faceBlack,
        className,
      )}
    >
      {cardLabel(card)}
    </span>
  )
}
