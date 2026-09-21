import * as THREE from "three";
import { part } from "./world-models.js";

/**
 * The ability lab's effects, made portable. Each builder takes a cast context instead of the lab's
 * fixed dummies, so the same telegraph and payoff the lab tunes plays on a real battlefield.
 *
 * ctx: {
 *   color, bright            the Jev's tints
 *   radius                   area in world units
 *   telegraph, impact        windup and payoff lengths in ms
 *   origin: Vector3          where the Jev stood when the cast began (world)
 *   target: Vector3          where it was aimed (world)
 *   victims(): Vector3[]     where the fighters it touched stand, known once the payoff lands
 *   land(): Vector3 | null   where a dash or blink put the Jev, known once the payoff lands
 * }
 * Every builder returns { group, update(ms) }; the group sits at ctx.origin and everything inside
 * is relative to it. Total life is telegraph + impact.
 */

export const BRIGHT = { veyra: "#a5eaff", thorn: "#b8f27c", kael: "#ff665b", elowen: "#baffdf", nyx: "#c3adff", orun: "#ffd37c" };

/* --------------------------------------------------------- effect kit */
// Additive is for the small hot bits only. On bright grass a large additive decal saturates straight
// to white and throws away the Jev's colour, so every floor marker blends normally.
const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
});
const flat = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
});
let softTexture;
function softDisc() {
  if (softTexture === undefined) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d").createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "#ffffff00"); g.addColorStop(0.62, "#ffffff2e");
    g.addColorStop(0.9, "#ffffffbb"); g.addColorStop(1, "#ffffff00");
    const ctx = c.getContext("2d"); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    softTexture = new THREE.CanvasTexture(c);
  }
  return softTexture;
}
/** A flat plane lying just above the ground, so markers never z-fight the terrain. */
function decal(material, size, y = 0.05) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; return mesh;
}
function ring(color, inner, outer, opacity = 1, segments = 72) {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, segments), flat(color, opacity));
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.06; return mesh;
}
/** Ring whose sweep can be re-cut each frame; used for the telegraph filling up. */
function sweep(color, inner, outer, opacity = 1) {
  const mesh = ring(color, inner, outer, opacity);
  mesh.userData.cut = (fraction) => {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.RingGeometry(inner, outer, 72, 1, Math.PI / 2, -Math.PI * 2 * Math.max(0.0001, fraction));
  };
  return mesh;
}
/** Evenly spaced ticks around the rim, the RTS "this area is targeted" read. */
function ticks(color, radius, count, length = 0.45, width = 0.1) {
  const group = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.PlaneGeometry(width, length), flat(color, 1));
    t.rotation.x = -Math.PI / 2; t.rotation.z = -a;
    t.position.set(Math.cos(a) * radius, 0.06, Math.sin(a) * radius);
    group.add(t);
  }
  return group;
}
/** Reticle that spins in over a single unit: the shared "this one" read. */
function reticle(color, radius, at) {
  const g = new THREE.Group();
  const outer = ring(color, radius, radius + 0.14, 0);
  const brackets = new THREE.Group();
  for (let i = 0; i < 4; i += 1) {
    const arc = new THREE.Mesh(new THREE.RingGeometry(radius * 0.58, radius * 0.78, 20, 1, i * Math.PI / 2 + 0.28, 0.95), flat(color, 0));
    arc.rotation.x = -Math.PI / 2; arc.position.y = 0.07; brackets.add(arc);
  }
  g.add(outer, brackets); g.position.copy(at); g.position.y = 0.06;
  g.userData = { outer, brackets };
  return g;
}
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
function setOpacity(object, value) {
  object.traverse((child) => { if (child.material) child.material.opacity = Math.max(0, value); });
}
/** A flat plane's local length axis points along world heading `h` once it lies on the ground. */
const alongHeading = (h) => -h - Math.PI / 2;
/** Everything a builder needs in the group's own frame. */
function frame(ctx) {
  const T = ctx.target.clone().sub(ctx.origin); T.y = 0;
  if (T.lengthSq() < 0.01) T.set(0, 0, -1);
  const heading = Math.atan2(T.z, T.x);
  const local = (point) => { const at = point.clone().sub(ctx.origin); at.y = 0; return at; };
  return { T, heading, local, victims: () => ctx.victims().map(local), land: () => { const at = ctx.land(); return at === null ? null : local(at); } };
}
function shell(ctx) {
  const g = new THREE.Group();
  g.position.copy(ctx.origin);
  return g;
}

/* ------------------------------------------------------------ builders */
const BUILDERS = {};

// Sky-called lightning: rim fills, column drops, arcs whip out to each target.
BUILDERS.veyra = (p, def, ctx) => {
  const g = shell(ctx);
  const { T, victims } = frame(ctx);
  const area = decal(additive(def.bright, 0), p.radius * 2);
  area.material.map = softDisc(); area.material.needsUpdate = true;
  const rim = sweep(def.bright, p.radius - 0.28, p.radius, 0.95);
  const marks = ticks(def.bright, p.radius - 0.75, 12, 0.7, 0.14);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.5, 22, 12, 1, true), additive(def.bright, 0));
  column.position.set(T.x, 11, T.z);
  const shock = ring(def.bright, p.radius * 0.1, p.radius * 0.16, 0);
  shock.position.set(T.x, 0.06, T.z);
  [area, rim, marks].forEach((m) => m.position.set(T.x, m.position.y, T.z));
  const bolts = new THREE.Group();
  let armed = false;
  g.add(area, rim, marks, column, shock, bolts);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      rim.userData.cut(t); area.material.opacity = 0.42 * t; setOpacity(marks, 0.35 + 0.5 * Math.abs(Math.sin(ms * 0.012)));
      return;
    }
    if (!armed) {
      armed = true;
      for (const at of victims()) {
        const target = new THREE.Vector3(at.x, 0.9, at.z);
        const points = Array.from({ length: 7 }, (_, i) => {
          const point = new THREE.Vector3(0, 2.4, 0).lerp(target, i / 6);
          if (i > 0 && i < 6) { point.x += (i % 2 ? 0.5 : -0.5); point.y += (i % 2 ? 0.45 : -0.3); }
          return point;
        });
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 18, 0.085, 4, false), additive("#ffffff", 0));
        const pool = ring(def.bright, 0.45, 0.72, 0);
        pool.position.set(at.x, 0.06, at.z);
        bolts.add(tube, pool);
      }
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    rim.userData.cut(1);
    const flash = Math.max(0, 1 - t * 5);
    column.material.opacity = flash * 0.85;
    column.scale.set(1 + t * 0.6, 1, 1 + t * 0.6);
    shock.scale.setScalar(1 + easeOut(t) * (p.radius / (p.radius * 0.13)));
    shock.material.opacity = (1 - t) * 0.9;
    area.material.opacity = 0.42 * (1 - t) + flash * 0.14;
    setOpacity(marks, (1 - t) * 0.6);
    rim.material.opacity = 0.95 * (1 - t * 0.8);
    bolts.children.forEach((child, i) => {
      const delay = (i >> 1) * 0.07;
      const bt = clamp01((t - delay) / 0.35);
      child.material.opacity = bt <= 0 ? 0 : (1 - bt) * (i % 2 ? 0.95 : 0.8);
    });
  } };
};

