import { Vector3 } from "three";
import { BLESSED_BURST, ownCellCenter, TICK_RATE, type BoardCell } from "@jev-game/game";
import { blightmother, boardArena, hallowedPath, judgment, oathkeeper, resurrection } from "@jev-game/content";
import { createBattleEffects, PROJECTILE_SECONDS } from "../views/battle-effects.js";
import { createBoardStage, type ViewportInsets } from "../views/board-stage.js";
import { CHEST_FRACTION } from "../views/figure-base.js";
import {
  createHeroFigure,
  createPlaceholderFigure,
  placeholderTraits,
  type HeroFigure,
} from "../views/hero-figures.js";
import { emitHit, hitKind } from "../views/hit-effects.js";
import { createModelFigure } from "../views/model-figure.js";
import { createMorrowFigure } from "../views/morrow-figure.js";
import { sanctuaryVisual } from "../views/shrine-visuals.js";
import {
  castVisual,
  formVisual,
  hitVisual,
  landingVisual,
  mendVisual,
  projectileVisual,
  zoneVisual,
  type ProjectileVisual,
  type SpellVisual,
  type TickedVisual,
} from "../views/spell-visuals.js";
import { mountEnvironment } from "../environments/environment.js";
import { savedBoardTheme } from "../environments/board-choice.js";
import { models } from "../../models/library.js";
import { button, el } from "../../hud/dom.js";
import "./sculpt-lab.css";

export interface SandboxScene {
  dispose(): void;
}

interface Flight {
  readonly visual: ProjectileVisual;
  readonly seconds: number;
  readonly launch: () => Vector3;
  readonly aim: () => Vector3;
  readonly land: () => void;
  readonly delay: number;
  start: Vector3 | null;
  age: number;
}

const INSETS: ViewportInsets = { left: 24, right: 24, top: 76, bottom: 24 };

const TEAMS = ["#4ea1ff", "#ff6b6b"] as const;

const MORROW_CELL: BoardCell = { column: 3, row: 1 };

const BEFORE_CELL: BoardCell = { column: 1, row: 1 };

const NETTLE_CELL: BoardCell = { column: 5, row: 1 };

const GORRAK_CELL: BoardCell = { column: 6, row: 3 };

const WALK_CELL: BoardCell = { column: 3, row: 3 };

const WALK_SECONDS = 3.2;

const TURN_SPEED = 0.7;

const TARGETS: readonly (readonly [string, BoardCell])[] = [
  ["bulwark", { column: 2, row: 3 }],
  ["ravager", { column: 4, row: 2 }],
  ["pyromancer", { column: 5, row: 3 }],
];

const HEADBUTT_CONTACT = 0.15;

const AIM_SECONDS = 2.2;

const AVATAR_SCALE = 1.45;

const HALLOWED_TICKS = 60;

const RAISE_DELAY = 0.35;

const SANCTUARY_TICKS = 30;

const CLOSE_PITCH = 0.36;

const CLOSE_LOOK_HEIGHT = 7.5;

const CLOSE_HALF_WIDTH = 9.5;

const CLOSE_HALF_DEPTH = 7;

const CLOSE_HEIGHT = 22;

