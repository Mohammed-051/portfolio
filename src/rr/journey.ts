// Journey: scroll-linked seams, headings and scenes for Work to Contact. Lazy, no scroll capture, final state by default.
import "../styles/journey.css";
import { loadGsap } from "./refresh.ts";
import { registry, type Handle } from "./registry.ts";
import { store } from "./store.ts";
import type { Ctx } from "./journey/cells.ts";

const SEL = "[data-rr-line],[data-rr-rule],[data-rr-words],[data-rr-frame],[data-rr-seam],[data-rr-parallax]";
const ROOT = "section[data-rr-seam]";
const VARS = ["--rr-seam", "--rr-p"];

export async function createJourney(o: { signal: AbortSignal }): Promise<Handle> {
  const life = new AbortController();
  let dead = false;
  const noop: Handle = { destroy() { dead = true; life.abort(); } };
  if (store.get().motion !== "full") return noop; // reduced motion and /index: no chunk, final CSS defaults
  const signal = AbortSignal.any([o.signal, life.signal]);
  const [{ gsap, ScrollTrigger: ST }, [seam, type, scenes]] = await Promise.all([
    loadGsap(),
    Promise.all([import("./journey/seam.ts"), import("./journey/type.ts"), import("./journey/scenes.ts")]),
  ]);
  await registry.whenReady("scroll", signal);
  const refresh = await registry.whenReady("refresh", signal);
  if (signal.aborted || dead) return noop;

  let c: Ctx;
  let mo: MutationObserver | undefined;
  let raf = 0, stop = 0;
  const unsub: (() => void)[] = [];
  const bound = new Set<Element>();

  const fresh = () => { c = { ST, gsap, desk: store.get().layout === "pin", offs: [], redraw: [], fonts: [] }; };
  const teardown = () => {
    for (const f of c.offs.splice(0).reverse()) f();
    for (const el of bound) {
      el.removeAttribute("data-rr-bound");
      el.removeAttribute("data-rr-done");
      for (const v of VARS) (el as HTMLElement).style.removeProperty(v);
    }
    bound.clear();
  };

  /** Binds every target not yet bound. Bodies arrive lazily, so this runs again for each batch of new nodes. */
  const scan = () => {
    raf = 0;
    if (dead) return;
    const root = document.getElementById("main");
    if (!root) return;
    const mark = (el: HTMLElement) => { el.setAttribute("data-rr-bound", c.desk ? "pin" : "stack"); bound.add(el); };
    const todo = [...root.querySelectorAll<HTMLElement>(SEL)].filter((el) => !el.hasAttribute("data-rr-bound") && el.closest(ROOT) !== null);
    const lines = new Map<Element, HTMLElement[]>();
    for (const el of todo) {
      const d = el.dataset;
      if ("rrLine" in d) {
        const h = el.closest("h2,h3")!;
        lines.set(h, [...(lines.get(h) ?? []), el]);
        mark(el);
        continue;
      }
      if (el.matches(ROOT) && "rrSeam" in d) seam.bindSeam(c, el);
      if ("rrRule" in d) scenes.bindRule(c, el);
      if ("rrFrame" in d) scenes.bindFrame(c, el);
      if ("rrWords" in d) type.bindWords(c, el);
      if ("rrParallax" in d) scenes.bindParallax(c, el, parseFloat(d["rrParallax"] ?? ""));
      mark(el);
    }
    for (const [h, ls] of lines) type.bindLines(c, h, ls);
    if (todo.length) refresh.request("chunk");
    // Done once every shell is bound and its body is ready (chunks land one by one), and every h2 line is bound.
    const open = [...root.querySelectorAll(ROOT)].some((el) => !el.hasAttribute("data-ready"))
      || [...root.querySelectorAll(`${ROOT}, h2 [data-rr-line]`)].some((el) => !el.hasAttribute("data-rr-bound"));
    if (!open) mo?.disconnect();
  };
  const queue = () => { if (!raf && !dead) raf = requestAnimationFrame(scan); };

  const start = () => {
    fresh();
    scan();
    const main = document.getElementById("main");
    if (main) {
      mo = new MutationObserver(queue);
      mo.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ready"] });
      stop = window.setTimeout(() => mo?.disconnect(), 12000);
    }
  };
  const stopAll = () => { mo?.disconnect(); clearTimeout(stop); cancelAnimationFrame(raf); raf = 0; teardown(); };
  const redraw = () => { if (!store.get().modeBusy) for (const f of c.redraw) f(); };

  const h: Handle = {
    destroy() {
      if (dead) return;
      dead = true;
      life.abort();
      unsub.splice(0).forEach((f) => f());
      stopAll();
    },
  };
  start();
  unsub.push(
    store.subscribe("mode", () => { redraw(); refresh.request("mode"); }),
    store.subscribe("modeBusy", redraw),
    store.subscribe("fontGen", () => { for (const f of c.fonts) f(); redraw(); refresh.request("fonts"); }),
    store.subscribe("layout", () => { stopAll(); start(); refresh.request("layout"); }),
    store.subscribe("motion", (s) => { if (s.motion === "reduced") h.destroy(); }),
  );

  signal.addEventListener("abort", () => h.destroy(), { once: true });
  return h;
}
