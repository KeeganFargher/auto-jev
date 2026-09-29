import { useState, type ReactNode } from "react";
import { createTooltip } from "./create-tooltip.js";
import { TipLayer } from "./tip-layer.js";
import { TooltipContext } from "./tooltip-context.js";
import { useTipDelay } from "./use-tip-delay.js";
import { useTipDismissal } from "./use-tip-dismissal.js";

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tooltip] = useState(createTooltip);

  useTipDelay(tooltip);
  useTipDismissal(tooltip);

  return (
    <TooltipContext value={tooltip}>
      {children}
      <TipLayer />
    </TooltipContext>
  );
}
