export const HERO_IDS = ["veyra", "thorn", "kael", "elowen", "nyx", "orun"] as const;
export type HeroId = (typeof HERO_IDS)[number];
export interface HeroDefinition {
  id: HeroId; name: string; epithet: string; role: string; fantasy: string; color: string;
  passive: { name: string; text: string }; ability: { name: string; text: string }; personality: string[];
  stats: { health: number; damage: number; interval: number; range: number; speed: number };
}
const define = (id: HeroId, name: string, epithet: string, role: string, color: string, fantasy: string, passive: HeroDefinition["passive"], ability: HeroDefinition["ability"], personality: string[], stats: HeroDefinition["stats"]): HeroDefinition => ({ id, name, epithet, role, color, fantasy, passive, ability, personality, stats });
export const HEROES: HeroDefinition[] = [
  define("veyra", "Veyra", "the Stormborn", "Damage / Control", "#9b7cff", "A lightning-wielding Jev who becomes more dangerous when enemies cluster together.",
    { name: "Static", text: "Her attacks arc to nearby enemies; every fourth level adds another jump." },
    { name: "Chain Bolt", text: "Lightning jumps between grouped enemies for half damage." },
    ["proud", "aggressive"], { health: 190, damage: 18, interval: 20, range: 4, speed: 1 }),
  define("thorn", "Thorn", "the Ancient", "Tank / Defence", "#5f9c4f", "A gigantic nature Jev of roots and stone. Very slow. Very hard to kill.",
    { name: "Living Bark", text: "Regenerates outside combat and slowly mends nearby structures." },
    { name: "Rootwall", text: "Stands in the breach: enemies must fight through him to reach structures." },
    ["patient", "protective"], { health: 460, damage: 14, interval: 22, range: 1, speed: 0.85 }),
  define("kael", "Kael", "the Bloodhound", "Melee / Snowball", "#d8443a", "A supernatural warrior who grows stronger as the battle gets bloodier.",
    { name: "Bloodlust", text: "Each nearby enemy death raises his attack speed for a while, stacking." },
    { name: "Hunt", text: "Charges the most valuable enemy in reach and heals on the kill." },
    ["aggressive", "vengeful", "bold"], { health: 260, damage: 20, interval: 16, range: 1, speed: 1.15 }),
  define("elowen", "Elowen", "the Lifebinder", "Support / Healing", "#7fd6b3", "A healer who binds life energy between herself and the wounded.",
    { name: "Lifeline", text: "Absorbs part of the damage taken by the most wounded ally nearby." },
    { name: "Renewal", text: "Continuously heals allies fighting around her." },
    ["cautious", "pragmatic"], { health: 210, damage: 8, interval: 24, range: 3, speed: 1 }),
  define("nyx", "Nyx", "the Wayfinder", "Utility / Mobility", "#5b5f8f", "A shadow Jev who bends distance and sight.",
    { name: "Veil", text: "Squads she travels with are noticed later and move faster." },
    { name: "Shadowstep", text: "Slips through crossings that stop others; raids arrive before towers react." },
    ["expansionist", "pragmatic"], { health: 170, damage: 14, interval: 14, range: 1, speed: 1.3 }),
  define("orun", "Orun", "the Forgefather", "Support / Siege", "#e0a040", "A mythical blacksmith dragging a forge behind him. The army around him gets better.",
    { name: "Masterwork", text: "Soldiers resting near him slowly improve their weapons and armour." },
    { name: "Temper", text: "Hits structures hard and strips armour from what he strikes." },
    ["patient", "proud"], { health: 270, damage: 16, interval: 20, range: 1, speed: 0.95 }),
];
export const HERO_TRAITS: Record<string, string> = {
  aggressive: "Prefers striking first and settling disputes by force.",
  cautious: "Prefers fortifying and retreating over risky attacks.",
  proud: "Resents warnings and rarely accepts concessions.",
  bold: "Leads squads in person and shares their dangers.",
  patient: "Builds the economy before committing to war.",
  vengeful: "Answers every grievance with retaliation.",
  pragmatic: "Accepts truces when they buy time.",
  expansionist: "Wants every strategic region under their banner.",
  protective: "Keeps the army close to home.",
};
/** Resolves a hero definition at its typed boundary. */
export function heroDefinition(id: HeroId): HeroDefinition {
  const definition = HEROES.find((entry) => entry.id === id);
  if (definition === undefined) throw new Error(`Unknown hero ${id}`);
  return definition;
}
export const isHeroId = (value: string): value is HeroId => (HERO_IDS as readonly string[]).includes(value);
/** Experience needed to reach the next hero or veteran level; levels come from battles, not from time. */
export function experienceForLevel(level: number): number { return 25 * level * level; }
export const PERSON_NAMES = ["Ada", "Bo", "Cleo", "Dev", "Eli", "Fia", "Gus", "Hope", "Ivo", "Jun", "Kit", "Lark", "Mika", "Nell", "Oz", "Pim", "Quill", "Rue", "Sol", "Tam", "Una", "Vic", "Wren", "Yara", "Zed", "Ash", "Bryn", "Cade", "Dara", "Esme"];
export const VETERAN_EPITHETS = ["the Scarred", "Oakshield", "the Steady", "Wolfsbane", "the Grim", "Halfhand", "the Lucky", "Stonejaw", "the Silent", "Fireborn", "Longstride", "the Unbowed"];
