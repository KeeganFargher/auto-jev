import type { UnitState } from "@jev-game/game";
import type { CanvasTransform } from "./arena-view.js";

const RADIUS_PIXELS = 9;

const HEALTH_BAR_WIDTH = 32;

const HEALTH_BAR_HEIGHT = 4;

const TEAM_A_COLOR = "#4ea1ff";

const TEAM_B_COLOR = "#ff6b6b";

const OTHER_TEAM_COLOR = "#c084fc";

const DEAD_COLOR = "#6b7280";

function colorForUnit(unit: UnitState): string {
  if (!unit.alive) {
    return DEAD_COLOR;
  }

  if (unit.teamId === "A") {
    return TEAM_A_COLOR;
  }

  if (unit.teamId === "B") {
    return TEAM_B_COLOR;
  }

  return OTHER_TEAM_COLOR;
}

export function drawUnit(
  ctx: CanvasRenderingContext2D,
  unit: UnitState,
  isSelected: boolean,
  transform: CanvasTransform,
): void {
  const center = transform.worldToCanvas(unit.position);
  const color = colorForUnit(unit);

  if (isSelected) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, unit.attackRangeUnits * transform.scale, 0, Math.PI * 2);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(78, 161, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.beginPath();
  ctx.arc(center.x, center.y, RADIUS_PIXELS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  if (isSelected) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }

  const barX = center.x - HEALTH_BAR_WIDTH / 2;
  const barY = center.y + RADIUS_PIXELS + 6;
  const hpFraction = Math.max(0, unit.hp / unit.maxHp);

  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.fillRect(barX, barY, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);
  ctx.fillStyle = color;
  ctx.fillRect(barX, barY, HEALTH_BAR_WIDTH * hpFraction, HEALTH_BAR_HEIGHT);

  ctx.fillStyle = "#f3f4f6";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText(unit.unitId, center.x, barY + HEALTH_BAR_HEIGHT + 12);
}

export function drawTargetLine(
  ctx: CanvasRenderingContext2D,
  from: UnitState,
  to: UnitState,
  transform: CanvasTransform,
): void {
  const start = transform.worldToCanvas(from.position);
  const end = transform.worldToCanvas(to.position);

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
}
