import { ownCellCenter, type BoardCell, type BoardSide } from "@jev-game/game";
import { boardArena } from "@jev-game/content";
import { createBoardStage, type ViewportInsets } from "../views/board-stage.js";
import { createHeroFigure, type HeroFigure } from "../views/hero-figures.js";
import { mountEnvironment, type EnvironmentTheme, type MountedEnvironment } from "../environments/environment.js";
import { ENVIRONMENT_THEMES } from "../environments/themes/index.js";
import { saveBoardTheme, savedBoardTheme } from "../environments/board-choice.js";
import { button, el } from "../../hud/dom.js";
import { checkIcon } from "../../hud/icons.js";
import { createStatsPanel } from "./environment-lab-stats.js";
import { ENVIRONMENT_HASH } from "./lab-routes.js";

export interface EnvironmentLabScene {
  show(themeId: string | null): void;
  dispose(): void;
}

type Framing = "game" | "wide";

interface Lineup {
  heroId: string;
  cell: BoardCell;
}

const FRAMINGS: readonly Framing[] = ["game", "wide"];

const FRAMING_INSETS: Record<Framing, ViewportInsets> = {
  game: { left: 208, right: 244, top: 76, bottom: 24 },
  wide: { left: 320, right: 320, top: 200, bottom: 170 },
};

const FRIENDLY_COLOR = "#4ea1ff";

const ENEMY_COLOR = "#ff6b6b";

const FRIENDLY_LINEUP: readonly Lineup[] = [
  { heroId: "bulwark", cell: { column: 3, row: 0 } },
  { heroId: "frostweaver", cell: { column: 1, row: 2 } },
  { heroId: "pyromancer", cell: { column: 5, row: 3 } },
];

const ENEMY_LINEUP: readonly Lineup[] = [
  { heroId: "bulwark", cell: { column: 4, row: 0 } },
  { heroId: "duskblade", cell: { column: 2, row: 1 } },
  { heroId: "frostweaver", cell: { column: 6, row: 3 } },
];

const HUD_GUIDES = ["is-seats", "is-team", "is-header", "is-plate", "is-action"];

const LEAK_ROUNDS = 4;

export function environmentHash(themeId: string): string {
  return `${ENVIRONMENT_HASH}/${themeId}`;
}

function resolveTheme(themeId: string | null): EnvironmentTheme {
  return ENVIRONMENT_THEMES.find((option) => option.id === themeId) ?? savedBoardTheme();
}

