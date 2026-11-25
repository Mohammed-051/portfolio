// Lazy entry of the paper world. Lives in the Work chunk and imports no three: the world is created
// at idle once the hero is interactive (Work coming within a viewport is the late trigger). Without WebGL2, on a weak
// device or Save-Data, nothing loads and the DOM Work list is the whole experience (0 contexts).
import { registry } from "../rr/registry.ts";
import { store } from "../rr/store.ts";
import type { World } from "./core.ts";
import { eligible, tier } from "./eligible.ts";
import { mountPanels } from "./panels.ts";
import { loadThrough } from "../components/sections/chunks.ts";

const html = document.documentElement;
const FIRST_FRAME = 3000; // ms with Work on screen before a world that never drew gives way to the DOM layouts

/** Hook for the intro: resolves true once the world has drawn its first frame off screen, false when it never
 *  will (ineligible device, failure). The world starts only after `booted`, so never hold `booted` on this. The same
 *  moment fires `rr:world-warm` on window for code that must not import this chunk. */
let warmDone: (ok: boolean) => void = () => {};
export const worldWarm = new Promise<boolean>((r) => { warmDone = r; });

const load = () => Promise.all([import("./core.ts"), import("./work.ts"), import("./about.ts"), import("./lab.ts"), import("./sign.ts"), import("./scatter.ts"), import("./doodles.ts")]);

// The contact tiles: Contact.tsx renders four real controls in .ct__tiles; the sign station hands their screen
// quads every frame and these lay the controls over the printed tiles. Written only when a value moves by half a pixel.
let tileEls: HTMLElement[] = [];
const last: string[] = [];
const tilesNow = () => (tileEls[0]?.isConnected ? tileEls : (tileEls = [...document.querySelectorAll<HTMLElement>(".ct__tiles .ct__tile")]));
let copyEls: HTMLElement[] = [];
const copyNow = () => (copyEls[0]?.isConnected ? copyEls : (copyEls = [...document.querySelectorAll<HTMLElement>(".ct__world > :is(.ct__avail, .ct__mailw)")]));
function paintTiles(b: number[][], live: boolean) {
  const els = tilesNow();
  els[0]?.parentElement?.toggleAttribute("data-live", live);
  // A tile whose bottom is under the footer sheet's top edge is covered: inert (no focus, no clicks) and not live.
  const sheet = els.length ? document.querySelector("#contact .ftr-stage")?.getBoundingClientRect().top ?? innerHeight : 0;
  // Body text never sits on the card: at the page end the frame lifts the sticky copy into the card's band on narrow
  // screens (the sheet is shorter than the copy), so a line that comes within 16 px of the lowest tile hides until clear.
  const low = Math.max(...b.flatMap((q) => [q[1]!, q[3]!, q[5]!, q[7]!]));
  if (Number.isFinite(low)) copyNow().forEach((p) => p.toggleAttribute("data-off", p.getBoundingClientRect().top < low + 16));
  els.forEach((el, i) => {
    const q = b[i];
    if (!q) return;
    // Only a sheet on screen covers. While focus is in the tiles none is made inert: focus scrolls the card to rest and the
    // camera trails the scroll, so every tile reads covered on the way in and Tab would skip the rest of the group.
    const covered = sheet < innerHeight && Math.max(q[1]!, q[3]!, q[5]!, q[7]!) > sheet;
    const inert = covered && !el.parentElement!.contains(document.activeElement);
    if (el.inert !== inert) el.inert = inert;
    el.toggleAttribute("data-live", live && !covered);
    const k = q.map((n) => Math.round(n * 2)).join();
    if (k === last[i]) return;
    last[i] = k;
    // The box keeps the quad's top and left edge lengths; matrix3d (a square-to-quad homography) maps it onto the
    // perspective quad exactly, so the hit area and the focus ring follow the printed tile.
    const [x0, y0, x1, y1, x2, y2, x3, y3] = q as [number, number, number, number, number, number, number, number];
    const w = Math.hypot(x1 - x0, y1 - y0) || 1, h = Math.hypot(x3 - x0, y3 - y0) || 1;
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    const g = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den;
    const m = [(x1 - x0 + g * x1) / w, (y1 - y0 + g * y1) / w, 0, g / w, (x3 - x0 + hh * x3) / h, (y3 - y0 + hh * y3) / h, 0, hh / h, 0, 0, 1, 0, x0, y0, 0, 1];
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.transform = `matrix3d(${m.join(",")})`;
  });
}

