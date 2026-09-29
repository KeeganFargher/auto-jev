import { useEffect } from "react";
import { useStoreSelector } from "../../state/use-store.js";
import type { TipState, TipVia } from "./tip-state.js";
import type { Tooltip } from "./tooltip-context.js";

const selectVia = (state: TipState): TipVia | null =>
  state.active === null ? null : state.active.via;

export function useTipDismissal(tooltip: Tooltip): void {
  const via = useStoreSelector(tooltip.state, selectVia);
  const shown = via !== null;
  const touched = via === "touch";

  useEffect(() => {
    if (!shown) {
      return;
    }

    const hide = () => tooltip.dispatch({ kind: "hide" });

    const hideOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hide();
      }
    };

    document.addEventListener("keydown", hideOnEscape);
    window.addEventListener("blur", hide);
    window.addEventListener("resize", hide);

    return () => {
      document.removeEventListener("keydown", hideOnEscape);
      window.removeEventListener("blur", hide);
      window.removeEventListener("resize", hide);
    };
  }, [shown, tooltip]);

  useEffect(() => {
    if (!touched) {
      return;
    }

    const hideOnTouch = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        tooltip.dispatch({ kind: "hide" });
      }
    };

    document.addEventListener("pointerdown", hideOnTouch, { capture: true, passive: true });

    return () => document.removeEventListener("pointerdown", hideOnTouch, { capture: true });
  }, [touched, tooltip]);
}