export function createEnvironmentLabScene(root: HTMLElement, initialThemeId: string | null): EnvironmentLabScene {
  const canvasHost = el("div", "env-canvas");
  const guides = el("div", "env-guides", ...HUD_GUIDES.map((guide) => el("div", `env-guide ${guide}`)));
  const caption = el("div", "env-caption");
  const picker = el("div", "env-picker");
  const back = el("a", "pill-button env-back", "Menu");
  back.href = "#match";

  const framingButtons = new Map<Framing, HTMLButtonElement>();
  const guideToggle = button("pill-button env-toggle", () => toggleGuides(), "HUD");
  const statsToggle = button("pill-button env-toggle", () => toggleStats(), "Stats");

  for (const option of FRAMINGS) {
    framingButtons.set(option, button("pill-button env-toggle", () => frame(option), option === "game" ? "Game view" : "Wide"));
  }

  const tools = el("div", "env-tools", ...framingButtons.values(), guideToggle, statsToggle);
  const stage = createBoardStage(canvasHost);

  const stats = createStatsPanel(stage, () => {
    leakTest().catch(() => {});
  });

  root.replaceChildren(canvasHost, guides, back, tools, caption, picker, stats.root);

  let framing: Framing = "game";
  let showGuides = false;
  let showStats = false;
  let testing = false;
  let disposed = false;
  stage.showBoard(boardArena, "south", FRAMING_INSETS[framing]);

  const figures: HeroFigure[] = [];

  function stand(lineup: readonly Lineup[], side: BoardSide, color: string): void {
    for (const member of lineup) {
      const figure = createHeroFigure(member.heroId);
      figure.setTeamColor(color);
      figure.root.position.copy(stage.toScene(ownCellCenter(boardArena, side, member.cell), 0));
      figure.root.rotation.y = side === "south" ? Math.PI : 0;
      stage.scene.add(figure.root);
      figures.push(figure);
    }
  }

  stand(FRIENDLY_LINEUP, "south", FRIENDLY_COLOR);
  stand(ENEMY_LINEUP, "north", ENEMY_COLOR);

  const stopFrames = stage.onFrame((deltaSeconds) => {
    for (const figure of figures) {
      figure.update(deltaSeconds);
    }
  });

  let theme: EnvironmentTheme = resolveTheme(initialThemeId);
  let environment: MountedEnvironment = mountEnvironment(stage, theme, boardArena);

  function renderPicker(): void {
    const saved = savedBoardTheme().id;

    const cards = ENVIRONMENT_THEMES.map((option) => {
      const swatch = el("span", "env-swatch", option.id === saved ? checkIcon() : null);
      swatch.style.setProperty("--swatch", option.swatch);
      const card = button("env-card", () => pick(option.id), swatch, el("span", "env-card-name", option.name));
      card.classList.toggle("is-selected", option.id === theme.id);
      card.classList.toggle("is-saved", option.id === saved);
      card.setAttribute("aria-pressed", String(option.id === saved));
      card.title = option.id === saved ? "Your board" : "Use this board";

      return card;
    });

    picker.replaceChildren(...cards);
    caption.textContent = theme.story;

    for (const [option, control] of framingButtons) {
      control.classList.toggle("is-active", option === framing);
    }

    guideToggle.classList.toggle("is-active", showGuides);
    guides.hidden = !showGuides;
    statsToggle.classList.toggle("is-active", showStats);
    stats.setVisible(showStats);
  }

  function pick(themeId: string): void {
    saveBoardTheme(themeId);
    show(themeId);
  }

  function show(themeId: string | null): void {
    const next = resolveTheme(themeId);

    if (next.id !== theme.id) {
      environment.dispose();
      theme = next;
      environment = mountEnvironment(stage, theme, boardArena);
    }

    history.replaceState(null, "", environmentHash(theme.id));
    renderPicker();
  }

  function frame(next: Framing): void {
    framing = next;
    stage.showBoard(boardArena, "south", FRAMING_INSETS[framing]);
    renderPicker();
  }

  function toggleGuides(): void {
    showGuides = !showGuides;
    renderPicker();
  }

  function toggleStats(): void {
    showStats = !showStats;
    renderPicker();
  }

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
    const home = theme.id;
    stats.note("Switching themes…");

    async function tour(): Promise<boolean> {
      for (const option of ENVIRONMENT_THEMES) {
        if (disposed) {
          return false;
        }

        show(option.id);
        await framesLater(2);
      }

      show(home);
      await framesLater(3);

      return !disposed;
    }

    if (!(await tour())) {
      return;
    }

    const before = stage.stats();

    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      if (!(await tour())) {
        return;
      }
    }

    const after = stage.stats();
    const growth = after.geometries - before.geometries + (after.textures - before.textures);
    const switches = LEAK_ROUNDS * ENVIRONMENT_THEMES.length;

    stats.note(
      `${switches} switches · geometries ${before.geometries} → ${after.geometries} · textures ${before.textures} → ${after.textures} · ${growth > 0 ? "leaking" : "no leak"}`,
    );

    testing = false;
  }

  show(theme.id);

  return {
    show,

    dispose() {
      disposed = true;
      stopFrames();
      stats.dispose();
      environment.dispose();

      for (const figure of figures) {
        figure.dispose();
      }

      stage.dispose();
      root.replaceChildren();
    },
  };
}
