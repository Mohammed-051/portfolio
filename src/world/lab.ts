// Lab tray: the LAB entries as paper cards in a shallow tray, 4 columns by as many rows as it takes. Placeholders keep their chip. Hovering a
// card (or its row in the Lab card) lifts it; a tap lifts it on touch. The DOM list stays the content.
import { BoxGeometry, Euler, Mesh, Quaternion, Raycaster, Vector2, Vector3 } from "three";
import { LAB } from "../lib/content";
import type { Mode } from "../rr/store.ts";
import type { Ctx, Frame, Rest, Station } from "./core.ts";
import { withDesk } from "./desk.ts";
import { drawCard } from "./faces.ts";
import { glb, planar } from "./glb.ts";
import { kit } from "./kit.ts";

const DEG = Math.PI / 180;
const LOOK = new Vector3(-5, -19, 0);
const CW = 0.92, CH = 0.575, CT = 0.02 /* card stock */, GAP = 0.14;
// The tray follows the entry count: 4 columns up to 8 cards, 5 beyond, as many rows as it takes (8 cards is the 4 x 2 the
// camera framing and the GLB were made for; the framing below is derived from the tray, so it is unchanged there).
const COLS = LAB.length > 8 ? 5 : 4, ROWS = Math.ceil(LAB.length / COLS);
const TW = COLS * CW + (COLS + 1) * GAP, TH = ROWS * CH + (ROWS + 1) * GAP, RIM = 0.06, DEPTH = 0.07;
const GLB_W = 4.38, GLB_H = 1.57; // the lab-tray felt bed, 4 x 2 cards; the mesh is scaled to the tray
const M = { lift: 0.08, tilt: 6 };

