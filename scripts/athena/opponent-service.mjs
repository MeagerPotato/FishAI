/**
 * opponent-service.mjs: ATHENA P0's Node opponent service (ATHENA.md §4.5 item 4, §4.6 G0c).
 *
 *     node scripts/athena/opponent-service.mjs [--workers 2]
 *
 * The port (`athena-env`, driven from Python) plays the games; this service plays Monet's seats in them. A pool of
 * worker threads keeps the reference's TypeScript `GameState` of every open game, applies the port's actions to it,
 * and answers `decide(seatView, monetPolicy(v), hashSeed(`${seed}:${moveIndex}`)())` for the seats it was given: the
 * lab's own seeding, as `scripts/duplicate-pairs.mjs` seeds every decision. Every answer carries the reference's
 * rolling state digest d (`scripts/athena/replay-format.md` §5), which the harness compares with the port's
 * `digests()` at every step: every game against Monet is also a live replay check.
 *
 * The protocol is newline-delimited JSON over stdin and stdout, one request a line and one reply a line, in order.
 * stdout carries nothing else (console output of any module goes to stderr). Every request has an `id`, echoed.
 *
 * | request | reply |
 * |---|---|
 * | `{"id","op":"hello"}` | `{"id","ok":true,"protocol":1,"workers":W,"node":"v24...","pid"}` |
 * | `{"id","op":"open","games":[{"g","seed","start","seats":[v or null x6]}]}` | `{"id","ok":true,"games":[[g, deal, acting]]}` |
 * | `{"id","op":"step","full":bool,"items":[[g, applySeat, applyCode, decide]]}` | `{"id","ok":true,"items":[[g, d, acting, code, l, v, end, err]]}` |
 * | `{"id","op":"close","games":[g]}` | `{"id","ok":true,"closed":k}` |
 * | `{"id","op":"stats"}` | `{"id","ok":true,"workers":[{...counters}],"main":{...}}` |
 * | `{"id","op":"quit"}` | `{"id","ok":true}`, then the process exits 0 |
 *
 * - `g` is the caller's game number, a non-negative integer; game g lives on worker g mod W.
 * - `seats[s]` is the Monet version (`MONET_VERSION_IDS`) that plays seat s, or null for a seat the caller plays.
 *   `deal` is the deal digest (the port's d before any step). A refused open opens none of its games.
 * - A step item first applies `applyCode` for `applySeat` (the port's action code, `athena-env/API.md` §4, relative
 *   to the seat that acted in the port; `applySeat` -1 applies nothing), then, if `decide` is 1, decides for the
 *   reference's acting seat. The reply item holds the state digest d after the apply, the acting seat (null once
 *   finished), the decision's code (null without one), the legal-move and view digests l and v of the acting seat
 *   when `full` is true (else null), the final score `[team0, team1]` once the game is finished (else null), and an
 *   error string or null. A refused apply changes nothing and is reported in `err`: it is a divergence.
 * - A decision is judged by the reference before it is returned. A decision the reference refuses, or one with no
 *   action code, is reported in `err` with a null code (duplicate-pairs.mjs drops such a pair).
 *
 * Request-level failures (bad JSON, an unknown op, a worker exception) reply `{"id","ok":false,"error"}`.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { createInterface } from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { format } from 'node:util'
import { performance } from 'node:perf_hooks'

const HERE = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(HERE), '../..')
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href)
const PROTOCOL = 1

// stdout is the protocol: anything a module prints goes to stderr instead.
for (const k of ['log', 'info', 'debug', 'warn']) console[k] = (...a) => process.stderr.write(format(...a) + '\n')

/* --------------------------------------------------------------------- worker --- */

