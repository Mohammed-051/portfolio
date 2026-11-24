// The portrait tab: a stylized portrait, sampled to a coarse grid and cut to four tones, then built from the
// same primitives as the other tabs: Bresenham outline, midpoint-circle highlights, filled boxes, DDA scanline spans.
// Every masked cell is claimed by exactly one primitive; the scene reveals them in primitive order, incrementally.
import { SHOWCASE } from "../../lib/showcaseCopy";
import { bresenham, circleCells, type Pt } from "./algos.ts";
import { dither } from "./scenes.ts";
import type { Env, Row, Scene } from "./types.ts";

const R = SHOWCASE.read, P = SHOWCASE.prim;
export const C = 56, TONES = 4, DURATION = 7200;
const NAMES = [P.line, P.circle, P.box, P.span] as const;

interface Op { kind: 0 | 1 | 2 | 3; cells: number[]; geo: number[]; info: string } // line, circle, box, span
export interface Plan { rows: number; tone: Uint8Array; ops: Op[]; order: number[]; kind: Uint8Array }

/** Moore-neighbour trace of the outer contour of the mask, clockwise from its top-left cell, as a closed loop of cells. */
function trace(tone: Uint8Array, rows: number): Pt[] {
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < C && j < rows && tone[j * C + i]! > 0;
  const s = tone.findIndex((v) => v > 0);
  if (s < 0) return [];
  const D: Pt[] = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
  const out: Pt[] = [[s % C, (s / C) | 0]];
  let [cx, cy] = out[0]!, b = 0;
  for (let guard = 0; guard < C * rows * 8; guard++) {
    let k = 1;
    while (k <= 8 && !at(cx + D[(b + k) % 8]![0], cy + D[(b + k) % 8]![1])) k++;
    if (k > 8) break;
    const f = D[(b + k) % 8]!, p = D[(b + k - 1) % 8]!;
    cx += f[0];
    cy += f[1];
    b = D.findIndex((d) => d[0] === p[0] - f[0] && d[1] === p[1] - f[1]);
    out.push([cx, cy]);
    if (cx === out[0]![0] && cy === out[0]![1]) break;
  }
  return out;
}

/** Three brightest, well separated spots of the 3 x 3 mean luma, away from the silhouette edge. */
function peaks(tone: Uint8Array, luma: Float32Array, rows: number): Pt[] {
  const all: [number, number, number][] = [];
  for (let j = 4; j < rows - 4; j++) for (let i = 4; i < C - 4; i++) {
    let sum = 0, ok = true;
    for (let v = -1; v <= 1 && ok; v++) for (let u = -1; u <= 1; u++) { const q = (j + v) * C + i + u; if (!tone[q]) { ok = false; break; } sum += luma[q]!; }
    if (ok) all.push([i, j, sum / 9]);
  }
  all.sort((a, b) => b[2] - a[2]);
  const out: Pt[] = [];
  for (const [i, j] of all) if (out.length < 3 && out.every(([a, b]) => Math.hypot(a - i, b - j) >= 10)) out.push([i, j]);
  return out;
}

