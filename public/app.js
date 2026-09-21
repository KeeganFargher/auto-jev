import { createIndustryView } from "./industry-view.js";
import { createSettlementView } from "./settlement-view.js";
const settlementView = createSettlementView();
import { createTooltip } from "./tooltips.js";
const tooltip = createTooltip();
import { hudIcon } from "./hud-icons.js";
import { createMinimap } from "./minimap.js";
import { createImportantEvents } from "./important-events.js";
import { createProgressionView } from "./progression-view.js";
const progressionView = createProgressionView();
import { createResourceHistory } from "./resource-history.js";
const resourceHistory = createResourceHistory();
const canvas = document.querySelector("#world");
import { createWorldView } from "./world-view.js";

const view = createWorldView(canvas, (id) => {
  const colony = match.colonies.find((candidate) => candidate.colonists.some((person) => person.id === id));
  if (colony.id !== activeColonyId) selectColony(colony.id, false);
  resourceHistory.close();
  closeSettlement();
  selected.colonistId = id;
  view.select(id);
  renderInspector();
  $("#inspector").hidden = false;
  $("#journal").hidden = true;
  $("#toggle-journal").setAttribute("aria-expanded", "false");
}, tooltip, (reference)=>{if(reference.colonyId!==activeColonyId)selectColony(reference.colonyId,false);const colony=match.colonies.find(c=>c.id===reference.colonyId);industryView.open(colony,reference.id);});
const industryView=createIndustryView(position=>view.panTo(position));
let catalog=null;
const minimap = createMinimap(view);
const importantEvents = createImportantEvents(view, (colonyId, personId) => {
  selectColony(colonyId);
  const person = world.colonists.find((candidate) => candidate.id === personId);
  if (person) { selected.colonistId = person.id; view.panTo(person); view.select(person.id); renderInspector(); $("#inspector").hidden = false; }
  else { $("#settlement-summary").hidden = false; $("#toggle-settlement").setAttribute("aria-expanded", "true"); }
});
for (const element of document.querySelectorAll("[data-icon]")) element.innerHTML = hudIcon(element.dataset.icon);
const selected = { colonistId: null };
const recentEvents = [];
let world = null;
let match = null;
let activeColonyId = "ember";
const histories = new Map();

const $ = (selector) => document.querySelector(selector);
const formatNumber = (value) => new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
const label = (value) => value.replaceAll("_", " ");
const need = (name, value, inverse = false) => {
  const display = Math.round(value);
  const width = inverse ? 100 - display : display;
  return `<div class="need"><span>${name}</span><div class="bar"><i style="width:${width}%"></i></div><strong>${display}</strong></div>`;
};

const renderMetrics = () => {
  $("#day").textContent = world.day;
  settlementView.update(world);
  industryView.update(world);
  progressionView.update(world);
  for (const colony of match.colonies) {
    const button = $(`[data-colony="${colony.id}"]`);
    button.setAttribute("aria-pressed", String(colony.id === activeColonyId));
    button.textContent = `${colony.name} · ${colony.colonists.filter((person) => person.health > 0).length}`;
  }
  $("#decisions").textContent = formatNumber(world.stats.decisions);
  $("#jev-calls").textContent = world.stats.jevRequests === 0
    ? "—"
    : `${formatNumber(world.stats.jevRequests)} · ${(world.stats.jevDecisions / world.stats.jevRequests).toFixed(1)}/call`;
  $("#connection").textContent = world.jev.status === "running" ? "Live" : "Waiting for Jev";
  resourceHistory.update(world);
};

const renderInspector = () => {
  const colonist = world.colonists.find((person) => person.id === selected.colonistId);
  if (!colonist) return;
  const probabilities = colonist.lastDecision?.probabilities ?? {};
  const probabilityRows = Object.entries(probabilities)
    .toSorted((left, right) => right[1] - left[1])
    .map(([action, probability]) => `<div class="probability"><span>${label(action)}</span><strong>${Math.round(probability * 100)}%</strong><div class="bar"><i style="width:${probability * 100}%"></i></div></div>`)
    .join("");
  $("#colonist-detail").classList.remove("empty");
  $("#colonist-detail").innerHTML = `
    <div class="person-heading"><h2>${colonist.name}</h2><span class="trait">${label(colonist.trait)}</span></div>
    <div class="worker-progression">Level ${colonist.level} / 30 · ${colonist.experience}/${progressionView.levelCost(colonist.level)} XP<br>${colonist.skillPoints} points to invest · ${Object.values(colonist.talents).reduce((sum, rank) => sum + rank, 0)} ranks learned<br>Spear ${colonist.equipment.weapon} · Tool ${colonist.equipment.tool} uses</div>
    <div class="worker-actions"><button class="tree-open" type="button" id="open-worker-tree">Skill tree & history ↗</button><button class="tree-open" type="button" id="follow-worker" ${colonist.health <= 0 ? "disabled" : ""}>Follow</button></div>
    <div class="current-task"><span class="detail-label">Current task</span><strong>${colonist.task ? colonist.task.cargo !== undefined ? `Returning with ${colonist.task.cargo} stolen ${colonist.task.cargoKind ?? "food"}` : label(colonist.task.action) : "Deciding…"}${colonist.order === null ? "" : ` · ${colonist.order.remaining} repeats queued`}</strong></div>
    ${need("Health", colonist.health)}
    ${need("Hunger", colonist.hunger, true)}
    ${need("Thirst", colonist.thirst, true)}
    ${need("Energy", colonist.fatigue, true)}
    <div class="decision">
      <span class="detail-label">Latest decision</span>
      <div class="decision-meta"><span>${colonist.lastDecision?.source ?? "—"}</span><span>${colonist.lastDecision?.latencyMs ?? "—"} ms</span></div>
      ${probabilityRows || '<p class="empty">No decision yet.</p>'}
    </div>`;
};

