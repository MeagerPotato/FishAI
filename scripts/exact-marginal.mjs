// v0.15 / M3 instrument: the EXACT marginal of the uniform distribution over every assignment of
// the unknown cards to seats that the model allows — each card at one of its candidate seats, each
// seat holding exactly its unknownSlots, and every surviving "at least one of A at t" constraint
// honoured. This is the object marginal.ts approximates by Sinkhorn plus one-shot conditioning.
//
// Forward-backward DP over the cards in table order. State = (remaining slots per seat, bitmask of
// constraints already satisfied). Counts are doubles (ratios are all that is read). Returns null
// when the constraint count exceeds `maxConstraints` or the state count exceeds `maxStates`, so a
// caller can fall back and count how often it did.
export function exactMarginal(k, tbl, opts = {}) {
  const maxC = opts.maxConstraints ?? 10
  const maxStates = opts.maxStates ?? 4_000_000
  const cards = tbl.cards
  const n = cards.length
  const need = [0, 1, 2, 3, 4, 5].map((s) => Math.max(0, k.unknownSlots[s] ?? 0))
  // constraints over row indices, deduplicated exactly as marginal.ts's minimalConstraints does
  // (exact duplicates collapsed; a constraint implied by a tighter one at the same seat dropped —
  // implied constraints are redundant for the exact count, so dropping them changes nothing)
  const seen = new Set()
  const all = []
  for (const kc of k.constraints) {
    const rows = []
    for (const c of kc.cards) { const i = tbl.index.get(c); if (i !== undefined && (k.cands[c] ?? []).includes(kc.seat)) rows.push(i) }
    if (rows.length === 0) continue
    rows.sort((a, b) => a - b)
    const key = `${kc.seat}:${rows.join(',')}`
    if (seen.has(key)) continue
    seen.add(key)
    all.push({ seat: kc.seat, rows })
  }
  const cons = []
  for (const a of all) {
    let implied = false
    for (const b of all) { if (b === a || b.seat !== a.seat || b.rows.length >= a.rows.length) continue; if (b.rows.every((r) => a.rows.includes(r))) { implied = true; break } }
    if (!implied) cons.push(a)
  }
  const m = cons.length
  if (m > maxC) return null
  const full = (1 << m) - 1
  // per card: for each seat, the constraint bits it sets
  const bitsAt = Array.from({ length: n }, () => new Int32Array(6))
  cons.forEach((c, j) => { for (const r of c.rows) bitsAt[r][c.seat] |= 1 << j })
  const candBits = new Int32Array(n)
  for (let i = 0; i < n; i++) for (const s of k.cands[cards[i]] ?? []) if (need[s] > 0) candBits[i] |= 1 << s
  // mixed-radix encoding of the slot tuple
  const radix = need.map((x) => x + 1)
  const stride = [1, 0, 0, 0, 0, 0]
  for (let s = 1; s < 6; s++) stride[s] = stride[s - 1] * radix[s - 1]
  const tupleCount = stride[5] * radix[5]
  const enc = (r) => { let x = 0; for (let s = 0; s < 6; s++) x += r[s] * stride[s]; return x }
  const key = (t, mask) => t * (full + 1) + mask
  const decodeT = (kk) => Math.floor(kk / (full + 1))
  const decodeM = (kk) => kk % (full + 1)
  const r0 = enc(need)
  // forward: layers[i] = Map(stateKey -> count of ways to place cards 0..i-1 and reach the state)
  const fwd = [new Map([[key(r0, 0), 1]])]
  let states = 1
  for (let i = 0; i < n; i++) {
    const cur = fwd[i], nxt = new Map()
    for (const [kk, cnt] of cur) {
      const t = decodeT(kk), mask = decodeM(kk)
      for (let s = 0; s < 6; s++) {
        if ((candBits[i] & (1 << s)) === 0) continue
        const rs = Math.floor(t / stride[s]) % radix[s]
        if (rs === 0) continue
        const k2 = key(t - stride[s], mask | bitsAt[i][s])
        nxt.set(k2, (nxt.get(k2) ?? 0) + cnt)
      }
    }
    states += nxt.size
    if (states > maxStates) return null
    fwd.push(nxt)
  }
  const finalKey = key(0, full)
  const total = fwd[n].get(finalKey) ?? 0
  if (!(total > 0)) return null
  // backward: bwd[i] = Map(stateKey after placing cards 0..i-1 -> completions to the final state)
  const bwd = new Array(n + 1)
  bwd[n] = new Map([[finalKey, 1]])
  for (let i = n - 1; i >= 0; i--) {
    const cur = new Map()
    const after = bwd[i + 1]
    for (const kk of fwd[i].keys()) {
      const t = decodeT(kk), mask = decodeM(kk)
      let sum = 0
      for (let s = 0; s < 6; s++) {
        if ((candBits[i] & (1 << s)) === 0) continue
        const rs = Math.floor(t / stride[s]) % radix[s]
        if (rs === 0) continue
        sum += after.get(key(t - stride[s], mask | bitsAt[i][s])) ?? 0
      }
      if (sum > 0) cur.set(kk, sum)
    }
    bwd[i] = cur
  }
  // marginals
  const p = new Float64Array(n * 6)
  for (let i = 0; i < n; i++) {
    const after = bwd[i + 1]
    for (const [kk, cnt] of fwd[i]) {
      const t = decodeT(kk), mask = decodeM(kk)
      for (let s = 0; s < 6; s++) {
        if ((candBits[i] & (1 << s)) === 0) continue
        const rs = Math.floor(t / stride[s]) % radix[s]
        if (rs === 0) continue
        const w = after.get(key(t - stride[s], mask | bitsAt[i][s])) ?? 0
        if (w > 0) p[i * 6 + s] += (cnt * w) / total
      }
    }
  }
  return { p, total, constraints: m, states, tupleCount }
}

