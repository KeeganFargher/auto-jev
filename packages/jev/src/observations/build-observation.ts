import { heroLevel, type Catalogue } from "@jev-game/game";
import { piecesOnHero, stashedPieces, type PlayerView } from "@jev-game/run";
import type { JevState } from "../provider/types.js";
import { COMBO_RULES, describeTraits, heroName, heroRole, loadoutTraits, pieceName } from "./describe.js";

export const OBSERVATION_VERSION = 1;

const RECENT_RESULTS = 3;

export type RoundOutcomeKind = "won" | "lost" | "draw" | "bye";

export interface RoundOutcome {
  round: number;
  opponent: string;
  outcome: RoundOutcomeKind;
  healthAfter: number;
}

const GAME_RULES =
  "Eight players each field a small team of heroes. Every round the players are paired into duels and the heroes fight on their own. The loser of a duel loses run health; a player at 0 health is out. The last player standing wins.";

export function roundOutcomeFrom(view: PlayerView): RoundOutcome | null {
  const current = view.currentRound;
  const playerId = view.you.playerId;

  if (current === null) {
    return null;
  }

  if (current.byePlayerId === playerId) {
    return { round: current.round + 1, opponent: "nobody", outcome: "bye", healthAfter: view.you.runHealth };
  }

  const battle = Object.values(current.battles).find(
    (candidate) => candidate.teamAPlayerId === playerId || candidate.teamBPlayerId === playerId,
  );

  if (battle === undefined || battle.result === null) {
    return null;
  }

  const opponentId = battle.teamAPlayerId === playerId ? battle.teamBPlayerId : battle.teamAPlayerId;
  const opponent = view.players[opponentId]?.displayName ?? opponentId;
  let outcome: RoundOutcomeKind = "draw";

  if (battle.result.kind === "win") {
    outcome = battle.result.winningTeamId === playerId ? "won" : "lost";
  }

  return { round: current.round + 1, opponent, outcome, healthAfter: view.you.runHealth };
}

function standingOf(view: PlayerView): string {
  const alive = Object.values(view.players).filter((seat) => !seat.eliminated);
  const ahead = alive.filter((seat) => seat.runHealth > view.you.runHealth).length;

  return `${ahead + 1} of ${alive.length} players still in`;
}

function roundLabel(view: PlayerView): string {
  if (view.phase === "draft") {
    return `Before round 1 of ${view.roundCap}`;
  }

  const played = (view.currentRound?.round ?? 0) + 1;

  return `After round ${played} of ${view.roundCap}`;
}

export function buildObservation(view: PlayerView, catalogue: Catalogue, history: readonly RoundOutcome[]): JevState {
  const you = view.you;

  const team = you.heroBuilds.map((build, slot) => {
    const levels = build.upgrades.map((upgrade) => pieceName(catalogue, upgrade.upgradeId));
    const items = piecesOnHero(you.items, slot).map((piece) => pieceName(catalogue, piece.pieceId));
    const gems = piecesOnHero(you.gems, slot).map((gem) => `${pieceName(catalogue, gem.pieceId)} in the ${gem.skill ?? "stash"}`);

    return `${heroName(catalogue, build.heroId)} (${heroRole(catalogue, build.heroId)}). Level ${heroLevel(build, catalogue)}, picks: ${levels.join(", ") || "none"}. Items: ${items.join(", ") || "none"}. Gems: ${gems.join(", ") || "none"}.`;
  });

  const stash = [...stashedPieces(you.items), ...stashedPieces(you.gems)].map((piece) => pieceName(catalogue, piece.pieceId));

  const opponents = Object.values(view.players)
    .filter((seat) => seat.playerId !== you.playerId)
    .map((seat) => `${seat.displayName}: ${seat.eliminated ? "out" : `${seat.runHealth} health`}`);

  const recent = history.slice(-RECENT_RESULTS).map((result) => {
    const verb = result.outcome === "bye" ? "had a bye" : `${result.outcome} against ${result.opponent}`;

    return `Round ${result.round}: ${verb}, health ${result.healthAfter} after.`;
  });

  return {
    rules: GAME_RULES,
    combos: COMBO_RULES,
    round: roundLabel(view),
    health: `${you.runHealth} of ${view.rules.startingHealth}`,
    standing: standingOf(view),
    team,
    stash,
    synergies: describeTraits(loadoutTraits(you, catalogue), catalogue),
    recentResults: recent,
    opponents,
  };
}
