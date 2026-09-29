import {
  berserker,
  bubbleCleric,
  burr,
  firebrand,
  harpooner,
  mags,
  paladin,
  trainingDummy,
} from "@jev-game/content";
import type { HeroDefinitionId } from "@jev-game/game";

export const MODELS_ROOT = "/assets/models";

export const RIG_BONES = [
  "root",
  "hips",
  "spine",
  "chest",
  "upperarm.l",
  "lowerarm.l",
  "wrist.l",
  "hand.l",
  "handslot.l",
  "upperarm.r",
  "lowerarm.r",
  "wrist.r",
  "hand.r",
  "handslot.r",
  "head",
  "upperleg.r",
  "lowerleg.r",
  "foot.r",
  "toes.r",
  "upperleg.l",
  "lowerleg.l",
  "foot.l",
  "toes.l",
] as const;

export type RigBone = (typeof RIG_BONES)[number];

export type Hand = "right" | "left";

export const HAND_SLOTS: Readonly<Record<Hand, RigBone>> = {
  right: "handslot.r",
  left: "handslot.l",
};

export const CAST_BONE: RigBone = "handslot.r";

export const TEXTURE_IDS = [
  "knight",
  "barbarian",
  "mage",
  "ranger",
  "skeleton",
  "weaponsBits",
] as const;

export type TextureId = (typeof TEXTURE_IDS)[number];

export const TEXTURES: Readonly<Record<TextureId, string>> = {
  knight: `${MODELS_ROOT}/textures/knight.png`,
  barbarian: `${MODELS_ROOT}/textures/barbarian.png`,
  mage: `${MODELS_ROOT}/textures/mage.png`,
  ranger: `${MODELS_ROOT}/textures/ranger.png`,
  skeleton: `${MODELS_ROOT}/textures/skeleton.png`,
  weaponsBits: `${MODELS_ROOT}/textures/weapons-bits.png`,
};

export interface ModelFile {
  readonly url: string;
  readonly texture: TextureId;
}

export const BODY_IDS = ["knight", "barbarian", "mage", "ranger", "skeletonMinion"] as const;

export type BodyId = (typeof BODY_IDS)[number];

export const BODIES: Readonly<Record<BodyId, ModelFile>> = {
  knight: { url: `${MODELS_ROOT}/bodies/knight.glb`, texture: "knight" },
  barbarian: { url: `${MODELS_ROOT}/bodies/barbarian.glb`, texture: "barbarian" },
  mage: { url: `${MODELS_ROOT}/bodies/mage.glb`, texture: "mage" },
  ranger: { url: `${MODELS_ROOT}/bodies/ranger.glb`, texture: "ranger" },
  skeletonMinion: { url: `${MODELS_ROOT}/bodies/skeleton-minion.glb`, texture: "skeleton" },
};

export const PROP_IDS = ["hammer", "axe", "staff", "crystalStaff", "spellbook", "harpoon"] as const;

export type PropId = (typeof PROP_IDS)[number];

export const PROPS: Readonly<Record<PropId, ModelFile>> = {
  hammer: { url: `${MODELS_ROOT}/props/hammer.glb`, texture: "weaponsBits" },
  axe: { url: `${MODELS_ROOT}/props/axe.glb`, texture: "barbarian" },
  staff: { url: `${MODELS_ROOT}/props/staff.glb`, texture: "mage" },
  crystalStaff: { url: `${MODELS_ROOT}/props/crystal-staff.glb`, texture: "weaponsBits" },
  spellbook: { url: `${MODELS_ROOT}/props/spellbook.glb`, texture: "mage" },
  harpoon: { url: `${MODELS_ROOT}/props/harpoon.glb`, texture: "weaponsBits" },
};

export const CLIPS_URL = `${MODELS_ROOT}/clips/rig-medium.glb`;

export const CLIP_NAMES = [
  "Idle_A",
  "Melee_2H_Idle",
  "Skeletons_Idle",
  "Running_A",
  "Jump_Idle",
  "Jump_Land",
  "Cheering",
  "Hit_A",
  "Death_A",
  "Lie_StandUp",
  "Melee_2H_Attack_Chop",
  "Melee_2H_Attack_Slice",
  "Skeletons_Taunt",
  "Throw",
  "Ranged_Magic_Shoot",
  "Ranged_Magic_Raise",
  "Ranged_Magic_Summon",
  "Fishing_Cast",
  "Melee_Unarmed_Attack_Punch_A",
] as const;

export type PackedClipName = (typeof CLIP_NAMES)[number];

