import * as THREE from "three";
import { createSettlement, createBiomeProp, setBannerColor } from "./province-models.js";
import { createArmyHost } from "./army-host.js";
import { createResource, createClaimDisc, part } from "./world-models.js";
import { hudIcon } from "./hud-icons.js";

/**
 * The campaign map. Bright, low-poly, one flat-shaded quad per tile, with the forests, crags and
 * marsh actually standing on it rather than painted as colour. Provinces are joined by roads so the
 * spectator can see which ways an army can go, and every settlement and army carries a label.
 */
const TILE = {
  g: { h: 0, c: "#b3c788" },
  f: { h: 0.3, c: "#82a772" },
  m: { h: 1.6, c: "#929e92" },
  s: { h: -0.12, c: "#d3c48f" },
  b: { h: 0.22, c: "#c8a46e" },
  w: { h: -1.1, c: "#75b9c5" },
  r: { h: -0.6, c: "#79bcc7" },
};
const SEA_LEVEL = -0.62;
const ROAD_COLOUR = "#c4a877";
const SETTLEMENT_SCALE = 2.3;
// Measured against the settlement models: a town is about 14 units across and 5.4 tall, so at this
// scale the Jev stands a little above the rooftops while the column keeps a smaller footprint.
const ARMY_SCALE = 2.2;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SCALE = 1;
/** Campaign tiles to world space, centred on the origin so the camera orbits the middle of the map. */
export const toWorld = (world, x, y) => new THREE.Vector3((x - world.width / 2) * SCALE, 0, (y - world.height / 2) * SCALE);
const hash = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };

/** Corner heights: tiles average into their corners so slopes are continuous, mountains get ridges. */
function buildHeights(world) {
  const { width, height, terrain } = world;
  const columns = width + 1;
  const corners = new Float32Array(columns * (height + 1));
  const tileHeight = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return TILE.w.h;
    return (TILE[terrain.tiles[y * width + x]] ?? TILE.g).h;
  };
  for (let y = 0; y <= height; y++) for (let x = 0; x <= width; x++) {
    let sum = 0, peaks = 0;
    for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const h = tileHeight(x + dx, y + dy); sum += h; if (h >= 1.5) peaks++; }
    let h = sum / 4;
    if (peaks === 4) h += 0.5 + (Math.sin(x * 0.9 + y * 0.4) + Math.cos(x * 0.35 - y * 0.8)) * 0.7 + hash(x, y) * 0.6;
    else if (peaks > 0) h += hash(x, y) * 0.3;
    else if (h > -0.4) h += (hash(x, y) - 0.5) * 0.1;
    corners[y * columns + x] = h;
  }
  return corners;
}

/** One flat-coloured quad per tile. Ownership only ever rewrites the colour buffer. */
function terrainMesh(world, corners) {
  const { width, height, terrain } = world;
  const columns = width + 1;
  const count = width * height * 6;
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const colour = new THREE.Color();
  const snow = new THREE.Color("#e6ebe4");
  const CORNERS = [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]];
  let cursor = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const key = terrain.tiles[y * width + x];
    const tile = TILE[key] ?? TILE.g;
    const h = hash(x * 3, y * 7);
    colour.set(tile.c).multiplyScalar(0.94 + h * 0.11);
    if (key === "f" && h > 0.55) colour.multiplyScalar(0.92);
    if (key === "m") {
      const top = (corners[y * columns + x] + corners[y * columns + x + 1] + corners[(y + 1) * columns + x] + corners[(y + 1) * columns + x + 1]) / 4;
      if (top > 2.4) colour.lerp(snow, Math.min(1, (top - 2.4) / 1.2));
    }
    for (const [dx, dy] of CORNERS) {
      const cx = x + dx, cy = y + dy;
      positions[cursor * 3] = cx - width / 2;
      positions[cursor * 3 + 1] = corners[cy * columns + cx];
      positions[cursor * 3 + 2] = cy - height / 2;
      base[cursor * 3] = colour.r; base[cursor * 3 + 1] = colour.g; base[cursor * 3 + 2] = colour.b;
      cursor++;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const colors = new Float32Array(base);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  mesh.receiveShadow = true;
  return { mesh, base, colors };
}

