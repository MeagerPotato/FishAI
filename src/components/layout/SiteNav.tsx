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
  const navRef = useRef<HTMLElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const toggleRef = useRef<HTMLButtonElement | null>(null)
  const firstRowRef = useRef<HTMLAnchorElement | null>(null)

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  /**
   * Escape closes and returns focus to the control that opened the sheet; Tab cycles inside it.
   *
   * The trap spans BOTH roots, not the sheet alone: the bar sits at z-index 90 against the
   * sheet's 60, so the brand, the lights toggle and the hamburger stay visible and clickable
   * over the open menu. A trap that covered only the sheet would let Shift+Tab walk out into
   * controls the reader can still see — and then straight on into the page behind them.
   *
   * Hidden controls are filtered by `offsetParent`: below the collapse the desktop `.links`
   * are `display: none`, so they must not be tab stops even though they are still in the DOM.
   */
  useEffect(() => {
    if (!open) return

    const focusables = (): HTMLElement[] => {
      const found: HTMLElement[] = []
      for (const root of [navRef.current, sheetRef.current]) {
        if (!root) continue
        for (const el of root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')) {
          if (el.offsetParent !== null) found.push(el)
        }
      }
      return found
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
        return
      }
      if (event.key !== 'Tab') return
      const list = focusables()
      const first = list[0]
      const last = list[list.length - 1]
      if (!first || !last) return
      const active = document.activeElement as HTMLElement | null
      const inside = active !== null && list.includes(active)
      const wraps = event.shiftKey ? active === first || !inside : active === last || !inside
      if (!wraps) return
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /**
   * Lock the page behind the sheet, take it out of the tab order and the accessibility tree,
   * and move focus into the sheet.
   *
   * `inert` on the page's own landmarks is the belt to the trap's braces: the overlay is
   * opaque, so everything under it is already unreachable by pointer, and it has to be just as
   * unreachable by Tab and by a screen reader's virtual cursor. The previous state is recorded
   * and restored, so a page that sets `inert` itself is not quietly cleared by the menu closing.
   */
  useEffect(() => {
    if (!open) return
    // Captured for the cleanup: both nodes outlive the open state, but reading a ref from a
    // cleanup is reading it one render too late.
    const sheet = sheetRef.current
    const hamburger = toggleRef.current
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const behind = Array.from(document.querySelectorAll<HTMLElement>('main, footer'))
    const had = behind.map((el) => el.hasAttribute('inert'))
    for (const el of behind) el.setAttribute('inert', '')
    // Focus the first row, twice over, because neither attempt alone is reliable. The sheet
    // TRANSITIONS `visibility`, and a transition's first instant still holds the old value, so
    // a synchronous focus() can land on a `visibility: hidden` element and do nothing. A rAF
    // clears that — but a rAF never runs at all in a backgrounded tab, which would leave the
    // menu open with focus still on <body>. So: try now, and if it did not take, try next frame.
    firstRowRef.current?.focus()
    const raf =
      document.activeElement === firstRowRef.current
        ? 0
        : requestAnimationFrame(() => {
            firstRowRef.current?.focus()
          })
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      document.body.style.overflow = previous
      behind.forEach((el, i) => {
        if (!had[i]) el.removeAttribute('inert')
      })
      // Focus went into the sheet, so it has to come back out with it. If the reader has
      // already moved on — clicked a row, tabbed to the lights — leave them where they are.
      const active = document.activeElement
      if (active === null || active === document.body || sheet?.contains(active)) {
        hamburger?.focus()
      }
    }
  }, [open])

  // Crossing back above the collapse breakpoint must not leave a hidden sheet
  // holding the scroll lock. Keep in step with SiteNav.module.css's 1080px collapse.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1081px)')
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
      <nav className={s.nav} aria-label="Primary" ref={navRef}>
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

      <div
        id={SHEET_ID}
        ref={sheetRef}
        className={cx(s.sheet, open && s.sheetOpen)}
        role="dialog"
        aria-modal={open ? true : undefined}
        aria-label="Site menu"
      >
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
