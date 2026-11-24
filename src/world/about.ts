// About desk: loose paper sheets and a dark notebook under window light. The window is an invisible occluder between
// the key and the desk; only its shadow (the light bars) is ever seen. Nothing here is content: the About card is.
import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, type Object3D, Path, Raycaster, Shape, ShapeGeometry, Vector2, Vector3 } from "three";
import { SHEETS as INFO } from "../lib/content";
import { SECTIONS, SITE } from "../lib/site";
import type { Mode } from "../rr/store.ts";
import type { Ctx, Frame, Rest, Station } from "./core.ts";
import { withDesk, type Place } from "./desk.ts";
import { drawCard } from "./faces.ts";
import { glb, planar } from "./glb.ts";
import { kit } from "./kit.ts";

const DEG = Math.PI / 180;
const LOOK = new Vector3(5, -10, 0.15);
const LIGHT = new Vector3(0.6, 0.55, 0.6).normalize();
// Sheets: x, y (from LOOK), turn in degrees. Fanned like a working pile, the top one carries the section mark.
const SHEETS: [number, number, number][] = [[-1.4, 0.5, 14], [-0.9, -0.2, -9], [0.3, 0.6, 6], [1.2, -0.3, -16], [0.6, 0.1, 22], [-0.1, -0.15, -4]];
const LEVEL = 0.03, TOP = 0.006 + (SHEETS.length - 1) * LEVEL; // pile level spacing and the top sheet's centre height
// Fan-in: sheets 0, 1, 2 and 4 start as a squared pile on the name card and slide out as About arrives (f.w 0..1), each
// window `span` of f.w long, `gap` later than the one before. pull: share of the offset kept in the pile; turn: the pile's
// per-sheet degrees; settle: overshoot of the ease; steps: Raster's quantisation. Sheet 3 (the clip) and the name card never move.
const FAN = { movers: [0, 1, 2, 4], pull: 0.12, turn: [1.5, -1, 1, 0, -1.5, 0], from: 0.25, gap: 0.08, span: 0.45, settle: 0.8, steps: 6 };
// Hover: the sheet under the pointer rises `lift` wu and turns `turn` degrees, every sheet and the notebook above it rise
// with it; rate: 1/s (about 180 ms); soft: share of its contact shadow that fades.
const HOVER = { lift: 0.02, turn: 1.2, rate: 16, soft: 0.25 };

// Notes in the hand on the notebook's unprinted ruled pages, word for word from the About sheets (lib/content).
// Big lines about two ruled rows tall, small ones 1.25 rows; u underlines the line. Drawn once Caveat has loaded.
const HAND = '"Caveat", cursive';
const B = 1.9, S = 1.2;
const NOTES: { t: string; x: number; row: number; z: number; turn: number; u?: boolean }[] = [
  { t: "Dhaka,", x: 0.13, row: 3, z: B, turn: -2 },
  { t: "Bangladesh", x: 0.13, row: 5, z: B, turn: -2, u: true },
  { t: "Creator & Developer", x: 0.13, row: 8, z: S, turn: -1 },
  { t: "Final-semester", x: 0.13, row: 10, z: S, turn: 0.5 },
  { t: "Daffodil International", x: 0.13, row: 11, z: S, turn: 0.5 },
  { t: "University", x: 0.13, row: 12, z: S, turn: 0 },
  { t: "AR/VR & Game", x: 0.13, row: 14, z: S, turn: -0.5 },
  { t: "Development Lab", x: 0.13, row: 15, z: S, turn: -0.5 },
  { t: "President", x: 0.13, row: 16, z: S, turn: 0 },
  { t: "since Sep 2023", x: 0.13, row: 17, z: S, turn: 0 },
  { t: "Champion Team,", x: 0.62, row: 3, z: B, turn: 1 },
  { t: "IC-04, UIHP", x: 0.62, row: 5, z: B, turn: 1 },
  { t: "ICPC, CTF, UTA", x: 0.62, row: 7, z: S, turn: 0 },
  { t: "22nd, TAKE-OFF finals", x: 0.62, row: 8, z: S, turn: 0 },
  { t: "300 solved, Beecrowd", x: 0.62, row: 9, z: S, turn: 0.5 },
  { t: "Mars Visual", x: 0.62, row: 11, z: B, turn: 1.5 },
  { t: "Experience", x: 0.62, row: 13, z: B, turn: 1.5, u: true },
  { t: "Bangladesh", x: 0.62, row: 15, z: S, turn: -0.5 },
  { t: "Innovation Fair", x: 0.62, row: 16, z: S, turn: -0.5 },
  { t: "Now: SMART-LIFE INCLUSION", x: 0.62, row: 17, z: S, turn: 0 },
];
let hand = false;
const inked = new WeakSet<HTMLCanvasElement>();