// ---- self-test against brute force on small random instances -------------------------------
export function bruteMarginal(k, tbl) {
  const cards = tbl.cards, n = cards.length
  const need = [0, 1, 2, 3, 4, 5].map((s) => Math.max(0, k.unknownSlots[s] ?? 0))
  const cons = k.constraints.map((kc) => ({ seat: kc.seat, rows: kc.cards.map((c) => tbl.index.get(c)).filter((i) => i !== undefined) }))
  const p = new Float64Array(n * 6)
  const assign = new Int8Array(n)
  const rem = [...need]
  let total = 0
  const rec = (i) => {
    if (i === n) {
      if (rem.some((x) => x !== 0)) return
      for (const c of cons) { let ok = false; for (const r of c.rows) if (assign[r] === c.seat) { ok = true; break } if (!ok) return }
      total++
      for (let j = 0; j < n; j++) p[j * 6 + assign[j]]++
      return
    }
    for (const s of k.cands[cards[i]] ?? []) { if (rem[s] === 0) continue; rem[s]--; assign[i] = s; rec(i + 1); rem[s]++ }
  }
  rec(0)
  if (total > 0) for (let j = 0; j < p.length; j++) p[j] /= total
  return { p, total }
}

if (process.argv[1] && process.argv[1].endsWith('exact-marginal.mjs')) {
  // random small instances: n cards, 6 seats, slots summing to n, random candidate sets, random constraints
  let rng = 12345
  const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 2 ** 32 }
  let worst = 0, tested = 0, skipped = 0
  for (let trial = 0; trial < 400; trial++) {
    const n = 4 + Math.floor(rand() * 6) // 4..9
    const need = [0, 0, 0, 0, 0, 0]
    for (let i = 0; i < n; i++) need[Math.floor(rand() * 6)]++
    const cards = Array.from({ length: n }, (_, i) => `c${i}`)
    const cands = {}
    for (const c of cards) { const list = []; for (let s = 0; s < 6; s++) if (need[s] > 0 && rand() < 0.6) list.push(s); if (list.length < 2) { const opts = [0, 1, 2, 3, 4, 5].filter((s) => need[s] > 0); list.length = 0; list.push(...opts.slice(0, Math.max(2, Math.min(opts.length, 2)))) } cands[c] = list }
    const constraints = []
    const nc = Math.floor(rand() * 4)
    for (let j = 0; j < nc; j++) { const seat = Math.floor(rand() * 6); const cs = cards.filter(() => rand() < 0.4); if (cs.length >= 2) constraints.push({ seat, cards: cs }) }
    const k = { seat: 0, counts: need, holders: {}, cands, gone: [], unknownSlots: need, constraints }
    const tbl = { cards, index: new Map(cards.map((c, i) => [c, i])), p: new Float64Array(n * 6) }
    const b = bruteMarginal(k, tbl)
    if (b.total === 0) { skipped++; continue }
    const e = exactMarginal(k, tbl)
    if (!e) { skipped++; continue }
    tested++
    for (let j = 0; j < b.p.length; j++) worst = Math.max(worst, Math.abs(b.p[j] - e.p[j]))
    if (Math.abs(e.total - b.total) > 1e-6 * b.total) throw new Error(`total mismatch ${e.total} vs ${b.total}`)
  }
  console.log(`self-test: ${tested} feasible random instances (${skipped} infeasible or skipped), worst |exact - brute| = ${worst.toExponential(2)}`)
}
