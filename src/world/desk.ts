// Desk objects: the small things a designer and engineer keeps on a desk, one or two per station, set fore,
// middle and back outside the panels and the printed faces. Procedural stand-ins show first and on phones; the Blender
// kit (desk-kit.glb, one fetch per world, after the first frame) replaces them. A fine pointer nudges them: a small
// shift and at most 4 degrees of turn, eased; still under reduced motion. An object stays drawn until it leaves the frame;
// only one whose whole screen box lies under an opaque paper card is eased out, an eased opacity, never a visibility
// toggle. Text or a printed face brushing its box does not hide it: move the object instead.
import {
  BoxGeometry, BufferAttribute, CylinderGeometry, LatheGeometry, Mesh, MeshStandardMaterial, TorusGeometry,
  Vector2, Vector3, type BufferGeometry, type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Mode } from "../rr/store.ts";
import type { Ctx, Frame, Station } from "./core.ts";
import { glb, landed } from "./glb.ts";
import { kit, type Pair } from "./kit.ts";

export type Prop = "pencil" | "rule" | "loupe" | "paperclip" | "tape" | "eraser" | "bulldog";
/** One object: x, y on the table in world units, z its base (0 on the table), turn in degrees about z. */
export interface Place { prop: Prop; x: number; y: number; z?: number; turn: number }

const DEG = Math.PI / 180;
// The last seven slots dress the scatter props (props/*.glb); desk-kit.glb only names the first six.
export const SLOTS = ["graphite", "steel", "rubber", "paper", "lens", "tape", "cover", "edge", "face", "red", "ceramic", "glass", "liquid"] as const;
type Slot = (typeof SLOTS)[number];
const R5 = { turn: 4, shift: 0.025, rate: 5 };
const fine = matchMedia("(pointer: fine)");
export const FADE = 14; // 1/s: a judged object fades in or out in about 0.2 s
const kits = new WeakMap<Ctx, Promise<Record<string, BufferGeometry>>>();
const clones = new WeakMap<Material, Material>(); export const ao = new WeakSet<Material>(); // AO dress: original -> vertexColors clone
/** Procedural stand-in for a prop: primitives merged with one group per slot, base on z = 0, long side along x. */
function standIn(p: Prop): BufferGeometry {
  const parts: [BufferGeometry, Slot][] = [];
  const add = (g: BufferGeometry, s: Slot, x = 0, y = 0, z = 0) => parts.push([g.translate(x, y, z), s]);
  const rod = (r0: number, r1: number, l: number, s: Slot, x: number, z: number) => add(new CylinderGeometry(r1, r0, l, 10).rotateZ(-Math.PI / 2), s, x, 0, z);
  if (p === "pencil") { rod(0.038, 0.038, 1.14, "graphite", -0.13, 0.041); rod(0.036, 0.011, 0.18, "steel", 0.53, 0.041); rod(0.041, 0.041, 0.26, "rubber", 0.31, 0.041); }
  else if (p === "rule") add(new BoxGeometry(3, 0.26, 0.012), "steel", 0, 0, 0.006);
  else if (p === "loupe") {
    add(new TorusGeometry(0.184, 0.016, 8, 32), "graphite", 0, 0, 0.025);
    add(new CylinderGeometry(0.172, 0.172, 0.02, 32).rotateX(Math.PI / 2), "lens", 0, 0, 0.022);
    add(new BoxGeometry(0.21, 0.056, 0.04), "graphite", 0.295, 0, 0.02);
  } else if (p === "paperclip") add(new TorusGeometry(0.042, 0.0042, 4, 20).scale(3.4, 1.1, 1), "steel", 0, 0, 0.0042);
  else if (p === "tape") {
    const prof = [[0.125, 0], [0.25, 0], [0.25, 0.19], [0.125, 0.19], [0.125, 0]].map(([r, h]) => new Vector2(r, h));
    add(new LatheGeometry(prof, 32).rotateX(Math.PI / 2), "tape");
  } else if (p === "eraser") { add(new BoxGeometry(0.5, 0.2, 0.12), "rubber", 0, 0, 0.06); add(new BoxGeometry(0.38, 0.208, 0.126), "paper", 0.06, 0, 0.063); }
  else { add(new BoxGeometry(0.35, 0.22, 0.08), "graphite", 0, 0, 0.04); add(new BoxGeometry(0.28, 0.12, 0.008), "steel", 0, 0.12, 0.12); }
  const g = mergeGeometries(parts.map(([x]) => x), true)!;
  g.groups.forEach((gr, i) => (gr.materialIndex = SLOTS.indexOf(parts[i]![1])));
  parts.forEach(([x]) => x.dispose());
  return g;
}

