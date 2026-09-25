import { Vector3, type Mesh } from "three";
import { ownCellCenter, type BoardCell, type BoardSide } from "@jev-game/game";
import { boardArena, hex, hexbinder, sharedFate, spiteBolt } from "@jev-game/content";
import { createBoardStage, type BoardStage, type ViewportInsets } from "../views/board-stage.js";
import { createHeroFigure, type HeroFigure } from "../views/hero-figures.js";
import { CHEST_FRACTION } from "../views/figure-base.js";
import { mountEnvironment } from "../environments/environment.js";
import { savedBoardTheme } from "../environments/board-choice.js";
import {
  castVisual,
  landingVisual,
  passiveVisual,
  projectileVisual,
  releaseDelay,
  type SpellVisual,
} from "../views/spell-visuals.js";
import { deathKnell, HEX_POP_SECONDS, KNELL_HEIGHT, KNELL_TOLL_SECONDS } from "../views/fate-visuals.js";
import { createFateThreads, type Tie } from "../views/fate-threads.js";
import { createHexCritters, type HexedUnit } from "../views/hex-critters.js";
import { emitHit } from "../views/hit-effects.js";

export type BenchSpell = "spite" | "hex" | "weaver" | "fate" | "puppets" | "pulse" | "knell" | "omen" | "reset";

export const BENCH_SPELLS: readonly BenchSpell[] = [
  "spite",
  "hex",
  "weaver",
  "fate",
  "puppets",
  "pulse",
  "knell",
  "omen",
  "reset",
];

export interface SpellBench {
  readonly stage: BoardStage;
  fire(spell: BenchSpell): void;
  dispose(): void;
}

interface Dummy {
  readonly unitId: string;
  readonly figure: HeroFigure;
  readonly position: Vector3;
  readonly yaw: number;
  readonly teamColor: string;
  hexed: number;
  dead: boolean;
}

interface Flight {
  readonly objects: readonly Mesh[];
  readonly place: (from: Vector3, to: Vector3, progress: number) => void;
  readonly dispose: () => void;
  readonly from: () => Vector3;
  readonly target: Dummy;
  readonly delay: number;
  readonly seconds: number;
  readonly onLand: () => void;
  launch: Vector3 | null;
  age: number;
}

interface Timer {
  at: number;
  readonly run: () => void;
}

const INSETS: ViewportInsets = { left: 24, right: 24, top: 76, bottom: 24 };

const ALLY_TEAM = "#4ea1ff";

const ENEMY_TEAM = "#ff6b6b";

const MOIRA_CELL: BoardCell = { column: 3, row: 1 };

const ENEMIES: readonly (readonly [string, BoardCell])[] = [
  ["ravager", { column: 3, row: 2 }],
  ["bulwark", { column: 4, row: 2 }],
  ["pyromancer", { column: 2, row: 3 }],
  ["frostweaver", { column: 5, row: 3 }],
];

const BOND_SECONDS = 5;

const PUPPET_SECONDS = 2.5;

const HEX_SECONDS = 2;

const FLIGHT_SECONDS = 0.16;

const HEX_RADIUS = 6;

const WEAVER_RADIUS = 9;

const KNELL_RADIUS = 14;

const FATE_RADIUS = 40;

const LINK_ID = 1;

