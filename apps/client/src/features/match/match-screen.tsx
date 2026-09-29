import { useBoardStage, type BoardHandle } from "../../hooks/use-board-stage.js";
import { classNames } from "../../ui/class-names.js";
import { BoardSurface } from "../../ui/stage/board-surface.js";
import { useMatchArrival } from "./hooks/use-match-arrival.js";
import { useMatchAudio } from "./hooks/use-match-audio.js";
import { useMatchController } from "./hooks/use-match-controller.js";
import { useMatchDefect } from "./hooks/use-match-defect.js";
import { useMatchTheme } from "./hooks/use-match-theme.js";
import { MenuOverlay } from "./hud/menu-overlay.js";
import { MatchContext, useMatchState } from "./match-context.js";
import { screenModeOf } from "./model/screen-mode.js";
import { LobbyMode } from "./modes/lobby-mode.js";
import { PlayMode } from "./modes/play-mode.js";
import { WatchMode } from "./modes/watch-mode.js";
import type { MatchController } from "./state/match-controller.js";
import { MatchBoards } from "./stage/match-boards.js";

function BattleLayer({ board }: { board: BoardHandle }) {
  const mode = useMatchState(screenModeOf);
  const showsBoard = mode !== "lobby" && mode !== "stage";

  return (
    <div
      className={classNames(
        "battle-layer",
        mode === "menu" && "is-menu",
        mode === "draft" && "is-drafting",
      )}
      hidden={!showsBoard}
    >
      <BoardSurface board={board} />
    </div>
  );
}

function MatchHud() {
  const mode = useMatchState(screenModeOf);

  switch (mode) {
    case "menu":
      return <MenuOverlay />;

    case "lobby":
      return <LobbyMode />;

    case "watch":
      return <WatchMode />;

    case "draft":
    case "placement":
    case "stage":
      return <PlayMode />;
  }
}

interface MatchSessionProps {
  controller: MatchController;
  navigationId: number;
  joinRoomId: string | null;
}

function MatchSession({ controller, navigationId, joinRoomId }: MatchSessionProps) {
  useMatchDefect(controller);
  useMatchArrival(controller, navigationId, joinRoomId);
  useMatchAudio(controller);
  const theme = useMatchTheme(controller);
  const board = useBoardStage(theme);

  return (
    <MatchContext value={controller}>
      <div className="match-root">
        <div className="match-backdrop" />
        <BattleLayer board={board} />
        <MatchHud />
        <MatchBoards board={board} />
      </div>
    </MatchContext>
  );
}

export default function MatchScreen({
  navigationId,
  joinRoomId,
}: {
  navigationId: number;
  joinRoomId: string | null;
}) {
  const controller = useMatchController();

  if (controller === null) {
    return null;
  }

  return (
    <MatchSession controller={controller} navigationId={navigationId} joinRoomId={joinRoomId} />
  );
}
