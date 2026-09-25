import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Mesh, MeshStandardMaterial, Scene, Vector3 } from "three";
import {
  armyOfTheDead,
  avatarJudgment,
  corpseExplosion,
  frostBolt,
  frozenOrb,
  glacialPrison,
  graveBolt,
  hallowedPath,
  hex,
  judgment,
  lichBolt,
  mechRocket,
  mechSuit,
  pandemic,
  plagueBloom,
  resurrection,
  sharedFate,
  spiteBolt,
  turret,
  turretBlast,
} from "@jev-game/content";
import { BLESSED_BURST, PLAGUE_BURST } from "@jev-game/game";
import { createFateThreads, type Tie } from "../src/game/views/fate-threads.js";
import { deathKnell } from "../src/game/views/fate-visuals.js";
import { createHexCritters } from "../src/game/views/hex-critters.js";
import { paintSpectral } from "../src/game/views/figure-base.js";
import { createParticleSystem } from "../src/game/views/particles.js";
import {
  castVisual,
  emitterShotOrigin,
  emitterVisual,
  formVisual,
  landingVisual,
  passiveVisual,
  projectileVisual,
  risenVisual,
  spawnVisual,
  waveArrivalSeconds,
  zoneVisual,
  type EmitterMotion,
  type SpellVisual,
  type TickedVisual,
} from "../src/game/views/spell-visuals.js";

const FRAME = 1 / 60;

const CASTER = new Vector3(-20, 8, -20);

function playOut(visual: SpellVisual): number {
  let frames = 0;

  while (!visual.finished()) {
    visual.update(FRAME);
    frames += 1;
    assert.ok(frames < 600, "the visual should finish within 10 s");
  }

  visual.dispose();
  assert.equal(visual.root.parent, null);

  return frames;
}

function runTicked(visual: TickedVisual, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    visual.sync(tick);
    visual.update(1 / 30);
    assert.equal(visual.finished(), false, "a state visual stays up while its state lasts");
  }

  visual.end();
  playOut(visual);
}

test("Glacial Prison and Pandemic cast visuals play out and clean up", () => {
  const particles = createParticleSystem(new Scene());

  for (const [abilityId, radius] of [
    [glacialPrison.id, 20],
    [glacialPrison.id, 40],
    [pandemic.id, 120],
  ] as const) {
    const visual = castVisual(particles, abilityId, new Vector3(5, 0, -8), radius, CASTER);
    assert.ok(visual !== null, `${abilityId} has a cast visual`);
    assert.ok(playOut(visual) > 10);
  }
});

test("a Burst lands with a visible splash even when it spreads nowhere", () => {
  const particles = createParticleSystem(new Scene());

  for (const radius of [0, 15]) {
    const visual = landingVisual(particles, PLAGUE_BURST, new Vector3(), radius);
    assert.ok(visual !== null);
    visual.update(FRAME * 6);
    const sizes = visual.root.children.map((child) => child.scale.x);
    assert.ok(Math.max(...sizes) >= 3, "the splash has size at radius 0");
    playOut(visual);
  }
});

test("Plague Bloom's flower stays up for its zone and wilts after", () => {
  const particles = createParticleSystem(new Scene());
  const visual = zoneVisual(particles, plagueBloom.id, new Vector3(), 15, 7, 15);
  assert.ok(visual !== null);
  runTicked(visual, 90);
});

test("Frozen Orb follows its emitter, extrapolating between ticks", () => {
  const particles = createParticleSystem(new Scene());
  const motion: EmitterMotion = { position: new Vector3(0, 0, 0), velocity: new Vector3(1, 0, 0), tick: 0 };
  const visual = emitterVisual(particles, frozenOrb.id, motion, 3);
  assert.ok(visual !== null);
  visual.sync(0);
  visual.update(1 / 60);
  const between = visual.root.position.x;
  assert.ok(between > 0 && between < 1, `half a tick in, the orb sits between ticks (x = ${between})`);

  for (let tick = 1; tick <= 30; tick += 1) {
    motion.position.set(tick, 0, 0);
    motion.tick = tick;
    visual.sync(tick);
    visual.update(1 / 30);
  }

  assert.ok(Math.abs(visual.root.position.x - 30) < 1.5, `the orb tracks the emitter (x = ${visual.root.position.x})`);
  visual.end();
  const resting = visual.root.position.x;
  visual.update(FRAME);
  assert.equal(visual.root.position.x, resting, "an ending orb stops moving");
  playOut(visual);
});

