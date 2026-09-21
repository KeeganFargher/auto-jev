import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createColonist, createHut, part } from "./world-models.js";
import { dressHero, animateHero } from "./hero-models.js";
import { animateColonist } from "./colonist-activity.js";

// Mirrors src/heroes.ts; the lab is a browser page and cannot import the TypeScript source.
const JEVS = [
  { id: "veyra",  name: "Veyra",  ability: "Chain Bolt",  role: "Damage / Control",    color: "#9b7cff", bright: "#a5eaff" },
  { id: "thorn",  name: "Thorn",  ability: "Rootwall",    role: "Tank / Defence",      color: "#5f9c4f", bright: "#b8f27c" },
  { id: "kael",   name: "Kael",   ability: "Hunt",        role: "Melee / Snowball",    color: "#d8443a", bright: "#ff665b" },
  { id: "elowen", name: "Elowen", ability: "Renewal",     role: "Support / Healing",   color: "#7fd6b3", bright: "#baffdf" },
  { id: "nyx",    name: "Nyx",    ability: "Shadowstep",  role: "Utility / Mobility",  color: "#5b5f8f", bright: "#c3adff" },
  { id: "orun",   name: "Orun",   ability: "Temper",      role: "Support / Siege",     color: "#e0a040", bright: "#ffd37c" },
];
const DEFAULTS = {
  veyra:  { radius: 7.5, telegraph: 650, impact: 1500 },
  thorn:  { radius: 6.5, telegraph: 800, impact: 2200 },
  kael:   { radius: 9.0, telegraph: 500, impact: 1100 },
  elowen: { radius: 8.0, telegraph: 400, impact: 2600 },
  nyx:    { radius: 5.5, telegraph: 450, impact: 1200 },
  orun:   { radius: 7.0, telegraph: 900, impact: 1600 },
};

/* ---------------------------------------------------------------- scene */
const stage = document.getElementById("stage");
const scene = new THREE.Scene();
scene.background = new THREE.Color("#b9d9db");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
stage.append(renderer.domElement);

const camera = new THREE.OrthographicCamera(-20, 20, 15, -15, 0.1, 1000);
camera.position.set(25, 30, 32);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enablePan = false;

scene.add(new THREE.HemisphereLight("#e5f5ff", "#8a8052", 2.4));
const sun = new THREE.DirectionalLight("#fff0d1", 3.2);
sun.position.set(-18, 36, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 100 });
sun.shadow.normalBias = 0.045;
scene.add(sun);

// Flat stand-in for the game's terrain mesh, using its grass tint.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: "#b3c788", roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight, aspect = w / h;
  camera.right = Math.max(18, 13 * aspect); camera.left = -camera.right;
  camera.top = camera.right / aspect; camera.bottom = -camera.top;
  camera.zoom = 1.45; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
new ResizeObserver(resize).observe(stage);

/* ------------------------------------------------------------- figures */
const ENEMY = "#b4483f", ALLY = "#3f7fc4";
const extras = [];
function soldier(x, z, colour, role, index) {
  const m = createColonist(index, colour, role, null, `lab${index}`);
  m.group.position.set(x, 0, z);
  m.group.rotation.y = Math.atan2(-x, -z);
  m.role = role; m.fighting = false; m.paused = false;
  m.activity = { working: false, tool: null };
  scene.add(m.group); extras.push(m); return m;
}
// A loose enemy pack plus a couple of allies, purely so the AoE has something to read against.
const RING = [[4.5, 2.2], [6.4, -1.1], [3.1, -3.8], [-1.6, 5.2], [7.8, 3.4], [-4.4, -4.6], [1.2, 6.8], [-6.2, 1.8]];
RING.forEach(([x, z], i) => soldier(x, z, ENEMY, i % 3 === 0 ? "archer" : "infantry", i + 2));
soldier(-3.2, 2.6, ALLY, "infantry", 20);
soldier(-2.4, -2.2, ALLY, "archer", 21);
const hut = createHut(); hut.position.set(-8.5, 0, -7.5); hut.scale.setScalar(1.6); scene.add(hut);

let jev = null, jevModel = null;
function spawnJev(def) {
  if (jevModel !== null) scene.remove(jevModel.group);
  const m = createColonist(0, "#e8e2d2", "hero", def.color, def.id);
  dressHero(m, { id: def.id, color: def.color });
  m.group.position.set(0, 0, 0);
  m.role = "hero"; m.fighting = false; m.paused = false;
  m.activity = { working: false, tool: null };
  scene.add(m.group);
  jevModel = m; jev = def;
}

