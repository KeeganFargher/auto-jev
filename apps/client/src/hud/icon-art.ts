import { levelIcon, pieceIcon, roleIcon } from "./icons.js";

const ICON_ART_KINDS = {
  items: { pixels: 192, className: "icon-art" },
  gems: { pixels: 192, className: "icon-art" },
  levels: { pixels: 192, className: "icon-art" },
  heroes: { pixels: 320, className: "hero-art" },
  faces: { pixels: 128, className: "face-art" },
} as const;

type IconArtKind = keyof typeof ICON_ART_KINDS;

const ICON_FOLDER = "../assets/icons/";

const ICON_EXTENSION = ".webp";

const ICON_ART_URLS = new Map(
  Object.entries(
    import.meta.glob<string>("../assets/icons/*/*.webp", { eager: true, query: "?no-inline", import: "default" }),
  ).map(([path, url]) => [path.slice(ICON_FOLDER.length, -ICON_EXTENSION.length), url]),
);

function iconArt(kind: IconArtKind, id: string): HTMLImageElement | null {
  const url = ICON_ART_URLS.get(`${kind}/${id}`);

  if (url === undefined) {
    return null;
  }

  const { pixels, className } = ICON_ART_KINDS[kind];
  const image = document.createElement("img");
  image.className = className;
  image.src = url;
  image.alt = "";
  image.width = pixels;
  image.height = pixels;
  image.decoding = "async";
  image.draggable = false;

  return image;
}

export function pieceArt(pieceId: string, kind: "item" | "gem"): HTMLImageElement | SVGSVGElement {
  return iconArt(kind === "item" ? "items" : "gems", pieceId) ?? pieceIcon(pieceId, kind);
}

export function pieceSocketArt(pieceId: string, kind: "item" | "gem"): HTMLImageElement | SVGSVGElement {
  return kind === "gem" ? pieceIcon(pieceId, kind) : pieceArt(pieceId, kind);
}

export function levelArt(pickId: string): HTMLImageElement | SVGSVGElement {
  return iconArt("levels", pickId) ?? levelIcon();
}

export function heroArt(heroId: string): HTMLImageElement | SVGSVGElement {
  return iconArt("heroes", heroId) ?? roleIcon(heroId);
}

export function heroFaceArt(heroId: string): HTMLImageElement | SVGSVGElement {
  return iconArt("faces", heroId) ?? roleIcon(heroId);
}
