// The paper world: one renderer on one fixed aria-hidden canvas behind the cards, one dark table, one key
// light. Stations sit along -y; scroll moves one camera between their rest poses (eased, never hijacked). Renders on
// demand only: zero frames while idle, outside the Work..Contact band, or hidden.
import {
  BasicShadowMap, CanvasTexture, HemisphereLight, Mesh, MeshStandardMaterial, NoToneMapping, PCFShadowMap, PerspectiveCamera,
  PlaneGeometry, RepeatWrapping, Scene, SpotLight, SRGBColorSpace, Vector3, WebGLRenderer,
} from "three";
import type { Mode } from "../rr/store.ts";
import type { RasterPass } from "./raster.ts";
import { ensureFaces } from "./kit.ts";

export type Tier = "desktop" | "tablet" | "phone";
export const TIERS = {
  desktop: { dpr: 2, shadow: { render: 2048, raster: 1024 }, cell: 3, damp: 5, orbit: true }, // damp 5: settles in about 0.75 s
  tablet: { dpr: 1.5, shadow: { render: 1024, raster: 512 }, cell: 3, damp: 5, orbit: false },
  phone: { dpr: 1.25, shadow: { render: 512, raster: 512 }, cell: 2, damp: 5, orbit: false },
} as const;

/** A station's rest framing: the camera stands at look + dir * dist and fits half (vertical) and wide (horizontal). */
export interface Rest { look: Vector3; dir: Vector3; dist: number; half: number; wide: number; light: Vector3; pool: number; full?: boolean }
export interface Box { x: number; y: number; w: number; h: number }
/** What a station gets each frame: w is its presence (1 at rest, 0 a whole transit away), focus is true at rest. */
export interface Frame { w: number; focus: boolean; px: number; py: number; over: boolean; tap: null | { x: number; y: number }; vw: number; vh: number }

export interface Station {
  readonly rest: Rest;
  /** Viewport y of the line whose arrival brings this station in (the first station ignores it). */
  mark(vh: number): number;
  /** The phone window this station is framed in; null frames the whole viewport. */
  slot(): Element | null;
  /** Optional tweak of the interpolated target (the Work approach). */
  shape?(t: Target, w: number): void;
  /** Poses objects; returns true while anything still moves. */
  frame(dt: number, now: number, f: Frame): boolean;
  setMode(m: Mode): void;
  dispose(): void;
}

export interface Target { look: Vector3; dir: Vector3; dist: number; half: number; wide: number; light: Vector3; pool: number }

export interface Ctx {
  scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer; tier: Tier;
  mode: Mode; reduced: boolean;
  readonly stepped: boolean; // Raster with full motion: quantised poses
  /** A click-focus offset on top of the scroll pose: k 0..1 dollies the camera in about 20 percent and aims it k/2 of the
   *  way to `at` (world point). work.ts owns k; the scroll pose underneath is untouched. */
  readonly focus: { k: number; at: Vector3 };
  request(): void;
}

/** u: stations crossed; i0, t: its whole and fraction; uq: the hand-over value; c: the camera's place along the path. */
export interface Transit { u: number; i0: number; t: number; uq: number; c: number }
export interface World {
  ctx: Ctx; add(s: Station): void; setMode(m: Mode): void; setReduced(r: boolean): void; frames(): number; dispose(): void;
  /** The DOM panels handed over by the transit, indexed like the stations; null for none. */
  setPanels(els: (HTMLElement | null)[]): void;
  /** The last tick's transit values (tests). */
  transit(): Transit;
  /** Draws one frame at the current scroll even off the band (the clip keeps it hidden), so the first pixel of Work
   *  scrolled into view is already a drawn table. Resolves true once a frame is on the canvas. */
  warm(): Promise<boolean>;
  /** DEV probe: the mode of the last frame drawn; unset in production builds. */
  drawn?: Mode;
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const DEG = Math.PI / 180;
const ORBIT = { yaw: 6, pitch: 4, back: 1200 };
const LIGHT_D = 16; // key light distance from the table point it aims at
// Transit window: a station's mark climbs from MS to ME viewport heights. MS starts the move before the station
// shows, spreading it over 0.9 vh.
const MS = 1.15, ME = 0.25, DRIFT = 0.04, STEPS = 24;
const cards = matchMedia("(min-width: 900px)"); // cards on the left, the world framed on the right (work.css)

export function createWorld(o: { tier: Tier; mode: Mode; reduced: boolean; onFail(): void }): World {
  const T = TIERS[o.tier];
  const html = document.documentElement;
  const canvas = document.createElement("canvas");
  canvas.className = "world";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.clipPath = "inset(100% 0 0 0)";
  document.body.prepend(canvas); // first in body: every later positioned section paints over it

  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (err) { canvas.remove(); throw err; }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = true;
  // shortcut: phone bakes shadows (refreshed at most every 150 ms while something moves), upgrade if phones show stale shadows.
  renderer.shadowMap.autoUpdate = o.tier !== "phone";
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.5, 80);
  camera.up.set(0, 0, 1); // z is up out of the table

