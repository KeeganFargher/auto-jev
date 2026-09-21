import { hudIcon as icon } from "./hud-icons.js";
import { lowPolyArt, familyOf, FAMILY_ICON, FAMILY_TONE, FAMILY_MOTIF, optionArtwork, portraitOf, jevPortraitOf, crestOf, esc } from "./card-art.js";

const $ = (selector) => document.querySelector(selector);
const label = (value) => String(value ?? "").replaceAll("_", " ");
const EVENT_ICON = {
  capture: "flag", battle: "battle", recruit: "people", build: "settlement", built: "settlement",
  lord: "helm", level: "star", skill: "star", relic: "essence", eliminated: "skull", victory: "crown", bankrupt: "warning",
  age: "warning", destroyed: "skull", withdraw: "truce", decision: "target", raid: "fire",
};
const UNIT_ICON = {
  militia: "people", spearmen: "spear", swordsmen: "weapons", archers: "bow", crossbowmen: "bow",
  light_cavalry: "horse", heavy_cavalry: "horse", shieldguard: "shield", great_weapons: "mace",
  ogre: "beast", battle_mage: "essence", catapult: "catapult",
};
const factionOf = (world, id) => world.factions.find((faction) => faction.id === id);
const heroOf = (catalog, lord) => catalog.heroes?.find((hero) => hero.id === lord?.heroId);
const heroName = (catalog, lord) => heroOf(catalog, lord)?.name ?? label(lord?.heroId ?? "Jev");

/** Fills every `data-icon` placeholder in the static markup. */
export function initIcons() {
  for (const element of document.querySelectorAll("[data-icon]")) element.innerHTML = icon(element.dataset.icon);
}

// ---------------------------------------------------------------- top bar

/** Faction switch plus the followed faction's numbers: gold and its trend, land, hosts, soldiers. */
export function renderTop(world, activeId, catalog, onSelect) {
  const nav = $("#faction-switch");
  const wanted = world.factions.map((faction) => faction.id).join("|");
  if (nav.dataset.factions !== wanted) {
    nav.dataset.factions = wanted;
    nav.replaceChildren(...world.factions.map((faction) => {
      const button = document.createElement("button");
      button.type = "button"; button.dataset.faction = faction.id;
      button.style.setProperty("--crest", faction.color);
      const crest = crestOf(faction.id);
      button.innerHTML = `<span class="crest">${crest === null ? "" : `<img src="${crest}" alt="" draggable="false">`}</span><span class="name"></span><small></small>`;
      button.addEventListener("click", () => onSelect(faction.id));
      return button;
    }));
  }
  for (const button of nav.children) {
    const faction = factionOf(world, button.dataset.faction);
    const held = world.provinces.filter((province) => province.ownerId === faction.id).length;
    button.setAttribute("aria-pressed", String(faction.id === activeId));
    button.classList.toggle("out", faction.eliminated);
    button.querySelector(".name").textContent = faction.name;
    button.querySelector("small").textContent = String(held);
  }
  $("#turn").textContent = String(world.turn);
  const status = $("#connection");
  status.textContent = world.status.state === "finished" ? "Finished" : world.phase === "battle" ? "Battle" : world.speed === 0 ? "Paused" : "Live";
  status.className = `status ${world.phase === "battle" ? "battle" : ""}`;
  for (const button of document.querySelectorAll("#speed button")) button.classList.toggle("on", Number(button.dataset.speed) === (world.speed ?? 1));

  const faction = factionOf(world, activeId) ?? world.factions[0];
  const armies = world.armies.filter((army) => army.factionId === faction.id);
  const soldiers = armies.reduce((sum, army) => sum + army.units.reduce((count, card) => count + card.models, 0), 0);
  const held = world.provinces.filter((province) => province.ownerId === faction.id);
  const buildings = held.reduce((sum, province) => sum + (province.settlement?.buildings.length ?? 0), 0);
  const lord = faction.lords.find((entry) => entry.condition !== "dead");
  const net = faction.income - faction.upkeep;
  const items = [
    ["supplies", Math.round(faction.gold), `${net >= 0 ? "+" : ""}${net}`, net >= 0 ? "up" : "down", `Gold · ${faction.income} income, ${faction.upkeep} upkeep`],
    ["flag", held.length, null, null, "Provinces held"],
    ["weapons", armies.length, null, null, "Armies in the field"],
    ["people", soldiers, null, null, "Soldiers under arms"],
    ["settlement", buildings, null, null, "Buildings raised"],
    [lord === undefined ? "helm" : jevPortraitOf(lord.heroId) ?? "helm", lord === undefined ? "—" : `L${lord.level}`, lord === undefined ? null : heroName(catalog, lord), null, lord === undefined ? "No Jev" : `${heroName(catalog, lord)} · ${lord.condition}`],
  ];
  // A glyph name draws an icon; a path means there is artwork for it and the artwork wins.
  const mark = (glyph) => glyph.startsWith("/") ? `<img class="resource-art" src="${glyph}" alt="" draggable="false">` : icon(glyph);
  $("#stockpile").innerHTML = items.map(([glyph, value, extra, direction, title]) =>
    `<span class="resource" title="${title}" ${direction ? `data-direction="${direction}"` : ""}>${mark(glyph)}<strong>${value}</strong>${extra === null ? "" : `<small>${extra}</small>`}</span>`).join("");
}

