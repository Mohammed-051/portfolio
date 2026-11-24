// Tablet: a screen plane and a soft halo on the iPad prop (scatter.ts calls this once the prop lands). Asleep until it is
// clicked; each click shows the next of three placeholder screens (wireframe, status readout, ink sketch) drawn on one
// canvas, and after a while it falls asleep again. Unlit, so it glows in the dark scenes; both follow the prop's fade.
import { AdditiveBlending, CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, SRGBColorSpace, Vector2, type BufferGeometry } from "three";
import type { Mode } from "../rr/store.ts";
import type { Ctx, Frame } from "./core.ts";
import { SLOTS } from "./desk.ts";
import type { kit } from "./kit.ts";

const GLASS = SLOTS.indexOf("glass");
// inset: share of the glass kept as bezel on each side; lift: screen height over the glass (wu); halo: its opacity awake;
// haloSize: wu; haloZ: its height over the table; haloRate: ease 1/s; dip, dipDepth: the screen change (s, darkest share);
// sleepMs: idle time before it sleeps; px: the canvas's long side.
const T = { inset: 0.03, lift: 0.002, halo: 0.18, haloSize: [2.5, 2.0], haloZ: 0.003, haloRate: 6, dip: 0.16, dipDepth: 0.65, sleepMs: 45000, px: 512 } as const;
const PAPER = "#EBE7DD", INK = "#11110F", GROUND = "#14130F", MUTE = "#8C877C", RED = "#FF4F3A";

/** The glass slot's box in the mesh's local space: [x0, y0, x1, y1, top z]. The tablet lies flat, so z is the thin axis. */
function glassBox(g: BufferGeometry): [number, number, number, number, number] {
  const p = g.getAttribute("position"), idx = g.index, b: [number, number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const gr of g.groups) {
    if (gr.materialIndex !== GLASS) continue;
    for (let i = gr.start; i < gr.start + gr.count; i++) {
      const v = idx ? idx.getX(i) : i;
      b[0] = Math.min(b[0], p.getX(v)); b[1] = Math.min(b[1], p.getY(v));
      b[2] = Math.max(b[2], p.getX(v)); b[3] = Math.max(b[3], p.getY(v)); b[4] = Math.max(b[4], p.getZ(v));
    }
  }
  return b;
}

