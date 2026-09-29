import { useAudio } from "../../hooks/use-audio.js";
import { useStageView } from "../../hooks/use-stage-view.js";
import type { BattleOverlay } from "../../game/views/battle-overlay.js";
import { createBattleView } from "../../game/views/battle-view.js";
import type { BoardStage, ViewportInsets } from "../../game/views/board-stage.js";
import type { BattleLabSession } from "../../session/types.js";
import { readUnit, unitIn } from "../../ui/hero/unit-readout.js";
import { LAB_FRIENDLY_TEAM_ID, labFightName } from "./lab-fights.js";
import type { LabHud } from "./lab-hud.js";
import { formatLabStatus, labPlayRate } from "./lab-status.js";

const LAB_HUD_INSETS: ViewportInsets = { left: 16, right: 16, top: 56, bottom: 88 };

export interface LabScene {
  pick(clientX: number, clientY: number): void;
  dispose(): void;
}

export function useLabScene(
  stage: BoardStage | null,
  overlay: BattleOverlay,
  session: BattleLabSession,
  hud: LabHud,
): LabScene | null {
  const audio = useAudio();

  return useStageView(
    stage,
    (mounted) => {
      void audio.preload("battle");

      const fight = session.fight();
      const fightName = labFightName(fight);
      let selectedUnitId: string | null = null;

      const battleView = createBattleView(mounted, {
        overlay,
        friendlyTeamId: LAB_FRIENDLY_TEAM_ID,
        viewSide: "south",
        insets: LAB_HUD_INSETS,
        targetLines: "all",
        showUnitIds: true,
        onSelectUnit(unitId) {
          selectedUnitId = selectedUnitId === unitId ? null : unitId;
        },
      });

      const stopFrames = mounted.onFrame((deltaSeconds) => {
        session.advanceRealTime(deltaSeconds);

        const view = session.getView();
        const events = session.takeEvents();
        const snapshot = view.moment.snapshot;

        battleView.update({
          moment: view.moment,
          events,
          selectedUnitId,
          deltaSeconds,
          playRate: labPlayRate(view),
        });

        hud.publish({
          status: formatLabStatus(fightName, fight.seed, snapshot, view.moment.timeScale),
          events,
          selected:
            selectedUnitId === null
              ? null
              : readUnit(snapshot, unitIn(snapshot, selectedUnitId), LAB_FRIENDLY_TEAM_ID),
        });
      });

      return {
        pick: battleView.pick,

        dispose() {
          stopFrames();
          battleView.dispose();
          hud.reset();
        },
      };
    },
    [overlay, session, hud, audio],
  );
}
