// Pure step generators for the showcase (rr/showcase). Same grid language as the bench: cell (i, j), centre at (i + 0.5, j + 0.5).
export type Pt = [number, number];

export interface LineStep { x: number; y: number; p: number; move: 0 | 1 | -1 } // move: 0 stay on the minor axis, 1 step it, -1 last cell
export interface LinePlan { steps: LineStep[]; da: number; db: number; steep: boolean; sx: number; sy: number }

/** Bresenham on the major axis: p0 = 2*db - da, p < 0 keeps the minor coordinate (p += 2*db), else steps it (p += 2*(db - da)). */
export function bresenham(x0: number, y0: number, x1: number, y1: number): LinePlan {
  const ax = Math.abs(x1 - x0), ay = Math.abs(y1 - y0), sx = x1 >= x0 ? 1 : -1, sy = y1 >= y0 ? 1 : -1;
  const steep = ay > ax, da = steep ? ay : ax, db = steep ? ax : ay, sa = steep ? sy : sx, sb = steep ? sx : sy;
  let a = steep ? y0 : x0, b = steep ? x0 : y0, p = 2 * db - da;
  const steps: LineStep[] = [];
  for (let i = 0; i <= da; i++) {
    const last = i === da;
    steps.push({ x: steep ? b : a, y: steep ? a : b, p, move: last ? -1 : p >= 0 ? 1 : 0 });
    if (last) break;
    a += sa;
    if (p >= 0) { b += sb; p += 2 * (db - da); } else p += 2 * db;
  }
  return { steps, da, db, steep, sx, sy };
}

export interface DdaStep { x: number; y: number; cx: number; cy: number } // float accumulators, then the rounded cell
export interface DdaPlan { steps: DdaStep[]; n: number; xi: number; yi: number }

/** DDA: n = max(|dx|, |dy|), then add dx/n and dy/n to float accumulators and round to a cell each step. */
export function dda(x0: number, y0: number, x1: number, y1: number): DdaPlan {
  const dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy)) || 1, xi = dx / n, yi = dy / n;
  const steps: DdaStep[] = [];
  let x = x0, y = y0;
  for (let i = 0; i <= n; i++) { steps.push({ x, y, cx: Math.round(x), cy: Math.round(y) }); x += xi; y += yi; }
  return { steps, n, xi, yi };
}

export interface CircStep { x: number; y: number; d: number; move: 0 | 1 | -1 } // move: 0 east (x+1), 1 south-east (x+1, y-1), -1 octant done
/** Midpoint circle, first octant from (0, r): d0 = 1 - r; d < 0 goes east (d += 2x + 3), else south-east (d += 2(x - y) + 5). */
export function midpoint(r: number): CircStep[] {
  const out: CircStep[] = [];
  let x = 0, y = r, d = 1 - r;
  while (x <= y) {
    const east = d < 0;
    out.push({ x, y, d, move: east ? 0 : 1 });
    if (east) d += 2 * x + 3; else { d += 2 * (x - y) + 5; y--; }
    x++;
  }
  out[out.length - 1]!.move = -1;
  return out;
}

/** The 8 octants clockwise from the top: octant k maps the first-octant offset (x, y) to a screen offset (y is down). */
export const OCT: ((x: number, y: number) => Pt)[] = [
  (x, y) => [x, -y], (x, y) => [y, -x], (x, y) => [y, x], (x, y) => [x, y],
  (x, y) => [-x, y], (x, y) => [-y, x], (x, y) => [-y, -x], (x, y) => [-x, -y],
];

/** Every plotted cell of the full circle, deduplicated, in octant order. */
export function circleCells(cx: number, cy: number, r: number): Pt[] {
  const seen = new Set<string>(), out: Pt[] = [];
  for (const f of OCT) for (const s of midpoint(r)) {
    const [dx, dy] = f(s.x, s.y), k = `${cx + dx},${cy + dy}`;
    if (!seen.has(k)) { seen.add(k); out.push([cx + dx, cy + dy]); }
  }
  return out;
}