// Roots burst along a fat arc facing the enemy, then stand as a wall.
BUILDERS.thorn = (p, def, ctx) => {
  const g = shell(ctx);
  const { heading: face } = frame(ctx);
  const span = Math.PI * 0.85;
  const band = new THREE.Mesh(new THREE.RingGeometry(p.radius - 1.1, p.radius, 64, 1, -face - span / 2, span), flat("#4a3b26", 0.5));
  band.rotation.x = -Math.PI / 2; band.position.y = 0.06;
  const fill = new THREE.Mesh(new THREE.RingGeometry(p.radius - 1.1, p.radius, 64, 1, -face - span / 2, 0.0001), flat(def.color, 0.9));
  fill.rotation.x = -Math.PI / 2; fill.position.y = 0.07;
  const roots = new THREE.Group();
  const COUNT = 15;
  for (let i = 0; i < COUNT; i += 1) {
    const a = -face - span / 2 + (i / (COUNT - 1)) * span;
    const r = p.radius - 0.55;
    const root = new THREE.Group();
    // Ring angle a sits at world (cos a, -sin a) once the ring lies flat.
    root.position.set(Math.cos(a) * r, 0, -Math.sin(a) * r);
    const h = 2.1 + (i % 4) * 0.5;
    part(root, new THREE.ConeGeometry(0.34, h, 5), "#63503a", [0, h / 2, 0], [1, 1, 1]);
    part(root, new THREE.IcosahedronGeometry(1, 0), "#719b4f", [0.15, h * 0.82, 0.1], [0.42, 0.3, 0.38]);
    root.rotation.y = a; root.rotation.z = ((i % 3) - 1) * 0.16;
    root.scale.y = 0; roots.add(root);
  }
  const dust = ring("#8a7a52", p.radius - 1.3, p.radius + 0.2, 0);
  g.add(band, fill, roots, dust);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      fill.geometry.dispose();
      fill.geometry = new THREE.RingGeometry(p.radius - 1.1, p.radius, 64, 1, -face - span / 2, Math.max(0.0001, span * t));
      band.material.opacity = 0.3 + 0.3 * t;
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    roots.children.forEach((root, i) => {
      const rt = clamp01((t - (i % 5) * 0.035) / 0.3);
      root.scale.y = rt < 1 ? easeOut(rt) * 1.18 : 1.18 - 0.18 * clamp01((t - 0.3) / 0.25);
      root.position.y = -0.2 + 0.2 * easeOut(rt);
    });
    dust.material.opacity = Math.max(0, 0.55 - t * 1.4);
    dust.scale.setScalar(1 + t * 0.35);
    const fade = clamp01((t - 0.72) / 0.28);
    band.material.opacity = 0.6 * (1 - fade); fill.material.opacity = 0.9 * (1 - fade);
    // Sink the roots rather than fading them: part() returns a shared cached material.
    if (fade > 0) roots.children.forEach((root) => { root.position.y = -fade * 3.2; });
  } };
};

// A lane opens toward the quarry, then Kael crosses it in one streak.
BUILDERS.kael = (p, def, ctx) => {
  const g = shell(ctx);
  const { T: target } = frame(ctx);
  const dir = target.clone().normalize(), len = target.length();
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(2.3, len), flat(def.color, 0));
  lane.rotation.x = -Math.PI / 2; lane.rotation.z = alongHeading(Math.atan2(dir.z, dir.x));
  lane.position.set(target.x / 2, 0.05, target.z / 2);
  const head = ring(def.color, p.radius * 0.28, p.radius * 0.34, 0);
  head.position.copy(target); head.position.y = 0.06;
  const headMarks = ticks(def.bright, p.radius * 0.31, 6, 0.6, 0.16);
  headMarks.position.copy(head.position);
  const streak = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 3.4), additive("#ffffff", 0));
  const burst = ring(def.bright, 0.3, 0.55, 0); burst.position.copy(head.position);
  const shards = new THREE.Group();
  for (let i = 0; i < 10; i += 1) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 4), additive(def.bright, 0));
    s.userData.a = (i / 10) * Math.PI * 2; shards.add(s);
  }
  g.add(lane, head, headMarks, streak, burst, shards);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      lane.material.opacity = 0.5 * t;
      lane.scale.y = Math.max(0.001, t);
      lane.position.set(target.x * t / 2, 0.05, target.z * t / 2);
      head.material.opacity = t; head.scale.setScalar(1.6 - 0.6 * t);
      setOpacity(headMarks, t * 0.9);
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const dash = clamp01(t / 0.22);
    streak.position.copy(dir).multiplyScalar(len * easeIn(dash)); streak.position.y = 0.9;
    streak.rotation.y = -Math.atan2(dir.z, dir.x) + Math.PI / 2;
    streak.material.opacity = dash < 1 ? 0.9 : 0;
    streak.scale.z = 1 + dash * 2.4;
    lane.material.opacity = 0.5 * (1 - t);
    const hit = clamp01((t - 0.2) / 0.5);
    burst.material.opacity = hit > 0 ? (1 - hit) * 1 : 0;
    burst.scale.setScalar(1 + easeOut(hit) * p.radius * 0.9);
    shards.children.forEach((s) => {
      const d = easeOut(hit) * p.radius * 0.45;
      s.position.set(target.x + Math.cos(s.userData.a) * d, 0.7 + Math.sin(hit * Math.PI) * 1.1, target.z + Math.sin(s.userData.a) * d);
      s.rotation.set(hit * 3, s.userData.a, 1.2);
      s.material.opacity = hit > 0 ? (1 - hit) * 0.95 : 0;
    });
    head.material.opacity = (1 - t) * 0.8; setOpacity(headMarks, (1 - t) * 0.5);
  } };
};

