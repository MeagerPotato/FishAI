/**
 * The shared SVG shell.
 *
 * Carries the accessible-SVG contract for every diagram:
 *   - role="img" + aria-labelledby resolving to <title> and <desc>
 *   - <title> as the LITERAL FIRST CHILD, before <defs>
 *   - slug-prefixed ids, so two inlined diagrams never collide
 *
 * and the horizontal-scroll contract: a diagram wider than the viewport
 * scrolls inside `.dgm-frame`, never the page body.
 */

import { createContext, useContext, useId } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { C, T } from './tokens'
import type { Scene } from './scene'

export type Role = 'title' | 'name' | 'tech' | 'eyebrow' | 'arrow'

export interface LabelProps {
  x: number
  y: number
  role: Role
  fill: string
  anchor?: 'start' | 'middle' | 'end'
  opacity?: number
  weight?: number
  uppercase?: boolean
  /** For the self-drawing reveal classes in skin.css. */
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/**
 * Text in one of the five type roles. One family throughout — the
 * serif/sans/mono distinction of the source system is carried by weight and
 * letter-spacing (see skin.css).
 */
export function Label({
  x,
  y,
  role,
  fill,
  anchor = 'start',
  opacity,
  weight,
  uppercase,
  className,
  style,
  children,
}: LabelProps) {
  const spec = T[role]
  return (
    <text
      x={x}
      y={y}
      fill={fill}
      fillOpacity={opacity}
      fontFamily={T.family}
      fontSize={spec.fontSize}
      fontWeight={weight ?? spec.fontWeight}
      letterSpacing={spec.letterSpacing}
      textAnchor={anchor}
      className={className}
      style={{
        fontVariantNumeric: role === 'tech' ? 'tabular-nums' : undefined,
        textTransform: uppercase ? 'uppercase' : undefined,
        ...style,
      }}
    >
      {children}
    </text>
  )
}

/** The three arrow markers. Defined always, slug-prefixed always. */
export function Markers({ slug }: { slug: string }) {
  return (
    <>
      <marker
        id={`${slug}-arrow`}
        markerWidth="8"
        markerHeight="6"
        refX="7"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 8 3, 0 6" fill={C.muted} />
      </marker>
      <marker
        id={`${slug}-arrow-accent`}
        markerWidth="8"
        markerHeight="6"
        refX="7"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 8 3, 0 6" fill={C.accent} stroke={C.ink} strokeWidth="0.5" />
      </marker>
      <marker
        id={`${slug}-arrow-soft`}
        markerWidth="8"
        markerHeight="6"
        refX="7"
        refY="3"
        orient="auto"
      >
        <polygon points="0 0, 8 3, 0 6" fill={C.soft} />
      </marker>
    </>
  )
}

export interface DiagramSvgProps {
  scene: Scene
  /** Extra <defs> content — patterns, clip paths. Markers are automatic. */
  defs?: ReactNode
  children: ReactNode
}

/**
 * The resolved id prefix for the diagram currently being rendered.
 *
 * The slug alone is not enough: it makes ids unique per diagram TYPE, so two
 * payoff matrices on one page (the fixture switch does exactly that) would
 * both mint `payoff-matrix-title` and every `aria-labelledby` and
 * `marker-end` would resolve to the first one. `useId` makes the prefix
 * unique per INSTANCE, which is what the contract actually asks for.
 */
const DiagramIdContext = createContext('dgm')

export const useDiagramId = () => useContext(DiagramIdContext)

/**
 * The SVG root. Child order here IS the z-order contract:
 * background -> zones -> arrows -> nodes -> labels.
 */
export function DiagramSvg({ scene, defs, children }: DiagramSvgProps) {
  // React 19's useId yields `«r0»`; strip to an id-safe token.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const prefix = `${scene.slug}-${uid || '0'}`
  const titleId = `${prefix}-title`
  const descId = `${prefix}-desc`
  return (
    <DiagramIdContext.Provider value={prefix}>
      <svg
        viewBox={`0 0 ${scene.viewW} ${scene.viewH}`}
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ minWidth: `${scene.viewW}px` }}
      >
        {/* <title> must be the literal first child, before <defs>. */}
        <title id={titleId}>{scene.title}</title>
        <desc id={descId}>{scene.desc}</desc>
        <defs>
          <Markers slug={prefix} />
          {defs}
        </defs>
        {/* Layer 0 — background. */}
        <rect x={0} y={0} width={scene.viewW} height={scene.viewH} fill={C.paper} />
        {children}
      </svg>
    </DiagramIdContext.Provider>
  )
}

/** The legend: a horizontal strip at the bottom. Never floating. */
export function LegendStrip({ scene }: { scene: Scene }) {
  const stride = Math.max(
    128,
    Math.floor((scene.viewW - 80) / Math.max(1, scene.legend.length) / 4) * 4,
  )
  const baseline = scene.legendY + 28
  return (
    <g>
      <line
        x1={24}
        y1={scene.legendY}
        x2={scene.viewW - 24}
        y2={scene.legendY}
        stroke={C.rule}
        strokeWidth={0.8}
      />
      <Label x={24} y={baseline} role="eyebrow" fill={C.soft}>
        LEGEND
      </Label>
      {scene.legend.map((item, i) => {
        const x = 96 + i * stride
        return (
          <g key={item.key}>
            {item.mark === 'swatch' && (
              <rect
                x={x}
                y={baseline - 10}
                width={16}
                height={12}
                fill={item.fill ?? C.ink05}
                stroke={item.stroke ?? C.ink12}
                strokeWidth={0.8}
                strokeDasharray={item.dashed ? '4,3' : undefined}
              />
            )}
            {item.mark === 'dot' && (
              <circle
                cx={x + 8}
                cy={baseline - 4}
                r={6}
                fill={item.hollow ? C.paper : (item.fill ?? C.accent)}
                stroke={item.stroke ?? C.muted}
                strokeWidth={item.hollow ? 1.5 : 1}
              />
            )}
            {item.mark === 'line' && (
              <line
                x1={x}
                y1={baseline - 4}
                x2={x + 20}
                y2={baseline - 4}
                stroke={item.stroke ?? C.muted}
                strokeWidth={1.6}
                strokeDasharray={item.dashPattern ?? (item.dashed ? '5,4' : undefined)}
              />
            )}
            <Label x={x + 24} y={baseline} role="tech" fill={C.muted}>
              {item.label}
            </Label>
          </g>
        )
      })}
    </g>
  )
}

export interface DiagramFrameProps {
  scene: Scene
  children: ReactNode
}

/**
 * figure > fig-slug + scrolling frame + caption.
 *
 * The frame is the only element allowed to scroll horizontally; the page
 * body never does, at 375px or any other width.
 */
export function DiagramFrame({ scene, children }: DiagramFrameProps) {
  return (
    <figure className="dgm-figure">
      <span className="dgm-fig-slug">{scene.fig}</span>
      <div className="dgm-frame">{children}</div>
      <figcaption className="dgm-figcaption">{scene.caption}</figcaption>
    </figure>
  )
}