// ---------------------------------------------------------------- stories rail

const intentionCards = new Map();
const storyCards = new Map();
const ORDER_VERB = { hold: "Holding", move: "Moving to", attack: "Marching on", besiege: "Besieging", retreat: "Falling back", reinforce: "Reinforcing", scout: "Scouting" };
const ORDER_ICON = { hold: "shield", move: "move", attack: "flag", besiege: "tower", retreat: "truce", reinforce: "people", scout: "target", raid: "fire" };

function reconcile(items, collection, parent, build) {
  const ids = new Set(items.map((item) => item.id));
  for (const [id, node] of collection) if (!ids.has(id)) { node.remove(); collection.delete(id); }
  items.forEach((item, index) => {
    let node = collection.get(item.id);
    if (node === undefined) { node = build(item); collection.set(item.id, node); }
    item.fill(node);
    if (parent.children[index] !== node) parent.insertBefore(node, parent.children[index] ?? null);
  });
}

/** One card per army: which Jev, and what it is doing right now. */
export function renderIntentions(world, catalog, onPick) {
  const items = world.armies.map((army) => {
    const faction = factionOf(world, army.factionId);
    const lord = faction?.lords.find((entry) => entry.id === army.lordId);
    const target = world.provinces.find((province) => province.id === army.order.targetProvinceId);
    const kind = army.shattered ? "retreat" : army.order.kind;
    return {
      id: army.id,
      fill(node) {
        node.style.setProperty("--crest", faction?.color ?? "#999");
        const glyph = node.querySelector(".story-icon");
        if (glyph.dataset.icon !== ORDER_ICON[kind]) { glyph.dataset.icon = ORDER_ICON[kind]; glyph.innerHTML = icon(ORDER_ICON[kind] ?? "flag"); }
        node.querySelector("small").textContent = `${faction?.name ?? "?"} · ${heroName(catalog, lord)}`;
        node.querySelector("strong").textContent = army.shattered ? "Falling back to rebuild" : target === undefined ? army.order.label : `${ORDER_VERB[kind] ?? "Moving to"} ${target.name}`;
      },
    };
  });
  reconcile(items, intentionCards, $("#intentions"), (item) => {
    const node = document.createElement("button");
    node.type = "button"; node.className = "intention-card hud-surface";
    node.innerHTML = '<span class="story-icon"></span><span class="story-copy"><small></small><strong></strong></span>';
    node.addEventListener("click", () => onPick(item.id));
    return node;
  });
}

