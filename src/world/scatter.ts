// Scatter: the seven Blender props (props/*.glb) lying about the outer edges of the desk as quiet dressing, one or two
// per scroll band, so the scroll reveals them one by one. Not a station (the camera path stays the four stations'): it
// rides on a host station's frame, setMode and dispose. One fetch each at idle after the first frame, never on phones.
// An object fades in when its GLB lands and, like desk.ts, out only while its whole screen box lies under an opaque card:
// an eased opacity, never a visibility toggle.
import { Mesh, type Material } from "three";
import type { Ctx, Frame, Station } from "./core.ts";
import { ao, covered, FADE, screenBox, slotPairs, SLOTS } from "./desk.ts";
import { glb } from "./glb.ts";
import { kit } from "./kit.ts";
import type { Tablet } from "./tablet.ts";

const DEG = Math.PI / 180;
/** The clock's dial is on its local -y, so this turns it toward the About camera (atan2 of dx, -dy); add 180 to flip it. */
const CLOCK_TURN = -45.2;
/** Absolute table coordinates (wu; 1 wu = 175 mm), z the base. Stations: Work (0, 0), About (5, -10), Lab (-5, -19), Sign (0, -27). */
export const PLACES = [
  { name: "desk-lamp", x: -2.26, y: -26.18, z: 0, turn: -20 }, // far-left flank of the Contact stack, shade toward it (sign.ts LAMP_FACE)
  { name: "tablet-ipad", x: 4.65, y: -12.42, z: 0, turn: 20 },
  { name: "stacked-books", x: 0.33, y: 3.51, z: 0, turn: 6 },
  { name: "coffee-mug", x: -5.63, y: -16.36, z: 0, turn: 0 },
  { name: "alarm-clock", x: 8.4, y: -8.7, z: 0, turn: CLOCK_TURN }, // upper right of the About frame, clear of sheets, notebook and tablet
  { name: "sketchbook-notebook", x: 10.46, y: -6.03, z: 0, turn: -18 },
  { name: "drafting-pens", x: -4.94, y: -21.04, z: 0, turn: 14 },
];

export function withScatter<S extends Station>(ctx: Ctx, st: S): S {
  if (ctx.tier === "phone") return st; // a few pixels of detail do not pay for seven downloads
  const K = kit(ctx), pairs = slotPairs(K);
  const items = PLACES.map((p) => ({ p, m: null as Mesh | null, a: 0, pa: NaN, want: 1, own: new Map<Material, Material>() }));
  let asked = false, gone = false, tab: Tablet | null = null;

  /** The prop's own clones of the slot materials (its fade never reaches a neighbour); Render also takes the baked AO (COLOR_0). */
  const dress = (it: (typeof items)[number]) => SLOTS.map((s) => {
    const x = pairs[s][ctx.mode];
    let c = it.own.get(x);
    if (!c) {
      c = K.keep(x.clone());
      c.transparent = true; // always: opacity 1 on an opaque material would swap shader programs at the first fade
      if (ctx.mode === "render") { c.vertexColors = true; ao.add(c); } // ao: desk.ts's dresser leaves it be
      it.own.set(x, c);
    }
    return c;
  });
  const paint = (it: (typeof items)[number]) => {
    if (!it.m || it.pa === it.a) return;
    it.pa = it.a;
    for (const x of it.m.material as Material[]) x.opacity = it.a;
    it.m.visible = it.a > 0.004;
    it.m.castShadow = it.a > 0.5;
  };
  const apply = () => items.forEach((it) => { if (it.m) { it.m.material = dress(it); it.pa = NaN; paint(it); } });

  function load() {
    for (const it of items) {
      void glb(ctx, `props/${it.p.name}`, [...SLOTS]).then((g) => {
        const geo = g[it.p.name];
        if (gone || !geo) return;
        const m = (it.m = new Mesh(K.keep(geo), dress(it)));
        m.name = `scatter-${it.p.name}`;
        m.castShadow = m.receiveShadow = true;
        m.position.set(it.p.x, it.p.y, it.p.z);
        m.rotation.z = it.p.turn * DEG;
        m.visible = false;
        ctx.scene.add(m);
        if (it.p.name === "tablet-ipad") void import("./tablet.ts").then((t) => { if (!gone) { tab = t.tablet(ctx, K, m); ctx.request(); } });
        ctx.request();
      }, (e) => { if (import.meta.env.DEV) console.warn("[scatter]", e); });
    }
  }

  function step(dt: number, f: Frame) {
    if (!asked) { asked = true; load(); }
    const k = 1 - Math.exp(-dt * FADE);
    let busy = false;
    for (const it of items) {
      const m = it.m;
      if (!m) continue;
      m.updateMatrixWorld();
      const b = screenBox(m, ctx, f), c = b ? covered(b) : 0;
      it.want = c >= 0.97 ? 0 : c < 0.9 ? 1 : it.want;
      if (ctx.stepped || ctx.reduced) it.a = it.want;
      else if (Math.abs(it.want - it.a) > 0.004) { it.a += (it.want - it.a) * k; busy = true; } else it.a = it.want;
      paint(it);
      if (tab && it.p.name === "tablet-ipad" && tab.step(dt, f, it.a)) busy = true;
    }
    return busy;
  }

  const frame = st.frame.bind(st), setMode = st.setMode.bind(st), dispose = st.dispose.bind(st);
  st.frame = (dt, now, f) => { const a = frame(dt, now, f); return step(dt, f) || a; };
  st.setMode = (m) => { setMode(m); apply(); tab?.setMode(m); };
  st.dispose = () => { gone = true; tab?.dispose(); ctx.scene.remove(...items.flatMap((it) => (it.m ? [it.m] : []))); dispose(); K.dispose(); };
  return st;
}
