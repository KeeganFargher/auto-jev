const label = (text) => text.replaceAll("_", " ");

/** Describes visible world objects from the current authoritative snapshot. */
export function objectDetails(reference, world) {
  if (reference.resourceId !== undefined) {
    const node = world.resources.find((resource) => resource.id === reference.resourceId);
    const names = { tree: "Pine tree", berries: "Berry bush", stone: "Stone deposit", ore: "Iron deposit", clay:"Clay deposit", coal: "Coal deposit", river: "Fresh water" };
    const uses = { tree: "Chop for wood", berries: "Gather for food", stone: "Mine for stone", ore: "Mine for iron ore", clay:"Dig for bricks", coal: "Mine for coal", river: "Fish or collect drinking water" };
    const workers = world.colonies.flatMap((colony) => colony.colonists).filter((person) => person.health > 0 && person.task?.targetId === node.id);
    const status = node.kind === "river" ? "Renewable source" : node.amount > 0 ? `${node.amount} remaining` : node.regrowAt === null ? "Depleted" : "Regrowing";
    return [names[node.kind], `${uses[node.kind]} · ${status}${workers.length === 0 ? "" : `\n${workers.length} worker${workers.length === 1 ? "" : "s"} assigned`}`];
  }
  const colony = world.colonies.find((entry) => entry.id === reference.colonyId);
  const prefix = `${colony.name} · `;
  const { kind } = reference;
  if(kind==="building"){
    const building=colony.structures.find(b=>b.id===reference.id);
    const definition=world.buildingsCatalog.find(d=>d.id===building.kind);
    return [prefix+definition.name,`Tier ${building.tier} · ${building.status}\n${building.staff.length} assigned · ${building.cycles} cycles\nClick for production and upgrades`];
  }
  if (kind === "person") {
    const person = colony.colonists.find((entry) => entry.id === reference.id);
    return [person.name, `Level ${person.level} · ${Math.round(person.health)} health\n${person.task === null ? "Choosing next task" : `${label(person.task.action)}${person.task.route.length > 0 ? ` · ${person.task.route.length} tiles to go` : " · working"}`}\nClick to inspect skills and needs`];
  }
  if (kind === "farm") {
    const farm = colony.farms.find((entry) => entry.id === reference.id);
    if (farm === undefined) {
      const project = colony.project;
      return [prefix + "Farm construction", project.funded ? `${Math.floor(project.workDone / project.totalWork * 100)}% built` : "Waiting for building materials"];
    }
    return [prefix + `${farm.radius === 2 ? "Large field" : "Farm"}`, farm.stage === "growing" ? `${Math.floor(farm.growth / 360 * 100)}% grown` : farm.stage === "ripe" ? "Ready to harvest" : "Needs planting"];
  }
  if (kind === "hut") return [prefix + "Home", `4 beds · ${reference.index < colony.development.homes ? "Improved" : "Basic shelter"}`];
  if (kind === "food" || kind === "water") return [prefix + (kind === "food" ? "Food store" : "Water cistern"), `${Math.floor(colony.stockpile[kind])} / ${colony.limits[kind]} stored\nWorkers come here to ${kind === "food" ? "eat" : "drink"}`];
  if (kind === "camp") return [prefix + "Campfire", `${colony.progression.stage} · Focus: ${colony.priority}`];
  if (kind === "defense") return [prefix + "Palisade", `${colony.development.defenses} / 3 built · protects against raids`];
  if (kind === "workshop") return [prefix + "Workshop", colony.development.workshop ? "Crafting and research station" : "Under construction"];
  return [prefix+label(kind),"Colony structure"];
}