/** The three best stories on the map right now; the director's current one is marked. */
export function renderStories(stories, world, watchingId, onPick) {
  const top = stories.slice(0, 3).map((story) => ({
    id: story.id,
    fill(node) {
      node.className = `story-card hud-surface ${story.tone ?? "notice"}${story.id === watchingId ? " is-watching" : ""}`;
      node.style.setProperty("--crest", story.colour ?? "#e5cf93");
      const glyph = node.querySelector(".story-icon");
      if (glyph.dataset.icon !== story.icon) { glyph.dataset.icon = story.icon; glyph.innerHTML = icon(story.icon ?? "star"); }
      node.querySelector("small").textContent = `${factionOf(world, story.factionId)?.name ?? "The map"} · ${story.score >= 80 ? "Right now" : "Developing"}`;
      node.querySelector("strong").textContent = story.title;
      node.querySelector(".story-context").textContent = story.context ?? "";
    },
  }));
  reconcile(top, storyCards, $("#stories"), (item) => {
    const node = document.createElement("button");
    node.type = "button";
    node.innerHTML = '<span class="story-icon"></span><span class="story-copy"><small></small><strong></strong><span class="story-context"></span></span>';
    node.addEventListener("click", () => onPick(item.id));
    return node;
  });
  $("#stories-quiet").hidden = top.length > 0;
}

export function showEventDetail(story, world) {
  const panel = $("#event-detail");
  if (story === null) { panel.hidden = true; return; }
  panel.hidden = false;
  $("#event-faction").textContent = `${factionOf(world, story.factionId)?.name ?? "The map"} · live observation`;
  $("#event-title").textContent = story.title;
  $("#event-message").textContent = story.detail;
  $("#event-context").textContent = story.context ?? "";
  $("#event-follow").hidden = story.armyId === undefined || story.armyId === null;
}

// ---------------------------------------------------------------- decisions

const HEADING = {
  objective: (faction) => `${faction.name} sets an objective`,
  recruit: (faction) => `${faction.name} musters troops`,
  battle: (faction) => `${faction.name} weighs a battle`,
  skill: (faction, lord) => `${lord} chooses a path`,
  lord: (faction) => `${faction.name} considers a second Jev`,
  doctrine: (faction) => `${faction.name} changes how it makes war`,
  build: (faction) => `${faction.name} breaks ground`,
  truce: (faction) => `${faction.name} weighs terms`,
};
const STANCE_LABEL = { march: "marching", fortify: "dug in", raid: "raiding", ambush: "lying in wait" };
let showing = null;
/** The dimmed band at the foot of the screen that either beat sits on. */
function syncStage() { $("#hud").classList.toggle("is-staging", !$("#decision").hidden || !$("#turn-card").hidden); }
/** Long enough for the highlight to sweep the row twice; the rest of the hold sits on the answer. */
const ROLL_MS = 2000;
const MIN_HOP_MS = 52;
/** The pacer's own step, matching the server's, so both count the hold down together. */
const TICK_MS = 50;
const HOP_GROWTH = 1.19;

/**
 * The order the highlight visits the cards in, and when. It always walks the row rather than
 * jumping about: a sweep that keeps slowing reads as a decision being made, where random hops read
 * as a broken widget. The last stop is the option the Jev actually took, so the landing is honest.
 */
function spinPlan(count, chosen, budget) {
  if (count < 2) return { order: [chosen], times: [budget] };
  const geometric = (steps) => (HOP_GROWTH ** steps - 1) / (HOP_GROWTH - 1);
  let hops = 2;
  while (hops < 40 && budget / geometric(hops + 1) >= MIN_HOP_MS) hops += 1;
  const total = geometric(hops);
  const order = [], times = [];
  let elapsed = 0;
  for (let step = 0; step < hops; step++) {
    elapsed += budget * HOP_GROWTH ** step / total;
    order.push(((chosen - (hops - 1 - step)) % count + count) % count);
    times.push(elapsed);
  }
  times[hops - 1] = budget;
  return { order, times };
}

