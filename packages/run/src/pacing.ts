import type { RoundState } from "./types.js";

export const PLAYBACK_SPEED = 1;

export const ROUND_END_PAUSE_SECONDS = 3;

export const TELEPORT_SECONDS = 2;

export function roundPlaybackSeconds(round: RoundState): number {
  const longest = Math.max(0, ...round.battles.map((battle) => battle.presentationSeconds));

  return longest / PLAYBACK_SPEED;
}

export function roundHoldSeconds(round: RoundState): number {
  return TELEPORT_SECONDS + roundPlaybackSeconds(round) + ROUND_END_PAUSE_SECONDS;
}