/** Hover, focus and press on the tiles reach the card; focus from the keyboard brings the card to rest first. */
function holdTiles(sign: { hold(i: number, press: boolean): void }, signal: AbortSignal) {
  const idx = (t: EventTarget | null) => (t instanceof Element ? tilesNow().indexOf(t.closest<HTMLElement>(".ct__tile")!) : -1);
  let hover = -1, focus = -1, down = -1;
  const put = () => sign.hold(down >= 0 ? down : hover >= 0 ? hover : focus, down >= 0);
  const opt = { signal, passive: true } as const;
  document.addEventListener("pointerover", (e) => { if (e.pointerType === "mouse") { hover = idx(e.target); put(); } }, opt);
  document.addEventListener("pointerout", (e) => { if (e.pointerType === "mouse" && idx(e.target) >= 0) { hover = -1; put(); } }, opt);
  document.addEventListener("pointerdown", (e) => { down = idx(e.target); if (down >= 0) put(); }, opt);
  const up = () => { if (down >= 0) { down = -1; put(); } };
  document.addEventListener("pointerup", up, opt);
  document.addEventListener("pointercancel", up, opt);
  document.addEventListener("focusout", (e) => { if (idx(e.target) >= 0) { focus = -1; put(); } }, opt);
  document.addEventListener("focusin", (e) => {
    focus = idx(e.target);
    if (focus < 0) return;
    put();
    const el = e.target as HTMLElement, ct = document.getElementById("contact");
    const r = el.getBoundingClientRect(), foot = document.querySelector("#contact .ftr-stage")?.getBoundingClientRect().top ?? innerHeight;
    // world-band too: off the band the world stops drawing, so data-live and the tile boxes keep their last (stale) values.
    if (!ct || (html.classList.contains("world-band") && el.parentElement?.hasAttribute("data-live") && r.top >= 0 && r.bottom <= foot)) return;
    const y = ct.getBoundingClientRect().top + scrollY; // sign rest: Lab's bottom, Contact's top, at the viewport top (sign.ts mark)
    const s = registry.get("scroll");
    if (s) void s.scrollTo(y, { immediate: store.get().motion !== "full" }); else scrollTo({ top: y });
  }, opt);
}

type Idle = { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };

