import { Vector3 } from "three";
import type { BoardGrid } from "@jev-game/game";
import type { BoardStage, StageShot, ViewportInsets } from "./board-stage.js";
import { easeOut } from "./easing.js";
import { createHeroFigure, type HeroFigure } from "./hero-figures.js";
import { isModelId } from "../../models/catalogue.js";
import { models } from "../../models/library.js";

export interface DraftLineupOffer {
  offerId: string;
  heroId: string;
}

export interface DraftLineupState {
  picked: readonly string[];
  full: boolean;
  locked: boolean;
}

export interface DraftViewOptions {
  grid: BoardGrid;
  insets: ViewportInsets;
  offers: readonly DraftLineupOffer[];
  slots: ReadonlyMap<string, HTMLElement>;
  onRise?: () => void;
}

export interface DraftView {
  setState(state: DraftLineupState): void;
  dispose(): void;
}

interface LineupHero {
  offerId: string;
  figure: HeroFigure;
  slot: HTMLElement | null;
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

const SETTLE_SMOOTHING = 9;

const HEAD_ROOM = 1.5;

const SLOT_GAP_PIXELS = 14;

const MIN_SLOT_PIXELS = 132;

const MAX_SLOT_PIXELS = 210;

const HOVER_GLOW = 0.14;

const MODEL_WAIT_SECONDS = 1.5;

const IDLE_COLOR = "#e6dcc3";

const HOVER_COLOR = "#ffd76a";

const PICKED_COLOR = "#4ea1ff";

const MUTED_COLOR = "#7d7890";

function lineupX(index: number, count: number): number {
  return (index - (count - 1) / 2) * SPACING_UNITS;
}

export function createDraftView(stage: BoardStage, options: DraftViewOptions): DraftView {
  const { grid, offers } = options;
  let state: DraftLineupState = { picked: [], full: false, locked: false };
  let hovered: string | null = null;
  let clock = 0;
  let waited = 0;
  const scratch = new Vector3();

  const loads = offers.flatMap((offer) =>
    isModelId(offer.heroId) && models.state(offer.heroId) !== "ready" && models.state(offer.heroId) !== "failed"
      ? [models.load(offer.heroId)]
      : [],
  );

  let waiting = loads.length > 0;

  void Promise.allSettled(loads).then(() => {
    waiting = false;
  });
  stage.showBoard(grid, "south", options.insets);

  const shot: StageShot = {
    pitch: SHOT_PITCH,
    target: stage.toScene({ x: grid.width / 2, y: grid.height / 2 }, LOOK_HEIGHT),
    halfWidth: ((offers.length - 1) * SPACING_UNITS) / 2 + SIDE_MARGIN,
    halfDepth: FRAME_DEPTH,
    height: FRAME_HEIGHT,
  };

  stage.frame(shot);

  const lineup: LineupHero[] = offers.map((offer, index) => {
    const figure = createHeroFigure(offer.heroId);
    const x = lineupX(index, offers.length);
    const z = ARC_CURVE * x * x;
    figure.setTeamColor(IDLE_COLOR);
    figure.root.position.set(x, RISE_FROM, z);
    stage.scene.add(figure.root);
    const slot = options.slots.get(offer.offerId) ?? null;

    if (slot !== null) {
      slot.style.setProperty("--appear", "0");
      stage.overlay.append(slot);
    }

    return { offerId: offer.offerId, figure, slot, x, z, forward: 0, sink: 0, picked: false, placed: "" };
  });

  function colorFor(hero: LineupHero): string {
    if (hero.picked) {
      return PICKED_COLOR;
    }

    if (state.locked || state.full) {
      return MUTED_COLOR;
    }

    return hovered === hero.offerId ? HOVER_COLOR : IDLE_COLOR;
  }

  function paint(): void {
    for (const hero of lineup) {
      hero.figure.setTeamColor(colorFor(hero));
      hero.figure.setGlow(hovered === hero.offerId && !state.locked ? HOVER_GLOW : 0);
      hero.slot?.classList.toggle("is-hovered", hovered === hero.offerId);
    }
  }

  function hover(offerId: string | null): void {
    if (hovered === offerId) {
      return;
    }

    hovered = offerId;
    paint();
  }

  const unbinders = lineup.map((hero) => {
    const slot = hero.slot;

    if (slot === null) {
      return () => {};
    }

    const enter = (): void => hover(hero.offerId);
    const leave = (): void => hover(hovered === hero.offerId ? null : hovered);
    slot.addEventListener("pointerenter", enter);
    slot.addEventListener("pointerleave", leave);
    slot.addEventListener("focus", enter);
    slot.addEventListener("blur", leave);

    return () => {
      slot.removeEventListener("pointerenter", enter);
      slot.removeEventListener("pointerleave", leave);
      slot.removeEventListener("focus", enter);
      slot.removeEventListener("blur", leave);
    };
  });

  function placeSlot(hero: LineupHero, index: number): void {
    const slot = hero.slot;

    if (slot === null) {
      return;
    }

    const restZ = hero.z + hero.forward;
    const foot = stage.toScreen(scratch.set(hero.x, 0, restZ));
    const head = stage.toScreen(scratch.set(hero.x, hero.figure.height + HEAD_ROOM, restZ));
    const neighbour = lineup[index === 0 ? 1 : index - 1];
    const neighbourFoot = neighbour === undefined ? null : stage.toScreen(scratch.set(neighbour.x, 0, neighbour.z));

    if (foot === null || head === null) {
      return;
    }

    const spacing = neighbourFoot === null ? MAX_SLOT_PIXELS : Math.abs(foot.x - neighbourFoot.x) - SLOT_GAP_PIXELS;
    const width = Math.round(Math.min(MAX_SLOT_PIXELS, Math.max(MIN_SLOT_PIXELS, spacing)));
    const model = Math.max(0, Math.round(foot.y - head.y));
    const placed = `${Math.round(foot.x - width / 2)},${Math.round(head.y)},${width},${model}`;

    if (placed === hero.placed) {
      return;
    }

    hero.placed = placed;
    slot.style.transform = `translate(${Math.round(foot.x - width / 2)}px, ${Math.round(head.y)}px)`;
    slot.style.width = `${width}px`;
    slot.style.setProperty("--model-height", `${model}px`);
  }

  const stopFrames = stage.onFrame((deltaSeconds) => {
    if (waiting && waited < MODEL_WAIT_SECONDS) {
      waited += deltaSeconds;

      return;
    }

    if (clock === 0) {
      options.onRise?.();
    }

    clock += deltaSeconds;
    const blend = 1 - Math.exp(-SETTLE_SMOOTHING * deltaSeconds);

    lineup.forEach((hero, index) => {
      const appear = easeOut(Math.min(1, Math.max(0, (clock - index * STAGGER_SECONDS) / RISE_SECONDS)));
      const out = state.locked && !hero.picked;
      hero.forward += ((hero.picked ? STEP_FORWARD : 0) - hero.forward) * blend;
      hero.sink += ((out ? SINK_TO : 0) - hero.sink) * blend;
      const y = RISE_FROM * (1 - appear) + hero.sink;
      hero.figure.root.position.set(hero.x, y, hero.z + hero.forward);
      hero.figure.root.visible = y > SINK_TO + 1;
      hero.figure.update(deltaSeconds);

      if (hero.slot !== null) {
        const shown = out ? 0 : appear;
        hero.slot.style.setProperty("--appear", shown.toFixed(2));
        hero.slot.inert = out;
        placeSlot(hero, index);
      }
    });
  });

  return {
    setState(next) {
      state = next;

      for (const hero of lineup) {
        const picked = next.picked.includes(hero.offerId);

        if (picked && !hero.picked) {
          hero.figure.trigger("cast");
        }

        hero.picked = picked;
        hero.figure.setCelebrating(picked);
      }

      if (next.locked) {
        hovered = null;
      }

      paint();
    },

    dispose() {
      stopFrames();

      for (const unbind of unbinders) {
        unbind();
      }

      for (const hero of lineup) {
        hero.figure.dispose();
        hero.slot?.remove();
      }

      stage.frame(null);
    },
  };
}
