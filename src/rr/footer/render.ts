// Footer playground, Render world "day shift": a drafting plotter builds wireframe cubes in ink on paper.
// Raster builds the same blocks at night in pixels; here everything is continuous, eased and hairline.
// Three depth planes. Behind: three receding floor rows of seeded clusters (singles, groups, stacks, a tower now and then;
// lighter the further back; back canvas). The name. In front (front canvas): small cubes perched on flat letter tops, and
// larger paper-filled cubes in the gaps between letters, with a feature tower in the word gap, covering little of any letter.
// Every slot has a target height: the plotter builds toward the targets and erases the oldest cube, so the scene breathes.
// The pen, arm and ring follow the depth of the job they work on.
// The name is built, not floating: a ground line at the baseline, a plinth under each word, slim columns at the ends and in
// the word gap, and beams on the cap line between the letters; all static, cached with the dots and floor (back canvas).
import { gaps, type Line, type Palette, type World } from "./world.ts";

interface Cube { on: boolean; slot: number; lvl: number; x: number; y: number; k: number; born: number; dist: number; hat: number; sh: number; er: number; done: boolean; face: number; ro: number }

// Pen path per cube as legs between vertices (0 A,1 B,2 C,3 D front; 4 E,5 F,6 G,7 K back). Type 0 visible, 1 retrace (no stroke), 2 hidden.
// shortcut: 4 odd vertices mean one retraced edge (C-G); fine for a plotter, a lift-and-hop would add a phase.
const LA = [1, 0, 3, 2, 1, 5, 6, 2, 6, 7, 3, 0, 4, 5, 4];
const LB = [0, 3, 2, 1, 5, 6, 2, 6, 7, 3, 0, 4, 5, 4, 7];
const LT = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 2, 2, 1, 2];
const FACE = [[1, 5, 6, 2], [3, 2, 6, 7]]; // right face, top face
const IDLE = 0, TRAVEL = 1, DROP = 2, DRAW = 3, HATCH = 4, SETTLE = 5;
const POOL = 48, MAXSLOT = 64, DROPS = 6;
const ROWA = [1, 0.8, 0.6]; // stroke strength of the three far rows, lighter further back
const D33 = [3, 3], D45 = [4, 5], D0: number[] = []; // dash patterns, kept so a frame allocates nothing

