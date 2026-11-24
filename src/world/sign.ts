// Sign-off: as the page nears Contact, six sheets slide in from both sides and square up into one stack; the top
// sheet is the contact card: four printed tiles, with the real DOM controls laid exactly over them (index.ts).
// Driven only by scroll (the station's weight), so it never runs on its own.
import { Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Vector3 } from "three";
import type { Mode } from "../rr/store.ts";
import type { Ctx, Frame, Rest, Station } from "./core.ts";
import { withDesk } from "./desk.ts";
import { drawContact, TILES } from "./faces.ts";
import { kit } from "./kit.ts";

const DEG = Math.PI / 180;
const LOOK = new Vector3(0, -27, 0.05);
const SW = 2.1, SH = 1.31, ST = 0.014, N = 6;
const LIFT = 0.02, PRESS = 0.004; // wu: a hovered or focused card rises toward the light; a press dips the tile
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (x: number) => x * x * (3 - 2 * x);

/** A tile's screen quad in viewport px: corners top-left, top-right, bottom-right, bottom-left as x0 y0 .. x3 y3. */
export type TileBox = number[];

export function createSignStation(ctx: Ctx, lab: HTMLElement | null, paint: (b: TileBox[], live: boolean) => void): Station & { hold(i: number, press: boolean): void; probe(): { p: number[]; card: { x0: number; y0: number; x1: number; y1: number } } } {
  const { scene, camera } = ctx;
  const K = kit(ctx);
  const paper = K.pair(0xe9e5dc, 0xd9d4c8), edge = K.pair(0xd8d2c6, 0x8c877c);
  const top = K.face(drawContact, 1536, 768);
  const g = K.card(SW, SH, ST);
  // Where each sheet comes from (alternating sides) and the slight skew it settles at.
  const from = Array.from({ length: N }, (_, i) => ({ x: (i % 2 ? 1 : -1) * (5 + i * 0.4), y: (i - 2.5) * 0.5, r: (i % 2 ? 1 : -1) * (24 - i * 3), rest: (((i * 37) % 5) - 2) * 1.1 }));
  const sheets = from.map((_, i) => {
    const s = new Mesh(g);
    s.castShadow = s.receiveShadow = true;
    s.position.z = ST / 2 + i * ST * 1.2;
    return s;
  });
  const card = sheets[N - 1]!, z0 = card.position.z;
  const shade = K.contact(SW * 1.3, SH * 1.45, LOOK.x, LOOK.y, from[0]!.rest * DEG);
  const shadeM = shade.material as MeshBasicMaterial;

  // Tiles in the card's local space (the face's 1024 x 640 box maps onto SW x SH); a red frame marks the live one.
  const loc = TILES.map((t) => ({ x0: (t.x / 1024 - 0.5) * SW, x1: ((t.x + t.w) / 1024 - 0.5) * SW, y0: (0.5 - t.y / 640) * SH, y1: (0.5 - (t.y + t.h) / 640) * SH }));
  const red = { render: K.keep(new MeshBasicMaterial({ color: 0xb62e19 })), raster: K.keep(new MeshBasicMaterial({ color: 0xff4f3a })) };
  const rims = loc.map((l) => {
    const e = 0.012, s = new Shape().moveTo(l.x0, l.y1).lineTo(l.x1, l.y1).lineTo(l.x1, l.y0).lineTo(l.x0, l.y0).closePath();
    s.holes.push(new Shape().moveTo(l.x0 + e, l.y1 + e).lineTo(l.x0 + e, l.y0 - e).lineTo(l.x1 - e, l.y0 - e).lineTo(l.x1 - e, l.y1 + e).closePath());
    const m = new Mesh(K.keep(new ShapeGeometry(s)), red.render);
    m.position.z = ST / 2 + 0.0006;
    m.visible = false;
    card.add(m);
    return m;
  });
  scene.add(shade, ...sheets);

  let act = -1, prs = -1, lift = 0;
  const boxes: TileBox[] = TILES.map(() => [0, 0, 0, 0, 0, 0, 0, 0]);
  const v = new Vector3();
  /** Projects each tile's four corners (on the card's printed face) to viewport px. */
  function tiles(f: Frame) {
    card.updateMatrixWorld();
    loc.forEach((l, i) => {
      [l.x0, l.y0, l.x1, l.y0, l.x1, l.y1, l.x0, l.y1].forEach((_, k, a) => {
        if (k % 2) return;
        v.set(a[k]!, a[k + 1]!, ST / 2).applyMatrix4(card.matrixWorld).project(camera);
        boxes[i]![k] = (v.x + 1) / 2 * f.vw;
        boxes[i]![k + 1] = (1 - v.y) / 2 * f.vh;
      });
    });
  }

  const ts = sheets.map(() => 0), size = { w: 1, h: 1 }; // last sheet poses and viewport (DEV probe)
  function frame(dt: number, _now: number, f: Frame): boolean {
    let all = 1;
    // The gather rides Contact's own top, not the camera's transit (f.w), which would square the stack up while it is
    // still off screen. It starts at
    // 0.72 vh, as the camera sweeps the stack's edge into view, and has every sheet down and the tiles live at 0.25 vh,
    // well before the nav link lands it (about 0.06 vh). A pure function of scroll: the same pose either way and on a jump.
    const ct = document.getElementById("contact");
    const q = ct ? clamp((0.72 * f.vh - ct.getBoundingClientRect().top) / (0.5 * f.vh)) : clamp(f.w / 0.8);
    sheets.forEach((s, i) => {
      const o = from[i]!;
      let t = smooth(clamp((q - i * 0.06) / 0.64));
      if (ctx.stepped) t = Math.round(t * 8) / 8;
      if (ctx.reduced) t = f.w > 0.5 ? 1 : 0;
      s.visible = t > 0;
      s.position.x = LOOK.x + o.x * (1 - t);
      s.position.y = LOOK.y + o.y * (1 - t);
      s.rotation.z = (o.r * (1 - t) + o.rest * t) * DEG;
      all = Math.min(all, t);
      ts[i] = t;
    });
    shade.visible = all > 0;
    shadeM.opacity = all;
    // Live as soon as the card is fully drawn (every sheet squared up), so the nav Contact landing (Contact's top at the
    // nav line, uq about 2.94) is clickable; the tile boxes are re-projected every frame, so the hit areas track the camera.
    const live = all >= 1;
    // Lift and press: eased in Render, cut under reduced motion and in Raster's stepped poses.
    const want = live && act >= 0 ? 1 : 0;
    let busy = false;
    if (ctx.reduced || ctx.stepped) lift = want;
    else {
      lift += (want - lift) * (1 - Math.exp(-dt * 14));
      if (Math.abs(want - lift) > 0.002) busy = true; else lift = want;
    }
    card.position.z = z0 + LIFT * lift;
    const p = live && prs >= 0 ? loc[prs]! : null;
    card.rotation.y = p ? Math.max(-0.02, Math.min(0.02, PRESS / ((p.x0 + p.x1) / 2))) : 0; // tilts the pressed tile down
    rims.forEach((m, i) => { m.visible = live && i === act; });
    size.w = f.vw; size.h = f.vh;
    if (f.w > 0) tiles(f);
    paint(boxes, live);
    return busy;
  }

  // The camera aims a little below the card, so the card sits high and the address on the table reads under it.
  const rest: Rest = { look: new Vector3(LOOK.x, LOOK.y - 0.3, LOOK.z), dir: new Vector3(0, -0.28, 0.96).normalize(), dist: 7, half: 1.3, wide: ctx.tier === "phone" ? 1.2 : 1.6, light: new Vector3(-0.55, 0.7, 0.45).normalize(), pool: 2.6, full: true };
  // A bulldog clip right of the card, clear of its printed face. y -26.4, not -26.1: there it sits under the header
  // controls at 1440 and 1024 and hides.
  return withDesk(ctx, [{ prop: "bulldog", x: 1.6, y: -26.4, turn: -20 }], {
    rest,
    // The transit (mark 1.15 to 0.25 vh, core.ts) rides Contact's own top at twice the slope: it starts as Contact
    // enters (top at 1 vh) and lands as the heading reaches mid-screen (0.5 vh), so the card is on the table, whole and
    // live, by then.
    mark: (vh) => { const c = document.getElementById("contact") ?? lab; return c ? 0.25 * vh + 1.8 * (c.getBoundingClientRect().top - 0.5 * vh) : 1e9; },
    slot: () => null,
    frame,
    /** The DOM tile i is hovered or focused (press: held down); -1 releases. */
    hold(i, press) { act = i; prs = press ? i : -1; ctx.request(); },
    /** DEV probe: sheet poses and the card's projected box in viewport px (tests). */
    probe() {
      card.updateMatrixWorld();
      const xs: number[] = [], ys: number[] = [];
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        v.set((x * SW) / 2, (y * SH) / 2, ST / 2).applyMatrix4(card.matrixWorld).project(camera);
        xs.push(((v.x + 1) / 2) * size.w); ys.push(((1 - v.y) / 2) * size.h);
      }
      return { p: ts.slice(), card: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
    },
    setMode(m: Mode) {
      sheets.forEach((s) => (s.material = [edge[m], s === card ? top[m] : paper[m], paper[m]]));
      rims.forEach((r) => (r.material = red[m]));
      top.ensure(m);
      ctx.request();
    },
    dispose() { scene.remove(shade, ...sheets); K.dispose(); },
  });
}
