import { ownCellCenter, type BoardCell, type BoardSide } from "@jev-game/game";
import { boardArena } from "@jev-game/content";
import { createBoardStage, type ViewportInsets } from "../views/board-stage.js";
import {
  createPlaceholderFigure,
  placeholderTraits,
  type FigureAction,
  type HeroFigure,
} from "../views/hero-figures.js";
import { createModelFigure } from "../views/model-figure.js";
import { mountEnvironment } from "../environments/environment.js";
import { savedBoardTheme } from "../environments/board-choice.js";
import { MODELS, MODEL_IDS, isModelId, type ModelId } from "../../models/catalogue.js";
import { models, type LoadedModel } from "../../models/library.js";
import { heroName } from "../catalogues.js";
import { button, el } from "../../hud/dom.js";
import { createStatsPanel } from "./environment-lab-stats.js";
import { MODEL_LAB_HASH } from "./lab-routes.js";

export interface ModelLabScene {
  show(modelId: string | null): void;
  dispose(): void;
}

type Crowd = 1 | 16 | 32;

type Look = "model" | "placeholder";

type Pose = "idle" | "run" | FigureAction | "channel" | "death";

interface Standing {
  figure: HeroFigure;
  beat: number;
}

const INSETS: ViewportInsets = { left: 208, right: 244, top: 76, bottom: 24 };

const FRIENDLY_COLOR = "#4ea1ff";

const ENEMY_COLOR = "#ff6b6b";

const CROWDS: readonly Crowd[] = [1, 16, 32];

const POSES: readonly Pose[] = ["idle", "run", "attack", "cast", "hit", "channel", "death"];

const CHANNEL_SPIN_RADIANS_PER_SECOND = 16;

const CROWD_ACTIONS: readonly FigureAction[] = ["attack", "attack", "attack", "cast", "hit"];

const BEAT_SECONDS = 1.4;

const LEAK_ROUNDS = 6;

const HERO_MODELS: readonly ModelId[] = MODEL_IDS.filter((id) => MODELS[id].kind === "heroes");

function modelLabHash(modelId: string): string {
  return `${MODEL_LAB_HASH}/${modelId}`;
}

