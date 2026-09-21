import { hudIcon } from "./hud-icons.js";
import { colonyIntent, developingStories } from "./spectator-state.js";

const moments = {
  "strategy.completed": ["star","Plan completed","good"],
  "strategy.chosen": ["target","A new ambition","notice"],
  "incident.response": ["warning","Jev responded","notice"],
  "colonist.died": ["warning", "Worker lost", "danger"],
  "colonist.arrived": ["people", "New arrival", "good"],
  "research.completed": ["research", "Research complete", "good"],
  "development.chosen": ["star", "A new investment", "good"],
  "raid.returning": ["weapons", "Raid returning", "danger"],
  "raid.repulsed": ["weapons", "Raid repulsed", "danger"],
  "raid.retreat": ["weapons", "Narrow escape", "danger"],
  "raid.delivered": ["weapons", "Loot brought home", "good"],
  "rival.scouted": ["map", "Rival discovered", "notice"],
  "project.completed": ["settlement", "Construction complete", "good"],
};

/** Presents observed stories and opt-in camera direction without making simulation decisions. */
export function createImportantEvents(view, onInspect) {
  const rail = document.querySelector("#important-events");
  const intentions = document.querySelector("#colony-intentions");
  const panel = document.querySelector("#event-detail");
  const directorButton = document.querySelector("#toggle-director");
  const cameraBadge = document.querySelector("#camera-subject");
  const railContainer = document.querySelector(".spectator-rail");
  const collapseButton = document.querySelector("#toggle-stories");
  const collapse = (compact) => {
    railContainer.classList.toggle("is-compact", compact);
    collapseButton.setAttribute("aria-expanded", String(!compact));
    collapseButton.setAttribute("aria-label", compact ? "Expand stories" : "Collapse stories");
    collapseButton.dataset.tooltip = compact ? "Expand stories" : "Collapse stories";
  };
  collapse(window.matchMedia("(max-width: 760px)").matches);
  collapseButton.addEventListener("click", () => collapse(!railContainer.classList.contains("is-compact")));
  let world = null;
  let technologies = [];
  let entries = [];
  let history = [];
  let selected = null;
  let mode = "free";
  let pinned = null;
  let shot = null;
  let shotAt = 0;
  const watched = new Map();
  const cards = new Map();
  const intentCards = new Map();
  const close = () => { panel.hidden = true; selected = null; };
  const colonyFor = (entry) => world.colonies.find((colony) => colony.id === entry.colonyId);
  const setMode = (value) => {
    mode = value;
    directorButton.setAttribute("aria-pressed", String(mode === "director"));
    directorButton.dataset.tooltipDetail = mode === "director" ? "Following live stories. Drag, scroll or use WASD to take control." : "Follow important moments automatically. Manual camera movement always takes control.";
    cameraBadge.hidden = mode === "free";
    if (mode === "free") { pinned = null; shot = null; view.stopFollowing(); }
  };
  const follow = (entry) => {
    shot = entry;
    view.follow(entry.position, entry.personId);
    document.querySelector("#camera-label").textContent = `${mode === "director" ? "Watching" : "Following"} · ${entry.title}`;
  };
  const show = (entry) => {
    selected = entry;
    panel.hidden = false;
    const colony = colonyFor(entry);
    document.querySelector("#event-colony").textContent = `${colony.name} · ${entry.evidence}`;
    document.querySelector("#event-title").textContent = entry.title;
    document.querySelector("#event-message").textContent = entry.detail;
    document.querySelector("#event-context").textContent = entry.context;
    const progress = document.querySelector("#event-progress");
    progress.hidden = entry.progress === null;
    if (entry.progress !== null) progress.value = entry.progress * 100;
    const person = entry.personId === null ? null : colony.colonists.find((candidate) => candidate.id === entry.personId);
    const chronicle = document.querySelector("#event-history");
    chronicle.replaceChildren();
    const records = person === null || person === undefined ? colony.development.history : person.biography;
    for (const record of records.slice(-3).toReversed()) {
      const item = document.createElement("li");
      item.textContent = `Day ${Math.floor(record.tick / 480) + 1} · ${record.text}`;
      chronicle.append(item);
    }
    document.querySelector("#event-chronicle").hidden = records.length === 0;
    document.querySelector("#event-follow").textContent = person !== null && person !== undefined ? "Follow worker" : "Follow colony";
    document.querySelector("#event-follow").disabled = person !== null && person !== undefined && person.health <= 0;
  };
  const drawCard = (entry, collection, compact) => {
    let button = collection.get(entry.id);
    if (button === undefined) {
      button = document.createElement("button"); button.type = "button";
      button.innerHTML = '<span class="story-icon"></span><span class="story-copy"><small></small><strong></strong><span class="story-context"></span></span><progress max="100"></progress>';
      button.addEventListener("click", () => {
        const current = compact ? colonyIntent(colonyFor(entry), technologies) : entries.find((candidate) => candidate.id === entry.id);
        if (current !== undefined) show(current);
      });
      collection.set(entry.id, button);
    }
    button.className = `${compact ? "intention-card" : "story-card"} hud-surface ${entry.tone}`;
    button.style.setProperty("--colony-color", colonyFor(entry).color);
    const icon = button.querySelector(".story-icon");
    if (icon.dataset.icon !== entry.icon) { icon.innerHTML = hudIcon(entry.icon); icon.dataset.icon = entry.icon; }
    button.querySelector("small").textContent = compact ? `${colonyFor(entry).name} · ${entry.evidence === "Chosen priority" ? "Focus" : "Investment"}` : `${colonyFor(entry).name} · ${entry.evidence === "Recent event" ? "Just happened" : entry.evidence === "Worker spotlight" ? "Spotlight" : "Developing"}`;
    button.querySelector("strong").textContent = entry.title;
    button.querySelector(".story-context").textContent = entry.context;
    button.dataset.tooltip = entry.title;
    button.dataset.tooltipDetail = `${entry.context}. Click for the story and location.`;
    button.setAttribute("aria-label", `${colonyFor(entry).name}: ${entry.title}. ${entry.context}`);
    const progress = button.querySelector("progress");
    progress.hidden = entry.progress === null;
    if (entry.progress !== null) progress.value = entry.progress * 100;
    return button;
  };
  const reconcile = (items, collection, parent, compact) => {
    const ids = new Set(items.map((entry) => entry.id));
    for (const [id, button] of collection) if (!ids.has(id)) { button.remove(); collection.delete(id); }
    items.forEach((entry, index) => {
      const button = drawCard(entry, collection, compact);
      if (parent.children[index] !== button) parent.insertBefore(button, parent.children[index] ?? null);
    });
  };
  const direct = (stories) => {
    if (mode === "free" || document.hidden) return;
    if (mode === "pinned") {
      const colony = world.colonies.find((candidate) => candidate.id === pinned.colonyId);
      if (pinned.personId === null) { follow({ ...colonyIntent(colony, technologies), title: colony.name }); return; }
      const person = colony.colonists.find((candidate) => candidate.id === pinned.personId);
      if (person === undefined || person.health <= 0) { setMode("free"); return; }
      follow({ ...pinned, title: person.name, position: person });
      return;
    }
    const now = performance.now();
    const current = shot === null ? undefined : stories.find((entry) => entry.id === shot.id);
    // Hold a shot long enough to understand it, including when another alert arrives.
    if (current !== undefined && now - shotAt < 14000) { follow(current); return; }
    const candidate = stories.find((entry) => !watched.has(entry.id) || now - watched.get(entry.id) > 45000);
    if (candidate !== undefined) {
      shotAt = now; watched.set(candidate.id, now); follow(candidate);
      for (const [id, at] of watched) if (now - at > 60000) watched.delete(id);
    } else if (current !== undefined) follow(current);
    else {
      const colony = world.colonies[0];
      follow({ ...colonyIntent(colony, technologies), title: "Colony life" });
    }
  };
  const render = () => {
    if (world === null || technologies.length === 0) return;
    const stories = developingStories(world, technologies);
    history = history.filter((entry) => colonyFor(entry).tick - entry.tick < 480);
    entries = [...stories.filter((entry) => entry.score > 15), ...history, ...stories.filter((entry) => entry.score <= 15)].slice(0, 3);
    reconcile(world.colonies.map((colony) => colonyIntent(colony, technologies)), intentCards, intentions, true);
    reconcile(entries, cards, rail, false);
    document.querySelector("#stories-quiet").hidden = entries.length > 0;
    if (selected !== null) {
      const current = selected.id.startsWith("intent-") ? colonyIntent(colonyFor(selected), technologies) : [...stories, ...history].find((entry) => entry.id === selected.id);
      if (current !== undefined) show(current);
      else {
        document.querySelector("#event-context").textContent = "This moment has ended. Details describe the last observation.";
        const person = colonyFor(selected).colonists.find((candidate) => candidate.id === selected.personId);
        document.querySelector("#event-follow").disabled = person !== undefined && person.health <= 0;
      }
    }
    direct(stories.filter((entry) => !entry.id.endsWith("-paused")));
  };
  document.querySelector("#close-event").addEventListener("click", close);
  document.querySelector("#event-locate").addEventListener("click", () => {
    if (selected === null) return;
    setMode("free"); view.panTo(selected.position); close();
  });
  document.querySelector("#event-inspect").addEventListener("click", () => { if (selected !== null) { onInspect(selected.colonyId, selected.personId); close(); } });
  document.querySelector("#event-follow").addEventListener("click", () => {
    if (selected === null) return;
    pinned = { ...selected }; setMode("pinned"); direct([]); close();
  });
  directorButton.addEventListener("click", () => { setMode(mode === "director" ? "free" : "director"); shotAt = 0; watched.clear(); render(); });
  document.querySelector("#stop-following").addEventListener("click", () => setMode("free"));
  document.querySelector("#world").addEventListener("camera-manual", () => setMode("free"));
  return {
    close,
    setCatalog(catalog) { technologies = catalog.technologies; },
    update(value) { world = value; render(); },
    followWorker(colony, person) { pinned = { colonyId: colony.id, personId: person.id }; setMode("pinned"); direct([]); },
    add(event) {
      const kind = moments[event.type];
      if (world === null || kind === undefined) return;
      const colony = world.colonies.find((candidate) => event.message.startsWith(`[${candidate.name}]`));
      if (colony === undefined) return;
      const person = colony.colonists.find((candidate) => candidate.id === event.colonistId);
      const id = `${colony.id}-${event.type}`;
      history = [{ id, colonyId: colony.id, icon: kind[0], title: kind[1], tone: kind[2], detail: event.message, context: `Day ${colony.day}`, personId: person === undefined ? null : person.id, position: person === undefined ? colony.camp : person, progress: null, tick: colony.tick, evidence: "Recent event" }, ...history.filter((entry) => entry.id !== id)].slice(0, 8);
      render();
    },
  };
}
