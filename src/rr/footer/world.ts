// Footer stage: one World per mode (Raster = the pixel city, Render = the cat), each a lazy chunk, driven by rr/closing.ts.
// Units: Raster = pixel cells, Render = CSS px * k.
// The name sits between two canvases: back (behind the letters) and front (over them). The canvas is chosen by depth, never
// by height: far things go on the back, the few near things and a mover working on one go on the front, at any height.
export interface Palette { paper: string; panel: string; ink: string; ink2: string; mute: string; rule: string; signal: string; trace: string }
/** One visible line of the name in drawing units: cap line, baseline, each letter's extent as [left0, right0, left1, ...], and
 *  the letters themselves, one per extent pair (no spaces; the stop is "."). */
export interface Line { top: number; base: number; l: number[]; ch: string }
export interface World {
  /** Called on create and on every resize, in drawing units; lines run top to bottom. k is the stage scale (--ftr-k): the
   *  host already folds it into the unit, so a world applies it only to sizes it derives from the name. */
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
  /** The stop's vertical offset in drawing units (positive = down, 0 at rest), read after step; the host moves the visual dot. */
  bat?(): number;
  /** Render only: the one letter of the last line that is tilted now, [line, index in that line's ch, degrees], else null.
   *  deg > 0 = clockwise about the letter's bottom-right corner (pushed from its left); deg < 0 = counter-clockwise about its
   *  bottom-left. The host wraps that character in a rotated span after step; the stop is never tilted. */
  tilt?(): [line: number, index: number, deg: number] | null;
}
