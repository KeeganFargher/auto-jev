import { hudIcon } from "./hud-icons.js";
const label = (text) => text.replaceAll("_", " ");

const setMetric = (key, value, description) => {
  const metric = document.querySelector(`[data-metric="${key}"]`);
  metric.querySelector("strong").textContent = value;
  metric.dataset.tooltipDetail = description;
  metric.setAttribute("aria-label", `${metric.dataset.tooltip}: ${value}. ${description}`);
};

/** Renders the settlement's current investment and compact, inspectable status counters. */
export function createSettlementView() {
  const metrics = [
    ["people", "Population"], ["settlement", "Housing"], ["food", "Fields"],
    ["weapons", "Defenses"], ["tools", "Workplaces"], ["research", "Technologies"],
  ];
  document.querySelector("#settlement-metrics").innerHTML = metrics.map(([icon, name]) => `<div class="settlement-metric" tabindex="0" data-metric="${icon}" data-tooltip="${name}" data-tooltip-detail=""><span>${hudIcon(icon)}</span><strong>—</strong><small>${name}</small></div>`).join("");
  return {
    update(world) {
      const living = world.colonists.filter((person) => person.health > 0);
      const development = world.development;
      const ripe = world.farms.filter((farm) => farm.stage === "ripe").length;
      const machines = world.structures.filter(b=>b.tier>0).map(b=>b.kind);
      document.querySelector("#commander-name").textContent = world.name;
      document.querySelector("#colony-stage").textContent = world.progression.stage;
      document.querySelector("#priority").textContent = world.priority;
      document.querySelector("#settlement-path").textContent = development.branch === null ? "No path chosen" : label(development.branch);
      setMetric("people", `${living.length}/${world.populationLimit}`, "Living colonists / settlement population limit. Research unlocks more capacity.");
      const beds=world.buildings.huts*4+world.structures.filter(b=>b.kind==="home").reduce((n,b)=>n+b.tier*4,0);
      setMetric("settlement", `${beds}`, `${Math.max(0, beds - living.length)} spare beds · ${development.homes} improved homes. Recruitment needs a spare bed.`);
      setMetric("food", world.farms.length, `${ripe} ready to harvest · ${world.farms.filter((farm) => farm.stage === "growing").length} growing`);
      setMetric("weapons", `${development.defenses}/3`, `${living.filter((person) => person.equipment.weapon > 0).length} armed workers · palisades protect against raids`);
      setMetric("tools", machines.length, machines.length === 0 ? "No workplaces built" : machines.map(label).join(" · "));
      setMetric("research", development.technologies.length, "Open the settlement tree for unlocks, costs and prerequisites.");
      const research = development.research;
      const project = world.project;
      const worker = living.find((person) => person.task !== null && /^(build_|upgrade_|expand_|recruit|commission_)/.test(person.task.action));
      let title = "No active construction";
      let detail = "Jev chooses the next investment";
      let progress = 0;
      let active = false;
      if (research !== null) {
        title = label(research.id);
        progress = research.workDone / research.totalWork * 100;
        detail = research.funded ? "Researching" : "Awaiting materials";
        active = true;
      } else if (project !== null) {
        title = "New farm";
        progress = project.workDone / project.totalWork * 100;
        detail = project.funded ? "Building" : "Awaiting materials";
        active = true;
      } else if (worker !== undefined) {
        title = label(worker.task.action);
        progress = (1 - worker.task.workRemaining / worker.task.totalWork) * 100;
        detail = worker.task.route.length > 0 ? `${worker.name} · travelling` : worker.name;
        active = true;
      }
      if(world.strategy.goal!==""){title=world.strategy.title;detail=world.strategy.status;}
      document.querySelector("#project-title").textContent = title;
      document.querySelector("#project-description").textContent = detail;
      document.querySelector("#project-progress").value = progress;
      document.querySelector("#project-progress").hidden = !active;
      document.querySelector("#project-percent").textContent = active ? `${Math.floor(progress)}%` : "";
      document.querySelector("#settlement-workshop").textContent = development.workshop ? "Ready" : "Not built";
      document.querySelector("#settlement-rival").textContent = world.intel === null ? "Unscouted" : `Last seen day ${Math.floor(world.intel.observedAt / 480) + 1} · ${world.intel.population} people · ${world.intel.defense}/3 defenses`;
      document.querySelector("#settlement-raids").textContent = `${world.raids.stolen} supplies gained · ${world.raids.lost} lost`;
    },
  };
}
