// Scene drivers: Bench plate registration, hairline rules, section parallax.
import { clamp, out2, out3, pick, raster, scrub, set, snap, stepped, type Ctx } from "./cells.ts";

/** Bench: --rr-p 0 to 1 on the figure. CSS draws the offset outline, ticks and the wipe on the canvas. */
export function bindFrame(c: Ctx, fig: HTMLElement) {
  const wrap = fig.querySelector<HTMLElement>(".bench__wrap");
  let rows = 24;
  scrub(c, fig, c.desk ? ["top 88%", "top 40%"] : ["top 92%", "top 55%"], (p) => {
    rows = clamp(Math.ceil((wrap?.offsetHeight ?? 192) / 8), 4, 64);
    const v = raster() ? stepped(rows)(p) : out3(p);
    set(fig, "--rr-p", v);
    if (v >= 1) fig.setAttribute("data-rr-done", ""); // drops the canvas mask once complete
    else fig.removeAttribute("data-rr-done");
  });
}

/** Hairline draws left to right. Rendered at full width until journey binds. */
export function bindRule(c: Ctx, el: HTMLElement) {
  const f = pick(out2, 12);
  scrub(c, el, ["top 92%", "top 70%"], (p) => {
    const e = f(p);
    el.style.transform = e >= 1 ? "" : `scaleX(${e})`;
  });
  c.offs.push(() => (el.style.transform = ""));
}

/** y = k * innerHeight * (0.5 - p) over the section's travel. Desktop only; Raster snaps to the 8px cell. */
export function bindParallax(c: Ctx, el: HTMLElement, k: number) {
  if (!c.desk || !k) return;
  const sec = el.closest("section")!;
  scrub(c, sec, ["top bottom", "bottom top"], (p) => {
    const y = k * innerHeight * (0.5 - p);
    c.gsap.set(el, { y: raster() ? snap(y) : y });
  });
  c.offs.push(() => c.gsap.set(el, { clearProps: "y" }));
}
