import { lazy, Suspense, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { m } from "motion/react";
import { HEAD, WORK, type WorkItem } from "../../lib/content";
import { UI } from "../../lib/site";
import { guardCreateAsync } from "../../rr/guard.ts";
import { registry, type HandleOf } from "../../rr/registry.ts";
import { mod } from "../../rr/ringMath.ts";
import { store, useRRStore } from "../../rr/store.ts";
import { mountWorld } from "../../world/index.ts";
import { Lede, Rise, SectionHead } from "./parts";
import { fade, useReveal } from "./reveal";
import "../../styles/work.css";

const ProjectBoard = lazy(() => import("./ProjectBoard"));

/* Work: one cream sheet, the head and the project index together, scrolling with the page like About and Lab.
 * Stack layout is a plain list with every detail open. Pin layout (wide, fine pointer) is the index: a click on a row, Prev, Next
 * or a key only SELECTS a project and turns the 3D stack (the "ring" below); it never opens anything.
 * The project board (ProjectBoard.tsx, lazy) opens only from the 3D cards: the world dispatches "rr:project" with the index. */
const N = WORK.length;
const F = UI.work.fields;
const Sep = () => <span className="sr-only">, </span>;

function Detail({ w, id, hidden }: { w: WorkItem; id: string; hidden: boolean }) {
  const facts = ([[F.kind, w.kind], [F.role, w.role], [F.year, w.year], [F.status, w.status], [F.stack, w.stack.join(", ")], [F.credit, w.credit]] as const).filter(([, v]) => v);
  return (
    <div id={`${id}-detail`} className="wk__detail" hidden={hidden}>
      {w.pre && <p className="wk__pre meta">{w.pre}</p>}
      <p className="wk__full heading">{w.title}</p>
      {w.plate && (
        <figure className="wk__media">
          <canvas aria-hidden="true" />
          <figcaption className="meta">{UI.work.plateNote}</figcaption>
        </figure>
      )}
      <p className="wk__line">{w.line}</p>
      <dl className="wk__facts meta">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {w.repo && (
        <p className="wk__repo meta">
          <a className="link tap" href={w.repo} rel="noopener">
            {UI.work.repo}: {w.repo.replace("https://", "")}
          </a>
        </p>
      )}
    </div>
  );
}

/** Registers the plate canvases (stack layout; the pin layout hides the media, the 3D stack is the picture). */
function usePlates(list: RefObject<HTMLOListElement | null>, pin: boolean) {
  useEffect(() => {
    const ac = new AbortController();
    const offs: (() => void)[] = [];
    void registry.whenReady("plates", ac.signal).then((h) => {
      list.current?.parentElement?.querySelectorAll(".wk__detail").forEach((d, i) => {
        const c = d.querySelector("canvas"), p = WORK[i]?.plate;
        if (c && p) offs.push(h.register({ id: p, canvas: c, role: "work" }));
      });
    }, () => {});
    return () => { ac.abort(); offs.forEach((f) => f()); };
  }, [list, pin]);
}

/** The selection ring (pin layout). It holds the
 *  continuous drum offset o in rows, which the world reads, tweens it to a picked row, and writes workFront. */
function createRing(host: HTMLElement, signal: AbortSignal): HandleOf<"ring"> {
  let o = store.get().workFront;
  let tw: { from: number; to: number; t0: number; dur: number } | null = null;
  let raf = 0;
  const posed = new Set<(o: number) => void>();
  const raster = () => store.get().mode === "raster";
  const emit = () => posed.forEach((f) => f(o));
  const front = () => mod(Math.round(tw ? tw.to : o), N);

  function tick(now: number) {
    raf = 0;
    if (!tw) return;
    const t = Math.min(1, (now - tw.t0) / tw.dur);
    const e = raster() ? (t >= 1 ? 1 : Math.floor(t * 4) / 4) : t >= 1 ? 1 : 1 - 2 ** (-10 * t);
    o = tw.from + (tw.to - tw.from) * e;
    if (t >= 1) { o = mod(o, N); tw = null; } // whole laps leave the drum pose unchanged
    emit();
    if (tw) raf = requestAnimationFrame(tick);
  }
  function move(to: number, immediate: boolean) {
    if (immediate || store.get().motion === "reduced") { tw = null; o = mod(to, N); emit(); return; }
    tw = { from: o, to, t0: performance.now(), dur: raster() ? 160 : 480 };
    raf ||= requestAnimationFrame(tick);
  }
  /** A project picked while the sheet is off screen (the nav, a deep link) brings the sheet into view first. */
  function reveal(immediate: boolean) {
    const sheet = host.querySelector<HTMLElement>(".wk__sheet"), nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 56;
    const r = sheet?.getBoundingClientRect();
    if (r && (r.bottom < nav + 80 || r.top > innerHeight - 80)) void registry.get("scroll")?.scrollTo(Math.max(0, Math.round(r.top + scrollY - nav - 24)), immediate ? { immediate: true } : { duration: 0.6 });
  }
  function goTo(i: number, opt?: { immediate?: boolean }) {
    const k = mod(i, N), cur = Math.round(tw ? tw.to : o);
    store.set({ workFront: k });
    move(cur + mod(k - cur + N / 2, N) - N / 2, opt?.immediate === true);
    reveal(opt?.immediate === true);
  }
  function bindDrag(el: HTMLElement, px: number) {
    let y0 = 0, o0 = 0, id = -1;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      id = e.pointerId; el.setPointerCapture(id); tw = null; y0 = e.clientY; o0 = o;
      store.set({ pinDragging: true });
    }, { signal });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      o = o0 - (e.clientY - y0) / px;
      const k = mod(Math.round(o), N);
      if (k !== store.get().workFront) store.set({ workFront: k });
      emit();
    }, { signal });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      store.set({ pinDragging: false });
      move(Math.round(o), false);
    };
    el.addEventListener("pointerup", end, { signal });
    el.addEventListener("pointercancel", end, { signal });
  }

  return {
    goTo,
    step: (dir) => goTo(front() + dir),
    active: front,
    offset: () => o,
    onPose(fn) { posed.add(fn); return () => { posed.delete(fn); }; },
    bindDrag,
    destroy() { cancelAnimationFrame(raf); raf = 0; tw = null; posed.clear(); },
  };
}

