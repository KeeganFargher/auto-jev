import { useMemo } from "react";
import { useGame } from "../app/game-context.js";
import { parseRoute, type Route } from "../app/routes.js";
import { useStore } from "../state/use-store.js";

export interface ActiveRoute {
  navigationId: number;
  route: Route;
}

export function useRoute(): ActiveRoute {
  const navigation = useStore(useGame().navigation);
  const route = useMemo(() => parseRoute(navigation.hash), [navigation]);

  return { navigationId: navigation.id, route };
}
