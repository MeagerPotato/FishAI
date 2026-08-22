/**
 * Payoff matrix — the DP security matrix, verbatim geometry. No arrows:
 * cells emit no edges.
 */

import { DiagramFrame, DiagramSvg, Label, LegendStrip } from './Frame'
import { layoutPayoffMatrix, type CellLevel, type PayoffInput } from './layout/payoffMatrix'
import { C, STROKE } from './tokens'
import { assertUs54 } from './types'

const LEVEL: Record<CellLevel, { fill: string; text: string; weight: number }> = {
  full: { fill: C.ink08, text: C.ink, weight: 500 },
  rw: { fill: C.sheet, text: C.ink, weight: 500 },
  read: { fill: C.ink03, text: C.muted, weight: 500 },
  none: { fill: C.paper, text: C.soft, weight: 500 },
}

export function PayoffMatrix(props: PayoffInput) {
  assertUs54(props.results)
  const model = layoutPayoffMatrix(props)
  const { scene, header, rows, cols, cells } = model

  return (
    <DiagramFrame scene={scene}>
      <DiagramSvg scene={scene}>
        {/* Header eyebrows — the engineering-drawing register. */}
        <Label x={12} y={32} role="eyebrow" fill={C.soft}>
          ROW STYLE · SCORE RATE vs COLUMN
        </Label>
        <Label x={scene.viewW - 48} y={32} role="eyebrow" fill={C.soft} anchor="end">
          US54 · RULESHASH {props.results.meta.rulesHash.slice(0, 8).toUpperCase()}
        </Label>

        {/* Header row: label cell + role banners. */}
        <rect
          x={header.labelX}
          y={header.y}
          width={header.labelW}
          height={header.h}
          fill={C.sheet}
          stroke={C.ink12}
          strokeWidth={STROKE.thin}
        />
        <Label
          x={header.labelX + header.labelW / 2}
          y={header.y + 24}
          role="name"
          fill={C.ink}
          anchor="middle"
        >
          Play style
        </Label>
        <Label
          x={header.labelX + header.labelW / 2}
          y={header.y + 40}
          role="tech"
          fill={C.muted}
          anchor="middle"
        >
          vs. opponent
        </Label>

        {cols.map((col) => (
          <g key={col.id}>
            <rect x={col.x} y={header.y} width={col.w} height={header.h} fill={C.ink} />
            <Label x={col.cx} y={header.y + 24} role="name" fill={C.paper} anchor="middle">
              {col.label}
            </Label>
            <Label
              x={col.cx}
              y={header.y + 40}
              role="tech"
              fill={C.paper}
              opacity={0.85}
              anchor="middle"
            >
              {col.code}
            </Label>
          </g>
        ))}

        {/* Row label cells. */}
        {rows.map((row) => (
          <g key={row.id}>
            <rect
              x={row.x}
              y={row.y}
              width={row.w}
              height={row.h}
              fill={C.sheet}
              stroke={C.ink12}
              strokeWidth={STROKE.thin}
            />
            <Label x={row.x + 12} y={row.y + 24} role="name" fill={C.ink}>
              {row.label}
            </Label>
            <Label x={row.x + row.w - 12} y={row.y + 24} role="tech" fill={C.soft} anchor="end">
              {row.hint}
            </Label>
          </g>
        ))}

        {/* Value cells. Score rate is encoded twice: ramp AND printed number. */}
        {cells.map((cell) => {
          const style = LEVEL[cell.level]
          const focal = cell.focal
          return (
            <g key={cell.address}>
              <rect
                x={cell.x}
                y={cell.y}
                width={cell.w}
                height={cell.h}
                fill={focal ? C.accentTint : style.fill}
                stroke={focal ? C.accent : cell.ns ? C.soft : C.ink12}
                strokeWidth={focal ? 1.4 : 0.6}
                strokeDasharray={!focal && cell.ns ? '4,3' : undefined}
              />
              <Label
                x={cell.x + cell.w / 2}
                y={focal ? cell.y + 18 : cell.y + 24}
                role="name"
                fill={focal ? C.accentText : style.text}
                weight={focal ? 600 : style.weight}
                anchor="middle"
              >
                {cell.value}
              </Label>
              {focal && cell.sub && (
                /* No fill-opacity here. `--fa-amber-2` is the DARKENED accent
                   picked so accent text clears AA (5.41:1 on sheet, 4.53:1 on
                   tile — tokens.css §3.1), and multiplying it by 0.85 spends
                   exactly the headroom that darkening bought: measured 4.01:1
                   at 8px, under the 4.5:1 this size needs. The step down from
                   the value above it is carried by size and weight instead. */
                <Label
                  x={cell.x + cell.w / 2}
                  y={cell.y + 30}
                  role="tech"
                  fill={C.accentText}
                  anchor="middle"
                >
                  {cell.sub}
                </Label>
              )}
            </g>
          )
        })}

        <LegendStrip scene={scene} />
      </DiagramSvg>
    </DiagramFrame>
  )
}