// A calm field that breathes outward, lifting motes and tagging each ally it covers.
BUILDERS.elowen = (p, def, ctx) => {
  const g = shell(ctx);
  const { victims } = frame(ctx);
  const area = decal(flat(def.color, 0), p.radius * 2);
  area.material.map = softDisc(); area.material.needsUpdate = true;
  const rim = ring(def.color, p.radius - 0.16, p.radius, 0);
  const pulses = [ring(def.color, p.radius * 0.2, p.radius * 0.26, 0), ring(def.bright, p.radius * 0.2, p.radius * 0.26, 0), ring(def.bright, p.radius * 0.2, p.radius * 0.26, 0)];
  const motes = new THREE.Group();
  for (let i = 0; i < 26; i += 1) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), flat(def.bright, 0));
    m.userData = { a: Math.random() * Math.PI * 2, r: Math.random() * p.radius, o: Math.random() };
    motes.add(m);
  }
  const tags = new THREE.Group();
  let armed = false;
  g.add(area, rim, ...pulses, motes, tags);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      area.material.opacity = 0.34 * t; rim.material.opacity = t * 0.8;
      rim.scale.setScalar(0.85 + 0.15 * easeOut(t));
      return;
    }
    if (!armed) {
      armed = true;
      for (const at of victims()) {
        const disc = ring(def.bright, 0.42, 0.58, 0);
        disc.position.set(at.x, 0.07, at.z);
        tags.add(disc);
      }
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const fade = 1 - clamp01((t - 0.78) / 0.22);
    area.material.opacity = (0.3 + 0.08 * Math.sin(t * 14)) * fade;
    rim.material.opacity = 0.7 * fade; rim.scale.setScalar(1);
    pulses.forEach((pulse, i) => {
      const pt = (t * 2.1 + i / pulses.length) % 1;
      pulse.scale.setScalar(1 + pt * (p.radius / (p.radius * 0.23) - 1));
      pulse.material.opacity = (1 - pt) * 0.55 * fade;
    });
    motes.children.forEach((m) => {
      const u = (t * 1.3 + m.userData.o) % 1;
      m.position.set(Math.cos(m.userData.a) * m.userData.r, u * 3.1, Math.sin(m.userData.a) * m.userData.r);
      m.material.opacity = Math.sin(u * Math.PI) * 0.95 * fade;
    });
    tags.children.forEach((d, i) => {
      const u = (t * 1.6 + i * 0.18) % 1;
      d.material.opacity = (1 - u) * 0.9 * fade; d.scale.setScalar(0.7 + u * 0.7);
    });
  } };
};

// Shadow drains into a point, then blooms back out where she lands.
BUILDERS.nyx = (p, def, ctx) => {
  const g = shell(ctx);
  const { T, land } = frame(ctx);
  const area = decal(flat("#150f22", 0), p.radius * 2);
  area.material.map = softDisc(); area.material.needsUpdate = true;
  const swirl = new THREE.Group();
  for (let i = 0; i < 5; i += 1) {
    const blade = new THREE.Mesh(new THREE.RingGeometry(p.radius * 0.35, p.radius * 0.95, 32, 1, 0, 0.9), flat("#2a2145", 0));
    blade.rotation.x = -Math.PI / 2; blade.rotation.z = (i / 5) * Math.PI * 2;
    blade.position.y = 0.06; swirl.add(blade);
  }
  const rim = ring(def.bright, p.radius - 0.2, p.radius, 0);
  const exitArea = decal(flat("#150f22", 0), p.radius * 1.6);
  exitArea.material.map = softDisc(); exitArea.material.needsUpdate = true;
  const exitRing = ring(def.bright, 0.3, 0.55, 0);
  const feathers = new THREE.Group();
  for (let i = 0; i < 14; i += 1) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 3), additive(def.bright, 0));
    f.userData.a = (i / 14) * Math.PI * 2; feathers.add(f);
  }
  // Until the step resolves, the exit is wherever she was aiming.
  const exit = T.clone();
  const place = (at) => { exit.copy(at); exitArea.position.set(at.x, 0.05, at.z); exitRing.position.set(at.x, 0.06, at.z); };
  place(exit);
  let armed = false;
  g.add(area, swirl, rim, exitArea, exitRing, feathers);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      area.material.opacity = 0.55 * t; rim.material.opacity = t;
      swirl.rotation.y = t * 3.4;
      swirl.children.forEach((b) => { b.material.opacity = 0.5 * t; });
      swirl.scale.setScalar(1 - 0.35 * easeIn(t));
      return;
    }
    if (!armed) { armed = true; const at = land(); if (at !== null) place(at); }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const vanish = clamp01(t / 0.3);
    swirl.rotation.y = 3.4 + vanish * 7;
    swirl.scale.setScalar(Math.max(0.001, 0.65 * (1 - vanish)));
    swirl.children.forEach((b) => { b.material.opacity = 0.5 * (1 - vanish); });
    area.material.opacity = 0.55 * (1 - vanish);
    rim.material.opacity = 1 - vanish; rim.scale.setScalar(1 - 0.5 * vanish);
    const arrive = clamp01((t - 0.28) / 0.7);
    exitArea.material.opacity = arrive > 0 ? Math.sin(arrive * Math.PI) * 0.5 : 0;
    exitRing.material.opacity = arrive > 0 ? (1 - arrive) * 1 : 0;
    exitRing.scale.setScalar(1 + easeOut(arrive) * p.radius * 1.4);
    feathers.children.forEach((f) => {
      const d = easeOut(arrive) * p.radius * 0.7;
      f.position.set(exit.x + Math.cos(f.userData.a) * d, 0.5 + Math.sin(arrive * Math.PI) * 1.4, exit.z + Math.sin(f.userData.a) * d);
      f.rotation.set(arrive * 2.2, f.userData.a, 0.8);
      f.material.opacity = arrive > 0 ? Math.sin(arrive * Math.PI) * 0.9 : 0;
    });
  } };
};

