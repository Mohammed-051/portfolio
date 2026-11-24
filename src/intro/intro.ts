/** Intro: a new tab (sessionStorage "rr-entered" absent, or ?intro=1) gets a loading screen, then the view picker.
 *  Loading: real byte progress (preloader manifest, both modes) drives a hairline and a big counter; both only ever go up.
 *  At 100 % (or the 10 s cap, or Esc) the doors part along the line, the counter lands in the name, and the picker shows.
 *  The choice is the start gesture: it stores the mode, sets html[data-rr-gesture] and fires `rr:gesture` on window
 *  (detail { mode }) for the sound module; the sound key writes store.sound (persisted as "rr-sound") and fires
 *  `rr:sound` (detail { on }). Done = html.rr-intro removed, which rr/boot.ts waits for before `booted`. */
import { onProgress, progress, start, TIMEOUT } from "../motion/preloader.ts";
import { store, type Mode } from "../rr/store.ts";

const SLOW = 900, CALM = 150, MIN = 800, HOLD = 220; // ms: handoff, reduced fade, least time on the loader, hold at 100 %
const EASE = "cubic-bezier(0.76, 0, 0.24, 1)";
const html = document.documentElement;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

export async function run(): Promise<void> {
  const root = document.querySelector<HTMLElement>("div.intro");
  const app = document.getElementById("root");
  const ac = new AbortController();
  const finish = () => {
    ac.abort();
    app?.removeAttribute("inert");
    root?.remove();
    html.classList.remove("rr-intro", "rr-intro-live");
    try { history.scrollRestoration = "auto"; } catch { /* old browser */ } // a reload in this tab restores its place
    // ScrollTrigger remembered the prepaint's "manual" at init and re-applies it on every refresh: tell it to keep "auto".
    void import("gsap/ScrollTrigger").then((m) => m.ScrollTrigger.clearScrollMemory("auto")).catch(() => {});
  };
  if (!root) return finish();
  html.classList.add("rr-intro-live");
  void import("../rr/cursor.ts").then((m) => m.early()).catch(() => {}); // the red dot is on the picker (the orchestrator adopts it later)
  const calm = html.classList.contains("calm");
  let last: string | null = null;
  try { last = localStorage.getItem("rr-mode"); } catch { /* storage blocked */ }
  const stored: Mode = (last ?? html.dataset["mode"]) === "raster" ? "raster" : "render";
  if (last === "render" || last === "raster") root.dataset["last"] = last;
  const ess = start();
  const t0 = performance.now();
  const deadline = sleep(TIMEOUT - t0);
  app?.setAttribute("inert", "");

  // Loading: the line and the counter chase the real progress. Both only ever go up.
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s);
  const n = q(".intro__n"), cap = q(".intro__cap");
  const seen = new Set<object>();
  let rp = 0, xp = 0, shown = 0, rel = false, atMax: (() => void) | null = null, shownInt = 0;
  const paint = () => {
    const r = progress("render"), x = progress("raster");
    rp = Math.max(rp, r.p);
    xp = Math.max(xp, x.p);
    root.dataset["p"] = `${rp.toFixed(4)} ${xp.toFixed(4)}`;
    for (const it of [...r.items, ...x.items]) {
      if (!it.done || seen.has(it) || !cap) continue;
      seen.add(it);
      cap.textContent = `${it.failed ? "skip" : "ok  "} ${it.name}${it.size ? `  ${(it.size / 1024).toFixed(1)} KB` : ""}`;
    }
  };
  let prev = performance.now();
  const roll = (now = prev) => {
    if (ac.signal.aborted || root.dataset["ph"] !== "load") return;
    const t = rel ? 1 : (rp + xp) / 2, dt = now - prev; // time based, so a slow frame rate cannot stall the counter
    prev = now;
    shown = t - shown < 0.002 ? t : shown + (t - shown) * (1 - Math.exp(-dt / (rel ? 70 : 180)));
    root.style.setProperty("--p", shown.toFixed(4));
    const v = Math.floor(shown * 100);
    if (n && v !== shownInt) { shownInt = v; n.textContent = String(v); n.setAttribute("aria-valuenow", String(v)); }
    if (rel && shown >= 1) atMax?.();
    requestAnimationFrame(roll);
  };
  ac.signal.addEventListener("abort", onProgress(paint));
  paint();
  roll();

  // Sound key: off by default, persists.
  const snd = q<HTMLButtonElement>(".intro__snd");
  let on = store.get().sound === "on";
  const gesture = (detail: object) => { html.dataset["rrGesture"] = "1"; dispatchEvent(new CustomEvent("rr:gesture", { detail })); };
  const setSnd = () => { snd?.setAttribute("aria-pressed", String(on)); if (snd) snd.textContent = `Sound: ${on ? "On" : "Off"}`; };
  setSnd();
  snd?.addEventListener("click", () => {
    on = !on;
    setSnd();
    gesture({});
    store.set({ sound: on ? "on" : "off" }); // persists rr-sound
    dispatchEvent(new CustomEvent("rr:sound", { detail: { on } }));
  }, { signal: ac.signal });

  const keys = [...root.querySelectorAll<HTMLButtonElement>("[data-pick]")];
  let picked = false, skip: () => void = () => {}, want = false;
  const skipped = new Promise<void>((r) => { skip = r; });
  const pick = (m: Mode) => {
    if (picked) return;
    picked = true;
    gesture({ mode: m });
    try { sessionStorage.setItem("rr-entered", "1"); } catch { /* storage blocked: every load shows the intro */ }
    const pane = keys.find((k) => k.dataset["pick"] === m)?.parentElement ?? root;
    pane.setAttribute("aria-busy", "true");
    // The hand-off starts in this click's frame. The mode switch is the heavy part (every mode subscriber redraws in one task),
    // so it runs once that frame has painted, hidden under the sheet, which lifts only after it (and the hero essentials) is done.
    let set = false;
    const switched = new Promise<void>((r) => {
      const go = () => { if (set) return; set = true; store.set({ mode: m }); r(); };
      requestAnimationFrame(() => setTimeout(go));
      setTimeout(go, 250); // a hidden tab never gets a frame
    });
    void handoff(root, pane, m, calm, Promise.all([switched, Promise.race([ess[m], deadline])])).catch(() => {}).then(finish); // essentials only; the tail keeps streaming
  };
  // One pick path for the whole pane: a key (mouse or keyboard) picks its mode, anywhere else on a live pane picks the
  // side the pointer is on, the same split that makes that side dominant. The top bar and the sound key never pick.
  const side = (e: MouseEvent): Mode => (matchMedia("(max-width: 640px)").matches ? e.clientY < innerHeight / 2 : e.clientX < innerWidth / 2) ? "render" : "raster";
  const top = q(".intro__top");
  root.addEventListener("click", (e) => {
    const t = e.target as Element, k = t.closest<HTMLElement>("[data-pick]");
    if (k) return void pick(k.dataset["pick"] as Mode);
    if (t.closest(".intro__pane:not([inert])") && e.clientY > (top?.getBoundingClientRect().bottom ?? 0)) void pick(side(e));
  }, { signal: ac.signal });
  // A key keeps its own side: the dominant pane's key can sit past the centre line, and must not slide out from under the pointer.
  root.addEventListener("pointermove", (e) => { if (root.dataset["ph"] === "sel") root.dataset["side"] = (e.target as Element).closest<HTMLElement>("[data-pick]")?.dataset["pick"] ?? side(e); }, { signal: ac.signal });
  root.addEventListener("focusin", (e) => { if ((e.target as Element).matches(":focus-visible")) delete root.dataset["side"]; }, { signal: ac.signal }); // keyboard focus takes over the sizing
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (root.dataset["ph"] === "load") { want = true; skip(); } else void pick(stored); } // Esc: the stored mode, once the picker is up
    else if (root.dataset["ph"] === "sel" && /^Arrow(Left|Up|Right|Down)$/.test(e.key)) { e.preventDefault(); keys[/Left|Up/.test(e.key) ? 0 : 1]?.focus(); }
  }, { signal: ac.signal });

  // Loading ends when both essentials land, but never before MIN and never after the 10 s cap; Esc ends it at once.
  await Promise.race([Promise.all([Promise.all([ess.render, ess.raster]), sleep(MIN - (performance.now() - t0))]), deadline, skipped]);
  rel = true;
  await Promise.race([new Promise<void>((r) => { atMax = r; }), sleep(900)]);
  await Promise.race([sleep(HOLD), skipped]);
  root.style.setProperty("--p", "1");
  await reveal(root, calm).catch(() => {});
  for (const el of root.querySelectorAll(".intro__pane")) el.removeAttribute("inert");
  keys.find((k) => k.dataset["pick"] === stored)?.focus({ preventScroll: true });
  if (want) void pick(stored);
}