export type BoneTriple = readonly [number, number, number];

export interface PoseKey {
  readonly at: number;
  readonly clip: PackedClipName;
  readonly sample: number;
  readonly turn: Readonly<Partial<Record<RigBone, BoneTriple>>>;
  readonly shift: Readonly<Partial<Record<RigBone, BoneTriple>>>;
}

export const HAMMER_SWING = { hang: 0.95, impact: 1.12, release: 1.75, duration: 2.25 } as const;

const HAMMER_WINDUP_SAMPLE = 0.55;

const HAMMER_SLAM_SAMPLE = 0.9;

export const POSED_CLIPS = {
  Hammer_Slam: [
    { at: 0, clip: "Melee_2H_Idle", sample: 0, turn: {}, shift: {} },
    {
      at: 0.4,
      clip: "Melee_2H_Attack_Chop",
      sample: HAMMER_WINDUP_SAMPLE,
      turn: { chest: [-0.2, 0, 0], spine: [-0.1, 0, 0] },
      shift: { hips: [0, -0.1, 0] },
    },
    {
      at: HAMMER_SWING.hang - 0.15,
      clip: "Melee_2H_Attack_Chop",
      sample: HAMMER_WINDUP_SAMPLE,
      turn: { chest: [-0.35, 0, 0], spine: [-0.15, 0, 0], head: [-0.15, 0, 0] },
      shift: { hips: [0, 0.14, 0] },
    },
    {
      at: HAMMER_SWING.hang,
      clip: "Melee_2H_Attack_Chop",
      sample: HAMMER_WINDUP_SAMPLE,
      turn: { chest: [-0.4, 0, 0], spine: [-0.18, 0, 0], head: [-0.18, 0, 0] },
      shift: { hips: [0, 0.16, 0] },
    },
    {
      at: HAMMER_SWING.impact,
      clip: "Melee_2H_Attack_Chop",
      sample: HAMMER_SLAM_SAMPLE,
      turn: { chest: [0.25, 0, 0], spine: [0.12, 0, 0] },
      shift: { hips: [0, -0.14, 0] },
    },
    {
      at: HAMMER_SWING.release - 0.1,
      clip: "Melee_2H_Attack_Chop",
      sample: HAMMER_SLAM_SAMPLE,
      turn: { chest: [0.2, 0, 0], spine: [0.1, 0, 0] },
      shift: { hips: [0, -0.12, 0] },
    },
    { at: HAMMER_SWING.duration, clip: "Melee_2H_Idle", sample: 0, turn: {}, shift: {} },
  ],
} as const satisfies Readonly<Record<string, readonly PoseKey[]>>;

export type PosedClipName = keyof typeof POSED_CLIPS;

export type ClipName = PackedClipName | PosedClipName;

export interface LoopCue {
  readonly clip: ClipName;
  readonly speed: number;
}

export interface ReactionCue {
  readonly clip: ClipName;
  readonly from: number;
  readonly speed: number;
}

export interface GestureCue {
  readonly clip: ClipName;
  readonly from: number;
  readonly strike: number;
}

export type FigureGesture = "attack" | "signature" | "throw";

export interface PropMount {
  readonly prop: PropId;
  readonly hand: Hand;
  readonly scale: number;
}

export interface TintRule {
  readonly hues: readonly [number, number];
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
}

export interface HeroModel {
  readonly body: BodyId;
  readonly props: readonly PropMount[];
  readonly tint: readonly TintRule[];
  readonly idle: LoopCue;
  readonly gestures: Readonly<Partial<Record<FigureGesture, GestureCue>>>;
}

export const SHARED_CUES = {
  run: { clip: "Running_A", speed: 1.15 },
  airborne: { clip: "Jump_Idle", speed: 1 },
  celebrate: { clip: "Cheering", speed: 1 },
  flinch: { clip: "Hit_A", from: 0, speed: 1.6 },
  land: { clip: "Jump_Land", from: 0.05, speed: 1.6 },
  knockdown: { clip: "Death_A", from: 0, speed: 1.8 },
  getUp: { clip: "Lie_StandUp", from: 1, speed: 2.2 },
  death: { clip: "Death_A", from: 0, speed: 1 },
} as const satisfies Record<string, LoopCue | ReactionCue>;

const ROBE_HUES: readonly [number, number] = [228, 262];

const CAPE_HUES: readonly [number, number] = [315, 348];

const ORB_HUES: readonly [number, number] = [55, 175];

