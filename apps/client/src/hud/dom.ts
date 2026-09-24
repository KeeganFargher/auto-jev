type Child = Node | string | null;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (className !== "") {
    node.className = className;
  }

  for (const child of children) {
    if (child !== null) {
      node.append(child);
    }
  }

  return node;
}

export function button(className: string, onClick: () => void, ...children: Child[]): HTMLButtonElement {
  const node = el("button", className, ...children);
  node.type = "button";
  node.addEventListener("click", onClick);

  return node;
}
