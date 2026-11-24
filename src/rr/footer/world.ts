// Footer playground: one World per mode, driven by rr/closing.ts. Units: Raster = pixel cells, Render = CSS px.
// The name sits between two canvases: back (behind the letters) and front (over them). The canvas is chosen by depth, never
// by height: far things go on the back, the few near things and a mover working on one go on the front, at any height.
export interface Palette { paper: string; panel: string; ink: string; ink2: string; mute: string; rule: string; signal: string; trace: string }
/** One visible line of the name in drawing units: cap line, baseline, each letter's extent as [left0, right0, left1, ...], and
 *  the letters themselves, one per extent pair (no spaces; the stop is "."). */
export interface Line { top: number; base: number; l: number[]; ch: string }
export interface World {
  /** Called on create and on every resize, in drawing units; lines run top to bottom. k is the stage scale (--ftr-k): the
   *  host already folds it into the unit, so a world applies it only to sizes it derives from the name (Render's cubes). */
  resize(w: number, h: number, lines: Line[], k?: number): void;
  /** Advance the simulation. dt in seconds, clamped to <= 0.1 by the host. */
  step(dt: number): void;
  /** Paint every back pixel and clear and paint the front; the host clears nothing. */
  draw(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, p: Palette): void;
  /** Pointer input in drawing units. "leave" carries no meaningful coordinates. */
  poke(kind: "move" | "down" | "leave", u: number, v: number): void;
  /** Jump to a composed resting frame (reduced motion). Called before a single draw. */
  still(): void;
  /** A contact link is hovered or focused: i = 0..3 (GitHub, LinkedIn, ArtStation, CV), u = its centre x in drawing units.
   *  i = -1 releases. Subtle and non-blocking. */
  react(i: number, u: number): void;
  /** The email was copied; u = the email's centre x in drawing units. One payoff at a time; ignored while one runs. */
  answer(u: number): void;
}

/** Up to n centres of gaps between letters where a near object `w` wide may stand: it covers at most `max` of any letter's
 *  width, never a letter another pick covers, and the picks spread out (widest gap first, then the farthest from the others). */
export function gaps(lines: Line[], w: number, n: number, max = 0.35): number[] {
  const cand: number[] = []; // centre, width
  for (const ln of lines) for (let i = 2; i + 1 < ln.l.length; i += 2) cand.push(((ln.l[i - 1] ?? 0) + (ln.l[i] ?? 0)) / 2, (ln.l[i] ?? 0) - (ln.l[i - 1] ?? 0));
  const out: number[] = [], used = new Set<number>();
  const span = Math.max(1, ...lines.map((ln) => (ln.l[ln.l.length - 1] ?? 0) - (ln.l[0] ?? 0)));
  while (out.length < n) {
    let best = -1, bs = -1e9;
    for (let k = 0; k < cand.length; k += 2) {
      const x = cand[k] ?? 0;
      let ok = true, d = span / 3;
      for (const o of out) d = Math.min(d, Math.abs(o - x));
      if (d < w * 1.5) continue;
      lines.forEach((ln, li) => {
        for (let i = 0; i + 1 < ln.l.length; i += 2) {
          const a = ln.l[i] ?? 0, b = ln.l[i + 1] ?? 0, ov = Math.min(b, x + w / 2) - Math.max(a, x - w / 2);
          if (ov > 0 && (ov / Math.max(1, b - a) > max || used.has(li * 1000 + i))) ok = false;
        }
      });
      const sc = (cand[k + 1] ?? 0) + d;
      if (ok && sc > bs) { bs = sc; best = x; }
    }
    if (best < 0) break;
    out.push(best);
    lines.forEach((ln, li) => {
      for (let i = 0; i + 1 < ln.l.length; i += 2) if (Math.min(ln.l[i + 1] ?? 0, best + w / 2) > Math.max(ln.l[i] ?? 0, best - w / 2)) used.add(li * 1000 + i);
    });
  }
  return out;
}

if (import.meta.env.DEV) {
  // ten 80-wide letters with 10-wide gaps and a 40-wide word gap after the fifth
  const l: number[] = [];
  for (let i = 0, x = 0; i < 10; i++) { l.push(x, x + 80); x += 90 + (i === 4 ? 30 : 0); }
  const g = gaps([{ top: 0, base: 100, l, ch: "MOHAMMEDPA" }], 40, 3);
  console.assert(g.length === 3 && g[0] === 460 && g[1] === 85 && g[2] === 835, "footer gaps: word gap first, then spread out");
  console.assert(gaps([{ top: 0, base: 100, l, ch: "MOHAMMEDPA" }], 80, 3).join() === "460", "footer gaps: an 80-wide object fits the word gap only");
}
