import type { ComponentType } from "react";
import { SECTIONS } from "../../lib/site";

/* One lazy chunk per section body This module stays in the main chunk. Sections.tsx sets data-ready on each
 * <section> once its body has mounted; loadThrough waits for that. */
export type SectionId = (typeof SECTIONS)[number]["id"]; // "work" | "about" | "lab" | "contact"

export const load: Record<SectionId, () => Promise<{ default: ComponentType }>> = {
  work: () => import("./Work").then((m) => ({ default: m.Work })),
  about: () => import("./About").then((m) => ({ default: m.About })),
  lab: () => import("./Lab").then((m) => ({ default: m.Lab })),
  contact: () => import("./Contact").then((m) => ({ default: m.Contact })),
};

const CAP = 1200;

/** Resolves when every section from the first through `id` has imported and carries data-ready.
 *  Capped at 1,200 ms. Never rejects. */
export function loadThrough(id: SectionId): Promise<void> {
  const ids = SECTIONS.map((s) => s.id);
  const upto = ids.slice(0, ids.indexOf(id) + 1);
  return Promise.all(
    upto.map((s) => {
      void load[s]().catch(() => {}); // starts the import; a failed chunk is covered by the cap
      return new Promise<void>((resolve) => {
        const el = document.getElementById(s);
        if (!el || el.hasAttribute("data-ready")) return resolve();
        const done = () => { mo.disconnect(); clearTimeout(t); resolve(); };
        const mo = new MutationObserver(() => { if (el.hasAttribute("data-ready")) done(); });
        const t = setTimeout(done, CAP);
        mo.observe(el, { attributes: true, attributeFilter: ["data-ready"] });
      });
    }),
  ).then(() => {});
}
