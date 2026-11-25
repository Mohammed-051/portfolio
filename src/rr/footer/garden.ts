// Render-mode footer garden: ink line-art plants cut from one atlas, laid out around the last line of the name in three layers
// (back canvas: edge clusters, vines, gap peekers; front canvas: the low hiding spots). Each plant is a rustle spring.
// The static ground (grain, silhouettes, shadows, ground line, ground cover) is painted once per geometry into an offscreen cache.
import type { Line, Palette } from "./world.ts";

/** "name x y w h [R|L|F]" rows to {name: [x, y, w, h, facing]}; facing R = 1, L = -1, F = 0. */
export const parse = (s: string) =>
  Object.fromEntries(s.split(";").map((r) => { const [n = "", ...v] = r.split(" "); return [n, v.map((x) => (x === "R" ? 1 : x === "L" ? -1 : x === "F" ? 0 : +x))]; })) as Record<string, number[]>;

const M = parse("potted_fern 617 1 458 442;hanging_vine 1 1 298 555;tall_broadleaf 301 1 314 489;wild_grass 1077 1 439 431;leafy_turf 350 947 513 260;botanical_shrub 593 558 385 339;wild_undergrowth 980 558 558 338;scratching_post 1540 558 226 329;woven_basket 1 947 347 325;leafy_stems 1518 1 430 394;dainty_foliage 305 558 286 354;fine_sprigs 1 558 302 387");

/** Opaque plants: the cat can hide behind them. wild_grass is too thin. */
const COVER = new Set(["woven_basket", "leafy_turf", "botanical_shrub", "wild_undergrowth", "potted_fern", "dainty_foliage"]);
const MA = 10, SA = Math.sin(MA * Math.PI / 180), NC = 48; // max sway angle (deg), its sine, contour columns
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** s: scale, f: flip, t: hangs from y, c: opaque cover (valid peek spot), a/v: rustle angle and velocity (deg), b: box [x0, y0, x1, y1]. */
export interface Plant { n: string; x: number; y: number; s: number; f: number; t: boolean; c: boolean; a: number; v: number; ph: number; b: [number, number, number, number] }

const mk = (n: string, x: number, y: number, h: number, f = 1, t = false, mw = 1e9): Plant => {
  const m = M[n]!, s = Math.min(h / m[3]!, mw / m[2]!), w = m[2]! * s, hh = m[3]! * s;
  return { n, x, y, s, f, t, c: COVER.has(n) && !t, a: 0, v: 0, ph: x * .013, b: [x - w / 2, t ? y : y - hh, x + w / 2, t ? y + hh : y] };
};