function optionCard(option, share, index) {
  const family = familyOf(option.id);
  const tags = (option.tags ?? []).slice(0, 3);
  // The card shows what the choice is about: the regiment it would hire, or the country it would
  // march into. Only a choice about neither — bank the gold, pull back — keeps the drawn skyline.
  const artwork = optionArtwork(option);
  const art = artwork === null
    ? `${lowPolyArt(option.id, FAMILY_MOTIF[family])}<span class="option-glow"></span><span class="option-icon">${icon(FAMILY_ICON[family])}</span>`
    : artwork.kind === "portrait"
      ? `<img class="option-portrait" src="${artwork.url}" alt="" draggable="false"><span class="option-glow"></span>`
      : artwork.kind === "crest"
        ? `<img class="option-crest" src="${artwork.url}" alt="" draggable="false"><span class="option-glow"></span>`
        : `<img class="option-scene" src="${artwork.url}" alt="" draggable="false"><span class="option-glow"></span><span class="option-icon">${icon(FAMILY_ICON[family])}</span>`;
  return `<div class="option ${artwork === null ? "has-drawing" : `has-${artwork.kind}`}" data-index="${index}" style="--tone:${FAMILY_TONE[family]};--stagger:${index * 45}ms" title="${esc(option.description)}">
    <span class="option-art">${art}</span>
    <span class="option-copy">
      <span class="option-verb">${esc(option.verb ?? "")}</span>
      <strong class="option-subject">${esc(option.subject ?? option.label)}</strong>
      <span class="option-tags">${tags.map((tag) => `<i>${esc(tag)}</i>`).join("")}</span>
    </span>
    <span class="odds"><i><b></b></i><span>${Math.round(share * 100)}%</span></span>
  </div>`;
}

/**
 * Shows a Jev's choice for as long as the server holds on it. The highlight sweeps the row, slowing
 * as it goes, and lands on the option the Jev took; everything else then falls back out of focus.
 *
 * The beat runs on its own interval rather than the render loop. A throttled tab hands the render
 * loop one frame every few seconds, and a single frame that wide used to swallow the whole hold:
 * the card appeared and vanished between two paints. Timers still fire when frames do not.
 */
export function showDecision(faction, decision, lordName, holdMs, speed = 1) {
  const getSpeed = typeof speed === "function" ? speed : () => speed;
  retireTurnCard();
  const panel = $("#decision");
  const total = decision.options.reduce((sum, option) => sum + (option.score ?? 0), 0);
  const shares = decision.options.map((option) => total > 0 ? (option.score ?? 0) / total : 1 / decision.options.length);
  const chosen = Math.max(0, decision.options.findIndex((option) => option.id === decision.choice));
  const roll = Math.max(600, Math.min(ROLL_MS, holdMs * 0.55));
  clearInterval(showing?.timer);
  showing = {
    faction, decision, shares, hold: holdMs, roll, chosen, getSpeed,
    plan: spinPlan(decision.options.length, chosen, roll),
    spent: 0, real: 0, step: 0, landed: false, timer: setInterval(advance, TICK_MS),
  };
  $("#decision-title").textContent = (HEADING[decision.kind] ?? HEADING.objective)(faction, lordName);
  $("#decision-crest").style.setProperty("--crest", faction.color);
  $("#decision-sweep").style.width = "0%";
  panel.classList.remove("is-decided");
  $("#decision-options").innerHTML = decision.options.map((option, index) => optionCard(option, shares[index], index)).join("");
  panel.hidden = false;
  syncStage();
  requestAnimationFrame(() => { for (const [index, bar] of [...panel.querySelectorAll(".odds b")].entries()) bar.style.width = `${shares[index] * 100}%`; });
}
/** The decision currently on screen, so the director can look at what it concerns. */
export const currentDecision = () => showing;

/**
 * One step of the hold. The budget is game time, drained at the playback speed exactly as the
 * server's pacer drains it, so a pop-out never outlives the turn it belongs to when the spectator
 * fast-forwards, and waits with the campaign when they pause.
 */
