import { createContext, useContext } from "react";
import type { ReadableStore } from "../../state/store.js";
import type { TipAction, TipState } from "./tip-state.js";

export const TIP_ID = "hud-tip";

export interface Tooltip {
  readonly state: ReadableStore<TipState>;
  dispatch(action: TipAction): void;
}

export const TooltipContext = createContext<Tooltip | null>(null);

export function useTooltip(): Tooltip {
  const tooltip = useContext(TooltipContext);

  if (tooltip === null) {
    throw new Error("Tooltips need a <TooltipProvider> above them");
  }

  return tooltip;
}
