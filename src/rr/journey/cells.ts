// Journey shared helpers: mode-aware eases, the 8px cell, the scrub binder and the Bresenham plot.
import type { gsap as GsapCore } from "gsap";
import type { ScrollTrigger as ScrollTriggerClass } from "gsap/ScrollTrigger";
import { store } from "../store.ts";

export type Win = [start: string, end: string];
export interface Ctx {
  ST: typeof ScrollTriggerClass;
  gsap: typeof GsapCore;
  desk: boolean;                  // store.layout === "pin"
  offs: (() => void)[];           // cleanup, run once by teardown
  redraw: (() => void)[];         // re-apply every scrub (mode flip, fonts)
  fonts: (() => void)[];          // font-sensitive re-measure (split chars)
}

/** Read live: a wipe can flip the mode at any time, so nothing caches it. */
export const raster = () => store.get().mode === "raster";
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const snap = (px: number) => Math.round(px / 8) * 8;
export const stepped = (n: number) => (p: number) => Math.floor(p * n) / n; // p = 1 gives exactly 1
export const out2 = (p: number) => 1 - (1 - p) ** 2;
export const out3 = (p: number) => 1 - (1 - p) ** 3;
export const out4 = (p: number) => 1 - (1 - p) ** 4;
export const io1 = (p: number) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) ** 2);
export const io2 = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - 4 * (1 - p) ** 3);
/** Render: the smooth curve. Raster: n hard steps. */
export const pick = (smooth: (p: number) => number, n: number) => (p: number) => (raster() ? stepped(n)(p) : smooth(p));
export const set = (el: HTMLElement, name: string, v: number | string) => el.style.setProperty(name, String(v));

/** One scroll-linked driver: apply(progress) runs on scroll, on refresh and whenever redraw runs. Lenis already smooths, so no scrub tween. */
export function scrub(c: Ctx, trigger: Element, [start, end]: Win, apply: (p: number) => void, vars: Partial<Parameters<Ctx["ST"]["create"]>[0]> = {}) {
  const st = c.ST.create({
    trigger, start, end, invalidateOnRefresh: true, refreshPriority: -1,
    onUpdate: (s) => apply(s.progress),
    onRefresh: (s) => apply(s.progress),
    ...vars,
  });
  apply(st.progress);
  c.redraw.push(() => apply(st.progress));
  c.offs.push(() => st.kill());
  return st;
}

/** Bresenham on the cell grid, from (0, rows-1) to (cols-1, 0). */
export function plotCells(cols: number, rows: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = cols - 1, dy = rows - 1;
  let err = 0, y = rows - 1;
  for (let x = 0; x < cols; x++) {
    out.push([x, y]);
    err += dy;
    if (2 * err >= dx && y > 0) { y--; err -= dx; }
  }
  return out;
}
