import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { SHOWCASE } from "../../lib/showcaseCopy";
import type { ShowcaseHandle } from "../../rr/showcase/index.ts";
import { useRRStore } from "../../rr/store.ts";

const S = SHOWCASE;
const ALT = [S.alt.portrait, S.alt.bres, S.alt.dda, S.alt.circle];

/** "From a line to pixels": four demos that play themselves. rr/showcase draws; this renders the tabs, copy and controls. */
export function Showcase() {
  const reduced = useRRStore((s) => s.motion === "reduced");
  const [tab, setTab] = useState(0);
  const [playing, setPlaying] = useState(true);
  const ctl = useRef<ShowcaseHandle | undefined>(undefined);
  const now = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fx = useRef<HTMLCanvasElement>(null);
  const out = useRef<HTMLDListElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // The drawing module loads once the block is within a viewport of the screen.
  useEffect(() => {
    const r = root.current, st = stage.current, c = canvas.current, f = fx.current, o = out.current;
    if (!r || !st || !c || !f || !o) return;
    const ac = new AbortController();
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      import("../../rr/showcase/index.ts").then((m) => {
        if (ac.signal.aborted) return;
        ctl.current = m.create({ signal: ac.signal, stage: st, canvas: c, fx: f, out: o, onState: setPlaying });
        ctl.current.setTab(now.current);
      }).catch(() => {}); // the demos are optional: the bench below never waits on them
    }, { rootMargin: "100% 0px" });
    // Observe #lab, not the block: the block sits inside the windowed card's overflow clip, which hides it from the observer
    // until it is well into view, so the module (and the first frame) started late.
    io.observe(r.closest("#lab") ?? r);
    return () => { io.disconnect(); ac.abort(); ctl.current = undefined; };
  }, []);

  const pick = (i: number) => {
    if (i === now.current) return;
    now.current = i;
    setTab(i);
    ctl.current?.setTab(i);
  };
  const key = (e: KeyboardEvent) => {
    const n = S.tabs.length, k = e.key;
    const i = k === "ArrowRight" || k === "ArrowDown" ? (tab + 1) % n : k === "ArrowLeft" || k === "ArrowUp" ? (tab + n - 1) % n : k === "Home" ? 0 : k === "End" ? n - 1 : -1;
    if (i < 0) return;
    e.preventDefault();
    pick(i);
    tabs.current[i]?.focus();
  };

  const T = S.tabs[tab]!, no = `${S.fig} ${tab + 1}`;
  return (
    <section ref={root} aria-labelledby="xs-title" className="xs col-span-full mt-12 lg:mt-16">
      <h4 id="xs-title" className="heading text-heading">{S.title}</h4>
      <figure className="xs__fig">
        <div role="tablist" aria-label={S.tablist} className="xs__tabs" onKeyDown={key}>
          {S.tabs.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => { tabs.current[i] = el; }}
              id={`xs-tab-${i}`}
              role="tab"
              type="button"
              aria-selected={tab === i}
              aria-controls="xs-panel"
              tabIndex={tab === i ? 0 : -1}
              className="xs__tab"
              onClick={() => pick(i)}
            >
              <span className="xs__n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="xs-panel" aria-labelledby={`xs-tab-${tab}`} className="xs__body">
          <div ref={stage} className="xs__stage" data-fig={tab}>
            <div className="xs__sheet">
              <canvas ref={canvas} role="img" aria-label={ALT[tab]} className="xs__canvas" />
              <canvas ref={fx} aria-hidden="true" className="xs__fx" />
            </div>
          </div>
          <div className="xs__side">
            <p className="meta xs__no">{no}</p>
            <h5 className="heading xs__head">{T.head}</h5>
            <p className="xs__blurb">{T.blurb}</p>
            {!reduced && (
              <div className="xs__ctl">
                <button type="button" className="bench__btn" onClick={() => ctl.current?.toggle()}>{playing ? S.pause : S.play}</button>
                <button type="button" className="bench__btn" onClick={() => ctl.current?.replay()}>{S.replay}</button>
              </div>
            )}
            <dl ref={out} className="xs__out" />
          </div>
        </div>
        <figcaption className="meta xs__cap">{no}. {T.cap}</figcaption>
      </figure>
    </section>
  );
}