/* --------------------------------------------------------- effect kit */
// Additive is for the small hot bits only. On this bright grass a large additive decal saturates
// straight to white and throws away the Jev's colour, so every floor marker blends normally.
const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, side: THREE.DoubleSide,
  depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
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
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
function setOpacity(object, value) {
  object.traverse((child) => { if (child.material) child.material.opacity = Math.max(0, value); });
}

/* ------------------------------------------------------------ abilities
   Each builder returns { group, update(ms) }. `p` is the tuning: radius,
   telegraph (windup ms), impact (discharge + decay ms). Total life is
   telegraph + impact. Phase A is the floor telegraph, phase B the payoff. */

const BUILDERS = {
  // Sky-called lightning: rim fills, column drops, arcs whip out to each target.
  veyra(p, def) {
    const g = new THREE.Group();
    const area = decal(additive(def.bright, 0).clone(), p.radius * 2);
    area.material.map = softDisc(); area.material.needsUpdate = true;
    const rim = sweep(def.bright, p.radius - 0.28, p.radius, 0.95);
    const marks = ticks(def.bright, p.radius - 0.75, 12, 0.7, 0.14);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.5, 22, 12, 1, true), additive(def.bright, 0));
    column.position.y = 11;
    const shock = ring(def.bright, p.radius * 0.1, p.radius * 0.16, 0);
    const bolts = new THREE.Group();
    RING.forEach(([x, z]) => {
      if (Math.hypot(x, z) > p.radius) return;
      const target = new THREE.Vector3(x, 0.9, z);
      const points = Array.from({ length: 7 }, (_, i) => {
        const at = new THREE.Vector3(0, 2.4, 0).lerp(target, i / 6);
        if (i > 0 && i < 6) { at.x += (i % 2 ? 0.5 : -0.5); at.y += (i % 2 ? 0.45 : -0.3); }
        return at;
      });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 18, 0.085, 4, false), additive("#ffffff", 0));
      const pool = ring(def.bright, 0.45, 0.72, 0);
      pool.position.set(x, 0.06, z);
      bolts.add(tube, pool);
    });
    g.add(area, rim, marks, column, shock, bolts);
    return { group: g, update(ms) {
      if (ms < p.telegraph) {
        const t = ms / p.telegraph;
        rim.userData.cut(t); area.material.opacity = 0.42 * t; setOpacity(marks, 0.35 + 0.5 * Math.abs(Math.sin(ms * 0.012)));
        return;
      }
      const t = clamp01((ms - p.telegraph) / p.impact);
      rim.userData.cut(1);
      // Flash, then bleed away.
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
  },

  // Roots burst along a fat arc facing the enemy, then stand as a wall.
  thorn(p, def) {
    const g = new THREE.Group();
    const span = Math.PI * 0.85, face = Math.atan2(4, 3);
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
      root.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
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
        // Overshoot then settle: roots punch up and rock back.
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
  },

  // A lane opens toward the quarry, then Kael crosses it in one streak.
  kael(p, def) {
    const g = new THREE.Group();
    const target = new THREE.Vector3(6.4, 0, -1.1);
    const dir = target.clone().normalize(), len = target.length();
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(2.3, len), flat(def.color, 0));
    lane.rotation.x = -Math.PI / 2; lane.rotation.z = -Math.atan2(dir.z, dir.x) - Math.PI / 2;
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
  },
};

// A calm field that breathes outward, lifting motes and tagging each ally it covers.
BUILDERS.elowen = (p, def) => {
  const g = new THREE.Group();
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
  for (const m of extras) {
    if (m.group.position.length() > p.radius) continue;
    const disc = ring(def.bright, 0.42, 0.58, 0);
    disc.position.copy(m.group.position); disc.position.y = 0.07;
    tags.add(disc);
  }
  g.add(area, rim, ...pulses, motes, tags);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      area.material.opacity = 0.34 * t; rim.material.opacity = t * 0.8;
      rim.scale.setScalar(0.85 + 0.15 * easeOut(t));
      return;
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
BUILDERS.nyx = (p, def) => {
  const g = new THREE.Group();
  const land = new THREE.Vector3(-3.4, 0, 6.4);
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
  exitArea.material.map = softDisc(); exitArea.material.needsUpdate = true; exitArea.position.copy(land); exitArea.position.y = 0.05;
  const exitRing = ring(def.bright, 0.3, 0.55, 0); exitRing.position.copy(land); exitRing.position.y = 0.06;
  const feathers = new THREE.Group();
  for (let i = 0; i < 14; i += 1) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 3), additive(def.bright, 0));
    f.userData.a = (i / 14) * Math.PI * 2; feathers.add(f);
  }
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
      f.position.set(land.x + Math.cos(f.userData.a) * d, 0.5 + Math.sin(arrive * Math.PI) * 1.4, land.z + Math.sin(f.userData.a) * d);
      f.rotation.set(arrive * 2.2, f.userData.a, 0.8);
      f.material.opacity = arrive > 0 ? Math.sin(arrive * Math.PI) * 0.9 : 0;
    });
  } };
};

