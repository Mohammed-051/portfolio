// Gel-pen doodles on the table: a small seeded canvas pen (after Rough.js and Wood et al., "Sketchy Rendering"): points
// jittered inside a roughness circle, lines bowed through random points near 50 and 75 percent, loops that overshoot their
// start, an odd second pass, near-uniform width with a faint swell, an ink blob where the pen lands and a thin lift-off tail.
// Seeded by the art's name, so a redraw is identical. Words are Caveat in Render (per-glyph jitter, like faces.ts ink) and
// JetBrains Mono regular in Raster (1.7-texel strokes), where the whole sheet is thresholded to 1 bit so the Bayer pass keeps every stroke.
// Static decals, never animated. Work's cue (cues.ts) draws its art from here too.
import { Mesh, MeshStandardMaterial, PlaneGeometry, type CanvasTexture, type Material } from "three";
import type { Mode } from "../rr/store.ts";
import type { Ctx, Station } from "./core.ts";
import { kit } from "./kit.ts";

const DEG = Math.PI / 180;
const RS = 0.22; // Raster canvas scale: about 87 texels per wu, the cue's old density
const INK = { render: "#F2EFE8", raster: "#EBE7DD", red: "#FF4F3A" };
const CAT = "#15130F"; // the cat's near-black fill
type Pt = [number, number];

/** Where each group lies. at: the station it belongs to (documentation); x, y: table wu; turn: degrees; w: plane width in wu. */
export const SPOTS = [
  { at: "work", x: -1.1, y: -0.5, turn: 6, w: 1.1, art: "hi" },
  { at: "about", x: 5.6, y: -6.7, turn: -34, w: 1.4, art: "zzz" }, // left of the notebook, toward the clock: the clock's own corner is too dark to read ink
  { at: "lab", x: -4.45, y: -16.75, turn: 4, w: 1.3, art: "coffee" }, // the arrow tip lands by the mug's right edge
  { at: "lab", x: -5.72, y: -15.45, turn: -5, w: 0.45, art: "steam" }, // rising off the mug (-5.63, -16.36), past its rim on screen
  { at: "lab", x: -3.0, y: -20.55, turn: 0, w: 0.6, art: "scroll" }, // under the tray's right end (x -7.2..-2.8)
  { at: "contact", x: 0.6, y: -25.85, turn: 3, w: 0.9, art: "night" }, // above the card, inside the lamp pool, left of the clip (1.9, -26.4)
  { at: "about", x: 4.25, y: -7.95, turn: 8, w: 1.15, art: "cat" }, // in the lit window patch left of the sheets, below the Zzz (the far desk sits in the mullion shade)
  { at: "about", x: 4.04, y: -11.73, turn: -8, w: 1.0, art: "tap" }, // the arrow aims at the tablet (4.65, -12.42)
  { at: "lab", x: -4.0, y: -20.2, turn: 3, w: 0.85, art: "bench" }, // under the tray, between it and the pens, arrow up at the cards
  { at: "contact", x: -0.5, y: -26.05, turn: 2, w: 1.1, art: "copy" }, // above the card's top-left in the lamp pool, arrow down to the email tile
];

