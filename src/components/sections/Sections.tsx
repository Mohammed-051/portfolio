import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { SECTIONS } from "../../lib/site";
import { load, type SectionId } from "./chunks";

/* The section shells (id, landmark) ship in the main chunk so anchors and the section rail
 * exist from the first paint. Each body is its own lazy chunk (chunks.ts). The fallback reserves the body's
 * height so nothing below jumps when it lands. Values are the stack layout, measured on the preview build
 * (360, 390, 768, 900, 1024, 1280, 1440, 1920 wide). The pin-layout values for Work and Contact live in app.css
 * (.rv-work, .rv-contact) because they depend on html.enhanced. */
const BODY: Record<SectionId, { Body: ComponentType; reserve: string; pad: string }> = {
  work: { Body: lazy(load.work), reserve: "rv-work h-[4110px] md:h-[4380px] lg:h-[4440px] xl:h-[4360px] 2xl:h-[4320px]", pad: "pb-24 lg:pb-32" },
  // About, Lab, Contact: measured with the paper world on, Render, 900 px tall, at 390, 768, 1024, 1280, 1536.
  about: { Body: lazy(load.about), reserve: "h-[2960px] md:h-[2225px] lg:h-[2690px] xl:h-[2570px] 2xl:h-[2580px]", pad: "pb-24 lg:pb-32" },
  lab: { Body: lazy(load.lab), reserve: "h-[4690px] md:h-[4910px] lg:h-[5700px] xl:h-[5585px] 2xl:h-[5600px]", pad: "pb-24 lg:pb-32" },
  // Contact: the world's sign card and footer sheet; without the world, one frame (100vh less the nav) from 900 px (app.css).
  contact: { Body: lazy(load.contact), reserve: "rv-contact h-[990px] md:h-[1135px] lg:h-[985px] xl:h-[1030px] 2xl:h-[1070px]", pad: "" },
};

const SEAM: Record<SectionId, string> = { work: "rule", about: "rule-r", lab: "rule", contact: "rule-r" };

/** Mounts after the lazy body resolves; its effect runs after the body's own effects, then marks the section ready. */
function Ready({ id, Body }: { id: SectionId; Body: ComponentType }) {
  useEffect(() => {
    const el = document.getElementById(id);
    el?.setAttribute("data-ready", "");
    return () => el?.removeAttribute("data-ready");
  }, [id]);
  return <Body />;
}

export function Sections() {
  return SECTIONS.map(({ id }) => {
    const { Body, reserve, pad } = BODY[id];
    return (
      <section
        key={id}
        id={id}
        data-rr-seam={SEAM[id]}
        aria-labelledby={`${id}-title`}
        className={`grid-page relative content-start border-t border-ink-800 pt-6 ${pad}`}
      >
        <Suspense fallback={<div aria-hidden="true" className={`col-span-full ${reserve}`} />}>
          <Ready id={id} Body={Body} />
        </Suspense>
      </section>
    );
  });
}
