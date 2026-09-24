import "@fontsource/lilita-one/400.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./style.css";
import type { BattleLab } from "./game/scenes/battle-lab.js";
import { createMatchScene, type MatchScene } from "./game/scenes/match-scene.js";
import type { EnvironmentLabScene } from "./game/scenes/environment-lab-scene.js";
import type { ModelLabScene } from "./game/scenes/model-lab-scene.js";
import { ENVIRONMENT_HASH, MODEL_LAB_HASH } from "./game/scenes/lab-routes.js";
import { audio } from "./audio/engine.js";
import { models } from "./models/library.js";
import { mountSettingsWindow } from "./hud/settings/settings-window.js";
import { createAudioTab } from "./hud/settings/audio-tab.js";

mountSettingsWindow(document.body, [createAudioTab(audio.settings)]);

void audio.preload("boot");

const CLICK_ALREADY_VOICED_MS = 30;

document.addEventListener("click", (event) => {
  const voiced = performance.now() - audio.lastEffectAt() < CLICK_ALREADY_VOICED_MS;

  if (!voiced && event.target instanceof Element && event.target.closest("button, .menu-link, .pill-button") !== null) {
    audio.play("ui-click");
  }
});

if (import.meta.env.DEV) {
  Object.assign(window, { jevAudio: audio, jevModels: models });
}

const canvasRoot = document.getElementById("lab-canvas-root")!;

const hudRoot = document.getElementById("lab-hud")!;

const matchRoot = document.getElementById("match-root")!;

const envRoot = document.getElementById("env-root")!;

const modelsRoot = document.getElementById("models-root")!;

let battleLab: BattleLab | null = null;

let activeMatchScene: MatchScene | null = null;

let activeEnvironmentLab: EnvironmentLabScene | null = null;

let activeModelLab: ModelLabScene | null = null;

let modeRequest = 0;

const JOIN_PREFIX = "#join/";

async function applyMode(): Promise<void> {
  modeRequest += 1;
  const request = modeRequest;
  const joinRoomId = location.hash.startsWith(JOIN_PREFIX) ? location.hash.slice(JOIN_PREFIX.length) : null;
  const isMatch = location.hash === "#match" || joinRoomId !== null;
  const isEnvironment = location.hash === ENVIRONMENT_HASH || location.hash.startsWith(`${ENVIRONMENT_HASH}/`);
  const isModels = location.hash === MODEL_LAB_HASH || location.hash.startsWith(`${MODEL_LAB_HASH}/`);

  canvasRoot.hidden = isMatch || isEnvironment || isModels;
  hudRoot.hidden = isMatch || isEnvironment || isModels;
  matchRoot.hidden = !isMatch;
  envRoot.hidden = !isEnvironment;
  modelsRoot.hidden = !isModels;

  if (isModels) {
    battleLab?.hide();
    activeMatchScene?.dispose();
    activeMatchScene = null;
    activeEnvironmentLab?.dispose();
    activeEnvironmentLab = null;
    const modelId = location.hash.slice(MODEL_LAB_HASH.length + 1) || null;
    const { createModelLabScene } = await import("./game/scenes/model-lab-scene.js");

    if (request !== modeRequest) {
      return;
    }

    if (activeModelLab === null) {
      activeModelLab = createModelLabScene(modelsRoot, modelId);
    } else {
      activeModelLab.show(modelId);
    }

    return;
  }

  activeModelLab?.dispose();
  activeModelLab = null;

  if (isEnvironment) {
    battleLab?.hide();
    activeMatchScene?.dispose();
    activeMatchScene = null;
    const themeId = location.hash.slice(ENVIRONMENT_HASH.length + 1) || null;
    const { createEnvironmentLabScene } = await import("./game/scenes/environment-lab-scene.js");

    if (request !== modeRequest) {
      return;
    }

    if (activeEnvironmentLab === null) {
      activeEnvironmentLab = createEnvironmentLabScene(envRoot, themeId);
    } else {
      activeEnvironmentLab.show(themeId);
    }

    return;
  }

  activeEnvironmentLab?.dispose();
  activeEnvironmentLab = null;

  if (isMatch) {
    battleLab?.hide();

    if (joinRoomId !== null) {
      history.replaceState(null, "", "#match");
    }

    if (activeMatchScene === null) {
      activeMatchScene = createMatchScene(matchRoot, { joinRoomId });
    } else if (joinRoomId !== null) {
      activeMatchScene.joinRoom(joinRoomId);
    }

    return;
  }

  activeMatchScene?.dispose();
  activeMatchScene = null;
  const { createBattleLab } = await import("./game/scenes/battle-lab.js");

  if (request !== modeRequest) {
    return;
  }

  battleLab ??= createBattleLab(canvasRoot, hudRoot);
  battleLab.show();
}

window.addEventListener("hashchange", applyMode);

void applyMode();

void models.preload("heroes");
