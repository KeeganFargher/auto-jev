import { useLayoutEffect, useState, type RefObject } from "react";

export function useClipped(scrollerRef: RefObject<HTMLElement | null>): boolean {
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;

    if (scroller === null) {
      throw new Error("useClipped needs scrollerRef attached to a rendered element");
    }

    function measure(): void {
      if (scroller === null) {
        return;
      }

      setClipped(scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
    }

    measure();
    scroller.addEventListener("scroll", measure, { passive: true });
    const watcher = new ResizeObserver(measure);
    watcher.observe(scroller);

    for (const child of scroller.children) {
      watcher.observe(child);
    }

    return () => {
      scroller.removeEventListener("scroll", measure);
      watcher.disconnect();
    };
  }, [scrollerRef]);

  return clipped;
}
