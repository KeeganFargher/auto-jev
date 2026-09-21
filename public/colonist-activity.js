const activities = {
  construct_building: {icon:"🔨",working:"Constructing workplace",travelling:"Going to construction",tool:"hammer"},
  work_building: {icon:"⚙",working:"Operating workplace",travelling:"Going to workplace",tool:"hammer"},
  mine_clay: {icon:"⛏",working:"Digging clay",travelling:"Going to clay pit",tool:"pickaxe"},
  work_research: { icon: "📖", working: "Researching", travelling: "Going to research" },
  mine_ore: { icon: "⛏", working: "Mining iron", travelling: "Going to iron deposits", tool: "pickaxe" },
  mine_coal: { icon: "⛏", working: "Mining coal", travelling: "Going to coal deposits", tool: "pickaxe" },
  smelt_metal: { icon: "♨", working: "Smelting metal", travelling: "Going to smelt" },
  craft_tools: { icon: "⚒", working: "Crafting tools", travelling: "Going to craft tools", tool: "hammer" },
  craft_weapons: { icon: "⚔", working: "Crafting spears", travelling: "Going to craft spears", tool: "hammer" },
  equip_tool: { icon: "⚒", working: "Equipping tool", travelling: "Collecting tool" },
  equip_weapon: { icon: "⚔", working: "Equipping spear", travelling: "Collecting spear" },
  recruit: { icon: "+", working: "Welcoming a settler", travelling: "Preparing recruitment" },
  expand_farm: { icon: "🌾", working: "Expanding a field", travelling: "Going to expand field", tool: "hammer" },
  commission_monument: { icon: "⚑", working: "Raising monument", travelling: "Going to build monument", tool: "hammer" },
  craft_planks: { icon: "🪚", working: "Crafting planks", travelling: "Going to workshop", tool: "hammer" },
  build_workshop: { icon: "🔨", working: "Building workshop", travelling: "Going to build workshop", tool: "hammer" },
  build_defense: { icon: "🛡", working: "Building palisades", travelling: "Going to build defenses", tool: "hammer" },
  upgrade_home: { icon: "🏠", working: "Improving a house", travelling: "Going to improve housing", tool: "hammer" },
  scout: { icon: "👁", working: "Scouting rival camp", travelling: "Scouting rival camp" },
  raid: { icon: "⚔", working: "Raiding supplies", travelling: "Raiding rival camp" },
  guard: { icon: "🛡", working: "Guarding camp", travelling: "Going on guard" },
  choose_agriculture: { icon: "🌾", working: "Choosing agriculture", travelling: "Choosing agriculture" },
  choose_industry: { icon: "⚒", working: "Choosing industry", travelling: "Choosing industry" },
  choose_frontier: { icon: "⚑", working: "Choosing frontier", travelling: "Choosing frontier" },
  plan_farm: { icon: "📐", working: "Planning a farm", travelling: "Planning a farm" },
  build_farm: { icon: "🔨", working: "Building the farm", travelling: "Going to build farm", tool: "hammer" },
  plant_crops: { icon: "🌱", working: "Planting crops", travelling: "Going to plant" },
  harvest_crops: { icon: "🌾", working: "Harvesting crops", travelling: "Going to harvest" },
  fish: { icon: "🎣", working: "Fishing", travelling: "Going fishing" },
  chop_tree: { icon: "🪓", working: "Chopping wood", travelling: "Going to chop wood", tool: "axe" },
  mine_stone: { icon: "⛏", working: "Mining stone", travelling: "Going to mine stone", tool: "pickaxe" },
  gather_berries: { icon: "🫐", working: "Picking berries", travelling: "Going to pick berries" },
  fetch_water: { icon: "💧", working: "Collecting water", travelling: "Going to fetch water" },
  build_hut: { icon: "🔨", working: "Building a hut", travelling: "Going to build", tool: "hammer" },
  eat: { icon: "🍎", working: "Eating", travelling: "Going to eat" },
  drink: { icon: "💧", working: "Drinking", travelling: "Going to drink" },
  rest: { icon: "☾", working: "Resting", travelling: "Going to rest" },
};

