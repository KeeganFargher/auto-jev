import type { UnitId } from "../../ids.js";
import type { Vector2 } from "../../math/vector.js";

export interface CastPlan {
  targetUnitId: UnitId | null;
  point: Vector2;
  wanted: boolean;
}
