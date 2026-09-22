import { distance, type BattleEvent, type BattleSnapshot, type UnitState } from "@jev-game/game";
import { createArenaView } from "./arena-view.js";
import {
  DAMAGE_CUE_COLOR,
  HEAL_CUE_COLOR,
  SHIELD_CUE_COLOR,
  drawCastCue,
  drawTargetLine,
  drawUnit,
} from "./unit-view.js";

const CLICK_TOLERANCE_PIXELS = 14;

const CAST_CUE_TICKS = 10;

export interface BattleView {
  update(snapshot: BattleSnapshot, selectedUnitId: string | null, latestEvents: readonly BattleEvent[]): void;
  dispose(): void;
}

interface RecentCastCue {
  targetUnitId: string;
  tick: number;
  color: string;
}

function colorForEffectEvent(event: BattleEvent): string | null {
  if (event.kind === "damage-dealt") {
    return DAMAGE_CUE_COLOR;
  }

  if (event.kind === "healing-done") {
    return HEAL_CUE_COLOR;
  }

  if (event.kind === "shield-applied") {
    return SHIELD_CUE_COLOR;
  }

  return null;
}

export function createBattleView(
  container: HTMLElement,
  arenaWidthUnits: number,
  arenaHeightUnits: number,
  onSelectUnit: (unitId: string) => void,
): BattleView {
  let latestSnapshot: BattleSnapshot | null = null;
  let latestSelectedUnitId: string | null = null;
  let recentCastCues: RecentCastCue[] = [];

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

    for (const cue of recentCastCues) {
      const target = latestSnapshot.units.find((candidate) => candidate.unitId === cue.targetUnitId);

      if (target === undefined) {
        continue;
      }

      const age = latestSnapshot.tick - cue.tick;
      drawCastCue(arena.ctx, target.position, cue.color, 1 - age / CAST_CUE_TICKS, transform);
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
    update(snapshot, selectedUnitId, latestEvents) {
      latestSnapshot = snapshot;
      latestSelectedUnitId = selectedUnitId;

      for (const event of latestEvents) {
        const color = colorForEffectEvent(event);

        if (color !== null && "targetUnitId" in event) {
          recentCastCues.push({ targetUnitId: event.targetUnitId, tick: event.tick, color });
        }
      }

      recentCastCues = recentCastCues.filter((cue) => snapshot.tick - cue.tick < CAST_CUE_TICKS);
      render();
    },

    dispose() {
      arena.canvas.removeEventListener("click", handleClick);
      arena.dispose();
    },
  };
}
