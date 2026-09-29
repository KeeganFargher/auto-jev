import type { TeamId, UnitId } from "../ids.js";
import type { SetupState, SignatureKind } from "../definitions.js";
import type { Vector2 } from "../math/vector.js";
import type { BattleResult } from "./result.js";
import type {
  BattleState,
  BubbleFlight,
  BubbleKind,
  FlightMotion,
  LaunchCause,
  ProjectilePayload,
} from "./state.js";

export type DamageCause =
  | "attack"
  | "splash"
  | "hammer"
  | "throw"
  | "bowling"
  | "blast"
  | "burn"
  | "yank";

export type HealCause = "attack" | "safety-bubble";

export type IgniteCause = "fuse" | "touch" | "comet" | "bubble";

export type Beat =
  | { kind: "slow"; rate: number; ticks: number }
  | { kind: "freeze"; seconds: number };

interface EventBase {
  tick: number;
  sequence: number;
}

export interface AttackEvent extends EventBase {
  kind: "attack";
  sourceUnitId: UnitId;
  targetUnitId: UnitId;
  delivery: "melee" | "projectile";
  hitTick: number;
}

export interface ProjectileEvent extends EventBase {
  kind: "projectile";
  projectileId: number;
  sourceUnitId: UnitId;
  targetUnitId: UnitId;
  payload: ProjectilePayload["kind"];
  arrivalTick: number;
}

export interface DamageEvent extends EventBase {
  kind: "damage";
  sourceUnitId: UnitId;
  targetUnitId: UnitId;
  amount: number;
  crit: boolean;
  cause: DamageCause;
  hpAfter: number;
}

export interface HealEvent extends EventBase {
  kind: "heal";
  sourceUnitId: UnitId;
  targetUnitId: UnitId;
  amount: number;
  cause: HealCause;
  hpAfter: number;
}

export interface SignatureEvent extends EventBase {
  kind: "signature";
  unitId: UnitId;
  signature: SignatureKind;
  targetUnitId: UnitId | null;
  point: Vector2;
  releaseTick: number;
  wanted: boolean;
}

export interface HammerImpactEvent extends EventBase {
  kind: "hammer-impact";
  unitId: UnitId;
  center: Vector2;
  radius: number;
  hitUnitIds: UnitId[];
}

export interface RampageEvent extends EventBase {
  kind: "rampage";
  unitId: UnitId;
  phase: "grow" | "big" | "shrink" | "end";
  size: number;
}

export interface GrabEvent extends EventBase {
  kind: "grab";
  unitId: UnitId;
  targetUnitId: UnitId;
  throwTick: number;
}

export interface ThrowEvent extends EventBase {
  kind: "throw";
  unitId: UnitId;
  targetUnitId: UnitId;
  destination: Vector2;
}

export interface YankEvent extends EventBase {
  kind: "yank";
  unitId: UnitId;
  targetUnitId: UnitId;
  destination: Vector2;
}

export interface LaunchEvent extends EventBase {
  kind: "launch";
  unitId: UnitId;
  motion: FlightMotion;
  juggle: boolean;
}

export interface LandEvent extends EventBase {
  kind: "land";
  unitId: UnitId;
  position: Vector2;
  hard: boolean;
  cause: LaunchCause;
}

export interface DownedEvent extends EventBase {
  kind: "downed";
  unitId: UnitId;
  untilTick: number;
}

export interface GetUpEvent extends EventBase {
  kind: "get-up";
  unitId: UnitId;
}

export interface StunEvent extends EventBase {
  kind: "stun";
  unitId: UnitId;
  untilTick: number;
}

export interface BubbleEvent extends EventBase {
  kind: "bubble";
  bubbleId: number;
  bubbleKind: BubbleKind;
  ownerUnitId: UnitId;
  memberUnitIds: UnitId[];
  center: Vector2;
  radius: number;
  floatHeight: number;
  endTick: number;
}

export interface BubbleLaunchEvent extends EventBase {
  kind: "bubble-launch";
  bubbleId: number;
  flight: BubbleFlight;
}

export interface PopEvent extends EventBase {
  kind: "pop";
  bubbleId: number;
  center: Vector2;
  elevation: number;
  memberUnitIds: UnitId[];
}

export interface PrimeEvent extends EventBase {
  kind: "prime";
  unitId: UnitId;
  makerUnitId: UnitId;
  fuseId: number;
  explodeTick: number;
}

export interface IgniteEvent extends EventBase {
  kind: "ignite";
  unitId: UnitId;
  sourceUnitId: UnitId;
  fuseId: number;
  hop: number;
  cause: IgniteCause;
}

export interface BurnEndEvent extends EventBase {
  kind: "burn-end";
  unitId: UnitId;
}

export interface ExplodeEvent extends EventBase {
  kind: "explode";
  unitId: UnitId;
  makerUnitId: UnitId;
  center: Vector2;
  elevation: number;
  radius: number;
  hotPotato: boolean;
}

export interface ComboLinkEvent extends EventBase {
  kind: "combo-link";
  teamId: TeamId;
  count: number;
  setupUnitId: UnitId;
  payoffUnitId: UnitId;
  targetUnitId: UnitId;
  state: SetupState;
  unitIds: UnitId[];
}

export interface BeatEvent extends EventBase {
  kind: "beat";
  beat: Beat;
}

export interface DeathEvent extends EventBase {
  kind: "death";
  unitId: UnitId;
  killerUnitId: UnitId;
}

export interface BattleEndedEvent extends EventBase {
  kind: "battle-ended";
  result: BattleResult;
}

export type BattleEvent =
  | AttackEvent
  | ProjectileEvent
  | DamageEvent
  | HealEvent
  | SignatureEvent
  | HammerImpactEvent
  | RampageEvent
  | GrabEvent
  | ThrowEvent
  | YankEvent
  | LaunchEvent
  | LandEvent
  | DownedEvent
  | GetUpEvent
  | StunEvent
  | BubbleEvent
  | BubbleLaunchEvent
  | PopEvent
  | PrimeEvent
  | IgniteEvent
  | BurnEndEvent
  | ExplodeEvent
  | ComboLinkEvent
  | BeatEvent
  | DeathEvent
  | BattleEndedEvent;

export type BattleEventKind = BattleEvent["kind"];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type BattleEventInput = DistributiveOmit<BattleEvent, "tick" | "sequence">;

export interface StepContext {
  state: BattleState;
  events: BattleEvent[];
}

export function emit(ctx: StepContext, event: BattleEventInput): void {
  const sequence = ctx.state.sequence;
  ctx.state.sequence += 1;
  ctx.events.push({ ...event, tick: ctx.state.tick, sequence });
}
