// Render-mode footer garden: ink line-art plants cut from one atlas, laid out around the last line of the name in three layers
// (back canvas: edge clusters, vines, gap peekers; front canvas: the low hiding spots). Each plant is a rustle spring.
import type { Line, Palette } from "./world.ts";

/** "name x y w h [R|L|F]" rows to {name: [x, y, w, h, facing]}; facing R = 1, L = -1, F = 0. */
export const parse = (s: string) =>
  Object.fromEntries(s.split(";").map((r) => { const [n = "", ...v] = r.split(" "); return [n, v.map((x) => (x === "R" ? 1 : x === "L" ? -1 : x === "F" ? 0 : +x))]; })) as Record<string, number[]>;

const M = parse("potted_fern 617 1 458 442;hanging_vine 1 1 298 555;tall_broadleaf 301 1 314 489;wild_grass 1077 1 439 431;leafy_turf 350 947 513 260;botanical_shrub 593 558 385 339;wild_undergrowth 980 558 558 338;scratching_post 1540 558 226 329;woven_basket 1 947 347 325;leafy_stems 1518 1 430 394;dainty_foliage 305 558 286 354;fine_sprigs 1 558 302 387");

/** s: scale, f: flip, t: hangs from y, a/v: rustle angle and velocity (deg), b: box [x0, y0, x1, y1]. */
export interface Plant { n: string; x: number; y: number; s: number; f: number; t: boolean; a: number; v: number; ph: number; b: [number, number, number, number] }

const mk = (n: string, x: number, y: number, h: number, f = 1, t = false, mw = 1e9): Plant => {
  const m = M[n]!, s = Math.min(h / m[3]!, mw / m[2]!), w = m[2]! * s, hh = m[3]! * s;
  return { n, x, y, s, f, t, a: 0, v: 0, ph: x * .013, b: [x - w / 2, t ? y : y - hh, x + w / 2, t ? y + hh : y] };
};

/** All sizes follow cap (cap line to baseline); positions follow the letters. Fewer pieces under 620 units. No randomness. */
export function layout(W: number, L: Line) {
  const cap = L.base - L.top, g = L.base, yb = g + .04 * cap, l = L.l, nc = (l.length >> 1) - (L.ch.endsWith(".") ? 1 : 0), nar = W < 620;
  const x0 = l[0] ?? 0, x1 = l[l.length - 1] ?? W, bk: Plant[] = [], fr: Plant[] = [];
  let gi = 0, gw = 0;
  for (let i = 0; i < nc - 1; i++) { const w = l[2 * i + 2]! - l[2 * i + 1]!; if (w > gw) { gw = w; gi = i; } }
  const gc = (i: number) => { const j = Math.min(i, nc - 2); return (l[2 * j + 1]! + l[2 * j + 2]!) / 2; };
  type Row = [string, number, number];
  // back: peekers behind the gaps between letters, edge clusters, vines in the top corners
  const gaps: Row[] = nc > 1 ? [["wild_grass", gi, 0], ["fine_sprigs", Math.round(nc * .25), 0], ["leafy_stems", Math.round(nc * .75), 0]] : [];
  for (const [nm, i] of gaps.slice(0, nar ? 1 : 3)) bk.push(mk(nm, gc(i), g, .45 * cap));
  const lc: Row[] = nar ? [["potted_fern", .5, 1.1]] : [["potted_fern", .5, 1.15], ["tall_broadleaf", 1.15, 1.3], ["scratching_post", 1.7, .8]];
  const rc: Row[] = nar ? [["woven_basket", .4, .7], ["botanical_shrub", .95, .9]] : [["woven_basket", .4, .7], ["botanical_shrub", .95, .9], ["leafy_stems", 1.5, 1], ["dainty_foliage", 2, 1.1]];
  lc.forEach(([nm, c, h], i) => bk.push(mk(nm, c * cap, g, h * cap, i % 2 ? -1 : 1)));
  rc.forEach(([nm, c, h], i) => bk.push(mk(nm, W - c * cap, g, h * cap, i % 2 ? 1 : -1)));
  bk.push(mk("hanging_vine", .3 * cap, 0, 1.1 * cap, 1, true));
  if (!nar) bk.push(mk("hanging_vine", W - .3 * cap, 0, 1.1 * cap, -1, true));
  // front hiding spots: left edge, the word gap, right edge (never over the stop, which is the last letter)
  let lr = x0 + .1 * cap;
  for (const [nm, h] of (nar ? [["leafy_turf", .36]] : [["leafy_turf", .36], ["woven_basket", .42]]) as [string, number][]) {
    const m = M[nm]!, w = (h * cap * m[2]!) / m[3]!, r = Math.max(lr, w);
    fr.push(mk(nm, r - w / 2, yb, h * cap)); lr = r - w * .6;
  }
  if (nc > 1) fr.push(mk("wild_grass", gc(gi), yb, .45 * cap, 1, false, Math.max(gw, .25 * cap)));
  // right edge: after the stop when there is room, else over the foot of the last letter (the outer-edge exception), never on the stop
  const sl = L.ch.endsWith(".") ? l[l.length - 2]! : x1;
  let rr = W - x1 > .5 * cap ? W - .05 * cap : sl - .08 * cap;
  for (const [nm, h] of (nar ? [["botanical_shrub", .4]] : [["botanical_shrub", .42], ["wild_undergrowth", .36]]) as [string, number][]) {
    const m = M[nm]!, w = (h * cap * m[2]!) / m[3]!, r = Math.min(rr, W - .05 * cap);
    if (r - w < x0 + .5 * cap) continue;
    fr.push(mk(nm, r - w / 2, yb, h * cap, nm === "botanical_shrub" ? -1 : 1)); rr = r - w * .6;
  }
  return { bk, fr };
}

