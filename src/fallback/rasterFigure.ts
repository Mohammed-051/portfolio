/* Pure cell geometry for the Glitched Server diagram, shared by Raster.tsx and the generated no-JS page.
 * No imports, no DOM: vite.config.ts reaches this file at build time. */

export type P = [number, number];
export const W = 24;
export const H = 18;

/** Bresenham's integer line, all octants. */
export function bresenham([x0, y0]: P, [x1, y1]: P): P[] {
  const pts: P[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) return pts;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Midpoint circle: one octant walked, mirrored eight ways, sorted by angle so it draws round. */
export function midpoint([cx, cy]: P, r: number): P[] {
  const seen = new Map<string, P>();
  for (let x = r, y = 0, d = 1 - r; x >= y; ) {
    for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]] as P[]) {
      seen.set(`${a},${b}`, [cx + a, cy + b]);
    }
    y++;
    if (d < 0) d += 2 * y + 1;
    else {
      x--;
      d += 2 * (y - x) + 1;
    }
  }
  return [...seen.values()].sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
}

export const A: P = [1, 16];
export const B: P = [11, 2];
export const C: P = [17, 10];
export const R = 5;
export const LINE = bresenham(A, B);
export const CIRCLE = midpoint(C, R);