function pen(g: CanvasRenderingContext2D, raster: boolean, seed: number, thick = 1) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const j = (r: number) => (rnd() - 0.5) * 2 * r;
  const lw = (raster ? 1.7 / RS * thick : 3), R = raster ? 3.5 : 2.2, col = raster ? INK.raster : INK.render;
  /** One pen stroke along pts: width swells a touch mid-stroke, a blob at pen-down, a thin tail at lift-off (not in Raster: 1.7 texels minimum). */
  function trace(pts: Pt[], c: string, a = 1) {
    g.fillStyle = g.strokeStyle = c; g.globalAlpha = a; g.lineCap = "round";
    g.beginPath(); g.arc(pts[0]![0], pts[0]![1], lw * 0.78, 0, 2 * Math.PI); g.fill();
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      g.lineWidth = lw * (0.92 + 0.16 * Math.sin(Math.PI * t)) * (raster || t < 0.88 ? 1 : Math.max(0.45, 1 - (t - 0.88) * 6));
      g.beginPath(); g.moveTo(...pts[i]!); g.lineTo(...pts[i + 1]!); g.stroke();
    }
    g.globalAlpha = 1;
  }
  const stroke = (pts: Pt[], c: string) => {
    trace(pts, c);
    if (!raster && rnd() < 0.3) { const dx = j(lw * 0.6), dy = j(lw * 0.6); trace(pts.map(([x, y]) => [x + dx + j(R * 0.4), y + dy + j(R * 0.4)] as Pt), c, 0.8); }
  };
  const bez = (p: Pt, c1: Pt, c2: Pt, q: Pt, n: number) => Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
    return [a * p[0] + b * c1[0] + d * c2[0] + e * q[0], a * p[1] + b * c1[1] + d * c2[1] + e * q[1]] as Pt;
  });
  /** A line bowed through random points near 50 and 75 percent; the jitter shrinks for long lines (Rough.js gain). */
  function line(x1: number, y1: number, x2: number, y2: number, c = col) {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1, off = Math.min(R * (len < 200 ? 1 : len > 500 ? 0.4 : 1.233 - 0.00167 * len), len / 10);
    const at = (t: number, o: number): Pt => [x1 + (x2 - x1) * t + j(o), y1 + (y2 - y1) * t + j(o)];
    stroke(bez(at(0, off), at(0.5, off * 1.6), at(0.75, off * 1.6), at(1, off), Math.max(6, Math.ceil(len / 10))), c);
  }
  /** Catmull-Rom through pts, each jittered; closed wraps round into a loop. */
  function spline(pts: Pt[], closed = false) {
    const p = pts.map(([x, y]) => [x + j(R), y + j(R)] as Pt), out: Pt[] = [], n = p.length;
    const at = (i: number) => (closed ? p[(i + n) % n]! : p[Math.min(n - 1, Math.max(0, i))]!);
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = at(i - 1), b = at(i), d = at(i + 1), e = at(i + 2);
      for (let k = 0; k < 8; k++) {
        const t = k / 8, t2 = t * t, t3 = t2 * t, f = (u: number, v: number, w: number, z: number) => 0.5 * (2 * v + (-u + w) * t + (2 * u - 5 * v + 4 * w - z) * t2 + (-u + 3 * v - 3 * w + z) * t3);
        out.push([f(a[0], b[0], d[0], e[0]), f(a[1], b[1], d[1], e[1])]);
      }
    }
    out.push(closed ? out[0]! : p[n - 1]!);
    return out;
  }
  const curve = (pts: Pt[], c = col) => stroke(spline(pts), c);
  /** Fills a closed jittered spline in c and returns its path, so rim(path) can outline the very same edge later. */
  function blob(pts: Pt[], c: string) {
    const o = spline(pts, true);
    g.fillStyle = c; g.beginPath(); o.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
    return o;
  }
  const rim = (o: Pt[], c = col) => stroke(o, c);
  /** An ellipse that runs past its start and drifts a little, so the ends never meet. */
  function loop(cx: number, cy: number, rx: number, ry: number, c = col) {
    const a0 = rnd() * 2 * Math.PI, sweep = 2 * Math.PI * (1.1 + rnd() * 0.06), drift = (rnd() < 0.5 ? -1 : 1) * 0.08, ph = rnd() * 6, pts: Pt[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = a0 + (sweep * i) / 40, k = 1 + (drift * i) / 40 + 0.02 * Math.sin(2 * a + ph);
      pts.push([cx + rx * k * Math.cos(a) + j(R * 0.4), cy + ry * k * Math.sin(a) + j(R * 0.4)]);
    }
    stroke(pts, c);
  }
  const dot = (x: number, y: number, c = col) => { g.fillStyle = c; g.beginPath(); g.arc(x + j(R * 0.3), y + j(R * 0.3), lw * 0.95, 0, 2 * Math.PI); g.fill(); };
  function arrow(x1: number, y1: number, x2: number, y2: number, c = col) {
    line(x1, y1, x2, y2, c);
    const an = Math.atan2(y2 - y1, x2 - x1), hl = Math.min(26, Math.hypot(x2 - x1, y2 - y1) * 0.3);
    for (const d of [-0.5, 0.5]) line(x2, y2, x2 + hl * Math.cos(an + Math.PI + d + j(0.1)), y2 + hl * Math.sin(an + Math.PI + d + j(0.1)), c);
  }
  /** Straight-sided stroke through vertices (jittered), for stars. */
  function poly(v: Pt[], c = col) {
    const out: Pt[] = [], p = v.map(([x, y]) => [x + j(R), y + j(R)] as Pt);
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i]!, [bx, by] = p[i + 1]!, n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 8));
      for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
    }
    out.push(p[p.length - 1]!);
    stroke(out, c);
  }
  const star = (cx: number, cy: number, r: number, c = col) => {
    const v = [0, 2, 4, 1, 3, 0, 2].map((i) => [cx + r * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / 5), cy + r * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / 5)] as Pt);
    poly(v, c); // the last vertex runs past the first: the pentagram never quite closes
  };
  const spark = (cx: number, cy: number, r: number) => {
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, k = i % 2 ? 0.55 : 1; line(cx + r * 0.25 * Math.cos(a), cy + r * 0.25 * Math.sin(a), cx + r * k * Math.cos(a), cy + r * k * Math.sin(a)); }
  };
  /** A wavy stroke from (x1, y1) to (x2, y2): steam, or a scribble. */
  const squig = (x1: number, y1: number, x2: number, y2: number, amp: number, waves: number) => {
    const n = Math.round(waves * 6), len = Math.hypot(x2 - x1, y2 - y1) || 1, pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, o = Math.sin(t * waves * 2 * Math.PI) * amp * (0.8 + 0.4 * rnd());
      pts.push([x1 + (x2 - x1) * t - ((y2 - y1) / len) * o, y1 + (y2 - y1) * t + ((x2 - x1) / len) * o]);
    }
    curve(pts);
  };
  /** Writes text at its baseline start (x, y), rot radians; returns its width. */
  function word(t: string, x: number, y: number, px: number, rot = 0, c = col) {
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = c; g.textAlign = "left";
    g.font = raster ? `400 ${px}px "JetBrains Mono Variable", monospace` : `500 ${Math.round(px * 1.25)}px "Caveat", cursive`;
    const w = g.measureText(t).width;
    if (raster) g.fillText(t, 0, 0);
    else for (let i = 0; i < t.length; i++) {
      if (t[i] === " ") continue;
      g.save(); g.translate(g.measureText(t.slice(0, i)).width, j(px * 0.015)); g.rotate(j(0.02)); g.globalAlpha = 1 - rnd() * 0.1; g.fillText(t[i]!, 0, 0); g.restore();
    }
    g.restore();
    return w;
  }
  return { raster, ink: col, line, curve, blob, rim, loop, dot, arrow, star, spark, squig, word, red: INK.red };
}
type Pen = ReturnType<typeof pen>;

