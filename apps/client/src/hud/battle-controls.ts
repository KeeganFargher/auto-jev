import { bruiser } from "@jev-game/content";
import type { BattleLabSession, HeroOverrides } from "../session/types.js";

export interface BattleControlsView {
  dispose(): void;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;

function numberField(
  parent: HTMLElement,
  label: string,
  initialValue: number,
): HTMLInputElement {
  const wrapper = document.createElement("label");
  wrapper.className = "lab-field";
  wrapper.textContent = label;

  const input = document.createElement("input");
  input.type = "number";
  input.value = String(initialValue);
  input.min = "0";
  input.step = "1";
  wrapper.appendChild(input);
  parent.appendChild(wrapper);

  return input;
}

export function createBattleControlsView(
  container: HTMLElement,
  session: BattleLabSession,
): BattleControlsView {
  const root = document.createElement("div");
  root.className = "lab-controls";
  container.appendChild(root);

  const buttonRow = document.createElement("div");
  buttonRow.className = "lab-button-row";
  root.appendChild(buttonRow);

  const playButton = document.createElement("button");
  playButton.textContent = "Play";
  const pauseButton = document.createElement("button");
  pauseButton.textContent = "Pause";
  const stepButton = document.createElement("button");
  stepButton.textContent = "Step";
  const resetButton = document.createElement("button");
  resetButton.textContent = "Reset";
  buttonRow.append(playButton, pauseButton, stepButton, resetButton);

  const speedLabel = document.createElement("label");
  speedLabel.className = "lab-field";
  speedLabel.textContent = "Speed";
  const speedSelect = document.createElement("select");

  for (const speed of SPEED_OPTIONS) {
    const option = document.createElement("option");
    option.value = String(speed);
    option.textContent = `${speed}x`;

    if (speed === 1) {
      option.selected = true;
    }

    speedSelect.appendChild(option);
  }

  speedLabel.appendChild(speedSelect);
  root.appendChild(speedLabel);

  const seedInput = numberField(root, "Seed", 1);

  const statsFieldset = document.createElement("fieldset");
  statsFieldset.className = "lab-stats";
  const legend = document.createElement("legend");
  legend.textContent = "Bruiser stats (applied on next reset)";
  statsFieldset.appendChild(legend);
  root.appendChild(statsFieldset);

  const maxHpInput = numberField(statsFieldset, "Max HP", bruiser.maxHp);
  const attackDamageInput = numberField(statsFieldset, "Attack damage", bruiser.attackDamage);
  const attackRangeInput = numberField(statsFieldset, "Attack range", bruiser.attackRangeUnits);

  const attackIntervalInput = numberField(
    statsFieldset,
    "Attack interval (ticks)",
    bruiser.attackIntervalTicks,
  );

  const moveSpeedInput = numberField(
    statsFieldset,
    "Move speed",
    bruiser.moveSpeedUnitsPerSecond,
  );

  function readOverrides(): HeroOverrides {
    return {
      maxHp: Number(maxHpInput.value),
      attackDamage: Number(attackDamageInput.value),
      attackRangeUnits: Number(attackRangeInput.value),
      attackIntervalTicks: Number(attackIntervalInput.value),
      moveSpeedUnitsPerSecond: Number(moveSpeedInput.value),
    };
  }

  function handlePlay(): void {
    session.play();
  }

  function handlePause(): void {
    session.pause();
  }

  function handleStep(): void {
    session.stepOnce();
  }

  function handleReset(): void {
    session.reset(Number(seedInput.value), readOverrides());
  }

  function handleSpeedChange(): void {
    session.setSpeed(Number(speedSelect.value));
  }

  playButton.addEventListener("click", handlePlay);
  pauseButton.addEventListener("click", handlePause);
  stepButton.addEventListener("click", handleStep);
  resetButton.addEventListener("click", handleReset);
  speedSelect.addEventListener("change", handleSpeedChange);

  return {
    dispose() {
      playButton.removeEventListener("click", handlePlay);
      pauseButton.removeEventListener("click", handlePause);
      stepButton.removeEventListener("click", handleStep);
      resetButton.removeEventListener("click", handleReset);
      speedSelect.removeEventListener("change", handleSpeedChange);
      root.remove();
    },
  };
}