// An anvil mark, a held hammer, then concentric shockwaves and embers.
BUILDERS.orun = (p, def, ctx) => {
  const g = shell(ctx);
  const area = decal(flat("#c25a12", 0), p.radius * 2);
  area.material.map = softDisc(); area.material.needsUpdate = true;
  const rim = sweep("#c25a12", p.radius - 0.3, p.radius, 0.95);
  const cross = new THREE.Group();
  for (let i = 0; i < 4; i += 1) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.16, p.radius * 0.72), flat("#e0a040", 0));
    bar.rotation.x = -Math.PI / 2; bar.rotation.z = (i / 4) * Math.PI * 2;
    bar.position.set(Math.sin((i / 4) * Math.PI * 2) * p.radius * 0.62, 0.06, Math.cos((i / 4) * Math.PI * 2) * p.radius * 0.62);
    cross.add(bar);
  }
  const waves = [ring("#ffb24d", 0.4, 0.95, 0), ring("#ff8a2c", 0.4, 0.8, 0), ring(def.bright, 0.4, 0.62, 0)];
  const crack = decal(additive("#ff7a25", 0), p.radius * 1.2, 0.055);
  crack.material.map = softDisc(); crack.material.needsUpdate = true;
  const embers = new THREE.Group();
  for (let i = 0; i < 22; i += 1) {
    const e = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), additive("#ffce7a", 0));
    e.userData = { a: Math.random() * Math.PI * 2, r: 0.4 + Math.random() * p.radius, s: 0.6 + Math.random() * 0.8 };
    embers.add(e);
  }
  g.add(area, rim, cross, ...waves, crack, embers);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      rim.userData.cut(t); area.material.opacity = 0.4 * t;
      setOpacity(cross, 0.25 + 0.55 * t * Math.abs(Math.sin(ms * 0.009)));
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    rim.userData.cut(1); rim.material.opacity = 0.95 * (1 - t);
    const flash = Math.max(0, 1 - t * 6);
    crack.material.opacity = flash * 0.9 + Math.max(0, 0.35 - t * 0.6);
    crack.scale.setScalar(1 + easeOut(t) * 0.5);
    area.material.opacity = 0.4 * (1 - t) + flash * 0.18;
    setOpacity(cross, (1 - t) * 0.5);
    waves.forEach((w, i) => {
      const wt = clamp01((t - i * 0.09) / 0.62);
      w.scale.setScalar(1 + easeOut(wt) * (p.radius / 0.7));
      w.material.opacity = wt > 0 ? (1 - wt) * (0.95 - i * 0.18) : 0;
    });
    embers.children.forEach((e) => {
      const u = clamp01(t / 0.85);
      const d = easeOut(u) * e.userData.r;
      e.position.set(Math.cos(e.userData.a) * d, Math.sin(u * Math.PI) * 2.6 * e.userData.s, Math.sin(e.userData.a) * d);
      e.material.opacity = Math.sin(u * Math.PI) * 0.95;
    });
  } };
};

// Repeated bolts hammer random points inside the ring for the whole duration.
BUILDERS.thunderstorm = (p, def, ctx) => {
  const g = shell(ctx);
  const { T } = frame(ctx);
  const area = decal(flat(def.color, 0), p.radius * 2);
  area.material.map = softDisc(); area.material.needsUpdate = true;
  const rim = sweep(def.color, p.radius - 0.28, p.radius, 0.9);
  const marks = ticks(def.bright, p.radius - 0.8, 16, 0.65, 0.12);
  const STRIKES = 11;
  const bolts = [];
  for (let i = 0; i < STRIKES; i += 1) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (p.radius - 0.6);
    const at = new THREE.Vector3(T.x + Math.cos(a) * r, 0, T.z + Math.sin(a) * r);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.6, 18, 8, 1, true), additive(def.bright, 0));
    column.position.set(at.x, 9, at.z);
    const pool = ring(def.bright, 0.5, 0.85, 0); pool.position.set(at.x, 0.07, at.z);
    const scorch = ring("#3c2f4a", 0.1, 0.58, 0); scorch.position.set(at.x, 0.055, at.z);
    g.add(column, pool, scorch);
    bolts.push({ column, pool, scorch, at: i / STRIKES });
  }
  [area, rim, marks].forEach((m) => m.position.set(T.x, m.position.y, T.z));
  g.add(area, rim, marks);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      rim.userData.cut(t); area.material.opacity = 0.34 * t;
      setOpacity(marks, 0.3 + 0.5 * Math.abs(Math.sin(ms * 0.013)));
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    rim.userData.cut(1);
    const fade = 1 - clamp01((t - 0.8) / 0.2);
    area.material.opacity = 0.34 * fade; rim.material.opacity = 0.9 * fade;
    setOpacity(marks, 0.45 * fade);
    for (const bolt of bolts) {
      const bt = clamp01((t - bolt.at * 0.82) / 0.16);
      const flash = bt > 0 && bt < 1 ? 1 - bt : 0;
      bolt.column.material.opacity = flash * 0.95;
      bolt.column.scale.set(1 + (1 - flash) * 0.5, 1, 1 + (1 - flash) * 0.5);
      bolt.pool.material.opacity = flash;
      bolt.pool.scale.setScalar(1 + (1 - flash) * 1.6);
      bolt.scorch.material.opacity = bt > 0 ? 0.5 * fade : 0;
    }
  } };
};

// A shadow grows on the ground, then something very large lands in it.
BUILDERS.meteor = (p, def, ctx) => {
  const g = shell(ctx);
  const { T } = frame(ctx);
  const shade = decal(flat("#2b2318", 0), p.radius * 2, 0.045);
  shade.material.map = softDisc(); shade.material.needsUpdate = true;
  const rim = ring("#d8543a", p.radius - 0.3, p.radius, 0);
  const marks = ticks("#ffb24d", p.radius - 0.9, 8, 0.9, 0.18);
  const rock = new THREE.Group();
  part(rock, new THREE.IcosahedronGeometry(1, 0), "#4b3c33", [0, 0, 0], [1.5, 1.35, 1.5]);
  part(rock, new THREE.IcosahedronGeometry(1, 0), "#6b4a2f", [0.5, 0.35, -0.4], [0.7, 0.6, 0.7]);
  const trail = new THREE.Mesh(new THREE.ConeGeometry(1.25, 8, 8, 1, true), additive("#ff8a2c", 0));
  trail.position.y = 4.4; rock.add(trail);
  const crater = ring("#4a2f1e", 0.2, p.radius * 0.45, 0);
  const waves = [ring("#ffb24d", 0.4, 1.0, 0), ring("#ff7a25", 0.4, 0.7, 0)];
  const debris = new THREE.Group();
  for (let i = 0; i < 16; i += 1) {
    const d = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), flat("#5a4534", 0));
    d.userData = { a: Math.random() * Math.PI * 2, r: 1 + Math.random() * p.radius, s: 0.5 + Math.random() };
    debris.add(d);
  }
  const centre = new THREE.Group();
  centre.position.set(T.x, 0, T.z);
  centre.add(shade, rim, marks, rock, crater, ...waves, debris);
  g.add(centre);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      shade.material.opacity = 0.5 * easeIn(t);
      shade.scale.setScalar(0.35 + 0.65 * t);
      rim.material.opacity = t; marks.scale.setScalar(1.35 - 0.35 * t);
      setOpacity(marks, 0.4 + 0.5 * Math.abs(Math.sin(ms * 0.016)));
      rock.visible = t > 0.45;
      rock.position.set(0, 46 * (1 - clamp01((t - 0.45) / 0.55)) + 4, 0);
      rock.rotation.set(t * 5, t * 3, 0);
      trail.material.opacity = 0.55;
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const drop = clamp01(t / 0.12);
    rock.visible = drop < 1;
    rock.position.y = 4 * (1 - easeIn(drop)) + 0.9;
    trail.material.opacity = 0.55 * (1 - drop);
    const hit = clamp01((t - 0.1) / 0.9);
    shade.material.opacity = 0.5 * (1 - hit);
    rim.material.opacity = 1 - hit; setOpacity(marks, (1 - hit) * 0.5);
    crater.material.opacity = hit > 0 ? Math.min(0.75, hit * 4) * (1 - clamp01((t - 0.75) / 0.25)) : 0;
    crater.scale.setScalar(0.4 + easeOut(clamp01(hit * 3)) * 0.6);
    waves.forEach((w, i) => {
      const wt = clamp01((hit - i * 0.08) / 0.5);
      w.scale.setScalar(1 + easeOut(wt) * (p.radius / 0.7));
      w.material.opacity = wt > 0 && wt < 1 ? (1 - wt) * (0.95 - i * 0.2) : 0;
    });
    debris.children.forEach((d) => {
      const u = clamp01(hit / 0.7);
      const dist = easeOut(u) * d.userData.r;
      d.position.set(Math.cos(d.userData.a) * dist, Math.sin(u * Math.PI) * 3 * d.userData.s, Math.sin(d.userData.a) * dist);
      d.rotation.set(u * 6, u * 4, 0);
      d.material.opacity = u > 0 ? (1 - u) * 0.95 : 0;
    });
  } };
};

