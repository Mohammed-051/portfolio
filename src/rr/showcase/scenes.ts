// The three step-by-step demos: Bresenham, DDA, midpoint circle. One 28 x 24 grid, the bench's own grid language.
// Each step has two beats: decide (candidates, the decision variable) then commit (the chosen cell lights).
import { SHOWCASE } from "../../lib/showcaseCopy";
import { bresenham, dda, midpoint, OCT, type LineStep, type Pt } from "./algos.ts";
import type { Env, Scene } from "./types.ts";

export const COLS = 28, ROWS = 24;
const R = SHOWCASE.read;
const INTRO = 450, DECIDE = 0.55;
const LINES: [number, number, number, number][] = [[3, 18, 24, 5], [3, 4, 25, 16], [22, 21, 5, 9], [6, 3, 14, 21], [2, 12, 25, 11], [24, 3, 5, 20]];
const CIRCLES: [number, number, number][] = [[14, 12, 9], [14, 12, 6], [13, 11, 8], [14, 12, 10], [14, 12, 5]];

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], B2 = [0, 2, 3, 1];
/** Ordered dither of one cell at density d (0 to 1): 4 x 4 when the cell is big enough, else 2 x 2. */
export function dither(x: CanvasRenderingContext2D, px: number, py: number, cs: number, d: number, color: string) {
  const m = cs >= 8 ? 4 : 2, n = m * m, k = Math.round(d * n), q = cs / m, bm = m === 4 ? B4 : B2;
  x.fillStyle = color;
  for (let b = 0; b < n; b++) {
    if (bm[b]! >= k) continue;
    const x0 = Math.round(px + (b % m) * q), y0 = Math.round(py + Math.floor(b / m) * q);
    x.fillRect(x0, y0, Math.max(1, Math.round(px + ((b % m) + 1) * q) - x0), Math.max(1, Math.round(py + (Math.floor(b / m) + 1) * q) - y0));
  }
}

const sgn = (v: number) => (v < 0 ? "-" : "+");
const signed = (v: number) => (v < 0 ? `${v}` : `+${v}`);
const mid = (cs: number, v: number) => (v + 0.5) * cs;

function grid(x: CanvasRenderingContext2D, cs: number, e: Env) {
  const W = COLS * cs, H = ROWS * cs;
  x.clearRect(0, 0, W, H);
  x.fillStyle = e.rule;
  for (let i = 0; i <= COLS; i++) x.fillRect(i * cs, 0, 1, H);
  for (let j = 0; j <= ROWS; j++) x.fillRect(0, j * cs, W, 1);
}
/** A plotted cell. Render: inked square inside the grid line. Raster: the whole cell, crisp. */
function cell(x: CanvasRenderingContext2D, cs: number, e: Env, i: number, j: number, color: string) {
  const g = e.raster ? 1 : Math.max(2, Math.round(cs * 0.12));
  x.fillStyle = color;
  x.fillRect(i * cs + g, j * cs + g, cs - (e.raster ? 1 : 2 * g - 1), cs - (e.raster ? 1 : 2 * g - 1));
}
/** A candidate cell: Render a hairline square, Raster a checker dither. */
function candidate(x: CanvasRenderingContext2D, cs: number, e: Env, i: number, j: number) {
  if (e.raster) { dither(x, i * cs + 1, j * cs + 1, cs - 1, 0.5, e.ink2); return; }
  x.strokeStyle = e.ink2;
  x.lineWidth = 1;
  x.strokeRect(i * cs + 2.5, j * cs + 2.5, cs - 4, cs - 4);
}
function ideal(x: CanvasRenderingContext2D, e: Env) {
  x.strokeStyle = e.ink2;
  x.lineWidth = 1;
  x.setLineDash(e.raster ? [4, 3] : []);
}
function dot(x: CanvasRenderingContext2D, e: Env, px: number, py: number, r: number, color: string) {
  x.fillStyle = color;
  if (e.raster) x.fillRect(Math.round(px - r), Math.round(py - r), 2 * r, 2 * r);
  else { x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill(); }
}
function label(x: CanvasRenderingContext2D, e: Env, s: string, px: number, py: number, align: CanvasTextAlign) {
  x.font = `600 11px ${e.font}`;
  x.textAlign = align;
  x.textBaseline = "middle";
  x.fillStyle = e.mute;
  x.fillText(s, Math.round(px), Math.round(py));
}
/** Render eases the ideal line on; Raster draws it in eight whole steps. */
const grow = (t: number, e: Env) => { const p = Math.min(1, t / INTRO); return e.raster ? Math.ceil(p * 8) / 8 : 1 - Math.pow(1 - p, 3); };

