// Raster footer world, "night shift": a pixel city at night with the name as its landmark and one tall Wanderer rearranging
// stone blocks. 1 unit = 1 backing pixel. Logic ticks at 12 Hz; drawing repaints only after a tick, resize or palette change.
// Three depth planes. Far (back canvas): a non-periodic skyline of open streets, low yards, stepped buildings, slim pillars,
// arches and towers; behind the letters only slim ones rising past the cap line, nothing lower. The name, standing on the street
// (its baseline) with a lit ground line. Near (front canvas, opaque over the letter cells): restrained pillars, one centred
// column in the word gap and up to two at the two outer edges only, and the flat tops of O A E D P R Z, where the Wanderer walks the cap line.
// Columns live in layers (layer 0 far, 1 near, 2.. one per line of the name); a column index is layer * bw + column.
// The Wanderer, what it carries and its particles are drawn behind the letters only where it stays visible there: above the
// solid part of the cap height or down in the faded foot.
import type { Line, Palette, World } from "./world.ts";

const TICK = 1 / 12;
const B = 4; // block edge in cells
const NP = 56; // particle pool
const HEAD = 16; // a column top stays this far below the stage top, so the Wanderer fits above it
const IDLE = 0, WALK = 1, PICK = 2, PLACE = 3, OUT = 4, IN = 5, INSP = 6;
const SWAY = [0, 1, 1, 0, 0, -1, -1, 0];
const LEG = [0, 2, 0, -2];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const NO_CLIP = -1e9;
const FLAT = "OAEDPRZ"; // letters with a solid flat top; M, H and V are open between their stems

type Arr = Uint8Array | Int16Array | Float32Array;
const g = (a: Arr, i: number): number => a[i] ?? 0;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

