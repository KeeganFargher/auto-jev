import type { LabScenarioKind } from "../session/types.js";

export interface LabScenario {
  version: 2;
  seed: number;
  scenario: LabScenarioKind;
}

const SCENARIO_KINDS: readonly LabScenarioKind[] = ["duel", "three-vs-three"];

function isScenarioLike(
  value: unknown,
): value is { version: unknown; seed: unknown; scenario: unknown } {
  return value instanceof Object && "version" in value && "seed" in value && "scenario" in value;
}

function isFiniteNumber(value: unknown): value is number {
  return Number.isFinite(value);
}

function isScenarioKind(value: unknown): value is LabScenarioKind {
  return SCENARIO_KINDS.some((kind) => kind === value);
}

export function serializeScenario(scenario: LabScenario): string {
  return JSON.stringify(scenario, null, 2);
}

export function parseScenario(json: string): LabScenario {
  const parsed: unknown = JSON.parse(json);

  if (!isScenarioLike(parsed)) {
    throw new Error("scenario is missing version, seed, or scenario fields");
  }

  if (parsed.version !== 2) {
    throw new Error(`unsupported scenario version "${String(parsed.version)}"`);
  }

  if (!isScenarioKind(parsed.scenario)) {
    throw new Error(`unknown scenario "${String(parsed.scenario)}"`);
  }

  if (!isFiniteNumber(parsed.seed)) {
    throw new Error(`scenario seed must be a finite number, got "${String(parsed.seed)}"`);
  }

  return {
    version: 2,
    seed: parsed.seed,
    scenario: parsed.scenario,
  };
}
