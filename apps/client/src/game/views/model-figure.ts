import {
  AnimationMixer,
  Color,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  type AnimationAction,
  type AnimationMixerEventMap,
  type Material,
} from "three";
import { models, type LoadedModel } from "../../models/library.js";
import {
  ATTACK_SECONDS,
  CAST_SECONDS,
  CHEST_FRACTION,
  DEAD_COLOR,
  FIGURE_SCALE,
  HIT_SECONDS,
  LUNGE_UNITS,
  SINK_SECONDS,
  SINK_UNITS,
  createFigureBase,
} from "./figure-base.js";
import type { FigureAction, FigureTraits, HeroFigure } from "./hero-figures.js";
import { createCycloneEffect } from "./cyclone-effect.js";

interface ImpactTiming {
  fraction: number;
  delay: number;
}

interface AccentSurface {
  material: MeshStandardMaterial;
  intensity: number;
}

interface FigureSurfaces {
  team: MeshStandardMaterial[];
  flash: MeshStandardMaterial[];
  accents: AccentSurface[];
  owned: Material[];
}

const TEAM_MATERIAL = "team";

const LOOPING_CLIPS: ReadonlySet<string> = new Set(["idle", "run", "victory", "channel"]);

const IMPACTS = {
  attack: { fraction: 0.4, delay: 0.13 },
  cast: { fraction: 0.5, delay: 0.22 },
  hit: { fraction: 0, delay: 0 },
} as const satisfies Record<FigureAction, ImpactTiming>;

const LOOP_FADE_SECONDS = 0.2;

const STRIKE_FADE_SECONDS = 0.08;

const DEATH_FADE_SECONDS = 0.12;

const DEATH_HOLD_SECONDS = 0.35;

const FLASH_STRENGTH = 0.55;

const CAST_GLOW_BOOST = 3;

function adoptMaterials(instance: Object3D): FigureSurfaces {
  const copies = new Map<Material, Material>();
  const surfaces: FigureSurfaces = { team: [], flash: [], accents: [], owned: [] };

  function adopt(source: Material): Material {
    const known = copies.get(source);

    if (known !== undefined) {
      return known;
    }

    const copy = source.clone();
    copies.set(source, copy);
    surfaces.owned.push(copy);

    if (copy instanceof MeshStandardMaterial) {
      if (copy.name === TEAM_MATERIAL) {
        surfaces.team.push(copy);
        surfaces.flash.push(copy);
      } else if (copy.emissive.getHex() !== 0 || copy.emissiveMap !== null) {
        surfaces.accents.push({ material: copy, intensity: copy.emissiveIntensity });
      } else {
        surfaces.flash.push(copy);
      }
    }

    return copy;
  }

  instance.traverse((object) => {
    if (object instanceof Mesh) {
      object.material = Array.isArray(object.material) ? object.material.map(adopt) : adopt(object.material);
    }
  });

  return surfaces;
}

function castSocket(model: LoadedModel, instance: Object3D, body: Object3D, height: number): Object3D {
  if (model.castBone === null) {
    const chest = new Object3D();
    chest.position.y = height * CHEST_FRACTION;
    body.add(chest);

    return chest;
  }

  const bone = instance.getObjectByName(model.castBone);

  if (bone === undefined) {
    throw new Error(`model "${model.id}" has no "${model.castBone}" node for its castBone`);
  }

  return bone;
}