/** Writes the notes on a Render page canvas, once per canvas. Baselines sit on the ruled lines. Raster gets none:
 *  at station distance neither the hand nor the mono face reads at one cell, so the pages stay plain. */
function ink(c: HTMLCanvasElement, m: Mode): boolean {
  if (!hand || m === "raster" || inked.has(c)) return false;
  inked.add(c);
  const g = c.getContext("2d")!, w = c.width, h = c.height, row = h / 21;
  g.save();
  g.fillStyle = g.strokeStyle = INK.render;
  g.lineWidth = row * 0.09;
  g.lineCap = "round";
  for (const n of NOTES) {
    g.save();
    g.translate(w * n.x, h * 0.14 + row * n.row);
    g.rotate(n.turn * DEG);
    g.font = `500 ${row * n.z}px ${HAND}`;
    const max = w * 0.34; // inside the margin rule and short of the gutter
    g.fillText(n.t, 0, 0, max);
    if (n.u) { // a quick pen underline under the word
      const l = Math.min(max, g.measureText(n.t).width);
      g.beginPath(); g.moveTo(0, row * 0.4); g.quadraticCurveTo(l * 0.5, row * 0.7, l * 1.02, row * 0.3); g.stroke();
    }
    g.restore();
  }
  g.restore();
  return true;
}

// Loose sheets 0..4 carry the About sheets' ink drawings (viewBox 160 x 100), drawn large with pencil construction
// marks; Render adds the heading and hand line in Caveat. Canvas top is the sheet's +y end.
const ART = [
  "M28 38h104a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10h-30l-10-12h-24l-10 12H28a10 10 0 0 1-10-10V48a10 10 0 0 1 10-10ZM18 54H6m136 0h12M40 38l8-14h64l8 14M44 58a8 8 0 1 0 16 0a8 8 0 1 0-16 0m56 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0",
  "M4 92c30-34 122-34 152 0M28 76l6-3 5 3m40-10 8-2 6 3m30 6 6-2 4 3M120 22a10 10 0 1 0 20 0a10 10 0 1 0-20 0M40 30h2m30-12h2m-50 2h2m80 30h2M58 84c10-4 30-4 40 0",
  "M62 8l12 34m24-34L86 42M56 8h48M80 44a24 24 0 1 0 0 48a24 24 0 1 0 0-48m0 10l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2Z",
  "M20 10h120v80H20ZM20 30h120M20 50h120M20 70h120M40 10v80M60 10v80M80 10v80M100 10v80M120 10v80M24 86l16-16 20 0 0-20 20 0 20-20 20 0 16-16",
  "M34 14h92a6 6 0 0 1 6 6v60a6 6 0 0 1-6 6H34a6 6 0 0 1-6-6V20a6 6 0 0 1 6-6ZM40 22h80v56H40ZM66 40l14-8 14 8v16l-14 8-14-8ZM66 40l14 8 14-8M80 48v16M128 92h28v-28m-28 8h8v-8",
];
const INK = { render: "#3D3A34", raster: "#2C2A26" }, PENCIL = "#A8A296";
// Per sheet: drawing width (of the sheet), centre x, y (of the canvas), turn in degrees. Each sits in the part of its
// sheet the sheets above and the notebook leave in view at the About rest.
const LAY: [number, number, number, number][] = [[0.64, 0.36, 0.66, -4], [0.72, 0.44, 0.64, 3], [0.6, 0.38, 0.22, -2], [0.62, 0.62, 0.68, 4], [0.5, 0.56, 0.52, -3]];

