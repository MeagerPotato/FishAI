/**
 * Analysis pipeline — the data-flow type. Lane tints and dividers are
 * "zones" and paint first; arrows next; node boxes last.
 */

import { DiagramFrame, DiagramSvg, Label, LegendStrip } from './Frame'
import { layoutPipeline } from './layout/pipeline'
import { Connector, NodeBox } from './primitives'
import { C, STROKE } from './tokens'

export function AnalysisPipeline({ figNo }: { figNo?: string }) {
  const { scene, lanes, steps, nodes, labelColW, headerH } = layoutPipeline(figNo)
  const laneH = lanes.length > 1 ? lanes[1].y - lanes[0].y : 96

  return (
    <DiagramFrame scene={scene}>
      <DiagramSvg scene={scene}>
        {/* Layer 1 — zones: lane tints, dividers, label-column rule. */}
        {lanes.map((lane, k) =>
          k % 2 === 0 ? (
            <rect
              key={`tint-${lane.key}`}
              x={0}
              y={lane.y}
              width={scene.viewW}
              height={laneH}
              fill={C.ink02}
            />
          ) : null,
        )}
        {lanes.map((lane) => (
          <line
            key={`div-${lane.key}`}
            x1={0}
            y1={lane.y}
            x2={scene.viewW}
            y2={lane.y}
            stroke={C.rule}
            strokeWidth={STROKE.thin}
          />
        ))}
        <line
          x1={labelColW}
          y1={headerH}
          x2={labelColW}
          y2={scene.legendY}
          stroke={C.rule}
          strokeWidth={STROKE.thin}
        />

        {/* Step header chips. */}
        {steps.map((step) => (
          <g key={step.number}>
            <rect x={step.chipX} y={8} width={32} height={16} fill={C.ink12} />
            <Label x={step.cx} y={20} role="tech" fill={C.ink} anchor="middle">
              {step.number}
            </Label>
            <Label x={step.cx} y={32} role="eyebrow" fill={C.muted} anchor="middle">
              {step.label}
            </Label>
          </g>
        ))}

        {/* Lane labels — two-line eyebrow. */}
        {lanes.map((lane) => (
          <g key={`label-${lane.key}`}>
            <Label x={labelColW / 2} y={lane.mid - 4} role="eyebrow" fill={C.muted} anchor="middle">
              {lane.name[0]}
            </Label>
            <Label x={labelColW / 2} y={lane.mid + 12} role="tech" fill={C.soft} anchor="middle">
              {lane.name[1]}
            </Label>
          </g>
        ))}

        {/* Layer 2 — arrows, before boxes. */}
        {scene.arrows.map((a) => (
          <Connector key={a.id} arrow={a} />
        ))}

        {/* Layer 3 — nodes. */}
        {nodes.map((n) => (
          <NodeBox
            key={n.id}
            x={n.x}
            y={n.y}
            w={n.w}
            h={n.h}
            kind={n.focal ? 'focal' : 'backend'}
            name={n.title}
            sub={n.sub}
          >
            <Label x={n.x + n.w / 2} y={n.y + n.h - 8} role="tech" fill={C.soft} anchor="middle">
              {n.tool}
            </Label>
          </NodeBox>
        ))}

        <LegendStrip scene={scene} />
      </DiagramSvg>
    </DiagramFrame>
  )
}
