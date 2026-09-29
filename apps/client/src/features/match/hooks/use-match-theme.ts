import { useMemo } from "react";
import { boardThemeFor, savedBoardTheme } from "../../../game/environments/board-choice.js";
import type { EnvironmentTheme } from "../../../game/environments/environment.js";
import { useStore, useStoreSelector } from "../../../state/use-store.js";
import type { MatchState } from "../model/match-state.js";
import { requireView } from "../model/session-snapshot.js";
import type { MatchController } from "../state/match-controller.js";

function watchingAs(state: MatchState): string | null {
  const live = state.live;

  if (live === null || live.watch === null) {
    return null;
  }

  return requireView(live.snapshot).you.playerId;
}

export function useMatchTheme(controller: MatchController): EnvironmentTheme {
  const viewerId = useStoreSelector(controller.state, watchingAs);
  const owner = useStore(controller.watchHud.boardOwner);

  return useMemo(() => {
    if (viewerId === null || owner === null) {
      return savedBoardTheme();
    }

    return boardThemeFor(owner, viewerId);
  }, [viewerId, owner]);
}
