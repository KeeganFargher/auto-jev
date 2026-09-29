import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BODIES,
  BODY_IDS,
  CLIP_NAMES,
  CLIPS_URL,
  MODELS_ROOT,
  PROP_IDS,
  PROPS,
  RIG_BONES,
  TEXTURE_IDS,
  TEXTURES,
} from "../../apps/client/src/game/models/catalogue.js";
import type { BodyId, PropId, TextureId } from "../../apps/client/src/game/models/catalogue.js";
import {
  AccessorCopier,
  BinaryWriter,
  imageBytes,
  packedAccessor,
  readGltf,
  requireAccessor,
  writeGlb,
} from "./gltf.js";
import type {
  GltfAccessor,
  GltfAnimation,
  GltfDocument,
  GltfJson,
  GltfMaterial,
  GltfMesh,
  GltfNode,
  GltfPrimitive,
  GltfTextureInfo,
} from "./gltf.js";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const VENDOR_ROOT = join(REPO_ROOT, "art", "vendor");

const PUBLIC_ROOT = join(REPO_ROOT, "apps", "client", "public");

const OUTPUT_ROOT = join(PUBLIC_ROOT, MODELS_ROOT);

const ADVENTURER_BODIES = join(VENDOR_ROOT, "kaykit-adventurers-2.0", "Characters", "gltf");

const ADVENTURER_PROPS = join(VENDOR_ROOT, "kaykit-adventurers-2.0", "Assets", "gltf");

const SKELETON_BODIES = join(VENDOR_ROOT, "kaykit-skeletons-1.1", "characters", "gltf");

const WEAPON_PROPS = join(VENDOR_ROOT, "kaykit-fantasy-weapons-bits-1.0", "Assets", "gltf");

const CLIP_PACKS = join(
  VENDOR_ROOT,
  "kaykit-character-animations-1.1",
  "Animations",
  "gltf",
  "Rig_Medium",
);

const BODY_SOURCES: Readonly<Record<BodyId, string>> = {
  knight: join(ADVENTURER_BODIES, "Knight.glb"),
  barbarian: join(ADVENTURER_BODIES, "Barbarian.glb"),
  mage: join(ADVENTURER_BODIES, "Mage.glb"),
  ranger: join(ADVENTURER_BODIES, "Ranger.glb"),
  skeletonMinion: join(SKELETON_BODIES, "Skeleton_Minion.glb"),
};

const PROP_SOURCES: Readonly<Record<PropId, string>> = {
  hammer: join(WEAPON_PROPS, "hammer_A.gltf"),
  axe: join(ADVENTURER_PROPS, "axe_2handed.gltf"),
  staff: join(ADVENTURER_PROPS, "staff.gltf"),
  crystalStaff: join(WEAPON_PROPS, "staff_B.gltf"),
  spellbook: join(ADVENTURER_PROPS, "spellbook_open.gltf"),
  harpoon: join(WEAPON_PROPS, "spear_A.gltf"),
};

const TEXTURE_SOURCES: Readonly<Record<TextureId, string>> = {
  knight: join(ADVENTURER_BODIES, "knight_texture.png"),
  barbarian: join(ADVENTURER_BODIES, "barbarian_texture.png"),
  mage: join(ADVENTURER_BODIES, "mage_texture.png"),
  ranger: join(ADVENTURER_BODIES, "ranger_texture.png"),
  skeleton: join(SKELETON_BODIES, "skeleton_texture.png"),
  weaponsBits: join(WEAPON_PROPS, "weapons_bits_texture.png"),
};

const CLIP_SOURCES = [
  "CombatMelee",
  "CombatRanged",
  "General",
  "MovementAdvanced",
  "MovementBasic",
  "Simulation",
  "Special",
  "Tools",
].map((pack) => join(CLIP_PACKS, `Rig_Medium_${pack}.glb`));

const RIG_ROOT = "Rig_Medium";

const ARRAY_BUFFER = 34962;

const ELEMENT_ARRAY_BUFFER = 34963;

const UNSIGNED_BYTE = 5121;

const UNSIGNED_SHORT = 5123;

const UNSIGNED_INT = 5125;

const TRIANGLES = 4;

const GENERATOR = "auto-jev scripts/models/import.ts";

const RIG_NAMES: ReadonlySet<string> = new Set([RIG_ROOT, ...RIG_BONES]);

