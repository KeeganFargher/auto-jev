import { el } from "./dom.js";

type Child = Node | string | null;

export type TipSide = "left" | "right" | "top" | "bottom";

export interface TipSource {
  key: string;
  side: TipSide;
  live: boolean;
  render(): HTMLElement;
}

export interface TipCard {
  icon: Node | null;
  accent: string | null;
  title: string;
  subtitle: Node | string | null;
  tag: string | null;
  sections: readonly HTMLElement[];
}

type Trigger = "pointer" | "focus" | "touch";

interface Spot {
  x: number;
  y: number;
}

const TIP_ID = "hud-tip";

const SHOW_DELAY_MS = 160;

const WARM_MS = 450;

const LONG_PRESS_MS = 450;

const LIVE_REFRESH_MS = 250;

const HIT_TEST_MS = 100;

const GAP = 10;

const MARGIN = 8;

const SIDE_ORDER: Readonly<Record<TipSide, readonly TipSide[]>> = {
  left: ["left", "right", "bottom", "top"],
  right: ["right", "left", "bottom", "top"],
  top: ["top", "bottom", "left", "right"],
  bottom: ["bottom", "top", "left", "right"],
};

const KEYWORD_CONDITIONS = new Map<string, string>([
  ["Staggered", "staggered"],
  ["Staggers", "staggered"],
  ["Stagger", "staggered"],
  ["Brittle", "brittle"],
  ["Disoriented", "disoriented"],
  ["Disorients", "disoriented"],
  ["Disorient", "disoriented"],
  ["Overload", "staggered"],
  ["Shatter", "brittle"],
  ["Crush", "disoriented"],
]);

const KEYWORD_SCHOOLS = new Map<string, string>([
  ["Might", "might"],
  ["Arcana", "arcana"],
  ["Cunning", "cunning"],
]);

const TOKEN_PATTERN =
  /([+\-−×]?\d+(?:\.\d+)?(?:%|×| s\b| cells?\b| HP\b| mana\b)?|\b(?:Staggered|Staggers|Stagger|Brittle|Disoriented|Disorients|Disorient|Overload|Shatter|Crush|Might|Arcana|Cunning)\b)/g;

const sources = new WeakMap<Element, TipSource>();

let layer: HTMLElement | null = null;

let anchor: HTMLElement | null = null;

let shown: TipSource | null = null;

let trigger: Trigger = "pointer";

let hovered: HTMLElement | null = null;

let pendingTimer = 0;

let pressTimer = 0;

let watchFrame = 0;

let hiddenAt = Number.NEGATIVE_INFINITY;

let refreshedAt = 0;

let hitTestedAt = 0;

let placedFor = "";

let pointerX = -1;

let pointerY = -1;

let installed = false;

let suppressed: HTMLElement | null = null;

function tipLayer(): HTMLElement {
  if (layer === null) {
    layer = el("div", "hud-tip");
    layer.id = TIP_ID;
    layer.setAttribute("role", "tooltip");
    layer.hidden = true;
    document.body.append(layer);
  }

  return layer;
}

function tipTarget(node: EventTarget | Element | null): HTMLElement | null {
  if (!(node instanceof Element)) {
    return null;
  }

  const found = node.closest("[data-tip]");

  return found instanceof HTMLElement && sources.has(found) ? found : null;
}

function clearPending(): void {
  window.clearTimeout(pendingTimer);
  pendingTimer = 0;
}

function edgeRect(target: HTMLElement): DOMRect {
  const edge = target.closest("[data-tip-edge]");

  return edge instanceof HTMLElement ? edge.getBoundingClientRect() : target.getBoundingClientRect();
}

function spotFor(side: TipSide, rect: DOMRect, edge: DOMRect, width: number, height: number): Spot {
  switch (side) {
    case "left":
      return { x: edge.left - GAP - width, y: rect.top };

    case "right":
      return { x: edge.right + GAP, y: rect.top };

    case "top":
      return { x: rect.left + rect.width / 2 - width / 2, y: rect.top - GAP - height };

    case "bottom":
      return { x: rect.left + rect.width / 2 - width / 2, y: rect.bottom + GAP };

    default: {
      const exhaustive: never = side;

      return exhaustive;
    }
  }
}

