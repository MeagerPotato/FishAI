/**
 * THE IN-PAGE CONTENTS for any long route on this site.
 *
 * `/lab` is 19,000px tall; `/lab/bounded` and `/lab/adaptive` are 14,000px each. Before this
 * component the only way through any of them was the scrollbar: the section names existed as
 * `data-badge` CSS pseudo-elements, which no reader can click and no screen reader announces,
 * and most sections carried no `id` to link to at all.
 *
 * ## Mounting it on a page
 *
 * Nothing here is specific to the lab routes. Give it a `sections` list whose every `id` is a
 * real element on the page — a `<Section id="...">` is the usual one — and render it wherever the
 * index belongs, normally at the end of the hero section so a reader meets it on arrival. The
 * stylesheet travels with the component, so a host page imports nothing else. The only thing it
 * assumes about its host is an anchor to send a reader back to the top of, which is `#main` (what
 * `LabShell` renders) and is overridable with `topHref` for any shell that does not.
 *
 * ## What it is, structurally
 *
 * `<nav>` → `<ol>` → `<a href="#id">`. That is the whole contract, and it is deliberately the
 * plainest thing that could work: the browser does the jumping, `scroll-margin-top` (global.css)
 * lands each target clear of the fixed nav, and `scroll-behavior` is already switched to `auto`
 * under `prefers-reduced-motion`. Everything below that line — the active-section marking, the
 * floating position chip — is enhancement layered on top of a list of links that is complete and
 * correct without any of it.
 *
 * ## Two pieces, because one cannot do both jobs
 *
 * The list sits in flow under the hero, where a reader arriving at the top meets it. That is the
 * right place for an index and the wrong place for a *position* indicator — 15,000px later it is
 * long gone. So the second piece is a small fixed chip that appears once the list has scrolled
 * away, naming the section the reader is currently in and offering the two moves that matter
 * from anywhere: back to the contents, and back to the top.
 *
 * The chip is why the `IntersectionObserver` earns its place. Marking the current entry in a
 * list nobody can see would be decoration; naming it in a chip that is always visible is
 * navigation.
 *
 * ## The narrow-screen rule
 *
 * At 390px the same list is ten full-width rows — a screen and a half of index before the
 * document starts. So the whole thing is a `<details>`, open by default only where there is room
 * (761px and up) and collapsed below that. It is a real disclosure, not a media-query display
 * swap: a phone reader who wants the index taps once and has it.
 *
 * `openState` starts `null` and means "nobody has said" — the width decides. The first toggle
 * pins it, so a reader's own choice survives every re-render the scroll observer causes.
 */

import { useEffect, useState } from 'react'
import { cx, useMediaQuery } from '../../components/index.ts'
import s from './lab.module.css'

export interface LabSection {
  /** The `id` of the section this points at. It has to exist in the DOM, or the link is a lie. */
  id: string
  /** Sentence case, the words a reader would use out loud — not the badge's two-word callout. */
  label: string
  /** One clause on what is in there. Optional, and skipped where the label already says it. */
  note?: string
}

export interface LabContentsProps {
  sections: readonly LabSection[]
  /**
   * The anchor for the contents block itself, so the floating chip has somewhere to send a
   * reader back to. Defaults to `contents`; only override it if a page already owns that id.
   */
  id?: string
  /**
   * Where "Top" goes. `#main` is the landmark `LabShell` renders and is right for every page
   * inside it; a page in a different shell should pass the anchor its own document starts at.
   */
  topHref?: string
}

/**
 * The band of the viewport a section has to overlap to count as the one being read: from 25%
 * down to 35%. Narrow on purpose — every lab section is far taller than 10vh, so at most one
 * can be in the band at a time and the marker never flickers between two.
 */
const BAND = '-25% 0px -65% 0px'

export function LabContents({ sections, id = 'contents', topHref = '#main' }: LabContentsProps) {
  const wide = useMediaQuery('(min-width: 761px)')
  const [openState, setOpenState] = useState<boolean | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [away, setAway] = useState(false)
  // A callback ref held in state, so the observer effect below can depend on the node itself
  // rather than on a `.current` the linter cannot see change.
  const [node, setNode] = useState<HTMLDetailsElement | null>(null)

  // The dependency is the id list flattened to a string: `sections` is a fresh array literal on
  // every render of the calling page, and re-subscribing an observer nine times a scroll would
  // be a real cost for no gain.
  const key = sections.map((section) => section.id).join(',')

  useEffect(() => {
    const ids = key.split(',').filter((each) => each.length > 0)
    const elements = ids
      .map((each) => document.getElementById(each))
      .filter((element): element is HTMLElement => element !== null)
    if (elements.length === 0) return

    const inBand = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target.id)
          else inBand.delete(entry.target.id)
        }
        // Document order, so on the seam between two sections the one being left still wins
        // until it is fully out of the band.
        const first = ids.find((each) => inBand.has(each))
        // An empty band means the reader is somewhere the sections do not cover — the hero, the
        // footer. Keep the last answer rather than blanking the chip.
        if (first !== undefined) setActive(first)
      },
      { rootMargin: BAND },
    )
    for (const element of elements) observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [key])

  // The chip appears only once the list itself has gone past. `top < 0` distinguishes "scrolled
  // above the viewport" from "not reached yet", which matters on the first paint.
  useEffect(() => {
    if (node === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (entry === undefined) return
        setAway(!entry.isIntersecting && entry.boundingClientRect.top < 0)
      },
      { threshold: 0 },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [node])

  const open = openState ?? wide
  const current = sections.find((section) => section.id === active)

  return (
    <>
      <details
        ref={setNode}
        id={id}
        className={s.toc}
        open={open}
        onToggle={(event) => {
          setOpenState(event.currentTarget.open)
        }}
      >
        <summary className={s.tocSummary}>
          <span className={s.tocTitle}>On this page</span>
          <span className={s.tocMeta}>{sections.length} sections</span>
        </summary>
        <nav aria-label="Sections of this page">
          <ol className={s.tocList}>
            {sections.map((section, ix) => (
              <li key={section.id}>
                <a
                  className={cx(s.tocLink, section.id === active && s.tocLinkOn)}
                  href={`#${section.id}`}
                  aria-current={section.id === active ? 'location' : undefined}
                >
                  <span className={s.tocNo}>{String(ix + 1).padStart(2, '0')}</span>
                  <span className={s.tocLabel}>
                    {section.label}
                    {section.note === undefined ? null : (
                      <span className={s.tocNote}>{section.note}</span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </details>

      <nav className={cx(s.jump, away && s.jumpOn)} aria-label="Reading position">
        <a className={s.jumpTo} href={`#${id}`}>
          <span className={s.jumpEyebrow}>Contents</span>
          <span className={s.jumpNow}>{current === undefined ? 'On this page' : current.label}</span>
        </a>
        <a className={s.jumpTop} href={topHref}>
          Top
        </a>
      </nav>
    </>
  )
}