interface WrittenIndices {
  readonly accessor: GltfAccessor;
  readonly bytes: Buffer;
}

interface Bounds {
  readonly min: number[];
  readonly max: number[];
}

interface Rig {
  readonly nodes: GltfNode[];
  readonly root: number;
  readonly byName: ReadonlyMap<string, number>;
}

const TEXTURE_BYTES: ReadonlyMap<TextureId, Buffer> = new Map(
  TEXTURE_IDS.map((id) => [id, readFileSync(TEXTURE_SOURCES[id])]),
);

const writtenPaths = new Set<string>();

function outputPath(url: string): string {
  if (!url.startsWith(`${MODELS_ROOT}/`)) {
    throw new Error(`${url} is outside ${MODELS_ROOT}`);
  }

  const path = join(PUBLIC_ROOT, url);

  if (writtenPaths.has(path)) {
    throw new Error(`${url} is written twice`);
  }

  writtenPaths.add(path);
  mkdirSync(dirname(path), { recursive: true });

  return path;
}

function requireNode(document: GltfDocument, nodeIndex: number): GltfNode {
  const node = document.json.nodes?.[nodeIndex];

  if (node === undefined) {
    throw new Error(`${document.path} has no node ${nodeIndex}`);
  }

  return node;
}

function nodeName(document: GltfDocument, nodeIndex: number): string {
  const name = requireNode(document, nodeIndex).name;

  if (name === undefined) {
    throw new Error(`${document.path} node ${nodeIndex} has no name`);
  }

  return name;
}

function requireMesh(document: GltfDocument, meshIndex: number): GltfMesh {
  const mesh = document.json.meshes?.[meshIndex];

  if (mesh === undefined) {
    throw new Error(`${document.path} has no mesh ${meshIndex}`);
  }

  return mesh;
}

function sceneRoots(document: GltfDocument): number[] {
  const scene = document.json.scenes?.[document.json.scene ?? 0];

  if (scene === undefined) {
    throw new Error(`${document.path} has no default scene`);
  }

  return scene.nodes;
}

function onlyRoot(document: GltfDocument): number {
  const roots = sceneRoots(document);
  const [root] = roots;

  if (root === undefined || roots.length !== 1) {
    throw new Error(`${document.path} must have exactly one scene root, found ${roots.length}`);
  }

  return root;
}

function hasTransform(node: GltfNode): boolean {
  return (
    node.translation !== undefined ||
    node.rotation !== undefined ||
    node.scale !== undefined ||
    node.matrix !== undefined
  );
}

function textureImage(document: GltfDocument, info: GltfTextureInfo): Buffer {
  const texture = document.json.textures?.[info.index];

  if (texture?.source === undefined) {
    throw new Error(`${document.path} texture ${info.index} has no image`);
  }

  if ((info.texCoord ?? 0) !== 0) {
    throw new Error(`${document.path} texture ${info.index} reads a second UV set`);
  }

  return imageBytes(document, texture.source);
}

function expectedTexture(id: TextureId): Buffer {
  const bytes = TEXTURE_BYTES.get(id);

  if (bytes === undefined) {
    throw new Error(`Texture "${id}" was not read`);
  }

  return bytes;
}

function strippedMaterial(
  document: GltfDocument,
  materialIndex: number,
  texture: TextureId,
): GltfMaterial {
  const material = document.json.materials?.[materialIndex];

  if (material === undefined) {
    throw new Error(`${document.path} has no material ${materialIndex}`);
  }

  const pbr = material.pbrMetallicRoughness ?? {};

  if (
    material.normalTexture !== undefined ||
    material.emissiveTexture !== undefined ||
    material.occlusionTexture !== undefined ||
    pbr.metallicRoughnessTexture !== undefined
  ) {
    throw new Error(
      `${document.path} material "${material.name}" uses a texture slot other than base colour`,
    );
  }

  const { baseColorTexture, ...untexturedPbr } = pbr;

  if (baseColorTexture === undefined) {
    return material;
  }

  if (!textureImage(document, baseColorTexture).equals(expectedTexture(texture))) {
    throw new Error(
      `${document.path} material "${material.name}" is not painted with ${TEXTURE_SOURCES[texture]}`,
    );
  }

  return { ...material, pbrMetallicRoughness: untexturedPbr, extras: { texture } };
}

