import { createContext, useContext } from "react";
import type { Equality } from "../../state/store.js";
import { useStoreSelector } from "../../state/use-store.js";
import type { PlayerView } from "@jev-game/run";
import type { LiveMatch, MatchState } from "./model/match-state.js";
import { requireView } from "./model/session-snapshot.js";
import type { MatchController } from "./state/match-controller.js";

export const MatchContext = createContext<MatchController | null>(null);

export function useMatch(): MatchController {
  const controller = useContext(MatchContext);

  if (controller === null) {
    throw new Error("useMatch needs a <MatchContext> above it");
  }

  return controller;
}

export function useMatchState<S>(select: (state: MatchState) => S, equals?: Equality<S>): S {
  return useStoreSelector(useMatch().state, select, equals);
}

function liveOf(state: MatchState): LiveMatch | null {
  return state.live;
}

export function useLive(): LiveMatch {
  const live = useMatchState(liveOf);

  if (live === null) {
    throw new Error("This part of the match screen needs a running match");
  }

  return live;
}

export function useView(): PlayerView {
  return requireView(useLive().snapshot);
}
