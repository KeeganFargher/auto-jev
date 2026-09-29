import type { Vector2 } from "../math/vector.js";
import type { BattleResult } from "./result.js";
import type {
  BattleState,
  BubbleState,
  ChainState,
  FlightPath,
  LandingEffect,
  Motion,
  ProjectileState,
  UnitAction,
  UnitState,
} from "./state.js";

export interface BattleSnapshot {
  tick: number;
  tickLimit: number;
  arenaWidth: number;
  arenaHeight: number;
  arenaColumns: number;
  arenaRows: number;
  units: UnitState[];
  projectiles: ProjectileState[];
  bubbles: BubbleState[];
  chains: ChainState[];
  result: BattleResult | null;
}

function copyVector(vector: Vector2): Vector2 {
  return { x: vector.x, y: vector.y };
}

function copyPath(path: FlightPath): FlightPath {
  return {
    from: copyVector(path.from),
    bounce: path.bounce === null ? null : copyVector(path.bounce),
    to: copyVector(path.to),
    length: path.length,
  };
}

function copyLanding(landing: LandingEffect): LandingEffect {
  return { ...landing };
}

function copyMotion(motion: Motion): Motion {
  switch (motion.kind) {
    case "ground":
      return { kind: "ground" };
    case "flight":
      return { ...motion, path: copyPath(motion.path), landing: copyLanding(motion.landing) };
    case "float":
      return { ...motion, offset: copyVector(motion.offset) };
    case "skid":
      return { ...motion, from: copyVector(motion.from), to: copyVector(motion.to) };
    case "downed":
      return { ...motion };
  }
}

function copyAction(action: UnitAction): UnitAction {
  switch (action.kind) {
    case "hammerfall":
    case "big-bubble":
      return { ...action, center: copyVector(action.center) };
    case "idle":
    case "attack":
    case "rampage-grow":
    case "grab":
    case "short-fuse":
    case "yank":
      return { ...action };
  }
}

function copyUnit(unit: UnitState): UnitState {
  return {
    ...unit,
    position: copyVector(unit.position),
    facing: copyVector(unit.facing),
    action: copyAction(unit.action),
    motion: copyMotion(unit.motion),
    burning: unit.burning === null ? null : { ...unit.burning },
    primed: unit.primed === null ? null : { ...unit.primed },
    rampage: unit.rampage === null ? null : { ...unit.rampage },
  };
}

function copyProjectile(projectile: ProjectileState): ProjectileState {
  return { ...projectile, from: copyVector(projectile.from), payload: { ...projectile.payload } };
}

function copyBubble(bubble: BubbleState): BubbleState {
  const flight = bubble.flight;

  return {
    ...bubble,
    center: copyVector(bubble.center),
    memberUnitIds: [...bubble.memberUnitIds],
    flight:
      flight === null
        ? null
        : { ...flight, path: copyPath(flight.path), landing: copyLanding(flight.landing) },
  };
}

function copyChain(chain: ChainState): ChainState {
  return { ...chain, unitIds: [...chain.unitIds], pairs: [...chain.pairs] };
}

function copyResult(result: BattleResult): BattleResult {
  return { ...result, damageDealt: { ...result.damageDealt } };
}

export function getBattleSnapshot(state: BattleState): BattleSnapshot {
  return {
    tick: state.tick,
    tickLimit: state.tickLimit,
    arenaWidth: state.arenaWidth,
    arenaHeight: state.arenaHeight,
    arenaColumns: state.arenaColumns,
    arenaRows: state.arenaRows,
    units: state.units.map(copyUnit),
    projectiles: state.projectiles.map(copyProjectile),
    bubbles: state.bubbles.map(copyBubble),
    chains: state.chains.map(copyChain),
    result: state.result === null ? null : copyResult(state.result),
  };
}
