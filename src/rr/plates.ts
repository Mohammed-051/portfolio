import * as budget from "./canvasBudget.ts";
import { cache, bytesOf, type PlateEntry } from "./platecache.ts";
import type { Handle } from "./registry.ts";
import { store } from "./store.ts";
import { yieldTask } from "./yield.ts";

/* Generated typographic plates: glitched bands with a midpoint ring, climate hatch, smart
 * Bayer dither. Abstract only: no plate draws circuit, schematic, layout or pinout imagery. */

export type PlateRole = "work" | "case" | "thumb" | "ghost";
export interface PlateRef { id: string; canvas: HTMLCanvasElement; role: PlateRole } // role: reserved for the case ghost and menu thumbs
export interface PlatesHandle extends Handle {
  register(r: PlateRef): () => void;
  setRes(canvas: HTMLCanvasElement, res: number): void; // 0..1, quantised to 1/12; redraws only when the step changes
  redrawVisible(): Promise<void>; // generation-counted, one plate per task, invisible plates stay stale
  ready(): Promise<void>;
  reroll(id: string): void;
}

type Ctx = CanvasRenderingContext2D;
interface Colours { bg: string; ink: string; dim: string; sig: string }
interface Item {
  ref: PlateRef;
  w: number; h: number; dpr: number; // css px (rounded) and the dpr the display canvas got
  res: number;
  vis: boolean;
  stale: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rnd = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Midpoint circle, shared with the Bench; the extra fields are its decision value and octant walk. */
export function circle(cx: number, cy: number, r: number): [number, number, number, number, number][] {
  const out: [number, number, number, number, number][] = [];
  const seen = new Set<string>();
  let x = 0, y = r, d = 1 - r;
  const put = (a: number, b: number) => {
    const k = `${a},${b}`;
    if (!seen.has(k)) { seen.add(k); out.push([a, b, d, x, y]); }
  };
  while (x <= y) {
    put(cx + x, cy + y); put(cx + y, cy + x); put(cx - x, cy + y); put(cx - y, cy + x);
    put(cx + x, cy - y); put(cx + y, cy - x); put(cx - x, cy - y); put(cx - y, cy - x);
    if (d < 0) d += 2 * x + 3;
    else { d += 2 * (x - y) + 5; y--; }
    x++;
  }
  return out;
}

const NAMES = { glitched: ["GLITCHED", "SERVER"], climate: ["CLIMATE", "CONTROLLER"], smart: ["SMART-LIFE", "INCLUSION"] };

const scratch = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};
const ctx2d = (c: HTMLCanvasElement, read = false): Ctx => c.getContext("2d", { willReadFrequently: read })!;

function textMask(w: number, h: number, lines: string[], stretch: CanvasFontStretch, read: boolean): HTMLCanvasElement {
  const c = scratch(w, h);
  const x = ctx2d(c, read);
  x.fillStyle = "#000";
  x.textBaseline = "alphabetic";
  const root = getComputedStyle(document.documentElement);
  const fam = root.getPropertyValue("--font-display"), wt = root.getPropertyValue("--display-strong").trim(); // follows the mode
  let size = h / (lines.length * 1.02);
  const set = () => { x.font = `${wt} ${size}px ${fam}`; if ("fontStretch" in x) x.fontStretch = stretch; };
  set();
  const widest = Math.max(...lines.map((l) => x.measureText(l).width));
  size = Math.min(size, (size * (w * 0.88)) / widest);
  set();
  const lh = size * 0.92, top = (h - lh * lines.length) / 2 + size * 0.8;
  lines.forEach((l, i) => x.fillText(l, w * 0.06, top + i * lh));
  return c;
}

const free = (...cs: HTMLCanvasElement[]) => { for (const c of cs) c.width = c.height = 0; };

type Draw = (x: Ctx, W: number, H: number, k: number, c: Colours, seed: number) => void;

const glitched: Draw = (x, W, H, k, c, seed) => {
  const r = rnd(seed);
  const m = textMask(W, H, NAMES.glitched, "condensed", false);
  const t = scratch(W, H);
  const tx = ctx2d(t);
  tx.drawImage(m, 0, 0);
  tx.globalCompositeOperation = "source-in";
  tx.fillStyle = c.ink;
  tx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; ) {
    const bh = Math.round((6 + r() * 30) * k), off = r() < 0.55 ? 0 : Math.round((r() - 0.5) * 90 * k);
    x.drawImage(t, 0, y, W, bh, off, y, W, bh);
    if (r() < 0.12) { x.save(); x.globalCompositeOperation = "source-atop"; x.fillStyle = c.sig; x.fillRect(off, y, W, bh); x.restore(); }
    y += bh;
  }
  free(m, t);
  // midpoint-circle ring, the project's own portal algorithm
  const cs = 6 * k, cx0 = Math.round((W * 0.82) / cs), cy0 = Math.round((H * 0.22) / cs);
  x.fillStyle = c.sig;
  for (const [a, b] of circle(cx0, cy0, 9)) x.fillRect(a * cs, b * cs, cs - k, cs - k);
};