/** All sizes follow cap (cap line to baseline); positions follow the letters. Fewer pieces under 620 units. No randomness. */
export function layout(W: number, H: number, L: Line) {
  const cap = L.base - L.top, gy = Math.min(L.base + .04 * cap, H - .02 * cap), l = L.l, nc = (l.length >> 1) - (L.ch.endsWith(".") ? 1 : 0), nar = W < 620, pad = .03 * cap;
  const x0 = l[0] ?? 0, x1 = l[l.length - 1] ?? W, bk: Plant[] = [], fr: Plant[] = [];
  const hasStop = L.ch.endsWith("."), s0 = hasStop ? l[l.length - 2]! : x1;
  // a plant swayed by the max angle (rotation plus its skew, about 1.5 h sin) stays inside [pad, W - pad]
  const put = (p: Plant) => {
    const w = p.b[2] - p.b[0], ins = (p.b[3] - p.b[1]) * 1.5 * SA + w / 2 + pad, x = Math.max(ins, Math.min(W - ins, p.x)), d = x - p.x;
    p.x = x; p.b[0] += d; p.b[2] += d;
    return p;
  };
  let gi = 0, gw = 0;
  for (let i = 0; i < nc - 1; i++) { const w = l[2 * i + 2]! - l[2 * i + 1]!; if (w > gw) { gw = w; gi = i; } }
  const gc = (i: number) => { const j = Math.min(i, nc - 2); return (l[2 * j + 1]! + l[2 * j + 2]!) / 2; };
  const lc = (i: number) => (l[2 * i]! + l[2 * i + 1]!) / 2;
  type Row = [string, number, number];
  // back: peekers behind the gaps between letters, edge clusters, vines in the top corners
  const gaps: Row[] = nc > 1 ? [["wild_grass", gi, 0], ["fine_sprigs", Math.round(nc * .25), 0], ["leafy_stems", Math.round(nc * .75), 0]] : [];
  for (const [nm, i] of gaps.slice(0, nar ? 1 : 3)) bk.push(put(mk(nm, gc(i), gy, .45 * cap)));
  const lr0: Row[] = nar ? [["potted_fern", .5, 1.1]] : [["potted_fern", .5, 1.15], ["tall_broadleaf", 1.15, 1.3], ["scratching_post", 1.7, .8]];
  const rc: Row[] = nar ? [["woven_basket", .4, .7], ["botanical_shrub", .95, .9]] : [["woven_basket", .4, .7], ["botanical_shrub", .95, .9], ["leafy_stems", 1.5, 1], ["dainty_foliage", 2, 1.1]];
  lr0.forEach(([nm, c, h], i) => bk.push(put(mk(nm, c * cap, gy, h * cap, i % 2 ? -1 : 1))));
  rc.forEach(([nm, c, h], i) => bk.push(put(mk(nm, W - c * cap, gy, h * cap, i % 2 ? 1 : -1))));
  bk.push(put(mk("hanging_vine", .3 * cap, pad, 1.1 * cap, 1, true)));
  if (!nar) bk.push(put(mk("hanging_vine", W - .3 * cap, pad, 1.1 * cap, -1, true)));
  // front: left edge cluster, low bushes under the middle of the name, right edge cluster (never over the stop, the last letter)
  let lr = x0 + .1 * cap;
  for (const [nm, h] of (nar ? [["leafy_turf", .34]] : [["leafy_turf", .34], ["woven_basket", .34]]) as [string, number][]) {
    const m = M[nm]!, w = (h * cap * m[2]!) / m[3]!, r = Math.max(lr, w);
    fr.push(put(mk(nm, r - w / 2, gy, h * cap))); lr = r - w * .6;
  }
  if (nc > 1) fr.push(put(mk("wild_grass", gc(gi), gy, .3 * cap, 1, false, Math.max(gw, .25 * cap))));
  const mid: [string, number, number][] = nar ? [["botanical_shrub", .46, .3]] : [["leafy_turf", .22, .26], ["botanical_shrub", .46, .32], ["wild_undergrowth", .68, .28]];
  for (const [nm, f, h] of mid) if (nc > 1) fr.push(put(mk(nm, lc(Math.round(f * (nc - 1))), gy, h * cap)));
  // right edge: after the stop when there is room, else over the foot of the last letter (the outer-edge exception), never on the stop
  let rr = W - x1 > .5 * cap ? W - .05 * cap : s0 - .08 * cap;
  for (const [nm, h] of (nar ? [["botanical_shrub", .34]] : [["botanical_shrub", .34], ["wild_undergrowth", .34]]) as [string, number][]) {
    const m = M[nm]!, w = (h * cap * m[2]!) / m[3]!, r = Math.min(rr, W - .05 * cap);
    if (r - w < x0 + .5 * cap) continue;
    const p = put(mk(nm, r - w / 2, gy, h * cap, nm === "botanical_shrub" ? -1 : 1));
    rr = r - w * .6;
    if (!(hasStop && p.b[2] > s0 && p.b[0] < x1)) fr.push(p);
  }
  return { bk, fr, gy };
}