class MaterialTable {
  private readonly indices = new Map<number, number>();

  readonly materials: GltfMaterial[] = [];

  constructor(
    private readonly document: GltfDocument,
    private readonly texture: TextureId,
  ) {}

  index(sourceIndex: number): number {
    const known = this.indices.get(sourceIndex);

    if (known !== undefined) {
      return known;
    }

    this.materials.push(strippedMaterial(this.document, sourceIndex, this.texture));
    this.indices.set(sourceIndex, this.materials.length - 1);

    return this.materials.length - 1;
  }
}

function checkPrimitive(document: GltfDocument, primitive: GltfPrimitive): void {
  if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) {
    throw new Error(`${document.path} has a primitive that is not a triangle list`);
  }

  if (primitive.targets !== undefined) {
    throw new Error(`${document.path} has morph targets, which the importer does not copy`);
  }

  if (primitive.indices === undefined || primitive.material === undefined) {
    throw new Error(`${document.path} has a primitive without indices or a material`);
  }
}

function readIndices(document: GltfDocument, accessorIndex: number): number[] {
  const accessor = requireAccessor(document, accessorIndex);
  const bytes = packedAccessor(document, accessorIndex);

  if (accessor.type !== "SCALAR") {
    throw new Error(`${document.path} accessor ${accessorIndex} is not a scalar index list`);
  }

  return Array.from({ length: accessor.count }, (_, index) => {
    if (accessor.componentType === UNSIGNED_BYTE) {
      return bytes.readUInt8(index);
    }

    if (accessor.componentType === UNSIGNED_SHORT) {
      return bytes.readUInt16LE(index * 2);
    }

    if (accessor.componentType === UNSIGNED_INT) {
      return bytes.readUInt32LE(index * 4);
    }

    throw new Error(
      `${document.path} accessor ${accessorIndex} has index type ${accessor.componentType}`,
    );
  });
}

function writeIndices(indices: readonly number[], vertexCount: number): WrittenIndices {
  const wide = vertexCount > 0xffff;
  const bytes = Buffer.alloc(indices.length * (wide ? 4 : 2));

  for (const [position, index] of indices.entries()) {
    if (wide) {
      bytes.writeUInt32LE(index, position * 4);
    } else {
      bytes.writeUInt16LE(index, position * 2);
    }
  }

  return {
    accessor: {
      componentType: wide ? UNSIGNED_INT : UNSIGNED_SHORT,
      count: indices.length,
      type: "SCALAR",
    },
    bytes,
  };
}

function boundsOf(document: GltfDocument, accessorIndices: readonly number[]): Bounds {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (const accessorIndex of accessorIndices) {
    const accessor = requireAccessor(document, accessorIndex);

    if (accessor.min === undefined || accessor.max === undefined) {
      throw new Error(`${document.path} POSITION accessor ${accessorIndex} has no bounds`);
    }

    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis] ?? Infinity, accessor.min[axis] ?? Infinity);
      max[axis] = Math.max(max[axis] ?? -Infinity, accessor.max[axis] ?? -Infinity);
    }
  }

  return { min, max };
}

function mergedAttribute(
  document: GltfDocument,
  copier: AccessorCopier,
  attribute: string,
  accessorIndices: readonly number[],
): number {
  const accessors = accessorIndices.map((accessorIndex) =>
    requireAccessor(document, accessorIndex),
  );

  const [first] = accessors;

  if (first === undefined) {
    throw new Error(`${document.path} has no ${attribute} data to merge`);
  }

  for (const accessor of accessors) {
    if (
      accessor.componentType !== first.componentType ||
      accessor.type !== first.type ||
      accessor.normalized !== first.normalized
    ) {
      throw new Error(`${document.path} stores ${attribute} in more than one layout`);
    }
  }

  const merged: GltfAccessor = {
    componentType: first.componentType,
    count: accessors.reduce((sum, accessor) => sum + accessor.count, 0),
    type: first.type,
  };

  if (first.normalized !== undefined) {
    merged.normalized = first.normalized;
  }

  if (attribute === "POSITION") {
    const bounds = boundsOf(document, accessorIndices);
    merged.min = bounds.min;
    merged.max = bounds.max;
  }

  const bytes = Buffer.concat(
    accessorIndices.map((accessorIndex) => packedAccessor(document, accessorIndex)),
  );

  return copier.add(merged, bytes, ARRAY_BUFFER);
}