export function createModelFigure(model: LoadedModel, traits: FigureTraits): HeroFigure {
  const root = new Group();
  const base = createFigureBase();
  const instance = models.instantiate(model);
  const surfaces = adoptMaterials(instance);
  const height = model.boardHeight ?? traits.height;
  instance.scale.setScalar(model.height > 0 ? height / model.height : 1);

  const body = new Group();
  body.add(instance);
  const socket = castSocket(model, instance, body, height);

  const cyclone = model.channelEffect === "cyclone" ? createCycloneEffect() : null;

  if (cyclone !== null) {
    cyclone.root.scale.copy(instance.scale);
    body.add(cyclone.root);
  }

  const frame = new Group();
  frame.scale.setScalar(FIGURE_SCALE);
  frame.add(base.root, body);
  root.add(frame);

  const mixer = new AnimationMixer(instance);
  const actions = new Map<string, AnimationAction>();

  for (const [name, clip] of model.clips) {
    const action = mixer.clipAction(clip);

    if (LOOPING_CLIPS.has(name)) {
      action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
    } else {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    }

    actions.set(name, action);
  }

  let teamColor = new Color("#ffffff");
  let moving = false;
  let channeling = false;
  let celebrating = false;
  let dead = false;
  let current: AnimationAction | null = null;
  let strike: AnimationAction | null = null;
  let attackTime = Number.POSITIVE_INFINITY;
  let castTime = Number.POSITIVE_INFINITY;
  let hitTime = Number.POSITIVE_INFINITY;
  let deathTime = Number.POSITIVE_INFINITY;
  let bodyGlow = 0;

  function loopAction(): AnimationAction | null {
    const channel = channeling ? actions.get("channel") : undefined;
    const victory = celebrating ? actions.get("victory") : undefined;
    const run = moving && !traits.rooted ? actions.get("run") : undefined;

    return channel ?? victory ?? run ?? actions.get("idle") ?? null;
  }

  function play(next: AnimationAction | null, fadeSeconds: number, startAt = 0): void {
    if (next === null) {
      return;
    }

    next.reset().play();
    next.time = startAt;

    if (current !== null && current !== next) {
      current.crossFadeTo(next, fadeSeconds, false);
    }

    current = next;
  }

  function settle(): void {
    const next = loopAction();

    if (next !== current) {
      play(next, LOOP_FADE_SECONDS);
    }
  }

  function onFinished(event: AnimationMixerEventMap["finished"]): void {
    if (event.action === strike && !dead) {
      strike = null;
      settle();
    }
  }

  function applyTeamColor(): void {
    const color = dead ? DEAD_COLOR : teamColor;
    base.paint(color, dead);

    for (const surface of surfaces.team) {
      surface.color.copy(color);
    }
  }

  const opening = loopAction();
  mixer.addEventListener("finished", onFinished);
  play(opening, 0, opening === null ? 0 : Math.random() * opening.getClip().duration);

  return {
    root,
    height: height * FIGURE_SCALE,

    setTeamColor(color) {
      teamColor = new Color(color);
      applyTeamColor();
    },

    setMoving(isMoving) {
      moving = isMoving;

      if (!dead && strike === null) {
        settle();
      }
    },

    trigger(action) {
      if (dead) {
        return;
      }

      if (action === "attack") {
        attackTime = 0;
      } else if (action === "cast") {
        castTime = 0;
      } else {
        hitTime = 0;
      }

      const clip = actions.get(action);

      if (clip === undefined) {
        return;
      }

      const impact = IMPACTS[action];
      strike = clip;
      play(clip, STRIKE_FADE_SECONDS, Math.max(0, clip.getClip().duration * impact.fraction - impact.delay));
    },

    setDead(isDead) {
      if (isDead === dead) {
        return;
      }

      dead = isDead;
      strike = null;
      cyclone?.setActive(channeling && !isDead);

      if (isDead) {
        deathTime = 0;
        play(actions.get("death") ?? null, DEATH_FADE_SECONDS);
      } else {
        deathTime = Number.POSITIVE_INFINITY;
        mixer.stopAllAction();
        current = null;
        body.position.set(0, 0, 0);
        base.root.scale.setScalar(1);
        root.visible = true;
        play(loopAction(), 0);
      }

      applyTeamColor();
    },

    setGlow(amount) {
      bodyGlow = Math.max(0, amount);
    },

    setCelebrating(isCelebrating) {
      if (isCelebrating === celebrating) {
        return;
      }

      celebrating = isCelebrating;

      if (!dead && strike === null) {
        settle();
      }
    },

    setCastsShadow(castsShadow) {
      instance.traverse((node) => {
        node.castShadow = castsShadow;
      });
    },

    castOrigin(out) {
      return socket.getWorldPosition(out);
    },

    setChanneling(isChanneling) {
      if (isChanneling === channeling) {
        return;
      }

      channeling = isChanneling;
      cyclone?.setActive(isChanneling && !dead);

      if (!dead && strike === null) {
        settle();
      }
    },

    update(deltaSeconds) {
      attackTime += deltaSeconds;
      castTime += deltaSeconds;
      hitTime += deltaSeconds;
      deathTime += deltaSeconds;

      if (root.visible) {
        mixer.update(deltaSeconds);
      }

      cyclone?.update(deltaSeconds);

      const flinch = !dead && hitTime < HIT_SECONDS ? Math.sin((Math.PI * hitTime) / HIT_SECONDS) : 0;

      for (const surface of surfaces.flash) {
        surface.emissive.setScalar(Math.max(flinch * FLASH_STRENGTH, bodyGlow));
      }

      if (dead) {
        const fallSeconds = actions.get("death")?.getClip().duration ?? 0;
        const sink = Math.min(1, Math.max(0, deathTime - fallSeconds - DEATH_HOLD_SECONDS) / SINK_SECONDS);
        body.position.set(0, -sink * SINK_UNITS, 0);
        base.root.scale.setScalar(Math.max(0.001, 1 - sink));
        root.visible = sink < 1;

        return;
      }

      const lunge =
        attackTime < ATTACK_SECONDS && !traits.rooted
          ? Math.sin((Math.PI * attackTime) / ATTACK_SECONDS) * LUNGE_UNITS
          : 0;

      body.position.set(0, 0, lunge);

      const glow = castTime < CAST_SECONDS ? 1 + Math.sin((Math.PI * castTime) / CAST_SECONDS) * CAST_GLOW_BOOST : 1;

      for (const accent of surfaces.accents) {
        accent.material.emissiveIntensity = accent.intensity * glow;
      }
    },

    dispose() {
      mixer.removeEventListener("finished", onFinished);
      mixer.stopAllAction();
      mixer.uncacheRoot(instance);
      models.release(instance);
      cyclone?.dispose();

      for (const surface of surfaces.owned) {
        surface.dispose();
      }

      base.dispose();
      root.removeFromParent();
    },
  };
}
