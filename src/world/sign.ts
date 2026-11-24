// Sign-off: as the page nears Contact, six sheets slide in from both sides and square up into one stack; the top
// sheet is the contact card: four printed tiles, with the real DOM controls laid exactly over them (index.ts).
// Driven only by scroll (the station's weight), so it never runs on its own.
import { Mesh, MeshBasicMaterial, Shape, ShapeGeometry, SpotLight, Vector3 } from "three";
import type { Mode } from "../rr/store.ts";
import type { Ctx, Frame, Rest, Station } from "./core.ts";
import { withDesk } from "./desk.ts";
import { drawContact, TILES } from "./faces.ts";
import { kit } from "./kit.ts";
import { PLACES } from "./scatter.ts";

const DEG = Math.PI / 180;
const LOOK = new Vector3(0, -27, 0.05);
const SW = 2.1, SH = 1.31, ST = 0.014, N = 6;
// Sheets enter from the two lower corners (x +-(XS + 0.4 i), y YS - 0.15 i from the stack), so no path crosses the lamp
// on the far-left flank or the clip on the far right (the self-check below sweeps it).
const XS = 4.2, YS = -2.5, CLEAR = 0.08;
const CLIP = { x: 1.9, y: -26.4, turn: -20 }; // holds nothing: it sits clear of the stack and every sheet path
const CLIP_FOOT = { cx: 0, cy: 0.061, r: 0.253 }; // a circle round the clip's box (x +-0.175, y -0.12 to 0.24), clip-local
const LAMP_R = 0.43; // the lamp's base disc; its arm and shade hang above z 1.8, over every sheet
// desk-lamp.glb, lamp-local: the shade opens along +x and 48 degrees down, its opening centre is the light. Flip LAMP_FACE to
// -1 if the shade turns out to open the other way (then also add 180 to the lamp's turn in scatter.ts).
const LAMP_FACE: 1 | -1 = 1, LAMP_HEAD = { x: 0.7, z: 1.99 };
// Darkroom: ctx.dark rises with the gather (from DARK_FROM, over DARK_SPAN: full as the last sheet lands at 0.94) and the
// lamp takes over. Intensities put the stack centre at today's brightness (key plus fill: Render irradiance 1.5, Raster 3.4).
// Decay 1, not 2: the lamp is off to one flank, and inverse-square made the near card edge five times the far one.
const DARK_FROM = 0.1, DARK_SPAN = 0.8, DARK_STEPS = 6;
const LAMP_RENDER = 5.3, LAMP_RASTER = 9, LAMP_COLOR = 0xffc98a, LAMP_ANGLE = 0.8, LAMP_PENUMBRA = 0.6, LAMP_DISTANCE = 7, LAMP_DECAY = 1;
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
  const from = Array.from({ length: N }, (_, i) => ({ x: (i % 2 ? 1 : -1) * (XS + i * 0.4), y: YS - i * 0.15, r: (i % 2 ? 1 : -1) * (24 - i * 3), rest: (((i * 37) % 5) - 2) * 1.1 }));
  const gather = (q: number, i: number) => smooth(clamp((q - i * 0.06) / 0.64));
  /** Sheet i at gather t: position on the table and turn (rad). */
  const at = (i: number, t: number) => { const o = from[i]!; return { x: LOOK.x + o.x * (1 - t), y: LOOK.y + o.y * (1 - t), a: (o.r * (1 - t) + o.rest * t) * DEG }; };
  const lampAt = PLACES.find((p) => p.name === "desk-lamp")!, lt = lampAt.turn * DEG;
  const clipC = { x: CLIP.x - CLIP_FOOT.cy * Math.sin(CLIP.turn * DEG), y: CLIP.y + CLIP_FOOT.cy * Math.cos(CLIP.turn * DEG) };
  if (import.meta.env.DEV) {
    // Gap (wu) from sheet pose p to a disc at (cx, cy) radius r: the point-to-rectangle distance in the sheet's frame, less r.
    const gap = (p: { x: number; y: number; a: number }, cx: number, cy: number, r: number) => {
      const c = Math.cos(p.a), s = Math.sin(p.a), dx = cx - p.x, dy = cy - p.y;
      return Math.hypot(Math.max(0, Math.abs(dx * c + dy * s) - SW / 2), Math.max(0, Math.abs(-dx * s + dy * c) - SH / 2)) - r;
    };
    let lamp = Infinity, clip = Infinity;
    for (let q = 0; q <= 1; q += 0.005) for (let i = 0; i < N; i++) {
      const t = gather(q, i);
      if (t <= 0) continue;
      const p = at(i, t);
      lamp = Math.min(lamp, gap(p, lampAt.x, lampAt.y, LAMP_R));
      clip = Math.min(clip, gap(p, clipC.x, clipC.y, CLIP_FOOT.r));
    }
    console.assert(lamp >= CLEAR && clip >= CLEAR, "sign: a sheet passes within 0.08 wu of the lamp or the clip", { lamp, clip });
  }
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
  // The desk lamp's light: at the shade's opening, aimed at the stack, soft pool edge. Always in the scene (visible, shadow
  // on) with intensity 0 outside the darkroom: toggling visibility or castShadow changes the light count and recompiles
  // every material mid-scroll. Its shadow pass is skipped while dark is 0 (shadow.autoUpdate), after one first draw.
  const lamp = new SpotLight(LAMP_COLOR, 0, LAMP_DISTANCE, LAMP_ANGLE, LAMP_PENUMBRA, LAMP_DECAY);
  lamp.position.set(lampAt.x + LAMP_FACE * LAMP_HEAD.x * Math.cos(lt), lampAt.y + LAMP_FACE * LAMP_HEAD.x * Math.sin(lt), lampAt.z + LAMP_HEAD.z);
  lamp.target.position.copy(LOOK);
  lamp.castShadow = true;
  lamp.shadow.mapSize.setScalar(ctx.tier === "phone" ? 512 : 1024);
  lamp.shadow.camera.near = 0.3; // the shade's own rim sits at depth 0, clipped
  lamp.shadow.camera.far = 8;
  lamp.shadow.bias = -0.0005;
  lamp.shadow.normalBias = 0.01; // under the 0.017 sheet pitch, so stacked sheets do not acne
  scene.add(shade, ...sheets, lamp, lamp.target);

  let act = -1, prs = -1, lift = 0, built = false, lastQ = -1;
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
      let t = gather(q, i);
      if (ctx.stepped) t = Math.round(t * 8) / 8;
      if (ctx.reduced) t = f.w > 0.5 ? 1 : 0;
      s.visible = t > 0;
      const p = at(i, t);
      s.position.x = p.x;
      s.position.y = p.y;
      s.rotation.z = p.a;
      all = Math.min(all, t);
      ts[i] = t;
    });
    // Darkroom: scroll-linked state (not motion), so reduced motion keeps it as a cut with the sheets; Raster in 6 steps.
    const dk = ctx.reduced ? (f.w > 0.5 ? 1 : 0) : smooth(clamp((q - DARK_FROM) / DARK_SPAN));
    const d = ctx.stepped ? Math.round(dk * DARK_STEPS) / DARK_STEPS : dk;
    ctx.dark = d;
    lamp.intensity = (ctx.mode === "raster" ? LAMP_RASTER : LAMP_RENDER) * d;
    lamp.shadow.autoUpdate = d > 0 || !built;
    built = true;
    // Phones bake shadows (core.ts): refresh them while the gather moves the sheets.
    if (!ctx.renderer.shadowMap.autoUpdate && q !== lastQ) ctx.renderer.shadowMap.needsUpdate = true;
    lastQ = q;
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
  return withDesk(ctx, [{ prop: "bulldog", ...CLIP }], {
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
      lamp.shadow.map?.dispose(); // the shadow map type changes with the mode (core.ts), so it is rebuilt
      lamp.shadow.map = null;
      built = false;
      ctx.request();
    },
    dispose() { scene.remove(shade, ...sheets, lamp, lamp.target); lamp.dispose(); ctx.dark = 0; K.dispose(); },
  });
}
