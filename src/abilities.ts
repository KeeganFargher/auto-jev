import type { HeroId } from "./heroes.js";

/**
 * How an ability finds what it touches. The shapes are the ones the ability lab draws, so every
 * cast in a live battle has a matching floor telegraph and payoff on the client.
 */
export type AbilityShape = "single" | "chain" | "aoe" | "line" | "dash" | "cone" | "aura" | "shield" | "blink" | "sweep";
export interface AbilityDefinition {
  id: string; name: string; shape: AbilityShape;
  /** Who the ability is aimed at; "self" casts are centred on the Jev wherever they stand. */
  target: "foe" | "ally" | "self";
  /** Seconds between casts. */
  cooldown: number;
  /** Area of effect in field units; for single-target casts the reticle size only. */
  radius: number;
  /** How far from the Jev a target may be. */
  range: number;
  /** Windup on the floor before anything lands, and how long the payoff plays, in milliseconds. */
  telegraph: number; impact: number;
  /** Multiplier on the Jev's blow; heals and buffs read it the same way. */
  power: number;
  /** Fewest targets worth spending the cast on. */
  minimum: number;
  text: string;
}

const define = (id: string, name: string, shape: AbilityShape, target: AbilityDefinition["target"], cooldown: number, radius: number, range: number, telegraph: number, impact: number, power: number, minimum: number, text: string): AbilityDefinition =>
  ({ id, name, shape, target, cooldown, radius, range, telegraph, impact, power, minimum, text });

/**
 * Three abilities per Jev, mixed on purpose: a cheap single-target poke, the signature on a medium
 * cooldown, and a long-cooldown ultimate. Radii and timings are the ability lab's tuned values.
 */
export const KITS: Record<HeroId, AbilityDefinition[]> = {
  veyra: [
    define("bolt", "Arc Bolt", "single", "foe", 6, 3.0, 22, 320, 900, 3.0, 1, "A single bolt to the nearest enemy."),
    define("veyra", "Chain Bolt", "chain", "foe", 14, 7.5, 20, 650, 1500, 2.8, 2, "Lightning jumps between packed enemies."),
    define("thunderstorm", "Thunderstorm", "aoe", "foe", 38, 8.5, 26, 700, 2600, 2.2, 3, "Bolts hammer everything in the ring."),
  ],
  thorn: [
    define("snare", "Root Snare", "single", "foe", 8, 3.0, 16, 420, 1800, 2.5, 1, "Roots hold one enemy fast."),
    define("thorn", "Rootwall", "line", "self", 20, 6.5, 0, 800, 2200, 1.6, 1, "The line around him stops giving ground."),
    define("fissure", "Upheaval", "line", "foe", 42, 7.0, 14, 750, 2000, 3.8, 2, "The ground splits toward the enemy."),
  ],
  kael: [
    define("kael", "Hunt", "dash", "foe", 10, 9.0, 14, 500, 1100, 3.6, 1, "Falls on the strongest thing in reach; heals on the blow."),
    define("bladenova", "Blade Nova", "aoe", "self", 22, 7.5, 0, 600, 1600, 1.5, 2, "Blades whirl out from where he stands."),
    define("cone", "Rampage", "cone", "foe", 36, 9.0, 12, 650, 1500, 2.8, 2, "A wave rolls through everything in front of him."),
  ],
  elowen: [
    define("mend", "Mend", "single", "ally", 5, 3.0, 20, 300, 1900, 6.5, 1, "A held beam onto the most wounded ally."),
    define("elowen", "Renewal", "aura", "self", 18, 8.0, 0, 400, 2600, 3.0, 2, "A calm field that heals everyone in it."),
    define("dome", "Sanctuary", "shield", "self", 45, 6.5, 0, 550, 2600, 0, 2, "A dome that halves what gets through."),
  ],
  nyx: [
    define("nyx", "Shadowstep", "blink", "foe", 12, 5.5, 60, 450, 1200, 4.6, 1, "Slips behind the enemy shooters, veiled for a moment."),
    define("beam", "Umbral Sweep", "sweep", "foe", 24, 9.5, 8, 600, 1900, 3.6, 2, "A beam pivots through the arc in front of her."),
    define("maelstrom", "Nightfall", "aoe", "self", 40, 7.5, 0, 700, 2200, 3.5, 3, "Everything nearby is dragged in and thrown out."),
  ],
  orun: [
    define("smite", "Sunder", "single", "foe", 7, 3.0, 14, 520, 1300, 3.8, 1, "Something very heavy lands on one enemy."),
    define("orun", "Temper", "aoe", "self", 16, 7.0, 0, 900, 1600, 0.8, 2, "Soldiers around him hit like veterans."),
    define("meteor", "Hammerfall", "aoe", "foe", 44, 6.5, 24, 1100, 1800, 3.0, 3, "The hammer comes down on the packed enemy."),
  ],
};
