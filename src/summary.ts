import { heroDefinition } from "./heroes.js";
import { relicById, skillById } from "./progression.js";
import type { CampaignState } from "./types.js";

export interface RunSummary {
  title: string; winnerId: string | null; winnerName: string; turns: number; reason: string;
  strongestJev: string; largestBattle: string; deadliestFaction: string; turningPoint: string;
  builds: Array<{ factionId: string; name: string; colour: string; entries: string[] }>;
  timeline: Array<{ turn: number; text: string }>;
}

/** Turns a finished campaign into the story it produced, which is the point of watching one. */
export function summarise(state: CampaignState, events: Array<{ turn: number; text: string; importance: number }>): RunSummary {
  const winner = state.factions.find((faction) => faction.id === state.status.winnerId);
  const lords = state.factions.flatMap((faction) => faction.lords.map((lord) => ({ lord, faction })));
  const best = [...lords].sort((left, right) => right.lord.kills - left.lord.kills)[0];
  const biggest = [...state.battles].sort((left, right) => (right.attackerLosses + right.defenderLosses) - (left.attackerLosses + left.defenderLosses))[0];
  const province = biggest === undefined ? undefined : state.provinces.find((entry) => entry.id === biggest.provinceId);
  const deadliest = [...state.factions].sort((left, right) => right.lords.reduce((sum, lord) => sum + lord.kills, 0) - left.lords.reduce((sum, lord) => sum + lord.kills, 0))[0];
  // The turning point is the biggest upset, or failing that the first capital to fall.
  const upset = [...state.battles].sort((left, right) => {
    const swing = (battle: typeof left): number => battle.outcome === "defender" ? battle.prediction : 1 - battle.prediction;
    return swing(right) - swing(left);
  })[0];
  const upsetProvince = upset === undefined ? undefined : state.provinces.find((entry) => entry.id === upset.provinceId);
  return {
    title: winner === undefined ? "A war without a victor" : `The rise of ${winner.name}`,
    winnerId: state.status.winnerId, winnerName: winner?.name ?? "Nobody",
    turns: state.turn, reason: state.status.reason,
    strongestJev: best === undefined ? "—" : `${heroDefinition(best.lord.heroId).name} of ${best.faction.name} · ${best.lord.kills} kills, level ${best.lord.level}`,
    largestBattle: biggest === undefined ? "—" : `${province?.name ?? "the field"} · ${biggest.attackerLosses + biggest.defenderLosses} fallen`,
    deadliestFaction: deadliest?.name ?? "—",
    turningPoint: upset === undefined || upsetProvince === undefined ? "—" : `${upset.summary} (turn ${upset.turn})`,
    builds: state.factions.map((faction) => {
      const lord = faction.lords.find((entry) => entry.condition !== "dead") ?? faction.lords[0];
      const skills = lord === undefined ? [] : lord.skills.map((id) => skillById(lord.heroId, id)?.name).filter((name): name is string => name !== undefined);
      const relics = lord === undefined ? [] : lord.relics.map((id) => relicById(id)?.name).filter((name): name is string => name !== undefined);
      return { factionId: faction.id, name: faction.name, colour: faction.color, entries: [...skills, ...relics] };
    }),
    timeline: events.filter((event) => event.importance >= 75).slice(-9).map((event) => ({ turn: event.turn, text: event.text })),
  };
}
