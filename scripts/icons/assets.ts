import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gameCatalogue } from "@jev-game/content";
import { ICON_KINDS, KIND_CONTRACTS, type IconKind } from "./contract.js";

export interface IconFile {
  kind: IconKind;
  id: string;
  path: string;
}

export interface ImageInfo {
  width: number;
  height: number;
  alpha: boolean;
  bytes: number;
}

interface Finding {
  level: "error" | "warning";
  message: string;
}

export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export const SOURCE_ROOT = join(REPO_ROOT, "art", "icons");

export const RUNTIME_ROOT = join(REPO_ROOT, "apps", "client", "src", "assets", "icons");

function listFiles(root: string, extension: string): IconFile[] {
  const files: IconFile[] = [];

  for (const kind of ICON_KINDS) {
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

export function listSources(): IconFile[] {
  return listFiles(SOURCE_ROOT, ".png");
}

export function listRuntimeIcons(): IconFile[] {
  return listFiles(RUNTIME_ROOT, ".webp");
}

export function runtimePath(kind: IconKind, id: string): string {
  return join(RUNTIME_ROOT, kind, `${id}.webp`);
}

export function sourcePath(kind: IconKind, id: string): string {
  return join(SOURCE_ROOT, kind, `${id}.png`);
}

export function repoPath(path: string): string {
  return relative(REPO_ROOT, path);
}

export function readPngInfo(path: string): ImageInfo | null {
  const data = readFileSync(path);

  if (data.length < 26 || data.toString("ascii", 1, 4) !== "PNG" || data.toString("ascii", 12, 16) !== "IHDR") {
    return null;
  }

  const colorType = data.readUInt8(25);

  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    alpha: colorType === 4 || colorType === 6,
    bytes: data.length,
  };
}

export function readWebpInfo(path: string): ImageInfo | null {
  const data = readFileSync(path);

  if (data.length < 30 || data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }

  const chunk = data.toString("ascii", 12, 16);

  if (chunk === "VP8X") {
    return {
      width: data.readUIntLE(24, 3) + 1,
      height: data.readUIntLE(27, 3) + 1,
      alpha: (data.readUInt8(20) & 0x10) !== 0,
      bytes: data.length,
    };
  }

  if (chunk === "VP8L") {
    const bits = data.readUInt32LE(21);

    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      alpha: ((bits >>> 28) & 1) === 1,
      bytes: data.length,
    };
  }

  if (chunk === "VP8 ") {
    return {
      width: data.readUInt16LE(26) & 0x3fff,
      height: data.readUInt16LE(28) & 0x3fff,
      alpha: false,
      bytes: data.length,
    };
  }

  return null;
}

export function contentIds(kind: IconKind): ReadonlySet<string> {
  const subject = KIND_CONTRACTS[kind].subject;
  const ids = new Set<string>();

  if (subject === "hero") {
    for (const hero of Object.values(gameCatalogue.heroes)) {
      if (hero.summon !== true) {
        ids.add(hero.id);
      }
    }

    return ids;
  }

  for (const upgrade of Object.values(gameCatalogue.upgrades)) {
    if (upgrade.category === subject) {
      ids.add(upgrade.id);
    }
  }

  return ids;
}

function runtimeFindings(file: IconFile, info: ImageInfo | null): Finding[] {
  if (info === null) {
    return [{ level: "error", message: "not a WebP file" }];
  }

  const findings: Finding[] = [];
  const contract = KIND_CONTRACTS[file.kind];

  if (info.width !== contract.runtimeSize || info.height !== contract.runtimeSize) {
    findings.push({ level: "error", message: `${info.width}×${info.height}, must be ${contract.runtimeSize}×${contract.runtimeSize}` });
  }

  if (!info.alpha) {
    findings.push({ level: "error", message: "no alpha channel; icons sit on the HUD's own discs, so the background must be transparent" });
  }

  if (info.bytes > contract.byteBudget) {
    findings.push({ level: "error", message: `${kilobytes(info.bytes)}, budget ${kilobytes(contract.byteBudget)}` });
  }

  if (!contentIds(file.kind).has(file.id)) {
    findings.push({ level: "error", message: `no ${contract.subject} with this id in packages/content` });
  }

  if (!existsSync(sourcePath(file.kind, file.id))) {
    findings.push({ level: "warning", message: `no master at ${repoPath(sourcePath(file.kind, file.id))}, so it can't be rebuilt` });
  }

  return findings;
}

function column(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

function kilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function checkIcons(files: readonly IconFile[]): boolean {
  const widths = [34, 11, 7, 9];
  console.log(["icon", "size", "alpha", "weight"].map((title, index) => column(title, widths[index] ?? 8)).join(""));
  const notes: string[] = [];
  let errors = 0;
  let totalBytes = 0;

  for (const file of files) {
    const info = readWebpInfo(file.path);
    totalBytes += info?.bytes ?? 0;

    const cells = [
      `${file.kind}/${file.id}`,
      info === null ? "?" : `${info.width}×${info.height}`,
      info?.alpha === true ? "yes" : "no",
      info === null ? "?" : kilobytes(info.bytes),
    ];

    console.log(cells.map((cell, index) => column(cell, widths[index] ?? 8)).join(""));

    for (const finding of runtimeFindings(file, info)) {
      notes.push(`  ${finding.level === "error" ? "✗" : "!"} ${file.kind}/${file.id}: ${finding.message}`);
      errors += finding.level === "error" ? 1 : 0;
    }
  }

  for (const source of listSources()) {
    if (!existsSync(runtimePath(source.kind, source.id))) {
      notes.push(`  ! ${repoPath(source.path)}: not built yet; run pnpm icons:build ${source.id}`);
    }
  }

  const runtime = listRuntimeIcons();

  const coverage = ICON_KINDS.map((kind) => {
    const drawn = runtime.reduce((count, file) => count + (file.kind === kind ? 1 : 0), 0);

    return `${kind} ${drawn} of ${contentIds(kind).size}`;
  });

  console.log(`\n${files.length} icons, ${kilobytes(totalBytes)} in total. With art: ${coverage.join(", ")}.`);

  if (notes.length > 0) {
    console.log(`\n${notes.join("\n")}`);
  }

  console.log(errors === 0 ? "\nicons ok" : `\n${errors} error${errors === 1 ? "" : "s"}`);

  return errors === 0;
}