  // The table: dark, paper-grained, lit only by the key. Its falloff is the vignette.
  const gc = document.createElement("canvas");
  gc.width = gc.height = 256;
  const gg = gc.getContext("2d")!;
  const img = gg.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 214 + Math.floor(Math.random() * 42) - (Math.random() < 0.04 ? 30 : 0);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  gg.putImageData(img, 0, 0);
  const grain = new CanvasTexture(gc);
  grain.wrapS = grain.wrapT = RepeatWrapping;
  grain.repeat.set(30, 42);
  grain.colorSpace = SRGBColorSpace;
  const groundM = new MeshStandardMaterial({ color: 0x3b3731, roughness: 1, metalness: 0, map: grain });
  const ground = new Mesh(new PlaneGeometry(80, 112), groundM);
  ground.position.set(0, -16, 0);
  ground.receiveShadow = true;

  // One light rig: a warm spot key (its penumbra is the vignette), a faint hemisphere fill in Render only.
  const hemi = new HemisphereLight(0xf2eee6, 0x24221e, 0.35);
  const key = new SpotLight(0xfff1de, 2.6, 0, 0.2, 0.85, 0);
  key.castShadow = true;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 40;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(ground, hemi, key, key.target);

  const stations: Station[] = [];
  let pass: RasterPass | null = null, passP: Promise<void> | undefined;
  const loadPass = () => (passP ??= import("./raster.ts").then(({ createRasterPass }) => {
    if (dead) return;
    pass = createRasterPass(renderer);
    pass.setSize(W, H, T.cell);
    redraw();
  }, o.onFail));
  /** Once the first frame is up, build the Raster pass and both modes' faces at idle, so a switch never waits. */
  const preload = () => { if (!dead) { void loadPass(); ensureFaces("raster"); } };
  let raf = 0, last = 0, frames = 0, on = false, inBand = false, lost = false, dead = false, cleared = true;
  let W = 1, H = 1, navH = 56, bake = 0, moved = false, jump = false, lastC = NaN, warmed = false;
  let lostTimer = 0;
  const ptr = { x: -1, y: -1, over: false, t: 0, tap: null as null | { x: number; y: number } };
  const orbit = { yaw: 0, pitch: 0 };

  const ctx: Ctx = {
    scene, camera, renderer, tier: o.tier, mode: o.mode, reduced: o.reduced,
    get stepped() { return ctx.mode === "raster" && !ctx.reduced; },
    focus: { k: 0, at: new Vector3() },
    request,
  };
  const tgt: Target = { look: new Vector3(), dir: new Vector3(0, 0, 1), dist: 8, half: 1, wide: 1, light: new Vector3(0, 0, 1), pool: 3 };
  const cur = { pos: new Vector3(), look: new Vector3(), fov: 30, pool: 3, light: new Vector3(0, 0, 1), init: false };
  const v = { pos: new Vector3(), a: new Vector3(), b: new Vector3(), box: { x: 0, y: 0, w: 1, h: 1 } as Box };
  const fr: Frame = { w: 0, focus: false, px: -1, py: -1, over: false, tap: null, vw: 1, vh: 1 };
  const tr: Transit = { u: 0, i0: 0, t: 0, uq: 0, c: 0 };
  let panels: (HTMLElement | null)[] = [];
  let panelW: string[] = [];

