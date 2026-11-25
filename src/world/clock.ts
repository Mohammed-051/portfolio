// Alarm clock: live Asia/Dhaka hands on the About prop (scatter.ts calls this once the prop lands). The baked hands are cut
// out of the prop's geometry and replaced by overlay hands that share its material clones, so they fade and switch mode with
// it. The world renders on demand, so while the dial is on screen one timeout a second asks for a frame; off screen, none.
import { BoxGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, type BufferGeometry, type Material } from "three";
import type { Mode } from "../rr/store.ts";
import type { Ctx, Frame } from "./core.ts";
import { covered, screenBox, SLOTS } from "./desk.ts";
import type { kit } from "./kit.ts";

const GRAPHITE = SLOTS.indexOf("graphite"), RED = SLOTS.indexOf("red");
// Dial centre in the mesh's local space (glTF (x, y, z) came out as (x, -z, y)): x 0, height 0.316, hub top at depth 0.098.
// cut: radius around the dial centre (the minute hand's tail starts 0.037 out), span: the widest a hand part may be, handZ: the glTF
// depth over which a graphite part counts as a baked hand (markers sit at r 0.16..0.21, never within cut of the centre).
const D = { cx: 0, cz: 0.316, depth: 0.098, cut: 0.04, span: 0.3, handZ: 0.066, weld: 1e4 } as const;
// len, tail (behind the pivot), w, th (all glTF units), and the layer's depth step toward the viewer (local -y).
const HANDS = { hour: { len: 0.1, tail: 0, w: 0.024, th: 0.004, lift: 0.004 }, minute: { len: 0.165, tail: 0, w: 0.014, th: 0.004, lift: 0.009 }, second: { len: 0.19, tail: 0.045, w: 0.005, th: 0.003, lift: 0.014 } } as const;

/** Cuts the whole red group and every graphite part welded to the hub area; rebuilds index and groups. Returns triangle counts. */
export function strip(g: BufferGeometry): { removed: number; kept: number } {
  const p = g.getAttribute("position");
  if (!g.index) g.setIndex(Array.from({ length: p.count }, (_, i) => i));
  const idx = g.index!, ids = new Map<string, number>(), vid = new Int32Array(p.count).fill(-1), up: number[] = [];
  const find = (a: number): number => { while (up[a] !== a) a = up[a] = up[up[a]!]!; return a; };
  const id = (v: number) => {
    if (vid[v]! >= 0) return vid[v]!;
    const k = `${Math.round(p.getX(v) * D.weld)},${Math.round(p.getY(v) * D.weld)},${Math.round(p.getZ(v) * D.weld)}`;
    let n = ids.get(k);
    if (n === undefined) { n = up.length; up.push(n); ids.set(k, n); }
    return (vid[v] = n);
  };
  const groups = g.groups.map((gr) => ({ ...gr }));
  const hit = new Set<number>(); // roots of the parts that touch the hub area
  for (const gr of groups) {
    if (gr.materialIndex !== GRAPHITE) continue;
    for (let i = gr.start; i < gr.start + gr.count; i += 3) {
      const a = id(idx.getX(i)), b = id(idx.getX(i + 1)), c = id(idx.getX(i + 2));
      up[find(a)] = find(b); up[find(b)] = find(c);
    }
  }
  const box = new Map<number, number[]>(); // x and z extents per root
  for (const gr of groups) {
    if (gr.materialIndex !== GRAPHITE) continue;
    for (let i = gr.start; i < gr.start + gr.count; i++) {
      const v = idx.getX(i), r = find(id(v)), x = p.getX(v), z = p.getZ(v), b = box.get(r) ?? [x, x, z, z];
      b[0] = Math.min(b[0]!, x); b[1] = Math.max(b[1]!, x); b[2] = Math.min(b[2]!, z); b[3] = Math.max(b[3]!, z);
      box.set(r, b);
      if (-p.getY(v) > D.handZ && Math.hypot(x - D.cx, z - D.cz) < D.cut) hit.add(r);
    }
  }
  // the case is one graphite part too, with a vertex near the hub: only parts smaller than the dial are hands
  for (const r of hit) { const b = box.get(r)!; if (b[1]! - b[0]! > D.span || b[3]! - b[2]! > D.span) hit.delete(r); }
  const out: number[] = [], ng: typeof groups = [];
  let removed = 0, kept = 0;
  for (const gr of groups) {
    const start = out.length;
    for (let i = gr.start; i < gr.start + gr.count; i += 3) {
      if (gr.materialIndex === RED || (gr.materialIndex === GRAPHITE && hit.has(find(id(idx.getX(i)))))) { if (gr.materialIndex === GRAPHITE) removed++; continue; }
      out.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
      if (gr.materialIndex === GRAPHITE) kept++;
    }
    if (out.length > start) ng.push({ start, count: out.length - start, materialIndex: gr.materialIndex });
  }
  g.setIndex(out);
  g.clearGroups();
  for (const gr of ng) g.addGroup(gr.start, gr.count, gr.materialIndex);
  return { removed, kept };
}

