/**
 * Dumbbell. The connector is DECLARED FIRST so the dots cap it, and both
 * marks carry their 3:1 on the boundary rather than on the accent fill: the
 * hollow end takes a 1.5px muted stroke, the solid end a 1px ink stroke, and
 * the connector runs at 55% ink (3.19:1) — heavier than the axis on purpose.
 *
 * Accent marks the SERIES here, not a focal row: the solid dot repeats on
 * every row, because the two ends have to be told apart in each pair. The
 * sort order carries rank, so no row is additionally accented.
 *
 * Value labels are placed by GEOMETRY, not by series — a focal value below
 * its reference reverses the dots, and keying the offsets to start/end would
 * put both labels inside the pair on every decreasing row.
 */

import { DiagramFrame, DiagramSvg, Label, LegendStrip } from '../Frame'
import { PLOT, type DumbbellModel } from '../layout/charts'
import { C, STROKE } from '../tokens'

export function DumbbellChart({ model }: { model: DumbbellModel }) {
  const { scene, rows, gridlines, axisTitle } = model
  const x0 = PLOT.dumbbellLeft

  return (
    <DiagramFrame scene={scene}>
      <DiagramSvg scene={scene}>
        {/* Keyed by position, not label — ticks on a narrow domain can round to the same text. */}
        {gridlines.map((g, i) =>
          i === 0 ? (
            // At the domain floor the axis replaces the gridline, never doubles it.
            <line
              key={g.x}
              x1={g.x}
              y1={PLOT.top}
              x2={g.x}
              y2={PLOT.bottom}
              stroke={C.ruleSolid}
              strokeWidth={STROKE.default}
            />
          ) : (
            <line
              key={g.x}
              x1={g.x}
              y1={56}
              x2={g.x}
              y2={408}
              stroke={C.ink08}
              strokeWidth={STROKE.thin}
            />
          ),
        )}

        {rows.map((row) => {
          const r = row.tooClose ? 4 : 6
          return (
            <g key={row.key}>
              {/* Connector first, so the dots cap it. */}
              <line
                x1={row.leftX}
                y1={row.y}
                x2={row.rightX}
                y2={row.y}
                stroke={C.ink55}
                strokeWidth={STROKE.default}
              />
              {/* Reference end: hollow. */}
              <circle
                cx={row.refX}
                cy={row.y}
                r={r}
                fill={C.paper}
                stroke={C.muted}
                strokeWidth={1.5}
              />
              {/* Style end: solid accent with an ink boundary. */}
              <circle
                cx={row.focalX}
                cy={row.y}
                r={r}
                fill={C.accent}
                stroke={C.ink}
                strokeWidth={STROKE.default}
              />

              {row.leftOnFloor ? (
                <Label x={row.leftX} y={row.y - 10} role="tech" fill={C.muted} anchor="middle">
                  {row.leftText}
                </Label>
              ) : (
                <Label x={row.leftX - 12} y={row.y + 4} role="tech" fill={C.muted} anchor="end">
                  {row.leftText}
                </Label>
              )}
              <Label x={row.rightX + 12} y={row.y + 4} role="tech" fill={C.muted}>
                {row.rightText}
              </Label>

              <Label x={x0 - 12} y={row.y + 4} role="name" fill={C.ink} anchor="end">
                {row.label}
              </Label>
            </g>
          )
        })}

        {gridlines.map((g) => (
          <Label key={`t-${g.x}`} x={g.x} y={PLOT.tickY} role="tech" fill={C.muted} anchor="middle">
            {g.label}
          </Label>
        ))}
        <Label x={580} y={456} role="eyebrow" fill={C.soft} anchor="middle">
          {axisTitle}
        </Label>

        <LegendStrip scene={scene} />
      </DiagramSvg>
    </DiagramFrame>
  )
}
