// The About margin notes are written in ink as the reader scrolls and unwritten on the way back. Each line is SVG text
// under a mask whose path runs along its baseline; the path's stroke-dashoffset is a pure function of scroll position.
// The markup ships fully drawn, so reduced motion, no mask support or no script all show the finished notes.
import { store } from "./store.ts";

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const HAND = '"Caveat", cursive';

/** Wires the notes (svg[data-ink]) under root until signal aborts. held: how far a sticky ancestor is holding the
 *  notes below where they would have scrolled to, in px; progress follows that position, so it never stalls. */
export function write(root: HTMLElement, signal: AbortSignal, held: () => number = () => 0): void {
  const notes = [...root.querySelectorAll<SVGSVGElement>("svg[data-ink]")].map((svg) => ({
    svg,
    box: svg.closest("li") ?? svg,
    texts: [...svg.querySelectorAll("text")],
    paths: [...svg.querySelectorAll<SVGPathElement>("mask path")],
  }));
  if (!notes.length) return;
  const set = (p: number[]) => notes.forEach((n, i) => n.paths.forEach((path, k) => {
    // A note's lines are written one after another inside its own progress.
    path.style.strokeDashoffset = String(1 - clamp(p[i]! * n.paths.length - k));
  }));

  // The face is named only once About is a viewport away, so the font is fetched only when the notes are near.
  const io = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    for (const n of notes) n.svg.setAttribute("font-family", HAND);
    void document.fonts.load(`500 18px ${HAND}`).then(() => {
      if (signal.aborted) return;
      // Each mask path ends where its line's ink ends, so every line is written at the same pace.
      for (const n of notes) n.texts.forEach((t, k) => {
        const y = n.paths[k]?.getAttribute("d")?.match(/^M\S+ (\S+)/)?.[1];
        if (y) n.paths[k]!.setAttribute("d", `M0 ${y} H${Math.ceil(t.getComputedTextLength()) + 4}`);
      });
      frame();
    }, () => {});
  }, { rootMargin: "100% 0px" });
  io.observe(root);
  signal.addEventListener("abort", () => io.disconnect());

  let raf = 0;
  function frame() {
    raf = 0;
    const vh = innerHeight, raster = store.get().mode === "raster", hold = held();
    const rects = notes.map((n) => [n.svg.getBoundingClientRect(), n.box.getBoundingClientRect()] as const);
    notes.forEach((n, i) => {
      // No room under the label at this size (the note would cross the next item): the note is not shown.
      const [r, b] = rects[i]!;
      n.svg.style.visibility = r.height && r.bottom <= b.bottom + 1 ? "" : "hidden";
    });
    set(rects.map(([r]) => {
      // Reduced motion (OS or the Motion control): drawn. Otherwise written while the note rises from 85 to 45 percent
      // of the viewport; Raster writes in 8 steps.
      if (store.get().motion === "reduced") return 1;
      const p = clamp((0.85 * vh - r.top + hold) / (0.4 * vh));
      return raster ? Math.floor(p * 8) / 8 : p;
    }));
  }
  const tick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  addEventListener("scroll", tick, { passive: true, signal });
  addEventListener("resize", tick, { passive: true, signal });
  const off = [store.subscribe("motion", tick), store.subscribe("mode", tick)];
  signal.addEventListener("abort", () => { cancelAnimationFrame(raf); off.forEach((f) => f()); });
  tick();
}
