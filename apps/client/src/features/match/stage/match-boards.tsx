import { mountedBoard, type BoardHandle } from "../../../hooks/use-board-stage.js";
import { useMatchState } from "../match-context.js";
import { screenModeOf } from "../model/screen-mode.js";
import { DraftBoard } from "./draft-board.js";
import { MenuBoard } from "./menu-board.js";
import { PlacementBoard } from "./placement-board.js";
import { WatchBoard } from "./watch-board.js";

export function MatchBoards({ board }: { board: BoardHandle }) {
  const mode = useMatchState(screenModeOf);
  const mounted = mountedBoard(board);

  if (mounted === null) {
    return null;
  }

  switch (mode) {
    case "menu":
      return <MenuBoard stage={mounted.stage} />;

    case "draft":
      return <DraftBoard board={mounted} />;

    case "placement":
      return <PlacementBoard board={mounted} />;

    case "watch":
      return <WatchBoard board={mounted} />;

    case "lobby":
    case "stage":
      return null;
  }
}
