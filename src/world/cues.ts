// Work desk cues: one faint gel-pen decal on the table beside the drum (up and down arrows, "drag", "click to open";
// art in doodles.ts) that glints now and then, plus the pure drag rules work.ts shares. The rules live here, with only type imports above them,
// so one scratch check can import them without a scene.
import { AdditiveBlending, CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Mode } from "../rr/store.ts";
import type { Ctx, Frame } from "./core.ts";
import { paint, sheet, whenInk } from "./doodles.ts";
import type { kit } from "./kit.ts";

/** Drag rules: slop px before an axis locks, a row fraction that commits, a flick in rows/s that commits on its own. */
export const DRAG = { slop: 6, commit: 0.18, flick: 1.5 };
/** Settle spring (Render): w rad/s, z damping ratio (0.75 overshoots about 3 percent), cap on the release speed in rows/s. */
export const SPRING = { w: 15, z: 0.75, cap: 2.5 };
const CUE = { w: 1.3, h: 0.975, z: 0.004, alpha: 0.6, glint: 0.9, gap: [6000, 8000] as const, sweep: 900, band: 0.3 };
const RASTER = { steps: 3 }; // glint steps; the Raster strokes are 1.7 texels (doodles.ts)
const DEG = Math.PI / 180;

/** Which axis a drag has locked to: "" until it passes the slop. Touch locks horizontal only, so a vertical finger stays the page's scroll. */
export function lockAxis(dx: number, dy: number, touch: boolean): "" | "x" | "y" {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) <= DRAG.slop) return "";
  return ax > ay ? "x" : touch ? "" : "y";
}

/** Where a drag released at m settles: the neighbour past the commit fraction or on a flick (v rows/s), else back to the start row. */
export function release(m0: number, m: number, v: number): number {
  const b = Math.round(m0), d = m - b;
  if (Math.abs(d) >= 1) return Math.round(m);
  return b + (Math.abs(d) >= DRAG.commit ? Math.sign(d) : Math.abs(v) >= DRAG.flick ? Math.sign(v) : 0);
}

/** One damped-spring step of s toward `to` (substeps of 1/240 s); false once it has come to rest, snapped on the target. */
export function spring(s: { x: number; v: number }, to: number, dt: number): boolean {
  const d = Math.min(dt, 0.05), n = Math.max(1, Math.ceil(d * 240)), h = d / n;
  for (let i = 0; i < n; i++) {
    s.v += (-SPRING.w * SPRING.w * (s.x - to) - 2 * SPRING.z * SPRING.w * s.v) * h;
    s.x += s.v * h;
  }
  if (Math.abs(s.x - to) < 0.004 && Math.abs(s.v) < 0.04) { s.x = to; s.v = 0; return false; }
  return true;
}

/** The decal and its glint. at: table x, y and turn in degrees. step returns true only while the glint sweeps. */
export function cues(ctx: Ctx, K: ReturnType<typeof kit>, at: { x: number; y: number; turn: number }) {
  const geo = K.keep(new PlaneGeometry(CUE.w, CUE.h));
  // Blank sheets now; the art goes on once the mode's fonts are in (Raster on its first use).
  const cv = { render: sheet("cue", false), raster: sheet("cue", true) };
  const maps = { render: K.tex(cv.render, false), raster: K.tex(cv.raster, true) };
  let gone = false, asked = false;
  const ink = (m: Mode) => {
    if (m === "raster") { if (asked) return; asked = true; }
    void whenInk(m, () => { if (gone) return; paint(cv[m], "cue", m === "raster"); maps[m].needsUpdate = true; ctx.request(); });
  };
  ink("render");
  if (ctx.mode === "raster") ink("raster");
  // The glint is the stroke map seen through a narrow soft band (the alpha map) slid by its own uv offset, so it lights the strokes only.
  const bc = document.createElement("canvas");
  bc.width = 64; bc.height = 4;
  const bg = bc.getContext("2d")!, grad = bg.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, "#000"); grad.addColorStop(0.5, "#fff"); grad.addColorStop(1, "#000");
  bg.fillStyle = grad; bg.fillRect(0, 0, 64, 4);
  const band = K.keep(new CanvasTexture(bc));
  band.repeat.x = CUE.band;
  const flat = (map: CanvasTexture) => K.keep(new MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
  const lit = (map: CanvasTexture) => K.keep(new MeshBasicMaterial({ map, alphaMap: band, transparent: true, depthWrite: false, blending: AdditiveBlending }));
  const baseM = { render: flat(maps.render), raster: flat(maps.raster) }, glintM = { render: lit(maps.render), raster: lit(maps.raster) };
  const base = new Mesh(geo, baseM[ctx.mode]), glint = new Mesh(geo, glintM[ctx.mode]);
  base.position.set(at.x, at.y, CUE.z);
  glint.position.set(at.x, at.y, CUE.z + 0.0005);
  base.rotation.z = glint.rotation.z = at.turn * DEG;
  glint.visible = false;
  ctx.scene.add(base, glint);

  let mode: Mode = ctx.mode, timer = 0, t0 = -1;
  const stop = () => { clearTimeout(timer); timer = 0; t0 = -1; glint.visible = false; };
  const arm = () => { timer = window.setTimeout(() => { timer = 0; t0 = performance.now(); ctx.request(); }, CUE.gap[0] + Math.random() * (CUE.gap[1] - CUE.gap[0])); };
  return {
    /** k is the decal's presence 0..1 (the drum's build and fold); the glint runs only while Work is in focus. */
    step(now: number, f: Frame, k: number): boolean {
      const v = ctx.stepped ? (k > 0.5 ? 1 : 0) : k;
      base.visible = v > 0.004;
      baseM[mode].opacity = (mode === "render" ? CUE.alpha : 1) * v;
      glintM[mode].opacity = (mode === "render" ? CUE.glint : 1) * v;
      if (!f.focus || ctx.reduced || v < 0.5) { stop(); return false; }
      if (t0 < 0) { if (!timer) arm(); return false; }
      const t = Math.max(0, (now - t0) / CUE.sweep);
      if (t >= 1) { stop(); arm(); return false; }
      const p = ctx.stepped ? (Math.floor(t * RASTER.steps) + 0.5) / RASTER.steps : t;
      band.offset.x = 0.5 - CUE.band * (1.4 * p - 0.2); // centres the band on uv.x = p across the decal, a little beyond both ends
      glint.visible = true;
      return true;
    },
    setMode(m: Mode) { mode = m; base.material = baseM[m]; glint.material = glintM[m]; if (m === "raster") ink(m); ctx.request(); },
    dispose() { gone = true; stop(); ctx.scene.remove(base, glint); },
  };
}