export function createSandboxScene(): SandboxScene {
  const root = el("div", "env-root");
  document.body.append(root);
  const canvasHost = el("div", "env-canvas sculpt-canvas");
  const caption = el("div", "env-caption", "Morrow · left: today's placeholder · allies: Nettle, Gorrak");
  const back = el("a", "pill-button env-back", "Menu");
  back.href = "#match";
  root.replaceChildren(canvasHost, back, caption);
  const stage = createBoardStage(canvasHost);
  stage.showBoard(boardArena, "south", INSETS);
  const environment = mountEnvironment(stage, savedBoardTheme(), boardArena);

  const place = (side: "south" | "north", cell: BoardCell): Vector3 =>
    stage.toScene(ownCellCenter(boardArena, side, cell), 0);

  const home = place("south", MORROW_CELL);
  const away = place("south", WALK_CELL);
  const near = stage.toScreen(home);
  const ahead = stage.toScreen(home.clone().add(new Vector3(0, 0, 1)));
  const facing = near !== null && ahead !== null && ahead.y < near.y ? Math.PI : 0;
  const morrow = createMorrowFigure(placeholderTraits(oathkeeper.id));
  const before = createPlaceholderFigure(oathkeeper.id);
  const nettle = createHeroFigure(blightmother.id);
  const allies: HeroFigure[] = [nettle];
  const spells = new Set<SpellVisual>();
  const zones = new Map<TickedVisual, number>();
  const flights = new Set<Flight>();
  const effects = createBattleEffects(stage.scene, stage.particles);
  const hallowedRadius = hallowedPath.zone?.radiusUnits ?? 10;
  const hallowedPeriod = hallowedPath.zone?.periodTicks ?? 15;
  let tick = 0;
  let aimAt: Vector3 | null = null;
  let aimClock = 0;
  let volley = 0;
  let team = 0;
  let turning = false;
  let walking = false;
  let walkClock = 0;
  let dead = false;
  let cheering = false;
  let avatar = false;
  let hallowed = false;
  let close = false;
  let grow = 1;
  let disposed = false;

  for (const [figure, at] of [
    [morrow, home],
    [before, place("south", BEFORE_CELL)],
    [nettle, place("south", NETTLE_CELL)],
  ] as const) {
    figure.setTeamColor(TEAMS[team]);
    figure.setCastsShadow(true);
    figure.root.position.copy(at);
    figure.root.rotation.y = facing;
    stage.scene.add(figure.root);
  }

  const targets = TARGETS.map(([heroId, cell]) => {
    const figure = createHeroFigure(heroId);
    const at = place("north", cell);
    figure.setTeamColor(TEAMS[1 - team]);
    figure.setCastsShadow(true);
    figure.root.position.copy(at);
    figure.root.rotation.y = Math.atan2(home.x - at.x, home.z - at.z);
    stage.scene.add(figure.root);

    return figure;
  });

  models
    .load("ravager")
    .then((model) => {
      if (disposed) {
        return;
      }

      const figure = createModelFigure(model, placeholderTraits("ravager"));
      figure.setTeamColor(TEAMS[team]);
      figure.root.position.copy(place("south", GORRAK_CELL));
      figure.root.rotation.y = facing;
      stage.scene.add(figure.root);
      allies.push(figure);
    })
    .catch(() => {});

  function both(act: (figure: HeroFigure) => void): void {
    act(morrow);
    act(before);
  }

  function show(visual: SpellVisual | null): void {
    if (visual !== null) {
      stage.scene.add(visual.root);
      spells.add(visual);
      visual.update(0);
    }
  }

  function chest(figure: HeroFigure): Vector3 {
    return figure.root.position.clone().setY(figure.height * CHEST_FRACTION * figure.root.scale.y);
  }

  function aim(at: Vector3): void {
    aimAt = at.clone();
    aimClock = AIM_SECONDS;
  }

  function nearest(): HeroFigure {
    return targets.reduce((best, target) =>
      target.root.position.distanceTo(morrow.root.position) < best.root.position.distanceTo(morrow.root.position)
        ? target
        : best,
    );
  }

  function fly(
    visual: ProjectileVisual | null,
    delay: number,
    launch: () => Vector3,
    toward: () => Vector3,
    land: () => void,
  ): void {
    if (visual === null) {
      land();

      return;
    }

    for (const object of visual.objects) {
      object.visible = false;
      stage.scene.add(object);
    }

    flights.add({
      visual,
      seconds: visual.seconds ?? PROJECTILE_SECONDS,
      launch,
      aim: toward,
      land,
      delay,
      start: null,
      age: 0,
    });
  }

  function steer(deltaSeconds: number): void {
    for (const flight of flights) {
      flight.age += deltaSeconds;
      const flown = (flight.age - flight.delay) / flight.seconds;

      if (flown < 0) {
        continue;
      }

      flight.start ??= flight.launch();

      for (const object of flight.visual.objects) {
        object.visible = true;
      }

      flight.visual.place(flight.start, flight.aim(), Math.min(1, flown));

      if (flown >= 1) {
        flight.land();
        flight.visual.dispose();
        flights.delete(flight);
      }
    }
  }

  function strike(target: HeroFigure, abilityId: string, heavy: boolean): void {
    target.trigger("hit");
    const heading = target.root.position.clone().sub(morrow.root.position).setY(0).normalize();
    emitHit(stage.particles, hitKind(abilityId), chest(target), heading, heavy);
    show(hitVisual(stage.particles, abilityId, target.root.position.clone(), chest(target)));
  }

  function shelter(figure: HeroFigure): void {
    const visual = sanctuaryVisual(stage.particles, figure.root.position.clone(), figure.height * figure.root.scale.y);
    show(visual);
    zones.set(visual, Math.floor(tick) + SANCTUARY_TICKS);
  }

  function hallow(at: Vector3): void {
    if (!hallowed) {
      return;
    }

    const visual = zoneVisual(
      stage.particles,
      hallowedPath.id,
      at.clone().setY(0),
      hallowedRadius,
      Math.floor(tick),
      hallowedPeriod,
    );

    if (visual !== null) {
      show(visual);
      zones.set(visual, Math.floor(tick) + HALLOWED_TICKS);
      visual.sync(Math.floor(tick));
    }
  }

  function bounce(path: readonly HeroFigure[], index: number, abilityId: string): void {
    const to = path[index];
    const from = index === 0 ? null : path[index - 1];
    const launch = (): Vector3 => (from === null ? morrow.castOrigin(new Vector3()) : chest(from));

    fly(
      projectileVisual(stage.particles, abilityId, launch()),
      0,
      launch,
      () => chest(to),
      () => {
        if (targets.includes(to)) {
          strike(to, abilityId, true);
        } else {
          show(mendVisual(stage.particles, abilityId, to.root.position.clone(), chest(to)));
        }

        hallow(to.root.position);

        if (index + 1 < path.length) {
          bounce(path, index + 1, abilityId);
        }
      },
    );
  }

  function attack(): void {
    const target = avatar ? targets[volley % targets.length] : nearest();
    volley += 1;
    aim(target.root.position);
    both((figure) => figure.trigger("attack"));

    if (avatar) {
      bounce([target, nettle, targets[(volley + 1) % targets.length]], 0, "avatar-judgment");

      return;
    }

    effects.delay(HEADBUTT_CONTACT, () => strike(target, oathkeeper.basicAttackId, false));
  }

  function throwJudgment(): void {
    const first = nearest();
    const second = targets.find((target) => target !== first) ?? first;
    aim(first.root.position);
    both((figure) => figure.trigger("cast"));
    bounce([first, nettle, second, allies[allies.length - 1], targets[2]], 0, judgment.id);
  }

  function raise(): void {
    nettle.setDead(true);

    effects.delay(1.2, () => {
      both((figure) => figure.trigger("cast"));
      show(
        castVisual(stage.particles, resurrection.id, morrow.root.position.clone(), 0, morrow.castOrigin(new Vector3())),
      );

      effects.delay(RAISE_DELAY, () => {
        show(landingVisual(stage.particles, resurrection.id, nettle.root.position.clone(), 20));
        nettle.setDead(false);

        for (const target of targets) {
          if (target.root.position.distanceTo(nettle.root.position) < 30) {
            target.trigger("hit");
          }
        }
      });
    });
  }

  function sanctify(): void {
    both((figure) => figure.trigger("cast"));
    show(
      castVisual(stage.particles, resurrection.id, morrow.root.position.clone(), 0, morrow.castOrigin(new Vector3())),
    );
    effects.delay(RAISE_DELAY, () => [morrow, ...allies].forEach(shelter));
  }

  function overflow(): void {
    show(landingVisual(stage.particles, BLESSED_BURST, morrow.root.position.clone(), 15));

    for (const target of targets) {
      if (target.root.position.distanceTo(morrow.root.position) < 20) {
        target.trigger("hit");
      }
    }
  }

  function transform(): void {
    avatar = !avatar;
    morrow.setForm(avatar ? "avatar" : null);

    if (avatar) {
      both((figure) => figure.trigger("cast"));
      show(formVisual(stage.particles, "avatar", morrow.root.position.clone(), 12));
    }
  }

  function frameClose(): void {
    close = !close;
    stage.frame(
      close
        ? {
            pitch: CLOSE_PITCH,
            target: morrow.root.position.clone().setY(CLOSE_LOOK_HEIGHT),
            halfWidth: CLOSE_HALF_WIDTH,
            halfDepth: CLOSE_HALF_DEPTH,
            height: CLOSE_HEIGHT,
          }
        : null,
    );
  }

  const closeToggle = button("pill-button env-toggle", () => toggle(() => frameClose()), "Close-up");
  const turnToggle = button("pill-button env-toggle", () => toggle(() => (turning = !turning)), "Turn");
  const walkToggle = button("pill-button env-toggle", () => toggle(() => (walking = !walking)), "Walk");
  const attackButton = button("pill-button env-toggle", attack, "Oath Hammer");
  const judgmentButton = button("pill-button env-toggle", throwJudgment, "Judgment");
  const hallowToggle = button("pill-button env-toggle", () => toggle(() => (hallowed = !hallowed)), "Hallowed");
  const raiseButton = button("pill-button env-toggle", raise, "Resurrection");
  const sanctifyButton = button("pill-button env-toggle", sanctify, "Sanctuary");
  const avatarToggle = button("pill-button env-toggle", () => toggle(transform), "Avatar");
  const overflowButton = button("pill-button env-toggle", overflow, "Overflow");
  const hitButton = button("pill-button env-toggle", () => both((figure) => figure.trigger("hit")), "Hit");

  const dieToggle = button(
    "pill-button env-toggle",
    () =>
      toggle(() => {
        dead = !dead;
        both((figure) => figure.setDead(dead));
      }),
    "Die",
  );

  const cheerToggle = button(
    "pill-button env-toggle",
    () =>
      toggle(() => {
        cheering = !cheering;
        both((figure) => figure.setCelebrating(cheering));
      }),
    "Cheer",
  );

  const teamToggle = button(
    "pill-button env-toggle",
    () =>
      toggle(() => {
        team = (team + 1) % TEAMS.length;

        for (const figure of [morrow, before, ...allies]) {
          figure.setTeamColor(TEAMS[team]);
        }

        for (const target of targets) {
          target.setTeamColor(TEAMS[1 - team]);
        }
      }),
    "Team",
  );

  function render(): void {
    closeToggle.classList.toggle("is-active", close);
    turnToggle.classList.toggle("is-active", turning);
    walkToggle.classList.toggle("is-active", walking);
    hallowToggle.classList.toggle("is-active", hallowed);
    avatarToggle.classList.toggle("is-active", avatar);
    dieToggle.classList.toggle("is-active", dead);
    cheerToggle.classList.toggle("is-active", cheering);
    teamToggle.classList.toggle("is-active", team !== 0);
  }

  function toggle(change: () => void): void {
    change();
    render();
  }

  const tools = el(
    "div",
    "env-tools",
    closeToggle,
    turnToggle,
    walkToggle,
    attackButton,
    judgmentButton,
    hallowToggle,
    raiseButton,
    sanctifyButton,
    avatarToggle,
    overflowButton,
    hitButton,
    dieToggle,
    cheerToggle,
    teamToggle,
  );

  root.append(tools);
  render();

  const stopFrames = stage.onFrame((deltaSeconds) => {
    if (walking) {
      walkClock += deltaSeconds;
    }

    tick += deltaSeconds * TICK_RATE;
    aimClock = Math.max(0, aimClock - deltaSeconds);
    grow += ((avatar ? AVATAR_SCALE : 1) - grow) * Math.min(1, deltaSeconds * 4);
    morrow.root.scale.setScalar(grow);
    const leg = (walkClock / WALK_SECONDS) % 2;
    const along = leg < 1 ? leg : 2 - leg;
    const going = leg < 1 ? away.clone().sub(home) : home.clone().sub(away);
    const aiming = aimAt !== null && aimClock > 0 ? aimAt.clone().sub(morrow.root.position) : null;
    const heading = walking ? Math.atan2(going.x, going.z) : aiming === null ? facing : Math.atan2(aiming.x, aiming.z);
    morrow.root.position.lerpVectors(home, away, along);

    both((figure) => {
      figure.setMoving(walking && !dead);
      figure.update(deltaSeconds);
    });

    morrow.root.rotation.y = turning ? morrow.root.rotation.y + deltaSeconds * TURN_SPEED : heading;
    before.root.rotation.y = morrow.root.rotation.y;

    for (const figure of [...allies, ...targets]) {
      figure.update(deltaSeconds);
    }

    effects.step(deltaSeconds);
    steer(deltaSeconds);

    for (const [zone, endTick] of zones) {
      zone.sync(Math.floor(tick));

      if (tick >= endTick) {
        zone.end();
        zones.delete(zone);
      }
    }

    for (const visual of spells) {
      visual.update(deltaSeconds);

      if (visual.finished()) {
        visual.dispose();
        spells.delete(visual);
      }
    }
  });

  if (import.meta.env.DEV) {
    Object.assign(window, { jevSandbox: { stage, morrow, before, nettle, targets } });
  }

  return {
    dispose() {
      disposed = true;
      stopFrames();

      for (const visual of spells) {
        visual.dispose();
      }

      effects.dispose();

      for (const flight of flights) {
        flight.visual.dispose();
      }

      for (const figure of [morrow, before, ...allies, ...targets]) {
        figure.dispose();
      }

      environment.dispose();
      stage.dispose();
      root.remove();
    },
  };
}