// An anvil mark, a held hammer, then concentric shockwaves and embers.
BUILDERS.orun = (p, def) => {
  const g = new THREE.Group();
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

/* ------------------------------------------------------------- impacts
   Units struck by an ability brace away from it and take a chest ring, the
   same reaction the game plays off effects.hitAt / hitFromX. */

const flashes = [];
function strike(model, origin, power, now) {
  model.hitStarted = now;
  model.hitPower = power;
  const away = model.group.position.clone().sub(origin); away.y = 0;
  const length = away.length() || 1;
  model.hitDir = { x: away.x / length, z: away.z / length };
  const group = new THREE.Group();
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.34, 20), additive("#ffd7ad", 0.95));
  group.add(shock);
  group.position.copy(model.group.position); group.position.y = 0.95;
  group.lookAt(origin.x, 0.95, origin.z);
  scene.add(group);
  flashes.push({ group, material: shock.material, start: now });
}
function updateFlashes(now) {
  for (let i = flashes.length - 1; i >= 0; i -= 1) {
    const flash = flashes[i];
    const t = (now - flash.start) / 300;
    if (t >= 1) { scene.remove(flash.group); flash.material.dispose(); flashes.splice(i, 1); continue; }
    flash.group.children[0].scale.setScalar(1 + t * 2.6);
    flash.material.opacity = (1 - t) * (1 - t) * 0.95;
  }
}
const nearest = (at) => extras.reduce((best, m) =>
  m.group.position.distanceTo(at) < best.group.position.distanceTo(at) ? m : best, extras[0]);
const enemies = () => extras.slice(0, RING.length);

/** Who an ability connects with and when, expressed as a fraction of its impact phase. */
function hitPlan(ability, p) {
  const origin = new THREE.Vector3(0, 0, 0);
  const within = (m, r) => m.group.position.length() <= r;
  const frac = (m, r) => Math.min(0.35, (m.group.position.length() / r) * 0.3);
  switch (ability.shape) {
    case "Single":
      return ability.id === "mend" ? [] : [{ model: nearest(FOE), at: 0.26, origin }];
    case "Dash":
      return [{ model: nearest(FOE), at: 0.3, origin }];
    case "Blink": case "Shield": case "Aura":
      return [];
    case "Chain":
      return enemies().filter((m) => within(m, p.radius)).map((m, i) => ({ model: m, at: 0.08 + i * 0.07, origin }));
    case "Cone": {
      const face = Math.atan2(2.2, 5), span = Math.PI * 0.42;
      return enemies().filter((m) => {
        if (!within(m, p.radius)) return false;
        let delta = Math.atan2(m.group.position.z, m.group.position.x) - face;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        return Math.abs(delta) <= span / 2;
      }).map((m) => ({ model: m, at: (m.group.position.length() / p.radius) * 0.4, origin }));
    }
    case "Sweep":
      return enemies().filter((m) => within(m, p.radius)).map((m) => {
        let a = Math.atan2(m.group.position.z, m.group.position.x) + 0.6;
        while (a < 0) a += Math.PI * 2;
        return { model: m, at: Math.min(0.6, (a / (Math.PI * 1.15)) * 0.62), origin };
      });
    case "Line":
      return enemies().filter((m) => Math.abs(m.group.position.length() - p.radius) < 2.2)
        .map((m, i) => ({ model: m, at: 0.1 + i * 0.05, origin }));
    default:
      return enemies().filter((m) => within(m, p.radius)).map((m) => ({ model: m, at: frac(m, p.radius), origin }));
  }
}

/* --------------------------------------------------------------- state */
const params = { radius: 0, telegraph: 0, impact: 0 };
let active = null, activeStart = 0, looping = true, slow = false, spinning = false;

