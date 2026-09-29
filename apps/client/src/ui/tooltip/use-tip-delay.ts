import { useEffect } from "react";
import { useStoreSelector } from "../../state/use-store.js";
import {
  LONG_PRESS_MS,
  SHOW_DELAY_MS,
  type PendingTip,
  type PendingVia,
  type TipState,
} from "./tip-state.js";
import type { Tooltip } from "./tooltip-context.js";

const DELAY_MS: Readonly<Record<PendingVia, number>> = {
  pointer: SHOW_DELAY_MS,
  touch: LONG_PRESS_MS,
};

const selectPending = (state: TipState) => state.pending;

function sameTimer(previous: PendingTip | null, next: PendingTip | null): boolean {
  if (previous === null || next === null) {
    return previous === next;
  }

  return previous.target.anchor === next.target.anchor && previous.via === next.via;
}

export function useTipDelay(tooltip: Tooltip): void {
  const pending = useStoreSelector(tooltip.state, selectPending, sameTimer);

  useEffect(() => {
    if (pending === null) {
      return;
    }

    const anchor = pending.target.anchor;

    const timer = window.setTimeout(() => {
      tooltip.dispatch({ kind: "elapse", anchor, attached: anchor.isConnected });
    }, DELAY_MS[pending.via]);

    return () => window.clearTimeout(timer);
  }, [pending, tooltip]);
}
