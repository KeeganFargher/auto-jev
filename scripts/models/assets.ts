import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { MODELS } from "../../apps/client/src/models/catalogue.js";
import { MODEL_KINDS, type ModelKind } from "./contract.js";
import { inspectModel } from "./inspect.js";
import { validateModel, type Finding } from "./validate.js";

export interface AssetFile {
  kind: ModelKind;
  id: string;
  path: string;
}

export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export const SOURCE_ROOT = join(REPO_ROOT, "art", "models");

export const RUNTIME_ROOT = join(REPO_ROOT, "apps", "client", "public", "assets", "models");

const PUBLIC_ROOT = join(REPO_ROOT, "apps", "client", "public");

function listFiles(root: string, extension: string): AssetFile[] {
  const files: AssetFile[] = [];

  for (const kind of MODEL_KINDS) {
    const folder = join(root, kind);

    if (!existsSync(folder)) {
      continue;
    }

    for (const entry of readdirSync(folder).sort()) {
      if (entry.endsWith(extension)) {
        files.push({ kind, id: entry.slice(0, -extension.length), path: join(folder, entry) });
      }
    }
  }

  return files;
}

export function listSources(): AssetFile[] {
  return listFiles(SOURCE_ROOT, ".blend");
}

export function listRuntimeModels(): AssetFile[] {
  return listFiles(RUNTIME_ROOT, ".glb");
}

export function runtimePath(kind: ModelKind, id: string): string {
  return join(RUNTIME_ROOT, kind, `${id}.glb`);
}

export function repoPath(path: string): string {
  return relative(REPO_ROOT, path);
}

function catalogueFindings(files: readonly AssetFile[]): Map<string, Finding[]> {
  const findings = new Map<string, Finding[]>();
  const catalogued = new Map(Object.entries(MODELS).map(([id, definition]) => [join(PUBLIC_ROOT, definition.url), id]));

  for (const file of files) {
    const id = catalogued.get(file.path);

    if (id === undefined) {
      findings.set(file.path, [
        {
          level: "warning",
          message: "not in apps/client/src/models/catalogue.ts, so the game never loads it",
        },
      ]);
    } else if (id !== file.id) {
      findings.set(file.path, [
        { level: "error", message: `catalogued as "${id}" but the file is named "${file.id}"` },
      ]);
    }
  }

  for (const [path, id] of catalogued) {
    if (!existsSync(path)) {
      findings.set(path, [{ level: "error", message: `catalogue entry "${id}" points at a missing file` }]);
    }
  }

  return findings;
}

function column(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

function kilobytes(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

export async function checkModels(files: readonly AssetFile[]): Promise<boolean> {
  const catalogue = catalogueFindings(listRuntimeModels());
  const header = ["model", "triangles", "draws", "materials", "bones", "textures", "clips", "size"];
  const widths = [22, 11, 7, 11, 7, 10, 7, 8];
  console.log(header.map((title, index) => column(title, widths[index] ?? 8)).join(""));
  let errors = 0;
  let warnings = 0;
  const notes: string[] = [];

  for (const file of files) {
    const report = await inspectModel(file.path);
    const findings = [...validateModel(file.kind, file.id, report), ...(catalogue.get(file.path) ?? [])];
    catalogue.delete(file.path);

    const cells = [
      `${file.kind}/${file.id}`,
      report.triangles,
      report.drawCalls,
      report.materials.length,
      report.joints,
      report.textures.length,
      report.clips.length,
      kilobytes(report.bytes),
    ];

    console.log(cells.map((cell, index) => column(cell, widths[index] ?? 8)).join(""));

    for (const finding of findings) {
      notes.push(`  ${finding.level === "error" ? "✗" : "!"} ${file.kind}/${file.id}: ${finding.message}`);
      errors += finding.level === "error" ? 1 : 0;
      warnings += finding.level === "warning" ? 1 : 0;
    }
  }

  for (const [path, findings] of catalogue) {
    for (const finding of findings) {
      notes.push(`  ${finding.level === "error" ? "✗" : "!"} ${repoPath(path)}: ${finding.message}`);
      errors += finding.level === "error" ? 1 : 0;
      warnings += finding.level === "warning" ? 1 : 0;
    }
  }

  if (notes.length > 0) {
    console.log(`\n${notes.join("\n")}`);
  }

  console.log(`\n${files.length} models, ${errors} errors, ${warnings} warnings`);

  return errors === 0;
}