if (import.meta.env.DEV) {
  const l: number[] = [];
  for (let i = 0; i < 15; i++) l.push(100 + i * 50, 140 + i * 50);
  const { bk, fr, gy } = layout(1000, 520, { top: 100, base: 400, l, ch: "MOHAMMEDPARVEZ." });
  console.assert(
    bk.length > 4 && fr.length >= 4 && fr.some((p) => p.c) && gy === 412 && fr.every((p) => p.y === gy && (p.b[2] <= l[28]! || p.b[0] >= l[29]!)) && bk.concat(fr).every((p) => p.b[0] >= 0 && p.b[2] <= 1000),
    "garden: layout is thin, has no cover, a front plant covers the stop, or a plant leaves the stage",
  );
}

export const kick = (p: Plant, v: number) => { p.v = Math.max(-120, Math.min(120, p.v + v)); };

/** Rustle springs (deg), underdamped: a kicked plant wobbles a few times. The angle is clamped to the max sway. */
export function sway(ps: Plant[], d: number) {
  const n = Math.max(1, Math.ceil(d / .016)), h = d / n;
  for (const p of ps) for (let i = 0; i < n; i++) {
    p.v += (-70 * p.a - 4 * p.v) * h; p.a += p.v * h;
    if (Math.abs(p.a) > MA) { p.a = Math.sign(p.a) * MA; if (p.a * p.v > 0) p.v = 0; }
  }
}

let tk = "", tc: HTMLCanvasElement | null = null;
const PR: Record<string, Float32Array> = {}; // rest top contour per sprite: NC columns, fraction of the sprite height down from its top
const rgb = (col: string) => {
  const c = document.createElement("canvas"); c.width = c.height = 1;
  const x = c.getContext("2d")!; x.fillStyle = col; x.fillRect(0, 0, 1, 1);
  return x.getImageData(0, 0, 1, 1).data;
};
const rc = new Map<string, Uint8ClampedArray>();
/** "rgba(...)" of a palette colour at alpha a. */
export const rgba = (col: string, a: number) => { let v = rc.get(col); if (!v) rc.set(col, (v = rgb(col))); return `rgba(${v[0]},${v[1]},${v[2]},${a})`; };

/** The atlas is grey line art: grey 0 becomes ink, grey 255 (opaque interiors) becomes paper. Cached per palette. */
export function tint(img: HTMLImageElement, p: Palette) {
  const k = p.ink + p.paper;
  if (tc && tk === k) return tc;
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), q = d.data, a = rgb(p.ink), b = rgb(p.paper);
  if (!PR.leafy_turf) { // contours from the alpha, once
    for (const n in M) {
      const [mx, my, mw, mh] = M[n] as [number, number, number, number], o = new Float32Array(NC);
      for (let j = 0; j < NC; j++) {
        const c0 = mx + Math.floor(j * mw / NC), c1 = mx + Math.max(c0 - mx + 1, Math.floor((j + 1) * mw / NC));
        let t = mh;
        for (let r = 0; r < mh && t === mh; r++) for (let u = c0; u < c1; u++) if (q[((my + r) * c.width + u) * 4 + 3]! > 40) { t = r; break; }
        o[j] = t / mh;
      }
      PR[n] = o;
    }
  }
  for (let i = 0; i < q.length; i += 4) {
    const t = q[i]! / 255;
    for (let j = 0; j < 3; j++) q[i + j] = a[j]! + (b[j]! - a[j]!) * t;
  }
  x.putImageData(d, 0, 0); tk = k;
  return (tc = c);
}

/** World y of the plant's rest top contour at world x (the box top while the atlas is unknown). */
export function top(p: Plant, x: number) {
  const a = PR[p.n], m = M[p.n]!;
  if (!a) return p.b[1];
  const u = (x - p.x) / (p.f * p.s) / m[2]! + .5;
  if (u < 0 || u > 1) return p.b[3];
  const f = u * NC - .5, i = Math.floor(f), t = f - i, v = a[clamp(i, 0, NC - 1)]! * (1 - t) + a[clamp(i + 1, 0, NC - 1)]! * t;
  return p.b[1] + v * (p.b[3] - p.b[1]);
}

