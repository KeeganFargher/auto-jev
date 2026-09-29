import type { ReactNode } from "react";
import { GameContext, type GameServices } from "./game-context.js";

export function GameProvider({
  services,
  children,
}: {
  services: GameServices;
  children: ReactNode;
}) {
  return <GameContext value={services}>{children}</GameContext>;
}
