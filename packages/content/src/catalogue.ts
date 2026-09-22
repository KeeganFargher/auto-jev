import type { Catalogue } from "@jev-game/game";
import { bruiser } from "./heroes/bruiser.js";
import { flatArena } from "./arenas/flat-arena.js";

export const catalogue: Catalogue = {
  heroes: { [bruiser.id]: bruiser },
  arenas: { [flatArena.id]: flatArena },
};
