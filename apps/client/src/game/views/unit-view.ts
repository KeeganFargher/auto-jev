import type { UnitState } from "@jev-game/game";
import { WORLD_TO_PIXELS } from "./arena-view.js";

export interface UnitView {
  update(unit: UnitState, isSelected: boolean): void;
  dispose(): void;
}

export function createUnitView(
  container: HTMLElement,
  onSelect: (unitId: string) => void,
): UnitView {
  let currentUnitId = "";

  const root = document.createElement("div");
  root.className = "lab-unit";

  const rangeRing = document.createElement("div");
  rangeRing.className = "lab-unit-range";
  root.appendChild(rangeRing);

  const body = document.createElement("div");
  body.className = "lab-unit-body";
  root.appendChild(body);

  const label = document.createElement("div");
  label.className = "lab-unit-label";
  root.appendChild(label);

  const healthTrack = document.createElement("div");
  healthTrack.className = "lab-unit-health-track";
  const healthFill = document.createElement("div");
  healthFill.className = "lab-unit-health-fill";
  healthTrack.appendChild(healthFill);
  root.appendChild(healthTrack);

  container.appendChild(root);

  function handleClick(): void {
    onSelect(currentUnitId);
  }

  root.addEventListener("click", handleClick);

  return {
    update(unit, isSelected) {
      currentUnitId = unit.unitId;
      root.style.left = `${unit.position.x * WORLD_TO_PIXELS}px`;
      root.style.top = `${unit.position.y * WORLD_TO_PIXELS}px`;
      root.classList.toggle("dead", !unit.alive);
      root.classList.toggle("selected", isSelected);
      root.dataset.team = unit.teamId;
      label.textContent = unit.unitId;
      healthFill.style.width = `${Math.max(0, unit.hp / unit.maxHp) * 100}%`;

      const rangeDiameter = unit.attackRangeUnits * 2 * WORLD_TO_PIXELS;
      rangeRing.style.display = isSelected ? "block" : "none";
      rangeRing.style.width = `${rangeDiameter}px`;
      rangeRing.style.height = `${rangeDiameter}px`;
    },

    dispose() {
      root.removeEventListener("click", handleClick);
      root.remove();
    },
  };
}
