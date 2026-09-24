import {
  CLIP_TOLERANCE_SECONDS,
  FLOOR_TOLERANCE_METRES,
  HERO_CLIPS,
  HERO_HEIGHT_METRES,
  REFERENCE_HEIGHT_METRES,
  RESERVED_COLORS,
  ROOTED_HEROES,
  TEAM_MATERIAL,
  budgetFor,
  footprintFor,
  type ModelKind,
} from "./contract.js";
import type { MaterialReport, ModelReport } from "./inspect.js";

export type FindingLevel = "error" | "warning";

export interface Finding {
  level: FindingLevel;
  message: string;
}

const RESERVED_COLOR_DISTANCE = 0.08;

const FOOTPRINT_TOLERANCE_METRES = 0.02;

function isWhite(material: MaterialReport): boolean {
  return material.baseColor.every((channel) => channel >= 0.95);
}

function colorDistance(first: readonly number[], second: readonly number[]): number {
  return Math.hypot(...first.map((channel, index) => channel - (second[index] ?? 0)));
}

function checkBudget(kind: ModelKind, id: string, report: ModelReport, findings: Finding[]): void {
  const budget = budgetFor(kind, id);

  if (report.triangles > budget.triangles) {
    findings.push({
      level: "error",
      message: `${report.triangles} triangles, budget ${budget.triangles}`,
    });
  }

  if (report.textures.length > budget.textures) {
    findings.push({
      level: "error",
      message: `${report.textures.length} textures, budget ${budget.textures}`,
    });
  }

  for (const texture of report.textures) {
    if (Math.max(texture.width, texture.height) > budget.textureSize) {
      findings.push({
        level: "error",
        message: `texture "${texture.name}" is ${texture.width}×${texture.height}, budget ${budget.textureSize}`,
      });
    }
  }

  if (report.joints > budget.joints) {
    findings.push({ level: "error", message: `${report.joints} bones, budget ${budget.joints}` });
  }

  if (!report.compressed) {
    findings.push({
      level: "warning",
      message: "not meshopt-compressed; rebuild it with pnpm models:build",
    });
  }
}

function checkColors(report: ModelReport, findings: Finding[]): void {
  for (const material of report.materials) {
    if (material.name === TEAM_MATERIAL || material.textured) {
      continue;
    }

    for (const reserved of RESERVED_COLORS) {
      if (colorDistance(material.baseColor, reserved.linear) < RESERVED_COLOR_DISTANCE) {
        findings.push({
          level: "warning",
          message: `material "${material.name}" is close to ${reserved.name}`,
        });
      }
    }
  }
}

function checkGrounding(kind: ModelKind, id: string, report: ModelReport, findings: Finding[]): void {
  if (kind === "board") {
    return;
  }

  if (Math.abs(report.floor) > FLOOR_TOLERANCE_METRES) {
    findings.push({
      level: "error",
      message: `lowest point is at y = ${report.floor.toFixed(3)} m, not on the ground`,
    });
  }

  const allowance = footprintFor(kind, id);
  const reach = report.height > 0 ? (report.footprint * REFERENCE_HEIGHT_METRES) / report.height : report.footprint;

  if (kind === "heroes" && reach > allowance.radius + FOOTPRINT_TOLERANCE_METRES) {
    findings.push({
      level: "error",
      message: `reaches ${reach.toFixed(2)} m from the centre at 1.8 m tall, beyond ${allowance.radius} m (${allowance.reason})`,
    });
  }
}

function checkHero(id: string, report: ModelReport, findings: Finding[]): void {
  const teams = report.materials.filter((material) => material.name === TEAM_MATERIAL);
  const team = teams[0];

  if (teams.length !== 1 || team === undefined) {
    findings.push({
      level: "error",
      message: `needs exactly one "${TEAM_MATERIAL}" material, found ${teams.length}`,
    });
  } else if (!isWhite(team) || team.textured) {
    findings.push({
      level: "error",
      message: `"${TEAM_MATERIAL}" must be plain white with no texture`,
    });
  }

  if (report.skins !== 1) {
    findings.push({ level: "error", message: `needs exactly one skeleton, found ${report.skins}` });
  }

  const clips = new Map(report.clips.map((clip) => [clip.name, clip.seconds]));
  const rooted = ROOTED_HEROES.has(id);

  for (const rule of HERO_CLIPS) {
    const seconds = clips.get(rule.name);

    if (seconds === undefined) {
      if (!rule.optional && !(rooted && rule.name === "run")) {
        findings.push({ level: "error", message: `missing the "${rule.name}" clip` });
      }

      continue;
    }

    if (seconds < rule.minSeconds - CLIP_TOLERANCE_SECONDS || seconds > rule.maxSeconds + CLIP_TOLERANCE_SECONDS) {
      findings.push({
        level: "error",
        message: `"${rule.name}" is ${seconds.toFixed(2)} s, expected ${rule.minSeconds}–${rule.maxSeconds} s`,
      });
    }
  }

  for (const name of clips.keys()) {
    if (!HERO_CLIPS.some((rule) => rule.name === name)) {
      findings.push({
        level: "warning",
        message: `clip "${name}" is not in the contract, the game ignores it`,
      });
    }
  }

  if (report.height < HERO_HEIGHT_METRES.min || report.height > HERO_HEIGHT_METRES.max) {
    findings.push({
      level: "warning",
      message: `${report.height.toFixed(2)} m tall, expected about 1.8 m (the game rescales it)`,
    });
  }
}

export function validateModel(kind: ModelKind, id: string, report: ModelReport): Finding[] {
  const findings: Finding[] = [];
  checkBudget(kind, id, report, findings);
  checkColors(report, findings);
  checkGrounding(kind, id, report, findings);

  if (kind === "heroes") {
    checkHero(id, report, findings);
  }

  return findings;
}
