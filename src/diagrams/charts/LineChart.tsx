/**
 * Line chart. Polylines, never splines — a smoothed curve over sampled data
 * invents values that were never measured. Dots only on the focal series.
 */

import { DiagramFrame, DiagramSvg, Label, LegendStrip } from '../Frame'
import { PLOT, type LineModel } from '../layout/charts'
import { C, STROKE } from '../tokens'

export function LineChart({ model }: { model: LineModel }) {
  const { scene, series, gridlines, xLabels, referenceY } = model

  return (
    <DiagramFrame scene={scene}>
      <DiagramSvg scene={scene}>
        {/* Keyed by position, not label — two ticks can round to the same text on a narrow
            domain, and React drops one of a duplicated key. */}
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

        {/* The calibration rule. The band is disclosed in the caption. */}
        {referenceY !== undefined && (
          <g>
            <line
              x1={PLOT.left}
              y1={referenceY}
              x2={PLOT.right}
              y2={referenceY}
              stroke={C.ruleSolid}
              strokeWidth={STROKE.default}
              strokeDasharray="5,4"
            />
            <Label x={PLOT.right + 4} y={referenceY + 4} role="tech" fill={C.soft}>
              EVEN
            </Label>
          </g>
        )}

        {series.map((s) => (
          <g key={s.key}>
            <polyline
              points={s.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={s.focal ? 1.8 : 1.2}
              strokeDasharray={s.dash}
              strokeLinejoin="round"
            />
            {s.focal &&
              s.points.map((p) => (
                <circle
                  key={`${s.key}-${p.x}`}
                  cx={p.x}
                  cy={p.y}
                  r={4}
                  fill={s.color}
                  stroke={C.ink}
                  strokeWidth={STROKE.thin}
                />
              ))}
          </g>
        ))}

        {xLabels.map((l) => (
          <Label key={l.label} x={l.x} y={PLOT.tickY} role="tech" fill={C.muted} anchor="middle">
            {l.label}
          </Label>
        ))}

        <LegendStrip scene={scene} />
      </DiagramSvg>
    </DiagramFrame>
  )
}
