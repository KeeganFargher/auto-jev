import * as THREE from "three";
import { createFighter } from "./campaign-models.js";
import { animateColonist } from "./colonist-activity.js";
import { dressHero, animateHero } from "./hero-models.js";
import { createCombatEffects } from "./combat-effects.js";
import { createResource } from "./world-models.js";
import { BRIGHT, buildAbilityEffect, disposeAbilityEffect, poseCast } from "./ability-effects.js";

const FIELD_WIDTH = 120, FIELD_DEPTH = 88;
/**
 * The simulation thinks in a 120x88 field, but rendering it at 1:1 leaves human-sized soldiers as
 * specks on an empty lawn. Compressing the ground while keeping models large makes formations read
 * as formations — the ranks touch, and the line is visibly a line.
 */
const FIELD_SCALE = 0.52;
const MODEL_SCALE = 1.5;
/**
 * Frames are rendered this many ticks behind the newest one. The buffer is what keeps motion
 * continuous when frames arrive late or bunched: there is always a next frame to glide toward.
 */
const DELAY_TICKS = 3;
const GROUND = { grassland: "#b3c788", forest: "#82a772", mountain: "#a9b0a4", marsh: "#c9bc86", badlands: "#c8a46e" };
const TREES = { grassland: 0.012, forest: 0.07, mountain: 0.015, marsh: 0.02, badlands: 0.004 };
/** Battlefield coordinates to world space, centred so the camera can orbit the middle of the field. */
/**
 * The ground the server generated for this province. Height is in field units and is scaled the
 * same way x and z are, so a ridge has the slope the simulation thinks it has.
 */
let terrain = null;
/** Bilinear sample of one terrain layer, matching the simulation's own sampler exactly. */
function sample(layer, x, y) {
  if (terrain === null || layer === undefined) return 0;
  const u = Math.max(0, Math.min(1, x / FIELD_WIDTH)) * (terrain.cols - 1);
  const v = Math.max(0, Math.min(1, y / FIELD_DEPTH)) * (terrain.rows - 1);
  const col = Math.min(terrain.cols - 2, Math.floor(u)), row = Math.min(terrain.rows - 2, Math.floor(v));
  const fx = u - col, fy = v - row;
  const at = (c, r) => layer[r * terrain.cols + c] ?? 0;
  const top = at(col, row) * (1 - fx) + at(col + 1, row) * fx;
  const bottom = at(col, row + 1) * (1 - fx) + at(col + 1, row + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}
const heightAt = (x, y) => sample(terrain?.height, x, y);
const coverAt = (x, y) => sample(terrain?.cover, x, y);
const toWorld = (x, y) => new THREE.Vector3((x - FIELD_WIDTH / 2) * FIELD_SCALE, heightAt(x, y) * FIELD_SCALE, (y - FIELD_DEPTH / 2) * FIELD_SCALE);
const discGeometry = new THREE.CircleGeometry(0.62, 12);
function discMaterial(cache, colour) {
  let material = cache.get(colour);
  if (material === undefined) {
    material = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.5, depthWrite: false });
    cache.set(colour, material);
  }
  return material;
}

/**
 * Renders a live battle from a short buffer of server frames. The scene runs a tick clock a few
 * ticks behind the newest frame and interpolates every model between the two frames around that
 * clock, so movement is continuous instead of a snap per frame; cues fire when the clock reaches
 * the frame that carried them.
 */
