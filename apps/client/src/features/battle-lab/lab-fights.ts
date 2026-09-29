import type { HeroDefinitionId } from "@jev-game/game";
import { gameCatalogue, LAB_PRESETS, labPreset, type LabPreset } from "@jev-game/content";
import { heroName } from "../../game/catalogues.js";
import { createLabSession, recordLabFight } from "../../session/lab-session.js";
import type { BattleLabSession, LabFight, LabTeams } from "../../session/types.js";

export type TeamSide = keyof LabTeams;

export const TEAM_SIDES: readonly TeamSide[] = ["a", "b"];

export const SPEED_OPTIONS: readonly number[] = [0.25, 0.5, 1, 2, 4];

export const CUSTOM_PRESET_ID = "custom";

export const LAB_FRIENDLY_TEAM_ID = "A";

const OPENING_PRESET = "full-chain";

const OPENING_SEED = 1;

export const LAB_HEROES: readonly HeroDefinitionId[] = Object.keys(gameCatalogue.heroes).sort(
  (a, b) => heroName(a).localeCompare(heroName(b)),
);

export function sameTeam(
  left: readonly HeroDefinitionId[],
  right: readonly HeroDefinitionId[],
): boolean {
  return left.length === right.length && left.every((heroId, index) => heroId === right[index]);
}

export function presetFor(teams: LabTeams): LabPreset | null {
  return (
    LAB_PRESETS.find(
      (preset) => sameTeam(preset.teamA, teams.a) && sameTeam(preset.teamB, teams.b),
    ) ?? null
  );
}

export function teamsOfPreset(presetId: string): LabTeams {
  const preset = labPreset(presetId);

  return { a: preset.teamA, b: preset.teamB };
}

export function labFightName(fight: LabFight): string {
  return presetFor(fight.teams)?.name ?? "custom teams";
}

export function openingFight(): LabFight {
  return { seed: OPENING_SEED, teams: teamsOfPreset(OPENING_PRESET) };
}

export function startSession(fight: LabFight): BattleLabSession {
  return createLabSession(fight, recordLabFight(fight));
}

export function replaySession(session: BattleLabSession): BattleLabSession {
  return createLabSession(session.fight(), session.recording());
}

export function editTeam(
  teams: LabTeams,
  side: TeamSide,
  team: readonly HeroDefinitionId[],
): LabTeams {
  return side === "a" ? { a: team, b: teams.b } : { a: teams.a, b: team };
}

export function parseSeed(text: string): number {
  const seed = Number(text);

  if (text.trim() === "" || !Number.isInteger(seed)) {
    throw new Error(`seed must be an integer, got "${text}"`);
  }

  return seed;
}
