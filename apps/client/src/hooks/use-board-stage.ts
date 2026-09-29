import { boardArena } from "@jev-game/content";
import { useEffect, useRef, useState, type RefObject } from "react";
import { mountEnvironment, type EnvironmentTheme } from "../game/environments/environment.js";
import { createBattleOverlay, type BattleOverlay } from "../game/views/battle-overlay.js";
import { createBoardStage, type BoardStage } from "../game/views/board-stage.js";
import { useStageResource } from "./use-stage-resource.js";

export interface BoardHandle {
  hostRef: RefObject<HTMLDivElement | null>;
  attachLayer: (element: HTMLDivElement | null) => void;
  layer: HTMLDivElement | null;
  stage: BoardStage | null;
  overlay: BattleOverlay;
}

export interface MountedBoard {
  stage: BoardStage;
  layer: HTMLDivElement;
  overlay: BattleOverlay;
}

export function mountedBoard(board: BoardHandle): MountedBoard | null {
  if (board.stage === null || board.layer === null) {
    return null;
  }

  return { stage: board.stage, layer: board.layer, overlay: board.overlay };
}

export function useBoardStage(theme: EnvironmentTheme | null): BoardHandle {
  const hostRef = useRef<HTMLDivElement>(null);
  const [layer, attachLayer] = useState<HTMLDivElement | null>(null);
  const [stage, setStage] = useState<BoardStage | null>(null);
  const [overlay] = useState(createBattleOverlay);

  useEffect(() => {
    const host = hostRef.current;

    if (host === null) {
      throw new Error("useBoardStage needs hostRef attached to a rendered element");
    }

    const created = createBoardStage(host);
    setStage(created);

    return () => created.dispose();
  }, []);

  useStageResource(
    theme === null ? null : stage,
    (current) => {
      if (theme === null) {
        throw new Error("The environment mounted without a theme");
      }

      const environment = mountEnvironment(current, theme, boardArena);

      return () => environment.dispose();
    },
    [theme],
  );

  return { hostRef, attachLayer, layer, stage, overlay };
}
