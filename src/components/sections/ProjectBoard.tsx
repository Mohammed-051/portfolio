import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BOARD, type WorkItem } from "../../lib/content";
import { useReducedMotion } from "../../motion/config";
import { registry } from "../../rr/registry.ts";
import "../../styles/board.css";

const FOCUSABLE = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** One image slot. The <img> renders only if its file existed at build time (__PROJECT_IMAGES__, from vite.config.ts); otherwise,
 *  or until it loads, a paper-draft placeholder names the expected file. Dropping the real file into public/images/projects/<slug>/
 *  needs no code edit, only a rebuild (restart the dev server) so the list is re-read. */
function Slot({ src, ratio, alt, hero }: { src: string; ratio: string; alt: string; hero?: boolean }) {
  const [ok, setOk] = useState(false);
  const [bad, setBad] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => { // a cached image can finish before React attaches onLoad
    const i = img.current;
    if (i?.complete && i.naturalWidth > 0) setOk(true);
  }, []);
  const file = src.split("/").slice(-1)[0];
  const exists = __PROJECT_IMAGES__.some((p) => src === import.meta.env.BASE_URL + p);
  return (
    <figure className={`bd__slot${hero ? " bd__slot--hero" : ""}`} data-ratio={ratio} data-ok={ok ? "" : undefined}>
      {!ok && (
        <div className="bd__ph meta" role="img" aria-label={`Image to come: ${file}, ${ratio}`}>
          <span className="bd__ph-name">{file}</span>
          <span className="bd__ph-ratio">{ratio}</span>
        </div>
      )}
      {exists && !bad && <img ref={img} src={src} alt={ok ? alt : ""} loading={hero ? "eager" : "lazy"} decoding="async" onLoad={() => setOk(true)} onError={() => setBad(true)} />}
    </figure>
  );
}

const Todo = ({ text = BOARD.none }: { text?: string }) => <p className="bd__todo meta">{text}</p>;

/** The project board (lazy chunk): a paper dossier that unfolds over the viewport. A fixed div role="dialog" at z-index
 *  150, not <dialog>.showModal(): the custom cursor sits above it. It locks page scroll (CSS and Lenis), makes #root
 *  inert, traps Tab, closes on Back and Escape, and gives focus and the exact scroll position back. The window events
 *  "rr:project-close" and html[data-board] tell the world to glide the camera back. */
export default function ProjectBoard({ w, opener, onClose }: { w: WorkItem; opener: HTMLElement | null; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  const [out, setOut] = useState(false);
  const closing = useRef(false);

  const request = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    window.dispatchEvent(new CustomEvent("rr:project-close"));
    setOut(true);
  }, []);

  // The exit animation ends in animationend; the timer covers a browser that never fires it.
  useEffect(() => {
    if (!out) return;
    const t = window.setTimeout(onClose, 700);
    return () => clearTimeout(t);
  }, [out, onClose]);

  useEffect(() => {
    const root = document.getElementById("root");
    const html = document.documentElement;
    const was = html.style.overflow;
    const y = window.scrollY;
    html.style.overflow = "hidden";
    html.dataset.board = "open";
    root?.setAttribute("inert", "");
    registry.get("scroll")?.stop();
    const el = box.current!;
    el.querySelector<HTMLElement>(".bd__back")?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); request(); return; }
      if (e.key !== "Tab") return;
      const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!, now = document.activeElement;
      if (e.shiftKey && (now === first || !el.contains(now))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (now === last || !el.contains(now))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      html.style.overflow = was;
      delete html.dataset.board;
      root?.removeAttribute("inert");
      const s = registry.get("scroll");
      s?.start();
      if (window.scrollY !== y) { window.scrollTo(0, y); s?.scrollTo(y, { immediate: true }); } // the exact position, to the pixel
      const back = opener?.isConnected ? opener : document.querySelector<HTMLElement>(".wk__row button[aria-expanded='true']");
      back?.focus({ preventScroll: true });
    };
  }, [request, opener]);

  const status = [w.year, w.status].filter(Boolean).join(" / ");
  const links = [...(w.repo ? [{ label: BOARD.repo, href: w.repo }] : []), ...w.links];
  const people = ([[BOARD.role, w.role], [BOARD.credit, w.credit]] as const).filter(([, v]) => v);
  const sections = [
    { id: "overview", h: BOARD.overview, body: w.overview ? <p className="bd__p">{w.overview}</p> : <Todo /> },
    { id: "build", h: BOARD.build, body: w.build ? <p className="bd__p">{w.build}</p> : <Todo /> },
    {
      id: "highlights", h: BOARD.highlights,
      body: w.highlights.length ? <ul className="bd__list">{w.highlights.map((h) => <li key={h}>{h}</li>)}</ul> : <Todo />,
    },
  ];

  return createPortal(
    <div
      className="bd"
      data-out={out ? "" : undefined}
      data-still={still ? "" : undefined}
      onAnimationEnd={(e) => { if (out && e.target === e.currentTarget) onClose(); }}
    >
      <div ref={box} className="bd__paper" role="dialog" aria-modal="true" aria-labelledby="bd-title" data-lenis-prevent>
        <header className="bd__head">
          <p className="bd__idx meta">{w.n}</p>
          <button type="button" className="bd__back meta" onClick={request}>
            <span aria-hidden="true">&larr;</span> {BOARD.back}
          </button>
        </header>
        <div className="bd__wrap">
          <div className="bd__title-row">
            {w.pre && <p className="bd__pre meta">{w.pre}</p>}
            <h2 id="bd-title" className="bd__title display">{w.title}</h2>
            <p className="bd__meta meta">
              <span>{w.kind}</span>
              {status && <span>{status}</span>}
            </p>
          </div>

          <Slot hero src={w.images.hero} ratio="16:9" alt={`${w.title}, hero`} />
          <div className="bd__gal">
            {w.images.gallery.map((src, i) => <Slot key={src} src={src} ratio="4:3" alt={`${w.title}, image ${i + 1}`} />)}
          </div>

          <div className="bd__body">
            {sections.map((s) => (
              <section key={s.id} className="bd__sec" aria-labelledby={`bd-${s.id}`}>
                <h3 id={`bd-${s.id}`} className="bd__h meta">{s.h}</h3>
                <div className="bd__sec-body">{s.body}</div>
              </section>
            ))}
          </div>

          <footer className="bd__foot">
            <section aria-labelledby="bd-stack">
              <h3 id="bd-stack" className="bd__h meta">{BOARD.stack}</h3>
              {w.stack.length ? <ul className="bd__chips meta">{w.stack.map((s) => <li key={s}>{s}</li>)}</ul> : <Todo />}
            </section>
            <section aria-labelledby="bd-people">
              <h3 id="bd-people" className="bd__h meta">{BOARD.people}</h3>
              {people.length ? (
                <dl className="bd__people">
                  {people.map(([k, v]) => <div key={k}><dt className="meta">{k}</dt><dd>{v}</dd></div>)}
                </dl>
              ) : <Todo />}
            </section>
            <section aria-labelledby="bd-links">
              <h3 id="bd-links" className="bd__h meta">{BOARD.links}</h3>
              {links.length ? (
                <ul className="bd__links">
                  {links.map((l) => (
                    <li key={l.href}><a className="bd__a" href={l.href} rel="noopener" target="_blank">{l.label}<span aria-hidden="true"> &#8599;</span></a></li>
                  ))}
                </ul>
              ) : <Todo text={BOARD.noLinks} />}
            </section>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
