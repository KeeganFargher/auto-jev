import { useRef } from "react";
import { createPortal } from "react-dom";
import { useStoreSelector } from "../../state/use-store.js";
import { classNames } from "../class-names.js";
import type { TipState } from "./tip-state.js";
import { TIP_ID, useTooltip } from "./tooltip-context.js";
import { useTipPlacement } from "./use-tip-placement.js";

const selectActive = (state: TipState) => state.active;

export function TipLayer() {
  const tooltip = useTooltip();
  const active = useStoreSelector(tooltip.state, selectActive);
  const layerRef = useRef<HTMLDivElement>(null);

  const placement = useTipPlacement(active, layerRef, () => tooltip.dispatch({ kind: "hide" }));

  return createPortal(
    <div
      ref={layerRef}
      id={TIP_ID}
      role="tooltip"
      className={classNames("hud-tip", active !== null && active.entering && "is-entering")}
      data-side={placement === null ? undefined : placement.side}
      hidden={active === null}
      style={placement === null ? undefined : { left: placement.x, top: placement.y }}
    >
      {active === null ? null : active.target.spec.content}
    </div>,
    document.body,
  );
}
