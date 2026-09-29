import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface GltfNode {
  name?: string;
  children?: number[];
  mesh?: number;
  skin?: number;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
}

export interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
  targets?: Record<string, number>[];
}

export interface GltfMesh {
  name?: string;
  primitives: GltfPrimitive[];
}

export interface GltfSkin {
  name?: string;
  joints: number[];
  inverseBindMatrices?: number;
  skeleton?: number;
}

export interface GltfTextureInfo {
  index: number;
  texCoord?: number;
}

export interface GltfMaterial {
  name?: string;
  doubleSided?: boolean;
  emissiveFactor?: number[];
  alphaMode?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: number[];
    baseColorTexture?: GltfTextureInfo;
    metallicFactor?: number;
    roughnessFactor?: number;
    metallicRoughnessTexture?: GltfTextureInfo;
  };
  normalTexture?: GltfTextureInfo;
  emissiveTexture?: GltfTextureInfo;
  occlusionTexture?: GltfTextureInfo;
  extras?: Record<string, string>;
}

export interface GltfImage {
  name?: string;
  uri?: string;
  bufferView?: number;
  mimeType?: string;
}

export interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  normalized?: boolean;
  max?: number[];
  min?: number[];
  sparse?: object;
}

export interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
}

export interface GltfAnimation {
  name?: string;
  channels: { sampler: number; target: { node?: number; path: string } }[];
  samplers: { input: number; output: number; interpolation?: string }[];
}

export interface GltfJson {
  asset: { version: string; generator?: string };
  scene?: number;
  scenes?: { name?: string; nodes: number[] }[];
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
  skins?: GltfSkin[];
  materials?: GltfMaterial[];
  textures?: { sampler?: number; source?: number }[];
  images?: GltfImage[];
  samplers?: object[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: { byteLength: number; uri?: string }[];
  animations?: GltfAnimation[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

export interface GltfDocument {
  readonly path: string;
  readonly json: GltfJson;
  readonly buffers: readonly Buffer[];
}

const GLB_MAGIC = 0x46546c67;

const JSON_CHUNK = 0x4e4f534a;

const BIN_CHUNK = 0x004e4942;

const DATA_URI = /^data:[^;]*;base64,/;

function readGlb(path: string, bytes: Buffer): GltfDocument {
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`${path} is not a GLB file`);
  }

  const jsonLength = bytes.readUInt32LE(12);

  if (bytes.readUInt32LE(16) !== JSON_CHUNK) {
    throw new Error(`${path} does not start with a JSON chunk`);
  }

  const json: GltfJson = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  const binaryHeader = 20 + jsonLength;

  if (binaryHeader >= bytes.length) {
    return { path, json, buffers: [] };
  }

  if (bytes.readUInt32LE(binaryHeader + 4) !== BIN_CHUNK) {
    throw new Error(`${path} has a second chunk that is not binary`);
  }

  const binaryLength = bytes.readUInt32LE(binaryHeader);
  const binary = bytes.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength);

  return { path, json, buffers: [binary] };
}

function readBufferUri(path: string, uri: string): Buffer {
  if (DATA_URI.test(uri)) {
    return Buffer.from(uri.replace(DATA_URI, ""), "base64");
  }

  return readFileSync(join(dirname(path), decodeURIComponent(uri)));
}

export function readGltf(path: string): GltfDocument {
  const bytes = readFileSync(path);

  if (path.endsWith(".glb")) {
    return readGlb(path, bytes);
  }

  const json: GltfJson = JSON.parse(bytes.toString("utf8"));

  const buffers = (json.buffers ?? []).map((buffer) => {
    if (buffer.uri === undefined) {
      throw new Error(`${path} has a buffer with no uri`);
    }

    return readBufferUri(path, buffer.uri);
  });

  return { path, json, buffers };
}

export function viewBytes(document: GltfDocument, viewIndex: number): Buffer {
  const view = document.json.bufferViews?.[viewIndex];

  if (view === undefined) {
    throw new Error(`${document.path} has no buffer view ${viewIndex}`);
  }

  const buffer = document.buffers[view.buffer];

  if (buffer === undefined) {
    throw new Error(`${document.path} buffer view ${viewIndex} points at a missing buffer`);
  }

  const start = view.byteOffset ?? 0;

  return buffer.subarray(start, start + view.byteLength);
}

export function imageBytes(document: GltfDocument, imageIndex: number): Buffer {
  const image = document.json.images?.[imageIndex];

  if (image === undefined) {
    throw new Error(`${document.path} has no image ${imageIndex}`);
  }

  if (image.bufferView !== undefined) {
    return viewBytes(document, image.bufferView);
  }

  if (image.uri === undefined) {
    throw new Error(`${document.path} image ${imageIndex} has neither a uri nor a buffer view`);
  }

  return readBufferUri(document.path, image.uri);
}

export class BinaryWriter {
  private readonly chunks: Buffer[] = [];

  private length = 0;

  readonly views: GltfBufferView[] = [];