const climate: Draw = (x, W, H, k, c) => {
  const m = textMask(W, H, NAMES.climate, "semi-expanded", true);
  const md = ctx2d(m, true).getImageData(0, 0, W, H).data;
  const cs = Math.round(12 * k);
  x.strokeStyle = c.dim; x.lineWidth = 1;
  x.beginPath(); // one path per colour: thousands of stroke() calls became two
  for (let gx = 0; gx <= W; gx += cs) { x.moveTo(gx + 0.5, 0); x.lineTo(gx + 0.5, H); }
  for (let gy = 0; gy <= H; gy += cs) { x.moveTo(0, gy + 0.5); x.lineTo(W, gy + 0.5); }
  x.stroke();
  x.strokeStyle = c.ink; x.lineWidth = Math.max(1, k); x.beginPath();
  for (let gy = 0; gy < H; gy += cs) {
    for (let gx = 0; gx < W; gx += cs) {
      let a = 0, n = 0;
      for (let sy = 2; sy < cs; sy += 4) {
        for (let sx = 2; sx < cs; sx += 4) {
          const px = gx + sx, py = gy + sy;
          if (px < W && py < H) { a += md[(py * W + px) * 4 + 3]!; n++; }
        }
      }
      const lvl = Math.round((a / (n * 255)) * 4);
      for (let l = 0; l < lvl; l++) {
        const o = ((l + 1) * cs) / (lvl + 1);
        x.moveTo(gx + o, gy + cs); x.lineTo(gx + cs, gy + o);
        if (l % 2) { x.moveTo(gx, gy + o); x.lineTo(gx + o, gy); }
      }
    }
  }
  x.stroke();
  x.fillStyle = c.sig;
  x.fillRect(Math.round(W * 0.06), Math.round(H * 0.86), cs * 6, Math.max(2, k * 2));
  free(m);
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const smart: Draw = (x, W, H, k, c) => {
  const m = textMask(W, H, NAMES.smart, "normal", true);
  const md = ctx2d(m, true).getImageData(0, 0, W, H).data;
  const cs = Math.round(4 * k), dd = cs - (k > 1 ? k : 0);
  const pi = new Path2D(), ps = new Path2D(); // cells are batched per colour, then filled twice
  for (let gy = 0; gy < H; gy += cs) {
    for (let gx = 0; gx < W; gx += cs) {
      const px = Math.min(W - 1, gx + (cs >> 1)), py = Math.min(H - 1, gy + (cs >> 1));
      const cov = md[(py * W + px) * 4 + 3]! / 255;
      const ramp = 0.25 + 0.75 * (gx / W);
      const v = cov ? cov * ramp : (gy / H) * 0.12;
      const t = (BAYER[((gy / cs) & 3) * 4 + ((gx / cs) & 3)]! + 0.5) / 16;
      if (v > t) (cov && gx > W * 0.9 ? ps : pi).rect(gx, gy, dd, dd);
    }
  }
  x.fillStyle = c.ink; x.fill(pi);
  x.fillStyle = c.sig; x.fill(ps);
  free(m);
};

/* Plate ids are the project ids Work.tsx uses. */
const DRAW: Record<string, Draw> = { "glitched-server": glitched, "climate-controller": climate, "smart-life": smart };

/** The stage tokens theme.css defines; the page tokens of the current mode stand in when they are absent. */
function colours(el: HTMLElement): Colours {
  const cs = getComputedStyle(el);
  const t = (a: string, b: string) => cs.getPropertyValue(a).trim() || cs.getPropertyValue(b).trim();
  return { bg: t("--stage-bg", "--panel"), ink: t("--stage-ink", "--ink"), dim: t("--stage-dim", "--rule"), sig: t("--stage-signal", "--signal") };
}

const dprCap = () => (matchMedia("(pointer: coarse)").matches || innerWidth < 900 ? 1.5 : 2);

export async function create(): Promise<PlatesHandle> {
  const items = new Map<HTMLCanvasElement, Item>();
  const seeds = new Map<string, number>();
  let gen = 0, cur: Promise<void> = Promise.resolve(), dead = false;
  let tmp: HTMLCanvasElement | undefined; // downsample target, shared: one plate paints at a time

  const fit = (it: Item) => { it.dpr = budget.size(it.ref.canvas, it.w, it.h, Math.min(devicePixelRatio || 1, dprCap())); };

  function build(it: Item, key: string): PlateEntry {
    const base = scratch(0, 0);
    budget.register(base, { cache: true, onEvict: () => cache.forget(key) });
    try {
      const draw = DRAW[it.ref.id];
      if (!draw) throw new Error(`no plate for "${it.ref.id}"`);
      budget.size(base, it.w, it.h, it.dpr);
      const x = ctx2d(base);
      const c = colours(it.ref.canvas);
      x.fillStyle = c.bg;
      x.fillRect(0, 0, base.width, base.height);
      draw(x, base.width, base.height, base.width / it.w, c, seeds.get(it.ref.id) ?? 11);
      return { key, base, bytes: bytesOf(base), lastUsed: 0, state: "ok" };
    } catch (err) {
      console.warn(`[rr] plate "${it.ref.id}" failed, showing its pending label`, err);
      budget.release(base);
      return { key, base: null, bytes: 0, lastUsed: 0, state: "error" };
    }
  }

  function paint(it: Item) {
    const { canvas } = it.ref;
    if (!it.w || !it.h) return;
    if (!canvas.width) fit(it); // released by the canvas budget while hidden
    const x = ctx2d(canvas);
    const W = canvas.width, H = canvas.height;
    const { mode, fontGen } = store.get();
    const key = `${it.ref.id}|${mode}|${it.w}|${it.h}|${it.dpr}|${fontGen}`;
    let e = cache.get(key);
    if (!e) { e = build(it, key); cache.put(e); }
    it.stale = false;
    const base = e.base;
    if (!base) { x.fillStyle = colours(canvas).bg; x.fillRect(0, 0, W, H); return; } // flat panel; the DOM pending label is the text
    const cell = Math.max(1, Math.round(lerp(28, 1, it.res)));
    if (cell <= 1) { x.imageSmoothingEnabled = true; x.drawImage(base, 0, 0, W, H); return; }
    const s = (tmp ??= scratch(1, 1));
    s.width = Math.max(1, Math.round(W / cell)); s.height = Math.max(1, Math.round(H / cell));
    const sx = ctx2d(s);
    sx.imageSmoothingEnabled = true;
    sx.drawImage(base, 0, 0, s.width, s.height);
    x.imageSmoothingEnabled = false; x.clearRect(0, 0, W, H); x.drawImage(s, 0, 0, W, H);
  }

  /** Paints stale plates that are on screen, one per task; a newer call supersedes an older pass. */
  function schedule(): Promise<void> {
    const g = ++gen;
    const q = document.hidden ? [] : [...items.values()].filter((i) => i.vis && i.stale);
    return (cur = (async () => {
      for (const it of q) {
        await yieldTask();
        if (g !== gen || dead) return;
        if (it.stale) paint(it);
      }
    })());
  }

  const life = new AbortController();
  const ro = new ResizeObserver((es) => {
    for (const e of es) {
      const it = items.get(e.target as HTMLCanvasElement);
      if (!it) continue;
      const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
      if (w === it.w && h === it.h) continue;
      it.w = w; it.h = h;
      if (w && h) fit(it);
      it.stale = true; // a resize clears the backing store
    }
    void schedule();
  });
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      const it = items.get(e.target as HTMLCanvasElement);
      if (it) it.vis = e.isIntersecting;
    }
    void schedule();
  });
  const redraw = () => { for (const it of items.values()) it.stale = true; return schedule(); };
  const unsub = [
    // A mode switch keeps the other mode's bases (keys carry the mode), so switching back is a cache hit.
    store.subscribe("mode", () => void redraw()),
    store.subscribe("fontGen", () => { cache.clear(); void redraw(); }),
  ];
  document.addEventListener("visibilitychange", () => void schedule(), { signal: life.signal });

  function drop(canvas: HTMLCanvasElement) {
    if (!items.delete(canvas)) return;
    ro.unobserve(canvas); io.unobserve(canvas);
    budget.release(canvas);
  }

  return {
    register(r) {
      if (dead) return () => {};
      drop(r.canvas);
      const it: Item = { ref: r, w: 0, h: 0, dpr: 1, res: 1, vis: false, stale: true };
      items.set(r.canvas, it);
      budget.register(r.canvas, { visible: () => it.vis, onEvict: () => { it.stale = true; } });
      ro.observe(r.canvas); io.observe(r.canvas);
      return () => { if (items.get(r.canvas) === it) drop(r.canvas); };
    },
    setRes(canvas, res) {
      const it = items.get(canvas);
      const q = Math.round(clamp(res, 0, 1) * 12) / 12;
      if (!it || q === it.res) return;
      it.res = q;
      if (it.vis && !document.hidden) paint(it);
      else it.stale = true;
    },
    redrawVisible: redraw,
    async ready() {
      let p: Promise<void>;
      do { p = cur; await p; } while (p !== cur);
    },
    reroll(id) {
      seeds.set(id, (Math.random() * 1e6) | 0);
      cache.disposeWhere((k) => k.startsWith(`${id}|`));
      for (const it of items.values()) if (it.ref.id === id) it.stale = true;
      void schedule();
    },
    destroy() {
      if (dead) return;
      dead = true;
      gen++;
      life.abort();
      ro.disconnect(); io.disconnect();
      for (const u of unsub) u();
      for (const c of [...items.keys()]) drop(c);
      cache.clear();
      if (tmp) free(tmp);
    },
  };
}
