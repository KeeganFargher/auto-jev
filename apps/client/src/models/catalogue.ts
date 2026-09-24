export type ModelKind = "heroes" | "props" | "board";

export type ChannelEffect = "cyclone";

export interface ModelDefinition {
  url: string;
  kind: ModelKind;
  channelEffect?: ChannelEffect;
  boardHeight?: number;
}

const MODEL_ROOT = "/assets/models";

export const MODELS = {
  bulwark: { url: `${MODEL_ROOT}/heroes/bulwark.glb`, kind: "heroes" },
  ravager: { url: `${MODEL_ROOT}/heroes/ravager.glb`, kind: "heroes", channelEffect: "cyclone" },
  pyromancer: { url: `${MODEL_ROOT}/heroes/pyromancer.glb`, kind: "heroes", boardHeight: 8.3 },
  crate: { url: `${MODEL_ROOT}/props/crate.glb`, kind: "props" },
  barrel: { url: `${MODEL_ROOT}/props/barrel.glb`, kind: "props" },
} as const satisfies Record<string, ModelDefinition>;

export type ModelId = keyof typeof MODELS;

export const MODEL_IDS: readonly ModelId[] = Object.keys(MODELS).filter(isModelId);

export function isModelId(value: string): value is ModelId {
  return Object.hasOwn(MODELS, value);
}
