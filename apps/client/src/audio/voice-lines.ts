import type { SoundId } from "./catalogue.js";

export interface HeroLines {
  pick: SoundId;
  cast: readonly SoundId[];
  death: SoundId;
  win: SoundId;
}

export const HERO_LINES = {
  bulwark: {
    pick: "vo-bulwark-pick",
    cast: ["vo-bulwark-cast-1", "vo-bulwark-cast-2"],
    death: "vo-bulwark-death",
    win: "vo-bulwark-win",
  },
  oathkeeper: {
    pick: "vo-oathkeeper-pick",
    cast: ["vo-oathkeeper-cast-1", "vo-oathkeeper-cast-2"],
    death: "vo-oathkeeper-death",
    win: "vo-oathkeeper-win",
  },
  ravager: {
    pick: "vo-ravager-pick",
    cast: ["vo-ravager-cast-1", "vo-ravager-cast-2"],
    death: "vo-ravager-death",
    win: "vo-ravager-win",
  },
  duskblade: {
    pick: "vo-duskblade-pick",
    cast: ["vo-duskblade-cast-1", "vo-duskblade-cast-2"],
    death: "vo-duskblade-death",
    win: "vo-duskblade-win",
  },
  pyromancer: {
    pick: "vo-pyromancer-pick",
    cast: ["vo-pyromancer-cast-1", "vo-pyromancer-cast-2"],
    death: "vo-pyromancer-death",
    win: "vo-pyromancer-win",
  },
  frostweaver: {
    pick: "vo-frostweaver-pick",
    cast: ["vo-frostweaver-cast-1", "vo-frostweaver-cast-2"],
    death: "vo-frostweaver-death",
    win: "vo-frostweaver-win",
  },
  hexbinder: {
    pick: "vo-hexbinder-pick",
    cast: ["vo-hexbinder-cast-1", "vo-hexbinder-cast-2"],
    death: "vo-hexbinder-death",
    win: "vo-hexbinder-win",
  },
  blightmother: {
    pick: "vo-blightmother-pick",
    cast: ["vo-blightmother-cast-1", "vo-blightmother-cast-2"],
    death: "vo-blightmother-death",
    win: "vo-blightmother-win",
  },
  bonecaller: {
    pick: "vo-bonecaller-pick",
    cast: ["vo-bonecaller-cast-1", "vo-bonecaller-cast-2"],
    death: "vo-bonecaller-death",
    win: "vo-bonecaller-win",
  },
  clockwright: {
    pick: "vo-clockwright-pick",
    cast: ["vo-clockwright-cast-1", "vo-clockwright-cast-2"],
    death: "vo-clockwright-death",
    win: "vo-clockwright-win",
  },
} as const satisfies Record<string, HeroLines>;

type VoicedHero = keyof typeof HERO_LINES;

function isVoicedHero(heroId: string): heroId is VoicedHero {
  return Object.hasOwn(HERO_LINES, heroId);
}

export function heroLines(heroId: string): HeroLines | undefined {
  return isVoicedHero(heroId) ? HERO_LINES[heroId] : undefined;
}
