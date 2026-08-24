/**
 * The v1.0 mechanism strip — one lane, four stages, the third one focal.
 * Arrows before boxes, per the paint-order contract.
 */

import { DiagramFrame, DiagramSvg, Label, LegendStrip } from './Frame'
import { layoutAdaptiveMechanism } from './layout/adaptiveMechanism'
import { Connector, NodeBox } from './primitives'
import { C } from './tokens'

export function AdaptiveMechanism({ figNo }: { figNo?: string }) {
  const { scene, nodes } = layoutAdaptiveMechanism(figNo)

  return (
    <DiagramFrame scene={scene}>
      <DiagramSvg scene={scene}>
        {/* Layer 1 — arrows, before boxes. */}
        {scene.arrows.map((a) => (
          <Connector key={a.id} arrow={a} />
        ))}

        {/* Layer 2 — the four stage boxes. */}
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
            <Label x={n.x + n.w / 2} y={n.y + n.h - 10} role="tech" fill={C.soft} anchor="middle">
              {n.tool}
            </Label>
          </NodeBox>
        ))}

        <LegendStrip scene={scene} />
      </DiagramSvg>
    </DiagramFrame>
  )
}
