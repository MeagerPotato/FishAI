/**
 * Core SVG primitives: the 5-layer node box and the masked elbow connector.
 *
 * Paint order is a contract, not a preference — arrows are rendered before
 * boxes everywhere, so a connector never crosses in front of a node.
 */

import type { ReactNode } from 'react'
import { Label, useDiagramId } from './Frame'
import { longestSegmentMid, orthoPath, placeLabel, snap } from './geometry'
import type { SceneArrow } from './scene'
import { C, STROKE } from './tokens'

export type NodeKind = 'focal' | 'backend' | 'store' | 'external' | 'input' | 'optional'

interface Treatment {
  fill: string
  stroke: string
  dash?: string
  text: string
  tagText: string
}

/** Node type -> treatment, re-skinned from the source system's table. */
export const TREATMENT: Record<NodeKind, Treatment> = {
  focal: { fill: C.accentTint, stroke: C.accent, text: C.ink, tagText: C.accentText },
  backend: { fill: C.sheet, stroke: C.ink, text: C.ink, tagText: C.muted },
  store: { fill: C.ink05, stroke: C.muted, text: C.ink, tagText: C.muted },
  external: { fill: C.ink03, stroke: C.ink30, text: C.ink, tagText: C.soft },
  input: { fill: C.tile, stroke: C.soft, text: C.ink, tagText: C.soft },
  optional: { fill: C.ink02, stroke: C.ink20, dash: '4,3', text: C.muted, tagText: C.soft },
}

/**
 * Advance width of the 12px eyebrow role, tracked 0.16em, plus padding.
 *
 * Measured: 9.95px per character at the widest ("REDUCE"), so 10/char plus a
 * 16px pad. The 48px floor is the four-character minimum at that rate — a
 * fixed 36px box, sized for the old 8px role, clipped every tag.
 */
const tagW = (label: string): number => Math.max(48, snap(label.length * 10 + 16))

/** Chip height and the baseline inside it, for one line of the 12px role. */
const TAG_H = 20
const TAG_BASELINE = 22

export interface NodeBoxProps {
  x: number
  y: number
  w: number
  h: number
  kind?: NodeKind
  /** Rectangular type tag — square, never a pill. */
  tag?: string
  name: string
  /** Technical sublabel: params, counts, codes. */
  sub?: string
  /**
   * A third line under `sub`, in the `tech` role — a tool, a module, a file.
   *
   * It exists so the vertical rhythm of a three-line node is computed HERE,
   * with knowledge of how many lines there are, rather than by a caller
   * hard-coding a y offset against the box's bottom edge. At 8px type a
   * caller could get away with the latter; at 12/16px the lines collide.
   */
  foot?: string
  /** Fan-in badge, e.g. `3 IN`. Fully inside the node, so it is a chip. */
  badge?: string
  /** Extra content painted inside the box. */
  children?: ReactNode
}

/** Baseline pitch for the stacked lines inside a node. */
const LINE_PITCH = 20
/** Chip band height: the tag/badge chip plus its 8px top inset. */
const CHIP_BAND = 28

/**
 * The 5-layer node box.
 *
 *   1. opaque paper mask   — stops arrows bleeding through translucent fills
 *   2. styled box
 *   3. rectangular type tag (square, never a pill)
 *   4. node name           — the `name` type role
 *   5. technical sublabel  — the `tech` type role
 */