/** Partition the masked cells (tone > 0) into primitives, in drawing order. */
export function plan(tone: Uint8Array, luma: Float32Array, rows: number): Plan {
  const done = new Uint8Array(C * rows), kind = new Uint8Array(C * rows), ops: Op[] = [];
  const ok = (i: number, j: number) => i >= 0 && j >= 0 && i < C && j < rows && tone[j * C + i]! > 0 && !done[j * C + i];
  const add = (k: Op["kind"], pts: Pt[], geo: number[], info: string) => {
    const cells = pts.filter(([i, j]) => ok(i, j)).map(([i, j]) => j * C + i);
    if (!cells.length) return;
    for (const c of cells) { done[c] = 1; kind[c] = k; }
    ops.push({ kind: k, cells, geo, info });
  };

  // 1. Outline: the contour, cut greedily into the longest runs that are exactly a Bresenham line.
  const P0 = trace(tone, rows), L = P0.length - 1;
  for (let i = 0; i < L;) {
    let best = i + 1;
    for (let j = i + 1; j <= L; j++) {
      const st = bresenham(P0[i]![0], P0[i]![1], P0[j]![0], P0[j]![1]).steps;
      if (st.length !== j - i + 1 || st.some((s, q) => s.x !== P0[i + q]![0] || s.y !== P0[i + q]![1])) break;
      best = j;
    }
    const [a, b] = [P0[i]!, P0[best]!];
    add(0, bresenham(a[0], a[1], b[0], b[1]).steps.map((s): Pt => [s.x, s.y]), [a[0], a[1], b[0], b[1]], `A(${a[0]}, ${a[1]}) to B(${b[0]}, ${b[1]})`);
    i = best;
  }
  // 2. Highlights: a midpoint-circle ring on each bright spot.
  peaks(tone, luma, rows).forEach(([cx, cy], k) => {
    const r = k ? 2 : 3;
    add(1, circleCells(cx, cy, r), [cx, cy, r], `C(${cx}, ${cy}) r ${r}`);
  });
  // 3. Boxes: first-fit rectangles of one tone, at least 2 x 2 and 6 cells.
  for (let j = 0; j < rows; j++) for (let i = 0; i < C; i++) {
    if (!ok(i, j)) continue;
    const t = tone[j * C + i]!, same = (u: number, v: number) => ok(u, v) && tone[v * C + u] === t;
    let w = 1, h = 1;
    while (same(i + w, j)) w++;
    while (Array.from({ length: w }, (_, q) => i + q).every((u) => same(u, j + h))) h++;
    if (w < 2 || h < 2 || w * h < 6) continue;
    add(2, Array.from({ length: w * h }, (_, q): Pt => [i + (q % w), j + Math.floor(q / w)]), [i, j, w, h], `${w} x ${h} at (${i}, ${j})`);
  }
  // 4. Spans: what is left, as runs of one tone along each row.
  for (let j = 0; j < rows; j++) for (let i = 0; i < C;) {
    if (!ok(i, j)) { i++; continue; }
    const t = tone[j * C + i]!;
    let e = i;
    while (ok(e + 1, j) && tone[j * C + e + 1] === t) e++;
    add(3, Array.from({ length: e - i + 1 }, (_, q): Pt => [i + q, j]), [j, i, e], `y ${j}, x ${i} to ${e}`);
    i = e + 1;
  }
  const order = ops.flatMap((o) => o.cells);
  if (import.meta.env.DEV) console.assert(order.length === tone.reduce((n, v) => n + (v ? 1 : 0), 0) && new Set(order).size === order.length, "Portrait: primitives do not partition the figure");
  return { rows, tone, ops, order, kind };
}

/** Block-average the image to C columns (alpha weighted luma), mask by coverage, cut to TONES by percentile. */
async function sample(): Promise<{ tone: Uint8Array; luma: Float32Array; rows: number }> {
  const img = new Image();
  img.src = "/portrait/portrait-px.png";
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight, rows = Math.round((C * H) / W);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, W, H).data;
  cv.width = cv.height = 0;
  const luma = new Float32Array(C * rows).fill(-1);
  for (let j = 0; j < rows; j++) for (let i = 0; i < C; i++) {
    const x0 = Math.floor((i * W) / C), x1 = Math.max(x0 + 1, Math.floor(((i + 1) * W) / C));
    const y0 = Math.floor((j * H) / rows), y1 = Math.max(y0 + 1, Math.floor(((j + 1) * H) / rows));
    let a = 0, l = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const k = (y * W + x) * 4, w = px[k + 3]! / 255;
      a += w;
      l += w * (0.299 * px[k]! + 0.587 * px[k + 1]! + 0.114 * px[k + 2]!);
    }
    if (a / ((x1 - x0) * (y1 - y0)) >= 0.43) luma[j * C + i] = l / a;
  }
  const s = Array.from(luma).filter((v) => v >= 0).sort((p, q) => p - q);
  const th = Array.from({ length: TONES - 1 }, (_, k) => s[Math.floor((s.length * (k + 1)) / TONES)]!);
  const tone = Uint8Array.from(luma, (v) => (v < 0 ? 0 : 1 + th.filter((t) => t <= v).length));
  return { tone, luma, rows };
}

const dens = (tone: number, kind: number, raster: boolean) =>
  kind === 1 ? 1 : Math.max(kind === 0 ? 0.6 : 0.12, 0.12 + (0.88 * (raster ? tone - 1 : TONES - tone)) / (TONES - 1));