function attributeKey(primitive: GltfPrimitive): string {
  return Object.keys(primitive.attributes).sort().join(",");
}

function mergedPrimitive(
  document: GltfDocument,
  copier: AccessorCopier,
  material: number,
  primitives: readonly GltfPrimitive[],
): GltfPrimitive {
  const [first] = primitives;

  if (first === undefined) {
    throw new Error(`${document.path} has no primitives for material ${material}`);
  }

  if (primitives.some((primitive) => attributeKey(primitive) !== attributeKey(first))) {
    throw new Error(
      `${document.path} material ${material} mixes primitives with different attributes`,
    );
  }

  const attributes: Record<string, number> = {};

  for (const attribute of Object.keys(first.attributes)) {
    attributes[attribute] = mergedAttribute(
      document,
      copier,
      attribute,
      primitives.map((primitive) => {
        const accessorIndex = primitive.attributes[attribute];

        if (accessorIndex === undefined) {
          throw new Error(`${document.path} primitive lost its ${attribute}`);
        }

        return accessorIndex;
      }),
    );
  }

  const indices: number[] = [];
  let vertexOffset = 0;

  for (const primitive of primitives) {
    const positions = primitive.attributes["POSITION"];

    if (primitive.indices === undefined || positions === undefined) {
      throw new Error(`${document.path} primitive has no indices or positions`);
    }

    for (const index of readIndices(document, primitive.indices)) {
      indices.push(index + vertexOffset);
    }

    vertexOffset += requireAccessor(document, positions).count;
  }

  const written = writeIndices(indices, vertexOffset);

  return {
    attributes,
    indices: copier.add(written.accessor, written.bytes, ELEMENT_ARRAY_BUFFER),
    material,
  };
}

function importBody(id: BodyId): number {
  const document = readGltf(BODY_SOURCES[id]);
  const nodes = document.json.nodes ?? [];
  const rootIndex = onlyRoot(document);
  const root = requireNode(document, rootIndex);
  const [skin, ...extraSkins] = document.json.skins ?? [];

  if (root.name !== RIG_ROOT || root.mesh !== undefined || hasTransform(root)) {
    throw new Error(`${document.path} scene root must be an untransformed "${RIG_ROOT}" node`);
  }

  if (skin === undefined || extraSkins.length > 0) {
    throw new Error(`${document.path} must have exactly one skin`);
  }

  if (skin.inverseBindMatrices === undefined) {
    throw new Error(`${document.path} skin has no inverse bind matrices`);
  }

  const jointNames = skin.joints.map((joint) => nodeName(document, joint));

  if (
    jointNames.length !== RIG_BONES.length ||
    RIG_BONES.some((bone) => !jointNames.includes(bone))
  ) {
    throw new Error(
      `${document.path} skin joints are [${jointNames.join(", ")}], expected the ${RIG_ROOT} rig`,
    );
  }

  const joints = new Set(skin.joints);
  const meshNodes = nodes.flatMap((node, index) => (node.mesh === undefined ? [] : [index]));

  for (const [index, node] of nodes.entries()) {
    if (index !== rootIndex && !joints.has(index) && node.mesh === undefined) {
      throw new Error(`${document.path} node "${node.name}" is neither a joint nor a mesh`);
    }
  }

  for (const index of meshNodes) {
    const node = requireNode(document, index);

    if (
      node.skin !== 0 ||
      node.children !== undefined ||
      hasTransform(node) ||
      !root.children?.includes(index)
    ) {
      throw new Error(
        `${document.path} mesh node "${node.name}" must be an untransformed skinned child of the rig`,
      );
    }
  }

  const byMaterial = new Map<number, GltfPrimitive[]>();

  for (const index of meshNodes) {
    const node = requireNode(document, index);

    if (node.mesh === undefined) {
      throw new Error(`${document.path} mesh node "${node.name}" lost its mesh`);
    }

    for (const primitive of requireMesh(document, node.mesh).primitives) {
      checkPrimitive(document, primitive);

      if (primitive.material === undefined) {
        throw new Error(`${document.path} primitive has no material`);
      }

      byMaterial.set(primitive.material, [
        ...(byMaterial.get(primitive.material) ?? []),
        primitive,
      ]);
    }
  }

  const kept = nodes.flatMap((node, index) => (node.mesh === undefined ? [index] : []));
  const remap = new Map(kept.map((sourceIndex, index) => [sourceIndex, index]));

  const remapped = (sourceIndex: number): number => {
    const index = remap.get(sourceIndex);

    if (index === undefined) {
      throw new Error(`${document.path} node ${sourceIndex} was dropped but is still referenced`);
    }

    return index;
  };

  const outputNodes: GltfNode[] = kept.map((sourceIndex) => {
    const node = { ...requireNode(document, sourceIndex) };

    if (node.children !== undefined) {
      node.children = node.children.flatMap((child) => (remap.has(child) ? [remapped(child)] : []));
    }

    return node;
  });

  const writer = new BinaryWriter();
  const copier = new AccessorCopier(writer);
  const materials = new MaterialTable(document, BODIES[id].texture);
  const meshes: GltfMesh[] = [];
  const rigNode = outputNodes[remapped(rootIndex)];

  if (rigNode === undefined) {
    throw new Error(`${document.path} lost its rig node`);
  }

  for (const [sourceMaterial, primitives] of byMaterial) {
    const material = materials.index(sourceMaterial);
    const name = `${id}-${materials.materials[material]?.name ?? material}`;
    meshes.push({ name, primitives: [mergedPrimitive(document, copier, material, primitives)] });
    outputNodes.push({ name, mesh: meshes.length - 1, skin: 0 });
    rigNode.children = [...(rigNode.children ?? []), outputNodes.length - 1];
  }

  const outputSkin = {
    ...skin,
    joints: skin.joints.map(remapped),
    inverseBindMatrices: copier.copy(document, skin.inverseBindMatrices),
  };

  if (skin.skeleton !== undefined) {
    outputSkin.skeleton = remapped(skin.skeleton);
  }

  const json: GltfJson = {
    asset: { version: "2.0", generator: GENERATOR },
    scene: 0,
    scenes: [{ nodes: [remapped(rootIndex)] }],
    nodes: outputNodes,
    meshes,
    skins: [outputSkin],
    materials: materials.materials,
    accessors: copier.accessors,
    bufferViews: writer.views,
  };

  return writeGlb(outputPath(BODIES[id].url), json, writer.binary());
}

