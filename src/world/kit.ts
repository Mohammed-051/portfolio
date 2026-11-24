// Shared by the stations: paper materials in both modes (standard in Render, a 3-step toon ramp in Raster), canvas
// textures, bevelled card geometry and contact shadows. Raster faces are drawn lazily: at idle after the first world
// frame (core.ts preload), or on the first switch if that comes sooner.
import {
  CanvasTexture, DataTexture, ExtrudeGeometry, LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial,
  Float32BufferAttribute, NearestFilter, PlaneGeometry, RedFormat, RepeatWrapping, Shape, SRGBColorSpace, type Material,
} from "three";
import type { Mode } from "../rr/store.ts";
import type { Ctx } from "./core.ts";
import { fontsFor, handReady } from "./faces.ts";

export type Pair = Record<Mode, Material>;
export interface Face { render: MeshStandardMaterial; raster: MeshToonMaterial; ensure(m: Mode): void }

const faces = new Set<Face>();
/** Draws every live face for mode m now (both modes' textures exist before the first switch). */
export const ensureFaces = (m: Mode) => faces.forEach((f) => f.ensure(m));

let paperSet: { albedo: HTMLCanvasElement; relief: HTMLCanvasElement } | undefined, blobC: HTMLCanvasElement | undefined;
const sources = new WeakMap<HTMLCanvasElement, CanvasTexture["source"]>();
const P = 256; // the one shared paper tile: 256 px, about 30 mm of paper at repeat 4 on a sheet
/** The shared paper set, drawn once per page from a fixed seed: an albedo tint (fibres and sparse flecks on near white)
 *  and a relief map packing bump height in red and roughness in green (three reads bump from .r, roughness from .g). */
function paperTiles() {
  if (paperSet) return paperSet;
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const mk = () => { const c = document.createElement("canvas"); c.width = c.height = P; return [c, c.getContext("2d")!] as const; };
  const [ac, a] = mk(), [rc, r] = mk();
  a.fillStyle = "#fcfbf8"; a.fillRect(0, 0, P, P);
  r.fillStyle = "rgb(120,232,0)"; r.fillRect(0, 0, P, P);
  /** Draws f at x, y and its wrapped copies, so the tile repeats without a seam. */
  const wrap = (x: number, y: number, f: (x: number, y: number) => void) => { for (const dx of [-P, 0, P]) for (const dy of [-P, 0, P]) f(x + dx, y + dy); };
  a.lineWidth = r.lineWidth = 0.8;
  for (let i = 0; i < 700; i++) {
    const x = rnd() * P, y = rnd() * P, t = rnd() * Math.PI, l = 2 + rnd() * 9, ex = Math.cos(t) * l, ey = Math.sin(t) * l;
    const v = 238 + Math.floor(rnd() * 12), h = 140 + Math.floor(rnd() * 70);
    a.strokeStyle = `rgba(${v},${v - 1},${v - 4},0.7)`;
    r.strokeStyle = `rgb(${h},${214 + Math.floor(rnd() * 30)},0)`;
    wrap(x, y, (x, y) => {
      a.beginPath(); a.moveTo(x, y); a.lineTo(x + ex, y + ey); a.stroke();
      r.beginPath(); r.moveTo(x, y); r.lineTo(x + ex, y + ey); r.stroke();
    });
  }
  // Flecks: 0.4 percent of texels in 1 to 3 px specks, a little raised.
  for (let n = 0; n < 0.004 * P * P;) {
    const k = 1 + Math.floor(rnd() * 3), x = Math.floor(rnd() * P), y = Math.floor(rnd() * P), v = 120 + Math.floor(rnd() * 60);
    a.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
    r.fillStyle = "rgb(190,200,0)";
    wrap(x, y, (x, y) => { a.fillRect(x, y, k, k > 2 ? 2 : k); r.fillRect(x, y, k, k > 2 ? 2 : k); });
    n += k * (k > 2 ? 2 : k);
  }
  return (paperSet = { albedo: ac, relief: rc });
}
/** Mean luma of a canvas (Rec. 601), sampled every 4th texel. DEV probe for the face tint. */
function meanLuma(c: HTMLCanvasElement) {
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { sum += 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!; n++; }
  return sum / n;
}
/** A soft dark blob, dense centre to clear rim: the contact shadow the spot cannot resolve under its normalBias. */
function blob() {
  if (blobC) return blobC;
  const c = (blobC = document.createElement("canvas")), g = c.getContext("2d")!;
  c.width = c.height = 64;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(0,0,0,0.7)"); r.addColorStop(0.55, "rgba(0,0,0,0.4)"); r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return c;
}
/** hex scaled 6 percent lighter per channel. */
const lighter = (hex: number) => [16, 8, 0].reduce((o, sh) => o | (Math.min(255, Math.round(((hex >> sh) & 255) * 1.06)) << sh), 0);

