import { useEffectEvent, useLayoutEffect } from "react";
import type { MatchController } from "../state/match-controller.js";

export function useMatchArrival(
  controller: MatchController,
  navigationId: number,
  joinRoomId: string | null,
): void {
  const navigate = useEffectEvent(() => {
    controller.navigate(joinRoomId);
  });

  useLayoutEffect(() => {
    navigate();
  }, [controller, navigationId]);
}
