/**
 * The two state machines. Split, per the type's own
 * "transitions <= states x 2" rule.
 */

import { DiagramFrame, DiagramSvg, LegendStrip } from './Frame'
import { layoutDeclareMachine, layoutTurnMachine, type MachineModel } from './layout/stateMachines'
import { Connector, EndDot, NodeBox, StartDot } from './primitives'

function Machine({ model }: { model: MachineModel }) {
  const { scene, states, terminators } = model
  return (
    <DiagramFrame scene={scene}>
      <DiagramSvg scene={scene}>
        {/* Arrows before boxes. */}
        {scene.arrows.map((a) => (
          <Connector key={a.id} arrow={a} />
        ))}

        {states.map((s) => (
          <NodeBox
            key={s.id}
            x={s.x}
            y={s.y}
            w={s.w}
            h={s.h}
            kind={s.focal ? 'focal' : 'backend'}
            tag={s.tag}
            name={s.name}
            sub={s.sub}
          />
        ))}

        {terminators.map((t) =>
          t.kind === 'start' ? (
            <StartDot key={t.id} cx={t.cx} cy={t.cy} />
          ) : (
            <EndDot key={t.id} cx={t.cx} cy={t.cy} />
          ),
        )}

        <LegendStrip scene={scene} />
      </DiagramSvg>
    </DiagramFrame>
  )
}

/** 4a — the turn loop. */
export function TurnMachine({ figNo }: { figNo?: string }) {
  return <Machine model={layoutTurnMachine(figNo)} />
}

/** 4b — the declare window and the clinch terminator. */
export function DeclareWindowMachine({ figNo }: { figNo?: string }) {
  return <Machine model={layoutDeclareMachine(figNo)} />
}
