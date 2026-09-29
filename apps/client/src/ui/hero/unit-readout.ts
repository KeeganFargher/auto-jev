import {
  TICK_RATE,
  type BattleSnapshot,
  type HeroDefinitionId,
  type UnitState,
} from "@jev-game/game";
import { statusEndTick, unitStatuses, type UnitStatusKind } from "../../game/unit-status.js";

export interface StatusReadout {
  status: UnitStatusKind;
  seconds: string;
}

export interface UnitReadout {
  unitId: string;
  heroId: HeroDefinitionId;
  team: "friendly" | "enemy";
  alive: boolean;
  hp: number;
  maxHp: number;
  mana: number | null;
  maxMana: number;
  damageDealt: number;
  statuses: readonly StatusReadout[];
}

function secondsLeft(endTick: number, tick: number): string {
  return `${Math.max(0, (endTick - tick) / TICK_RATE).toFixed(1)}s`;
}

export function unitIn(snapshot: BattleSnapshot, unitId: string): UnitState {
  const unit = snapshot.units.find((candidate) => candidate.unitId === unitId);

  if (unit === undefined) {
    throw new Error(`Snapshot at tick ${snapshot.tick} has no unit ${unitId}`);
  }

  return unit;
}

export function readUnit(
  snapshot: BattleSnapshot,
  unit: UnitState,
  friendlyTeamId: string,
): UnitReadout {
  return {
    unitId: unit.unitId,
    heroId: unit.heroId,
    team: unit.teamId === friendlyTeamId ? "friendly" : "enemy",
    alive: unit.alive,
    hp: unit.hp,
    maxHp: unit.maxHp,
    mana: unit.signature === null ? null : Math.floor(unit.mana),
    maxMana: unit.maxMana,
    damageDealt: unit.damageDealt,
    statuses: unitStatuses(snapshot, unit).map((status) => ({
      status,
      seconds: secondsLeft(statusEndTick(snapshot, unit, status), snapshot.tick),
    })),
  };
}

export function sameReadout(previous: UnitReadout | null, next: UnitReadout | null): boolean {
  if (previous === null || next === null) {
    return previous === next;
  }

  return (
    previous.unitId === next.unitId &&
    previous.heroId === next.heroId &&
    previous.team === next.team &&
    previous.alive === next.alive &&
    previous.hp === next.hp &&
    previous.maxHp === next.maxHp &&
    previous.mana === next.mana &&
    previous.maxMana === next.maxMana &&
    previous.damageDealt === next.damageDealt &&
    previous.statuses.length === next.statuses.length &&
    previous.statuses.every(
      (status, index) =>
        status.status === next.statuses[index]?.status &&
        status.seconds === next.statuses[index]?.seconds,
    )
  );
}
