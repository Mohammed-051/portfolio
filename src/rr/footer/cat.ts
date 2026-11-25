// Render-mode footer character: a sprite black cat (one atlas) living on the last line of the name, in an ink garden (garden.ts).
// One scale S (sit or stand height = a third of the cap height) sizes everything. A generator-based director runs an endless
// loop of beats (hide and peek, mischief with a letter, perching on ED / EZ, stalking the stop). Raster mode never loads this chunk.
import { base as drawBase, clip, cover as drawCover, draw as drawPlants, kick, layout, parse, rgba, sway, tint, top as topAt, type Plant } from "./garden.ts";
import type { Line, Palette, World } from "./world.ts";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Sit height (ground to ear tip) is a third of the cap height. */
const sitScale = (l: Line) => (l.base - l.top) / 3;
/** Start index of the "ED" pair and of the "EZ" pair: the only two perches. */
const perches = (ch: string) => [ch.indexOf("ED"), ch.lastIndexOf("EZ")].filter((i) => i >= 0);

// atlas: name x y w h native-facing; f01..f16 add [ax ay cx cy]: anchor and alpha centroid, fractions of the sprite box
// f01..f08 walk, f09..f12 peek over a ledge (anchor = head centre on the ledge), f13 crouch, f14 takeoff, f15 apex, f16 landing
const CAT = parse("climb 1 1 199 254 R;f01 228 257 258 191 R 0.52 1 0.51 0.6;f02 488 257 258 191 R 0.52 1 0.52 0.62;f03 748 257 258 191 R 0.52 1 0.51 0.59;f04 1008 257 258 191 R 0.52 1 0.53 0.61;f05 1 456 258 191 R 0.52 1 0.51 0.6;f06 261 456 258 191 R 0.52 1 0.51 0.6;f07 521 456 258 191 R 0.52 1 0.53 0.6;f08 781 456 258 191 R 0.52 1 0.51 0.6;f09 435 827 201 65 F 0.5 0.98 0.5 0.62;f10 238 827 195 94 F 0.5 0.99 0.5 0.6;f11 1193 649 195 116 F 0.49 0.88 0.5 0.56;f12 1 257 225 197 F 0.43 0.93 0.59 0.67;f13 551 649 204 171 R 0.39 1 0.46 0.61;f14 359 1 289 245 R 0.5 1 0.51 0.5;f15 757 649 242 150 R 0.49 1 0.55 0.51;f16 1041 456 210 189 R 0.41 1 0.48 0.67;head_nudge 1 649 305 176 R;innocent_sit 202 1 155 248 R;loaf 1001 649 190 149 R;reared_up 650 1 212 242 R;roll 308 649 241 172 R;sleep 1 827 235 112 L;stretch 864 1 231 228 L;swat 1097 1 219 198 L");
/** Anchor tweaks for the kept poses (the point of the sprite, as fractions, that sits on X, Y). Default: bottom edge, horizontal centre. */
const ANC: Record<string, [number, number]> = { climb: [.92, .85] };
const PEEK = ["f09", "f10", "f11", "f12"];

if (import.meta.env.DEV) {
  console.assert(
    perches("MOHAMMEDPARVEZ.").join() === "6,12" && perches("PARVEZ.").join() === "4" && sitScale({ top: 10, base: 100, l: [], ch: "" }) === 30 && CAT.f01?.[2] === 258 &&
      Array.from({ length: 16 }, (_, i) => CAT["f" + String(i + 1).padStart(2, "0")]).every((r) => r?.length === 9),
    "cat: perch finder, sit scale or atlas manifest is wrong",
  );
}

type Gen = Generator<void, void, void>;
/** leaf or dust (k 0 / 1); life counts down from m seconds. */
interface Pt { x: number; y: number; vx: number; vy: number; life: number; m: number; k: 0 | 1; r: number; vr: number }
const load = (s: string) => new Promise<HTMLImageElement | null>((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = s; });