export function createBattleView(scene, frame, factions, heroes = [], abilities = {}) {
  const root = new THREE.Group();
  scene.add(root);

  terrain = frame.terrain ?? null;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry((FIELD_WIDTH + 40) * FIELD_SCALE, (FIELD_DEPTH + 40) * FIELD_SCALE, 68, 52),
    new THREE.MeshStandardMaterial({ color: GROUND[frame.biome] ?? GROUND.grassland, flatShading: true, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  const relief = ground.geometry.attributes.position;
  for (let index = 0; index < relief.count; index++) {
    const x = relief.getX(index), y = relief.getY(index);
    // Plane coordinates back to field coordinates, so the mesh matches what the simulation samples.
    // The plane is laid flat with rotation.x = -PI/2, which sends its local +y to world -z, so the
    // depth axis inverts here. Without the minus the drawn hills are mirrored end-for-end against
    // the ones the simulation stands units on, and a soldier on a ridge renders under the ground.
    const fieldX = x / FIELD_SCALE + FIELD_WIDTH / 2, fieldY = -y / FIELD_SCALE + FIELD_DEPTH / 2;
    const edge = Math.max(0, Math.max(Math.abs(x) - FIELD_WIDTH * FIELD_SCALE * 0.5, Math.abs(y) - FIELD_DEPTH * FIELD_SCALE * 0.5)) / 8;
    relief.setZ(index, heightAt(fieldX, fieldY) * FIELD_SCALE + edge * edge * 1.4);
  }
  ground.geometry.computeVertexNormals();
  root.add(ground);
  // Woods stand where the simulation says there is cover, so what blunts an arrow is what you see.
  const density = TREES[frame.biome] ?? 0.012;
  for (let index = 0; index < 460; index++) {
    const angle = index * 2.399963, radius = 6 + (index % 23) * 3.1;
    const x = FIELD_WIDTH / 2 + Math.cos(angle) * radius * 1.45, y = FIELD_DEPTH / 2 + Math.sin(angle) * radius;
    const inside = x > 3 && x < FIELD_WIDTH - 3 && y > 3 && y < FIELD_DEPTH - 3;
    const hash = Math.abs(Math.sin(index * 12.9898) * 43758.5453) % 1;
    const chance = inside ? coverAt(x, y) * 0.9 + density : 0.55;
    if (hash > chance) continue;
    const tree = createResource("tree", (index % 19) / 19);
    tree.position.copy(toWorld(x, y));
    tree.scale.setScalar(1.5 + hash);
    root.add(tree);
  }

  const colourOf = (side) => factions.find((faction) => faction.id === (side === "attacker" ? frame.attackerFactionId : frame.defenderFactionId))?.color ?? "#cccccc";
  for (const side of ["attacker", "defender"]) {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_WIDTH * FIELD_SCALE, 1.6),
      new THREE.MeshBasicMaterial({ color: colourOf(side), transparent: true, opacity: 0.35, depthWrite: false }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.copy(toWorld(FIELD_WIDTH / 2, side === "attacker" ? 3 : FIELD_DEPTH - 3));
    line.position.y += 0.06;
    root.add(line);
  }

  const models = new Map();
  const discs = new Map();
  /** Live ability effects by cast id, each driven off the tick clock so it lands with the damage. */
  const spells = new Map();
  const effects = createCombatEffects(root, (point) => toWorld(point.x, point.y));
  /** Buffered frames, oldest first. Each remembers whether its cues have been fired. */
  const frames = [];
  let latest = frame;
  let clock = null;
  let msPerTick = 100;
  let lastArrival = null;
  let lastUpdate = null;
  let rendered = frame;

  function modelFor(fighter) {
    const existing = models.get(fighter.i);
    if (existing !== undefined) return existing;
    const model = createFighter(fighter.u, colourOf(fighter.s), (Number(fighter.i.replace(/\D/g, "")) % 19) / 19);
    const lordEntry = fighter.l === null ? undefined : frame.lords.find((entry) => entry.id === fighter.l);
    const hero = lordEntry === undefined ? undefined : heroes.find((entry) => entry.id === lordEntry.heroId);
    if (hero !== undefined) {
      dressHero(model, hero);
      model.isHero = true;
      model.heroScale = model.group.scale.x;
    }
    model.intrinsic = model.isHero === true ? model.heroScale * 0.85 : MODEL_SCALE;
    model.group.scale.setScalar(model.intrinsic);
    model.role = fighter.u === "archers" || fighter.u === "crossbowmen" ? "archer" : "infantry";
    model.heroColor = fighter.l === null ? undefined : "#ffe9a8";
    const disc = new THREE.Mesh(discGeometry, discMaterial(discs, fighter.l === null ? colourOf(fighter.s) : "#ffe9a8"));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.06;
    disc.scale.setScalar(fighter.l === null ? 1 : 1.6);
    model.group.add(disc);
    model.group.position.copy(toWorld(fighter.x, fighter.y));
    model.group.rotation.y = fighter.s === "attacker" ? 0 : Math.PI;
    model.field = { x: fighter.x, y: fighter.y };
    model.state = fighter.st;
    root.add(model.group);
    models.set(fighter.i, model);
    return model;
  }
  /** Builds the lab's telegraph and payoff for a cast, in world units, and marks the caster as winding up. */
  function startCast(cast) {
    const kit = abilities[cast.heroId] ?? [];
    const ability = kit[cast.slot] ?? { id: cast.abilityId, radius: 6, telegraph: 600, impact: 1500 };
    const hero = heroes.find((entry) => entry.id === cast.heroId);
    const telegraph = (cast.resolveAt - cast.at) * 100;
    const at = (point) => toWorld(point.x, point.y);
    const spell = {
      cast, telegraph, impact: ability.impact, aim: at({ x: cast.tx, y: cast.ty }),
      overhead: ["veyra", "elowen", "orun"].includes(cast.heroId),
      effect: null, casterId: frame.lords.find((entry) => entry.id === cast.lordId)?.fighterId ?? null,
    };
    spell.effect = buildAbilityEffect(ability.id, {
      color: hero?.color ?? "#ffffff", bright: BRIGHT[cast.heroId] ?? "#ffffff",
      radius: ability.radius * FIELD_SCALE, telegraph, impact: ability.impact,
      origin: at(cast), target: spell.aim,
      victims: () => spell.cast.hits.map((id) => models.get(id)?.group.position.clone()).filter((point) => point !== undefined),
      land: () => spell.cast.land === null ? null : at(spell.cast.land),
    });
    root.add(spell.effect.group);
    const caster = spell.casterId === null ? undefined : models.get(spell.casterId);
    if (caster !== undefined) caster.casting = { spell };
    return spell;
  }
  function endCast(id, spell) {
    disposeAbilityEffect(spell.effect);
    spells.delete(id);
    const caster = spell.casterId === null ? undefined : models.get(spell.casterId);
    if (caster !== undefined && caster.casting?.spell === spell) caster.casting = undefined;
  }
  const byId = (current) => {
    if (current.index === undefined) current.index = new Map(current.fighters.map((fighter) => [fighter.i, fighter]));
    return current.index;
  };

  return {
    root,
    toWorld,
    /** The frame the scene is currently showing, with interpolated positions, for the banners. */
    latest: () => rendered,
    /** Centre and spread of the living fighters, in world space, for the camera to frame. */
    bounds(current) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const fighter of current.fighters) {
        if (fighter.st === "routing") continue;
        const point = toWorld(fighter.x, fighter.y);
        minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
      }
      if (minX === Infinity) return { x: 0, z: 0, spread: 20 };
      return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, spread: Math.max(maxX - minX, maxZ - minZ) };
    },
    /** Where a Jev is on the field right now, preferring one actually fighting. */
    lordPosition(current) {
      const lords = current.fighters.filter((fighter) => fighter.l !== null && fighter.st !== "routing");
      const pick = lords.find((fighter) => fighter.st === "fighting") ?? lords[0];
      if (pick === undefined) return null;
      const model = models.get(pick.i);
      const heroId = current.lords.find((entry) => entry.id === pick.l)?.heroId;
      return model === undefined ? null : { position: model.group.position, heroId };
    },
    /** Buffers a server frame and refines the estimate of how fast ticks are arriving. */
    receive(current, now) {
      if (frames.length > 0 && current.tick <= frames[frames.length - 1].frame.tick) return;
      if (lastArrival !== null && current.tick > latest.tick) {
        const observed = (now - lastArrival.at) / (current.tick - lastArrival.tick);
        if (observed > 10 && observed < 2000) msPerTick = msPerTick * 0.8 + observed * 0.2;
      }
      lastArrival = { at: now, tick: current.tick };
      latest = current;
      frames.push({ frame: current, cued: false });
      while (frames.length > 12) frames.shift();
      if (clock === null) clock = current.tick - DELAY_TICKS;
    },
    /** Advances the tick clock and glides every model between the frames around it. */
    update(now, reduced) {
      if (clock === null || frames.length === 0) return;
      const dt = lastUpdate === null ? 0 : now - lastUpdate;
      lastUpdate = now;
      const wanted = latest.tick - DELAY_TICKS;
      clock += dt / msPerTick;
      // Drift back toward the buffer target: gently when close, firmly when far behind.
      const drift = wanted - clock;
      clock += drift * (Math.abs(drift) > 6 ? 0.2 : 0.04);
      if (clock > latest.tick) clock = latest.tick;
      let before = frames[0], after = frames[0];
      for (const entry of frames) { if (entry.frame.tick <= clock) before = entry; else { after = entry; break; } after = entry; }
      if (after.frame.tick <= clock) after = before;
      const span = after.frame.tick - before.frame.tick;
      const t = span <= 0 ? 0 : Math.max(0, Math.min(1, (clock - before.frame.tick) / span));
      // Cues belong to the moment the clock reaches their frame, not the moment the frame arrived.
      for (const entry of frames) {
        if (entry.cued || entry.frame.tick > clock) continue;
        entry.cued = true;
        for (const fighter of entry.frame.fighters) {
          const model = modelFor(fighter);
          effects.observe(model, { effects: fighter.e, x: fighter.x, y: fighter.y }, now, model.seen === undefined, reduced);
          model.seen = true;
        }
        for (const cast of entry.frame.casts ?? []) {
          const spell = spells.get(cast.id);
          // Later frames carry what the payoff touched and where a step landed.
          if (spell !== undefined) { spell.cast = cast; continue; }
          if (cast.at < clock - 8) continue;
          spells.set(cast.id, startCast(cast));
        }
      }
      const nextIndex = byId(after.frame);
      const seen = new Set();
      const shown = [];
      for (const fighter of before.frame.fighters) {
        seen.add(fighter.i);
        const model = modelFor(fighter);
        const next = nextIndex.get(fighter.i) ?? fighter;
        let x = fighter.x + (next.x - fighter.x) * t, y = fighter.y + (next.y - fighter.y) * t;
        // A blink or a leap is a relocation, not a run across the field.
        if (Math.hypot(next.x - fighter.x, next.y - fighter.y) > 6) { x = t < 0.5 ? fighter.x : next.x; y = t < 0.5 ? fighter.y : next.y; }
        const wasX = model.field.x, wasY = model.field.y;
        model.field.x = x; model.field.y = y;
        model.group.position.copy(toWorld(x, y));
        const moved = Math.hypot(x - wasX, y - wasY) * FIELD_SCALE;
        const walking = fighter.st === "advancing" || fighter.st === "routing";
        model.fighting = fighter.st === "fighting";
        // Facing comes from the simulation now. It used to be inferred from the last blow landed —
        // once every second and a half — so men standing in a melee faced wherever they had last
        // walked, and a line of soldiers read as a crowd milling about. Eased so heads turn rather
        // than snap, and always toward the man they are actually fighting.
        if (typeof fighter.f === "number") {
          const want = Math.atan2(Math.cos(fighter.f), Math.sin(fighter.f));
          if (model.yaw === undefined) model.yaw = want;
          let delta = want - model.yaw;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          model.yaw += delta * (reduced ? 1 : 0.18);
          model.group.rotation.y = model.yaw;
        } else if (moved > 0.003 && walking) model.group.rotation.y = Math.atan2(x - wasX, y - wasY);
        else if (model.fighting && model.facing != null) model.group.rotation.y = Math.atan2(model.facing.x - model.group.position.x, model.facing.z - model.group.position.z);
        const health = fighter.m === 0 ? 1 : fighter.h / fighter.m;
        model.group.scale.setScalar(model.intrinsic * (0.88 + health * 0.12));
        if (model.isHero === true) animateHero(model, now, !walking && !model.fighting);
        animateColonist(model, now, moved, walking, model.fighting, reduced);
        if (model.casting !== undefined) {
          const { spell } = model.casting;
          model.group.rotation.y = Math.atan2(spell.aim.x - model.group.position.x, spell.aim.z - model.group.position.z);
          poseCast(model, (clock - spell.cast.at) * 100, spell.telegraph, spell.impact, spell.overhead);
        }
        shown.push({ ...fighter, x, y });
      }
      for (const [id, model] of models) {
        if (seen.has(id)) continue;
        root.remove(model.group);
        models.delete(id);
      }
      rendered = { ...before.frame, fighters: shown, clock };
      effects.update(now, false);
      for (const [id, spell] of spells) {
        const ms = (clock - spell.cast.at) * 100;
        if (ms > spell.telegraph + spell.impact + 350) { endCast(id, spell); continue; }
        spell.effect.update(Math.max(0, ms));
      }
    },
    dispose() {
      for (const [id, spell] of spells) endCast(id, spell);
      effects.update(performance.now(), true);
      scene.remove(root);
      ground.geometry.dispose();
      for (const material of discs.values()) material.dispose();
    },
  };
}
