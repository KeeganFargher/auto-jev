import { createBattleView } from "../views/battle-view.js";
import { createEventLogView } from "../../hud/event-log.js";
import { createUnitInspectorView } from "../../hud/unit-inspector.js";
import { createBattleControlsView } from "../../hud/battle-controls.js";
import type { BattleLabSession } from "../../session/types.js";

export interface BattleLabScene {
  dispose(): void;
}

export function createBattleLabScene(
  root: HTMLElement,
  session: BattleLabSession,
): BattleLabScene {
  const arenaContainer = document.createElement("div");
  arenaContainer.className = "lab-arena-container";
  const sidebar = document.createElement("div");
  sidebar.className = "lab-sidebar";
  root.append(arenaContainer, sidebar);

  const statusEl = document.createElement("p");
  statusEl.className = "lab-status";
  sidebar.appendChild(statusEl);

  let selectedUnitId: string | null = null;

  function handleSelect(unitId: string): void {
    selectedUnitId = selectedUnitId === unitId ? null : unitId;
    render();
  }

  const initialSnapshot = session.getView().snapshot;

  const battleView = createBattleView(
    arenaContainer,
    initialSnapshot.arenaWidth,
    initialSnapshot.arenaHeight,
    handleSelect,
  );

  const inspector = createUnitInspectorView(sidebar);
  const eventLog = createEventLogView(sidebar);
  const controls = createBattleControlsView(sidebar, session);

  function render(): void {
    const view = session.getView();

    battleView.update(view.snapshot, selectedUnitId);
    eventLog.push(view.latestEvents);

    const selectedUnit =
      selectedUnitId === null
        ? null
        : (view.snapshot.units.find((unit) => unit.unitId === selectedUnitId) ?? null);

    inspector.update(selectedUnit);

    const resultText = view.snapshot.result === null ? "active" : JSON.stringify(view.snapshot.result);
    const behindText = view.behindBySteps > 0 ? ` — falling behind by ${view.behindBySteps} steps` : "";
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
      statusEl.remove();
      arenaContainer.remove();
      sidebar.remove();
    },
  };
}
