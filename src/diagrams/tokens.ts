/**
 * Semantic role tokens, as CSS `var()` references.
 *
 * Components NEVER write a hex value. Every colour in every diagram resolves
 * through one of these roles, so re-skinning is a change to skin.css alone.
 * (`skin.css` documents the two accessibility-forced deviations from the
 * upstream diagram-design style guide.)
 */

export const C = {
  paper: 'var(--dgm-paper)',
  sheet: 'var(--dgm-sheet)',
  paper2: 'var(--dgm-paper-2)',
  tile: 'var(--dgm-tile)',

  ink: 'var(--dgm-ink)',
  muted: 'var(--dgm-muted)',
  soft: 'var(--dgm-soft)',
  rule: 'var(--dgm-rule)',
  ruleSolid: 'var(--dgm-rule-solid)',

  ink02: 'var(--dgm-ink-02)',
  ink03: 'var(--dgm-ink-03)',
  ink05: 'var(--dgm-ink-05)',
  ink08: 'var(--dgm-ink-08)',
  ink12: 'var(--dgm-ink-12)',
  ink20: 'var(--dgm-ink-20)',
  ink30: 'var(--dgm-ink-30)',
  ink55: 'var(--dgm-ink-55)',

  accent: 'var(--dgm-accent)',
  accentText: 'var(--dgm-accent-text)',
  accentTint: 'var(--dgm-accent-tint)',
  accent50: 'var(--dgm-accent-50)',

  /**
   * Multi-series charts only, and NOT five hues.
   *
   * SITE_SPEC.md §3.1: derive from the ink ramp plus dash patterns, because
   * this system has one accent and a five-colour ramp would be a second
   * palette. Stroke and dash are paired so two series never differ by tone
   * alone — the ramp separates the ends of the range, not adjacent members.
   */
  series: [
    { stroke: 'var(--dgm-series-1)', dash: undefined },
    { stroke: 'var(--dgm-series-2)', dash: '7,4' },
    { stroke: 'var(--dgm-series-3)', dash: '2,4' },
    { stroke: 'var(--dgm-series-4)', dash: '10,4,2,4' },
  ] as const,
} as const

/**
 * Type roles. One family — the serif/sans/mono distinction of the source
 * system is carried by weight and tracking instead. Every size is divisible
 * by 4 (the upstream type files use 9/10/11px; the 4px grid rule wins).
 *
 * THESE ARE RENDERED PIXELS, NOT ABSTRACT UNITS.
 *
 * `DiagramSvg` sets `min-width: {viewW}px` on the root and `skin.css` gives
 * it `width: 100%`, so a diagram whose viewBox is wider than its column —
 * which is every diagram here on a laptop and all of them on a phone —
 * renders at exactly 1 user unit = 1 CSS pixel and scrolls inside its frame.
 * A `fontSize: 8` was therefore 8px of real type on the page: tick labels,
 * printed data values, node sublabels and every legend entry, at 8px.
 *
 * The floor is now 12. Nothing that carries a number, a name or a reading is
 * below it, and `name` — the role that carries human-readable node, row and
 * category names, the text a reader actually navigates by — sits a step above
 * at 16.
 *
 * WHY 16 AND NOT 14 for `name`: 14 is not divisible by four. The 4px grid is
 * declared at the top of this block, enforced by `verifyScene` against
 * `FONT_SIZES`, and tested in `diagrams.test.ts`; 16 is the next size on the
 * ladder above the 14 floor, so it clears the floor without special-casing
 * the grid.
 */
export const T = {
  family: 'var(--dgm-family)',

  /** Figure title inside the SVG. */
  title: { fontSize: 28, fontWeight: 500, letterSpacing: 'var(--dgm-title-track)' },
  /** Human-readable node / row / category names. */
  name: { fontSize: 16, fontWeight: 500, letterSpacing: 'var(--dgm-name-track)' },
  /** Technical content: values, codes, hashes. Tabular figures. */
  tech: { fontSize: 12, fontWeight: 500, letterSpacing: 'var(--dgm-tech-track)' },
  /** The micro-label second voice: type tags, axis captions, zone labels. */
  eyebrow: { fontSize: 12, fontWeight: 500, letterSpacing: 'var(--dgm-eyebrow-track)' },
  /** Arrow annotations: all-caps, <= 14 chars. */
  arrow: { fontSize: 12, fontWeight: 500, letterSpacing: 'var(--dgm-arrow-track)' },
} as const

export const STROKE = { thin: 0.8, default: 1, strong: 1.2 } as const

/**
 * SQUARE. SITE_SPEC.md §3.1 makes "nothing gets a corner radius" a carry-over
 * that survives any re-skin, and §2 makes it the system's strongest identity
 * signal after the crop marks. Upstream ships rx 4 / 6 / 8; the named keys
 * survive so the mapping stays legible and reversible in one line.
 *
 * This does NOT touch the r=8 quarter-arcs on elbow connectors. That rule is
 * about routing, not corners, and it stays non-negotiable.
 */
export const RADIUS = { sm: 0, md: 0, lg: 0 } as const

/**
 * Every font size the diagrams may use, for the 4px-grid gate.
 *
 * 8 is gone. It is not merely unused — it is below the floor set in `T`, and
 * leaving it in the allowlist would let a future label drop back to it and
 * still pass the gate.
 */
export const FONT_SIZES = [12, 16, 20, 24, 28] as const
