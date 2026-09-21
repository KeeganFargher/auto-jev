import { setBowDraw } from "./world-models.js";
const workerActivities = {
  gather_wood: { icon: "🪓", working: "Chopping wood", travelling: "Going to chop wood", tool: "axe" },
  gather_stone: { icon: "⛏", working: "Quarrying stone", travelling: "Going to quarry", tool: "pickaxe" },
  gather_food: { icon: "🫐", working: "Picking berries", travelling: "Going to pick berries" },
  mine_iron: { icon: "⛏", working: "Mining iron", travelling: "Going to the iron", tool: "pickaxe" },
  tend_farm: { icon: "🌾", working: "Tending the farm", travelling: "Going to the farm" },
  construct: { icon: "🔨", working: "Building", travelling: "Going to build", tool: "hammer" },
  repair: { icon: "🔧", working: "Repairing", travelling: "Going to repair", tool: "hammer" },
  flee: { icon: "🏃", working: "Fleeing", travelling: "Fleeing home" },
};
const squadStates = { holding: "Holding", moving: "Marching", fighting: "Fighting", retreating: "Retreating", building: "Raising an outpost" };

/** Describes what a person is doing from authoritative state, never from a predicted decision. */
export function describePerson(person, faction, tick = Infinity) {
  const engaged = person.effects?.engagedAt !== undefined && tick - person.effects.engagedAt <= 4;
  if (person.role === "worker") {
    const task = person.task;
    if (task === null) return { icon: "…", text: "Awaiting work", tool: null, travelling: false, working: false };
    const activity = workerActivities[task.action];
    if (task.phase === "return") return { icon: "↩", text: `Hauling ${task.cargo?.amount ?? 0} ${task.cargo?.resource ?? "supplies"} home`, tool: null, travelling: true, working: false };
    const travelling = task.route.length > 0;
    return { icon: `${travelling ? "↗ " : ""}${activity.icon}`, text: travelling ? activity.travelling : activity.working, tool: activity.tool ?? null, travelling, working: !travelling };
  }
  const squad = faction.squads.find((candidate) => candidate.id === person.squadId);
  if (squad === undefined) return { icon: "⚔", text: "Rallying", tool: null, travelling: true, working: false };
  const state = squadStates[squad.state] ?? squad.state;
  // In contact, rather than merely belonging to a squad that is in a battle somewhere.
  const fighting = squad.state === "fighting" && engaged;
  return { icon: fighting ? "⚔" : squad.state === "retreating" ? "🏳" : squad.home ? "🛡" : "🚩", text: squad.home ? (fighting ? "Defending the town" : "Guarding the town") : `${state} · ${squad.objective.label}`, tool: null, travelling: squad.state === "moving" || squad.state === "retreating", working: fighting || squad.state === "building" };
}

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
  const healthTrack = document.createElement("span");
  healthTrack.className = "unit-health-track";
  healthTrack.setAttribute("aria-hidden", "true");
  const healthBar = document.createElement("i");
  healthTrack.append(healthBar);
  bubble.append(icon, caption, healthTrack);
  bubble.addEventListener("click", onSelect);
  bubble.dataset.name = name;
  return { bubble, icon, caption, healthBar };
}

/** Updates a bubble's text only when it changes, to avoid layout churn. */
export function updateActivityBubble(model, name, activity, paused) {
  const description = model.heroId === undefined ? activity.text : `${name} · ${activity.text}`;
  const label = paused ? `Paused · ${description}` : description;
  if (model.caption.textContent === label && model.bubble.dataset.name === name) return;
  model.bubble.dataset.name = name;
  model.icon.textContent = paused ? "Ⅱ" : activity.icon;
  model.caption.textContent = label;
  model.bubble.title = `${name}: ${label}`;
  model.bubble.setAttribute("aria-label", `Inspect ${name}: ${label}`);
}

const FLINCH_MS = 340;
/** Braces a body against a blow, layered over whatever pose is already running.
 *  Everyone gets this: a worker caught by a raider reacts the same as a soldier in a line. */
