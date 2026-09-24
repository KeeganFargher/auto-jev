export const MODEL_KINDS = ["heroes", "props", "board"] as const;

export type ModelKind = (typeof MODEL_KINDS)[number];

export interface ModelBudget {
  triangles: number;
  textures: number;
  textureSize: number;
  joints: number;
}

export interface ClipRule {
  name: string;
  minSeconds: number;
  maxSeconds: number;
  optional: boolean;
}

export interface FootprintAllowance {
  radius: number;
  reason: string;
}

export const KIND_BUDGETS = {
  heroes: { triangles: 8000, textures: 1, textureSize: 1024, joints: 60 },
  props: { triangles: 2000, textures: 1, textureSize: 1024, joints: 0 },
  board: { triangles: 500, textures: 1, textureSize: 1024, joints: 0 },
} as const satisfies Record<ModelKind, ModelBudget>;

export const ASSET_BUDGETS = new Map<string, ModelBudget>([
  ["board/frame", { triangles: 20000, textures: 1, textureSize: 2048, joints: 0 }],
  ["board/environment", { triangles: 60000, textures: 2, textureSize: 2048, joints: 0 }],
]);

export const HERO_CLIPS: readonly ClipRule[] = [
  { name: "idle", minSeconds: 2, maxSeconds: 4, optional: false },
  { name: "run", minSeconds: 0.5, maxSeconds: 0.9, optional: false },
  { name: "attack", minSeconds: 0.5, maxSeconds: 0.8, optional: false },
  { name: "cast", minSeconds: 0.6, maxSeconds: 1, optional: false },
  { name: "hit", minSeconds: 0.2, maxSeconds: 0.4, optional: false },
  { name: "death", minSeconds: 0.8, maxSeconds: 1.5, optional: false },
  { name: "victory", minSeconds: 2, maxSeconds: 4, optional: true },
  { name: "channel", minSeconds: 0.4, maxSeconds: 2, optional: true },
];

export const ROOTED_HEROES: ReadonlySet<string> = new Set(["turret"]);

export const TEAM_MATERIAL = "team";

export const RESERVED_COLORS = [
  { name: "your side blue #4ea1ff", linear: [0.0762, 0.3564, 1] },
  { name: "their side red #ff6b6b", linear: [1, 0.147, 0.147] },
] as const;

export const HERO_HEIGHT_METRES = { min: 1.4, max: 2.4 } as const;

export const FOOTPRINT_RADIUS_METRES = 0.5;

export const REFERENCE_HEIGHT_METRES = 1.8;

export const FOOTPRINT_ALLOWANCES = new Map<string, FootprintAllowance>([
  [
    "heroes/ravager",
    { radius: 0.8, reason: "a hulking berserker holding two axes out; measured 0.77 m at 1.8 m tall" },
  ],
]);

export const FLOOR_TOLERANCE_METRES = 0.03;

export const CLIP_TOLERANCE_SECONDS = 0.02;

export function footprintFor(kind: ModelKind, id: string): FootprintAllowance {
  return (
    FOOTPRINT_ALLOWANCES.get(`${kind}/${id}`) ?? {
      radius: FOOTPRINT_RADIUS_METRES,
      reason: "the contract's 1 m circle",
    }
  );
}

export function budgetFor(kind: ModelKind, id: string): ModelBudget {
  return ASSET_BUDGETS.get(`${kind}/${id}`) ?? KIND_BUDGETS[kind];
}

export function isModelKind(value: string): value is ModelKind {
  return MODEL_KINDS.some((kind) => kind === value);
}
