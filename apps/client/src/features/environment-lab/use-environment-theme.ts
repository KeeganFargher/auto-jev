import { useLayoutEffect, useState } from "react";
import { environmentHash } from "../../app/routes.js";
import { saveBoardTheme, savedBoardTheme } from "../../game/environments/board-choice.js";
import type { EnvironmentTheme } from "../../game/environments/environment.js";
import { ENVIRONMENT_THEMES } from "../../game/environments/themes/index.js";
import { resolveTheme } from "./theme-selection.js";

export interface EnvironmentThemeState {
  theme: EnvironmentTheme;
  savedId: string;
  showTheme(theme: EnvironmentTheme): void;
  pickTheme(theme: EnvironmentTheme): void;
}

function routedTheme(requestedId: string | null): EnvironmentTheme {
  return resolveTheme(ENVIRONMENT_THEMES, requestedId, savedBoardTheme());
}

export function useEnvironmentTheme(
  navigationId: number,
  requestedId: string | null,
): EnvironmentThemeState {
  const [theme, setTheme] = useState(() => routedTheme(requestedId));
  const [savedId, setSavedId] = useState(() => savedBoardTheme().id);
  const [appliedNavigationId, setAppliedNavigationId] = useState(navigationId);

  if (appliedNavigationId !== navigationId) {
    setAppliedNavigationId(navigationId);
    setTheme(routedTheme(requestedId));
  }

  useLayoutEffect(() => {
    history.replaceState(null, "", environmentHash(theme.id));
  }, [theme.id, navigationId]);

  function pickTheme(picked: EnvironmentTheme): void {
    saveBoardTheme(picked.id);
    setSavedId(picked.id);
    setTheme(picked);
  }

  return { theme, savedId, showTheme: setTheme, pickTheme };
}
