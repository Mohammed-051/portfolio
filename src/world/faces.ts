// Canvas-drawn plate faces for the Work station. Real WORK content only: a generated title plate, labelled, no imagery.
import type { WorkItem } from "../lib/content";
import { LINKS, SECTIONS, UI } from "../lib/site";
import type { Mode } from "../rr/store.ts";
import { scribble } from "./doodles.ts";

// Light faces in Raster too: dark faces dither into noise and the titles stop reading.
const INK = {
  render: { bg: "#EDE9E0", panel: "#E2DDD1", ink: "#11110F", ink2: "#3D3A34", mute: "#5F5A51", rule: "#CFC9BB" },
  raster: { bg: "#D9D4C8", panel: "#B8B3A7", ink: "#080807", ink2: "#2C2A26", mute: "#55504A", rule: "#8C877C" },
};
// Render card ink is handwriting (Caveat, one weight, latin basic covers every glyph drawn here; arrows are strokes).
const HAND = '"Caveat"';
const FONT = {
  render: { display: HAND, mono: HAND, dw: 500 },
  raster: { display: '"Doto Variable"', mono: '"JetBrains Mono Variable"', dw: 800 },
};

/** Loads the faces' fonts for a mode; drawing before they arrive would bake a fallback face into the texture. */
export async function fontsFor(mode: Mode): Promise<void> {
  const f = FONT[mode];
  try {
    await Promise.all([document.fonts.load(`${f.dw} 64px ${f.display}`), document.fonts.load(`500 24px ${f.mono}`)]);
    await document.fonts.ready;
  } catch { /* fallback faces */ }
}
/** True once the Render hand face is loaded: a texture drawn before that has a fallback face baked in (kit.face redraws it). */
export const handReady = () => document.fonts.check(`500 64px ${HAND}`);

/** The small-type font: mono in Raster; in Render the hand face, 1.3x larger (Caveat sets small), one weight. */
const small = (mode: Mode, wt: number, px: number) => (mode === "raster" ? `${wt} ${px}px ${FONT.raster.mono}` : `500 ${Math.round(px * 1.3)}px ${HAND}`);

/** Render text as ink: each glyph a hair off its baseline and angle, its alpha a touch uneven, seeded by the text so a
 *  redraw is identical. amp 0.5 for titles (crisp). Honours the context's font, fill, textAlign. Kerning kept by prefix widths. */
function ink(g: CanvasRenderingContext2D, text: string, x: number, y: number, amp = 1) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9 | 0), (h >>> 0) / 4294967296);
  const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(g.font)?.[1] ?? "16"), total = g.measureText(text).width;
  const x0 = g.textAlign === "right" ? x - total : g.textAlign === "center" ? x - total / 2 : x, a0 = g.globalAlpha, al = g.textAlign;
  g.textAlign = "left";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === " ") continue;
    const dx = g.measureText(text.slice(0, i)).width;
    g.save();
    g.translate(x0 + dx, y + (rnd() - 0.5) * px * 0.03 * amp);
    g.rotate((rnd() - 0.5) * 0.04 * amp);
    g.globalAlpha = a0 * (1 - rnd() * 0.12 * amp);
    g.fillText(text[i]!, 0, 0);
    g.restore();
  }
  g.textAlign = al;
}
/** fillText in Raster, ink in Render. */
const put = (g: CanvasRenderingContext2D, mode: Mode, t: string, x: number, y: number, amp = 1) => (mode === "raster" ? g.fillText(t, x, y) : ink(g, t, x, y, amp));

function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Largest size from `from` down whose wrap fits a W x H box at line height lh x size; returns the size and lines. */
function fit(g: CanvasRenderingContext2D, t: string, font: (s: number) => string, from: number, min: number, W: number, H: number, lh: number) {
  let s = from, lines: string[];
  for (;; s -= 1) {
    g.font = font(s);
    lines = wrap(g, t, W);
    if (s <= min || (lines.length * s * lh <= H && lines.every((l) => g.measureText(l).width <= W))) return { s, lines };
  }
}

