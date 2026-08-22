/**
 * The FishAI design system.
 *
 * Import the stylesheet once at the app entry, before any component:
 *
 *   import './styles/global.css'
 *
 * Then compose pages out of what is below. The rules that keep the system a
 * system rather than a folder of components:
 *
 *   · One SheetRoot per page. Everything aligns to --fa-rule-x.
 *   · A section is MARKED, never boxed — no background change, no shadow.
 *   · Amber is a budget. Marks and badges are free; accent TEXT is not.
 *   · Nothing has a radius. Nothing scales or casts a shadow on hover.
 *   · Motion is CSS transitions and keyframes. No animation library, no canvas,
 *     no scroll hijack — a scroll act only READS the scroll position.
 */

/* Layout */
export { SheetRoot, ruledBand } from './layout/SheetRoot.tsx'
export type { SheetRootProps } from './layout/SheetRoot.tsx'
export { Wrap, wrapClass, bleedToFrame, measure, measureFull } from './layout/Wrap.tsx'
export type { WrapProps } from './layout/Wrap.tsx'
export { Section, SectionHead, sectionHeadClass, sectionSubClass } from './layout/Section.tsx'
export type { SectionProps, SectionHeadProps } from './layout/Section.tsx'
export { SiteNav } from './layout/SiteNav.tsx'
export type { SiteNavProps, NavLink } from './layout/SiteNav.tsx'
export { SiteFooter } from './layout/SiteFooter.tsx'
export type { SiteFooterProps, FooterColumn, FooterLink } from './layout/SiteFooter.tsx'

/* Primitives */
export { Eyebrow } from './primitives/Eyebrow.tsx'
export type { EyebrowProps, EyebrowTone, EyebrowTrack } from './primitives/Eyebrow.tsx'
export { Hairline, CropMarks, FootMarks } from './primitives/Hairline.tsx'
export type { HairlineProps, HairlineVariant, MarksProps } from './primitives/Hairline.tsx'
export { Arrow } from './primitives/Arrow.tsx'
export type { ArrowProps, ArrowDirection } from './primitives/Arrow.tsx'
export { Button, TextLink, buttonRow } from './primitives/Button.tsx'
export type { ButtonProps, ButtonVariant, TextLinkProps } from './primitives/Button.tsx'
export { Reveal } from './primitives/Reveal.tsx'
export type { RevealProps } from './primitives/Reveal.tsx'
export { MaskedLines, parseDim } from './primitives/MaskedLines.tsx'
export type { MaskedLinesProps } from './primitives/MaskedLines.tsx'
export { InkPanel, inkPanelBody, inkPanelNote } from './primitives/InkPanel.tsx'
export type { InkPanelProps } from './primitives/InkPanel.tsx'

/* Scroll acts */
export { PinAct, pinHead, pinHeadAside } from './acts/PinAct.tsx'
export type { PinActProps } from './acts/PinAct.tsx'

/* Data displays */
export { Board } from './data/Board.tsx'
export type { BoardProps, BoardItem } from './data/Board.tsx'
export { StatChart } from './data/StatChart.tsx'
export type { StatChartProps, Stat } from './data/StatChart.tsx'

/* Hooks */
export { useReveal } from './hooks/useReveal.ts'
export { useStepProgress } from './hooks/useStepProgress.ts'
export type { StepProgressOptions } from './hooks/useStepProgress.ts'
export { useMediaQuery, usePrefersReducedMotion } from './hooks/useMediaQuery.ts'
export { useScrollable } from './hooks/useScrollable.ts'
export { useDocumentTitle } from './hooks/useDocumentTitle.ts'
export { useCountUp } from './hooks/useCountUp.ts'
export { useTheme, getTheme, setTheme, applyTheme } from './hooks/theme.ts'
export type { Theme } from './hooks/theme.ts'

/* Utilities */
export { cx } from './lib/cx.ts'

/* The specimen route */
export { SystemDemo } from './demo/SystemDemo.tsx'
