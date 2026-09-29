import { Vector3 } from "three";
import type { BoardGrid, HeroDefinitionId } from "@jev-game/game";
import { berserker, firebrand, paladin } from "@jev-game/content";
import type { BoardStage, StageShot, ViewportInsets } from "./board-stage.js";
import { easeOut } from "./easing.js";
import { createHeroFigure, type HeroFigure } from "./hero-figures.js";

export interface MenuViewOptions {
  grid: BoardGrid;
  insets: ViewportInsets;
}

export interface MenuView {
  dispose(): void;
}

interface MenuHero {
  heroId: HeroDefinitionId;
  x: number;
  z: number;
  turn: number;
}

const SHOT_PITCH = (12 * Math.PI) / 180;

const GROUP_X = 12;

const GROUP_Z = 6;

const LOOK_HEIGHT = 7;

const FRAME_HALF_WIDTH = 28;

const FRAME_HALF_DEPTH = 10;

const FRAME_HEIGHT = 14;

const ORBIT_SWING = (16 * Math.PI) / 180;

const ORBIT_PERIOD_SECONDS = 56;

const HERO_COLOR = "#e6dcc3";

const HEROES: readonly MenuHero[] = [
  { heroId: berserker.id, x: -3, z: 1, turn: 0.35 },
  { heroId: paladin.id, x: 12, z: 12, turn: -0.1 },
  { heroId: firebrand.id, x: 27, z: 1, turn: -0.45 },
];

const RISE_FROM = -16;

const RISE_SECONDS = 0.6;

const STAGGER_SECONDS = 0.12;

export function createMenuView(stage: BoardStage, options: MenuViewOptions): MenuView {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  stage.showBoard(options.grid, "south", options.insets);

  const shot: StageShot = {
    pitch: SHOT_PITCH,
    target: new Vector3(GROUP_X, LOOK_HEIGHT, GROUP_Z),
    halfWidth: FRAME_HALF_WIDTH,
    halfDepth: FRAME_HALF_DEPTH,
    height: FRAME_HEIGHT,
  };

  stage.frame(shot);

  const figures: HeroFigure[] = HEROES.map((hero) => {
    const figure = createHeroFigure(hero.heroId);
    figure.setTeamColor(HERO_COLOR);
    figure.root.position.set(hero.x, RISE_FROM, hero.z);
    figure.root.rotation.y = hero.turn;
    figure.root.visible = false;
    stage.scene.add(figure.root);

    return figure;
  });

  let risen = 0;
  let clock = 0;

  const stopFrames = stage.onFrame((deltaSeconds) => {
    if (!reducedMotion) {
      clock += deltaSeconds;
      stage.setOrbit(ORBIT_SWING * Math.sin((clock / ORBIT_PERIOD_SECONDS) * Math.PI * 2));
    }

    risen += deltaSeconds;

    figures.forEach((figure, index) => {
      const rising = Math.min(1, Math.max(0, (risen - index * STAGGER_SECONDS) / RISE_SECONDS));
      const appear = reducedMotion ? 1 : easeOut(rising);
      figure.root.position.y = RISE_FROM * (1 - appear);
      figure.root.visible = appear > 0;
      figure.update(deltaSeconds);
    });
  });

  return {
    dispose() {
      stopFrames();

      for (const figure of figures) {
        figure.dispose();
      }

      stage.setOrbit(0);
      stage.frame(null);
    },
  };
}
