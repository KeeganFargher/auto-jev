import { gameCatalogue, validateCatalogue } from "@jev-game/content";
import { useEffect, useState } from "react";
import { MATCH_HASH } from "../../app/routes.js";
import { savedBoardTheme } from "../../game/environments/board-choice.js";
import { useBoardStage } from "../../hooks/use-board-stage.js";
import type { BattleLabSession, LabFight } from "../../session/types.js";
import { BoardSurface } from "../../ui/stage/board-surface.js";
import { PickLayer } from "../../ui/stage/pick-layer.js";
import { openingFight, replaySession, startSession } from "./lab-fights.js";
import { createLabHud } from "./lab-hud.js";
import { LabFeed, LabInspector, LabStatusLine } from "./lab-readouts.js";
import { LabToolbar } from "./lab-toolbar.js";
import { LabTuning } from "./lab-tuning.js";
import { useLabScene } from "./use-lab-scene.js";
import { useTuningDraft } from "./use-tuning-draft.js";

function createOpeningSession(): BattleLabSession {
  validateCatalogue(gameCatalogue);

  return startSession(openingFight());
}

export default function BattleLabScreen() {
  const [session, setSession] = useState(createOpeningSession);
  const [hud] = useState(createLabHud);
  const board = useBoardStage(savedBoardTheme());
  const draft = useTuningDraft(session);

  const scene = useLabScene(board.stage, board.overlay, session, hud);

  useEffect(() => () => session.dispose(), [session]);

  function fight(next: LabFight): void {
    setSession(startSession(next));
  }

  return (
    <>
      <BoardSurface board={board} fixed>
        {scene === null ? null : <PickLayer onPick={scene.pick} />}
      </BoardSurface>
      <div className="lab-hud">
        <LabStatusLine hud={hud} />
        <LabFeed hud={hud} />
        <LabInspector hud={hud} />
        <LabToolbar
          session={session}
          onFightAgain={() => fight(draft.toFight())}
          onReplay={() => setSession(replaySession(session))}
        />
        <LabTuning session={session} draft={draft} onFight={fight} />
        <a className="mode-switch pill-button" href={MATCH_HASH}>
          match
        </a>
      </div>
    </>
  );
}