// A wedge opens in front of the caster and a wave rolls down it.
BUILDERS.cone = (p, def, ctx) => {
  const g = shell(ctx);
  const { heading: face } = frame(ctx);
  const span = Math.PI * 0.42;
  const wedgeAt = (fraction) => new THREE.RingGeometry(0.6, Math.max(0.61, p.radius * fraction), 40, 1, -face - span / 2, span);
  const zone = new THREE.Mesh(wedgeAt(1), flat(def.color, 0));
  zone.rotation.x = -Math.PI / 2; zone.position.y = 0.05;
  const fill = new THREE.Mesh(wedgeAt(0.01), flat(def.bright, 0.55));
  fill.rotation.x = -Math.PI / 2; fill.position.y = 0.065;
  const edge = new THREE.Mesh(new THREE.RingGeometry(p.radius - 0.2, p.radius, 40, 1, -face - span / 2, span), flat(def.color, 0));
  edge.rotation.x = -Math.PI / 2; edge.position.y = 0.07;
  const puffs = new THREE.Group();
  for (let i = 0; i < 18; i += 1) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), flat(def.bright, 0));
    puff.userData = { a: face - span / 2 + Math.random() * span, r: 0.6 + Math.random() * (p.radius - 0.6), o: Math.random() * 0.35 };
    puffs.add(puff);
  }
  g.add(zone, fill, edge, puffs);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      zone.material.opacity = 0.34 * t; edge.material.opacity = 0.85 * t;
      fill.material.opacity = 0;
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const wave = clamp01(t / 0.42);
    fill.geometry.dispose(); fill.geometry = wedgeAt(easeOut(wave));
    fill.material.opacity = 0.6 * (1 - clamp01((t - 0.45) / 0.45));
    zone.material.opacity = 0.34 * (1 - t); edge.material.opacity = 0.85 * (1 - t);
    puffs.children.forEach((puff) => {
      const u = clamp01((wave - puff.userData.r / p.radius + puff.userData.o) / 0.5);
      const reach = puff.userData.r;
      puff.position.set(Math.cos(puff.userData.a) * reach, 0.5 + u * 1.5, Math.sin(puff.userData.a) * reach);
      puff.scale.setScalar(0.6 + u * 1.5);
      puff.material.opacity = u > 0 ? Math.sin(u * Math.PI) * 0.75 : 0;
    });
  } };
};

// A beam pivots around the caster, scorching the arc it crosses.
BUILDERS.beam = (p, def, ctx) => {
  const g = shell(ctx);
  const { heading } = frame(ctx);
  const span = Math.PI * 1.15, from = -heading - span / 2;
  const zone = new THREE.Mesh(new THREE.RingGeometry(0.5, p.radius, 48, 1, from, span), flat(def.color, 0));
  zone.rotation.x = -Math.PI / 2; zone.position.y = 0.05;
  const pivot = new THREE.Group();
  const guide = new THREE.Mesh(new THREE.PlaneGeometry(0.12, p.radius), flat(def.bright, 0));
  guide.rotation.x = -Math.PI / 2; guide.position.set(0, 0.07, p.radius / 2);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.6, p.radius), additive(def.bright, 0));
  blade.position.set(0, 1.3, p.radius / 2);
  pivot.add(guide, blade);
  const burn = new THREE.Mesh(new THREE.RingGeometry(0.5, p.radius, 48, 1, from, 0.0001), flat("#6b5240", 0));
  burn.rotation.x = -Math.PI / 2; burn.position.y = 0.06;
  g.add(zone, burn, pivot);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      zone.material.opacity = 0.3 * t;
      pivot.rotation.y = -from - Math.PI / 2;
      guide.material.opacity = t * 0.9;
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const sweepT = clamp01(t / 0.62);
    const angle = from + span * easeOut(sweepT);
    pivot.rotation.y = -angle - Math.PI / 2;
    blade.material.opacity = sweepT < 1 ? 0.85 : 0;
    guide.material.opacity = sweepT < 1 ? 0.9 : 0;
    burn.geometry.dispose();
    burn.geometry = new THREE.RingGeometry(0.5, p.radius, 48, 1, from, Math.max(0.0001, span * easeOut(sweepT)));
    const fade = 1 - clamp01((t - 0.6) / 0.4);
    burn.material.opacity = 0.2 * fade;
    zone.material.opacity = 0.3 * fade;
  } };
};