/** Drawn angle (rad): rustle spring plus the idle breeze, clamped. amp scales the breeze (under 1 degree); 0 = at rest. */
const ang = (p: Plant, T: number, amp: number) => (clamp(p.a + amp * .35 * (Math.sin(T * .8 + p.ph) + .6 * Math.sin(T * 1.7 + 2.3 * p.ph)), -MA, MA) * Math.PI) / 180;

/** Clips c to the region above the plant's current (swayed) top contour plus pad (world units, positive = lower), across its width. */
export function clip(c: CanvasRenderingContext2D, p: Plant, T: number, amp: number, pad: number) {
  const m = M[p.n]!, a = ang(p, T, amp), sn = Math.sin(a), cs = Math.cos(a), pr = PR[p.n];
  c.beginPath();
  for (let k = 0; k < NC; k++) {
    const lx = ((k + .5) / NC - .5) * m[2]! * p.f * p.s, ly = ((pr ? pr[k]! : 0) - 1) * m[3]! * p.s, yr = lx * sn + ly * cs;
    const X = p.x + lx * cs - ly * sn - .5 * sn * yr, Y = p.y + yr + pad;
    if (!k) c.moveTo(X, -1e4);
    c.lineTo(X, Y);
    if (k === NC - 1) c.lineTo(X, -1e4);
  }
  c.closePath(); c.clip();
}

/** Live plants. */
export function draw(c: CanvasRenderingContext2D, ps: Plant[], src: CanvasImageSource | null, T: number, amp: number) {
  if (!src) return;
  for (const p of ps) {
    const m = M[p.n]!, w = m[2]!, h = m[3]!, a = ang(p, T, amp);
    c.save(); c.translate(p.x, p.y); c.transform(1, 0, -.5 * Math.sin(a), 1, 0, 0); c.rotate(a); c.scale(p.f * p.s, p.s);
    c.drawImage(src, m[0]!, m[1]!, w, h, -w / 2, p.t ? 0 : -h, w, h);
    c.restore();
  }
}

// ---- cached static passes ----
const rng = (s: number) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
type Cache = { k: string; cv: HTMLCanvasElement | null };
const BC: Cache = { k: "", cv: null }, FC: Cache = { k: "", cv: null };

/** Paints into an offscreen canvas at device resolution when the key changes, then blits it 1:1 onto c. */
function blit(c: CanvasRenderingContext2D, st: Cache, key: string, W: number, H: number, paint: (x: CanvasRenderingContext2D, a: number) => void) {
  const a = c.getTransform().a;
  key += `|${W}|${H}|${a}`;
  if (st.k !== key || !st.cv) {
    const cv = st.cv ?? document.createElement("canvas");
    cv.width = Math.ceil(W * a); cv.height = Math.ceil(H * a); // resizing clears it
    const x = cv.getContext("2d")!; x.setTransform(a, 0, 0, a, 0, 0);
    paint(x, a); st.cv = cv; st.k = key;
  }
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(st.cv, 0, 0); c.restore();
}
const geo = (L: Line, gy: number, p: Palette) => `${p.ink}${p.paper}|${L.ch}|${L.top}|${L.base}|${gy}|${L.l.join(",")}`;
const ell = (x: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, rot = 0) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); };
/** Paper-filled ellipse with an ink outline (pebble, leaf, clover). */
const bead = (x: CanvasRenderingContext2D, p: Palette, cx: number, cy: number, rx: number, ry: number, lw: number, rot = 0) => {
  ell(x, cx, cy, rx, ry, rot); x.fillStyle = p.paper; x.fill(); x.lineWidth = lw; x.strokeStyle = p.ink; x.stroke();
};