const ARTS: Record<string, { w: number; h: number; draw(p: Pen): void }> = {
  // Work cue: up and down arrows, "drag" with a small pair, "click to open" with a red circle round "click".
  cue: { w: 512, h: 384, draw(p) {
    p.arrow(60, 330, 60, 60); p.arrow(125, 60, 125, 330);
    p.word("drag", 190, 130, 86, -0.04);
    p.arrow(425, 140, 425, 68); p.arrow(470, 68, 470, 140);
    const w = p.word("click", 196, 265, 74, 0.02);
    p.loop(196 + w / 2, 239, w / 2 + 34, 48, p.red);
    p.word("to open", 214, 340, 58, 0.02);
  } },
  hi: { w: 440, h: 300, draw(p) {
    p.loop(80, 100, 50, 50); p.dot(64, 88); p.dot(98, 88); p.curve([[52, 112], [80, 134], [110, 112]]);
    const w = p.word("hi!", 160, 120, 84, -0.07);
    p.line(164, 148, 160 + w * 0.85, 142, p.red);
    p.star(350, 60, 28); p.star(400, 150, 19);
    p.squig(150, 225, 380, 225, 12, 3);
  } },
  zzz: { w: 400, h: 300, draw(p) {
    p.word("Z", 30, 170, 100, -0.1); p.word("z", 100, 125, 76, -0.06); p.word("z", 150, 85, 56, 0.04);
    p.spark(300, 70, 34);
    const a = p.word("late", 30, 265, 58), x = 30 + a + 20, b = p.word("night", x, 265, 58);
    p.line(x, 284, x + b, 280, p.red);
  } },
  coffee: { w: 520, h: 190, draw(p) {
    p.arrow(108, 62, 18, 26);
    p.word("coffee?", 120, 130, 86, 0.02);
  } },
  steam: { w: 220, h: 330, draw(p) {
    p.squig(55, 310, 60, 40, 13, 3); p.squig(110, 290, 104, 70, 13, 2.5); p.squig(165, 305, 170, 50, 13, 3);
  } },
  scroll: { w: 300, h: 320, draw(p) {
    const w = p.word("scroll", 16, 90, 72, -0.03);
    p.line(20, 112, 16 + w, 108, p.red);
    p.arrow(130, 140, 134, 300);
  } },
  night: { w: 520, h: 300, draw(p) {
    p.star(80, 80, 34); p.star(200, 50, 20); p.star(430, 90, 26);
    p.loop(300, 190, 46, 46); p.dot(285, 178); p.dot(317, 178); p.curve([[278, 202], [300, 222], [326, 200]]);
  } },
  // About desk: the black loafing cat, white pen rim on a dark fill (the rim stays white after Raster's 1-bit threshold), big eyes
  // glancing right toward the tablet, one red yarn ball. Painter's order: each part's fill, then its rim, so the head hides the ear bases.
  cat: { w: 360, h: 300, draw(p) {
    const ell = (cx: number, cy: number, rx: number, ry: number) => Array.from({ length: 8 }, (_, i) => [cx + rx * Math.cos(i * Math.PI / 4), cy + ry * Math.sin(i * Math.PI / 4)] as Pt);
    p.rim(p.blob([[60, 215], [70, 178], [120, 158], [200, 152], [260, 165], [298, 200], [305, 245], [280, 264], [180, 270], [90, 268], [58, 248]], CAT));
    p.rim(p.blob([[300, 252], [288, 278], [240, 286], [170, 288], [100, 286], [60, 280], [48, 268], [66, 262], [110, 268], [170, 270], [240, 268], [274, 260]], CAT)); // tail curled round the front
    p.rim(p.blob([[92, 98], [86, 70], [83, 40], [104, 58], [126, 84]], CAT)); p.rim(p.blob([[192, 98], [198, 70], [201, 40], [180, 58], [158, 84]], CAT)); // ears
    p.rim(p.blob(ell(142, 128, 65, 50), CAT));
    for (const x of [116, 168]) { // eyes about 0.3 of the 130 head width, pupil and glint toward the tablet
      if (p.raster) { p.blob(ell(x, 130, 25, 27), p.ink); p.blob(ell(x + 7, 132, 13, 14), CAT); continue; } // Raster: bigger solid eyes, no glint
      p.blob(ell(x, 130, 19, 21), p.ink); p.blob(ell(x + 6, 132, 10, 11), CAT); p.blob(ell(x + 9, 127, 3.5, 3.5), p.ink);
    }
    if (!p.raster) for (const [y, dy] of [[142, -12], [150, 0], [158, 14]] as const) { p.line(92, y, 40, y + dy); p.line(192, y, 244, y + dy); } // whiskers
    p.blob(ell(36, 240, 12, 12), p.red); p.curve([[30, 234], [38, 240], [44, 246]], p.red); // yarn ball by the paw
  } },
  tap: { w: 480, h: 260, draw(p) {
    p.word("tap screen", 16, 100, 84, -0.03);
    p.curve([[110, 140], [160, 195], [250, 215]]); p.arrow(250, 215, 420, 200);
  } },
  bench: { w: 460, h: 200, draw(p) {
    p.curve([[96, 150], [52, 140], [40, 96]]); p.arrow(40, 96, 46, 24);
    const w = p.word("pick one", 110, 160, 70, -0.02);
    p.line(114, 182, 110 + w, 178, p.red);
  } },
  copy: { w: 640, h: 200, draw(p) {
    const w = p.word("click to copy", 16, 80, 62, -0.01);
    p.line(20, 102, 16 + w, 98, p.red);
    p.curve([[w + 30, 56], [w + 84, 70], [w + 100, 128]]); p.arrow(w + 100, 128, w + 92, 186);
  } },
};
/** One tiny ink doodle (about 80 design px across, centred on x, y) in the given ink, k = canvas px per design px. For other
 *  canvases (About sheets, the Contact card) so they share this pen instead of a second stroke kit. */
