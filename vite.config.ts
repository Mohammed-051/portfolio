import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import * as content from "./src/lib/content.ts";
import * as site from "./src/lib/site.ts";
import { renderFallback } from "./src/fallback/renderFallback.ts";

/** Inject the generated no-JS page, in dev and build. */
const rrFallback = (): Plugin => ({
  name: "rr-fallback",
  transformIndexHtml: (html) => html.replace("<!--rr-fallback-->", renderFallback()),
});

/** Dev-only JSON dump of the site content for content checks. Never part of the production build. */
const rrContentRoute: Plugin = {
  name: "rr-content-route",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/__rr/content.json", (_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ...content, ...site }));
    });
  },
};

/** Preload the wordmark face. Its hashed name only exists in the build bundle, so dev skips it. */
const preloadDisplayFont: Plugin = {
  name: "preload-display-font",
  apply: "build",
  transformIndexHtml(_html, ctx) {
    const file = Object.keys(ctx.bundle ?? {}).find((f) => f.includes("archivo-latin-standard-normal") && f.endsWith(".woff2"));
    if (!file) return [];
    return [
      {
        tag: "link",
        attrs: { rel: "preload", as: "font", type: "font/woff2", href: `/${file}`, crossorigin: "" },
        injectTo: "head-prepend",
      },
    ];
  },
};

/** PNGs present under public/images/projects/<slug>/ now, so the board requests only files that exist (no 404s). */
const projectImages = (() => {
  const root = fileURLToPath(new URL("./public/images/projects", import.meta.url));
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(`${root}/${d.name}`).filter((f) => f.endsWith(".png")).map((f) => `images/projects/${d.name}/${f}`));
})();

/** Production headers, shared by Vercel and `vite preview` so CSP violations show up locally. */
const vercel = JSON.parse(readFileSync(fileURLToPath(new URL("./vercel.json", import.meta.url)), "utf8"));
const siteHeaders: { key: string; value: string }[] = vercel.headers.find((h: { source: string }) => h.source === "/(.*)").headers;

/** Vercel runs only `npm run build`, so fail it when an inline script/style hash drifts from the CSP; the last good deploy stays live. */
const cspHashGuard = (): Plugin => {
  let outDir = "";
  return {
    name: "csp-hash-guard",
    apply: "build",
    configResolved: (c) => { outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      const html = readFileSync(resolve(outDir, "index.html"), "utf8");
      const csp = siteHeaders.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
      for (const m of html.matchAll(/<(script|style)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
        if (m[1].toLowerCase() === "script" && /\ssrc\s*=/i.test(m[2] ?? "")) continue;
        const hash = `sha256-${createHash("sha256").update(m[3].replace(/\r\n?/g, "\n")).digest("base64")}`;
        if (!csp.includes(`'${hash}'`)) throw new Error(`CSP hash guard: inline <${m[1]}> in dist/index.html has hash '${hash}' missing from vercel.json Content-Security-Policy. Update vercel.json.`);
      }
    },
  };
};

export default defineConfig({
  define: { __PROJECT_IMAGES__: JSON.stringify(projectImages) },
  plugins: [react(), tailwindcss(), preloadDisplayFont, rrFallback(), rrContentRoute, cspHashGuard()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/three")) return "three";
        },
      },
    },
    chunkSizeWarningLimit: 350,
  },
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4180,
    strictPort: true,
    headers: Object.fromEntries(siteHeaders.map((h) => [h.key, h.value])),
  },
});