// Everything is dragged inward, then thrown back out.
BUILDERS.maelstrom = (p, def, ctx) => {
  const g = shell(ctx);
  const area = decal(flat(def.color, 0), p.radius * 2);
  area.material.map = softDisc(); area.material.needsUpdate = true;
  const arms = new THREE.Group();
  for (let i = 0; i < 6; i += 1) {
    const arm = new THREE.Mesh(new THREE.RingGeometry(p.radius * 0.28, p.radius, 36, 1, 0, 0.55), flat(def.bright, 0));
    arm.rotation.x = -Math.PI / 2; arm.rotation.z = (i / 6) * Math.PI * 2; arm.position.y = 0.06;
    arms.add(arm);
  }
  const eye = ring(def.bright, 0.2, p.radius * 0.22, 0);
  const motes = new THREE.Group();
  for (let i = 0; i < 24; i += 1) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), flat(def.bright, 0));
    m.userData = { a: Math.random() * Math.PI * 2, r: p.radius * (0.4 + Math.random() * 0.6) };
    motes.add(m);
  }
  const burst = ring(def.bright, 0.3, 0.7, 0);
  g.add(area, arms, eye, motes, burst);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      area.material.opacity = 0.3 * t;
      setOpacity(arms, 0.45 * t); arms.rotation.y = t * 2.2;
      eye.material.opacity = t * 0.8;
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const pull = clamp01(t / 0.68);
    arms.rotation.y = 2.2 + easeIn(pull) * 16;
    arms.scale.setScalar(Math.max(0.05, 1 - pull * 0.85));
    setOpacity(arms, 0.45 * (1 - clamp01((t - 0.6) / 0.25)));
    area.material.opacity = 0.3 * (1 - clamp01((t - 0.6) / 0.3));
    eye.material.opacity = 0.8 * (1 - clamp01((t - 0.6) / 0.25));
    eye.scale.setScalar(1 + Math.sin(pull * Math.PI * 3) * 0.14);
    motes.children.forEach((m) => {
      const spin = m.userData.a + easeIn(pull) * 9;
      const dist = m.userData.r * (1 - easeIn(pull));
      m.position.set(Math.cos(spin) * dist, 0.5 + pull * 1.1, Math.sin(spin) * dist);
      m.material.opacity = (1 - clamp01((pull - 0.8) / 0.2)) * 0.9;
    });
    const out = clamp01((t - 0.68) / 0.32);
    burst.material.opacity = out > 0 ? (1 - out) : 0;
    burst.scale.setScalar(1 + easeOut(out) * (p.radius / 0.5));
  } };
};

// The ground splits along a line and light comes up out of it.
BUILDERS.fissure = (p, def, ctx) => {
  const g = shell(ctx);
  const { heading } = frame(ctx);
  const len = p.radius * 2;
  const dir = new THREE.Vector2(Math.cos(heading), Math.sin(heading)), side = new THREE.Vector2(-dir.y, dir.x);
  const guide = new THREE.Mesh(new THREE.PlaneGeometry(0.9, len), flat(def.color, 0));
  guide.rotation.x = -Math.PI / 2; guide.rotation.z = alongHeading(heading);
  guide.position.set(dir.x * len / 2, 0.05, dir.y * len / 2);
  const SEGMENTS = 12;
  const cracks = [];
  for (let i = 0; i < SEGMENTS; i += 1) {
    const along = (i / (SEGMENTS - 1)) * len;
    const jitter = ((i % 3) - 1) * 0.28;
    const x = dir.x * along + side.x * jitter;
    const z = dir.y * along + side.y * jitter;
    const gap = new THREE.Mesh(new THREE.PlaneGeometry(0.75, len / SEGMENTS + 0.25), flat("#1d1410", 0));
    gap.rotation.x = -Math.PI / 2; gap.rotation.z = alongHeading(heading) + jitter * 0.4;
    gap.position.set(x, 0.06, z);
    const glowStrip = new THREE.Mesh(new THREE.PlaneGeometry(0.3, len / SEGMENTS), additive(def.bright, 0));
    glowStrip.rotation.copy(gap.rotation); glowStrip.position.set(x, 0.07, z);
    const shard = new THREE.Group();
    for (const s of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, len / SEGMENTS * 0.85), flat("#6b5540", 0));
      slab.position.set(s * 0.5, 0, 0); slab.rotation.z = s * 0.5;
      shard.add(slab);
    }
    shard.position.set(x, 0, z); shard.rotation.y = -heading + Math.PI / 2;
    g.add(gap, glowStrip, shard);
    cracks.push({ gap, glowStrip, shard, at: i / SEGMENTS });
  }
  g.add(guide);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      guide.material.opacity = 0.55 * t;
      guide.scale.y = Math.max(0.01, t);
      guide.position.set(dir.x * len * t / 2, 0.05, dir.y * len * t / 2);
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    guide.material.opacity = 0.55 * (1 - t);
    const close = clamp01((t - 0.72) / 0.28);
    for (const crack of cracks) {
      const ct = clamp01((t - crack.at * 0.3) / 0.22);
      const open = ct * (1 - close);
      crack.gap.material.opacity = open * 0.95;
      crack.gap.scale.x = 0.35 + open * 2.1;
      crack.glowStrip.material.opacity = open * (0.7 + 0.3 * Math.sin(ms * 0.02));
      crack.glowStrip.scale.x = 0.3 + open * 1.5;
      setOpacity(crack.shard, open * 0.95);
      crack.shard.position.y = 0.03 + open * 0.22;
      crack.shard.children.forEach((slab, s) => { slab.rotation.z = (s ? 1 : -1) * (0.15 + open * 0.55); });
    }
  } };
};

// A dome closes over the area and holds.
BUILDERS.dome = (p, def, ctx) => {
  const g = shell(ctx);
  const base = ring(def.color, p.radius - 0.3, p.radius, 0);
  const marks = ticks(def.bright, p.radius - 0.85, 10, 0.75, 0.14);
  const shellMesh = new THREE.Mesh(
    new THREE.SphereGeometry(p.radius, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: def.bright, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
  );
  const lattice = new THREE.Mesh(
    new THREE.SphereGeometry(p.radius * 1.004, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0, wireframe: true, depthWrite: false, toneMapped: false }),
  );
  const flare = ring(def.bright, p.radius - 0.15, p.radius + 0.1, 0);
  g.add(base, marks, shellMesh, lattice, flare);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      base.material.opacity = t; setOpacity(marks, t * 0.8);
      shellMesh.scale.set(1, 0.05 + 0.2 * t, 1);
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const rise = clamp01(t / 0.22);
    const h = easeOut(rise) * 1.08 - 0.08 * clamp01((t - 0.22) / 0.2);
    shellMesh.scale.set(1, Math.max(0.05, h), 1);
    lattice.scale.copy(shellMesh.scale);
    const hold = 1 - clamp01((t - 0.72) / 0.28);
    shellMesh.material.opacity = (0.17 + 0.05 * Math.sin(ms * 0.006)) * rise * hold;
    lattice.material.opacity = 0.35 * rise * hold;
    base.material.opacity = hold; setOpacity(marks, 0.55 * hold);
    flare.material.opacity = rise < 1 ? (1 - rise) * 0.9 : 0;
    flare.scale.setScalar(0.5 + rise * 0.6);
  } };
};