function drawSheet(i: number) {
  return (m: Mode, w: number): HTMLCanvasElement => {
    const c = document.createElement("canvas"), raster = m === "raster";
    c.width = w;
    const h = (c.height = Math.round((w * 1.7) / 1.2));
    const g = c.getContext("2d")!, [dw, cx, cy, turn] = LAY[i]!, s = (w * dw) / 160;
    g.fillStyle = raster ? "#D9D4C8" : "#E9E5DC";
    g.fillRect(0, 0, w, h);
    g.lineCap = g.lineJoin = "round";
    // Crop ticks at the corners; in Render also a faint dot grid and a dimension line under the drawing.
    g.strokeStyle = raster ? INK.raster : PENCIL;
    g.lineWidth = raster ? 3 : w * 0.003;
    const k = w * 0.05, e = w * 0.06;
    g.beginPath();
    for (const [x, y, sx, sy] of [[e, e, 1, 1], [w - e, e, -1, 1], [e, h - e, 1, -1], [w - e, h - e, -1, -1]] as const) {
      g.moveTo(x, y + sy * k); g.lineTo(x, y); g.lineTo(x + sx * k, y);
    }
    g.stroke();
    if (!raster) {
      g.fillStyle = PENCIL;
      for (let x = w * (cx - dw * 0.55); x < w * (cx + dw * 0.55); x += w * 0.04) for (let y = h * cy - 60 * s; y < h * cy + 60 * s; y += w * 0.04) g.fillRect(x, y, w * 0.003, w * 0.003);
      const y = h * cy + 58 * s, x0 = w * cx - 80 * s, x1 = w * cx + 80 * s;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y);
      for (const x of [x0, x1]) { g.moveTo(x, y - w * 0.015); g.lineTo(x, y + w * 0.015); }
      g.stroke();
    }
    g.save();
    g.translate(w * cx, h * cy);
    g.rotate(turn * DEG);
    g.scale(s, s);
    g.translate(-80, -50);
    g.strokeStyle = INK[m];
    g.lineWidth = (raster ? 3.2 : w * 0.006) / s;
    g.stroke(new Path2D(ART[i]!));
    g.restore();
    inkSheet(c, m, i);
    return c;
  };
}

/** The sheet's heading and hand line in Caveat, once per Render canvas, after the font has loaded. */
function inkSheet(c: HTMLCanvasElement, m: Mode, i: number): boolean {
  if (!hand || m === "raster" || inked.has(c)) return false;
  inked.add(c);
  const g = c.getContext("2d")!, w = c.width, h = c.height, info = INFO[i + 1]!, [dw, cx, cy] = LAY[i]!;
  g.save();
  g.fillStyle = INK.render;
  g.translate(w * Math.max(0.1, cx - dw / 2), Math.min(h * 0.9, h * cy + w * dw * 0.48)); // under the dimension line
  g.rotate(-1.5 * DEG);
  g.font = `500 ${w * 0.075}px ${HAND}`;
  g.fillText(info.h, 0, 0, w * 0.76);
  g.font = `500 ${w * 0.06}px ${HAND}`;
  g.fillText(info.hand[0]!, 0, w * 0.07, w * 0.76);
  g.restore();
  return true;
}

/** Two ruled pages, a grey margin rule on each, the gutter shaded (Render) or a hard band (Raster). Ratio 2.2 : 1.52. */
function drawPages(m: Mode, w: number): HTMLCanvasElement {
  const c = document.createElement("canvas"), raster = m === "raster";
  c.width = w;
  c.height = Math.round((w * 1.52) / 2.2);
  const g = c.getContext("2d")!, h = c.height, lw = Math.max(1, w * (raster ? 0.006 : 0.0028)); // thinner lines alias into dots at this distance
  g.fillStyle = raster ? "#D9D4C8" : "#EDE9E0";
  g.fillRect(0, 0, w, h);
  g.fillStyle = raster ? "#8C877C" : "#C2BCAF";
  for (let y = h * 0.14; y < h * 0.95; y += h / 21) for (const x0 of [0.04, 0.53]) g.fillRect(w * x0, Math.round(y), w * 0.43, lw);
  for (const x of [0.1, 0.59]) g.fillRect(w * x, 0, lw, h);
  if (raster) { g.fillStyle = "#B8B3A7"; g.fillRect(w * 0.47, 0, w * 0.06, h); }
  else {
    const gr = g.createLinearGradient(w * 0.44, 0, w * 0.56, 0);
    gr.addColorStop(0, "rgba(17,17,15,0)"); gr.addColorStop(0.5, "rgba(17,17,15,0.16)"); gr.addColorStop(1, "rgba(17,17,15,0)");
    g.fillStyle = gr;
    g.fillRect(w * 0.44, 0, w * 0.12, h);
  }
  ink(c, m);
  return c;
}

