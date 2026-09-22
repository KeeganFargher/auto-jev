import type { ArenaDefinitionId, HeroDefinitionId } from "./ids.js";

export interface HeroDefinition {
  id: HeroDefinitionId;
  name: string;
  maxHp: number;
  attackDamage: number;
  attackRangeUnits: number;
  attackIntervalTicks: number;
  moveSpeedUnitsPerSecond: number;
}

export interface ArenaDefinition {
  id: ArenaDefinitionId;
  name: string;
  width: number;
  height: number;
}

export interface Catalogue {
  heroes: Record<HeroDefinitionId, HeroDefinition>;
  arenas: Record<ArenaDefinitionId, ArenaDefinition>;
}