function build(seed: number) {
  const rnd = rng(seed);
  const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

  let W = 0, H = 0, bw = 0, N = 0, G = 0, dith = 0, top0 = 0, oy = 0, ready = false, lns: Line[] = [];
  // per column: blocks, floor and cap in blocks, ground (or cap line) y, lintel level (far), standable
  let hs = new Uint8Array(0), gr = new Int16Array(0), cmn = new Uint8Array(0), cmh = new Uint8Array(0);
  let car = new Uint8Array(0), sf = new Uint8Array(0), bh = new Uint8Array(0);
  let sx = new Int16Array(0), sy = new Int16Array(0), sc = new Uint8Array(0), son = new Uint8Array(0);
  const cx = new Int16Array(3), cy = new Int16Array(3), cw = new Int16Array(3);
  let moonX = 0, moonY = 0;
  let acc = 0, tk = 0, stay = 0;
  let dirty = true, lastP: Palette | undefined;

  // Wanderer: lay = layer it stands in
  let st = IDLE, x = 0, fy = 0, dir = 1, carry = false, timer = 8, pt = 0, tt = 0, stride = 0, lay = 0, up = false;
  let first = false, tgt = -1, stand = 0, after = IDLE, goal = 0, blink = 0, gaze = 0, queued = -1;
  // Pointer
  let hasPtr = false, mx = 0, my = 0, stare = 0;
  // Contact reactions: want = x a hovered link points at (-1 none). The Answer envelope: env 0 none, 1 falling, 2 resting,
  // 3 carried; ec = the column it rests on, ex its centre, ey its bottom while it falls; fe = the planned pick is the envelope
  let want = -1, env = 0, ec = 0, ex = 0, ey = 0, evy = 0, bounced = 0, fe = false;
  // Shooting star
  let sl = 0, ssx = 0, ssy = 0, nextStar = ri(480, 1080);
  // Particles: kind 0 signal, 1 trace, 2 dust; depth 1 = front canvas
  const px = new Float32Array(NP), py = new Float32Array(NP), pvx = new Float32Array(NP), pvy = new Float32Array(NP);
  const pl = new Uint8Array(NP), pk = new Uint8Array(NP), pd = new Uint8Array(NP);
  // Wanderer parts, filled per draw: x, y, w, h
  const parts = new Int16Array(16 * 4);
  let np = 0, clipTop = NO_CLIP;

  const footX = (c: number) => c * B + 2;
  const col = () => clamp(Math.floor(x / B), 0, Math.max(0, bw - 1));
  const cur = () => lay * bw + col();
  const near = (i: number) => i >= bw;
  const mn = (i: number) => g(cmn, i);
  const mh = (i: number) => g(cmh, i);
  const colTop = (i: number) => g(gr, i) - g(hs, i) * B;
  const layerOf = (i: number) => Math.floor(i / bw);
  // behind the letters only where the Wanderer shows: its eyes clear the solid top 55% of every line
  const solid = (y: number) => lns.some((l) => y >= l.top && y < l.top + (l.base - l.top) * 0.55);
  const deep = () => (near(cur()) || lay > 1 || (lns.length < 2 && solid(fy - 11)) ? 1 : 0);
  const over = (li: number, u: number) => {
    const l = lns[li]?.l ?? [];
    for (let i = 0; i + 1 < l.length; i += 2) if (u >= (l[i] ?? 0) && u <= (l[i + 1] ?? 0)) return true;
    return false;
  };
  // inside a letter's box, cap line to baseline, with one cell of margin: a star there would read as a stray cell fragment
  const inLetter = (u: number, v: number) => lns.some((ln) => v >= ln.top - 1 && v <= ln.base + 1 && ln.l.some((e, j) => !(j & 1) && u >= e - 1 && u <= (ln.l[j + 1] ?? 0) + 1));

  function spawn(x0: number, y0: number, vx: number, vy: number, life: number, kind: number, d = deep()) {
    for (let i = 0; i < NP; i++) {
      if (pl[i]) continue;
      px[i] = x0; py[i] = y0; pvx[i] = vx; pvy[i] = vy; pl[i] = life; pk[i] = kind; pd[i] = d;
      return;
    }
  }
  const puff = (i: number) => {
    for (let k = 0; k < 4; k++) spawn(footX(i % bw) + ri(-3, 3), colTop(i), (rnd() - 0.5) * 1.2, -0.3 - rnd() * 0.4, 5, 2, near(i) ? 1 : 0);
  };

  function setSize(w: number, h: number, lines: Line[]) {
    W = Math.max(1, Math.floor(w));
    H = Math.max(1, Math.floor(h));
    lns = lines.length ? lines : [{ top: H * 0.4, base: H * 0.85, l: [], ch: "" }];
    const last = lns[lns.length - 1]!;
    const base = clamp(Math.round(last.base), B, H);
    const top = clamp(Math.round(last.top), 0, base), cap = Math.max(B, base - top);
    top0 = clamp(Math.round(lns[0]!.top), 0, top);
    // shortcut: a tall frame (the 100vh stage, H > 90 cells; the band is <= 72) keeps its scene in a band-sized strip from one
    // cap height above the first line down, so the sky over it stays clear for the contact text; upgrade if the band grows
    oy = H > 90 ? Math.max(0, Math.round(top0 - (lns[0]!.base - lns[0]!.top))) : 0;
    env = 0; want = -1; fe = false;
    dith = clamp(H - Math.ceil(last.base), 0, 4); // dither rows: only below the letters
    G = Math.min(H, Math.ceil(last.base)); // the street level is the baseline, so the name stands on it; the rows below dissolve to paper
    bw = Math.ceil(W / B);
    N = bw * (2 + lns.length);
    gr = new Int16Array(N); cmn = new Uint8Array(N); cmh = new Uint8Array(N); sf = new Uint8Array(N); car = new Uint8Array(bw);
    gr.fill(G, 0, 2 * bw);
    sf.fill(1, 0, bw);

    // far: the skyline is built from the seed alone, so a resize rebuilds the same city. Units are drawn left to right until
    // the width is full: street (open ground, loose crates), yard (1-2 blocks), building (2-3 columns, stepped top), pillar
    // (one column), tower (stepped spire) and arch (two pillars and a lintel). Heights come in tiers: low, mid (behind the
    // letters), high (past the cap line) and top (toward the stage top); a unit past the cap line only follows a lower one.
    const tr = rng(seed ^ 0x5bd1e995), ti = (a: number, b: number) => a + Math.floor(tr() * (b - a + 1));
    const R = Math.max(1, Math.floor((G - oy - HEAD) / B)); // tallest column, in blocks
    const cb = clamp(Math.round((G - top) / B), 1, R); // blocks up to the cap line
    const lowH = () => ti(1, Math.min(2, R));
    const midH = () => clamp(ti(Math.ceil(cb * 0.4), Math.ceil(cb * 0.75)), 2, R);
    const highH = () => clamp(ti(cb, cb + 1), 1, R);
    const topH = () => clamp(ti(cb + 1, cb + 3), 1, R);
    const lift = (h: number) => Math.max(1, h - 1);
    const step = (h: number, n: number) => (n === 2 ? (tr() < 0.5 ? [h, lift(h)] : [lift(h), h]) : [lift(h), h, lift(h)]);
    const um = new Uint8Array(bw + 4);
    bh = new Uint8Array(bw);
    for (const ln of lns) for (let i = 0; i + 1 < ln.l.length; i += 2) for (let c = Math.max(0, Math.floor((ln.l[i] ?? 0) / B)); c <= Math.min(bw - 1, Math.floor((ln.l[i + 1] ?? 0) / B)); c++) bh[c] = 1;
    for (let c = 0, ph = 0; c < bw; ) {
      const r = tr(), tall = ph < cb && tr() < 0.6;
      let kind = r < 0.18 ? 0 : r < 0.33 ? 1 : r < 0.58 ? 2 : r < 0.72 ? 3 : r < 0.84 ? 4 : 5, hh: number[], lintel = 0;
      if (kind === 4 && !tall) kind = 2;
      if (kind === 5 && (R < 4 || c + 2 >= bw)) kind = 3;
      if (kind === 0) hh = Array<number>(ti(1, 3)).fill(0);
      else if (kind === 1) hh = Array.from({ length: ti(2, 4) }, lowH);
      else if (kind === 2) hh = step(tall ? highH() : midH(), ti(2, 3));
      else if (kind === 3) hh = [tall ? (tr() < 0.3 ? R : topH()) : midH()];
      else if (kind === 4) { const h = topH(); hh = [Math.max(1, h - 2), h, lift(h)]; }
      else { const p = clamp(tall ? topH() : midH(), 4, R); hh = [p, 1, p]; lintel = p; }
      const mxi = hh.indexOf(Math.max(...hh));
      hh.forEach((h, i) => {
        if (c + i >= bw) return;
        cmn[c + i] = h;
        cmh[c + i] = Math.min(R, h + (h === 0 ? (tr() < 0.5 ? 2 : 0) : i === mxi && tr() < 0.4 ? ti(1, 2) : 0)); // loose blocks to work on
      });
      if (lintel) car[c + 1] = lintel;
      hh.forEach((_, i) => { um[c + i] = Math.max(...hh); });
      ph = Math.max(...hh);
      c += hh.length;
    }

    // behind the letters only slim tall structures stay; every lower column stays empty, so no block edge cuts a letter cell
    for (let c = 0; c < bw; c++) if (bh[c] && g(um, c) < cb) { cmn[c] = 0; cmh[c] = 0; car[c] = 0; }

    // spires: 3-7 tall units spread over the width (mid-sky and near the top, 1-3 columns wide), set where no letter is
    // if one is within reach; they may pass the usual column limit, and nobody stands on them
    const Rs = Math.max(R, Math.floor((G - oy - 3) / B)), ns = W < 200 ? 4 : 6, wd = [1, 2, 3, 1, 2, 1];
    for (let k = 0, end = 0; k < ns; k++) {
      let c = Math.round(((k + 0.5) * bw) / ns + ti(-2, 2));
      for (let d = 1; d <= bw / ns / 2 && bh[clamp(c, 0, bw - 1)]; d++) {
        const a = clamp(c - d, 0, bw - 1), b = clamp(c + d, 0, bw - 1);
        if (!bh[a]) c = a; else if (!bh[b]) c = b;
      }
      c = clamp(c, end, bw - 1);
      const w = Math.min(wd[k % 6] ?? 1, bw - c), h = (k + (tr() < 0.5 ? 1 : 0)) & 1 ? Rs - ti(0, 1) : cb + Math.round((Rs - cb) / 2);
      for (let i = 0; i < w; i++) { cmn[c + i] = cmh[c + i] = Math.max(cb + 1, h - (w === 3 && i !== 1 ? 1 : 0)); car[c + i] = 0; if (g(cmn, c + i) > R) sf[c + i] = 0; }
      end = c + w + 1;
    }

    // near: restrained pillars at least one block above the baseline: one centred column in the word gap (nearly to the cap
    // line), a cell clear of each letter so no lit edge touches it, and up to two columns at the two outer edges (tall) only
    const lo = Math.ceil((G - base) / B) + 1, hi = Math.max(lo, Math.min(R, Math.floor((G - top - 2) / B)));
    const l = last.l, nl = l.length;
    let ga = 0, gb = 0;
    for (let i = 2; i < nl; i += 2) if ((l[i] ?? 0) - (l[i - 1] ?? 0) > gb - ga) { ga = l[i - 1] ?? 0; gb = l[i] ?? 0; }
    const sp: number[][] = [[ga + 1, gb - 1, hi, 1], [0, l[0] ?? 0, Math.min(R, cb + 2), 2], [l[nl - 1] ?? W, W, Math.min(R, cb + 2), 2]];
    const used: number[] = [];
    for (const [a0 = 0, b0 = 0, m = 0, k = 2] of sp) {
      const a = Math.max(0, a0), b = Math.min(bw * B, b0), mid = (a + b) / 2;
      if (m < lo || used.some((u) => Math.abs(u - mid) < W * 0.1)) continue;
      for (let nc = k; nc > 0; nc--) {
        const c0 = clamp(Math.round(mid / B - nc / 2), Math.ceil(a / B), Math.floor(b / B) - nc);
        if (c0 * B < a || (c0 + nc) * B > b) continue;
        for (let i = 0; i < nc; i++) { const c = bw + c0 + i; sf[c] = 1; cmn[c] = lo; cmh[c] = Math.max(lo, m - i * 2); }
        used.push(mid);
        break;
      }
    }

    // letter tops: every column that overlaps the flat top of a walkable letter can be stood on, with room for one block
    lns.forEach((ln, li) => {
      for (let i = 0; i < ln.ch.length && 2 * i + 1 < ln.l.length; i++) {
        if (!FLAT.includes(ln.ch[i]!)) continue;
        for (let c = Math.max(0, Math.floor((ln.l[2 * i] ?? 0) / B)); c <= Math.min(bw - 1, Math.floor((ln.l[2 * i + 1] ?? 0) / B)); c++) {
          const o = (2 + li) * bw + c;
          sf[o] = 1; cmh[o] = 1; gr[o] = Math.round(ln.top);
        }
      }
    });

    if (lns.length > 1) { // phone: stand only on the first line's top and on open ground, never in front of letters
      for (let i = 3 * bw; i < N; i++) sf[i] = 0;
      for (let i = 0; i < 2 * bw; i++) if (bh[i % bw]) sf[i] = 0;
    }
    const old = hs;
    hs = new Uint8Array(N);
    for (let i = 0; i < 2 * bw; i++) hs[i] = clamp(i < old.length ? g(old, i) : ti(mn(i), mh(i)), mn(i), mh(i));
    moonX = Math.round(W * 0.8);
    moonY = clamp(Math.floor((top0 - oy) * 0.45), 4, Math.max(4, top0 - oy - 4)); // the sky is drawn translated down by oy
    const skyH = Math.max(2, base - oy - Math.round(cap * 0.6) - 1); // stars down to the low roofs, never inside a letter box
    const n = clamp(Math.floor((W * skyH) / 420), 6, 140);
    sx = new Int16Array(n); sy = new Int16Array(n); sc = new Uint8Array(n); son = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      // shortcut: gives up after 200 draws and keeps the last one, for a sky the letter boxes fill; upgrade if that frame ships
      for (let k = 0; k < 200; k++) {
        sx[i] = ri(0, W - 1); sy[i] = ri(1, skyH);
        if (!(Math.abs(g(sx, i) - moonX) < 8 && Math.abs(g(sy, i) - moonY) < 8) && !inLetter(g(sx, i), g(sy, i) + oy)) break;
      }
      sc[i] = rnd() < 0.5 ? 1 : 0;
      son[i] = 1;
    }
    for (let i = 0; i < 3; i++) {
      cw[i] = ri(10, 18);
      cy[i] = ri(2, Math.max(2, top0 - oy + Math.round(cap * 0.2)));
      cx[i] = Math.floor((i * W) / 3) + ri(0, Math.floor(W / 6));
    }
    lay = 0;
    if (!ready) { ready = true; x = footX(Math.floor(bw * 0.4)); } else x = footX(col());
    for (let d = 0; d < bw && !g(sf, col()); d++) { const c = clamp(col() + (d & 1 ? d : -d), 0, bw - 1); if (g(sf, c)) x = footX(c); }
    fy = colTop(cur());
    st = IDLE; timer = 6; tgt = -1; tt = 0; pl.fill(0); first = lns.length < 2; visit();
    dirty = true;
  }

  const blocksOn = (a: number, b: number) => { let t = 0; for (let i = a; i < b; i++) t += g(hs, i); return t; };

  /** The 3 fullest columns (sign 1, above their floor) or the 3 emptiest (sign -1, below their cap) in [a, b), nearer ones
   *  favoured; one at random, or -1. */
  function pickCol(sign: number, a: number, b: number): number {
    let i0 = -1, i1 = -1, i2 = -1, k0 = -99, k1 = -99, k2 = -99;
    for (let c = a; c < b; c++) {
      const v = g(hs, c);
      if (sign > 0 ? v <= mn(c) : v >= mh(c)) continue;
      if (!g(sf, c - 1) && !g(sf, c + 1)) continue; // nobody can stand beside it, so plan() would only idle
      const k = (sign * (v - mn(c))) / Math.max(1, mh(c) - mn(c)) + rnd() * 0.3 - (Math.abs((c % bw) - col()) / bw) * 0.7;
      if (k > k0) { i2 = i1; k2 = k1; i1 = i0; k1 = k0; i0 = c; k0 = k; }
      else if (k > k1) { i2 = i1; k2 = k1; i1 = c; k1 = k; }
      else if (k > k2) { i2 = c; k2 = k; }
    }
    const n = (i0 >= 0 ? 1 : 0) + (i1 >= 0 ? 1 : 0) + (i2 >= 0 ? 1 : 0);
    if (!n) return -1;
    const r = ri(0, n - 1);
    return r === 0 ? i0 : r === 1 ? i1 : i2;
  }

  // habitat dwell: ticks left before the Wanderer crosses between the street and the letter tops
  const visit = () => { stay = lay > 1 ? ri(60, 96) : ri(216, 312); };

  function startTp() { st = OUT; tt = 0; }

  function beginAction() {
    if (after === IDLE || tgt < 0) { st = IDLE; timer = ri(10, 24); return; }
    const tc = tgt % bw;
    dir = tc > col() ? 1 : tc < col() ? -1 : dir;
    st = after; pt = 0;
  }

  /** True if walking from column a to b leaves the layer, crosses a column nobody can stand on or climbs more than two blocks at once. */
  function rough(a: number, b: number) {
    if (layerOf(a) !== layerOf(b)) return true;
    const d = Math.sign(b - a);
    for (let c = a; c !== b; c += d) if (!g(sf, c + d) || Math.abs(colTop(c + d) - colTop(c)) > 2 * B) return true;
    return false;
  }

  function go() {
    const c = cur();
    if (stand !== c && (Math.abs((stand % bw) - col()) * B > (env ? 30 : W * 0.35) || (!env && rnd() < 0.25) || rough(c, stand))) { startTp(); return; }
    if (stand !== c) { st = WALK; goal = footX(stand % bw); stride = 0; return; }
    beginAction();
  }

  /** A column on a letter top: on the cap line already (a walk along it, at least 3 columns on), else any. */
  function letterCol() {
    const on = lay > 1, a = on ? lay * bw : 2 * bw, b = on ? a + bw : N;
    for (let i = 0; i < 8 && b > a; i++) { const t = ri(a, b - 1); if (g(sf, t) && (!on || Math.abs(t - cur()) >= 3)) return t; }
    return -1;
  }

  function plan(act: number, up = false, force = -1) {
    let t = -1;
    fe = force >= 0;
    if (force >= 0) t = force;
    else if (act === INSP) stand = t = letterCol();
    else if (act === PLACE && queued >= 0 && queued < bw && g(hs, queued) < mh(queued)) { t = queued; queued = -1; }
    else {
      // the caller checked the 1-2 blocks on the letter tops rule before passing up; phones only stand on the first line
      const sign = act === PICK ? 1 : -1;
      t = pickCol(sign, up ? 2 * bw : 0, up ? (lns.length > 1 ? 3 * bw : N) : 2 * bw);
      if (t < 0) t = pickCol(sign, 0, 2 * bw);
    }
    if (t >= 0 && act !== INSP) {
      // stand beside the target, on whichever side is nearer its height
      const ok = (i: number) => i >= 0 && i < N && layerOf(i) === layerOf(t) && g(sf, i) === 1;
      const o = [t - 1, t + 1].filter(ok).sort((a, b) => Math.abs(colTop(a) - colTop(t)) - Math.abs(colTop(b) - colTop(t)) || Math.abs(a - cur()) - Math.abs(b - cur()));
      if (o.length) stand = o[0]!; else t = -1;
    }
    if (t < 0) { tgt = -1; after = IDLE; stand = cur(); }
    else { tgt = t; after = act; }
    go();
  }

  /** The skyline column nearest the envelope's that a building stands on and someone can stand beside, or -1. */
  function door() {
    const c0 = ec % bw;
    for (let d = 0; d < bw; d++) for (const c of [c0 - d, c0 + d]) if (c >= 0 && c < bw && g(hs, c) >= 2 && ((c > 0 && g(sf, c - 1)) || (c < bw - 1 && g(sf, c + 1)))) return c;
    return -1;
  }

  /** A short walk along the street or the cap line, no errand. */
  function stroll() {
    const c = lay * bw + clamp(col() + ri(-14, 14), 0, bw - 1);
    tgt = -1; after = IDLE;
    if (c !== cur() && !rough(cur(), c)) { st = WALK; stand = c; goal = footX(c % bw); stride = 0; }
    else { st = IDLE; timer = ri(6, 12); }
  }

  /** Teleport to a random standable street column, no errand. */
  function down() {
    for (let i = 0; i < 20; i++) {
      const c = ri(0, 2 * bw - 1);
      if (g(sf, c)) { tgt = -1; after = IDLE; stand = c; startTp(); return; }
    }
  }

  function forceTp() {
    const c0 = col();
    let c = -1;
    for (let i = 0; i < 10 && c < 0; i++) { const t = ri(0, bw - 1); if (Math.abs(t - c0) * B > W * 0.35) c = t; }
    if (c < 0) c = c0 < bw / 2 ? bw - 1 : 0;
    if (c === c0 && lay === 0) return;
    tgt = -1; after = IDLE; stand = c;
    startTp();
  }

  function tick() {
    tk++; stay--;
    dirty = true;
    if (tk % 8 === 0) for (let i = 0; i < 3; i++) { cx[i] = g(cx, i) + 1; if (g(cx, i) > W) cx[i] = -g(cw, i); }
    if (son.length && rnd() < 0.4) { const i = ri(0, son.length - 1); if ((i & 3) === 0) son[i] = g(son, i) ^ 1; }
    if (sl > 0) { sl--; ssx += 3; ssy += 1; }
    else if (--nextStar <= 0) { sl = 9; ssx = ri(Math.floor(W * 0.1), Math.floor(W * 0.5)); ssy = ri(2, Math.max(2, top0 - oy)); nextStar = ri(480, 1080); }
    for (let i = 0; i < NP; i++) {
      if (!pl[i]) continue;
      pl[i] = g(pl, i) - 1;
      px[i] = g(px, i) + g(pvx, i);
      py[i] = g(py, i) + g(pvy, i);
      if (pk[i] === 2) pvy[i] = g(pvy, i) + 0.12;
    }
    gaze = !hasPtr ? 0 : mx - x > 6 ? 1 : mx - x < -6 ? -1 : 0;
    if (blink > 0) blink--; else if (rnd() < 0.025) blink = 2;
    if (lay > 1) up = true;

    fy += clamp(colTop(cur()) - fy, -2, 2);
    if (tgt >= N) { tgt = -1; if (st === PICK || st === PLACE || st === INSP) { st = IDLE; timer = 6; } }
    if (env === 1) { // the Answer falls under gravity, one small bounce, then rests
      evy += 1.5; ey += evy;
      const gy = colTop(ec);
      if (ey >= gy) { ey = gy; if (bounced) env = 2; else { bounced = 1; evy = -4; } }
    }
    if (want >= 0 && !env && (st === IDLE || st === WALK)) { // a hovered link: face it and walk along this layer as far as it goes
      const c0 = col(), ct = clamp(Math.floor(want / B), 0, bw - 1), d = Math.sign(ct - c0);
      let c = c0;
      while (c !== ct && !rough(lay * bw + c, lay * bw + c + d)) c += d;
      dir = d || (want > x ? 1 : -1);
      if (x !== footX(c)) { st = WALK; stand = lay * bw + c; goal = footX(c); tgt = -1; after = IDLE; }
      else { st = IDLE; timer = 9; }
    }

    switch (st) {
      case IDLE:
        if (rnd() < 0.12) spawn(x + ri(-4, 4), fy - ri(2, 12), 0, -0.15 - rnd() * 0.15, ri(14, 24), 1);
        if (env) timer = Math.min(timer, 1); // the Answer is urgent
        if (--timer <= 0) {
          const r = rnd(), onTop = lay > 1, job = carry ? PLACE : PICK, lc = blocksOn(2 * bw, N);
          if (env) { // block in hand: set it down first; then fetch the envelope and put it into the nearest building
            const e = env, dc = e === 3 ? door() : -1;
            if (carry && e < 3) plan(PLACE);
            else plan(e === 3 ? PLACE : PICK, false, e === 3 ? dc : ec);
            if (tgt < 0 && !(carry && e < 3)) { if (e === 3) carry = false; env = 0; } // nobody can reach it: it vanishes
          }
          else if (carry && !onTop) plan(PLACE, lc < 2 && r < 0.3); // finish the street errand, now and then by setting it on a letter top
          else if (first) { first = false; plan(INSP); } // the first act after a layout: climb to the cap line and look
          else if (stay <= 0) { // visit over: cross over by teleport
            if (!onTop) plan(INSP);
            else { plan(job); if (tgt < 0) down(); } // no street errand to make: go down anyway
          }
          else if (r < (onTop ? 0.25 : 0.3)) stroll();
          else if (!onTop) plan(PICK);
          else if (r < 0.6 || (carry ? lc > 1 : lc < 1)) plan(INSP); // tops: look, or work a block only when one can be taken or set
          else plan(job, true);
        }
        break;
      case WALK:
        stride++;
        if (env || stride % 2 === 0) { const d = Math.sign(goal - x); if (d) { x += d * Math.min(env ? 2 : 1, Math.abs(goal - x)); dir = d; } } // hurrying with the Answer: double pace
        if (x === goal) beginAction();
        break;
      case PICK:
        if (fe && env === 1) break; // reaching for the envelope: wait for it to land
        if (pt === 2 && fe && env === 2) { env = 3; carry = true; }
        else if (pt === 2 && !fe && g(hs, tgt) > mn(tgt)) { hs[tgt] = g(hs, tgt) - 1; carry = true; }
        if (++pt >= 5) { st = IDLE; timer = ri(8, 14); fe = false; }
        break;
      case PLACE:
        if (pt === 2 && env === 3) { env = 0; carry = false; puff(tgt); }
        else if (pt === 2 && g(hs, tgt) < mh(tgt)) {
          hs[tgt] = g(hs, tgt) + 1;
          carry = false;
          puff(tgt);
        }
        if (++pt >= 5) { st = IDLE; timer = ri(10, 20); }
        break;
      case INSP: // head and eyes down on the letter, a mote of trace or signal lifting off it
        if (rnd() < 0.3) spawn(x + dir * ri(1, 4), fy - 1, 0, -0.2 - rnd() * 0.15, ri(10, 18), rnd() < 0.4 ? 0 : 1);
        if (++pt >= 22) { st = IDLE; timer = ri(8, 16); }
        break;
      case OUT:
        tt++;
        for (let i = 0; i < 3; i++) spawn(x + ri(-2, 2), fy - 13 + tt * 2 - ri(0, 2), (rnd() - 0.5) * 0.6, -0.3 - rnd() * 0.5, ri(8, 16), rnd() < 0.5 ? 0 : 1);
        if (tt >= 7) {
          const moved = layerOf(stand) > 1 !== lay > 1;
          lay = layerOf(stand); x = footX(stand % bw); fy = colTop(stand); st = IN; tt = 0;
          if (moved) visit(); // a hop along the same habitat does not restart the dwell
        }
        break;
      case IN:
        tt++;
        for (let i = 0; i < 3; i++) { const o = ri(-5, 5); spawn(x + o, fy - tt * 2 - ri(0, 2), -o * 0.1, -0.3, ri(6, 12), rnd() < 0.5 ? 0 : 1); }
        if (tt >= 7) {
          for (let i = 0; i < 4; i++) spawn(x + ri(-4, 4), fy - ri(2, 12), 0, -0.15 - rnd() * 0.1, ri(16, 26), 1);
          beginAction();
        }
        break;
    }
  }

  // ---- drawing ----
  const fr = (c: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) => {
    if (y0 < clipTop) { const d = clipTop - y0; if (d >= h) return; y0 += d; h -= d; }
    c.fillRect(x0, y0, w, h);
  };
  const part = (x0: number, y0: number, w: number, h: number) => {
    const o = np * 4;
    parts[o] = x0; parts[o + 1] = y0; parts[o + 2] = w; parts[o + 3] = h;
    np++;
  };

  function block(c: CanvasRenderingContext2D, p: Palette, bx: number, by: number, cl: number, k: number, top: boolean, nr: boolean, dk = false) {
    let v = Math.imul(cl + 11, 374761393) ^ Math.imul(k + 7, 668265263) ^ 0x9e3779b1;
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    v = (v ^ (v >>> 16)) >>> 0;
    c.fillStyle = p.rule;
    fr(c, bx, by, B, B);
    if (dk) return; // behind the name: plain and dark
    if (nr) { c.fillStyle = p.mute; fr(c, bx, by, 1, B); } // near blocks: a lit left edge and a brighter top
    if (top) { c.fillStyle = nr ? p.ink2 : p.mute; fr(c, bx, by, B, 1); }
    c.fillStyle = p.panel;
    fr(c, bx + (v & 3), by + ((v >> 2) & 3), 1, 1);
    fr(c, bx + ((v >> 4) & 3), by + ((v >> 6) & 3), 1, 1);
    if ((v >>> 8) % 13 === 0) {
      c.fillStyle = (v >>> 8) % 389 === 0 ? p.signal : p.trace; // lights are trace; red stays rare
      fr(c, bx + ((v >> 12) & 3), by + ((v >> 14) & 3), 1, 1);
    }
  }

  /** The Answer: a 7x5 envelope, ink outline, paper fill, a V flap and one signal seal. */
  function mail(c: CanvasRenderingContext2D, p: Palette, x0: number, y0: number) {
    c.fillStyle = p.ink;
    c.fillRect(x0, y0, 7, 5);
    c.fillStyle = p.paper;
    c.fillRect(x0 + 1, y0 + 1, 5, 3);
    c.fillStyle = p.ink;
    for (const [i, j] of [[1, 1], [5, 1], [2, 2], [4, 2]] as const) c.fillRect(x0 + i, y0 + j, 1, 1);
    c.fillStyle = p.signal;
    c.fillRect(x0 + 3, y0 + 2, 1, 1);
  }

  function limb(top: number, y0: number, rows: number, off: number, seg: number) {
    // one segment of a 3-segment limb; the offset grows toward the end
    part(top + Math.round((off * seg) / 2), y0, 1, rows);
  }

  /** An Enderman: tall, slim, a dark body (panel) with a full 1-cell mute rim, so it reads on the night and on the cream
   *  letters alike, and two signal eyes. On a letter top it hops 2 cells over the gaps between letters. */
  function wanderer(c: CanvasRenderingContext2D, p: Palette) {
    const f = fy - (lay > 1 && !over(lay - 2, x) ? 2 : 0);
    clipTop = st === OUT ? f - 15 + tt * 2 : st === IN ? f - tt * 2 : NO_CLIP;
    if (clipTop >= f) { clipTop = NO_CLIP; return; } // fully dissolved
    const walking = st === WALK, insp = st === INSP;
    const lo = walking ? (LEG[(stride >> 1) & 3] ?? 0) : 0;
    np = 0;
    const hx = (dir > 0 ? x - 1 : x - 3) + (st === IDLE ? (SWAY[(tk >> 2) & 7] ?? 0) : 0), hy = f - 12 + (insp ? 1 : 0);
    part(hx, hy, 4, 3); // head, bowed one cell while inspecting
    part(x - 1, f - 9, 2, 3); // torso
    for (let i = 0; i < 3; i++) { limb(x - 1, f - 6 + 2 * i, 2, lo, i); limb(x, f - 6 + 2 * i, 2, -lo, i); }
    const frontC = dir > 0 ? x + 1 : x - 2, backC = dir > 0 ? x - 2 : x + 1;
    const ao = lo >> 1;
    const reach = st === PICK && pt < 3;
    const holding = carry && !reach;
    if (reach) part(dir > 0 ? x + 1 : x - 5, f - 8, 5, 1);
    else {
      limb(frontC, f - 9, 2, ao, 0); limb(frontC, f - 7, 2, ao, 1);
      if (!holding) limb(frontC, f - 5, 3, ao, 2);
    }
    limb(backC, f - 9, 2, -ao, 0); limb(backC, f - 7, 2, -ao, 1); limb(backC, f - 5, 3, -ao, 2);
    c.fillStyle = deep() ? p.mute : p.ink2; // behind the letters the rim is brighter
    for (let i = 0; i < np; i++) { const o = i * 4; fr(c, g(parts, o) - 1, g(parts, o + 1) - 1, g(parts, o + 2) + 2, g(parts, o + 3) + 2); }
    c.fillStyle = p.panel;
    for (let i = 0; i < np; i++) { const o = i * 4; fr(c, g(parts, o), g(parts, o + 1), g(parts, o + 2), g(parts, o + 3)); }
    if (blink === 0 || insp) {
      c.fillStyle = p.signal;
      fr(c, hx + 1 + (gaze !== 0 ? gaze : walking ? dir : 0), hy + (insp ? 2 : 1), 2, 1);
    }
    if (want >= 0 && !env && (st === IDLE || st === WALK) && (tk >> 2) & 1) { // a hovered link: a blinking pointer above the head
      c.fillStyle = p.signal;
      const ax = dir > 0 ? x - 1 : x;
      fr(c, ax, hy - 5, 1, 3); fr(c, ax + dir, hy - 4, 1, 1);
    }
    if (carry) {
      let bx = dir > 0 ? x + 2 : x - (env === 3 ? 9 : 6), by = f - 8;
      if (st === PLACE && pt === 1 && tgt >= 0) { bx = (bx + (tgt % bw) * B) >> 1; by = (by + colTop(tgt) - B) >> 1; }
      if (env === 3) mail(c, p, bx, by);
      else block(c, p, bx, by, 7, 7, true, deep() === 1);
    }
    clipTop = NO_CLIP;
  }

  function draw(c: CanvasRenderingContext2D, f: CanvasRenderingContext2D, p: Palette) {
    if (!W || (!dirty && p === lastP)) return;
    dirty = false;
    lastP = p;
    f.clearRect(0, 0, W, H);
    c.fillStyle = p.paper;
    c.fillRect(0, 0, W, H);
    c.save();
    c.translate(0, oy); // the whole sky sits below the clear band of a tall frame
    for (let i = 0; i < sx.length; i++) {
      if (!son[i]) continue;
      c.fillStyle = sc[i] ? p.ink2 : p.mute;
      c.fillRect(g(sx, i), g(sy, i), 1, 1);
    }
    // moon: stepped disc, 7 cells wide
    c.fillStyle = p.ink2;
    c.fillRect(moonX - 1, moonY - 3, 3, 1);
    c.fillRect(moonX - 2, moonY - 2, 5, 1);
    c.fillRect(moonX - 3, moonY - 1, 7, 3);
    c.fillRect(moonX - 2, moonY + 2, 5, 1);
    c.fillRect(moonX - 1, moonY + 3, 3, 1);
    c.fillStyle = p.mute;
    c.fillRect(moonX - 1, moonY - 1, 1, 1);
    c.fillRect(moonX + 1, moonY + 1, 1, 1);
    if (sl > 0) {
      c.fillStyle = p.ink;
      for (let i = 0; i < 4; i++) c.fillRect(ssx - i * 2, ssy - i, 1, 1);
    }
    c.fillStyle = p.rule;
    for (let i = 0; i < 3; i++) {
      const a = g(cx, i), b = g(cy, i), w = g(cw, i);
      c.fillRect(a, b + 2, w, 2);
      c.fillRect(a + 3, b, w - 6, 2);
    }
    c.restore();
    // far: the dark ground under the open streets, a footing under every building, then the blocks and lintels
    for (let i = 0; i < bw; i++) {
      if (G < H) { c.fillStyle = mn(i) ? p.rule : p.panel; c.fillRect(i * B, G, B, H - G); }
      const n = g(hs, i);
      for (let k = 0; k < n; k++) block(c, p, i * B, G - (k + 1) * B, i, k, k === n - 1, false, bh[i] === 1 && G - (k + 1) * B + B > top0);
      if (car[i]) block(c, p, i * B, G - g(car, i) * B, i, 99, true, false, bh[i] === 1);
    }
    // near and letter tops, lit, on the front canvas
    for (let i = bw; i < N; i++) {
      if (!sf[i]) continue;
      const n = g(hs, i), cl = i % bw, y0 = g(gr, i);
      if (i < 2 * bw && G < H) { f.fillStyle = p.rule; f.fillRect(cl * B, G, B, H - G); }
      for (let k = 0; k < n; k++) block(f, p, cl * B, y0 - (k + 1) * B, cl + 53 * layerOf(i), k, k === n - 1, true);
    }
    wanderer(deep() ? f : c, p);
    for (let i = 0; i < NP; i++) {
      if (!pl[i]) continue;
      const d = pd[i] ? f : c;
      d.fillStyle = pk[i] === 0 ? p.signal : pk[i] === 1 ? p.trace : p.rule;
      d.fillRect(Math.floor(g(px, i)), Math.floor(g(py, i)), 1, 1);
    }
    if (env === 1 || env === 2) mail(f, p, ex - 3, Math.round(env === 1 ? ey : colTop(ec)) - 5); // over the letters, above the dither
    // the ground dissolves to paper over the bottom rows by an ordered dither; the front canvas covers both layers
    f.fillStyle = p.paper;
    for (let r = 0; r < dith; r++) {
      const y = H - 1 - r, t = (16 * (dith - r)) / dith;
      for (let x0 = 0; x0 < W; x0++) if ((BAYER[(y & 3) * 4 + (x0 & 3)] ?? 0) < t) f.fillRect(x0, y, 1, 1);
    }
    // the ground line the name stands on: one lit row at the street level, just below the letter cells, over the dither
    if (G < H) { f.fillStyle = p.mute; f.fillRect(0, G, W, 1); }
  }

  const world: World = {
    resize: setSize,
    step(dt) {
      if (!W) return;
      acc += dt;
      while (acc >= TICK) { acc -= TICK; tick(); }
      const over2 = hasPtr && Math.abs(mx - x) <= 6 && my >= fy - 15 && my <= fy + 1;
      stare = over2 ? stare + dt : Math.max(0, stare - dt * 2);
      if (stare >= 0.8 && (st === IDLE || st === WALK)) { stare = 0; forceTp(); }
    },
    draw,
    poke(kind, u, v) {
      if (kind === "leave") { hasPtr = false; gaze = 0; stare = 0; return; }
      hasPtr = true; mx = u; my = v;
      if (kind === "down" && bw) {
        const c = clamp(Math.floor(u / B), 0, bw - 1);
        queued = c;
        puff(c);
        dirty = true;
      }
    },
    react(i, u) {
      if (!W) return;
      want = i < 0 ? -1 : u;
      if (i < 0 && !env && (st === IDLE || st === WALK)) { st = IDLE; timer = 1; tgt = -1; after = IDLE; } // back to normal at once
    },
    answer(u) {
      if (!W || env) return;
      const c = clamp(Math.floor(u / B), 0, bw - 1);
      let t = -1;
      lns.forEach((ln, li) => { // a flat letter top under u, else the street
        for (let i = 0; i < ln.ch.length && 2 * i + 1 < ln.l.length; i++) {
          if (FLAT.includes(ln.ch[i]!) && u >= (ln.l[2 * i] ?? 0) && u <= (ln.l[2 * i + 1] ?? 0) && g(sf, (2 + li) * bw + c)) t = (2 + li) * bw + c;
        }
      });
      // else the nearest column with a standable neighbour: the street first (a phone has almost none), then a letter top
      for (let d = 0; t < 0 && d < bw; d++) for (const k of [c - d, c + d]) for (let L = 0; L < 2 + lns.length; L = L ? L + 1 : 2) {
        const i = L * bw + k;
        if (t < 0 && k >= 0 && k < bw && L !== 1 && g(sf, i) && ((k > 0 && g(sf, i - 1)) || (k < bw - 1 && g(sf, i + 1)))) t = i;
      }
      if (t < 0) return;
      ec = t; ex = clamp(t % bw === c ? Math.round(u) : footX(t % bw), 3, W - 4);
      env = 1; ey = -6; evy = 0; bounced = 0;
      if (st === WALK) { st = IDLE; tgt = -1; after = IDLE; }
    },
    still() {
      if (!W) return;
      env = 0; want = -1; fe = false;
      // near clusters full, every third far column full, and the Wanderer on the cap line near 60% of the width carrying a
      // block, with one more resting on the letter three columns on
      for (let i = 0; i < 2 * bw; i++) if (i >= bw || i % 3 === 1) hs[i] = mh(i);
      let c = -1;
      for (let i = 2 * bw; i < N; i++) if (g(sf, i) && (c < 0 || Math.abs(footX(i % bw) - W * 0.6) < Math.abs(footX(c % bw) - W * 0.6))) c = i;
      if (c < 0) c = Math.floor(bw / 2);
      else if (layerOf(c + 3) === layerOf(c) && g(sf, c + 3)) hs[c + 3] = 1;
      lay = layerOf(c); x = footX(c % bw); fy = colTop(c); dir = 1; carry = true; st = IDLE; timer = 99; tgt = -1;
      blink = 0; gaze = 0; sl = 0; pl.fill(0); son.fill(1);
      dirty = true;
    },
  };
  const total = () => blocksOn(0, N) + (carry && env !== 3 ? 1 : 0);
  return { world, total, env: () => env, ground: () => G, starsOut: () => sx.every((u, i) => !inLetter(u, g(sy, i) + oy)), mn, mh, nearAt: (c: number) => g(sf, bw + c) === 1, standable: () => g(sf, cur()) === 1, up: () => up, W: () => bw, top: () => lay > 1 };
}

