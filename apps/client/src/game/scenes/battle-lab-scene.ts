import type { SafeAreaInsets } from "../views/arena-view.js";
import { createBattleView } from "../views/battle-view.js";
import { createEventLogView } from "../../hud/event-log.js";
import { createUnitInspectorView } from "../../hud/unit-inspector.js";
import { createBattleControlsView } from "../../hud/battle-controls.js";
import type { BattleLabSession } from "../../session/types.js";

export interface BattleLabScene {
  dispose(): void;
}

export function createBattleLabScene(
  canvasRoot: HTMLElement,
  hudRoot: HTMLElement,
  statusEl: HTMLElement,
  session: BattleLabSession,
): BattleLabScene {
  const hudSideRoot = hudRoot.querySelector<HTMLElement>(".lab-hud-side")!;
  const hudTop = hudRoot.querySelector<HTMLElement>(".lab-hud-top")!;
  const hudBottom = hudRoot.querySelector<HTMLElement>(".lab-hud-bottom")!;

  function getSafeAreaInsets(): SafeAreaInsets {
    const sideRect = hudSideRoot.getBoundingClientRect();
    const topRect = hudTop.getBoundingClientRect();
    const bottomRect = hudBottom.getBoundingClientRect();

    return {
      top: topRect.bottom,
      right: Math.max(0, window.innerWidth - sideRect.left),
      bottom: Math.max(0, window.innerHeight - bottomRect.top),
      left: 0,
    };
  }

  let selectedUnitId: string | null = null;

  function handleSelect(unitId: string): void {
    selectedUnitId = selectedUnitId === unitId ? null : unitId;
    render();
  }

  const initialSnapshot = session.getView().snapshot;

  const battleView = createBattleView(
    canvasRoot,
    initialSnapshot.arenaWidth,
    initialSnapshot.arenaHeight,
    getSafeAreaInsets,
    handleSelect,
  );

  const inspector = createUnitInspectorView(hudSideRoot);
  const eventLog = createEventLogView(hudSideRoot);
  const controls = createBattleControlsView(hudSideRoot, session);

  function render(): void {
    const view = session.getView();

    battleView.update(view.snapshot, selectedUnitId);
    eventLog.push(view.latestEvents);

    const selectedUnit =
      selectedUnitId === null
        ? null
        : (view.snapshot.units.find((unit) => unit.unitId === selectedUnitId) ?? null);

    inspector.update(selectedUnit);

    const resultText =
      view.snapshot.result === null ? "active" : JSON.stringify(view.snapshot.result);

    const behindText =
      view.behindBySteps > 0 ? ` — falling behind by ${view.behindBySteps} steps` : "";

    statusEl.textContent = `tick ${view.snapshot.tick}/${view.snapshot.tickLimit} — ${resultText}${behindText}`;
  }

  const unsubscribe = session.subscribe(render);
  render();

  let animationFrame = 0;
  let lastFrameTime = performance.now();

  function frame(now: number): void {
    const deltaSeconds = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    session.advanceRealTime(deltaSeconds);
    animationFrame = requestAnimationFrame(frame);
  }

  animationFrame = requestAnimationFrame(frame);

  return {
    dispose() {
      cancelAnimationFrame(animationFrame);
      unsubscribe();
      controls.dispose();
      eventLog.dispose();
      inspector.dispose();
      battleView.dispose();
    },
  };
}