test("Hailstorm's cloud stays over the prison while it lasts", () => {
  const particles = createParticleSystem(new Scene());
  const motion: EmitterMotion = { position: new Vector3(12, 0, 4), velocity: new Vector3(), tick: 0 };
  const visual = emitterVisual(particles, glacialPrison.id, motion, 9);
  assert.ok(visual !== null);
  assert.equal(visual.root.position.x, 12);
  runTicked(visual, 120);
});

test("hail falls from the sky above its target while orb shards leave the orb", () => {
  const cloud = new Vector3(0, 0, 0);
  const target = new Vector3(20, 0, 0);
  const hail = emitterShotOrigin(glacialPrison.id, cloud, target);
  assert.ok(hail.y > 15);
  assert.ok(hail.x > 10 && hail.x < 20, "hail leans in from the cloud's side");

  const shard = emitterShotOrigin(frozenOrb.id, new Vector3(3, 0, 7), target);
  assert.equal(shard.x, 3);
  assert.equal(shard.z, 7);
  assert.ok(shard.y > 0);
});

test("frost projectiles and the Contagion glob fly to their target", () => {
  const particles = createParticleSystem(new Scene());
  const from = new Vector3(0, 5, 0);
  const to = new Vector3(30, 5, 0);

  for (const abilityId of [frostBolt.id, frozenOrb.id, PLAGUE_BURST]) {
    const visual = projectileVisual(particles, abilityId, from);
    assert.ok(visual !== null, `${abilityId} has a projectile`);
    visual.place(from, to, 1);
    const head = visual.objects[0];
    assert.ok(head instanceof Mesh);
    assert.ok(head.position.distanceTo(to) < 0.01, `${abilityId} lands on its target`);
  }

  assert.ok((projectileVisual(particles, PLAGUE_BURST, from)?.seconds ?? 0) > 0.2, "the glob is a slower lob");
});

test("the Pandemic wave reaches near enemies before far ones", () => {
  const near = waveArrivalSeconds(10, 120);
  const far = waveArrivalSeconds(80, 120);
  assert.ok(near >= 0 && near < far);
  assert.ok(waveArrivalSeconds(500, 120) <= 1.5);
});

test("Judgment's hammer tumbles end over end and lands on its target", () => {
  const particles = createParticleSystem(new Scene());
  const from = new Vector3(0, 5, 0);
  const to = new Vector3(0, 5, 30);

  for (const abilityId of [judgment.id, avatarJudgment.id]) {
    const visual = projectileVisual(particles, abilityId, from);
    assert.ok(visual !== null, `${abilityId} has a projectile`);
    const head = visual.objects[1];
    assert.ok(head instanceof Mesh);
    visual.place(from, to, 0.2);
    const early = head.quaternion.clone();
    visual.place(from, to, 0.5);
    assert.ok(head.position.y > 5, "the hammer arcs over the ground");
    assert.ok(early.angleTo(head.quaternion) > 0.5, "the hammer spins in flight");
    visual.place(from, to, 1);
    assert.ok(head.position.distanceTo(to) < 1.5, `${abilityId} lands on its target`);
  }
});

test("Blessed bursts, Resurrection and Avatar flashes play out and clean up", () => {
  const particles = createParticleSystem(new Scene());
  const center = new Vector3(4, 0, -6);

  const visuals = [
    landingVisual(particles, BLESSED_BURST, center, 15),
    landingVisual(particles, resurrection.id, center, 20),
    castVisual(particles, resurrection.id, center, 0, CASTER),
    formVisual(particles, "avatar", center, 10),
  ];

  for (const visual of visuals) {
    assert.ok(visual !== null);
    visual.update(FRAME * 6);
    assert.ok(Math.max(...visual.root.children.map((child) => child.scale.x)) >= 3, "the flash has size");
    assert.ok(playOut(visual) > 10);
  }
});