function importProp(id: PropId): number {
  const document = readGltf(PROP_SOURCES[id]);
  const rootIndex = onlyRoot(document);
  const root = requireNode(document, rootIndex);

  if (
    (document.json.nodes ?? []).length !== 1 ||
    root.mesh === undefined ||
    root.children !== undefined
  ) {
    throw new Error(`${document.path} must be a single mesh node`);
  }

  if (
    root.skin !== undefined ||
    document.json.skins !== undefined ||
    document.json.animations !== undefined
  ) {
    throw new Error(`${document.path} is skinned or animated, which props must not be`);
  }

  const writer = new BinaryWriter();
  const copier = new AccessorCopier(writer);
  const materials = new MaterialTable(document, PROPS[id].texture);

  const primitives = requireMesh(document, root.mesh).primitives.map((primitive) => {
    checkPrimitive(document, primitive);

    if (primitive.indices === undefined || primitive.material === undefined) {
      throw new Error(`${document.path} primitive has no indices or material`);
    }

    const attributes: Record<string, number> = {};

    for (const [attribute, accessorIndex] of Object.entries(primitive.attributes)) {
      attributes[attribute] = copier.copy(document, accessorIndex);
    }

    return {
      attributes,
      indices: copier.copy(document, primitive.indices),
      material: materials.index(primitive.material),
    };
  });

  const node: GltfNode = { ...root, name: id, mesh: 0 };

  const json: GltfJson = {
    asset: { version: "2.0", generator: GENERATOR },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [node],
    meshes: [{ name: id, primitives }],
    materials: materials.materials,
    accessors: copier.accessors,
    bufferViews: writer.views,
  };

  return writeGlb(outputPath(PROPS[id].url), json, writer.binary());
}

