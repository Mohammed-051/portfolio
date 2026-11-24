import { type EngineHandle } from "./engine.ts";
import { keepPlace } from "./journey/anchor.ts";
import { loadGsap, type RefreshHandle } from "./refresh.ts";
import type { Handle } from "./registry.ts";
import { store } from "./store.ts";

export type HeroHandle = Handle;

// Tracking detents, em of extra letter-spacing, wide to rest. Bodoni and Jersey have no width axis, so the name settles by
// tracking, drawn into the GL texture only (the DOM letters never move). Raster skips them: its pixel reveal is `intro`.
const SPREAD = [0.22, 0.14, 0.09, 0.05, 0.02, 0];

/**
 * Motion tier. DOM contract: `host` is the hero section; `lines` are the wordmark line elements; descendants with
 * `data-rr-rise` rise on intro (wrap each in an overflow-clipped parent); descendants with `data-rr-parallax="<k>"`
 * move k * innerHeight over the hero's scroll (meta strip: -0.22). An optional `[data-rr-signature]` gets
 * marked drawn on destroy; rr/signature.ts plays it on every load on its own.
 */
export async function create(o: {
  signal: AbortSignal;
  host: HTMLElement;
  lines: HTMLElement[];
  refresh: RefreshHandle;          // required (registry.whenReady("refresh"))
  engine: EngineHandle | null;     // optional: null when Engine failed or is absent
}): Promise<HeroHandle> {
  const { gsap } = await loadGsap();
  const { host, lines, refresh } = o;
  const life = new AbortController();
  const signal = AbortSignal.any([o.signal, life.signal]);
  const eng = o.engine?.ok ? o.engine : null;
  const u = eng?.u;
  // With Engine the GL texture is the wordmark, so its DOM lines must not move; without it the DOM lines rise.
  const rise = [...(eng ? [] : lines), ...host.querySelectorAll<HTMLElement>("[data-rr-rise]")];
  const sig = host.querySelector<HTMLElement>("[data-rr-signature]");
  const unsub: (() => void)[] = [];
  const subs: (() => void)[] = [];
  // Tracking detents redraw the GL texture from the live line boxes: nothing in the DOM changes, so there is no layout
  // shift. Without Engine the DOM name just rises.
  const wm = lines[0]?.closest("h1");
  let wi = -1;
  const step = (i: number) => {
    if (!eng || i === wi) return;
    wi = i;
    eng.buildTexture(lines, store.get().mode === "raster" ? 0 : SPREAD[i]);
  };

  const scrub = { trigger: host, start: "top top", end: "bottom top", scrub: true };
  const ctx = gsap.context(() => {
    if (u) gsap.set(u, { intro: 0, por: 0, atm: 0 });
    if (rise.length) gsap.set(rise, { yPercent: 110 });
    step(0);
    for (const el of host.querySelectorAll<HTMLElement>("[data-rr-parallax]")) {
      const k = parseFloat(el.dataset["rrParallax"] ?? "") || 0;
      gsap.to(el, { y: () => innerHeight * k, ease: "none", scrollTrigger: { ...scrub, invalidateOnRefresh: true } });
    }
    // Hero exit: the GL wordmark de-rezzes into cells and the portrait dissolves as it scrolls away.
    if (u) gsap.to(u, { derez: 1, ease: "power1.inOut", scrollTrigger: { ...scrub, scrub: 0.6 } });
  }, host);
  refresh.request("layout");

  // Entrance, five beats, about 1.6 s, after the loader: 1 atmosphere (grid), 2 portrait (tonal emergence in Render,
  // pixel assembly in Raster), 3 name (tracking settle, or pixel cells in Raster) and supporting lines, 4 signature when the asset exists, 5 rest. The DOM text is
  // in place from the first frame; any wheel, key, tap or click jumps the timeline to its end.
  const play = () => ctx.add(() => {
    const raster = store.get().mode === "raster";
    const tl = gsap.timeline();
    if (u) {
      tl.to(u, { atm: 1, duration: 0.6, ease: "sine.out" }, 0)
        .to(u, { por: 1, duration: raster ? 1.2 : 1.6, ease: raster ? "steps(16)" : "power3.out" }, 0.12)
        .to(u, { intro: 1, duration: 1.1, ease: "steps(12)" }, 0.4);
    }
    if (rise.length) tl.to(rise, { yPercent: 0, duration: 0.9, ease: "expo.out", stagger: 0.07 }, 0.55);
    const w = { p: 0 };
    tl.to(w, {
      p: 1, duration: 0.9, ease: "power2.inOut",
      onUpdate: () => step(Math.min(SPREAD.length - 1, Math.floor(w.p * SPREAD.length))),
      onComplete: () => { step(SPREAD.length - 1); eng?.buildTexture(lines, 0); },
    }, 0.45);
    const skip = new AbortController();
    tl.eventCallback("onComplete", () => skip.abort());
    const end = () => { tl.progress(1); };
    const opts = { once: true, passive: true, signal: AbortSignal.any([signal, skip.signal]) };
    for (const t of ["wheel", "keydown", "pointerdown", "touchstart"]) addEventListener(t, end, opts);
  });
  if (store.get().booted) play();
  else unsub.push(store.subscribe("booted", (s) => { if (s.booted) { unsub.forEach((f) => f()); play(); } }));

  // Mode switch: under the wipe, the portrait re-assembles (Raster) or re-inks (Render) from a third of the way in.
  if (u) {
    subs.push(store.subscribe("mode", () => {
      if (store.get().booted) ctx.add(() => gsap.fromTo(u, { por: 0.3 }, { por: 1, duration: 0.5, ease: "steps(8)", overwrite: "auto" }));
    }));
  }

  // Nav line: once the page moves, every hero layer fades out toward the nav, at full strength a quarter of the
  // way to Work, so the name never slides under the nav links or meets the Work heading. Render ramps over 112 px;
  // Raster cuts at the 8 px aligned nav line in four alpha steps. At rest nothing is masked: the portrait reads as before.
  const html = document.documentElement;
  // A mask clips to its own box, so the measure's overflowing role and signature are masked one by one, not through it.
  const layers = () => [...host.children].flatMap((el) => (el.classList.contains("hero__measure") ? [...el.children] : [el])) as HTMLElement[];
  let fadeKey = "";
  const fade = () => {
    const r = host.getBoundingClientRect();
    if (r.bottom < 0) return;
    const nav = Math.round((parseFloat(getComputedStyle(html).getPropertyValue("--nav-h")) || 64) / 8) * 8;
    const f = Math.min(1, Math.max(0, -r.top / (0.25 * Math.max(1, r.height - nav))));
    const raster = store.get().mode === "raster";
    const a = 1 - (raster ? Math.floor(f * 4) / 4 : Math.round(f * 50) / 50);
    const key = a >= 1 ? "rest" : `${a}|${raster}|${Math.round(r.top)}`;
    if (key === fadeKey) return;
    fadeKey = key;
    for (const el of layers()) {
      if (a >= 1) { el.style.removeProperty("mask-image"); continue; }
      const y = nav - el.getBoundingClientRect().top; // the nav line in the layer's own box
      el.style.setProperty("mask-image", raster
        ? `linear-gradient(rgba(0,0,0,${a}) ${y}px, #000 0)`
        : `linear-gradient(rgba(0,0,0,${a}) ${y}px, #000 ${y + 112}px)`);
    }
  };
  addEventListener("scroll", fade, { passive: true, signal });
  addEventListener("resize", fade, { passive: true, signal });
  subs.push(store.subscribe("mode", fade), () => { for (const el of layers()) el.style.removeProperty("mask-image"); });
  fade();
  keepPlace(signal);

  // Lens: Raster inside a circle over the Render name (Render inside it in Raster mode).
  // Fine pointer follows the cursor over the hero; touch opens it under the finger; keyboard focus on the name opens
  // it on the letters and the arrow keys move it. GL only, so it never shifts layout.
  if (u && wm) {
    type Q = ReturnType<typeof gsap.quickTo>;
    const [qx, qy, ql] = ctx.add(() => [
      gsap.quickTo(u, "mx", { duration: 0.25, ease: "power3.out" }),
      gsap.quickTo(u, "my", { duration: 0.25, ease: "power3.out" }),
      gsap.quickTo(u, "lens", { duration: 0.5, ease: "steps(6)" }),
    ]) as [Q, Q, Q];
    let target = 0;
    const setLens = (v: number) => { if (v !== target) { target = v; ql(v); } };
    const size = () => (innerWidth < 900 ? 84 : 128);
    // Jumps when the lens is closed (no fly-in from the last spot), eases while it is open.
    const put = (x: number, y: number) => { if (target) { qx(x); qy(y); } else { qx(x, x); qy(y, y); } };
    if (matchMedia("(pointer: fine)").matches) {
      addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        put(e.clientX, e.clientY);
        const r = host.getBoundingClientRect();
        const over = e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
        setLens(over && !document.querySelector("dialog[open]") ? size() : 0);
      }, { passive: true, signal });
      document.documentElement.addEventListener("pointerleave", () => setLens(0), { signal });
    }
    let close: gsap.core.Tween | null = null;
    host.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      close?.kill();
      put(e.clientX, e.clientY);
      setLens(96);
    }, { signal });
    host.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse" && target) put(e.clientX, e.clientY); }, { passive: true, signal });
    const lift = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !target) return;
      close?.kill();
      close = ctx.add(() => gsap.delayedCall(0.9, () => setLens(0))) as gsap.core.Tween;
    };
    host.addEventListener("pointerup", lift, { signal });
    host.addEventListener("pointercancel", lift, { signal });

    wm.tabIndex = 0;
    let kx = 0.12, ky = 0.3; // lens centre as a fraction of the wordmark box
    const keyLens = () => {
      const r = wm.getBoundingClientRect();
      put(r.left + r.width * kx, r.top + r.height * ky);
      setLens(size());
    };
    wm.addEventListener("focus", () => { if (wm.matches(":focus-visible")) keyLens(); }, { signal });
    wm.addEventListener("blur", () => setLens(0), { signal });
    wm.addEventListener("keydown", (e) => {
      if (!wm.matches(":focus-visible")) return; // a mouse click focuses the name too: keep its arrows scrolling the page
      if (e.key === "Escape") { setLens(0); return; }
      const dx = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      const dy = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (!dx && !dy) return;
      e.preventDefault();
      kx = Math.min(0.92, Math.max(0.08, kx + dx * 0.12));
      if (dy) ky = dy > 0 ? 0.72 : 0.3;
      keyLens();
    }, { signal });
  }

  return {
    destroy() {
      if (life.signal.aborted) return;
      life.abort();
      unsub.forEach((f) => f());
      subs.forEach((f) => f());
      ctx.revert();
      wm?.removeAttribute("tabindex");
      sig?.classList.add("is-drawn");
      if (u) Object.assign(u, { intro: 1, lens: 0, derez: 0, por: 1, atm: 1 });
      eng?.buildTexture(lines, 0);
    },
  };
}