/** One 1.6:1 plate face, drawn in a 1024 x 640 logical box at width w. No image exists for any project, so the face
 *  is a generated typographic plate of the title (site data only), labelled as generated. */
export function drawFace(item: WorkItem, mode: Mode, w: number): HTMLCanvasElement {
  const p = INK[mode], f = FONT[mode];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = Math.round(w / 1.6);
  const g = c.getContext("2d")!;
  g.scale(w / 1024, w / 1024);
  g.fillStyle = p.bg;
  g.fillRect(0, 0, 1024, 640);
  const L = 56, R = 968, W = R - L;
  const t = item.pre ? `${item.pre} ${item.title}` : item.title;
  const label = UI.work.plateNote.split(".")[0]!.toUpperCase(); // "TITLE PLATE"
  g.textBaseline = "alphabetic";
  if (mode === "raster") {
    // Raster draws the scene at a third of the resolution: a coarse bitmap title survives the dither, fine type does not.
    g.fillStyle = p.ink;
    g.font = `700 48px ${f.mono}`;
    g.fillText(item.kind.toUpperCase(), L, 120, W); // the kind, not a number
    g.fillStyle = p.rule;
    g.fillRect(L, 152, W, 8);
    // The title set on a 8 px grid: drawn small in mono, thresholded to 1 bit, scaled up without smoothing.
    const CELL = 8, gw = W / CELL, gh = 46;
    const b = document.createElement("canvas");
    b.width = gw;
    b.height = gh;
    const bg = b.getContext("2d", { willReadFrequently: true })!;
    const { s, lines } = fit(bg, t.toUpperCase(), (z) => `800 ${z}px ${f.mono}`, 16, 7, gw, gh, 1.15);
    bg.fillStyle = "#000";
    bg.textBaseline = "alphabetic";
    const lh = Math.round(s * 1.15), y0 = Math.round((gh - lh * lines.length) / 2 + s * 0.8);
    lines.forEach((ln, k) => bg.fillText(ln, 0, y0 + k * lh));
    const img = bg.getImageData(0, 0, gw, gh);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i]! >= 110 ? 255 : 0;
    bg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(b, L, 184, W, gh * CELL);
    g.font = `700 30px ${f.mono}`;
    g.fillStyle = p.mute;
    g.fillText(label, L, 604);
    return c;
  }
  g.fillStyle = p.ink2;
  g.font = small(mode, 500, 24);
  put(g, mode, item.kind.toUpperCase(), L, 76);
  g.fillStyle = p.rule;
  g.fillRect(L, 98, W, 2);
  // The plate: the title set large, up to three lines, centred in the field between the rules.
  const top = 112, bot = 548;
  const { s, lines } = fit(g, t, (z) => `${f.dw} ${z}px ${f.display}`, 156, 48, W, bot - top - 24, 1.02);
  const lh = s * 1.02, y0 = top + (bot - top - lh * lines.length) / 2 + s * 0.8;
  g.fillStyle = p.ink;
  lines.forEach((ln, k) => put(g, mode, ln, L - s * 0.04, y0 + k * lh, 0.5));
  g.fillStyle = p.rule;
  g.fillRect(L, 566, W, 2);
  g.font = small(mode, 500, 18);
  g.fillStyle = p.mute;
  const lw = g.measureText(label).width;
  g.textAlign = "right";
  put(g, mode, label, R, 604);
  g.textAlign = "left";
  g.fillStyle = p.ink2;
  g.font = small(mode, 400, 22);
  let meta = item.stack.slice(0, 4).join(", ");
  while (g.measureText(meta).width > W - lw - 32 && meta.includes(", ")) meta = meta.slice(0, meta.lastIndexOf(", "));
  put(g, mode, meta, L, 604);
  return c;
}

// Strips (logical px) where a neighbour plate's title peeks out above/below the front plate; stretch undoes the ~2x foreshortening.
const PEEK = { top: [28, 150], bottom: [490, 612], stretch: 1.6 } as const;