  /** Hand-over: --w is the panel's presence, --wd -1 while it leaves; data-hand under 1, "off" once invisible (work.css).
   *  Text leaves in the first quarter of a move and returns in the last: work.css fades over --w 0.6..1, so the
   *  quarter maps onto that range. */
  function handOver(uq: number) {
    panels.forEach((el, j) => {
      if (!el) return;
      const p = 1 - Math.min(1, Math.abs(uq - j));
      const w = p >= 1 ? 1 : 0.6 + 0.4 * clamp((p - 0.75) / 0.25);
      const key = w.toFixed(3) + (j < uq ? "-" : "+");
      if (key === panelW[j]) return;
      panelW[j] = key;
      el.style.setProperty("--w", w.toFixed(3));
      el.style.setProperty("--wd", j < uq ? "-1" : "1");
      if (w >= 1) el.removeAttribute("data-hand");
      else el.setAttribute("data-hand", w <= 0.6 ? "off" : "");
    });
  }
  function clearPanels() {
    for (const el of panels) { el?.removeAttribute("data-hand"); el?.style.removeProperty("--w"); el?.style.removeProperty("--wd"); }
    panelW = [];
  }

  function request() { if (on && !raf && !dead) raf = requestAnimationFrame(tick); }
  /** request() on the band; off it, once warm, one hidden frame now (a resize or a mode switch emptied the canvas). */
  function redraw() {
    if (on || !warmed) return request();
    if (dead || lost || !stations.length) return;
    // The hidden frame cuts to the pose at this scroll; one damped tick left it near the pose it left by (an instant
    // jump out of the band, the Home key), so re-entry swooped from there.
    on = true; cur.init = false; tick(performance.now()); on = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    last = 0;
  }

  /** The band's foot: the footer sheet's top, so the sheet slides over a still table; Contact's top, then the
   *  viewport foot, until those mount. */
  const foot = () => (document.querySelector("#contact .ftr-stage") ?? document.getElementById("contact"))?.getBoundingClientRect().top ?? H;

  /** The world shows only between the top of Work and the footer sheet: the hero and the footer stay untouched. */
  function band() {
    const a = document.getElementById("work");
    if (!a) return;
    const top = a.getBoundingClientRect().top, bot = foot();
    const t = clamp(top, 0, H), bb = clamp(H - bot, 0, H);
    canvas.style.clipPath = t + bb >= H ? "inset(100% 0 0 0)" : `inset(${t}px 0 ${bb}px 0)`;
    html.classList.toggle("world-band", top <= navH + 1 && bot > navH / 2); // the header goes dark over the table (work.css)
    const was = inBand;
    inBand = top < H && bot > 0;
    if (was !== inBand) update();
  }

  let cardR = 0;
  function slotBox(s: Station, out: Box) {
    const el = s.rest.full ? null : cards.matches ? undefined : s.slot();
    if (el === undefined) Object.assign(out, { x: cardR, y: navH, w: W - cardR, h: H - navH });
    else if (!el) Object.assign(out, { x: 0, y: navH, w: W, h: H - navH });
    else { const r = el.getBoundingClientRect(); Object.assign(out, { x: r.left, y: r.top, w: r.width, h: r.height }); }
  }