/** Millimetre ticks along one long edge of the rule (Render): 1 px lines, longer at 5 and 10 mm. */
function ticks() {
  const c = document.createElement("canvas"), g = c.getContext("2d")!;
  c.width = 1024; c.height = 64;
  g.fillStyle = "#fff"; g.fillRect(0, 0, 1024, 64);
  g.fillStyle = "#3a3936";
  for (let i = 0; i <= 290; i++) g.fillRect(Math.round(((5 + i) / 300) * 1024), 0, 1, i % 10 ? (i % 5 ? 6 : 10) : 15);
  return c;
}

/** Top-down uvs over the rule's 3.0 x 0.26 top, for the tick map (the kit ships no uvs). */
function ruleUv(g: BufferGeometry) {
  if (g.getAttribute("uv")) return g;
  const p = g.getAttribute("position"), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[2 * i] = p.getX(i) / 3 + 0.5; uv[2 * i + 1] = p.getY(i) / 0.26 + 0.5; }
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  return g;
}

const v = new Vector3();
/** p projected to viewport px; null behind the camera. */
function px(p: Vector3, ctx: Ctx, f: Frame): Pt | null {
  v.copy(p).project(ctx.camera);
  return v.z > 1 ? null : [((v.x + 1) / 2) * f.vw, ((1 - v.y) / 2) * f.vh];
}
type Pt = [number, number];
/** The object's geometry box projected to a screen rectangle [x0, y0, x1, y1]; null when a corner is behind the camera. */
export function screenBox(m: Mesh, ctx: Ctx, f: Frame): [number, number, number, number] | null {
  const g = m.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const { min, max } = g.boundingBox!;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const s = px(v.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).applyMatrix4(m.matrixWorld), ctx, f);
    if (!s) return null;
    x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]);
  }
  return [x0, y0, x1, y1];
}

// The paper cards (desktop: the cards column, work.css) are opaque DOM over the canvas. A prop is judged hidden only when
// its screen box lies wholly under one; text or a printed face brushing its box does not hide it. A card in its
// hand-over (data-hand) is fading, so it does not count.
const CARDS = "#work, #about .wcard, #lab .wcard";
const wide = matchMedia("(min-width: 900px)");
/** Share (0..1) of box b = [x0, y0, x1, y1] under the opaque cards; the cards stack in different sections, never overlap. */
export function covered(b: [number, number, number, number]) {
  if (!wide.matches) return 0;
  const a = (b[2] - b[0]) * (b[3] - b[1]);
  if (a <= 0) return 0;
  let s = 0;
  for (const e of document.querySelectorAll(CARDS)) {
    if (e.hasAttribute("data-hand")) continue;
    const r = e.getBoundingClientRect();
    s += Math.max(0, Math.min(b[2], r.right) - Math.max(b[0], r.left)) * Math.max(0, Math.min(b[3], r.bottom) - Math.max(b[1], r.top));
  }
  return s / a;
}