function clampInto(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

function fits(side: TipSide, spot: Spot, width: number, height: number, viewportWidth: number, viewportHeight: number): boolean {
  if (side === "left" || side === "right") {
    return spot.x >= MARGIN && spot.x + width <= viewportWidth - MARGIN;
  }

  return spot.y >= MARGIN && spot.y + height <= viewportHeight - MARGIN;
}

function place(force: boolean): void {
  if (layer === null || anchor === null || shown === null) {
    return;
  }

  const rect = anchor.getBoundingClientRect();
  const edge = edgeRect(anchor);
  const width = layer.offsetWidth;
  const height = layer.offsetHeight;
  const signature = `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)},${width},${height}`;

  if (!force && signature === placedFor) {
    return;
  }

  placedFor = signature;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const order = SIDE_ORDER[shown.side];
  let chosen: TipSide = order[0] ?? shown.side;
  let spot = spotFor(chosen, rect, edge, width, height);

  for (const side of order) {
    const candidate = spotFor(side, rect, edge, width, height);

    if (fits(side, candidate, width, height, viewportWidth, viewportHeight)) {
      chosen = side;
      spot = candidate;
      break;
    }
  }

  const x = clampInto(spot.x, MARGIN, viewportWidth - MARGIN - width);
  const y = clampInto(spot.y, MARGIN, viewportHeight - MARGIN - height);
  layer.style.left = `${Math.round(x)}px`;
  layer.style.top = `${Math.round(y)}px`;
  layer.dataset.side = chosen;
}

function fill(source: TipSource): void {
  tipLayer().replaceChildren(source.render());
  refreshedAt = performance.now();
}

function hide(): void {
  clearPending();

  if (anchor !== null || shown !== null) {
    hiddenAt = performance.now();
  }

  anchor?.removeAttribute("aria-describedby");
  anchor = null;
  shown = null;
  hovered = null;
  placedFor = "";
  cancelAnimationFrame(watchFrame);
  watchFrame = 0;

  if (layer !== null) {
    layer.hidden = true;
    layer.classList.remove("is-entering");
    layer.replaceChildren();
  }
}

function underPointer(): HTMLElement | null {
  return pointerX < 0 ? null : tipTarget(document.elementFromPoint(pointerX, pointerY));
}

function relocate(key: string): HTMLElement | null {
  if (trigger === "pointer") {
    return underPointer();
  }

  if (trigger === "focus") {
    const focused = document.activeElement;

    return focused instanceof HTMLElement && sources.has(focused) && focused.dataset.tip === key ? focused : null;
  }

  for (const candidate of document.querySelectorAll(`[data-tip="${CSS.escape(key)}"]`)) {
    if (candidate instanceof HTMLElement && sources.has(candidate) && candidate.getClientRects().length > 0) {
      return candidate;
    }
  }

  return null;
}

function watch(now: number): void {
  watchFrame = 0;

  if (anchor === null || shown === null) {
    return;
  }

  if (!anchor.isConnected) {
    const replacement = relocate(shown.key);
    const source = replacement === null ? undefined : sources.get(replacement);

    if (replacement === null || source === undefined) {
      hide();

      return;
    }

    anchor = replacement;
    hovered = trigger === "pointer" ? replacement : hovered;
    shown = source;
    replacement.setAttribute("aria-describedby", TIP_ID);
    fill(source);
    place(true);
  } else if (anchor.getClientRects().length === 0) {
    hide();

    return;
  } else if (trigger === "pointer" && now - hitTestedAt >= HIT_TEST_MS) {
    hitTestedAt = now;
    const under = underPointer();

    if (under !== anchor) {
      hoverChanged(under);
    }
  }

  if (shown === null) {
    return;
  }

  if (shown.live && now - refreshedAt >= LIVE_REFRESH_MS) {
    fill(shown);
  }

  place(false);

  if (watchFrame === 0) {
    watchFrame = requestAnimationFrame(watch);
  }
}

function show(target: HTMLElement, how: Trigger): void {
  clearPending();
  const source = sources.get(target);

  if (source === undefined) {
    hide();

    return;
  }

  const warm = anchor !== null || performance.now() - hiddenAt < WARM_MS;
  const tip = tipLayer();
  anchor?.removeAttribute("aria-describedby");
  anchor = target;
  shown = source;
  trigger = how;
  target.setAttribute("aria-describedby", TIP_ID);
  fill(source);
  tip.hidden = false;
  tip.classList.remove("is-entering");
  place(true);

  if (!warm) {
    tip.getBoundingClientRect();
    tip.classList.add("is-entering");
  }

  if (watchFrame === 0) {
    watchFrame = requestAnimationFrame(watch);
  }
}

function hoverChanged(target: HTMLElement | null): void {
  hovered = target;
  clearPending();

  if (target === null) {
    if (trigger !== "focus") {
      hide();
    }

    return;
  }

  if (target === anchor) {
    return;
  }

  if (anchor !== null || performance.now() - hiddenAt < WARM_MS) {
    show(target, "pointer");

    return;
  }

  pendingTimer = window.setTimeout(() => {
    pendingTimer = 0;

    if (hovered === target && target.isConnected) {
      show(target, "pointer");
    }
  }, SHOW_DELAY_MS);
}

function onPointer(event: PointerEvent): void {
  pointerX = event.clientX;
  pointerY = event.clientY;

  if (event.pointerType === "touch") {
    return;
  }

  const target = tipTarget(event.target) ?? (event.type === "pointerover" ? underPointer() : null);

  if (target === hovered) {
    return;
  }

  if (target !== null && target === suppressed) {
    hovered = target;

    return;
  }

  suppressed = null;
  hoverChanged(target);
}

function onPointerOut(event: PointerEvent): void {
  if (event.relatedTarget === null && event.pointerType !== "touch") {
    hoverChanged(null);
  }
}

function onPointerDown(event: PointerEvent): void {
  window.clearTimeout(pressTimer);

  if (event.pointerType !== "touch") {
    return;
  }

  if (trigger === "touch") {
    hide();
  }

  const target = tipTarget(event.target);

  if (target === null) {
    return;
  }

  pressTimer = window.setTimeout(() => {
    if (target.isConnected) {
      show(target, "touch");
    }
  }, LONG_PRESS_MS);
}

function onPointerEnd(): void {
  window.clearTimeout(pressTimer);
}

function onFocusIn(event: FocusEvent): void {
  const target = tipTarget(event.target);

  if (target !== null && target === event.target && target.matches(":focus-visible")) {
    show(target, "focus");
  }
}

function onFocusOut(event: FocusEvent): void {
  if (trigger === "focus" && event.target === anchor) {
    hide();
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape" && anchor !== null) {
    const dismissed = anchor;
    hide();
    suppressed = dismissed;
    hovered = dismissed;
  }
}

function install(): void {
  if (installed) {
    return;
  }

  installed = true;
  document.addEventListener("pointerover", onPointer, { passive: true });
  document.addEventListener("pointermove", onPointer, { passive: true });
  document.addEventListener("pointerout", onPointerOut, { passive: true });
  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("pointerup", onPointerEnd, { passive: true });
  document.addEventListener("pointercancel", onPointerEnd, { passive: true });
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("blur", hide);
  window.addEventListener("resize", hide);
}

export function attachTip(target: HTMLElement, source: TipSource): void {
  install();
  sources.set(target, source);
  target.dataset.tip = source.key;
  target.removeAttribute("title");

  if (target === anchor) {
    shown = source;
    fill(source);
    place(true);
  }
}

export function hideTip(): void {
  hide();
}

export function richText(text: string): Child[] {
  const parts: Child[] = [];
  let cursor = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const token = match[0];
    const start = match.index ?? 0;

    if (start > cursor) {
      parts.push(text.slice(cursor, start));
    }

    const condition = KEYWORD_CONDITIONS.get(token);
    const school = KEYWORD_SCHOOLS.get(token);

    if (condition !== undefined) {
      const keyword = el("span", "tip-key", token);
      keyword.dataset.condition = condition;
      parts.push(keyword);
    } else if (school !== undefined) {
      const keyword = el("span", "tip-key", token);
      keyword.dataset.school = school;
      parts.push(keyword);
    } else {
      parts.push(el("b", "tip-num", token));
    }

    cursor = start + token.length;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

export function tipCard(card: TipCard): HTMLElement {
  const heading = el(
    "div",
    "tip-heading",
    el("div", "tip-title", card.title),
    card.subtitle === null ? null : el("div", "tip-subtitle", card.subtitle),
  );

  const head = el(
    "div",
    "tip-head",
    card.icon === null ? null : el("span", "tip-icon", card.icon),
    heading,
    card.tag === null ? null : el("span", "tip-tag", card.tag),
  );

  const root = el("div", "tip-card", head, ...card.sections);

  if (card.accent !== null) {
    root.style.setProperty("--tip-accent", card.accent);
  }

  return root;
}

export function tipSection(label: string | null, ...children: Child[]): HTMLElement {
  return el("div", "tip-section", label === null ? null : el("div", "tip-label", label), ...children);
}

export function tipText(text: string): HTMLElement {
  return el("p", "tip-text", ...richText(text));
}

export function tipHint(text: string): HTMLElement {
  return el("p", "tip-hint", text);
}
