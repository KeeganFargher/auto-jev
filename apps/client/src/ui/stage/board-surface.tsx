import type { ReactNode } from "react";
import type { BoardHandle } from "../../hooks/use-board-stage.js";
import { classNames } from "../class-names.js";
import { BattleOverlay } from "../battle-overlay/battle-overlay.js";
import { StageMonitor } from "./stage-monitor.js";

export function BoardSurface({
  board,
  fixed,
  children,
}: {
  board: BoardHandle;
  fixed?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={classNames("board-surface", fixed === true && "is-fixed")}>
      <div className="board-host" ref={board.hostRef} />
      <div className="board-overlay" ref={board.attachLayer}>
        <BattleOverlay overlay={board.overlay} />
        {children}
      </div>
      <StageMonitor stage={board.stage} />
    </div>
  );
}
