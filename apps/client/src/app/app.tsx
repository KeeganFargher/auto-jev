import { lazy, Suspense, use } from "react";
import { SettingsWindow } from "../features/settings/settings-window.js";
import { useClickSound } from "../hooks/use-click-sound.js";
import { useRoute } from "../hooks/use-route.js";
import { useStore } from "../state/use-store.js";
import { TooltipProvider } from "../ui/tooltip/tooltip-provider.js";
import { ErrorBoundary } from "./error-boundary.js";
import { useGame, type GameServices } from "./game-context.js";
import { GameProvider } from "./game-provider.js";

const BattleLabScreen = lazy(() => import("../features/battle-lab/battle-lab-screen.js"));

const EnvironmentLabScreen = lazy(
  () => import("../features/environment-lab/environment-lab-screen.js"),
);

const MatchScreen = lazy(() => import("../features/match/match-screen.js"));

function Screen() {
  const { navigationId, route } = useRoute();

  switch (route.kind) {
    case "lab":
      return <BattleLabScreen />;

    case "match":
      return <MatchScreen navigationId={navigationId} joinRoomId={route.joinRoomId} />;

    case "environment":
      return <EnvironmentLabScreen navigationId={navigationId} themeId={route.themeId} />;
  }
}

function ModelGate({ heroModels }: { heroModels: Promise<void> }) {
  use(heroModels);

  return <Screen />;
}

function Shell({ heroModels }: { heroModels: Promise<void> }) {
  useClickSound();
  const navigation = useStore(useGame().navigation);

  return (
    <>
      <ErrorBoundary resetKey={navigation.id}>
        <Suspense fallback={null}>
          <ModelGate heroModels={heroModels} />
        </Suspense>
      </ErrorBoundary>
      <SettingsWindow />
    </>
  );
}

export function App({
  services,
  heroModels,
}: {
  services: GameServices;
  heroModels: Promise<void>;
}) {
  return (
    <GameProvider services={services}>
      <TooltipProvider>
        <Shell heroModels={heroModels} />
      </TooltipProvider>
    </GameProvider>
  );
}