/** One material pair per slot, in the world kit's own bag (K.keep disposes them with the station). */
export function slotPairs(K: ReturnType<typeof kit>): Record<Slot, Pair> {
  const mat = (color: number, metalness: number, roughness: number, o: Partial<MeshStandardMaterial> = {}) =>
    K.keep(new MeshStandardMaterial({ color, metalness, roughness, ...o }));
  return {
    graphite: { render: mat(0x1c1c1e, 0.4, 0.45), raster: K.toon(0x161614) },
    steel: { render: mat(0xa8a8a4, 0.35, 0.35), raster: K.toon(0x8c877c) }, // brushed clip steel, metalness 0.3 to 0.4
    rubber: { render: mat(0xdcd8cf, 0, 0.8), raster: K.toon(0xd9d4c8) },
    paper: { render: mat(0xb9ab92, 0, 0.9), raster: K.toon(0xb8b3a7) },
    lens: { render: mat(0x2c3236, 0.1, 0.08), raster: K.toon(0x2c2a26) },
    tape: { render: mat(0xe6e0cc, 0, 0.3, { transparent: true, opacity: 0.82 }), raster: K.toon(0xb8b3a7) },
    cover: { render: mat(0x1f1e1b, 0, 0.85), raster: K.toon(0x121210) }, // the notebook's dark cover (about.ts bookM)
    edge: { render: mat(0xdcd6ca, 0, 0.9), raster: K.toon(0x8c877c) }, // page edge (about.ts pageEdge)
    face: { render: mat(0xe9e5dc, 0, 0.7), raster: K.toon(0xd9d4c8) }, // clock dial
    red: { render: mat(0xff4f3a, 0, 0.6), raster: K.toon(0xff4f3a) }, // Signal Red, semi-matte
    ceramic: { render: mat(0xd6cdbb, 0, 0.55), raster: K.toon(0xcfc6b4) },
    glass: { render: mat(0x0b0d10, 0, 0.18), raster: K.toon(0x1a1b1d) }, // tablet screen: dark, no glare
    liquid: { render: mat(0x1a0d06, 0, 0.25), raster: K.toon(0x1b120c) },
  };
}

/**
 * Puts the places on the table for a station and wraps its frame, setMode and dispose to pose, dress and remove them.
 * Returns the same station.
 */
