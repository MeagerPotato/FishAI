/**
 * Counter-graph — the dependency graph. Arrows are drawn BEFORE boxes, so
 * z-order puts every connector behind every node.
 */

import { DiagramFrame, DiagramSvg, LegendStrip } from './Frame'
import { layoutCounterGraph, type CounterInput } from './layout/counterGraph'
import { Connector, NodeBox } from './primitives'
import { assertUs54 } from './types'

export function CounterGraph(props: CounterInput) {
  assertUs54(props.results)
  const { scene, nodes, arrows } = layoutCounterGraph(props)

  return (
    <DiagramFrame scene={scene}>
      <DiagramSvg scene={scene}>
        {/* Layer 2 — arrows, before boxes. */}
        {arrows.map((a) => (
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
            kind={n.focal ? 'focal' : n.fanOut === 0 ? 'store' : 'backend'}
            tag={n.family}
            name={n.label}
            sub={`${n.fanOut} OUT`}
            badge={`${n.fanIn} IN`}
          />
        ))}

        <LegendStrip scene={scene} />
      </DiagramSvg>
    </DiagramFrame>
  )
}
