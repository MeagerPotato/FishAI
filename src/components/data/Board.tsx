import { cx } from '../lib/cx.ts'
import { bleedToFrame } from '../layout/Wrap.tsx'
import { Eyebrow } from '../primitives/Eyebrow.tsx'
import s from './Board.module.css'

export interface BoardItem {
  /** Serial. `A1`…`A9`, `01`…`09` — short, fixed width, and actually addressable. */
  ix: string
  title: string
  /** The one-line classification under the title. */
  role: string
  body: string
  /**
   * Turns the card into an index entry: the title becomes the link and the whole cell is its
   * hit area. Given only where the card genuinely stands for a destination — the evidence index
   * on `/lab` is the case it exists for. A board of definitions takes no `href`.
   */
  href?: string
}

export interface BoardProps {
  items: BoardItem[]
  className?: string
}

/** A ruled grid of items. Seams are per-cell hairlines with the outer edge cancelled. */
export function Board({ items, className }: BoardProps) {
  return (
    <div className={cx(s.board, bleedToFrame, className)}>
      {items.map((item) => (
        <article key={item.ix} className={cx(s.card, item.href !== undefined && s.cardLink)}>
          <Eyebrow tone="muted" track="legal" className={s.ix}>
            {item.ix}
          </Eyebrow>
          {/*
            One tab stop per card, not two: the anchor covers the cell with a transparent
            `::after`, so the pointer target is the whole card while the accessible name stays
            the title alone. A second link inside the body would land under that overlay and be
            unclickable, which is why `body` is plain text.
          */}
          <h3>
            {item.href === undefined ? (
              item.title
            ) : (
              <a className={s.cardHit} href={item.href}>
                {item.title}
              </a>
            )}
          </h3>
          <Eyebrow tone="body" track="tight" className={s.role}>
            {item.role}
          </Eyebrow>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  )
}
