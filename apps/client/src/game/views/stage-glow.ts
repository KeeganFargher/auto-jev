import { HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export interface StageGlow {
  render(): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

const GLOW_STRENGTH = 0.55;

const GLOW_RADIUS = 0.35;

const GLOW_THRESHOLD = 1.05;

const MULTISAMPLES = 4;

export function createStageGlow(renderer: WebGLRenderer, scene: Scene, camera: Camera): StageGlow {
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: MULTISAMPLES });
  const composer = new EffectComposer(renderer, target);
  const scenePass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new Vector2(1, 1), GLOW_STRENGTH, GLOW_RADIUS, GLOW_THRESHOLD);
  const outputPass = new OutputPass();
  composer.addPass(scenePass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  return {
    render() {
      composer.render();
    },

    setSize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    },

    dispose() {
      scenePass.dispose();
      bloomPass.dispose();
      outputPass.dispose();
      composer.dispose();
    },
  };
}
