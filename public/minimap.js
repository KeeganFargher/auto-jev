/** A north-up overview: terrain, who holds what, every army, and the camera's footprint. */
export function createMinimap(view) {
  const canvas = document.querySelector("#minimap");
  const legend = document.querySelector("#minimap-legend");
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Minimap requires a 2D canvas context");
  const TERRAIN = { g: "#98b070", f: "#5f8a5a", w: "#639ba8", m: "#a5aaa0", s: "#c5b489", b: "#b28a5c", r: "#6fa6b3" };
  let world = null;
  let base = null;
  const move = (event) => {
    if (world === null) return;
    const bounds = canvas.getBoundingClientRect();
    view.panTo({
      x: Math.max(0, Math.min(world.width - 1, (event.clientX - bounds.left) / bounds.width * world.width)),
      y: Math.max(0, Math.min(world.height - 1, (event.clientY - bounds.top) / bounds.height * world.height)),
    });
  };
  canvas.addEventListener("pointerdown", (event) => { move(event); canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener("pointermove", (event) => { if (event.buttons === 1) move(event); });

  /** Terrain and ownership change rarely, so they are painted to an offscreen layer once per snapshot. */
  const paintBase = () => {
    base = document.createElement("canvas");
    base.width = canvas.width; base.height = canvas.height;
    const layer = base.getContext("2d");
    const sx = canvas.width / world.width, sy = canvas.height / world.height;
    layer.fillStyle = "#4f8f9c"; layer.fillRect(0, 0, base.width, base.height);
    const tints = world.provinces.map((province) => world.factions.find((faction) => faction.id === province.ownerId)?.color ?? null);
    for (let y = 0; y < world.height; y += 2) for (let x = 0; x < world.width; x += 2) {
      const tile = world.terrain.tiles[y * world.width + x];
      layer.fillStyle = TERRAIN[tile] ?? TERRAIN.g;
      layer.fillRect(x * sx, y * sy, 2 * sx + 0.5, 2 * sy + 0.5);
      const owner = tints[(world.ownership.charCodeAt(y * world.width + x) || 65) - 65];
      if (owner !== null && tile !== "w" && tile !== "r") { layer.globalAlpha = 0.34; layer.fillStyle = owner; layer.fillRect(x * sx, y * sy, 2 * sx + 0.5, 2 * sy + 0.5); layer.globalAlpha = 1; }
    }
    for (const province of world.provinces) {
      if (province.settlement === null) continue;
      const x = province.x * sx, y = province.y * sy, size = province.kind === "capital" ? 7 : 4;
      layer.fillStyle = tints[world.provinces.indexOf(province)] ?? "#ded9c8";
      layer.fillRect(x - size / 2, y - size / 2, size, size);
      layer.strokeStyle = "#0d1a14aa"; layer.lineWidth = 1; layer.strokeRect(x - size / 2, y - size / 2, size, size);
    }
  };
  const paint = (force = false) => {
    if (world === null || base === null || (document.hidden && !force)) return;
    const sx = canvas.width / world.width, sy = canvas.height / world.height;
    context.drawImage(base, 0, 0);
    for (const army of world.armies) {
      const faction = world.factions.find((entry) => entry.id === army.factionId);
      const live = view.armyPosition(army.id) ?? { x: army.x, y: army.y };
      context.beginPath(); context.arc(live.x * sx, live.y * sy, 3, 0, Math.PI * 2);
      context.fillStyle = faction?.color ?? "#fff"; context.fill();
      context.strokeStyle = "#fff3d2"; context.lineWidth = 1; context.stroke();
    }
    const footprint = view.viewport();
    if (footprint.length === 4) {
      context.beginPath();
      footprint.forEach((point, index) => { if (index === 0) context.moveTo(point.x * sx, point.y * sy); else context.lineTo(point.x * sx, point.y * sy); });
      context.closePath(); context.fillStyle = "#fff2cd14"; context.fill(); context.strokeStyle = "#fff2cdcc"; context.lineWidth = 1.5; context.stroke();
    }
  };
  setInterval(() => paint(), 120);
  return {
    update(value) {
      world = value;
      paintBase();
      legend.innerHTML = world.factions.map((faction) => `<span style="--crest:${faction.color}">${faction.name}</span>`).join("");
      paint(true);
    },
  };
}
