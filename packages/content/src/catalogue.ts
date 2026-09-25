import type { AbilityDefinition, Catalogue, HeroDefinition, UpgradeDefinition } from "@jev-game/game";
import { boardArena } from "./arenas/board-arena.js";
import { bulwark, bulwarkAbilities, bulwarkLevels } from "./roster/bulwark.js";
import { oathkeeper, oathkeeperAbilities, oathkeeperLevels } from "./roster/oathkeeper.js";
import { ravager, ravagerAbilities, ravagerLevels } from "./roster/ravager.js";
import { duskblade, duskbladeAbilities, duskbladeLevels } from "./roster/duskblade.js";
import { pyromancer, pyromancerAbilities, pyromancerLevels } from "./roster/pyromancer.js";
import { frostweaver, frostweaverAbilities, frostweaverLevels } from "./roster/frostweaver.js";
import { hexbinder, hexbinderAbilities, hexbinderLevels } from "./roster/hexbinder.js";
import { blightmother, blightmotherAbilities, blightmotherLevels } from "./roster/blightmother.js";
import { bonecaller, bonecallerAbilities, bonecallerSummons, bonecallerLevels } from "./roster/bonecaller.js";
import { clockwright, clockwrightAbilities, clockwrightSummons, clockwrightLevels } from "./roster/clockwright.js";
import { itemAbilities, items } from "./pieces/items.js";
import { gems } from "./pieces/gems.js";

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

const rosterLevels: UpgradeDefinition[] = [
  ...bulwarkLevels,
  ...oathkeeperLevels,
  ...ravagerLevels,
  ...duskbladeLevels,
  ...pyromancerLevels,
  ...frostweaverLevels,
  ...hexbinderLevels,
  ...blightmotherLevels,
  ...bonecallerLevels,
  ...clockwrightLevels,
];

export const gameCatalogue: Catalogue = {
  heroes: Object.fromEntries(rosterHeroes.map((hero) => [hero.id, hero])),
  abilities: Object.fromEntries(rosterAbilities.map((ability) => [ability.id, ability])),
  arenas: { [boardArena.id]: boardArena },
  upgrades: Object.fromEntries([...rosterLevels, ...items, ...gems].map((upgrade) => [upgrade.id, upgrade])),
};