export function createAboutStation(ctx: Ctx, section: HTMLElement): Station {
  const { scene } = ctx;
  const K = kit(ctx);
  // The loose sheets curl 0.016 at the short ends; the printed top one stays flat. Levels 0.03 apart clear the curl.
  const sheetG = K.card(1.2, 1.7, 0.012, 0.02), curledG = K.card(1.2, 1.7, 0.012, 0.02, 0.016);
  // Raster: a sheet's rim is under one cell, so its ramp step and its shadow sliver on the sheet below dithered into a
  // dashed line (the seam between two sheets of one tone). There the rims take the face tone at one step (below) and
  // the curled sheets cast no shadow (setMode); the printed top sheet, the notebook and the window still do.
  const paper = K.paper(0xe9e5dc, 0xd9d4c8), edge = K.edge(0xe9e5dc, 0xd9d4c8, true);
  const sec = SECTIONS[1];
  const top = K.face((m, w) => drawCard({ kind: sec.title, title: SITE.name }, m, w, 1.2 / 1.7), 768, 384);
  // The loose sheets' faces lose the printed flag: only the name card keeps props off it (the clip sits on sheet 3).
  const faces = ART.map((_, i) => {
    const f = K.face(drawSheet(i), 512, 224);
    delete f.render.userData["printed"];
    delete f.raster.userData["printed"];
    return f;
  });
  const sheets = SHEETS.map(([x, y, r], i) => {
    const s = new Mesh(i === SHEETS.length - 1 ? sheetG : curledG);
    s.position.set(LOOK.x + x, LOOK.y + y, 0.006 + i * LEVEL);
    s.rotation.z = r * DEG;
    s.castShadow = s.receiveShadow = true;
    return s;
  });
  // A contact shadow under each sheet, on the one below: the levels read apart.
  const levels = sheets.slice(1).map((s) => {
    const b = K.contact(1.4, 1.9, s.position.x, s.position.y, s.rotation.z);
    b.position.z = s.position.z - 0.0065;
    return b;
  });
  // An open notebook on top of the pile: dark cover, a ruled page block, a cloth spine down the gutter. No writing.
  const book = new Group();
  const cover = new Mesh(K.card(2.3, 1.62, 0.02, 0.04));
  const block = new Mesh(K.card(2.2, 1.52, 0.04, 0.02));
  const spine = new Mesh(K.keep(new BoxGeometry(0.06, 1.62, 0.046)));
  cover.position.z = 0.01;
  block.position.z = 0.04;
  spine.position.z = 0.043;
  for (const p of [cover, block, spine]) { p.castShadow = p.receiveShadow = true; book.add(p); }
  book.position.set(LOOK.x + 1.5, LOOK.y + 1.0, TOP + 0.019);
  book.rotation.z = -8 * DEG;
  const bookM = K.pair(0x1f1e1b, 0x121210), pageEdge = K.pair(0xdcd6ca, 0x8c877c);
  const ruled = K.face(drawPages, 1024, 384);

  // Window: a 6.4 x 8.4 sash, 2 x 3 panes behind 0.04 mullions, 3.2 units up the light ray, facing the light. It is slid
  // so the name card's projection sits mid-pane: the bars cross the pile and the notebook, never the name.
  const FW = 6.4, FH = 8.4, bar = 0.15 /* 0.04 read as pen strokes; at 0.15 the mullions blur into soft shade */, pw = (FW - 3 * bar) / 2, ph = (FH - 4 * bar) / 3;
  const win = new Shape().moveTo(-FW / 2, -FH / 2).lineTo(FW / 2, -FH / 2).lineTo(FW / 2, FH / 2).lineTo(-FW / 2, FH / 2).closePath();
  for (let c = 0; c < 2; c++) for (let r = 0; r < 3; r++) {
    const x = -FW / 2 + bar + c * (pw + bar), y = -FH / 2 + bar + r * (ph + bar);
    win.holes.push(new Path().moveTo(x, y).lineTo(x, y + ph).lineTo(x + pw, y + ph).lineTo(x + pw, y).closePath());
  }
  const occluder = new Mesh(K.keep(new ShapeGeometry(win)), K.keep(new MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: DoubleSide })));
  const name = sheets.at(-1)!.position;
  occluder.position.copy(name).addScaledVector(LIGHT, 3.2);
  occluder.lookAt(occluder.position.clone().add(LIGHT));
  occluder.rotateZ(12 * DEG);
  occluder.updateMatrixWorld();
  occluder.position.sub(occluder.localToWorld(new Vector3(-(pw + bar) / 2, 0, 0)).sub(occluder.position)); // left pane, middle row
  occluder.castShadow = true;
  // Contact shadows: one under the pile on the table, one under the notebook on the pile.
  const pileShadow = K.contact(3.6, 2.8, LOOK.x - 0.1, LOOK.y + 0.15);
  const bookShadow = K.contact(2.8, 2.1, book.position.x, book.position.y, book.rotation.z);
  bookShadow.position.z = TOP + 0.011;
  scene.add(pileShadow, bookShadow, ...levels, ...sheets, book, occluder);

  // The Blender notebook (curved pages, overhanging cover, band) replaces cover, block and spine once it lands.
  let nb: Mesh | null = null, asked = false, gone = false, handAsked = false;
  const nbMats = (m: Mode) => [pageEdge[m], ruled[m], bookM[m], bookM[m]];

  const rest: Rest = { look: LOOK, dir: new Vector3(-0.5, -0.8, 0.55).normalize(), dist: 7.5, half: 1.6, wide: 2.0, light: LIGHT, pool: 2.6 };
  // A loupe on the table left of the pile; a paper clip on sheet 3 (moved +0.4 x off the printed top sheet).
  const clip: Place = { prop: "paperclip", x: LOOK.x + 0.8, y: LOOK.y - 0.9, z: 0.006 + 3 * LEVEL + 0.008, turn: 40 };

  // Fan and hover. Each sheet's rest pose is SHEETS; hover adds a lift that every sheet above it shares (so a curled end
  // never meets the sheet over it) and a turn on the hovered sheet alone. The clip rides sheet 3 by mutating its Place,
  // which desk.ts reads after this frame.
  const hv = SHEETS.map(() => 0), ray = new Raycaster(), ndc = new Vector2();
  const bookZ = book.position.z, shadowZ = bookShadow.position.z, clipZ = clip.z!;
  const [s3x, s3y, s3r] = SHEETS[3]!, clipAt = { x: clip.x - LOOK.x - s3x, y: clip.y - LOOK.y - s3y };
  let hit = -1, lpx = NaN, lpy = NaN;
  /** Eased fan progress of mover j at station presence w: 0 the pile, 1 the rest pose, a little past 1 on the way. */
  const fan = (j: number, w: number) => {
    let t = Math.min(1, Math.max(0, (w - FAN.from - j * FAN.gap) / FAN.span));
    if (ctx.reduced) t = w > 0.5 ? 1 : 0;
    else if (ctx.stepped) t = Math.round(t * FAN.steps) / FAN.steps;
    const u = t - 1;
    return t >= 1 ? 1 : t <= 0 ? 0 : 1 + (FAN.settle + 1) * u * u * u + FAN.settle * u * u;
  };
  function pose(dt: number, f: Frame): boolean {
    const live = f.focus && f.over && f.px >= 0 && !ctx.reduced;
    if (!live) { hit = -1; lpx = NaN; }
    else if (f.px !== lpx || f.py !== lpy) { // only when the pointer moved
      lpx = f.px; lpy = f.py;
      ndc.set((f.px / f.vw) * 2 - 1, 1 - (f.py / f.vh) * 2);
      ray.setFromCamera(ndc, ctx.camera);
      const h = ray.intersectObjects([...sheets, book], true)[0];
      hit = h ? (sheets as Object3D[]).indexOf(h.object) : -1; // the notebook hides what is under it
      if (hit === sheets.length - 1) hit = -1; // the name card stays still
    }
    const k = 1 - Math.exp(-dt * HOVER.rate);
    let busy = false, up = 0, up3 = 0;
    const [px0, py0] = SHEETS.at(-1)!;
    sheets.forEach((s, i) => {
      const g = i === hit ? 1 : 0;
      if (ctx.stepped || ctx.reduced) hv[i] = g;
      else if (Math.abs(g - hv[i]!) > 0.002) { hv[i] = hv[i]! + (g - hv[i]!) * k; busy = true; } else hv[i] = g;
      up = Math.max(up, hv[i]!);
      if (i === 3) up3 = up;
      let [x, y, r] = SHEETS[i]!;
      const j = FAN.movers.indexOf(i);
      if (j >= 0) {
        const e = fan(j, f.w);
        x = x * e + (px0 + (x - px0) * FAN.pull) * (1 - e);
        y = y * e + (py0 + (y - py0) * FAN.pull) * (1 - e);
        r = r * e + FAN.turn[i]! * (1 - e);
      }
      s.position.set(LOOK.x + x, LOOK.y + y, 0.006 + i * LEVEL + HOVER.lift * up);
      s.rotation.z = (r + (i % 2 ? -1 : 1) * HOVER.turn * hv[i]!) * DEG;
      const b = levels[i - 1];
      if (b) {
        b.position.set(s.position.x, s.position.y, s.position.z - 0.0065);
        b.rotation.z = s.rotation.z;
        b.material.opacity = 1 - HOVER.soft * hv[i]!;
      }
    });
    book.position.z = bookZ + HOVER.lift * up;
    bookShadow.position.z = shadowZ + HOVER.lift * up;
    const t3 = sheets[3]!.rotation.z - s3r * DEG, co = Math.cos(t3), si = Math.sin(t3);
    clip.x = sheets[3]!.position.x + clipAt.x * co - clipAt.y * si;
    clip.y = sheets[3]!.position.y + clipAt.x * si + clipAt.y * co;
    clip.z = clipZ + HOVER.lift * up3;
    clip.turn = 40 + (t3 / DEG);
    return busy;
  }

  return withDesk(ctx, [{ prop: "loupe", x: LOOK.x - 2.1, y: LOOK.y - 1.0, turn: 0 }, clip], {
    rest,
    mark: () => section.getBoundingClientRect().top,
    slot: () => section.querySelector(".world-slot"),
    frame(dt, _now, f) { // the camera orbit, the light parallax, the sheets' fan-in and their hover are its only motion
      const busy = pose(dt, f);
      // The hand is fetched only once the camera heads for About; then both pages' textures get the notes.
      if (!handAsked && f.w > 0) {
        handAsked = true;
        void document.fonts.load(`500 1em ${HAND}`).then(() => {
          hand = true;
          if (gone) return;
          for (const [mat, m] of [[ruled.render, "render"], [ruled.raster, "raster"]] as const) {
            const map = mat.map;
            if (map && ink(map.image as HTMLCanvasElement, m)) map.needsUpdate = true;
          }
          faces.forEach((f, i) => { const map = f.render.map; if (map && inkSheet(map.image as HTMLCanvasElement, "render", i)) map.needsUpdate = true; });
          ctx.request();
        }, () => {});
      }
      if (asked) return busy;
      asked = true;
      void glb(ctx, "notebook", ["edge", "face", "cover", "band"]).then((g) => {
        if (gone) return;
        nb = new Mesh(K.keep(planar(g["notebook"]!, 2.2, 1.52)), nbMats(ctx.mode)); // uvs over the page block, like drawPages
        nb.castShadow = nb.receiveShadow = true;
        book.remove(cover, block, spine);
        book.add(nb);
        ctx.request();
      }, () => {});
      return busy;
    },
    setMode(m: Mode) {
      sheets.forEach((s, i) => {
        const printed = i === sheets.length - 1;
        s.material = [edge[m], printed ? top[m] : faces[i]![m], paper[m]];
        s.castShadow = printed || m === "render";
      });
      top.ensure(m);
      faces.forEach((f) => f.ensure(m));
      cover.material = spine.material = bookM[m];
      block.material = [pageEdge[m], ruled[m], pageEdge[m]];
      if (nb) nb.material = nbMats(m);
      ruled.ensure(m);
      ctx.request();
    },
    dispose() { gone = true; scene.remove(pileShadow, bookShadow, ...levels, ...sheets, book, occluder); K.dispose(); },
  });
}
