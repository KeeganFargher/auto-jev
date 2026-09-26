import {
  ACESFilmicToneMapping,
  BackSide,
  CircleGeometry,
  Color,
  DirectionalLight,
  HalfFloatType,
  HemisphereLight,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  ShadowMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ownCellCenter, type BoardCell } from "@jev-game/game";
import { boardArena, duskblade, hexbinder } from "@jev-game/content";
import { createBoardStage, type ViewportInsets } from "../views/board-stage.js";
import { createHeroFigure, placeholderTraits, type HeroFigure } from "../views/hero-figures.js";
import { createModelFigure } from "../views/model-figure.js";
import { mountEnvironment } from "../environments/environment.js";
import { savedBoardTheme } from "../environments/board-choice.js";
import { models } from "../../models/library.js";
import { createMoira } from "../../models/moira/moira.js";
import { button, el } from "../../hud/dom.js";
import { SCULPT_HASH } from "./lab-routes.js";
import { BENCH_SPELLS, createSpellBench, type SpellBench } from "./spell-bench.js";
import "./sculpt-lab.css";

export interface SculptLabScene {
  show(view: string | null): void;
  dispose(): void;
}

type ViewName = "studio" | "board" | "vesper" | "spells";

type LabAction = "attack" | "cast" | "hit" | "die" | "cheer";

interface View {
  readonly caption: string;
  blink(): void;
  act(action: LabAction): void;
  setTeamColor(color: string | null): void;
  focusEye(): void;
  frameBody(): void;
  setTurning(turning: boolean): void;
  dispose(): void;
}

const TEAM_CYCLE: readonly (string | null)[] = [null, "#4ea1ff", "#ff6b6b"];

const BOARD_TEAM = "#4ea1ff";

const INSETS: ViewportInsets = { left: 24, right: 24, top: 76, bottom: 24 };

const BOARD_NEIGHBOURS: readonly (readonly ["ravager" | "bulwark", number])[] = [
  ["ravager", 2],
  ["bulwark", 4],
];

const MOIRA_CELL: BoardCell = { column: 3, row: 1 };

const CLOSE_PITCH = 0.3;

const CLOSE_LOOK_HEIGHT = 3.5;

const CLOSE_HALF_WIDTH = 7;

const CLOSE_HALF_DEPTH = 5;

const CLOSE_HEIGHT = 8;

const MAX_FRAME_SECONDS = 0.1;

const BACKDROP_TOP = new Color("#2e1d3a");

const BACKDROP_MIDDLE = new Color("#1a1022");

const BACKDROP_BOTTOM = new Color("#0b0710");

function trianglesLabel(triangles: number): string {
  return `${Math.round(triangles / 1000).toLocaleString()}k triangles`;
}

function backdropMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: BACKDROP_TOP },
      middle: { value: BACKDROP_MIDDLE },
      bottom: { value: BACKDROP_BOTTOM },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 middle;
      uniform vec3 bottom;
      varying vec3 vDirection;
      void main() {
        float height = vDirection.y;
        vec3 color = height > 0.0 ? mix(middle, top, smoothstep(0.0, 0.7, height)) : mix(middle, bottom, smoothstep(0.0, 0.5, -height));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

const SCRUB_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    texel: { value: new Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 texel;
    varying vec2 vUv;
    bool broken(vec4 color) {
      return any(isnan(color)) || any(isinf(color));
    }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      if (broken(color)) {
        vec4 sum = vec4(0.0);
        float count = 0.0;
        vec2 offsets[4] = vec2[4](vec2(texel.x, 0.0), vec2(-texel.x, 0.0), vec2(0.0, texel.y), vec2(0.0, -texel.y));
        for (int index = 0; index < 4; index++) {
          vec4 neighbour = texture2D(tDiffuse, vUv + offsets[index]);
          if (!broken(neighbour)) {
            sum += neighbour;
            count += 1.0;
          }
        }
        color = count > 0.0 ? sum / count : vec4(0.0, 0.0, 0.0, 1.0);
      }
      gl_FragColor = min(color, vec4(16.0));
    }
  `,
};

function createStudioView(host: HTMLElement): View {
  const renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  host.append(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 3;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.autoRotateSpeed = 0.8;

  const backdropGeometry = new SphereGeometry(150, 32, 16);
  const backdrop = new Mesh(backdropGeometry, backdropMaterial());
  scene.add(backdrop);

  const floorGeometry = new CircleGeometry(9, 64);
  const floor = new Mesh(floorGeometry, new ShadowMaterial({ color: new Color("#12040c"), opacity: 0.42 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const key = new DirectionalLight(new Color("#fff0e4"), 4.5);
  key.position.set(-6, 11, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 40;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 4;
  key.target.position.set(0, 4.5, 0);

  const rim = new DirectionalLight(new Color("#ff6fd0"), 6);
  rim.position.set(7, 6, -9);
  rim.target.position.set(0, 5, 0);

  const back = new DirectionalLight(new Color("#8fa8ff"), 1);
  back.position.set(-8, 3, -6);
  back.target.position.set(0, 5, 0);

  const fill = new HemisphereLight(new Color("#cbb6ff"), new Color("#2a1422"), 0.15);
  scene.add(key, key.target, rim, rim.target, back, back.target, fill);

  const moira = createMoira("studio");
  scene.add(moira.root);

  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  const scrubPass = new ShaderPass(SCRUB_SHADER);
  const occlusionPass = new GTAOPass(scene, camera, 1, 1);
  occlusionPass.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.5, thickness: 1.2, scale: 1, samples: 16 });
  occlusionPass.blendIntensity = 0.85;
  const bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.42, 0.5, 0.92);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(scrubPass);
  composer.addPass(occlusionPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  let supersample = 1;

  function resize(): void {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    const pixelRatio = Math.min(window.devicePixelRatio * supersample, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    scrubPass.uniforms.texel.value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  function frameBody(): void {
    controls.target.set(0, 5, 0);
    camera.position.set(7.5, 8.2, 17);
    controls.update();
  }

  function focusEye(): void {
    const outward = moira.eyeCenter.clone().sub(moira.ballCenter).normalize();
    controls.target.copy(moira.eyeCenter);
    camera.position
      .copy(moira.eyeCenter)
      .addScaledVector(outward, 5.2)
      .add(new Vector3(-0.8, 0.5, 0));
    controls.update();
  }

  frameBody();
  let animationFrame = 0;
  let lastTime = performance.now();

  function tick(now: number): void {
    animationFrame = requestAnimationFrame(tick);
    const deltaSeconds = Math.min(Math.max((now - lastTime) / 1000, 0), MAX_FRAME_SECONDS);
    lastTime = now;
    moira.update(deltaSeconds);
    controls.update(deltaSeconds);
    composer.render(deltaSeconds);
  }

  animationFrame = requestAnimationFrame(tick);

  if (import.meta.env.DEV) {
    Object.assign(window, {
      jevSculpt: {
        scene,
        camera,
        controls,
        moira,
        bloomPass,
        occlusionPass,
        supersample(factor: number) {
          supersample = factor;
          resize();
        },
      },
    });
  }

  return {
    caption: `Moira · built in code · ${trianglesLabel(moira.triangles)}`,
    focusEye,
    frameBody,

    blink() {
      moira.blink();
    },

    act() {},

    setTeamColor(color) {
      moira.setTeamColor(color);
    },

    setTurning(turning) {
      controls.autoRotate = turning;
    },

    dispose() {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      controls.dispose();
      scene.remove(moira.root);
      moira.dispose();
      backdropGeometry.dispose();
      backdrop.material.dispose();
      floorGeometry.dispose();
      floor.material.dispose();
      key.dispose();
      rim.dispose();
      back.dispose();
      fill.dispose();
      renderPass.dispose();
      scrubPass.dispose();
      occlusionPass.dispose();
      bloomPass.dispose();
      outputPass.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function createBoardView(host: HTMLElement, heroId: string, caption: string): View {
  const stage = createBoardStage(host);
  stage.showBoard(boardArena, "south", INSETS);
  const environment = mountEnvironment(stage, savedBoardTheme(), boardArena);
  const moira = createHeroFigure(heroId);
  moira.setTeamColor(BOARD_TEAM);
  moira.root.position.copy(stage.toScene(ownCellCenter(boardArena, "south", MOIRA_CELL), 0));
  stage.scene.add(moira.root);
  const figures: HeroFigure[] = [];
  let disposed = false;
  let dead = false;
  let cheering = false;
  let close = false;

  for (const [id, column] of BOARD_NEIGHBOURS) {
    models
      .load(id)
      .then((model) => {
        if (disposed) {
          return;
        }

        const figure = createModelFigure(model, placeholderTraits(id));
        figure.setTeamColor(BOARD_TEAM);
        figure.root.position.copy(stage.toScene(ownCellCenter(boardArena, "south", { column, row: 1 }), 0));
        stage.scene.add(figure.root);
        figures.push(figure);
      })
      .catch(() => {});
  }

  const stopFrames = stage.onFrame((deltaSeconds) => {
    moira.update(deltaSeconds);

    for (const figure of figures) {
      figure.update(deltaSeconds);
    }
  });

  if (import.meta.env.DEV) {
    Object.assign(window, { jevSculpt: { scene: stage.scene, hero: moira, stage } });
  }

  return {
    caption,

    blink() {
      moira.trigger("hit");
    },

    act(action) {
      if (action === "die") {
        dead = !dead;
        moira.setDead(dead);
      } else if (action === "cheer") {
        cheering = !cheering;
        moira.setCelebrating(cheering);
      } else {
        moira.trigger(action);
      }
    },

    setTeamColor(color) {
      moira.setTeamColor(color ?? BOARD_TEAM);
    },

    focusEye() {},

    frameBody() {
      close = !close;
      stage.frame(
        close
          ? {
              pitch: CLOSE_PITCH,
              target: moira.root.position.clone().setY(CLOSE_LOOK_HEIGHT),
              halfWidth: CLOSE_HALF_WIDTH,
              halfDepth: CLOSE_HALF_DEPTH,
              height: CLOSE_HEIGHT,
            }
          : null,
      );
    },

    setTurning() {},

    dispose() {
      disposed = true;
      stopFrames();
      moira.dispose();

      for (const figure of figures) {
        figure.dispose();
      }

      environment.dispose();
      stage.dispose();
    },
  };
}

function createSpellsView(bench: SpellBench): View {
  if (import.meta.env.DEV) {
    Object.assign(window, { jevBench: bench });
  }

  return {
    caption: "Moira's spells against four enemies",
    blink() {},
    act() {},
    setTeamColor() {},
    focusEye() {},
    frameBody() {},
    setTurning() {},

    dispose() {
      bench.dispose();
    },
  };
}

function viewName(requested: string | null): ViewName {
  return requested === "board" || requested === "vesper" || requested === "spells" ? requested : "studio";
}

export function createSculptLabScene(initialView: string | null): SculptLabScene {
  const root = el("div", "env-root");
  document.body.append(root);
  const canvasHost = el("div", "env-canvas sculpt-canvas");
  const caption = el("div", "env-caption");
  const hint = el("div", "sculpt-hint", "Drag to orbit · scroll to zoom");
  const back = el("a", "pill-button env-back", "Menu");
  back.href = "#match";

  const studioToggle = button("pill-button env-toggle", () => show("studio"), "Studio");
  const boardToggle = button("pill-button env-toggle", () => show("board"), "Board");
  const vesperToggle = button("pill-button env-toggle", () => show("vesper"), "Vesper");
  const spellsToggle = button("pill-button env-toggle", () => show("spells"), "Spells");
  let bench: SpellBench | null = null;

  const spellToggles = BENCH_SPELLS.map((spell) =>
    button("pill-button env-toggle", () => bench?.fire(spell), spell[0]!.toUpperCase() + spell.slice(1)),
  );

  const eyeToggle = button("pill-button env-toggle", () => view?.focusEye(), "Eye");
  const bodyToggle = button("pill-button env-toggle", () => view?.frameBody(), "Body");
  const turnToggle = button("pill-button env-toggle", () => toggleTurn(), "Turn");
  const blinkToggle = button("pill-button env-toggle", () => view?.blink(), "Blink");
  const teamToggle = button("pill-button env-toggle", () => cycleTeam(), "Team");
  const attackToggle = button("pill-button env-toggle", () => view?.act("attack"), "Attack");
  const castToggle = button("pill-button env-toggle", () => view?.act("cast"), "Cast");
  const hitToggle = button("pill-button env-toggle", () => view?.act("hit"), "Hit");
  const dieToggle = button("pill-button env-toggle", () => view?.act("die"), "Die");
  const cheerToggle = button("pill-button env-toggle", () => view?.act("cheer"), "Cheer");
  const actionToggles = [attackToggle, castToggle, hitToggle, dieToggle, cheerToggle];

  const tools = el(
    "div",
    "env-tools",
    studioToggle,
    boardToggle,
    vesperToggle,
    spellsToggle,
    eyeToggle,
    bodyToggle,
    turnToggle,
    blinkToggle,
    teamToggle,
    ...actionToggles,
    ...spellToggles,
  );

  root.replaceChildren(canvasHost, back, tools, caption, hint);

  let view: View | null = null;
  let current: ViewName | null = null;
  let turning = false;
  let team = 0;

  function render(): void {
    studioToggle.classList.toggle("is-active", current === "studio");
    boardToggle.classList.toggle("is-active", current === "board");
    vesperToggle.classList.toggle("is-active", current === "vesper");
    spellsToggle.classList.toggle("is-active", current === "spells");
    turnToggle.classList.toggle("is-active", turning);
    teamToggle.classList.toggle("is-active", team !== 0);
    eyeToggle.hidden = current !== "studio";
    bodyToggle.hidden = current === "spells";
    turnToggle.hidden = current !== "studio";
    blinkToggle.hidden = current !== "studio";

    for (const toggle of actionToggles) {
      toggle.hidden = current !== "board" && current !== "vesper";
    }

    for (const toggle of spellToggles) {
      toggle.hidden = current !== "spells";
    }

    hint.hidden = current !== "studio";
    caption.textContent = view?.caption ?? "";
  }

  function show(next: string | null): void {
    const name = viewName(next);

    if (name !== current) {
      view?.dispose();
      canvasHost.replaceChildren();
      current = name;
      bench = name === "spells" ? createSpellBench(canvasHost) : null;
      view =
        bench !== null
          ? createSpellsView(bench)
          : name === "studio"
            ? createStudioView(canvasHost)
            : name === "vesper"
              ? createBoardView(canvasHost, duskblade.id, "Vesper on the board · beside Gorrak and Anvil")
              : createBoardView(canvasHost, hexbinder.id, "Moira on the board · beside Gorrak and Anvil");
      view.setTurning(turning);
      view.setTeamColor(TEAM_CYCLE[team] ?? null);
      history.replaceState(null, "", name === "studio" ? SCULPT_HASH : `${SCULPT_HASH}/${name}`);
    }

    render();
  }

  function toggleTurn(): void {
    turning = !turning;
    view?.setTurning(turning);
    render();
  }

  function cycleTeam(): void {
    team = (team + 1) % TEAM_CYCLE.length;
    view?.setTeamColor(TEAM_CYCLE[team] ?? null);
    render();
  }

  show(initialView);

  return {
    show,

    dispose() {
      view?.dispose();
      view = null;
      root.remove();
    },
  };
}
