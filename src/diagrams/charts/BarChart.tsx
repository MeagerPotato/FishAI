/**
 * Bar chart. Zero-anchored baseline, always — a truncated baseline distorts
 * the ratio between bars, which is the entire reading.
 */

import { DiagramFrame, DiagramSvg, Label, LegendStrip } from '../Frame'
import { PLOT, type BarModel } from '../layout/charts'
import { C, STROKE } from '../tokens'

export function BarChart({ model }: { model: BarModel }) {
  const { scene, bars, gridlines } = model

  return (
    <DiagramFrame scene={scene}>
      <DiagramSvg scene={scene}>
        {/* Gridlines and axes. */}
        {/* Keyed by position, not label: ticks on a narrow domain can round to the same text
            (the measured concede rates span ~0.01), and a duplicated key drops a gridline. */}
        {gridlines.map((g) => (
          <g key={g.y}>
            <line
              x1={PLOT.left}
              y1={g.y}
              x2={PLOT.right}
              y2={g.y}
              stroke={C.ink08}
              strokeWidth={STROKE.thin}
            />
            <Label x={PLOT.left - 8} y={g.y + 4} role="tech" fill={C.muted} anchor="end">
              {g.label}
            </Label>
          </g>
        ))}
        <line
          x1={PLOT.left}
          y1={PLOT.top}
          x2={PLOT.left}
          y2={PLOT.bottom}
          stroke={C.ruleSolid}
          strokeWidth={STROKE.thin}
        />
        <line
          x1={PLOT.left}
          y1={PLOT.bottom}
          x2={PLOT.right}
          y2={PLOT.bottom}
          stroke={C.ruleSolid}
          strokeWidth={STROKE.default}
        />

        {bars.map((b) => (
          <g key={b.key}>
            {/* Opaque paper mask, so nothing bleeds through the bar fill. */}
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={C.paper} />
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              fill={b.focal ? C.accentTint : C.ink08}
              stroke={b.focal ? C.accent : C.muted}
              strokeWidth={b.focal ? STROKE.strong : STROKE.default}
            />
            <Label
              x={b.x + b.w / 2}
              y={b.y - 8}
              role="tech"
              fill={b.focal ? C.accentText : C.muted}
              anchor="middle"
            >
              {b.text}
            </Label>
            <Label
              x={b.x + b.w / 2}
              y={PLOT.tickY}
              role="name"
              fill={C.ink}
              anchor="middle"
            >
              {b.label}
            </Label>
          </g>
        ))}

        <LegendStrip scene={scene} />
      </DiagramSvg>
    </DiagramFrame>
  )
}
