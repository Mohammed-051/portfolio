import type Lenis from "lenis";
import { loadThrough, type SectionId } from "../components/sections/chunks.ts";
import { SECTIONS, WORK_IDS } from "../lib/site.ts";
import { addTicker, loadGsap } from "./refresh.ts";
import { registry, type Handle, type Registry } from "./registry.ts";
import { store } from "./store.ts";

export interface ScrollHandle extends Handle {
  lenis: Lenis | null;                      // null under reduced motion or on import failure
  scrollTo(target: HTMLElement | number, o?: { immediate?: boolean; offset?: number; duration?: number }): Promise<void>; // seconds; always resolves
  stop(): void; start(): void;              // used by Menu and Cases
}

// In-page router. Known targets only: top, main, the four sections, plate-<WorkId>. No aliases.
const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));
const PLATE_LIST = WORK_IDS.map((w) => `plate-${w}`);
const PLATE_IDS = new Set(PLATE_LIST);

export interface Target { section: SectionId | null; focusId: string }

export function resolveTarget(id: string): Target | null {
  if (id === "top" || id === "main") return { section: null, focusId: id };
  if (SECTION_IDS.has(id)) return { section: id as SectionId, focusId: id };
  if (PLATE_IDS.has(id)) return { section: "work", focusId: `${id}-title` };
  return null;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Loads every section through the target, lets layout settle, scrolls (or turns the ring), then focuses. Never rejects. */
export async function goTo(id: string, o: { immediate?: boolean } = {}): Promise<void> {
  try {
    const t = resolveTarget(id);
    if (!t) return;
    const immediate = o.immediate === true;
    if (t.section) await loadThrough(t.section);
    const refresh = registry.get("refresh");
    if (refresh) {
      refresh.request("layout");
      // shortcut: whenIdle stalls while transitionLock or pinDragging is set, so cap it at 500 ms; upgrade if a refresh ever needs longer
      await Promise.race([refresh.whenIdle(), wait(500)]);
    }
    const pin = store.get().layout === "pin";
    // In pin layout the ring adds the pin distance below Work when it goes live, so wait for it before aiming anywhere.
    const ring = pin && t.section ? await registry.whenReady("ring", AbortSignal.timeout(1200)).catch(() => undefined) : undefined;
    if (PLATE_IDS.has(id) && pin) {
      if (ring) ring.goTo(PLATE_LIST.indexOf(id), { immediate });
      else await scrollToEl(document.getElementById("work"), immediate);
    } else {
      const el = document.getElementById(id) ?? (t.section ? document.getElementById(t.section) : null);
      await scrollToEl(el, immediate || id === "main");
      // Sections still settling under the glide (lazy chunks, the world mounting) move the target: land again, once.
      if (el && Math.abs(landY(el) - scrollY) > 2) await scrollToEl(el, true);
    }
    const f = document.getElementById(t.focusId) ?? document.getElementById(id);
    if (!f) return;
    if (f.tabIndex < 0 && !f.hasAttribute("tabindex")) f.setAttribute("tabindex", "-1");
    f.focus({ preventScroll: true });
  } catch (err) {
    console.warn("[rr] goTo", id, err);
  }
}

/** A section's landing: its top under the nav (scroll-padding-top). With the world on, Contact goes on to the sign's rest
 *  (world/sign.ts mark: Contact's top at or above 0.5 vh; this lands it at 0.02 vh), so the card lands squared up and whole,
 *  never mid-transit. */
function landY(el: HTMLElement): number {
  const html = document.documentElement;
  let y = el.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(html).scrollPaddingTop) || 0);
  if (el.id === "contact" && html.classList.contains("has-world")) y = Math.max(y, el.getBoundingClientRect().top + scrollY - Math.floor(0.02 * innerHeight) + 1);
  return Math.max(0, Math.min(Math.round(y), html.scrollHeight - innerHeight));
}

