// Work desk cues: one faint drafting decal on the table beside the drum (a drag arrow with ticks, two marks, a hand note)
// that glints now and then, plus the pure drag rules work.ts shares. The rules live here, with only type imports above them,
// so one scratch check can import them without a scene.
import { AdditiveBlending, CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Mode } from "../rr/store.ts";
import type { Ctx, Frame } from "./core.ts";
import type { kit } from "./kit.ts";

/** Drag rules: slop px before an axis locks, a row fraction that commits, a flick in rows/s that commits on its own. */
export const DRAG = { slop: 6, commit: 0.18, flick: 1.5 };
/** Settle spring (Render): w rad/s, z damping ratio (0.75 overshoots about 3 percent), cap on the release speed in rows/s. */
export const SPRING = { w: 15, z: 0.75, cap: 2.5 };
const CUE = { w: 1.3, h: 0.975, z: 0.004, alpha: 0.35, glint: 0.9, ink: "#cfc9bb", gap: [6000, 8000] as const, sweep: 900, band: 0.3 };
const RASTER = { w: 112, lw: 3.2, ink: "#a39e92", steps: 3 }; // texels: about 2.4x the Render stroke once the pass drops to cells
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

/** The decal art in a 512 x 384 frame scaled to w px; lw is the stroke width in px of the final canvas. Plain strokes, no glyphs. */
function draw(w: number, lw: number, ink: string) {
  const c = document.createElement("canvas"), s = w / 512, g = c.getContext("2d")!;
  c.width = w; c.height = Math.round(w * 0.75);
  g.scale(s, s);
  g.strokeStyle = ink; g.lineWidth = lw / s; g.lineCap = g.lineJoin = "round";
  const line = (...p: number[]) => { g.beginPath(); g.moveTo(p[0]!, p[1]!); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i]!, p[i + 1]!); g.stroke(); };
  let seed = 11;
  const jit = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 3;
  // Drag arrow, both ways, with ticks on its right.
  line(104, 56, 104, 328);
  line(88, 80, 104, 56, 120, 80);
  line(88, 304, 104, 328, 120, 304);
  for (let y = 104; y <= 280; y += 22) line(104, y, 104 + (((y - 104) / 22) % 2 ? 9 : 17), y);
  // Crop mark top right, registration mark bottom right.
  line(404, 34, 444, 34, 444, 74);
  g.beginPath(); g.arc(440, 338, 12, 0, 2 * Math.PI); g.stroke();
  line(440, 316, 440, 360); line(418, 338, 462, 338);
  // Hand note: a wavy stroke, an underline and a hooked arrow pointing back at the shaft.
  const wave: number[] = [];
  for (let i = 0; i <= 20; i++) wave.push(190 + i * 10, 214 + Math.sin(i * 0.6) * 8 + jit());
  line(...wave);
  line(204, 252 + jit(), 270, 246 + jit(), 340, 250 + jit());
  line(180, 168, 214, 150 + jit(), 252, 164 + jit());
  line(168, 190, 180, 168, 196, 178);
  return c;
}

/** The decal and its glint. at: table x, y and turn in degrees. step returns true only while the glint sweeps. */
export function cues(ctx: Ctx, K: ReturnType<typeof kit>, at: { x: number; y: number; turn: number }) {
  const geo = K.keep(new PlaneGeometry(CUE.w, CUE.h));
  const maps = { render: K.tex(draw(512, 2.2, CUE.ink), false), raster: K.tex(draw(RASTER.w, RASTER.lw, RASTER.ink), true) };
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
    setMode(m: Mode) { mode = m; base.material = baseM[m]; glint.material = glintM[m]; ctx.request(); },
    dispose() { stop(); ctx.scene.remove(base, glint); },
  };
}