export async function portraitScene(): Promise<Scene> {
  const { tone, luma, rows } = await sample();
  const pl = plan(tone, luma, rows), { ops, order } = pl, total = order.length;
  // Time per primitive: lines and rings read cell by cell, boxes and spans go by faster. Normalized to DURATION.
  const wt = ops.map((o) => [3 + o.cells.length * 0.6, 4 + o.cells.length * 0.9, 2 + o.cells.length * 0.12, 0.6 + o.cells.length * 0.1][o.kind]!);
  const sum = wt.reduce((a, b) => a + b, 0);
  const t0: number[] = [], first: number[] = [];
  let acc = 0, cum = 0;
  ops.forEach((o, k) => { t0.push(acc); first.push(cum); acc += (wt[k]! / sum) * DURATION; cum += o.cells.length; });
  const at = (t: number) => { // index of the primitive running at t
    let lo = 0, hi = ops.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (t0[m]! <= t) lo = m; else hi = m - 1; }
    return lo;
  };
  const shown = (t: number) => {
    if (t >= DURATION) return total;
    if (t <= 0) return 0;
    const k = at(t), len = (wt[k]! / sum) * DURATION;
    return Math.min(total, first[k]! + Math.ceil(Math.min(1, (t - t0[k]!) / len) * ops[k]!.cells.length));
  };

  let drawn = 0, last = "", dirty = true;
  const mid = (cs: number, v: number) => (v + 0.5) * cs;
  const sc: Scene = {
    cols: C, rows, loop: false, name: SHOWCASE.alt.portrait, duration: DURATION,
    invalidate() { dirty = true; },
    paint(x, fx, cs, t, e: Env) {
      const n = shown(t), key = `${cs}|${e.raster}|${e.ink}`;
      if (dirty || key !== last || n < drawn) { x.clearRect(0, 0, C * cs, rows * cs); drawn = 0; last = key; dirty = false; }
      const g = cs >= 8 ? 1 : 0;
      x.fillStyle = e.ink;
      for (; drawn < n; drawn++) {
        const c = order[drawn]!, i = c % C, j = (c / C) | 0, d = dens(tone[c]!, pl.kind[c]!, e.raster);
        if (e.raster) { dither(x, i * cs + g, j * cs + g, cs - g, d, e.ink); continue; }
        x.globalAlpha = d;
        x.fillRect(i * cs + g, j * cs + g, cs - g, cs - g);
        x.globalAlpha = 1;
      }
      // Live geometry of the running primitive, in signal, on the overlay.
      fx.clearRect(0, 0, C * cs, rows * cs);
      if (t <= 0 || t >= DURATION || !n) return;
      const o = ops[at(t)]!, [a, b, c, d] = o.geo;
      fx.strokeStyle = fx.fillStyle = e.sig;
      fx.lineWidth = 1;
      fx.beginPath();
      if (o.kind === 0) { fx.moveTo(mid(cs, a!), mid(cs, b!)); fx.lineTo(mid(cs, c!), mid(cs, d!)); }
      else if (o.kind === 1) fx.arc(mid(cs, a!), mid(cs, b!), c! * cs, 0, Math.PI * 2);
      else if (o.kind === 2) fx.rect(a! * cs + 0.5, b! * cs + 0.5, c! * cs - 1, d! * cs - 1);
      else { fx.moveTo(b! * cs, mid(cs, a!)); fx.lineTo((c! + 1) * cs, mid(cs, a!)); }
      fx.stroke();
      const h = order[n - 1]!;
      fx.strokeRect((h % C) * cs + 0.5, ((h / C) | 0) * cs + 0.5, cs - 1, cs - 1);
    },
    read(t): Row[] {
      const n = shown(t), fin = t >= DURATION, k = n ? at(t) : -1, o = ops[k];
      return [
        [R.grid, `${C} x ${rows}`],
        [R.tones, String(TONES)],
        [R.algo, fin ? R.done : o ? NAMES[o.kind] : "-"],
        [R.op, `${fin ? ops.length : k + 1} of ${ops.length}`],
        [R.cells, `${n} of ${total}`],
        [R.params, fin || !o ? "-" : o.info],
      ];
    },
  };
  return sc;
}
