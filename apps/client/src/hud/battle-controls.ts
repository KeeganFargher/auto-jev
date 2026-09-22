import type { HeroDefinitionId } from "@jev-game/game";
import type { BattleLabSession, LabScenarioKind, TeamAUpgradeIdsByHero } from "../session/types.js";
import { createUpgradePickerView } from "./upgrade-picker.js";

export interface BattleControlsView {
  dispose(): void;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;

const SCENARIO_OPTIONS: readonly { value: LabScenarioKind; label: string }[] = [
  { value: "three-vs-three", label: "three vs three" },
  { value: "duel", label: "duel" },
];

const SCENARIO_TEAM_A_HEROES: Record<LabScenarioKind, readonly HeroDefinitionId[]> = {
  "three-vs-three": ["bruiser", "ranger", "support"],
  duel: ["bruiser"],
};

function isScenarioKind(value: string): value is LabScenarioKind {
  return SCENARIO_OPTIONS.some((option) => option.value === value);
}

function iconButton(parent: HTMLElement, glyph: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "hud-icon-button";
  button.textContent = glyph;
  button.title = label;
  button.setAttribute("aria-label", label);
  parent.appendChild(button);

  return button;
}

function numberField(parent: HTMLElement, label: string, initialValue: number): HTMLInputElement {
  const wrapper = document.createElement("label");
  wrapper.className = "hud-field";

  const caption = document.createElement("span");
  caption.textContent = label;
  wrapper.appendChild(caption);

  const input = document.createElement("input");
  input.type = "number";
  input.value = String(initialValue);
  input.min = "0";
  input.step = "1";
  wrapper.appendChild(input);
  parent.appendChild(wrapper);

  return input;
}

function scenarioField(
  parent: HTMLElement,
  initialValue: LabScenarioKind,
): HTMLSelectElement {
  const wrapper = document.createElement("label");
  wrapper.className = "hud-field";

  const caption = document.createElement("span");
  caption.textContent = "scenario";
  wrapper.appendChild(caption);

  const select = document.createElement("select");

  for (const option of SCENARIO_OPTIONS) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;

    if (option.value === initialValue) {
      element.selected = true;
    }

    select.appendChild(element);
  }

  wrapper.appendChild(select);
  parent.appendChild(wrapper);

  return select;
}

export function createBattleControlsView(
  barContainer: HTMLElement,
  tuningContainer: HTMLElement,
  upgradesContainer: HTMLElement,
  session: BattleLabSession,
  onReplay: () => void,
  onReset: (seed: number, scenario?: LabScenarioKind, teamAUpgradeIdsByHero?: TeamAUpgradeIdsByHero) => void,
): BattleControlsView {
  const playButton = iconButton(barContainer, "▶", "Play");
  const pauseButton = iconButton(barContainer, "‖", "Pause");
  const stepButton = iconButton(barContainer, "▶‖", "Step one tick");
  const resetButton = iconButton(barContainer, "↻", "Reset");
  const replayButton = iconButton(barContainer, "⏮", "Replay last recording");

  const speedGroup = document.createElement("div");
  speedGroup.className = "hud-speed";
  barContainer.appendChild(speedGroup);

  const speedButtons: HTMLButtonElement[] = [];

  for (const speed of SPEED_OPTIONS) {
    const chip = document.createElement("button");
    chip.className = "hud-chip";
    chip.textContent = `${speed}x`;

    if (speed === 1) {
      chip.classList.add("is-active");
    }

    chip.addEventListener("click", () => {
      session.setSpeed(speed);

      for (const other of speedButtons) {
        other.classList.remove("is-active");
      }

      chip.classList.add("is-active");
    });

    speedGroup.appendChild(chip);
    speedButtons.push(chip);
  }

  const fields = document.createElement("div");
  fields.className = "hud-fields";
  tuningContainer.appendChild(fields);

  const initial = session.peekSnapshot();
  const seedInput = numberField(fields, "seed", initial.seed);
  const scenarioSelect = scenarioField(fields, initial.scenario);

  const upgradePicker = createUpgradePickerView(upgradesContainer, () => {});
  upgradePicker.render(SCENARIO_TEAM_A_HEROES[initial.scenario]);

  scenarioSelect.addEventListener("change", () => {
    const selected = scenarioSelect.value;

    if (isScenarioKind(selected)) {
      upgradePicker.render(SCENARIO_TEAM_A_HEROES[selected]);
    }
  });

  playButton.addEventListener("click", () => {
    session.play();
  });

  pauseButton.addEventListener("click", () => {
    session.pause();
  });

  stepButton.addEventListener("click", () => {
    session.stepOnce();
  });

  resetButton.addEventListener("click", () => {
    const selected = scenarioSelect.value;
    onReset(
      Number(seedInput.value),
      isScenarioKind(selected) ? selected : undefined,
      upgradePicker.getSelection(),
    );
  });

  replayButton.addEventListener("click", onReplay);

  return {
    dispose() {
      playButton.remove();
      pauseButton.remove();
      stepButton.remove();
      resetButton.remove();
      replayButton.remove();
      speedGroup.remove();
      fields.remove();
      upgradePicker.dispose();
    },
  };
}