function advance() {
  if (showing === null) return;
  const options = [...$("#decision-options").children];
  showing.real += TICK_MS;
  // A missed snapshot can leave the client thinking the match is paused when it is not. The wall
  // clock is the backstop: nothing stays on screen indefinitely because of a stale speed.
  if (showing.real > showing.hold * 3 + 8000) { clearDecisions(); return; }
  const speed = Math.max(0, showing.getSpeed());
  if (speed === 0) return;
  showing.spent += TICK_MS * speed;
  const elapsed = showing.spent;
  if (!showing.landed) {
    $("#decision-sweep").style.width = `${Math.min(100, elapsed / showing.roll * 100).toFixed(1)}%`;
    while (showing.step < showing.plan.times.length && elapsed >= showing.plan.times[showing.step]) {
      const live = showing.plan.order[showing.step];
      for (const [index, node] of options.entries()) node.classList.toggle("is-live", index === live);
      showing.step += 1;
    }
    if (elapsed < showing.roll) return;
    showing.landed = true;
    for (const [index, node] of options.entries()) { node.classList.remove("is-live"); node.classList.toggle("taken", index === showing.chosen); }
    $("#decision").classList.add("is-decided");
    return;
  }
  if (elapsed >= showing.hold) clearDecisions();
}

export function clearDecisions() {
  clearInterval(showing?.timer);
  showing = null;
  $("#decision").hidden = true;
  $("#decision").classList.remove("is-decided");
  syncStage();
}

// ---------------------------------------------------------------- faction panel and journal

export function renderFactionPanel(world, factionId, catalog) {
  const faction = factionOf(world, factionId);
  if (faction === undefined) return;
  $("#faction-title").innerHTML = `<span class="crest" style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${faction.color};margin-right:8px"></span>${faction.name}${faction.eliminated ? " · fallen" : ""}`;
  const held = world.provinces.filter((province) => province.ownerId === faction.id);
  const armies = world.armies.filter((army) => army.factionId === faction.id);
  const unitName = (id) => catalog.units?.find((unit) => unit.id === id)?.name ?? label(id);
  const buildingName = (id) => catalog.buildings?.find((building) => building.id === id)?.name ?? label(id);
  $("#faction-body").innerHTML = `
    <div class="metrics">
      <span class="metric">${icon("supplies")}<strong>${Math.round(faction.gold)}</strong><small>${faction.income - faction.upkeep >= 0 ? "+" : ""}${faction.income - faction.upkeep} per turn</small></span>
      <span class="metric">${icon("flag")}<strong>${held.length}</strong><small>provinces</small></span>
      <span class="metric">${icon("people")}<strong>${armies.reduce((sum, army) => sum + army.units.reduce((count, card) => count + card.models, 0), 0)}</strong><small>soldiers</small></span>
    </div>
    <h3>Doctrines</h3>
    <div class="doctrine-list">${faction.doctrines.length === 0 ? '<p class="quiet-note">None yet. Doctrines come from taking ground and winning battles.</p>' : faction.doctrines.map((held) => {
      const doctrine = catalog.doctrines?.find((entry) => entry.id === held.id);
      return `<div class="doctrine-row rarity-${doctrine?.rarity ?? "common"}">
        <span class="doctrine-name">${doctrine?.name ?? label(held.id)}${held.stacks > 1 ? ` ×${held.stacks}` : ""}</span>
        <small>${doctrine?.effect ?? ""}</small></div>`;
    }).join("")}</div>
    <h3>Standing</h3>
    <div class="relations">${world.factions.filter((other) => other.id !== faction.id && !other.eliminated).map((other) => {
      const relation = faction.relations?.[other.id];
      const truce = relation !== undefined && relation.truceUntil > world.turn;
      const state = truce ? `Truce to turn ${relation.truceUntil}` : relation?.war === false ? "At peace" : "At war";
      return `<div class="relation ${truce ? "is-truce" : relation?.war === false ? "is-peace" : "is-war"}" style="--crest:${other.color}">
        <span class="relation-name"><i></i>${other.name}</span>
        <span class="relation-state">${state}</span>
        <span class="relation-bar" title="Tension ${Math.round(relation?.tension ?? 0)}"><i style="width:${Math.round(relation?.tension ?? 0)}%"></i></span></div>`;
    }).join("")}</div>
    <h3>Jevs</h3>
    ${faction.lords.map((lord) => {
      const hero = heroOf(catalog, lord);
      return `<div class="lord-card" style="--crest:${hero?.color ?? faction.color}">
        <span class="portrait">${jevPortraitOf(lord.heroId) === null ? icon("helm") : `<img src="${jevPortraitOf(lord.heroId)}" alt="" draggable="false">`}</span>
        <strong>${hero?.name ?? label(lord.heroId)} ${hero?.epithet ?? ""}</strong>
        <span class="lvl">Level ${lord.level}</span>
        <small>${hero?.role ?? ""} · ${lord.condition}${lord.condition !== "ready" && lord.condition !== "dead" ? ` until turn ${lord.unavailableUntil}` : ""} · ${lord.battlesWon}W/${lord.battlesLost}L · ${lord.kills} kills<br>${hero?.ability.name ?? ""}: ${hero?.ability.text ?? ""}</small>
        <span class="tags">${lord.skills.map((skill) => `<span class="tag">${label(skill)}</span>`).join("")}${lord.relics.filter((relic) => relic !== "__looted").map((relic) => `<span class="tag relic">${label(relic)}</span>`).join("")}</span>
      </div>`;
    }).join("") || '<p class="quiet-note">No Jev in the field.</p>'}
    <h3>Armies</h3>
    ${armies.map((army) => `<div class="army-row"><strong>${army.name}</strong> · ${army.shattered ? "shattered" : army.order.label} · ${STANCE_LABEL[army.stance] ?? army.stance} · morale ${Math.round(army.morale)}
      <div class="units">${army.units.map((card) => `<span class="unit-chip">${portraitOf(card.unitId) === null ? icon(UNIT_ICON[card.unitId] ?? "people") : `<img class="chip-art" src="${portraitOf(card.unitId)}" alt="" draggable="false">`}${unitName(card.unitId)} ×${card.models}${card.rank > 0 ? ` · ${["", "Trained", "Seasoned", "Veteran", "Elite"][card.rank]}` : ""}</span>`).join("")}</div></div>`).join("") || '<p class="quiet-note">No armies.</p>'}
    <h3>Holdings</h3>
    ${held.map((province) => `<div class="holding"><span>${province.name}<br><small>${province.kind} · ${province.effectiveIncome ?? province.income} gold${province.settlement?.project ? ` · building ${buildingName(province.settlement.project.building)}, ${province.settlement.project.turnsLeft} turn${province.settlement.project.turnsLeft === 1 ? "" : "s"} left` : ""}</small></span><span><small>${(province.settlement?.buildings ?? []).map(buildingName).join(", ") || (province.settlement ? "no buildings" : "wild")}</small></span></div>`).join("")}`;
}