interface TL { c: number; m: number; dec: boolean; fin: boolean }
/** Timeline of n cells, one transition m (1 to n-1) per T ms: decide for 55%, then commit. c = cells committed. */
function timeline(t: number, n: number, T: number, t0 = INTRO): TL {
  const u = t - t0;
  if (u < 0) return { c: 0, m: 0, dec: false, fin: false };
  if (u >= (n - 1) * T) return { c: n, m: 0, dec: false, fin: true };
  const m = Math.floor(u / T) + 1, dec = u / T - (m - 1) < DECIDE;
  return { c: dec ? m : m + 1, m, dec, fin: false };
}
const cycle = (i: number, n: number) => (i + 1) % n;
/** Name an endpoint on the side facing away from the line, so the label never sits on a plotted cell. */
const tag = (x: CanvasRenderingContext2D, cs: number, e: Env, s: string, px: number, py: number, qx: number, qy: number) => {
  x.font = `600 11px ${e.font}`;
  const w = x.measureText(s).width, ox = mid(cs, px), oy = mid(cs, py), out = px >= qx ? 1 : -1, room = out > 0 ? (COLS - px) * cs : px * cs;
  if (room > w + 18) return label(x, e, s, ox + out * 10, oy, out > 0 ? "left" : "right");
  const dn = py >= qy ? 1 : -1, cx = Math.min(COLS * cs - w / 2 - 2, Math.max(w / 2 + 2, ox));
  label(x, e, s, cx, oy + dn * 16, "center");
};
const endpoints = (x: CanvasRenderingContext2D, cs: number, e: Env, [x0, y0, x1, y1]: [number, number, number, number]) => {
  dot(x, e, mid(cs, x0), mid(cs, y0), 3, e.ink);
  dot(x, e, mid(cs, x1), mid(cs, y1), 3, e.ink);
  tag(x, cs, e, `A (${x0}, ${y0})`, x0, y0, x1, y1);
  tag(x, cs, e, `B (${x1}, ${y1})`, x1, y1, x0, y0);
};

export function bresScene(start = 0): Scene {
  let li = start % LINES.length, plan = bresenham(...LINES[li]!);
  const T = 210;
  const sc: Scene = {
    cols: COLS, rows: ROWS, loop: true, name: SHOWCASE.alt.bres,
    get duration() { return INTRO + (plan.steps.length - 1) * T; },
    next() { li = cycle(li, LINES.length); plan = bresenham(...LINES[li]!); },
    paint(x, _fx, cs, t, e) {
      const s = plan.steps, L = LINES[li]!, st = timeline(t, s.length, T);
      grid(x, cs, e);
      const g = grow(t, e);
      ideal(x, e);
      x.beginPath();
      x.moveTo(mid(cs, L[0]), mid(cs, L[1]));
      x.lineTo(mid(cs, L[0] + (L[2] - L[0]) * g), mid(cs, L[1] + (L[3] - L[1]) * g));
      x.stroke();
      x.setLineDash([]);
      for (let k = 0; k < st.c; k++) cell(x, cs, e, s[k]!.x, s[k]!.y, k === st.c - 1 && !st.fin ? e.sig : e.ink);
      if (st.dec && st.m) {
        const f = s[st.m - 1]!;
        const c1: Pt = plan.steep ? [f.x, f.y + plan.sy] : [f.x + plan.sx, f.y], c2: Pt = [f.x + plan.sx, f.y + plan.sy];
        candidate(x, cs, e, ...c1);
        candidate(x, cs, e, ...c2);
        dot(x, e, mid(cs, (c1[0] + c2[0]) / 2), mid(cs, (c1[1] + c2[1]) / 2), 2, e.sig);
      }
      endpoints(x, cs, e, L);
    },
    read(t) {
      const s = plan.steps, L = LINES[li]!, st = timeline(t, s.length, T), n = plan.da;
      const cur = st.c ? s[st.c - 1]! : undefined, dc = st.m ? s[st.m - 1]! : undefined;
      const mv = (m: LineStep | undefined) => {
        if (!m || m.move < 0) return st.fin ? R.done : "-";
        const maj = plan.steep ? `y${sgn(plan.sy)}1` : `x${sgn(plan.sx)}1`, min = plan.steep ? `x${sgn(plan.sx)}1` : `y${sgn(plan.sy)}1`;
        return m.move ? `p ≥ 0: ${maj}, ${min}` : `p < 0: ${maj}`;
      };
      return [
        [R.line, `A(${L[0]}, ${L[1]}) to B(${L[2]}, ${L[3]})`],
        [R.major, `${plan.da}, ${plan.db}${plan.steep ? ` (${R.swapped})` : ""}`],
        [R.step, `${st.fin ? n : st.m} of ${n}`],
        [R.cell, cur ? `${cur.x}, ${cur.y}` : "-"],
        ["p", dc ? signed(dc.p) : "-"],
        [R.choice, mv(dc)],
      ];
    },
  };
  return sc;
}

