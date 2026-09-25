import { createLocalBattleLabSession } from "../../session/local-session.js";
import { createPlaybackSession } from "../../session/playback-session.js";
import { createBattleLabScene, type BattleLabScene } from "./battle-lab-scene.js";
import { createBoardStage, type BoardStage } from "../views/board-stage.js";
import { mountEnvironment, type MountedEnvironment } from "../environments/environment.js";
import { savedBoardTheme } from "../environments/board-choice.js";
import { boardArena } from "@jev-game/content";
import { parseScenario, serializeScenario, type LabScenario } from "../../dev/scenario-editor.js";
import type { BattleLabSession, LabScenarioKind, LabTeams, LabPicksByHero } from "../../session/types.js";

export interface BattleLab {
  show(): void;
  hide(): void;
}

export function createBattleLab(canvasRoot: HTMLElement, hudRoot: HTMLElement): BattleLab {
  const statusEl = document.getElementById("lab-status")!;
  const scenarioText = document.querySelector<HTMLTextAreaElement>("#lab-scenario-text")!;
  const exportButton = document.getElementById("lab-scenario-export")!;
  const importButton = document.getElementById("lab-scenario-import")!;
  const errorEl = document.getElementById("lab-scenario-error")!;
  let activeSession: BattleLabSession = createLocalBattleLabSession(1);
  let activeScene: BattleLabScene | null = null;
  let activeIsReplay = false;
  let labStage: BoardStage | null = null;
  let labEnvironment: MountedEnvironment | null = null;
  let labThemeId: string | null = null;

  function ensureLabStage(): BoardStage {
    labStage ??= createBoardStage(canvasRoot);
    const theme = savedBoardTheme();

    if (labThemeId !== theme.id) {
      labEnvironment?.dispose();
      labEnvironment = mountEnvironment(labStage, theme, boardArena);
      labThemeId = theme.id;
    }

    return labStage;
  }

  function mount(session: BattleLabSession, isReplay: boolean): void {
    activeScene?.dispose();

    if (session !== activeSession) {
      activeSession.dispose();
    }

    activeSession = session;
    activeIsReplay = isReplay;
    activeScene = createBattleLabScene(
      ensureLabStage(),
      hudRoot,
      statusEl,
      activeSession,
      handleReplay,
      handleReset,
      isReplay,
    );
  }

  function handleReplay(): void {
    const recording = activeSession.getRecording();

    if (recording === null) {
      return;
    }

    const { scenario, teams } = activeSession.peekSnapshot();
    mount(createPlaybackSession(recording, scenario, teams), true);
  }

  function handleReset(
    seed: number,
    scenario?: LabScenarioKind,
    teamAPicksByHero?: LabPicksByHero,
    teams?: LabTeams,
  ): void {
    if (activeIsReplay) {
      const current = activeSession.peekSnapshot();

      mount(
        createLocalBattleLabSession(seed, scenario ?? current.scenario, teamAPicksByHero, teams ?? current.teams),
        false,
      );

      return;
    }

    activeSession.reset(seed, scenario, teamAPicksByHero, teams);
  }

  function currentScenario(): LabScenario {
    const { seed, scenario, teams } = activeSession.peekSnapshot();

    return { version: 3, seed, scenario, teams };
  }

  exportButton.addEventListener("click", () => {
    errorEl.textContent = "";
    scenarioText.value = serializeScenario(currentScenario());
  });

  importButton.addEventListener("click", () => {
    try {
      const scenario = parseScenario(scenarioText.value);
      errorEl.textContent = "";
      mount(createLocalBattleLabSession(scenario.seed, scenario.scenario, new Map(), scenario.teams), false);
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : "invalid scenario";
    }
  });

  return {
    show() {
      if (activeScene === null) {
        mount(activeSession, activeIsReplay);
      }
    },

    hide() {
      activeScene?.dispose();
      activeScene = null;
    },
  };
}
