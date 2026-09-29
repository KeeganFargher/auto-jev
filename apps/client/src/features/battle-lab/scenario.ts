import type { HeroDefinitionId } from "@jev-game/game";
import { gameCatalogue, MAX_LAB_TEAM_SIZE } from "@jev-game/content";
import type { LabFight } from "../../session/types.js";

const SCENARIO_VERSION = 4;

function isScenarioLike(
  value: unknown,
): value is { version: unknown; seed: unknown; teams: unknown } {
  return value instanceof Object && "version" in value && "seed" in value && "teams" in value;
}

function isTeamsLike(value: unknown): value is { a: unknown[]; b: unknown[] } {
  return (
    value instanceof Object &&
    "a" in value &&
    "b" in value &&
    Array.isArray(value.a) &&
    Array.isArray(value.b)
  );
}

function isSeed(value: unknown): value is number {
  return Number.isInteger(value);
}

function heroTeam(names: readonly string[], side: string): HeroDefinitionId[] {
  if (names.length === 0 || names.length > MAX_LAB_TEAM_SIZE) {
    throw new Error(`team ${side} needs 1 to ${MAX_LAB_TEAM_SIZE} heroes`);
  }

  for (const name of names) {
    if (!Object.hasOwn(gameCatalogue.heroes, name)) {
      throw new Error(`team ${side} has an unknown hero "${name}"`);
    }
  }

  return [...names];
}

export function serializeFight(fight: LabFight): string {
  return JSON.stringify(
    { version: SCENARIO_VERSION, seed: fight.seed, teams: fight.teams },
    null,
    2,
  );
}

export function parseFight(json: string): LabFight {
  const parsed: unknown = JSON.parse(json);

  if (!isScenarioLike(parsed)) {
    throw new Error("scenario is missing version, seed or teams fields");
  }

  if (parsed.version !== SCENARIO_VERSION) {
    throw new Error(`unsupported scenario version "${String(parsed.version)}"`);
  }

  if (!isSeed(parsed.seed)) {
    throw new Error(`scenario seed must be an integer, got "${String(parsed.seed)}"`);
  }

  if (!isTeamsLike(parsed.teams)) {
    throw new Error("scenario teams need an a and a b list");
  }

  return {
    seed: parsed.seed,
    teams: {
      a: heroTeam(
        parsed.teams.a.map((entry) => String(entry)),
        "a",
      ),
      b: heroTeam(
        parsed.teams.b.map((entry) => String(entry)),
        "b",
      ),
    },
  };
}
