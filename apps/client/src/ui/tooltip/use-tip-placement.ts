import { useEffect, useEffectEvent, useLayoutEffect, useState, type RefObject } from "react";
import { placeTip, type Placement } from "./placement.js";
import type { ActiveTip } from "./tip-state.js";
import { usePointerPosition } from "./use-pointer-position.js";

const HIT_TEST_MS = 100;

function measurePlacement(tip: ActiveTip, layer: HTMLElement): Placement {
  const anchor = tip.target.anchor;
  const anchorRect = anchor.getBoundingClientRect();
  const edge = anchor.closest("[data-tip-edge]");

  const placed = placeTip(
    tip.target.spec.side,
    anchorRect,
    edge === null ? anchorRect : edge.getBoundingClientRect(),
    { width: layer.offsetWidth, height: layer.offsetHeight },
    {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    },
  );

  return { x: Math.round(placed.x), y: Math.round(placed.y), side: placed.side };
}

function samePlacement(previous: Placement, next: Placement): boolean {
  return previous.x === next.x && previous.y === next.y && previous.side === next.side;
}

export function useTipPlacement(
  active: ActiveTip | null,
  layerRef: RefObject<HTMLElement | null>,
  onLost: () => void,
): Placement | null {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const pointer = usePointerPosition();

  const remeasure = useEffectEvent(() => {
    if (active === null) {
      return;
    }

    const layer = layerRef.current;

    if (layer === null) {
      throw new Error("The tooltip layer must be mounted before a tip is placed");
    }

    const next = measurePlacement(active, layer);

    setPlacement((current) => (current !== null && samePlacement(current, next) ? current : next));
  });

  const lose = useEffectEvent(onLost);

  const anchor = active === null ? null : active.target.anchor;
  const via = active === null ? null : active.via;

  useLayoutEffect(() => {
    remeasure();
  }, [active]);

  useEffect(() => {
    if (anchor === null) {
      return;
    }

    let frame = 0;
    let testedAt = Number.NEGATIVE_INFINITY;

    const watch = (now: number): void => {
      if (!anchor.isConnected || anchor.getClientRects().length === 0) {
        lose();

        return;
      }

      if (via === "pointer" && now - testedAt >= HIT_TEST_MS) {
        testedAt = now;

        if (!anchor.contains(document.elementFromPoint(pointer.current.x, pointer.current.y))) {
          lose();

          return;
        }
      }

      remeasure();
      frame = requestAnimationFrame(watch);
    };

    frame = requestAnimationFrame(watch);

    return () => cancelAnimationFrame(frame);
  }, [anchor, via, pointer]);

  return placement;
}
