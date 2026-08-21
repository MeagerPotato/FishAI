import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from '../hooks/theme.ts'
import { cx } from '../lib/cx.ts'
import { Arrow } from '../primitives/Arrow.tsx'
import { Eyebrow } from '../primitives/Eyebrow.tsx'
import p from '../primitives/primitives.module.css'
import s from './SiteNav.module.css'

export interface NavLink {
  href: string
  label: string
}

export interface SiteNavProps {
  links: NavLink[]
  /** `href` of the current page, so the active dot and the sheet accent land. */
  current?: string
  cta?: NavLink
  /** Right-hand line in the mobile sheet's foot row. Keep it factual. */
  standfirst?: string
  brandHref?: string
}

const SHEET_ID = 'fa-nav-menu'

/**
 * The FishAI mark: the crop-mark motif itself — a hairline square with one
 * amber registration corner. It is the page architecture at logo size, which
 * is the only way a mark earns its place in a system this spare.
 */
function BrandMark() {
  return (
    <svg
      className={s.brandMark}
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="24" height="24" stroke="currentColor" strokeWidth="1" />
      <path d="M1 8 V1 H8" stroke="var(--fa-amber)" strokeWidth="2.5" />
      <path d="M8 18 L13 8 L18 18" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 14 H16" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />
    </svg>
  )
}

export function SiteNav({
  links,
  current,
  cta,
  standfirst = 'us54 · deterministic',
  brandHref = '/',
}: SiteNavProps) {
  const [open, setOpen] = useState(false)
  const { theme, toggle } = useTheme()
  const toggleRef = useRef<HTMLButtonElement | null>(null)
  const firstRowRef = useRef<HTMLAnchorElement | null>(null)

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  // Escape closes and returns focus to the control that opened the sheet.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      toggleRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Lock the page behind the sheet, and move focus into it.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => {
      firstRowRef.current?.focus()
    })
    return () => {
      document.body.style.overflow = previous
      cancelAnimationFrame(raf)
    }
  }, [open])

  // Crossing back above the collapse breakpoint must not leave a hidden sheet
  // holding the scroll lock.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 961px)')
    const onChange = () => {
      if (mq.matches) setOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => {
      mq.removeEventListener('change', onChange)
    }
  }, [])

  return (
    <>
      <nav className={s.nav} aria-label="Primary">
        <div className={s.in}>
          <a className={s.brand} href={brandHref} aria-label="FishAI — home">
            <BrandMark />
            <span className={s.brandWord}>FishAI</span>
          </a>

          <div className={s.links}>
            {links.map((link) => (
              <a
                key={link.href}
                className={s.link}
                href={link.href}
                aria-current={link.href === current ? 'page' : undefined}
              >
                {link.label}
              </a>
            ))}
          </div>

          <button
            className={s.lights}
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-pressed={theme === 'dark'}
          >
            {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          </button>

          {cta ? (
            <a className={cx(p.btn, p.btnAmber, s.cta)} href={cta.href}>
              {cta.label}
              <Arrow direction={cta.href.startsWith('#') ? 'sw' : 'ne'} />
            </a>
          ) : null}

          <button
            ref={toggleRef}
            className={s.toggle}
            type="button"
            aria-expanded={open}
            aria-controls={SHEET_ID}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => {
              setOpen((value) => !value)
            }}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>

      <div id={SHEET_ID} className={cx(s.sheet, open && s.sheetOpen)}>
        <div className={s.sheetIn}>
          <div>
            {links.map((link, i) => (
              <div
                key={link.href}
                className={s.row}
                style={{ '--i': i } as CSSProperties}
              >
                <Eyebrow tone="accent" track="badge">
                  {String(i + 1).padStart(2, '0')}
                </Eyebrow>
                <a
                  ref={i === 0 ? firstRowRef : undefined}
                  className={s.rowLink}
                  href={link.href}
                  aria-current={link.href === current ? 'page' : undefined}
                  onClick={close}
                >
                  {link.label}
                </a>
              </div>
            ))}
          </div>

          <div className={s.sheetFoot}>
            <Eyebrow tone="muted" track="legal">
              FishAI — style simulation lab
            </Eyebrow>
            <Eyebrow tone="muted" track="legal">
              {standfirst}
            </Eyebrow>
          </div>
        </div>
      </div>
    </>
  )
}