/** The static back pass: grain, distant silhouettes, contact shadows, the ground line with soil and pebbles. Cached. */
export function base(c: CanvasRenderingContext2D, W: number, H: number, L: Line, gy: number, bk: Plant[], fr: Plant[], src: CanvasImageSource | null, p: Palette) {
  const key = geo(L, gy, p) + (src ? "|s|" : "|n|") + bk.concat(fr).map((q) => `${q.n}${q.x.toFixed(1)}${q.s.toFixed(3)}`).join();
  blit(c, BC, key, W, H, (x, a) => {
    const cap = L.base - L.top, l = L.l, r = rng(7), x0 = l[0] ?? 0, x1 = l[l.length - 1] ?? W, nar = W < 620;
    x.lineCap = x.lineJoin = "round";
    // warm paper grain
    const g = document.createElement("canvas"); g.width = g.height = 96;
    const gx = g.getContext("2d")!, id = gx.createImageData(96, 96), ik = rgb(p.ink);
    for (let i = 0; i < id.data.length; i += 4) { id.data[i] = ik[0]!; id.data[i + 1] = ik[1]!; id.data[i + 2] = ik[2]!; id.data[i + 3] = r() * 255; }
    gx.putImageData(id, 0, 0);
    const pat = x.createPattern(g, "repeat")!; pat.setTransform(new DOMMatrix().scale(1 / a)); // one grain cell per device pixel
    x.globalAlpha = .1; x.fillStyle = pat; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
    // faint distant botanicals, standing on the ground behind the name
    if (src) {
      const rows: [string, number, number][] = nar ? [["tall_broadleaf", .3, 1.5], ["potted_fern", .75, 1.25]] : [["tall_broadleaf", .2, 1.5], ["potted_fern", .55, 1.25], ["leafy_stems", .85, 1.4]];
      x.globalAlpha = .07;
      rows.forEach(([nm, f, h], i) => {
        const m = M[nm]!, hh = h * cap, w = m[2]! * hh / m[3]!, cx = x0 + (x1 - x0) * f;
        x.save(); x.translate(cx, gy); x.scale(i % 2 ? -1 : 1, 1);
        x.drawImage(src, m[0]!, m[1]!, m[2]!, m[3]!, -w / 2, -hh, w, hh);
        x.restore();
      });
      x.globalAlpha = 1;
    }
    // soft contact shadows on the ground: every letter and every ground plant
    const shade = (cx: number, rx: number, ry: number, al: number) => {
      x.save(); x.translate(cx, gy); x.scale(1, ry / rx);
      const rg = x.createRadialGradient(0, 0, 0, 0, 0, rx);
      rg.addColorStop(0, rgba(p.ink, al * 1.5)); rg.addColorStop(.5, rgba(p.ink, al)); rg.addColorStop(1, rgba(p.ink, 0));
      x.fillStyle = rg; x.beginPath(); x.arc(0, 0, rx, 0, Math.PI * 2); x.fill(); x.restore();
    };
    for (let i = 0; i < l.length >> 1; i++) { const w = l[2 * i + 1]! - l[2 * i]!; shade((l[2 * i]! + l[2 * i + 1]!) / 2, w * .6, Math.min(.04 * cap, w * .2), .14); }
    for (const q of bk.concat(fr)) if (!q.t) { const rx = (q.b[2] - q.b[0]) * .48; shade(q.x, rx, Math.min(.05 * cap, rx * .22), .16); }
    // organic ground line, soil dashes and pebbles (nothing deeper than gy + .07 cap)
    const step = cap * .4, pts: [number, number][] = [];
    for (let xx = 0; xx < W + step; xx += step) pts.push([Math.min(xx, W), Math.sin(xx / (cap * .9)) * .004 * cap + (r() - .5) * .006 * cap]);
    const line = (off: number, lw: number, al: number) => {
      x.beginPath(); x.moveTo(pts[0]![0], gy + off + pts[0]![1]);
      for (let i = 1; i < pts.length - 1; i++) x.quadraticCurveTo(pts[i]![0], gy + off + pts[i]![1], (pts[i]![0] + pts[i + 1]![0]) / 2, gy + off + (pts[i]![1] + pts[i + 1]![1]) / 2);
      x.lineTo(W, gy + off + pts[pts.length - 1]![1]);
      x.lineWidth = lw; x.strokeStyle = rgba(p.ink, al); x.stroke();
    };
    line(0, .016 * cap, .55); line(.006 * cap, .008 * cap, .3);
    x.strokeStyle = rgba(p.ink, .4); x.lineWidth = .007 * cap;
    for (let i = Math.floor(W / cap * 8); i > 0; i--) {
      const xx = r() * W, yy = gy + (.014 + r() * .046) * cap;
      x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx + (.02 + r() * .04) * cap, yy + (r() - .5) * .004 * cap); x.stroke();
    }
    x.globalAlpha = .75;
    for (let i = Math.floor(W / cap * 3); i > 0; i--) { const rx = (.008 + r() * .014) * cap; bead(x, p, r() * W, gy + (.024 + r() * .04) * cap, rx, rx * .6, .005 * cap); }
    x.globalAlpha = 1;
  });
}

