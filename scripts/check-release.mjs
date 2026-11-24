// Release gate for placeholder text.
// Usage: node scripts/check-release.mjs [distDir] [--allow-dummy]
// Fails on bracketed placeholder prose like "[repo link pending]" in built .html/.js, and on any data-dummy
// chip unless --allow-dummy is passed (interim builds keep labelled dummies; the release build must not).
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Bracketed text that starts with a letter, holds a space, has no quotes or code punctuation, and says pending or placeholder.
const BRACKET = /\[([A-Za-z][^\][\n"'`{}();=<>]*\s[^\][\n"'`{}();=<>]*)\]/g
const WORDS = /\b(pending|placeholder)\b/i
const DUMMY = /data-dummy/g

export const bracketHits = (s) => [...s.matchAll(BRACKET)].map((m) => m[0]).filter((m) => WORDS.test(m))

// Self-check: the pattern catches placeholder prose and leaves CSS attribute selectors and JS index strings alone.
assert.deepEqual(bracketHits('a "[repo link pending]" b'), ['[repo link pending]'])
assert.deepEqual(bracketHits('[render pending: credits to confirm]'), ['[render pending: credits to confirm]'])
assert.deepEqual(bracketHits('el["placeholder"]'), [])
assert.deepEqual(bracketHits('input[placeholder]'), [])
assert.deepEqual(bracketHits('[a b c]'), [])

const args = process.argv.slice(2)
const allowDummy = args.includes('--allow-dummy')
const dist = args.find((a) => !a.startsWith('--')) ?? 'dist'
if (!existsSync(dist)) {
  console.error(`${dist} missing. Run npm run build first.`)
  process.exit(1)
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]))

const errors = []
let dummies = 0
for (const f of walk(dist).filter((p) => /\.(html|js)$/.test(p))) {
  const s = readFileSync(f, 'utf8')
  for (const hit of new Set(bracketHits(s))) errors.push(`${f}: placeholder text ${hit}`)
  const n = (s.match(DUMMY) ?? []).length
  dummies += n
  if (n && !allowDummy) errors.push(`${f}: ${n} data-dummy marker(s)`)
}

console.log(`check-release: ${errors.length} problem(s), ${dummies} data-dummy marker(s)${allowDummy ? ' allowed' : ''}`)
for (const e of errors) console.error(`  ${e}`)
process.exit(errors.length ? 1 : 0)
