import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { LINKS, SITE, UI } from "../../lib/site";
import { FooterPlay } from "../layout/FooterPlay";

const COPY_FAILED = "Copy did not work. The address is selected.";const MAILTO = `mailto:${SITE.email}`;

/** Tells the footer world which link is live (i = 0..2) or releases it (-1). rr/closing.ts listens. */
const react = (i: number, el?: Element) => {
  const r = el?.getBoundingClientRect();
  document.dispatchEvent(new CustomEvent("rr:react", { detail: { i, x: r ? r.left + r.width / 2 : 0 } }));
};
const hot = (i: number) => ({
  onPointerEnter: (e: PointerEvent<HTMLElement>) => react(i, e.currentTarget),
  onFocus: (e: FocusEvent<HTMLElement>) => react(i, e.currentTarget),
  onPointerLeave: () => react(-1),
  onBlur: () => react(-1),
});

/** Contact: a heading, one line, four tiles, then the footer. The Email tile is a real mail link that
 *  also copies the address. With the paper world, the sign card prints the heading and the tiles, and these real
 *  controls sit over the printed tiles (src/world/index.ts places them); the line rests on the table under it. */
export function Contact() {
  const timer = useRef(0);
  const fail = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState<"" | "ask" | "world">("");
  const [say, setSay] = useState("");

  // Sections arrive after first paint, so a deep link (/#about) may have scrolled to a shorter page. Re-aim once.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  // A failed copy shows the address as a mail link: select it, so the visitor can copy it by hand.
  useEffect(() => {
    const el = fail.current;
    if (!failed || !el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  }, [failed]);

  /** The clipboard comes first and never waits on an animation; the world's answer follows. The mail link still opens. */
  async function copy(el: HTMLElement, where: "ask" | "world") {
    let ok = false;
    try {
      await navigator.clipboard.writeText(SITE.email);
      ok = true;
    } catch {
      // no clipboard API, or refused: the old command on a throwaway field
      const t = document.createElement("textarea");
      t.value = SITE.email;
      t.setAttribute("readonly", "");
      t.style.cssText = "position:fixed;opacity:0";
      document.body.append(t);
      t.select();
      try { ok = document.execCommand("copy"); } catch { /* falls through to the manual copy */ }
      t.remove();
    }
    if (!ok) {
      setFailed(where);
      setSay(COPY_FAILED);
      return;
    }
    const r = el.getBoundingClientRect();
    document.dispatchEvent(new CustomEvent("rr:answer", { detail: { x: r.left + r.width / 2 } }));
    setCopied(true);
    setSay(UI.contact.copied);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setCopied(false); setSay(""); }, 1600);
  }

  const failLink = <a ref={fail} href={MAILTO}>{SITE.email}</a>;
  return (
    <div className="ct col-span-full">
      <div className="ct__frame">
        {/* The footer sheet: display: contents without the world; with it, the sheet that slides over the table. */}
        <div className="ct__sheet">
          <FooterPlay />
        </div>
        <div className="ct__ask">
          <p className="ct__h display text-display-m" aria-hidden="true">Contact</p>
          <p className="ct__line">{UI.contact.line}</p>
          <ul className="ct__grid">
            <li>
              <a className="ct__cell" href={MAILTO} data-sfx="copy" data-copied={copied || undefined} onClick={(e) => void copy(e.currentTarget, "ask")}>
                <span className="meta">{copied ? UI.contact.copied : "Email"}</span>
              </a>
            </li>
            {LINKS.map((l, i) => (
              <li key={l.href}>
                <a className="ct__cell" href={l.href} rel="me noopener" {...hot(i)}>
                  <span className="meta">{l.label}</span>
                </a>
              </li>
            ))}
          </ul>
          {failed === "ask" && <p className="ct__fail">{failLink}</p>}
        </div>
        <div className="ct__world">
          <div className="ct__tiles">
            <a className="ct__tile" href={MAILTO} data-sfx="copy" onClick={(e) => void copy(e.currentTarget, "world")}>
              <span className="ct__tl">Email</span>
            </a>
            {LINKS.map((l) => (
              <a key={l.href} className="ct__tile" href={l.href} rel="me noopener">
                <span className="ct__tl">{l.label}</span>
              </a>
            ))}
          </div>
          <p className="ct__avail meta">{copied ? UI.contact.copied : ""}</p>
          <p className="ct__mailw">{failed === "world" ? failLink : UI.contact.line}</p>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{say}</p>
      </div>
      {/* The visible heading is decorative (and printed on the sign card with the world), so this is the section's heading. */}
      <h2 id="contact-title" className="sr-only">
        Contact
      </h2>
    </div>
  );
}
