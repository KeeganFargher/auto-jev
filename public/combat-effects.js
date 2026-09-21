import * as THREE from "three";

const sparkGeometry = new THREE.IcosahedronGeometry(1, 0);
const slashGeometry = new THREE.TorusGeometry(0.7, 0.045, 4, 14, Math.PI * 1.3);
const arrowGeometry = new THREE.ConeGeometry(0.075, 0.45, 4);
const shockGeometry = new THREE.RingGeometry(0.16, 0.34, 20);
const shardGeometry = new THREE.ConeGeometry(0.07, 0.3, 3);
const up = new THREE.Vector3(0, 1, 0);

/** Owns short-lived battle effects; their source and destination come from confirmed simulation actions. */
export function createCombatEffects(scene, toPosition) {
  const active = [];
  // An archer's arrow leaves the string when the draw snaps open, not when the simulation resolved the
  // hit, so its emission waits out the draw and is flushed by update().
  const pending = [];
  function remove(effect) {
    scene.remove(effect.group);
    effect.material.dispose();
    for (const geometry of effect.owned) geometry.dispose();
  }
  function emit(kind, source, target, color, now, reduced) {
    // Bound GPU work even during large battles and fast simulation playback.
    if (active.length >= 120) remove(active.shift());
    const from = source.clone(); from.y += 0.8;
    const to = target.clone(); to.y += 0.65;
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
    const effect = { group, material, owned: [], kind, from, to, start: now, duration: kind === "heal" ? 650 : 450, reduced };
    if ((kind === "bolt" || kind === "heal") && !reduced) {
      const points = Array.from({ length: 9 }, (_, i) => {
        const point = from.clone().lerp(to, i / 8);
        if (i > 0 && i < 8) point.y += kind === "heal" ? Math.sin(i / 8 * Math.PI) * 0.7 : (i % 2 ? 0.22 : -0.22);
        return point;
      });
      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.TubeGeometry(curve, 24, kind === "heal" ? 0.035 : 0.055, 4, false);
      effect.owned.push(geometry); group.add(new THREE.Mesh(geometry, material));
    } else if (kind === "arrow" && !reduced) {
      const arrow = new THREE.Mesh(arrowGeometry, material);
      arrow.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize()); group.add(arrow);
    } else if (kind === "impact" && !reduced) {
      // A ring punched into the chest, facing whoever threw the blow, with debris off the back.
      group.position.copy(to);
      const facing = from.clone().sub(to); facing.y = 0;
      if (facing.lengthSq() > 0.0001) group.lookAt(group.position.clone().add(facing.normalize()));
      const shock = new THREE.Mesh(shockGeometry, material);
      shock.position.z = 0.16;
      group.add(shock);
      for (let i = 0; i < 5; i++) {
        const shard = new THREE.Mesh(shardGeometry, material);
        shard.userData.angle = (i / 5) * Math.PI * 2 + 0.4;
        group.add(shard);
      }
      effect.duration = 300;
    } else {
      group.position.copy(to);
      const mesh = new THREE.Mesh(kind === "slash" && !reduced ? slashGeometry : sparkGeometry, material);
      mesh.scale.setScalar(reduced ? 0.15 : 0.65);
      mesh.rotation.x = Math.PI / 2; group.add(mesh);
      if (!reduced) for (let i = 0; i < 6; i++) {
        const spark = new THREE.Mesh(sparkGeometry, material); spark.scale.setScalar(0.06); group.add(spark);
      }
    }
    scene.add(group); active.push(effect);
  }
  /** Consumes new cues once; reconnects seed the cursor without replaying old battles. */
  function observe(model, person, now, resync, reduced) {
    const previous = model.combatCues;
    model.combatCues = { ...person.effects };
    if (previous === undefined || resync) return;
    const effects = person.effects;
    if (effects.strikeAt !== undefined && effects.strikeAt !== previous.strikeAt) {
      const target = toPosition({ x: effects.strikeX, y: effects.strikeY });
      model.attackStarted = now; model.facing = target;
      const kind = model.role === "archer" ? "arrow" : ["veyra", "elowen"].includes(model.heroId) ? "bolt" : "slash";
      const color = model.heroColor === undefined ? "#ffe0ad" : model.heroColor;
      // 450ms strike window; the loose begins at 55% of it (see bowPhase).
      if (kind === "arrow" && !reduced) pending.push({ at: now + 450 * 0.55, model, target, color, reduced });
      else emit(kind, model.group.position, target, color, now, reduced);
    }
    if (effects.hitAt !== undefined && effects.hitAt !== previous.hitAt) {
      model.hitStarted = now;
      model.hitPower = effects.hitDamage ?? 5;
      const struck = toPosition(person);
      const source = effects.hitFromX === undefined ? model.group.position
        : toPosition({ x: effects.hitFromX, y: effects.hitFromY });
      const away = struck.clone().sub(source); away.y = 0;
      // Unit vector pointing from the attacker into the victim, for the brace direction.
      model.hitDir = away.lengthSq() > 0.0001 ? { x: away.x / away.length(), z: away.z / away.length() } : { x: 0, z: 1 };
      emit("impact", source, struck, "#ffd0a8", now, reduced);
    }
    if (effects.arcAt !== undefined && effects.arcAt !== previous.arcAt) emit("bolt", toPosition({ x: effects.arcX, y: effects.arcY }), toPosition(person), "#b9deff", now, reduced);
    if (effects.healAt !== undefined && effects.healAt !== previous.healAt && (model.healShownAt === undefined || now - model.healShownAt >= 600)) {
      model.healShownAt = now;
      emit("heal", model.group.position, toPosition({ x: effects.healX, y: effects.healY }), "#a6ffcb", now, reduced);
    }
  }
  /** Advances a capped collection and releases each effect's unique GPU resources on expiry. */
  function update(now, stopped) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const shot = pending[i];
      if (!stopped && now < shot.at) continue;
      pending.splice(i, 1);
      // Fire from wherever the archer stands at the moment of release.
      if (!stopped) emit("arrow", shot.model.group.position, shot.target, shot.color, now, shot.reduced);
    }
    for (let i = active.length - 1; i >= 0; i--) {
      const effect = active[i];
      const progress = Math.min(1, (now - effect.start) / effect.duration);
      if (progress >= 1 || stopped) { remove(effect); active.splice(i, 1); continue; }
      effect.material.opacity = (1 - progress) * 0.9;
      if (effect.reduced) continue;
      if (effect.kind === "impact") {
        // Ring punches outward fast; shards scatter behind the hit.
        const spread = 1 + progress * 2.6;
        effect.group.children[0].scale.setScalar(spread);
        for (let j = 1; j < effect.group.children.length; j++) {
          const shard = effect.group.children[j];
          const angle = shard.userData.angle;
          shard.position.set(Math.cos(angle) * progress * 0.55, Math.sin(angle) * progress * 0.55, -progress * 0.7);
          shard.rotation.set(progress * 3, angle, 0);
        }
        effect.material.opacity = (1 - progress) * (1 - progress) * 0.95;
      } else if (effect.kind === "arrow") {
        effect.group.position.lerpVectors(effect.from, effect.to, progress);
        effect.group.position.y += Math.sin(progress * Math.PI) * 0.6;
      } else if (effect.kind !== "bolt" && effect.kind !== "heal") {
        effect.group.rotation.y = progress * 1.8;
        for (let j = 1; j < effect.group.children.length; j++) {
          const angle = j * Math.PI / 3;
          effect.group.children[j].position.set(Math.cos(angle) * progress, progress * (1 - progress), Math.sin(angle) * progress);
        }
      }
    }
  }
  return { observe, update };
}