function cast() {
  if (active !== null) scene.remove(active.group);
  const ability = KITS[jev.id][slot];
  active = ability.build(params, jev);
  active.plan = hitPlan(ability, params).map((entry) => ({ ...entry, fired: false }));
  scene.add(active.group);
  activeStart = clock;
}

/** Windup: the Jev gathers, leans back, then throws the cast out on the discharge. */
function poseCast(model, ms) {
  const { arms, body } = model;
  if (ms < 0) return;
  const total = params.telegraph + params.impact;
  if (ms > total) return;
  const wind = clamp01(ms / Math.max(1, params.telegraph));
  const after = clamp01((ms - params.telegraph) / 260);
  const gather = easeOut(wind) * (1 - after);
  const throwOut = Math.sin(after * Math.PI) * (ms >= params.telegraph ? 1 : 0);
  const overhead = jev.id === "veyra" || jev.id === "elowen" || jev.id === "orun";
  for (const [i, arm] of arms.entries()) {
    const side = i === 0 ? -1 : 1;
    arm.rotation.x = overhead ? -2.5 * gather - 0.6 * throwOut : -1.1 * gather - 1.1 * throwOut;
    arm.rotation.z = side * (0.35 + 0.5 * gather - 0.35 * throwOut);
  }
  body.rotation.x = -0.18 * gather + 0.3 * throwOut;
  body.position.y += 0.12 * gather;
}

/* ------------------------------------------------------------ controls */
const jevList = document.getElementById("jevs");
const buttons = JEVS.map((def) => {
  const b = document.createElement("button");
  b.className = "jev"; b.type = "button"; b.style.color = def.color;
  b.setAttribute("aria-pressed", "false");
  b.innerHTML = `<i class="dot"></i><b>${def.name}</b>`;
  const label = document.createElement("div");
  label.innerHTML = `<b>${def.name}</b><span>${def.ability}</span>`;
  b.innerHTML = ""; b.append(Object.assign(document.createElement("i"), { className: "dot" }), label);
  jevList.append(b); return b;
});
const sliders = {
  radius: document.getElementById("radius"), telegraph: document.getElementById("telegraph"), impact: document.getElementById("impact"),
};
const outputs = {
  radius: document.getElementById("radiusOut"), telegraph: document.getElementById("telegraphOut"), impact: document.getElementById("impactOut"),
};
const spec = document.getElementById("spec");
function syncReadouts() {
  outputs.radius.textContent = `${params.radius} tiles`;
  outputs.telegraph.textContent = `${params.telegraph} ms`;
  outputs.impact.textContent = `${params.impact} ms`;
  const ability = KITS[jev.id][slot];
  spec.innerHTML = `<b>${jev.name} · ${ability.name}</b><br />${ability.shape} · ${ability.cooldown}s cooldown<br /><br />` +
    `<code>{ id: "${ability.id}", shape: "${ability.shape}", cooldown: ${ability.cooldown}, radius: ${params.radius}, telegraph: ${params.telegraph}, impact: ${params.impact} }</code>`;
}
for (const key of Object.keys(sliders)) {
  sliders[key].addEventListener("input", () => {
    params[key] = Number(sliders[key].value);
    syncReadouts();
    cast();
  });
}
let select = () => {};
const toggle = (id, get, set) => {
  const el = document.getElementById(id);
  el.addEventListener("click", () => { set(!get()); el.setAttribute("aria-pressed", String(get())); });
};
toggle("loop", () => looping, (v) => { looping = v; });
toggle("slow", () => slow, (v) => { slow = v; });
toggle("spin", () => spinning, (v) => { spinning = v; controls.autoRotate = v; controls.autoRotateSpeed = 0.6; });
document.getElementById("cast").addEventListener("click", cast);
addEventListener("keydown", (event) => {
  if (event.code === "Space") { event.preventDefault(); cast(); return; }
  const index = Number(event.key) - 1;
  if (index >= 0 && index < JEVS.length) select(JEVS[index]);
});

