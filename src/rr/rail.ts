import { SECTIONS } from "../lib/site";
import { loadGsap } from "./refresh.ts";
import type { Handle, Registry } from "./registry.ts";
import { store } from "./store.ts";

const IDS = ["top", ...SECTIONS.map((s) => s.id)];

/** Section tracker: only writes store.currentSection; Rail.tsx owns the links. */
export async function create(o: { signal: AbortSignal; registry: Registry }): Promise<Handle> {
  const { signal, registry } = o;
  const undo: (() => void)[] = [];
  let done = false;
  const destroy = () => {
    if (done) return;
    done = true;
    for (const u of undo.splice(0)) u();
  };
  signal.addEventListener("abort", destroy, { once: true });

  const els = IDS.flatMap((id) => {
    const el = document.getElementById(id);
    return el ? [[id, el] as const] : [];
  });
  // Every toggle, on or off, rewrites from the full set: the last active section in DOM order, or null in a gap
  // (the 45vh bay above #about), so a jump or a reverse scroll never leaves a stale id behind.
  const write = (active: boolean[]) => {
    if (done) return;
    store.set({ currentSection: els[active.lastIndexOf(true)]?.[0] ?? null });
  };

  if (registry.get("scroll")?.lenis) {
    const { ScrollTrigger } = await loadGsap();
    if (done || signal.aborted) return { destroy };
    const triggers: ReturnType<typeof ScrollTrigger.create>[] = [];
    const sync = () => triggers.length === els.length && write(triggers.map((t) => t.isActive));
    // refreshPriority -1: measure after the Work ring's pin spacer exists, else #work's range is the unpinned one.
    for (const [, el] of els) triggers.push(ScrollTrigger.create({ trigger: el, start: "top 45%", end: "bottom 45%", refreshPriority: -1, onToggle: sync }));
    sync();
    undo.push(() => triggers.forEach((t) => t.kill()));
    registry.get("refresh")?.request("layout"); // the coordinator is the only caller of ScrollTrigger.refresh
  } else {
    const active = els.map(() => false);
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => (active[els.findIndex(([, el]) => el === e.target)] = e.isIntersecting));
        write(active);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    els.forEach(([, el]) => io.observe(el));
    undo.push(() => io.disconnect());
  }
  return { destroy };
}