/** Mounts the world for the Work stage; returns the teardown. */
export function mountWorld(stage: HTMLElement): () => void {
  if (!eligible()) { warmDone(false); return () => {}; }
  html.classList.add("world-wait"); // boot.ts sets it first; again here so a remount keeps the layout parity
  const ac = new AbortController();
  let world: World | null = null, started = false, idle = 0, firstTimer = 0;
  let seen: IntersectionObserver | null = null;
  const unsubs: (() => void)[] = [];
  const unpanels = mountPanels(); // the sticky panel line; world-wait already gives the sticky layout

  /** Back to the DOM layouts. */
  const off = () => {
    html.classList.remove("has-world", "world-wait");
    unpanels();
    seen?.disconnect();
    clearTimeout(firstTimer);
    world?.dispose();
    world = null;
    registry.get("refresh")?.request("layout"); // the pin and the ring's --row-pitch/--wk-clip re-measure for the DOM layout
  };
  const fail = () => {
    warmDone(false);
    off();
    dispatchEvent(new CustomEvent("rr:world-off"));
  };

  async function start() {
    if (started) return;
    started = true;
    io.disconnect();
    cancelIdle();
    try {
      const [{ createWorld }, { createWorkStation }, { createAboutStation }, { createLabStation }, { createSignStation }, { withScatter }, { withDoodles }] = await load();
      if (ac.signal.aborted) return;
      const s = store.get();
      const w = (world = createWorld({ tier: tier(), mode: s.mode, reduced: s.motion === "reduced", onFail: fail }));
      const work = await createWorkStation(w.ctx, stage);
      if (ac.signal.aborted || world !== w) { work.dispose(); return; }
      // The cards layout (work.css) needs has-world before the stations measure; world-wait already gave the same layout,
      // so the swap moves nothing. ScrollTrigger re-measures the pin after it.
      html.classList.add("has-world");
      html.classList.remove("world-wait");
      registry.get("refresh")?.request("layout");
      const about = document.getElementById("about"), lab = document.getElementById("lab");
      w.add(withDoodles(w.ctx, withScatter(w.ctx, work))); // the props ride on the first station: it is always on the frame list
      if (about) w.add(createAboutStation(w.ctx, about));
      if (lab) w.add(createLabStation(w.ctx, lab));
      const sign = createSignStation(w.ctx, lab ?? document.getElementById("contact"), paintTiles);
      w.add(sign);
      holdTiles(sign, ac.signal);
      // Hand-over panels in station order: Work's is its section, About's and Lab's their .wcard, the sign has none.
      // Again once every body has mounted, in case About or Lab land after the world.
      const panels = () => w.setPanels([
        document.getElementById("work"),
        ...[about, lab].filter((s) => s).map((s) => s!.querySelector<HTMLElement>(".wcard")),
        null,
      ]);
      panels();
      void loadThrough("lab").then(() => { if (world === w) panels(); });
      unsubs.push(
        store.subscribe("mode", (n) => w.setMode(n.mode)),
        store.subscribe("motion", (n) => w.setReduced(n.motion === "reduced")),
      );
      const workEl = document.getElementById("work");
      if (workEl) {
        // Ratio, not isIntersecting: Work's top resting exactly on the viewport bottom intersects with zero area.
        seen = new IntersectionObserver((es) => {
          if (!es.some((e) => e.intersectionRatio > 0)) return;
          seen?.disconnect();
          firstTimer = window.setTimeout(() => { if (world === w && !w.frames() && !document.hidden) fail(); }, FIRST_FRAME);
        }, { threshold: [0, 0.01] });
        seen.observe(workEl);
      }
      if (import.meta.env.DEV) Object.assign(window, { __world: w, __sign: sign });
      // Warm start: the rest frame is drawn before the first scroll, so Work never arrives on an empty table.
      void w.warm().then((ok) => {
        if (world !== w) return;
        warmDone(ok);
        if (ok) dispatchEvent(new CustomEvent("rr:world-warm"));
      });
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[world] off:", err);
      fail();
    }
  }

  const win = window as Idle;
  const schedule = () => {
    idle = win.requestIdleCallback ? win.requestIdleCallback(() => void start(), { timeout: 2500 }) : window.setTimeout(() => void start(), 2500);
  };
  function cancelIdle() {
    if (win.requestIdleCallback) win.cancelIdleCallback?.(idle);
    else clearTimeout(idle);
  }
  if (store.get().booted) schedule();
  else {
    const u = store.subscribe("booted", (n) => { if (n.booted) { u(); schedule(); } });
    unsubs.push(u);
  }
  // Late trigger. Not before boot: on a one-viewport hero Work is in range at load, and creation would race the entrance.
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting) && store.get().booted) void start();
  }, { rootMargin: "100% 0px" });
  io.observe(stage);

  return () => {
    ac.abort();
    io.disconnect();
    cancelIdle();
    unsubs.forEach((u) => u());
    off();
  };
}
