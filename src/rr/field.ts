import { rgb, type ModeTokens } from "./engine.ts";
import { token } from "./refresh.ts";

/**
 * Living portrait layer, drawn by Engine between the base portrait and the name.
 * Raster: flat square tiles on one plane, from the same quadtree baked into
 * portrait-px-raster.png, re-split and merged by slow noise; small groups travel out and reform, lone tiles slip and
 * return, tiles part round the pointer (position, scale, opacity only; never the face). Render (Toolpaths): pens trace
 * iso-distance contours of the silhouette in short strokes that keep their ink until the pen lifts, then fade in place; the
 * pointer is a second form the lines bend round (heads it deflected turn red); the face and name zone stay clear.
 * Positions are host CSS px; one GL_POINTS draw per frame through one dynamic buffer. No own loop: Engine's ticker.
 * Hot paths allocate nothing per point: results go through the scratch variables below.
 */
export interface Frame {
  t: number; mode: number; box: [number, number, number, number]; res: [number, number]; dpr: number;
  mouse: [number, number]; lens: number; por: number; derez: number; reduced: boolean;
}
export interface Field { readonly ready: boolean; draw(f: Frame): void; setColors(t: ModeTokens): void; destroy(): void }

// portrait-px.png units: the whole 1538x1719 frame. FACE matches the bake.
const PW = 136, PH = 152;
const FX = 0.403 * PW, FY = 0.283 * PH, FRX = 0.154 * PW, FRY = 0.168 * PH;
const faceE = (x: number, y: number) => ((x - FX) / FRX) ** 2 + ((y - FY) / FRY) ** 2;
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const sstep = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const MAXV = 12000, STRIDE = 8; // x, y, size, kind | r, g, b, a
// Render field, in portrait units: PAD cells of distance field around the portrait, H samples per stroke, K smooth-union width, EPS gradient step. msk fades toward the name zone and out of the face ellipse.
const PAD = 24, GW = PW + 2 * PAD, GH = PH + 2 * PAD, H = 20, K = 6, EPS = 0.5;
const msk = (x: number, y: number) => (1 - sstep(0.62 * PH, 0.72 * PH, y)) * sstep(1.25, 1.7, faceE(x, y));

// Scratch outputs (no per-call allocation): satD = deviation of the last box query; cX/cY = last focus centre.
let satD = 0, cX = 0, cY = 0;

// uRes and uDpr are shared with the FS (mediump there), so they must be mediump here too or the link fails.
const VS = `attribute vec4 aP;attribute vec4 aC;uniform mediump vec2 uRes;uniform mediump float uDpr;varying vec4 vC;varying float vK;varying float vS;
void main(){vec2 d=aP.xy*uDpr;gl_Position=vec4(d.x/uRes.x*2.-1.,1.-d.y/uRes.y*2.,0.,1.);gl_PointSize=aP.z*uDpr;vS=gl_PointSize;vK=aP.w;vC=aC;}`;
// kind 0: flat mosaic tile (one solid colour, 1 px gap so neighbours read as separate squares); 1: soft dot; 2: flat square.
const FS = `precision mediump float;uniform vec2 uRes;uniform float uDpr;uniform vec3 uLens;varying vec4 vC;varying float vK;varying float vS;
void main(){
  vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uDpr;
  if(uLens.z>.5&&length(p-uLens.xy)<uLens.z)discard;
  float a=vC.a;vec2 q=gl_PointCoord;
  if(vK<.5){vec2 px=q*vS;if(vS>3.&&(px.x>vS-1.||px.y>vS-1.))discard;}
  else if(vK<1.5){a*=1.-smoothstep(.6,1.,length(q-.5)*2.);}
  gl_FragColor=vec4(vC.rgb*a,a);
}`;

/** Summed-area table over a PW x PH channel: returns the mean of a square and leaves its deviation in satD. */
function sat(ch: Float32Array) {
  const W = PW + 1, s1 = new Float64Array(W * (PH + 1)), s2 = new Float64Array(W * (PH + 1));
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const v = ch[y * PW + x]!, i = (y + 1) * W + x + 1;
    s1[i] = v + s1[i - 1]! + s1[i - W]! - s1[i - W - 1]!;
    s2[i] = v * v + s2[i - 1]! + s2[i - W]! - s2[i - W - 1]!;
  }
  const box = (s: Float64Array, x: number, y: number, n: number) => s[(y + n) * W + x + n]! - s[y * W + x + n]! - s[(y + n) * W + x]! + s[y * W + x]!;
  return (x: number, y: number, n: number) => {
    const m = box(s1, x, y, n) / (n * n);
    satD = Math.sqrt(Math.max(box(s2, x, y, n) / (n * n) - m * m, 0));
    return m;
  };
}