/** A plate's title alone, once in each peek strip, one line: what shows of a neighbour plate on the drum. */
export function drawPeek(item: WorkItem, mode: Mode, w: number): HTMLCanvasElement {
  const p = INK[mode], f = FONT[mode], raster = mode === "raster", S = PEEK.stretch, CELL = 6, gh = 11, L = 56, W = 912;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = Math.round(w / 1.6);
  const g = c.getContext("2d")!;
  g.scale(w / 1024, w / 1024);
  g.fillStyle = p.bg;
  g.fillRect(0, 0, 1024, 640);
  // Raster measures and draws on a tiny bitmap (1 bit, scaled up unsmoothed); Render on the card itself.
  const b = document.createElement("canvas");
  b.width = W / CELL;
  b.height = gh;
  const bg = b.getContext("2d", { willReadFrequently: true })!, mg = raster ? bg : g;
  const font = (z: number) => (raster ? `800 ${z}px ${f.mono}` : small(mode, 500, z)), lim = raster ? b.width : W;
  let t = item.pre ? `${item.pre} ${item.title}` : item.title, s = raster ? 12 : 38;
  if (raster) t = t.toUpperCase();
  mg.font = font(s);
  while (s > (raster ? 7 : 20) && mg.measureText(t).width > lim) mg.font = font(--s);
  if (mg.measureText(t).width > lim) {
    while (t.length > 1 && mg.measureText(`${t}...`).width > lim) t = t.slice(0, -1);
    t = `${t.trimEnd()}...`;
  }
  if (raster) {
    bg.fillStyle = "#000";
    bg.textBaseline = "alphabetic";
    bg.fillText(t, 0, 9);
    const img = bg.getImageData(0, 0, b.width, gh);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i]! >= 110 ? 255 : 0;
    bg.putImageData(img, 0, 0);
    bg.globalCompositeOperation = "source-in"; // tint the 1-bit mask with the ink colour
    bg.fillStyle = p.ink2;
    bg.fillRect(0, 0, b.width, gh);
    g.imageSmoothingEnabled = false;
  }
  for (const [y0, y1] of [PEEK.top, PEEK.bottom]) {
    const cy = (y0 + y1) / 2;
    if (raster) { g.drawImage(b, L, cy - (gh * CELL * S) / 2, W, gh * CELL * S); continue; }
    g.save();
    g.translate(L, cy + s * 1.3 * 0.3 * S);
    g.scale(1, S);
    g.fillStyle = p.mute;
    g.globalAlpha = 0.75;
    ink(g, t, 0, 0);
    g.restore();
  }
  return c;
}

/** A plain paper card (Lab tray, sign-off stack): the kind on top, a title, an honest chip on dummy entries.
 *  `n` is accepted and not printed: no numbers on faces. */
export function drawCard(o: { n?: string; kind?: string; title: string; chip?: boolean; big?: boolean }, mode: Mode, w: number, ratio = 1.6): HTMLCanvasElement {
  const p = INK[mode], f = FONT[mode], H = Math.round(1024 / ratio);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = Math.round(w / ratio);
  const g = c.getContext("2d")!;
  g.scale(w / 1024, w / 1024);
  g.fillStyle = p.bg;
  g.fillRect(0, 0, 1024, H);
  const L = 64, R = 960, W = R - L, raster = mode === "raster";
  g.fillStyle = p.ink2;
  g.font = small(mode, 500, raster ? 64 : 34);
  if (o.kind) { if (raster) g.fillText(o.kind.toUpperCase(), L, 120, W); else put(g, mode, o.kind.toUpperCase(), L, 96); }
  g.fillStyle = p.rule;
  g.fillRect(L, raster ? 156 : 124, W, raster ? 8 : 2);
  let s = o.big ? 200 : raster ? 120 : 92, lines: string[];
  const t = raster ? o.title.toUpperCase() : o.title;
  do { g.font = `${f.dw} ${s}px ${f.display}`; lines = wrap(g, t, W); s -= 4; } while ((lines.length > 2 || lines.some((l) => g.measureText(l).width > W)) && s > 36);
  s += 4;
  g.fillStyle = p.ink;
  const y0 = H - 72 - (o.chip ? 70 : 0) - (Math.min(2, lines.length) - 1) * s * 1.04;
  lines.slice(0, 2).forEach((ln, k) => put(g, mode, ln, L, y0 + k * s * 1.04, 0.5));
  if (o.chip) {
    g.font = small(mode, 500, raster ? 44 : 28);
    const cw = g.measureText(UI.dummy).width + 32;
    g.strokeStyle = p.mute;
    g.lineWidth = raster ? 6 : 2;
    g.strokeRect(L, H - (raster ? 110 : 106), cw, raster ? 60 : 46);
    g.fillStyle = p.mute;
    put(g, mode, UI.dummy, L + 16, H - (raster ? 64 : 74));
  }
  return c;
}

