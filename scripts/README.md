# scripts/

CI gates, run with `node scripts/<name>.mjs`.

- `check-assets.mjs`: fails if a raster or video file is tracked outside `public/`, or any schematic or fabrication file is tracked.
- `check-bundle.mjs`: bundle budget for the built site (optional dist dir argument).
- `check-release.mjs`: fails on placeholder text or `data-dummy` markers in the built site.
- `check-secrets.mjs`: fails if a tracked text file looks like a secret. Prints file:line and rule name only.