/** Loading to picker: the doors part along the line, the counter shrinks into the name, the panes' text rises. Reduced
 *  motion: a plain 150 ms fade. The line stays as the seam until the picker is up. */
async function reveal(root: HTMLElement, calm: boolean): Promise<void> {
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const [n, cap, ln, h, name] = [q(".intro__n"), q(".intro__cap"), q(".intro__ln"), q(".intro__h"), q(".intro__name")];
  const doors = [...root.querySelectorAll<HTMLElement>(".intro__door")];
  const gone = [n, cap, ...doors];
  root.dataset["ph"] = "sel";
  h.textContent = "Choose a view.";
  if (calm) {
    await Promise.all([...gone, ln].map((el) => el.animate({ opacity: [1, 0] }, { duration: CALM, fill: "forwards" }).finished));
  } else {
    const col = matchMedia("(max-width: 640px)").matches;
    const on = (el: HTMLElement, kf: Keyframe[] | PropertyIndexedKeyframes, o: KeyframeAnimationOptions) => el.animate(kf, { easing: EASE, fill: "both", ...o }).finished;
    const a = n.getBoundingClientRect(), b = name.getBoundingClientRect();
    const fx: Promise<unknown>[] = [
      on(n, { transform: ["none", `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.height / a.height})`], opacity: [1, 1, 0], offset: [0, 0.75, 1] }, { duration: 640 }),
      on(cap, { opacity: [0.7, 0] }, { duration: 200 }),
      on(name, { opacity: [0, 1] }, { duration: 260, delay: 420, easing: "linear" }),
      on(h, { opacity: [0, 1] }, { duration: 300, delay: 360, easing: "linear" }),
      on(ln, { opacity: [1, 1, 0], offset: [0, 0.8, 1] }, { duration: 1300 }),
      on(doors[0]!, { transform: ["none", col ? "translateY(-101%)" : "translateX(-101%)"] }, { duration: 950, delay: 260 }),
      on(doors[1]!, { transform: ["none", col ? "translateY(101%)" : "translateX(101%)"] }, { duration: 950, delay: 260 }),
    ];
    root.querySelectorAll<HTMLElement>(".intro__pane").forEach((pane, i) => {
      const raster = pane.dataset["m"] === "raster";
      [...pane.children].forEach((el, j) =>
        fx.push(on(el as HTMLElement, { opacity: [0, 1], transform: ["translateY(18px)", "none"] }, { duration: 620, delay: 560 + i * 60 + j * 80, easing: raster ? "steps(8)" : EASE })));
    });
    await Promise.all(fx);
  }
  for (const el of [...gone, ln]) el.remove();
}

