import { Color, Group, type ColorRepresentation, type Vector3 } from "three";
import { createMoira } from "../../models/moira/moira.js";
import { SPITE_WINDUP_SECONDS } from "./fate-visuals.js";
import {
  DEAD_COLOR,
  FIGURE_SCALE,
  SINK_SECONDS,
  SINK_UNITS,
  createFigureBase,
  paintSpectral,
  type SpectralMemory,
} from "./figure-base.js";
import type { FigureTraits, HeroFigure } from "./hero-figures.js";

const SNAP_SECONDS = 0.08;

const ATTACK_RECOVER_SECONDS = 0.28;

const GATHER_SECONDS = 0.22;

const PULSE_SECONDS = 0.1;

const CAST_RECOVER_SECONDS = 0.4;

const FLINCH_SECONDS = 0.3;

const SHUDDER_SECONDS = 0.18;

const DROP_SECONDS = 0.5;

const LANDING_SECONDS = 0.22;

const DEATH_HOLD_SECONDS = 0.5;

const PULL_BACK = 0.8;

const SNAP_FORWARD = 1.4;

const CAST_RISE = 0.9;

const CAST_SPIN = 0.7;

const FLASH_STRENGTH = 0.32;

const CELEBRATE_HOP = 1.4;

const CELEBRATE_SPIN = 2.4;

const MOVE_LEAN = 0.2;

const FACE_DOWN = 0.75;

const CHARGE_GLOW = 1.4;

const FULL_PULSE = 0.9;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smooth(value: number): number {
  const t = clamp01(value);

  return t * t * (3 - 2 * t);
}

interface Pose {
  z: number;
  y: number;
  pitch: number;
  spin: number;
  roll: number;
  wide: number;
  tall: number;
  deep: number;
  openness: number;
  glow: number;
  stir: number;
  clench: number;
}

function restPose(): Pose {
  return {
    z: 0,
    y: 0,
    pitch: 0,
    spin: 0,
    roll: 0,
    wide: 1,
    tall: 1,
    deep: 1,
    openness: 1,
    glow: 1,
    stir: 0,
    clench: 0,
  };
}