const ease = (t: number) => (t >= 1 ? 1 : (1 - 2 ** (-10 * t)) / (1 - 2 ** -10)); // exponential ease-out
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const mk = (s: number) => () => {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Where a dropped cube lands at x: the cap line of the letter under it, else the baseline. */
function landAt(lines: Line[], u: number, base: number) {
  for (const ln of lines) for (let i = 0; i + 1 < ln.l.length; i += 2) if (u >= (ln.l[i] ?? 0) && u <= (ln.l[i + 1] ?? 0)) return ln.top;
  return base;
}

function build() {
  const rnd = mk(0x9e3779b9);

  let W = 0, H = 0, base = 0, vpx = 0, vpy = 0, nSlots = 0, cap = 4, cm = 28, tot = 0, ord: number[] = [];
  let railY = 16.5, oy = 0, midK = 8, sk = 1, LN: Line[] = []; // oy: how far a tall stage pushes the scene down; the sky above it stays clear
  const pool: Cube[] = [];
  for (let i = 0; i < POOL; i++) pool.push({ on: false, slot: 0, lvl: 0, x: 0, y: 0, k: 1, born: 0, dist: 0, hat: 0, sh: 0, er: -1, done: false, face: -1, ro: 0 });
  const VX = new Float64Array(8), VY = new Float64Array(8);
  // per slot: left x, floor y, cube edge, stack limit, depth (0 far, 1 gap, 2 perched on a letter), far row, target height
  const slX = new Float32Array(MAXSLOT), slY = new Float32Array(MAXSLOT), slK = new Float32Array(MAXSLOT), slM = new Uint8Array(MAXSLOT), slN = new Uint8Array(MAXSLOT);
  const slR = new Uint8Array(MAXSLOT), slT = new Uint8Array(MAXSLOT);
  const slotH = new Uint8Array(MAXSLOT), shLen = new Float32Array(MAXSLOT), shA = new Float32Array(MAXSLOT);
  const tr = { x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0, t: 0, d: 1 };
  let fx0 = 0, fy0 = 0, fx1 = 0, fy1 = 0;

  let inited = false, ph = IDLE, timer = 0.5, time = 0, born = 0, lastSlot = -1, pd = 0;
  let cur: Cube | null = null;
  let tx = 0, ty = 0, cx = 0, lift = 0.75, liftT = 0.75, trA = 0, ringT = -1, rx = 0, ry = 0, settleT = 0;
  let qx = -1, mx = 0, mAct = false;
  // react: rc is the cube the leader points at (null = released), rl the one the line still retracts from, lp the line length 0..1
  let rc: Cube | null = null, rl: Cube | null = null, lp = 0, lu = 0;
  // answer: dropped cubes, oldest first; fall is the one still working (ast 0 falling, 1 tracing red)
  const drops: Cube[] = [];
  let fall: Cube | null = null, ast = 0, av = 0, ab = 0, fl = 0, at = 0;
  let bg: HTMLCanvasElement | null = null, bgW = 0, bgH = 0, bgD = 0, bgP = "", bgR = "", bgV = 0;
  // structure: column width, plinth depth, column left edges, plinth [x0, x1] pairs
  let sw = 3, pdp = 3, ST: number[] = [], PL: number[] = [];

  const vx = (i: number) => VX[i] ?? 0;
  const vy = (i: number) => VY[i] ?? 0;
  const near = (slot: number) => (slN[slot] ?? 0) > 0; // in front of the letters (front canvas, paper-filled)
  const ms = (slot: number) => slM[slot] ?? 0;
  const tg = (slot: number) => slT[slot] ?? 0;
  function add(x: number, y: number, k: number, n: number, r: number, t: number) {
    if (nSlots >= MAXSLOT) return;
    const m = clamp(Math.min(6, Math.floor((y - railY - (W * sk < 560 ? 14 : 34)) / (k * 1.05))), 1, 6); // a tower stays under the rail
    slX[nSlots] = x; slY[nSlots] = y; slK[nSlots] = k; slN[nSlots] = n; slR[nSlots] = r; slM[nSlots] = m; slT[nSlots++] = Math.min(t, m);
  }
  const place = (c: Cube) => { c.k = slK[c.slot] ?? 1; c.x = slX[c.slot] ?? 0; c.y = (slY[c.slot] ?? 0) - c.lvl * c.k; };
  function setVerts(c: Cube) {
    const ax = c.x + 0.5, ay = c.y + 0.5, k = c.k;
    VX[0] = ax; VY[0] = ay; VX[1] = ax + k; VY[1] = ay; VX[2] = ax + k; VY[2] = ay - k; VX[3] = ax; VY[3] = ay - k;
    for (let i = 0; i < 4; i++) { VX[i + 4] = vx(i) + Math.round(k * 0.42); VY[i + 4] = vy(i) - Math.round(k * 0.3); }
  }
  const nLegs = (c: Cube) => (c.lvl === 0 ? 15 : 10);
  function legLen(i: number) {
    const a = LA[i] ?? 0, b = LB[i] ?? 0;
    return Math.hypot(vx(b) - vx(a), vy(b) - vy(a));
  }
  function totalLen(c: Cube) { let t = 0; for (let i = 0, n = nLegs(c); i < n; i++) t += legLen(i); return t; }
  /** Pen position at path distance d; writes tx, ty. */
  function penAt(c: Cube, d: number) {
    let cum = 0;
    for (let i = 0, n = nLegs(c); i < n; i++) {
      const len = legLen(i), a = LA[i] ?? 0, b = LB[i] ?? 0;
      if (d <= cum + len || i === n - 1) {
        const f = len > 0 ? clamp((d - cum) / len, 0, 1) : 1;
        tx = vx(a) + (vx(b) - vx(a)) * f; ty = vy(a) + (vy(b) - vy(a)) * f;
        return;
      }
      cum += len;
    }
  }
  function faceBox(c: Cube) {
    const f = FACE[c.face] ?? FACE[0] ?? [];
    fx0 = 1e9; fy0 = 1e9; fx1 = -1e9; fy1 = -1e9;
    for (const i of f) { fx0 = Math.min(fx0, vx(i)); fx1 = Math.max(fx1, vx(i)); fy0 = Math.min(fy0, vy(i)); fy1 = Math.max(fy1, vy(i)); }
  }

  function poly(g: CanvasRenderingContext2D, a: number, b: number, c: number, d: number) {
    g.moveTo(vx(a), vy(a)); g.lineTo(vx(b), vy(b)); g.lineTo(vx(c), vy(c)); g.lineTo(vx(d), vy(d)); g.closePath();
  }
  /** Adds the drawn part of every leg of one type to the path; true if any. */
  function strokeLegs(g: CanvasRenderingContext2D, c: Cube, type: number) {
    let cum = 0, any = false;
    for (let i = 0, m = nLegs(c); i < m && c.dist > cum; i++) {
      const len = legLen(i), A = LA[i] ?? 0, B = LB[i] ?? 0, f = len > 0 ? Math.min(1, (c.dist - cum) / len) : 1;
      if (LT[i] === type) { g.moveTo(vx(A), vy(A)); g.lineTo(vx(A) + (vx(B) - vx(A)) * f, vy(A) + (vy(B) - vy(A)) * f); any = true; }
      cum += len;
    }
    return any;
  }

  function heights() {
    slotH.fill(0);
    for (const c of pool) if (c.on && c.er < 0) slotH[c.slot] = Math.max(slotH[c.slot] ?? 0, c.lvl + 1);
  }
  function count() { let n = 0; for (const c of pool) if (c.on && c.er < 0) n++; return n; }
  function blocked(c: Cube) { for (const o of pool) if (o.on && o.er >= 0 && o.slot === c.slot && o.lvl === c.lvl) return true; return false; }
  function newCube(slot: number, lvl: number) {
    for (const c of pool) if (!c.on) {
      c.on = true; c.slot = slot; c.lvl = lvl; c.born = ++born; c.dist = 0; c.hat = 0; c.sh = 0; c.er = -1; c.done = false; c.ro = 0;
      c.face = near(slot) ? 0 : rnd() < 0.7 ? (rnd() < 0.6 ? 0 : 1) : -1; // a near cube always hatches its right face
      place(c);
      return c;
    }
    return null;
  }
  /** Oldest finished cube with nothing on top of it. */
  function oldest() {
    heights();
    let o: Cube | null = null;
    for (const c of pool) if (c.on && c.er < 0 && c.done && (slotH[c.slot] ?? 0) === c.lvl + 1 && (!o || c.born < o.born)) o = c;
    return o;
  }
  /** Weight of an open slot: empty slots and the near stacks first, the last slot rarely, and the other depth than the last job favoured. */
  const weight = (i: number) => ((slotH[i] ?? 0) === 0 || near(i) ? 1 : 0.3) * (i === lastSlot ? 0.15 : 1) * (+near(i) !== pd ? 4 : 1);
  /** Chooses (slot, lvl = slotH[slot]); queued x wins, else a seeded weighted pick. */
  function pickSlot(q: number) {
    heights();
    let best = -1, bd = 1e9, tot = 0;
    for (let i = 0; i < nSlots; i++) {
      const h = slotH[i] ?? 0;
      if (h >= tg(i)) continue;
      if (q >= 0) {
        const d = Math.abs((slX[i] ?? 0) + (slK[i] ?? 0) * 0.71 - q) + (h > 0 ? 1e5 : 0);
        if (d < bd) { bd = d; best = i; }
      } else tot += weight(i);
    }
    if (q >= 0 || tot <= 0) return best;
    let r = rnd() * tot;
    for (let i = 0; i < nSlots; i++) {
      if ((slotH[i] ?? 0) >= tg(i)) continue;
      r -= weight(i);
      if (r <= 0) return i;
    }
    return best;
  }
  function startTask() {
    if (count() >= cap) { const o = oldest(); if (o) { o.er = 0; lastSlot = o.slot; } } // not the cube just erased
    const sl = pickSlot(qx);
    qx = -1;
    const c = sl < 0 ? null : newCube(sl, slotH[sl] ?? 0);
    if (!c) { timer = 1; return; }
    cur = c; lastSlot = sl; pd = +near(sl); setVerts(c);
    tr.x0 = tx; tr.y0 = ty; tr.x1 = vx(1); tr.y1 = vy(1);
    const d = Math.hypot(tr.x1 - tx, tr.y1 - ty);
    tr.cx = (tx + tr.x1) / 2; tr.cy = Math.max(railY + 16, Math.min(ty, tr.y1) - (30 + d * 0.1));
    tr.t = 0; tr.d = clamp(0.6 + d * 0.0009, 0.6, 1.5);
    ph = TRAVEL;
  }
  function put(sl: number, lvl: number) {
    const c = newCube(sl, lvl);
    if (!c) return;
    setVerts(c); c.dist = totalLen(c); c.hat = c.face >= 0 ? 1 : 0; c.sh = 1; c.done = true;
  }
  /** Resting composition, whole stacks in `ord` (front slots and towers first) while they fit: up to the cap for the still, a few
   *  short of it for the loop (it starts with jobs open). */
  function compose(still: boolean) {
    for (const c of pool) c.on = false;
    const lim = still ? Math.min(tot, cm) : cap - 3;
    for (const i of ord) if (count() + tg(i) <= lim) for (let l = 0; l < tg(i); l++) put(i, l);
  }

  const world: World = {
    resize(w, h, lines, k = 1) {
      W = w; H = h; sk = k;
      const last = lines[lines.length - 1] ?? { top: h * 0.4, base: h * 0.85, l: [], ch: "" }, top0 = lines[0]?.top ?? last.top;
      base = last.base;
      // capH places things against the name; szH sizes them, so the stage scale shrinks cubes but not where they stand
      const capH = Math.max(8, base - last.top), szH = capH * k, phone = W * k < 560, gr = mk(0x51ed270b);
      oy = Math.max(0, top0 - capH * 1.2 - 16.5); railY = 16.5 + oy; LN = lines; // anchored to the name, not to h: a band gives oy 0
      drops.length = 0; fall = null; ast = 0; rc = rl = null; lp = 0;
      vpy = (last.top + base) / 2; vpx = Math.round(W * 0.58); // the floor recedes to a point behind the letters
      cm = phone ? 18 : 36;
      nSlots = 0;
      // phones: far objects sit on the back canvas, so the letters draw over them; front objects (end cube, perched) never cover E, Z, D, O, V bottoms
      // gap slots (front), desktop: over the widest gaps the cube fits covering at most a fifth of a neighbour's width, shrinking
      // until enough fit. The first, the widest gap (the word gap), grows to what that gap alone holds and becomes the feature
      // tower; the next two stack 2 high, the rest stand 1. All stand on the baseline. A phone's gaps are too narrow to hold a
      // cube clear of E, Z, D, O, V, so its front cube stands in the free space past the stop instead.
      const nn = phone ? 0 : 5, pad = Math.max(3, Math.round(szH * 0.06));
      const fit = (k: number, n: number, max: number) => gaps(lines.filter((l) => l.base > H - pad - k * 2.3), k * 1.42, n, max);
      let sn = Math.round(szH * 0.4), g: number[] = [];
      for (;; sn -= 2) {
        g = fit(sn, nn, 0.2);
        if (g.length >= nn || sn <= 12) break;
      }
      let sb = Math.round(szH * 0.45);
      while (sb > sn && fit(sb, 1, 0.05)[0] !== g[0]) sb -= 2;
      sb = Math.max(sb, sn);
      g.forEach((x, j) => { const k = j === 0 ? sb : sn; add(Math.round(x - k * 0.71), Math.round(base), k, 1, 0, j === 0 ? 3 : j < 3 ? 2 : 1); });
      const end = Math.max(0, ...(last.l.length ? [last.l[last.l.length - 1] ?? 0] : [])), ek = Math.min(Math.round(szH * 0.45), Math.floor((W - end - 14) / 1.42));
      if (phone && ek >= 10) add(Math.round(end + 8), Math.round(base), ek, 1, 0, 2);
      // perched (front): small cubes on the flat tops of E, D, P, R, Z, spread along the name
      const pk: number[][] = [];
      for (const ln of lines) for (let i = 0; i < ln.ch.length; i++) if ("EDPRZ".includes(ln.ch.charAt(i))) {
        const a = ln.l[2 * i] ?? 0, b = ln.l[2 * i + 1] ?? 0, k = clamp(Math.round(szH * 0.15), 6, Math.floor(((b - a) / 1.42) * 0.8));
        if (ln.top - railY - 34 >= k * 1.05) pk.push([a + (b - a - k * 1.42) * ("DPR".includes(ln.ch.charAt(i)) ? 0.15 : 0.5), ln.top, k]);
      }
      const np = Math.min(pk.length, phone ? 2 : 3);
      for (let j = 0; j < np; j++) {
        const p = pk[Math.floor(((j + 0.5) * pk.length) / np)];
        if (p) add(Math.round(p[0] ?? 0), (p[1] ?? 0) - 0.5, p[2] ?? 6, 2, 0, j === 1 ? 2 : 1);
      }
      // far rows (back): three receding floor rows, smaller further back; seeded singles, groups, stacks and the odd tower,
      // each item placed at random inside its own share of the width so nothing repeats. Sized on the whole name for phones.
      const sF = Math.max(12, Math.round((base - top0) * 0.28 * sk));
      const l0 = lines[0] ?? last, two = phone && lines.length > 1; // phones: rows sit behind line 1 and in the band between the lines
      const rows = [[1, 0.25], [0.72, 0.47], [0.52, 0.68]].map(([ks = 1, yf = 0], i) => {
        const k = Math.max(5, Math.round(sF * ks)), y = Math.round(two ? [(l0.base + last.top) / 2, l0.base - capH * 0.3, l0.base - capH * 0.55][i] ?? base : base - capH * yf);
        return { k, y, m: Math.floor((y - railY - (phone ? 14 : 34)) / (k * 1.05)) };
      });
      // skyline: towers spread along the width on the tallest rows, rising past the cap line behind the name
      // a phone's rows are too short to climb, so its two towers use small cubes standing just behind line 1
      const tk = Math.max(8, Math.round(szH * 0.22)), tY = Math.round(l0.base - capH * 0.2);
      const tr = phone ? { k: tk, y: tY, m: Math.floor((tY - railY - 14) / (tk * 1.05)) } : null;
      const mx = Math.max(...rows.map((o) => o.m)), tl = tr ? [tr] : rows.filter((o) => o.m >= Math.min(4, mx)), nt = phone ? 2 : 4;
      for (let j = 0; j < nt; j++) {
        const o = tl[j % tl.length];
        if (!o) break;
        const x = Math.round(clamp(((j + 0.5) / nt) * W + (gr() - 0.5) * W * 0.1 + (phone ? (j ? 0 : -W * 0.1) : 0), 16, W - 16 - o.k * 1.42));
        add(x, o.y, o.k, 0, tr ? 1 : rows.indexOf(o), tr ? Math.min(j ? 4 : 3, o.m) : clamp(Math.ceil((o.y - top0) / o.k) + 1, 3, 6));
      }
      if (phone) { // calm fill for the left of line 2: a far cluster behind P and A rising toward the band, and one small band cube
        const cy = Math.round(last.base - capH * 0.3), px = Math.round(W * 0.1);
        add(px, cy, tk, 0, 2, 3); add(px + Math.round(tk * 1.6), cy, tk, 0, 2, 1);
        add(Math.round(W * 0.24), Math.round((l0.base + last.top) / 2), Math.max(7, tk - 2), 0, 2, 1);
      }
      rows.forEach(({ k, y }, r) => {
        const pitch = Math.round(k * 1.5), n = Math.max(1, Math.round((W * (phone ? 0.8 : 1)) / (k * (phone ? 7 : 28)))), seg = (W - 32) / n;
        for (let s = 0; s < n; s++) {
          const t = gr(), stack = t >= 0.62;
          const cols = Math.max(1, Math.min(t >= 0.3 && t < 0.62 ? 2 + Math.floor(gr() * 3) : 1, Math.floor(seg / pitch)));
          const x0 = 16 + s * seg + gr() * Math.max(0, seg - cols * pitch);
          for (let c = 0; c < cols; c++) {
            const x = Math.round(x0 + c * pitch), h = stack ? 2 + (gr() < 0.4 ? 1 : 0) : cols > 1 && gr() < 0.3 ? 2 : 1;
            add(x, y, k, 0, r, h);
          }
        }
      });
      midK = rows[1]?.k ?? 8;
      tot = 0;
      for (let i = 0; i < nSlots; i++) tot += tg(i);
      cap = Math.max(1, Math.min(cm, tot - 3));
      // structure: plinths split at the widest letter gap (the word gap); end columns sit just outside the name, inside the canvas
      const nl = last.l.length >> 1, lx = (i: number) => last.l[i] ?? 0;
      let wi = -1;
      for (let i = 0; i + 1 < nl; i++) if (wi < 0 || lx(2 * i + 2) - lx(2 * i + 1) > lx(2 * wi + 2) - lx(2 * wi + 1)) wi = i;
      sw = Math.max(3, Math.round(szH * 0.06)); pdp = Math.min(Math.max(3, Math.round(szH * 0.06)), Math.floor(H - base) - 1);
      PL = !nl ? [] : wi < 0 ? [lx(0), lx(2 * nl - 1)] : [lx(0), lx(2 * wi + 1), lx(2 * wi + 2), lx(2 * nl - 1)];
      const inW = (x: number) => x >= 0.5 && x + sw <= W - 0.5;
      const free = (x: number) => { // clear of every slot cube's x range (far ones too)
        for (let i = 0; i < nSlots; i++) if ((slX[i] ?? 0) < x + sw + 1 && (slX[i] ?? 0) + (slK[i] ?? 0) * 1.42 > x - 1) return false;
        return inW(x);
      };
      const ga = lx(2 * wi + 1), gb = lx(2 * wi + 2); // word gap; its column tries beside the tower, left then right, else none
      ST = !nl ? [] : [lx(0) - 2 - sw, lx(2 * nl - 1) + 2].filter(inW);
      const gx = wi >= 0 && gb - ga >= sw + 4 ? [ga + 2, gb - 2 - sw].find(free) : undefined;
      if (gx !== undefined) ST.push(gx);
      bgW = 0; // lines can move without a size change, so the cached structure redraws on every resize
      // still and loop start fill front slots and tall stacks first, the rest in a seeded shuffle, so no side of the width loses out
      ord = Array.from({ length: nSlots }, (_, i) => i);
      for (let i = nSlots - 1; i > 0; i--) { const j = Math.floor(gr() * (i + 1)); [ord[i], ord[j]] = [ord[j] ?? 0, ord[i] ?? 0]; }
      ord.sort((a, b) => +!(slN[a] || tg(a) >= 3) - +!(slN[b] || tg(b) >= 3));
      for (const c of pool) if (c.on) {
        if (c.slot >= nSlots || c.lvl >= tg(c.slot)) { c.on = false; if (c === cur) { cur = null; ph = IDLE; timer = 0.5; } continue; }
        const ok = c.k;
        place(c); setVerts(c);
        c.dist = c.done ? totalLen(c) : (c.dist * c.k) / ok;
      }
      if (!inited) { inited = true; compose(false); tx = W / 2; ty = railY + 48; cx = tx; }
      else { tx = clamp(tx, 0, W); ty = clamp(ty, railY + 12, H); }
    },
    step(dt) {
      time += dt;
      const kr = 1 - Math.exp(-12 * dt); // react ease, about 300 ms
      if (rc && (!rc.on || rc.er >= 0)) rc = null;
      if (rl && !rl.on) rl = null;
      for (const c of pool) if (c.on) {
        if (c.er >= 0) { c.er += dt / 1.2; if (c.er >= 1) c.on = false; }
        if (c.done && c.sh < 1) c.sh = Math.min(1, c.sh + dt);
        c.ro += ((c === rc ? 1 : 0) - c.ro) * kr;
      }
      lp += ((rc ? 1 : 0) - lp) * kr;
      if (!rc && lp < 0.005) { lp = 0; rl = null; }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        if (d && d.er >= 0) { d.er += dt / 1.2; if (d.er >= 1) drops.splice(i, 1); }
      }
      if (fall) {
        if (ast === 0) { // gravity, two bounces with decay, then rest on the landing line
          av += 2600 * dt; fall.y += av * dt;
          if (fall.y >= fl) { fall.y = fl; if (ab >= 2 || av < 60) { av = 0; ast = 1; at = 0; } else { av *= -0.3; ab++; } }
        } else if ((at += dt) >= 1) { fall = null; ast = 0; } // 0.6 s trace, 0.4 s fade to ink
      }
      if (cur) setVerts(cur);
      liftT = 0.75;
      if (ph === IDLE) {
        timer -= dt;
        if (timer <= 0 || qx >= 0) startTask();
      } else if (ph === TRAVEL) {
        liftT = 1; tr.t += dt;
        const u = ease(tr.t / tr.d), v = 1 - u;
        tx = v * v * tr.x0 + 2 * v * u * tr.cx + u * u * tr.x1; ty = v * v * tr.y0 + 2 * v * u * tr.cy + u * u * tr.y1;
        if (tr.t >= tr.d) { ph = DROP; tx = tr.x1; ty = tr.y1; }
      } else if (cur) {
        if (ph === DROP) {
          const b = blocked(cur);
          liftT = b ? 0.5 : 0;
          if (!b && lift < 0.15) { ph = DRAW; ringT = 0; rx = tx; ry = ty; }
        } else if (ph === DRAW) {
          liftT = 0;
          cur.dist += Math.max(150, cur.k * 3.2) * dt;
          const tot = totalLen(cur);
          if (cur.dist >= tot) { cur.dist = tot; ph = cur.face >= 0 ? HATCH : SETTLE; settleT = 0; cur.done = cur.face < 0; }
          penAt(cur, cur.dist);
        } else if (ph === HATCH) {
          liftT = 0;
          cur.hat = Math.min(1, cur.hat + dt / 1.5);
          faceBox(cur);
          tx = fx0 + (fx1 - fx0) * cur.hat; ty = fy0 + (fy1 - fy0) * (0.5 + 0.5 * Math.sin(cur.hat * 18));
          if (cur.hat >= 1) { ph = SETTLE; settleT = 0; cur.done = true; }
        } else {
          settleT += dt;
          if (settleT > 0.5) { ph = IDLE; timer = 0.8 + rnd() * 1.6; cur = null; }
        }
      }
      lift += (liftT - lift) * (1 - Math.exp(-12 * dt));
      trA = ph === TRAVEL ? Math.min(0.6, trA + dt * 4) : Math.max(0, trA - dt / 1.1);
      if (ringT >= 0) { ringT += dt / 0.7; if (ringT >= 1) ringT = -1; }
      const target = ph === IDLE && mAct ? tx + clamp((mx - tx) * 0.18, -30, 30) : tx;
      cx += (target - cx) * (1 - Math.exp(-dt * (ph === TRAVEL ? 5 : 7)));
    },
    draw(back: CanvasRenderingContext2D, fr: CanvasRenderingContext2D, p: Palette) {
      let g = back;
      fr.clearRect(0, 0, W, H);
      const dpr = back.getTransform().a || 1;
      if (!bg || bgW !== W || bgH !== H || bgD !== dpr || bgP !== p.paper || bgR !== p.rule || bgV !== vpx + vpy + oy) {
        bg = bg ?? document.createElement("canvas");
        bg.width = Math.max(1, Math.round(W * dpr)); bg.height = Math.max(1, Math.round(H * dpr));
        bgW = W; bgH = H; bgD = dpr; bgP = p.paper; bgR = p.rule; bgV = vpx + vpy + oy;
        const b = bg.getContext("2d");
        if (b) {
          b.scale(dpr, dpr);
          b.fillStyle = p.paper; b.fillRect(0, 0, W, H);
          b.translate(0, oy); // the dots and the floor belong to the scene; a tall stage keeps its sky bare
          const Hs = H - oy, vs = vpy - oy;
          // dot grid, thinning out over the bottom of the stage so the scene ends without an edge
          b.fillStyle = p.rule;
          for (let yy = 12; yy < Hs; yy += 24) {
            b.globalAlpha = clamp((Hs - yy) / (Hs * 0.3), 0, 1); b.beginPath();
            for (let xx = 12; xx < W; xx += 24) b.rect(xx, yy, 1, 1);
            b.fill();
          }
          // receding floor: hairline rays from the vanishing point behind the letters, strongest at the letter feet, gone at the bottom
          b.strokeStyle = p.rule; b.lineWidth = 1;
          for (let s = 0; s < 8; s++) {
            const f0 = s / 8, f1 = (s + 1) / 8;
            b.globalAlpha = 0.9 * Math.sin(Math.PI * (f0 + f1) / 2) ** 1.5; b.beginPath();
            for (let i = -9; i <= 9; i++) {
              const ex = vpx + i * W * 0.11;
              b.moveTo(vpx + (ex - vpx) * f0, vs + (Hs - vs) * f0); b.lineTo(vpx + (ex - vpx) * f1, vs + (Hs - vs) * f1);
            }
            b.stroke();
          }
          // structure, in the far rows' light stroke: ground, plinths, columns with square feet, beams between letters and columns
          b.setTransform(dpr, 0, 0, dpr, 0, 0);
          const gy = Math.round(base) + 0.5, cy = Math.round(LN[LN.length - 1]?.top ?? base) + 0.5, ll = LN[LN.length - 1]?.l ?? [];
          b.strokeStyle = p.mute; b.globalAlpha = ROWA[1] ?? 1; b.beginPath(); b.moveTo(0, gy); b.lineTo(W, gy); b.stroke();
          b.globalAlpha = ROWA[2] ?? 1; b.beginPath();
          for (let i = 0; i + 1 < PL.length; i += 2) b.rect(Math.round(PL[i] ?? 0) + 0.5, gy, Math.round((PL[i + 1] ?? 0) - (PL[i] ?? 0)), pdp);
          const iv: number[][] = [];
          for (let i = 0; i + 1 < ll.length; i += 2) iv.push([ll[i] ?? 0, ll[i + 1] ?? 0]);
          for (const x of ST) {
            const xr = Math.round(x) + 0.5;
            b.moveTo(xr, gy); b.lineTo(xr, cy); b.moveTo(xr + sw, gy); b.lineTo(xr + sw, cy);
            b.rect(xr - 2, gy, sw + 4, pdp);
            iv.push([x, x + sw]);
          }
          iv.sort((u, v) => (u[0] ?? 0) - (v[0] ?? 0));
          let r = -1e9;
          for (const [a = 0, z = 0] of iv) { if (r > -1e9 && a - r >= 3) { b.moveTo(Math.round(r) + 1, cy); b.lineTo(Math.round(a) - 1, cy); } r = Math.max(r, z); }
          b.stroke();
          b.globalAlpha = 1;
        }
      }
      back.drawImage(bg, 0, 0, W, H);

      // cast shadows: one parallelogram per slot, falling right along the floor
      shLen.fill(0); shA.fill(0);
      for (const c of pool) if (c.on) {
        const a = (c.er < 0 ? 1 : 1 - smooth(c.er)) * smooth(c.sh);
        shLen[c.slot] = Math.max(shLen[c.slot] ?? 0, (c.lvl + 1) * 0.7 * c.k * smooth(c.sh));
        shA[c.slot] = Math.max(shA[c.slot] ?? 0, a);
      }
      for (let i = 0; i < nSlots; i++) {
        const a = shA[i] ?? 0;
        if (a < 0.01 || slN[i] === 2) continue; // a perched cube casts nothing onto the letter
        g = near(i) ? fr : back;
        const k = slK[i] ?? 1, kx = Math.round(k * 0.42), ky = -Math.round(k * 0.3);
        const ax = (slX[i] ?? 0) + 0.5, ay = (slY[i] ?? 0) + 0.5, L = shLen[i] ?? 0;
        g.fillStyle = p.ink;
        for (let j = 0; j < (near(i) ? 2 : 1); j++) { // near: a wide faint pass under a tight one, so the edge is soft
          const e = j ? 0 : near(i) ? 4 : 0;
          g.globalAlpha = (near(i) ? 0.05 : 0.04) * a; g.beginPath();
          g.moveTo(ax - e, ay + e * 0.5); g.lineTo(ax + kx, ay + ky - e * 0.5); g.lineTo(ax + k + kx + L + e * 2, ay + ky - e * 0.5); g.lineTo(ax + k + L + e * 2, ay + e * 0.5); g.fill();
        }
      }

      const paint = (c: Cube, n: boolean) => {
        g = n ? fr : back;
        setVerts(c);
        const rot = c.ro > 0.001;
        if (rot) { const px = c.x + 0.5 + c.k * 0.71, py = c.y + 0.5; g.save(); g.translate(px, py - 4 * c.ro); g.rotate(0.262 * c.ro); g.translate(-px, -py); } // react: 15 degree turn, 4 px lift
        const a = c.er < 0 ? 1 : 1 - smooth(c.er), ra = n ? 1 : (ROWA[slR[c.slot] ?? 0] ?? 1);
        if (n) { // opaque faces, fading in as the pen draws them: the cube stands in front of the letters it crosses
          g.globalAlpha = a * smooth(Math.min(1, (c.dist / Math.max(1, totalLen(c))) * 1.4));
          g.fillStyle = p.paper; g.beginPath(); poly(g, 0, 1, 2, 3); poly(g, 1, 5, 6, 2); g.fill();
          g.fillStyle = p.panel; g.beginPath(); poly(g, 3, 2, 6, 7); g.fill();
        }
        g.globalAlpha = a * ra; g.lineWidth = 1; g.strokeStyle = n ? p.ink : p.mute; g.beginPath();
        if (strokeLegs(g, c, 0)) g.stroke();
        if (!n) { g.strokeStyle = p.rule; g.beginPath(); if (strokeLegs(g, c, 2)) { g.setLineDash(D33); g.stroke(); g.setLineDash(D0); } }
        if (c.face >= 0 && c.hat > 0) {
          faceBox(c);
          const f = FACE[c.face] ?? [];
          g.save(); g.beginPath();
          poly(g, f[0] ?? 0, f[1] ?? 0, f[2] ?? 0, f[3] ?? 0);
          g.clip(); g.beginPath(); g.rect(fx0, fy0, (fx1 - fx0) * c.hat + 0.5, fy1 - fy0); g.clip();
          g.globalAlpha = 0.6 * a * ra; g.strokeStyle = n ? p.mute : p.rule; g.beginPath();
          for (let t = -(fy1 - fy0); t < fx1 - fx0; t += n ? 5 : 6) { g.moveTo(fx0 + t, fy1); g.lineTo(fx0 + t + (fy1 - fy0), fy0); }
          g.stroke(); g.restore();
        }
        if (c.er >= 0) { // eraser hairline sweeps across the cube
          const e = Math.min(1, c.er * 1.5), ex = Math.round(c.x + ease(e) * c.k * 1.42) + 0.5;
          g.globalAlpha = 0.3 * Math.sin(Math.PI * e); g.strokeStyle = p.ink; g.beginPath();
          g.moveTo(ex, c.y - c.k * 1.3 - 4); g.lineTo(ex, c.y + 5); g.stroke();
        }
        if (rot) g.restore();
      };
      for (let lv = 0; lv < 6; lv++) for (const c of pool) if (c.on && c.lvl === lv) paint(c, near(c.slot)); // bottom up, so a near cube's fill covers the one below
      for (const d of drops) { // dropped cubes: near style, over the letters
        paint(d, true);
        if (d === fall && ast === 1) { // the plotter traces the edges once in red, then the red fades into the ink
          const tl = totalLen(d), a = d.er < 0 ? 1 : 1 - smooth(d.er);
          d.dist = tl * Math.min(1, at / 0.6);
          fr.globalAlpha = a * (at < 0.6 ? 1 : 1 - (at - 0.6) / 0.4); fr.strokeStyle = p.signal; fr.beginPath();
          if (strokeLegs(fr, d, 0)) fr.stroke();
          d.dist = tl;
        }
      }
      fr.globalAlpha = 1;
      if (rl && lp > 0.005) { // react: the pen's leader, canvas top to the cube's top, drawn out and retracted with lp
        const ex = rl.x + 0.5 + rl.k * 0.71, ey = rl.y - rl.k * 1.15 - 4 * rl.ro;
        fr.globalAlpha = 0.9 * lp; fr.strokeStyle = p.signal; fr.lineWidth = 1; fr.beginPath();
        fr.moveTo(lu, 0); fr.lineTo(lu + (ex - lu) * lp, ey * lp); fr.stroke(); fr.globalAlpha = 1;
      }
      // gantry rail: only near the carriage, fading out to both sides; the carriage rides it in the head room
      back.strokeStyle = p.ink; back.lineWidth = 1;
      for (let i = 0; i < 16; i++) {
        back.globalAlpha = 0.35 * (1 - i / 16) ** 2; back.beginPath();
        back.moveTo(cx - (i + 1) * 28, railY); back.lineTo(cx - i * 28, railY); back.moveTo(cx + i * 28, railY); back.lineTo(cx + (i + 1) * 28, railY);
        back.stroke();
      }
      back.globalAlpha = 1; back.fillStyle = p.ink; back.fillRect(cx - 9, railY - 4, 18, 8);
      g = pd ? fr : back; // arm, pen and its marks share the depth of the job
      if (trA > 0.01) { // plotter rapid move, previewed then faded
        g.globalAlpha = trA; g.strokeStyle = p.signal; g.setLineDash(D45); g.beginPath();
        g.moveTo(tr.x0, tr.y0); g.quadraticCurveTo(tr.cx, tr.cy, tr.x1, tr.y1); g.stroke(); g.setLineDash(D0);
      }
      const tipY = ty - lift * 5 + Math.sin(time * 1.4) * 1.2 * lift;
      g.globalAlpha = 0.55; g.strokeStyle = p.ink; g.beginPath(); g.moveTo(cx, railY + 4); g.lineTo(tx, tipY); g.stroke();
      if (ringT >= 0) {
        g.globalAlpha = 0.8 * (1 - ringT); g.strokeStyle = p.trace; g.beginPath(); g.arc(rx, ry, 3 + ease(ringT) * 7, 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 1 - 0.45 * lift; g.fillStyle = p.signal; g.beginPath(); g.arc(tx, tipY, 1.5 - 0.6 * lift, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    },
    poke(kind, u) {
      if (kind === "leave") mAct = false;
      else { mx = u; mAct = true; if (kind === "down") qx = u; }
    },
    react(i, u) {
      if (i < 0) { rc = null; return; }
      let b: Cube | null = null, bd = 1e9;
      for (const c of pool) if (c.on && c.er < 0 && c.done) { // nearest in x; far back-row cubes only when nothing nearer is
        const d = Math.abs(c.x + c.k * 0.71 - u) + (near(c.slot) ? 0 : (slR[c.slot] ?? 0) * 30);
        if (d < bd) { bd = d; b = c; }
      }
      rc = rl = b; lu = u;
    },
    answer(u) {
      if (fall || W <= 0) return;
      const k = midK, x = clamp(u - k * 0.71, 0, Math.max(0, W - k * 1.42));
      const live = drops.filter((d) => d.er < 0);
      if (live.length >= DROPS) { const o = live[0]; if (o) o.er = 0; }
      const c: Cube = { on: true, slot: 0, lvl: 0, x, y: -k * 1.6, k, born: ++born, dist: 0, hat: 1, sh: 1, er: -1, done: true, face: 0, ro: 0 };
      setVerts(c); c.dist = totalLen(c);
      drops.push(c); fall = c; ast = 0; av = 0; ab = 0; fl = landAt(LN, x + k * 0.71, base) - 0.5;
    },
    still() {
      compose(true);
      drops.length = 0; fall = null; ast = 0; rc = rl = null; lp = 0; for (const c of pool) c.ro = 0;
      cur = null; ph = IDLE; qx = -1; ringT = -1; trA = 0; lift = liftT = 1;
      // pen resting just above the tallest gap stack, so the mover reads in front of the letters
      let j = -1;
      for (let i = 0; i < nSlots; i++) if (slN[i] === 1 && (j < 0 || tg(i) > tg(j))) j = i;
      pd = j < 0 ? 0 : 1;
      tx = j < 0 ? W / 2 : (slX[j] ?? 0) + (slK[j] ?? 0) * 1.1;
      ty = j < 0 ? railY + 40 : Math.max(railY + 24, (slY[j] ?? 0) - (slK[j] ?? 0) * (tg(j) + 0.3) - 10);
      cx = tx;
    },
  };
  const probe = () => {
    heights();
    let over = false, nn = 0, pc = 0, tw = 0;
    for (let i = 0; i < nSlots; i++) { if ((slotH[i] ?? 0) > ms(i)) over = true; nn += +(slN[i] === 1); pc += +(slN[i] === 2); tw += +(tg(i) >= 4); }
    return { n: count(), cap, over, nn, pc, tw, cm, st: ST, sw };
  };
  return { world, probe };
}

export function createRender(): World { return build().world; }

if (import.meta.env.DEV) {
  const L = [{ top: 90, base: 190, l: [0, 10, 12, 22], ch: "AB" }];
  console.assert(landAt(L, 5, 190) === 90 && landAt(L, 20, 190) === 90 && landAt(L, 11, 190) === 190 && landAt(L, 40, 190) === 190, "render: a dropped cube lands on the cap line of the letter under it, else the baseline");
  const row = (n: number, x: number, w: number, extra = 0) => { const l: number[] = []; for (let i = 0; i < n; i++) { l.push(x, x + w); x += w + 2 + (i === 7 ? extra : 0); } return l; };
  // desktop (one line, word gap after the eighth letter) and phone (two lines)
  const cfg: [number, number, Line[]][] = [
    [1200, 220, [{ top: 90, base: 190, l: row(15, 40, 70, 40), ch: "MOHAMMEDPARVEZ." }]],
    [375, 190, [{ top: 50, base: 95, l: row(8, 12, 26), ch: "MOHAMMED" }, { top: 110, base: 155, l: row(7, 12, 26), ch: "PARVEZ." }]],
  ];
  for (const [w, h, ln] of cfg) {
    const b = build();
    b.world.resize(w, h, ln);
    const q0 = b.probe();
    const lt = ln[ln.length - 1]?.l ?? []; // columns stand on the last line
    const hit = q0.st.some((x) => lt.some((v, i) => i % 2 === 0 && v < x + q0.sw && (lt[i + 1] ?? 0) > x));
    console.assert(q0.st.length >= 2 && !hit, `render world ${w}: a support column overlaps a letter, or the end columns are missing ${JSON.stringify(q0.st)}`);
    let ok = q0.nn >= 1 && q0.pc >= 1 && q0.tw >= 1 && q0.cm >= q0.cap;
    for (let i = 0; i < 12000; i++) {
      if (i % 500 === 0) b.world.poke("down", (i * 37) % w, 100);
      b.world.step(0.05);
      const q = b.probe();
      if (q.n > q.cap || q.over) ok = false;
    }
    console.assert(ok, `render world ${w}: no gap or perched slot, no tower, or cube cap or stack limit exceeded ${JSON.stringify(q0)}`);
  }
}
