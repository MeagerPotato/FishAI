import { Arrow } from '../primitives/Arrow.tsx'
import { Eyebrow } from '../primitives/Eyebrow.tsx'
import { FootMarks } from '../primitives/Hairline.tsx'
import { Wrap } from './Wrap.tsx'
import s from './SiteFooter.module.css'

export interface FooterLink {
  href: string
  label: string
}

export interface FooterColumn {
  /** Micro-label column head. One word where possible. */
  title: string
  items: FooterLink[]
}

export interface SiteFooterProps {
  /** The one sentence the footer is allowed. */
  standfirst: string
  columns: FooterColumn[]
  /** Left of the legal bar. The year is supplied, never computed at render. */
  legal: string
  /** Right of the legal bar. A serial, a hash, a rule-set stamp. */
  stamp: string
}

/**
 * Closes the sheet. Ruled ground, a 1.4fr identity column against three link
 * columns, a micro-label legal bar, and the footer brackets.
 */
export function SiteFooter({ standfirst, columns, legal, stamp }: SiteFooterProps) {
  return (
    <footer className={s.footer}>
      <Wrap>
        <div className={s.lead}>
          <Eyebrow tone="muted" track="head">
            Colophon
          </Eyebrow>
          <p className={s.leadTitle}>{standfirst}</p>
        </div>

        <div className={s.grid}>
          {columns.map((column) => (
            <div key={column.title}>
              <Eyebrow as="h4" tone="muted" track="head">
                {column.title}
              </Eyebrow>
              {column.items.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                  <Arrow direction={item.href.startsWith('#') ? 'sw' : 'ne'} />
                </a>
              ))}
            </div>
          ))}
        </div>

        <div className={s.legal}>
          <Eyebrow tone="muted" track="legal">
            {legal}
          </Eyebrow>
          <Eyebrow tone="muted" track="legal">
            {stamp}
          </Eyebrow>
        </div>
      </Wrap>
      <FootMarks />
    </footer>
  )
}
