// Type moments: heading lines, reading light, velocity skew, parallax. Split DOM is restored on cleanup.
import { clamp, io1, out3, pick, raster, scrub, snap, type Ctx, type Win } from "./cells.ts";

type Pair = [desk: Win, mobile: Win];
const BASE: Pair = [["top 90%", "top 60%"], ["top 90%", "top 60%"]];
const LINE: Record<string, Pair> = {
  work: [["top 88%", "top 52%"], ["top 92%", "top 60%"]],
};
const WORDS: Record<string, Pair> = {
  about: [["top 82%", "bottom 42%"], ["top 88%", "bottom 55%"]],
  contact: [["top 85%", "top 50%"], ["top 85%", "top 50%"]],
};
const sec = (el: Element) => el.closest("section")?.id ?? "";

/** Lines of one heading rise inside their own clip, staggered along the heading's scroll window. */
export function bindLines(c: Ctx, h: Element, lines: HTMLElement[]) {
  const n = lines.length, s = c.desk ? 0.12 : 0, amp = c.desk ? 105 : 60;
  const inner = lines.map((l) => l.firstElementChild as HTMLElement);
  const f = pick(out3, sec(h) === "work" ? 6 : 5);
  scrub(c, h, (LINE[sec(h)] ?? BASE)[c.desk ? 0 : 1], (p) =>
    inner.forEach((el, i) => {
      const e = f(clamp((p - i * s) / (1 - (n - 1) * s)));
      el.style.transform = e >= 1 ? "" : raster() ? `translateY(${snap((1 - e) * (amp / 100) * el.offsetHeight)}px)` : `translateY(${(1 - e) * amp}%)`;
    }),
  );
  c.offs.push(() => inner.forEach((el) => (el.style.transform = "")));
}

/** Reading light: each unit goes from dim to full as the block travels. Skill rows already hold one span per item; prose is split on spaces. */
export function bindWords(c: Ctx, el: HTMLElement) {
  const lo = c.desk ? 0.35 : 0.5;
  let units = [...el.children] as HTMLElement[];
  if (!units.length) {
    const orig = [...el.childNodes];
    units = [];
    el.replaceChildren(...(el.textContent ?? "").split(/(\s+)/).map((t) => {
      if (!t || /^\s+$/.test(t)) return document.createTextNode(t);
      const s = document.createElement("span");
      s.textContent = t;
      units.push(s);
      return s;
    }));
    c.offs.push(() => el.replaceChildren(...orig));
  }
  const n = units.length, f = pick(io1, 1);
  scrub(c, el, (WORDS[sec(el)] ?? WORDS["about"]!)[c.desk ? 0 : 1], (p) =>
    units.forEach((u, i) => {
      const l = clamp((p - (i / n) * 0.7) / 0.3);
      u.style.opacity = l >= 1 ? "" : String(lo + (1 - lo) * (raster() ? (l > 0 ? 1 : 0) : f(l)));
    }),
  );
  c.offs.push(() => units.forEach((u) => (u.style.opacity = "")));
}
