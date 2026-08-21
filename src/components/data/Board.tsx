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
        <article key={item.ix} className={s.card}>
          <Eyebrow tone="muted" track="legal" className={s.ix}>
            {item.ix}
          </Eyebrow>
          <h3>{item.title}</h3>
          <Eyebrow tone="body" track="tight" className={s.role}>
            {item.role}
          </Eyebrow>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  )
}
