import type { BattleSnapshot, UnitState } from "@jev-game/game";
import { createArenaView, WORLD_TO_PIXELS } from "./arena-view.js";
import { createUnitView, type UnitView } from "./unit-view.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface BattleView {
  update(snapshot: BattleSnapshot, selectedUnitId: string | null): void;
  dispose(): void;
}

export function createBattleView(
  container: HTMLElement,
  arenaWidthUnits: number,
  arenaHeightUnits: number,
  onSelectUnit: (unitId: string) => void,
): BattleView {
  const arena = createArenaView(container, arenaWidthUnits, arenaHeightUnits);

  const linesLayer = document.createElementNS(SVG_NS, "svg");
  linesLayer.classList.add("lab-lines");
  linesLayer.setAttribute("width", String(arenaWidthUnits * WORLD_TO_PIXELS));
  linesLayer.setAttribute("height", String(arenaHeightUnits * WORLD_TO_PIXELS));
  arena.element.appendChild(linesLayer);

  const unitViews = new Map<string, UnitView>();

  function redrawTargetLines(units: readonly UnitState[]): void {
    while (linesLayer.firstChild !== null) {
      linesLayer.removeChild(linesLayer.firstChild);
    }

    for (const unit of units) {
      if (!unit.alive || unit.targetUnitId === null) {
        continue;
      }

      const target = units.find((candidate) => candidate.unitId === unit.targetUnitId);

      if (target === undefined || !target.alive) {
        continue;
      }

      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(unit.position.x * WORLD_TO_PIXELS));
      line.setAttribute("y1", String(unit.position.y * WORLD_TO_PIXELS));
      line.setAttribute("x2", String(target.position.x * WORLD_TO_PIXELS));
      line.setAttribute("y2", String(target.position.y * WORLD_TO_PIXELS));
      line.setAttribute("class", "lab-target-line");
      linesLayer.appendChild(line);
    }
  }

  return {
    update(snapshot, selectedUnitId) {
      const seenUnitIds = new Set<string>();

      for (const unit of snapshot.units) {
        seenUnitIds.add(unit.unitId);
        let view = unitViews.get(unit.unitId);

        if (view === undefined) {
          view = createUnitView(arena.element, onSelectUnit);
          unitViews.set(unit.unitId, view);
        }

        view.update(unit, unit.unitId === selectedUnitId);
      }

      for (const [unitId, view] of unitViews) {
        if (!seenUnitIds.has(unitId)) {
          view.dispose();
          unitViews.delete(unitId);
        }
      }

      redrawTargetLines(snapshot.units);
    },

    dispose() {
      for (const view of unitViews.values()) {
        view.dispose();
      }

      unitViews.clear();
      arena.dispose();
    },
  };
}