/** The four contact tiles on the sign's top face, in its 1024 x 640 logical box: Email then the LINKS, in DOM order, a
 *  2 x 2 grid read row by row (wide tiles: ARTSTATION stays legible through Raster's dither). */
export const TILES = [0, 1, 2, 3].map((i) => ({ x: 64 + (i % 2) * 460, y: 168 + (i >> 1) * 224, w: 436, h: 200 }));
export const TILE_LABELS = ["Email", ...LINKS.map((l) => l.label)];

/** The sign's top face: the section name, a rule, and the four channels as printed tiles. Real channels
 *  only; the DOM controls sit exactly over the tiles (index.ts). */
export function drawContact(mode: Mode, w: number): HTMLCanvasElement {
  const p = INK[mode], raster = mode === "raster", sec = SECTIONS.at(-1)!;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = Math.round(w / 1.6);
  const g = c.getContext("2d")!;
  g.scale(w / 1024, w / 1024);
  g.fillStyle = p.bg;
  g.fillRect(0, 0, 1024, 640);
  const L = 64, R = 960;
  g.fillStyle = p.ink2;
  g.font = small(mode, 700, raster ? 48 : 30);
  put(g, mode, sec.title.toUpperCase(), L, raster ? 108 : 100);
  g.fillStyle = p.rule;
  g.fillRect(L, raster ? 136 : 128, R - L, raster ? 8 : 2);
  scribble(g, "plane", 850, 72, raster ? 0.6 : 1.1, raster, p.ink2); // free top-right corner, above the rule
  const lw = raster ? 8 : 3;
  TILES.forEach((t, i) => {
    g.fillStyle = p.panel;
    g.beginPath(); g.roundRect(t.x, t.y, t.w, t.h, raster ? 0 : 14); g.fill();
    g.strokeStyle = p.ink2;
    g.lineWidth = lw;
    g.beginPath(); g.roundRect(t.x + lw / 2, t.y + lw / 2, t.w - lw, t.h - lw, raster ? 0 : 13); g.stroke();
    // The label, fitted to the tile; Raster sets it larger and heavier so the dither keeps it.
    const label = TILE_LABELS[i]!.toUpperCase();
    let s = raster ? 64 : 44;
    do g.font = small(mode, 800, s--); while (g.measureText(label).width > t.w - 56 && s > 12);
    g.fillStyle = p.ink;
    put(g, mode, label, t.x + 28, t.y + 28 + s);
    // The action, bottom right: Copy on Email, an out-arrow on the links. Paths, not a glyph.
    g.strokeStyle = p.ink;
    g.lineWidth = raster ? 10 : 4;
    g.lineCap = "square";
    const ax = t.x + t.w - 32, ay = t.y + t.h - 32, a = raster ? 60 : 44;
    if (i === 0) {
      g.font = small(mode, 800, raster ? 44 : 28);
      g.textAlign = "right";
      put(g, mode, UI.contact.copy.toUpperCase(), ax + 4, ay);
      g.textAlign = "left";
    } else {
      g.beginPath();
      g.moveTo(ax - a, ay); g.lineTo(ax, ay - a);
      g.moveTo(ax - a * 0.6, ay - a); g.lineTo(ax, ay - a); g.lineTo(ax, ay - a * 0.4);
      g.stroke();
    }
  });
  return c;
}
