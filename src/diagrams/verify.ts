/**
 * The geometry gate.
 *
 * A port of the source system's `scripts/verify-geometry.py` +
 * `scripts/self_check.py` to typed data. `diagrams.test.ts` runs it over
 * every diagram built from the committed fixture — both verdict cases — so
 * hand-authored geometry cannot rot silently.
 *
 * Returns a list of human-readable violations. Empty list = pass.
 */

import { isAxisAligned, onGrid } from './geometry'
import { BUDGET, type Scene } from './scene'
import { FONT_SIZES } from './tokens'

export function verifyScene(scene: Scene): string[] {
  const bad: string[] = []
  const at = (what: string) => `[${scene.slug}] ${what}`

  /* -- accessible SVG contract ------------------------------------------ */
  if (!scene.slug || !/^[a-z][a-z0-9-]*$/.test(scene.slug)) {
    bad.push(at(`slug "${scene.slug}" must be lowercase-kebab and non-empty`))
  }
  if (!scene.title.trim()) bad.push(at('<title> is empty'))
  if (!scene.desc.trim()) bad.push(at('<desc> is empty'))
  if (!scene.fig.trim()) bad.push(at('figure slug is empty'))
  if (!scene.caption.trim()) bad.push(at('caption is empty'))

  /* -- 4px grid ---------------------------------------------------------- */
  if (!onGrid(scene.viewW)) bad.push(at(`viewBox width ${scene.viewW} is off the 4px grid`))
  if (!onGrid(scene.viewH)) bad.push(at(`viewBox height ${scene.viewH} is off the 4px grid`))

  for (const r of scene.rects) {
    if (r.dataScaled) continue
    for (const [k, v] of [
      ['x', r.x],
      ['y', r.y],
      ['w', r.w],
      ['h', r.h],
    ] as const) {
      if (!onGrid(v)) bad.push(at(`rect "${r.id}" ${k}=${v} is off the 4px grid`))
    }
  }

  for (const size of scene.fontSizes) {
    if (!(FONT_SIZES as readonly number[]).includes(size)) {
      bad.push(at(`font-size ${size} is not one of ${FONT_SIZES.join('/')}`))
    }
  }

  /* -- connectors -------------------------------------------------------- */
  for (const a of scene.arrows) {
    if (a.points.length < 2) {
      bad.push(at(`arrow "${a.id}" has fewer than 2 waypoints`))
      continue
    }
    for (let i = 1; i < a.points.length; i++) {
      const p = a.points[i - 1]
      const q = a.points[i]
      if (!isAxisAligned(p, q)) {
        bad.push(
          at(`arrow "${a.id}" segment (${p.x},${p.y})->(${q.x},${q.y}) is DIAGONAL — automatic fail`),
        )
      }
    }
    for (const p of a.points) {
      if (!onGrid(p.x) || !onGrid(p.y)) {
        bad.push(at(`arrow "${a.id}" waypoint (${p.x},${p.y}) is off the 4px grid`))
      }
    }

    if (a.label !== undefined) {
      if (a.label.length > BUDGET.arrowLabelChars) {
        bad.push(at(`arrow label "${a.label}" is ${a.label.length} chars (max ${BUDGET.arrowLabelChars})`))
      }
      if (a.label !== a.label.toUpperCase()) {
        bad.push(at(`arrow label "${a.label}" must be all-caps`))
      }
      const gap = a.labelGap ?? 0
      if (gap < BUDGET.labelGapMin || gap > BUDGET.labelGapMax) {
        bad.push(
          at(`arrow "${a.id}" label gap ${gap}px outside ${BUDGET.labelGapMin}-${BUDGET.labelGapMax}px`),
        )
      }
    }
  }

  /* -- label mask must not be clipped by a node painted after it --------- */
  const nodes = scene.rects.filter((r) => r.node)
  for (const a of scene.arrows) {
    const m = a.labelMask
    if (!m) {
      if (a.label !== undefined) bad.push(at(`arrow "${a.id}" has a label but no resolved mask`))
      continue
    }
    for (const n of nodes) {
      const overlaps =
        m.x < n.x + n.w && m.x + m.w > n.x && m.y < n.y + n.h && m.y + m.h > n.y
      if (!overlaps) continue
      const contained = m.x >= n.x && m.y >= n.y && m.x + m.w <= n.x + n.w && m.y + m.h <= n.y + n.h
      // Fully inside a node is a badge chip and is legal; partly inside is the defect.
      if (!contained) {
        bad.push(at(`arrow "${a.id}" label mask is clipped by node "${n.id}"`))
      }
    }
  }

  /* -- transit past a non-endpoint box must be dashed -------------------- */
  for (const a of scene.arrows) {
    if (a.transit && !a.dashed) {
      bad.push(at(`arrow "${a.id}" transits a non-endpoint box but is not dashed`))
    }
  }

  /* -- connector rule 5: no connector passes behind a non-endpoint box ---- */
  for (const a of scene.arrows) {
    const first = a.points[0]
    const last = a.points[a.points.length - 1]
    if (!first || !last) continue

    for (const n of nodes) {
      const touches = (p: { x: number; y: number }) =>
        p.x >= n.x - 2 && p.x <= n.x + n.w + 2 && p.y >= n.y - 2 && p.y <= n.y + n.h + 2
      // An endpoint on this box means the box IS an endpoint; skip it.
      if (touches(first) || touches(last)) continue

      let crosses = false
      for (let i = 1; i < a.points.length && !crosses; i++) {
        const p = a.points[i - 1]
        const q = a.points[i]
        const lo = { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y) }
        const hi = { x: Math.max(p.x, q.x), y: Math.max(p.y, q.y) }
        // Axis-aligned segment vs. rect interior.
        crosses = lo.x < n.x + n.w && hi.x > n.x && lo.y < n.y + n.h && hi.y > n.y
      }
      if (!crosses) continue

      // The one legitimate exception is an unavoidable intervening box, and
      // it has to be dashed to read as transit rather than interaction.
      if (a.transit && a.dashed) continue
      bad.push(at(`arrow "${a.id}" passes behind non-endpoint node "${n.id}"`))
    }
  }

  /* -- connector rule 3: no two connectors share a stroke path ----------- */
  // Crossings are fine — two orthogonal strokes meeting at a point stay
  // independently traceable. What is not fine is COLLINEAR overlap: a shared
  // run of stroke where the reader cannot tell the two lines apart.
  const OVERLAP_TOL = 8
  const segsOf = (a: (typeof scene.arrows)[number]) =>
    a.points.slice(1).map((q, i) => ({ p: a.points[i], q }))

  for (let i = 0; i < scene.arrows.length; i++) {
    for (let j = i + 1; j < scene.arrows.length; j++) {
      const A = scene.arrows[i]
      const B = scene.arrows[j]
      let worst = 0
      for (const s of segsOf(A)) {
        for (const t of segsOf(B)) {
          const sHoriz = s.p.y === s.q.y
          const tHoriz = t.p.y === t.q.y
          if (sHoriz !== tHoriz) continue
          if (sHoriz) {
            if (s.p.y !== t.p.y) continue
            const lo = Math.max(Math.min(s.p.x, s.q.x), Math.min(t.p.x, t.q.x))
            const hi = Math.min(Math.max(s.p.x, s.q.x), Math.max(t.p.x, t.q.x))
            worst = Math.max(worst, hi - lo)
          } else {
            if (s.p.x !== t.p.x) continue
            const lo = Math.max(Math.min(s.p.y, s.q.y), Math.min(t.p.y, t.q.y))
            const hi = Math.min(Math.max(s.p.y, s.q.y), Math.max(t.p.y, t.q.y))
            worst = Math.max(worst, hi - lo)
          }
        }
      }
      if (worst > OVERLAP_TOL) {
        bad.push(at(`connectors "${A.id}" and "${B.id}" share ${worst}px of stroke path`))
      }
    }
  }

  /* -- no two connectors sharing a point on a box ------------------------ */
  const endpoints = new Map<string, string[]>()
  for (const a of scene.arrows) {
    for (const p of [a.points[0], a.points[a.points.length - 1]]) {
      if (!p) continue
      const key = `${p.x},${p.y}`
      const seen = endpoints.get(key) ?? []
      seen.push(a.id)
      endpoints.set(key, seen)
    }
  }
  for (const [key, ids] of endpoints) {
    if (ids.length > 1) {
      bad.push(at(`connectors ${ids.join(' + ')} share the attach point (${key}) — fan them apart`))
    }
  }

  /* -- complexity budget ------------------------------------------------- */
  if (scene.budget.nodes > BUDGET.nodes) {
    bad.push(at(`${scene.budget.nodes} nodes exceeds the budget of ${BUDGET.nodes}`))
  }
  if (scene.budget.arrows > BUDGET.arrows) {
    bad.push(at(`${scene.budget.arrows} arrows exceeds the budget of ${BUDGET.arrows}`))
  }
  if (scene.budget.accents > BUDGET.accents) {
    bad.push(at(`${scene.budget.accents} accent elements exceeds the budget of ${BUDGET.accents}`))
  }
  if (scene.budget.arrows !== scene.arrows.length) {
    bad.push(
      at(`declared arrow budget ${scene.budget.arrows} != ${scene.arrows.length} drawn connectors`),
    )
  }

  /* -- legend is a bottom strip, never floating -------------------------- */
  if (scene.legend.length === 0) bad.push(at('legend is empty'))
  if (!onGrid(scene.legendY)) bad.push(at(`legendY ${scene.legendY} is off the 4px grid`))
  if (scene.legendY >= scene.viewH) {
    bad.push(at(`legendY ${scene.legendY} is below the viewBox (${scene.viewH})`))
  }
  if (scene.viewH - scene.legendY < 32) {
    bad.push(at('viewBox is not expanded enough for the legend strip'))
  }
  for (const r of scene.rects) {
    if (r.dataScaled) continue
    if (r.y + r.h > scene.legendY) {
      bad.push(at(`rect "${r.id}" (bottom ${r.y + r.h}) intrudes on the legend strip`))
    }
  }
  for (const a of scene.arrows) {
    for (const p of a.points) {
      if (p.y > scene.legendY) {
        bad.push(at(`arrow "${a.id}" waypoint y=${p.y} intrudes on the legend strip`))
      }
    }
  }

  return bad
}

/** Throwing wrapper, for use at a call site that must not proceed on failure. */
export function assertScene(scene: Scene): Scene {
  const bad = verifyScene(scene)
  if (bad.length > 0) throw new Error(`diagram geometry check failed:\n  ${bad.join('\n  ')}`)
  return scene
}
