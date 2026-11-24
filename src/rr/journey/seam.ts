// Seams: the registration rule, drawn left to right ("rule") or right to left ("rule-r").
import { io2, pick, scrub, set, type Ctx, type Win } from "./cells.ts";

type Pair = [desk: Win, mobile: Win];
const RULE: Pair = [["top 92%", "top 62%"], ["top 95%", "top 75%"]];
const WIN: Record<string, Pair> = {
  work: [["top 92%", "top 48%"], ["top 95%", "top 70%"]],
  about: RULE, lab: RULE, contact: RULE,
};

export function bindSeam(c: Ctx, el: HTMLElement) {
  const w = (WIN[el.id] ?? RULE)[c.desk ? 0 : 1];
  const f = pick(io2, 24);
  scrub(c, el, w, (p) => set(el, "--rr-seam", f(p)));
}
