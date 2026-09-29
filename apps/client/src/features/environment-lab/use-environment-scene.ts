import { boardArena } from "@jev-game/content";
import { ownCellCenter } from "@jev-game/game";
import { useEffect, useEffectEvent } from "react";
import type { BoardStage } from "../../game/views/board-stage.js";
import { createHeroFigure, type HeroFigure } from "../../game/views/hero-figures.js";
import { FRAMING_INSETS, type Framing } from "./framing.js";
import { SQUADS, type Squad } from "./lineup.js";

function stand(stage: BoardStage, squad: Squad): HeroFigure[] {
  return squad.members.map((member) => {
    const figure = createHeroFigure(member.heroId);
    figure.setTeamColor(squad.color);
    figure.root.position.copy(stage.toScene(ownCellCenter(boardArena, squad.side, member.cell), 0));
    figure.root.rotation.y = squad.side === "south" ? Math.PI : 0;
    stage.scene.add(figure.root);

    return figure;
  });
}

export function useEnvironmentScene(stage: BoardStage | null, framing: Framing): void {
  const frameBoard = useEffectEvent((target: BoardStage) => {
    target.showBoard(boardArena, "south", FRAMING_INSETS[framing]);
  });

  useEffect(() => {
    if (stage === null) {
      return;
    }

    frameBoard(stage);
  }, [stage, framing]);

  useEffect(() => {
    if (stage === null) {
      return;
    }

    frameBoard(stage);

    const figures = SQUADS.flatMap((squad) => stand(stage, squad));

    const stopFrames = stage.onFrame((deltaSeconds) => {
      for (const figure of figures) {
        figure.update(deltaSeconds);
      }
    });

    return () => {
      stopFrames();

      for (const figure of figures) {
        figure.dispose();
      }
    };
  }, [stage]);
}
