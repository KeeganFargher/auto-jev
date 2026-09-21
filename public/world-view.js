import { createIndustryModel, createTerrain } from "./industry-models.js";
import { objectDetails } from "./object-details.js";
import { createResourceScene } from "./resource-scene.js";
import * as THREE from "three";
import { animateColonist, createActivityBubble, updateActivityBubble } from "./colonist-activity.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createDevelopmentModels, createStation, createCampfire, createColonist, createFarm, createHut } from "./world-models.js";

/** Creates the 3D presentation; all game decisions and positions remain server-owned. */
export function createWorldView(canvas, onSelect, tooltip, onInspect) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#b9d9db");
  const camera = new THREE.OrthographicCamera(-20, 20, 15, -15, 0.1, 1000);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch (error) {
    const message = document.querySelector("#scene-error");
    message.hidden = false;
    message.textContent = "The 3D view needs WebGL. Enable hardware acceleration or try another browser.";
    throw error;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minZoom = 0.18;
  controls.maxZoom = 3.5;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI / 2.4;
  controls.maxTargetRadius = Infinity;

  let tracking = null;
  /** Releases spectator tracking while retaining the current view. */
  const stopFollowing = () => { tracking = null; };
  const manualCamera = () => { stopFollowing(); canvas.dispatchEvent(new Event("camera-manual")); };
  const reset = () => {
    controls.reset();
    const centre = camp === null || dimensions === null ? new THREE.Vector3() : toPosition(camp);
    camera.position.copy(centre).add(new THREE.Vector3(25, 30, 32));
    camera.zoom = dimensions === null ? 1 : canvas.clientWidth <= 760 ? 2.1 : 1.25;
    controls.target.copy(centre);
    camera.updateProjectionMatrix();
    controls.update();
  };
  document.querySelector("#reset-view").addEventListener("click", () => { manualCamera(); reset(); });
  document.querySelector("#overview").addEventListener("click", () => {
    manualCamera();
    controls.target.set(0, 0, 0);
    camera.position.set(25, 30, 32);
    if (dimensions !== null) camera.zoom = Math.min(camera.right * 2 / ((dimensions.width + dimensions.height) * 0.8), camera.top * 2 / ((dimensions.width + dimensions.height) * 0.55)) * 0.9;
    camera.updateProjectionMatrix();
    controls.update();
  });
  scene.add(new THREE.HemisphereLight("#e5f5ff", "#8a8052", 2.4));
  const sun = new THREE.DirectionalLight("#fff0d1", 3.2);
  sun.position.set(-18, 36, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 100 });
  sun.shadow.normalBias = 0.045;
  scene.add(sun);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ color: "#91c5cd", roughness: 0.85 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1.85;
  sea.receiveShadow = true;
  scene.add(sea);

  const bubbles = document.createElement("div");
  bubbles.className = "activity-overlay";
  bubbles.setAttribute("aria-label", "Colonist activities");
  canvas.parentElement.append(bubbles);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let resourceScene = null;
  let snapshot = null;
  const people = new Map();
  const hutsByColony = new Map();
  const developmentByColony = new Map();
  const farms = new Map();
  const industries = new Map();
  let camp = null;
  let dimensions = null;
  let lastSnapshotTime = null;
  let lastArrival = null;
  let selectedId = null;
  let resetMotion = false;
  let simulationPaused = false;
  const toPosition = (person) => new THREE.Vector3(person.x + 0.5 - dimensions.width / 2, 0.025, person.y + 0.5 - dimensions.height / 2);
  reset();

  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    const aspect = width / height;
    const halfHeight = 22;
    const halfWidth = 30;
    camera.right = Math.max(halfWidth, halfHeight * aspect);
    camera.left = -camera.right;
    camera.top = camera.right / aspect;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  new ResizeObserver(resize).observe(canvas);

  const place = (object, position, inspection) => {
    if (inspection !== undefined) object.userData.inspection = inspection;
    object.position.copy(toPosition(position));
    scene.add(object);
  };

  /** Reconciles server snapshots and starts bounded, time-based linear movement. */
  function update(world) {
    snapshot = world;
    const now = performance.now();
    simulationPaused = world.colonies.every((colony) => colony.jev.status !== "running");
    const serverTime = Date.parse(world.updatedAt);
    if (dimensions === null) {
      dimensions = { width: world.width, height: world.height };
      camp = world.camp;
      scene.add(createTerrain(world.width, world.height, world.terrain));
      for (const colony of world.colonies) {
        place(createCampfire(), colony.camp, { colonyId: colony.id, kind: "camp" });
        place(createStation("food"), colony.stations.food, { colonyId: colony.id, kind: "food" });
        place(createStation("water"), colony.stations.water, { colonyId: colony.id, kind: "water" });
        const models = createDevelopmentModels(colony.color);
        place(models.workshop, colony.stations.workshop, { colonyId: colony.id, kind: "workshop" });
        for (const defense of models.defenses) place(defense, colony.stations.defense, { colonyId: colony.id, kind: "defense" });
        place(models.banner, colony.camp, { colonyId: colony.id, kind: "camp" });

        developmentByColony.set(colony.id, models);
        hutsByColony.set(colony.id, []);
      }
      resize();
      reset();
    }
    const elapsed = lastSnapshotTime === null ? 0 : serverTime - lastSnapshotTime;
    // Reconnects and hidden tabs resync immediately rather than flying across missed tiles.
    const resync = resetMotion || lastArrival === null || now - lastArrival > 2000 || elapsed > 2000 || elapsed < 0;
    const duration = THREE.MathUtils.clamp(elapsed, 50, 1000);
    resetMotion = false;
    lastSnapshotTime = serverTime;
    lastArrival = now;
    if (resourceScene === null) resourceScene = createResourceScene(scene, world.resources, toPosition);
    else resourceScene.update(world.resources);
    const living = new Set();
    const sharedResources = world.resources;
    for (const colony of world.colonies) {
      const colonyWorld = { ...colony, resources: sharedResources };
      const colonyCamp = colony.camp;
      const huts = hutsByColony.get(colony.id);
      const development = developmentByColony.get(colony.id);
      for(const building of colony.structures){
        let model=industries.get(building.id);
        const definition=world.buildingsCatalog.find(entry=>entry.id===building.kind);
        if(model===undefined||model.tier!==building.tier){
          if(model!==undefined)scene.remove(model.group);
          const group=createIndustryModel(building,definition,colony.color);
          place(group,building,{colonyId:colony.id,kind:"building",id:building.id});
          model={group,tier:building.tier};industries.set(building.id,model);
        }
        model.group.position.copy(toPosition(building));
        model.group.scale.y=building.tier===0?Math.max(.1,building.workDone/building.totalWork):1;
        model.group.userData.operating=building.status==="Operating"||building.status==="Automated";
      }
      const workshopBuilder = colony.colonists.find((person) => person.task?.action === "build_workshop");
      development.workshop.visible = colony.development.workshop || workshopBuilder !== undefined;
      development.workshop.scale.y = colony.development.workshop ? 1 : workshopBuilder === undefined ? 0.1 : Math.max(0.1, 1 - workshopBuilder.task.workRemaining / workshopBuilder.task.totalWork);
      development.defenses.forEach((model, index) => { model.visible = index < colony.development.defenses; });
      while (huts.length < colonyWorld.buildings.huts) {
        const index = huts.length;
        const hut = createHut();
        place(hut, { x: colonyCamp.x - 2 + index % 4, y: colonyCamp.y + 2 + Math.floor(index / 4) }, { colonyId: colony.id, kind: "hut", index });
        huts.push(hut);
      }
      huts.forEach((hut, index) => { hut.getObjectByName("home-improvement").visible = index < colony.development.homes; });
      for (const field of [...colonyWorld.farms, ...(colonyWorld.project === null ? [] : [colonyWorld.project])]) {
        if (!farms.has(field.id)) {
          const model = createFarm();
          farms.set(field.id, model);
          place(model.group, field, { colonyId: colony.id, kind: "farm", id: field.id });
        }
        const model = farms.get(field.id);
        model.group.scale.setScalar((field.radius * 2 + 1) / 3);
        const building = "workDone" in field;
        model.foundation.visible = !building || field.funded;
        model.frame.visible = !building || field.workDone / field.totalWork >= 0.35;
        model.frame.scale.y = building ? Math.max(0.1, field.workDone / field.totalWork) : 1;
        model.crops.visible = !building && field.stage === "growing";
        model.crops.scale.y = building ? 0.1 : Math.max(0.12, field.growth / 360);
        model.ripeCrops.visible = !building && field.stage === "ripe";
      }
      for (const [index, person] of colonyWorld.colonists.entries()) {
        if (person.health <= 0) continue;
        living.add(person.id);
        const target = toPosition(person);
        // Credit measures progress along the next server-planned tile. Rendering it avoids
        // idle frames between integer tile commits without predicting an unplanned route.
        if (person.task !== null && person.task.route.length > 0) {
          target.lerp(toPosition(person.task.route[0]), person.movementCredit);
        }
        if (!people.has(person.id)) {
          const model = createColonist(index, colony.color);
          place(model.group, person, { colonyId: colony.id, kind: "person", id: person.id });
          model.group.traverse((object) => { object.userData.colonistId = person.id; });
          const activity = createActivityBubble(person.name, () => onSelect(person.id));
          activity.bubble.style.borderColor = colony.color;
          bubbles.append(activity.bubble);
          people.set(person.id, { ...model, ...activity, from: target.clone(), target, start: now, duration, task: person.task, facing: null });
        }
        const model = people.get(person.id);
        model.task = person.task;
        model.weapon.visible = person.equipment.weapon > 0;
        model.paused = colony.jev.status !== "running";
        const resource = colonyWorld.resources.find((node) => node.id === person.task?.targetId);
        const farm = colonyWorld.farms.find((field) => field.id === person.task?.targetId);
        if (resource) model.facing = toPosition(resource);
        else if (farm) model.facing = toPosition(farm);
        else if (person.task?.action === "build_farm" && colonyWorld.project !== null) model.facing = toPosition(colonyWorld.project);
        else if (person.task?.action === "eat" || person.task?.action === "drink") model.facing = toPosition(colonyWorld.stations[person.task.action === "eat" ? "food" : "water"]);
        else if (person.task?.action === "build_hut") model.facing = toPosition({ x: colonyCamp.x - 2 + colonyWorld.buildings.huts % 4, y: colonyCamp.y + 2 + Math.floor(colonyWorld.buildings.huts / 4) });
        else if (["craft_planks", "build_workshop", "smelt_metal", "craft_tools", "craft_weapons", "equip_tool", "equip_weapon", "work_research"].includes(person.task?.action)) model.facing = toPosition(colonyWorld.stations.workshop);
        else if (["build_defense", "guard"].includes(person.task?.action)) model.facing = toPosition(colonyWorld.stations.defense);
        else if (["work_building", "construct_building"].includes(person.task?.action)) { const building=colony.structures.find(b=>b.id===person.task.targetId); if(building!==undefined)model.facing=toPosition(building); }
        else model.facing = null;
        // Large corrections are authoritative relocations, never high-speed walking animations.
        if (resync || model.group.position.distanceTo(target) > 4) model.group.position.copy(target);
        model.from.copy(model.group.position);
        model.target.copy(target);
        model.start = now;
        model.duration = duration;
        const dx = target.x - model.from.x;
        const dz = target.z - model.from.z;
        if (Math.hypot(dx, dz) > 0.01) model.group.rotation.y = Math.atan2(dx, dz);
      }
    }
    for (const [id, model] of people) {
      if (living.has(id)) continue;
      scene.remove(model.group);
      model.bubble.remove();
      people.delete(id);
    }
  }

  /** Highlights the selected colonist without changing simulation state. */
  function select(id) {
    selectedId = id;
    for (const [personId, model] of people) {
      model.ring.visible = personId === selectedId;
      model.bubble.classList.toggle("is-selected", personId === selectedId);
    }
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown = null;
  let hoverAt = null;
  let inspectedAt = 0;
  let hoverDirty = false;
  const inspectObject = (x, y) => {
    if (snapshot === null) return;
    const bounds = canvas.getBoundingClientRect();
    pointer.set((x - bounds.left) / bounds.width * 2 - 1, -(y - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(scene.children, true)) {
      let object = hit.object;
      let visible = true;
      let reference = hit.instanceId === undefined || object.userData.resourceIds === undefined ? null : { resourceId: object.userData.resourceIds[hit.instanceId] };
      while (object !== null) {
        visible = visible && object.visible;
        if (object.userData.inspection !== undefined) reference = object.userData.inspection;
        object = object.parent;
      }
      if (!visible || reference === null) continue;
      tooltip.show(...objectDetails(reference, snapshot), x, y);
      return reference;
    }
    tooltip.hide();
  };
  canvas.addEventListener("pointermove", (event) => {
    hoverAt = event.buttons === 0 ? { x: event.clientX, y: event.clientY } : null;
    hoverDirty = hoverAt !== null;
    if (hoverAt === null) tooltip.hide();
  });
  canvas.addEventListener("pointerleave", () => { hoverAt = null; tooltip.hide(); });
  controls.addEventListener("start", () => { manualCamera(); hoverAt = null; tooltip.hide(); });
  canvas.addEventListener("pointerdown", (event) => { pointerDown = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) return;
    pointerDown = null;
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...people.values()].map((model) => model.group), true)[0];
    if (hit) onSelect(hit.object.userData.colonistId);
    else {const reference=inspectObject(event.clientX,event.clientY);if(reference?.kind==="building")onInspect(reference);}
  });
  document.addEventListener("visibilitychange", () => { resetMotion = true; });
  const keys = new Set();
  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest("input, textarea, select, [contenteditable]")) return;
    if (["w", "a", "s", "d", "shift"].includes(event.key.toLowerCase()) && document.querySelector("#progression-panel").hidden) { keys.add(event.key.toLowerCase()); event.preventDefault(); }
  });
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), pan = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let frameAt = performance.now();
  const previousPosition = new THREE.Vector3();
  const head = new THREE.Vector3();
  renderer.setAnimationLoop((now) => {
    const delta = Math.min(0.05, (now - frameAt) / 1000); frameAt = now;
    if (dimensions !== null && document.querySelector("#progression-panel").hidden) {
      const x = Number(keys.has("d")) - Number(keys.has("a")), z = Number(keys.has("w")) - Number(keys.has("s"));
      if (x !== 0 || z !== 0) {
        manualCamera();
        forward.subVectors(controls.target, camera.position); forward.y = 0; forward.normalize();
        right.crossVectors(forward, up).normalize();
        pan.copy(forward).multiplyScalar(z).addScaledVector(right, x).normalize().multiplyScalar(delta * (keys.has("shift") ? 28 : 12) / Math.sqrt(camera.zoom));
        pan.x = THREE.MathUtils.clamp(controls.target.x + pan.x, -dimensions.width / 2, dimensions.width / 2) - controls.target.x;
        pan.z = THREE.MathUtils.clamp(controls.target.z + pan.z, -dimensions.height / 2, dimensions.height / 2) - controls.target.z;
        camera.position.add(pan); controls.target.add(pan);
      }
    }
    if (tracking !== null && dimensions !== null) {
      const model = tracking.personId === null ? undefined : people.get(tracking.personId);
      const destination = model === undefined ? toPosition(tracking.position) : model.group.position;
      pan.copy(destination).sub(controls.target).multiplyScalar(reducedMotion.matches ? 1 : 1 - Math.exp(-delta * 4));
      camera.position.add(pan); controls.target.add(pan);
    }
    controls.update();
    const paused = simulationPaused || lastArrival === null || now - lastArrival > 2000;
    for (const model of people.values()) {
      const progress = THREE.MathUtils.clamp((now - model.start) / model.duration, 0, 1);
      previousPosition.copy(model.group.position);
      model.group.position.lerpVectors(model.from, model.target, progress);
      const walking = progress < 1 && model.from.distanceToSquared(model.target) > 0.001;
      const working = !walking && !paused && !model.paused && model.task !== null && model.task.route.length === 0;
      if (working && model.facing !== null) {
        model.group.rotation.y = Math.atan2(model.facing.x - model.group.position.x, model.facing.z - model.group.position.z);
      }
      animateColonist(model, now, previousPosition.distanceTo(model.group.position), walking, working, reducedMotion.matches);
      updateActivityBubble(model, walking, paused || model.paused);
      head.copy(model.group.position);
      head.y += 1.3;
      head.project(camera);
      model.bubble.hidden = head.z < -1 || head.z > 1 || Math.abs(head.x) > 1 || Math.abs(head.y) > 1;
      const x = (head.x + 1) * canvas.clientWidth / 2;
      const y = (1 - head.y) * canvas.clientHeight / 2;
      model.bubble.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
    if(!reducedMotion.matches&&!simulationPaused)for(const model of industries.values()){
      const rotor=model.group.getObjectByName("industry-rotor");if(rotor!==undefined&&model.group.userData.operating)rotor.rotation.y+=delta*2;
    }
    renderer.render(scene, camera);
    // Pointer movement must respond on the next frame; stationary inspection still refreshes live state.
    if (hoverAt !== null && (hoverDirty || now - inspectedAt > 100)) {
      hoverDirty = false;
      inspectedAt = now;
      inspectObject(hoverAt.x, hoverAt.y);
    }
  });
  /** Centres the camera on the selected colony without changing the match. */
  function focus(position) { manualCamera(); camp = position; reset(); }
  /** Pans to a map position while preserving zoom and the selected home colony. */
  function panTo(position) {
    manualCamera();
    if (dimensions === null) return;
    const destination = toPosition(position);
    const shift = destination.clone().sub(controls.target);
    camera.position.add(shift); controls.target.copy(destination); controls.update();
  }
  /** Projects the screen corners onto the ground for the minimap camera outline. */
  function viewport() {
    if (dimensions === null) return [];
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const points = [];
    for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const hit = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
      if (hit !== null) points.push({ x: hit.x + dimensions.width / 2, y: hit.z + dimensions.height / 2 });
    }
    return points;
  }
  /** Follows a live person or location without changing the selected colony or simulation. */
  function follow(position, personId) {
    if (tracking === null) {
      camera.zoom = Math.max(camera.zoom, 1.25);
      camera.updateProjectionMatrix();
    }
    tracking = { position, personId };
  }
  return { update, select, focus, panTo, viewport, follow, stopFollowing };
}
