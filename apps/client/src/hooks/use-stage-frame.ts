import { useEffect, useEffectEvent } from "react";
import type { BoardStage } from "../game/views/board-stage.js";

export function useStageFrame(
  stage: BoardStage | null,
  listener: (deltaSeconds: number) => void,
): void {
  const onFrame = useEffectEvent(listener);

  useEffect(() => {
    if (stage === null) {
      return;
    }

    return stage.onFrame((deltaSeconds) => onFrame(deltaSeconds));
  }, [stage]);
}
