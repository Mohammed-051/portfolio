import { loadGsap, token } from "./refresh.ts";
import type { Handle, Registry } from "./registry.ts";
import { store } from "./store.ts";

export interface MenuHandle extends Handle {
  open(): void;
  close(o?: { animate?: boolean }): void; // animate: wipe close (Close button, Escape); a link pick closes at once
}

/** Menu: motion for the native dialog; showModal keeps inert, Escape and focus containment. */
export async function create(o: { signal: AbortSignal; registry: Registry }): Promise<MenuHandle> {
  const { registry } = o;
  const dlg = document.querySelector<HTMLDialogElement>("dialog.menu");
  const btn = document.querySelector<HTMLButtonElement>('header button[aria-haspopup="dialog"]');
  if (!dlg || !btn) throw new Error("menu dialog missing");
  const life = new AbortController();
  const signal = AbortSignal.any([o.signal, life.signal]);
  const html = document.documentElement;
  const full = () => store.get().motion === "full";
  let busy = false, isOpen = false, destroyed = false, epoch = 0; // epoch voids a pending wipe swap or stagger after a forced close
  let tween: { kill(): void } | undefined;

  const hide = (focus = true) => {
    isOpen = false;
    tween?.kill();
    dlg.close();
    html.style.overflow = "";
    registry.get("scroll")?.start();
    if (focus) btn.focus(); // native focus restore is engine-dependent
  };
  const wipeOpts = () => {
    const r = btn.getBoundingClientRect();
    return { origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, color: token("--paper"), dur: 300 };
  };

  const h: MenuHandle = {
    open() {
      if (busy || isOpen || destroyed) return;
      isOpen = busy = true;
      const e = ++epoch;
      html.style.overflow = "hidden";
      registry.get("scroll")?.stop();
      const show = () => { if (e === epoch && !dlg.open) dlg.showModal(); };
      const wipe = registry.get("wipe");
      const run = full() && wipe ? wipe.transition(show, wipeOpts()) : Promise.resolve(show());
      void run.catch((err) => console.error("[rr] menu open", err)).then(async () => {
        busy = false;
        if (e !== epoch || !dlg.open) return;
        const links = dlg.querySelectorAll<HTMLElement>("nav a");
        links[0]?.focus();
        if (!full()) return;
        const { gsap } = await loadGsap();
        // opacity, not autoAlpha: visibility:hidden would drop the focus just placed and make late links unclickable mid-stagger
        // Tokens: Render rises 24 px in 0.36 s, stagger 0.06; Raster cuts in, 0.04 apart.
        const raster = store.get().mode === "raster";
        if (e === epoch) tween = gsap.from(links, raster
          ? { opacity: 0, duration: 0.04, ease: "steps(1)", stagger: 0.04 }
          : { y: 24, opacity: 0, duration: 0.36, ease: "expo.out", stagger: 0.06 });
      });
    },
    close(c = {}) {
      if (!isOpen || destroyed) return;
      const wipe = registry.get("wipe");
      if (c.animate && full() && wipe) {
        if (busy) return;
        busy = true;
        const e = ++epoch;
        tween?.kill();
        void wipe.transition(() => { if (e === epoch) hide(); }, wipeOpts())
          .catch((err) => console.error("[rr] menu close", err))
          .finally(() => { busy = false; });
        return;
      }
      ++epoch;
      hide();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ++epoch;
      if (isOpen) hide(false);
      life.abort();
    },
  };

  dlg.addEventListener("cancel", (e) => { e.preventDefault(); h.close({ animate: true }); }, { signal });
  dlg.addEventListener("close", () => { if (isOpen && !busy) hide(); }, { signal }); // engines that ignore a prevented cancel
  return h;
}