/** Two-pass chamfer distance to the nearest cell where `on` is set, in units. */
function chamfer(on: Uint8Array, w = PW, h = PH) {
  const d = new Float32Array(w * h).map((_, i) => (on[i] ? 0 : 1e6));
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 1e6 : d[y * w + x]!);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    d[i] = Math.min(d[i]!, at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    d[i] = Math.min(d[i]!, at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
  }
  return d;
}

export function create(gl: WebGLRenderingContext, img: HTMLImageElement, onReady: () => void): Field {
  const sh = (t: number, s: string) => {
    const x = gl.createShader(t)!;
    gl.shaderSource(x, s);
    gl.compileShader(x);
    if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) ?? "field shader");
    return x;
  };
  const prog = gl.createProgram()!, vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { const log = gl.getProgramInfoLog(prog); gl.deleteProgram(prog); throw new Error(log || "field link"); }
  const aP = gl.getAttribLocation(prog, "aP"), aC = gl.getAttribLocation(prog, "aC");
  const U = { res: gl.getUniformLocation(prog, "uRes"), dpr: gl.getUniformLocation(prog, "uDpr"), lens: gl.getUniformLocation(prog, "uLens") };
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, MAXV * STRIDE * 4, gl.DYNAMIC_DRAW);
  const V = new Float32Array(MAXV * STRIDE);
  const maxPt = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1] ?? 64;
  let n = 0;
  const put = (x: number, y: number, s: number, k: number, c: number[], a: number) => {
    if (n >= MAXV || a < 0.01) return;
    const o = n++ * STRIDE;
    V[o] = x; V[o + 1] = y; V[o + 2] = s < maxPt ? s : maxPt; V[o + 3] = k;
    V[o + 4] = c[0]!; V[o + 5] = c[1]!; V[o + 6] = c[2]!; V[o + 7] = a;
  };

  let ready = false, dead = false, idle = 0;
  let tones: number[][] = [], ink = [0, 0, 0], sig = [1, 0, 0];
  // Data, filled in idle time.
  let qR: ReturnType<typeof sat>, qA: ReturnType<typeof sat>, qB: ReturnType<typeof sat>;
  let sd = new Float32Array(0); // Render only: signed distance (+ outside) on the padded GW x GH grid
  const rim: number[] = [];
  const NP = matchMedia("(pointer: coarse)").matches || innerWidth < 900 ? 150 : 320;
  // Pens: ph 0 drawing, 1 fading in place, 2 resting; j band, tm phase timer, v units/s, a draw alpha, n samples kept in SX/SY (stroke at i * H).
  const P = { x: new Float32Array(NP), y: new Float32Array(NP), tm: new Float32Array(NP), v: new Float32Array(NP), a: new Float32Array(NP), ph: new Uint8Array(NP), j: new Uint8Array(NP), n: new Uint8Array(NP), dir: new Int8Array(NP) };
  const SX = new Float32Array(NP * H), SY = new Float32Array(NP * H);
  const DUST = 250, dust = Array.from({ length: DUST }, (_, i) => [hash(i * 3.1), hash(i * 7.7), hash(i * 1.3), hash(i * 9.9)] as const);
  let lastT = -1, lastMx = -1e4, lastMy = -1e4, moveT = -99;
  // Render field state (units): spS eased pointer strength, pX/pY pointer, D band spacing, NBc bands, V0/V1 pen speed, SPC sample spacing; Dp = D the strokes were last settled to.
  let spS = 0, pX = -1e4, pY = -1e4, D = 2.4, Dp = 0, NBc = 7, V0 = 1.4, V1 = 2.6, SPC = 0.45;
  // Scratch: gF, gX, gY, gL = F, gradient and gradient length of the last grad.
  let gF = 0, gX = 0, gY = 0, gL = 0;
  const hc = [0, 0, 0];
  let RC = 5; // pointer disc radius: the lens ring when open (render), so contours make room for the lens

  /** Padded signed distance, bilinear (cell x spans [x, x + 1], so sample at x - 0.5). */
  const S = (x: number, y: number) => {
    const a = Math.min(GW - 1.001, Math.max(0, x + PAD - 0.5)), b = Math.min(GH - 1.001, Math.max(0, y + PAD - 0.5));
    const ix = a | 0, iy = b | 0, fx = a - ix, fy = b - iy, i = iy * GW + ix;
    return (sd[i]! * (1 - fx) + sd[i + 1]! * fx) * (1 - fy) + (sd[i + GW]! * (1 - fx) + sd[i + GW + 1]! * fx) * fy;
  };
  // Ink the lens has swallowed fades out instead of crawling out of it.
  const lz = (x: number, y: number) => 1 - spS * (1 - sstep(-3, 0, Math.hypot(x - pX, y - pY) - RC));
  /** F = silhouette smooth-unioned with the pointer disc, blended by spS. */
  const fF = (x: number, y: number) => {
    const s = S(x, y);
    if (spS < 0.002) return s;
    const c = Math.hypot(x - pX, y - pY) - RC, h = Math.max(K - Math.abs(s - c), 0) / K;
    return s + (Math.min(s, c) - h * h * K / 4 - s) * spS;
  };
  // Central differences over 2 * EPS = 1 unit, so the differences are the gradient.
  const grad = (x: number, y: number) => {
    gF = fF(x, y);
    gX = fF(x + EPS, y) - fF(x - EPS, y); gY = fF(x, y + EPS) - fF(x, y - EPS);
    gL = Math.hypot(gX, gY);
  };
  // Phone scale: bands, speed and sample spacing grow so a stroke stays about 3 CSS px between samples.
  const cfg = (u: number) => { D = Math.max(2.4, 12 / u); NBc = u < 4 ? 4 : 7; V0 = Math.max(1.4, 9 / u); V1 = Math.max(2.6, 17 / u); SPC = Math.max(0.45, 3 / u); };
  // The pass: a working region drifting on incommensurate sines (periods about 48, 65, 88, 118 s). Writes cX/cY.
  const focus = (t: number) => {
    cX = PW * 0.5 + PW * 0.32 * Math.sin(0.13 * t + 1.1) + PW * 0.14 * Math.sin(0.071 * t + 0.4);
    cY = PH * 0.36 + PH * 0.18 * Math.sin(0.097 * t + 2.3) + PH * 0.08 * Math.sin(0.053 * t);
  };
  const gauss = (x: number, y: number, px: number, py: number, s: number) => Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * s * s));

  /** Start pen i on a band: a rim point pushed out by the band level, projected onto F = level, biased to the focus and pointer. */
  function spawn(i: number) {
    const j = Math.min(NBc, 1 + Math.floor(Math.random() ** 1.4 * NBc)), L = j * D;
    let ok = false, x = 0, y = 0;
    for (let tr = 0; tr < 4 && rim.length; tr++) {
      const k = (Math.random() * (rim.length >> 1) | 0) * 2;
      let cx = rim[k]!, cy = rim[k + 1]!;
      grad(cx, cy);
      if (gL > 0.05) { cx += gX / gL * L; cy += gY / gL * L; }
      for (let m = 0; m < 4; m++) { grad(cx, cy); if (gL < 0.05) break; const c = (gF - L) / gL; cx -= gX / gL * c; cy -= gY / gL * c; }
      if (Math.abs(fF(cx, cy) - L) > 0.3 || faceE(cx, cy) < 1.25 || cy > PH * 0.72) continue;
      ok = true; x = cx; y = cy;
      if (Math.random() < 0.2 + 0.8 * Math.max(gauss(cx, cy, cX, cY, 22), spS * gauss(cx, cy, pX, pY, 14))) break;
    }
    if (!ok) { P.ph[i] = 2; P.tm[i] = 0.3; return; }
    P.ph[i] = 0; P.tm[i] = 1.6 + Math.random() * 1.8; P.j[i] = j; P.dir[i] = Math.random() < 0.5 ? -1 : 1; P.v[i] = V0 + Math.random() * (V1 - V0);
    P.x[i] = x; P.y[i] = y; P.n[i] = 1; SX[i * H] = x; SY[i * H] = y;
  }

  /** Advance every pen dt seconds along its contour, then pull drawn samples back onto the (pointer-bent) contour. */
  function trace(t: number, dt: number) {
    focus(t);
    const r = 6 * dt;
    for (let i = 0; i < NP; i++) {
      const ph = P.ph[i]!, tm = P.tm[i]! - dt;
      P.tm[i] = tm;
      if (ph === 2) { if (tm <= 0) spawn(i); continue; }
      if (ph === 1) { if (tm <= 0) { P.ph[i] = 2; P.tm[i] = 0.2 + Math.random(); } continue; }
      let x = P.x[i]!, y = P.y[i]!, lift = tm <= 0;
      const L = P.j[i]! * D;
      grad(x, y);
      if (gL < 0.2) lift = true; // saddle where contours merge
      else {
        const nx = gX / gL, ny = gY / gL, v = P.v[i]! * dt * P.dir[i]!;
        x -= ny * v; y += nx * v;
        const c = Math.min(r, Math.max(-r, (fF(x, y) - L) / gL));
        x -= nx * c; y -= ny * c;
        if (Math.abs(fF(x, y) - L) > 1 || x < -PAD || x > PW + PAD || y < -PAD || y > PH + PAD || faceE(x, y) < 1.25 || y > PH * 0.72) lift = true;
      }
      if (!lift) {
        const b = i * H, n = P.n[i]!;
        if (Math.hypot(x - SX[b + n - 1]!, y - SY[b + n - 1]!) >= SPC) { if (n < H) { SX[b + n] = x; SY[b + n] = y; P.n[i] = n + 1; } else lift = true; }
        P.x[i] = x; P.y[i] = y;
      }
      if (lift) { P.ph[i] = 1; P.tm[i] = 0.8; }
    }
    if (spS > 0.002 || D !== Dp) for (let i = 0; i < NP; i++) {
      if (P.ph[i] === 2) continue;
      const L = P.j[i]! * D, b = i * H;
      for (let k = 0; k < P.n[i]!; k++) {
        grad(SX[b + k]!, SY[b + k]!);
        if (gL > 0.05) { const c = Math.min(14 * dt, Math.max(-14 * dt, (gF - L) / gL)); SX[b + k] = SX[b + k]! - gX / gL * c; SY[b + k] = SY[b + k]! - gY / gL * c; }
      }
    }
    Dp = D;
  }

  function build() {
    if (dead) return;
    const c = document.createElement("canvas"); // transient: released below in the same task
    c.width = PW; c.height = PH;
    const x2 = c.getContext("2d", { willReadFrequently: true });
    if (!x2) return;
    x2.drawImage(img, 0, 0, PW, PH);
    const px = x2.getImageData(0, 0, PW, PH).data;
    c.width = c.height = 0;
    const R = new Float32Array(PW * PH), A = new Float32Array(PW * PH), B = new Float32Array(PW * PH);
    for (let i = 0; i < PW * PH; i++) { R[i] = px[i * 4]! / 255; B[i] = px[i * 4 + 2]! / 255; A[i] = px[i * 4 + 3]! / 255; }
    qR = sat(R); qA = sat(A); qB = sat(B);
    // Render field: matte edge-replicated into a grid padded by PAD, so outer bands are not cut at the portrait box.
    const on = new Uint8Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) on[y * GW + x] = A[Math.min(PH - 1, Math.max(0, y - PAD)) * PW + Math.min(PW - 1, Math.max(0, x - PAD))]! > 0.5 ? 1 : 0;
    const dOut = chamfer(on, GW, GH), dIn = chamfer(on.map((v) => 1 - v), GW, GH);
    sd = dOut.map((v, i) => v - dIn[i]!);
    for (let y = 0; y < PH * 0.72; y++) for (let x = 0; x < PW; x++) if (Math.abs(sd[(y + PAD) * GW + x + PAD]!) < 1.5) rim.push(x + 0.5, y + 0.5); // head and both shoulder caps
    console.assert(rim.length > 0 && Math.abs(sd[((FY | 0) + PAD) * GW + (FX | 0) + PAD]!) > 0, "[rr] field: matte has no rim or face is outside it");
    // Pre-run about 3 s of tracing (pens start staggered) so the first frame is not empty; reduced motion keeps this state still.
    cfg(innerWidth < 900 ? innerWidth / PW : innerWidth * 0.62 / PW);
    for (let i = 0; i < NP; i++) { P.ph[i] = 2; P.tm[i] = Math.random() * 1.5; }
    for (let s = 0; s < 90; s++) trace(s / 30, 1 / 30);
    let dr = 0, ok = true;
    for (let i = 0; i < NP; i++) if (P.ph[i] === 0) { dr++; if (Math.abs(fF(P.x[i]!, P.y[i]!) - P.j[i]! * D) > 1) ok = false; }
    console.assert(dr > 0 && ok, "[rr] field: after the pre-run no pen is drawing, or a drawing pen is off its contour");
    ready = true;
    onReady();
  }
  const ric = (window as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  idle = ric ? ric(build, { timeout: 600 }) : window.setTimeout(build, 60);

  const TH: Record<number, number> = { 8: 0.05, 4: 0.075, 2: 0.11 };
  // Slow sine noise in [-1, 1] that steers which body cells split or merge.
  const noise = (x: number, y: number, t: number) => (Math.sin(x * 0.11 + t) + Math.sin(y * 0.083 - t * 0.8) + Math.sin((x + y) * 0.061 + t * 1.3) + Math.sin((x - y) * 0.07 - t * 0.6)) / 4;

  // Flat mosaic: every tile sits on one plane and moves only by position, scale and opacity (no depth, no parallax).
  function blocks(f: Frame, u: number, ox: number, oy: number, mx: number, my: number) {
    const t = f.t, live = !f.reduced, ptr = live && mx > -1e3;
    const leaf = (x: number, y: number, s: number) => {
      if (qA(x, y, s) < 0.5) return;
      const mr = qR(x, y, s), acc = qB(x, y, s) > 0.5;
      const h = hash(x * 7.1 + y * 3.3 + s * 0.7), gxI = x >> 4, gyI = y >> 4, gh = hash(gxI * 13.7 + gyI * 5.3);
      const cx = x + s / 2, cy = y + s / 2, e = faceE(cx, cy);
      let dx = 0, dy = 0, k = 1, o = 1;
      // Travel: a few 16-unit groups away from the face drift out across the plane and reform, each tile a little late.
      const gcx = gxI * 16 + 8, gcy = gyI * 16 + 8;
      if (live && gh < 0.24 && faceE(gcx, gcy) > 1.8) {
        const per = 7 + (gh / 0.24) * 9, ph = ((t / per + hash(gh * 91)) % 1) - h * 0.05;
        const env = ph > 0 && ph < 0.3 ? Math.sin(Math.PI * ph / 0.3) ** 1.5 : 0;
        if (env > 0) {
          let vx = gcx - PW * 0.5 + (hash(gh * 17) - 0.5) * 40, vy = gcy - PH * 0.4 + (hash(gh * 29) - 0.5) * 30;
          const l = Math.hypot(vx, vy) || 1, amp = 8 + hash(gh * 43) * 22 + h * 4;
          vx /= l; vy /= l;
          dx += vx * amp * env; dy += vy * amp * env;
          k -= 0.3 * env; o -= 0.4 * env;
        }
      }
      // Rearrange: now and then a lone off-face tile slips one cell sideways, dims, and slides back.
      if (live && e > 1.4 && hash(h * 57) < 0.12) {
        const ph = (t / (5 + h * 6) + h * 13) % 1;
        if (ph < 0.14) { const w = Math.sin(Math.PI * ph / 0.14); dx += (h < 0.5 ? -s : s) * w; o -= 0.5 * w; }
      }
      // Pointer: tiles near it part outward on the plane and shrink a little.
      if (ptr) {
        const px = cx - mx, py = cy - my, d = Math.hypot(px, py);
        if (d < 24 && d > 0.01) { const w = (1 - d / 24) ** 2; dx += (px / d) * w * 5; dy += (py / d) * w * 5; k -= 0.25 * w; }
      }
      const as = sstep(h * 0.55, h * 0.55 + 0.45, f.por), dz = sstep(h * 0.5, h * 0.5 + 0.5, f.derez);
      dx += (1 - as) * (hash(h * 11) - 0.5) * 140 + dz * (hash(h * 23) - 0.5) * 70;
      dy += (1 - as) * ((hash(h * 31) - 0.5) * 100 - 40) - dz * (40 + h * 60);
      const a = as * (1 - dz) * o;
      const size = s * u * k * (0.55 + 0.45 * as);
      const tone = acc ? sig : tones[Math.max(0, Math.min(4, Math.floor(mr * 4.6 - 0.3)))]!;
      put(ox + (cx + dx) * u, oy + (cy + dy) * u, size, 0, tone, a);
    };
    // Mirrors the bake's quadtree split; away from the face, slow noise merges busy cells or splits flat ones.
    const node = (x: number, y: number, s: number) => {
      const ma = qA(x, y, s), sa = satD;
      if (ma < 0.04) return;
      qR(x, y, s);
      const sr = satD, cx = x + s / 2, cy = y + s / 2, e = faceE(cx, cy);
      const cap = e < 1 ? 2 : e < 2.2 ? 4 : 8;
      let split = s > 1 && (s > cap || sr > TH[s]! || sa > 0.2);
      if (s > 1 && e > 1.8) {
        const v = noise(cx, cy, t * 0.12 + 3);
        if (split && s <= 4 && sa < 0.25 && v > 0.42) split = false;
        else if (!split && v < -0.42) split = true;
      }
      if (!split) { leaf(x, y, s); return; }
      const hh = s >> 1;
      node(x, y, hh); node(x + hh, y, hh); node(x, y + hh, hh); node(x + hh, y + hh, hh);
    };
    for (let ry = 0; ry < PH; ry += 8) for (let rx = 0; rx < PW; rx += 8) node(rx, ry, 8);
    // Dust: drifting squares around the figure, a few in signal red, none over the face.
    for (let i = 0; i < DUST; i++) {
      const [a, b, c, d] = dust[i]!;
      const x = ((a * (PW + 60) + Math.sin(t * (0.1 + c * 0.2) + d * 6) * 6 + t * (c - 0.5) * 2) % (PW + 60) + PW + 60) % (PW + 60) - 30;
      const y = ((b * PH * 0.9 - t * (0.6 + d * 1.6)) % (PH * 0.9) + PH * 0.9) % (PH * 0.9) - 10;
      const as = sstep(d * 0.6, d * 0.6 + 0.4, f.por);
      const al = (0.25 + 0.5 * c) * as * (1 - f.derez) * sstep(1, 1.8, faceE(x, y));
      put(ox + x * u, oy + y * u, (0.5 + c * 1.6) * u, 2, i % 20 === 0 ? sig : tones[1 + (i % 3)]!, al);
    }
  }

  /** Render: step the pens, then draw each stroke as soft dots from its head back along the polyline, plus red heads where the pointer deflected the line. */
  function render(f: Frame, u: number, ox: number, oy: number, mx: number, my: number) {
    const t = f.t, dt = lastT < 0 ? 1 / 60 : Math.min(1 / 30, Math.max(0, t - lastT));
    lastT = t;
    cfg(u);
    if (f.reduced) spS = 0;
    else {
      // Pointer: full while the lens is open (hovering or touching), fading after the last move; eased so lines bend and relax without jumps.
      if (mx > -1e3 && Math.hypot(mx - lastMx, my - lastMy) > 0.1) { moveT = t; lastMx = mx; lastMy = my; }
      const tg = mx < -1e3 ? 0 : f.lens > 0 ? 1 : Math.exp(-Math.max(0, t - moveT) / 0.8);
      spS += (tg - spS) * (1 - Math.exp(-dt / (tg > spS ? 0.15 : 0.35)));
      pX = lastMx; pY = lastMy;
      if (f.lens > 0) RC = Math.max(5, f.lens / u);
      if (dt > 0) trace(t, dt);
    }
    focus(f.reduced ? 0 : t);
    // Pass 1: per-pen alpha (inner bands reveal first with por, scroll derez fades) and total visible stroke length in px.
    const der = 1 - 0.85 * f.derez, nb = NBc + 1.5;
    let tot = 0;
    for (let i = 0; i < NP; i++) {
      const ph = P.ph[i]!, n = P.n[i]!, j = P.j[i]!, hx = P.x[i]!, hy = P.y[i]!, b = i * H;
      const a = (f.reduced || ph === 0 ? 1 : ph === 1 ? P.tm[i]! / 0.8 : 0) * Math.min(1, Math.max(0, f.por * nb - j)) * der * (0.8 - 0.04 * j) * (0.6 + 0.4 * gauss(hx, hy, cX, cY, 22));
      if (n < 2 || a < 0.01) { P.a[i] = 0; continue; }
      P.a[i] = a;
      let l = Math.hypot(hx - SX[b + n - 1]!, hy - SY[b + n - 1]!);
      for (let k = n - 1; k > 0; k--) l += Math.hypot(SX[b + k]! - SX[b + k - 1]!, SY[b + k]! - SY[b + k - 1]!);
      tot += l * u;
    }
    const st = Math.max(1.4, tot / (0.85 * MAXV)); // dot step: keeps strokes plus heads under MAXV
    for (let i = 0; i < NP; i++) {
      const a = P.a[i]!;
      if (a < 0.01) continue;
      const b = i * H, hx = P.x[i]!, hy = P.y[i]!;
      let cx = hx, cy = hy, s0 = st;
      for (let k = P.n[i]! - 1; k >= 0; k--) {
        const nx = SX[b + k]!, ny = SY[b + k]!, l = Math.hypot(nx - cx, ny - cy) * u;
        while (s0 <= l) {
          const q = s0 / l, x = cx + (nx - cx) * q, y = cy + (ny - cy) * q;
          put(ox + x * u, oy + y * u, 1.6, 1, ink, a * msk(x, y) * lz(x, y) * Math.min(1, (k + 2 - q) / 3)); // soft 2-sample taper at the stroke start
          s0 += st;
        }
        s0 -= l; cx = nx; cy = ny;
      }
      if (f.reduced || P.ph[i] !== 0) continue;
      // Head turns red only where the pointer moved the line (S - F), never at idle.
      const red = spS * sstep(0.05, 0.6, S(hx, hy) - fF(hx, hy));
      for (let c = 0; c < 3; c++) hc[c] = ink[c]! + (sig[c]! - ink[c]!) * red;
      put(ox + hx * u, oy + hy * u, 2.4, 1, hc, a * msk(hx, hy) * lz(hx, hy));
    }
  }

  return {
    get ready() { return ready; },
    setColors(t: ModeTokens) {
      const r = rgb(t.rule), mu = rgb(t.mute), i2 = rgb(token("--ink-2") || t.mute);
      ink = rgb(t.ink); sig = rgb(t.signal);
      tones = [r, r.map((v, k) => (v + mu[k]!) / 2), mu, i2, ink];
    },
    draw(f: Frame) {
      if (!ready || dead) return;
      const [bx, by, bw] = f.box, u = bw / PW, off = f.mouse[0] < -1e3;
      n = 0;
      const mx = off ? -1e4 : (f.mouse[0] - bx) / u, my = off ? -1e4 : (f.mouse[1] - by) / u;
      if (f.mode > 0.5) blocks(f, u, bx, by, mx, my);
      else render(f, u, bx, by, mx, my);
      if (!n) return;
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, V.subarray(0, n * STRIDE));
      gl.enableVertexAttribArray(aP);
      gl.enableVertexAttribArray(aC);
      gl.vertexAttribPointer(aP, 4, gl.FLOAT, false, STRIDE * 4, 0);
      gl.vertexAttribPointer(aC, 4, gl.FLOAT, false, STRIDE * 4, 16);
      gl.uniform2f(U.res, f.res[0], f.res[1]);
      gl.uniform1f(U.dpr, f.dpr);
      // Raster: the lens shows Engine's cells instead of tiles.
      gl.uniform3f(U.lens, f.mouse[0], f.mouse[1], f.mode > 0.5 ? f.lens : 0);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.disableVertexAttribArray(aC);
      gl.disableVertexAttribArray(aP);
    },
    destroy() {
      if (dead) return;
      dead = true;
      const cic = (window as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (cic) cic(idle); else clearTimeout(idle);
      gl.deleteBuffer(vb);
      gl.deleteProgram(prog);
    },
  };
}
