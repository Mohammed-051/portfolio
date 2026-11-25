// Work drum: six paper plates from WORK on a drum standing on the table, under the one key light.
// Pin layout: the drum turns with the ring offset (createRing in Work.tsx is the single source of state) and is dragged on .wk__hit,
// the empty table right of the card. Stack layout: it sits in the .wk__world window; drag turns it, a tap selects a plate.
import { BoxGeometry, Euler, Matrix4, Mesh, Quaternion, Raycaster, Vector2, Vector3 } from "three";
import { WORK } from "../lib/content";
import { UI } from "../lib/site";
import { registry } from "../rr/registry.ts";
import { mod } from "../rr/ringMath.ts";
import { store, type Mode } from "../rr/store.ts";
import { type Ctx, type Frame, type Rest, type Station, type Target } from "./core.ts";
import { cues, lockAxis, release, spring, SPRING } from "./cues.ts";
import { drawFace, drawPeek, fontsFor } from "./faces.ts";
import { withDesk } from "./desk.ts";
import { kit } from "./kit.ts";

const N = WORK.length, TAU = Math.PI * 2, DEG = Math.PI / 180;
const PW = 1.6, PH = 1, PT = 0.022; // plate, world units (1.6:1 like the preview)
const R = PH / (2 * Math.tan(Math.PI / N)) + 0.16; // drum apothem: an open hexagon, a clear gap between plate edges
// The front plate dominates: off-front plates sink toward the axle and shrink, so the neighbours read as a receding stack.
const SINK = 0.34, SHRINK = 0.14;
const C = new Vector3(0, 0, 1.12); // axle centre above the table
const PITCH = 40 * DEG; // the front plate faces a camera 40 degrees off the vertical
// peek: lift of a hovered neighbour plate (wu). fold: f.w where the plates are fully back in their stack, and where they start to fold.
const M = { lift: 0.07, press: 0.13, peek: 0.04, tilt: 6, dragPx: 160, step: 160, fold: { end: 0.5, start: 0.95 } };
const CUE_AT = { x: 1.8, y: 2.45, turn: -8 }; // the drag cue decal on open table above-right of the stack, clear of the books (0.33, 3.51)
const X = new Vector3(1, 0, 0);
const FRONT = new Vector3(0, -Math.sin(PITCH), Math.cos(PITCH));
const UP = new Vector3().crossVectors(FRONT, X);
const TOP = new Vector3(0, -0.2, 1).normalize();
const ENTRY = new Vector3(0, -0.05, 0.999).normalize(); // high, near-vertical: the table rises into the band

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (x: number) => x * x * (3 - 2 * x);

