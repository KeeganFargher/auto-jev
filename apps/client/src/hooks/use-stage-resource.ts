import { useLayoutEffect, type DependencyList } from "react";
import type { BoardStage } from "../game/views/board-stage.js";

export function useStageResource(
  stage: BoardStage | null,
  mount: (stage: BoardStage) => () => void,
  dependencies: DependencyList,
): void {
  useLayoutEffect(() => {
    if (stage === null) {
      return;
    }

    return mount(stage);
  }, [stage, ...dependencies]);
}
