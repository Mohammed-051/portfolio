// Footer stage host: two same-size canvases (back and front, the name between them), one World per mode (created lazily,
// kept) drawing into both, one rAF loop that only runs while the stage is on screen, the tab is visible and motion is full.
// Reduced motion paints a still frame.
import * as budget from "./canvasBudget.ts";
import { createRaster } from "./footer/raster.ts";
import { createRender } from "./footer/render.ts";
import type { Line, Palette, World } from "./footer/world.ts";
import { token } from "./refresh.ts";
import type { Handle } from "./registry.ts";
import { store, type Mode } from "./store.ts";

export interface ClosingHost { signal: AbortSignal; host: HTMLElement; back: HTMLCanvasElement; front: HTMLCanvasElement }

/** Client coordinate to drawing units. */
const toUnit = (client: number, origin: number, cell: number) => (client - origin) / cell;

if (import.meta.env.DEV) console.assert(toUnit(110, 10, 4) === 25 && toUnit(5, 5, 3) === 0, "Closing: toUnit is wrong");

const readPalette = (): Palette => ({
  paper: token("--paper"), panel: token("--panel"), ink: token("--ink"), ink2: token("--ink-2"),
  mute: token("--mute"), rule: token("--rule"), signal: token("--signal"), trace: token("--trace"),
});