if (import.meta.env.DEV) {
  const l: number[] = [];
  for (let i = 0; i < 15; i++) l.push(100 + i * 50, 140 + i * 50);
  const { bk, fr } = layout(1000, { top: 100, base: 400, l, ch: "MOHAMMEDPARVEZ." });
  console.assert(bk.length > 4 && fr.length >= 4 && fr.every((p) => p.b[2] <= l[28]! || p.b[0] >= l[29]!), "garden: layout is thin or a front plant covers the stop");
}

export const kick = (p: Plant, v: number) => { p.v = Math.max(-120, Math.min(120, p.v + v)); };

/** Rustle springs (deg), underdamped: a kicked plant wobbles a few times. */
export function sway(ps: Plant[], d: number) {
  const n = Math.max(1, Math.ceil(d / .016)), h = d / n;
  for (const p of ps) for (let i = 0; i < n; i++) { p.v += (-70 * p.a - 4 * p.v) * h; p.a += p.v * h; }
}

let tk = "", tc: HTMLCanvasElement | null = null;
const rgb = (col: string) => {
  const c = document.createElement("canvas"); c.width = c.height = 1;
  const x = c.getContext("2d")!; x.fillStyle = col; x.fillRect(0, 0, 1, 1);
  return x.getImageData(0, 0, 1, 1).data;
};
/** The atlas is grey line art: grey 0 becomes ink, grey 255 (opaque interiors) becomes paper. Cached per palette. */
export function tint(img: HTMLImageElement, p: Palette) {
  const k = p.ink + p.paper;
  if (tc && tk === k) return tc;
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), q = d.data, a = rgb(p.ink), b = rgb(p.paper);
  for (let i = 0; i < q.length; i += 4) {
    const t = q[i]! / 255;
    for (let j = 0; j < 3; j++) q[i + j] = a[j]! + (b[j]! - a[j]!) * t;
  }
  x.putImageData(d, 0, 0); tk = k;
  return (tc = c);
}

/** amp scales the idle breeze (under 1 degree); 0 = at rest. */
export function draw(c: CanvasRenderingContext2D, ps: Plant[], src: CanvasImageSource | null, T: number, amp: number) {
  if (!src) return;
  for (const p of ps) {
    const m = M[p.n]!, w = m[2]!, h = m[3]!, a = ((p.a + amp * .35 * (Math.sin(T * .8 + p.ph) + .6 * Math.sin(T * 1.7 + 2.3 * p.ph))) * Math.PI) / 180;
    c.save(); c.translate(p.x, p.y); c.transform(1, 0, -.5 * Math.sin(a), 1, 0, 0); c.rotate(a); c.scale(p.f * p.s, p.s);
    c.drawImage(src, m[0]!, m[1]!, w, h, -w / 2, p.t ? 0 : -h, w, h);
    c.restore();
  }
}