export function ddaScene(start = 1): Scene {
  let li = start % LINES.length, plan = dda(...LINES[li]!);
  const T = 210;
  const sc: Scene = {
    cols: COLS, rows: ROWS, loop: true, name: SHOWCASE.alt.dda,
    get duration() { return INTRO + (plan.steps.length - 1) * T; },
    next() { li = cycle(li, LINES.length); plan = dda(...LINES[li]!); },
    paint(x, _fx, cs, t, e) {
      const s = plan.steps, L = LINES[li]!, st = timeline(t, s.length, T);
      grid(x, cs, e);
      const g = grow(t, e);
      ideal(x, e);
      x.beginPath();
      x.moveTo(mid(cs, L[0]), mid(cs, L[1]));
      x.lineTo(mid(cs, L[0] + (L[2] - L[0]) * g), mid(cs, L[1] + (L[3] - L[1]) * g));
      x.stroke();
      x.setLineDash([]);
      for (let k = 0; k < st.c; k++) cell(x, cs, e, s[k]!.cx, s[k]!.cy, k === st.c - 1 && !st.fin ? e.sig : e.ink);
      // The float accumulators: a trail of exact points, the newest ringed, with its leader to the rounded cell.
      for (let k = 0; k < st.c; k++) dot(x, e, mid(cs, s[k]!.x), mid(cs, s[k]!.y), 2, e.mute);
      if (st.m && st.dec) dot(x, e, mid(cs, s[st.m]!.x), mid(cs, s[st.m]!.y), 3, e.sig);
      if (st.m && !st.dec) {
        const h = s[st.m]!;
        x.strokeStyle = e.sig;
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(mid(cs, h.x), mid(cs, h.y));
        x.lineTo(mid(cs, h.cx), mid(cs, h.cy));
        x.stroke();
        dot(x, e, mid(cs, h.x), mid(cs, h.y), 3, e.sig);
      }
      endpoints(x, cs, e, L);
    },
    read(t) {
      const s = plan.steps, L = LINES[li]!, st = timeline(t, s.length, T), n = plan.n;
      const h = st.c ? s[st.fin ? n : st.m] : undefined;
      return [
        [R.line, `A(${L[0]}, ${L[1]}) to B(${L[2]}, ${L[3]})`],
        [R.steps, `${n} = max(|dx|, |dy|)`],
        [R.inc, `x ${signed(+plan.xi.toFixed(3))}, y ${signed(+plan.yi.toFixed(3))}`],
        [R.step, `${st.fin ? n : st.m} of ${n}`],
        [R.exact, h ? `${h.x.toFixed(3)}, ${h.y.toFixed(3)}` : "-"],
        [R.round, h && !st.dec ? `${h.cx}, ${h.cy}` : "-"],
      ];
    },
  };
  return sc;
}

const OFF = ["(x, -y)", "(y, -x)", "(y, x)", "(x, y)", "(-x, y)", "(-y, x)", "(-y, -x)", "(-x, -y)"];
const AXIS: ("d1" | "h" | "d2" | "v")[] = ["d1", "h", "d2", "v", "d1", "h", "d2"];
const AXN = { d1: R.diagonal, d2: R.diagonal, h: R.horizontal, v: R.vertical };

