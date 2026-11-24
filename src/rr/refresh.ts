import type { gsap as GsapCore } from "gsap";
import type { ScrollTrigger as ScrollTriggerClass } from "gsap/ScrollTrigger";
import type { Handle, Registry } from "./registry.ts";
import { store } from "./store.ts";

export type RefreshReason = "chunk" | "fonts" | "resize" | "case-close" | "mode" | "layout";
export interface RefreshHandle extends Handle {
  request(reason: RefreshReason): void; // coalesced to one refresh per frame after gates open
  whenIdle(): Promise<void>;            // resolves after the pending refresh ran
}
export interface Gsap { gsap: typeof GsapCore; ScrollTrigger: typeof ScrollTriggerClass }

/** A mode token from :root, read live (data-mode is applied before store listeners run). */
export const token = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

let tickers = 0;
let loading: Promise<Gsap> | undefined;

/** Shared dynamic GSAP import. Auto refresh goes off here, before any module can create a trigger. */
export function loadGsap(): Promise<Gsap> {
  return (loading ??= (async () => {
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ autoRefreshEvents: "none" });
    if (import.meta.env.MODE !== "production") {
      (await import("./debug.ts")).registerDebugGsap({
        st: () => ScrollTrigger.getAll().length,
        tl: () => gsap.globalTimeline.getChildren().length,
        ticker: () => tickers,
      });
    }
    return { gsap, ScrollTrigger };
  })());
}

/** gsap.ticker.add with a live count for __rr.ticker(); returns an idempotent remover. */
export function addTicker(gsap: typeof GsapCore, fn: (time: number) => void): () => void {
  gsap.ticker.add(fn);
  tickers++;
  let on = true;
  return () => { if (on) { on = false; gsap.ticker.remove(fn); tickers--; } };
}

/** Pure coalescing core: many requests become one run per frame, held while locked; kick() re-arms after a lock clears. */
export function coalesce(run: () => void, locked: () => boolean, frame: (cb: () => void) => void) {
  let pending = false, queued = false;
  const idle: (() => void)[] = [];
  const settle = () => { for (const r of idle.splice(0)) r(); };
  const kick = () => {
    if (!pending || queued || locked()) return;
    queued = true;
    frame(() => {
      queued = false;
      if (!pending || locked()) return;
      pending = false;
      try { run(); } finally { settle(); }
    });
  };
  return {
    request() { pending = true; kick(); },
    kick,
    whenIdle: (): Promise<void> => (pending ? new Promise((r) => idle.push(r)) : Promise.resolve()),
    settle,
  };
}

export async function create(o: { signal: AbortSignal; registry: Registry }): Promise<RefreshHandle> {
  const { ScrollTrigger } = await loadGsap();
  const life = new AbortController();
  const signal = AbortSignal.any([o.signal, life.signal]);
  let raf = 0, debounce = 0;
  const locked = () => { const s = store.get(); return s.transitionLock || s.pinDragging; };
  const c = coalesce(() => ScrollTrigger.refresh(), locked, (cb) => { raf = requestAnimationFrame(cb); });
  const unsub = [store.subscribe("transitionLock", c.kick), store.subscribe("pinDragging", c.kick)];

  addEventListener("resize", () => { clearTimeout(debounce); debounce = window.setTimeout(c.request, 150); }, { signal });
  addEventListener("load", c.request, { signal });
  document.addEventListener("DOMContentLoaded", c.request, { signal });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) c.request(); }, { signal });
  // Font generation: a mode switch lazy-loads the other mode's families, so every finished load redraws the canvases.
  document.fonts.addEventListener("loadingdone", () => {
    store.set({ fontGen: store.get().fontGen + 1 });
    c.request();
  }, { signal });

  // Test hook: refreshInit events fired while a transition holds the lock; must stay 0.
  let lockedInits = 0;
  const onInit = () => { if (store.get().transitionLock) lockedInits++; };
  if (import.meta.env.MODE !== "production") {
    ScrollTrigger.addEventListener("refreshInit", onInit);
    const rr = (window as unknown as { __rr?: Record<string, unknown> }).__rr;
    if (rr) rr["refreshInitLocked"] = () => lockedInits;
  }

  // A windowed card (.wcard[data-window]) scrolls its contents with the page, so a refresh would measure rows at the
  // wrong offset and draw their rules early. Flatten the windows for the measure, then put them back.
  const held = new Map<HTMLElement, number>();
  const flatten = () => { for (const el of document.querySelectorAll<HTMLElement>(".wcard[data-window]")) if (el.scrollTop) { held.set(el, el.scrollTop); el.scrollTop = 0; } };
  const restore = () => { for (const [el, t] of held) el.scrollTop = t; held.clear(); };
  ScrollTrigger.addEventListener("refreshInit", flatten);
  ScrollTrigger.addEventListener("refresh", restore);

  return {
    request: () => { if (!life.signal.aborted) c.request(); },
    whenIdle: c.whenIdle,
    destroy() {
      if (life.signal.aborted) return;
      life.abort();
      cancelAnimationFrame(raf);
      clearTimeout(debounce);
      for (const u of unsub) u();
      ScrollTrigger.removeEventListener("refreshInit", onInit);
      ScrollTrigger.removeEventListener("refreshInit", flatten);
      ScrollTrigger.removeEventListener("refresh", restore);
      c.settle();
    },
  };
}