function yawTowards(from: Vector3, to: Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function createSpellBench(host: HTMLElement): SpellBench {
  const stage = createBoardStage(host);
  stage.showBoard(boardArena, "south", INSETS);
  const environment = mountEnvironment(stage, savedBoardTheme(), boardArena);
  const place = (side: BoardSide, cell: BoardCell): Vector3 => stage.toScene(ownCellCenter(boardArena, side, cell), 0);
  const moiraAt = place("south", MOIRA_CELL);
  const cluster = new Vector3();

  for (const [, cell] of ENEMIES) {
    cluster.add(place("north", cell));
  }

  cluster.divideScalar(ENEMIES.length);
  const moira = createHeroFigure(hexbinder.id);
  moira.setTeamColor(ALLY_TEAM);
  moira.root.position.copy(moiraAt);
  moira.root.rotation.y = yawTowards(moiraAt, cluster);
  stage.scene.add(moira.root);

  const enemies: Dummy[] = ENEMIES.map(([heroId, cell], index) => {
    const position = place("north", cell);
    const figure = createHeroFigure(heroId);
    const yaw = yawTowards(position, moiraAt);
    figure.setTeamColor(ENEMY_TEAM);
    figure.root.position.copy(position);
    figure.root.rotation.y = yaw;
    stage.scene.add(figure.root);

    return { unitId: `B-${index + 1}`, figure, position, yaw, teamColor: ENEMY_TEAM, hexed: 0, dead: false };
  });

  const threads = createFateThreads(stage.particles);
  const critters = createHexCritters(stage.particles);
  stage.scene.add(threads.root, critters.root);
  const visuals = new Set<SpellVisual>();
  const flights = new Set<Flight>();
  const timers = new Set<Timer>();
  let time = 0;
  let bondLeft = 0;
  let puppetLeft = 0;

  const chestOf = (dummy: Dummy): Vector3 => dummy.position.clone().setY(dummy.figure.height * CHEST_FRACTION);
  const living = (): Dummy[] => enemies.filter((dummy) => !dummy.dead);
  const bound = (): Dummy[] => (bondLeft > 0 ? living() : []);

  function show(visual: SpellVisual | null): void {
    if (visual !== null) {
      stage.scene.add(visual.root);
      visuals.add(visual);
      visual.update(0);
    }
  }

  function later(seconds: number, run: () => void): void {
    timers.add({ at: time + seconds, run });
  }

  function fly(abilityId: string, from: () => Vector3, target: Dummy, delay: number, onLand: () => void): void {
    const visual = projectileVisual(stage.particles, abilityId, from());

    if (visual === null) {
      later(delay, onLand);

      return;
    }

    for (const object of visual.objects) {
      object.visible = false;
      stage.scene.add(object);
    }

    flights.add({
      objects: visual.objects,
      place: (start, end, progress) => visual.place(start, end, progress),
      dispose: () => visual.dispose(),
      from,
      target,
      delay,
      seconds: visual.seconds ?? FLIGHT_SECONDS,
      onLand,
      launch: null,
      age: 0,
    });
  }

  function strike(target: Dummy, from: Vector3, heavy: boolean): void {
    const chest = chestOf(target);
    emitHit(stage.particles, "fate", chest, chest.clone().sub(from).setY(0).normalize(), heavy);
    target.figure.trigger("hit");
  }

  function shareAlong(struck: Dummy): void {
    for (const other of bound()) {
      if (other !== struck) {
        fly(
          sharedFate.id,
          () => chestOf(struck),
          other,
          0,
          () => strike(other, struck.position, false),
        );
      }
    }
  }

  function spite(target: Dummy): void {
    moira.trigger("attack");
    fly(
      spiteBolt.id,
      () => moira.castOrigin(new Vector3()),
      target,
      releaseDelay(spiteBolt.id),
      () => {
        strike(target, moiraAt, false);

        if (bound().includes(target)) {
          shareAlong(target);
        }
      },
    );
  }

  function hexOn(target: Dummy): void {
    target.hexed = HEX_SECONDS + HEX_POP_SECONDS;
    show(landingVisual(stage.particles, hex.id, target.position.clone(), HEX_RADIUS));
    critters.transform(target.unitId, HEX_POP_SECONDS);
  }

  function bind(puppets: boolean): void {
    moira.trigger("cast");
    show(castVisual(stage.particles, sharedFate.id, cluster.clone(), FATE_RADIUS, moira.castOrigin(new Vector3())));
    bondLeft = BOND_SECONDS;
    puppetLeft = puppets ? PUPPET_SECONDS : 0;
  }

  function ensureBound(): Dummy[] {
    if (bondLeft <= 0) {
      bondLeft = BOND_SECONDS;
    }

    return bound();
  }

  function reset(): void {
    for (const visual of visuals) {
      visual.dispose();
    }

    for (const flight of flights) {
      flight.dispose();
    }

    visuals.clear();
    flights.clear();
    timers.clear();
    threads.clear();
    critters.clear();
    bondLeft = 0;
    puppetLeft = 0;

    for (const dummy of enemies) {
      dummy.dead = false;
      dummy.hexed = 0;
      dummy.figure.setDead(false);
      dummy.figure.root.scale.setScalar(1);
    }
  }

  const spells: Record<BenchSpell, () => void> = {
    spite: () => spite(living()[0] ?? enemies[0]!),
    hex: () => {
      moira.trigger("cast");
      hexOn(living().at(-1) ?? enemies[0]!);
    },
    weaver: () => {
      moira.trigger("cast");
      show(passiveVisual(stage.particles, "threads", moiraAt.clone(), WEAVER_RADIUS));
      const [first, ...rest] = living().reverse();

      if (first === undefined) {
        return;
      }

      hexOn(first);

      for (const other of rest.slice(0, 2)) {
        fly(
          hex.id,
          () => chestOf(first),
          other,
          0,
          () => hexOn(other),
        );
      }
    },
    fate: () => bind(false),
    puppets: () => bind(true),
    pulse: () => {
      const [struck] = ensureBound();

      if (struck !== undefined) {
        spite(struck);
      }
    },
    knell: () => {
      const [fallen, ...others] = ensureBound();

      if (fallen === undefined) {
        return;
      }

      fallen.dead = true;
      fallen.figure.setDead(true);
      show(deathKnell(stage.particles, fallen.position.clone(), KNELL_RADIUS));

      for (const other of others) {
        fly(
          "death-knell",
          () => fallen.position.clone().setY(KNELL_HEIGHT),
          other,
          KNELL_TOLL_SECONDS,
          () => strike(other, fallen.position, true),
        );
      }
    },
    omen: () => {
      const [detonated, ...others] = ensureBound();

      if (detonated === undefined) {
        return;
      }

      strike(detonated, moiraAt, true);

      for (const other of others) {
        fly(
          "ill-omen",
          () => chestOf(detonated),
          other,
          0,
          () => strike(other, detonated.position, true),
        );
      }
    },
    reset,
  };

  function stepFlights(deltaSeconds: number): void {
    for (const flight of flights) {
      flight.age += deltaSeconds;
      const flying = flight.age >= flight.delay;
      flight.launch ??= flying ? flight.from() : null;
      const progress = Math.min(1, Math.max(0, (flight.age - flight.delay) / flight.seconds));

      for (const object of flight.objects) {
        object.visible = flying;
      }

      flight.place(flight.launch ?? flight.from(), chestOf(flight.target), progress);

      if (progress >= 1) {
        flight.dispose();
        flights.delete(flight);
        flight.onLand();
      }
    }
  }

  const stopFrames = stage.onFrame((deltaSeconds) => {
    time += deltaSeconds;
    bondLeft = Math.max(0, bondLeft - deltaSeconds);
    puppetLeft = Math.max(0, puppetLeft - deltaSeconds);
    moira.update(deltaSeconds);

    for (const timer of timers) {
      if (time >= timer.at) {
        timers.delete(timer);
        timer.run();
      }
    }

    stepFlights(deltaSeconds);

    const ties: Tie[] = bound().map((dummy) => ({
      linkId: LINK_ID,
      unitId: dummy.unitId,
      chest: chestOf(dummy),
      crown: dummy.position.clone().setY(dummy.figure.height),
      puppet: puppetLeft > 0,
    }));

    threads.update(ties, deltaSeconds);
    const hexed: HexedUnit[] = [];

    for (const dummy of enemies) {
      dummy.hexed = Math.max(0, dummy.hexed - deltaSeconds);

      if (dummy.hexed > 0) {
        hexed.push({ unitId: dummy.unitId, position: dummy.position, yaw: dummy.yaw, teamColor: dummy.teamColor });
      }
    }

    critters.update(hexed, deltaSeconds);

    for (const dummy of enemies) {
      dummy.figure.root.scale.setScalar(critters.figureScale(dummy.unitId));
      dummy.figure.update(deltaSeconds);
    }

    for (const visual of visuals) {
      visual.update(deltaSeconds);

      if (visual.finished()) {
        visuals.delete(visual);
        visual.dispose();
      }
    }
  });

  return {
    stage,

    fire(spell) {
      spells[spell]();
    },

    dispose() {
      stopFrames();
      reset();
      threads.dispose();
      critters.dispose();
      moira.dispose();

      for (const dummy of enemies) {
        dummy.figure.dispose();
      }

      environment.dispose();
      stage.dispose();
    },
  };
}
