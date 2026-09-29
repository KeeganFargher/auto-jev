import { useStoreSelector } from "../../../state/use-store.js";
import type { MatchState } from "../model/match-state.js";
import type { MatchController } from "../state/match-controller.js";

function defectOf(state: MatchState): Error | null {
  return state.defect;
}

export function useMatchDefect(controller: MatchController): void {
  const defect = useStoreSelector(controller.state, defectOf);

  if (defect !== null) {
    throw defect;
  }
}