// Blades whirl out from the caster behind a shockwave.
BUILDERS.bladenova = (p, def, ctx) => {
  const g = shell(ctx);
  const area = decal(flat(def.color, 0), p.radius * 2);
  area.material.map = softDisc(); area.material.needsUpdate = true;
  const windup = ring(def.bright, p.radius * 0.15, p.radius * 0.22, 0);
  const blades = new THREE.Group();
  const COUNT = 9;
  for (let i = 0; i < COUNT; i += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 1.5), additive(def.bright, 0));
    blade.userData.a = (i / COUNT) * Math.PI * 2;
    blades.add(blade);
  }
  const waves = [ring(def.bright, 0.4, 0.9, 0), ring(def.color, 0.4, 0.65, 0)];
  g.add(area, windup, blades, ...waves);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      area.material.opacity = 0.26 * t;
      windup.material.opacity = t; windup.scale.setScalar(1 + t * 0.5);
      blades.rotation.y = easeIn(t) * 9;
      blades.children.forEach((b) => {
        b.position.set(Math.cos(b.userData.a) * 0.9, 0.9, Math.sin(b.userData.a) * 0.9);
        b.rotation.y = -b.userData.a; b.material.opacity = t * 0.9;
      });
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const out = clamp01(t / 0.6);
    blades.rotation.y = 9 + easeOut(out) * 7;
    const dist = 0.9 + easeOut(out) * (p.radius - 0.9);
    blades.children.forEach((b) => {
      b.position.set(Math.cos(b.userData.a) * dist, 0.9, Math.sin(b.userData.a) * dist);
      b.rotation.y = -b.userData.a;
      b.scale.setScalar(1 + out * 0.8);
      b.material.opacity = (1 - out) * 0.95;
    });
    windup.material.opacity = (1 - out) * 0.8;
    windup.scale.setScalar(1.5 + out * 2);
    area.material.opacity = 0.26 * (1 - t);
    waves.forEach((w, i) => {
      const wt = clamp01((t - i * 0.1) / 0.55);
      w.scale.setScalar(1 + easeOut(wt) * (p.radius / 0.65));
      w.material.opacity = wt > 0 && wt < 1 ? (1 - wt) * (0.9 - i * 0.25) : 0;
    });
  } };
};

/* -------------------------------------------------- single-target effects */

// A fast single bolt: lock on, snap a projectile across, small hard burst.
BUILDERS.bolt = (p, def, ctx) => {
  const g = shell(ctx);
  const { T: FOE } = frame(ctx);
  const lock = reticle(def.color, 1.05, FOE);
  const shot = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 5), additive(def.bright, 0));
  shot.rotation.x = Math.PI / 2;
  const burst = ring(def.bright, 0.2, 0.42, 0); burst.position.copy(FOE); burst.position.y = 0.07;
  const sparks = new THREE.Group();
  for (let i = 0; i < 8; i += 1) {
    const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), additive(def.bright, 0));
    sp.userData.a = (i / 8) * Math.PI * 2; sparks.add(sp);
  }
  g.add(lock, shot, burst, sparks);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      lock.userData.outer.material.opacity = t;
      lock.userData.outer.scale.setScalar(1.8 - 0.8 * easeOut(t));
      setOpacity(lock.userData.brackets, t * 0.9);
      lock.rotation.y = (1 - t) * 2.4;
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const fly = clamp01(t / 0.26);
    shot.visible = fly < 1;
    shot.position.copy(new THREE.Vector3(0, 1.3, 0).lerp(new THREE.Vector3(FOE.x, 1.0, FOE.z), easeIn(fly)));
    shot.lookAt(g.position.x + FOE.x, 1.0, g.position.z + FOE.z);
    shot.material.opacity = fly < 1 ? 0.95 : 0;
    shot.scale.set(1, 1, 1 + fly * 2.2);
    const hit = clamp01((t - 0.24) / 0.5);
    burst.material.opacity = hit > 0 ? (1 - hit) : 0;
    burst.scale.setScalar(1 + easeOut(hit) * 5);
    sparks.children.forEach((sp) => {
      const d = easeOut(hit) * 1.7;
      sp.position.set(FOE.x + Math.cos(sp.userData.a) * d, 0.8 + Math.sin(hit * Math.PI) * 1.2, FOE.z + Math.sin(sp.userData.a) * d);
      sp.material.opacity = hit > 0 ? (1 - hit) * 0.95 : 0;
    });
    lock.userData.outer.material.opacity = 1 - t;
    setOpacity(lock.userData.brackets, (1 - t) * 0.7);
    lock.rotation.y = t * 1.2;
  } };
};

// Holds one unit in place: a tether from the caster and a cage that closes on it.
BUILDERS.snare = (p, def, ctx) => {
  const g = shell(ctx);
  const { T: FOE } = frame(ctx);
  const lock = reticle(def.color, 1.25, FOE);
  const tether = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), flat(def.bright, 0));
  const cage = new THREE.Group();
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const rib = new THREE.Group();
    part(rib, new THREE.ConeGeometry(0.16, 2.3, 5), "#63503a", [0, 1.15, 0], [1, 1, 1]);
    rib.position.set(FOE.x + Math.cos(a) * 0.85, 0, FOE.z + Math.sin(a) * 0.85);
    rib.rotation.z = -Math.cos(a) * 0.5; rib.rotation.x = Math.sin(a) * 0.5;
    rib.scale.y = 0; cage.add(rib);
  }
  const pool = ring(def.color, 0.2, 1.05, 0); pool.position.copy(FOE); pool.position.y = 0.055;
  g.add(lock, tether, cage, pool);
  const anchor = new THREE.Vector3(0, 1.1, 0);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      lock.userData.outer.material.opacity = t;
      lock.userData.outer.scale.setScalar(1.7 - 0.7 * easeOut(t));
      setOpacity(lock.userData.brackets, t * 0.9);
      lock.rotation.y = -(1 - t) * 2;
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const grow = clamp01(t / 0.25);
    const hold = 1 - clamp01((t - 0.7) / 0.3);
    const target = new THREE.Vector3(FOE.x, 0.9, FOE.z);
    const mid = anchor.clone().lerp(target, 0.5);
    tether.position.copy(mid);
    tether.scale.set(1, anchor.distanceTo(target), 1);
    tether.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), target.clone().sub(anchor).normalize());
    tether.material.opacity = 0.75 * grow * hold;
    cage.children.forEach((rib, i) => {
      const rt = clamp01((grow - i * 0.06) / 0.5);
      rib.scale.y = easeOut(rt) * (0.85 + 0.15 * hold);
    });
    // Ribs share a cached material, so they sink instead of fading.
    cage.position.y = -(1 - hold) * 2.6;
    pool.material.opacity = 0.7 * grow * hold;
    pool.scale.setScalar(1 + Math.sin(t * 9) * 0.05);
    lock.userData.outer.material.opacity = hold;
    setOpacity(lock.userData.brackets, 0.7 * hold);
    lock.rotation.y = t * 0.8;
  } };
};

