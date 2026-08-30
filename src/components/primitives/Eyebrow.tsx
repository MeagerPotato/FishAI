import type { ElementType, ReactNode } from 'react'
import { createElement } from 'react'
import { cx } from '../lib/cx.ts'
import s from './primitives.module.css'

export type EyebrowTone = 'muted' | 'accent' | 'body'
export type EyebrowTrack = 'tight' | 'name' | 'legal' | 'badge' | 'head'
export type EyebrowVariant = 'heading' | 'micro'

/** h1..h6 — the elements for which the heading form is the default. */
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

export interface EyebrowProps {
  children: ReactNode
  /**
   * `muted` for a passive serial or column head, `accent` when the label marks
   * an ACTIVE or focal item, `body` for a name beside body copy. Tone is a
   * role, not a preference — an amber label always means "this one".
   *
   * Ignored in the `heading` variant: a heading is `--fa-ink`.
   */
  tone?: EyebrowTone
  /**
   * Tracking by role: 0.10em on a card role line up to 0.18em on a column head.
   *
   * Ignored in the `heading` variant, which is tracked at 0.04em — a serial's
   * 0.14-0.18em is what makes a heading read as a part number.
   */
  track?: EyebrowTrack
  strong?: boolean
  as?: ElementType
  /**
   * Which of the two voices this is.
   *
   *   `heading` — 15px, sentence case, weight 500, 0.04em, --fa-ink.
   *   `micro`   — 10.5px ALL-CAPS, tracked out, --fa-ink-3.
   *
   * Omitted, it is resolved from `as`: an h1..h6 gets `heading`, anything
   * else gets `micro`. See the note below on why the default is keyed to the
   * element rather than fixed.
   */
  variant?: EyebrowVariant
  className?: string
}

/**
 * The system's second voice, in two forms.
 *
 * THE MICRO FORM is the original: 10.5px, uppercase, tracked out — made by
 * shrinking the one typeface rather than adding a monospace family. It is for
 * serials (`A1`, `FIG. 001`), legal lines, column heads and stat captions.
 *
 * THE HEADING FORM is new, and exists because the micro form was also being
 * used for real section headings — `<Eyebrow as="h2">Score rate of row
 * against column</Eyebrow>` and twenty more like it. A heading set at 10.5px
 * ALL-CAPS in a legal-serial's tracking is not a heading a reader lands on.
 *
 * WHY THE DEFAULT IS KEYED TO `as` RATHER THAN FIXED AT `heading`.
 *
 * All 21 call sites that pass `as` pass a heading tag, and every one of them
 * wants the readable form — that is the defect. The other 50 call sites pass
 * no `as` at all and are genuine micro-labels: serials, `9 ITEMS`, figure
 * numbers, stat captions, the legal bar. Flipping the default outright would
 * fix 21 sites and regress 50, and would rewrite authored copy along the way
 * (a serial written `A1` and displayed as a serial is not the same string as
 * a sentence-case heading).
 *
 * So the default asks the only question that actually separates the two sets:
 * IS THIS MARKED UP AS A HEADING? A thing that is semantically a heading gets
 * the heading voice; a span gets the label voice. `variant` overrides in
 * either direction, per use — `variant="micro"` on an h4 keeps a footer
 * column head as a micro-label, `variant="heading"` on a span promotes one
 * without changing the markup.
 */
export function Eyebrow({
  children,
  tone = 'muted',
  track = 'legal',
  strong = false,
  as = 'span',
  variant,
  className,
}: EyebrowProps) {
  const resolved: EyebrowVariant =
    variant ?? (typeof as === 'string' && HEADING_TAGS.has(as) ? 'heading' : 'micro')
  const heading = resolved === 'heading'

  const toneClass =
    tone === 'accent' ? s.toneAccent : tone === 'body' ? s.toneBody : s.toneMuted
  const trackClass = {
    tight: s.trackTight,
    name: s.trackName,
    legal: s.trackLegal,
    badge: s.trackBadge,
    head: s.trackHead,
  }[track]

  return createElement(
    as,
    {
      className: cx(
        s.eyebrow,
        // Tone and track are the micro form's vocabulary. The heading form has
        // one colour and one tracking, so neither class is emitted for it.
        !heading && toneClass,
        !heading && trackClass,
        !heading && strong && s.eyebrowStrong,
        heading && s.eyebrowHeading,
        className,
      ),
    },
    children,
  )
}
