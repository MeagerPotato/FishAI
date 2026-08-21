/**
 * DIAGRAM 2 — Counter-graph (who beats whom, and where it goes round).
 *
 * diagram-design's **dependency graph** — the one type built for multi-parent
 * fan-in and for cycles. Edge `i -> j` means i beats j significantly.
 *
 * Budget: 9 nodes (the roster is exactly 9, by design), 12 arrows, 4 ranks,
 * 1 highlighted cycle, 2 accent elements.
 *
 * TWO RENDER PATHS, both exercised by the committed fixture:
 *
 *   verdict === 'cyclic'    the accent goes on the back-edge and its CYCLE
 *                           label, exactly as the source type prescribes.
 *                           This is the headline diagram of the whole site.
 *   verdict !== 'cyclic'    there is no back-edge to accent. The accent moves
 *                           to the dominant node and its DOMINANT tag — the
 *                           editorial point is still what the accent marks,
 *                           it is just a different point.
 *
 * The fan-in badge is mandatory: `3 IN` reads as "three styles counter this
 * one", which is the whole reason this type beats a tree here.
 */

import { fanAttach, snapPhase, type Pt } from '../geometry'
import { withLabelMask, type Scene, type SceneArrow, type SceneRect } from '../scene'
import { C } from '../tokens'
import { cellIndex, scoreOf, type StyleResults } from '../types'

const NODE_W = 160
const NODE_H = 56
const RANK_STRIDE = 120
const RANK_Y0 = 96
const VIEW_W = 1000
const COL_GAP = 40
const MAX_EDGES = 12

/**
 * Family -> type-tag code. Truncating the words ("CONSE", "OPTIO") reads as a
 * rendering bug rather than as an abbreviation, so the codes are explicit.
 */
const FAMILY_CODE: Record<string, string> = {
  control: 'CTRL',
  aggressive: 'AGGR',
  conservative: 'CONS',
  passive: 'PASV',
  information: 'INFO',
  optionality: 'OPTN',
}

export interface CounterNode {
  id: string
  label: string
  family: string
  x: number
  y: number
  w: number
  h: number
  rank: number
  /** Incoming significant edges — how many styles counter this one. */
  fanIn: number
  fanOut: number
  focal: boolean
}

export interface CounterEdge {
  from: string
  to: string
  score: number
  cyclic: boolean
}

export interface CounterModel {
  scene: Scene
  nodes: CounterNode[]
  arrows: SceneArrow[]
  /** The one highlighted cycle, if the verdict is cyclic. */
  cycle: string[]
  verdict: StyleResults['ranking']['verdict']
  /** Edges the budget or the router forced out, reported in the caption. */
  dropped: number
  droppedForBudget: number
  droppedForRouting: number
  totalSignificant: number
}

export interface CounterInput {
  results: StyleResults
  figNo?: string
}