export function scribble(g: CanvasRenderingContext2D, kind: "star" | "spiral" | "check" | "plane", x: number, y: number, k: number, raster: boolean, ink: string) {
  const p = pen(g, raster, seedOf(kind));
  g.save(); g.translate(x, y); g.scale(k, k);
  if (kind === "star") p.star(0, 0, 36, ink);
  else if (kind === "spiral") p.curve(Array.from({ length: 25 }, (_, i) => [1.5 * i * Math.cos(i * 0.55), 1.5 * i * Math.sin(i * 0.55)] as Pt), ink);
  else if (kind === "check") { p.line(-32, 2, -9, 28, ink); p.line(-9, 28, 34, -28, ink); }
  else { // paper plane, nose right, with a dotted trail
    p.line(-10, 0, 40, -22, ink); p.line(40, -22, 4, 26, ink); p.line(4, 26, 0, 6, ink); p.line(0, 6, -10, 0, ink); p.line(0, 6, 40, -22, ink);
    for (const [dx, dy] of [[-22, 6], [-36, 14], [-50, 12]] as const) p.dot(dx, dy, ink);
  }
  g.restore();
}
const seedOf = (name: string) => [...name].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261);

/** The cat alone gets 2x Raster texel density and a 1.6x rim so its silhouette survives the 1-bit threshold and dither. */
const rs = (name: string) => (name === "cat" ? RS * 2 : RS), rimK = (name: string, raster: boolean) => (raster && name === "cat" ? 2.2 : 1);
/** A blank canvas for art `name`: design px in Render, RS of that in Raster. */
export function sheet(name: string, raster: boolean) {
  const a = ARTS[name]!, c = document.createElement("canvas"), k = raster ? rs(name) : 1;
  c.width = Math.round(a.w * k); c.height = Math.round(a.h * k);
  return c;
}
/** (Re)draws art `name` on its sheet; Raster thresholds the alpha to 1 bit so no stroke dithers into dots. */
export function paint(c: HTMLCanvasElement, name: string, raster: boolean) {
  const a = ARTS[name]!, g = c.getContext("2d", { willReadFrequently: raster })!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  g.scale(c.width / a.w, c.width / a.w);
  a.draw(pen(g, raster, seedOf(name), rimK(name, raster)));
  if (!raster) return;
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i]! > 90 ? 255 : 0;
  g.putImageData(d, 0, 0);
}
/** Runs paint once the mode's fonts are in; Render once more if the hand face lands later. */
export async function whenInk(m: Mode, paintNow: () => void) {
  const f = await import("./faces.ts");
  await f.fontsFor(m);
  paintNow();
  if (m === "render" && !f.handReady()) void document.fonts.load('500 64px "Caveat"').then(paintNow, () => {});
}

