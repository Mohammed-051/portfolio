import { useEffect, useRef } from "react";
import { HEAD, SHEETS } from "../../lib/content";
import { write } from "../../rr/write.ts";
import { Lede, Rise, SectionHead } from "./parts";

/* About: six paper sheets on the card, a designer's notebook on a desk. Headings and captions are
   plain markup, visible at once; only the handwritten lines are written in with the scroll (rr/write.ts). */

const LH = 26; // line height of the 22 px hand, in px

/** The portrait, both treatments (shown by mode in app.css). The other sheets' drawings live on the 3D desk
 *  (world/about.ts), not here: the card stays text-only. */
function Portrait() {
  return (
    <figure className="sh__fig sh__por" aria-hidden="true">
      <div className="por-ink" />
      <img className="por-px" src="/portrait/portrait-px-raster.png" alt="" width={408} height={456} loading="lazy" decoding="async" />
    </figure>
  );
}

/** The handwritten lines, hidden from assistive tech (the sr-only copy is read instead). One mask path per line along
 *  its baseline, which rr/write.ts strokes in with the scroll. The markup ships fully drawn, for reduced motion and
 *  for no script. */
function Hand({ id, lines }: { id: string; lines: string[] }) {
  const h = lines.length * LH + 6;
  return (
    <>
      <svg data-ink="" aria-hidden="true" width="100%" height={h} className="sh__hand" fill="currentColor" fontSize="22" fontWeight="500">
        <mask id={id} maskUnits="userSpaceOnUse" x="-8" y="-8" width="400" height={h + 16}>
          {lines.map((l, k) => (
            <path key={l} d={`M0 ${(k + 1) * LH - 10} H300`} stroke="#fff" strokeWidth={LH + 4} pathLength={1} strokeDasharray="1 1" strokeDashoffset={0} />
          ))}
        </mask>
        <g mask={`url(#${id})`}>
          {lines.map((l, k) => (
            <text key={l} x="2" y={(k + 1) * LH - 5}>
              {l}
            </text>
          ))}
        </g>
      </svg>
      <p className="sr-only">{lines.join(". ")}</p>
    </>
  );
}

export function About() {
  const root = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = root.current, card = ol?.closest<HTMLElement>(".wcard"), sec = ol?.closest("section");
    if (!ol) return;
    const ac = new AbortController();
    // While the card is held by sticky (work.css, 900 px up), its sheets stop moving; the hand follows the scroll the
    // card would have travelled, so it still finishes and unwrites in step with the reader. A windowed card (panels.ts)
    // scrolls its sheets back up by scrollTop.
    write(ol, ac.signal, () =>
      card && sec && getComputedStyle(card).position === "sticky" ? card.getBoundingClientRect().top - sec.getBoundingClientRect().top - card.scrollTop : 0,
    );
    return () => ac.abort();
  }, []);
  return (
    <>
      {/* With the paper world (work.css): a window onto the desk on phones, then the head and sheets on a paper card,
          sticky from 900 px over the bay that follows it (the transit to Lab). */}
      <div className="world-slot col-span-full" aria-hidden="true" data-world-hit="" />
      <div className="wcard col-span-full grid grid-cols-subgrid">
        <SectionHead label="About" note="Profile" />
        <h2 id="about-title" className="display col-span-full mt-12 text-display-l lg:mt-20">
          <Rise own>About</Rise>
        </h2>
        <Lede copy={HEAD.about} className="mt-6 lg:mt-8" />

        <ol ref={root} className="sheets col-span-full">
          {SHEETS.map((s, i) => (
            <li key={s.h} className="sh">
              {s.img === "portrait" && <Portrait />}
              <div className="sh__text">
                <h3 className="sh__h">{s.h}</h3>
                <p className="sh__cap">{s.cap}</p>
                <Hand id={`hand-${i}`} lines={s.hand} />
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="wbay" aria-hidden="true" />
    </>
  );
}
