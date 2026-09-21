import { hudIcon } from "./hud-icons.js";
const icons={Food:"food",Water:"water",Forestry:"wood",Materials:"stone",Industry:"tools",Civic:"settlement",Frontier:"weapons"};

/** Presents the industrial catalogue and one live building without exposing simulation controls. */
export function createIndustryView(onLocate){
  const panel=document.querySelector("#industry-panel"),grid=document.querySelector("#industry-grid"),detail=document.querySelector("#industry-detail");
  let catalog=[],world=null,selected=null,selectedBuildingId=null,category="All",signature="";
  const render=()=>{
    if(world===null||catalog.length===0||panel.hidden)return;
    const next=JSON.stringify([world.id,world.development.technologies,world.structures.map(b=>[b.id,b.tier,b.status]),category,selected]);
    if(signature!==next){
      signature=next;grid.replaceChildren();
      for(const definition of catalog.filter(d=>category==="All"||d.category===category)){
        const building=world.structures.find(b=>b.kind===definition.id);
        const known=definition.technology===null||world.development.technologies.includes(definition.technology);
        const button=document.createElement("button");button.type="button";button.className=`tree-node ${building===undefined?known?"is-available":"is-locked":"is-learned"}`;
        button.innerHTML=`<span class="node-icon">${hudIcon(icons[definition.category])}</span><strong></strong><small></small>`;
        button.querySelector("strong").textContent=definition.name;
        button.querySelector("small").textContent=building===undefined?known?"Available":"Locked":building.tier===0?"Building":`Tier ${building.tier}`;
        button.setAttribute("aria-pressed",String(selected===definition.id));
        button.addEventListener("click",()=>{selected=definition.id;selectedBuildingId=null;render();});grid.append(button);
      }
    }
    const definition=catalog.find(d=>d.id===selected);
    if(definition===undefined){detail.textContent="Choose a building to see its role, staffing and upgrades.";return;}
    const building=selectedBuildingId===null?world.structures.find(b=>b.kind===definition.id):world.structures.find(b=>b.id===selectedBuildingId);
    const description=document.createElement("div");
    const heading=document.createElement("h3");heading.textContent=definition.name;description.append(heading);
    const effect=document.createElement("p");effect.textContent=definition.effect;description.append(effect);
    const status=document.createElement("p");status.className="building-state";status.textContent=building===undefined?definition.technology===null?"Available from the start":`Requires ${definition.technology.replaceAll("_"," ")}`:`Tier ${building.tier} · ${building.status}`;description.append(status);
    const recipe=document.createElement("div");recipe.className="building-recipe";
    for(const [title,stock]of [[building===undefined?"Construction":"Inputs",building===undefined?definition.cost:definition.input],["Outputs / base cycle",definition.output]]){
      const row=document.createElement("p");row.textContent=`${title}: `;
      for(const [key,amount]of Object.entries(stock)){const chip=document.createElement("span");chip.className="tree-stat";chip.innerHTML=`${hudIcon(key)}<b>${amount}</b>`;chip.dataset.tooltip=key;row.append(chip);}
      if(Object.keys(stock).length===0)row.append("None · see building effect");recipe.append(row);
    }
    description.append(recipe);
    if(building!==undefined){
      if(building.kind==="home"){const residents=document.createElement("p");residents.textContent=`${building.residents.length}/${building.tier*4} beds · ${building.residents.map(id=>world.colonists.find(p=>p.id===id).name).join(", ")}`;description.append(residents);}
      const staff=document.createElement("p");staff.textContent=building.staff.length===0?"No operator assigned":`Assigned: ${building.staff.map(id=>world.colonists.find(p=>p.id===id).name).join(", ")}`;description.append(staff);
      const stats=document.createElement("p");stats.textContent=`${building.cycles} completed cycles · ${Math.round(building.condition)}% condition`;description.append(stats);
      if(building.targetTier!==building.tier){const progress=document.createElement("progress");progress.max=building.totalWork;progress.value=building.workDone;progress.setAttribute("aria-label","Construction progress");description.append(progress);}
      const locate=document.createElement("button");locate.type="button";locate.className="tree-open";locate.textContent="Locate building ↗";locate.addEventListener("click",()=>onLocate(building));description.append(locate);
      if(building.tier<3){const upgrade=document.createElement("p");upgrade.textContent=building.tier<2?"Next: tier II · Town charter, 24 planks, 20 bricks, 8 metal. More output/capacity; sawmills and pumps become automated.":"Next: tier III · Regional capital, 32 bricks, 16 steel, 8 parts. Further output/capacity; production needs maintenance parts.";description.append(upgrade);}
    }
    // Preserve focus during live updates by replacing only when displayed content changed.
    if(detail.innerHTML!==description.innerHTML)detail.replaceChildren(...description.childNodes);
  };
  document.querySelector("#close-industry").addEventListener("click",()=>{panel.hidden=true;});
  for(const name of ["All",...Object.keys(icons)]){const button=document.createElement("button");button.type="button";button.textContent=name;button.setAttribute("aria-pressed",String(name===category));button.addEventListener("click",()=>{category=name;for(const other of button.parentElement.children)other.setAttribute("aria-pressed",String(other===button));render();});document.querySelector("#industry-filters").append(button);}
  return {setCatalog(value){catalog=value.buildings;},update(value){world=value;render();},close(){panel.hidden=true;},open(value,buildingId=null){world=value;const building=value.structures.find(b=>b.id===buildingId);selected=building===undefined?null:building.kind;selectedBuildingId=buildingId;panel.hidden=false;render();}};
}
