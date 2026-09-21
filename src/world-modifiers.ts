export const WORLD_MODIFIER_IDS = ["golden_valley", "heroic_age", "age_of_war", "scarcity", "long_night", "broken_lands"] as const;
export type WorldModifierId = (typeof WORLD_MODIFIER_IDS)[number];
export interface WorldModifierDefinition { id: WorldModifierId; name: string; effect: string }
export const WORLD_MODIFIERS: WorldModifierDefinition[] = [
  { id: "golden_valley", name: "Golden Valley", effect: "Three Crossings holds twice the iron; outer deposits are thin." },
  { id: "heroic_age", name: "Heroic Age", effect: "Named characters gain experience twice as fast and promote sooner." },
  { id: "age_of_war", name: "Age of War", effect: "Recruits train in half the time and cost less; defences cost more." },
  { id: "scarcity", name: "Scarcity", effect: "Trees and stone run out quickly and never fully regrow." },
  { id: "long_night", name: "Long Night", effect: "Factions notice each other late; ambushes hit before towers respond." },
  { id: "broken_lands", name: "Broken Lands", effect: "Wider river and more ridges leave only narrow crossings." },
];
/** Resolves a world modifier at its typed boundary. */
export function worldModifier(id: WorldModifierId): WorldModifierDefinition {
  const definition = WORLD_MODIFIERS.find((entry) => entry.id === id);
  if (definition === undefined) throw new Error(`Unknown world modifier ${id}`);
  return definition;
}
