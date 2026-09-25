import { Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from "three";
import { boardCellCenter, ownCellAt, ownCellToBoardCell, sideRows, type BoardCell, type BoardGrid } from "@jev-game/game";
import type { BoardStage, ViewportInsets } from "./board-stage.js";
import { createHeroFigure, levelFigureScale, type HeroFigure } from "./hero-figures.js";

export interface FormationView {
  setFormation(formation: readonly BoardCell[]): void;
  setLevels(levels: readonly number[]): void;
  setLocked(locked: boolean): void;
  dispose(): void;
}

export interface FormationViewOptions {
  grid: BoardGrid;
  insets: ViewportInsets;
  heroIds: readonly string[];
  heroLevels: readonly number[];
  formation: readonly BoardCell[];
  onChange: (formation: BoardCell[]) => void;
}

const FRIENDLY_COLOR = "#4ea1ff";

const VALID_COLOR = "#e2bd5c";

const ZONE_COLOR = "#4ea1ff";

const LIFT_UNITS = 3.5;

const PICK_RADIUS_PIXELS = 48;

const SETTLE_SMOOTHING = 16;

const CELL_INSET = 0.9;

const FACING_ENEMY = Math.PI;

const LEVEL_UP_SECONDS = 0.7;

const LEVEL_UP_SWELL = 0.35;

interface PlacedHero {
  figure: HeroFigure;
  position: Vector3;
  level: number;
  levelUp: number;
}

function sameCell(first: BoardCell, second: BoardCell): boolean {
  return first.column === second.column && first.row === second.row;
}

export function createFormationView(stage: BoardStage, options: FormationViewOptions): FormationView {
  const { grid } = options;
  const size = grid.width / grid.columns;
  let formation = options.formation.map((cell) => ({ ...cell }));
  let dragSlot: number | null = null;
  let hoverCell: BoardCell | null = null;
  let locked = false;

  stage.showBoard(grid, "south", options.insets);

  const zoneGeometry = new PlaneGeometry(grid.width, (grid.height / grid.rows) * sideRows(grid));

  const zone = new Mesh(
    zoneGeometry,
    new MeshBasicMaterial({ color: ZONE_COLOR, transparent: true, opacity: 0, depthWrite: false }),
  );

  zone.rotation.x = -Math.PI / 2;
  zone.position.set(0, 0.05, (grid.height * sideRows(grid)) / grid.rows / 2);

  const cellGeometry = new PlaneGeometry(size * CELL_INSET, size * CELL_INSET);

  const highlight = new Mesh(
    cellGeometry,
    new MeshBasicMaterial({ color: VALID_COLOR, transparent: true, opacity: 0.55, depthWrite: false }),
  );

  highlight.rotation.x = -Math.PI / 2;
  highlight.visible = false;
  stage.scene.add(zone, highlight);

  function cellCenter(cell: BoardCell): Vector3 {
    return stage.toScene(boardCellCenter(grid, ownCellToBoardCell(grid, "south", cell)), 0);
  }

  const heroes: PlacedHero[] = options.heroIds.map((heroId, slot) => {
    const figure = createHeroFigure(heroId);
    figure.setTeamColor(FRIENDLY_COLOR);
    figure.root.rotation.y = FACING_ENEMY;
    stage.scene.add(figure.root);
    const cell = formation[slot];

    return { figure, position: cell === undefined ? new Vector3() : cellCenter(cell), level: options.heroLevels[slot] ?? 1, levelUp: 0 };
  });

  function pickSlot(clientX: number, clientY: number): number | null {
    const rect = stage.canvas.getBoundingClientRect();
    let closest: number | null = null;
    let closestDistance = PICK_RADIUS_PIXELS;

    for (let slot = 0; slot < heroes.length; slot += 1) {
      const hero = heroes[slot]!;
      const point = stage.toScreen(hero.position.clone().setY(hero.figure.height * 0.5));

      if (point === null) {
        continue;
      }

      const distance = Math.hypot(point.x - (clientX - rect.left), point.y - (clientY - rect.top));

      if (distance < closestDistance) {
        closest = slot;
        closestDistance = distance;
      }
    }

    return closest;
  }

  function cellUnder(clientX: number, clientY: number): BoardCell | null {
    const point = stage.groundPointAt(clientX, clientY);

    return point === null ? null : ownCellAt(grid, "south", point);
  }

  function handlePointerDown(event: PointerEvent): void {
    const slot = locked ? null : pickSlot(event.clientX, event.clientY);

    if (slot === null) {
      return;
    }

    dragSlot = slot;
    hoverCell = formation[slot] ?? null;
    stage.canvas.setPointerCapture(event.pointerId);
    stage.canvas.style.cursor = "grabbing";
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (dragSlot === null) {
      stage.canvas.style.cursor = locked || pickSlot(event.clientX, event.clientY) === null ? "" : "grab";

      return;
    }

    hoverCell = cellUnder(event.clientX, event.clientY);
    const ground = stage.groundPointAt(event.clientX, event.clientY);
    const hero = heroes[dragSlot];

    if (hero !== undefined && ground !== null) {
      const target = stage.toScene(
        { x: Math.min(grid.width, Math.max(0, ground.x)), y: Math.min(grid.height, Math.max(0, ground.y)) },
        0,
      );

      hero.position.set(target.x, 0, target.z);
    }
  }

  function finishDrag(event: PointerEvent, commit: boolean): void {
    if (dragSlot === null) {
      return;
    }

    const slot = dragSlot;
    const dropCell = commit && !locked ? cellUnder(event.clientX, event.clientY) : null;
    dragSlot = null;
    hoverCell = null;
    stage.canvas.style.cursor = "";

    if (stage.canvas.hasPointerCapture(event.pointerId)) {
      stage.canvas.releasePointerCapture(event.pointerId);
    }

    const current = formation[slot];

    if (dropCell === null || current === undefined || sameCell(dropCell, current)) {
      return;
    }

    const next = formation.map((cell) => ({ ...cell }));
    const occupant = next.findIndex((cell, index) => index !== slot && sameCell(cell, dropCell));

    if (occupant !== -1) {
      next[occupant] = { ...current };
    }

    next[slot] = { ...dropCell };
    formation = next;
    options.onChange(next.map((cell) => ({ ...cell })));
  }

  function handlePointerUp(event: PointerEvent): void {
    finishDrag(event, true);
  }

  function handlePointerCancel(event: PointerEvent): void {
    finishDrag(event, false);
  }

  stage.canvas.addEventListener("pointerdown", handlePointerDown);
  stage.canvas.addEventListener("pointermove", handlePointerMove);
  stage.canvas.addEventListener("pointerup", handlePointerUp);
  stage.canvas.addEventListener("pointercancel", handlePointerCancel);

  const stopFrames = stage.onFrame((deltaSeconds) => {
    const blend = 1 - Math.exp(-SETTLE_SMOOTHING * deltaSeconds);

    heroes.forEach((hero, slot) => {
      const dragging = slot === dragSlot;
      const cell = formation[slot];

      if (!dragging && cell !== undefined) {
        hero.position.lerp(cellCenter(cell), blend);
      }

      const lift = dragging ? LIFT_UNITS : 0;
      const height = hero.figure.root.position.y + (lift - hero.figure.root.position.y) * blend;
      hero.figure.root.position.set(hero.position.x, height, hero.position.z);
      hero.levelUp = Math.max(0, hero.levelUp - deltaSeconds / LEVEL_UP_SECONDS);
      hero.figure.root.scale.setScalar(levelFigureScale(hero.level) * (1 + LEVEL_UP_SWELL * Math.sin(hero.levelUp * Math.PI)));
      hero.figure.setMoving(dragging);
      hero.figure.update(deltaSeconds);
    });

    zone.material.opacity = dragSlot === null ? 0 : 0.12;

    if (hoverCell === null) {
      highlight.visible = false;

      return;
    }

    const center = cellCenter(hoverCell);
    highlight.visible = true;
    highlight.position.set(center.x, 0.08, center.z);
  });

  return {
    setFormation(next) {
      if (dragSlot !== null) {
        return;
      }

      formation = next.map((cell) => ({ ...cell }));
    },

    setLevels(levels) {
      heroes.forEach((hero, slot) => {
        const level = levels[slot] ?? hero.level;

        if (level > hero.level) {
          hero.levelUp = 1;
        }

        hero.level = level;
      });
    },

    setLocked(isLocked) {
      locked = isLocked;

      if (locked) {
        dragSlot = null;
        hoverCell = null;
        stage.canvas.style.cursor = "";
      }
    },

    dispose() {
      stopFrames();
      stage.canvas.removeEventListener("pointerdown", handlePointerDown);
      stage.canvas.removeEventListener("pointermove", handlePointerMove);
      stage.canvas.removeEventListener("pointerup", handlePointerUp);
      stage.canvas.removeEventListener("pointercancel", handlePointerCancel);
      stage.canvas.style.cursor = "";

      for (const hero of heroes) {
        hero.figure.dispose();
      }

      zone.removeFromParent();
      zone.material.dispose();
      highlight.removeFromParent();
      highlight.material.dispose();
      zoneGeometry.dispose();
      cellGeometry.dispose();
    },
  };
}
