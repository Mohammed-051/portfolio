import { registry } from "../registry.ts";
import { store } from "../store.ts";

/**
 * A mode switch keeps the visitor's place. Render and Raster lay out at different heights, so the anchor is the
 * last section whose top has passed the viewport top plus the progress through it, put back as soon as the new mode
 * applies and again once the pins have re-measured. Lives in the lazy hero chunk, off the first-load path.
 */
export function keepPlace(signal: AbortSignal): void {
  let anchor: { el: Element; p: number } | null = null;
  const box = (s: Element) => (s.parentElement?.classList.contains("pin-spacer") ? s.parentElement : s).getBoundingClientRect();
  const hold = () => {
    if (!anchor) return;
    const r = box(anchor.el), y = Math.round(r.top + scrollY + anchor.p * r.height);
    if (Math.abs(y - scrollY) < 1) return;
    const l = registry.get("scroll")?.lenis;
    if (l) l.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
  };
  const subs = [
    store.subscribe("modeBusy", (s) => {
      if (s.modeBusy) {
        anchor = null;
        for (const el of document.querySelectorAll("section[id], footer")) { const r = box(el); if (r.top <= 0) anchor = { el, p: -r.top / Math.max(1, r.height) }; }
        return;
      }
      const a = anchor;
      void Promise.race([registry.get("refresh")?.whenIdle(), new Promise((r) => setTimeout(r, 800))])
        .then(() => { if (anchor === a) { hold(); anchor = null; } });
    }),
    store.subscribe("mode", hold),
  ];
  signal.addEventListener("abort", () => subs.forEach((f) => f()));
}
