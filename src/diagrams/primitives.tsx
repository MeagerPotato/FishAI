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

/** Advance width of the 8px eyebrow role, tracked 0.16em, plus padding. */
const tagW = (label: string): number => Math.max(36, snap(label.length * 7 + 12))

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
  /** Fan-in badge, e.g. `3 IN`. Fully inside the node, so it is a chip. */
  badge?: string
  /** Extra content painted inside the box. */
  children?: ReactNode
}

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
  badge,
  children,
}: NodeBoxProps) {
  const t = TREATMENT[kind]
  const cx = x + w / 2
  const cy = y + h / 2
  const nameY = sub ? cy + 2 : cy + 4
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
            height={12}
            fill="transparent"
            stroke={t.stroke}
            strokeOpacity={0.4}
            strokeWidth={STROKE.thin}
          />
          <Label x={x + 8 + tagW(tag) / 2} y={y + 17} role="eyebrow" fill={t.tagText} anchor="middle">
            {tag}
          </Label>
        </g>
      )}
      {/* fan-in badge — a mask fully inside a node is a chip, which is legal */}
      {badge && (
        <g>
          <rect
            x={x + w - 36}
            y={y + 8}
            width={28}
            height={12}
            fill={C.ink08}
            stroke={C.ink12}
            strokeWidth={STROKE.thin}
          />
          <Label x={x + w - 22} y={y + 17} role="tech" fill={C.muted} anchor="middle">
            {badge}
          </Label>
        </g>
      )}
      {/* 4 — node name */}
      <Label x={cx} y={nameY} role="name" fill={t.text} anchor="middle">
        {name}
      </Label>
      {/* 5 — technical sublabel */}
      {sub && (
        <Label x={cx} y={cy + 16} role="tech" fill={C.muted} anchor="middle">
          {sub}
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
