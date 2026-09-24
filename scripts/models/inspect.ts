import { statSync } from "node:fs";
import { NodeIO, getBounds, type Document, type Node } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer/decoder";

export interface TextureReport {
  name: string;
  width: number;
  height: number;
  mimeType: string;
}

export interface MaterialReport {
  name: string;
  baseColor: readonly [number, number, number];
  textured: boolean;
  emissive: boolean;
}

export interface ClipReport {
  name: string;
  seconds: number;
}

export interface ModelReport {
  path: string;
  bytes: number;
  triangles: number;
  drawCalls: number;
  materials: MaterialReport[];
  textures: TextureReport[];
  skins: number;
  joints: number;
  clips: ClipReport[];
  height: number;
  floor: number;
  footprint: number;
  compressed: boolean;
}

const TRIANGLES_MODE = 4;

let reader: NodeIO | null = null;

async function io(): Promise<NodeIO> {
  if (reader === null) {
    await MeshoptDecoder.ready;
    reader = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  }

  return reader;
}

function meshNodes(document: Document): Node[] {
  return document
    .getRoot()
    .listNodes()
    .filter((node) => node.getMesh() !== null);
}

function footprintOf(nodes: readonly Node[]): number {
  let radius = 0;
  const point: number[] = [0, 0, 0];

  for (const node of nodes) {
    const matrix = node.getWorldMatrix();

    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const positions = primitive.getAttribute("POSITION");

      if (positions === null) {
        continue;
      }

      for (let index = 0; index < positions.getCount(); index += 1) {
        positions.getElement(index, point);
        const [x = 0, y = 0, z = 0] = point;
        const worldX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        const worldZ = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
        radius = Math.max(radius, Math.hypot(worldX, worldZ));
      }
    }
  }

  return radius;
}

export async function inspectModel(path: string): Promise<ModelReport> {
  const document = await (await io()).read(path);
  const root = document.getRoot();
  const nodes = meshNodes(document);
  let triangles = 0;
  let drawCalls = 0;

  for (const node of nodes) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      drawCalls += 1;

      if (primitive.getMode() !== TRIANGLES_MODE) {
        continue;
      }

      const indices = primitive.getIndices();
      const positions = primitive.getAttribute("POSITION");
      triangles += Math.floor((indices?.getCount() ?? positions?.getCount() ?? 0) / 3);
    }
  }

  const materials = root.listMaterials().map((material): MaterialReport => {
    const [red = 1, green = 1, blue = 1] = material.getBaseColorFactor();
    const emission = material.getEmissiveFactor();

    return {
      name: material.getName(),
      baseColor: [red, green, blue],
      textured: material.getBaseColorTexture() !== null,
      emissive: emission.some((channel) => channel > 0) || material.getEmissiveTexture() !== null,
    };
  });

  const textures = root.listTextures().map((texture): TextureReport => {
    const [width = 0, height = 0] = texture.getSize() ?? [];

    return { name: texture.getName(), width, height, mimeType: texture.getMimeType() };
  });

  const clips = root.listAnimations().map((animation): ClipReport => {
    let seconds = 0;

    for (const sampler of animation.listSamplers()) {
      const [end = 0] = sampler.getInput()?.getMax([0]) ?? [];
      seconds = Math.max(seconds, end);
    }

    return { name: animation.getName(), seconds };
  });

  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const bounds = scene === undefined ? null : getBounds(scene);
  const skins = root.listSkins();

  return {
    path,
    bytes: statSync(path).size,
    triangles,
    drawCalls,
    materials,
    textures,
    skins: skins.length,
    joints: Math.max(0, ...skins.map((skin) => skin.listJoints().length)),
    clips,
    height: bounds === null ? 0 : bounds.max[1] - bounds.min[1],
    floor: bounds === null ? 0 : bounds.min[1],
    footprint: footprintOf(nodes),
    compressed: root.listExtensionsUsed().some((extension) => extension.extensionName === "EXT_meshopt_compression"),
  };
}