/** Tints each province toward its holder. Land only: water stays water whoever owns the shore. */
function paintOwnership(world, terrain) {
  const { width, height } = world;
  const tints = world.provinces.map((province) => {
    const faction = province.ownerId == null ? undefined : world.factions.find((entry) => entry.id === province.ownerId);
    return faction === undefined ? null : new THREE.Color(faction.color);
  });
  const { base, colors, mesh } = terrain;
  const colour = new THREE.Color();
  for (let tile = 0; tile < width * height; tile++) {
    const owner = tints[(world.ownership.charCodeAt(tile) || 65) - 65];
    const key = world.terrain.tiles[tile];
    const offset = tile * 18;
    if (owner == null || key === "w" || key === "r") { colors.set(base.subarray(offset, offset + 18), offset); continue; }
    colour.setRGB(base[offset], base[offset + 1], base[offset + 2]).lerp(owner, 0.2);
    for (let vertex = 0; vertex < 6; vertex++) { colors[offset + vertex * 3] = colour.r; colors[offset + vertex * 3 + 1] = colour.g; colors[offset + vertex * 3 + 2] = colour.b; }
  }
  mesh.geometry.attributes.color.needsUpdate = true;
}

/** Bakes a prototype group into one InstancedMesh per part, so a forest costs a handful of draws. */
function instantiate(root, prototype, placements) {
  if (placements.length === 0) return;
  prototype.updateMatrixWorld(true);
  const local = new THREE.Matrix4();
  prototype.traverse((node) => {
    if (!node.isMesh) return;
    const instanced = new THREE.InstancedMesh(node.geometry, node.material, placements.length);
    instanced.castShadow = node.castShadow;
    instanced.receiveShadow = true;
    placements.forEach((placement, index) => { local.multiplyMatrices(placement, node.matrixWorld); instanced.setMatrixAt(index, local); });
    instanced.instanceMatrix.needsUpdate = true;
    root.add(instanced);
  });
}

const PEAK = new THREE.ConeGeometry(1, 1, 5);