test("Hallowed Path glows while its ground lasts and fades after", () => {
  const particles = createParticleSystem(new Scene());
  const visual = zoneVisual(particles, hallowedPath.id, new Vector3(), 10, 5, 15);
  assert.ok(visual !== null);
  runTicked(visual, 60);
});

test("Hex opens an eye over its target, Shared Fate casts a web over the bound area and Weaver gathers its threads", () => {
  const particles = createParticleSystem(new Scene());
  const center = new Vector3(-3, 0, 7);
  const eye = landingVisual(particles, hex.id, center, 6);
  assert.ok(eye !== null);
  eye.update(0.2);
  const lids = eye.root.children[0];
  assert.ok(lids !== undefined && lids.scale.y > 0.8, "the eye is open");
  assert.ok(lids.position.y > 10, "the eye hangs over the target");
  assert.ok(playOut(eye) > 30);

  const web = castVisual(particles, sharedFate.id, center, 60, CASTER);
  assert.ok(web !== null);
  web.update(0.6);
  const [disc, shock] = web.root.children;
  assert.ok(disc !== undefined && disc.scale.x <= 26, "the web wraps the bound group instead of the whole board");
  assert.ok(shock !== undefined && shock.scale.x >= 55, "its shock ring marks the full bound area");
  assert.ok(playOut(web) > 30);

  const surge = passiveVisual(particles, "threads", center, 9);
  assert.ok(surge !== null);
  assert.ok(playOut(surge) > 30);
  assert.equal(passiveVisual(particles, "blessed-overflow", center, 9), null, "other passives keep their own visuals");
});

test("Spite Bolt flies a needle that trails a tapered thread", () => {
  const particles = createParticleSystem(new Scene());
  const from = new Vector3(0, 8, 0);
  const to = new Vector3(30, 5, 0);
  const visual = projectileVisual(particles, spiteBolt.id, from);
  assert.ok(visual !== null);
  const [needle, , , thread] = visual.objects;
  assert.ok(needle instanceof Mesh && thread instanceof Mesh);
  visual.place(from, to, 0.5);
  assert.ok(needle.position.x > 10 && needle.position.x < 20, "the needle is halfway");
  assert.ok(thread.visible && thread.geometry.drawRange.count > 0, "the thread is drawn behind it");
  visual.place(from, to, 1);
  assert.ok(needle.position.distanceTo(to) < 0.01, "the needle lands on its target");
});

test("hops, echoes, shared pulses and knells each carry their hit from one enemy to the next", () => {
  const particles = createParticleSystem(new Scene());
  const from = new Vector3(0, 4, 0);
  const to = new Vector3(20, 4, 10);

  for (const [abilityId, arcs] of [
    [hex.id, true],
    ["ill-omen", true],
    ["death-knell", true],
    [sharedFate.id, false],
  ] as const) {
    const visual = projectileVisual(particles, abilityId, from);
    assert.ok(visual !== null, `${abilityId} has a projectile`);
    const lead = visual.objects[0];
    assert.ok(lead instanceof Mesh);
    visual.place(from, to, 0.5);
    assert.equal(lead.position.y > 4, arcs, arcs ? `${abilityId} arcs` : `${abilityId} sags along the thread`);
    visual.place(from, to, 1);
    assert.ok(lead.position.distanceTo(to) < 0.01, `${abilityId} lands on its target`);
  }
});

test("Death Knell rings a bell over the fallen and cleans up", () => {
  const particles = createParticleSystem(new Scene());
  const bell = deathKnell(particles, new Vector3(6, 0, -2), 14);
  bell.update(0.3);
  assert.ok(
    bell.root.children.some((child) => child.position.y > 10),
    "the bell hangs overhead",
  );
  assert.ok(playOut(bell) > 30);
});

