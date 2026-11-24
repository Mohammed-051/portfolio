// Work ring maths. Pure, no DOM.

/** Rounds up to a multiple of 8. */
export const ceil8 = (v: number): number => Math.ceil(v / 8) * 8;

/** Modulo that is never negative. */
export const mod = (v: number, n: number): number => ((v % n) + n) % n;

/** Wraps v into [lo, hi). */
export const wrap = (v: number, lo: number, hi: number): number => lo + mod(v - lo, hi - lo);

/** Row pitch: max(72, ceil8(avail / (n - 1))). */
export const pitch = (avail: number, n: number): number => Math.max(72, ceil8(avail / (n - 1)));

/** Clip height: min(avail, (n - 1) * p). The wrapping row then sits at or beyond the clip edge. */
export const clipHeight = (avail: number, p: number, n: number): number => Math.min(avail, (n - 1) * p);

/** Centre of row i from the reading line at offset o. Raster rounds to 8 px before the wrap. */
export function rowY(i: number, o: number, p: number, n: number, raster: boolean): number {
  const v = (i - o) * p;
  const L = n * p;
  return wrap(raster ? Math.round(v / 8) * 8 : v, -L / 2, L / 2);
}

/** Unwrapped active row: the whole number nearest o, changed only when o is more than 0.55 of a row from prev. */
export const activeIndex = (o: number, prev: number): number => (Math.abs(o - prev) > 0.55 ? Math.round(o) : prev);

/** Arrow, Prev or Next from unwrapped active k. With no extra offset and the target inside the lap, the page scrolls;
 *  otherwise the extra offset moves one row. The last row of the lap (t = n) counts as outside, so Next on W.06 turns
 *  the ring without moving the page. */
export function stepTarget(k: number, e: number, dir: 1 | -1, n: number): { scrollTo: number } | { extra: number } {
  const t = k + dir;
  return e === 0 && t >= 0 && t < n ? { scrollTo: t } : { extra: e + dir };
}
