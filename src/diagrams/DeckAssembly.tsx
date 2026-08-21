/**
 * Deck assembly — 54 cards separating into 9 sets of 6.
 *
 * Self-drawing with stroke-dashoffset + CSS keyframes, staggered column by
 * column, exactly the technique pleurat uses for its line work. No WebGL, no
 * canvas, no rAF loop, no animation library. The finished frame is the real
 * diagram; the animation only sequences it, which is why
 * `prefers-reduced-motion` can simply land on the end state (see skin.css).
 */

import type { CSSProperties } from 'react'
import { DiagramFrame, DiagramSvg, Label, LegendStrip } from './Frame'
import { layoutDeck } from './layout/deck'
import { C, STROKE } from './tokens'

/** CSS custom properties are not in the CSSProperties index signature. */
const vars = (v: Record<string, string>): CSSProperties => v as CSSProperties

const COL_MS = 110
const CARD_MS = 26

export function DeckAssembly({ figNo }: { figNo?: string }) {
  const { scene, sets, ruleY, countY, countLabelY, arithmetic } = layoutDeck(figNo)
  const ruleLen = scene.viewW - 80

  return (
    <DiagramFrame scene={scene}>
      <DiagramSvg scene={scene}>
        {/* Header: what the deck is, and the arithmetic that makes it 9x6. */}
        <Label x={40} y={32} role="eyebrow" fill={C.soft}>
          54 CARDS · DEALT 9 EACH TO 6 SEATS
        </Label>
        <Label
          x={scene.viewW - 40}
          y={32}
          role="name"
          fill={C.accentText}
          anchor="end"
        >
          {arithmetic}
        </Label>

        {/* pleurat's hairline device, drawing itself first. */}
        <line
          className="dgm-draw"
          style={vars({ '--dgm-len': `${ruleLen}`, '--dgm-delay': '0ms' })}
          x1={40}
          y1={ruleY}
          x2={scene.viewW - 40}
          y2={ruleY}
          stroke={C.rule}
          strokeWidth={STROKE.default}
        />

        {sets.map((set, j) => {
          const colDelay = 160 + j * COL_MS
          return (
            <g key={set.id}>
              {/* Set name — two lines, the micro-label voice. */}
              <Label
                className="dgm-fade"
                x={set.x + set.w / 2}
                y={64}
                role="eyebrow"
                fill={set.accent ? C.accentText : C.muted}
                anchor="middle"
                style={vars({ '--dgm-delay': `${colDelay}ms` })}
              >
                {set.kind}
              </Label>
              <Label
                className="dgm-fade"
                x={set.x + set.w / 2}
                y={80}
                role="name"
                fill={set.accent ? C.accentText : C.ink}
                anchor="middle"
                style={vars({ '--dgm-delay': `${colDelay}ms` })}
              >
                {set.qualifier}
              </Label>

              {/* The set boundary, drawing itself. */}
              <rect
                x={set.x}
                y={set.y}
                width={set.w}
                height={set.h}
                fill={set.accent ? C.accentTint : C.paper2}
                stroke="none"
                className="dgm-fade"
                style={vars({ '--dgm-delay': `${colDelay}ms` })}
              />
              <rect
                className="dgm-draw"
                style={vars({
                  '--dgm-len': `${set.perimeter}`,
                  '--dgm-delay': `${colDelay}ms`,
                })}
                x={set.x}
                y={set.y}
                width={set.w}
                height={set.h}
                fill="none"
                stroke={set.accent ? C.accent : C.ruleSolid}
                strokeWidth={set.accent ? STROKE.strong : STROKE.default}
              />

              {/* The six cards. */}
              {set.cards.map((card, r) => {
                const delay = colDelay + 220 + r * CARD_MS
                return (
                  <g
                    key={card.id}
                    className="dgm-fade"
                    style={vars({ '--dgm-delay': `${delay}ms` })}
                  >
                    <rect
                      x={card.x}
                      y={card.y}
                      width={card.w}
                      height={card.h}
                      fill={C.sheet}
                      stroke={C.ink12}
                      strokeWidth={STROKE.thin}
                    />
                    <Label
                      x={card.x + card.w / 2}
                      y={card.y + card.h / 2 + 4}
                      role="name"
                      fill={C.ink}
                      anchor="middle"
                    >
                      {card.face}
                    </Label>
                  </g>
                )
              })}

              {/* Per-set count — the 6 in "9 sets of 6", printed nine times. */}
              <line
                className="dgm-draw"
                style={vars({ '--dgm-len': `${set.w}`, '--dgm-delay': `${colDelay + 400}ms` })}
                x1={set.x}
                y1={countY}
                x2={set.x + set.w}
                y2={countY}
                stroke={set.accent ? C.accent : C.rule}
                strokeWidth={STROKE.default}
              />
              <Label
                className="dgm-fade"
                x={set.x + set.w / 2}
                y={countLabelY}
                role="tech"
                fill={set.accent ? C.accentText : C.soft}
                anchor="middle"
                style={vars({ '--dgm-delay': `${colDelay + 440}ms` })}
              >
                6
              </Label>
            </g>
          )
        })}

        <LegendStrip scene={scene} />
      </DiagramSvg>
    </DiagramFrame>
  )
}
