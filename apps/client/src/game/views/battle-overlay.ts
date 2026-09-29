import { createStore, type Store } from "../../state/store.js";
import type { UnitStatusKind } from "../unit-status.js";
import { createAnchors, type Anchors } from "./anchors.js";
import type { ScreenPoint } from "./board-stage.js";

export type FloatKind = "heal" | "big" | "huge" | "crit";

export interface ChainModel {
  count: number;
  serial: number;
  flourish: boolean;
}

export interface PlateModel {
  unitId: string;
  friendly: boolean;
  label: string | null;
  alive: boolean;
  segment: number;
  hp: number;
  mana: number | null;
  manaFull: boolean;
  statuses: readonly UnitStatusKind[];
  chain: ChainModel | null;
}

export interface FloatModel {
  id: number;
  text: string;
  kind: FloatKind;
  side: number;
}

export interface BattleOverlay {
  readonly plates: Store<readonly PlateModel[]>;
  readonly numbers: Store<readonly FloatModel[]>;
  readonly anchors: Anchors<ScreenPoint>;
  reset(): void;
}

export function plateKey(unitId: string): string {
  return `plate:${unitId}`;
}

export function floatKey(id: number): string {
  return `float:${id}`;
}

function sameStatuses(
  first: readonly UnitStatusKind[],
  second: readonly UnitStatusKind[],
): boolean {
  return first.length === second.length && first.every((kind, index) => kind === second[index]);
}

function sameChain(first: ChainModel | null, second: ChainModel | null): boolean {
  if (first === null || second === null) {
    return first === second;
  }

  return first.serial === second.serial && first.count === second.count;
}

export function samePlate(first: PlateModel, second: PlateModel): boolean {
  return (
    first.unitId === second.unitId &&
    first.friendly === second.friendly &&
    first.label === second.label &&
    first.alive === second.alive &&
    first.segment === second.segment &&
    first.hp === second.hp &&
    first.mana === second.mana &&
    first.manaFull === second.manaFull &&
    sameStatuses(first.statuses, second.statuses) &&
    sameChain(first.chain, second.chain)
  );
}

export function createBattleOverlay(): BattleOverlay {
  const plates = createStore<readonly PlateModel[]>([]);
  const numbers = createStore<readonly FloatModel[]>([]);
  const anchors = createAnchors<ScreenPoint>();

  return {
    plates,
    numbers,
    anchors,

    reset() {
      plates.set([]);
      numbers.set([]);
      anchors.clear();
    },
  };
}