/** Pin layout only: registers the selection ring. Without it the index cannot turn the drum, so fall back to stack. */
function useRing(stage: RefObject<HTMLDivElement | null>, pin: boolean) {
  useEffect(() => {
    const host = stage.current;
    if (!host || !pin) return;
    const ac = new AbortController();
    const { signal } = ac;
    void (async () => {
      await null; // child effects run before App's orchestrator effect, so read the generation after it has begun
      if (signal.aborted) return;
      const gen = registry.gen;
      const ring = await guardCreateAsync("ring", signal, gen, async () => createRing(host, signal));
      if (!ring && !signal.aborted) store.set({ layout: "stack" });
    })();
    return () => ac.abort();
  }, [stage, pin]);
}

/** The paper world (src/world): a drum of the six plates drawn behind the stage. The DOM list stays the content. */
function useWorld(stage: RefObject<HTMLDivElement | null>) {
  useEffect(() => (stage.current ? mountWorld(stage.current) : undefined), [stage]);
}

/** Pin layout: announces the front project and its place after the selection settles (no visible counter). */
function useAnnounce(pin: boolean, front: number): string {
  const [text, setText] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!pin) return;
    const w = WORK[front]!;
    const t = window.setTimeout(() => setText(`${w.pre ? `${w.pre} ${w.title}` : w.title}, ${front + 1} of ${N}`), 250);
    return () => clearTimeout(t);
  }, [pin, front]);
  return pin ? text : "";
}

/** Selects a project: the ring turns the drum; before the ring exists the front row just changes. */
const select = (i: number) => { const r = registry.get("ring"); if (r) r.goTo(i); else store.set({ workFront: mod(i, N) }); };

