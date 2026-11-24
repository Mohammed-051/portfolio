import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { m } from "motion/react";
import { SECTIONS, SITE, UI } from "../../lib/site";
import { duration, ease, useReducedMotion } from "../../motion/config";
import { registry } from "../../rr/registry.ts";
import { store, useRRStore } from "../../rr/store.ts";
import "../../styles/nav.css";
import { navProgress } from "./navProgress.ts";

function NavLinks({ current, big, onPick }: { current: string | null; big?: boolean; onPick?: () => void }) {
  return (
    <ol className={big ? "grid gap-2" : "nv__list"}>
      {SECTIONS.map((s) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className={big ? "link display flex items-baseline gap-4 text-display-l no-underline text-bone-100" : "nv__k"}
            aria-current={current === s.id ? "true" : undefined}
            data-sfx="key"
            onClick={onPick}
          >
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

// Links and keys sit in the bar from 1024 px, in the menu below it: one instance, never both.
const WIDE = "(min-width: 1024px)";
const onWide = (cb: () => void) => { const q = matchMedia(WIDE); q.addEventListener("change", cb); return () => q.removeEventListener("change", cb); };
const useWide = () => useSyncExternalStore(onWide, () => matchMedia(WIDE).matches);

const [FIRST = "", ...REST] = SITE.name.split(" ");

function Header() {
  const current = useRRStore((s) => s.currentSection);
  const wide = useWide();
  const head = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // The label keeps the last section through the gaps between sections.
  const [last, setLast] = useState("top");
  if (current && current !== last) setLast(current);
  const label = SECTIONS.find((s) => s.id === last)?.title ?? UI.rail.top;

  useEffect(() => {
    const el = head.current!;
    const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
    let raf = 0, prev = "", py = scrollY, acc = 0;
    // How far PARVEZ slides to sit one space after "M.": the hidden letters less the dot (unscaled layout, transforms ignored).
    const measure = () => { el.style.setProperty("--nv-d", String(q(".nv__o").offsetWidth - q(".nv__dot").offsetWidth)); };
    const update = () => {
      raf = 0;
      const s = store.get(), vh = innerHeight;
      const v = String(navProgress(scrollY / vh, s.mode === "raster", s.motion !== "full"));
      if (v !== prev) {
        prev = v;
        el.style.setProperty("--nv", v);
        el.dataset["c"] = v === "1" ? "1" : "0";
      }
      const f = document.querySelector(".ftr-name");
      const d = scrollY - py;
      py = scrollY;
      acc = d * acc > 0 ? acc + d : d; // same direction sums, a reversal restarts
      el.toggleAttribute("data-hide", scrollY < vh * 0.6 || menu.current?.open || el.matches(":focus-within") || acc <= -4 ? false : acc >= 8 || el.hasAttribute("data-hide"));
      el.toggleAttribute("data-end", !!f && f.getBoundingClientRect().top < vh * 0.9);
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
    const resize = () => { measure(); queue(); };
    const ac = new AbortController(), opt = { passive: true, signal: ac.signal };
    addEventListener("scroll", queue, opt);
    addEventListener("resize", resize, opt);
    el.addEventListener("focusin", queue, { signal: ac.signal });
    el.addEventListener("focusout", queue, { signal: ac.signal });
    menu.current!.addEventListener("close", queue, { signal: ac.signal });
    document.fonts.addEventListener("loadingdone", measure, { signal: ac.signal });
    const offs = [store.subscribe("mode", resize), store.subscribe("motion", queue)];
    resize();
    return () => { ac.abort(); cancelAnimationFrame(raf); offs.forEach((f) => f()); };
  }, []);

  const keys = (
    <div className="nv__ctl">
      <SoundToggle />
    </div>
  );

  return (
    <header ref={head} className="nav nv" data-c="0">
      <a href="#top" className="nv__name" aria-label={`${SITE.name}, back to top`} data-sfx="key">
        <span className="nv__m" aria-hidden="true">
          {FIRST[0]}
          <span className="nv__dot">.</span>
        </span>
        <span className="nv__o" aria-hidden="true">{FIRST.slice(1)}</span>
        {" "}
        <span className="nv__p" aria-hidden="true">
          {REST.join(" ")}
          <span className="nv__sec">
            <span key={label}>{"• "}{label}</span>
          </span>
        </span>
      </a>
      {wide && (
        <nav aria-label="Primary">
          <NavLinks current={current} />
        </nav>
      )}
      {wide && keys}
      <button
        type="button"
        className="nv__k nv__menu"
        aria-haspopup="dialog"
        data-sfx="key"
        aria-expanded={open}
        onClick={() => {
          const h = registry.get("menu");
          if (h) h.open();
          else {
            document.documentElement.style.overflow = "hidden"; // fallback lock, released in onClose
            menu.current?.showModal();
          }
          setOpen(true);
        }}
      >
        Menu
      </button>
      <dialog ref={menu} className="menu" aria-label="Menu" data-lenis-prevent onClose={() => {
        setOpen(false);
        document.documentElement.style.overflow = "";
      }}>
        <div className="flex h-full flex-col px-(--grid-margin)">
          <div className="flex h-(--nav-h) items-center justify-between border-b border-ink-800">
            <span className="display text-lead">M.Parvez</span>
            <button type="button" className="link tap meta justify-end" onClick={() => (registry.get("menu") ? registry.get("menu")!.close({ animate: true }) : menu.current?.close())}>
              Close
            </button>
          </div>
          <nav aria-label="Menu" className="mt-auto pb-10">
            <NavLinks current={current} big onPick={() => (registry.get("menu") ? registry.get("menu")!.close() : menu.current?.close())} />
          </nav>
          {!wide && keys}
        </div>
      </dialog>
    </header>
  );
}

/** Render / Raster switch: one radial cell wave from the button in the new mode's paper. */
function ModeSwitch() {
  const raster = useRRStore((s) => s.mode) === "raster";

  const toggle = async (e: MouseEvent<HTMLButtonElement>) => {
    if (store.get().modeBusy) return; // one wave at a time, so the final mode matches the last completed toggle
    const next = store.get().mode === "raster" ? "render" : "raster";
    const r = e.currentTarget.getBoundingClientRect();
    const swap = () => store.set({ mode: next });
    const wipe = registry.get("wipe");
    store.set({ modeBusy: true });
    try {
      if (wipe) {
        await wipe.transition(swap, {
          origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
          color: next === "raster" ? "#080807" : "#EBE7DD", // the new mode's --paper, read before it applies
          dur: 560,
        });
      } else swap();
    } finally {
      store.set({ modeBusy: false });
      registry.get("refresh")?.request("mode");
    }
  };

  return (
    <button type="button" className="mode mchip" aria-pressed={raster} aria-label={UI.mode.name} data-sfx="mode" onClick={toggle}>
      <span className="mode__opt mode__opt--render">{UI.mode.render}</span>
      <span aria-hidden="true">/</span>
      <span className="mode__opt mode__opt--raster">{UI.mode.raster}</span>
    </button>
  );
}

/** SOUND key: flips the persisted store.sound only; rr/sound plays nothing until it reads "on". */
function SoundToggle() {
  const on = useRRStore((s) => s.sound) === "on";
  return (
    <button type="button" className="nv__k" aria-pressed={on} data-sfx="key" onClick={() => store.set({ sound: on ? "off" : "on" })}>
      {UI.sound.label}
      <span className="nv__v">{on ? UI.sound.on : UI.sound.off}</span>
    </button>
  );
}

const YEAR = new Date().getFullYear();

function Footer() {
  return (
    <footer>
      <div className="ftr-fine meta text-bone-500">
        <p>
          {SITE.name}, {YEAR}
        </p>
        <p>Set in Newsreader, Instrument Sans, Bodoni Moda, Doto, Jersey 25, JetBrains Mono and Caveat</p>
      </div>
    </footer>
  );
}

/** Page frame: skip link, fixed nav, main landmark, colophon, grain. */
export function Layout({ children }: { children: ReactNode }) {
  const still = useReducedMotion();

  return (
    <>
      <a className="skip-link meta" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="@container outline-none">
        {children}
      </main>
      <Footer />
      <ModeSwitch />
      <m.div
        className="grain"
        aria-hidden="true"
        initial={still ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: duration.base, ease: ease.outExpo }}
      />
    </>
  );
}
