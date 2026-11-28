// Bundle budget for the built site. Usage: node scripts/check-bundle.mjs [distDir]
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'

// Ratchet: gzipped ceilings in exact bytes of a measured build. Only ever lower these.
const BOOT_KB = 97488 / 1024 // bootstrap module loaded by index.html
const APP_KB = 15936 / 1024 // lazy app chunk (largest non-vendor js)
const VENDOR_KB = 400 // each three* / gsap* / ScrollTrigger* / lenis* chunk, and each Motion-only chunk
// Fast path, split in two (2026-11-28). It was one 112806 B ceiling for index.html plus its assets, measured when
// index.html was 4658 B (e292b4f). The code part keeps exactly that allowance: 112806 - 4658 = 108148 B.
const FAST_PATH_ASSETS_KB = 108148 / 1024 // index.html's CSS + bootstrap + modulepreloads
// index.html alone. It carries the no-JS fallback built from content.ts, so it grows with every project
// (about 130 B gz each). The one ceiling that may be raised, and only for new content, never for code.
const INDEX_HTML_KB = 8192 / 1024
const PREPAINT_BYTES = 1024 // inline #rr-prepaint script text

const dist = process.argv[2] ?? 'dist'
const htmlPath = join(dist, 'index.html')
if (!existsSync(htmlPath)) {
  console.error(`${htmlPath} missing. Run npm run build first.`)
  process.exit(1)
}

const errors = []
const rows = []
const kb = (bytes) => (bytes / 1024).toFixed(1)
const size = (rel) => {
  const buf = readFileSync(join(dist, rel))
  return { raw: buf.length, gz: gzipSync(buf, { level: 9 }).length }
}
const row = (file, { raw, gz }, budget) => {
  const fail = budget !== undefined && gz > budget * 1024
  if (fail) errors.push(`${file}: ${kb(gz)} KB gz over ${budget} KB`)
  rows.push({ file, 'raw KB': kb(raw), 'gz KB': kb(gz), budget: budget ?? '-', status: fail ? 'FAIL' : 'PASS' })
}
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`))?.[1]
const local = (url) => url && !/^(https?:)?\/\//.test(url) && url.replace(/^\//, '')

// (a) exactly two scripts: the inline classic #rr-prepaint (at most 1 KB of text) and one external module
const html = readFileSync(htmlPath, 'utf8')
const scripts = [...html.matchAll(/(<script\b[^>]*>)([\s\S]*?)<\/script>/gi)].map(([, tag, text]) => ({ tag, text }))
if (scripts.length !== 2) errors.push(`index.html: expected exactly 2 <script>, found ${scripts.length}`)
const prepaint = scripts.filter(({ tag }) => attr(tag, 'id') === 'rr-prepaint')
const modules = scripts.filter(({ tag }) => attr(tag, 'src') && attr(tag, 'type') === 'module')
if (prepaint.length !== 1) errors.push(`index.html: expected exactly 1 <script id="rr-prepaint">, found ${prepaint.length}`)
for (const { tag, text } of prepaint) {
  if (attr(tag, 'src') || attr(tag, 'type')) errors.push('index.html: #rr-prepaint must be an inline classic script (no src, no type)')
  const bytes = Buffer.byteLength(text)
  if (bytes > PREPAINT_BYTES) errors.push(`index.html: #rr-prepaint is ${bytes} bytes, over ${PREPAINT_BYTES}`)
}
if (modules.length !== 1) errors.push(`index.html: expected exactly 1 external type="module" script, found ${modules.length}`)
for (const { tag } of scripts) {
  if (!prepaint.some((p) => p.tag === tag) && !modules.some((p) => p.tag === tag)) errors.push(`index.html: script not allowed: ${tag}`)
}
const boot = local(modules.map(({ tag }) => attr(tag, 'src')).find(Boolean))

// everything index.html pulls in before the app is asked for
const links = (html.match(/<link\b[^>]*>/gi) ?? [])
  .filter((tag) => ['stylesheet', 'modulepreload'].includes(attr(tag, 'rel')))
  .map((tag) => local(attr(tag, 'href')))
  .filter(Boolean)
const fastPath = ['index.html', ...links, ...(boot ? [boot] : [])]