function crowdCells(crowd: Crowd): BoardCell[] {
  if (crowd === 1) {
    return [{ column: 3, row: 1 }];
  }

  const columns = crowd === 16 ? [2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cells: BoardCell[] = [];

  for (const row of [0, 1]) {
    for (const column of columns) {
      cells.push({ column, row });
    }
  }

  return cells;
}

function crowdLabel(crowd: Crowd): string {
  return crowd === 1 ? "Single" : `Crowd ×${crowd}`;
}

function describe(model: LoadedModel): string {
  return `${heroName(model.id)} · ${model.triangles.toLocaleString()} tris · ${model.drawCalls} draws · ${model.clips.size} clips`;
}

export function createModelLabScene(root: HTMLElement, initialId: string | null): ModelLabScene {
  const canvasHost = el("div", "env-canvas");
  const caption = el("div", "env-caption");
  const picker = el("div", "env-picker");
  const back = el("a", "pill-button env-back", "Menu");
  back.href = "#match";

  const crowdToggle = button("pill-button env-toggle", () => cycleCrowd(), crowdLabel(1));
  const lookToggle = button("pill-button env-toggle", () => toggleLook(), "Placeholder");
  const turnToggle = button("pill-button env-toggle", () => toggleTurn(), "Turn");
  const statsToggle = button("pill-button env-toggle", () => toggleStats(), "Stats");
  const tools = el("div", "env-tools", crowdToggle, lookToggle, turnToggle, statsToggle);
  const poseButtons = POSES.map((pose) => button("pill-button env-toggle", () => perform(pose), pose));
  const stage = createBoardStage(canvasHost);

  const stats = createStatsPanel(stage, () => {
    leakTest().catch(() => {});
  });

  root.replaceChildren(canvasHost, back, tools, caption, picker, stats.root);
  stage.showBoard(boardArena, "south", INSETS);

  const environment = mountEnvironment(stage, savedBoardTheme(), boardArena);
  let selected: ModelId | null = null;
  let crowd: Crowd = 1;
  let look: Look = "model";
  let turned = false;
  let showStats = false;
  let testing = false;
  let disposed = false;
  let channeling = false;
  let standing: Standing[] = [];

  function makeFigure(model: LoadedModel): HeroFigure {
    return look === "model" ? createModelFigure(model, placeholderTraits(model.id)) : createPlaceholderFigure(model.id);
  }

  function clearFigures(): void {
    for (const entry of standing) {
      entry.figure.dispose();
    }

    standing = [];
  }

  function placeFigures(): void {
    clearFigures();
    channeling = false;
    const model = selected === null ? null : models.get(selected);

    if (model === null) {
      return;
    }

    const sides: readonly BoardSide[] = crowd === 1 ? ["south"] : ["south", "north"];

    for (const side of sides) {
      for (const cell of crowdCells(crowd)) {
        const figure = makeFigure(model);
        const facingCamera = side === "north" || crowd === 1;
        figure.setTeamColor(side === "south" ? FRIENDLY_COLOR : ENEMY_COLOR);
        figure.root.position.copy(stage.toScene(ownCellCenter(boardArena, side, cell), 0));
        figure.root.rotation.y = facingCamera !== turned ? 0 : Math.PI;
        stage.scene.add(figure.root);
        standing.push({ figure, beat: Math.random() * BEAT_SECONDS });
      }
    }
  }

  function perform(pose: Pose): void {
    channeling = pose === "channel";

    for (const { figure } of standing) {
      figure.setDead(pose === "death");
      figure.setMoving(pose === "run");
      figure.setChanneling(channeling);

      if (pose === "attack" || pose === "cast" || pose === "hit") {
        figure.trigger(pose);
      }
    }
  }

  function renderControls(): void {
    const cards = HERO_MODELS.map((id) => {
      const state = models.state(id);
      const label = state === "ready" ? heroName(id) : `${heroName(id)} (${state})`;
      const card = button("env-card", () => show(id), el("span", "env-card-name", label));
      card.classList.toggle("is-selected", id === selected);

      return card;
    });

    picker.replaceChildren(...cards, ...(crowd === 1 ? poseButtons : []));

    crowdToggle.textContent = crowdLabel(crowd);
    crowdToggle.classList.toggle("is-active", crowd !== 1);
    lookToggle.classList.toggle("is-active", look === "placeholder");
    turnToggle.classList.toggle("is-active", turned);
    statsToggle.classList.toggle("is-active", showStats);
    stats.setVisible(showStats);

    const model = selected === null ? null : models.get(selected);
    caption.textContent =
      model === null ? "No model loaded" : look === "model" ? describe(model) : `${heroName(model.id)} · placeholder`;
  }

  function show(modelId: string | null): void {
    const next = modelId !== null && isModelId(modelId) ? modelId : (HERO_MODELS[0] ?? null);

    if (next !== selected) {
      selected = next;

      if (next !== null) {
        history.replaceState(null, "", modelLabHash(next));
      }

      placeFigures();
    }

    renderControls();
  }

  function setCrowd(next: Crowd): void {
    crowd = next;
    placeFigures();
    renderControls();
  }

  function cycleCrowd(): void {
    setCrowd(CROWDS[(CROWDS.indexOf(crowd) + 1) % CROWDS.length] ?? 1);
  }

  function toggleLook(): void {
    look = look === "model" ? "placeholder" : "model";
    placeFigures();
    renderControls();
  }

  function toggleTurn(): void {
    turned = !turned;
    placeFigures();
    renderControls();
  }

  function toggleStats(): void {
    showStats = !showStats;
    renderControls();
  }

  const stopFrames = stage.onFrame((deltaSeconds) => {
    for (const entry of standing) {
      if (crowd !== 1) {
        entry.beat -= deltaSeconds;

        if (entry.beat <= 0) {
          entry.beat += BEAT_SECONDS * (0.7 + Math.random() * 0.6);
          const action = CROWD_ACTIONS[Math.floor(Math.random() * CROWD_ACTIONS.length)] ?? "attack";
          entry.figure.setMoving(Math.random() < 0.35);
          entry.figure.trigger(action);
        }
      }

      if (channeling) {
        entry.figure.root.rotation.y += deltaSeconds * CHANNEL_SPIN_RADIANS_PER_SECOND;
      }

      entry.figure.update(deltaSeconds);
    }
  });

  function framesLater(frames: number): Promise<void> {
    return new Promise((resolve) => {
      let remaining = frames;

      const stop = stage.onFrame(() => {
        remaining -= 1;

        if (remaining <= 0) {
          stop();
          resolve();
        }
      });
    });
  }

  async function leakTest(): Promise<void> {
    if (testing || disposed) {
      return;
    }

    testing = true;
    const home = crowd;
    stats.note("Rebuilding crowds…");
    setCrowd(32);
    await framesLater(3);
    const before = stage.stats();

    for (let round = 0; round < LEAK_ROUNDS && !disposed; round += 1) {
      setCrowd(1);
      await framesLater(2);
      setCrowd(32);
      await framesLater(2);
    }

    if (disposed) {
      return;
    }

    const after = stage.stats();
    const growth = after.geometries - before.geometries + (after.textures - before.textures);
    stats.note(
      `${LEAK_ROUNDS * 2} rebuilds · geometries ${before.geometries} → ${after.geometries} · textures ${before.textures} → ${after.textures} · ${growth > 0 ? "leaking" : "no leak"}`,
    );
    setCrowd(home);
    testing = false;
  }

  show(initialId);

  for (const id of HERO_MODELS) {
    const wasReady = models.state(id) === "ready";

    models
      .load(id)
      .then(() => {
        if (!disposed && !wasReady && id === selected) {
          placeFigures();
        }

        if (!disposed) {
          renderControls();
        }
      })
      .catch(() => {
        if (!disposed) {
          renderControls();
        }
      });
  }

  return {
    show,

    dispose() {
      disposed = true;
      stopFrames();
      stats.dispose();
      clearFigures();
      environment.dispose();
      stage.dispose();
      root.replaceChildren();
    },
  };
}