export async function create(o: ClosingHost): Promise<Handle> {
  const { signal, host, back: canvas, front } = o;
  const x = canvas.getContext("2d"), xf = front.getContext("2d");
  if (!x || !xf) throw new Error("closing: 2d context unavailable");
  const cvs = [canvas, front];

  const worlds: Partial<Record<Mode, World>> = {};
  const worldFor = (m: Mode): World => (worlds[m] ??= m === "raster" ? createRaster() : createRender());
  let mode = store.get().mode;
  let world = worldFor(mode);
  let pal = readPalette();
  let cell = 1;
  let vis = false, stale = false, dead = false, raf = 0, last = 0;
  const unregs = cvs.map((c) => budget.register(c, { visible: () => vis, onEvict: () => { stale = true; } }));

  const reduced = () => store.get().motion === "reduced";

  /** One repaint outside the loop: a composed still when motion is reduced, the current frame otherwise. */
  function paint() {
    if (dead || !canvas.width || !front.width) return;
    if (reduced()) world.still();
    world.draw(x!, xf!, pal);
  }

  /** Every visible line of the name in drawing units (the canvases are bottom-anchored at the host's left edge, at y0, x0). */
  function lines(y0: number, x0: number): Line[] {
    const u = (v: number, o: number) => (v - o) / cell;
    const svg = [...host.querySelectorAll<SVGSVGElement>("svg[data-ls]")].find((e) => e.getClientRects().length);
    if (svg) {
      const r = svg.getBoundingClientRect(), k = r.width / (svg.viewBox.baseVal.width || 1);
      const ls = JSON.parse(svg.dataset.ls ?? "[]") as number[][];
      const ch = (svg.dataset.ch ?? "").split(" ");
      return ls.map(([t = 0, b = 0, ...l], i) => ({ top: u(r.top + t * k, y0), base: u(r.top + b * k, y0), l: l.map((v) => u(r.left + v * k, x0)), ch: ch[i] ?? "" }));
    }
    // text: one entry per row of word boxes (a phone sets the words in two rows), letters measured glyph by glyph
    const out: Line[] = [], rg = document.createRange();
    for (const w of host.querySelectorAll<HTMLElement>(".ftr-name__w")) {
      const r = w.getBoundingClientRect(), t = w.firstChild;
      if (!r.width || !t) continue;
      let ln = out.find((o) => Math.abs(o.base - u(r.bottom, y0)) < 2);
      if (!ln) out.push((ln = { top: u(r.top, y0), base: u(r.bottom, y0), l: [], ch: "" }));
      for (let i = 0; i < (t.textContent ?? "").length; i++) {
        rg.setStart(t, i); rg.setEnd(t, i + 1);
        const c = rg.getBoundingClientRect();
        ln.l.push(u(c.left, x0), u(c.right, x0));
        ln.ch += t.textContent![i];
      }
      const s = w.nextElementSibling?.getBoundingClientRect(); // the stop
      if (s?.width) { ln.l.push(u(s.left, x0), u(s.right, x0)); ln.ch += "."; }
    }
    return out.length ? out : [{ top: (host.clientHeight * 0.4) / cell, base: (host.clientHeight * 0.85) / cell, l: [0, host.clientWidth / cell], ch: "" }];
  }

  function layout() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h || dead) return;
    // The one stage scale (footer.css --ftr-k) is the size of a drawing unit, so every scene dimension follows it
    const k = parseFloat(getComputedStyle(host).getPropertyValue("--ftr-k")) || 1;
    let cw = w, ch = h, dpr = 1;
    if (mode === "raster") {
      cell = (w < 560 ? 3 : 4) * k;
      cw = Math.max(1, Math.floor(w / cell)); ch = Math.max(1, Math.floor(h / cell)); // the backing store is the cell grid
    } else {
      cell = k;
      cw = w / k; ch = h / k;
      dpr = Math.min(devicePixelRatio || 1, 2);
    }
    for (const [c, g] of [[canvas, x!], [front, xf!]] as const) {
      const d = mode === "raster" ? budget.size(c, cw, ch, dpr) : budget.size(c, w, h, dpr);
      c.style.width = `${cw * cell}px`;
      c.style.height = `${ch * cell}px`;
      if (mode === "raster") g.setTransform(1, 0, 0, 1, 0, 0);
      else g.setTransform(d * k, 0, 0, d * k, 0, 0);
    }
    const hr = host.getBoundingClientRect();
    world.resize(cw, ch, lines(hr.bottom - ch * cell, hr.left), k);
    stale = false;
    paint();
  }

  function frame(t: number) {
    raf = 0;
    if (dead) return;
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    world.step(dt);
    world.draw(x!, xf!, pal);
    raf = requestAnimationFrame(frame);
  }

  function sync() {
    const run = !dead && vis && !document.hidden && !reduced();
    if (run && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  const ac = new AbortController();
  const opt = { signal: ac.signal };

  const unit = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [toUnit(e.clientX, r.left, cell), toUnit(e.clientY, r.top, cell)];
  };
  const poke = (kind: "move" | "down" | "leave", e?: PointerEvent) => {
    if (reduced()) return;
    const [u, v] = e ? unit(e) : [0, 0];
    world.poke(kind, u, v);
  };
  host.addEventListener("pointermove", (e) => poke("move", e), { passive: true, ...opt });
  host.addEventListener("pointerdown", (e) => poke("down", e), opt);
  host.addEventListener("pointerleave", () => poke("leave"), opt);
  host.addEventListener("pointercancel", () => poke("leave"), opt);
  // Contact events (components/sections/Contact.tsx): x is a client x, the world wants drawing units.
  const toU = (x: number) => toUnit(x, canvas.getBoundingClientRect().left, cell);
  document.addEventListener("rr:react", (e) => { const d = (e as CustomEvent<{ i: number; x: number }>).detail; if (!reduced()) world.react(d.i, d.i < 0 ? 0 : toU(d.x)); }, opt);
  document.addEventListener("rr:answer", (e) => { if (!reduced()) world.answer(toU((e as CustomEvent<{ x: number }>).detail.x)); }, opt);
  document.addEventListener("visibilitychange", sync, opt);
  document.fonts.addEventListener("loadingdone", layout, opt); // the name's cap line moves when its face arrives; the stage size does not

  const ro = new ResizeObserver(layout);
  ro.observe(host);
  const io = new IntersectionObserver((es) => {
    const was = vis;
    vis = es[es.length - 1]!.isIntersecting;
    if (vis && !was && (stale || !canvas.width || !front.width)) layout();
    sync();
  }, { rootMargin: "160px 0px" });
  io.observe(host);

  const offMode = store.subscribe("mode", (s) => {
    mode = s.mode;
    world = worldFor(mode);
    pal = readPalette();
    layout();
  });
  const offMotion = store.subscribe("motion", () => { sync(); paint(); });

  layout();

  const destroy = () => {
    if (dead) return;
    dead = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    ac.abort();
    ro.disconnect();
    io.disconnect();
    offMode();
    offMotion();
    for (const u of unregs) u();
    for (const c of cvs) budget.release(c);
  };
  signal.addEventListener("abort", destroy, { once: true });
  return { destroy };
}