export async function createWorkStation(ctx: Ctx, stage: HTMLElement): Promise<Station> {
  await fontsFor(ctx.mode);
  const { scene, camera } = ctx;
  const section = stage.closest("section") ?? stage;
  const K = kit(ctx);
  const { keep, pair } = K;

  // ---- Plates: bevelled paper cards, face texture on +z, a darker rim, plain paper behind.
  const box = K.card(PW, PH, PT);
  const body = K.paper(0xede9e0, 0xd9d4c8), edge = K.edge(0xede9e0, 0xb8b3a7), back = K.paper(0xd8d2c6, 0x8c877c);
  const faces = WORK.map((w) => K.face((m, px) => drawFace(w, m, px), 1280, 640));
  const peeks = WORK.map((w) => K.face((m, px) => drawPeek(w, m, px), 768, 640));
  const plates = faces.map(() => {
    const m = new Mesh(box);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  });
  // A plate lying under the top of the stack shows plain paper; a drum neighbour shows only its title (peek); else its full face.
  const bare = plates.map(() => 0); // 0 face, 1 peek, 2 plain body
  const matsFor = (i: number, mode: Mode) => [edge[mode], bare[i] === 2 ? body[mode] : (bare[i] ? peeks : faces)[i]![mode], back[mode]];
  const shadow = K.contact(PW + 0.6, PH + 0.5, 0.075, -0.075);
  // A contact shadow under every stacked plate but the bottom one, on the plate below; they leave with their plate.
  const levels = plates.map(() => K.contact(PW + 0.12, PH + 0.1, 0, 0));
  scene.add(shadow, ...levels);

  // The only red: a spine on the active plate while it is live (hover, press, drag).
  const cue = cues(ctx, K, CUE_AT);
  const spineM = pair(0xb62e19, 0xff4f3a);
  const spine = new Mesh(keep(new BoxGeometry(0.03, PH, PT * 1.6)));
  scene.add(spine);

  let mode: Mode = ctx.mode;
  function setMode(m: Mode) {
    mode = m;
    plates.forEach((p, i) => (p.material = matsFor(i, m)));
    spine.material = spineM[m];
    cue.setMode(m);
    faces.concat(peeks).forEach((f) => f.ensure(m));
    ctx.request();
  }

  // ---- State. o is the drum offset in rows, like the ring's o = s + e.
  const S = {
    manual: 0, tw: null as null | { from: number; to: number; t0: number; dur: number }, sp: null as null | { x: number; v: number; to: number },
    hu: 0.5, hv: 0.5, press: false, drag: false, a: 0, dragEnd: 0,
    ax: "" as "" | "x" | "y", v: 0, vt: 0, vm: 0, // drag axis, release speed (rows/s), last sample time and row
    hov: -1, cur: null as null | HTMLElement, gone: false, // hovered neighbour plate, the element carrying the cursor label, exit reset done
    live: plates.map(() => ({ lift: 0, tx: 0, ty: 0 })),
    fo: null as null | { from: number; to: number; t0: number; dur: number; stepped: boolean; then?: (() => void) | undefined }, // camera glide
  };
  const boardOpen = () => document.documentElement.dataset["board"] === "open";
  const tmp = { a: new Vector3(), b: new Vector3(), q: new Quaternion(), q2: new Quaternion(), m: new Matrix4(), e: new Euler(), flat: new Vector3() };
  const ray = new Raycaster(), ndc = new Vector2();

  const pin = () => store.get().layout === "pin";
  const navH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 56;
  const hitSel = () => (pin() ? ".wk__hit" : ".wk__world");
  const hitOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>(hitSel()) : null);

  /** Settles the stack on row `to`: a cut under reduced motion, the 4 step tween in Raster, a damped spring in Render (v: rows/s). */
  function tweenTo(to: number, v = S.sp?.v ?? 0) {
    S.tw = S.sp = null;
    if (ctx.reduced) S.manual = to;
    else if (ctx.stepped) S.tw = { from: S.manual, to, t0: performance.now(), dur: M.step };
    else S.sp = { x: S.manual, v: clamp(v, -SPRING.cap, SPRING.cap), to };
    ctx.request();
  }
  /** Writes the cursor label on the hit element (cursor.ts shows the nearest data-cursor; none falls back to "Drag"). */
  function label(el: HTMLElement | null, text: string) {
    if (S.cur && (S.cur !== el || !text)) delete S.cur.dataset["cursor"];
    S.cur = el && text ? el : null;
    if (S.cur && S.cur.dataset["cursor"] !== text) S.cur.dataset["cursor"] = text;
  }
  /** Glides ctx.focus.k to `to` (500 ms, eased; stepped in Raster, a jump under reduced motion), then runs `then`. */
  function glide(to: number, then?: () => void) {
    const f = ctx.focus;
    if (ctx.reduced || f.k === to) { f.k = to; S.fo = null; then?.(); ctx.request(); return; }
    S.fo = { from: f.k, to, t0: performance.now(), dur: 500, stepped: ctx.stepped, then };
    ctx.request();
  }
  function stepGlide(now: number) {
    const o = S.fo;
    if (!o) return false;
    const t = clamp((now - o.t0) / o.dur);
    ctx.focus.k = o.from + (o.to - o.from) * (o.stepped ? (t >= 1 ? 1 : Math.floor(t * 4) / 4) : smooth(t));
    if (t < 1) return true;
    S.fo = null;
    o.then?.();
    return false;
  }
  /** The plate under a viewport point, or -1. */
  function pick(x: number, y: number): number {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(plates, false)[0];
    return hit ? plates.findIndex((p) => p === hit.object) : -1;
  }

  // ---- Stack turning: a drag turns (up or left is next; touch only sideways, so a vertical swipe stays the page's scroll),
  // release settles, a tap or click selects the plate under it.
  const ac = new AbortController();
  const { signal } = ac;
  let x0 = 0, y0 = 0, m0 = 0, pid = -1;
  stage.addEventListener("pointerdown", (e) => {
    if (!hitOf(e.target) || e.button !== 0 || boardOpen()) return;
    S.press = true;
    x0 = e.clientX; y0 = e.clientY;
    if (!pin()) { pid = e.pointerId; m0 = S.vm = S.manual; S.tw = S.sp = null; S.drag = false; S.ax = ""; S.v = 0; S.vt = e.timeStamp; }
    ctx.request();
  }, { signal });
  stage.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pid) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    S.ax ||= lockAxis(dx, dy, e.pointerType === "touch");
    if (S.ax && !S.drag) { S.drag = true; stage.setPointerCapture?.(pid); }
    if (S.drag) {
      const m = m0 - (S.ax === "x" ? dx : dy) / M.dragPx, dt = (e.timeStamp - S.vt) / 1000;
      if (dt > 0.004) { S.v += ((m - S.vm) / dt - S.v) * 0.5; S.vt = e.timeStamp; S.vm = m; }
      S.manual = m;
    }
    ctx.request();
  }, { signal, passive: true });
  /** A click or tap on a plate brings it to the front: the ring in the pin layout, the shortest turn in the stack.
   *  On the plate already in front it opens the project sheet instead (Work.tsx listens for "rr:project"). */
  function select(k: number) {
    if (k < 0 || S.a < 1) return;
    if (boardOpen() || S.fo) return;
    // The camera glides a little toward the card first (scroll held), then Work.tsx opens the board.
    const open = () => {
      ctx.focus.at.copy(plates[k]!.position);
      glide(1, () => window.dispatchEvent(new CustomEvent("rr:project", { detail: k })));
    };
    if (pin()) { if (k === store.get().workFront) open(); else registry.get("ring")?.goTo(k); return; }
    const cur = Math.round(S.manual), act = mod(cur, N);
    if (k === act) { open(); return; }
    tweenTo(cur + (((k - act + N + N / 2) % N) - N / 2));
  }
  window.addEventListener("rr:project-close", () => glide(0), { signal });
  const up = (e: PointerEvent) => {
    S.press = false;
    const dragged = S.drag;
    if (e.pointerId === pid) {
      pid = -1;
      if (dragged) {
        const v = e.timeStamp - S.vt > 100 ? 0 : S.v; // held still before letting go: no flick
        tweenTo(release(m0, S.manual, v), v);
        S.dragEnd = performance.now();
      }
      S.drag = false;
    }
    // Mouse clicks here (a pin-layout ring drag moves too far to count); touch taps arrive through the director (Frame.tap), after a drag they are dropped.
    if (!dragged && e.type === "pointerup" && e.pointerType === "mouse" && Math.hypot(e.clientX - x0, e.clientY - y0) < 8) select(pick(e.clientX, e.clientY));
    ctx.request();
  };
  stage.addEventListener("pointerup", up, { signal });
  stage.addEventListener("pointercancel", up, { signal });

  // ---- The ring: one source of truth. The table hit area turns it like the grip; every pose asks for a frame.
  let unPose: (() => void) | null = null;
  let hooked: AbortController | null = null;
  function hookRing() {
    hooked?.abort();
    unPose?.();
    unPose = null;
    stage.querySelectorAll<HTMLElement>(".wk__hit, .wk__world").forEach((el) => delete el.dataset["cursor"]);
    if (!pin()) return;
    const h = (hooked = new AbortController());
    void registry.whenReady("ring", AbortSignal.any([signal, h.signal])).then((r) => {
      unPose = r.onPose(ctx.request);
      stage.querySelectorAll<HTMLElement>(".wk__hit").forEach((el) => r.bindDrag(el, M.dragPx));
      ctx.request();
    }, () => {});
  }
  const unsubs = [
    store.subscribe("layout", () => requestAnimationFrame(() => { hookRing(); ctx.request(); })),
    store.subscribe("workFront", () => ctx.request()),
    store.subscribe("pinDragging", () => ctx.request()),
  ];
  hookRing();

  // ---- Poses.
  function drumPose(k: number, o: number, lift: number, pos: Vector3, q: Quaternion) {
    const th = -(k - o) * (TAU / N);
    const r = tmp.a.copy(FRONT).multiplyScalar(Math.cos(th)).addScaledVector(UP, Math.sin(th));
    const t = tmp.b.copy(FRONT).multiplyScalar(-Math.sin(th)).addScaledVector(UP, Math.cos(th));
    pos.copy(C).addScaledVector(r, R + PT / 2 + lift);
    q.setFromRotationMatrix(tmp.m.makeBasis(X, t, r));
  }

  function stepTween(now: number) {
    if (!S.tw) return false;
    const t = clamp((now - S.tw.t0) / S.tw.dur);
    S.manual = S.tw.from + (S.tw.to - S.tw.from) * (t >= 1 ? 1 : Math.floor(t * 4) / 4);
    if (t >= 1) { S.manual = S.tw.to; S.tw = null; return false; }
    return true;
  }
  function stepSpring(dt: number) {
    const sp = S.sp;
    if (!sp) return false;
    const on = spring(sp, sp.to, dt);
    S.manual = sp.x;
    if (!on) S.sp = null;
    return on;
  }
  /** Back to project 0 once per departure, while the plates are folded flat so the turn is hidden. */
  function reset() {
    if (pin()) {
      // shortcut: goTo's reveal() calls scroll.scrollTo synchronously, which would scroll the page back; swap it for a no-op
      // around the call. A no-scroll goTo option in Work.tsx would replace this if the fast-path budget allows.
      const r = registry.get("ring"), sc = registry.get("scroll");
      if (!r || r.active() === 0) return;
      const keep = sc?.scrollTo;
      try { if (sc) sc.scrollTo = () => Promise.resolve(); r.goTo(0, { immediate: true }); } finally { if (sc && keep) sc.scrollTo = keep; }
      return;
    }
    const c = Math.round(S.manual), m = mod(c, N);
    S.manual = c - m + (m > N / 2 ? N : 0);
    S.tw = S.sp = null;
  }

  /** Approach: the plates lie as a stack on the table, then rise onto the drum as Work arrives. */
  function approach(): number {
    const vh = innerHeight, slot = pin() ? null : stage.querySelector(".wk__world");
    let a: number;
    if (slot && !matchMedia("(min-width: 900px)").matches) a = clamp((0.75 * vh - slot.getBoundingClientRect().top) / (0.45 * vh));
    else {
      // From the moment the hero has gone (Work's top at 0) to the moment the stage pins under the nav.
      const sec = section.getBoundingClientRect().top, span = stage.getBoundingClientRect().top - sec - navH();
      a = span > 0 ? clamp(-sec / span) : 1;
    }
    if (ctx.reduced) a = a >= 0.5 ? 1 : 0;
    else if (ctx.stepped) a = Math.round(a * 16) / 16;
    return a;
  }

  const rest: Rest = {
    look: C.clone(), dir: FRONT.clone().applyAxisAngle(new Vector3(0, 0, 1), -14 * DEG), dist: 9,
    half: 1.6, wide: 1.6, light: new Vector3(-0.42, 0.5, 0.76).normalize(), pool: 3.1,
  };

  function shape(t: Target, w: number) {
    if (w <= 0) return;
    const k = (1 - smooth(S.a)) * w;
    if (k) {
      t.look.lerp(tmp.a.set(0, 0, 0.1), k);
      t.dir.lerp(TOP, k).normalize();
      t.dist += (7.2 - t.dist) * k;
    }
    // Entry: p is 0 with Work's top at the viewport bottom, 1 at the nav line; the camera descends from 1.7x the rest dist.
    const H = innerHeight;
    let p = clamp((H - section.getBoundingClientRect().top) / Math.max(1, H - navH()));
    if (ctx.reduced) p = p >= 0.5 ? 1 : 0;
    else if (ctx.stepped) p = Math.round(p * 24) / 24;
    const e = 1 - p; // linear: the rig's damper is the one smoother
    if (!e) return;
    t.look.lerp(tmp.a.set(0, 0, 0.1), e);
    t.dir.lerp(ENTRY, e).normalize();
    t.dist += (rest.dist * 1.7 - t.dist) * e;
  }

  function frame(dt: number, now: number, f: Frame): boolean {
    // A page jump can skip straight to w=0, so the departure reset must also run here.
    if (f.w <= 0) { if (!S.gone && !S.press && !S.drag && !boardOpen() && !store.get().pinDragging) { S.gone = true; reset(); } label(null, ""); cue.step(now, f, 0); return false; }
    const a = (S.a = approach());
    // Leaving for the next station the plates fold back into the stack they arrived as (a pure function of scroll, af = 0 is the arrival pose).
    let wf = ctx.reduced ? (f.w >= 0.5 ? 1 : 0) : smooth(clamp((f.w - M.fold.end) / (M.fold.start - M.fold.end)));
    if (ctx.stepped) wf = Math.round(wf * 8) / 8;
    const af = a * wf;
    shadow.material.opacity = 1 - smooth(af); // the stack's contact shadow leaves with the plates
    if (f.w >= M.fold.start) S.gone = false;
    else if (f.w < M.fold.end && a >= 1 && !S.gone && !S.press && !S.drag && !boardOpen() && !store.get().pinDragging) { S.gone = true; reset(); }
    if (f.tap && f.focus && !boardOpen() && now - S.dragEnd > 120) select(pick(f.tap.x, f.tap.y));
    let busy = stepTween(now);
    if (stepSpring(dt)) busy = true;
    if (stepGlide(now)) busy = true;

    // Drum offset: the ring in the pin layout, manual turns in the stack.
    let o: number;
    if (pin()) { const r = registry.get("ring"); o = r ? r.offset() : store.get().workFront; }
    else o = S.manual;
    if (ctx.stepped) o = Math.round(o * 4) / 4;
    const act = mod(Math.round(o), N);

    // Hover: the nearest plate under the pointer names the cursor (SHOW on the front one, NEXT or PREVIOUS on a neighbour, the
    // shorter turn). The front plate also lifts and tilts toward the pointer, a neighbour lifts a little. Touch never tilts.
    const pressing = S.press || S.drag || store.get().pinDragging;
    let hoverHit = false, hk = -1;
    if (f.focus && f.over && a >= 1 && f.px >= 0 && !boardOpen()) {
      ndc.set((f.px / innerWidth) * 2 - 1, -(f.py / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(plates, false)[0];
      if (hit) hk = plates.findIndex((p) => p === hit.object);
      if (hk === act && !ctx.reduced && hit?.uv && hit.face && hit.face.normal.z > 0.5) { hoverHit = true; S.hu = hit.uv.x; S.hv = hit.uv.y; }
    }
    if (pressing) hk = -1;
    S.hov = hk === act ? -1 : hk;
    const d0 = mod(hk - act, N), hel = stage.querySelector<HTMLElement>(hitSel());
    label(hel, hk < 0 ? "" : d0 === 0 ? UI.cursor.show : d0 <= N / 2 ? "NEXT" : "PREVIOUS");
    const liveState = (pressing || hoverHit) && a >= 1;
    const kk = 1 - Math.exp(-dt * 14);
    plates.forEach((_, k) => {
      const l = S.live[k]!;
      const on = k === act && !ctx.reduced;
      const goal = {
        lift: on && pressing ? M.press : on && hoverHit ? M.lift : k === S.hov && !ctx.reduced ? M.peek : 0,
        tx: on && hoverHit ? (S.hu - 0.5) * 2 * M.tilt : 0,
        ty: on && hoverHit ? -(S.hv - 0.5) * 2 * M.tilt : 0,
      };
      for (const key of ["lift", "tx", "ty"] as const) {
        if (ctx.stepped) { l[key] = key === "lift" ? Math.round(goal[key] / 0.065) * 0.065 : Math.round(goal[key] / 2) * 2; continue; }
        const d = goal[key] - l[key];
        if (Math.abs(d) > 1e-4) { l[key] += d * kk; busy = true; } else l[key] = goal[key];
      }
    });

    plates.forEach((m, k) => {
      const l = S.live[k]!;
      const d = mod(k - act, N); // 0 is the top of the stack and the front of the drum
      let t = smooth(clamp((af - 0.07 * d) / 0.62));
      if (ctx.stepped && t > 0 && t < 1) t = Math.round(t * 8) / 8;
      const far = Math.min(1, Math.abs(mod(k - o + N / 2, N) - N / 2)); // 0 at the front, 1 from one row away
      drumPose(k, o, l.lift - SINK * far, m.position, m.quaternion);
      m.scale.setScalar(1 - SHRINK * far * t);
      // Printed only within a row of the front (the pair crossing it mid-turn); drum neighbours show only their title (peek).
      const st = t === 0 && d >= 1 ? 2 : far > 0.98 ? 1 : 0;
      if (bare[k] !== st) { bare[k] = st; m.material = matsFor(k, mode); }
      // Stack: about 0.045 wu over and 1.5 plate thicknesses up per level, each turned 1 to 4 degrees, alternating.
      tmp.flat.set(0.032 * d, -0.032 * d, PT / 2 + (N - 1 - d) * PT * 1.5);
      const turn = (d % 2 ? -1 : 1) * (1 + ((d * 37) % 4)) * DEG;
      tmp.q.setFromAxisAngle(tmp.a.set(0, 0, 1), turn);
      const lv = levels[k]!;
      lv.visible = d < N - 1 && t < 1;
      lv.position.set(tmp.flat.x, tmp.flat.y, tmp.flat.z - PT / 2 - 0.004);
      lv.rotation.z = turn;
      lv.material.opacity = 0.8 * (1 - t);
      m.position.lerpVectors(tmp.flat, m.position, t);
      m.position.z += Math.sin(Math.PI * t) * 0.45;
      m.quaternion.slerpQuaternions(tmp.q, m.quaternion, t);
      if (l.tx || l.ty) m.quaternion.multiply(tmp.q2.setFromEuler(tmp.e.set(l.ty * DEG, l.tx * DEG, 0)));
    });
    const front = plates[act]!;
    spine.visible = liveState;
    spine.position.set(-PW / 2 - 0.018, 0, 0.004).applyQuaternion(front.quaternion).add(front.position);
    spine.quaternion.copy(front.quaternion);
    if (cue.step(now, f, smooth(clamp((af - 0.5) / 0.5)))) busy = true;
    return busy;
  }

  // A pencil in front right of the table, a steel rule at the back left. The pencil sits at +0.8, -0.8, not
  // +2.2, -1.4: there it is off frame at rest at 1440, 1280 and 1024.
  return withDesk(ctx, [
    { prop: "pencil", x: 0.8, y: -0.8, turn: 28 },
    { prop: "rule", x: -2.6, y: 1.8, turn: -12 },
  ], {
    rest,
    mark: () => -1e9,
    slot: () => stage.querySelector(".wk__world"),
    shape,
    frame,
    setMode,
    dispose() {
      ac.abort();
      ctx.focus.k = 0;
      hooked?.abort();
      unPose?.();
      unsubs.forEach((u) => u());
      stage.querySelectorAll<HTMLElement>(".wk__hit, .wk__world").forEach((el) => delete el.dataset["cursor"]);
      cue.dispose();
      scene.remove(...plates, spine, shadow, ...levels);
      K.dispose();
    },
  });
}
