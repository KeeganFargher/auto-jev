import {
  ATTUNEMENT_ARCANA_MANA_GAIN,
  ATTUNEMENT_CUNNING_CRIT_CHANCE,
  ATTUNEMENT_MIGHT_MAX_HP,
  ATTUNEMENT_THRESHOLD,
  computeTeamTraits,
  createHeroBuild,
  type Catalogue,
  type ComboKind,
  type ConditionKind,
  type HeroBuild,
  type School,
  type TeamTraits,
  withEquipment,
} from "@jev-game/game";
import { piecesOnHero, type Loadout } from "@jev-game/run";

const SCHOOL_NAMES: Readonly<Record<School, string>> = { might: "Might", arcana: "Arcana", cunning: "Cunning" };

const CONDITION_NAMES: Readonly<Record<ConditionKind, string>> = {
  staggered: "Staggered",
  brittle: "Brittle",
  disoriented: "Disoriented",
};

const COMBO_NAMES: Readonly<Record<ComboKind, string>> = { overload: "Overload", shatter: "Shatter", crush: "Crush" };

const ATTUNEMENT_BONUS: Readonly<Record<School, string>> = {
  might: `+${Math.round(ATTUNEMENT_MIGHT_MAX_HP * 100)}% max HP`,
  arcana: `+${Math.round(ATTUNEMENT_ARCANA_MANA_GAIN * 100)}% mana gain`,
  cunning: `+${Math.round(ATTUNEMENT_CUNNING_CRIT_CHANCE * 100)}% crit chance`,
};

export const COMBO_RULES = [
  "A hero that sets up a condition and a different hero of the detonating school light a combo; the detonating hit consumes the condition.",
  "Staggered is detonated by an Arcana hit: Overload, extra damage and a knockdown.",
  "Brittle is detonated by a Cunning hit: Shatter, a heavy critical hit and shards that hurt nearby enemies.",
  "Disoriented is detonated by a Might hit: Crush, extra damage and the target loses mana.",
  "Two heroes setting up the condition and two detonating it raise a combo to tier II.",
  `Three heroes of one school activate its attunement: Might ${ATTUNEMENT_BONUS.might}, Arcana ${ATTUNEMENT_BONUS.arcana}, Cunning ${ATTUNEMENT_BONUS.cunning}.`,
];

export function heroName(catalogue: Catalogue, heroId: string): string {
  return catalogue.heroes[heroId]?.name ?? heroId;
}

export function pieceName(catalogue: Catalogue, pieceId: string): string {
  return catalogue.upgrades[pieceId]?.name ?? pieceId;
}

export function heroRole(catalogue: Catalogue, heroId: string): string {
  const hero = catalogue.heroes[heroId];

  if (hero === undefined) {
    return heroId;
  }

  const school = hero.school === undefined ? "" : `${SCHOOL_NAMES[hero.school]} `;

  return `${school}${hero.archetype ?? "hero"}`;
}

export function heroSummary(catalogue: Catalogue, heroId: string): string {
  const hero = catalogue.heroes[heroId];

  if (hero === undefined) {
    return heroId;
  }

  const parts = [`${hero.name}, ${heroRole(catalogue, heroId)}${hero.title === undefined ? "" : ` ("${hero.title}")`}.`];

  for (const abilityId of hero.abilityIds) {
    const ability = catalogue.abilities[abilityId];

    if (ability?.description !== undefined) {
      parts.push(`${ability.name}: ${ability.description}`);
    }
  }

  if (hero.appliesCondition !== undefined) {
    parts.push(`Sets up ${CONDITION_NAMES[hero.appliesCondition]}.`);
  }

  return parts.join(" ");
}

export function pieceSummary(catalogue: Catalogue, pieceId: string): string {
  const piece = catalogue.upgrades[pieceId];

  if (piece === undefined) {
    return pieceId;
  }

  const tags = [piece.rarity, piece.cursed === true ? "cursed: it has a downside" : undefined].filter((tag) => tag !== undefined);
  const label = tags.length === 0 ? "" : ` (${tags.join(", ")})`;

  return `${piece.name}${label}: ${piece.description}`;
}

export function traitsOf(heroIds: readonly string[], catalogue: Catalogue): TeamTraits {
  return computeTeamTraits(
    heroIds.map((heroId, slot) => createHeroBuild(`observed-${slot}`, heroId, [], catalogue)),
    catalogue,
  );
}

function names(catalogue: Catalogue, heroIds: readonly string[]): string {
  return heroIds.map((heroId) => heroName(catalogue, heroId)).join(" and ");
}

export function describeTraits(traits: TeamTraits, catalogue: Catalogue): string[] {
  const lines: string[] = [];

  for (const combo of traits.combos) {
    const comboName = COMBO_NAMES[combo.combo];
    const condition = CONDITION_NAMES[combo.condition];
    const detonator = SCHOOL_NAMES[combo.detonatingSchool];

    if (combo.tier > 0) {
      lines.push(
        `${comboName} combo is lit${combo.tier === 2 ? " at tier II" : ""}: ${names(catalogue, combo.appliers)} set up ${condition}, ${names(catalogue, combo.detonators)} detonate it.`,
      );
    } else if (combo.appliers.length > 0) {
      lines.push(`${comboName} combo is not lit: ${names(catalogue, combo.appliers)} set up ${condition} but a ${detonator} hero is needed to detonate it.`);
    }
  }

  for (const attunement of traits.attunements) {
    const school = SCHOOL_NAMES[attunement.school];

    if (attunement.active) {
      lines.push(`${school} attunement is active (${ATTUNEMENT_BONUS[attunement.school]}).`);
    } else if (attunement.heroes.length === ATTUNEMENT_THRESHOLD - 1) {
      lines.push(`One more ${school} hero would activate ${school} attunement (${ATTUNEMENT_BONUS[attunement.school]}).`);
    }
  }

  return lines;
}

export function describeTraitChange(before: TeamTraits, after: TeamTraits): string[] {
  const lines: string[] = [];

  after.combos.forEach((combo, index) => {
    const previous = before.combos[index]?.tier ?? 0;

    if (combo.tier > previous) {
      lines.push(combo.tier === 2 && previous === 1 ? `raises ${COMBO_NAMES[combo.combo]} to tier II` : `lights the ${COMBO_NAMES[combo.combo]} combo`);
    }
  });

  after.attunements.forEach((attunement, index) => {
    if (attunement.active && before.attunements[index]?.active !== true) {
      lines.push(`activates ${SCHOOL_NAMES[attunement.school]} attunement`);
    }
  });

  return lines;
}

export function loadoutBuilds(loadout: Loadout): HeroBuild[] {
  return loadout.heroBuilds.map((build, slot) =>
    withEquipment(
      build,
      piecesOnHero(loadout.items, slot).map((piece) => piece.pieceId),
      piecesOnHero(loadout.runes, slot).map((piece) => piece.pieceId),
    ),
  );
}

export function loadoutTraits(loadout: Loadout, catalogue: Catalogue): TeamTraits {
  return computeTeamTraits(loadoutBuilds(loadout), catalogue);
}