/* ---------------------------------------------------------------- loop */
let clock = 0, previous = performance.now();
function frame(now) {
  const delta = Math.min(64, now - previous); previous = now;
  clock += delta * (slow ? 0.25 : 1);
  for (const m of extras) animateColonist(m, clock, 0, false, false, false);
  if (jevModel !== null) {
    animateColonist(jevModel, clock, 0, false, false, false);
    animateHero(jevModel, clock, false);
    if (active !== null) poseCast(jevModel, clock - activeStart);
  }
  if (active !== null) {
    const ms = clock - activeStart, total = params.telegraph + params.impact;
    if (ms > total + 350) {
      scene.remove(active.group); active = null;
      if (looping) setTimeout(preview, 260);
    } else {
      active.update(Math.max(0, ms));
      for (const entry of active.plan) {
        if (entry.fired || ms < params.telegraph + entry.at * params.impact) continue;
        entry.fired = true;
        strike(entry.model, entry.origin, 5 + params.radius * 0.6, clock);
      }
    }
  }
  updateFlashes(clock);
  updateBar();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
resize();
requestAnimationFrame(frame);

/* ------------------------------------------------------- effect library
   Archetypes that are not tied to one Jev: each takes the selected caster's
   colours, so any of these can be tried on any hero. */

const EXTRA = {};

// Repeated bolts hammer random points inside the ring for the whole duration.
EXTRA.thunderstorm = (p, def) => {
  const g = new THREE.Group();
  const area = decal(flat(def.color, 0), p.radius * 2);
  area.material.map = softDisc(); area.material.needsUpdate = true;
  const rim = sweep(def.color, p.radius - 0.28, p.radius, 0.9);
  const marks = ticks(def.bright, p.radius - 0.8, 16, 0.65, 0.12);
  const STRIKES = 11;
  const bolts = [];
  for (let i = 0; i < STRIKES; i += 1) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (p.radius - 0.6);
    const at = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.6, 18, 8, 1, true), additive(def.bright, 0));
    column.position.set(at.x, 9, at.z);
    const pool = ring(def.bright, 0.5, 0.85, 0); pool.position.set(at.x, 0.07, at.z);
    const scorch = ring("#3c2f4a", 0.1, 0.58, 0); scorch.position.set(at.x, 0.055, at.z);
    g.add(column, pool, scorch);
    bolts.push({ column, pool, scorch, at: i / STRIKES });
  }
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
EXTRA.meteor = (p, def) => {
  const g = new THREE.Group();
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
  g.add(shade, rim, marks, rock, crater, ...waves, debris);
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

// A volley arcs in and lands in waves across the marked circle.
EXTRA.arrowstorm = (p, def) => {
  const g = new THREE.Group();
  const area = decal(flat(def.color, 0), p.radius * 2);
  area.material.map = softDisc(); area.material.needsUpdate = true;
  const rim = sweep(def.color, p.radius - 0.22, p.radius, 0.9);
  const shafts = [];
  const COUNT = 46;
  for (let i = 0; i < COUNT; i += 1) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * p.radius;
    const shaft = new THREE.Group();
    part(shaft, new THREE.BoxGeometry(1, 1, 1), "#c8b48a", [0, 0.42, 0], [0.045, 0.85, 0.045]);
    part(shaft, new THREE.ConeGeometry(0.08, 0.22, 4), "#e8e2d2", [0, 0, 0], [1, 1, 1]).rotation.x = Math.PI;
    shaft.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    shaft.rotation.z = 0.42; shaft.visible = false;
    g.add(shaft);
    shafts.push({ shaft, at: Math.random(), mark: (() => { const m = ring(def.bright, 0.12, 0.3, 0); m.position.set(Math.cos(a) * r, 0.06, Math.sin(a) * r); g.add(m); return m; })() });
  }
  g.add(area, rim);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      rim.userData.cut(t); area.material.opacity = 0.3 * t;
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    rim.userData.cut(1);
    const fade = 1 - clamp01((t - 0.78) / 0.22);
    area.material.opacity = 0.3 * fade; rim.material.opacity = 0.9 * fade;
    for (const entry of shafts) {
      const st = clamp01((t - entry.at * 0.66) / 0.2);
      if (st <= 0) { entry.shaft.visible = false; entry.mark.material.opacity = 0; continue; }
      entry.shaft.visible = true;
      // Fall in, stick, then fade with the field.
      entry.shaft.position.y = st < 1 ? 13 * (1 - easeIn(st)) : 0;
      entry.shaft.scale.setScalar(st < 1 ? 1 : 1);
      entry.mark.material.opacity = st >= 1 ? 0.8 * fade : 0;
      entry.mark.scale.setScalar(st >= 1 ? 1 + (1 - fade) : 1);
      if (st >= 1 && fade <= 0.02) entry.shaft.visible = false;
    }
  } };
};

