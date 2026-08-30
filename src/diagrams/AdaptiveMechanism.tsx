/**
 * The v1.0 mechanism strip — one lane, four stages, the third one focal.
 * Arrows before boxes, per the paint-order contract.
 */

import { DiagramFrame, DiagramSvg, LegendStrip } from './Frame'
import { layoutAdaptiveMechanism } from './layout/adaptiveMechanism'
import { Connector, NodeBox } from './primitives'

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
            foot={n.tool}
          />
        ))}

        <LegendStrip scene={scene} />
      </DiagramSvg>
    </DiagramFrame>
  )
}
