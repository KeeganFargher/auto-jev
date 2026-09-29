import type { PlayerView } from "@jev-game/run";
import type { JevState } from "../provider/types.js";
import { SETUP_RULES } from "./describe.js";

export const OBSERVATION_VERSION = 2;

function gameRules(view: PlayerView): string {
  const rules = view.rules;
  const players = Object.keys(view.players).length;

  return `${players} players each draft a team of ${rules.draftPicks} different heroes and place them on their half of the board. Two teams may field the same heroes. Every round the players are paired into duels and the heroes fight on their own. The loser of a duel loses 1 run health plus 1 for each of the winner's surviving heroes, at most ${rules.maxLossCost}. Everyone starts with ${rules.startingHealth} health and a player at 0 is out. The last player standing wins, or whoever has the most health after round ${rules.roundCap}.`;
}

export function buildObservation(view: PlayerView): JevState {
  return {
    rules: gameRules(view),
    setups: SETUP_RULES,
  };
}
