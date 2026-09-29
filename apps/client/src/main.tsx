import "@fontsource/lilita-one/400.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./style.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app.js";
import { createNavigationStore } from "./app/navigation.js";
import { audio } from "./audio/engine.js";
import { graphicsSettings } from "./graphics/settings.js";
import { browserModelSource } from "./game/models/browser-source.js";
import { installModelLibrary, loadModelLibrary } from "./game/models/library.js";

const container = document.getElementById("root");

if (container === null) {
  throw new Error('index.html needs a <div id="root"> to mount the app into');
}

void audio.preload("boot");

if (import.meta.env.DEV) {
  Object.assign(window, { jevAudio: audio });
}

const heroModels = loadModelLibrary(browserModelSource()).then(installModelLibrary);

createRoot(container).render(
  <StrictMode>
    <App
      services={{ audio, graphics: graphicsSettings, navigation: createNavigationStore(window) }}
      heroModels={heroModels}
    />
  </StrictMode>,
);