/** The static front ground cover: rooted grass tufts, clover, sprouts and pebbles from the first letter to the stop (never over it). Cached. */
export function cover(c: CanvasRenderingContext2D, W: number, H: number, L: Line, gy: number, p: Palette) {
  blit(c, FC, geo(L, gy, p), W, H, (x) => {
    const cap = L.base - L.top, l = L.l, r = rng(23), xs = l[0] ?? 0, xe = L.ch.endsWith(".") ? l[l.length - 2]! - .03 * cap : (l[l.length - 1] ?? W);
    const n = xe > xs ? Math.floor((xe - xs) / cap * (W < 620 ? 5 : 9)) : 0, lw = .005 * cap;
    x.lineCap = x.lineJoin = "round"; x.strokeStyle = p.ink;
    for (let i = 0; i < n; i++) {
      const cx = xs + (i + .2 + r() * .6) / n * (xe - xs), k = r();
      if (k < .5) { // grass tuft, blades at most .12 cap
        x.lineWidth = lw * 1.2;
        for (let j = 3 + Math.floor(r() * 4), b = 0; b < j; b++) {
          const bx = cx + (b - j / 2) * .008 * cap, h = (.04 + r() * .08) * cap, lean = (r() - .5) * .05 * cap;
          x.beginPath(); x.moveTo(bx, gy + .004 * cap); x.quadraticCurveTo(bx + lean * .3, gy - h * .6, bx + lean, gy - h); x.stroke();
        }
      } else if (k < .7) { // clover: three paper circles on a short stem
        const h = (.025 + r() * .02) * cap, rr = .012 * cap;
        x.lineWidth = lw; x.beginPath(); x.moveTo(cx, gy + .004 * cap); x.lineTo(cx, gy - h); x.stroke();
        for (let b = 0; b < 3; b++) { const t = -Math.PI / 2 + b * 2.09; bead(x, p, cx + Math.cos(t) * rr * .9, gy - h + Math.sin(t) * rr * .9, rr, rr, lw * .8); }
      } else if (k < .88) { // sprout: curved stem, two leaves
        const h = (.05 + r() * .04) * cap, lean = (r() - .5) * .02 * cap;
        x.lineWidth = lw; x.beginPath(); x.moveTo(cx, gy + .004 * cap); x.quadraticCurveTo(cx + lean, gy - h * .5, cx + lean, gy - h); x.stroke();
        bead(x, p, cx + lean - .014 * cap, gy - h, .016 * cap, .008 * cap, lw * .8, -.5);
        bead(x, p, cx + lean + .014 * cap, gy - h * .85, .016 * cap, .008 * cap, lw * .8, .5);
      } else { const rx = (.008 + r() * .012) * cap; bead(x, p, cx, gy - rx * .4, rx, rx * .6, lw); } // pebble
    }
  });
}
