import "./style.css";
import { createLocalBattleLabSession } from "./session/local-session.js";
import { createPlaybackSession } from "./session/playback-session.js";
import { createBattleLabScene, type BattleLabScene } from "./game/scenes/battle-lab-scene.js";
import { parseScenario, serializeScenario, type LabScenario } from "./dev/scenario-editor.js";
import type { BattleLabSession, LabScenarioKind } from "./session/types.js";

const canvasRoot = document.getElementById("lab-canvas-root")!;

const hudRoot = document.getElementById("lab-hud")!;

const statusEl = document.getElementById("lab-status")!;

const scenarioText = document.querySelector<HTMLTextAreaElement>("#lab-scenario-text")!;

const exportButton = document.getElementById("lab-scenario-export")!;

const importButton = document.getElementById("lab-scenario-import")!;

const errorEl = document.getElementById("lab-scenario-error")!;

let activeSession: BattleLabSession = createLocalBattleLabSession(1);

let activeScene: BattleLabScene | null = null;

let activeIsReplay = false;

function mount(session: BattleLabSession, isReplay: boolean): void {
  activeScene?.dispose();

  if (session !== activeSession) {
    activeSession.dispose();
  }

  activeSession = session;
  activeIsReplay = isReplay;
  activeScene = createBattleLabScene(
    canvasRoot,
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

  const { scenario } = activeSession.peekSnapshot();
  mount(createPlaybackSession(recording, scenario), true);
}

function handleReset(seed: number, scenario?: LabScenarioKind): void {
  if (activeIsReplay) {
    mount(createLocalBattleLabSession(seed, scenario ?? activeSession.peekSnapshot().scenario), false);

    return;
  }

  activeSession.reset(seed, scenario);
}

mount(activeSession, false);

function currentScenario(): LabScenario {
  const { seed, scenario } = activeSession.peekSnapshot();

  return { version: 2, seed, scenario };
}

exportButton.addEventListener("click", () => {
  errorEl.textContent = "";
  scenarioText.value = serializeScenario(currentScenario());
});

importButton.addEventListener("click", () => {
  try {
    const scenario = parseScenario(scenarioText.value);
    errorEl.textContent = "";
    mount(createLocalBattleLabSession(scenario.seed, scenario.scenario), false);
  } catch (error) {
    errorEl.textContent = error instanceof Error ? error.message : "invalid scenario";
  }
});
