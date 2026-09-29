import {
  AnimationMixer,
  Color,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  type AnimationAction,
  type ColorRepresentation,
  type Object3D,
  type Vector3,
} from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { HeroDefinitionId } from "@jev-game/game";
import {
  CAST_BONE,
  SHARED_CUES,
  type ClipName,
  type FigureGesture,
  type GestureCue,
} from "../models/catalogue.js";
import { boneName, installedModelLibrary } from "../models/library.js";
import { squashPeak, squashScale, squashWobble } from "./body-motion.js";
import {
  DEAD_COLOR,
  DEATH_SECONDS,
  FIGURE_SCALE,
  HIT_SECONDS,
  MODEL_SCALE,
  SINK_SECONDS,
  SINK_UNITS,
  createFigureBase,
} from "./figure-base.js";

export type FigureStance = "standing" | "airborne" | "downed";

export interface HeroFigure {
  readonly root: Group;
  readonly height: number;
  setTeamColor(color: ColorRepresentation): void;
  setMoving(moving: boolean): void;
  setStance(stance: FigureStance): void;
  setDead(dead: boolean): void;
  setGlow(amount: number): void;
  setRage(amount: number): void;
  setCelebrating(celebrating: boolean): void;
  setCastsShadow(castsShadow: boolean): void;
  perform(gesture: FigureGesture, leadSeconds: number): void;
  flinch(): void;
  squash(strength: number): void;
  castOrigin(out: Vector3): Vector3;
  wield(item: Object3D): void;
  unwield(item: Object3D): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

type BaseKind = "idle" | "run" | "airborne" | "celebrate" | "knockdown" | "death";

interface Cue {
  readonly clip: ClipName;
  readonly from: number;
  readonly speed: number;
  readonly once: boolean;
}

interface Overlay {
  remaining: number;
}

interface PendingGesture {
  readonly cue: Cue;
  delay: number;
}

export interface GestureTiming {
  readonly clip: ClipName;
  readonly from: number;
  readonly speed: number;
  readonly delay: number;
}

const CROSSFADE_SECONDS = 0.12;

const MIN_GESTURE_SPEED = 0.6;

const MAX_GESTURE_SPEED = 3;

const FLASH_EMISSIVE = 0.55;

const RAGE_TINT = new Color("#ff2a10");

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function gestureTiming(cue: GestureCue, leadSeconds: number): GestureTiming {
  if (leadSeconds <= 0) {
    return { clip: cue.clip, from: cue.strike, speed: 1, delay: 0 };
  }

  const from = Math.max(cue.from, cue.strike - leadSeconds * MAX_GESTURE_SPEED);
  const speed = clamp((cue.strike - from) / leadSeconds, MIN_GESTURE_SPEED, MAX_GESTURE_SPEED);

  return { clip: cue.clip, from, speed, delay: leadSeconds - (cue.strike - from) / speed };
}

export function createHeroFigure(heroId: HeroDefinitionId): HeroFigure {
  const library = installedModelLibrary();
  const template = library.template(heroId);
  const model = template.model;
  const root = new Group();
  const base = createFigureBase();
  const scaled = new Group();
  scaled.scale.setScalar(FIGURE_SCALE);
  const pivot = new Group();
  pivot.scale.setScalar(MODEL_SCALE);
  const body = cloneSkinned(template.scene);
  pivot.add(body);
  scaled.add(base.root, pivot);
  root.add(scaled);

  const castSlot = body.getObjectByName(boneName(CAST_BONE));

  if (castSlot === undefined) {
    throw new Error(`Hero "${heroId}" has no ${CAST_BONE} bone to cast from`);
  }

  const flashMaterials: MeshStandardMaterial[] = [];

  body.traverse((node) => {
    if (!(node instanceof Mesh)) {
      return;
    }

    node.castShadow = true;
    node.frustumCulled = !(node instanceof SkinnedMesh);

    if (node.material instanceof MeshStandardMaterial && node.material.map !== null) {
      const material = node.material.clone();
      node.material = material;
      flashMaterials.push(material);
    }
  });

  const mixer = new AnimationMixer(body);
  let current: AnimationAction | null = null;
  let baseKind: BaseKind | null = null;
  let deathBase: BaseKind = "death";
  let overlay: Overlay | null = null;
  let pending: PendingGesture | null = null;
  let stance: FigureStance = "standing";
  let teamColor = new Color("#ffffff");
  let moving = false;
  let dead = false;
  let celebrating = false;
  let glow = 0;
  let rage = 0;
  let flashTime = Number.POSITIVE_INFINITY;
  let squashStrength = 0;
  let squashAge = Number.POSITIVE_INFINITY;
  let deathTime = 0;
  let sinkTime = 0;
  let wielded: Object3D | null = null;
  let stowed: Object3D[] = [];

  function baseCue(kind: BaseKind): Cue {
    switch (kind) {
      case "idle":
        return { clip: model.idle.clip, from: 0, speed: model.idle.speed, once: false };
      case "run":
        return { clip: SHARED_CUES.run.clip, from: 0, speed: SHARED_CUES.run.speed, once: false };
      case "airborne":
        return {
          clip: SHARED_CUES.airborne.clip,
          from: 0,
          speed: SHARED_CUES.airborne.speed,
          once: false,
        };
      case "celebrate":
        return {
          clip: SHARED_CUES.celebrate.clip,
          from: 0,
          speed: SHARED_CUES.celebrate.speed,
          once: false,
        };
      case "knockdown":
        return { ...SHARED_CUES.knockdown, once: true };
      case "death":
        return { ...SHARED_CUES.death, once: true };
    }
  }

  function desiredBase(): BaseKind {
    if (dead) {
      return deathBase;
    }

    if (stance === "downed") {
      return "knockdown";
    }

    if (stance === "airborne") {
      return "airborne";
    }

    if (celebrating) {
      return "celebrate";
    }

    return moving ? "run" : "idle";
  }

  function fadeTo(cue: Cue): AnimationAction {
    const clip = library.clip(cue.clip);
    const next = mixer.clipAction(clip);

    if (next === current && !cue.once) {
      next.timeScale = cue.speed;

      return next;
    }

    next.reset();
    next.setLoop(cue.once ? LoopOnce : LoopRepeat, Number.POSITIVE_INFINITY);
    next.clampWhenFinished = cue.once;
    next.timeScale = cue.speed;
    next.time = cue.once ? cue.from : Math.random() * clip.duration;
    next.play();

    if (current !== null && current !== next) {
      next.crossFadeFrom(current, CROSSFADE_SECONDS, false);
    }

    current = next;

    return next;
  }

  function playOverlay(cue: Cue): void {
    const action = fadeTo(cue);
    overlay = { remaining: (action.getClip().duration - cue.from) / cue.speed };
    baseKind = null;
  }

  function cancelOverlay(): void {
    pending = null;

    if (overlay !== null) {
      overlay = null;
      baseKind = null;
    }
  }

  function applyTeamColor(): void {
    base.paint(dead ? DEAD_COLOR : teamColor, dead);
  }

  function stepAnimation(deltaSeconds: number): void {
    if (pending !== null) {
      pending.delay -= deltaSeconds;

      if (pending.delay <= 0) {
        const cue = pending.cue;
        pending = null;
        playOverlay(cue);
      }
    }

    if (overlay !== null) {
      overlay.remaining -= deltaSeconds;

      if (overlay.remaining <= CROSSFADE_SECONDS) {
        overlay = null;
      }
    }

    const wanted = desiredBase();

    if (overlay === null && wanted !== baseKind) {
      fadeTo(baseCue(wanted));
      baseKind = wanted;
    }

    mixer.update(deltaSeconds);
  }

  function stepFlash(deltaSeconds: number): void {
    flashTime += deltaSeconds;
    const flash = flashTime < HIT_SECONDS ? Math.sin((Math.PI * flashTime) / HIT_SECONDS) : 0;
    const white = Math.max(flash * FLASH_EMISSIVE, glow);
    const tint = rage * (1 - flash);

    for (const material of flashMaterials) {
      material.emissive.copy(RAGE_TINT).multiplyScalar(tint).addScalar(white);
    }
  }

  function stepSquash(deltaSeconds: number): void {
    squashAge += deltaSeconds;
    squashScale(squashWobble(squashStrength, squashAge), scaled.scale).multiplyScalar(FIGURE_SCALE);
  }

  function stepSink(deltaSeconds: number): void {
    deathTime += deltaSeconds;

    if (deathTime <= DEATH_SECONDS) {
      return;
    }

    sinkTime += deltaSeconds;
    const sink = Math.min(1, sinkTime / SINK_SECONDS);
    pivot.position.y = -sink * SINK_UNITS;
    base.root.scale.setScalar(Math.max(0.001, 1 - sink));
    root.visible = sink < 1;
  }

  return {
    root,
    height: template.height * MODEL_SCALE * FIGURE_SCALE,

    setTeamColor(color) {
      teamColor = new Color(color);
      applyTeamColor();
    },

    setMoving(isMoving) {
      moving = isMoving;
    },

    setStance(next) {
      if (dead || next === stance) {
        stance = next;

        return;
      }

      const previous = stance;
      stance = next;

      if (next !== "standing") {
        cancelOverlay();

        return;
      }

      if (overlay !== null || pending !== null) {
        return;
      }

      if (previous === "airborne") {
        playOverlay({ ...SHARED_CUES.land, once: true });
      } else {
        playOverlay({ ...SHARED_CUES.getUp, once: true });
      }
    },

    setDead(isDead) {
      if (isDead === dead) {
        return;
      }

      dead = isDead;
      deathTime = 0;
      sinkTime = 0;
      cancelOverlay();

      if (isDead) {
        deathBase = baseKind === "knockdown" || stance === "downed" ? "knockdown" : "death";
      } else {
        baseKind = null;
        pivot.position.y = 0;
        base.root.scale.setScalar(1);
        root.visible = true;
      }

      applyTeamColor();
    },

    setGlow(amount) {
      glow = Math.max(0, amount);
    },

    setRage(amount) {
      if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
        throw new Error(`Rage must be between 0 and 1, got ${amount}`);
      }

      rage = amount;
    },

    setCelebrating(isCelebrating) {
      celebrating = isCelebrating;
    },

    setCastsShadow(castsShadow) {
      body.traverse((node) => {
        if (node instanceof Mesh) {
          node.castShadow = castsShadow;
        }
      });
    },

    perform(gesture, leadSeconds) {
      const cue = model.gestures[gesture];

      if (cue === undefined) {
        throw new Error(`Hero "${heroId}" has no ${gesture} gesture`);
      }

      if (dead) {
        return;
      }

      const timing = gestureTiming(cue, leadSeconds);
      const played: Cue = { clip: timing.clip, from: timing.from, speed: timing.speed, once: true };

      if (timing.delay > 0) {
        pending = { cue: played, delay: timing.delay };

        return;
      }

      pending = null;
      playOverlay(played);
    },

    flinch() {
      flashTime = 0;

      if (dead || stance !== "standing" || overlay !== null || pending !== null) {
        return;
      }

      playOverlay({ ...SHARED_CUES.flinch, once: true });
    },

    squash(strength) {
      squashStrength = squashPeak(squashStrength, squashAge, strength);
      squashAge = 0;
    },

    castOrigin(out) {
      return castSlot.getWorldPosition(out);
    },

    wield(item) {
      if (wielded !== null) {
        throw new Error(`Hero "${heroId}" already wields ${wielded.name}`);
      }

      stowed = castSlot.children.filter((child) => child.visible);

      for (const child of stowed) {
        child.visible = false;
      }

      castSlot.add(item);
      wielded = item;
    },

    unwield(item) {
      if (wielded !== item) {
        throw new Error(`Hero "${heroId}" does not wield ${item.name}`);
      }

      castSlot.remove(item);

      for (const child of stowed) {
        child.visible = true;
      }

      stowed = [];
      wielded = null;
    },

    update(deltaSeconds) {
      stepFlash(deltaSeconds);
      stepSquash(deltaSeconds);

      if (dead) {
        stepSink(deltaSeconds);
      }

      if (root.visible) {
        stepAnimation(deltaSeconds);
      }
    },

    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(body);

      body.traverse((node) => {
        if (node instanceof SkinnedMesh) {
          node.skeleton.dispose();
        }
      });

      for (const material of flashMaterials) {
        material.dispose();
      }

      base.dispose();
      root.removeFromParent();
    },
  };
}
