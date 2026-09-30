import type { UnitState } from "@jev-game/game";

export function pullerOf(unit: UnitState, unitById: (unitId: string) => UnitState): string | null {
  const motion = unit.motion;

  if (motion.kind !== "skid") {
    return null;
  }

  const maker = unitById(motion.makerUnitId);

  return maker.signature?.kind === "collection-day" ? maker.unitId : null;
}
