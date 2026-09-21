const label = (value) => value.replaceAll("_", " ");
const priorities = {
  food: ["food", "Secure food"], water: ["water", "Secure water"],
  shelter: ["settlement", "Build shelter"], materials: ["wood", "Gather materials"],
  recovery: ["people", "Recover"], research: ["research", "Develop technology"],
  expansion: ["map", "Expand"], security: ["weapons", "Strengthen defenses"],
};

/** Summarizes actual commitments; observations never pretend to be Jev's explanation. */
export function colonyIntent(colony, technologies) {
  const [icon, focus] = priorities[colony.priority];
  const living = colony.colonists.filter((person) => person.health > 0);
  const research = colony.development.research;
  const project = colony.project;
  const worker = living.find((person) => person.task !== null && /^(build_|upgrade_|expand_|recruit|commission_)/.test(person.task.action));
  const context = `${living.length} people · ${Math.floor(colony.stockpile.food)} food · ${Math.floor(colony.stockpile.water)} water`;
  const base = { id: `intent-${colony.id}`, colonyId: colony.id, icon, title: focus, detail: `Jev's chosen focus: ${focus.toLowerCase()}.`, context, position: colony.camp, personId: null, progress: null, tone: "notice", score: 10, evidence: "Chosen priority" };
  if(colony.strategy.goal!==""){
    const construction=colony.structures.find(b=>b.tier!==b.targetTier);
    const progress=research!==null?research.workDone/research.totalWork:construction!==undefined?construction.workDone/construction.totalWork:null;
    return {...base,title:colony.strategy.title,icon:"target",detail:`Jev committed ${colony.strategy.workers.length} workers to this objective. ${colony.strategy.status}.`,context:colony.strategy.status,position:construction===undefined?colony.stations.workshop:construction,progress,evidence:"Jev's settlement plan"};
  }
  if (research !== null) {
    const technology = technologies.find((item) => item.id === research.id);
    return { ...base, title: technology.name, icon: "research", detail: technology.effect, context: research.funded ? "Research underway" : "Committed · gathering materials", position: colony.stations.workshop, progress: research.workDone / research.totalWork, evidence: "Research commitment" };
  }
  if (project !== null) return { ...base, title: "Establish a new farm", icon: "food", detail: "Jev committed workers and materials to another field.", context: project.funded ? "Construction underway" : "Waiting for 24 wood and 8 stone", position: project, progress: project.workDone / project.totalWork, evidence: "Farm commitment" };
  if (worker !== undefined) return { ...base, title: label(worker.task.action), detail: `${worker.name} is carrying out this investment.`, context: worker.task.route.length > 0 ? "Travelling to the site" : "Work underway", position: worker, personId: worker.id, progress: 1 - worker.task.workRemaining / worker.task.totalWork, evidence: "Assigned work" };
  return base;
}

/** Finds watchable situations from current state, including activity across both colonies. */
export function developingStories(world, technologies) {
  const stories = [];
  for (const colony of world.colonies) {
    const living = colony.colonists.filter((person) => person.health > 0);
    const base = { colonyId: colony.id, personId: null, position: colony.camp, progress: null, evidence: "Live observation", tone: "notice" };
    const incident=colony.incident;
    if(incident!==null&&(!incident.resolved||colony.tick-incident.deadline<240)){
      stories.push({...base,id:incident.id,position:incident,icon:incident.kind==="drought"?"water":incident.kind==="raiders"?"weapons":incident.kind==="travellers"?"people":"tools",title:incident.title,detail:incident.resolved?incident.outcome:incident.choice===null?"The commander is considering a response. Ordinary work continues.":`Jev chose ${incident.choice}. ${incident.outcome || "The situation is unfolding."}`,context:incident.resolved?"Resolved":incident.choice===null?"Awaiting Jev":`${Math.max(0,Math.ceil((incident.deadline-colony.tick)/48)/10)} days remaining`,evidence:"World event",tone:incident.resolved?"good":"danger",score:incident.resolved?30:95});
    }
    if (colony.jev.status !== "running") stories.push({ ...base, id: `${colony.id}-paused`, icon: "warning", title: "Waiting for Jev", detail: "This colony is paused until its commander can respond.", context: colony.name, score: 5 });
    for (const person of living) {
      const subject = { ...base, personId: person.id, position: person };
      if (person.health < 35) stories.push({ ...subject, id: `${person.id}-danger`, icon: "warning", title: `${person.name} is in danger`, detail: `${Math.round(person.health)} health. Current action: ${person.task === null ? "awaiting a decision" : label(person.task.action)}.`, context: "Worker at risk", tone: "danger", score: 100 });
      if (person.task?.action === "raid") {
        const returning = person.task.cargo !== undefined;
        stories.push({ ...subject, id: `${person.id}-raid-${returning}`, icon: "weapons", title: returning ? `${person.name} is bringing loot home` : `${person.name} is on a raid`, detail: returning ? `Carrying ${person.task.cargo} stolen ${person.task.cargoKind ?? "food"}. It reaches storage only if they make it home.` : `Travelling toward the rival colony. ${person.equipment.weapon > 0 ? "Armed" : "Unarmed"} · ${Math.round(person.health)} health.`, context: returning ? "The return journey" : "Rival territory", tone: "danger", score: 90 });
      } else if (person.task?.action === "scout") stories.push({ ...subject, id: `${person.id}-scout`, icon: "map", title: `${person.name} is scouting`, detail: "Their commander will learn the rival's population, food stores, and defenses when this expedition succeeds.", context: "Intelligence expedition", score: 45 });
    }
    for (const key of ["food", "water"]) if (living.length > 0 && colony.stockpile[key] < living.length * 4) {
      stories.push({ ...base, id: `${colony.id}-${key}`, icon: key, title: `${colony.name} is short of ${key}`, detail: `${Math.floor(colony.stockpile[key])} units for ${living.length} people. Each ${key === "food" ? "meal" : "drink"} costs 4. Jev's current priority is ${colony.priority}.`, context: "Less than one round of supplies", tone: "danger", score: 70 });
    }
    const veteran = living.toSorted((left, right) => right.level - left.level || right.experience - left.experience)[0];
    if (veteran !== undefined) {
      const milestone = veteran.biography.at(-1);
      stories.push({ ...base, id: `${veteran.id}-spotlight`, personId: veteran.id, position: veteran, icon: "star", title: veteran.name, detail: milestone === undefined ? `Level ${veteran.level}. Watch their current work or inspect their skills.` : `Day ${Math.floor(milestone.tick / 480) + 1}: ${milestone.text}`, context: `Level ${veteran.level} · ${veteran.task === null ? "Choosing next task" : label(veteran.task.action)}`, evidence: "Worker spotlight", score: 15 });
    }
    const intent = colonyIntent(colony, technologies);
    if (intent.progress !== null) stories.push({ ...intent, id: `${colony.id}-investment-${intent.title}`, score: 35, context: intent.context });
  }
  return stories.toSorted((left, right) => right.score - left.score);
}