export function layoutCounterGraph({
  results,
  figNo = 'FIG. 08',
}: CounterInput): CounterModel {
  const byId = new Map(results.styles.map((s) => [s.id, s]))
  const index = cellIndex(results.matrix)
  const ids = results.styles.map((s) => s.id)

  if (ids.length > 9) {
    throw new Error(`counter-graph: ${ids.length} styles exceeds the 9-node budget`)
  }

  /* -- 1. every significant directed edge -------------------------------- */
  const all: CounterEdge[] = []
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue
      const found = scoreOf(index, a, b)
      if (!found || !found.cell.significant) continue
      if (found.score <= 0.5) continue
      all.push({ from: a, to: b, score: found.score, cyclic: false })
    }
  }
  const totalSignificant = all.length

  /* -- 2. the one highlighted cycle -------------------------------------- */
  const cycle =
    results.ranking.verdict === 'cyclic' && results.ranking.cycles.length > 0
      ? results.ranking.cycles[0].styles
      : []
  const cycleEdges = new Set<string>()
  for (let i = 0; i < cycle.length; i++) {
    cycleEdges.add(`${cycle[i]}>${cycle[(i + 1) % cycle.length]}`)
  }

  /* -- 3. ranks: by net significant record ------------------------------- */
  const net = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const e of all) {
    net.set(e.from, (net.get(e.from) ?? 0) + 1)
    net.set(e.to, (net.get(e.to) ?? 0) - 1)
  }
  const ordered = [...ids].sort((p, q) => (net.get(q) ?? 0) - (net.get(p) ?? 0))
  const rankOf = new Map<string, number>()
  // Four rank rows: 2 / 3 / 3 / 1 for a 9-style roster.
  const shape = [2, 3, 3, 1]
  let cursor = 0
  shape.forEach((count, rank) => {
    for (let i = 0; i < count && cursor < ordered.length; i++, cursor++) {
      rankOf.set(ordered[cursor], rank)
    }
  })
  for (const id of ordered) if (!rankOf.has(id)) rankOf.set(id, shape.length - 1)

  /* -- 4. keep only edges the layout can route without diagonals ---------- */
  // Forward = one rank down. Same-rank = horizontal neighbours. Everything
  // else is dropped, plus the single back-edge for the cycle.
  const inRank: string[][] = shape.map(() => [])
  for (const id of ordered) inRank[rankOf.get(id) ?? 0].push(id)

  const posInRank = new Map<string, number>()
  inRank.forEach((row) => row.forEach((id, i) => posInRank.set(id, i)))

  const routable = all.filter((e) => {
    const rf = rankOf.get(e.from) ?? 0
    const rt = rankOf.get(e.to) ?? 0
    if (rt === rf + 1) return true
    const pf = posInRank.get(e.from) ?? 0
    const pt = posInRank.get(e.to) ?? 0
    // Same-rank edges run horizontally, left to right, between neighbours only.
    return rt === rf && pt - pf === 1
  })

  const backEdge = cycle.length
    ? all.find(
        (e) => cycleEdges.has(`${e.from}>${e.to}`) && (rankOf.get(e.to) ?? 0) < (rankOf.get(e.from) ?? 0),
      )
    : undefined

  const forward = routable
    .filter((e) => !(backEdge && e.from === backEdge.from && e.to === backEdge.to))
    .sort((p, q) => q.score - p.score)
    .slice(0, MAX_EDGES - (backEdge ? 1 : 0))

  const edges: CounterEdge[] = [
    ...forward.map((e) => ({ ...e, cyclic: cycleEdges.has(`${e.from}>${e.to}`) })),
    ...(backEdge ? [{ ...backEdge, cyclic: true }] : []),
  ]
  const droppedForBudget = totalSignificant - edges.length

  /* -- 5. geometry -------------------------------------------------------- */
  const nodes: CounterNode[] = []
  const dominantId = results.ranking.meanScore[0]?.style
  const useDominantAccent = results.ranking.verdict !== 'cyclic'

  inRank.forEach((row, rank) => {
    const total = row.length * NODE_W + (row.length - 1) * COL_GAP
    const x0 = Math.round((VIEW_W - total) / 2 / 4) * 4
    row.forEach((id, i) => {
      nodes.push({
        id,
        label: byId.get(id)?.label ?? id,
        family: FAMILY_CODE[byId.get(id)?.family ?? ''] ?? 'STYLE',
        x: x0 + i * (NODE_W + COL_GAP),
        y: RANK_Y0 + rank * RANK_STRIDE,
        w: NODE_W,
        h: NODE_H,
        rank,
        fanIn: all.filter((e) => e.to === id).length,
        fanOut: all.filter((e) => e.from === id).length,
        focal: useDominantAccent && id === dominantId,
      })
    })
  })

  const node = new Map(nodes.map((n) => [n.id, n]))

  /* -- 6. connectors: rounded right-angle elbows only --------------------- */
  // Group by (source bottom edge) and (target top edge) to fan attach points.
  const outOf = new Map<string, CounterEdge[]>()
  const intoOf = new Map<string, CounterEdge[]>()
  for (const e of edges) {
    if (backEdge && e.from === backEdge.from && e.to === backEdge.to) continue
    const rf = rankOf.get(e.from) ?? 0
    const rt = rankOf.get(e.to) ?? 0
    if (rt === rf) continue // same-rank horizontals attach to side edges
    outOf.set(e.from, [...(outOf.get(e.from) ?? []), e])
    intoOf.set(e.to, [...(intoOf.get(e.to) ?? []), e])
  }

  const outSlot = new Map<string, number[]>()
  for (const [id, list] of outOf) {
    const n = node.get(id)
    // Exit columns take phase 0, entry columns phase 4, so an exit stub can
    // never share an x with an entry stub (see snapPhase).
    if (n) outSlot.set(id, fanAttach(n.x, n.w, list.length, 12, 0))
  }
  const inSlot = new Map<string, number[]>()
  for (const [id, list] of intoOf) {
    const n = node.get(id)
    if (n) inSlot.set(id, fanAttach(n.x, n.w, list.length, 12, 4))
  }

  /* -- track assignment: interval colouring, not one track per source ------
     Every cross-rank edge runs its horizontal leg through the 64px band
     between two ranks. Giving each SOURCE a track is not enough — a node
     with two out-edges puts both of its legs on the same y, starting from
     nearly the same x, and they share a stroke path for their whole
     overlap. So the horizontals are coloured as intervals: an edge takes the
     lowest track whose already-assigned spans it does not overlap.

     Four tracks at 16 / 28 / 40 / 52 keep parallel runs 12px apart (the
     mandated minimum) with 16px of clearance below the source and 12px above
     the target — enough for an r=8 arc at the top and r=6 at the bottom. An
     edge that cannot be coloured is dropped and counted, never stacked. */
  const TRACKS = [16, 28, 40, 52]
  const spanOf = (e: CounterEdge): { lo: number; hi: number } | undefined => {
    const a = node.get(e.from)
    const b = node.get(e.to)
    if (!a || !b) return undefined
    const outIdx = (outOf.get(e.from) ?? []).indexOf(e)
    const inIdx = (intoOf.get(e.to) ?? []).indexOf(e)
    const sx = (outSlot.get(e.from) ?? [a.x + a.w / 2])[outIdx] ?? a.x + a.w / 2
    const tx = (inSlot.get(e.to) ?? [b.x + b.w / 2])[inIdx] ?? b.x + b.w / 2
    return { lo: Math.min(sx, tx), hi: Math.max(sx, tx) }
  }

  const trackOf = new Map<CounterEdge, number>()
  const uncolourable = new Set<CounterEdge>()
  // Colour one rank transition at a time; bands never interact across ranks.
  for (let rank = 0; rank < shape.length; rank++) {
    const band = edges.filter(
      (e) =>
        !(backEdge && e.from === backEdge.from && e.to === backEdge.to) &&
        (rankOf.get(e.from) ?? 0) === rank &&
        (rankOf.get(e.to) ?? 0) === rank + 1,
    )
    const taken: Array<Array<{ lo: number; hi: number }>> = TRACKS.map(() => [])
    // Widest first: the long spans are the ones that constrain everything.
    const bySpan = [...band].sort((p, q) => {
      const sp = spanOf(p)
      const sq = spanOf(q)
      return (sq ? sq.hi - sq.lo : 0) - (sp ? sp.hi - sp.lo : 0)
    })
    for (const e of bySpan) {
      const span = spanOf(e)
      if (!span) continue
      // A zero-width span is a straight vertical drop; it needs no track.
      if (span.hi === span.lo) continue
      const t = taken.findIndex((used) =>
        used.every((u) => span.hi <= u.lo || span.lo >= u.hi),
      )
      if (t === -1) {
        uncolourable.add(e)
        continue
      }
      taken[t].push(span)
      trackOf.set(e, TRACKS[t])
    }
  }

  const drawn = edges.filter((e) => !uncolourable.has(e))
  const droppedForRouting = uncolourable.size
  const dropped = droppedForBudget + droppedForRouting

  const arrows: SceneArrow[] = []

  for (const e of drawn) {
    const a = node.get(e.from)
    const b = node.get(e.to)
    if (!a || !b) continue
    const isBack = backEdge !== undefined && e.from === backEdge.from && e.to === backEdge.to

    if (isBack) {
      // The cycle, routed around the OUTSIDE of the node stack.
      //
      // Leaving the source's RIGHT edge at its own centre line would run the
      // stroke straight through whichever sibling sits to its right in the
      // same rank row — connector rule 5. So it exits the BOTTOM into a
      // dedicated band 56px down (clear of the 16/32/48 forward tracks and
      // 8px above the next rank), crosses in the right gutter, and comes
      // back along a band 32px ABOVE the target's rank, which is node-free by
      // construction, before dropping into the target's top edge.
      const gutter = VIEW_W - 24
      const exitX = snapPhase(a.x + a.w - 16, 0)
      const entryX = snapPhase(b.x + b.w - 16, 4)
      const exitY = a.y + a.h + 56
      const entryY = b.y - 32
      const pts: Pt[] = [
        { x: exitX, y: a.y + a.h },
        { x: exitX, y: exitY },
        { x: gutter, y: exitY },
        { x: gutter, y: entryY },
        { x: entryX, y: entryY },
        { x: entryX, y: b.y },
      ]
      arrows.push(
        withLabelMask({
          id: `cycle-${e.from}-${e.to}`,
          points: pts,
          label: 'CYCLE',
          labelGap: 8,
          labelSide: 'left',
          labelMid: { x: gutter, y: Math.round((exitY + entryY) / 2 / 4) * 4 },
          accent: true,
          dashed: true,
        }),
      )
      continue
    }

    const rf = rankOf.get(e.from) ?? 0
    const rt = rankOf.get(e.to) ?? 0

    if (rt === rf) {
      // Same rank, adjacent: endpoints share y, so a straight run is legal.
      arrows.push({
        id: `edge-${e.from}-${e.to}`,
        points: [
          { x: a.x + a.w, y: a.y + a.h / 2 },
          { x: b.x, y: b.y + b.h / 2 },
        ],
      })
      continue
    }

    const outIdx = (outOf.get(e.from) ?? []).indexOf(e)
    const inIdx = (intoOf.get(e.to) ?? []).indexOf(e)
    const sx = (outSlot.get(e.from) ?? [a.x + a.w / 2])[outIdx] ?? a.x + a.w / 2
    const tx = (inSlot.get(e.to) ?? [b.x + b.w / 2])[inIdx] ?? b.x + b.w / 2

    const midY = a.y + a.h + (trackOf.get(e) ?? TRACKS[0])

    const pts: Pt[] =
      sx === tx
        ? [
            { x: sx, y: a.y + a.h },
            { x: tx, y: b.y },
          ]
        : [
            { x: sx, y: a.y + a.h },
            { x: sx, y: midY },
            { x: tx, y: midY },
            { x: tx, y: b.y },
          ]

    arrows.push({ id: `edge-${e.from}-${e.to}`, points: pts })
  }

  const rects: SceneRect[] = nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    w: n.w,
    h: n.h,
    node: true,
  }))

  // The legend clears everything drawn, arrows included — the cycle's exit
  // band sits below the last rank when the back-edge starts there.
  const bottom = Math.max(
    ...nodes.map((n) => n.y + n.h),
    ...arrows.flatMap((a) => a.points.map((p) => p.y)),
  )
  const legendY = Math.ceil((bottom + 24) / 4) * 4
  const viewH = legendY + 48

  // Cyclic: the back-edge and its CYCLE label. Dominant: the one focal node.
  const accents = backEdge ? 2 : useDominantAccent && dominantId ? 1 : 0

  const cycleWords = cycle.map((id) => byId.get(id)?.label ?? id).join(' > ')

  const scene: Scene = {
    slug: 'counter-graph',
    title:
      results.ranking.verdict === 'cyclic'
        ? 'Counter-graph: which play styles beat which, with the highlighted cycle'
        : 'Counter-graph: which play styles beat which, with the dominant style highlighted',
    desc:
      `Nine play styles in four rank rows, ordered by net significant record. An arrow from one ` +
      `style to another means the first beats the second at q below 0.05. Each node carries a ` +
      `fan-in badge counting how many styles counter it. ` +
      (backEdge
        ? `One back-edge, drawn in amber around the right-hand gutter, closes the cycle ${cycleWords}.`
        : `No back-edge exists: the order is transitive, and the amber node is the dominant style.`),
    viewW: VIEW_W,
    viewH,
    budget: { nodes: nodes.length, arrows: arrows.length, accents },
    rects,
    arrows,
    legendY,
    legend: [
      { key: 'beats', label: 'A BEATS B', mark: 'line', stroke: C.muted },
      ...(backEdge
        ? ([{ key: 'cycle', label: 'CYCLE EDGE', mark: 'line', stroke: C.accent, dashed: true }] as const)
        : ([{ key: 'dominant', label: 'DOMINANT', mark: 'swatch', fill: C.accentTint, stroke: C.accent }] as const)),
      { key: 'fanin', label: 'N IN = COUNTERED BY N', mark: 'swatch', fill: C.ink08, stroke: C.ink12 },
    ],
    fontSizes: [8, 12],
    fig: `${figNo} — COUNTER-GRAPH · VERDICT ${results.ranking.verdict.toUpperCase()} · CYCLIC ENERGY ${results.ranking.cyclicEnergy.toFixed(3)}`,
    caption:
      `Directed edge i to j where i beats j significantly after Benjamini-Hochberg correction. ` +
      `Ranks are net significant record, descending. ${edges.length} of ${totalSignificant} ` +
      `significant edges drawn` +
      (dropped > 0
        ? `; ${dropped} were dropped — ${droppedForBudget} to stay inside the 12-arrow budget and ${droppedForRouting} that could not be routed without stacking one stroke on another. The highest-margin edges were kept, and the full edge list is on /lab/matrix. `
        : `. `) +
      (backEdge
        ? `Exactly one cycle is highlighted (${cycleWords}); ${Math.max(0, results.ranking.cycles.length - 1)} further cycle(s) exist and render as ordinary forward edges. `
        : `No cycle: every significant edge points down-rank. `) +
      `Rule set us54 (rulesHash ${results.meta.rulesHash}).`,
  }

  return {
    scene,
    nodes,
    arrows,
    cycle,
    verdict: results.ranking.verdict,
    dropped,
    droppedForBudget,
    droppedForRouting,
    totalSignificant,
  }
}
