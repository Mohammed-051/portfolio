// Sticky panel line. No three: runs under world-wait and has-world. Writes --panel-top on About's and
// Lab's .wcard: panels stick 24 px under the nav. A panel taller than the room between the nav and the foot becomes a
// window instead (work.css): --panel-h caps it, its contents scroll inside it with the page, and --panel-travel on the
// section lengthens the bay by the same amount, so the section and everything after it keep their height.
import { registry } from "../rr/registry.ts";

const SEL ="#about .wcard, #lab .wcard";

/** Starts the writer; returns its teardown. */
export function mountPanels(): () => void {
  const html = document.documentElement;
  const ac = new AbortController();
  const seen = new WeakSet<Element>();
  const ro = new ResizeObserver(() => measure());
  const travel = new Map<HTMLElement, { t: number; top: number }>();
  function measure() {
    const navH = parseFloat(getComputedStyle(html).getPropertyValue("--nav-h")) || 56;
    for (const el of document.querySelectorAll<HTMLElement>(SEL)) {
      // The children, not the card: a capped card keeps its box when its contents change height (fonts, mode).
      if (!seen.has(el)) { seen.add(el); ro.observe(el); for (const c of el.children) ro.observe(c); }
      const h = el.scrollHeight, sec = el.closest("section");
      // A window is fully on screen from its arrival (core.ts ME: the section top at 0.25 vh), foot 24 px above the fold.
      const frame = h > innerHeight - navH - 48 ? Math.round(0.75 * innerHeight - 24) : 0;
      const top = Math.min(navH + 24, innerHeight - (frame || h) - 24);
      travel.set(el, { t: frame ? h - frame : 0, top });
      el.style.setProperty("--panel-top", `${top}px`);
      el.style.setProperty("--panel-h", `${frame}px`);
      el.toggleAttribute("data-window", frame > 0);
      sec?.style.setProperty("--panel-travel", `${frame ? h - frame : 0}px`);
    }
    scroll();
  }
  /** A window's contents follow the page while the sticky card holds it: the scroll it would have travelled. From the
   *  sticky line, not the card's rect: the hand-over translates the card up to 16 px (work.css). */
  function scroll() {
    for (const [el, { t, top }] of travel) {
      const sec = el.closest("section");
      if (!t || !sec || !el.isConnected) continue;
      el.scrollTop = Math.min(t, Math.max(0, top - sec.getBoundingClientRect().top));
    }
  }
  // A section body that mounts late resizes its section; that pass finds the new panel.
  for (const id of ["about", "lab"]) { const s = document.getElementById(id); if (s) ro.observe(s); }
  addEventListener("resize", measure, { signal: ac.signal });
  addEventListener("scroll", scroll, { passive: true, signal: ac.signal });
  // Lenis scrolls the page inside the ticker and the native scroll event lands a frame later: follow Lenis's own event too,
  // so the window's contents and the page move in the same frame (no one-frame slip).
  let offLenis = () => {};
  void registry.whenReady("scroll", ac.signal).then((s) => { offLenis = s.lenis?.on("scroll", scroll) ?? offLenis; if (ac.signal.aborted) offLenis(); }, () => {});
  // Render and Raster faces have different metrics.
  document.fonts.addEventListener("loadingdone", measure, { signal: ac.signal });
  void document.fonts.ready.then(() => { if (!ac.signal.aborted) measure(); });
  measure();
  return () => {
    ac.abort();
    offLenis();
    ro.disconnect();
    for (const el of travel.keys()) { el.scrollTop = 0; el.removeAttribute("data-window"); el.closest("section")?.style.removeProperty("--panel-travel"); }
  };
}
