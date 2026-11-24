import { eligible } from "../world/eligible.ts";
import type { Handle, Registry } from "./registry.ts";
import { store } from "./store.ts";

export type BootHandle = Handle;

const FONT_RACE = 1400; // ms
const DEADLINE = 2600;  // ms from navigation start

/** Boot core: font race and Engine readiness (or the deadline), then the intro's end, then `booted`, which starts the hero
 *  entrance and the signature. Never awaits Plates or Bench. */
export async function create(o: { signal: AbortSignal; registry: Registry }): Promise<BootHandle> {
  const life = new AbortController();
  const signal = AbortSignal.any([o.signal, life.signal]);
  const html = document.documentElement;
  if (eligible() && !html.classList.contains("has-world")) html.classList.add("world-wait"); // world layouts from first paint, so the world's arrival never moves the page
  const timers = new Set<number>();
  const later = (ms: number) => new Promise<void>((r) => { const t = window.setTimeout(() => { timers.delete(t); r(); }, Math.max(0, ms)); timers.add(t); });
  const done = () => {
    if (signal.aborted || store.get().booted) return;
    html.classList.add("booted");
    // The cover from index.html (html.veil, every load but the intro path) lifts with a short fade, then goes.
    if (html.classList.contains("veil")) { html.classList.add("veil-off"); setTimeout(() => html.classList.remove("veil", "veil-off"), 300); }
    store.set({ booted: true });
  };
  const handle: BootHandle = {
    destroy() {
      if (life.signal.aborted) return;
      life.abort();
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };

  // The intro (src/intro/intro.ts) is done when html.rr-intro goes (main.tsx also drops it if the chunk fails to load).
  const introGone = new Promise<void>((r) => {
    const ok = () => !html.classList.contains("rr-intro");
    if (ok()) return r();
    const mo = new MutationObserver(() => { if (ok()) { mo.disconnect(); r(); } });
    mo.observe(html, { attributeFilter: ["class"] });
    signal.addEventListener("abort", () => mo.disconnect());
  });

  if (store.get().motion !== "full") { void introGone.then(done); return handle; }

  void (async () => {
    let timedOut = false;
    const deadline = later(DEADLINE - performance.now()).then(() => { timedOut = true; });
    const race = <T>(p: Promise<T>) => Promise.race([p.then(() => {}, () => {}), deadline]);
    try {
      await Promise.all([
        race(Promise.race([document.fonts.ready, later(FONT_RACE)])),
        race(o.registry.whenReady("engine", signal)),
      ]);
      await introGone;
    } catch (err) {
      console.warn("[rr] boot", err);
    } finally {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      if (timedOut && !signal.aborted) html.classList.add("rr-boot-timeout");
      done();
    }
  })();

  return handle;
}
