import { useEffect, useRef, type RefObject } from "react";

export interface PointerPoint {
  x: number;
  y: number;
}

const PASSIVE = { passive: true };

export function usePointerPosition(): RefObject<PointerPoint> {
  const position = useRef<PointerPoint>({ x: -1, y: -1 });

  useEffect(() => {
    function track(event: PointerEvent): void {
      position.current.x = event.clientX;
      position.current.y = event.clientY;
    }

    document.addEventListener("pointerover", track, PASSIVE);
    document.addEventListener("pointermove", track, PASSIVE);

    return () => {
      document.removeEventListener("pointerover", track);
      document.removeEventListener("pointermove", track);
    };
  }, []);

  return position;
}
