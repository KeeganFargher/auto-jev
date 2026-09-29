import { ROUND_END_PAUSE_SECONDS } from "@jev-game/run";
import { secondsUntil } from "./match-model.js";
import { requireDeadline, requireView, type SessionSnapshot } from "./session-snapshot.js";

export const CATCH_UP_SECONDS = 1;

export const NEXT_PHASE_PAUSE_SECONDS = 1;

export const BATTLE_START_TICKS = 6;

export function roundEndPauseSeconds(snapshot: SessionSnapshot, now: number): number {
  const view = requireView(snapshot);

  switch (view.phase) {
    case "round-result":
      return secondsUntil(requireDeadline(snapshot, view), now);

    case "finished":
      return ROUND_END_PAUSE_SECONDS;

    case "lobby":
    case "draft":
    case "preparing":
      return NEXT_PHASE_PAUSE_SECONDS;
  }
}

export function advanceBy(behindSeconds: number, deltaSeconds: number): number {
  return behindSeconds > CATCH_UP_SECONDS ? behindSeconds : deltaSeconds;
}
