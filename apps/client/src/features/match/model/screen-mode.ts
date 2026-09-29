import type { MusicScreen } from "../../../audio/catalogue.js";
import type { MatchState } from "./match-state.js";
import { describePlay } from "./play-screen.js";

export type ScreenMode = "menu" | "lobby" | "draft" | "placement" | "stage" | "watch";

export function screenModeOf(state: MatchState): ScreenMode {
  const live = state.live;

  if (live === null) {
    return "menu";
  }

  if (live.watch !== null) {
    return "watch";
  }

  const view = live.snapshot.view;

  if (view === null) {
    return "lobby";
  }

  const board = describePlay(view, live.draft).board;

  return board === null ? "stage" : board;
}

export function musicScreenOf(state: MatchState): MusicScreen {
  if (state.live === null) {
    return "menu";
  }

  return state.live.watch === null ? "planning" : "battle";
}