export function createRaster(): World {
  return build((Math.random() * 4294967296) >>> 0).world;
}

if (import.meta.env.DEV) {
  // Block economy: heights stay within each column's floor and cap, blocks are conserved over ~4 minutes of ticks, the word
  // gap gets one centred near column (12-wide letters, 2-wide gaps, a 12-wide word gap), the Wanderer always stands on a standable
  // column and has walked a cap line by then.
  const t = build(1);
  const l: number[] = [];
  for (let i = 0, x = 10; i < 15; i++) { l.push(x, x + 12); x += 14 + (i === 7 ? 10 : 0); }
  t.world.resize(240, 64, [{ top: 18, base: 51.4, l, ch: "MOHAMMEDPARVEZ." }]);
  console.assert(t.ground() === 52 && t.starsOut(), "Footer raster: the street is off the baseline, or a star sits inside a letter box");
  const before = t.total();
  let bad = 0;
  let onTop = 0;
  for (let i = 0; i < 3000; i++) { t.world.step(1 / 12 + 1e-6); if (!t.standable()) bad++; if (t.top()) onTop++; }
  console.assert(t.nearAt(31) && !t.nearAt(30) && !t.nearAt(32), "Footer raster: the word gap (cells 120-132) lacks its one centred column");
  console.assert(Array.from({ length: t.W() * 4 }, (_, i) => i).every((i) => t.mh(i) >= t.mn(i)), "Footer raster: a column cap is below its floor");
  console.assert(t.total() === before, "Footer raster: blocks were created or lost");
  console.assert(!bad && t.up(), "Footer raster: the Wanderer stood off a column, or never reached a letter top");
  console.assert(onTop / 3000 > 0.2 && onTop / 3000 < 0.5, "Footer raster: the Wanderer spent " + Math.round(onTop / 30) + "% of its time on the letter tops, expected 20-50%");
  // The Answer: dropped in a tall frame, it is delivered within 8 s, no block is lost and a second call mid-run is ignored.
  const a = build(2);
  a.world.resize(240, 200, [{ top: 146, base: 190, l: l.map((v) => v + 0), ch: "MOHAMMEDPARVEZ." }]);
  for (let i = 0; i < 30; i++) a.world.step(1 / 12 + 1e-6);
  const n0 = a.total();
  a.world.answer(100);
  a.world.step(1 / 12 + 1e-6);
  a.world.answer(20);
  const first = a.env();
  for (let i = 0; i < 96 && a.env(); i++) a.world.step(1 / 12 + 1e-6);
  console.assert(first === 1 && !a.env() && a.total() === n0, "Footer raster: the Answer was not delivered within 8 s, or a block was lost");
}
