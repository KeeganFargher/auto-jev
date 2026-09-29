import { useState } from "react";
import { MATCH_HASH } from "../../app/routes.js";
import { ENVIRONMENT_THEMES } from "../../game/environments/themes/index.js";
import { useBoardStage } from "../../hooks/use-board-stage.js";
import { BoardSurface } from "../../ui/stage/board-surface.js";
import type { Framing } from "./framing.js";
import { HudGuides } from "./hud-guides.js";
import { LabTools } from "./lab-tools.js";
import { StatsPanel } from "./stats-panel.js";
import { ThemePicker } from "./theme-picker.js";
import { useEnvironmentScene } from "./use-environment-scene.js";
import { useEnvironmentTheme } from "./use-environment-theme.js";
import { useLeakTest } from "./use-leak-test.js";
import { useStatsReadings } from "./use-stats-readings.js";

export default function EnvironmentLabScreen({
  navigationId,
  themeId,
}: {
  navigationId: number;
  themeId: string | null;
}) {
  const { theme, savedId, showTheme, pickTheme } = useEnvironmentTheme(navigationId, themeId);
  const [framing, setFraming] = useState<Framing>("game");
  const [showGuides, setShowGuides] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const board = useBoardStage(theme);
  const readings = useStatsReadings(board.stage, showStats);
  const leakTest = useLeakTest(board.stage, showTheme);

  useEnvironmentScene(board.stage, framing);

  return (
    <div className="env-root">
      <BoardSurface board={board} />
      {showGuides ? <HudGuides /> : null}
      <a className="pill-button env-back" href={MATCH_HASH}>
        Menu
      </a>
      <LabTools
        framing={framing}
        showGuides={showGuides}
        showStats={showStats}
        onFrame={setFraming}
        onToggleGuides={() => setShowGuides((shown) => !shown)}
        onToggleStats={() => setShowStats((shown) => !shown)}
      />
      <div className="env-caption">{theme.story}</div>
      <ThemePicker
        themes={ENVIRONMENT_THEMES}
        selectedId={theme.id}
        savedId={savedId}
        onPick={pickTheme}
      />
      {showStats ? (
        <StatsPanel
          readings={readings}
          note={leakTest.note}
          onLeakTest={() => leakTest.start(theme)}
        />
      ) : null}
    </div>
  );
}