/** Resolves once both atlases settled (a failed one just draws nothing); never rejects. */
export async function createCat(): Promise<World> {
  const [ci, gi] = await Promise.all([load("/world/footer-cat-atlas.webp"), load("/world/footer-garden-atlas.webp")]);
  // ---- stage (drawing units) ----
  let W = 0, H = 0, S = 30, K = S / 244, KF = S / 180, top = 0, base = 0, gnd = 0, gx0 = 0, gx1 = 0, li = 0, nl = 0, si = -1, bA = 0, ch = "";
  let l: number[] = [], LN: Line = { top: 0, base: 0, l: [], ch: "" };
  let pk: { i: number; x0: number; x1: number }[] = [];
  let bk: Plant[] = [], fr: Plant[] = [], cv: number[] = []; // cv: indices into fr of the opaque covers (the only peek spots)
  const lo = () => (zn >= 0 ? pk[zn]!.x0 + .35 * S : Math.min(gx0 + .35 * S, ...fr.map((p) => p.x)));
  const hi = () => (zn >= 0 ? pk[zn]!.x1 - .35 * S : Math.max(gx1 - .25 * S, ...fr.map((p) => p.x)));

  // ---- state ----
  let T = 0, dt = .016, X = 0, Y = 0, ft = 1, vx = 0, zn = -1, fp = -1, hid = -1, rise = 0, rv = 0, riseT = 0, dx = 0, pf = -1, ks = 1; // zn: perch, fp: perch just left, hid: cover the cat hides in, pf: peek frame
  let pi = "walk", shown = "walk", wd = 0, sq = 1, rot = 0, lf = 0, zOn = 0, lock = false, stilled = false, hurried = false;
  let tj = -1, tl = 0, tv = 0, tt = 0, tz = .55, bt = 99; // tilt: letter, angle (deg), velocity, target, damping ratio; bt = time since the last bat
  let rx: string | null = null, rt = 0, rI = -1, rU = 0, pu = 0, pv = 0, pin = false, beat = 0, sn = 0, pc = 0, np = 0;
  let main: Gen = cycle(), ovr: Gen | null = null;
  const ps: Pt[] = [];

  const clear = () => { sq = 1; rot = lf = 0; lock = false; };
  function reset() {
    clear(); ovr = null; rx = null; tj = -1; tl = tv = tt = 0; zn = fp = -1; vx = 0; hurried = stilled = false; bt = 99; zOn = 0;
    Y = gnd; rise = rv = riseT = dx = 0; pf = -1; ps.length = 0;
    hid = cv.length ? cv[sn++ % cv.length]! : -1; pi = hid >= 0 ? "peek" : "innocent_sit";
    X = hid >= 0 ? fr[hid]!.x : clamp((gx0 + gx1) / 2, gx0, gx1);
    main = cycle();
  }
  const near = (x: number) => { let k = -1, d = 1e9; for (const i of cv) { const e = Math.abs(fr[i]!.x - x); if (e < d) { d = e; k = i; } } return k; };
  const rustle = (x: number, v: number) => { for (const p of fr) if (x > p.b[0] && x < p.b[2]) kick(p, v); };
  /** Cap is 12: the oldest goes. */
  const spawn = (q: Pt) => { if (ps.length >= 12) ps.shift(); ps.push(q); };
  const leaves = (q: Plant, x: number, n: number) => {
    for (let i = 0; i < n; i++) { const lx = x + rnd(-.2, .2) * S, life = rnd(1.1, 1.7); spawn({ x: lx, y: topAt(q, lx) + rnd(0, .05) * S, vx: rnd(-.5, .5) * S, vy: rnd(-.9, -.3) * S, life, m: life, k: 0, r: rnd(0, 6), vr: rnd(-6, 6) }); }
  };
  const dust = (x: number, y: number) => {
    for (let i = 0, n = 2 + Math.floor(rnd(0, 3)); i < n; i++) spawn({ x: x + rnd(-.15, .15) * S, y: y - .03 * S, vx: (i % 2 ? 1 : -1) * rnd(.25, .7) * S, vy: rnd(-.25, -.05) * S, life: .5, m: .5, k: 1, r: 0, vr: 0 });
  };
  /** Peek frame 0..3 (f09..f12) from the rise, -1 = nothing yet. f12 needs a full look; on the way down it holds until the rise drops. */
  const peekFrame = () => (rise < .06 ? -1 : rise > .9 && (riseT > .95 || pf === 3) ? 3 : rise > .55 ? 2 : rise > .25 ? 1 : 0);
  /** The surface under the cat: the cap line on a perch (or while flying off it over its span), else the ground. */
  const surf = () => (zn >= 0 || (fp >= 0 && X > pk[fp]!.x0 && X < pk[fp]!.x1) ? top : gnd);

  // ---- director primitives ----
  function* wait(s: number): Gen { for (let t = 0; t < s; t += dt) yield; }
  function* walkTo(tx: number, sp = 1): Gen {
    pi = "walk"; tx = clamp(tx, lo(), hi());
    for (;;) {
      const d = tx - X;
      if (Math.abs(d) < .1 * S) break;
      if (Math.abs(d) > .3 * S) ft = d > 0 ? 1 : -1;
      vx += (clamp(d * 4, -2.6 * S * sp, 2.6 * S * sp) - vx) * (1 - Math.exp(-8 * dt));
      const o = X; X += vx * dt; wd += Math.abs(X - o) / (.135 * S); // one frame per stride slice: the feet stay planted
      yield;
    }
    vx = 0; wd = Math.floor(wd);
  }
  function* creep(tx: number): Gen {
    pi = "crouch"; ft = tx > X ? 1 : -1;
    while (Math.abs(tx - X) > .1 * S) { X += Math.sign(tx - X) * .55 * S * dt; sq = .97 + .03 * Math.sin(T * 9); yield; }
    sq = 1;
  }
  /** Crouch hold, then a parabolic flight: the sprite centroid rides the path mid-air (f14 takeoff, f15 apex, f16 landing). */
  function* leap(x1: number, y1: number, hh: number, dur: number): Gen {
    const x0 = X, y0 = Y; ft = x1 > x0 ? 1 : -1; lock = true;
    pi = "crouch"; sq = .9; rot = -3;
    yield* wait(rnd(.18, .3));
    rot = 0; lf = 1;
    for (let t = 0; t < dur; t += dt) {
      const u = t / dur, f = u < .35 ? "f14" : u < .75 ? "f15" : "f16", m = CAT[f]!, wg = Math.sin(Math.PI * u); // wg: 0 at the paws on the ground, 1 mid-air
      pi = f;
      X = lerp(x0, x1, u) - wg * (m[7]! - m[5]!) * m[2]! * KF * ft; Y = lerp(y0, y1, u) - 4 * hh * u * (1 - u) - wg * (m[8]! - m[6]!) * m[3]! * KF;
      sq = 1 + .08 * (1 - ease(u / .5)); // stretched along the motion at takeoff
      rot = clamp(Math.atan2(y1 - y0 - 4 * hh * (1 - 2 * u), Math.max(.3 * S, Math.abs(x1 - x0))) * 57.3, -25, 25);
      yield;
    }
    X = x1; Y = y1; rot = 0; lf = 0; sq = 1;
  }
  function* land(): Gen { // f16 squash easing back, a puff of dust
    pi = "f16"; dust(X, Y);
    for (let t = 0; t < .3; t += dt) { sq = .82 + .18 * ease(t / .3); yield; }
    sq = 1;
  }
  function* hop(f: number): Gen {
    const y0 = Y; ft = f; lock = true;
    pi = "crouch"; sq = .9; yield* wait(.12); sq = 1; pi = "f15";
    for (let t = 0; t < .45; t += dt) { const u = t / .45; Y = y0 - 4 * .4 * S * u * (1 - u); yield; }
    Y = y0; yield* land();
    lock = false;
  }
  function* swats(n: number, sp: number, f: number, kb: boolean): Gen {
    ft = f; pi = "swat"; lock = true;
    yield* wait(.4 / sp);
    for (let i = 0; i < n; i++) {
      let hit = false;
      for (let t = 0; t < .5 / sp; t += dt) {
        const u = t * sp / .5;
        rot = 5 * Math.sin(Math.PI * u);
        if (kb && !hit && u >= .4) { hit = true; bt = 0; }
        yield;
      }
      rot = 0;
      yield* wait(.3 / sp);
    }
    lock = false;
  }

  // ---- hiding ----
  function* duck(): Gen { riseT = 0; for (let t = 0; t < 1.2 && rise > .04; t += dt) yield; rise = rv = dx = 0; }
  function* emerge(): Gen { // out of the plant onto the ground, facing the middle
    if (hid < 0) return;
    yield* duck();
    X = fr[hid]!.x; hid = -1; Y = gnd; pi = "walk"; ft = X < (gx0 + gx1) / 2 ? 1 : -1;
  }
  function* hide(): Gen { // walk into the nearest cover (it hides the cat), then settle behind it; no cover: sit
    const k = near(X);
    if (k < 0) { pi = "innocent_sit"; return; }
    yield* walkTo(fr[k]!.x, 1.3);
    hid = k; pi = "peek"; X = fr[k]!.x; Y = gnd; rise = rv = riseT = 0;
  }
  function* look(s: number): Gen { // peek over the edge with an elastic overshoot, look about, duck
    if (hid < 0) return;
    riseT = 1;
    for (let t = 0; t < s; t += dt) { dx = Math.sin(T * .9) * .25 * S; yield; }
    yield* duck();
  }
  function* hideWait(s: number): Gen { // hidden; the pointer over the plant (or a hovered contact link) draws a peek
    for (let t = 0; t < s; t += dt) {
      const p = fr[hid];
      riseT = p && (rI >= 0 || (rt > 0 && pu > p.b[0] - S && pu < p.b[2] + S && pv > p.b[1] - 1.5 * S)) ? .85 : 0;
      yield;
    }
    riseT = 0;
  }

  // ---- beats ----
  /** Walk to a letter, knock it over (rear up or head-nudge), sit innocently looking away, then nudge it back upright. */
  function* mischief(): Gen {
    yield* emerge();
    let j0 = 0; // a letter within a few of the nearest one, so the walk stays short
    for (let i = 1; i < nl; i++) if (Math.abs(l[2 * i]! - X) < Math.abs(l[2 * j0]! - X)) j0 = i;
    const j = clamp(j0 + Math.floor(rnd(-3, 4)), 0, nl - 1), s = j ? (Math.random() < .5 ? 1 : -1) : -1;
    lock = true;
    yield* walkTo(s > 0 ? l[2 * j]! - .5 * S : l[2 * j + 1]! + .5 * S);
    ft = s; pi = Math.random() < .5 ? "reared_up" : "head_nudge"; tz = .55;
    yield* wait(.3);
    let hit = false;
    for (let t = 0; t < .8; t += dt) {
      sq = 1 + .04 * Math.sin(Math.PI * t / .8);
      if (!hit && t > .12) { hit = true; tj = j; tt = s * rnd(9.5, 14.5); } // the spring overshoots by about a tenth: peaks land in 10 to 16 degrees
      yield;
    }
    sq = 1; pi = "innocent_sit"; ft = -s;
    yield* wait(1.6);
    yield* walkTo(s > 0 ? l[2 * j + 1]! + .55 * S : l[2 * j]! - .55 * S);
    ft = -s; pi = "head_nudge";
    yield* wait(.35);
    tt = 0; tz = .35;
    yield* wait(.8);
    lock = false;
  }
  function* hopDown(into: boolean): Gen { // crouch, then leap down into the nearest cover (or onto the ground), which rustles hard
    lock = true;
    const k = into ? near(X) : -1, x1 = k >= 0 ? fr[k]!.x : Math.min(pk[zn]!.x1 + .9 * S, gx1 - .3 * S);
    pi = "crouch"; ft = x1 > X ? 1 : -1;
    for (let t = 0; t < .35; t += dt) { rot = 2.5 * Math.sin(T * 38); yield; }
    rot = 0; fp = zn; zn = -1;
    yield* leap(x1, gnd, .5 * S + .06 * Math.abs(x1 - X), clamp(.5 + Math.abs(x1 - X) / (8 * S), .5, 1));
    fp = -1;
    yield* land();
    if (k >= 0) { rustle(x1, ft * 90); hid = k; pi = "peek"; rise = rv = riseT = 0; } else pi = "walk";
    lock = false;
  }
  function* perch(): Gen { // climb a stem of ED or EZ, laze on the cap line, pounce down
    const p = pk[pc++ % pk.length]!, k = pk.indexOf(p), x1 = p.x0 - .02 * S;
    yield* emerge();
    yield* walkTo(x1);
    ft = 1; pi = "climb"; lock = true;
    yield* wait(.25);
    const y0 = Y, y1 = top - .02 * S;
    for (let t = 0; t < 1.3; t += dt) { X += (x1 - X) * (1 - Math.exp(-10 * dt)); Y = lerp(y0, y1, ease(t / 1.3)); yield; }
    Y = y1; zn = k;
    yield* walkTo(lerp(p.x0 + .8 * S, p.x1 - .8 * S, Math.random()));
    const r = top >= 1.35 * S ? Math.floor(rnd(0, 4)) : 2 + Math.floor(rnd(0, 2)); // not enough head room above the cap line: loaf or sleep only
    pi = ["stretch", "roll", "loaf", "sleep"][r]!; ft = Math.random() < .5 ? 1 : -1;
    yield* wait(r ? rnd(3, 5) : 2);
    yield* hopDown(true);
  }
  function* stalk(): Gen { // creep up on the stop in a crouch, pounce, swat it
    if (si < 0) return;
    yield* emerge();
    const sx = l[2 * si]!;
    yield* walkTo(sx - 3.2 * S);
    lock = true;
    yield* creep(sx - 1.7 * S);
    for (let t = 0; t < .6; t += dt) { rot = 2.5 * Math.sin(T * 38); yield; }
    rot = 0;
    yield* leap(sx - .6 * S, gnd, .4 * S, .42);
    yield* land();
    yield* swats(Math.floor(rnd(2, 4)), 1, 1, true);
  }
  function* cycle(): Gen {
    for (;;) {
      yield* look(rnd(1.2, 2));
      const b = beat++ % 3;
      if (b === 0) yield* mischief(); else if (b === 1 && pk.length && top >= .9 * S) yield* perch(); else yield* stalk();
      yield* hide();
      yield* hideWait(rnd(1.5, 3));
    }
  }
  /** The pointer is over the stop: drop everything, run to it, swat it, hide, resume the loop. */
  function* hurry(): Gen {
    tt = 0; tz = .4; // a knocked letter rights itself
    yield* emerge();
    if (zn >= 0) yield* hopDown(false);
    yield* walkTo(l[2 * si]! - .6 * S, 2.5);
    yield* swats(Math.floor(rnd(2, 4)), 2.5, 1, true);
    yield* hide();
    yield* hideWait(rnd(1.5, 3));
    hurried = false;
    yield* cycle();
  }
  function* prod(): Gen { // pointer down on the cat: hop, swat, roll in turn
    const m = np++ % 3, keep = pi, f = pu > X ? 1 : -1;
    if (m === 0) yield* hop(f);
    else if (m === 1) yield* swats(2, 1.6, f, false);
    else { lock = true; ft = f; pi = "roll"; yield* wait(1.4); lock = false; }
    pi = keep;
  }
  function* joy(u: number): Gen { const keep = pi; yield* hop(u > X ? 1 : -1); pi = keep; }
  function* perk(u: number): Gen { const keep = pi; lock = true; ft = u > X ? 1 : -1; pi = "innocent_sit"; yield* wait(1.3); lock = false; pi = keep; }

  // ---- drawing ----
  function drawCat(c: CanvasRenderingContext2D, p: Palette) {
    if (!ci || hid >= 0) return;
    let n = shown === "crouch" ? "f13" : shown, y = Y, s = sq, r = rot;
    if (n === "walk") { n = "f0" + (1 + (Math.floor(wd) % 8)); y -= Math.abs(Math.sin(wd * Math.PI / 4)) * .025 * S; } // a bob every 4 frames
    else if (n === "loaf" || n === "sleep") s *= 1 + .015 * (1 + Math.sin(T * (n === "sleep" ? 1.4 : 1.8)));
    else if (n === "roll") r += 4 * Math.sin(T * 2.6);
    const m = CAT[n];
    if (!m) return;
    const kk = m.length > 5 ? KF : K, [ax, ay] = m.length > 5 ? [m[5]!, m[6]!] : ANC[n] ?? [.5, 1], w = m[2]! * kk, h = m[3]! * kk;
    // soft shadow on the surface below: it shrinks and fades with the feet's height
    const sy = surf(), k = 1 / (1 + Math.max(0, sy - Y) / (.6 * S)), hw = Math.max(.32 * S, .36 * w) * k;
    c.save(); c.translate(X, sy); c.scale(1, .06 * S * k / hw);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, hw);
    g.addColorStop(0, rgba(p.ink, .26 * k * k)); g.addColorStop(.55, rgba(p.ink, .16 * k * k)); g.addColorStop(1, rgba(p.ink, 0));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, hw, 0, Math.PI * 2); c.fill(); c.restore();
    c.save(); c.translate(X, y); c.rotate(r * Math.PI / 180 * ft);
    c.scale((m[4]! && m[4] !== ft ? -1 : 1) * (1 + (1 - s) * .6), s);
    c.drawImage(ci, m[0]!, m[1]!, m[2]!, m[3]!, -ax * w, -ay * h, w, h);
    c.restore();
  }
  /** The hidden cat over its cover's ledge, cut at the cover's swayed top contour. */
  function drawPeek(c: CanvasRenderingContext2D, amp: number) {
    const q = fr[hid];
    if (!ci || !q || pf < 0) return;
    const m = CAT[PEEK[pf]!]!, w = m[2]! * KF, h = m[3]! * KF, px = q.x + dx;
    c.save(); clip(c, q, T, amp, .04 * S);
    c.translate(px, topAt(q, px) + .02 * S); c.rotate(1.5 * Math.sin(T * 1.5) * Math.PI / 180);
    c.drawImage(ci, m[0]!, m[1]!, m[2]!, m[3]!, -m[5]! * w, -m[6]! * h, w, h);
    c.restore();
  }
  function drawParticles(c: CanvasRenderingContext2D, p: Palette) {
    c.lineWidth = .012 * S;
    for (const q of ps) {
      const u = q.life / q.m;
      c.globalAlpha = q.k ? u * .9 : clamp(q.life / .4, 0, 1);
      if (q.k) { const rr = (.03 + .03 * (1 - u)) * S; c.beginPath(); c.arc(q.x, q.y, rr, 0, Math.PI * 2); c.fillStyle = p.paper; c.fill(); c.strokeStyle = p.ink; c.stroke(); }
      else { c.beginPath(); c.ellipse(q.x, q.y, .07 * S, .035 * S, q.r, 0, Math.PI * 2); c.fillStyle = p.paper; c.fill(); c.strokeStyle = p.ink; c.stroke(); }
    }
    c.globalAlpha = 1;
  }
  function drawZ(c: CanvasRenderingContext2D, p: Palette) { // drifting "z" marks above the head, never above the stage top
    if (shown !== "sleep" || hid >= 0 || zOn <= .02) return;
    const t = stilled ? .8 : T, lw = .09 * S;
    c.lineCap = c.lineJoin = "round";
    for (let i = 0; i < 2; i++) {
      const u = (t * .3 + i / 2) % 1, q = (.07 + .09 * u) * S, zx = X + ft * (.35 + .4 * u) * S, zy = Math.max(.05 * S + q, Y - (.55 + .6 * u) * S);
      c.globalAlpha = zOn * Math.sin(Math.PI * u);
      c.beginPath(); c.moveTo(zx - q, zy - q); c.lineTo(zx + q, zy - q); c.lineTo(zx - q, zy + q); c.lineTo(zx + q, zy + q);
      c.strokeStyle = p.paper; c.lineWidth = lw + 2; c.stroke();
      c.strokeStyle = p.ink; c.lineWidth = lw; c.stroke();
    }
    c.globalAlpha = 1;
  }

  return {
    resize(w, h, lines) {
      const L = lines[lines.length - 1]!, was = [ch, base, top, S, gx0, gx1, fr.length] as const;
      W = w; H = h; li = lines.length - 1; LN = L; l = L.l; ch = L.ch; top = L.top; base = L.base;
      // Task 06 poses: innocent_sit (244 atlas px ink) sits at S; f01..f16: the walk's ear-to-paw ink (~180 px) stands at S
      S = Math.max(4, sitScale(L)); K = S / 244; KF = S / 180;
      gx0 = l[0] ?? 0; gx1 = l[l.length - 1] ?? w;
      si = ch.endsWith(".") ? ch.length - 1 : -1; nl = ch.length - (si >= 0 ? 1 : 0);
      bA = si >= 0 ? .35 * (l[2 * si + 1]! - l[2 * si]!) : 0;
      pk = perches(ch).filter((i) => l[2 * i + 3] !== undefined).map((i) => ({ i, x0: l[2 * i]!, x1: l[2 * i + 3]! }));
      const g = layout(w, h, L); bk = g.bk; fr = g.fr; gnd = g.gy;
      cv = []; fr.forEach((p, i) => { if (p.c) cv.push(i); });
      // keep the beat when the stage barely moved, otherwise restart cleanly hidden in a plant
      if (ch !== was[0] || fr.length !== was[6] || [base - was[1], top - was[2], S - was[3], gx0 - was[4], gx1 - was[5]].some((d) => Math.abs(d) > 1.5)) reset();
    },
    step(d) {
      dt = d; T += d; bt += d;
      if (stilled) reset();
      if (tj >= 0) { // letter spring: small overshoot out, a wobble back
        const n = Math.max(1, Math.ceil(d / .016)), h = d / n;
        for (let i = 0; i < n; i++) { tv += (196 * (tt - tl) - 2 * tz * 14 * tv) * h; tl += tv * h; }
        if (!tt && Math.abs(tl) < .05 && Math.abs(tv) < 3) { tj = -1; tl = tv = 0; }
      }
      const n = Math.max(1, Math.ceil(d / .016)), h = d / n;
      for (let i = 0; i < n; i++) { rv += (81 * (riseT - rise) - 7.2 * rv) * h; rise += rv * h; }
      sway(fr, d); sway(bk, d);
      const f = hid >= 0 ? peekFrame() : -1; // every new peek frame rustles the cover and shakes a leaf or two loose
      if (hid >= 0 && f !== pf && fr[hid]) { ks = -ks; kick(fr[hid]!, ks * rnd(25, 40)); leaves(fr[hid]!, fr[hid]!.x + dx, 1 + Math.floor(rnd(0, 3))); }
      pf = f;
      for (let i = ps.length - 1; i >= 0; i--) {
        const q = ps[i]!;
        if ((q.life -= d) <= 0) { ps.splice(i, 1); continue; }
        const g = Math.exp(-(q.k ? 2.5 : 2.2) * d);
        if (!q.k) { q.vy += 1.1 * S * d; q.vx += Math.sin(T * 5 + q.r) * .4 * S * d; }
        q.vx *= g; q.vy *= g; q.x += q.vx * d; q.y += q.vy * d; q.r += q.vr * d;
        if (!q.k && q.y > gnd) { q.y = gnd; q.vx = q.vy = q.vr = 0; }
      }
      if ((rt -= d) <= 0) { rt = 0; rx = null; }
      const ok = !lock && !ovr && hid < 0 && zn < 0, react = rx && ok ? rx : null;
      if (ovr) { if (ovr.next().done) ovr = null; }
      else if (!react && main.next().done) main = cycle();
      shown = react ?? pi;
      if (react) { if (Math.abs(pu - X) > .4 * S) ft = pu > X ? 1 : -1; }
      else if (rI >= 0 && ok && pi !== "walk") ft = rU > X ? 1 : -1;
      if (!react && hid < 0 && !lf && vx) for (const p of fr) if (X > p.b[0] && X < p.b[2]) kick(p, Math.sign(vx) * Math.min(1, Math.abs(vx) / S) * 300 * d); // walking through
      zOn += ((pi === "sleep" ? 1 : 0) - zOn) * (1 - Math.exp(-4 * d));
    },
    draw(back, front, p) {
      back.clearRect(0, 0, W, H); front.clearRect(0, 0, W, H);
      back.imageSmoothingQuality = front.imageSmoothingQuality = "high";
      const g = gi && tint(gi, p), amp = stilled ? 0 : 1;
      drawBase(back, W, H, LN, gnd, bk, fr, g, p);
      back.globalAlpha = .65; drawPlants(back, bk, g, T, amp); back.globalAlpha = 1;
      drawCat(front, p); // before the cover and the front plants: they hide it
      drawCover(front, W, H, LN, gnd, p);
      if (hid >= 0 && pf >= 0) { // the peeking cat goes just behind its own cover, so the leaf fringe overlaps it
        drawPlants(front, fr.slice(0, hid), g, T, amp); drawPeek(front, amp); drawPlants(front, fr.slice(hid), g, T, amp);
      } else drawPlants(front, fr, g, T, amp);
      drawParticles(front, p);
      drawZ(front, p);
    },
    poke(k, u, v) {
      if (k === "leave") { rx = null; rt = 0; pin = false; return; }
      const ddx = u - pu, sp = pin ? Math.hypot(ddx, v - pv) : 0;
      pu = u; pv = v; pin = true; rt = .6;
      if (sp > 0) for (const p of bk.concat(fr)) if (u > p.b[0] && u < p.b[2] && v > p.b[1] && v < p.b[3]) kick(p, Math.sign(ddx || 1) * clamp(sp * 1.5, 0, 45)); // the pointer rustles what it crosses
      const ok = !lock && !ovr, d = Math.hypot(u - X, v - (Y - .45 * S));
      if (k === "down") {
        if (hid >= 0) { if (d < 2 * S) rv += 7; }
        else if (d < 1.4 * S && ok && zn < 0) ovr = prod();
        else {
          let j = -1;
          for (let i = 0; i < nl; i++) if (u > l[2 * i]! && u < l[2 * i + 1]! && v > top && v < base) j = i;
          if (j >= 0 && !(tj >= 0 && tt)) { tj = j; tt = 0; tv = (Math.random() < .5 ? -45 : 45); tz = .3; } // wobble, settles back
          if (j >= 0 && ok && zn < 0) ovr = perk(u);
        }
        return;
      }
      if (si >= 0 && !hurried && ok && u > l[2 * si]! && u < l[2 * si + 1]! && v > top && v < base + .2 * (base - top)) {
        hurried = true; clear(); main = hurry(); return;
      }
      rx = ok && hid < 0 && zn < 0 && d < 4 * S ? (d < 2 * S ? "crouch" : "innocent_sit") : null;
    },
    still() {
      reset(); stilled = true;
      const z = pk[pk.length - 1];
      hid = -1; ft = 1; zOn = 1;
      if (z && top >= .9 * S) { zn = pk.length - 1; X = (z.x0 + z.x1) / 2; Y = top - .02 * S; pi = "sleep"; }
      else { X = clamp(gx1 - 1.2 * S, gx0, gx1); Y = gnd; pi = "loaf"; }
      shown = pi;
      for (const p of bk.concat(fr)) p.a = p.v = 0;
    },
    react(i, u) { rI = i; rU = u; },
    answer(u) {
      if (ovr || lock) return;
      if (hid >= 0) rv += 8; else ovr = joy(u);
    },
    bat: () => (bt < 2 ? -bA * Math.exp(-3.2 * bt) * Math.abs(Math.sin(14 * bt)) : 0),
    tilt: () => (tj >= 0 && Math.abs(tl) > .02 ? [li, tj, tl] : null),
  };
}
