import { boardArena } from "@jev-game/content";
import { useStageResource } from "../../../hooks/use-stage-resource.js";
import type { BoardStage } from "../../../game/views/board-stage.js";
import { createMenuView } from "../../../game/views/menu-view.js";
import { MENU_INSETS } from "./insets.js";

export function MenuBoard({ stage }: { stage: BoardStage }) {
  useStageResource(
    stage,
    (mounted) => {
      const view = createMenuView(mounted, { grid: boardArena, insets: MENU_INSETS });

      return () => view.dispose();
    },
    [],
  );

  return null;
}