/** 900 ms: the chosen pane's colour opens from its own box to the viewport, the name docks into the nav brand slot,
 *  then the sheet fades over the hero, which has the same paper. Reduced motion: a 150 ms crossfade. */
function handoff(root: HTMLElement, pane: HTMLElement, m: Mode, calm: boolean, ready: Promise<unknown>): Promise<unknown> {
  // `ready`: the mode switch and the hero essentials. The sheet lifts only after it, so the hero never shows in the old mode.
  if (calm) return ready.then(() => root.animate({ opacity: [1, 0] }, { duration: CALM, fill: "forwards" }).finished);
  const o: KeyframeAnimationOptions = { duration: SLOW, easing: m === "raster" ? "steps(22)" : "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" };
  const r = pane.getBoundingClientRect();
  const fill = document.createElement("i");
  // A transform grow (the fill is a flat colour) runs on the compositor, so it keeps moving while the mode switch holds the main thread.
  fill.style.cssText = `position:absolute;inset:0;z-index:1;transform-origin:0 0;background:${m === "raster" ? "#080807" : "#EBE7DD"}`;
  root.append(fill);
  const grow = fill.animate({ transform: [`translate(${r.left}px, ${r.top}px) scale(${r.width / innerWidth}, ${r.height / innerHeight})`, "none"] }, { ...o, duration: SLOW * 0.7 });
  for (const el of root.querySelectorAll(".intro__h, .intro__snd")) el.animate({ opacity: [1, 0] }, { duration: 240, fill: "forwards" });
  const name = root.querySelector<HTMLElement>(".intro__name");
  const b = document.querySelector(".nv__name")?.getBoundingClientRect();
  if (name) {
    const a = name.getBoundingClientRect();
    const s = b?.height ? b.height / a.height : 0.7; // the nav name is set larger than the intro's, so it can grow
    const dx = (b ? b.left : a.left) - a.left, dy = (b ? b.top + b.height / 2 : a.top + a.height / 2) - (a.top + a.height / 2);
    name.animate({ transform: ["none", `translate(${dx}px, ${dy}px) scale(${s})`] }, o);
  }
  return Promise.all([grow.finished, ready]).then(() => root.animate({ opacity: [1, 0] }, { ...o, duration: SLOW * 0.3 }).finished);
}