export function kit(ctx: Ctx) {
  const disposables: { dispose(): void }[] = [];
  const mine: Face[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  let folds = 0;
  const maxAniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
  const ramp = keep(new DataTexture(new Uint8Array([84, 168, 255]), 3, 1, RedFormat));
  ramp.minFilter = ramp.magFilter = NearestFilter;
  ramp.needsUpdate = true;
  const flat = keep(new DataTexture(new Uint8Array([255]), 1, 1, RedFormat)); // one step: lit like a face whatever the normal
  flat.needsUpdate = true;
  const tile = (c: HTMLCanvasElement) => {
    const t = keep(new CanvasTexture(c));
    t.source = sources.get(c) ?? sources.set(c, t.source).get(c)!; // one GPU upload per canvas, shared by every station's kit
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(4, 4);
    t.anisotropy = maxAniso;
    return t;
  };
  const rough = tile(paperTiles().relief), albedo = tile(paperTiles().albedo);
  albedo.colorSpace = SRGBColorSpace;
  const std = (color: number, map: CanvasTexture | null = null) => keep(new MeshStandardMaterial({ color, roughness: 1, metalness: 0, map, roughnessMap: rough }));
  const toon = (color: number, one = false) => keep(new MeshToonMaterial({ color, gradientMap: one ? flat : ramp }));
  const pair = (r: number, s: number): Pair => ({ render: std(r), raster: toon(s) });
  /** Paper with tooth: the shared albedo tint and relief (bump 0.6) in Render; the flat toon ramp in Raster. */
  const bumped = (m: MeshStandardMaterial) => { m.bumpMap = rough; m.bumpScale = 0.6; return m; };
  const paper = (r: number, s: number): Pair => ({ render: bumped(std(r, albedo)), raster: toon(s) });
  /** The cut edge of that paper: 6 percent lighter than the face in Render (fresh cut fibre); Raster keeps its own tone.
   *  one: the Raster rim takes a single ramp step, so a sub-cell rim on paper of its own tone never dithers into dots. */
  const edge = (r: number, s: number, one = false): Pair => ({ render: bumped(std(lighter(r))), raster: toon(s, one) });
  function tex(c: HTMLCanvasElement, raster: boolean) {
    const t = keep(new CanvasTexture(c));
    t.colorSpace = SRGBColorSpace;
    if (raster) { t.minFilter = t.magFilter = NearestFilter; t.generateMipmaps = false; }
    else { t.anisotropy = maxAniso; t.minFilter = LinearFilter; }
    return t;
  }
  /** A printed face: Render drawn now at rw px, Raster at sw px on first use. */
  function face(draw: (m: Mode, w: number) => HTMLCanvasElement, rw: number, sw: number): Face {
    let drawn = false;
    const early = !handReady(); // drawn before the hand face landed, so redrawn once when it does
    const c = draw("render", rw), map = tex(c, false);
    // The paper tint goes into the printed face itself (multiply, 1:1 texels), so the ink keeps its contrast (mean
    // face luma moves 4 percent at most; DEV records the shift on the texture for the clearance test).
    const tint = (c: HTMLCanvasElement) => {
      const before = import.meta.env.DEV ? meanLuma(c) : 0, g = c.getContext("2d")!;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "multiply";
      g.fillStyle = g.createPattern(paperTiles().albedo, "repeat")!;
      g.fillRect(0, 0, c.width, c.height);
      g.restore();
      if (import.meta.env.DEV) map.userData["lumaShift"] = (before - meanLuma(c)) / before;
    };
    tint(c);
    if (early) void fontsFor("render").then(() => {
      if (!handReady()) return;
      const c2 = draw("render", rw);
      tint(c2);
      map.image = c2;
      map.needsUpdate = true;
      ctx.request();
    });
    const f: Face = {
      render: bumped(std(0xffffff, map)),
      raster: toon(0xffffff),
      ensure(m) {
        if (m !== "raster" || drawn) return;
        drawn = true;
        void fontsFor("raster").then(() => {
          f.raster.map = tex(draw("raster", sw), true);
          f.raster.needsUpdate = true;
          ctx.request();
        });
      },
    };
    f.render.userData["printed"] = f.raster.userData["printed"] = true; // desk.ts keeps objects off these
    faces.add(f);
    mine.push(f);
    return f;
  }
  /** A paper card w x h x t: rounded corners, bevelled rim. Groups 0 edge, 1 face (+z), 2 back; uv 0..1 like a box's +z face.
   *  curl > 0 bends it about its long middle: the short ends rise by curl (unprinted sheets only; printed faces stay planar). */
  function card(w: number, h: number, t: number, r = 0.035, curl = 0) {
    const b = t / 4, x = w / 2 - b, y = h / 2 - b, c = Math.max(0.002, r - b), H = Math.PI / 2, n = curl ? 10 : 0;
    // Every other curled sheet has a dog-eared corner, L wu along each edge, folded back onto its face.
    const L = curl && folds++ % 2 === 0 ? 0.16 : 0;
    const s = new Shape();
    s.absarc(x - c, -y + c, c, -H, 0);
    if (L) { s.lineTo(x, y - L); s.lineTo(x - L, y); } else s.absarc(x - c, y - c, c, 0, H);
    for (let i = 1; i < n; i++) { const px = x - c - (2 * (x - c) * i) / n; if (px < x - L - 0.01) s.lineTo(px, y); } // top edge points, so the bend has vertices to move
    s.absarc(-x + c, y - c, c, H, 2 * H); s.absarc(-x + c, -y + c, c, 2 * H, 3 * H);
    for (let i = 1; i < n; i++) s.lineTo(-x + c + (2 * (x - c) * i) / n, -y);
    const g = keep(new ExtrudeGeometry(s, { depth: t - 2 * b, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 3 }));
    g.translate(0, 0, b - t / 2);
    // Extrude gives caps and sides as one group with shape-space uvs: regroup by triangle height, refit the uvs.
    let p = g.getAttribute("position");
    const uv = g.getAttribute("uv"), tri: number[][] = [[], [], []];
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
    for (let i = 0; i < p.count; i += 3) {
      const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      tri[z > t / 2 - 1e-5 ? 1 : z < 1e-5 - t / 2 ? 2 : 0]!.push(i, i + 1, i + 2);
    }
    if (L) {
      // The flap: the cut corner mirrored across the fold onto the face, a sheet thick, its tip lifted. Its top is the
      // paper's back (group 2), its walls the edge (group 0). Hinge A-B sits on the outer (bevelled) chamfer.
      const q = 0.414 * b, d = L + 0.586 * b, z0 = t / 2 + 0.0004, lift = 0.006;
      const A = [x - L + q, y + b, 0], B = [x + b, y - L + q, 0], C = [x + b - d, y + b - d, lift];
      const P = [...p.array], N = [...g.getAttribute("normal").array], U = [...uv.array];
      const v = (a: number[], up: number) => [a[0]!, a[1]!, z0 + a[2]! + up];
      const put = (k: number, ...vs: number[][]) => {
        const [a, e, f] = vs as [number[], number[], number[]];
        const u = [e[0]! - a[0]!, e[1]! - a[1]!, e[2]! - a[2]!], w2 = [f[0]! - a[0]!, f[1]! - a[1]!, f[2]! - a[2]!];
        const nn = [u[1]! * w2[2]! - u[2]! * w2[1]!, u[2]! * w2[0]! - u[0]! * w2[2]!, u[0]! * w2[1]! - u[1]! * w2[0]!], l = Math.hypot(...nn) || 1;
        for (const vv of vs) { tri[k]!.push(P.length / 3); P.push(...vv); N.push(nn[0]! / l, nn[1]! / l, nn[2]! / l); U.push(vv[0]! / w + 0.5, vv[1]! / h + 0.5); }
      };
      put(2, v(A, t), v(C, t), v(B, t)); // top, facing up
      put(2, v(A, 0), v(B, 0), v(C, 0)); // underside, on the face
      for (const [e, f] of [[A, C], [C, B], [B, A]] as const) { put(0, v(e, 0), v(f, 0), v(f, t)); put(0, v(e, 0), v(f, t), v(e, t)); }
      g.setAttribute("position", new Float32BufferAttribute(P, 3));
      g.setAttribute("normal", new Float32BufferAttribute(N, 3));
      g.setAttribute("uv", new Float32BufferAttribute(U, 2));
      p = g.getAttribute("position");
    }
    g.setIndex(tri.flat());
    g.clearGroups();
    let o = 0;
    tri.forEach((a, k) => { g.addGroup(o, a.length, k); o += a.length; });
    if (curl) {
      // z += curl * (2x / w)^2; the caps' normals tilt with the slope. The rim's normals lean up: a raised end shows its
      // wall, and a level wall read as a hard ink line across the sheet below.
      const nm = g.getAttribute("normal");
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i), k = (8 * curl * u) / (w * w);
        p.setZ(i, p.getZ(i) + curl * ((2 * u) / w) ** 2);
        const nz = nm.getZ(i);
        if (Math.abs(nz) > 0.9) { const l = Math.hypot(k, 1); nm.setXYZ(i, (-k * Math.sign(nz)) / l, 0, Math.sign(nz) / l); }
        else { const nx = nm.getX(i) * 0.6, ny = nm.getY(i) * 0.6, z = nz + 0.8, l = Math.hypot(nx, ny, z); nm.setXYZ(i, nx / l, ny / l, z / l); }
      }
    }
    return g;
  }
  const blobT = keep(new CanvasTexture(blob()));
  const plane = keep(new PlaneGeometry(1, 1));
  /** A contact shadow w x h on the table under a stack or prop. Its own material: the caller may fade it. */
  function contact(w: number, h: number, x: number, y: number, turn = 0) {
    const m = new Mesh(plane, keep(new MeshBasicMaterial({ color: 0, map: blobT, transparent: true, depthWrite: false })));
    m.scale.set(w, h, 1);
    m.position.set(x, y, 0.002);
    m.rotation.z = turn;
    return m;
  }
  return { keep, std, toon, pair, paper, edge, tex, face, card, contact, dispose: () => { mine.forEach((f) => faces.delete(f)); disposables.forEach((d) => d.dispose()); } };
}
