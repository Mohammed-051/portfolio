# Mohammed Parvez, Creator & Developer

My portfolio site. One page, one WebGL canvas: a desk scene that the page scrolls through, with About, Work, Lab and Contact laid out on it. It has two looks you can switch between: Render (paper and ink) and Raster (dark field, pixel squares). Without WebGL, with reduced motion or with JavaScript off, a static version of the same content is served.

## Stack

- Vite, React 19, TypeScript
- three.js for the scene, with glTF models in `public/world/`
- GSAP and Lenis for scroll, Motion for UI transitions
- Tailwind CSS 4 alongside plain CSS
- oxlint

Site copy and project data live in `src/lib/content.ts` and `src/lib/site.ts`.

## Run it

Needs Node 22.

```
npm install
npm run dev        # http://127.0.0.1:5180
npm run build      # type checks, then builds to dist/
npm run preview    # serves dist/ on http://127.0.0.1:4180
npm run lint
npm run typecheck
```

`scripts/` holds the checks CI runs after a build (bundle size, tracked assets, secrets, release placeholders).

## Releases

Versions follow Semantic Versioning, and changes are listed in `CHANGELOG.md`. Pushing a `vX.Y.Z` tag that matches the version in `package.json` builds the site, runs the checks and publishes a GitHub Release. Pushes to main deploy through Vercel's Git integration, and pull requests get preview deploys.