function rigNodes(document: GltfDocument): Rig {
  const sourceNodes = document.json.nodes ?? [];
  const kept = sourceNodes.flatMap((node, index) => (node.mesh === undefined ? [index] : []));
  const remap = new Map(kept.map((sourceIndex, index) => [sourceIndex, index]));
  const byName = new Map<string, number>();

  const nodes = kept.map((sourceIndex, index) => {
    const { skin: _skin, ...node } = requireNode(document, sourceIndex);
    const name = nodeName(document, sourceIndex);

    if (!RIG_NAMES.has(name) || byName.has(name)) {
      throw new Error(`${document.path} node "${name}" is not a unique ${RIG_ROOT} bone`);
    }

    byName.set(name, index);

    if (node.children !== undefined) {
      node.children = node.children.flatMap((child) => {
        const childIndex = remap.get(child);

        return childIndex === undefined ? [] : [childIndex];
      });
    }

    return node;
  });

  const root = byName.get(RIG_ROOT);

  if (root === undefined || byName.size !== RIG_NAMES.size) {
    throw new Error(`${document.path} does not carry the whole ${RIG_ROOT} rig`);
  }

  return { nodes, root, byName };
}

function importClips(): number {
  const documents = CLIP_SOURCES.map((path) => readGltf(path));
  const [canonical] = documents;

  if (canonical === undefined) {
    throw new Error("No clip packs were listed");
  }

  const rig = rigNodes(canonical);
  const found = new Map<string, { document: GltfDocument; animation: GltfAnimation }[]>();

  for (const document of documents) {
    for (const animation of document.json.animations ?? []) {
      if (animation.name === undefined) {
        throw new Error(`${document.path} has an unnamed animation`);
      }

      found.set(animation.name, [...(found.get(animation.name) ?? []), { document, animation }]);
    }
  }

  const writer = new BinaryWriter();
  const copier = new AccessorCopier(writer);

  const animations = CLIP_NAMES.map((clip): GltfAnimation => {
    const sources = found.get(clip) ?? [];
    const [source] = sources;

    if (source === undefined || sources.length > 1) {
      throw new Error(`Clip "${clip}" appears in ${sources.length} packs, expected exactly one`);
    }

    const { document, animation } = source;

    return {
      name: clip,
      samplers: animation.samplers.map((sampler) => {
        const copied = {
          input: copier.copy(document, sampler.input),
          output: copier.copy(document, sampler.output),
        };

        return sampler.interpolation === undefined
          ? copied
          : { ...copied, interpolation: sampler.interpolation };
      }),
      channels: animation.channels.map((channel) => {
        if (channel.target.node === undefined) {
          throw new Error(`${document.path} clip "${clip}" has a channel with no target node`);
        }

        const name = nodeName(document, channel.target.node);
        const node = rig.byName.get(name);

        if (node === undefined) {
          throw new Error(
            `${document.path} clip "${clip}" animates "${name}", which is not a ${RIG_ROOT} bone`,
          );
        }

        return { sampler: channel.sampler, target: { node, path: channel.target.path } };
      }),
    };
  });

  const json: GltfJson = {
    asset: { version: "2.0", generator: GENERATOR },
    scene: 0,
    scenes: [{ nodes: [rig.root] }],
    nodes: rig.nodes,
    animations,
    accessors: copier.accessors,
    bufferViews: writer.views,
  };

  return writeGlb(outputPath(CLIPS_URL), json, writer.binary());
}

function importTexture(id: TextureId): number {
  const path = outputPath(TEXTURES[id]);
  copyFileSync(TEXTURE_SOURCES[id], path);

  return statSync(path).size;
}

function report(url: string, bytes: number): void {
  console.log(`✓ ${url.slice(MODELS_ROOT.length + 1)} ${(bytes / 1024).toFixed(1)} KB`);
}

for (const id of BODY_IDS) {
  report(BODIES[id].url, importBody(id));
}

for (const id of PROP_IDS) {
  report(PROPS[id].url, importProp(id));
}

for (const id of TEXTURE_IDS) {
  report(TEXTURES[id], importTexture(id));
}

report(CLIPS_URL, importClips());

for (const entry of readdirSync(OUTPUT_ROOT, { recursive: true, withFileTypes: true })) {
  const path = join(entry.parentPath, entry.name);

  if (entry.isFile() && !writtenPaths.has(path)) {
    rmSync(path);
    console.log(`✗ removed stale ${relative(OUTPUT_ROOT, path).split(sep).join("/")}`);
  }
}