  function tick(now: number) {
    raf = 0;
    if (!on || !stations.length) { last = 0; return; }
    const dt = last ? Math.min(0.1, Math.max(0, now - last) / 1000) /* exp easing is stable at any dt; a 50 ms cap stretched the settle on slow GPUs past 3 s */ : 1 / 60;
    let busy = false;

    // Where along the table: u counts the stations whose mark has crossed MS..ME, the fraction is the transit.
    // The camera reads c, linear in scroll with no easing of its own (the rig's damper is the one smoother): each transit
    // covers all but DRIFT of the way, and each rest zone drifts DRIFT either side of its station, so the camera never
    // parks while the page scrolls. The sign has no drift: its rest is the page end.
    const vh = H, N = stations.length, mk = (i: number) => stations[i]!.mark(vh);
    let u = 0;
    for (let i = 1; i < N; i++) u += clamp((MS * vh - mk(i)) / ((MS - ME) * vh));
    const i0 = Math.min(N - 1, Math.floor(u));
    let t = u - i0, c: number;
    if (t > 0) { const a = i0 + DRIFT, b = i0 + 1 === N - 1 ? N - 1 : i0 + 1 - DRIFT; c = a + (b - a) * t; }
    else if (i0 === N - 1) c = i0;
    else {
      // Rest zone i0: from its own arrival (Work: its top at the nav line) to the next station's window.
      const done = i0 ? ME * vh - mk(i0) : navH - (document.getElementById("work")?.getBoundingClientRect().top ?? navH);
      const z = clamp(done / Math.max(1, done + mk(i0 + 1) - MS * vh));
      c = i0 ? i0 - DRIFT + 2 * DRIFT * z : DRIFT * z;
    }
    if (ctx.reduced) { t = t < 0.5 ? 0 : 1; c = i0 + t; } // reduced motion: a cut at mid-transit
    else if (ctx.stepped) {
      // Raster: the same path, stepped. The rest drift (0.08 wide) steps 8 times finer, or it parked about 2800 px.
      const q = t > 0 ? STEPS : STEPS * 8;
      t = Math.round(t * STEPS) / STEPS; c = Math.round(c * q) / q;
    }
    const ic = Math.min(N - 1, Math.floor(c)), e = c - ic;
    const A = stations[ic]!.rest, B = stations[Math.min(N - 1, ic + 1)]!.rest;
    tgt.look.lerpVectors(A.look, B.look, e);
    tgt.dir.lerpVectors(A.dir, B.dir, e).normalize();
    tgt.dist = (A.dist + (B.dist - A.dist) * e) * (1 + 0.28 * Math.sin(Math.PI * e)); // pull back mid-transit: the table travels
    tgt.half = A.half + (B.half - A.half) * e;
    tgt.wide = A.wide + (B.wide - A.wide) * e;
    tgt.light.lerpVectors(A.light, B.light, e).normalize();
    tgt.pool = A.pool + (B.pool - A.pool) * e;
    const uq = i0 + t;
    tr.u = u; tr.i0 = i0; tr.t = t; tr.uq = uq; tr.c = c;
    stations.forEach((s, j) => s.shape?.(tgt, 1 - Math.min(1, Math.abs(c - j))));
    const fk = ctx.focus.k;
    if (fk) { tgt.look.lerp(ctx.focus.at, 0.5 * fk); const z = 1 - 0.2 * fk; tgt.dist *= z; tgt.half *= z; tgt.wide *= z; } // half and wide shrink with dist, so the dolly zooms

    // The framed box: cards layout frames the right of the card column; phones frame the next station's window.
    const sB = e > 0 ? stations[Math.min(N - 1, ic + 1)]! : stations[ic]!;
    if (cards.matches) {
      slotBox(stations[ic]!, v.box);
      const bx = { ...v.box };
      slotBox(sB, v.box);
      v.box.x = bx.x + (v.box.x - bx.x) * e; v.box.w = bx.w + (v.box.w - bx.w) * e;
    } else slotBox(sB, v.box);

    // Pointer orbit at rest (desktop), and the light swings half as far: the shadows answer the pointer too.
    const focus = Math.abs(uq - Math.round(uq)) < 1e-3;
    // No orbit at a full-frame station (the sign): its table holds still under the overlay controls and the footer sheet.
    const live = T.orbit && focus && !stations[Math.min(stations.length - 1, Math.round(uq))]!.rest.full && !ctx.reduced && ptr.over && now - ptr.t < ORBIT.back;
    const gy = live ? -((ptr.x / W) * 2 - 1) * ORBIT.yaw : 0, gp = live ? ((ptr.y / H) * 2 - 1) * ORBIT.pitch : 0;
    if (ctx.stepped) { orbit.yaw = Math.round(gy); orbit.pitch = Math.round(gp); }
    else {
      const k = 1 - Math.exp(-dt * 3);
      orbit.yaw += (gy - orbit.yaw) * k; orbit.pitch += (gp - orbit.pitch) * k;
      if (Math.abs(gy - orbit.yaw) + Math.abs(gp - orbit.pitch) > 0.02) busy = true;
      else { orbit.yaw = gy; orbit.pitch = gp; }
    }
    if (live) busy = true; // keeps the return-to-rest timer honest
    const off = v.a.copy(tgt.dir).multiplyScalar(tgt.dist);
    if (orbit.yaw || orbit.pitch) {
      off.applyAxisAngle(v.b.set(0, 0, 1), orbit.yaw * DEG);
      off.applyAxisAngle(v.b.crossVectors(off, camera.up).normalize(), orbit.pitch * DEG);
    }
    v.pos.copy(tgt.look).add(off);
    const aspect = Math.max(0.2, v.box.w / Math.max(1, v.box.h));
    const fov = (2 * Math.atan(Math.max(tgt.half, tgt.wide / aspect) / tgt.dist)) / DEG;

    // Rig: eased toward the target (damping per tier), settles at 2 mm so the loop stops. Back on the band it eases on from
    // the warm or last frame; only a jump of more than half a station (a deep link) cuts.
    if (jump) { jump = false; if (Math.abs(c - lastC) > 0.5) cur.init = false; }
    lastC = c;
    if (!cur.init || ctx.reduced || ctx.stepped) {
      cur.pos.copy(v.pos); cur.look.copy(tgt.look); cur.fov = fov; cur.pool = tgt.pool; cur.light.copy(tgt.light); cur.init = true;
      if (ctx.stepped) { const q = 1 / 32; cur.pos.set(Math.round(cur.pos.x / q) * q, Math.round(cur.pos.y / q) * q, Math.round(cur.pos.z / q) * q); }
    } else {
      const k = 1 - Math.exp(-dt * T.damp);
      cur.pos.lerp(v.pos, k);
      cur.look.lerp(tgt.look, k);
      cur.fov += (fov - cur.fov) * k;
      cur.pool += (tgt.pool - cur.pool) * k;
      cur.light.lerp(tgt.light, k).normalize();
      if (cur.pos.distanceToSquared(v.pos) > 4e-6 || cur.look.distanceToSquared(tgt.look) > 4e-6 || Math.abs(fov - cur.fov) > 0.01) busy = true;
      else { cur.pos.copy(v.pos); cur.look.copy(tgt.look); cur.fov = fov; cur.pool = tgt.pool; cur.light.copy(tgt.light); }
    }

    // Stations pose their objects (after the camera, so hover rays use this frame's view).
    const b = v.box;
    camera.fov = cur.fov;
    camera.aspect = Math.max(1, b.w) / Math.max(1, b.h);
    camera.setViewOffset(Math.max(1, b.w), Math.max(1, b.h), -b.x, -b.y, W, H);
    camera.updateProjectionMatrix();
    camera.position.copy(cur.pos);
    camera.lookAt(cur.look);
    camera.updateMatrixWorld();
    fr.px = ptr.x; fr.py = ptr.y; fr.over = ptr.over; fr.tap = ptr.tap; fr.vw = W; fr.vh = H;
    ptr.tap = null;
    stations.forEach((s, j) => {
      fr.w = 1 - Math.min(1, Math.abs(uq - j));
      fr.focus = focus && Math.round(uq) === j;
      if (s.frame(dt, now, fr)) busy = true;
    });
    handOver(uq); // uq is already quantised: Raster gets the camera's 16 steps, reduced motion the mid-transit cut

    const lightDir = v.a.copy(cur.light).applyAxisAngle(v.b.set(0, 0, 1), orbit.yaw * 0.5 * DEG);
    key.target.position.set(cur.look.x, cur.look.y, 0);
    key.position.copy(key.target.position).addScaledVector(lightDir, LIGHT_D);
    key.angle = Math.atan(cur.pool / LIGHT_D) * 1.25;
    if (!renderer.shadowMap.autoUpdate && (busy || moved) && now - bake > 150) { renderer.shadowMap.needsUpdate = true; bake = now; moved = busy; }

    if (ctx.mode === "raster" && !pass) {
      // Switched before the preload landed: show the bare table (Raster's own colour), never the last Render frame.
      // loadPass() requests the first Raster frame when the pass is built.
      if (!cleared) { renderer.setRenderTarget(null); renderer.clear(); cleared = true; }
      last = 0;
      return;
    }
    if (pass && ctx.mode === "raster") pass.render(scene, camera);
    else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
    if (import.meta.env.DEV) world.drawn = ctx.mode;
    cleared = false;
    if (!frames++) {
      if ("requestIdleCallback" in window) requestIdleCallback(preload, { timeout: 2000 });
      else setTimeout(preload, 500);
    }
    last = busy ? now : 0;
    if (busy) request();
  }

