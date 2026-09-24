import type { EnvironmentTheme } from "./environment.js";
import { ENVIRONMENT_THEMES } from "./themes/index.js";

const STORAGE_KEY = "jev-game.board-theme";

function knownTheme(id: string | null): EnvironmentTheme | undefined {
  return ENVIRONMENT_THEMES.find((theme) => theme.id === id);
}

let remembered: EnvironmentTheme | null = null;

function storedThemeId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function savedBoardTheme(): EnvironmentTheme {
  remembered ??= knownTheme(storedThemeId()) ?? ENVIRONMENT_THEMES[0]!;

  return remembered;
}

export function saveBoardTheme(id: string): void {
  const theme = knownTheme(id);

  if (theme === undefined) {
    return;
  }

  remembered = theme;

  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    return;
  }
}

function ownerHash(ownerId: string): number {
  let hash = 0;

  for (const character of ownerId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

export function boardThemeFor(ownerId: string, viewerId: string): EnvironmentTheme {
  const mine = savedBoardTheme();

  if (ownerId === viewerId) {
    return mine;
  }

  const others = ENVIRONMENT_THEMES.filter((theme) => theme.id !== mine.id);

  return others[ownerHash(ownerId) % Math.max(1, others.length)] ?? mine;
}
