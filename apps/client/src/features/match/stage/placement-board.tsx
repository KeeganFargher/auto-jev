import { boardArena } from "@jev-game/content";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { createFormationView } from "../../../game/views/formation-view.js";
import type { MountedBoard } from "../../../hooks/use-board-stage.js";
import { useStageView } from "../../../hooks/use-stage-view.js";
import { FormationPointer } from "../../../ui/stage/formation-pointer.js";
import { useMatch, useView } from "../match-context.js";
import { BOARD_HUD_INSETS } from "./insets.js";

export function PlacementBoard({ board }: { board: MountedBoard }) {
  const controller = useMatch();
  const view = useView();
  const { heroIds, formation, ready } = view.you;

  const formationView = useStageView(
    board.stage,
    (mounted) =>
      createFormationView(mounted, {
        grid: boardArena,
        insets: BOARD_HUD_INSETS,
        heroIds,
        formation,
        onChange: controller.placeHeroes,
      }),
    [controller, view.phaseEpoch],
  );

  useEffect(() => {
    formationView?.setFormation(formation);
  }, [formationView, formation]);

  useEffect(() => {
    formationView?.setLocked(ready);
  }, [formationView, ready]);

  if (formationView === null) {
    return null;
  }

  return createPortal(<FormationPointer view={formationView} locked={ready} />, board.layer);
}
