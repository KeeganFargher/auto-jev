import { useEffect, useState } from "react";
import { useGame } from "../../../app/game-context.js";
import { createMatchController, type MatchController } from "../state/match-controller.js";
import { browserMatchServices } from "../state/match-services.js";

export function useMatchController(): MatchController | null {
  const { audio, navigation } = useGame();
  const [controller, setController] = useState<MatchController | null>(null);

  useEffect(() => {
    const created = createMatchController(browserMatchServices(audio, navigation));
    setController(created);

    return () => created.dispose();
  }, [audio, navigation]);

  return controller;
}