export function createMoiraFigure(traits: FigureTraits): HeroFigure {
  const root = new Group();
  const base = createFigureBase();
  const moira = createMoira("board");
  const pivot = new Group();
  pivot.position.y = moira.ballCenter.y;
  moira.root.position.y = -moira.ballCenter.y;
  pivot.add(moira.root);

  const frame = new Group();
  frame.scale.setScalar(FIGURE_SCALE);
  frame.add(base.root, pivot);
  root.add(frame);

  const restHeight = moira.ballCenter.y;
  const groundedHeight = moira.ballRadius * 0.92;
  const spectralMemory: SpectralMemory = { colors: new Map() };
  let teamColor = new Color("#ffffff");
  let moving = false;
  let celebrating = false;
  let dead = false;
  let linger = false;
  let spectral = false;
  let clock = Math.random() * 10;
  let attackTime = Number.POSITIVE_INFINITY;
  let castTime = Number.POSITIVE_INFINITY;
  let hitTime = Number.POSITIVE_INFINITY;
  let deathTime = Number.POSITIVE_INFINITY;
  let sinkTime = 0;
  let bodyGlow = 0;
  let charge = 0;
  let spin = 0;
  let movingBlend = 0;
  let celebrateBlend = 0;

  function applyTeamColor(): void {
    base.paint(dead ? DEAD_COLOR : teamColor, dead);
    moira.setTeamColor(dead ? DEAD_COLOR : teamColor);
  }

  function attackPose(pose: Pose): void {
    if (attackTime < SPITE_WINDUP_SECONDS) {
      const windup = smooth(attackTime / SPITE_WINDUP_SECONDS);
      pose.z -= PULL_BACK * windup;
      pose.wide *= 1 + 0.07 * windup;
      pose.tall *= 1 - 0.09 * windup;
      pose.pitch -= 0.12 * windup;
      pose.openness = Math.min(pose.openness, 1 - 0.55 * windup);
      pose.glow *= 1 + 0.8 * windup;

      return;
    }

    const snapTime = attackTime - SPITE_WINDUP_SECONDS;

    if (snapTime < SNAP_SECONDS) {
      const snap = smooth(snapTime / SNAP_SECONDS);
      pose.z += -PULL_BACK + (PULL_BACK + SNAP_FORWARD) * snap;
      pose.deep *= 1 + 0.14 * snap;
      pose.wide *= 1 - 0.05 * snap;
      pose.tall *= 1 - 0.05 * snap;
      pose.pitch += 0.1 * snap;
      pose.openness = Math.max(pose.openness, 0.45 + 0.85 * snap);
      pose.glow *= 1.8 + 1.2 * snap;
      pose.stir += snap;

      return;
    }

    const settle = 1 - smooth((snapTime - SNAP_SECONDS) / ATTACK_RECOVER_SECONDS);
    pose.z += SNAP_FORWARD * settle;
    pose.deep *= 1 + 0.14 * settle;
    pose.pitch += 0.1 * settle;
    pose.openness = Math.max(pose.openness, 1 + 0.3 * settle);
    pose.glow *= 1 + 2 * settle;
    pose.stir += settle;
  }

  function castPose(pose: Pose): void {
    if (castTime < GATHER_SECONDS) {
      const gather = smooth(castTime / GATHER_SECONDS);
      pose.y += CAST_RISE * gather;
      pose.wide *= 1 + 0.1 * gather;
      pose.tall *= 1 + 0.1 * gather;
      pose.deep *= 1 + 0.1 * gather;
      pose.spin += CAST_SPIN * gather;
      pose.pitch -= 0.15 * gather;
      pose.openness = Math.max(pose.openness, 1 + 0.5 * gather);
      pose.glow *= 1 + 3 * gather;
      pose.stir += gather;

      return;
    }

    const pulseTime = castTime - GATHER_SECONDS;

    if (pulseTime < PULSE_SECONDS) {
      const pulse = Math.sin((Math.PI * pulseTime) / PULSE_SECONDS);
      pose.y += CAST_RISE;
      pose.wide *= 1.1 - 0.16 * pulse;
      pose.tall *= 1.1 - 0.16 * pulse;
      pose.deep *= 1.1 + 0.08 * pulse;
      pose.spin += CAST_SPIN;
      pose.pitch += -0.15 + 0.3 * pulse;
      pose.openness = Math.max(pose.openness, 1.5);
      pose.glow *= 4 + 2 * pulse;
      pose.stir += 1;

      return;
    }

    const settle = 1 - smooth((pulseTime - PULSE_SECONDS) / CAST_RECOVER_SECONDS);
    pose.y += CAST_RISE * settle;
    pose.wide *= 1 + 0.1 * settle;
    pose.tall *= 1 + 0.1 * settle;
    pose.deep *= 1 + 0.1 * settle;
    pose.spin += CAST_SPIN * settle;
    pose.pitch += 0.15 * settle;
    pose.openness = Math.max(pose.openness, 1 + 0.5 * settle);
    pose.glow *= 1 + 3 * settle;
    pose.stir += settle;
  }

  function flinchPose(pose: Pose): number {
    if (hitTime >= FLINCH_SECONDS) {
      return 0;
    }

    const flinch = Math.sin(Math.PI * clamp01(hitTime / FLINCH_SECONDS)) * (1 - hitTime / FLINCH_SECONDS / 2);
    pose.z -= 0.7 * flinch;
    pose.pitch -= 0.28 * flinch;
    pose.roll += 0.12 * flinch * Math.sin(hitTime * 60);
    pose.wide *= 1 + 0.08 * flinch;
    pose.tall *= 1 - 0.1 * flinch;
    pose.openness = Math.min(pose.openness, 1 - 0.8 * flinch);
    pose.stir += flinch;

    return flinch;
  }

  function deathPose(pose: Pose): void {
    pose.openness = 0;
    pose.glow = 0;
    pose.clench = smooth(deathTime / (SHUDDER_SECONDS + DROP_SECONDS));

    if (deathTime < SHUDDER_SECONDS) {
      const shudder = 1 - deathTime / SHUDDER_SECONDS;
      pose.roll += 0.12 * shudder * Math.sin(deathTime * 70);
      pose.pitch += 0.06 * shudder * Math.sin(deathTime * 53);
      pose.glow = 3 * shudder;

      return;
    }

    const fall = clamp01((deathTime - SHUDDER_SECONDS) / DROP_SECONDS);
    pose.y -= (restHeight - groundedHeight) * fall * fall;
    pose.pitch += FACE_DOWN * smooth(fall);
    pose.roll += 0.25 * smooth(fall);
    const landed = deathTime - SHUDDER_SECONDS - DROP_SECONDS;

    if (landed > 0) {
      const squash =
        Math.sin(Math.PI * clamp01(landed / LANDING_SECONDS)) * (1 - clamp01(landed / LANDING_SECONDS) / 2);

      pose.wide *= 1 + 0.16 * squash;
      pose.deep *= 1 + 0.16 * squash;
      pose.tall *= 1 - 0.22 * squash;
      pose.y -= moira.ballRadius * 0.22 * squash;
    }
  }

  applyTeamColor();

  return {
    root,
    height: traits.height * FIGURE_SCALE,

    setTeamColor(color: ColorRepresentation) {
      teamColor = new Color(color);
      applyTeamColor();
    },

    setMoving(isMoving) {
      moving = isMoving;
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
        moira.blink();
      }
    },

    setDead(isDead) {
      if (isDead === dead) {
        return;
      }

      dead = isDead;
      deathTime = isDead ? 0 : Number.POSITIVE_INFINITY;
      sinkTime = 0;

      if (!isDead) {
        attackTime = Number.POSITIVE_INFINITY;
        castTime = Number.POSITIVE_INFINITY;
        hitTime = Number.POSITIVE_INFINITY;
        base.root.scale.setScalar(1);
        root.visible = true;
      }

      applyTeamColor();
    },

    setLinger(isLingering) {
      linger = isLingering;
    },

    setSpectral(isSpectral) {
      if (isSpectral === spectral) {
        return;
      }

      spectral = isSpectral;
      paintSpectral(moira.surfaces, spectralMemory, isSpectral);
      applyTeamColor();
    },

    setOverclock() {},

    setGlow(amount) {
      bodyGlow = Math.max(0, amount);
    },

    setCharge(amount) {
      charge = Math.min(1, Math.max(0, amount));
    },

    setChanneling() {},

    setCelebrating(isCelebrating) {
      celebrating = isCelebrating;
    },

    setCastsShadow(castsShadow) {
      moira.root.traverse((node) => {
        node.castShadow = castsShadow;
      });
    },

    castOrigin(out: Vector3) {
      return moira.eyeSocket.getWorldPosition(out);
    },

    update(deltaSeconds) {
      clock += deltaSeconds;
      attackTime += deltaSeconds;
      castTime += deltaSeconds;
      hitTime += deltaSeconds;
      deathTime += deltaSeconds;
      movingBlend += ((moving && !dead ? 1 : 0) - movingBlend) * clamp01(deltaSeconds * 6);
      celebrateBlend += ((celebrating && !dead ? 1 : 0) - celebrateBlend) * clamp01(deltaSeconds * 5);
      spin += deltaSeconds * CELEBRATE_SPIN * celebrateBlend;
      const pose = restPose();
      let flinch = 0;

      if (dead) {
        deathPose(pose);
        sinkTime +=
          !linger && deathTime > SHUDDER_SECONDS + DROP_SECONDS + LANDING_SECONDS + DEATH_HOLD_SECONDS
            ? deltaSeconds
            : 0;
        const sink = Math.min(1, sinkTime / SINK_SECONDS);
        pose.y -= sink * SINK_UNITS;
        base.root.scale.setScalar(Math.max(0.001, 1 - sink));
        root.visible = sink < 1;
      } else {
        pose.pitch += MOVE_LEAN * movingBlend;
        pose.roll += 0.06 * movingBlend * Math.sin(clock * 6);
        pose.stir += 0.6 * movingBlend;
        pose.y += CELEBRATE_HOP * celebrateBlend * Math.abs(Math.sin(clock * 5));
        pose.openness = 1 - 0.4 * celebrateBlend;
        pose.glow *= 1 + 0.8 * celebrateBlend;
        pose.glow *= 1 + CHARGE_GLOW * charge + (charge >= 1 ? FULL_PULSE * (0.5 + 0.5 * Math.sin(clock * 6)) : 0);
        pose.stir += celebrateBlend;
        attackPose(pose);
        castPose(pose);
        flinch = flinchPose(pose);
      }

      pivot.position.set(0, restHeight + pose.y, pose.z);
      pivot.rotation.set(pose.pitch, pose.spin + spin, pose.roll);
      pivot.scale.set(pose.wide, pose.tall, pose.deep);
      moira.setOpenness(pose.openness);
      moira.setGlow(pose.glow);
      moira.setStir(pose.stir);
      moira.setClench(pose.clench);

      moira.setFlash(Math.max(flinch * FLASH_STRENGTH, bodyGlow));
      moira.update(deltaSeconds);
    },

    dispose() {
      moira.dispose();
      base.dispose();
      root.removeFromParent();
    },
  };
}
