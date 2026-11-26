import "./styles/fonts.css";
import "./styles/app.css";
import "./styles/motion.css";
import "./styles/intro.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { checkMotionTokens } from "./motion/config";
import "./rr/sfx.ts"; // arms the lazy sound loader

// Intro (index.html markup, html.rr-intro from the prepaint script, which also pins scroll restoration to manual and drops the
// hash for a new tab); its logic is a lazy chunk that puts restoration back to auto. A reload in the same tab skips it.
const html = document.documentElement;
if (html.classList.contains("rr-intro")) void import("./intro/intro.ts").then((m) => m.run()).catch(() => { html.classList.remove("rr-intro"); try { history.scrollRestoration = "auto"; } catch { /* old browser */ } });

// React replaces the static fallback inside #root.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.DEV) checkMotionTokens();

// Vercel Speed Insights: a lazy chunk after load, off the fast path. Production only; the script is same-origin (/_vercel/...).
if (import.meta.env.PROD) addEventListener("load", () => void import("@vercel/speed-insights").then((m) => m.injectSpeedInsights()).catch(() => {}), { once: true });