export function Work() {
  const pin = useRRStore((s) => s.layout) === "pin";
  const front = useRRStore((s) => s.workFront);
  const stage = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [board, setBoard] = useState<{ i: number; opener: HTMLElement | null } | null>(null);
  const reveal = useReveal();
  usePlates(list, pin);
  useRing(stage, pin);
  useWorld(stage);
  const live = useAnnounce(pin, front);

  const close = useCallback(() => setBoard(null), []);
  // A click or tap on a 3D card (world/work.ts, after its camera glide) asks for that project's board.
  useEffect(() => {
    const on = (e: Event) => {
      const i = (e as CustomEvent<number>).detail;
      const a = document.activeElement;
      if (WORK[i]) setBoard((b) => b ?? { i, opener: a instanceof HTMLElement && a !== document.body ? a : null });
    };
    window.addEventListener("rr:project", on);
    return () => window.removeEventListener("rr:project", on);
  }, []);

  const detail = (w: WorkItem, i: number) => <Detail key={w.id} w={w} id={`plate-${w.id}`} hidden={pin && i !== front} />;

  return (
    <>
      {/* The same element in both layouts: the world mounts on it and finds .wk__hit and .wk__world inside, so React must never remove it. */}
      <div ref={stage} className={`wk__root col-span-full grid grid-cols-subgrid ${pin ? "wk__stage" : "relative"}`}>
        {!pin && <div className="wk__world col-span-full" aria-hidden="true" data-world-hit="" />}
        <div className="wk__sheet col-span-full grid grid-cols-subgrid">
          <SectionHead label="Work" />
          <h2 id="work-title" className="display col-span-full mt-12 text-display-l lg:mt-20">
            <Rise own>Work</Rise>
          </h2>
          <Lede copy={HEAD.work} className="mt-6 lg:mt-8" />
          {pin && (
            <div className="wk__bar meta col-span-full mt-12 lg:mt-20">
              <button type="button" className="wk__prev" onClick={() => registry.get("ring")?.step(-1)}>
                {UI.work.prev}
              </button>
              <button type="button" className="wk__next" onClick={() => registry.get("ring")?.step(1)}>
                {UI.work.next}
              </button>
            </div>
          )}
          <p className="sr-only" aria-live="polite">{live}</p>
          <m.ol ref={list} className={`wk col-span-full${pin ? "" : " mt-12 lg:mt-20"}`} aria-label={UI.work.index} {...reveal}>
            {WORK.map((w, i) => {
              const id = `plate-${w.id}`;
              const on = pin && i === front;
              const label = (
                <>
                  <span className="wk__n meta">{w.n}</span>
                  <Sep />
                  <span className="wk__title">{w.pre ? `${w.pre} ${w.title}` : w.title}</span>
                  <Sep />
                  <span className="wk__kind meta">{w.kind}</span>
                </>
              );
              return (
                <m.li key={w.id} variants={fade} custom={i} className="wk__item" data-active={on ? "" : undefined}>
                  <article id={id} aria-labelledby={`${id}-title`}>
                    <h3 id={`${id}-title`} className="wk__row heading">
                      {pin ? (
                        <button
                          type="button"
                          aria-expanded={on}
                          aria-controls={`${id}-detail`}
                          onClick={() => select(i)}
                          onKeyDown={(e) => {
                            const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
                            const to = e.key === "Home" ? 0 : e.key === "End" ? N - 1 : dir ? mod(i + dir, N) : -1;
                            if (to < 0) return;
                            e.preventDefault();
                            select(to);
                            list.current?.querySelectorAll<HTMLElement>(".wk__row button")[to]?.focus({ preventScroll: true });
                          }}
                        >
                          {label}
                        </button>
                      ) : (
                        label
                      )}
                    </h3>
                    {!pin && detail(w, i)}
                  </article>
                </m.li>
              );
            })}
          </m.ol>
          {/* Pin layout: the details sit together after the index so the sheet sizes itself to the tallest (work.css). */}
          {pin && <div className="wk__details col-span-full">{WORK.map(detail)}</div>}
        </div>
        {pin && <div className="wk__hit" aria-hidden="true" data-world-hit="" />}
      </div>
      {board && (
        <Suspense fallback={null}>
          <ProjectBoard w={WORK[board.i]!} opener={board.opener} onClose={close} />
        </Suspense>
      )}
    </>
  );
}
