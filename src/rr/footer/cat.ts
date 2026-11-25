// Render-mode footer character: a sprite black cat (one atlas) living on the last line of the name, in an ink garden (garden.ts).
// One scale S (sit height = a third of the cap height, 230 atlas px) sizes everything. A generator-based director runs an endless
// loop of beats (hide and peek, mischief with a letter, perching on ED / EZ, stalking the stop). Raster mode never loads this chunk.
import { draw as drawPlants, kick, layout, parse, sway, tint, type Plant } from "./garden.ts";
import type { Line, Palette, World } from "./world.ts";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Sit height (ground to ear tip) is a third of the cap height. */
const sitScale = (l: Line) => (l.base - l.top) / 3;
/** Start index of the "ED" pair and of the "EZ" pair: the only two perches. */
const perches = (ch: string) => [ch.indexOf("ED"), ch.lastIndexOf("EZ")].filter((i) => i >= 0);

// atlas: name x y w h native-facing
const CAT = parse("walk_a 647 257 245 192 R;walk_b 437 257 208 195 R;walk_c 222 257 213 196 R;walk_d 1 457 257 181 R;peek_up 430 640 185 110 F;crouch 810 457 222 153 L;pounce 806 1 246 211 L;climb 1 1 199 254 R;reared_up 359 1 212 242 R;innocent_sit 202 1 155 248 R;head_nudge 260 457 305 176 R;swat 1 257 219 198 L;stretch 573 1 231 228 L;loaf 1 640 190 149 R;sleep 193 640 235 112 L;roll 567 457 241 172 R");
/** Anchor tweaks (the point of the sprite, as fractions, that sits on X, Y). Default: bottom edge, horizontal centre. */
const ANC: Record<string, [number, number]> = { pounce: [.5, .6], climb: [.92, .85] };

if (import.meta.env.DEV) {
  console.assert(
    perches("MOHAMMEDPARVEZ.").join() === "6,12" && perches("PARVEZ.").join() === "4" && sitScale({ top: 10, base: 100, l: [], ch: "" }) === 30 && CAT.walk_a?.[2] === 245,
    "cat: perch finder, sit scale or atlas manifest is wrong",
  );
}

type Gen = Generator<void, void, void>;
const load = (s: string) => new Promise<HTMLImageElement | null>((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = s; });

