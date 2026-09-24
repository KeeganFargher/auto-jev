import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Scene,
} from "three";

export type ParticleBlend = "glow" | "solid";

export interface ParticleStyle {
  blend: ParticleBlend;
  from: Color;
  to: Color;
  brightness: number;
  opacity: number;
  size: readonly [number, number];
  life: readonly [number, number];
  speed: readonly [number, number];
  cone: number;
  spread: number;
  gravity: number;
  drag: number;
  stretch: number;
  softness: number;
}

export interface ParticleSystem {
  emit(style: ParticleStyle, origin: Vector3, direction: Vector3, count: number): void;
  clear(): void;
  update(deltaSeconds: number): void;
  alive(): number;
  dispose(): void;
}

export interface ParticleTrail {
  follow(point: Vector3): void;
}

export interface SlotRange {
  start: number;
  count: number;
}

export interface SlotClaim {
  ranges: SlotRange[];
  next: number;
}

interface ParticleLayer {
  mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  buffer: InstancedInterleavedBuffer;
  capacity: number;
  next: number;
  expiries: Float32Array;
}

const STRIDE = 22;

const GLOW_CAPACITY = 4096;

const SOLID_CAPACITY = 2048;

const SIZE_JITTER = 0.5;

const UP = new Vector3(0, 1, 0);

const SIDE = new Vector3(1, 0, 0);

const TANGENT = new Vector3();

const BITANGENT = new Vector3();

const VERTEX_SHADER = `
uniform float uTime;
uniform float uEpoch;

attribute vec4 aOrigin;
attribute vec4 aVelocity;
attribute vec4 aFrom;
attribute vec4 aTo;
attribute vec4 aMotion;
attribute float aSoftness;
attribute float aEpoch;

varying vec2 vCorner;
varying vec4 vColor;
varying float vSoftness;

void main() {
  float age = uTime - aOrigin.w;
  float life = aVelocity.w;

  if (aEpoch < uEpoch || age < 0.0 || age >= life) {
    vCorner = vec2(0.0);
    vColor = vec4(0.0);
    vSoftness = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float progress = age / life;
  float drag = aMotion.w;
  float decay = exp(-drag * age);
  float reach = (1.0 - decay) / drag;
  vec3 fall = vec3(0.0, -aMotion.z, 0.0);
  vec3 point = aOrigin.xyz + aVelocity.xyz * reach + fall * (age - reach) / drag;
  vec3 heading = aVelocity.xyz * decay + fall * reach;

  vec4 center = viewMatrix * vec4(point, 1.0);
  vec2 streak = (viewMatrix * vec4(heading, 0.0)).xy * aTo.w;
  float streakLength = length(streak);
  vec2 along = streakLength > 0.0001 ? streak / streakLength : vec2(0.0, 1.0);
  vec2 across = vec2(along.y, -along.x);
  float size = mix(aMotion.x, aMotion.y, progress);
  center.xy += across * position.x * size + along * position.y * (size + streakLength);
  gl_Position = projectionMatrix * center;

  float fade = smoothstep(0.0, 0.06, progress) * (1.0 - progress * progress);
  vCorner = position.xy * 2.0;
  vColor = vec4(mix(aFrom.rgb, aTo.rgb, progress), aFrom.a * fade);
  vSoftness = aSoftness;
}
`;