export function renderJournal(events, world) {
  $("#journal-list").innerHTML = [...events].reverse().filter((event) => event.type !== "decision" && event.importance >= 30).slice(0, 60).map((event) => {
    const faction = factionOf(world, event.factionId);
    return `<li class="${event.importance >= 75 ? "major" : ""}"><span style="color:${faction?.color ?? "var(--muted)"}">${icon(EVENT_ICON[event.type] ?? "journal")}</span><span>${event.text}<small>Turn ${event.turn}</small></span></li>`;
  }).join("") || "<li>Nothing has happened yet.</li>";
}

// ---------------------------------------------------------------- battle, banner, camera badge

export function showBattle(frame, world, provinceName) {
  const bar = $("#battle-bar");
  if (frame === null) { bar.hidden = true; return; }
  bar.hidden = false;
  const attacker = factionOf(world, frame.attackerFactionId), defender = factionOf(world, frame.defenderFactionId);
  const count = (side) => frame.fighters.filter((fighter) => fighter.s === side && fighter.st !== "routing").length;
  const left = count("attacker"), right = count("defender");
  $("#battle-title").textContent = `${frame.siege ? "Siege of" : "Battle of"} ${provinceName}`;
  $("#battle-attacker").textContent = String(left);
  $("#battle-defender").textContent = String(right);
  $("#battle-attacker-colour").style.background = attacker?.color ?? "#999";
  $("#battle-defender-colour").style.background = defender?.color ?? "#999";
  const fill = $("#battle-odds-fill");
  fill.style.width = `${(left / Math.max(1, left + right) * 100).toFixed(0)}%`;
  fill.style.background = attacker?.color ?? "#999";
}

let turnTimers = [];
/**
 * The beat at the top of a faction's turn. Without it turns run into each other, and a faction with
 * nothing to do passes in no time at all with only a small crest changing anywhere on screen.
 * It retires on plain timers: nothing about a one-off card needs to ride the render loop.
 */
