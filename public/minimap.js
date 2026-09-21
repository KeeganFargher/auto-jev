/** Draws a north-up overview with live people, camps and the camera footprint. */
export function createMinimap(view) {
  const canvas = document.querySelector("#minimap");
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Minimap requires a 2D canvas context");
  let world = null;
  let centre = null;
  const move = (position) => { centre = position; view.panTo(position); };
  canvas.addEventListener("pointerdown", (event) => {
    if (world === null) return;
    const bounds = canvas.getBoundingClientRect();
    move({ x: Math.max(0, Math.min(world.width - 1, (event.clientX - bounds.left) / bounds.width * world.width)), y: Math.max(0, Math.min(world.height - 1, (event.clientY - bounds.top) / bounds.height * world.height)) });
  });
  canvas.addEventListener("keydown", (event) => {
    if (world === null) return;
    if (event.key === "Enter") { event.preventDefault(); view.focus(world.camp); return; }
    const directions = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] };
    const direction = directions[event.key];
    if (direction === undefined || centre === null) return;
    event.preventDefault();
    move({ x: Math.max(0, Math.min(world.width - 1, centre.x + direction[0])), y: Math.max(0, Math.min(world.height - 1, centre.y + direction[1])) });
  });
  const paint = () => {
    if (world === null || document.hidden) return;
    const sx = canvas.width / world.width, sy = canvas.height / world.height;
    context.fillStyle = "#263f36"; context.fillRect(0, 0, canvas.width, canvas.height);
    const colors={g:"#809668",f:"#496d51",w:"#639ba8",m:"#a5aaa0",s:"#c5b489",r:"#b29468"};
    for(let y=0;y<world.height;y+=2)for(let x=0;x<world.width;x+=2){context.fillStyle=colors[world.terrain.tiles[y*world.width+x]];context.fillRect(x*sx,y*sy,2*sx,2*sy);}
    for (const node of world.resources) {
      if (node.amount <= 0) continue;
      context.fillStyle = { river: "#79adb8", tree: "#527254", berries: "#758657", stone: "#929686", ore: "#c59465", clay:"#c3a180", coal: "#a8a9aa" }[node.kind];
      context.fillRect(node.x * sx, node.y * sy, Math.max(2, sx), Math.max(2, sy));
    }
    for (const colony of world.colonies) {
      context.fillStyle = colony.color;
      for (const person of colony.colonists) {
        if (person.health > 0) { context.beginPath(); context.arc((person.x + 0.5) * sx, (person.y + 0.5) * sy, 1.8, 0, Math.PI * 2); context.fill(); }
      }
      for(const building of colony.structures)context.fillRect(building.x*sx,building.y*sy,3,3);
      const x = (colony.camp.x + 0.5) * sx, y = (colony.camp.y + 0.5) * sy;
      context.fillRect(x - 4, y - 4, 8, 8);
      context.strokeStyle = colony.id === world.id ? "#fff3d2" : colony.color; context.lineWidth = 1.5; context.strokeRect(x - 7, y - 7, 14, 14);
    }
    const footprint = view.viewport();
    if (footprint.length === 4) {
      centre = { x: footprint.reduce((sum, point) => sum + point.x, 0) / 4, y: footprint.reduce((sum, point) => sum + point.y, 0) / 4 };
      context.beginPath();
      footprint.forEach((point, index) => { if (index === 0) context.moveTo(point.x * sx, point.y * sy); else context.lineTo(point.x * sx, point.y * sy); });
      context.closePath(); context.fillStyle = "#fff2cd12"; context.fill(); context.strokeStyle = "#fff2cdbb"; context.lineWidth = 1.5; context.stroke();
    }
  };
  // Camera movement is local; redraw independently from server snapshots at a modest cadence.
  setInterval(paint, 100);
  return { update(value) { world = value; paint(); } };
}
