// Fails if a raster/video file is tracked outside public/, or any hardware schematic / fabrication file is tracked.
// SVG is text and allowed everywhere.
import { execSync } from 'node:child_process'
import { extname } from 'node:path'

const RULES = [
  {
    exts: 'png jpg jpeg gif webp avif ico bmp mp4 webm mov mkv m4v',
    allow: (file) => file.startsWith('public/'),
    msg: 'Raster and video files belong under public/ only.',
  },
  {
    exts: 'gbr gtl gbl gts gbs gto gbo gko gm1 drl sch brd kicad_pcb kicad_sch dxf dwg step stp pdsprj',
    allow: () => false,
    msg: 'Hardware schematics and fabrication files must never be committed (the Climate Controller schematic is proprietary).',
  },
]

const blocked = (file) => {
  const ext = extname(file).slice(1).toLowerCase()
  return RULES.find((r) => r.exts.split(' ').includes(ext) && !r.allow(file))
}
if (blocked('public/portrait/a.webp') || !blocked('src/a.png') || !blocked('public/board.kicad_pcb'))
  throw new Error('check-assets: self-check failed')

const files = execSync('git ls-files -z', { encoding: 'utf8' }).split('\0').filter(Boolean)
let bad = 0
for (const file of files) {
  const rule = blocked(file)
  if (!rule) continue
  bad++
  console.error(`${file}: ${rule.msg}`)
}
if (bad) process.exit(1)
console.log(`check-assets: ${files.length} tracked files, none blocked`)