const renderEvents = () => {
  $("#event-list").innerHTML = recentEvents.slice(0, 12).map((event) => `<li>${event.message}</li>`).join("");
};

const render = () => {
  if (!world) return;
  renderMetrics();
  const scene = { ...world, terrain:match.terrain, buildingsCatalog:catalog.buildings, colonies: match.colonies };
  view.update(scene);
  minimap.update(scene);
  importantEvents.update(scene);
  view.select(selected.colonistId);
  renderInspector();
};

$("#colonist-detail").addEventListener("click", (event) => {
  if (event.target.closest("#follow-worker")) { const person = world.colonists.find((candidate) => candidate.id === selected.colonistId); importantEvents.followWorker(world, person); }
  if (event.target.closest("#open-worker-tree")) progressionView.open(world, selected.colonistId);
});
$("#open-industries").addEventListener("click",()=>{if(world!==null){closeSettlement();industryView.open(world);}});
$("#open-settlement-tree").addEventListener("click", () => { if (world !== null) progressionView.open(world); });
const events = new EventSource("/api/events");
events.addEventListener("catalog", (event) => { catalog = JSON.parse(event.data); progressionView.setCatalog(catalog); importantEvents.setCatalog(catalog); industryView.setCatalog(catalog); });
events.addEventListener("resource-history", (event) => {
  for (const entry of JSON.parse(event.data)) histories.set(entry.colonyId, entry.samples);
  resourceHistory.replace(histories.get(activeColonyId));
});
events.addEventListener("resource-sample", (event) => {
  const { colonyId, sample } = JSON.parse(event.data);
  const samples = histories.get(colonyId);
  if (samples === undefined) return;
  if (samples.length > 0 && sample.tick <= samples.at(-1).tick) return;
  samples.push(sample);
  if (samples.length > 960) samples.shift();
  if (colonyId === activeColonyId) resourceHistory.replace(samples);
});
events.addEventListener("open", () => { $("#connection").textContent = "Live"; });
events.addEventListener("error", () => { $("#connection").textContent = "Reconnecting"; });
events.addEventListener("snapshot", (event) => {
  match = JSON.parse(event.data);
  world = { ...match.colonies.find((colony) => colony.id === activeColonyId), width: match.width, height: match.height, resources: match.resources };
  render();
});
events.addEventListener("world-event", (event) => {
  const entry = JSON.parse(event.data);
  recentEvents.unshift(entry);
  if (recentEvents.length > 100) recentEvents.pop();
  importantEvents.add(entry);
  renderEvents();
});

const closeInspector = () => {
  $("#inspector").hidden = true;
  selected.colonistId = null;
  view.select(null);
};
const closeSettlement = () => {
  $("#settlement-summary").hidden = true;
  $("#toggle-settlement").setAttribute("aria-expanded", "false");
};
$("#close-settlement").addEventListener("click", closeSettlement);
$("#toggle-settlement").addEventListener("click", () => {
  const opening = $("#settlement-summary").hidden;
  closeInspector(); closeJournal(); resourceHistory.close(); progressionView.close();
  $("#settlement-summary").hidden = !opening;
  $("#toggle-settlement").setAttribute("aria-expanded", String(opening));
});
const closeJournal = () => {
  $("#journal").hidden = true;
  $("#toggle-journal").setAttribute("aria-expanded", "false");
};
const toggleHud = () => {
  const hidden = $(".hud").classList.toggle("is-hidden");
  $("#toggle-hud").setAttribute("aria-pressed", String(hidden));
  $("#toggle-hud").innerHTML = `${hidden ? "Show" : "Hide"} HUD <kbd>H</kbd>`;
};
$("#close-inspector").addEventListener("click", closeInspector);
$("#close-journal").addEventListener("click", closeJournal);
$("#toggle-hud").addEventListener("click", toggleHud);
$("#toggle-journal").addEventListener("click", () => {
  const opening = $("#journal").hidden;
  $("#journal").hidden = !opening;
  $("#toggle-journal").setAttribute("aria-expanded", String(opening));
  if (opening) { closeInspector(); closeSettlement(); resourceHistory.close(); }
});
document.addEventListener("keydown", (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest("input, textarea, [contenteditable]")) return;
  if (event.key.toLowerCase() === "h") toggleHud();
  if (event.key === "Escape") {
    closeInspector();
    closeJournal();
    resourceHistory.close();
    progressionView.close();
    closeSettlement();
    importantEvents.close();
    industryView.close();
  }
});

const selectColony = (id, moveCamera = true) => {
  if (match === null) return;
  progressionView.close();
  closeSettlement();
  activeColonyId = id;
  world = { ...match.colonies.find((colony) => colony.id === id), width: match.width, height: match.height, resources: match.resources };
  closeInspector();
  resourceHistory.close();
  const samples = histories.get(id);
  if (samples !== undefined) resourceHistory.replace(samples);
  render();
  if (moveCamera) view.focus(world.camp);
};
for (const button of document.querySelectorAll("[data-colony]")) button.addEventListener("click", () => selectColony(button.dataset.colony));
