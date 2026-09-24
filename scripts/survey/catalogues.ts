import { gameCatalogue, validateCatalogue } from "@jev-game/content";
import type { Catalogue } from "@jev-game/game";

export function loadCatalogue(): Catalogue {
  validateCatalogue(gameCatalogue);

  return gameCatalogue;
}

export function contentHash(value: Catalogue): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
