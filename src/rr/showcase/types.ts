// Shared shapes for the showcase scenes (type-only, erased at build).
export interface Env { raster: boolean; ink: string; ink2: string; rule: string; sig: string; paper: string; panel: string; mute: string; font: string }
export type Row = [string, string];
export interface Scene {
  cols: number;
  rows: number;
  readonly duration: number; // ms of animation; at t >= duration the figure is finished
  loop: boolean;             // loops with next() after a rest, or stays on the finished figure
  name: string;              // accessible name of the canvas
  /** x: the figure. fx: transparent overlay for the live geometry (cleared by the scene that uses it). */
  paint(x: CanvasRenderingContext2D, fx: CanvasRenderingContext2D, cs: number, t: number, e: Env): void;
  read(t: number): Row[];
  next?(): void;             // new endpoints for the next loop
  invalidate?(): void;       // size or mode changed: repaint everything
}