// A held beam onto one ally, lifting motes off them while it runs.
BUILDERS.mend = (p, def, ctx) => {
  const g = shell(ctx);
  const { T: FRIEND } = frame(ctx);
  const lock = reticle(def.bright, 0.95, FRIEND);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1, 8), flat(def.bright, 0));
  const pool = ring(def.bright, 0.28, 0.85, 0); pool.position.copy(FRIEND); pool.position.y = 0.055;
  const motes = new THREE.Group();
  for (let i = 0; i < 14; i += 1) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), flat(def.bright, 0));
    m.userData = { a: Math.random() * Math.PI * 2, o: Math.random() };
    motes.add(m);
  }
  g.add(lock, beam, pool, motes);
  const anchor = new THREE.Vector3(0, 1.5, 0);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      lock.userData.outer.material.opacity = t; setOpacity(lock.userData.brackets, t * 0.8);
      lock.userData.outer.scale.setScalar(1.5 - 0.5 * easeOut(t));
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const hold = Math.min(clamp01(t / 0.12), 1 - clamp01((t - 0.72) / 0.28));
    const target = new THREE.Vector3(FRIEND.x, 1.0, FRIEND.z);
    beam.position.copy(anchor.clone().lerp(target, 0.5));
    beam.scale.set(1, anchor.distanceTo(target), 1);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), target.clone().sub(anchor).normalize());
    beam.material.opacity = (0.55 + 0.2 * Math.sin(ms * 0.014)) * hold;
    pool.material.opacity = 0.8 * hold;
    pool.scale.setScalar(1 + Math.sin(t * 8) * 0.08);
    motes.children.forEach((m) => {
      const u = (t * 1.5 + m.userData.o) % 1;
      m.position.set(FRIEND.x + Math.cos(m.userData.a) * 0.55, u * 2.4, FRIEND.z + Math.sin(m.userData.a) * 0.55);
      m.material.opacity = Math.sin(u * Math.PI) * hold;
    });
    lock.userData.outer.material.opacity = hold; setOpacity(lock.userData.brackets, 0.6 * hold);
    lock.rotation.y = t * 0.5;
  } };
};

// One target gets something very heavy dropped on it from directly overhead.
BUILDERS.smite = (p, def, ctx) => {
  const g = shell(ctx);
  const { T: FOE } = frame(ctx);
  const lock = reticle("#c25a12", 1.35, FOE);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.15, 20, 10, 1, true), additive(def.bright, 0));
  column.position.set(FOE.x, 10, FOE.z);
  const head = new THREE.Group();
  part(head, new THREE.BoxGeometry(1, 1, 1), "#42404b", [0, 0, 0], [1.25, 0.8, 0.8]);
  part(head, new THREE.BoxGeometry(1, 1, 1), "#6e4631", [0, 0.9, 0], [0.16, 1.6, 0.16]);
  head.position.set(FOE.x, 8, FOE.z);
  const crater = ring("#4a2f1e", 0.15, 1.5, 0); crater.position.copy(FOE); crater.position.y = 0.055;
  const waves = [ring("#ffb24d", 0.3, 0.7, 0), ring(def.bright, 0.3, 0.5, 0)];
  for (const w of waves) { w.position.copy(FOE); w.position.y = 0.065; }
  g.add(lock, column, head, crater, ...waves);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      lock.userData.outer.material.opacity = t;
      lock.userData.outer.scale.setScalar(1.9 - 0.9 * easeOut(t));
      setOpacity(lock.userData.brackets, t * 0.9);
      column.material.opacity = 0.12 * t;
      head.visible = t > 0.35;
      head.position.y = 8 - 5 * clamp01((t - 0.35) / 0.65);
      head.rotation.y = t * 2;
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const drop = clamp01(t / 0.1);
    head.visible = drop < 1;
    head.position.y = 3 * (1 - easeIn(drop)) + 0.6;
    const flash = Math.max(0, 1 - t * 7);
    column.material.opacity = flash * 0.8;
    const hit = clamp01((t - 0.08) / 0.9);
    crater.material.opacity = hit > 0 ? 0.7 * (1 - clamp01((t - 0.7) / 0.3)) : 0;
    crater.scale.setScalar(0.5 + easeOut(clamp01(hit * 3)) * 0.6);
    waves.forEach((w, i) => {
      const wt = clamp01((hit - i * 0.1) / 0.55);
      w.scale.setScalar(1 + easeOut(wt) * 5.5);
      w.material.opacity = wt > 0 && wt < 1 ? (1 - wt) * (0.95 - i * 0.2) : 0;
    });
    lock.userData.outer.material.opacity = 1 - t; setOpacity(lock.userData.brackets, (1 - t) * 0.6);
  } };
};

/* ------------------------------------------------------------- public */

/** Builds the effect for one ability cast; unknown ids fall back to a plain marked ring. */
export function buildAbilityEffect(abilityId, ctx) {
  const builder = BUILDERS[abilityId] ?? BUILDERS.bladenova;
  const p = { radius: ctx.radius, telegraph: ctx.telegraph, impact: ctx.impact };
  return builder(p, { color: ctx.color, bright: ctx.bright }, ctx);
}

/** Frees everything an effect allocated; shared cached materials from part() are left alone. */
export function disposeAbilityEffect(effect) {
  effect.group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material && child.material.transparent) child.material.dispose();
  });
  effect.group.removeFromParent();
}

/** Windup: the Jev gathers, leans back, then throws the cast out on the discharge. */
export function poseCast(model, ms, telegraph, impact, overhead) {
  const { arms, body } = model;
  if (ms < 0 || arms.length < 2 || body === undefined) return;
  if (ms > telegraph + impact) return;
  const wind = clamp01(ms / Math.max(1, telegraph));
  const after = clamp01((ms - telegraph) / 260);
  const gather = easeOut(wind) * (1 - after);
  const throwOut = Math.sin(after * Math.PI) * (ms >= telegraph ? 1 : 0);
  for (const [i, arm] of arms.entries()) {
    const side = i === 0 ? -1 : 1;
    arm.rotation.x = overhead ? -2.5 * gather - 0.6 * throwOut : -1.1 * gather - 1.1 * throwOut;
    arm.rotation.z = side * (0.35 + 0.5 * gather - 0.35 * throwOut);
  }
  body.rotation.x = -0.18 * gather + 0.3 * throwOut;
  body.position.y += 0.12 * gather;
}