const FRAGMENT_SHADER = `
varying vec2 vCorner;
varying vec4 vColor;
varying float vSoftness;

void main() {
  float radial = dot(vCorner, vCorner);

  if (radial >= 1.0) {
    discard;
  }

  float soft = (1.0 - radial) * (1.0 - radial);
  float crisp = smoothstep(1.0, 0.7, radial);
  gl_FragColor = vec4(vColor.rgb, vColor.a * mix(crisp, soft, vSoftness));

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function claimSlots(next: number, count: number, capacity: number): SlotClaim {
  if (count > capacity) {
    throw new Error(`a burst of ${count} particles does not fit a layer of ${capacity}`);
  }

  const first = Math.min(count, capacity - next);
  const ranges: SlotRange[] = [{ start: next, count: first }];

  if (first < count) {
    ranges.push({ start: 0, count: count - first });
  }

  return { ranges, next: (next + count) % capacity };
}

export function coneDirection(axis: Vector3, cone: number, u: number, v: number, out: Vector3): Vector3 {
  const cosine = 1 - u * (1 - Math.cos(cone));
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  const turn = v * Math.PI * 2;
  const helper = Math.abs(axis.y) < 0.99 ? UP : SIDE;
  const tangent = TANGENT.crossVectors(axis, helper).normalize();
  const bitangent = BITANGENT.crossVectors(axis, tangent);

  return out
    .copy(axis)
    .multiplyScalar(cosine)
    .addScaledVector(tangent, Math.cos(turn) * sine)
    .addScaledVector(bitangent, Math.sin(turn) * sine);
}

function lerp(range: readonly [number, number], amount: number): number {
  return range[0] + (range[1] - range[0]) * amount;
}

function createLayer(scene: Scene, capacity: number, blend: ParticleBlend, uniforms: ShaderMaterial["uniforms"]): ParticleLayer {
  const quad = new PlaneGeometry(1, 1);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(quad.getIndex());
  geometry.setAttribute("position", quad.getAttribute("position"));
  geometry.instanceCount = capacity;

  const buffer = new InstancedInterleavedBuffer(new Float32Array(capacity * STRIDE), STRIDE, 1);
  buffer.setUsage(DynamicDrawUsage);
  geometry.setAttribute("aOrigin", new InterleavedBufferAttribute(buffer, 4, 0));
  geometry.setAttribute("aVelocity", new InterleavedBufferAttribute(buffer, 4, 4));
  geometry.setAttribute("aFrom", new InterleavedBufferAttribute(buffer, 4, 8));
  geometry.setAttribute("aTo", new InterleavedBufferAttribute(buffer, 4, 12));
  geometry.setAttribute("aMotion", new InterleavedBufferAttribute(buffer, 4, 16));
  geometry.setAttribute("aSoftness", new InterleavedBufferAttribute(buffer, 1, 20));
  geometry.setAttribute("aEpoch", new InterleavedBufferAttribute(buffer, 1, 21));

  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: blend === "glow" ? AdditiveBlending : NormalBlending,
  });

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = blend === "glow" ? 2 : 1;
  scene.add(mesh);

  return { mesh, buffer, capacity, next: 0, expiries: new Float32Array(capacity) };
}

export function createParticleSystem(scene: Scene): ParticleSystem {
  const uniforms = { uTime: { value: 0 }, uEpoch: { value: 0 } };
  const glow = createLayer(scene, GLOW_CAPACITY, "glow", uniforms);
  const solid = createLayer(scene, SOLID_CAPACITY, "solid", uniforms);
  const heading = new Vector3();
  const offset = new Vector3();
  const from = new Color();
  const to = new Color();
  let now = 0;
  let epoch = 0;

  function write(layer: ParticleLayer, slot: number, style: ParticleStyle, origin: Vector3, direction: Vector3): void {
    const data = layer.buffer.array;
    const base = slot * STRIDE;
    const life = lerp(style.life, Math.random());
    const speed = lerp(style.speed, Math.random());
    const scale = 1 - SIZE_JITTER / 2 + Math.random() * SIZE_JITTER;
    coneDirection(direction, style.cone, Math.random(), Math.random(), heading);
    coneDirection(UP, Math.PI, Math.random(), Math.random(), offset).multiplyScalar(style.spread * Math.cbrt(Math.random()));

    data[base] = origin.x + offset.x;
    data[base + 1] = origin.y + offset.y;
    data[base + 2] = origin.z + offset.z;
    data[base + 3] = now;
    data[base + 4] = heading.x * speed;
    data[base + 5] = heading.y * speed;
    data[base + 6] = heading.z * speed;
    data[base + 7] = life;
    data[base + 8] = from.r;
    data[base + 9] = from.g;
    data[base + 10] = from.b;
    data[base + 11] = style.opacity;
    data[base + 12] = to.r;
    data[base + 13] = to.g;
    data[base + 14] = to.b;
    data[base + 15] = style.stretch;
    data[base + 16] = style.size[0] * scale;
    data[base + 17] = style.size[1] * scale;
    data[base + 18] = style.gravity;
    data[base + 19] = style.drag;
    data[base + 20] = style.softness;
    data[base + 21] = epoch;
    layer.expiries[slot] = now + life;
  }

  function aliveIn(layer: ParticleLayer): number {
    let count = 0;

    for (const expiry of layer.expiries) {
      if (expiry > now) {
        count += 1;
      }
    }

    return count;
  }

  return {
    emit(style, origin, direction, count) {
      if (style.drag <= 0) {
        throw new Error(`particle drag must be positive, got ${style.drag}`);
      }

      if (count <= 0) {
        return;
      }

      const layer = style.blend === "glow" ? glow : solid;
      const claim = claimSlots(layer.next, count, layer.capacity);
      from.copy(style.from).multiplyScalar(style.brightness);
      to.copy(style.to).multiplyScalar(style.brightness);

      for (const range of claim.ranges) {
        for (let slot = range.start; slot < range.start + range.count; slot += 1) {
          write(layer, slot, style, origin, direction);
        }

        layer.buffer.addUpdateRange(range.start * STRIDE, range.count * STRIDE);
      }

      layer.next = claim.next;
      layer.buffer.needsUpdate = true;
    },

    clear() {
      epoch += 1;
      uniforms.uEpoch.value = epoch;
      glow.expiries.fill(0);
      solid.expiries.fill(0);
    },

    update(deltaSeconds) {
      now += deltaSeconds;
      uniforms.uTime.value = now;
    },

    alive() {
      return aliveIn(glow) + aliveIn(solid);
    },

    dispose() {
      for (const layer of [glow, solid]) {
        layer.mesh.removeFromParent();
        layer.mesh.geometry.dispose();
        layer.mesh.material.dispose();
      }
    },
  };
}

export function createTrail(particles: ParticleSystem, style: ParticleStyle, spacing: number, start: Vector3): ParticleTrail {
  const last = start.clone();
  const backward = new Vector3();
  const spot = new Vector3();
  let carried = 0;

  return {
    follow(point) {
      const travelled = last.distanceTo(point);

      if (travelled > 0) {
        backward.subVectors(last, point).normalize();
        let along = spacing - carried;

        while (along <= travelled) {
          particles.emit(style, spot.lerpVectors(last, point, along / travelled), backward, 1);
          along += spacing;
        }

        carried = travelled - (along - spacing);
      }

      last.copy(point);
    },
  };
}
