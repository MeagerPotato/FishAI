/**
 * build-papers.mjs — compile `papers/*.tex` to the PDFs the site serves from `public/papers/`.
 *
 * `/papers` links each paper to a PDF, and a link to a PDF that is not there is worse than no
 * link at all. Vite copies `public/` verbatim into `dist/`, so the built PDFs are committed
 * artifacts of the same kind as the lab's results JSON: generated, checked in, and stale the
 * moment their source moves. Re-run this after editing any `.tex`.
 *
 * Two passes per paper, unconditionally. LaTeX resolves `\ref`/`\cite` from the `.aux` file the
 * PREVIOUS pass wrote, so a one-pass build of a paper with forward references prints `??` where
 * a number belongs and exits 0 while doing it. This script therefore does not trust the exit
 * code alone: after the second pass it greps the log for the undefined-reference warning and
 * fails the build if it is there. A PDF with a `??` in it is a broken PDF.
 *
 * Compilation happens in `papers/build/` (gitignored) and only the `.pdf` is copied out, so the
 * `.aux`/`.log`/`.out` churn never reaches the working tree.
 *
 * The run also writes `src/pages/papers-manifest.json` — page count and byte size per paper,
 * plus the engine version and the build date. `/papers` prints those beside each PDF link, and
 * a hand-maintained number there would be wrong the first time a `.tex` grew a page. It is a
 * generated, committed artifact of exactly the same kind as the lab's results JSON.
 *
 *   node scripts/build-papers.mjs [--engine PATH] [--only NAME[,NAME]]
 *
 * `--engine` overrides the pdflatex to use; without it the script tries `pdflatex` on PATH and
 * then the default MiKTeX install location, so a machine with either arrangement just works.
 * `--only` skips the rest, and then leaves the manifest alone rather than writing a partial one.
 */
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = join(ROOT, 'papers')
const BUILD_DIR = join(SRC_DIR, 'build')
const OUT_DIR = join(ROOT, 'public', 'papers')

/** Candidate pdflatex binaries, in the order they are tried. */
const ENGINE_CANDIDATES = [
  'pdflatex',
  'C:\\Users\\allen\\AppData\\Local\\Programs\\MiKTeX\\miktex\\bin\\x64\\pdflatex.exe',
  '/usr/bin/pdflatex',
]

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1)
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i]
    else out[a.slice(2)] = 'true'
  }
  return out
}

function findEngine(explicit) {
  const candidates = explicit ? [explicit] : ENGINE_CANDIDATES
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' })
    if (probe.status === 0) return candidate
  }
  throw new Error(
    `No working pdflatex found (tried ${candidates.join(', ')}). Install a TeX distribution, ` +
      'or pass --engine PATH.',
  )
}

/** One pass. `-halt-on-error` so a real TeX error stops here instead of at an interactive prompt. */
function pass(engine, tex, cwd) {
  return spawnSync(
    engine,
    ['-interaction=nonstopmode', '-halt-on-error', `-output-directory=${cwd}`, tex],
    { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
}

/**
 * The log lines that mean the PDF is wrong even though TeX exited 0. `Reference ... undefined`
 * covers `\ref`; `Citation ... undefined` covers `\cite`; the summary line covers both.
 */
function undefinedRefs(log) {
  const lines = log.split(/\r?\n/)
  return lines.filter(
    (l) =>
      /^LaTeX Warning: (Reference|Citation) `/.test(l) ||
      /^LaTeX Warning: There were undefined references/.test(l),
  )
}

const opts = args(process.argv.slice(2))
const engine = findEngine(opts.engine)
/** `pdfTeX, Version 3.141592653-2.6-1.40.28 (MiKTeX 25.12)` — the version line, not the path. */
const engineVersion =
  spawnSync(engine, ['--version'], { encoding: 'utf8' }).stdout?.split(/\r?\n/)[0]?.trim() ??
  'unknown'

const only = typeof opts.only === 'string' ? new Set(opts.only.split(',')) : null
const sources = (await readdir(SRC_DIR))
  .filter((f) => f.endsWith('.tex'))
  .filter((f) => only === null || only.has(basename(f, '.tex')))
  .sort()

if (sources.length === 0) {
  console.error(`No .tex sources selected in ${SRC_DIR}`)
  process.exit(1)
}

await mkdir(BUILD_DIR, { recursive: true })
await mkdir(OUT_DIR, { recursive: true })

console.log(`engine  ${engine}`)
console.log(`sources ${SRC_DIR}`)
console.log(`out     ${OUT_DIR}\n`)

let failed = 0
/** slug -> { pages, bytes }, in build order, for the committed manifest. */
const built = {}
for (const file of sources) {
  const name = basename(file, '.tex')
  const tex = join(SRC_DIR, file)
  process.stdout.write(`${name.padEnd(22)}`)

  let last = null
  for (let i = 1; i <= 2; i++) {
    last = pass(engine, tex, BUILD_DIR)
    if (last.status !== 0) break
  }

  const logPath = join(BUILD_DIR, `${name}.log`)
  const log = existsSync(logPath) ? await readFile(logPath, 'utf8') : (last?.stdout ?? '')

  if (last === null || last.status !== 0) {
    const errors = log
      .split(/\r?\n/)
      .filter((l) => l.startsWith('!'))
      .slice(0, 6)
    console.log('FAILED')
    for (const e of errors) console.log(`  ${e}`)
    failed++
    continue
  }

  const undef = undefinedRefs(log)
  if (undef.length > 0) {
    console.log(`FAILED — ${undef.length} undefined reference warnings`)
    for (const u of undef.slice(0, 8)) console.log(`  ${u}`)
    failed++
    continue
  }

  const pdf = join(BUILD_DIR, `${name}.pdf`)
  if (!existsSync(pdf)) {
    console.log('FAILED — two passes, no PDF')
    failed++
    continue
  }
  await copyFile(pdf, join(OUT_DIR, `${name}.pdf`))
  const { size } = await stat(join(OUT_DIR, `${name}.pdf`))
  // TeX hard-wraps its log at ~79 columns, so "Output written on … (N pages, …)" is routinely
  // split across two lines. Unwrap before reading the page count out of it.
  const pages = /Output written on [^(]*\((\d+) pages?/.exec(log.replace(/\r?\n/g, ''))?.[1] ?? '?'
  built[name] = { pages: pages === '?' ? 0 : Number(pages), bytes: size }
  console.log(`ok · 2 passes · 0 undefined refs · ${pages} pages · ${(size / 1024).toFixed(0)} KB`)
}

if (failed > 0) {
  console.error(`\n${failed} of ${sources.length} papers failed to build.`)
  process.exit(1)
}

// A partial run (--only) must not overwrite the manifest with a partial one: the page would then
// print sizes for some papers and nothing for the rest, with no way to tell which.
if (only === null) {
  const manifest = {
    note: 'Generated by scripts/build-papers.mjs. Do not edit by hand; run `npm run papers:build`.',
    generatedAt: new Date().toISOString(),
    engine: engineVersion,
    papers: built,
  }
  await writeFile(
    join(ROOT, 'src', 'pages', 'papers-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  console.log('\nsrc/pages/papers-manifest.json rewritten.')
}
console.log(`${sources.length} papers built into public/papers/.`)
