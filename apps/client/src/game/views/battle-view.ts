import { distance, type BattleSnapshot, type UnitState } from "@jev-game/game";
import { createArenaView } from "./arena-view.js";
import { drawTargetLine, drawUnit } from "./unit-view.js";

const CLICK_TOLERANCE_PIXELS = 14;

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
  let latestSnapshot: BattleSnapshot | null = null;
  let latestSelectedUnitId: string | null = null;

  function render(): void {
    if (latestSnapshot === null) {
      return;
    }

    const transform = arena.getTransform();
    arena.drawFloor();

    for (const unit of latestSnapshot.units) {
      if (!unit.alive || unit.targetUnitId === null) {
        continue;
      }

      const target = latestSnapshot.units.find(
        (candidate) => candidate.unitId === unit.targetUnitId,
      );

      if (target === undefined || !target.alive) {
        continue;
      }

      drawTargetLine(arena.ctx, unit, target, transform);
    }

    for (const unit of latestSnapshot.units) {
      drawUnit(arena.ctx, unit, unit.unitId === latestSelectedUnitId, transform);
    }
  }

  const arena = createArenaView(container, arenaWidthUnits, arenaHeightUnits, render);

  function handleClick(event: MouseEvent): void {
    if (latestSnapshot === null) {
      return;
    }

    const rect = arena.canvas.getBoundingClientRect();
    const transform = arena.getTransform();

    const worldPoint = transform.canvasToWorld({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });

    let closest: UnitState | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const unit of latestSnapshot.units) {
      const candidateDistance = distance(unit.position, worldPoint);

      if (candidateDistance < closestDistance) {
        closest = unit;
        closestDistance = candidateDistance;
      }
    }

    const toleranceWorldUnits = CLICK_TOLERANCE_PIXELS / transform.scale;

    if (closest !== null && closestDistance <= toleranceWorldUnits) {
      onSelectUnit(closest.unitId);
    }
  }

  arena.canvas.addEventListener("click", handleClick);

  return {
    update(snapshot, selectedUnitId) {
      latestSnapshot = snapshot;
      latestSelectedUnitId = selectedUnitId;
      render();
    },

    dispose() {
      arena.canvas.removeEventListener("click", handleClick);
      arena.dispose();
    },
  };
}
