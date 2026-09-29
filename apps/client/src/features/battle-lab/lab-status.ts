import type { BattleResult, BattleSnapshot } from "@jev-game/game";
import type { BattleLabView } from "../../session/types.js";

export function describeResult(result: BattleResult | null): string {
  if (result === null) {
    return "fighting";
  }

  return result.kind === "win" ? `team ${result.winningTeamId} wins` : `draw · ${result.reason}`;
}

export function describePace(timeScale: number): string {
  if (timeScale === 0) {
    return " · hit-stop";
  }

  return timeScale < 1 ? ` · slow-mo ${timeScale}×` : "";
}

export function labPlayRate(view: BattleLabView): number {
  if (view.isDone) {
    return 1;
  }

  return view.isRunning ? view.speedMultiplier : 0;
}

export function formatLabStatus(
  fightName: string,
  seed: number,
  snapshot: BattleSnapshot,
  timeScale: number,
): string {
  return `${fightName} · seed ${seed} · tick ${snapshot.tick}/${snapshot.tickLimit} · ${describeResult(snapshot.result)}${describePace(timeScale)}`;
}
