import { bruiser } from "@jev-game/content";
import type { BattleLabSession, HeroOverrides } from "../session/types.js";

export interface BattleControlsView {
  dispose(): void;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;

function iconButton(parent: HTMLElement, glyph: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "hud-icon-button";
  button.textContent = glyph;
  button.title = label;
  button.setAttribute("aria-label", label);
  parent.appendChild(button);

  return button;
}

function numberField(
  parent: HTMLElement,
  label: string,
  initialValue: number,
): HTMLInputElement {
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

export function createBattleControlsView(
  barContainer: HTMLElement,
  tuningContainer: HTMLElement,
  session: BattleLabSession,
): BattleControlsView {
  const playButton = iconButton(barContainer, "▶", "Play");
  const pauseButton = iconButton(barContainer, "‖", "Pause");
  const stepButton = iconButton(barContainer, "▶‖", "Step one tick");
  const resetButton = iconButton(barContainer, "↻", "Reset");

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

  const seedInput = numberField(fields, "seed", 1);
  const maxHpInput = numberField(fields, "max hp", bruiser.maxHp);
  const attackDamageInput = numberField(fields, "attack damage", bruiser.attackDamage);
  const attackRangeInput = numberField(fields, "attack range", bruiser.attackRangeUnits);

  const attackIntervalInput = numberField(
    fields,
    "attack interval",
    bruiser.attackIntervalTicks,
  );

  const moveSpeedInput = numberField(fields, "move speed", bruiser.moveSpeedUnitsPerSecond);

  function readOverrides(): HeroOverrides {
    return {
      maxHp: Math.round(Number(maxHpInput.value)),
      attackDamage: Math.round(Number(attackDamageInput.value)),
      attackRangeUnits: Number(attackRangeInput.value),
      attackIntervalTicks: Math.round(Number(attackIntervalInput.value)),
      moveSpeedUnitsPerSecond: Number(moveSpeedInput.value),
    };
  }

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
    session.reset(Number(seedInput.value), readOverrides());
  });

  return {
    dispose() {
      playButton.remove();
      pauseButton.remove();
      stepButton.remove();
      resetButton.remove();
      speedGroup.remove();
      fields.remove();
    },
  };
}
