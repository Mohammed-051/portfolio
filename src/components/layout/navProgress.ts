/** Compaction: holds to 0.2 vh, then eases out (cubic) to 1 by 0.8 vh; Raster snaps to eighths;
 *  reduced motion flips at 0.2 vh. Reads scrollY (Lenis moves the native scroll), so there is no second smoother. */
export function navProgress(y: number, raster: boolean, calm: boolean) {
  if (calm) return y >= 0.2 ? 1 : 0;
  const p = Math.min(1, Math.max(0, (y - 0.2) / 0.6)), e = 1 - (1 - p) ** 3;
  return raster ? Math.round(e * 8) / 8 : e;
}
if (import.meta.env.DEV) console.assert(navProgress(0.2, false, false) === 0 && navProgress(0.8, false, false) === 1 && navProgress(0.5, true, false) === 7 / 8 && navProgress(0.3, false, true) === 1, "navProgress: off spec");
