import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createCampaignView } from "./campaign-view.js";
import { createBattleView } from "./battle-view.js";
import { createBattleHud } from "./battle-hud.js";
import { createMinimap } from "./minimap.js";
import { createTooltip } from "./tooltips.js";
import { createFaceOff } from "./faceoff.js";
import { useIconSprites } from "./hud-icons.js";
import { useUnitPortraits, useVignettes, useJevPortraits, useCrests, useScenes } from "./card-art.js";
import {
  clearDecisions, currentDecision, initIcons, renderFactionPanel, renderIntentions, renderJournal,
  clearAftermath, clearAnnouncement, clearTurnCard, renderForecast, renderStories, renderTop, setCameraLabel,
  showAftermath, showAnnouncement, showBanner,
  showBattle, showDecision, showEventDetail, showTurnCard,
} from "./hud.js";
import { developingStories } from "./spectator-state.js";

const $ = (selector) => document.querySelector(selector);
initIcons();
createTooltip();
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const stage = $("#stage");
const renderer = new THREE.WebGLRenderer({ antialias: !reduced, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
stage.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#b9d9db");
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 1200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.46;
controls.minDistance = 14;
controls.maxDistance = 420;

const sun = new THREE.DirectionalLight("#fff0d1", 3);
sun.position.set(-70, 130, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
sun.shadow.camera.far = 420;
sun.shadow.normalBias = 0.05;
scene.add(sun, new THREE.HemisphereLight("#e5f5ff", "#8a8052", 2.2));

// ---------------------------------------------------------------- state
let world = null;
let catalog = { heroes: [], units: [], buildings: [] };
/**
 * Shorter than the server's own turn beat, so the card has finished leaving by the time the
 * faction's first decision arrives and the two never share the screen.
 */
const TURN_CARD_MS = 1200;
let campaign = null;
let battle = null;
let battleHud = null;
let battleFrame = null;
let stories = [];
let activeFactionId = null;
const events = [];
const minimap = createMinimap({
  panTo(position) { setMode("free"); goal.target.copy(groundAt(position.x, position.y)); goal.distance = Math.min(goal.distance, 110); },
  viewport,
  armyPosition(armyId) {
    const live = campaign?.armyPosition(armyId);
    return live == null || world === null ? null : { x: live.x + world.width / 2, y: live.z + world.height / 2 };
  },
});

/**
 * The camera has one goal at a time: a point or a live army, a distance and a pitch. The director
 * moves the goal; the spectator can take over by dragging, and hand it back with the Director button.
 */
const goal = { target: new THREE.Vector3(), distance: 200, pitch: 0.8, armyId: null, lordFighter: false };
let mode = "director";
let pinned = null;
const shot = { id: null, at: 0, label: null };
const watched = new Map();
let cut = null;
/** The turn as it plays out: whose turn it is, which army is on the road, and the face-off before a fight. */
let stageFocus = null;
/** The latest forecast per army, newest wins; entries are dropped once their turn has come. */
const forecasts = new Map();
let marching = null;
let faceoff = null;
let savedPose = null;
const groundAt = (x, y) => campaign?.groundAt(x, y) ?? new THREE.Vector3(x - (world?.width ?? 0) / 2, 0, y - (world?.height ?? 0) / 2);

function setMode(next) {
  mode = next;
  $("#toggle-director").setAttribute("aria-pressed", String(mode === "director"));
  if (mode === "free") { pinned = null; goal.armyId = null; shot.id = null; setCameraLabel(null); }
  if (mode === "director") { shot.id = null; shot.at = 0; }
}
controls.addEventListener("start", () => setMode("free"));

function pointAt(story) {
  if (story.position == null) return null;
  return groundAt(story.position.x, story.position.y);
}
function aim(target, armyId, distance, label) {
  if (target !== null) goal.target.copy(target);
  goal.armyId = armyId ?? null;
  goal.distance = distance;
  setCameraLabel(label);
}

/**
 * How long the director stays with a subject before anything of merely equal standing is allowed to
 * take the camera away. The chain used to be re-evaluated every frame and cut the instant a
 * higher-priority branch became true, so the shot changed constantly and nothing was on screen long
 * enough to read. Now a subject has to be beaten, not merely arrive.
 */
const MIN_SHOT_MS = 3200;
/** The subject the camera has committed to: what it is, how much it is worth, and since when. */
let shotHold = null;

/** Director Mode on the campaign map: every subject worth watching bids, and the best one wins the camera. */
function direct(now) {
  if (world === null || battle !== null) return;
  if (mode === "pinned" && pinned !== null) {
    const army = world.armies.find((entry) => entry.id === pinned.armyId);
    if (army === undefined) { setMode("director"); return; }
    const faction = world.factions.find((entry) => entry.id === army.factionId);
    const lord = faction?.lords.find((entry) => entry.id === army.lordId);
    aim(null, army.id, 52, `Following · ${catalog.heroes.find((hero) => hero.id === lord?.heroId)?.name ?? army.name} · ${army.order.label}`);
    return;
  }
  if (mode !== "director") return;
  const heroName = (army) => {
    const faction = world.factions.find((entry) => entry.id === army?.factionId);
    const lord = faction?.lords.find((entry) => entry.id === army?.lordId);
    return catalog.heroes.find((hero) => hero.id === lord?.heroId)?.name ?? army?.name ?? "the host";
  };
  const speed = Math.max(0.25, world.speed ?? 1);
  // Everything that could hold the camera right now, each carrying what it is worth on the same
  // 0..100 scale the simulation scores its own events with.
  const bids = [];

  const decision = currentDecision();
  if (decision !== null && (decision.decision.armyId !== null || decision.decision.provinceId !== null)) {
    const army = world.armies.find((entry) => entry.id === decision.decision.armyId);
    const province = world.provinces.find((entry) => entry.id === (army?.provinceId ?? decision.decision.provinceId));
    if (army !== undefined || province !== undefined) {
      bids.push({
        key: `decision:${decision.decision.id}`, worth: decision.decision.importance ?? 55,
        target: army === undefined && province !== undefined ? groundAt(province.x, province.y) : null,
        armyId: army?.id ?? null, distance: 58,
        label: `Watching · ${army === undefined ? decision.faction.name : heroName(army)} is deciding`,
      });
    }
  }
  if (cut !== null && now - cut.at > cut.hold / speed) cut = null;
  if (cut !== null) bids.push({ key: cut.id, worth: cut.worth, target: cut.position, armyId: cut.armyId, distance: 70, label: `Watching · ${cut.text}` });
  if (marching !== null && now < marching.until) {
    const army = world.armies.find((entry) => entry.id === marching.armyId);
    if (army !== undefined) bids.push({ key: `march:${marching.armyId}`, worth: 40, target: null, armyId: army.id, distance: 62, label: `Watching · ${marching.text}` });
  }
  if (stageFocus !== null) {
    const army = world.armies.find((entry) => entry.factionId === stageFocus.factionId);
    const faction = world.factions.find((entry) => entry.id === stageFocus.factionId);
    if (army !== undefined) bids.push({ key: `stage:${stageFocus.factionId}`, worth: 30, target: null, armyId: army.id, distance: 70, label: `${faction?.name ?? "A faction"}'s turn · ${heroName(army)}` });
  }
  const current = stories.find((story) => story.id === shot.id);
  let next = current !== undefined && now - shot.at < 12000 ? current : undefined;
  if (next === undefined) {
    next = stories.find((story) => !watched.has(story.id) || now - watched.get(story.id) > 45000) ?? stories[0];
    if (next !== undefined) { shot.id = next.id; shot.at = now; watched.set(next.id, now); }
    for (const [id, at] of watched) if (now - at > 90000) watched.delete(id);
    renderStories(stories, world, shot.id, openStory);
  }
  if (next !== undefined) bids.push({ key: `story:${next.id}`, worth: 20, target: pointAt(next), armyId: next.armyId ?? null, distance: next.armyId ? 56 : 80, label: `Watching · ${next.title}` });

  if (bids.length === 0) { shotHold = null; aim(new THREE.Vector3(), null, 260, null); return; }
  let pick = bids.reduce((best, bid) => (bid.worth > best.worth ? bid : best));
  // The commitment: a subject that has not had its minimum time keeps the camera unless it is
  // genuinely outbid. Equal standing is not enough — that is what made the shot thrash.
  if (shotHold !== null && shotHold.key !== pick.key && now - shotHold.at < MIN_SHOT_MS && pick.worth <= shotHold.worth) {
    pick = bids.find((bid) => bid.key === shotHold.key) ?? pick;
  }
  if (shotHold === null || shotHold.key !== pick.key) shotHold = { key: pick.key, worth: pick.worth, at: now };
  aim(pick.target, pick.armyId, pick.distance, pick.label);
}

/** Something just happened worth looking at; the director bids for the camera on its behalf. */
function noticeEvent(event) {
  if (world === null || event.importance < 70) return;
  const province = world.provinces
    .filter((entry) => event.text.includes(entry.name))
    .sort((left, right) => right.name.length - left.name.length)[0];
  const army = event.type === "lord" || event.type === "destroyed" ? world.armies.find((entry) => entry.factionId === event.factionId) : undefined;
  if (province === undefined && army === undefined) return;
  // The cut lasts as long as the server is holding the turn for it, so the camera and the campaign
  // agree about how big a moment this was instead of each guessing separately.
  cut = {
    id: `event:${event.turn}:${event.text}`, at: performance.now(), text: event.text, worth: event.importance,
    hold: Math.max(2500, event.hold ?? 4000),
    position: province === undefined ? null : groundAt(province.x, province.y), armyId: army?.id ?? null,
  };
}

// ---------------------------------------------------------------- scenes
function enterCampaign() {
  clearAftermath();
  if (battle !== null) { battle.dispose(); battle = null; battleFrame = null; }
  if (battleHud !== null) { battleHud.dispose(); battleHud = null; }
  showBattle(null, world);
  if (world === null) return;
  if (campaign === null) campaign = createCampaignView(scene, world, stage);
  campaign.update(world, catalog);
  campaign.setVisible(true);
  shot.id = null;
}
/** The two commanders face each other while the Jev decides whether to fight. */
function startFaceOff(faction, decision) {
  if (world === null || campaign === null) return;
  endFaceOff(false);
  const army = world.armies.find((entry) => entry.id === decision.armyId);
  const province = world.provinces.find((entry) => entry.id === decision.provinceId);
  if (army === undefined || province === undefined) return;
  const defenderArmy = world.armies.find((entry) => entry.provinceId === province.id && entry.factionId !== faction.id);
  const defenderFaction = world.factions.find((entry) => entry.id === (defenderArmy?.factionId ?? province.ownerId));
  const side = (own, host, garrison) => {
    const lord = own?.lords.find((entry) => entry.id === host?.lordId);
    const hero = catalog.heroes.find((entry) => entry.id === lord?.heroId);
    const soldiers = (host?.units ?? garrison ?? []).reduce((sum, card) => sum + card.models, 0);
    return {
      hero, colour: own?.color ?? "#9aa39a",
      name: hero?.name ?? (own?.name ?? `${province.name} garrison`),
      faction: hero === undefined ? "Garrison" : own?.name ?? "Neutral",
      tags: host === undefined
        ? [`${soldiers} defenders`, "No Jev"]
        : [`${soldiers} soldiers`, `${host.units.length} units`, `Level ${lord?.level ?? 1}`],
    };
  };
  const fight = decision.options.find((option) => option.id === "fight");
  const share = Number(fight?.tags?.[0]?.match(/(\d+)%/)?.[1] ?? 50) / 100;
  const estimate = fight?.tags?.[1] ?? "even";
  const attacker = { ...side(faction, army), share, estimate };
  const defender = side(defenderFaction, defenderArmy, province.garrison);
  savedPose = { position: camera.position.clone(), target: controls.target.clone() };
  faceoff = createFaceOff(scene, stage, attacker, defender, province.biome);
  camera.position.copy(faceoff.pose.position);
  controls.target.copy(faceoff.pose.target);
  $("#hud").classList.add("is-faceoff");
  setCameraLabel(`${attacker.name} faces ${defender.name} at ${province.name}`);
}
function endFaceOff(restore) {
  if (faceoff === null) return;
  faceoff.dispose();
  faceoff = null;
  $("#hud").classList.remove("is-faceoff");
  if (restore && savedPose !== null) { camera.position.copy(savedPose.position); controls.target.copy(savedPose.target); }
  savedPose = null;
}
function enterBattle(frame) {
  if (world === null) return;
  endFaceOff(false);
  clearDecisions();
  clearTurnCard();
  clearAnnouncement();
  if (campaign !== null) campaign.setVisible(false);
  if (battle !== null) battle.dispose();
  if (battleHud !== null) battleHud.dispose();
  battle = createBattleView(scene, frame, world.factions, catalog.heroes ?? [], catalog.abilities ?? {});
  battleHud = createBattleHud(document.body, camera, battle.toWorld, catalog.heroes ?? [], catalog.abilities ?? {});
  battleFrame = frame;
  battleShot.at = 0; battleShot.lord = false;
  goal.armyId = null;
  controls.target.set(0, 0, 0);
  camera.position.set(0, 60, 40);
  goal.target.set(0, 0, 0); goal.distance = 62;
  if (mode !== "free") setCameraLabel(`Watching · ${frame.siege ? "Siege of" : "Battle of"} ${world.provinces.find((entry) => entry.id === frame.provinceId)?.name ?? "the field"}`);
}
/** In a battle the camera alternates between the whole fight and a Jev in the thick of it. */
const battleShot = { at: 0, lord: false };
function directBattle(now) {
  if (battle === null || battleFrame === null || mode === "free") return;
  if (now - battleShot.at > 9000) { battleShot.at = now; battleShot.lord = !battleShot.lord; }
  const lord = battleShot.lord ? battle.lordPosition(battleFrame) : null;
  if (lord !== null) {
    goal.target.lerp(lord.position, 0.2);
    goal.distance = 30;
    setCameraLabel(`Watching · ${catalog.heroes.find((hero) => hero.id === lord.heroId)?.name ?? "the Jev"} in the fight`);
    return;
  }
  const box = battle.bounds(battleFrame);
  goal.target.set(box.x, 0, box.z);
  goal.distance = Math.max(26, Math.min(90, box.spread * 1.9 + 16));
  const province = world?.provinces.find((entry) => entry.id === battleFrame.provinceId);
  setCameraLabel(`Watching · ${battleFrame.siege ? "Siege of" : "Battle of"} ${province?.name ?? "the field"}`);
}

// ---------------------------------------------------------------- HUD wiring
function openStory(storyId) {
  const story = stories.find((entry) => entry.id === storyId);
  if (story === undefined) return;
  showEventDetail(story, world);
  $("#event-detail").dataset.story = storyId;
}
$("#close-event").addEventListener("click", () => showEventDetail(null, world));
$("#event-locate").addEventListener("click", () => {
  const story = stories.find((entry) => entry.id === $("#event-detail").dataset.story);
  if (story === undefined) return;
  setMode("free");
  const target = pointAt(story);
  if (target !== null) { goal.target.copy(target); goal.distance = 70; }
  showEventDetail(null, world);
});
$("#event-follow").addEventListener("click", () => {
  const story = stories.find((entry) => entry.id === $("#event-detail").dataset.story);
  if (story?.armyId == null) return;
  pinned = { armyId: story.armyId }; setMode("pinned");
  showEventDetail(null, world);
});
const followArmy = (armyId) => { pinned = { armyId }; setMode("pinned"); };
$("#stop-following").addEventListener("click", () => setMode("director"));
$("#toggle-director").addEventListener("click", () => { setMode(mode === "director" ? "free" : "director"); watched.clear(); });
$("#overview").addEventListener("click", () => { setMode("free"); goal.target.set(0, 0, 0); goal.distance = 300; });
$("#reset-view").addEventListener("click", () => {
  if (world === null) return;
  const capital = world.provinces.find((entry) => entry.id === `cap_${activeFactionId}`);
  setMode("free");
  if (capital !== undefined) { goal.target.copy(groundAt(capital.x, capital.y)); goal.distance = 80; }
});
const panels = { faction: $("#faction-panel"), journal: $("#journal") };
const togglePanel = (name) => {
  const opening = panels[name].hidden;
  for (const [key, panel] of Object.entries(panels)) { panel.hidden = !(opening && key === name); $(`#toggle-${key}`).setAttribute("aria-expanded", String(opening && key === name)); }
  if (opening && name === "faction" && world !== null) renderFactionPanel(world, activeFactionId, catalog);
  if (opening && name === "journal" && world !== null) renderJournal(events, world);
};
$("#toggle-faction").addEventListener("click", () => togglePanel("faction"));
$("#toggle-journal").addEventListener("click", () => togglePanel("journal"));
$("#close-faction").addEventListener("click", () => togglePanel("faction"));
$("#close-journal").addEventListener("click", () => togglePanel("journal"));
const toggleHud = () => {
  const hidden = $("#hud").classList.toggle("is-hidden");
  $("#toggle-hud").setAttribute("aria-pressed", String(hidden));
  $("#toggle-hud").innerHTML = `${hidden ? "Show" : "Hide"} HUD <kbd>H</kbd>`;
};
$("#toggle-hud").addEventListener("click", toggleHud);
$("#toggle-stories").addEventListener("click", () => {
  const compact = $("#rail").classList.toggle("is-compact");
  $("#toggle-stories").setAttribute("aria-expanded", String(!compact));
});
const selectFaction = (factionId) => {
  activeFactionId = factionId;
  if (world !== null) renderTop(world, activeFactionId, catalog, selectFaction);
  if (!panels.faction.hidden && world !== null) renderFactionPanel(world, activeFactionId, catalog);
  const army = world?.armies.find((entry) => entry.factionId === factionId);
  if (army !== undefined) followArmy(army.id);
};
for (const button of document.querySelectorAll("#speed button")) {
  button.addEventListener("click", async () => {
    await fetch("/api/speed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ speed: Number(button.dataset.speed) }) }).catch(() => undefined);
  });
}
const keys = new Set();
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest("input, textarea, [contenteditable]")) return;
  const key = event.key.toLowerCase();
  if (["w", "a", "s", "d", "shift"].includes(key)) { keys.add(key); event.preventDefault(); return; }
  if (event.repeat) return;
  if (key === "h") toggleHud();
  if (key === "escape") { for (const panel of Object.values(panels)) panel.hidden = true; showEventDetail(null, world); }
});
document.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());

