import { existsSync, readdirSync } from "node:fs";
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

export default defineConfig({
  define: { __PROJECT_IMAGES__: JSON.stringify(projectImages) },
  plugins: [react(), tailwindcss(), preloadDisplayFont, rrFallback(), rrContentRoute],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
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
  },
});