function scrollToEl(el: HTMLElement | null, immediate: boolean): Promise<void> {
  if (!el) return Promise.resolve();
  const s = registry.get("scroll");
  if (s) return s.scrollTo(landY(el), { immediate });
  window.scrollTo({ top: landY(el), behavior: "auto" });
  return Promise.resolve();
}

export async function create(o: { signal: AbortSignal; registry: Registry }): Promise<ScrollHandle> {
  const life = new AbortController();
  const signal = AbortSignal.any([o.signal, life.signal]);
  let lenis: Lenis | null = null;
  let off = () => {};

  if (store.get().motion === "full") {
    try {
      const [{ gsap, ScrollTrigger }, { default: LenisCtor }] = await Promise.all([loadGsap(), import("lenis")]);
      const l = new LenisCtor({ autoRaf: false, anchors: false, lerp: 0.1, smoothWheel: true });
      l.on("scroll", ScrollTrigger.update);
      const rm = addTicker(gsap, (t) => l.raf(t * 1000));
      gsap.ticker.lagSmoothing(0); // off, chosen over the default (500, 33) by measurement
      lenis = l;
      off = () => { rm(); l.destroy(); gsap.ticker.lagSmoothing(500, 33); };
    } catch (err) {
      console.warn("[rr] smooth scroll unavailable, native scroll", err);
    }
  }

  // Lenis never calls onComplete for a scroll another scrollTo interrupted, so the newest call settles the one before it.
  let settle: (() => void) | null = null;
  const h: ScrollHandle = {
    lenis,
    scrollTo(target, so = {}) {
      const l = lenis;
      if (l) {
        settle?.();
        return new Promise((resolve) => {
          if (l.isStopped) return resolve();
          let t = 0;
          const done = () => {
            clearTimeout(t);
            if (settle === done) settle = null;
            resolve();
          };
          settle = done;
          // shortcut: the timer also covers a user wheel or touch that stops the glide; lenis exposes no cancel event
          t = window.setTimeout(done, ((so.duration ?? 1.2) + 1) * 1000);
          l.scrollTo(target, { ...so, onComplete: done });
        });
      }
      const y = typeof target === "number" ? target : target.getBoundingClientRect().top + scrollY;
      window.scrollTo({ top: y + (so.offset ?? 0), behavior: "auto" });
      return Promise.resolve();
    },
    stop: () => lenis?.stop(),
    start: () => lenis?.start(),
    destroy() {
      if (life.signal.aborted) return;
      life.abort();
      off();
    },
  };

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
    const id = a ? decodeURIComponent(a.getAttribute("href")!.slice(1)) : "";
    if (!resolveTarget(id)) return;
    e.preventDefault();
    // #plate- links in pin layout reach the ring through goTo; a handler that already called preventDefault wins.
    void goTo(id);
  }, { signal });

  // Cold deep link: once refresh exists (created after scroll), land on the hash without a glide.
  const cold = decodeURIComponent(location.hash.slice(1));
  if (cold && resolveTarget(cold))
    void o.registry.whenReady("refresh", signal).then(() => goTo(cold, { immediate: true }), () => {});

  // Reload in the same tab: the browser's own restore clamps to the page height it sees at load (pins and the world lay out
  // later), so put the saved place back once refresh exists. A new tab's intro pins restoration to manual, so this skips.
  const saved = (() => { try { return Number(sessionStorage.getItem("rr-y")); } catch { return 0; } })();
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (!cold && saved > 0 && nav?.type === "reload" && history.scrollRestoration === "auto")
    void o.registry.whenReady("refresh", signal).then(() => { if (Math.abs(scrollY - saved) > 4) void h.scrollTo(saved, { immediate: true }); }, () => {});
  addEventListener("pagehide", () => { try { sessionStorage.setItem("rr-y", String(Math.round(scrollY))); } catch { /* storage blocked */ } }, { signal });

  return h;
}
