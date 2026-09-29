import { useLayoutEffect, useRef, type RefObject } from "react";
import type { Anchors } from "../game/views/anchors.js";

export function useAnchor<P>(
  anchors: Anchors<P>,
  key: string,
  place: (element: HTMLElement, payload: P) => void,
): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;

    if (element === null) {
      throw new Error(`Anchor "${key}" has no element to move`);
    }

    return anchors.follow(key, (payload) => place(element, payload));
  }, [anchors, key, place]);

  return ref;
}
