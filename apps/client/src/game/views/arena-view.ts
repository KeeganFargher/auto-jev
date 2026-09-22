export const WORLD_TO_PIXELS = 6;

export interface ArenaView {
  element: HTMLDivElement;
  dispose(): void;
}

export function createArenaView(
  container: HTMLElement,
  widthUnits: number,
  heightUnits: number,
): ArenaView {
  const element = document.createElement("div");
  element.className = "lab-arena";
  element.style.width = `${widthUnits * WORLD_TO_PIXELS}px`;
  element.style.height = `${heightUnits * WORLD_TO_PIXELS}px`;
  container.appendChild(element);

  return {
    element,
    dispose() {
      element.remove();
    },
  };
}
