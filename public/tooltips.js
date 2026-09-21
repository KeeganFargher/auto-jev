/** Creates a shared, viewport-clamped tooltip for pointer and keyboard inspection. */
export function createTooltip() {
  const element = document.createElement("div");
  element.className = "game-tooltip hud-surface";
  element.id = "game-tooltip";
  element.setAttribute("role", "tooltip");
  element.hidden = true;
  const heading = document.createElement("strong");
  const detail = document.createElement("p");
  element.append(heading, detail);
  document.body.append(element);
  let anchor = null;
  const observer = new MutationObserver(() => {
    if (anchor === null) return;
    const bounds = anchor.getBoundingClientRect();
    show(anchor.dataset.tooltip, anchor.dataset.tooltipDetail, bounds.left, bounds.bottom);
  });
  const hide = () => {
    observer.disconnect();
    element.hidden = true;
    if (anchor !== null) anchor.removeAttribute("aria-describedby");
    anchor = null;
  };
  const show = (title, description, x, y) => {
    // Preserve unchanged text nodes to avoid layout work while tracking the pointer.
    if (heading.textContent !== title) heading.textContent = title;
    if (detail.textContent !== description) detail.textContent = description;
    element.hidden = false;
    element.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - element.offsetWidth - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y + 16, innerHeight - element.offsetHeight - 8))}px`;
  };
  const inspect = (event) => {
    const target = event.target.closest("[data-tooltip]");
    if (target === null) { if (anchor !== null) hide(); return; }
    if (anchor !== target) hide();
    anchor = target;
    observer.observe(target, { attributes: true, attributeFilter: ["data-tooltip", "data-tooltip-detail"] });
    target.setAttribute("aria-describedby", element.id);
    const bounds = target.getBoundingClientRect();
    show(target.dataset.tooltip, target.dataset.tooltipDetail, bounds.left, bounds.bottom);
  };
  document.addEventListener("pointerover", inspect);
  document.addEventListener("focusin", inspect);
  document.addEventListener("pointerout", (event) => {
    if (anchor !== null && !anchor.contains(event.relatedTarget)) hide();
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
  window.addEventListener("blur", hide);
  window.addEventListener("resize", hide);
  return { show, hide };
}