/** Lays SPOTS on the table as decals and rides on a host station's setMode and dispose (no frame work: they never animate). */
export function withDoodles<S extends Station>(ctx: Ctx, st: S): S {
  const K = kit(ctx), keys = [...new Set(SPOTS.map((s) => s.art))];
  const done = new Map<string, { c: Record<Mode, HTMLCanvasElement>; t: Record<Mode, CanvasTexture>; m: Record<Mode, Material> }>();
  for (const k of keys) {
    const c = { render: sheet(k, false), raster: sheet(k, true) }, t = { render: K.tex(c.render, false), raster: K.tex(c.raster, true) };
    const toon = Object.assign(K.toon(0xffffff, true), { map: t.raster, transparent: true, depthWrite: false });
    const std = K.keep(new MeshStandardMaterial({ map: t.render, transparent: true, opacity: 0.75, roughness: 1, metalness: 0, depthWrite: false }));
    done.set(k, { c, t, m: { render: std, raster: toon } });
  }
  const meshes = SPOTS.map((s) => {
    const a = ARTS[s.art]!, m = new Mesh(K.keep(new PlaneGeometry(s.w, (s.w * a.h) / a.w)), done.get(s.art)!.m[ctx.mode]);
    m.position.set(s.x, s.y, 0.004);
    m.rotation.z = s.turn * DEG;
    m.receiveShadow = true; m.castShadow = false;
    ctx.scene.add(m);
    return m;
  });
  let gone = false, rasterAsked = false;
  const ink = (m: Mode) => {
    if (m === "raster") { if (rasterAsked) return; rasterAsked = true; }
    void whenInk(m, () => {
      if (gone) return;
      for (const [k, d] of done) { paint(d.c[m], k, m === "raster"); d.t[m].needsUpdate = true; }
      ctx.request();
    });
  };
  ink("render");
  if (ctx.mode === "raster") ink("raster");
  const setMode = st.setMode.bind(st), dispose = st.dispose.bind(st);
  st.setMode = (m) => { setMode(m); meshes.forEach((x, i) => { x.material = done.get(SPOTS[i]!.art)!.m[m]; }); if (m === "raster") ink(m); ctx.request(); };
  st.dispose = () => { gone = true; ctx.scene.remove(...meshes); dispose(); K.dispose(); };
  return st;
}
