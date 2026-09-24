import { TICK_SECONDS } from "@jev-game/game";
import type { RoundState } from "./types.js";

export const PLAYBACK_SPEED = 1;

export const ROUND_END_PAUSE_SECONDS = 3;

export const TELEPORT_SECONDS = 2;

export function roundEndTick(round: RoundState): number {
  let latest = 0;

  for (const battle of Object.values(round.battles)) {
    latest = Math.max(latest, battle.result?.endedAtTick ?? 0);
  }

  return latest;
}

export function roundPlaybackSeconds(round: RoundState): number {
  return (roundEndTick(round) * TICK_SECONDS) / PLAYBACK_SPEED;
}

export function roundHoldSeconds(round: RoundState): number {
  return TELEPORT_SECONDS + roundPlaybackSeconds(round) + ROUND_END_PAUSE_SECONDS;
}