export function circleScene(start = 0): Scene {
  let ci = start % CIRCLES.length, steps = midpoint(CIRCLES[ci]![2]);
  const TA = 400, TM = 520, HOLD = 300;
  const A = () => (steps.length - 1) * TA;
  const sc: Scene = {
    cols: COLS, rows: ROWS, loop: true, name: SHOWCASE.alt.circle,
    get duration() { return INTRO + A() + HOLD + 7 * TM; },
    next() { ci = cycle(ci, CIRCLES.length); steps = midpoint(CIRCLES[ci]![2]); },
    paint(x, _fx, cs, t, e) {
      const [cx, cy, r] = CIRCLES[ci]!;
      const st = timeline(t, steps.length, TA), v = t - INTRO - A() - HOLD;
      const j = v < 0 ? 0 : Math.min(7, Math.floor(v / TM) + 1), fin = v >= 7 * TM;
      grid(x, cs, e);
      const g = grow(t, e);
      ideal(x, e);
      x.beginPath();
      x.arc(mid(cs, cx), mid(cs, cy), r * cs, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g);
      x.stroke();
      // The four axes of symmetry, once the mirroring starts; the one being reflected across is drawn in full ink.
      if (v >= 0) {
        const px = mid(cs, cx), py = mid(cs, cy), L = (r + 2) * cs;
        const seg = (a: "d1" | "h" | "d2" | "v", on: boolean) => {
          const [ux, uy] = a === "h" ? [1, 0] : a === "v" ? [0, 1] : a === "d1" ? [1, -1] : [1, 1], k = a === "d1" || a === "d2" ? Math.SQRT1_2 : 1;
          x.strokeStyle = on ? e.ink : e.rule;
          x.lineWidth = on ? 1.5 : 1;
          x.setLineDash(on ? [] : [4, 3]);
          x.beginPath();
          x.moveTo(px - ux * k * L, py - uy * k * L);
          x.lineTo(px + ux * k * L, py + uy * k * L);
          x.stroke();
        };
        for (const a of ["d1", "h", "d2", "v"] as const) seg(a, !fin && j > 0 && a === AXIS[j - 1]);
        x.setLineDash([]);
      }
      const plot = (k: number, upto: number, color: string) => {
        for (let q = 0; q < upto; q++) { const [dx, dy] = OCT[k]!(steps[q]!.x, steps[q]!.y); cell(x, cs, e, cx + dx, cy + dy, color); }
      };
      for (let k = 1; k <= 7; k++) if (j >= k) plot(k, steps.length, !fin && k === j ? e.sig : e.ink);
      plot(0, st.c, e.ink);
      if (v < 0 && st.c && !st.fin) { const h = steps[st.c - 1]!; cell(x, cs, e, cx + h.x, cy - h.y, e.sig); }
      if (v < 0 && st.dec && st.m) {
        const f = steps[st.m - 1]!;
        candidate(x, cs, e, cx + f.x + 1, cy - f.y);
        candidate(x, cs, e, cx + f.x + 1, cy - f.y + 1);
        dot(x, e, mid(cs, cx + f.x + 1), mid(cs, cy - f.y + 0.5), 2, e.sig);
        // Ghosts: where the other seven octants will put this cell.
        for (let k = 1; k <= 7; k++) { const [dx, dy] = OCT[k]!(f.x, f.y); candidate(x, cs, e, cx + dx, cy + dy); }
      }
      dot(x, e, mid(cs, cx), mid(cs, cy), 2, e.ink);
      label(x, e, `C (${cx}, ${cy}) r ${r}`, mid(cs, cx) + 8, mid(cs, cy) + 14, "left");
    },
    read(t) {
      const [cx, cy, r] = CIRCLES[ci]!;
      const st = timeline(t, steps.length, TA), v = t - INTRO - A() - HOLD, n = steps.length;
      const j = v < 0 ? 0 : Math.min(7, Math.floor(v / TM) + 1), fin = v >= 7 * TM;
      const dc = st.m ? steps[st.m - 1] : undefined, cur = st.c ? steps[st.c - 1] : undefined;
      const mv = !dc || dc.move < 0 ? "-" : dc.move ? `d ≥ 0: x+1, y-1` : `d < 0: x+1`;
      return [
        [R.circle, `C(${cx}, ${cy}), r ${r}`],
        [R.octant, `${fin ? 8 : j + 1} of 8`],
        [R.step, `${st.fin || v >= 0 ? n : st.m} of ${n}`],
        [v >= 0 ? R.offset : R.cell, v >= 0 ? OFF[fin ? 7 : j]! : cur ? `${cur.x}, ${cur.y}` : "-"],
        ["d", v >= 0 || !dc ? "-" : signed(dc.d)],
        [v >= 0 ? R.mirror : R.choice, v >= 0 ? (fin ? R.done : `${R.across} ${AXN[AXIS[j - 1] ?? "h"]}`) : mv],
      ];
    },
  };
  return sc;
}