// A wedge opens in front of the caster and a wave rolls down it.
EXTRA.cone = (p, def) => {
  const g = new THREE.Group();
  const span = Math.PI * 0.42, face = Math.atan2(2.2, 5);
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
    puff.userData = { a: -face - span / 2 + Math.random() * span, r: 0.6 + Math.random() * (p.radius - 0.6), o: Math.random() * 0.35 };
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
EXTRA.beam = (p, def) => {
  const g = new THREE.Group();
  const span = Math.PI * 1.15, from = -0.6;
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
EXTRA.maelstrom = (p, def) => {
  const g = new THREE.Group();
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
EXTRA.fissure = (p, def) => {
  const g = new THREE.Group();
  const heading = Math.atan2(3, 5), len = p.radius * 2;
  const guide = new THREE.Mesh(new THREE.PlaneGeometry(0.9, len), flat(def.color, 0));
  guide.rotation.x = -Math.PI / 2; guide.rotation.z = -heading; guide.position.y = 0.05;
  const SEGMENTS = 12;
  const cracks = [];
  for (let i = 0; i < SEGMENTS; i += 1) {
    const along = (i / (SEGMENTS - 1) - 0.5) * len;
    const jitter = ((i % 3) - 1) * 0.28;
    const x = Math.cos(heading) * jitter + Math.sin(heading) * along;
    const z = -Math.sin(heading) * jitter + Math.cos(heading) * along;
    const gap = new THREE.Mesh(new THREE.PlaneGeometry(0.75, len / SEGMENTS + 0.25), flat("#1d1410", 0));
    gap.rotation.x = -Math.PI / 2; gap.rotation.z = -heading + jitter * 0.4;
    gap.position.set(x, 0.06, z);
    const glowStrip = new THREE.Mesh(new THREE.PlaneGeometry(0.3, len / SEGMENTS), additive(def.bright, 0));
    glowStrip.rotation.copy(gap.rotation); glowStrip.position.set(x, 0.07, z);
    const shard = new THREE.Group();
    for (const side of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, len / SEGMENTS * 0.85), flat("#6b5540", 0));
      slab.position.set(side * 0.5, 0, 0); slab.rotation.z = side * 0.5;
      shard.add(slab);
    }
    shard.position.set(x, 0, z); shard.rotation.y = -gap.rotation.z;
    g.add(gap, glowStrip, shard);
    cracks.push({ gap, glowStrip, shard, at: i / SEGMENTS });
  }
  g.add(guide);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      guide.material.opacity = 0.55 * t;
      guide.scale.y = Math.max(0.01, t);
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
      crack.shard.children.forEach((slab, side) => { slab.rotation.z = (side ? 1 : -1) * (0.15 + open * 0.55); });
    }
  } };
};

// A dome closes over the area and holds.
EXTRA.dome = (p, def) => {
  const g = new THREE.Group();
  const base = ring(def.color, p.radius - 0.3, p.radius, 0);
  const marks = ticks(def.bright, p.radius - 0.85, 10, 0.75, 0.14);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(p.radius, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: def.bright, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
  );
  const lattice = new THREE.Mesh(
    new THREE.SphereGeometry(p.radius * 1.004, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0, wireframe: true, depthWrite: false, toneMapped: false }),
  );
  const flare = ring(def.bright, p.radius - 0.15, p.radius + 0.1, 0);
  g.add(base, marks, shell, lattice, flare);
  return { group: g, update(ms) {
    if (ms < p.telegraph) {
      const t = ms / p.telegraph;
      base.material.opacity = t; setOpacity(marks, t * 0.8);
      shell.scale.set(1, 0.05 + 0.2 * t, 1);
      return;
    }
    const t = clamp01((ms - p.telegraph) / p.impact);
    const rise = clamp01(t / 0.22);
    // Overshoot on the way up so the dome snaps into place.
    const h = easeOut(rise) * 1.08 - 0.08 * clamp01((t - 0.22) / 0.2);
    shell.scale.set(1, Math.max(0.05, h), 1);
    lattice.scale.copy(shell.scale);
    const hold = 1 - clamp01((t - 0.72) / 0.28);
    shell.material.opacity = (0.17 + 0.05 * Math.sin(ms * 0.006)) * rise * hold;
    lattice.material.opacity = 0.35 * rise * hold;
    base.material.opacity = hold; setOpacity(marks, 0.55 * hold);
    flare.material.opacity = rise < 1 ? (1 - rise) * 0.9 : 0;
    flare.scale.setScalar(0.5 + rise * 0.6);
  } };
};