test("fate threads braid each bond into a loop, knot every member and hang puppets on strings", () => {
  const particles = createParticleSystem(new Scene());
  const threads = createFateThreads(particles);
  const scene = new Scene();
  scene.add(threads.root);

  const tie = (linkId: number, unitId: string, x: number, z: number, puppet = false): Tie => ({
    linkId,
    unitId,
    puppet,
    chest: new Vector3(x, 3, z),
    crown: new Vector3(x, 6, z),
  });

  const settle = (ties: readonly Tie[]): void => {
    for (let frame = 0; frame < 90; frame += 1) {
      threads.update(ties, FRAME);
    }
  };

  const drawn = (index: number): number => {
    const mesh = threads.root.children[index];

    return mesh instanceof Mesh && mesh.visible ? mesh.geometry.drawRange.count : 0;
  };

  const knots = (): number => threads.root.children.filter((child, index) => index >= 4 && child.visible).length;

  settle([tie(4, "a", 0, 0), tie(4, "b", 20, 0)]);
  const pair = drawn(0);
  assert.ok(pair > 0, "two bound enemies share one braided thread");
  assert.equal(knots(), 4, "each bound enemy wears a knot");

  settle([tie(4, "a", 0, 0), tie(4, "b", 20, 0), tie(4, "c", 10, 15)]);
  assert.equal(drawn(0), pair * 3, "three bound enemies close a triangle");

  settle([tie(4, "a", 0, 0, true), tie(4, "b", 20, 0)]);
  assert.ok(drawn(2) > 0 && drawn(3) > 0, "a puppet hangs from a cross on strings");

  settle([tie(4, "a", 0, 0), tie(9, "b", 20, 0)]);
  assert.equal(drawn(0), 0, "separate bonds never tie together");

  threads.update([], FRAME);
  assert.equal(knots(), 0, "knots fall away when the bond breaks");
  threads.dispose();
  assert.equal(threads.root.parent, null);
});

test("a hexed enemy shrinks into a poppet and grows back when the hex ends", () => {
  const particles = createParticleSystem(new Scene());
  const critters = createHexCritters(particles);
  const unit = { unitId: "B-1", position: new Vector3(10, 0, 5), yaw: 0, teamColor: "#ff6b6b" };
  critters.transform(unit.unitId, 0.3);

  for (let frame = 0; frame < 12; frame += 1) {
    critters.update([unit], FRAME);
  }

  assert.equal(critters.figureScale(unit.unitId), 1, "the hero keeps its shape until the eye's pop");

  for (let frame = 0; frame < 30; frame += 1) {
    critters.update([unit], FRAME);
  }

  assert.ok(critters.figureScale(unit.unitId) < 0.01, "the hero is hidden inside the poppet");
  assert.equal(critters.root.children.length, 1, "one poppet stands in for the hero");

  for (let frame = 0; frame < 40; frame += 1) {
    critters.update([], FRAME);
  }

  assert.equal(critters.figureScale(unit.unitId), 1, "the hero is back");
  assert.equal(critters.root.children.length, 0, "the poppet is gone");
  critters.dispose();
});

test("Corpse Explosion, Army of the Dead, the Lich and a risen corpse play out and clean up", () => {
  const particles = createParticleSystem(new Scene());
  const center = new Vector3(4, 0, -6);

  const visuals: [SpellVisual | null, number][] = [
    [landingVisual(particles, corpseExplosion.id, center, 15), 3],
    [castVisual(particles, armyOfTheDead.id, center, 30, CASTER), 3],
    [formVisual(particles, "lich", center, 12), 3],
    [risenVisual(particles, center, 7), 3],
    [passiveVisual(particles, "harvest", center, 6), 1.5],
  ];

  for (const [visual, size] of visuals) {
    assert.ok(visual !== null);
    visual.update(FRAME * 6);
    assert.ok(
      Math.max(...visual.root.children.map((child) => Math.max(child.scale.x, child.scale.y))) >= size,
      "the effect has size",
    );
    assert.ok(playOut(visual) > 10);
  }
});

test("Corpse Explosion throws bone shards out past its ring", () => {
  const particles = createParticleSystem(new Scene());
  const visual = landingVisual(particles, corpseExplosion.id, new Vector3(0, 0, 0), 15);
  assert.ok(visual !== null);
  visual.update(0.4);
  const shards = visual.root.children.filter((child) => child instanceof Mesh && child.geometry.type === "BoxGeometry");
  assert.ok(shards.length >= 8, "the corpse bursts into shards");
  assert.ok(
    shards.every((shard) => shard.position.length() > 5),
    "the shards fly outward",
  );
  playOut(visual);
});

