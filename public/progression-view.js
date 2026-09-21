import { hudIcon } from "./hud-icons.js";

const $ = (selector) => document.querySelector(selector);
const branchIcons = { Gathering: "wood", Craft: "tools", Farming: "food", Movement: "map", Survival: "water", Warrior: "weapons", Care: "people", Civic: "settlement", Agriculture: "food", Industry: "tools", Frontier: "weapons" };
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
// Snapshot updates must not replace focused prerequisite controls on every tick.
function updateDetail(markup) {
  const detail = $("#tree-detail");
  if (detail.dataset.markup === markup) return;
  const focused = detail.contains(document.activeElement) ? document.activeElement.dataset.requirement : undefined;
  detail.dataset.markup = markup;
  detail.innerHTML = markup;
  if (focused !== undefined) detail.querySelector(`[data-requirement="${focused}"]`)?.focus();
}
const titleCase = (value) => value[0].toUpperCase() + value.slice(1);
const chip = (icon, value, label) => `<span class="tree-stat" data-tooltip="${escapeHtml(label)}">${hudIcon(icon)}<b>${value}</b></span>`;

/** Renders inspectable progression nodes; all investments remain Jev's decisions. */
export function createProgressionView() {
  let catalog = null;
  let world = null;
  let personId = null;
  let mode = "settlement";
  let selected = null;
  let branch = "All";
  let fingerprint = "";
  let opener = null;
  const panel = $("#progression-panel");
  const close = () => { panel.hidden = true; if (opener?.isConnected) opener.focus(); };
  const render = () => {
    if (catalog === null || world === null || panel.hidden) return;
    const person = personId === null ? null : world.colonists.find((candidate) => candidate.id === personId);
    if (mode === "worker" && !person) { close(); return; }
    const worker = mode === "worker";
    const definitions = worker ? catalog.skills : catalog.technologies;
    const known = world.development.technologies;
    const project = world.development.research;
    const learned = (id) => worker ? person.talents[id] > 0 : known.includes(id);
    const status = (node) => {
      if (worker ? person.talents[node.id] === node.maxRank : learned(node.id)) return "Mastered";
      if (!worker && project?.id === node.id) return "Researching";
      if (node.requires.every(learned) && (worker ? person.level >= node.level && person.skillPoints > 0 : world.development.workshop && world.development.completedWork >= 20 && project === null)) return "Available";
      return learned(node.id) ? "Learned" : "Locked";
    };
    $("#tree-title").textContent = worker ? `${person.name} · Skills` : `${world.name} · Settlement`;
    $("#tree-subtitle").textContent = "Jev chooses the upgrades · Select a node to explore";
    $("#tree-project").innerHTML = worker
      ? `${chip("star", `${person.level}/${catalog.maxLevel}`, "Worker level")}${chip("research", person.skillPoints, "Unspent skill points")}${chip("tools", person.equipment.tool, "Tool uses remaining")}${chip("weapons", person.equipment.weapon, "Weapon encounters remaining")}<span class="tree-xp">${person.level === catalog.maxLevel ? "Maximum level" : `${person.experience} / ${catalog.levelCosts[person.level - 1]} XP`}</span>`
      : `${chip("settlement", titleCase(world.progression.stage), "Settlement stage")}${chip("research", `${known.length}/${definitions.length}`, "Technologies learned")}<span class="tree-xp">${project === null ? "No active research" : `${catalog.technologies.find((node) => node.id === project.id).name} · ${project.funded ? `${Math.floor(project.workDone / project.totalWork * 100)}%` : "Awaiting materials"}`}</span>`;
    const signature = JSON.stringify([world.id, mode, personId, person?.level, person?.talents, person?.skillPoints, world.development.workshop, world.development.completedWork >= 20, known, project?.id, branch]);
    if (signature !== fingerprint) {
      fingerprint = signature;
      const branches = [...new Set(definitions.map((node) => node.branch))];
      $("#tree-filters").innerHTML = ["All", ...branches].map((name) => `<button type="button" data-branch="${name}" aria-pressed="${branch === name}">${name === "All" ? hudIcon("research") : hudIcon(branchIcons[name])}${name}</button>`).join("");
      $("#tree-branches").innerHTML = branches.filter((name) => branch === "All" || name === branch).map((name) => `<section class="tree-branch"><h3>${name}<span>${definitions.filter((node) => node.branch === name && learned(node.id)).length}/${definitions.filter((node) => node.branch === name).length}</span></h3><div class="tree-nodes">${definitions.filter((node) => node.branch === name).map((node) => {
        const state = status(node);
        return `<button type="button" class="tree-node is-${state.toLowerCase()}" data-node="${node.id}" aria-pressed="${selected === node.id}" aria-label="${escapeHtml(node.name)}, ${state}${worker ? `, rank ${person.talents[node.id]} of ${node.maxRank}` : ""}" data-tooltip="${escapeHtml(node.name)}" data-tooltip-detail="${escapeHtml(node.effect)}"><span class="node-icon">${hudIcon(branchIcons[name])}<i>${state === "Mastered" ? "✓" : state === "Researching" ? "◷" : state === "Available" ? "+" : state === "Learned" ? "•" : "◇"}</i></span><strong>${node.name}</strong>${worker ? `<span class="node-ranks" aria-hidden="true">${Array.from({ length: node.maxRank }, (_, rank) => `<i class="${rank < person.talents[node.id] ? "filled" : ""}"></i>`).join("")}</span>` : `<small>${state}</small>`}</button>`;
      }).join("")}</div></section>`).join("");
    }
    for (const button of $("#tree-branches").querySelectorAll("[data-node]")) button.setAttribute("aria-pressed", String(button.dataset.node === selected));
    const node = definitions.find((definition) => definition.id === selected);
    updateDetail(node === undefined ? `<div class="tree-empty">${hudIcon("research")}<strong>Choose an upgrade</strong><p>Explore its benefits and what it takes to unlock.</p></div>` : `<div class="detail-heading">${hudIcon(branchIcons[node.branch])}<span>${node.branch} · ${status(node)}</span></div><h3>${node.name}</h3><p>${node.effect}</p><div class="detail-costs">${worker ? `${chip("star", `${person.talents[node.id]}/${node.maxRank}`, "Current rank")}${chip("research", 1, "Skill point per rank")}` : Object.entries(node.cost).map(([key, amount]) => `<span class="tree-stat ${world.stockpile[key] < amount && !learned(node.id) ? "is-short" : ""}" data-tooltip="${key}" data-tooltip-detail="${world.stockpile[key]} in storage · ${amount} required">${hudIcon(key)}<b>${amount}</b></span>`).join("")}</div><p class="detail-requirement">${worker ? `Requires level ${node.level}` : `${node.work} research work`}</p><h4>Prerequisites</h4><div class="detail-prerequisites">${node.requires.length ? node.requires.map((id) => `<button type="button" data-requirement="${id}">${learned(id) ? "✓" : "◇"} ${definitions.find((item) => item.id === id).name} ↗</button>`).join("") : "Starting node"}</div>${!worker && (!world.development.workshop || world.development.completedWork < 20) ? "<p class=\"detail-requirement\">Research needs a workshop and 20 completed jobs.</p>" : ""}`);
    const history = worker ? person.biography : world.development.history;
    const historySignature = JSON.stringify(history);
    if ($("#tree-history").dataset.signature !== historySignature) {
      $("#tree-history").dataset.signature = historySignature;
      $("#tree-history").innerHTML = history.length === 0 ? "<li>No milestones yet.</li>" : history.toReversed().map((entry) => `<li><time>Day ${(entry.tick / 480 + 1).toFixed(1)}</time>${escapeHtml(entry.text)}</li>`).join("");
    }
  };
  $("#close-progression").addEventListener("click", close);
  panel.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } });
  panel.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-branch]");
    const button = event.target.closest("[data-node], [data-requirement]");
    if (filter) { branch = filter.dataset.branch; render(); $("#tree-filters").querySelector(`[data-branch="${branch}"]`).focus(); }
    if (!button) return;
    selected = button.hasAttribute("data-node") ? button.dataset.node : button.dataset.requirement;
    if (button.hasAttribute("data-requirement")) branch = "All";
    render();
    $("#tree-detail").scrollIntoView({ block: "nearest" });
    if (button.hasAttribute("data-requirement")) $("#tree-branches").querySelector(`[data-node="${selected}"]`).focus();
  });
  return {
    close,
    setCatalog(value) { catalog = value; },
    update(value) { world = value; render(); },
    open(colony, workerId = null) {
      opener = document.activeElement;
      world = colony; personId = workerId; mode = workerId === null ? "settlement" : "worker";
      fingerprint = ""; selected = null; branch = "All"; panel.hidden = false;
      $(".tree-chronicle").open = false;
      render(); $("#close-progression").focus();
    },
    levelCost(level) { return catalog.levelCosts[level - 1]; },
  };
}