async function workerMain() {
  const CORE = await imp('scripts/athena/opponent-core.ts')
  const BOTS = await imp('lib/engine/bots/index.ts')
  const policies = new Map()
  const policyOf = (v) => {
    if (typeof v !== 'string' || !BOTS.isMonetVersion(v))
      throw new Error(`${JSON.stringify(v)} is not a Monet version (${BOTS.MONET_VERSION_IDS.join(', ')})`)
    let p = policies.get(v)
    if (!p) {
      p = BOTS.monetPolicy(v)
      policies.set(v, p)
    }
    return p
  }
  const games = new Map()
  const stats = {
    worker: workerData.index,
    opened: 0,
    closed: 0,
    live: 0,
    items: 0,
    applies: 0,
    decisions: 0,
    applyMs: 0,
    decideMs: 0,
    digestMs: 0,
    busyMs: 0,
  }

  // All of a request's games are built before any is kept, so a refused request opens none.
  const open = (specs) => {
    const made = specs.map(({ g, seed, start, seats }) => {
      if (!Number.isInteger(g) || g < 0) throw new Error(`game number ${JSON.stringify(g)}`)
      if (games.has(g)) throw new Error(`game ${g} is already open`)
      if (!Array.isArray(seats) || seats.length !== 6) throw new Error(`game ${g}: seats must list six entries`)
      const pols = seats.map((v) => (v === null ? null : policyOf(v)))
      return [g, { game: new CORE.ReferenceGame(seed, start), pols }]
    })
    if (new Set(made.map(([g]) => g)).size !== made.length) throw new Error('a game number appears twice')
    for (const [g, e] of made) games.set(g, e)
    stats.opened += made.length
    return made.map(([g, e]) => [g, e.game.deal, e.game.acting()])
  }

  const step = (items, full) =>
    items.map(([g, applySeat, applyCode, decide]) => {
      stats.items++
      const e = games.get(g)
      if (!e) return [g, null, null, null, null, null, null, `game ${g} is not open`]
      const game = e.game
      let err = null
      if (applySeat !== -1 && applySeat !== null) {
        const t = performance.now()
        const r = game.applyCode(applySeat, applyCode)
        stats.applyMs += performance.now() - t
        stats.applies++
        if (!r.ok) err = `apply of code ${applyCode} for seat ${applySeat} refused: ${r.error}`
      }
      const d = game.d
      if (game.finished) {
        const s = game.state.score
        return [g, d, null, null, null, null, [s[0], s[1]], err]
      }
      const seat = game.acting()
      let code = null
      let l = null
      let v = null
      const view = full || decide ? game.view() : null
      if (full) {
        const t = performance.now()
        l = game.legalDigest()
        v = game.viewDigest(view)
        stats.digestMs += performance.now() - t
      }
      if (decide && !err) {
        const pol = e.pols[seat]
        if (!pol) err = `seat ${seat} is not one of the service's seats in game ${g}`
        else {
          const t = performance.now()
          const action = BOTS.decide(view, pol, game.moveSeed())
          stats.decideMs += performance.now() - t
          stats.decisions++
          const j = game.judge(action)
          if (j.error) err = `the reference refuses the decision ${JSON.stringify(action)}: ${j.error}`
          else code = j.code
        }
      }
      return [g, d, seat, code, l, v, null, err]
    })

  const close = (gs) => {
    let k = 0
    for (const g of gs) if (games.delete(g)) k++
    stats.closed += k
    return k
  }

  parentPort.on('message', (msg) => {
    const t = performance.now()
    let reply
    try {
      if (msg.op === 'open') reply = { seq: msg.seq, games: open(msg.games) }
      else if (msg.op === 'step') reply = { seq: msg.seq, items: step(msg.items, !!msg.full) }
      else if (msg.op === 'close') reply = { seq: msg.seq, closed: close(msg.games) }
      else if (msg.op === 'stats') reply = { seq: msg.seq, stats: { ...stats, live: games.size } }
      else throw new Error(`unknown worker op ${msg.op}`)
    } catch (e) {
      reply = { seq: msg.seq, error: e && e.stack ? e.stack : String(e) }
    }
    stats.busyMs += performance.now() - t
    parentPort.postMessage(reply)
  })
  parentPort.postMessage({ ready: true })
}

/* ----------------------------------------------------------------------- main --- */

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}

