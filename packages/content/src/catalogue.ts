import type { AbilityDefinition, Catalogue, HeroDefinition, UpgradeDefinition } from "@jev-game/game";
import { boardArena } from "./arenas/board-arena.js";
import { bulwark, bulwarkAbilities, bulwarkTalents } from "./roster/bulwark.js";
import { oathkeeper, oathkeeperAbilities, oathkeeperTalents } from "./roster/oathkeeper.js";
import { ravager, ravagerAbilities, ravagerTalents } from "./roster/ravager.js";
import { duskblade, duskbladeAbilities, duskbladeTalents } from "./roster/duskblade.js";
import { pyromancer, pyromancerAbilities, pyromancerTalents } from "./roster/pyromancer.js";
import { frostweaver, frostweaverAbilities, frostweaverTalents } from "./roster/frostweaver.js";
import { hexbinder, hexbinderAbilities, hexbinderTalents } from "./roster/hexbinder.js";
import { blightmother, blightmotherAbilities, blightmotherTalents } from "./roster/blightmother.js";
import { bonecaller, bonecallerAbilities, bonecallerSummons, bonecallerTalents } from "./roster/bonecaller.js";
import { clockwright, clockwrightAbilities, clockwrightSummons, clockwrightTalents } from "./roster/clockwright.js";
import { itemAbilities, items } from "./pieces/items.js";
import { runes } from "./pieces/runes.js";

const rosterHeroes: HeroDefinition[] = [
  bulwark,
  oathkeeper,
  ravager,
  duskblade,
  pyromancer,
  frostweaver,
  hexbinder,
  blightmother,
  bonecaller,
  clockwright,
  ...bonecallerSummons,
  ...clockwrightSummons,
];

const rosterAbilities: AbilityDefinition[] = [
  ...bulwarkAbilities,
  ...oathkeeperAbilities,
  ...ravagerAbilities,
  ...duskbladeAbilities,
  ...pyromancerAbilities,
  ...frostweaverAbilities,
  ...hexbinderAbilities,
  ...blightmotherAbilities,
  ...bonecallerAbilities,
  ...clockwrightAbilities,
  ...itemAbilities,
];

const rosterTalents: UpgradeDefinition[] = [
  ...bulwarkTalents,
  ...oathkeeperTalents,
  ...ravagerTalents,
  ...duskbladeTalents,
  ...pyromancerTalents,
  ...frostweaverTalents,
  ...hexbinderTalents,
  ...blightmotherTalents,
  ...bonecallerTalents,
  ...clockwrightTalents,
];

export const gameCatalogue: Catalogue = {
  heroes: Object.fromEntries(rosterHeroes.map((hero) => [hero.id, hero])),
  abilities: Object.fromEntries(rosterAbilities.map((ability) => [ability.id, ability])),
  arenas: { [boardArena.id]: boardArena },
  upgrades: Object.fromEntries([...rosterTalents, ...items, ...runes].map((upgrade) => [upgrade.id, upgrade])),
};
