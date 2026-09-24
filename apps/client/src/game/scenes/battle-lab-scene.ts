import type { BattleResult } from "@jev-game/game";
import { createBattleView } from "../views/battle-view.js";
import type { BoardStage, ViewportInsets } from "../views/board-stage.js";
import { createEventLogView } from "../../hud/event-log.js";
import { createUnitInspectorView } from "../../hud/unit-inspector.js";
import { createBattleControlsView } from "../../hud/battle-controls.js";
import type { BattleLabSession, LabScenarioKind, LabTeams, TeamAUpgradeIdsByHero } from "../../session/types.js";
import { audio } from "../../audio/engine.js";

export interface BattleLabScene {
  dispose(): void;
}

const LAB_FRIENDLY_TEAM_ID = "A";

const LAB_HUD_INSETS: ViewportInsets = { left: 16, right: 16, top: 56, bottom: 88 };

function describeResult(result: BattleResult | null): string {
  if (result === null) {
    return "fighting";
  }

  if (result.kind === "win") {
    return `team ${result.winningTeamId} wins`;
  }

  if (result.kind === "draw") {
    return `draw · ${result.reason}`;
  }

  return `failure · ${result.reason}`;
}

export function createBattleLabScene(
  stage: BoardStage,
  hudRoot: HTMLElement,
  statusEl: HTMLElement,
  session: BattleLabSession,
  onReplay: () => void,
  onReset: (seed: number, scenario?: LabScenarioKind, teamAUpgradeIdsByHero?: TeamAUpgradeIdsByHero, teams?: LabTeams) => void,
  isReplay: boolean,
): BattleLabScene {
  void audio.preload("battle");
  void audio.preload("voices");

  const barRoot = hudRoot.querySelector<HTMLElement>("#lab-bar")!;
  const unitRoot = hudRoot.querySelector<HTMLElement>("#lab-unit")!;
  const feedRoot = hudRoot.querySelector<HTMLElement>("#lab-feed")!;
  const tuningRoot = hudRoot.querySelector<HTMLElement>("#lab-tuning-fields")!;
  const upgradesRoot = hudRoot.querySelector<HTMLElement>("#lab-upgrades")!;

  let selectedUnitId: string | null = null;

  function handleSelect(unitId: string): void {
    selectedUnitId = selectedUnitId === unitId ? null : unitId;
    render();
  }

  const battleView = createBattleView(stage, {
    friendlyTeamId: LAB_FRIENDLY_TEAM_ID,
    viewSide: "south",
    insets: LAB_HUD_INSETS,
    targetLines: "all",
    showUnitIds: true,
    onSelectUnit: handleSelect,
  });

  const inspector = createUnitInspectorView(unitRoot, LAB_FRIENDLY_TEAM_ID);
  const eventLog = createEventLogView(feedRoot);
  const controls = createBattleControlsView(barRoot, tuningRoot, upgradesRoot, session, onReplay, onReset);

  function render(): void {
    const view = session.getView();

    battleView.update(view.snapshot, selectedUnitId, view.latestEvents);
    eventLog.push(view.latestEvents);

    const selectedUnit =
      selectedUnitId === null
        ? null
        : (view.snapshot.units.find((unit) => unit.unitId === selectedUnitId) ?? null);

    inspector.update(selectedUnit, view.snapshot.tick);

    const behindText = view.behindBySteps > 0 ? ` · behind ${view.behindBySteps}` : "";
    const prefix = isReplay ? "REPLAY · " : "";

    statusEl.textContent = `${prefix}${view.scenario} · tick ${view.snapshot.tick}/${view.snapshot.tickLimit} · ${describeResult(view.snapshot.result)}${behindText}`;
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
