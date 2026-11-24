import { isEnhanced } from "../motion/config.ts";
import type { Registry } from "./registry.ts";

const FONT_RACE = 1400; // ms
const CAP = 2600;       // ms from navigation start, one cap for every piece
let p: Promise<void> | null = null;
let done = 0, total = 0;

/** Fraction 0..1 of the heroReady pieces that have settled (the preloader's gates). */
export const readyFrac = () => (total ? done / total : 0);

/** The hero is paint-ready: fonts, Engine, Hero and the portrait (por-ok or por-fail on #top), all under one cap.
 *  Not enhanced: fonts only. Memoised so boot and the intro share it. Never rejects. Never awaits `booted`. */
export function heroReady(registry: Registry, signal: AbortSignal): Promise<void> {
  return (p ??= (async () => {
    const piece = <T>(x: Promise<T>) => x.then(() => {}, () => {}).then(() => { done++; });
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));
    const fonts = piece(Promise.race([document.fonts.ready, sleep(FONT_RACE)]));
    let all: Promise<unknown> = fonts;
    total = 1;
    if (isEnhanced()) {
      total = 4;
      const eng = registry.whenReady("engine", signal);
      const hero = registry.whenReady("hero", signal);
      const portrait = Promise.all([eng, hero]).then(([e]) => e.ok ? new Promise<void>((r) => {
        const ok = () => document.getElementById("top")?.matches(".por-ok, .por-fail");
        if (ok()) return r();
        const mo = new MutationObserver(() => { if (ok()) { mo.disconnect(); r(); } });
        mo.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["class"] });
        signal.addEventListener("abort", () => { mo.disconnect(); r(); });
        setTimeout(() => mo.disconnect(), CAP); // observer must not outlive the cap
      }) : undefined);
      all = Promise.all([fonts, piece(eng), piece(hero), piece(portrait)]);
    }
    await Promise.race([all, sleep(CAP - performance.now())]);
  })().catch(() => {}));
}
