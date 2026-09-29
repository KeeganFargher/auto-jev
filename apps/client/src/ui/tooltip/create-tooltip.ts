import { createStore } from "../../state/store.js";
import { idleTip, reduceTip, type TipState } from "./tip-state.js";
import type { Tooltip } from "./tooltip-context.js";

export function createTooltip(): Tooltip {
  const state = createStore<TipState>(idleTip());

  return {
    state,

    dispatch(action) {
      state.update((current) => reduceTip(current, action, performance.now()));
    },
  };
}