/** Builds and maintains the campaign map: terrain, scatter, roads, settlements and armies. */
export function createCampaignView(scene, world, overlayHost) {
  const root = new THREE.Group();
  scene.add(root);
  const overlay = document.createElement("div");
  overlay.className = "map-overlay";
  overlayHost.append(overlay);

  let corners = buildHeights(world);
  let columns = world.width + 1;
  /** Ground height at a fractional tile position, bilinear over the corner grid. */
  const heightAt = (x, y) => {
    const cx = Math.max(0, Math.min(world.width - 0.001, x)), cy = Math.max(0, Math.min(world.height - 0.001, y));
    const x0 = Math.floor(cx), y0 = Math.floor(cy), fx = cx - x0, fy = cy - y0;
    const h00 = corners[y0 * columns + x0], h10 = corners[y0 * columns + x0 + 1];
    const h01 = corners[(y0 + 1) * columns + x0], h11 = corners[(y0 + 1) * columns + x0 + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
  };
  const groundAt = (x, y) => { const point = toWorld(world, x, y); point.y = Math.max(SEA_LEVEL, heightAt(x, y)); return point; };

  let terrain = terrainMesh(world, corners);
  paintOwnership(world, terrain);
  root.add(terrain.mesh);

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(world.width * 5, world.height * 5), new THREE.MeshStandardMaterial({ color: "#8dc6d0", roughness: 0.85 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_LEVEL;
  sea.receiveShadow = true;
  root.add(sea);

  // --- roads: one ribbon per connected pair, so the graph the armies march on is visible.
  const statics = new THREE.Group();
  root.add(statics);
  const roadTiles = new Set();
  const buildRoads = (current) => {
    const positions = [];
    const seen = new Set();
    for (const province of current.provinces) for (const neighbourId of province.neighbours) {
      const other = current.provinces.find((entry) => entry.id === neighbourId);
      if (other === undefined) continue;
      const key = province.id < other.id ? `${province.id}|${other.id}` : `${other.id}|${province.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const length = Math.hypot(other.x - province.x, other.y - province.y);
      const steps = Math.max(4, Math.ceil(length / 1.4));
      const nx = -(other.y - province.y) / length, ny = (other.x - province.x) / length;
      const bend = (hash(province.x, other.y) - 0.5) * 9;
      const centres = [];
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const sway = Math.sin(t * Math.PI) * bend + Math.sin(t * 9 + province.x) * 0.5;
        const x = province.x + (other.x - province.x) * t + nx * sway, y = province.y + (other.y - province.y) * t + ny * sway;
        centres.push({ x, y });
        roadTiles.add(`${Math.round(x)},${Math.round(y)}`);
      }
      for (let step = 0; step < steps; step++) {
        const a = centres[step], b = centres[step + 1];
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const px = -dy / len * 0.55, py = dx / len * 0.55;
        const corner = (x, y) => [x - current.width / 2, Math.max(SEA_LEVEL + 0.02, heightAt(x, y)) + 0.07, y - current.height / 2];
        const a0 = corner(a.x - px, a.y - py), a1 = corner(a.x + px, a.y + py), b0 = corner(b.x - px, b.y - py), b1 = corner(b.x + px, b.y + py);
        positions.push(...a0, ...a1, ...b0, ...b0, ...a1, ...b1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: ROAD_COLOUR, roughness: 1, flatShading: true }));
    mesh.receiveShadow = true;
    statics.add(mesh);
  };
  buildRoads(world);

  // --- province borders, drawn once: which province a tile belongs to never changes.
  const buildBorders = (current) => {
    const { width, height, ownership } = current;
    const positions = [];
    const lift = (x, y) => Math.max(SEA_LEVEL, heightAt(x, y)) + 0.1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const here = ownership.charCodeAt(y * width + x);
      if (x + 1 < width && ownership.charCodeAt(y * width + x + 1) !== here) positions.push(x + 1 - width / 2, lift(x + 1, y), y - height / 2, x + 1 - width / 2, lift(x + 1, y + 1), y + 1 - height / 2);
      if (y + 1 < height && ownership.charCodeAt((y + 1) * width + x) !== here) positions.push(x - width / 2, lift(x, y + 1), y + 1 - height / 2, x + 1 - width / 2, lift(x + 1, y + 1), y + 1 - height / 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    statics.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: "#2b3a2c", transparent: true, opacity: 0.3 })));
  };
  buildBorders(world);

  // --- scatter: trees, crags, reeds and rocks, instanced per prototype.
  const buildScatter = (current) => {
    const { width, height, terrain: land, ownership, provinces } = current;
    const trees = Array.from({ length: 8 }, (_, index) => createResource("tree", index / 19));
    const props = Object.fromEntries(["grassland", "forest", "mountain", "marsh", "badlands"].map((biome) => [biome, Array.from({ length: 6 }, (_, index) => createBiomeProp(biome, index / 6 + 0.07))]));
    const peak = new THREE.Group();
    part(peak, PEAK, "#9aa39a", [0, 0.5, 0], [1, 1, 1]);
    part(peak, PEAK, "#e6ebe4", [0, 0.86, 0], [0.42, 0.34, 0.42]).castShadow = false;
    const buckets = new Map();
    const drop = (prototype, x, y, scale, spin) => {
      const list = buckets.get(prototype) ?? [];
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(x - width / 2, heightAt(x, y), y - height / 2),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin),
        new THREE.Vector3(scale, scale, scale),
      );
      list.push(matrix);
      buckets.set(prototype, list);
    };
    const near = (x, y) => provinces.some((province) => Math.hypot(province.x - x, province.y - y) < 5.5);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const key = land.tiles[y * width + x];
      if (key === "w" || key === "r") continue;
      const roll = hash(x, y), pickA = hash(y, x), pickB = hash(x + 7, y + 3);
      if (roll > 0.6) continue;
      if (roadTiles.has(`${x},${y}`) || near(x, y)) continue;
      const biome = provinces[(ownership.charCodeAt(y * width + x) || 65) - 65]?.biome ?? "grassland";
      const px = x + 0.15 + pickA * 0.7, py = y + 0.15 + pickB * 0.7;
      const spin = pickA * Math.PI * 2;
      const tree = trees[Math.floor(pickB * trees.length)];
      const prop = props[biome][Math.floor(pickA * 6)];
      if (key === "f") { if (roll < 0.46) drop(tree, px, py, 1.1 + pickA * 0.5, spin); else if (roll < 0.52) drop(prop, px, py, 1.5, spin); }
      else if (key === "g") { if (roll < 0.03) drop(tree, px, py, 1 + pickA * 0.4, spin); else if (roll < 0.075) drop(props.grassland[Math.floor(pickA * 6)], px, py, 1.6, spin); }
      else if (key === "m") { if (roll < 0.09) drop(peak, px, py, 1.8 + pickA * 2.4, spin); else if (roll < 0.2) drop(props.mountain[Math.floor(pickA * 6)], px, py, 2.2, spin); }
      else if (key === "s") { if (roll < 0.14) drop(props.marsh[Math.floor(pickA * 6)], px, py, 1.9, spin); else if (roll < 0.17) drop(trees[2], px, py, 0.9, spin); }
      else if (key === "b") { if (roll < 0.13) drop(props.badlands[Math.floor(pickA * 6)], px, py, 2, spin); }
    }
    for (const [prototype, placements] of buckets) instantiate(statics, prototype, placements);
  };
  buildScatter(world);

  // --- settlements, rebuilt only when their tier or buildings actually change.
  const settlements = new Map();
  const settlementKey = (province) => `${province.kind}:${province.settlement?.tier ?? 0}:${(province.settlement?.buildings ?? []).join(",")}`;
  const KIND_ICON = { capital: "settlement", town: "settlement", fort: "shield", mine: "tools", farm: "food", shrine: "essence", chokepoint: "flag", wilds: "skull" };
  const syncSettlements = (current) => {
    for (const province of current.provinces) {
      const key = settlementKey(province);
      const faction = current.factions.find((entry) => entry.id === province.ownerId);
      const colour = faction?.color ?? null;
      let existing = settlements.get(province.id);
      if (existing !== undefined && existing.key !== key) { root.remove(existing.model.group); existing = undefined; }
      if (existing === undefined) {
        const model = createSettlement(province.kind, province.settlement?.tier ?? 1, province.settlement?.buildings ?? [], colour, ((province.x * 7 + province.y * 3) % 17) / 17);
        model.group.position.copy(groundAt(province.x, province.y));
        model.group.scale.setScalar(SETTLEMENT_SCALE);
        root.add(model.group);
        const label = document.createElement("div");
        label.className = `map-label ${province.kind}`;
        label.innerHTML = `<i class="crest"></i>${hudIcon(KIND_ICON[province.kind] ?? "flag")}<span></span>`;
        overlay.append(label);
        const disc = createClaimDisc("#ffffff", 7);
        disc.position.copy(model.group.position);
        disc.position.y += 0.12;
        root.add(disc);
        existing = { key, model, owner: undefined, label, disc, anchor: model.group.position.clone().setY(model.group.position.y + 4.2) };
        settlements.set(province.id, existing);
      }
      if (existing.owner !== province.ownerId) {
        setBannerColor(existing.model.banner, colour);
        existing.owner = province.ownerId;
        existing.label.style.setProperty("--crest", colour ?? "#9aa39a");
        existing.label.classList.toggle("neutral", colour === null);
        existing.disc.visible = colour !== null;
        if (colour !== null) existing.disc.material.color.set(colour);
      }
      const name = existing.label.querySelector("span");
      const text = province.settlement === null ? province.name : `${province.name}${province.settlement.tier > 1 ? ` · ${"I".repeat(province.settlement.tier)}` : ""}`;
      if (name.textContent !== text) name.textContent = text;
      // Scaffolding on the label for as long as something is going up here.
      const project = province.settlement?.project ?? null;
      const works = `${project === null ? "" : project.turnsLeft}`;
      if (existing.works !== works) {
        existing.works = works;
        const node = existing.label.querySelector(".works");
        if (project === null) node?.remove();
        else if (node !== null && node !== undefined) node.lastChild.textContent = works;
        else {
          const made = document.createElement("i");
          made.className = "works";
          made.innerHTML = `${hudIcon("tools")}<span>${works}</span>`;
          existing.label.append(made);
        }
      }
      existing.label.classList.toggle("sieged", current.pendingBattle?.provinceId === province.id);
    }
  };
  syncSettlements(world);

  // --- armies: a marker that eases along the road, and a bubble saying what its Jev is doing.
  const armies = new Map();
  /**
   * A host standing dead centre of its province disappears into the settlement model, which is
   * about fourteen units across. Each army is nudged clear of it by a fixed amount derived from its
   * id, which also keeps two armies in one province off the same patch of ground.
   */
  const CAMP_OFFSET = 6.5;
  const campAt = (army) => {
    const angle = hash(army.id.length * 3.7, army.id.charCodeAt(army.id.length - 1)) * Math.PI * 2;
    const point = groundAt(army.x + Math.cos(angle) * CAMP_OFFSET, army.y + Math.sin(angle) * CAMP_OFFSET);
    point.y += 0.05;
    return point;
  };
  const STANCE_TAG = { fortify: "dug in", raid: "raiding", ambush: "in wait" };
  const ORDER_ICON = { hold: "🛡", move: "🚩", attack: "⚔", besiege: "🏰", retreat: "🏳", reinforce: "➕", scout: "👁" };
  const syncArmies = (current, catalog) => {
    const seen = new Set();
    // Carries a rebuilt host's position and march across the swap, so a Jev never teleports.
    let resume;
    for (const army of current.armies) {
      seen.add(army.id);
      const faction = current.factions.find((entry) => entry.id === army.factionId);
      const lord = faction?.lords.find((entry) => entry.id === army.lordId);
      const hero = catalog.heroes?.find((entry) => entry.id === lord?.heroId);
      const strength = Math.min(1, army.units.length / 12);
      const unitIds = army.units.map((card) => card.unitId);
      // The host is rebuilt only when who or what is marching actually changes.
      const shape = `${lord?.heroId ?? "none"}:${unitIds.join(",")}`;
      let entry = armies.get(army.id);
      if (entry !== undefined && entry.shape !== shape) {
        root.remove(entry.group); entry.bubble.remove();
        const carried = { target: entry.target, heading: entry.heading, march: entry.march, position: entry.group.position.clone() };
        entry = undefined;
        armies.delete(army.id);
        resume = carried;
      }
      if (entry === undefined) {
        const host = createArmyHost(faction?.color ?? "#999999", hero, unitIds, strength);
        const group = host.group;
        group.scale.multiplyScalar(ARMY_SCALE);
        group.position.copy(resume?.position ?? campAt(army));
        root.add(group);
        const bubble = document.createElement("div");
        bubble.className = "map-bubble";
        bubble.style.setProperty("--crest", faction?.color ?? "#999");
        bubble.innerHTML = `<span class="icon"></span><strong></strong><span class="what"></span><i class="hp"><b></b></i>`;
        overlay.append(bubble);
        entry = {
          group, host, shape, bubble,
          headroom: host.headroom * ARMY_SCALE,
          target: resume?.target ?? group.position.clone(),
          heading: resume?.heading ?? 0,
          march: resume?.march,
        };
        armies.set(army.id, entry);
        resume = undefined;
      }
      if (entry.march === undefined) entry.target = campAt(army);
      const icon = entry.bubble.querySelector(".icon"), who = entry.bubble.querySelector("strong"), what = entry.bubble.querySelector(".what");
      const kind = army.shattered ? "retreat" : army.order.kind;
      if (icon.textContent !== ORDER_ICON[kind]) icon.textContent = ORDER_ICON[kind] ?? "🚩";
      const name = hero?.name ?? lord?.heroId ?? army.name;
      if (who.textContent !== name) who.textContent = name;
      const doing = army.shattered ? "Falling back" : army.order.label;
      if (what.textContent !== doing) what.textContent = doing;
      // A host that is dug in or stripping the country says so on its own bubble.
      const stance = army.shattered ? "" : STANCE_TAG[army.stance] ?? "";
      if (entry.stance !== stance) {
        entry.stance = stance;
        const node = entry.bubble.querySelector(".stance");
        if (stance === "") node?.remove();
        else if (node !== null && node !== undefined) node.textContent = stance;
        else { const made = document.createElement("span"); made.className = "stance"; made.textContent = stance; entry.bubble.querySelector("strong").after(made); }
      }
      entry.bubble.classList.toggle("danger", army.shattered || army.morale < 35);
      const models = army.units.reduce((sum, card) => sum + card.models, 0), full = army.units.reduce((sum, card) => sum + card.maxModels, 0);
      entry.bubble.querySelector(".hp b").style.width = `${full === 0 ? 0 : Math.round(models / full * 100)}%`;
      entry.lordId = army.lordId;
    }
    for (const [id, entry] of armies) if (!seen.has(id)) { root.remove(entry.group); entry.bubble.remove(); armies.delete(id); }
  };
  syncArmies(world, { heroes: [] });

  let latest = world;
  const point = new THREE.Vector3();
  const project = (anchor, camera, width, height) => {
    point.copy(anchor).project(camera);
    if (point.z > 1 || Math.abs(point.x) > 1.1 || Math.abs(point.y) > 1.1) return null;
    return { x: (point.x * 0.5 + 0.5) * width, y: (-point.y * 0.5 + 0.5) * height };
  };
  return {
    root,
    groundAt,
    /** World position of an army marker right now (mid-march), for the camera to follow. */
    armyPosition(armyId) { return armies.get(armyId)?.group.position ?? null; },
    /** Walks an army along the points the server says it passed through, over the time it allows. */
    marchArmy(armyId, path, ms) {
      const entry = armies.get(armyId);
      if (entry === undefined || path.length < 2) return;
      const points = path.map((point) => { const at = groundAt(point.x, point.y); at.y += 0.05; return at; });
      const lengths = [0];
      for (let index = 1; index < points.length; index++) lengths.push(lengths[index - 1] + points[index].distanceTo(points[index - 1]));
      entry.march = { points, lengths, start: performance.now(), ms: Math.max(300, ms) };
      entry.target = points[points.length - 1].clone();
    },
    /** Swaps in a new campaign snapshot, rebuilding only what changed. */
    update(current, catalog = { heroes: [] }) {
      if (current.seed !== latest.seed || current.number !== latest.number) {
        root.remove(terrain.mesh);
        terrain.mesh.geometry.dispose();
        corners = buildHeights(current);
        columns = current.width + 1;
        terrain = terrainMesh(current, corners);
        root.add(terrain.mesh);
        statics.clear();
        roadTiles.clear();
        buildRoads(current); buildBorders(current); buildScatter(current);
        for (const { model, label, disc } of settlements.values()) { root.remove(model.group); root.remove(disc); label.remove(); }
        settlements.clear();
        for (const entry of armies.values()) { root.remove(entry.group); entry.bubble.remove(); }
        armies.clear();
      }
      paintOwnership(current, terrain);
      latest = current;
      syncSettlements(current);
      syncArmies(current, catalog);
    },
    /** Eases army markers along and pins every label to its subject on screen. */
    animate(delta, camera, width, height) {
      const now = performance.now();
      for (const entry of armies.values()) {
        const before = entry.group.position.clone();
        if (entry.march !== undefined) {
          const { points, lengths, start, ms } = entry.march;
          const progress = Math.min(1, (now - start) / ms);
          const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          const along = eased * lengths[lengths.length - 1];
          let segment = 1;
          while (segment < lengths.length - 1 && lengths[segment] < along) segment++;
          const span = lengths[segment] - lengths[segment - 1] || 1;
          entry.group.position.lerpVectors(points[segment - 1], points[segment], Math.max(0, Math.min(1, (along - lengths[segment - 1]) / span)));
          if (progress >= 1) entry.march = undefined;
        } else entry.group.position.lerp(entry.target, Math.min(1, delta * 2.2));
        const dx = entry.group.position.x - before.x, dz = entry.group.position.z - before.z;
        if (Math.hypot(dx, dz) > 0.002) entry.heading = Math.atan2(dx, dz);
        entry.group.rotation.y += (entry.heading - entry.group.rotation.y) * Math.min(1, delta * 4);
        entry.host.animate(now, Math.hypot(dx, dz), reducedMotion);
        const screen = project(point.copy(entry.group.position).setY(entry.group.position.y + entry.headroom), camera, width, height);
        entry.bubble.hidden = screen === null;
        if (screen !== null) entry.bubble.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -100%)`;
      }
      for (const entry of settlements.values()) {
        const screen = project(entry.anchor, camera, width, height);
        entry.label.hidden = screen === null;
        if (screen !== null) entry.label.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -100%)`;
      }
    },
    setVisible(visible) { root.visible = visible; overlay.hidden = !visible; },
    dispose() { scene.remove(root); terrain.mesh.geometry.dispose(); overlay.remove(); },
  };
}