// Blades whirl out from the caster behind a shockwave.
EXTRA.bladenova = (p, def) => {
  const g = new THREE.Group();
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

/* --------------------------------------------- single-target effects
   These lock onto one unit instead of painting an area, so a kit can mix
   spike damage and control in among the big circles. */

const FOE = new THREE.Vector3(6.4, 0, -1.1);
const FRIEND = new THREE.Vector3(-3.2, 0, 2.6);

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

// A fast single bolt: lock on, snap a projectile across, small hard burst.
EXTRA.bolt = (p, def) => {
  const g = new THREE.Group();
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
    shot.lookAt(FOE.x, 1.0, FOE.z);
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
EXTRA.snare = (p, def) => {
  const g = new THREE.Group();
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
    // Tether stretches from the caster to the snared unit for as long as it holds.
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
    setOpacity(cage, hold);
    pool.material.opacity = 0.7 * grow * hold;
    pool.scale.setScalar(1 + Math.sin(t * 9) * 0.05);
    lock.userData.outer.material.opacity = hold;
    setOpacity(lock.userData.brackets, 0.7 * hold);
    lock.rotation.y = t * 0.8;
  } };
};

// A held beam onto one ally, lifting motes off them while it runs.
EXTRA.mend = (p, def) => {
  const g = new THREE.Group();
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
EXTRA.smite = (p, def) => {
  const g = new THREE.Group();
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

/* ----------------------------------------------------------------- kits
   Three abilities per Jev, deliberately mixed: a cheap single-target poke,
   a signature on a medium cooldown, and a long-cooldown ultimate. */

const KITS = {
  veyra: [
    { id: "bolt",        name: "Arc Bolt",     shape: "Single",  cooldown: 6,  build: EXTRA.bolt,        tuning: { radius: 3.0, telegraph: 320, impact: 900 } },
    { id: "veyra",       name: "Chain Bolt",   shape: "Chain",   cooldown: 14, build: BUILDERS.veyra,    tuning: { radius: 7.5, telegraph: 650, impact: 1500 } },
    { id: "thunderstorm",name: "Thunderstorm", shape: "AoE",     cooldown: 38, build: EXTRA.thunderstorm,tuning: { radius: 8.5, telegraph: 700, impact: 2600 } },
  ],
  thorn: [
    { id: "snare",       name: "Root Snare",   shape: "Single",  cooldown: 8,  build: EXTRA.snare,       tuning: { radius: 3.0, telegraph: 420, impact: 1800 } },
    { id: "thorn",       name: "Rootwall",     shape: "Line",    cooldown: 20, build: BUILDERS.thorn,    tuning: { radius: 6.5, telegraph: 800, impact: 2200 } },
    { id: "fissure",     name: "Upheaval",     shape: "Line",    cooldown: 42, build: EXTRA.fissure,     tuning: { radius: 7.0, telegraph: 750, impact: 2000 } },
  ],
  kael: [
    { id: "kael",        name: "Hunt",         shape: "Dash",    cooldown: 10, build: BUILDERS.kael,     tuning: { radius: 9.0, telegraph: 500, impact: 1100 } },
    { id: "bladenova",   name: "Blade Nova",   shape: "AoE",     cooldown: 22, build: EXTRA.bladenova,   tuning: { radius: 7.5, telegraph: 600, impact: 1600 } },
    { id: "cone",        name: "Rampage",      shape: "Cone",    cooldown: 36, build: EXTRA.cone,        tuning: { radius: 9.0, telegraph: 650, impact: 1500 } },
  ],
  elowen: [
    { id: "mend",        name: "Mend",         shape: "Single",  cooldown: 5,  build: EXTRA.mend,        tuning: { radius: 3.0, telegraph: 300, impact: 1900 } },
    { id: "elowen",      name: "Renewal",      shape: "Aura",    cooldown: 18, build: BUILDERS.elowen,   tuning: { radius: 8.0, telegraph: 400, impact: 2600 } },
    { id: "dome",        name: "Sanctuary",    shape: "Shield",  cooldown: 45, build: EXTRA.dome,        tuning: { radius: 6.5, telegraph: 550, impact: 2600 } },
  ],
  nyx: [
    { id: "nyx",         name: "Shadowstep",   shape: "Blink",   cooldown: 12, build: BUILDERS.nyx,      tuning: { radius: 5.5, telegraph: 450, impact: 1200 } },
    { id: "beam",        name: "Umbral Sweep", shape: "Sweep",   cooldown: 24, build: EXTRA.beam,        tuning: { radius: 9.5, telegraph: 600, impact: 1900 } },
    { id: "maelstrom",   name: "Nightfall",    shape: "AoE",     cooldown: 40, build: EXTRA.maelstrom,   tuning: { radius: 7.5, telegraph: 700, impact: 2200 } },
  ],
  orun: [
    { id: "smite",       name: "Sunder",       shape: "Single",  cooldown: 7,  build: EXTRA.smite,       tuning: { radius: 3.0, telegraph: 520, impact: 1300 } },
    { id: "orun",        name: "Temper",       shape: "AoE",     cooldown: 16, build: BUILDERS.orun,     tuning: { radius: 7.0, telegraph: 900, impact: 1600 } },
    { id: "meteor",      name: "Hammerfall",   shape: "AoE",     cooldown: 44, build: EXTRA.meteor,      tuning: { radius: 6.5, telegraph: 1100, impact: 1800 } },
  ],
};
// arrowstorm stays built but unassigned — a spare if one of these gets cut.

/* ------------------------------------------------------- ability bar */
let slot = 0;
const readyAt = {};          // `${jevId}:${index}` -> lab clock time the cooldown ends
const bar = document.getElementById("bar");
const slotKey = (index) => `${jev.id}:${index}`;
const remaining = (index) => Math.max(0, (readyAt[slotKey(index)] ?? 0) - clock);

function renderBar() {
  bar.replaceChildren();
  KITS[jev.id].forEach((ability, index) => {
    const b = document.createElement("button");
    b.className = "slot"; b.type = "button"; b.style.color = jev.color;
    b.setAttribute("aria-pressed", String(index === slot));
    b.innerHTML = `<span class="key">${"QWE"[index]}</span><b>${ability.name}</b>` +
      `<span class="meta"><i class="shape">${ability.shape}</i><i class="cd">${ability.cooldown}s</i></span>` +
      `<span class="sweep"></span><span class="count"></span>`;
    b.addEventListener("click", () => fire(index));
    bar.append(b);
  });
}
function updateBar() {
  [...bar.children].forEach((b, index) => {
    const left = remaining(index), total = KITS[jev.id][index].cooldown * 1000;
    const fraction = total === 0 ? 0 : left / total;
    b.classList.toggle("cooling", left > 0);
    b.setAttribute("aria-pressed", String(index === slot));
    b.querySelector(".sweep").style.background = left > 0
      ? `conic-gradient(from 0deg, rgba(8,11,12,.74) ${fraction * 360}deg, transparent 0)` : "none";
    b.querySelector(".count").textContent = left > 0 ? (left / 1000).toFixed(1) : "";
  });
}
/** Loads a slot's tuning into the panel without touching its cooldown. */
function equip(index) {
  slot = index;
  Object.assign(params, KITS[jev.id][index].tuning);
  for (const key of Object.keys(sliders)) sliders[key].value = String(params[key]);
  syncReadouts();
}
/** Replays the selected ability for inspection; cooldowns keep draining underneath. */
function preview() { equip(slot); cast(); updateBar(); }
/** A real cast: refused while cooling, and starts the recharge when it lands. */
function fire(index) {
  equip(index);
  if (remaining(index) > 0) { updateBar(); return; }
  readyAt[slotKey(index)] = clock + KITS[jev.id][index].cooldown * 1000;
  cast();
  updateBar();
}

/* ------------------------------------------------------------ binding */
function current() { return KITS[jev.id][slot]; }
select = (def) => {
  spawnJev(def);
  buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(JEVS[i].id === def.id)));
  slot = 0; renderBar(); equip(0); preview();
};
buttons.forEach((b, i) => b.addEventListener("click", () => select(JEVS[i])));
// Sliders retune the selected slot so edits survive the next cast.
for (const key of Object.keys(sliders)) {
  sliders[key].addEventListener("input", () => { current().tuning[key] = Number(sliders[key].value); });
}
addEventListener("keydown", (event) => {
  const index = "qwe".indexOf(event.key.toLowerCase());
  if (index >= 0) { event.preventDefault(); fire(index); }
});
document.getElementById("cast").addEventListener("click", preview);
select(JEVS[0]);
