import type { HeroOverrides } from "../session/types.js";

export interface LabScenario {
  version: 1;
  seed: number;
  heroOverrides: HeroOverrides;
}

export function serializeScenario(scenario: LabScenario): string {
  return JSON.stringify(scenario, null, 2);
}

export function parseScenario(json: string): LabScenario {
  const parsed = JSON.parse(json);

  if (parsed.version !== 1) {
    throw new Error(`unsupported scenario version "${String(parsed.version)}"`);
  }

  const overrides = parsed.heroOverrides;

  return {
    version: 1,
    seed: Number(parsed.seed),
    heroOverrides: {
      maxHp: Number(overrides.maxHp),
      attackDamage: Number(overrides.attackDamage),
      attackRangeUnits: Number(overrides.attackRangeUnits),
      attackIntervalTicks: Number(overrides.attackIntervalTicks),
      moveSpeedUnitsPerSecond: Number(overrides.moveSpeedUnitsPerSecond),
    },
  };
}
