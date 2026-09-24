import type { HeroDefinitionId } from "@jev-game/game";
import { gameCatalogue, MAX_LAB_TEAM_SIZE } from "@jev-game/content";
import type { LabScenarioKind, LabTeams } from "../session/types.js";

export interface LabScenario {
  version: 3;
  seed: number;
  scenario: LabScenarioKind;
  teams: LabTeams;
}

const SCENARIO_KINDS: readonly LabScenarioKind[] = ["duel", "three-vs-three", "custom"];

function isScenarioLike(
  value: unknown,
): value is { version: unknown; seed: unknown; scenario: unknown; teams: unknown } {
  return value instanceof Object && "version" in value && "seed" in value && "scenario" in value && "teams" in value;
}

function isFiniteNumber(value: unknown): value is number {
  return Number.isFinite(value);
}

function isScenarioKind(value: unknown): value is LabScenarioKind {
  return SCENARIO_KINDS.some((kind) => kind === value);
}

function isTeamsLike(value: unknown): value is { a: unknown[]; b: unknown[] } {
  return value instanceof Object && "a" in value && "b" in value && Array.isArray(value.a) && Array.isArray(value.b);
}

function heroTeam(names: readonly string[], side: string): HeroDefinitionId[] {
  if (names.length === 0 || names.length > MAX_LAB_TEAM_SIZE) {
    throw new Error(`team ${side} needs 1 to ${MAX_LAB_TEAM_SIZE} heroes`);
  }

  const heroes: HeroDefinitionId[] = [];

  for (const name of names) {
    const hero = gameCatalogue.heroes[name];

    if (hero === undefined || hero.summon === true) {
      throw new Error(`team ${side} has an unknown hero "${name}"`);
    }

    if (heroes.includes(hero.id)) {
      throw new Error(`team ${side} has "${hero.id}" twice`);
    }

    heroes.push(hero.id);
  }

  return heroes;
}

export function serializeScenario(scenario: LabScenario): string {
  return JSON.stringify(scenario, null, 2);
}

export function parseScenario(json: string): LabScenario {
  const parsed: unknown = JSON.parse(json);

  if (!isScenarioLike(parsed)) {
    throw new Error("scenario is missing version, seed, scenario or teams fields");
  }

  if (parsed.version !== 3) {
    throw new Error(`unsupported scenario version "${String(parsed.version)}"`);
  }

  if (!isScenarioKind(parsed.scenario)) {
    throw new Error(`unknown scenario "${String(parsed.scenario)}"`);
  }

  if (!isFiniteNumber(parsed.seed)) {
    throw new Error(`scenario seed must be a finite number, got "${String(parsed.seed)}"`);
  }

  if (!isTeamsLike(parsed.teams)) {
    throw new Error("scenario teams need an a and a b list");
  }

  return {
    version: 3,
    seed: parsed.seed,
    scenario: parsed.scenario,
    teams: {
      a: heroTeam(parsed.teams.a.map((entry) => String(entry)), "a"),
      b: heroTeam(parsed.teams.b.map((entry) => String(entry)), "b"),
    },
  };
}