  function size() {
    W = Math.max(1, canvas.clientWidth);
    H = Math.max(1, canvas.clientHeight);
    navH = parseFloat(getComputedStyle(html).getPropertyValue("--nav-h")) || 56;
    const work = document.getElementById("work");
    cardR = cards.matches && work ? Math.min(W * 0.6, work.getBoundingClientRect().right + 24) : 0;
    const raster = ctx.mode === "raster";
    renderer.setPixelRatio(raster ? 1 : Math.min(devicePixelRatio || 1, T.dpr));
    renderer.setSize(W, H, false);
    pass?.setSize(W, H, T.cell);
    renderer.shadowMap.needsUpdate = true;
    band();
    redraw();
  }

  function applyMode() {
    const raster = ctx.mode === "raster";
    renderer.shadowMap.type = raster ? BasicShadowMap : PCFShadowMap;
    key.shadow.radius = raster ? 1 : 6;
    key.shadow.blurSamples = 12;
    key.shadow.intensity = raster ? 0.85 : 0.8;
    const s = T.shadow[ctx.mode];
    key.shadow.mapSize.set(s, s);
    key.shadow.map?.dispose();
    key.shadow.map = null;
    hemi.intensity = raster ? 0 : 0.35;
    key.intensity = raster ? 3.4 : 2.6;
    key.penumbra = raster ? 0.6 : 0.85;
    groundM.color.set(raster ? 0x2c2a26 : 0x3b3731);
    for (const st of stations) st.setMode(ctx.mode);
    if (raster) void loadPass();
    renderer.shadowMap.needsUpdate = true;
    size();
  }