/** Resolves once both atlases settled (a failed one just draws nothing); never rejects. */
export async function createCat(): Promise<World> {
  const [ci, gi] = await Promise.all([load("/world/footer-cat-atlas.webp"), load("/world/footer-garden-atlas.webp")]);
  // ---- stage (drawing units) ----
  let W = 0, H = 0, S = 30, K = S / 230, top = 0, base = 0, gnd = 0, gx0 = 0, gx1 = 0, li = 0, nl = 0, si = -1, bA = 0, ch = "";
  let l: number[] = [];
  let pk: { i: number; x0: number; x1: number }[] = [];
  let bk: Plant[] = [], fr: Plant[] = [];
  const lo = () => (zn >= 0 ? pk[zn]!.x0 + .35 * S : Math.min(gx0 + .35 * S, ...fr.map((p) => p.x)));
  const hi = () => (zn >= 0 ? pk[zn]!.x1 - .35 * S : Math.max(gx1 - .25 * S, ...fr.map((p) => p.x)));

  // ---- state ----
  let T = 0, dt = .016, X = 0, Y = 0, ft = 1, vx = 0, zn = -1, hid = -1, rise = 0, rv = 0, riseT = 0, dx = 0; // zn: perch, hid: plant the cat hides in
  let pi = "walk", shown = "walk", wd = 0, sq = 1, rot = 0, lf = 0, zOn = 0, lock = false, stilled = false, hurried = false;
  let tj = -1, tl = 0, tv = 0, tt = 0, tz = .55, bt = 99; // tilt: letter, angle (deg), velocity, target, damping ratio; bt = time since the last bat
  let rx: string | null = null, rt = 0, rI = -1, rU = 0, pu = 0, pv = 0, pin = false, beat = 0, sn = 0, pc = 0, np = 0;
  let main: Gen = cycle(), ovr: Gen | null = null;

  const clear = () => { sq = 1; rot = lf = 0; lock = false; };
  function reset() {
    clear(); ovr = null; rx = null; tj = -1; tl = tv = tt = 0; zn = -1; vx = 0; hurried = stilled = false; bt = 99; zOn = 0;
    Y = gnd; rise = rv = riseT = dx = 0;
    hid = fr.length ? sn++ % fr.length : -1; pi = hid >= 0 ? "peek_up" : "walk";
    if (hid >= 0) X = fr[hid]!.x;
    main = cycle();
  }
  const near = (x: number) => { let k = -1, d = 1e9; fr.forEach((p, i) => { if (Math.abs(p.x - x) < d) { d = Math.abs(p.x - x); k = i; } }); return k; };
  const rustle = (x: number, v: number) => { for (const p of fr) if (x > p.b[0] && x < p.b[2]) kick(p, v); };

  // ---- director primitives ----
  function* wait(s: number): Gen { for (let t = 0; t < s; t += dt) yield; }
  function* walkTo(tx: number, sp = 1): Gen {
    pi = "walk"; tx = clamp(tx, lo(), hi());
    for (;;) {
      const d = tx - X;
      if (Math.abs(d) < .1 * S) break;
      if (Math.abs(d) > .3 * S) ft = d > 0 ? 1 : -1;
      vx += (clamp(d * 4, -2.6 * S * sp, 2.6 * S * sp) - vx) * (1 - Math.exp(-8 * dt));
      const o = X; X += vx * dt; wd += Math.abs(X - o) / (.28 * S); // the frames follow the distance covered (about 9 fps at walk speed)
      yield;
    }
    vx = 0; wd = Math.floor(wd);
  }
  function* creep(tx: number): Gen {
    pi = "crouch"; ft = tx > X ? 1 : -1;
    while (Math.abs(tx - X) > .1 * S) { X += Math.sign(tx - X) * .55 * S * dt; sq = .97 + .03 * Math.sin(T * 9); yield; }
    sq = 1;
  }
  /** Parabolic flight (the pounce sprite, tilted along the velocity). */
  function* leap(x1: number, y1: number, hh: number, dur: number): Gen {
    const x0 = X, y0 = Y; pi = "pounce"; ft = x1 > x0 ? 1 : -1; lock = true;
    for (let t = 0; t < dur; t += dt) {
      const u = t / dur;
      X = lerp(x0, x1, u); Y = lerp(y0, y1, u) - 4 * hh * u * (1 - u);
      rot = clamp(Math.atan2(y1 - y0 - 4 * hh * (1 - 2 * u), Math.max(.3 * S, Math.abs(x1 - x0))) * 57.3, -40, 40);
      lf = Math.min(1, 4 * Math.sin(Math.PI * u));
      yield;
    }
    X = x1; Y = y1; rot = lf = 0;
  }
  function* land(): Gen { // landing squash easing back
    pi = "crouch";
    for (let t = 0; t < .35; t += dt) { sq = .85 + .15 * ease(t / .35); yield; }
    sq = 1;
  }
  function* hop(f: number): Gen {
    const y0 = Y; ft = f; pi = "innocent_sit"; lock = true;
    for (let t = 0; t < .5; t += dt) { const u = t / .5; Y = y0 - 4 * .4 * S * u * (1 - u); sq = 1.05; yield; }
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
  function* hide(): Gen { // walk into the nearest plant (it covers the cat), then settle behind it
    const k = near(X);
    if (k < 0) return;
    yield* walkTo(fr[k]!.x, 1.3);
    hid = k; pi = "peek_up"; X = fr[k]!.x; Y = gnd; rise = rv = riseT = 0;
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
  function* hopDown(into: boolean): Gen { // crouch, then pounce down into the nearest plant (or onto the ground), which rustles hard
    lock = true;
    const k = into ? near(X) : -1, x1 = k >= 0 ? fr[k]!.x : Math.min(pk[zn]!.x1 + .9 * S, gx1 - .3 * S);
    pi = "crouch"; ft = x1 > X ? 1 : -1;
    for (let t = 0; t < .35; t += dt) { rot = 2.5 * Math.sin(T * 38); yield; }
    rot = 0; zn = -1;
    yield* leap(x1, gnd, .5 * S + .06 * Math.abs(x1 - X), clamp(.5 + Math.abs(x1 - X) / (8 * S), .5, 1));
    yield* land();
    if (k >= 0) { rustle(x1, ft * 90); hid = k; pi = "peek_up"; rise = rv = riseT = 0; } else pi = "walk";
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
    const r = Math.floor(rnd(0, 4));
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
      if (b === 0) yield* mischief(); else if (b === 1 && pk.length) yield* perch(); else yield* stalk();
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
    if (!ci) return;
    let n = shown, x = X, y = Y - lf * .3 * S, s = sq, r = rot;
    if (hid >= 0) { // peek: the sprite's bottom edge sits on the plant's top edge, rising by the spring
      const q = fr[hid]!;
      if (rise < .02) return;
      n = "peek_up"; x = q.x + dx; y = q.b[1] + .12 * (q.b[3] - q.b[1]) + (1 - rise) * (CAT.peek_up![3]! * K + 2); r = 2 * Math.sin(T * 1.5);
    } else if (n === "walk") { n = "walk_" + "abcd"[Math.floor(wd) & 3]; y -= Math.abs(Math.sin(wd * Math.PI)) * .03 * S; }
    else if (n === "loaf" || n === "sleep") s *= 1 + .015 * (1 + Math.sin(T * (n === "sleep" ? 1.4 : 1.8)));
    else if (n === "roll") r += 4 * Math.sin(T * 2.6);
    const m = CAT[n]!, [ax, ay] = ANC[n] ?? [.5, 1], w = m[2]! * K, h = m[3]! * K;
    c.save(); c.translate(x, y); c.rotate(r * Math.PI / 180 * ft);
    c.scale((m[4]! && m[4] !== ft ? -1 : 1) * (1 + (1 - s) * .6), s);
    c.drawImage(ci, m[0]!, m[1]!, m[2]!, m[3]!, -ax * w, -ay * h, w, h);
    c.restore();
    if (n === "sleep" && zOn > .02) { // drifting "z" marks above the head
      const t = stilled ? .8 : T, lw = .09 * S;
      c.lineCap = c.lineJoin = "round";
      for (let i = 0; i < 2; i++) {
        const u = (t * .3 + i / 2) % 1, q = (.07 + .09 * u) * S, zx = X + ft * (.35 + .4 * u) * S, zy = Y - (.55 + .6 * u) * S;
        c.globalAlpha = zOn * Math.sin(Math.PI * u);
        c.beginPath(); c.moveTo(zx - q, zy - q); c.lineTo(zx + q, zy - q); c.lineTo(zx - q, zy + q); c.lineTo(zx + q, zy + q);
        c.strokeStyle = p.paper; c.lineWidth = lw + 2; c.stroke();
        c.strokeStyle = p.ink; c.lineWidth = lw; c.stroke();
      }
      c.globalAlpha = 1;
    }
  }

  return {
    resize(w, h, lines) {
      const L = lines[lines.length - 1]!, was = [ch, base, top, S, gx0, gx1, fr.length] as const;
      W = w; H = h; li = lines.length - 1; l = L.l; ch = L.ch; top = L.top; base = L.base;
      S = Math.max(4, sitScale(L)); K = S / 230; gnd = base - .02 * S;
      gx0 = l[0] ?? 0; gx1 = l[l.length - 1] ?? w;
      si = ch.endsWith(".") ? ch.length - 1 : -1; nl = ch.length - (si >= 0 ? 1 : 0);
      bA = si >= 0 ? .35 * (l[2 * si + 1]! - l[2 * si]!) : 0;
      pk = perches(ch).filter((i) => l[2 * i + 3] !== undefined).map((i) => ({ i, x0: l[2 * i]!, x1: l[2 * i + 3]! }));
      const g = layout(w, L); bk = g.bk; fr = g.fr;
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
      back.globalAlpha = .65; drawPlants(back, bk, g, T, amp); back.globalAlpha = 1;
      drawCat(front, p); // before the front plants: they hide it
      drawPlants(front, fr, g, T, amp);
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
      if (z) { zn = pk.length - 1; X = (z.x0 + z.x1) / 2; Y = top - .02 * S; pi = "sleep"; }
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
