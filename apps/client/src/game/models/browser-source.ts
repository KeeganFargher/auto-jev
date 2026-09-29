import { CanvasTexture, RepeatWrapping, SRGBColorSpace, Texture } from "three";
import { TEXTURES, type TextureId, type TintRule } from "./catalogue.js";
import type { ModelSource } from "./library.js";
import { tintPixels } from "./tint.js";

async function fetched(url: string): Promise<Response> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  }

  return response;
}

function prepared(texture: Texture): Texture {
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;

  return texture;
}

function tintedCanvas(bitmap: ImageBitmap, tint: readonly TintRule[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (context === null) {
    throw new Error("Tinting hero textures needs a 2D canvas");
  }

  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  tintPixels(pixels.data, tint);
  context.putImageData(pixels, 0, 0);

  return canvas;
}

export function browserModelSource(): ModelSource {
  return {
    async bytes(url) {
      return (await fetched(url)).arrayBuffer();
    },

    async texture(id: TextureId, tint: readonly TintRule[]) {
      const bitmap = await createImageBitmap(await (await fetched(TEXTURES[id])).blob(), {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });

      if (tint.length === 0) {
        return prepared(new Texture(bitmap));
      }

      const canvas = tintedCanvas(bitmap, tint);
      bitmap.close();

      return prepared(new CanvasTexture(canvas));
    },
  };
}