export const HERO_MODELS: ReadonlyMap<HeroDefinitionId, HeroModel> = new Map([
  [
    paladin.id,
    {
      body: "knight",
      props: [{ prop: "hammer", hand: "right", scale: 1 }],
      tint: [],
      idle: { clip: "Melee_2H_Idle", speed: 1 },
      gestures: {
        attack: { clip: "Melee_2H_Attack_Chop", from: 0.2, strike: 0.8 },
        signature: { clip: "Hammer_Slam", from: 0, strike: HAMMER_SWING.impact },
      },
    },
  ],
  [
    berserker.id,
    {
      body: "barbarian",
      props: [{ prop: "axe", hand: "right", scale: 1 }],
      tint: [],
      idle: { clip: "Melee_2H_Idle", speed: 1 },
      gestures: {
        attack: { clip: "Melee_2H_Attack_Slice", from: 0.1, strike: 0.5 },
        signature: { clip: "Skeletons_Taunt", from: 0, strike: 0.55 },
        throw: { clip: "Throw", from: 0.2, strike: 0.7 },
      },
    },
  ],
  [
    firebrand.id,
    {
      body: "mage",
      props: [{ prop: "staff", hand: "right", scale: 1 }],
      tint: [
        { hues: ROBE_HUES, hue: 8, saturation: 1.9, lightness: 0.02 },
        { hues: CAPE_HUES, hue: 28, saturation: 1, lightness: 0.12 },
        { hues: ORB_HUES, hue: 24, saturation: 1.3, lightness: 0.02 },
      ],
      idle: { clip: "Idle_A", speed: 1 },
      gestures: {
        attack: { clip: "Ranged_Magic_Shoot", from: 0, strike: 0.25 },
        signature: { clip: "Ranged_Magic_Raise", from: 0, strike: 0.6 },
      },
    },
  ],
  [
    bubbleCleric.id,
    {
      body: "mage",
      props: [
        { prop: "crystalStaff", hand: "right", scale: 1 },
        { prop: "spellbook", hand: "left", scale: 0.8 },
      ],
      tint: [
        { hues: ROBE_HUES, hue: 202, saturation: 1.4, lightness: 0.34 },
        { hues: CAPE_HUES, hue: 44, saturation: 1, lightness: 0.16 },
      ],
      idle: { clip: "Idle_A", speed: 1 },
      gestures: {
        attack: { clip: "Ranged_Magic_Shoot", from: 0, strike: 0.25 },
        signature: { clip: "Ranged_Magic_Summon", from: 2.3, strike: 3.1 },
      },
    },
  ],
  [
    harpooner.id,
    {
      body: "ranger",
      props: [{ prop: "harpoon", hand: "right", scale: 0.85 }],
      tint: [],
      idle: { clip: "Idle_A", speed: 1 },
      gestures: {
        attack: { clip: "Throw", from: 0.3, strike: 0.7 },
        signature: { clip: "Fishing_Cast", from: 0.4, strike: 1.1 },
      },
    },
  ],
  [
    mags.id,
    {
      body: "mage",
      props: [{ prop: "staff", hand: "right", scale: 1 }],
      tint: [
        { hues: ROBE_HUES, hue: 285, saturation: 1.1, lightness: 0.05 },
        { hues: CAPE_HUES, hue: 120, saturation: 1.1, lightness: 0.08 },
      ],
      idle: { clip: "Idle_A", speed: 1 },
      gestures: {
        attack: { clip: "Throw", from: 0.3, strike: 0.7 },
        signature: { clip: "Ranged_Magic_Raise", from: 0, strike: 0.6 },
      },
    },
  ],
  [
    burr.id,
    {
      body: "knight",
      props: [{ prop: "staff", hand: "right", scale: 1 }],
      tint: [],
      idle: { clip: "Idle_A", speed: 1 },
      gestures: {
        attack: { clip: "Melee_2H_Attack_Slice", from: 0.1, strike: 0.5 },
        signature: { clip: "Ranged_Magic_Summon", from: 2.3, strike: 3.1 },
      },
    },
  ],
  [
    trainingDummy.id,
    {
      body: "skeletonMinion",
      props: [],
      tint: [],
      idle: { clip: "Skeletons_Idle", speed: 1 },
      gestures: {
        attack: { clip: "Melee_Unarmed_Attack_Punch_A", from: 0.1, strike: 0.5 },
      },
    },
  ],
]);

export function heroModel(heroId: HeroDefinitionId): HeroModel {
  const model = HERO_MODELS.get(heroId);

  if (model === undefined) {
    throw new Error(`Hero "${heroId}" has no model`);
  }

  return model;
}