  function update() {
    const want = stations.length > 0 && inBand && !document.hidden && !lost && !dead;
    if (want === on) return;
    on = want;
    canvas.classList.toggle("on", on);
    if (on) { jump = true; size(); request(); }
    else {
      if (raf) { cancelAnimationFrame(raf); raf = 0; last = 0; }
      // Warm: the hidden canvas keeps a frame at the scroll it left by, so coming back shows a drawn table at once.
      if (warmed) redraw();
      else if (!cleared && !lost) { renderer.setRenderTarget(null); renderer.clear(); cleared = true; } // no stale frame under the hero
    }
  }

  const ac = new AbortController();
  const { signal } = ac;
  const onScroll = () => { band(); request(); };
  addEventListener("scroll", onScroll, { passive: true, signal });
  addEventListener("resize", size, { signal });
  cards.addEventListener("change", size, { signal });
  // The pointer: read only, never prevented. Over the world means not over a card, the nav or a control.
  const overWorld = (t: EventTarget | null) => t instanceof Element && (!!t.closest("[data-world-hit]") || !t.closest("section > *, header, nav, footer, button, a, [role=dialog], .rail, .hud-r"));
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.over = overWorld(e.target); ptr.t = performance.now();
    request();
  }, { passive: true, signal });
  addEventListener("pointerup", (e) => {
    if (e.pointerType === "mouse" || !overWorld(e.target)) return;
    ptr.tap = { x: e.clientX, y: e.clientY }; // touch: tap selects, no tilt
    request();
  }, { passive: true, signal });
  document.addEventListener("visibilitychange", update, { signal });
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
    update();
    // Not restored: the DOM stays the content. 3.5 s, not 4: a slow forced loss (350-800 ms) still fails within the 4 s budget.
    lostTimer = window.setTimeout(o.onFail, 3500);
  }, { signal });
  canvas.addEventListener("webglcontextrestored", () => { clearTimeout(lostTimer); lost = false; applyMode(); update(); }, { signal });

  applyMode();

  const world: World = {
    ctx,
    add(s) { stations.push(s); s.setMode(ctx.mode); size(); update(); },
    setMode(m) {
      if (m === ctx.mode) return;
      ctx.mode = m; cur.init = false; applyMode();
      // Draw now, in the task that set data-mode (store.write), so no painted frame pairs the new DOM with the old world.
      if (raf) { cancelAnimationFrame(raf); tick(performance.now()); }
    },
    setReduced(r) { ctx.reduced = r; request(); },
    frames: () => frames,
    setPanels(els) { clearPanels(); panels = els; request(); },
    transit: () => ({ ...tr }),
    warm() {
      return (ctx.mode === "raster" ? loadPass() : Promise.resolve()).then(() => new Promise<boolean>((r) => {
        warmed = true;
        redraw();
        requestAnimationFrame(() => r(!dead && frames > 0));
      }));
    },
    dispose() {
      if (dead) return;
      dead = true;
      on = false;
      cancelAnimationFrame(raf);
      clearTimeout(lostTimer);
      ac.abort();
      html.classList.remove("world-band");
      clearPanels();
      stations.forEach((s) => s.dispose());
      pass?.dispose();
      key.shadow.map?.dispose();
      ground.geometry.dispose();
      groundM.dispose();
      grain.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
  return world;
}
