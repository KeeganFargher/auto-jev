import "./style.css";
import { createLocalBattleLabSession } from "./session/local-session.js";
import { createBattleLabScene } from "./game/scenes/battle-lab-scene.js";
import { parseScenario, serializeScenario, type LabScenario } from "./dev/scenario-editor.js";

const canvasRoot = document.getElementById("lab-canvas-root")!;

const hudRoot = document.getElementById("lab-hud")!;

const statusEl = document.getElementById("lab-status")!;

const scenarioText = document.querySelector<HTMLTextAreaElement>("#lab-scenario-text")!;

const exportButton = document.getElementById("lab-scenario-export")!;

const importButton = document.getElementById("lab-scenario-import")!;

const errorEl = document.getElementById("lab-scenario-error")!;

const scenarioDetails = document.getElementById("lab-scenario")!;

scenarioDetails.addEventListener("toggle", () => {
  window.dispatchEvent(new Event("resize"));
});

const session = createLocalBattleLabSession(1);

createBattleLabScene(canvasRoot, hudRoot, statusEl, session);

function currentScenario(): LabScenario {
  const view = session.getView();
  const unit = view.snapshot.units[0];

  return {
    version: 1,
    seed: view.seed,
    heroOverrides: {
      maxHp: unit?.maxHp ?? 0,
      attackDamage: unit?.attackDamage ?? 0,
      attackRangeUnits: unit?.attackRangeUnits ?? 0,
      attackIntervalTicks: unit?.attackIntervalTicks ?? 0,
      moveSpeedUnitsPerSecond: unit?.moveSpeedUnitsPerSecond ?? 0,
    },
  };
}

exportButton.addEventListener("click", () => {
  errorEl.textContent = "";
  scenarioText.value = serializeScenario(currentScenario());
});

importButton.addEventListener("click", () => {
  try {
    const scenario = parseScenario(scenarioText.value);
    errorEl.textContent = "";
    session.reset(scenario.seed, scenario.heroOverrides);
  } catch (error) {
    errorEl.textContent = error instanceof Error ? error.message : "invalid scenario";
  }
});