const assets = readdirSync(dist, { recursive: true })
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => /\.(js|css)$/.test(f))
// A lazy chunk whose sourcemap lists only Motion library modules is vendor, like the other animation libraries. dist ships no maps, so maps come from a `--sourcemap hidden` rebuild of the same app;
// a chunk is classified only if that rebuild's copy is byte-identical to the shipped file. Anything else stays app code.
const MOTION_SRC = /node_modules\/(motion-dom|framer-motion|motion-utils)\/(?!.*node_modules\/)/
const motionOnly = (sources) => sources.length > 0 && sources.every((s) => MOTION_SRC.test(s.replaceAll('\\', '/')))
if (!motionOnly(['../../node_modules/motion-dom/dist/a.mjs']) || motionOnly(['../../node_modules/framer-motion/a.mjs', '../../src/App.tsx']) || motionOnly([]))
  throw new Error('check-bundle: motionOnly self-check failed')

const motionVendor = new Map() // file -> number of Motion sources
const nameVendor = (f) => /^(three|gsap|ScrollTrigger|lenis)/.test(basename(f))
const candidates = assets.filter((f) => f.endsWith('.js') && f !== boot && !nameVendor(f))
if (candidates.length) {
  const maps = mkdtempSync(join(tmpdir(), 'check-bundle-maps-'))
  try {
    const vite = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js')
    const run = spawnSync(process.execPath, [vite, 'build', '--sourcemap', 'hidden', '--outDir', maps, '--emptyOutDir', '--logLevel', 'error'], { cwd: dirname(dist), stdio: ['ignore', 'ignore', 'inherit'] })
    if (run.status !== 0) console.error('check-bundle: sourcemap rebuild failed, no chunk reclassified')
    else
      for (const f of candidates) {
        const copy = join(maps, f)
        if (!existsSync(`${copy}.map`) || !readFileSync(copy).equals(readFileSync(join(dist, f)))) continue
        const { sources } = JSON.parse(readFileSync(`${copy}.map`, 'utf8'))
        if (motionOnly(sources)) motionVendor.set(f, sources.length)
      }
  } finally {
    rmSync(maps, { recursive: true, force: true })
  }
}
const isVendor = (f) => nameVendor(f) || motionVendor.has(f)
// (f) the dev-only /__rr/ route and debug hooks never reach production JS
for (const f of assets.filter((f) => f.endsWith('.js'))) {
  if (readFileSync(join(dist, f), 'utf8').includes('__rr')) errors.push(`${f}: contains "__rr"`)
}
const sizes = Object.fromEntries(['index.html', ...assets].map((f) => [f, size(f)]))
const app = assets
  .filter((f) => f.endsWith('.js') && f !== boot && !isVendor(f))
  .sort((a, b) => sizes[b].gz - sizes[a].gz)[0]

for (const f of Object.keys(sizes)) {
  // index.html on its own ceiling, then (b) bootstrap, (c) app chunk, (d) vendor chunks
  const budget = f === 'index.html' ? INDEX_HTML_KB : f === boot ? BOOT_KB : f === app ? APP_KB : isVendor(f) ? VENDOR_KB : undefined
  row(f, sizes[f], budget)
}

// (e) fast path: its assets against their ceiling, then the whole path for reference
const fastAssets = fastPath.filter((f) => f !== 'index.html')
const total = { raw: 0, gz: 0 }
for (const f of fastAssets) {
  if (!sizes[f]) {
    errors.push(`index.html references ${f}, not found in ${dist}`)
    continue
  }
  total.raw += sizes[f].raw
  total.gz += sizes[f].gz
}
row(`fast path assets (${fastAssets.length} files)`, total, FAST_PATH_ASSETS_KB)
row(`fast path (${fastPath.length} files)`, { raw: total.raw + sizes['index.html'].raw, gz: total.gz + sizes['index.html'].gz })

console.table(rows)
// Report: main chunk, Motion vendor chunk(s), and every shipped .js in the total (nothing excluded)
const js = assets.filter((f) => f.endsWith('.js'))
const sum = (files) => files.reduce((t, f) => ({ raw: t.raw + sizes[f].raw, gz: t.gz + sizes[f].gz }), { raw: 0, gz: 0 })
const bytes = ({ raw, gz }) => `${gz} B gz (${raw} B raw)`
if (boot && sizes[boot]) console.log(`main chunk: ${boot} ${bytes(sizes[boot])}`)
for (const [f, n] of motionVendor) console.log(`Motion vendor chunk: ${f} ${bytes(sizes[f])}, sourcemap ${n} sources, all motion-dom/framer-motion/motion-utils`)
if (!motionVendor.size) console.log('Motion vendor chunk: none classified')
console.log(`largest app chunk: ${app ?? 'none'}${app ? ` ${bytes(sizes[app])}` : ''}`)
console.log(`total shipped JS (${js.length} files): ${bytes(sum(js))}`)
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`)
  process.exit(1)
}
console.log('check-bundle: all budgets met')