async function mainMain() {
  const W = Number(argOf('--workers', 2))
  if (!Number.isInteger(W) || W < 1 || W > 16) {
    process.stderr.write(`opponent-service: --workers must be 1..16, got ${argOf('--workers', '')}\n`)
    process.exit(2)
  }
  const workers = []
  let seq = 0
  let quitting = false
  for (let i = 0; i < W; i++) {
    const w = new Worker(HERE, { workerData: { index: i } })
    const pending = new Map()
    w.on('error', (e) => {
      process.stderr.write(`opponent-service: worker ${i} failed: ${e && e.stack ? e.stack : e}\n`)
      process.exit(3)
    })
    w.on('exit', (code) => {
      if (!quitting) {
        process.stderr.write(`opponent-service: worker ${i} exited (${code})\n`)
        process.exit(3)
      }
    })
    const ready = new Promise((res) => {
      w.on('message', (m) => {
        if (m.ready) return res()
        const p = pending.get(m.seq)
        pending.delete(m.seq)
        if (p) p(m)
      })
    })
    workers.push({ w, pending, ready })
  }
  await Promise.all(workers.map((x) => x.ready))

  /** Send one message to worker i and await its reply (throws on a worker-side error). */
  const call = (i, msg) =>
    new Promise((res, rej) => {
      const s = ++seq
      workers[i].pending.set(s, (m) => (m.error ? rej(new Error(`worker ${i}: ${m.error}`)) : res(m)))
      workers[i].w.postMessage({ ...msg, seq: s })
    })

  /** Split a list by worker (g mod W), keeping each element's position. */
  const byWorker = (list, gOf) => {
    const parts = Array.from({ length: W }, () => ({ idx: [], items: [] }))
    list.forEach((x, k) => {
      const g = gOf(x)
      if (!Number.isInteger(g) || g < 0) throw new Error(`game number ${JSON.stringify(g)}`)
      parts[g % W].idx.push(k)
      parts[g % W].items.push(x)
    })
    return parts
  }

  /** Run `op` on every worker that has a share of `list`, and put the replies back in the list's order. */
  const scatter = async (op, list, gOf, key, extra = {}) => {
    const parts = byWorker(list, gOf)
    const out = new Array(list.length)
    await Promise.all(
      parts.map(async (p, i) => {
        if (p.items.length === 0) return
        const m = await call(i, { op, [key]: p.items, ...extra })
        const rows = m[key]
        p.idx.forEach((k, j) => (out[k] = rows[j]))
      }),
    )
    return out
  }

  const main = { requests: 0, steps: 0, stepItems: 0, stepMs: 0 }
  const handle = async (req) => {
    switch (req.op) {
      case 'hello':
        return { protocol: PROTOCOL, workers: W, node: process.version, pid: process.pid }
      case 'open': {
        // A refused open opens nothing: each worker opens all of its share or none, and if any worker refuses, the
        // games the others opened for this request are closed again before the error is returned.
        const parts = byWorker(req.games, (x) => x.g)
        const settled = await Promise.allSettled(
          parts.map((p, i) => (p.items.length ? call(i, { op: 'open', games: p.items }) : Promise.resolve({ games: [] }))),
        )
        const failed = settled.find((s) => s.status === 'rejected')
        if (failed) {
          await Promise.all(
            settled.map((s, i) =>
              s.status === 'fulfilled' && s.value.games.length ? call(i, { op: 'close', games: s.value.games.map((x) => x[0]) }) : null,
            ),
          )
          throw failed.reason
        }
        const out = new Array(req.games.length)
        parts.forEach((p, i) => p.idx.forEach((k, j) => (out[k] = settled[i].value.games[j])))
        return { games: out }
      }
      case 'step': {
        const t = performance.now()
        const items = await scatter('step', req.items, (x) => x[0], 'items', { full: !!req.full })
        main.steps++
        main.stepItems += items.length
        main.stepMs += performance.now() - t
        return { items }
      }
      case 'close': {
        const parts = byWorker(req.games, (g) => g)
        const ks = await Promise.all(parts.map((p, i) => (p.items.length ? call(i, { op: 'close', games: p.items }) : { closed: 0 })))
        return { closed: ks.reduce((a, m) => a + m.closed, 0) }
      }
      case 'stats': {
        const ss = await Promise.all(workers.map((_, i) => call(i, { op: 'stats' })))
        return { workers: ss.map((m) => m.stats), main }
      }
      case 'quit':
        return {}
      default:
        throw new Error(`unknown op ${JSON.stringify(req.op)}`)
    }
  }

  const write = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')
  const shutdown = async (code) => {
    quitting = true
    await Promise.all(workers.map((x) => x.w.terminate()))
    process.stdout.write('', () => process.exit(code))
  }

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  let chain = Promise.resolve()
  rl.on('line', (line) => {
    if (!line.trim()) return
    chain = chain.then(async () => {
      if (quitting) return
      let req = null
      try {
        req = JSON.parse(line)
        main.requests++
        const body = await handle(req)
        write({ id: req.id ?? null, ok: true, ...body })
        if (req.op === 'quit') await shutdown(0)
      } catch (e) {
        write({ id: req && req.id !== undefined ? req.id : null, ok: false, error: e && e.stack ? e.stack : String(e) })
      }
    })
  })
  rl.on('close', () => {
    chain = chain.then(() => (quitting ? undefined : shutdown(0)))
  })
}

if (isMainThread) await mainMain()
else await workerMain()
