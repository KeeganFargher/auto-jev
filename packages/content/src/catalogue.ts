import type { Catalogue } from "@jev-game/game";
import { bruiser } from "./heroes/bruiser.js";
import { ranger } from "./heroes/ranger.js";
import { support } from "./heroes/support.js";
import { strike } from "./abilities/strike.js";
import { bolt } from "./abilities/bolt.js";
import { mend } from "./abilities/mend.js";
import { flatArena } from "./arenas/flat-arena.js";

export const catalogue: Catalogue = {
  heroes: { [bruiser.id]: bruiser, [ranger.id]: ranger, [support.id]: support },
  abilities: { [strike.id]: strike, [bolt.id]: bolt, [mend.id]: mend },
  arenas: { [flatArena.id]: flatArena },
};
