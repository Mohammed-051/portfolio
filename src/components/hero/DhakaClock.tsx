import { useEffect, useState } from "react";

// Asia/Dhaka is UTC+6 all year, no daylight saving.
const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Ticks on each whole second (re-aligned every tick, so it never drifts) and stops while the tab is hidden.
 *  Client-rendered only, so there is no server markup to mismatch. */
export function DhakaClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id = 0;
    const tick = () => {
      const d = new Date();
      setNow(d);
      id = window.setTimeout(tick, 1000 - d.getMilliseconds());
    };
    const sync = () => {
      clearTimeout(id);
      if (!document.hidden) tick();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <p className="flex items-center gap-2 md:justify-end">
      <span className="live-dot" aria-hidden="true" />
      <span className="sr-only">Local time in Dhaka</span>
      <time dateTime={now.toISOString()}>{fmt.format(now)}</time>
      <span>UTC+6</span>
    </p>
  );
}