  addView(bytes: Buffer, byteStride: number | undefined, target: number | undefined): number {
    const padding = (4 - (this.length % 4)) % 4;

    if (padding > 0) {
      this.chunks.push(Buffer.alloc(padding));
      this.length += padding;
    }

    const view: GltfBufferView = { buffer: 0, byteOffset: this.length, byteLength: bytes.length };

    if (byteStride !== undefined) {
      view.byteStride = byteStride;
    }

    if (target !== undefined) {
      view.target = target;
    }

    this.chunks.push(bytes);
    this.length += bytes.length;
    this.views.push(view);

    return this.views.length - 1;
  }

  binary(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

const COMPONENT_BYTES: ReadonlyMap<number, number> = new Map([
  [5120, 1],
  [5121, 1],
  [5122, 2],
  [5123, 2],
  [5125, 4],
  [5126, 4],
]);

const TYPE_SIZES: ReadonlyMap<string, number> = new Map([
  ["SCALAR", 1],
  ["VEC2", 2],
  ["VEC3", 3],
  ["VEC4", 4],
  ["MAT4", 16],
]);

export function requireAccessor(document: GltfDocument, accessorIndex: number): GltfAccessor {
  const accessor = document.json.accessors?.[accessorIndex];

  if (accessor === undefined) {
    throw new Error(`${document.path} has no accessor ${accessorIndex}`);
  }

  return accessor;
}

export function elementBytes(accessor: GltfAccessor): number {
  const component = COMPONENT_BYTES.get(accessor.componentType);
  const size = TYPE_SIZES.get(accessor.type);

  if (component === undefined || size === undefined) {
    throw new Error(`Unknown accessor layout ${accessor.componentType} ${accessor.type}`);
  }

  return component * size;
}

export function packedAccessor(document: GltfDocument, accessorIndex: number): Buffer {
  const accessor = requireAccessor(document, accessorIndex);

  if (accessor.sparse !== undefined) {
    throw new Error(
      `${document.path} accessor ${accessorIndex} is sparse, which the importer does not copy`,
    );
  }

  if (accessor.bufferView === undefined) {
    throw new Error(`${document.path} accessor ${accessorIndex} has no buffer view`);
  }

  const view = document.json.bufferViews?.[accessor.bufferView];

  if (view === undefined) {
    throw new Error(`${document.path} has no buffer view ${accessor.bufferView}`);
  }

  const size = elementBytes(accessor);
  const stride = view.byteStride ?? size;
  const source = viewBytes(document, accessor.bufferView);
  const start = accessor.byteOffset ?? 0;

  if (stride === size) {
    return source.subarray(start, start + size * accessor.count);
  }

  const packed = Buffer.alloc(size * accessor.count);

  for (let element = 0; element < accessor.count; element += 1) {
    const from = start + element * stride;
    source.copy(packed, element * size, from, from + size);
  }

  return packed;
}

export function viewTarget(document: GltfDocument, accessorIndex: number): number | undefined {
  const accessor = requireAccessor(document, accessorIndex);

  if (accessor.bufferView === undefined) {
    throw new Error(`${document.path} accessor ${accessorIndex} has no buffer view`);
  }

  return document.json.bufferViews?.[accessor.bufferView]?.target;
}

export class AccessorCopier {
  private readonly copied = new Map<string, number>();

  readonly accessors: GltfAccessor[] = [];

  constructor(private readonly writer: BinaryWriter) {}

  add(accessor: GltfAccessor, bytes: Buffer, target: number | undefined): number {
    const { byteOffset: _byteOffset, sparse: _sparse, ...layout } = accessor;
    this.accessors.push({ ...layout, bufferView: this.writer.addView(bytes, undefined, target) });

    return this.accessors.length - 1;
  }

  copy(document: GltfDocument, accessorIndex: number): number {
    const key = `${document.path}#${accessorIndex}`;
    const known = this.copied.get(key);

    if (known !== undefined) {
      return known;
    }

    const copiedIndex = this.add(
      requireAccessor(document, accessorIndex),
      packedAccessor(document, accessorIndex),
      viewTarget(document, accessorIndex),
    );

    this.copied.set(key, copiedIndex);

    return copiedIndex;
  }
}

function padded(bytes: Buffer, fill: number): Buffer {
  const padding = (4 - (bytes.length % 4)) % 4;

  return padding === 0 ? bytes : Buffer.concat([bytes, Buffer.alloc(padding, fill)]);
}

export function writeGlb(path: string, json: GltfJson, binary: Buffer): number {
  const body = binary.length > 0 ? padded(binary, 0) : binary;

  const withBuffer: GltfJson =
    body.length > 0 ? { ...json, buffers: [{ byteLength: body.length }] } : json;

  const jsonChunk = padded(Buffer.from(JSON.stringify(withBuffer), "utf8"), 0x20);
  const chunks: Buffer[] = [];
  const header = Buffer.alloc(12);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);
  chunks.push(header, jsonHeader, jsonChunk);

  if (body.length > 0) {
    const binaryHeader = Buffer.alloc(8);
    binaryHeader.writeUInt32LE(body.length, 0);
    binaryHeader.writeUInt32LE(BIN_CHUNK, 4);
    chunks.push(binaryHeader, body);
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  writeFileSync(path, Buffer.concat(chunks));

  return total;
}