export function withDesk<S extends Station>(ctx: Ctx, places: Place[], st: S): S {
  const K = kit(ctx);
  const P = slotPairs(K);
  const mat = (color: number, metalness: number, roughness: number, o: Partial<MeshStandardMaterial> = {}) =>
    K.keep(new MeshStandardMaterial({ color, metalness, roughness, ...o }));
  const tick = K.tex(ticks(), false);
  const ruled = mat(0xa8a8a4, 0.35, 0.35, { map: tick });
  const mats = (p: Prop, m: Mode) => SLOTS.map((s) => (p === "rule" && s === "steel" && m === "render" ? ruled : P[s][m]));
  const items = places.map((p, i) => {
    const m = new Mesh(K.keep(standIn(p.prop)));
    m.name = `desk-${p.prop}`;
    m.userData["desk"] = p.prop;
    m.castShadow = m.receiveShadow = true;
    m.position.set(p.x, p.y, p.z ?? 0);
    m.rotation.z = p.turn * DEG;
    ctx.scene.add(m);
    return { m, p, s: i % 2 ? -1 : 1, live: { x: 0, y: 0, r: 0 }, a: 1, pa: NaN, own: new Map<Material, Material>() };
  });
  type Item = (typeof items)[number];
  /** The object's own clones of its slot materials, so its fade never reaches a neighbour that shares the slot. Always
   *  transparent (opacity 1 draws as opaque): a toggle would swap shader programs on the first fade. */
  const dressFor = (it: Item, src: Material[]) => src.map((x) => {
    let c = it.own.get(x);
    if (!c) { c = K.keep(x.clone()); c.transparent = true; c.userData["base"] = x.opacity; it.own.set(x, c); }
    return c;
  });
  const mats2 = (it: Item, m: Mode) => dressFor(it, mats(it.p.prop, m));
  const want = (it: Item) => (it.m.userData["want"] as number | undefined) ?? 1;
  /** Opacity a (0..1) onto the object's current materials; the shadow leaves once it is mostly gone. */
  function paint(it: Item) {
    if (it.pa === it.a) return;
    it.pa = it.a;
    for (const x of Array.isArray(it.m.material) ? it.m.material : [it.m.material]) x.opacity = ((x.userData["base"] as number | undefined) ?? 1) * it.a;
    it.m.visible = it.a > 0.004;
    it.m.castShadow = it.a > 0.5;
  }
  let asked = false, gone = false;

  /** Each frame this station is on stage: an object's goal is 0 only while its box lies wholly under an opaque card (the
   *  hysteresis keeps a box at the edge from flickering), else 1. Seven boxes and three rects at most. */
  function judge(f: Frame) {
    for (const it of items) {
      it.m.updateMatrixWorld();
      const b = screenBox(it.m, ctx, f), c = b ? covered(b) : 0;
      it.m.userData["want"] = c >= 0.97 ? 0 : c < 0.9 ? 1 : want(it);
    }
  }

  function step(dt: number, f: Frame) {
    if (!asked) {
      asked = true;
      let p = kits.get(ctx);
      if (!p) kits.set(ctx, (p = glb(ctx, "desk-kit", [...SLOTS])));
      void p.then((g) => {
        if (gone) return;
        for (const it of items) { const geo = g[it.p.prop]; if (geo) it.m.geometry = it.p.prop === "rule" ? ruleUv(geo) : geo; }
        ctx.request();
      }, () => {});
    }
    // Off stage, a whole transit away: every object goes back to clear at once (nothing is on screen), so none waits half
    // faded or comes back late when the station returns.
    if (f.w <= 0) { for (const it of items) { it.m.userData["want"] = 1; it.a = 1; paint(it); } return false; }
    const on = f.focus && f.over && f.px >= 0 && fine.matches && !ctx.reduced;
    const nx = on ? Math.max(-1, Math.min(1, (f.px / f.vw) * 2 - 1)) : 0, ny = on ? Math.max(-1, Math.min(1, (f.py / f.vh) * 2 - 1)) : 0;
    const k = 1 - Math.exp(-dt * R5.rate);
    let busy = false;
    for (const it of items) {
      const goal = { x: nx * R5.shift, y: -ny * R5.shift, r: it.s * nx * R5.turn };
      for (const key of ["x", "y", "r"] as const) {
        if (ctx.stepped) { it.live[key] = key === "r" ? Math.round(goal.r) : Math.round(goal[key] / 0.01) * 0.01; continue; }
        const d = goal[key] - it.live[key];
        if (Math.abs(d) > 1e-4) { it.live[key] += d * k; busy = true; } else it.live[key] = goal[key];
      }
      it.m.position.set(it.p.x + it.live.x, it.p.y + it.live.y, it.p.z ?? 0);
      it.m.rotation.z = (it.p.turn + it.live.r) * DEG;
    }
    judge(f);
    const k2 = 1 - Math.exp(-dt * FADE);
    for (const it of items) {
      const g = want(it);
      if (ctx.stepped || ctx.reduced || g > it.a) it.a = g; // out eases (it is under a card); back in is at once, never late
      else if (Math.abs(g - it.a) > 0.004) { it.a += (g - it.a) * k2; busy = true; } else it.a = g;
      paint(it);
    }
    return busy;
  }

  const frame = st.frame.bind(st), setMode = st.setMode.bind(st), dispose = st.dispose.bind(st);
  // Baked AO: any mesh in the world whose geometry carries baked AO (COLOR_0 from the v2 GLBs) draws in Render with a
  // vertexColors clone of its material, so the stations that own the notebook and the tray need no change. Raster keeps
  // its toon ramp untouched. Runs after each setMode and on the first frame after a GLB lands.
  let seen = -1;
  function dress() {
    seen = landed;
    if (ctx.mode !== "render") return;
    const swap = (x: Material) => {
      if (ao.has(x)) return x;
      let c = clones.get(x);
      if (!c) { c = K.keep(x.clone()); c.vertexColors = true; clones.set(x, c); ao.add(c); }
      return c;
    };
    ctx.scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.geometry.getAttribute("color")) m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    });
  }
  st.frame = (dt, now, f) => { if (seen !== landed) { dress(); items.forEach((it) => (it.pa = NaN)); } const a = frame(dt, now, f); return step(dt, f) || a; };
  st.setMode = (m) => { items.forEach((it) => { it.m.material = mats2(it, m); it.pa = NaN; paint(it); }); setMode(m); dress(); items.forEach((it) => (it.pa = NaN)); };
  st.dispose = () => { gone = true; ctx.scene.remove(...items.map((it) => it.m)); dispose(); K.dispose(); };
  return st;
}