const activityFor = (action) => {
  if (action.startsWith("learn_")) return { icon: "★", working: `Learning ${action.slice(6).replaceAll("_", " ")}`, travelling: "Training" };
  if (action.startsWith("research_")) return { icon: "📖", working: `Planning ${action.slice(9).replaceAll("_", " ")}`, travelling: "Planning research" };
  return activities[action];
};

/** Creates a readable, selectable activity bubble without stealing camera gestures. */
export function createActivityBubble(name, onSelect) {
  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "activity-bubble";
  const icon = document.createElement("span");
  icon.className = "activity-icon";
  icon.setAttribute("aria-hidden", "true");
  const caption = document.createElement("span");
  caption.className = "activity-caption";
  bubble.append(icon, caption);
  bubble.addEventListener("click", onSelect);
  bubble.dataset.name = name;
  return { bubble, icon, caption };
}

/** Updates task intent from the assigned task, never from a predicted AI decision. */
export function updateActivityBubble(model, walking, paused) {
  const activity = model.task === null ? null : activityFor(model.task.action);
  const travelling = walking || (model.task !== null && model.task.route.length > 0);
  const text = model.task?.cargo !== undefined ? `Bringing home ${model.task.cargo} stolen ${model.task.cargoKind ?? "food"}` : activity === null ? "Deciding…" : travelling ? activity.travelling : activity.working;
  const label = paused ? `Paused · ${text}` : text;
  if (model.caption.textContent === label) return;
  model.icon.textContent = paused ? "Ⅱ" : activity === null ? "…" : `${travelling ? "↗ " : ""}${activity.icon}`;
  model.caption.textContent = label;
  model.bubble.title = `${model.bubble.dataset.name}: ${label}`;
  model.bubble.setAttribute("aria-label", `Inspect ${model.bubble.dataset.name}: ${label}`);
}

/** Poses shoulder and hip joints from travelled distance and the current work phase. */
export function animateColonist(model, now, distance, walking, working, reducedMotion) {
  model.stride += distance * 8;
  model.body.position.y = 0;
  model.body.rotation.x = 0;
  for (const joint of [...model.arms, ...model.legs]) joint.rotation.x = 0;
  for (const tool of Object.values(model.tools)) tool.visible = false;
  if (walking) {
    if (reducedMotion) return;
    const swing = Math.sin(model.stride);
    model.legs[0].rotation.x = swing * 0.65;
    model.legs[1].rotation.x = -swing * 0.65;
    model.arms[0].rotation.x = -swing * 0.5;
    model.arms[1].rotation.x = swing * 0.5;
    model.body.position.y = Math.abs(Math.sin(model.stride)) * 0.035;
    return;
  }
  if (!working || model.task === null) return;
  const action = model.task.action;
  const activity = activityFor(action);
  const cycle = reducedMotion ? 0 : Math.sin(now * 0.008 + model.phase);
  if (activity.tool) {
    model.tools[activity.tool].visible = true;
    model.arms[1].rotation.x = -1.1 + cycle * 0.9;
    model.arms[0].rotation.x = -0.35;
    model.body.rotation.x = 0.08 + cycle * 0.06;
  } else if (action === "gather_berries" || action === "fetch_water" || action === "plant_crops" || action === "harvest_crops") {
    model.body.rotation.x = 0.2 + cycle * 0.1;
    model.arms[0].rotation.x = -0.8 + cycle * 0.25;
    model.arms[1].rotation.x = -0.8 - cycle * 0.25;
  } else if (action === "fish") {
    model.tools.fishingRod.visible = true;
    model.arms[0].rotation.x = -1.1;
    model.arms[1].rotation.x = -1.1 + cycle * 0.1;
  } else if (action === "eat" || action === "drink") {
    model.arms[1].rotation.x = -2.3 + cycle * 0.2;
  } else if (action === "rest") {
    model.body.position.y = -0.16;
    model.legs[0].rotation.x = -Math.PI / 2;
    model.legs[1].rotation.x = -Math.PI / 2;
  }
}