export function showTurnCard(faction, stage, holdMs, speed = 1) {
  const card = $("#turn-card");
  const detail = [stage.lord, `${stage.provinces ?? 0} province${stage.provinces === 1 ? "" : "s"}`, `${stage.hosts ?? 0} host${stage.hosts === 1 ? "" : "s"}`].filter((part) => part !== null && part !== undefined);
  $("#turn-label").textContent = "Now moving";
  $("#turn-faction").textContent = faction.name;
  $("#turn-detail").innerHTML = detail.map((part) => `<i>${esc(part)}</i>`).join("");
  $("#turn-art").innerHTML = lowPolyArt(faction.id, "tower", 320, 74);
  const crest = crestOf(faction.id);
  $("#turn-crest").innerHTML = crest === null ? icon("flag") : `<img src="${crest}" alt="" draggable="false">`;
  card.style.setProperty("--crest", faction.color);
  $("#turn-crest").style.setProperty("--crest", faction.color);
  for (const timer of turnTimers) clearTimeout(timer);
  card.classList.remove("is-leaving");
  card.hidden = false;
  // Restart the entrance even when one turn card replaces another.
  card.style.animation = "none";
  void card.offsetWidth;
  card.style.animation = "";
  const hold = Math.max(400, holdMs / Math.max(0.25, speed));
  turnTimers = [
    setTimeout(() => card.classList.add("is-leaving"), hold),
    setTimeout(() => { card.hidden = true; card.classList.remove("is-leaving"); turnTimers = []; syncStage(); }, hold + 320),
  ];
  syncStage();
}
export function clearTurnCard() {
  for (const timer of turnTimers) clearTimeout(timer);
  turnTimers = [];
  $("#turn-card").hidden = true;
  $("#turn-card").classList.remove("is-leaving");
  syncStage();
}
/** Sends the card away now: nothing else may share the screen with it. */
function retireTurnCard() {
  if (turnTimers.length === 0) return;
  const card = $("#turn-card");
  for (const timer of turnTimers) clearTimeout(timer);
  card.classList.add("is-leaving");
  turnTimers = [setTimeout(() => { card.hidden = true; card.classList.remove("is-leaving"); turnTimers = []; syncStage(); }, 320)];
}

const ANNOUNCE_ICON = { doctrine: "doctrine", built: "settlement", construction: "tools", truce: "truce", war: "weapons", raid: "fire", level: "star", bankrupt: "warning", surprise: "warning" };
const ANNOUNCE_LABEL = { doctrine: "Doctrine adopted", built: "Construction complete", construction: "Building begun", truce: "Truce agreed", war: "War", raid: "Raid", level: "Jev advances", bankrupt: "Insolvent", surprise: "The report was wrong" };
let announceTimers = [];
/**
 * The loud strip for the handful of things a spectator must not miss: a doctrine taken, a building
 * finished, a truce signed or broken. Everything else stays in the journal.
 */
export function showAnnouncement(event, world, speed = 1) {
  const label = ANNOUNCE_LABEL[event.type];
  if (label === undefined) return;
  const faction = factionOf(world, event.factionId);
  const node = $("#announce");
  node.style.setProperty("--crest", faction?.color ?? "#e5cf93");
  node.className = `hud-surface announce kind-${event.type}`;
  node.innerHTML = `<span class="announce-crest">${icon(ANNOUNCE_ICON[event.type] ?? "star")}</span>
    <div class="announce-text"><span class="announce-label">${label}</span><strong>${event.text}</strong></div>`;
  for (const timer of announceTimers) clearTimeout(timer);
  node.hidden = false;
  node.style.animation = "none";
  void node.offsetWidth;
  node.style.animation = "";
  // The event carries the budget the server will spend on it, so the strip and the campaign agree.
  const hold = Math.max(1200, (event.hold ?? 4200) / Math.max(0.25, speed));
  announceTimers = [
    setTimeout(() => node.classList.add("is-leaving"), hold),
    setTimeout(() => { node.hidden = true; node.classList.remove("is-leaving"); announceTimers = []; }, hold + 320),
  ];
}
export function clearAnnouncement() {
  for (const timer of announceTimers) clearTimeout(timer);
  announceTimers = [];
  $("#announce").hidden = true;
  $("#announce").classList.remove("is-leaving");
}