/** Clockwise degrees from 12 o'clock of the hour, minute and second hands (seconds tick, minutes do not sweep with them). */
export function angles(h: number, m: number, s: number): [number, number, number] { return [(h % 12 + m / 60) * 30, (m + s / 60) * 6, s * 6]; }

const FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
function dhaka(): [number, number, number] {
  const v = { hour: 0, minute: 0, second: 0 } as Record<string, number>;
  for (const x of FMT.formatToParts(new Date())) if (x.type in v) v[x.type] = Number(x.value);
  return angles(v["hour"]!, v["minute"]!, v["second"]!);
}

function check() {
  const near = (a: number[], b: number[]) => a.every((x, i) => Math.abs(x - b[i]!) < 1e-9);
  console.assert(near(angles(3, 0, 0), [90, 0, 0]), "clock: 03:00:00");
  console.assert(near(angles(6, 30, 0), [195, 180, 0]), "clock: 06:30:00");
  console.assert(near(angles(12, 0, 30), [0, 3, 180]), "clock: 12:00:30");
  console.assert(near(angles(23, 59, 59), [359.5, (59 + 59 / 60) * 6, 354]), "clock: 23:59:59");
}

export interface Clock { step(dt: number, f: Frame, fade: number): boolean; setMode(m: Mode): void; dispose(): void }

export function clock(ctx: Ctx, K: ReturnType<typeof kit>, mesh: Mesh): Clock {
  if (import.meta.env.DEV) {
    check();
    const r = strip(mesh.geometry);
    console.assert(r.removed > 0 && r.kept > 0, "clock: the asset changed, the baked hands were not found or the markers went too", r);
  } else strip(mesh.geometry);

  const mats = () => mesh.material as Material[];
  const root = new Group();
  root.position.set(D.cx, -D.depth, D.cz);
  /** A box from -tail to len along local z (12 o'clock), th thick along y; white vertex colours, since Render's clones read COLOR_0 for AO. */
  const bar = (h: (typeof HANDS)[keyof typeof HANDS], slot: number) => {
    const g = K.keep(new BoxGeometry(h.w, h.th, h.len + h.tail)).translate(0, 0, (h.len - h.tail) / 2);
    g.setAttribute("color", new Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 3).fill(1), 3));
    const pivot = new Group(), m = new Mesh(g, mats()[slot]);
    m.position.y = -h.lift;
    pivot.add(m);
    root.add(pivot);
    return { pivot, m, slot };
  };
  const hands = [bar(HANDS.hour, GRAPHITE), bar(HANDS.minute, GRAPHITE), bar(HANDS.second, RED)];
  const capG = K.keep(new CylinderGeometry(0.016, 0.016, 0.006, 20)).translate(0, -0.017, 0);
  capG.setAttribute("color", new Float32BufferAttribute(new Float32Array(capG.getAttribute("position").count * 3).fill(1), 3));
  const cap = new Mesh(capG, mats()[RED]);
  root.add(cap);
  mesh.add(root);

  let timer = 0, last = -1;
  const sync = () => { hands.forEach((h) => { h.m.material = mats()[h.slot]!; }); cap.material = mats()[RED]!; };
  const tick = () => {
    const t = Math.floor(Date.now() / 1000);
    if (t === last) return;
    last = t;
    dhaka().forEach((a, i) => { hands[i]!.pivot.rotation.y = (a * Math.PI) / 180; });
  };
  tick();
  return {
    step(_dt, f, fade) {
      tick();
      const b = fade > 0.5 ? screenBox(mesh, ctx, f) : null;
      if (b && covered(b) < 0.97) { if (!timer) timer = window.setTimeout(() => { timer = 0; ctx.request(); }, 1000 - (Date.now() % 1000) + 5); }
      else { clearTimeout(timer); timer = 0; }
      return false;
    },
    setMode: sync,
    dispose() { clearTimeout(timer); timer = 0; mesh.remove(root); },
  };
}