export function NodeBox({
  x,
  y,
  w,
  h,
  kind = 'backend',
  tag,
  name,
  sub,
  foot,
  badge,
  children,
}: NodeBoxProps) {
  const t = TREATMENT[kind]
  const cx = x + w / 2

  /**
   * THE LINE STACK.
   *
   * Name is 16px (a 20px box), sub and foot are 12px (15px boxes), and the
   * baselines run on a 20px pitch — the smallest that keeps a name's
   * descenders clear of the caps of the line under it.
   *
   * The stack is centred in whatever vertical space is actually free: the
   * whole box normally, or the box BELOW the chip band when the node carries
   * a tag or a badge. Centring on the box's own middle regardless is what put
   * a 16px name through a tag chip on every state in both machines.
   *
   * The `+ 6` is the optical correction that puts a single 16px line on the
   * centre line rather than hanging its baseline there.
   */
  const lines = 1 + (sub ? 1 : 0) + (foot ? 1 : 0)
  const chipped = tag !== undefined || badge !== undefined
  const freeTop = chipped ? y + CHIP_BAND : y
  const freeH = chipped ? h - CHIP_BAND : h
  const firstY = freeTop + freeH / 2 - ((lines - 1) * LINE_PITCH) / 2 + 6
  const subY = firstY + LINE_PITCH
  const footY = firstY + (sub ? 2 : 1) * LINE_PITCH
  return (
    <g>
      {/* 1 — opaque paper mask */}
      <rect x={x} y={y} width={w} height={h} fill={C.paper} />
      {/* 2 — styled box */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={t.fill}
        stroke={t.stroke}
        strokeWidth={kind === 'focal' ? STROKE.strong : STROKE.default}
        strokeDasharray={t.dash}
      />
      {/* 3 — rectangular type tag. Sized from its own label, on the grid:
             a fixed 36px box clips anything past five characters. */}
      {tag && (
        <g>
          <rect
            x={x + 8}
            y={y + 8}
            width={tagW(tag)}
            height={TAG_H}
            fill="transparent"
            stroke={t.stroke}
            strokeOpacity={0.4}
            strokeWidth={STROKE.thin}
          />
          <Label
            x={x + 8 + tagW(tag) / 2}
            y={y + TAG_BASELINE}
            role="eyebrow"
            fill={t.tagText}
            anchor="middle"
          >
            {tag}
          </Label>
        </g>
      )}
      {/* fan-in badge — a mask fully inside a node is a chip, which is legal */}
      {badge && (
        <g>
          <rect
            x={x + w - 52}
            y={y + 8}
            width={44}
            height={TAG_H}
            fill={C.ink08}
            stroke={C.ink12}
            strokeWidth={STROKE.thin}
          />
          <Label x={x + w - 30} y={y + TAG_BASELINE} role="tech" fill={C.muted} anchor="middle">
            {badge}
          </Label>
        </g>
      )}
      {/* 4 — node name */}
      <Label x={cx} y={firstY} role="name" fill={t.text} anchor="middle">
        {name}
      </Label>
      {/* 5 — technical sublabel */}
      {sub && (
        <Label x={cx} y={subY} role="tech" fill={C.muted} anchor="middle">
          {sub}
        </Label>
      )}
      {/* 6 — the third line, when there is one */}
      {foot && (
        <Label x={cx} y={footY} role="tech" fill={C.soft} anchor="middle">
          {foot}
        </Label>
      )}
      {children}
    </g>
  )
}

/** Start marker for a state machine: a filled ink dot. */
export function StartDot({ cx, cy }: { cx: number; cy: number }) {
  return <circle cx={cx} cy={cy} r={6} fill={C.ink} />
}

/** End marker: a ringed dot. */
export function EndDot({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill="none" stroke={C.ink} strokeWidth={STROKE.default} />
      <circle cx={cx} cy={cy} r={5} fill={C.ink} />
    </g>
  )
}

export interface ConnectorProps {
  arrow: SceneArrow
  /** Omit the arrowhead — for lines that are not directed. */
  headless?: boolean
}

/**
 * A rounded right-angle elbow connector with its masked label.
 *
 * `orthoPath` throws on a diagonal waypoint pair, so this component cannot
 * emit one.
 */
export function Connector({ arrow, headless }: ConnectorProps) {
  const slug = useDiagramId()
  const stroke = arrow.accent ? C.accent : C.muted
  const marker = arrow.accent ? `url(#${slug}-arrow-accent)` : `url(#${slug}-arrow)`
  const d = orthoPath(arrow.points)

  const mid = arrow.labelMid ?? longestSegmentMid(arrow.points)
  const p =
    arrow.label !== undefined
      ? placeLabel(mid, arrow.labelSide ?? 'above', arrow.labelGap ?? 8, arrow.label)
      : undefined

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={arrow.accent ? STROKE.strong : STROKE.default}
        strokeDasharray={arrow.dashed ? '5,4' : undefined}
        markerEnd={headless ? undefined : marker}
      />
      {p && arrow.label !== undefined && (
        <g>
          <rect x={p.maskX} y={p.maskY} width={p.maskW} height={p.maskH} fill={C.paper} />
          <Label
            x={p.textX}
            y={p.textY}
            role="arrow"
            fill={arrow.accent ? C.accentText : C.soft}
            anchor={p.anchor}
          >
            {arrow.label}
          </Label>
        </g>
      )}
    </g>
  )
}