export function showBanner(world) {
  const banner = $("#banner");
  if (world.status.state !== "finished") { banner.hidden = true; return; }
  const winner = factionOf(world, world.status.winnerId);
  banner.hidden = false;
  const tally = world.factions.map((faction) => `<span style="color:${faction.color}">${faction.name} · ${world.provinces.filter((province) => province.ownerId === faction.id).length} provinces</span>`).join("");
  banner.innerHTML = `<div><h1 style="color:${winner?.color ?? "#fff"}">${winner?.name ?? "Nobody"} prevails</h1><p>${world.status.reason} — turn ${world.turn}</p><div class="tally">${tally}</div><p>Next campaign begins shortly.</p></div>`;
}

let aftermathTimers = [];
/**
 * The result, held over the field it happened on. The camera used to cut back to the map the moment
 * the fighting stopped, which threw away the one moment the spectator is actually waiting for.
 */
export function showAftermath(report, world) {
  const node = $("#aftermath");
  const winnerId = report.outcome === "attacker" ? report.attackerId : report.defenderId;
  const winner = factionOf(world, winnerId);
  const loser = factionOf(world, report.outcome === "attacker" ? report.defenderId : report.attackerId);
  // A neutral province fields a garrison under no banner, so there is no faction to name.
  const winnerName = winner?.name ?? "The garrison";
  const loserName = loser?.name ?? "The garrison";
  const won = report.outcome === "attacker" ? report.attackerLosses : report.defenderLosses;
  const lost = report.outcome === "attacker" ? report.defenderLosses : report.attackerLosses;
  // The prediction was the attacker's chance, so an upset is a favourite that lost.
  const upset = report.outcome === "defender" ? report.prediction >= 0.62 : report.prediction <= 0.38;
  node.style.setProperty("--crest", winner?.color ?? "#e5cf93");
  node.className = `hud-surface aftermath${report.outcome === "draw" ? " is-draw" : ""}`;
  node.innerHTML = report.outcome === "draw"
    ? `<span class="aftermath-label">Neither side breaks</span><strong>${report.summary}</strong>
       <div class="aftermath-tally"><span>${report.attackerLosses} lost</span><span>${report.defenderLosses} lost</span></div>`
    : `<span class="aftermath-label">${upset ? "Against the odds" : "The field is decided"}</span>
       <strong>${winnerName} holds ${report.summary.includes(" at ") ? report.summary.split(" at ").pop() : "the field"}</strong>
       <div class="aftermath-tally"><span class="is-winner">${winnerName} · ${won} lost</span><span>${loserName} · ${lost} lost</span></div>`;
  for (const timer of aftermathTimers) clearTimeout(timer);
  node.hidden = false;
  node.classList.remove("is-leaving");
  aftermathTimers = [];
}
export function clearAftermath() {
  for (const timer of aftermathTimers) clearTimeout(timer);
  aftermathTimers = [];
  const node = $("#aftermath");
  node.hidden = true;
  node.classList.remove("is-leaving");
}

/**
 * What the hosts are about to do. An arrival the spectator was told about last turn lands on
 * something they already care about; the same arrival unannounced is just another thing happening.
 */
export function renderForecast(entries, world) {
  const block = $("#forecast-block");
  const rail = $("#forecast");
  block.hidden = entries.length === 0;
  rail.innerHTML = entries.map((entry) => {
    const faction = factionOf(world, entry.factionId);
    return `<div class="forecast-row${entry.hostile ? " is-hostile" : ""}" style="--crest:${faction?.color ?? "#e5cf93"}">
      <span class="forecast-icon">${icon(entry.hostile ? "battle" : "move")}</span>
      <span class="forecast-text">${entry.text}</span>
    </div>`;
  }).join("");
}

export function setCameraLabel(text) {
  $("#camera-subject").hidden = text === null;
  if (text !== null) $("#camera-label").textContent = text;
}