function flinch(model, now, reduced) {
  const t = (now - model.hitStarted) / FLINCH_MS;
  if (!(t >= 0 && t < 1) || reduced) return;
  // Snap to full in the first fifth, then ride it out and settle past centre.
  const jolt = t < 0.2 ? t / 0.2 : Math.pow(1 - (t - 0.2) / 0.8, 2);
  const settle = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.4) / 0.6))) * 0.22;
  const power = Math.min(1.2, Math.max(0.45, (model.hitPower ?? 5) / 7));
  const shock = jolt * power;
  // The incoming direction in the body's own frame, so the brace is always away from the attacker.
  const yaw = model.group.rotation.y;
  const dir = model.hitDir ?? { x: 0, z: 1 };
  const lx = dir.x * Math.cos(yaw) - dir.z * Math.sin(yaw);
  const lz = dir.x * Math.sin(yaw) + dir.z * Math.cos(yaw);
  const { body, arms, legs } = model;
  body.position.x -= lx * shock * 0.09;
  body.position.z -= lz * shock * 0.09;
  body.position.y += shock * 0.035 - settle * 0.02;
  body.rotation.x -= lz * (shock * 0.26 - settle * 0.12);
  body.rotation.z += lx * (shock * 0.2 - settle * 0.1);
  // Arms clutch in across the chest rather than flying open: a brace, not a launch.
  arms.forEach((arm, i) => {
    const side = i === 0 ? -1 : 1;
    arm.rotation.x -= shock * (0.45 + 0.2 * Math.abs(lz));
    arm.rotation.z -= side * shock * 0.42;
  });
  // One foot braces back so the stagger carries weight.
  legs[0].rotation.x += lz * shock * 0.3;
  legs[1].rotation.x -= lz * shock * 0.16;
}

/** Poses shoulder and hip joints from travelled distance and the current work phase. */
export function animateColonist(model, now, distance, walking, working, reducedMotion) {
  // A siege engine has no rig to pose: its joint arrays are empty, so the humanoid path would only
  // reach past the end of them. It rocks on its frame and throws with its arm instead.
  if (model.isMachine) { poseMachine(model, now, reducedMotion); return; }
  poseBase(model, now, distance, walking, working, reducedMotion);
  flinch(model, now, reducedMotion);
}

const THROW_RELEASE = 0.18;
/** Slings a siege engine's arm over in the first fifth of its strike window, then winches it back down. */
function poseMachine(model, now, reduced) {
  model.body.position.set(0, 0, 0);
  model.body.rotation.set(0, 0, 0);
  if (model.weapon) model.weapon.rotation.x = 0;
  if (model.payload) model.payload.visible = true;
  const elapsed = (now - model.attackStarted) / 450;
  if (reduced || !(model.fighting && !model.paused) || !(elapsed >= 0 && elapsed < 1)) return;
  const swing = elapsed < THROW_RELEASE ? elapsed / THROW_RELEASE : Math.pow(1 - (elapsed - THROW_RELEASE) / (1 - THROW_RELEASE), 1.6);
  if (model.weapon) model.weapon.rotation.x = swing * 2.45;
  if (model.payload) model.payload.visible = elapsed < THROW_RELEASE;
  // The frame kicks back against its wheels rather than the machine sliding.
  model.body.rotation.x = -swing * 0.07;
  model.body.position.z = -swing * 0.06;
}
function poseBase(model, now, distance, walking, working, reducedMotion) {
  if (model.bow && !(model.fighting && !model.paused)) setBowDraw(model.bow, 0.16);
  model.stride += distance * 8;
  model.body.position.set(0, 0, 0);
  model.body.rotation.set(0, 0, 0);
  for (const joint of [...model.arms, ...model.legs]) joint.rotation.set(0, 0, 0);
  for (const tool of Object.values(model.tools)) tool.visible = false;
  if (model.fighting && !model.paused) {
    poseCombat(model, now, reducedMotion, walking);
    return;
  }
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
  if (!working || model.activity === null) return;
  const cycle = reducedMotion ? 0 : Math.sin(now * 0.008 + model.phase);
  if (model.activity.tool) {
    model.tools[model.activity.tool].visible = true;
    model.arms[1].rotation.x = -1.1 + cycle * 0.9;
    model.arms[0].rotation.x = -0.35;
    model.body.rotation.x = 0.08 + cycle * 0.06;
  } else {
    model.body.rotation.x = 0.2 + cycle * 0.1;
    model.arms[0].rotation.x = -0.8 + cycle * 0.25;
    model.arms[1].rotation.x = -0.8 - cycle * 0.25;
  }
}

