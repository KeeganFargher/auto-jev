import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Texture } from "three";
import {
  installModelLibrary,
  loadModelLibrary,
  type ModelSource,
} from "../src/game/models/library.js";

const PUBLIC_ROOT = fileURLToPath(new URL("../public/", import.meta.url));

const fileModelSource: ModelSource = {
  bytes(url) {
    return Promise.resolve(new Uint8Array(readFileSync(join(PUBLIC_ROOT, url))).buffer);
  },

  texture() {
    return Promise.resolve(new Texture());
  },
};

export async function installHeroModels(): Promise<void> {
  installModelLibrary(await loadModelLibrary(fileModelSource));
}
