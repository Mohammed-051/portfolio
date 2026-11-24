// Fails if a tracked text file looks like it holds a secret. Prints file:line and the rule name, never the value.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PATTERNS = {
  service_role: /service_role/,
  SUPABASE_SERVICE: /SUPABASE_SERVICE/,
  'sb_secret_': /sb_secret_/,
  'sk-ant-': /sk-ant-/,
  'private key': /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  'github token': /ghp_[A-Za-z0-9]{36}/,
  github_pat_: /github_pat_/,
  JWT: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
}
// package-lock.json: generated, only registry URLs and integrity hashes. This file: holds the patterns.
const SKIP = ['package-lock.json', 'scripts/check-secrets.mjs']

const files = execSync('git ls-files -z', { encoding: 'utf8' }).split('\0').filter(Boolean)
let hits = 0
for (const file of files) {
  if (SKIP.includes(file)) continue
  let buf
  try {
    buf = readFileSync(file)
  } catch {
    continue // tracked but deleted in the working tree
  }
  if (buf.includes(0)) continue // binary
  buf.toString('utf8').split('\n').forEach((line, i) => {
    for (const [name, re] of Object.entries(PATTERNS)) {
      if (!re.test(line)) continue
      hits++
      console.error(`${file}:${i + 1}: possible secret (${name})`)
    }
  })
}
if (hits) process.exit(1)
console.log(`check-secrets: ${files.length} tracked files, no secret patterns`)