/** Screen s (0 asleep, 1 wireframe, 2 status, 3 ink sketch) on a W x H canvas. Raster takes thick strokes and no small type. */
function draw(c: HTMLCanvasElement, s: number, raster: boolean) {
  const g = c.getContext("2d")!, W = c.width, H = c.height, m = W * 0.047, lw = raster ? 10 : 3.5;
  let seed = 7; // fixed, so the sketch is the same on every load
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const jit = (a: number) => (rnd() - 0.5) * a;
  g.lineWidth = lw;
  g.lineJoin = g.lineCap = "round";
  g.fillStyle = s === 3 ? PAPER : s ? GROUND : "#0B0D10";
  g.fillRect(0, 0, W, H);
  if (s === 0) { // asleep: a faint reflection across the glass
    if (raster) return;
    const r = g.createLinearGradient(0, 0, W * 0.7, H);
    r.addColorStop(0, "rgba(235,231,221,0.08)"); r.addColorStop(0.55, "rgba(235,231,221,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, W, H);
  } else if (s === 1) { // wireframe: header, sidebar, three blocks, one red mark
    g.strokeStyle = PAPER;
    const hh = 44, sw = 110, x0 = m + sw + 14, y0 = m + hh + 14, bw = (W - m - x0 - 14) / 2, bh = (H - m - y0 - 14) / 2;
    g.strokeRect(m, m, W - 2 * m, hh);
    g.beginPath(); g.arc(m + 24, m + hh / 2, 9, 0, 7);
    g.moveTo(m + 60, m + hh / 2); g.lineTo(m + 130, m + hh / 2);
    g.stroke();
    g.fillStyle = RED; g.fillRect(W - m - 34, m + 12, 20, 20);
    g.strokeRect(m, y0, sw, H - m - y0);
    g.beginPath();
    for (let i = 0; i < 4; i++) { g.moveTo(m + 16, y0 + 24 + i * 38); g.lineTo(m + sw - 16 - (i % 2) * 24, y0 + 24 + i * 38); }
    g.rect(x0, y0, W - m - x0, bh); g.moveTo(x0, y0); g.lineTo(W - m, y0 + bh); g.moveTo(W - m, y0); g.lineTo(x0, y0 + bh); // the placeholder image
    g.rect(x0, y0 + bh + 14, bw, bh); g.rect(x0 + bw + 14, y0 + bh + 14, bw, bh);
    g.stroke();
  } else if (s === 2) { // status readout: four label and bar rows, one red dot, a tick rule
    g.fillStyle = RED; g.beginPath(); g.arc(m + 10, m + 12, 8, 0, 7); g.fill();
    g.fillStyle = PAPER; g.strokeStyle = PAPER;
    g.font = `bold ${raster ? 34 : 22}px monospace`; g.textBaseline = "middle";
    g.fillText("OK", m + 30, m + 12);
    ["RENDER", "RASTER", "LIGHT", "TABLE"].forEach((t, i) => {
      const y = 92 + i * 56, bx = 176, bw = W - m - bx;
      if (raster) g.fillRect(m, y - 7, 90, 14); else g.fillText(t, m, y);
      g.strokeStyle = MUTE; g.strokeRect(bx, y - 12, bw, 24);
      g.fillRect(bx, y - 12, bw * [0.82, 0.55, 0.7, 0.4][i]!, 24);
    });
    for (let k = 0; k <= 24; k++) g.fillRect(m + (k * (W - 2 * m - 6)) / 24, H - m - (k % 6 ? 10 : 22), raster ? 6 : 4, k % 6 ? 10 : 22);
  } else { // ink sketch: a loose box and sun over a ground line, a red scribble
    g.strokeStyle = INK;
    const loose = (pts: number[][], a: number) => {
      g.beginPath();
      pts.forEach(([x, y], i) => { const [px, py] = pts[i - 1] ?? [x!, y!]; if (!i) g.moveTo(x! + jit(a), y! + jit(a)); else g.quadraticCurveTo((x! + px!) / 2 + jit(a * 2), (y! + py!) / 2 + jit(a * 2), x! + jit(a), y! + jit(a)); });
      g.stroke();
    };
    const cx = W * 0.45, cy = H * 0.52, r = H * 0.3, hex = [0, 1, 2, 3, 4, 5, 0].map((k) => [cx + r * Math.sin((k * Math.PI) / 3), cy - r * Math.cos((k * Math.PI) / 3)]);
    for (let p = 0; p < (raster ? 1 : 2); p++) { loose(hex, 3.5); loose([hex[0]!, [cx, cy], hex[2]!], 3); loose([[cx, cy], hex[4]!], 3); }
    loose(Array.from({ length: 9 }, (_, k) => [W * 0.78 + H * 0.12 * Math.sin((k * Math.PI) / 4), H * 0.28 - H * 0.12 * Math.cos((k * Math.PI) / 4)]), 2.5);
    loose([[m, H - m - 20], [W * 0.5, H - m - 16], [W - m, H - m - 22]], 3);
    if (!raster) for (let k = 0; k < 5; k++) loose([[m + 20 + k * 40, H - m - 14], [m + 4 + k * 40, H - m + 2]], 2);
    g.strokeStyle = RED;
    loose([[W * 0.66, H * 0.8], [W * 0.7, H * 0.86], [W * 0.74, H * 0.8], [W * 0.78, H * 0.86]], 2);
  }
}

export interface Tablet { step(dt: number, f: Frame, fade: number): boolean; setMode(m: Mode): void; dispose(): void }

export function tablet(ctx: Ctx, K: ReturnType<typeof kit>, mesh: Mesh): Tablet {
  const [x0, y0, x1, y1, z] = glassBox(mesh.geometry);
  const sw = (x1 - x0) * (1 - 2 * T.inset), sh = (y1 - y0) * (1 - 2 * T.inset), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const cv = document.createElement("canvas");
  cv.width = T.px; cv.height = Math.round((T.px * sh) / sw);
  const map = K.keep(new CanvasTexture(cv));
  map.colorSpace = SRGBColorSpace;
  const screen = new Mesh(K.keep(new PlaneGeometry(sw, sh)), K.keep(new MeshBasicMaterial({ map, toneMapped: false, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
  screen.position.set(cx, cy, z + T.lift);
  const hc = document.createElement("canvas");
  hc.width = hc.height = 128;
  const hg = hc.getContext("2d")!, rg = hg.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, "rgba(235,231,221,1)"); rg.addColorStop(0.5, "rgba(235,231,221,0.35)"); rg.addColorStop(1, "rgba(235,231,221,0)");
  hg.fillStyle = rg; hg.fillRect(0, 0, 128, 128);
  const glowM = K.keep(new MeshBasicMaterial({ map: K.keep(new CanvasTexture(hc)), color: 0xffffff, blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
  glowM.map!.colorSpace = SRGBColorSpace;
  const halo = new Mesh(K.keep(new PlaneGeometry(T.haloSize[0], T.haloSize[1])), glowM);
  halo.position.set(cx, cy, T.haloZ);
  mesh.add(halo, screen);

  const mat = screen.material as MeshBasicMaterial, root = document.documentElement, ray = new Raycaster(), ndc = new Vector2();
  let raster = ctx.mode === "raster", state = 0, shown = 0, tr = 1, glow = 0, timer = 0, owned = false;
  const paint = () => { draw(cv, shown, raster); map.needsUpdate = true; };
  paint();
  const hits = (x: number, y: number, f: Frame) => {
    ndc.set((x / f.vw) * 2 - 1, 1 - (y / f.vh) * 2);
    ray.setFromCamera(ndc, ctx.camera);
    return ray.intersectObject(mesh, false).length > 0;
  };
  /** Goes to screen s; Render dips the brightness and swaps at the darkest point, Raster and reduced motion cut. */
  function go(s: number) {
    state = s;
    clearTimeout(timer);
    timer = s ? window.setTimeout(() => go(0), T.sleepMs) : 0;
    if (ctx.reduced || ctx.stepped) { shown = s; paint(); } else tr = 0;
    ctx.request();
  }
  function cursor(on: boolean) {
    const want = on ? (state ? "NEXT" : "WAKE") : "";
    if (want) { owned = true; if (root.dataset["cursor"] !== want) root.dataset["cursor"] = want; }
    else if (owned) { owned = false; if (/^(WAKE|NEXT)$/.test(root.dataset["cursor"] ?? "")) delete root.dataset["cursor"]; }
  }
  return {
    step(dt, f, fade) {
      const ok = fade > 0.5 && mesh.visible;
      cursor(ok && f.over && f.px >= 0 && hits(f.px, f.py, f));
      if (ok && f.click && hits(f.click.x, f.click.y, f)) go(state === 3 ? 1 : state + 1);
      let busy = false;
      if (tr < 1) {
        tr = Math.min(1, tr + dt / T.dip);
        if (tr >= 0.5 && shown !== state) { shown = state; paint(); }
        busy = tr < 1;
      }
      mat.color.setScalar(tr < 1 ? 1 - T.dipDepth * Math.sin(Math.PI * tr) : 1);
      const goal = state ? 1 : 0;
      if (ctx.stepped || ctx.reduced) glow = goal;
      else if (Math.abs(goal - glow) > 0.002) { glow += (goal - glow) * (1 - Math.exp(-dt * T.haloRate)); busy = true; } else glow = goal;
      mat.opacity = fade;
      glowM.opacity = T.halo * glow * fade;
      return busy;
    },
    setMode(m) { raster = m === "raster"; shown = state; tr = 1; paint(); },
    dispose() { clearTimeout(timer); cursor(false); mesh.remove(halo, screen); },
  };
}