test("grave bolts, lich bolts and harvested souls fly to their target", () => {
  const particles = createParticleSystem(new Scene());
  const from = new Vector3(0, 4, 0);
  const to = new Vector3(-18, 4, 12);

  for (const abilityId of [graveBolt.id, lichBolt.id, "harvest"]) {
    const visual = projectileVisual(particles, abilityId, from);
    assert.ok(visual !== null, `${abilityId} has a projectile`);
    const core = visual.objects[0];
    assert.ok(core instanceof Mesh);
    visual.place(from, to, 0.5);
    assert.ok(core.position.y > 4, `${abilityId} arcs`);
    visual.place(from, to, 1);
    assert.ok(core.position.distanceTo(to) < 0.01, `${abilityId} lands on its target`);
  }
});

test("a risen corpse turns see-through and teal, and returns to normal after", () => {
  const surface = new MeshStandardMaterial({ color: "#aa3322" });
  const memory = { colors: new Map() };
  paintSpectral([surface], memory, true);
  assert.equal(surface.transparent, true);
  assert.ok(surface.opacity < 1);
  assert.ok(surface.color.g > surface.color.r, "the tint leans teal");
  paintSpectral([surface], memory, true);
  const once = surface.color.getHex();
  paintSpectral([surface], memory, true);
  assert.equal(surface.color.getHex(), once, "tinting twice doesn't stack");
  paintSpectral([surface], memory, false);
  assert.equal(surface.transparent, false);
  assert.equal(surface.opacity, 1);
  assert.equal(surface.color.getHexString(), "aa3322");
});

test("rockets, Self-Destruct, Doomsday, the mech and a new turret play out and clean up", () => {
  const particles = createParticleSystem(new Scene());
  const center = new Vector3(-3, 0, 5);

  const visuals: [SpellVisual | null, number][] = [
    [landingVisual(particles, mechRocket.id, center, 10), 3],
    [landingVisual(particles, turretBlast.id, center, 15), 4],
    [landingVisual(particles, mechSuit.id, center, 20), 6],
    [formVisual(particles, "mech", center, 12), 3],
    [spawnVisual(particles, turret.id, center, 8), 3],
  ];

  for (const [visual, size] of visuals) {
    assert.ok(visual !== null);
    visual.update(FRAME * 6);
    assert.ok(
      Math.max(...visual.root.children.map((child) => Math.max(child.scale.x, child.scale.y))) >= size,
      "the effect has size",
    );
    assert.ok(playOut(visual) > 10);
  }
});

test("Self-Destruct throws gears and shrapnel out past its ring", () => {
  const particles = createParticleSystem(new Scene());
  const visual = landingVisual(particles, turretBlast.id, new Vector3(0, 0, 0), 15);
  assert.ok(visual !== null);
  visual.update(0.4);

  const pieces = visual.root.children.filter(
    (child) =>
      child instanceof Mesh && (child.geometry.type === "BoxGeometry" || child.geometry.type === "TorusGeometry"),
  );

  assert.ok(
    pieces.some((piece) => piece instanceof Mesh && piece.geometry.type === "TorusGeometry"),
    "the turret sheds gears",
  );
  assert.ok(pieces.length >= 12 && pieces.every((piece) => piece.position.length() > 5), "the pieces fly outward");
  playOut(visual);
});

test("a rocket arcs to its target nose first", () => {
  const particles = createParticleSystem(new Scene());
  const from = new Vector3(0, 4, 0);
  const to = new Vector3(20, 4, -10);
  const visual = projectileVisual(particles, mechRocket.id, from);
  assert.ok(visual !== null);
  const [body, nose] = visual.objects;
  assert.ok(body instanceof Mesh && nose instanceof Mesh);
  visual.place(from, to, 0.5);
  assert.ok(body.position.y > 4, "the rocket arcs");
  assert.ok(nose.position.distanceTo(to) < body.position.distanceTo(to), "the nose leads");
  visual.place(from, to, 1);
  assert.ok(body.position.distanceTo(to) < 0.01, "the rocket lands on its target");
});
