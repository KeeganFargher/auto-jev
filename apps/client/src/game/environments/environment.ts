import { PlaneGeometry, type Object3D } from "three";
import type { BoardGrid } from "@jev-game/game";
import {
  boardFootprint,
  DEFAULT_STAGE_THEME,
  STAGE_FLOOR_Y,
  type BoardStage,
  type StageTheme,
} from "../views/board-stage.js";
import { createPropKit, type PropKit } from "./prop-kit.js";

export interface EnvironmentContext {
  grid: BoardGrid;
  footprint: number;
  floorY: number;
}

export interface EnvironmentTheme {
  id: string;
  name: string;
  story: string;
  swatch: string;
  seed: number;
  stage: StageTheme;
  build(kit: PropKit, context: EnvironmentContext): Object3D;
}

export interface MountedEnvironment {
  dispose(): void;
}

export function waterSurface(
  kit: PropKit,
  size: number,
  level: number,
  tone: string,
  swell: number,
): Object3D {
  const geometry = kit.keep(new PlaneGeometry(size, size, 72, 72));
  geometry.rotateX(-Math.PI / 2);
  const surface = kit.solid(geometry, kit.surface(tone, { roughness: 0.35 }), 0, level, 0);
  surface.castShadow = false;

  const position = geometry.getAttribute("position");
  const rest = Float32Array.from(position.array);

  kit.animate((seconds) => {
    for (let index = 0; index < position.count; index += 1) {
      const x = rest[index * 3]!;
      const z = rest[index * 3 + 2]!;
      const wave = Math.sin(x * 0.045 + seconds * 1.1) * 0.6 + Math.cos(z * 0.06 - seconds * 0.8) * 0.4;
      position.setY(index, wave * swell);
    }

    position.needsUpdate = true;
  });

  return surface;
}

export function mountEnvironment(stage: BoardStage, theme: EnvironmentTheme, grid: BoardGrid): MountedEnvironment {
  stage.setTheme(theme.stage);

  const kit = createPropKit(theme.seed);
  const root = theme.build(kit, { grid, footprint: boardFootprint(grid), floorY: STAGE_FLOOR_Y });
  stage.scene.add(root);

  let seconds = 0;
  kit.tick(seconds);

  const stopFrames = stage.onFrame((deltaSeconds) => {
    seconds += deltaSeconds;
    kit.tick(seconds);
  });

  return {
    dispose() {
      stopFrames();
      root.removeFromParent();
      kit.dispose();
      stage.setTheme(DEFAULT_STAGE_THEME);
    },
  };
}
