import { createPortal } from "react-dom";
import type { MountedBoard } from "../../../hooks/use-board-stage.js";
import { useAudio } from "../../../hooks/use-audio.js";
import { useStageView } from "../../../hooks/use-stage-view.js";
import { PickLayer } from "../../../ui/stage/pick-layer.js";
import { useLive, useMatch } from "../match-context.js";
import { requireView } from "../model/session-snapshot.js";
import { createRoundWatch } from "./round-watch.js";

export function WatchBoard({ board }: { board: MountedBoard }) {
  const controller = useMatch();
  const audio = useAudio();
  const { session, snapshot, watch, healthBeforeRound } = useLive();

  if (watch === null) {
    throw new Error("The watch board mounted without a round to watch");
  }

  const meId = requireView(snapshot).you.playerId;

  const roundWatch = useStageView(
    board.stage,
    (mounted) =>
      createRoundWatch({
        stage: mounted,
        overlay: board.overlay,
        session,
        resolved: watch,
        meId,
        healthBeforeRound,
        hud: controller.watchHud,
        audio,
        announcer: controller.announcer,
        onClose: controller.closeWatch,
      }),
    [board.overlay, controller, audio, session, watch, meId, healthBeforeRound],
  );

  if (roundWatch === null) {
    return null;
  }

  return createPortal(<PickLayer onPick={roundWatch.pick} />, board.layer);
}