export function createLabStation(ctx: Ctx, section: HTMLElement): Station {
  const { scene, camera } = ctx;
  const K = kit(ctx);
  const tray = K.pair(0x2a2824, 0x1c1b18), paper = K.paper(0xe9e5dc, 0xd9d4c8);
  const base = new Mesh(K.keep(new BoxGeometry(TW, TH, 0.02)));
  base.position.set(LOOK.x, LOOK.y, 0.01);
  const rimX = K.keep(new BoxGeometry(TW + 2 * RIM, RIM, DEPTH)), rimY = K.keep(new BoxGeometry(RIM, TH, DEPTH));
  const rims = [[0, (TH + RIM) / 2, rimX], [0, -(TH + RIM) / 2, rimX], [(TW + RIM) / 2, 0, rimY], [-(TW + RIM) / 2, 0, rimY]].map(([x, y, g]) => {
    const r = new Mesh(g as BoxGeometry);
    r.position.set(LOOK.x + (x as number), LOOK.y + (y as number), DEPTH / 2);
    return r;
  });
  let parts: Mesh[] = [base, ...rims];
  parts.forEach((p) => { p.castShadow = p.receiveShadow = true; });
  // The Blender tray (rounded rim, felt bed) replaces base and rims once it lands. The felt is the kit's paper fibre
  // roughness on a darker cloth, a shade under the tray.
  const felt = K.pair(0x1f1d1a, 0x141311);
  const shell = new Mesh();
  shell.position.set(LOOK.x, LOOK.y, 0);
  shell.castShadow = shell.receiveShadow = true;
  let asked = false;

  const cardG = K.card(CW, CH, CT, 0.025), edge = K.edge(0xe9e5dc, 0xb8b3a7);
  const shadow = K.contact(TW + 0.9, TH + 0.8, LOOK.x, LOOK.y);
  const faces = LAB.map((x) => K.face((m, w) => drawCard({ n: x.n, kind: x.kind, title: x.title, chip: !!x.dummy }, m, w), 640, 384));
  const cards = LAB.map((_, i) => {
    const c = new Mesh(cardG);
    const col = i % COLS, row = Math.floor(i / COLS);
    c.position.set(LOOK.x - TW / 2 + GAP + CW / 2 + col * (CW + GAP), LOOK.y + TH / 2 - GAP - CH / 2 - row * (CH + GAP), 0.02 + CT / 2);
    c.rotation.z = (((i * 37) % 5) - 2) * 0.6 * DEG;
    c.castShadow = c.receiveShadow = true;
    c.userData["home"] = { p: c.position.clone(), q: c.quaternion.clone() };
    return c;
  });
  scene.add(shadow, ...parts, ...cards);

  // DOM rows lift their card: the bench figure is L.01, the rows follow in LAB order.
  const ac = new AbortController();
  let domHot = -1, tapHot = -1, hu = 0.5, hv = 0.5;
  section.addEventListener("pointerover", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const row = t?.closest(".lb__entry"), bench = t?.closest(".bench");
    const rows = [...section.querySelectorAll(".lb__entry")];
    const i = row ? rows.indexOf(row) + 1 : bench ? 0 : -1;
    if (i !== domHot) { domHot = i; ctx.request(); }
  }, { signal: ac.signal, passive: true });
  section.addEventListener("pointerleave", () => { domHot = -1; ctx.request(); }, { signal: ac.signal, passive: true });

  const ray = new Raycaster(), ndc = new Vector2(), q = new Quaternion(), e3 = new Euler();
  const live = cards.map(() => ({ lift: 0, tx: 0, ty: 0 }));
  function pick(x: number, y: number) {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(cards, false)[0];
    if (h?.uv) { hu = h.uv.x; hv = h.uv.y; }
    return h ? cards.findIndex((c) => c === h.object) : -1;
  }

  function frame(dt: number, _now: number, f: Frame): boolean {
    if (!asked) {
      asked = true;
      void glb(ctx, "lab-tray", ["tray", "felt"]).then((g) => {
        if (ac.signal.aborted) return;
        shell.geometry = K.keep(planar(g["lab-tray"]!, GLB_W, GLB_H));
        shell.scale.set(TW / GLB_W, TH / GLB_H, 1);
        scene.remove(...parts);
        parts = [shell];
        scene.add(shell);
        ctx.request();
      }, () => {});
    }
    if (f.w <= 0) return false;
    const hover = f.focus && f.over && f.px >= 0 && !ctx.reduced ? pick(f.px, f.py) : -1;
    if (f.tap && f.focus) { const k = pick(f.tap.x, f.tap.y); tapHot = k === tapHot ? -1 : k; }
    const hot = hover >= 0 ? hover : domHot >= 0 ? domHot : tapHot;
    const k = 1 - Math.exp(-dt * 14);
    let busy = false;
    cards.forEach((c, i) => {
      const l = live[i]!, on = i === hot;
      const g = { lift: on ? M.lift : 0, tx: on && i === hover ? (hu - 0.5) * 2 * M.tilt : 0, ty: on && i === hover ? -(hv - 0.5) * 2 * M.tilt : 0 };
      for (const key of ["lift", "tx", "ty"] as const) {
        if (ctx.reduced || ctx.stepped) { l[key] = ctx.stepped ? (key === "lift" ? Math.round(g[key] / 0.04) * 0.04 : Math.round(g[key] / 2) * 2) : g[key]; continue; }
        const d = g[key] - l[key];
        if (Math.abs(d) > 1e-4) { l[key] += d * k; busy = true; } else l[key] = g[key];
      }
      const home = c.userData["home"] as { p: Vector3; q: Quaternion };
      c.position.copy(home.p).setZ(home.p.z + l.lift);
      c.quaternion.copy(home.q).multiply(q.setFromEuler(e3.set(l.ty * DEG, l.tx * DEG, 0)));
    });
    return busy;
  }

  // Framing: the tray plus the props around it (half 1.35 and wide 2.75 on the 4 x 2 tray). The look sits 0.3 wu left
  // of the tray, so the frame's left edge (the card's right, core.ts) clears the tray and eraser through the rest drift
  // (DRIFT toward About pulls the tray up to 0.4 wu left); wide grows by as much, so the right side keeps its room.
  const rest: Rest = { look: new Vector3(LOOK.x - 0.3, LOOK.y, LOOK.z), dir: new Vector3(0.1, -0.5, 0.86).normalize(), dist: 9, half: TH / 2 + 0.565, wide: TW / 2 + 0.56, light: new Vector3(-0.5, 0.45, 0.75).normalize(), pool: 3.4 };
  // A tape roll at the back right of the tray, an eraser in front at the left. The tape sits 0.45 wu in from
  // +2.4, +1.5 so the whole roll stays in frame at 1024 to 1440. Offsets follow the tray size.
  if (import.meta.env.DEV) {
    // Test hook: each card's lift and its centre on screen (CSS px).
    const v = new Vector3();
    const props = () => ["tape", "eraser"].map((n) => { const o = scene.getObjectByName(`desk-${n}`) as Mesh | undefined; const m = Array.isArray(o?.material) ? o.material[0] : o?.material; return { n, vis: !!o?.visible, op: m?.opacity ?? -1 }; });
    Object.assign(window, { __labDesk: props, __labCards: () => cards.map((c, i) => { v.copy((c.userData["home"] as { p: Vector3 }).p).project(camera); return { z: c.position.z, lift: live[i]!.lift, sx: (v.x + 1) / 2 * innerWidth, sy: (1 - v.y) / 2 * innerHeight }; }) });
  }
  return withDesk(ctx, [
    { prop: "tape", x: LOOK.x + TW / 2 - 0.19, y: LOOK.y + TH / 2 + 0.515, turn: 0 },
    { prop: "eraser", x: LOOK.x - TW / 2 + 0.39, y: LOOK.y - TH / 2 - 0.515, turn: 15 },
  ], {
    rest,
    mark: () => section.getBoundingClientRect().top,
    slot: () => section.querySelector(".world-slot"),
    frame,
    setMode(m: Mode) {
      parts.forEach((p) => (p.material = tray[m]));
      shell.material = [tray[m], felt[m]];
      cards.forEach((c, i) => (c.material = [edge[m], faces[i]![m], paper[m]]));
      faces.forEach((f) => f.ensure(m));
      ctx.request();
    },
    dispose() { ac.abort(); scene.remove(shadow, ...parts, ...cards); K.dispose(); },
  });
}
