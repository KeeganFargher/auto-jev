import { Vector3 } from "three";
import type { BoardGrid, HeroDefinitionId } from "@jev-game/game";
import type { BoardStage, StageShot, ViewportInsets } from "./board-stage.js";
import { createAnchors, type Anchors } from "./anchors.js";
import { easeOut } from "./easing.js";
import { createHeroFigure, type HeroFigure } from "./hero-figures.js";

export interface DraftLineupState {
  picked: readonly HeroDefinitionId[];
  full: boolean;
  locked: boolean;
  hovered: HeroDefinitionId | null;
}

export interface DraftPlacement {
  left: number;
  top: number;
  width: number;
  model: number;
  appear: number;
}

export interface DraftViewOptions {
  grid: BoardGrid;
  insets: ViewportInsets;
  heroIds: readonly HeroDefinitionId[];
  onRise: () => void;
}

export interface DraftView {
  readonly anchors: Anchors<DraftPlacement>;
  setState(state: DraftLineupState): void;
  dispose(): void;
}

interface LineupHero {
  heroId: HeroDefinitionId;
  figure: HeroFigure;
  x: number;
  z: number;
  forward: number;
  sink: number;
  picked: boolean;
  placed: string;
}

const SHOT_PITCH = (18 * Math.PI) / 180;

const SPACING_UNITS = 15;

const ARC_CURVE = 0.004;

const LOOK_HEIGHT = 6;

const FRAME_HEIGHT = 15;

const FRAME_DEPTH = 6;

const SIDE_MARGIN = 6;

const STEP_FORWARD = 4;

const RISE_FROM = -16;

const RISE_SECONDS = 0.6;

const STAGGER_SECONDS = 0.09;

const SINK_TO = -18;

const PICK_FLOURISH_LEAD_SECONDS = 0.4;

const SETTLE_SMOOTHING = 9;

const HEAD_ROOM = 1.5;

const SLOT_GAP_PIXELS = 14;

const MIN_SLOT_PIXELS = 132;

const MAX_SLOT_PIXELS = 210;

const HOVER_GLOW = 0.14;

const IDLE_COLOR = "#e6dcc3";

const HOVER_COLOR = "#ffd76a";

const PICKED_COLOR = "#4ea1ff";

const MUTED_COLOR = "#7d7890";

function lineupX(index: number, count: number): number {
  return (index - (count - 1) / 2) * SPACING_UNITS;
}

export function createDraftView(stage: BoardStage, options: DraftViewOptions): DraftView {
  const { grid, heroIds } = options;

  if (heroIds.length === 0) {
    throw new Error("The draft lineup needs at least one hero");
  }

  let state: DraftLineupState = { picked: [], full: false, locked: false, hovered: null };
  let clock = 0;
  const anchors = createAnchors<DraftPlacement>();
  const scratch = new Vector3();

  stage.showBoard(grid, "south", options.insets);

  const shot: StageShot = {
    pitch: SHOT_PITCH,
    target: stage.toScene({ x: grid.width / 2, y: grid.height / 2 }, LOOK_HEIGHT),
    halfWidth: ((heroIds.length - 1) * SPACING_UNITS) / 2 + SIDE_MARGIN,
    halfDepth: FRAME_DEPTH,
    height: FRAME_HEIGHT,
  };

  stage.frame(shot);

  const lineup: LineupHero[] = heroIds.map((heroId, index) => {
    const figure = createHeroFigure(heroId);
    const x = lineupX(index, heroIds.length);
    const z = ARC_CURVE * x * x;
    figure.setTeamColor(IDLE_COLOR);
    figure.root.position.set(x, RISE_FROM, z);
    stage.scene.add(figure.root);

    return {
      heroId,
      figure,
      x,
      z,
      forward: 0,
      sink: 0,
      picked: false,
      placed: "",
    };
  });

  function colorFor(hero: LineupHero): string {
    if (hero.picked) {
      return PICKED_COLOR;
    }

    if (state.locked || state.full) {
      return MUTED_COLOR;
    }

    return state.hovered === hero.heroId ? HOVER_COLOR : IDLE_COLOR;
  }

  function paint(): void {
    for (const hero of lineup) {
      hero.figure.setTeamColor(colorFor(hero));
      hero.figure.setGlow(state.hovered === hero.heroId && !state.locked ? HOVER_GLOW : 0);
    }
  }

  function placeSlot(hero: LineupHero, index: number, appear: number): void {
    const restZ = hero.z + hero.forward;
    const foot = stage.toScreen(scratch.set(hero.x, 0, restZ));
    const head = stage.toScreen(scratch.set(hero.x, hero.figure.height + HEAD_ROOM, restZ));
    const neighbour = lineup[index === 0 ? 1 : index - 1];

    const neighbourFoot =
      neighbour === undefined ? null : stage.toScreen(scratch.set(neighbour.x, 0, neighbour.z));

    if (foot === null || head === null) {
      return;
    }

    const spacing =
      neighbourFoot === null
        ? MAX_SLOT_PIXELS
        : Math.abs(foot.x - neighbourFoot.x) - SLOT_GAP_PIXELS;

    const width = Math.round(Math.min(MAX_SLOT_PIXELS, Math.max(MIN_SLOT_PIXELS, spacing)));
    const model = Math.max(0, Math.round(foot.y - head.y));
    const left = Math.round(foot.x - width / 2);
    const top = Math.round(head.y);
    const shown = Math.round(appear * 100) / 100;
    const placed = `${left},${top},${width},${model},${shown}`;

    if (placed === hero.placed) {
      return;
    }

    hero.placed = placed;
    anchors.place(hero.heroId, { left, top, width, model, appear: shown });
  }

  const stopFrames = stage.onFrame((deltaSeconds) => {
    if (clock === 0) {
      options.onRise();
    }

    clock += deltaSeconds;
    const blend = 1 - Math.exp(-SETTLE_SMOOTHING * deltaSeconds);

    lineup.forEach((hero, index) => {
      const appear = easeOut(
        Math.min(1, Math.max(0, (clock - index * STAGGER_SECONDS) / RISE_SECONDS)),
      );

      const out = state.locked && !hero.picked;
      hero.forward += ((hero.picked ? STEP_FORWARD : 0) - hero.forward) * blend;
      hero.sink += ((out ? SINK_TO : 0) - hero.sink) * blend;
      const y = RISE_FROM * (1 - appear) + hero.sink;
      hero.figure.root.position.set(hero.x, y, hero.z + hero.forward);
      hero.figure.root.visible = y > SINK_TO + 1;
      hero.figure.update(deltaSeconds);

      placeSlot(hero, index, out ? 0 : appear);
    });
  });

  return {
    anchors,

    setState(next) {
      state = next;

      for (const hero of lineup) {
        const picked = next.picked.includes(hero.heroId);

        if (picked && !hero.picked) {
          hero.figure.perform("signature", PICK_FLOURISH_LEAD_SECONDS);
        }

        hero.picked = picked;
        hero.figure.setCelebrating(picked);
      }

      paint();
    },

    dispose() {
      stopFrames();
      anchors.clear();

      for (const hero of lineup) {
        hero.figure.dispose();
      }

      stage.frame(null);
    },
  };
}
