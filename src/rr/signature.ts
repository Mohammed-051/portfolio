import { isEnhanced } from "../motion/config";
import { store } from "./store.ts";

const DUR = 3600; // ms, the whole signature
const DELAY = 600; // ms after `booted`
const sine = (x: number) => 0.5 - Math.cos(Math.PI * x) / 2; // sine.inOut over the chained length
const slow = (u: number) => u - (0.35 * Math.sin(2 * Math.PI * u)) / (2 * Math.PI); // slow at each stroke's ends

/** Inlines the signature SVG into its host, then draws it once the hero has booted (after the intro handoff).
 *  The <img> stays if anything fails. */
export function inline(host: HTMLElement, src: string, signal: AbortSignal): Promise<void> {
  return load(host, src, signal).catch(() => {});
}

async function load(host: HTMLElement, src: string, signal: AbortSignal): Promise<void> {
  const res = await fetch(src, { signal });
  if (!res.ok || signal.aborted) return;
  const root = new DOMParser().parseFromString(await res.text(), "image/svg+xml").documentElement;
  if (signal.aborted || root.localName !== "svg") return;
  // Defence in depth: the file is first-party.
  root.querySelectorAll("script, foreignObject, use, set, animate, animateTransform, animateMotion").forEach((n) => n.remove());
  for (const el of [root, ...root.querySelectorAll("*")]) {
    for (const a of [...el.attributes]) {
      if (a.name.toLowerCase().startsWith("on") || /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }
  }
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("focusable", "false");
  const svg = document.importNode(root, true) as unknown as SVGSVGElement;
  host.append(svg); // append only: React owns the <img>
  host.querySelector("img")?.setAttribute("hidden", "");
  void play(host, svg);
}

/**
 * One advancing front. The mask's pen paths are ordered as written (ties go to the path that starts nearest the
 * previous end) and chained by length: one eased progress over the summed length, so exactly one path grows at a time and
 * each starts where the last one's time ends. The filled silhouette under the mask is the final state. Raster: 72 steps.
 * Draws on every load. Never skipped by input, never restarted by scroll or a mode switch; reduced motion shows it complete.
 */
async function play(host: HTMLElement, svg: SVGSVGElement): Promise<void> {
  const done = () => host.classList.add("is-drawn");
  if (!isEnhanced()) return done();
  const left = [...svg.querySelectorAll<SVGPathElement>("mask path[data-t0]")];
  const t0 = (p: SVGPathElement) => Number(p.dataset["t0"]);
  left.sort((a, b) => t0(a) - t0(b));
  const paths: SVGPathElement[] = [];
  let pen: DOMPoint | null = null;
  while (left.length) {
    const tie = left.filter((p) => t0(p) === t0(left[0]!));
    const d = (p: SVGPathElement) => (pen ? Math.hypot(p.getPointAtLength(0).x - pen.x, p.getPointAtLength(0).y - pen.y) : 0);
    const next = tie.reduce((a, b) => (d(b) < d(a) ? b : a));
    left.splice(left.indexOf(next), 1);
    paths.push(next);
    pen = next.getPointAtLength(next.getTotalLength());
  }
  const lens = paths.map((p) => p.getTotalLength());
  const total = lens.reduce((s, l) => s + l, 0);
  const set = (k: number) => { // k = drawn length along the chain
    let off = 0;
    paths.forEach((p, i) => {
      const l = lens[i]!, drawn = slow(Math.min(1, Math.max(0, (k - off) / l))) * l;
      off += l;
      p.style.strokeDashoffset = String(drawn > 0 ? l - drawn : l + 1); // l + 1 sits in the gap, so no round-cap dot
    });
  };
  paths.forEach((p, i) => { p.style.strokeDasharray = `${lens[i]} ${2 * lens[i]!}`; });
  set(0);
  done(); // visible from here: nothing is uncovered yet

  if (!store.get().booted) await new Promise<void>((r) => { const off = store.subscribe("booted", (s) => { if (s.booted) { off(); r(); } }); });
  await new Promise((r) => setTimeout(r, DELAY));
  if (!host.isConnected) return;
  dispatchEvent(new Event("rr:sig")); // rr/sound voices the signature start
  const t = performance.now();
  await new Promise<void>((r) => {
    const tick = (now: number) => {
      const x = Math.min(1, (now - t) / DUR);
      const e = store.get().mode === "raster" ? Math.floor(sine(x) * 72) / 72 : sine(x);
      set(e * total);
      if (x < 1 && host.isConnected) requestAnimationFrame(tick);
      else r();
    };
    requestAnimationFrame(tick);
  });
  paths.forEach((p) => p.style.removeProperty("stroke-dasharray")); // rest state plain: the whole silhouette shows
}