/** Projects the screen corners onto the ground for the minimap's camera outline. */
const raycaster = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function viewport() {
  if (world === null || battle !== null) return [];
  const points = [];
  for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const hit = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
    if (hit === null) return [];
    points.push({ x: Math.max(-40, Math.min(world.width + 40, hit.x + world.width / 2)), y: Math.max(-40, Math.min(world.height + 40, hit.z + world.height / 2)) });
  }
  return points;
}

// ---------------------------------------------------------------- server stream
const source = new EventSource("/api/events");
let campaignNumber = null;
source.addEventListener("catalog", (message) => {
  catalog = JSON.parse(message.data);
  // Painted sprites arrive with the catalog; the static markup was drawn before we knew about them.
  useIconSprites(catalog.icons);
  useUnitPortraits(catalog.portraits);
  useVignettes(catalog.vignettes);
  useJevPortraits(catalog.jevs);
  useCrests(catalog.crests);
  useScenes(catalog.scenes);
  initIcons();
});
source.addEventListener("open", () => { $("#connection").textContent = "Live"; });
source.addEventListener("error", () => { $("#connection").textContent = "Reconnecting"; });
source.addEventListener("snapshot", (message) => {
  const next = JSON.parse(message.data);
  if (campaignNumber !== null && next.number !== campaignNumber) { events.length = 0; clearDecisions(); watched.clear(); }
  campaignNumber = next.number;
  world = next;
  if (activeFactionId === null) activeFactionId = world.factions[0]?.id ?? null;
  renderTop(world, activeFactionId, catalog, selectFaction);
  renderIntentions(world, catalog, followArmy);
  stories = developingStories(world, catalog);
  renderStories(stories, world, shot.id, openStory);
  showBanner(world);
  if (!panels.faction.hidden) renderFactionPanel(world, activeFactionId, catalog);
  if (!panels.journal.hidden) renderJournal(events, world);
  if (battle === null) enterCampaign();
  else campaign?.update(world, catalog);
  minimap.update(world);
});
source.addEventListener("history", (message) => { events.push(...JSON.parse(message.data)); });
source.addEventListener("event", (message) => {
  if (world === null) return;
  const event = JSON.parse(message.data);
  events.push(event);
  if (events.length > 300) events.shift();
  if (event.stage !== undefined) {
    stageFocus = event.stage.phase === "turn" ? { factionId: event.stage.factionId } : null;
    const moving = world.factions.find((entry) => entry.id === event.stage.factionId);
    if (event.stage.phase === "turn" && moving !== undefined && battle === null) showTurnCard(moving, event.stage, TURN_CARD_MS, world.speed ?? 1);
    for (const button of document.querySelectorAll("#faction-switch button")) button.classList.toggle("is-turn", stageFocus !== null && button.dataset.faction === stageFocus.factionId);
    if (event.stage.phase === "end") {
      marching = null;
      endFaceOff(true);
      for (const [armyId, entry] of forecasts) if (entry.turn < world.turn || entry.factionId === event.factionId) forecasts.delete(armyId);
      for (const entry of event.forecast ?? []) forecasts.set(entry.armyId, { ...entry, turn: event.turn });
      renderForecast([...forecasts.values()], world);
    }
    return;
  }
  if (event.march !== undefined) {
    campaign?.marchArmy(event.march.armyId, event.march.path, event.march.ms);
    marching = { armyId: event.march.armyId, until: performance.now() + event.march.ms + 400, text: event.text };
    return;
  }
  if (event.decision !== undefined) {
    const faction = world.factions.find((entry) => entry.id === event.factionId);
    // A pop-out over a live battle is the confusion this pacing was meant to remove.
    if (faction === undefined || (event.hold ?? 0) <= 0 || battle !== null) return;
    const lord = faction.lords.find((entry) => world.armies.find((army) => army.id === event.decision.armyId)?.lordId === entry.id);
    showDecision(faction, event.decision, catalog.heroes.find((hero) => hero.id === lord?.heroId)?.name ?? "The Jev", event.hold, () => world?.speed ?? 1);
    if (event.decision.kind === "battle" && battle === null) startFaceOff(faction, event.decision);
    return;
  }
  if (event.type === "battle" && faceoff !== null) faceoff.result(event.text);
  // The handful of turning points get their own strip; showAnnouncement ignores everything else.
  if (battle === null) showAnnouncement(event, world, world.speed ?? 1);
  noticeEvent(event);
  if (!panels.journal.hidden) renderJournal(events, world);
});
source.addEventListener("battle-start", (message) => enterBattle(JSON.parse(message.data)));
source.addEventListener("battle-frame", (message) => { if (battle !== null) battle.receive(JSON.parse(message.data), performance.now()); });
source.addEventListener("battle-aftermath", (message) => {
  const payload = JSON.parse(message.data);
  if (battle !== null) battle.receive(payload.frame, performance.now());
  if (world !== null) showAftermath(payload.report, world);
});
source.addEventListener("battle-end", (message) => {
  const payload = JSON.parse(message.data);
  if (battle !== null) battle.receive(payload.frame, performance.now());
  setTimeout(() => enterCampaign(), 600);
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- frame loop
const forward = new THREE.Vector3(), right = new THREE.Vector3(), pan = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const wanted = new THREE.Vector3();
let previous = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const delta = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  // Once the Jev has chosen, the face-off lingers just long enough to show how it went.
  if (faceoff !== null && currentDecision() === null && battle === null) {
    faceoff.endsAt ??= now + 2600;
    if (now >= faceoff.endsAt) endFaceOff(true);
  }
  if (battle !== null) directBattle(now); else if (faceoff === null) direct(now);
  if (faceoff !== null) {
    faceoff.update(now, reduced);
    camera.position.lerp(faceoff.pose.position, 0.2);
    controls.target.lerp(faceoff.pose.target, 0.2);
  } else if (mode === "free") {
    const x = Number(keys.has("d")) - Number(keys.has("a")), z = Number(keys.has("w")) - Number(keys.has("s"));
    if (x !== 0 || z !== 0) {
      forward.subVectors(controls.target, camera.position); forward.y = 0; forward.normalize();
      right.crossVectors(forward, up).normalize();
      pan.copy(forward).multiplyScalar(z).addScaledVector(right, x).normalize().multiplyScalar(delta * (keys.has("shift") ? 90 : 40));
      camera.position.add(pan); controls.target.add(pan);
      goal.target.copy(controls.target);
    } else if (goal.target.distanceToSquared(controls.target) > 0.01) {
      // A button asked for a place; glide there, then leave the orbit controls alone.
      const shift = goal.target.clone().sub(controls.target).multiplyScalar(Math.min(1, delta * 3));
      controls.target.add(shift);
      const offset = camera.position.clone().sub(controls.target);
      const length = offset.length();
      offset.multiplyScalar(THREE.MathUtils.lerp(length, goal.distance, Math.min(1, delta * 3)) / length);
      camera.position.copy(controls.target).add(offset).add(shift);
    }
  } else {
    if (goal.armyId !== null && battle === null) { const live = campaign?.armyPosition(goal.armyId); if (live != null) goal.target.copy(live); }
    controls.target.lerp(goal.target, Math.min(1, delta * 1.8));
    const pitch = battle === null ? 0.8 : 0.56, reach = battle === null ? 0.56 : 0.62;
    wanted.set(controls.target.x, controls.target.y + goal.distance * pitch, controls.target.z + goal.distance * reach);
    camera.position.lerp(wanted, Math.min(1, delta * 1.8));
  }
  controls.update();
  if (battle !== null) {
    battle.update(now, reduced);
    battleFrame = battle.latest();
    if (world !== null && battleFrame !== null) {
      showBattle(battleFrame, world, world.provinces.find((entry) => entry.id === battleFrame.provinceId)?.name ?? "the field");
      if (battleHud !== null) battleHud.update(battleFrame, world.factions, innerWidth, innerHeight);
    }
  } else if (campaign !== null) {
    campaign.animate(delta, camera, innerWidth, innerHeight);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