const DRAW_END = 0.55, LOOSE_END = 0.7;
/** A bow's draw over one strike window: pull slowly, loose fast, recover to a half-nocked ready. */
export function bowPhase(elapsed) {
  const ready = 0.16;
  if (elapsed < 0 || elapsed >= 1) return { draw: ready, loose: 0 };
  if (elapsed < DRAW_END) {
    const t = elapsed / DRAW_END;
    return { draw: ready + (1 - ready) * t * t * (3 - 2 * t), loose: 0 };
  }
  if (elapsed < LOOSE_END) {
    const t = (elapsed - DRAW_END) / (LOOSE_END - DRAW_END);
    return { draw: 1 - t, loose: 1 - t };
  }
  const t = (elapsed - LOOSE_END) / (1 - LOOSE_END);
  return { draw: ready * t, loose: 0 };
}
/** Separates bow release, spellcasting, heavy blows and sword sweeps from work animations. */
function poseCombat(model, now, reduced, walking) {
  const elapsed = (now - model.attackStarted) / 450;
  const strike = elapsed >= 0 && elapsed < 1 && !reduced ? Math.sin(elapsed * Math.PI) : 0;
  const recoil = !reduced ? Math.max(0, 1 - (now - model.hitStarted) / 220) : 0;
  // Between blows a fighter still breathes and shifts its guard; without this it is a frozen statue for
  // the seconds between swings, which is most of a fight.
  const guard = reduced ? 0 : Math.sin(now * 0.006 + model.phase);
  const sway = reduced ? 0 : Math.sin(now * 0.0031 + model.phase * 1.7);
  model.body.rotation.x = -recoil * 0.18 + guard * 0.05;
  model.body.rotation.y = sway * 0.09;
  model.body.position.y = guard * 0.02;
  if (walking && !reduced) {
    // Advancing on an enemy still needs legs; combat used to override the walk cycle and slide instead.
    const step = Math.sin(model.stride);
    model.legs[0].rotation.x = step * 0.6;
    model.legs[1].rotation.x = -step * 0.6;
    model.body.position.y += Math.abs(step) * 0.03;
  } else {
    model.legs[0].rotation.x = 0.2 + guard * 0.03;
    model.legs[1].rotation.x = -0.2 - guard * 0.03;
  }
  if (model.role === "archer") {
    const { draw, loose } = bowPhase(reduced ? 1 : elapsed);
    setBowDraw(model.bow, draw);
    // Bow arm stays extended on the target; the string hand hauls back across the chest and snaps open.
    // Bow arm reaches out to the grip and stays there; the string hand hauls across the chest to the
    // nock, then springs open on the loose.
    model.arms[0].rotation.x = -1.25 - draw * 0.04 + guard * 0.04;
    model.arms[0].rotation.z = -0.1;
    model.arms[1].rotation.x = -0.6 + draw * 1.0 + guard * 0.05;
    model.arms[1].rotation.z = -0.85 - draw * 0.6 + loose * 0.5;
    model.body.rotation.y += draw * 0.2 - loose * 0.14;
    model.body.rotation.x -= draw * 0.06;
  } else if (["veyra", "elowen", "nyx"].includes(model.heroId)) {
    model.arms[0].rotation.x = -1.1 - strike * 0.5 + guard * 0.08;
    model.arms[1].rotation.x = -1.1 - strike * 0.5 - guard * 0.08;
    model.arms[0].rotation.z = -0.3;
    model.arms[1].rotation.z = 0.3;
  } else if (["thorn", "orun"].includes(model.heroId)) {
    model.arms[1].rotation.x = -0.8 - strike * 1.7 + guard * 0.09;
    model.body.rotation.x += strike * 0.2;
  } else if (model.heroId === "kael") {
    model.arms[1].rotation.x = -1.3 + guard * 0.08;
    model.arms[1].rotation.z = -0.5 + strike * 1.6;
    model.body.rotation.y += strike * 0.6;
  } else {
    model.arms[0].rotation.x = -0.8 - strike * 0.8 + guard * 0.09;
    model.arms[1].rotation.x = -0.7 - guard * 0.06;
    model.body.position.z = strike * 0.12;
  }
}
